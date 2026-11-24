//! TY-1 (spec/13), ported from `ref/types/project.ts`: a checked program projected to TSX that TypeScript checks, and that an
//! editor asks for types (TY-1c). The projection is the reference's, text for text (`ref/crate.ts --project` diffs them);
//! what the crate adds is where each piece came from (CP-8): every name, member, literal and written type the projection
//! copies from the `.rx` is a mapping, generated offset to source offset, of text that is the same on both sides.

use crate::ast::*;
use crate::modules::ModuleSet;
use crate::names::{in_prelude, language};
use crate::parse::JsDecl;
use crate::signature::{ExportSig, ModSig};
use indexmap::{IndexMap, IndexSet};
use regex::Regex;
use serde_json::Value;
use std::collections::{HashMap, HashSet};
use std::sync::LazyLock;

/// The helpers every projection imports (`__`), and the prelude's names (`len`, `map`, …): `ref/types/project.ts`'s PRELUDE.
pub const PRELUDE: &str = include_str!("prelude.ts");

static ROW_WORDS: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"^((?:io|pending|lane|fails\([^)]*\))\s+)+").unwrap());
static SOURCE_WORD: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"^source\s+").unwrap());
/// MO-10f: a field's row words in a component's props type, after the field's `:` (group 2).
static PROP_ROWS: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(:\s*)((?:pending\s+|fails\([^)]*\)\s*)+)").unwrap());

/// One mapping: `len` bytes at `gen` in the projection are the same text as `len` bytes at `src` in the `.rx`.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Mapping {
    pub gen: u32,
    pub src: u32,
    pub len: u32,
}

/// A coarser correspondence: `glen` bytes at `gen` in the projection were written for the `len` bytes at `src` (an
/// expression, a statement, a declaration's line), not the same text. An editor maps through it what falls between
/// mappings (a type error on `(a + b)` starts at its parenthesis); it is listed innermost first.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Range {
    pub gen: u32,
    pub glen: u32,
    pub src: u32,
    pub len: u32,
}

/// Text with the mappings of the pieces in it that came from the source.
#[derive(Default, Clone)]
struct Code {
    s: String,
    m: Vec<Mapping>,
    r: Vec<Range>,
}
impl Code {
    fn new() -> Self {
        Code::default()
    }
    fn of(s: &str) -> Self {
        Code { s: s.to_string(), m: vec![], r: vec![] }
    }
    /// All of this text was written for `sp`.
    fn from(mut self, sp: Span) -> Self {
        if !sp.is_none() {
            self.r.push(Range { gen: 0, glen: self.s.len() as u32, src: sp.start, len: sp.end - sp.start });
        }
        self
    }
    fn t(mut self, s: &str) -> Self {
        self.s.push_str(s);
        self
    }
    fn c(mut self, o: Code) -> Self {
        self.push(o);
        self
    }
    fn push(&mut self, o: Code) {
        let at = self.s.len() as u32;
        self.m.extend(o.m.into_iter().map(|m| Mapping { gen: m.gen + at, ..m }));
        self.r.extend(o.r.into_iter().map(|r| Range { gen: r.gen + at, ..r }));
        self.s.push_str(&o.s);
    }
    /// `text`, mapped to `src` when it was found there.
    fn at(mut self, text: &str, src: Option<usize>) -> Self {
        if let Some(src) = src {
            self.m.push(Mapping { gen: self.s.len() as u32, src: src as u32, len: text.len() as u32 });
        }
        self.s.push_str(text);
        self
    }
    fn join(xs: Vec<Code>, sep: &str) -> Code {
        let mut out = Code::new();
        for (i, x) in xs.into_iter().enumerate() {
            if i > 0 {
                out.s.push_str(sep);
            }
            out.push(x);
        }
        out
    }
}

/// The reference's `W`: lines, each with the `.rx` line it came from.
#[derive(Default)]
struct W {
    buf: Code,
    lines: Vec<usize>,
    last: usize,
}
impl W {
    fn new() -> Self {
        W { buf: Code::new(), lines: vec![], last: 1 }
    }
    /// A statement or a markup item carries no line of its own (0): it is on its declaration's.
    fn emit(&mut self, text: Code, line: usize) {
        if line != 0 {
            self.last = line;
        }
        let n = text.s.matches('\n').count() + 1;
        if !self.lines.is_empty() {
            self.buf.s.push('\n');
        }
        self.buf.push(text);
        for _ in 0..n {
            self.lines.push(if line != 0 { line } else { self.last });
        }
    }
}

/// One projected file: its TSX, for each of its lines the `.rx` line it came from, and its mappings onto the `.rx`.
pub struct Projected {
    pub path: String,
    pub code: String,
    pub lines: Vec<usize>,
    pub rx: String,
    pub mappings: Vec<Mapping>,
    pub ranges: Vec<Range>,
}

/// A written type, without its row words (`pending T` → `T`, 04 CN-4a) or a context's `source` (RG-7c).
fn type_text(t: &Option<String>) -> Option<String> {
    let t = t.as_ref()?;
    let x = ROW_WORDS.replace(t, "");
    let x = SOURCE_WORD.replace(&x, "");
    let x = crate::parse::js_trim(&x);
    if x.is_empty() {
        None
    } else {
        Some(x.to_string())
    }
}
/// `JSON.stringify` of a literal.
fn j(l: &Lit) -> String {
    match crate::ast::lit_json(l) {
        None => "undefined".into(),
        Some(v) => serde_json::to_string(&v).unwrap(),
    }
}
fn js_str(s: &str) -> String {
    serde_json::to_string(s).unwrap()
}
fn is_handler(a: &str) -> bool {
    crate::awaits::is_handler(a)
}
fn is_word(c: char) -> bool {
    c.is_alphanumeric() || c == '_' || c == '$'
}

/// The file a module projects to: `main.rx` → `main.rx.tsx`, so `import … from "./lib.rx"` resolves to the projection.
pub fn projected_path(rx: &str) -> String {
    format!("{rx}.tsx")
}

pub fn project_modules(set: &ModuleSet) -> Vec<Projected> {
    project_modules_with(set, None)
}
/// `prelude`: where the projections import the prelude from, in place of `__prelude.ts` at the program's root (an editor
/// writes it once, where the project's own `@solidjs/web` resolves).
pub fn project_modules_with(set: &ModuleSet, prelude: Option<&str>) -> Vec<Projected> {
    let mut out = vec![];
    let mut js_stubs: IndexMap<String, IndexSet<String>> = IndexMap::new();
    for path in &set.order {
        let p = &set.programs[path];
        let src = set.sources.get(path).map(|s| s.as_str()).unwrap_or("");
        let mut pr = Proj { w: W::new(), set, path, src, js_stubs: &mut js_stubs, used: IndexSet::new(), declared: HashSet::new(), ref_fns: HashMap::new(), ref_parts: HashMap::new(), views: crate::modules::ViewProps::of(set, &set.programs[path].decls), prelude };
        pr.module(p);
        let w = pr.w;
        out.push(Projected { path: projected_path(path), code: w.buf.s, lines: w.lines, rx: path.clone(), mappings: w.buf.m, ranges: w.buf.r });
    }
    for (rx, sig) in &set.signatures {
        out.push(Projected { path: format!("{rx}.d.ts"), code: signature_stub(sig), lines: vec![], rx: rx.strip_suffix(".rx").map(|s| format!("{s}.d.rx")).unwrap_or(rx.clone()), mappings: vec![], ranges: vec![] });
    }
    for (dts, decls) in &set.declarations {
        let path = types_path_of(dts).unwrap_or_else(|| dts.strip_suffix(".d.rx").map(|s| format!("{s}.d.ts")).unwrap_or(dts.clone()));
        out.push(Projected { path, code: declaration_file(decls), lines: vec![], rx: dts.clone(), mappings: vec![], ranges: vec![] });
    }
    for (m, names) in js_stubs {
        let code = names.iter().map(|n| if n == "default" { "declare const __d: any; export default __d;".to_string() } else { format!("export declare const {n}: any;") }).collect::<Vec<_>>().join("\n");
        out.push(Projected { path: m.clone(), code, lines: vec![], rx: m, mappings: vec![], ranges: vec![] });
    }
    out
}

/// Mappings whose two sides are not the same text: none, when the projection keeps its promise (CP-8).
pub fn unverified(p: &Projected, src: &str) -> Vec<Mapping> {
    p.mappings
        .iter()
        .filter(|m| {
            let g = p.code.get(m.gen as usize..(m.gen + m.len) as usize);
            let s = src.get(m.src as usize..(m.src + m.len) as usize);
            g.is_none() || g != s
        })
        .copied()
        .collect()
}

