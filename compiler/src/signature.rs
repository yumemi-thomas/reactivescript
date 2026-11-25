//! MO-3 / MO-9: a module's signature — what an importer is checked against — and its `.d.rx` text, printed and read back
//! (`ref/src/signature.ts`). One export per line:
//!
//!   export source products: pending fails(Error) = …        a question (ST-5); `:= …` a plain source
//!   export discount: pending fails(Error)                   an equation; `io` when bound to an io value
//!   export pure fn qtyOf(id) rejects(Offline) instantiates  a fn (`ref` params; RG-6); `rejects(…)` absent: none
//!   export server fn add(id) rejects(Error)                 12 SF-1 (`server pure fn` when no io)
//!   export action setCoupon
//!   export error NotFound(id)
//!   export type Product
//!   export context theme: source pending Theme = …          rows, then the written type; `= …` a default
//!   export component Panel(props: { title; children: catches(Error) provides(./theme.rx#theme) }) fails(Error) uses(…) shape(…)

use crate::parse::JsTrim;
use crate::content::Shape;
use indexmap::{IndexMap, IndexSet};
use regex::Regex;
use std::sync::LazyLock;

pub const HOLD: &str = "$hold";

/// What a catch or a boundary discharges: named classes, or every failure.
#[derive(Debug, Clone, PartialEq)]
pub enum Catch {
    All,
    Set(IndexSet<String>),
}
impl Catch {
    pub fn of(classes: &Option<Vec<String>>) -> Catch {
        match classes {
            Some(c) => Catch::Set(c.iter().cloned().collect()),
            None => Catch::All,
        }
    }
    pub fn caught(&self, cls: &str) -> bool {
        match self {
            Catch::All => true,
            Catch::Set(s) => cls != "Error" && s.contains(cls),
        }
    }
    pub fn is_empty_set(&self) -> bool {
        matches!(self, Catch::Set(s) if s.is_empty())
    }
}

#[derive(Debug, Clone)]
pub struct PropSig {
    pub f: Catch,
    pub p: Catch,
    pub rendered: bool,
    pub action: Option<(Catch, String)>,
    /// MO-11c: a JS component's prop that takes a component value
    pub component: bool,
    /// MO-11c (2026-11-24): a JS component's prop whose type holds a `Component` inside a record or an array
    pub components: bool,
    /// MO-10f: the fields of this prop its type says hold or fail where they are read (path, holds, classes): a JS
    /// result with such fields may be given whole
    pub takes: Vec<(String, bool, Vec<String>)>,
    /// RG-4c
    pub view: Option<ViewSig>,
}
/// RG-4c: a view the component shows: whether it is optional, what its parameter's type says, and the fields it is shown with
/// that hold no closure of the component's (O-3).
#[derive(Debug, Clone, PartialEq)]
pub struct ViewSig {
    pub optional: bool,
    /// plain content is taken as well
    pub mixed: bool,
    pub ty: Option<String>,
    pub values: Vec<String>,
}
#[derive(Debug, Clone)]
pub struct Own {
    pub cls: String,
    pub what: String,
    pub at: Option<String>,
}
/// MO-3: an exported component as an importer sees it.
#[derive(Debug, Clone)]
pub struct CompSig {
    /// MO-11j: a JS factory's component, exported from the module that made it (applied as JSX's `<X />`)
    pub made: bool,
    pub own: Vec<Own>,
    pub requires: Vec<String>,
    pub props: IndexMap<String, PropSig>,
    pub shape: Option<Shape>,
    /// O-3: the props it stores where they outlive it — "module", or a provision's key.
    pub stored: IndexMap<String, Vec<String>>,
    /// MO-11u: each place the component applies a component a declared fn `renders(…)` beneath, by that component's key
    /// (`declaration#Name`): what is discharged and provided between its children there and this component's root
    pub hosts: IndexMap<String, Vec<HostSite>>,
    /// MO-14f (2026-11-25), in a host's view: the component's view applies a component the host renders through, so it
    /// renders its applier's children there. Not printed: a host's view is checked from source
    pub through: bool,
}
/// MO-11u: one application of a component a declared fn `renders(…)` beneath, as the components that fn is given see it.
#[derive(Debug, Clone, PartialEq)]
pub struct HostSite {
    pub f: Catch,
    pub p: Catch,
}
/// MO-11u: a call of a fn declared `renders(H)` that was given components — what they let out of H's children, H's own
/// `uses(…)` and `provides(…)` taken off: judged at each application of H in the program (`check::judge_hosted`).
#[derive(Debug, Clone)]
pub struct Hosted {
    pub host: String,
    pub name: String,
    pub r#fn: String,
    pub line: usize,
    pub fails: Vec<String>,
    pub requires: Vec<String>,
    /// the places those components themselves apply a host (a routed layout's `<Toaster />`), from their own root, with
    /// what H uses and provides above them
    pub inner: IndexMap<String, Vec<HostSite>>,
}
#[derive(Debug, Clone)]
pub struct SigParam {
    pub name: String,
    pub r#ref: bool,
    pub ty: Option<String>,
}
#[derive(Debug, Clone)]
pub enum ExportSig {
    Source { question: bool, rows: Vec<String>, fails: Vec<String> },
    /// `actions`: R-io-3, the parts of its value (a fn's: of its result) that are actions, as paths ("": the value)
    Eq { rows: Vec<String>, fails: Vec<String>, io: bool, actions: Vec<String> },
    /// `uses`: RG-7b, the contexts a call of it reads above the place it is written (keys)
    Fn { params: Vec<SigParam>, instantiating: bool, rows: Vec<String>, fails: Vec<String>, rejects: Vec<String>, uses: Vec<String>, actions: Vec<String>, /// MO-13i: the parts of its result, where they are known
        result: Option<Res> },
    Action,
    Server { io: bool, params: Vec<String>, rejects: Vec<String> },
    ErrClass { params: Vec<String> },
    Comp { sig: CompSig },
    Context { key: String, source: bool, dflt: bool, rows: Vec<String>, fails: Vec<String>, ty: Option<String> },
    Type,
}
/// MO-13i: what a fn's result is made of. An action; one value, read (`reader`: it changes, with the rows it is read with)
/// or plain (made once), and the parts of it that are actions; a record or a tuple of such.
#[derive(Debug, Clone, PartialEq)]
pub enum Res {
    Io,
    Leaf { reader: bool, rows: Vec<String>, fails: Vec<String>, actions: Vec<String> },
    Rec(Vec<(String, Res)>),
    Arr(Vec<Res>),
}
impl Res {
    pub fn is_reader(&self) -> bool {
        matches!(self, Res::Leaf { reader: true, .. })
    }
    pub fn at(&self, key: &str) -> Option<&Res> {
        match self {
            Res::Rec(fs) => fs.iter().find(|f| f.0 == key).map(|f| &f.1),
            Res::Arr(xs) => key.parse::<usize>().ok().and_then(|i| xs.get(i)),
            _ => None,
        }
    }
    /// R-io-3: its parts that are actions, as paths
    pub fn actions(&self) -> Vec<String> {
        let part = |k: &str, r: &Res| r.actions().into_iter().map(|p| if p.is_empty() { k.to_string() } else { format!("{k}.{p}") }).collect::<Vec<_>>();
        sorted(match self {
            Res::Io => vec![String::new()],
            Res::Leaf { actions, .. } => actions.clone(),
            Res::Rec(fs) => fs.iter().flat_map(|(k, r)| part(k, r)).collect(),
            Res::Arr(xs) => xs.iter().enumerate().flat_map(|(i, r)| part(&i.to_string(), r)).collect(),
        })
    }
    /// What `rx-lib` writes the module's JavaScript and its types from: `"io"`, `"ref"`, `"value"`, a record or a list of such.
    pub fn json(&self) -> serde_json::Value {
        match self {
            Res::Io => "io".into(),
            Res::Leaf { reader, .. } => if *reader { "ref" } else { "value" }.into(),
            Res::Rec(fs) => serde_json::Value::Object(fs.iter().map(|(k, r)| (k.clone(), r.json())).collect()),
            Res::Arr(xs) => serde_json::Value::Array(xs.iter().map(Res::json).collect()),
        }
    }
}
#[derive(Debug, Clone)]
pub struct ModSig {
    pub file: String,
    pub exports: IndexMap<String, ExportSig>,
    /// MO-11u: the calls of `renders(H)` fns that were given components
    pub hosted: Vec<Hosted>,
    /// MO-11u: the applications of such an H the module itself roots (its mounted view, a root of a library's own)
    pub hosts: IndexMap<String, Vec<HostSite>>,
}

