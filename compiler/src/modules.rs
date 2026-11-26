//! 09-modules: a program is a set of `.rx` modules (`ref/src/modules.ts`). The loader resolves each `.rx` import to a path,
//! parses every module once, and orders them dependencies first (MO-1). A cycle is refused (MO-5).

use crate::parse::JsTrim;
use crate::ast::{decls_json, markups_json, Decl, Expr, ExprKind, ImportName, Lit, Markup, MarkupKind, Program};
use crate::check::Diagnostic;
use crate::parse::{field_name, is_view_type, parse_declarations, parse_program, split_top, JsDecl, ParseError};
use crate::signature::{parse_signature, ModSig};
use indexmap::IndexMap;
use std::collections::{HashMap, HashSet};

pub struct ModuleSet {
    pub entry: String,
    pub programs: HashMap<String, Program>,
    pub order: Vec<String>,
    pub diags: Vec<Diagnostic>,
    /// MO-8, by `.d.rx` path
    pub declarations: IndexMap<String, Vec<JsDecl>>,
    /// MO-8, TY-6: each declaration the program consumed, with the module that imported it and the import's own text:
    /// what a version pin, strict mode and the boundary check apply to, resolved as the importer resolves it
    pub declaration_uses: Vec<DeclarationUse>,
    /// SV-5a: each declaration's identity, the same in every checkout and on every machine (`package_relative`): after
    /// the nearest named package's name (`shop/src/err.d.rx`), else its path below the project root (`err.d.rx`)
    pub declaration_ids: HashMap<String, String>,
    /// MO-9, by `.rx` path
    pub signatures: IndexMap<String, ModSig>,
    /// each program's text, which its spans index
    pub sources: HashMap<String, String>,
    /// an editor's load (CP-8e): what the parse recovered from, each with its file
    pub parse_errors: Vec<ParseError>,
    /// MO-14: the JS host's view above this program — its declaration, and the program that stands for it
    pub host: Option<Box<HostView>>,
    /// MO-14f: in the host's own set — the JS components the host renders through, `declaration#Name`
    pub through: HashSet<String>,
    /// MO-14h: in the program's set and the host's — the JS components the declaration says the host renders through,
    /// for a fn's `renders(H)`
    pub under: HashSet<String>,
    /// MO-14: the modules the host's declaration imports
    pub hosted: HashSet<String>,
    /// MO-14: the components it places, `path#Name`
    pub placed: HashSet<String>,
    /// CP-4c: loaded for the scenario runners (`load_conformance`): the check and the build read the one mark
    pub conformance: bool,
}

/// MO-14: a host declaration found above a program — `file`, the `host.d.rx`; `entry`, the module that stands for the
/// host's view in the checker (never written: the declaration lowered onto a factory's words); `set`, that program.
pub struct HostView {
    pub file: String,
    pub entry: String,
    pub set: ModuleSet,
}

/// MO-14: the name a host declaration has, looked for in the entry's folder and each one above it (the nearest wins).
pub const HOST_DECLARATION: &str = "host.d.rx";

/// MO-14c: a host declaration as the program the checker walks — the declaration's own imports, its tree given to a
/// factory with the row's words (MO-11f, MO-11i, MO-12c), and that factory's component applied as the app's view. Text
/// for text, each piece on the line the declaration has it, so a diagnostic's line is the declaration's. `.0` is the
/// module (`<file>.host.rx`), `.1` the declaration of the factory it calls (`<file>.host.d.rx`). `None` when the file
/// states no view.
pub fn host_program(src: &str, ds: &[JsDecl], name: &str) -> Option<(String, String)> {
    let (provides, nests, span) = ds.iter().find_map(|d| if let JsDecl::Host { provides, nests, span, .. } = d { Some((provides, nests, *span)) } else { None })?;
    // every line kept, blank; then each piece put back where the declaration has it
    let mut pieces: Vec<(usize, usize, String)> = ds.iter().filter_map(|d| if let JsDecl::Import { span, .. } = d { Some((span.0, span.1, src[span.0..span.1].to_string())) } else { None }).collect();
    let (row, tree, end) = span;
    // (the row's own line breaks kept after it, so the tree stays on its lines)
    pieces.push((row, tree, format!("import {{ jsHostFactory }} from \"./{name}.host.js\"; export default component JsHost() {{ <JsHostView /> }}; JsHostView = jsHostFactory({}", "\n".repeat(src[row..tree].matches('\n').count()))));
    pieces.push((tree, end, format!("{})", &src[tree..end])));
    pieces.sort_by_key(|p| p.0);
    let blank = |t: &str| t.chars().map(|ch| if ch == '\n' { '\n' } else { ' ' }).collect::<String>();
    let mut rx = String::new();
    let mut at = 0;
    for (from, to, text) in pieces {
        rx.push_str(&blank(&src[at..from]));
        rx.push_str(&text);
        at = to;
    }
    rx.push_str(&blank(&src[at..]));
    let mut decl: Vec<String> = ds.iter().filter_map(|d| if let JsDecl::Context { name, from, .. } = d { Some(format!("export context {name}{}", from.as_ref().map(|f| format!(" from {}", serde_json::to_string(f).unwrap_or_default())).unwrap_or_default())) } else { None }).collect();
    let words = format!("{}{}", if provides.is_empty() { String::new() } else { format!(" provides({})", provides.join(", ")) }, nests.as_ref().map(|(k, i)| format!(" nests({k} in {i})")).unwrap_or_default());
    decl.push(format!("export pure fn jsHostFactory(tree: unknown): Component{words}"));
    Some((rx, decl.join("\n") + "\n"))
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DeclarationUse {
    /// the `.d.rx`
    pub declaration: String,
    /// the `.rx` module whose import it declares
    pub importer: String,
    /// the import's text, `./sub/lib.js` or `@scope/pkg/sub`
    pub spec: String,
}

/// MO-13a: whether a `.d.rx` is the printed signature of a compiled `.rx` module — a line `//@ signature …` before its
/// first row. Such a file is read as MO-9b reads it wherever it is found (beside a JS module, MO-8a; a package's,
/// MO-8k), not as a JS module's declaration.
pub fn is_printed_signature(src: &str) -> bool {
    for raw in src.split('\n') {
        let t = raw.js_trim();
        if t.is_empty() {
            continue;
        }
        if let Some(rest) = t.strip_prefix("//@") {
            if let Some(after) = rest.js_trim_start().strip_prefix("signature") {
                if after.is_empty() || after.starts_with(crate::parse::js_ws) {
                    return true;
                }
            }
        }
        if !t.starts_with("//") {
            return false;
        }
    }
    false
}
/// `to` as an import from the module `from` writes it: a relative path where both are absolute or both are not.
pub fn relative_module(from: &str, to: &str) -> String {
    if from.starts_with('/') != to.starts_with('/') {
        return to.to_string();
    }
    let mut a: Vec<&str> = from.split('/').collect();
    a.pop();
    let a: Vec<&str> = a.into_iter().filter(|x| !x.is_empty() && *x != ".").collect();
    let b: Vec<&str> = to.split('/').filter(|x| !x.is_empty() && *x != ".").collect();
    let mut i = 0;
    while i < a.len() && i + 1 < b.len() && a[i] == b[i] {
        i += 1;
    }
    let up = a.len() - i;
    format!("{}{}", if up > 0 { "../".repeat(up) } else { "./".to_string() }, b[i..].join("/"))
}
pub fn is_rx(from: &str) -> bool {
    from.ends_with(".rx")
}

/// POSIX-style join and normalisation, for module keys (no file system involved).
pub fn join_path(from_file: &str, rel: &str) -> String {
    let segs: Vec<&str> = from_file.split('/').collect();
    let base = &segs[..segs.len() - 1];
    let mut parts: Vec<String> = if rel.starts_with('/') { vec![] } else { base.iter().map(|s| s.to_string()).collect() };
    for seg in rel.split('/') {
        if seg.is_empty() || seg == "." {
            continue;
        }
        if seg == ".." {
            if !parts.is_empty() && parts.last().unwrap() != ".." {
                parts.pop();
            } else {
                parts.push("..".into());
            }
        } else {
            parts.push(seg.into());
        }
    }
    format!("{}{}", if rel.starts_with('/') { "/" } else { "" }, parts.join("/"))
}

#[derive(PartialEq, Clone, Copy)]
enum State {
    Busy,
    Done,
}

struct Loader<'r> {
    read: &'r dyn Fn(&str) -> Option<String>,
    programs: HashMap<String, Program>,
    order: Vec<String>,
    diags: Vec<Diagnostic>,
    declarations: IndexMap<String, Vec<JsDecl>>,
    declaration_uses: Vec<DeclarationUse>,
    declaration_ids: HashMap<String, String>,
    /// SV-5a: each declared error class's wire id (`id#Name`), and the declaration it is
    wire_ids: HashMap<String, String>,
    signatures: IndexMap<String, ModSig>,
    /// MO-13a: the signatures a JS import's marked `.d.rx` gave, by `.rx` path
    printed: std::collections::HashSet<String>,
    sources: HashMap<String, String>,
    state: HashMap<String, State>,
    recover: bool,
    parse_errors: Vec<ParseError>,
}

/// MO-10c: the file a package import resolves to, as a bundler finds it — `node_modules` up from the importer, the
/// package's `exports` (a subpath, then the first of its conditions that a Solid build sets, in the package's order; `*`
/// patterns), else `module` or `main`. Its declaration is beside it: the same name, `.d.rx`.
pub fn package_declaration(from_file: &str, spec: &str, read: &dyn Fn(&str) -> Option<String>) -> Option<String> {
    use serde_json::Value;
    const CONDITIONS: [&str; 4] = ["solid", "browser", "import", "default"];
    let seg: Vec<&str> = spec.split('/').collect();
    let n = if spec.starts_with('@') { 2 } else { 1 };
    if seg.len() < n || seg[..n].iter().any(|x| x.is_empty()) {
        return None;
    }
    let pkg = seg[..n].join("/");
    let sub = if seg.len() > n { format!("./{}", seg[n..].join("/")) } else { ".".to_string() };
    let all: Vec<&str> = from_file.split('/').collect();
    let dirs = &all[..all.len() - 1];
    let min = if from_file.starts_with('/') { 1 } else { 0 };
    fn pick(t: &Value) -> Option<String> {
        match t {
            Value::String(s) => Some(s.clone()),
            Value::Array(xs) => xs.iter().find_map(pick),
            Value::Object(m) => m.iter().filter(|(k, _)| CONDITIONS.contains(&k.as_str())).find_map(|(_, v)| pick(v)),
            _ => None,
        }
    }
    let mut i = dirs.len() as i64;
    while i >= min {
        let mut parts: Vec<&str> = dirs[..i as usize].to_vec();
        parts.push("node_modules");
        parts.push(&pkg);
        let root = parts.join("/");
        i -= 1;
        let Some(pj) = read(&format!("{root}/package.json")) else { continue };
        let Ok(json) = serde_json::from_str::<Value>(&pj) else { return None };
        let target: Option<String> = match json.get("exports") {
            Some(ex) => {
                let map = match ex {
                    Value::Object(m) if m.keys().any(|k| k.starts_with('.')) => Some(m),
                    _ => None,
                };
                match map {
                    None => (sub == ".").then(|| pick(ex)).flatten(),
                    Some(m) => match m.get(&sub) {
                        Some(v) => pick(v),
                        // Node's PATTERN_KEY_COMPARE: the longest part before `*` wins, then the longest key
                        None => {
                            let mut best: Option<(&String, usize)> = None;
                            for k in m.keys() {
                                let Some(star) = k.find('*') else { continue };
                                if k.rfind('*') != Some(star) {
                                    continue;
                                }
                                let (pre, post) = (&k[..star], &k[star + 1..]);
                                if sub.starts_with(pre) && sub.ends_with(post) && sub.len() >= k.len() && best.is_none_or(|(b, bs)| star > bs || (star == bs && k.len() > b.len())) {
                                    best = Some((k, star));
                                }
                            }
                            best.and_then(|(k, star)| {
                                let post = k.len() - star - 1;
                                pick(&m[k]).map(|t| t.replace('*', &sub[star..sub.len() - post]))
                            })
                        }
                    },
                }
            }
            None => {
                if sub == "." {
                    Some(json.get("module").and_then(|v| v.as_str()).or_else(|| json.get("main").and_then(|v| v.as_str())).unwrap_or("./index.js").to_string())
                } else {
                    Some(sub.clone())
                }
            }
        };
        let target = target?;
        let file = join_path(&format!("{root}/package.json"), &target);
        let stem = PKG_EXT.replace(&file, "").to_string();
        return Some(stem + ".d.rx");
    }
    None
}
/// MO-8k, MO-14a: a project's folder, as how many of `dirs` lead to it: the nearest one whose package.json has a name (a
/// `{"type":"module"}` scope is passed over, as in SV-5a); with none, the outermost folder there is.
pub fn project_top(dirs: &[&str], lo: usize, read: &dyn Fn(&str) -> Option<String>) -> usize {
    (lo..=dirs.len())
        .rev()
        .find(|i| {
            let f = dirs[..*i].iter().copied().chain(std::iter::once("package.json")).collect::<Vec<_>>().join("/");
            read(&f).and_then(|t| serde_json::from_str::<serde_json::Value>(&t).ok()).is_some_and(|v| v.get("name").and_then(|n| n.as_str()).is_some_and(|n| !n.is_empty()))
        })
        .unwrap_or(lo)
}
/// MO-8k: where a package import's declaration is found, first match wins: the project's `rx-types/<spec>.d.rx` (in the
/// importer's directory or one above it, no higher than the project's folder: `project_top`), the package's own beside the file it resolves to (MO-10c), a shared
/// `node_modules/@rx-types/<scope>__<name>/<subpath or index>.d.rx`, then a generated `node_modules/.rx-types/<spec>.d.rx`
/// (MO-8l). `None` when none exists.
pub fn declaration_for(from_file: &str, spec: &str, read: &dyn Fn(&str) -> Option<String>) -> Option<String> {
    let seg: Vec<&str> = spec.split('/').collect();
    let n = if spec.starts_with('@') { 2 } else { 1 };
    if seg.len() < n || seg.iter().any(|x| x.is_empty() || *x == "." || *x == "..") {
        return None;
    }
    let all: Vec<&str> = from_file.split('/').collect();
    let dirs = &all[..all.len() - 1];
    let lo = if from_file.starts_with('/') { 1 } else { 0 };
    let up = |rel: &str, top: usize| -> Option<String> {
        (top..=dirs.len()).rev().map(|i| dirs[..i].iter().copied().chain(std::iter::once(rel)).collect::<Vec<_>>().join("/")).find(|f| read(f).is_some())
    };
    let shared = seg[..n].join("/").trim_start_matches('@').replacen('/', "__", 1);
    let sub = if seg.len() > n { seg[n..].join("/") } else { "index".to_string() };
    up(&format!("rx-types/{spec}.d.rx"), project_top(dirs, lo, read))
        .or_else(|| package_declaration(from_file, spec, read).filter(|f| read(f).is_some()))
        .or_else(|| up(&format!("node_modules/@rx-types/{shared}/{sub}.d.rx"), lo))
        .or_else(|| up(&format!("node_modules/.rx-types/{spec}.d.rx"), lo))
}
/// SV-5a (ruled 2026-11-22): what a declared error class is identified by. It is read from the declaration's own place
/// and nothing else — not the entry, not the checkout — so a server and a client name it alike whatever each was built
/// from, wherever. First match wins:
/// 1. the nearest folder above `file` whose package.json has a name: that name, then the path below it
///    (`shop/src/err.d.rx`); a package.json with no name (a `{"type":"module"}` scope) is passed over;
/// 2. the nearest folder above `file` with a package.json: the path below it (`err.d.rx`, `lib/err.d.rx`);
/// 3. with none above: the file's own name.
///
/// A folder's own name, or any folder above the package, is never part of it, so it holds no machine path. An unnamed
/// package has nothing to tell its classes from another unnamed one's: two declarations that would name a class alike
/// in one program are refused where they are loaded (`Loader::visit`), not told apart by where the build started.
pub fn package_relative(file: &str, read: &dyn Fn(&str) -> Option<String>) -> String {
    let pj = |dir: &str| if dir.is_empty() { "package.json".to_string() } else { format!("{dir}/package.json") };
    // the folders above the file, nearest first, with whether each has a package.json and its name
    let segs: Vec<&str> = file.split('/').collect();
    let lo = if file.starts_with('/') { 1 } else { 0 };
    let mut mine: Vec<(String, Option<Option<String>>)> = vec![];
    let mut i = segs.len() as i64 - 1;
    while i >= lo {
        let dir = segs[..i as usize].join("/");
        let found = read(&pj(&dir)).map(|text| serde_json::from_str::<serde_json::Value>(&text).ok().and_then(|v| v.get("name").and_then(|n| n.as_str()).map(str::to_string)).filter(|n| !n.is_empty()));
        mine.push((dir, found));
        i -= 1;
    }
    let below = |dir: &str| -> Option<String> {
        if dir.is_empty() {
            return (!file.starts_with('/')).then(|| file.to_string());
        }
        file.strip_prefix(dir).and_then(|r| r.strip_prefix('/')).map(str::to_string)
    };
    if let Some((dir, Some(Some(name)))) = mine.iter().find(|(_, f)| matches!(f, Some(Some(_)))) {
        if let Some(r) = below(dir) {
            return format!("{name}/{r}");
        }
    }
    if let Some(r) = mine.iter().find(|(_, f)| f.is_some()).and_then(|(d, _)| below(d)) {
        return r;
    }
    file.rsplit('/').next().unwrap_or(file).to_string()
}
static PKG_EXT: std::sync::LazyLock<regex::Regex> = std::sync::LazyLock::new(|| regex::Regex::new(r"\.(m?js|cjs|jsx|ts|tsx)$").unwrap());

/// MO-8 (revised 2026-11-22): the `.d.rx` that declares a relative JS import, first that exists wins: `./x.js` and
/// `./x.ts` by `x.d.rx`; every other JS or TypeScript module — `./x.mjs`, `./x.cjs`, `./x.jsx`, `./x.tsx`, `./x.mts`,
/// `./x.cts` — by the file's whole name, `x.tsx.d.rx`, then by `x.d.rx`; anything else by its name and `.d.rx`. The
/// tooling (rx-tsc's declarations, the boundary check, verify: `beside.js`) reads the same names in the same order.
/// When none exists, the last.
pub fn beside_declaration(importer: &str, from: &str, read: &dyn Fn(&str) -> Option<String>) -> String {
    let names = declaration_names(from);
    let paths: Vec<String> = names.iter().map(|n| join_path(importer, n)).collect();
    paths.iter().find(|p| read(p).is_some()).cloned().unwrap_or_else(|| paths.last().unwrap().clone())
}
pub fn declaration_names(from: &str) -> Vec<String> {
    for ext in [".mjs", ".cjs", ".jsx", ".tsx", ".mts", ".cts"] {
        if let Some(s) = from.strip_suffix(ext) {
            return vec![format!("{from}.d.rx"), format!("{s}.d.rx")];
        }
    }
    for ext in [".js", ".ts"] {
        if let Some(s) = from.strip_suffix(ext) {
            return vec![format!("{s}.d.rx")];
        }
    }
    vec![format!("{from}.d.rx")]
}

