//! Where the code of a package could send an event, or call a listener, while a call of its own runs (DESIGN.md, `handler`).
//! A list of what may be done, not of what may not: every member the code calls, takes, or writes, whose name is one of the
//! platform's (platform.txt: lib.dom of TypeScript 5.9, the members Chromium 143 has), must be listed here as one that sends
//! nothing before it answers, or be of an object the code made itself. Every file the package loads is read, from every entry
//! it has; a place in a listener, in a timer or after an `await` is a place.
use super::constant::{static_key, unwrap};
use super::eval::FnAt;
use super::graph::{self, Module, Origin};
use super::patch::{key_text, numeric, own};
use super::place::{Place, Why};
use oxc_ast::{ast::*, AstKind};
use oxc_semantic::NodeId;
use oxc_span::{GetSpan, Span};
use std::collections::{BTreeSet, HashMap, HashSet};

/// Which events a place may send.
#[derive(Clone, Copy, PartialEq, Debug)]
pub enum Sends { Any, Focus, Tree, Frame }
pub struct Place0 { pub module: usize, pub at: Span, pub what: String, pub sends: Sends }
/// What a package's code was found to do, under a host.
#[derive(Default)]
pub struct Scan {
    pub sends: Vec<Place0>,
    /// It may put its own in the place of what runs a callback later (a timer, a listener's method), or is not read whole.
    pub writes: Option<Place0>,
    /// It may make an object with a member whose name is computed: one that is typed as the platform's target and is none.
    pub claims: bool,
    /// It reads a member whose name is computed off what the program gave it (which may be a method of the platform's), and puts
    /// what may be one where it is called as a method: both, and it may send.
    taken: bool,
    puts: Option<Place0>,
}

const FOCUS: &[&str] = &["focus", "blur", "addRange", "setBaseAndExtent", "selectAllChildren", "removeAllRanges", "select", "setSelectionRange", "collapse", "extend"];
const TREE: &[&str] = &["remove", "removeChild", "replaceChild", "replaceWith", "replaceChildren", "append", "appendChild", "prepend", "insertBefore", "insertAdjacentElement", "insertAdjacentText", "before", "after", "add"];
/// What lib.dom and the language have that sends nothing before it answers: reads, what only asks (its answer comes in a task
/// or a promise), what changes no focus and no tree.
const SAFE: &[&str] = &[
    // the language's
    "charAt", "charCodeAt", "codePointAt", "at", "endsWith", "startsWith", "includes", "indexOf", "lastIndexOf", "normalize", "padEnd", "padStart", "repeat", "slice", "substring", "substr", "toLowerCase", "toUpperCase", "trim", "trimStart", "trimEnd", "toString", "valueOf", "toFixed", "toPrecision", "concat", "search", "replaceAll", "match", "matchAll", "split", "localeCompare", "toLocaleString", "toLocaleLowerCase", "toLocaleUpperCase", "push", "pop", "shift", "unshift", "splice", "sort", "reverse", "fill", "map", "filter", "findLast", "findIndex", "findLastIndex", "some", "every", "forEach", "flatMap", "reduce", "reduceRight", "toSpliced", "with", "flat", "toReversed", "toSorted", "join", "keys", "values", "entries", "has", "get", "set", "delete", "clear", "then", "catch", "finally", "test", "exec", "random", "abs", "floor", "ceil", "round", "max", "min", "pow", "sqrt", "cbrt", "trunc", "sign", "hypot", "sin", "cos", "tan", "atan", "atan2", "exp", "log", "log2", "log10", "stringify", "parse", "isArray", "of", "from", "create", "freeze", "hasOwn", "is", "isNaN", "isFinite", "isInteger", "isSafeInteger", "parseInt", "parseFloat", "fromCharCode", "fromCodePoint", "resolve", "reject", "all", "race", "allSettled", "any", "next", "return", "hasOwnProperty", "isPrototypeOf", "getOwnPropertyNames", "getOwnPropertySymbols", "now", "getTime", "getFullYear", "getMonth", "getDate", "getDay", "getHours", "getMinutes", "getSeconds", "toISOString", "for", "isSubsetOf", "isSupersetOf", "isDisjointFrom", "union", "intersection", "difference", "symmetricDifference", "withResolvers", "format", "warn", "error", "info", "debug",
    // the platform's
    "addEventListener", "removeEventListener", "addListener", "removeListener", "preventDefault", "stopPropagation", "stopImmediatePropagation", "composedPath", "matchMedia", "matches", "closest", "contains", "querySelector", "querySelectorAll", "getElementById", "getRootNode", "getAttribute", "hasAttribute", "getBoundingClientRect", "getClientRects", "getComputedStyle", "getPropertyValue", "setProperty", "removeProperty", "toggle", "observe", "unobserve", "disconnect", "takeRecords", "postMessage", "setPointerCapture", "releasePointerCapture", "hasPointerCapture", "setTimeout", "setInterval", "clearTimeout", "clearInterval", "queueMicrotask", "requestAnimationFrame", "cancelAnimationFrame", "requestIdleCallback", "cancelIdleCallback", "requestVideoFrameCallback", "cancelVideoFrameCallback", "play", "pause", "fastSeek", "getItem", "setItem", "removeItem", "getTimezoneOffset", "scrollTo", "scrollBy", "watchPosition", "getCurrentPosition", "clearWatch", "getRandomValues", "randomUUID", "getDirectoryHandle", "getFileHandle", "getFile", "createWritable", "removeEntry", "showDirectoryPicker", "text", "json", "getType", "getBattery", "isPointInPath", "seek", "type", "key", "time", "count", "index", "complete", "features", "metadata", "persisted", "firstChild", "lastChild", "parentNode", "nextSibling", "previousSibling", "timeStamp", "context", "group", "inverse", "scale", "rotate", "translate", "transform", "repeat", "percent",
];
/// What may be written: no event before the write is done (what one sends of it, it queues), no focus, no tree.
const SAFE_WRITES: &[&str] = &["value", "checked", "disabled", "className", "id", "title", "name", "tabIndex", "scrollTop", "scrollLeft", "currentTime", "volume", "muted", "defaultMuted", "autoplay", "loop", "preload", "playbackRate", "srcObject", "dropEffect", "effectAllowed", "length", "lastIndex", "message", "cause", "stack", "cssText", "returnValue", "binaryType", "width", "height", "x", "y", "z", "left", "top", "right", "bottom", "d", "r", "a", "b", "c", "e", "f", "g", "data", "key", "code", "type", "label", "start", "end", "min", "max", "step", "index", "size", "color", "opacity", "transform", "offset", "state", "status", "options", "config", "parent", "prev", "next", "current", "count", "active", "done", "result", "error", "duration", "delay", "speed", "direction", "mode", "enabled", "kind", "source", "root", "element", "path", "args", "context", "items"];
const TREE_WRITES: &[&str] = &["innerHTML", "outerHTML", "innerText", "outerText", "textContent", "nodeValue"];
/// Functions of the global object, and what may be made with `new`.
const GLOBAL_CALLS: &[&str] = &["setTimeout", "setInterval", "clearTimeout", "clearInterval", "queueMicrotask", "requestAnimationFrame", "cancelAnimationFrame", "requestIdleCallback", "cancelIdleCallback", "matchMedia", "getComputedStyle", "addEventListener", "removeEventListener", "parseInt", "parseFloat", "isNaN", "isFinite", "encodeURIComponent", "decodeURIComponent", "encodeURI", "decodeURI", "String", "Number", "Boolean", "Symbol", "BigInt", "Array", "Error", "TypeError", "RangeError", "Date", "fetch", "structuredClone", "atob", "btoa", "scrollTo", "scrollBy"];
const GLOBAL_NEW: &[&str] = &["Map", "Set", "WeakMap", "WeakSet", "WeakRef", "Array", "Date", "Promise", "RegExp", "Error", "TypeError", "RangeError", "Proxy", "URL", "URLSearchParams", "Headers", "FormData", "Blob", "File", "Event", "CustomEvent", "ResizeObserver", "IntersectionObserver", "MutationObserver", "PerformanceObserver", "EventSource", "WebSocket", "Worker", "SharedWorker", "BroadcastChannel", "Image", "Audio", "TextEncoder", "TextDecoder", "Uint8Array", "Float32Array", "Float64Array", "Int32Array", "Request", "Response", "Notification", "DOMRect", "DOMMatrix", "DOMPoint", "Intl"];
const GLOBAL_VALUES: &[&str] = &["undefined", "NaN", "Infinity", "Math", "JSON", "Object", "Array", "String", "Number", "Boolean", "Symbol", "BigInt", "Promise", "Map", "Set", "WeakMap", "WeakSet", "WeakRef", "Error", "TypeError", "RangeError", "RegExp", "Date", "Intl", "Proxy", "console", "performance", "crypto", "navigator", "screen", "window", "document", "globalThis", "self", "localStorage", "sessionStorage", "location", "history", "CSS", "process", "arguments", "Element", "HTMLElement", "Node", "Document", "Window", "EventTarget", "Event", "SVGElement", "ShadowRoot", "Text", "ResizeObserver", "IntersectionObserver", "MutationObserver", "URL", "Blob", "File", "FormData", "AbortSignal", "Notification", "Image", "Audio", "Uint8Array", "HTMLInputElement", "HTMLMediaElement", "HTMLVideoElement", "HTMLAudioElement", "HTMLButtonElement", "HTMLTextAreaElement", "HTMLSelectElement", "HTMLFormElement", "HTMLAnchorElement", "HTMLTableElement", "KeyboardEvent", "PointerEvent", "MouseEvent", "TouchEvent", "FocusEvent", "ClipboardItem", "DOMException", "setTimeout", "setInterval", "clearTimeout", "clearInterval", "queueMicrotask", "requestAnimationFrame", "cancelAnimationFrame", "parseInt", "parseFloat", "isNaN", "isFinite"];
/// What Solid exports that sends nothing (its own insertion of a view is any program's).
const SOLID: &[&str] = &["createSignal", "createMemo", "createEffect", "createRenderEffect", "createTrackedEffect", "createStore", "createProjection", "createOptimistic", "createOptimisticStore", "createRoot", "createOwner", "createContext", "useContext", "createComponent", "createUniqueId", "onCleanup", "onSettled", "getOwner", "getObserver", "runWithOwner", "untrack", "flush", "merge", "mergeProps", "omit", "children", "lazy", "isServer", "isDev", "DEV", "mapArray", "repeat", "reconcile", "snapshot", "isEqual", "isPending", "latest", "until", "refresh", "resolve", "action", "deep", "For", "Show", "Switch", "Match", "Repeat", "Loading", "Errored", "Reveal", "Portal", "Dynamic", "dynamic", "insert", "template", "effect", "memo", "spread", "ref", "className", "style", "setStyleProperty", "addEvent", "delegateEvents", "getNextElement", "getNextMarker", "scope", "ssr", "ssrElement", "ssrHydrationKey", "ssrAttribute", "ssrClassName", "ssrStyle", "escape", "NotReadyError", "createDeferred", "createReaction", "from", "$PROXY", "$TRACK", "sharedConfig", "isWrappable", "markRaw", "equalFn"];
/// What a callback is handed to that runs it later, and what a target is found with: the platform's own, unless the code puts another in its place.
const LATER: &[&str] = &["setTimeout", "setInterval", "queueMicrotask", "requestAnimationFrame", "requestIdleCallback", "addEventListener", "removeEventListener", "dispatchEvent", "matchMedia", "createElement", "getElementById", "querySelector", "querySelectorAll", "closest", "getRootNode", "watchPosition", "getCurrentPosition", "then", "catch", "finally", "resolve", "all", "race", "any", "allSettled", "bind", "observe", "entries", "values", "from"];
const WINDOWS: &[&str] = &["window", "globalThis", "self", "frames", "top", "parent", "opener"];
/// What is read off a target or an event and is the global object.
const VIEWS: &[&str] = &["defaultView", "contentWindow", "opener", "view"];

