//! What a file of the graph does with the built-ins as objects (DESIGN.md, *Files*): one that changes a built-in, or may, leaves
//! no word anywhere, since every word is read with the language's own. A write is one of a built-in where its receiver is
//! (`Array.prototype.x = …`), or where it may be: the receiver is not the code's own, the name is a built-in's or computed, and
//! somewhere in the graph a built-in goes where it is not followed (`const p = Array.prototype`, `f(Object)`, `x.__proto__`).
use super::constant::{static_key, unwrap};
use super::graph::{Module, Origin};
use oxc_ast::{ast::*, AstKind};
use oxc_semantic::NodeId;
use oxc_span::GetSpan;
use std::collections::BTreeSet;

#[derive(Default, Clone, Debug)]
pub struct Patch {
    /// It changes one; where.
    pub done: Option<&'static str>,
    pub at: u32,
    /// Where a built-in, or the global object (`true`), stands where more than its use is there.
    pub stands: Vec<(NodeId, bool)>,
    /// What is written of the global object under a name that is another module's.
    pub keyed: Vec<NodeId>,
    /// A prototype or a constructor is taken off something by a pattern.
    pub taken: bool,
    /// A write that would be one of a built-in, were its receiver one: where, and whether of the global object alone.
    pub may_write: Option<u32>,
    pub may_write_global: Option<u32>,
}

pub const BUILTINS: &[&str] = &["Array", "Object", "Function", "String", "Number", "Boolean", "BigInt", "Symbol", "Math", "JSON", "Reflect", "Proxy", "Promise", "Map", "Set", "WeakMap", "WeakSet", "WeakRef", "Error", "TypeError", "RangeError", "SyntaxError", "ReferenceError", "EvalError", "URIError", "AggregateError", "RegExp", "Date", "Iterator", "Intl", "ArrayBuffer", "DataView", "Int8Array", "Uint8Array", "Uint8ClampedArray", "Int16Array", "Uint16Array", "Int32Array", "Uint32Array", "Float32Array", "Float64Array", "BigInt64Array", "BigUint64Array", "FinalizationRegistry", "Atomics", "SharedArrayBuffer", "EventTarget", "Node", "Element", "HTMLElement", "Window", "Document", "Event"];
pub const HOLDERS: &[&str] = &["globalThis", "window", "self", "global", "frames", "top", "parent"];
/// Functions of the global object a word is read with.
const GLOBAL_FNS: &[&str] = &["setTimeout", "setInterval", "clearTimeout", "clearInterval", "queueMicrotask", "requestAnimationFrame", "requestIdleCallback", "addEventListener", "isNaN", "isFinite", "parseInt", "parseFloat", "encodeURI", "encodeURIComponent", "decodeURI", "decodeURIComponent", "undefined", "NaN", "Infinity", "ResizeObserver", "IntersectionObserver", "MutationObserver", "PerformanceObserver", "ReportingObserver", "matchMedia"];
/// The names of the members of the language's built-ins a word's reading uses, and those that decide what an operator does.
const MEMBERS: &[&str] = &["charAt", "charCodeAt", "codePointAt", "at", "endsWith", "startsWith", "includes", "indexOf", "lastIndexOf", "normalize", "padEnd", "padStart", "repeat", "slice", "substring", "substr", "toLowerCase", "toUpperCase", "trim", "trimStart", "trimEnd", "toString", "valueOf", "toFixed", "toPrecision", "toExponential", "concat", "search", "replace", "replaceAll", "match", "matchAll", "split", "push", "pop", "shift", "unshift", "splice", "sort", "reverse", "fill", "copyWithin", "map", "filter", "find", "findLast", "findIndex", "findLastIndex", "some", "every", "forEach", "flatMap", "reduce", "reduceRight", "toSpliced", "with", "flat", "toReversed", "toSorted", "join", "keys", "values", "entries", "has", "get", "set", "add", "delete", "clear", "then", "catch", "finally", "test", "exec", "random", "abs", "floor", "ceil", "round", "max", "min", "pow", "sqrt", "trunc", "sign", "hypot", "stringify", "parse", "isArray", "of", "from", "fromEntries", "assign", "create", "freeze", "hasOwn", "is", "isNaN", "isFinite", "isInteger", "isSafeInteger", "parseInt", "parseFloat", "fromCharCode", "fromCodePoint", "resolve", "reject", "all", "race", "allSettled", "any", "next", "toJSON", "constructor", "prototype", "__proto__", "hasOwnProperty", "isPrototypeOf", "propertyIsEnumerable", "toLocaleString", "addEventListener", "removeEventListener", "call", "apply", "bind"];

fn is_global(m: &Module, i: &IdentifierReference) -> bool { m.symbol(i).is_none() }
fn builtin(m: &Module, i: &IdentifierReference) -> bool { is_global(m, i) && BUILTINS.contains(&i.name.as_str()) }
fn holder(m: &Module, i: &IdentifierReference) -> bool { is_global(m, i) && HOLDERS.contains(&i.name.as_str()) }