/// TY-4c: an `.rx` module read by its signature (MO-9) is typed by the `.d.ts` TypeScript emits from its projection (TY-1c);
/// none is shipped here, so its exports are `any`.
fn signature_stub(sig: &ModSig) -> String {
    sig.exports
        .iter()
        .map(|(n, x)| match x {
            ExportSig::Type => format!("export type {n} = any;"),
            ExportSig::Comp { .. } => format!("export declare function {n}(props: any): any;"),
            // a class is a value and the type of its instances (`errored fallback(e: NotFound)`)
            ExportSig::ErrClass { .. } => format!("export declare const {n}: any;\nexport type {n} = any;"),
            _ => format!("export declare const {n}: any;"),
        })
        .collect::<Vec<_>>()
        .join("\n")
}
/// MO-8: a `.d.rx` as TypeScript's `.d.ts` for the same JS module.
pub(crate) fn declaration_file(decls: &[JsDecl]) -> String {
    let own: IndexSet<&str> = decls.iter().filter(|d| matches!(d, JsDecl::Type { .. })).map(|d| d.name()).collect();
    let mut head: Vec<String> = vec![];
    if decls.iter().any(|d| matches!(d, JsDecl::Comp { .. } | JsDecl::Fn { shape: crate::parse::Shape::Comp, .. })) {
        // MO-11a: a field's types
        if !own.contains("View") {
            head.push("type View = import(\"@solidjs/web/jsx-runtime\").JSX.Element;".into());
        }
        if !own.contains("Component") {
            head.push("type Component<P = any> = (props: P) => View;".into());
        }
    }
    // MO-8d: a generic component's type parameters come before its props, as a generic function's do
    let fn_of = |props: &[crate::parse::JsProp], tparams: &Option<String>, props_type: &Option<String>| -> String { format!("{}(props: {}) => View", tparams.as_deref().unwrap_or(""), props_text(props, props_type, false)) };
    // MO-11q: `Dialog.Root` and its siblings are members of one exported object (itself a component when it is declared one)
    let mut members: IndexMap<String, Vec<&JsDecl>> = IndexMap::new();
    for d in decls {
        if let JsDecl::Comp { name, .. } = d {
            if let Some((h, _)) = name.split_once('.') {
                members.entry(h.to_string()).or_default().push(d);
            }
        }
    }
    let object_of = |h: &str| -> String {
        let ms: Vec<String> = members[h]
            .iter()
            .map(|m| match m {
                JsDecl::Comp { name, props, tparams, props_type, .. } => format!("{}: {};", &name[h.len() + 1..], fn_of(props, tparams, props_type)),
                _ => unreachable!(),
            })
            .collect();
        format!("{{ {} }}", ms.join(" "))
    };
    let objects: Vec<String> = members.keys().filter(|h| !decls.iter().any(|d| matches!(d, JsDecl::Comp { name, .. } if name == *h))).map(|h| format!("export declare const {h}: {};", object_of(h))).collect();
    // MO-8t: `export fn toaster.show(…)` — a method of a declared value, a member of that value's type; of a declared fn,
    // a function of the namespace TypeScript merges with it
    let sig_of = |d: &JsDecl| -> (String, String, String) {
        let JsDecl::Fn { params, ptypes, ret, tparams, refs, shape, opts, .. } = d else { unreachable!() };
        // MO-10a: a `ref` parameter is an accessor in JS; MO-8e: an optional one is `?`
        let ps = params.iter().enumerate().map(|(i, n)| {
            let o = if opts.get(i).copied().unwrap_or(false) { "?" } else { "" };
            match (refs.get(i).copied().unwrap_or(false), ptypes.get(i).and_then(|t| t.as_ref())) {
                (true, t) => format!("{n}{o}: (() => {})", t.map(String::as_str).unwrap_or("any")),
                (false, Some(t)) => format!("{n}{o}: {t}"),
                (false, None) if !o.is_empty() => format!("{n}?: any"),
                (false, None) => n.clone(),
            }
        });
        (tparams.clone().unwrap_or_default(), ps.collect::<Vec<_>>().join(", "), accessor_result(ret.as_ref(), shape))
    };
    let methods_of = |h: &str| -> Vec<&JsDecl> { decls.iter().filter(|d| matches!(d, JsDecl::Fn { name, .. } if name.split_once('.').is_some_and(|(b, _)| b == h))).collect() };
    head.into_iter()
        .chain(objects)
        .chain(decls.iter().filter(|d| !matches!(d, JsDecl::Context { .. } | JsDecl::Import { .. } | JsDecl::Host { .. }) && !matches!(d, JsDecl::Comp { name, .. } | JsDecl::Fn { name, .. } if name.contains('.'))).map(|d| match d {
            // MO-8u: the row named `default` is the module's default export — a word TypeScript does not take as a name
            JsDecl::Comp { name, props, tparams, props_type, .. } if name == "default" => format!("declare function __default{}(props: {}): View;\nexport default __default;", tparams.as_deref().unwrap_or(""), props_text(props, props_type, false)),
            JsDecl::Value { name, ty, .. } if name == "default" => format!("declare const __default: {};\nexport default __default;", ty.as_deref().unwrap_or("any")),
            JsDecl::Fn { name, .. } if name == "default" => {
                let (tp, ps, ret) = sig_of(d);
                format!("declare function __default{tp}({ps}): {ret};\nexport default __default;")
            }
            JsDecl::Comp { name, props, tparams, props_type, .. } if members.contains_key(name) => format!("export declare const {name}: ({}) & {};", fn_of(props, tparams, props_type), object_of(name)),
            JsDecl::Comp { name, props, tparams, props_type, .. } => format!("export declare function {name}{}(props: {}): View;", tparams.as_deref().unwrap_or(""), props_text(props, props_type, false)),
            JsDecl::Type { text, .. } => format!("export {text}"),
            JsDecl::Error { name, .. } => format!("export declare class {name}$ extends Error {{}}\nexport declare const {name}: (message?: string) => {name}$;\nexport type {name} = {name}$;"),
            JsDecl::Fn { name, .. } => {
                let (tp, ps, ret) = sig_of(d);
                let ms = methods_of(name);
                let ns = if ms.is_empty() { String::new() } else { format!("\nexport declare namespace {name} {{ {} }}", ms.iter().map(|m| { let (tp, ps, ret) = sig_of(m); format!("function {}{tp}({ps}): {ret};", &m.name()[name.len() + 1..]) }).collect::<Vec<_>>().join(" ")) };
                format!("export declare function {name}{tp}({ps}): {ret};{ns}")
            }
            JsDecl::Context { .. } | JsDecl::Import { .. } | JsDecl::Host { .. } => unreachable!(), // MO-12a, MO-14: filtered above
            JsDecl::Value { name, ty, .. } => {
                // MO-8g; MO-8t: with the methods its declaration gives rows
                let ms = methods_of(name);
                if ms.is_empty() {
                    format!("export declare const {name}: {};", ty.as_deref().unwrap_or("any"))
                } else {
                    let obj = ms.iter().map(|m| { let (tp, ps, ret) = sig_of(m); format!("{}: {tp}({ps}) => {ret};", &m.name()[name.len() + 1..]) }).collect::<Vec<_>>().join(" ");
                    match ty.as_deref() {
                        Some(t) => format!("export declare const {name}: ({t}) & {{ {obj} }};"),
                        None => format!("export declare const {name}: {{ {obj} }};"),
                    }
                }
            }
        }))
        .collect::<Vec<_>>()
        .join("\n")
        + "\n"
}

/// `JSON.stringify(stmts).includes('"k":"await"')`: an `await` anywhere in them, closures included.
fn has_await(ss: &[Stmt]) -> bool {
    stmts_json(ss).to_string().contains("\"k\":\"await\"")
}
/// The names an expression reads, in the order the reference's walk meets them; a `pre` reads the previous instant, so
/// nothing under it orders.
fn free_ids(e: &Expr) -> IndexSet<String> {
    fn go(v: &Value, out: &mut IndexSet<String>) {
        match v {
            Value::Array(xs) => xs.iter().for_each(|x| go(x, out)),
            Value::Object(o) => {
                if o.get("k").and_then(|k| k.as_str()) == Some("id") {
                    if let Some(n) = o.get("name").and_then(|n| n.as_str()) {
                        out.insert(n.to_string());
                    }
                }
                if o.get("k").and_then(|k| k.as_str()) == Some("pre") {
                    return;
                }
                for (k, x) in o {
                    if k != "k" {
                        go(x, out);
                    }
                }
            }
            _ => {}
        }
    }
    let mut out = IndexSet::new();
    go(&e.to_json(), &mut out);
    out
}

struct Proj<'a> {
    w: W,
    set: &'a ModuleSet,
    path: &'a str,
    src: &'a str,
    js_stubs: &'a mut IndexMap<String, IndexSet<String>>,
    /// prelude names the module reads
    used: IndexSet<String>,
    /// names the module declares (they shadow the prelude)
    declared: HashSet<String>,
    /// MO-10: declared JS fns with a `ref` parameter or result, by local name
    ref_fns: HashMap<String, JsDecl>,
    /// MO-10b: equations bound to such a fn's tuple or record result
    ref_parts: HashMap<String, crate::parse::Shape>,
    /// MO-11t: the props of the JS components this module imports that take a view
    views: crate::modules::ViewProps,
    prelude: Option<&'a str>,
}

