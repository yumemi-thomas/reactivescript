//! The abstract syntax (spec/02-core.md §1), as `ref/src/ast.ts` has it. Operators are spelled as in JS; types are TS's,
//! kept as text (07 §2). `to_json` writes a node the way `JSON.stringify` writes the reference's, so the two parsers are
//! diffed node for node (`ref/crate.ts`).

use serde_json::{json, Map, Value};
use std::collections::{HashMap, HashSet};

#[derive(Debug, Clone, PartialEq)]
pub enum Lit {
    Undefined,
    Null,
    Bool(bool),
    Num(f64),
    Str(String),
}

#[derive(Debug, Clone)]
pub enum TplPart {
    Str(String),
    Expr(Expr),
}

#[derive(Debug, Clone)]
pub enum Field {
    Kv { key: String, v: Expr },
    Spread(Expr),
}

/// A byte range of the `.rx` source (`start..end`). `Span::NONE` (0..0) marks a node the compiler made, not the parser.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct Span {
    pub start: u32,
    pub end: u32,
}
impl Span {
    pub const NONE: Span = Span { start: 0, end: 0 };
    pub fn new(start: usize, end: usize) -> Self {
        Span { start: start as u32, end: end as u32 }
    }
    pub fn is_none(&self) -> bool {
        self.start == 0 && self.end == 0
    }
    /// The 1-based line `start` is on.
    pub fn line(&self, src: &str) -> usize {
        src.as_bytes()[..(self.start as usize).min(src.len())].iter().filter(|b| **b == b'\n').count() + 1
    }
    pub fn text<'a>(&self, src: &'a str) -> &'a str {
        src.get(self.start as usize..self.end as usize).unwrap_or("")
    }
}

/// An expression and where it was written.
#[derive(Debug, Clone)]
pub struct Expr {
    pub k: ExprKind,
    pub span: Span,
}
impl Expr {
    pub fn new(k: ExprKind, span: Span) -> Self {
        Expr { k, span }
    }
    /// An expression the compiler made: no source.
    pub fn made(k: ExprKind) -> Self {
        Expr { k, span: Span::NONE }
    }
}

#[derive(Debug, Clone)]
pub enum ExprKind {
    Lit(Lit),
    Id(String),
    Bin { op: String, l: Box<Expr>, r: Box<Expr> },
    Un { op: String, e: Box<Expr> },
    Pre { name: String, init: Option<Box<Expr>> },
    Peek(Box<Expr>),
    /// R-1, R-7; `stream`: `await*` (ST-6b)
    Await { e: Box<Expr>, init: Option<Box<Expr>>, stream: bool },
    Latest(Box<Expr>),
    Pending(Box<Expr>),
    If { c: Box<Expr>, t: Box<Expr>, f: Box<Expr> },
    Tpl(Vec<TplPart>),
    Member { o: Box<Expr>, p: String, opt: bool },
    Index { o: Box<Expr>, i: Box<Expr>, opt: bool },
    /// targs: TypeScript type arguments written at the call (`makeStore<Todos>(…)`, 07 §3), types only
    Call { f: Box<Expr>, args: Vec<Expr>, targs: Option<String> },
    Arr(Vec<Expr>),
    Rec(Vec<Field>),
    /// `stmts`: a statement-bodied arrow (imperative scope, 07 §5)
    /// ptypes: a parameter's TypeScript type (07 §3), types only
    Fn { params: Vec<String>, body: Box<Expr>, stmts: Option<Vec<Stmt>>, ptypes: Vec<Option<String>> },
    /// ST-3
    Draft { seed: Box<Expr>, body: Vec<Stmt> },
    /// RG-7b
    Use(String),
    Spread(Box<Expr>),
    /// RG-4b: an object rest, `{ a, ...rest } = e` (the parser's own; Solid's `omit`)
    Omit { e: Box<Expr>, keys: Vec<String> },
    /// R-f-3
    Throw(Box<Expr>),
    /// R-f-4: `e catch (x: A | B) => alt`; classes absent: every failure
    Catch { e: Box<Expr>, name: Option<String>, classes: Option<Vec<String>>, alt: Box<Expr> },
    /// 07 CSS-5
    StyleMap { css: String, line: usize },
    /// 12 SF-1d
    ServerFn { params: Vec<String>, ptypes: Vec<Option<String>>, ret: Option<String>, body: Vec<Stmt> },
}

#[derive(Debug, Clone)]
pub enum PathSeg {
    Name(String),
    Expr(Expr),
}

#[derive(Debug, Clone)]
pub struct Target {
    pub name: String,
    pub path: Vec<PathSeg>,
    /// `use name := …` (RG-7, O-4). `None`: not written by this form (a `guess` target).
    pub ctx: Option<bool>,
}
impl Target {
    pub fn is_ctx(&self) -> bool {
        self.ctx == Some(true)
    }
}

/// A statement and where it was written.
#[derive(Debug, Clone)]
pub struct Stmt {
    pub k: StmtKind,
    pub span: Span,
    /// The line the statement starts on: what a diagnostic about one statement of a long body is placed on.
    pub line: u32,
}

#[derive(Debug, Clone)]
pub enum StmtKind {
    Write { target: Target, e: Expr },
    Let { name: String, e: Expr, ty: Option<String> },
    Expr(Expr),
    Optimistic { target: Target, e: Expr },
    Refresh(String),
    Affects(String),
    Action(Vec<Stmt>),
    Sif { c: Expr, t: Vec<Stmt>, f: Vec<Stmt> },
    /// 07 §5: `for (const x of e) { … }`, a loop of imperative scope
    For { name: String, e: Expr, body: Vec<Stmt> },
    Return(Option<Expr>),
    Try { body: Vec<Stmt>, catch_name: Option<String>, catch_classes: Option<Vec<String>>, handler: Option<Vec<Stmt>>, fin: Option<Vec<Stmt>> },
    Throw(Expr),
}
impl Stmt {
    pub fn kind(&self) -> &'static str {
        self.k.kind()
    }
}
impl StmtKind {
    pub fn kind(&self) -> &'static str {
        match self {
            StmtKind::Write { .. } => "write",
            StmtKind::Let { .. } => "let",
            StmtKind::Expr(_) => "expr",
            StmtKind::Optimistic { .. } => "optimistic",
            StmtKind::Refresh(_) => "refresh",
            StmtKind::Affects(_) => "affects",
            StmtKind::Action(_) => "action",
            StmtKind::Sif { .. } => "sif",
            StmtKind::For { .. } => "for",
            StmtKind::Return(_) => "return",
            StmtKind::Try { .. } => "try",
            StmtKind::Throw(_) => "throw",
        }
    }
}

#[derive(Debug, Clone)]
pub struct Param {
    pub name: String,
    pub r#ref: bool,
    pub ty: Option<String>,
    /// `b?: T`, a trailing value parameter a call may leave out (E-9a)
    pub opt: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Side {
    Server,
    Client,
}
impl Side {
    pub fn as_str(self) -> &'static str {
        match self {
            Side::Server => "server",
            Side::Client => "client",
        }
    }
}