pub struct Names { methods: HashSet<&'static str>, set: HashSet<&'static str> }
thread_local! {
    static NAMES: Names = { let mut l = include_str!("platform.txt").lines().map(|l| l.split(' ').collect::<HashSet<_>>()); Names { methods: l.next().unwrap_or_default(), set: l.next().unwrap_or_default() } };
    static SAFE_SET: HashSet<&'static str> = SAFE.iter().copied().collect();
    static GLOBALS: HashSet<&'static str> = GLOBAL_VALUES.iter().chain(GLOBAL_CALLS).chain(GLOBAL_NEW).copied().collect();
}
fn method(n: &str) -> bool { NAMES.with(|x| x.methods.contains(n)) || event_handler(n) }
fn settable(n: &str) -> bool { NAMES.with(|x| x.set.contains(n)) }
fn safe(n: &str) -> bool { SAFE_SET.with(|s| s.contains(n)) }
fn event_handler(n: &str) -> bool { n.starts_with("$$") || (n.len() > 2 && n.starts_with("on") && n.bytes().all(|b| b.is_ascii_lowercase())) }
/// What a call of a member may send, where its receiver may be the platform's.
fn sends(n: &str) -> Option<Sends> {
    if FOCUS.contains(&n) { Some(Sends::Focus) } else if TREE.contains(&n) { Some(Sends::Tree) } else if method(n) && !safe(n) { Some(Sends::Any) } else { None }
}
/// Whether a place that sends those may send one of the events listened to (`None`: their names are not known).
fn meets(s: Sends, events: &Option<BTreeSet<String>>) -> bool {
    let Some(ev) = events else { return true };
    let of = |l: &[&str]| ev.iter().any(|e| l.contains(&e.as_str()));
    const FOCUSED: &[&str] = &["focus", "blur", "focusin", "focusout", "change", "select", "selectstart", "selectionchange", "beforeinput", "input", "compositionstart", "compositionupdate", "compositionend", "textinput", "invalid"];
    match s {
        Sends::Any => true,
        Sends::Focus => of(FOCUSED),
        Sends::Frame => of(&["load", "unload", "beforeunload", "pagehide", "pageshow", "visibilitychange"]),
        Sends::Tree => of(FOCUSED) || of(&["load", "error", "unload", "beforeunload", "pagehide", "pageshow", "visibilitychange", "toggle", "beforetoggle", "slotchange", "DOMNodeInserted", "DOMNodeRemoved", "DOMSubtreeModified", "DOMNodeInsertedIntoDocument", "DOMNodeRemovedFromDocument", "fullscreenchange", "readystatechange", "cancel", "close"]),
    }
}

/// The functions at the top of a module, each by its name's symbol; and where each name of the top is named, in order.
struct Tops { apart: HashMap<usize, Span>, refs: Vec<(u32, oxc_syntax::symbol::SymbolId)> }