/// Whether an expression is a built-in's object, or holds one at its root: `Array`, `Array.prototype`, `x.__proto__`,
/// `Object.getPrototypeOf(x)`, `x.constructor`.
fn rooted(m: &Module, e: &Expression) -> bool {
    match unwrap(e) {
        Expression::Identifier(i) => builtin(m, i),
        Expression::StaticMemberExpression(p) => match p.property.name.as_str() {
            "__proto__" | "constructor" => true,
            // (of a class or a function written there, it is the code's own)
            "prototype" => !own_class(m, &p.object),
            n => rooted(m, &p.object) || matches!(unwrap(&p.object), Expression::Identifier(i) if holder(m, i) && (BUILTINS.contains(&n) || HOLDERS.contains(&n))),
        },
        Expression::ComputedMemberExpression(p) => rooted(m, &p.object) || matches!(unwrap(&p.object), Expression::Identifier(i) if holder(m, i)) || matches!(unwrap(&p.expression), Expression::StringLiteral(s) if matches!(s.value.as_str(), "__proto__" | "prototype" | "constructor")),
        Expression::CallExpression(c) => matches!(unwrap(&c.callee), Expression::StaticMemberExpression(p) if p.property.name == "getPrototypeOf"),
        Expression::AssignmentExpression(a) => rooted(m, &a.right),
        Expression::SequenceExpression(s) => s.expressions.last().is_some_and(|e| rooted(m, e)),
        Expression::ConditionalExpression(c) => rooted(m, &c.consequent) || rooted(m, &c.alternate),
        Expression::LogicalExpression(l) => rooted(m, &l.left) || rooted(m, &l.right),
        Expression::ArrayExpression(_) | Expression::StringLiteral(_) | Expression::NumericLiteral(_) => false,
        _ => false,
    }
}
fn own_class(m: &Module, e: &Expression) -> bool {
    let Expression::Identifier(i) = unwrap(e) else { return false };
    m.symbol(i).is_some_and(|s| m.known_symbol(s) && match m.nodes.kind(m.scoping.symbol_declaration(s)) { AstKind::Class(_) | AstKind::Function(_) => true, AstKind::VariableDeclarator(v) => matches!(v.id, BindingPattern::BindingIdentifier(_)) && matches!(v.init.as_ref().map(unwrap), Some(Expression::ClassExpression(_) | Expression::FunctionExpression(_))), _ => false })
}
/// An object the code made there: a literal, `new`, a list's method that answers a new one, under a name that is nothing else.
pub fn own(m: &Module, e: &Expression, d: u32) -> bool {
    if d > 6 { return false; }
    match unwrap(e) {
        Expression::ObjectExpression(_) | Expression::ArrayExpression(_) | Expression::FunctionExpression(_) | Expression::ArrowFunctionExpression(_) => true,
        // (a class of the code's may answer anything: a platform's and the language's make their own)
        Expression::NewExpression(n) => matches!(unwrap(&n.callee), Expression::Identifier(i) if is_global(m, i) && matches!(i.name.as_str(), "Map" | "Set" | "WeakMap" | "WeakSet" | "Array" | "Date" | "Error" | "TypeError" | "RegExp" | "URL" | "URLSearchParams" | "FormData" | "Headers" | "Image" | "Audio")),
        Expression::StaticMemberExpression(p) => matches!(p.property.name.as_str(), "style" | "dataset"),
        Expression::ConditionalExpression(c) => own(m, &c.consequent, d + 1) && own(m, &c.alternate, d + 1),
        Expression::CallExpression(c) => match unwrap(&c.callee) {
            Expression::StaticMemberExpression(p) => match unwrap(&p.object) {
                Expression::Identifier(o) if is_global(m, o) && o.name == "Object" => match p.property.name.as_str() { "create" => matches!(c.arguments.first().and_then(|a| a.as_expression()).map(unwrap), Some(Expression::NullLiteral(_))), "fromEntries" | "entries" | "keys" | "values" => true, "assign" | "freeze" => c.arguments.first().and_then(|a| a.as_expression()).is_some_and(|a| own(m, a, d + 1)), _ => false },
                Expression::Identifier(o) if is_global(m, o) && o.name == "Array" => matches!(p.property.name.as_str(), "from" | "of"),
                _ => false,
            },
            Expression::Identifier(i) => is_global(m, i) && i.name == "Array",
            _ => false,
        },
        Expression::Identifier(i) => {
            let Some(s) = m.symbol(i) else { return false };
            if !m.known_symbol(s) { return false; }
            match m.nodes.kind(m.scoping.symbol_declaration(s)) {
                AstKind::VariableDeclarator(v) if matches!(v.id, BindingPattern::BindingIdentifier(_)) => v.init.as_ref().is_some_and(|x| own(m, x, d + 1)),
                AstKind::FormalParameter(_) | AstKind::FormalParameters(_) => accumulates(m, i),
                // (a rest parameter is a list of the call's)
                AstKind::FormalParameterRest(_) => true,
                AstKind::Class(_) | AstKind::Function(_) => true,
                _ => false,
            }
        }
        _ => false,
    }
}
/// `list.reduce((made, x) => { … }, {})`: the object it makes.
fn accumulates(m: &Module, i: &IdentifierReference) -> bool {
    let Some(s) = m.symbol(i) else { return false };
    let Some(f) = m.function_of(m.scoping.symbol_declaration(s)) else { return false };
    let (params, block) = match m.nodes.kind(f) { AstKind::Function(x) => (&x.params, true), AstKind::ArrowFunctionExpression(x) => (&x.params, matches!(x.body, ArrowFunctionBody::FunctionBody(_))), _ => return false };
    if !block || !matches!(params.items.first().map(|p| &p.pattern), Some(BindingPattern::BindingIdentifier(b)) if b.symbol_id.get() == Some(s)) { return false; }
    let o = m.outer(f);
    let at = m.nodes.kind(o).span();
    // (what it answers is what it is given next)
    m.returns_of(f).iter().all(|r| matches!(m.nodes.kind(*r), AstKind::ReturnStatement(r) if matches!(r.argument.as_ref().map(unwrap), Some(Expression::Identifier(x)) if m.symbol(x) == Some(s))))
        && matches!(m.nodes.parent_kind(o), AstKind::CallExpression(c) if c.arguments.len() == 2 && c.arguments[0].span() == at && matches!(c.arguments[1].as_expression().map(unwrap), Some(Expression::ObjectExpression(_) | Expression::ArrayExpression(_))) && matches!(unwrap(&c.callee), Expression::StaticMemberExpression(p) if p.property.name == "reduce"))
}
/// A key that is a number, whatever it is: a literal, what arithmetic makes, a name only ever counted.
pub fn numeric(m: &Module, e: &Expression, d: u32) -> bool {
    if d > 6 { return false; }
    match unwrap(e) {
        Expression::NumericLiteral(_) => true,
        Expression::UpdateExpression(_) => true,
        Expression::UnaryExpression(u) => matches!(u.operator, UnaryOperator::UnaryNegation | UnaryOperator::UnaryPlus | UnaryOperator::BitwiseNot),
        Expression::BinaryExpression(b) => match b.operator { BinaryOperator::Addition => numeric(m, &b.left, d + 1) && numeric(m, &b.right, d + 1), o => o.is_arithmetic() || o.is_bitwise() || matches!(o, BinaryOperator::ShiftLeft | BinaryOperator::ShiftRight | BinaryOperator::ShiftRightZeroFill) },
        Expression::AssignmentExpression(a) => a.operator.is_arithmetic() && a.operator != AssignmentOperator::Addition,
        Expression::Identifier(i) => {
            let Some(s) = m.symbol(i) else { return false };
            let AstKind::VariableDeclarator(v) = m.nodes.kind(m.scoping.symbol_declaration(s)) else { return false };
            if !matches!(v.id, BindingPattern::BindingIdentifier(_)) || !m.scoping.symbol_redeclarations(s).is_empty() { return false; }
            let first = match &v.init { Some(e) => numeric(m, e, d + 1), None => false };
            first && m.references(s).iter().all(|r| {
                if !m.scoping_write(*r) { return true; }
                match m.nodes.parent_kind(m.outer(*r)) { AstKind::UpdateExpression(_) => true, AstKind::AssignmentExpression(a) => match a.operator { AssignmentOperator::Assign => numeric(m, &a.right, d + 1), AssignmentOperator::Addition => numeric(m, &a.right, d + 1), o => o.is_arithmetic() || o.is_bitwise() }, _ => false }
            })
        }
        _ => false,
    }
}