#[derive(Debug, Clone)]
pub struct ImportName {
    pub name: String,
    pub alias: String,
}

#[derive(Debug, Clone)]
pub enum Decl {
    Source { name: String, init: Expr, line: usize, span: Span, question: bool, ty: Option<String>, exported: bool, key: Option<String> },
    Eq { name: String, e: Expr, line: usize, span: Span, deferred: bool, key: Option<String>, ty: Option<String>, exported: bool },
    Import {
        /// MO-6d: `import * as Select from "m"` — the namespace's name; `names` are then the members the module names,
        /// `Select.Item`, each bound as `Select$Item`
        ns: Option<String>,
        names: Vec<ImportName>,
        from: String,
        pure: bool,
        side: Option<Side>,
        line: usize,
        span: Span,
        fails: Option<Vec<String>>,
        /// an `.rx` import's module key (MO-1, set by the loader)
        resolved: Option<String>,
        /// the scenario prelude's own module (`names.rs`)
        prelude: bool,
        /// a JS import's declaration file (MO-8)
        declared: Option<String>,
        declared_errors: Option<Vec<String>>,
        /// SV-5a: the declared error classes' sent fields, by class (only those that list some)
        declared_error_fields: Option<Vec<(String, Vec<String>)>>,
        declared_pure: Option<Vec<String>>,
        declared_side: Option<Vec<(String, Side)>>,
        /// MO-6e: `export { … } from "m.rx"`, a re-export: its names are imports of the module too
        reexport: bool,
    },
    Error { name: String, params: Vec<String>, ptypes: Vec<Option<String>>, msg: Option<Expr>, line: usize, span: Span, exported: bool },
    TypeDecl { name: String, line: usize, span: Span, text: String, exported: bool },
    Effect { inputs: Vec<Expr>, body: Vec<Stmt>, line: usize, span: Span },
    /// `tparams`: `<T>`, as text (07 §2); `named`: it declares only names for values (E-9b, set by the loader)
    Fn { name: String, params: Vec<Param>, decls: Vec<Decl>, tail: Expr, line: usize, span: Span, ret: Option<String>, exported: bool, tparams: Option<String>, named: bool },
    /// `tparams`: `<T>`, as text (07 §2)
    Component { name: String, props: String, decls: Vec<Decl>, view: Vec<Markup>, line: usize, span: Span, props_type: Option<String>, no_props: bool, exported: bool, is_default: bool, tparams: Option<String> },
    Action { name: String, params: Vec<String>, ptypes: Vec<Option<String>>, /** AC-1f: how many of them a call must pass, where the last ones may be left out (`by?`) */ required: Option<usize>, body: Vec<Stmt>, line: usize, span: Span, exported: bool },
    Server { name: String, params: Vec<String>, ptypes: Vec<Option<String>>, ret: Option<String>, body: Vec<Stmt>, line: usize, span: Span, exported: bool },
    Provide { name: String, e: Expr, line: usize, span: Span },
    Context { name: String, ty: Option<String>, source: bool, dflt: Option<Expr>, line: usize, span: Span, exported: bool },
}
impl Decl {
    pub fn line(&self) -> usize {
        match self {
            Decl::Source { line, .. }
            | Decl::Eq { line, .. }
            | Decl::Import { line, .. }
            | Decl::Error { line, .. }
            | Decl::TypeDecl { line, .. }
            | Decl::Effect { line, .. }
            | Decl::Fn { line, .. }
            | Decl::Component { line, .. }
            | Decl::Action { line, .. }
            | Decl::Server { line, .. }
            | Decl::Provide { line, .. }
            | Decl::Context { line, .. } => *line,
        }
    }
    /// Where the declaration was written, from its first keyword (`export` included) to its end.
    pub fn span(&self) -> Span {
        match self {
            Decl::Source { span, .. }
            | Decl::Eq { span, .. }
            | Decl::Import { span, .. }
            | Decl::Error { span, .. }
            | Decl::TypeDecl { span, .. }
            | Decl::Effect { span, .. }
            | Decl::Fn { span, .. }
            | Decl::Component { span, .. }
            | Decl::Action { span, .. }
            | Decl::Server { span, .. }
            | Decl::Provide { span, .. }
            | Decl::Context { span, .. } => *span,
        }
    }
    pub fn set_span(&mut self, to: Span) {
        match self {
            Decl::Source { span, .. }
            | Decl::Eq { span, .. }
            | Decl::Import { span, .. }
            | Decl::Error { span, .. }
            | Decl::TypeDecl { span, .. }
            | Decl::Effect { span, .. }
            | Decl::Fn { span, .. }
            | Decl::Component { span, .. }
            | Decl::Action { span, .. }
            | Decl::Server { span, .. }
            | Decl::Provide { span, .. }
            | Decl::Context { span, .. } => *span = to,
        }
    }
    /// The name a declaration binds (`"name" in d`): every kind but `import` and `effect`.
    pub fn name(&self) -> Option<&str> {
        match self {
            Decl::Source { name, .. }
            | Decl::Eq { name, .. }
            | Decl::Error { name, .. }
            | Decl::TypeDecl { name, .. }
            | Decl::Fn { name, .. }
            | Decl::Component { name, .. }
            | Decl::Action { name, .. }
            | Decl::Server { name, .. }
            | Decl::Provide { name, .. }
            | Decl::Context { name, .. } => Some(name),
            Decl::Import { .. } | Decl::Effect { .. } => None,
        }
    }
    pub fn exported(&self) -> bool {
        match self {
            Decl::Source { exported, .. }
            | Decl::Eq { exported, .. }
            | Decl::Error { exported, .. }
            | Decl::TypeDecl { exported, .. }
            | Decl::Fn { exported, .. }
            | Decl::Component { exported, .. }
            | Decl::Action { exported, .. }
            | Decl::Server { exported, .. }
            | Decl::Context { exported, .. } => *exported,
            _ => false,
        }
    }
    pub fn set_exported(&mut self) {
        match self {
            Decl::Source { exported, .. }
            | Decl::Eq { exported, .. }
            | Decl::Error { exported, .. }
            | Decl::TypeDecl { exported, .. }
            | Decl::Fn { exported, .. }
            | Decl::Component { exported, .. }
            | Decl::Action { exported, .. }
            | Decl::Server { exported, .. }
            | Decl::Context { exported, .. } => *exported = true,
            _ => {}
        }
    }
}

#[derive(Debug, Clone)]
pub struct Attr {
    pub name: String,
    pub e: Expr,
    /// the attribute's name
    pub span: Span,
}

