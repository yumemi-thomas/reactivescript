//! 09-modules: a program is a set of `.rx` modules (`ref/src/modules.ts`). The loader resolves each `.rx` import to a path,
//! parses every module once, and orders them dependencies first (MO-1). A cycle is refused (MO-5).

use crate::ast::{Decl, Program};
use crate::check::Diagnostic;
use crate::parse::{parse_declarations, parse_program, JsDecl, ParseError};
use crate::signature::{parse_signature, ModSig};
use indexmap::IndexMap;
use std::collections::HashMap;

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
    /// SV-5a: each declaration's identity, the same from every entry and every checkout: its path from the folder of the
    /// nearest package.json above it, after that package's name (`app/src/err.d.rx`); none when no package.json is found
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
    signatures: IndexMap<String, ModSig>,
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
/// SV-5a: `file` named from the nearest folder above it whose package.json has a name, after that name: what a declared
/// error class is identified by, so a server and a client built from different entries, or in checkouts at different
/// paths, name it alike. A package.json with no name (a `{"type":"module"}` scope) names nothing: two such scopes side
/// by side would both give `err.d.rx`, so it is passed over, and with no named one above, the path is kept from the
/// outermost package.json's folder, that folder's own name first (`app/a/err.d.rx`, `app/b/err.d.rx`). None when no
/// package.json is above it.
pub fn package_relative(file: &str, read: &dyn Fn(&str) -> Option<String>) -> Option<String> {
    let segs: Vec<&str> = file.split('/').collect();
    let lo = if file.starts_with('/') { 1 } else { 0 };
    let mut i = segs.len() as i64 - 1;
    let mut outermost: Option<usize> = None;
    while i >= lo {
        let dir = segs[..i as usize].join("/");
        let pj = if dir.is_empty() { "package.json".to_string() } else { format!("{dir}/package.json") };
        if let Some(text) = read(&pj) {
            let name = serde_json::from_str::<serde_json::Value>(&text).ok().and_then(|v| v.get("name").and_then(|n| n.as_str()).map(str::to_string));
            if let Some(n) = name.filter(|n| !n.is_empty()) {
                return Some(format!("{n}/{}", segs[i as usize..].join("/")));
            }
            outermost = Some(i as usize);
        }
        i -= 1;
    }
    let at = outermost?;
    let from = if at as i64 > lo { at - 1 } else { at };
    Some(segs[from..].join("/"))
}
static PKG_EXT: std::sync::LazyLock<regex::Regex> = std::sync::LazyLock::new(|| regex::Regex::new(r"\.(m?js|cjs|jsx|ts|tsx)$").unwrap());

fn replace_js_ext(from: &str) -> String {
    for ext in [".mjs", ".js", ".ts"] {
        if let Some(s) = from.strip_suffix(ext) {
            return s.to_string();
        }
    }
    from.to_string()
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
                let dts = pkg_dts.unwrap_or_else(|| join_path(path, &(replace_js_ext(from) + ".d.rx")));
                if !self.declarations.contains_key(&dts) {
                    if let Some(src) = (self.read)(&dts) {
                        let ds = parse_declarations(&src).map_err(|e| ParseError(format!("{}: {}", dts, e.0), e.1, Some(dts.clone()), e.3))?;
                        self.declarations.insert(dts.clone(), ds);
                        if let Some(id) = package_relative(&dts, &*self.read) {
                            self.declaration_ids.insert(dts.clone(), id);
                        }
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
    let mut l = Loader { read, programs: HashMap::new(), order: vec![], diags: vec![], declarations: IndexMap::new(), declaration_uses: vec![], declaration_ids: HashMap::new(), signatures: IndexMap::new(), sources: HashMap::new(), state: HashMap::new(), recover, parse_errors: vec![] };
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
    fn unnamed_package_scopes_side_by_side_name_their_classes_apart() {
        // SV-5a: two `{"type":"module"}` scopes with no name, each declaring `err.d.rx#Gone`
        let read = files(&[("/w/app/a/package.json", r#"{"type":"module"}"#), ("/w/app/b/package.json", r#"{"type":"module"}"#)]);
        let a = package_relative("/w/app/a/err.d.rx", &read).unwrap();
        let b = package_relative("/w/app/b/err.d.rx", &read).unwrap();
        assert_ne!(a, b);
        assert_eq!((a.as_str(), b.as_str()), ("a/err.d.rx", "b/err.d.rx"));
        // under an unnamed project root: kept from the root's folder
        let read = files(&[("/w/app/package.json", "{}"), ("/w/app/a/package.json", r#"{"type":"module"}"#), ("/w/app/b/package.json", r#"{"type":"module"}"#)]);
        assert_eq!(package_relative("/w/app/a/err.d.rx", &read).unwrap(), "app/a/err.d.rx");
        assert_eq!(package_relative("/w/app/b/err.d.rx", &read).unwrap(), "app/b/err.d.rx");
        // a named package above wins, wherever the unnamed scope is
        let read = files(&[("/w/app/package.json", r#"{"name":"shop"}"#), ("/w/app/a/package.json", r#"{"type":"module"}"#)]);
        assert_eq!(package_relative("/w/app/a/err.d.rx", &read).unwrap(), "shop/a/err.d.rx");
        let read = files(&[("/w/app/package.json", r#"{"name":"shop"}"#)]);
        assert_eq!(package_relative("/w/app/src/err.d.rx", &read).unwrap(), "shop/src/err.d.rx");
        assert_eq!(package_relative("/w/x/err.d.rx", &read), None);
    }
}
