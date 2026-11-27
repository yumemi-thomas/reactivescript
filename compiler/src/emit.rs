//! The code generator (spec/11 CP-1a, a port of `ref/compile/emit.ts`): a checked program → one JavaScript module per `.rx`
//! module (MO-1), the reactive lowering as `__rt` calls (CP-4b), the views as JSX, which Solid's compiler then lowers for the
//! target (`lower_views`, CP-1b). Lexical scopes become JS scopes: every region is a JS function, every declaration a
//! `const`. Names are mangled (`v$x` the value or accessor, `w$x` a source's writer, `p$x` a companion `pre` memo). The
//! module is a tree (`js.rs`), never text (CP-3).

use crate::ast::{instantiates, kept_parts, Decl, Expr, ExprKind, Field, Lit, Markup, MarkupKind, PathSeg, Program, Stmt, StmtKind, TplPart};
use crate::awaits::{inner_catches, is_handler, non_tail_awaits, view_readers};
use crate::check::{children, unwrap_server, Node};
use crate::js::*;
use crate::modules::{defaulted, given, shown, shown_in, takes_view, type_only, types_of, views_of, Given, ModuleSet, Types};
use crate::names::{in_prelude, language, scalar, Lang};
use crate::parse::{JsDecl, Part, Shape as FShape};
use crate::signature::ExportSig;
use indexmap::{IndexMap, IndexSet};
use serde_json::Value;
use std::collections::{HashMap, HashSet};

#[derive(Debug, Clone, PartialEq)]
pub struct CompileError(pub String);
type R<T> = Result<T, CompileError>;
fn fail<T>(msg: impl Into<String>) -> R<T> {
    Err(CompileError(msg.into()))
}

const VOID_TAGS: &[&str] = &["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"];
fn mg(n: &str) -> String {
    format!("v${n}")
}
/// MO-8t: an import's names, and after each the methods its declaration gives rows of their own (`export fn
/// toaster.show(…)`): each is bound as a declared fn is, under the name the loader gave its mentions (`toaster.show`),
/// and written as that member of the import (`v$toaster.show`)
fn with_methods(names: &[crate::ast::ImportName], ds: Option<&Vec<JsDecl>>) -> Vec<crate::ast::ImportName> {
    let mut out = vec![];
    for n in names {
        out.push(n.clone());
        let prefix = format!("{}.", n.name);
        for m in ds.map(|v| v.as_slice()).unwrap_or(&[]) {
            if let JsDecl::Fn { name, .. } = m {
                if name.starts_with(&prefix) {
                    out.push(crate::ast::ImportName { name: name.clone(), alias: format!("{}{}", n.alias, &name[n.name.len()..]) });
                }
            }
        }
    }
    out
}
/// a component: an uppercase JSX tag
fn cm(n: &str) -> String {
    format!("V${n}")
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
enum Kind {
    Acc,
    Src,
    Val,
    Fn,
    Ifn,
    /// MO-10: a declared JS primitive
    Jfn,
    Act,
    Comp,
}
#[derive(Clone)]
struct FnRef {
    params: Vec<(String, bool)>,
    decl: Option<*const Decl>,
}
#[derive(Clone)]
struct Bind {
    kind: Kind,
    js: String,
    /// RG-4b: a component's props, or a projection of them that holds a view
    given: Option<Given>,
    /// RG-4c: a context that holds a view
    view_ctx: bool,
    /// RG-4c: a component's props: the views it shows (`<props.f … />`), and whether it takes plain content as well
    shows: Vec<(String, bool)>,
    /// RG-4c: a component whose children are a view or plain content
    plain: bool,
    /// RG-4c: a component whose children are a value
    kids_value: bool,
    w: Option<String>,
    f: Option<FnRef>,
    prev: Option<String>,
    /// `client` JS (12 SF-5b)
    client: bool,
    /// MO-10: a primitive's result (Jfn), or an instance's (with `inst`, the name of its raw result)
    shape: Option<FShape>,
    inst: Option<String>,
    /// MO-10i: a library's draft (a callback's parameter, or a turn of a loop over a path of one): a place, read as a copy
    draft: bool,
    /// MO-10i: a JS fn's callbacks whose parameters are its drafts (argument, parameter positions); its result's
    /// function parts that take such callbacks, by tuple index or field
    drafts: Vec<(usize, Vec<usize>)>,
    part_drafts: Vec<(String, Vec<(usize, Vec<usize>)>)>,
    /// MO-10i (2026-11-22): a JS module's name — a draft it is called with is lent, not given; and the parameters its
    /// declaration marks `draft`, which are given the draft itself
    js_fn: bool,
    draft_args: Vec<usize>,
    /// E-9b: the expression a name stands for where it is read; its place among the names of a call that are evaluated
    /// once, and whether it is read apart
    sub: Option<*const Expr>,
    shared: Option<(usize, bool)>,
}
/// RG-4c: a component whose children are a view or plain content.
fn takes_plain(d: &Decl, types: &Types) -> bool {
    matches!(d, Decl::Component { props, props_type, decls, view, tparams, .. } if shown(props, props_type.as_deref(), decls, view, types, tparams.as_deref()).get("children").is_some_and(|v| v.mixed))
}
/// RG-4c: children that are a value — declared a value's type (`children: number[]`), or used as one where every caller
/// gives one (`kids_value`) — are given as the value written between the tags, not as content to show.
fn kids_as_value(d: &Decl, types: &Types) -> bool {
    matches!(d, Decl::Component { props_type, tparams, kids_value, .. } if *kids_value || takes_view(props_type.as_deref(), types, "children", tparams.as_deref()) == Some(false))
}
fn bind(kind: Kind, js: impl Into<String>) -> Bind {
    Bind { kind, js: js.into(), given: None, view_ctx: false, shows: vec![], plain: false, kids_value: false, w: None, f: None, prev: None, client: false, shape: None, inst: None, draft: false, drafts: vec![], part_drafts: vec![], js_fn: false, draft_args: vec![], sub: None, shared: None }
}
fn val(js: impl Into<String>) -> Bind {
    bind(Kind::Val, js)
}

struct Frame {
    vars: IndexMap<String, Bind>,
    parent: Option<usize>,
}
type Env = usize;

#[derive(Clone, Default)]
struct Ctx {
    imp: bool,
    /// an element's `ref`: its closure is called while the view is made
    is_ref: bool,
    gen: bool,
    is_async: bool,
    tail: bool,
    self_: Option<String>,
    effect: bool,
    dynamic: bool,
}
fn reactive() -> Ctx {
    Ctx::default()
}

// ---------------------------------------------------------------- usage analysis (the oracle's walkers, at compile time)
#[derive(Default)]
struct Usage {
    optimistic: HashSet<String>,
    paths: HashSet<String>,
    prev_of: HashSet<String>,
    /// plain writes (not guesses): a question source that is guessed by path and written plainly lowers to a layer over a writable truth
    plain: HashSet<String>,
}
fn usage(programs: &[&Program], extra: &[Vec<Stmt>]) -> Usage {
    let mut u = Usage::default();
    fn walk(x: &Value, self_name: Option<&str>, u: &mut Usage) {
        match x {
            Value::Array(xs) => xs.iter().for_each(|y| walk(y, self_name, u)),
            Value::Object(o) => {
                let k = o.get("k").and_then(Value::as_str);
                let target = o.get("target");
                let tname = || target.and_then(|t| t["name"].as_str()).unwrap_or_default().to_string();
                if k == Some("optimistic") {
                    u.optimistic.insert(tname());
                }
                if k == Some("write") && !target.and_then(|t| t["ctx"].as_bool()).unwrap_or(false) {
                    u.plain.insert(tname());
                }
                if matches!(k, Some("write" | "optimistic")) && target.and_then(|t| t["path"].as_array()).is_some_and(|p| !p.is_empty()) {
                    u.paths.insert(tname());
                }
                if k == Some("pending") && matches!(o["e"]["k"].as_str(), Some("member" | "index")) {
                    let mut y = &o["e"];
                    while matches!(y["k"].as_str(), Some("member" | "index")) {
                        y = &y["o"];
                    }
                    if y["k"] == "id" {
                        u.paths.insert(y["name"].as_str().unwrap().to_string());
                    }
                }
                if k == Some("pre") && o["name"].as_str() != self_name {
                    u.prev_of.insert(o["name"].as_str().unwrap().to_string());
                }
                let next = if matches!(k, Some("eq" | "source")) { o["name"].as_str() } else { self_name };
                for v in o.values() {
                    walk(v, next, u);
                }
            }
            _ => {}
        }
    }
    for p in programs {
        walk(&p.to_json(), None, &mut u);
    }
    for ss in extra {
        walk(&Value::Array(ss.iter().map(|s| s.to_json()).collect()), None, &mut u);
    }
    u
}
/// Free names of an expression, for ordering declarations (JS consts have a temporal dead zone; memos compute eagerly).
fn deps(e: &Value, self_name: &str, out: &mut IndexSet<String>) {
    match e {
        Value::Array(xs) => xs.iter().for_each(|x| deps(x, self_name, out)),
        Value::Object(o) => {
            let k = o.get("k").and_then(Value::as_str);
            if k == Some("id") {
                out.insert(o["name"].as_str().unwrap().to_string());
            }
            if k == Some("pre") && o["name"].as_str() != Some(self_name) {
                out.insert(o["name"].as_str().unwrap().to_string());
            }
            if matches!(k, Some("write" | "optimistic")) {
                out.insert(o["target"]["name"].as_str().unwrap().to_string());
            }
            for (key, v) in o {
                if key != "k" {
                    deps(v, self_name, out);
                }
            }
        }
        _ => {}
    }
}
/// RG-7b: a `use` of the context `name` written in what its provision is given — not in a block there that provides it
/// itself (ref/src/ast.ts `ownUses`).
fn own_use(e: &Value, name: &str) -> bool {
    match e {
        Value::Array(xs) => xs.iter().any(|x| own_use(x, name)),
        Value::Object(o) => {
            let k = o.get("k").and_then(Value::as_str);
            if k == Some("use") {
                return o.get("name").and_then(Value::as_str) == Some(name);
            }
            if let Some(Value::Array(ds)) = o.get("decls") {
                if ds.iter().any(|d| d.get("k").and_then(Value::as_str) == Some("provide") && d.get("name").and_then(Value::as_str) == Some(name)) {
                    return false;
                }
            }
            o.iter().any(|(key, v)| key != "k" && own_use(v, name))
        }
        _ => false,
    }
}
/// C-1: the contexts an expression uses where it stands — not in a closure, which runs later, unless a call has it
/// (ref/src/ast.ts `usesNow`). `skip`: a context whose uses are not counted (a provision's own).
pub(crate) fn uses_now(e: &Value, called: bool, skip: Option<&str>, out: &mut IndexSet<String>) {
    match e {
        Value::Array(xs) => xs.iter().for_each(|x| uses_now(x, called, skip, out)),
        Value::Object(o) => {
            let k = o.get("k").and_then(Value::as_str);
            if k == Some("use") {
                if let Some(n) = o.get("name").and_then(Value::as_str) {
                    if skip != Some(n) {
                        out.insert(n.to_string());
                    }
                }
                return;
            }
            if k == Some("serverfn") || (k == Some("fn") && !called) {
                return;
            }
            let inner = k == Some("call") || (called && k != Some("fn"));
            for (key, v) in o {
                if key != "k" {
                    uses_now(v, inner, skip, out);
                }
            }
        }
        _ => {}
    }
}
fn has_await_json(v: &Value) -> bool {
    serde_json::to_string(v).unwrap().contains("\"k\":\"await\"")
}

// ---------------------------------------------------------------- the modules

/// One ES module per `.rx` module (MO-1), before Solid's compiler lowers its views.
pub struct Compiled {
    pub files: IndexMap<String, Vec<S>>,
    /// each module's `.rx` path
    pub paths: IndexMap<String, String>,
    pub entry: String,
    /// CSS-4: the modules' stylesheets, beside their JavaScript
    pub css: String,
    /// CSS-4: each module's own stylesheet, by its output name
    pub module_css: IndexMap<String, String>,
}

/// 09 MO-1: one ES module per `.rx` module. A dependency's module is a factory over the app (`__rt.module` runs it once per
/// app, the first time an importer instantiates — inside the mounted root, so its state is owned there); the entry's is
/// `main`. `extra`: statements the program does not hold that run against it (a scenario's handler rows), for usage only.
pub fn compile_modules(set: &ModuleSet, extra: &[Vec<Stmt>]) -> R<Compiled> {
    compile_linked(set, extra, false)
}

/// `compile_modules`, with each module importing its dependencies by their `.rx` paths (relative to the importer) when
/// `by_source`, as a bundler resolves them, rather than as the sibling `.mjs` files `compile_modules` names.
pub fn compile_linked(set: &ModuleSet, extra: &[Vec<Stmt>], by_source: bool) -> R<Compiled> {
    compile_linked_as(set, extra, by_source, false, &Default::default())
}
/// CP-4d: `library`, the entry is compiled as a dependency is (`module(__rt)`, its exports), for a JS host that imports
/// an `.rx` module for its components (`./pages.rx?rx-lib`) rather than mounting a program from it. `plans` (MO-13i): the
/// fns that hand JavaScript their result in parts.
pub fn compile_linked_as<'a>(set: &'a ModuleSet, extra: &[Vec<Stmt>], by_source: bool, library: bool, plans: &'a crate::check::Plans) -> R<Compiled> {
    let programs: Vec<&Program> = set.order.iter().map(|p| &set.programs[p]).collect();
    let mut g = Gen::new(usage(&programs, extra), set);
    g.by_source = by_source;
    g.plans = Some(plans);
    let mut files = IndexMap::new();
    let mut paths = IndexMap::new();
    let mut module_css = IndexMap::new();
    for path in &set.order {
        let p = &set.programs[path];
        let css0 = g.css.len();
        g.begin_module(path, p);
        let mut deps: Vec<&str> = vec![];
        // MO-13c: a module a JS import's printed signature stands for is the compiled JavaScript that import names,
        // whose `__rx` is the module's factory
        let mut compiled: HashMap<&str, &str> = HashMap::new();
        for d in &p.decls {
            if let Decl::Import { resolved: Some(r), from, through, .. } = d {
                // MO-6e: an import a signature's re-export sent to the declaring module is reached through the module it named
                let r = through.as_ref().map_or(r, |t| &t.resolved);
                if !deps.contains(&r.as_str()) {
                    deps.push(r);
                }
                if !crate::modules::is_rx(from) {
                    compiled.insert(r, from);
                }
            }
        }
        let mut body: Vec<S> = deps
            .iter()
            .map(|d| match compiled.get(d) {
                Some(from) => S::ImportNamed(vec![("__rx".to_string(), g.dep_var(d))], from.to_string()),
                None => S::ImportDefault(g.dep_var(d), if by_source { relative(path, d) } else { format!("./{}", g.out(d)) }),
            })
            .collect();
        if *path == set.entry && !library {
            let root = g.new_env(None);
            let inner = g.block(&p.decls, &p.view, root, None, true)?;
            body.append(&mut g.top);
            body.push(S::ExportDefault(Func {
                name: Some("main".into()),
                params: vec![P::Id("__rt".into())],
                directives: vec![],
                body: vec![konst("__B", dot(id("__rt"), "B")), S::Return(Some(arrow_block(vec![], inner, false)))],
                is_async: false,
                generator: false,
            }));
        } else {
            let exported: Vec<&str> = p.decls.iter().filter(|d| d.exported() && !matches!(d, Decl::TypeDecl { .. })).filter_map(|d| d.name()).collect();
            let is_comp = |n: &str| p.decls.iter().any(|d| matches!(d, Decl::Component { name, .. } if name == n)) || made_component(p, n, &set.declarations); // MO-11j
            let mut props: Vec<Prop> = exported.iter().map(|n| Prop::Kv(Key::Str(n.to_string()), id(if is_comp(n) { cm(n) } else { mg(n) }))).collect();
            // MO-6e: what the module re-exports, handed on as it binds it (a package's entry is imported by its own name)
            for d in &p.decls {
                if let Decl::Import { reexport: true, resolved: Some(r), names, .. } = d {
                    for n in names {
                        if !g.is_type(r, &n.name) {
                            props.push(Prop::Kv(Key::Str(n.alias.clone()), id(g.import_bind(r, &n.name, &n.alias).js)));
                        }
                    }
                }
            }
            let tail = E::Obj(props);
            let root = g.new_env(None);
            let mut inner = g.block(&p.decls, &[], root, Some(tail), false)?;
            body.append(&mut g.top);
            let mut fbody = vec![konst("__B", dot(id("__rt"), "B"))];
            // MO-13i: a package is compiled apart from the app whose runtime it runs on
            if p.decls.iter().any(|d| plans.contains_key(&(d as *const Decl))) {
                fbody.push(S::IfThen(E::Un("!", Box::new(rt("result"))), Box::new(S::Throw(call(id("Error"), vec![str(format!("{}: a package compiled by this version of ReactiveScript needs @reactivescript/runtime of the same version or newer: upgrade it in the app (09 MO-13i)", path.rsplit('/').next().unwrap_or(path)))])))));
            }
            fbody.append(&mut inner);
            body.push(S::ExportDefault(Func { name: Some("module".into()), params: vec![P::Id("__rt".into())], directives: vec![], body: fbody, is_async: false, generator: false }));
        }
        module_css.insert(g.out(path), g.css[css0..].join("\n"));
        files.insert(g.out(path), body);
        paths.insert(g.out(path), path.clone());
    }
    Ok(Compiled { files, paths, entry: g.out(&set.entry), css: g.css.join("\n"), module_css })
}