fn sorted(xs: impl IntoIterator<Item = String>) -> Vec<String> {
    let mut v: Vec<String> = xs.into_iter().collect();
    v.sort();
    v
}
fn cls(c: &Catch) -> String {
    match c {
        Catch::All => "*".into(),
        Catch::Set(s) if s.is_empty() => "nothing".into(),
        Catch::Set(s) => sorted(s.iter().cloned()).join(" | "),
    }
}
fn rows(r: &[String], fails: &[String]) -> String {
    let mut out: Vec<String> = ["io", "pending", "lane"].iter().filter(|x| r.iter().any(|y| y == *x)).map(|x| x.to_string()).collect();
    if !fails.is_empty() {
        out.push(format!("fails({})", sorted(fails.iter().cloned()).join(" | ")));
    }
    out.join(" ")
}
fn dir(p: &str) -> String {
    let parts: Vec<&str> = p.split('/').collect();
    parts[..parts.len() - 1].join("/")
}
/// `[path, name]` at the last `#` (`slice(0, -1)` and the whole key when there is none, as the reference has it).
fn split_hash(key: &str) -> (String, String) {
    match key.rfind('#') {
        Some(i) => (key[..i].to_string(), key[i + 1..].to_string()),
        None => {
            let mut p: Vec<char> = key.chars().collect();
            p.pop();
            (p.into_iter().collect(), key.to_string())
        }
    }
}
/// A context key relative to the module whose signature names it (`./theme.rx#theme`).
/// O-3: the props a component stores where they outlive it, and where.
fn retains_text(file: &str, st: &IndexMap<String, Vec<String>>) -> String {
    let mut fs: Vec<&String> = st.keys().collect();
    fs.sort();
    let xs: Vec<String> = fs.into_iter().flat_map(|f| st[f].iter().map(move |t| format!("{}: {}", if f == "*" { "...props" } else { f }, if t == "module" { t.clone() } else { rel_key(file, t) }))).collect();
    if xs.is_empty() { String::new() } else { format!(" retains({})", xs.join(", ")) }
}
fn rel_key(from: &str, key: &str) -> String {
    if key == HOLD {
        return "loading".into();
    }
    let (path, name) = split_hash(key);
    let d = dir(from);
    let a: Vec<&str> = d.split('/').filter(|x| !x.is_empty()).collect();
    let b: Vec<&str> = path.split('/').filter(|x| !x.is_empty()).collect();
    let mut i = 0;
    while i < a.len() && (i as i64) < b.len() as i64 - 1 && a[i] == b[i] {
        i += 1;
    }
    let up = a.len() - i;
    let rel = format!("{}{}", if up > 0 { "../".repeat(up) } else { "./".into() }, b[i.min(b.len())..].join("/"));
    format!("{}#{}", if path.starts_with('/') == from.starts_with('/') { rel } else { path }, name)
}
fn abs_key(from: &str, rel: &str) -> String {
    if rel == "loading" {
        return HOLD.into();
    }
    let (path, name) = split_hash(rel);
    if !path.starts_with('.') {
        return rel.into();
    }
    let lead = if from.starts_with('/') { "/" } else { "" };
    let d = dir(from);
    let mut out: Vec<String> = d.split('/').filter(|x| !x.is_empty()).map(String::from).collect();
    for seg in path.split('/') {
        if seg == "." || seg.is_empty() {
            continue;
        }
        if seg == ".." {
            out.pop();
        } else {
            out.push(seg.into());
        }
    }
    format!("{}{}#{}", lead, out.join("/"), name)
}
fn shape_text(s: &Option<Shape>) -> String {
    let Some(s) = s else { return String::new() };
    let mut parts = vec![];
    if !s.roots.is_empty() {
        parts.push(format!("roots {}", s.roots.join(" ")));
    }
    if s.closes_p {
        parts.push("closes-p".into());
    }
    if s.a {
        parts.push("a".into());
    }
    if s.form {
        parts.push("form".into());
    }
    for c in &s.children_at {
        parts.push(format!("children-at {}", c.join(" ")));
    }
    for (f, at) in &s.views_at {
        for c in at {
            parts.push(format!("{f}-at {}", c.join(" ")).trim_end().to_string());
        }
    }
    if parts.is_empty() { String::new() } else { format!(" shape({})", parts.join("; ")) }
}
/// MO-11u: `hosts(<key> catches(…) provides(…); …)`, one entry an application.
fn hosts_text(file: &str, hs: &IndexMap<String, Vec<HostSite>>) -> String {
    let xs: Vec<String> = hs
        .iter()
        .flat_map(|(k, sites)| {
            sites.iter().map(move |x| {
                format!(
                    "{}{}{}",
                    rel_key(file, k),
                    if x.f.is_empty_set() { String::new() } else { format!(" catches({})", cls(&x.f)) },
                    match &x.p {
                        Catch::Set(ks) if ks.is_empty() => String::new(),
                        Catch::All => " provides(*)".to_string(),
                        Catch::Set(ks) => format!(" provides({})", sorted(ks.iter().cloned()).iter().map(|q| rel_key(file, q)).collect::<Vec<_>>().join(", ")),
                    }
                )
            })
        })
        .collect();
    if xs.is_empty() { String::new() } else { format!("hosts({})", xs.join("; ")) }
}
fn hosted_text(file: &str, h: &Hosted) -> String {
    format!(
        "export renders {} from {}:{}{}{}",
        rel_key(file, &h.host),
        h.r#fn,
        h.line,
        if h.fails.is_empty() { String::new() } else { format!(" fails({})", sorted(h.fails.iter().cloned()).join(" | ")) },
        if h.requires.is_empty() { String::new() } else { format!(" uses({})", h.requires.iter().map(|k| rel_key(file, k)).collect::<Vec<_>>().join(", ")) }
    ) + &(if h.inner.is_empty() { String::new() } else { format!(" {}", hosts_text(file, &h.inner)) })
}
/// The text inside the balanced parentheses that open at byte `at` (the index of `(`).
fn balanced(s: &str, at: usize) -> Option<&str> {
    let mut depth = 0i64;
    for (i, ch) in s[at..].char_indices() {
        if ch == '(' {
            depth += 1;
        } else if ch == ')' {
            depth -= 1;
            if depth == 0 {
                return Some(&s[at + 1..at + i]);
            }
        }
    }
    None
}
fn hosts_of(file: &str, text: &str) -> IndexMap<String, Vec<HostSite>> {
    let mut out: IndexMap<String, Vec<HostSite>> = IndexMap::new();
    for part in split(text, ';') {
        let key = part.split(crate::parse::js_ws).filter(|w| !w.is_empty()).next().unwrap_or("").to_string();
        let rest = &part[key.len()..];
        let f = P_CATCHES.captures(rest).map(|c| catch_of(&c[2])).unwrap_or_else(|| Catch::Set(IndexSet::new()));
        let p = match P_PROVIDES.captures(rest) {
            Some(p) if crate::parse::js_trim(&p[2]) == "*" => Catch::All,
            Some(p) => Catch::Set(p[2].split(',').map(|k| abs_key(file, crate::parse::js_trim(k))).filter(|x| !x.is_empty()).collect()),
            None => Catch::Set(IndexSet::new()),
        };
        out.entry(abs_key(file, &key)).or_default().push(HostSite { f, p });
    }
    out
}
/// R-io-3: the parts of a value that are actions, among others: `{ set: io; pair.1: io; … }`; `io`: the value itself.
fn actions_text(ps: &[String]) -> String {
    if ps.is_empty() {
        String::new()
    } else if ps.iter().any(|p| p.is_empty()) {
        "io".to_string()
    } else {
        format!("{{ {}; … }}", ps.iter().map(|p| format!("{p}: io")).collect::<Vec<_>>().join("; "))
    }
}
fn actions_of(text: &str) -> Option<Vec<String>> {
    if text == "io" {
        return Some(vec![String::new()]);
    }
    let inner = crate::parse::js_trim(crate::parse::js_trim(text.strip_prefix('{')?.strip_suffix('}')?).strip_suffix('…')?).strip_suffix(';')?;
    let ps = split(inner, ';').iter().map(|p| P_PART.captures(p).map(|m| m[1].to_string())).collect::<Option<Vec<_>>>()?;
    (!ps.is_empty()).then_some(ps)
}
fn words(parts: [String; 3]) -> String {
    parts.into_iter().filter(|x| !x.is_empty()).collect::<Vec<_>>().join(" ")
}
/// MO-13i: the parts of a fn's result.
fn result_text(r: &Res) -> String {
    match r {
        Res::Io => "io".into(),
        Res::Rec(fs) => format!("{{ {} }}", fs.iter().map(|(k, r)| format!("{k}: {}", result_text(r))).collect::<Vec<_>>().join("; ")),
        Res::Arr(xs) => format!("[{}]", xs.iter().map(result_text).collect::<Vec<_>>().join(", ")),
        Res::Leaf { reader: true, rows: r, fails, actions } => words(["ref".into(), rows(r, fails), actions_text(actions)]),
        Res::Leaf { actions, .. } => words(["value".into(), String::new(), actions_text(actions)]),
    }
}
fn result_of(t: &str) -> Option<Res> {
    if t == "io" {
        return Some(Res::Io);
    }
    if let Some(inner) = t.strip_prefix('{').and_then(|t| t.strip_suffix('}')) {
        let fs = split(inner, ';').iter().map(|f| P_FIELD.captures(f).and_then(|m| Some((m[1].to_string(), result_of(&m[2])?)))).collect::<Option<Vec<_>>>()?;
        return (!fs.is_empty()).then_some(Res::Rec(fs));
    }
    if let Some(inner) = t.strip_prefix('[').and_then(|t| t.strip_suffix(']')) {
        let xs = split(inner, ',').iter().map(|x| result_of(x)).collect::<Option<Vec<_>>>()?;
        return (!xs.is_empty()).then_some(Res::Arr(xs));
    }
    let m = P_LEAF.captures(t)?;
    let rest = m.get(2).map(|x| x.as_str()).unwrap_or("");
    let r = if &m[1] == "ref" { row_words(rest) } else { RowWords { rows: vec![], fails: vec![], rest: rest.to_string() } };
    let text = if r.rows.iter().any(|x| x == "io") { "io" } else { r.rest.as_str() };
    let actions = if text.is_empty() { vec![] } else { actions_of(text)? };
    Some(Res::Leaf { reader: &m[1] == "ref", rows: r.rows.into_iter().filter(|x| x != "io").collect(), fails: r.fails, actions })
}
fn with_rows(head: String, r: String) -> String {
    if r.is_empty() { head } else { format!("{}: {}", head, r) }
}

