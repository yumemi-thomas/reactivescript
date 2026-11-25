//! Which file an import loads, under each host that loads it (DESIGN.md, *Files*): Node's resolution and Vite's. A case
//! that is not written here is `Unknown`, never a guess. Files are asked of the host (`Read`): text, and a path's real one.
use serde_json::Value;
use std::collections::HashMap;

pub type Read<'r> = dyn Fn(&str) -> Option<String> + 'r;

/// How a module is loaded: the conditions an `exports` map is asked with, and whose rules a path is found by.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct Host {
    pub name: &'static str,
    pub node: bool,
    /// Whether Solid's build there is the browser's.
    pub browser: bool,
    conds: &'static [&'static str],
}
macro_rules! host { ($n:literal, $node:literal, $br:literal, $($c:literal)*) => { Host { name: $n, node: $node, browser: $br, conds: &[$($c),*] } } }
pub const HOSTS: [Host; 9] = [
    host!("node", true, false, "node" "import" "module-sync" "node-addons"),
    host!("client dev", false, true, "module" "browser" "development" "import"),
    host!("client", false, true, "module" "browser" "production" "import"),
    host!("client dev, solid", false, true, "solid" "module" "browser" "development" "import"),
    host!("client, solid", false, true, "solid" "module" "browser" "production" "import"),
    host!("ssr dev", false, false, "module" "node" "development" "import"),
    host!("ssr", false, false, "module" "node" "production" "import"),
    host!("ssr dev, solid", false, false, "solid" "module" "node" "development" "import"),
    host!("ssr, solid", false, false, "solid" "module" "node" "production" "import"),
];

/// Every condition those hosts ask with.
pub const READ: [&str; 8] = ["node", "module-sync", "node-addons", "module", "browser", "development", "production", "solid"];
impl Host {
    /// A host that asks with these conditions, and `import`.
    pub fn with(conds: &[String]) -> Host {
        thread_local! { static SETS: std::cell::RefCell<HashMap<String, &'static [&'static str]>> = Default::default(); }
        let key = conds.join(" ");
        let conds: &'static [&'static str] = SETS.with(|s| *s.borrow_mut().entry(key).or_insert_with(|| Box::leak(conds.iter().map(|c| &*Box::leak(c.clone().into_boxed_str())).chain(["import"]).collect::<Vec<&'static str>>().into_boxed_slice())));
        Host { name: "another", node: false, browser: conds.contains(&"browser"), conds }
    }
}
impl Host {
    fn asks_browser(&self) -> bool { self.conds.contains(&"browser") }
    pub fn said(&self) -> String { self.conds.join(" ") }
}
/// Every path a target may be.
pub fn leaves(v: &Value, out: &mut Vec<String>) { match v { Value::String(s) => out.push(s.clone()), Value::Array(a) => for x in a { leaves(x, out); }, Value::Object(o) => for x in o.values() { leaves(x, out); }, _ => {} } }
/// The conditions a package's maps ask about.
pub fn conditions(pj: &Value, out: &mut std::collections::BTreeSet<String>) {
    fn walk(v: &Value, out: &mut std::collections::BTreeSet<String>) {
        match v {
            Value::Object(o) => for (k, x) in o { if !k.starts_with('.') && !k.starts_with('#') { out.insert(k.clone()); } walk(x, out); },
            Value::Array(a) => for x in a { walk(x, out); },
            _ => {}
        }
    }
    walk(&pj["exports"], out);
    walk(&pj["imports"], out);
}

#[derive(Clone, PartialEq, Eq, Debug)]
pub enum Found {
    File(String),
    /// No such file, or a case not written here: what is imported from it is not known.
    Unknown(String),
    /// No such file.
    Missing(String),
    /// This host cannot load the import at all, so no program runs there.
    Never,
}

pub struct Resolver<'r> {
    read: &'r Read<'r>,
    text: HashMap<String, Option<std::rc::Rc<str>>>,
    json: HashMap<String, Option<std::rc::Rc<Value>>>,
    real: HashMap<String, String>,
}

pub fn dirname(p: &str) -> &str {
    match p.rfind('/') { Some(0) => "/", Some(i) => &p[..i], None => "." }
}
pub fn join(dir: &str, rel: &str) -> String {
    let base = if rel.starts_with('/') { String::new() } else { dir.to_string() };
    let mut out: Vec<&str> = vec![];
    for s in base.split('/').chain(rel.split('/')) {
        match s { "" | "." => {} ".." => { out.pop(); } s => out.push(s) }
    }
    format!("/{}", out.join("/"))
}
const EXT: [&str; 7] = [".mjs", ".js", ".mts", ".ts", ".jsx", ".tsx", ".json"];