impl Loader<'_> {
    /// Whether an import's name is one whose call instantiates: an `.rx` fn (its source, or its signature), a declared primitive.
    fn instantiating_export(&self, d: &Decl, name: &str) -> bool {
        let Decl::Import { resolved, declared, .. } = d else { return false };
        if let Some(to) = resolved {
            if let Some(p) = self.programs.get(to) {
                return p.decls.iter().any(|x| matches!(x, Decl::Fn { name: n, params, decls, tail, named, .. } if n == name && crate::ast::instantiates(params, decls, tail, *named)));
            }
            return matches!(self.signatures.get(to).and_then(|s| s.exports.get(name)), Some(crate::signature::ExportSig::Fn { instantiating: true, .. }));
        }
        declared.as_ref().and_then(|d| self.declarations.get(d)).is_some_and(|ds| ds.iter().any(|x| matches!(x, JsDecl::Fn { name: n, instantiates, shape, refs, .. } if n == name && (*instantiates || *shape == crate::parse::Shape::Comp || refs.contains(&true)))))
    }
    fn visit(&mut self, path: &str, stack: &[String]) -> Result<(), ParseError> {
        if self.state.get(path) == Some(&State::Done) {
            return Ok(());
        }
        let Some(src) = (self.read)(path) else { return Ok(()) };
        let mut p = if self.recover {
            let (p, errs) = crate::parse::parse_program_recovering(&src);
            self.parse_errors.extend(errs.into_iter().map(|e| ParseError(e.0, e.1, Some(path.to_string()), e.3)));
            p
        } else {
            parse_program(&src).map_err(|e| ParseError(format!("{}: {}", path, e.0), e.1, Some(path.to_string()), e.3))?
        };
        self.state.insert(path.to_string(), State::Busy);
        for d in p.decls.iter_mut() {
            let Decl::Import { from, line, resolved, prelude, declared, declared_errors, declared_error_fields, declared_pure, declared_side, .. } = d else { continue };
            if *prelude {
                // a module of the program's own, by that name
                *prelude = !crate::names::PRELUDE_FILES.iter().any(|x| (self.read)(&join_path(path, &format!("{from}{x}"))).is_some());
            }
            // MO-10c: a package's declaration, beside the file it resolves to
            let pkg_dts = if !is_rx(from) && !from.starts_with('.') && !from.starts_with('/') { declaration_for(path, from, &*self.read) } else { None };
            if !is_rx(from) && (from.starts_with('.') || pkg_dts.is_some()) {
                // MO-8: a JS module with a declaration file beside it
                let dts = pkg_dts.unwrap_or_else(|| beside_declaration(path, from, &*self.read));
                // MO-13a: a declaration that says it is a compiled .rx module's printed signature is that module's signature (MO-9b)
                let rx = dts.strip_suffix(".d.rx").map(|s| format!("{s}.rx")).unwrap_or_else(|| dts.clone());
                if !self.printed.contains(&rx) && !self.declarations.contains_key(&dts) {
                    if let Some(src) = (self.read)(&dts) {
                        if is_printed_signature(&src) {
                            let s = parse_signature(&src, &rx).map_err(|e| ParseError(e.0, None, Some(dts.clone()), "PARSE"))?;
                            self.signatures.insert(rx.clone(), s);
                            self.printed.insert(rx.clone());
                        }
                    }
                }
                if self.printed.contains(&rx) {
                    *prelude = false;
                    *resolved = Some(rx);
                    continue;
                }
                if !self.declarations.contains_key(&dts) {
                    if let Some(src) = (self.read)(&dts) {
                        let mut ds = parse_declarations(&src).map_err(|e| ParseError(format!("{}: {}", dts, e.0), e.1, Some(dts.clone()), e.3))?;
                        context_sources(&dts, &mut ds, &*self.read);
                        // SV-5a: the declaration's identity; two that would name an error class alike are not told apart
                        let id = package_relative(&dts, &*self.read);
                        if from.starts_with('.') {
                            for x in &ds {
                                let JsDecl::Error { name, .. } = x else { continue };
                                let key = format!("{id}#{name}");
                                if let Some(other) = self.wire_ids.get(&key) {
                                    return Err(ParseError(format!("{dts}: the error class {name} would be sent to the client as \"{key}\", and so would the one {other} declares: neither is in a package with a name, so nothing tells them apart — give the package.json above one of them a \"name\" (SV-5a)"), None, Some(dts.clone()), "DUPLICATE_WIRE_ID"));
                                }
                                self.wire_ids.insert(key, dts.clone());
                            }
                        }
                        self.declarations.insert(dts.clone(), ds);
                        self.declaration_ids.insert(dts.clone(), id);
                    }
                }
                if let Some(ds) = self.declarations.get(&dts) {
                    let u = DeclarationUse { declaration: dts.clone(), importer: path.to_string(), spec: from.clone() };
                    if !self.declaration_uses.contains(&u) {
                        self.declaration_uses.push(u);
                    }
                    *prelude = false;
                    *declared = Some(dts.clone());
                    *declared_errors = Some(ds.iter().filter_map(|x| if let JsDecl::Error { name, .. } = x { Some(name.clone()) } else { None }).collect());
                    let ef: Vec<(String, Vec<String>)> = ds.iter().filter_map(|x| if let JsDecl::Error { name, fields, .. } = x { (!fields.is_empty()).then(|| (name.clone(), fields.clone())) } else { None }).collect();
                    if !ef.is_empty() {
                        *declared_error_fields = Some(ef);
                    }
                    *declared_pure = Some(ds.iter().filter_map(|x| if let JsDecl::Fn { name, pure: true, .. } = x { Some(name.clone()) } else { None }).collect());
                    *declared_side = Some(ds.iter().filter_map(|x| if let JsDecl::Fn { name, side: Some(s), .. } = x { Some((name.clone(), *s)) } else { None }).collect());
                }
                continue;
            }
            if !is_rx(from) {
                continue;
            }
            let to = join_path(path, from);
            *resolved = Some(to.clone());
            if self.state.get(&to) == Some(&State::Busy) {
                let mut chain: Vec<String> = stack.to_vec();
                chain.push(path.to_string());
                let at = stack.iter().position(|s| *s == to).unwrap_or(0);
                let mut cyc: Vec<String> = chain[at..].to_vec();
                cyc.push(to.clone());
                self.diags.push(Diagnostic {
                    code: "MODULE_CYCLE".into(),
                    rule: "MO-5".into(),
                    line: *line as i64,
                    file: Some(path.to_string()),
                    msg: format!("{}: modules may not import each other in a cycle (signatures are computed dependencies first)", cyc.join(" → ")),
                });
                continue;
            }
            if self.state.get(&to) != Some(&State::Done) && !self.signatures.contains_key(&to) && (self.read)(&to).is_none() {
                // MO-9: no body — its signature, read in place
                let dts = to.strip_suffix(".rx").map(|s| format!("{}.d.rx", s)).unwrap_or_else(|| to.clone());
                if let Some(sig) = (self.read)(&dts) {
                    let s = parse_signature(&sig, &to).map_err(|e| ParseError(e.0, None, Some(dts.clone()), "PARSE"))?;
                    self.signatures.insert(to.clone(), s);
                    continue;
                }
            }
            if self.signatures.contains_key(&to) {
                continue;
            }
            if self.state.get(&to) != Some(&State::Done) && (self.read)(&to).is_none() {
                self.diags.push(Diagnostic { code: "MODULE_NOT_FOUND".into(), rule: "MO-6".into(), line: *line as i64, file: Some(path.to_string()), msg: format!("no module {} (from {})", from, path) });
                continue;
            }
            let mut st = stack.to_vec();
            st.push(path.to_string());
            self.visit(&to, &st)?;
        }
        reexported(&mut p, path, &self.programs);
        name_methods(&mut p, &self.declarations);
        name_locals(&mut p, &|d, name| self.instantiating_export(d, name));
        self.programs.insert(path.to_string(), p);
        self.sources.insert(path.to_string(), src);
        self.state.insert(path.to_string(), State::Done);
        self.order.push(path.to_string());
        Ok(())
    }
}

/// E-9b: the fns of a module that only name values are marked, where none of those values is a call that instantiates (each
/// is marked, and a mark is taken off until none has to be: one such fn may name a call of another). By name, whatever block
/// a fn is in: a name that is some fn's that instantiates is read as that fn. `imported`: an import's name is one.
/// A module's path from another's, as an import writes it (`./kit/root.rx`, `../a.rx`); None where it does not read back.
fn relative_spec(from_file: &str, to: &str) -> Option<String> {
    let from: Vec<&str> = from_file.split('/').collect();
    let from = &from[..from.len() - 1];
    let parts: Vec<&str> = to.split('/').collect();
    let mut i = 0;
    while i < from.len() && i + 1 < parts.len() && from[i] == parts[i] {
        i += 1;
    }
    let spec = format!("{}{}", if from.len() > i { "../".repeat(from.len() - i) } else { "./".to_string() }, parts[i..].join("/"));
    (join_path(from_file, &spec) == to).then_some(spec)
}
/// MO-6e (2026-11-26): a name a module re-exports (`export { Item } from "./item.rx"`) is the declaring module's: an import
/// of it is an import from that module, as a namespace import is the named imports of its members (MO-6d). So a context
/// keeps its identity, and the checkers and every runner see only the module that declares. Run when the modules a
/// program imports are loaded, each with its own re-exports already resolved. `ref/src/modules.ts` `reexported`.
fn reexported(p: &mut Program, path: &str, programs: &HashMap<String, Program>) {
    let mut out = vec![];
    for d in std::mem::take(&mut p.decls) {
        let Decl::Import { names, resolved: Some(r), .. } = &d else {
            out.push(d);
            continue;
        };
        let Some(from) = programs.get(r) else {
            out.push(d);
            continue;
        };
        let mut by: HashMap<String, (String, String, String)> = HashMap::new(); // alias -> (the declaring module, its spec, the name there)
        for x in &from.decls {
            if let Decl::Import { reexport: true, resolved: Some(xr), from: xf, names: xn, .. } = x {
                for n in xn {
                    by.insert(n.alias.clone(), (xr.clone(), xf.clone(), n.name.clone()));
                }
            }
        }
        if !names.iter().any(|n| by.contains_key(&n.name)) {
            out.push(d);
            continue;
        }
        let kept: Vec<ImportName> = names.iter().filter(|n| !by.contains_key(&n.name)).cloned().collect();
        let mut moved: IndexMap<String, Vec<ImportName>> = IndexMap::new();
        for n in names {
            if let Some((to, _, name)) = by.get(&n.name) {
                moved.entry(to.clone()).or_default().push(ImportName { name: name.clone(), alias: n.alias.clone() });
            }
        }
        let Decl::Import { from: dfrom, .. } = &d else { unreachable!() };
        let dfrom = dfrom.clone();
        if !kept.is_empty() {
            let mut k = d.clone();
            if let Decl::Import { names, .. } = &mut k {
                *names = kept;
            }
            out.push(k);
        }
        for (to, ns) in moved {
            let mut m = d.clone();
            if let Decl::Import { names, from, resolved, .. } = &mut m {
                *names = ns;
                *from = relative_spec(path, &to).unwrap_or_else(|| dfrom.clone());
                *resolved = Some(to);
            }
            out.push(m);
        }
    }
    p.decls = out;
}
pub fn name_locals(p: &mut Program, imported: &dyn Fn(&Decl, &str) -> bool) {
    let mut can = false;
    crate::ast::fns_mut(p, &mut |d| {
        let n = crate::ast::names_only(d);
        can |= n;
        if let Decl::Fn { named, .. } = d {
            *named = n;
        }
    });
    if !can {
        return;
    }
    let made: Vec<String> = p.decls.iter().flat_map(|d| if let Decl::Import { names, .. } = d { names.iter().filter(|n| imported(d, &n.name)).map(|n| n.alias.clone()).collect() } else { vec![] }).collect();
    loop {
        let mut inst: HashSet<String> = made.iter().cloned().collect();
        crate::ast::fns_mut(p, &mut |d| {
            if let Decl::Fn { name, params, decls, tail, named, .. } = d {
                if crate::ast::instantiates(params, decls, tail, *named) {
                    inst.insert(name.clone());
                }
            }
        });
        let mut again = false;
        crate::ast::fns_mut(p, &mut |d| {
            if let Decl::Fn { decls, named, .. } = d {
                if *named && decls.iter().any(|d| matches!(d, Decl::Eq { e: Expr { k: ExprKind::Call { f, .. }, .. }, .. } if matches!(&f.k, ExprKind::Id(n) if inst.contains(n)))) {
                    *named = false;
                    again = true;
                }
            }
        });
        if !again {
            return;
        }
    }
}

/// MO-8t (2026-11-25): a method a declaration gives a row of its own — `export fn toaster.show(…)` beside `export const
/// toaster` — is named by that row where the module writes it: `toaster.show` (no `?.`) becomes the name
/// `toaster.show`, which the checker, the emitter and the projection then read as they read any declared fn's. Done once,
/// as the module is loaded, so every reader has the same tree. The object is the import by its scope (2026-11-26): where
/// the name is bound again around the mention — a parameter, a local, a loop's variable — the member is that binding's,
/// and stays a member.
pub fn name_methods(p: &mut Program, declarations: &IndexMap<String, Vec<JsDecl>>) {
    let mut names: indexmap::IndexSet<String> = indexmap::IndexSet::new();
    for d in &p.decls {
        let Decl::Import { names: ns, declared: Some(dts), .. } = d else { continue };
        for crate::ast::ImportName { name, alias } in ns {
            let prefix = format!("{name}.");
            for x in declarations.get(dts).map(|v| v.as_slice()).unwrap_or(&[]) {
                if let JsDecl::Fn { name: n, .. } = x {
                    if n.starts_with(&prefix) {
                        names.insert(format!("{}{}", alias, &n[name.len()..]));
                    }
                }
            }
        }
    }
    if names.is_empty() {
        return;
    }
    fn chain(e: &Expr) -> Option<String> {
        match &e.k {
            ExprKind::Id(n) => Some(n.clone()),
            ExprKind::Member { o, p, opt: false } => chain(o).map(|o| format!("{o}.{p}")),
            _ => None,
        }
    }
    crate::ast::exprs_mut(p, &mut |e: &mut Expr, bound: &[String]| {
        if !matches!(e.k, ExprKind::Member { .. }) {
            return;
        }
        if let Some(n) = chain(e) {
            if names.contains(&n) && !bound.iter().any(|b| Some(b.as_str()) == n.split('.').next()) {
                e.k = ExprKind::Id(n);
            }
        }
    });
}

/// Load `entry` and everything it imports from `.rx`. `read` returns a module's source, or `None` when there is none.
pub fn load_modules(entry: &str, read: &dyn Fn(&str) -> Option<String>) -> Result<ModuleSet, ParseError> {
    load(entry, read, false, false)
}
/// CP-4c, CP-5: a conformance build's load — `fetch` and `fail` are the scenario prelude's. What `ref/`'s runners ask of the
/// crate (`rxc conform`, `lower`, `project` on stdin, a request with `conformance`); no command that takes a file does.
pub fn load_conformance(entry: &str, read: &dyn Fn(&str) -> Option<String>) -> Result<ModuleSet, ParseError> {
    load(entry, read, false, true)
}
/// CP-8e: an editor's load. Each module is parsed recovering (`parse_program_recovering`), its errors in `parse_errors`;
/// a declaration file that does not parse is still an error.
pub fn load_modules_recovering(entry: &str, read: &dyn Fn(&str) -> Option<String>) -> Result<ModuleSet, ParseError> {
    load(entry, read, true, false)
}
/// MO-14: with a host declaration at or above the entry's folder, the program that stands for the host's view is loaded
/// beside the entry's (`host`), with the modules it imports (`hosted`) and the components it places (`placed`).
fn load(entry: &str, read: &dyn Fn(&str) -> Option<String>, recover: bool, conformance: bool) -> Result<ModuleSet, ParseError> {
    let mut set = load_program(entry, read, recover, conformance)?;
    let dirs: Vec<&str> = entry.split('/').collect();
    let dirs = &dirs[..dirs.len() - 1];
    let lo = if entry.starts_with('/') { 1 } else { 0 };
    let mut found = None;
    for i in (project_top(dirs, lo, read)..=dirs.len()).rev() {
        let file = dirs[..i].iter().copied().chain(std::iter::once(HOST_DECLARATION)).collect::<Vec<_>>().join("/");
        if let Some(src) = read(&file) {
            found = Some((file, src));
            break;
        }
    }
    let Some((file, src)) = found else { return Ok(set) };
    let ds = parse_declarations(&src).map_err(|e| ParseError(format!("{}: {}", file, e.0), e.1, Some(file.clone()), e.3))?;
    let name = file.rsplit('/').next().unwrap_or(HOST_DECLARATION);
    let Some((rx, decl)) = host_program(&src, &ds, name) else { return Ok(set) };
    let host_entry = format!("{file}.host.rx");
    let host_decl = format!("{file}.host.d.rx");
    let over = |p: &str| if p == host_entry { Some(rx.clone()) } else if p == host_decl { Some(decl.clone()) } else { read(p) };
    let mut hs = load_program(&host_entry, &over, recover, conformance).map_err(|e| ParseError(e.0.replace(&host_entry, &file).replace(&host_decl, &file), None, Some(e.2.filter(|f| *f != host_entry && *f != host_decl).unwrap_or_else(|| file.clone())), e.3))?;
    let mut hosted = HashSet::new();
    let mut placed = HashSet::new();
    // placed: the imported components the tree names (one it imports and leaves out is still rendered where no one says)
    let tree = ds.iter().find_map(|d| if let JsDecl::Host { span, .. } = d { Some(&src[span.1..span.2]) } else { None }).unwrap_or("");
    let named: HashSet<&str> = tree.split(|ch: char| !(ch.is_ascii_alphanumeric() || ch == '_' || ch == '$')).collect();
    // MO-14f: a component the declaration imports from a JS module is the host's own — one an `.rx` component applies, and
    // the host renders through: `through`, each by its declaration and its name there
    let mut through = HashSet::new();
    for d in &ds {
        if let JsDecl::Import { names, from, line, .. } = d {
            if !from.ends_with(".rx") {
                let dts = hs.programs.get(&host_entry).and_then(|p| p.decls.iter().find_map(|x| match x { Decl::Import { from: f, line: l, declared, .. } if f == from && l == line => declared.clone(), _ => None }));
                for (n, _) in names {
                    let found = dts.as_ref().is_some_and(|dts| hs.declarations.get(dts).is_some_and(|ds| ds.iter().any(|x| matches!(x, JsDecl::Comp { name, .. } if name == n))));
                    if !found {
                        let why = match &dts { Some(dts) => format!("{dts} declares no component {n}"), None => format!("{from} has no declaration") };
                        return Err(ParseError(format!("{file}: line {line}: import {{ {n} }} from {}: a host declaration imports from a JS module a component the host renders through, and {why} — `export component {n}(props: {{}})` in its `.d.rx` (MO-14f)", serde_json::to_string(from).unwrap_or_default()), None, Some(file.clone()), "NOT_EXPORTED"));
                    }
                    through.insert(format!("{}#{n}", dts.clone().unwrap_or_default()));
                }
                continue;
            }
            let to = join_path(&file, from);
            for (n, alias) in names {
                if named.contains(alias.as_str()) {
                    placed.insert(format!("{to}#{n}"));
                }
            }
            hosted.insert(to);
        }
    }
    hs.hosted = hosted.clone();
    hs.placed = placed.clone();
    hs.under = through.clone();
    set.under = through.clone();
    hs.through = through;
    set.host = Some(Box::new(HostView { file, entry: host_entry, set: hs }));
    set.hosted = hosted;
    set.placed = placed;
    Ok(set)
}
fn load_program(entry: &str, read: &dyn Fn(&str) -> Option<String>, recover: bool, conformance: bool) -> Result<ModuleSet, ParseError> {
    let mut l = Loader { read, programs: HashMap::new(), order: vec![], diags: vec![], declarations: IndexMap::new(), declaration_uses: vec![], declaration_ids: HashMap::new(), wire_ids: HashMap::new(), signatures: IndexMap::new(), printed: Default::default(), sources: HashMap::new(), state: HashMap::new(), recover, parse_errors: vec![] };
    l.visit(entry, &[])?;
    Ok(ModuleSet { entry: entry.to_string(), programs: l.programs, order: l.order, diags: l.diags, declarations: l.declarations, declaration_uses: l.declaration_uses, declaration_ids: l.declaration_ids, signatures: l.signatures, sources: l.sources, parse_errors: l.parse_errors, host: None, through: HashSet::new(), under: HashSet::new(), hosted: HashSet::new(), placed: HashSet::new(), conformance })
}

/// E-5a: the module keys that name the hosts (`?rx-lib` imports, CP-4d). A key is the path the program reached the module
/// by, which may go through a symlink (a linked root, folder or file), while a host is named however its importer was
/// found: the same file is the same module, so each host is matched by its real path. A host that names no module is
/// kept as given.
pub fn hosts_as_keys(set: &ModuleSet, hosts: &[String]) -> Vec<String> {
    let real = |p: &str| std::fs::canonicalize(p).map(|r| r.to_string_lossy().replace('\\', "/")).unwrap_or_else(|_| p.to_string());
    let keys: Vec<(String, String)> = set.order.iter().map(|k| (real(k), k.clone())).collect();
    let mut out = vec![];
    for h in hosts {
        let rh = real(h);
        let mut hit = false;
        for (rk, k) in &keys {
            if *rk == rh || k == h {
                out.push(k.clone());
                hit = true;
            }
        }
        if !hit {
            out.push(h.clone());
        }
    }
    out
}

/// The names a module imports from JavaScript and writes only in its types: nothing to import when it runs, as TypeScript
/// leaves them out. A name a declaration gives a row is that row's to say. `ref/src/modules.ts` `typeOnly`.
pub fn type_only(p: &Program, set: &ModuleSet) -> HashSet<String> {
    use serde_json::Value;
    fn walk(x: &Value, key: &str, values: &mut HashSet<String>, types: &mut Vec<String>) {
        match x {
            Value::String(s) if matches!(key, "type" | "ptypes" | "ret" | "targs" | "propsType") => types.push(s.clone()),
            Value::String(s) => {
                values.insert(s.clone());
                values.insert(s.split('.').next().unwrap_or("").to_string());
            }
            Value::Array(xs) => xs.iter().for_each(|y| walk(y, key, values, types)),
            Value::Object(o) => {
                let k = o.get("k").and_then(|k| k.as_str()).unwrap_or("");
                if matches!(k, "import" | "lit" | "text" | "style") {
                    return;
                }
                for (f, v) in o.iter().filter(|(f, _)| *f != "k") {
                    walk(v, if k == "typedecl" && f == "text" { "type" } else { f }, values, types);
                }
            }
            _ => {}
        }
    }
    let names: Vec<(&str, &str)> = p.decls.iter().filter_map(|d| match d {
        Decl::Import { resolved: None, names, declared, .. } => Some(names.iter().filter(|n| !declared.as_ref().and_then(|dp| set.declarations.get(dp)).is_some_and(|ds| ds.iter().any(|y| y.name() == n.name))).map(|n| (n.name.as_str(), n.alias.as_str()))),
        _ => None,
    }).flatten().collect();
    if names.is_empty() {
        return HashSet::new();
    }
    let (mut values, mut types) = (HashSet::new(), vec![]);
    walk(&decls_json(&p.decls), "", &mut values, &mut types);
    walk(&markups_json(&p.view), "", &mut values, &mut types);
    let word = |c: char| c.is_ascii_alphanumeric() || c == '_' || c == '$';
    let named = |t: &str, n: &str| t.match_indices(n).any(|(i, _)| !t[..i].ends_with(|c| word(c) || c == '.') && !t[i + n.len()..].starts_with(word));
    names.into_iter().filter(|(_, a)| !values.contains(*a) && types.iter().any(|t| named(t, a))).map(|(_, a)| a.to_string()).collect()
}

