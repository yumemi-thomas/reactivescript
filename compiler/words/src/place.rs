//! What the place of a call shows (DESIGN.md): `instantiates`, `uses`, `provides`, `handler`, `draft`, and the `ref` of a
//! part. Each is a list of the forms that show it; a form that is not listed shows nothing.
use super::constant::{static_key, unwrap};
use super::eval::{FnAt, Types};
use super::graph::{Module, Modules, Origin};
use super::resolve::Host;
use super::target::Bind;
use std::cell::{Cell, RefCell};
use oxc_ast::{ast::*, AstKind};
use oxc_semantic::NodeId;
use oxc_span::{GetSpan, Span};
use oxc_syntax::symbol::SymbolId;
use std::collections::BTreeSet;

/// What Solid's development build reports, or throws on, where there is no owner (run 2026-11-26, solid-js 2.0.3).
const NEEDS_OWNER: &[&str] = &["createEffect", "createRenderEffect", "createTrackedEffect", "onCleanup", "createErrorBoundary", "createLoadingBoundary", "useContext"];

#[derive(Clone, Debug)]
pub struct Hit { pub api: String, pub module: usize, pub at: Span, pub arg: Option<(usize, SymbolId)>, /** the call's value, where the next statements throw on one that is null */ pub guarded: bool }
#[derive(Clone, Debug)]
pub struct Why { pub why: String, pub module: usize, pub at: u32 }
fn why(m: usize, at: Span, w: impl Into<String>) -> Why { Why { why: w.into(), module: m, at: at.start } }

pub struct Place<'m, 'a, 'r> {
    pub mods: &'m Modules<'a, 'r>, pub h: Host, pub hi: usize, pub entry: usize, pub types: &'m Types,
    pub steps: Cell<u32>,
    pub spent: Cell<u32>,
    /// Where what the import loads sends events (dispatch.rs), once asked.
    pub sent: RefCell<Option<Vec<super::dispatch::Place0>>>,
    #[allow(clippy::type_complexity)]
    pub patched: RefCell<Option<Option<(usize, Span, String)>>>,
}

type Body<'m, 'a> = Result<&'m [Statement<'a>], &'m Expression<'a>>;

impl<'m, 'a, 'r> Place<'m, 'a, 'r> {
    pub fn new(mods: &'m Modules<'a, 'r>, h: Host, hi: usize, entry: usize, types: &'m Types) -> Self { Place { mods, h, hi, entry, types, steps: Cell::new(0), spent: Cell::new(0), sent: RefCell::new(None), patched: RefCell::new(None) } }
    pub fn m(&self, mi: usize) -> &'m Module<'a> { self.mods.get(mi) }
    pub fn line(&self, m: usize, at: u32) -> (String, usize) { let x = self.m(m); (x.path.clone(), x.line(at)) }