impl<'r> Resolver<'r> {
    pub fn new(read: &'r Read<'r>) -> Self { Resolver { read, text: HashMap::new(), json: HashMap::new(), real: HashMap::new() } }
    pub fn text(&mut self, f: &str) -> Option<std::rc::Rc<str>> {
        if let Some(t) = self.text.get(f) { return t.clone(); }
        let t = (self.read)(f).map(|s| std::rc::Rc::from(s.as_str()));
        self.text.insert(f.to_string(), t.clone());
        t
    }
    /// Every file of a folder and those in it (of packages in it, none): the host answers it for a name that begins with \u{1}.
    pub fn list(&mut self, dir: &str) -> Option<Vec<String>> { (self.read)(&format!("\u{1}{dir}")).map(|s| s.lines().map(String::from).collect()) }
    fn exists(&mut self, f: &str) -> bool { self.text(f).is_some() }
    fn json(&mut self, f: &str) -> Option<std::rc::Rc<Value>> {
        if let Some(t) = self.json.get(f) { return t.clone(); }
        let v = self.text(f).and_then(|t| serde_json::from_str::<Value>(&t).ok()).map(std::rc::Rc::new);
        self.json.insert(f.to_string(), v.clone());
        v
    }
    /// A path's real one (a linked package is found where it is): the host answers it for a name that begins with NUL.
    pub fn real(&mut self, f: &str) -> String {
        if let Some(r) = self.real.get(f) { return r.clone(); }
        let r = (self.read)(&format!("\0{f}")).unwrap_or_else(|| f.to_string());
        self.real.insert(f.to_string(), r.clone());
        r
    }
    fn file(&mut self, f: &str) -> Found { if self.exists(f) { Found::File(self.real(f)) } else { Found::Unknown(format!("{f} is not found")) } }

    /// The nearest package.json at or above a folder.
    pub fn package_of(&mut self, dir: &str) -> Option<(String, std::rc::Rc<Value>)> {
        let mut d = dir.to_string();
        loop {
            if let Some(v) = self.json(&format!("{d}/package.json")) { return Some((d, v)); }
            if d == "/" || !d.contains('/') { return None; }
            d = dirname(&d).to_string();
            if d.ends_with("/node_modules") { return None; }
        }
    }

    pub fn resolve(&mut self, h: Host, spec: &str, from_dir: &str) -> Found {
        if spec.starts_with('.') || spec.starts_with('/') { return self.path(h, &join(from_dir, spec), from_dir, spec); }
        if spec.contains(['?', '\\', '%', ':', '\0']) { return Found::Unknown(format!("{spec}: not a path that is followed")); }
        if spec.starts_with('#') {
            let Some((dir, pj)) = self.package_of(from_dir) else { return Found::Unknown(format!("{spec}: no package")) };
            return match target(&pj["imports"], spec, h.conds) {
                Target::Path(p) if p.starts_with("./") => self.exact(h, &join(&dir, &p)),
                Target::Path(_) => Found::Unknown(format!("{spec} is another package's")),
                _ => Found::Unknown(format!("{spec} is not found")),
            };
        }
        let n = if spec.starts_with('@') { 2 } else { 1 };
        let parts: Vec<&str> = spec.split('/').collect();
        if parts.len() < n { return Found::Unknown(format!("{spec}: no package")); }
        let name = parts[..n].join("/");
        let sub = if parts.len() > n { format!("./{}", parts[n..].join("/")) } else { ".".into() };
        // the package itself, by its own name
        if let Some((dir, pj)) = self.package_of(from_dir) {
            if pj["name"].as_str() == Some(&name) && !pj["exports"].is_null() { return self.within(h, &dir, &pj, &sub, spec); }
        }
        let mut d = from_dir.to_string();
        loop {
            if !d.ends_with("/node_modules") {
                let at = format!("{}/node_modules/{name}", if d == "/" { "" } else { &d });
                if let Some(pj) = self.json(&format!("{at}/package.json")) { return self.within(h, &at, &pj, &sub, spec); }
            }
            if d == "/" || !d.contains('/') { return Found::Unknown(format!("{spec} is not installed")); }
            d = dirname(&d).to_string();
        }
    }