impl Proj<'_> {
    // ---- where a name or a written type is, in the source ----
    /// The first whole-word `word` in `within`, at or after `from`.
    fn find(&self, word: &str, within: Span, from: usize) -> Option<usize> {
        if within.is_none() || word.is_empty() {
            return None;
        }
        let (a, b) = ((within.start as usize).max(from), within.end as usize);
        let hay = self.src.get(a..b)?;
        let wordy = word.starts_with(is_word);
        hay.match_indices(word).find_map(|(i, _)| {
            let before = hay[..i].chars().next_back();
            let after = hay[i + word.len()..].chars().next();
            (!wordy || (!before.is_some_and(is_word) && !after.is_some_and(is_word))).then_some(a + i)
        })
    }
    /// `word` as found in `within` from `*from` on, mapped; `*from` moves past it.
    fn name(&self, word: &str, within: Span, from: &mut usize) -> Code {
        let at = self.find(word, within, *from);
        if let Some(a) = at {
            *from = a + word.len();
        }
        Code::new().at(word, at)
    }
    /// A written type's text (row words dropped), found after `*from`.
    fn ty(&self, t: &str, within: Span, from: &mut usize) -> Code {
        self.name(t, within, from)
    }
    /// `: T`, or nothing.
    fn ann(&self, t: &Option<String>, within: Span, from: &mut usize) -> Code {
        match type_text(t) {
            Some(x) => Code::of(": ").c(self.ty(&x, within, from)),
            None => Code::new(),
        }
    }
    /// `n` or `n: T` for a parameter list of names and their written types (no row words to drop).
    fn params(&self, params: &[String], ptypes: &[Option<String>], within: Span, from: &mut usize) -> Code {
        let ps = params
            .iter()
            .enumerate()
            .map(|(i, n)| {
                let c = self.name(n, within, from);
                match ptypes.get(i).and_then(|t| t.as_ref()) {
                    Some(t) => c.t(": ").c(self.ty(t, within, from)),
                    None => c,
                }
            })
            .collect();
        Code::join(ps, ", ")
    }

    fn module(&mut self, p: &Program) {
        let saved = std::mem::replace(&mut self.w, W::new());
        self.decls(&p.decls, "", true);
        if !p.view.is_empty() {
            self.w.emit(Code::of("export const __view = ("), p.view[0].line.unwrap_or(1));
            self.markup(&p.view, "  ");
            self.w.emit(Code::of(");"), p.view[p.view.len() - 1].line.unwrap_or(1));
        }
        if let Some(Decl::Component { line, .. }) = p.decls.iter().find(|d| matches!(d, Decl::Component { is_default: true, .. })) {
            // CP-4a: what JS imports from an entry
            self.w.emit(Code::of("declare const __main: __.Main; export default __main;"), *line);
        }
        let body = std::mem::replace(&mut self.w, saved);
        let prelude: Vec<String> = self.used.iter().cloned().collect();
        let types: Vec<&str> = ["View", "Panic"].into_iter().filter(|n| !self.declared.contains(*n)).collect();
        let rel = self.prelude.map(|p| p.to_string()).unwrap_or_else(|| self.rel("__prelude.ts"));
        let mut head = format!("import * as __ from \"{rel}\"; import type {{ {} }} from \"{rel}\";", types.join(", "));
        if !prelude.is_empty() {
            head += &format!(" import {{ {} }} from \"{rel}\";", prelude.join(", "));
        }
        self.w.emit(Code::of(&head), 0);
        if !body.lines.is_empty() {
            self.w.buf.s.push('\n');
            self.w.buf.push(body.buf);
            self.w.lines.extend(body.lines);
        }
    }
    /// A path relative to this module's directory, for the prelude (at the root of the program).
    fn rel(&self, f: &str) -> String {
        let depth = self.path.split('/').count() as i64 - 1 - (self.set.entry.split('/').count() as i64 - 1);
        if depth > 0 {
            "../".repeat(depth as usize) + f
        } else {
            format!("./{f}")
        }
    }

    // ---- declarations, in dependency order (functions are hoisted; values are not) ----
    fn decls(&mut self, ds: &[Decl], ind: &str, top: bool) {
        let ex = |d: &Decl| if top && d.exported() { "export " } else { "" };
        // what the module binds at its top; a nested name shadows the prelude's where it stands
        for d in ds.iter().filter(|_| top) {
            if let Some(n) = d.name() {
                self.declared.insert(n.to_string());
            }
            if let Decl::Import { names, .. } = d {
                self.declared.extend(names.iter().map(|n| n.alias.clone()));
            }
        }
        for d in ds {
            let sp = d.span();
            let mut at = sp.start as usize;
            match d {
                Decl::Import { .. } => self.import_decl(d, ind),
                Decl::TypeDecl { text, line, .. } => {
                    let c = Code::of(ind).t(ex(d)).c(self.name(text, sp, &mut at));
                    self.w.emit(c, *line);
                }
                Decl::Error { name, params, ptypes, msg, line, .. } => {
                    let fields = params.iter().enumerate().map(|(i, n)| format!("declare {n}: {};", ptypes.get(i).and_then(|t| t.as_deref()).unwrap_or("any"))).collect::<Vec<_>>().join(" ");
                    let nm = self.name(name, sp, &mut at);
                    let ps = self.params(params, ptypes, sp, &mut at);
                    let body = match msg {
                        Some(m) => Code::of("{ void (").c(self.expr(m, false, None)).t(&format!("); return new {name}$(); }}")),
                        None => Code::of(&format!("new {name}$()")),
                    };
                    let c = Code::of(&format!("{ind}{}class {name}$ extends Error {{ {fields} }}\n{ind}{}const ", ex(d), ex(d)))
                        .c(nm)
                        .t(" = (")
                        .c(ps)
                        .t(&format!("): {name}$ => "))
                        .c(body)
                        .t(&format!(";\n{ind}{}type {name} = {name}$;", ex(d)));
                    self.w.emit(c, *line);
                }
                Decl::Context { name, ty, dflt, line, .. } => {
                    let nm = self.name(name, sp, &mut at);
                    let t = match type_text(ty) {
                        Some(x) => self.ty(&x, sp, &mut at),
                        None => Code::of("any"),
                    };
                    let dv = dflt.as_ref().map(|e| self.expr(e, false, None)).unwrap_or_default();
                    let c = Code::of(ind).t(ex(d)).t("const ").c(nm).t(" = __.ctx<").c(t).t(">(").c(dv).t(");");
                    self.w.emit(c, *line);
                }
                _ => {}
            }
        }
        for d in ds {
            let sp = d.span();
            let mut at = sp.start as usize;
            match d {
                Decl::Fn { name, params, decls, tail, line, ret, .. } => {
                    let nm = self.name(name, sp, &mut at);
                    let ps = Code::join(
                        params
                            .iter()
                            .map(|p| {
                                let n = self.name(&p.name, sp, &mut at);
                                n.c(self.ann(&p.ty, sp, &mut at))
                            })
                            .collect(),
                        ", ",
                    );
                    let r = self.ann(ret, sp, &mut at);
                    let head = Code::of(ind).t(ex(d)).t("function ").c(nm).t("(").c(ps).t(")").c(r);
                    if decls.is_empty() {
                        let t = self.expr(tail, false, None);
                        self.w.emit(head.t(" { return ").c(t).t("; }"), *line);
                        continue;
                    }
                    self.w.emit(head.t(" {"), *line);
                    self.decls(decls, &format!("{ind}  "), false);
                    let t = self.expr(tail, false, None);
                    self.w.emit(Code::of(&format!("{ind}  return ")).c(t).t(&format!(";\n{ind}}}")), *line);
                }
                Decl::Component { name, props, decls, view, line, props_type, no_props, .. } => {
                    let nm = self.name(name, sp, &mut at);
                    // TY-3d (2026-11-24): `component C()` declares no props, and takes none — a function of nothing
                    if *no_props {
                        self.w.emit(Code::of(ind).t(ex(d)).t("function ").c(nm).t("() {"), *line);
                        self.decls(decls, &format!("{ind}  "), false);
                        self.w.emit(Code::of(&format!("{ind}  return (")), *line);
                        self.markup(view, &format!("{ind}    "));
                        self.w.emit(Code::of(&format!("{ind}  );\n{ind}}}")), *line);
                        continue;
                    }
                    let pn = self.name(props, sp, &mut at);
                    let pt = match props_type {
                        // MO-10f: a field's row words (`data: pending fails(Error) T`) are `.rx`'s, not TypeScript's: the
                        // type is written without them, each piece between them mapped where it is
                        Some(t) => {
                            let mut c = Code::of(": ");
                            let mut last = 0;
                            for m in PROP_ROWS.captures_iter(t) {
                                let words = m.get(2).unwrap();
                                c = c.c(self.ty(&t[last..words.start()], sp, &mut at));
                                last = words.end();
                            }
                            c.c(self.ty(&t[last..], sp, &mut at))
                        }
                        None => Code::of(": any"),
                    };
                    self.w.emit(Code::of(ind).t(ex(d)).t("function ").c(nm).t("(").c(pn).c(pt).t(") {"), *line);
                    self.decls(decls, &format!("{ind}  "), false);
                    self.w.emit(Code::of(&format!("{ind}  return (")), *line);
                    self.markup(view, &format!("{ind}    "));
                    self.w.emit(Code::of(&format!("{ind}  );\n{ind}}}")), *line);
                }
                Decl::Action { name, params, ptypes, body, line, .. } | Decl::Server { name, params, ptypes, body, line, .. } => {
                    let nm = self.name(name, sp, &mut at);
                    let ps = self.params(params, ptypes, sp, &mut at);
                    let r = match d {
                        Decl::Server { ret: Some(r), .. } => Code::of(": Promise<").c(self.ty(r, sp, &mut at)).t(">"),
                        _ => Code::new(),
                    };
                    self.w.emit(Code::of(ind).t(ex(d)).t("async function ").c(nm).t("(").c(ps).t(")").c(r).t(" {"), *line);
                    self.stmts(body, &format!("{ind}  "));
                    self.w.emit(Code::of(&format!("{ind}}}")), *line);
                    if matches!(d, Decl::Server { .. }) {
                        // SF-6a, statically where the types are known
                        self.w.emit(Code::of(&format!("{ind}__.wire({name}, true);")), *line);
                    }
                }
                _ => {}
            }
        }
        for d in self.order(ds) {
            let sp = d.span();
            let mut at = sp.start as usize;
            match d {
                Decl::Source { name, init, line, ty, .. } => {
                    let nm = self.name(name, sp, &mut at);
                    let a = self.ann(ty, sp, &mut at);
                    let v = match type_text(ty) {
                        Some(t) => Code::of(&format!("__.typed<{t}>(")).c(self.expr(init, false, None)).t(")"),
                        None => Code::of("__.src(").c(self.expr(init, false, None)).t(")"),
                    };
                    self.w.emit(Code::of(ind).t(ex(d)).t("const ").c(nm).c(a).t(" = ").c(v).t(";").from(sp), *line);
                }
                Decl::Eq { name, e, line, ty, .. } => {
                    let nm = self.name(name, sp, &mut at);
                    let a = self.ann(ty, sp, &mut at);
                    // MO-10b: a `ref` result is read as its value
                    let x = match &e.k {
                        ExprKind::Call { f, .. } => match &f.k {
                            ExprKind::Id(g) => self.ref_fns.get(g).and_then(|d| if let JsDecl::Fn { shape, .. } = d { Some(shape.clone()) } else { None }),
                            _ => None,
                        },
                        _ => None,
                    };
                    if let Some(sh @ (crate::parse::Shape::Items(_) | crate::parse::Shape::Fields(_))) = &x {
                        self.ref_parts.insert(name.clone(), sh.clone());
                    }
                    let whole = matches!(x, Some(crate::parse::Shape::Part(crate::parse::Part::Ref)));
                    let v = Code::of("__.eq(").c(self.expr(e, false, Some(name))).t(if whole { "(), true)" } else { ", true)" });   // R-1: no promise without `await`
                    self.w.emit(Code::of(ind).t(ex(d)).t("const ").c(nm).c(a).t(" = ").c(v).t(";").from(sp), *line);
                }
                Decl::Provide { name, e, line, .. } => {
                    let nm = self.name(name, sp, &mut at);
                    let v = self.expr(e, false, None);
                    self.w.emit(Code::of(&format!("{ind}__.provide(")).c(nm).t(", ").c(v).t(");"), *line);
                }
                _ => {}
            }
        }
        for d in ds {
            if let Decl::Effect { inputs, body, line, .. } = d {
                self.w.emit(Code::of(&format!("{ind}__.effect(() => {{")), *line);
                for (i, e) in inputs.iter().enumerate() {
                    let v = self.expr(e, false, None);
                    self.w.emit(Code::of(&format!("{ind}  const ${i} = ")).c(v).t(";"), *line);
                }
                self.stmts(body, &format!("{ind}  "));
                self.w.emit(Code::of(&format!("{ind}}});")), *line);
            }
        }
    }

    fn import_decl(&mut self, d: &Decl, ind: &str) {
        let Decl::Import { names, from, line, resolved, declared, .. } = d else { return };
        let sp = d.span();
        // the prelude's own (`import { log } from "./prelude"`)
        for n in names.iter().filter(|n| in_prelude(d, &n.name, self.set.conformance)) {
            self.used.insert(if n.name == n.alias { n.name.clone() } else { format!("{} as {}", n.name, n.alias) });
        }
        let rest: Vec<&ImportName> = names.iter().filter(|n| !in_prelude(d, &n.name, self.set.conformance)).collect();
        if rest.is_empty() {
            return;
        }
        if let Some(dp) = declared {
            for n in &rest {
                let x = self.set.declarations.get(dp).and_then(|ds| ds.iter().find(|y| matches!(y, JsDecl::Fn { name, .. } if *name == n.name)));
                if let Some(x @ JsDecl::Fn { refs, shape, .. }) = x {
                    if refs.iter().any(|r| *r) || shape.has_ref() {
                        self.ref_fns.insert(n.alias.clone(), x.clone());
                    }
                }
            }
        }
        if resolved.is_none() && declared.is_none() {
            // a JS module with no declaration: `any`
            let key = self.mod_path(from) + ".ts";
            let s = self.js_stubs.entry(key).or_default();
            for n in &rest {
                s.insert(n.name.clone());
            }
        }
        let mut at = sp.start as usize;
        let def = rest.iter().find(|n| n.name == "default").map(|n| self.name(&n.alias, sp, &mut at));
        let parts: Vec<Code> = rest
            .iter()
            .filter(|n| n.name != "default")
            .map(|n| {
                if n.name == n.alias {
                    self.name(&n.name, sp, &mut at)
                } else {
                    let a = self.name(&n.name, sp, &mut at);
                    a.t(" as ").c(self.name(&n.alias, sp, &mut at))
                }
            })
            .collect();
        let mut c = Code::of(ind).t("import ");
        let has_parts = !parts.is_empty();
        if let Some(def) = def {
            c = c.c(def).t(if has_parts { ", " } else { "" });
        }
        if has_parts {
            c = c.t("{ ").c(Code::join(parts, ", ")).t(" }");
        }
        // MO-13d: an import whose declaration is a printed signature is typed as the .rx module the signature stands for
        // (TY-4c: `x.rx.d.ts`, beside it), so its specifier is that module's, and maps nowhere
        if let (Some(r), false) = (resolved, crate::modules::is_rx(from)) {
            c = c.t(" from ").t(&js_str(&crate::modules::relative_module(&self.path, r))).t(";");
            self.w.emit(c, *line);
            return;
        }
        let q = js_str(from);
        let fa = self.find(&q[1..q.len() - 1], sp, at).map(|a| a - 1).filter(|a| self.src[*a..].starts_with(&q));
        c = c.t(" from ").at(&q, fa).t(";");
        self.w.emit(c, *line);
    }
    /// A JS import's module, from the program's root (where the stubs are written).
    fn mod_path(&self, from: &str) -> String {
        let mut parts: Vec<&str> = self.path.split('/').collect();
        parts.pop();
        for seg in from.split('/') {
            if seg == "." || seg.is_empty() {
                continue;
            }
            if seg == ".." {
                parts.pop();
            } else {
                parts.push(seg);
            }
        }
        parts.join("/")
    }
    /// E-7: values in dependency order (C-1 makes it a DAG; a `pre` reads the previous instant, so it is no edge).
    fn order<'d>(&self, ds: &'d [Decl]) -> Vec<&'d Decl> {
        let vals: Vec<&Decl> = ds.iter().filter(|d| matches!(d, Decl::Source { .. } | Decl::Eq { .. } | Decl::Provide { .. })).collect();
        let mut by_name: IndexMap<&str, usize> = IndexMap::new();
        for (i, d) in vals.iter().enumerate() {
            if !matches!(d, Decl::Provide { .. }) {
                by_name.insert(d.name().unwrap(), i);
            }
        }
        fn visit<'d>(i: usize, vals: &[&'d Decl], by_name: &IndexMap<&str, usize>, done: &mut Vec<bool>, busy: &mut Vec<bool>, out: &mut Vec<&'d Decl>) {
            if done[i] || busy[i] {
                return;
            }
            busy[i] = true;
            let e = match vals[i] {
                Decl::Eq { e, .. } | Decl::Provide { e, .. } => e,
                Decl::Source { init, .. } => init,
                _ => unreachable!(),
            };
            for n in free_ids(e) {
                if let Some(&t) = by_name.get(n.as_str()) {
                    if t != i {
                        visit(t, vals, by_name, done, busy, out);
                    }
                }
            }
            busy[i] = false;
            done[i] = true;
            out.push(vals[i]);
        }
        let (mut done, mut busy, mut out) = (vec![false; vals.len()], vec![false; vals.len()], vec![]);
        for i in 0..vals.len() {
            visit(i, &vals, &by_name, &mut done, &mut busy, &mut out);
        }
        out
    }

    // ---- imperative scope ----
    fn stmts(&mut self, ss: &[Stmt], ind: &str) {
        for s in ss {
            let sp = s.span;
            let mut at = sp.start as usize;
            match &s.k {
                StmtKind::Let { name, e, ty } => {
                    let nm = self.name(name, sp, &mut at);
                    let a = self.ann(ty, sp, &mut at);
                    let v = self.expr(e, true, None);
                    self.w.emit(Code::of(&format!("{ind}let ")).c(nm).c(a).t(" = ").c(v).t(";").from(sp), 0);
                }
                StmtKind::Expr(e) => {
                    let v = self.expr(e, true, None);
                    self.w.emit(Code::of(ind).c(v).t(";").from(sp), 0);
                }
                StmtKind::Return(e) => {
                    let v = match e {
                        Some(e) => Code::of(" ").c(self.expr(e, true, None)),
                        None => Code::new(),
                    };
                    self.w.emit(Code::of(&format!("{ind}return")).c(v).t(";").from(sp), 0);
                }
                StmtKind::Throw(e) => {
                    let v = self.expr(e, true, None);
                    self.w.emit(Code::of(&format!("{ind}throw ")).c(v).t(";").from(sp), 0);
                }
                StmtKind::Write { target, e } | StmtKind::Optimistic { target, e } => {
                    let t = self.target(target, sp, &mut at);
                    let v = self.expr(e, true, None);
                    self.w.emit(Code::of(&format!("{ind}__.set(")).c(t).t(")(").c(v).t(");").from(sp), 0);
                }
                StmtKind::Refresh(n) | StmtKind::Affects(n) => {
                    let nm = self.name(n, sp, &mut at);
                    self.w.emit(Code::of(&format!("{ind}void ")).c(nm).t(";"), 0);
                }
                StmtKind::Action(body) => {
                    self.w.emit(Code::of(&format!("{ind}void (async () => {{")), 0);
                    self.stmts(body, &format!("{ind}  "));
                    self.w.emit(Code::of(&format!("{ind}}})();")), 0);
                }
                StmtKind::Sif { c, t, f } => {
                    let v = self.expr(c, true, None);
                    self.w.emit(Code::of(&format!("{ind}if (")).c(v).t(") {"), 0);
                    self.stmts(t, &format!("{ind}  "));
                    self.w.emit(Code::of(&format!("{ind}}} else {{")), 0);
                    self.stmts(f, &format!("{ind}  "));
                    self.w.emit(Code::of(&format!("{ind}}}")), 0);
                }
                StmtKind::For { name, e, body } => {
                    let nm = self.name(name, sp, &mut at);
                    let v = self.expr(e, true, None);
                    self.w.emit(Code::of(&format!("{ind}for (const ")).c(nm).t(" of ").c(v).t(") {"), 0);
                    self.stmts(body, &format!("{ind}  "));
                    self.w.emit(Code::of(&format!("{ind}}}")), 0);
                }
                StmtKind::Try { body, catch_name, catch_classes, handler, fin } => {
                    self.w.emit(Code::of(&format!("{ind}try {{")), 0);
                    self.stmts(body, &format!("{ind}  "));
                    if let Some(h) = handler {
                        let bind = match catch_name {
                            Some(n) => format!(" const {n} = __e as {};", catch_classes.as_ref().map(|c| c.join(" | ")).unwrap_or("Error".into())),
                            None => String::new(),
                        };
                        self.w.emit(Code::of(&format!("{ind}}} catch (__e) {{{bind}")), 0);
                        self.stmts(h, &format!("{ind}  "));
                    }
                    if let Some(f) = fin {
                        self.w.emit(Code::of(&format!("{ind}}} finally {{")), 0);
                        self.stmts(f, &format!("{ind}  "));
                    }
                    self.w.emit(Code::of(&format!("{ind}}}")), 0);
                }
            }
        }
    }
    fn target(&mut self, t: &Target, within: Span, at: &mut usize) -> Code {
        let nm = self.name(&t.name, within, at);
        let mut s = if t.is_ctx() { Code::of("__.use(").c(nm).t(")") } else { nm };
        for p in &t.path {
            s = match p {
                PathSeg::Name(n) => {
                    let m = self.name(n, within, at);
                    s.t(".").c(m)
                }
                PathSeg::Expr(e) => s.t("[").c(self.expr(e, true, None)).t("]"),
            };
        }
        s
    }

    // ---- expressions: `imp` imperative scope (a real `await`); `me` the equation being defined (its own `pre`) ----
    fn expr(&mut self, e: &Expr, imp: bool, me: Option<&str>) -> Code {
        self.expr_text(e, imp, me).from(e.span)
    }
    fn expr_text(&mut self, e: &Expr, imp: bool, me: Option<&str>) -> Code {
        let sp = e.span;
        let src_at = |text: &str| -> Option<usize> { (!sp.is_none() && sp.text(self.src) == text).then_some(sp.start as usize) };
        macro_rules! go {
            ($x:expr) => {
                self.expr($x, imp, me)
            };
        }
        match &e.k {
            ExprKind::Lit(l) => {
                let t = j(l);
                let at = src_at(&t);
                Code::new().at(&t, at)
            }
            ExprKind::Id(n) => {
                if language(n, self.declared.contains(n), self.set.conformance).is_some() {
                    self.used.insert(n.clone());
                }
                let at = src_at(n);
                Code::new().at(n, at)
            }
            ExprKind::Pre { name, init } => {
                let mut from = sp.start as usize;
                if me == Some(name.as_str()) {
                    match init {
                        Some(i) => Code::of("__.pre(").c(go!(i)).t(")"),
                        None => Code::of("__.pre<any>()"),
                    }
                } else {
                    let nm = self.name(name, sp, &mut from);
                    let iv = init.as_ref().map(|i| go!(i)).unwrap_or_default();
                    Code::of("__.pre<typeof ").c(nm).t(">(").c(iv).t(")")
                }
            }
            ExprKind::Peek(x) | ExprKind::Latest(x) => go!(x),
            ExprKind::Pending(x) => Code::of("__.pending(").c(go!(x)).t(")"),
            ExprKind::Await { e: x, init, stream } => {
                if imp {
                    return Code::of("(await ").c(go!(x)).t(")");
                }
                let v = Code::of(if *stream { "__.awaitS(" } else { "__.await_(" }).c(go!(x)).t(")");
                match init {
                    Some(i) => Code::of("__.first(").c(v).t(", ").c(go!(i)).t(")"),
                    None => v,
                }
            }
            ExprKind::If { c, t, f } => Code::of("(").c(go!(c)).t(" ? ").c(go!(t)).t(" : ").c(go!(f)).t(")"),
            ExprKind::Throw(x) => Code::of("__.raise(").c(go!(x)).t(")"),
            ExprKind::Catch { e: x, name, classes, alt } => {
                let v = go!(x);
                let a = go!(alt);
                Code::of("__.caught(").c(v).t(&format!(", ({}: {}) => ", name.as_deref().unwrap_or("__e"), classes.as_ref().map(|c| c.join(" | ")).unwrap_or("Error".into()))).c(a).t(")")
            }
            ExprKind::Tpl(parts) => {
                let mut c = Code::of("`");
                for p in parts {
                    match p {
                        TplPart::Str(s) => c = c.t(&escape_tpl(s)),
                        TplPart::Expr(x) => c = c.t("${").c(go!(x)).t("}"),
                    }
                }
                c.t("`")
            }
            ExprKind::Member { o, p, opt } => {
                // `.p` with its dot, so that a position just after the dot (what is being typed) is mapped too
                let dot = format!(".{p}");
                let at = (!sp.is_none() && sp.text(self.src).ends_with(dot.as_str())).then(|| sp.end as usize - dot.len());
                let call = match &o.k {
                    ExprKind::Id(on) => matches!(self.ref_parts.get(on), Some(crate::parse::Shape::Fields(fs)) if fs.iter().any(|f| &f.0 == p && f.1 == crate::parse::Part::Ref)),
                    _ => false,
                };
                go!(o).t(if *opt { "?" } else { "" }).at(&dot, at).t(if call { "()" } else { "" }) // MO-10b
            }
            ExprKind::Index { o, i, opt } => {
                let call = match (&o.k, &i.k) {
                    (ExprKind::Id(on), ExprKind::Lit(Lit::Num(v))) => matches!(self.ref_parts.get(on), Some(crate::parse::Shape::Items(items)) if *v >= 0.0 && v.fract() == 0.0 && items.get(*v as usize) == Some(&crate::parse::Part::Ref)),
                    _ => false,
                };
                go!(o).t(if *opt { "?.[" } else { "[" }).c(go!(i)).t("]").t(if call { "()" } else { "" }) // MO-10b
            }
            ExprKind::StyleMap { css, .. } => Code::of(&class_map(css)),
            ExprKind::Call { f, args, targs } => {
                // MO-10a: a `ref` argument is an accessor
                let refs: Vec<bool> = match &f.k {
                    ExprKind::Id(g) => self.ref_fns.get(g).map(|d| if let JsDecl::Fn { refs, .. } = d { refs.clone() } else { vec![] }).unwrap_or_default(),
                    _ => vec![],
                };
                let fc = go!(f);
                let a = args.iter().enumerate().map(|(i, a)| if refs.get(i).copied().unwrap_or(false) { Code::of("() => (").c(go!(a)).t(")") } else { go!(a) }).collect();
                fc.t(&format!("{}(", targs.as_ref().map(|t| format!("<{}>", t)).unwrap_or_default())).c(Code::join(a, ", ")).t(")")   // 07 §3: type arguments, as written
            }
            ExprKind::Arr(items) => {
                let a = items.iter().map(|a| go!(a)).collect();
                Code::of("[").c(Code::join(a, ", ")).t("]")
            }
            ExprKind::Rec(fields) => {
                let fs = fields
                    .iter()
                    .map(|f| match f {
                        Field::Spread(x) => Code::of("...").c(go!(x)),
                        Field::Kv { key, v } => Code::of(&js_str(key)).t(": ").c(go!(v)),
                    })
                    .collect();
                Code::of("({ ").c(Code::join(fs, ", ")).t(" })")
            }
            ExprKind::Spread(x) => Code::of("...").c(go!(x)),
            ExprKind::Omit { e: x, keys } => {
                let ks: String = keys.iter().map(|k| format!(", {}", js_str(k))).collect();
                Code::of("__.omit(").c(go!(x)).t(&ks).t(")")
            }
            ExprKind::Fn { params, body, stmts, ptypes } => {
                let mut from = sp.start as usize;
                let ps = self.params(params, ptypes, sp, &mut from);   // 07 §3: a parameter's type
                let Some(ss) = stmts else {
                    return Code::of("((").c(ps).t(") => ").c(self.expr(body, imp, me)).t(")");
                };
                let inner = self.nested(|me| me.stmts(ss, "  "));
                Code::of(if has_await(ss) { "(async (" } else { "((" }).c(ps).t(") => {\n").c(inner).t("\n})")
            }
            ExprKind::ServerFn { params, ptypes, ret, body } => {
                let mut from = sp.start as usize;
                let ps = self.params(params, ptypes, sp, &mut from);
                let r = match ret {
                    Some(r) => Code::of(": Promise<").c(self.ty(r, sp, &mut from)).t(">"),
                    None => Code::new(),
                };
                let inner = self.nested(|me| me.stmts(body, "  "));
                // SF-1d: an async function, its wire checked (TY-5a)
                Code::of("((__f) => (__.wire(__f, true), __f))(async (").c(ps).t(")").c(r).t(" => {\n").c(inner).t("\n})")
            }
            ExprKind::Draft { seed, body } => {
                let s = go!(seed);
                let inner = self.nested(|me| me.stmts(body, "  "));
                Code::of("__.draft(").c(s).t(", (d) => {\n").c(inner).t("\n})")
            }
            ExprKind::Use(n) => {
                let mut from = sp.start as usize + 3;
                Code::of("__.use(").c(self.name(n, sp, &mut from)).t(")")
            }
            ExprKind::Bin { op, l, r } => {
                let o = match op.as_str() {
                    "==" => "===",
                    "!=" => "!==",
                    o => o,
                };
                Code::of("(").c(go!(l)).t(&format!(" {o} ")).c(go!(r)).t(")")
            }
            ExprKind::Un { op, e: x } => Code::of("(").t(op).c(go!(x)).t(")"),
        }
    }
    /// What `f` writes, as one piece of text (a closure's body).
    fn nested(&mut self, f: impl FnOnce(&mut Self)) -> Code {
        let saved = std::mem::replace(&mut self.w, W::new());
        f(self);
        std::mem::replace(&mut self.w, saved).buf
    }

    // ---- views: JSX over Solid's JSX types ----
    fn markup(&mut self, ms: &[Markup], ind: &str) {
        if ms.is_empty() {
            self.w.emit(Code::of(&format!("{ind}null")), 0);
            return;
        }
        self.w.emit(Code::of(&format!("{ind}<>")), ms[0].line.unwrap_or(0));
        for m in ms {
            self.child(m, &format!("{ind}  "));
        }
        self.w.emit(Code::of(&format!("{ind}</>")), ms[ms.len() - 1].line.unwrap_or(0));
    }
    fn region(&mut self, decls: &[Decl], view: &[Markup], ind: &str, line: usize) {
        if decls.is_empty() {
            self.markup(view, ind);
            return;
        }
        self.w.emit(Code::of(&format!("{ind}(() => {{")), line);
        self.decls(decls, &format!("{ind}  "), false);
        self.w.emit(Code::of(&format!("{ind}  return (")), line);
        self.markup(view, &format!("{ind}    "));
        self.w.emit(Code::of(&format!("{ind}  );\n{ind}}})()")), line);
    }
    fn child(&mut self, m: &Markup, ind: &str) {
        let line = m.line.unwrap_or(0);
        let sp = m.span;
        let i2 = format!("{ind}  ");
        match &m.kind {
            MarkupKind::Text(s) => self.w.emit(Code::of(&format!("{ind}{{{}}}", js_str(s))), line),
            MarkupKind::Style(_) => {}
            MarkupKind::Read(e) => {
                let v = self.expr(e, false, None);
                self.w.emit(Code::of(&format!("{ind}{{")).c(v).t("}").from(sp), line);
            }
            MarkupKind::El { tag, attrs, children } => {
                if tag.is_empty() {
                    self.w.emit(Code::of(&format!("{ind}<>")), line);
                    for c in children {
                        self.child(c, &i2);
                    }
                    self.w.emit(Code::of(&format!("{ind}</>")), line);
                    return;
                }
                let tag_at = (!sp.is_none() && sp.text(self.src)[1..].starts_with(tag.as_str())).then_some(sp.start as usize + 1);
                let mut a = Code::new();
                for at in attrs {
                    // 07 §4: a spread, as JSX's
                    if at.name == "..." {
                        a = a.t(" {...").c(self.expr(&at.e, false, None)).t("}");
                        continue;
                    }
                    let name_at = (!at.span.is_none() && at.span.text(self.src) == at.name).then_some(at.span.start as usize);
                    a = a.t(" ").at(&at.name, name_at);
                    // MO-11t: a component given by name to a prop typed `View` is the component applied, which is what
                    // the library's type takes (an element) and what types its props (it is given none)
                    if let Some(n) = self.views.given(tag, &at.name, &at.e) {
                        let n_at = (!at.e.span.is_none() && at.e.span.text(self.src) == n).then_some(at.e.span.start as usize);
                        a = a.t("={<").at(n, n_at).t(" />}");
                        continue;
                    }
                    if !matches!(at.e.k, ExprKind::Lit(Lit::Bool(true))) {
                        a = a.t("={").c(self.expr(&at.e, is_handler(&at.name), None)).t("}");
                    }
                }
                let open = Code::of(&format!("{ind}<")).at(tag, tag_at).c(a);
                // MO-11k: named render props are attributes
                let named: Vec<&Markup> = children.iter().filter(|c| matches!(&c.kind, MarkupKind::Mview { prop: Some(_), .. })).collect();
                if !named.is_empty() {
                    self.w.emit(open, line);
                    let i4 = format!("{ind}    ");
                    for v in &named {
                        let MarkupKind::Mview { prop: Some(p), params, decls, body } = &v.kind else { continue };
                        let vl = v.line.unwrap_or(line);
                        let vsp = v.span;
                        let mut from = vsp.start as usize;
                        let mut c = Code::of(&format!("{ind}  {p}={{(("));
                        for (i, q) in params.iter().enumerate() {
                            if i > 0 {
                                c = c.t(", ");
                            }
                            let nm = self.name(q, vsp, &mut from);
                            c = c.c(nm);
                        }
                        self.w.emit(c.t(") => ("), vl);
                        self.region(decls, body, &i4, vl);
                        self.w.emit(Code::of(&format!("{ind}  ))}}")), vl);
                    }
                    let kids: Vec<&Markup> = children.iter().filter(|c| !matches!(&c.kind, MarkupKind::Mview { prop: Some(_), .. })).collect();
                    if kids.is_empty() {
                        self.w.emit(Code::of(&format!("{ind}/>")), line);
                        return;
                    }
                    self.w.emit(Code::of(&format!("{ind}>")), line);
                    for c in kids {
                        self.child(c, &i2);
                    }
                    self.w.emit(Code::of(&format!("{ind}</{tag}>")), line);
                    return;
                }
                if children.is_empty() {
                    self.w.emit(open.t(" />"), line);
                    return;
                }
                self.w.emit(open.t(">"), line);
                for c in children {
                    self.child(c, &i2);
                }
                let close_at = self.src.get(..sp.end as usize).filter(|s| !sp.is_none() && s.ends_with(&format!("</{tag}>"))).map(|_| sp.end as usize - tag.len() - 1);
                self.w.emit(Code::of(&format!("{ind}</")).at(tag, close_at).t(">"), line);
            }
            MarkupKind::Mif { c, t, t_decls, f, f_decls } => {
                let v = self.expr(c, false, None);
                self.w.emit(Code::of(&format!("{ind}{{")).c(v).t(" ? ("), line);
                self.region(t_decls, t, &i2, line);
                self.w.emit(Code::of(&format!("{ind}) : (")), line);
                self.region(f_decls, f, &i2, line);
                self.w.emit(Code::of(&format!("{ind})}}")), line);
            }
            MarkupKind::Mview { params, decls, body, .. } => {
                // MO-11k: the render prop, as the function the component's types expect
                let mut from = sp.start as usize;
                let mut c = Code::of(&format!("{ind}{{(("));
                for (i, p) in params.iter().enumerate() {
                    if i > 0 {
                        c = c.t(", ");
                    }
                    let nm = self.name(p, sp, &mut from);
                    c = c.c(nm);
                }
                self.w.emit(c.t(") => ("), line);
                self.region(decls, body, &i2, line);
                self.w.emit(Code::of(&format!("{ind}))}}")), line);
            }
            MarkupKind::Mfor { name, xs, decls, body } => {
                let mut from = sp.start as usize;
                let nm = self.name(name, sp, &mut from);
                let v = self.expr(xs, false, None);
                self.w.emit(Code::of(&format!("{ind}{{__.each(")).c(v).t(", (").c(nm).t(") => ("), line);
                self.region(decls, body, &i2, line);
                self.w.emit(Code::of(&format!("{ind}))}}")), line);
            }
            MarkupKind::Loading { on, fallback, decls, body } => {
                if let Some(on) = on {
                    let v = self.expr(on, false, None);
                    self.w.emit(Code::of(&format!("{ind}{{void ")).c(v).t("}"), line);
                }
                self.w.emit(Code::of(&format!("{ind}{{(")), line);
                self.markup(fallback, &i2);
                self.w.emit(Code::of(&format!("{ind})}}{{(")), line);
                self.region(decls, body, &i2, line);
                self.w.emit(Code::of(&format!("{ind})}}")), line);
            }
            MarkupKind::Portal { to, decls, body } => {
                if let Some(to) = to {
                    let v = self.expr(to, false, None);
                    self.w.emit(Code::of(&format!("{ind}{{void ")).c(v).t("}"), line);
                }
                self.w.emit(Code::of(&format!("{ind}{{(")), line);
                self.region(decls, body, &i2, line);
                self.w.emit(Code::of(&format!("{ind})}}")), line);
            }
            MarkupKind::Errored { fallback, decls, body, err_name, classes } => {
                let head = format!("{ind}{{(({}: {}) => (", err_name.as_deref().unwrap_or("__err"), classes.as_ref().map(|c| c.join(" | ")).unwrap_or("Error".into()));
                self.w.emit(Code::of(&head), line);
                self.markup(fallback, &i2);
                self.w.emit(Code::of(&format!("{ind}))(null!)}}{{(")), line);
                self.region(decls, body, &i2, line);
                self.w.emit(Code::of(&format!("{ind})}}")), line);
            }
        }
    }
}