struct Gen<'p> {
    /// MO-10i: expressions written where a read of a draft needs no copy: handed straight back to the library (a value
    /// written to a draft's path, the callback's result, an argument of a draft's own method), or consumed by an operator
    /// that makes a primitive of them
    raw: HashSet<*const Expr>,
    /// C-2: a whole store read there is copied
    kept: HashSet<*const Expr>,
    /// declarations the lowering made
    made: Vec<std::rc::Rc<Decl>>,
    /// MO-10i: the arguments of a JS fn's call, with the fn's name: a draft read there is lent (`__rt.lend`)
    lent: HashMap<*const Expr, String>,
    /// MO-10i: closures written where a JS fn hands their parameters a draft, with those positions
    draft_closures: HashMap<*const Expr, Vec<usize>>,
    /// MO-10i (2026-11-22): where a name is written as a call's whole argument, in the module being emitted: name →
    /// (callee's name, argument index) — how a closure bound to a name is known to be a draft's callback
    arg_calls: HashMap<String, Vec<(String, usize)>>,
    u: Usage,
    plans: Option<&'p crate::check::Plans>,
    set: &'p ModuleSet,
    file: String,
    /// Modules imported by source path, for a bundler (`compile_linked`), not as sibling `.mjs` files.
    by_source: bool,
    css: Vec<String>,
    /// module-level code: hoisted server functions and the module's error classes
    top: Vec<S>,
    top_fns: HashSet<String>,
    /// RG-7b: the contexts whose `use` is, where emission stands, written in their own provision (the name of what is
    /// above it), or in a block that provides them (None: that block's provision, found as any).
    above: Vec<(String, Option<String>)>,
    up_seq: usize,
    /// a module-level server fn → its hoisted function
    server_names: IndexMap<String, String>,
    mod_decls: &'p [Decl],
    /// MO-11t: the props of the JS components this module imports that take a view
    views: crate::modules::ViewProps,
    /// what the module imports from JavaScript for its types alone
    type_only: HashSet<String>,
    /// an equation's hoisted awaits were just written, for its accessor to claim (`reg`)
    claims: bool,
    sf_seq: usize,
    /// CSS-2: the scope class of the view being emitted
    style_hash: Option<String>,
    hoisted: HashMap<*const Expr, String>,
    /// R-f-4a: an await a `catch` takes, settled to the failure: the answer its reader computes
    settled: HashMap<*const Expr, E>,
    hoisted_catch: HashMap<*const Expr, String>,
    hoist_seq: usize,
    frames: Vec<Frame>,
    style_ids: u32,
    /// RG-4c: `props.f`, in a component that shows that view
    shown: Vec<String>,
    /// by module
    types: std::cell::RefCell<HashMap<String, std::rc::Rc<Types>>>,
}

const AWAIT_NOT_LOWERED: &str = "`await` outside an equation's result position is not lowered yet";

/// MO-10: the scenario prelude's `./prims`, a JS module of Solid primitives (`ref/compile/prims-solid.ts`).
fn is_prims(from: &str) -> bool {
    from == "prims" || from == "prims.js" || from.ends_with("/prims") || from.ends_with("/prims.js")
}

impl<'p> Gen<'p> {
    /// A JS import that becomes a real ES import (MO-8): a package's always; a relative one too when the modules go to a
    /// bundler (`by_source`, the product), where `./util.js` is the app's own file. `./api` stays the app's injected API
    /// (`createApp({ api })`, CP-4), and in the scenario runners every relative import is the harness's.
    fn js_import(&self, from: &str) -> bool {
        !from.starts_with('.') || (self.by_source && from != "./api")
    }
    /// SV-5a: the module a declared JS error class is identified by: a package's specifier, or the app's own `.d.rx`
    /// as `modules::package_relative` names it — after its named package, else below the nearest package.json above it,
    /// else by its own name: the same from every entry, in every checkout and on every machine. No machine path in a
    /// client bundle.
    fn class_module(&self, from: &str, declared: Option<&str>) -> String {
        match declared.filter(|_| from.starts_with('.')) {
            Some(dts) => self.set.declaration_ids.get(dts).cloned().unwrap_or_else(|| dts.rsplit('/').next().unwrap_or(dts).to_string()),
            None => from.to_string(),
        }
    }
    fn new(u: Usage, set: &'p ModuleSet) -> Self {
        Gen {
            u,
            plans: None,
            set,
            file: "main.rx".into(),
            by_source: false,
            css: vec![],
            top: vec![],
            top_fns: HashSet::new(),
            above: vec![],
            up_seq: 0,
            server_names: IndexMap::new(),
            mod_decls: &[],
            views: Default::default(),
            claims: false,
            type_only: HashSet::new(),
            sf_seq: 0,
            style_hash: None,
            hoisted: HashMap::new(),
            settled: HashMap::new(),
            hoisted_catch: HashMap::new(),
            hoist_seq: 0,
            frames: vec![],
            style_ids: 0,
            shown: vec![],
            types: Default::default(),
            raw: HashSet::new(),
            kept: HashSet::new(),
            made: vec![],
            lent: HashMap::new(),
            draft_closures: HashMap::new(),
            arg_calls: HashMap::new(),
        }
    }
    // ---- environments
    fn new_env(&mut self, parent: Option<Env>) -> Env {
        self.frames.push(Frame { vars: IndexMap::new(), parent });
        self.frames.len() - 1
    }
    fn set(&mut self, env: Env, n: &str, b: Bind) {
        self.frames[env].vars.insert(n.to_string(), b);
    }
    fn lookup(&self, env: Env, n: &str) -> Option<Bind> {
        let mut e = Some(env);
        while let Some(i) = e {
            if let Some(b) = self.frames[i].vars.get(n) {
                return Some(b.clone());
            }
            e = self.frames[i].parent;
        }
        None
    }
    fn params(&mut self, env: Env, ps: &[String]) -> Env {
        let e = self.new_env(Some(env));
        for p in ps {
            self.set(e, p, val(mg(p)));
        }
        e
    }

