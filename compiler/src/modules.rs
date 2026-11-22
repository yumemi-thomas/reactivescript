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
            let Decl::Import { from, line, resolved, declared, declared_errors, declared_error_fields, declared_pure, declared_side, .. } = d else { continue };
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
        self.programs.insert(path.to_string(), p);
        self.sources.insert(path.to_string(), src);
        self.state.insert(path.to_string(), State::Done);
        self.order.push(path.to_string());
        Ok(())
    }
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
fn load(entry: &str, read: &dyn Fn(&str) -> Option<String>, recover: bool) -> Result<ModuleSet, ParseError> {
    let mut l = Loader { read, programs: HashMap::new(), order: vec![], diags: vec![], declarations: IndexMap::new(), declaration_uses: vec![], declaration_ids: HashMap::new(), wire_ids: HashMap::new(), signatures: IndexMap::new(), printed: Default::default(), sources: HashMap::new(), state: HashMap::new(), recover, parse_errors: vec![] };
    l.visit(entry, &[])?;
    Ok(ModuleSet { entry: entry.to_string(), programs: l.programs, order: l.order, diags: l.diags, declarations: l.declarations, declaration_uses: l.declaration_uses, declaration_ids: l.declaration_ids, signatures: l.signatures, sources: l.sources, parse_errors: l.parse_errors })
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
