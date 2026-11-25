//! The reading of a call (DESIGN.md): an abstract run of a function over what its arguments may be. It ends with what the
//! call answers, or at the first thing that is not listed here (`Stop`): then there is no word.
use super::constant::{self, reserved, static_key, unwrap, Kind as CKind, REGEXP_IN_STRING};
use super::graph::{Module, Modules, Origin};
use super::resolve::Host;
use oxc_ast::{ast::*, AstKind};
use oxc_semantic::{NodeId, ScopeId};
use oxc_span::{GetSpan, Span};
use oxc_syntax::symbol::SymbolId;
use serde_json::Value;
use std::collections::{BTreeMap, BTreeSet, HashMap};


/// The type of an argument, as the row says it (read by the host, through tsrs).
#[derive(Clone, Debug)]
pub enum Ty {
    Num, Prim, Any, Param,
    /// A function: whether it answers something, and what.
    Fn { answers: bool, ret: u32, params: Vec<u32> },
    Arr(u32), Tuple(Vec<u32>), Rest(u32), Map(u32, u32), Set(u32), Promise(u32),
    Rec(BTreeMap<String, u32>),
    Union(Vec<u32>),
    /// The platform's, a class of the library's, a `Date`: an object whose parts are not data.
    Other,
}
#[derive(Default)]
pub struct Types(pub Vec<Ty>);
pub const ANY: u32 = 0;
pub const OTHER: u32 = 1;
/// The platform's own event target (an `Other` to the reading of a call).
pub const TARGET: u32 = 2;
impl Types {
    pub fn new() -> Self { Types(vec![Ty::Any, Ty::Other, Ty::Other]) }
    pub fn read(&mut self, v: &Value) -> u32 {
        let t = match v["k"].as_str().unwrap_or("any") {
            "num" => Ty::Num,
            "prim" => Ty::Prim,
            "param" => Ty::Param,
            "fn" => { let ret = self.read(&v["r"]); let params = v["p"].as_array().into_iter().flatten().map(|x| self.read(x)).collect(); Ty::Fn { answers: v["answers"] == true, ret, params } }
            "arr" => Ty::Arr(self.read(&v["e"])),
            "rest" => Ty::Rest(self.read(&v["e"])),
            "tuple" => Ty::Tuple(v["e"].as_array().into_iter().flatten().map(|x| self.read(x)).collect()),
            "map" => { let k = self.read(&v["key"]); Ty::Map(k, self.read(&v["e"])) }
            "set" => Ty::Set(self.read(&v["e"])),
            "promise" => Ty::Promise(self.read(&v["e"])),
            "rec" => Ty::Rec(v["f"].as_object().into_iter().flatten().map(|(k, x)| (k.clone(), self.read(x))).collect()),
            "union" => Ty::Union(v["m"].as_array().into_iter().flatten().map(|x| self.read(x)).collect()),
            "other" => return if v["t"] == true { TARGET } else { OTHER },
            _ => return ANY,
        };
        self.0.push(t);
        self.0.len() as u32 - 1
    }
}

#[derive(Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Debug)]
pub enum Atom {
    Undef, Num, Prim,
    /// The caller's value, of a type, so many steps from the argument: a function is called at no more than one.
    Param(u32, u8),
    Obj(u32), Fun(u32), Class(u32), Const(u32), Native(u32), Solid(u32),
    /// Something that may be passed on and compared: nothing is read from it.
    Opaque,
    /// A timer's number: the platform's.
    Timer,
}
pub type Val = Vec<Atom>;
fn add(v: &mut Val, a: Atom) -> bool { match v.binary_search(&a) { Ok(_) => false, Err(i) => { v.insert(i, a); true } } }
pub fn join(v: &mut Val, w: &Val) -> bool { let mut c = false; for a in w { c |= add(v, *a); } c }
fn one(a: Atom) -> Val { vec![a] }
fn prim() -> Val { vec![Atom::Prim] }
fn num() -> Val { vec![Atom::Num] }
fn undef() -> Val { vec![Atom::Undef] }
fn flat(a: Atom) -> bool { matches!(a, Atom::Undef | Atom::Num | Atom::Prim) }
fn prims(v: &Val) -> bool { v.iter().all(|a| flat(*a)) }

#[derive(Clone, PartialEq, Eq, Debug)]
enum Kind { Plain, Array, Map, Set, Weak, Iter, Promise, Error, RegExp, Accessor, Setter, Resolve(u32), Reject, Store }
struct Obj {
    kind: Kind,
    /// Its own properties, by their names.
    fields: BTreeMap<String, Val>,
    /// Its private names (`#x`): no property, so nothing but the class reads, spreads or lists them.
    private: BTreeMap<String, Val>,
    /// A list written out: what stands where, until it is changed (`moved`).
    places: BTreeMap<usize, Val>,
    moved: bool,
    /// An array's items, a map's values, what is under a name that is computed; what a promise answers.
    items: Val,
    keys: Val,
    /// Made as the module loads: a call of it may not read or write it.
    module: bool,
    getters: BTreeSet<String>,
    /// A name that is computed was given something that is no primitive: `__proto__` may be among them.
    wild: bool,
    class: Option<u32>,
}
#[derive(Clone, Copy, PartialEq, Eq, Hash)]
pub struct FnAt { pub module: usize, pub node: NodeId }
struct Fun { at: FnAt, env: u32 }
struct Act { module: usize, scope: Option<ScopeId>, parent: Option<u32>, vars: HashMap<SymbolId, Val>, ret: Val, init: bool, running: bool, this: Option<Val>, later: bool, waits: bool, is_async: bool }
struct Cls { at: FnAt, env: u32 }
struct ConstObj { shape: constant::Shape, values: BTreeMap<String, Val>, all: Val, keys: Val }

#[derive(Clone, Debug)]
pub struct Stop { pub why: String, pub module: usize, pub at: u32 }
pub type R<T> = Result<T, Stop>;

/// What the call of an export was shown to do.
#[derive(Default, Clone, Debug)]
pub struct Facts {
    /// It made Solid's nodes, and some its owner must keep.
    pub makes: bool,
    pub owned: bool,
    /// It asked where it runs, so an answer that is data may differ.
    pub env: bool,
    pub answers_data: bool,
    pub answers_timer: bool,
    /// The function parts of what it answers that are not shown to only compute and read: where (the fields and places down to
    /// it), and why.
    pub parts: Vec<(Vec<String>, bool, Stop)>,
    /// An object of what it answers may be changed after the call.
    pub later: Option<Stop>,
    pub files: BTreeSet<String>,
}

pub struct Eval<'m, 'a, 'r> {
    pub mods: &'m Modules<'a, 'r>,
    pub h: Host,
    pub hi: usize,
    pub types: &'m Types,
    funs: Vec<Fun>,
    fun_ids: HashMap<(FnAt, u32), u32>,
    classes: Vec<Cls>,
    class_ids: HashMap<(FnAt, u32), u32>,
    objs: Vec<Obj>,
    obj_ids: HashMap<(u32, u32, u32, u8), u32>,
    consts: Vec<ConstObj>,
    natives: Vec<String>,
    solids: Vec<String>,
    acts: Vec<Act>,
    act_ids: HashMap<(u32, u32, u32, u32), u32>,
    cells: HashMap<(u32, u32), Val>,
    module_acts: HashMap<usize, u32>,
    module_values: HashMap<(usize, SymbolId), Option<R<Val>>>,
    narrow: Vec<(usize, SymbolId, Narrow)>,
    stack: Vec<u32>,
    ctor_class: Vec<(u32, u32)>,
    cur: u32,
    changed: bool,
    fuel: u32,
    /// The call is over and a function it answered is read: what the call made (`.0` activations, `.1` objects) is as it was left.
    post: Option<(u32, u32)>,
    /// The objects of the call's that a function it answered reads, and those something may change after the call.
    reads: BTreeSet<u32>,
    written: BTreeMap<u32, Stop>,
    /// The same, by an async function's own code after it waited: before its promise answers.
    waited: BTreeMap<u32, Stop>,
    /// In a computation, which runs again.
    again: u32,
    /// What an effect or a cleanup of the call's runs, later.
    kept: Val,
    pub facts: Facts,
}
enum Found { Read(BTreeSet<u32>), Not(Stop) }
/// A function among what a call answered.
struct Part { path: Vec<String>, fun: Option<u32>, what: Found, told: bool, /** a function, and nothing more */ callable: bool }
#[derive(Clone, Copy, PartialEq, Eq)]
enum Narrow { Num, Prim, Fn, NotFn, List, NotList }

const BUILTIN_VALUES: &[&str] = &["Math", "JSON", "Object", "Array", "String", "Number", "Boolean", "BigInt", "Promise", "Proxy", "Map", "Set", "WeakMap", "WeakSet", "Error", "TypeError", "RangeError", "SyntaxError", "ReferenceError", "EvalError", "URIError", "RegExp", "parseInt", "parseFloat", "isNaN", "isFinite", "encodeURIComponent", "encodeURI", "decodeURIComponent", "decodeURI", "setTimeout", "clearTimeout", "clearInterval", "queueMicrotask"];
const ERRORS: &[&str] = &["Error", "TypeError", "RangeError", "SyntaxError", "ReferenceError", "EvalError", "URIError"];
const OBJECT_PROTO: &[&str] = &["toString", "valueOf", "toLocaleString", "hasOwnProperty", "isPrototypeOf", "propertyIsEnumerable"];
const STR_METHODS: &[&str] = &["charAt", "charCodeAt", "codePointAt", "at", "endsWith", "startsWith", "includes", "indexOf", "lastIndexOf", "normalize", "padEnd", "padStart", "repeat", "slice", "substring", "substr", "toLowerCase", "toUpperCase", "trim", "trimStart", "trimEnd", "toString", "valueOf", "toFixed", "toPrecision", "toExponential", "concat", "search"];
const NUM_ANSWER: &[&str] = &["indexOf", "lastIndexOf", "charCodeAt", "search", "codePointAt"];

impl<'m, 'a, 'r> Eval<'m, 'a, 'r> {
    pub fn new(mods: &'m Modules<'a, 'r>, h: Host, hi: usize, types: &'m Types) -> Self {
        Eval { mods, h, hi, types, funs: vec![], fun_ids: HashMap::new(), classes: vec![], class_ids: HashMap::new(), objs: vec![], obj_ids: HashMap::new(), consts: vec![], natives: vec![], solids: vec![], acts: vec![], act_ids: HashMap::new(), cells: HashMap::new(), module_acts: HashMap::new(), module_values: HashMap::new(), narrow: vec![], stack: vec![], ctor_class: vec![], cur: 0, changed: false, fuel: 400_000, post: None, reads: BTreeSet::new(), written: BTreeMap::new(), waited: BTreeMap::new(), again: 0, kept: vec![], facts: Facts::default() }
    }
    fn m(&self) -> &'m Module<'a> { self.mods.get(self.acts[self.cur as usize].module) }
    fn mi(&self) -> usize { self.acts[self.cur as usize].module }
    fn stop<T>(&self, at: Span, why: impl Into<String>) -> R<T> { Err(Stop { why: why.into(), module: self.mi(), at: at.start }) }
    fn native(&mut self, n: &str) -> Atom { let i = self.natives.iter().position(|x| x == n).unwrap_or_else(|| { self.natives.push(n.into()); self.natives.len() - 1 }); Atom::Native(i as u32) }
    fn solid(&mut self, n: &str) -> Atom { let i = self.solids.iter().position(|x| x == n).unwrap_or_else(|| { self.solids.push(n.into()); self.solids.len() - 1 }); Atom::Solid(i as u32) }
    fn ty(&self, t: u32) -> &'m Ty { &self.types.0[t as usize] }

    /// The atoms of a value of a type.
    fn of_type(&self, t: u32, d: u8) -> Val {
        match self.ty(t) {
            Ty::Num => num(),
            Ty::Prim => prim(),
            Ty::Union(m) => { let mut v = vec![]; for x in m { join(&mut v, &self.of_type(*x, d)); } v }
            _ => one(Atom::Param(t, d.min(3))),
        }
    }

    fn act(&mut self, module: usize, scope: Option<ScopeId>, parent: Option<u32>, init: bool) -> u32 {
        self.acts.push(Act { module, scope, parent, vars: HashMap::new(), ret: vec![], init, running: false, this: None, later: false, waits: false, is_async: false });
        self.acts.len() as u32 - 1
    }
    fn module_act(&mut self, mi: usize) -> u32 {
        if let Some(a) = self.module_acts.get(&mi) { return *a; }
        let scope = self.mods.get(mi).scoping.root_scope_id();
        let a = self.act(mi, Some(scope), None, true);
        self.module_acts.insert(mi, a);
        a
    }
    fn fun(&mut self, at: FnAt, env: u32) -> Atom {
        if let Some(i) = self.fun_ids.get(&(at, env)) { return Atom::Fun(*i); }
        self.funs.push(Fun { at, env });
        let i = self.funs.len() as u32 - 1;
        self.fun_ids.insert((at, env), i);
        Atom::Fun(i)
    }
    /// The object a place makes: one a place and a call.
    fn made(&mut self, at: Span, tag: u8, kind: Kind) -> u32 {
        let k = (self.cur, at.start, at.end, tag);
        if let Some(o) = self.obj_ids.get(&k) { return *o; }
        let module = self.acts[self.cur as usize].init;
        self.objs.push(Obj { kind, fields: BTreeMap::new(), private: BTreeMap::new(), places: BTreeMap::new(), moved: false, items: vec![], keys: vec![], module, getters: BTreeSet::new(), wild: false, class: None });
        let i = self.objs.len() as u32 - 1;
        self.obj_ids.insert(k, i);
        i
    }
    fn new_array(&mut self, at: Span, tag: u8, items: Val) -> Val { let o = self.made(at, tag, Kind::Array); self.put_items(o, &items); one(Atom::Obj(o)) }
    fn put_items(&mut self, o: u32, v: &Val) { if join(&mut self.objs[o as usize].items, v) { self.changed = true; } }
    fn put_private(&mut self, o: u32, k: &str, v: &Val) { if join(self.objs[o as usize].private.entry(k.to_string()).or_default(), v) { self.changed = true; } }
    fn put_field(&mut self, o: u32, k: &str, v: &Val) { if join(self.objs[o as usize].fields.entry(k.to_string()).or_default(), v) { self.changed = true; } }
    /// An object of the call's: one it may read and change.
    fn own(&mut self, o: u32, at: Span) -> R<()> {
        if self.objs[o as usize].module && !self.acts[self.cur as usize].init { return self.stop(at, "it reads an object the module made as it loaded"); }
        if self.post.is_some_and(|(_, n)| o < n) { self.reads.insert(o); }
        Ok(())
    }
    /// An object is changed: not by a function the call answered, and noted where it is changed after the call.
    fn wrote(&mut self, o: u32, at: Span) -> R<()> {
        if self.post.is_some_and(|(_, n)| o < n) { return self.stop(at, "it changes what the call made"); }
        let (again, later) = (self.is_again(), self.is_later());
        if again || later {
            let s = self.stop::<()>(at, "what it answers may be changed later, by what the call left to run").unwrap_err();
            if again { &mut self.written } else { &mut self.waited }.entry(o).or_insert(s);
        }
        Ok(())
    }

