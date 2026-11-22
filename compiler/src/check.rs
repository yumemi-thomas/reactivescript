//! The checker: spec/08-constraints.md, ported from `ref/src/check.ts`. Every diagnostic is an error (CN-1a); codes keep
//! Solid's names where one exists (CN-1b); `rule` is the spec rule enforced. Names resolve lexically (RG-7a); provisions
//! resolve through the static application tree (RG-7b). The walk also records the resolved model (CP-6, `model.rs`).
//!
//! The port keeps the reference's structure — a walk that records readers, applications, actions and provisions, lazy row
//! and failure thunks over symbols, and a resolution over the application tree after the walk — so that its verdicts,
//! messages and their order are the reference's (`ref/crate.ts` diffs them on every scenario program).

use crate::ast::*;
use crate::content::{misnested, misnested_inside, Shape, P_CLOSERS, P_SCOPE};
use crate::infer::{inferred_action, run_findings, scalar_type, trigger_text, Code, RunOpts};
use crate::model::{ModelBuilder, ModelSymbol};
use crate::modules::ModuleSet;
use crate::parse::{field_rows, js_trim, split_top, JsDecl, Part, Shape as FShape};
use crate::signature::{Catch, CompSig, ExportSig, ModSig, Own, PropSig, SigParam, HOLD};
use indexmap::{IndexMap, IndexSet};
use regex::Regex;
use std::cell::Cell;
use std::collections::{HashMap, HashSet};
use std::sync::LazyLock;

#[derive(Debug, Clone, PartialEq)]
pub struct Diagnostic {
    pub code: String,
    pub rule: String,
    pub line: i64,
    pub msg: String,
    pub file: Option<String>,
}
impl Diagnostic {
    pub fn to_json(&self) -> serde_json::Value {
        let mut m = serde_json::Map::new();
        m.insert("code".into(), self.code.clone().into());
        m.insert("rule".into(), self.rule.clone().into());
        m.insert("line".into(), self.line.into());
        m.insert("msg".into(), self.msg.clone().into());
        if let Some(f) = &self.file {
            m.insert("file".into(), f.clone().into());
        }
        serde_json::Value::Object(m)
    }
}

const BUILTINS: &[&str] = &["len", "str", "map", "filter", "sum", "fail", "fetch", "every", "indexOf"];
/// MO-10k: the builtins that answer a primitive, whatever they are given
/// MO-10i (closed 2026-11-22): what is called on a draft is a method of plain data, by name — an Array's, a Map's, a
/// Set's, a string's or a number's. `DRAFT_CALLBACKS` are the ones that call a function they are given, now, with parts of
/// the data.
const DRAFT_METHODS: &[&str] = &[
    "push", "pop", "shift", "unshift", "splice", "reverse", "fill", "copyWithin", "includes", "indexOf", "lastIndexOf", "at", "slice", "concat", "join", "flat", "keys", "values", "entries", "with", "toReversed", "toSpliced",
    "set", "get", "has", "add", "delete", "clear",
    "trim", "trimStart", "trimEnd", "toUpperCase", "toLowerCase", "startsWith", "endsWith", "padStart", "padEnd", "split", "replace", "replaceAll", "charAt", "charCodeAt", "codePointAt", "substring", "repeat", "normalize", "localeCompare", "match", "search",
    "toFixed", "toPrecision", "toString", "toLocaleString", "valueOf", "hasOwnProperty",
];
const DRAFT_CALLBACKS: &[&str] = &["forEach", "map", "filter", "find", "findIndex", "findLast", "findLastIndex", "some", "every", "flatMap", "reduce", "reduceRight", "sort", "toSorted"];
/// W-1a: an Array's methods that change it in place.
const ARRAY_MUTATORS: &[&str] = &["push", "pop", "shift", "unshift", "splice", "sort", "reverse", "fill", "copyWithin"];
const SCALAR_BUILTINS: &[&str] = &["len", "str", "sum", "every", "indexOf"];
/// EF-5's cleanup shapes: a `return` of a closure anywhere in the body, a closure as its last expression, or an expression body that is one.
fn returns_closure(f: &Expr) -> bool {
    fn in_stmts(ss: &[Stmt]) -> bool {
        ss.iter().any(|s| match &s.k {
            StmtKind::Return(Some(Expr { k: ExprKind::Fn { .. }, .. })) => true,
            StmtKind::Sif { t, f, .. } => in_stmts(t) || in_stmts(f),
            StmtKind::For { body, .. } => in_stmts(body),
            StmtKind::Try { body, handler, fin, .. } => in_stmts(body) || handler.as_deref().is_some_and(in_stmts) || fin.as_deref().is_some_and(in_stmts),
            _ => false,
        })
    }
    match &f.k {
        ExprKind::Fn { stmts: None, body, .. } => matches!(body.k, ExprKind::Fn { .. }),
        ExprKind::Fn { stmts: Some(ss), .. } => in_stmts(ss) || matches!(ss.last().map(|s| &s.k), Some(StmtKind::Expr(Expr { k: ExprKind::Fn { .. }, .. }))),
        _ => false,
    }
}

fn is_handler(attr: &str) -> bool {
    crate::awaits::is_handler(attr)
}
fn is_upper_tag(tag: &str) -> bool {
    tag.as_bytes().first().is_some_and(|c| c.is_ascii_uppercase())
}
static ROW_WORDS: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"^((?:io|pending|lane|fails\([^)]*\))\s+)+").unwrap());
static DOLLAR_PARAM: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"^\$\d+$").unwrap());
static USE_JSON: LazyLock<Regex> = LazyLock::new(|| Regex::new(r#""k":"use","name":"([^"]+)""#).unwrap());
static AT_SUFFIX: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"@\d+$").unwrap());

/// `s.split(/\s+(?![^(]*\))/)`: whitespace runs, except those inside a parenthesis.
fn split_rows(s: &str) -> Vec<String> {
    let mut out = vec![];
    let mut cur = String::new();
    let chars: Vec<(usize, char)> = s.char_indices().collect();
    let mut k = 0;
    while k < chars.len() {
        let (_, c) = chars[k];
        if c.is_whitespace() {
            let mut j = k;
            while j < chars.len() && chars[j].1.is_whitespace() {
                j += 1;
            }
            let after = if j < chars.len() { &s[chars[j].0..] } else { "" };
            let inside = match after.find(['(', ')']) {
                Some(i) => after.as_bytes()[i] == b')',
                None => false,
            };
            if inside {
                for (_, c) in &chars[k..j] {
                    cur.push(*c);
                }
            } else {
                out.push(std::mem::take(&mut cur));
            }
            k = j;
        } else {
            cur.push(c);
            k += 1;
        }
    }
    out.push(cur);
    out
}

/// A context key (`file#name`, `@n` for one declared in a block) → its name.
pub fn key_name(k: &str) -> String {
    let last = k.split('#').last().unwrap_or("");
    AT_SUFFIX.replace(last, "").to_string()
}

type RId = usize;
type SId = usize;
type EId = usize;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum SymKind {
    Source,
    Eq,
    Props,
    Value,
    Fn,
    Action,
    Comp,
    Import,
    ErrClass,
    Context,
    Server,
}
impl SymKind {
    pub fn as_str(self) -> &'static str {
        match self {
            SymKind::Source => "source",
            SymKind::Eq => "eq",
            SymKind::Props => "props",
            SymKind::Value => "value",
            SymKind::Fn => "fn",
            SymKind::Action => "action",
            SymKind::Comp => "comp",
            SymKind::Import => "import",
            SymKind::ErrClass => "errclass",
            SymKind::Context => "context",
            SymKind::Server => "server",
        }
    }
    fn reactive(self) -> bool {
        matches!(self, SymKind::Source | SymKind::Eq | SymKind::Props)
    }
}

struct Region {
    id: usize,
    depth: i64,
    parent: Option<RId>,
    component: Option<RId>,
    is_component_root: bool,
    provides: IndexSet<String>,
    catches: Option<Catch>,
    /// children passed to a component: (the component's root, the site)
    kids: Option<(RId, RId)>,
    /// MO-11o: for what a prop carries, the prop: it is rendered where the component renders that prop (else: its children)
    kids_field: Option<String>,
    /// MO-11a: a declared JS component's root
    js: bool,
    sig: Option<CompSig>,
    /// E-5a: a component root's identity across modules (`file#name`), for what its props are given
    key: Option<String>,
}

#[derive(Clone)]
struct PropRef {
    comp: RId,
    field: String,
    pre: Vec<Catch>,
}
#[derive(Clone, Default)]
struct Fails {
    cls: IndexSet<String>,
    props: Vec<PropRef>,
}
impl Fails {
    fn add(&mut self, b: Fails) {
        for x in b.cls {
            self.cls.insert(x);
        }
        self.props.extend(b.props);
    }
}

enum RowsT<'a> {
    Expr { e: &'a Expr, env: EId, cache: Option<IndexSet<String>>, busy: bool },
    Fixed(IndexSet<String>),
}
enum FailsT<'a> {
    Expr { e: &'a Expr, env: EId, cache: Option<Fails>, busy: bool },
    Fixed(IndexSet<String>),
}
enum ServerRejects<'a> {
    Body { body: &'a [Stmt], env: EId, cache: Option<IndexSet<String>> },
    Fixed(IndexSet<String>),
}

#[derive(Clone)]
struct CtxInfo {
    key: String,
    source: bool,
    dflt: bool,
    contract: Option<(IndexSet<String>, IndexSet<String>)>,
    /// its declared type, the row words taken out (MO-10k: read a step at a time, as a declared result's is)
    ty: Option<String>,
}

/// MO-10k: the three kinds of value the checker confines by mention (`Checker::tainted`)
#[derive(Clone, Copy, PartialEq, Eq, Hash)]
enum Taint {
    /// MO-11l: a value `renders` checked where it is bound
    Renders,
    /// E-10, E-5a: the instance a declared primitive made
    Instance,
    /// MO-11l: what one prop of a component is given (`Checker::probe` says which): asked to know whether the
    /// component keeps it (`prop_keeps`)
    Prop,
}
/// MO-11l: a place a value may leave its binding's region through, looked at once every call's arguments are known
struct Sink<'a> {
    /// the value leaving: an expression, or (an exported fn or action) the names its result mentions
    e: Option<&'a Expr>,
    names: Vec<String>,
    env: EId,
    line: i64,
    why: String,
    /// the way out is a prop of a component: its root, the prop, its name as written (it is no way out when that
    /// component keeps the prop)
    prop: Option<(RId, String, String)>,
}

struct Sym<'a> {
    kind: SymKind,
    name: String,
    region: RId,
    line: i64,
    question: bool,
    io: bool,
    /// a fn's parameter: never a write target (O-4)
    param: bool,
    instantiating: bool,
    params: Option<Vec<SigParam>>,
    captures: Vec<SId>,
    /// what calling that value can return holding (O-3); None: as `captures`
    ret_captures: Option<Vec<SId>>,
    /// O-3: not a name but a prop's argument, stored — its captures are the caller's ("*": all of props)
    prop_of: Option<(RId, String)>,
    maps_records: bool,
    /// a declared equation, and whether it is deferred: a guess may sit over one that is not (AC-3, ST-5c)
    eq_decl: Option<bool>,
    rows: Option<RowsT<'a>>,
    comp: Option<&'a Decl>,
    expr: Option<(&'a Expr, EId)>,
    comp_region: Option<RId>,
    comp_env: Option<EId>,
    fails_t: Option<FailsT<'a>>,
    fn_tail: Option<(&'a Expr, EId)>,
    rejects: Option<IndexSet<String>>,
    imported: Option<String>,
    /// MO-11o: an equation or source imported from this `.rx` module
    from_module: Option<String>,
    ctx: Option<CtxInfo>,
    side: Option<Side>,
    io_via: Option<String>,
    server_rejects: Option<ServerRejects<'a>>,
    fn_decl: Option<&'a Decl>,
    decl_env: Option<EId>,
    /// MO-10: a declared JS primitive (a fn) or an instance of one, or a part of it (an equation): what its result is
    foreign: Option<FShape>,
    /// RFC 14: bound from a field of an instance (`w = size.width`), which tracks (MO-10b)
    via_field: bool,
    /// E-5a: a `for` row's binding — the list it is a row of
    row_of: Option<(&'a Expr, EId)>,
    /// MO-10f: a JS fn's result fields that may hold or fail (field, holds, classes); on a binding of its result too
    held: Vec<(String, bool, Vec<String>)>,
    /// MO-10g: where a declared JS fn takes callbacks, by parameter
    cbs: Vec<Option<(bool, Vec<String>)>>,
    /// MO-12b: the JS contexts a declared hook reads (keys) — a use at each call
    needs: Vec<String>,
    /// MO-12c: the JS contexts a declared factory's component provides to what it renders
    gives: Vec<String>,
    /// MO-11i: how a declared factory (and the component it made) nests what it is given: (kids field, component field)
    nests: Option<(String, String)>,
    /// MO-11l: a declared JS fn that renders the components in its arguments where its result is bound; on the bound
    /// name, that its factory record's values are applied there
    renders: bool,
    /// MO-11l (revised 2026-11-21): a value whose components `renders` checked where it was bound — bound from a bare
    /// `renders` call, or an alias of one; it may not travel to where something else would render it
    local_renders: bool,
    /// MO-10i (2026-11-22): a closure bound to this name that is used only as the callback of a function that hands it a
    /// draft: the parameter positions that are drafts
    updater: Option<Vec<usize>>,
    /// EF-5a (2026-11-22): a declared JS fn whose result undoes the call (a subscription's disposer): the declared
    /// type that says so, `() => void` or `{ unsubscribe: () => void }` (`ty_undoes`)
    disposer: Option<String>,
    /// MO-10k: a declared JS fn's result type as written (rows and `ref` taken out), and on a binding of its result or
    /// of a part of it, that part's: the closed set of what the value answers (`ty_step`)
    ret_ty: Option<String>,
    /// MO-8k: a JS import with no declaration in any of the four places: its specifier
    undeclared: Option<String>,
    /// MO-11g: a JS fn declared or imported `pure` that makes nothing: it keeps nothing, and what it is given comes back
    /// only in its result (MO-10k), so among a factory's arguments it hands the components it is given on to the factory
    pure_fn: bool,
    /// MO-8l: a JS fn declared by a generated draft (node_modules/.rx-types): its package's specifier
    generated: Option<String>,
    /// MO-11o: a declared fn whose result carries the components in its arguments
    carrier: bool,
    /// MO-11o: on an equation bound to such a call, those arguments and their scope
    carried: Option<(&'a [Expr], EId)>,
    /// MO-11p: on such an equation, where it renders (`under(parent in inside)` on the carrying fn)
    carried_under: Option<(String, String)>,
    /// MO-11p: a carrying fn whose result renders at its parent's outlet
    under: Option<(String, String)>,
    /// MO-11p: a JS component that renders, where it is written, what nests under its component
    outlet: bool,
    /// MO-10i: a JS fn's callbacks whose parameters are its drafts (argument index, parameter positions)
    drafts: Vec<(usize, Vec<usize>)>,
    /// MO-10i (2026-11-22): a declared JS fn's parameters marked `draft`: changed in place by the call
    draft_args: Vec<usize>,
    /// ST-4: `xs key id`, the field its rows are keyed by
    row_key: Option<String>,
    /// MO-10i: the same, for its result's function parts (tuple index or field)
    part_drafts: Vec<(String, Vec<(usize, Vec<usize>)>)>,
    /// MO-10i: a callback's parameter the library declares a draft: its paths are written
    js_draft: bool,
    /// MO-11k, W-1a: a view lambda's parameter: what the component hands its render prop, the component's own value
    handed: bool,
    /// MO-10i: the closure whose parameter the draft is (its `fn_stack` id)
    draft_fn: Option<usize>,
    /// MO-11o: every equation's expression, looked through for what it carries
    carried_expr: Option<(&'a Expr, EId)>,
    /// MO-10k: the expression a name is bound to — an equation's, a local's
    val: Option<(&'a Expr, EId)>,
    /// MO-10k: what else a name's value may come from — for a closure's parameter, the call's other arguments and its
    /// receiver; for a loop's variable, what it loops over; for an effect's `$n`, its input
    srcs: Vec<(&'a Expr, EId)>,
    /// MO-10k: a parameter of a closure bound to a name, an `.rx` fn or an action of this module: that name, whose calls'
    /// arguments it may be (`call_args`)
    param_of: Option<SId>,
    /// MO-10k: a closure literal's parameter: that closure (the name it is bound to, if any, is `fn_owner`'s)
    of_fn: Option<*const Expr>,
    /// MO-10k: on such a name, every argument its calls in this module pass
    call_args: Vec<(&'a Expr, EId)>,
    /// MO-10k: what an `.rx` fn or an action of this module may give back: the names its result mentions, in its scope
    ret_flows: Option<(IndexSet<String>, EId)>,
    /// MO-11l: an `.rx` fn of another module whose signature says it can fail (a failure carries what it was thrown with)
    can_fail: bool,
    /// MO-11j: an exported factory's component — the wrapper whose summary an importer sees
    exported_as: Option<SId>,
    /// MO-11j: on that wrapper, the made component its view applies (`<Router />`)
    wraps: Option<SId>,
    /// MO-11f: a component a JS factory made — the call's arguments and the scope they name from
    factory: Option<(&'a [Expr], EId)>,
    /// MO-10d: bound from a foreign accessor — it may hold, as a question's reader does
    reader: bool,
    /// E-5a: an .rx import's `file#name`, whose changing the whole-program pass knows
    export_key: Option<String>,
    /// an action declared here: how many arguments a call passes (AC-1f)
    arity: Option<usize>,
    /// RG-4b: the props of `component C()`, which declares none — C's name: reading them is UNBOUND
    no_props: Option<String>,
}
impl<'a> Sym<'a> {
    fn new(kind: SymKind, name: &str, region: RId, line: i64) -> Self {
        Sym {
            kind,
            name: name.to_string(),
            region,
            line,
            question: false,
            io: false,
            param: false,
            instantiating: false,
            params: None,
            captures: vec![],
            ret_captures: None,
            prop_of: None,
            maps_records: false,
            eq_decl: None,
            rows: None,
            comp: None,
            expr: None,
            comp_region: None,
            comp_env: None,
            fails_t: None,
            fn_tail: None,
            rejects: None,
            imported: None,
            from_module: None,
            ctx: None,
            side: None,
            io_via: None,
            server_rejects: None,
            fn_decl: None,
            decl_env: None,
            foreign: None,
            via_field: false,
            row_of: None,
            held: vec![],
            cbs: vec![],
            needs: vec![],
            gives: vec![],
            nests: None,
            renders: false,
            local_renders: false,
            updater: None,
            disposer: None,
            ret_ty: None,
            undeclared: None,
            pure_fn: false,
            generated: None,
            carrier: false,
            carried: None,
            carried_under: None,
            under: None,
            outlet: false,
            drafts: vec![],
            draft_args: vec![],
            row_key: None,
            part_drafts: vec![],
            js_draft: false,
            handed: false,
            draft_fn: None,
            carried_expr: None,
            val: None,
            srcs: vec![],
            param_of: None,
            of_fn: None,
            call_args: vec![],
            ret_flows: None,
            can_fail: false,
            exported_as: None,
            wraps: None,
            factory: None,
            reader: false,
            export_key: None,
            arity: None,
            no_props: None,
        }
    }
}

struct Env {
    vars: IndexMap<String, SId>,
    parent: Option<EId>,
    region: RId,
}

#[derive(Clone, Copy, Default)]
struct Ctx {
    imperative: bool,
    in_fn: bool,
    in_action: bool,
    server: bool,
}
impl Ctx {
    fn reactive() -> Ctx {
        Ctx::default()
    }
    fn imperative() -> Ctx {
        Ctx { imperative: true, ..Ctx::default() }
    }
}

/// R-8: the names a handler reads as snapshots (not under `pending?` or `peek`), each with whether a `try` or a `catch`
/// expression around it takes its failure; `locals`: the names the handler binds itself (parameters, `let`s).
fn snapshot_reads<'a>(n: Node<'a>, caught: bool, locals: &mut HashSet<String>, out: &mut Vec<(String, bool)>) {
    match n {
        Node::E(e) => match &e.k {
            ExprKind::Id(name) => {
                out.push((name.clone(), caught));
                return;
            }
            ExprKind::Pending(_) | ExprKind::Peek(_) => return,
            ExprKind::Fn { params, .. } => locals.extend(params.iter().cloned()),
            ExprKind::Catch { e: inner, alt, .. } => {
                snapshot_reads(Node::E(inner), true, locals, out);
                snapshot_reads(Node::E(alt), caught, locals, out);
                return;
            }
            _ => {}
        },
        Node::S(st) => match &st.k {
            StmtKind::Let { name, .. } | StmtKind::For { name, .. } => {
                locals.insert(name.clone());
            }
            StmtKind::Try { body, handler, fin, catch_name, .. } => {
                for x in body {
                    snapshot_reads(Node::S(x), caught || handler.is_some(), locals, out);
                }
                if let Some(n) = catch_name {
                    locals.insert(n.clone());
                }
                for x in handler.iter().chain(fin.iter()).flatten() {
                    snapshot_reads(Node::S(x), caught, locals, out);
                }
                return;
            }
            _ => {}
        },
    }
    for c in children(n, false) {
        snapshot_reads(c, caught, locals, out);
    }
}
/// AC-3a: the submit buttons of a form's markup (a `<button>` without `type`, or `type="submit"`), not through components.
/// 07 §4: a spread attribute (`{...e}`) passes every field: "*"
fn field_of(name: &str) -> String {
    if name == "..." { "*".into() } else { name.to_string() }
}

/// an argument as a message shows it: `x={…}`, or `{...…}` for a spread
fn arg_show(field: &str) -> String {
    if field == "*" { "{...…}".into() } else { format!("{field}={{…}}") }
}

fn submit_buttons<'a>(ms: &'a [Markup], out: &mut Vec<&'a [Attr]>) {
    for m in ms {
        match &m.kind {
            MarkupKind::El { tag, attrs, children } => {
                if tag == "button" && !attrs.iter().any(|a| a.name == "type" && !matches!(&a.e.k, ExprKind::Lit(Lit::Str(v)) if v == "submit")) {
                    out.push(attrs);
                }
                submit_buttons(children, out);
            }
            MarkupKind::Mif { t, f, .. } => {
                submit_buttons(t, out);
                submit_buttons(f, out);
            }
            MarkupKind::Mfor { body, .. } | MarkupKind::Mview { body, .. } | MarkupKind::Loading { body, .. } | MarkupKind::Errored { body, .. } | MarkupKind::Portal { body, .. } => submit_buttons(body, out),
            _ => {}
        }
    }
}
/// A node the reference walks generically (`Object.values`): an expression, or a statement inside one.
#[derive(Clone, Copy)]
pub(crate) enum Node<'a> {
    E(&'a Expr),
    S(&'a Stmt),
}
/// The children of a node in the order `Object.values` gives them; `paths`: also a write's target path (an object without
/// `k`, which only a walk over every value reaches).
pub(crate) fn children<'a>(n: Node<'a>, paths: bool) -> Vec<Node<'a>> {
    let mut out = vec![];
    let ss = |out: &mut Vec<Node<'a>>, ss: &'a [Stmt]| out.extend(ss.iter().map(Node::S));
    match n {
        Node::E(e) => match &e.k {
            ExprKind::Lit(_) | ExprKind::Id(_) | ExprKind::Use(_) | ExprKind::StyleMap { .. } => {}
            ExprKind::Bin { l, r, .. } => out.extend([Node::E(l), Node::E(r)]),
            ExprKind::Un { e, .. } | ExprKind::Peek(e) | ExprKind::Latest(e) | ExprKind::Pending(e) | ExprKind::Spread(e) | ExprKind::Omit { e, .. } | ExprKind::Throw(e) => out.push(Node::E(e)),
            ExprKind::Pre { init, .. } => out.extend(init.iter().map(|x| Node::E(x))),
            ExprKind::Await { e, init, .. } => {
                out.push(Node::E(e));
                out.extend(init.iter().map(|x| Node::E(x)));
            }
            ExprKind::If { c, t, f } => out.extend([Node::E(c), Node::E(t), Node::E(f)]),
            ExprKind::Tpl(parts) => out.extend(parts.iter().filter_map(|p| if let TplPart::Expr(e) = p { Some(Node::E(e)) } else { None })),
            ExprKind::Member { o, .. } => out.push(Node::E(o)),
            ExprKind::Index { o, i, .. } => out.extend([Node::E(o), Node::E(i)]),
            ExprKind::Call { f, args, .. } => {
                out.push(Node::E(f));
                out.extend(args.iter().map(Node::E));
            }
            ExprKind::Arr(items) => out.extend(items.iter().map(Node::E)),
            ExprKind::Rec(fields) => out.extend(fields.iter().map(|f| match f {
                Field::Kv { v, .. } => Node::E(v),
                Field::Spread(e) => Node::E(e),
            })),
            ExprKind::Fn { body, stmts, .. } => {
                out.push(Node::E(body));
                if let Some(s) = stmts {
                    ss(&mut out, s);
                }
            }
            ExprKind::Draft { seed, body } => {
                out.push(Node::E(seed));
                ss(&mut out, body);
            }
            ExprKind::Catch { e, alt, .. } => out.extend([Node::E(e), Node::E(alt)]),
            ExprKind::ServerFn { body, .. } => ss(&mut out, body),
        },
        Node::S(s) => match &s.k {
            StmtKind::Write { target, e } | StmtKind::Optimistic { target, e } => {
                if paths {
                    out.extend(target.path.iter().filter_map(|p| if let PathSeg::Expr(x) = p { Some(Node::E(x)) } else { None }));
                }
                out.push(Node::E(e));
            }
            StmtKind::Let { e, .. } | StmtKind::Expr(e) | StmtKind::Throw(e) => out.push(Node::E(e)),
            StmtKind::Refresh(_) | StmtKind::Affects(_) => {}
            StmtKind::Action(body) => ss(&mut out, body),
            StmtKind::Sif { c, t, f } => {
                out.push(Node::E(c));
                ss(&mut out, t);
                ss(&mut out, f);
            }
            StmtKind::For { e, body, .. } => {
                out.push(Node::E(e));
                ss(&mut out, body);
            }
            StmtKind::Return(e) => out.extend(e.iter().map(Node::E)),
            StmtKind::Try { body, handler, fin, .. } => {
                ss(&mut out, body);
                if let Some(h) = handler {
                    ss(&mut out, h);
                }
                if let Some(f) = fin {
                    ss(&mut out, f);
                }
            }
        },
    }
    out
}

// ---------------------------------------------------------------- free names
/// Free identifiers of an expression (`pre:x` for `pre x`), minus names bound inside it.
pub(crate) fn free_names(e: &Expr, bound: &HashSet<String>, out: &mut IndexSet<String>) {
    let go = |x: &Expr, out: &mut IndexSet<String>| free_names(x, bound, out);
    match &e.k {
        ExprKind::Lit(_) | ExprKind::Use(_) => {}
        ExprKind::Id(n) => {
            if !bound.contains(n) {
                out.insert(n.clone());
            }
        }
        ExprKind::Pre { name, .. } => {
            if !bound.contains(name) {
                out.insert(format!("pre:{}", name));
            }
        }
        ExprKind::Peek(x) => go(x, out),
        ExprKind::Await { e, init, .. } => {
            go(e, out);
            if let Some(i) = init {
                go(i, out);
            }
        }
        ExprKind::Latest(x) | ExprKind::Pending(x) | ExprKind::Un { e: x, .. } | ExprKind::Spread(x) | ExprKind::Omit { e: x, .. } => go(x, out),
        ExprKind::Bin { l, r, .. } => {
            go(l, out);
            go(r, out);
        }
        ExprKind::If { c, t, f } => {
            go(c, out);
            go(t, out);
            go(f, out);
        }
        ExprKind::Tpl(parts) => {
            for p in parts {
                if let TplPart::Expr(x) = p {
                    go(x, out);
                }
            }
        }
        ExprKind::Member { o, .. } => go(o, out),
        ExprKind::Index { o, i, .. } => {
            go(o, out);
            go(i, out);
        }
        ExprKind::Call { f, args, .. } => {
            go(f, out);
            for a in args {
                go(a, out);
            }
        }
        ExprKind::Arr(items) => {
            for a in items {
                go(a, out);
            }
        }
        ExprKind::Rec(fields) => {
            for f in fields {
                match f {
                    Field::Kv { v, .. } => go(v, out),
                    Field::Spread(x) => go(x, out),
                }
            }
        }
        ExprKind::Fn { params, body, stmts, .. } => {
            let mut b = bound.clone();
            b.extend(params.iter().cloned());
            free_names(body, &b, out);
            if let Some(ss) = stmts {
                free_names_stmts(ss, &b, out);
            }
        }
        ExprKind::Draft { seed, body } => {
            go(seed, out);
            let mut b = bound.clone();
            b.insert("d".into());
            free_names_stmts(body, &b, out);
        }
        ExprKind::Throw(x) => go(x, out),
        ExprKind::Catch { e, name, alt, .. } => {
            go(e, out);
            match name {
                Some(n) => {
                    let mut b = bound.clone();
                    b.insert(n.clone());
                    free_names(alt, &b, out);
                }
                None => free_names(alt, bound, out),
            }
        }
        ExprKind::StyleMap { .. } | ExprKind::ServerFn { .. } => {}
    }
}
/// C-3a: what a value written by an apply block is computed from — the names its expression reads, and the names it
/// calls. Not what is under `peek(…)` (a reading said to be taken once), nor what a statement-bodied closure reads (it
/// runs later, as an event of its own).
fn write_reads(e: &Expr, bound: &HashSet<String>, names: &mut IndexSet<String>, callees: &mut IndexSet<String>) {
    match &e.k {
        ExprKind::Lit(_) | ExprKind::Use(_) | ExprKind::Pre { .. } | ExprKind::Peek(_) | ExprKind::Draft { .. } | ExprKind::StyleMap { .. } | ExprKind::ServerFn { .. } => {}
        ExprKind::Id(n) => {
            if !bound.contains(n) {
                names.insert(n.clone());
            }
        }
        ExprKind::Await { e, init, .. } => {
            write_reads(e, bound, names, callees);
            if let Some(i) = init {
                write_reads(i, bound, names, callees);
            }
        }
        ExprKind::Latest(x) | ExprKind::Pending(x) | ExprKind::Un { e: x, .. } | ExprKind::Spread(x) | ExprKind::Omit { e: x, .. } | ExprKind::Throw(x) => write_reads(x, bound, names, callees),
        ExprKind::Bin { l, r, .. } => {
            write_reads(l, bound, names, callees);
            write_reads(r, bound, names, callees);
        }
        ExprKind::If { c, t, f } => {
            write_reads(c, bound, names, callees);
            write_reads(t, bound, names, callees);
            write_reads(f, bound, names, callees);
        }
        ExprKind::Tpl(parts) => {
            for p in parts {
                if let TplPart::Expr(x) = p {
                    write_reads(x, bound, names, callees);
                }
            }
        }
        ExprKind::Member { o, .. } => write_reads(o, bound, names, callees),
        ExprKind::Index { o, i, .. } => {
            write_reads(o, bound, names, callees);
            write_reads(i, bound, names, callees);
        }
        ExprKind::Call { f, args, .. } => {
            match &f.k {
                ExprKind::Id(n) if !bound.contains(n) => {
                    callees.insert(n.clone());
                }
                _ => write_reads(f, bound, names, callees),
            }
            for a in args {
                write_reads(a, bound, names, callees);
            }
        }
        ExprKind::Arr(items) => {
            for a in items {
                write_reads(a, bound, names, callees);
            }
        }
        ExprKind::Rec(fields) => {
            for f in fields {
                match f {
                    Field::Kv { v, .. } => write_reads(v, bound, names, callees),
                    Field::Spread(x) => write_reads(x, bound, names, callees),
                }
            }
        }
        ExprKind::Fn { params, body, stmts, .. } => {
            if stmts.is_none() {
                let mut b = bound.clone();
                b.extend(params.iter().cloned());
                write_reads(body, &b, names, callees);
            }
        }
        ExprKind::Catch { e, name, alt, .. } => {
            write_reads(e, bound, names, callees);
            match name {
                Some(n) => {
                    let mut b = bound.clone();
                    b.insert(n.clone());
                    write_reads(alt, &b, names, callees);
                }
                None => write_reads(alt, bound, names, callees),
            }
        }
    }
}
/// `$0`, `$1`, …: an apply block's name for the value of its effect's n-th input (07 §5).
fn is_effect_param(n: &str) -> bool {
    n.len() > 1 && n.starts_with('$') && n[1..].bytes().all(|b| b.is_ascii_digit())
}
fn free_names_stmts(ss: &[Stmt], bound0: &HashSet<String>, out: &mut IndexSet<String>) {
    let mut bound = bound0.clone();
    for s in ss {
        match &s.k {
            StmtKind::Let { name, e, .. } => {
                free_names(e, &bound, out);
                bound.insert(name.clone());
            }
            StmtKind::Write { target, e } | StmtKind::Optimistic { target, e } => {
                if !target.is_ctx() && !bound.contains(&target.name) {
                    out.insert(target.name.clone());
                }
                for p in &target.path {
                    if let PathSeg::Expr(x) = p {
                        free_names(x, &bound, out);
                    }
                }
                free_names(e, &bound, out);
            }
            StmtKind::Expr(e) | StmtKind::Throw(e) => free_names(e, &bound, out),
            StmtKind::Return(e) => {
                if let Some(e) = e {
                    free_names(e, &bound, out);
                }
            }
            StmtKind::Refresh(n) | StmtKind::Affects(n) => {
                if !bound.contains(n) {
                    out.insert(n.clone());
                }
            }
            StmtKind::Action(body) => free_names_stmts(body, &bound, out),
            StmtKind::Sif { c, t, f } => {
                free_names(c, &bound, out);
                free_names_stmts(t, &bound, out);
                free_names_stmts(f, &bound, out);
            }
            StmtKind::For { name, e, body } => {
                free_names(e, &bound, out);
                let mut b = bound.clone();
                b.insert(name.clone());
                free_names_stmts(body, &b, out);
            }
            StmtKind::Try { body, catch_name, handler, fin, .. } => {
                free_names_stmts(body, &bound, out);
                if let Some(h) = handler {
                    let mut b = bound.clone();
                    if let Some(n) = catch_name {
                        b.insert(n.clone());
                    }
                    free_names_stmts(h, &b, out);
                }
                if let Some(f) = fin {
                    free_names_stmts(f, &bound, out);
                }
            }
        }
    }
}
/// A closure whose body makes another closure (O-3: what calling it returns may hold one).
fn contains_fn(f: &Expr) -> bool {
    fn any(n: Node) -> bool {
        children(n, true).into_iter().any(|c| matches!(c, Node::E(Expr { k: ExprKind::Fn { .. }, .. })) || any(c))
    }
    any(Node::E(f))
}
/// E-10, E-5a (2026-11-22, a closure given to a closure): how a closure's body uses one of its parameters, as far as
/// what it may call goes. `callees`: the paths of the parameter it calls (`g()`, `o.total()`, `o.fmt[0]()`; a step is a
/// field or a literal index); `passed`: what those calls are given; `any`: the parameter is used some other way that
/// may come to a call — handed to a call, kept in a local, a record or an array, written, looped over, called
/// through a computed slot. A read that makes a primitive (an operand, a template's part, a test), a value that is
/// dropped, and the value the closure answers (whoever calls that is read where it is called) are none of these.
#[derive(Default)]
struct ParamUses<'e> {
    any: bool,
    callees: Vec<Vec<String>>,
    passed: Vec<&'e Expr>,
}
/// The path an expression reads of `p`: `p` itself, `p.a`, `p["a"]`, `p[0]`; a computed step is `None`.
fn param_chain(e: &Expr, p: &str) -> Option<Vec<Option<String>>> {
    match &e.k {
        ExprKind::Id(n) if n == p => Some(vec![]),
        ExprKind::Member { o, p: k, .. } => {
            let mut c = param_chain(o, p)?;
            c.push(Some(k.clone()));
            Some(c)
        }
        ExprKind::Index { o, i, .. } => {
            let mut c = param_chain(o, p)?;
            c.push(lit_key(i));
            Some(c)
        }
        _ => None,
    }
}
fn param_uses<'e>(n: Node<'e>, p: &str, tail: bool, prim: bool, u: &mut ParamUses<'e>) {
    const PRIM_OPS: [&str; 19] = ["+", "-", "*", "/", "%", "**", "==", "!=", "===", "!==", "<", ">", "<=", ">=", "in", "instanceof", "&", "|", "^"];
    match n {
        Node::E(e) => {
            if param_chain(e, p).is_some() {
                if !(tail || prim) {
                    u.any = true;
                }
                return;
            }
            match &e.k {
                ExprKind::Call { f, args, .. } => {
                    match param_chain(f, p) {
                        Some(path) => match path.into_iter().collect::<Option<Vec<String>>>() {
                            Some(path) => {
                                u.callees.push(path);
                                u.passed.extend(args.iter());
                            }
                            None => u.any = true,
                        },
                        None => param_uses(Node::E(f), p, false, false, u),
                    }
                    for a in args {
                        param_uses(Node::E(a), p, false, false, u);
                    }
                }
                ExprKind::Fn { params, body, stmts, .. } => {
                    if params.iter().any(|q| q == p) {
                        return; // another value under the name
                    }
                    match stmts {
                        Some(ss) => ss.iter().for_each(|s| param_uses(Node::S(s), p, false, false, u)),
                        None => param_uses(Node::E(body), p, true, false, u),
                    }
                }
                ExprKind::Bin { op, l, r } => {
                    let prim = prim || PRIM_OPS.contains(&op.as_str());
                    param_uses(Node::E(l), p, tail && !prim, prim, u);
                    param_uses(Node::E(r), p, tail && !prim, prim, u);
                }
                ExprKind::Un { e, .. } => param_uses(Node::E(e), p, false, true, u),
                ExprKind::Tpl(_) => children(n, false).into_iter().for_each(|k| param_uses(k, p, false, true, u)),
                ExprKind::If { c, t, f } => {
                    param_uses(Node::E(c), p, false, true, u);
                    param_uses(Node::E(t), p, tail, prim, u);
                    param_uses(Node::E(f), p, tail, prim, u);
                }
                ExprKind::Index { o, i, .. } => {
                    param_uses(Node::E(o), p, false, false, u);
                    param_uses(Node::E(i), p, false, true, u);
                }
                _ => children(n, false).into_iter().for_each(|k| param_uses(k, p, false, false, u)),
            }
        }
        Node::S(s) => match &s.k {
            StmtKind::Expr(e) => param_uses(Node::E(e), p, false, true, u), // its value is dropped
            StmtKind::Return(Some(e)) => param_uses(Node::E(e), p, true, false, u),
            StmtKind::Sif { c, t, f } => {
                param_uses(Node::E(c), p, false, true, u);
                t.iter().chain(f.iter()).for_each(|s| param_uses(Node::S(s), p, false, false, u));
            }
            _ => children(n, true).into_iter().for_each(|k| param_uses(k, p, false, false, u)),
        },
    }
}
/// Every provision a program writes, by its context's name, and every name it declares by `action`: read from the text.
fn provides_in<'a>(decls: &'a [Decl], view: &'a [Markup], provided: &mut HashMap<String, Vec<&'a Expr>>, actions: &mut HashSet<String>) {
    for d in decls {
        match d {
            Decl::Provide { name, e, .. } => provided.entry(name.clone()).or_default().push(e),
            Decl::Action { name, .. } => {
                actions.insert(name.clone());
            }
            Decl::Component { decls, view, .. } => provides_in(decls, view, provided, actions),
            Decl::Fn { decls, .. } => provides_in(decls, &[], provided, actions),
            _ => {}
        }
    }
    for m in view {
        match &m.kind {
            MarkupKind::El { children, .. } => provides_in(&[], children, provided, actions),
            MarkupKind::Mif { t, t_decls, f, f_decls, .. } => {
                provides_in(t_decls, t, provided, actions);
                provides_in(f_decls, f, provided, actions);
            }
            MarkupKind::Mfor { decls, body, .. } | MarkupKind::Mview { decls, body, .. } | MarkupKind::Portal { decls, body, .. } => provides_in(decls, body, provided, actions),
            MarkupKind::Loading { fallback, decls, body, .. } | MarkupKind::Errored { fallback, decls, body, .. } => {
                provides_in(&[], fallback, provided, actions);
                provides_in(decls, body, provided, actions);
            }
            _ => {}
        }
    }
}
fn names_of(e: &Expr) -> IndexSet<String> {
    let mut out = IndexSet::new();
    free_names(e, &HashSet::new(), &mut out);
    out
}
fn strip_pre(n: &str) -> &str {
    n.strip_prefix("pre:").unwrap_or(n)
}
/// MO-10k (ruled 2026-11-22): the names an expression's value may come from, **by mention**. One syntactic rule, no
/// values followed: a value comes from the names written in the expression, except where what is written there cannot
/// be handed on — an operand of an operator that makes a primitive (arithmetic, a comparison, `!`, `typeof`, a template),
/// a condition, a key, the argument of a builtin that answers a primitive (`len`, `str`, `sum`, `every`, `indexOf`). A
/// call is opaque: what it gives may be anything it was given (its callee, its arguments); a closure gives what it
/// returns (its parameters give nothing by themselves: the call that hands them a value is where they are named). Names
/// bound inside (`bound`) give nothing; a closure's own locals (`locals`) give what their values do. `use c` is written
/// `use:c`, for the checks that must know a value came from where they cannot look.
/// Where a name is written as a call's whole argument: `f(x)` gives `x → (f, 0)`. Read off the module's tree as data, so
/// it sees every call, in every view, handler and statement.
pub(crate) fn arg_calls(v: &serde_json::Value, out: &mut HashMap<String, Vec<(String, usize)>>) {
    match v {
        serde_json::Value::Array(xs) => xs.iter().for_each(|x| arg_calls(x, out)),
        serde_json::Value::Object(o) => {
            if o.get("k").and_then(|k| k.as_str()) == Some("call") {
                if let (Some(f), Some(args)) = (o.get("f").filter(|f| f.get("k").and_then(|k| k.as_str()) == Some("id")).and_then(|f| f.get("name")).and_then(|n| n.as_str()), o.get("args").and_then(|a| a.as_array())) {
                    for (i, a) in args.iter().enumerate() {
                        if a.get("k").and_then(|k| k.as_str()) == Some("id") {
                            if let Some(n) = a.get("name").and_then(|n| n.as_str()) {
                                out.entry(n.to_string()).or_default().push((f.to_string(), i));
                            }
                        }
                    }
                }
            }
            o.values().for_each(|x| arg_calls(x, out));
        }
        _ => {}
    }
}
/// ST-4d: a key two rows of a list literal share — `[{ id: 1, … }, { id: 1, … }]` keyed by `id` — as written.
fn duplicate_key(e: &Expr, key: &str) -> Option<String> {
    let ExprKind::Arr(items) = &e.k else { return None };
    let mut seen: Vec<String> = vec![];
    for it in items {
        let ExprKind::Rec(fields) = &it.k else { continue };
        let Some(v) = rec_field(fields, key) else { continue };
        let ExprKind::Lit(l) = &v.k else { continue };
        let shown = show(v);
        if matches!(l, Lit::Undefined | Lit::Null) {
            continue;
        }
        if seen.contains(&shown) {
            return Some(shown);
        }
        seen.push(shown);
    }
    None
}
/// What `flows` asks of where it is read: whether a name is a builtin there (not bound), and whether an expression is a
/// primitive by its declaration (`Checker::decl_prim`).
struct Look<'x> {
    builtin: &'x dyn Fn(&str) -> bool,
    prim: &'x dyn Fn(&Expr) -> bool,
    /// MO-11l: a read of one field of a component's props (`props.table`) names that field, not the props: the name
    /// `prop_name` gives it (`Checker::prop_field`)
    field: &'x dyn Fn(&Expr) -> Option<String>,
}
/// The name `flows` gives a read of one prop of a component: no name a program can write.
fn prop_name(comp: RId, field: &str) -> String {
    format!("\u{1}{comp}\u{1}{field}")
}
/// The name a path is read from: `table` of `table.getState().page`.
fn path_root(e: &Expr) -> Option<&str> {
    match &e.k {
        ExprKind::Id(n) => Some(n.as_str()),
        ExprKind::Member { o, .. } | ExprKind::Index { o, .. } => path_root(o),
        ExprKind::Call { f, .. } => path_root(f),
        _ => None,
    }
}
/// A slot of a literal written where it is read: `[clock, 5][1]` is `5`, `{ a: x, b: y }.b` is `y`. Only what the
/// expression itself says: no spread before the slot, one field of that name.
fn literal_part(e: &Expr) -> Option<&Expr> {
    match &e.k {
        ExprKind::Index { o, i, .. } => match (&o.k, &i.k) {
            (ExprKind::Arr(items), ExprKind::Lit(Lit::Num(_))) => {
                let n = lit_key(i)?.parse::<usize>().ok()?;
                if items.iter().take(n + 1).any(|x| matches!(x.k, ExprKind::Spread(_))) {
                    return None;
                }
                items.get(n)
            }
            (ExprKind::Rec(fields), _) => rec_field(fields, &lit_key(i)?),
            _ => None,
        },
        ExprKind::Member { o, p, .. } => match &o.k {
            ExprKind::Rec(fields) => rec_field(fields, p),
            _ => None,
        },
        _ => None,
    }
}
fn rec_field<'e>(fields: &'e [Field], key: &str) -> Option<&'e Expr> {
    if fields.iter().any(|f| matches!(f, Field::Spread(_))) {
        return None;
    }
    let mut hit = fields.iter().filter_map(|f| match f {
        Field::Kv { key: k, v } if k == key => Some(v),
        _ => None,
    });
    let v = hit.next()?;
    hit.next().is_none().then_some(v)
}
fn flows(e: &Expr, bound: &HashSet<String>, locals: &HashMap<String, IndexSet<String>>, builtin: &Look, out: &mut IndexSet<String>) {
    let go = |x: &Expr, out: &mut IndexSet<String>| flows(x, bound, locals, builtin, out);
    // what its declaration says is a primitive holds nothing (a declared scalar field, what a declared method answers)
    if matches!(e.k, ExprKind::Member { .. } | ExprKind::Index { .. } | ExprKind::Call { .. }) && path_root(e).is_some_and(|n| !bound.contains(n) && !locals.contains_key(n)) && (builtin.prim)(e) {
        return;
    }
    match &e.k {
        ExprKind::Lit(_) | ExprKind::Tpl(_) | ExprKind::Un { .. } | ExprKind::Pending(_) | ExprKind::StyleMap { .. } | ExprKind::ServerFn { .. } => {}
        ExprKind::Id(n) => match locals.get(n) {
            Some(names) => out.extend(names.iter().cloned()),
            None if bound.contains(n) => {}
            None => {
                out.insert(n.clone());
            }
        },
        ExprKind::Pre { name, init } => {
            if !bound.contains(name) {
                out.insert(name.clone());
            }
            if let Some(i) = init {
                go(i, out);
            }
        }
        ExprKind::Use(name) => {
            out.insert(format!("use:{name}"));
        }
        ExprKind::Peek(x) | ExprKind::Latest(x) | ExprKind::Spread(x) | ExprKind::Omit { e: x, .. } | ExprKind::Throw(x) => go(x, out),
        ExprKind::Await { e: x, init, .. } => {
            go(x, out);
            if let Some(i) = init {
                go(i, out);
            }
        }
        ExprKind::Bin { op, l, r } => {
            if matches!(op.as_str(), "??" | "||" | "&&") {
                go(l, out);
                go(r, out);
            }
        }
        ExprKind::If { t, f, .. } => {
            go(t, out);
            go(f, out);
        }
        // a slot of a literal written here is that slot: `[clock, 5][1]` is `5`; a field of a component's props is
        // that prop
        ExprKind::Member { o, .. } | ExprKind::Index { o, .. } => match literal_part(e) {
            Some(x) => go(x, out),
            None => match (&o.k, (builtin.field)(e)) {
                (ExprKind::Id(n), Some(prop)) if !bound.contains(n) && !locals.contains_key(n) => {
                    out.insert(prop);
                }
                _ => go(o, out),
            },
        },
        ExprKind::Call { f, args, .. } => {
            if let ExprKind::Id(n) = &f.k {
                if SCALAR_BUILTINS.contains(&n.as_str()) && !bound.contains(n) && !locals.contains_key(n) && (builtin.builtin)(n) {
                    return;
                }
            }
            go(f, out);
            for a in args {
                go(a, out);
            }
        }
        ExprKind::Arr(items) => {
            for x in items {
                go(x, out);
            }
        }
        ExprKind::Rec(fields) => {
            for f in fields {
                match f {
                    Field::Kv { v, .. } => go(v, out),
                    Field::Spread(x) => go(x, out),
                }
            }
        }
        ExprKind::Fn { params, body, stmts, .. } => {
            let mut b = bound.clone();
            b.extend(params.iter().map(|p| p.trim_start_matches("...").to_string()));
            let mut ls = locals.clone();
            for p in params {
                ls.remove(p.trim_start_matches("..."));
            }
            match stmts {
                Some(ss) => flows_returns(ss, &mut b, &mut ls, builtin, out),
                None => flows(body, &b, &ls, builtin, out),
            }
        }
        ExprKind::Catch { e: x, name, alt, .. } => {
            go(x, out);
            match name {
                Some(n) => {
                    let mut b = bound.clone();
                    b.insert(n.clone());
                    let mut ls = locals.clone();
                    ls.remove(n);
                    flows(alt, &b, &ls, builtin, out);
                }
                None => go(alt, out),
            }
        }
        ExprKind::Draft { seed, body } => {
            go(seed, out);
            let mut b = bound.clone();
            b.insert("d".into());
            let mut ls = locals.clone();
            ls.remove("d");
            for s in body {
                match &s.k {
                    StmtKind::Let { name, e, .. } => {
                        let mut v = IndexSet::new();
                        flows(e, &b, &ls, builtin, &mut v);
                        b.remove(name);
                        ls.insert(name.clone(), v);
                    }
                    StmtKind::Write { e, .. } => flows(e, &b, &ls, builtin, out),
                    _ => {}
                }
            }
        }
    }
}
/// What a statement body returns (`flows`): each `return`'s value, its `let`s standing for their values.
fn flows_returns(ss: &[Stmt], bound: &mut HashSet<String>, locals: &mut HashMap<String, IndexSet<String>>, builtin: &Look, out: &mut IndexSet<String>) {
    for s in ss {
        match &s.k {
            StmtKind::Let { name, e, .. } => {
                let mut v = IndexSet::new();
                flows(e, bound, locals, builtin, &mut v);
                bound.remove(name);
                locals.insert(name.clone(), v);
            }
            StmtKind::Return(Some(e)) => flows(e, bound, locals, builtin, out),
            StmtKind::Sif { t, f, .. } => {
                flows_returns(t, &mut bound.clone(), &mut locals.clone(), builtin, out);
                flows_returns(f, &mut bound.clone(), &mut locals.clone(), builtin, out);
            }
            StmtKind::For { name, e, body } => {
                let mut v = IndexSet::new();
                flows(e, bound, locals, builtin, &mut v);
                let (mut b, mut ls) = (bound.clone(), locals.clone());
                b.remove(name);
                ls.insert(name.clone(), v);
                flows_returns(body, &mut b, &mut ls, builtin, out);
            }
            StmtKind::Action(b) => flows_returns(b, &mut bound.clone(), &mut locals.clone(), builtin, out),
            StmtKind::Try { body, catch_name, handler, fin, .. } => {
                flows_returns(body, &mut bound.clone(), &mut locals.clone(), builtin, out);
                if let Some(h) = handler {
                    let (mut b, mut ls) = (bound.clone(), locals.clone());
                    if let Some(n) = catch_name {
                        b.insert(n.clone());
                        ls.remove(n);
                    }
                    flows_returns(h, &mut b, &mut ls, builtin, out);
                }
                if let Some(f) = fin {
                    flows_returns(f, &mut bound.clone(), &mut locals.clone(), builtin, out);
                }
            }
            _ => {}
        }
    }
}
/// What an `.rx` fn gives (`flows`): its tail, its own equations and sources standing for their values, its parameters
/// for nothing.
fn flows_fn(params: &[crate::ast::Param], decls: &[Decl], tail: &Expr, builtin: &Look, out: &mut IndexSet<String>) {
    let mut bound: HashSet<String> = params.iter().map(|p| p.name.clone()).collect();
    let mut locals: HashMap<String, IndexSet<String>> = HashMap::new();
    // equations may be read before they are written: to a fixpoint (a name gives what any name it reads gives)
    for d in decls {
        if let Some(n) = d.name() {
            bound.insert(n.to_string());
        }
    }
    loop {
        let mut grew = false;
        for d in decls {
            let (name, e) = match d {
                Decl::Eq { name, e, .. } => (name, e),
                Decl::Source { name, init, .. } => (name, init),
                _ => continue,
            };
            let mut v = IndexSet::new();
            let mut b = bound.clone();
            for k in locals.keys() {
                b.remove(k);
            }
            flows(e, &b, &locals, builtin, &mut v);
            let old = locals.entry(name.clone()).or_default();
            let n0 = old.len();
            old.extend(v);
            grew |= old.len() != n0;
        }
        if !grew {
            break;
        }
    }
    for k in locals.keys() {
        bound.remove(k);
    }
    flows(tail, &bound, &locals, builtin, out);
}
/// Free names outside `peek` — the reads that make an initializer a snapshot (E-4).
fn reads_outside_peek(n: Node, out: &mut IndexSet<String>) {
    match n {
        Node::E(Expr { k: ExprKind::Peek(_), .. }) | Node::E(Expr { k: ExprKind::Fn { .. }, .. }) => {}
        Node::E(Expr { k: ExprKind::Id(name), .. }) => {
            out.insert(name.clone());
        }
        Node::E(Expr { k: ExprKind::Pre { name, .. }, .. }) => {
            out.insert(name.clone());
        }
        _ => {
            for c in children(n, false) {
                reads_outside_peek(c, out);
            }
        }
    }
}
/// RFC 14: the names read outside `peek` at the root of a field or index read (`size.width`, `todos.items[0]`): a
/// primitive's instance never changes, but what is read through it tracks (MO-10b); a method called on it is not a read
/// of a field.
/// RFC 14 (bounded, 2026-11-21): the methods called on a name outside `peek` and closures, `route.addChildren(…)` as
/// `(route, addChildren)`: what a stable instance keeps stable only when its declaration names the method.
/// A method callee: `o.p`, or `o["p"]` — a literal key names the method as a dot does (RFC 14, 34).
fn method_callee(f: &Expr) -> Option<(&Expr, String)> {
    match &f.k {
        ExprKind::Member { o, p, .. } => Some((o, p.clone())),
        ExprKind::Index { o, i, .. } if !matches!(i.k, ExprKind::Lit(Lit::Num(_))) => lit_key(i).map(|p| (&**o, p)),
        _ => None,
    }
}
fn method_calls(e: &Expr, out: &mut Vec<(String, String)>) {
    match &e.k {
        ExprKind::Peek(_) | ExprKind::Fn { .. } => {}
        _ => {
            if let ExprKind::Call { f, .. } = &e.k {
                if let Some((o, p)) = method_callee(f) {
                    if let ExprKind::Id(n) = &o.k {
                        out.push((n.clone(), p));
                    }
                }
            }
            for c in children(Node::E(e), false) {
                if let Node::E(x) = c {
                    method_calls(x, out);
                }
            }
        }
    }
}
fn rooted_reads(e: &Expr, out: &mut IndexSet<String>) {
    match &e.k {
        ExprKind::Peek(_) | ExprKind::Fn { .. } => {}
        ExprKind::Call { f, args, .. } if method_callee(f).is_some() => {
            // a method called on the instance (`route.addChildren(…)`) reads no field of it; a field on the way does
            if let Some((o, _)) = method_callee(f) {
                if !matches!(o.k, ExprKind::Id(_)) {
                    rooted_reads(o, out);
                }
            }
            for a in args {
                rooted_reads(a, out);
            }
        }
        ExprKind::Member { .. } | ExprKind::Index { .. } => {
            let mut x = e;
            loop {
                match &x.k {
                    ExprKind::Member { o, .. } => x = o,
                    ExprKind::Index { o, i, .. } => {
                        rooted_reads(i, out);
                        x = o;
                    }
                    _ => break,
                }
            }
            match &x.k {
                ExprKind::Id(n) => {
                    out.insert(n.clone());
                }
                _ => rooted_reads(x, out),
            }
        }
        _ => {
            for c in children(Node::E(e), false) {
                if let Node::E(c) = c {
                    rooted_reads(c, out);
                }
            }
        }
    }
}
/// `map(xs, x => ({…}))` / `xs.map(x => ({…}))`
fn maps_into_records(e: &Expr) -> bool {
    let ExprKind::Call { f, args, .. } = &e.k else { return false };
    let fn_arg = match &f.k {
        ExprKind::Id(n) if n == "map" => args.get(1),
        ExprKind::Member { p, .. } if p == "map" => args.first(),
        _ => None,
    };
    matches!(fn_arg, Some(Expr { k: ExprKind::Fn { stmts: None, body, .. }, .. }) if matches!(&body.k, ExprKind::Rec(_)))
}
/// 12 SF-1d: the server fn a declaration's value is — itself, or wrapped by calls.
pub fn unwrap_server(e: &Expr) -> Option<&Expr> {
    match &e.k {
        ExprKind::ServerFn { .. } => Some(e),
        ExprKind::Call { args, .. } => {
            let inner: Vec<&Expr> = args.iter().filter_map(unwrap_server).collect();
            if inner.len() == 1 { Some(inner[0]) } else { None }
        }
        _ => None,
    }
}
fn js_string(s: &str) -> String {
    serde_json::Value::String(s.to_string()).to_string()
}
/// A short rendering of an expression, for messages.
pub fn show(e: &Expr) -> String {
    match &e.k {
        ExprKind::Lit(l) => match l {
            Lit::Undefined => "undefined".into(),
            Lit::Null => "null".into(),
            Lit::Bool(b) => b.to_string(),
            Lit::Num(n) => js_number(*n),
            Lit::Str(s) => js_string(s),
        },
        ExprKind::Id(n) => n.clone(),
        ExprKind::Member { o, p, .. } => format!("{}.{}", show(o), p),
        ExprKind::Call { f, .. } => format!("{}(…)", show(f)),
        ExprKind::Await { e, .. } => format!("await {}", show(e)),
        ExprKind::Latest(e) => format!("latest {}", show(e)),
        ExprKind::Peek(e) => format!("peek {}", show(e)),
        ExprKind::Throw(e) => format!("throw {}", show(e)),
        ExprKind::Index { o, .. } => format!("{}[…]", show(o)),
        ExprKind::Use(n) => format!("use {}", n),
        ExprKind::Catch { e, .. } => format!("{} catch …", show(e)),
        ExprKind::Tpl(_) => "`…`".into(),
        ExprKind::Bin { op, l, r } => format!("{} {} {}", show(l), op, show(r)),
        ExprKind::If { c, .. } => format!("{} ? … : …", show(c)),
        _ => "…".into(),
    }
}
pub fn js_number(n: f64) -> String {
    if n.is_nan() {
        "null".into()
    } else if n.fract() == 0.0 && n.abs() < 1e21 {
        format!("{}", n as i128)
    } else {
        format!("{}", n)
    }
}

// ---------------------------------------------------------------- the checker

#[derive(Clone)]
struct Step {
    f: Option<Catch>,
    p: Option<Catch>,
}
#[derive(Clone)]
struct PFEntry {
    chain: Vec<Step>,
    term: Option<(i64, String)>,
}
#[derive(Clone)]
struct Item {
    cls: String,
    line: i64,
    what: String,
}
#[derive(Clone)]
struct Req {
    name: String,
    line: i64,
    what: String,
}
#[derive(Clone, Default)]
struct Esc {
    fails: Vec<Item>,
    reqs: Vec<Req>,
}
fn ck(c: &Option<Catch>) -> String {
    match c {
        None => "-".into(),
        Some(Catch::All) => "*".into(),
        Some(Catch::Set(s)) => {
            let mut v: Vec<&String> = s.iter().collect();
            v.sort();
            v.into_iter().cloned().collect::<Vec<_>>().join("|")
        }
    }
}
fn chain_key(c: &[Step]) -> String {
    c.iter().map(|x| format!("{}~{}", ck(&x.f), ck(&x.p))).collect::<Vec<_>>().join("/")
}
fn dedupe_chains(xs: Vec<Vec<Step>>) -> Vec<Vec<Step>> {
    let mut seen = HashSet::new();
    xs.into_iter().filter(|x| seen.insert(chain_key(x))).collect()
}
fn dedupe_entries(xs: Vec<PFEntry>) -> Vec<PFEntry> {
    let mut seen = HashSet::new();
    xs.into_iter()
        .filter(|x| {
            let term = match &x.term {
                None => "null".to_string(),
                Some((l, n)) => format!("{{\"line\":{},\"name\":{}}}", l, js_string(n)),
            };
            seen.insert(chain_key(&x.chain) + &term)
        })
        .collect()
}
fn esc_f(chain: &[Step], cls: &str) -> bool {
    !chain.iter().any(|s| s.f.as_ref().is_some_and(|f| f.caught(cls)))
}
fn esc_p(chain: &[Step], name: &str) -> bool {
    !chain.iter().any(|s| match &s.p {
        Some(Catch::All) => true,
        Some(Catch::Set(p)) => p.contains(name),
        None => false,
    })
}
fn meet(a: Catch, b: &Catch) -> Catch {
    match (a, b) {
        (Catch::All, b) => b.clone(),
        (a, Catch::All) => a,
        (Catch::Set(a), Catch::Set(b)) => Catch::Set(a.into_iter().filter(|x| b.contains(x)).collect()),
    }
}
fn along(chain: &[Step], f: bool) -> Catch {
    let mut out = IndexSet::new();
    for st in chain {
        let c = if f { &st.f } else { &st.p };
        match c {
            Some(Catch::All) => return Catch::All,
            Some(Catch::Set(s)) => out.extend(s.iter().cloned()),
            None => {}
        }
    }
    Catch::Set(out)
}

#[derive(Clone)]
enum Via {
    Reader(RId),
    Arg { comp: RId, field: String, site: RId },
    Action { line: i64, name: String },
}
#[derive(Clone)]
struct Occ {
    comp: RId,
    field: String,
    pre: Vec<Step>,
    via: Via,
}

/// MO-11i: a component value and the values nested in it (applied among its children).
struct VTree {
    tag: String,
    kids: Vec<VTree>,
}
struct UseRec {
    region: RId,
    name: String,
    line: i64,
    display: String,
}
struct ReaderRec<'a> {
    region: RId,
    e: &'a Expr,
    env: EId,
    line: i64,
}
/// R-8: an event handler on an element, with the element's attributes (its `disabled` covers the handler).
struct HandlerRec<'a> {
    attrs: &'a [Attr],
    /// the element's children: a `<form>`'s submit buttons cover its `onSubmit` (AC-3a)
    kids: &'a [Markup],
    h: &'a Expr,
    env: EId,
    region: RId,
    line: i64,
    what: String,
}
struct AppRec<'a> {
    comp: RId,
    site: RId,
    line: i64,
    tag: String,
    args: Vec<(String, &'a Expr, EId)>,
    /// every attribute, handlers too (O-3)
    passed: Vec<(String, &'a Expr, EId)>,
}
struct ActionRec<'a> {
    name: String,
    body: &'a [Stmt],
    env: EId,
    line: i64,
}
struct Provision<'a> {
    key: String,
    e: &'a Expr,
    env: EId,
}
enum Later<'a> {
    Content { ms: &'a [Markup], env: EId, anc: Vec<String> },
    Provide { name: String, e: &'a Expr, env: EId, line: i64, contract: (IndexSet<String>, IndexSet<String>) },
    RowFails { name: String, env: EId, fw: Option<String>, written: String, line: i64 },
    Escape { target: &'a Target, e: &'a Expr, tsym: Option<SId>, env: EId, line: i64 },
}

/// E-5a: whether a value can change: by what this module sees (`yes`), or only if one of `deps` does — a prop of a component
/// (`prop|file#Comp|field`, `*` for all of them), a context's provisions (`ctx|key`), an .rx module's export (`exp|file#name`).
#[derive(Clone, Default)]
pub struct Ch {
    pub yes: bool,
    pub deps: IndexSet<String>,
}
fn add_ch(acc: &mut Ch, c: &Ch) {
    if c.yes {
        acc.yes = true;
    }
    acc.deps.extend(c.deps.iter().cloned());
}
#[derive(Clone, Copy, PartialEq)]
enum ChMode {
    All,
    Out,
    In,
}
/// E-5a: a kept peek the whole-program pass decides (the peek and what it reads, as messages show them).
pub struct Deferred {
    pub line: i64,
    pub peek: String,
    pub what: String,
    pub p: Ch,
    pub o: Ch,
}
/// E-5a: what a module tells the whole-program pass — the arguments its applications give each prop (component, field),
/// its provisions, its exports, the components it passes as values (their props come from JS), and the kept peeks that wait.
#[derive(Default)]
pub struct PeekFacts {
    pub apps: Vec<(String, String, Ch)>,
    pub provs: Vec<(String, Ch)>,
    pub exports: Vec<(String, Ch)>,
    pub escapes: Vec<String>,
    pub exported: Vec<String>,
    pub aliases: Vec<(String, String)>,
    pub deferred: Vec<Deferred>,
}
/// E-5a: the outermost `peek`s of an expression, outside closures (a closure's body is read when it is called).
fn peeks_in<'a>(n: Node<'a>, out: &mut Vec<&'a Expr>) {
    match n {
        Node::E(e @ Expr { k: ExprKind::Peek(_), .. }) => out.push(e),
        Node::E(Expr { k: ExprKind::Fn { .. } | ExprKind::ServerFn { .. }, .. }) => {}
        _ => {
            for c in children(n, false) {
                peeks_in(c, out);
            }
        }
    }
}
/// MO-11q, 07 §4: `<wardic.div>` — a tag that begins with a small letter is an element's, and no element's name has a `.`
/// (a custom element's has a `-`). A member component is applied through a name with a capital. `bound`: the head is a
/// name of this module.
fn member_tag_lowercase(tag: &str, bound: bool) -> String {
    let dot = tag.find('.').unwrap_or(tag.len());
    let (head, rest) = tag.split_at(dot);
    let mut cs = head.chars();
    let cap: String = cs.next().map(|c| c.to_uppercase().collect::<String>() + cs.as_str()).unwrap_or_default();
    if bound {
        format!("<{tag}> is not {head}'s member {}: a tag is a component's by its capital (07 §4), so this is an element named \"{tag}\", which no element is — import {head} under a capital, `import {{ {head} as {cap} }}`, and apply the member, <{cap}{rest}> (declared `export component {tag}(…)`, MO-11q)", rest.trim_start_matches('.'))
    } else {
        format!("<{tag}> is no element (no element's name has a `.`) and no component: a tag is a component's by its capital (07 §4) — a member component is applied through a name with a capital, <{cap}{rest}>")
    }
}
/// MO-11a, MO-8k: what UNKNOWN_COMPONENT says for a JS import — where its declaration goes, and for a package how to draft one.
pub fn unknown_js_component(tag: &str, from: Option<&str>) -> String {
    match from {
        Some(f) if !f.starts_with('.') && !f.starts_with('/') => format!("<{tag}> is imported from {f}, which has no declaration: write rx-types/{f}.d.rx with `export component {tag}(props: {{ … }})`, or draft it from the package's types: `npx rx-declare {f} --out rx-types/{f}.d.rx` (MO-8k, MO-11a)"),
        _ => format!("<{tag}> is imported from JS, which declares no component {tag}: declare it beside the module, `export component {tag}(props: {{ … }})` (MO-11a)"),
    }
}

fn kept_msg(peek: &str, why: &str) -> String {
    format!("`{}` is kept where it is read, but {} — it would keep its first value: drop peek to read it live, or name the snapshot, `source saved := {}`", peek, why, peek)
}
/// E-5a: why a kept peek's value can change, when this module alone cannot tell that it does not.
fn why_of(what: &str, c: &Ch) -> String {
    if c.yes {
        format!("{} changes", what)
    } else if c.deps.iter().any(|d| d.starts_with("prop|")) {
        // `props.value` is the prop; `r.x`, a row of `props.rows`, comes from one
        let direct = what.split_once('.').is_some_and(|(_, f)| c.deps.iter().any(|d| d.starts_with("prop|") && d.rsplit('|').next() == Some(f)));
        format!("{} {}: the parent can change it", what, if direct { "is a prop" } else { "comes from a prop" })
    } else if c.deps.iter().any(|d| d.starts_with("ctx|")) {
        format!("{} reads a provision, which can change", what)
    } else {
        format!("{} is imported and can change", what)
    }
}
fn ch_val(c: &Ch, truth: &HashSet<String>) -> bool {
    c.yes || c.deps.iter().any(|d| truth.contains(d))
}
/// E-5a, the whole-program pass: each prop, provision and export changes when what can reach it does (a least fixpoint);
/// then each kept peek that waited on them is decided. A component the entry exports, or one passed as a value, is applied by
/// JS: its props can change. A module known only by its signature (MO-9) is not seen: what comes from it can change.
/// `hosts`: modules a JS host imports with `?rx-lib` (CP-4d): their exported components are applied by JS, as the entry's are.
fn resolve_peeks(all: &[(String, PeekFacts)], set: &ModuleSet, hosts: &[String]) -> Vec<Diagnostic> {
    let alias: HashMap<&str, &str> = all.iter().flat_map(|(_, f)| f.aliases.iter().map(|(a, b)| (a.as_str(), b.as_str()))).collect();
    let kk = |x: &str| -> String { alias.get(x).map(|s| s.to_string()).unwrap_or_else(|| x.to_string()) };
    let seen = |x: &str| set.programs.contains_key(x.split('#').next().unwrap_or(""));
    let mut escapes: HashSet<String> = HashSet::new();
    for (path, f) in all {
        for k in &f.escapes {
            escapes.insert(kk(k));
        }
        if *path == set.entry || hosts.contains(path) {
            for k in &f.exported {
                escapes.insert(kk(k));
            }
        }
    }
    let apps: Vec<&(String, String, Ch)> = all.iter().flat_map(|(_, f)| f.apps.iter()).collect();
    let provs: Vec<&(String, Ch)> = all.iter().flat_map(|(_, f)| f.provs.iter()).collect();
    let mut exps: IndexMap<&str, &Ch> = IndexMap::new();
    for (_, f) in all {
        for (k, c) in &f.exports {
            exps.insert(k.as_str(), c);
        }
    }
    let mut nodes: IndexSet<String> = IndexSet::new();
    let chs = apps.iter().map(|a| &a.2).chain(provs.iter().map(|p| &p.1)).chain(exps.values().copied()).chain(all.iter().flat_map(|(_, f)| f.deferred.iter().flat_map(|x| [&x.p, &x.o])));
    for c in chs {
        nodes.extend(c.deps.iter().cloned());
    }
    let mut truth: HashSet<String> = HashSet::new();
    let holds = |n: &str, truth: &HashSet<String>| -> bool {
        let parts: Vec<&str> = n.split('|').collect();
        let kind = parts[0];
        let key = kk(parts.get(1).copied().unwrap_or(""));
        let field = parts.get(2).copied().unwrap_or("");
        if !seen(&key) {
            return true;
        }
        match kind {
            "prop" => escapes.contains(&key) || apps.iter().any(|a| kk(&a.0) == key && (field == "*" || a.1 == field || a.1 == "*") && ch_val(&a.2, truth)),
            "ctx" => provs.iter().any(|p| p.0 == key && ch_val(&p.1, truth)),
            _ => exps.get(key.as_str()).is_none_or(|c| ch_val(c, truth)),
        }
    };
    loop {
        let mut grew = false;
        for n in &nodes {
            if !truth.contains(n) && holds(n, &truth) {
                truth.insert(n.clone());
                grew = true;
            }
        }
        if !grew {
            break;
        }
    }
    let mut out: Vec<Diagnostic> = vec![];
    for (path, f) in all {
        for x in &f.deferred {
            if !ch_val(&x.p, &truth) || ch_val(&x.o, &truth) {
                continue;
            }
            let d = Diagnostic { code: "SNAPSHOT_KEPT".into(), rule: "E-5a".into(), line: x.line, msg: kept_msg(&x.peek, &format!("{} changes", x.what)), file: Some(path.clone()) };
            if !out.iter().any(|y| y.file == d.file && y.line == d.line && y.msg == d.msg) {
                out.push(d);
            }
        }
    }
    out
}

pub struct Opts<'a> {
    pub sigs: &'a IndexMap<String, ModSig>,
    pub file: Option<String>,
    pub declarations: &'a IndexMap<String, Vec<JsDecl>>,
    /// CN-3d: a client-only build (no SSR): a first load nothing holds shows nothing, so every reader that can have
    /// no value yet needs a `loading` region above it, as a client question's reader does (SV-7b).
    pub spa: bool,
    /// E-5a: the modules checked are the whole program
    pub whole: bool,
}

pub struct Checker<'a> {
    /// MO-11f: the components in a factory call's arguments (values there, not reads), and each factory's, by its symbol
    value_ids: HashSet<*const Expr>,
    factory_values: HashMap<SId, Vec<String>>,
    /// MO-11f: the factories being expanded, per walk (markup, content, shape); a factory may be given itself (C-1 reports it)
    expanding: [HashSet<SId>; 3],
    /// AC-1g: local type aliases of a plain value
    scalar_aliases: HashSet<String>,
    /// MO-10d: CN-3e asks what may hold, where a foreign reader counts (R-8 asks what may be absent, where it does not)
    holds_mode: Cell<bool>,
    pub diags: Vec<Diagnostic>,
    pub model: ModelBuilder,
    opts: Opts<'a>,
    root_env: Option<EId>,
    line: i64,
    seq: usize,
    uses: Vec<UseRec>,
    /// MO-10g: closures passed where a declared JS fn takes a callback
    callback_fns: HashSet<*const Expr>,
    /// MO-10i: closures passed where a JS fn's declaration makes their parameters drafts, with those positions
    draft_fns: HashMap<*const Expr, Vec<usize>>,
    /// MO-10i: the closures being walked (ids, innermost last), and the last id given
    fn_stack: Vec<usize>,
    fn_seq: usize,
    /// MO-10i: a draft path's updater (`d.n := v => v + 1`): applied where it is written, not a closure that runs later
    updaters: HashSet<*const Expr>,
    /// MO-10i: the draft callbacks being walked, innermost last (their `fn_stack` ids)
    draft_cbs: Vec<usize>,
    /// E-5a: the closures `ch_of` is reading through a call of them
    ch_fns: HashSet<*const Expr>,
    /// MO-10k: memo of `tainted` (absent while a name is being decided)
    /// MO-11l: every way out the walk recorded (`renders_sinks` decides them for `renders`; `prop_keeps` asks them
    /// again for one prop of a component), the prop being asked about, and what was decided
    all_sinks: Vec<Sink<'a>>,
    probe: Option<(RId, String)>,
    keeps_memo: HashMap<(RId, String), Option<String>>,
    keeps_busy: HashSet<(RId, String)>,
    keeps_cut: usize,
    /// the fields of its props a component names (`props.table`), for its signature's `keeps(…)`
    prop_named: HashMap<RId, IndexSet<String>>,
    /// R-io-3, CN-1b: what this module provides for each context, by its name, and the names it declares by `action`
    /// (`provided_action`: read from the text before the walk, so a reader above its provider sees it)
    provided: HashMap<String, Vec<&'a Expr>>,
    action_names: HashSet<String>,
    /// a component's props type, as written (its row words taken out)
    props_ty: HashMap<RId, String>,
    taint_memo: HashMap<(Taint, SId), Option<SId>>,
    taint_busy: HashSet<(Taint, SId)>,
    taint_cut: usize,
    /// MO-11l: the places a `renders` value may leave through, decided after the walk
    sinks: Vec<Sink<'a>>,
    /// MO-10f, MO-10i: expressions written where a result with held fields, or one with draft parts, may stand whole:
    /// the object of a field read, an alias's value, an operand of a comparison, a condition
    whole_ok: HashSet<*const Expr>,
    /// MO-10i: names written as what a call calls
    callee_ids: HashSet<*const Expr>,
    /// MO-10k: a closure literal's other arguments in the call it is given to (its parameters may be any of them)
    fn_srcs: HashMap<*const Expr, Vec<(&'a Expr, EId)>>,
    /// MO-10k: the name a closure literal is bound to
    fn_owner: HashMap<*const Expr, SId>,
    /// MO-11k: declared JS components' render props (fields typed as a function giving a View), by region
    render_props: HashMap<RId, HashSet<String>>,
    /// MO-11k: those of them the declaration marks optional (`children?: (item: T) => View`)
    render_optional: HashMap<RId, HashSet<String>>,
    /// MO-11t: a JS component's props that take a view (typed `View`, not `children`)
    view_props: HashMap<RId, HashSet<String>>,
    /// MO-11o: the JS components' props that render what their value carries
    carried_props: HashMap<RId, HashSet<String>>,
    /// MO-11o: the component values carrying calls were given (the value, its name, the line, the call), and those a
    /// `renders` prop reached
    carried_pending: Vec<(*const Expr, String, i64, String)>,
    /// MO-11p: each outlet, where it is (its region) and whose children it renders (the component's region)
    outlets: Vec<(RId, RId)>,
    /// MO-11o (2026-11-22): each place a component gives a prop of its own on to a prop that renders what it carries:
    /// the component, its prop, and the region what the prop carries is rendered in
    forwards: Vec<(RId, String, RId)>,
    /// MO-10f (2026-11-22): per component, the fields of its props that its type says hold or fail where they are
    /// read (`query.data`, holds, classes): the interface a JS result with held fields may be given whole through
    prop_held: HashMap<RId, Vec<(String, bool, Vec<String>)>>,
    /// …and the props taken, by syntax, for such ones (`forwarded_props`): component, prop, the component's name and line
    forwarded_decl: Vec<(RId, String, String, usize)>,
    /// MO-10i (2026-11-22): where a name is written as a call's whole argument, in this module: name → (callee's name,
    /// argument index). What `updater_positions` reads to find a named closure's uses before it walks its body
    arg_calls: HashMap<String, Vec<(String, usize)>>,
    /// …and the arguments so written that a draft-handing call took as its callback
    updater_ok: HashSet<*const Expr>,
    /// W-1a: the functions of functional writes of a source (`x := xs => …`): their parameter is the slot's value
    write_fns: HashSet<*const Expr>,
    /// 99, the advisory rows: what the checker says about a correct program
    pub advice: Vec<Diagnostic>,
    /// E-10: equations decided constant (None while being decided)
    const_eqs: HashMap<SId, Option<bool>>,
    carried_rendered: HashSet<*const Expr>,
    /// MO-11o: the carried values `carried_names` reached (read-only walks record them here; the application keeps them)
    reached: std::cell::RefCell<HashSet<*const Expr>>,
    /// MO-10g: declared JS components' callback props (fields typed as any other function), by region
    callback_props: HashMap<RId, HashSet<String>>,
    /// MO-10g: declared JS components' props typed as a function without `handler`: pure, whatever their name
    pure_props: HashMap<RId, HashSet<String>>,
    /// MO-11k: view lambdas in a render-prop position
    view_fns: HashSet<*const Markup>,
    readers: Vec<ReaderRec<'a>>,
    /// CN-3e: `loading on(…)` regions (the region made, its `on`) and effect inputs, by where they are.
    load_ons: Vec<ReaderRec<'a>>,
    effect_ins: Vec<ReaderRec<'a>>,
    handlers: Vec<HandlerRec<'a>>,
    apps: Vec<AppRec<'a>>,
    actions: Vec<ActionRec<'a>>,
    provisions: Vec<Provision<'a>>,
    /// MO-1d: the symbols import declarations bound, which no declaration in a nested block may shadow.
    import_syms: HashSet<SId>,
    later: Vec<Later<'a>>,
    comp_syms: HashMap<RId, SId>,
    rows_busy: HashSet<String>,
    /// O-3: per component, the props it stores where they outlive it — "d:<depth>" (a source), "p:<key>" (a provision above)
    retains: HashMap<RId, IndexMap<String, IndexSet<String>>>,
    regions: Vec<Region>,
    syms: Vec<Sym<'a>>,
    envs: Vec<Env>,
    awaited_calls: HashSet<*const Expr>,
    server_exprs: HashMap<*const Expr, SId>,
    stmt_awaits: HashSet<*const Expr>,
    /// MO-10b: the expressions an `await` is written on (`await x.load()`): a promise that is awaited is asked for
    awaited: HashSet<*const Expr>,
    shapes: HashMap<SId, Option<Shape>>,
    // the application tree (resolve_tree), kept for the signature's component summaries
    occ: Vec<Occ>,
    r_memo: HashMap<RId, Vec<Vec<Step>>>,
    r_busy: HashSet<RId>,
    pf_memo: HashMap<(RId, String), Vec<PFEntry>>,
    pf_busy: HashSet<(RId, String)>,
    esc_memo: HashMap<Option<RId>, Esc>,
    esc_busy: HashSet<Option<RId>>,
    reader_f: Vec<(RId, &'a Expr, i64, Fails)>,
    arg_r: Vec<(usize, String)>,
    arg_f: Vec<(usize, String, Fails)>,
    /// E-5a: kept expressions that contain a `peek` (the expression, its scope, the line)
    kept_peeks: Vec<(&'a Expr, EId, i64)>,
    /// E-5a: written, guessed, refreshed or affected here
    changed: HashSet<SId>,
    /// E-5a: components passed as values: JS applies them
    escapes: IndexSet<String>,
    ch_memo: HashMap<SId, Ch>,
    deferred: Vec<Deferred>,
}

pub struct CheckResult {
    pub diags: Vec<Diagnostic>,
    /// 99, the advisory rows: advice about a correct program, never an error
    pub advice: Vec<Diagnostic>,
    pub sig: ModSig,
    pub model: serde_json::Value,
    pub peeks: PeekFacts,
}

pub fn check_with_signature(p: &Program, opts: Opts) -> CheckResult {
    let file = opts.file.clone().unwrap_or_else(|| "main.rx".into());
    let mut c = Checker::new(opts);
    c.run(p);
    let sig = c.signature(p);
    let model = c.build_model(&file);
    let peeks = c.peek_facts(p);
    CheckResult { diags: c.diags, advice: c.advice, sig, model, peeks }
}

pub struct Checked {
    pub diags: Vec<Diagnostic>,
    /// 99, the advisory rows: advice about a correct program — it never fails a build
    pub advice: Vec<Diagnostic>,
    pub sigs: IndexMap<String, ModSig>,
    pub models: IndexMap<String, serde_json::Value>,
}
/// CN-4b / MO-3: check every module of a program, dependencies first, each against its imports' signatures only.
pub fn check_modules(set: &ModuleSet, spa: bool) -> Checked {
    check_modules_with(set, spa, false)
}
/// The same; `whole` (E-5a): the modules are the whole program, so a kept peek of a prop or a provision is decided by every
/// application and provision in them.
pub fn check_modules_with(set: &ModuleSet, spa: bool, whole: bool) -> Checked {
    check_modules_hosts(set, spa, whole, &[])
}
/// E-5a, whole program: as `check_modules_with`, with `hosts` the modules a JS host imports with `?rx-lib` (CP-4d).
pub fn check_modules_hosts(set: &ModuleSet, spa: bool, whole: bool, hosts: &[String]) -> Checked {
    let mut sigs: IndexMap<String, ModSig> = set.signatures.clone();
    let mut diags = set.diags.clone();
    let mut models = IndexMap::new();
    let mut facts = vec![];
    let mut advice = vec![];
    for path in &set.order {
        let r = check_with_signature(&set.programs[path], Opts { sigs: &sigs, file: Some(path.clone()), declarations: &set.declarations, spa, whole });
        diags.extend(r.diags);
        advice.extend(r.advice);
        sigs.insert(path.clone(), r.sig);
        models.insert(path.clone(), r.model);
        facts.push((path.clone(), r.peeks));
    }
    if whole {
        diags.extend(resolve_peeks(&facts, set, hosts));
        diags.extend(host_exports(&sigs, hosts, spa));
    }
    Checked { diags, advice, sigs, models }
}

/// 11 CP-4d: a component a JS host renders (`pages.rx?rx-lib`) is applied where the checker cannot see, so nothing
/// above it is credited to it — the cautious placement (09 MO-11s), a root of its own. What its summary lets out of its
/// root is therefore unhandled: a failure no boundary of its own discharges, a context nothing in it provides, a first
/// load nothing in it holds.
fn host_exports(sigs: &IndexMap<String, ModSig>, hosts: &[String], spa: bool) -> Vec<Diagnostic> {
    let mut out = vec![];
    for h in hosts {
        let Some(sig) = sigs.get(h) else { continue };
        for (name, x) in &sig.exports {
            let ExportSig::Comp { sig: c } = x else { continue };
            let why = format!("{name} is exported from a module a JS host renders (`?rx-lib`): JS applies it where the checker cannot see, so no boundary or provision above it is credited (CP-4d)");
            for o in &c.own {
                let line = o.at.as_deref().and_then(|a| a.rsplit(':').next()).and_then(|n| n.parse::<i64>().ok()).unwrap_or(1);
                out.push(Diagnostic { code: "UNHANDLED_FAILURE".into(), rule: "R-f-5".into(), line, msg: format!("a reader of {} (in <{name}>) can fail with {} and no catch or errored boundary inside {name} discharges it — {why}: show it where it is read, `errored fallback(e) {{ … }} {{ … }}` inside the component", o.what, o.cls), file: Some(h.clone()) });
            }
            for k in &c.requires {
                if k == HOLD {
                    let code = if spa { "ASYNC_OUTSIDE_LOADING_BOUNDARY" } else { "CLIENT_QUESTION_UNHELD" };
                    out.push(Diagnostic { code: code.into(), rule: if spa { "CN-3d" } else { "SV-7b" }.into(), line: 1, msg: format!("a reader in <{name}> can have no value yet, and no `loading` region inside {name} holds it — {why}: put the reader under `loading fallback {{ … }} {{ … }}` inside the component"), file: Some(h.clone()) });
                } else {
                    out.push(Diagnostic { code: "CONTEXT_NOT_FOUND".into(), rule: "RG-7b".into(), line: 1, msg: format!("use {} (in <{name}>): no provision of it inside {name} — {why}: provide it inside the component, or take the value as a prop", key_name(k)), file: Some(h.clone()) });
                }
            }
        }
    }
    out
}

impl<'a> Checker<'a> {
    pub fn new(opts: Opts<'a>) -> Self {
        Checker {
            holds_mode: Cell::new(false),
            value_ids: HashSet::new(),
            factory_values: HashMap::new(),
            expanding: Default::default(),
            diags: vec![],
            model: ModelBuilder::default(),
            opts,
            root_env: None,
            line: 1,
            seq: 0,
            uses: vec![],
            callback_fns: HashSet::new(),
            draft_fns: HashMap::new(),
            fn_stack: vec![],
            updaters: HashSet::new(),
            draft_cbs: vec![],
            ch_fns: HashSet::new(),
            all_sinks: vec![],
            probe: None,
            keeps_memo: HashMap::new(),
            keeps_busy: HashSet::new(),
            keeps_cut: 0,
            prop_named: HashMap::new(),
            provided: HashMap::new(),
            action_names: HashSet::new(),
            props_ty: HashMap::new(),
            taint_memo: HashMap::new(),
            taint_busy: HashSet::new(),
            taint_cut: 0,
            sinks: vec![],
            whole_ok: HashSet::new(),
            callee_ids: HashSet::new(),
            fn_srcs: HashMap::new(),
            fn_owner: HashMap::new(),
            fn_seq: 0,
            render_props: HashMap::new(),
            render_optional: HashMap::new(),
            view_props: HashMap::new(),
            carried_props: HashMap::new(),
            carried_pending: vec![],
            outlets: vec![],
            forwards: vec![],
            forwarded_decl: vec![],
            arg_calls: HashMap::new(),
            updater_ok: HashSet::new(),
            write_fns: HashSet::new(),
            advice: vec![],
            prop_held: HashMap::new(),
            const_eqs: HashMap::new(),
            carried_rendered: HashSet::new(),
            reached: std::cell::RefCell::new(HashSet::new()),
            callback_props: HashMap::new(),
            pure_props: HashMap::new(),
            view_fns: HashSet::new(),
            readers: vec![],
            load_ons: vec![],
            effect_ins: vec![],
            handlers: vec![],
            apps: vec![],
            actions: vec![],
            scalar_aliases: HashSet::new(),
            provisions: vec![],
            import_syms: HashSet::new(),
            later: vec![],
            comp_syms: HashMap::new(),
            rows_busy: HashSet::new(),
            retains: HashMap::new(),
            regions: vec![],
            syms: vec![],
            envs: vec![],
            awaited_calls: HashSet::new(),
            server_exprs: HashMap::new(),
            stmt_awaits: HashSet::new(),
            awaited: HashSet::new(),
            shapes: HashMap::new(),
            occ: vec![],
            r_memo: HashMap::new(),
            r_busy: HashSet::new(),
            pf_memo: HashMap::new(),
            pf_busy: HashSet::new(),
            esc_memo: HashMap::new(),
            esc_busy: HashSet::new(),
            reader_f: vec![],
            arg_r: vec![],
            arg_f: vec![],
            kept_peeks: vec![],
            changed: HashSet::new(),
            escapes: IndexSet::new(),
            ch_memo: HashMap::new(),
            deferred: vec![],
        }
    }

    fn err(&mut self, code: &str, rule: &str, msg: String) {
        let line = self.line;
        if !self.diags.iter().any(|d| d.code == code && d.line == line && d.msg == msg) {
            self.diags.push(Diagnostic { code: code.into(), rule: rule.into(), line, msg, file: self.opts.file.clone() });
        }
    }
    fn region(&mut self, parent: Option<RId>, kind: &'static str, component: bool, name: Option<String>) -> RId {
        let id = self.seq;
        self.seq += 1;
        let r = self.regions.len();
        let depth = parent.map(|p| self.regions[p].depth + 1).unwrap_or(0);
        let comp = if component { Some(r) } else { parent.and_then(|p| self.regions[p].component) };
        self.regions.push(Region { id, depth, parent, component: comp, is_component_root: component, provides: IndexSet::new(), catches: None, kids: None, kids_field: None, js: false, sig: None, key: None });
        self.model.region(id, kind, parent.map(|p| self.regions[p].id), name);
        r
    }
    fn env(&mut self, parent: Option<EId>, region: RId) -> EId {
        self.envs.push(Env { vars: IndexMap::new(), parent, region });
        self.envs.len() - 1
    }
    fn lookup(&self, env: EId, n: &str) -> Option<SId> {
        let mut e = Some(env);
        while let Some(i) = e {
            if let Some(&s) = self.envs[i].vars.get(n) {
                return Some(s);
            }
            e = self.envs[i].parent;
        }
        None
    }
    fn new_sym(&mut self, s: Sym<'a>) -> SId {
        self.syms.push(s);
        self.syms.len() - 1
    }
    /// A constant (`let`, a parameter, a row binding): bound, not part of the model.
    fn set_value(&mut self, env: EId, name: &str, line: i64) {
        let region = self.envs[env].region;
        let s = self.new_sym(Sym::new(SymKind::Value, name, region, line));
        self.envs[env].vars.insert(name.to_string(), s);
    }
    /// CP-6: a symbol bound in `env`, recorded for the model.
    fn bind(&mut self, env: EId, name: &str, sym: Sym<'a>) -> SId {
        let kind = sym.kind;
        let s = self.new_sym(sym);
        self.envs[env].vars.insert(name.to_string(), s);
        self.model.sym(s, kind.as_str());
        s
    }
    fn reg(&self, env: EId) -> RId {
        self.envs[env].region
    }
    /// CP-6: a computation the walk enters.
    fn comp<F: FnOnce(&mut Self)>(&mut self, kind: &'static str, env: EId, name: Option<String>, at: Option<String>, f: F) {
        let region = self.regions[self.reg(env)].id;
        let saved = self.model.within(kind, region, self.line, name, at);
        f(self);
        self.model.leave(saved);
    }
    fn read(&mut self, s: SId, ctx: Ctx, pre: bool, field: Option<&str>) {
        let kind = self.syms[s].kind.as_str();
        self.model.read(s, kind, ctx.imperative, pre, field);
    }
    pub fn build_model(&self, file: &str) -> serde_json::Value {
        self.model.build(file, |i| {
            let s = &self.syms[i];
            ModelSymbol {
                name: s.name.clone(),
                kind: s.kind.as_str(),
                region: self.regions[s.region].id,
                line: s.line,
                question: if s.kind == SymKind::Source { Some(s.question) } else { None },
                io: s.io,
                from: s.imported.clone(),
            }
        })
    }

    pub fn run(&mut self, p: &'a Program) {
        arg_calls(&p.to_json(), &mut self.arg_calls);
        let r = self.region(None, "program", false, None);
        let root = self.env(None, r);
        self.root_env = Some(root);
        if p.legacy_view == Some(true) {
            self.line = p.view.first().and_then(|m| m.line).unwrap_or(1) as i64;
            self.err("TOP_LEVEL_MARKUP", "MO-1c", "markup at a module's top level: a module is declarations; the app's view is a component — `export default component App() { … }`".into());
        }
        provides_in(&p.decls, &p.view, &mut self.provided, &mut self.action_names);
        self.block(&p.decls, &p.view, root, Ctx::reactive());
        self.renders_sinks(); // MO-11l: every call's arguments are known now
        // MO-11o: a prop taken (by syntax) for one its component gives on to a prop that renders it, which the walk did not find
        for (comp, field, name, line) in std::mem::take(&mut self.forwarded_decl) {
            if !self.forwards.iter().any(|(c, f, _)| *c == comp && *f == field) {
                self.line = line as i64;
                self.err("RENDERS_ESCAPES", "MO-11o", format!("component {name} was read as rendering what its prop {field} carries (`props.{field}` given to a prop that renders it), but where it does is not one the checker can see: give it on as `props.{field}`, at the top of the component's own view"));
            }
        }
        // MO-11o: a component a value carries is checked where a prop renders it; one nothing renders is not checked anywhere
        for (e, name, line, by) in std::mem::take(&mut self.carried_pending) {
            if !self.carried_rendered.contains(&e) {
                self.line = line;
                self.err("COMPONENT_AS_VALUE", "RG-4a", format!("component {} is carried by {}(…), but nothing renders it: pass what carries it to a JS component's prop declared `renders` (MO-11o)", name, by));
            }
        }
        self.later.push(Later::Content { ms: &p.view, env: root, anc: vec![] });
        let mut i = 0;
        while i < self.later.len() {
            let job = std::mem::replace(&mut self.later[i], Later::Content { ms: &[], env: root, anc: vec![] });
            self.run_later(job);
            i += 1;
        }
        self.retained();
        self.resolve_tree();
        self.loading_on_outside();
        self.snapshot_guards();
        self.guess_while_loading();
        self.kept_peek_check();
    }
    fn run_later(&mut self, job: Later<'a>) {
        match job {
            Later::Content { ms, env, anc } => self.content_check(ms, env, &anc),
            Later::Escape { target, e, tsym, env, line } => {
                self.line = line;
                self.escape(target, e, tsym, env);
            }
            Later::Provide { name, e, env, line, contract } => {
                let rows = self.rows_of(e, env);
                let f = self.fails_of(e, env, false, &HashMap::new());
                self.line = line;
                for r in rows {
                    if !contract.0.contains(&r) {
                        self.err("ROW_NARROWER_THAN_INFERRED", "RG-7e", format!("context {} is declared without `{}`, but this provision is {}", name, r, r));
                    }
                }
                for x in f.cls {
                    if !contract.1.contains("Error") && !contract.1.contains(&x) {
                        self.err("ROW_NARROWER_THAN_INFERRED", "RG-7e", format!("context {} is declared without fails({}), but this provision can fail with {}", name, x, x));
                    }
                }
            }
            Later::RowFails { name, env, fw, written, line } => {
                let Some(s) = self.envs[env].vars.get(&name).copied() else { return };
                if self.syms[s].fails_t.is_none() {
                    return;
                }
                let f = self.sym_fails(s);
                let allowed: Option<Vec<String>> = fw.as_ref().map(|fw| fw[6..fw.len() - 1].split('|').map(|x| js_trim(x).to_string()).filter(|x| !x.is_empty()).collect());
                let all = allowed.as_ref().is_none_or(|a| a.iter().any(|x| x == "Error"));
                if fw.is_none() && f.cls.is_empty() {
                    return;
                }
                for c in f.cls {
                    if fw.is_none() || (!all && !allowed.as_ref().unwrap().contains(&c)) {
                        self.line = line;
                        self.err("ROW_NARROWER_THAN_INFERRED", "CN-4a", format!("{} is declared `{}` but its value also fails with {}", name, written, c));
                    }
                }
            }
        }
    }

    // ---- blocks: declarations, then a view (02 §1, 03) ----
    fn block(&mut self, decls: &'a [Decl], view: &'a [Markup], env: EId, ctx: Ctx) {
        let region = self.reg(env);
        // 1. names (E-7: one declaration per name in a block)
        for d in decls {
            self.line = d.line() as i64;
            if let Decl::Import { names, .. } = d {
                if matches!(d, Decl::Import { resolved: Some(_), .. }) {
                    self.import_rx(d, env);
                } else if matches!(d, Decl::Import { declared: Some(_), .. }) {
                    self.import_declared(d, env);
                }
                if matches!(d, Decl::Import { resolved: Some(_), .. } | Decl::Import { declared: Some(_), .. }) {
                    for n in names {
                        if let Some(&s) = self.envs[env].vars.get(&n.alias) {
                            self.import_syms.insert(s);
                        }
                    }
                    continue;
                }
            }
            match d {
                Decl::Import { names, pure, fails, side, line, from, .. } => {
                    for n in names {
                        let mut s = Sym::new(SymKind::Import, &n.alias, region, *line as i64);
                        s.undeclared = Some(from.clone());
                        s.io = !pure;
                        s.pure_fn = *pure;
                        s.rejects = Some(fails.clone().unwrap_or_else(|| vec!["Error".into()]).into_iter().collect());
                        s.side = *side;
                        let s = self.bind(env, &n.alias, s);
                        self.import_syms.insert(s);
                    }
                    continue;
                }
                Decl::TypeDecl { name, text, .. } => {
                    // AC-1g: a local alias of a plain value
                    let rhs = text.splitn(2, '=').nth(1).map(|r| r.trim());
                    if text.trim_start().starts_with("type") && rhs.map_or(false, scalar_type) {
                        self.scalar_aliases.insert(name.clone());
                    }
                    continue;
                }
                Decl::Effect { .. } | Decl::Provide { .. } => continue,
                Decl::Context { name, ty, source, dflt, line, exported, .. } => {
                    if self.envs[env].vars.contains_key(name) {
                        self.err("DUPLICATE_DECLARATION", "E-7", format!("{} is declared twice in one block", name));
                    }
                    let contract = if ty.as_ref().is_some_and(|t| ROW_WORDS.is_match(t)) || *exported { Some(contract_of(ty.as_deref())) } else { None };
                    if *source {
                        self.err("SOURCE_CONTEXT", "O-4", format!("context {}: source … is withdrawn (RG-7c, 2026-10-31): what is provided is read beneath it — provide the writes you allow, as actions (`context {}: {{ current: T; set: (v: T) => void }}`)", name, name));
                    }
                    let suffix = if self.regions[region].parent.is_some() {
                        let n = self.seq;
                        self.seq += 1;
                        format!("@{}", n)
                    } else {
                        String::new()
                    };
                    let key = format!("{}#{}{}", self.opts.file.as_deref().unwrap_or("main.rx"), name, suffix);
                    let mut s = Sym::new(SymKind::Context, name, region, *line as i64);
                    s.ctx = Some(CtxInfo { key: key.clone(), source: *source, dflt: dflt.is_some(), contract, ty: ty.as_ref().map(|t| field_rows(&ROW_WORDS.replace(t, "")).0) });
                    self.bind(env, name, s);
                    if let Some(e) = dflt {
                        self.provisions.push(Provision { key, e, env });
                    }
                    continue;
                }
                _ => {}
            }
            let name = d.name().unwrap();
            if let Some(&prev) = self.envs[env].vars.get(name) {
                if self.syms[prev].kind != SymKind::Import {
                    self.err("DUPLICATE_DECLARATION", "E-7", format!("{} is declared twice in one block", name));
                }
            }
            if let Some(shadowed) = self.envs[env].parent.and_then(|p| self.lookup(p, name)) {
                if self.import_syms.contains(&shadowed) {
                    self.err("SHADOWED_IMPORT", "MO-1d", format!("{} shadows the imported {}: rename one (`import {{ {} as … }}`)", name, name, name));
                }
            }
            let kind = match d {
                Decl::Fn { .. } => SymKind::Fn,
                Decl::Component { .. } => SymKind::Comp,
                Decl::Action { .. } => SymKind::Action,
                Decl::Server { .. } => SymKind::Server,
                Decl::Source { .. } => SymKind::Source,
                Decl::Error { .. } => SymKind::ErrClass,
                _ => SymKind::Eq,
            };
            let mut sym = Sym::new(kind, name, region, d.line() as i64);
            let mut server_expr = None;
            match d {
                Decl::Server { params, .. } => sym.params = Some(params.iter().map(|n| SigParam { name: n.clone(), r#ref: false, ty: None }).collect()),
                Decl::Source { question, key, .. } => {
                    sym.question = *question;
                    sym.row_key = key.clone(); // ST-4d: what its rows are keyed by
                }
                Decl::Action { params, .. } => {
                    sym.io = true; // R-io-2: an action is io
                    sym.arity = Some(params.len()); // AC-1f: its parameters
                }
                Decl::Fn { params, decls: fdecls, .. } => {
                    sym.params = Some(params.iter().map(|p| SigParam { name: p.name.clone(), r#ref: p.r#ref, ty: p.ty.clone() }).collect());
                    sym.instantiating = params.iter().any(|p| p.r#ref) || !fdecls.is_empty();
                    sym.fn_decl = Some(d);
                    sym.decl_env = Some(env);
                }
                Decl::Component { name, .. } => {
                    sym.comp = Some(d);
                    let r = self.region(Some(region), "component", true, Some(name.clone()));
                    sym.comp_region = Some(r);
                    // E-5a
                    let file = self.opts.file.clone().unwrap_or_else(|| "main.rx".into());
                    let nested = if self.regions[region].parent.is_some() { format!("@{}", self.regions[r].id) } else { String::new() };
                    self.regions[r].key = Some(format!("{}#{}{}", file, name, nested));
                }
                Decl::Eq { e, key, deferred, .. } => {
                    sym.row_key = key.clone();
                    sym.eq_decl = Some(*deferred);
                    sym.maps_records = key.is_none() && maps_into_records(e);
                    if let ExprKind::Id(n) = &e.k {
                        if let Some(t) = self.lookup(env, n) {
                            if self.syms[t].io {
                                sym.io = true;
                            }
                        }
                    }
                    self.foreign_part(&mut sym, e, env);
                    // MO-11o: a carrying call's arguments; every equation's expression, looked through later
                    if let ExprKind::Call { f, args, .. } = &e.k {
                        if let ExprKind::Id(n) = &f.k {
                            if let Some(t) = self.lookup(env, n).filter(|&t| self.syms[t].carrier) {
                                sym.carried = Some((args.as_slice(), env));
                                sym.carried_under = self.syms[t].under.clone();
                            }
                        }
                    }
                    sym.carried_expr = Some((e, env));
                    sym.val = Some((e, env));
                    if sym.foreign == Some(FShape::Comp) {
                        if let ExprKind::Call { f, args, .. } = &e.k {
                            // MO-11f: the bound name is a component; MO-12c: what it provides to what it renders
                            let gives: IndexSet<String> = match &f.k {
                                ExprKind::Id(n) => self.lookup(env, n).map(|t| self.syms[t].gives.iter().cloned().collect()).unwrap_or_default(),
                                _ => IndexSet::new(),
                            };
                            sym.nests = match &f.k {
                                ExprKind::Id(n) => self.lookup(env, n).and_then(|t| self.syms[t].nests.clone()),
                                _ => None,
                            };
                            let r = self.region(None, "imported", true, Some(sym.name.clone()));
                            let mut props = IndexMap::new();
                            props.insert("*".to_string(), PropSig { f: Catch::Set(IndexSet::new()), p: Catch::Set(gives), rendered: true, action: None, component: false, renders: false, takes: vec![] });
                            self.regions[r].sig = Some(CompSig { made: false, own: vec![], requires: vec![], props, shape: Some(crate::content::Shape { children_at: vec![vec![]], ..Default::default() }), stored: IndexMap::new(), keeps: vec![] });
                            sym.kind = SymKind::Comp;
                            sym.comp_region = Some(r);
                            sym.factory = Some((args.as_slice(), env));
                        }
                    } else if sym.foreign.is_some() {
                        if let ExprKind::Call { f, args, .. } = &e.k {
                            // MO-11l: its component values are applied where it is bound
                            if let ExprKind::Id(n) = &f.k {
                                if let Some(t) = self.lookup(env, n).filter(|t| self.syms[*t].renders) {
                                    sym.factory = Some((args.as_slice(), env));
                                    sym.renders = true;
                                    let _ = t;
                                    sym.local_renders = true;
                                }
                            }
                        }
                    }
                    if let Some(sf) = unwrap_server(e) {
                        sym.kind = SymKind::Server;
                        if let ExprKind::ServerFn { params, .. } = &sf.k {
                            sym.params = Some(params.iter().map(|n| SigParam { name: n.clone(), r#ref: false, ty: None }).collect());
                        }
                        server_expr = Some(sf as *const Expr);
                    }
                }
                _ => {}
            }
            let comp_region = if sym.factory.is_some() { None } else { sym.comp_region };
            let s = self.bind(env, name, sym);
            if let Decl::Eq { e: Expr { k: ExprKind::Fn { .. }, .. }, .. } = d {
                if let Decl::Eq { e, .. } = d {
                    self.fn_owner.insert(e as *const Expr, s);
                }
            }
            if let Some(r) = comp_region {
                self.comp_syms.insert(r, s);
            }
            if let Some(p) = server_expr {
                self.server_exprs.insert(p, s);
            }
        }
        self.server_io(decls, env);
        self.forwarded_props(decls, env);
        // MO-10k: what a fn or an action of this module may give back, by mention (every name of the block is bound now)
        for d in decls {
            let mut names = IndexSet::new();
            let name = match d {
                Decl::Fn { name, params, decls: fdecls, tail, .. } => {
                    flows_fn(params, fdecls, tail, &Look { builtin: &|n| self.lookup(env, n).is_none(), prim: &|x| self.decl_prim(x, env), field: &|x| self.prop_field(x, env).map(|(r, f)| prop_name(r, &f)) }, &mut names);
                    name
                }
                Decl::Action { name, params, body, .. } => {
                    flows_returns(body, &mut params.iter().cloned().collect(), &mut HashMap::new(), &Look { builtin: &|n| self.lookup(env, n).is_none(), prim: &|x| self.decl_prim(x, env), field: &|x| self.prop_field(x, env).map(|(r, f)| prop_name(r, &f)) }, &mut names);
                    name
                }
                _ => continue,
            };
            let s = self.envs[env].vars[name.as_str()];
            self.syms[s].ret_flows = Some((names, env));
        }
        for d in decls {
            if let Decl::Source { name, init, question: false, .. } = d {
                let s = self.envs[env].vars[name.as_str()];
                self.syms[s].fails_t = Some(FailsT::Expr { e: init, env, cache: None, busy: false });
            }
        }
        for d in decls {
            let (name, e) = match d {
                Decl::Eq { name, e, .. } => (name, e),
                Decl::Source { name, init, question: true, .. } => (name, init),
                _ => continue,
            };
            let s = self.envs[env].vars[name.as_str()];
            let sym = &mut self.syms[s];
            sym.rows = Some(RowsT::Expr { e, env, cache: None, busy: false });
            sym.expr = Some((e, env));
            sym.fails_t = Some(FailsT::Expr { e, env, cache: None, busy: false });
        }
        // 2. C-1 over this block's equations (the static graph, CN-3a)
        self.cycles(decls, env);
        // 3. each declaration
        for d in decls {
            self.line = d.line() as i64;
            self.decl(d, env, ctx);
        }
        // 4. the view
        let view_root = self.regions[region].is_component_root || self.regions[region].parent.is_none();
        self.markup(view, env, view_root);
    }

    /// 12 SF-1: a server fn is io when its body calls io — JS declared io, `log`, or another server fn that is.
    fn server_io(&mut self, decls: &'a [Decl], env: EId) {
        let mut servers: Vec<(&str, &[String], &[Stmt])> = vec![];
        for d in decls {
            match d {
                Decl::Server { name, params, body, .. } => servers.push((name, params, body)),
                Decl::Eq { name, e, .. } => {
                    if let Some(Expr { k: ExprKind::ServerFn { params, body, .. }, .. }) = unwrap_server(e) {
                        servers.push((name, params, body));
                    }
                }
                _ => {}
            }
        }
        let mut changed = true;
        while changed {
            changed = false;
            for (name, params, body) in &servers {
                let s = self.envs[env].vars[*name];
                if self.syms[s].io {
                    continue;
                }
                let mut calls = vec![];
                for st in body.iter() {
                    calls_in(Node::S(st), &mut calls);
                }
                let hit = calls.into_iter().find(|n| {
                    !params.contains(n)
                        && if n == "log" {
                            self.lookup(env, n).is_none()
                        } else {
                            self.lookup(env, n).is_some_and(|t| self.syms[t].io)
                        }
                });
                if let Some(h) = hit {
                    self.syms[s].io = true;
                    self.syms[s].io_via = Some(format!("{}(…)", h));
                    changed = true;
                }
            }
        }
    }

    /// MO-3/MO-4: bind an `.rx` import's names from its module's signature.
    fn import_rx(&mut self, d: &'a Decl, env: EId) {
        let Decl::Import { names, from, pure, line, fails, resolved, .. } = d else { return };
        let region = self.reg(env);
        let line = *line as i64;
        let sigs = self.opts.sigs;
        let sig = sigs.get(resolved.as_ref().unwrap());
        if fails.is_some() {
            self.err("IMPORT_ROW_MISMATCH", "MO-4", format!("`fails` asserts rows at the JS boundary; {} is .rx and its rows are its signature's", from));
        }
        for ImportName { name, alias } in names {
            let base = || Sym::new(SymKind::Import, alias, region, line);
            let Some(sig) = sig else {
                self.bind(env, alias, base());
                continue;
            };
            let Some(x) = sig.exports.get(name) else {
                self.err("NOT_EXPORTED", "MO-6", format!("{} does not export {}", from, if name == "default" { "a default".to_string() } else { name.clone() }));
                self.bind(env, alias, base());
                continue;
            };
            let set = |v: &Vec<String>| -> IndexSet<String> { v.iter().cloned().collect() };
            let sym = match x {
                ExportSig::Type => continue,
                ExportSig::Source { question, rows, fails } => {
                    let mut s = Sym::new(SymKind::Source, alias, region, line);
                    s.question = *question;
                    s.imported = Some(from.clone());
                    s.from_module = Some(from.clone());
                    s.rows = Some(RowsT::Fixed(set(rows)));
                    s.fails_t = Some(FailsT::Fixed(set(fails)));
                    s
                }
                ExportSig::Eq { rows, fails, io } => {
                    let mut s = Sym::new(SymKind::Eq, alias, region, line);
                    s.io = *io;
                    s.from_module = Some(from.clone());
                    s.rows = Some(RowsT::Fixed(set(rows)));
                    s.fails_t = Some(FailsT::Fixed(set(fails)));
                    s
                }
                ExportSig::Fn { params, instantiating, rows, fails, rejects } => {
                    let mut s = Sym::new(SymKind::Fn, alias, region, line);
                    s.params = Some(params.clone());
                    s.instantiating = *instantiating;
                    s.rows = Some(RowsT::Fixed(set(rows)));
                    s.fails_t = Some(FailsT::Fixed(set(fails)));
                    s.can_fail = !fails.is_empty(); // MO-11l
                    s.rejects = Some(set(rejects));
                    s
                }
                ExportSig::Action => {
                    let mut s = Sym::new(SymKind::Action, alias, region, line);
                    s.io = true;
                    s
                }
                ExportSig::Server { io, params, rejects } => {
                    let mut s = Sym::new(SymKind::Server, alias, region, line);
                    s.io = *io;
                    s.params = Some(params.iter().map(|n| SigParam { name: n.clone(), r#ref: false, ty: None }).collect());
                    s.server_rejects = Some(ServerRejects::Fixed(set(rejects)));
                    s
                }
                ExportSig::ErrClass { .. } => Sym::new(SymKind::ErrClass, alias, region, line),
                ExportSig::Comp { sig } => {
                    let r = self.region(None, "imported", true, Some(alias.clone()));
                    self.regions[r].sig = Some(sig.clone());
                    self.regions[r].key = Some(format!("{}#{}", resolved.as_ref().unwrap(), name)); // E-5a
                    // MO-11o: the props it renders what they carry
                    let cp: HashSet<String> = sig.props.iter().filter(|(_, v)| v.renders).map(|(k, _)| k.clone()).collect();
                    if !cp.is_empty() {
                        self.carried_props.insert(r, cp);
                    }
                    // MO-10f: the fields of its props it reads as ones that hold or fail
                    let ph: Vec<(String, bool, Vec<String>)> = sig.props.iter().flat_map(|(k, v)| v.takes.iter().map(move |(p, h, c)| (format!("{k}.{p}"), *h, c.clone()))).collect();
                    if !ph.is_empty() {
                        self.prop_held.insert(r, ph);
                    }
                    let mut s = Sym::new(SymKind::Comp, alias, region, line);
                    s.comp_region = Some(r);
                    s
                }
                ExportSig::Context { key, source, dflt, rows, fails, ty } => {
                    let mut s = Sym::new(SymKind::Context, alias, region, line);
                    s.ctx = Some(CtxInfo { key: key.clone(), source: *source, dflt: *dflt, contract: Some((set(rows), set(fails))), ty: ty.as_ref().map(|t| field_rows(t).0) });
                    s
                }
            };
            let mut sym = sym;
            if matches!(sym.kind, SymKind::Source | SymKind::Eq | SymKind::Fn) {
                sym.export_key = Some(format!("{}#{}", resolved.as_ref().unwrap(), name)); // E-5a
            }
            if *pure && sym.io {
                self.err("IMPORT_ROW_MISMATCH", "MO-4", format!("{} is io in {}'s signature; `pure` cannot lower an .rx row", name, from));
            }
            self.bind(env, alias, sym);
        }
    }
    /// RG-7: the context a `provide`/`use` names — lexically, like any name.
    fn ctx_of(&mut self, name: &str, env: EId) -> Option<SId> {
        let Some(s) = self.lookup(env, name) else {
            self.err("UNBOUND", "RG-7", format!("{} is not declared here: declare the context (`context {}: T`) or import it", name, name));
            return None;
        };
        let k = self.syms[s].kind;
        if k != SymKind::Context {
            let what = match k {
                SymKind::Source => "a source".to_string(),
                SymKind::Eq => "an equation".to_string(),
                k => format!("a {}", k.as_str()),
            };
            self.err("NOT_A_CONTEXT", "RG-7", format!("{} is {}, not a context: `provide` and `use` name a `context` declaration", name, what));
            return None;
        }
        Some(s)
    }
    /// MO-8: bind a JS import's names from its declaration file.
    fn import_declared(&mut self, d: &'a Decl, env: EId) {
        let Decl::Import { names, from, pure, line, fails, side, declared, .. } = d else { return };
        let region = self.reg(env);
        let line = *line as i64;
        let declared = declared.as_ref().unwrap();
        let decls: &[JsDecl] = self.opts.declarations.get(declared).map(|v| v.as_slice()).unwrap_or(&[]);
        let file = declared.split('/').last().unwrap_or("").to_string();
        let generated = (declared.starts_with("node_modules/.rx-types/") || declared.contains("/node_modules/.rx-types/")).then(|| from.clone()); // MO-8l
        // MO-12a: a JS context's key is its declaration file's
        let js_keys = |c: &mut Self, ns: &[String]| -> Vec<String> {
            ns.iter()
                .map(|n| match decls.iter().find_map(|y| if let JsDecl::Context { name, from, resolved, .. } = y { (name == n).then_some((from, resolved)) } else { None }) {
                    None => {
                        c.err("NOT_EXPORTED", "MO-12", format!("{} names context {} in uses(…) or provides(…) but declares none: add `export context {}`", file, n, n));
                        format!("{}#{}", declared, n)
                    }
                    Some((None, _)) => format!("{}#{}", declared, n),
                    // MO-12e: the context another module's declaration declares, under that declaration's key
                    Some((Some(_), Some(at))) => format!("{}#{}", at, n),
                    Some((Some(from), None)) => {
                        c.err("NOT_EXPORTED", "MO-12", format!("{} takes context {} from \"{}\", whose declaration declares none: it is declared there as `export context {}`, in the `.d.rx` an import of \"{}\" finds (MO-12e)", file, n, from, n, from));
                        format!("{}#{}", declared, n)
                    }
                })
                .collect()
        };
        if fails.is_some() {
            self.err("IMPORT_ROW_MISMATCH", "MO-8", format!("{}'s rows are declared in {}: `fails` on the import cannot restate them", from, file));
        }
        // MO-11a: a Solid component — its declaration is its summary (MO-11q: a member too, bound by its written name)
        let bind_comp = |c: &mut Self, x: &JsDecl, alias: &str| {
            let JsDecl::Comp { props: xprops, fails: xfails, content, uses: xuses, provides: xprovides, outlet: xoutlet, .. } = x else { return };
                // MO-11a: a Solid component — its declaration is its summary; MO-11b: an undeclared prop is read too
                let gives = js_keys(c, xprovides); // MO-12c: provided to everything it renders
                let requires = js_keys(c, xuses); // MO-12b: what it uses itself
                let empty = || Catch::Set(IndexSet::new());
                let given = || Catch::Set(gives.iter().cloned().collect());
                let mut props = IndexMap::new();
                props.insert("*".to_string(), PropSig { f: empty(), p: given(), rendered: true, action: None, component: false, renders: false, takes: vec![] });
                for p in xprops {
                    let f = match &p.catches {
                        Some(c) => Catch::of(c),
                        None => empty(),
                    };
                    props.insert(p.name.clone(), PropSig { f, p: given(), rendered: true, action: None, component: p.component, renders: false, takes: vec![] });
                }
                let own = xfails.iter().map(|c| Own { cls: c.clone(), what: format!("{}'s root", alias), at: Some(file.clone()) }).collect();
                let r = c.region(None, "imported", true, Some(alias.to_string()));
                c.regions[r].sig = Some(CompSig { made: false, own, requires, props, shape: content.clone(), stored: IndexMap::new(), keeps: vec![] });
                let renders: HashSet<String> = xprops.iter().filter(|p| p.render).map(|p| p.name.clone()).collect();
                if !renders.is_empty() {
                    c.render_props.insert(r, renders);
                    c.render_optional.insert(r, xprops.iter().filter(|p| p.render && p.optional).map(|p| p.name.clone()).collect());
                }
                // MO-11t: the props that take a view
                let views: HashSet<String> = xprops.iter().filter(|p| p.view).map(|p| p.name.clone()).collect();
                if !views.is_empty() {
                    c.view_props.insert(r, views);
                }
                let callbacks: HashSet<String> = xprops.iter().filter(|p| p.callback).map(|p| p.name.clone()).collect();
                if !callbacks.is_empty() {
                    c.callback_props.insert(r, callbacks);
                }
                let pures: HashSet<String> = xprops.iter().filter(|p| p.pure).map(|p| p.name.clone()).collect();
                if !pures.is_empty() {
                    c.pure_props.insert(r, pures);
                }
                // MO-11o: the props that render what their value carries
                let carried: HashSet<String> = xprops.iter().filter(|p| p.carried).map(|p| p.name.clone()).collect();
                if !carried.is_empty() {
                    c.carried_props.insert(r, carried);
                }
                c.regions[r].js = true;
                let mut s = Sym::new(SymKind::Comp, alias, region, line);
                s.comp_region = Some(r);
                s.outlet = *xoutlet;
                c.bind(env, alias, s);
        };
        for ImportName { name, alias } in names {
            // MO-11q: `export component Dialog.Root(…)`: the import's members, each a component named as it is written
            let prefix = format!("{}.", name);
            let members: Vec<&JsDecl> = decls.iter().filter(|y| matches!(y, JsDecl::Comp { name: n, .. } if n.starts_with(&prefix))).collect();
            for m in &members {
                let full = format!("{}{}", alias, &m.name()[name.len()..]);
                bind_comp(self, m, &full);
            }
            if members.len() > 0 && !decls.iter().any(|y| y.name() == name) {
                // the object itself: a value
                let mut s = Sym::new(SymKind::Import, alias, region, line);
                s.io = false;
                s.rejects = Some(["Error".to_string()].into_iter().collect());
                self.bind(env, alias, s);
                continue;
            }
            let Some(x) = decls.iter().find(|y| y.name() == name) else {
                let hint = if generated.is_some() { format!("; {file} was drafted from {from}'s types (MO-8l): a build redrafts it when they change, or declare {from} in rx-types/{from}.d.rx") } else { String::new() };
                self.err("NOT_EXPORTED", "MO-8", format!("{} declares no export {} (declare it, or it is not {}'s){}", file, name, from, hint));
                let mut s = Sym::new(SymKind::Import, alias, region, line);
                s.io = true;
                self.bind(env, alias, s);
                continue;
            };
            match x {
                JsDecl::Type { .. } | JsDecl::Context { .. } => continue, // MO-12a: a JS context is named only by its declaration file's rows
                JsDecl::Value { .. } => {
                    // MO-8g: a value, read as any import, never io
                    let mut s = Sym::new(SymKind::Import, alias, region, line);
                    s.io = false;
                    s.rejects = Some(["Error".to_string()].into_iter().collect());
                    self.bind(env, alias, s);
                    continue;
                }
                JsDecl::Error { .. } => {
                    self.bind(env, alias, Sym::new(SymKind::ErrClass, alias, region, line));
                    continue;
                }
                JsDecl::Comp { .. } => {
                    bind_comp(self, x, alias);
                    continue;
                }
                JsDecl::Fn { pure: xpure, side: xside, rejects, params: xparams, refs, shape, instantiates, uses: xuses, provides: xprovides, nests: xnests, held: xheld, cbs: xcbs, renders: xrenders, carrier: xcarrier, under: xunder, drafts: xdrafts, part_drafts: xpart_drafts, ret: xret, draft_args: xdraft_args, .. } => {
                    if *instantiates {
                        // MO-10a: a primitive is an instantiation (RG-6)
                        if *pure && !xpure {
                            self.err("IMPORT_ROW_MISMATCH", "MO-8", format!("{} is declared io in {} (`export fn`, not `export pure fn`); `pure` on the import cannot lower it", name, file));
                        }
                        let mut s = Sym::new(SymKind::Fn, alias, region, line);
                        s.params = Some(xparams.iter().enumerate().map(|(i, n)| SigParam { name: n.clone(), r#ref: refs.get(i).copied().unwrap_or(false), ty: None }).collect());
                        s.instantiating = true;
                        s.foreign = Some(shape.clone());
                        s.rows = Some(RowsT::Fixed(IndexSet::new()));
                        s.fails_t = Some(FailsT::Fixed(IndexSet::new()));
                        s.rejects = Some(IndexSet::new());
                        s.needs = js_keys(self, xuses);
                        s.gives = js_keys(self, xprovides);
                        s.nests = xnests.clone();
                        s.renders = *xrenders;
                        s.carrier = *xcarrier;
                        s.under = xunder.clone();
                        s.drafts = xdrafts.clone();
                        s.part_drafts = xpart_drafts.clone();
                        s.held = xheld.clone();
                        s.cbs = xcbs.clone();
                        s.ret_ty = xret.clone();
                        self.bind(env, alias, s);
                        continue;
                    }
                    if *pure && !xpure {
                        self.err("IMPORT_ROW_MISMATCH", "MO-8", format!("{} is declared io in {} (`export fn`, not `export pure fn`); `pure` on the import cannot lower it", name, file));
                    }
                    if let Some(sd) = side {
                        if *xside != Some(*sd) {
                            self.err(
                                "IMPORT_ROW_MISMATCH",
                                "SF-5",
                                format!("{} is declared {} in {}; `{}` on the import cannot restate it", name, xside.map(|x| format!("`{}`", x.as_str())).unwrap_or_else(|| "for both sides".into()), file, sd.as_str()),
                            );
                        }
                    }
                    let mut s = Sym::new(SymKind::Import, alias, region, line);
                    s.io = !xpure;
                    s.disposer = xret.as_deref().and_then(|t| ty_undoes(t, &|n| decls.iter().find_map(|y| match y { JsDecl::Type { name, text, .. } if name == n => alias_text(text), _ => None })));
                    s.rejects = Some(rejects.clone().unwrap_or_else(|| vec!["Error".into()]).into_iter().collect());
                    s.side = *xside;
                    s.cbs = xcbs.clone();
                    s.drafts = xdrafts.clone();
                    s.draft_args = xdraft_args.clone();
                    s.part_drafts = xpart_drafts.clone();
                    s.pure_fn = *xpure;
                    s.generated = generated.clone();
                    self.bind(env, alias, s);
                }
            }
        }
    }

    /// MO-10b: an equation bound from a primitive's result, or from a part of it (`[a, b] = f(…)`, `x.k`): a `ref` part is
    /// a reader (it may hold, MO-10d), a function part is io (R-io-3), anything else is a value.
    fn foreign_part(&self, sym: &mut Sym<'a>, e: &Expr, env: EId) {
        // MO-10b, MO-10f: an alias of a result is the result — its shape, its fields' rows and draft parts
        if let ExprKind::Id(n) = &e.k {
            let Some(t) = self.lookup(env, n) else { return };
            let t = &self.syms[t];
            if t.foreign.is_none() && t.kind == SymKind::Props && !t.held.is_empty() {
                // MO-10f: another name for props whose fields hold or fail is those props
                sym.held = t.held.clone();
                sym.ret_ty = t.ret_ty.clone();
                return;
            }
            if t.foreign.is_none() || t.kind == SymKind::Comp {
                return;
            }
            sym.foreign = t.foreign.clone();
            if !t.held.is_empty() {
                sym.held = t.held.clone();
            }
            if !t.part_drafts.is_empty() {
                sym.part_drafts = t.part_drafts.clone();
            }
            sym.ret_ty = t.ret_ty.clone();
            sym.via_field |= t.via_field;
            sym.reader |= t.reader;
            if t.foreign == Some(FShape::Part(Part::Fn)) {
                sym.io = true;
            }
            return;
        }
        // MO-10i: a result's function parts that take drafts, and a part bound from them
        match &e.k {
            ExprKind::Call { f, .. } => {
                if let ExprKind::Id(n) = &f.k {
                    if let Some(t) = self.lookup(env, n) {
                        if !self.syms[t].part_drafts.is_empty() {
                            sym.part_drafts = self.syms[t].part_drafts.clone();
                        }
                    }
                }
            }
            ExprKind::Index { o, .. } | ExprKind::Member { o, .. } => {
                let key = match &e.k {
                    ExprKind::Member { p, .. } => Some(p.clone()),
                    ExprKind::Index { i, .. } => lit_key(i),
                    _ => None,
                };
                if let (Some(key), ExprKind::Id(on)) = (key, &o.k) {
                    if let Some(t) = self.lookup(env, on) {
                        if let Some((_, d)) = self.syms[t].part_drafts.iter().find(|(k, _)| *k == key) {
                            sym.drafts = d.clone();
                        }
                    }
                }
            }
            _ => {}
        }
        let shape: Option<FShape> = match &e.k {
            ExprKind::Call { f, .. } => match &f.k {
                ExprKind::Id(n) => self.lookup(env, n).and_then(|t| if self.syms[t].kind == SymKind::Fn { self.syms[t].foreign.clone() } else { None }),
                _ => None,
            },
            // `x["k"]` is `x.k`; `x[k]` may be any part, so it is the most changing of them (a reader, else io, else a value)
            ExprKind::Index { o, i, .. } => match &o.k {
                ExprKind::Id(on) => {
                    let key = lit_key(i);
                    let strongest = |ps: Vec<Part>| ps.iter().copied().find(|p| *p == Part::Ref).or_else(|| ps.iter().copied().find(|p| *p == Part::Fn)).or(ps.first().copied()).map(FShape::Part);
                    match (self.lookup(env, on).and_then(|t| self.syms[t].foreign.clone()), key) {
                        (Some(FShape::Items(items)), Some(k)) if matches!(&i.k, ExprKind::Lit(Lit::Num(_))) => k.parse::<usize>().ok().and_then(|n| items.get(n)).map(|p| FShape::Part(*p)),
                        (Some(FShape::Items(_)), Some(_)) => None,
                        (Some(FShape::Fields(fields)), Some(k)) => fields.iter().find(|f| f.0 == k).map(|f| FShape::Part(f.1)),
                        (Some(FShape::Items(items)), None) => strongest(items),
                        (Some(FShape::Fields(fields)), None) => strongest(fields.iter().map(|f| f.1).collect()),
                        _ => None,
                    }
                }
                _ => None,
            },
            ExprKind::Member { o, p, .. } => match &o.k {
                ExprKind::Id(on) => match self.lookup(env, on).and_then(|t| self.syms[t].foreign.clone()) {
                    Some(FShape::Fields(fields)) => fields.iter().find(|f| &f.0 == p).map(|f| FShape::Part(f.1)),
                    _ => None,
                },
                _ => None,
            },
            _ => None,
        };
        // MO-10f: a part of props whose fields hold or fail (`q = props.query`) keeps its fields' rows and its type
        if shape.is_none() {
            if let (ExprKind::Member { o, .. } | ExprKind::Index { o, .. }, Some((root, path))) = (&e.k, field_path(e)) {
                let _ = o;
                if let Some(t) = self.lookup(env, root).filter(|&t| self.syms[t].foreign.is_none() && !self.syms[t].held.is_empty()) {
                    if path.iter().all(|p| p.is_some()) {
                        let pre = format!("{}.", path.iter().flatten().cloned().collect::<Vec<_>>().join("."));
                        let sub: Vec<(String, bool, Vec<String>)> = self.syms[t].held.iter().filter_map(|h| h.0.strip_prefix(&pre).map(|r| (r.to_string(), h.1, h.2.clone()))).collect();
                        if !sub.is_empty() {
                            sym.held = sub;
                            let mut ty = self.syms[t].ret_ty.clone();
                            for seg in path.iter().flatten() {
                                ty = ty.and_then(|x| ty_step(&x, &TStep::Field(seg.clone())));
                            }
                            sym.ret_ty = ty;
                        }
                        if held_match(&self.syms[t].held, &path).is_some_and(|h| h.1) {
                            sym.reader = true;
                        }
                    }
                }
            }
        }
        let Some(shape) = shape else { return };
        if matches!(e.k, ExprKind::Member { .. }) || matches!(&e.k, ExprKind::Index { o, .. } if matches!(self.lookup_foreign(o, env), Some(FShape::Fields(_)))) {
            sym.via_field = true;
        }
        // MO-10f: its fields' rows come with it; a part bound from a field that holds reads as a reader (MO-10d)
        if let ExprKind::Call { f, .. } = &e.k {
            if let ExprKind::Id(n) = &f.k {
                if let Some(t) = self.lookup(env, n) {
                    sym.ret_ty = self.syms[t].ret_ty.clone(); // MO-10k: its declared type
                    if !self.syms[t].held.is_empty() {
                        sym.held = self.syms[t].held.clone();
                    }
                }
            }
        }
        if self.held_field(e, env).is_some_and(|h| h.1) {
            sym.reader = true;
        }
        // a record part keeps its fields' rows
        let part_key = match &e.k {
            ExprKind::Member { o, p, .. } => Some((o, Some(p.clone()))),
            ExprKind::Index { o, i, .. } => Some((o, lit_key(i))),
            _ => None,
        };
        if let Some((o, key)) = part_key {
            if let ExprKind::Id(on) = &o.k {
                if let Some(t) = self.lookup(env, on) {
                    // MO-10k: a named part's declared type
                    sym.ret_ty = key.as_ref().and_then(|k| self.syms[t].ret_ty.as_deref().and_then(|ty| ty_step(ty, &TStep::Field(k.clone()))));
                    // `x[k]`: the rows of whichever part it is — each suffix's, combined
                    let mut sub: Vec<(String, bool, Vec<String>)> = vec![];
                    for h in &self.syms[t].held {
                        let Some((first, rest)) = h.0.split_once('.') else { continue };
                        if key.as_deref().is_some_and(|k| k != first) {
                            continue;
                        }
                        match sub.iter_mut().find(|x| x.0 == rest) {
                            Some(x) => {
                                x.1 |= h.1;
                                for c in &h.2 {
                                    if !x.2.contains(c) {
                                        x.2.push(c.clone());
                                    }
                                }
                            }
                            None => sub.push((rest.to_string(), h.1, h.2.clone())),
                        }
                    }
                    if !sub.is_empty() {
                        sym.held = sub;
                    }
                }
            }
        }
        if shape == FShape::Part(Part::Fn) {
            sym.io = true;
        }
        if shape == FShape::Part(Part::Ref) {
            sym.reader = true;
        }
        sym.foreign = Some(shape);
    }
    /// MO-10g: closures passed where a declared JS fn takes a callback — their bodies are imperative scope, as a handler's.
    fn mark_callbacks(&mut self, args: &[Expr], s: SId) {
        let cbs = self.syms[s].cbs.clone();
        for (i, a) in args.iter().enumerate() {
            let Some(Some((whole, fields))) = cbs.get(i) else { continue };
            if *whole {
                if matches!(a.k, ExprKind::Fn { .. }) {
                    self.callback_fns.insert(a as *const Expr);
                }
            } else if let ExprKind::Rec(fs) = &a.k {
                for f in fs {
                    if let Field::Kv { key, v } = f {
                        if fields.contains(key) && matches!(v.k, ExprKind::Fn { .. }) {
                            self.callback_fns.insert(v as *const Expr);
                        }
                    }
                }
            }
        }
    }
    /// MO-10f: the declared rows of a field read, `x.data` where `x` was bound from a JS fn's result.
    /// `q["data"]` is `q.data`; `q[k]` may be any field at that depth, so it carries every one's rows (MO-10f).
    fn held_field(&self, e: &Expr, env: EId) -> Option<(String, bool, Vec<String>)> {
        // `q.result.data`: the path from the bound name
        let (on, path) = field_path(e)?;
        let t = self.lookup(env, on)?;
        held_match(&self.syms[t].held, &path)
    }
    fn lookup_foreign(&self, o: &Expr, env: EId) -> Option<FShape> {
        let ExprKind::Id(on) = &o.k else { return None };
        self.lookup(env, on).and_then(|t| self.syms[t].foreign.clone())
    }
    /// MO-10f: a field that fails, at any depth, read by `.` or `[…]`
    fn held_fails(&self, e: &Expr, env: EId, bound: &HashMap<String, IndexSet<String>>, out: &mut Fails) {
        let Some((rn, _)) = field_path(e) else { return };
        if bound.contains_key(rn) {
            return;
        }
        if let Some(h) = self.held_field(e, env) {
            out.cls.extend(h.2);
        }
    }
    /// MO-3: this module's signature — every export as an importer sees it.
    pub fn signature(&mut self, p: &'a Program) -> ModSig {
        let mut exports = IndexMap::new();
        let env = self.root_env.unwrap();
        let arr = |x: IndexSet<String>| -> Vec<String> { x.into_iter().collect() };
        for d in &p.decls {
            if !d.exported() {
                continue;
            }
            let Some(name) = d.name() else { continue };
            if let Decl::TypeDecl { .. } = d {
                exports.insert(name.to_string(), ExportSig::Type);
                continue;
            }
            let Some(&s) = self.envs[env].vars.get(name) else { continue };
            let x = match self.syms[s].kind {
                SymKind::Source => {
                    let rows = if self.syms[s].rows.is_some() { self.sym_rows(s) } else { IndexSet::new() };
                    let fails = if self.syms[s].fails_t.is_some() { self.sym_fails(s).cls } else { IndexSet::new() };
                    ExportSig::Source { question: self.syms[s].question, rows: arr(rows), fails: arr(fails) }
                }
                SymKind::Eq => {
                    let rows = if self.syms[s].rows.is_some() { self.sym_rows(s) } else { IndexSet::new() };
                    let fails = if self.syms[s].fails_t.is_some() { self.sym_fails(s).cls } else { IndexSet::new() };
                    ExportSig::Eq { rows: arr(rows), fails: arr(fails), io: self.syms[s].io }
                }
                SymKind::Fn => {
                    let rows = if self.syms[s].rows.is_some() { self.sym_rows(s) } else { IndexSet::new() };
                    let fails = if self.syms[s].fails_t.is_some() { self.sym_fails(s).cls } else { IndexSet::new() };
                    let rejects = match self.syms[s].fn_tail {
                        Some((t, te)) => self.rejects(t, te, &mut HashSet::new()),
                        None => self.syms[s].rejects.clone().unwrap_or_default(),
                    };
                    ExportSig::Fn { params: self.syms[s].params.clone().unwrap_or_default(), instantiating: self.syms[s].instantiating, rows: arr(rows), fails: arr(fails), rejects: arr(rejects) }
                }
                SymKind::Action => ExportSig::Action,
                SymKind::Server => {
                    let rejects = if self.syms[s].server_rejects.is_some() { self.sym_server_rejects(s) } else { IndexSet::new() };
                    ExportSig::Server { io: self.syms[s].io, params: self.syms[s].params.clone().unwrap_or_default().into_iter().map(|p| p.name).collect(), rejects: arr(rejects) }
                }
                SymKind::ErrClass => ExportSig::ErrClass { params: if let Decl::Error { params, .. } = d { params.clone() } else { vec![] } },
                SymKind::Comp => {
                    // MO-11j: a made component's summary is its wrapper's
                    let r = self.syms[s].exported_as.and_then(|w| self.syms[w].comp_region).or(self.syms[s].comp_region).unwrap();
                    let mut sig = self.comp_sig(r);
                    sig.made = self.syms[s].exported_as.is_some(); // a JS component
                    ExportSig::Comp { sig }
                }
                SymKind::Context => {
                    let c = self.syms[s].ctx.clone().unwrap();
                    let (rows, fails) = c.contract.clone().unwrap_or_default();
                    let ty = if let Decl::Context { ty, .. } = d { ty.as_ref().map(|t| ROW_WORDS.replace(t, "").to_string()) } else { None };
                    ExportSig::Context { key: c.key, source: c.source, dflt: c.dflt, rows: arr(rows), fails: arr(fails), ty }
                }
                _ => continue,
            };
            exports.insert(name.to_string(), x);
        }
        ModSig { file: self.opts.file.clone().unwrap_or_default(), exports }
    }

    fn cycles(&mut self, decls: &'a [Decl], env: EId) {
        let mut eqs: IndexMap<&str, (&'a Expr, i64)> = IndexMap::new();
        for d in decls {
            match d {
                Decl::Eq { name, e, line, .. } => {
                    eqs.insert(name, (e, *line as i64));
                }
                Decl::Source { name, init, line, question: true, .. } => {
                    eqs.insert(name, (init, *line as i64));
                }
                _ => {}
            }
        }
        let mut color: HashMap<String, u8> = HashMap::new();
        let mut reported: HashSet<String> = HashSet::new();
        let names: Vec<&str> = eqs.keys().copied().collect();
        for n in names {
            self.visit_cycle(n, &[], &eqs, env, &mut color, &mut reported);
        }
    }
    fn visit_cycle(&mut self, n: &str, stack: &[String], eqs: &IndexMap<&str, (&'a Expr, i64)>, env: EId, color: &mut HashMap<String, u8>, reported: &mut HashSet<String>) {
        if color.get(n) == Some(&2) {
            return;
        }
        if color.get(n) == Some(&1) {
            let at = stack.iter().position(|s| s == n).map(|i| i as i64).unwrap_or(-1);
            let from = if at < 0 { stack.len().saturating_sub(1) } else { at as usize };
            let mut cyc: Vec<String> = stack[from..].to_vec();
            cyc.push(n.to_string());
            let mut sorted = cyc.clone();
            sorted.sort();
            let key = sorted.join(",");
            if reported.insert(key) {
                self.line = eqs[n].1;
                self.err("CYCLE", "C-1", format!("instantaneous cycle: {} (break it with `pre`, C-2)", cyc.join(" → ")));
            }
            return;
        }
        color.insert(n.to_string(), 1);
        let names = names_of(eqs[n].0);
        let region = self.reg(env);
        for m0 in names {
            if m0 == format!("pre:{}", n) {
                continue;
            }
            let m = strip_pre(&m0);
            if eqs.contains_key(m) && self.envs[env].vars.get(m).is_some_and(|&s| self.syms[s].region == region) {
                let mut st = stack.to_vec();
                st.push(n.to_string());
                self.visit_cycle(m, &st, eqs, env, color, reported);
            }
        }
        color.insert(n.to_string(), 2);
    }

    // ---- rows (R-13) ----
    fn sym_rows(&mut self, s: SId) -> IndexSet<String> {
        let (e, env) = match &mut self.syms[s].rows {
            None => return IndexSet::new(),
            Some(RowsT::Fixed(x)) => return x.clone(),
            Some(RowsT::Expr { cache: Some(c), .. }) => return c.clone(),
            Some(RowsT::Expr { busy: true, .. }) => return IndexSet::new(),
            Some(RowsT::Expr { e, env, busy, .. }) => {
                *busy = true;
                (*e, *env)
            }
        };
        let rows = self.rows_of(e, env);
        if let Some(RowsT::Expr { e: e2, cache, busy, .. }) = &mut self.syms[s].rows {
            if std::ptr::eq(*e2, e) {
                *busy = false;
                *cache = Some(rows.clone());
            }
        }
        rows
    }
    /// A fresh rows thunk over `e`, evaluated once (`this.rowsThunk(e, env)()`).
    fn rows_of(&mut self, e: &'a Expr, env: EId) -> IndexSet<String> {
        let mut rows = IndexSet::new();
        self.rows_walk(Node::E(e), env, &mut rows);
        rows
    }
    fn rows_walk(&mut self, x: Node<'a>, env: EId, rows: &mut IndexSet<String>) {
        if let Node::E(e) = x {
            match &e.k {
                ExprKind::Await { e: inner, init, .. } => {
                    rows.insert("pending".into());
                    if init.is_none() && self.client_call(inner, env) {
                        rows.insert("client".into());
                    }
                }
                ExprKind::Latest(_) | ExprKind::Pending(_) => {
                    rows.insert("lane".into());
                }
                ExprKind::Member { .. } | ExprKind::Index { .. } if self.held_field(e, env).is_some_and(|h| h.1) => {
                    rows.insert("pending".into()); // MO-10f: a field that holds
                }
                ExprKind::Fn { .. } | ExprKind::ServerFn { .. } => return,
                ExprKind::Use(name) => {
                    let Some(c) = self.lookup(env, name).and_then(|s| self.syms[s].ctx.clone()) else { return };
                    if let Some((r, _)) = &c.contract {
                        rows.extend(r.iter().cloned());
                        return;
                    }
                    let mut i = 0;
                    while i < self.provisions.len() {
                        let (pk, pe, penv) = (self.provisions[i].key.clone(), self.provisions[i].e, self.provisions[i].env);
                        if pk == c.key && !self.rows_busy.contains(&c.key) {
                            self.rows_busy.insert(c.key.clone());
                            let r = self.rows_of(pe, penv);
                            rows.extend(r);
                            self.rows_busy.remove(&c.key);
                        }
                        i += 1;
                    }
                    return;
                }
                ExprKind::Id(n) => {
                    if let Some(s) = self.lookup(env, n) {
                        if self.syms[s].rows.is_some() {
                            let r = self.sym_rows(s);
                            rows.extend(r);
                        }
                    }
                    return;
                }
                _ => {}
            }
        }
        for c in children(x, false) {
            self.rows_walk(c, env, rows);
        }
    }

    /// SF-5b: a call into `client` JS.
    fn client_call(&self, e: &Expr, env: EId) -> bool {
        let f = if let ExprKind::Catch { e, .. } = &e.k { &**e } else { e };
        match &f.k {
            ExprKind::Call { f, .. } => match &f.k {
                ExprKind::Id(n) => self.lookup(env, n).is_some_and(|s| self.syms[s].side == Some(Side::Client)),
                _ => false,
            },
            _ => false,
        }
    }

    fn decl(&mut self, d: &'a Decl, env: EId, ctx: Ctx) {
        let reactive = Ctx { in_fn: ctx.in_fn, ..Ctx::reactive() };
        // ST-4d (2026-11-22): the rows of a keyed list written out with two alike keys
        if let Decl::Source { name, init: e, key: Some(k), .. } | Decl::Eq { name, e, key: Some(k), .. } = d {
            if let Some(v) = duplicate_key(e, k) {
                self.err("DUPLICATE_KEY", "ST-4d", format!("{name} is keyed by {k}, and two of the rows written here have {k}: {v} — a key names one row: rows with one key share one identity, so one's state shows for both, or one is dropped. Give each row its own {k}"));
            }
        }
        match d {
            Decl::Import { fails, .. } => {
                if let Some(f) = fails {
                    for n in f {
                        self.err_class(n, env);
                    }
                }
            }
            Decl::TypeDecl { .. } => {}
            Decl::Error { params, msg, line, .. } => {
                if let Some(m) = msg {
                    let region = self.reg(env);
                    let inner = self.env(Some(env), region);
                    for p in params {
                        self.set_value(inner, p, *line as i64);
                    }
                    self.expr(m, inner, Ctx { in_fn: true, ..Ctx::reactive() }, None);
                }
            }
            Decl::Source { name, init, question, ty, .. } => {
                self.sink(init, env, format!("written to {name}"));
                if d.exported() {
                    self.sinks.push(Sink { e: None, names: vec![name.clone()], env, line: self.line, why: "exported, for importers to render elsewhere".into(), prop: None });
                }
                if *question {
                    self.comp("question", env, Some(name.clone()), None, |c| c.expr(init, env, reactive, None));
                    self.row_check(name, ty.as_deref(), env);
                    return;
                }
                let mut reads = IndexSet::new();
                reads_outside_peek(Node::E(init), &mut reads);
                let hit = reads.iter().find(|n| self.lookup(env, n).is_some_and(|s| self.syms[s].kind.reactive())).cloned();
                if let Some(h) = hit {
                    self.err("SNAPSHOT_INITIALIZER", "E-4", format!("source {} := … reads {} outside peek(…): write the snapshot as one (DV-6)", name, h));
                }
                let c2 = Ctx { in_fn: ctx.in_fn, ..Ctx::reactive() };
                self.comp("seed", env, Some(name.clone()), None, |c| {
                    c.model.snap += 1;
                    c.expr(init, env, c2, None);
                });
            }
            Decl::Eq { name, e, deferred, key, ty, .. } => {
                if let Some(&made) = self.envs[env].vars.get(name.as_str()) {
                    // MO-11o: its component values are values, applied where a prop renders them
                    if let Some((args, cenv)) = self.syms[made].carried {
                        let by = match &e.k {
                            ExprKind::Call { f, .. } => match &f.k {
                                ExprKind::Id(n) => n.clone(),
                                _ => String::new(),
                            },
                            _ => String::new(),
                        };
                        let mut names = vec![];
                        let before = self.carried_pending.len();
                        self.carried_values(args, cenv, true, &mut names);
                        for p in &mut self.carried_pending[before..] {
                            p.3 = by.clone();
                        }
                    }
                    if self.syms[made].factory.is_some() {
                        self.factory_values(made);
                        // the call runs once, here: its failures and holds are a reader's
                        self.readers.push(ReaderRec { region: self.reg(env), e, env, line: self.line });
                        if self.syms[made].renders {
                            // MO-11l: applied where it is bound
                            let trees = self.factory_tree(made);
                            let at = env;
                            for t in trees {
                                self.apply_tree(&t, Some(d.line()), at);
                            }
                        } else if d.exported() {
                            self.export_made(made, name, d.line() as i64);
                        }
                    }
                }
                // MO-11l: an export is a way out — its importers would render it under their own boundaries
                if d.exported() {
                    self.sinks.push(Sink { e: None, names: vec![name.clone()], env, line: self.line, why: "exported, for importers to render elsewhere".into(), prop: None });
                    // MO-10f: a signature carries an equation's rows, not its fields': an importer's `x.data` would be unseen
                    if let Some(h) = self.envs[env].vars.get(name.as_str()).and_then(|&t| self.syms[t].held.first().cloned()) {
                        self.err("RESULT_AS_VALUE", "MO-10f", format!("{name} is a JS result whose fields hold or fail where each is read ({name}.{}), and a module's signature says nothing of a value's fields: export the field, `export {} = {name}.{}`, which carries its rows", h.0, h.0.rsplit('.').next().unwrap_or(""), h.0));
                    }
                }
                // MO-10f, MO-10i: an equation may give a result another name (`q = orig`, `r = q.result`)
                if matches!(e.k, ExprKind::Id(_) | ExprKind::Member { .. } | ExprKind::Index { .. }) {
                    self.whole_ok.insert(e as *const Expr);
                }
                // MO-10i (2026-11-22): a closure bound here and given only to what hands it a draft is that callback
                if let Some(ps) = self.updater_positions(name, e, env) {
                    if let Some(&made) = self.envs[env].vars.get(name.as_str()) {
                        self.syms[made].updater = Some(ps);
                    }
                    if d.exported() {
                        self.err("DRAFT_ESCAPES", "MO-10i", format!("{name} is a draft callback: it is used only where it is given to the function that hands it a draft, in this module — an importer would call it with something that is no draft; export an action that calls the setter"));
                    }
                }
                let kind = if *deferred {
                    "deferred"
                } else if key.is_some() {
                    "keyed"
                } else {
                    "memo"
                };
                if let ExprKind::Call { f, args, .. } = &e.k {
                    if let ExprKind::Id(fname) = &f.k {
                        if let Some(fs) = self.lookup(env, fname) {
                            if self.syms[fs].kind == SymKind::Fn && self.syms[fs].instantiating {
                                self.call_marks(f, args, env);
                                self.mark_callbacks(args, fs);
                                if self.unplaced_fn(fs) {
                                    self.unplaced(args, env); // MO-11s
                                }
                                self.snapshot_args(e, fs, env);
                                // MO-12b: a hook reads its context where it is called
                                let region = self.reg(env);
                                for k in self.syms[fs].needs.clone() {
                                    self.uses.push(UseRec { region, name: k, line: self.line, display: format!("{}()", fname) });
                                }
                                let params = self.syms[fs].params.clone().unwrap_or_default();
                                for (i, a) in args.iter().enumerate() {
                                    if params.get(i).is_some_and(|p| p.r#ref) {
                                        self.keep(a, env); // E-5a: a ref argument is kept
                                    }
                                }
                                self.comp(kind, env, Some(name.clone()), None, |c| {
                                    c.model.call(Some(fs), "fn");
                                    for (i, a) in args.iter().enumerate() {
                                        let value = params.get(i).is_some_and(|p| !p.r#ref);
                                        if value {
                                            c.model.snap += 1;
                                        }
                                        c.expr(a, env, reactive, None);
                                        if value {
                                            c.model.snap -= 1;
                                        }
                                    }
                                });
                                self.row_check(name, ty.as_deref(), env);
                                return;
                            }
                        }
                    }
                }
                self.comp(kind, env, Some(name.clone()), None, |c| c.expr(e, env, reactive, None));
                self.keep(e, env);
                self.row_check(name, ty.as_deref(), env);
            }
            Decl::Provide { name, e, .. } => {
                self.sink(e, env, format!("provided as {name}, for the components below to render"));
                self.comp("provide", env, Some(name.clone()), None, |c| c.expr(e, env, reactive, None));
                self.keep(e, env);
                let Some(c) = self.ctx_of(name, env) else { return };
                let info = self.syms[c].ctx.clone().unwrap();
                let region = self.reg(env);
                self.regions[region].provides.insert(info.key.clone());
                self.provisions.push(Provision { key: info.key.clone(), e, env });
                if let Some(contract) = info.contract {
                    let line = self.line;
                    self.later.push(Later::Provide { name: name.clone(), e, env, line, contract });
                }
            }
            Decl::Context { name, dflt, .. } => {
                if let Some(dflt) = dflt {
                    self.comp("default", env, Some(name.clone()), None, |c| c.expr(dflt, env, reactive, None));
                    self.keep(dflt, env);
                }
            }
            Decl::Effect { inputs, body, line, .. } => {
                for i in inputs {
                    self.effect_ins.push(ReaderRec { region: self.reg(env), e: i, env, line: *line as i64 });
                }
                self.comp("effect", env, None, None, |c| {
                    for i in inputs {
                        c.expr(i, env, reactive, None);
                    }
                    c.comp("apply", env, None, None, |c| {
                        let region = c.reg(env);
                        let inner = c.env(Some(env), region);
                        // MO-10k: `$n` is the value of the n-th input
                        for (n, i) in inputs.iter().enumerate() {
                            let mut v = Sym::new(SymKind::Value, &format!("${n}"), region, c.line);
                            v.srcs.push((i, env));
                            let v = c.new_sym(v);
                            c.envs[inner].vars.insert(format!("${n}"), v);
                        }
                        c.stmts(body, inner, Ctx::imperative());
                    });
                    c.run_checks(body, false, &[], false);
                });
                let own = self.own_source_writes(inputs, body, env);
                self.relay_writes(inputs, body, env, &own);
            }
            Decl::Action { name, params, ptypes, body, line, .. } => {
                let region = self.reg(env);
                let inner = self.env(Some(env), region);
                let me = self.lookup(env, name);
                for p in params {
                    self.set_value(inner, p, *line as i64);
                    let ps = self.envs[inner].vars[p.as_str()];
                    self.syms[ps].param_of = me; // MO-10k
                }
                if d.exported() {
                    self.sinks.push(Sink { e: None, names: vec![name.clone()], env, line: self.line, why: "what an exported action returns, for importers to render elsewhere".into(), prop: None });
                }
                self.comp("action", env, Some(name.clone()), None, |c| c.stmts(body, inner, Ctx { in_action: true, ..Ctx::imperative() }));
                self.actions.push(ActionRec { name: name.clone(), body, env: inner, line: *line as i64 });
                let ptypes: Vec<Option<String>> = ptypes.iter().map(|t| t.as_ref().map(|t| if self.scalar_aliases.contains(t.trim()) { "string".to_string() } else { t.clone() })).collect();
                self.run_checks_with(body, true, params, false, ptypes, Some(inner));
            }
            Decl::Server { name, params, body, line, .. } => {
                let region = self.reg(env);
                let inner = self.env(Some(env), region);
                for p in params {
                    self.set_value(inner, p, *line as i64);
                }
                self.comp("server", env, Some(name.clone()), None, |c| c.stmts(body, inner, Ctx { server: true, ..Ctx::imperative() }));
                let s = self.lookup(env, name).unwrap();
                self.syms[s].server_rejects = Some(ServerRejects::Body { body, env: inner, cache: None });
            }
            Decl::Fn { name, params, decls, tail, line, .. } => {
                let region = self.reg(env);
                let r = if !decls.is_empty() { self.region(Some(region), "fn", false, Some(name.clone())) } else { region };
                let inner = self.env(Some(env), r);
                let me = self.lookup(env, name);
                for p in params {
                    if p.r#ref {
                        let mut s = Sym::new(SymKind::Eq, &p.name, r, *line as i64);
                        s.param = true;
                        s.param_of = me; // MO-10k
                        self.bind(inner, &p.name, s);
                    } else {
                        let mut s = Sym::new(SymKind::Value, &p.name, r, *line as i64);
                        s.param = true;
                        s.param_of = me;
                        let s = self.new_sym(s);
                        self.envs[inner].vars.insert(p.name.clone(), s);
                    }
                }
                if d.exported() {
                    self.sinks.push(Sink { e: None, names: vec![name.clone()], env, line: self.line, why: "what an exported fn gives, for importers to render elsewhere".into(), prop: None });
                }
                self.comp("fn", env, Some(name.clone()), None, |c| {
                    c.block(decls, &[], inner, Ctx { in_fn: true, ..Ctx::reactive() });
                    c.expr(tail, inner, Ctx { in_fn: true, ..Ctx::reactive() }, None);
                });
                let s = self.lookup(env, name).unwrap();
                let sym = &mut self.syms[s];
                sym.fn_tail = Some((tail, inner));
                sym.fails_t = Some(FailsT::Expr { e: tail, env: inner, cache: None, busy: false });
                sym.rows = Some(RowsT::Expr { e: tail, env: inner, cache: None, busy: false });
            }
            Decl::Component { name, props, decls, view, line, no_props, props_type, .. } => {
                let s = self.lookup(env, name).unwrap();
                let r = self.syms[s].comp_region.unwrap();
                let inner = self.env(Some(env), r);
                let mut ps = Sym::new(SymKind::Props, props, r, *line as i64);
                if let Some(t) = props_type {
                    self.props_ty.insert(r, field_rows(t).0);
                }
                // MO-10f (2026-11-22): a prop whose type is a record with field rows (`query: { data: pending fails(Error)
                // T }`) is read as a JS result with those fields is: a field at a time, each held field's read checked
                if let Some(held) = self.prop_held.get(&r).cloned() {
                    ps.held = held;
                    ps.ret_ty = props_type.as_deref().map(|t| field_rows(t).0);
                }
                if *no_props {
                    ps.no_props = Some(name.clone());
                }
                self.bind(inner, props, ps);
                self.syms[s].comp_env = Some(inner);
                self.block(decls, view, inner, Ctx::reactive());
                self.later.push(Later::Content { ms: view, env: inner, anc: vec![] });
            }
        }
    }

    /// C-3 (ruled 2026-10-23): an apply block's own statements may not write a source its compute half reads.
    fn own_source_writes(&mut self, inputs: &'a [Expr], body: &'a [Stmt], env: EId) -> HashSet<SId> {
        let mut read: IndexMap<SId, String> = IndexMap::new();
        let mut seen: HashSet<SId> = HashSet::new();
        for i in inputs {
            self.osw_visit(i, env, "", &mut read, &mut seen);
        }
        self.osw_direct(body, env, &read);
        read.keys().copied().collect()
    }
    fn osw_visit(&self, e: &Expr, scope: EId, via: &str, read: &mut IndexMap<SId, String>, seen: &mut HashSet<SId>) {
        for n0 in names_of(e) {
            let Some(s) = self.lookup(scope, strip_pre(&n0)) else { continue };
            if !seen.insert(s) {
                continue;
            }
            let path = if via.is_empty() { self.syms[s].name.clone() } else { format!("{} → {}", via, self.syms[s].name) };
            if self.syms[s].kind == SymKind::Source && !read.contains_key(&s) {
                read.insert(s, path.clone());
            }
            if let Some((x, xe)) = self.syms[s].expr {
                self.osw_visit(x, xe, &path, read, seen);
            }
        }
    }
    fn osw_direct(&mut self, ss: &'a [Stmt], env: EId, read: &IndexMap<SId, String>) {
        for st in ss {
            match &st.k {
                StmtKind::Write { target, .. } | StmtKind::Optimistic { target, .. } if !target.is_ctx() => {
                    if let Some(t) = self.lookup(env, &target.name) {
                        if let Some(path) = read.get(&t) {
                            let n = self.syms[t].name.clone();
                            self.err(
                                "EFFECT_WRITES_OWN_SOURCE",
                                "C-3",
                                format!(
                                    "the apply block writes {}, which its compute half reads ({}): a loop across instants — derive it as an equation, or as `source {} = …` (ST-5), or write it from the event that changes the inputs",
                                    n, path, n
                                ),
                            );
                        }
                    }
                }
                StmtKind::Sif { t, f, .. } => {
                    self.osw_direct(t, env, read);
                    self.osw_direct(f, env, read);
                }
                StmtKind::For { body, .. } => self.osw_direct(body, env, read),
                StmtKind::Try { body, handler, fin, .. } => {
                    self.osw_direct(body, env, read);
                    if let Some(h) = handler {
                        self.osw_direct(h, env, read);
                    }
                    if let Some(f) = fin {
                        self.osw_direct(f, env, read);
                    }
                }
                StmtKind::Action(body) => self.osw_direct(body, env, read),
                _ => {}
            }
        }
    }

    /// C-3a (2026-11-22): state derived through an effect. An apply block's own write of a source declared beside the
    /// effect (in its block), with a value or a path computed from reactive values — the effect's inputs (`$n`, or an
    /// input read by its name), another source, an equation, a prop — is `EFFECT_RELAY_TEAR`: it is an equation written
    /// the long way, a frame late where the effect names what it reads, and never again where it does not. What is not
    /// derived stays an apply's to write: a constant, the target's own value, what an io call answers (a measurement, a
    /// JS module's state), a reading under `peek(…)`, and every write of a closure the apply creates (a later event).
    /// The same walk gives the advice `SNAPSHOT_IN_EFFECT` (99): an apply's own statement reads a changing value its
    /// effect does not take as an input.
    fn relay_writes(&mut self, inputs: &'a [Expr], body: &'a [Stmt], env: EId, own: &HashSet<SId>) {
        let mut ins: IndexSet<String> = IndexSet::new();
        for i in inputs {
            free_names(i, &HashSet::new(), &mut ins);
        }
        let line0 = self.line;
        let mut advised = false;
        self.relay_walk(inputs, &ins, own, body, env, &HashSet::new(), &HashSet::new(), &mut advised);
        self.line = line0;
    }
    fn relay_reactive(&mut self, s: Option<SId>) -> bool {
        match s {
            Some(s) => matches!(self.syms[s].kind, SymKind::Source | SymKind::Eq | SymKind::Props) && !self.constant_eq(s),
            None => false,
        }
    }
    /// The reactive values `e` is computed from; none when it is not derived (or what it reads came from io).
    fn relay_from(&mut self, e: &Expr, target: Option<SId>, env: EId, locals: &HashSet<String>, derived: &HashSet<String>) -> Vec<String> {
        let (mut names, mut callees) = (IndexSet::new(), IndexSet::new());
        write_reads(e, &HashSet::new(), &mut names, &mut callees);
        for c in &callees {
            if locals.contains(c) {
                continue;
            }
            if let Some(f) = self.lookup(env, c) {
                let k = self.syms[f].kind;
                if (k == SymKind::Import && self.syms[f].io) || k == SymKind::Action || k == SymKind::Server {
                    return vec![];
                }
            }
        }
        let mut out = vec![];
        for n in names {
            if is_effect_param(&n) {
                out.push(n);
                continue;
            }
            if locals.contains(&n) {
                if derived.contains(&n) {
                    out.push(n);
                }
                continue;
            }
            let r = self.lookup(env, &n);
            if r != target && self.relay_reactive(r) {
                out.push(n);
            }
        }
        out
    }
    /// 99, advice: a changing value read by the apply's own statement, which the effect does not take as an input.
    fn relay_snapshot(&mut self, e: &Expr, inputs: &[Expr], ins: &IndexSet<String>, env: EId, locals: &HashSet<String>, advised: &mut bool) {
        if *advised {
            return;
        }
        let (mut names, mut callees) = (IndexSet::new(), IndexSet::new());
        write_reads(e, &HashSet::new(), &mut names, &mut callees);
        let mut hit = None;
        for x in names {
            if !locals.contains(&x) && !ins.contains(&x) {
                let r = self.lookup(env, &x);
                if self.relay_reactive(r) {
                    hit = Some(x);
                    break;
                }
            }
        }
        let Some(n) = hit else { return };
        *advised = true;
        let mut named: Vec<String> = inputs.iter().map(show).collect();
        named.push(n.clone());
        let msg = format!(
            "the apply block reads {n}, which is not one of the effect's inputs: the block runs {}, and sees {n} as it was then — it is not run again when {n} changes. Name it as an input (`effect ({}) {{ … }}`, read as `${}`) to run when it changes; where a reading taken once is meant, say so: `peek({n})`",
            if inputs.is_empty() { "once, when the effect is declared (it has no inputs)" } else { "when its inputs change" },
            named.join(", "),
            inputs.len(),
        );
        self.advice.push(Diagnostic { code: "SNAPSHOT_IN_EFFECT".into(), rule: "EF-1".into(), line: self.line, msg, file: self.opts.file.clone() });
    }
    #[allow(clippy::too_many_arguments)]
    fn relay_walk(&mut self, inputs: &'a [Expr], ins: &IndexSet<String>, own: &HashSet<SId>, ss: &'a [Stmt], env: EId, locals0: &HashSet<String>, derived0: &HashSet<String>, advised: &mut bool) {
        let (mut locals, mut derived) = (locals0.clone(), derived0.clone());
        for st in ss {
            self.line = st.line as i64;
            match &st.k {
                StmtKind::Let { name, e, .. } => {
                    locals.insert(name.clone());
                    if !self.relay_from(e, None, env, &locals, &derived).is_empty() {
                        derived.insert(name.clone());
                    } else {
                        derived.remove(name);
                        self.relay_snapshot(e, inputs, ins, env, &locals, advised);
                    }
                }
                StmtKind::Write { target, e } => {
                    if target.is_ctx() || locals.contains(&target.name) {
                        continue;
                    }
                    let Some(t) = self.lookup(env, &target.name) else { continue };
                    // the state and the effect side by side: a source of an outer block has other writers (each instance
                    // of a component registers with it, or reports to it), and no equation written here could stand for it
                    // own: C-3 has refused it already
                    if self.syms[t].kind != SymKind::Source || self.syms[t].region != self.reg(env) || own.contains(&t) {
                        continue;
                    }
                    let mut names: IndexSet<String> = IndexSet::new();
                    for p in &target.path {
                        if let PathSeg::Expr(x) = p {
                            names.extend(self.relay_from(x, Some(t), env, &locals, &derived));
                        }
                    }
                    names.extend(self.relay_from(e, Some(t), env, &locals, &derived));
                    if names.is_empty() {
                        continue;
                    }
                    let tn = self.syms[t].name.clone();
                    let stale = names.iter().find(|n| !is_effect_param(n) && !locals.contains(*n) && !ins.contains(*n)).cloned();
                    let fix = format!(
                        "write the equation, `{tn} = …` (or `source {tn} = …`, ST-5, if it is also written by hand; `pre {tn}` for a value built on its last one), or write {tn} from the event that changes what it is computed from; a reading taken once on purpose — a measurement of the page as it is now — says so: `peek(…)`"
                    );
                    let msg = match stale {
                        Some(n) => format!(
                            "the apply block writes {tn} from {n}, which is not one of the effect's inputs: the block runs {}, so {tn} is computed from {n} as it was then and never follows it — {fix}",
                            if inputs.is_empty() { "once, when the effect is declared (it has no inputs)" } else { "when its inputs change" }
                        ),
                        None => format!(
                            "the apply block writes {tn} from what the effect fired for ({}): state derived through an effect is one instant late — the frame in between shows the new value beside the old {tn}, and the server, which runs no apply block, never computes it — {fix}",
                            names.iter().cloned().collect::<Vec<_>>().join(", ")
                        ),
                    };
                    self.err("EFFECT_RELAY_TEAR", "C-3a", msg);
                }
                StmtKind::Expr(e) | StmtKind::Throw(e) => self.relay_snapshot(e, inputs, ins, env, &locals, advised),
                StmtKind::Return(e) => {
                    if let Some(e) = e {
                        self.relay_snapshot(e, inputs, ins, env, &locals, advised);
                    }
                }
                StmtKind::Sif { c, t, f } => {
                    self.relay_snapshot(c, inputs, ins, env, &locals, advised);
                    self.relay_walk(inputs, ins, own, t, env, &locals, &derived, advised);
                    self.relay_walk(inputs, ins, own, f, env, &locals, &derived, advised);
                }
                StmtKind::For { name, e, body } => {
                    let (mut l, mut dv) = (locals.clone(), derived.clone());
                    l.insert(name.clone());
                    if !self.relay_from(e, None, env, &locals, &derived).is_empty() {
                        dv.insert(name.clone());
                    } else {
                        dv.remove(name);
                        self.relay_snapshot(e, inputs, ins, env, &locals, advised);
                    }
                    self.relay_walk(inputs, ins, own, body, env, &l, &dv, advised);
                }
                StmtKind::Try { body, catch_name, handler, fin, .. } => {
                    self.relay_walk(inputs, ins, own, body, env, &locals, &derived, advised);
                    if let Some(h) = handler {
                        let mut l = locals.clone();
                        if let Some(n) = catch_name {
                            l.insert(n.clone());
                        }
                        self.relay_walk(inputs, ins, own, h, env, &l, &derived, advised);
                    }
                    if let Some(f) = fin {
                        self.relay_walk(inputs, ins, own, f, env, &locals, &derived, advised);
                    }
                }
                StmtKind::Action(body) => self.relay_walk(inputs, ins, own, body, env, &locals, &derived, advised),
                _ => {}
            }
        }
    }

    /// E-10: a reactive argument for a value parameter of an instantiating fn is snapshotted.
    /// E-10: an equation that never changes — it awaits nothing, reads no context, and every name it reads is a pure import,
    /// a component, an error class or such an equation (`schema = object({ email: string() })`).
    fn constant_eq(&mut self, s: SId) -> bool {
        if self.syms[s].kind != SymKind::Eq {
            return false;
        }
        let Some((e, env)) = self.syms[s].carried_expr else { return false };
        if let Some(m) = self.const_eqs.get(&s) {
            return *m == Some(true); // None: being decided (a cycle is not constant)
        }
        self.const_eqs.insert(s, None);
        let text = e.to_json().to_string();
        let mut ok = !["\"k\":\"await\"", "\"k\":\"latest\"", "\"k\":\"use\"", "\"k\":\"pre\""].iter().any(|k| text.contains(k));
        // RFC 14: a field read of an instance tracks (MO-10b), so an equation that reads one, or is bound to one, changes
        if ok && self.syms[s].via_field {
            ok = false;
        }
        if ok {
            let mut rooted = IndexSet::new();
            rooted_reads(e, &mut rooted);
            if rooted.iter().any(|n| self.lookup(env, n).is_some_and(|t| self.syms[t].foreign.is_some())) {
                ok = false;
            }
        }
        if ok {
            let mut reads = IndexSet::new();
            reads_outside_peek(Node::E(e), &mut reads);
            let mut ts: Vec<SId> = reads.iter().filter_map(|n| self.lookup(env, n)).collect();
            // a closure the equation calls reads what its body reads
            ts.extend(self.called_reads(e, env).into_iter().map(|(_, t)| t));
            for t in ts {
                // an .rx fn may read a source: not constant
                let fixed = (self.syms[t].kind == SymKind::Import && !self.syms[t].io) || matches!(self.syms[t].kind, SymKind::Comp | SymKind::ErrClass);
                if !fixed && !self.constant_eq(t) {
                    ok = false;
                    break;
                }
            }
        }
        // E-10 (ruled 2026-11-22): a read through a value that may be an instance
        if ok && self.instance_read(e, env, false).is_some() {
            ok = false;
        }
        self.const_eqs.insert(s, Some(ok));
        ok
    }
    /// E-10, E-5a (ruled 2026-11-22; a closure held in a value, 2026-11-22): the closures a call may call, where the
    /// checker can see them. One written at the call, or the one its callee's name is bound to, is that closure. A callee
    /// read out of a value — `box.read()`, `fs[0]()`, `mk()()` — is the closure in that slot when the value is a literal
    /// the checker can read the slot of (`static_part`: a record's field, an array's index, through the equations and
    /// locals that name it); otherwise it may be any closure the value holds, by mention (`held_closures`). Calling one
    /// reads what its body reads.
    fn called_closures(&self, call: &'a Expr, env: EId) -> Vec<(&'a Expr, EId)> {
        let ExprKind::Call { f, .. } = &call.k else { return vec![] };
        match &f.k {
            ExprKind::Fn { .. } => vec![(&**f, env)],
            ExprKind::Id(n) => {
                let Some(s) = self.lookup(env, n) else { return vec![] };
                let Some((v, venv)) = self.syms[s].val else { return vec![] };
                if matches!(v.k, ExprKind::Fn { .. }) {
                    return vec![(v, venv)];
                }
                self.closures_of(v, venv)
            }
            _ => self.closures_of(f, env),
        }
    }
    /// The closures a callee read out of a value may be. A method of a JS value — an import, the instance a declared
    /// primitive made — is JS's: what it calls is its declaration's to say (CN-3b), and what it answers is the instance
    /// rule's (E-10: a method its declaration does not name may change).
    fn closures_of(&self, f: &'a Expr, env: EId) -> Vec<(&'a Expr, EId)> {
        let js = path_root(f).and_then(|n| self.lookup(env, n)).is_some_and(|t| matches!(self.syms[t].kind, SymKind::Import | SymKind::ErrClass) || self.syms[t].foreign.is_some());
        if js {
            return vec![];
        }
        let (x, xenv) = self.static_part(f, env, 0);
        if matches!(x.k, ExprKind::Fn { .. }) {
            return vec![(x, xenv)];
        }
        let mut out = vec![];
        self.held_closures(f, env, &mut HashSet::new(), &mut out);
        out
    }
    /// E-10, E-5a (2026-11-22, a closure given to a closure): a closure the checker can see, called with arguments,
    /// may call what they hold: `pick = (o) => o.total(); pick(fmt)` calls the closure in `fmt.total`, `apply = (g) =>
    /// g(); apply(total)` calls `total`. For each parameter the closure's body calls through (`param_uses`): the
    /// closure in that slot of the argument where what is written says which (`static_part`), else any closure the
    /// argument holds, by mention; and any closure the argument holds when the parameter is handed on or kept. What
    /// such a call is given (`g(fmt)`, in the callee's scope) may be called in turn by the closure it reaches.
    fn arg_closures(&self, call: &'a Expr, env: EId) -> Vec<(&'a Expr, EId)> {
        let ExprKind::Call { args, .. } = &call.k else { return vec![] };
        let mut out: Vec<(&'a Expr, EId)> = vec![];
        let spread = args.iter().any(|a| matches!(a.k, ExprKind::Spread(_)));
        for (c, cenv) in self.called_closures(call, env) {
            let ExprKind::Fn { params, .. } = &c.k else { continue };
            for (i, p) in params.iter().enumerate() {
                let mut u = ParamUses::default();
                for k in children(Node::E(c), false) {
                    // an expression body is what the closure answers
                    param_uses(k, p, matches!(k, Node::E(_)) && matches!(&c.k, ExprKind::Fn { stmts: None, .. }), false, &mut u);
                }
                if !u.any && u.callees.is_empty() {
                    continue;
                }
                // the argument the parameter is: its position's, or any of them behind a spread
                let given: Vec<&'a Expr> = if spread { args.iter().collect() } else { args.get(i).into_iter().collect() };
                for a in given {
                    let mut whole = u.any || spread;
                    if !whole {
                        for path in &u.callees {
                            let (mut x, mut xenv) = self.static_part(a, env, 0);
                            let mut read = true;
                            for k in path {
                                let hit: Option<&'a Expr> = match &x.k {
                                    ExprKind::Rec(fields) => rec_field(fields, k),
                                    ExprKind::Arr(items) => k.parse::<usize>().ok().filter(|n| !items.iter().take(n + 1).any(|x| matches!(x.k, ExprKind::Spread(_)))).and_then(|n| items.get(n)),
                                    _ => None,
                                };
                                match hit {
                                    Some(v) => (x, xenv) = self.static_part(v, xenv, 0),
                                    None => {
                                        read = false;
                                        break;
                                    }
                                }
                            }
                            if !read {
                                whole = true;
                                break;
                            }
                            if matches!(x.k, ExprKind::Fn { .. }) {
                                if !out.iter().any(|(f, _)| std::ptr::eq(*f, x)) {
                                    out.push((x, xenv));
                                }
                            } else {
                                self.held_closures(x, xenv, &mut HashSet::new(), &mut out);
                            }
                        }
                    }
                    if whole {
                        self.held_closures(a, env, &mut HashSet::new(), &mut out);
                    }
                }
                // what the body gives the closure it calls, the closure may call
                let passed: Vec<&'a Expr> = u.passed.clone();
                for x in passed {
                    self.held_closures(x, cenv, &mut HashSet::new(), &mut out);
                }
            }
        }
        out
    }
    /// The expression a path denotes, where what is written says so: a name bound by an equation or a local is its
    /// value (neither is ever written), a field of a record literal is that field, an index of an array literal that
    /// item. Anything else is itself.
    fn static_part(&self, e: &'a Expr, env: EId, depth: usize) -> (&'a Expr, EId) {
        if depth > 32 {
            return (e, env);
        }
        match &e.k {
            ExprKind::Id(n) => match self.lookup(env, n).filter(|&s| matches!(self.syms[s].kind, SymKind::Eq | SymKind::Value)).and_then(|s| self.syms[s].val) {
                Some((v, venv)) => self.static_part(v, venv, depth + 1),
                None => (e, env),
            },
            ExprKind::Member { o, p, .. } => {
                let (ro, renv) = self.static_part(o, env, depth + 1);
                match &ro.k {
                    ExprKind::Rec(fields) => match rec_field(fields, p) {
                        Some(v) => self.static_part(v, renv, depth + 1),
                        None => (e, env),
                    },
                    _ => (e, env),
                }
            }
            ExprKind::Index { o, i, .. } => {
                let (ro, renv) = self.static_part(o, env, depth + 1);
                let hit: Option<&'a Expr> = match (&ro.k, lit_key(i)) {
                    (ExprKind::Rec(fields), Some(k)) => rec_field(fields, &k),
                    (ExprKind::Arr(items), Some(k)) if matches!(i.k, ExprKind::Lit(Lit::Num(_))) => k.parse::<usize>().ok().filter(|n| !items.iter().take(n + 1).any(|x| matches!(x.k, ExprKind::Spread(_)))).and_then(|n| items.get(n)),
                    _ => None,
                };
                match hit {
                    Some(v) => self.static_part(v, renv, depth + 1),
                    None => (e, env),
                }
            }
            _ => (e, env),
        }
    }
    /// Every closure a value may hold, by mention: the closures written in its expression (and in the closures those
    /// return), and those of the values its names are bound to.
    fn held_closures(&self, e: &'a Expr, env: EId, seen: &mut HashSet<SId>, out: &mut Vec<(&'a Expr, EId)>) {
        fn walk<'a>(c: &Checker<'a>, n: Node<'a>, env: EId, seen: &mut HashSet<SId>, out: &mut Vec<(&'a Expr, EId)>) {
            if let Node::E(x) = n {
                match &x.k {
                    ExprKind::Fn { .. } => {
                        if !out.iter().any(|(f, _)| std::ptr::eq(*f, x)) {
                            out.push((x, env));
                        }
                    }
                    ExprKind::Id(name) => {
                        if let Some(s) = c.lookup(env, name) {
                            if seen.insert(s) {
                                if let Some((v, venv)) = c.syms[s].val {
                                    walk(c, Node::E(v), venv, seen, out);
                                }
                            }
                        }
                    }
                    _ => {}
                }
            }
            for k in children(n, false) {
                walk(c, k, env, seen, out);
            }
        }
        walk(self, Node::E(e), env, seen, out);
    }
    /// The names read by the closures an expression calls (outside `peek`), each with the symbol it names there.
    fn called_reads(&self, e: &'a Expr, env: EId) -> Vec<(String, SId)> {
        fn walk<'a>(c: &Checker<'a>, n: Node<'a>, env: EId, seen: &mut HashSet<*const Expr>, out: &mut Vec<(String, SId)>) {
            if let Node::E(x) = n {
                match &x.k {
                    ExprKind::Peek(_) | ExprKind::Fn { .. } | ExprKind::ServerFn { .. } => return,
                    ExprKind::Call { .. } => {
                        for (f, fenv) in c.called_closures(x, env).into_iter().chain(c.arg_closures(x, env)) {
                            if seen.insert(f as *const Expr) {
                                for name in names_of(f) {
                                    if let Some(t) = c.lookup(fenv, strip_pre(&name)) {
                                        out.push((strip_pre(&name).to_string(), t));
                                    }
                                }
                                for k in children(Node::E(f), false) {
                                    walk(c, k, fenv, seen, out);
                                }
                            }
                        }
                    }
                    _ => {}
                }
            }
            for k in children(n, false) {
                walk(c, k, env, seen, out);
            }
        }
        let mut out = vec![];
        walk(self, Node::E(e), env, &mut HashSet::new(), &mut out);
        out
    }
    /// E-10, E-5a (ruled 2026-11-22): the first read, in `e`, through a value that may be the instance a primitive made
    /// (MO-10k, by mention) — as written. An instance never changes, so naming it and passing it whole
    /// read nothing that does; a field of it tracks (MO-10b), and
    /// what a method of it answers the declaration does not say. So a field read, an index or a method call on
    /// anything that may be the instance — an alias's record, an array holding it, what a call given it returns, a
    /// parameter of a closure handed it — is a read of what may change, and so is handing it to a function of `.rx`
    /// that the checker cannot see into. A JS fn takes it whole (the exemption). A closure reads when it is called: one
    /// written among a call's arguments, or called by the name it is bound to, is read here. `peeks`: look inside `peek`.
    fn instance_read(&mut self, e: &'a Expr, env: EId, peeks: bool) -> Option<String> {
        self.inst_read(Node::E(e), env, peeks, &HashSet::new(), &mut HashSet::new())
    }
    fn may_be_instance(&mut self, e: &Expr, env: EId, tp: &HashSet<String>) -> bool {
        let names = self.flow_names(e, env);
        names.iter().any(|n| tp.contains(n) || self.lookup(env, n).is_some_and(|t| self.tainted(t, Taint::Instance).is_some()))
    }
    fn inst_read(&mut self, n: Node<'a>, env: EId, peeks: bool, tp: &HashSet<String>, seen: &mut HashSet<*const Expr>) -> Option<String> {
        let Node::E(e) = n else {
            return children(n, false).into_iter().find_map(|c| self.inst_read(c, env, peeks, tp, seen));
        };
        match &e.k {
            ExprKind::Peek(_) if !peeks => return None,
            ExprKind::Fn { .. } | ExprKind::ServerFn { .. } => return None,
            // a slot of a literal written here is that slot (`[clock, 5][1]`): no read through the instance
            ExprKind::Member { o, .. } | ExprKind::Index { o, .. } if literal_part(e).is_none() => {
                if self.may_be_instance(o, env, tp) {
                    return Some(show(e));
                }
            }
            ExprKind::Call { f, args, .. } => {
                let own: Option<SId> = None;
                let recv: Option<&'a Expr> = match &f.k {
                    ExprKind::Member { o, .. } | ExprKind::Index { o, .. } => Some(o),
                    _ => None,
                };
                if own.is_none() {
                    if let Some(r) = self.inst_read(Node::E(f), env, peeks, tp, seen) {
                        return Some(if method_callee(f).is_some() { format!("{r}(…)") } else { r });
                    }
                }
                // what the call is given
                let given: Vec<bool> = args.iter().map(|a| self.may_be_instance(a, env, tp)).collect();
                let recv_given = recv.is_some_and(|o| self.may_be_instance(o, env, tp));
                // a JS fn takes an instance whole (E-10); its closures are callbacks, called later
                let is_js = |c: &Self, n: &str| c.lookup(env, n).is_some_and(|t| c.syms[t].kind == SymKind::Import || (c.syms[t].kind == SymKind::Fn && c.syms[t].foreign.is_some()) || c.syms[t].kind == SymKind::ErrClass);
                let js = match &f.k {
                    ExprKind::Id(n) => is_js(self, n),
                    // a method of a JS import is JS too
                    ExprKind::Member { .. } | ExprKind::Index { .. } => {
                        let mut root: &Expr = f;
                        while let ExprKind::Member { o, .. } | ExprKind::Index { o, .. } = &root.k {
                            root = o;
                        }
                        matches!(&root.k, ExprKind::Id(n) if is_js(self, n))
                    }
                    _ => false,
                };
                let builtin = matches!(&f.k, ExprKind::Id(n) if self.lookup(env, n).is_none());
                if !js {
                    // a closure written among the arguments is called with the others, or with what it is called on
                    for (i, a) in args.iter().enumerate() {
                        if let ExprKind::Fn { params, .. } = &a.k {
                            let handed = recv_given || given.iter().enumerate().any(|(j, g)| j != i && *g);
                            let mut tp2 = tp.clone();
                            for p in params {
                                if handed {
                                    tp2.insert(p.clone());
                                } else {
                                    tp2.remove(p);
                                }
                            }
                            if let Some(r) = children(Node::E(a), false).into_iter().find_map(|c| self.inst_read(c, env, peeks, &tp2, seen)) {
                                return Some(r);
                            }
                        }
                    }
                    // a closure the checker can see is called: its body is read, its parameters what it is given
                    let called = self.called_closures(e, env);
                    for &(c, cenv) in &called {
                        if seen.insert(c as *const Expr) {
                            let mut tp2 = HashSet::new();
                            if let ExprKind::Fn { params, .. } = &c.k {
                                for (i, p) in params.iter().enumerate() {
                                    if given.get(i).copied().unwrap_or(false) {
                                        tp2.insert(p.clone());
                                    }
                                }
                            }
                            if let Some(r) = children(Node::E(c), false).into_iter().find_map(|k| self.inst_read(k, cenv, peeks, &tp2, seen)) {
                                return Some(r);
                            }
                        }
                    }
                    // and what it calls through a parameter, of what it is given (a closure given to a closure): called
                    // with what the callee has — its other arguments among them
                    for (c, cenv) in self.arg_closures(e, env) {
                        if seen.insert(c as *const Expr) {
                            let mut tp2 = HashSet::new();
                            if let (ExprKind::Fn { params, .. }, true) = (&c.k, recv_given || given.iter().any(|g| *g)) {
                                tp2.extend(params.iter().cloned());
                            }
                            if let Some(r) = children(Node::E(c), false).into_iter().find_map(|k| self.inst_read(k, cenv, peeks, &tp2, seen)) {
                                return Some(r);
                            }
                        }
                    }
                    if called.is_empty() && !builtin && own.is_none() {
                        // a function of `.rx` the checker cannot see into (an .rx fn, a prop, a parameter, a closure held
                        // in a record: a method of anything that is not the instance or JS), given it
                        if let Some(i) = given.iter().position(|g| *g) {
                            return Some(format!("{}(…), which is given {} and may read through it", show(f), show(&args[i])));
                        }
                    }
                }
                return args.iter().find_map(|a| self.inst_read(Node::E(a), env, peeks, tp, seen));
            }
            _ => {}
        }
        children(n, false).into_iter().find_map(|c| self.inst_read(c, env, peeks, tp, seen))
    }
    fn snapshot_args(&mut self, call: &'a Expr, f: SId, env: EId) {
        let ExprKind::Call { args, .. } = &call.k else { return };
        let params = self.syms[f].params.clone().unwrap_or_default();
        let fname = self.syms[f].name.clone();
        for (i, p) in params.iter().enumerate() {
            let Some(a) = args.get(i) else { continue };
            if p.r#ref {
                continue;
            }
            let mut reads = IndexSet::new();
            reads_outside_peek(Node::E(a), &mut reads);
            let mut rooted = IndexSet::new();
            rooted_reads(a, &mut rooted);
            // E-10: an instance a primitive made (its value result) is made once and never changes, when it is passed
            // whole; a field read through it, or a name bound to one, tracks (RFC 14, MO-10b)
            // a method called on it is a call whose answer may change: what a method gives back the declaration does not
            // say, and may track (RFC 14, bounded 2026-11-21)
            let mut methods = vec![];
            method_calls(a, &mut methods);
            let instance = |s: SId| matches!(self.syms[s].foreign, Some(crate::parse::Shape::Part(crate::parse::Part::Value)) | Some(crate::parse::Shape::Comp) | Some(crate::parse::Shape::Fields(_)));
            let undeclared = |_s: SId, n: &String| methods.iter().find(|(r, _)| r == n).map(|(_, m)| m.clone());
            let constant = |s: SId, n: &String| instance(s) && !self.syms[s].via_field && !rooted.contains(n) && undeclared(s, n).is_none();
            let cands: Vec<(String, SId, Option<String>)> = reads
                .iter()
                .filter_map(|n| self.lookup(env, n).filter(|&s| self.syms[s].kind.reactive() && !constant(s, n)).map(|s| (n.clone(), s, (instance(s) && !self.syms[s].via_field && !rooted.contains(n)).then(|| undeclared(s, n)).flatten())))
                .collect();
            // and an equation that reads nothing that changes
            let mut hit = None;
            for (n, s, m) in cands {
                if !self.constant_eq(s) {
                    hit = Some(match m {
                        Some(m) => format!("{n}.{m}(…), a method of the instance {n}: what a method answers may change (where it is made once, say so: `peek {n}.{m}(…)`)"),
                        None => n,
                    });
                    break;
                }
            }
            // E-10: a field read through a `for` row (`counter(r.x)`): the row is a constant (RG-2b), but its fields are
            // written by path or reconciled by key while it lives (ST-4a), so the argument is a snapshot of something that
            // changes. The row passed whole reads no field; `peek r.x` says the snapshot is meant
            if hit.is_none() {
                hit = rooted.iter().find(|n| self.lookup(env, n).is_some_and(|s| self.syms[s].row_of.is_some())).map(|n| format!("a field of the row {}", n));
            }
            // E-10 (ruled 2026-11-22): a closure the argument calls reads what its body reads
            if hit.is_none() {
                for (n, s) in self.called_reads(a, env) {
                    if self.syms[s].kind.reactive() && !self.constant_eq(s) {
                        hit = Some(format!("{n}, in a closure it calls"));
                        break;
                    }
                }
            }
            // and a read through anything that may be an instance is a read of what may change
            if hit.is_none() {
                hit = self.instance_read(a, env, false).map(|r| format!("{r}, through a value that may be the instance a primitive made: a field of it tracks, and what a method answers may change (read it where it is used, or say it is read once: `peek`)"));
            }
            if let Some(h) = hit {
                self.err(
                    "SNAPSHOT_ARGUMENT",
                    "E-10",
                    format!("{}(…): the argument for value parameter {} reads {} and would be snapshotted — declare the parameter `ref`, or pass peek(…)", fname, p.name, h),
                );
            }
        }
    }

    /// CN-4a: a written row narrower than the inferred one.
    // ---- E-5a: a peek kept where it is read, of a value that changes ----
    /// Expressions whose value is kept and re-read — an equation, a provision, a context's default, what a view reads, a
    /// component's argument, a `ref` argument — that contain a `peek`. A source's seed and a value argument are snapshots by
    /// rule (E-4, E-10), an effect's compute half runs its apply, and a closure reads when it is called: none is kept.
    fn keep(&mut self, e: &'a Expr, env: EId) {
        let mut ps = vec![];
        peeks_in(Node::E(e), &mut ps);
        if !ps.is_empty() {
            self.kept_peeks.push((e, env, self.line));
        }
    }
    /// E-5a: a component named as a value is applied by JS (its props come from there)
    fn escape_comp(&mut self, name: &str, env: EId) {
        if let Some(k) = self.lookup(env, name).filter(|&c| self.syms[c].kind == SymKind::Comp).and_then(|c| self.syms[c].comp_region).and_then(|r| self.regions[r].key.clone()) {
            self.escapes.insert(k);
        }
    }
    /// Whether an expression can change — counting what it reads outside `peek` (`Out`), inside it (`In`), or both (`All`).
    fn ch_of(&mut self, n: Node<'a>, env: EId, mode: ChMode, acc: &mut Ch, in_peek: bool) {
        let counting = mode == ChMode::All || (mode == ChMode::In) == in_peek;
        if let Node::E(e) = n {
            // a closure the checker can see is called (one written at the call, or the one its name is bound to): the
            // call reads what its body reads (ruled 2026-11-22)
            for (c, cenv) in self.called_closures(e, env).into_iter().chain(self.arg_closures(e, env)) {
                if self.ch_fns.insert(c as *const Expr) {
                    for k in children(Node::E(c), false) {
                        self.ch_of(k, cenv, mode, acc, in_peek);
                    }
                    self.ch_fns.remove(&(c as *const Expr));
                }
            }
            match &e.k {
                ExprKind::Peek(x) => {
                    if mode != ChMode::Out {
                        self.ch_of(Node::E(x), env, mode, acc, true);
                    }
                    return;
                }
                ExprKind::Fn { .. } | ExprKind::ServerFn { .. } => return, // a closure reads when it is called
                ExprKind::Id(name) => {
                    if counting {
                        let s = self.lookup(env, name);
                        let c = self.sym_ch(s);
                        add_ch(acc, &c);
                    }
                    return;
                }
                ExprKind::Pre { name, init } => {
                    if counting {
                        let s = self.lookup(env, name);
                        let c = self.sym_ch(s);
                        add_ch(acc, &c);
                    }
                    if let Some(i) = init {
                        self.ch_of(Node::E(i), env, mode, acc, in_peek);
                    }
                    return;
                }
                ExprKind::Use(name) => {
                    if counting {
                        if let Some(c) = self.lookup(env, name).filter(|&c| self.syms[c].kind == SymKind::Context) {
                            let key = self.syms[c].ctx.as_ref().unwrap().key.clone();
                            if key.contains(".d.rx#") {
                                acc.yes = true; // a JS context's provider is JS
                            } else {
                                acc.deps.insert(format!("ctx|{}", key));
                            }
                        }
                    }
                    return;
                }
                // a method called on a name reads no field of it (E-10's exemption): the name, and the arguments
                ExprKind::Call { f, args, .. } if method_callee(f).is_some_and(|(o, _)| matches!(&o.k, ExprKind::Id(on) if !self.lookup(env, on).is_some_and(|s| self.syms[s].kind == SymKind::Props))) => {
                    if let Some((o, p)) = method_callee(f) {
                        let p = &p;
                        if let ExprKind::Id(on) = &o.k {
                            if counting {
                                let s = self.lookup(env, on);
                                // E-10 (bounded): a method of a primitive's instance may answer something that changes
                                let _ = p;
                                if s.is_some_and(|s| self.syms[s].kind == SymKind::Eq && self.syms[s].foreign.is_some()) {
                                    acc.yes = true;
                                }
                                let c = self.sym_ch(s);
                                add_ch(acc, &c);
                            }
                        }
                    }
                    for a in args {
                        self.ch_of(Node::E(a), env, mode, acc, in_peek);
                    }
                    return;
                }
                ExprKind::Member { .. } | ExprKind::Index { .. } => {
                    if let ExprKind::Member { o, p, .. } = &e.k {
                        if let ExprKind::Id(on) = &o.k {
                            if let Some(s) = self.lookup(env, on).filter(|&s| self.syms[s].kind == SymKind::Props) {
                                if counting {
                                    let key = self.regions[self.syms[s].region].key.clone().unwrap_or_default();
                                    acc.deps.insert(format!("prop|{}|{}", key, p));
                                }
                                return;
                            }
                        }
                    }
                    // a field read through a primitive's instance tracks (MO-10b); one through a row changes when its list
                    // does: the row is constant (RG-2b), its fields are written by path or reconciled by key (ST-4a)
                    let mut x = e;
                    loop {
                        match &x.k {
                            ExprKind::Member { o, .. } | ExprKind::Index { o, .. } => x = o,
                            _ => break,
                        }
                    }
                    if let (true, ExprKind::Id(rn)) = (counting, &x.k) {
                        if let Some(r) = self.lookup(env, rn) {
                            if self.syms[r].kind == SymKind::Eq && self.syms[r].foreign.is_some() {
                                acc.yes = true;
                            } else if self.syms[r].row_of.is_some() {
                                let c = self.row_ch(r);
                                add_ch(acc, &c);
                            }
                        }
                    }
                }
                ExprKind::Await { .. } => {
                    if counting {
                        acc.yes = true; // it loads: pending, then a value
                    }
                }
                _ => {}
            }
        }
        for c in children(n, false) {
            self.ch_of(c, env, mode, acc, in_peek);
        }
    }
    fn ch_expr(&mut self, e: &'a Expr, env: EId, mode: ChMode) -> Ch {
        let mut acc = Ch::default();
        self.ch_of(Node::E(e), env, mode, &mut acc, false);
        // E-5a (ruled 2026-11-22): a read through a value that may be an instance is a read of what may change
        if !acc.yes && self.instance_read(e, env, mode != ChMode::Out).is_some() {
            acc.yes = true;
        }
        acc
    }
    fn sym_ch(&mut self, s: Option<SId>) -> Ch {
        let Some(s) = s else { return Ch::default() };
        if let Some(m) = self.ch_memo.get(&s) {
            return m.clone();
        }
        self.ch_memo.insert(s, Ch::default()); // a cycle adds nothing
        let r = self.sym_ch_of(s);
        self.ch_memo.insert(s, r.clone());
        r
    }
    /// E-5a: whether a row's fields can change: whether the list it is a row of does.
    fn row_ch(&mut self, row: SId) -> Ch {
        if let Some(m) = self.ch_memo.get(&row) {
            return m.clone();
        }
        self.ch_memo.insert(row, Ch::default());
        let (e, env) = self.syms[row].row_of.unwrap();
        let r = self.ch_expr(e, env, ChMode::Out);
        self.ch_memo.insert(row, r.clone());
        r
    }
    fn sym_ch_of(&mut self, s: SId) -> Ch {
        let one = |yes: bool, dep: Option<String>| Ch { yes, deps: dep.into_iter().collect() };
        if let Some(k) = self.syms[s].export_key.clone() {
            return one(false, Some(format!("exp|{}", k))); // an .rx import: its module knows
        }
        match self.syms[s].kind {
            SymKind::Props => one(false, Some(format!("prop|{}|*", self.regions[self.syms[s].region].key.clone().unwrap_or_default()))),
            SymKind::Import => one(self.syms[s].reader, None),
            SymKind::Source => {
                if self.changed.contains(&s) {
                    one(true, None)
                } else if self.syms[s].question {
                    match self.syms[s].expr {
                        Some((e, env)) => self.ch_expr(e, env, ChMode::Out),
                        None => one(false, None),
                    }
                } else {
                    one(false, None)
                }
            }
            SymKind::Eq => {
                let sy = &self.syms[s];
                if sy.param || sy.reader || self.changed.contains(&s) {
                    return one(true, None); // a ref parameter: the caller's, reactive
                }
                if let Some(f) = &sy.foreign {
                    return one(sy.via_field || f.has_ref() || !sy.held.is_empty(), None); // MO-10b: a value result is made once; a reader, or a field that holds, changes
                }
                match sy.carried_expr {
                    Some((e, env)) => self.ch_expr(e, env, ChMode::Out),
                    None => one(true, None),
                }
            }
            SymKind::Fn => match self.syms[s].fn_tail {
                Some((e, env)) => self.ch_expr(e, env, ChMode::Out),
                None => one(false, None), // a JS fn is pure (R-io)
            },
            _ => one(false, None),
        }
    }
    /// At the end of the module: a kept peek of what can change. Not when the rest of the expression changes — then the peek is
    /// a sample, read again each time (`a + peek b`). With the whole program (`whole`), what only another module can tell waits.
    fn kept_peek_check(&mut self) {
        for (e, env, line) in std::mem::take(&mut self.kept_peeks) {
            let o = self.ch_expr(e, env, ChMode::Out);
            if o.yes {
                continue;
            }
            let mut ps = vec![];
            peeks_in(Node::E(e), &mut ps);
            for p in ps {
                let ExprKind::Peek(inner) = &p.k else { continue };
                let pc = self.ch_expr(inner, env, ChMode::All);
                if !pc.yes && pc.deps.is_empty() {
                    continue;
                }
                self.line = line;
                let (peek, what) = (show(p), show(inner));
                if !self.opts.whole || (pc.yes && o.deps.is_empty()) {
                    self.err("SNAPSHOT_KEPT", "E-5a", kept_msg(&peek, &why_of(&what, &pc)));
                } else {
                    self.deferred.push(Deferred { line, peek, what, p: pc, o: o.clone() });
                }
            }
        }
    }
    /// E-5a: what the whole-program pass needs from this module.
    pub fn peek_facts(&mut self, p: &'a Program) -> PeekFacts {
        let file = self.opts.file.clone().unwrap_or_else(|| "main.rx".into());
        let mut f = PeekFacts::default();
        let apps: Vec<(String, Vec<(String, &'a Expr, EId)>)> = self.apps.iter().filter_map(|a| self.regions[a.comp].key.clone().map(|k| (k, a.args.clone()))).collect();
        for (k, args) in apps {
            for (field, e, env) in args {
                let c = self.ch_expr(e, env, ChMode::Out);
                f.apps.push((k.clone(), field, c));
            }
        }
        let provs: Vec<(String, &'a Expr, EId)> = self.provisions.iter().map(|x| (x.key.clone(), x.e, x.env)).collect();
        for (k, e, env) in provs {
            let c = self.ch_expr(e, env, ChMode::Out);
            f.provs.push((k, c));
        }
        let root = self.root_env.unwrap();
        for d in &p.decls {
            if !d.exported() {
                continue;
            }
            let Some(name) = d.name() else { continue };
            let Some(&s) = self.envs[root].vars.get(name) else { continue };
            match self.syms[s].kind {
                SymKind::Comp => {
                    if let Some(k) = self.syms[s].comp_region.and_then(|r| self.regions[r].key.clone()) {
                        f.exported.push(k.clone());
                        if matches!(d, Decl::Component { is_default: true, .. }) {
                            f.aliases.push((format!("{}#default", file), k));
                        }
                    }
                }
                SymKind::Source | SymKind::Eq | SymKind::Fn => {
                    let c = self.sym_ch(Some(s));
                    f.exports.push((format!("{}#{}", file, name), c));
                }
                _ => {}
            }
        }
        f.escapes = self.escapes.iter().cloned().collect();
        f.deferred = std::mem::take(&mut self.deferred);
        f
    }

    fn row_check(&mut self, name: &str, ty: Option<&str>, env: EId) {
        let Some(ty) = ty else { return };
        let Some(m) = ROW_WORDS.find(ty) else { return };
        let m0 = js_trim(m.as_str()).to_string();
        let words = split_rows(&m0);
        let written: HashSet<String> = words.iter().map(|w| match w.find('(') { Some(i) => w[..i].to_string(), None => w.clone() }).collect();
        let inferred = match self.envs[env].vars.get(name).copied() {
            Some(s) if self.syms[s].rows.is_some() => self.sym_rows(s),
            _ => IndexSet::new(),
        };
        for r in inferred {
            if !written.contains(&r) {
                self.err("ROW_NARROWER_THAN_INFERRED", "CN-4a", format!("{} is declared `{}` but its value is also `{}`", name, m0, r));
            }
        }
        let fw = words.iter().find(|w| w.starts_with("fails(")).cloned();
        let line = self.line;
        self.later.push(Later::RowFails { name: name.to_string(), env, fw, written: m0, line });
    }
    /// R-f-1: a name in a catch, a boundary or an import's `fails` must be an error class.
    fn err_class(&mut self, n: &str, env: EId) {
        if n == "Error" || n == "Panic" {
            return;
        }
        let ok = self.lookup(env, n).is_some_and(|s| matches!(self.syms[s].kind, SymKind::ErrClass | SymKind::Import));
        if !ok {
            self.err("NOT_AN_ERROR_CLASS", "R-f-1", format!("{} is not an error class (declare it: `error {}(…)`)", n, n));
        }
    }

    // ---- expressions ----
    fn resolve(&mut self, name: &str, env: EId, ctx: Ctx) -> Option<SId> {
        if let Some(s) = self.lookup(env, name) {
            if let Some(c) = self.syms[s].no_props.clone() {
                self.err("UNBOUND", "RG-4b", format!("{} is not declared here: component {} declares no props — declare what it takes, `component {}(props: {{ … }})`, and pass it where it is applied", name, c, c));
            }
            self.sided(s, ctx);
            return Some(s);
        }
        if BUILTINS.contains(&name) {
            return None;
        }
        if ctx.imperative && (name == "log" || DOLLAR_PARAM.is_match(name)) {
            return None;
        }
        self.err("UNBOUND", "SCOPE", format!("{} is not declared here (a component sees its declaration site, not its caller — RG-7a)", name));
        None
    }
    /// 12 SF-3/SF-5: what a name may be on this side.
    fn sided(&mut self, s: SId, ctx: Ctx) {
        let (name, kind, side) = (self.syms[s].name.clone(), self.syms[s].kind, self.syms[s].side);
        if !ctx.server {
            if side == Some(Side::Server) {
                self.err("SERVER_ONLY", "SF-5a", format!("{} is `server` JS: it is not in the client bundle — call it in a `server fn` body", name));
            }
            return;
        }
        if side == Some(Side::Client) {
            self.err("CLIENT_IN_SERVER", "SF-5c", format!("{} is `client` JS and this is a server function's body", name));
            return;
        }
        let what = if kind.reactive() {
            Some(match kind {
                SymKind::Source => "a source",
                SymKind::Eq => "an equation",
                _ => "the component's props",
            })
        } else {
            match kind {
                SymKind::Context => Some("a context"),
                SymKind::Comp => Some("a component"),
                SymKind::Action => Some("a client action"),
                _ => None,
            }
        };
        let via = if what.is_some() { None } else if kind == SymKind::Fn { self.reach(s, &mut HashSet::new()) } else { None };
        if what.is_some() || via.is_some() {
            let w = match what {
                Some(w) => w.to_string(),
                None => format!("a fn that reads {}", via.unwrap()),
            };
            self.err(
                "SERVER_CAPTURE",
                "SF-3",
                format!("a server function's body names {}, {}: it runs in its own request on the server, where that is not the client's — pass what it needs as an argument", name, w),
            );
        }
    }
    /// SF-3: the reactive state a value fn reads, through the fns it calls; `None` if none.
    fn reach(&self, f: SId, seen: &mut HashSet<SId>) -> Option<String> {
        if seen.contains(&f) {
            return None;
        }
        let (Some(d), Some(denv)) = (self.syms[f].fn_decl, self.syms[f].decl_env) else { return None };
        seen.insert(f);
        let Decl::Fn { params, decls, tail, .. } = d else { return None };
        let mut bound: HashSet<String> = params.iter().map(|p| p.name.clone()).collect();
        for x in decls {
            if let Some(n) = x.name() {
                bound.insert(n.to_string());
            }
        }
        let mut names = IndexSet::new();
        for x in decls {
            match x {
                Decl::Eq { e, .. } => free_names(e, &bound, &mut names),
                Decl::Source { init, .. } => free_names(init, &bound, &mut names),
                _ => {}
            }
        }
        free_names(tail, &bound, &mut names);
        let text = serde_json::Value::Array(vec![decls_json(decls), tail.to_json()]).to_string();
        if let Some(u) = USE_JSON.captures(&text) {
            return Some(format!("use {}", &u[1]));
        }
        for n0 in names {
            let n = strip_pre(&n0);
            let Some(s) = self.lookup(denv, n) else { continue };
            let k = self.syms[s].kind;
            if k.reactive() || k == SymKind::Context {
                return Some(n.to_string());
            }
            if k == SymKind::Fn {
                if let Some(r) = self.reach(s, seen) {
                    return Some(format!("{} → {}", n, r));
                }
            }
        }
        None
    }

    /// `field`: the member read of an identifier (`props.title`), for the model (CP-6).
    fn expr(&mut self, e: &'a Expr, env: EId, ctx: Ctx, field: Option<&str>) {
        // MO-10i: the closures being walked, innermost last — a library's draft is its callback's alone
        if let ExprKind::Fn { .. } = &e.k {
            // a draft path's updater is applied where it is written: part of the callback, not a closure of its own
            if self.updaters.contains(&(e as *const Expr)) {
                return self.expr_k(e, env, ctx, field);
            }
            self.fn_seq += 1;
            let id = self.fn_seq;
            self.fn_stack.push(id);
            let draft_cb = self.draft_fns.contains_key(&(e as *const Expr));
            if draft_cb {
                self.draft_cbs.push(id);
            }
            self.expr_k(e, env, ctx, field);
            if draft_cb {
                self.draft_cbs.pop();
            }
            self.fn_stack.pop();
            return;
        }
        self.expr_k(e, env, ctx, field)
    }
    // ---- MO-10k: values the checker confines, by mention ----
    /// MO-10k: the declared type of a path over a declared JS result — the bound name, a field of it, what a method
    /// of it answers, an element (a `for` row, an index) — where the declaration's text says it (`ty_step`).
    fn decl_ty(&self, e: &Expr, env: EId, depth: usize) -> Option<String> {
        if depth > 32 {
            return None;
        }
        match &e.k {
            ExprKind::Id(n) => {
                let s = self.lookup(env, n)?;
                let sy = &self.syms[s];
                // a component's props are what its props type says (2026-11-22)
                if sy.kind == SymKind::Props {
                    return self.props_ty.get(&sy.region).cloned();
                }
                if !matches!(sy.kind, SymKind::Eq | SymKind::Value) {
                    return None;
                }
                if let Some(t) = &sy.ret_ty {
                    return Some(t.clone());
                }
                if let Some((list, lenv)) = sy.row_of {
                    return ty_step(&self.decl_ty(list, lenv, depth + 1)?, &TStep::Elem);
                }
                let (v, venv) = sy.val?;
                match v.k {
                    ExprKind::Id(_) | ExprKind::Member { .. } | ExprKind::Index { .. } | ExprKind::Call { .. } | ExprKind::Use(_) => self.decl_ty(v, venv, depth + 1),
                    _ => None,
                }
            }
            // what a context provides is what its declaration types it (2026-11-22)
            ExprKind::Use(n) => self.lookup(env, n).and_then(|s| self.syms[s].ctx.as_ref()).and_then(|c| c.ty.clone()),
            ExprKind::Member { o, p, .. } => ty_step(&self.decl_ty(o, env, depth + 1)?, &TStep::Field(p.clone())),
            ExprKind::Index { o, i, .. } => {
                let t = self.decl_ty(o, env, depth + 1)?;
                match (&i.k, lit_key(i)) {
                    (ExprKind::Lit(Lit::Num(_)), _) | (_, None) => ty_step(&t, &TStep::Elem),
                    (_, Some(k)) => ty_step(&t, &TStep::Field(k)),
                }
            }
            ExprKind::Call { f, .. } if matches!(f.k, ExprKind::Member { .. } | ExprKind::Index { .. }) => ty_step(&self.decl_ty(f, env, depth + 1)?, &TStep::Call),
            _ => None,
        }
    }
    /// MO-10k: a value its declaration says is a primitive (a declared scalar field, what a declared method answers)
    /// holds no part of the value it was read from.
    fn decl_prim(&self, e: &Expr, env: EId) -> bool {
        self.decl_ty(e, env, 0).is_some_and(|t| ty_scalar(&t))
    }
    /// The names `e`'s value may come from (`flows`), read in `env`.
    fn flow_names(&self, e: &Expr, env: EId) -> IndexSet<String> {
        let mut out = IndexSet::new();
        flows(e, &HashSet::new(), &HashMap::new(), &Look { builtin: &|n| self.lookup(env, n).is_none(), prim: &|x| self.decl_prim(x, env), field: &|x| self.prop_field(x, env).map(|(r, f)| prop_name(r, &f)) }, &mut out);
        out
    }
    /// MO-10k: whether `e`'s value may be, or hold, a value of kind `k`: the first name it mentions that may, and the
    /// binding that value was made at.
    fn gives(&mut self, e: &Expr, env: EId, k: Taint) -> Option<(String, SId)> {
        for n in self.flow_names(e, env) {
            // one prop of a component (`props.table`): the value asked about when it is the probe's
            if let Some(rest) = n.strip_prefix('\u{1}') {
                if k == Taint::Prop {
                    if let (Some((r, f)), Some((pr, pf))) = (rest.split_once('\u{1}'), &self.probe) {
                        if r == pr.to_string() && (f == pf || pf == "*") {
                            if let Some(ps) = self.props_of(env) {
                                return Some((format!("props.{f}"), ps));
                            }
                        }
                    }
                }
                continue;
            }
            if let Some(s) = self.lookup(env, &n) {
                // the props given whole hold every prop
                if k == Taint::Prop && self.syms[s].kind == SymKind::Props && self.probe.as_ref().is_some_and(|(pr, _)| *pr == self.syms[s].region) {
                    return Some((n, s));
                }
                if let Some(root) = self.tainted(s, k) {
                    return Some((n, root));
                }
            }
        }
        None
    }
    /// The component a scope is written in: its root.
    fn comp_root(&self, env: EId) -> Option<RId> {
        let r = self.reg(env);
        if self.regions[r].is_component_root { Some(r) } else { self.regions[r].component }
    }
    /// MO-11l (2026-11-22): whether a component keeps what one of its props is given — `None` — or the first way that
    /// value leaves it. An `.rx` component of this module keeps a prop when no way out its body writes (`all_sinks`:
    /// a prop of a component, a provision, a source, an export, a thrown value, a call that may keep it) is given a
    /// value that may hold a part of `props.<field>` (by mention, as MO-10k confines any value), a prop of a component
    /// that keeps it in turn excepted. One being decided is taken to keep it (components that only hand a value to
    /// each other keep it between them). A component of another `.rx` module keeps what its signature says
    /// (`keeps(…)`); a JS component's declaration does not say.
    fn prop_keeps(&mut self, comp: RId, field: &str) -> Option<String> {
        let key = (comp, field.to_string());
        if let Some(m) = self.keeps_memo.get(&key) {
            return m.clone();
        }
        if self.regions[comp].js {
            return Some("which is a JS component: its declaration does not say what it does with it".into());
        }
        if let Some(sig) = &self.regions[comp].sig {
            return if sig.keeps.iter().any(|k| k == field) { None } else { Some("whose signature does not say it keeps it (`keeps(…)`: it may store it, provide it or hand it on)".into()) };
        }
        if !self.keeps_busy.insert(key.clone()) {
            self.keeps_cut += 1;
            return None;
        }
        let cut = self.keeps_cut;
        let saved = self.probe.replace(key.clone());
        self.taint_memo.retain(|(k, _), _| *k != Taint::Prop);
        let mut out = None;
        for i in 0..self.all_sinks.len() {
            let (e, names, env, line, why, prop) = {
                let sk = &self.all_sinks[i];
                (sk.e, sk.names.clone(), sk.env, sk.line, sk.why.clone(), sk.prop.clone())
            };
            if self.comp_root(env) != Some(comp) {
                continue;
            }
            let hit = match e {
                Some(e) => self.gives(e, env, Taint::Prop),
                None => names.iter().find_map(|n| self.lookup(env, n).and_then(|t| self.tainted(t, Taint::Prop)).map(|r| (n.clone(), r))),
            };
            let Some((n, _)) = hit else { continue };
            if let Some((c2, f2, _)) = &prop {
                let inner = self.prop_keeps(*c2, f2); // given on to a prop that keeps it
                self.probe = Some(key.clone());
                self.taint_memo.retain(|(k, _), _| *k != Taint::Prop);
                if inner.is_none() {
                    continue;
                }
            }
            out = Some(format!("which does not keep it: there (line {line}) {n} is {why}"));
            break;
        }
        self.probe = saved;
        self.taint_memo.retain(|(k, _), _| *k != Taint::Prop);
        self.keeps_busy.remove(&key);
        if out.is_some() || self.keeps_cut == cut || self.keeps_busy.is_empty() {
            self.keeps_memo.insert(key, out.clone());
        }
        out
    }
    /// MO-10k: a name may be, or hold, a value of kind `k` when it is bound to one (`taint_root`), or to an expression
    /// that mentions a name that may (`flows`): an equation's or a local's value, the list a row or a loop variable goes
    /// through, the arguments a parameter may be given, what an `.rx` fn or an action of this module returns. A name
    /// whose value comes from where the checker cannot look — a prop, a parameter of a function passed as a value, a
    /// source, an import — is not one: the checks keep such values from getting there (MO-11l's sinks). A least fixpoint:
    /// a name being decided adds nothing, and an answer found short of one is not kept.
    fn tainted(&mut self, s: SId, k: Taint) -> Option<SId> {
        if let Some(m) = self.taint_memo.get(&(k, s)) {
            return *m;
        }
        if !self.taint_busy.insert((k, s)) {
            self.taint_cut += 1;
            return None;
        }
        let cut = self.taint_cut;
        let r = self.tainted_of(s, k);
        self.taint_busy.remove(&(k, s));
        if r.is_some() || self.taint_cut == cut {
            self.taint_memo.insert((k, s), r);
        }
        r
    }
    fn taint_root(&self, s: SId, k: Taint) -> bool {
        let sy = &self.syms[s];
        match k {
            Taint::Prop => false, // its root is a read of the prop (`gives`)
            Taint::Renders => sy.local_renders,
            Taint::Instance => sy.kind == SymKind::Eq && !sy.via_field && matches!(sy.foreign, Some(FShape::Part(Part::Value)) | Some(FShape::Fields(_))),
        }
    }
    fn tainted_of(&mut self, s: SId, k: Taint) -> Option<SId> {
        if self.taint_root(s, k) {
            return Some(s);
        }
        let mut from: Vec<(&'a Expr, EId)> = vec![];
        from.extend(self.syms[s].val);
        from.extend(self.syms[s].row_of);
        from.extend(self.syms[s].srcs.iter().copied());
        // a parameter of a named closure, fn or action: every argument its calls pass. Known once the module is walked,
        // which is when MO-11l asks; E-10 and E-5a ask while walking, and take a call given an instance as a read of it
        if k != Taint::Instance {
            let owner = self.syms[s].param_of.or_else(|| self.syms[s].of_fn.and_then(|p| self.fn_owner.get(&p).copied()));
            if let Some(f) = owner {
                from.extend(self.syms[f].call_args.iter().copied());
            }
        }
        for (e, env) in from {
            if let Some((_, r)) = self.gives(e, env, k) {
                return Some(r);
            }
        }
        if let Some((names, env)) = self.syms[s].ret_flows.clone() {
            for n in names {
                if let Some(t) = self.lookup(env, &n) {
                    if let Some(r) = self.tainted(t, k) {
                        return Some(r);
                    }
                }
            }
        }
        None
    }
    /// MO-11l (ruled 2026-11-22): bare `renders` checks the components a call is given where its result is bound, so
    /// that result, and anything that may hold a part of it, stays in the region it is bound in. It leaves through a
    /// component's prop, a provision, an export, a source, a thrown value, or an argument of a call that may keep it:
    /// each is recorded here and decided once the module is walked (`renders_sinks`).
    fn sink(&mut self, e: &'a Expr, env: EId, why: String) {
        self.sinks.push(Sink { e: Some(e), names: vec![], env, line: self.line, why, prop: None });
    }
    fn renders_sinks(&mut self) {
        self.all_sinks = std::mem::take(&mut self.sinks);
        for i in 0..self.all_sinks.len() {
            let (e, names, env, line, why, prop) = {
                let sk = &self.all_sinks[i];
                (sk.e, sk.names.clone(), sk.env, sk.line, sk.why.clone(), sk.prop.clone())
            };
            let hit = match e {
                Some(e) => self.gives(e, env, Taint::Renders),
                None => names.iter().find_map(|n| self.lookup(env, n).and_then(|t| self.tainted(t, Taint::Renders)).map(|r| (n.clone(), r))),
            };
            if let Some((n, root)) = hit {
                // MO-11l (2026-11-22): a prop of a component that keeps what it is given is no way out: the component
                // is beneath this region, and so is all it does with the value
                let why = match &prop {
                    Some((comp, field, _)) => match self.prop_keeps(*comp, field) {
                        None => continue,
                        Some(lets) => format!("{why}, {lets}"),
                    },
                    None => why,
                };
                self.line = line;
                let root = self.syms[root].name.clone();
                self.renders_escape_msg(&n, &root, &why);
            }
        }
    }
    fn renders_escape_msg(&mut self, n: &str, root: &str, why: &str) {
        let what = if n == root { format!("{n} holds components `renders` checked where {n} is bound") } else { format!("{n} may hold a part of {root}, whose components `renders` checked where {root} is bound") };
        self.err("RENDERS_ESCAPES", "MO-11l", format!("{what}, and here it is {why}: render it in the view where {root} is bound — what leaves that view is a primitive made of it (`str(…)`, a template, arithmetic, a comparison, `len(…)`) — or declare the library `renders(later)` with a prop that `renders` it (MO-11o); a library that mounts them under a root of its own says nothing of where (MO-11s)"));
    }
    /// MO-11l: whether a call may keep an argument, or hand it to what the checker cannot see. It does not when what is
    /// called is known to keep nothing: a builtin; a `pure` JS fn, or a method of a `pure` JS import (the declaration's
    /// word, CN-5); an `.rx` fn of another module that declares no state and cannot fail (a failure carries what it was
    /// thrown with to whichever boundary catches it); a method of the value itself. A fn, an action or a named closure
    /// of this module, and a closure written at the call, are seen into instead: their parameters are what they are
    /// given (recorded here), and their bodies are checked with that. Anything else may keep it, in either scope: an
    /// action or a server fn, an `io` JS fn, a method of another value, a function the checker cannot name (a prop, a
    /// parameter, a part of a record, what a call returns) — which is how a value would be handed up to whatever
    /// applied the component.
    fn call_keeps(&mut self, f: &'a Expr, args: &'a [Expr], env: EId) -> bool {
        match &f.k {
            ExprKind::Fn { .. } => false,
            ExprKind::Id(n) => {
                let Some(s) = self.lookup(env, n) else { return false };
                let sy = &self.syms[s];
                let local_fn = sy.kind == SymKind::Fn && sy.fn_decl.is_some();
                let local_action = sy.kind == SymKind::Action && sy.ret_flows.is_some();
                let closure = matches!(sy.kind, SymKind::Eq | SymKind::Value) && sy.val.is_some_and(|(v, _)| matches!(v.k, ExprKind::Fn { .. }));
                if local_fn || local_action || closure {
                    self.syms[s].call_args.extend(args.iter().map(|a| (a, env)));
                    return false;
                }
                match sy.kind {
                    SymKind::Import => sy.io,
                    SymKind::Fn => sy.foreign.is_none() && (sy.instantiating || sy.can_fail),
                    SymKind::ErrClass => false, // an error is a value until it is thrown, which is where it leaves
                    _ => true,
                }
            }
            ExprKind::Member { o, .. } | ExprKind::Index { o, .. } => {
                // a method of the value keeps nothing only where it is given nothing of the value (below): a receiver says
                // nothing of what is called (`({ send: props.onSend, t: table }).send(table)` hands the table to the parent)
                let mut root: &Expr = o;
                while let ExprKind::Member { o, .. } | ExprKind::Index { o, .. } = &root.k {
                    root = o;
                }
                !matches!(&root.k, ExprKind::Id(n) if self.lookup(env, n).is_some_and(|t| self.syms[t].kind == SymKind::Import && !self.syms[t].io))
            }
            _ => true,
        }
    }
    /// MO-10i (ruled 2026-11-22): a library's draft is a place, not a value. Its name stands only in the callback it is
    /// the parameter of: a closure made inside may run after the library has taken the draft back, so it may not name
    /// it — except a draft path's updater, which is applied where it is written.
    fn draft_here(&mut self, s: SId, name: &str) {
        if let Some(own) = self.syms[s].draft_fn {
            if self.fn_stack.last() != Some(&own) {
                self.err("DRAFT_ESCAPES", "MO-10i", format!("{name} is a library's draft, its callback's only while that call runs: a closure made inside the callback may run after the library has taken it back — use {name} in the callback itself (a loop is `for (const x of xs) {{ … }}`), or read what the closure needs into a local first (a read of a draft is a copy)"));
            }
        }
    }
    /// MO-10f: the held fields at or below what `e` names — a result with held fields, or a path to a record of them —
    /// by their paths from it. Empty when `e` is neither.
    fn held_under(&self, e: &Expr, env: EId) -> Vec<(String, bool, Vec<String>)> {
        let (root, path): (&str, Vec<Option<String>>) = match &e.k {
            ExprKind::Id(n) => (n.as_str(), vec![]),
            _ => match field_path(e) {
                Some(x) => x,
                None => return vec![],
            },
        };
        if !path.iter().all(|p| p.is_some()) {
            return vec![];
        }
        let Some(t) = self.lookup(env, root) else { return vec![] };
        let pre: String = path.iter().flatten().map(|p| format!("{p}.")).collect();
        self.syms[t].held.iter().filter_map(|h| h.0.strip_prefix(&pre).map(|r| (r.to_string(), h.1, h.2.clone()))).collect()
    }
    /// MO-10f (closed 2026-11-22): the operations of a result with held fields are its declared fields. `e` reads a
    /// member of one, or of a record of held fields below it.
    fn held_member(&mut self, e: &'a Expr, env: EId) {
        let Some((root, path)) = field_path(e) else { return };
        let Some(t) = self.lookup(env, root) else { return };
        if self.syms[t].held.is_empty() {
            return;
        }
        // MO-10f (closed 2026-11-22): what is read from a result with held fields, or from a record of them below it, is
        // a field its declaration names. Anything else — a method every object inherits (`valueOf`, `toJSON`), a field
        // the declaration does not have — is not an operation of the result: what it answers may be the result itself.
        // A key the checker cannot name reads some field, and is not called
        if !path.is_empty() {
            let obj = &path[..path.len() - 1];
            let below = |key: &str| {
                let segs: Vec<&str> = key.split('.').collect();
                segs.len() > obj.len() && segs.iter().zip(obj).all(|(a, b)| b.as_deref().is_none_or(|b| b == *a))
            };
            if obj.iter().all(|x| x.is_some()) && self.syms[t].held.iter().any(|h| below(&h.0)) {
                let mut ty = self.syms[t].ret_ty.clone();
                for seg in obj.iter().flatten() {
                    ty = ty.and_then(|x| ty_step(&x, &TStep::Field(seg.clone())));
                }
                let fields = ty.as_deref().and_then(ty_fields);
                let whole = match &e.k {
                    ExprKind::Member { o, .. } | ExprKind::Index { o, .. } => show(o),
                    _ => root.to_string(),
                };
                match (path.last().unwrap(), fields) {
                    (Some(k), Some(fs)) if !fs.iter().any(|f| &f.0 == k) => {
                        let names = fs.iter().map(|f| f.0.clone()).collect::<Vec<_>>().join(", ");
                        self.err("RESULT_AS_VALUE", "MO-10f", format!("{whole}.{k} is not a field {whole}'s declaration names ({names}): {whole} is a JS result whose fields hold or fail where each is read, so what is read from it is one of those fields — a method every object has (`valueOf`, `toJSON`, `toString`) may answer the result itself, and a field the declaration leaves out has no rows; declare the field in the `.d.rx`"));
                    }
                    (None, _) if self.callee_ids.contains(&(e as *const Expr)) => {
                        self.err("RESULT_AS_VALUE", "MO-10f", format!("{} is called, and its key is not one the checker can name: {whole} is a JS result whose fields hold or fail where each is read, and a method every object has (`valueOf`) may answer the result itself — call a field its declaration names, `{whole}.refetch()`", show(e)));
                    }
                    _ => {}
                }
            }
        }
    }
    /// MO-10f, MO-10i (ruled 2026-11-22): a JS result whose fields hold or fail, or whose parts take drafts, is read a
    /// part at a time: its name, and a path to a record of such fields, stand only where a part is read from them (the
    /// object of `.` or `[…]`), where an equation gives them another name, or where they are compared or tested. So
    /// every read of a held field is a path the checker sees, and every draft callback is written at its setter's call.
    fn whole_use(&mut self, e: &'a Expr, env: EId) {
        if self.whole_ok.contains(&(e as *const Expr)) {
            return;
        }
        let (root, path): (&str, Vec<Option<String>>) = match &e.k {
            ExprKind::Id(n) => (n.as_str(), vec![]),
            _ => match field_path(e) {
                Some(x) => x,
                None => return,
            },
        };
        let Some(t) = self.lookup(env, root) else { return };
        let under = |key: &str| {
            let segs: Vec<&str> = key.split('.').collect();
            segs.len() > path.len() && segs.iter().zip(&path).all(|(a, b)| b.as_deref().is_none_or(|b| b == *a))
        };
        if let Some(h) = self.syms[t].held.iter().find(|h| under(&h.0)) {
            let field = h.0.split('.').nth(path.len()).unwrap_or("").to_string();
            let what = show(e);
            self.err("RESULT_AS_VALUE", "MO-10f", format!("{what} is a JS result whose fields hold or fail where each is read ({what}.{field}), so it is read a field at a time: it is not passed, stored, returned, spread or shown whole — read the field here (`{what}.{field}`) and pass that, which carries its rows; another name for it is an equation, `q = {what}`"));
        } else if path.is_empty() && self.syms[t].kind != SymKind::Fn && self.syms[t].kind != SymKind::Import && !self.syms[t].part_drafts.is_empty() {
            let part = self.syms[t].part_drafts[0].0.clone();
            let part = if part.parse::<usize>().is_ok() { format!("{root}[{part}]") } else { format!("{root}.{part}") };
            self.err("DRAFT_ESCAPES", "MO-10i", format!("{root} holds a function that hands its callback a library's draft ({part}): it is called where it is bound from, `{part}((d) => {{ … }})`, and not passed or stored whole — a function that travels would be given a callback the checker cannot see; share the change as an action"));
        }
    }
    /// What every call does for the values the checker confines (MO-10i, MO-10k, MO-11l), whether it is written in an
    /// expression or is the instantiation an equation binds.
    fn call_marks(&mut self, f: &'a Expr, args: &'a [Expr], env: EId) {
        self.callee_ids.insert(f as *const Expr);
        // MO-10i: the callbacks this call hands a library's draft — by the callee's own name, or a part read off
        // a result (`st[1](…)`). Each is a closure written here, so its parameter is known to be the draft
        let drafts = match &f.k {
            ExprKind::Id(n) => self.lookup(env, n).map(|t| self.syms[t].drafts.clone()).unwrap_or_default(),
            _ => self.part_drafts_of(f, env).unwrap_or_default(),
        };
        for (i, ps) in drafts {
            match args.get(i) {
                Some(a) if matches!(a.k, ExprKind::Fn { .. }) => {
                    self.draft_fns.insert(a as *const Expr, ps);
                }
                // …or the name of a closure used for nothing else (`updater_positions`): its parameter is known as well
                Some(a) if matches!(&a.k, ExprKind::Id(n) if self.lookup(env, n).is_some_and(|t| self.syms[t].updater.as_ref() == Some(&ps))) => {
                    self.updater_ok.insert(a as *const Expr);
                }
                Some(_) => self.err("DRAFT_ESCAPES", "MO-10i", format!("{}(…) hands this callback a library's draft: write the callback here, as a closure (`(d) => {{ … }}`) — a function made elsewhere would be given the draft where the checker cannot see what it does with it", show(f))),
                None => {}
            }
        }
        // MO-10i (closed 2026-11-22): a method called on a draft, or on what such a method answers, is one of plain
        // data's, by name. One that calls a function it is given takes it as a closure written here: the closure is
        // called now, with places of the draft, so its parameters are the draft's as a loop's variable is
        if let ExprKind::Member { o, .. } | ExprKind::Index { o, .. } = &f.k {
            if self.draft_chain(o, env) {
                let key = match &f.k {
                    ExprKind::Member { p, .. } => Some(p.clone()),
                    ExprKind::Index { i, .. } => lit_key(i),
                    _ => None,
                };
                match key.as_deref() {
                    Some(m) if DRAFT_CALLBACKS.contains(&m) => {
                        for (i, a) in args.iter().enumerate() {
                            if let ExprKind::Fn { params, .. } = &a.k {
                                self.draft_fns.entry(a as *const Expr).or_insert_with(|| (0..params.len()).collect());
                            } else if i == 0 {
                                self.err("DRAFT_ESCAPES", "MO-10i", format!("{}(…) calls the function it is given with parts of a library's draft: write it here, as a closure (`(x) => …`), whose parameters are then places of the draft — a function made elsewhere would be handed them where the checker cannot see what it does with them", show(f)));
                            }
                        }
                    }
                    Some(m) if DRAFT_METHODS.contains(&m) => {}
                    _ => self.err("DRAFT_ESCAPES", "MO-10i", format!("{}(…) is called on a library's draft, and it is not a method of plain data the checker knows (an Array's, a Map's, a Set's, a string's): what it does with the draft, and with what it is given, cannot be seen — read the value first (`let v = {}`, a copy) and call it on that", show(f), show(o))),
                }
            }
        }
        // MO-10k: a closure written among a call's arguments may be handed any of the others, or what it is called
        // on; one called where it is written, its arguments
        {
            let recv: Option<&'a Expr> = match &f.k {
                ExprKind::Member { o, .. } | ExprKind::Index { o, .. } => Some(o),
                _ => None,
            };
            for (i, a) in args.iter().enumerate() {
                if matches!(a.k, ExprKind::Fn { .. }) {
                    let others: Vec<(&'a Expr, EId)> = recv.into_iter().chain(args.iter().enumerate().filter(|(j, _)| *j != i).map(|(_, x)| x)).map(|x| (x, env)).collect();
                    self.fn_srcs.insert(a as *const Expr, others);
                }
            }
            if matches!(f.k, ExprKind::Fn { .. }) {
                self.fn_srcs.insert(f as *const Expr, args.iter().map(|x| (x, env)).collect());
            }
        }
        // MO-11l: a call may keep what it is given, or hand it to what renders it elsewhere
        if self.call_keeps(f, args, env) {
            for a in args {
                self.sink(a, env, format!("passed to {}(…)", show(f)));
            }
        }
    }
    /// MO-10i: the draft callbacks of a function part read off a result, `st[1]` or `st.set`.
    fn part_drafts_of(&self, f: &Expr, env: EId) -> Option<Vec<(usize, Vec<usize>)>> {
        let (o, key) = match &f.k {
            ExprKind::Member { o, p, .. } => (o, Some(p.clone())),
            ExprKind::Index { o, i, .. } => (o, lit_key(i)),
            _ => return None,
        };
        let (ExprKind::Id(on), Some(key)) = (&o.k, key) else { return None };
        let t = self.lookup(env, on)?;
        self.syms[t].part_drafts.iter().find(|(k, _)| *k == key).map(|(_, d)| d.clone())
    }
    /// MO-10i: such a part is called where it is read, or given a name by an equation; it is not a value that travels.
    fn part_use(&mut self, e: &'a Expr, env: EId) {
        if self.part_drafts_of(e, env).is_some() && !self.callee_ids.contains(&(e as *const Expr)) && !self.whole_ok.contains(&(e as *const Expr)) {
            let what = show(e);
            self.err("DRAFT_ESCAPES", "MO-10i", format!("{what} hands its callback a library's draft: it is called here, with the callback written in the call (`{what}((d) => {{ … }})`), and not passed or stored — a function that travels would be given a callback the checker cannot see; share the change as an action"));
        }
    }
    /// MO-10i (2026-11-22): a closure bound to `name` — an equation's or a local's — is a draft callback when the name
    /// is written, somewhere in the module, as the argument of a call that hands that position a draft (`setTodos(up)`):
    /// its body is then checked as that callback's, its parameters at those positions the draft's. Read from what is
    /// written (`arg_calls`), before the body is walked; the walk holds the name to it — `call_marks` takes the name at
    /// such a position, and any other use of it is refused where it is written.
    fn updater_positions(&mut self, name: &str, e: &'a Expr, env: EId) -> Option<Vec<usize>> {
        let ExprKind::Fn { params, .. } = &e.k else { return None };
        if params.is_empty() {
            return None;
        }
        let mut found: Option<Vec<usize>> = None;
        for (callee, i) in self.arg_calls.get(name).cloned().unwrap_or_default() {
            let Some(ps) = self.lookup(env, &callee).and_then(|t| self.syms[t].drafts.iter().find(|(j, _)| *j == i).map(|(_, ps)| ps.clone())) else { continue };
            match &found {
                None => found = Some(ps),
                Some(f) if *f == ps => {}
                Some(_) => return None, // two kinds of callback: neither is assumed
            }
        }
        let ps = found?;
        self.draft_fns.insert(e as *const Expr, ps.clone());
        self.callback_fns.insert(e as *const Expr);
        Some(ps)
    }
    /// W-1a: what `e` reads its value from, when that is reactive state of `.rx` — a source, an equation, a prop, a
    /// provision, a row of one, the value a functional write is given, or a local that names a path of one. A JS
    /// instance (a declared result) is the library's; what a call answers, a literal, and a local bound to either are
    /// the program's own to change.
    /// MO-10i: `e` reads a JS result one of whose function parts hands out drafts — a store, read beside its setter
    /// (`[board, setBoard] = createStore(…)`, then `board.columns`): what a change in place would change outside it.
    fn store_of_drafts(&self, e: &Expr, env: EId) -> Option<String> {
        let mut r = e;
        while let ExprKind::Member { o, .. } | ExprKind::Index { o, .. } = &r.k {
            r = o;
        }
        let ExprKind::Id(n) = &r.k else { return None };
        let s = &self.syms[self.lookup(env, n)?];
        if matches!(s.kind, SymKind::Fn | SymKind::Import) {
            return None;
        }
        if !s.part_drafts.is_empty() {
            return Some(format!("the store {n}"));
        }
        let (x, xe) = s.expr?;
        if let ExprKind::Member { o, .. } | ExprKind::Index { o, .. } = &x.k {
            if let ExprKind::Id(on) = &o.k {
                let o = &self.syms[self.lookup(xe, on)?];
                if !matches!(o.kind, SymKind::Fn | SymKind::Import) && !o.part_drafts.is_empty() {
                    return Some(format!("the store {n}"));
                }
            }
        }
        None
    }
    fn reactive_place(&self, e: &Expr, env: EId, depth: usize) -> Option<String> {
        if depth > 32 {
            return None;
        }
        match &e.k {
            ExprKind::Id(n) => {
                let t = self.lookup(env, n)?;
                let sy = &self.syms[t];
                if sy.foreign.is_some() || sy.ret_ty.is_some() || sy.js_draft {
                    return None;
                }
                match sy.kind {
                    SymKind::Source => Some(format!("the source {n}")),
                    SymKind::Props => Some(format!("a prop of {n}")),
                    SymKind::Eq | SymKind::Value => {
                        if let Some((list, lenv)) = sy.row_of {
                            return self.reactive_place(list, lenv, depth + 1).map(|w| format!("a row of {}", w.trim_start_matches("a row of ")));
                        }
                        if sy.of_fn.is_some_and(|f| self.write_fns.contains(&f)) {
                            return Some(format!("the value the write is given ({n})"));
                        }
                        if sy.handed {
                            return Some(format!("what the component hands its view ({n})"));
                        }
                        let (v, venv) = sy.val?;
                        match (&v.k, sy.kind) {
                            (ExprKind::Fn { .. }, _) => None,
                            // a local that names a path of reactive state is that state
                            (ExprKind::Id(_) | ExprKind::Member { .. } | ExprKind::Index { .. } | ExprKind::Use(_), SymKind::Value) => self.reactive_place(v, venv, depth + 1),
                            (_, SymKind::Eq) => Some(format!("the equation {n}")),
                            _ => None,
                        }
                    }
                    _ => None,
                }
            }
            ExprKind::Member { o, .. } | ExprKind::Index { o, .. } => self.reactive_place(o, env, depth + 1),
            ExprKind::Use(n) => Some(format!("the provision {n}")),
            _ => None,
        }
    }
    /// MO-10b: a function field whose declared type answers nothing — `() => void`, or a promise of nothing — read off
    /// a declared JS result, a component's props or what a context provides: it is called for what it does.
    fn void_method(&self, f: &Expr, env: EId) -> bool {
        matches!(f.k, ExprKind::Member { .. } | ExprKind::Index { .. }) && self.decl_ty(f, env, 0).and_then(|t| ty_step(&t, &TStep::Call)).is_some_and(|r| matches!(ty_clean(&r), "void" | "Promise<void>"))
    }
    /// MO-10b (2026-11-22): a function field whose declared type answers a promise (`mutate: (v) => Promise<T>`,
    /// `refetch`): calling it starts work. Not awaited in reactive scope, nothing waits for that work and the view is
    /// handed a promise.
    fn promise_method(&self, f: &Expr, env: EId) -> bool {
        matches!(f.k, ExprKind::Member { .. } | ExprKind::Index { .. }) && self.decl_ty(f, env, 0).and_then(|t| ty_step(&t, &TStep::Call)).is_some_and(|r| ty_clean(&r).starts_with("Promise<"))
    }
    /// R-io-3, CN-1b: whether what a void function field names is an action, as far as this module says: the field of a
    /// context every provision of which, in this module, gives it a name declared by `action`. Solid's runtime names
    /// that call `ACTION_CALLED_IN_OWNED_SCOPE`; any other io is `IO_IN_REACTIVE`.
    fn provided_action(&self, f: &Expr, env: EId) -> bool {
        let (ExprKind::Member { o, .. } | ExprKind::Index { o, .. }) = &f.k else { return false };
        let Some(field) = (match &f.k {
            ExprKind::Member { p, .. } => Some(p.clone()),
            ExprKind::Index { i, .. } => lit_key(i),
            _ => None,
        }) else {
            return false;
        };
        let (x, _) = self.static_part_of(o, env);
        let ExprKind::Use(ctx) = &x.k else { return false };
        match self.provided.get(ctx) {
            Some(ps) if !ps.is_empty() => ps.iter().all(|e| matches!(&e.k, ExprKind::Rec(fields) if rec_field(fields, &field).is_some_and(|v| matches!(&v.k, ExprKind::Id(n) if self.action_names.contains(n))))),
            _ => false,
        }
    }
    /// A name's expression, through the equations and locals that name it (`c = use cart`).
    fn static_part_of<'e>(&'e self, e: &'e Expr, env: EId) -> (&'e Expr, EId) {
        let mut cur = (e, env);
        for _ in 0..32 {
            let ExprKind::Id(n) = &cur.0.k else { break };
            match self.lookup(cur.1, n).filter(|&s| matches!(self.syms[s].kind, SymKind::Eq | SymKind::Value)).and_then(|s| self.syms[s].val) {
                Some((v, venv)) => cur = (v, venv),
                None => break,
            }
        }
        cur
    }
    /// SC-4 (2026-11-22): a handler is a function, called when its event happens. An attribute that takes one, given a
    /// call of something that is io — an action, an io import, a setter, a method declared to answer nothing — would make
    /// that call while the view computes, and hand the handler its result: `onClick={save()}` for `onClick={() => {
    /// save() }}`. The arms of a condition are read the same way.
    fn handler_called(&mut self, e: &'a Expr, env: EId, attr: &str) {
        match &e.k {
            ExprKind::Call { f, .. } => {
                let code = match &f.k {
                    ExprKind::Id(n) => match self.lookup(env, n) {
                        Some(s) if self.syms[s].kind == SymKind::Action => Some("ACTION_CALLED_IN_OWNED_SCOPE"),
                        Some(s) if self.syms[s].io => Some("IO_IN_REACTIVE"),
                        None if n == "log" => Some("IO_IN_REACTIVE"),
                        _ => None,
                    },
                    _ if self.void_method(f, env) => Some(if self.provided_action(f, env) { "ACTION_CALLED_IN_OWNED_SCOPE" } else { "IO_IN_REACTIVE" }),
                    _ if self.promise_method(f, env) => Some("IO_IN_REACTIVE"),
                    _ => None,
                };
                if let Some(code) = code {
                    self.err(code, "SC-4", format!("{attr}={{{}}} calls {}(…) while the view computes, and gives the handler what it answers: a handler is a function, called when its event happens — `{attr}={{() => {{ {} }}}}`", show(e), show(f), show(e)));
                }
            }
            ExprKind::If { t, f, .. } => {
                self.handler_called(t, env, attr);
                self.handler_called(f, env, attr);
            }
            ExprKind::Bin { op, l, r } if matches!(op.as_str(), "&&" | "||" | "??") => {
                if op != "&&" {
                    self.handler_called(l, env, attr);
                }
                self.handler_called(r, env, attr);
            }
            _ => {}
        }
    }
    /// MO-10i: a read through a draft: its name, a path below it, or what a method called on one answers.
    fn draft_chain(&self, e: &Expr, env: EId) -> bool {
        match &e.k {
            ExprKind::Id(n) => self.lookup(env, n).is_some_and(|t| self.syms[t].js_draft),
            ExprKind::Member { o, .. } | ExprKind::Index { o, .. } => self.draft_chain(o, env),
            ExprKind::Call { f, .. } => matches!(&f.k, ExprKind::Member { o, .. } | ExprKind::Index { o, .. } if self.draft_chain(o, env)),
            _ => false,
        }
    }
    /// MO-10i: the draft a place belongs to: the draft's name, or a path below it.
    fn draft_place(&self, e: &Expr, env: EId) -> Option<SId> {
        match &e.k {
            ExprKind::Id(n) => self.lookup(env, n).filter(|&t| self.syms[t].js_draft),
            ExprKind::Member { o, .. } | ExprKind::Index { o, .. } => self.draft_place(o, env),
            _ => None,
        }
    }
    fn expr_k(&mut self, e: &'a Expr, env: EId, ctx: Ctx, field: Option<&str>) {
        match &e.k {
            ExprKind::Lit(_) => {}
            ExprKind::Id(name) if self.value_ids.contains(&(e as *const Expr)) => self.escape_comp(name, env),
            ExprKind::Id(name) => {
                self.escape_comp(name, env);
                let s = self.resolve(name, env, ctx);
                if let Some(s) = s {
                    self.draft_here(s, name);
                    // MO-10i: a named draft callback is given to what hands it a draft, and used for nothing else
                    if self.syms[s].updater.is_some() && !self.updater_ok.contains(&(e as *const Expr)) {
                        self.err("DRAFT_ESCAPES", "MO-10i", format!("{name} is a draft callback (it is given to a function that hands its parameter a library's draft, and writes it): it is used only there, `setStore({name})` — called by hand, passed elsewhere or stored, it would be given something that is no draft, or keep one"));
                    }
                    // MO-10i: a function that hands its callback a draft is called by its own name, where the callback is written
                    if !self.syms[s].drafts.is_empty() && !self.callee_ids.contains(&(e as *const Expr)) {
                        self.err("DRAFT_ESCAPES", "MO-10i", format!("{name} hands its callback a library's draft: it is called by this name, with the callback written in the call (`{name}((d) => {{ … }})`), and not passed, stored or given another name — a function that travels would be given a callback the checker cannot see; share the change as an action"));
                    }
                    self.whole_use(e, env);
                    self.read(s, ctx, false, field);
                    match self.syms[s].kind {
                        // MO-11m: a made component's properties (`Router.paths`) are values
                        SymKind::Comp if field.is_some() && self.syms[s].factory.is_some() && !self.syms[s].renders => {}
                        SymKind::Comp => self.err("COMPONENT_AS_VALUE", "RG-4a", format!("component {} used as a value: apply it in a view, or pass it where JS takes one: a JS component's prop typed `Component` or `View`, or a JS factory's arguments (MO-11c, MO-11t, MO-11f)", name)),
                        SymKind::Context => self.err("CONTEXT_AS_VALUE", "RG-7", format!("context {} used as a value: read the nearest provision with `use {}`", name, name)),
                        _ => {}
                    }
                }
            }
            ExprKind::Pre { name, init } => {
                let s = self.resolve(name, env, ctx);
                if let Some(s) = s {
                    self.read(s, ctx, true, None);
                    if !self.syms[s].kind.reactive() {
                        self.err("PRE_OF_NON_REACTIVE", "C-2", format!("pre of {}, which is not reactive", name));
                    }
                }
                if let Some(i) = init {
                    self.expr(i, env, ctx, None);
                }
            }
            ExprKind::Use(name) => {
                if ctx.server {
                    self.err("SERVER_CAPTURE", "SF-3", format!("a server function's body reads `use {}`: a provision is the client's — pass it as an argument", name));
                }
                let c = self.ctx_of(name, env);
                if let Some(c) = c {
                    self.read(c, ctx, false, None);
                    let info = self.syms[c].ctx.clone().unwrap();
                    if !info.dflt {
                        let region = self.reg(env);
                        self.uses.push(UseRec { region, name: info.key, line: self.line, display: name.clone() });
                    }
                }
            }
            ExprKind::Peek(x) => {
                self.model.snap += 1;
                self.expr(x, env, ctx, None);
                self.model.snap -= 1;
            }
            ExprKind::Latest(x) | ExprKind::Pending(x) => {
                let save = self.model.probe;
                self.model.probe = Some(if matches!(&e.k, ExprKind::Latest(_)) { "latest" } else { "pending" });
                self.expr(x, env, ctx, None);
                self.model.probe = save;
            }
            ExprKind::Un { e: x, .. } => {
                self.whole_ok.insert(&**x as *const Expr); // `!q`, `typeof q`: no field of it is read
                self.expr(x, env, ctx, None)
            }
            ExprKind::Spread(x) => self.expr(x, env, ctx, None),
            ExprKind::Omit { e: x, keys } => {
                // MO-10f: the rest of a result is a value: every field that holds or fails is named beside it
                let named = match &x.k {
                    ExprKind::Id(n) => self.lookup(env, n).is_some_and(|t| self.syms[t].held.iter().all(|h| keys.iter().any(|k| h.0 == *k || h.0.starts_with(&format!("{k}."))))),
                    _ => false,
                };
                if named {
                    self.whole_ok.insert(&**x as *const Expr);
                }
                self.expr(x, env, ctx, None)
            }
            ExprKind::Await { e: inner, init, .. } => {
                self.awaited.insert(&**inner as *const Expr);
                if ctx.imperative && !self.stmt_awaits.contains(&(e as *const Expr)) {
                    let sh = show(e);
                    self.err(
                        "AWAIT_IN_EXPRESSION",
                        "AC-1",
                        format!("`{}` inside an expression of imperative scope: a run suspends only at a statement — bind it first, `let v = {}` (a `catch (e) => alt` may follow it)", sh, sh),
                    );
                }
                // MO-10i: the draft is the callback's only while the library's call of it runs
                if self.draft_cbs.last().is_some() && self.draft_cbs.last() == self.fn_stack.last() {
                    self.err("DRAFT_ESCAPES", "MO-10i", "an `await` in a callback that is handed a library's draft: the callback ends when the library's call of it does, and what runs after the `await` would write a draft the library has taken back — await first, then call the setter with what was answered".into());
                }
                self.awaited_calls.insert(&**inner as *const Expr);
                self.expr(inner, env, ctx, None);
                if let Some(i) = init {
                    self.expr(i, env, ctx, None);
                }
            }
            ExprKind::ServerFn { params, body, .. } => {
                let region = self.reg(env);
                let inner = self.env(Some(env), region);
                for p in params {
                    self.set_value(inner, p, self.line);
                }
                self.comp("server", env, None, None, |c| c.stmts(body, inner, Ctx { server: true, ..Ctx::imperative() }));
                if let Some(&sym) = self.server_exprs.get(&(e as *const Expr)) {
                    self.syms[sym].server_rejects = Some(ServerRejects::Body { body, env: inner, cache: None });
                }
            }
            ExprKind::Throw(x) => {
                self.sink(x, env, "thrown, to whichever boundary catches it".into());
                self.expr(x, env, ctx, None)
            }
            ExprKind::Catch { e: inner, name, classes, alt } => {
                if !matches!(&inner.k, ExprKind::Await { .. }) {
                    self.err(
                        "CATCH_NOT_ON_AWAIT",
                        "R-f-4",
                        format!("`{} catch …`: a catch follows an `await` — its rejection becomes an answer. A failure read from a value belongs to its own section: show it under `errored fallback(e) {{ … }} {{ … }}` where it is read", show(inner)),
                    );
                }
                self.expr(inner, env, ctx, None);
                if let Some(cs) = classes {
                    for n in cs {
                        self.err_class(n, env);
                    }
                }
                let region = self.reg(env);
                let ienv = self.env(Some(env), region);
                if let Some(n) = name {
                    self.set_value(ienv, n, self.line);
                }
                self.expr(alt, ienv, ctx, None);
            }
            ExprKind::Bin { op, l, r } => {
                // MO-10f: comparing a result, or testing it, reads no field of it
                if matches!(op.as_str(), "==" | "!=" | "===" | "!==") {
                    self.whole_ok.insert(&**l as *const Expr);
                    self.whole_ok.insert(&**r as *const Expr);
                } else if op == "&&" {
                    self.whole_ok.insert(&**l as *const Expr);
                }
                self.expr(l, env, ctx, None);
                self.expr(r, env, ctx, None);
            }
            ExprKind::If { c, t, f } => {
                self.whole_ok.insert(&**c as *const Expr);
                self.expr(c, env, ctx, None);
                self.expr(t, env, ctx, None);
                self.expr(f, env, ctx, None);
            }
            ExprKind::Tpl(parts) => {
                for p in parts {
                    if let TplPart::Expr(x) = p {
                        self.expr(x, env, ctx, None);
                    }
                }
            }
            ExprKind::Member { o, p, .. } => {
                if let Some((comp, field)) = self.prop_field(e, env) {
                    self.prop_named.entry(comp).or_default().insert(field); // MO-11l: for its signature's `keeps(…)`
                }
                let _ = p;
                self.whole_ok.insert(&**o as *const Expr);
                self.held_member(e, env);
                self.whole_use(e, env);
                self.part_use(e, env);
                if let ExprKind::Id(_) = &o.k {
                    self.expr(o, env, ctx, Some(p));
                } else {
                    self.expr(o, env, ctx, None);
                }
            }
            ExprKind::Index { o, i, .. } => {
                self.whole_ok.insert(&**o as *const Expr);
                self.held_member(e, env);
                self.whole_use(e, env);
                self.part_use(e, env);
                self.expr(o, env, ctx, None);
                self.expr(i, env, ctx, None);
            }
            ExprKind::Arr(items) => {
                for x in items {
                    self.expr(x, env, ctx, None);
                }
            }
            ExprKind::Rec(fields) => {
                for f in fields {
                    match f {
                        Field::Kv { v, .. } => self.expr(v, env, ctx, None),
                        Field::Spread(x) => self.expr(x, env, ctx, None),
                    }
                }
            }
            ExprKind::Call { f, args, .. } => {
                self.call_marks(f, args, env);
                // W-1a (2026-11-22): the value of a source, an equation or a prop is changed by a write, never in place:
                // `rows.push(x)` changes the array every reader holds and tells none of them
                if let ExprKind::Member { o, p, .. } = &f.k {
                    if ARRAY_MUTATORS.contains(&p.as_str()) && !self.draft_chain(o, env) {
                        if let Some(what) = self.reactive_place(o, env, 0) {
                            let fix = match p.as_str() {
                                "sort" => format!("`{}.toSorted(…)` gives a sorted copy", show(o)),
                                "reverse" => format!("`{}.toReversed()` gives a reversed copy", show(o)),
                                "splice" => format!("`{}.toSpliced(…)` gives a changed copy", show(o)),
                                _ => "write the new value, `xs := v => [...v, x]`, in the block that declares the source (or through an action it exports)".to_string(),
                            };
                            self.err("MUTATION_IN_PLACE", "W-1a", format!("{}(…) changes {what} in place: the value of a source, an equation or a prop is changed by a write (`:=`), which tells its readers — a change in place tells none, and changes what every other reader of it holds; {fix}", show(f)));
                        }
                    }
                }
                // MO-10i (2026-11-22): a JS fn whose declaration says it changes a parameter in place (`draft list`) is
                // given a draft as it is; anything else it would change behind its writes — the value of a source, an
                // equation or a prop, a store outside its setter — is refused, as a mutating method called on it is
                if let ExprKind::Id(fname) = &f.k {
                    let das = self.lookup(env, fname).map(|t| self.syms[t].draft_args.clone()).unwrap_or_default();
                    for i in das {
                        let Some(a) = args.get(i) else { continue };
                        if self.draft_chain(a, env) {
                            continue;
                        }
                        if let Some(what) = self.reactive_place(a, env, 0).or_else(|| self.store_of_drafts(a, env)) {
                            self.err("MUTATION_IN_PLACE", "W-1a", format!("{fname}(…) changes {what} in place (its declaration marks that parameter `draft`): a store is changed inside its setter, on the draft the library hands it — `set((d) => {{ {fname}(d.…) }})` — and the value of a source, an equation or a prop by a write (`:=`), which tells its readers; a change in place tells none"));
                        }
                    }
                }
                // MO-10b (2026-11-22): a function part of a declared result that answers nothing (`nextPage: () => void`)
                // is called for what it does: it is io, called from imperative scope
                if !ctx.imperative && self.void_method(f, env) {
                    if ctx.in_fn {
                        self.err("IO_IN_FN", "R-io-2", format!("{}(…) is io (its declaration says it answers nothing: it is called for what it does); a fn is pure by definition", show(f)));
                    } else if self.provided_action(f, env) {
                        self.err("ACTION_CALLED_IN_OWNED_SCOPE", "IO-2", format!("{}(…) is an action (what the context provides there), called in reactive scope (R-io-3): it would run, and write, while the view computes — call it from a handler or an action", show(f)));
                    } else {
                        self.err("IO_IN_REACTIVE", "IO-2", format!("{}(…) is io and is called in reactive scope (R-io-3): its declaration says it answers nothing (`() => void`), so it is called for what it does — from a handler or an action", show(f)));
                    }
                }
                // …and one that answers a promise starts work: not awaited, nothing waits for it and the view reads a promise
                if !ctx.imperative && !self.awaited.contains(&(e as *const Expr)) && !self.void_method(f, env) && self.promise_method(f, env) {
                    if ctx.in_fn {
                        self.err("IO_IN_FN", "R-io-2", format!("{}(…) is io (its declaration says it answers a promise: calling it starts work); a fn is pure by definition", show(f)));
                    } else {
                        self.err("IO_IN_REACTIVE", "IO-2", format!("{}(…) is io and is called in reactive scope (R-io-3): its declaration says it answers a promise, so calling it starts work, here on every computation, with nothing waiting for it — call it from a handler or an action; if it only asks, `await` it", show(f)));
                    }
                }
                if let ExprKind::Id(fname) = &f.k {
                    if fname == "until" && self.lookup(env, "until").is_none() {
                        if !ctx.imperative {
                            self.err("IO_IN_REACTIVE", "AC-6", "until(…) waits for the world to confirm a condition: it is called from imperative scope (an action or a handler), and awaited".into());
                        }
                        let ok = args.len() == 1 && matches!(&args[0].k, ExprKind::Fn { params, .. } if params.is_empty());
                        if !ok {
                            self.err("UNTIL_PREDICATE", "AC-6", "until takes a predicate, `until(() => e)`: a value would be read once and never change".into());
                            for a in args {
                                self.expr(a, env, ctx, None);
                            }
                            return;
                        }
                        self.expr(&args[0], env, Ctx { server: ctx.server, ..Ctx::reactive() }, None);
                        return;
                    }
                    // EF-7, EF-8: Solid's onSettled / onFlush, functions of the language
                    if (fname == "onSettled" || fname == "onFlush") && self.lookup(env, fname).is_none() {
                        let settled = fname == "onSettled";
                        let rule = if settled { "EF-7" } else { "EF-8" };
                        if !ctx.imperative {
                            self.err("IO_IN_REACTIVE", rule, if settled { "onSettled(…) schedules work from imperative scope (a handler, an apply block, an action); in a component body the mount hook is `effect () { … }` (EF-4)".into() } else { "onFlush(…) is called from imperative scope (a handler, an apply block, an action): it starts a run of its own after this flush".into() });
                        }
                        let ok = args.len() == 1 && matches!(&args[0].k, ExprKind::Fn { params, .. } if params.is_empty());
                        if !ok {
                            self.err("HOOK_CALLBACK", rule, format!("{} takes a closure, `{}(() => {{ … }})`: its body is the run it schedules", fname, fname));
                            for a in args {
                                self.expr(a, env, ctx, None);
                            }
                            return;
                        }
                        if settled && returns_closure(&args[0]) {
                            self.err("SETTLED_CLEANUP_UNOWNED", "EF-7", "an onSettled callback returns a cleanup, but it has no region to bind it to: setup with teardown is `effect () { … }` (EF-4, EF-5)".into());
                        }
                        // the callback is imperative scope
                        self.expr(&args[0], env, Ctx { server: ctx.server, ..Ctx::imperative() }, None);
                        return;
                    }
                    let s = self.lookup(env, fname);
                    let (io, kind, side, io_via, instantiating, arity) = match s {
                        Some(s) => (self.syms[s].io, Some(self.syms[s].kind), self.syms[s].side, self.syms[s].io_via.clone(), self.syms[s].instantiating, self.syms[s].arity),
                        None => (false, None, None, None, false, None),
                    };
                    if !ctx.imperative && (io || (s.is_none() && fname == "log")) {
                        if ctx.in_fn {
                            self.err("IO_IN_FN", "R-io-2", format!("{}(…) is io; a fn is pure by definition", fname));
                        } else {
                            let code = if kind == Some(SymKind::Action) { "ACTION_CALLED_IN_OWNED_SCOPE" } else { "IO_IN_REACTIVE" };
                            let gen = s.and_then(|s| self.syms[s].generated.clone()).map(|g| format!(" — its declaration is a draft generated from {g}'s types, which never guesses `pure`: if calling it writes nothing, declare it `pure fn` in rx-types/{g}.d.rx (MO-8l)")).unwrap_or_default();
                            self.err(code, "IO-2", format!("{}(…) is io and is called in reactive scope (R-io-3){}{}", fname, io_via.map(|v| format!(" — its server body calls {}", v)).unwrap_or_default(), gen));
                        }
                    }
                    if side == Some(Side::Client) && !ctx.imperative && !ctx.server && !self.awaited_calls.contains(&(e as *const Expr)) {
                        self.err(
                            "CLIENT_NOT_AWAITED",
                            "SF-5b",
                            format!("{}(…) is `client` JS: in reactive scope it is awaited — a client question, asked once the browser has the page (SV-7b) — never called for its value now", fname),
                        );
                    }
                    if kind == Some(SymKind::Fn) && instantiating {
                        self.err("INSTANTIATION_NOT_BOUND", "E-9", format!("{}(…) declares state: bind it, `x = {}(…)` (RG-6)", fname, fname));
                    }
                    if kind == Some(SymKind::Comp) {
                        self.err("COMPONENT_AS_VALUE", "RG-4a", format!("component {} called as a function: apply it in a view", fname));
                    }
                    if let Some(s) = s {
                        self.mark_callbacks(args, s);
                    }
                    if let (Some(SymKind::Action), Some(n)) = (kind, arity) {
                        if args.len() != n {
                            let takes = match n {
                                0 => "no arguments".to_string(),
                                1 => "1 argument".to_string(),
                                n => format!("{} arguments", n),
                            };
                            self.err("ARGUMENT_COUNT", "AC-1f", format!("{} takes {} and is called with {}: an action's parameters are its whole input — pass each one, and nothing it does not declare", fname, takes, args.len()));
                        }
                    }
                    self.model.call(s, kind.map(|k| k.as_str()).unwrap_or(""));
                    if s.is_some_and(|s| self.unplaced_fn(s)) {
                        self.unplaced(args, env); // MO-11s
                    }
                }
                self.expr(f, env, ctx, None);
                for a in args {
                    self.expr(a, env, ctx, None);
                }
            }
            ExprKind::Fn { params, body, stmts, .. } => {
                let region = self.reg(env);
                let inner = self.env(Some(env), region);
                let drafts = self.draft_fns.get(&(e as *const Expr)).cloned().unwrap_or_default();
                let srcs = self.fn_srcs.get(&(e as *const Expr)).cloned().unwrap_or_default();
                for (j, p) in params.iter().enumerate() {
                    self.set_value(inner, p, self.line);
                    let s = self.envs[inner].vars[p.as_str()];
                    // MO-10k: what the parameter may be given
                    self.syms[s].srcs = srcs.clone();
                    self.syms[s].of_fn = Some(e as *const Expr);
                    if drafts.contains(&j) {
                        // MO-10i
                        self.syms[s].js_draft = true;
                        self.syms[s].draft_fn = self.fn_stack.last().copied();
                    }
                }
                if let Some(ss) = stmts {
                    if !ctx.imperative && !self.callback_fns.contains(&(e as *const Expr)) {
                        self.err("REACTIVE_WRITE_IN_OWNED_SCOPE", "W-2", "a statement-bodied closure in reactive scope (SC-3: a closure created here is a pure function)".into());
                        return;
                    }
                    // AC-1b: an arrow that guesses, or writes and awaits, is an action
                    let why = if ctx.server { None } else { inferred_action(ss) };
                    self.stmts(ss, inner, Ctx { server: ctx.server, in_action: why.is_some(), ..Ctx::imperative() });
                    if let Some(w) = why {
                        self.actions.push(ActionRec { name: format!("inferred here (AC-1b: {})", trigger_text(w)), body: ss, env: inner, line: self.line });
                    }
                    if !ctx.server {
                        self.run_checks(ss, why.is_some(), params, why.is_some());
                    }
                    return;
                }
                self.expr(body, inner, Ctx { imperative: ctx.imperative, in_fn: ctx.in_fn, server: ctx.server, in_action: false }, None);
            }
            ExprKind::Draft { seed, body } => {
                self.expr(seed, env, ctx, None);
                let region = self.reg(env);
                let inner = self.env(Some(env), region);
                self.set_value(inner, "d", self.line);
                for s in body {
                    match &s.k {
                        StmtKind::Let { name, e, .. } => {
                            self.expr(e, inner, ctx, None);
                            self.set_value(inner, name, self.line);
                        }
                        StmtKind::Expr(x) => self.expr(x, inner, ctx, None),
                        StmtKind::Write { target, e } => {
                            if target.name != "d" || target.is_ctx() {
                                self.err("DRAFT_WRITE_OUTSIDE_DRAFT", "ST-3a", format!("a draft block writes only its draft, not {}{}", if target.is_ctx() { "use " } else { "" }, target.name));
                            }
                            for p in &target.path {
                                if let PathSeg::Expr(x) = p {
                                    self.expr(x, inner, ctx, None);
                                }
                            }
                            self.expr(e, inner, ctx, None);
                        }
                        other => self.err("ASYNC_STORE_SETTER", "ST-3b", format!("{} in a draft block: it is reactive scope (only let, expressions and writes to d)", other.kind())),
                    }
                }
            }
            ExprKind::StyleMap { .. } => {}
        }
    }

    // ---- imperative scope (SC-2) ----
    /// AC-1c, AC-1d, AC-1e over one imperative run (`crate::infer`).
    fn run_checks(&mut self, stmts: &[Stmt], action: bool, bound: &[String], inferred: bool) {
        self.run_checks_with(stmts, action, bound, inferred, vec![], None);
    }
    /// `answers_in`: a declared action's scope, where AC-1g asks which names are sources with a question.
    fn run_checks_with(&mut self, stmts: &[Stmt], action: bool, bound: &[String], inferred: bool, ptypes: Vec<Option<String>>, answers_in: Option<EId>) {
        let answered = |n: &str| answers_in.and_then(|env| self.lookup(env, n)).map_or(false, |t| self.syms[t].kind == SymKind::Source && self.syms[t].question);
        let stateful = |n: &str| answers_in.and_then(|env| self.lookup(env, n)).map_or(false, |t| self.syms[t].kind == SymKind::Source || self.syms[t].kind == SymKind::Eq);
        let found = run_findings(stmts, action, bound, inferred, &RunOpts { ptypes, answered: if answers_in.is_some() { Some(&answered) } else { None }, stateful: if answers_in.is_some() { Some(&stateful) } else { None } });
        for f in found {
            let n = &f.name;
            match f.code {
                Code::StaleCapture => {
                    let v = f.via.clone().unwrap_or_default();
                    self.err("STALE_CAPTURE", "AC-1g", format!("{n} := … after an `await` writes {v}, which is not the server's: {n} is the server's answer, and after the `await` it takes only what the server answered, plain arguments (an id, a title, an index) and its own value at the write (`{n} := rs => …`, finding rows there by id). A row passed in, or read from a source before the `await` or after it, is what the screen showed, and may be stale by now (a rename accepted, a reload, an earlier write declined, a write another action holds) — when the answer alone doesn't say where a row is now, re-ask the answers it left and joined (`refresh`)"))
                }
                Code::HeldWrite => self.err("HELD_WRITE", "AC-1c", format!("{n} := … comes before an `await` in a body that is an action because it writes and awaits (AC-1b), so it is held until the body ends (AC-1): for state that shows while the work runs, `guess {n} := …` (a source with a question, ST-5c); for a reset that lands now, `onFlush(() => {{ {n} := … }})` (EF-8); to hold it on purpose, declare the action (`action name() {{ … }}`); or write it after the `await`")),
                Code::StaleOwnRead => self.err("STALE_OWN_READ", "AC-1d", format!("{n} is read after this change wrote it: the read sees the committed value, not the write (W-4) — keep the value you wrote in a local (`let v = …; {n} := v`) and read that, or write functionally (`{n} := v => …`, W-6)")),
                Code::StaleWriteBack => self.err("STALE_WRITE_BACK", "AC-1e", format!("{n} := … after an `await` is computed from {n} as it was read before that `await`: whatever changed {n} in between (another action, a reload) is overwritten — write functionally (`{n} := v => …`, W-6), which applies to {n} as it stands at the write, or guess it (`guess`, AC-3) and let the answer replace the guess")),
            }
        }
        // AC-3 (2026-11-22): a guess lives over the hold of what its action waits for
        if action {
            let g = crate::infer::guess_facts(stmts);
            let line0 = self.line;
            if let Some((n, line)) = g.holdless {
                self.line = line as i64;
                self.err("GUESS_OUTSIDE_HOLD", "AC-3", format!("guess {n} := … in a run that starts nothing to wait for (no `await`, no `refresh` or `affects`, no write, no call that could): the hold it would live over ends with the run, so the guess is taken back in the instant it is made and nothing shows — a guess is for what the run is about to await (`guess {n} := …; await save(…)`); if this is {n}'s new value, write it (`{n} := …`)"));
            }
            if let Some((n, line, q)) = g.late {
                let msg = format!("guess {n} := … is written after `await {q}`: nothing shows until that answers — a guess is what the run shows while it waits, so write it before the `await` it is a guess about");
                self.advice.push(Diagnostic { code: "GUESS_AFTER_AWAIT".into(), rule: "AC-3".into(), line: line as i64, msg, file: self.opts.file.clone() });
            }
            self.line = line0;
        }
    }

    fn stmts(&mut self, ss: &'a [Stmt], env0: EId, ctx: Ctx) {
        let region = self.reg(env0);
        let env = self.env(Some(env0), region);
        // 99, advice (ASYNC_WATERFALL): the questions this run awaited and was not advised to move, each with the
        // locals bound since and whether its fn is io
        let mut asked: Vec<(String, HashSet<String>, bool)> = vec![];
        // a statement's diagnostics are placed on its own line; what follows the block, where it was
        let line0 = self.line;
        for (at, s) in ss.iter().enumerate() {
            self.line = s.line as i64;
            if let StmtKind::Let { e, .. } | StmtKind::Expr(e) = &s.k {
                let t = if let ExprKind::Catch { e: inner, .. } = &e.k { &**inner } else { e };
                if let ExprKind::Await { e: q, .. } = &t.k {
                    // a question: a declared JS fn awaited for what it answers — a `pure` one, or an io one whose
                    // answer the statement binds. An io call awaited for nothing (`await save(a)`) is a command, and
                    // so is anything else awaited: what follows may need what it did, and the order is the run's
                    let io = match &q.k {
                        ExprKind::Call { f, .. } => match &f.k {
                            ExprKind::Id(n) => self.lookup(env, n).filter(|&t| self.syms[t].kind == SymKind::Import).map(|t| self.syms[t].io),
                            _ => None,
                        },
                        _ => None,
                    };
                    match io.filter(|io| !io || matches!(s.k, StmtKind::Let { .. })) {
                        Some(io) => {
                            let mut names = IndexSet::new();
                            free_names(q, &HashSet::new(), &mut names);
                            // once for a question: the first one before it whose answer it does not read; told to
                            // move, it holds up none of those after it
                            match asked.iter().find(|(_, bound, _)| !names.iter().any(|n| bound.contains(strip_pre(n)))) {
                                Some((first, _, first_io)) => {
                                    let unless = if io || *first_io { " (they are declared io: unless one needs what the other did, which only a `pure` declaration rules out)" } else { "" };
                                    let msg = format!("`await {}` reads nothing that `await {first}` answered: asked one after the other, the second waits for the first for nothing{unless} — ask both first and await them together (a JS helper over `Promise.all`: `let [a, b] = await all([f(…), g(…)])`), or make each an equation (`a = await f(…)`), which Solid asks side by side", show(q));
                                    self.advice.push(Diagnostic { code: "ASYNC_WATERFALL".into(), rule: "R-pending".into(), line: self.line, msg, file: self.opts.file.clone() });
                                }
                                None => asked.push((show(q), HashSet::new(), io)),
                            }
                        }
                        None => asked.clear(),
                    }
                }
            }
            if let StmtKind::Let { name, .. } = &s.k {
                for (_, bound, _) in asked.iter_mut() {
                    bound.insert(name.clone());
                }
            }
            // EF-5a (2026-11-22): a call that answers what undoes it (`onShortcut(…): () => void`), with that dropped —
            // the statement's value, or a local that some path through the rest of the block never names
            if let StmtKind::Let { e, .. } | StmtKind::Expr(e) = &s.k {
                if let ExprKind::Call { f, .. } = &e.k {
                    if let ExprKind::Id(n) = &f.k {
                        if let Some(decl) = self.lookup(env, n).and_then(|t| self.syms[t].disposer.clone()) {
                            let dropped = match &s.k {
                                StmtKind::Let { name, .. } => {
                                    let mut used = IndexSet::new();
                                    free_names_stmts(&ss[at + 1..], &HashSet::new(), &mut used);
                                    let paths = disposer_paths(&ss[at + 1..], name, false);
                                    if !used.contains(name) {
                                        Some(format!("`{name}` is never used after it is bound"))
                                    } else if paths.left || (paths.ends && !paths.named) {
                                        Some(format!("`{name}` is not used on every path after it is bound (a branch that is not taken, an early `return`, another name for it that is never used: the run ends there without it)"))
                                    } else {
                                        None
                                    }
                                }
                                _ => Some("the call is a statement, and what it answers is dropped".to_string()),
                            };
                            if let Some(why) = dropped {
                                self.err("DISPOSER_DROPPED", "EF-5a", format!("{n}(…) answers what undoes it (its declaration: `{decl}`), and {why}: what it set up — a listener, a subscription, a timer — then outlives the component — keep it and call it when the region ends: in `effect () {{ let stop = {n}(…); return () => {{ stop() }} }}`, or from the handler that ends it"));
                            }
                        }
                    }
                }
            }
            if let StmtKind::Let { e, .. } | StmtKind::Expr(e) = &s.k {
                let t = if let ExprKind::Catch { e: inner, .. } = &e.k { &**inner } else { e };
                if let ExprKind::Await { .. } = &t.k {
                    self.stmt_awaits.insert(t as *const Expr);
                }
            }
            match &s.k {
                StmtKind::Let { name, e, .. } => {
                    let updater = self.updater_positions(name, e, env); // MO-10i: a named draft callback
                    self.expr(e, env, ctx, None);
                    let captures = self.stored(e, env, &mut HashSet::new(), false);
                    let ret = self.stored(e, env, &mut HashSet::new(), true);
                    let mut sym = Sym::new(SymKind::Value, name, region, self.line);
                    sym.updater = updater;
                    sym.captures = captures;
                    sym.ret_captures = Some(ret);
                    sym.val = Some((e, env)); // MO-10k
                    let id = self.new_sym(sym);
                    if matches!(e.k, ExprKind::Fn { .. }) {
                        self.fn_owner.insert(e as *const Expr, id);
                    }
                    self.envs[env].vars.insert(name.clone(), id);
                }
                StmtKind::Expr(e) => self.expr(e, env, ctx, None),
                StmtKind::Throw(e) => {
                    self.sink(e, env, "thrown, to whichever boundary catches it".into());
                    self.expr(e, env, ctx, None)
                }
                StmtKind::Return(e) => {
                    if let Some(e) = e {
                        self.expr(e, env, ctx, None);
                    }
                }
                // 07 §5: a loop over what `e` holds now; its variable is a constant of each turn
                StmtKind::For { name, e, body } => {
                    self.expr(e, env, ctx, None);
                    let lenv = self.env(Some(env), region);
                    let mut v = Sym::new(SymKind::Value, name, region, self.line);
                    v.srcs.push((e, env)); // MO-10k
                    // MO-10i: a turn of a loop over a path of a draft is a place of that draft
                    if let Some(d) = self.draft_place(e, env) {
                        v.js_draft = true;
                        v.draft_fn = self.syms[d].draft_fn;
                    }
                    let v = self.new_sym(v);
                    self.envs[lenv].vars.insert(name.clone(), v);
                    self.stmts(body, lenv, ctx);
                }
                StmtKind::Write { target, e } | StmtKind::Optimistic { target, e } => {
                    // ST-4d (2026-11-22): rows written out with two alike keys, where a keyed list is written or guessed —
                    // the new value, or what an updater answers (`rows := rs => [{ id: 9 }, { id: 9 }, ...rs]`)
                    if target.path.is_empty() && !target.is_ctx() {
                        if let Some(t) = self.lookup(env, &target.name) {
                            if let Some(k) = self.syms[t].row_key.clone() {
                                let val = match &e.k {
                                    ExprKind::Fn { body, stmts: None, .. } => &**body,
                                    _ => e,
                                };
                                if let Some(v) = duplicate_key(val, &k) {
                                    let name = self.syms[t].name.clone();
                                    self.err("DUPLICATE_KEY", "ST-4d", format!("{name} is keyed by {k}, and two of the rows written here have {k}: {v} — a key names one row: rows with one key share one identity, so one's state shows for both, or one is dropped. Give each row its own {k}"));
                                }
                            }
                        }
                    }
                    // W-1a: a functional write's function is given the slot's value: it answers the next one, and does
                    // not change the one it is given
                    if matches!(e.k, ExprKind::Fn { .. }) && target.path.is_empty() && self.lookup(env, &target.name).is_some_and(|t| self.syms[t].kind == SymKind::Source) {
                        self.write_fns.insert(e as *const Expr);
                    }
                    self.sink(e, env, format!("written to {}", target.name));
                    let op = if matches!(&s.k, StmtKind::Optimistic { .. }) { "optimistic" } else { "write" };
                    if ctx.server {
                        self.err(
                            "SERVER_WRITE",
                            "SF-4",
                            format!(
                                "a server function writes {}{}: return the value, and write it in the action that awaited the call (`let r = await f(…); {} := r`)",
                                if target.is_ctx() { "use " } else { "" },
                                target.name,
                                target.name
                            ),
                        );
                        for p in &target.path {
                            if let PathSeg::Expr(x) = p {
                                self.expr(x, env, ctx, None);
                            }
                        }
                        self.expr(e, env, ctx, None);
                        continue;
                    }
                    let mut tsym = None;
                    if target.is_ctx() {
                        if let Some(c) = self.ctx_of(&target.name, env) {
                            self.model.write(Some(c), op, !target.path.is_empty());
                            let info = self.syms[c].ctx.clone().unwrap();
                            self.uses.push(UseRec { region, name: info.key.clone(), line: self.line, display: target.name.clone() });
                            if !info.source {
                                self.err("WRITE_TO_NON_SOURCE", "O-4", format!("context {} is read beneath its provision: call an action it provides that writes it", target.name));
                            }
                        }
                    } else {
                        tsym = self.resolve(&target.name, env, ctx);
                        if op == "write" && !target.path.is_empty() && tsym.is_some_and(|t| self.syms[t].js_draft) {
                            // MO-10i: a path of a library's draft: the library's write, not a source's
                            self.draft_here(tsym.unwrap(), &target.name);
                            // W-6: an updater is applied in place, as this statement
                            if matches!(&e.k, ExprKind::Fn { params, stmts: None, .. } if params.len() == 1) {
                                self.updaters.insert(e as *const Expr);
                            }
                            for p in &target.path {
                                if let PathSeg::Expr(x) = p {
                                    self.expr(x, env, ctx, None);
                                }
                            }
                            self.expr(e, env, ctx, None);
                            continue;
                        }
                        self.model.write(tsym, op, !target.path.is_empty());
                        if let Some(t) = tsym {
                            self.changed.insert(t); // E-5a
                            let k = self.syms[t].kind;
                            // AC-3: a guess may sit over an equation (Solid's createOptimistic(fn)); it is not a write of the truth
                            let guessable = op == "optimistic" && k == SymKind::Eq && self.syms[t].eq_decl.is_some() && !self.syms[t].param && self.syms[t].imported.is_none();
                            if guessable && self.syms[t].eq_decl == Some(true) {
                                self.err(
                                    "GUESS_ON_DEFERRED",
                                    "AC-3",
                                    format!("{} is deferred: its value is a lagging copy (V-16), so nothing would confirm a guess on it — guess the equation it lags", target.name),
                                );
                            } else if guessable {
                            } else if k != SymKind::Source {
                                let what = match k {
                                    SymKind::Eq => "an equation".to_string(),
                                    SymKind::Props => "props".to_string(),
                                    k => format!("a {}", k.as_str()),
                                };
                                let hint = if self.syms[t].js_draft {
                                    format!(" — a library's draft is written along its paths (`{}.field := …`), or the callback returns the new value (MO-10i)", target.name)
                                } else if let Some((v, _)) = self.syms[t].val.filter(|&(v, venv)| k == SymKind::Value && self.draft_chain(v, venv)) {
                                    // MO-10i: a draft's read that has a name of its own is a copy (a row found in it)
                                    format!(" — {} is a copy of what `{}` read from the draft (a read of a draft that is kept is a copy, MO-10i), so a write to it would change nothing: write the place — `let i = ….findIndex(…); ….[i].field := …` — or the row in a loop, `for (const row of …) {{ if (…) {{ row.field := … }} }}`", target.name, show(v))
                                } else if k == SymKind::Value && !target.path.is_empty() {
                                    " — a field of a callback's parameter is written only when the library declares it a draft, `(draft state: T) => void` (MO-10i)".to_string()
                                } else if k == SymKind::Props || k == SymKind::Value || self.syms[t].param {
                                    " — a source is written only in the region that declares it: have its owner pass an action that writes it (O-4)".to_string()
                                } else {
                                    String::new()
                                };
                                self.err("WRITE_TO_NON_SOURCE", "W-1", format!("{} is {}: only sources are written{}", target.name, what, hint));
                            } else if let Some(imp) = self.syms[t].imported.clone() {
                                self.err(
                                    "WRITE_TO_NON_SOURCE",
                                    "MO-2",
                                    format!("{} is a source of {}: a module boundary is a value boundary — write it through an action {} exports", target.name, imp, imp),
                                );
                            }
                        }
                    }
                    if op == "optimistic" {
                        if !ctx.in_action {
                            self.err("GUESS_OUTSIDE_HOLD", "AC-3", "a guess outside an action: it needs a hold to live in — an apply block is never an action (its return is the cleanup, EF-5): declare one, `action save(v) { guess … }`, and call it from the block".into());
                        }
                    }
                    for p in &target.path {
                        if let PathSeg::Expr(x) = p {
                            self.expr(x, env, ctx, None);
                        }
                    }
                    self.expr(e, env, ctx, None);
                    self.later.push(Later::Escape { target, e, tsym, env, line: self.line }); // O-3: after every fn's result is known
                }
                StmtKind::Refresh(name) | StmtKind::Affects(name) => {
                    let is_refresh = matches!(&s.k, StmtKind::Refresh(_));
                    if ctx.server {
                        self.err(
                            "SERVER_CAPTURE",
                            "SF-3",
                            format!("`{} {}` in a server function's body: it is the client's (do it in the action that awaited the call)", if is_refresh { "refresh" } else { "affects" }, name),
                        );
                        continue;
                    }
                    let t = self.resolve(name, env, ctx);
                    if let Some(t) = t {
                        self.changed.insert(t); // E-5a
                    }
                    if is_refresh {
                        self.model.write(t, "refresh", false);
                        if let Some(t) = t {
                            let k = self.syms[t].kind;
                            if !(k == SymKind::Eq || (k == SymKind::Source && self.syms[t].question)) {
                                self.err("INVALID_REFRESH_TARGET", "AC-4", format!("{} has no question to re-ask", name));
                            }
                        }
                    } else {
                        self.model.write(t, "affects", false);
                        if let Some(t) = t {
                            if !self.syms[t].kind.reactive() {
                                self.err("INVALID_AFFECTS_TARGET", "AC-5", format!("{} is not reactive", name));
                            }
                        }
                    }
                }
                StmtKind::Action(body) => {
                    if ctx.server {
                        self.err("SERVER_CAPTURE", "SF-3", "`action { … }` in a server function's body: it is the client's (do it in the action that awaited the call)".into());
                        continue;
                    }
                    self.comp("action", env, Some("(inline)".into()), None, |c| c.stmts(body, env, Ctx { in_action: true, ..Ctx::imperative() }));
                    self.actions.push(ActionRec { name: "(inline)".into(), body, env, line: self.line });
                    self.run_checks(body, true, &[], false);
                }
                StmtKind::Sif { c, t, f } => {
                    self.whole_ok.insert(c as *const Expr); // MO-10f: a condition reads no field
                    self.expr(c, env, ctx, None);
                    self.stmts(t, env, ctx);
                    self.stmts(f, env, ctx);
                }
                StmtKind::Try { body, catch_name, catch_classes, handler, fin } => {
                    self.stmts(body, env, ctx);
                    if let Some(cs) = catch_classes {
                        for n in cs {
                            self.err_class(n, env);
                        }
                    }
                    if let Some(h) = handler {
                        let henv = self.env(Some(env), region);
                        if let Some(n) = catch_name {
                            self.set_value(henv, n, self.line);
                        }
                        self.stmts(h, henv, ctx);
                    }
                    if let Some(f) = fin {
                        self.stmts(f, env, ctx);
                    }
                }
            }
        }
        self.line = line0;
    }

    /// The reactive names captured by closures that a value stores (O-3). A functional write's own function is applied, not
    /// stored, and so is a closure handed to a prelude function (`map(xs, x => …)`). Through a name: a `let`'s captures, an
    /// equation's expression; through a call: what the fn's result captures — for an instantiation (RG-6), a name of the
    /// instance stands for the instance, which lives as long as the region of the call. A prop is marked (`prop_of`): what it
    /// captures is the caller's.
    fn stored(&mut self, e: &'a Expr, env: EId, seen: &mut HashSet<SId>, result: bool) -> Vec<SId> {
        let mut out = vec![];
        self.stored_walk(Node::E(e), env, seen, result, &mut out);
        out
    }
    fn prop_mark(&mut self, s: SId, name: String, field: &str) -> SId {
        let (region, line) = (self.syms[s].region, self.syms[s].line);
        let mut m = Sym::new(SymKind::Props, &name, region, line);
        m.prop_of = Some((region, field.to_string()));
        self.new_sym(m)
    }
    /// `res`: the value is called, and only what the call returns is stored — a closure stores nothing then unless its body
    /// makes one.
    fn stored_walk(&mut self, x: Node<'a>, env: EId, seen: &mut HashSet<SId>, res: bool, out: &mut Vec<SId>) {
        match x {
            Node::E(f @ Expr { k: ExprKind::Fn { .. }, .. }) => {
                if res && !contains_fn(f) {
                    return;
                }
                for n in names_of(f) {
                    if let Some(s) = self.lookup(env, strip_pre(&n)) {
                        if self.syms[s].kind.reactive() {
                            out.push(s);
                        }
                        out.extend(self.syms[s].captures.iter().copied());
                    }
                }
            }
            Node::E(Expr { k: ExprKind::Id(n), .. }) => {
                let Some(s) = self.lookup(env, n) else { return };
                let caps = match (&self.syms[s].ret_captures, res) {
                    (Some(r), true) => r.clone(),
                    _ => self.syms[s].captures.clone(),
                };
                out.extend(caps);
                if self.syms[s].kind == SymKind::Props {
                    let m = self.prop_mark(s, self.syms[s].name.clone(), "*");
                    out.push(m);
                }
                if self.syms[s].kind == SymKind::Eq && !seen.contains(&s) {
                    if let Some((xe, xenv)) = self.syms[s].expr {
                        seen.insert(s);
                        let c = self.stored(xe, xenv, seen, res);
                        out.extend(c);
                    }
                }
            }
            Node::E(Expr { k: ExprKind::Member { o, p, .. }, .. }) if matches!(&o.k, ExprKind::Id(n) if self.lookup(env, n).is_some_and(|s| self.syms[s].kind == SymKind::Props)) => {
                let ExprKind::Id(n) = &o.k else { unreachable!() };
                let s = self.lookup(env, n).unwrap();
                let m = self.prop_mark(s, format!("{}.{}", self.syms[s].name, p), p);
                out.push(m);
            }
            Node::E(Expr { k: ExprKind::Call { f, args, .. }, .. }) => {
                let fs = match &f.k {
                    ExprKind::Id(name) => self.lookup(env, name),
                    _ => None,
                };
                if let ExprKind::Id(name) = &f.k {
                    if fs.is_none() && BUILTINS.contains(&name.as_str()) {
                        // a prelude function applies the closures it is given
                        for a in args {
                            let r = res || matches!(a.k, ExprKind::Fn { .. });
                            self.stored_walk(Node::E(a), env, seen, r, out);
                        }
                        return;
                    }
                }
                if let Some(fs) = fs {
                    if self.syms[fs].kind == SymKind::Fn && !seen.contains(&fs) {
                        if let Some((tail, fenv)) = self.syms[fs].fn_tail {
                            seen.insert(fs);
                            let r = self.reg(fenv);
                            let mut inst: Option<SId> = None;
                            for c in self.stored(tail, fenv, seen, res) {
                                let mut q = Some(self.syms[c].region);
                                while let Some(qi) = q {
                                    if qi == r {
                                        break;
                                    }
                                    q = self.regions[qi].parent;
                                }
                                if self.syms[fs].instantiating && q.is_some() && self.syms[c].prop_of.is_none() {
                                    let i = match inst {
                                        Some(i) => i,
                                        None => {
                                            let i = self.new_sym(Sym::new(SymKind::Eq, &format!("an instance of {}", self.syms[fs].name), self.reg(env), self.line));
                                            inst = Some(i);
                                            i
                                        }
                                    };
                                    out.push(i);
                                } else {
                                    out.push(c);
                                }
                            }
                            seen.remove(&fs);
                        }
                    }
                }
                // the callee is applied; what it returns may be an argument
                self.stored_walk(Node::E(f), env, seen, true, out);
                for a in args {
                    self.stored_walk(Node::E(a), env, seen, false, out);
                }
            }
            _ => {
                for c in children(x, false) {
                    self.stored_walk(c, env, seen, res, out);
                }
            }
        }
    }
    fn escape(&mut self, target: &Target, e: &'a Expr, tsym: Option<SId>, env: EId) {
        let value = match &e.k {
            ExprKind::Fn { body, stmts: None, .. } => &**body,
            _ => e,
        };
        let captured = self.stored(value, env, &mut HashSet::new(), false);
        if captured.is_empty() {
            return;
        }
        let mut prov: Option<String> = None;
        let t_depth = match tsym {
            Some(t) => self.regions[self.syms[t].region].depth,
            None => {
                let key = self.lookup(env, &target.name).and_then(|s| self.syms[s].ctx.as_ref().map(|c| c.key.clone())).unwrap_or_else(|| target.name.clone());
                let mut r = Some(self.reg(env));
                let mut found = None;
                while let Some(ri) = r {
                    if self.regions[ri].provides.contains(&key) {
                        found = Some(ri);
                        break;
                    }
                    if self.regions[ri].is_component_root {
                        break;
                    }
                    r = self.regions[ri].parent;
                }
                if found.is_none() {
                    prov = Some(key);
                }
                match found {
                    Some(f) => self.regions[f].depth,
                    None => match self.regions[self.reg(env)].component {
                        Some(c) => self.regions[c].depth - 1,
                        None => 0,
                    },
                }
            }
        };
        if let Some(&leak) = captured.iter().find(|&&c| self.syms[c].prop_of.is_none() && self.regions[self.syms[c].region].depth > t_depth) {
            let ln = self.syms[leak].name.clone();
            self.err(
                "REGION_ESCAPE",
                "O-3",
                format!("a closure capturing {} (declared in a region that ends sooner) is stored into {}{}, which outlives it", ln, if target.is_ctx() { "use " } else { "" }, target.name),
            );
        }
        for c in captured {
            if let Some((comp, field)) = self.syms[c].prop_of.clone() {
                if t_depth < self.regions[comp].depth {
                    let t = match &prov {
                        Some(k) => format!("p:{}", k),
                        None => format!("d:{}", t_depth),
                    };
                    self.retain(comp, &field, t); // checked where the component is applied
                }
            }
        }
    }
    fn retain(&mut self, comp: RId, field: &str, t: String) -> bool {
        self.retains.entry(comp).or_default().entry(field.to_string()).or_default().insert(t)
    }
    /// O-3 at an application: a closure passed for a prop the component stores must not capture a name that ends before where
    /// it is stored. A provision's place is found from the site; a prop passed on (`x={props.y}`) is stored by this component too.
    fn retained(&mut self) {
        let targets = |this: &Self, c: RId, field: &str| -> Vec<String> {
            if let Some(sig) = &this.regions[c].sig {
                // a spread ("*") goes wherever any field goes
                let mut v: Vec<String> = if field == "*" { sig.stored.values().flatten().cloned().collect() } else { sig.stored.get(field).cloned().unwrap_or_default() };
                if field != "*" {
                    v.extend(sig.stored.get("*").cloned().unwrap_or_default());
                }
                return v.into_iter().map(|t| if t == "module" { "d:0".to_string() } else { format!("p:{}", t) }).collect();
            }
            let Some(m) = this.retains.get(&c) else { return vec![] };
            let mut v: Vec<String> = if field == "*" { m.values().flatten().cloned().collect() } else { m.get(field).map(|x| x.iter().cloned().collect()).unwrap_or_default() };
            if field != "*" {
                v.extend(m.get("*").map(|x| x.iter().cloned().collect::<Vec<_>>()).unwrap_or_default());
            }
            v
        };
        let mut changed = true;
        while changed {
            changed = false;
            for ai in 0..self.apps.len() {
                let (acomp, asite, aline, atag) = (self.apps[ai].comp, self.apps[ai].site, self.apps[ai].line, self.apps[ai].tag.clone());
                for xi in 0..self.apps[ai].passed.len() {
                    let (field, xe, xenv) = self.apps[ai].passed[xi].clone();
                    let ts = targets(self, acomp, &field);
                    if ts.is_empty() {
                        continue;
                    }
                    let cap = self.stored(xe, xenv, &mut HashSet::new(), false);
                    for t in ts {
                        let limit = match t.strip_prefix("d:") {
                            Some(d) => d.parse::<i64>().unwrap_or(0),
                            None => self.prov_anchor(asite, &t[2..]),
                        };
                        if let Some(&leak) = cap.iter().find(|&&c| self.syms[c].prop_of.is_none() && self.regions[self.syms[c].region].depth > limit) {
                            self.line = aline;
                            let ln = self.syms[leak].name.clone();
                            self.err(
                                "REGION_ESCAPE",
                                "O-3",
                                format!(
                                    "<{} {}>: the closure passed captures {} (declared in a region that ends sooner), and {} stores {} (itself, or through a component it passes it to) where it outlives it",
                                    atag, arg_show(&field), ln, atag, if field == "*" { "a field of it" } else { field.as_str() }
                                ),
                            );
                        }
                        for &c in &cap {
                            if let Some((comp, f)) = self.syms[c].prop_of.clone() {
                                if limit < self.regions[comp].depth && self.retain(comp, &f, t.clone()) {
                                    changed = true;
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    /// The depth, in the site's lexical tree, of the region a provision written from beneath `site` lives as long as.
    fn prov_anchor(&self, site: RId, key: &str) -> i64 {
        let mut r = Some(site);
        while let Some(ri) = r {
            let reg = &self.regions[ri];
            if reg.provides.contains(key) {
                return reg.depth;
            }
            if let Some((comp, ksite)) = reg.kids {
                // RG-4c: children see the component's provisions, then the site's
                if self.regions[comp].provides.contains(key) {
                    return self.regions[ksite].depth;
                }
                r = Some(ksite);
                continue;
            }
            if reg.is_component_root {
                return reg.depth - 1; // above the component: it outlives every name in it
            }
            r = reg.parent;
        }
        0
    }

    // ---- views ----
    fn markup(&mut self, ms: &'a [Markup], env: EId, view_root: bool) {
        let mut styles = 0;
        for m in ms {
            if let Some(l) = m.line {
                self.line = l as i64;
            }
            let region = self.reg(env);
            match &m.kind {
                MarkupKind::Text(_) => {}
                MarkupKind::Style(_) => {
                    if !view_root {
                        self.err("STYLE_PLACEMENT", "CSS-1", "a <style> is written at the top level of a component's view (or the program's): it scopes that whole view, branches and loops included — move it there".into());
                    } else {
                        styles += 1;
                        if styles > 1 {
                            self.err("STYLE_PLACEMENT", "CSS-1", "a second <style> in one view: a view has one stylesheet".into());
                        }
                    }
                }
                MarkupKind::Read(e) => {
                    self.comp("reader", env, None, Some("{…}".into()), |c| c.expr(e, env, Ctx::reactive(), None));
                    self.keep(e, env);
                    self.readers.push(ReaderRec { region, e, env, line: self.line });
                }
                MarkupKind::El { tag, attrs, children } => {
                    if is_upper_tag(tag) {
                        let s = self.lookup(env, tag);
                        let is_comp = s.is_some_and(|s| self.syms[s].kind == SymKind::Comp);
                        if !is_comp {
                            if let Some(s) = s.filter(|s| self.syms[*s].kind == SymKind::Import) {
                                let msg = unknown_js_component(tag, self.syms[s].undeclared.as_deref());
                                self.err("UNKNOWN_COMPONENT", "RG-4a", msg);
                            } else {
                                self.err("UNKNOWN_COMPONENT", "RG-4a", format!("<{}> is not a component declared here", tag));
                            }
                        }
                        for a in attrs.iter() {
                            let prop = s.filter(|_| is_comp).and_then(|s| self.syms[s].comp_region).map(|cr| (cr, field_of(&a.name), a.name.clone()));
                            self.sinks.push(Sink { e: Some(&a.e), names: vec![], env, line: self.line, why: format!("passed to <{tag}> as {}", a.name), prop });
                        }
                        // MO-11o (revised 2026-11-21): a value another .rx module made carries what that module's own
                        // render checked; its signature says nothing of it, so rendering it here would be unchecked. A prop
                        // of this component, given on to a prop that renders what it carries, is one this component renders
                        // in turn (2026-11-22): its components are named and checked where this component is applied
                        let carried_props = self.lookup(env, tag).and_then(|s| self.syms[s].comp_region).and_then(|r| self.carried_props.get(&r).cloned()).unwrap_or_default();
                        let mut forwards: Vec<(String, RId, String)> = vec![];
                        for a in attrs.iter().filter(|a| carried_props.contains(&a.name)) {
                            if let Some((comp, field)) = self.prop_field(&a.e, env) {
                                if self.carried_props.get(&comp).is_some_and(|c| c.contains(&field)) {
                                    forwards.push((a.name.clone(), comp, field));
                                    continue;
                                }
                            }
                            let mut opaque = vec![];
                            self.carried_names(&a.e, env, &mut IndexSet::new(), &mut vec![], &mut opaque);
                            if let Some((n, why)) = opaque.into_iter().next() {
                                self.err("RENDERS_ESCAPES", "MO-11o", format!("<{tag}> renders what its {} carries, and {n} is {why}: the components it carries cannot be named here, so they would render unchecked — give {} a value this module builds from its own `renders(later)` calls, or a prop of this component read as it is (`props.x`), which is then one this component renders", a.name, a.name));
                            }
                        }
                        // MO-10f (2026-11-22): a result with held fields, or a record of them, is given whole to a prop whose
                        // type says those fields hold or fail (at least as the result's do): the component reads them as
                        // such, each read checked where it is
                        if let Some(ph) = self.lookup(env, tag).and_then(|s| self.syms[s].comp_region).and_then(|r| self.prop_held.get(&r).cloned()) {
                            for a in attrs.iter() {
                                let given = self.held_under(&a.e, env);
                                if given.is_empty() {
                                    continue;
                                }
                                let covered = given.iter().all(|(p, holds, fails)| {
                                    ph.iter().any(|(q, qh, qf)| *q == format!("{}.{p}", a.name) && (*qh || !holds) && fails.iter().all(|c| qf.contains(c) || qf.iter().any(|x| x == "Error")))
                                });
                                if covered {
                                    self.whole_ok.insert(&a.e as *const Expr);
                                }
                            }
                        }
                        let values = self.component_values(tag, attrs, env);
                        for (i, _) in &values {
                            if let Some(Attr { e: Expr { k: ExprKind::Id(n), .. }, .. }) = attrs.get(*i) {
                                self.escape_comp(n, env); // E-5a: a JS component applies it
                            }
                        }
                        // MO-11o: the carried values a `renders` prop reached are rendered here
                        let reached: Vec<*const Expr> = self.reached.borrow_mut().drain().collect();
                        self.carried_rendered.extend(reached);
                        let args: Vec<&'a Attr> = attrs.iter().enumerate().filter(|(i, _)| !values.iter().any(|(j, _)| j == i)).map(|(_, a)| a).collect();
                        // MO-10g: a JS component's prop typed as a function is what its declaration says (`handler`, or pure),
                        // whatever its name; an untyped `on…` prop keeps SC-4. `ref` is a handler on an element (07 §4: the DOM
                        // calls it once, with the node), not on a component, which calls its props when it likes: there it is
                        // a prop as any other, a handler only when the declaration says so (MO-10g, 13 revised 2026-11-21)
                        let cbs = s.and_then(|s| self.syms[s].comp_region).and_then(|r| self.callback_props.get(&r).cloned()).unwrap_or_default();
                        let pures = s.and_then(|s| self.syms[s].comp_region).and_then(|r| self.pure_props.get(&r).cloned()).unwrap_or_default();
                        let handles = |n: &str| cbs.contains(n) || (n != "ref" && !pures.contains(n) && is_handler(n));
                        for a in &args {
                            let h = handles(&a.name);
                            if h {
                                self.handler_called(&a.e, env, &a.name);
                            }
                            let c2 = if h { Ctx::imperative() } else { Ctx::reactive() };
                            self.comp(if h { "handler" } else { "prop" }, env, None, Some(format!("{} {}", tag, a.name)), |c| c.expr(&a.e, env, c2, None));
                            if !h {
                                self.keep(&a.e, env);
                            }
                        }
                        if is_comp {
                            let cr = self.syms[s.unwrap()].comp_region.unwrap();
                            self.apps.push(AppRec { comp: cr, site: region, line: self.line, tag: tag.clone(), args: args.iter().filter(|a| !handles(&a.name)).map(|a| (field_of(&a.name), &a.e, env)).collect(), passed: args.iter().map(|a| (field_of(&a.name), &a.e, env)).collect() });
                            let kids = self.region(Some(region), "children", false, Some(tag.clone()));
                            self.regions[kids].kids = Some((cr, region));
                            let kenv = self.env(Some(env), kids);
                            let renders = self.render_props.get(&cr).cloned().unwrap_or_default();
                            for x in children.iter() {
                                // MO-11k: a named render prop
                                if let MarkupKind::Mview { prop: Some(p), .. } = &x.kind {
                                    if !renders.contains(p) {
                                        self.err("VIEW_FN_MISPLACED", "MO-11k", format!("<{}> declares no render prop {} (a prop typed as a function giving a View)", tag, p));
                                    }
                                    // reported once; its body is still checked
                                    self.view_fns.insert(x as *const Markup);
                                }
                            }
                            if renders.contains("children") {
                                // MO-11k: children are one view lambda
                                let real: Vec<&Markup> = children.iter().filter(|x| !matches!(&x.kind, MarkupKind::Text(t) if js_trim(t).is_empty()) && !matches!(&x.kind, MarkupKind::Mview { prop: Some(_), .. })).collect();
                                // an optional render prop left out is the component's own rendering (`<Select.Listbox />`)
                                let left_out = real.is_empty() && self.render_optional.get(&cr).is_some_and(|o| o.contains("children"));
                                if !left_out && (real.len() != 1 || !matches!(real[0].kind, MarkupKind::Mview { .. })) {
                                    self.err("VIEW_FN_EXPECTED", "MO-11k", format!("<{}>'s children are a function of what it renders: write them as `{{view (item) {{ … }}}}`", tag));
                                }
                                for x in real {
                                    if matches!(x.kind, MarkupKind::Mview { .. }) {
                                        self.view_fns.insert(x as *const Markup);
                                    }
                                }
                            }
                            self.markup(children, kenv, false);
                            for (_, v) in &values {
                                self.apply_tree(v, m.line, kenv);
                            }
                            // MO-11o: where what a prop carries is rendered — for a JS component, among its children; for
                            // an .rx one, where it renders that prop itself
                            let js = self.regions[cr].js;
                            let tagc = tag.clone();
                            let carried_at = |c: &mut Self, field: &str| -> RId {
                                if js {
                                    return kids;
                                }
                                let r = c.region(Some(region), "children", false, Some(tagc.clone()));
                                c.regions[r].kids = Some((cr, region));
                                c.regions[r].kids_field = Some(field.to_string());
                                r
                            };
                            for (attr, comp, field) in &forwards {
                                let at = carried_at(self, attr);
                                self.forwards.push((*comp, field.clone(), at));
                            }
                            if !js {
                                for a in attrs.iter().filter(|a| carried_props.contains(&a.name) && !forwards.iter().any(|f| f.0 == a.name)) {
                                    let mut names = vec![];
                                    let mut seen = IndexSet::new();
                                    self.carried_names(&a.e, env, &mut seen, &mut names, &mut vec![]);
                                    let tree = self.carried_tree(&seen, names);
                                    if !tree.is_empty() {
                                        let at = carried_at(self, &a.name);
                                        let aenv = self.env(Some(env), at);
                                        for t in &tree {
                                            self.apply_tree(t, m.line, aenv);
                                        }
                                    }
                                }
                            }
                            if self.syms[s.unwrap()].outlet {
                                // MO-11p: what nests under this component renders here, as if it read props.children
                                if let Some(p) = self.props_of(env) {
                                    let comp = self.syms[p].region;
                                    self.outlets.push((region, comp));
                                }
                            }
                            self.apply_factory(s.unwrap(), kids, m.line);
                        } else {
                            self.markup(children, env, false);
                        }
                        continue;
                    }
                    // MO-11q, 07 §4: `<wardic.div>` is no element (none has a `.` without a `-`) and, by its small letter, no
                    // member component: it was compiled as an element of that name, silently
                    if let Some(dot) = tag.find('.').filter(|d| *d > 0) {
                        let bound = self.lookup(env, &tag[..dot]).is_some();
                        if bound || !tag.contains('-') {
                            self.err("UNKNOWN_COMPONENT", "MO-11q", member_tag_lowercase(tag, bound));
                        }
                    }
                    for a in attrs {
                        let h = is_handler(&a.name);
                        if h && a.name != "ref" {
                            self.handler_called(&a.e, env, &a.name);
                        }
                        let c2 = if h { Ctx::imperative() } else { Ctx::reactive() };
                        self.comp(if h { "handler" } else { "reader" }, env, None, Some(format!("{} {}", tag, a.name)), |c| c.expr(&a.e, env, c2, None));
                        if !h {
                            self.keep(&a.e, env);
                        }
                        if !h {
                            self.readers.push(ReaderRec { region, e: &a.e, env, line: self.line });
                        } else {
                            self.handlers.push(HandlerRec { attrs, kids: children, h: &a.e, env, region, line: self.line, what: format!("<{}> {}", tag, a.name) });
                        }
                    }
                    self.markup(children, env, false);
                }
                MarkupKind::Mif { c, t, t_decls, f, f_decls } => {
                    self.whole_ok.insert(c as *const Expr); // MO-10f: a condition reads no field
                    self.comp("reader", env, None, Some("if".into()), |cc| cc.expr(c, env, Ctx::reactive(), None));
                    self.keep(c, env);
                    self.readers.push(ReaderRec { region, e: c, env, line: self.line });
                    let r = self.region(Some(region), "then", false, None);
                    let e1 = self.env(Some(env), r);
                    self.block(t_decls, t, e1, Ctx::reactive());
                    let r = self.region(Some(region), "else", false, None);
                    let e2 = self.env(Some(env), r);
                    self.block(f_decls, f, e2, Ctx::reactive());
                }
                MarkupKind::Mview { params, decls, body, .. } => {
                    // MO-11k: a render prop's body, owned where the component calls it
                    if !self.view_fns.contains(&(m as *const Markup)) {
                        self.err("VIEW_FN_MISPLACED", "MO-11k", "a `view (…) { … }` is a JS component's render prop: it is the only child of a component whose declaration types `children` as a function giving a View".into());
                        continue;
                    }
                    let r = self.region(Some(region), "for", false, None);
                    let inner = self.env(Some(env), r);
                    for p in params {
                        // what the component passes: a value per call
                        let mut vp = Sym::new(SymKind::Value, p, r, self.line);
                        vp.handed = true;
                        let s = self.new_sym(vp);
                        self.envs[inner].vars.insert(p.clone(), s);
                    }
                    self.block(decls, body, inner, Ctx::reactive());
                }
                MarkupKind::Mfor { name, xs, decls, body } => {
                    self.comp("reader", env, None, Some("for".into()), |c| c.expr(xs, env, Ctx::reactive(), None));
                    self.keep(xs, env);
                    self.readers.push(ReaderRec { region, e: xs, env, line: self.line });
                    let src = if let ExprKind::Id(n) = &xs.k { self.lookup(env, n) } else { None };
                    if src.is_some_and(|s| self.syms[s].maps_records) || maps_into_records(xs) {
                        self.err("UNSTABLE_LIST_IDENTITY", "ST-4b", format!("for {} in …: the rows are rebuilt as fresh records on every change — declare a key (`x key id = …`)", name));
                    }
                    let r = self.region(Some(region), "for", false, None);
                    let inner = self.env(Some(env), r);
                    let mut row = Sym::new(SymKind::Value, name, r, self.line);
                    row.row_of = Some((xs, env));
                    let s = self.new_sym(row);
                    self.envs[inner].vars.insert(name.clone(), s);
                    self.block(decls, body, inner, Ctx::reactive());
                }
                MarkupKind::Loading { on, fallback, decls, body } => {
                    if let Some(on) = on {
                        self.comp("reader", env, None, Some("loading on".into()), |c| c.expr(on, env, Ctx::reactive(), None));
                        self.readers.push(ReaderRec { region, e: on, env, line: self.line });
                    }
                    self.markup(fallback, env, false);
                    let b = self.region(Some(region), "loading", false, None);
                    self.regions[b].provides.insert(HOLD.into());
                    if let Some(on) = on {
                        self.load_ons.push(ReaderRec { region: b, e: on, env, line: self.line });
                    }
                    let be = self.env(Some(env), b);
                    self.block(decls, body, be, Ctx::reactive());
                }
                MarkupKind::Portal { to, decls, body } => {
                    if let Some(to) = to {
                        self.comp("reader", env, None, Some("portal to".into()), |c| c.expr(to, env, Ctx::reactive(), None));
                        self.readers.push(ReaderRec { region, e: to, env, line: self.line });
                    }
                    let b = self.region(Some(region), "portal", false, None);
                    self.regions[b].provides.insert(HOLD.into());
                    let be = self.env(Some(env), b);
                    self.block(decls, body, be, Ctx::reactive());
                    self.later.push(Later::Content { ms: body, env, anc: vec!["body".into()] });
                }
                MarkupKind::Errored { fallback, decls, body, err_name, classes } => {
                    let fe = self.env(Some(env), region);
                    if let Some(n) = err_name {
                        self.set_value(fe, n, self.line);
                    }
                    self.markup(fallback, fe, false);
                    if let Some(cs) = classes {
                        for n in cs {
                            self.err_class(n, env);
                        }
                    }
                    let b = self.region(Some(region), "errored", false, None);
                    self.regions[b].catches = Some(Catch::of(classes));
                    let be = self.env(Some(env), b);
                    self.block(decls, body, be, Ctx::reactive());
                }
            }
        }
    }

    // ---- SV-7d: the content model across templates ----
    /// What a component contributes where it is applied: from its signature, or its body.
    fn shape(&mut self, c: SId) -> Shape {
        if let Some(r) = self.syms[c].comp_region {
            if let Some(sig) = &self.regions[r].sig {
                return sig.shape.clone().unwrap_or_default();
            }
        }
        if let Some(s) = self.shapes.get(&c) {
            return s.clone().unwrap_or_default();
        }
        if let (Some(m), Some(cenv)) = (self.syms[c].wraps, self.syms[c].comp_env) {
            // MO-11j: a wrapper's view is the made component, applied at its root
            let tag = self.syms[m].name.clone();
            self.shapes.insert(c, None);
            let mut sh = Shape::default();
            let mut roots: IndexSet<String> = IndexSet::new();
            self.shape_app(&tag, &[], &[], &[], cenv, &[], false, &mut sh, &mut roots);
            sh.roots = roots.into_iter().collect();
            self.shapes.insert(c, Some(sh.clone()));
            return sh;
        }
        let (Some(d), Some(cenv)) = (self.syms[c].comp, self.syms[c].comp_env) else { return Shape::default() };
        let Decl::Component { view, .. } = d else { return Shape::default() };
        self.shapes.insert(c, None);
        let mut sh = Shape::default();
        let mut roots: IndexSet<String> = IndexSet::new();
        self.shape_walk(view, &[], false, cenv, &mut sh, &mut roots);
        sh.roots = roots.into_iter().collect();
        self.shapes.insert(c, Some(sh.clone()));
        sh
    }
    fn shape_walk(&mut self, ms: &'a [Markup], anc: &[String], scoped: bool, env: EId, sh: &mut Shape, roots: &mut IndexSet<String>) {
        for m in ms {
            match &m.kind {
                MarkupKind::Text(_) => {
                    if anc.is_empty() {
                        roots.insert("#text".into());
                    }
                }
                MarkupKind::Read(e) => {
                    if self.reads_children(e, env) {
                        sh.children_at.push(anc.to_vec());
                    }
                }
                MarkupKind::El { tag, attrs, children } => {
                    if tag.is_empty() {
                        self.shape_walk(children, anc, scoped, env, sh, roots);
                        continue;
                    }
                    if is_upper_tag(tag) {
                        if self.lookup(env, tag).is_some_and(|t| self.syms[t].kind == SymKind::Comp && self.syms[t].outlet) && self.props_of(env).is_some() {
                            sh.children_at.push(anc.to_vec()); // MO-11p: the caller's children, at the outlet
                        }
                        self.shape_app(tag, attrs, children, &[], env, anc, scoped, sh, roots);
                        continue;
                    }
                    if anc.is_empty() {
                        roots.insert(tag.clone());
                    }
                    if P_CLOSERS.contains(tag.as_str()) && !scoped {
                        sh.closes_p = true;
                    }
                    if tag == "a" {
                        sh.a = true;
                    }
                    if tag == "form" {
                        sh.form = true;
                    }
                    let mut a2 = anc.to_vec();
                    a2.push(tag.clone());
                    self.shape_walk(children, &a2, scoped || P_SCOPE.contains(tag.as_str()), env, sh, roots);
                }
                MarkupKind::Mif { t, f, .. } => {
                    self.shape_walk(t, anc, scoped, env, sh, roots);
                    self.shape_walk(f, anc, scoped, env, sh, roots);
                }
                MarkupKind::Mfor { body, .. } | MarkupKind::Mview { body, .. } => self.shape_walk(body, anc, scoped, env, sh, roots),
                MarkupKind::Loading { fallback, body, .. } | MarkupKind::Errored { fallback, body, .. } => {
                    self.shape_walk(fallback, anc, scoped, env, sh, roots);
                    self.shape_walk(body, anc, scoped, env, sh, roots);
                }
                _ => {}
            }
        }
    }
    /// The props of the component a view belongs to (MO-11p: `<Outlet />` renders its children).
    /// A prop of the component being walked, read as it is: `props.router`.
    fn prop_field(&self, e: &Expr, env: EId) -> Option<(RId, String)> {
        let ExprKind::Member { o, p, .. } = &e.k else { return None };
        let ExprKind::Id(n) = &o.k else { return None };
        let s = self.lookup(env, n).filter(|&s| self.syms[s].kind == SymKind::Props)?;
        let r = self.syms[s].region;
        self.regions[r].is_component_root.then(|| (r, p.clone()))
    }
    /// MO-11o (2026-11-22): the props each component of a block gives on, as they are (`props.x`), to a prop that
    /// renders what it carries — a JS component's `renders` prop, or such a prop of another component — to a fixpoint.
    /// Found before any view is walked, so an application written above the component's declaration sees it. A summary
    /// by syntax: the walk records each (`forwards`), and one the walk does not confirm is refused.
    fn forwarded_props(&mut self, decls: &'a [Decl], env: EId) {
        // MO-10f: each component's prop interfaces, before any view is walked
        for d in decls {
            let Decl::Component { name, props_type: Some(t), .. } = d else { continue };
            let Some(r) = self.lookup(env, name).and_then(|s| self.syms[s].comp_region) else { continue };
            let held: Vec<(String, bool, Vec<String>)> = field_rows(t).1.into_iter().filter(|h| h.0.contains('.')).collect();
            if !held.is_empty() {
                self.prop_held.insert(r, held);
            }
        }
        fn in_view<'a>(ms: &'a [Markup], out: &mut Vec<(&'a str, &'a [Attr])>) {
            for m in ms {
                match &m.kind {
                    MarkupKind::El { tag, attrs, children } => {
                        out.push((tag.as_str(), attrs.as_slice()));
                        in_view(children, out);
                    }
                    MarkupKind::Mif { t, f, .. } => {
                        in_view(t, out);
                        in_view(f, out);
                    }
                    MarkupKind::Mfor { body, .. } | MarkupKind::Mview { body, .. } | MarkupKind::Portal { body, .. } => in_view(body, out),
                    MarkupKind::Loading { fallback, body, .. } | MarkupKind::Errored { fallback, body, .. } => {
                        in_view(fallback, out);
                        in_view(body, out);
                    }
                    _ => {}
                }
            }
        }
        let comps: Vec<(&'a str, &'a str, &'a [Markup], usize)> = decls.iter().filter_map(|d| match d {
            Decl::Component { name, props, view, line, .. } => Some((name.as_str(), props.as_str(), view.as_slice(), *line)),
            _ => None,
        }).collect();
        loop {
            let mut grew = false;
            for &(name, props, view, line) in &comps {
                let Some(r) = self.lookup(env, name).and_then(|s| self.syms[s].comp_region) else { continue };
                let mut els = vec![];
                in_view(view, &mut els);
                for (tag, attrs) in els {
                    if !is_upper_tag(tag) {
                        continue;
                    }
                    let Some(cp) = self.lookup(env, tag).filter(|&t| self.syms[t].kind == SymKind::Comp).and_then(|t| self.syms[t].comp_region).and_then(|t| self.carried_props.get(&t).cloned()) else { continue };
                    for a in attrs.iter().filter(|a| cp.contains(&a.name)) {
                        let ExprKind::Member { o, p, .. } = &a.e.k else { continue };
                        if !matches!(&o.k, ExprKind::Id(n) if n == props) {
                            continue;
                        }
                        if self.carried_props.entry(r).or_default().insert(p.clone()) {
                            self.forwarded_decl.push((r, p.clone(), name.to_string(), line));
                            grew = true;
                        }
                    }
                }
            }
            if !grew {
                break;
            }
        }
    }
    fn props_of(&self, env: EId) -> Option<SId> {
        let mut e = Some(env);
        while let Some(i) = e {
            if let Some(&s) = self.envs[i].vars.values().find(|&&s| self.syms[s].kind == SymKind::Props) {
                return Some(s);
            }
            e = self.envs[i].parent;
        }
        None
    }
    fn reads_children(&self, e: &Expr, env: EId) -> bool {
        match &e.k {
            ExprKind::Member { o, p, .. } if p == "children" => match &o.k {
                ExprKind::Id(n) => self.lookup(env, n).is_some_and(|s| self.syms[s].kind == SymKind::Props),
                _ => false,
            },
            _ => false,
        }
    }
    /// SV-7d: every element, text and component root of a view against the elements open above it.
    /// MO-11c: the components passed to a JS component's `Component` props (by attribute index) — each checked as applied,
    /// with no arguments, among the application's children (DV-24).
    fn component_values(&self, tag: &str, attrs: &'a [Attr], env: EId) -> Vec<(usize, VTree)> {
        let Some(sig) = self.lookup(env, tag).and_then(|s| self.syms[s].comp_region).and_then(|r| self.regions[r].sig.as_ref()) else { return vec![] };
        // MO-11t: and the components given by name to its props typed `View`, each applied there with no arguments
        let views = self.lookup(env, tag).and_then(|s| self.syms[s].comp_region).and_then(|r| self.view_props.get(&r));
        let mut out = vec![];
        for (i, a) in attrs.iter().enumerate() {
            if !sig.props.get(&a.name).is_some_and(|p| p.component) && !views.is_some_and(|v| v.contains(&a.name)) {
                continue;
            }
            if let ExprKind::Id(n) = &a.e.k {
                if is_upper_tag(n) && self.lookup(env, n).is_some_and(|s| self.syms[s].kind == SymKind::Comp) {
                    out.push((i, VTree { tag: n.clone(), kids: vec![] }));
                }
            }
        }
        // MO-11o: what a prop renders, the components its value carries
        let region = self.lookup(env, tag).and_then(|s| self.syms[s].comp_region);
        if let Some(cp) = region.filter(|&r| self.regions[r].js).and_then(|r| self.carried_props.get(&r)) {
            let mut names = vec![];
            let mut seen = IndexSet::new();
            for a in attrs {
                if cp.contains(&a.name) {
                    self.carried_names(&a.e, env, &mut seen, &mut names, &mut vec![]);
                }
            }
            for t in self.carried_tree(&seen, names) {
                out.push((usize::MAX, t));
            }
        }
        out
    }
    /// MO-11o, MO-11p: the carried components as applied: each value carried `under(parent in inside)` is its `inside`
    /// component, applied among the children of its parent's (where that one's `outlet` renders them); the rest, and any
    /// whose parent is not carried here, side by side.
    fn carried_tree(&self, seen: &IndexSet<SId>, names: Vec<String>) -> Vec<VTree> {
        let field = |s: SId, key: &str| -> Option<&'a Expr> {
            let (args, _) = self.syms[s].carried?;
            for a in args {
                if let ExprKind::Rec(fields) = &a.k {
                    for f in fields {
                        if let Field::Kv { key: k, v } = f {
                            if k == key {
                                return Some(v);
                            }
                        }
                    }
                }
            }
            None
        };
        let parent_of = |s: SId| -> Option<SId> {
            let (_, cenv) = self.syms[s].carried?;
            let (parent, _) = self.syms[s].carried_under.as_ref()?;
            let mut v = field(s, parent)?;
            if let ExprKind::Fn { body, stmts, .. } = &v.k {
                // `getParentRoute: () => rootRoute`
                if stmts.as_ref().is_none_or(|s| s.is_empty()) {
                    v = body;
                }
            }
            let ExprKind::Id(n) = &v.k else { return None };
            let p = self.lookup(cenv, n)?;
            (self.syms[p].carried.is_some() && seen.contains(&p)).then_some(p)
        };
        // a carried value's component, at its `inside` field
        let mut tags: IndexMap<SId, String> = IndexMap::new();
        let host = |s: SId, inside: &str, tags: &mut IndexMap<SId, String>| {
            if tags.contains_key(&s) {
                return;
            }
            let Some((_, cenv)) = self.syms[s].carried else { return };
            if let Some(v) = field(s, inside) {
                if let ExprKind::Id(n) = &v.k {
                    if is_upper_tag(n) && self.lookup(cenv, n).is_some_and(|t| self.syms[t].kind == SymKind::Comp) {
                        tags.insert(s, n.clone());
                    }
                }
            }
        };
        for &s in seen {
            if let Some((_, inside)) = self.syms[s].carried_under.clone() {
                host(s, &inside, &mut tags);
                // a parent with no `under` of its own (the root) is found by its child's field
                if let Some(p) = parent_of(s) {
                    host(p, &inside, &mut tags);
                }
            }
        }
        // each placed under its parent, unless its parent chain comes back to it (a cycle stays side by side)
        let mut parent: IndexMap<SId, Option<SId>> = IndexMap::new();
        for &s in tags.keys() {
            let p = parent_of(s);
            let mut up: HashSet<SId> = HashSet::new();
            let mut q = p;
            while let Some(x) = q {
                if !tags.contains_key(&x) || up.contains(&x) {
                    break;
                }
                up.insert(x);
                q = parent_of(x);
            }
            parent.insert(s, p.filter(|p| tags.contains_key(p) && !up.contains(&s)));
        }
        fn build(s: SId, tags: &IndexMap<SId, String>, parent: &IndexMap<SId, Option<SId>>) -> VTree {
            let kids = tags.keys().filter(|&&k| parent.get(&k).copied().flatten() == Some(s)).map(|&k| build(k, tags, parent)).collect();
            VTree { tag: tags[&s].clone(), kids }
        }
        let mut top: Vec<VTree> = tags.keys().filter(|&&s| parent.get(&s).copied().flatten().is_none()).map(|&s| build(s, &tags, &parent)).collect();
        let placed: HashSet<&String> = tags.values().collect();
        let mut uniq: IndexSet<String> = IndexSet::new();
        for n in names {
            uniq.insert(n);
        }
        for n in uniq {
            if !placed.contains(&n) {
                top.push(VTree { tag: n, kids: vec![] });
            }
        }
        top
    }
    /// MO-11o: the components in a carrying call's arguments, as a factory's are found (MO-11c, MO-11g); `mark` registers
    /// them as values (no COMPONENT_AS_VALUE where they are written).
    fn carried_values(&mut self, args: &'a [Expr], env: EId, mark: bool, out: &mut Vec<String>) {
        fn walk<'a>(c: &mut Checker<'a>, e: &'a Expr, env: EId, mark: bool, out: &mut Vec<String>) {
            match &e.k {
                ExprKind::Id(n) => {
                    if is_upper_tag(n) && c.lookup(env, n).is_some_and(|t| c.syms[t].kind == SymKind::Comp) {
                        if mark {
                            c.value_ids.insert(e as *const Expr);
                            let line = c.line;
                            c.carried_pending.push((e as *const Expr, n.clone(), line, String::new()));
                        }
                        out.push(n.clone());
                    }
                }
                ExprKind::Rec(fields) => {
                    for f in fields {
                        if let Field::Kv { v, .. } = f {
                            walk(c, v, env, mark, out);
                        }
                    }
                }
                ExprKind::Arr(items) => {
                    for x in items {
                        if !matches!(x.k, ExprKind::Spread(_)) {
                            walk(c, x, env, mark, out);
                        }
                    }
                }
                ExprKind::Call { f, args, .. } => {
                    if let ExprKind::Id(g) = &f.k {
                        if c.lookup(env, g).is_some_and(|t| c.syms[t].kind == SymKind::Import && c.syms[t].pure_fn) {
                            for a in args {
                                walk(c, a, env, mark, out);
                            }
                        }
                    }
                }
                _ => {}
            }
        }
        for a in args {
            walk(self, a, env, mark, out);
        }
    }
    /// MO-11o (ruled 2026-11-22): the components an expression's value carries, by mention (`flows`): through every name
    /// its value may come from — an equation's or a local's value, the list a row goes through, what a closure's
    /// parameter may be given, what an `.rx` fn of this module returns — to the carrying calls they were bound to
    /// (`rootRoute.addChildren([…])`, `createRouter({ routeTree })`). `opaque`: the names whose value comes from where
    /// the checker cannot look (a prop, a parameter, a source, a provision, another `.rx` module): what they carry cannot
    /// be named here, so a `renders` prop refuses them.
    fn carried_names(&self, e: &Expr, env: EId, seen: &mut IndexSet<SId>, out: &mut Vec<String>, opaque: &mut Vec<(String, String)>) {
        fn names_in<'a>(c: &Checker<'a>, e: &Expr, env: EId, out: &mut Vec<String>) {
            match &e.k {
                ExprKind::Id(n) => {
                    if is_upper_tag(n) && c.lookup(env, n).is_some_and(|t| c.syms[t].kind == SymKind::Comp) {
                        c.reached.borrow_mut().insert(e as *const Expr);
                        out.push(n.clone());
                    }
                }
                ExprKind::Rec(fields) => {
                    for f in fields {
                        if let Field::Kv { v, .. } = f {
                            names_in(c, v, env, out);
                        }
                    }
                }
                ExprKind::Arr(items) => {
                    for x in items {
                        if !matches!(x.k, ExprKind::Spread(_)) {
                            names_in(c, x, env, out);
                        }
                    }
                }
                ExprKind::Call { f, args, .. } => {
                    if let ExprKind::Id(g) = &f.k {
                        if c.lookup(env, g).is_some_and(|t| c.syms[t].kind == SymKind::Import && c.syms[t].pure_fn) {
                            for a in args {
                                names_in(c, a, env, out);
                            }
                        }
                    }
                }
                _ => {}
            }
        }
        for n in self.flow_names(e, env) {
            if let Some(c) = n.strip_prefix("use:") {
                opaque.push((format!("use {c}"), "a provision, which whatever is above may give".into()));
                continue;
            }
            // a read of one prop (`flows` names the prop) is a read of the props
            let (n, s) = if n.starts_with('\u{1}') {
                match self.props_of(env) {
                    Some(ps) => (self.syms[ps].name.clone(), ps),
                    None => continue,
                }
            } else {
                let Some(s) = self.lookup(env, &n) else { continue };
                (n, s)
            };
            if !seen.insert(s) {
                continue;
            }
            if let Some((args, cenv)) = self.syms[s].carried {
                for a in args {
                    names_in(self, a, cenv, out);
                }
            }
            let sy = &self.syms[s];
            let mut from: Vec<(&'a Expr, EId)> = vec![];
            from.extend(sy.val);
            from.extend(sy.row_of);
            from.extend(sy.srcs.iter().copied());
            if !from.is_empty() {
                for (x, xenv) in from {
                    self.carried_names(x, xenv, seen, out, opaque);
                }
                continue;
            }
            if let Some((names, fenv)) = &sy.ret_flows {
                for m in names {
                    let id = Expr::made(ExprKind::Id(m.clone()));
                    self.carried_names(&id, *fenv, seen, out, opaque);
                }
                continue;
            }
            let why = if let Some(from) = &sy.from_module {
                Some(format!("imported from {from}"))
            } else if (sy.kind == SymKind::Fn && sy.export_key.is_some()) || sy.kind == SymKind::Action {
                Some("made by another `.rx` module".to_string())
            } else {
                match sy.kind {
                    SymKind::Props => Some("a prop, which whatever applies the component may give".to_string()),
                    SymKind::Source => Some("a source, which may be written anything".to_string()),
                    SymKind::Value | SymKind::Eq if sy.kind == SymKind::Value || sy.param => Some("a parameter, which whatever calls may give".to_string()),
                    _ => None,
                }
            };
            if let Some(w) = why {
                opaque.push((n.clone(), w));
            }
        }
    }
    /// MO-11s: components given to a JS fn that says nothing of where it renders them (no factory, `renders` or
    /// `renders(later)` row, or no declaration at all) — as values in its arguments, their record and array literals and
    /// the JS calls among them — are checked as the most cautious placement allows: applied under a root of their own, at
    /// any time, so nothing above the call (errored, loading, provide) is credited to them.
    fn unplaced(&mut self, args: &'a [Expr], env: EId) {
        let mut out = vec![];
        fn walk<'a>(c: &mut Checker<'a>, e: &'a Expr, env: EId, out: &mut Vec<String>) {
            match &e.k {
                ExprKind::Id(n) => {
                    if is_upper_tag(n) && c.lookup(env, n).is_some_and(|t| c.syms[t].kind == SymKind::Comp) && !c.value_ids.contains(&(e as *const Expr)) {
                        c.value_ids.insert(e as *const Expr);
                        out.push(n.clone());
                    }
                }
                ExprKind::Rec(fields) => {
                    for f in fields {
                        if let Field::Kv { v, .. } = f {
                            walk(c, v, env, out);
                        }
                    }
                }
                ExprKind::Arr(items) => {
                    for x in items {
                        if !matches!(x.k, ExprKind::Spread(_)) {
                            walk(c, x, env, out);
                        }
                    }
                }
                ExprKind::Call { f, args, .. } => {
                    if let ExprKind::Id(g) = &f.k {
                        if c.lookup(env, g).is_some_and(|t| c.syms[t].kind == SymKind::Import || (c.syms[t].kind == SymKind::Fn && c.syms[t].foreign.is_some())) {
                            for a in args {
                                walk(c, a, env, out);
                            }
                        }
                    }
                }
                _ => {}
            }
        }
        for a in args {
            walk(self, a, env, &mut out);
        }
        if out.is_empty() {
            return;
        }
        let r = self.region(None, "root", false, None);
        let at = self.env(Some(env), r);
        let line = self.line as usize;
        for n in out {
            self.apply_tree(&VTree { tag: n, kids: vec![] }, Some(line), at);
        }
    }
    /// MO-11s: a JS fn with no word for where it renders what it is given
    fn unplaced_fn(&self, s: SId) -> bool {
        let y = &self.syms[s];
        (y.kind == SymKind::Import || (y.kind == SymKind::Fn && y.foreign.is_some())) && !y.renders && !y.carrier && y.foreign != Some(FShape::Comp)
    }
    /// MO-11f: the components in a factory call's arguments — anywhere inside its record and array literals, and the
    /// arguments of JS calls among them (MO-11g).
    fn factory_values(&mut self, s: SId) -> Vec<String> {
        if let Some(v) = self.factory_values.get(&s) {
            return v.clone();
        }
        let (args, fenv) = self.syms[s].factory.unwrap();
        let mut out = vec![];
        fn walk<'a>(c: &mut Checker<'a>, e: &'a Expr, fenv: EId, out: &mut Vec<String>) {
            match &e.k {
                ExprKind::Id(n) => {
                    // a value is applied by its tag, so it is capitalised as one
                    if is_upper_tag(n) && c.lookup(fenv, n).is_some_and(|t| c.syms[t].kind == SymKind::Comp) {
                        c.value_ids.insert(e as *const Expr);
                        out.push(n.clone());
                    }
                }
                ExprKind::Rec(fields) => {
                    for f in fields {
                        if let Field::Kv { v, .. } = f {
                            walk(c, v, fenv, out);
                        }
                    }
                }
                ExprKind::Arr(items) => {
                    for x in items {
                        if !matches!(x.k, ExprKind::Spread(_)) {
                            walk(c, x, fenv, out);
                        }
                    }
                }
                ExprKind::Call { f, args, .. } => {
                    // MO-11g: a JS call inside the arguments (`defineRoute({ … })`) hands what it is given on to the factory
                    if let ExprKind::Id(g) = &f.k {
                        if c.lookup(fenv, g).is_some_and(|t| c.syms[t].kind == SymKind::Import && c.syms[t].pure_fn) {
                            for a in args {
                                walk(c, a, fenv, out);
                            }
                        }
                    }
                }
                _ => {}
            }
        }
        for a in args {
            walk(self, a, fenv, &mut out);
        }
        self.factory_values.insert(s, out.clone());
        out
    }
    /// MO-11c: `<C />` for a component value, as `markup` applies a component with no attributes and no children.
    fn apply_value(&mut self, tag: &str, line: Option<usize>, env: EId) {
        if let Some(l) = line {
            self.line = l as i64;
        }
        let region = self.reg(env);
        let Some(s) = self.lookup(env, tag) else { return };
        let Some(cr) = self.syms[s].comp_region else { return };
        self.apps.push(AppRec { comp: cr, site: region, line: self.line, tag: tag.to_string(), args: vec![], passed: vec![] });
        let kids = self.region(Some(region), "children", false, Some(tag.to_string()));
        self.regions[kids].kids = Some((cr, region));
        self.apply_factory(s, kids, line);
    }
    /// MO-11f: what a factory was given, applied among the children of its component's application, named where it was called.
    fn apply_factory(&mut self, s: SId, kids: RId, line: Option<usize>) {
        let Some((_, fenv)) = self.syms[s].factory else { return };
        if !self.expanding[0].insert(s) {
            return;
        }
        let trees = self.factory_tree(s);
        let fe = self.env(Some(fenv), kids);
        for t in &trees {
            self.apply_tree(t, line, fe);
        }
        self.expanding[0].remove(&s);
    }
    /// MO-11j: an exported factory's component, summarised as a component whose view applies it — what its values let out
    /// and need from above, and its content shape, are what an importer's `<Router />` gets (MO-3).
    fn export_made(&mut self, made: SId, name: &str, line: i64) {
        let region = self.syms[made].region;
        let w = self.region(Some(region), "component", true, Some(name.to_string()));
        let wenv = self.env(self.root_env, w);
        let mut wrap = Sym::new(SymKind::Comp, name, region, line);
        wrap.comp_region = Some(w);
        wrap.comp_env = Some(wenv);
        wrap.wraps = Some(made);
        let ws = self.new_sym(wrap);
        self.comp_syms.insert(w, ws);
        self.syms[made].exported_as = Some(ws);
        // its view is `<Router />`: the made component applied, with no arguments and no children
        self.apply_value(name, Some(line as usize), wenv);
    }
    /// MO-11i: `apply_value` for a component value with the values nested in it, applied among its children.
    fn apply_tree(&mut self, t: &VTree, line: Option<usize>, env: EId) {
        if t.kids.is_empty() {
            return self.apply_value(&t.tag, line, env);
        }
        if let Some(l) = line {
            self.line = l as i64;
        }
        let region = self.reg(env);
        let Some(s) = self.lookup(env, &t.tag) else { return };
        let Some(cr) = self.syms[s].comp_region else { return };
        self.apps.push(AppRec { comp: cr, site: region, line: self.line, tag: t.tag.clone(), args: vec![], passed: vec![] });
        let kids = self.region(Some(region), "children", false, Some(t.tag.clone()));
        self.regions[kids].kids = Some((cr, region));
        let kenv = self.env(Some(env), kids);
        for k in &t.kids {
            self.apply_tree(k, line, kenv);
        }
        self.apply_factory(s, kids, line);
    }
    /// MO-11f, MO-11i: what a factory was given, as a tree: each component value, and with `nests(kids in inside)`, a
    /// record's `kids` entries nested under its `inside` component.
    fn factory_tree(&mut self, s: SId) -> Vec<VTree> {
        self.factory_values(s);
        let (args, fenv) = self.syms[s].factory.unwrap();
        let nests = self.syms[s].nests.clone();
        fn walk<'a>(c: &Checker<'a>, e: &'a Expr, fenv: EId, nests: &Option<(String, String)>) -> Vec<VTree> {
            let value = |e: &Expr| -> Option<String> {
                match &e.k {
                    ExprKind::Id(n) if c.value_ids.contains(&(e as *const Expr)) => Some(n.clone()),
                    _ => None,
                }
            };
            if let Some(n) = value(e) {
                return vec![VTree { tag: n, kids: vec![] }];
            }
            match &e.k {
                ExprKind::Arr(items) => items.iter().filter(|x| !matches!(x.k, ExprKind::Spread(_))).flat_map(|x| walk(c, x, fenv, nests)).collect(),
                ExprKind::Call { f, args, .. } => match &f.k {
                    ExprKind::Id(g) if c.lookup(fenv, g).is_some_and(|t| c.syms[t].kind == SymKind::Import && c.syms[t].pure_fn) => args.iter().flat_map(|a| walk(c, a, fenv, nests)).collect(),
                    _ => vec![],
                },
                ExprKind::Rec(fields) => {
                    let kv = |name: &str| fields.iter().position(|x| matches!(x, Field::Kv { key, .. } if key == name));
                    let (host, kids) = match nests {
                        Some((k, i)) => (kv(i), kv(k)),
                        None => (None, None),
                    };
                    let host_tag = host.and_then(|h| if let Field::Kv { v, .. } = &fields[h] { value(v) } else { None });
                    let Some(tag) = host_tag else {
                        return fields.iter().flat_map(|x| if let Field::Kv { v, .. } = x { walk(c, v, fenv, nests) } else { vec![] }).collect();
                    };
                    let nested = match kids {
                        Some(k) => if let Field::Kv { v, .. } = &fields[k] { walk(c, v, fenv, nests) } else { vec![] },
                        None => vec![],
                    };
                    let mut out = vec![VTree { tag, kids: nested }];
                    for (i, x) in fields.iter().enumerate() {
                        if Some(i) == host || Some(i) == kids {
                            continue;
                        }
                        if let Field::Kv { v, .. } = x {
                            out.extend(walk(c, v, fenv, nests));
                        }
                    }
                    out
                }
                _ => vec![],
            }
        }
        args.iter().flat_map(|a| walk(self, a, fenv, &nests)).collect()
    }
    /// SV-7d at a component's application: its roots against the elements open above it, then the children it is given (and
    /// its component values, MO-11c/f) where it places them.
    #[allow(clippy::too_many_arguments)]
    fn content_app(&mut self, tag: &str, attrs: &'a [Attr], children: &'a [Markup], vkids: &[VTree], line: Option<usize>, env: EId, anc: &[String]) {
        if let Some(l) = line {
            self.line = l as i64;
        }
        let Some(s) = self.lookup(env, tag) else { return };
        if self.syms[s].kind != SymKind::Comp {
            return;
        }
        let ss = self.shape(s);
        for r in &ss.roots {
            let what = if r == "#text" { format!("<{}>'s text", tag) } else { format!("<{}>, the root of <{}>,", r, tag) };
            let why = misnested(anc, r);
            self.report_content(anc, what, why);
        }
        let why = misnested_inside(anc, &ss);
        self.report_content(anc, format!("<{}>", tag), why);
        for ch in &ss.children_at {
            let mut a2 = anc.to_vec();
            a2.extend(ch.iter().cloned());
            self.content_check(children, env, &a2);
            for k in vkids {
                self.content_app(&k.tag, &[], &[], &k.kids, line, env, &a2);
            }
            for (_, v) in self.component_values(tag, attrs, env) {
                self.content_app(&v.tag, &[], &[], &v.kids, line, env, &a2);
            }
            if let Some((_, fenv)) = self.syms[s].factory {
                if self.expanding[1].insert(s) {
                    for t in self.factory_tree(s) {
                        self.content_app(&t.tag, &[], &[], &t.kids, line, fenv, &a2);
                    }
                    self.expanding[1].remove(&s);
                }
            }
        }
    }
    /// SV-7d's summary of a component application inside a view (`shape`): its roots and flags, then its children and
    /// component values where it places them.
    #[allow(clippy::too_many_arguments)]
    fn shape_app(&mut self, tag: &str, attrs: &'a [Attr], children: &'a [Markup], vkids: &[VTree], env: EId, anc: &[String], scoped: bool, sh: &mut Shape, roots: &mut IndexSet<String>) {
        let Some(s) = self.lookup(env, tag) else { return };
        if self.syms[s].kind != SymKind::Comp {
            return;
        }
        let ss = self.shape(s);
        if anc.is_empty() {
            for r in &ss.roots {
                roots.insert(r.clone());
            }
        }
        if ss.closes_p && !scoped {
            sh.closes_p = true;
        }
        if ss.a {
            sh.a = true;
        }
        if ss.form {
            sh.form = true;
        }
        for ch in &ss.children_at {
            let mut a2 = anc.to_vec();
            a2.extend(ch.iter().cloned());
            let sc = scoped || ch.iter().any(|t| P_SCOPE.contains(t.as_str()));
            self.shape_walk(children, &a2, sc, env, sh, roots);
            for k in vkids {
                self.shape_app(&k.tag, &[], &[], &k.kids, env, &a2, sc, sh, roots);
            }
            for (_, v) in self.component_values(tag, attrs, env) {
                self.shape_app(&v.tag, &[], &[], &v.kids, env, &a2, sc, sh, roots);
            }
            if let Some((_, fenv)) = self.syms[s].factory {
                if self.expanding[2].insert(s) {
                    for t in self.factory_tree(s) {
                        self.shape_app(&t.tag, &[], &[], &t.kids, fenv, &a2, sc, sh, roots);
                    }
                    self.expanding[2].remove(&s);
                }
            }
        }
    }
    fn content_check(&mut self, ms: &'a [Markup], env: EId, anc: &[String]) {
        for m in ms {
            if let Some(l) = m.line {
                self.line = l as i64;
            }
            match &m.kind {
                MarkupKind::Text(s) => {
                    if !js_trim(s).is_empty() {
                        let why = misnested(anc, "#text");
                        self.report_content(anc, "text".into(), why);
                    }
                }
                MarkupKind::El { tag, attrs, children } => {
                    if tag.is_empty() {
                        self.content_check(children, env, anc);
                        continue;
                    }
                    if is_upper_tag(tag) {
                        self.content_app(tag, attrs, children, &[], m.line, env, anc);
                        continue;
                    }
                    let why = misnested(anc, tag);
                    self.report_content(anc, format!("<{}>", tag), why);
                    let mut a2 = anc.to_vec();
                    a2.push(tag.clone());
                    self.content_check(children, env, &a2);
                }
                MarkupKind::Mif { t, f, .. } => {
                    self.content_check(t, env, anc);
                    self.content_check(f, env, anc);
                }
                MarkupKind::Mfor { body, .. } | MarkupKind::Mview { body, .. } => self.content_check(body, env, anc),
                MarkupKind::Loading { fallback, body, .. } | MarkupKind::Errored { fallback, body, .. } => {
                    self.content_check(fallback, env, anc);
                    self.content_check(body, env, anc);
                }
                _ => {}
            }
        }
    }
    fn report_content(&mut self, anc: &[String], what: String, why: Option<String>) {
        if let Some(why) = why {
            self.err("CONTENT_MODEL", "SV-7d", format!("{} inside <{}>: the browser's HTML parser {}, so the served page is not the tree the client builds", what, anc.last().map(|s| s.as_str()).unwrap_or("undefined"), why));
        }
    }

    // ---- R-8: a handler's snapshot of a value that may be absent or failing ----
    /// R-8: every element handler's snapshot reads of an equation that can have no value yet (a first load with no `-> v`)
    /// or can fail, unless handled (`-> v`; a `try` or `catch` for the failure) or covered (the element's `disabled` reads
    /// it, or the element sits in a `loading` / `errored` region whose content reads it).
    fn snapshot_guards(&mut self) {
        let hs: Vec<(&'a [Attr], &'a Expr, EId, RId, i64, String)> = self.handlers.iter().map(|h| (h.attrs, h.h, h.env, h.region, h.line, h.what.clone())).collect();
        let mut absent_memo: HashMap<SId, bool> = HashMap::new();
        let mut done: HashSet<*const Expr> = HashSet::new();
        for (attrs, h, env, region, line, what) in hs {
            if !done.insert(h as *const Expr) {
                continue;
            }
            let mut locals: HashSet<String> = HashSet::new();
            let mut reads: Vec<(String, bool)> = vec![];
            snapshot_reads(Node::E(h), false, &mut locals, &mut reads);
            let mut seen: HashSet<SId> = HashSet::new();
            for (n, caught) in reads {
                if locals.contains(&n) {
                    continue;
                }
                let Some(s) = self.lookup(env, &n) else { continue };
                if !matches!(self.syms[s].kind, SymKind::Eq | SymKind::Source) || seen.contains(&s) {
                    continue;
                }
                let absent = self.absent(s, &mut absent_memo, &mut HashSet::new());
                let failing = !caught && self.syms[s].fails_t.is_some() && !self.sym_fails(s).cls.is_empty();
                if !absent && !failing {
                    continue;
                }
                seen.insert(s);
                // a `disabled` that reads `s` covers the handler; for a failure it must read the value, since
                // `pending? s` of a failed `s` is false and leaves the element enabled
                let disabled_by = |probes: bool| attrs.iter().any(|a| a.name == "disabled" && self.depends_in(&a.e, env, s, &mut HashSet::new(), probes));
                let need_hold = absent && !disabled_by(true) && !self.region_reads(region, s, |r| r.provides.contains(HOLD));
                let need_catch = failing && !disabled_by(false) && !self.region_reads_in(region, s, |r| r.catches.is_some(), false);
                if !need_hold && !need_catch {
                    continue;
                }
                let why = match (need_hold, need_catch) {
                    (true, true) => "can have no value yet (a first load) and can fail",
                    (true, false) => "can have no value yet (a first load)",
                    _ => "can fail",
                };
                self.line = line;
                self.err(
                    "UNGUARDED_SNAPSHOT",
                    "R-8",
                    format!(
                        "{} reads {} as a snapshot, and {} {}: the click then {} — move the element inside a `loading` / `errored` region whose content reads {} (with `disabled={{pending? {}}}` for a new question){}",
                        what,
                        n,
                        n,
                        why,
                        if need_hold { "sees no value" } else { "throws its error" },
                        n,
                        n,
                        if need_catch { format!(", or read it inside `try {{ … }} catch (e) {{ … }}`") } else { String::new() }
                    ),
                );
            }
        }
    }

    // ---- AC-3a: a guess a click can make while its target loads a new question ----
    /// AC-3a (D-34, Solid's `OPTIMISTIC_WRITE_WHILE_LOADING`): a handler starts a guess (in its own body, an inferred
    /// or inline action, or a named action it calls) on an equation or source that awaits, whose question reads what
    /// the click reads (a selection, a row), from an element that is not covered (R-8: inside a `loading` region whose
    /// content reads the target, or `disabled` reading it). While that question is out the guess composes on the
    /// previous answer, and the new answer replaces it: the user's change disappears while its action is out.
    fn guess_while_loading(&mut self) {
        let hs: Vec<(&'a [Attr], &'a [Markup], &'a Expr, EId, RId, i64, String)> = self.handlers.iter().map(|h| (h.attrs, h.kids, h.h, h.env, h.region, h.line, h.what.clone())).collect();
        let acts: Vec<(String, i64, &'a [Stmt], EId)> = self.actions.iter().map(|a| (a.name.clone(), a.line, a.body, a.env)).collect();
        let mut done: HashSet<*const Expr> = HashSet::new();
        for (attrs, kids, h, env, region, line, what) in hs {
            if !done.insert(h as *const Expr) {
                continue;
            }
            // a form submits only through its buttons: disabled submit buttons block it (HTML implicit submission)
            let mut submits: Vec<&'a [Attr]> = vec![];
            if what == "<form> onSubmit" {
                submit_buttons(kids, &mut submits);
            }
            // the bodies the click runs: the handler, and the actions it calls by name
            let mut bodies: Vec<(Node<'a>, EId, Option<String>)> = vec![(Node::E(h), env, None)];
            let mut stack = vec![Node::E(h)];
            while let Some(n) = stack.pop() {
                if let Node::E(Expr { k: ExprKind::Call { f, .. }, .. }) = n {
                    if let ExprKind::Id(name) = &f.k {
                        if let Some(a) = self.lookup(env, name) {
                            if self.syms[a].kind == SymKind::Action {
                                let l = self.syms[a].line;
                                for (an, al, body, aenv) in &acts {
                                    if an == name && *al == l {
                                        bodies.extend(body.iter().map(|st| (Node::S(st), *aenv, Some(name.clone()))));
                                    }
                                }
                            }
                        }
                    }
                }
                stack.extend(children(n, false));
            }
            // what the click is about: the names those bodies read, outside their own writes and guesses
            let mut inputs: Vec<SId> = vec![];
            for (root, benv, _) in &bodies {
                let mut st = vec![*root];
                while let Some(n) = st.pop() {
                    match n {
                        Node::S(x) if matches!(x.k, StmtKind::Optimistic { .. } | StmtKind::Write { .. }) => continue,
                        Node::E(x) => {
                            if let ExprKind::Id(name) = &x.k {
                                if let Some(v) = self.lookup(*benv, name) {
                                    if matches!(self.syms[v].kind, SymKind::Source | SymKind::Eq | SymKind::Value | SymKind::Props) && !inputs.contains(&v) {
                                        inputs.push(v);
                                    }
                                }
                            }
                        }
                        _ => {}
                    }
                    st.extend(children(n, false));
                }
            }
            let mut seen: HashSet<SId> = HashSet::new();
            for (root, benv, via) in bodies {
                let mut st = vec![root];
                while let Some(n) = st.pop() {
                    if let Node::S(x) = n {
                        if let StmtKind::Optimistic { target, .. } = &x.k {
                            if let Some(t) = self.lookup(benv, &target.name) {
                                if seen.insert(t)
                                    && self.awaits(t, &mut HashSet::new())
                                    && self.asks_about(t, &inputs)
                                    && !attrs.iter().any(|a| a.name == "disabled" && self.depends(&a.e, env, t, &mut HashSet::new()))
                                    && !(!submits.is_empty() && submits.iter().all(|b| b.iter().any(|a| a.name == "disabled" && self.depends(&a.e, env, t, &mut HashSet::new()))))
                                    && !self.region_reads(region, t, |r| r.provides.contains(HOLD))
                                {
                                    let n = &target.name;
                                    self.line = line;
                                    self.err(
                                        "GUESS_WHILE_LOADING",
                                        "AC-3a",
                                        format!(
                                            "{what} {} `guess {n}` while {n} is loading a new question (its question reads what the click reads): the guess composes on the previous answer, and the new answer replaces it, so the change disappears while it is out (D-34) — put the element inside the `loading` region whose content reads {n}, or give it `disabled={{pending? {n}}}`, or keep the pending change in a source of its own until it lands",
                                            match &via { Some(a) => format!("starts `{a}`, which can run"), None => "can run".into() }
                                        ),
                                    );
                                }
                            }
                        }
                    }
                    st.extend(children(n, false));
                }
            }
        }
    }
    /// AC-3a: `t`'s value comes from an `await` (with or without a first paint), here or in what it reads.
    fn awaits(&self, t: SId, busy: &mut HashSet<SId>) -> bool {
        let Some((e, env)) = self.syms[t].expr else { return false };
        if !busy.insert(t) {
            return false;
        }
        let mut stack = vec![Node::E(e)];
        while let Some(n) = stack.pop() {
            if let Node::E(x) = n {
                match &x.k {
                    ExprKind::Fn { .. } | ExprKind::ServerFn { .. } | ExprKind::Peek(_) => continue,
                    ExprKind::Await { .. } => return true,
                    ExprKind::Id(name) => {
                        if let Some(u) = self.lookup(env, name) {
                            if u != t && matches!(self.syms[u].kind, SymKind::Eq | SymKind::Source) && self.awaits(u, busy) {
                                return true;
                            }
                        }
                        continue;
                    }
                    _ => {}
                }
            }
            stack.extend(children(n, false));
        }
        false
    }
    /// AC-3a: `t`'s question reads one of `inputs` (what a click reads) that does not itself follow `t`.
    fn asks_about(&self, t: SId, inputs: &[SId]) -> bool {
        let Some((e, env)) = self.syms[t].expr else { return false };
        inputs.iter().any(|&i| i != t && !self.syms[i].expr.is_some_and(|(ie, ienv)| self.depends(ie, ienv, t, &mut HashSet::new())) && self.depends(e, env, i, &mut HashSet::new()))
    }
    /// R-8: `s` can be read before its first answer: an `await` with no first paint (`-> v`, R-7) in it or what it reads.
    fn absent(&self, s: SId, memo: &mut HashMap<SId, bool>, busy: &mut HashSet<SId>) -> bool {
        self.sym_absent(s, false, memo, busy)
    }
    /// `first`: on the first load (CN-3d) rather than at any time (R-8). `memo` is per mode.
    fn sym_absent(&self, s: SId, first: bool, memo: &mut HashMap<SId, bool>, busy: &mut HashSet<SId>) -> bool {
        if let Some(&b) = memo.get(&s) {
            return b;
        }
        if self.holds_mode.get() {
            // MO-10: a reader may hold; a primitive's other parts are bound as they are
            if self.syms[s].reader {
                return true;
            }
            if matches!(self.syms[s].foreign, Some(FShape::Part(Part::Fn | Part::Value))) {
                return false;
            }
        }
        let Some((e, env)) = self.syms[s].expr else { return false };
        if !busy.insert(s) {
            return false;
        }
        let out = self.expr_absent(e, env, Some(s), first, memo, busy);
        busy.remove(&s);
        memo.insert(s, out);
        out
    }
    /// `e` can have no value yet: it awaits without a first paint (`-> v`), here or in an equation it reads (a probe
    /// too: R-9, no verdict before a first answer). R-8 (a handler's snapshot, at any time): `peek` is the snapshot's own read, and
    /// every branch counts. CN-3d (`first`): only what the first load surely asks: a question behind a condition
    /// (`c ? null : await f()`, `c && await f()`, a `catch`'s alternative) waits only if `c` lets it, which the
    /// checker cannot know.
    fn expr_absent(&self, e: &Expr, env: EId, own: Option<SId>, first: bool, memo: &mut HashMap<SId, bool>, busy: &mut HashSet<SId>) -> bool {
        let mut stack = vec![Node::E(e)];
        while let Some(n) = stack.pop() {
            if let Node::E(x) = n {
                match &x.k {
                    ExprKind::Fn { .. } | ExprKind::ServerFn { .. } => continue,
                    ExprKind::Peek(_) if !first => continue,
                    ExprKind::Await { init: None, .. } => return true,
                    ExprKind::Await { init: Some(_), .. } => continue,
                    ExprKind::Member { .. } | ExprKind::Index { .. } if self.held_field(x, env).is_some_and(|h| h.1) => return true, // MO-10f: a field that holds
                    ExprKind::If { c, .. } if first => {
                        stack.push(Node::E(c));
                        continue;
                    }
                    ExprKind::Bin { op, l, .. } if first && matches!(op.as_str(), "&&" | "||" | "??") => {
                        stack.push(Node::E(l));
                        continue;
                    }
                    ExprKind::Catch { e: inner, .. } if first => {
                        stack.push(Node::E(inner));
                        continue;
                    }
                    ExprKind::Id(name) => {
                        if let Some(t) = self.lookup(env, name) {
                            if Some(t) != own && matches!(self.syms[t].kind, SymKind::Eq | SymKind::Source) && self.sym_absent(t, first, memo, busy) {
                                return true;
                            }
                        }
                        continue;
                    }
                    _ => {}
                }
            }
            stack.extend(children(n, false));
        }
        false
    }
    /// CN-3e: a `loading on(k)` region re-arms when `k` changes, to show its fallback while what it waits on loads again.
    /// A reader outside the region of an equation that region waits on, and that `k` re-asks, holds the same change
    /// (nothing above it shows a fallback), so the region's fallback can never show: the change waits silently. Solid's
    /// dev build warns this at run time (LOADING_ON_OUTSIDE_HOLD); the checker sees it when both reads are in one
    /// component. `latest`, `pending?` and `peek` reads hold nothing.
    fn loading_on_outside(&mut self) {
        let mut found: Vec<(i64, String, String)> = vec![];
        let all_keys: Vec<Vec<(SId, Option<&str>)>> = self.load_ons.iter().map(|lo| self.on_keys(lo)).collect();
        for (li, lo) in self.load_ons.iter().enumerate() {
            let keys = &all_keys[li];
            // a reader in another region that re-arms on the same change shows that region's fallback: it holds nothing
            let rearmed = |r: RId| self.load_ons.iter().enumerate().any(|(oi, o)| oi != li && self.inside(r, o.region) && all_keys[oi].iter().any(|k| keys.contains(k)));
            // what the region waits on: questions read inside it that a key re-asks
            let mut waits: Vec<SId> = vec![];
            for rd in &self.readers {
                if !self.inside(rd.region, lo.region) {
                    continue;
                }
                for t in self.held_reads(rd.e, rd.env) {
                    if !waits.contains(&t) && keys.iter().any(|&(k, f)| t == k || self.syms[t].expr.is_some_and(|(e, env)| self.reads_key(e, env, k, f, &mut HashSet::new()))) {
                        waits.push(t);
                    }
                }
            }
            for rd in self.readers.iter().chain(self.effect_ins.iter()) {
                if self.inside(rd.region, lo.region) || std::ptr::eq(rd.e, lo.e) || self.regions[rd.region].component != self.regions[lo.region].component || rearmed(rd.region) {
                    continue;
                }
                let held = self.held_reads(rd.e, rd.env);
                if let Some(&t) = waits.iter().find(|&&t| held.contains(&t)) {
                    found.push((rd.line, self.syms[t].name.clone(), show(lo.e)));
                }
            }
        }
        for (line, name, on) in found {
            self.line = line;
            self.err(
                "LOADING_ON_OUTSIDE_HOLD",
                "CN-3e",
                format!(
                    "`{}` is read here, outside the `loading on({})` region that waits on it: when `{}` changes this read holds the change, so the region's fallback never shows and the old content stays up with no sign of the wait — move the read under the region, or read `latest {}` here",
                    name, on, on, name
                ),
            );
        }
    }
    /// CN-3e: the keys of a `loading on(…)`: the names its `on` reads, and for props the field read (`on(props.selected)`
    /// keys on `selected` alone).
    fn on_keys(&self, lo: &ReaderRec<'a>) -> Vec<(SId, Option<&'a str>)> {
        let mut keys = vec![];
        let mut stack = vec![Node::E(lo.e)];
        while let Some(n) = stack.pop() {
            if let Node::E(x) = n {
                if let ExprKind::Member { o, p, .. } = &x.k {
                    if let ExprKind::Id(name) = &o.k {
                        if let Some(t) = self.lookup(lo.env, name).filter(|&t| self.syms[t].kind == SymKind::Props) {
                            keys.push((t, Some(p.as_str())));
                            continue;
                        }
                    }
                }
                if let ExprKind::Id(name) = &x.k {
                    if let Some(t) = self.lookup(lo.env, name) {
                        keys.push((t, None));
                    }
                    continue;
                }
            }
            stack.extend(children(n, false));
        }
        keys
    }
    /// CN-3e: `e` reads `k` (with `f`, only the prop field `k.f`), directly or through the equations it reads.
    fn reads_key(&self, e: &Expr, env: EId, k: SId, f: Option<&str>, busy: &mut HashSet<SId>) -> bool {
        let Some(f) = f else { return self.depends(e, env, k, busy) };
        let mut stack = vec![Node::E(e)];
        while let Some(n) = stack.pop() {
            if let Node::E(x) = n {
                match &x.k {
                    ExprKind::Fn { .. } | ExprKind::ServerFn { .. } => continue,
                    ExprKind::Member { o, p, .. } if p == f && matches!(&o.k, ExprKind::Id(name) if self.lookup(env, name) == Some(k)) => return true,
                    ExprKind::Id(name) => {
                        if let Some(t) = self.lookup(env, name) {
                            if let Some((te, tenv)) = self.syms[t].expr {
                                if busy.insert(t) && self.reads_key(te, tenv, k, Some(f), busy) {
                                    return true;
                                }
                            }
                        }
                        continue;
                    }
                    _ => {}
                }
            }
            stack.extend(children(n, false));
        }
        false
    }
    /// CN-3e: the questions (async equations and sources) `e` holds on: what it reads, directly or through the equations it
    /// reads, outside `latest`, `pending?` and `peek`.
    fn held_reads(&self, e: &Expr, env: EId) -> Vec<SId> {
        let mut out = vec![];
        let mut busy = HashSet::new();
        let mut stack = vec![(e, env)];
        while let Some((e, env)) = stack.pop() {
            let mut nodes = vec![Node::E(e)];
            while let Some(n) = nodes.pop() {
                if let Node::E(x) = n {
                    match &x.k {
                        ExprKind::Fn { .. } | ExprKind::ServerFn { .. } | ExprKind::Peek(_) | ExprKind::Latest(_) | ExprKind::Pending(_) => continue,
                        ExprKind::Id(name) => {
                            if let Some(t) = self.lookup(env, name) {
                                if matches!(self.syms[t].kind, SymKind::Eq | SymKind::Source) && busy.insert(t) {
                                    self.holds_mode.set(true);
                                    let held = self.absent(t, &mut HashMap::new(), &mut HashSet::new());
                                    self.holds_mode.set(false);
                                    if held {
                                        out.push(t);
                                    }
                                    if let Some((te, tenv)) = self.syms[t].expr {
                                        stack.push((te, tenv));
                                    }
                                }
                            }
                            continue;
                        }
                        _ => {}
                    }
                }
                nodes.extend(children(n, false));
            }
        }
        out
    }
    /// R-8: `e` reads `s`, directly or through the equations it reads.
    fn depends(&self, e: &Expr, env: EId, s: SId, busy: &mut HashSet<SId>) -> bool {
        self.depends_in(e, env, s, busy, true)
    }
    /// `probes: false`: only reads of `s`'s value count, not of its verdict (`pending? s`), which takes no failure
    /// (R-8, ruled 2026-11-13).
    fn depends_in(&self, e: &Expr, env: EId, s: SId, busy: &mut HashSet<SId>, probes: bool) -> bool {
        let mut stack = vec![Node::E(e)];
        while let Some(n) = stack.pop() {
            if let Node::E(x) = n {
                match &x.k {
                    ExprKind::Fn { .. } | ExprKind::ServerFn { .. } => continue,
                    ExprKind::Pending(_) if !probes => continue,
                    ExprKind::Id(name) => {
                        if let Some(t) = self.lookup(env, name) {
                            if t == s {
                                return true;
                            }
                            if let Some((te, tenv)) = self.syms[t].expr {
                                if busy.insert(t) && self.depends_in(te, tenv, s, busy, probes) {
                                    return true;
                                }
                            }
                        }
                        continue;
                    }
                    _ => {}
                }
            }
            stack.extend(children(n, false));
        }
        false
    }
    /// R-8: some region around `r` that is `kind` has a reader of `s` in it.
    fn region_reads(&self, r: RId, s: SId, kind: impl Fn(&Region) -> bool) -> bool {
        self.region_reads_in(r, s, kind, true)
    }
    /// `probes`: whether a read under `pending?` counts. For the failure half it does not: the region catches only
    /// what its content reads (ruled 2026-11-13, found by the desk9 reference's fuzz seed 11).
    fn region_reads_in(&self, r: RId, s: SId, kind: impl Fn(&Region) -> bool, probes: bool) -> bool {
        let mut cur = Some(r);
        while let Some(c) = cur {
            if kind(&self.regions[c]) {
                for rd in &self.readers {
                    if self.inside(rd.region, c) && self.depends_in(rd.e, rd.env, s, &mut HashSet::new(), probes) {
                        return true;
                    }
                }
            }
            if self.regions[c].is_component_root {
                break;
            }
            cur = self.regions[c].parent;
        }
        false
    }
    fn inside(&self, r: RId, anc: RId) -> bool {
        let mut cur = Some(r);
        while let Some(c) = cur {
            if c == anc {
                return true;
            }
            cur = self.regions[c].parent;
        }
        false
    }

    // ---- R-f: failures ----
    fn sym_fails(&mut self, s: SId) -> Fails {
        let (e, env) = match &mut self.syms[s].fails_t {
            None => return Fails::default(),
            Some(FailsT::Fixed(x)) => return Fails { cls: x.clone(), props: vec![] },
            Some(FailsT::Expr { cache: Some(c), .. }) => return c.clone(),
            Some(FailsT::Expr { busy: true, .. }) => return Fails::default(),
            Some(FailsT::Expr { e, env, busy, .. }) => {
                *busy = true;
                (*e, *env)
            }
        };
        let f = self.fails_of(e, env, false, &HashMap::new());
        if let Some(FailsT::Expr { e: e2, cache, busy, .. }) = &mut self.syms[s].fails_t {
            if std::ptr::eq(*e2, e) {
                *busy = false;
                *cache = Some(f.clone());
            }
        }
        f
    }
    fn sym_server_rejects(&mut self, s: SId) -> IndexSet<String> {
        let (body, env) = match &self.syms[s].server_rejects {
            None => return ["Error".to_string()].into_iter().collect(),
            Some(ServerRejects::Fixed(x)) => return x.clone(),
            Some(ServerRejects::Body { cache: Some(c), .. }) => return c.clone(),
            Some(ServerRejects::Body { body, env, .. }) => (*body, *env),
        };
        let mut out = self.stmts_fails(body, env, &HashMap::new()).cls;
        out.insert("Error".into());
        if let Some(ServerRejects::Body { cache, .. }) = &mut self.syms[s].server_rejects {
            *cache = Some(out.clone());
        }
        out
    }
    /// R-f-2/3/4: the failures an expression's evaluation can produce. `imp`: imperative scope, where closures are not run
    /// now. `bound`: catch bindings in scope and what they caught (for a rethrow).
    fn fails_of(&mut self, e: &'a Expr, env: EId, imp: bool, bound: &HashMap<String, IndexSet<String>>) -> Fails {
        self.fails_node(Node::E(e), env, imp, bound)
    }
    fn fails_node(&mut self, n: Node<'a>, env: EId, imp: bool, bound: &HashMap<String, IndexSet<String>>) -> Fails {
        let mut out = Fails::default();
        let e = match n {
            Node::E(e) => e,
            Node::S(Stmt { k: StmtKind::Throw(x), .. }) => {
                // a statement walked as an expression shares the expression's `throw` case
                let f = self.fails_of(x, env, imp, bound);
                out.add(f);
                out.cls.insert(self.class_of(x, env, bound));
                return out;
            }
            Node::S(_) => {
                for c in children(n, false) {
                    let f = self.fails_node(c, env, imp, bound);
                    out.add(f);
                }
                return out;
            }
        };
        match &e.k {
            ExprKind::Lit(_) | ExprKind::Pending(_) | ExprKind::Pre { .. } | ExprKind::ServerFn { .. } => out,
            ExprKind::Id(name) => {
                if bound.contains_key(name) {
                    return out;
                }
                let Some(s) = self.lookup(env, name) else { return out };
                match self.syms[s].kind {
                    SymKind::Props => {
                        out.props.push(PropRef { comp: self.syms[s].region, field: "*".into(), pre: vec![] });
                        out
                    }
                    SymKind::Eq | SymKind::Source if self.syms[s].fails_t.is_some() => {
                        let f = self.sym_fails(s);
                        out.add(f);
                        out
                    }
                    _ => out,
                }
            }
            ExprKind::Member { o, p, .. } => {
                if let ExprKind::Id(on) = &o.k {
                    if !bound.contains_key(on) {
                        if let Some(s) = self.lookup(env, on) {
                            if self.syms[s].kind == SymKind::Props {
                                out.props.push(PropRef { comp: self.syms[s].region, field: p.clone(), pre: vec![] });
                                return out;
                            }
                        }
                    }
                }
                self.held_fails(e, env, bound, &mut out);
                let f = self.fails_of(o, env, imp, bound);
                out.add(f);
                out
            }
            ExprKind::Index { o, i, .. } => {
                if let ExprKind::Id(on) = &o.k {
                    if !bound.contains_key(on) {
                        if let Some(s) = self.lookup(env, on) {
                            if self.syms[s].kind == SymKind::Props {
                                // `props["x"]` is `props.x`; `props[k]` may be any of them
                                out.props.push(PropRef { comp: self.syms[s].region, field: lit_key(i).unwrap_or_else(|| "*".into()), pre: vec![] });
                                let f = self.fails_of(i, env, imp, bound);
                                out.add(f);
                                return out;
                            }
                        }
                    }
                }
                self.held_fails(e, env, bound, &mut out);
                let f = self.fails_of(o, env, imp, bound);
                out.add(f);
                let f = self.fails_of(i, env, imp, bound);
                out.add(f);
                out
            }
            ExprKind::Use(name) => {
                let Some(c) = self.lookup(env, name).and_then(|s| self.syms[s].ctx.clone()) else { return out };
                if let Some((_, fails)) = &c.contract {
                    out.cls.extend(fails.iter().cloned());
                    return out;
                }
                let mut i = 0;
                while i < self.provisions.len() {
                    let (pk, pe, penv) = (self.provisions[i].key.clone(), self.provisions[i].e, self.provisions[i].env);
                    if pk == c.key {
                        let f = self.fails_of(pe, penv, false, &HashMap::new());
                        out.add(f);
                    }
                    i += 1;
                }
                out
            }
            ExprKind::Await { e: inner, init, .. } => {
                let f = self.fails_of(inner, env, imp, bound);
                out.add(f);
                if let Some(i) = init {
                    let f = self.fails_of(i, env, imp, bound);
                    out.add(f);
                }
                for c in self.rejects(inner, env, &mut HashSet::new()) {
                    out.cls.insert(c);
                }
                out
            }
            ExprKind::Throw(x) => {
                let f = self.fails_of(x, env, imp, bound);
                out.add(f);
                out.cls.insert(self.class_of(x, env, bound));
                out
            }
            ExprKind::Catch { e: inner, name, classes, alt } => {
                let inn = self.fails_of(inner, env, imp, bound);
                let c = Catch::of(classes);
                let got: IndexSet<String> = inn.cls.iter().filter(|x| c.caught(x)).cloned().collect();
                for x in &inn.cls {
                    if !c.caught(x) {
                        out.cls.insert(x.clone());
                    }
                }
                for pr in &inn.props {
                    let mut pre = pr.pre.clone();
                    pre.push(c.clone());
                    out.props.push(PropRef { comp: pr.comp, field: pr.field.clone(), pre });
                }
                let mut b2 = bound.clone();
                if let Some(n) = name {
                    b2.insert(n.clone(), if c == Catch::All { inn.cls.clone() } else { got });
                }
                let f = self.fails_of(alt, env, imp, &b2);
                out.add(f);
                out
            }
            ExprKind::Fn { params, body, stmts, .. } => {
                if imp || stmts.is_some() {
                    return out;
                }
                let mut b2 = bound.clone();
                for p in params {
                    b2.insert(p.clone(), IndexSet::new());
                }
                let region = self.reg(env);
                let inner = self.env(Some(env), region);
                for p in params {
                    self.set_value(inner, p, 0);
                }
                let f = self.fails_of(body, inner, imp, &b2);
                out.add(f);
                out
            }
            ExprKind::Call { f, args, .. } => {
                match &f.k {
                    ExprKind::Id(fname) if !bound.contains_key(fname) => {
                        if let Some(s) = self.lookup(env, fname) {
                            let k = self.syms[s].kind;
                            if k == SymKind::Fn && self.syms[s].fails_t.is_some() {
                                let x = self.sym_fails(s);
                                out.add(x);
                            } else if !matches!(k, SymKind::ErrClass | SymKind::Import | SymKind::Action | SymKind::Server) {
                                let x = self.fails_of(f, env, imp, bound);
                                out.add(x);
                            }
                        }
                    }
                    _ => {
                        let x = self.fails_of(f, env, imp, bound);
                        out.add(x);
                    }
                }
                for a in args {
                    let x = self.fails_of(a, env, imp, bound);
                    out.add(x);
                }
                out
            }
            ExprKind::Draft { seed, body } => {
                let x = self.fails_of(seed, env, imp, bound);
                out.add(x);
                for st in body {
                    if let StmtKind::Let { e, .. } | StmtKind::Expr(e) | StmtKind::Write { e, .. } = &st.k {
                        let x = self.fails_of(e, env, imp, bound);
                        out.add(x);
                    }
                }
                out
            }
            _ => {
                for c in children(Node::E(e), false) {
                    let x = self.fails_node(c, env, imp, bound);
                    out.add(x);
                }
                out
            }
        }
    }
    /// R-f-8: what an awaited value's promise may reject with.
    fn rejects(&mut self, e: &'a Expr, env: EId, seen: &mut HashSet<SId>) -> IndexSet<String> {
        fn root(x: &Expr) -> &Expr {
            match &x.k {
                ExprKind::Member { o, .. } | ExprKind::Index { o, .. } => root(o),
                _ => x,
            }
        }
        let error = || -> IndexSet<String> { ["Error".to_string()].into_iter().collect() };
        match &e.k {
            ExprKind::Lit(_) | ExprKind::Tpl(_) | ExprKind::Arr(_) | ExprKind::Rec(_) | ExprKind::Bin { .. } | ExprKind::Un { .. } => IndexSet::new(),
            ExprKind::If { t, f, .. } => {
                let mut a = self.rejects(t, env, seen);
                a.extend(self.rejects(f, env, seen));
                a
            }
            ExprKind::Call { f, args, .. } => {
                let r = root(f);
                if let ExprKind::Id(fname) = &f.k {
                    if fname == "until" && self.lookup(env, "until").is_none() {
                        return match args.first() {
                            Some(Expr { k: ExprKind::Fn { body, stmts: None, .. }, .. }) => self.fails_of(body, env, false, &HashMap::new()).cls,
                            _ => IndexSet::new(),
                        };
                    }
                }
                if let ExprKind::Id(rn) = &r.k {
                    if let Some(s) = self.lookup(env, rn) {
                        let k = self.syms[s].kind;
                        if k == SymKind::Import {
                            return self.syms[s].rejects.clone().unwrap_or_else(error);
                        }
                        if k == SymKind::Server {
                            return if self.syms[s].server_rejects.is_some() { self.sym_server_rejects(s) } else { error() };
                        }
                        if k == SymKind::Fn {
                            if let Some((t, te)) = self.syms[s].fn_tail {
                                if matches!(&f.k, ExprKind::Id(_)) && !seen.contains(&s) {
                                    seen.insert(s);
                                    return self.rejects(t, te, seen);
                                }
                            }
                            if let Some(rj) = &self.syms[s].rejects {
                                return rj.clone();
                            }
                        }
                        if k == SymKind::Action {
                            return IndexSet::new();
                        }
                    }
                }
                error()
            }
            ExprKind::Id(name) => {
                if let Some(s) = self.lookup(env, name) {
                    if let Some((x, xe)) = self.syms[s].expr {
                        if !seen.contains(&s) {
                            seen.insert(s);
                            return self.rejects(x, xe, seen);
                        }
                    }
                }
                error()
            }
            _ => error(),
        }
    }
    /// R-f-3: the class a `throw` fails with — a declared class's construction, a rethrown catch binding, else Error.
    fn class_of(&self, e: &Expr, env: EId, bound: &HashMap<String, IndexSet<String>>) -> String {
        if let ExprKind::Call { f, .. } = &e.k {
            if let ExprKind::Id(n) = &f.k {
                if self.lookup(env, n).is_some_and(|s| matches!(self.syms[s].kind, SymKind::ErrClass | SymKind::Import)) {
                    return n.clone();
                }
            }
        }
        if let ExprKind::Id(n) = &e.k {
            if let Some(b) = bound.get(n) {
                return if b.len() == 1 {
                    b[0].clone()
                } else if !b.is_empty() {
                    b.iter().cloned().collect::<Vec<_>>().join("|")
                } else {
                    "Error".into()
                };
            }
        }
        "Error".into()
    }
    /// R-f-6: the failures an action body lets out.
    fn stmts_fails(&mut self, ss: &'a [Stmt], env0: EId, bound: &HashMap<String, IndexSet<String>>) -> Fails {
        let mut out = Fails::default();
        let region = self.reg(env0);
        let env = self.env(Some(env0), region);
        for s in ss {
            match &s.k {
                StmtKind::Let { name, e, .. } => {
                    let f = self.fails_of(e, env, true, bound);
                    out.add(f);
                    self.set_value(env, name, 0);
                }
                StmtKind::Expr(e) => {
                    let f = self.fails_of(e, env, true, bound);
                    out.add(f);
                }
                StmtKind::Return(e) => {
                    if let Some(e) = e {
                        let f = self.fails_of(e, env, true, bound);
                        out.add(f);
                    }
                }
                StmtKind::Write { target, e } | StmtKind::Optimistic { target, e } => {
                    for p in &target.path {
                        if let PathSeg::Expr(x) = p {
                            let f = self.fails_of(x, env, true, bound);
                            out.add(f);
                        }
                    }
                    let f = self.fails_of(e, env, true, bound);
                    out.add(f);
                }
                StmtKind::Throw(e) => {
                    let f = self.fails_of(e, env, true, bound);
                    out.add(f);
                    for c in self.class_of(e, env, bound).split('|') {
                        out.cls.insert(c.to_string());
                    }
                }
                StmtKind::Sif { c, t, f } => {
                    let x = self.fails_of(c, env, true, bound);
                    out.add(x);
                    let x = self.stmts_fails(t, env, bound);
                    out.add(x);
                    let x = self.stmts_fails(f, env, bound);
                    out.add(x);
                }
                StmtKind::For { name, e, body } => {
                    let x = self.fails_of(e, env, true, bound);
                    out.add(x);
                    let lenv = self.env(Some(env), region);
                    self.set_value(lenv, name, 0);
                    let x = self.stmts_fails(body, lenv, bound);
                    out.add(x);
                }
                StmtKind::Try { body, catch_name, catch_classes, handler, fin } => {
                    let b = self.stmts_fails(body, env, bound);
                    if let Some(h) = handler {
                        let c = Catch::of(catch_classes);
                        for x in &b.cls {
                            if !c.caught(x) {
                                out.cls.insert(x.clone());
                            }
                        }
                        for pr in &b.props {
                            let mut pre = pr.pre.clone();
                            pre.push(c.clone());
                            out.props.push(PropRef { comp: pr.comp, field: pr.field.clone(), pre });
                        }
                        let mut b2 = bound.clone();
                        if let Some(n) = catch_name {
                            b2.insert(n.clone(), b.cls.iter().filter(|x| c.caught(x)).cloned().collect());
                        }
                        let henv = self.env(Some(env), region);
                        if let Some(n) = catch_name {
                            self.set_value(henv, n, 0);
                        }
                        let x = self.stmts_fails(h, henv, &b2);
                        out.add(x);
                    } else {
                        out.add(b);
                    }
                    if let Some(f) = fin {
                        let x = self.stmts_fails(f, env, bound);
                        out.add(x);
                    }
                }
                StmtKind::Action(_) | StmtKind::Refresh(_) | StmtKind::Affects(_) => {}
            }
        }
        out
    }

    // ---- R-f-5/6 and RG-7b over the static application tree ----
    fn resolve_tree(&mut self) {
        let readers: Vec<(RId, &'a Expr, EId, i64)> = self.readers.iter().map(|r| (r.region, r.e, r.env, r.line)).collect();
        let mut reader_f = vec![];
        for &(region, e, env, line) in &readers {
            let f = self.fails_of(e, env, false, &HashMap::new());
            reader_f.push((region, e, line, f));
        }
        let mut memo = HashMap::new();
        for &(region, e, env, line) in &readers {
            if self.rows_of(e, env).contains("client") || (self.opts.spa && self.expr_absent(e, env, None, true, &mut memo, &mut HashSet::new())) {
                self.uses.push(UseRec { region, name: HOLD.into(), line, display: show(e) });
            }
        }
        let apps: Vec<(usize, Vec<(String, &'a Expr, EId)>)> = self.apps.iter().enumerate().map(|(i, a)| (i, a.args.clone())).collect();
        let mut arg_r = vec![];
        for (i, args) in &apps {
            for (field, e, env) in args {
                if self.rows_of(e, *env).contains("client") || (self.opts.spa && self.expr_absent(e, *env, None, true, &mut memo, &mut HashSet::new())) {
                    arg_r.push((*i, field.clone()));
                }
            }
        }
        let mut arg_f = vec![];
        for (i, args) in &apps {
            for (field, e, env) in args {
                let f = self.fails_of(e, *env, false, &HashMap::new());
                arg_f.push((*i, field.clone(), f));
            }
        }
        let actions: Vec<(String, &'a [Stmt], EId, i64)> = self.actions.iter().map(|a| (a.name.clone(), a.body, a.env, a.line)).collect();
        let mut act_f = vec![];
        for (name, body, env, line) in &actions {
            let f = self.stmts_fails(body, *env, &HashMap::new());
            act_f.push((name.clone(), *line, f));
        }
        let pre = |cs: &[Catch]| -> Vec<Step> { cs.iter().map(|f| Step { f: Some(f.clone()), p: None }).collect() };
        let mut occ = vec![];
        for (region, _, _, f) in &reader_f {
            for pr in &f.props {
                occ.push(Occ { comp: pr.comp, field: pr.field.clone(), pre: pre(&pr.pre), via: Via::Reader(*region) });
            }
        }
        for &(region, comp) in &self.outlets {
            // MO-11p: an outlet places the children
            occ.push(Occ { comp, field: "children".into(), pre: vec![], via: Via::Reader(region) });
        }
        for (comp, field, region) in &self.forwards {
            // MO-11o: what the prop carries is rendered there
            occ.push(Occ { comp: *comp, field: field.clone(), pre: vec![], via: Via::Reader(*region) });
        }
        for (i, field, f) in &arg_f {
            for pr in &f.props {
                let a = &self.apps[*i];
                occ.push(Occ { comp: pr.comp, field: pr.field.clone(), pre: pre(&pr.pre), via: Via::Arg { comp: a.comp, field: field.clone(), site: a.site } });
            }
        }
        for (name, line, f) in &act_f {
            for pr in &f.props {
                occ.push(Occ { comp: pr.comp, field: pr.field.clone(), pre: pre(&pr.pre), via: Via::Action { line: *line, name: name.clone() } });
            }
        }
        self.occ = occ;
        self.reader_f = reader_f;
        self.arg_r = arg_r;
        self.arg_f = arg_f;

        let top = self.esc(None);
        for it in top.fails {
            self.line = it.line;
            let suffix = if it.cls == "Error" { String::new() } else { format!(": {}", it.cls) };
            self.err(
                "UNHANDLED_FAILURE",
                "R-f-5",
                format!(
                    "a reader of {} can fail with {} and no catch or errored boundary above it discharges {} — show it where it is read: `errored fallback(e{}) {{ … }} {{ … }}` around the reader (or `await … catch (e) => …` at the await, to make the rejection an answer)",
                    it.what, it.cls, it.cls, suffix
                ),
            );
        }
        for it in top.reqs {
            self.line = it.line;
            if it.name == HOLD && self.opts.spa {
                self.err(
                    "ASYNC_OUTSIDE_LOADING_BOUNDARY",
                    "CN-3d",
                    format!(
                        "{} can have no value yet, and no `loading` region above it holds it on some path that renders it: in a client-only build the first load would show nothing until it answers — put it under `loading fallback {{ … }} {{ … }}`, or give the await a first paint (`await f() -> v`). Later answers are transitions and need no region",
                        it.what
                    ),
                );
                continue;
            }
            if it.name == HOLD {
                self.err(
                    "CLIENT_QUESTION_UNHELD",
                    "SV-7b",
                    format!(
                        "{} awaits `client` JS, and no `loading` region above it holds it on any path that renders it: the server never asks a client question, so it could never finish this page — put the reader under `loading fallback {{ … }} {{ … }}`, or give the await a first paint (`await f() -> v`)",
                        it.what
                    ),
                );
                continue;
            }
            let file = it.name.split('#').next().unwrap_or("").split('/').last().unwrap_or("").to_string();
            self.err("CONTEXT_NOT_FOUND", "RG-7b", format!("{}: no provision of {} (declared in {}) above this region on any path that renders it", it.what, key_name(&it.name), file));
        }
        for (name, line, f) in act_f {
            if !f.cls.is_empty() {
                self.line = line;
                self.err(
                    "UNCAUGHT_ACTION_FAILURE",
                    "R-f-6",
                    format!(
                        "action {} can fail with {} and does not catch it: a handler cannot (it does not await the action) — `try {{ … }} catch (e) {{ … }}` in the body",
                        name,
                        f.cls.iter().cloned().collect::<Vec<_>>().join(", ")
                    ),
                );
            }
        }
    }
    /// The steps from a region up to its component's root (or the program's), through children's reads.
    fn routes(&mut self, r0: RId) -> Vec<Vec<Step>> {
        if let Some(m) = self.r_memo.get(&r0) {
            return m.clone();
        }
        if self.r_busy.contains(&r0) {
            return vec![];
        }
        self.r_busy.insert(r0);
        let mut local: Vec<Step> = vec![];
        let mut out: Vec<Vec<Step>> = vec![];
        let mut r = Some(r0);
        while let Some(ri) = r {
            let (catches, provides, kids, kids_field, root) = {
                let reg = &self.regions[ri];
                (reg.catches.clone(), reg.provides.clone(), reg.kids, reg.kids_field.clone(), reg.is_component_root || reg.parent.is_none())
            };
            if catches.is_some() || !provides.is_empty() {
                local.push(Step { f: catches, p: if provides.is_empty() { None } else { Some(Catch::Set(provides)) } });
            }
            if let Some((comp, site)) = kids {
                for p in self.pf(comp, kids_field.as_deref().unwrap_or("children")) {
                    if p.term.is_none() {
                        for q in self.routes(site) {
                            let mut c = local.clone();
                            c.extend(p.chain.iter().cloned());
                            c.extend(q);
                            out.push(c);
                        }
                    }
                }
                break;
            }
            if root {
                out = vec![local.clone()];
                break;
            }
            r = self.regions[ri].parent;
        }
        let out = dedupe_chains(out);
        self.r_busy.remove(&r0);
        self.r_memo.insert(r0, out.clone());
        out
    }
    fn via(&mut self, v: &Via) -> Vec<PFEntry> {
        match v {
            Via::Reader(region) => self.routes(*region).into_iter().map(|q| PFEntry { chain: q, term: None }).collect(),
            Via::Arg { comp, field, site } => {
                let mut out = vec![];
                for p in self.pf(*comp, field) {
                    if p.term.is_some() {
                        out.push(p);
                    } else {
                        for q in self.routes(*site) {
                            let mut c = p.chain.clone();
                            c.extend(q);
                            out.push(PFEntry { chain: c, term: None });
                        }
                    }
                }
                out
            }
            Via::Action { line, name } => vec![PFEntry { chain: vec![], term: Some((*line, name.clone())) }],
        }
    }
    /// Where a component's prop field goes once read — up to its root, or out of an action.
    fn pf(&mut self, g: RId, field: &str) -> Vec<PFEntry> {
        if let Some(sig) = &self.regions[g].sig {
            // a spread ("*") goes wherever any field goes
            let ss: Vec<_> = if field == "*" { sig.props.values().collect() } else { sig.props.get(field).or_else(|| sig.props.get("*")).into_iter().collect() };
            let mut out = vec![];
            for s in ss {
                out.push(PFEntry { chain: vec![Step { f: Some(s.f.clone()), p: Some(s.p.clone()) }], term: None });
                if let Some((af, an)) = &s.action {
                    out.push(PFEntry { chain: vec![Step { f: Some(af.clone()), p: None }], term: Some((-1, an.clone())) });
                }
            }
            return out;
        }
        let k = (self.regions[g].id, field.to_string());
        if let Some(m) = self.pf_memo.get(&k) {
            return m.clone();
        }
        if self.pf_busy.contains(&k) {
            return vec![];
        }
        self.pf_busy.insert(k.clone());
        let mut out = vec![];
        let occ = self.occ.clone();
        for o in &occ {
            if o.comp == g && (o.field == field || o.field == "*" || field == "*") {
                for v in self.via(&o.via) {
                    let mut c = o.pre.clone();
                    c.extend(v.chain);
                    out.push(PFEntry { chain: c, term: v.term });
                }
            }
        }
        let res = dedupe_entries(out);
        self.pf_busy.remove(&k);
        self.pf_memo.insert(k, res.clone());
        res
    }
    /// What escapes each component's root (and the program's): failures and provisions.
    fn esc(&mut self, c: Option<RId>) -> Esc {
        if let Some(ci) = c {
            if let Some(sig) = &self.regions[ci].sig {
                return Esc {
                    fails: sig.own.iter().map(|o| Item { cls: o.cls.clone(), line: -1, what: match &o.at { Some(at) => format!("{} at {}", o.what, at), None => o.what.clone() } }).collect(),
                    reqs: sig.requires.iter().map(|n| Req { name: n.clone(), line: -1, what: if n == HOLD { "a reader of a client question".into() } else { format!("use {}", key_name(n)) } }).collect(),
                };
            }
        }
        if let Some(m) = self.esc_memo.get(&c) {
            return m.clone();
        }
        if self.esc_busy.contains(&c) {
            return Esc::default();
        }
        self.esc_busy.insert(c);
        let mut res = Esc::default();
        let mut seen: HashSet<String> = HashSet::new();
        let push_f = |res: &mut Esc, seen: &mut HashSet<String>, it: Item| {
            if seen.insert(format!("F{}@{}:{}", it.cls, it.line, it.what)) {
                res.fails.push(it);
            }
        };
        let push_r = |res: &mut Esc, seen: &mut HashSet<String>, it: Req| {
            if seen.insert(format!("R{}@{}:{}", it.name, it.line, it.what)) {
                res.reqs.push(it);
            }
        };
        let comp_of = |s: &Self, r: RId| s.regions[r].component;
        let reader_f: Vec<(RId, &'a Expr, i64, IndexSet<String>)> = self.reader_f.iter().map(|(r, e, l, f)| (*r, *e, *l, f.cls.clone())).collect();
        for (region, e, line, cls) in reader_f {
            if comp_of(self, region) != c {
                continue;
            }
            for cl in cls {
                if self.routes(region).iter().any(|q| esc_f(q, &cl)) {
                    push_f(&mut res, &mut seen, Item { cls: cl, line, what: show(e) });
                }
            }
        }
        let uses: Vec<(RId, String, i64, String)> = self.uses.iter().map(|u| (u.region, u.name.clone(), u.line, u.display.clone())).collect();
        for (region, name, line, display) in uses {
            if comp_of(self, region) != c {
                continue;
            }
            if self.routes(region).iter().any(|q| esc_p(q, &name)) {
                let what = if name == HOLD { format!("a reader of {}", display) } else { format!("use {}", display) };
                push_r(&mut res, &mut seen, Req { name, line, what });
            }
        }
        for (ai, field) in self.arg_r.clone() {
            let (acomp, asite, aline, atag) = (self.apps[ai].comp, self.apps[ai].site, self.apps[ai].line, self.apps[ai].tag.clone());
            if comp_of(self, asite) != c {
                continue;
            }
            for p in self.pf(acomp, &field) {
                if p.term.is_none()
                    && self.routes(asite).iter().any(|q| {
                        let mut ch = p.chain.clone();
                        ch.extend(q.iter().cloned());
                        esc_p(&ch, HOLD)
                    })
                {
                    push_r(&mut res, &mut seen, Req { name: HOLD.into(), line: aline, what: format!("<{} {}>, read in {},", atag, arg_show(&field), atag) });
                    break;
                }
            }
        }
        for ai in 0..self.apps.len() {
            let (acomp, asite, aline, atag) = (self.apps[ai].comp, self.apps[ai].site, self.apps[ai].line, self.apps[ai].tag.clone());
            if comp_of(self, asite) != c {
                continue;
            }
            let e = self.esc(Some(acomp));
            for it in e.fails {
                if self.routes(asite).iter().any(|q| esc_f(q, &it.cls)) {
                    let line = if it.line < 0 { aline } else { it.line };
                    push_f(&mut res, &mut seen, Item { cls: it.cls, line, what: format!("{} (in <{}>)", it.what, atag) });
                }
            }
            for it in e.reqs {
                if self.routes(asite).iter().any(|q| esc_p(q, &it.name)) {
                    let line = if it.line < 0 { aline } else { it.line };
                    push_r(&mut res, &mut seen, Req { name: it.name, line, what: format!("{} (in <{}>)", it.what, atag) });
                }
            }
        }
        for (ai, field, f) in self.arg_f.clone() {
            let (acomp, asite, aline, atag) = (self.apps[ai].comp, self.apps[ai].site, self.apps[ai].line, self.apps[ai].tag.clone());
            if comp_of(self, asite) != c {
                continue;
            }
            for cl in &f.cls {
                for p in self.pf(acomp, &field) {
                    if let Some((_, tname)) = &p.term {
                        if esc_f(&p.chain, cl) {
                            self.line = aline;
                            self.err(
                                "UNCAUGHT_ACTION_FAILURE",
                                "R-f-6",
                                format!("action {} in <{}> reads props.{}, which can fail with {} here (line {}), and does not catch it", tname, atag, field, cl, aline),
                            );
                        }
                        continue;
                    }
                    if self.routes(asite).iter().any(|q| {
                        let mut ch = p.chain.clone();
                        ch.extend(q.iter().cloned());
                        esc_f(&ch, cl)
                    }) {
                        push_f(&mut res, &mut seen, Item { cls: cl.clone(), line: aline, what: format!("<{} {}>", atag, arg_show(&field)) });
                        break;
                    }
                }
            }
        }
        self.esc_busy.remove(&c);
        self.esc_memo.insert(c, res.clone());
        res
    }
    /// MO-3: the summary an importing module checks a component against.
    fn comp_sig(&mut self, g: RId) -> CompSig {
        let fields: IndexSet<String> = self.occ.iter().filter(|o| o.comp == g).map(|o| o.field.clone()).collect();
        let mut props = IndexMap::new();
        for f in fields {
            let es = self.pf(g, &f);
            let mut df = Catch::All;
            let mut dp = Catch::All;
            let mut da: Option<Catch> = None;
            let mut an = String::new();
            let mut rendered = false;
            for e in &es {
                if let Some((_, tname)) = &e.term {
                    let a = along(&e.chain, true);
                    da = Some(match da {
                        None => a,
                        Some(d) => meet(d, &a),
                    });
                    an = tname.clone();
                } else {
                    rendered = true;
                    df = meet(df, &along(&e.chain, true));
                    dp = meet(dp, &along(&e.chain, false));
                }
            }
            let renders = self.carried_props.get(&g).is_some_and(|c| c.contains(&f));
            let takes = self.prop_held.get(&g).map(|hs| hs.iter().filter_map(|(p, h, c)| p.strip_prefix(&format!("{f}.")).map(|r| (r.to_string(), *h, c.clone()))).collect()).unwrap_or_default();
            props.insert(f, PropSig { f: df, p: dp, rendered, action: da.map(|d| (d, an)), component: false, renders, takes });
        }
        // MO-11l: the props it keeps, of those it names whose declared type is not a primitive's (which holds nothing)
        let named: Vec<String> = self.prop_named.get(&g).map(|fs| fs.iter().cloned().collect()).unwrap_or_default();
        let scalar = |c: &Self, f: &str| c.regions[g].sig.is_none() && c.props_ty.get(&g).and_then(|t| ty_step(t, &TStep::Field(f.to_string()))).is_some_and(|t| ty_scalar(&t));
        let mut keeps: Vec<String> = vec![];
        for f in named {
            if !scalar(self, &f) && self.prop_keeps(g, &f).is_none() {
                keeps.push(f);
            }
        }
        keeps.sort();
        let e = self.esc(Some(g));
        let file = self.opts.file.clone().unwrap_or_else(|| "main.rx".into()).split('/').last().unwrap_or("").to_string();
        let shape = match self.comp_syms.get(&g).copied() {
            Some(cs) => self.shape(cs),
            None => Shape::default(),
        };
        let requires: IndexSet<String> = e.reqs.iter().map(|r| r.name.clone()).collect();
        let mut stored: IndexMap<String, Vec<String>> = IndexMap::new();
        if let Some(st) = self.retains.get(&g) {
            for (f, ts) in st {
                // an exported component's outside is its module
                let mut v: Vec<String> = ts.iter().map(|t| if t.starts_with("d:") { "module".to_string() } else { t[2..].to_string() }).collect::<IndexSet<_>>().into_iter().collect();
                v.sort();
                stored.insert(f.clone(), v);
            }
        }
        CompSig { made: false, own: e.fails.iter().map(|i| Own { cls: i.cls.clone(), what: i.what.clone(), at: Some(format!("{}:{}", file, i.line)) }).collect(), requires: requires.into_iter().collect(), props, shape: Some(shape), stored, keeps }
    }
}

/// The calls by name in a server fn's body (`callsIn`: every value, a target's path included).
fn calls_in(n: Node, out: &mut Vec<String>) {
    if let Node::E(Expr { k: ExprKind::Call { f, .. }, .. }) = n {
        if let ExprKind::Id(name) = &f.k {
            out.push(name.clone());
        }
    }
    for c in children(n, true) {
        calls_in(c, out);
    }
}
/// RG-7e: a context's written rows — the row words before its type.
fn contract_of(ty: Option<&str>) -> (IndexSet<String>, IndexSet<String>) {
    let mut rows = IndexSet::new();
    let mut fails = IndexSet::new();
    if let Some(m) = ty.and_then(|t| ROW_WORDS.find(t)) {
        for w in split_rows(js_trim(m.as_str())) {
            if let Some(inner) = w.strip_prefix("fails(") {
                let inner = &inner[..inner.len().saturating_sub(1)];
                for x in inner.split('|').map(js_trim).filter(|x| !x.is_empty()) {
                    fails.insert(x.to_string());
                }
            } else {
                rows.insert(w);
            }
        }
    }
    (rows, fails)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::modules::load_modules;

    fn codes(src: &str, spa: bool) -> Vec<(i64, String)> {
        let read = |p: &str| if p == "/app.rx" { Some(src.to_string()) } else { None };
        let set = load_modules("/app.rx", &read).unwrap();
        check_modules(&set, spa).diags.iter().map(|d| (d.line, d.code.clone())).collect()
    }

    // ---- MO-10k (ruled 2026-11-22): the guarantees, over every way a value is handed on ----
    // Not a list of cases: each confined value is put through every wrapper below and every pair of them (one inside
    // the other), and each result into every way out. The reference runs the same matrix (`ref/units.ts`).
    const LIB: &str = "export fn stashJs(x: any): void\nexport pure fn createClock(): any instantiates\nexport pure fn createLabel(width: number): any instantiates\nexport pure fn createStore<T>(init: T): [T, (update: (draft state: T) => T | void) => void]\nexport fn later(f: handler () => void): void\n";
    /// The ways an expression hands a value on: `X` is the value.
    const WRAPS: &[&str] = &[
        "X", "[X]", "[X][0]", "({ a: X })", "({ a: X }).a", "keep(X)", "keep(keep(X))", "id(id(X))", "o.f(X)", "[(y) => y][0](X)", "(true ? keep : keep)(X)", "mk(X)()",
        "(() => X)()", "[].concat([X])", "[].concat([X])[0]", "(true ? X : null)", "(X ?? null)", "(X || null)", "map([X], (y) => y)", "map([X], (y) => y)[0]",
        "filter([X], (y) => true)", "[X, 1].filter((y) => true)", "[...[X]]", "({ ...({ a: X }) })", "X.part", "X[\"part\"]", "X[k]", "(peek X)",
    ];
    fn wrapped(of: &str) -> Vec<String> {
        let one: Vec<String> = WRAPS.iter().map(|w| w.replace('X', of)).collect();
        let mut out = one.clone();
        for w in WRAPS {
            for inner in &one[1..] {
                out.push(w.replace('X', inner));
            }
        }
        out
    }
    fn codes_of(main: &str) -> Vec<String> {
        let main = format!("import {{ stashJs, createClock, createLabel, createStore, later }} from \"./lib.js\"\nfn keep(x) {{ x }}\nfn mk(x) {{ () => x }}\nsource held: any := null\ncontext ctx: any\ncomponent Cell() {{ <b>c</b> }}\ncomponent Grid(props: {{ t: any }}) {{ <button onClick={{() => {{ held := props.t }}}}>ok</button> }}\n{main}");
        let read = |p: &str| match p {
            "/app.rx" => Some(main.clone()),
            "/lib.d.rx" => Some(LIB.to_string()),
            _ => None,
        };
        let set = load_modules("/app.rx", &read).unwrap_or_else(|e| panic!("{}\n{main}", e.0));
        check_modules(&set, false).diags.iter().map(|d| d.code.clone()).collect()
    }
    const LOCALS: &str = "  o = { f: (x) => x }\n  id = (x) => x\n  k = \"part\"\n";

    /// 06 AC-3 (2026-11-22): a guess in a run that starts nothing to wait for has no hold, and the first guess written
    /// after an `await` is advised. `ref/units.ts` holds the same cases.
    #[test]
    fn a_guess_needs_something_to_wait_for() {
        const API: &str = "export fn save(k: string): Promise<void>\nexport fn track(k: string): void\n";
        let run = |body: &str| -> Vec<String> {
            let lines: Vec<String> = body.split("; ").map(|l| format!("    {l}")).collect();
            let src = format!("import {{ save, track }} from \"./api.js\"\nexport default component App() {{\n  source n := \"\"\n  source shown = n\n  action other() {{ n := \"x\" }}\n  <button onClick={{() => {{\n{}\n  }}}}>{{shown}}</button>\n}}\n", lines.join("\n"));
            let read = |p: &str| match p {
                "/app.rx" => Some(src.clone()),
                "/api.d.rx" => Some(API.to_string()),
                _ => None,
            };
            let set = load_modules("/app.rx", &read).unwrap_or_else(|e| panic!("{}\n{src}", e.0));
            let c = check_modules(&set, false);
            c.diags.iter().map(|d| format!("{}@{}", d.code, d.line - 6)).chain(c.advice.iter().map(|a| format!("advice {}@{}", a.code, a.line - 6))).collect()
        };
        assert_eq!(run("guess shown := \"a\""), ["GUESS_OUTSIDE_HOLD@1"]);
        assert_eq!(run("let v = \"a\"; onFlush(() => { n := \"\" }); guess shown := v"), ["GUESS_OUTSIDE_HOLD@3"]);
        assert_eq!(run("let f = () => { track(\"k\") }; if (n == \"\") { guess shown := \"a\" }"), ["GUESS_OUTSIDE_HOLD@2"]);
        for more in ["try { await save(\"a\") } catch (e) { n := \"\" }", "refresh shown", "affects shown", "n := \"b\"", "other()", "track(\"k\")", "let g = () => { track(\"k\") }; g()"] {
            assert_eq!(run(&format!("guess shown := \"a\"; {more}")), Vec::<String>::new(), "{more}");
        }
        assert_eq!(run("try { await save(\"a\"); guess shown := \"a\" } catch (e) { n := \"\" }"), ["advice GUESS_AFTER_AWAIT@2"]);
        assert_eq!(run("guess shown := \"a\"; try { await save(\"a\"); guess shown := \"b\"; await save(\"b\") } catch (e) { n := \"\" }"), Vec::<String>::new());
    }

    /// 99, the advisory rows (2026-11-22): a waterfall is advised once for each question, on its own statement; an io
    /// fn awaited for its answer is a question, an io call awaited for nothing a point of order. `ref/units.ts` holds
    /// the same cases.
    #[test]
    fn a_waterfall_is_advised_once_for_each_question() {
        const API: &str = "export pure fn ask(k: string): Promise<string>\nexport fn load(k: string): Promise<string>\nexport fn save(k: string): Promise<void>\n";
        let advice = |body: &str| -> Vec<String> {
            let lines: Vec<String> = body.split("; ").map(|l| format!("      {l}")).collect();
            let src = format!("import {{ ask, load, save }} from \"./api.js\"\nexport default component App() {{\n  source n := \"\"\n  action go() {{\n    try {{\n{}\n    }} catch (e) {{ n := \"\" }}\n  }}\n  <button onClick={{() => {{ go() }}}}>{{n}}</button>\n}}\n", lines.join("\n"));
            let read = |p: &str| match p {
                "/app.rx" => Some(src.clone()),
                "/api.d.rx" => Some(API.to_string()),
                _ => None,
            };
            let set = load_modules("/app.rx", &read).unwrap_or_else(|e| panic!("{}\n{src}", e.0));
            let c = check_modules(&set, false);
            assert!(c.diags.is_empty(), "{:?}\n{src}", c.diags.iter().map(|d| &d.code).collect::<Vec<_>>());
            c.advice.iter().map(|a| format!("{}@{}{}", a.code, a.line - 5, if a.msg.contains("declared io") { " io" } else { "" })).collect()
        };
        assert_eq!(advice("let a = await ask(\"a\"); let b = await ask(\"b\"); n := a + b"), ["ASYNC_WATERFALL@2"]);
        assert_eq!(advice("let a = await ask(\"a\"); let b = await ask(\"b\"); let c = await ask(a); n := b + c"), ["ASYNC_WATERFALL@2"]);
        assert_eq!(advice("let a = await ask(\"a\"); let b = await ask(a); let c = await ask(\"c\"); n := b + c"), ["ASYNC_WATERFALL@3"]);
        assert_eq!(advice("let a = await load(\"a\"); let b = await load(\"b\"); n := a + b"), ["ASYNC_WATERFALL@2 io"]);
        assert_eq!(advice("let a = await ask(\"a\"); let b = await load(\"b\"); n := a + b"), ["ASYNC_WATERFALL@2 io"]);
        assert_eq!(advice("await save(\"a\"); await save(\"b\"); n := \"\""), Vec::<String>::new());
        assert_eq!(advice("let a = await ask(\"a\"); await save(a); let b = await ask(\"b\"); n := a + b"), Vec::<String>::new());
        assert_eq!(advice("let a = await load(\"a\"); let b = await load(a); n := b"), Vec::<String>::new());
    }

    /// MO-10k (closed 2026-11-22): each confined value has a closed set of operations; a method call outside it is
    /// refused, whatever the syntax around it — an inherited method, a record that mentions the value, a closure kept
    /// in a value. The safe forms beside each are accepted.
    #[test]
    fn each_confined_value_has_a_closed_set_of_operations() {
        const LIB2: &str = "export pure fn createStore<T>(init: T): [T, (update: (draft state: T) => T | void) => void]\nexport pure fn createClock(): any instantiates\nexport pure fn createLabel(width: any): any instantiates\nexport fn later(f: handler () => void): void\nexport fn stashJs(x: any): void\n";
        let run = |main: &str| -> Vec<String> {
            let main = format!("import {{ createStore, createClock, createLabel, later, stashJs }} from \"./lib.js\"\nsource held: any := null\nsource n := 0\ncomponent Cell() {{ <b>c</b> }}\ncomponent Grid(props: {{ t: any; onF: (x: any) => void }}) {{ <button onClick={{() => {{ held := props.t }}}}>ok</button> }}\n{main}");
            let read = |p: &str| match p {
                "/app.rx" => Some(main.clone()),
                "/lib.d.rx" => Some(LIB2.to_string()),
                _ => None,
            };
            let set = load_modules("/app.rx", &read).unwrap();
            check_modules(&set, false).diags.iter().map(|d| d.code.clone()).collect()
        };
        // MO-10i: what is called on a draft is a method of plain data, by name; a function it calls is a closure written there
        let store = "  [todos, setTodos] = createStore<{ items: { n: number }[] }>({ items: [] })\n";
        for body in ["d.items.forEach(keep)", "d.items.map(keep)", "d.items.sort(keep)", "d.items.each((x) => x)", "d.items.push.bind(d.items)", "d.valueOf.call(d)", "d.items[\"forEach\"](keep)", "d.items[m]((x) => x)", "d.items.forEach((row) => { later(() => { held := row }) })", "d.items.slice(0).forEach(keep)"] {
            let src = format!("export default component App() {{\n{store}  <button onClick={{() => {{ let keep = (x) => {{ held := x }}; let m = \"forEach\"; setTodos((d) => {{ {body} }}) }}}}>x</button>\n}}\n");
            assert!(run(&src).iter().any(|c| c == "DRAFT_ESCAPES"), "accepted:\n{src}");
        }
        let src = format!("export default component App() {{\n{store}  <button onClick={{() => {{ setTodos((d) => {{ d.items.forEach((row) => {{ held := row; row.n := 1 }}); held := d.items.values(); held := d.items.map((row) => row).filter((row) => row.n > 0); d.items.push({{ n: 1 }}); d.items.sort((a, b) => a.n - b.n); held := d.items.valueOf() }}) }}}}>x</button>\n}}\n");
        assert_eq!(run(&src), Vec::<String>::new(), "{src}");
        // E-10, E-5a: a closure kept in a value reads, when it is called, what its body reads
        for holder in ["box.read()", "fs[0]()", "mk()()", "again.read()", "({ read: () => n }).read()", "[() => n][0]()", "pick.any()", "boxes[0].read()"] {
            for (read, code) in [("createLabel(E)", "SNAPSHOT_ARGUMENT"), ("peek E", "SNAPSHOT_KEPT")] {
                let src = format!("export default component App() {{\n  box = {{ read: () => n }}\n  fs = [() => n]\n  mk = () => () => n\n  again = box\n  pick = true ? box : {{ any: () => 1 }}\n  boxes = [box]\n  label = {}\n  <p onClick={{() => {{ n := n + 1 }}}}>{{label}}</p>\n}}\n", read.replace('E', holder));
                assert!(run(&src).iter().any(|c| c == code), "accepted ({code}):\n{src}");
            }
        }
        // …and a slot the expression itself names is that slot: another field, a literal's own item
        let src = "export default component App() {\n  clock = createClock()\n  box = { read: () => n, unit: () => \"u\" }\n  a = createLabel(box.unit())\n  b = createLabel([clock, 5][1])\n  c = createLabel({ a: clock, b: 5 }.b)\n  d = peek [() => n, () => 1][1]()\n  <p onClick={() => { n := n + 1 }}>{a} {b} {c} {d} {box.read()}</p>\n}\n";
        assert_eq!(run(src), Vec::<String>::new(), "{src}");
    }
    #[test]
    fn a_declared_type_is_read_a_step_at_a_time() {
        let t = "{ label: string; count: () => number; rows: { id: string; cells: any[] }[]; state?: { page: number } | undefined; get: (k: string) => readonly (\"a\" | \"b\")[] }";
        let f = |k: &str| TStep::Field(k.to_string());
        assert_eq!(ty_step(t, &f("label")).as_deref(), Some("string"));
        assert!(ty_scalar(&ty_step(t, &f("label")).unwrap()));
        assert_eq!(ty_step(&ty_step(t, &f("count")).unwrap(), &TStep::Call).as_deref(), Some("number"));
        let row = ty_step(&ty_step(t, &f("rows")).unwrap(), &TStep::Elem).unwrap();
        assert_eq!(ty_step(&row, &f("id")).as_deref(), Some("string"));
        assert!(!ty_scalar(&ty_step(&row, &f("cells")).unwrap()));
        assert_eq!(ty_step(&ty_step(t, &f("state")).unwrap(), &f("page")).as_deref(), Some("number"));
        let got = ty_step(&ty_step(&ty_step(t, &f("get")).unwrap(), &TStep::Call).unwrap(), &TStep::Elem).unwrap();
        assert!(ty_scalar(&got), "{got}");
        assert_eq!(ty_step(t, &f("valueOf")), None);
        for no in ["any", "Row", "string | Row", "{ a: string }", "() => string", "string[]"] {
            assert!(!ty_scalar(no), "{no}");
        }
        for yes in ["string", "number | undefined", "\"a\" | \"b\"", "boolean | null", "(string)", "1 | 2"] {
            assert!(ty_scalar(yes), "{yes}");
        }
    }
    /// E-10, E-5a: a method the declaration does not name, or a field, read through anything made of an instance is a read
    /// of what may change.
    #[test]
    fn a_read_through_what_may_be_an_instance_changes() {
        for e in wrapped("clock") {
            for (read, code) in [("createLabel(E.now())", "SNAPSHOT_ARGUMENT"), ("createLabel(E.size)", "SNAPSHOT_ARGUMENT"), ("peek E.now()", "SNAPSHOT_KEPT")] {
                let src = format!("export default component App() {{\n  clock = createClock()\n{LOCALS}  label = {}\n  <p>{{label}}</p>\n}}\n", read.replace('E', &e));
                assert!(codes_of(&src).iter().any(|c| c == code), "accepted ({code}):\n{src}");
            }
        }
        // and the instance itself stays one: named, passed whole, its declared method called
        let src = format!("export default component App() {{\n  clock = createClock()\n  c = clock\n{LOCALS}  a = createLabel(peek clock.format())\n  b = createLabel(peek c.format())\n  d = createLabel(clock)\n  <p>{{a}} {{b}} {{d}}</p>\n}}\n");
        assert_eq!(codes_of(&src), Vec::<String>::new(), "{src}");
    }
    /// MO-10i: a draft is named only in its own callback, and there every read of it is accepted (it is a copy).
    #[test]
    fn a_draft_is_named_only_in_its_callback() {
        let store = "  [todos, setTodos] = createStore<{ done: number }>({ done: 0 })\n";
        for e in wrapped("d") {
            let src = format!("export default component App() {{\n{store}{LOCALS}  <button onClick={{() => {{ setTodos((d) => {{ later(() => {{ held := {e} }}) }}) }}}}>x</button>\n}}\n");
            assert!(codes_of(&src).iter().any(|c| c == "DRAFT_ESCAPES"), "accepted:\n{src}");
            let closure = e.contains("(() =>");
            let src = format!("export default component App() {{\n{store}{LOCALS}  <button onClick={{() => {{ setTodos((d) => {{ held := {e}; let v = {e}; later(() => {{ held := v }}) }}) }}}}>x</button>\n}}\n");
            assert_eq!(codes_of(&src).iter().any(|c| c == "DRAFT_ESCAPES"), closure, "{src}");
        }
    }

    /// 04 R-8 (ruled 2026-11-13): an `errored` region covers a handler's read of a failing value only when its content
    /// reads the value; `pending? x` takes no failure (the desk9 reference's fuzz seed 11).
    #[test]
    fn errored_region_covers_only_a_value_read() {
        let src = r#"export default component App() {
  source id := 1
  labels = await fetch("labels:" + id)
  errored fallback(e) { <p>failed</p> } {
    loading fallback { <p>loading</p> } {
      <button disabled={pending? labels} onClick={() => { log(labels.length) }}>probe</button>
    }
  }
  errored fallback(e) { <p>failed</p> } {
    loading fallback { <p>loading</p> } {
      <p>{labels.length}</p>
      <button disabled={pending? labels} onClick={() => { log(labels.length) }}>read</button>
    }
  }
  loading fallback { <p>loading</p> } {
    <button disabled={labels.length > 9} onClick={() => { log(labels.length) }}>disabled</button>
  }
}
"#;
        let got: Vec<i64> = codes(src, false).iter().filter(|(_, c)| c == "UNGUARDED_SNAPSHOT").map(|(l, _)| *l).collect();
        // `probe`: its region reads only `pending? labels`, so a failure leaves it live; `read` sits beside a value
        // read; `disabled` reads the value, so a failure disables it
        assert_eq!(got, vec![6], "{:?}", codes(src, false));
    }

    /// 06 AC-3a: a guess a click can make while its value loads a new question, unless the element is covered.
    #[test]
    fn guess_while_loading() {
        let src = r#"export default component App() {
  source sel := 1
  source filter := "open"
  source detail = await fetch("issue:" + sel)
  source rows = await fetch("rows:" + filter)
  source note := ""
  action rename(t: string) {
    try {
      guess detail := d => d == null ? d : { ...d, title: t }
      guess rows := rs => rs
      await fetch("rename:" + sel + "," + t)
      refresh detail
    } catch (e) {
      note := e.message
    }
  }
  errored fallback(e) { <p>failed</p> } {
    loading on(sel) fallback { <p>loading</p> } {
      <h2>{detail.title}</h2>
      <button onClick={() => { rename("in") }}>in</button>
    }
    loading on(filter) fallback { <p>loading</p> } {
      <p>{rows.length}</p>
    }
  }
  <button onClick={() => { sel := sel + 1 }}>next</button>
  <button onClick={() => { rename("out") }}>out</button>
  <button disabled={pending? detail} onClick={() => { rename("off") }}>off</button>
  <form onSubmit={() => { rename("form") }}>
    <button disabled={pending? detail}>go</button>
  </form>
  <form onSubmit={() => { rename("form2") }}>
    <button>go</button>
  </form>
}
"#;
        let got: Vec<i64> = codes(src, false).iter().filter(|(_, c)| c == "GUESS_WHILE_LOADING").map(|(l, _)| *l).collect();
        // `out` and the second form: `detail` asks about `sel`, which `rename` reads; `rows` asks about `filter`,
        // which the click never reads; `in` sits in detail's region, `off` and the first form are disabled on it
        assert_eq!(got, vec![27, 32], "{:?}", codes(src, false));
    }

    /// 08 CN-3d: in a client-only build, a reader the first load surely waits on needs a `loading` above it.
    #[test]
    fn first_load_unheld_in_client_only_builds() {
        let src = r#"import pure { get } from "./api"
source q: string := ""
users = await get(1)
found = q == "" ? null : await get(2)
shown = await get(3) -> []
component Panel() {
  <p>{users}</p>
}
export default component App() {
  errored fallback(e) { <p>failed</p> } {
    <p>{users}</p>
    <p>{pending? users}</p>
    <p>{found}</p>
    <p>{shown}</p>
    <Panel />
    loading fallback { <p>…</p> } {
      <p>{users}</p>
      <Panel />
    }
  }
}
"#;
        assert_eq!(codes(src, false), vec![]);
        let spa = codes(src, true);
        let mut lines: Vec<i64> = spa.iter().filter(|(_, c)| c == "ASYNC_OUTSIDE_LOADING_BOUNDARY").map(|(l, _)| *l).collect();
        lines.sort();
        assert_eq!(lines, vec![7, 11, 12], "{spa:?}");
        assert_eq!(spa.len(), 3, "{spa:?}");
    }

    #[test]
    fn outside_read_holds_a_loading_on() {
        let src = r#"import pure { get } from "./api"
export default component App() {
  source filter := "open"
  source sel := 1
  issues = await get(filter)
  detail = await get(sel)
  count = issues.length
  effect (filter == "open" ? count : -1) {
    log($0)
  }
  errored fallback(e) { <p>failed</p> } {
    <p>{latest issues}</p>
    <p>{pending? issues}</p>
    loading on(filter) fallback { <p>loading</p> } {
      <p>{count}</p>
    }
    loading on(sel) fallback { <p>…</p> } {
      <h2>{detail}</h2>
      loading on(sel) fallback { <p>…</p> } {
        <p>{detail}</p>
      }
    }
    loading fallback { <p>…</p> } {
      <p>{detail}</p>
    }
  }
}
"#;
        let mut got: Vec<i64> = codes(src, false).iter().filter(|(_, c)| c == "LOADING_ON_OUTSIDE_HOLD").map(|(l, _)| *l).collect();
        got.sort();
        // the effect (line 8) and the detail read under a plain `loading` (line 24); not `latest`/`pending?`, not the
        // outer `on(sel)` region's own read of `detail` beside the inner one
        assert_eq!(got, vec![8, 24]);
    }

    /// 06 AC-1f: a call of a declared action passes one argument per parameter; 03 RG-4b: `component C()` has no
    /// `props` (the eval board's check-accepts-arity-and-missing-props.rx).
    #[test]
    fn argument_count_and_missing_props() {
        let src = r#"component Lane() { <h3>{props.col}</h3> }
component Card(props: { col: string }) { <p>{props.col}</p> }
export default component App() {
  source n := 0
  action go() { n := 1 }
  action by(k: number, m: number) { n := k + m }
  <div>
    <Lane col="todo" />
    <Card col="done" />
    <button onClick={() => { go(1, 2) }}>a</button>
    <button onClick={() => { go() }}>b</button>
    <button onClick={() => { by(1) }}>c</button>
    <button onClick={() => { by(1, 2) }}>d</button>
  </div>
}
"#;
        let got: Vec<(i64, String)> = codes(src, false).into_iter().filter(|(_, c)| c == "ARGUMENT_COUNT" || c == "UNBOUND").collect();
        assert_eq!(got, vec![(1, "UNBOUND".to_string()), (10, "ARGUMENT_COUNT".to_string()), (12, "ARGUMENT_COUNT".to_string())], "{:?}", codes(src, false));
    }
}

/// MO-10f: the field path of a read from a bound name — `q.a`, `q["a"]`, `q[0]` name a field; `q[k]` is any field (None).
pub(crate) fn field_path(e: &Expr) -> Option<(&str, Vec<Option<String>>)> {
    let mut path: Vec<Option<String>> = vec![];
    let mut x = e;
    loop {
        match &x.k {
            ExprKind::Member { o, p, .. } => {
                path.insert(0, Some(p.clone()));
                x = o;
            }
            ExprKind::Index { o, i, .. } => {
                path.insert(0, lit_key(i));
                x = o;
            }
            _ => break,
        }
    }
    if path.is_empty() {
        return None;
    }
    let ExprKind::Id(on) = &x.k else { return None };
    Some((on.as_str(), path))
}
/// a key an index names for certain: a string, or a whole number
pub(crate) fn lit_key(i: &Expr) -> Option<String> {
    match &i.k {
        ExprKind::Lit(Lit::Str(v)) => Some(v.clone()),
        ExprKind::Lit(Lit::Num(v)) if *v >= 0.0 && v.fract() == 0.0 => Some((*v as usize).to_string()),
        ExprKind::Tpl(parts) if parts.len() == 1 => match &parts[0] {
            crate::ast::TplPart::Str(v) => Some(v.clone()),
            _ => None,
        },
        _ => None,
    }
}
/// the declared rows of every held field a path can name: a dynamic segment matches any field there
fn held_match(held: &[(String, bool, Vec<String>)], path: &[Option<String>]) -> Option<(String, bool, Vec<String>)> {
    if path.iter().all(|s| s.is_some()) {
        let p = path.iter().map(|s| s.as_deref().unwrap()).collect::<Vec<_>>().join(".");
        return held.iter().find(|h| h.0 == p).cloned();
    }
    let mut out: Option<(String, bool, Vec<String>)> = None;
    for h in held {
        let segs: Vec<&str> = h.0.split('.').collect();
        if segs.len() != path.len() || !segs.iter().zip(path).all(|(a, b)| b.as_deref().is_none_or(|b| b == *a)) {
            continue;
        }
        let o = out.get_or_insert_with(|| (h.0.clone(), false, vec![]));
        o.1 |= h.1;
        for c in &h.2 {
            if !o.2.contains(c) {
                o.2.push(c.clone());
            }
        }
    }
    out
}

// ---- MO-10k: a declared result's type, read as the closed set of what its value answers ----
/// One step down a declared type: a field, what a call of it answers, an element of it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum TStep {
    Field(String),
    Call,
    Elem,
}
/// The type text without what does not change what it answers: outer parentheses, `readonly`, the function words.
fn ty_clean(t: &str) -> &str {
    let mut t = js_trim(t);
    loop {
        let before = t;
        for w in ["readonly ", "handler "] {
            if let Some(r) = t.strip_prefix(w) {
                t = js_trim(r);
            }
        }
        if t.starts_with('(') && t.ends_with(')') && split_top(t, "\u{0}").len() == 1 && closes_at(t, 0) == Some(t.len() - 1) {
            t = js_trim(&t[1..t.len() - 1]);
        }
        if t == before {
            return t;
        }
    }
}
/// The index of the bracket that closes the one at `at`.
fn closes_at(t: &str, at: usize) -> Option<usize> {
    let b = t.as_bytes();
    let mut depth = 0i64;
    for i in at..b.len() {
        let ch = b[i] as char;
        if "([{<".contains(ch) {
            depth += 1;
        } else if ")]}>".contains(ch) && !(ch == '>' && i > 0 && b[i - 1] == b'=') {
            depth -= 1;
            if depth == 0 {
                return Some(i);
            }
        }
    }
    None
}
/// A union's members; `null` and `undefined` dropped when `present` (a read through `?.`, or of a field that is there).
fn ty_members(t: &str, present: bool) -> Vec<String> {
    split_top(ty_clean(t), "|").into_iter().map(|m| ty_clean(&m).to_string()).filter(|m| !(present && (m == "null" || m == "undefined"))).collect()
}
/// A record type's fields, as written: `{ a: T; b?: (x: U) => V }`.
pub fn ty_fields(t: &str) -> Option<Vec<(String, String)>> {
    let ms = ty_members(t, true);
    let [t] = ms.as_slice() else { return None };
    if !(t.starts_with('{') && t.ends_with('}') && t.len() >= 2) {
        return None;
    }
    Some(
        split_top(&t[1..t.len() - 1], ",;")
            .iter()
            .filter_map(|f| {
                let i = f.find(':')?;
                let k = js_trim(&f[..i]);
                let k = k.strip_prefix("readonly ").map(js_trim).unwrap_or(k);
                let k = k.strip_suffix('?').unwrap_or(k).trim_matches(|c| c == '"' || c == '\'');
                Some((k.to_string(), js_trim(&f[i + 1..]).to_string()))
            })
            .collect(),
    )
}
/// The declared type one step down, where the text says it: a field of a record type, the result of a function type,
/// the element of an array type. `None`: the declaration does not say (`any`, a named type, a union of several).
pub fn ty_step(t: &str, s: &TStep) -> Option<String> {
    let ms = ty_members(t, true);
    let [t] = ms.as_slice() else { return None };
    match s {
        TStep::Field(k) => ty_fields(t)?.into_iter().find(|f| &f.0 == k).map(|f| f.1),
        TStep::Call => {
            if !t.starts_with('(') {
                return None;
            }
            let end = closes_at(t, 0)?;
            let rest = js_trim(&t[end + 1..]);
            rest.strip_prefix("=>").map(|r| js_trim(r).to_string())
        }
        TStep::Elem => {
            if let Some(r) = t.strip_suffix("[]") {
                return Some(js_trim(r).to_string());
            }
            for w in ["Array<", "ReadonlyArray<"] {
                if let Some(r) = t.strip_prefix(w) {
                    return r.strip_suffix('>').map(|x| js_trim(x).to_string());
                }
            }
            None
        }
    }
}
/// Whether a declared type is a primitive's — `string`, `number`, `boolean`, `bigint`, `null`, `undefined`, `void`, a
/// literal, or a union of those: a value of it holds nothing.
pub fn ty_scalar(t: &str) -> bool {
    let ms = ty_members(t, false);
    !ms.is_empty()
        && ms.iter().all(|m| {
            matches!(m.as_str(), "string" | "number" | "boolean" | "bigint" | "null" | "undefined" | "void" | "never" | "true" | "false")
                || (!m.is_empty() && m.trim_start_matches('-').chars().all(|c| c.is_ascii_digit() || c == '.') && m.chars().any(|c| c.is_ascii_digit()))
                || (m.len() >= 2 && ((m.starts_with('"') && m.ends_with('"')) || (m.starts_with('\'') && m.ends_with('\''))) && !m[1..m.len() - 1].contains(['"', '\'']))
        })
}
/// Whether a declared result is a function that takes nothing and answers nothing, `() => void`: what undoes a call.
pub fn ty_disposer(t: &str) -> bool {
    let t = ty_clean(t);
    t.starts_with("()") && ty_step(t, &TStep::Call).is_some_and(|r| ty_clean(&r) == "void")
}
/// The names under which a record result holds what ends it (`{ unsubscribe: () => void }`): an observable's
/// subscription, a disposable, an observer, a timer.
pub const ENDINGS: [&str; 7] = ["unsubscribe", "dispose", "destroy", "disconnect", "stop", "cancel", "close"];
/// EF-5a: what a declared result says of undoing the call, as the type to quote: `() => void` — written out, behind
/// a type alias its declaration file declares (`alias`: `export type Unsub = () => void`), or TypeScript's own
/// `VoidFunction` — or a record with such a function under a name of an ending (`{ unsubscribe: () => void }`).
pub fn ty_undoes(t: &str, alias: &dyn Fn(&str) -> Option<String>) -> Option<String> {
    fn named(t: &str, alias: &dyn Fn(&str) -> Option<String>) -> String {
        let mut t = ty_clean(t).to_string();
        for _ in 0..8 {
            if t.is_empty() || !t.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '$') {
                break;
            }
            match if t == "VoidFunction" { Some("() => void".to_string()) } else { alias(&t) } {
                Some(x) => t = ty_clean(&x).to_string(),
                None => break,
            }
        }
        t
    }
    let t = named(t, alias);
    if ty_disposer(&t) {
        return Some("() => void".into());
    }
    ty_fields(&t)?.into_iter().find(|(k, v)| ENDINGS.contains(&k.as_str()) && ty_disposer(&named(v, alias))).map(|(k, _)| format!("{{ {k}: () => void }}"))
}
/// What a declared alias stands for, from its text (`type Unsub = () => void`, `interface Sub { unsubscribe(): void }`
/// is not read: a method signature is not a field's type); `None` for one that takes type parameters.
pub fn alias_text(text: &str) -> Option<String> {
    let t = js_trim(text);
    let r = t.strip_prefix("type")?;
    let i = r.find('=')?;
    let head = js_trim(&r[..i]);
    if head.is_empty() || !head.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '$') {
        return None;
    }
    Some(js_trim(&r[i + 1..]).to_string())
}
/// EF-5a: the paths through the rest of a block a disposer was bound in. `left`: a `return` reached without `name`
/// having been named; `named`: it has been named on every path that reaches the end; `ends`: the end is reachable. A
/// statement names it when one of its own expressions does (a closure that calls it later keeps it); another name
/// for it (`let t = stop`) names it when that name is kept the same way; a failure's path is not one the block chose.
struct DisposerPaths {
    left: bool,
    named: bool,
    ends: bool,
}
fn disposer_paths(ss: &[Stmt], name: &str, mut named: bool) -> DisposerPaths {
    let m = |e: &Expr| {
        let mut o = IndexSet::new();
        free_names(e, &HashSet::new(), &mut o);
        o.contains(name)
    };
    let mut left = false;
    for (i, s) in ss.iter().enumerate() {
        match &s.k {
            StmtKind::Let { name: t, e, .. } => {
                if matches!(&e.k, ExprKind::Id(n) if n == name) {
                    let r = disposer_paths(&ss[i + 1..], t, false);
                    if !r.left && (r.named || !r.ends) {
                        named = true;
                    }
                } else if m(e) {
                    named = true;
                }
            }
            StmtKind::Write { target, e } | StmtKind::Optimistic { target, e } => {
                if m(e) || target.path.iter().any(|p| matches!(p, PathSeg::Expr(x) if m(x))) {
                    named = true;
                }
            }
            StmtKind::Expr(e) => {
                if m(e) {
                    named = true;
                }
            }
            StmtKind::Throw(_) => return DisposerPaths { left, named: true, ends: false },
            StmtKind::Return(e) => {
                if e.as_ref().is_some_and(&m) {
                    named = true;
                }
                return DisposerPaths { left: left || !named, named, ends: false };
            }
            StmtKind::Refresh(_) | StmtKind::Affects(_) => {}
            StmtKind::Action(body) => {
                let r = disposer_paths(body, name, named);
                left |= r.left;
                if !r.ends {
                    return DisposerPaths { left, named: true, ends: false };
                }
                named = r.named;
            }
            StmtKind::Sif { c, t, f } => {
                if m(c) {
                    named = true;
                }
                let (a, b) = (disposer_paths(t, name, named), disposer_paths(f, name, named));
                left |= a.left || b.left;
                named = match (a.ends, b.ends) {
                    (false, false) => return DisposerPaths { left, named: true, ends: false },
                    (true, false) => a.named,
                    (false, true) => b.named,
                    _ => a.named && b.named,
                };
            }
            StmtKind::For { e, body, .. } => {
                if m(e) {
                    named = true;
                }
                left |= disposer_paths(body, name, named).left; // the body may not run
            }
            StmtKind::Try { body, handler, fin, .. } => {
                // a `finally` runs on every path; a failure may come before anything in the body
                let fin_names = fin.as_ref().is_some_and(|f| {
                    let mut o = IndexSet::new();
                    free_names_stmts(f, &HashSet::new(), &mut o);
                    o.contains(name)
                });
                let start = named || fin_names;
                let a = disposer_paths(body, name, start);
                left |= a.left;
                let (ends, n) = match handler.as_ref().map(|h| disposer_paths(h, name, start)) {
                    Some(b) => {
                        left |= b.left;
                        match (a.ends, b.ends) {
                            (false, false) => (false, true),
                            (true, false) => (true, a.named),
                            (false, true) => (true, b.named),
                            _ => (true, a.named && b.named),
                        }
                    }
                    None => (a.ends, a.named),
                };
                if !ends {
                    return DisposerPaths { left, named: true, ends: false };
                }
                named = n || fin_names;
            }
        }
    }
    DisposerPaths { left, named, ends: true }
}
/// Whether a declared type is a function's.
pub fn ty_fn(t: &str) -> bool {
    ty_step(t, &TStep::Call).is_some()
}