#[derive(Debug, Clone)]
pub enum MarkupKind {
    El { tag: String, attrs: Vec<Attr>, children: Vec<Markup> },
    Read(Expr),
    Text(String),
    /// 07 §6b CSS-1
    Style(String),
    Mif { c: Expr, t: Vec<Markup>, t_decls: Vec<Decl>, f: Vec<Markup>, f_decls: Vec<Decl> },
    Mfor { name: String, xs: Expr, decls: Vec<Decl>, body: Vec<Markup> },
    /// MO-11k: `view (a, b) { … }`, a JS component's render prop
    Mview { prop: Option<String>, params: Vec<String>, decls: Vec<Decl>, body: Vec<Markup> },
    /// H-5/H-6
    Loading { on: Option<Expr>, fallback: Vec<Markup>, decls: Vec<Decl>, body: Vec<Markup> },
    /// H-12, R-f-4
    Errored { fallback: Vec<Markup>, decls: Vec<Decl>, body: Vec<Markup>, err_name: Option<String>, classes: Option<Vec<String>> },
    /// RG-8
    Portal { to: Option<Expr>, decls: Vec<Decl>, body: Vec<Markup> },
}

#[derive(Debug, Clone)]
pub struct Markup {
    pub kind: MarkupKind,
    pub line: Option<usize>,
    pub span: Span,
}

#[derive(Debug, Clone)]
pub struct Program {
    pub decls: Vec<Decl>,
    pub view: Vec<Markup>,
    /// markup written at the top level (refused, TOP_LEVEL_MARKUP); `None` when the view is the default component's (MO-1c)
    pub legacy_view: Option<bool>,
}

// ---------------------------------------------------------------- every expression of a program, with its scope, to change in place