/// RG-4b, RG-4c: what a name is of a component's props. `props`: the props themselves, without `less` (an object rest);
/// `views`: those typed `View`. `held`: a view the component was given, its children or another. Such an equation is a
/// projection and no computation: the view is made where it is read, under what provides and catches there, as
/// `props.children` is. `ref/src/modules.ts` `given`.
#[derive(Clone, PartialEq)]
pub enum Given {
    Props { less: Vec<String>, views: std::rc::Rc<HashSet<String>> },
    /// `view`: declared `View` where the type is read (`views`); the children of a type that is not read are held, and no
    /// more is known of them. `field`: the prop it is, or the first of those a choice names.
    Children { view: bool },
    View { view: bool, field: Option<String> },
}
impl Given {
    pub fn held(&self) -> bool {
        !matches!(self, Given::Props { .. })
    }
    /// A prop declared `View`: what the rule and the question "was it given" are of.
    pub fn view(&self) -> bool {
        matches!(self, Given::Children { view: true } | Given::View { view: true, .. })
    }
    pub fn field(&self) -> Option<String> {
        match self {
            Given::Children { .. } => Some("children".into()),
            Given::View { field, .. } => field.clone(),
            _ => None,
        }
    }
}
pub fn given(e: &Expr, look: &dyn Fn(&str) -> Option<Given>) -> Option<Given> {
    let either = |xs: [&Expr; 2]| {
        let gs: Vec<Given> = xs.iter().filter_map(|x| given(x, look).filter(|g| g.held())).collect();
        gs.first().map(|g| Given::View { view: gs.iter().any(|g| g.view()), field: g.field() })
    };
    match &e.k {
        ExprKind::Id(n) => look(n),
        ExprKind::Omit { e, keys } => match given(e, look)? {
            Given::Props { mut less, views } => {
                less.extend(keys.iter().cloned());
                Some(Given::Props { less, views })
            }
            _ => None,
        },
        ExprKind::Member { o, p, .. } => match given(o, look)? {
            Given::Props { less, views } if !less.contains(p) => match p.as_str() {
                "children" => Some(Given::Children { view: views.contains(p) }),
                _ => views.contains(p).then(|| Given::View { view: true, field: Some(p.clone()) }),
            },
            _ => None,
        },
        ExprKind::If { t, f, .. } => defaulted(e, look).or_else(|| either([t, f])),
        ExprKind::Bin { op, l, r } if matches!(op.as_str(), "??" | "||" | "&&") => either([l, r]),
        _ => None,
    }
}
/// A view with a default, `{ children = "none" } = props`: read once. Of text, it is still the children.
pub fn defaulted(e: &Expr, look: &dyn Fn(&str) -> Option<Given>) -> Option<Given> {
    let ExprKind::If { c, t, f } = &e.k else { return None };
    let ExprKind::Bin { op, l, r } = &c.k else { return None };
    if op != "==" || !matches!(r.k, ExprKind::Lit(Lit::Undefined)) || l.to_json() != f.to_json() {
        return None;
    }
    let g = given(f, look).filter(|g| g.held())?;
    Some(if matches!(t.k, ExprKind::Lit(Lit::Str(_))) { g.clone() } else { Given::View { view: g.view(), field: g.field() } })
}
/// The fields declared `View` of a component's props, where its type is read: written out, a type of the module, one
/// imported from `.rx`. One classification for the checker and the compiled module. `ref/src/modules.ts` `viewsOf`.
pub fn views_of(props_type: Option<&str>, types: &Types, decls: &[Decl], tparams: Option<&str>) -> HashSet<String> {
    let mut out = HashSet::new();
    if let Some(t) = props_type {
        let ps = tparams.map(type_param_names).unwrap_or_default();
        view_fields(t, decls, 0, &mut out, &ps);
        view_fields(&expand_type(t, &without(types, tparams), 0), &[], 0, &mut out, &[]);
    }
    // W4 (2026-11-26): content between the tags is a view
    if children_say_nothing(props_type, types, tparams) {
        out.insert("children".to_string());
    }
    out
}
/// 07 §2: the type parameter a generic component's children are declared (`children: T`, `children?: T | undefined`), if they are.
pub fn children_param(props_type: Option<&str>, types: &Types, tparams: Option<&str>) -> Option<String> {
    let ps = type_param_names(tparams?);
    let (t, _) = field_type(&expand_type(props_type?, &without(types, tparams), 0), "children")?;
    split_top(&t, "|").iter().map(|a| a.js_trim().to_string()).find(|a| ps.contains(a))
}
/// A function's type, written with no parentheses around it: `(r: T) => View`.
pub fn fn_text(x: &str) -> bool {
    x.starts_with('(') && crate::parse::closes(x, 0).is_some_and(|e| x[e..].js_trim().starts_with("=>"))
}
/// 07 §2: a module's types as a generic component reads its props: a type parameter's name is no type of the module there.
pub fn without<'a>(types: &'a Types, tparams: Option<&str>) -> std::borrow::Cow<'a, Types> {
    let ps: Vec<String> = tparams.map(type_param_names).unwrap_or_default().into_iter().filter(|n| types.contains_key(n)).collect();
    if ps.is_empty() {
        return std::borrow::Cow::Borrowed(types);
    }
    let mut out = types.clone();
    for n in ps {
        out.remove(&format!("{n}<"));
        out.remove(&n);
    }
    std::borrow::Cow::Owned(out)
}
/// `type N<T> = body`, `interface N<T> { … }`: the parameters as written, and the body. `ref/src/modules.ts` `aliasHead`.
pub fn alias_head(text: &str) -> Option<(Option<String>, &str)> {
    let t = text.strip_prefix("export").map(|r| r.trim_start()).unwrap_or(text);
    let (interface, r) = match t.strip_prefix("interface") {
        Some(r) => (true, r),
        None => (false, t.strip_prefix("type")?),
    };
    let r = r.trim_start();
    let n = r.bytes().take_while(|b| b.is_ascii_alphanumeric() || *b == b'_' || *b == b'$').count();
    let mut r = r[n..].trim_start();
    let mut tparams = None;
    if r.starts_with('<') {
        let e = crate::parse::closes(r, 0)?;
        tparams = Some(r[..e].to_string());
        r = &r[e..];
    }
    let r = r.js_trim();
    if interface {
        return Some((tparams, &r[r.find('{')?..]));
    }
    Some((tparams, r.strip_prefix('=')?.js_trim().trim_end_matches(';')))
}
/// The names of `<T extends X = Y, const U>`.
pub fn type_param_names(tparams: &str) -> Vec<String> {
    let t = tparams.js_trim();
    if t.len() < 2 {
        return vec![];
    }
    split_top(&t[1..t.len() - 1], ",").iter().filter_map(|p| type_param(p).map(|(n, _)| n)).collect()
}
/// One type parameter: its name, and what follows it (`extends X = Y`).
fn type_param(p: &str) -> Option<(String, &str)> {
    let mut r = p.js_trim();
    loop {
        let w = ["const", "in", "out"].iter().find_map(|w| r.strip_prefix(w).filter(|x| x.starts_with(|c: char| c.is_whitespace())));
        match w {
            Some(x) => r = x.js_trim(),
            None => break,
        }
    }
    let n = r.bytes().take_while(|b| b.is_ascii_alphanumeric() || *b == b'_' || *b == b'$').count();
    if n == 0 || r.as_bytes()[0].is_ascii_digit() {
        return None;
    }
    Some((r[..n].to_string(), &r[n..]))
}
/// A generic alias applied, `Item<number>`: its body with each parameter's name replaced by its argument (a default where
/// none is written). Not read (`None`): more arguments than parameters, a parameter with no argument and no default, a
/// body that binds one of the names again (`infer T`, `[T in …]`, `<T>(…) => …`). `ref/src/modules.ts` `applyAlias`.
pub fn apply_alias(body: &str, tparams: &str, args: &[String]) -> Option<String> {
    let t = tparams.js_trim();
    let mut map: Vec<(String, String)> = vec![];
    let ps = split_top(&t[1..t.len() - 1], ",");
    if args.len() > ps.len() {
        return None;
    }
    for (i, p) in ps.iter().enumerate() {
        let (name, tail) = type_param(p)?;
        // what follows the first `=` that is not inside brackets and is no arrow's
        let dflt = {
            let (tb, mut depth, mut at) = (tail.as_bytes(), 0i32, None);
            for i in 0..tb.len() {
                match tb[i] {
                    b'<' | b'(' | b'{' | b'[' => depth += 1,
                    b')' | b'}' | b']' => depth -= 1,
                    b'>' if i == 0 || tb[i - 1] != b'=' => depth -= 1,
                    b'=' if tb.get(i + 1) != Some(&b'>') && depth == 0 => {
                        at = Some(i + 1);
                        break;
                    }
                    _ => {}
                }
            }
            at.map(|i| tail[i..].js_trim().to_string()).filter(|d| !d.is_empty())
        };
        let a = args.get(i).map(|a| a.js_trim().to_string()).filter(|a| !a.is_empty()).or(dflt)?;
        map.push((name, if a.contains(['|', '&', '?']) || a.contains("=>") { format!("({a})") } else { a }));
    }
    let b = body.as_bytes();
    let word = |c: u8| c.is_ascii_alphanumeric() || c == b'_' || c == b'$';
    // a body that binds a name again is not read
    for (n, _) in &map {
        let n = regex::escape(n);
        if regex::Regex::new(&format!(r"\binfer\s+{n}\b|\[\s*{n}\s+in\b|<\s*(?:const\s+)?{n}\b")).is_ok_and(|r| r.is_match(body)) {
            return None;
        }
    }
    let (mut out, mut prev, mut nl, mut i) = (String::new(), 0u8, false, 0);
    while i < b.len() {
        let ch = b[i];
        if ch == b'"' || ch == b'\'' || ch == b'`' {
            let mut j = i + 1;
            while j < b.len() && b[j] != ch {
                j += if b[j] == b'\\' { 2 } else { 1 };
            }
            let j = (j + 1).min(b.len());
            out.push_str(&body[i..j]);
            i = j;
            prev = ch;
            nl = false;
            continue;
        }
        if ch.is_ascii_alphabetic() || ch == b'_' || ch == b'$' {
            let mut j = i + 1;
            while j < b.len() && word(b[j]) {
                j += 1;
            }
            let w = &body[i..j];
            let after = body[j..].js_trim();
            let field = after.strip_prefix('?').map(|r| r.js_trim()).unwrap_or(after).starts_with(':') && (prev == 0 || b"{,;(".contains(&prev) || nl || out.js_trim().ends_with("readonly") && !out.ends_with("readonly"));
            match map.iter().find(|(n, _)| n == w) {
                Some((_, a)) if prev != b'.' && !field => out.push_str(a),
                _ => out.push_str(w),
            }
            i = j;
            prev = b'a';
            nl = false;
            continue;
        }
        if ch == b'\n' {
            nl = true;
        } else if !ch.is_ascii_whitespace() {
            prev = ch;
            nl = false;
        }
        // one character, whatever its width
        let n = body[i..].chars().next().map_or(1, |c| c.len_utf8());
        out.push_str(&body[i..i + n]);
        i += n;
    }
    Some(out)
}
/// A type that is read and is a value's, with no view in it: `number`, `string | undefined`, `"a" | "b"`.
pub fn value_type(t: &str) -> bool {
    split_top(t, "|").iter().all(|a| {
        let a = a.trim();
        let n = a.strip_prefix('-').unwrap_or(a);
        matches!(a, "string" | "number" | "boolean" | "bigint" | "null" | "undefined" | "true" | "false")
            || (a.len() >= 2 && ((a.starts_with('"') && a.ends_with('"') && !a[1..a.len() - 1].contains('"')) || (a.starts_with('\'') && a.ends_with('\'') && !a[1..a.len() - 1].contains('\''))))
            || (n.starts_with(|c: char| c.is_ascii_digit()) && n.chars().all(|c| c.is_ascii_digit() || c == '.'))
    })
}
/// What a component's prop is declared: a view (`Some(true)`), a value's type that is read (`Some(false)`), or not known.
/// W4 (2026-11-26): whether a component's `children` are declared by a type that says nothing of them — no props type,
/// props `any` or `unknown`, `children: any` or `unknown` — written so in the module. Content a caller
/// writes between its tags is a view, so the component's use of them is checked as `children?: View` is: a view is only
/// shown (RG-4c). A record written out without `children` declares none. `ref/src/modules.ts` `childrenSayNothing`.
pub fn children_say_nothing(props_type: Option<&str>, types: &Types, tparams: Option<&str>) -> bool {
    let Some(pt) = props_type else { return true };
    let t = expand_type(pt, &without(types, tparams), 0);
    let t = t.js_trim();
    if t == "any" || t == "unknown" {
        return true;
    }
    if let Some((ty, _)) = field_type(t, "children") {
        return ty.js_trim() == "any" || ty.js_trim() == "unknown";
    }
    false // a type it does not read (an imported alias): what its children are is that type's, unknown here
}
pub fn takes_view(props_type: Option<&str>, types: &Types, field: &str, tparams: Option<&str>) -> Option<bool> {
    let (t, _) = field_type(&expand_type(props_type?, &without(types, tparams), 0), field)?;
    let ps = tparams.map(type_param_names).unwrap_or_default(); // 07 §2: a type parameter stands for a value's type, never for a view
    let w = |c: char| c.is_alphanumeric() || c == '_' || c == '$';
    if t.match_indices("View").any(|(i, _)| !t[..i].ends_with(w) && !t[i + 4..].starts_with(w)) {
        Some(true)
    } else if value_type(&t) || split_top(&t, "|").iter().all(|a| ps.iter().any(|p| p == a.js_trim()) || value_type(a)) {
        Some(false)
    } else {
        None
    }
}
/// The fields typed `View` of a component's props type: written out, or a type of the module (`type P = …`, `interface P`).
pub fn view_fields(t: &str, decls: &[Decl], depth: usize, out: &mut HashSet<String>, hidden: &[String]) {
    if depth > 8 {
        return;
    }
    // a union of records: a field that is a view in one of them is one
    let alts = split_top(t, "|");
    if alts.iter().filter(|x| !x.trim().is_empty()).count() > 1 {
        for a in &alts {
            if !a.trim().is_empty() {
                view_fields(a.trim(), decls, depth + 1, out, hidden);
            }
        }
        return;
    }
    for part in split_top(t, "&") {
        let part = part.trim();
        if let Some(body) = part.strip_prefix('{').and_then(|p| p.strip_suffix('}')) {
            for f in split_top(body, ",;\n") {
                if let Some((k, ty)) = f.split_once(':') {
                    if is_view_type(ty) {
                        out.insert(field_name(k));
                    }
                }
            }
            continue;
        }
        let n: String = part.chars().take_while(|c| c.is_ascii_alphanumeric() || *c == '_').collect();
        if hidden.contains(&n) {
            continue;
        }
        let Some(text) = decls.iter().find_map(|d| match d { Decl::TypeDecl { name, text, .. } if *name == n => Some(text), _ => None }) else { continue };
        if let Some((_, b)) = alias_head(text) {
            view_fields(b.trim().trim_end_matches(';'), decls, depth + 1, out, hidden);
        }
    }
}