fn line(file: &str, name: &str, x: &ExportSig) -> String {
    match x {
        ExportSig::Source { question, rows: r, fails } => format!("{} {} …", with_rows(format!("export source {}", name), rows(r, fails)), if *question { "=" } else { ":=" }),
        ExportSig::Eq { rows: r, fails, io, actions } => {
            let mut rr = r.clone();
            if *io {
                rr.insert(0, "io".into());
            }
            with_rows(format!("export {}", name), words([rows(&rr, fails), if *io { String::new() } else { actions_text(actions) }, String::new()]))
        }
        ExportSig::Fn { params, instantiating, rows: r, fails, rejects, uses, actions, result } => {
            let parts = match result {
                Some(x) => result_text(x),
                None if actions.iter().any(|p| p.is_empty()) => "ref io".to_string(),
                None => actions_text(actions),
            };
            let ps: Vec<String> = params.iter().map(|p| format!("{}{}{}", if p.r#ref { "ref " } else { "" }, p.name, p.ty.as_ref().map(|t| format!(": {}", t)).unwrap_or_default())).collect();
            format!(
                "{}{}{}{}",
                with_rows(format!("export pure fn {}({})", name, ps.join(", ")), words([rows(r, fails), parts, String::new()])),
                if rejects.is_empty() { String::new() } else { format!(" rejects({})", rejects.join(" | ")) },
                if *instantiating { " instantiates" } else { "" },
                if uses.is_empty() { String::new() } else { format!(" uses({})", uses.iter().map(|k| rel_key(file, k)).collect::<Vec<_>>().join(", ")) }
            )
        }
        ExportSig::Server { io, params, rejects } => format!(
            "export server {}fn {}({}){}",
            if *io { "" } else { "pure " },
            name,
            params.join(", "),
            if rejects.is_empty() { String::new() } else { format!(" rejects({})", sorted(rejects.iter().cloned()).join(" | ")) }
        ),
        ExportSig::Action => format!("export action {}", name),
        ExportSig::ErrClass { params } => format!("export error {}({})", name, params.join(", ")),
        ExportSig::Type => format!("export type {}", name),
        ExportSig::Context { source, dflt, rows: r, fails, ty, .. } => {
            let t: Vec<String> = [if *source { "source".to_string() } else { String::new() }, rows(r, fails), ty.clone().unwrap_or_default()].into_iter().filter(|x| !x.is_empty()).collect();
            let t = t.join(" ");
            format!("export context {}{}{}", name, if t.is_empty() { String::new() } else { format!(": {}", t) }, if *dflt { " = …" } else { "" })
        }
        ExportSig::Comp { sig: s } => {
            let props: Vec<String> = s
                .props
                .iter()
                .map(|(f, v)| {
                    let mut parts = vec![];
                    if !v.takes.is_empty() {
                        // MO-10f: the fields it reads as ones that hold or fail
                        let ts: Vec<String> = v.takes.iter().map(|(p, holds, fails)| format!("{p}{}{}", if *holds { " pending" } else { "" }, if fails.is_empty() { String::new() } else { format!(" fails({})", fails.join(" | ")) })).collect();
                        parts.push(format!("takes({})", ts.join(", ")));
                    }
                    if let Some(ViewSig { optional, mixed, ty, values }) = &v.view {
                        // RG-4c: a view it shows; `value(…)`: what it shows it with that holds no closure of its own (O-3)
                        parts.push(format!("view{}{}{}{}", if *optional { "?" } else { "" }, if *mixed { " | View" } else { "" }, ty.as_ref().map(|t| format!(" {t}")).unwrap_or_default(), if values.is_empty() { String::new() } else { format!(" value({})", values.join(", ")) }));
                    }
                    if !v.rendered {
                        parts.push("unrendered".to_string());
                    } else {
                        if !v.f.is_empty_set() {
                            parts.push(format!("catches({})", cls(&v.f)));
                        }
                        if !v.p.is_empty_set() {
                            parts.push(format!(
                                "provides({})",
                                match &v.p {
                                    Catch::All => "*".to_string(),
                                    Catch::Set(ks) => ks.iter().map(|k| rel_key(file, k)).collect::<Vec<_>>().join(", "),
                                }
                            ));
                        }
                    }
                    if let Some((af, an)) = &v.action {
                        parts.push(format!("action {} catches({})", an, cls(af)));
                    }
                    format!("{}{}", if f == "*" { "...props" } else { f }, if parts.is_empty() { String::new() } else { format!(": {}", parts.join(" ")) })
                })
                .collect();
            let own: IndexSet<String> = s.own.iter().map(|o| o.cls.clone()).collect();
            format!(
                "export component {}(props: {}){}{}{}{}{}{}",
                name,
                if props.is_empty() { "{}".to_string() } else { format!("{{ {} }}", props.join("; ")) },
                if s.made { " made" } else { "" },
                if own.is_empty() { String::new() } else { format!(" fails({})", sorted(own).join(" | ")) },
                if s.requires.is_empty() { String::new() } else { format!(" uses({})", s.requires.iter().map(|k| rel_key(file, k)).collect::<Vec<_>>().join(", ")) },
                retains_text(file, &s.stored),
                if s.hosts.is_empty() { String::new() } else { format!(" {}", hosts_text(file, &s.hosts)) },
                shape_text(&s.shape)
            )
        }
    }
}

pub fn print_signature(sig: &ModSig) -> String {
    let mut out = vec![format!("//@ signature {} (09-modules MO-3, MO-13a). Sources are read-only to importers (MO-2).", sig.file.split('/').last().unwrap_or(""))];
    for (n, x) in &sig.exports {
        out.push(line(&sig.file, n, x));
    }
    // MO-11u
    if !sig.hosts.is_empty() {
        out.push(format!("export {}", hosts_text(&sig.file, &sig.hosts)));
    }
    for h in &sig.hosted {
        out.push(hosted_text(&sig.file, h));
    }
    out.join("\n") + "\n"
}

// ---------------------------------------------------------------- reading it back (MO-9)
#[derive(Debug)]
pub struct SignatureError(pub String);

macro_rules! re {
    ($name:ident, $pat:expr) => {
        static $name: LazyLock<Regex> = LazyLock::new(|| crate::parse::js_regex($pat));
    };
}
re!(ROW, r"^(io|pending|lane|fails\(([^)]*)\))$");
re!(TRAIL_COMMENT, r"\s//.*$");
re!(LEAD_COMMENT, r"^//.*$");
re!(T_RENDERS, r"^renders\s+(\S+)\s+from\s+([A-Za-z_$][A-Za-z0-9_$.]*):(\d+)\s*(?:fails\(([^)]*)\))?\s*(?:uses\(([^)]*)\))?$");
re!(C_HOSTS, r"(^|\s)hosts\(");
re!(R_HOSTS, r"\shosts\(");
re!(T_TYPE, r"^type\s+([A-Za-z_$][A-Za-z0-9_$]*)");
re!(T_ACTION, r"^action\s+([A-Za-z_$][A-Za-z0-9_$]*)$");
re!(T_ERROR, r"^error\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*(?:\(([^)]*)\))?$");
re!(T_SOURCE, r"^source\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*(?::([^=].*?)?)??\s*(:?=)\s*…$");
re!(T_SERVER, r"^server\s+(pure\s+)?fn\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*\(([^)]*)\)\s*(?:rejects\(([^)]*)\))?$");
re!(T_FN, r"^pure\s+fn\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*\(");
re!(T_FN_ROWS, r"^\s*(?::\s*(.*?))?\s*(?:\brejects\(([^)]*)\))?\s*(\binstantiates)?\s*(?:\buses\(([^)]*)\))?$");
re!(P_FIELD, r"^([A-Za-z0-9_$-]+)\s*:\s*(.+)$");
re!(P_LEAF, r"^(ref|value)(?:\s+(.*))?$");
re!(T_CONTEXT, r"^context\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*(?::\s*(.*?))?\s*(=\s*…)?$");
re!(T_COMP, r"^component\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*\(");
re!(T_PROPS, r"^props:\s*(\{.*\})$");
re!(P_PART, r"^([A-Za-z0-9_$.-]+)\s*:\s*io$");
re!(T_EQ, r"^([A-Za-z_$][A-Za-z0-9_$]*)\s*(?::\s*(.*))?$");
re!(P_ACTION, r"(^|[^A-Za-z0-9_])action\s+([A-Za-z_$][A-Za-z0-9_$]*)\s+catches\(([^)]*)\)");
re!(P_UNRENDERED, r"(^|[^A-Za-z0-9_])unrendered([^A-Za-z0-9_]|$)");
re!(P_TAKES, r"(^|[^A-Za-z0-9_])takes\(((?:[^()]|\([^()]*\))*)\)");
re!(P_VIEW, r"^view(\??)(\s*\|\s*View)?(?:\s|$)");
re!(P_VALUE, r"^value\(([^)]*)\)");
re!(P_PENDING, r"(^|\s)pending(\s|$)");
re!(P_FAILS, r"fails\(([^)]*)\)");
re!(P_CATCHES, r"(^|[^A-Za-z0-9_])catches\(([^)]*)\)");
re!(P_PROVIDES, r"(^|[^A-Za-z0-9_])provides\(([^)]*)\)");
re!(C_FAILS, r"(^|[^A-Za-z0-9_])fails\(([^)]*)\)");
re!(C_USES, r"(^|[^A-Za-z0-9_])uses\(([^)]*)\)");
re!(C_MADE, r"^\s*made\b");
re!(C_RETAINS, r"(^|[^A-Za-z0-9_])retains\(([^)]*)\)");
re!(C_SHAPE, r"(^|[^A-Za-z0-9_])shape\(([^)]*)\)");
re!(SOURCE_WORD, r"^source([^A-Za-z0-9_]|$)");
re!(REF_PARAM, r"^ref\s");

fn classes_of(s: &str) -> Vec<String> {
    s.split('|').map(|x| crate::parse::js_trim(x).to_string()).filter(|x| !x.is_empty() && x != "nothing").collect()
}
fn catch_of(s: &str) -> Catch {
    if crate::parse::js_trim(s) == "*" { Catch::All } else { Catch::Set(classes_of(s).into_iter().collect()) }
}
/// Split on `sep` outside parentheses and braces.
fn split(s: &str, sep: char) -> Vec<String> {
    let mut out = vec![];
    let mut depth = 0i64;
    let mut cur = String::new();
    for ch in s.chars() {
        if "({[<".contains(ch) {
            depth += 1;
        }
        if ")}]>".contains(ch) && !(ch == '>' && cur.ends_with('=')) {
            depth -= 1;
        }
        if ch == sep && depth == 0 {
            out.push(std::mem::take(&mut cur));
        } else {
            cur.push(ch);
        }
    }
    if !crate::parse::js_trim(&cur).is_empty() {
        out.push(cur);
    }
    out.iter().map(|x| crate::parse::js_trim(x).to_string()).filter(|x| !x.is_empty()).collect()
}
struct RowWords {
    rows: Vec<String>,
    fails: Vec<String>,
    rest: String,
}
fn row_words(s: &str) -> RowWords {
    let words = split(s, ' ');
    let mut rows = vec![];
    let mut fails = vec![];
    let mut i = 0;
    while i < words.len() {
        let Some(m) = ROW.captures(&words[i]) else { break };
        if let Some(f) = m.get(2) {
            fails = classes_of(f.as_str());
        } else {
            rows.push(m[1].to_string());
        }
        i += 1;
    }
    RowWords { rows, fails, rest: words[i..].join(" ") }
}
/// SV-7d's words (MO-9b; a JS component's, MO-11a).
pub fn content_shape_of(s: Option<&str>, printed: bool) -> Result<Shape, String> {
    let mut sh = Shape::default();
    let Some(s) = s else { return Ok(sh) };
    for p in s.split(';').map(crate::parse::js_trim).filter(|x| !x.is_empty()) {
        let ws: Vec<String> = p.split(crate::parse::js_ws).filter(|x| !x.is_empty()).map(String::from).collect();
        let (w, rest) = (ws[0].as_str(), ws[1..].to_vec());
        match w {
            "roots" => sh.roots = rest,
            "closes-p" => sh.closes_p = true,
            "a" => sh.a = true,
            "form" => sh.form = true,
            "children-at" => sh.children_at.push(rest),
            _ if printed && w.ends_with("-at") => sh.views_at.entry(w[..w.len() - 3].to_string()).or_default().push(rest),
            _ => return Err(format!("shape: {}", p)),
        }
    }
    Ok(sh)
}

/// A `.d.rx` printed for (or written as) an `.rx` module's signature, read in place of the module. `file` is the `.rx`
/// module's path: context keys are its, and relative keys resolve against it.
pub fn parse_signature(src: &str, file: &str) -> Result<ModSig, SignatureError> {
    let mut exports = IndexMap::new();
    let mut hosts: IndexMap<String, Vec<HostSite>> = IndexMap::new();
    let mut hosted: Vec<Hosted> = vec![];
    for (i, raw) in src.split('\n').enumerate() {
        let t = TRAIL_COMMENT.replace(raw, "");
        let t = LEAD_COMMENT.replace(&t, "");
        let t = crate::parse::js_trim(&t).to_string();
        if t.is_empty() {
            continue;
        }
        let fail = |msg: &str| SignatureError(format!("{}:{}: {}: {}", file.strip_suffix(".rx").map(|f| format!("{}.d.rx", f)).unwrap_or_else(|| file.to_string()), i + 1, msg, t));
        if !t.starts_with("export ") {
            return Err(fail("a signature declares exports"));
        }
        let s = crate::parse::js_trim(&t[7..]).to_string();
        // MO-11u
        if s.starts_with("hosts(") {
            let Some(inner) = balanced(&s, 5) else { return Err(fail("hosts(…)")) };
            hosts = hosts_of(file, inner);
            continue;
        }
        // `export renders <key> from <fn>:<line> … hosts(…)`: the places taken out first (their entries write `provides(…)`)
        let (s, inner) = match (s.starts_with("renders "), R_HOSTS.find(&s)) {
            (true, Some(at)) => {
                let open = at.end() - 1;
                let Some(text) = balanced(&s, open) else { return Err(fail("hosts(…)")) };
                let inner = hosts_of(file, text);
                let end = open + text.len() + 2;
                (crate::parse::js_trim(&format!("{}{}", &s[..at.start()], &s[end..])).to_string(), inner)
            }
            _ => (s, IndexMap::new()),
        };
        if let Some(m) = T_RENDERS.captures(&s) {
            let host = abs_key(file, &m[1]);
            let name = host.rsplit('#').next().unwrap_or("").to_string();
            let mut fails = classes_of(m.get(4).map(|x| x.as_str()).unwrap_or(""));
            fails.sort();
            let requires = m.get(5).map(|x| x.as_str()).unwrap_or("").split(',').map(crate::parse::js_trim).filter(|k| !k.is_empty()).map(|k| abs_key(file, k)).collect();
            hosted.push(Hosted { host, name, r#fn: m[2].to_string(), line: m[3].parse().unwrap_or(1), fails, requires, inner });
            continue;
        }
        if let Some(m) = T_TYPE.captures(&s) {
            exports.insert(m[1].to_string(), ExportSig::Type);
            continue;
        }
        if let Some(m) = T_ACTION.captures(&s) {
            exports.insert(m[1].to_string(), ExportSig::Action);
            continue;
        }
        if let Some(m) = T_ERROR.captures(&s) {
            let params = m.get(2).map(|x| x.as_str()).unwrap_or("").split(',').map(|x| crate::parse::js_trim(x).to_string()).filter(|x| !x.is_empty()).collect();
            exports.insert(m[1].to_string(), ExportSig::ErrClass { params });
            continue;
        }
        if let Some(m) = T_SOURCE.captures(&s) {
            let r = row_words(m.get(2).map(|x| x.as_str()).unwrap_or(""));
            if !r.rest.is_empty() {
                return Err(fail("a source's rows"));
            }
            exports.insert(m[1].to_string(), ExportSig::Source { question: &m[3] == "=", rows: r.rows, fails: r.fails });
            continue;
        }
        if let Some(m) = T_SERVER.captures(&s) {
            let params = m[3].split(',').map(|x| crate::parse::js_trim(x).to_string()).filter(|x| !x.is_empty()).collect();
            exports.insert(m[2].to_string(), ExportSig::Server { io: m.get(1).is_none(), params, rejects: classes_of(m.get(4).map(|x| x.as_str()).unwrap_or("")) });
            continue;
        }
        if let Some(m) = T_FN.captures(&s) {
            let open = m[0].len() - 1;
            let Some(ps) = balanced(&s, open) else { return Err(fail("a fn's parameters")) };
            let Some(t) = T_FN_ROWS.captures(&s[open + ps.len() + 2..]) else { return Err(fail("a fn's rows")) };
            let params = split(ps, ',')
                .into_iter()
                .map(|p0| {
                    let r = REF_PARAM.is_match(&p0);
                    let p = if r { crate::parse::js_trim(&p0[4..]).to_string() } else { p0.clone() };
                    match p.find(':') {
                        None => SigParam { name: crate::parse::js_trim(&p).to_string(), r#ref: r, ty: None },
                        Some(c) => SigParam { name: crate::parse::js_trim(&p[..c]).to_string(), r#ref: r, ty: Some(crate::parse::js_trim(&p[c + 1..]).to_string()) },
                    }
                })
                .collect();
            let r = row_words(t.get(1).map(|x| x.as_str()).unwrap_or(""));
            let text = if r.rows.iter().any(|x| x == "io") { "io" } else { r.rest.as_str() };
            // some parts of one value are actions: what else it holds is not said
            let (actions, result) = match (if text == "io" { None } else { actions_of(text) }, result_of(text)) {
                (Some(a), _) => (a, None),
                (None, Some(x)) => (x.actions(), (!x.is_reader()).then_some(x)),
                (None, None) if text.is_empty() => (vec![], None),
                (None, None) => return Err(fail("a fn's rows")),
            };
            exports.insert(m[1].to_string(), ExportSig::Fn { params, instantiating: t.get(3).is_some(), actions, result, rows: r.rows.iter().filter(|x| *x != "io").cloned().collect(), fails: r.fails.clone(), rejects: classes_of(t.get(2).map(|x| x.as_str()).unwrap_or("")), uses: t.get(4).map(|u| u.as_str().split(',').map(|k| abs_key(file, crate::parse::js_trim(k))).collect()).unwrap_or_default() });
            continue;
        }
        if let Some(m) = T_CONTEXT.captures(&s) {
            let mut body = crate::parse::js_trim(m.get(2).map(|x| x.as_str()).unwrap_or("")).to_string();
            let source = SOURCE_WORD.is_match(&body);
            if source {
                body = crate::parse::js_trim(&body[6..]).to_string();
            }
            let r = row_words(&body);
            exports.insert(
                m[1].to_string(),
                ExportSig::Context { key: format!("{}#{}", file, &m[1]), source, dflt: m.get(3).is_some(), rows: r.rows, fails: r.fails, ty: if r.rest.is_empty() { None } else { Some(r.rest) } },
            );
            continue;
        }
        if let Some((m, ps)) = T_COMP.captures(&s).and_then(|m| balanced(&s, m.get(0).unwrap().end() - 1).filter(|p| T_PROPS.is_match(p)).map(|p| (m, p))) {
            let props = T_PROPS.captures(ps).unwrap();
            let m = [String::new(), m[1].to_string(), props[1].to_string(), s[m.get(0).unwrap().end() + ps.len() + 1..].to_string()];
            let mut sig = CompSig { made: false, own: vec![], requires: vec![], props: IndexMap::new(), shape: None, stored: IndexMap::new(), hosts: IndexMap::new(), through: false };
            let inner = &m[2][1..m[2].len() - 1];
            for f in split(inner, ';') {
                let (fname0, spec) = match f.find(':') {
                    Some(c) => (crate::parse::js_trim(&f[..c]).to_string(), crate::parse::js_trim(&f[c + 1..]).to_string()),
                    None => (crate::parse::js_trim(&f).to_string(), String::new()),
                };
                let fname = if fname0 == "...props" { "*".to_string() } else { fname0 };
                let mut v = PropSig { f: Catch::Set(IndexSet::new()), p: Catch::Set(IndexSet::new()), rendered: true, action: None, component: false, components: false, takes: vec![], view: None };
                let mut spec = spec;
                if let Some(m) = P_VIEW.captures(&spec) {
                    // RG-4c
                    let mut view = ViewSig { optional: !m[1].is_empty(), mixed: m.get(2).is_some(), ty: None, values: vec![] };
                    let mut at = spec[m.get(0).unwrap().end()..].js_trim().to_string();
                    if at.starts_with('{') {
                        let end = crate::parse::closes(&at, 0).unwrap_or(at.len());
                        view.ty = Some(at[..end].to_string());
                        at = at[end..].js_trim().to_string();
                    }
                    if let Some(x) = P_VALUE.captures(&at) {
                        view.values = x[1].split(',').map(|x| x.js_trim().to_string()).filter(|x| !x.is_empty()).collect();
                        at = at[x.get(0).unwrap().end()..].js_trim().to_string();
                    }
                    v.view = Some(view);
                    spec = at;
                }
                let a = P_ACTION.captures(&spec);
                let rest = match &a {
                    Some(a) => {
                        v.action = Some((catch_of(&a[3]), a[2].to_string()));
                        let whole = a.get(0).unwrap();
                        let start = whole.end() - (whole.as_str().len() - a.get(1).unwrap().as_str().len());
                        let matched = &spec[start..whole.end()];
                        spec.replacen(matched, "", 1)
                    }
                    None => spec.clone(),
                };
                if let Some(t) = P_TAKES.captures(&rest) {
                    // `takes(data pending fails(Error), result.more pending)`
                    for part in split(&t[2], ',') {
                        let part = crate::parse::js_trim(&part);
                        let path = part.split(crate::parse::js_ws).filter(|w| !w.is_empty()).next().unwrap_or("").to_string();
                        let holds = P_PENDING.is_match(part);
                        let fails = P_FAILS.captures(part).map(|f| f[1].split('|').map(|c| c.js_trim().to_string()).filter(|c| !c.is_empty()).collect()).unwrap_or_default();
                        if !path.is_empty() {
                            v.takes.push((path, holds, fails));
                        }
                    }
                }
                let rest = P_TAKES.replace(&rest, "$1").to_string();
                if P_UNRENDERED.is_match(&rest) {
                    v.rendered = false;
                    v.f = Catch::All;
                    v.p = Catch::All;
                }
                if let Some(c) = P_CATCHES.captures(&rest) {
                    v.f = catch_of(&c[2]);
                }
                if let Some(p) = P_PROVIDES.captures(&rest) {
                    v.p = if crate::parse::js_trim(&p[2]) == "*" {
                        Catch::All
                    } else {
                        Catch::Set(p[2].split(',').map(|k| abs_key(file, crate::parse::js_trim(k))).filter(|x| !x.is_empty()).collect())
                    };
                }
                sig.props.insert(fname, v);
            }
            // MO-11u: `hosts(…)` is taken out of the tail first — its entries write `catches(…)` and `provides(…)`
            let mut tail_owned = m[3].to_string();
            if let Some(at) = C_HOSTS.find(&tail_owned) {
                let open = at.end() - 1;
                let Some(inner) = balanced(&tail_owned, open) else { return Err(fail("hosts(…)")) };
                sig.hosts = hosts_of(file, inner);
                let end = open + inner.len() + 2;
                tail_owned = format!("{}{}", &tail_owned[..at.start()], &tail_owned[end..]);
            }
            let tail = tail_owned.as_str();
            if let Some(fl) = C_FAILS.captures(tail) {
                let at = file.split('/').last().map(String::from);
                sig.own = classes_of(&fl[2]).into_iter().map(|c| Own { cls: c, what: format!("{}'s root", &m[1]), at: at.clone() }).collect();
            }
            if C_MADE.is_match(tail) {
                sig.made = true; // MO-11j
            }
            if let Some(us) = C_USES.captures(tail) {
                sig.requires = us[2].split(',').map(|k| abs_key(file, crate::parse::js_trim(k))).collect();
            }
            if let Some(so) = C_RETAINS.captures(tail) {
                for x in split(&so[2], ',') {
                    let i = x.find(':').unwrap_or(x.len());
                    let f0 = crate::parse::js_trim(&x[..i]).to_string();
                    let f = if f0 == "...props" { "*".to_string() } else { f0 };
                    let t = crate::parse::js_trim(x.get(i + 1..).unwrap_or("")).to_string();
                    sig.stored.entry(f).or_default().push(if t == "module" { t } else { abs_key(file, &t) });
                }
            }
            sig.shape = Some(content_shape_of(C_SHAPE.captures(tail).map(|x| x.get(2).unwrap().as_str()), true).map_err(|e| fail(&e))?);
            exports.insert(m[1].to_string(), ExportSig::Comp { sig });
            continue;
        }
        if let Some(m) = T_EQ.captures(&s) {
            let r = row_words(m.get(2).map(|x| x.as_str()).unwrap_or(""));
            let actions = actions_of(&r.rest);
            if !r.rest.is_empty() && actions.is_none() {
                return Err(fail("an equation's rows"));
            }
            let io = r.rows.iter().any(|x| x == "io");
            exports.insert(m[1].to_string(), ExportSig::Eq { rows: r.rows.into_iter().filter(|x| x != "io").collect(), fails: r.fails, io, actions: actions.unwrap_or_default() });
            continue;
        }
        return Err(fail("not an export"));
    }
    Ok(ModSig { file: file.into(), exports, hosted, hosts })
}