/// Calls `f` on every expression of the program, each before the expressions inside it (as `f` left it), with the names
/// bound around it: a block's declarations (for the whole block), parameters, props, a loop's variable, a caught error,
/// a draft's `d`, a statement list's `let`s. An import binds nothing here: `bound` holds what stands between a mention
/// and the module's imports. What the loader uses to name a method by its declaration's row (09 MO-8t).
pub fn exprs_mut(p: &mut Program, f: &mut dyn FnMut(&mut Expr, &[String])) {
    let mut w = Scoped { f, d: &mut |_| {}, bound: vec![], text: None };
    w.block(&mut p.decls, |w| w.markups(&mut p.view));
}
/// MO-6d: a namespace import, `import * as Select from "m"`, is the named imports of the members the module names: each
/// `Select.Item` — a tag's first part, or a type's in a type's text — is the name `Select$Item`, imported as `Item`. The
/// namespace itself is no value. `ref/src/parse.ts` `namespaces`.
pub fn namespaces(p: &mut Program) {
    let nss: Vec<String> = p.decls.iter().filter_map(|d| if let Decl::Import { ns: Some(n), .. } = d { Some(n.clone()) } else { None }).collect();
    if nss.is_empty() {
        return;
    }
    let res: Vec<(String, regex::Regex)> = nss.iter().map(|n| (n.clone(), regex::Regex::new(&format!(r"(^|[^\w$.]){}\.([A-Za-z_$][\w$]*)", regex::escape(n))).unwrap())).collect();
    let found = std::cell::RefCell::new(std::collections::BTreeSet::<(String, String)>::new());
    let ty = |t: &mut String| {
        for (ns, re) in &res {
            if t.contains(&format!("{ns}.")) {
                *t = re.replace_all(t, |c: &regex::Captures| {
                    found.borrow_mut().insert((ns.clone(), c[2].to_string()));
                    format!("{}{ns}${}", &c[1], &c[2])
                }).into_owned();
            }
        }
    };
    let mut text = |t: &mut String, tag: bool| {
        if !tag {
            return ty(t);
        }
        let Some(i) = t.find('.') else { return };
        if !nss.iter().any(|n| *n == t[..i]) {
            return;
        }
        let rest = t[i + 1..].to_string();
        found.borrow_mut().insert((t[..i].to_string(), rest.split('.').next().unwrap_or("").to_string()));
        *t = format!("{}${rest}", &t[..i]);
    };
    let mut f = |e: &mut Expr, _: &[String]| match &mut e.k {
        ExprKind::Call { targs: Some(t), .. } => ty(t),
        ExprKind::Fn { ptypes, .. } => ptypes.iter_mut().flatten().for_each(&ty),
        ExprKind::ServerFn { ptypes, ret, .. } => ptypes.iter_mut().flatten().chain(ret.iter_mut()).for_each(&ty),
        _ => {}
    };
    let mut w = Scoped { f: &mut f, d: &mut |_| {}, bound: vec![], text: Some(&mut text) };
    w.block(&mut p.decls, |w| w.markups(&mut p.view));
    let found = found.into_inner();
    for d in &mut p.decls {
        if let Decl::Import { ns: Some(ns), names, .. } = d {
            *names = found.iter().filter(|(n, _)| n == ns).map(|(_, m)| ImportName { name: m.clone(), alias: format!("{ns}${m}") }).collect();
        }
    }
}
/// Every fn the program declares, in whatever block.
pub fn fns_mut(p: &mut Program, d: &mut dyn FnMut(&mut Decl)) {
    let mut w = Scoped { f: &mut |_, _| {}, d, bound: vec![], text: None };
    w.block(&mut p.decls, |w| w.markups(&mut p.view));
}
/// E-9b: a body that only names values — plain equations, and nothing in it that waits, remembers, reads a context or
/// makes anything. Whether one of them is a call that instantiates is the loader's to see (`modules::name_locals`).
pub fn names_only(d: &Decl) -> bool {
    let Decl::Fn { params, decls, tail, .. } = d else { return false };
    if decls.is_empty() || params.iter().any(|p| p.r#ref) || !decls.iter().all(|d| matches!(d, Decl::Eq { deferred: false, key: None, .. } | Decl::TypeDecl { .. })) || std::iter::once(tail).chain(decls.iter().filter_map(|d| if let Decl::Eq { e, .. } = d { Some(e) } else { None })).any(|e| reads_context(crate::check::Node::E(e))) {
        return false;
    }
    let mut ok = true;
    let mut f = |e: &mut Expr, _: &[String]| ok &= !matches!(e.k, ExprKind::Await { .. } | ExprKind::Pre { .. } | ExprKind::Use(_) | ExprKind::Draft { .. } | ExprKind::ServerFn { .. } | ExprKind::StyleMap { .. });
    Scoped { f: &mut f, d: &mut |_| {}, bound: vec![], text: None }.decls(&mut [d.clone()]);
    ok
}
/// E-9b: how the names of a fn's body are read from its result: the ones reached, a name after those it reads, each with
/// whether it is read in one place and not in a closure, so that its expression can stand there (E-3: it is then evaluated
/// when that place is, as in the one-line form). The others are shared: evaluated at most once for a call.
pub fn locals_of<'a>(decls: &'a [Decl], tail: &'a Expr) -> Vec<(&'a str, &'a Expr, bool)> {
    use crate::check::Node;
    struct W<'a> {
        eqs: HashMap<&'a str, &'a Expr>,
        seen: HashMap<&'a str, usize>,
        held: HashSet<&'a str>,
        order: Vec<&'a str>,
    }
    impl<'a> W<'a> {
        fn go(&mut self, n: Node<'a>, inner: bool) {
            let mut inner = inner;
            if let Node::E(e) = n {
                if let ExprKind::Id(x) = &e.k {
                    if let Some((&k, &v)) = self.eqs.get_key_value(x.as_str()) {
                        if inner {
                            self.held.insert(k);
                        }
                        let c = self.seen.entry(k).or_default();
                        *c += 1;
                        if *c == 1 {
                            self.go(Node::E(v), false);
                            self.order.push(k);
                        }
                        return;
                    }
                }
                inner |= matches!(e.k, ExprKind::Fn { .. });
            }
            for c in crate::check::children(n, true) {
                self.go(c, inner);
            }
        }
    }
    let mut w = W { eqs: decls.iter().filter_map(|d| if let Decl::Eq { name, e, .. } = d { Some((name.as_str(), e)) } else { None }).collect(), seen: HashMap::new(), held: HashSet::new(), order: vec![] };
    w.go(Node::E(tail), false);
    w.order.iter().map(|n| (*n, w.eqs[n], w.seen[n] == 1 && !w.held.contains(n))).collect()
}
/// The names a body calls that nothing in it binds, its parameters included.
pub fn free_calls(params: &[String], body: &[Stmt]) -> Vec<String> {
    let mut out = vec![];
    let mut f = |e: &mut Expr, bound: &[String]| {
        if let ExprKind::Call { f, .. } = &e.k {
            if let ExprKind::Id(n) = &f.k {
                if !bound.contains(n) {
                    out.push(n.clone());
                }
            }
        }
    };
    Scoped { f: &mut f, d: &mut |_| {}, bound: vec![], text: None }.with(params, |w| w.stmts(&mut body.to_vec()));
    out
}
struct Scoped<'f> {
    f: &'f mut dyn FnMut(&mut Expr, &[String]),
    d: &'f mut dyn FnMut(&mut Decl),
    bound: Vec<String>,
    /// every type's text of a declaration or a statement (`false`), and every tag (`true`): what `namespaces` changes
    text: Option<&'f mut dyn FnMut(&mut String, bool)>,
}
impl Scoped<'_> {
    fn ty<'t>(&mut self, ts: impl IntoIterator<Item = &'t mut String>) {
        if let Some(f) = self.text.as_mut() {
            ts.into_iter().for_each(|t| f(t, false));
        }
    }
    fn with<'n>(&mut self, names: impl IntoIterator<Item = &'n String>, go: impl FnOnce(&mut Self)) {
        let n = self.bound.len();
        self.bound.extend(names.into_iter().map(|x| x.trim_start_matches("...").to_string()));
        go(self);
        self.bound.truncate(n);
    }
    /// A block: its declarations' names are bound in all of it (a component may be applied above its declaration).
    fn block(&mut self, ds: &mut [Decl], rest: impl FnOnce(&mut Self)) {
        let names: Vec<String> = ds.iter().filter(|d| !matches!(d, Decl::Import { .. } | Decl::Provide { .. })).filter_map(|d| d.name().map(str::to_string)).collect();
        self.with(&names, |w| {
            w.decls(ds);
            rest(w);
        });
    }
    fn opt(&mut self, e: &mut Option<Box<Expr>>) {
        if let Some(e) = e {
            self.expr(e);
        }
    }
    fn expr(&mut self, e: &mut Expr) {
        (self.f)(e, &self.bound);
        match &mut e.k {
            ExprKind::Lit(_) | ExprKind::Id(_) | ExprKind::Use(_) | ExprKind::StyleMap { .. } => {}
            ExprKind::Bin { l, r, .. } => {
                self.expr(l);
                self.expr(r);
            }
            ExprKind::Un { e, .. } | ExprKind::Peek(e) | ExprKind::Latest(e) | ExprKind::Pending(e) | ExprKind::Spread(e) | ExprKind::Omit { e, .. } | ExprKind::Throw(e) | ExprKind::Member { o: e, .. } => self.expr(e),
            ExprKind::Pre { init, .. } => self.opt(init),
            ExprKind::Await { e, init, .. } => {
                self.expr(e);
                self.opt(init);
            }
            ExprKind::If { c, t, f } => {
                self.expr(c);
                self.expr(t);
                self.expr(f);
            }
            ExprKind::Tpl(parts) => parts.iter_mut().for_each(|p| {
                if let TplPart::Expr(e) = p {
                    self.expr(e);
                }
            }),
            ExprKind::Index { o, i, .. } => {
                self.expr(o);
                self.expr(i);
            }
            ExprKind::Call { f, args, .. } => {
                self.expr(f);
                args.iter_mut().for_each(|a| self.expr(a));
            }
            ExprKind::Arr(items) => items.iter_mut().for_each(|x| self.expr(x)),
            ExprKind::Rec(fields) => fields.iter_mut().for_each(|x| match x {
                Field::Kv { v, .. } => self.expr(v),
                Field::Spread(e) => self.expr(e),
            }),
            ExprKind::Fn { params, body, stmts, .. } => self.with(&*params, |w| {
                w.expr(body);
                if let Some(ss) = stmts {
                    w.stmts(ss);
                }
            }),
            ExprKind::Draft { seed, body } => {
                self.expr(seed);
                self.with(&["d".to_string()], |w| w.stmts(body));
            }
            ExprKind::Catch { e, name, alt, .. } => {
                self.expr(e);
                self.with(name.iter(), |w| w.expr(alt));
            }
            ExprKind::ServerFn { params, body, .. } => self.with(&*params, |w| w.stmts(body)),
        }
    }
    fn target(&mut self, t: &mut Target) {
        for s in &mut t.path {
            if let PathSeg::Expr(e) = s {
                self.expr(e);
            }
        }
    }
    fn stmts(&mut self, ss: &mut [Stmt]) {
        let lets: Vec<String> = ss.iter().filter_map(|s| if let StmtKind::Let { name, .. } = &s.k { Some(name.clone()) } else { None }).collect();
        self.with(&lets, |w| {
            for s in ss {
                match &mut s.k {
                    StmtKind::Write { target, e } | StmtKind::Optimistic { target, e } => {
                        w.target(target);
                        w.expr(e);
                    }
                    StmtKind::Let { e, ty, .. } => {
                        w.ty(ty.iter_mut());
                        w.expr(e)
                    }
                    StmtKind::Expr(e) | StmtKind::Throw(e) => w.expr(e),
                    StmtKind::Refresh(_) | StmtKind::Affects(_) => {}
                    StmtKind::Action(body) => w.stmts(body),
                    StmtKind::Sif { c, t, f } => {
                        w.expr(c);
                        w.stmts(t);
                        w.stmts(f);
                    }
                    StmtKind::For { name, e, body } => {
                        w.expr(e);
                        w.with([&*name], |w| w.stmts(body));
                    }
                    StmtKind::Return(e) => {
                        if let Some(e) = e {
                            w.expr(e);
                        }
                    }
                    StmtKind::Try { body, catch_name, handler, fin, .. } => {
                        w.stmts(body);
                        if let Some(h) = handler {
                            w.with(catch_name.iter(), |w| w.stmts(h));
                        }
                        if let Some(h) = fin {
                            w.stmts(h);
                        }
                    }
                }
            }
        });
    }
    fn decls(&mut self, ds: &mut [Decl]) {
        for d in ds {
            if self.text.is_some() {
                match d {
                    Decl::Source { ty, .. } | Decl::Eq { ty, .. } | Decl::Context { ty, .. } => self.ty(ty.iter_mut()),
                    Decl::TypeDecl { text, .. } => self.ty([text]),
                    Decl::Error { ptypes, .. } | Decl::Action { ptypes, .. } => self.ty(ptypes.iter_mut().flatten()),
                    Decl::Server { ptypes, ret, .. } => self.ty(ptypes.iter_mut().flatten().chain(ret.iter_mut())),
                    Decl::Fn { params, ret, tparams, .. } => self.ty(params.iter_mut().filter_map(|p| p.ty.as_mut()).chain(ret.iter_mut()).chain(tparams.iter_mut())),
                    Decl::Component { props_type, tparams, .. } => self.ty(props_type.iter_mut().chain(tparams.iter_mut())),
                    Decl::Import { .. } | Decl::Effect { .. } | Decl::Provide { .. } => {}
                }
            }
            match d {
                Decl::Source { init: e, .. } | Decl::Eq { e, .. } | Decl::Provide { e, .. } => self.expr(e),
                Decl::Import { .. } | Decl::TypeDecl { .. } => {}
                Decl::Error { params, msg, .. } => {
                    if let Some(m) = msg {
                        self.with(&*params, |w| w.expr(m));
                    }
                }
                Decl::Effect { inputs, body, .. } => {
                    inputs.iter_mut().for_each(|i| self.expr(i));
                    self.stmts(body);
                }
                Decl::Fn { params, decls, tail, .. } => {
                    let ps: Vec<String> = params.iter().map(|p| p.name.clone()).collect();
                    self.with(&ps, |w| w.block(decls, |w| w.expr(tail)));
                    (self.d)(d);
                }
                Decl::Component { props, decls, view, .. } => self.with([&*props], |w| w.block(decls, |w| w.markups(view))),
                Decl::Action { params, body, .. } | Decl::Server { params, body, .. } => self.with(&*params, |w| w.stmts(body)),
                Decl::Context { dflt, .. } => {
                    if let Some(e) = dflt {
                        self.expr(e);
                    }
                }
            }
        }
    }
    fn markups(&mut self, ms: &mut [Markup]) {
        for m in ms {
            match &mut m.kind {
                MarkupKind::El { tag, attrs, children } => {
                    if let Some(f) = self.text.as_mut() {
                        f(tag, true);
                    }
                    attrs.iter_mut().for_each(|a| self.expr(&mut a.e));
                    self.markups(children);
                }
                MarkupKind::Read(e) => self.expr(e),
                MarkupKind::Text(_) | MarkupKind::Style(_) => {}
                MarkupKind::Mif { c, t, t_decls, f, f_decls } => {
                    self.expr(c);
                    self.block(t_decls, |w| w.markups(t));
                    self.block(f_decls, |w| w.markups(f));
                }
                MarkupKind::Mfor { name, xs, decls, body } => {
                    self.expr(xs);
                    self.with([&*name], |w| w.block(decls, |w| w.markups(body)));
                }
                MarkupKind::Mview { params, decls, body, .. } => self.with(&*params, |w| w.block(decls, |w| w.markups(body))),
                MarkupKind::Loading { on, fallback, decls, body } => {
                    if let Some(e) = on {
                        self.expr(e);
                    }
                    self.markups(fallback);
                    self.block(decls, |w| w.markups(body));
                }
                MarkupKind::Errored { fallback, decls, body, err_name, .. } => {
                    self.with(err_name.iter(), |w| w.markups(fallback));
                    self.block(decls, |w| w.markups(body));
                }
                MarkupKind::Portal { to, decls, body } => {
                    if let Some(e) = to {
                        self.expr(e);
                    }
                    self.block(decls, |w| w.markups(body));
                }
            }
        }
    }
}