/// RG-4c: a view a component takes and shows: a field of its props declared a function giving a `View`, of one parameter or
/// none, which its view shows as `<props.f … />`. `mixed`: `children` declared `View | ((s: T) => View)` take plain content as
/// well. `param`: the parameter's type.
#[derive(Debug, Clone, PartialEq)]
pub struct Shown {
    pub optional: bool,
    pub mixed: bool,
    pub param: Option<String>,
}
pub fn shown(props: &str, props_type: Option<&str>, decls: &[Decl], view: &[Markup], types: &Types, tparams: Option<&str>) -> IndexMap<String, Shown> {
    let mut out = IndexMap::new();
    let Some(t) = props_type else { return out };
    let fields = shown_fields(props, decls, view);
    if fields.is_empty() {
        return out;
    }
    let t = expand_type(t, &without(types, tparams), 0);
    for f in fields {
        let Some((ty, optional)) = field_type(&t, &f) else { continue };
        if let Some((mixed, param)) = view_type(&ty).filter(|v| f != "ref" && (!v.0 || f == "children")) {
            out.insert(f, Shown { optional, mixed, param });
        }
    }
    out
}
/// The types a module names, its own and those it imports from `.rx` modules: what each stands for, in no name of a module.
pub type Types = HashMap<String, String>;
pub fn types_of(set: &ModuleSet, path: &str) -> Types {
    // what an alias stands for, and its type parameters (07 §2)
    fn named(set: &ModuleSet, path: &str, name: &str, busy: &mut Vec<(String, String)>) -> Option<(String, Option<String>)> {
        let at = (path.to_string(), name.to_string());
        if busy.contains(&at) || busy.len() > 8 {
            return None; // a type that names itself is read as far as its name
        }
        for d in &set.programs.get(path)?.decls {
            match d {
                Decl::TypeDecl { name: n, text, .. } if n == name => {
                    let (tparams, body) = alias_head(text)?;
                    let ps = tparams.as_deref().map(type_param_names).unwrap_or_default(); // a parameter's name is no type of the module inside its alias
                    busy.push(at);
                    let t = expand(body, 0, &mut |k: &str| {
                        let n = k.strip_suffix('<').unwrap_or(k);
                        if ps.iter().any(|p| p == n) {
                            return None;
                        }
                        let (b, tp) = named(set, path, n, busy)?;
                        if k.ends_with('<') { tp } else { Some(b) }
                    });
                    busy.pop();
                    return Some((t, tparams));
                }
                Decl::Import { names, resolved: Some(r), .. } => {
                    if let Some(n) = names.iter().find(|n| n.alias == name) {
                        // MO-9: a signature says what it stands for
                        return match set.programs.contains_key(r) {
                            // an import cycle that names one name ends here
                            true => {
                                busy.push(at.clone());
                                let t = named(set, r, &n.name, busy);
                                busy.pop();
                                t
                            }
                            false => set.signatures.get(r).and_then(|s| s.exports.get(&n.name)).and_then(|x| match x { crate::signature::ExportSig::Type(t, tp) => t.clone().map(|t| (t, tp.clone())), _ => None }),
                        };
                    }
                }
                _ => {}
            }
        }
        None
    }
    let Some(p) = set.programs.get(path) else { return Types::new() };
    let mut out = Types::new();
    for d in &p.decls {
        let names: Vec<&str> = match d {
            Decl::TypeDecl { name, .. } => vec![name],
            Decl::Import { names, resolved: Some(_), .. } => names.iter().map(|n| n.alias.as_str()).collect(),
            _ => continue,
        };
        for n in names {
            if let Some((t, tp)) = named(set, path, n, &mut vec![]) {
                out.insert(n.to_string(), t);
                if let Some(tp) = tp {
                    out.insert(format!("{n}<"), tp);
                }
            }
        }
    }
    out
}
/// A type with what its names stand for written out: records, lists, unions, what a function answers; a name it does not
/// know is left.
pub fn expand_type(t: &str, types: &Types, depth: usize) -> String {
    expand(t, depth, &mut |n: &str| types.get(n).cloned())
}
fn expand(t: &str, depth: usize, named: &mut dyn FnMut(&str) -> Option<String>) -> String {
    // a next-line character between tokens is space to the parser, and no part of a type's name
    let spaced = if depth == 0 && t.contains('\u{85}') { Some(t.replace('\u{85}', " ")) } else { None };
    let t = spaced.as_deref().unwrap_or(t);
    let t = t.js_trim();
    if depth > 8 || t.len() > 4000 {
        return t.to_string();
    }
    let word = |s: &str| !s.is_empty() && !s.as_bytes()[0].is_ascii_digit() && s.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'$');
    if t.starts_with('(') {
        // a function's parameters and result; a parenthesis
        if let Some(end) = crate::parse::closes(t, 0) {
            if let Some(r) = t[end..].js_trim().strip_prefix("=>") {
                let ps: Vec<String> = split_top(&t[1..end - 1], ",").into_iter().filter(|p| !p.js_trim().is_empty()).map(|p| match p.split_once(':') {
                    Some((n, ty)) if !n.contains(['{', '[']) => format!("{}: {}", n.js_trim(), expand(ty, depth + 1, named)),
                    _ => p.js_trim().to_string(),
                }).collect();
                return format!("({}) => {}", ps.join(", "), expand(r, depth + 1, named));
            }
            if end == t.len() {
                return format!("({})", expand(&t[1..end - 1], depth + 1, named));
            }
        }
    }
    for sep in ["|", "&"] {
        let parts: Vec<String> = split_top(t, sep).into_iter().filter(|x| !x.js_trim().is_empty()).collect();
        if parts.len() > 1 {
            // a name that stands for a function's type, among others, is written in parentheses
            let xs: Vec<String> = parts.iter().map(|x| expand(x, depth + 1, named)).map(|x| if fn_text(&x) { format!("({x})") } else { x }).collect();
            let record = |x: &String| x.starts_with('{') && crate::parse::closes(x, 0) == Some(x.len());
            if sep == "&" && xs.iter().all(record) {
                return format!("{{ {} }}", xs.iter().map(|x| x[1..x.len() - 1].js_trim().trim_end_matches([',', ';']).to_string()).filter(|x| !x.is_empty()).collect::<Vec<_>>().join("; "));
            }
            return xs.join(&format!(" {sep} "));
        }
    }
    if let Some(inner) = t.strip_prefix("readonly ") {
        return format!("readonly {}", expand(inner, depth + 1, named));
    }
    if let Some(inner) = t.strip_suffix("[]") {
        let x = expand(inner, depth + 1, named);
        return if x.contains(['|', '&']) || x.contains("=>") { format!("({x})[]") } else { format!("{x}[]") };
    }
    for w in ["Array", "ReadonlyArray"] {
        if let Some(inner) = t.strip_prefix(w).and_then(|r| r.strip_prefix('<')).and_then(|r| r.strip_suffix('>')) {
            return format!("{w}<{}>", expand(inner, depth + 1, named));
        }
    }
    if let Some(body) = t.strip_prefix('{').and_then(|r| r.strip_suffix('}')) {
        let fields: Vec<String> = split_top(body, ",;\n").into_iter().filter(|f| !f.js_trim().is_empty()).map(|f| match f.split_once(':') {
            Some((k, ty)) if !k.contains(['(', '[']) => format!("{}: {}", k.js_trim(), expand(ty, depth + 1, named)),
            _ => f.js_trim().to_string(),
        }).collect();
        return if fields.is_empty() { "{}".into() } else { format!("{{ {} }}", fields.join("; ")) };
    }
    // 07 §2: a generic alias applied, `Item<number>`; alone, where every parameter has a default
    if let Some(open) = t.find('<').filter(|&i| word(t[..i].js_trim()) && crate::parse::closes(t, i) == Some(t.len())) {
        let n = t[..open].js_trim();
        if let (Some(tp), Some(body)) = (named(&format!("{n}<")), named(n)) {
            let args: Vec<String> = split_top(&t[open + 1..t.len() - 1], ",").iter().map(|a| expand(a, depth + 1, named)).collect();
            if let Some(r) = apply_alias(&body, &tp, &args) {
                return expand(&r, depth + 1, &mut |_| None);
            }
        }
    }
    if word(t) {
        if let Some(tp) = named(&format!("{t}<")) {
            return named(t).and_then(|body| apply_alias(&body, &tp, &[])).unwrap_or_else(|| t.to_string());
        }
        if let Some(x) = named(t) {
            return x;
        }
    }
    t.to_string()
}
/// `<props.f … />`: the name of the props, and the field.
/// RG-4c, a context that holds a view (proposals/27): its declared type, read, is `View` (`fn_: false`) or a function
/// giving one, of one parameter or none (`fn_: true`; the parameter's type). `ref/src/modules.ts` `viewCtx`.
/// RG-7a (X9): a context's type that is a generic function type, `<T>(p: { item: T }) => View`, in parentheses too.
pub fn generic_ctx(ty: Option<&str>, types: &Types) -> bool {
    let Some(ty) = ty else { return false };
    let t = expand_type(ty, types, 0);
    let mut t = t.trim();
    while t.starts_with('(') && t.ends_with(')') {
        let (mut d, mut whole) = (0i32, true);
        for c in t[..t.len() - 1].chars() {
            match c {
                '(' => d += 1,
                ')' => d -= 1,
                _ => {}
            }
            if d == 0 {
                whole = false;
                break;
            }
        }
        if !whole {
            break;
        }
        t = t[1..t.len() - 1].trim();
    }
    t.starts_with('<')
}
pub fn view_ctx(ty: Option<&str>, types: &Types) -> Option<(bool, Option<String>)> {
    let t = expand_type(ty?, types, 0);
    let mut t = t.trim();
    // a type in parentheses is that type: `((row: T) => View)`
    while t.starts_with('(') && t.ends_with(')') {
        let (mut d, mut whole) = (0i32, true);
        for c in t[..t.len() - 1].chars() {
            match c {
                '(' => d += 1,
                ')' => d -= 1,
                _ => {}
            }
            if d == 0 {
                whole = false;
                break;
            }
        }
        if !whole {
            break;
        }
        t = t[1..t.len() - 1].trim();
    }
    if crate::parse::is_view_type(t) {
        return Some((false, None));
    }
    match view_type(t) {
        Some((false, param)) => Some((true, param)),
        _ => None,
    }
}
/// `<use.item … />`: the context whose view is shown.
pub fn used_in(tag: &str) -> Option<&str> {
    let n = tag.strip_prefix("use.")?;
    let first = n.bytes().next()?;
    (!first.is_ascii_digit() && n.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'$')).then_some(n)
}
pub fn shown_in(tag: &str) -> Option<(&str, &str)> {
    let (n, f) = tag.split_once('.')?;
    let word = |s: &str| s.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'$');
    let first = n.bytes().next()?;
    let field = f.bytes().next().is_some_and(|b| !b.is_ascii_digit());
    ((first.is_ascii_lowercase() || first == b'_' || first == b'$') && field && word(n) && word(f)).then_some((n, f))
}
/// The fields of its props a component shows so, whatever their types say.
pub fn shown_fields(props: &str, decls: &[Decl], view: &[Markup]) -> indexmap::IndexSet<String> {
    fn go(props: &str, decls: &[Decl], view: &[Markup], out: &mut indexmap::IndexSet<String>) {
        for d in decls {
            if let Decl::Component { decls, view, .. } = d {
                go(props, decls, view, out);
            }
            // `provide item = props.f`: a context that holds a view carries it to where it is shown
            if let Decl::Provide { e, .. } = d {
                if let crate::ast::ExprKind::Member { o, p, .. } = &e.k {
                    if matches!(&o.k, crate::ast::ExprKind::Id(n) if n == props) {
                        out.insert(p.clone());
                    }
                }
            }
        }
        for m in view {
            match &m.kind {
                MarkupKind::El { tag, children, .. } => {
                    if let Some((_, f)) = shown_in(tag).filter(|(n, _)| *n == props) {
                        out.insert(f.to_string());
                    }
                    go(props, &[], children, out);
                }
                MarkupKind::Mif { t, t_decls, f, f_decls, .. } => {
                    go(props, &[], t, out);
                    go(props, t_decls, &[], out);
                    go(props, &[], f, out);
                    go(props, f_decls, &[], out);
                }
                MarkupKind::Mfor { decls, body, .. } | MarkupKind::Mview { decls, body, .. } | MarkupKind::Portal { decls, body, .. } => go(props, decls, body, out),
                MarkupKind::Loading { fallback, decls, body, .. } => {
                    go(props, &[], fallback, out);
                    go(props, decls, body, out);
                }
                MarkupKind::Errored { fallback, decls, body, .. } => {
                    go(props, &[], fallback, out);
                    go(props, decls, body, out);
                }
                _ => {}
            }
        }
    }
    let mut out = indexmap::IndexSet::new();
    go(props, decls, view, &mut out);
    out
}
/// A field of a record type written out: its type, and whether it is optional.
pub fn field_type(t: &str, field: &str) -> Option<(String, bool)> {
    let (mut found, mut last) = (None, 0);
    for part in split_top(t, "&") {
        let Some(body) = part.js_trim().strip_prefix('{').and_then(|p| p.strip_suffix('}')) else { continue };
        for f in split_top(body, ",;\n") {
            if let Some((k, ty)) = f.split_once(':') {
                if !k.is_empty() && field_name(k) == field {
                    found = Some((ty.js_trim().to_string(), k.js_trim().ends_with('?')));
                    last += 1;
                }
            }
        }
    }
    // in two records of an intersection, it is neither's
    found.filter(|_| last == 1)
}
/// `(s: T) => View`, `() => View`; `View | ((s: T) => View)`, either way round. Whether plain content is taken; the parameter.
pub fn view_type(t: &str) -> Option<(bool, Option<String>)> {
    let alts: Vec<String> = split_top(t, "|").into_iter().map(|x| x.js_trim().to_string()).collect();
    if let [a, b] = &alts[..] {
        let f = if a == "View" { b } else if b == "View" { a } else { return None };
        if !f.starts_with('(') || crate::parse::closes(f, 0) != Some(f.len()) {
            return None;
        }
        return view_type(&f[1..f.len() - 1]).filter(|v| !v.0).map(|v| (true, v.1));
    }
    let t = t.js_trim();
    let end = t.starts_with('(').then(|| crate::parse::closes(t, 0)).flatten()?;
    if t[end..].js_trim().strip_prefix("=>").map(|r| r.js_trim()) != Some("View") {
        return None;
    }
    let ps: Vec<String> = split_top(&t[1..end - 1], ",").into_iter().map(|p| p.js_trim().to_string()).filter(|p| !p.is_empty()).collect();
    match &ps[..] {
        [] => Some((false, None)),
        [p] => p.split_once(':').and_then(|(n, ty)| {
            let (n, ty) = (n.js_trim(), ty.js_trim());
            let name = n.bytes().next().is_some_and(|b| !b.is_ascii_digit()) && n.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'$');
            (name && !ty.is_empty()).then(|| (false, Some(ty.to_string())))
        }),
        _ => None,
    }
}
/// What names a view a component shows (`fields`) anywhere but where it is shown or asked for (`if props.f`, which plain
/// content as well is not): the field, and its line. A projection that takes it out of a rest
/// (`{ children: none, ...rest } = props`) and is not named again is none.
pub fn other_mention(props: &str, decls: &[Decl], view: &[Markup], fields: &IndexMap<String, Shown>, ctx: &dyn Fn(&str) -> bool) -> Option<(String, usize)> {
    use serde_json::Value;
    fn of<'v>(v: &'v Value, p: &str, fields: &IndexMap<String, Shown>) -> Option<&'v str> {
        (v["k"] == "member" && v["o"]["k"] == "id" && v["o"]["name"] == p).then(|| v["p"].as_str()).flatten().filter(|f| fields.contains_key(*f))
    }
    fn mentions(v: &Value, n: &str) -> bool {
        match v {
            Value::Array(xs) => xs.iter().any(|x| mentions(x, n)),
            Value::Object(o) => {
                let k = o.get("k").and_then(Value::as_str);
                (matches!(k, Some("id" | "pre")) && v["name"] == n) || (k == Some("el") && v["tag"].as_str().is_some_and(|t| t == n || t.strip_prefix(n).is_some_and(|r| r.starts_with('.')))) || o.values().any(|x| mentions(x, n))
            }
            _ => false,
        }
    }
    fn walk(v: &Value, p: &str, fields: &IndexMap<String, Shown>, line: usize, ctx: &dyn Fn(&str) -> bool) -> Option<(String, usize)> {
        match v {
            Value::Array(xs) => xs.iter().find_map(|x| walk(x, p, fields, line, ctx)),
            Value::Object(o) => {
                let line = o.get("line").and_then(Value::as_u64).map(|l| l as usize).unwrap_or(line);
                let k = o.get("k").and_then(Value::as_str);
                let of_props = |f: &str| v[f]["k"] == "id" && v[f]["name"] == p;
                // `provide item = props.f` of a context that holds a view with a parameter: carried to where it is shown
                if k == Some("provide") && v["name"].as_str().is_some_and(ctx) && of(&v["e"], p, fields).is_some() {
                    return None;
                }
                if k == Some("member") && of_props("o") {
                    return of(v, p, fields).map(|f| (f.to_string(), line));
                }
                // `props["aria-label"]` is one prop, as `props.label` is
                if k == Some("index") && of_props("o") && v["i"]["k"] == "lit" {
                    if let Some(f) = v["i"]["v"].as_str() {
                        return fields.contains_key(f).then(|| (f.to_string(), line));
                    }
                }
                if k == Some("omit") && of_props("e") && v["keys"].as_array().is_some_and(|ks| fields.keys().all(|f| ks.iter().any(|x| x == f))) {
                    return None;
                }
                if matches!(k, Some("id" | "pre")) && v["name"] == p {
                    return fields.keys().next().map(|f| (f.clone(), line));
                }
                o.iter().find_map(|(f, x)| if k == Some("mif") && f == "c" && of(x, p, fields).is_some_and(|g| !fields[g].mixed) { None } else { walk(x, p, fields, line, ctx) })
            }
            _ => None,
        }
    }
    let all: Vec<Value> = decls.iter().map(|d| d.to_json()).chain(view.iter().map(|m| m.to_json())).collect();
    let out = |d: &Value| d["k"] == "eq" && of(&d["e"], props, fields).is_some() && !all.iter().any(|x| mentions(x, d["name"].as_str().unwrap_or_default()));
    all.iter().find_map(|d| if out(d) { None } else { walk(d, props, fields, 0, ctx) })
}

