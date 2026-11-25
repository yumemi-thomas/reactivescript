//! Where the code a module loads could send an event, or call a listener, while a call of its own runs (DESIGN.md,
//! `handler`): `el.click()`, `focus()`, `dispatchEvent`, a removed element, a method of its own named `addEventListener`.
//! The whole of what the import loads is read, not the function alone. A place that only ever runs where Solid has no owner
//! (a listener, a timer, after an `await`) sends what it sends from there.
use super::constant::{static_key, unwrap};
use super::eval::FnAt;
use super::graph::{self, Origin};
use super::place::{Calls, Place, Why};
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
/// What a callback is handed to that runs it later: the platform's own, unless the code puts another in its place.
const OWN: &[&str] = &["setTimeout", "setInterval", "queueMicrotask", "requestAnimationFrame", "requestIdleCallback", "ResizeObserver", "IntersectionObserver", "MutationObserver", "PerformanceObserver", "ReportingObserver", "matchMedia", "createElement", "getElementById", "querySelector", "querySelectorAll", "closest", "watchPosition", "getCurrentPosition", "EventSource", "WebSocket", "Worker", "SharedWorker", "BroadcastChannel", "Notification", "then", "Promise"];
/// Data under many a name: taken, they are no method of the platform's unless something calls what is taken with another `this`.
const COMMON: &[&str] = &["open", "close", "show", "submit", "write", "print", "send", "navigate", "before", "after", "remove", "append"];
fn event_handler(n: &str) -> bool { n.starts_with("$$") || (n.len() > 4 && n.starts_with("on") && n.bytes().all(|b| b.is_ascii_lowercase()) && !matches!(n, "online" | "ongoing")) }

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
        let (mut out, mut unread) = (vec![], vec![]);
        let (mut todo, mut done) = (vec![self.entry], BTreeSet::new());
        while let Some(i) = todo.pop() {
            if !done.insert(i) { continue; }
            let m = self.m(i);
            for s in m.specs() {
                if graph::is_solid(s) { continue; }
                match self.mods.open(self.h, &self.mods.find(self.h, self.hi, s, i)) {
                    Ok(j) => todo.push(j),
                    Err(Origin::Never) => {}
                    // (one whose names nothing that is reached uses does not matter)
                    Err(_) => { unread.push((i, s)); }
                }
            }
            if let Some(w) = m.banned { out.push(Place0 { module: i, at: m.program.span, what: w.into(), sends: Sends::Any }); }
        }
        let used = self.used(&done);
        let alive = |i: usize, at: Span| !self.unused(i, &used).iter().any(|s| s.contains_inclusive(at));
        // whether a method may be in a name of its own, and called on what it is not read off
        let loose = done.iter().any(|i| { let m = self.m(*i); m.nodes.iter().any(|n| match n.kind() {
            AstKind::ComputedMemberExpression(p) => !known_key(p) && !m.is_written(n.id()) && alive(*i, p.span),
            AstKind::StaticMemberExpression(p) => sends(&p.property.name).is_some() && !m.is_written(n.id()) && !self.called_or_tested(*i, n.id()) && alive(*i, p.span),
            AstKind::BindingProperty(p) => static_key(&p.key, p.computed).is_none_or(|k| sends(&k).is_some()) && alive(*i, p.span),
            _ => false,
        }) });
        for (i, s) in unread {
            let m = self.m(i);
            let again = m.stars.contains(&s) || m.exports.values().any(|e| matches!(e, graph::Export::From(x, _) | graph::Export::Ns(x) if *x == s));
            if again || m.imports.iter().any(|(y, x)| x.spec == s && (m.handed_out.contains(y) || m.references(*y).iter().any(|n| alive(i, m.nodes.kind(*n).span())))) { out.push(Place0 { module: i, at: m.program.span, what: format!("it imports {s}, which is not read"), sends: Sends::Any }); }
        }
        // every method name some code here calls
        let mut methods = BTreeSet::new();
        for i in &done { for n in self.m(*i).nodes.iter() { if let AstKind::CallExpression(c) = n.kind() { match unwrap(&c.callee) { Expression::StaticMemberExpression(p) => { methods.insert(p.property.name.as_str()); } Expression::ComputedMemberExpression(p) => if let Expression::StringLiteral(k) = unwrap(&p.expression) { methods.insert(k.value.as_str()); }, _ => {} } } else if let AstKind::TaggedTemplateExpression(t) = n.kind() { if let Expression::StaticMemberExpression(p) = unwrap(&t.tag) { methods.insert(p.property.name.as_str()); } } } }
        for i in &done { self.module_senders(*i, &self.unused(*i, &used), &methods, loose, &mut out); }
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
    fn module_senders(&self, mi: usize, skip: &[Span], methods: &BTreeSet<&str>, loose: bool, out: &mut Vec<Place0>) {
        let m = self.m(mi);
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
                                Expression::StaticMemberExpression(q) => if let Some(s) = sends(&q.property.name) { add(id, format!(".{}.{name}()", q.property.name), s, true); } else if matches!(q.property.name.as_str(), "call" | "apply" | "bind") || (loose && !matches!(q.property.name.as_str(), "addEventListener" | "removeEventListener" | "hasOwnProperty" | "toString" | "disconnect" | "unobserve" | "observe") && !matches!(unwrap(&q.object), Expression::StaticMemberExpression(p) if p.property.name == "prototype") && !matches!(unwrap(&q.object), Expression::ArrayExpression(_) | Expression::StringLiteral(_)) && !matches!(unwrap(&q.object), Expression::Identifier(g) if ["Object", "Array", "Math", "JSON", "Number", "String", "console", "Promise"].iter().any(|n| m.is_global(g, n)))) { add(id, format!(".{}.{name}()", q.property.name), Sends::Any, true); },
                                Expression::ComputedMemberExpression(q) if known_key(q) => match unwrap(&q.expression) { Expression::StringLiteral(k) if sends(&k.value).is_some() => add(id, format!("[\"{}\"].{name}()", k.value), Sends::Any, true), _ => if loose { add(id, format!("[…].{name}()"), Sends::Any, true); } },
                                o => if loose && self.called(mi, o).is_none() && self.solid(mi, o).is_none() { add(id, format!(".{name}() of a function that is not known"), Sends::Any, true); },
                            }
                        }
                        if matches!(name, "assign" | "setPrototypeOf") && matches!(unwrap(&p.object), Expression::Identifier(i) if i.name == "Object") && !c.arguments.first().and_then(|a| a.as_expression()).is_some_and(|a| self.own_object(mi, a)) { add(id, format!("Object.{name}() to an object that is not its own"), Sends::Any, false); }
                        // a list's method that calls what it is given on another `this`
                        if loose && (matches!(name, "forEach" | "map" | "filter" | "some" | "every" | "find" | "findIndex" | "findLast" | "findLastIndex" | "flatMap") && c.arguments.len() > 1 || name == "from" && c.arguments.len() > 2 || c.arguments.iter().any(|a| a.is_spread()) && matches!(name, "forEach" | "map" | "filter" | "some" | "every" | "find")) { add(id, format!(".{name}() with a `this`"), Sends::Any, true); }
                        if name == "getPrototypeOf" && !matches!(m.nodes.parent_kind(m.outer(id)), AstKind::BinaryExpression(_)) { add(id, "getPrototypeOf()".into(), Sends::Any, false); }
                        if matches!(name, "__defineGetter__" | "__defineSetter__") { add(id, format!(".{name}()"), Sends::Any, false); }
                        if name == "constructor" || name == "createContextualFragment" { add(id, format!(".{name}()"), Sends::Any, true); }
                        if name == "createElement" && matches!(c.arguments.first().and_then(|a| a.as_expression()).map(unwrap), Some(Expression::StringLiteral(s)) if s.value.eq_ignore_ascii_case("script") || s.value.eq_ignore_ascii_case("iframe")) { add(id, "a script element, or a frame".into(), Sends::Any, true); }
                        if matches!(name, "assign" | "replace" | "reload" | "go" | "back" | "forward") && ends_with(&p.object, &["location", "history"]) { add(id, format!("location.{name}()"), Sends::Any, true); }
                        if matches!(name, "defineProperty" | "defineProperties") && !c.arguments.first().and_then(|a| a.as_expression()).is_some_and(|a| self.own_object(mi, a)) {
                            let key = c.arguments.get(1).and_then(|a| a.as_expression()).map(unwrap);
                            if !(name == "defineProperty" && matches!(key, Some(Expression::StringLiteral(k)) if !PATCH.contains(&k.value.as_str()) && !OWN.contains(&k.value.as_str()) && !sends(&k.value).is_some() && !methods.contains(k.value.as_str())) || matches!(key, Some(Expression::StaticMemberExpression(k)) if ends_with(&k.object, &["Symbol"]))) { add(id, format!("{name}()"), Sends::Any, false); }
                        }
                        if matches!(name, "getOwnPropertyDescriptor" | "getOwnPropertyDescriptors") { add(id, format!("{name}()"), Sends::Any, true); }
                    }
                    Expression::ComputedMemberExpression(p) => match unwrap(&p.expression) {
                        Expression::StringLiteral(k) => if let Some(s) = sends(&k.value) { add(id, format!("[\"{}\"]()", k.value), s, true); },
                        _ if known_key(p) => {}
                        _ => if !self.own_table(mi, &p.object) { add(id, "a method whose name is computed".into(), Sends::Any, true) },
                    },
                    Expression::Identifier(i) if m.symbol(i).is_none() => { if matches!(i.name.as_str(), "require" | "importScripts") { add(id, format!("{}()", i.name), Sends::Any, false); } else if let Some(s) = sends(&i.name) { add(id, format!("{}()", i.name), s, true); } }
                    _ => {}
                },
                AstKind::NewExpression(x) => if let Expression::Identifier(i) = unwrap(&x.callee) { if m.symbol(i).is_none() && i.name == "XMLHttpRequest" { add(id, format!("new {}", i.name), Sends::Any, true); } },
                AstKind::IdentifierReference(i) if m.symbol(i).is_none() && (matches!(i.name.as_str(), "eval" | "customElements") || (i.name == "Reflect" && !matches!(m.nodes.parent_kind(m.outer(id)), AstKind::StaticMemberExpression(p) if matches!(p.property.name.as_str(), "ownKeys" | "has"))) || (i.name == "Function" && !matches!(m.nodes.parent_kind(m.outer(id)), AstKind::BinaryExpression(_))) || (i.name == "location" && i.reference_id.get().is_some_and(|r| m.scoping.get_reference(r).is_write()))) => add(id, format!("{}", i.name), Sends::Any, false),
                AstKind::TaggedTemplateExpression(t) => match unwrap(&t.tag) { Expression::StaticMemberExpression(p) => if let Some(s) = sends(&p.property.name) { add(id, format!(".{}``", p.property.name), s, true); }, Expression::ComputedMemberExpression(p) if !known_key(p) => add(id, "a tag whose name is computed".into(), Sends::Any, true), _ => {} },
                AstKind::ImportExpression(_) => add(id, "import()".into(), Sends::Any, false),
                AstKind::StaticMemberExpression(p) => {
                    let name = p.property.name.as_str();
                    let o = m.outer(id);
                    if m.is_written(id) {
                        // a property some code calls, given a function that may be a method of the platform's
                        if loose && methods.contains(name) && !self.own_object(mi, &p.object) && match m.nodes.parent_kind(o) { AstKind::AssignmentExpression(a) => self.may_be_taken(mi, &a.right), AstKind::UpdateExpression(_) | AstKind::UnaryExpression(_) => false, _ => true } { add(id, format!("it writes .{name}, which is called"), Sends::Any, false); }
                        if name == "__proto__" { add(id, "it writes .__proto__".into(), Sends::Any, false); }
                        if PATCH.contains(&name) || name == "location" { add(id, format!("it writes .{name}"), Sends::Any, false); }
                        if TREE_WRITES.contains(&name) { add(id, format!("it writes .{name}"), Sends::Tree, true); }
                        if matches!(name, "popover" | "href" | "hash" | "open") && !matches!(unwrap(&p.object), Expression::Identifier(i) if name != "href" && self.literal_object(mi, i)) { add(id, format!("it writes .{name}"), Sends::Any, true); }
                        continue;
                    }
                    // the method itself, taken and not called
                    if let Some(s) = sends(name) {
                        let _ = o;
                        if !self.called_or_tested(mi, id) && !COMMON.contains(&name) && !self.plain_receiver(mi, &p.object, name) { add(id, format!(".{name}, taken"), s, false); }
                    }
                    // the platform's methods, as a table of them
                    if name == "prototype" && !matches!(unwrap(&p.object), Expression::Identifier(g) if matches!(g.name.as_str(), "Object" | "Array" | "Function" | "String" | "Number" | "Map" | "Set" | "Promise" | "Symbol" | "Date" | "RegExp" | "Error")) && !matches!(m.nodes.parent_kind(o), AstKind::StaticMemberExpression(q) if sends(&q.property.name).is_none() && !matches!(q.property.name.as_str(), "constructor" | "__proto__")) && !matches!(m.nodes.parent_kind(o), AstKind::BinaryExpression(_)) { add(id, "it takes a `prototype`".into(), Sends::Any, false); }
                    if (name == "constructor" && !matches!(m.nodes.parent_kind(o), AstKind::BinaryExpression(_) | AstKind::StaticMemberExpression(_))) || matches!(name, "eval" | "Function" | "Reflect" | "customElements" | "__proto__") { add(id, format!("it reads .{name}"), Sends::Any, false); }
                    if event_handler(name) && !matches!(m.nodes.parent_kind(o), AstKind::UnaryExpression(_) | AstKind::IfStatement(_) | AstKind::BinaryExpression(_)) { add(id, format!("it reads .{name}"), Sends::Any, false); }
                }
                // a function under a computed name: `el["add" + "EventListener"] = …`
                AstKind::ComputedMemberExpression(p) if m.is_written(id) && !known_key(p) => if !self.own_object(mi, &p.object) && match m.nodes.parent_kind(m.outer(id)) { AstKind::AssignmentExpression(a) => self.may_be_method(mi, &a.right), AstKind::UpdateExpression(_) | AstKind::UnaryExpression(_) => false, _ => true } { add(id, "it writes a function under a computed name".into(), Sends::Any, false); },
                AstKind::ComputedMemberExpression(p) => {
                    if let Expression::StringLiteral(k) = unwrap(&p.expression) { if loose && m.is_written(id) && methods.contains(k.value.as_str()) && !self.own_object(mi, &p.object) && match m.nodes.parent_kind(m.outer(id)) { AstKind::AssignmentExpression(a) => self.may_be_taken(mi, &a.right), AstKind::UpdateExpression(_) | AstKind::UnaryExpression(_) => false, _ => true } { add(id, format!("it writes [\"{}\"], which is called", k.value), Sends::Any, false); } if PATCH.contains(&k.value.as_str()) || (m.is_written(id) && TREE_WRITES.contains(&k.value.as_str())) { add(id, format!("[\"{}\"]", k.value), Sends::Any, false); } }
                    // a method under a computed name, put where it has a name of its own
                    else if !known_key(p) && matches!(m.nodes.parent_kind(m.outer(id)), AstKind::AssignmentExpression(a) if a.right.span() == m.nodes.kind(m.outer(id)).span() && match &a.left { AssignmentTarget::StaticMemberExpression(l) => methods.contains(l.property.name.as_str()), AssignmentTarget::ComputedMemberExpression(_) => true, _ => false }) { add(id, "a method under a computed name".into(), Sends::Any, true); }
                }
                AstKind::StringLiteral(s) if PATCH.contains(&s.value.as_str()) => if !matches!(m.nodes.parent_kind(id), AstKind::BinaryExpression(b) if b.operator == BinaryOperator::In) { add(id, format!("\"{}\"", s.value), Sends::Any, false); },
                AstKind::BindingProperty(p) if static_key(&p.key, p.computed).is_none() => add(id, "a computed name, taken off something".into(), Sends::Any, false),
                AstKind::AssignmentTargetPropertyProperty(p) => match static_key(&p.name, p.computed) { None => add(id, "a computed name, taken off something".into(), Sends::Any, false), Some(k) => if sends(&k).is_some() || event_handler(&k) { add(id, format!("{k}, taken off something"), Sends::Any, false); } },
                AstKind::AssignmentTargetPropertyIdentifier(p) => if sends(&p.binding.name).is_some() || event_handler(&p.binding.name) { add(id, format!("{}, taken off something", p.binding.name), Sends::Any, false); },
                AstKind::BindingProperty(p) => if let Some(k) = static_key(&p.key, p.computed) { if PATCH.contains(&k.as_str()) || matches!(k.as_str(), "prototype" | "__proto__" | "constructor") || event_handler(&k) || (sends(&k).is_some() && !COMMON.contains(&k.as_str())) { add(id, format!("{k}, taken off something"), sends(&k).unwrap_or(Sends::Any), false); } },
                AstKind::ObjectProperty(p) => if let Some(k) = static_key(&p.key, p.computed) { if PATCH.contains(&k.as_str()) { add(id, format!("a {k} of its own"), Sends::Any, false); } },
                AstKind::MethodDefinition(p) => if static_key(&p.key, p.computed).is_none_or(|k| PATCH.contains(&k.as_str()) || k == "attributeChangedCallback") { if !matches!(&p.key, PropertyKey::StaticMemberExpression(_) | PropertyKey::PrivateIdentifier(_)) { add(id, "a method of its own that may be a target's".into(), Sends::Any, false); } },
                AstKind::PropertyDefinition(p) => if static_key(&p.key, p.computed).is_some_and(|k| PATCH.contains(&k.as_str())) { add(id, "a method of its own that may be a target's".into(), Sends::Any, false); },
                _ => {}
            }
        }
    }
    fn called_or_tested(&self, mi: usize, id: NodeId) -> bool {
        let m = self.m(mi);
        let o = m.outer(id);
        match m.nodes.parent_kind(o) { AstKind::CallExpression(c) => c.callee.span() == m.nodes.kind(o).span(), AstKind::UnaryExpression(_) | AstKind::IfStatement(_) | AstKind::BinaryExpression(_) | AstKind::StaticMemberExpression(_) | AstKind::TemplateLiteral(_) => true, _ => false }
    }
    /// That nothing the import loads puts its own in the place of what runs a callback later.
    pub fn unpatched(&self, f: FnAt) -> Result<(), Why> {
        if self.patched.borrow().is_none() {
            let (mut todo, mut done, mut hit) = (vec![self.entry], BTreeSet::new(), None);
            while let Some(i) = todo.pop() {
                if !done.insert(i) { continue; }
                let m = self.m(i);
                for s in m.specs() { if !graph::is_solid(s) { if let Ok(j) = self.mods.open(self.h, &self.mods.find(self.h, self.hi, s, i)) { todo.push(j); } } }
                if let Some(w) = m.banned { hit = Some((i, m.program.span, w.to_string())); }
                for n in m.nodes.iter() {
                    let k = match n.kind() { AstKind::StaticMemberExpression(p) if m.is_written(n.id()) => p.property.name.as_str(), AstKind::ComputedMemberExpression(p) if m.is_written(n.id()) => match unwrap(&p.expression) { Expression::StringLiteral(s) => s.value.as_str(), _ => continue }, AstKind::IdentifierReference(x) if m.symbol(x).is_none() && x.reference_id.get().is_some_and(|r| m.scoping.get_reference(r).is_write()) => x.name.as_str(), _ => continue };
                    if OWN.contains(&k) { hit = Some((i, n.kind().span(), format!("it writes {k}"))); }
                }
            }
            *self.patched.borrow_mut() = Some(hit);
        }
        match self.patched.borrow().as_ref().unwrap() { None => Ok(()), Some((m, at, w)) => { let _ = f; Err(Why { why: format!("what the import loads may replace a part of the platform: {w}"), module: *m, at: at.start }) } }
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
            Expression::NewExpression(n) => plain_new(m, n, name),
            Expression::Identifier(i) => {
                let Some(s) = m.symbol(i).filter(|s| m.known_symbol(*s)) else { return matches!(i.name.as_str(), "console" | "Math" | "JSON") && m.symbol(i).is_none() };
                matches!(m.nodes.kind(m.scoping.symbol_declaration(s)), AstKind::VariableDeclarator(v) if matches!(v.id, BindingPattern::BindingIdentifier(_)) && matches!(v.init.as_ref().map(unwrap), Some(Expression::NewExpression(n)) if plain_new(m, n, name)))
            }
            _ => false,
        }
    }
    /// An object literal of the code's own under a name, whatever its method names are: each is a function of the code's.
    fn literal_object(&self, mi: usize, i: &IdentifierReference<'a>) -> bool {
        let m = self.m(mi);
        m.symbol(i).is_some_and(|s| m.known_symbol(s) && matches!(m.nodes.kind(m.scoping.symbol_declaration(s)), AstKind::VariableDeclarator(v) if matches!(v.id, BindingPattern::BindingIdentifier(_)) && matches!(v.init.as_ref().map(unwrap), Some(Expression::ObjectExpression(_) | Expression::ArrayExpression(_)))))
    }
    /// An object literal of the code's own, written there or under a name.
    fn own_object(&self, mi: usize, e: &'m Expression<'a>) -> bool { match unwrap(e) { Expression::Identifier(i) => self.literal_object(mi, i) || self.accumulates(mi, i), Expression::ObjectExpression(_) | Expression::ArrayExpression(_) => true, Expression::StaticMemberExpression(p) => matches!(p.property.name.as_str(), "style" | "dataset"), _ => false } }
    /// `list.reduce((made, x) => { … }, {})`: the object it makes.
    fn accumulates(&self, mi: usize, i: &IdentifierReference<'a>) -> bool {
        let m = self.m(mi);
        let Some(s) = m.symbol(i).filter(|s| m.known_symbol(*s)) else { return false };
        let Some(f) = m.function_of(m.scoping.symbol_declaration(s)) else { return false };
        let Some((params, ..)) = self.parts(FnAt { module: mi, node: f }) else { return false };
        if !matches!(params.items.first().map(|p| &p.pattern), Some(BindingPattern::BindingIdentifier(b)) if b.symbol_id.get() == Some(s)) { return false; }
        let o = m.outer(f);
        let at = m.nodes.kind(o).span();
        // (what it answers is what it is given next)
        let same = match m.nodes.kind(f) { AstKind::ArrowFunctionExpression(_) | AstKind::Function(_) => m.nodes.iter().filter(|n| m.function_of(n.id()) == Some(f)).all(|n| !matches!(n.kind(), AstKind::ReturnStatement(r) if !matches!(r.argument.as_ref().map(unwrap), Some(Expression::Identifier(x)) if m.symbol(x) == Some(s)))), _ => false };
        same && matches!(m.nodes.parent_kind(o), AstKind::CallExpression(c) if c.arguments.len() == 2 && c.arguments[0].span() == at && matches!(c.arguments[1].as_expression().map(unwrap), Some(Expression::ObjectExpression(_) | Expression::ArrayExpression(_))) && matches!(unwrap(&c.callee), Expression::StaticMemberExpression(p) if p.property.name == "reduce")) && matches!(self.parts(FnAt { module: mi, node: f }), Some((_, Ok(_), ..)))
    }
    /// Anything but what cannot be a method of the platform's: a literal, a function of the code's, an operator's answer.
    fn may_be_taken(&self, mi: usize, e: &'m Expression<'a>) -> bool {
        let m = self.m(mi);
        match unwrap(e) {
            Expression::ArrowFunctionExpression(_) | Expression::FunctionExpression(_) | Expression::ClassExpression(_) | Expression::StringLiteral(_) | Expression::NumericLiteral(_) | Expression::BooleanLiteral(_) | Expression::NullLiteral(_) | Expression::TemplateLiteral(_) | Expression::BinaryExpression(_) | Expression::UnaryExpression(_) | Expression::UpdateExpression(_) | Expression::ObjectExpression(_) | Expression::ArrayExpression(_) | Expression::NewExpression(_) | Expression::RegExpLiteral(_) => false,
            Expression::Identifier(i) => match m.symbol(i) { None => i.name != "undefined", Some(_) if self.called(mi, e).is_some() || self.solid(mi, e).is_some() => false, Some(s) => !matches!(m.nodes.kind(m.scoping.symbol_declaration(s)), AstKind::VariableDeclarator(v) if m.known_symbol(s) && matches!(v.id, BindingPattern::BindingIdentifier(_)) && v.init.as_ref().is_some_and(|e| !matches!(unwrap(e), Expression::Identifier(_)) && !self.may_be_taken(mi, e))) },
            Expression::ConditionalExpression(c) => self.may_be_taken(mi, &c.consequent) || self.may_be_taken(mi, &c.alternate),
            Expression::LogicalExpression(l) => self.may_be_taken(mi, &l.left) || self.may_be_taken(mi, &l.right),
            _ => true,
        }
    }
    /// A function written out, or a name that is one.
    fn may_be_method(&self, mi: usize, e: &'m Expression<'a>) -> bool {
        let m = self.m(mi);
        match unwrap(e) {
            Expression::ArrowFunctionExpression(_) | Expression::FunctionExpression(_) | Expression::CallExpression(_) | Expression::ClassExpression(_) => true,
            Expression::Identifier(i) => m.symbol(i).is_some() && !matches!(m.symbol(i).filter(|s| m.known_symbol(*s)).map(|s| m.nodes.kind(m.scoping.symbol_declaration(s))), Some(AstKind::VariableDeclarator(v)) if v.init.as_ref().is_some_and(|e| matches!(unwrap(e), Expression::StringLiteral(_) | Expression::NumericLiteral(_) | Expression::ObjectExpression(_) | Expression::ArrayExpression(_) | Expression::NewExpression(_)))),
            Expression::ConditionalExpression(c) => self.may_be_method(mi, &c.consequent) || self.may_be_method(mi, &c.alternate),
            Expression::LogicalExpression(l) => self.may_be_method(mi, &l.left) || self.may_be_method(mi, &l.right),
            Expression::AssignmentExpression(a) => self.may_be_method(mi, &a.right),
            Expression::StaticMemberExpression(_) | Expression::ComputedMemberExpression(_) | Expression::ChainExpression(_) | Expression::SequenceExpression(_) => true,
            _ => false,
        }
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
fn plain_new(m: &graph::Module, n: &NewExpression, name: &str) -> bool {
    let Expression::Identifier(i) = unwrap(&n.callee) else { return false };
    if m.symbol(i).is_some() { return false; }
    if matches!(i.name.as_str(), "Map" | "Set" | "WeakMap" | "WeakSet" | "FormData" | "URLSearchParams" | "Headers" | "ResizeObserver" | "IntersectionObserver") { return true; }
    // (what these close or send, they say later)
    matches!(name, "close" | "open" | "send") && matches!(i.name.as_str(), "EventSource" | "WebSocket" | "BroadcastChannel" | "Notification" | "AudioContext" | "RTCPeerConnection")
}
/// A key that is written there.
fn known_key(p: &ComputedMemberExpression) -> bool { match unwrap(&p.expression) { Expression::StringLiteral(_) | Expression::NumericLiteral(_) => true, Expression::StaticMemberExpression(s) => matches!(unwrap(&s.object), Expression::Identifier(i) if i.name == "Symbol"), _ => false } }
/// `location`, `window.location`, `history`.
fn ends_with(e: &Expression, names: &[&str]) -> bool { match unwrap(e) { Expression::Identifier(i) => names.contains(&i.name.as_str()), Expression::StaticMemberExpression(p) => names.contains(&p.property.name.as_str()), _ => false } }