fn obj(pairs: Vec<(&str, Option<Value>)>) -> Value {
    let mut m = Map::new();
    for (k, v) in pairs {
        if let Some(v) = v {
            m.insert(k.to_string(), v);
        }
    }
    Value::Object(m)
}
fn s(x: &str) -> Option<Value> {
    Some(Value::String(x.to_string()))
}
fn os(x: &Option<String>) -> Option<Value> {
    x.as_ref().map(|x| Value::String(x.clone()))
}
fn strs(xs: &[String]) -> Value {
    Value::Array(xs.iter().map(|x| Value::String(x.clone())).collect())
}
fn ostrs(xs: &[Option<String>]) -> Value {
    Value::Array(xs.iter().map(|x| x.as_ref().map(|x| Value::String(x.clone())).unwrap_or(Value::Null)).collect())
}
fn flag(b: bool) -> Option<Value> {
    if b { Some(Value::Bool(true)) } else { None }
}
fn num(n: usize) -> Option<Value> {
    Some(json!(n))
}

pub fn lit_json(l: &Lit) -> Option<Value> {
    match l {
        Lit::Undefined => None,
        Lit::Null => Some(Value::Null),
        Lit::Bool(b) => Some(Value::Bool(*b)),
        Lit::Num(n) => Some(num_json(*n)),
        Lit::Str(x) => Some(Value::String(x.clone())),
    }
}
pub fn num_json(n: f64) -> Value {
    if n.fract() == 0.0 && n.abs() < 9.0e15 { json!(n as i64) } else { json!(n) }
}

