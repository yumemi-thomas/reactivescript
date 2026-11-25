//! What is the platform's own event target (DESIGN.md, `handler`): a value, or a list of them, or a function that answers
//! them. `window`, `document` and what they answer, what the platform's constructors make, and what the caller gives a
//! parameter whose type in the row is one. A form that is not listed is not one.
use super::constant::{static_key, unwrap};
use super::eval::{FnAt, Ty, TARGET};
use super::graph::{Module, Origin};
use super::place::Place;
use oxc_ast::{ast::*, AstKind};
use oxc_semantic::NodeId;
use oxc_span::GetSpan;
use oxc_syntax::symbol::SymbolId;
use std::collections::HashMap;

/// `Target`: a target, a function that answers one, or a primitive: nothing here has an `addEventListener` but the platform's.
/// `List`: the same, or a list of them (a name that holds one is only read: `kept`). `Ty`: the caller's, of a type; `Str`: that
/// string.
#[derive(Clone, PartialEq, Eq, Debug)]
pub enum V { Target, List, Ty(u32), Str(String) }
pub type Bind = HashMap<(usize, SymbolId), Option<V>>;
#[derive(Clone, Debug, PartialEq)]
pub enum Step { Key(String), At(usize) }

/// What the platform's `new` makes that nothing but the platform sends events to. (An `XMLHttpRequest`, an `AbortController`
/// and an `EventTarget` send theirs while a call of the code's own runs.)
pub const MADE: &[&str] = &["EventSource", "WebSocket", "Worker", "SharedWorker", "BroadcastChannel", "Notification", "Audio", "Image", "MediaRecorder", "RTCPeerConnection", "OffscreenCanvas"];
const ELEMENTS: &[&str] = &["EventTarget", "Node", "Element", "Document", "Window", "SVGElement", "MathMLElement"];
/// What is read off a target and is one: the platform's own accessors.
const PARTS: &[&str] = &["document", "body", "head", "documentElement", "ownerDocument", "defaultView", "parentElement", "parentNode", "firstElementChild", "lastElementChild", "nextElementSibling", "previousElementSibling", "shadowRoot", "contentDocument", "contentWindow", "visualViewport", "form"];
const FINDS: &[&str] = &["matchMedia", "getElementById", "querySelector", "closest", "getRootNode"];
const LISTS: &[&str] = &["filter", "slice", "flat", "concat", "reverse", "at", "find", "toReversed"];

fn join(a: V, b: V) -> Option<V> { if a == b { return Some(a); } match (&a, &b) { (V::Ty(_), _) | (_, V::Ty(_)) => None, (V::List, _) | (_, V::List) => Some(V::List), _ => Some(V::Target) } }

impl<'m, 'a, 'r> Place<'m, 'a, 'r> {
    /// Whether a type holds targets alone, and whether it may be a list.
    fn made_of(&self, t: u32) -> Option<bool> {
        if t == TARGET { return Some(false); }
        match &self.types.0[t as usize] {
            Ty::Num | Ty::Prim => Some(false),
            Ty::Union(m) => m.iter().try_fold(false, |l, x| self.made_of(*x).map(|y| l | y)),
            Ty::Tuple(m) => m.iter().all(|x| self.made_of(*x).is_some()).then_some(true),
            Ty::Arr(e) | Ty::Rest(e) => self.made_of(*e).map(|_| true),
            Ty::Fn { ret, .. } => self.made_of(*ret),
            _ => None,
        }
    }
    fn typed(&self, t: u32) -> Option<V> {
        if let Some(l) = self.made_of(t) { return Some(if l { V::List } else { V::Target }); }
        match &self.types.0[t as usize] { Ty::Rec(_) | Ty::Union(_) | Ty::Tuple(_) | Ty::Arr(_) | Ty::Fn { .. } => Some(V::Ty(t)), _ => None }
    }
    fn parts_of(&self, t: u32, f: &dyn Fn(&Ty) -> Option<u32>) -> Option<V> {
        match &self.types.0[t as usize] {
            Ty::Union(m) => { let mut out = None; for x in m { if matches!(self.types.0[*x as usize], Ty::Num | Ty::Prim) { continue; } let v = self.parts_of(*x, f)?; out = Some(match out { None => v, Some(o) => join(o, v)? }); } out }
            t => self.typed(f(t)?),
        }
    }
    fn step(&self, v: &V, s: &Step) -> Option<V> {
        match (v, s) {
            (V::List, Step::At(_)) => Some(V::List),
            (V::Target, Step::At(_)) => Some(V::Target),
            (V::Target | V::List, Step::Key(k)) => (PARTS.contains(&k.as_str())).then_some(V::Target),
            (V::Ty(t), Step::Key(k)) => self.parts_of(*t, &|t| match t { Ty::Rec(f) => f.get(k).copied(), _ => None }),
            (V::Ty(t), Step::At(i)) => self.parts_of(*t, &|t| match t { Ty::Arr(e) => Some(*e), Ty::Tuple(m) => m.get(*i).copied(), _ => None }),
            _ => None,
        }
    }
    fn walk(&self, v: Option<V>, p: &[Step]) -> Option<V> { let mut v = v?; for s in p { v = self.step(&v, s)?; } Some(v) }