    /// A subpath of an installed package.
    fn within(&mut self, h: Host, dir: &str, pj: &Value, sub: &str, spec: &str) -> Found {
        let dir = self.real(&format!("{dir}/package.json"));
        let dir = dirname(&dir).to_string();
        let browser = &pj["browser"];
        if h.asks_browser() && browser.as_object().is_some_and(|o| !o.is_empty()) { return Found::Unknown(format!("{spec}: its package.json has a `browser` map")); }
        if !pj["exports"].is_null() {
            let map = &pj["exports"];
            let dots = map.as_object().is_some_and(|o| o.keys().any(|k| k.starts_with('.')));
            let t = if dots { target(map, sub, h.conds) } else if sub == "." { pick(map, h.conds, None) } else { Target::None };
            return match t {
                Target::Path(p) if p.starts_with("./") && !p.contains("/../") => self.exact(h, &join(&dir, &p)),
                Target::Path(p) => Found::Unknown(format!("{spec} is {p}")),
                // (Vite falls back on main fields for the entry where the map has no answer: not followed)
                _ if h.node => Found::Never,
                _ => Found::Unknown(format!("{spec} is not exported under these conditions")),
            };
        }
        if sub != "." { return self.path(h, &join(&dir, sub), &dir, spec); }
        if h.node {
            let Some(main) = pj["main"].as_str() else { return self.exact(h, &format!("{dir}/index.js")) };
            let at = join(&dir, main);
            return if self.exists(&at) { self.exact(h, &at) } else { Found::Unknown(format!("{spec}: its `main` is not a file")) };
        }
        let fields: &[&str] = if h.asks_browser() { &["browser", "module", "jsnext:main", "jsnext"] } else { &["module", "jsnext:main", "jsnext"] };
        let entry = fields.iter().find_map(|f| pj[*f].as_str()).or(pj["main"].as_str()).unwrap_or("index.js").to_string();
        let at = join(&dir, &entry);
        if self.exists(&at) { self.exact(h, &at) } else { Found::Unknown(format!("{spec}: its entry is not a file")) }
    }

    fn exact(&mut self, h: Host, f: &str) -> Found {
        if !self.exists(f) { return Found::Missing(format!("{f} is not found")); }
        if f.ends_with(".cjs") || f.ends_with(".json") || f.ends_with(".d.ts") || f.ends_with(".d.mts") { return Found::Unknown(format!("{f} is no ES module")); }
        if h.node && (f.ends_with(".jsx") || f.ends_with(".tsx")) { return Found::Never; }
        self.file(f)
    }

    /// A path written as one: Node takes the file it names; Vite also an extension left off, and a folder's index.
    fn path(&mut self, h: Host, at: &str, from_dir: &str, spec: &str) -> Found {
        if h.asks_browser() {
            if let Some((_, pj)) = self.package_of(from_dir) { if pj["browser"].as_object().is_some_and(|o| !o.is_empty()) { return Found::Unknown(format!("{spec}: its package has a `browser` map")); } }
        }
        if !spec.ends_with('/') && self.exists(at) { return self.exact(h, at); }
        // (TypeScript's own writing of a path: `./x.js` for `x.ts`)
        if h.node { return Found::Never; }
        for (js, ts) in [(".js", [".ts", ".tsx"]), (".mjs", [".mts", ".mts"]), (".jsx", [".tsx", ".tsx"])] {
            if let Some(b) = at.strip_suffix(js) { for t in ts { let f = format!("{b}{t}"); if self.exists(&f) { return self.exact(h, &f); } } }
        }
        if !spec.ends_with('/') { for e in EXT { let f = format!("{at}{e}"); if self.exists(&f) { return self.exact(h, &f); } } }
        if self.exists(&format!("{at}/package.json")) { return Found::Unknown(format!("{spec} is a folder with a package.json")); }
        for e in EXT { let f = format!("{at}/index{e}"); if self.exists(&f) { return self.exact(h, &f); } }
        Found::Unknown(format!("{spec} is not found from {from_dir}"))
    }
}

enum Target { Path(String), None, Null }

/// The target of a key of an `exports` or `imports` map: the key itself, else the pattern Node takes (PATTERN_KEY_COMPARE).
fn target(map: &Value, key: &str, conds: &[&str]) -> Target {
    let Some(o) = map.as_object() else { return Target::None };
    if !key.contains('*') { if let Some(v) = o.get(key) { return pick(v, conds, None); } }
    let mut best: Option<(&str, &Value, String)> = None;
    for (k, v) in o {
        let Some(star) = k.find('*') else { continue };
        let (pre, post) = (&k[..star], &k[star + 1..]);
        if post.contains('*') || !key.starts_with(pre) || key == pre || !key.ends_with(post) || key.len() < k.len() { continue; }
        let m = key[pre.len()..key.len() - post.len()].to_string();
        let better = match &best { None => true, Some((b, ..)) => { let bl = b.find('*').unwrap(); star > bl || (star == bl && k.len() > b.len()) } };
        if better { best = Some((k, v, m)); }
    }
    match best { Some((_, v, m)) => pick(v, conds, Some(&m)), None => Target::None }
}
/// What a target is under the conditions: the first condition written that holds.
fn pick(v: &Value, conds: &[&str], star: Option<&str>) -> Target {
    match v {
        Value::String(s) => Target::Path(match star { Some(m) => s.replace('*', m), None => s.clone() }),
        Value::Array(a) => { for x in a { match pick(x, conds, star) { Target::Path(p) if p.starts_with("./") => return Target::Path(p), Target::None => {} t => return t } } Target::None }
        Value::Object(o) => {
            for (k, x) in o {
                if k == "default" || conds.contains(&k.as_str()) { match pick(x, conds, star) { Target::None => continue, t => return t } }
            }
            Target::None
        }
        Value::Null => Target::Null,
        _ => Target::None,
    }
}