impl Expr {
    pub fn kind(&self) -> &'static str {
        match &self.k {
            ExprKind::Lit(_) => "lit",
            ExprKind::Id(_) => "id",
            ExprKind::Bin { .. } => "bin",
            ExprKind::Un { .. } => "un",
            ExprKind::Pre { .. } => "pre",
            ExprKind::Peek(_) => "peek",
            ExprKind::Await { .. } => "await",
            ExprKind::Latest(_) => "latest",
            ExprKind::Pending(_) => "pending",
            ExprKind::If { .. } => "if",
            ExprKind::Tpl(_) => "tpl",
            ExprKind::Member { .. } => "member",
            ExprKind::Index { .. } => "index",
            ExprKind::Call { .. } => "call",
            ExprKind::Arr(_) => "arr",
            ExprKind::Rec(_) => "rec",
            ExprKind::Fn { .. } => "fn",
            ExprKind::Draft { .. } => "draft",
            ExprKind::Use(_) => "use",
            ExprKind::Spread(_) => "spread",
            ExprKind::Omit { .. } => "omit",
            ExprKind::Throw(_) => "throw",
            ExprKind::Catch { .. } => "catch",
            ExprKind::StyleMap { .. } => "stylemap",
            ExprKind::ServerFn { .. } => "serverfn",
        }
    }
    pub fn to_json(&self) -> Value {
        let k = s(self.kind());
        let b = |e: &Expr| Some(e.to_json());
        let ob = |e: &Option<Box<Expr>>| e.as_ref().map(|e| e.to_json());
        match &self.k {
            ExprKind::Lit(l) => obj(vec![("k", k), ("v", lit_json(l))]),
            ExprKind::Id(n) => obj(vec![("k", k), ("name", s(n))]),
            ExprKind::Bin { op, l, r } => obj(vec![("k", k), ("op", s(op)), ("l", b(l)), ("r", b(r))]),
            ExprKind::Un { op, e } => obj(vec![("k", k), ("op", s(op)), ("e", b(e))]),
            ExprKind::Pre { name, init } => obj(vec![("k", k), ("name", s(name)), ("init", ob(init))]),
            ExprKind::Peek(e) | ExprKind::Latest(e) | ExprKind::Pending(e) | ExprKind::Spread(e) | ExprKind::Throw(e) => obj(vec![("k", k), ("e", b(e))]),
            ExprKind::Omit { e, keys } => obj(vec![("k", k), ("e", b(e)), ("keys", Some(strs(keys)))]),
            ExprKind::Await { e, init, stream } => obj(vec![("k", k), ("e", b(e)), ("init", ob(init)), ("stream", Some(Value::Bool(*stream)))]),
            ExprKind::If { c, t, f } => obj(vec![("k", k), ("c", b(c)), ("t", b(t)), ("f", b(f))]),
            ExprKind::Tpl(parts) => obj(vec![
                ("k", k),
                ("parts", Some(Value::Array(parts.iter().map(|p| match p { TplPart::Str(x) => Value::String(x.clone()), TplPart::Expr(e) => e.to_json() }).collect()))),
            ]),
            ExprKind::Member { o, p, opt } => obj(vec![("k", k), ("o", b(o)), ("p", s(p)), ("opt", flag(*opt))]),
            ExprKind::Index { o, i, opt } => obj(vec![("k", k), ("o", b(o)), ("i", b(i)), ("opt", flag(*opt))]),
            ExprKind::Call { f, args, targs } => obj(vec![("k", k), ("f", b(f)), ("args", Some(Value::Array(args.iter().map(|a| a.to_json()).collect()))), ("targs", targs.as_ref().map(|t| Value::String(t.clone())))]),
            ExprKind::Arr(items) => obj(vec![("k", k), ("items", Some(Value::Array(items.iter().map(|a| a.to_json()).collect())))]),
            ExprKind::Rec(fields) => obj(vec![
                ("k", k),
                (
                    "fields",
                    Some(Value::Array(
                        fields
                            .iter()
                            .map(|f| match f {
                                Field::Kv { key, v } => obj(vec![("key", s(key)), ("v", Some(v.to_json()))]),
                                Field::Spread(e) => obj(vec![("spread", Some(e.to_json()))]),
                            })
                            .collect(),
                    )),
                ),
            ]),
            ExprKind::Fn { params, body, stmts, ptypes } => obj(vec![("k", k), ("params", Some(strs(params))), ("body", b(body)), ("stmts", stmts.as_ref().map(|ss| stmts_json(ss))), ("ptypes", ptypes.iter().any(|t| t.is_some()).then(|| ostrs(ptypes)))]),
            ExprKind::Draft { seed, body } => obj(vec![("k", k), ("seed", b(seed)), ("body", Some(stmts_json(body)))]),
            ExprKind::Use(n) => obj(vec![("k", k), ("name", s(n))]),
            ExprKind::Catch { e, name, classes, alt } => obj(vec![("k", k), ("e", b(e)), ("name", os(name)), ("classes", classes.as_ref().map(|c| strs(c))), ("alt", b(alt))]),
            ExprKind::StyleMap { css, line } => obj(vec![("k", k), ("css", s(css)), ("line", num(*line))]),
            ExprKind::ServerFn { params, ptypes, ret, body } => obj(vec![("k", k), ("params", Some(strs(params))), ("ptypes", Some(ostrs(ptypes))), ("ret", os(ret)), ("body", Some(stmts_json(body)))]),
        }
    }
}

pub fn stmts_json(ss: &[Stmt]) -> Value {
    Value::Array(ss.iter().map(|s| s.to_json()).collect())
}
fn target_json(t: &Target) -> Value {
    obj(vec![
        ("name", s(&t.name)),
        ("path", Some(Value::Array(t.path.iter().map(|p| match p { PathSeg::Name(n) => Value::String(n.clone()), PathSeg::Expr(e) => e.to_json() }).collect()))),
        ("ctx", t.ctx.map(Value::Bool)),
    ])
}
impl Stmt {
    pub fn to_json(&self) -> Value {
        let mut v = self.to_json0();
        if let Value::Object(m) = &mut v {
            m.insert("line".to_string(), Value::from(self.line));
        }
        v
    }
    fn to_json0(&self) -> Value {
        let k = s(self.kind());
        match &self.k {
            StmtKind::Write { target, e } | StmtKind::Optimistic { target, e } => obj(vec![("k", k), ("target", Some(target_json(target))), ("e", Some(e.to_json()))]),
            StmtKind::Let { name, e, ty } => obj(vec![("k", k), ("name", s(name)), ("e", Some(e.to_json())), ("type", os(ty))]),
            StmtKind::Expr(e) | StmtKind::Throw(e) => obj(vec![("k", k), ("e", Some(e.to_json()))]),
            StmtKind::Refresh(n) | StmtKind::Affects(n) => obj(vec![("k", k), ("name", s(n))]),
            StmtKind::Action(body) => obj(vec![("k", k), ("body", Some(stmts_json(body)))]),
            StmtKind::Sif { c, t, f } => obj(vec![("k", k), ("c", Some(c.to_json())), ("t", Some(stmts_json(t))), ("f", Some(stmts_json(f)))]),
            StmtKind::For { name, e, body } => obj(vec![("k", k), ("name", s(name)), ("e", Some(e.to_json())), ("body", Some(stmts_json(body)))]),
            StmtKind::Return(e) => obj(vec![("k", k), ("e", e.as_ref().map(|e| e.to_json()))]),
            StmtKind::Try { body, catch_name, catch_classes, handler, fin } => obj(vec![
                ("k", k),
                ("body", Some(stmts_json(body))),
                ("catchName", os(catch_name)),
                ("catchClasses", catch_classes.as_ref().map(|c| strs(c))),
                ("handler", handler.as_ref().map(|h| stmts_json(h))),
                ("fin", fin.as_ref().map(|h| stmts_json(h))),
            ]),
        }
    }
}