    // ---- modules
    fn out(&self, path: &str) -> String {
        if path == self.set.entry {
            "main.mjs".into()
        } else if let Some(i) = self.set.order.iter().position(|p| p == path) {
            format!("m{i}.mjs")
        } else {
            let base = path.rsplit('/').next().unwrap();
            format!("{}.mjs", base.strip_suffix(".rx").unwrap_or(base))
        }
    }
    fn mod_index(&self, path: &str) -> i64 {
        self.set.order.iter().chain(self.set.signatures.keys()).position(|p| p == path).map(|i| i as i64).unwrap_or(-1)
    }
    fn dep_var(&self, path: &str) -> String {
        format!("__m{}", self.mod_index(path))
    }
    /// Begin a module: what a hoisted server function may name at module level (SF-3: imports, error classes, server fns).
    fn begin_module(&mut self, path: &str, p: &'p Program) {
        let decls = &p.decls[..];
        self.type_only = type_only(p, self.set);
        self.file = path.to_string();
        self.top = vec![];
        self.top_fns = HashSet::new();
        self.mod_decls = decls;
        self.views = crate::modules::ViewProps::of(self.set, decls);
        self.arg_calls = crate::check::scope_facts(&serde_json::json!({ "decls": crate::ast::decls_json(decls), "view": [] })).arg_calls;
        self.server_names = IndexMap::new();
        for d in decls {
            match d {
                Decl::Server { name, .. } => {
                    self.server_names.insert(name.clone(), format!("sf${name}"));
                }
                Decl::Eq { name, e, .. } if unwrap_server(e).is_some() => {
                    self.server_names.insert(name.clone(), format!("sf${name}"));
                }
                _ => {}
            }
        }
        // a package's JS (`@solidjs/web/server-functions`): a real import at module level, where a hoisted server fn's wrappers are
        for d in decls {
            if let Decl::Import { resolved: None, from, names, declared, .. } = d {
                if !self.js_import(from) {
                    continue;
                }
                if names.is_empty() {
                    // 07 §1a: for its effect
                    self.top.push(S::ImportBare(from.clone()));
                    continue;
                }
                // a type its declaration file declares binds nothing: the JS module exports no such name
                let is_type = |n: &str| declared.as_ref().and_then(|dp| self.set.declarations.get(dp)).is_some_and(|ds| ds.iter().any(|y| matches!(y, JsDecl::Type { name, .. } if name == n)));
                let ns: Vec<(String, String)> = names.iter().filter(|n| !in_prelude(d, &n.name, self.set.conformance) && !is_type(&n.name) && !self.type_only.contains(&n.alias)).map(|n| (n.name.clone(), format!("w${}", n.alias))).collect();
                if !ns.is_empty() {
                    self.top.push(S::ImportNamed(ns, from.clone()));
                }
            }
        }
    }
    /// SF-1d: a wrapped server fn — the wrapper calls kept around it at module level, where Solid's directive pass finds it.
    fn server_wrapped(&mut self, name: &str, e: &Expr) -> R<String> {
        // a server fn below module level has no hoisted name: the reference writes `const undefined = …` (and reads it back)
        let f = self.server_names.get(name).cloned().unwrap_or("undefined".into());
        let v = self.chain(name, e)?;
        self.top.push(konst(f.clone(), v));
        Ok(f)
    }
    fn chain(&mut self, name: &str, x: &Expr) -> R<E> {
        match &x.k {
            ExprKind::ServerFn { params, body, .. } => self.server_hoist(name, params, body, true),
            ExprKind::Call { f, args, .. } if matches!(&f.k, ExprKind::Id(_)) => {
                let ExprKind::Id(fname) = &f.k else { unreachable!() };
                let found = self.mod_decls.iter().any(|d| matches!(d, Decl::Import { resolved: None, from, names, .. } if self.js_import(from) && names.iter().any(|n| &n.alias == fname)));
                if !found {
                    return fail(format!("{name}: a server fn's wrapper is a package's function (here, {fname})"));
                }
                let mut out = vec![];
                for a in args {
                    out.push(if unwrap_server(a).is_some() {
                        self.chain(name, a)?
                    } else if let ExprKind::Lit(l) = &a.k {
                        lit(l)
                    } else {
                        return fail(format!("{name}: a wrapper's other arguments are literals"));
                    });
                }
                Ok(call(id(format!("w${fname}")), out))
            }
            _ => fail(format!("{name}: not a wrapped server fn")),
        }
    }
    /// 12 SF-7a: a server fn as Solid's `"use server"` function at module level — it may name only its parameters, its locals
    /// and module-level bindings, which SF-3 makes always possible: every name a body may use is a module-level import, error
    /// class or server fn, bound here from the calling app.
    fn server_hoist(&mut self, name: &str, params: &[String], body: &[Stmt], expression: bool) -> R<E> {
        let f = match self.server_names.get(name) {
            Some(f) if !expression && !self.top_fns.contains(f) => f.clone(),
            _ => {
                let f = format!("sf${name}${}", self.sf_seq);
                self.sf_seq += 1;
                f
            }
        };
        let env = self.new_env(None);
        let mut pre: Vec<S> = vec![];
        let decls = self.mod_decls;
        for x in decls {
            match x {
                Decl::Import { resolved: None, names, from, declared_errors, declared, .. } => {
                    for n in &with_methods(names, declared.as_ref().and_then(|dp| self.set.declarations.get(dp))) {
                        if in_prelude(x, &n.name, self.set.conformance) {
                            continue;
                        }
                        if self.js_import(from) {
                            self.set(env, &n.alias, val(format!("w${}", n.alias)));
                            continue;
                        }
                        self.set(env, &n.alias, val(mg(&n.alias)));
                        let v = if declared_errors.as_ref().is_some_and(|e| e.contains(&n.name)) { "jsError" } else { "api" };
                        pre.push(konst(mg(&n.alias), rtc(v, vec![str(n.name.clone())])));
                    }
                }
                Decl::Error { name, .. } => {
                    self.set(env, name, val(mg(name)));
                    pre.push(konst(mg(name), call(id(format!("g${name}")), vec![id("__rt")])));
                }
                Decl::Server { name, .. } => {
                    let js = self.server_names[name].clone();
                    self.set(env, name, val(js));
                }
                Decl::Eq { name, e, .. } if unwrap_server(e).is_some() => {
                    let js = self.server_names[name].clone();
                    self.set(env, name, val(js));
                }
                // a value fn (SF-3: it reads nothing reactive)
                Decl::Fn { name, params, decls: ds, tail, named, .. } if !instantiates(params, ds, tail, *named) => {
                    let mut b = bind(Kind::Fn, mg(name));
                    b.f = Some(FnRef { params: params.iter().map(|p| (p.name.clone(), p.r#ref)).collect(), decl: Some(x as *const Decl) });
                    self.set(env, name, b);
                }
                _ => {}
            }
        }
        // declared again inside: the body is extracted with it (found by S-app-notes)
        for x in decls {
            if let Decl::Fn { name, .. } = x {
                if self.frames[env].vars.get(name).and_then(|b| b.f.as_ref()).and_then(|f| f.decl) == Some(x as *const Decl) {
                    pre.push(self.fn_decl(x, env)?);
                }
            }
        }
        let penv = self.params(env, params);
        let body = self.stmts(body, penv, &Ctx { imp: true, gen: true, ..Ctx::default() }, false)?;
        let mut fbody = vec![konst("__rt", dot(id("globalThis"), "__rx_app")), konst("__B", dot(id("__rt"), "B"))];
        fbody.extend(pre);
        fbody.push(S::Return(Some(rtc(
            "serverCall",
            vec![
                str(name),
                E::Func(Box::new(Func { name: None, params: params.iter().map(|p| P::Id(mg(p))).collect(), directives: vec![], body, is_async: false, generator: true })),
                id("__a"),
            ],
        ))));
        let func = Func { name: Some(f.clone()), params: vec![P::Rest("__a".into())], directives: vec!["use server".into()], body: fbody, is_async: true, generator: false };
        if expression {
            return Ok(E::Func(Box::new(func)));
        }
        self.top_fns.insert(f.clone());
        self.top.push(S::Func(func));
        Ok(id(f))
    }

    // ---- blocks: a region's declarations, then its view
    fn block(&mut self, decls: &[Decl], view: &[Markup], env: Env, exports_tail: Option<E>, style_root: bool) -> R<Vec<S>> {
        // RG-7b: a `use` in a block that provides its context is that block's provision, not what an enclosing provision's
        // expression reads above
        let n = self.above.len();
        for d in decls {
            if let Decl::Provide { name, .. } = d {
                self.above.push((name.clone(), None));
            }
        }
        let out = self.block_styled(decls, view, env, exports_tail, style_root);
        self.above.truncate(n);
        out
    }
    fn block_styled(&mut self, decls: &[Decl], view: &[Markup], env: Env, exports_tail: Option<E>, style_root: bool) -> R<Vec<S>> {
        let prev = self.style_hash.clone();
        if style_root {
            // a component's view (or the program's) has its own scope; a branch keeps its view's
            self.style_hash = self.style(view)?;
        }
        let r = self.block0(decls, view, env, exports_tail);
        self.style_hash = prev;
        r
    }
    fn tsrx_file(&self) -> String {
        self.file.strip_suffix(".rx").unwrap_or(&self.file).to_string()
    }
    /// 07 CSS-5: a style expression through TSRX's engine — its class map literal; its stylesheet joins the module's.
    fn class_map(&mut self, css: &str, line: usize) -> R<E> {
        use solidjs_compiler::style::*;
        let filename = format!("{}.{line}.tsrx", self.tsrx_file());
        // `export const __s = <style>…`: the element the reference compiles starts at line 1, column 19
        let r = compile_style(StyleInput { css, location: StyleLocation { filename: &filename, line: 1, column: 19 }, elements: &[], kind: StyleKind::Expression, minify: false })
            .map_err(|e| CompileError(format!("<style> (line {line}): {}", e.message)))?;
        if !r.css.is_empty() {
            self.css.push(r.css);
        }
        let map = E::Obj(r.class_map.into_iter().map(|c| Prop::Kv(Key::Str(c.class_name), str(c.value))).collect());
        Ok(call(dot(id("Object"), "freeze"), vec![map]))
    }
    /// 07 §6b: a view's <style> through TSRX's engine (Solid's compiler): the view's elements as TSRX sees the fragment the
    /// reference compiles — HTML elements with their static attributes, components with the children passed to them, and
    /// every region (a branch, a loop body, a boundary) as an expression TSRX matches conservatively, as it does its own
    /// control flow. Its scoped stylesheet joins the module's; its hash is the view's scope class.
    fn style(&mut self, view: &[Markup]) -> R<Option<String>> {
        use solidjs_compiler::style::*;
        let Some((css, line)) = view.iter().find_map(|m| if let MarkupKind::Style(css) = &m.kind { Some((css.clone(), m.line)) } else { None }) else { return Ok(None) };
        // what the fragment's markup contributes: at the root a container is transparent; inside an element it is a
        // `Dynamic` child followed by what it holds
        enum Item {
            El(Element),
            Container(Vec<Item>),
        }
        fn tree(g: &mut Gen, ms: &[Markup]) -> Vec<Item> {
            let mut out = vec![];
            for m in ms {
                match &m.kind {
                    MarkupKind::Text(_) | MarkupKind::Style(_) | MarkupKind::Portal { .. } => {}
                    MarkupKind::Read(_) => out.push(Item::Container(vec![])),
                    MarkupKind::El { tag, attrs, children } if tag.is_empty() => out.extend(tree(g, children)),
                    MarkupKind::El { tag, .. } if g.shown.contains(tag) => out.push(Item::Container(vec![])),   // RG-4c: the caller's
                    MarkupKind::El { tag, attrs, children } => {
                        g.style_ids += 1;
                        let kind = if tag.as_bytes()[0].is_ascii_lowercase() { ElementKind::Native(tag.clone()) } else { ElementKind::Component };
                        let attributes = attrs
                            .iter()
                            .filter(|a| !is_handler(&a.name) && a.name != "...")
                            .map(|a| Attribute {
                                name: a.name.clone(),
                                value: match &a.e.k {
                                    ExprKind::Lit(Lit::Str(s)) => Some(AttributeValue::Static(s.clone())),
                                    ExprKind::Lit(Lit::Bool(true)) => None,
                                    _ => Some(AttributeValue::Dynamic),
                                },
                            })
                            .collect();
                        let kids = flatten(tree(g, children));
                        out.push(Item::El(Element { id: g.style_ids, kind, attributes, has_spread: attrs.iter().any(|a| a.name == "..."), children: kids }));
                    }
                    MarkupKind::Mif { t, f, .. } => {
                        out.push(Item::Container(tree(g, t)));
                        out.push(Item::Container(tree(g, f)));
                    }
                    MarkupKind::Mfor { body, .. } | MarkupKind::Mview { body, .. } => out.push(Item::Container(tree(g, body))),
                    MarkupKind::Loading { fallback, body, .. } | MarkupKind::Errored { fallback, body, .. } => {
                        out.push(Item::Container(tree(g, fallback)));
                        out.push(Item::Container(tree(g, body)));
                    }
                }
            }
            out
        }
        fn flatten(items: Vec<Item>) -> Vec<ElementChild> {
            let mut out = vec![];
            for i in items {
                match i {
                    Item::El(e) => out.push(ElementChild::Element(e)),
                    Item::Container(xs) => {
                        out.push(ElementChild::Dynamic);
                        out.extend(flatten(xs));
                    }
                }
            }
            out
        }
        fn roots(items: Vec<Item>, out: &mut Vec<Element>) {
            for i in items {
                match i {
                    Item::El(e) => out.push(e),
                    Item::Container(xs) => roots(xs, out),
                }
            }
        }
        let items = tree(self, view);
        let mut elements = vec![];
        roots(items, &mut elements);
        let filename = format!("{}.tsrx", self.tsrx_file());
        // `export const __view = () => <><style>…`: the element starts at line 1, column 30
        let r = compile_style(StyleInput { css: &css, location: StyleLocation { filename: &filename, line: 1, column: 30 }, elements: &elements, kind: StyleKind::Block, minify: false })
            .map_err(|e| CompileError(format!("<style> (line {}): {}", line.map(|l| l.to_string()).unwrap_or("?".into()), e.message)))?;
        self.css.push(r.css);
        Ok(Some(r.hash))
    }

    fn block0(&mut self, decls: &[Decl], view: &[Markup], env: Env, exports_tail: Option<E>) -> R<Vec<S>> {
        let mut out: Vec<S> = vec![konst("__o", rtc("owner", vec![]))];
        // MO-1: each .rx dependency instantiated (once per app), its exports bound by name
        let mut instantiated: HashSet<String> = HashSet::new();
        let mut bound: HashSet<String> = HashSet::new();
        for d in decls {
            let Decl::Import { resolved: Some(r), names, from, through, .. } = d else { continue };
            let n0 = out.len();
            let via = through.as_ref().map_or(r, |t| &t.resolved); // MO-6e: the module the code reaches the names through
            let iv = format!("__i{}", self.mod_index(via));
            if instantiated.insert(iv.clone()) {
                // MO-1b: once per app. A bundler's module is one factory function wherever it is imported from, so by source the
                // factory is its own key: a module shared by two programs gets the same key in both (11 CP-7). MO-13c: so is
                // the compiled module a printed signature stands for, in every build.
                let key = if self.by_source || !crate::modules::is_rx(from) { id(self.dep_var(via)) } else { str(self.out(via)) };
                out.push(konst(iv.clone(), rtc("module", vec![key, id(self.dep_var(via))])));
            }
            for n in names {
                if self.is_type(r, &n.name) {
                    continue; // a type binds nothing
                }
                // MO-6e: a name used here and given on (`import { A }` beside `export { A }`, one export of one module) is one binding
                if !bound.insert(n.alias.clone()) {
                    continue;
                }
                let mut ib = self.import_bind(r, &n.name, &n.alias);
                if ib.kind == Kind::Acc && self.u.prev_of.contains(&n.alias) {
                    ib.prev = Some(format!("p${}", n.alias));
                }
                let (js, prev) = (ib.js.clone(), ib.prev.clone());
                self.set(env, &n.alias, ib);
                let there = through.as_ref().and_then(|t| t.names.iter().find(|(a, _)| *a == n.alias).map(|(_, x)| x.clone())).unwrap_or_else(|| n.name.clone());
                out.push(konst(js.clone(), E::Index(Box::new(id(iv.clone())), Box::new(str(there)), false)));
                if let Some(p) = prev {
                    out.push(konst(p, rtc("pre", vec![id(js)])));
                }
            }
            at(&mut out, n0, d.line());
        }
        // names first: hoisted functions and components; every other declaration is a const
        for d in decls {
            match d {
                Decl::Import { resolved: Some(_), .. } => {}
                Decl::Import { names, pure, side, declared_side, declared, .. } => {
                    for n in &with_methods(names, declared.as_ref().and_then(|dp| self.set.declarations.get(dp))) {
                        // MO-10a: a declared primitive
                        let x = declared.as_ref().and_then(|dp| self.set.declarations.get(dp)).and_then(|ds| ds.iter().find(|y| y.name() == n.name));
                        if let Some(JsDecl::Fn { params, refs, shape, drafts, part_drafts, .. }) = x.filter(|x| x.instance(declared.as_deref().unwrap_or(""), *pure)) {
                            let mut b = bind(Kind::Jfn, mg(&n.alias));
                            b.f = Some(FnRef { params: params.iter().enumerate().map(|(i, p)| (p.clone(), refs.get(i).copied().unwrap_or(false))).collect(), decl: None });
                            b.shape = Some(shape.clone());
                            b.drafts = drafts.clone();
                            b.part_drafts = part_drafts.clone();
                            b.js_fn = true;
                            self.set(env, &n.alias, b);
                            continue;
                        }
                        // MO-11a: a JS component is a JSX tag
                        if let Some(JsDecl::Comp { .. }) = x {
                            let mut c = bind(Kind::Comp, cm(&n.alias));
                            c.shape = Some(FShape::Comp);
                            self.set(env, &n.alias, c);
                            continue;
                        }
                        let mut b = val(mg(&n.alias));
                        b.client = *side == Some(crate::ast::Side::Client)
                            || declared_side.as_ref().is_some_and(|ds| ds.iter().any(|(k, s)| *k == n.name && *s == crate::ast::Side::Client));
                        if let Some(JsDecl::Fn { drafts, part_drafts, draft_args, .. }) = x {
                            b.drafts = drafts.clone();
                            b.part_drafts = part_drafts.clone();
                            b.draft_args = draft_args.clone();
                        }
                        b.js_fn = true;
                        self.set(env, &n.alias, b);
                    }
                }
                Decl::Fn { name, params, decls: ds, tail, named, .. } => {
                    let mut b = bind(if instantiates(params, ds, tail, *named) { Kind::Ifn } else { Kind::Fn }, mg(name));
                    b.f = Some(FnRef { params: params.iter().map(|p| (p.name.clone(), p.r#ref)).collect(), decl: Some(d as *const Decl) });
                    self.set(env, name, b);
                }
                Decl::Component { name, .. } => {
                    let mut b = bind(Kind::Comp, cm(name));
                    b.plain = takes_plain(d, &self.types(&self.file));
                    b.kids_value = kids_as_value(d, &self.types(&self.file));
                    self.set(env, name, b)
                }
                Decl::Action { name, .. } => self.set(env, name, bind(Kind::Act, mg(name))),
                Decl::Server { name, .. } | Decl::Error { name, .. } => self.set(env, name, val(mg(name))),
                Decl::Context { name, ty, .. } => {
                    // RG-4c: a context that holds a view
                    let mut b = val(mg(name));
                    b.view_ctx = crate::modules::view_ctx(ty.as_deref(), &self.types(&self.file)).is_some();
                    self.set(env, name, b)
                }
                Decl::Source { name, .. } => {
                    let mut b = bind(Kind::Src, mg(name));
                    b.w = Some(format!("w${name}"));
                    b.prev = self.u.prev_of.contains(name).then(|| format!("p${name}"));
                    self.set(env, name, b);
                }
                // SF-1d: a server fn, not an accessor
                Decl::Eq { name, e, .. } if unwrap_server(e).is_some() => self.set(env, name, val(mg(name))),
                Decl::Eq { name, e, deferred, .. } => {
                    let mut b = bind(Kind::Acc, mg(name));
                    if let ExprKind::Call { f, .. } = &e.k {
                        if let ExprKind::Id(fname) = &f.k {
                            // MO-11f: a factory's component is a JSX tag
                            if self.lookup(env, fname).is_some_and(|x| x.kind == Kind::Jfn && x.shape == Some(FShape::Comp)) {
                                let mut c = bind(Kind::Comp, cm(name));
                                c.inst = Some(cm(name));
                                c.shape = Some(FShape::Comp);
                                self.set(env, name, c);
                                continue;
                            }
                            if let Some(jf) = self.lookup(env, fname).filter(|x| x.kind == Kind::Jfn) {
                                b.inst = Some(format!("r${name}"));
                                b.shape = jf.shape.clone();
                                b.part_drafts = jf.part_drafts.clone(); // MO-10i
                            } else if let Some(jf) = self.lookup(env, fname) {
                                b.part_drafts = jf.part_drafts.clone();
                            }
                        }
                    }
                    // MO-10i: a result's function part that takes drafts, bound to a name; an alias of the result
                    match &e.k {
                        ExprKind::Id(on) => {
                            if let Some(ob) = self.lookup(env, on) {
                                b.part_drafts = ob.part_drafts.clone();
                            }
                        }
                        ExprKind::Member { .. } | ExprKind::Index { .. } => {
                            if let Some(d) = self.part_drafts_of(e, env) {
                                b.drafts = d;
                            }
                        }
                        _ => {}
                    }
                    if self.guessed_eq(name, e, *deferred) {
                        b.w = Some(format!("w${name}"));
                    }
                    b.prev = self.u.prev_of.contains(name).then(|| format!("p${name}"));
                    self.set(env, name, b);
                }
                _ => {}
            }
        }
        // RG-4b: the equations that are projections of the component's props, in whatever order they are written
        let mut more = true;
        while std::mem::take(&mut more) {
            for d in decls {
                let Decl::Eq { name, e, deferred: false, key: None, .. } = d else { continue };
                if unwrap_server(e).is_some() || self.guessed_eq(name, e, false) || self.frames[env].vars.get(name).is_none_or(|b| b.given.is_some()) {
                    continue;
                }
                if let Some(g) = self.given(e, env) {
                    self.frames[env].vars.get_mut(name).unwrap().given = Some(g);
                    more = true;
                }
            }
        }
        for d in decls {
            let Decl::Import { resolved: None, names, from, declared_errors, declared_error_fields, declared, .. } = d else { continue };
            let n0 = out.len();
            for n in names {
                let (name, alias) = (&n.name, &n.alias);
                if self.type_only.contains(alias) {
                    continue;
                }
                // a type its declaration file declares binds nothing
                if declared.as_ref().and_then(|dp| self.set.declarations.get(dp)).is_some_and(|ds| ds.iter().any(|y| matches!(y, JsDecl::Type { name: tn, .. } if tn == name))) {
                    continue;
                }
                let v = if in_prelude(d, name, self.set.conformance) {
                    dot(id("__B"), name)
                } else if self.js_import(from) {
                    if declared_errors.as_ref().is_some_and(|e| e.contains(name)) {
                        // SV-5a: a declared JS error class, by its declaration's identity (the same on server and client)
                        let mut a = vec![id(format!("w${alias}")), str(format!("{}#{}", self.class_module(from, declared.as_deref()), name))];
                        if let Some((_, fs)) = declared_error_fields.as_ref().and_then(|xs| xs.iter().find(|(k, _)| k == name)) {
                            a.push(E::Arr(fs.iter().map(|f| str(f.clone())).collect()));
                        }
                        rtc("jsClass", a)
                    } else {
                        id(format!("w${alias}"))
                    }
                } else if declared_errors.as_ref().is_some_and(|e| e.contains(name)) {
                    rtc("jsError", vec![str(name.clone())])
                } else if from.ends_with("/api") {
                    rtc("api", vec![str(name.clone())])
                } else if is_prims(from) {
                    // MO-10: the scenario prelude's Solid primitives
                    rtc("prim", vec![str(name.clone())])
                } else {
                    return fail(format!("{name} from \"{from}\" is not in the scenario prelude"));
                };
                let js = if self.lookup(env, alias).is_some_and(|b| b.kind == Kind::Comp) { cm(alias) } else { mg(alias) };
                out.push(konst(js.clone(), v));
                out.extend(self.reg(alias, vec![("value", id(js))]));
            }
            at(&mut out, n0, d.line());
        }
        for d in decls {
            let Decl::Error { name, params, msg, .. } = d else { continue };
            let inner = self.params(env, params);
            let body = match msg {
                Some(m) => self.expr(m, inner, &reactive())?,
                None => str(name.clone()),
            };
            let make = rtc(
                "errorClass",
                vec![str(name.clone()), strs(params), E::Arrow { params: params.iter().map(|p| P::Id(mg(p))).collect(), body: Body::Expr(Box::new(body)), is_async: false }],
            );
            if self.frames[env].parent.is_some() {
                out.push(S::At(d.line(), Box::new(konst(mg(name), make)))); // R-f-1
                continue;
            }
            let t0 = self.top.len();
            // a module's error class is the module's, created once (by whichever app asks first): a server function's body,
            // hoisted to module level (SF-7a), throws the class an action's catch tests
            self.top.push(S::Let(format!("c${name}"), None));
            self.top.push(S::Func(Func {
                name: Some(format!("g${name}")),
                params: vec![P::Id("__rt".into())],
                directives: vec![],
                body: vec![konst("__B", dot(id("__rt"), "B")), S::Return(Some(E::Assign("??=", Box::new(id(format!("c${name}"))), Box::new(make))))],
                is_async: false,
                generator: false,
            }));
            at(&mut self.top, t0, d.line());
            out.push(S::At(d.line(), Box::new(konst(mg(name), call(id(format!("g${name}")), vec![id("__rt")]))))); // R-f-1
        }
        for d in decls {
            let Decl::Context { name, dflt, .. } = d else { continue };
            let n0 = out.len();
            let dv = match dflt {
                Some(x) => thunk(self.expr(x, env, &reactive())?),
                None => E::Null,
            };
            // RG-7: the declaration is the context's identity
            out.push(konst(mg(name), rtc("context", vec![str(name.clone()), dv])));
            out.extend(self.reg(name, vec![("value", id(mg(name)))]));
            at(&mut out, n0, d.line());
        }
        for d in decls {
            if let Decl::Fn { .. } = d {
                let s = self.fn_decl(d, env)?;
                out.push(S::At(d.line(), Box::new(s)));
            }
        }
        for d in decls {
            if let Decl::Component { .. } = d {
                let s = self.component(d, env)?;
                out.push(S::At(d.line(), Box::new(s)));
            }
        }
        for d in decls {
            let Decl::Action { name, params, body, ret, .. } = d else { continue };
            let n0 = out.len();
            let penv = self.params(env, params);
            // AC-1i (B10): an action that answers at the call is a plain function, its body a handler's
            let now = ret.is_some();
            let body = self.stmts(body, penv, &Ctx { imp: true, gen: !now, ..Ctx::default() }, false)?;
            let gen = E::Func(Box::new(Func { name: None, params: params.iter().map(|p| P::Id(mg(p))).collect(), directives: vec![], body, is_async: false, generator: !now }));
            out.push(konst(mg(name), rtc(if now { "now" } else { "action" }, vec![gen])));
            out.extend(self.reg(name, vec![("value", id(mg(name)))]));
            at(&mut out, n0, d.line());
        }
        for d in decls {
            let Decl::Eq { name, e, .. } = d else { continue };
            if unwrap_server(e).is_none() {
                continue;
            }
            // 12 SF-1d: a wrapped server fn, at module level
            let f = self.server_wrapped(name, e)?;
            out.push(S::At(d.line(), Box::new(konst(mg(name), rtc("serverRef", vec![str(name.clone()), id(f)])))));
        }
        for d in decls {
            let Decl::Server { name, params, body, .. } = d else { continue };
            // 12 SF-7a: the call site's (question or request); the function is module-level
            let f = self.server_hoist(name, params, body, false)?;
            out.push(S::At(d.line(), Box::new(konst(mg(name), rtc("serverRef", vec![str(name.clone()), f])))));
        }
        // values in dependency order (E-7: equations are unordered in the source; C-1 makes this a DAG)
        let vals: Vec<&Decl> = decls
            .iter()
            .filter(|d| matches!(d, Decl::Source { .. } | Decl::Provide { .. }) || matches!(d, Decl::Eq { e, .. } if unwrap_server(e).is_none()))
            .collect();
        let key = |d: &Decl| match d {
            Decl::Provide { name, .. } => format!("provide:{name}"),
            _ => d.name().unwrap().to_string(),
        };
        let local: HashSet<&str> = vals.iter().filter(|d| !matches!(d, Decl::Provide { .. })).filter_map(|d| d.name()).collect();
        let mut done: HashSet<String> = HashSet::new();
        let mut busy: HashSet<String> = HashSet::new();
        let mut order: Vec<&Decl> = vec![];
        fn visit<'d>(d: &'d Decl, vals: &[&'d Decl], local: &HashSet<&str>, key: &dyn Fn(&Decl) -> String, done: &mut HashSet<String>, busy: &mut HashSet<String>, order: &mut Vec<&'d Decl>) {
            let k = key(d);
            if done.contains(&k) || busy.contains(&k) {
                return;
            }
            busy.insert(k.clone());
            let self_name = match d {
                Decl::Provide { .. } => "",
                _ => d.name().unwrap(),
            };
            let e = match d {
                Decl::Eq { e, .. } => e,
                Decl::Source { init, .. } => init,
                Decl::Provide { e, .. } => e,
                _ => unreachable!(),
            };
            let mut ds = IndexSet::new();
            let j = e.to_json();
            deps(&j, self_name, &mut ds);
            for n in &ds {
                if local.contains(n.as_str()) && n != self_name {
                    if let Some(t) = vals.iter().find(|x| !matches!(x, Decl::Provide { .. }) && x.name() == Some(n.as_str())) {
                        visit(t, vals, local, key, done, busy, order);
                    }
                }
            }
            // RG-7b: a block's provision is the block's, wherever it is written in it: what uses it here is made after it
            let own = if let Decl::Provide { name, .. } = d { Some(name.as_str()) } else { None };
            let mut us = IndexSet::new();
            uses_now(&j, false, own, &mut us);
            for c in &us {
                for t in vals.iter() {
                    if matches!(t, Decl::Provide { name, .. } if name == c) {
                        visit(t, vals, local, key, done, busy, order);
                    }
                }
            }
            busy.remove(&k);
            done.insert(k);
            order.push(d);
        }
        for d in &vals {
            visit(d, &vals, &local, &key, &mut done, &mut busy, &mut order);
        }
        for d in order {
            let n0 = out.len();
            let mut v = self.value(d, env)?;
            out.append(&mut v);
            at(&mut out, n0, d.line());
        }
        for d in decls {
            let Decl::Effect { inputs, body, .. } = d else { continue };
            let n0 = out.len();
            let inner = self.new_env(Some(env));
            let mut h = self.hoist_all(&inputs.iter().collect::<Vec<_>>(), env)?;
            out.append(&mut h);
            let mut ins = vec![];
            for i in inputs {
                ins.push(self.expr(i, env, &reactive())?);
            }
            let apply = self.stmts(body, inner, &Ctx { imp: true, effect: true, ..Ctx::default() }, true)?;
            // SC-2: the apply reads σ, untracked
            out.push(sexpr(rtc(
                "effect",
                vec![E::Num(inputs.len() as f64), thunk(E::Arr(ins)), arrow(&["$p"], rtc("untrack", vec![arrow_block(vec![], apply, false)]))],
            )));
            at(&mut out, n0, d.line());
        }
        match exports_tail {
            Some(t) => out.push(S::Return(Some(t))),
            None => {
                let mut h = self.hoist_all(&view_readers(view, &|t| t.starts_with(|c: char| c.is_ascii_uppercase())), env)?;
                out.append(&mut h);
                // a block with no view returns null, which a fn's body drops (strip_return_null)
                let m = if view.is_empty() { E::Null } else { self.markup(view, env)? };
                out.push(S::Return(Some(m)));
            }
        }
        Ok(out)
    }

    /// An imported name's binding, from the exporting module's declaration (MO-3: a source is read-only here, so an accessor).
    /// Whether `name` is a type of the module at `path` (it binds nothing).
    fn is_type(&self, path: &str, name: &str) -> bool {
        self.set.programs.get(path).is_some_and(|p| p.decls.iter().any(|x| matches!(x, Decl::TypeDecl { name: n, .. } if n == name)))
            || self.set.signatures.get(path).and_then(|s| s.exports.get(name)).is_some_and(|x| matches!(x, ExportSig::Type(..)))
    }
    fn import_bind(&self, path: &str, name: &str, alias: &str) -> Bind {
        let js = mg(alias);
        if !self.set.programs.contains_key(path) {
            if let Some(sig) = self.set.signatures.get(path).and_then(|s| s.exports.get(name)) {
                // MO-9: the kind is the signature's
                return match sig {
                    ExportSig::Fn { params, instantiating, .. } => {
                        let mut b = bind(if *instantiating || params.iter().any(|p| p.r#ref) { Kind::Ifn } else { Kind::Fn }, js);
                        b.f = Some(FnRef { params: params.iter().map(|p| (p.name.clone(), p.r#ref)).collect(), decl: None });
                        b
                    }
                    ExportSig::Comp { sig } => {
                        // MO-11j: a made component is a JS component
                        let mut b = bind(Kind::Comp, cm(alias));
                        if sig.made {
                            b.shape = Some(FShape::Comp);
                        }
                        b.plain = sig.props.get("children").and_then(|p| p.view.as_ref()).is_some_and(|v| v.mixed);
                        b
                    }
                    ExportSig::Action => bind(Kind::Act, js),
                    ExportSig::Source { .. } | ExportSig::Eq { .. } => bind(Kind::Acc, js),
                    _ => val(js),
                };
            }
        }
        let Some(d) = self.set.programs.get(path).and_then(|p| p.decls.iter().find(|x| x.name() == Some(name))) else { return val(js) };
        match d {
            Decl::Fn { params, decls, tail, named, .. } => {
                let mut b = bind(if instantiates(params, decls, tail, *named) { Kind::Ifn } else { Kind::Fn }, js);
                b.f = Some(FnRef { params: params.iter().map(|p| (p.name.clone(), p.r#ref)).collect(), decl: Some(d as *const Decl) });
                b
            }
            Decl::Component { .. } => {
                let mut b = bind(Kind::Comp, cm(alias));
                b.plain = takes_plain(d, &self.types(path));
                b.kids_value = kids_as_value(d, &self.types(path));
                b
            }
            Decl::Action { .. } => bind(Kind::Act, js),
            Decl::Eq { .. } if made_component(&self.set.programs[path], name, &self.set.declarations) => {
                // MO-11j: a JS component, applied as JSX's <X />
                let mut b = bind(Kind::Comp, cm(alias));
                b.shape = Some(FShape::Comp);
                b
            }
            Decl::Source { .. } | Decl::Eq { .. } => bind(Kind::Acc, js),
            _ => val(js),
        }
    }

    /// The scenario harness's table of names (CP-4c): a conformance build's, and an app's where an equation's accessor
    /// claims its hoisted awaits. An app has no such table, and one would keep every instance.
    fn reg(&mut self, name: &str, entry: Vec<(&'static str, E)>) -> Option<S> {
        let claims = std::mem::take(&mut self.claims);
        (self.set.conformance || claims).then(|| sexpr(rtc("reg", vec![str(name), obj(entry)])))
    }
    fn reg_get(&mut self, name: &str, b: &Bind, writer: bool) -> Option<S> {
        let mut kv = vec![("get", id(b.js.clone()))];
        if writer {
            kv.push(("w", id(b.w.clone().unwrap())));
        }
        self.reg(name, kv)
    }
    fn value(&mut self, d: &Decl, env: Env) -> R<Vec<S>> {
        if let Decl::Provide { name, e, .. } = d {
            let b = if let ExprKind::Id(n) = &e.k { self.lookup(env, n) } else { None };
            let src = b.as_ref().filter(|b| b.kind == Kind::Src);
            // RG-7b: a `use` of its own context, written in what it is given, is what is above it: read before it is provided
            let n = self.above.len();
            let mut out = vec![];
            if own_use(&e.to_json(), name) {
                let v = format!("up${}", self.up_seq);
                self.up_seq += 1;
                out.push(konst(v.clone(), rtc("above", vec![self.reference(name, env, &reactive())?, id("__o")])));
                self.above.push((name.clone(), Some(v)));
            }
            let made = (|| -> R<(Vec<S>, E)> {
                let hoisted = if src.is_some() { vec![] } else { self.hoist_all(&[e], env)? };
                let entry = match src {
                    Some(b) => obj(vec![("get", id(b.js.clone())), ("w", id(b.w.clone().unwrap()))]),
                    None => {
                        let get = if self.given(e, env).is_some_and(|g| g.held()) { self.held(e, env)? } else { rtc("memo", vec![E::Null, thunk(self.expr(e, env, &reactive())?)]) };
                        obj(vec![("get", get)])
                    }
                };
                Ok((hoisted, entry))
            })();
            self.above.truncate(n);
            let (mut hoisted, entry) = made?;
            out.append(&mut hoisted);
            let c = self.reference(name, env, &reactive())?;
            out.push(sexpr(rtc("provide", vec![c, entry])));
            return Ok(out);
        }
        let name = d.name().unwrap();
        let b = self.frames[env].vars.get(name).unwrap().clone();
        let mut out = match d {
            Decl::Source { question: true, init, .. } => self.hoist(Some(name), init, env, true)?,
            Decl::Eq { e, .. } if !matches!(&e.k, ExprKind::Draft { .. }) => {
                self.updater_closure(name, d.line(), e, env);
                let mut v = self.hoist(Some(name), e, env, true)?;
                v.append(&mut self.hoist_catches(name, e, env)?);
                v
            }
            _ => vec![],
        };
        out.append(&mut self.value1(d, env, &b)?);
        Ok(out)
    }
    /// 07 §3 / R-1: each `await` that is not the equation's result is its own async memo, asked only while the conditions that
    /// reach it hold (E-11, awaits.rs); the equation reads it where the `await` was.
    fn hoist(&mut self, name: Option<&str>, e: &Expr, env: Env, tail: bool) -> R<Vec<S>> {
        let mut out = vec![];
        for h in non_tail_awaits(e, tail) {
            let v = format!("a${}${}", name.unwrap_or(""), self.hoist_seq);
            self.hoist_seq += 1;
            let mut guards = vec![];
            for g in &h.guards {
                let x = self.expr(g.e, env, &reactive())?;
                guards.push(if g.nullish { bin("==", x, E::Null) } else if g.neg { not(x) } else { x });
            }
            let ExprKind::Await { e: inner, init, stream } = &h.node.k else { unreachable!() };
            let body0 = self.expr(inner, env, &Ctx { tail: true, ..Ctx::default() })?;
            let body = if *stream { body0 } else { rtc("awaited", vec![body0]) };
            // R-f-4: a matching rejection is settled where it is awaited, as in tail position (05 H-4) — to the failure it
            // caught; the answer is the reader's to compute, outside the await, so that it reads its sources as the rest of
            // the expression does (R-f-4a)
            let body = match h.caught.map(|c| &c.k) {
                Some(ExprKind::Catch { name: cn, classes, alt, .. }) => {
                    let inner = self.new_env(Some(env));
                    if let Some(n) = cn {
                        self.set(inner, n, val(mg(n)));
                    }
                    let cls = self.classes(classes.as_deref(), env)?;
                    let a = self.expr(alt, inner, &reactive())?;
                    let pn = cn.as_ref().map(|n| mg(n)).unwrap_or("__e".into());
                    self.settled.insert(h.node as *const Expr, arrow(&[&pn], a));
                    rtc("settle", vec![thunk(body), arrow(&["__e"], rtc("isA", vec![id("__e"), cls]))])
                }
                _ => body,
            };
            self.hoisted.insert(h.node as *const Expr, v.clone());
            let lv = match init {
                Some(i) => rtc("firstPaint", vec![thunk(self.expr(i, env, &reactive())?)]),
                None => undef(),
            };
            let lv = if self.client_call(inner, env) { rtc("clientQuestion", vec![lv]) } else { lv };
            let f = if guards.is_empty() {
                body
            } else {
                let mut it = guards.into_iter();
                let first = it.next().unwrap();
                let c = it.fold(first, |a, b| bin("&&", a, b));
                E::Cond(Box::new(c), Box::new(body), Box::new(undef()))
            };
            out.push(konst(v.clone(), rtc("memo", vec![name.map(str).unwrap_or(E::Null), thunk(f), lv])));
            if let Some(n) = name {
                out.push(sexpr(rtc("hoisted", vec![str(n), id(v)])));
                self.claims = true;
            }
        }
        Ok(out)
    }
    /// R-f-4: each catch inside an equation gets one boundary, made once beside it (awaits.rs `inner_catches`).
    fn hoist_catches(&mut self, name: &str, e: &Expr, env: Env) -> R<Vec<S>> {
        let mut out = vec![];
        for h in inner_catches(e) {
            let ExprKind::Catch { e: x, name: cn, classes, alt } = &h.node.k else { unreachable!() };
            let v = format!("c${}${}", name, self.hoist_seq);
            self.hoist_seq += 1;
            let mut guards = vec![];
            for g in &h.guards {
                let x = self.expr(g.e, env, &reactive())?;
                guards.push(if g.nullish { bin("==", x, E::Null) } else if g.neg { not(x) } else { x });
            }
            let inner = self.new_env(Some(env));
            if let Some(n) = cn {
                self.set(inner, n, val(mg(n)));
            }
            let body = self.expr(x, env, &reactive())?;
            let cls = self.classes(classes.as_deref(), env)?;
            let a = self.expr(alt, inner, &reactive())?;
            let p = cn.as_ref().map(|n| mg(n)).unwrap_or("__e".into());
            let f = if guards.is_empty() {
                body
            } else {
                let mut it = guards.into_iter();
                let first = it.next().unwrap();
                let c = it.fold(first, |a, b| bin("&&", a, b));
                E::Cond(Box::new(c), Box::new(body), Box::new(undef()))
            };
            self.hoisted_catch.insert(h.node as *const Expr, v.clone());
            out.push(konst(v, rtc("catchMemo", vec![thunk(f), arrow(&["__e"], rtc("isA", vec![id("__e"), cls])), arrow(&[&p], a)])));
        }
        Ok(out)
    }
    fn hoist_all(&mut self, es: &[&Expr], env: Env) -> R<Vec<S>> {
        let mut out = vec![];
        for x in es {
            out.append(&mut self.hoist(None, x, env, false)?);
        }
        Ok(out)
    }
    fn value1(&mut self, d: &Decl, env: Env, b: &Bind) -> R<Vec<S>> {
        let prev = |out: &mut Vec<S>| {
            if let Some(p) = &b.prev {
                out.push(konst(p.clone(), rtc("pre", vec![id(b.js.clone())])));
            }
        };
        let pair = || Pat::Arr(vec![b.js.clone(), b.w.clone().unwrap()]);
        if let Decl::Eq { name, e, .. } = d {
            self.kept.extend(kept_parts(e, name).into_iter().map(|x| x as *const Expr));
        }
        match d {
            Decl::Source { name, init, question: false, key, .. } => {
                let x = self.expr(init, env, &reactive())?;
                let mut args = vec![str(name.clone()), rtc("untrack", vec![thunk(x)])];
                if self.u.optimistic.contains(name) {
                    args.push(E::Bool(true)); // AC-3: a guess over a writable — an optimistic layer derived from it
                } else if key.is_some() {
                    args.push(E::Bool(false));
                }
                if let Some(k) = key {
                    args.push(str(k.clone())); // ST-4a: a new value written to it is reconciled by its key
                }
                let mut out = vec![S::Const(pair(), rtc("source", args))];
                out.extend(self.reg_get(name, b, true));
                prev(&mut out);
                Ok(out)
            }
            Decl::Source { name, init, key, .. } => {
                let lv = self.loading_value(init, env)?;
                let mode = obj(vec![("optimistic", E::Bool(self.u.optimistic.contains(name))), ("structured", E::Bool(self.u.paths.contains(name))), ("record", E::Bool(matches!(init.k, ExprKind::Rec(_)))), ("plain", E::Bool(self.u.plain.contains(name)))]);
                let x = self.expr(init, env, &Ctx { tail: true, self_: Some(name.clone()), ..Ctx::default() })?;
                let mut args = vec![str(name.clone()), arrow(&["__prev"], x), lv, mode];
                if let Some(k) = key {
                    args.push(str(k.clone()));
                }
                let mut out = vec![S::Const(pair(), rtc("question", args))];
                out.extend(self.reg_get(name, b, true));
                prev(&mut out);
                Ok(out)
            }
            Decl::Eq { name, e, key, deferred, .. } if self.guessed_eq(name, e, *deferred) => {
                // AC-3 over an equation: createOptimistic(fn) / createOptimisticStore(fn, seed) — derived, its setter only guesses
                let lv = self.loading_value(e, env)?;
                // ST-4a: a key applies at any depth (Solid's); a record result is the store's root, its keyed lists inside it
                let record = matches!(e.k, ExprKind::Rec(_));
                let mode = obj(vec![("optimistic", E::Bool(true)), ("structured", E::Bool(self.u.paths.contains(name) || key.is_some())), ("derived", E::Bool(true)), ("record", E::Bool(record))]);
                let x = self.expr(e, env, &Ctx { tail: true, self_: Some(name.clone()), ..Ctx::default() })?;
                let mut args = vec![str(name.clone()), arrow(&["__prev"], x), lv, mode];
                if let Some(k) = key {
                    args.push(str(k.clone()));
                }
                let mut out = vec![S::Const(pair(), rtc("question", args))];
                out.extend(self.reg_get(name, b, true));
                prev(&mut out);
                Ok(out)
            }
            Decl::Eq { name, e, key, deferred, .. } => {
                let fin = |mut out: Vec<S>, g: &mut Self| {
                    out.extend(g.reg_get(name, b, false));
                    prev(&mut out);
                    Ok(out)
                };
                if b.given.as_ref().is_some_and(|g| g.held()) {
                    let v = self.held(e, env)?;
                    return fin(vec![konst(b.js.clone(), v)], self);
                }
                // ST-3
                if let ExprKind::Draft { seed, body } = &e.k {
                    let ExprKind::Pre { name: sn, init: Some(si) } = &seed.k else { return fail("a draft's seed must be `pre self -> seed`") };
                    if sn != name {
                        return fail("a draft's seed must be `pre self -> seed`");
                    }
                    let inner = self.new_env(Some(env));
                    self.set(inner, "d", val("v$d"));
                    let s = self.expr(si, env, &reactive())?;
                    let db = self.draft_body(body, inner)?;
                    return fin(vec![konst(b.js.clone(), rtc("draft", vec![rtc("untrack", vec![thunk(s)]), arrow_block(vec![P::Id("v$d".into())], db, false)]))], self);
                }
                // RG-6
                if let ExprKind::Call { f, .. } = &e.k {
                    if let ExprKind::Id(fname) = &f.k {
                        if self.lookup(env, fname).is_some_and(|x| x.kind == Kind::Ifn) {
                            let v = self.instantiate(e, env)?;
                            return fin(vec![konst(b.js.clone(), v)], self);
                        }
                    }
                }
                if let Some(mut fx) = self.foreign(e, env, &b)? {
                    if b.kind == Kind::Comp {
                        fx.extend(self.reg(name, vec![("value", id(b.js.clone()))]));
                        return Ok(fx);
                    }
                    return fin(fx, self);
                }
                if let Some(k) = key {
                    let x = self.expr(e, env, &Ctx { tail: true, ..Ctx::default() })?;
                    return fin(vec![konst(b.js.clone(), rtc("keyed", vec![str(name.clone()), str(k.clone()), thunk(x), E::Bool(matches!(e.k, ExprKind::Rec(_)))]))], self);
                }
                // R-f-4 over a tail await: the flight is an inner memo, read through a boundary
                if let (ExprKind::Catch { e: ce, name: cn, classes, alt }, false) = (&e.k, deferred) {
                    let inner = self.new_env(Some(env));
                    if let Some(n) = cn {
                        self.set(inner, n, val(mg(n)));
                    }
                    let x = self.expr(ce, env, &Ctx { tail: true, self_: Some(name.clone()), ..Ctx::default() })?;
                    let lv = self.loading_value(ce, env)?;
                    let i = format!("i${name}");
                    let cls = self.classes(classes.as_deref(), env)?;
                    let a = self.expr(alt, inner, &reactive())?;
                    let pn = cn.as_ref().map(|n| mg(n)).unwrap_or("__e".into());
                    // a matching rejection is an answer (R-f-4): caught where it is awaited, not by the boundary; the answer
                    // is computed by its reader (R-f-4a)
                    let awaited = matches!(ce.k, ExprKind::Await { .. });
                    let body = if awaited { rtc("settle", vec![thunk(x), arrow(&["__e"], rtc("isA", vec![id("__e"), cls.clone()]))]) } else { x };
                    let read = if awaited { rtc("caught", vec![call(id(i.clone()), vec![]), arrow(&[&pn], a.clone())]) } else { call(id(i.clone()), vec![]) };
                    let out = vec![
                        konst(i.clone(), rtc("memo", vec![str(name.clone()), arrow(&["__prev"], body), lv])),
                        konst(
                            b.js.clone(),
                            rtc(
                                "catchMemo",
                                vec![thunk(read), arrow(&["__e"], rtc("isA", vec![id("__e"), cls])), arrow(&[&pn], a)],
                            ),
                        ),
                    ];
                    return fin(out, self);
                }
                let x = self.expr(e, env, &Ctx { tail: true, self_: Some(name.clone()), ..Ctx::default() })?;
                let lv = self.loading_value(e, env)?;
                fin(vec![konst(b.js.clone(), rtc(if *deferred { "deferred" } else { "memo" }, vec![str(name.clone()), arrow(&["__prev"], x), lv]))], self)
            }
            _ => fail("unreachable"),
        }
    }
    fn given(&self, e: &Expr, env: Env) -> Option<Given> {
        given(e, &|n| self.lookup(env, n).and_then(|b| b.given))
    }
    /// RG-4c: a view the component was given, as it is read: no computation of its own, so it is made where it is read.
    fn held(&mut self, e: &Expr, env: Env) -> R<E> {
        if defaulted(e, &|n| self.lookup(env, n).and_then(|b| b.given)).is_some() {
            let ExprKind::If { t, f, .. } = &e.k else { unreachable!() };
            let (v, d) = (self.expr(f, env, &reactive())?, self.expr(t, env, &reactive())?);
            return Ok(thunk(rtc("preOr", vec![v, thunk(d)])));
        }
        Ok(thunk(self.expr(e, env, &reactive())?))
    }
    /// RG-4c: whether a view was given, asked without making it. The question is the argument as it was written, read
    /// with each view in it standing for itself (`__rt.ask`: content, a view given on, a choice or a default of them);
    /// a value in it answers as JavaScript has it. `some`: whether it is not `undefined` (`??`, `!= undefined`). Of a
    /// prop that is not declared `View`, the question is its value's, and nothing is emitted here.
    fn asked(&mut self, e: &Expr, env: Env, not_lit: Option<E>) -> R<Option<E>> {
        if !self.given(e, env).is_some_and(|g| g.held() && g.view()) {
            return Ok(None);
        }
        let v = rtc("ask", vec![thunk(self.expr(e, env, &reactive())?)]);
        Ok(Some(match not_lit { Some(x) => bin("!==", v, x), None => v }))
    }
    /// … and a condition that asks it: the view itself or a choice of views (`bare`: an `if`, a `?:`, the left of
    /// `&&`), `!v`, `v == undefined`, `a && b`, `a || b`.
    fn asks(&mut self, c: &Expr, env: Env, bare: bool) -> R<Option<E>> {
        if bare {
            if let Some(a) = self.asked(c, env, None)? {
                return Ok(Some(a));
            }
        }
        Ok(match &c.k {
            ExprKind::Un { op, e } if op == "!" => self.asks(e, env, true)?.map(not),
            ExprKind::Bin { op, l, r } if matches!(op.as_str(), "==" | "!=") && matches!(r.k, ExprKind::Lit(Lit::Undefined | Lit::Null)) => self.asked(l, env, Some(if matches!(r.k, ExprKind::Lit(Lit::Null)) { E::Null } else { undef() }))?.map(|a| if op == "==" { not(a) } else { a }),
            ExprKind::Bin { op, l, r } if bare && matches!(op.as_str(), "&&" | "||") => {
                let (a, b) = (self.asks(l, env, true)?, self.asks(r, env, true)?);
                if a.is_none() && b.is_none() {
                    None
                } else {
                    let a = match a { Some(a) => a, None => self.expr(l, env, &reactive())? };
                    let b = match b { Some(b) => b, None => self.expr(r, env, &reactive())? };
                    Some(bin(static_op(op), a, b))
                }
            }
            _ => None,
        })
    }
    /// SV-7b: a call into `client` JS — awaited, a client question: Solid's `ssrSource: "client"`, never asked on the server.
    fn client_call(&self, e: &Expr, env: Env) -> bool {
        let f = if let ExprKind::Catch { e, .. } = &e.k { &**e } else { e };
        if let ExprKind::Call { f, .. } = &f.k {
            if let ExprKind::Id(n) = &f.k {
                return self.lookup(env, n).is_some_and(|b| b.client);
            }
        }
        false
    }
    fn tail_client(&self, e: &Expr, env: Env) -> bool {
        fn walk(g: &Gen, n: Node, env: Env) -> bool {
            if let Node::E(x) = n {
                match &x.k {
                    ExprKind::Fn { .. } => return false,
                    ExprKind::Await { e, .. } if !g.hoisted.contains_key(&(x as *const Expr)) && g.client_call(e, env) => return true,
                    _ => {}
                }
            }
            children(n, true).into_iter().any(|c| walk(g, c, env))
        }
        walk(self, Node::E(e), env)
    }
    /// R-7: the first paint of an `await … -> v`; SV-7b: a client question's ssrSource
    fn loading_value(&mut self, e: &Expr, env: Env) -> R<E> {
        let lv = self.loading_value0(e, env)?;
        Ok(if self.tail_client(e, env) { rtc("clientQuestion", vec![lv]) } else { lv })
    }
    fn loading_value0(&mut self, e: &Expr, env: Env) -> R<E> {
        fn find<'a>(n: Node<'a>) -> Option<&'a Expr> {
            if let Node::E(x) = n {
                match &x.k {
                    ExprKind::Fn { .. } => return None,
                    ExprKind::Await { init: Some(i), .. } => return Some(i),
                    _ => {}
                }
            }
            children(n, true).into_iter().find_map(find)
        }
        Ok(match find(Node::E(e)) {
            Some(i) => rtc("firstPaint", vec![thunk(self.expr(i, env, &reactive())?)]),
            None => undef(),
        })
    }
    fn draft_body(&mut self, ss: &[Stmt], env: Env) -> R<Vec<S>> {
        let mut out = vec![];
        for s in ss {
            match &s.k {
                StmtKind::Let { name, e, .. } => {
                    self.set(env, name, val(mg(name)));
                    out.push(konst(mg(name), self.expr(e, env, &reactive())?));
                }
                StmtKind::Expr(e) => out.push(sexpr(self.expr(e, env, &reactive())?)),
                StmtKind::Write { target, e } => {
                    let mut path = vec![];
                    for p in &target.path {
                        path.push(match p {
                            PathSeg::Name(n) => str(n.clone()),
                            PathSeg::Expr(x) => self.expr(x, env, &reactive())?,
                        });
                    }
                    let last = path.pop().unwrap_or_else(undef);
                    let mut block = vec![S::Let("__t".into(), Some(id("v$d")))];
                    for k in path {
                        let slot = E::Index(Box::new(id("__t")), Box::new(k), false);
                        block.push(sexpr(E::Assign("=", Box::new(id("__t")), Box::new(E::Assign("??=", Box::new(slot), Box::new(E::Obj(vec![])))))));
                    }
                    let v = self.expr(e, env, &reactive())?;
                    block.push(sexpr(E::Assign("=", Box::new(E::Index(Box::new(id("__t")), Box::new(last), false)), Box::new(v))));
                    out.push(S::Block(block));
                }
                s => return fail(format!("{} in a draft block", s.kind())),
            }
        }
        Ok(out)
    }
    fn fn_decl(&mut self, d: &Decl, env: Env) -> R<S> {
        let Decl::Fn { name, params, decls, tail, named, .. } = d else { unreachable!() };
        let inner = self.new_env(Some(env));
        for p in params {
            let mut b = bind(if p.r#ref { Kind::Acc } else { Kind::Val }, mg(&p.name));
            b.prev = (p.r#ref && self.u.prev_of.contains(&p.name)).then(|| format!("p${}", p.name));
            self.set(inner, &p.name, b);
        }
        let ps: Vec<P> = params.iter().map(|p| P::Id(mg(&p.name))).collect();
        // E-9a: a `ref` parameter left out reads `undefined` — its accessor is one of that
        let absent = || -> Vec<S> { params.iter().filter(|p| p.r#ref && p.opt).map(|p| S::Expr(E::Assign("??=", Box::new(id(mg(&p.name))), Box::new(thunk(undef()))))).collect() };
        if !instantiates(params, decls, tail, *named) {
            let x = if *named { self.named(decls, tail, inner)? } else { self.expr(tail, inner, &reactive())? };
            let mut body = absent();
            body.push(S::Return(Some(x)));
            return Ok(S::Func(Func { name: Some(mg(name)), params: ps, directives: vec![], body, is_async: false, generator: false }));
        }
        // an `await` in the result: the result is an equation (RG-6a), and its flights are that equation's (07 §3)
        if !non_tail_awaits(tail, false).is_empty() {
            let mut d2 = d.clone();
            let Decl::Fn { decls, tail, line, span, .. } = &mut d2 else { unreachable!() };
            let t = std::mem::replace(tail, Expr { k: ExprKind::Id("result$".into()), span: tail.span });
            decls.push(Decl::Eq { name: "result$".into(), e: t, line: *line, span: *span, deferred: false, key: None, ty: None, exported: false });
            let d2 = std::rc::Rc::new(d2);
            self.made.push(d2.clone()); // its expressions are known by their places while the program is lowered
            return self.fn_decl(&d2, env);
        }
        // an instantiating fn (RG-6): called once, returns the accessor of its tail
        let mut body: Vec<S> = params.iter().filter(|p| p.r#ref && self.u.prev_of.contains(&p.name)).map(|p| konst(format!("p${}", p.name), rtc("pre", vec![id(mg(&p.name))]))).collect();
        body.append(&mut self.block(decls, &[], inner, None, false)?);
        strip_return_null(&mut body);
        let tb = if let ExprKind::Id(n) = &tail.k { self.lookup(inner, n) } else { None };
        let t = match tb {
            Some(tb) if matches!(tb.kind, Kind::Acc | Kind::Src) => id(tb.js),
            _ => rtc("memo", vec![E::Null, thunk(self.expr(tail, inner, &reactive())?)]),
        };
        // MO-13i: called by JavaScript (`this`, the runtime's), its parts; by `.rx`, the accessor, with the parts beside it
        let plan = self.plans.and_then(|p| p.get(&(d as *const Decl)));
        let t = match plan {
            Some(p) => {
                let parts = self.parts(p, inner)?;
                rtc("result", vec![id("this"), thunk(t), thunk(parts)])
            }
            None => t,
        };
        body.push(S::Return(Some(t)));
        // RG-6a: what it provides is for what its call instantiates, not for the caller's region: an owner of the call's own
        if decls.iter().any(|x| matches!(x, Decl::Provide { .. })) {
            body = vec![S::Return(Some(rtc("inst", vec![arrow_block(vec![], body, false)])))];
        }
        let mut whole = absent();
        whole.append(&mut body);
        let body = whole;
        Ok(S::Func(Func { name: Some(mg(name)), params: ps, directives: vec![], body, is_async: false, generator: false }))
    }
    /// E-9b: the result of a fn that names values. A name read in one place stands there as its expression; the others are
    /// read through `n$`, which evaluates each at most once for the call, or through `r$` where what is read is not what is
    /// read elsewhere (`peek`, `latest`, `pending?`), which evaluates it there.
    fn named(&mut self, decls: &[Decl], tail: &Expr, inner: Env) -> R<E> {
        let names = crate::ast::locals_of(decls, tail);
        let mut shared = vec![];
        for (n, e, once) in &names {
            let mut b = val("");
            if *once {
                b.sub = Some(*e as *const Expr);
            } else {
                b.shared = Some((shared.len(), false));
                shared.push(*e);
            }
            self.set(inner, n, b);
        }
        let t = self.expr(tail, inner, &reactive())?;
        if shared.is_empty() {
            return Ok(t);
        }
        let of = shared.iter().map(|e| Ok(arrow(&["n$", "r$"], self.expr(e, inner, &reactive())?))).collect::<R<Vec<_>>>()?;
        Ok(rtc("names", vec![E::Arr(of), arrow(&["n$", "r$"], t)]))
    }
    /// E-9b: the names of a fn's body, as a `peek`, a `latest` or a `pending?` reads them.
    fn apart(&mut self, env: Env) -> Env {
        let mut out: Vec<(String, Bind)> = vec![];
        let mut e = Some(env);
        while let Some(i) = e {
            for (n, b) in &self.frames[i].vars {
                if b.shared.is_some() && self.lookup(env, n).is_some_and(|x| x.shared == b.shared) {
                    out.push((n.clone(), Bind { shared: b.shared.map(|(k, _)| (k, true)), ..b.clone() }));
                }
            }
            e = self.frames[i].parent;
        }
        if out.is_empty() {
            return env;
        }
        let inner = self.new_env(Some(env));
        for (n, b) in out {
            self.set(inner, &n, b);
        }
        inner
    }
    /// MO-13i: the parts of a fn's result, as a Solid primitive hands them.
    fn parts(&mut self, p: &crate::check::Plan, env: Env) -> R<E> {
        use crate::check::Plan;
        // the program outlives its lowering; a plan's expressions are its own
        let of = |e: &*const Expr| -> &'p Expr { unsafe { &**e } };
        Ok(match p {
            Plan::Io(e) => self.expr(of(e), env, &reactive())?,
            Plan::Leaf(e, r) => {
                let e = of(e);
                if !r.is_reader() {
                    return Ok(rtc("untrack", vec![thunk(self.expr(e, env, &reactive())?)]));
                }
                match if let ExprKind::Id(n) = &e.k { self.lookup(env, n) } else { None } {
                    Some(b) if matches!(b.kind, Kind::Acc | Kind::Src) => id(b.js),
                    _ => rtc("memo", vec![E::Null, thunk(self.expr(e, env, &reactive())?)]),
                }
            }
            Plan::Rec(fs) => E::Obj(fs.iter().map(|(k, p)| Ok(Prop::Kv(Key::Str(k.clone()), self.parts(p, env)?))).collect::<R<Vec<_>>>()?),
            Plan::Arr(xs) => E::Arr(xs.iter().map(|p| self.parts(p, env)).collect::<R<Vec<_>>>()?),
            Plan::Inst(n, path, _) => {
                let Some(b) = self.lookup(env, n) else { return fail(format!("{n}: no such instance")) };
                path.iter().fold(rtc("parts", vec![id(b.js), str(n.clone())]), |o, k| E::Index(Box::new(o), Box::new(str(k.clone())), false))
            }
        })
    }
    /// MO-10: `x = f(…)` over a declared primitive — called once (RG-6), a ref argument as an accessor, a value one
    /// untracked; and `y = x[i]` / `x.k` over its result. A `ref` part is bound to the accessor itself, any other part to
    /// its value.
    fn foreign(&mut self, e: &Expr, env: Env, b: &Bind) -> R<Option<Vec<S>>> {
        fn part(r: E, p: Part) -> E {
            if p == Part::Ref {
                r
            } else {
                thunk(r)
            }
        }
        let ix = |r: &str, k: E| E::Index(Box::new(id(r)), Box::new(k), false);
        match &e.k {
            ExprKind::Call { f, args, .. } => {
                let ExprKind::Id(fname) = &f.k else { return Ok(None) };
                let Some(fb) = self.lookup(env, fname).filter(|x| x.kind == Kind::Jfn) else { return Ok(None) };
                let refs: Vec<bool> = fb.f.as_ref().unwrap().params.iter().map(|p| p.1).collect();
                let mut out = vec![];
                for (i, a) in args.iter().enumerate() {
                    if !refs.get(i).copied().unwrap_or(false) {
                        out.push(rtc("untrack", vec![thunk(self.expr(a, env, &reactive())?)]));
                        continue;
                    }
                    if let ExprKind::Id(n) = &a.k {
                        if let Some(ab) = self.lookup(env, n).filter(|ab| matches!(ab.kind, Kind::Acc | Kind::Src)) {
                            out.push(id(ab.js));
                            continue;
                        }
                    }
                    // RG-6b, MO-10a (2026-11-23): what is written out as a constant has nothing to follow, and is the plain
                    // accessor `() => "a.mp3"`: no node, no owner's id, and nothing reactive for a library to read where
                    // nothing tracks (Solid's STRICT_READ_UNTRACKED, of a parameter it reads once while it is made)
                    if constant(a) {
                        out.push(thunk(self.expr(a, env, &reactive())?));
                        continue;
                    }
                    out.push(rtc("memo", vec![E::Null, thunk(self.expr(a, env, &reactive())?)]));
                }
                // MO-11f: the component the factory hands back
                if fb.shape == Some(FShape::Comp) {
                    return Ok(Some(vec![konst(b.js.clone(), call(id(fb.js.clone()), out))]));
                }
                let r = b.inst.clone().unwrap();
                // R-f-5, MO-10f (revised 2026-11-21 after review): the result as a value whose parts are read where they are
                // read, each a getter on the result (a `ref` part called): reading `q.isFetching` does not read `q.data`,
                // which may fail or hold, as the checker counts it
                // …and a result none of whose parts is an accessor is the library's own object, read as it is (2026-11-22):
                // a field read is that field's read on it, its methods are called on it, and a field its declaration
                // leaves out is still there
                let whole = match fb.shape.as_ref().unwrap() {
                    FShape::Comp => unreachable!(),
                    FShape::Part(p) => part(id(r.clone()), *p),
                    sh if !sh.has_ref() => part(id(r.clone()), Part::Value),
                    FShape::Items(items) => rtc(
                        "lazy",
                        vec![id(r.clone()), E::Arr((0..items.len()).map(|i| E::Num(i as f64)).collect()), E::Arr(items.iter().enumerate().filter(|(_, p)| **p == Part::Ref).map(|(i, _)| E::Num(i as f64)).collect())],
                    ),
                    FShape::Fields(fields) => rtc(
                        "lazy",
                        vec![id(r.clone()), E::Arr(fields.iter().map(|(k, _)| str(k.clone())).collect()), E::Arr(fields.iter().filter(|(_, p)| *p == Part::Ref).map(|(k, _)| str(k.clone())).collect())],
                    ),
                };
                // MO-10a: called in an owner of its own (`__rt.inst`), its arguments' nodes with it
                Ok(Some(vec![konst(r.clone(), rtc("inst", vec![thunk(call(id(fb.js.clone()), out))])), konst(b.js.clone(), whole)]))
            }
            ExprKind::Index { o, .. } | ExprKind::Member { o, .. } => {
                let ExprKind::Id(on) = &o.k else { return Ok(None) };
                let Some(ob) = self.lookup(env, on) else { return Ok(None) };
                let (Some(inst), Some(sh)) = (ob.inst.clone(), ob.shape.clone()) else { return Ok(None) };
                let (key, p) = match (&e.k, &sh) {
                    (ExprKind::Index { i, .. }, FShape::Items(items)) => match &i.k {
                        ExprKind::Lit(Lit::Num(v)) if *v >= 0.0 && v.fract() == 0.0 => match items.get(*v as usize) {
                            Some(p) => (E::Num(*v), *p),
                            None => return Ok(None),
                        },
                        _ => return Ok(None),
                    },
                    (ExprKind::Member { p: k, .. }, FShape::Fields(fields)) => match fields.iter().find(|f| &f.0 == k) {
                        Some(f) => (str(k.clone()), f.1),
                        None => return Ok(None),
                    },
                    _ => return Ok(None),
                };
                Ok(Some(vec![konst(b.js.clone(), part(ix(&inst, key), p))]))
            }
            _ => Ok(None),
        }
    }
    fn instantiate(&mut self, e: &Expr, env: Env) -> R<E> {
        let ExprKind::Call { f, args, .. } = &e.k else { unreachable!() };
        let ExprKind::Id(fname) = &f.k else { unreachable!() };
        let b = self.lookup(env, fname).unwrap();
        let mut out = vec![];
        for (i, (_, r#ref)) in b.f.as_ref().unwrap().params.iter().enumerate() {
            let Some(a) = args.get(i) else {
                out.push(undef());
                continue;
            };
            if *r#ref {
                if let ExprKind::Id(n) = &a.k {
                    if let Some(ab) = self.lookup(env, n).filter(|ab| matches!(ab.kind, Kind::Acc | Kind::Src)) {
                        out.push(id(ab.js));
                        continue;
                    }
                }
                out.push(rtc("memo", vec![E::Null, thunk(self.expr(a, env, &reactive())?)]));
            } else {
                out.push(rtc("untrack", vec![thunk(self.expr(a, env, &reactive())?)]));
            }
        }
        Ok(call(id(b.js), out))
    }
    fn types(&self, path: &str) -> std::rc::Rc<Types> {
        self.types.borrow_mut().entry(path.to_string()).or_insert_with(|| std::rc::Rc::new(types_of(self.set, path))).clone()
    }
    fn component(&mut self, d: &Decl, env: Env) -> R<S> {
        let Decl::Component { name, props, decls, view, props_type, tparams, kids_value, .. } = d else { unreachable!() };
        let inner = self.new_env(Some(env));
        let mut pb = val(mg(props));
        let types = self.types(&self.file);
        pb.given = Some(Given::Props { less: vec![], views: views_of(props_type.as_deref(), &types, self.mod_decls, tparams.as_deref(), *kids_value).into() });
        pb.shows = shown(props, props_type.as_deref(), decls, view, &types, tparams.as_deref()).into_iter().map(|(f, v)| (f, v.mixed)).collect();
        let was = std::mem::replace(&mut self.shown, pb.shows.iter().map(|f| format!("{props}.{}", f.0)).collect());
        self.set(inner, props, pb);
        let body = self.owned(decls, view, inner, true);
        self.shown = was;
        let body = body?;
        Ok(S::Func(Func { name: Some(cm(name)), params: vec![P::Id(mg(props))], directives: vec![], body, is_async: false, generator: false }))
    }

    // ---- expressions
    /// MO-10i (2026-11-22): a closure bound to `name` that the module gives, by that name, to a call that hands the
    /// position a draft (`setTodos(up)`) is that callback: its parameters there are the draft's (the checker holds the
    /// name to that use alone, `check::updater_positions`).
    fn updater_closure(&mut self, name: &str, line: usize, e: &Expr, env: Env) {
        let ExprKind::Fn { params, .. } = &e.k else { return };
        if params.is_empty() {
            return;
        }
        let mut found: Option<Vec<usize>> = None;
        for (callee, i) in self.arg_calls.get(&format!("{name}@{line}")).cloned().unwrap_or_default() {
            let Some(ps) = self.lookup(env, &callee).and_then(|b| b.drafts.iter().find(|(j, _)| *j == i).map(|(_, ps)| ps.clone())) else { continue };
            match &found {
                None => found = Some(ps),
                Some(f) if *f == ps => {}
                Some(_) => return,
            }
        }
        if let Some(ps) = found {
            self.draft_closures.insert(e as *const Expr, ps);
        }
    }
    /// MO-10i: the draft a read goes through: the draft's name, a path below it, or what a method called on one gives.
    fn draft_chain(&self, e: &Expr, env: Env) -> bool {
        match &e.k {
            ExprKind::Id(n) => self.lookup(env, n).is_some_and(|b| b.draft),
            ExprKind::Member { o, .. } | ExprKind::Index { o, .. } => self.draft_chain(o, env),
            ExprKind::Call { f, .. } => matches!(&f.k, ExprKind::Member { o, .. } | ExprKind::Index { o, .. } if self.draft_chain(o, env)),
            _ => false,
        }
    }
    /// MO-10i: a place of a draft: its name, or a path below it (no call).
    fn draft_place(&self, e: &Expr, env: Env) -> bool {
        match &e.k {
            ExprKind::Id(n) => self.lookup(env, n).is_some_and(|b| b.draft),
            ExprKind::Member { o, .. } | ExprKind::Index { o, .. } => self.draft_place(o, env),
            _ => false,
        }
    }
    /// MO-10i: the draft callbacks of a function part read off a result, `st[1]` or `st.set`.
    fn part_drafts_of(&self, f: &Expr, env: Env) -> Option<Vec<(usize, Vec<usize>)>> {
        let (o, key) = match &f.k {
            ExprKind::Member { o, p, .. } => (o, Some(p.clone())),
            ExprKind::Index { o, i, .. } => (o, crate::check::lit_key(i)),
            _ => return None,
        };
        let (ExprKind::Id(on), Some(key)) = (&o.k, key) else { return None };
        self.lookup(env, on)?.part_drafts.iter().find(|(k, _)| *k == key).map(|(_, d)| d.clone())
    }
    /// An expression's value. MO-10i (ruled 2026-11-22): a library's draft is a place, not a value, so a read of one —
    /// its name, a path below it, what a method called on it gives — is a copy (`__rt.copy`), wherever its value could
    /// be kept: what `.rx` holds of a draft is never the library's own object. Not where it is handed straight back to
    /// the library, or consumed by an operator that makes a primitive of it (`raw`).
    fn expr(&mut self, e: &Expr, env: Env, ctx: &Ctx) -> R<E> {
        let mut x = self.expr0(e, env, ctx)?;
        if self.kept.contains(&(e as *const Expr)) {
            x = rtc("kept", vec![x]);
        }
        if !self.raw.contains(&(e as *const Expr)) && self.draft_chain(e, env) {
            // a JS fn called with a read of a draft is lent a copy (in a development build one that refuses to be
            // changed: a change to it would be lost, MO-10i); its `draft` parameters are given the draft itself (`raw`)
            if let Some(to) = self.lent.get(&(e as *const Expr)) {
                return Ok(rtc("lend", vec![x, str(to.clone())]));
            }
            return Ok(rtc("copy", vec![x]));
        }
        Ok(x)
    }
    fn expr0(&mut self, e: &Expr, env: Env, ctx: &Ctx) -> R<E> {
        let sub = Ctx { tail: false, ..ctx.clone() };
        Ok(match &e.k {
            ExprKind::Lit(l) => lit(l),
            ExprKind::Id(n) => self.reference(n, env, ctx)?,
            ExprKind::Pre { name, init } => {
                let i = match init {
                    Some(i) => self.expr(i, env, &sub)?,
                    None => undef(),
                };
                // the equation's own: the memo's previous value
                if ctx.self_.as_deref() == Some(name) {
                    return Ok(rtc("preOr", vec![id("__prev"), thunk(i)]));
                }
                let Some(p) = self.lookup(env, name).and_then(|b| b.prev) else { return fail(format!("pre {name}: no companion memo")) };
                rtc("preOr", vec![call(id(p), vec![]), thunk(i)])
            }
            ExprKind::Peek(x) => {
                let env = self.apart(env);
                rtc("untrack", vec![thunk(self.expr(x, env, &sub)?)])
            }
            // RG-4b: Solid's live view
            ExprKind::Omit { e: x, keys } => rtc("omit", std::iter::once(self.expr(x, env, &sub)).chain(keys.iter().map(|k| Ok(str(k.clone())))).collect::<Result<Vec<_>, _>>()?),
            ExprKind::Await { e: x, stream, .. } => {
                if let Some(v) = self.hoisted.get(&(e as *const Expr)) {
                    let read = call(id(v.clone()), vec![]);
                    return Ok(match self.settled.get(&(e as *const Expr)) {
                        Some(a) => rtc("caught", vec![read, a.clone()]),
                        None => read,
                    });
                }
                if ctx.imp {
                    let y = self.expr(x, env, &sub)?;
                    return Ok(if ctx.gen {
                        E::Yield(Box::new(rtc("awaited", vec![y])))
                    } else if ctx.is_async {
                        E::Await(Box::new(rtc("awaited", vec![y])))
                    } else {
                        y
                    });
                }
                if !ctx.tail {
                    return fail(AWAIT_NOT_LOWERED);
                }
                // the memo returns the flight (R-1): a stream for `await*`, else its one answer
                let y = self.expr(x, env, &sub)?;
                if *stream {
                    y
                } else {
                    rtc("awaited", vec![y])
                }
            }
            // R-12: Solid's latest — of a value that never had one it throws, in a handler too (S-solid-28)
            ExprKind::Latest(x) => {
                let env = self.apart(env);
                rtc("latest", vec![thunk(self.expr(x, env, &Ctx { imp: false, ..ctx.clone() })?)])
            }
            ExprKind::Pending(x) => {
                let env = self.apart(env);
                rtc("isPending", vec![thunk(self.expr(x, env, &sub)?)])
            }
            ExprKind::If { c, t, f } => {
                self.raw.insert(&**c as *const Expr);
                let c = match self.asks(c, env, true)? {
                    Some(a) => a,
                    None => self.expr(c, env, &sub)?,
                };
                let t = self.expr(t, env, ctx)?;
                let f = self.expr(f, env, ctx)?;
                E::Cond(Box::new(c), Box::new(t), Box::new(f))
            }
            // R-f-3
            ExprKind::Throw(x) => rtc("throw", vec![self.expr(x, env, &sub)?]),
            // R-f-4: over a sync value, or the tail await's promise/stream
            ExprKind::Catch { .. } if !ctx.imp && self.hoisted_catch.contains_key(&(e as *const Expr)) => call(id(self.hoisted_catch[&(e as *const Expr)].clone()), vec![]),
            // R-f-4a: the await is settled to what it caught, a failure of its operand too; the answer is computed here, with no boundary of its own
            ExprKind::Catch { e: x, .. } if !ctx.imp && self.settled.contains_key(&(&**x as *const Expr)) => self.expr(x, env, &sub)?,
            ExprKind::Catch { e: x, name, classes, alt } => {
                if ctx.imp && has_await_json(&x.to_json()) {
                    return fail("`await … catch` inside an expression of imperative scope (AWAIT_IN_EXPRESSION, AC-1)");
                }
                let inner = self.new_env(Some(env));
                if let Some(n) = name {
                    self.set(inner, n, val(mg(n)));
                }
                let body = self.expr(x, env, &sub)?;
                let cls = self.classes(classes.as_deref(), env)?;
                let a = self.expr(alt, inner, &sub)?;
                let p = name.as_ref().map(|n| mg(n)).unwrap_or("__e".into());
                rtc(if ctx.imp { "tryCatch" } else { "catchRead" }, vec![thunk(body), arrow(&["__e"], rtc("isA", vec![id("__e"), cls])), arrow(&[&p], a)])
            }
            ExprKind::Tpl(parts) => {
                let mut xs = vec![];
                for p in parts {
                    xs.push(match p {
                        crate::ast::TplPart::Str(s) => str(s.clone()),
                        crate::ast::TplPart::Expr(x) => {
                            self.raw.insert(x as *const Expr);
                            rtc("fmt", vec![self.expr(x, env, &sub)?])
                        }
                    });
                }
                let mut it = xs.into_iter();
                match it.next() {
                    None => str(""),
                    Some(first) => it.fold(first, |a, b| bin("+", a, b)),
                }
            }
            ExprKind::Member { o, p, .. } => {
                self.raw.insert(&**o as *const Expr);
                E::Member(Box::new(self.expr(o, env, &sub)?), p.clone(), true)
            }
            ExprKind::Index { o, i, .. } => {
                self.raw.insert(&**o as *const Expr);
                self.raw.insert(&**i as *const Expr); // a key is a primitive
                let o = self.expr(o, env, &sub)?;
                E::Index(Box::new(o), Box::new(self.expr(i, env, &sub)?), true)
            }
            // 07 CSS-5
            ExprKind::StyleMap { css, line } => self.class_map(css, *line)?,
            ExprKind::Call { f, args, .. } => {
                // AC-6: Solid's until; the predicate is reactive scope
                if let (ExprKind::Id(n), Some(Expr { k: ExprKind::Fn { body, .. }, .. })) = (&f.k, args.first()) {
                    if self.lang(env, n) == Some(Lang::Until) {
                        return Ok(rtc("until", vec![thunk(self.expr(body, env, &Ctx { dynamic: ctx.dynamic, ..Ctx::default() })?)]));
                    }
                }
                // EF-7, EF-8: Solid's own
                if let ExprKind::Id(n) = &f.k {
                    if !ctx.dynamic && matches!(self.lang(env, n), Some(Lang::OnSettled | Lang::OnFlush)) {
                        let mut xs = vec![];
                        for a in args {
                            xs.push(self.expr(a, env, &sub)?);
                        }
                        return Ok(rtc(n, xs));
                    }
                }
                // MO-10i: the closures this call hands a library's draft
                let drafts = match &f.k {
                    ExprKind::Id(n) => self.lookup(env, n).map(|b| b.drafts).unwrap_or_default(),
                    _ => self.part_drafts_of(f, env).unwrap_or_default(),
                };
                for (i, ps) in drafts {
                    if let Some(a) = args.get(i).filter(|a| matches!(a.k, ExprKind::Fn { .. })) {
                        self.draft_closures.insert(a as *const Expr, ps);
                    }
                }
                // a method of a draft is the library's own: what it is given goes straight back to it; a builtin that
                // answers a primitive keeps nothing
                let own = matches!(&f.k, ExprKind::Member { o, .. } | ExprKind::Index { o, .. } if self.draft_chain(o, env));
                // a closure written for one of a draft's own methods (`d.items.forEach((row) => { … })`) is called by it
                // with places of the draft: its parameters are read as copies, as the draft is (closed 2026-11-22)
                if own {
                    for a in args {
                        if let ExprKind::Fn { params, .. } = &a.k {
                            self.draft_closures.entry(a as *const Expr).or_insert_with(|| (0..params.len()).collect());
                        }
                    }
                }
                let scalar = matches!(&f.k, ExprKind::Id(n) if scalar(n, self.lookup(env, n).is_some()));
                if own || scalar {
                    for a in args {
                        self.raw.insert(a as *const Expr);
                    }
                }
                // MO-10i (2026-11-22): a JS fn's `draft` parameter is given the draft itself; its other arguments are lent
                if let ExprKind::Id(n) = &f.k {
                    if let Some(b) = self.lookup(env, n).filter(|b| b.js_fn) {
                        for (i, a) in args.iter().enumerate() {
                            if b.draft_args.contains(&i) {
                                self.raw.insert(a as *const Expr);
                            } else {
                                self.lent.insert(a as *const Expr, n.clone());
                            }
                        }
                    }
                }
                self.raw.insert(&**f as *const Expr);
                let callee = if let ExprKind::Member { o, p, .. } = &f.k {
                    self.raw.insert(&**o as *const Expr);
                    E::Member(Box::new(self.expr(o, env, &sub)?), p.clone(), true)
                } else {
                    self.expr(f, env, &sub)?
                };
                let mut xs = vec![];
                for a in args {
                    xs.push(self.expr(a, env, &sub)?);
                }
                call(callee, xs)
            }
            ExprKind::Arr(items) => {
                let mut xs = vec![];
                for i in items {
                    xs.push(match &i.k {
                        ExprKind::Spread(x) => E::Spread(Box::new(self.expr(x, env, &sub)?)),
                        _ => self.expr(i, env, &sub)?,
                    });
                }
                E::Arr(xs)
            }
            ExprKind::Rec(fields) => {
                let mut ps = vec![];
                for f in fields {
                    ps.push(match f {
                        crate::ast::Field::Spread(x) => Prop::Spread(self.expr(x, env, &sub)?),
                        crate::ast::Field::Kv { key, v } => Prop::Kv(Key::Str(key.clone()), self.expr(v, env, &sub)?),
                    });
                }
                E::Obj(ps)
            }
            ExprKind::Fn { params, body, stmts, .. } => {
                let inner = self.params(env, params);
                // MO-10i: the parameters a library hands its draft
                if let Some(ds) = self.draft_closures.get(&(e as *const Expr)).cloned() {
                    for j in ds {
                        if let Some(p) = params.get(j) {
                            let mut b = val(mg(p));
                            b.draft = true;
                            self.set(inner, p, b);
                        }
                    }
                    self.raw.insert(&**body as *const Expr); // what the callback gives back is the library's
                }
                let own: Vec<P> = params.iter().map(|p| P::Id(mg(p))).collect();
                let ps = if ctx.is_ref { vec![] } else { own.clone() };
                let f = match stmts {
                    Some(ss) if crate::infer::inferred_action(ss).is_some() => {
                        // AC-1b: an inferred action lowers as `action { … }` does, to Solid's action()
                        let b = self.stmts(ss, inner, &Ctx { imp: true, gen: true, dynamic: ctx.dynamic, effect: ctx.effect, ..Ctx::default() }, false)?;
                        let gen = E::Func(Box::new(Func { name: None, params: vec![], directives: vec![], body: b, is_async: false, generator: true }));
                        E::Arrow { params: ps, body: Body::Expr(Box::new(call(rtc("action", vec![gen]), vec![]))), is_async: false }
                    }
                    Some(ss) => {
                        let is_async = has_await_json(&Value::Array(ss.iter().map(|s| s.to_json()).collect()));
                        let b = self.stmts(ss, inner, &Ctx { imp: true, is_async, dynamic: ctx.dynamic, effect: ctx.effect, ..Ctx::default() }, false)?;
                        arrow_block(ps, b, is_async)
                    }
                    None => {
                        let b = self.expr(body, inner, &Ctx { imp: ctx.imp, dynamic: ctx.dynamic, effect: ctx.effect, ..Ctx::default() })?;
                        E::Arrow { params: ps, body: Body::Expr(Box::new(b)), is_async: false }
                    }
                };
                // H-10: what a `ref` closure reads is a snapshot, a prop as a source is — it is called while the view is
                // made, where Solid's development build reports a read nothing tracks
                if ctx.is_ref { E::Arrow { params: own, body: Body::Expr(Box::new(rtc("untrack", vec![f]))), is_async: false } } else { f }
            }
            ExprKind::Use(n) => match self.above.iter().rev().find(|(c, _)| c == n) {
                Some((_, Some(up))) => call(id(up.clone()), vec![]),
                _ => rtc("useGet", vec![self.reference(n, env, &Ctx { dynamic: ctx.dynamic, ..Ctx::default() })?, id("__o")]),
            },
            ExprKind::Bin { op, l, r } => {
                // RG-4c: a view asked for is not made
                {
                    if let Some(a) = self.asks(e, env, false)? {
                        return Ok(a);
                    }
                    if op == "&&" {
                        if let Some(a) = self.asks(l, env, true)? {
                            // one that was not given is the nothing it is
                            let (r, l) = (self.expr(r, env, &sub)?, self.expr(l, env, &sub)?);
                            return Ok(E::Cond(Box::new(a), Box::new(r), Box::new(l)));
                        }
                    }
                }
                // MO-10i: an operator that makes a primitive keeps nothing of what it reads
                if !matches!(op.as_str(), "??" | "||" | "&&") {
                    self.raw.insert(&**l as *const Expr);
                    self.raw.insert(&**r as *const Expr);
                }
                let l = self.expr(l, env, &sub)?;
                let r = self.expr(r, env, &sub)?;
                match op.as_str() {
                    "==" => rtc("eq", vec![l, r]),
                    "!=" => not(rtc("eq", vec![l, r])),
                    op => bin(static_op(op), l, r),
                }
            }
            ExprKind::Un { op, e: x } => {
                if let Some(a) = self.asks(e, env, false)? {
                    return Ok(a);
                }
                self.raw.insert(&**x as *const Expr);
                E::Un(static_op(op), Box::new(self.expr(x, env, &sub)?))
            }
            ExprKind::Draft { .. } => return fail("a draft is an equation's whole expression"),
            ExprKind::Spread(_) => return fail("spread outside an array literal"),
            ExprKind::ServerFn { .. } => undef(),
        })
    }
    fn lang(&self, env: Env, name: &str) -> Option<Lang> {
        language(name, self.lookup(env, name).is_some(), self.set.conformance)
    }
    fn reference(&mut self, name: &str, env: Env, ctx: &Ctx) -> R<E> {
        if ctx.effect && name.len() > 1 && name.starts_with('$') && name[1..].bytes().all(|b| b.is_ascii_digit()) {
            return Ok(E::Index(Box::new(id("$p")), Box::new(E::Num(name[1..].parse::<f64>().unwrap())), false));
        }
        let Some(b) = self.lookup(env, name) else {
            let own = match language(name, false, self.set.conformance) {
                Some(Lang::Fn) => Some(dot(id("__B"), name)),
                Some(Lang::Log) if ctx.imp || ctx.dynamic => Some(dot(id("__B"), name)),
                Some(Lang::OnSettled | Lang::OnFlush) if ctx.dynamic => Some(dot(id("__rt"), name)),
                _ => None,
            };
            if ctx.dynamic {
                // a scenario's row names what the program binds, else the language's function
                let mut a = vec![str(name)];
                if let Some(f) = own {
                    a.push(E::Bool(!ctx.imp));
                    a.push(f);
                } else if !ctx.imp {
                    a.push(E::Bool(true));
                }
                return Ok(rtc("dget", a));
            }
            if let Some(f) = own {
                return Ok(f);
            }
            return fail(format!("unbound {name}"));
        };
        if let Some(x) = b.sub {
            // the fn outlives its lowering
            return self.expr(unsafe { &*x }, env, &reactive());
        }
        if let Some((i, apart)) = b.shared {
            return Ok(call(id(if apart { "r$" } else { "n$" }), vec![E::Num(i as f64)]));
        }
        match b.kind {
            Kind::Acc | Kind::Src => Ok(if ctx.imp { rtc("snapshot", vec![id(b.js)]) } else { call(id(b.js), vec![]) }),
            // a component value is the compiled component (MO-11c)
            _ => Ok(id(b.js)),
        }
    }
    /// R-f-4: error class names → a JS array of their values; `undefined`: every failure.
    fn classes(&mut self, names: Option<&[String]>, env: Env) -> R<E> {
        let Some(names) = names else { return Ok(undef()) };
        let mut out = vec![];
        for n in names {
            out.push(match n.as_str() {
                "Error" => id("Error"),
                "Panic" => rt("PANIC"),
                _ => self.reference(n, env, &reactive())?,
            });
        }
        Ok(E::Arr(out))
    }

    // ---- imperative scope
    fn stmts(&mut self, ss: &[Stmt], env0: Env, ctx: &Ctx, return_last: bool) -> R<Vec<S>> {
        let env = self.new_env(Some(env0));
        let sub = Ctx { tail: false, ..ctx.clone() };
        let mut out = vec![];
        for (i, s) in ss.iter().enumerate() {
            // AC-1 / R-f-4: a statement-level `await … catch` is a try around the await
            let c = match &s.k {
                StmtKind::Let { e: c @ Expr { k: ExprKind::Catch { e: inner, .. }, .. }, .. } | StmtKind::Expr(c @ Expr { k: ExprKind::Catch { e: inner, .. }, .. }) if matches!(&inner.k, ExprKind::Await { .. }) => Some(c),
                _ => None,
            };
            if let Some(Expr { k: ExprKind::Catch { e: ce, name: cn, classes, alt }, .. }) = c {
                let v = if let StmtKind::Let { name, .. } = &s.k { Some(mg(name)) } else { None };
                let set = |x: E| match &v {
                    Some(v) => sexpr(E::Assign("=", Box::new(id(v.clone())), Box::new(x))),
                    None => sexpr(x),
                };
                let h = self.new_env(Some(env));
                if let Some(n) = cn {
                    self.set(h, n, val(mg(n)));
                }
                let ev = cn.as_ref().map(|n| mg(n)).unwrap_or("__e".into());
                if let Some(v) = &v {
                    out.push(S::Let(v.clone(), None));
                }
                let body = self.expr(ce, env, &sub)?;
                let cls = self.classes(classes.as_deref(), env)?;
                let a = self.expr(alt, h, &sub)?;
                out.push(S::Try {
                    block: vec![set(body)],
                    param: Some(ev.clone()),
                    handler: Some(vec![S::IfThen(not(rtc("isA", vec![id(ev.clone()), cls])), Box::new(S::Throw(id(ev)))), set(a)]),
                    fin: None,
                });
                if let (Some(v), StmtKind::Let { name, .. }) = (&v, &s.k) {
                    self.set(env, name, val(v.clone()));
                }
                continue;
            }
            match &s.k {
                StmtKind::Let { name, e, .. } => {
                    self.updater_closure(name, s.line as usize, e, env);
                    let x = self.expr(e, env, &sub)?;
                    out.push(S::Let(mg(name), Some(x)));
                    self.set(env, name, val(mg(name)));
                }
                StmtKind::Expr(e) => {
                    self.raw.insert(e as *const Expr); // MO-10i: its value is dropped, or is the callback's result
                    let x = self.expr(e, env, &sub)?;
                    out.push(if return_last && i == ss.len() - 1 { S::Return(Some(x)) } else { sexpr(x) });
                }
                StmtKind::Return(e) => {
                    let x = match e {
                        Some(e) => {
                            self.raw.insert(e as *const Expr); // MO-10i: a draft is named only in its own callback, whose result is the library's
                            Some(self.expr(e, env, &sub)?)
                        }
                        None => None,
                    };
                    out.push(S::Return(x));
                }
                StmtKind::Throw(e) => out.push(S::Throw(self.expr(e, env, &sub)?)),
                StmtKind::Write { target, e } | StmtKind::Optimistic { target, e } => {
                    let optimistic = matches!(&s.k, StmtKind::Optimistic { .. });
                    let mut keys = vec![];
                    for p in &target.path {
                        keys.push(match p {
                            PathSeg::Name(n) => str(n.clone()),
                            PathSeg::Expr(x) => {
                                self.raw.insert(x as *const Expr); // a key is a primitive
                                self.expr(x, env, &sub)?
                            }
                        });
                    }
                    let has_path = !keys.is_empty();
                    let keys = E::Arr(keys);
                    // MO-10i: a value written to a path of a draft goes straight back to the library
                    if !optimistic && has_path && !target.is_ctx() && self.lookup(env, &target.name).is_some_and(|b| b.draft) {
                        self.raw.insert(e as *const Expr);
                    }
                    let v = self.expr(e, env, &sub)?;
                    if ctx.dynamic && !target.is_ctx() && self.lookup(env, &target.name).is_none() {
                        out.push(sexpr(rtc("dset", vec![str(target.name.clone()), keys, v, E::Bool(optimistic)])));
                        continue;
                    }
                    // MO-10i: a library's draft, written along its path
                    if !optimistic && has_path && !target.is_ctx() {
                        if let Some(b) = self.lookup(env, &target.name).filter(|b| b.kind == Kind::Val && b.w.is_none()) {
                            let E::Arr(mut segs) = keys else { unreachable!() };
                            // W-6: `d.n := v => v + 1` applies it. The place is evaluated once, as `x[k] += 1` is: the object
                            // up to the last key, then that key, then the old value read from them and the new one written
                            // there (`d.items[next()] := v => v + 1` calls `next` once)
                            let updater = matches!(&e.k, ExprKind::Fn { params, stmts: None, .. } if params.len() == 1);
                            if updater {
                                let last = segs.pop().unwrap();
                                let obj = segs.into_iter().fold(id(b.js), |o, k| E::Index(Box::new(o), Box::new(k), false));
                                let place = E::Index(Box::new(id("__o$d")), Box::new(id("__k$d")), false);
                                out.push(S::Block(vec![
                                    S::Const(Pat::Id("__o$d".into()), obj),
                                    S::Const(Pat::Id("__k$d".into()), last),
                                    sexpr(E::Assign("=", Box::new(place.clone()), Box::new(E::Call(Box::new(v), vec![place])))),
                                ]));
                                continue;
                            }
                            let lhs = segs.into_iter().fold(id(b.js), |o, k| E::Index(Box::new(o), Box::new(k), false));
                            out.push(sexpr(E::Assign("=", Box::new(lhs), Box::new(v))));
                            continue;
                        }
                    }
                    let w = if target.is_ctx() {
                        let c = self.reference(&target.name, env, &Ctx { dynamic: ctx.dynamic, ..Ctx::default() })?;
                        dot(rtc("use", vec![c, id("__o")]), "w")
                    } else {
                        match self.lookup(env, &target.name).and_then(|b| b.w) {
                            Some(w) => id(w),
                            None => return fail(format!("W-1: {} is not a source", target.name)),
                        }
                    };
                    out.push(sexpr(if optimistic {
                        call(dot(w, "guess"), if has_path { vec![v, keys] } else { vec![v] })
                    } else if has_path {
                        call(dot(w, "path"), vec![keys, v])
                    } else {
                        call(dot(w, "set"), vec![v])
                    }));
                }
                StmtKind::Refresh(n) | StmtKind::Affects(n) => {
                    let get = match self.lookup(env, n) {
                        Some(b) => id(b.js),
                        None => dot(rtc("lookup", vec![str(n.clone())]), "get"),
                    };
                    out.push(sexpr(if matches!(&s.k, StmtKind::Refresh(_)) { rtc("refresh", vec![str(n.clone()), get]) } else { rtc("affects", vec![get]) }));
                }
                StmtKind::Action(body) => {
                    let b = self.stmts(body, env, &Ctx { imp: true, gen: true, dynamic: ctx.dynamic, ..Ctx::default() }, false)?;
                    let gen = E::Func(Box::new(Func { name: None, params: vec![], directives: vec![], body: b, is_async: false, generator: true }));
                    out.push(sexpr(call(rtc("action", vec![gen]), vec![])));
                }
                StmtKind::Sif { c, t, f } => {
                    self.raw.insert(c as *const Expr);
                    let c = self.expr(c, env, &sub)?;
                    let t = self.stmts(t, env, ctx, false)?;
                    let f = self.stmts(f, env, ctx, false)?;
                    out.push(S::If(c, t, Some(f)));
                }
                // 07 §5: a loop of imperative scope; its variable is a constant of each turn
                StmtKind::For { name, e, body } => {
                    // MO-10i: a turn of a loop over a path of a draft is a place of that draft
                    let place = self.draft_place(e, env);
                    if place {
                        self.raw.insert(e as *const Expr);
                    }
                    let x = self.expr(e, env, &sub)?;
                    let inner = self.new_env(Some(env));
                    let mut b = val(mg(name));
                    b.draft = place;
                    self.set(inner, name, b);
                    let b = self.stmts(body, inner, ctx, false)?;
                    // the loop visits what `e` holds when it starts (07 §5): a turn that adds to the list it loops over
                    // does not lengthen the loop
                    out.push(S::ForOf(mg(name), E::Arr(vec![E::Spread(Box::new(x))]), b));
                }
                StmtKind::Try { body, catch_name, catch_classes, handler, fin } => {
                    let block = self.stmts(body, env, ctx, false)?;
                    let (param, handler) = match handler {
                        Some(hs) => {
                            let h = self.new_env(Some(env));
                            if let Some(n) = catch_name {
                                self.set(h, n, val(mg(n)));
                            }
                            let v = catch_name.as_ref().map(|n| mg(n)).unwrap_or("__e".into());
                            let mut hb = vec![];
                            if let Some(cc) = catch_classes {
                                // R-f-6: a typed catch rethrows other classes
                                let cls = self.classes(Some(cc), env)?;
                                hb.push(S::IfThen(not(rtc("isA", vec![id(v.clone()), cls])), Box::new(S::Throw(id(v.clone())))));
                            }
                            hb.append(&mut self.stmts(hs, h, ctx, false)?);
                            (Some(v), Some(hb))
                        }
                        None => (None, None),
                    };
                    let fin = match fin {
                        Some(f) => Some(self.stmts(f, env, ctx, false)?),
                        None => None,
                    };
                    out.push(S::Try { block, param, handler, fin });
                }
            }
        }
        Ok(out)
    }

    // ---- views: JSX, which Solid's compiler lowers for the DOM, the server and the test renderer
    /// A view: a fragment of children. Text is a string child; `{e}` is `{__rt.show(e)}` (a value is formatted, a view is
    /// inserted); control flow is Solid's components. What is a hole, a scope or a memo is the compiler's to decide. An empty
    /// view is `<></>`, as any other (it was `null` while Solid's universal renderer lost an empty array's slot, DV-13: fixed
    /// in solidjs/solid#4276, 2026-10-26).
    fn markup(&mut self, ms: &[Markup], env: Env) -> R<E> {
        Ok(E::Jsx(Box::new(Jsx::Frag(self.kids(ms, env)?, None))))
    }
    /// MO-11k: a render prop, an arrow over the view, its parameters bound as values.
    /// RG-4c: to an .rx component (`one`), a function of one parameter: where plain content is taken as well, it is told from a
    /// thunk by it.
    fn view_fn(&mut self, params: &[String], decls: &[Decl], body: &[Markup], env: Env, one: bool) -> R<E> {
        let inner = self.new_env(Some(env));
        for p in params {
            self.set(inner, p, val(mg(p)));
        }
        let pre = self.owned(decls, body, inner, false)?;
        let ps: Vec<P> = params.iter().map(|p| P::Id(mg(p))).collect();
        Ok(arrow_block(if one && ps.is_empty() { vec![P::Id("__s".into())] } else { ps }, pre, false))
    }
    fn kids(&mut self, ms: &[Markup], env: Env) -> R<Vec<Child>> {
        let mut out = vec![];
        for m in ms {
            if let Some(c) = self.child(m, env)? {
                out.push(c);
            }
        }
        Ok(out)
    }
    /// A region's body as a child: its declarations, then its view (a function body, so it is owned where it is called).
    /// An equation a guess sits over (AC-3): not deferred, not a draft, not a wrapped server fn.
    fn guessed_eq(&self, name: &str, e: &Expr, deferred: bool) -> bool {
        self.u.optimistic.contains(name) && !deferred && !matches!(&e.k, ExprKind::Draft { .. }) && unwrap_server(e).is_none()
    }
    fn region_fn(&mut self, decls: &[Decl], view: &[Markup], env: Env, param: Option<String>, narrow: Option<(String, Bind)>, bind_name: Option<String>) -> R<E> {
        let inner = self.new_env(Some(env));
        let mut pre = vec![];
        if let Some((n, b)) = narrow {
            pre.push(konst(b.js.clone(), id("__item")));
            self.set(inner, &n, b);
        }
        if let Some(n) = bind_name {
            self.set(inner, &n, val(mg(&n)));
        }
        pre.append(&mut self.owned(decls, view, inner, false)?);
        Ok(arrow_block(param.into_iter().map(P::Id).collect(), pre, false))
    }
    /// RG-7a: what a region provides is for what is in it, so it has an owner of its own: in Solid's production build a
    /// component has none, and a branch's is its condition's, made again and again under what the last one provided.
    fn owned(&mut self, decls: &[Decl], view: &[Markup], env: Env, root: bool) -> R<Vec<S>> {
        let body = self.block(decls, view, env, None, root)?;
        Ok(if decls.iter().any(|x| matches!(x, Decl::Provide { .. })) { vec![S::Return(Some(rtc("inst", vec![arrow_block(vec![], body, false)])))] } else { body })
    }
    fn region(&mut self, decls: &[Decl], view: &[Markup], env: Env) -> R<Child> {
        let f = self.region_fn(decls, view, env, None, None, None)?;
        Ok(Child::Expr(call(f, vec![])))
    }
    /// RG-4c: the view a tag shows, `<props.f … />` in a component that does: the props, the field.
    /// RG-4c: the context a tag shows the view of, `<use.item … />`.
    fn used_view(&self, tag: &str, env: Env) -> Option<String> {
        let u = crate::modules::used_in(tag)?;
        self.lookup(env, u).filter(|b| b.view_ctx).map(|_| u.to_string())
    }
    fn shown_from(&self, tag: &str, env: Env) -> Option<(E, bool)> {
        let (n, f) = shown_in(tag)?;
        let b = self.lookup(env, n)?;
        let mixed = b.shows.iter().find(|x| x.0 == f)?.1;
        Some((dot(id(b.js), f), mixed))
    }
    fn attr(&mut self, name: &str, e: &Expr, env: Env) -> R<(String, AttrValue)> {
        let x = self.expr(e, env, &Ctx { imp: is_handler(name), is_ref: name == "ref", ..Ctx::default() })?;
        Ok((name.to_string(), AttrValue::Expr(x)))
    }
    fn child(&mut self, m: &Markup, env: Env) -> R<Option<Child>> {
        let re = reactive();
        let line = m.line;
        let el = |name: JsxName, attrs, children, self_closing| Child::Jsx(Jsx::El { name, attrs, children, self_closing, line });
        Ok(Some(match &m.kind {
            MarkupKind::Text(s) => Child::Expr(str(s.clone())),
            // CSS-4: removed; the stylesheet is the module's
            MarkupKind::Style(_) => return Ok(None),
            // a component's children are a view whoever gave them: `{props.children}` is inserted as it is, where another
            // value is formatted (a JS library hands a component its text as an array of strings)
            MarkupKind::Read(e) => {
                // RG-4c: a view that was not given shows nothing
                let f = match self.given(e, env) {
                    Some(Given::Children { .. }) => "kids",
                    Some(g) if g.held() => "opt",
                    // a context that holds a view, shown: one that was not given shows nothing
                    _ if matches!(&e.k, ExprKind::Use(n) if self.lookup(env, n).is_some_and(|b| b.view_ctx)) => "opt",
                    _ => "show",
                };
                Child::Expr(rtc(f, vec![self.expr(e, env, &re)?]))
            }
            MarkupKind::El { tag, children, .. } if tag.is_empty() => {
                if children.is_empty() {
                    Child::Text("null".into())
                } else {
                    Child::Jsx(Jsx::Frag(self.kids(children, env)?, line))
                }
            }
            // RG-4c: the view the component was given, applied (plain content, as it is)
            MarkupKind::El { tag, attrs, .. } if self.shown_from(tag, env).is_some() || self.used_view(tag, env).is_some() => {
                // `<use.item … />`: the view a context holds
                let (view, mixed) = match self.used_view(tag, env) {
                    Some(u) => (rtc("useGet", vec![self.reference(&u, env, &reactive())?, id("__o")]), false),
                    None => self.shown_from(tag, env).unwrap(),
                };
                let mut xs = vec![];
                for a in attrs {
                    xs.push(self.attr(&a.name, &a.e, env)?);
                }
                let applied = E::Jsx(Box::new(Jsx::El { name: JsxName::Ident("V$view".into()), attrs: xs, children: vec![], self_closing: true, line }));
                let mut args = vec![view, arrow(&["V$view"], applied)];
                if mixed {
                    args.push(E::Bool(true));
                }
                Child::Expr(rtc("view", args))
            }
            MarkupKind::El { tag, attrs, children } if tag.as_bytes()[0].is_ascii_uppercase() => {
                // MO-11q: `<Dialog.Root>`, a member of a declared JS object
                let member = match tag.split_once('.') {
                    Some((h, m)) if self.lookup(env, tag).is_none() => self.lookup(env, h).map(|hb| (hb.js.clone(), m.to_string())),
                    _ => None,
                };
                let b = match &member {
                    Some(_) => None,
                    None => Some(self.lookup(env, tag).filter(|b| b.kind == Kind::Comp)),
                };
                if let Some(None) = b {
                    return fail(format!("unknown component {tag}"));
                }
                let plain = matches!(&b, Some(Some(b)) if b.plain);
                let kids_value = matches!(&b, Some(Some(b)) if b.kids_value);
                let (name, shape) = match (&member, b.flatten()) {
                    (Some((o, m)), _) => (JsxName::Member(o.clone(), m.clone()), Some(FShape::Comp)),
                    (None, Some(b)) => (JsxName::Ident(b.js), b.shape),
                    (None, None) => unreachable!(),
                };
                let mut xs = vec![];
                for a in attrs {
                    // MO-11t: a component given by name to a prop typed `View` is applied there, with no arguments: the
                    // element, made where the library reads the prop (JSX's `fallback={<Empty />}`, a getter)
                    if let Some(n) = self.views.given(tag, &a.name, &a.e) {
                        let applied = Markup { kind: MarkupKind::El { tag: n.to_string(), attrs: vec![], children: vec![] }, line: m.line, span: m.span };
                        if let Some(Child::Jsx(j)) = self.child(&applied, env)? {
                            xs.push((a.name.clone(), AttrValue::Expr(rtc("slot", vec![thunk(E::Jsx(Box::new(j)))]))));
                        }
                        continue;
                    }
                    xs.push(self.attr(&a.name, &a.e, env)?);
                }
                // MO-11k: named render props are attributes
                for c in children {
                    if let MarkupKind::Mview { prop: Some(p), params, decls, body } = &c.kind {
                        let f = self.view_fn(params, decls, body, env, shape != Some(FShape::Comp))?;
                        xs.push((p.clone(), AttrValue::Expr(f)));
                    }
                }
                let rest: Vec<&Markup> = children.iter().filter(|c| !matches!(&c.kind, MarkupKind::Mview { prop: Some(_), .. })).collect();
                if rest.is_empty() {
                    // MO-11: a JS component gets JSX's own `<X />`, with no children prop
                    return Ok(Some(el(name, xs, vec![], true)));
                }
                if shape != Some(FShape::Comp) {
                    // RG-4c: a view; what is given as plain content where a view is taken is one that asks nothing
                    let f = match &rest[..] {
                        [Markup { kind: MarkupKind::Mview { params, decls, body, .. }, .. }] => Some(self.view_fn(params, decls, body, env, true)?),
                        _ if plain => Some(self.view_fn(&[], &[], children, env, true)?),
                        _ => None,
                    };
                    if let Some(f) = f {
                        return Ok(Some(el(name, xs, vec![Child::Expr(f)], false)));
                    }
                }
                // RG-4c: content is a block of the caller's names, made and owned where it is shown. One `{e}` that asks
                // nothing of its place (no `use`, no `await`) is given as the value it is: a function prop is one
                let lone = matches!(&rest[..], [Markup { kind: MarkupKind::Read(e), .. }] if matches!(e.k, ExprKind::Fn { .. }) || !placed(&e.to_json()));
                let blank = rest.iter().all(|c| matches!(&c.kind, MarkupKind::Text(t) if t.trim().is_empty()));
                if !lone && !blank {
                    let f = self.region_fn(&[], children, env, None, None, None)?; // a named view among them is an attribute: no child
                    return Ok(Some(el(name, xs, vec![Child::Expr(rtc("slot", vec![f]))], false))); // asked whether it was given, it is not made
                }
                let mut kids = vec![];
                match &rest[..] {
                    // children that are a value: the value
                    [Markup { kind: MarkupKind::Read(e), .. }] if kids_value => kids.push(Child::Expr(self.expr(e, env, &reactive())?)),
                    _ => {
                        for c in rest {
                            kids.extend(self.child(c, env)?);
                        }
                    }
                }
                el(name, xs, kids, false)
            }
            MarkupKind::El { tag, attrs, children } => {
                let mut xs = vec![];
                for a in attrs {
                    xs.push(match (&self.style_hash, a.name.as_str(), &a.e.k) {
                        (Some(h), "class", ExprKind::Lit(Lit::Str(v))) => ("class".to_string(), AttrValue::Expr(str(format!("{v} {h}")))),
                        (Some(h), "class", _) => {
                            let h = h.clone();
                            ("class".to_string(), AttrValue::Expr(rtc("scopedClass", vec![self.expr(&a.e, env, &re)?, str(h)])))
                        }
                        _ => self.attr(&a.name, &a.e, env)?,
                    });
                }
                // CSS-2: every HTML element of the view
                if let Some(h) = &self.style_hash {
                    if !attrs.iter().any(|a| a.name == "class") {
                        xs.push(("class".into(), AttrValue::Str(h.clone())));
                    }
                }
                if VOID_TAGS.contains(&tag.as_str()) {
                    el(JsxName::Ident(tag.clone()), xs, vec![], true)
                } else {
                    el(JsxName::Ident(tag.clone()), xs, self.kids(children, env)?, false)
                }
            }
            MarkupKind::Mif { c, t, t_decls, f, f_decls } => {
                let whether = self.asks(c, env, true)?; // RG-4c: a view asked for is not its answer
                let narrowed = if let (ExprKind::Id(n), None) = (&c.k, &whether) { self.lookup(env, n).filter(|b| matches!(b.kind, Kind::Acc | Kind::Src)).map(|b| (n.clone(), b)) } else { None };
                let narrow = narrowed.map(|(n, b)| {
                    let mut nb = bind(Kind::Acc, format!("n${n}"));
                    nb.w = b.w;
                    nb.given = b.given;
                    (n, nb)
                });
                let tf = self.region_fn(t_decls, t, env, Some("__item".into()), narrow, None)?;
                // RG-4c: a view left out is whatever the caller writes for nothing (`children: []`)
                let asked = match &c.k {
                    ExprKind::Member { o, p, .. } => match &o.k {
                        ExprKind::Id(n) => self.shown_from(&format!("{n}.{p}"), env),
                        _ => None,
                    },
                    _ => None,
                };
                let when = match asked {
                    Some((view, _)) => bin("===", E::Un("typeof", Box::new(view)), str("function")),
                    None => match whether {
                        Some(a) => a,
                        None => self.expr(c, env, &re)?,
                    },
                };
                let fb = self.region_fn(f_decls, f, env, None, None, None)?;
                el(JsxName::Ident("Show".into()), vec![("when".into(), AttrValue::Expr(when)), ("fallback".into(), AttrValue::Expr(call(fb, vec![])))], vec![Child::Expr(tf)], false)
            }
            MarkupKind::Mview { prop: Some(_), .. } => return Ok(None), // an attribute of the component it is given to
            MarkupKind::Mview { params, decls, body, .. } => Child::Expr(self.view_fn(params, decls, body, env, false)?),
            MarkupKind::Mfor { name, xs, decls, body } => {
                let b = self.region_fn(decls, body, env, Some(mg(name)), None, Some(name.clone()))?;
                let each = self.expr(xs, env, &re)?;
                el(JsxName::Ident("For".into()), vec![("each".into(), AttrValue::Expr(each))], vec![Child::Expr(b)], false)
            }
            MarkupKind::Loading { on, fallback, decls, body } => {
                let mut xs = vec![];
                if let Some(o) = on {
                    xs.push(("on".to_string(), AttrValue::Expr(self.expr(o, env, &re)?)));
                }
                let fb = self.markup(fallback, env)?;
                xs.push(("fallback".into(), AttrValue::Expr(fb)));
                let r = self.region(decls, body, env)?;
                el(JsxName::Ident("Loading".into()), xs, vec![r], false)
            }
            // RG-8: Solid's Portal (the web's, or the test renderer's)
            MarkupKind::Portal { to, decls, body } => {
                let mut xs = vec![];
                if let Some(t) = to {
                    xs.push(("mount".to_string(), AttrValue::Expr(self.expr(t, env, &re)?)));
                }
                let r = self.region(decls, body, env)?;
                el(JsxName::Member("__rt".into(), "Portal".into()), xs, vec![r], false)
            }
            MarkupKind::Errored { fallback, decls, body, err_name, classes } => {
                let fb_env = self.new_env(Some(env));
                if let Some(n) = err_name {
                    self.set(fb_env, n, bind(Kind::Acc, mg(n)));
                }
                let fm = self.markup(fallback, fb_env)?;
                let p = err_name.as_ref().map(|n| mg(n)).unwrap_or("__err".into());
                let fallback = ("fallback".to_string(), AttrValue::Expr(arrow(&[&p], fm)));
                let b = self.region(decls, body, env)?;
                // R-f-4: a typed boundary passes other classes up
                match classes {
                    Some(cs) => {
                        let cls = self.classes(Some(cs), env)?;
                        el(JsxName::Member("__rt".into(), "TypedErrored".into()), vec![("classes".into(), AttrValue::Expr(cls)), fallback], vec![b], false)
                    }
                    None => el(JsxName::Ident("Errored".into()), vec![fallback], vec![b], false),
                }
            }
        }))
    }
}

fn static_op(op: &str) -> &'static str {
    const OPS: &[&str] = &["+", "-", "*", "/", "%", "**", "<", ">", "<=", ">=", "===", "!==", "&&", "||", "??", "!", "typeof", "in", "instanceof", "==", "!="];
    OPS.iter().find(|o| **o == op).copied().unwrap_or_else(|| panic!("operator {op}"))
}

/// The reference drops every line `return null;` of an instantiating fn's body (its block's empty view).
/// `to` as an import specifier from the module at `from` (both paths as the loader keyed them)
fn relative(from: &str, to: &str) -> String {
    let (f, t): (Vec<&str>, Vec<&str>) = (from.split('/').collect(), to.split('/').collect());
    let dir = &f[..f.len() - 1];
    let common = dir.iter().zip(&t).take_while(|(a, b)| a == b).count();
    let up = dir.len() - common;
    let rest = t[common..].join("/");
    if up == 0 { format!("./{rest}") } else { format!("{}{rest}", "../".repeat(up)) }
}

/// The statements `out[from..]` lower the declaration on `.rx` line `line` (the program's layout keeps it, CP-1c).
fn at(out: &mut [S], from: usize, line: usize) {
    for s in &mut out[from..] {
        *s = S::At(line, Box::new(std::mem::replace(s, S::Block(vec![]))));
    }
}

fn strip_return_null(ss: &mut Vec<S>) {
    ss.retain(|s| !matches!(s, S::Return(Some(E::Null))));
    for s in ss.iter_mut() {
        let mut s = s;
        while let S::At(_, inner) = s {
            s = inner;
        }
        if let S::Func(f) = s {
            strip_return_null(&mut f.body);
        }
    }
}

// ---------------------------------------------------------------- CP-1b: the views through Solid's compiler

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Target {
    Universal,
    Dom,
    Ssr,
}

pub struct Lowered {
    pub code: String,
    /// a source map from `code` onto the module's `.rx` text, when one was asked for
    pub map: Option<String>,
}

/// Each module's JSX → JavaScript for `target` (`ref/compile/jsx.ts`): dom and ssr with hydration; universal over the
/// renderer `module_name`. With `rx` (the module's `.rx` path and text), the output carries a source map onto it. CP-1c:
/// Solid's positions are the program's layout; each maps to the `.rx` line it was lowered from (`oxc::Build::lines`), at
/// that line's first non-blank column. An error's `(line:column)` is reported as its `.rx` line.
pub fn lower_view(module: &[S], filename: &str, target: Target, module_name: &str, rx: Option<(&str, &str)>) -> Result<Lowered, String> {
    use solidjs_compiler::{compile_program, CompileOptions, Generate};
    let alloc = oxc_allocator::Allocator::default();
    let build = crate::oxc::Build::new(&alloc);
    let program = build.program(module);
    let lines = build.lines();
    let src = program.source_text;
    let options = CompileOptions {
        filename: Some(filename.strip_suffix(".mjs").map(|s| format!("{s}.jsx")).unwrap_or(filename.to_string())),
        generate: match target {
            Target::Universal => Generate::Universal,
            Target::Dom => Generate::Dom,
            Target::Ssr => Generate::Ssr,
        },
        hydratable: target != Target::Universal,
        module_name: module_name.to_string(),
        source_map: rx.is_some(),
        ..CompileOptions::default()
    };
    let line_of = |pos: u32| lines.get(pos as usize).copied().filter(|l| *l > 0);
    let out = compile_program(&alloc, program, src, &options).map_err(|e| {
        // the blank layout is one line: a position is `(1:offset+1)`
        let re = regex::Regex::new(r"\(1:(\d+)\)").unwrap();
        re.replace_all(e.message(), |c: &regex::Captures| match c[1].parse::<u32>().ok().and_then(|n| line_of(n.saturating_sub(1))) {
            Some(l) => format!("({}:{l})", rx.map(|r| r.0).unwrap_or(filename)),
            None => c[0].to_string(),
        })
        .into_owned()
    })?;
    let map = match (rx, out.source_map) {
        (Some((path, text)), Some(json)) => {
            let layout = oxc_sourcemap::SourceMap::from_json_string(&json).map_err(|e| format!("source map: {e:?}"))?;
            let indent: Vec<u32> = text.lines().map(|l| l.chars().take_while(|c| c.is_whitespace()).map(|c| c.len_utf16() as u32).sum()).collect();
            let mut b = oxc_sourcemap::SourceMapBuilder::default();
            b.set_file(filename);
            let id = b.add_source_and_content(path, text);
            let mut last = None;
            for t in layout.get_tokens() {
                let Some(l) = t.get_source_id().and_then(|_| line_of(t.get_src_col())) else { continue };
                let at = (t.get_dst_line(), t.get_dst_col(), l);
                if last.is_some_and(|(dl, _, ll)| dl == at.0 && ll == l) {
                    continue; // the same .rx line, further along the same output line
                }
                last = Some(at);
                b.add_token(at.0, at.1, l - 1, indent.get(l as usize - 1).copied().unwrap_or(0), Some(id), None);
            }
            Some(b.into_sourcemap().to_json_string())
        }
        _ => None,
    };
    Ok(Lowered { code: out.code, map })
}

/// MO-11f, MO-11j: an equation bound from a declared factory's call is a component (`Router = createRouter(…)`).
fn made_component(p: &Program, name: &str, declarations: &indexmap::IndexMap<String, Vec<crate::parse::JsDecl>>) -> bool {
    made_component_in(&p.decls, name, declarations)
}
pub(crate) fn made_component_in(decls: &[Decl], name: &str, declarations: &indexmap::IndexMap<String, Vec<crate::parse::JsDecl>>) -> bool {
    let Some(Decl::Eq { e, .. }) = decls.iter().find(|x| matches!(x, Decl::Eq { name: n, .. } if n == name)) else { return false };
    let ExprKind::Call { f, .. } = &e.k else { return false };
    let ExprKind::Id(g) = &f.k else { return false };
    for i in decls {
        if let Decl::Import { names, declared: Some(dp), .. } = i {
            if let Some(n) = names.iter().find(|x| &x.alias == g) {
                return declarations.get(dp).is_some_and(|ds| ds.iter().any(|x| matches!(x, crate::parse::JsDecl::Fn { name, shape: crate::parse::Shape::Comp, .. } if *name == n.name)));
            }
        }
    }
    false
}

/// An expression written out as a constant: a literal, or an array, a record, a template or a sign over them.
fn constant(e: &Expr) -> bool {
    match &e.k {
        ExprKind::Lit(_) => true,
        ExprKind::Un { e, .. } => constant(e),
        ExprKind::Tpl(parts) => parts.iter().all(|p| match p {
            TplPart::Str(_) => true,
            TplPart::Expr(e) => constant(e),
        }),
        ExprKind::Arr(items) => items.iter().all(constant),
        ExprKind::Rec(fields) => fields.iter().all(|f| matches!(f, Field::Kv { v, .. } if constant(v))),
        _ => false,
    }
}

/// Whether an expression asks something of the place it is evaluated at: a `use`, an `await` (not in a closure, which is a value).
fn placed(v: &serde_json::Value) -> bool {
    match v {
        serde_json::Value::Array(xs) => xs.iter().any(placed),
        serde_json::Value::Object(o) => match o.get("k").and_then(|k| k.as_str()) {
            Some("use" | "await") => true,
            _ => o.values().any(placed),
        },
        _ => false,
    }
}
