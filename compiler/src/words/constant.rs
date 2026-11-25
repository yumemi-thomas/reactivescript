//! A module's object that nothing writes (DESIGN.md, *A module's value*): a literal which no export hands out and whose
//! every reference is a read that does not let it go. What a reference may be is listed; anything else, and it is none.
use super::graph::Module;
use oxc_ast::{ast::*, AstKind};
use oxc_semantic::NodeId;
use oxc_span::GetSpan;
use oxc_syntax::symbol::SymbolId;
use std::collections::BTreeMap;

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Kind { Plain, Array, Map, Set, RegExp { stateful: bool, sticky: bool } }
/// What an object literal holds: the objects among its values, by the name they are under (`nested`: some value is one).
#[derive(Clone, Debug)]
pub struct Shape { pub kind: Kind, pub nested: BTreeMap<String, Shape>, pub holds_object: bool, pub frozen: bool }

pub fn unwrap<'b, 'a>(e: &'b Expression<'a>) -> &'b Expression<'a> {
    match e {
        Expression::ParenthesizedExpression(p) => unwrap(&p.expression),
        Expression::TSAsExpression(p) => unwrap(&p.expression),
        Expression::TSSatisfiesExpression(p) => unwrap(&p.expression),
        Expression::TSNonNullExpression(p) => unwrap(&p.expression),
        Expression::TSTypeAssertion(p) => unwrap(&p.expression),
        e => e,
    }
}
pub fn static_key<'b>(k: &'b PropertyKey<'_>, computed: bool) -> Option<String> {
    match k {
        PropertyKey::StaticIdentifier(i) if !computed => Some(i.name.to_string()),
        PropertyKey::StringLiteral(s) => Some(s.value.to_string()),
        PropertyKey::NumericLiteral(n) if n.value.fract() == 0.0 && n.value >= 0.0 && n.value < 1e15 => Some((n.value as u64).to_string()),
        _ => None,
    }
}
/// Names that reach a built-in prototype, or the object's own: a read or a write of one is nothing that is followed.
pub fn reserved(n: &str) -> bool { matches!(n, "__proto__" | "constructor" | "prototype" | "__defineGetter__" | "__defineSetter__" | "__lookupGetter__" | "__lookupSetter__") }

/// Whether a function's own code (and its arrows') has `this`, `super`, `arguments` or `new.target`.
pub fn has_this(m: &Module, f: NodeId) -> bool {
    let span = m.nodes.kind(f).span();
    m.nodes.iter().any(|n| {
        let hit = match n.kind() {
            AstKind::ThisExpression(_) | AstKind::Super(_) | AstKind::NewTarget(_) => true,
            AstKind::IdentifierReference(i) => i.name == "arguments" && m.symbol(i).is_none(),
            _ => false,
        };
        hit && span.contains_inclusive(n.kind().span()) && m.nodes.ancestor_ids(n.id()).find(|a| matches!(m.nodes.kind(*a), AstKind::Function(_)) || *a == f).is_some_and(|a| a == f)
    })
}