pub fn decls_json(ds: &[Decl]) -> Value {
    Value::Array(ds.iter().map(|d| d.to_json()).collect())
}
pub fn markups_json(ms: &[Markup]) -> Value {
    Value::Array(ms.iter().map(|m| m.to_json()).collect())
}
impl Decl {
    pub fn to_json(&self) -> Value {
        match self {
            Decl::Source { name, init, line, question, ty, exported, key, .. } => obj(vec![
                ("k", s("source")),
                ("name", s(name)),
                ("init", Some(init.to_json())),
                ("line", num(*line)),
                ("question", flag(*question)),
                ("type", os(ty)),
                ("key", os(key)),
                ("exported", flag(*exported)),
            ]),
            Decl::Eq { name, e, line, deferred, key, ty, exported, .. } => obj(vec![
                ("k", s("eq")),
                ("name", s(name)),
                ("e", Some(e.to_json())),
                ("line", num(*line)),
                ("deferred", flag(*deferred)),
                ("key", os(key)),
                ("type", os(ty)),
                ("exported", flag(*exported)),
            ]),
            Decl::Import { ns, names, from, pure, side, line, fails, resolved, declared, declared_errors, declared_error_fields, declared_pure, declared_side, prelude, reexport, .. } => obj(vec![
                ("reexport", flag(*reexport)),
                ("k", s("import")),
                ("ns", os(ns)),
                ("names", Some(Value::Array(names.iter().map(|n| obj(vec![("name", s(&n.name)), ("alias", s(&n.alias))])).collect()))),
                ("from", s(from)),
                ("pure", Some(Value::Bool(*pure))),
                ("line", num(*line)),
                ("fails", fails.as_ref().map(|f| strs(f))),
                ("side", side.map(|x| Value::String(x.as_str().into()))),
                ("resolved", os(resolved)),
                ("prelude", prelude.then_some(Value::Bool(true))),
                ("declared", os(declared)),
                ("declaredErrors", declared_errors.as_ref().map(|f| strs(f))),
                (
                    "declaredErrorFields",
                    declared_error_fields.as_ref().map(|xs| {
                        let mut m = Map::new();
                        for (k, v) in xs {
                            m.insert(k.clone(), Value::Array(v.iter().map(|x| Value::String(x.clone())).collect()));
                        }
                        Value::Object(m)
                    }),
                ),
                ("declaredPure", declared_pure.as_ref().map(|f| strs(f))),
                (
                    "declaredSide",
                    declared_side.as_ref().map(|xs| {
                        let mut m = Map::new();
                        for (n, sd) in xs {
                            m.insert(n.clone(), Value::String(sd.as_str().into()));
                        }
                        Value::Object(m)
                    }),
                ),
            ]),
            Decl::Error { name, params, ptypes, msg, line, exported, .. } => obj(vec![
                ("k", s("error")),
                ("name", s(name)),
                ("params", Some(strs(params))),
                ("ptypes", Some(ostrs(ptypes))),
                ("msg", msg.as_ref().map(|m| m.to_json())),
                ("line", num(*line)),
                ("exported", flag(*exported)),
            ]),
            Decl::TypeDecl { name, line, text, exported, .. } => obj(vec![("k", s("typedecl")), ("name", s(name)), ("line", num(*line)), ("text", s(text)), ("exported", flag(*exported))]),
            Decl::Effect { inputs, body, line, .. } => obj(vec![("k", s("effect")), ("inputs", Some(Value::Array(inputs.iter().map(|e| e.to_json()).collect()))), ("body", Some(stmts_json(body))), ("line", num(*line))]),
            Decl::Fn { name, params, decls, tail, line, ret, exported, tparams, named, .. } => obj(vec![
                ("k", s("fn")),
                ("name", s(name)),
                ("params", Some(Value::Array(params.iter().map(|p| obj(vec![("name", s(&p.name)), ("ref", Some(Value::Bool(p.r#ref))), ("type", os(&p.ty)), ("opt", p.opt.then_some(Value::Bool(true)))])).collect()))),
                ("decls", Some(decls_json(decls))),
                ("tail", Some(tail.to_json())),
                ("line", num(*line)),
                ("ret", os(ret)),
                ("exported", flag(*exported)),
                ("tparams", os(tparams)),
                ("named", flag(*named)),
            ]),
            Decl::Component { name, props, decls, view, line, props_type, no_props, exported, is_default, tparams, .. } => obj(vec![
                ("k", s("component")),
                ("name", s(name)),
                ("props", s(props)),
                ("decls", Some(decls_json(decls))),
                ("view", Some(markups_json(view))),
                ("line", num(*line)),
                ("propsType", os(props_type)),
                ("noProps", flag(*no_props)),
                ("exported", flag(*exported)),
                ("isDefault", flag(*is_default)),
                ("tparams", os(tparams)),
            ]),
            Decl::Action { name, params, ptypes, required, body, line, exported, .. } => obj(vec![
                ("k", s("action")),
                ("name", s(name)),
                ("params", Some(strs(params))),
                ("ptypes", Some(ostrs(ptypes))),
                ("required", required.map(|n| json!(n))),
                ("body", Some(stmts_json(body))),
                ("line", num(*line)),
                ("exported", flag(*exported)),
            ]),
            Decl::Server { name, params, ptypes, ret, body, line, exported, .. } => obj(vec![
                ("k", s("server")),
                ("name", s(name)),
                ("params", Some(strs(params))),
                ("ptypes", Some(ostrs(ptypes))),
                ("ret", os(ret)),
                ("body", Some(stmts_json(body))),
                ("line", num(*line)),
                ("exported", flag(*exported)),
            ]),
            Decl::Provide { name, e, line, .. } => obj(vec![("k", s("provide")), ("name", s(name)), ("e", Some(e.to_json())), ("line", num(*line))]),
            Decl::Context { name, ty, source, dflt, line, exported, .. } => obj(vec![
                ("k", s("context")),
                ("name", s(name)),
                ("type", os(ty)),
                ("source", Some(Value::Bool(*source))),
                ("dflt", dflt.as_ref().map(|e| e.to_json())),
                ("line", num(*line)),
                ("exported", flag(*exported)),
            ]),
        }
    }
}

impl Markup {
    pub fn to_json(&self) -> Value {
        let line = self.line.map(|l| json!(l));
        let ms = |x: &Vec<Markup>| Some(markups_json(x));
        let ds = |x: &Vec<Decl>| Some(decls_json(x));
        match &self.kind {
            MarkupKind::El { tag, attrs, children } => obj(vec![
                ("k", s("el")),
                ("tag", s(tag)),
                ("attrs", Some(Value::Array(attrs.iter().map(|a| obj(vec![("name", s(&a.name)), ("e", Some(a.e.to_json()))])).collect()))),
                ("children", ms(children)),
                ("line", line),
            ]),
            MarkupKind::Read(e) => obj(vec![("k", s("read")), ("e", Some(e.to_json())), ("line", line)]),
            MarkupKind::Text(x) => obj(vec![("k", s("text")), ("s", s(x)), ("line", line)]),
            MarkupKind::Style(css) => obj(vec![("k", s("style")), ("css", s(css)), ("line", line)]),
            MarkupKind::Mif { c, t, t_decls, f, f_decls } => obj(vec![("k", s("mif")), ("c", Some(c.to_json())), ("t", ms(t)), ("tDecls", ds(t_decls)), ("f", ms(f)), ("fDecls", ds(f_decls)), ("line", line)]),
            MarkupKind::Mview { prop, params, decls, body } => obj(vec![("k", s("mview")), ("prop", prop.as_ref().map(|p| Value::String(p.clone()))), ("params", Some(Value::Array(params.iter().map(|p| Value::String(p.clone())).collect()))), ("decls", ds(decls)), ("body", ms(body)), ("line", line)]),
            MarkupKind::Mfor { name, xs, decls, body } => obj(vec![("k", s("mfor")), ("name", s(name)), ("xs", Some(xs.to_json())), ("decls", ds(decls)), ("body", ms(body)), ("line", line)]),
            MarkupKind::Loading { on, fallback, decls, body } => obj(vec![("k", s("loading")), ("on", on.as_ref().map(|e| e.to_json())), ("fallback", ms(fallback)), ("decls", ds(decls)), ("body", ms(body)), ("line", line)]),
            MarkupKind::Errored { fallback, decls, body, err_name, classes } => obj(vec![
                ("k", s("errored")),
                ("fallback", ms(fallback)),
                ("decls", ds(decls)),
                ("body", ms(body)),
                ("errName", os(err_name)),
                ("classes", classes.as_ref().map(|c| strs(c))),
                ("line", line),
            ]),
            MarkupKind::Portal { to, decls, body } => obj(vec![("k", s("portal")), ("to", to.as_ref().map(|e| e.to_json())), ("decls", ds(decls)), ("body", ms(body)), ("line", line)]),
        }
    }
}

impl Program {
    pub fn to_json(&self) -> Value {
        obj(vec![("decls", Some(decls_json(&self.decls))), ("view", Some(markups_json(&self.view))), ("legacyView", self.legacy_view.map(Value::Bool))])
    }
}

/// A context read anywhere in it (`use c`, RG-7b).
fn reads_context(n: crate::check::Node) -> bool {
    use crate::check::Node;
    matches!(n, Node::E(Expr { k: ExprKind::Use(_), .. }))
        || matches!(n, Node::S(Stmt { k: StmtKind::Write { target, .. } | StmtKind::Optimistic { target, .. }, .. }) if target.is_ctx())
        || crate::check::children(n, true).into_iter().any(reads_context)
}
/// E-9, RG-6: a call of a fn happens once, where it is written — it has a `ref` parameter, its body declares, or it reads
/// a context (RG-7b: the provision above the region of the call, as MO-12b's `uses(c)` on a JS fn).
pub fn instantiates(params: &[Param], decls: &[Decl], tail: &Expr, named: bool) -> bool {
    params.iter().any(|p| p.r#ref) || has_region(decls, tail, named)
}
/// RG-6a: its call is a region of its own.
pub fn has_region(decls: &[Decl], tail: &Expr, named: bool) -> bool {
    !named && !decls.is_empty() || reads_context(crate::check::Node::E(tail))
}
/// E-9: what makes it instantiate, for a message (bug 22): its first `ref` parameter, its first declaration, or a context.
pub fn instantiates_why(params: &[Param], decls: &[Decl]) -> String {
    if let Some(p) = params.iter().find(|p| p.r#ref) {
        return format!("takes a `ref` parameter, `{}`", p.name);
    }
    let named = |what: &str, n: &str| if n.is_empty() { what.to_string() } else { format!("{what}, `{n}`") };
    match decls.first() {
        Some(Decl::Source { name, .. }) => format!("declares {}", named("a source", name)),
        Some(Decl::Eq { name, .. }) => format!("declares {}", named("an equation", name)),
        Some(Decl::TypeDecl { name, .. }) => format!("declares {}", named("a type", name)),
        Some(Decl::Effect { .. }) => "declares an effect".into(),
        Some(Decl::Provide { name, .. }) => format!("provides {}", named("a context", name)),
        Some(Decl::Error { name, .. }) => format!("declares {}", named("an error", name)),
        Some(Decl::Fn { name, .. }) => format!("declares {}", named("a fn", name)),
        Some(Decl::Component { name, .. }) => format!("declares {}", named("a component", name)),
        Some(Decl::Action { name, .. }) => format!("declares {}", named("an action", name)),
        Some(Decl::Server { name, .. }) => format!("declares {}", named("a server", name)),
        Some(Decl::Context { name, .. }) => format!("declares {}", named("a context", name)),
        Some(Decl::Import { .. }) => "declares an import".into(),
        None => "reads a context".into(),
    }
}

fn reads_own(n: crate::check::Node, me: &str) -> bool {
    matches!(n, crate::check::Node::E(Expr { k: ExprKind::Pre { name, .. }, .. }) if name == me) || crate::check::children(n, true).into_iter().any(|c| reads_own(c, me))
}
/// C-2: the places of an equation that builds on its own last value (`pre self`) whose value the result may hold: an item,
/// a field, an arm, an argument, what a draft's write gives. A whole store held there is a copy (`kept`), as a write of its
/// source replaces the root (ST-2a) and what the equation holds is the value it was.
pub fn kept_parts<'a>(e: &'a Expr, me: &str) -> Vec<&'a Expr> {
    fn go<'a>(x: &'a Expr, out: &mut Vec<&'a Expr>) {
        match &x.k {
            ExprKind::Id(_) | ExprKind::Member { .. } | ExprKind::Index { .. } | ExprKind::Use(_) | ExprKind::Peek(_) | ExprKind::Latest(_) => out.push(x),
            ExprKind::Arr(xs) => xs.iter().for_each(|x| go(x, out)),
            ExprKind::Rec(fs) => fs.iter().for_each(|f| {
                if let Field::Kv { v, .. } = f {
                    go(v, out)
                }
            }),
            ExprKind::If { t, f, .. } => {
                go(t, out);
                go(f, out);
            }
            ExprKind::Bin { op, l, r } if matches!(op.as_str(), "&&" | "||" | "??") => {
                go(l, out);
                go(r, out);
            }
            ExprKind::Call { args, .. } => args.iter().for_each(|x| go(x, out)),
            ExprKind::Await { e, .. } => go(e, out),
            ExprKind::Catch { e, alt, .. } => {
                go(e, out);
                go(alt, out);
            }
            ExprKind::Draft { body, .. } => body.iter().for_each(|s| {
                if let StmtKind::Write { e, .. } = &s.k {
                    go(e, out)
                }
            }),
            _ => {}
        }
    }
    let mut out = vec![];
    if reads_own(crate::check::Node::E(e), me) {
        go(e, &mut out);
    }
    out
}