/// RG-4c: what a component does with the views it is given: the props declared `View` where its type is read
/// (`views_of`), its children among them. A view is only shown (`{props.children}`, also under a default or a choice),
/// given on (as content or as an argument of another component that takes a view there, or in a spread of the props),
/// named again by a projection of the props, or asked whether it was given (`if props.children`, `!`, `== undefined`).
/// A name is the binding it is written under: a parameter, a loop's item, a local or an equation of an inner block of the
/// same spelling is another name. `bad`: every other mention, in the order of the text (field, line, how, of). `at`: each
/// reader that shows a view, each argument and each content that gives one on (by the address of the `Markup` or the
/// `Attr`), and the props it is of. `skip`: the fields the component shows as `<props.f … />`, which have their own rule
/// (`other_mention`). `dest`: what the prop `attr` of `<tag>` is declared (`takes_view`). `ref/src/modules.ts` `viewUses`.
#[derive(Default)]
pub struct ViewUses {
    pub bad: Vec<(String, usize, String, String)>,
    pub at: HashMap<usize, Vec<String>>,
    /// each `provide item = props.f` of a context that holds a view: the context's name, the props it carries
    pub carried: Vec<(String, Vec<String>)>,
    /// the provisions of a context that holds a view whose every arm is a view of the component, or nothing: no text
    pub only: HashSet<usize>,
}
pub fn view_uses(props: &str, props_type: Option<&str>, tparams: Option<&str>, decls: &[Decl], view: &[Markup], types: &Types, skip: &[String], dest: &dyn Fn(&str, &str) -> Option<bool>, ctx: &dyn Fn(&str) -> bool) -> ViewUses {
    use crate::ast::{Attr, Field, MarkupKind, PathSeg, Stmt, StmtKind, TplPart};
    #[derive(Default)]
    struct Sc {
        /// `None`: a name of this block that is no view
        names: HashMap<String, Option<Given>>,
        /// the props a name of this block stands for
        fields: HashMap<String, Vec<String>>,
        up: Option<usize>,
    }
    struct W<'a> {
        scs: Vec<Sc>,
        out: ViewUses,
        dest: &'a dyn Fn(&str, &str) -> Option<bool>,
        /// whether a context of that name holds a view (`context item: View`)
        ctx: &'a dyn Fn(&str) -> bool,
        /// W4: the root's views, where its children are nobody's declaration: a view where read, none a whole spread hands on
        loose: Option<std::rc::Rc<HashSet<String>>>,
    }
    fn near<'h>(how: &'h str, k: &'h str) -> &'h str {
        // what reads it: the nearest, but a handler's or an effect's body whatever is in it
        if how == "handler" || how == "effect" { how } else { k }
    }
    fn nothing(e: &Expr) -> bool {
        matches!(e.k, ExprKind::Lit(Lit::Undefined | Lit::Null))
    }
    fn eq_op(op: &str) -> bool {
        matches!(op, "==" | "!=" | "===" | "!==")
    }
    impl W<'_> {
        fn sub(&mut self, up: usize, names: &[&str]) -> usize {
            let mut sc = Sc { up: Some(up), ..Sc::default() };
            for n in names {
                sc.names.insert(n.to_string(), None);
            }
            self.scs.push(sc);
            self.scs.len() - 1
        }
        fn look(&self, sc: usize, n: &str) -> Option<Given> {
            let mut s = Some(sc);
            while let Some(i) = s {
                if let Some(g) = self.scs[i].names.get(n) {
                    return g.clone();
                }
                s = self.scs[i].up;
            }
            None
        }
        fn given(&self, e: &Expr, sc: usize) -> Option<Given> {
            given(e, &|n| self.look(sc, n))
        }
        fn view(&self, e: &Expr, sc: usize) -> Option<Given> {
            self.given(e, sc).filter(|g| g.held() && g.view())
        }
        fn form(&self, e: &Expr, sc: usize) -> bool {
            matches!(e.k, ExprKind::Id(_) | ExprKind::Member { .. }) && self.view(e, sc).is_some()
        }
        /// Whether an expression is a view of the component or nothing, whatever it chooses: no arm of it is a value,
        /// which would be text where it is shown (`p.z ? p.b : undefined`, `p.b ?? p.c`).
        fn views_only(&self, e: &Expr, sc: usize) -> bool {
            // (`null` is shown as text)
            if self.form(e, sc) || matches!(e.k, ExprKind::Lit(Lit::Undefined)) {
                return true;
            }
            match &e.k {
                ExprKind::If { t, f, .. } => self.views_only(t, sc) && self.views_only(f, sc),
                ExprKind::Bin { op, l, r } if matches!(op.as_str(), "??" | "||") => self.views_only(l, sc) && self.views_only(r, sc),
                // (not `a && b`: where its left is false, or 0, it is that value, and `false` is shown as text)
                _ => false,
            }
        }
        fn left(&self, e: &Expr, sc: usize) -> Vec<String> {
            match self.given(e, sc) {
                Some(Given::Props { less, views }) => {
                    let loose = self.loose.as_ref().is_some_and(|r| std::rc::Rc::ptr_eq(r, &views));
                    let mut l: Vec<String> = views.iter().filter(|v| !less.contains(v) && !(loose && v.as_str() == "children")).cloned().collect();
                    l.sort();
                    l
                }
                _ => vec![],
            }
        }
        fn is_props(&self, e: &Expr, sc: usize) -> bool {
            matches!(self.given(e, sc), Some(Given::Props { .. }))
        }
        fn hit(&mut self, field: &str, line: usize, how: &str, of: &str) {
            self.out.bad.push((field.to_string(), line, how.to_string(), of.to_string()));
        }
        fn held_name(g: &Given) -> &'static str {
            if matches!(g, Given::Children { .. }) { "children" } else { "view" }
        }
        /// The view an expression shows, if it does: itself, an arm of a choice or of a default.
        fn shows(&self, e: &Expr, sc: usize) -> Option<String> {
            match &e.k {
                ExprKind::Id(_) => self.view(e, sc).map(|g| Self::held_name(&g).to_string()),
                ExprKind::Member { p, .. } => self.view(e, sc).map(|_| p.clone()),
                ExprKind::If { t, f, .. } => self.shows(t, sc).or_else(|| self.shows(f, sc)),
                ExprKind::Bin { op, l, r } if matches!(op.as_str(), "??" | "||" | "&&") => self.shows(l, sc).or_else(|| self.shows(r, sc)),
                _ => None,
            }
        }
        /// Every prop an expression shows.
        fn fields(&self, e: &Expr, sc: usize) -> Vec<String> {
            match &e.k {
                ExprKind::Id(n) => {
                    let Some(g) = self.view(e, sc) else { return vec![] };
                    let mut s = Some(sc);
                    while let Some(i) = s {
                        if self.scs[i].names.contains_key(n) {
                            return self.scs[i].fields.get(n).cloned().unwrap_or_else(|| g.field().into_iter().collect());
                        }
                        s = self.scs[i].up;
                    }
                    vec![]
                }
                ExprKind::Member { p, .. } => if self.view(e, sc).is_some() { vec![p.clone()] } else { vec![] },
                ExprKind::If { t, f, .. } => [self.fields(t, sc), self.fields(f, sc)].concat(),
                // the left of `&&` is asked: what it is where it was not given is nothing, placed nowhere
                ExprKind::Bin { op, r, .. } if op == "&&" => self.fields(r, sc),
                ExprKind::Bin { op, l, r } if matches!(op.as_str(), "??" | "||") => [self.fields(l, sc), self.fields(r, sc)].concat(),
                _ => vec![],
            }
        }
        fn block(&mut self, ds: &[Decl], up: usize) -> usize {
            let sc = self.sub(up, &[]);
            for x in ds {
                match x {
                    Decl::Import { names, .. } => names.iter().for_each(|n| { self.scs[sc].names.insert(n.alias.clone(), None); }),
                    Decl::Effect { .. } | Decl::Provide { .. } => {}
                    _ => if let Some(n) = x.name() { self.scs[sc].names.insert(n.to_string(), None); },
                }
            }
            // the equations that are projections of the props, in whatever order they are written
            loop {
                let mut more = false;
                for d in ds {
                    let Decl::Eq { name, e, deferred: false, key: None, .. } = d else { continue };
                    if self.look(sc, name).is_some() {
                        continue;
                    }
                    if let Some(g) = self.given(e, sc) {
                        self.scs[sc].names.insert(name.clone(), Some(g));
                        more = true;
                    }
                }
                if !more {
                    break;
                }
            }
            loop {
                let mut more = false;
                for d in ds {
                    let Decl::Eq { name, e, .. } = d else { continue };
                    if !self.scs[sc].names.get(name).is_some_and(|g| g.as_ref().is_some_and(|g| g.held())) {
                        continue;
                    }
                    let mut fs: Vec<String> = vec![];
                    for f in self.fields(e, sc) {
                        if !fs.contains(&f) {
                            fs.push(f);
                        }
                    }
                    if fs.len() != self.scs[sc].fields.get(name).map_or(0, Vec::len) {
                        self.scs[sc].fields.insert(name.clone(), fs);
                        more = true;
                    }
                }
                if !more {
                    break;
                }
            }
            sc
        }
        fn plains(&mut self, xs: &[Expr], sc: usize, line: usize, how: &str) {
            for x in xs {
                self.plain(x, sc, line, how);
            }
        }
        fn plain(&mut self, e: &Expr, sc: usize, line: usize, how: &str) {
            match &e.k {
                ExprKind::Id(n) => self.name(n, e, sc, line, how),
                // what it was an instant ago is a value
                ExprKind::Pre { name, init } => {
                    let id = Expr::new(ExprKind::Id(name.clone()), e.span);
                    self.name(name, &id, sc, line, how);
                    if let Some(i) = init {
                        self.plain(i, sc, line, how);
                    }
                }
                ExprKind::Member { o, p, .. } => {
                    if self.view(e, sc).is_some() {
                        self.hit(p, line, how, "");
                    } else if !self.is_props(o, sc) {
                        self.plain(o, sc, line, how);
                    }
                }
                // `props["aria-label"]` is one prop
                ExprKind::Index { o, i, .. } if matches!(i.k, ExprKind::Lit(Lit::Str(_))) && self.is_props(o, sc) => {
                    if let (ExprKind::Lit(Lit::Str(f)), Some(Given::Props { less, views })) = (&i.k, self.given(o, sc)) {
                        if views.contains(f) && !less.contains(f) {
                            self.hit(f, line, how, "");
                        }
                    }
                }
                ExprKind::Omit { e: inner, .. } => {
                    if self.is_props(inner, sc) {
                        let l = self.left(e, sc);
                        if !l.is_empty() {
                            self.hit("props", line, how, &l.join(", "));
                        }
                    } else {
                        self.plain(inner, sc, line, how);
                    }
                }
                // whether one was given is a value like another, wherever it is asked
                ExprKind::Un { op, e: x } => {
                    if !(op == "!" && self.form(x, sc)) {
                        self.plain(x, sc, line, how);
                    }
                }
                ExprKind::Bin { op, l, r } => {
                    if eq_op(op) && self.form(l, sc) && nothing(r) {
                        return;
                    }
                    if !(op == "&&" && self.form(l, sc)) {
                        self.plain(l, sc, line, how);
                    }
                    self.plain(r, sc, line, how);
                }
                ExprKind::If { c, t, f } => {
                    if !self.form(c, sc) {
                        self.plain(c, sc, line, how);
                    }
                    self.plain(t, sc, line, how);
                    self.plain(f, sc, line, how);
                }
                ExprKind::Peek(x) => self.plain(x, sc, line, near(how, "peek")),
                ExprKind::Await { e: x, init, .. } => {
                    self.plain(x, sc, line, how);
                    if let Some(i) = init {
                        self.plain(i, sc, line, how);
                    }
                }
                ExprKind::Latest(x) | ExprKind::Pending(x) | ExprKind::Spread(x) | ExprKind::Throw(x) => self.plain(x, sc, line, how),
                ExprKind::Tpl(parts) => {
                    for p in parts {
                        if let TplPart::Expr(x) = p {
                            self.plain(x, sc, line, how);
                        }
                    }
                }
                ExprKind::Index { o, i, .. } => {
                    self.plain(o, sc, line, how);
                    self.plain(i, sc, line, how);
                }
                ExprKind::Call { f, args, .. } => {
                    self.plain(f, sc, line, near(how, "argument"));
                    self.plains(args, sc, line, near(how, "argument"));
                }
                ExprKind::Arr(items) => self.plains(items, sc, line, near(how, "list")),
                ExprKind::Rec(fields) => {
                    for f in fields {
                        let (Field::Kv { v: x, .. } | Field::Spread(x)) = f;
                        self.plain(x, sc, line, near(how, "record"));
                    }
                }
                ExprKind::Fn { params, body, stmts, .. } => {
                    let ps: Vec<&str> = params.iter().map(String::as_str).collect();
                    let inner = self.sub(sc, &ps);
                    match stmts {
                        Some(ss) => self.stmts(ss, inner, line, near(how, "handler")),
                        None => self.plain(body, inner, line, near(how, "closure")),
                    }
                }
                ExprKind::Draft { seed, body } => {
                    self.plain(seed, sc, line, how);
                    let inner = self.sub(sc, &["d"]);
                    self.stmts(body, inner, line, how);
                }
                ExprKind::Catch { e: x, name, alt, .. } => {
                    self.plain(x, sc, line, how);
                    let inner = self.sub(sc, &name.as_deref().into_iter().collect::<Vec<_>>());
                    self.plain(alt, inner, line, how);
                }
                ExprKind::ServerFn { params, body, .. } => {
                    let ps: Vec<&str> = params.iter().map(String::as_str).collect();
                    let inner = self.sub(sc, &ps);
                    self.stmts(body, inner, line, near(how, "handler"));
                }
                ExprKind::Lit(_) | ExprKind::Use(_) | ExprKind::StyleMap { .. } => {}
            }
        }
        fn name(&mut self, n: &str, id: &Expr, sc: usize, line: usize, how: &str) {
            match self.look(sc, n) {
                Some(g) if g.held() && g.view() => self.hit(Self::held_name(&g), line, how, ""),
                Some(Given::Props { .. }) => {
                    let l = self.left(id, sc);
                    if !l.is_empty() {
                        self.hit("props", line, how, &l.join(", "));
                    }
                }
                _ => {}
            }
        }
        /// A condition: a view in it is asked for.
        fn test(&mut self, c: &Expr, sc: usize, line: usize, how: &str) {
            if self.form(c, sc) {
                return;
            }
            // a choice or a default of views is asked as one is (`if p.l ?? p.r`): each of its arms answers
            if matches!(&c.k, ExprKind::If { .. }) || matches!(&c.k, ExprKind::Bin { op, .. } if op == "??") {
                if self.view(c, sc).is_some() {
                    return self.ve(c, sc, line, how);
                }
            }
            match &c.k {
                ExprKind::Un { op, e } if op == "!" => self.test(e, sc, line, how),
                ExprKind::Bin { op, l, r } if matches!(op.as_str(), "&&" | "||") => {
                    self.test(l, sc, line, how);
                    self.test(r, sc, line, how);
                }
                _ => self.plain(c, sc, line, how),
            }
        }
        /// What is shown, given on or named again: a view, or a choice or a default whose every arm is one or a value.
        fn ve(&mut self, e: &Expr, sc: usize, line: usize, how: &str) {
            if self.form(e, sc) {
                return;
            }
            match &e.k {
                ExprKind::If { c, t, f } => {
                    self.test(c, sc, line, how);
                    self.ve(t, sc, line, how);
                    self.ve(f, sc, line, how);
                }
                ExprKind::Bin { op, l, r } if matches!(op.as_str(), "??" | "||") => {
                    self.ve(l, sc, line, how);
                    self.ve(r, sc, line, how);
                }
                ExprKind::Bin { op, l, r } if op == "&&" => {
                    self.test(l, sc, line, how);
                    self.ve(r, sc, line, how);
                }
                _ => self.plain(e, sc, line, how),
            }
        }
        fn stmts(&mut self, ss: &[Stmt], up: usize, line: usize, how: &str) {
            let sc = self.sub(up, &[]);
            for s in ss {
                let at = if s.line > 0 { s.line as usize } else { line };
                match &s.k {
                    StmtKind::Let { name, e, .. } => {
                        self.plain(e, sc, at, how);
                        self.scs[sc].names.insert(name.clone(), None);
                    }
                    StmtKind::Write { target, e } | StmtKind::Optimistic { target, e } => {
                        for p in &target.path {
                            if let PathSeg::Expr(x) = p {
                                self.plain(x, sc, at, how);
                            }
                        }
                        self.plain(e, sc, at, near(how, "source"));
                    }
                    StmtKind::Expr(e) | StmtKind::Throw(e) => self.plain(e, sc, at, how),
                    StmtKind::Return(e) => {
                        if let Some(e) = e {
                            self.plain(e, sc, at, how);
                        }
                    }
                    StmtKind::Action(body) => self.stmts(body, sc, at, near(how, "handler")),
                    StmtKind::Sif { c, t, f } => {
                        self.test(c, sc, at, how);
                        self.stmts(t, sc, at, how);
                        self.stmts(f, sc, at, how);
                    }
                    StmtKind::For { name, e, body } => {
                        self.plain(e, sc, at, how);
                        let inner = self.sub(sc, &[name.as_str()]);
                        self.stmts(body, inner, at, how);
                    }
                    StmtKind::Try { body, catch_name, handler, fin, .. } => {
                        self.stmts(body, sc, at, how);
                        if let Some(h) = handler {
                            let inner = self.sub(sc, &catch_name.as_deref().into_iter().collect::<Vec<_>>());
                            self.stmts(h, inner, at, how);
                        }
                        if let Some(f) = fin {
                            self.stmts(f, sc, at, how);
                        }
                    }
                    StmtKind::Refresh(_) | StmtKind::Affects(_) => {}
                }
            }
        }
        fn dk(&mut self, ds: &[Decl], sc: usize, line: usize, how: &str) {
            for x in ds {
                let at = if x.line() > 0 { x.line() } else { line };
                match x {
                    // a projection: every arm of what it names
                    Decl::Eq { name, e, .. } => {
                        if self.scs[sc].names.get(name).is_some_and(Option::is_some) {
                            if !self.is_props(e, sc) {
                                self.ve(e, sc, at, how);
                            }
                        } else {
                            self.plain(e, sc, at, how);
                        }
                    }
                    Decl::Source { init, .. } => self.plain(init, sc, at, near(how, "source")),
                    Decl::Fn { params, decls, tail, .. } => {
                        let ps: Vec<&str> = params.iter().map(|p| p.name.as_str()).collect();
                        let inner = self.sub(sc, &ps);
                        let b = self.block(decls, inner);
                        self.dk(decls, b, at, near(how, "closure"));
                        self.plain(tail, b, at, near(how, "closure"));
                    }
                    Decl::Component { props, decls, view, .. } => {
                        let inner = self.sub(sc, &[props.as_str()]);
                        let b = self.block(decls, inner);
                        self.dk(decls, b, at, near(how, "closure"));
                        self.mk(view, b, at);
                    }
                    Decl::Effect { inputs, body, .. } => {
                        self.plains(inputs, sc, at, "effect");
                        self.stmts(body, sc, at, "effect");
                    }
                    Decl::Action { params, body, .. } | Decl::Server { params, body, .. } => {
                        let ps: Vec<&str> = params.iter().map(String::as_str).collect();
                        let inner = self.sub(sc, &ps);
                        self.stmts(body, inner, at, near(how, "handler"));
                    }
                    // a context that holds a view carries it to where it is shown (`{use item}`)
                    Decl::Provide { name, e, .. } if (self.ctx)(name) => {
                        self.ve(e, sc, at, how);
                        let fs = self.fields(e, sc);
                        if !fs.is_empty() {
                            self.out.at.insert(x as *const Decl as usize, fs.clone());
                            self.out.carried.push((name.clone(), fs));
                            if self.views_only(e, sc) {
                                self.out.only.insert(x as *const Decl as usize);
                            }
                        }
                    }
                    Decl::Provide { e, .. } => self.plain(e, sc, at, near(how, "context")),
                    Decl::Context { dflt, .. } => {
                        if let Some(d) = dflt {
                            self.plain(d, sc, at, how);
                        }
                    }
                    Decl::Error { params, msg, .. } => {
                        if let Some(m) = msg {
                            let ps: Vec<&str> = params.iter().map(String::as_str).collect();
                            let inner = self.sub(sc, &ps);
                            self.plain(m, inner, at, how);
                        }
                    }
                    Decl::Import { .. } | Decl::TypeDecl { .. } => {}
                }
            }
        }
        fn inner(&mut self, ds: &[Decl], ms: &[Markup], up: usize, at: usize) {
            let b = self.block(ds, up);
            self.dk(ds, b, at, "value");
            self.mk(ms, b, at);
        }
        fn to(&mut self, tag: &str, attr: &str, e: &Expr, key: usize, sc: usize, at: usize) {
            let Some(f) = self.shows(e, sc) else { return };
            let fs = self.fields(e, sc);
            self.out.at.insert(key, fs);
            if (self.dest)(tag, attr) == Some(false) {
                self.hit(&f, at, "prop", &format!("{attr} of <{tag}>"));
            }
        }
        fn mk(&mut self, ms: &[Markup], sc: usize, line: usize) {
            for m in ms {
                let at = m.line.unwrap_or(line);
                match &m.kind {
                    MarkupKind::Read(e) => {
                        self.ve(e, sc, at, "value");
                        if self.shows(e, sc).is_some() {
                            let fs = self.fields(e, sc);
                            self.out.at.insert(m as *const Markup as usize, fs);
                        }
                    }
                    MarkupKind::El { tag, attrs, children } => {
                        let comp = tag.starts_with(|c: char| c.is_ascii_uppercase()) || shown_in(tag).is_some();
                        for a in attrs {
                            let n = a.name.as_str();
                            let handler = n.starts_with("on") && n[2..].starts_with(|c: char| c.is_ascii_uppercase() || c == ':');
                            if n == "..." && comp && self.is_props(&a.e, sc) {
                                // a spread gives each on under its own name
                                let l = self.left(&a.e, sc);
                                let i = attrs.iter().position(|x| std::ptr::eq(x, a)).unwrap_or(0);
                                let content = children.iter().any(|x| !matches!(&x.kind, MarkupKind::Text(t) if t.trim().is_empty()));
                                for f in &l {
                                    if !attrs[i + 1..].iter().any(|x| x.name == *f) && !(f == "children" && content) && (self.dest)(tag, f) == Some(false) {
                                        self.hit(f, at, "prop", &format!("{f} of <{tag}>"));
                                    }
                                }
                                self.out.at.insert(a as *const Attr as usize, l);
                            }
                            if n == "..." {
                                // a spread of the props gives the views on to a component; an element is none
                                // (an element with no content of its own would be given the children, which one runner shows and another does not)
                                let bare = !comp && self.left(&a.e, sc).iter().any(|f| f == "children") && children.iter().all(|x| matches!(&x.kind, MarkupKind::Text(t) if t.trim().is_empty()));
                                if bare || !self.is_props(&a.e, sc) {
                                    self.plain(&a.e, sc, at, "value");
                                }
                            } else if comp && !handler && n != "ref" {
                                self.ve(&a.e, sc, at, "value");
                                self.to(tag, n, &a.e, a as *const Attr as usize, sc, at);
                            } else {
                                self.plain(&a.e, sc, at, if handler { "handler" } else { "value" });
                            }
                        }
                        if comp {
                            let c: Vec<&Markup> = children.iter().filter(|x| !matches!(&x.kind, MarkupKind::Text(t) if t.trim().is_empty())).collect();
                            if let [Markup { kind: MarkupKind::Read(e), .. }] = c[..] {
                                self.to(tag, "children", e, m as *const Markup as usize, sc, at);
                            }
                        }
                        self.mk(children, sc, at);
                    }
                    MarkupKind::Mif { c, t, t_decls, f, f_decls } => {
                        self.test(c, sc, at, "value");
                        self.inner(t_decls, t, sc, at);
                        self.inner(f_decls, f, sc, at);
                    }
                    MarkupKind::Mfor { name, xs, decls, body } => {
                        self.plain(xs, sc, at, "value");
                        let s2 = self.sub(sc, &[name.as_str()]);
                        self.inner(decls, body, s2, at);
                    }
                    MarkupKind::Mview { params, decls, body, .. } => {
                        let ps: Vec<&str> = params.iter().map(String::as_str).collect();
                        let s2 = self.sub(sc, &ps);
                        self.inner(decls, body, s2, at);
                    }
                    MarkupKind::Loading { on, fallback, decls, body } => {
                        if let Some(o) = on {
                            self.plain(o, sc, at, "value");
                        }
                        self.mk(fallback, sc, at);
                        self.inner(decls, body, sc, at);
                    }
                    MarkupKind::Errored { fallback, decls, body, err_name, .. } => {
                        let s2 = self.sub(sc, &err_name.as_deref().into_iter().collect::<Vec<_>>());
                        self.mk(fallback, s2, at);
                        self.inner(decls, body, sc, at);
                    }
                    MarkupKind::Portal { to, decls, body } => {
                        if let Some(t) = to {
                            self.plain(t, sc, at, "value");
                        }
                        self.inner(decls, body, sc, at);
                    }
                    MarkupKind::Text(_) | MarkupKind::Style(_) => {}
                }
            }
        }
    }
    let mut views = views_of(props_type, types, &[], tparams);
    views.retain(|f| !skip.contains(f));
    let loose = !skip.iter().any(|f| f == "children") && children_say_nothing(props_type, types, tparams);
    let views: std::rc::Rc<HashSet<String>> = views.into();
    let mut root = Sc::default();
    root.names.insert(props.to_string(), Some(Given::Props { less: vec![], views: views.clone() }));
    let mut w = W { scs: vec![root], out: ViewUses::default(), dest, ctx, loose: loose.then_some(views) };
    w.inner(decls, view, 0, 0);
    w.out
}
/// What refuses a view read as a value, and the way that is accepted, by what read it (`how`). `ref/src/modules.ts` `viewNotShown`.
pub fn view_not_shown(comp: &str, props: &str, field: &str, how: &str, of: &str) -> String {
    let v = if field == "props" || field == "view" { format!("{props}.children") } else { format!("{props}.{field}") };
    if field == "props" {
        let first = of.split(", ").next().unwrap_or_default();
        return format!("{comp} is given views in {props} ({of}), and gives {props} whole to what is no component: a view is only shown — take them out first, `{{ {of}, ...rest }} = {props}`, and show each (`{{{first}}}`)");
    }
    let tail = match how {
        "peek" => format!("`peek` keeps nothing of it — show it where it goes, `{{{v}}}`: each place it is shown has its own, made there"),
        "source" => format!("a source does not hold it — show it, `{{{v}}}`; to show it later, keep a source that says when: `{{if open {{ {{{v}}} }}}}`"),
        "effect" => format!("an effect cannot watch it — whether one was given is `{v} != undefined`"),
        "handler" => format!("a handler or an action cannot read it — write a source there and show it under that: `{{if open {{ {{{v}}} }}}}`"),
        "closure" => format!("a closure that answers it is not shown — show `{{{v}}}` there, or give it on as an argument typed `View`: `<Q part={{{v}}} />`"),
        "record" => "a record does not hold it — give each on as an argument typed `View`: `<Q header={…} footer={…} />`".to_string(),
        "list" => format!("a list does not hold it — write them one after the other: `{{{v}}}{{…}}`"),
        "context" => format!("this context does not carry it — one that holds a view does (`context item: View`, `provide item = {v}`, shown by `{{use item}}`); or give it on as an argument typed `View` of the component that shows it (`<Q part={{{v}}} />`)"),
        "argument" => format!("a fn does not take it — a component does: `<Q part={{{v}}} />`"),
        "prop" => format!("{of} takes a value, not a view — give it on to a prop typed `View`, or show it: `{{{v}}}`"),
        _ => format!("it is not read as a value (compared, written out, computed with, kept from one instant to the next) — `{{{v}}}` shows it, `{v} != undefined` asks whether one was given"),
    };
    format!("{comp} is given a view, {}, and a view is only shown: {tail}", if field == "view" { "a prop typed View" } else { field })
}