    // ---- an export's call ----
    /// The call of an export, with its arguments' types (`params`; the last may be a rest parameter's).
    pub fn export(&mut self, o: &Origin<'a>, params: &[u32], answers: u32) -> R<Val> {
        let f = self.origin(o, Span::new(0, 0), 0)?;
        let [Atom::Fun(f)] = f[..] else { return Err(Stop { why: "it is no function of the module's, or may be changed".into(), module: 0, at: 0 }) };
        let at = self.funs[f as usize].at;
        let (gen, n) = { let m = self.mods.get(at.module); match m.nodes.kind(at.node) { AstKind::Function(x) => (x.generator, x.params.items.len()), AstKind::ArrowFunctionExpression(x) => (false, x.params.items.len()), _ => (true, 0) } };
        if gen { return Err(Stop { why: "it is a generator".into(), module: at.module, at: 0 }); }
        let mut args: Vec<Val> = vec![];
        let mut rest = None;
        for t in params { if let Ty::Rest(e) = self.ty(*t) { rest = Some(*e); } else { args.push(self.of_type(*t, 0)); } }
        if let Some(e) = rest { while args.len() < n { let mut v = self.of_type(e, 1); add(&mut v, Atom::Undef); args.push(v); } }
        // an argument the row has no parameter for is anyone's
        else { while args.len() < n { args.push(one(Atom::Param(ANY, 3))); } }
        let more = match rest { Some(e) => self.of_type(e, 1), None => one(Atom::Param(ANY, 3)) };
        let root = self.act(at.module, None, None, false);
        let mut ret = vec![];
        for _ in 0..40 {
            self.changed = false;
            self.cur = root;
            ret = self.call_fun(f, &args, Some(&more), Span::new(0, 0), None)?;
            if !self.changed { break; }
            if self.fuel == 0 { break; }
        }
        if self.changed { return Err(Stop { why: "the reading of it does not end".into(), module: at.module, at: 0 }); }
        self.cur = root;
        let mut seen = BTreeSet::new();
        let (d, t) = self.reaches(&ret, &mut seen);
        self.facts.answers_data = d;
        self.facts.answers_timer = t;
        self.parts(&ret, answers);
        Ok(ret)
    }
    /// What a store holds is changed where the store is.
    fn under_store(&mut self, v: &Val, s: &Stop, seen: &mut BTreeSet<u32>) {
        for a in v { if let Atom::Obj(o) = a { if seen.insert(*o) { self.written.entry(*o).or_insert_with(|| s.clone()); let x = &self.objs[*o as usize]; let all: Vec<Val> = x.fields.values().cloned().chain([x.items.clone()]).collect(); for w in all { self.under_store(&w, s, seen); } } } }
    }
    // ---- what the call answered, after it
    /// The functions among what it answered, each read as a call of its own over what the call left; and the objects among it
    /// that something left to run may change.
    fn parts(&mut self, ret: &Val, t: u32) {
        let mut found = vec![];
        self.part(ret, t, &mut vec![], &mut BTreeSet::new(), &mut found, 0);
        let kept: Vec<Atom> = self.kept.clone();
        for a in kept { if let Atom::Fun(f) = a { self.may_write(f, "what it answers may be changed by an effect or a cleanup of the call's"); } else if !matches!(a, Atom::Param(..)) { self.facts.later.get_or_insert(Stop { why: "an effect's function that is not known".into(), module: 0, at: 0 }); } }
        // a function that is not shown to compute may change what the call made, so one that reads that is not shown either
        loop {
            let mut more = vec![];
            for x in &mut found {
                let Found::Read(reads) = &x.what else { continue };
                if let Some(o) = reads.iter().find(|o| self.written.contains_key(o) || self.waited.contains_key(o)) { let mut s = self.written.get(o).or_else(|| self.waited.get(o)).unwrap().clone(); s.why = "it reads what may be changed after the call".into(); x.what = Found::Not(s); if let Some(f) = x.fun { more.push(f); } }
            }
            for x in &mut found { if let (Found::Not(_), Some(f), false) = (&x.what, x.fun, x.told) { x.told = true; more.push(f); } }
            if more.is_empty() { break; }
            for f in more { self.may_write(f, "what it answers may be changed by a function beside it"); }
        }
        let mut seen = BTreeSet::new();
        if let Some(s) = self.changes(ret, &mut seen, 0, false) { self.facts.later.get_or_insert(s); }
        self.facts.parts = found.into_iter().filter_map(|x| match x.what { Found::Not(s) => Some((x.path, x.callable, s)), _ => None }).collect();
    }
    /// The first object of a value that something may change after the call (a store's and a promise's are told when they do).
    fn changes(&self, v: &Val, seen: &mut BTreeSet<u32>, d: u32, settled: bool) -> Option<Stop> {
        for a in v {
            let Atom::Obj(o) = a else { continue };
            if !seen.insert(*o) || d > 40 { continue; }
            let x = &self.objs[*o as usize];
            if matches!(x.kind, Kind::Accessor | Kind::Setter | Kind::Resolve(_) | Kind::Reject) { continue; }
            if let Some(s) = self.written.get(o).or_else(|| if settled { None } else { self.waited.get(o) }) { if x.kind != Kind::Store && x.kind != Kind::Promise { return Some(s.clone()); } }
            if x.kind == Kind::Store { continue; }
            for w in x.fields.values().chain(x.private.values()).chain([&x.items, &x.keys]) { if let Some(s) = self.changes(w, seen, d + 1, settled || x.kind == Kind::Promise) { return Some(s); } }
        }
        None
    }
    /// Everything a closure names may be changed by it.
    fn may_write(&mut self, f: u32, why: &str) {
        let at = self.funs[f as usize].at;
        let m = self.mods.get(at.module);
        let stop = Stop { why: why.into(), module: at.module, at: m.nodes.kind(at.node).span().start };
        let mut todo: Vec<Atom> = vec![Atom::Fun(f)];
        let (mut funs, mut objs, mut acts) = (BTreeSet::new(), BTreeSet::new(), BTreeSet::new());
        while let Some(a) = todo.pop() {
            match a {
                Atom::Fun(f) if funs.insert(f) => {
                    let mut e = Some(self.funs[f as usize].env);
                    while let Some(i) = e { let x = &self.acts[i as usize]; if !acts.insert(i) { break; } todo.extend(x.vars.values().flatten()); if let Some(t) = &x.this { todo.extend(t); } e = x.parent; }
                }
                Atom::Obj(o) if objs.insert(o) => { let x = &self.objs[o as usize]; todo.extend(x.fields.values().chain(x.private.values()).flatten()); todo.extend(&x.items); todo.extend(&x.keys); }
                _ => {}
            }
        }
        for o in objs { self.written.entry(o).or_insert_with(|| stop.clone()); }
    }
    fn part(&mut self, v: &Val, t: u32, path: &mut Vec<String>, seen: &mut BTreeSet<u32>, out: &mut Vec<Part>, d: u32) {
        let here = |me: &Self| Stop { why: String::new(), module: me.mi(), at: 0 };
        let not = |me: &Self, w: &str| Found::Not(Stop { why: w.into(), ..here(me) });
        if v.is_empty() { return; }
        if d > 8 { let w = not(self, "what it answers goes too deep to be followed"); out.push(Part { path: path.clone(), fun: None, what: w, told: false, callable: false }); return; }
        for a in v.clone() {
            let bad: &str = match a {
                a if flat(a) => continue,
                // the caller's own: one that answers something is called for what it answers (MO-8j)
                Atom::Param(p, _) => if matches!(self.ty(p), Ty::Fn { answers: false, .. }) { "a function it was given, which answers nothing" } else { continue },
                Atom::Timer => continue,   // (told apart)
                Atom::Fun(f) => { let what = self.prove(f, t, path, seen, out, d); out.push(Part { path: path.clone(), fun: Some(f), what, told: false, callable: true }); continue }
                Atom::Native(n) => { let n = &self.natives[n as usize]; if (n.starts_with("Math.") && n != "Math.random") || (n.starts_with("Number.") && native_fn(n)) || matches!(n.as_str(), "String" | "Number" | "Boolean" | "parseInt" | "parseFloat" | "isNaN" | "isFinite" | "Array.isArray" | "Object.is" | "String.fromCharCode" | "encodeURIComponent" | "encodeURI" | "decodeURIComponent" | "decodeURI") { continue } "a built-in of the language's" }
                Atom::Const(c) => {
                    let key = u32::MAX - c;
                    if !seen.insert(key) { continue; }
                    let c = &self.consts[c as usize];
                    if matches!(c.shape.kind, CKind::RegExp { .. }) { "a pattern, whose `test` may change it" }
                    else { let (vs, all, keys) = (c.values.clone(), c.all.clone(), c.keys.clone()); if vs.is_empty() { self.part(&all, ANY, path, seen, out, d + 1); } for (k, v) in vs { let t = self.field_ty(t, &k); path.push(k); self.part(&v, t, path, seen, out, d + 1); path.pop(); } self.part(&keys, ANY, path, seen, out, d + 1); continue }
                }
                Atom::Class(_) => "a class",
                Atom::Solid(_) => "a function of Solid's",
                Atom::Opaque => "a value that is not known (a proxy, what Solid gave)",
                Atom::Obj(o) => {
                    let x = &self.objs[o as usize];
                    match x.kind {
                        Kind::Accessor => continue,
                        Kind::Setter => "a setter",
                        Kind::Resolve(_) | Kind::Reject => "what settles a promise",
                        Kind::Iter => "an iterator",
                        Kind::RegExp => "a pattern, whose `test` may change it",
                        _ => {
                            if x.class.is_some_and(|c| self.has_methods(c)) { "an instance, whose methods are not read" }
                            else {
                                if !seen.insert(o) { continue; }
                                let (fields, getters, items, keys, places, kind) = (x.fields.clone(), x.getters.clone(), x.items.clone(), x.keys.clone(), x.places.clone(), x.kind.clone());
                                for (k, v) in fields { let g = getters.contains(&k); let t = if g { ANY } else { self.field_ty(t, &k) }; path.push(k); if g { path.push("get".into()); } self.part(&v, t, path, seen, out, d + 1); if g { path.pop(); } path.pop(); }
                                let it = match (&kind, self.ty(t)) { (Kind::Array, Ty::Arr(e)) | (Kind::Promise, Ty::Promise(e)) | (Kind::Map, Ty::Map(_, e)) => *e, (Kind::Promise, _) => ANY, (Kind::Array, _) => ANY, _ => ANY };
                                if kind == Kind::Array && !places.is_empty() { for (i, v) in places { let t = match self.ty(t) { Ty::Tuple(es) => es.get(i).copied().unwrap_or(ANY), Ty::Arr(e) => *e, _ => ANY }; path.push(i.to_string()); self.part(&v, t, path, seen, out, d + 1); path.pop(); } }
                                else { path.push("*".into()); self.part(&items, it, path, seen, out, d + 1); path.pop(); }
                                path.push("*".into()); self.part(&keys, ANY, path, seen, out, d + 1); path.pop();
                                continue
                            }
                        }
                    }
                }
                _ => "a value that is not known",
            };
            let what = not(self, bad);
            out.push(Part { path: path.clone(), fun: None, what, told: false, callable: matches!(a, Atom::Param(..)) || matches!(a, Atom::Obj(o) if self.objs[o as usize].kind == Kind::Setter) });
        }
    }
    fn field_ty(&self, t: u32, k: &str) -> u32 { match self.ty(t) { Ty::Rec(f) => f.get(k).copied().unwrap_or(ANY), _ => ANY } }
    /// Whether an instance has more than its fields: a method, a getter, of its class's or one it extends.
    fn has_methods(&self, c: u32) -> bool {
        let x = &self.classes[c as usize];
        let m = self.mods.get(x.at.module);
        let AstKind::Class(k) = m.nodes.kind(x.at.node) else { return true };
        if k.body.body.iter().any(|e| matches!(e, ClassElement::MethodDefinition(d) if d.kind != MethodDefinitionKind::Constructor)) { return true; }
        match &k.heritage { None => false, Some(h) => match unwrap(&h.expression) { Expression::Identifier(i) if ERRORS.iter().any(|e| m.is_global(i, e)) => false, _ => true } }
    }
    /// A function the call answered: read as a call of its own, with what its type in the row gives it.
    fn prove(&mut self, f: u32, t: u32, path: &mut Vec<String>, seen: &mut BTreeSet<u32>, out: &mut Vec<Part>, d: u32) -> Found {
        let at = self.funs[f as usize].at;
        let m = self.mods.get(at.module);
        let span = m.nodes.kind(at.node).span();
        let (args, ret) = match self.ty(t) { Ty::Fn { params, ret, .. } => (params.clone(), *ret), _ => (vec![], ANY) };
        let mut vals = vec![];
        let mut more = one(Atom::Param(ANY, 3));
        for a in &args { if let Ty::Rest(e) = self.ty(*a) { more = self.of_type(*e, 2); add(&mut more, Atom::Undef); } else { let mut v = self.of_type(*a, 2); add(&mut v, Atom::Undef); vals.push(v); } }
        let was = (self.post, self.cur, std::mem::take(&mut self.stack), std::mem::take(&mut self.narrow), self.changed, self.facts.env, std::mem::take(&mut self.reads), self.kept.clone());
        // what is made by this call is frozen for what it answers in turn
        self.post = Some((self.acts.len() as u32, self.objs.len() as u32));
        let root = self.act(at.module, None, None, false);
        self.facts.env = false;
        let r = (|| -> R<Val> {
            for _ in 0..40 {
                self.changed = false;
                self.cur = root;
                let v = self.call_fun(f, &vals, Some(&more), span, None)?;
                if !self.changed { return Ok(v); }
            }
            self.stop(span, "the reading of it does not end")
        })();
        let env = self.facts.env;
        let reads = std::mem::replace(&mut self.reads, was.6);
        self.cur = root;
        let what = match r {
            Err(s) => Found::Not(s),
            Ok(_) if env => Found::Not(Stop { why: "it asks where it runs".into(), module: at.module, at: span.start }),
            Ok(v) => {
                let (_, timer) = self.reaches(&v, &mut BTreeSet::new());
                if timer { Found::Not(Stop { why: "it answers a timer".into(), module: at.module, at: span.start }) }
                else { path.push("()".into()); self.part(&v, ret, path, seen, out, d + 1); path.pop(); Found::Read(reads) }
            }
        };
        self.post = was.0; self.cur = was.1; self.stack = was.2; self.narrow = was.3; self.changed = was.4; self.facts.env = was.5; self.kept = was.7;
        what
    }
    /// Whether a value holds data, and whether it holds a timer.
    fn reaches(&self, v: &Val, seen: &mut BTreeSet<u32>) -> (bool, bool) {
        let (mut d, mut t) = (false, false);
        for a in v {
            match a {
                Atom::Undef | Atom::Fun(_) | Atom::Solid(_) => {}
                Atom::Timer => { d = true; t = true; }
                Atom::Obj(o) => if seen.insert(*o) {
                    let x = &self.objs[*o as usize];
                    if matches!(x.kind, Kind::Accessor | Kind::Setter) { continue; }
                    for w in x.fields.values().chain([&x.items, &x.keys]) { let (a, b) = self.reaches(w, seen); d |= a; t |= b; }
                    if matches!(x.kind, Kind::Error | Kind::RegExp | Kind::Store) { d = true; }
                },
                _ => d = true,
            }
        }
        (d, t)
    }