    /// Whether every value of an expression is the platform's target, a list of them, or nothing.
    pub fn target(&self, mi: usize, e: &'m Expression<'a>, b: &Bind) -> bool { self.steps.set(0); matches!(self.value(mi, e, b, 0), Some(V::Target | V::List)) }
    pub fn text(&self, mi: usize, e: &'m Expression<'a>, b: &Bind) -> Option<String> { self.steps.set(0); match self.value(mi, e, b, 0) { Some(V::Str(s)) => Some(s), _ => None } }

    fn value(&self, mi: usize, e: &'m Expression<'a>, b: &Bind, d: u32) -> Option<V> {
        self.steps.set(self.steps.get() + 1);
        if d > 24 || self.steps.get() > 4000 || self.m(mi).banned.is_some() { return None; }
        let m = self.m(mi);
        let go = |e: &'m Expression<'a>| self.value(mi, e, b, d + 1);
        let both = |x: Option<V>, y: Option<V>| join(x?, y?);
        match unwrap(e) {
            Expression::StringLiteral(s) => Some(V::Str(s.value.to_string())),
            Expression::NullLiteral(_) | Expression::BooleanLiteral(_) | Expression::NumericLiteral(_) | Expression::TemplateLiteral(_) | Expression::BinaryExpression(_) => Some(V::Target),
            Expression::UnaryExpression(_) => Some(V::Target),
            Expression::Identifier(i) => {
                if ["window", "document", "undefined", "self", "globalThis"].iter().any(|g| m.is_global(i, g)) { return Some(V::Target); }
                let s = m.symbol(i).filter(|s| m.known_symbol(*s))?;
                if self.seen_as_element(mi, i, s) { return Some(V::Target); }
                self.named(mi, s, b, d)
            }
            Expression::StaticMemberExpression(p) => {
                if let Expression::Identifier(o) = unwrap(&p.object) {
                    let n = p.property.name.as_str();
                    if m.is_global(o, "screen") { return (n == "orientation").then_some(V::Target); }
                    if m.is_global(o, "navigator") { return matches!(n, "connection" | "serviceWorker" | "mediaDevices").then_some(V::Target); }
                }
                let v = go(&p.object)?;
                self.step(&v, &Step::Key(p.property.name.to_string()))
            }
            Expression::ComputedMemberExpression(p) => match unwrap(&p.expression) { Expression::NumericLiteral(n) => { let v = go(&p.object)?; self.step(&v, &Step::At(n.value as usize)) } _ => None },
            Expression::ChainExpression(c) => match &c.expression {
                ChainElement::StaticMemberExpression(p) => { let v = go(&p.object)?; self.step(&v, &Step::Key(p.property.name.to_string())) }
                ChainElement::CallExpression(c) => self.answer_of(mi, c, b, d),
                _ => None,
            },
            Expression::ConditionalExpression(c) => both(go(&c.consequent), go(&c.alternate)),
            Expression::LogicalExpression(l) => if l.operator == LogicalOperator::And { go(&l.right) } else { both(go(&l.left), go(&l.right)) },
            Expression::ArrayExpression(a) => { for x in &a.elements { let e = match x { ArrayExpressionElement::SpreadElement(s) => &s.argument, ArrayExpressionElement::Elision(_) => continue, x => x.to_expression() }; if !matches!(go(e)?, V::Target | V::List | V::Str(_)) { return None; } } Some(V::List) }
            Expression::NewExpression(n) => matches!(unwrap(&n.callee), Expression::Identifier(i) if MADE.iter().any(|g| m.is_global(i, g))).then_some(V::Target),
            Expression::CallExpression(c) => self.answer_of(mi, c, b, d),
            _ => None,
        }
    }
    /// What a call answers.
    fn answer_of(&self, mi: usize, c: &'m CallExpression<'a>, b: &Bind, d: u32) -> Option<V> {
        let m = self.m(mi);
        let arg = |i: usize| c.arguments.get(i).and_then(|a| a.as_expression());
        let callee = unwrap(&c.callee);
        if let Expression::StaticMemberExpression(p) = callee {
            let n = p.property.name.as_str();
            if let Expression::Identifier(o) = unwrap(&p.object) { if m.is_global(o, "Array") && n == "from" && c.arguments.len() == 1 { return self.value(mi, arg(0)?, b, d + 1).filter(|v| *v == V::List); } }
            let v = self.value(mi, &p.object, b, d + 1)?;
            if matches!(v, V::Target | V::List) {
                if n == "querySelectorAll" { return Some(V::List); }
                if FINDS.contains(&n) { return Some(V::Target); }
                // (a name with a hyphen is an element some program defines)
                if n == "createElement" { return matches!(arg(0).map(unwrap), Some(Expression::StringLiteral(s)) if !s.value.contains('-')).then_some(V::Target); }
                if LISTS.contains(&n) && !c.arguments.iter().any(|a| a.is_spread()) && (n != "concat" || c.arguments.iter().all(|a| a.as_expression().is_some_and(|a| self.value(mi, a, b, d + 1) .is_some_and(|v| matches!(v, V::Target | V::List))))) { return Some(V::List); }
            }
            let f = self.step(&v, &Step::Key(n.to_string()))?;
            return self.call_value(&f);
        }
        if let Expression::Identifier(i) = callee { if m.is_global(i, "matchMedia") { return Some(V::Target); } }
        if let Some(n) = self.solid(mi, callee) {
            return match n.as_str() { "createMemo" | "untrack" => { let f = self.called(mi, arg(0)?)?; self.returned(f, &Bind::new(), b, &[], d + 1).filter(|v| matches!(v, V::Target | V::List)) } _ => None };
        }
        if let Some(f) = self.called(mi, callee) {
            if c.arguments.iter().any(|a| a.is_spread()) { return None; }
            let binds = self.bind_call(mi, c, f, b, d + 1)?;
            return self.returned(f, &binds, b, &[], d + 1);
        }
        let v = self.value(mi, callee, b, d + 1)?;
        self.call_value(&v)
    }
    fn call_value(&self, v: &V) -> Option<V> {
        match v { V::Target | V::List => Some(v.clone()), V::Ty(t) => self.parts_of(*t, &|t| match t { Ty::Fn { ret, .. } => Some(*ret), _ => None }), V::Str(_) => None }
    }
    /// What every return of a function answers, at a path into it.
    fn returned(&self, f: FnAt, own: &Bind, b: &Bind, path: &[Step], d: u32) -> Option<V> {
        if d > 24 { return None; }
        let (_, body, gen, isasync) = self.parts(f)?;
        if gen || isasync { return None; }
        let mut all = b.clone();
        all.extend(own.iter().map(|(k, v)| (*k, v.clone())));
        match body {
            Err(e) => self.project(f.module, e, path, &all, d + 1),
            Ok(_) => {
                let m = self.m(f.module);
                let mut out = Some(V::Target);
                let mut first = true;
                for n in m.nodes.iter() {
                    let AstKind::ReturnStatement(r) = n.kind() else { continue };
                    if m.function_of(n.id()) != Some(f.node) { continue; }
                    let Some(e) = &r.argument else { continue };
                    let v = self.project(f.module, e, path, &all, d + 1)?;
                    out = Some(if first { v } else { join(out?, v)? });
                    first = false;
                }
                out
            }
        }
    }
    /// What is at a path into an expression.
    fn project(&self, mi: usize, e: &'m Expression<'a>, path: &[Step], b: &Bind, d: u32) -> Option<V> {
        let Some((s, rest)) = path.split_first() else { return self.value(mi, e, b, d + 1) };
        match (unwrap(e), s) {
            (Expression::ObjectExpression(o), Step::Key(k)) => {
                let mut hit = None;
                for p in &o.properties { let ObjectPropertyKind::ObjectProperty(p) = p else { return None }; let n = static_key(&p.key, p.computed)?; if n == *k { if hit.is_some() || p.kind != PropertyKind::Init { return None; } hit = Some(&p.value); } }
                hit.map_or(Some(V::Target), |x| self.project(mi, x, rest, b, d + 1))
            }
            (Expression::ArrayExpression(a), Step::At(i)) => { if a.elements.iter().any(|x| x.is_spread()) { return None; } match a.elements.get(*i) { None => Some(V::Target), Some(x) => self.project(mi, x.as_expression()?, rest, b, d + 1) } }
            (Expression::Identifier(i), _) if self.m(mi).symbol(i).is_none() && i.name == "undefined" => Some(V::Target),
            _ => { let v = self.value(mi, e, b, d + 1); self.walk(v, path) }
        }
    }
    /// `x instanceof HTMLElement`, in whose arm the name stands.
    fn seen_as_element(&self, mi: usize, i: &IdentifierReference<'a>, s: SymbolId) -> bool {
        let m = self.m(mi);
        let test = |e: &Expression<'a>| matches!(unwrap(e), Expression::BinaryExpression(x) if x.operator == BinaryOperator::Instanceof && matches!(unwrap(&x.left), Expression::Identifier(l) if m.symbol(l) == Some(s)) && matches!(unwrap(&x.right), Expression::Identifier(g) if m.symbol(g).is_none() && (ELEMENTS.contains(&g.name.as_str()) || (g.name.starts_with("HTML") && g.name.ends_with("Element")))));
        for a in m.nodes.ancestor_ids(i.node_id.get()) {
            match m.nodes.kind(a) {
                AstKind::IfStatement(x) if x.consequent.span().contains_inclusive(i.span) && test(&x.test) => return true,
                AstKind::ConditionalExpression(x) if x.consequent.span().contains_inclusive(i.span) && test(&x.test) => return true,
                AstKind::Function(_) | AstKind::ArrowFunctionExpression(_) => return false,
                _ => {}
            }
        }
        false
    }
    /// What a name the module knows stands for.
    fn named(&self, mi: usize, s: SymbolId, b: &Bind, d: u32) -> Option<V> {
        let v = self.named_as(mi, s, b, d)?;
        // what was read into the name may have been changed through it
        if matches!(v, V::List | V::Ty(_)) && (self.m(mi).handed_out.contains(&s) || !self.kept(mi, s, 0)) { return None; }
        Some(v)
    }
    /// Whether a name's list or record is only read, wherever the name goes.
    fn kept(&self, mi: usize, s: SymbolId, d: u32) -> bool {
        self.steps.set(self.steps.get() + 1);
        if d > 8 || self.steps.get() > 4000 { return false; }
        let m = self.m(mi);
        m.known_symbol(s) && m.references(s).iter().all(|r| {
            let mut o = m.outer(*r);
            while let AstKind::ChainExpression(_) = m.nodes.parent_kind(o) { o = m.outer(m.nodes.parent_id(o)); }
            let span = m.nodes.kind(o).span();
            let pid = m.nodes.parent_id(o);
            match m.nodes.kind(pid) {
                AstKind::StaticMemberExpression(p) => !m.is_written(pid) && !matches!(p.property.name.as_str(), "push" | "unshift" | "splice" | "fill" | "copyWithin" | "bind" | "call" | "apply" | "__proto__" | "constructor" | "prototype" | "__defineGetter__"),
                AstKind::ComputedMemberExpression(p) => !m.is_written(pid) && (p.object.span() != span || matches!(unwrap(&p.expression), Expression::NumericLiteral(_))),
                AstKind::VariableDeclarator(v) => { let mut ok = true; super::graph::each_binding(&v.id, &mut |x| ok &= x.symbol_id.get().is_some_and(|x| self.kept(mi, x, d + 1))); ok }
                AstKind::ForOfStatement(f) => f.right.span() == span,
                AstKind::CallExpression(c) if c.callee.span() == span => true,
                AstKind::CallExpression(c) => {
                    let Some(i) = c.arguments.iter().position(|a| a.span() == span) else { return false };
                    match unwrap(&c.callee) {
                        Expression::StaticMemberExpression(p) => {
                            let n = p.property.name.as_str();
                            if let Expression::Identifier(g) = unwrap(&p.object) { if m.is_global(g, "Array") && matches!(n, "isArray" | "from") { return true; } if m.is_global(g, "Object") && matches!(n, "keys" | "values" | "entries") { return true; } }
                            // (`el.removeEventListener.bind(el, …)`)
                            n == "bind" && matches!(unwrap(&p.object), Expression::StaticMemberExpression(q) if matches!(q.property.name.as_str(), "addEventListener" | "removeEventListener"))
                        }
                        e => self.called(mi, e).is_some_and(|g| {
                            let Some((params, ..)) = self.parts(g) else { return false };
                            if params.rest.is_some() || uses_args(self.m(g.module), g.node) || c.arguments.iter().take(i).any(|a| a.is_spread()) { return false; }
                            let mut ok = true;
                            if let Some(p) = params.items.get(i) { super::graph::each_binding(&p.pattern, &mut |x| ok &= x.symbol_id.get().is_some_and(|x| self.kept(g.module, x, d + 1))); }
                            ok
                        }) || self.object_reader(mi, e),
                    }
                }
                AstKind::ReturnStatement(_) | AstKind::ArrowFunctionExpression(_) | AstKind::ConditionalExpression(_) | AstKind::LogicalExpression(_) | AstKind::IfStatement(_) | AstKind::UnaryExpression(_) | AstKind::BinaryExpression(_) | AstKind::ArrayExpression(_) | AstKind::ExpressionStatement(_) | AstKind::TemplateLiteral(_) => true,
                _ => false,
            }
        })
    }
    /// `const entries = Object.entries`, `keys`, `values`.
    pub fn object_reader(&self, mi: usize, e: &Expression<'a>) -> bool {
        let is = |mi: usize, e: &Expression<'a>| matches!(unwrap(e), Expression::StaticMemberExpression(p) if matches!(p.property.name.as_str(), "keys" | "values" | "entries") && matches!(unwrap(&p.object), Expression::Identifier(g) if self.m(mi).is_global(g, "Object")));
        if is(mi, e) { return true; }
        let Expression::Identifier(i) = unwrap(e) else { return false };
        let Some(Origin::Symbol(m2, s2)) = self.name(mi, i) else { return false };
        let m2_ = self.m(m2);
        m2_.known_symbol(s2) && matches!(m2_.nodes.kind(m2_.scoping.symbol_declaration(s2)), AstKind::VariableDeclarator(v) if matches!(v.id, BindingPattern::BindingIdentifier(_)) && v.init.as_ref().is_some_and(|i| is(m2, i)))
    }
    fn named_as(&self, mi: usize, s: SymbolId, b: &Bind, d: u32) -> Option<V> {
        if let Some(v) = b.get(&(mi, s)) { return v.clone(); }
        let m = self.m(mi);
        if m.imports.contains_key(&s) { return match self.mods.symbol(self.h, self.hi, mi, s, &mut vec![]) { Origin::Symbol(m2, s2) if self.m(m2).known_symbol(s2) && m2 != mi => self.named(m2, s2, b, d + 1), _ => None }; }
        let decl = m.scoping.symbol_declaration(s);
        match m.nodes.kind(decl) {
            AstKind::VariableDeclarator(v) => {
                let (path, defaults) = path_to(&v.id, s)?;
                let base = match &v.init {
                    Some(e) => self.project(mi, e, &path, b, d + 1),
                    None => {
                        let up = m.nodes.parent_id(decl);
                        match m.nodes.parent_kind(up) {
                            AstKind::ForOfStatement(f) if !f.r#await && f.left.span() == m.nodes.kind(up).span() => { let v = self.value(mi, &f.right, b, d + 1)?; let item = self.step(&v, &Step::At(0)); if matches!(&v, V::Ty(t) if matches!(self.types.0[*t as usize], Ty::Tuple(_))) { return None; } self.walk(item, &path) }
                            _ => None,
                        }
                    }
                };
                self.with_defaults(mi, base, &defaults, b, d)
            }
            AstKind::FormalParameter(_) | AstKind::FormalParameters(_) => self.parameter(mi, s, decl, b, d),
            _ => None,
        }
    }
    fn with_defaults(&self, mi: usize, v: Option<V>, defaults: &[&'m Expression<'a>], b: &Bind, d: u32) -> Option<V> {
        let mut v = v?;
        for e in defaults {
            // (an empty object holds nothing)
            if matches!(unwrap(e), Expression::ObjectExpression(o) if o.properties.is_empty()) { continue; }
            v = join(v, self.value(mi, e, b, d + 1)?)?;
        }
        Some(v)
    }
    /// A parameter of a function every call of which is seen: called by name, an effect's second function, a list's method's.
    fn parameter(&self, mi: usize, s: SymbolId, decl: NodeId, b: &Bind, d: u32) -> Option<V> {
        let m = self.m(mi);
        let f = m.function_of(decl)?;
        let (params, _, gen, _) = self.parts(FnAt { module: mi, node: f })?;
        if gen || uses_args(m, f) { return None; }
        let (index, p) = params.items.iter().enumerate().find(|(_, p)| path_to(&p.pattern, s).is_some())?;
        let (path, mut defaults) = path_to(&p.pattern, s)?;
        if let Some(i) = &p.initializer { defaults.push(i); }
        let uses: Vec<NodeId> = match m.nodes.kind(f) {
            AstKind::Function(x) if x.is_declaration() => { let n = x.id.as_ref()?.symbol_id.get().filter(|n| m.known_symbol(*n) && !m.handed_out.contains(n))?; m.references(n) }
            AstKind::Function(x) if x.id.is_some() => return None,
            _ => {
                let o = m.outer(f);
                match m.nodes.parent_kind(o) {
                    AstKind::VariableDeclarator(v) => { let BindingPattern::BindingIdentifier(n) = &v.id else { return None }; let n = n.symbol_id.get().filter(|n| m.known_symbol(*n) && !m.handed_out.contains(n))?; m.references(n) }
                    _ => vec![f],
                }
            }
        };
        let mut out: Option<V> = None;
        for u in uses {
            let o = m.outer(u);
            let span = m.nodes.kind(o).span();
            let AstKind::CallExpression(c) = m.nodes.parent_kind(o) else { return None };
            let v = if c.callee.span() == span {
                if c.arguments.iter().any(|a| a.is_spread()) { return None; }
                match c.arguments.get(index) { None => V::Target, Some(a) => self.project(mi, a.as_expression()?, &path, b, d + 1)? }
            } else {
                let at = c.arguments.iter().position(|a| a.span() == span)?;
                if c.arguments.iter().take(at).any(|a| a.is_spread()) { return None; }
                if let Some(n) = self.solid(mi, &c.callee) {
                    if !(matches!(n.as_str(), "createEffect" | "createRenderEffect") && at == 1 && index == 0) { return None; }
                    let k = self.called(mi, c.arguments[0].as_expression()?)?;
                    self.returned(k, &Bind::new(), b, &path, d + 1)?
                } else {
                    let Expression::StaticMemberExpression(p) = unwrap(&c.callee) else { return None };
                    if at != 0 || index != 0 || !matches!(p.property.name.as_str(), "forEach" | "map" | "filter" | "some" | "every" | "find" | "flatMap") { return None; }
                    let v = self.value(mi, &p.object, b, d + 1)?;
                    if matches!(&v, V::Ty(t) if matches!(self.types.0[*t as usize], Ty::Tuple(_))) { return None; }
                    let item = self.step(&v, &Step::At(0));
                    self.walk(item, &path)?
                }
            };
            out = Some(match out { None => v, Some(o) => join(o, v)? });
        }
        self.with_defaults(mi, out, &defaults, b, d)
    }
    /// What a call gives each name of the parameters of the function it calls.
    pub fn bind_call(&self, mi: usize, c: &'m CallExpression<'a>, g: FnAt, b: &Bind, d: u32) -> Option<Bind> {
        let (params, ..) = self.parts(g)?;
        let mut out = Bind::new();
        let spread = c.arguments.iter().position(|a| a.is_spread());
        for (i, p) in params.items.iter().enumerate() {
            let arg = if spread.is_some_and(|s| s <= i) { None } else { Some(c.arguments.get(i).and_then(|a| a.as_expression())) };
            super::graph::each_binding(&p.pattern, &mut |x| {
                let Some(s) = x.symbol_id.get() else { return };
                let v = path_to(&p.pattern, s).and_then(|(path, mut defaults)| {
                    if let Some(i) = &p.initializer { defaults.push(i); }
                    let v = match arg? { None => Some(V::Target), Some(e) => self.project(mi, e, &path, b, d + 1) };
                    self.with_defaults(g.module, v, &defaults, b, d + 1)
                });
                out.insert((g.module, s), v);
            });
        }
        if let Some(r) = &params.rest { super::graph::each_binding(&r.rest.argument, &mut |x| { if let Some(s) = x.symbol_id.get() { out.insert((g.module, s), None); } }); }
        Some(out)
    }
    /// What the row says each name of an export's parameters is.
    pub fn bind_row(&self, f: FnAt, types: &[u32]) -> Bind {
        let mut out = Bind::new();
        let Some((params, ..)) = self.parts(f) else { return out };
        self.steps.set(0);
        for (i, p) in params.items.iter().enumerate() {
            super::graph::each_binding(&p.pattern, &mut |x| {
                let Some(s) = x.symbol_id.get() else { return };
                let v = path_to(&p.pattern, s).and_then(|(path, mut defaults)| {
                    if let Some(i) = &p.initializer { defaults.push(i); }
                    let v = self.typed(*types.get(i)?);
                    self.with_defaults(f.module, self.walk(v, &path), &defaults, &Bind::new(), 0)
                });
                out.insert((f.module, s), v);
            });
        }
        if let Some(r) = &params.rest { super::graph::each_binding(&r.rest.argument, &mut |x| { if let Some(s) = x.symbol_id.get() { out.insert((f.module, s), None); } }); }
        out
    }
}