impl<'m, 'a, 'r> Place<'m, 'a, 'r> {
    /// That nothing the package loads sends those events while a call of it runs.
    pub fn quiet(&self, events: &Option<BTreeSet<String>>) -> Result<(), Why> {
        let scan = self.scan();
        match scan.sends.iter().find(|p| meets(p.sends, events)) {
            None => Ok(()),
            Some(p) => Err(Why { why: format!("it listens, and the package's code may send what it listens to while a call runs: {}", p.what), module: p.module, at: p.at.start }),
        }
    }
    /// That nothing the package loads puts its own in the place of what runs a callback later.
    pub fn unpatched(&self) -> Result<(), Why> {
        match &self.scan().writes { None => Ok(()), Some(p) => Err(Why { why: format!("what the package loads may replace a part of the platform: {}", p.what), module: p.module, at: p.at.start }) }
    }
    pub fn scan(&self) -> std::rc::Rc<Scan> {
        let key = (self.hi, self.entry);
        if let Some(s) = self.mods.scans.borrow().get(&key) { return s.clone(); }
        let s = std::rc::Rc::new(self.scan_now());
        self.mods.scans.borrow_mut().insert(key, s.clone());
        s
    }
    fn scan_now(&self) -> Scan {
        let mut out = Scan::default();
        let whole = |m: usize, at: Span, what: String| Place0 { module: m, at, what, sends: Sends::Any };
        let entries = match self.mods.package(self.h, self.hi, self.entry) {
            Ok(e) => e,
            Err(w) => { out.writes = Some(whole(self.entry, Span::new(0, 0), w.clone())); out.sends.push(whole(self.entry, Span::new(0, 0), w)); return out; }
        };
        let (mut todo, mut done) = (entries.clone(), BTreeSet::new());
        while let Some(i) = todo.pop() {
            if !done.insert(i) { continue; }
            let m = self.m(i);
            for s in m.specs() {
                if graph::is_solid(s) { continue; }
                match self.mods.open(self.h, &self.mods.find(self.h, self.hi, s, i)) {
                    Ok(j) => todo.push(j),
                    Err(Origin::Never) => {}
                    Err(_) => { let w = format!("it loads {s}, which is not read"); out.sends.push(whole(i, Span::new(0, 0), w.clone())); out.writes.get_or_insert(whole(i, Span::new(0, 0), w)); }
                }
            }
            if let Some(w) = m.banned { out.sends.push(whole(i, Span::new(0, 0), w.into())); out.writes.get_or_insert(whole(i, Span::new(0, 0), w.into())); }
        }
        let tops: HashMap<usize, Tops> = done.iter().map(|i| (*i, self.tops(*i))).collect();
        let used = self.used(&done, &entries, &tops);
        for i in &done {
            let mut skip: Vec<Span> = tops[i].apart.iter().filter(|(s, _)| !used.contains(&(*i, **s))).map(|x| *x.1).collect();
            skip.sort_unstable_by_key(|s| s.start);
            self.module_scan(*i, &skip, &mut out);
        }
        if let (true, Some(p)) = (out.taken, out.puts.take()) { out.sends.push(p); }
        out
    }
    /// The functions at the top of a module that the package's entries, and the code that runs as the modules load, can reach by name.
    fn used(&self, modules: &BTreeSet<usize>, entries: &[usize], tops: &HashMap<usize, Tops>) -> HashSet<(usize, usize)> {
        let mut used = HashSet::new();
        let mut todo: Vec<(usize, Span)> = vec![];
        let reach = |o: Origin<'a>, used: &mut HashSet<(usize, usize)>, todo: &mut Vec<(usize, Span)>| match o {
            Origin::Symbol(m, s) => { if used.insert((m, s.index())) { if let Some(at) = tops.get(&m).and_then(|t| t.apart.get(&s.index())) { todo.push((m, *at)); } } }
            Origin::Ns(m) => if let Some(t) = tops.get(&m) { for (s, at) in &t.apart { if used.insert((m, *s)) { todo.push((m, *at)); } } },
            _ => {}
        };
        for e in entries {
            match self.mods.every_name(self.h, self.hi, *e) {
                Some(names) => for n in names { reach(self.mods.exported(self.h, self.hi, *e, &n, &mut vec![]), &mut used, &mut todo); },
                None => for m in modules { reach(Origin::Ns(*m), &mut used, &mut todo); },
            }
        }
        for i in modules {
            let m = self.m(*i);
            let mut at: Vec<Span> = tops[i].apart.values().copied().collect();
            at.sort_unstable_by_key(|s| s.start);
            for st in &m.program.body {
                if matches!(st, Statement::ExportNamedDeclaration(_) | Statement::ExportFromDeclaration(_) | Statement::ExportAllDeclaration(_) | Statement::ImportDeclaration(_)) { continue; }
                let span = st.span();
                let mut from = span.start;
                let k = at.partition_point(|s| s.start < span.start);
                for s in at[k..].iter().take_while(|s| s.start < span.end) { todo.push((*i, Span::new(from, s.start))); from = s.end; }
                todo.push((*i, Span::new(from, span.end)));
            }
        }
        while let Some((i, at)) = todo.pop() {
            let t = &tops[&i];
            let k = t.refs.partition_point(|r| r.0 < at.start);
            for (_, s) in t.refs[k..].iter().take_while(|r| r.0 < at.end) { reach(self.mods.symbol(self.h, self.hi, i, *s, &mut vec![]), &mut used, &mut todo); }
        }
        used
    }
    fn tops(&self, mi: usize) -> Tops {
        let m = self.m(mi);
        let mut apart = HashMap::new();
        for st in &m.program.body {
            let d = match st { Statement::VariableDeclaration(d) => Some(&**d), Statement::ExportDeclaration(x) => match &x.declaration { Declaration::VariableDeclaration(d) => Some(&**d), _ => None }, _ => None };
            if let Some(d) = d { for v in &d.declarations { if let (BindingPattern::BindingIdentifier(b), Some(Expression::ArrowFunctionExpression(_) | Expression::FunctionExpression(_))) = (&v.id, v.init.as_ref()) { if let Some(s) = b.symbol_id.get() { apart.insert(s.index(), v.span); } } } }
            let f = match st { Statement::FunctionDeclaration(f) => Some(&**f), Statement::ExportDeclaration(x) => match &x.declaration { Declaration::FunctionDeclaration(f) => Some(&**f), _ => None }, _ => None };
            if let Some(f) = f { if let Some(s) = f.id.as_ref().and_then(|i| i.symbol_id.get()) { apart.insert(s.index(), f.span); } }
        }
        let mut refs: Vec<(u32, oxc_syntax::symbol::SymbolId)> = m.nodes.iter().filter_map(|n| match n.kind() { AstKind::IdentifierReference(x) => m.symbol(x).filter(|s| m.at_top(*s)).map(|s| (x.span.start, s)), _ => None }).collect();
        refs.sort_unstable_by_key(|r| r.0);
        Tops { apart, refs }
    }
    fn module_scan(&self, mi: usize, skip: &[Span], out: &mut Scan) {
        let m = self.m(mi);
        let mut sent: Vec<(Span, String, Sends)> = vec![];
        let mut wrote: Vec<(Span, String)> = vec![];
        let (mut claims, mut taken) = (false, false);
        for n in m.nodes.iter() {
            let (id, kind) = (n.id(), n.kind());
            let at = kind.span();
            if !skip.is_empty() { let k = skip.partition_point(|s| s.start <= at.start); if k > 0 && skip[k - 1].contains_inclusive(at) { continue; } }
            let mut send = |what: String, s: Sends| sent.push((at, what, s));
            match kind {
                AstKind::CallExpression(c) => self.call_scan(mi, c, &mut send, &mut |w| wrote.push((at, w)), &mut claims),
                AstKind::TaggedTemplateExpression(t) => match unwrap(&t.tag) {
                    Expression::StaticMemberExpression(p) => if let Some(s) = sends(&p.property.name) { send(format!(".{}``", p.property.name), s); },
                    Expression::Identifier(i) if m.symbol(i).is_some() => {}
                    _ => send("a tag that is not followed".into(), Sends::Any),
                },
                AstKind::NewExpression(x) => match unwrap(&x.callee) {
                    Expression::Identifier(i) if m.symbol(i).is_some() => {}
                    Expression::Identifier(i) if GLOBAL_NEW.contains(&i.name.as_str()) => if i.name == "Proxy" { claims = true; },
                    // (`new globalThis.X`)
                    Expression::StaticMemberExpression(p) if GLOBAL_NEW.contains(&p.property.name.as_str()) && p.property.name != "Proxy" && matches!(unwrap(&p.object), Expression::Identifier(g) if m.symbol(g).is_none() && matches!(g.name.as_str(), "globalThis" | "window" | "Intl")) => {}
                    Expression::StaticMemberExpression(p) if matches!(unwrap(&p.object), Expression::Identifier(g) if m.symbol(g).is_none() && g.name == "Intl") => {}
                    _ => send("it makes an object of a class that is not known".into(), Sends::Any),
                },
                AstKind::IdentifierReference(i) if m.symbol(i).is_none() => {
                    if i.reference_id.get().is_some_and(|r| !m.scoping.get_reference(r).is_value()) { continue; }
                    let n = i.name.as_str();
                    if i.reference_id.get().is_some_and(|r| m.scoping.get_reference(r).is_write()) { send(format!("it writes {n}"), Sends::Any); wrote.push((at, format!("it writes {n}"))); continue; }
                    if !GLOBALS.with(|g| g.contains(n)) && !typeof_only(m, id) { send(format!("it uses {n}"), Sends::Any); }
                    if WINDOWS.contains(&n) && !self.window_stays(mi, id, 0) { send(format!("{n} goes where it is not followed"), Sends::Any); wrote.push((at, format!("{n} goes where it is not followed"))); }
                }
                AstKind::IdentifierReference(i) => if let Some(Origin::Solid(s)) = self.name(mi, i) { if !SOLID.contains(&s) { send(format!("it uses Solid's {s}"), Sends::Any); } },
                AstKind::ImportExpression(_) => { send("import()".into(), Sends::Any); wrote.push((at, "import()".into())); }
                AstKind::StaticMemberExpression(p) => {
                    let name = p.property.name.as_str();
                    if m.is_written(id) { if out.puts.is_none() && !own(m, &p.object, 0) && !self.made(mi, &p.object, 0) && value_of(m, id).is_none_or(|v| !self.no_method(mi, v)) { out.puts = Some(Place0 { module: mi, at, what: format!("it writes .{name}, of what may be a method"), sends: Sends::Any }); } self.write_scan(mi, name, &p.object, value_of(m, id), &mut send, &mut |w| wrote.push((at, w))); continue; }
                    if matches!(unwrap(&p.object), Expression::Identifier(i) if matches!(self.name(mi, i), Some(Origin::SolidNs))) { if !SOLID.contains(&name) { send(format!("it uses Solid's {name}"), Sends::Any); } continue; }
                    if matches!(unwrap(&p.object), Expression::Identifier(i) if matches!(self.name(mi, i), Some(Origin::Ns(_)))) { continue; }
                    if (VIEWS.contains(&name) || WINDOWS.contains(&name) && matches!(unwrap(&p.object), Expression::Identifier(g) if m.symbol(g).is_none() && WINDOWS.contains(&g.name.as_str())) || WINDOWS.contains(&name) && matches!(unwrap(&p.object), Expression::StaticMemberExpression(q) if VIEWS.contains(&q.property.name.as_str()))) && !called(m, id) && !self.window_stays(mi, id, 0) && !own(m, &p.object, 0) { send(format!(".{name} goes where it is not followed"), Sends::Any); }
                    if called(m, id) || tested(m, id) { continue; }
                    // a method, taken
                    if let Some(s) = sends(name) { if !self.plain(mi, &p.object, name) { send(format!(".{name}, taken"), if s == Sends::Tree || s == Sends::Focus { s } else { Sends::Any }); } }
                    if matches!(name, "prototype" | "__proto__") && !matches!(m.nodes.parent_kind(m.outer(id)), AstKind::StaticMemberExpression(q) if safe(&q.property.name)) { send(format!("it takes a {name}"), Sends::Any); wrote.push((at, format!("it takes a {name}"))); }
                }
                AstKind::ComputedMemberExpression(p) => {
                    let key = key_text(m, &p.expression, 0);
                    if m.is_written(id) {
                        if out.puts.is_none() && !own(m, &p.object, 0) && !self.made(mi, &p.object, 0) && value_of(m, id).is_none_or(|v| !self.no_method(mi, v)) { out.puts = Some(Place0 { module: mi, at, what: "it writes a member, of what may be a method".into(), sends: Sends::Any }); }
                        match &key {
                            Some(k) => self.write_scan(mi, k, &p.object, value_of(m, id), &mut send, &mut |w| wrote.push((at, w))),
                            None if numeric(m, &p.expression, 0) || symbol(m, &p.expression) || own(m, &p.object, 0) || self.made(mi, &p.object, 0) => if !matches!(value_of(m, id).map(unwrap), Some(Expression::StringLiteral(_) | Expression::NumericLiteral(_) | Expression::BooleanLiteral(_) | Expression::NullLiteral(_))) && !numeric(m, &p.expression, 0) && !symbol(m, &p.expression) { claims = true; },
                            None => { send("it writes a member whose name is computed".into(), Sends::Any); wrote.push((at, "it writes a member whose name is computed".into())); }
                        }
                        continue;
                    }
                    if called(m, id) || tested(m, id) { continue; }
                    match key {
                        Some(k) => if let Some(s) = sends(&k) { if !self.plain(mi, &p.object, &k) { send(format!("[\"{k}\"], taken"), s); } },
                        None => if !(numeric(m, &p.expression, 0) || symbol(m, &p.expression) || own(m, &p.object, 0) || self.made(mi, &p.object, 0)) { if self.callers(mi, &p.object) { taken = true; } else { send("a member whose name is computed, taken".into(), Sends::Any); } },
                    }
                }
                AstKind::StringLiteral(s) if matches!(s.value.as_str(), "addEventListener" | "removeEventListener" | "dispatchEvent") => if !matches!(m.nodes.parent_kind(id), AstKind::BinaryExpression(b) if b.operator == BinaryOperator::In) && !matches!(m.nodes.parent_kind(id), AstKind::ComputedMemberExpression(_)) { send(format!("\"{}\"", s.value), Sends::Any); claims = true; },
                AstKind::BindingProperty(p) => match static_key(&p.key, p.computed) {
                    None => if p.key.as_expression().and_then(|e| key_text(m, e, 0)).is_none_or(|k| sends(&k).is_some()) { send("a computed name, taken off something".into(), Sends::Any); },
                    Some(k) => if sends(&k).is_some() { send(format!("{k}, taken off something"), Sends::Any); } else if matches!(k.as_str(), "prototype" | "__proto__" | "constructor") || matches!(k.as_str(), "defaultView" | "contentWindow") { send(format!("{k}, taken off something"), Sends::Any); wrote.push((at, format!("{k}, taken off something"))); },
                },
                AstKind::AssignmentTargetPropertyProperty(p) => if static_key(&p.name, p.computed).is_none_or(|k| sends(&k).is_some()) { send("a name, taken off something".into(), Sends::Any); },
                AstKind::AssignmentTargetPropertyIdentifier(p) => if sends(&p.binding.name).is_some() { send(format!("{}, taken off something", p.binding.name), Sends::Any); },
                AstKind::ObjectProperty(p) => match static_key(&p.key, p.computed) {
                    Some(k) => if matches!(k.as_str(), "addEventListener" | "removeEventListener" | "dispatchEvent") { send(format!("a {k} of its own"), Sends::Any); },
                    None => if !matches!(unwrap(&p.value), Expression::StringLiteral(_) | Expression::NumericLiteral(_) | Expression::BooleanLiteral(_) | Expression::TemplateLiteral(_)) && !p.key.as_expression().is_some_and(|e| symbol(m, e)) { claims = true; },
                },
                AstKind::MethodDefinition(p) => match static_key(&p.key, p.computed) {
                    Some(k) => if matches!(k.as_str(), "addEventListener" | "removeEventListener" | "dispatchEvent" | "attributeChangedCallback" | "connectedCallback" | "disconnectedCallback") { send(format!("a {k} of its own"), Sends::Any); },
                    None => if !matches!(p.key, PropertyKey::PrivateIdentifier(_)) && !p.key.as_expression().is_some_and(|e| symbol(m, e)) { claims = true; },
                },
                AstKind::PropertyDefinition(p) => match static_key(&p.key, p.computed) {
                    Some(k) => if matches!(k.as_str(), "addEventListener" | "removeEventListener" | "dispatchEvent") { send(format!("a {k} of its own"), Sends::Any); },
                    None => if !matches!(p.key, PropertyKey::PrivateIdentifier(_)) && !p.key.as_expression().is_some_and(|e| symbol(m, e)) { claims = true; },
                },
                // a class of the platform's, or of what is not known
                AstKind::Class(k) => if let Some(h) = &k.heritage { match unwrap(&h.expression) {
                    Expression::Identifier(i) if m.symbol(i).is_none() && matches!(i.name.as_str(), "Error" | "TypeError" | "RangeError" | "Map" | "Set" | "WeakMap" | "WeakSet" | "Array") => {}
                    Expression::Identifier(i) if matches!(self.name(mi, i), Some(Origin::Symbol(a, s)) if { let ma = self.m(a); ma.known_symbol(s) && matches!(ma.nodes.kind(ma.scoping.symbol_declaration(s)), AstKind::Class(_)) }) => {}
                    _ => { send("a class of the platform's, or of one that is not known".into(), Sends::Any); claims = true; }
                } },
                AstKind::JSXOpeningElement(e) => self.element_scan(e, &mut send),
                _ => {}
            }
        }
        out.sends.extend(sent.into_iter().map(|(at, what, sends)| Place0 { module: mi, at, what, sends }));
        if out.writes.is_none() { out.writes = wrote.into_iter().next().map(|(at, what)| Place0 { module: mi, at, what, sends: Sends::Any }); }
        out.claims |= claims;
        out.taken |= taken;
    }
    fn call_scan(&self, mi: usize, c: &'m CallExpression<'a>, send: &mut dyn FnMut(String, Sends), wrote: &mut dyn FnMut(String), claims: &mut bool) {
        let m = self.m(mi);
        let arg = |i: usize| c.arguments.get(i).and_then(|a| a.as_expression());
        let (object, name): (&'m Expression<'a>, String) = match unwrap(&c.callee) {
            Expression::StaticMemberExpression(p) => (&p.object, p.property.name.to_string()),
            Expression::ComputedMemberExpression(p) => match key_text(m, &p.expression, 0) {
                Some(k) => (&p.object, k),
                None => { if !(symbol(m, &p.expression) || self.table(mi, &p.object) || (numeric(m, &p.expression, 0) && !matches!(unwrap(&p.object), Expression::Identifier(g) if m.symbol(g).is_none()))) { send("a method whose name is computed".into(), Sends::Any); } return; }
            },
            Expression::Identifier(i) if m.symbol(i).is_none() => { if !GLOBAL_CALLS.contains(&i.name.as_str()) { send(format!("{}()", i.name), Sends::Any); } if matches!(i.name.as_str(), "require" | "importScripts" | "eval" | "Function") { wrote(format!("{}()", i.name)); } return; }
            Expression::Super(_) => return,
            Expression::ChainExpression(x) => match &x.expression { ChainElement::StaticMemberExpression(p) => (&p.object, p.property.name.to_string()), _ => return },
            _ => return,
        };
        let n = name.as_str();
        let global = |o: &Expression, g: &str| matches!(unwrap(o), Expression::Identifier(i) if m.symbol(i).is_none() && i.name == g);
        match n {
            "assign" | "defineProperty" | "defineProperties" | "setPrototypeOf" | "set" | "apply" | "construct" if global(object, "Object") || global(object, "Reflect") => {
                if global(object, "Reflect") { send("Reflect".into(), Sends::Any); wrote("Reflect".into()); return; }
                // (an accessor or a value put on what is not the code's own)
                if !arg(0).is_some_and(|a| own(m, a, 0) || self.made(mi, a, 0)) { send(format!("Object.{n}() to an object that is not its own"), Sends::Any); wrote(format!("Object.{n}()")); }
                *claims = *claims || n != "assign" && !matches!(arg(1).map(unwrap), Some(Expression::StringLiteral(_)));
                return;
            }
            "fromEntries" | "create" if global(object, "Object") => { *claims = true; return; }
            "parse" if global(object, "JSON") && c.arguments.len() > 1 => { *claims = true; return; }
            "getOwnPropertyDescriptor" | "getOwnPropertyDescriptors" | "getPrototypeOf" => { if !matches!(m.nodes.parent_kind(c.node_id.get()), AstKind::BinaryExpression(_)) { send(format!("{n}()"), Sends::Any); } return; }
            "call" | "apply" | "bind" => {
                // a function of the code's, or a method of the language's or of the list above, read off where it is
                let ok = match unwrap(object) {
                    Expression::StaticMemberExpression(q) => safe(&q.property.name) || !method(&q.property.name),
                    o => self.called(mi, o).is_some(),
                };
                if !ok { send(format!(".{n}() of a function that is not known"), Sends::Any); }
                return;
            }
            "setAttribute" | "toggleAttribute" | "removeAttribute" => {
                let ok = matches!(arg(0).and_then(|e| key_text(m, e, 0)), Some(a) if a.starts_with("aria-") || a.starts_with("data-") || matches!(a.as_str(), "role" | "id" | "class" | "style" | "tabindex" | "title" | "lang" | "dir" | "name" | "value" | "for" | "rel" | "target" | "draggable" | "fill" | "stroke" | "width" | "height" | "viewBox"));
                if !ok { send(format!(".{n}() of an attribute that is not known"), Sends::Any); }
                return;
            }
            "createElement" => { if !matches!(arg(0).and_then(|e| key_text(m, e, 0)), Some(t) if !t.contains('-') && matches!(t.as_str(), "div" | "span" | "input" | "button" | "a" | "p" | "canvas" | "img" | "audio" | "video" | "textarea" | "select" | "option" | "form" | "label" | "ul" | "ol" | "li" | "style" | "table" | "section" | "template")) { send("createElement() of a name that is not known".into(), Sends::Any); } return; }
            // (of a string)
            "replace" => { if c.arguments.len() != 2 || ends_with(object, &["location", "history"]) { send(".replace()".into(), Sends::Any); } return; }
            // (of a list: a window's takes a text)
            "find" => { if !arg(0).is_some_and(|a| matches!(unwrap(a), Expression::ArrowFunctionExpression(_) | Expression::FunctionExpression(_)) || self.called(mi, a).is_some()) && !own(m, object, 0) { send(".find()".into(), Sends::Any); } return; }
            _ => {}
        }
        if ends_with(object, &["classList", "relList", "searchParams", "headers"]) { return; }
        if let Some(s) = sends(n) { if !self.plain(mi, object, n) { send(format!(".{n}()"), s); } }
    }
    fn write_scan(&self, mi: usize, name: &str, object: &'m Expression<'a>, value: Option<&'m Expression<'a>>, send: &mut dyn FnMut(String, Sends), wrote: &mut dyn FnMut(String)) {
        let m = self.m(mi);
        let _ = value;
        if matches!(name, "__proto__" | "prototype") { send(format!("it writes .{name}"), Sends::Any); wrote(format!("it writes .{name}")); return; }
        if matches!(name, "addEventListener" | "removeEventListener" | "dispatchEvent") { send(format!("it writes .{name}"), Sends::Any); wrote(format!("it writes .{name}")); return; }
        if own(m, object, 0) || self.made(mi, object, 0) || (matches!(unwrap(object), Expression::ThisExpression(_)) && !method(name)) { return; }
        if event_handler(name) { return; }
        // what a callback is given to, replaced
        if matches!(name, "ResizeObserver" | "IntersectionObserver" | "MutationObserver" | "PerformanceObserver" | "ReportingObserver" | "Promise" | "EventSource" | "WebSocket" | "Worker" | "SharedWorker" | "BroadcastChannel" | "Notification" | "Audio" | "Image") { send(format!("it writes .{name}"), Sends::Any); wrote(format!("it writes .{name}")); return; }
        // a method of the platform's, replaced
        if method(name) { send(format!("it writes .{name}"), Sends::Any); if LATER.contains(&name) { wrote(format!("it writes .{name}")); } return; }
        if TREE_WRITES.contains(&name) { send(format!("it writes .{name}"), Sends::Tree); return; }
        if name == "src" { if !self.media(mi, object, 0) { send("it writes .src".into(), Sends::Frame); } return; }
        if settable(name) && !SAFE_WRITES.contains(&name) { send(format!("it writes .{name}"), Sends::Any); }
    }
    fn element_scan(&self, e: &'m JSXOpeningElement<'a>, send: &mut dyn FnMut(String, Sends)) {
        let JSXElementName::Identifier(t) = &e.name else { return };
        if t.name.contains('-') || matches!(t.name.as_str(), "script" | "iframe" | "object" | "embed" | "frame") { send(format!("<{}>", t.name), Sends::Any); }
        for a in &e.attributes {
            match a {
                JSXAttributeItem::SpreadAttribute(_) => send("a spread on an element".into(), Sends::Any),
                JSXAttributeItem::Attribute(a) => {
                    let n = match &a.name { JSXAttributeName::Identifier(n) => n.name.as_str(), _ => "" };
                    if !(n.starts_with("on") || n.starts_with("aria-") || n.starts_with("data-") || matches!(n, "class" | "style" | "ref" | "id" | "role" | "type" | "value" | "checked" | "disabled" | "name" | "title" | "for" | "tabindex" | "placeholder" | "href" | "children" | "d" | "fill" | "stroke" | "width" | "height" | "viewBox" | "x" | "y" | "cx" | "cy" | "r")) { send(format!("{n} of an element"), Sends::Any); }
                }
            }
        }
    }
    /// A value that is no method of the platform's: a literal, a function of the code's, what an operator makes.
    fn no_method(&self, mi: usize, e: &'m Expression<'a>) -> bool {
        match unwrap(e) {
            Expression::ArrowFunctionExpression(_) | Expression::FunctionExpression(_) | Expression::StringLiteral(_) | Expression::NumericLiteral(_) | Expression::BooleanLiteral(_) | Expression::NullLiteral(_) | Expression::TemplateLiteral(_) | Expression::BinaryExpression(_) | Expression::UnaryExpression(_) | Expression::UpdateExpression(_) | Expression::ObjectExpression(_) | Expression::ArrayExpression(_) | Expression::NewExpression(_) | Expression::RegExpLiteral(_) => true,
            Expression::Identifier(i) => self.m(mi).symbol(i).is_none() || self.called(mi, e).is_some(),
            Expression::ConditionalExpression(c) => self.no_method(mi, &c.consequent) && self.no_method(mi, &c.alternate),
            _ => false,
        }
    }
    /// Whether an object is one the code made in the call, or a list's own: what is made and handed on is not the platform's.
    fn made(&self, mi: usize, e: &'m Expression<'a>, d: u32) -> bool {
        let m = self.m(mi);
        if d > 5 { return false; }
        if own(m, e, 0) { return true; }
        match unwrap(e) {
            Expression::Identifier(i) => {
                let Some(s) = m.symbol(i).filter(|s| m.known_symbol(*s)) else { return false };
                if let Some(Origin::Symbol(a, b)) = self.name(mi, i) { if a != mi { let ma = self.m(a); return ma.known_symbol(b) && matches!(ma.nodes.kind(ma.scoping.symbol_declaration(b)), AstKind::VariableDeclarator(v) if matches!(v.id, BindingPattern::BindingIdentifier(_)) && v.init.as_ref().is_some_and(|x| own(ma, x, 0))); } }
                match m.nodes.kind(m.scoping.symbol_declaration(s)) {
                    AstKind::VariableDeclarator(v) => match &v.id {
                        BindingPattern::BindingIdentifier(_) => v.init.as_ref().is_some_and(|x| self.made(mi, x, d + 1)),
                        // a signal's getter, a store, a setter: Solid's
                        BindingPattern::ArrayPattern(a) => a.elements.iter().flatten().any(|x| matches!(x, BindingPattern::BindingIdentifier(b) if b.symbol_id.get() == Some(s))) && matches!(v.init.as_ref().map(unwrap), Some(Expression::CallExpression(c)) if self.solid(mi, &c.callee).as_deref() == Some("createSignal")),
                        _ => false,
                    },
                    _ => false,
                }
            }
            // a copy
            Expression::CallExpression(c) => match unwrap(&c.callee) {
                Expression::StaticMemberExpression(p) => matches!(p.property.name.as_str(), "slice" | "map" | "filter" | "split" | "concat" | "flatMap") && !c.optional,
                e => self.called(mi, e).is_some_and(|f| { let mf = self.m(f.module); match self.parts(f) { Some((_, Err(x), false, false)) => self.made(f.module, x, d + 1), Some((_, Ok(b), false, false)) => matches!(b.last(), Some(Statement::ReturnStatement(_))) && mf.returns_of(f.node).iter().all(|r| matches!(mf.nodes.kind(*r), AstKind::ReturnStatement(r) if r.argument.as_ref().is_some_and(|x| self.made(f.module, x, d + 1)))), _ => false } }),
            },
            _ => false,
        }
    }
    /// An `<audio>` or a `<video>` the code makes, or asks whether it is given one.
    fn media(&self, mi: usize, e: &'m Expression<'a>, d: u32) -> bool {
        let m = self.m(mi);
        if d > 8 { return false; }
        match unwrap(e) {
            Expression::NewExpression(n) => matches!(unwrap(&n.callee), Expression::Identifier(i) if m.symbol(i).is_none() && i.name == "Audio"),
            Expression::CallExpression(c) => {
                if let Expression::StaticMemberExpression(p) = unwrap(&c.callee) { return p.property.name == "createElement" && matches!(c.arguments.first().and_then(|a| a.as_expression()).map(unwrap), Some(Expression::StringLiteral(s)) if matches!(s.value.as_str(), "audio" | "video")) && matches!(unwrap(&p.object), Expression::Identifier(g) if m.symbol(g).is_none() && g.name == "document"); }
                let Some(f) = self.called(mi, &c.callee) else { return false };
                let Some((_, body, false, false)) = self.parts(f) else { return false };
                let mf = self.m(f.module);
                match body { Err(x) => self.media(f.module, x, d + 1), Ok(_) => !mf.returns_of(f.node).is_empty() && mf.returns_of(f.node).iter().all(|r| matches!(mf.nodes.kind(*r), AstKind::ReturnStatement(r) if r.argument.as_ref().is_some_and(|x| self.media(f.module, x, d + 1)))) }
            }
            Expression::Identifier(i) => {
                let Some(s) = m.symbol(i).filter(|s| m.known_symbol(*s)) else { return false };
                if self.seen_as(mi, i, s, &["HTMLAudioElement", "HTMLVideoElement", "HTMLMediaElement"]) { return true; }
                match m.nodes.kind(m.scoping.symbol_declaration(s)) {
                    AstKind::VariableDeclarator(v) => matches!(v.id, BindingPattern::BindingIdentifier(_)) && v.init.as_ref().is_some_and(|x| self.media(mi, x, d + 1)),
                    // a parameter of a function every call of which is seen
                    AstKind::FormalParameter(_) | AstKind::FormalParameters(_) => {
                        let Some(f) = m.function_of(m.scoping.symbol_declaration(s)) else { return false };
                        let Some((params, ..)) = self.parts(FnAt { module: mi, node: f }) else { return false };
                        let Some(i) = params.items.iter().position(|p| matches!(&p.pattern, BindingPattern::BindingIdentifier(b) if b.symbol_id.get() == Some(s)) && p.initializer.is_none()) else { return false };
                        let name = match m.nodes.kind(f) { AstKind::Function(x) if x.is_declaration() => x.id.as_ref().and_then(|i| i.symbol_id.get()), AstKind::ArrowFunctionExpression(_) => match m.nodes.parent_kind(m.outer(f)) { AstKind::VariableDeclarator(v) => match &v.id { BindingPattern::BindingIdentifier(b) => b.symbol_id.get(), _ => None }, _ => None }, _ => None };
                        let Some(name) = name.filter(|n| m.known_symbol(*n) && !m.handed_out.contains(n)) else { return false };
                        m.references(name).iter().all(|r| { let o = m.outer(*r); matches!(m.nodes.parent_kind(o), AstKind::CallExpression(c) if c.callee.span() == m.nodes.kind(o).span() && !c.arguments.iter().any(|a| a.is_spread()) && c.arguments.get(i).and_then(|a| a.as_expression()).is_some_and(|x| self.media(mi, x, d + 1))) })
                    }
                    _ => false,
                }
            }
            _ => false,
        }
    }
    /// A receiver whose member of that name is no method of the platform's, or one that sends nothing.
    fn plain(&self, mi: usize, e: &'m Expression<'a>, name: &str) -> bool {
        let m = self.m(mi);
        if own(m, e, 0) || self.made(mi, e, 0) { return true; }
        match unwrap(e) {
            Expression::StaticMemberExpression(p) => matches!(p.property.name.as_str(), "classList" | "relList" | "searchParams" | "headers"),
            Expression::Identifier(i) => {
                if m.symbol(i).is_none() { return matches!(i.name.as_str(), "console" | "Math" | "JSON" | "Object" | "Array" | "Promise" | "Number" | "String"); }
                // (what these close or send, they say later)
                let Some(s) = m.symbol(i).filter(|s| m.known_symbol(*s)) else { return false };
                matches!(name, "close" | "open" | "send") && matches!(m.nodes.kind(m.scoping.symbol_declaration(s)), AstKind::VariableDeclarator(v) if matches!(v.id, BindingPattern::BindingIdentifier(_)) && matches!(v.init.as_ref().map(unwrap), Some(Expression::NewExpression(n)) if matches!(unwrap(&n.callee), Expression::Identifier(g) if m.symbol(g).is_none() && matches!(g.name.as_str(), "EventSource" | "WebSocket" | "BroadcastChannel" | "Notification"))))
            }
            _ => false,
        }
    }
    /// A list or a table written out in the module, every item of it a function of the code's.
    fn table(&self, mi: usize, e: &'m Expression<'a>) -> bool {
        let m = self.m(mi);
        let Expression::Identifier(i) = unwrap(e) else { return false };
        let Some(s) = m.symbol(i).filter(|s| m.known_symbol(*s)) else { return false };
        let AstKind::VariableDeclarator(v) = m.nodes.kind(m.scoping.symbol_declaration(s)) else { return false };
        match v.init.as_ref().map(unwrap) {
            Some(Expression::ObjectExpression(o)) => o.properties.iter().all(|p| matches!(p, ObjectPropertyKind::ObjectProperty(p) if matches!(unwrap(&p.value), Expression::ArrowFunctionExpression(_) | Expression::FunctionExpression(_)))) && m.references(s).iter().all(|r| { let o = m.outer(*r); matches!(m.nodes.parent_kind(o), AstKind::ComputedMemberExpression(_) | AstKind::StaticMemberExpression(_)) && !m.is_written(m.nodes.parent_id(o)) }),
            _ => false,
        }
    }
    /// A parameter of a function that only the program calls: what is read off it is the caller's.
    fn callers(&self, mi: usize, e: &Expression<'a>) -> bool {
        let m = self.m(mi);
        let Expression::Identifier(i) = unwrap(e) else { return false };
        let Some(s) = m.symbol(i).filter(|s| m.known_symbol(*s)) else { return false };
        let d = m.scoping.symbol_declaration(s);
        if !matches!(m.nodes.kind(d), AstKind::FormalParameter(_) | AstKind::FormalParameters(_)) { return false; }
        let Some(f) = m.function_of(d) else { return false };
        self.programs(mi, f, s, 0)
    }
    /// Whether a parameter only ever holds what the program gave: the code never calls the function, or gives it there a
    /// parameter of its own that is the same.
    fn programs(&self, mi: usize, f: NodeId, p: oxc_syntax::symbol::SymbolId, d: u32) -> bool {
        let m = self.m(mi);
        if d > 6 { return false; }
        let Some((params, ..)) = self.parts(FnAt { module: mi, node: f }) else { return false };
        if super::place::uses_arguments(m, f) { return false; }
        let Some(index) = params.items.iter().position(|x| matches!(&x.pattern, BindingPattern::BindingIdentifier(b) if b.symbol_id.get() == Some(p)) && x.initializer.is_none()) else { return false };
        let s = match m.nodes.kind(f) {
            AstKind::Function(x) if x.is_declaration() => x.id.as_ref().and_then(|i| i.symbol_id.get()),
            AstKind::Function(_) | AstKind::ArrowFunctionExpression(_) => match m.nodes.parent_kind(m.outer(f)) { AstKind::VariableDeclarator(v) => match &v.id { BindingPattern::BindingIdentifier(b) => b.symbol_id.get(), _ => None }, _ => None },
            _ => None,
        };
        let Some(s) = s.filter(|s| m.known_symbol(*s) && m.at_top(*s)) else { return false };
        for j in 0..self.mods.len() {
            let mj = self.m(j);
            let syms: Vec<_> = if j == mi { vec![s] } else if !m.handed_out.contains(&s) { continue } else { mj.imports.keys().copied().filter(|y| matches!(self.mods.symbol(self.h, self.hi, j, *y, &mut vec![]), Origin::Symbol(a, b) if a == mi && b == s)).collect() };
            for y in syms { for r in mj.references(y) {
                let o = mj.outer(r);
                let ok = match mj.nodes.parent_kind(o) {
                    AstKind::ExportSpecifier(_) | AstKind::ExportDefaultDeclaration(_) => true,
                    AstKind::CallExpression(c) => c.callee.span() == mj.nodes.kind(o).span() && !c.arguments.iter().any(|a| a.is_spread()) && c.arguments.get(index).and_then(|a| a.as_expression()).is_some_and(|e| self.callers_at(j, e, d + 1)),
                    _ => false,
                };
                if !ok { return false; }
            } }
        }
        true
    }
    fn callers_at(&self, mi: usize, e: &Expression<'a>, d: u32) -> bool {
        let m = self.m(mi);
        let Expression::Identifier(i) = unwrap(e) else { return false };
        let Some(s) = m.symbol(i).filter(|s| m.known_symbol(*s)) else { return false };
        let at = m.scoping.symbol_declaration(s);
        matches!(m.nodes.kind(at), AstKind::FormalParameter(_) | AstKind::FormalParameters(_)) && m.function_of(at).is_some_and(|f| self.programs(mi, f, s, d))
    }
    /// The global object, where it stands: its members are read there, or it goes to a parameter that only they are read off.
    fn window_stays(&self, mi: usize, id: NodeId, d: u32) -> bool {
        let m = self.m(mi);
        if d > 6 { return false; }
        let mut o = m.outer(id);
        loop {
            let span = m.nodes.kind(o).span();
            match m.nodes.parent_kind(o) {
                AstKind::ChainExpression(_) | AstKind::LogicalExpression(_) => {}
                AstKind::ConditionalExpression(c) => if c.test.span() == span { return true; },
                _ => break,
            }
            o = m.outer(m.nodes.parent_id(o));
        }
        let span = m.nodes.kind(o).span();
        let named = |b: Option<oxc_syntax::symbol::SymbolId>, mi: usize| b.is_some_and(|s| { let m = self.m(mi); !m.handed_out.contains(&s) && m.references(s).iter().all(|r| m.scoping_write(*r) || self.window_stays(mi, *r, d + 1)) });
        let pid = m.nodes.parent_id(o);
        match m.nodes.kind(pid) {
            AstKind::StaticMemberExpression(p) => p.object.span() == span,
            AstKind::ComputedMemberExpression(p) => p.object.span() == span && (key_text(m, &p.expression, 0).is_some() || symbol(m, &p.expression)),
            AstKind::BinaryExpression(_) | AstKind::UnaryExpression(_) | AstKind::IfStatement(_) | AstKind::ExpressionStatement(_) => true,
            AstKind::VariableDeclarator(v) => match &v.id { BindingPattern::BindingIdentifier(b) => named(b.symbol_id.get(), mi), _ => false },
            AstKind::FormalParameter(p) => match &p.pattern { BindingPattern::BindingIdentifier(b) => named(b.symbol_id.get(), mi), _ => false },
            AstKind::AssignmentPattern(p) => match &p.left { BindingPattern::BindingIdentifier(b) => named(b.symbol_id.get(), mi), _ => false },
            AstKind::CallExpression(c) => {
                let Some(i) = c.arguments.iter().position(|a| a.span() == span) else { return false };
                // (`target.removeEventListener.bind(target, …)`)
                if let (0, Expression::StaticMemberExpression(k)) = (i, unwrap(&c.callee)) { if matches!(k.property.name.as_str(), "bind" | "call" | "apply") && matches!(unwrap(&k.object), Expression::StaticMemberExpression(q) if safe(&q.property.name)) { return true; } }
                if let Expression::StaticMemberExpression(k) = unwrap(&c.callee) { if matches!(k.property.name.as_str(), "addEventListener" | "removeEventListener" | "observe" | "unobserve" | "isArray" | "is" | "includes" | "has") { return true; } }
                let Some(f) = self.called(mi, &c.callee) else { return false };
                let Some((params, ..)) = self.parts(f) else { return false };
                if c.arguments.iter().take(i).any(|a| a.is_spread()) || super::place::uses_arguments(self.m(f.module), f.node) { return false; }
                match params.items.get(i) { Some(p) => match &p.pattern { BindingPattern::BindingIdentifier(b) => named(b.symbol_id.get(), f.module), _ => false }, None => params.rest.is_none() }
            }
            // (a list of targets, only gone over)
            _ => false,
        }
    }
}
/// What is written there, where an assignment says.
fn value_of<'m, 'a>(m: &'m Module<'a>, id: NodeId) -> Option<&'m Expression<'a>> { match m.nodes.parent_kind(m.outer(id)) { AstKind::AssignmentExpression(a) => Some(&a.right), _ => None } }
fn called(m: &Module, id: NodeId) -> bool {
    let mut o = m.outer(id);
    while let AstKind::ChainExpression(_) = m.nodes.parent_kind(o) { o = m.outer(m.nodes.parent_id(o)); }
    matches!(m.nodes.parent_kind(o), AstKind::CallExpression(c) if c.callee.span() == m.nodes.kind(o).span())
}
/// Read only to ask whether it is there, or to be made text or a number.
fn tested(m: &Module, id: NodeId) -> bool {
    let mut o = m.outer(id);
    while let AstKind::ChainExpression(_) = m.nodes.parent_kind(o) { o = m.outer(m.nodes.parent_id(o)); }
    let span = m.nodes.kind(o).span();
    match m.nodes.parent_kind(o) {
        AstKind::UnaryExpression(_) | AstKind::IfStatement(_) | AstKind::BinaryExpression(_) | AstKind::TemplateLiteral(_) | AstKind::WhileStatement(_) => true,
        AstKind::ConditionalExpression(c) => c.test.span() == span,
        AstKind::LogicalExpression(l) => l.operator == LogicalOperator::And && l.left.span() == span,
        // (its own members: `.call`, `.bind` are looked at where they are called)
        AstKind::StaticMemberExpression(p) => !matches!(p.property.name.as_str(), "call" | "apply" | "bind"),
        _ => false,
    }
}
fn typeof_only(m: &Module, id: NodeId) -> bool { matches!(m.nodes.parent_kind(m.outer(id)), AstKind::UnaryExpression(u) if u.operator == UnaryOperator::Typeof) || matches!(m.nodes.parent_kind(m.outer(id)), AstKind::BinaryExpression(b) if b.operator == BinaryOperator::Instanceof) }
/// A symbol's key.
fn symbol(m: &Module, e: &Expression) -> bool {
    match unwrap(e) {
        Expression::StaticMemberExpression(p) => matches!(unwrap(&p.object), Expression::Identifier(i) if m.symbol(i).is_none() && i.name == "Symbol"),
        Expression::CallExpression(c) => match unwrap(&c.callee) { Expression::Identifier(i) => m.symbol(i).is_none() && i.name == "Symbol", Expression::StaticMemberExpression(p) => p.property.name == "for" && matches!(unwrap(&p.object), Expression::Identifier(i) if m.symbol(i).is_none() && i.name == "Symbol"), _ => false },
        Expression::Identifier(i) => m.symbol(i).is_some_and(|s| m.known_symbol(s) && matches!(m.nodes.kind(m.scoping.symbol_declaration(s)), AstKind::VariableDeclarator(v) if matches!(v.id, BindingPattern::BindingIdentifier(_)) && v.init.as_ref().is_some_and(|x| matches!(unwrap(x), Expression::CallExpression(_)) && symbol(m, x)))),
        _ => false,
    }
}
/// `location`, `window.location`, `history`.
fn ends_with(e: &Expression, names: &[&str]) -> bool { match unwrap(e) { Expression::Identifier(i) => names.contains(&i.name.as_str()), Expression::StaticMemberExpression(p) => names.contains(&p.property.name.as_str()), _ => false } }