/// A template literal's text: `` ` ``, `\` and `${` escaped.
fn escape_tpl(s: &str) -> String {
    let mut out = String::new();
    let mut it = s.chars().peekable();
    while let Some(c) = it.next() {
        match c {
            '`' | '\\' => {
                out.push('\\');
                out.push(c);
            }
            '$' if it.peek() == Some(&'{') => {
                out.push_str("\\${");
                it.next();
            }
            _ => out.push(c),
        }
    }
    out
}

/// 07 CSS-5: TSRX's class map, as its typecheck projection writes it — each class a `string`.
fn class_map(css: &str) -> String {
    use solidjs_compiler::style::*;
    let r = compile_style(StyleInput { css, location: StyleLocation { filename: "class-map.tsrx", line: 1, column: 19 }, elements: &[], kind: StyleKind::Expression, minify: false });
    let Ok(r) = r else { return "({} as const)".into() };
    if r.class_map.is_empty() {
        return "({} as const)".into();
    }
    let fields: Vec<String> = r.class_map.into_iter().map(|c| format!("{}: \"\" as string", js_str(&c.class_name))).collect();
    format!("({{ {} }} as const)", fields.join(", "))
}

/// MO-10b: a declared result's type as JS has it: a `ref` result, or a `ref` part of a tuple or record, is an accessor.
pub(crate) fn accessor_result(ret: Option<&String>, shape: &crate::parse::Shape) -> String {
    use crate::parse::{Part, Shape};
    let accessor = |t: &str| format!("(() => {})", t);
    let Some(r) = ret else { return "any".into() };
    match shape {
        Shape::Part(Part::Ref) => accessor(r),
        // MO-10b: an `as const` tuple
        _ if r.starts_with("readonly ") && r["readonly ".len()..].trim_start().starts_with('[') => {
            format!("readonly {}", accessor_result(Some(&r["readonly ".len()..].trim_start().to_string()), shape))
        }
        Shape::Items(items) if items.contains(&Part::Ref) && r.starts_with('[') && r.ends_with(']') => {
            let xs = crate::parse::split_top(&r[1..r.len() - 1], ",");
            format!("[{}]", xs.iter().enumerate().map(|(i, x)| if items.get(i) == Some(&Part::Ref) { accessor(x.trim()) } else { x.trim().to_string() }).collect::<Vec<_>>().join(", "))
        }
        Shape::Fields(fields) if fields.iter().any(|f| f.1 == Part::Ref) && r.starts_with('{') && r.ends_with('}') => {
            let xs = crate::parse::split_top(&r[1..r.len() - 1], ",;");
            format!(
                "{{ {} }}",
                xs.iter()
                    .map(|x| match x.find(':') {
                        Some(i) => {
                            let k = x[..i].trim();
                            let name = k.strip_prefix("readonly ").map(str::trim).unwrap_or(k).trim_end_matches('?');
                            let ref_part = fields.iter().any(|f| f.0 == name && f.1 == Part::Ref);
                            format!("{}: {};", k, if ref_part { accessor(x[i + 1..].trim()) } else { x[i + 1..].trim().to_string() })
                        }
                        None => format!("{};", x.trim()),
                    })
                    .collect::<Vec<_>>()
                    .join(" ")
            )
        }
        _ => r.clone(),
    }
}
/// A declared component's props as TypeScript reads them: the record of its fields, or (MO-8o) the type the library
/// declares and, after `&`, the record of the fields that carry words.
/// `held`: for the boundary check (TY-6), where the row's type parameters are found from the library's type alone
/// (`NoInfer`): a field written again must not decide what `Option` is.
fn props_text(props: &[crate::parse::JsProp], props_type: &Option<String>, held: bool) -> String {
    let fs: Vec<String> = props.iter().map(|p| format!("{}{}: {};", p.name, if p.optional { "?" } else { "" }, p.ty.as_deref().unwrap_or("any"))).collect();
    let rec = format!("{{ {} }}", fs.join(" "));
    match props_type {
        None => rec,
        Some(t) if props.is_empty() => t.clone(),
        Some(t) if held => format!("{} & NoInfer<{}>", t, rec),
        Some(t) => format!("{} & {}", t, rec),
    }
}
/// TY-6: the boundary check for a `.d.rx` — its rows as TypeScript types, and the real module's exports assigned to them.
/// A `ref` parameter or result part is an accessor (`() => T`); a component is a function of its declared props; an error
/// class a constructor of an `Error`. Rows TypeScript cannot see (`pure`, `uses`, `pending`, `fails`) are not checked here.
/// Returns the code and, per check, (its line in the code, the declaration's line, the export's name).
pub fn boundary_file(decls: &[JsDecl], module: &str) -> (String, Vec<(usize, usize, String)>) {
    let (code, checks, _) = boundary_checks(decls, module);
    (code, checks)
}
/// MO-8o, TY-6f: a field of the record after a props' type, held against the library's type for that prop. `at`: the
/// check's line in the code; `line`, `name`: the row; `has`: the line asks that the prop exists (else that the field's
/// type fits it); `says`: the finding, to which TypeScript's reason is added for a type.
pub struct OverlayCheck {
    pub at: usize,
    pub line: usize,
    pub name: String,
    pub prop: String,
    pub has: bool,
    pub says: String,
}
/// A row's type parameters, read: for each, its modifiers, its name, its bound and its default.
fn tparams_read(tparams: Option<&str>) -> Vec<(String, String, Option<String>, Option<String>)> {
    let Some(t) = tparams.map(str::trim).filter(|t| t.starts_with('<') && t.ends_with('>')) else { return vec![] };
    let is_word = |c: char| c.is_alphanumeric() || c == '_' || c == '$';
    let mut out = vec![];
    for part in crate::parse::split_top(&t[1..t.len() - 1], ",") {
        let mut rest = part.as_str();
        while let Some(r) = ["const ", "in ", "out "].iter().find_map(|m| rest.strip_prefix(m)) {
            rest = r.trim_start();
        }
        let mods = part[..part.len() - rest.len()].to_string();
        let n = rest.find(|c: char| !is_word(c)).unwrap_or(rest.len());
        let (name, rest) = (rest[..n].to_string(), rest[n..].trim());
        if name.is_empty() {
            continue;
        }
        // the default: after the first `=` outside brackets that is not an arrow's
        let cs: Vec<char> = rest.chars().collect();
        let mut depth = 0i64;
        let mut eq = None;
        for i in 0..cs.len() {
            let ch = cs[i];
            if "([{<".contains(ch) {
                depth += 1;
            } else if ")]}>".contains(ch) && !(ch == '>' && i > 0 && cs[i - 1] == '=') {
                depth -= 1;
            } else if ch == '=' && depth == 0 && cs.get(i + 1) != Some(&'>') {
                eq = Some(i);
                break;
            }
        }
        let (bound, default) = match eq {
            Some(i) => (cs[..i].iter().collect::<String>(), Some(cs[i + 1..].iter().collect::<String>().trim().to_string())),
            None => (rest.to_string(), None),
        };
        let bound = bound.trim().strip_prefix("extends").map(|b| b.trim().to_string()).filter(|b| !b.is_empty());
        out.push((mods, name, bound, default.filter(|d| !d.is_empty())));
    }
    out
}
/// TypeScript 7.1 (microsoft/TypeScript#64673) relates two instances of a conditional type that distributes over a type
/// parameter, and does not relate an instance of one to the type as it is written: `<T>(v: T) => T extends any[] ? T[number]
/// : T` is not assignable to itself. A row that writes such a conditional is therefore held as an instance: its type is an
/// alias of a parameter of its own (`unknown`), which each of the row's type parameters is bound by besides. What the row
/// says is the same: a parameter bound by `unknown` is bound by nothing, and a default says nothing to an assignment.
fn as_instance(tparams: Option<&str>) -> Option<String> {
    let ps = tparams_read(tparams);
    if ps.is_empty() {
        return None;
    }
    let each = |(mods, name, bound, _): (String, String, Option<String>, Option<String>)| format!("{mods}{name} extends {}", bound.map_or("__Any".into(), |b| format!("({b}) & __Any")));
    Some(format!("<{}>", ps.into_iter().map(each).collect::<Vec<_>>().join(", ")))
}
/// A row's type parameters as types of the block an overlay check is written in, so that the library's props are a type
/// TypeScript can read a prop of (a conditional over a type parameter is not): a parameter is its default, else its
/// bound, else a type of its own that nothing else is; one whose bound comes back to itself is `any`.
fn tparams_held(tparams: Option<&str>) -> String {
    let is_word = |c: char| c.is_alphanumeric() || c == '_' || c == '$';
    let mentions = |text: &str, name: &str| text.match_indices(name).any(|(i, _)| !text[..i].chars().next_back().is_some_and(|c| is_word(c) || c == '.') && !text[i + name.len()..].chars().next().is_some_and(is_word));
    // (name, the type it is held at, or None: a type of its own)
    let mut ps: Vec<(String, Option<String>)> = tparams_read(tparams).into_iter().map(|(_, name, bound, default)| (name, default.or(bound))).collect();
    if ps.is_empty() {
        return String::new();
    }
    // a parameter held at a type that comes back to it would be a circular alias
    let names: Vec<String> = ps.iter().map(|p| p.0.clone()).collect();
    let reaches = |from: usize, ps: &[(String, Option<String>)]| -> bool {
        let mut seen = vec![false; ps.len()];
        let mut todo = vec![from];
        while let Some(i) = todo.pop() {
            let Some(text) = &ps[i].1 else { continue };
            for (j, n) in names.iter().enumerate() {
                if mentions(text, n) {
                    if j == from {
                        return true;
                    }
                    if !seen[j] {
                        seen[j] = true;
                        todo.push(j);
                    }
                }
            }
        }
        false
    };
    for i in 0..ps.len() {
        if reaches(i, &ps) {
            ps[i].1 = Some("any".into());
        }
    }
    ps.iter()
        .map(|(n, held)| match held {
            Some(t) => format!("type {} = {}; ", n, t),
            None => format!("interface {} {{ readonly __rx_type_parameter: {}; }} ", n, js_str(n)),
        })
        .collect()
}
/// TY-6 with, per check of a record's field against the library's props (MO-8o), what it asks.
pub fn boundary_checks(decls: &[JsDecl], module: &str) -> (String, Vec<(usize, usize, String)>, Vec<OverlayCheck>) {
    let mut overlay: Vec<OverlayCheck> = vec![];
    let own: IndexSet<&str> = decls.iter().filter(|d| matches!(d, JsDecl::Type { .. })).map(|d| d.name()).collect();
    let mut out: Vec<String> = vec![format!("import * as __real from {};", serde_json::to_string(module).unwrap_or_default())];
    if !own.contains("View") {
        out.push("type View = import(\"@solidjs/web\").JSX.Element;".into());
    }
    if !own.contains("Component") {
        out.push("type Component<P = any> = (props: P) => View;".into());
    }
    for d in decls {
        if let JsDecl::Type { text, .. } = d {
            out.push(text.clone());
        }
    }
    let accessor = |t: &str| format!("(() => {})", t);
    let result = accessor_result;
    let mut checks = vec![];
    for d in decls {
        let (name, line, ty) = match d {
            JsDecl::Fn { name, line, params, ptypes, refs, ret, shape, tparams, opts, .. } => {
                let ps: Vec<String> = params
                    .iter()
                    .enumerate()
                    .map(|(i, n)| {
                        let t = ptypes.get(i).and_then(|t| t.clone()).unwrap_or_else(|| "any".into());
                        let t = if refs.get(i).copied().unwrap_or(false) { accessor(&t) } else { t };
                        format!("{}{}: {}", n, if opts.get(i).copied().unwrap_or(false) { "?" } else { "" }, t)
                    })
                    .collect();
                (name, *line, format!("{}({}) => {}", tparams.as_deref().unwrap_or(""), ps.join(", "), result(ret.as_ref(), shape)))
            }
            JsDecl::Comp { name, line, props, tparams, props_type, .. } => (name, *line, format!("{}(props: {}) => any", tparams.as_deref().unwrap_or(""), props_text(props, props_type, true))),
            JsDecl::Error { name, line, .. } => (name, *line, "abstract new (...args: any[]) => Error".into()),
            JsDecl::Value { name, line, ty } => (name, *line, ty.clone().unwrap_or_else(|| "any".into())),
            JsDecl::Type { .. } | JsDecl::Context { .. } | JsDecl::Import { .. } | JsDecl::Host { .. } => continue,
        };
        let key = name.replace('.', "$$"); // MO-11q: a member (`Dialog.Trigger`), read as a property of its object
        let tparams = match d {
            JsDecl::Fn { tparams, .. } | JsDecl::Comp { tparams, .. } => tparams.as_deref(),
            _ => None,
        };
        let conditional = |rest: &str| rest.contains(" extends ") && rest.contains('?');
        match (tparams, as_instance(tparams)) {
            (Some(tp), Some(held)) if ty.strip_prefix(tp).is_some_and(conditional) => out.push(format!("type __decl_{}<__Any = unknown> = {}{};", key, held, &ty[tp.len()..])),
            _ => out.push(format!("type __decl_{} = {};", key, ty)),
        }
        out.push(format!("const __check_{}: __decl_{} = __real.{};", key, key, name));
        checks.push((out.len(), line, name.clone()));
        // MO-8o, TY-6f: `P & NoInfer<{ … }>` holds the component to the type and says nothing of the record, which an
        // intersection can only narrow. Each field of the record is held on its own: the library's props have a prop of
        // that name (in one member of a union at least; an index signature has every name), and what the field says
        // the prop is is something the library's type for it takes (the record narrows a prop, it does not retype it).
        if let JsDecl::Comp { props, tparams, props_type: Some(pt), .. } = d {
            let held = tparams_held(tparams.as_deref());
            for p in props {
                let k = js_str(&p.name);
                out.push(format!("{{ {}const __has: __rx_has<{}, {}> = true; }}", held, pt, k));
                overlay.push(OverlayCheck { at: out.len(), line, name: name.clone(), prop: p.name.clone(), has: true, says: format!("`{}` is written in the record after the props' type, and {} has no prop of that name: a field of the record is a prop of the library's, written again for its words (MO-8o)", p.name, pt) });
                if let Some(t) = &p.ty {
                    out.push(format!("{{ {}const __is: __rx_prop<{}, {}> | undefined = undefined as unknown as ({}); }}", held, pt, k, t));
                    overlay.push(OverlayCheck { at: out.len(), line, name: name.clone(), prop: p.name.clone(), has: false, says: format!("`{}` is written `{}` in the record after the props' type, and the library's type for that prop does not take it: the record may narrow a prop of {}, not give it another type (MO-8o)", p.name, t, pt) });
                }
            }
        }
    }
    if !overlay.is_empty() {
        // a prop of the props' type, over each member of a union; whether any member has it
        out.push("type __rx_prop<P, K extends PropertyKey> = P extends unknown ? K extends keyof P ? P[K] : never : never;".into());
        out.push("type __rx_has<P, K extends PropertyKey> = [P extends unknown ? K extends keyof P ? true : never : never] extends [never] ? false : true;".into());
    }
    (out.join("\n") + "\n", checks, overlay)
}