    /// The function an export is: one written out under a name nothing writes.
    pub fn function(&self, o: &Origin<'a>) -> Option<FnAt> {
        match o {
            Origin::Symbol(mi, s) => self.symbol_function(*mi, *s),
            Origin::Default(mi, d) => {
                let m = self.m(*mi);
                if m.banned.is_some() { return None; }
                let sc = match d { ExportDefaultDeclarationKind::FunctionDeclaration(f) => f.scope_id.get(), ExportDefaultDeclarationKind::FunctionExpression(f) => f.scope_id.get(), ExportDefaultDeclarationKind::ArrowFunctionExpression(f) => f.scope_id.get(), _ => None }?;
                Some(FnAt { module: *mi, node: m.scoping.get_node_id(sc) })
            }
            _ => None,
        }
    }
    fn symbol_function(&self, mi: usize, s: SymbolId) -> Option<FnAt> {
        let m = self.m(mi);
        if m.banned.is_some() || !m.known_symbol(s) { return None; }
        let d = m.scoping.symbol_declaration(s);
        match m.nodes.kind(d) {
            AstKind::Function(f) if f.body.is_some() => Some(FnAt { module: mi, node: d }),
            AstKind::VariableDeclarator(v) if matches!(v.id, BindingPattern::BindingIdentifier(_)) => {
                // (a `var` or a `let` read before its value is undefined, and a call of it the engine's own error)
                let node = self.literal(mi, v.init.as_ref()?)?;
                Some(FnAt { module: mi, node })
            }
            _ => None,
        }
    }
    fn literal(&self, mi: usize, e: &Expression) -> Option<NodeId> {
        let sc = match unwrap(e) { Expression::ArrowFunctionExpression(f) => f.scope_id.get(), Expression::FunctionExpression(f) => f.scope_id.get(), _ => None }?;
        Some(self.m(mi).scoping.get_node_id(sc))
    }
    /// What an identifier is, past imports.
    pub fn name(&self, mi: usize, i: &IdentifierReference) -> Option<Origin<'a>> {
        let m = self.m(mi);
        if m.banned.is_some() { return None; }
        let s = m.symbol(i)?;
        Some(self.mods.symbol(self.h, self.hi, mi, s, &mut vec![]))
    }
    /// The Solid API a callee is.
    pub fn solid(&self, mi: usize, e: &Expression<'a>) -> Option<String> {
        match unwrap(e) {
            Expression::Identifier(i) => match self.name(mi, i)? { Origin::Solid(n) => Some(n.to_string()), _ => None },
            Expression::StaticMemberExpression(p) if !p.optional => match unwrap(&p.object) { Expression::Identifier(i) => match self.name(mi, i)? { Origin::SolidNs => Some(p.property.name.to_string()), _ => None }, _ => None },
            _ => None,
        }
    }
    pub fn parts(&self, f: FnAt) -> Option<(&'m FormalParameters<'a>, Body<'m, 'a>, bool, bool)> {
        match self.m(f.module).nodes.kind(f.node) {
            AstKind::Function(x) => Some((&x.params, Ok(&x.body.as_ref()?.statements[..]), x.generator, x.r#async)),
            AstKind::ArrowFunctionExpression(x) => Some((&x.params, match &x.body { ArrowFunctionBody::FunctionBody(b) => Ok(&b.statements[..]), b => Err(b.to_expression()) }, false, x.r#async)),
            _ => None,
        }
    }
    pub fn called(&self, mi: usize, e: &Expression<'a>) -> Option<FnAt> {
        match unwrap(e) {
            Expression::Identifier(i) => match self.name(mi, i)? { Origin::Symbol(m, s) => self.symbol_function(m, s), o @ Origin::Default(..) => self.function(&o), _ => None },
            e => self.literal(mi, e).map(|node| FnAt { module: mi, node }),
        }
    }

    // ---- what every path evaluates ----
    /// The calls of Solid's that no path that returns goes without, in the order they are made.
    pub fn must(&self, f: FnAt, depth: u32, out: &mut Vec<Hit>) {
        let Some((_, body, gen, _)) = self.parts(f) else { return };
        if gen || depth > 8 || self.m(f.module).banned.is_some() { return; }
        match body { Err(e) => { self.must_expr(f.module, e, depth, out); } Ok(b) => { self.must_statements(f.module, b, depth, out); } }
    }
    /// Whether what is after them is evaluated too.
    fn must_statements(&self, mi: usize, b: &'m [Statement<'a>], depth: u32, out: &mut Vec<Hit>) -> bool {
        for (n, s) in b.iter().enumerate() {
            let from = out.len();
            let go = self.must_statement(mi, s, depth, out);
            // `const c = useContext(C)`, and a throw on one that is null before any path returns
            if let Statement::VariableDeclaration(d) = s {
                if let [x] = &d.declarations[..] { if let (BindingPattern::BindingIdentifier(id), Some(init)) = (&x.id, &x.init) {
                    if let (Some(sym), Expression::CallExpression(c)) = (id.symbol_id.get(), unwrap(init)) {
                        if self.m(mi).known_symbol(sym) && out[from..].iter().any(|h| h.at == c.span && h.module == mi) && self.guard(mi, sym, &b[n + 1..]) { for h in &mut out[from..] { if h.at == c.span && h.module == mi { h.guarded = true; } } }
                    }
                } }
            }
            if !go { return false; }
        }
        true
    }
    fn guard(&self, mi: usize, sym: SymbolId, b: &[Statement<'a>]) -> bool {
        for s in b {
            if let Statement::IfStatement(i) = s {
                if self.nullish_test(mi, sym, &i.test) && i.alternate.is_none() && throws(&i.consequent) { return true; }
            }
            if leaves(s) { return false; }
        }
        false
    }
    fn nullish_test(&self, mi: usize, sym: SymbolId, e: &Expression<'a>) -> bool {
        let is = |e: &Expression<'a>| matches!(unwrap(e), Expression::Identifier(i) if self.m(mi).symbol(i) == Some(sym));
        match unwrap(e) {
            Expression::UnaryExpression(u) => u.operator == UnaryOperator::LogicalNot && is(&u.argument),
            Expression::BinaryExpression(b) => is(&b.left) && matches!(unwrap(&b.right), Expression::NullLiteral(_)) && matches!(b.operator, BinaryOperator::Equality | BinaryOperator::StrictEquality),
            _ => false,
        }
    }
    fn must_statement(&self, mi: usize, s: &'m Statement<'a>, depth: u32, out: &mut Vec<Hit>) -> bool {
        match s {
            Statement::ExpressionStatement(x) => self.must_expr(mi, &x.expression, depth, out),
            Statement::VariableDeclaration(d) => { for x in &d.declarations { if let Some(e) = &x.init { if !self.must_expr(mi, e, depth, out) { return false; } } if waits_in(x.id.span(), self.m(mi)) { return false; } } true }
            Statement::ReturnStatement(r) => { if let Some(e) = &r.argument { self.must_expr(mi, e, depth, out); } false }
            Statement::ThrowStatement(_) => false,
            Statement::BlockStatement(b) => self.must_statements(mi, &b.body, depth, out),
            Statement::IfStatement(i) => {
                if !self.must_expr(mi, &i.test, depth, out) { return false; }
                match self.known_test(mi, &i.test) {
                    Some(true) => self.must_statement(mi, &i.consequent, depth, out),
                    Some(false) => i.alternate.as_ref().is_none_or(|a| self.must_statement(mi, a, depth, out)),
                    None => !leaves(s) && !waits_in(s.span(), self.m(mi)),
                }
            }
            Statement::ForStatement(_) | Statement::ForInStatement(_) | Statement::ForOfStatement(_) | Statement::WhileStatement(_) | Statement::DoWhileStatement(_) | Statement::SwitchStatement(_) | Statement::TryStatement(_) | Statement::LabeledStatement(_) => !leaves(s) && !waits_in(s.span(), self.m(mi)),
            Statement::FunctionDeclaration(_) | Statement::EmptyStatement(_) | Statement::TSTypeAliasDeclaration(_) | Statement::TSInterfaceDeclaration(_) | Statement::DebuggerStatement(_) => true,
            _ => false,
        }
    }
    /// A test whose answer this host fixes: `isServer`, `typeof window`.
    fn known_test(&self, mi: usize, e: &Expression<'a>) -> Option<bool> {
        match unwrap(e) {
            Expression::Identifier(i) => match self.name(mi, i)? { Origin::Solid("isServer") => Some(!self.h.browser), _ => None },
            Expression::UnaryExpression(u) if u.operator == UnaryOperator::LogicalNot => self.known_test(mi, &u.argument).map(|b| !b),
            _ => None,
        }
    }
    /// Whether what is after the expression is evaluated in the same turn.
    fn must_expr(&self, mi: usize, e: &'m Expression<'a>, depth: u32, out: &mut Vec<Hit>) -> bool {
        let m = self.m(mi);
        let go = |e: &'m Expression<'a>, out: &mut Vec<Hit>| self.must_expr(mi, e, depth, out);
        match unwrap(e) {
            Expression::CallExpression(c) => {
                if c.optional { return go(&c.callee, out); }
                let callee = unwrap(&c.callee);
                match callee {
                    Expression::StaticMemberExpression(p) => { if !go(&p.object, out) { return false; } if p.optional { return true; } }
                    Expression::ComputedMemberExpression(p) => { if !go(&p.object, out) { return false; } if p.optional { return true; } if !go(&p.expression, out) { return false; } }
                    Expression::CallExpression(_) | Expression::ConditionalExpression(_) | Expression::LogicalExpression(_) | Expression::SequenceExpression(_) | Expression::AwaitExpression(_) => if !go(callee, out) { return false; },
                    _ => {}
                }
                for a in &c.arguments { let e = match a { Argument::SpreadElement(s) => &s.argument, a => a.to_expression() }; if !go(e, out) { return false; } }
                if let Some(n) = self.solid(mi, callee) {
                    if n == "untrack" { if let Some(f) = c.arguments.first().and_then(|a| a.as_expression()).and_then(|a| self.called(mi, a)) { if !self.waits(f) { self.must(f, depth + 1, out); } } }
                    let arg = c.arguments.first().and_then(|a| a.as_expression()).and_then(|a| match unwrap(a) { Expression::Identifier(i) => match self.name(mi, i) { Some(Origin::Symbol(m, s)) => Some((m, s)), _ => None }, _ => None });
                    out.push(Hit { api: n, module: mi, at: c.span, arg, guarded: false });
                } else if let Some(f) = self.called(mi, callee) {
                    // (its own code up to its first `await` runs now)
                    self.must(f, depth + 1, out);
                    let _ = m;
                }
                true
            }
            Expression::NewExpression(n) => { for a in &n.arguments { let e = match a { Argument::SpreadElement(s) => &s.argument, a => a.to_expression() }; if !go(e, out) { return false; } } true }
            Expression::AwaitExpression(a) => { go(&a.argument, out); false }
            Expression::YieldExpression(_) => false,
            Expression::ArrayExpression(a) => { for x in &a.elements { let e = match x { ArrayExpressionElement::SpreadElement(s) => &s.argument, ArrayExpressionElement::Elision(_) => continue, x => x.to_expression() }; if !go(e, out) { return false; } } true }
            Expression::ObjectExpression(o) => { for p in &o.properties { match p { ObjectPropertyKind::SpreadProperty(s) => if !go(&s.argument, out) { return false; }, ObjectPropertyKind::ObjectProperty(p) => { if p.computed && !go(p.key.to_expression(), out) { return false; } if p.kind == PropertyKind::Init && !go(&p.value, out) { return false; } } } } true }
            Expression::AssignmentExpression(a) => if a.operator == AssignmentOperator::Assign { go(&a.right, out) } else { !waits_in(a.span, m) },
            Expression::BinaryExpression(b) => go(&b.left, out) && go(&b.right, out),
            Expression::UnaryExpression(u) => go(&u.argument, out),
            Expression::SequenceExpression(s) => { for x in &s.expressions { if !go(x, out) { return false; } } true }
            Expression::TemplateLiteral(t) => { for x in &t.expressions { if !go(x, out) { return false; } } true }
            Expression::LogicalExpression(l) => go(&l.left, out) && !waits_in(l.right.span(), m),
            Expression::ConditionalExpression(c) => {
                if !go(&c.test, out) { return false; }
                match self.known_test(mi, &c.test) { Some(b) => go(if b { &c.consequent } else { &c.alternate }, out), None => !waits_in(c.span, m) }
            }
            Expression::StaticMemberExpression(p) => go(&p.object, out),
            Expression::ComputedMemberExpression(p) => go(&p.object, out) && (p.optional || go(&p.expression, out)),
            Expression::ChainExpression(c) => !waits_in(c.span, m),
            e => !waits_in(e.span(), m),
        }
    }
    fn waits(&self, f: FnAt) -> bool { self.parts(f).is_none_or(|(_, _, g, a)| g || a) }

    /// `instantiates`: in a browser's build, every path calls what needs an owner.
    pub fn needs_owner(&self, f: FnAt) -> Option<Hit> { let mut out = vec![]; self.must(f, 0, &mut out); out.into_iter().find(|h| NEEDS_OWNER.contains(&h.api.as_str())) }

    /// Whether a name is a context the module makes, and with what default: `Some(true)` — none; `Some(false)` — `null`.
    fn context(&self, mi: usize, s: SymbolId) -> Option<Option<bool>> {
        let m = self.m(mi);
        if !m.known_symbol(s) || !m.at_top(s) || m.banned.is_some() { return None; }
        let AstKind::VariableDeclarator(v) = m.nodes.kind(m.scoping.symbol_declaration(s)) else { return None };
        if !matches!(v.id, BindingPattern::BindingIdentifier(_)) { return None; }
        let Expression::CallExpression(c) = unwrap(v.init.as_ref()?) else { return None };
        if self.solid(mi, &c.callee)? != "createContext" { return None; }
        Some(match c.arguments.first() {
            None => Some(true),
            Some(a) => match a.as_expression().map(unwrap) { Some(Expression::Identifier(i)) if m.is_global(i, "undefined") => Some(true), Some(Expression::UnaryExpression(u)) if u.operator == UnaryOperator::Void => Some(true), Some(Expression::NullLiteral(_)) => Some(false), _ => None },
        })
    }
    /// `uses`: the contexts every call reads, where nothing answers without a provider.
    pub fn uses(&self, f: FnAt) -> Vec<(usize, SymbolId, Hit)> {
        let mut out = vec![];
        self.must(f, 0, &mut out);
        out.into_iter().filter(|h| h.api == "useContext").filter_map(|h| { let (m, s) = h.arg?; match self.context(m, s)? { Some(true) => Some((m, s, h)), Some(false) if h.guarded => Some((m, s, h)), _ => None } }).collect()
    }

    // ---- provides ----
    /// The contexts a component provides around every view it is given (`plain`: the props that hold none).
    pub fn provides(&self, f: FnAt, plain: &BTreeSet<String>) -> Result<Vec<(usize, SymbolId)>, Why> {
        let mi = f.module;
        let m = self.m(mi);
        let at0 = m.nodes.kind(f.node).span();
        let no = |at: Span, w: &str| Err(why(mi, at, w));
        let Some((params, body, gen, isasync)) = self.parts(f) else { return no(at0, "it is not read") };
        if gen || isasync || m.banned.is_some() { return no(at0, "it waits, or is a generator"); }
        let Some(p) = params.items.first() else { return no(at0, "it takes no props") };
        let (BindingPattern::BindingIdentifier(b), None, 1, None) = (&p.pattern, &p.initializer, params.items.len(), &params.rest) else { return no(p.span, "its props are taken apart") };
        let Some(props) = b.symbol_id.get().filter(|s| m.known_symbol(*s)) else { return no(p.span, "its props' name is written again") };
        if uses_arguments(m, f.node) { return no(p.span, "it uses `arguments`"); }
        let root = match body {
            Err(e) => e,
            Ok(b) => {
                let Some((Statement::ReturnStatement(r), before)) = b.split_last() else { return no(at0, "its last statement is no return") };
                for s in before { if leaves(s) || !matches!(s, Statement::VariableDeclaration(_) | Statement::ExpressionStatement(_) | Statement::FunctionDeclaration(_) | Statement::EmptyStatement(_)) { return no(s.span(), "a statement before the return that may leave it"); } }
                match &r.argument { Some(e) => e, None => return no(r.span, "it answers nothing") }
            }
        };
        let mut v = View { provided: vec![], values: vec![], views: vec![] };
        if !self.provider(mi, root, props, &mut v) { return no(root.span(), "what it answers is no provider whose children are read"); }
        for r in m.references(props) {
            let o = m.outer(r);
            let (pid, span) = (m.nodes.parent_id(o), m.nodes.kind(o).span());
            if v.values.iter().any(|s| s.contains_inclusive(span)) || v.views.contains(&span) { continue; }
            match m.nodes.kind(pid) {
                AstKind::StaticMemberExpression(k) if k.object.span() == span && plain.contains(k.property.name.as_str()) && !m.is_written(pid) => {}
                _ => return no(span, "its props are used outside the provider"),
            }
        }
        if v.views.is_empty() { return no(root.span(), "nothing it is given is rendered beneath the provider"); }
        Ok(v.provided)
    }
    fn provider(&self, mi: usize, e: &'m Expression<'a>, props: SymbolId, v: &mut View) -> bool {
        let ctx = |e: &Expression<'a>| match unwrap(e) { Expression::Identifier(i) => match self.name(mi, i) { Some(Origin::Symbol(m, s)) if self.context(m, s).is_some() => Some((m, s)), _ => None }, _ => None };
        match unwrap(e) {
            Expression::CallExpression(c) => {
                if c.optional || c.arguments.len() != 2 || self.solid(mi, &c.callee).as_deref() != Some("createComponent") { return false; }
                let (Some(tag), Some(Expression::ObjectExpression(o))) = (c.arguments[0].as_expression(), c.arguments[1].as_expression().map(unwrap)) else { return false };
                let Some(x) = ctx(tag) else { return false };
                v.provided.push(x);
                let mut kids = false;
                for p in &o.properties {
                    let ObjectPropertyKind::ObjectProperty(p) = p else { return false };
                    match static_key(&p.key, p.computed).as_deref() {
                        Some("value") => v.values.push(p.span),
                        Some("children") if !kids => {
                            kids = true;
                            let ok = match (p.kind, unwrap(&p.value)) {
                                (PropertyKind::Get, Expression::FunctionExpression(f)) => match f.body.as_ref().map(|b| &b.statements[..]) { Some([Statement::ReturnStatement(r)]) => r.argument.as_ref().is_some_and(|e| self.view(mi, e, props, v)), _ => false },
                                _ => false,
                            };
                            if !ok { return false; }
                        }
                        _ => return false,
                    }
                }
                kids
            }
            Expression::JSXElement(x) => {
                let JSXElementName::IdentifierReference(i) = &x.opening_element.name else { return false };
                let Some(Origin::Symbol(m, s)) = self.name(mi, i) else { return false };
                if self.context(m, s).is_none() { return false; }
                v.provided.push((m, s));
                for a in &x.opening_element.attributes {
                    let JSXAttributeItem::Attribute(a) = a else { return false };
                    match &a.name { JSXAttributeName::Identifier(n) if n.name == "value" => v.values.push(a.span), _ => return false }
                }
                x.children.iter().all(|c| self.child(mi, c, props, v))
            }
            _ => false,
        }
    }
    fn child(&self, mi: usize, c: &'m JSXChild<'a>, props: SymbolId, v: &mut View) -> bool {
        match c {
            JSXChild::Text(_) => true,
            JSXChild::Element(x) => self.element(mi, x, props, v),
            JSXChild::Fragment(x) => x.children.iter().all(|c| self.child(mi, c, props, v)),
            JSXChild::ExpressionContainer(x) => match &x.expression { JSXExpression::EmptyExpression(_) => true, e => self.view(mi, e.to_expression(), props, v) },
            _ => false,
        }
    }
    fn element(&self, mi: usize, x: &'m JSXElement<'a>, props: SymbolId, v: &mut View) -> bool {
        match &x.opening_element.name {
            JSXElementName::Identifier(_) => x.opening_element.attributes.iter().all(|a| matches!(a, JSXAttributeItem::Attribute(_))) && x.children.iter().all(|c| self.child(mi, c, props, v)),
            _ => { let m = self.m(mi); let span = x.span; let uses = m.references(props).iter().any(|r| span.contains_inclusive(m.nodes.kind(*r).span())); if !uses { return true; }
                // a provider, nested
                let JSXElementName::IdentifierReference(i) = &x.opening_element.name else { return false };
                let Some(Origin::Symbol(m, s)) = self.name(mi, i) else { return false };
                if self.context(m, s).is_none() { return false; }
                v.provided.push((m, s));
                for a in &x.opening_element.attributes { let JSXAttributeItem::Attribute(a) = a else { return false }; match &a.name { JSXAttributeName::Identifier(n) if n.name == "value" => v.values.push(a.span), _ => return false } }
                x.children.iter().all(|c| self.child(mi, c, props, v)) }
        }
    }
    /// A view beneath the provider: a prop as it is, an element, a provider.
    fn view(&self, mi: usize, e: &'m Expression<'a>, props: SymbolId, v: &mut View) -> bool {
        match unwrap(e) {
            Expression::StaticMemberExpression(p) if !p.optional => match unwrap(&p.object) { Expression::Identifier(i) if self.m(mi).symbol(i) == Some(props) => { v.views.push(i.span); true } _ => false },
            Expression::JSXElement(x) => self.element(mi, x, props, v),
            Expression::JSXFragment(x) => x.children.iter().all(|c| self.child(mi, c, props, v)),
            Expression::StringLiteral(_) | Expression::NullLiteral(_) => true,
            Expression::CallExpression(_) => self.provider(mi, e, props, v),
            Expression::ArrayExpression(a) => a.elements.iter().all(|x| x.as_expression().is_some_and(|x| self.view(mi, x, props, v))),
            _ => false,
        }
    }

    // ---- handler ----
    /// Whether a callback is only ever called where Solid has no owner and no observer, or by the platform as a listener's is;
    /// once at least. (`params`: the types the row gives the parameters.)
    pub fn handler(&self, f: FnAt, index: usize, field: Option<&str>, params: &[u32]) -> Result<Vec<Why>, Why> {
        let (mi, m) = (f.module, self.m(f.module));
        let at0 = m.nodes.kind(f.node).span();
        let no = |at: Span, w: &str| Err(why(mi, at, w));
        if m.banned.is_some() { return no(at0, "the module is not read"); }
        let Some((fps, ..)) = self.parts(f) else { return no(at0, "it is not read") };
        let Some(p) = fps.items.get(index) else { return no(at0, "it has no such parameter") };
        if uses_arguments(m, f.node) { return no(p.span, "`arguments` may call it"); }
        let mut c = Calls { bind: self.bind_row(f, params), ..Calls::anyone() };
        c.root = f; c.any = false;
        self.spent.set(0);
        match (&p.pattern, field) {
            (BindingPattern::BindingIdentifier(b), None) => self.name_later(mi, b.symbol_id.get(), b.span, &mut c)?,
            (pat, Some(field)) => self.field_later(mi, pat, field, &mut c)?,
            _ => return no(p.span, "its parameter is taken apart"),
        }
        if c.later.is_empty() { return no(at0, "never called in the code that was read"); }
        self.unpatched(f)?;
        if c.listens { self.quiet(f, &c.events)?; }
        Ok(c.later)
    }
    /// A record that holds the callback under `field`.
    fn field_later(&self, mi: usize, pat: &'m BindingPattern<'a>, field: &str, c: &mut Calls) -> Result<(), Why> {
        let m = self.m(mi);
        match pat {
            BindingPattern::AssignmentPattern(a) => self.field_later(mi, &a.left, field, c),
            BindingPattern::ObjectPattern(o) => {
                if o.rest.is_some() { return Err(why(mi, o.span, "the rest of the record may hold it")); }
                for x in &o.properties {
                    match static_key(&x.key, x.computed) { None => return Err(why(mi, x.span, "a name that is computed")), Some(k) if k == field => match bound(&x.value) { Some(b) => self.name_later(mi, b.symbol_id.get(), b.span, c)?, None => return Err(why(mi, x.span, "it is taken apart")) }, Some(_) => {} }
                }
                Ok(())
            }
            BindingPattern::BindingIdentifier(b) => {
                let Some(s) = b.symbol_id.get().filter(|s| m.known_symbol(*s)) else { return Err(why(mi, b.span, "the record's name is written again")) };
                for r in m.references(s) { self.record_at(mi, r, field, c)?; }
                Ok(())
            }
            _ => Err(why(mi, pat.span(), "the record is taken apart in a way that is not followed")),
        }
    }
    /// One place the record stands at.
    fn record_at(&self, mi: usize, r: NodeId, field: &str, c: &mut Calls) -> Result<(), Why> {
        let m = self.m(mi);
        self.spend(mi, m.nodes.kind(r).span())?;
        let o = m.outer(r);
        let (pid, span) = (m.nodes.parent_id(o), m.nodes.kind(o).span());
        let bad = |w: &str| Err(why(mi, span, w));
        match m.nodes.kind(pid) {
            AstKind::StaticMemberExpression(k) if k.object.span() == span => { if m.is_written(pid) { return bad("the record is changed"); } if k.property.name == field { self.use_later(mi, pid, c)?; } Ok(()) }
            // (any of its fields: the callback may be it)
            AstKind::ComputedMemberExpression(k) if k.object.span() == span => { if m.is_written(pid) { return bad("the record is changed"); } self.use_later(mi, pid, c) }
            AstKind::VariableDeclarator(d) if d.init.as_ref().is_some_and(|i| i.span() == span) => self.field_later(mi, &d.id, field, c),
            AstKind::UnaryExpression(u) if matches!(u.operator, UnaryOperator::Typeof | UnaryOperator::LogicalNot) => Ok(()),
            AstKind::IfStatement(i) if i.test.span() == span => Ok(()),
            AstKind::ConditionalExpression(k) if k.test.span() == span => Ok(()),
            AstKind::LogicalExpression(l) if l.operator == LogicalOperator::And && l.left.span() == span => Ok(()),
            AstKind::BinaryExpression(b) if nullish(&b.left) || nullish(&b.right) => Ok(()),
            AstKind::CallExpression(k) if k.callee.span() != span => {
                let Some(i) = k.arguments.iter().position(|a| a.span() == span) else { return bad("a spread of the record") };
                if let Some(which) = self.reads_record(mi, &k.callee) {
                    if i != 0 || which == "keys" { return if i == 0 { Ok(()) } else { bad("the record it is in goes where it is not followed") }; }
                    return self.items_later(mi, pid, which == "entries", c);
                }
                if let Some(g) = self.called(mi, &k.callee) {
                    let Some((params, _, gen, _)) = self.parts(g) else { return bad("it is handed to a function that is not followed") };
                    if gen || uses_arguments(self.m(g.module), g.node) || k.arguments.iter().take(i).any(|a| a.is_spread()) { return bad("it is handed to a function that is not followed"); }
                    let Some(p) = params.items.get(i) else { return if params.rest.is_none() { Ok(()) } else { bad("it is handed to a function that is not followed") } };
                    return self.inside(mi, k, g, i, span, c, &mut |d| self.field_later(g.module, &p.pattern, field, d));
                }
                bad("the record it is in goes where it is not followed")
            }
            _ => bad("the record it is in goes where it is not followed"),
        }
    }
    fn reads_record(&self, mi: usize, e: &Expression<'a>) -> Option<&'static str> {
        if !self.object_reader(mi, e) { return None; }
        let name = match unwrap(e) {
            Expression::StaticMemberExpression(p) => p.property.name.as_str(),
            Expression::Identifier(i) => { let Some(Origin::Symbol(m2, s2)) = self.name(mi, i) else { return None }; let m2 = self.m(m2); let AstKind::VariableDeclarator(v) = m2.nodes.kind(m2.scoping.symbol_declaration(s2)) else { return None }; match v.init.as_ref().map(unwrap) { Some(Expression::StaticMemberExpression(p)) => p.property.name.as_str(), _ => return None } }
            _ => return None,
        };
        ["keys", "values", "entries"].into_iter().find(|n| *n == name)
    }
    /// What `Object.entries(record)` or `Object.values(record)` answers: a loop over it, or a list's method.
    fn items_later(&self, mi: usize, call: NodeId, entries: bool, c: &mut Calls) -> Result<(), Why> {
        let m = self.m(mi);
        let o = m.outer(call);
        let span = m.nodes.kind(o).span();
        let item = |p: &'m BindingPattern<'a>, c: &mut Calls| -> Result<(), Why> {
            let p = match (entries, p) {
                (false, p) => p,
                (true, BindingPattern::ArrayPattern(a)) if a.rest.is_none() => match a.elements.get(1) { Some(Some(x)) => x, _ => return Ok(()) },
                _ => return Err(why(mi, span, "an entry that is not taken apart")),
            };
            match bound(p) { Some(b) => self.name_later(mi, b.symbol_id.get(), b.span, c), None => Err(why(mi, span, "it is taken apart")) }
        };
        match m.nodes.parent_kind(o) {
            AstKind::ForOfStatement(f) if f.right.span() == span && !f.r#await => match &f.left {
                ForStatementLeft::VariableDeclaration(d) if d.declarations.len() == 1 => item(&d.declarations[0].id, c),
                _ => Err(why(mi, span, "a loop's name that is not its own")),
            },
            AstKind::StaticMemberExpression(p) if p.property.name == "forEach" && p.object.span() == span => {
                let q = m.nodes.parent_id(o);
                let AstKind::CallExpression(k) = m.nodes.parent_kind(q) else { return Err(why(mi, span, "it goes where it is not followed")) };
                let f = k.arguments.first().and_then(|a| a.as_expression()).filter(|_| k.callee.span() == m.nodes.kind(q).span()).and_then(|a| self.literal(mi, a));
                let Some((params, ..)) = f.and_then(|node| self.parts(FnAt { module: mi, node })) else { return Err(why(mi, span, "it goes where it is not followed")) };
                if params.items.len() != 1 || params.rest.is_some() || uses_arguments(m, f.unwrap()) { return Err(why(mi, span, "it goes where it is not followed")); }
                item(&params.items[0].pattern, c)
            }
            _ => Err(why(mi, span, "it goes where it is not followed")),
        }
    }
    fn spend(&self, mi: usize, at: Span) -> Result<(), Why> { self.spent.set(self.spent.get() + 1); if self.spent.get() > 60_000 { Err(why(mi, at, "it goes too far to be followed")) } else { Ok(()) } }
    fn name_later(&self, mi: usize, s: Option<SymbolId>, at: Span, c: &mut Calls) -> Result<(), Why> {
        let m = self.m(mi);
        self.spend(mi, at)?;
        let Some(s) = s.filter(|s| m.known_symbol(*s)) else { return Err(why(mi, at, "its name is written again")) };
        if m.handed_out.contains(&s) && (c.any || m.at_top(s)) { return Err(why(mi, at, "the module exports it")); }
        if !c.seen.insert((mi, s.index(), 0)) { return Ok(()); }
        for r in m.references(s) { self.use_later(mi, r, c)?; }
        Ok(())
    }
    /// One place the callback stands at.
    fn use_later(&self, mi: usize, id: NodeId, c: &mut Calls) -> Result<(), Why> {
        let m = self.m(mi);
        let at = m.outer(id);
        let span = m.nodes.kind(at).span();
        let bad = |w: &str| Err(why(mi, span, w));
        self.spend(mi, span)?;
        if m.is_written(at) { return bad("its name is written"); }
        let pid = m.nodes.parent_id(at);
        match m.nodes.kind(pid) {
            AstKind::CallExpression(k) if k.callee.span() == span => self.call_later(mi, pid, span, c),
            AstKind::CallExpression(k) => {
                let Some(i) = k.arguments.iter().position(|a| a.span() == span) else { return bad("a spread") };
                self.handed(mi, k, pid, i, span, c)
            }
            AstKind::NewExpression(k) => {
                let i = k.arguments.iter().position(|a| a.span() == span);
                if i == Some(0) && matches!(unwrap(&k.callee), Expression::Identifier(g) if ["ResizeObserver", "IntersectionObserver", "MutationObserver", "PerformanceObserver", "ReportingObserver"].iter().any(|n| m.is_global(g, n))) { c.later.push(why(mi, span, "given to an observer")); return Ok(()); }
                bad("it is handed to code that is not followed")
            }
            AstKind::ChainExpression(_) => self.use_later(mi, pid, c),
            // the same function, with arguments before
            AstKind::StaticMemberExpression(p) if p.object.span() == span && p.property.name == "bind" => {
                let o = m.outer(pid);
                let q = m.nodes.parent_id(o);
                match m.nodes.kind(q) { AstKind::CallExpression(k) if k.callee.span() == m.nodes.kind(o).span() => self.use_later(mi, q, c), _ => bad("it goes where it is not followed") }
            }
            AstKind::UnaryExpression(u) if matches!(u.operator, UnaryOperator::Typeof | UnaryOperator::LogicalNot) => Ok(()),
            AstKind::BinaryExpression(b) if matches!(b.operator, BinaryOperator::StrictEquality | BinaryOperator::StrictInequality | BinaryOperator::Equality | BinaryOperator::Inequality) && (nullish(&b.left) || nullish(&b.right) || b.operator == BinaryOperator::StrictEquality || b.operator == BinaryOperator::StrictInequality) => Ok(()),
            AstKind::IfStatement(i) if i.test.span() == span => Ok(()),
            AstKind::ConditionalExpression(k) if k.test.span() == span => Ok(()),
            AstKind::ConditionalExpression(_) => self.use_later(mi, pid, c),
            AstKind::LogicalExpression(l) if l.operator == LogicalOperator::And && l.left.span() == span => Ok(()),
            AstKind::LogicalExpression(_) => self.use_later(mi, pid, c),
            // `el.onclick = cb`
            AstKind::AssignmentExpression(a) if a.operator == AssignmentOperator::Assign && a.right.span() == span && matches!(m.nodes.parent_kind(m.outer(pid)), AstKind::ExpressionStatement(_)) => match &a.left {
                AssignmentTarget::StaticMemberExpression(p) if p.property.name.len() > 2 && p.property.name.starts_with("on") && p.property.name.as_str().bytes().all(|b| b.is_ascii_lowercase()) && self.target(mi, &p.object, &c.bind) => { let n = p.property.name[2..].to_string(); c.listen(Some(n)); c.later.push(why(mi, span, "an event handler of the platform's")); Ok(()) }
                _ => bad("it is kept where it is not followed"),
            },
            AstKind::VariableDeclarator(d) if d.init.as_ref().is_some_and(|i| i.span() == span) => match bound(&d.id) { Some(b) => self.name_later(mi, b.symbol_id.get(), span, c), None => bad("it is taken apart") },
            AstKind::JSXExpressionContainer(_) => self.listener_attribute(mi, pid, span, c),
            AstKind::ReturnStatement(_) | AstKind::ArrowFunctionExpression(_) => bad("it is handed back"),
            _ => bad("it goes where it is not followed"),
        }
    }
    /// An attribute `on…` of an element of the platform's.
    fn listener_attribute(&self, mi: usize, container: NodeId, span: Span, c: &mut Calls) -> Result<(), Why> {
        let m = self.m(mi);
        let a = m.nodes.parent_id(container);
        if let AstKind::JSXAttribute(x) = m.nodes.kind(a) {
            if let (JSXAttributeName::Identifier(n), AstKind::JSXOpeningElement(e)) = (&x.name, m.nodes.parent_kind(a)) {
                let name = n.name.as_str();
                if matches!(&e.name, JSXElementName::Identifier(t) if !t.name.contains('-')) && name.len() > 2 && name.starts_with("on") && name.as_bytes()[2].is_ascii_uppercase() && e.attributes.iter().all(|a| matches!(a, JSXAttributeItem::Attribute(_))) {
                    c.listen(Some(name[2..].to_ascii_lowercase()));
                    c.later.push(why(mi, span, format!("{name} of an element")));
                    return Ok(());
                }
            }
        }
        Err(why(mi, span, "it goes into JSX that is no element's event"))
    }
    /// A callback handed to a call: what runs it, and when.
    fn handed(&self, mi: usize, k: &'m CallExpression<'a>, id: NodeId, i: usize, span: Span, c: &mut Calls) -> Result<(), Why> {
        let m = self.m(mi);
        let bad = |w: &str| Err(why(mi, span, w));
        match unwrap(&k.callee) {
            Expression::Identifier(f) => {
                for g in ["setTimeout", "setInterval", "queueMicrotask", "requestAnimationFrame", "requestIdleCallback"] { if m.is_global(f, g) { return if i == 0 { c.later.push(why(mi, span, format!("given to {g}"))); Ok(()) } else { bad("an argument of a timer") }; } }
                if m.is_global(f, "addEventListener") || m.is_global(f, "removeEventListener") { return self.listening(mi, k, f.name == "addEventListener", i, span, c); }
            }
            Expression::StaticMemberExpression(p) => {
                let n = p.property.name.as_str();
                if let Expression::Identifier(o) = unwrap(&p.object) {
                    if (m.is_global(o, "window") || m.is_global(o, "globalThis")) && matches!(n, "setTimeout" | "setInterval" | "queueMicrotask" | "requestAnimationFrame" | "requestIdleCallback") && i == 0 { c.later.push(why(mi, span, format!("given to {n}"))); return Ok(()); }
                }
                if matches!(n, "addEventListener" | "removeEventListener") && self.target(mi, &p.object, &c.bind) { return self.listening(mi, k, n == "addEventListener", i, span, c); }
                // `el.removeEventListener.bind(el, type, cb)`
                if n == "bind" && i == 2 { if let Expression::StaticMemberExpression(q) = unwrap(&p.object) { if q.property.name == "removeEventListener" && self.target(mi, &q.object, &c.bind) { return Ok(()); } } }
                if matches!(n, "watchPosition" | "getCurrentPosition") && i <= 1 && matches!(unwrap(&p.object), Expression::StaticMemberExpression(q) if q.property.name == "geolocation" && matches!(unwrap(&q.object), Expression::Identifier(g) if m.is_global(g, "navigator"))) { c.later.push(why(mi, span, format!("given to {n}"))); return Ok(()); }
                if matches!(n, "then" | "catch" | "finally") && i <= 1 && self.promise(mi, &p.object) { c.later.push(why(mi, span, "given to a promise")); return Ok(()); }
            }
            _ => {}
        }
        if let Some(n) = self.solid(mi, &k.callee) { if i == 0 && matches!(n.as_str(), "createMemo" | "createEffect" | "createRenderEffect" | "createProjection") { return bad("called in a computation"); } }
        let _ = id;
        // a function of the code: its parameter
        if let Some(g) = self.called(mi, &k.callee) {
            if k.arguments.iter().take(i).any(|a| a.is_spread()) { return bad("after a spread"); }
            if let Some((params, _, gen, _)) = self.parts(g) {
                if gen || uses_arguments(self.m(g.module), g.node) { return bad("it is handed to a function that is not followed"); }
                return match params.items.get(i) {
                    Some(p) => match bound(&p.pattern) { Some(b) => self.inside(mi, k, g, i, span, c, &mut |d| self.name_later(g.module, b.symbol_id.get(), b.span, d)), None => bad("it is taken apart") },
                    None if params.rest.is_none() => Ok(()),
                    _ => bad("it is handed to a function that is not followed"),
                };
            }
        }
        bad("it is handed to code that is not followed")
    }
    /// The call of a function of the code that is given the callback: its parameters hold what the call gives them.
    #[allow(clippy::too_many_arguments)]
    fn inside(&self, mi: usize, k: &'m CallExpression<'a>, g: FnAt, i: usize, span: Span, c: &mut Calls, f: &mut dyn FnMut(&mut Calls) -> Result<(), Why>) -> Result<(), Why> {
        self.steps.set(0);
        let own = self.bind_call(mi, k, g, &c.bind, 0).unwrap_or_default();
        let key = (g.module, g.node.index(), i, { let mut v: Vec<_> = own.iter().map(|(k, v)| format!("{:?}{v:?}", k)).collect(); v.sort(); v.join(",") });
        // the same call of itself, deeper: what it does is being read
        if c.within.contains(&key) { return Ok(()); }
        if c.within.len() > 10 { return Err(why(mi, span, "it is handed on too far to be followed")); }
        let mut bind = c.bind.clone();
        bind.extend(own);
        let mut within = c.within.clone();
        within.push(key);
        let mut d = Calls { later: vec![], seen: BTreeSet::new(), listens: false, events: Some(BTreeSet::new()), bind, within, root: c.root, any: c.any };
        f(&mut d)?;
        c.later.extend(d.later);
        if d.listens { match d.events { Some(e) => for n in e { c.listen(Some(n)); }, None => c.listen(None) } }
        Ok(())
    }
    fn listening(&self, mi: usize, k: &'m CallExpression<'a>, adds: bool, i: usize, span: Span, c: &mut Calls) -> Result<(), Why> {
        if i != 1 { return Err(why(mi, span, "an argument of a listener")); }
        if adds { let n = k.arguments[0].as_expression().and_then(|e| self.text(mi, e, &c.bind)); c.listen(n); c.later.push(why(mi, span, "given to addEventListener")); }
        Ok(())
    }
    /// A promise of the language's, made there.
    fn promise(&self, mi: usize, e: &Expression<'a>) -> bool {
        let m = self.m(mi);
        match unwrap(e) {
            Expression::CallExpression(c) => match unwrap(&c.callee) {
                Expression::StaticMemberExpression(p) => match unwrap(&p.object) { Expression::Identifier(o) if m.is_global(o, "Promise") => matches!(p.property.name.as_str(), "resolve" | "all" | "allSettled" | "race" | "any" | "reject"), x => matches!(p.property.name.as_str(), "then" | "catch" | "finally") && self.promise(mi, x) },
                x => self.called(mi, x).is_some_and(|f| self.parts(f).is_some_and(|(_, _, g, a)| a && !g)),
            },
            Expression::NewExpression(n) => matches!(&n.callee, Expression::Identifier(i) if m.is_global(i, "Promise")),
            _ => false,
        }
    }
    /// A call of the callback: when the function it is written in runs.
    pub fn call_later(&self, mi: usize, call: NodeId, span: Span, c: &mut Calls) -> Result<(), Why> {
        let m = self.m(mi);
        let Some(f) = m.function_of(call) else { return Err(why(mi, span, "called as the module loads")) };
        let inside = FnAt { module: mi, node: f };
        // a parameter's default runs when the function does
        if !self.in_body(inside, call) { return Err(why(mi, span, "called in a parameter's default")); }
        if self.after_await(inside, call) { c.later.push(why(mi, span, "after an await")); return Ok(()); }
        if f == c.root.node && mi == c.root.module { return Err(why(mi, span, "called while the call runs")); }
        if self.parts(inside).is_some_and(|(_, _, g, _)| g) { return Err(why(mi, span, "called in a generator")); }
        let n = c.later.len();
        self.function_later(mi, f, span, c)?;
        if c.later.len() == n { return Err(why(mi, span, "called in a function that is called nowhere that was read")); }
        Ok(())
    }
    fn in_body(&self, f: FnAt, id: NodeId) -> bool {
        let m = self.m(f.module);
        let span = m.nodes.kind(id).span();
        match self.parts(f) { Some((_, Ok(b), ..)) => b.iter().any(|s| s.span().contains_inclusive(span)), Some((_, Err(e), ..)) => e.span().contains_inclusive(span), None => false }
    }
    /// Whether a function (one that calls the callback) only runs later.
    fn function_later(&self, mi: usize, f: NodeId, span: Span, c: &mut Calls) -> Result<(), Why> {
        let m = self.m(mi);
        if !c.seen.insert((mi, f.index(), 1)) { c.later.push(why(mi, span, "called again later")); return Ok(()); }
        match m.nodes.kind(f) {
            AstKind::Function(x) if x.is_declaration() => {
                let Some(s) = x.id.as_ref().and_then(|i| i.symbol_id.get()) else { return Err(why(mi, span, "called in a function that is handed out")) };
                if m.handed_out.contains(&s) { return Err(why(mi, span, "called in a function the module exports")); }
                self.name_later(mi, Some(s), span, c)
            }
            AstKind::Function(x) => {
                if let Some(s) = x.id.as_ref().and_then(|i| i.symbol_id.get()) { if !m.references(s).is_empty() { return Err(why(mi, span, "called in a function that calls itself")); } }
                // a method, an accessor: run by whoever has the object
                let pid = m.nodes.parent_id(f);
                if matches!(m.nodes.kind(pid), AstKind::ObjectProperty(_) | AstKind::MethodDefinition(_) | AstKind::PropertyDefinition(_)) { return Err(why(mi, span, "called in a method")); }
                self.use_later(mi, f, c)
            }
            _ => self.use_later(mi, f, c),
        }
    }
    /// Whether a statement before it, in the same async function's body, waits whatever happens.
    fn after_await(&self, f: FnAt, id: NodeId) -> bool {
        let m = self.m(f.module);
        let Some((_, Ok(b), false, true)) = self.parts(f) else { return false };
        let span = m.nodes.kind(id).span();
        let Some(i) = b.iter().position(|s| s.span().contains_inclusive(span)) else { return false };
        b[..i].iter().any(|s| match s {
            Statement::ExpressionStatement(x) => always_waits(&x.expression),
            Statement::VariableDeclaration(d) => d.declarations.iter().any(|x| x.init.as_ref().is_some_and(always_waits)),
            _ => false,
        })
    }

    // ---- draft ----
    /// Whether every path changes the parameter in place, and nothing keeps it.
    pub fn draft(&self, f: FnAt, index: usize) -> Result<Why, Why> {
        let (mi, m) = (f.module, self.m(f.module));
        let at0 = m.nodes.kind(f.node).span();
        let no = |at: Span, w: &str| Err(why(mi, at, w));
        let Some((params, body, gen, isasync)) = self.parts(f) else { return no(at0, "it is not read") };
        if gen || isasync || m.banned.is_some() || uses_arguments(m, f.node) { return no(at0, "it waits, is a generator, or uses `arguments`"); }
        let Some(p) = params.items.get(index) else { return no(at0, "it has no such parameter") };
        let (BindingPattern::BindingIdentifier(b), None) = (&p.pattern, &p.initializer) else { return no(p.span, "it is taken apart, or has a default") };
        let Some(s) = b.symbol_id.get().filter(|s| m.known_symbol(*s)) else { return no(b.span, "its name is written again") };
        let Ok(body) = body else { return no(at0, "its body is one expression: what it answers may be the list") };
        let mut wrote: Vec<Span> = vec![];
        for r in m.references(s) {
            if m.function_of(r) != Some(f.node) { return no(m.nodes.kind(r).span(), "it is in a function that may run later"); }
            let o = m.outer(r);
            let (pid, span) = (m.nodes.parent_id(o), m.nodes.kind(o).span());
            let AstKind::StaticMemberExpression(k) = m.nodes.kind(pid) else {
                // `p[i] = primitive`
                if let AstKind::ComputedMemberExpression(k) = m.nodes.kind(pid) { if k.object.span() == span { if let Some(w) = self.prim_write(mi, pid) { wrote.push(w); continue; } } }
                return no(span, "it goes where it is not followed");
            };
            if k.object.span() != span { return no(span, "it goes where it is not followed"); }
            if k.property.name == "length" && !m.is_written(pid) { continue; }
            if let Some(w) = self.prim_write(mi, pid) { wrote.push(w); continue; }
            // `p.push(1)`, `const [x] = p.splice(i, 1)`
            let call = m.nodes.parent_id(m.outer(pid));
            let AstKind::CallExpression(c) = m.nodes.kind(call) else { return no(span, "a part of it is read") };
            if c.callee.span() != m.nodes.kind(m.outer(pid)).span() || !matches!(k.property.name.as_str(), "push" | "unshift" | "splice" | "reverse" | "sort" | "pop" | "shift" | "fill") { return no(span, "a method that is not known to keep nothing"); }
            for (i, a) in c.arguments.iter().enumerate() {
                let ok = match a.as_expression() { Some(e) => self.primitive(mi, f, e) || (k.property.name == "sort" && i == 0 && self.plain_order(mi, e)) || self.own_item(mi, e, s), None => false };
                if !ok { return no(a.span(), "an argument that may keep something, or be kept"); }
            }
            if !self.dropped_or_put_back(mi, call, s) { return no(c.span, "what the method answers goes where it is not followed"); }
            wrote.push(c.span);
        }
        for st in body {
            if leaves(st) { break; }
            let hit = match st { Statement::ExpressionStatement(x) => wrote.iter().find(|w| unwrap(&x.expression).span() == **w), Statement::VariableDeclaration(d) => wrote.iter().find(|w| d.declarations.iter().any(|x| x.init.as_ref().is_some_and(|i| unwrap(i).span() == **w))), _ => None };
            if let Some(w) = hit { return Ok(why(mi, *w, "changed in place, on every path")); }
        }
        no(at0, "no change of it that every path makes")
    }
    /// `p.x = primitive` as a statement.
    fn prim_write(&self, mi: usize, member: NodeId) -> Option<Span> {
        let m = self.m(mi);
        let o = m.outer(member);
        let pid = m.nodes.parent_id(o);
        let AstKind::AssignmentExpression(a) = m.nodes.kind(pid) else { return None };
        if a.left.span() != m.nodes.kind(o).span() || a.operator != AssignmentOperator::Assign { return None; }
        if !matches!(unwrap(&a.right), Expression::NumericLiteral(_) | Expression::StringLiteral(_) | Expression::BooleanLiteral(_) | Expression::NullLiteral(_)) { return None; }
        if let AstKind::StaticMemberExpression(k) = m.nodes.kind(member) { if super::constant::reserved(&k.property.name) { return None; } }
        if let AstKind::ComputedMemberExpression(k) = m.nodes.kind(member) { if !matches!(unwrap(&k.expression), Expression::NumericLiteral(_)) { return None; } }
        matches!(m.nodes.parent_kind(m.outer(pid)), AstKind::ExpressionStatement(_)).then_some(a.span)
    }
    fn primitive(&self, mi: usize, f: FnAt, e: &Expression<'a>) -> bool {
        match unwrap(e) {
            Expression::NumericLiteral(_) | Expression::StringLiteral(_) | Expression::BooleanLiteral(_) | Expression::NullLiteral(_) => true,
            Expression::UnaryExpression(u) => matches!(u.operator, UnaryOperator::UnaryNegation) && self.primitive(mi, f, &u.argument),
            // another parameter is an index the method converts, and may be put in the list: the host says it is a primitive
            Expression::Identifier(i) => { let Some((params, ..)) = self.parts(f) else { return false }; let m = self.m(mi); let Some(s) = m.symbol(i).filter(|s| m.known_symbol(*s)) else { return false }; params.items.iter().enumerate().any(|(n, p)| matches!(&p.pattern, BindingPattern::BindingIdentifier(b) if b.symbol_id.get() == Some(s)) && p.initializer.is_none() && self.prims_at(n)) }
            _ => false,
        }
    }
    fn prims_at(&self, n: usize) -> bool { PRIMS.with(|p| p.borrow().contains(&n)) }
    /// A comparison of two items that calls nothing and assigns nothing.
    fn plain_order(&self, mi: usize, e: &Expression<'a>) -> bool {
        let Expression::ArrowFunctionExpression(f) = unwrap(e) else { return false };
        let ArrowFunctionBody::FunctionBody(_) = &f.body else {
            let m = self.m(mi);
            let span = f.span;
            return f.params.rest.is_none() && f.params.items.iter().all(|p| p.initializer.is_none() && matches!(p.pattern, BindingPattern::BindingIdentifier(_))) && m.nodes.iter().filter(|n| span.contains_inclusive(n.kind().span())).all(|n| !matches!(n.kind(), AstKind::CallExpression(_) | AstKind::NewExpression(_) | AstKind::AssignmentExpression(_) | AstKind::UpdateExpression(_) | AstKind::TaggedTemplateExpression(_) | AstKind::Function(_) | AstKind::ObjectExpression(_) | AstKind::ArrayExpression(_) | AstKind::AwaitExpression(_)) && (!matches!(n.kind(), AstKind::ArrowFunctionExpression(_)) || n.kind().span() == span));
        };
        false
    }
    /// A name that holds what was taken off the list.
    fn own_item(&self, mi: usize, e: &Expression<'a>, s: SymbolId) -> bool {
        let Expression::Identifier(i) = unwrap(e) else { return false };
        let m = self.m(mi);
        let Some(x) = m.symbol(i).filter(|x| m.known_symbol(*x)) else { return false };
        let AstKind::VariableDeclarator(d) = m.nodes.kind(m.scoping.symbol_declaration(x)) else { return false };
        d.init.as_ref().is_some_and(|e| self.takes_off(mi, e, s))
    }
    fn takes_off(&self, mi: usize, e: &Expression<'a>, s: SymbolId) -> bool {
        let Expression::CallExpression(c) = unwrap(e) else { return false };
        let Expression::StaticMemberExpression(p) = unwrap(&c.callee) else { return false };
        matches!(unwrap(&p.object), Expression::Identifier(i) if self.m(mi).symbol(i) == Some(s)) && matches!(p.property.name.as_str(), "splice" | "pop" | "shift")
    }
    /// What a change answers is dropped, or a name only ever given back to the same list.
    fn dropped_or_put_back(&self, mi: usize, call: NodeId, s: SymbolId) -> bool {
        let m = self.m(mi);
        let o = m.outer(call);
        match m.nodes.parent_kind(o) {
            AstKind::ExpressionStatement(_) => true,
            AstKind::VariableDeclarator(d) => {
                let names: Vec<&BindingIdentifier> = match &d.id { BindingPattern::BindingIdentifier(b) if !matches!(d.init.as_ref().map(unwrap), Some(Expression::CallExpression(c)) if matches!(unwrap(&c.callee), Expression::StaticMemberExpression(p) if matches!(p.property.name.as_str(), "splice" | "sort" | "reverse" | "fill"))) => vec![b], BindingPattern::ArrayPattern(a) if a.rest.is_none() => { let mut v = vec![]; for e in a.elements.iter().flatten() { match e { BindingPattern::BindingIdentifier(b) => v.push(&**b), _ => return false } } v } _ => return false };
                names.iter().all(|b| b.symbol_id.get().is_some_and(|x| m.known_symbol(x) && m.references(x).iter().all(|r| {
                    let o = m.outer(*r);
                    let span = m.nodes.kind(o).span();
                    matches!(m.nodes.parent_kind(o), AstKind::CallExpression(c) if c.arguments.iter().any(|a| a.span() == span) && matches!(unwrap(&c.callee), Expression::StaticMemberExpression(p) if matches!(unwrap(&p.object), Expression::Identifier(i) if m.symbol(i) == Some(s)) && matches!(p.property.name.as_str(), "splice" | "push" | "unshift")))
                })))
            }
            _ => false,
        }
    }

    // ---- ref ----
    /// Whether what the function answers at `path` is a reader Solid made, under a name nothing writes.
    pub fn reader(&self, f: FnAt, path: &[&str], depth: u32) -> bool {
        let Some((_, body, gen, isasync)) = self.parts(f) else { return false };
        if gen || isasync || depth > 6 || self.m(f.module).banned.is_some() { return false; }
        let e = match body { Err(e) => e, Ok(b) => { let Some((Statement::ReturnStatement(r), before)) = b.split_last() else { return false }; if before.iter().any(leaves) { return false; } match &r.argument { Some(e) => e, None => return false } } };
        self.reads(f.module, e, path, depth)
    }
    fn reads(&self, mi: usize, e: &'m Expression<'a>, path: &[&str], depth: u32) -> bool {
        let m = self.m(mi);
        match (unwrap(e), path) {
            (Expression::ArrayExpression(a), [k, rest @ ..]) => { let Ok(i) = k.parse::<usize>() else { return false }; a.elements.iter().all(|x| !x.is_spread()) && a.elements.get(i).and_then(|x| x.as_expression()).is_some_and(|x| self.reads(mi, x, rest, depth)) }
            (Expression::ObjectExpression(o), [k, rest @ ..]) => {
                let mut hit = None;
                for p in &o.properties { let ObjectPropertyKind::ObjectProperty(p) = p else { return false }; match static_key(&p.key, p.computed) { None => return false, Some(n) if n == *k => { if hit.is_some() || p.kind != PropertyKind::Init { return false; } hit = Some(&p.value); } _ => {} } }
                hit.is_some_and(|x| self.reads(mi, x, rest, depth))
            }
            (Expression::CallExpression(c), path) if !c.optional => {
                if let Some(n) = self.solid(mi, &c.callee) { return match (n.as_str(), path) { ("createMemo", []) | ("createSignal", ["0"]) => true, _ => false }; }
                self.called(mi, &c.callee).is_some_and(|g| self.reader(g, path, depth + 1))
            }
            (Expression::ComputedMemberExpression(p), []) => matches!((unwrap(&p.object), unwrap(&p.expression)), (Expression::CallExpression(c), Expression::NumericLiteral(n)) if n.value == 0.0 && !c.optional && self.solid(mi, &c.callee).as_deref() == Some("createSignal")),
            (Expression::Identifier(i), path) => {
                let Some(s) = m.symbol(i).filter(|s| m.known_symbol(*s) && !m.imports.contains_key(s)) else { return false };
                let AstKind::VariableDeclarator(d) = m.nodes.kind(m.scoping.symbol_declaration(s)) else { return false };
                let Some(init) = &d.init else { return false };
                match &d.id {
                    // (an object or a list under a name may have been changed: only what Solid made itself)
                    BindingPattern::BindingIdentifier(_) => path.is_empty() && matches!(unwrap(init), Expression::CallExpression(_) | Expression::ComputedMemberExpression(_)) && self.reads(mi, init, path, depth),
                    BindingPattern::ArrayPattern(a) if path.is_empty() => matches!(a.elements.first(), Some(Some(BindingPattern::BindingIdentifier(b))) if b.symbol_id.get() == Some(s)) && matches!(unwrap(init), Expression::CallExpression(c) if !c.optional && self.solid(mi, &c.callee).as_deref() == Some("createSignal")),
                    _ => false,
                }
            }
            _ => false,
        }
    }
}
thread_local! { /** The parameters whose type is a primitive, of the fn `draft` is asked about. */ pub static PRIMS: std::cell::RefCell<BTreeSet<usize>> = const { std::cell::RefCell::new(BTreeSet::new()) }; }

struct View { provided: Vec<(usize, SymbolId)>, values: Vec<Span>, views: Vec<Span> }
/// What was found of a callback: where it is called, under which names of its parameters' values.
pub struct Calls {
    pub later: Vec<Why>,
    seen: BTreeSet<(usize, usize, u8)>,
    /// It is a listener's; of which events (`None`: one whose name is not known).
    listens: bool,
    events: Option<BTreeSet<String>>,
    bind: Bind,
    within: Vec<(usize, usize, usize, String)>,
    root: FnAt,
    /// Anyone's call is asked about, not one callback's: a name the module exports is everyone's.
    any: bool,
}
impl Calls {
    pub fn anyone() -> Self { Calls { later: vec![], seen: BTreeSet::new(), listens: false, events: Some(BTreeSet::new()), bind: Bind::new(), within: vec![], root: FnAt { module: usize::MAX, node: NodeId::ROOT }, any: true } }
    fn listen(&mut self, event: Option<String>) { self.listens = true; match event { Some(e) => { if let Some(s) = &mut self.events { s.insert(e); } } None => self.events = None } }
}
/// The name a pattern binds, whatever its default.
fn bound<'b, 'a>(p: &'b BindingPattern<'a>) -> Option<&'b BindingIdentifier<'a>> { match p { BindingPattern::BindingIdentifier(b) => Some(b), BindingPattern::AssignmentPattern(a) => bound(&a.left), _ => None } }

fn nullish(e: &Expression) -> bool { matches!(unwrap(e), Expression::NullLiteral(_)) || matches!(unwrap(e), Expression::Identifier(i) if i.name == "undefined") }
fn uses_arguments(m: &Module, f: NodeId) -> bool {
    // (an arrow has none of its own: the function around it is the module's, or one that hands it out)
    match m.nodes.kind(f) { AstKind::Function(_) => { let span = m.nodes.kind(f).span(); m.nodes.iter().any(|n| matches!(n.kind(), AstKind::IdentifierReference(i) if i.name == "arguments" && m.symbol(i).is_none() && span.contains_inclusive(i.span))) } _ => false }
}
/// Whether a statement may leave the function by a return (a nested function's own is not it).
fn leaves(s: &Statement) -> bool {
    match s {
        Statement::ReturnStatement(_) => true,
        Statement::BlockStatement(b) => b.body.iter().any(leaves),
        Statement::IfStatement(i) => leaves(&i.consequent) || i.alternate.as_ref().is_some_and(leaves) ,
        Statement::ForStatement(f) => leaves(&f.body),
        Statement::ForInStatement(f) => leaves(&f.body),
        Statement::ForOfStatement(f) => f.r#await || leaves(&f.body),
        Statement::WhileStatement(f) => leaves(&f.body),
        Statement::DoWhileStatement(f) => leaves(&f.body),
        Statement::LabeledStatement(l) => leaves(&l.body),
        Statement::SwitchStatement(x) => x.cases.iter().any(|c| c.consequent.iter().any(leaves)),
        Statement::TryStatement(t) => t.block.body.iter().any(leaves) || t.handler.as_ref().is_some_and(|h| h.body.body.iter().any(leaves)) || t.finalizer.as_ref().is_some_and(|f| f.body.iter().any(leaves)),
        _ => false,
    }
}
/// Whether a statement is a throw, or ends in one and never returns.
fn throws(s: &Statement) -> bool {
    match s { Statement::ThrowStatement(_) => true, Statement::BlockStatement(b) => b.body.last().is_some_and(throws) && !b.body.iter().any(leaves), _ => false }
}
/// Whether a span has an `await` or a `yield` that may be the function's own: what is after it may be another turn.
fn waits_in(span: Span, m: &Module) -> bool { m.nodes.iter().any(|n| matches!(n.kind(), AstKind::AwaitExpression(_) | AstKind::YieldExpression(_)) && span.contains_inclusive(n.kind().span())) }
/// Whether evaluating an expression always waits.
fn always_waits(e: &Expression) -> bool {
    match unwrap(e) {
        Expression::AwaitExpression(_) => true,
        Expression::CallExpression(c) if !c.optional => match unwrap(&c.callee) { Expression::StaticMemberExpression(p) if !p.optional => always_waits(&p.object), _ => false } ,
        Expression::StaticMemberExpression(p) if !p.optional => always_waits(&p.object),
        Expression::AssignmentExpression(a) => a.operator == AssignmentOperator::Assign && always_waits(&a.right),
        Expression::ArrayExpression(a) => a.elements.iter().any(|x| x.as_expression().is_some_and(always_waits)),
        Expression::BinaryExpression(b) => always_waits(&b.left) || always_waits(&b.right),
        Expression::UnaryExpression(u) => always_waits(&u.argument),
        _ => false,
    }
}