/// The text of a key that is written there, or under a name that is nothing else.
pub fn key_text(m: &Module, e: &Expression, d: u32) -> Option<String> {
    match unwrap(e) {
        Expression::StringLiteral(s) => Some(s.value.to_string()),
        Expression::TemplateLiteral(t) if t.expressions.is_empty() => t.quasis.first().and_then(|q| q.value.cooked.as_ref()).map(|c| c.to_string()),
        Expression::BinaryExpression(b) if b.operator == BinaryOperator::Addition && d < 6 => Some(key_text(m, &b.left, d + 1)? + &key_text(m, &b.right, d + 1)?),
        Expression::Identifier(i) if d < 6 => { let s = m.symbol(i).filter(|s| m.known_symbol(*s))?; let AstKind::VariableDeclarator(v) = m.nodes.kind(m.scoping.symbol_declaration(s)) else { return None }; if !matches!(v.id, BindingPattern::BindingIdentifier(_)) { return None; } key_text(m, v.init.as_ref()?, d + 1) }
        _ => None,
    }
}

pub fn read(m: &Module) -> Patch {
    let mut p = Patch::default();
    for n in m.nodes.iter() {
        let id = n.id();
        if p.done.is_some() { return p; }
        p.at = n.kind().span().start;
        match n.kind() {
            AstKind::WithStatement(_) => p.done = Some("it has a `with`"),
            AstKind::IdentifierReference(i) if is_global(m, i) => {
                let written = i.reference_id.get().is_some_and(|r| m.scoping.get_reference(r).is_write());
                if i.name == "eval" { p.done = Some("it has an `eval`"); }
                if i.name == "Function" && !matches!(m.nodes.parent_kind(m.outer(id)), AstKind::BinaryExpression(_) | AstKind::StaticMemberExpression(_)) { p.done = Some("it makes code of text (`Function`)"); }
                if written && (BUILTINS.contains(&i.name.as_str()) || HOLDERS.contains(&i.name.as_str()) || GLOBAL_FNS.contains(&i.name.as_str())) { p.done = Some("it replaces a built-in"); }
                if builtin(m, i) && lets_go(m, id) { p.stands.push((id, false)); }
                if holder(m, i) && lets_go(m, id) { p.stands.push((id, true)); }
            }
            AstKind::StaticMemberExpression(x) => {
                let name = x.property.name.as_str();
                if m.is_written(id) {
                    if name == "stackTraceLimit" { continue; }
                    if written_builtin(m, &x.object, name) { p.done = Some("it replaces a part of a built-in"); }
                    else if MEMBERS.contains(&name) && !own(m, &x.object, 0) && !in_class(m, &x.object, id) { p.may_write.get_or_insert(x.span.start); }
                    else if (GLOBAL_FNS.contains(&name) || BUILTINS.contains(&name)) && !own(m, &x.object, 0) && !in_class(m, &x.object, id) { p.done = Some("it may replace a built-in"); }
                    if matches!(name, "__proto__") { p.may_write.get_or_insert(x.span.start); }
                } else {
                    if matches!(name, "prototype") && !own_class(m, &x.object) && !matches!(m.nodes.parent_kind(m.outer(id)), AstKind::StaticMemberExpression(_) | AstKind::BinaryExpression(_)) { p.stands.push((id, false)); }
                    if matches!(name, "__proto__" | "constructor") && !compared(m, id) && !(name == "constructor" && in_class(m, &x.object, id)) { p.stands.push((id, false)); }
                    if name == "constructor" && makes_code(m, id) && !in_class(m, &x.object, id) { p.done = Some("it may make code of text (`constructor`)"); }
                    if matches!(name, "eval" | "Function") && matches!(unwrap(&x.object), Expression::Identifier(i) if holder(m, i)) { p.done = Some("it may make code of text"); }
                    if BUILTINS.contains(&name) && matches!(unwrap(&x.object), Expression::Identifier(i) if holder(m, i)) && lets_go(m, id) { p.stands.push((id, false)); }
                }
            }
            AstKind::ComputedMemberExpression(x) => {
                let text = key_text(m, &x.expression, 0);
                let key = text.as_deref();
                if m.is_written(id) {
                    let known = match key { Some(k) => Some(MEMBERS.contains(&k)), None if numeric(m, &x.expression, 0) || symbol_key(m, &x.expression) => Some(false), None => None };
                    if matches!(unwrap(&x.object), Expression::Identifier(i) if holder(m, i)) && key.is_none() && matches!(unwrap(&x.expression), Expression::Identifier(_)) { p.keyed.push(id); continue; }
                    if rooted(m, &x.object) || matches!(unwrap(&x.object), Expression::Identifier(i) if holder(m, i) && !symbol_key(m, &x.expression) && key.is_none_or(|k| BUILTINS.contains(&k) || GLOBAL_FNS.contains(&k))) { p.done = Some("it replaces a part of a built-in"); }
                    else if key.is_some_and(|k| BUILTINS.contains(&k) || GLOBAL_FNS.contains(&k)) && !own(m, &x.object, 0) { p.done = Some("it may replace a built-in"); }
                    else if known != Some(false) && !own(m, &x.object, 0) { p.may_write.get_or_insert(x.span.start); p.may_write_global.get_or_insert(x.span.start); }
                } else if matches!(key, Some("constructor")) { p.done = Some("it may make code of text (`constructor`)"); }
                else if matches!(key, Some("__proto__" | "prototype")) { p.stands.push((id, false)); }
            }
            AstKind::CallExpression(c) => {
                let arg = |i: usize| c.arguments.get(i).and_then(|a| a.as_expression());
                if let Expression::StaticMemberExpression(k) = unwrap(&c.callee) {
                    let name = k.property.name.as_str();
                    if matches!(name, "assign" | "defineProperty" | "defineProperties" | "setPrototypeOf" | "set") && matches!(unwrap(&k.object), Expression::Identifier(o) if is_global(m, o) && matches!(o.name.as_str(), "Object" | "Reflect")) {
                        if let Some(a) = arg(0) {
                            if rooted(m, a) || matches!(unwrap(a), Expression::Identifier(i) if holder(m, i)) { p.done = Some("it replaces a part of a built-in"); }
                            else if !own(m, a, 0) && !(name == "defineProperty" && matches!(arg(1).map(unwrap), Some(Expression::StringLiteral(s)) if !MEMBERS.contains(&s.value.as_str()) && !GLOBAL_FNS.contains(&s.value.as_str()))) && !(name == "defineProperty" && arg(1).is_some_and(|e| symbol_key(m, e))) { p.may_write.get_or_insert(c.span.start); p.may_write_global.get_or_insert(c.span.start); }
                        } else { p.done = Some("it may replace a part of a built-in"); }
                    }
                    if matches!(name, "__defineGetter__" | "__defineSetter__") { p.done = Some("it may replace a part of a built-in"); }
                    if name == "getPrototypeOf" && !compared(m, id) { p.stands.push((id, false)); }
                }
                if let Expression::Identifier(i) = unwrap(&c.callee) { if is_global(m, i) && matches!(i.name.as_str(), "setTimeout" | "setInterval") && matches!(arg(0).map(unwrap), Some(Expression::StringLiteral(_) | Expression::TemplateLiteral(_) | Expression::BinaryExpression(_))) { p.done = Some("it makes code of text (a timer's)"); } }
            }
            AstKind::BindingProperty(b) => match static_key(&b.key, b.computed).as_deref() { Some("prototype" | "__proto__" | "constructor") => p.taken = true, _ => {} },
            _ => {}
        }
    }
    p
}
fn written_builtin(m: &Module, object: &Expression, name: &str) -> bool {
    if matches!(unwrap(object), Expression::Identifier(i) if holder(m, i)) { return BUILTINS.contains(&name) || GLOBAL_FNS.contains(&name) || name == "__proto__"; }
    // (`new this.constructor()`, `this.constructor.n = …`: whatever it is)
    rooted(m, object)
}
/// `this` in a class of the code's.
fn in_class(m: &Module, e: &Expression, id: NodeId) -> bool { matches!(unwrap(e), Expression::ThisExpression(_)) && m.nodes.ancestor_ids(id).any(|a| matches!(m.nodes.kind(a), AstKind::Class(_))) }
fn symbol_key(m: &Module, e: &Expression) -> bool {
    match unwrap(e) {
        Expression::StaticMemberExpression(p) => matches!(unwrap(&p.object), Expression::Identifier(i) if is_global(m, i) && i.name == "Symbol") && !matches!(p.property.name.as_str(), "iterator" | "asyncIterator" | "toPrimitive" | "hasInstance" | "species" | "isConcatSpreadable" | "match" | "matchAll" | "replace" | "search" | "split" | "toStringTag" | "unscopables"),
        Expression::CallExpression(c) => match unwrap(&c.callee) { Expression::Identifier(i) => is_global(m, i) && i.name == "Symbol", Expression::StaticMemberExpression(p) => p.property.name == "for" && matches!(unwrap(&p.object), Expression::Identifier(i) if is_global(m, i) && i.name == "Symbol"), _ => false },
        Expression::Identifier(i) => m.symbol(i).is_some_and(|s| m.known_symbol(s) && matches!(m.nodes.kind(m.scoping.symbol_declaration(s)), AstKind::VariableDeclarator(v) if matches!(v.id, BindingPattern::BindingIdentifier(_)) && v.init.as_ref().is_some_and(|x| matches!(unwrap(x), Expression::CallExpression(_)) && symbol_key(m, x)))),
        _ => false,
    }
}
/// Whether a built-in stands where more than its use is there: a name it is put under, an argument it is, what is answered.
fn lets_go(m: &Module, id: NodeId) -> bool {
    let o = m.outer(id);
    let span = m.nodes.kind(o).span();
    match m.nodes.parent_kind(o) {
        AstKind::StaticMemberExpression(_) | AstKind::BinaryExpression(_) | AstKind::UnaryExpression(_) | AstKind::Class(_) | AstKind::IfStatement(_) | AstKind::ExpressionStatement(_) => false,
        AstKind::ComputedMemberExpression(p) => p.object.span() != span,
        AstKind::CallExpression(c) => c.callee.span() != span && !matches!(m.nodes.kind(id), AstKind::IdentifierReference(i) if matches!(i.name.as_str(), "Boolean" | "String" | "Number")),
        AstKind::NewExpression(c) => c.callee.span() != span,
        AstKind::ConditionalExpression(c) => c.test.span() != span,
        AstKind::LogicalExpression(l) => !(l.operator == LogicalOperator::And && l.left.span() == span),
        _ => true,
    }
}
/// A prototype or a constructor that is only compared, or asked for its name or its own prototype.
fn compared(m: &Module, id: NodeId) -> bool {
    let o = m.outer(id);
    let mut o = o;
    while let AstKind::ChainExpression(_) = m.nodes.parent_kind(o) { o = m.outer(m.nodes.parent_id(o)); }
    let span = m.nodes.kind(o).span();
    match m.nodes.parent_kind(o) {
        AstKind::BinaryExpression(_) | AstKind::UnaryExpression(_) | AstKind::IfStatement(_) => true,
        AstKind::StaticMemberExpression(p) => matches!(p.property.name.as_str(), "name" | "displayName") && !m.is_written(m.nodes.parent_id(o)),
        AstKind::LogicalExpression(l) => l.left.span() == span && l.operator == LogicalOperator::And,
        AstKind::CallExpression(c) => matches!(unwrap(&c.callee), Expression::StaticMemberExpression(p) if p.property.name == "getPrototypeOf") && compared(m, m.nodes.parent_id(o)),
        AstKind::AssignmentExpression(a) if a.operator == AssignmentOperator::Assign && a.right.span() == span => match &a.left {
            AssignmentTarget::AssignmentTargetIdentifier(i) => m.symbol(i).is_some_and(|s| !m.handed_out.contains(&s) && m.references(s).iter().all(|r| m.scoping_write(*r) || simple(m, *r))) && simple(m, m.nodes.parent_id(o)),
            _ => false,
        },
        AstKind::VariableDeclarator(d) if d.init.as_ref().is_some_and(|i| i.span() == span) => match &d.id { BindingPattern::BindingIdentifier(b) => b.symbol_id.get().is_some_and(|s| m.known_symbol(s) && !m.handed_out.contains(&s) && m.references(s).iter().all(|r| compared(m, *r))), _ => false },
        _ => false,
    }
}
/// Compared there, and nothing else.
fn simple(m: &Module, id: NodeId) -> bool { matches!(m.nodes.parent_kind(m.outer(id)), AstKind::BinaryExpression(_) | AstKind::UnaryExpression(_) | AstKind::IfStatement(_) | AstKind::ExpressionStatement(_)) }
fn makes_code(m: &Module, id: NodeId) -> bool {
    let mut o = m.outer(id);
    while let AstKind::ChainExpression(_) = m.nodes.parent_kind(o) { o = m.outer(m.nodes.parent_id(o)); }
    let span = m.nodes.kind(o).span();
    // (of a list, a buffer, a number: a constructor that is given no text makes no code; a function's is `Function`)
    let of_fn = matches!(m.nodes.kind(id), AstKind::StaticMemberExpression(p) if match unwrap(&p.object) { Expression::ArrowFunctionExpression(_) | Expression::FunctionExpression(_) | Expression::ClassExpression(_) | Expression::StaticMemberExpression(_) | Expression::CallExpression(_) => true, Expression::Identifier(i) => match m.symbol(i) { None => true, Some(s) => matches!(m.nodes.kind(m.scoping.symbol_declaration(s)), AstKind::Function(_) | AstKind::Class(_)) || matches!(m.nodes.kind(m.scoping.symbol_declaration(s)), AstKind::VariableDeclarator(v) if matches!(v.init.as_ref().map(unwrap), Some(Expression::ArrowFunctionExpression(_) | Expression::FunctionExpression(_) | Expression::ClassExpression(_)))) }, _ => false });
    let text = |a: &Argument| a.as_expression().is_none_or(|e| matches!(unwrap(e), Expression::StringLiteral(_) | Expression::TemplateLiteral(_) | Expression::CallExpression(_)) || (matches!(unwrap(e), Expression::BinaryExpression(_)) && !numeric(m, e, 0)) || key_text(m, e, 0).is_some());
    let run = |p: NodeId| { let o = m.outer(p); matches!(m.nodes.parent_kind(o), AstKind::CallExpression(c) if c.callee.span() == m.nodes.kind(o).span()) };
    match m.nodes.parent_kind(o) {
        AstKind::CallExpression(c) if c.callee.span() == span => !c.arguments.is_empty() && (of_fn || c.arguments.iter().any(text) || run(m.nodes.parent_id(o))),
        AstKind::NewExpression(c) if c.callee.span() == span => !c.arguments.is_empty() && (of_fn || c.arguments.iter().any(text) || run(m.nodes.parent_id(o))),
        AstKind::StaticMemberExpression(p) => p.property.name == "constructor",
        AstKind::TaggedTemplateExpression(_) => true,
        _ => false,
    }
}