/// The shape of a literal, where each value is a primitive written out, a function with no `this`, a name, or a literal.
pub fn shape(m: &Module, e: &Expression) -> Option<Shape> {
    let value = |v: &Expression, name: &str, s: &mut Shape| -> Option<()> {
        match unwrap(v) {
            Expression::ObjectExpression(_) | Expression::ArrayExpression(_) | Expression::RegExpLiteral(_) | Expression::NewExpression(_) => {
                let n = shape(m, v)?;
                s.holds_object = true;
                s.nested.insert(name.to_string(), n);
            }
            // (a method's `this` is the object: a read or a write of it that no reference shows)
            Expression::FunctionExpression(f) => if f.scope_id.get().is_some_and(|id| has_this(m, m.scoping.get_node_id(id))) { return None; },
            _ => {}
        }
        Some(())
    };
    let mut s = Shape { kind: Kind::Plain, nested: BTreeMap::new(), holds_object: false, frozen: false };
    match unwrap(e) {
        Expression::ObjectExpression(o) => {
            for p in &o.properties {
                let ObjectPropertyKind::ObjectProperty(p) = p else { return None };
                if p.kind != PropertyKind::Init { return None; }
                let k = static_key(&p.key, p.computed)?;
                if reserved(&k) || s.nested.contains_key(&k) { return None; }
                value(&p.value, &k, &mut s)?;
            }
        }
        Expression::ArrayExpression(a) => {
            s.kind = Kind::Array;
            for (i, x) in a.elements.iter().enumerate() { value(x.as_expression()?, &i.to_string(), &mut s)?; }
        }
        Expression::RegExpLiteral(r) => { let f = r.regex.flags; s.kind = Kind::RegExp { stateful: f.contains(RegExpFlags::G) || f.contains(RegExpFlags::Y), sticky: f.contains(RegExpFlags::Y) }; }
        Expression::NewExpression(n) => {
            let Expression::Identifier(c) = &n.callee else { return None };
            s.kind = if m.is_global(c, "Map") { Kind::Map } else if m.is_global(c, "Set") { Kind::Set } else { return None };
            match n.arguments.len() {
                0 => {}
                1 => {
                    let Expression::ArrayExpression(a) = unwrap(n.arguments[0].as_expression()?) else { return None };
                    for x in &a.elements {
                        let x = x.as_expression()?;
                        if s.kind == Kind::Map {
                            let Expression::ArrayExpression(pair) = unwrap(x) else { return None };
                            if pair.elements.len() != 2 { return None; }
                            for y in &pair.elements { value(y.as_expression()?, "pair", &mut s)?; }
                        } else { value(x, "item", &mut s)?; }
                    }
                }
                _ => return None,
            }
        }
        _ => return None,
    }
    Some(s)
}

const ARRAY_READS: &[&str] = &["includes", "indexOf", "lastIndexOf", "join", "at", "slice", "concat", "toReversed", "with", "keys"];
const ARRAY_CALLS: &[&str] = &["map", "filter", "some", "every", "find", "findIndex", "findLast", "findLastIndex", "forEach", "flatMap"];
pub const REGEXP_IN_STRING: &[&str] = &["replace", "replaceAll", "match", "matchAll", "search", "split"];