fn uses_args(m: &Module, f: NodeId) -> bool {
    let AstKind::Function(_) = m.nodes.kind(f) else { return false };
    let span = m.nodes.kind(f).span();
    m.nodes.iter().any(|n| matches!(n.kind(), AstKind::IdentifierReference(i) if i.name == "arguments" && m.symbol(i).is_none() && span.contains_inclusive(i.span)))
}
/// Where a pattern takes a name from, and the defaults on the way.
pub fn path_to<'b, 'a>(p: &'b BindingPattern<'a>, s: SymbolId) -> Option<(Vec<Step>, Vec<&'b Expression<'a>>)> {
    match p {
        BindingPattern::BindingIdentifier(b) => (b.symbol_id.get() == Some(s)).then(|| (vec![], vec![])),
        BindingPattern::AssignmentPattern(a) => { let (path, mut d) = path_to(&a.left, s)?; d.push(&a.right); Some((path, d)) }
        BindingPattern::ObjectPattern(o) => o.properties.iter().find_map(|x| { let (mut path, d) = path_to(&x.value, s)?; path.insert(0, Step::Key(static_key(&x.key, x.computed)?)); Some((path, d)) }),
        BindingPattern::ArrayPattern(a) => a.elements.iter().enumerate().find_map(|(i, x)| { let (mut path, d) = path_to(x.as_ref()?, s)?; path.insert(0, Step::At(i)); Some((path, d)) }),
    }
}