const READERS: &[&str] = &["keys", "values", "entries", "getOwnPropertyDescriptor", "getOwnPropertyDescriptors", "getOwnPropertyNames", "getOwnPropertySymbols", "hasOwn", "is", "isFrozen", "isSealed", "isExtensible", "getPrototypeOf", "create", "ownKeys", "has", "isArray", "from", "of"];

impl<'m, 'a, 'r> super::place::Place<'m, 'a, 'r> {
    /// Whether a file of the graph changes a built-in, or may.
    pub fn patches(&self, files: &BTreeSet<usize>) -> Option<(usize, u32, &'static str)> {
        for i in files { if let Some(w) = self.m(*i).banned { return Some((*i, self.m(*i).patch.at, w)); } }
        let writes = files.iter().find_map(|i| self.m(*i).patch.may_write.map(|a| (*i, a)));
        for i in files {
            let m = self.m(*i);
            let i0 = i;
            if m.patch.taken && writes.is_some() { let (m, a) = writes.unwrap(); return Some((m, a, "it may replace a part of a built-in: one is taken off something, and something is written under a name that may be one's")); }
            for id in &m.patch.keyed {
                let AstKind::ComputedMemberExpression(x) = m.nodes.kind(*id) else { continue };
                let key = match unwrap(&x.expression) { Expression::Identifier(i) => match self.name(*i0, i) { Some(Origin::Symbol(a, b)) => { let ma = self.m(a); match ma.nodes.kind(ma.scoping.symbol_declaration(b)) { AstKind::VariableDeclarator(v) if ma.known_symbol(b) && matches!(v.id, BindingPattern::BindingIdentifier(_)) => v.init.as_ref().and_then(|e| if symbol_key(ma, e) { Some("Symbol()".into()) } else { key_text(ma, e, 0) }), _ => None } } _ => None }, _ => None };
                if key.is_none_or(|k| BUILTINS.contains(&k.as_str()) || GLOBAL_FNS.contains(&k.as_str())) { return Some((*i0, x.span.start, "it may replace a built-in")); }
            }
            for (id, global) in &m.patch.stands {
                let mut seen = BTreeSet::new();
                match self.goes(*i, *id, *global, files, &mut seen) {
                    Goes::Stays => {}
                    Goes::Changed(m, a) => return Some((m, a, "it replaces a part of a built-in")),
                    Goes::Away if *global => if let Some(a) = m.patch.may_write_global { return Some((*i, a, "it may replace a built-in: the global object goes where it is not followed, and something is written under a name that is computed")); },
                    Goes::Away => if let Some((w, a)) = writes { let _ = (w, a); return Some((*i, m.nodes.kind(*id).span().start, "it may replace a part of a built-in: one goes where it is not followed, and something is written under a name that may be one's")); },
                }
            }
        }
        None
    }
    /// Where a built-in that stands at a node goes.
    fn goes(&self, mi: usize, id: NodeId, global: bool, files: &BTreeSet<usize>, seen: &mut BTreeSet<(usize, usize)>) -> Goes {
        if seen.len() > 400 || !seen.insert((mi, id.index())) { return if seen.len() > 400 { Goes::Away } else { Goes::Stays }; }
        let m = self.m(mi);
        let mut o = m.outer(id);
        loop {
            let span = m.nodes.kind(o).span();
            let up = match m.nodes.parent_kind(o) {
                AstKind::ChainExpression(_) => true,
                AstKind::ConditionalExpression(c) => { if c.test.span() == span { return Goes::Stays; } true }
                AstKind::LogicalExpression(_) => true,
                AstKind::SequenceExpression(x) => { if x.expressions.last().is_none_or(|e| e.span() != span) { return Goes::Stays; } true }
                _ => false,
            };
            if !up { break; }
            o = m.outer(m.nodes.parent_id(o));
        }
        let span = m.nodes.kind(o).span();
        let pid = m.nodes.parent_id(o);
        let written = |x: NodeId| m.is_written(x);
        match m.nodes.kind(pid) {
            AstKind::StaticMemberExpression(p) => {
                let n = p.property.name.as_str();
                if n == "stackTraceLimit" { return Goes::Stays; }
                if written(pid) { return if !global || BUILTINS.contains(&n) || GLOBAL_FNS.contains(&n) { Goes::Changed(mi, span.start) } else { Goes::Stays }; }
                if global && BUILTINS.contains(&n) || matches!(n, "prototype" | "__proto__" | "constructor") || (global && HOLDERS.contains(&n)) { return self.goes(mi, pid, HOLDERS.contains(&n), files, seen); }
                Goes::Stays
            }
            AstKind::ComputedMemberExpression(p) => {
                if p.object.span() != span { return Goes::Stays; }
                if written(pid) { return if symbol_key(m, &p.expression) || numeric(m, &p.expression, 0) { Goes::Stays } else { Goes::Changed(mi, span.start) }; }
                if global && !matches!(unwrap(&p.expression), Expression::NumericLiteral(_)) && !symbol_key(m, &p.expression) { return Goes::Away; }
                Goes::Stays
            }
            AstKind::BinaryExpression(_) | AstKind::UnaryExpression(_) | AstKind::IfStatement(_) | AstKind::ExpressionStatement(_) | AstKind::Class(_) => Goes::Stays,
            AstKind::NewExpression(n) if n.callee.span() == span => Goes::Stays,
            AstKind::VariableDeclarator(d) => match &d.id {
                BindingPattern::BindingIdentifier(b) => b.symbol_id.get().map_or(Goes::Away, |s| self.goes_name(mi, s, global, files, seen)),
                // (its members, read)
                BindingPattern::ObjectPattern(x) if x.rest.is_none() && x.properties.iter().all(|q| static_key(&q.key, q.computed).is_some_and(|k| !matches!(k.as_str(), "prototype" | "__proto__" | "constructor") && !BUILTINS.contains(&k.as_str()) && !HOLDERS.contains(&k.as_str()))) => Goes::Stays,
                _ => Goes::Away,
            },
            AstKind::AssignmentExpression(a) if a.right.span() == span => match &a.left { AssignmentTarget::AssignmentTargetIdentifier(i) => m.symbol(i).map_or(Goes::Away, |s| self.goes_name(mi, s, global, files, seen)), _ => Goes::Away },
            AstKind::AssignmentPattern(a) => match &a.left { BindingPattern::BindingIdentifier(b) => b.symbol_id.get().map_or(Goes::Away, |s| self.goes_name(mi, s, global, files, seen)), _ => Goes::Away },
            AstKind::FormalParameter(a) => match &a.pattern { BindingPattern::BindingIdentifier(b) => b.symbol_id.get().map_or(Goes::Away, |s| self.goes_name(mi, s, global, files, seen)), _ => Goes::Away },
            AstKind::NewExpression(c) => {
                let Some(i) = c.arguments.iter().position(|a| a.span() == span) else { return Goes::Away };
                let Expression::Identifier(x) = unwrap(&c.callee) else { return Goes::Away };
                let Some(Origin::Symbol(cm, cs)) = self.name(mi, x) else { return Goes::Away };
                let mc = self.m(cm);
                let k = match mc.nodes.kind(mc.scoping.symbol_declaration(cs)) { AstKind::Class(k) => k, AstKind::VariableDeclarator(v) => match v.init.as_ref().map(unwrap) { Some(Expression::ClassExpression(k)) => &**k, _ => return Goes::Away }, _ => return Goes::Away };
                if !mc.known_symbol(cs) || k.heritage.is_some() { return Goes::Away; }
                let Some(ctor) = k.body.body.iter().find_map(|e| match e { ClassElement::MethodDefinition(d) if d.kind == MethodDefinitionKind::Constructor => Some(&d.value), _ => None }) else { return Goes::Stays };
                match ctor.params.items.get(i).map(|p| &p.pattern) { Some(BindingPattern::BindingIdentifier(b)) => b.symbol_id.get().map_or(Goes::Away, |s| self.goes_name(cm, s, global, files, seen)), Some(_) => Goes::Away, None => Goes::Away }
            }
            AstKind::CallExpression(c) if c.callee.span() == span => Goes::Stays,
            AstKind::CallExpression(c) => {
                let Some(i) = c.arguments.iter().position(|a| a.span() == span) else { return Goes::Away };
                if let Expression::StaticMemberExpression(k) = unwrap(&c.callee) {
                    let n = k.property.name.as_str();
                    if let Expression::Identifier(g) = unwrap(&k.object) { if is_global(m, g) && matches!(g.name.as_str(), "Object" | "Array" | "Reflect") && (READERS.contains(&n) || (n == "setPrototypeOf" && i == 1)) && i == 0 || (is_global(m, g) && g.name == "Object" && n == "setPrototypeOf" && i == 1) { return Goes::Stays; } }
                    if matches!(n, "bind" | "call" | "apply") && i == 0 && rooted(m, &k.object) { return Goes::Stays; }
                    if matches!(n, "captureStackTrace" | "addEventListener" | "removeEventListener" | "observe" | "unobserve") { return Goes::Stays; }
                }
                if let Some(f) = self.called(mi, &c.callee) {
                    let Some((params, ..)) = self.parts(f) else { return Goes::Away };
                    if c.arguments.iter().take(i).any(|a| a.is_spread()) || super::place::uses_arguments(self.m(f.module), f.node) { return Goes::Away; }
                    return match params.items.get(i) { Some(p) => match &p.pattern { BindingPattern::BindingIdentifier(b) => b.symbol_id.get().map_or(Goes::Away, |s| self.goes_name(f.module, s, global, files, seen)), BindingPattern::AssignmentPattern(a) => match &a.left { BindingPattern::BindingIdentifier(b) => b.symbol_id.get().map_or(Goes::Away, |s| self.goes_name(f.module, s, global, files, seen)), _ => Goes::Away }, _ => Goes::Away }, None => if params.rest.is_none() { Goes::Stays } else { Goes::Away } };
                }
                // (a conversion, as a callback)
                if matches!(m.nodes.kind(id), AstKind::IdentifierReference(i) if matches!(i.name.as_str(), "Boolean" | "String" | "Number")) { return Goes::Stays; }
                Goes::Away
            }
            AstKind::ReturnStatement(_) | AstKind::ArrowFunctionExpression(_) => {
                // what a function answers: where its calls stand, if all there is of it is calls by name
                let Some(f) = m.function_of(o) else { return Goes::Away };
                if f != pid && matches!(m.nodes.kind(pid), AstKind::ArrowFunctionExpression(_)) { return Goes::Away; }
                let name = match m.nodes.kind(f) {
                    AstKind::Function(x) if x.is_declaration() && !x.r#async && !x.generator => x.id.as_ref().and_then(|i| i.symbol_id.get()),
                    AstKind::ArrowFunctionExpression(x) if !x.r#async => match m.nodes.parent_kind(m.outer(f)) { AstKind::VariableDeclarator(v) => match &v.id { BindingPattern::BindingIdentifier(b) => b.symbol_id.get(), _ => None }, _ => None },
                    _ => None,
                };
                let Some(s) = name.filter(|s| m.known_symbol(*s)) else { return Goes::Away };
                let mut out = Goes::Stays;
                for (j, r) in self.uses_of(mi, s, files) {
                    let mj = self.m(j);
                    let ro = mj.outer(r);
                    match mj.nodes.parent_kind(ro) {
                        AstKind::CallExpression(c) if c.callee.span() == mj.nodes.kind(ro).span() => match self.goes(j, mj.nodes.parent_id(ro), global, files, seen) { Goes::Stays => {} Goes::Away => out = Goes::Away, g => return g },
                        AstKind::ExportSpecifier(_) => {}
                        _ => return Goes::Away,
                    }
                }
                out
            }
            AstKind::ExportSpecifier(_) => Goes::Stays,   // (its importers: `goes_name`)
            _ => Goes::Away,
        }
    }
    fn goes_name(&self, mi: usize, s: oxc_syntax::symbol::SymbolId, global: bool, files: &BTreeSet<usize>, seen: &mut BTreeSet<(usize, usize)>) -> Goes {
        let mut out = Goes::Stays;
        for (j, r) in self.uses_of(mi, s, files) { if self.m(j).scoping_write(r) { continue; } match self.goes(j, r, global, files, seen) { Goes::Stays => {} Goes::Away => out = Goes::Away, g => return g } }
        out
    }
    fn uses_of(&self, mi: usize, s: oxc_syntax::symbol::SymbolId, files: &BTreeSet<usize>) -> Vec<(usize, NodeId)> {
        let mut uses: Vec<(usize, NodeId)> = self.m(mi).references(s).into_iter().map(|r| (mi, r)).collect();
        if self.m(mi).handed_out.contains(&s) {
            for j in files { if *j == mi { continue; } let mj = self.m(*j); for y in mj.imports.keys() { if let Origin::Symbol(a, b) = self.mods.symbol(self.h, self.hi, *j, *y, &mut vec![]) { if a == mi && b == s { uses.extend(mj.references(*y).into_iter().map(|r| (*j, r))); } } } }
        }
        uses
    }
}
enum Goes { Stays, Away, Changed(usize, u32) }