/// MO-8k: a package's declaration that is not beside the package's file (the project's `rx-types/`, a shared `@rx-types`
/// package, a generated `.rx-types/` draft) is projected where TypeScript looks for a package's types when it ships none:
/// `node_modules/@types/<scope>__<name>/<subpath or index>.d.ts`.
pub fn types_path_of(dts: &str) -> Option<String> {
    let stem = dts.strip_suffix(".d.rx")?;
    let (root, spec) = if let Some(i) = stem.find("node_modules/.rx-types/") {
        (&stem[..i], &stem[i + "node_modules/.rx-types/".len()..])
    } else if let Some(i) = stem.find("node_modules/@rx-types/") {
        let rest = &stem[i + "node_modules/@rx-types/".len()..];
        let (m, sub) = rest.split_once('/')?;
        return Some(format!("{}node_modules/@types/{m}/{sub}.d.ts", &stem[..i]));
    } else if stem.starts_with("rx-types/") {
        ("", &stem["rx-types/".len()..])
    } else if let Some(i) = stem.find("/rx-types/") {
        (&stem[..i + 1], &stem[i + "/rx-types/".len()..])
    } else {
        return None;
    };
    let seg: Vec<&str> = spec.split('/').collect();
    let n = if spec.starts_with('@') { 2 } else { 1 };
    if seg.len() < n {
        return None;
    }
    let m = seg[..n].join("/").trim_start_matches('@').replacen('/', "__", 1);
    let sub = if seg.len() > n { seg[n..].join("/") } else { "index".to_string() };
    Some(format!("{root}node_modules/@types/{m}/{sub}.d.ts"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::modules::load_modules;
    use std::collections::HashMap;

    #[test]
    fn an_entry_default_is_the_apps_main_and_its_component_keeps_its_mappings() {
        let files: HashMap<&str, &str> = [
            ("app/main.rx", "import { Badge } from \"./badge.rx\"\nexport default component App() {\n  source n := 0\n  <Badge n={n} />\n}\n"),
            ("app/badge.rx", "export component Badge(props: { n: number }) {\n  <b>{props.n}</b>\n}\n"),
        ]
        .into_iter()
        .collect();
        let set = load_modules("app/main.rx", &|p| files.get(p).map(|s| s.to_string())).expect("loads");
        let out = project_modules(&set);
        let main = out.iter().find(|p| p.rx == "app/main.rx").unwrap();
        assert!(main.code.ends_with("\ndeclare const __main: __.Main; export default __main;"), "{}", main.code);
        assert_eq!(main.code.matches("export default").count(), 1);
        assert_eq!(main.lines.len(), main.code.lines().count());
        let at = main.code.find("export function App(").unwrap() + "export function ".len();
        let src = files["app/main.rx"].find("App").unwrap();
        assert!(main.mappings.iter().any(|m| m.gen as usize == at && m.src as usize == src && m.len == 3));
        let dep = out.iter().find(|p| p.rx == "app/badge.rx").unwrap();
        assert!(!dep.code.contains("export default"), "{}", dep.code);
        assert!(PRELUDE.contains("export type Main = (app: object) => () => View;"));
    }
}