#[cfg(test)]
mod tests {
    use super::*;
    fn files(fs: &'static [(&'static str, &'static str)]) -> impl Fn(&str) -> Option<String> {
        move |p: &str| fs.iter().find(|(k, _)| *k == p).map(|(_, v)| v.to_string())
    }
    #[test]
    fn a_wire_id_is_the_declarations_own_place() {
        // SV-5a (ruled 2026-11-22): the nearest named package above it, then the path below
        let read = files(&[("/w/app/package.json", r#"{"name":"shop"}"#), ("/w/app/a/package.json", r#"{"type":"module"}"#)]);
        assert_eq!(package_relative("/w/app/a/err.d.rx", &read), "shop/a/err.d.rx");
        assert_eq!(package_relative("/w/app/src/err.d.rx", &read), "shop/src/err.d.rx");
        // no named one: below the nearest package.json, whatever is above that — nested unnamed scopes, a stray one in a
        // home folder — so it is the same from every entry, in every checkout
        let read = files(&[("/w/app/package.json", r#"{"type":"module"}"#), ("/w/app/web/package.json", r#"{"type":"module"}"#), ("/w/app/server/package.json", r#"{"type":"module"}"#)]);
        assert_eq!(package_relative("/w/app/web/err.d.rx", &read), "err.d.rx");
        assert_eq!(package_relative("/w/app/server/err.d.rx", &read), "err.d.rx");
        assert_eq!(package_relative("/w/app/shared/err.d.rx", &read), "shared/err.d.rx");
        let read = files(&[("/home/u/package.json", "{}"), ("/home/u/work/proj/package.json", r#"{"type":"module"}"#)]);
        assert_eq!(package_relative("/home/u/work/proj/err.d.rx", &read), "err.d.rx");
        // no package.json anywhere above: the file's own name
        let read = files(&[]);
        assert_eq!(package_relative("/w/x/err.d.rx", &read), "err.d.rx");
        assert_eq!(package_relative("a/err.d.rx", &read), "err.d.rx");
        let read = files(&[("/w/app/package.json", "{}")]);
        assert_eq!(package_relative("/w/x/err.d.rx", &read), "err.d.rx");
    }
    #[test]
    fn a_wire_id_holds_no_machine_path_and_no_checkout_name() {
        // SV-5a: the only package.json has no name — the id is the same whatever the checkout is called and wherever it is
        for root in ["/private/tmp/x/my-app", "/home/ci/build-101", "/Users/a/dev/proj"] {
            let pj = format!("{root}/package.json");
            let read = move |p: &str| (p == pj).then(|| r#"{"type":"module","private":true}"#.to_string());
            assert_eq!(package_relative(&format!("{root}/err.d.rx"), &read), "err.d.rx");
            assert_eq!(package_relative(&format!("{root}/lib/err.d.rx"), &read), "lib/err.d.rx");
        }
    }
    #[test]
    fn a_wire_id_does_not_depend_on_the_entry_and_two_classes_never_share_one() {
        // SV-5a (ruled 2026-11-22): nested unnamed scopes, each declaring `Gone` in an `err.d.rx`
        const D: &str = "export error Gone\nexport pure fn load(id: string): Promise<string> rejects(Gone)\n";
        const MAIN: &str = "export default component App() {\n  errored fallback(e: Gone) { <p>gone</p> } {\n    loading fallback { <p>…</p> } {\n      v = await load(\"1\")\n      <p>{v}</p>\n    }\n  }\n}\n";
        let fs: Vec<(String, String)> = vec![
            ("/w/app/package.json".into(), r#"{"type":"module"}"#.into()),
            ("/w/app/web/package.json".into(), r#"{"type":"module"}"#.into()),
            ("/w/app/server/package.json".into(), r#"{"type":"module"}"#.into()),
            ("/w/app/web/err.d.rx".into(), D.into()),
            ("/w/app/server/err.d.rx".into(), D.into()),
            ("/w/app/main.rx".into(), format!("import {{ load, Gone }} from \"./web/err.js\"\n{MAIN}")),
            ("/w/app/web/main.rx".into(), format!("import {{ load, Gone }} from \"./err.js\"\n{MAIN}")),
            ("/w/app/server/main.rx".into(), format!("import {{ load, Gone }} from \"../web/err.js\"\n{MAIN}")),
            ("/w/app/server/both.rx".into(), format!("import {{ load, Gone }} from \"../web/err.js\"\nimport {{ Gone as Gone2 }} from \"./err.js\"\n{MAIN}")),
        ];
        let read = |p: &str| fs.iter().find(|(k, _)| k == p).map(|(_, v)| v.clone());
        // the same class, from three entries: one id
        let ids: Vec<String> = ["/w/app/main.rx", "/w/app/web/main.rx", "/w/app/server/main.rx"].iter().map(|e| load_modules(e, &read).unwrap().declaration_ids["/w/app/web/err.d.rx"].clone()).collect();
        assert_eq!(ids, vec!["err.d.rx", "err.d.rx", "err.d.rx"]);
        // two classes that would share it, in one program: refused, with what to do
        let e = load_modules("/w/app/server/both.rx", &read).err().expect("two classes named alike are refused");
        assert_eq!(e.3, "DUPLICATE_WIRE_ID");
        assert!(e.0.contains("\"err.d.rx#Gone\"") && e.0.contains("/w/app/web/err.d.rx") && e.0.contains("\"name\""), "{}", e.0);
        // named, each is its own
        let mut named = fs.clone();
        named[1].1 = r#"{"name":"web"}"#.into();
        let read = |p: &str| named.iter().find(|(k, _)| k == p).map(|(_, v)| v.clone());
        let set = load_modules("/w/app/server/both.rx", &read).unwrap();
        assert_eq!((set.declaration_ids["/w/app/web/err.d.rx"].as_str(), set.declaration_ids["/w/app/server/err.d.rx"].as_str()), ("web/err.d.rx", "err.d.rx"));
    }
    #[test]
    fn a_relative_js_import_is_declared_by_its_whole_name_then_its_stem() {
        // MO-8a: `./old.cjs` by `old.cjs.d.rx` (the name before RFC 23), then `old.d.rx`; `.jsx` alike; `.js` by `x.d.rx`
        let read = files(&[("/w/old.cjs.d.rx", ""), ("/w/old.d.rx", ""), ("/w/v.d.rx", ""), ("/w/lib.d.rx", "")]);
        assert_eq!(beside_declaration("/w/main.rx", "./old.cjs", &read), "/w/old.cjs.d.rx");
        assert_eq!(beside_declaration("/w/main.rx", "./v.jsx", &read), "/w/v.d.rx");
        assert_eq!(beside_declaration("/w/main.rx", "./lib.mjs", &read), "/w/lib.d.rx");
        assert_eq!(beside_declaration("/w/main.rx", "./lib.js", &read), "/w/lib.d.rx");
        assert_eq!(beside_declaration("/w/main.rx", "./api", &read), "/w/api.d.rx");
        let read = files(&[("/w/v.jsx.d.rx", "")]);
        assert_eq!(beside_declaration("/w/main.rx", "./v.jsx", &read), "/w/v.jsx.d.rx");
        assert_eq!(beside_declaration("/w/main.rx", "./old.cjs", &read), "/w/old.d.rx");
        // TypeScript's are JavaScript's (RFC 23): `./x.tsx` as `./x.jsx`, `./x.mts` and `./x.cts` as `./x.mjs` and `./x.cjs`
        let read = files(&[("/w/x.d.rx", ""), ("/w/y.tsx.d.rx", ""), ("/w/y.d.rx", ""), ("/w/z.d.rx", "")]);
        assert_eq!(beside_declaration("/w/main.rx", "./x.tsx", &read), "/w/x.d.rx");
        assert_eq!(beside_declaration("/w/main.rx", "./y.tsx", &read), "/w/y.tsx.d.rx");
        assert_eq!(beside_declaration("/w/main.rx", "./z.mts", &read), "/w/z.d.rx");
        assert_eq!(beside_declaration("/w/main.rx", "./z.cts", &read), "/w/z.d.rx");
        assert_eq!(declaration_names("./x.tsx"), vec!["./x.tsx.d.rx", "./x.d.rx"]);
    }
    /// MO-12e: `export context c from "<module>"` in a declaration names the context that module's declaration declares,
    /// under that declaration's key — found as an import from the declaration's own file would find it, and through a
    /// module that takes it from another. A wrapper's hook is then discharged by the library's provider, and refused
    /// outside it; a context the named module has not, or a module with no declaration, is `NOT_EXPORTED`.
    #[test]
    fn a_declaration_names_another_modules_context() {
        let fs: Vec<(String, String)> = [
            ("/app/rx-types/@demo/query.d.rx", "export context client\nexport component ClientProvider(props: { children?: View }) provides(client)\n"),
            ("/app/src/todos.d.rx", "export context client from \"@demo/query\"\nexport pure fn useTodos(): ref string uses(client)\n"),
            ("/app/src/deep/count.d.rx", "export context client from \"../todos.js\"\nexport pure fn useCount(): ref number uses(client)\n"),
            ("/app/src/typo.d.rx", "export context klient from \"@demo/query\"\nexport pure fn useTypo(): ref number uses(klient)\n"),
            ("/app/src/main.rx", "import { ClientProvider } from \"@demo/query\"\nimport { useTodos } from \"./todos.js\"\nimport { useCount } from \"./deep/count.js\"\ncomponent Todos() {\n  t = useTodos()\n  n = useCount()\n  <p>{t}{n}</p>\n}\nexport default component App() {\n  <ClientProvider><Todos /></ClientProvider>\n}\n"),
            ("/app/src/bare.rx", "import { useCount } from \"./deep/count.js\"\nexport default component App() {\n  n = useCount()\n  <p>{n}</p>\n}\n"),
            ("/app/src/typo.rx", "import { useTypo } from \"./typo.js\"\nexport default component App() {\n  n = useTypo()\n  <p>{n}</p>\n}\n"),
        ]
        .iter()
        .map(|(k, v)| (k.to_string(), v.to_string()))
        .collect();
        let read = |p: &str| fs.iter().find(|(k, _)| k == p).map(|(_, v)| v.clone());
        let codes = |entry: &str| -> Vec<String> { crate::check::check_modules(&load_modules(entry, &read).unwrap(), false).diags.iter().map(|d| d.code.clone()).collect() };
        let set = load_modules("/app/src/main.rx", &read).unwrap();
        let at = |dts: &str| set.declarations[dts].iter().find_map(|d| if let JsDecl::Context { from, resolved, .. } = d { Some((from.clone(), resolved.clone())) } else { None }).unwrap();
        assert_eq!(at("/app/rx-types/@demo/query.d.rx"), (None, None));
        assert_eq!(at("/app/src/todos.d.rx"), (Some("@demo/query".into()), Some("/app/rx-types/@demo/query.d.rx".into())));
        assert_eq!(at("/app/src/deep/count.d.rx"), (Some("../todos.js".into()), Some("/app/rx-types/@demo/query.d.rx".into())));
        assert_eq!(codes("/app/src/main.rx"), Vec::<String>::new());
        assert_eq!(codes("/app/src/bare.rx"), ["CONTEXT_NOT_FOUND"]);
        assert_eq!(codes("/app/src/typo.rx"), ["NOT_EXPORTED", "CONTEXT_NOT_FOUND"]);
        assert!(parse_declarations("export context client from query\n").is_err());
    }

    /// MO-8k, MO-14a (2026-11-24): the nearest folder whose package.json has a name; a scope's is passed over.
    #[test]
    fn a_projects_declarations_are_looked_for_up_to_its_folder() {
        let main = "import { f } from \"kit\"\nexport default component App() { <p>{f(1)}</p> }\n";
        let named = [("/w/app/package.json", "{\"name\":\"app\"}"), ("/w/app/src/package.json", "{\"type\":\"module\"}")];
        let codes = |at: &str, pkg: &[(&str, &str)]| -> Vec<String> {
            let mut fs: Vec<(&str, &str)> = pkg.to_vec();
            fs.extend([("/w/app/src/main.rx", main), (at, "export pure fn f(n: number): number\n")]);
            let read = |p: &str| fs.iter().find(|(k, _)| *k == p).map(|(_, v)| v.to_string());
            crate::check::check_modules(&load_modules("/w/app/src/main.rx", &read).unwrap(), false).diags.iter().map(|d| d.code.clone()).collect()
        };
        assert_eq!(codes("/w/app/rx-types/kit.d.rx", &named), [] as [&str; 0]);
        assert_eq!(codes("/w/rx-types/kit.d.rx", &named), ["IO_IN_REACTIVE"] as [&str; 1]);
        assert_eq!(codes("/w/rx-types/kit.d.rx", &[]), [] as [&str; 0]);
    }
    /// MO-14: `host.d.rx`, found at or above a program — the `.rx` components a JS host renders (a file-based router's
    /// route files), imported by name, and the view it makes of them in a factory's words; checked as the app's view,
    /// what it says on the declaration's line.
    #[test]
    fn a_host_declaration_places_the_components_a_js_host_renders() {
        const HOST: &str = "// what the file router does with the route files\nimport { Layout } from \"./routes/layout.rx\"\nimport { Home } from \"./routes/index.rx\"\nimport { Person, Banner } from \"./routes/person.rx\"\nexport context router from \"./router.js\"\nexport default component provides(router) nests(children in component) = [\n  { component: Layout, children: [{ component: Home }, { component: Person }] }\n]\n";
        const LAYOUT: &str = "import { NotFound } from \"../people.js\"\nexport default component Layout(props: { children?: View }) {\n  errored fallback(e: NotFound) { <p>{e.message}</p> } {\n    loading fallback { <p>loading…</p> } { <main>{props.children}</main> }\n  }\n}\n";
        let app = |host: Option<&str>, layout: &str| -> Vec<(String, String)> {
            let mut fs: Vec<(String, String)> = [
                ("/app/src/router.d.rx", "export context router\nexport pure fn useParams(): { id: string } instantiates uses(router)\n"),
                ("/app/src/people.d.rx", "export error NotFound\nexport pure fn fetchPerson(id: string): Promise<{ name: string }> rejects(NotFound)\n"),
                ("/app/src/routes/layout.rx", layout),
                ("/app/src/routes/index.rx", "export default component Home() { <h1>People</h1> }\n"),
                ("/app/src/routes/person.rx", "import { useParams } from \"../router.js\"\nimport { fetchPerson } from \"../people.js\"\nexport default component Person() {\n  params = useParams()\n  person = await fetchPerson(params.id)\n  <h1>{person.name}</h1>\n}\nexport component Banner() {\n  params = useParams()\n  <p>{params.id}</p>\n}\n"),
            ]
            .iter()
            .map(|(k, v)| (k.to_string(), v.to_string()))
            .collect();
            if let Some(h) = host {
                fs.push(("/app/src/host.d.rx".into(), h.into()));
            }
            fs
        };
        let diags = |fs: &[(String, String)], entry: &str, spa: bool, whole: bool| -> Vec<String> {
            let read = |p: &str| fs.iter().find(|(k, _)| k == p).map(|(_, v)| v.clone());
            crate::check::check_modules_hosts(&load_modules(entry, &read).unwrap(), spa, whole, &[]).diags.iter().map(|d| format!("{}@{}:{}", d.code, d.file.as_deref().unwrap_or(entry).rsplit('/').next().unwrap(), d.line)).collect()
        };
        const PERSON: &str = "/app/src/routes/person.rx";
        let none = Vec::<String>::new();
        // the route files as they are, each a page that relies on its layout and on the router: accepted from any of them
        assert_eq!(diags(&app(Some(HOST), LAYOUT), PERSON, false, false), none);
        assert_eq!(diags(&app(Some(HOST), LAYOUT), "/app/src/routes/layout.rx", false, false), none);
        assert_eq!(diags(&app(Some(HOST), LAYOUT), "/app/src/routes/index.rx", true, false), none);
        // with no declaration, a route file's default component is a mounted view, and nothing is above it
        assert_eq!(diags(&app(None, LAYOUT), PERSON, false, false), ["UNHANDLED_FAILURE@person.rx:6", "CONTEXT_NOT_FOUND@person.rx:4"]);
        // the layout's regions hold its pages: without one, the page's failure (or, in a client-only build, its first load) is the host's
        let no_errored = LAYOUT.replace("  errored fallback(e: NotFound) { <p>{e.message}</p> } {\n    loading fallback { <p>loading…</p> } { <main>{props.children}</main> }\n  }\n", "  loading fallback { <p>loading…</p> } { <main>{props.children}</main> }\n");
        assert_eq!(diags(&app(Some(HOST), &no_errored), PERSON, false, false), ["UNHANDLED_FAILURE@host.d.rx:6"]);
        let no_loading = LAYOUT.replace("loading fallback { <p>loading…</p> } { <main>{props.children}</main> }", "<main>{props.children}</main>");
        assert_eq!(diags(&app(Some(HOST), &no_loading), PERSON, true, false), ["ASYNC_OUTSIDE_LOADING_BOUNDARY@host.d.rx:6"]);
        // a page the host renders beside the layout, not in it; a host that provides no router
        assert_eq!(diags(&app(Some(&HOST.replace("children: [{ component: Home }, { component: Person }] }", "children: [{ component: Home }] }, { component: Person }")), LAYOUT), PERSON, false, false), ["UNHANDLED_FAILURE@host.d.rx:6"]);
        assert_eq!(diags(&app(Some(&HOST.replace(" provides(router)", "")), LAYOUT), PERSON, false, false), ["CONTEXT_NOT_FOUND@host.d.rx:6"]);
        // a component the declaration imports and leaves out of its tree is rendered where no one says: in a whole-program
        // build it is checked under a root of its own (CP-4d), as every export of a module a host renders that is not placed
        assert_eq!(diags(&app(Some(HOST), LAYOUT), PERSON, false, true), ["CONTEXT_NOT_FOUND@person.rx:1"]);
        assert_eq!(diags(&app(Some(&HOST.replace("{ component: Person }] }", "{ component: Person }, { component: Banner }] }")), LAYOUT), PERSON, false, true), none);
        // the tree names what the declaration imports
        assert_eq!(diags(&app(Some(&HOST.replace("component: Home", "component: Nope")), LAYOUT), PERSON, false, false), ["UNBOUND@host.d.rx:6"]);
        for text in ["import Layout from \"./layout.rx\"\n", "import { Layout } from \"@demo/pages.rx\"\n", "import { Layout } from \"/abs/layout.rx\"\n", "export default component provides(router)\n", "export default component = 3\n", "export default fn f()\n", "export default component = []\nexport default component = []\n", "export default component uses(router) = []\n"] {
            assert!(parse_declarations(text).is_err(), "{text}");
        }
        assert!(parse_declarations("import { Layout as L } from \"../pages/layout.rx\"\nexport context router\nexport default component provides(router) nests(children in component) = { component: L }\n").is_ok());
        // lowered text for text, each piece on its line: the declaration's imports, and its tree given to a factory with the row's words
        let (rx, decl) = host_program(HOST, &parse_declarations(HOST).unwrap(), "host.d.rx").unwrap();
        assert_eq!(rx.split('\n').map(str::trim).collect::<Vec<_>>(), ["", "import { Layout } from \"./routes/layout.rx\"", "import { Home } from \"./routes/index.rx\"", "import { Person, Banner } from \"./routes/person.rx\"", "", "import { jsHostFactory } from \"./host.d.rx.host.js\"; export default component JsHost() { <JsHostView /> }; JsHostView = jsHostFactory([", "{ component: Layout, children: [{ component: Home }, { component: Person }] }", "])", ""]);
        assert_eq!(decl, "export context router from \"./router.js\"\nexport pure fn jsHostFactory(tree: unknown): Component provides(router) nests(children in component)\n");
        // a view written over several lines keeps each line: what it says is on the line it starts on, its tree where it was
        let spread = HOST.replace("nests(children in component) = [", "nests(children in component) =\n\n[");
        assert_eq!(host_program(&spread, &parse_declarations(&spread).unwrap(), "host.d.rx").unwrap().0.split('\n').count(), spread.split('\n').count());
        assert_eq!(spread.split('\n').count(), 11);
        assert_eq!(diags(&app(Some(&spread.replace(" provides(router)", "")), LAYOUT), PERSON, false, false), ["CONTEXT_NOT_FOUND@host.d.rx:6"]);
        assert_eq!(diags(&app(Some(&spread), LAYOUT), PERSON, false, false), none);
        // the view's words are on its own line, as a row's are
        assert!(parse_declarations("export default component\n  provides(router) = []\n").is_err());
        // MO-11i: a layout the view nests pages in renders them among its own children — one that renders none is refused
        // (it was accepted, and its pages checked under nothing)
        let outlet_layout = LAYOUT.replace("(props: { children?: View })", "()").replace("{props.children}", "<Outlet />").replacen("import {", "import { Outlet } from \"../router.js\"\nimport {", 1);
        let outlet = |host: &str, layout: &str| -> Vec<(String, String)> {
            let mut fs = app(Some(host), layout);
            for (k, v) in fs.iter_mut() {
                if k == "/app/src/router.d.rx" {
                    v.push_str("export component Outlet(props: {}) uses(router)\nexport component AppRouter(props: {}) provides(router)\n");
                }
            }
            fs
        };
        assert_eq!(diags(&outlet(HOST, &outlet_layout), PERSON, false, false), ["NESTED_NOT_RENDERED@host.d.rx:6"]);
        // MO-14f: a component of the host's own that the declaration imports from JavaScript is one the host renders
        // through — a layout that applies it renders its pages there, under what the layout has around it
        let through = HOST.replacen("export context", "import { Outlet } from \"./router.js\"\nexport context", 1);
        assert_eq!(diags(&outlet(&through, &outlet_layout), PERSON, false, false), none);
        assert_eq!(diags(&outlet(&through, &outlet_layout), "/app/src/routes/layout.rx", true, false), none);
        let beside = outlet_layout.replace("  errored fallback(e: NotFound) { <p>{e.message}</p> } {\n    loading fallback { <p>loading…</p> } { <main><Outlet /></main> }\n  }\n", "  errored fallback(e: NotFound) { <p>{e.message}</p> } { <p>ready</p> }\n  <main><Outlet /></main>\n");
        assert_eq!(diags(&outlet(&through, &beside), PERSON, false, false), ["UNHANDLED_FAILURE@host.d.rx:7"]);
        let unheld = outlet_layout.replace("loading fallback { <p>loading…</p> } { <main><Outlet /></main> }", "<main><Outlet /></main>");
        assert_eq!(diags(&outlet(&through, &unheld), PERSON, true, false), ["ASYNC_OUTSIDE_LOADING_BOUNDARY@host.d.rx:7"]);
        // …and the app's own component, when it is `.rx` and applies the router: the view names it, the host's records its
        // children, and what it has around the router's component holds every page. The router is provided by that
        // component's own row, so a hook above it in the app is still outside the router
        const HELD: &str = "  errored fallback(e: NotFound) { <p>{e.message}</p> } {\n    loading fallback { <p>loading…</p> } { <AppRouter /> }\n  }\n";
        let main = |above: &str, body: &str| format!("import {{ AppRouter }} from \"../router.js\"\nimport {{ useParams }} from \"../router.js\"\nimport {{ NotFound }} from \"../people.js\"\nexport default component App() {{\n{above}{body}}}\n");
        const BARE: &str = "export default component Layout(props: { children?: View }) {\n  <main>{props.children}</main>\n}\n";
        const UNDER: &str = "import { App } from \"./routes/app.rx\"\nimport { Layout } from \"./routes/layout.rx\"\nimport { Home } from \"./routes/index.rx\"\nimport { Person } from \"./routes/person.rx\"\nimport { AppRouter } from \"./router.js\"\nexport default component nests(children in component) = [\n  { component: App, children: [{ component: Layout, children: [{ component: Home }, { component: Person }] }] }\n]\n";
        let entry = |host: &str, main: &str| -> Vec<(String, String)> {
            let mut fs = outlet(host, BARE);
            fs.push(("/app/src/routes/app.rx".into(), main.into()));
            fs
        };
        assert_eq!(diags(&entry(UNDER, &main("", HELD)), PERSON, false, false), none);
        assert_eq!(diags(&entry(UNDER, &main("", HELD)), "/app/src/routes/app.rx", true, false), none);
        assert_eq!(diags(&entry(UNDER, &main("  at = useParams()\n", HELD)), PERSON, false, false), ["CONTEXT_NOT_FOUND@host.d.rx:6"]);
        assert_eq!(diags(&entry(UNDER, &main("", "  errored fallback(e: NotFound) { <p>{e.message}</p> } { <p>ready</p> }\n  loading fallback { <p>…</p> } { <AppRouter /> }\n")), PERSON, false, false), ["UNHANDLED_FAILURE@host.d.rx:6"]);
        assert_eq!(diags(&entry(&UNDER.replace("import { AppRouter } from \"./router.js\"\n", ""), &main("", HELD)), PERSON, false, false), ["NESTED_NOT_RENDERED@host.d.rx:5"]);
        // MO-14f (2026-11-25): an `.rx` component between the layout and the host's own — `Layout` applies `<Frame />`,
        // which applies `<Outlet />` — renders the layout's pages there: under what the frame has around the outlet, and
        // what the layout has around the frame. It was NESTED_NOT_RENDERED on the layout
        const FRAME: &str = "component Frame() {\n  <main><Outlet /></main>\n}\n";
        const HELD_FRAME: &str = "  errored fallback(e: NotFound) { <p>{e.message}</p> } {\n    loading fallback { <p>loading…</p> } { <Frame /> }\n  }\n";
        let via = |frame: &str, body: &str| format!("import {{ Outlet }} from \"../router.js\"\nimport {{ NotFound }} from \"../people.js\"\nexport default component Layout() {{\n{body}}}\n{frame}");
        // declared below the layout that applies it
        assert_eq!(diags(&outlet(&through, &via(FRAME, HELD_FRAME)), PERSON, false, false), none);
        assert_eq!(diags(&outlet(&through, &via(FRAME, HELD_FRAME)), "/app/src/routes/layout.rx", true, false), none);
        // the frame beside the layout's region
        assert_eq!(diags(&outlet(&through, &via(FRAME, "  errored fallback(e: NotFound) { <p>{e.message}</p> } { <p>ready</p> }\n  loading fallback { <p>loading…</p> } { <Frame /> }\n")), PERSON, false, false), ["UNHANDLED_FAILURE@host.d.rx:7"]);
        // the regions are the frame's own
        assert_eq!(diags(&outlet(&through, &via("component Frame() {\n  errored fallback(e: NotFound) { <p>{e.message}</p> } { loading fallback { <p>…</p> } { <main><Outlet /></main> } }\n}\n", "  <Frame />\n")), PERSON, true, false), none);
        // … and beside its outlet they hold nothing
        assert_eq!(diags(&outlet(&through, &via("component Frame() {\n  errored fallback(e: NotFound) { <p>{e.message}</p> } { <p>ready</p> }\n  <main><Outlet /></main>\n}\n", "  <Frame />\n")), PERSON, false, false), ["UNHANDLED_FAILURE@host.d.rx:7"]);
        // two components between
        assert_eq!(diags(&outlet(&through, &via("component Frame() {\n  <Inner />\n}\ncomponent Inner() {\n  <main><Outlet /></main>\n}\n", HELD_FRAME)), PERSON, false, false), none);
        // a frame with no outlet renders none
        assert_eq!(diags(&outlet(&through, &via("component Frame() {\n  <main>no outlet</main>\n}\n", HELD_FRAME)), PERSON, false, false), ["NESTED_NOT_RENDERED@host.d.rx:7"]);
        // a component that renders its own children, given none, is not one the host renders through
        assert_eq!(diags(&outlet(&through, &via("component Frame(props: { children?: View }) {\n  <main>{props.children}</main>\n}\n", HELD_FRAME)), PERSON, false, false), ["NESTED_NOT_RENDERED@host.d.rx:7"]);
        // … nor is the frame, where the declaration does not import the outlet
        assert_eq!(diags(&outlet(HOST, &via(FRAME, HELD_FRAME)), PERSON, false, false), ["NESTED_NOT_RENDERED@host.d.rx:6"]);
        // SV-7d: the pages are placed inside what the frame has around its outlet, as with the outlet written in the layout
        assert_eq!(diags(&outlet(&through, &via("component Frame() {\n  <p><Outlet /></p>\n}\n", HELD_FRAME)), PERSON, false, false), ["CONTENT_MODEL@host.d.rx:7"; 4]);
        assert_eq!(diags(&outlet(&through, &outlet_layout.replace("<main><Outlet /></main>", "<p><Outlet /></p>")), PERSON, false, false).len(), 4);
        {
            // the frame in a module of its own, and the app's own component reaching the router through one
            let far = |frame: &str| -> Vec<(String, String)> {
                let mut fs = outlet(&through, "import { Frame } from \"./frame.rx\"\nimport { NotFound } from \"../people.js\"\nexport default component Layout() {\n  errored fallback(e: NotFound) { <p>{e.message}</p> } {\n    loading fallback { <p>loading…</p> } { <Frame /> }\n  }\n}\n");
                fs.push(("/app/src/routes/frame.rx".into(), frame.into()));
                fs
            };
            assert_eq!(diags(&far("import { Outlet } from \"../router.js\"\nexport component Frame() {\n  <main><Outlet /></main>\n}\n"), PERSON, false, false), none);
            assert_eq!(diags(&far("export component Frame() {\n  <main>none</main>\n}\n"), PERSON, false, false), ["NESTED_NOT_RENDERED@host.d.rx:7"]);
            const SHELL: &str = "component Shell() {\n  <div class=\"shell\"><AppRouter /></div>\n}\n";
            assert_eq!(diags(&entry(UNDER, &(main("", &HELD.replace("<AppRouter />", "<Shell />")) + SHELL)), PERSON, false, false), none);
            assert_eq!(diags(&entry(UNDER, &(main("", "  errored fallback(e: NotFound) { <p>{e.message}</p> } { <p>ready</p> }\n  loading fallback { <p>…</p> } { <Shell /> }\n") + SHELL)), PERSON, false, false), ["UNHANDLED_FAILURE@host.d.rx:6"]);
        }
        // what is imported from JavaScript is a component its module's declaration declares
        let fails = |host: &str| -> &'static str {
            let fs = outlet(host, &outlet_layout);
            let read = |p: &str| fs.iter().find(|(k, _)| k == p).map(|(_, v)| v.clone());
            match load_modules(PERSON, &read) { Ok(_) => "", Err(e) => e.3 }
        };
        assert_eq!([fails(&through.replace("{ Outlet }", "{ Inlet }")), fails(&through.replacen("\"./router.js\"\nexport", "\"./nowhere.js\"\nexport", 1)), fails(&through)], ["NOT_EXPORTED", "NOT_EXPORTED", ""]);
    }

    /// MO-1c: the runtime mounts the entry's default component; another module's is a component like any other, checked
    /// where it is applied.
    #[test]
    fn a_dependencys_default_component_is_mounted_by_no_one() {
        let app = |main: &str| -> Vec<(String, String)> {
            [
                ("/app/people.d.rx", "export error NotFound\nexport pure fn fetchPerson(id: string): Promise<{ name: string }> rejects(NotFound)\n"),
                ("/app/page.rx", "import { fetchPerson } from \"./people.js\"\nexport fn label(n: number) { `#${n}` }\nexport default component Page() {\n  person = await fetchPerson(\"1\")\n  <h1>{person.name}</h1>\n}\n"),
                ("/app/main.rx", main),
            ]
            .iter()
            .map(|(k, v)| (k.to_string(), v.to_string()))
            .collect()
        };
        let diags = |fs: &[(String, String)], entry: &str| -> Vec<String> {
            let read = |p: &str| fs.iter().find(|(k, _)| k == p).map(|(_, v)| v.clone());
            crate::check::check_modules_hosts(&load_modules(entry, &read).unwrap(), false, false, &[]).diags.iter().map(|d| format!("{}@{}:{}", d.code, d.file.as_deref().unwrap_or(entry).rsplit('/').next().unwrap(), d.line)).collect()
        };
        let none = Vec::<String>::new();
        // a module imported for a fn: its default component is applied by no one, and is nobody's failure (it was walked as a mounted view)
        assert_eq!(diags(&app("import { label } from \"./page.rx\"\nexport default component App() { <p>{label(1)}</p> }\n"), "/app/main.rx"), none);
        // applied, it is checked where it is applied; as the entry, it is the mounted view
        assert_eq!(diags(&app("import { Page } from \"./page.rx\"\nexport default component App() { <Page /> }\n"), "/app/main.rx"), ["UNHANDLED_FAILURE@main.rx:2"]);
        assert_eq!(diags(&app("import { Page } from \"./page.rx\"\nimport { NotFound } from \"./people.js\"\nexport default component App() { errored fallback(e: NotFound) { <p>no</p> } { <Page /> } }\n"), "/app/main.rx"), none);
        assert_eq!(diags(&app(""), "/app/page.rx"), ["UNHANDLED_FAILURE@page.rx:5"]);
    }

    /// MO-11u: `renders(H)` after a fn: the components it is given are checked among H's children, at every application
    /// of H in the program (in whichever module), with what H itself uses and provides; with none, under a root of their own.
    #[test]
    fn renders_names_the_component_a_fns_components_render_beneath() {
        let fs: Vec<(&str, &str)> = vec![
            ("/app/kit.d.rx", "export context region\nexport error Lost\nexport pure fn load(): Promise<string> rejects(Lost)\nexport component Region(props: { children?: View }) provides(region)\nexport component Toaster(props: {}) uses(region)\nexport component Toast(props: { children?: View }) uses(region)\nexport fn toast(message: string | Component): number renders(Toaster)\nexport pure fn createRoute(options: { component: Component }): any renders(Toaster)\nexport fn plain(message: string | Component): number\nexport component Markdown(props: { builtins?: { Heading?: Component<{ depth: number }> }; tabs?: Component[]; table?: Record<string, Component>; one?: Component; meta?: { title: string }; children?: View })\n"),
            ("/app/theme.rx", "export context accent: string\n"),
            ("/app/saved.rx", "import { toast, Toast } from \"./kit.js\"\nimport { accent } from \"./theme.rx\"\ncomponent Saved() {\n  <Toast><b class={use accent}>saved</b></Toast>\n}\nexport action save() {\n  toast(Saved)\n}\n"),
            ("/app/frame.rx", "import { Toaster, Region } from \"./kit.js\"\nimport { accent } from \"./theme.rx\"\nexport component Frame(props: { children?: View }) {\n  provide accent = \"dark\"\n  {props.children}\n  <Region><Toaster /></Region>\n}\nexport component Bare(props: { children?: View }) {\n  {props.children}\n  <Region><Toaster /></Region>\n}\n"),
            ("/app/good.rx", "import { toast, plain, createRoute, Toast, Toaster, Region } from \"./kit.js\"\ncontext accent: string\ncomponent Saved() {\n  <Toast><b class={use accent}>saved</b></Toast>\n}\nexport default component App() {\n  provide accent = \"dark\"\n  <button onClick={() => { toast(Saved) }}>save</button>\n  <Region><Toaster /></Region>\n}\n"),
            ("/app/beside.rx", "import { toast, plain, createRoute, Toast, Toaster, Region } from \"./kit.js\"\ncontext accent: string\ncomponent Saved() {\n  <Toast><b class={use accent}>saved</b></Toast>\n}\ncomponent Editor() {\n  provide accent = \"dark\"\n  <button onClick={() => { toast(Saved) }}>save</button>\n}\nexport default component App() {\n  <Editor />\n  <Region><Toaster /></Region>\n}\n"),
            ("/app/two.rx", "import { toast, plain, createRoute, Toast, Toaster, Region } from \"./kit.js\"\ncontext accent: string\ncomponent Saved() {\n  <Toast><b class={use accent}>saved</b></Toast>\n}\ncomponent Themed() {\n  provide accent = \"dark\"\n  <Region><Toaster /></Region>\n}\nexport default component App() {\n  <button onClick={() => { toast(Saved) }}>save</button>\n  <Themed />\n  <Region><Toaster /></Region>\n}\n"),
            ("/app/nosite.rx", "import { toast, plain, createRoute, Toast, Toaster, Region } from \"./kit.js\"\ncontext accent: string\ncomponent Saved() {\n  <Toast><b class={use accent}>saved</b></Toast>\n}\nexport default component App() {\n  provide accent = \"dark\"\n  <button onClick={() => { toast(Saved) }}>save</button>\n}\n"),
            ("/app/noword.rx", "import { toast, plain, createRoute, Toast, Toaster, Region } from \"./kit.js\"\ncontext accent: string\ncomponent Saved() {\n  <Toast><b class={use accent}>saved</b></Toast>\n}\nexport default component App() {\n  provide accent = \"dark\"\n  <button onClick={() => { plain(Saved) }}>save</button>\n  <Region><Toaster /></Region>\n}\n"),
            ("/app/route.rx", "import { toast, plain, createRoute, Toast, Toaster, Region } from \"./kit.js\"\ncontext accent: string\ncomponent Saved() {\n  <Toast><b class={use accent}>saved</b></Toast>\n}\nroute = createRoute({ component: Saved })\nexport default component App() {\n  provide accent = \"dark\"\n  <p>{route ? \"made\" : \"\"}</p>\n  <Region><Toaster /></Region>\n}\n"),
            ("/app/routebad.rx", "import { toast, plain, createRoute, Toast, Toaster, Region } from \"./kit.js\"\ncontext accent: string\ncomponent Saved() {\n  <Toast><b class={use accent}>saved</b></Toast>\n}\nroute = createRoute({ component: Saved })\nexport default component App() {\n  <p>{route ? \"made\" : \"\"}</p>\n  <Region><Toaster /></Region>\n}\n"),
            ("/app/unbound.rx", "import { toast, plain, createRoute, Toast, Toaster, Region } from \"./kit.js\"\ncontext accent: string\ncomponent Saved() {\n  <Toast><b class={use accent}>saved</b></Toast>\n}\nexport default component App() {\n  <button onClick={() => { createRoute({ component: Saved }) }}>save</button>\n}\n"),
            ("/app/fails.rx", "import { toast, load, Toaster, Region } from \"./kit.js\"\ncomponent Loads() {\n  text = await load()\n  <i>{text}</i>\n}\nexport default component App() {\n  <button onClick={() => { toast(Loads) }}>save</button>\n  loading fallback { <p>…</p> } { <Region><Toaster /></Region> }\n}\n"),
            ("/app/held.rx", "import { toast, load, Toaster, Region } from \"./kit.js\"\ncomponent Loads() {\n  text = await load()\n  <i>{text}</i>\n}\nexport default component App() {\n  <button onClick={() => { toast(Loads) }}>save</button>\n  errored fallback(e) { <p>lost</p> } { loading fallback { <p>…</p> } { <Region><Toaster /></Region> } }\n}\n"),
            ("/app/waits.rx", "import { toast, load, Toaster, Region } from \"./kit.js\"\ncomponent Loads() {\n  text = await load()\n  <i>{text}</i>\n}\nexport default component App() {\n  <button onClick={() => { toast(Loads) }}>save</button>\n  errored fallback(e) { <p>lost</p> } { <Region><Toaster /></Region> }\n}\n"),
            ("/app/cross.rx", "import { save } from \"./saved.rx\"\nimport { Frame } from \"./frame.rx\"\nexport default component App() {\n  <Frame><button onClick={() => { save() }}>save</button></Frame>\n}\n"),
            ("/app/crossbad.rx", "import { save } from \"./saved.rx\"\nimport { Bare } from \"./frame.rx\"\nexport default component App() {\n  <Bare><button onClick={() => { save() }}>save</button></Bare>\n}\n"),
        ];
        let read = |p: &str| fs.iter().find(|(k, _)| *k == p).map(|(_, v)| v.to_string());
        let diags = |name: &str, spa: bool| -> Vec<String> {
            let entry = format!("/app/{name}.rx");
            crate::check::check_modules_hosts(&load_modules(&entry, &read).unwrap(), spa, false, &[]).diags.iter().map(|d| format!("{}@{}:{}", d.code, d.file.as_deref().unwrap_or(&entry).rsplit('/').next().unwrap(), d.line)).collect()
        };
        // a toast that reads the app's context and the library's region, under the app's provision and a toaster in its region
        assert_eq!(diags("good", false), [] as [&str; 0]);
        // the context provided above the call, not above the toaster
        assert_eq!(diags("beside", false), ["CONTEXT_NOT_FOUND@beside.rx:8"] as [&str; 1]);
        // two toasters, one without the provision: which one the call is for is the library's to say
        assert_eq!(diags("two", false), [] as [&str; 0]);
        // no toaster in the program: held to what the toaster itself uses (the region's context is credited, the app's is not)
        assert_eq!(diags("nosite", false), ["CONTEXT_NOT_FOUND@nosite.rx:8"] as [&str; 1]);
        // the row without the word: a root of its own (MO-11s), nothing credited
        assert_eq!(diags("noword", false), ["CONTEXT_NOT_FOUND@noword.rx:4", "CONTEXT_NOT_FOUND@noword.rx:4"] as [&str; 2]);
        // a `pure` fn with the word is a constructor (`instantiates` inferred), bound at the module's top
        assert_eq!(diags("route", false), [] as [&str; 0]);
        // ... and its component is held to the same
        assert_eq!(diags("routebad", false), ["CONTEXT_NOT_FOUND@routebad.rx:6"] as [&str; 1]);
        // ... so it is bound, not called from a handler
        assert_eq!(diags("unbound", false), ["INSTANTIATION_NOT_BOUND@unbound.rx:7", "CONTEXT_NOT_FOUND@unbound.rx:7"] as [&str; 2]);
        // a failure, with no errored region above the toaster
        assert_eq!(diags("fails", false), ["UNHANDLED_FAILURE@fails.rx:7"] as [&str; 1]);
        // ... and with one
        assert_eq!(diags("held", false), [] as [&str; 0]);
        // a client-only build: the first load is held by the region above the toaster
        assert_eq!(diags("held", true), [] as [&str; 0]);
        // ... and is not, with none
        assert_eq!(diags("waits", true), ["ASYNC_OUTSIDE_LOADING_BOUNDARY@waits.rx:7"] as [&str; 1]);
        // the call in one module, the toaster in another: judged at the program
        assert_eq!(diags("cross", false), [] as [&str; 0]);
        // ... on the line of the call, in its module
        assert_eq!(diags("crossbad", false), ["CONTEXT_NOT_FOUND@saved.rx:7"] as [&str; 1]);
        // MO-9: the requirement and the place are rows of the modules' printed signatures, and read back
        let c = crate::check::check_modules(&load_modules("/app/cross.rx", &read).unwrap(), false);
        let (saved, frame) = (crate::signature::print_signature(&c.sigs["/app/saved.rx"]), crate::signature::print_signature(&c.sigs["/app/frame.rx"]));
        assert_eq!(saved, "//@ signature saved.rx (09-modules MO-3, MO-13a). Sources are read-only to importers (MO-2).\nexport action save\nexport renders ./kit.d.rx#Toaster from toast:7 uses(./theme.rx#accent)\n");
        assert_eq!(frame, "//@ signature frame.rx (09-modules MO-3, MO-13a). Sources are read-only to importers (MO-2).\nexport component Frame(props: { children: provides(./theme.rx#accent) }) hosts(./kit.d.rx#Toaster provides(./kit.d.rx#region, ./theme.rx#accent)) shape(children-at )\nexport component Bare(props: { children }) hosts(./kit.d.rx#Toaster provides(./kit.d.rx#region)) shape(children-at )\n");
        assert_eq!(crate::signature::print_signature(&crate::signature::parse_signature(&saved, "/app/saved.rx").unwrap()), saved);
        assert_eq!(crate::signature::print_signature(&crate::signature::parse_signature(&frame, "/app/frame.rx").unwrap()), frame);
        // the word names one component, of the same file; a factory has no use for it
        for (bad, why) in [
            ("export fn toast(c: Component): number renders(Toaster)\n", "declares no component Toaster"),
            ("export component Toaster(props: {})\nexport fn toast(c: Component): number renders(toaster)\n", "renders(H)"),
            ("export component A(props: {})\nexport fn toast(c: Component): number renders(A) renders(A)\n", "twice"),
            ("export component A(props: {})\nexport pure fn make(c: Component): Component renders(A)\n", "hands back a Component"),
            ("export component A(props: {})\nexport fn toast(c: Component): number renders(A, theme)\n", "renders(H)"),
        ] {
            let e = crate::parse::parse_declarations(bad).expect_err(bad);
            assert!(e.0.contains(why), "{bad} -> {}", e.0);
        }
        let ds = crate::parse::parse_declarations("export component Toast.List(props: {})\nexport fn show(c: Component): number renders(Toast.List)\nexport pure fn createRoute(o: any): any renders(Toast.List)\n").unwrap();
        let words: Vec<(Option<String>, bool)> = ds.iter().filter_map(|d| if let crate::parse::JsDecl::Fn { renders, instantiates, .. } = d { Some((renders.clone(), *instantiates)) } else { None }).collect();
        assert_eq!(words, [(Some("Toast.List".to_string()), false), (Some("Toast.List".to_string()), true)]);
    }
    /// MO-8t (2026-11-25): `export fn toaster.show(…)` beside `export const toaster` (or beside `export fn toast`): a fn's
    /// row, word for word; the call `toaster.show(x)` is a call of that fn. A method with no row is read by its type (a
    /// declared value's, as a declared result's), and a method of an io import is io.
    #[test]
    fn a_method_of_a_declared_value_has_a_row_of_its_own() {
        const KIT: &str = "export context region\nexport error Refused\nexport component Toaster(props: {}) uses(region)\nexport component Region(props: { children?: View }) provides(region)\nexport const toaster: { show(c: Component): number; dismiss(id: number): void; count(): number; flush(): Promise<void>; \"odd-name\"?(): void; get<T>(k: string): T }\nexport fn toaster.show(c: Component): number renders(Toaster)\nexport fn toast(m: string): number\nexport fn toast.success(m: string): number\nexport pure fn toast.history(): string[]\nexport pure fn toast.load(id: string): Promise<string> rejects(Refused)\n";
        let load = |main: &str| {
            let fs = vec![("/app/kit.d.rx".to_string(), KIT.to_string()), ("/app/main.rx".to_string(), format!("import {{ toaster, toast, Toaster, Region }} from \"./kit.js\"\n{main}"))];
            let read = move |p: &str| fs.iter().find(|(k, _)| k == p).map(|(_, v)| v.clone());
            load_modules("/app/main.rx", &read).unwrap()
        };
        let diags = |main: &str| -> Vec<String> { crate::check::check_modules_hosts(&load(main), false, false, &[]).diags.iter().map(|d| format!("{}@{}", d.code, d.line)).collect() };
        let app = |body: &str| format!("export default component App() {{\n{body}}}\n");
        let none: [&str; 0] = [];
        // a pure method anywhere, an io one from a handler; a method with no row that answers a value is a read
        assert_eq!(diags(&app("  past = toast.history()\n  <button onClick={() => { toast.success(\"a\") }}>{past.length}{toaster.count()}{toaster.get(\"k\")}</button>\n")), none);
        // the row says `fn`: io
        assert_eq!(diags(&app("  <p>{toast.success(\"a\")}</p>\n")), ["IO_IN_REACTIVE@3"]);
        // called where the handler is given
        assert_eq!(diags(&app("  <button onClick={toast.success(\"a\")}>x</button>\n")), ["IO_IN_REACTIVE@3"]);
        // no row: its type answers nothing (a method written `m(): void`, as a field `m: () => void` is)
        assert_eq!(diags(&app("  <p>{toaster.dismiss(1)}</p>\n")), ["IO_IN_REACTIVE@3"]);
        // … or a promise
        assert_eq!(diags(&app("  <p>{toaster.flush()}</p>\n")), ["IO_IN_REACTIVE@3"]);
        // no row, of a declared `fn`: io as its object is
        assert_eq!(diags(&app("  <p>{toast.dismiss(1)}</p>\n")), ["IO_IN_REACTIVE@3"]);
        // a method's `rejects(E)`
        assert_eq!(diags(&app("  v = await toast.load(\"1\")\n  <p>{v}</p>\n")), ["UNHANDLED_FAILURE@4"]);
        // `renders(Toaster)` on the method: the component is checked beneath <Toaster>
        const SAVED: &str = "context accent: string\ncomponent Saved() {\n  <i class={use accent}>s</i>\n}\n";
        assert_eq!(diags(&format!("{SAVED}{}", app("  provide accent = \"x\"\n  <button onClick={() => { toaster.show(Saved) }}>x</button>\n  <Region><Toaster /></Region>\n"))), none);
        assert_eq!(diags(&format!("{SAVED}{}", app("  <button onClick={() => { toaster.show(Saved) }}>x</button>\n  <Region><Toaster /></Region>\n"))), ["CONTEXT_NOT_FOUND@7"]);
        // the object is the import by its scope: under another binding of the name the member is that binding's (a loop's
        // variable, a parameter, a local), and a declaration that shadows the import is MO-1d's refusal, said once
        assert_eq!(diags(&app("  <ul>{for toast in [\"a\"] { <li>{toast}{toast.success(\"a\")}</li> }}</ul>\n")), none);
        assert_eq!(diags(&app("  <ul>{for t in [\"a\"] { <li>{toast.success(t)}</li> }}</ul>\n")), ["IO_IN_REACTIVE@3"]);
        assert_eq!(diags(&app("  <button onClick={(toast) => { toast.success(\"a\") }}>{[1].map((toast) => toast.success)}</button>\n")), none);
        assert_eq!(diags(&format!("component Inner() {{\n  toast = {{ success: (m) => m }}\n  <p>{{toast.success(\"a\")}}</p>\n}}\n{}", app("  <Inner />\n"))), ["SHADOWED_IMPORT@3"]);
        // a method of an import with no declaration is io as the import is; of a `pure` import, pure
        {
            let read = |p: &str| (p == "/app/main.rx").then(|| "import { notify } from \"./undeclared.js\"\nimport pure { read } from \"./undeclared.js\"\nexport default component App() {\n  <p>{notify.success(\"a\")}{read.all()}</p>\n}\n".to_string());
            let d: Vec<String> = crate::check::check_modules_hosts(&load_modules("/app/main.rx", &read).unwrap(), false, false, &[]).diags.iter().map(|d| format!("{}@{}", d.code, d.line)).collect();
            assert_eq!(d, ["IO_IN_REACTIVE@4"]);
        }
        // the loader names each mention by its row: the callee is the name `toaster.show`; a method with no row stays a member
        {
            let set = load(&app("  <button onClick={() => { toaster.show(Toaster); toaster.dismiss(1) }}>x</button>\n"));
            let text = set.programs["/app/main.rx"].to_json().to_string();
            assert_eq!([text.contains("{\"k\":\"id\",\"name\":\"toaster.show\"}"), text.contains("\"p\":\"dismiss\""), text.contains("\"p\":\"show\"")], [true, true, false]);
        }
        // the rows: one step from a `const` or a `fn` the same file declares
        for (bad, why) in [
            ("export fn toaster.show(c: Component): number\n", "declares no const or fn toaster"),
            ("export component Toast(props: {})\nexport fn Toast.show(): void\n", "declares no const or fn Toast"),
            ("export const a: {}\nexport fn a.b.c(): void\n", "one step"),
            ("export const a: {}\nexport fn a.b(): void\nexport fn a.b(): void\n", "declared again"),
            ("export const a: {}\nexport pure fn a.b(draft xs: number[]): void\n", "not `pure`"),
        ] {
            let msg = parse_declarations(bad).err().map(|e| e.0).unwrap_or_default();
            assert!(msg.contains(why), "{bad}: {msg}");
        }
        let rows: Vec<(String, bool, Option<String>, Option<Vec<String>>)> = parse_declarations(KIT).unwrap().iter().filter_map(|d| if let JsDecl::Fn { name, pure, renders, rejects, .. } = d { Some((name.clone(), *pure, renders.clone(), rejects.clone())) } else { None }).collect();
        assert_eq!(rows, [("toaster.show".to_string(), false, Some("Toaster".to_string()), None), ("toast".to_string(), false, None, None), ("toast.success".to_string(), false, None, None), ("toast.history".to_string(), true, None, None), ("toast.load".to_string(), true, None, Some(vec!["Refused".to_string()]))]);
        // a method in a record type is the field it is
        let t = "{ go(to: string): void; get<T>(k: string): T; plain: number; \"q\"?(): Promise<void>; readonly ro(a: { x: (n: number) => void }): string }";
        let step = |f: &str| crate::check::ty_step(t, &crate::check::TStep::Field(f.to_string()));
        assert_eq!([step("go"), step("get"), step("plain"), step("q"), step("ro"), step("none")], [Some("(to: string) => void".to_string()), Some("(k: string) => T".to_string()), Some("number".to_string()), Some("() => Promise<void>".to_string()), Some("(a: { x: (n: number) => void }) => string".to_string()), None]);
    }


    /// MO-11c (2026-11-24): a JS component's prop whose declared type holds a `Component` inside a record or an array takes
    /// the components written in the literal it is given, each applied among the application's children.
    #[test]
    fn a_component_inside_a_record_or_an_array_in_a_prop_is_a_value_there() {
        let fs: Vec<(&str, &str)> = vec![
            ("/app/kit.d.rx", "export context region\nexport error Lost\nexport pure fn load(): Promise<string> rejects(Lost)\nexport component Region(props: { children?: View }) provides(region)\nexport component Toaster(props: {}) uses(region)\nexport component Toast(props: { children?: View }) uses(region)\nexport fn toast(message: string | Component): number renders(Toaster)\nexport pure fn createRoute(options: { component: Component }): any renders(Toaster)\nexport fn plain(message: string | Component): number\nexport component Markdown(props: { builtins?: { Heading?: Component<{ depth: number }> }; tabs?: Component[]; table?: Record<string, Component>; one?: Component; meta?: { title: string }; children?: View })\n"),
            ("/app/md.rx", "import { Markdown } from \"./kit.js\"\ncontext accent: string\ncomponent Heading() {\n  <h2 class={use accent}>x</h2>\n}\ncomponent Plain() {\n  <p>y</p>\n}\nexport default component App() {\n  provide accent = \"dark\"\n  <Markdown builtins={{ Heading: Heading }} tabs={[Plain, Heading]} table={{ h1: Heading, deep: [Plain] }} one={Plain}>{\"# hi\"}</Markdown>\n}\n"),
            ("/app/mdbad.rx", "import { Markdown } from \"./kit.js\"\ncontext accent: string\ncomponent Heading() {\n  <h2 class={use accent}>x</h2>\n}\ncomponent Plain() {\n  <p>y</p>\n}\nexport default component App() {\n  <Markdown builtins={{ Heading: Heading }}>{\"# hi\"}</Markdown>\n}\n"),
            ("/app/mdmeta.rx", "import { Markdown } from \"./kit.js\"\ncontext accent: string\ncomponent Heading() {\n  <h2 class={use accent}>x</h2>\n}\ncomponent Plain() {\n  <p>y</p>\n}\nexport default component App() {\n  <Markdown meta={{ title: \"x\", icon: Plain }} />\n}\n"),
            ("/app/mdone.rx", "import { Markdown } from \"./kit.js\"\ncontext accent: string\ncomponent Heading() {\n  <h2 class={use accent}>x</h2>\n}\ncomponent Plain() {\n  <p>y</p>\n}\nexport default component App() {\n  <Markdown one={{ a: Plain }} />\n}\n"),
            ("/app/mdname.rx", "import { Markdown } from \"./kit.js\"\ncontext accent: string\ncomponent Heading() {\n  <h2 class={use accent}>x</h2>\n}\ncomponent Plain() {\n  <p>y</p>\n}\nexport default component App() {\n  tabs = [Plain]\n  <Markdown tabs={tabs} />\n}\n"),
            ("/app/mdnamed.rx", "import { Markdown } from \"./kit.js\"\ncontext accent: string\ncomponent Heading() {\n  <h2 class={use accent}>x</h2>\n}\ncomponent Plain() {\n  <p>y</p>\n}\nbuiltins = { Heading: Heading }\nexport default component App() {\n  provide accent = \"dark\"\n  tabs = [Plain, Heading]\n  <Markdown builtins={builtins} tabs={tabs} />\n  <Markdown tabs={tabs} />\n}\n"),
            ("/app/mdnamedbad.rx", "import { Markdown } from \"./kit.js\"\ncontext accent: string\ncomponent Heading() {\n  <h2 class={use accent}>x</h2>\n}\ncomponent Plain() {\n  <p>y</p>\n}\nbuiltins = { Heading: Heading }\nexport default component App() {\n  <Markdown builtins={builtins} />\n}\n"),
            ("/app/mdelse.rx", "import { Markdown, plain } from \"./kit.js\"\ncontext accent: string\ncomponent Heading() {\n  <h2 class={use accent}>x</h2>\n}\ncomponent Plain() {\n  <p>y</p>\n}\nexport default component App() {\n  tabs = [Plain]\n  first = tabs[0]\n  <Markdown tabs={tabs} />\n}\n"),
            ("/app/mdcall.rx", "import { Markdown, plain } from \"./kit.js\"\ncontext accent: string\ncomponent Heading() {\n  <h2 class={use accent}>x</h2>\n}\ncomponent Plain() {\n  <p>y</p>\n}\nexport default component App() {\n  tabs = [Plain]\n  <Markdown tabs={tabs} />\n  <button onClick={() => { plain(tabs) }}>x</button>\n}\n"),
            ("/app/mdshadow.rx", "import { Markdown } from \"./kit.js\"\ncontext accent: string\ncomponent Heading() {\n  <h2 class={use accent}>x</h2>\n}\ncomponent Plain() {\n  <p>y</p>\n}\nexport default component App() {\n  tabs = [Plain]\n  <Markdown tabs={tabs} />\n  for tabs in [[1]] { <i>{tabs.length}</i> }\n}\n"),
            ("/app/mdexport.rx", "import { Markdown } from \"./kit.js\"\ncontext accent: string\ncomponent Heading() {\n  <h2 class={use accent}>x</h2>\n}\ncomponent Plain() {\n  <p>y</p>\n}\nexport tabs = [Plain]\nexport default component App() {\n  <Markdown tabs={tabs} />\n}\n"),
            ("/app/mdundeclared.rx", "import { Markdown } from \"./kit.js\"\ncontext accent: string\ncomponent Heading() {\n  <h2 class={use accent}>x</h2>\n}\ncomponent Plain() {\n  <p>y</p>\n}\nexport default component App() {\n  <Markdown other={{ a: Plain }} />\n}\n"),
        ];
        let read = |p: &str| fs.iter().find(|(k, _)| *k == p).map(|(_, v)| v.to_string());
        let diags = |name: &str, spa: bool| -> Vec<String> {
            let entry = format!("/app/{name}.rx");
            crate::check::check_modules_hosts(&load_modules(&entry, &read).unwrap(), spa, false, &[]).diags.iter().map(|d| format!("{}@{}:{}", d.code, d.file.as_deref().unwrap_or(&entry).rsplit('/').next().unwrap(), d.line)).collect()
        };
        // a record, a list, a table and a nested list of components, and a direct one
        assert_eq!(diags("md", false), [] as [&str; 0]);
        // checked as applied there: the heading's context is not above the component
        assert_eq!(diags("mdbad", false), ["CONTEXT_NOT_FOUND@mdbad.rx:4"] as [&str; 1]);
        // a record in a prop whose type holds no component
        assert_eq!(diags("mdmeta", false), ["COMPONENT_AS_VALUE@mdmeta.rx:10"] as [&str; 1]);
        // a record in a prop typed `Component`
        assert_eq!(diags("mdone", false), ["COMPONENT_AS_VALUE@mdone.rx:10"] as [&str; 1]);
        // (2026-11-25) a list bound to a name and given only to such a prop is read as the literal
        assert_eq!(diags("mdname", false), [] as [&str; 0]);
        // … a module's binding and a component's, the second given to two applications
        assert_eq!(diags("mdnamed", false), [] as [&str; 0]);
        // … checked as applied where it is given
        assert_eq!(diags("mdnamedbad", false), ["CONTEXT_NOT_FOUND@mdnamedbad.rx:4"] as [&str; 1]);
        // … read elsewhere too (`tabs[0]`): a value
        assert_eq!(diags("mdelse", false), ["COMPONENT_AS_VALUE@mdelse.rx:10"] as [&str; 1]);
        // … given to a fn too
        assert_eq!(diags("mdcall", false), ["COMPONENT_AS_VALUE@mdcall.rx:10"] as [&str; 1]);
        assert_eq!(diags("mdshadow", false), [] as [&str; 0]); // a second binding of the name (a loop's variable) is another name: a mention is the name's by its scope (2026-11-26)
        // … exported: a signature says nothing of what a value holds
        assert_eq!(diags("mdexport", false), ["COMPONENT_AS_VALUE@mdexport.rx:9"] as [&str; 1]);
        // an undeclared prop
        assert_eq!(diags("mdundeclared", false), ["COMPONENT_AS_VALUE@mdundeclared.rx:10"] as [&str; 1]);
        for (t, holds) in [
            ("{ Heading?: Component<{ depth: number }> }", true),
            ("Component[]", true),
            ("Record<string, Component>", true),
            ("Partial<{ a: Component }> | undefined", true),
            ("readonly [Component, string]", true),
            ("Component", false),
            ("string | Component", false),
            ("(c: Component) => void", false),
            ("{ render: (c: Component) => View }", false),
            ("{ title: string }", false),
            ("Array<{ view: Component; path: string }>", true),
        ] {
            assert_eq!(crate::parse::holds_component(t, false, 0), holds, "{t}");
        }
    }
    /// MO-13a, MO-13b: `//@ signature` on a declaration a JS import finds makes it the .rx module's signature (MO-9b)
    #[test]
    fn a_marked_declaration_is_read_as_a_signature() {
        let marks: Vec<bool> = ["//@ signature x.rx\nexport a", "\n// built\n//@signature\nexport a", "//@ signatures\nexport a", "export a\n//@ signature", "// signature\nexport a", ""].iter().map(|s| is_printed_signature(s)).collect();
        assert_eq!(marks, [true, true, false, false, false, false]);
        assert_eq!(relative_module("/app/src/main.rx", "/app/node_modules/kit/dist/index.rx"), "../node_modules/kit/dist/index.rx");
        assert_eq!(relative_module("main.rx", "node_modules/kit/dist/index.rx"), "./node_modules/kit/dist/index.rx");
        assert_eq!(relative_module("/app/main.rx", "/app/vendor/x.rx"), "./vendor/x.rx");
        assert_eq!(relative_module("a/b/main.rx", "a/x.rx"), "../x.rx");
        let rows = "export pure fn load(id)\nexport source n := …\nexport component Badge(props: {}) uses(./theme.rx#theme) shape(roots b)\n";
        let pkg = |marked: bool| -> Vec<(String, String)> {
            [
                ("/app/node_modules/kit/package.json", r#"{"name":"kit","exports":{".":{"browser":"./dist/index.js","default":"./dist/index.js"},"./theme":"./dist/theme.js"}}"#.to_string()),
                ("/app/node_modules/kit/dist/index.d.rx", if marked { format!("//@ signature index.rx\n{rows}") } else { "export pure fn load(id: string): Promise<number>\n".to_string() }),
                ("/app/node_modules/kit/dist/theme.d.rx", "//@ signature theme.rx\nexport context theme: string\nexport component Themed(props: { children: provides(./theme.rx#theme) }) shape(roots div; children-at div)\n".to_string()),
                ("/app/vendor/kit.d.rx", format!("//@ signature kit.rx\n{rows}")),
                ("/app/main.rx", "import { load } from \"kit\"\nexport default component App() {\n  v = await load(\"a\")\n  <p>{v}</p>\n}\n".to_string()),
                ("/app/write.rx", "import { n } from \"kit\"\nexport default component App() {\n  <button onClick={() => { n := 1 }}>{n}</button>\n}\n".to_string()),
                ("/app/bare.rx", "import { Badge } from \"kit\"\nexport default component App() {\n  <Badge />\n}\n".to_string()),
                ("/app/themed.rx", "import { Badge } from \"kit\"\nimport { Themed, theme } from \"kit/theme\"\ncomponent Own() {\n  provide theme = \"x\"\n  <Badge />\n}\nexport default component App() {\n  <Themed><Badge /></Themed>\n  <Own />\n}\n".to_string()),
                ("/app/local.rx", "import { n, Badge } from \"./vendor/kit.js\"\nexport default component App() {\n  <p>{n}</p>\n}\n".to_string()),
            ]
            .into_iter()
            .map(|(k, v)| (k.to_string(), v))
            .collect()
        };
        let codes = |entry: &str, marked: bool| -> Vec<String> {
            let fs = pkg(marked);
            let read = |p: &str| fs.iter().find(|(k, _)| k == p).map(|(_, v)| v.clone());
            let set = load_modules(entry, &read).unwrap();
            crate::check::check_modules(&set, false).diags.iter().map(|d| d.code.clone()).collect()
        };
        // the marker: an .rx import in everything but its specifier — resolved to the module the signature stands for
        let fs = pkg(true);
        let read = |p: &str| fs.iter().find(|(k, _)| k == p).map(|(_, v)| v.clone());
        let set = load_modules("/app/main.rx", &read).unwrap();
        let Decl::Import { resolved, .. } = &set.programs["/app/main.rx"].decls[0] else { panic!("an import") };
        assert_eq!(resolved.as_deref(), Some("/app/node_modules/kit/dist/index.rx"));
        assert_eq!(set.signatures.keys().collect::<Vec<_>>(), ["/app/node_modules/kit/dist/index.rx"]);
        assert!(set.declarations.is_empty());
        assert_eq!(codes("/app/main.rx", true), Vec::<String>::new()); // MO-9b: `rejects(…)` absent — nothing that rejects
        assert_eq!(codes("/app/main.rx", false), ["UNHANDLED_FAILURE"]); // MO-8a: unmarked, the same row is a JS fn's, and absent is Error
        assert_eq!(codes("/app/write.rx", true), ["WRITE_TO_NON_SOURCE"]); // MO-2a across the package boundary
        assert_eq!(codes("/app/bare.rx", true), ["CONTEXT_NOT_FOUND"]); // MO-13b: `./theme.rx#theme` is the package's own module
        assert_eq!(codes("/app/themed.rx", true), Vec::<String>::new()); // … provided by its component, and by the app with the context it exports
        let local = load_modules("/app/local.rx", &read).unwrap(); // beside a relative JS module (MO-8a), the same
        assert_eq!(local.signatures.keys().collect::<Vec<_>>(), ["/app/vendor/kit.rx"]);
        assert!(crate::check::check_modules(&local, false).diags.is_empty());
    }
}

/// MO-12e: where each context a declaration takes from another module (`export context c from "<module>"`) is declared:
/// that module's declaration file, found as an import of it from this file would find it (MO-8k, MO-10c), and followed
/// while it too takes the context from elsewhere. `None` is left where no declaration declares it (`NOT_EXPORTED`).
pub fn context_sources(dts: &str, ds: &mut [JsDecl], read: &dyn Fn(&str) -> Option<String>) {
    for d in ds.iter_mut() {
        let JsDecl::Context { name, from: Some(from), resolved, .. } = d else { continue };
        let (mut at, mut spec) = (dts.to_string(), from.clone());
        for _ in 0..8 {
            let target = if spec.starts_with('.') || spec.starts_with('/') { Some(beside_declaration(&at, &spec, read)) } else { declaration_for(&at, &spec, read) };
            let Some(target) = target else { break };
            let Some(src) = read(&target) else { break };
            if is_printed_signature(&src) {
                break; // an .rx module's context is imported and used by its name (MO-7)
            }
            let Ok(theirs) = parse_declarations(&src) else { break };
            match theirs.iter().find_map(|x| if let JsDecl::Context { name: n, from, .. } = x { (n == name).then(|| from.clone()) } else { None }) {
                Some(None) => {
                    *resolved = Some(target);
                    break;
                }
                Some(Some(next)) => {
                    at = target;
                    spec = next;
                }
                None => break,
            }
        }
    }
}

/// MO-11t: what a module's emitters need to know of a component given by name to a declared JS component's prop typed
/// `View` — the props that take a view, by the tag as the module writes it (an alias, a member), and the names that are
/// components here. The checker has both from its own symbols; the compiled module and the TSX projection write the
/// component applied (`fallback={<Empty />}`), which this decides.
#[derive(Debug, Default, Clone)]
pub struct ViewProps {
    props: HashMap<String, HashSet<String>>,
    comps: HashSet<String>,
}
impl ViewProps {
    pub fn of(set: &ModuleSet, decls: &[Decl]) -> ViewProps {
        let mut out = ViewProps::default();
        let made = |ds: &[Decl], name: &str| crate::emit::made_component_in(ds, name, &set.declarations);
        for d in decls {
            match d {
                Decl::Component { name, .. } => {
                    out.comps.insert(name.clone());
                }
                Decl::Eq { name, .. } if made(decls, name) => {
                    out.comps.insert(name.clone());
                }
                Decl::Import { names, resolved: Some(r), .. } => {
                    for n in names {
                        let in_source = set.programs.get(r).is_some_and(|p| p.decls.iter().any(|x| matches!(x, Decl::Component { name, .. } if *name == n.name)) || made(&p.decls, &n.name));
                        let in_signature = set.signatures.get(r).and_then(|s| s.exports.get(&n.name)).is_some_and(|x| matches!(x, crate::signature::ExportSig::Comp { .. }));
                        if in_source || in_signature {
                            out.comps.insert(n.alias.clone());
                        }
                    }
                }
                Decl::Import { names, declared: Some(dp), .. } => {
                    let Some(ds) = set.declarations.get(dp) else { continue };
                    for n in names {
                        for x in ds {
                            let JsDecl::Comp { name, props, .. } = x else { continue };
                            // MO-11q: a member is written after the name its object is imported under
                            let Some(rest) = name.strip_prefix(n.name.as_str()).filter(|r| r.is_empty() || r.starts_with('.')) else { continue };
                            if rest.is_empty() {
                                out.comps.insert(n.alias.clone());
                            }
                            let views: HashSet<String> = props.iter().filter(|p| p.view).map(|p| p.name.clone()).collect();
                            if !views.is_empty() {
                                out.props.insert(format!("{}{}", n.alias, rest), views);
                            }
                        }
                    }
                }
                _ => {}
            }
        }
        out
    }
    /// The component `attr={e}` of `<tag>` gives by name to a prop that takes a view, if it does.
    pub fn given<'e>(&self, tag: &str, attr: &str, e: &'e Expr) -> Option<&'e str> {
        let ExprKind::Id(n) = &e.k else { return None };
        (self.props.get(tag).is_some_and(|v| v.contains(attr)) && self.comps.contains(n)).then_some(n.as_str())
    }
}
