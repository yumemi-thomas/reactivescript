//! Where the code a module loads could send an event, or call a listener, while a call of its own runs (DESIGN.md,
//! `handler`): `el.click()`, `focus()`, `dispatchEvent`, a removed element, a method of its own named `addEventListener`.
//! The whole of what the import loads is read, not the function alone. A place that only ever runs where Solid has no owner
//! (a listener, a timer, after an `await`) sends what it sends from there.
use super::constant::{static_key, unwrap};
use super::eval::FnAt;
use super::graph::{self, Origin};
use super::place::{Calls, Place, Why};
use super::target::MADE;
use oxc_ast::{ast::*, AstKind};
use oxc_semantic::NodeId;
use oxc_span::{GetSpan, Span};
use std::collections::BTreeSet;

/// Which events a place may send.
#[derive(Clone, Copy, PartialEq)]
pub enum Sends { Any, Focus, Tree }
pub struct Place0 { pub module: usize, pub at: Span, pub what: String, pub sends: Sends }

// The methods of lib.dom (TypeScript 5.9's) that send an event before they answer, by the standards' texts and what Chromium,
// Firefox and WebKit do beside them; every other method of it was read, and queues its events or sends none.
const FOCUS: &[&str] = &["focus", "blur", "addRange", "setBaseAndExtent", "selectAllChildren"];
const TREE: &[&str] = &["remove", "removeChild", "replaceChild", "replaceWith", "replaceChildren", "append", "appendChild", "prepend", "insertBefore", "insertAdjacentElement", "insertAdjacentHTML", "insertAdjacentText", "moveBefore", "adoptNode", "deleteContents", "extractContents", "insertNode", "surroundContents", "deleteRow", "deleteCell", "setHTML", "setHTMLUnsafe", "before", "after"];
const SENDS: &[&str] = &["dispatchEvent", "fireEvent", "click", "submit", "requestSubmit", "reset", "checkValidity", "reportValidity", "abort", "open", "send", "showPopover", "hidePopover", "togglePopover", "showModal", "show", "close", "requestClose", "execCommand", "print", "pushState", "replaceState", "navigate", "reportError", "write", "writeln", "initEvent"];
const TREE_WRITES: &[&str] = &["innerHTML", "outerHTML", "innerText", "outerText", "textContent", "srcdoc"];
const PATCH: &[&str] = &["addEventListener", "removeEventListener", "dispatchEvent"];
const CONSTRUCTORS: &[&str] = &["ResizeObserver", "IntersectionObserver", "MutationObserver", "PerformanceObserver", "ReportingObserver", "matchMedia", "createElement"];

fn sends(n: &str) -> Option<Sends> { if FOCUS.contains(&n) { Some(Sends::Focus) } else if TREE.contains(&n) { Some(Sends::Tree) } else if SENDS.contains(&n) { Some(Sends::Any) } else { None } }
/// Whether a place that sends those may send one of the events listened to (`None`: their names are not known).
fn meets(s: Sends, events: &Option<BTreeSet<String>>) -> bool {
    let Some(ev) = events else { return true };
    let of = |l: &[&str]| ev.iter().any(|e| l.contains(&e.as_str()));
    match s {
        Sends::Any => true,
        Sends::Focus => of(&["focus", "blur", "focusin", "focusout", "change", "selectstart", "selectionchange", "beforeinput", "input"]),
        Sends::Tree => of(&["focus", "blur", "focusin", "focusout", "change", "load", "error", "unload", "pagehide", "toggle", "beforetoggle", "DOMNodeInserted", "DOMNodeRemoved", "DOMSubtreeModified", "DOMNodeInsertedIntoDocument", "DOMNodeRemovedFromDocument", "slotchange"]),
    }
}