    // ---- names ----
    /// What Solid exports: the functions that are called below, in every build the same; what a build decides (`isServer`,
    /// `DEV`), which is a question of where it runs; and nothing else.
    fn solid_value(&mut self, n: &str, at: Span) -> R<Val> {
        match n {
            "isServer" | "isDev" | "DEV" | "OBSERVE" => { self.facts.env = true; Ok(prim()) }
            "createSignal" | "createStore" | "createMemo" | "createEffect" | "onCleanup" | "untrack" => Ok(one(self.solid(n))),
            _ => self.stop(at, format!("it uses Solid's {n}")),
        }
    }
    fn origin(&mut self, o: &Origin<'a>, at: Span, depth: u32) -> R<Val> {
        match o {
            Origin::Symbol(mi, s) => self.module_value(*mi, *s),
            Origin::Solid(n) => self.solid_value(n, at),
            Origin::Default(mi, d) => {
                let env = self.module_act(*mi);
                let m = self.mods.get(*mi);
                if let Some(w) = m.banned { return self.stop(at, w); }
                self.facts.files.insert(m.path.clone());
                let node = match d {
                    ExportDefaultDeclarationKind::FunctionDeclaration(f) => f.scope_id.get(),
                    ExportDefaultDeclarationKind::FunctionExpression(f) => f.scope_id.get(),
                    ExportDefaultDeclarationKind::ArrowFunctionExpression(f) => f.scope_id.get(),
                    ExportDefaultDeclarationKind::Identifier(i) => { let (Some(s), 0) = (m.symbol(i), depth) else { return self.stop(at, "the default export is not known") }; return if m.known_symbol(s) { let o = self.mods.symbol(self.h, self.hi, *mi, s, &mut vec![]); self.origin(&o, at, 1) } else { self.stop(at, "the default export is a name that is written again") }; }
                    _ => None,
                };
                let Some(sc) = node else { return self.stop(at, "the default export is no function written there") };
                Ok(one(self.fun(FnAt { module: *mi, node: m.scoping.get_node_id(sc) }, env)))
            }
            Origin::Ns(_) | Origin::SolidNs => self.stop(at, "it uses a module's namespace whole"),
            Origin::Unknown(w) => self.stop(at, format!("it uses code that is not read: {w}")),
            Origin::Never => self.stop(at, "it imports what this host cannot load"),
        }
    }
    /// The value of a module's own name.
    fn module_value(&mut self, mi: usize, s: SymbolId) -> R<Val> {
        match self.module_values.get(&(mi, s)) { Some(Some(v)) => return v.clone(), Some(None) => return self.stop(Span::new(0, 0), "a value of the module that is made from itself"), None => {} }
        self.module_values.insert((mi, s), None);
        let (cur, narrow) = (self.cur, std::mem::take(&mut self.narrow));
        self.cur = self.module_act(mi);
        // (until nothing is added to what the names it was made with hold)
        let changed = self.changed;
        let mut v;
        let mut n = 0;
        loop {
            self.changed = false;
            v = self.module_value_now(mi, s);
            n += 1;
            if v.is_err() || !self.changed { break; }
            if n > 40 { v = self.stop(Span::new(0, 0), "the reading of it does not end"); break; }
        }
        self.changed = changed;
        self.cur = cur;
        self.narrow = narrow;
        self.module_values.insert((mi, s), Some(v.clone()));
        v
    }
    fn module_value_now(&mut self, mi: usize, s: SymbolId) -> R<Val> {
        let m = self.mods.get(mi);
        self.facts.files.insert(m.path.clone());
        let name = m.scoping.symbol_name(s).to_string();
        let span = m.scoping.symbol_span(s);
        if let Some(w) = m.banned { return self.stop(span, w); }
        if !m.known_symbol(s) { return self.stop(span, format!("{name} is written more than once: state that changes")); }
        let decl = m.scoping.symbol_declaration(s);
        match m.nodes.kind(decl) {
            AstKind::Function(_) => { let env = self.cur; Ok(one(self.fun(FnAt { module: mi, node: decl }, env))) }
            AstKind::Class(_) => { let env = self.cur; Ok(one(self.class(FnAt { module: mi, node: decl }, env))) }
            AstKind::VariableDeclarator(d) => {
                if !matches!(d.id, BindingPattern::BindingIdentifier(_)) { return self.stop(span, format!("{name} is taken from a value as the module loads")); }
                // (a loop's name has no value of its own)
                let Some(init) = &d.init else { return self.stop(span, format!("{name} has no value")) };
                if !matches!(m.nodes.parent_kind(m.nodes.parent_id(decl)), AstKind::Program(_) | AstKind::ExportDeclaration(_)) { return self.stop(span, format!("{name} is declared in a block")); }
                if let Some(sh) = constant::constant(m, s, init) { let e = constant::frozen(m, init).unwrap_or(init); return Ok(one(self.const_obj(mi, e, sh)?)); }
                if constant::shape(m, init).is_some() { return self.stop(span, format!("{name} is an object of the module that code may change or let go")); }
                let v = self.expr(init)?;
                if v.iter().all(|a| flat(*a) || matches!(a, Atom::Fun(_) | Atom::Native(_) | Atom::Solid(_) | Atom::Class(_))) { Ok(v) } else { self.stop(span, format!("{name} is a value made as the module loads")) }
            }
            _ => self.stop(span, format!("{name} is declared in a way that is not followed")),
        }
    }
    fn const_obj(&mut self, mi: usize, e: &Expression<'a>, shape: constant::Shape) -> R<Atom> {
        let (mut values, mut all, mut keys) = (BTreeMap::new(), vec![], vec![]);
        let m = self.mods.get(mi);
        let item = |me: &mut Self, x: &Expression<'a>, name: &str| -> R<Val> {
            match shape.nested.get(name) { Some(s) if !matches!(unwrap(x), Expression::Identifier(_)) && constant::shape(m, x).is_some() => Ok(one(me.const_obj(mi, x, s.clone())?)), _ => me.expr(x) }
        };
        match unwrap(e) {
            Expression::ObjectExpression(o) => for p in &o.properties {
                let ObjectPropertyKind::ObjectProperty(p) = p else { continue };
                let k = static_key(&p.key, p.computed).unwrap_or_default();
                let v = item(self, &p.value, &k)?;
                join(&mut all, &v);
                add(&mut keys, Atom::Prim);
                join(values.entry(k).or_insert_with(Vec::new), &v);
            },
            Expression::ArrayExpression(a) => for (i, x) in a.elements.iter().enumerate() { if let Some(x) = x.as_expression() { let v = item(self, x, &i.to_string())?; join(&mut all, &v); values.insert(i.to_string(), v); } },
            Expression::NewExpression(n) => if let Some(Expression::ArrayExpression(a)) = n.arguments.first().and_then(|a| a.as_expression()).map(unwrap) {
                for x in &a.elements {
                    let Some(x) = x.as_expression() else { continue };
                    if shape.kind == CKind::Map {
                        let Expression::ArrayExpression(pair) = unwrap(x) else { continue };
                        if let (Some(k), Some(v)) = (pair.elements[0].as_expression(), pair.elements[1].as_expression()) { let k = item(self, k, "pair")?; join(&mut keys, &k); let v = item(self, v, "pair")?; join(&mut all, &v); }
                    } else { let v = item(self, x, "item")?; join(&mut all, &v); }
                }
            },
            _ => {}
        }
        // a value that is an object by another way than a literal of this one is not known
        if all.iter().chain(&keys).any(|a| !(flat(*a) || matches!(a, Atom::Fun(_) | Atom::Native(_) | Atom::Solid(_) | Atom::Const(_) | Atom::Class(_)))) { return self.stop(e.span(), "an object of the module that holds one"); }
        // (a method's `this` is the object, wherever the function is written: a write of it that no reference shows)
        for a in &all { if let Atom::Fun(f) = a { let at = self.funs[*f as usize].at; if constant::has_this(self.mods.get(at.module), at.node) { return self.stop(e.span(), "an object of the module, a method of which uses `this`"); } } }
        self.consts.push(ConstObj { shape, values, all, keys });
        Ok(Atom::Const(self.consts.len() as u32 - 1))
    }
    fn class(&mut self, at: FnAt, env: u32) -> Atom {
        if let Some(i) = self.class_ids.get(&(at, env)) { return Atom::Class(*i); }
        self.classes.push(Cls { at, env });
        let i = self.classes.len() as u32 - 1;
        self.class_ids.insert((at, env), i);
        Atom::Class(i)
    }
    /// The scope of the function a name is declared in.
    fn home(m: &Module, s: SymbolId) -> ScopeId {
        let mut sc = m.scoping.symbol_scope_id(s);
        loop {
            let f = m.scoping.scope_flags(sc);
            if f.is_function() || f.is_top() || f.is_class_static_block() { return sc; }
            match m.scoping.scope_parent_id(sc) { Some(p) => sc = p, None => return sc }
        }
    }
    fn owner(&self, s: SymbolId) -> Option<u32> {
        let m = self.m();
        let home = Self::home(m, s);
        let mi = self.mi();
        let mut a = Some(self.cur);
        while let Some(i) = a { let x = &self.acts[i as usize]; if x.module == mi && x.scope == Some(home) { return Some(i); } a = x.parent; }
        None
    }
    fn read_name(&mut self, i: &IdentifierReference<'a>) -> R<Val> {
        let m = self.m();
        let Some(s) = m.symbol(i) else { return self.read_global(i) };
        let mi = self.mi();
        if m.imports.contains_key(&s) { let o = self.mods.symbol(self.h, self.hi, mi, s, &mut vec![]); return self.imported(&o, i); }
        if m.at_top(s) { return self.module_value(mi, s); }
        let Some(a) = self.owner(s) else { return self.stop(i.span, format!("{} is a name that is not followed", i.name)) };
        let init_now = self.acts[self.cur as usize].init;
        if self.acts[a as usize].init && !init_now {
            // what a function was made with, as the module loaded: the same at every call where nothing writes it
            if !m.known_symbol(s) { return self.stop(i.span, format!("{} is kept between calls and written: state", i.name)); }
            let v = self.acts[a as usize].vars.get(&s).cloned().unwrap_or_else(undef);
            if !v.iter().all(|a| flat(*a) || matches!(a, Atom::Fun(_) | Atom::Native(_) | Atom::Solid(_) | Atom::Class(_))) { return self.stop(i.span, format!("{} is an object kept between calls", i.name)); }
            return Ok(v);
        }
        if self.post.is_some_and(|(n, _)| a < n) && !m.known_symbol(s) { return self.stop(i.span, format!("{} is kept between calls of it and written: state", i.name)); }
        let mut v = self.acts[a as usize].vars.get(&s).cloned().unwrap_or_else(undef);
        if m.known_symbol(s) { for (nm, ns, n) in self.narrow.iter().filter(|(nm, ns, _)| *nm == mi && *ns == s).cloned().collect::<Vec<_>>() { let _ = (nm, ns); v = self.narrowed(&v, n); } }
        Ok(v)
    }
    fn imported(&mut self, o: &Origin<'a>, i: &IdentifierReference<'a>) -> R<Val> {
        self.origin(o, i.span, 0)
    }
    fn read_global(&mut self, i: &IdentifierReference<'a>) -> R<Val> {
        let m = self.m();
        if let Some(w) = m.banned { return self.stop(i.span, w); }
        match i.name.as_str() {
            "undefined" => Ok(undef()),
            "NaN" | "Infinity" => Ok(num()),
            n if BUILTIN_VALUES.contains(&n) => Ok(one(self.native(n))),
            n => self.stop(i.span, format!("it reads {n}: the environment")),
        }
    }
    fn write_name(&mut self, i: &IdentifierReference<'a>, v: &Val) -> R<()> {
        let m = self.m();
        let Some(s) = m.symbol(i) else { return self.stop(i.span, format!("it writes {}, a global", i.name)) };
        self.write_symbol(s, v, i.span)
    }
    fn write_symbol(&mut self, s: SymbolId, v: &Val, at: Span) -> R<()> {
        let m = self.m();
        let name = m.scoping.symbol_name(s);
        let a = if m.at_top(s) || m.imports.contains_key(&s) { None } else { self.owner(s) };
        let Some(a) = a else { return self.stop(at, format!("it writes {name}, a variable of the module")) };
        if self.acts[a as usize].init && !self.acts[self.cur as usize].init { return self.stop(at, format!("it writes {name}, which is kept between calls")); }
        if self.post.is_some_and(|(n, _)| a < n) { return self.stop(at, format!("it writes {name}, which is kept between calls of it")); }
        if join(self.acts[a as usize].vars.entry(s).or_default(), v) { self.changed = true; }
        Ok(())
    }
    fn narrowed(&self, v: &Val, n: Narrow) -> Val {
        let mut out = vec![];
        for a in v {
            let t = match a { Atom::Param(t, _) => Some(self.ty(*t)), _ => None };
            match (n, t) {
                (Narrow::Num, Some(_)) => { add(&mut out, Atom::Num); }
                (Narrow::Prim, Some(_)) => { add(&mut out, Atom::Prim); }
                (Narrow::Num | Narrow::Prim, None) => if flat(*a) { add(&mut out, *a); } else if matches!(a, Atom::Opaque) { add(&mut out, Atom::Prim); },
                (Narrow::Fn, Some(Ty::Arr(_) | Ty::Tuple(_) | Ty::Rest(_) | Ty::Map(..) | Ty::Set(_) | Ty::Promise(_))) => {}
                (Narrow::NotFn, Some(Ty::Fn { .. })) => {}
                (Narrow::NotList, Some(Ty::Arr(_) | Ty::Tuple(_) | Ty::Rest(_))) => {}
                (Narrow::List, Some(Ty::Arr(_) | Ty::Tuple(_) | Ty::Rest(_))) => { add(&mut out, *a); }
                (Narrow::List, Some(_)) => { if let Atom::Param(_, d) = a { let _ = d; add(&mut out, Atom::Param(ANY, 3)); } }
                (Narrow::Fn | Narrow::List, None) if flat(*a) => {}
                _ => { add(&mut out, *a); }
            }
        }
        out
    }
    /// What a test shows of names where it holds, and where it does not.
    fn shown(&mut self, e: &Expression<'a>, holds: bool, out: &mut Vec<(usize, SymbolId, Narrow)>) {
        let mi = self.mi();
        let m = self.m();
        match unwrap(e) {
            Expression::UnaryExpression(u) if u.operator == UnaryOperator::LogicalNot => self.shown(&u.argument, !holds, out),
            Expression::LogicalExpression(l) if (l.operator == LogicalOperator::And) == holds && l.operator != LogicalOperator::Coalesce => { self.shown(&l.left, holds, out); self.shown(&l.right, holds, out); }
            Expression::BinaryExpression(b) if matches!(b.operator, BinaryOperator::StrictEquality | BinaryOperator::Equality | BinaryOperator::StrictInequality | BinaryOperator::Inequality) => {
                let yes = matches!(b.operator, BinaryOperator::StrictEquality | BinaryOperator::Equality) == holds;
                let (Expression::UnaryExpression(u), Expression::StringLiteral(s)) = (unwrap(&b.left), unwrap(&b.right)) else { return };
                if u.operator != UnaryOperator::Typeof { return; }
                let Expression::Identifier(i) = unwrap(&u.argument) else { return };
                let Some(sym) = m.symbol(i) else { return };
                let n = match (s.value.as_str(), yes) { ("number", true) => Narrow::Num, ("string" | "boolean" | "bigint" | "symbol", true) => Narrow::Prim, ("function", true) => Narrow::Fn, ("function", false) => Narrow::NotFn, _ => return };
                out.push((mi, sym, n));
            }
            Expression::CallExpression(c) => {
                let Expression::StaticMemberExpression(k) = &c.callee else { return };
                let (Expression::Identifier(o), Some(Expression::Identifier(i))) = (&k.object, c.arguments.first().and_then(|a| a.as_expression()).map(unwrap)) else { return };
                if !m.is_global(o, "Array") || k.property.name != "isArray" { return; }
                if let Some(sym) = m.symbol(i) { out.push((mi, sym, if holds { Narrow::List } else { Narrow::NotList })); }
            }
            _ => {}
        }
    }
    fn under<T>(&mut self, test: &Expression<'a>, holds: bool, f: impl FnOnce(&mut Self) -> R<T>) -> R<T> {
        let mut n = vec![];
        self.shown(test, holds, &mut n);
        let len = self.narrow.len();
        self.narrow.extend(n);
        let r = f(self);
        self.narrow.truncate(len);
        r
    }

    // ---- expressions ----
    pub fn expr(&mut self, e: &Expression<'a>) -> R<Val> {
        if self.fuel == 0 { return self.stop(e.span(), "the reading of it is too long"); }
        self.fuel -= 1;
        match e {
            Expression::BooleanLiteral(_) | Expression::StringLiteral(_) | Expression::BigIntLiteral(_) => Ok(prim()),
            Expression::NullLiteral(_) => Ok(prim()),
            Expression::NumericLiteral(_) => Ok(num()),
            Expression::RegExpLiteral(_) => { let o = self.made(e.span(), 0, Kind::RegExp); Ok(one(Atom::Obj(o))) }
            Expression::TemplateLiteral(t) => { for x in &t.expressions { let v = self.expr(x)?; self.converted(&v, x.span())?; } Ok(prim()) }
            Expression::Identifier(i) => self.read_name(i),
            Expression::ParenthesizedExpression(p) => self.expr(&p.expression),
            Expression::TSAsExpression(p) => self.expr(&p.expression),
            Expression::TSSatisfiesExpression(p) => self.expr(&p.expression),
            Expression::TSNonNullExpression(p) => self.expr(&p.expression),
            Expression::TSTypeAssertion(p) => self.expr(&p.expression),
            Expression::ArrayExpression(a) => {
                let o = self.made(a.span, 0, Kind::Array);
                for (i, x) in a.elements.iter().enumerate() {
                    let v = match x { ArrayExpressionElement::SpreadElement(s) => { let v = self.expr(&s.argument)?; self.iterated(&v, s.span)? } ArrayExpressionElement::Elision(_) => undef(), x => { let v = self.expr(x.to_expression())?; self.put_place(o, i, &v); v } };
                    self.put_items(o, &v);
                }
                // (an array written with no spread knows what stands where, until it is changed)
                if a.elements.iter().any(|x| x.is_spread()) { self.drop_places(o); }
                Ok(one(Atom::Obj(o)))
            }
            Expression::ObjectExpression(x) => self.object(x),
            Expression::FunctionExpression(f) => self.closure(f.scope_id.get(), f.span),
            Expression::ArrowFunctionExpression(f) => self.closure(f.scope_id.get(), f.span),
            Expression::ClassExpression(c) => self.stop(c.span, "a class made in the call"),
            Expression::AssignmentExpression(a) => self.assign(a),
            Expression::AwaitExpression(a) => { let v = self.expr(&a.argument)?; if !self.acts[self.cur as usize].waits { self.acts[self.cur as usize].waits = true; self.changed = true; } self.awaited(&v, a.span) }
            Expression::BinaryExpression(b) => self.binary(b),
            Expression::ChainExpression(c) => {
                let mut v = match &c.expression { ChainElement::CallExpression(c) => self.call(c)?, ChainElement::TSNonNullExpression(x) => self.expr(&x.expression)?, x => self.member(x.to_member_expression())? };
                add(&mut v, Atom::Undef);
                Ok(v)
            }
            Expression::CallExpression(c) => self.call(c),
            Expression::NewExpression(n) => self.construct(n),
            Expression::ConditionalExpression(c) => {
                self.expr(&c.test)?;
                let mut v = self.under(&c.test, true, |s| s.expr(&c.consequent))?;
                let w = self.under(&c.test, false, |s| s.expr(&c.alternate))?;
                join(&mut v, &w);
                Ok(v)
            }
            Expression::LogicalExpression(l) => {
                let mut v = self.expr(&l.left)?;
                let w = match l.operator { LogicalOperator::And => self.under(&l.left, true, |s| s.expr(&l.right))?, LogicalOperator::Or => self.under(&l.left, false, |s| s.expr(&l.right))?, LogicalOperator::Coalesce => self.expr(&l.right)? };
                if l.operator != LogicalOperator::And { v.retain(|a| *a != Atom::Undef); }
                join(&mut v, &w);
                Ok(v)
            }
            Expression::SequenceExpression(s) => { let mut v = undef(); for x in &s.expressions { v = self.expr(x)?; } Ok(v) }
            Expression::UnaryExpression(u) => self.unary(u),
            Expression::UpdateExpression(u) => {
                let v = match &u.argument { SimpleAssignmentTarget::AssignmentTargetIdentifier(i) => self.read_name(i)?, t => match t.as_member_expression() { Some(m) => self.member(m)?, None => return self.stop(u.span, "a write that is not followed") } };
                self.converted(&v, u.span)?;
                match &u.argument { SimpleAssignmentTarget::AssignmentTargetIdentifier(i) => self.write_name(i, &num())?, t => if let Some(m) = t.as_member_expression() { self.write_member(m, &num())? } }
                Ok(num())
            }
            e if e.is_member_expression() => self.member(e.to_member_expression()),
            Expression::ThisExpression(t) => match self.this() { Some(v) => Ok(v), None => self.stop(t.span, "it uses `this`") },
            Expression::JSXElement(x) => self.stop(x.span, "it makes a view"),
            Expression::JSXFragment(x) => self.stop(x.span, "it makes a view"),
            e => self.stop(e.span(), "an expression that is not followed"),
        }
    }
    fn this(&self) -> Option<Val> {
        // an arrow's is its function's
        let mut a = self.cur;
        loop {
            let x = &self.acts[a as usize];
            if let Some(t) = &x.this { return Some(t.clone()); }
            let m = self.mods.get(x.module);
            let arrow = x.scope.is_some_and(|s| matches!(m.nodes.kind(m.scoping.get_node_id(s)), AstKind::ArrowFunctionExpression(_)));
            if !arrow { return None; }
            a = x.parent?;
        }
    }
    fn closure(&mut self, scope: Option<ScopeId>, at: Span) -> R<Val> {
        let Some(s) = scope else { return self.stop(at, "a function that is not read") };
        let node = self.m().scoping.get_node_id(s);
        let (module, env) = (self.mi(), self.cur);
        Ok(one(self.fun(FnAt { module, node }, env)))
    }
    fn object(&mut self, x: &ObjectExpression<'a>) -> R<Val> {
        let o = self.made(x.span, 0, Kind::Plain);
        for p in &x.properties {
            match p {
                ObjectPropertyKind::SpreadProperty(s) => {
                    let v = self.expr(&s.argument)?;
                    for a in v.clone() {
                        match a {
                            a if flat(a) => {}
                            Atom::Param(..) => {
                                let f = self.spread_param(a);
                                for (k, v) in f.0 { self.put_field(o, &k, &v); }
                                if f.1 { self.put_items(o, &one(Atom::Param(ANY, 3))); }
                            }
                            Atom::Obj(p) => {
                                self.own(p, s.span)?;
                                let src = &self.objs[p as usize];
                                if !matches!(src.kind, Kind::Plain | Kind::Array | Kind::Error) || !src.getters.is_empty() || src.wild { return self.stop(s.span, "it spreads an object that runs code, or is not known"); }
                                let (fs, it) = (src.fields.clone(), src.items.clone());
                                for (k, v) in fs { self.put_field(o, &k, &v); }
                                self.put_items(o, &it);
                            }
                            // (a built-in's function has nothing of its own to spread)
                            Atom::Native(_) => {}
                            Atom::Const(c) => { let c = &self.consts[c as usize]; if c.shape.holds_object || c.shape.kind != CKind::Plain { return self.stop(s.span, "it spreads an object of the module's"); } for (k, v) in c.values.clone() { self.put_field(o, &k, &v); } }
                            _ => return self.stop(s.span, "it spreads a value that is not known"),
                        }
                    }
                }
                ObjectPropertyKind::ObjectProperty(p) => {
                    let Some(k) = static_key(&p.key, p.computed) else {
                        if matches!(p.key, PropertyKey::PrivateIdentifier(_)) { return self.stop(p.span, "a private name"); }
                        let v = self.expr(p.key.to_expression())?;
                        self.converted(&v, p.span)?;
                        self.computed_key(o, &p.value, p.kind, p.span)?;
                        continue;
                    };
                    if reserved(&k) { return self.stop(p.span, format!("it makes an object with {k}")); }
                    let v = self.expr(&p.value)?;
                    match p.kind {
                        PropertyKind::Init => self.put_field(o, &k, &v),
                        PropertyKind::Get => { self.objs[o as usize].getters.insert(k.clone()); self.put_field(o, &k, &v); }
                        PropertyKind::Set => return self.stop(p.span, "it makes an object with a setter"),
                    }
                }
            }
        }
        Ok(one(Atom::Obj(o)))
    }
    fn computed_key(&mut self, o: u32, value: &Expression<'a>, kind: PropertyKind, at: Span) -> R<()> {
        // (a name that is computed in a literal is an own property, whatever it is)
        if kind != PropertyKind::Init { return self.stop(at, "it makes an object with a getter whose name is computed"); }
        let v = self.expr(value)?;
        // `[Symbol.iterator]`, `then`, `valueOf`: an object that holds a function under a name that is computed is not followed
        if !prims(&v) { self.objs[o as usize].wild = true; }
        self.put_items(o, &v);
        Ok(())
    }
    /// The fields of an argument that is spread, as its type has them, and whether it may have others.
    fn spread_param(&self, a: Atom) -> (Vec<(String, Val)>, bool) {
        let Atom::Param(t, d) = a else { return (vec![], true) };
        match self.ty(t) { Ty::Rec(f) => (f.iter().map(|(k, t)| { let mut v = self.of_type(*t, (d + 1).max(2)); add(&mut v, Atom::Undef); (k.clone(), v) }).collect(), true), _ => (vec![], true) }
    }
    /// A value made a primitive: one that is.
    fn converted(&self, v: &Val, at: Span) -> R<()> { if prims(v) { Ok(()) } else { self.stop(at, "it converts a value that may run code (`toString`, `valueOf`)") } }
    fn binary(&mut self, b: &BinaryExpression<'a>) -> R<Val> {
        use BinaryOperator as B;
        if b.operator == B::Instanceof {
            let l = self.expr(&b.left)?;
            let r = self.expr(&b.right)?;
            if l.iter().any(|a| matches!(a, Atom::Opaque)) { return self.stop(b.span, "`instanceof` of a value that is not known"); }
            for a in &r {
                match a {
                    Atom::Native(n) if matches!(self.natives[*n as usize].as_str(), "Array" | "Map" | "Set" | "Promise" | "Error" | "TypeError" | "RangeError" | "RegExp" | "Object" | "WeakMap" | "WeakSet") => {}
                    Atom::Class(c) => self.plain_class(*c, b.span)?,
                    _ => return self.stop(b.span, "`instanceof` of a value that may run code"),
                }
            }
            return Ok(prim());
        }
        let l = self.expr(&b.left)?;
        let r = self.expr(&b.right)?;
        let nullish = |e: &Expression| matches!(unwrap(e), Expression::NullLiteral(_)) || matches!(unwrap(e), Expression::Identifier(i) if i.name == "undefined");
        match b.operator {
            B::StrictEquality | B::StrictInequality => Ok(prim()),
            B::Equality | B::Inequality if nullish(&b.left) || nullish(&b.right) => Ok(prim()),
            B::In => {
                self.converted(&l, b.span)?;
                for a in &r { match a { Atom::Param(t, _) if !matches!(self.ty(*t), Ty::Other) => {} Atom::Obj(o) if !matches!(self.objs[*o as usize].kind, Kind::Store) => self.own(*o, b.span)?, Atom::Const(_) => {} a if flat(*a) => {} _ => return self.stop(b.span, "`in` a value that is not known") } }
                Ok(prim())
            }
            B::Addition => { self.converted(&l, b.span)?; self.converted(&r, b.span)?; Ok(if l == num() && r == num() { num() } else { prim() }) }
            B::Subtraction | B::Multiplication | B::Division | B::Remainder | B::Exponential | B::ShiftLeft | B::ShiftRight | B::ShiftRightZeroFill | B::BitwiseAnd | B::BitwiseOR | B::BitwiseXOR => { self.converted(&l, b.span)?; self.converted(&r, b.span)?; Ok(num()) }
            _ => { self.converted(&l, b.span)?; self.converted(&r, b.span)?; Ok(prim()) }
        }
    }
    fn unary(&mut self, u: &UnaryExpression<'a>) -> R<Val> {
        match u.operator {
            UnaryOperator::Typeof => {
                if let Expression::Identifier(i) = unwrap(&u.argument) {
                    if self.m().symbol(i).is_none() { if !BUILTIN_VALUES.contains(&i.name.as_str()) && !matches!(i.name.as_str(), "undefined" | "NaN" | "Infinity") { self.facts.env = true; } return Ok(prim()); }
                }
                self.expr(&u.argument)?;
                Ok(prim())
            }
            UnaryOperator::Void => { self.expr(&u.argument)?; Ok(undef()) }
            UnaryOperator::LogicalNot => { self.expr(&u.argument)?; Ok(prim()) }
            UnaryOperator::Delete => match unwrap(&u.argument) {
                Expression::ChainExpression(_) => self.stop(u.span, "a `delete` that is not followed"),
                e if e.is_member_expression() => { self.write_member(e.to_member_expression(), &undef())?; Ok(prim()) }
                _ => self.stop(u.span, "a `delete` that is not followed"),
            },
            _ => { let v = self.expr(&u.argument)?; self.converted(&v, u.span)?; Ok(num()) }
        }
    }
    fn assign(&mut self, a: &AssignmentExpression<'a>) -> R<Val> {
        match a.operator {
            AssignmentOperator::Assign => { let v = self.expr(&a.right)?; self.write_target(&a.left, &v)?; Ok(v) }
            op => {
                let old = match &a.left { AssignmentTarget::AssignmentTargetIdentifier(i) => self.read_name(i)?, t => match t.as_member_expression() { Some(m) => self.member(m)?, None => return self.stop(a.span, "a write that is not followed") } };
                let r = self.expr(&a.right)?;
                let v = if op.is_logical() { let mut v = old.clone(); join(&mut v, &r); v } else { self.converted(&old, a.span)?; self.converted(&r, a.span)?; if op != AssignmentOperator::Addition || (old == num() && r == num()) { num() } else { prim() } };
                self.write_target(&a.left, if op.is_logical() { &r } else { &v })?;
                Ok(v)
            }
        }
    }
    fn write_target(&mut self, t: &AssignmentTarget<'a>, v: &Val) -> R<()> {
        match t {
            AssignmentTarget::AssignmentTargetIdentifier(i) => self.write_name(i, v),
            AssignmentTarget::ArrayAssignmentTarget(p) => {
                let items = self.iterated(v, p.span)?;
                for (i, x) in p.elements.iter().enumerate() { if let Some(x) = x { let w = self.item(v, i, &items); self.write_maybe(x, &w)?; } }
                if let Some(r) = &p.rest { let w = self.new_array(r.span, 3, items); self.write_target(&r.target, &w)?; }
                Ok(())
            }
            AssignmentTarget::ObjectAssignmentTarget(p) => {
                for x in &p.properties {
                    match x {
                        AssignmentTargetProperty::AssignmentTargetPropertyIdentifier(x) => {
                            let mut w = self.prop(v, &x.binding.name, x.span)?;
                            if let Some(d) = &x.init { let d = self.expr(d)?; join(&mut w, &d); }
                            self.write_name(&x.binding, &w)?;
                        }
                        AssignmentTargetProperty::AssignmentTargetPropertyProperty(x) => { let w = self.keyed(v, &x.name, x.computed, x.span)?; self.write_maybe(&x.binding, &w)?; }
                    }
                }
                if let Some(r) = &p.rest { let w = self.rest_of(v, r.span)?; self.write_target(&r.target, &w)?; }
                Ok(())
            }
            t => match t.as_member_expression() { Some(m) => self.write_member(m, v), None => self.stop(t.span(), "a write that is not followed") },
        }
    }
    fn write_maybe(&mut self, t: &AssignmentTargetMaybeDefault<'a>, v: &Val) -> R<()> {
        match t {
            AssignmentTargetMaybeDefault::AssignmentTargetWithDefault(d) => { let mut w = v.clone(); let x = self.expr(&d.init)?; join(&mut w, &x); self.write_target(&d.binding, &w) }
            t => self.write_target(t.to_assignment_target(), v),
        }
    }
    fn keyed(&mut self, v: &Val, k: &PropertyKey<'a>, computed: bool, at: Span) -> R<Val> {
        match static_key(k, computed) { Some(n) => self.prop(v, &n, at), None => match k { PropertyKey::PrivateIdentifier(_) => self.stop(at, "a private name"), k => { let key = self.expr(k.to_expression())?; self.index(v, &key, None, at) } } }
    }
    fn rest_of(&mut self, v: &Val, at: Span) -> R<Val> {
        let o = self.made(at, 4, Kind::Plain);
        for a in v.clone() { match a {
            a if flat(a) => {}
            Atom::Param(..) => { let f = self.spread_param(a); for (k, v) in f.0 { self.put_field(o, &k, &v); } self.put_items(o, &one(Atom::Param(ANY, 3))); }
            Atom::Obj(p) => { self.own(p, at)?; let s = &self.objs[p as usize]; if !matches!(s.kind, Kind::Plain) || !s.getters.is_empty() || s.wild { return self.stop(at, "the rest of an object that is not known"); } let (fs, it) = (s.fields.clone(), s.items.clone()); for (k, v) in fs { self.put_field(o, &k, &v); } self.put_items(o, &it); }
            Atom::Const(c) => { let vs = self.consts[c as usize].values.clone(); if self.consts[c as usize].shape.holds_object { return self.stop(at, "the rest of an object of the module's"); } for (k, v) in vs { self.put_field(o, &k, &v); } }
            _ => return self.stop(at, "the rest of a value that is not known"),
        } }
        Ok(one(Atom::Obj(o)))
    }
    /// One item of what a pattern takes apart.
    fn item(&self, v: &Val, i: usize, items: &Val) -> Val {
        if let [Atom::Obj(o)] = v[..] { let x = &self.objs[o as usize]; if let Some(w) = x.places.get(&i) { return w.clone(); } }
        if let [Atom::Param(t, d)] = v[..] { if let Ty::Tuple(es) = self.ty(t) { return es.get(i).map_or_else(undef, |e| { let mut v = self.of_type(*e, (d + 1).max(2)); add(&mut v, Atom::Undef); v }); } }
        let mut w = items.clone();
        add(&mut w, Atom::Undef);
        w
    }
    fn bind(&mut self, p: &BindingPattern<'a>, v: &Val) -> R<()> {
        match p {
            BindingPattern::BindingIdentifier(b) => { let Some(s) = b.symbol_id.get() else { return Ok(()) }; let a = self.cur; let own = self.owner(s).unwrap_or(a); if join(self.acts[own as usize].vars.entry(s).or_default(), v) { self.changed = true; } Ok(()) }
            BindingPattern::AssignmentPattern(x) => { let mut w = v.clone(); let d = self.expr(&x.right)?; join(&mut w, &d); self.bind(&x.left, &w) }
            BindingPattern::ObjectPattern(x) => {
                for p in &x.properties { let w = self.keyed(v, &p.key, p.computed, p.span)?; self.bind(&p.value, &w)?; }
                if let Some(r) = &x.rest { let w = self.rest_of(v, r.span)?; self.bind(&r.argument, &w)?; }
                Ok(())
            }
            BindingPattern::ArrayPattern(x) => {
                let items = self.iterated(v, x.span)?;
                for (i, p) in x.elements.iter().enumerate() { if let Some(p) = p { let w = self.item(v, i, &items); self.bind(p, &w)?; } }
                if let Some(r) = &x.rest { let w = self.new_array(r.span, 3, items); self.bind(&r.argument, &w)?; }
                Ok(())
            }
        }
    }

    // ---- members ----
    fn member(&mut self, e: &MemberExpression<'a>) -> R<Val> {
        match e {
            MemberExpression::StaticMemberExpression(p) => {
                // a namespace's member: an export of the module
                if let Expression::Identifier(i) = unwrap(&p.object) { if let Some(v) = self.ns_member(i, &p.property.name, p.span)? { return Ok(v); } }
                let o = self.expr(&p.object)?;
                self.prop(&o, &p.property.name, p.span)
            }
            MemberExpression::ComputedMemberExpression(p) => {
                let o = self.expr(&p.object)?;
                if let Expression::StringLiteral(s) = unwrap(&p.expression) { return self.prop(&o, &s.value, p.span); }
                let k = self.expr(&p.expression)?;
                let lit = if let Expression::NumericLiteral(n) = unwrap(&p.expression) { Some(n.value as usize) } else { None };
                self.index(&o, &k, lit, p.span)
            }
            MemberExpression::PrivateFieldExpression(p) => { let o = self.expr(&p.object)?; self.private(&o, &p.field.name, p.span) }
        }
    }
    fn ns_member(&mut self, i: &IdentifierReference<'a>, name: &str, at: Span) -> R<Option<Val>> {
        let m = self.m();
        let Some(s) = m.symbol(i) else { return Ok(None) };
        let Some(im) = m.imports.get(&s) else { return Ok(None) };
        if im.name.is_some() { return Ok(None); }
        let mi = self.mi();
        let o = match self.mods.symbol(self.h, self.hi, mi, s, &mut vec![]) {
            Origin::SolidNs => return self.solid_value(name, at).map(Some),
            Origin::Ns(i) => self.mods.exported(self.h, self.hi, i, name, &mut vec![]),
            o => return self.origin(&o, at, 0).map(Some),
        };
        self.imported(&o, i).map(Some)
    }
    fn prop(&mut self, v: &Val, name: &str, at: Span) -> R<Val> {
        let mut out = vec![];
        if v.is_empty() { return Ok(out); }
        for a in v.clone() {
            match a {
                a if flat(a) => {
                    if name == "length" { add(&mut out, Atom::Num); }
                    else if reserved(name) || OBJECT_PROTO.contains(&name) || STR_METHODS.contains(&name) || REGEXP_IN_STRING.contains(&name) { return self.stop(at, format!("it takes a built-in's method off a value (.{name})")); }
                    else { add(&mut out, Atom::Undef); add(&mut out, Atom::Prim); }
                }
                Atom::Param(t, d) => {
                    if reserved(name) { return self.stop(at, format!("it reads .{name} of an argument")); }
                    let w = match self.ty(t) {
                        Ty::Any | Ty::Param => one(Atom::Param(ANY, 3)),
                        Ty::Rec(f) => match f.get(name) { Some(x) => self.of_type(*x, d + 1), None => one(Atom::Param(ANY, 3)) },
                        Ty::Arr(_) | Ty::Tuple(_) | Ty::Rest(_) if name == "length" => num(),
                        Ty::Map(..) | Ty::Set(_) if name == "size" => num(),
                        Ty::Fn { .. } if matches!(name, "length" | "name") => one(Atom::Param(ANY, 3)),
                        _ => return self.stop(at, format!("it reads .{name} of an argument that is no data")),
                    };
                    join(&mut out, &w);
                }
                Atom::Obj(o) => {
                    self.own(o, at)?;
                    let x = &self.objs[o as usize];
                    if x.wild || x.getters.contains(name) { return self.stop(at, format!("it reads .{name} of an object where that may run code")); }
                    match (&x.kind, name) {
                        (Kind::Plain | Kind::Error, n) => {
                            let found = x.fields.get(n).cloned();
                            let items = x.items.clone();
                            match (&x.kind, &found) {
                                (_, None) if x.class.is_some() => return self.stop(at, format!("it reads .{n} of an instance, which may be its class's")),
                                (Kind::Error, None) if matches!(n, "message" | "name") => { add(&mut out, Atom::Prim); }
                                (Kind::Error, None) if x.class.is_none() || matches!(n, "stack") || OBJECT_PROTO.contains(&n) || reserved(n) => return self.stop(at, format!("it reads .{n} of an error")),
                                (_, None) if reserved(n) || OBJECT_PROTO.contains(&n) => return self.stop(at, format!("it reads .{n} of an object")),
                                (_, None) => { add(&mut out, Atom::Undef); join(&mut out, &items); }
                                (_, Some(w)) => { join(&mut out, w); join(&mut out, &items); }
                            }
                        }
                        (Kind::Array, "length") | (Kind::Map | Kind::Set, "size") => { add(&mut out, Atom::Num); }
                        _ => return self.stop(at, format!("it reads .{name} of a value that is not followed there")),
                    }
                }
                Atom::Const(c) => {
                    let c = &self.consts[c as usize];
                    match (c.shape.kind, name) {
                        (CKind::Plain, n) => match c.values.get(n) { Some(w) => { join(&mut out, w); } None if reserved(n) || OBJECT_PROTO.contains(&n) => return self.stop(at, format!("it reads .{n} of an object")), None => { add(&mut out, Atom::Undef); } },
                        (CKind::Array, "length") | (CKind::Map | CKind::Set, "size") => { add(&mut out, Atom::Num); }
                        (CKind::RegExp { .. }, "source" | "flags") => { add(&mut out, Atom::Prim); }
                        _ => return self.stop(at, format!("it reads .{name} of an object of the module's")),
                    }
                }
                Atom::Native(n) => {
                    let base = self.natives[n as usize].clone();
                    match (base.as_str(), name) {
                        ("Math", "PI" | "E" | "LN2" | "LN10" | "LOG2E" | "LOG10E" | "SQRT2" | "SQRT1_2") | ("Number", "EPSILON" | "MAX_SAFE_INTEGER" | "MIN_SAFE_INTEGER" | "MAX_VALUE" | "MIN_VALUE" | "POSITIVE_INFINITY" | "NEGATIVE_INFINITY" | "NaN") => { add(&mut out, Atom::Num); }
                        ("Math" | "JSON" | "Object" | "Array" | "Number" | "String" | "Promise", m) if native_fn(&format!("{base}.{m}")) => { let x = self.native(&format!("{base}.{m}")); add(&mut out, x); }
                        _ => return self.stop(at, format!("it reads {base}.{name}")),
                    }
                }
                Atom::Fun(_) | Atom::Class(_) | Atom::Solid(_) => return self.stop(at, format!("it reads .{name} of a function or a class, which may be changed")),
                _ => return self.stop(at, format!("it reads .{name} of a value that is not known")),
            }
        }
        Ok(out)
    }
    fn index(&mut self, v: &Val, k: &Val, lit: Option<usize>, at: Span) -> R<Val> {
        self.converted(k, at)?;
        let number = *k == num();
        let mut out = vec![];
        // under a name that is computed there may be a member of the built-in prototype: one of the language's functions
        let member = self.native("?");
        for a in v.clone() {
            match a {
                a if flat(a) => { add(&mut out, if number { Atom::Prim } else { member }); }
                Atom::Param(t, d) => match self.ty(t) {
                    Ty::Arr(e) => { let w = self.of_type(*e, (d + 1).max(2)); join(&mut out, &w); add(&mut out, if number { Atom::Undef } else { member }); }
                    Ty::Rest(e) => { let w = self.of_type(*e, 1); join(&mut out, &w); add(&mut out, if number { Atom::Undef } else { member }); }
                    Ty::Tuple(es) => { for (i, e) in es.iter().enumerate() { if lit.is_none_or(|l| l == i) { let w = self.of_type(*e, (d + 1).max(2)); join(&mut out, &w); } } add(&mut out, if number { Atom::Undef } else { member }); }
                    Ty::Any | Ty::Param | Ty::Rec(_) => { add(&mut out, Atom::Param(ANY, 3)); }
                    _ => return self.stop(at, "it reads a part of an argument that is no data"),
                },
                Atom::Obj(o) => {
                    self.own(o, at)?;
                    let x = &self.objs[o as usize];
                    if x.wild || !x.getters.is_empty() { return self.stop(at, "it reads a part of an object where that may run code"); }
                    match x.kind {
                        Kind::Array => {
                            match lit.and_then(|l| x.places.get(&l)) { Some(w) => { let w = w.clone(); join(&mut out, &w); } None => { let w = x.items.clone(); join(&mut out, &w); add(&mut out, Atom::Undef); } }
                            if !number { add(&mut out, member); }
                        }
                        Kind::Plain => { let mut w = x.items.clone(); for f in x.fields.values() { join(&mut w, f); } join(&mut out, &w); add(&mut out, if number { Atom::Undef } else { member }); }
                        _ => return self.stop(at, "it reads a part of a value that is not followed there"),
                    }
                }
                Atom::Const(c) => { let c = &self.consts[c as usize]; if !matches!(c.shape.kind, CKind::Plain | CKind::Array) { return self.stop(at, "it reads a part of an object of the module's"); } let w = c.all.clone(); join(&mut out, &w); add(&mut out, if number { Atom::Undef } else { member }); }
                _ => return self.stop(at, "it reads a part of a value that is not known"),
            }
        }
        Ok(out)
    }
    fn write_member(&mut self, e: &MemberExpression<'a>, w: &Val) -> R<()> {
        let (obj, key, at): (&Expression<'a>, Result<String, (Val, Option<usize>)>, Span) = match e {
            MemberExpression::StaticMemberExpression(p) => (&p.object, Ok(p.property.name.to_string()), p.span),
            MemberExpression::PrivateFieldExpression(p) => {
                let o = self.expr(&p.object)?;
                for a in o { let Atom::Obj(i) = a else { return self.stop(p.span, "a private name of what is not its own") }; if self.objs[i as usize].module && !self.acts[self.cur as usize].init { return self.stop(p.span, "it may change an object the module made as it loaded"); } if !self.objs[i as usize].private.contains_key(p.field.name.as_str()) { return self.stop(p.span, "a private name that is not a field"); } self.wrote(i, p.span)?; self.put_private(i, &p.field.name, w); }
                return Ok(());
            }
            MemberExpression::ComputedMemberExpression(p) => match unwrap(&p.expression) {
                Expression::StringLiteral(s) => (&p.object, Ok(s.value.to_string()), p.span),
                x => { let k = self.expr(x)?; self.converted(&k, p.span)?; (&p.object, Err((k, None)), p.span) }
            },
        };
        let o = self.expr(obj)?;
        for a in o {
            match a {
                a if flat(a) => {}
                Atom::Obj(i) => {
                    if self.objs[i as usize].module && !self.acts[self.cur as usize].init { return self.stop(at, "it may change an object the module made as it loaded"); }
                    match (&key, &self.objs[i as usize].kind) {
                        (Ok(k), Kind::Plain | Kind::Error) => { if reserved(k) || self.objs[i as usize].getters.contains(k) || self.objs[i as usize].wild { return self.stop(at, format!("it writes .{k}")); } let k = k.clone(); self.wrote(i, at)?; self.put_field(i, &k, w); }
                        (Ok(k), Kind::Array) if k == "length" => { self.converted(w, at)?; self.drop_places(i); self.wrote(i, at)?; }
                        (Err((k, _)), Kind::Array) => {
                            if *k != num() && !prims(w) { return self.stop(at, "it writes a list under a name that is computed"); }
                            self.wrote(i, at)?;
                            self.drop_places(i);
                            self.put_items(i, w);
                        }
                        (Err((k, _)), Kind::Plain) => { self.wrote(i, at)?; if *k != num() && !prims(w) && !self.objs[i as usize].wild { self.objs[i as usize].wild = true; self.changed = true; } self.put_items(i, w); }
                        _ => return self.stop(at, "it may change a value that is not followed there"),
                    }
                }
                Atom::Param(t, _) if matches!(self.ty(t), Ty::Other) => return self.stop(at, "it may change an object it was given: a class's, or the platform's"),
                Atom::Param(..) => return self.stop(at, "it may change what it was given"),
                _ => return self.stop(at, "it may change a value that is not of the call"),
            }
        }
        Ok(())
    }
    /// A list that is changed no longer knows what stands where.
    fn drop_places(&mut self, o: u32) { let x = &mut self.objs[o as usize]; if x.kind == Kind::Array && !x.moved { let all = std::mem::take(&mut x.places); for f in all.values() { join(&mut x.items, f); } x.moved = true; self.changed = true; } }
    fn put_place(&mut self, o: u32, i: usize, v: &Val) { let x = &mut self.objs[o as usize]; if !x.moved && join(x.places.entry(i).or_default(), v) { self.changed = true; } }
    fn private(&mut self, v: &Val, name: &str, at: Span) -> R<Val> {
        let mut out = vec![];
        for a in v.clone() { let Atom::Obj(o) = a else { return self.stop(at, "a private name of what is not its own") }; self.own(o, at)?; match self.objs[o as usize].private.get(name) { Some(w) => { join(&mut out, &w.clone()); } None => return self.stop(at, "a private name that is not a field") } }
        Ok(out)
    }

    /// What an iteration gives: of a list, a set, a map, a string.
    fn iterated(&mut self, v: &Val, at: Span) -> R<Val> {
        let mut out = vec![];
        for a in v.clone() {
            match a {
                a if flat(a) => { add(&mut out, Atom::Prim); }
                Atom::Param(t, d) => match self.ty(t) {
                    Ty::Arr(e) | Ty::Set(e) => { let w = self.of_type(*e, (d + 1).max(2)); join(&mut out, &w); }
                    Ty::Rest(e) => { let w = self.of_type(*e, 1); join(&mut out, &w); }
                    Ty::Tuple(es) => for e in es { let w = self.of_type(*e, (d + 1).max(2)); join(&mut out, &w); },
                    Ty::Map(k, e) => { let (mut a, b) = (self.of_type(*k, 3), self.of_type(*e, 3)); join(&mut a, &b); let p = self.new_array(at, 9, a); join(&mut out, &p); }
                    _ => return self.stop(at, "it iterates a value that is not known to be a list"),
                },
                Atom::Obj(o) => {
                    self.own(o, at)?;
                    let x = &self.objs[o as usize];
                    match x.kind {
                        Kind::Array | Kind::Set | Kind::Iter => { let w = x.items.clone(); join(&mut out, &w); }
                        Kind::Map => { let (mut k, i) = (x.keys.clone(), x.items.clone()); join(&mut k, &i); let p = self.new_array(at, 9, k); join(&mut out, &p); }
                        _ => return self.stop(at, "it iterates an object that is no list"),
                    }
                }
                Atom::Const(c) => { let c = &self.consts[c as usize]; match c.shape.kind { CKind::Array | CKind::Set => { let w = c.all.clone(); join(&mut out, &w); } CKind::Map => { let (mut k, i) = (c.keys.clone(), c.all.clone()); join(&mut k, &i); let p = self.new_array(at, 9, k); join(&mut out, &p); } _ => return self.stop(at, "it iterates an object that is no list") } }
                _ => return self.stop(at, "it iterates a value that is not known to be a list"),
            }
        }
        Ok(out)
    }
    /// What a promise answers; a value that is none stands for itself.
    fn awaited(&mut self, v: &Val, at: Span) -> R<Val> {
        let mut out = vec![];
        for a in v.clone() {
            match a {
                a if flat(a) => { add(&mut out, a); }
                Atom::Param(t, _) => match self.ty(t) { Ty::Promise(e) => { let w = self.of_type(*e, 3); join(&mut out, &w); } Ty::Arr(_) | Ty::Tuple(_) | Ty::Rest(_) | Ty::Map(..) | Ty::Set(_) => { add(&mut out, a); } _ => return self.stop(at, "it waits for a value whose `then` may be anyone's") },
                Atom::Obj(o) => {
                    let x = &self.objs[o as usize];
                    match x.kind {
                        Kind::Promise => { let w = x.items.clone(); join(&mut out, &w); }
                        Kind::Array | Kind::Map | Kind::Set => { add(&mut out, a); }
                        Kind::Plain if x.class.is_none() && !x.fields.contains_key("then") && x.items.is_empty() && !x.wild => { add(&mut out, a); }
                        _ => return self.stop(at, "it waits for a value that may have a `then`"),
                    }
                }
                Atom::Const(c) if !self.consts[c as usize].values.contains_key("then") => { add(&mut out, a); }
                _ => return self.stop(at, "it waits for a value that may have a `then`"),
            }
        }
        Ok(out)
    }

    // ---- calls ----
    /// The arguments: each, and what a spread adds after them.
    fn args(&mut self, args: &[Argument<'a>]) -> R<(Vec<Val>, Option<Val>)> {
        let (mut out, mut rest) = (vec![], None::<Val>);
        for a in args {
            match a {
                Argument::SpreadElement(s) => { let v = self.expr(&s.argument)?; let w = self.iterated(&v, s.span)?; join(rest.get_or_insert_with(Vec::new), &w); }
                a => { let v = self.expr(a.to_expression())?; match &mut rest { Some(r) => { join(r, &v); } None => out.push(v) } }
            }
        }
        Ok((out, rest))
    }
    fn call(&mut self, c: &CallExpression<'a>) -> R<Val> {
        let callee = unwrap(&c.callee);
        match callee {
            Expression::StaticMemberExpression(p) => {
                if let Expression::Identifier(i) = unwrap(&p.object) { if let Some(f) = self.ns_member(i, &p.property.name, p.span)? { let (a, r) = self.args(&c.arguments)?; return self.call_value(&f, &a, r.as_ref(), c.span); } }
                let recv = self.expr(&p.object)?;
                let (a, r) = self.args(&c.arguments)?;
                let mut out = vec![];
                for x in recv.clone() { let w = self.method(x, &p.property.name, &a, r.as_ref(), c.span)?; join(&mut out, &w); }
                Ok(out)
            }
            Expression::ChainExpression(_) | Expression::ComputedMemberExpression(_) | Expression::PrivateFieldExpression(_) => self.stop(c.span, "it calls a member whose name is computed"),
            Expression::Super(_) => self.super_call(c),
            e => { let f = self.expr(e)?; let (a, r) = self.args(&c.arguments)?; self.call_value(&f, &a, r.as_ref(), c.span) }
        }
    }
    fn call_value(&mut self, f: &Val, args: &[Val], rest: Option<&Val>, at: Span) -> R<Val> {
        let mut out = vec![];
        let shown = f.iter().any(|a| matches!(a, Atom::Param(t, d) if *d <= 1 && matches!(self.ty(*t), Ty::Fn { answers: true, .. })));
        for a in f.clone() {
            let w = match a {
                Atom::Undef | Atom::Num | Atom::Prim => vec![],   // (a call of no function: the engine's own error)
                Atom::Fun(i) => self.call_fun(i, args, rest, at, None)?,
                Atom::Native(n) => { let n = self.natives[n as usize].clone(); self.native_call(&n, args, rest, at)? }
                Atom::Solid(n) => { let n = self.solids[n as usize].clone(); self.solid_call(&n, args, rest, at)? }
                Atom::Param(t, d) => match self.ty(t) {
                    Ty::Fn { answers, ret, .. } => { if !*answers || d > 1 { return self.stop(at, if d > 1 { "it calls a function it finds in what it is given" } else { "it calls a function that answers nothing: it is run for what it does" }); } self.callers(args, rest, at)?; self.of_type(*ret, 3) }
                    Ty::Param if shown && d <= 1 => vec![],
                    _ => return self.stop(at, "it calls a value the row does not show to be a function"),
                },
                Atom::Obj(o) => match self.objs[o as usize].kind.clone() {
                    Kind::Accessor => { if self.objs[o as usize].module && !self.acts[self.cur as usize].init { return self.stop(at, "it reads a signal of the module's"); } one(Atom::Opaque) }
                    Kind::Setter => return self.stop(at, "it writes a signal while it is called"),
                    Kind::Resolve(p) => { let v = args.first().cloned().unwrap_or_else(undef); let v = self.awaited(&v, at)?; self.put_items(p, &v); undef() }
                    Kind::Reject => undef(),
                    _ => return self.stop(at, "it calls a value that is not followed"),
                },
                _ => return self.stop(at, "it calls a value that is not known"),
            };
            join(&mut out, &w);
        }
        Ok(out)
    }
    /// A function of the caller's is called at once, on primitives, the caller's own values and data the call made.
    fn callers(&mut self, args: &[Val], rest: Option<&Val>, at: Span) -> R<()> {
        if self.is_later() { return self.stop(at, "it calls a function it was given after the call"); }
                for v in args.iter().chain(rest) {
            let mut seen = BTreeSet::new();
            if !self.data(v, &mut seen) { return self.stop(at, "it hands a function, or a value that is not known, to a function it was given"); }
            for o in seen { if join(&mut self.objs[o as usize].items, &one(Atom::Param(ANY, 3))) { self.drop_places(o); self.changed = true; } if matches!(self.objs[o as usize].kind, Kind::Plain) && !self.objs[o as usize].wild { self.objs[o as usize].wild = true; self.changed = true; } }
        }
        Ok(())
    }
    fn data(&self, v: &Val, seen: &mut BTreeSet<u32>) -> bool {
        v.iter().all(|a| match a {
            a if flat(*a) => true,
            Atom::Param(t, _) => !matches!(self.ty(*t), Ty::Fn { .. } | Ty::Any | Ty::Other | Ty::Promise(_)),
            Atom::Obj(o) => { let x = &self.objs[*o as usize]; if x.module || x.class.is_some() || !matches!(x.kind, Kind::Plain | Kind::Array) || !x.getters.is_empty() { return false; } if !seen.insert(*o) { return true; } let (f, i): (Vec<Val>, Val) = (x.fields.values().cloned().collect(), x.items.clone()); f.iter().all(|v| self.data(v, seen)) && i.iter().all(|a| matches!(a, Atom::Param(ANY, 3)) || self.data(&one(*a), seen)) }
            _ => false,
        })
    }
    fn is_later(&self) -> bool { let on = |a: u32| self.acts[a as usize].later || self.acts[a as usize].waits; on(self.cur) || self.stack.iter().any(|a| on(*a)) }
    /// Run again, or after the call: by a timer, a promise, a computation (not a function's own code after an `await`).
    fn is_again(&self) -> bool { self.again > 0 || self.acts[self.cur as usize].later || self.stack.iter().any(|a| self.acts[*a as usize].later) }

    fn call_fun(&mut self, f: u32, args: &[Val], more: Option<&Val>, at: Span, this: Option<Val>) -> R<Val> {
        if self.fuel == 0 { return self.stop(at, "the reading of it is too long"); }
        self.fuel -= 1;
        let (fa, env) = { let x = &self.funs[f as usize]; (x.at, x.env) };
        let mods = self.mods;
        let m: &'m Module<'a> = mods.get(fa.module);
        self.facts.files.insert(m.path.clone());
        if let Some(w) = m.banned { return self.stop(at, w); }
        let (params, body, scope, gen, isasync): (&'m FormalParameters<'a>, Result<&'m [Statement<'a>], &'m Expression<'a>>, _, bool, bool) = match m.nodes.kind(fa.node) {
            AstKind::Function(x) => { let Some(b) = &x.body else { return self.stop(at, "a function with no body") }; (&x.params, Ok(&b.statements[..]), x.scope_id.get(), x.generator, x.r#async) }
            AstKind::ArrowFunctionExpression(x) => (&x.params, match &x.body { ArrowFunctionBody::FunctionBody(b) => Ok(&b.statements[..]), b => Err(b.to_expression()) }, x.scope_id.get(), false, x.r#async),
            _ => return self.stop(at, "a function that is not read"),
        };
        if gen { return self.stop(at, "it calls a generator"); }
        // one reading for a call's place; a function that calls itself is read into its own
        let caller = self.cur;
        let init = self.acts[caller as usize].init;
        let deep = self.stack.iter().filter(|a| self.acts[**a as usize].scope == scope && self.acts[**a as usize].module == fa.module).count();
        let key = (f, caller, at.start, at.end);
        let a = match self.act_ids.get(&key) {
            Some(a) => *a,
            None if deep >= 1 => *self.stack.iter().rev().find(|a| self.acts[**a as usize].scope == scope && self.acts[**a as usize].module == fa.module && self.acts[**a as usize].parent == Some(env)).unwrap_or(&u32::MAX),
            None => u32::MAX,
        };
        let a = if a != u32::MAX { a } else { if deep >= 3 || self.stack.len() > 60 { return self.stop(at, "calls nested too deep to follow"); } let a = self.act(fa.module, scope, Some(env), init); self.act_ids.insert(key, a); a };
        if let Some(t) = this { let x = &mut self.acts[a as usize]; match &mut x.this { Some(o) => { join(o, &t); } None => x.this = Some(t) } }
        self.acts[a as usize].is_async = isasync;
        // an argument's defaults and patterns are evaluated in the function
        // a function expression's own name is the function
        if let AstKind::Function(x) = m.nodes.kind(fa.node) { if x.is_expression() { if let Some(id) = x.id.as_ref().and_then(|i| i.symbol_id.get()) { if join(self.acts[a as usize].vars.entry(id).or_default(), &one(Atom::Fun(f))) { self.changed = true; } } } }
        let was_running = self.acts[a as usize].running;
        self.cur = a;
        self.stack.push(a);
        let narrow = std::mem::take(&mut self.narrow);
        let r = (|| -> R<()> {
            for (i, p) in params.items.iter().enumerate() {
                let mut v = args.get(i).cloned().unwrap_or_default();
                if i >= args.len() { match more { Some(x) => { v = x.clone(); add(&mut v, Atom::Undef); } None => v = undef() } }
                if p.accessibility.is_some() || p.readonly || !p.decorators.is_empty() { return self.stop(p.span, "a parameter that is a field"); }
                if let Some(d) = &p.initializer { let w = self.expr(d)?; join(&mut v, &w); }
                self.bind(&p.pattern, &v)?;
            }
            if let Some(r) = &params.rest {
                let mut items = vec![];
                for v in args.iter().skip(params.items.len()) { join(&mut items, v); }
                if let Some(x) = more { join(&mut items, x); }
                let v = self.new_array(r.span, 5, items);
                self.bind(&r.rest.argument, &v)?;
            }
            if was_running { return Ok(()); }
            self.acts[a as usize].running = true;
            let out = match body {
                Ok(b) => self.statements(b),
                Err(e) => self.expr(e).and_then(|v| self.returned(&v, e.span())),
            };
            self.acts[a as usize].running = false;
            out
        })();
        self.narrow = narrow;
        self.stack.pop();
        self.cur = caller;
        r?;
        let ret = self.acts[a as usize].ret.clone();
        if isasync { let o = self.made(at, 7, Kind::Promise); self.put_items(o, &ret); return Ok(one(Atom::Obj(o))); }
        Ok(ret)
    }
    fn returned(&mut self, v: &Val, at: Span) -> R<()> {
        let a = self.cur;
        let v = if self.acts[a as usize].is_async { self.awaited(v, at)? } else { v.clone() };
        if join(&mut self.acts[a as usize].ret, &v) { self.changed = true; }
        Ok(())
    }
    /// A callback a built-in calls at once.
    fn callback(&mut self, f: &Val, args: &[Val], at: Span) -> R<Val> { self.call_value(f, args, None, at) }
    /// A function called later (a promise's, a timer's): read as any, and what it is given of the caller's is not called.
    fn later(&mut self, f: &Val, args: &[Val], at: Span) -> R<Val> {
        for a in f { if !matches!(a, Atom::Fun(_)) && !flat(*a) && !matches!(a, Atom::Obj(o) if matches!(self.objs[*o as usize].kind, Kind::Resolve(_) | Kind::Reject)) { return self.stop(at, "it hands a function it was given, or one that is not known, to what calls it later"); } }
        let a = self.cur;
        let was = self.acts[a as usize].later;
        self.acts[a as usize].later = true;
        let r = self.call_value(f, args, None, at);
        self.acts[a as usize].later = was;
        r
    }

    /// A method, by the kind of what it is called on.
    fn method(&mut self, recv: Atom, name: &str, args: &[Val], rest: Option<&Val>, at: Span) -> R<Val> {
        match recv {
            a if flat(a) => self.string_method(name, args, rest, at),
            Atom::Param(t, d) => match self.ty(t).clone() {
                Ty::Arr(e) => { let items = self.of_type(e, (d + 1).max(2)); self.array_method(recv, &items, false, name, args, rest, at) }
                Ty::Rest(e) => { let items = self.of_type(e, 1); self.array_method(recv, &items, false, name, args, rest, at) }
                Ty::Tuple(es) => { let mut items = vec![]; for e in es { join(&mut items, &self.of_type(e, (d + 1).max(2))); } self.array_method(recv, &items, false, name, args, rest, at) }
                Ty::Map(k, e) => { let (k, v) = (self.of_type(k, 3), self.of_type(e, 3)); self.keyed_method(recv, true, &k, &v, false, name, args, at) }
                Ty::Set(e) => { let v = self.of_type(e, 3); self.keyed_method(recv, false, &v, &v, false, name, args, at) }
                Ty::Promise(e) => { let v = self.of_type(e, 3); self.promise_method(&v, name, args, at) }
                Ty::Rec(f) if d == 0 => match f.get(name) { Some(x) => { let f = self.of_type(*x, 1); self.call_value(&f, args, rest, at) } None => self.stop(at, format!("it calls .{name}() of an argument")) },
                _ => self.stop(at, format!("it calls .{name}() of an argument: a method that is not the language's")),
            },
            Atom::Obj(o) => {
                self.own(o, at)?;
                let (kind, items, keys) = { let x = &self.objs[o as usize]; (x.kind.clone(), x.items.clone(), x.keys.clone()) };
                match kind {
                    Kind::Array => self.array_method(recv, &items, true, name, args, rest, at),
                    Kind::Map => self.keyed_method(recv, true, &keys, &items, true, name, args, at),
                    Kind::Set => self.keyed_method(recv, false, &items, &items, true, name, args, at),
                    Kind::Weak => match name { "get" => { let mut v = items; add(&mut v, Atom::Undef); Ok(v) } "has" => Ok(prim()), "delete" => { self.wrote(o, at)?; Ok(prim()) } "set" | "add" => { self.wrote(o, at)?; if let Some(v) = args.last() { self.put_items(o, v); } Ok(one(recv)) } _ => self.stop(at, format!("it calls .{name}()")) },
                    Kind::Promise => self.promise_method(&items, name, args, at),
                    Kind::RegExp => match name { "test" if args.iter().all(prims) => Ok(prim()), "exec" if args.iter().all(prims) => { let mut v = self.new_array(at, 6, prim()); add(&mut v, Atom::Prim); Ok(v) } _ => self.stop(at, format!("it calls a pattern's .{name}()")) },
                    Kind::Plain => { let f = self.prop(&one(recv), name, at)?; self.call_value(&f, args, rest, at) }
                    _ => self.stop(at, format!("it calls .{name}() of a value that is not followed there")),
                }
            }
            Atom::Const(c) => {
                let (kind, all, keys) = { let c = &self.consts[c as usize]; (c.shape.kind, c.all.clone(), c.keys.clone()) };
                match kind {
                    CKind::Array => self.array_method(recv, &all, false, name, args, rest, at),
                    CKind::Map => self.keyed_method(recv, true, &keys, &all, false, name, args, at),
                    CKind::Set => self.keyed_method(recv, false, &all, &all, false, name, args, at),
                    CKind::RegExp { stateful: false, .. } if matches!(name, "test" | "exec") && args.iter().all(prims) => { if name == "test" { Ok(prim()) } else { let mut v = self.new_array(at, 6, prim()); add(&mut v, Atom::Prim); Ok(v) } }
                    CKind::Plain => { let f = self.prop(&one(recv), name, at)?; self.call_value(&f, args, rest, at) }
                    _ => self.stop(at, format!("it calls .{name}() of an object of the module's")),
                }
            }
            Atom::Native(n) => { let p = format!("{}.{name}", self.natives[n as usize]); self.native_call(&p, args, rest, at) }
            Atom::Fun(_) | Atom::Class(_) | Atom::Solid(_) => self.stop(at, format!("it calls .{name}() of a function or a class, which may be changed")),
            _ => self.stop(at, format!("it calls .{name}() of a value that is not known")),
        }
    }
    fn string_method(&mut self, name: &str, args: &[Val], rest: Option<&Val>, at: Span) -> R<Val> {
        if rest.is_some_and(|r| !prims(r)) { return self.stop(at, "a string's method with arguments that are not known"); }
                let regex = |me: &Self, v: &Val| v.iter().all(|a| flat(*a) || matches!(a, Atom::Obj(o) if me.objs[*o as usize].kind == Kind::RegExp && !me.objs[*o as usize].module) || matches!(a, Atom::Const(c) if matches!(me.consts[*c as usize].shape.kind, CKind::RegExp { sticky: false, .. })));
        if REGEXP_IN_STRING.contains(&name) {
            if !args.first().is_none_or(|v| regex(self, v)) { return self.stop(at, format!(".{name}() with a pattern that is not known")); }
            match name {
                "replace" | "replaceAll" => {
                    if let Some(f) = args.get(1) { if !prims(f) { let v = self.callback(f, &[prim(), prim(), prim(), prim(), prim(), prim()], at)?; self.converted(&v, at)?; } }
                    Ok(prim())
                }
                "search" => Ok(num()),
                "split" => if args.get(1).is_none_or(prims) { Ok(self.new_array(at, 6, prim())) } else { self.stop(at, "a split that is not known") },
                "match" => { let mut v = self.new_array(at, 6, vec![Atom::Undef, Atom::Prim]); add(&mut v, Atom::Prim); Ok(v) }
                _ => { let a = self.new_array(at, 6, vec![Atom::Undef, Atom::Prim]); let o = self.made(at, 8, Kind::Iter); self.put_items(o, &a); Ok(one(Atom::Obj(o))) }
            }
        } else if STR_METHODS.contains(&name) {
            if !args.iter().all(prims) { return self.stop(at, format!(".{name}() with an argument it converts")); }
            Ok(if NUM_ANSWER.contains(&name) { num() } else { prim() })
        } else if name == "hasOwnProperty" && args.iter().all(prims) { Ok(prim()) }
        // (a value that is a list as well as a primitive: the engine's own error where it is the primitive)
        else if ["map", "filter", "forEach", "some", "every", "find", "findIndex", "flatMap", "reduce", "join", "push", "get", "set", "has", "add", "keys", "values", "entries", "then", "catch", "finally", "sort", "reverse", "toSorted", "toReversed", "flat"].contains(&name) { Ok(vec![]) }
        else { self.stop(at, format!("it calls .{name}() of a primitive")) }
    }
    fn array_method(&mut self, recv: Atom, items: &Val, own: bool, name: &str, args: &[Val], rest: Option<&Val>, at: Span) -> R<Val> {
        let arg = |i: usize| args.get(i).cloned().unwrap_or_else(undef);
        let maybe = |mut v: Val| { add(&mut v, Atom::Undef); v };
        let cbargs = || vec![items.clone(), num(), one(recv)];
        let nums = |from: usize| args.iter().skip(from).all(prims);
        if rest.is_some() && !matches!(name, "push" | "unshift" | "concat" | "splice" | "toSpliced") { return self.stop(at, "a spread among a list's method's arguments"); }
        let mutates = matches!(name, "push" | "pop" | "shift" | "unshift" | "splice" | "sort" | "reverse" | "fill" | "copyWithin");
        if mutates {
            if !own { return self.stop(at, format!("it may change in place a list that is not its own (.{name}())")); }
            let Atom::Obj(o) = recv else { return self.stop(at, "a list that is not followed") };
            self.wrote(o, at)?;
            self.drop_places(o);
            let mut put = vec![];
            match name { "push" | "unshift" => { for a in args { join(&mut put, a); } } "splice" => { for a in args.iter().skip(2) { join(&mut put, a); } if !args.iter().take(2).all(prims) { return self.stop(at, "a splice that is not known"); } } "fill" => { join(&mut put, &arg(0)); if !nums(1) { return self.stop(at, "a fill that is not known"); } } _ => {} }
            if let Some(r) = rest { join(&mut put, r); }
            self.put_items(o, &put);
            return match name {
                "push" | "unshift" => Ok(num()),
                "pop" | "shift" => Ok(maybe(items.clone())),
                "splice" => Ok(self.new_array(at, 6, items.clone())),
                "sort" => { self.sorted(items, args, at)?; Ok(one(recv)) }
                _ => { if name == "copyWithin" && !nums(0) { return self.stop(at, "a copy that is not known"); } Ok(one(recv)) }
            };
        }
        match name {
            "map" => { let v = self.callback(&arg(0), &cbargs(), at)?; Ok(self.new_array(at, 6, v)) }
            "filter" => { self.callback(&arg(0), &cbargs(), at)?; Ok(self.new_array(at, 6, items.clone())) }
            "find" | "findLast" => { self.callback(&arg(0), &cbargs(), at)?; Ok(maybe(items.clone())) }
            "findIndex" | "findLastIndex" => { self.callback(&arg(0), &cbargs(), at)?; Ok(num()) }
            "some" | "every" => { self.callback(&arg(0), &cbargs(), at)?; Ok(prim()) }
            "forEach" => { self.callback(&arg(0), &cbargs(), at)?; Ok(undef()) }
            "flatMap" => { let v = self.callback(&arg(0), &cbargs(), at)?; let w = self.flattened(&v, at)?; Ok(self.new_array(at, 6, w)) }
            "reduce" | "reduceRight" => {
                let key = (self.cur, at.start);
                let mut acc = self.cells.get(&key).cloned().unwrap_or_default();
                let start = if args.len() > 1 { arg(1) } else { items.clone() };
                join(&mut acc, &start);
                let v = self.callback(&arg(0), &[acc.clone(), items.clone(), num(), one(recv)], at)?;
                join(&mut acc, &v);
                if self.cells.get(&key) != Some(&acc) { self.cells.insert(key, acc.clone()); self.changed = true; }
                Ok(acc)
            }
            "slice" if nums(0) => Ok(self.new_array(at, 6, items.clone())),
            "concat" | "toSpliced" | "with" => {
                let mut v = items.clone();
                let skip = match name { "toSpliced" => 2, "with" => 1, _ => 0 };
                if !args.iter().take(skip).all(prims) { return self.stop(at, "a list's method that is not known"); }
                for a in args.iter().skip(skip).chain(rest) { let w = if name == "concat" { self.flattened(a, at)? } else { a.clone() }; join(&mut v, &w); }
                Ok(self.new_array(at, 6, v))
            }
            "flat" if args.is_empty() => { let w = self.flattened(items, at)?; Ok(self.new_array(at, 6, w)) }
            "toReversed" => Ok(self.new_array(at, 6, items.clone())),
            "toSorted" => { self.sorted(items, args, at)?; Ok(self.new_array(at, 6, items.clone())) }
            "includes" if nums(1) => Ok(prim()),
            "indexOf" | "lastIndexOf" if nums(1) => Ok(num()),
            "join" if nums(0) => { self.converted(items, at)?; Ok(prim()) }
            "at" if nums(0) => Ok(maybe(items.clone())),
            "keys" | "values" | "entries" => { let o = self.made(at, 8, Kind::Iter); let v = match name { "keys" => num(), "values" => items.clone(), _ => { let mut p = items.clone(); add(&mut p, Atom::Num); self.new_array(at, 6, p) } }; self.put_items(o, &v); Ok(one(Atom::Obj(o))) }
            _ => self.stop(at, format!("it calls .{name}() of a list")),
        }
    }
    fn sorted(&mut self, items: &Val, args: &[Val], at: Span) -> R<()> {
        match args.first() { Some(f) if !f.iter().all(|a| *a == Atom::Undef) => { let v = self.callback(f, &[items.clone(), items.clone()], at)?; self.converted(&v, at) } _ => self.converted(items, at) }
    }
    /// One level of lists taken apart: what is a list's items, what is none as it is.
    fn flattened(&mut self, v: &Val, at: Span) -> R<Val> {
        let mut out = vec![];
        for a in v.clone() {
            let w = match a {
                Atom::Param(t, d) => match self.ty(t) { Ty::Arr(e) => self.of_type(*e, (d + 1).max(2)), Ty::Rest(e) => self.of_type(*e, 1), Ty::Tuple(_) => self.iterated(&one(a), at)?, Ty::Any | Ty::Param => one(Atom::Param(ANY, 3)), _ => one(a) },
                Atom::Obj(o) if self.objs[o as usize].kind == Kind::Array => self.iterated(&one(a), at)?,
                Atom::Obj(o) if self.objs[o as usize].wild => return self.stop(at, "a list of objects that are not known"),
                Atom::Const(c) if self.consts[c as usize].shape.kind == CKind::Array => self.consts[c as usize].all.clone(),
                Atom::Class(_) | Atom::Opaque => return self.stop(at, "a list of values that are not known"),
                a => one(a),
            };
            join(&mut out, &w);
        }
        Ok(out)
    }
    fn keyed_method(&mut self, recv: Atom, map: bool, keys: &Val, items: &Val, own: bool, name: &str, args: &[Val], at: Span) -> R<Val> {
        let arg = |i: usize| args.get(i).cloned().unwrap_or_else(undef);
        match name {
            "has" => Ok(prim()),
            "get" if map => { let mut v = items.clone(); add(&mut v, Atom::Undef); Ok(v) }
            "forEach" => { let k = if map { keys.clone() } else { items.clone() }; self.callback(&arg(0), &[items.clone(), k, one(recv)], at)?; Ok(undef()) }
            "keys" | "values" | "entries" => {
                let o = self.made(at, 8, Kind::Iter);
                let v = match name { "keys" if map => keys.clone(), "keys" | "values" => items.clone(), _ => { let mut p = keys.clone(); join(&mut p, items); self.new_array(at, 6, p) } };
                self.put_items(o, &v);
                Ok(one(Atom::Obj(o)))
            }
            "set" | "add" | "delete" | "clear" => {
                if !own { return self.stop(at, format!("it may change in place what it was given, or the module's (.{name}())")); }
                let Atom::Obj(o) = recv else { return self.stop(at, "a map that is not followed") };
                self.wrote(o, at)?;
                match name { "set" if map => { if join(&mut self.objs[o as usize].keys, &arg(0)) { self.changed = true; } self.put_items(o, &arg(1)); Ok(one(recv)) } "add" if !map => { self.put_items(o, &arg(0)); Ok(one(recv)) } "delete" => Ok(prim()), "clear" => Ok(undef()), _ => self.stop(at, format!("it calls .{name}()")) }
            }
            _ => self.stop(at, format!("it calls .{name}() of a map or a set")),
        }
    }
    fn promise_method(&mut self, items: &Val, name: &str, args: &[Val], at: Span) -> R<Val> {
        let o = self.made(at, 7, Kind::Promise);
        let arg = |i: usize| args.get(i).cloned().unwrap_or_else(undef);
        match name {
            "then" => { let v = self.later(&arg(0), &[items.clone()], at)?; let v = self.awaited(&v, at)?; self.put_items(o, &v); if args.len() > 1 { let w = self.later(&arg(1), &[one(Atom::Opaque)], at)?; let w = self.awaited(&w, at)?; self.put_items(o, &w); } if prims(&arg(0)) { self.put_items(o, items); } }
            "catch" => { let v = self.later(&arg(0), &[one(Atom::Opaque)], at)?; let v = self.awaited(&v, at)?; self.put_items(o, &v); self.put_items(o, items); }
            "finally" => { let v = self.later(&arg(0), &[], at)?; self.awaited(&v, at)?; self.put_items(o, items); }
            _ => return self.stop(at, format!("it calls a promise's .{name}()")),
        }
        Ok(one(Atom::Obj(o)))
    }

    /// A built-in that only computes.
    fn native_call(&mut self, n: &str, args: &[Val], rest: Option<&Val>, at: Span) -> R<Val> {
        let arg = |i: usize| args.get(i).cloned().unwrap_or_else(undef);
        let all_prim = args.iter().chain(rest).all(prims);
        if rest.is_some() && !(n.starts_with("Math.") || n == "String.fromCharCode" || n == "Array.of" || n == "Object.assign") { return self.stop(at, format!("{n} with a spread")); }
        match n {
            "Math.random" => self.stop(at, "it asks for a random number"),
            _ if n.starts_with("Math.") && native_fn(n) => { if all_prim { Ok(num()) } else { self.stop(at, format!("{n} of a value it converts")) } }
            "Boolean" => Ok(prim()),
            "String" | "Number" | "parseFloat" | "isNaN" | "isFinite" if prims(&arg(0)) => Ok(if matches!(n, "Number" | "parseFloat") { num() } else { prim() }),
            "String" | "BigInt" | "encodeURIComponent" | "encodeURI" | "decodeURIComponent" | "decodeURI" | "String.fromCharCode" | "String.fromCodePoint" => { if all_prim { Ok(prim()) } else { self.stop(at, format!("{n} of a value it converts")) } }
            "Number" | "parseInt" | "parseFloat" | "Number.parseInt" | "Number.parseFloat" => if all_prim { Ok(num()) } else { self.stop(at, format!("{n} of a value it converts")) },
            "isNaN" | "isFinite" => if all_prim { Ok(prim()) } else { self.stop(at, format!("{n} of a value it converts")) },
            "Number.isNaN" | "Number.isFinite" | "Number.isInteger" | "Number.isSafeInteger" | "Array.isArray" | "Object.is" | "Promise.isPromise" => Ok(prim()),
            "JSON.stringify" => { let mut seen = BTreeSet::new(); if self.json(&arg(0), &mut seen) && args.iter().skip(1).all(prims) { Ok(prim()) } else { self.stop(at, "JSON.stringify of a value whose `toJSON` may run") } }
            "JSON.parse" => { if all_prim { Ok(one(Atom::Param(ANY, 3))) } else { self.stop(at, "JSON.parse with a function, or of a value it converts") } }
            "Array" => if all_prim { Ok(self.new_array(at, 6, undef())) } else { self.stop(at, "Array of a value that is not known") },
            "Array.of" => { let mut v = vec![]; for a in args.iter().chain(rest) { join(&mut v, a); } Ok(self.new_array(at, 6, v)) }
            "Array.from" => {
                let items = match &arg(0)[..] {
                    // `{ length: n }`
                    [Atom::Obj(o)] if self.objs[*o as usize].kind == Kind::Plain && !self.objs[*o as usize].wild && self.objs[*o as usize].getters.is_empty() && self.objs[*o as usize].items.is_empty() && self.objs[*o as usize].fields.keys().all(|k| k == "length") && self.objs[*o as usize].fields.values().all(prims) => undef(),
                    v => { let v = v.to_vec(); self.iterated(&v, at)? }
                };
                let v = if args.len() > 1 { self.callback(&arg(1), &[items, num()], at)? } else { items };
                Ok(self.new_array(at, 6, v))
            }
            "Object.keys" | "Object.values" | "Object.entries" => {
                let (mut vals, at_ok) = (vec![], arg(0));
                for a in at_ok {
                    match a {
                        a if flat(a) => { add(&mut vals, Atom::Prim); }
                        Atom::Param(t, d) => match self.ty(t) { Ty::Any | Ty::Param => { add(&mut vals, Atom::Param(ANY, 3)); } Ty::Rec(_) => { add(&mut vals, Atom::Param(ANY, 3)); } Ty::Arr(e) => { let w = self.of_type(*e, (d + 1).max(2)); join(&mut vals, &w); } _ => return self.stop(at, format!("{n} of an argument that is no data")) },
                        Atom::Obj(o) => { self.own(o, at)?; let x = &self.objs[o as usize]; if !matches!(x.kind, Kind::Plain | Kind::Array) || x.wild || !x.getters.is_empty() { return self.stop(at, format!("{n} of an object that runs code, or is not known")); } let mut w = x.items.clone(); for f in x.fields.values() { join(&mut w, f); } join(&mut vals, &w); }
                        Atom::Const(c) => { let c = &self.consts[c as usize]; if c.shape.holds_object { return self.stop(at, format!("{n} of an object of the module's")); } let w = c.all.clone(); join(&mut vals, &w); }
                        _ => return self.stop(at, format!("{n} of a value that is not known")),
                    }
                }
                let items = match n { "Object.keys" => prim(), "Object.values" => vals, _ => { add(&mut vals, Atom::Prim); self.new_array(at, 9, vals) } };
                Ok(self.new_array(at, 6, items))
            }
            "Object.fromEntries" => {
                let pairs = self.iterated(&arg(0), at)?;
                let mut vals = vec![];
                for p in &pairs {
                    let items = self.iterated(&one(*p), at)?;
                    let (k, v) = (self.item(&one(*p), 0, &items), self.item(&one(*p), 1, &items));
                    self.converted(&k, at)?;
                    join(&mut vals, &v);
                }
                let o = self.made(at, 6, Kind::Plain);
                if !prims(&vals) { self.objs[o as usize].wild = true; }
                self.put_items(o, &vals);
                Ok(one(Atom::Obj(o)))
            }
            "Object.assign" => {
                let target = arg(0);
                // (a closure the call made: its properties are never read)
                if let [Atom::Fun(f)] = target[..] { let env = self.funs[f as usize].env; if !self.acts[env as usize].init && args.iter().skip(1).all(|v| v.iter().all(|a| matches!(a, Atom::Obj(o) if { let x = &self.objs[*o as usize]; x.kind == Kind::Plain && !x.module && x.getters.is_empty() && !x.wild }))) && rest.is_none() { return Ok(target); } }
                for t in &target { let Atom::Obj(o) = t else { return self.stop(at, "Object.assign to what is not its own") }; self.own(*o, at)?; self.wrote(*o, at)?; let x = &self.objs[*o as usize]; if x.kind != Kind::Plain || !x.getters.is_empty() || x.wild { return self.stop(at, "Object.assign to an object that is not followed"); } }
                for s in args.iter().skip(1).chain(rest) { for a in s.clone() { match a {
                    a if flat(a) => {}
                    Atom::Param(..) => { let f = self.spread_param(a); for t in &target { if let Atom::Obj(o) = t { for (k, v) in &f.0 { self.put_field(*o, k, v); } self.put_items(*o, &one(Atom::Param(ANY, 3))); if !self.objs[*o as usize].wild { self.objs[*o as usize].wild = true; self.changed = true; } } } }
                    Atom::Obj(p) => { self.own(p, at)?; let x = &self.objs[p as usize]; if x.kind != Kind::Plain || !x.getters.is_empty() || x.wild || !x.items.is_empty() { return self.stop(at, "Object.assign of an object that is not known"); } let fs = x.fields.clone(); for t in &target { if let Atom::Obj(o) = t { for (k, v) in &fs { self.put_field(*o, k, v); } } } }
                    _ => return self.stop(at, "Object.assign of a value that is not known"),
                } } }
                Ok(target)
            }
            // (an object whose other properties are found elsewhere: made, and read by nobody here)
            "Object.create" if args.len() == 1 => Ok(one(Atom::Opaque)),
            "Object.freeze" => { for a in arg(0) { match a { Atom::Obj(o) => self.own(o, at)?, a if flat(a) => {} _ => return self.stop(at, "it freezes what is not its own") } } Ok(arg(0)) }
            "Object.hasOwn" => { if prims(&arg(1)) && arg(0).iter().all(|a| matches!(a, Atom::Param(..) | Atom::Obj(_) | Atom::Const(_)) || flat(*a)) { Ok(prim()) } else { self.stop(at, "Object.hasOwn of a value that is not known") } }
            "Promise.resolve" => { let v = self.awaited(&arg(0), at)?; let o = self.made(at, 7, Kind::Promise); self.put_items(o, &v); Ok(one(Atom::Obj(o))) }
            "Promise.reject" => { let o = self.made(at, 7, Kind::Promise); Ok(one(Atom::Obj(o))) }
            "Promise.all" | "Promise.allSettled" | "Promise.race" | "Promise.any" => {
                let items = self.iterated(&arg(0), at)?;
                let v = self.awaited(&items, at)?;
                let v = match n { "Promise.all" => self.new_array(at, 6, v), "Promise.race" => v, _ => return self.stop(at, n.to_string()) };
                let o = self.made(at, 7, Kind::Promise);
                self.put_items(o, &v);
                Ok(one(Atom::Obj(o)))
            }
            "setTimeout" | "queueMicrotask" => {
                if !args.iter().skip(1).take(1).all(prims) || args.len() > 2 { return self.stop(at, "a timer's other arguments"); }
                for a in &arg(0) { if flat(*a) { return self.stop(at, "a timer given no function"); } }
                self.later(&arg(0), &[], at)?;
                Ok(if n == "setTimeout" { one(Atom::Timer) } else { undef() })
            }
            "clearTimeout" | "clearInterval" => if arg(0).iter().all(|a| *a == Atom::Timer || *a == Atom::Undef) { Ok(undef()) } else { self.stop(at, "it clears a timer that is not its own") },
            _ => self.stop(at, format!("it calls {n}")),
        }
    }
    /// A value whose text as JSON runs no code.
    fn json(&self, v: &Val, seen: &mut BTreeSet<u32>) -> bool {
        v.iter().all(|a| match a {
            a if flat(*a) => true,
            Atom::Obj(o) => { let x = &self.objs[*o as usize]; if x.module || x.class.is_some() || !matches!(x.kind, Kind::Plain | Kind::Array) || !x.getters.is_empty() || x.wild || x.fields.contains_key("toJSON") { return false; } if !seen.insert(*o) { return true; } x.fields.values().chain([&x.items]).all(|w| self.json(w, seen)) }
            _ => false,
        })
    }

    fn construct(&mut self, n: &NewExpression<'a>) -> R<Val> {
        let f = self.expr(&n.callee)?;
        let (args, rest) = self.args(&n.arguments)?;
        let at = n.span;
        let arg = |i: usize| args.get(i).cloned().unwrap_or_else(undef);
        let mut out = vec![];
        for a in f {
            let w = match a {
                Atom::Native(c) => {
                    let c = self.natives[c as usize].clone();
                    if rest.is_some() { return self.stop(at, format!("new {c} with a spread")); }
                    match c.as_str() {
                        c if ERRORS.contains(&c) => { if !prims(&arg(0)) || args.len() > 1 { return self.stop(at, "an error of a value it converts"); } let o = self.made(at, 0, Kind::Error); one(Atom::Obj(o)) }
                        "Map" | "WeakMap" => {
                            let o = self.made(at, 0, if c == "Map" { Kind::Map } else { Kind::Weak });
                            if !arg(0).iter().all(|a| *a == Atom::Undef || (*a == Atom::Prim)) {
                                let pairs = self.iterated(&arg(0), at)?;
                                let (mut k, mut v) = (vec![], vec![]);
                                for p in &pairs { let items = self.iterated(&one(*p), at)?; let (x, y) = (self.item(&one(*p), 0, &items), self.item(&one(*p), 1, &items)); join(&mut k, &x); join(&mut v, &y); }
                                if join(&mut self.objs[o as usize].keys, &k) { self.changed = true; }
                                self.put_items(o, &v);
                            }
                            one(Atom::Obj(o))
                        }
                        "Set" | "WeakSet" => { let o = self.made(at, 0, if c == "Set" { Kind::Set } else { Kind::Weak }); if !arg(0).iter().all(|a| *a == Atom::Undef) { let v = self.iterated(&arg(0), at)?; self.put_items(o, &v); } one(Atom::Obj(o)) }
                        "Array" => { if !args.iter().all(prims) { return self.stop(at, "new Array of a value that is not known"); } self.new_array(at, 6, undef()) }
                        "RegExp" => { if !args.iter().all(prims) { return self.stop(at, "new RegExp of a value it converts"); } let o = self.made(at, 0, Kind::RegExp); one(Atom::Obj(o)) }
                        // (made, it runs nothing: every use of it does, and it has none)
                        "Proxy" => one(Atom::Opaque),
                        "Promise" => {
                            let p = self.made(at, 7, Kind::Promise);
                            let res = self.made(at, 10, Kind::Resolve(p));
                            let rej = self.made(at, 11, Kind::Reject);
                            let fs = arg(0);
                            if !fs.iter().all(|a| matches!(a, Atom::Fun(_))) { return self.stop(at, "a promise whose function is not known"); }
                            self.call_value(&fs, &[one(Atom::Obj(res)), one(Atom::Obj(rej))], None, at)?;
                            one(Atom::Obj(p))
                        }
                        c => return self.stop(at, format!("it makes a {c}")),
                    }
                }
                Atom::Class(c) => self.instance(c, &args, rest.as_ref(), at)?,
                _ => return self.stop(at, "it makes a value of a class that is not known"),
            };
            join(&mut out, &w);
        }
        Ok(out)
    }
    /// A class whose making is read: fields and a constructor, of no base but an error's; every use of its name makes one,
    /// tests for one or extends it, so nothing changes it.
    fn plain_class(&mut self, c: u32, at: Span) -> R<()> {
        let x = self.classes[c as usize].at;
        let m: &'m Module<'a> = self.mods.get(x.module);
        let AstKind::Class(k) = m.nodes.kind(x.node) else { return self.stop(at, "a class that is not read") };
        if !k.decorators.is_empty() { return self.stop(at, "a class with decorators"); }
        for e in &k.body.body {
            let bad = match e {
                ClassElement::StaticBlock(_) | ClassElement::AccessorProperty(_) => true,
                ClassElement::MethodDefinition(d) => d.r#static || d.computed || !d.decorators.is_empty() || matches!(d.kind, MethodDefinitionKind::Get | MethodDefinitionKind::Set),
                ClassElement::PropertyDefinition(d) => d.r#static || d.computed || !d.decorators.is_empty(),
                ClassElement::TSIndexSignature(_) => false,
            };
            if bad { return self.stop(at, "a class with statics, accessors or names that are computed"); }
        }
        // what it extends has the same to show: a static of it is the class's too
        if let Some(h) = &k.heritage {
            let module = x.module;
            let Expression::Identifier(i) = unwrap(&h.expression) else { return self.stop(at, "a class of a base that is not read") };
            if !ERRORS.iter().any(|e| m.is_global(i, e)) {
                let Some(s) = m.symbol(i) else { return self.stop(at, "a class of a base that is not read") };
                let Origin::Symbol(bm, bs) = self.mods.symbol(self.h, self.hi, module, s, &mut vec![]) else { return self.stop(at, "a class of a base that is not read") };
                let b = self.mods.get(bm);
                if !b.at_top(bs) || !matches!(b.nodes.kind(b.scoping.symbol_declaration(bs)), AstKind::Class(_)) { return self.stop(at, "a class of a base that is not read"); }
                let v = self.module_value(bm, bs)?;
                let [Atom::Class(d)] = v[..] else { return self.stop(at, "a class of a base that is not read") };
                if d == c { return self.stop(at, "a class that extends itself"); }
                self.plain_class(d, at)?;
            }
        }
        let Some(id) = k.id.as_ref().and_then(|i| i.symbol_id.get()) else { return self.stop(at, "a class with no name") };
        if m.handed_out.contains(&id) { return self.stop(at, "a class the module exports, which any importer may change"); }
        if !m.known_symbol(id) { return self.stop(at, "a class whose name is written again"); }
        // every use, here and in the modules that import it
        let n = self.mods.len();
        for mi in 0..n {
            let mm = self.mods.get(mi);
            let mut syms = if mi == x.module { vec![id] } else { vec![] };
            if mi != x.module && m.handed_out.contains(&id) {
                for (s, _) in mm.imports.iter().filter(|(_, i)| !super::graph::is_solid(i.spec)) { if let Origin::Symbol(a, b) = self.mods.symbol(self.h, self.hi, mi, *s, &mut vec![]) { if a == x.module && b == id { syms.push(*s); } } }
                // a namespace it may be reached through
                for (s, i) in &mm.imports { if i.name.is_none() && !super::graph::is_solid(i.spec) && matches!(self.mods.symbol(self.h, self.hi, mi, *s, &mut vec![]), Origin::Ns(a) if a == x.module) { return self.stop(at, "a class reached through a namespace"); } }
            }
            for s in syms { for r in mm.references(s) {
                let o = mm.outer(r);
                let span = mm.nodes.kind(o).span();
                let ok = match mm.nodes.parent_kind(o) {
                    AstKind::NewExpression(n) => n.callee.span() == span,
                    AstKind::BinaryExpression(b) => b.operator == BinaryOperator::Instanceof && b.right.span() == span,
                    AstKind::Class(_) | AstKind::ExportSpecifier(_) => true,
                    AstKind::ExportDefaultDeclaration(_) => true,
                    _ => false,
                };
                if !ok { return self.stop(at, "a class whose name is used in a way that may change it"); }
            } }
        }
        Ok(())
    }
    fn instance(&mut self, c: u32, args: &[Val], rest: Option<&Val>, at: Span) -> R<Val> {
        self.plain_class(c, at)?;
        let (fa, env) = { let x = &self.classes[c as usize]; (x.at, x.env) };
        let mods = self.mods;
        let m: &'m Module<'a> = mods.get(fa.module);
        let AstKind::Class(k) = m.nodes.kind(fa.node) else { return self.stop(at, "a class that is not read") };
        let o = self.made(at, 12, Kind::Plain);
        self.objs[o as usize].class.get_or_insert(c);
        self.init_class(k, c, o, env, args, rest, at)?;
        Ok(one(Atom::Obj(o)))
    }
    fn init_class(&mut self, k: &'m Class<'a>, c: u32, o: u32, env: u32, args: &[Val], rest: Option<&Val>, at: Span) -> R<()> {
        let ctor = k.body.body.iter().find_map(|e| match e { ClassElement::MethodDefinition(d) if d.kind == MethodDefinitionKind::Constructor && d.value.body.is_some() => Some(&*d.value), _ => None });
        let module = self.classes[c as usize].at.module;
        if k.heritage.is_some() && ctor.is_none() { self.base_class(k, c, o, args, rest, at)?; }
        // fields, with `this` the instance
        let caller = self.cur;
        let init = self.acts[caller as usize].init;
        let key = (u32::MAX - c, caller, at.start, at.end);
        let a = match self.act_ids.get(&key) { Some(a) => *a, None => { let a = self.act(module, None, Some(env), init); self.act_ids.insert(key, a); a } };
        self.acts[a as usize].this = Some(one(Atom::Obj(o)));
        self.cur = a;
        self.stack.push(a);
        let r = (|| -> R<()> {
            for e in &k.body.body { if let ClassElement::PropertyDefinition(d) = e {
                let name = match &d.key { PropertyKey::PrivateIdentifier(p) => { let v = match &d.value { Some(x) => self.expr(x)?, None => undef() }; self.put_private(o, &p.name, &v); continue; } key => match static_key(key, d.computed) { Some(n) => n, None => return self.stop(at, "a field whose name is computed") } };
                if reserved(&name) { return self.stop(at, "a field that is not followed"); }
                let v = match &d.value { Some(x) => self.expr(x)?, None => undef() };
                self.put_field(o, &name, &v);
            } }
            Ok(())
        })();
        self.stack.pop();
        self.cur = caller;
        r?;
        if let Some(f) = ctor {
            let Some(sc) = f.scope_id.get() else { return self.stop(at, "a constructor that is not read") };
            let node = self.mods.get(module).scoping.get_node_id(sc);
            let Atom::Fun(fi) = self.fun(FnAt { module, node }, env) else { return self.stop(at, "a constructor that is not read") };
            self.ctor_class.push((c, o));
            let r = self.call_fun(fi, args, rest, at, Some(one(Atom::Obj(o))));
            self.ctor_class.pop();
            let v = r?;
            if !prims(&v) { return self.stop(at, "a constructor that answers an object"); }
        }
        Ok(())
    }
    fn base_class(&mut self, k: &'m Class<'a>, c: u32, o: u32, args: &[Val], rest: Option<&Val>, at: Span) -> R<()> {
        let Some(h) = &k.heritage else { return self.stop(at, "`super` with no base") };
        let (env, module) = { let x = &self.classes[c as usize]; (x.env, x.at.module) };
        let caller = self.cur;
        // the base's name is read where the class is
        let tmp = self.act(module, None, Some(env), self.acts[caller as usize].init);
        self.cur = tmp;
        let b = self.expr(&h.expression);
        self.cur = caller;
        for a in b? {
            match a {
                Atom::Native(n) if ERRORS.contains(&self.natives[n as usize].as_str()) => { if !args.first().is_none_or(prims) || args.len() > 1 || rest.is_some_and(|r| !prims(r)) { return self.stop(at, "an error of a value it converts"); } self.objs[o as usize].kind = Kind::Error; }
                Atom::Class(d) => {
                    self.plain_class(d, at)?;
                    let x = &self.classes[d as usize];
                    let (fa, env) = (x.at, x.env);
                    let mods = self.mods;
                    let AstKind::Class(k) = mods.get(fa.module).nodes.kind(fa.node) else { return self.stop(at, "a class that is not read") };
                    self.init_class(k, d, o, env, args, rest, at)?;
                }
                _ => return self.stop(at, "a class of a base that is not read"),
            }
        }
        Ok(())
    }
    fn super_call(&mut self, c: &CallExpression<'a>) -> R<Val> {
        let Some((k, o)) = self.ctor_class.last().copied() else { return self.stop(c.span, "a `super` that is not followed") };
        let (args, rest) = self.args(&c.arguments)?;
        let fa = self.classes[k as usize].at;
        let mods = self.mods;
        let AstKind::Class(x) = mods.get(fa.module).nodes.kind(fa.node) else { return self.stop(c.span, "a class that is not read") };
        self.base_class(x, k, o, &args, rest.as_ref(), c.span)?;
        Ok(one(Atom::Obj(o)))
    }

    /// Solid's, while the call runs: state of its own.
    fn solid_call(&mut self, n: &str, args: &[Val], rest: Option<&Val>, at: Span) -> R<Val> {
        if rest.is_some() { return self.stop(at, format!("{n} with a spread")); }
        if self.acts[self.cur as usize].init { return self.stop(at, "a node made as the module loads"); }
        if self.post.is_some() && n != "untrack" { return self.stop(at, format!("{n}, each time it is called")); }
        let arg = |i: usize| args.get(i).cloned().unwrap_or_else(undef);
        let not_fn = |me: &Self, v: &Val| v.iter().all(|a| flat(*a) || match a { Atom::Param(t, _) => matches!(me.ty(*t), Ty::Arr(_) | Ty::Tuple(_) | Ty::Rest(_) | Ty::Rec(_) | Ty::Map(..) | Ty::Set(_)), Atom::Obj(o) => matches!(me.objs[*o as usize].kind, Kind::Plain | Kind::Array | Kind::Map | Kind::Set) && me.objs[*o as usize].getters.is_empty(), _ => false });
        if self.is_later() && !matches!(n, "untrack") { return self.stop(at, format!("{n} after the call: no owner is there")); }
        let accessor = |me: &mut Self, tag| { let o = me.made(at, tag, Kind::Accessor); one(Atom::Obj(o)) };
        match n {
            "createSignal" | "createStore" => {
                if args.len() > 1 && !self.options(&arg(1)) { return self.stop(at, format!("{n} with options that are not known")); }
                if !not_fn(self, &arg(0)) { return self.stop(at, format!("{n} of a value that may be a function: it would be run")); }
                self.facts.makes = true;
                let first = if n == "createSignal" { accessor(self, 20) } else { let o = self.made(at, 21, Kind::Store); let v = arg(0); self.put_items(o, &v); let s = self.stop::<()>(at, "what it answers may be changed through a store").unwrap_err(); let mut seen = BTreeSet::new(); self.under_store(&v, &s, &mut seen); one(Atom::Obj(o)) };
                let set = self.made(at, 22, Kind::Setter);
                let o = self.made(at, 23, Kind::Array);
                self.put_place(o, 0, &first);
                self.put_place(o, 1, &one(Atom::Obj(set)));
                let mut both = first;
                add(&mut both, Atom::Obj(set));
                self.put_items(o, &both);
                Ok(one(Atom::Obj(o)))
            }
            "createMemo" => {
                if args.len() > 1 && !self.options(&arg(1)) { return self.stop(at, "createMemo with options that are not known"); }
                self.computes(&arg(0), at)?;
                self.facts.makes = true;
                Ok(accessor(self, 20))
            }
            "createEffect" => {
                self.computes(&arg(0), at)?;
                // what it runs after the call is the owner's, and is not the call's
                if !arg(1).iter().all(|a| matches!(a, Atom::Fun(_) | Atom::Param(..))) || args.len() > 2 { return self.stop(at, "createEffect with what is not known"); }
                self.facts.makes = true;
                self.facts.owned = true;
                let v = arg(1);
                join(&mut self.kept, &v);
                Ok(undef())
            }
            "onCleanup" => { if !arg(0).iter().all(|a| matches!(a, Atom::Fun(_) | Atom::Param(..))) { return self.stop(at, "onCleanup of what is not known"); } let v = arg(0); join(&mut self.kept, &v); self.facts.makes = true; self.facts.owned = true; Ok(one(Atom::Opaque)) }
            "untrack" => { if args.len() > 1 { return self.stop(at, "untrack with options"); } self.callback(&arg(0), &[], at) }
            "createContext" => self.stop(at, "it makes a context"),
            _ => self.stop(at, format!("it calls Solid's {n}")),
        }
    }
    fn computes(&mut self, f: &Val, at: Span) -> R<Val> {
        for a in f { match a { Atom::Fun(i) => { let at_ = self.funs[*i as usize].at; let m = self.mods.get(at_.module); let a = match m.nodes.kind(at_.node) { AstKind::Function(x) => x.r#async || x.generator, AstKind::ArrowFunctionExpression(x) => x.r#async, _ => true }; if a { return self.stop(at, "a computation that waits"); } } Atom::Param(t, d) if *d <= 1 && matches!(self.ty(*t), Ty::Fn { answers: true, .. }) => {} _ => return self.stop(at, "a computation that is not known") } }
        self.again += 1;
        let r = self.callback(f, &[one(Atom::Opaque)], at);
        self.again -= 1;
        r
    }
    /// A maker's options, written out with no function among them.
    fn options(&self, v: &Val) -> bool { v.iter().all(|a| flat(*a) || matches!(a, Atom::Obj(o) if self.objs[*o as usize].kind == Kind::Plain && !self.objs[*o as usize].wild && self.objs[*o as usize].getters.is_empty() && self.objs[*o as usize].items.is_empty() && self.objs[*o as usize].fields.values().all(prims))) }

    // ---- statements ----
    fn statements(&mut self, b: &'m [Statement<'a>]) -> R<()> {
        // a function's declarations are there before its first statement
        for s in b { if let Statement::FunctionDeclaration(f) = s { if let (Some(id), Some(_)) = (f.id.as_ref().and_then(|i| i.symbol_id.get()), &f.body) { let v = self.closure(f.scope_id.get(), f.span)?; self.write_symbol(id, &v, f.span)?; } } }
        for s in b { self.statement(s)?; }
        Ok(())
    }
    fn statement(&mut self, s: &'m Statement<'a>) -> R<()> {
        match s {
            Statement::ExpressionStatement(x) => { self.expr(&x.expression)?; }
            Statement::VariableDeclaration(d) => self.declare(d)?,
            Statement::ReturnStatement(r) => { let v = match &r.argument { Some(e) => self.expr(e)?, None => undef() }; self.returned(&v, r.span)?; }
            Statement::IfStatement(i) => {
                self.expr(&i.test)?;
                self.under(&i.test, true, |s| s.statement(&i.consequent))?;
                if let Some(a) = &i.alternate { self.under(&i.test, false, |s| s.statement(a))?; }
            }
            Statement::BlockStatement(b) => self.statements(&b.body)?,
            Statement::ForStatement(f) => {
                match &f.init { Some(ForStatementInit::VariableDeclaration(d)) => self.declare(d)?, Some(e) => { self.expr(e.to_expression())?; } None => {} }
                if let Some(t) = &f.test { self.expr(t)?; }
                self.statement(&f.body)?;
                if let Some(u) = &f.update { self.expr(u)?; }
            }
            Statement::ForOfStatement(f) => {
                if f.r#await { return self.stop(f.span, "a `for await`"); }
                let v = self.expr(&f.right)?;
                let items = self.iterated(&v, f.right.span())?;
                self.for_left(&f.left, &items)?;
                self.statement(&f.body)?;
            }
            Statement::ForInStatement(f) => {
                let v = self.expr(&f.right)?;
                for a in &v { if !(flat(*a) || matches!(a, Atom::Const(_)) || matches!(a, Atom::Param(t, _) if !matches!(self.ty(*t), Ty::Other)) || matches!(a, Atom::Obj(o) if matches!(self.objs[*o as usize].kind, Kind::Plain | Kind::Array) && !self.objs[*o as usize].wild)) { return self.stop(f.span, "a `for in` of a value that is not known"); } }
                self.for_left(&f.left, &prim())?;
                self.statement(&f.body)?;
            }
            Statement::WhileStatement(w) => { self.expr(&w.test)?; self.under(&w.test, true, |s| s.statement(&w.body))?; }
            Statement::DoWhileStatement(w) => { self.statement(&w.body)?; self.expr(&w.test)?; }
            Statement::SwitchStatement(x) => { self.expr(&x.discriminant)?; for c in &x.cases { if let Some(t) = &c.test { self.expr(t)?; } self.statements(&c.consequent)?; } }
            Statement::ThrowStatement(t) => { self.expr(&t.argument)?; }
            Statement::TryStatement(t) => {
                                self.statements(&t.block.body)?;
                if let Some(h) = &t.handler { if let Some(p) = &h.param { self.bind(&p.pattern, &one(Atom::Opaque))?; } self.statements(&h.body.body)?; }
                if let Some(f) = &t.finalizer { self.statements(&f.body)?; }
            }
            Statement::LabeledStatement(l) => self.statement(&l.body)?,
            Statement::EmptyStatement(_) | Statement::BreakStatement(_) | Statement::ContinueStatement(_) | Statement::DebuggerStatement(_) | Statement::FunctionDeclaration(_) => {}
            Statement::TSTypeAliasDeclaration(_) | Statement::TSInterfaceDeclaration(_) => {}
            s => return self.stop(s.span(), "a statement that is not followed"),
        }
        Ok(())
    }
    fn declare(&mut self, d: &'m VariableDeclaration<'a>) -> R<()> {
        if matches!(d.kind, VariableDeclarationKind::Using | VariableDeclarationKind::AwaitUsing) { return self.stop(d.span, "a `using`"); }
        for x in &d.declarations {
            let v = match &x.init { Some(e) => self.expr(e)?, None => if d.kind == VariableDeclarationKind::Const { continue } else { undef() } };
            self.bind(&x.id, &v)?;
        }
        Ok(())
    }
    fn for_left(&mut self, l: &'m ForStatementLeft<'a>, v: &Val) -> R<()> {
        match l { ForStatementLeft::VariableDeclaration(d) => { if matches!(d.kind, VariableDeclarationKind::Using | VariableDeclarationKind::AwaitUsing) { return self.stop(d.span, "a `using`"); } for x in &d.declarations { self.bind(&x.id, v)?; } Ok(()) } t => self.write_target(t.to_assignment_target(), v) }
    }
}
fn native_fn(n: &str) -> bool {
    matches!(n, "Math.abs" | "Math.acos" | "Math.acosh" | "Math.asin" | "Math.asinh" | "Math.atan" | "Math.atan2" | "Math.atanh" | "Math.cbrt" | "Math.ceil" | "Math.clz32" | "Math.cos" | "Math.cosh" | "Math.exp" | "Math.expm1" | "Math.floor" | "Math.fround" | "Math.hypot" | "Math.imul" | "Math.log" | "Math.log10" | "Math.log1p" | "Math.log2" | "Math.max" | "Math.min" | "Math.pow" | "Math.round" | "Math.sign" | "Math.sin" | "Math.sinh" | "Math.sqrt" | "Math.tan" | "Math.tanh" | "Math.trunc"
        | "JSON.stringify" | "JSON.parse" | "Array.isArray" | "Array.of" | "Array.from" | "Object.keys" | "Object.values" | "Object.entries" | "Object.fromEntries" | "Object.assign" | "Object.create" | "Object.freeze" | "Object.hasOwn" | "Object.is" | "Number.isNaN" | "Number.isFinite" | "Number.isInteger" | "Number.isSafeInteger" | "Number.parseInt" | "Number.parseFloat" | "String.fromCharCode" | "String.fromCodePoint" | "Promise.resolve" | "Promise.reject" | "Promise.all" | "Promise.race")
}