/// Whether the node (a reference to the object, or a member that is an object of it) is a read that does not let it go.
fn read_only(m: &Module, id: NodeId, s: &Shape) -> bool {
    let at = m.outer(id);
    if m.is_written(at) { return false; }
    let span = m.nodes.kind(at).span();
    let pid = m.nodes.parent_id(at);
    let is_callee = |mid: NodeId| { let o = m.outer(mid); let o = if matches!(m.nodes.parent_kind(o), AstKind::ChainExpression(_)) { m.nodes.parent_id(o) } else { o }; matches!(m.nodes.parent_kind(o), AstKind::CallExpression(c) if c.callee.span() == m.nodes.kind(o).span()) };
    match m.nodes.kind(pid) {
        AstKind::StaticMemberExpression(p) if p.object.span() == span => {
            let n = p.property.name.as_str();
            if reserved(n) || m.is_written(pid) { return false; }
            if is_callee(pid) {
                return match s.kind {
                    Kind::Plain => !s.nested.contains_key(n) && !matches!(n, "toString" | "valueOf" | "hasOwnProperty" | "toLocaleString" | "isPrototypeOf" | "propertyIsEnumerable"),
                    Kind::Array => !s.holds_object && (ARRAY_READS.contains(&n) || (ARRAY_CALLS.contains(&n) && small_callback(m, pid))),
                    Kind::Map | Kind::Set => n == "has" || (!s.holds_object && (n == "get" || (n == "forEach" && small_callback(m, pid)) || matches!(n, "keys" | "values" | "entries"))),
                    Kind::RegExp { stateful, .. } => !stateful && matches!(n, "test" | "exec"),
                };
            }
            match s.kind {
                Kind::Plain => match s.nested.get(n) { Some(x) => read_only(m, pid, x), None => true },
                Kind::Array => n == "length",
                Kind::Map | Kind::Set => n == "size",
                Kind::RegExp { .. } => matches!(n, "source" | "flags"),
            }
        }
        AstKind::ComputedMemberExpression(p) if p.object.span() == span => matches!(s.kind, Kind::Plain | Kind::Array) && !m.is_written(pid) && !is_callee(pid) && s.nested.values().all(|x| read_only(m, pid, x)),
        AstKind::SpreadElement(_) => !s.holds_object && !matches!(s.kind, Kind::RegExp { .. }),
        AstKind::ForOfStatement(f) if f.right.span() == span => !s.holds_object && matches!(s.kind, Kind::Array | Kind::Set | Kind::Map),
        AstKind::ForInStatement(f) if f.right.span() == span => true,
        AstKind::BinaryExpression(b) => match b.operator { BinaryOperator::StrictEquality | BinaryOperator::StrictInequality => true, BinaryOperator::In => b.right.span() == span, _ => false },
        AstKind::UnaryExpression(u) => matches!(u.operator, UnaryOperator::Typeof | UnaryOperator::LogicalNot),
        AstKind::VariableDeclarator(d) => !s.holds_object && d.init.as_ref().is_some_and(|i| i.span() == span) && matches!((&d.id, s.kind), (BindingPattern::ObjectPattern(_), Kind::Plain) | (BindingPattern::ArrayPattern(_), Kind::Array)),
        AstKind::CallExpression(c) if c.callee.span() != span => {
            let Some(i) = c.arguments.iter().position(|a| a.span() == span) else { return false };
            let Expression::StaticMemberExpression(k) = unwrap(&c.callee) else { return false };
            let n = k.property.name.as_str();
            if let Expression::Identifier(o) = &k.object {
                if i == 0 && m.is_global(o, "Object") { return match n { "keys" | "hasOwn" => true, "values" | "entries" => !s.holds_object, _ => false }; }
                if i == 0 && m.is_global(o, "Array") { return match n { "isArray" => true, "from" => !s.holds_object && c.arguments.len() == 1, _ => false }; }
            }
            matches!(s.kind, Kind::RegExp { sticky: false, .. }) && i == 0 && REGEXP_IN_STRING.contains(&n)
        }
        AstKind::NewExpression(c) if c.callee.span() != span => !s.holds_object && c.arguments.len() == 1 && matches!(&c.callee, Expression::Identifier(i) if m.is_global(i, "Set") || m.is_global(i, "Map")),
        _ => false,
    }
}
/// A callback written in place that takes no more than an item and its index: the list itself is a third argument.
fn small_callback(m: &Module, member: NodeId) -> bool {
    let AstKind::CallExpression(c) = m.nodes.parent_kind(m.outer(member)) else { return false };
    if c.arguments.len() != 1 { return false; }
    match c.arguments[0].as_expression().map(unwrap) {
        Some(Expression::ArrowFunctionExpression(f)) => f.params.items.len() <= 2 && f.params.rest.is_none(),
        _ => false,
    }
}

/// `Object.freeze({ … })` of primitives and functions: nobody can change it, wherever it goes.
pub fn frozen<'b, 'a>(m: &Module, e: &'b Expression<'a>) -> Option<&'b Expression<'a>> {
    let Expression::CallExpression(c) = unwrap(e) else { return None };
    let Expression::StaticMemberExpression(k) = &c.callee else { return None };
    let Expression::Identifier(o) = &k.object else { return None };
    (m.is_global(o, "Object") && k.property.name == "freeze" && c.arguments.len() == 1).then(|| c.arguments[0].as_expression()).flatten()
}

/// The shape of a name's constant object, where it is one.
pub fn constant(m: &Module, sym: SymbolId, init: &Expression) -> Option<Shape> {
    if let Some(x) = frozen(m, init) {
        let mut s = shape(m, x)?;
        if s.holds_object || !matches!(s.kind, Kind::Plain | Kind::Array) { return None; }
        s.frozen = true;
        return Some(s);
    }
    let s = shape(m, init)?;
    if m.handed_out.contains(&sym) || !m.known_symbol(sym) { return None; }
    m.references(sym).into_iter().all(|r| read_only(m, r, &s)).then_some(s)
}
