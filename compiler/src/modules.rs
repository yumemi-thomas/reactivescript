//! 09-modules: a program is a set of `.rx` modules (`ref/src/modules.ts`). The loader resolves each `.rx` import to a path,
//! parses every module once, and orders them dependencies first (MO-1). A cycle is refused (MO-5).

use crate::ast::{Decl, Expr, ExprKind, Program};
use crate::check::Diagnostic;
use crate::parse::{parse_declarations, parse_program, JsDecl, ParseError};
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
        let t = raw.trim();
        if t.is_empty() {
            continue;
        }
        if let Some(rest) = t.strip_prefix("//@") {
            if let Some(after) = rest.trim_start().strip_prefix("signature") {
                if after.is_empty() || after.starts_with(char::is_whitespace) {
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
/// MO-8k: where a package import's declaration is found, first match wins: the project's `rx-types/<spec>.d.rx` (in the
/// importer's directory or one above it), the package's own beside the file it resolves to (MO-10c), a shared
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
    let up = |rel: &str| -> Option<String> {
        let mut i = dirs.len() as i64;
        while i >= lo {
            let mut parts: Vec<&str> = dirs[..i as usize].to_vec();
            parts.push(rel);
            let f = parts.join("/");
            if read(&f).is_some() {
                return Some(f);
            }
            i -= 1;
        }
        None
    };
    let shared = seg[..n].join("/").trim_start_matches('@').replacen('/', "__", 1);
    let sub = if seg.len() > n { seg[n..].join("/") } else { "index".to_string() };
    up(&format!("rx-types/{spec}.d.rx"))
        .or_else(|| package_declaration(from_file, spec, read).filter(|f| read(f).is_some()))
        .or_else(|| up(&format!("node_modules/@rx-types/{shared}/{sub}.d.rx")))
        .or_else(|| up(&format!("node_modules/.rx-types/{spec}.d.rx")))
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
        name_methods(&mut p, &self.declarations);
        self.programs.insert(path.to_string(), p);
        self.sources.insert(path.to_string(), src);
        self.state.insert(path.to_string(), State::Done);
        self.order.push(path.to_string());
        Ok(())
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
    load(entry, read, false)
}
/// CP-8e: an editor's load. Each module is parsed recovering (`parse_program_recovering`), its errors in `parse_errors`;
/// a declaration file that does not parse is still an error.
pub fn load_modules_recovering(entry: &str, read: &dyn Fn(&str) -> Option<String>) -> Result<ModuleSet, ParseError> {
    load(entry, read, true)
}
/// MO-14: with a host declaration at or above the entry's folder, the program that stands for the host's view is loaded
/// beside the entry's (`host`), with the modules it imports (`hosted`) and the components it places (`placed`).
fn load(entry: &str, read: &dyn Fn(&str) -> Option<String>, recover: bool) -> Result<ModuleSet, ParseError> {
    let mut set = load_program(entry, read, recover)?;
    let dirs: Vec<&str> = entry.split('/').collect();
    let dirs = &dirs[..dirs.len() - 1];
    let lo = if entry.starts_with('/') { 1 } else { 0 };
    let mut found = None;
    for i in (lo..=dirs.len()).rev() {
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
    let mut hs = load_program(&host_entry, &over, recover).map_err(|e| ParseError(e.0.replace(&host_entry, &file).replace(&host_decl, &file), None, Some(e.2.filter(|f| *f != host_entry && *f != host_decl).unwrap_or_else(|| file.clone())), e.3))?;
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
fn load_program(entry: &str, read: &dyn Fn(&str) -> Option<String>, recover: bool) -> Result<ModuleSet, ParseError> {
    let mut l = Loader { read, programs: HashMap::new(), order: vec![], diags: vec![], declarations: IndexMap::new(), declaration_uses: vec![], declaration_ids: HashMap::new(), wire_ids: HashMap::new(), signatures: IndexMap::new(), printed: Default::default(), sources: HashMap::new(), state: HashMap::new(), recover, parse_errors: vec![] };
    l.visit(entry, &[])?;
    Ok(ModuleSet { entry: entry.to_string(), programs: l.programs, order: l.order, diags: l.diags, declarations: l.declarations, declaration_uses: l.declaration_uses, declaration_ids: l.declaration_ids, signatures: l.signatures, sources: l.sources, parse_errors: l.parse_errors, host: None, through: HashSet::new(), under: HashSet::new(), hosted: HashSet::new(), placed: HashSet::new() })
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
        // two toasters, one without the provision: every application is held to it
        assert_eq!(diags("two", false), ["CONTEXT_NOT_FOUND@two.rx:11"] as [&str; 1]);
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