impl<'m, 'a, 'r> Place<'m, 'a, 'r> {
    /// That nothing the import loads sends those events while a call of it runs.
    pub fn quiet(&self, f: FnAt, events: &Option<BTreeSet<String>>) -> Result<(), Why> {
        if self.sent.borrow().is_none() { let v = self.senders(); *self.sent.borrow_mut() = Some(v); }
        let sent = self.sent.borrow();
        match sent.as_ref().unwrap().iter().find(|p| meets(p.sends, events)) {
            None => Ok(()),
            Some(p) => { let _ = f; Err(Why { why: format!("it listens, and what the import loads may send what it listens to while a call runs: {}", p.what), module: p.module, at: p.at.start }) }
        }
    }
    fn senders(&self) -> Vec<Place0> {
        let mut out = vec![];
        let (mut todo, mut done) = (vec![self.entry], BTreeSet::new());
        while let Some(i) = todo.pop() {
            if !done.insert(i) { continue; }
            let m = self.m(i);
            for s in m.specs() {
                if graph::is_solid(s) { continue; }
                match self.mods.open(self.h, &self.mods.find(self.h, self.hi, s, i)) {
                    Ok(j) => todo.push(j),
                    Err(Origin::Never) => {}
                    Err(_) => out.push(Place0 { module: i, at: m.program.span, what: format!("it imports {s}, which is not read"), sends: Sends::Any }),
                }
            }
            if let Some(w) = m.banned { out.push(Place0 { module: i, at: m.program.span, what: w.into(), sends: Sends::Any }); }
        }
        let used = self.used(&done);
        // every method name some code here calls
        let mut methods = BTreeSet::new();
        for i in &done { for n in self.m(*i).nodes.iter() { if let AstKind::CallExpression(c) = n.kind() { if let Expression::StaticMemberExpression(p) = unwrap(&c.callee) { methods.insert(p.property.name.as_str()); } } } }
        for i in &done { self.module_senders(*i, &self.unused(*i, &used), &methods, &mut out); }
        out
    }
    /// The functions and the functions under a `const` at the top of a module that the import's exports, and the code that runs
    /// as the modules load, can reach by name.
    fn used(&self, modules: &BTreeSet<usize>) -> BTreeSet<(usize, usize)> {
        let mut used = BTreeSet::new();
        let mut todo: Vec<(usize, Span)> = vec![];
        let reach = |o: Origin<'a>, used: &mut BTreeSet<(usize, usize)>, todo: &mut Vec<(usize, Span)>| match o {
            Origin::Symbol(m, s) => { if used.insert((m, s.index())) { if let Some((_, at)) = self.apart(m).into_iter().find(|x| x.0 == s.index()) { todo.push((m, at)); } } }
            Origin::Ns(m) => for (s, at) in self.apart(m) { if used.insert((m, s)) { todo.push((m, at)); } },
            _ => {}
        };
        match self.mods.every_name(self.h, self.hi, self.entry) {
            Some(names) => for n in names { reach(self.mods.exported(self.h, self.hi, self.entry, &n, &mut vec![]), &mut used, &mut todo); },
            None => for m in modules { reach(Origin::Ns(*m), &mut used, &mut todo); },
        }
        for i in modules {
            let m = self.m(*i);
            let apart = self.apart(*i);
            for st in &m.program.body {
                if matches!(st, Statement::ExportNamedDeclaration(_) | Statement::ExportFromDeclaration(_) | Statement::ExportAllDeclaration(_) | Statement::ImportDeclaration(_)) { continue; }
                let mut from = st.span().start;
                for (_, at) in apart.iter().filter(|x| st.span().contains_inclusive(x.1)) { todo.push((*i, Span::new(from, at.start))); from = at.end; }
                todo.push((*i, Span::new(from, st.span().end)));
            }
        }
        while let Some((i, at)) = todo.pop() {
            let m = self.m(i);
            for n in m.nodes.iter() {
                let AstKind::IdentifierReference(x) = n.kind() else { continue };
                if !at.contains_inclusive(x.span) { continue; }
                let Some(s) = m.symbol(x) else { continue };
                if !m.at_top(s) { continue; }
                reach(self.mods.symbol(self.h, self.hi, i, s, &mut vec![]), &mut used, &mut todo);
            }
        }
        used
    }
    /// The functions at the top of a module, each by its name's symbol.
    fn apart(&self, mi: usize) -> Vec<(usize, Span)> {
        let m = self.m(mi);
        let mut out = vec![];
        let mut decl = |d: &VariableDeclaration<'a>| for v in &d.declarations { if let (BindingPattern::BindingIdentifier(b), Some(Expression::ArrowFunctionExpression(_) | Expression::FunctionExpression(_))) = (&v.id, v.init.as_ref()) { if let Some(s) = b.symbol_id.get() { out.push((s.index(), v.span)); } } };
        for st in &m.program.body { match st { Statement::VariableDeclaration(d) => decl(d), Statement::ExportDeclaration(d) => if let Declaration::VariableDeclaration(d) = &d.declaration { decl(d) }, _ => {} } }
        let mut func = |f: &Function<'a>| if let Some(s) = f.id.as_ref().and_then(|i| i.symbol_id.get()) { out.push((s.index(), f.span)); };
        for st in &m.program.body { match st { Statement::FunctionDeclaration(f) => func(f), Statement::ExportDeclaration(d) => if let Declaration::FunctionDeclaration(f) = &d.declaration { func(f) }, _ => {} } }
        out
    }
    fn unused(&self, mi: usize, used: &BTreeSet<(usize, usize)>) -> Vec<Span> { self.apart(mi).into_iter().filter(|(s, _)| !used.contains(&(mi, *s))).map(|x| x.1).collect() }
    fn module_senders(&self, mi: usize, skip: &[Span], methods: &BTreeSet<&str>, out: &mut Vec<Place0>) {
        let m = self.m(mi);
        let computed = m.nodes.iter().any(|n| matches!(n.kind(), AstKind::ComputedMemberExpression(p) if !known_key(p) && !m.is_written(n.id()) && !skip.iter().any(|s| s.contains_inclusive(p.span))));
        let mut add = |id: NodeId, what: String, s: Sends, call: bool| { if !(call && self.runs_later(mi, id)) { out.push(Place0 { module: mi, at: m.nodes.kind(id).span(), what, sends: s }); } };
        for n in m.nodes.iter() {
            let id = n.id();
            if !skip.is_empty() { let at = n.kind().span(); if skip.iter().any(|s| s.contains_inclusive(at)) { continue; } }
            match n.kind() {
                AstKind::CallExpression(c) => match unwrap(&c.callee) {
                    Expression::StaticMemberExpression(p) => {
                        let name = p.property.name.as_str();
                        if let Some(s) = sends(name) { if !self.plain_receiver(mi, &p.object, name) { add(id, format!(".{name}()"), s, true); } }
                        if name == "setAttribute" || name == "toggleAttribute" || name == "removeAttribute" || name == "setAttributeNS" || name == "setAttributeNode" {
                            let ok = matches!(c.arguments.first().and_then(|a| a.as_expression()).map(unwrap), Some(Expression::StringLiteral(a)) if { let a = a.value.as_str(); a.starts_with("aria-") || a.starts_with("data-") || matches!(a, "role" | "id" | "class" | "style" | "tabindex" | "title" | "lang" | "dir" | "name" | "value" | "for" | "rel" | "href" | "target" | "d" | "fill" | "stroke" | "width" | "height" | "viewBox" | "x" | "y" | "transform" | "media" | "content" | "draggable" | "nonce" | "async" | "src" | "type") });
                            if !ok { add(id, format!(".{name}() of an attribute that is not known"), Sends::Any, true); }
                        }
                        if matches!(name, "call" | "apply" | "bind") {
                            match unwrap(&p.object) {
                                Expression::StaticMemberExpression(q) => if let Some(s) = sends(&q.property.name) { add(id, format!(".{}.{name}()", q.property.name), s, true); },
                                Expression::ComputedMemberExpression(q) if known_key(q) => if let Expression::StringLiteral(k) = unwrap(&q.expression) { if let Some(s) = sends(&k.value) { add(id, format!("[\"{}\"].{name}()", k.value), s, true); } },
                                o => if computed && self.called(mi, o).is_none() && self.solid(mi, o).is_none() { add(id, format!(".{name}() of a function that is not known"), Sends::Any, true); },
                            }
                        }
                        if matches!(name, "apply" | "get" | "construct") && matches!(unwrap(&p.object), Expression::Identifier(i) if m.is_global(i, "Reflect")) { add(id, format!("Reflect.{name}()"), Sends::Any, true); }
                        if matches!(name, "getOwnPropertyDescriptor" | "getOwnPropertyDescriptors") { add(id, format!("{name}()"), Sends::Any, true); }
                    }
                    Expression::ComputedMemberExpression(p) => match unwrap(&p.expression) {
                        Expression::StringLiteral(k) => if let Some(s) = sends(&k.value) { add(id, format!("[\"{}\"]()", k.value), s, true); },
                        _ if known_key(p) => {}
                        _ => if !self.own_table(mi, &p.object) { add(id, "a method whose name is computed".into(), Sends::Any, true) },
                    },
                    Expression::Identifier(i) if m.symbol(i).is_none() => { if matches!(i.name.as_str(), "require" | "Function" | "eval" | "importScripts") { add(id, format!("{}()", i.name), Sends::Any, false); } else if let Some(s) = sends(&i.name) { add(id, format!("{}()", i.name), s, true); } }
                    _ => {}
                },
                AstKind::NewExpression(x) => if let Expression::Identifier(i) = unwrap(&x.callee) { if m.symbol(i).is_none() && matches!(i.name.as_str(), "Function" | "XMLHttpRequest") { add(id, format!("new {}", i.name), Sends::Any, true); } },
                AstKind::ImportExpression(_) => add(id, "import()".into(), Sends::Any, false),
                AstKind::StaticMemberExpression(p) => {
                    let name = p.property.name.as_str();
                    let o = m.outer(id);
                    if m.is_written(id) {
                        if PATCH.contains(&name) || CONSTRUCTORS.contains(&name) { add(id, format!("it writes .{name}"), Sends::Any, false); }
                        if TREE_WRITES.contains(&name) { add(id, format!("it writes .{name}"), Sends::Tree, true); }
                        if matches!(name, "popover" | "href" | "hash" | "open") && !matches!(unwrap(&p.object), Expression::Identifier(i) if name != "href" && self.literal_object(mi, i)) { add(id, format!("it writes .{name}"), Sends::Any, true); }
                        continue;
                    }
                    // the method itself, taken and not called
                    if let Some(s) = sends(name) {
                        let called = matches!(m.nodes.parent_kind(o), AstKind::CallExpression(c) if c.callee.span() == m.nodes.kind(o).span());
                        let tested = matches!(m.nodes.parent_kind(o), AstKind::UnaryExpression(_) | AstKind::IfStatement(_) | AstKind::BinaryExpression(_) | AstKind::StaticMemberExpression(_) | AstKind::TemplateLiteral(_));
                        if !called && !tested && matches!(name, "dispatchEvent" | "click" | "focus" | "blur" | "requestSubmit" | "reset" | "abort") && !self.plain_receiver(mi, &p.object, name) { add(id, format!(".{name}, taken"), s, false); }
                    }
                }
                AstKind::ComputedMemberExpression(p) => {
                    if let Expression::StringLiteral(k) = unwrap(&p.expression) { if PATCH.contains(&k.value.as_str()) || (m.is_written(id) && TREE_WRITES.contains(&k.value.as_str())) { add(id, format!("[\"{}\"]", k.value), Sends::Any, false); } }
                    // a method under a computed name, put where it has a name of its own
                    else if !known_key(p) && matches!(m.nodes.parent_kind(m.outer(id)), AstKind::AssignmentExpression(a) if a.right.span() == m.nodes.kind(m.outer(id)).span() && match &a.left { AssignmentTarget::StaticMemberExpression(l) => methods.contains(l.property.name.as_str()), AssignmentTarget::ComputedMemberExpression(_) => true, _ => false }) { add(id, "a method under a computed name".into(), Sends::Any, true); }
                }
                AstKind::StringLiteral(s) if PATCH.contains(&s.value.as_str()) => if !matches!(m.nodes.parent_kind(id), AstKind::BinaryExpression(b) if b.operator == BinaryOperator::In) { add(id, format!("\"{}\"", s.value), Sends::Any, false); },
                AstKind::BindingProperty(p) => if let Some(k) = static_key(&p.key, p.computed) { if PATCH.contains(&k.as_str()) || matches!(k.as_str(), "click" | "requestSubmit" | "focus" | "blur" | "reset" | "abort") { add(id, format!("{k}, taken off something"), sends(&k).unwrap_or(Sends::Any), false); } },
                AstKind::ObjectProperty(p) => if let Some(k) = static_key(&p.key, p.computed) { if PATCH.contains(&k.as_str()) { add(id, format!("a {k} of its own"), Sends::Any, false); } },
                AstKind::MethodDefinition(p) => if static_key(&p.key, p.computed).is_none_or(|k| PATCH.contains(&k.as_str()) || k == "attributeChangedCallback") { if !matches!(&p.key, PropertyKey::StaticMemberExpression(_) | PropertyKey::PrivateIdentifier(_)) { add(id, "a method of its own that may be a target's".into(), Sends::Any, false); } },
                AstKind::PropertyDefinition(p) => if static_key(&p.key, p.computed).is_some_and(|k| PATCH.contains(&k.as_str())) { add(id, "a method of its own that may be a target's".into(), Sends::Any, false); },
                _ => {}
            }
        }
    }
    /// Whether a node only runs where Solid has no owner, whoever calls what the module hands out.
    fn runs_later(&self, mi: usize, id: NodeId) -> bool {
        self.spent.set(0);
        let mut c = Calls::anyone();
        self.call_later(mi, id, self.m(mi).nodes.kind(id).span(), &mut c).is_ok() && !c.later.is_empty()
    }
    /// A receiver whose method of that name is another: what a constructor of the platform's made, a class list.
    fn plain_receiver(&self, mi: usize, e: &'m Expression<'a>, name: &str) -> bool {
        let m = self.m(mi);
        match unwrap(e) {
            Expression::StaticMemberExpression(p) => matches!(p.property.name.as_str(), "classList" | "relList" | "searchParams" | "headers") && name == "remove" || matches!(p.property.name.as_str(), "searchParams" | "headers") && name == "append",
            Expression::NewExpression(n) => plain_new(m, n),
            Expression::Identifier(i) => {
                let Some(s) = m.symbol(i).filter(|s| m.known_symbol(*s)) else { return matches!(i.name.as_str(), "console" | "Math" | "JSON") && m.symbol(i).is_none() };
                matches!(m.nodes.kind(m.scoping.symbol_declaration(s)), AstKind::VariableDeclarator(v) if matches!(v.id, BindingPattern::BindingIdentifier(_)) && matches!(v.init.as_ref().map(unwrap), Some(Expression::NewExpression(n)) if plain_new(m, n)))
            }
            _ => false,
        }
    }
    /// An object literal of the code's own under a name, whatever its method names are: each is a function of the code's.
    fn literal_object(&self, mi: usize, i: &IdentifierReference<'a>) -> bool {
        let m = self.m(mi);
        m.symbol(i).is_some_and(|s| m.known_symbol(s) && matches!(m.nodes.kind(m.scoping.symbol_declaration(s)), AstKind::VariableDeclarator(v) if matches!(v.id, BindingPattern::BindingIdentifier(_)) && matches!(v.init.as_ref().map(unwrap), Some(Expression::ObjectExpression(_) | Expression::ArrayExpression(_)))))
    }
    /// A list or a table written out in the module, every item of it a function of the code's: what a computed name finds in it is its own.
    fn own_table(&self, mi: usize, e: &'m Expression<'a>) -> bool {
        let m = self.m(mi);
        let Expression::Identifier(i) = unwrap(e) else { return false };
        let Some(s) = m.symbol(i).filter(|s| m.known_symbol(*s)) else { return false };
        let AstKind::VariableDeclarator(v) = m.nodes.kind(m.scoping.symbol_declaration(s)) else { return false };
        match v.init.as_ref().map(unwrap) {
            Some(Expression::ObjectExpression(o)) => o.properties.iter().all(|p| matches!(p, ObjectPropertyKind::ObjectProperty(p) if matches!(unwrap(&p.value), Expression::ArrowFunctionExpression(_) | Expression::FunctionExpression(_)))) && m.references(s).iter().all(|r| { let o = m.outer(*r); matches!(m.nodes.parent_kind(o), AstKind::ComputedMemberExpression(_) | AstKind::StaticMemberExpression(_)) && !m.is_written(m.nodes.parent_id(o)) }),
            _ => false,
        }
    }
}
fn plain_new(m: &graph::Module, n: &NewExpression) -> bool { matches!(unwrap(&n.callee), Expression::Identifier(i) if m.symbol(i).is_none() && (MADE.contains(&i.name.as_str()) && i.name != "Image" && i.name != "Audio" && i.name != "OffscreenCanvas" || matches!(i.name.as_str(), "Map" | "Set" | "WeakMap" | "WeakSet" | "FormData" | "URLSearchParams" | "Headers" | "AudioContext" | "ResizeObserver" | "IntersectionObserver"))) }
/// A key that is written there.
fn known_key(p: &ComputedMemberExpression) -> bool { match unwrap(&p.expression) { Expression::StringLiteral(_) | Expression::NumericLiteral(_) => true, Expression::StaticMemberExpression(s) => matches!(unwrap(&s.object), Expression::Identifier(i) if i.name == "Symbol"), _ => false } }
