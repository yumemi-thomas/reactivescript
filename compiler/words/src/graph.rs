//! The modules an import reaches, under one host: each parsed once, its names by symbol, what it imports and exports.
use super::resolve::{dirname, Found, Host, Resolver};
use oxc_allocator::Allocator;
use oxc_ast::{ast::*, AstKind};
use oxc_semantic::{AstNodes, NodeId, Scoping, SemanticBuilder};
use oxc_span::{GetSpan, SourceType, Span};
use oxc_syntax::symbol::SymbolId;
use std::cell::RefCell;
use std::collections::{HashMap, HashSet};

/// Solid's own: what it exports is known by name (DESIGN.md), and its code is not read.
pub fn is_solid(spec: &str) -> bool {
    matches!(spec, "solid-js" | "@solidjs/signals" | "@solidjs/web" | "@solidjs/universal") || spec.starts_with("solid-js/") || spec.starts_with("@solidjs/web/")
}

pub enum Export<'a> {
    Local(SymbolId),
    From(&'a str, &'a str),
    Ns(&'a str),
    Default(&'a ExportDefaultDeclarationKind<'a>),
}
pub struct Import<'a> { pub spec: &'a str, /** `None`: the namespace */ pub name: Option<&'a str> }

pub struct Module<'a> {
    pub path: String,
    pub source: &'a str,
    pub program: &'a Program<'a>,
    pub scoping: Scoping,
    pub nodes: AstNodes<'a>,
    pub imports: HashMap<SymbolId, Import<'a>>,
    pub exports: HashMap<&'a str, Export<'a>>,
    pub stars: Vec<&'a str>,
    /// Every symbol an export names: what any importer may reach.
    pub handed_out: std::collections::HashSet<SymbolId>,
    /// Why no name of the module can be told: a direct `eval`, a built-in it replaces.
    pub banned: Option<&'static str>,
    /// What it does with the built-ins as objects (patch.rs).
    pub patch: super::patch::Patch,
    /// Where an `await`, a `yield` or a `for await` begins, in order.
    waits: Vec<u32>,
    /// The functions whose own code (with its arrows') has `this`, `super`, `new.target` or `arguments`; the ones with `arguments`
    /// anywhere in them.
    pub with_this: HashSet<NodeId>,
    pub with_arguments: HashSet<NodeId>,
    returns: HashMap<NodeId, Vec<NodeId>>,
    lines: Vec<u32>,
}

/// The name at the root of a chain of members, and the first property read off it.
pub fn root_of<'b, 'a>(e: &'b Expression<'a>) -> Option<(&'b IdentifierReference<'a>, Option<&'b str>)> {
    let mut first = None;
    let mut e = e;
    loop {
        match e {
            Expression::Identifier(i) => return Some((i, first)),
            Expression::StaticMemberExpression(m) => { first = Some(m.property.name.as_str()); e = &m.object; }
            Expression::ComputedMemberExpression(m) => { first = None; e = &m.object; }
            Expression::ParenthesizedExpression(p) => e = &p.expression,
            _ => return None,
        }
    }
}

impl<'a> Module<'a> {
    pub fn parse(path: &str, text: &str, alloc: &'a Allocator) -> Option<Module<'a>> {
        let source: &'a str = alloc.alloc_str(text);
        let st = SourceType::from_path(path).ok()?.with_module(true);
        // (JSX in a `.js` is what the `solid` condition's files may hold)
        let st = if st.is_typescript() { st } else { st.with_jsx(true) };
        let ret = oxc_parser::Parser::new(alloc, source, st).parse();
        if ret.panicked || !ret.diagnostics.is_empty() { return None; }
        let program: &'a Program<'a> = alloc.alloc(ret.program);
        let sem = SemanticBuilder::new().with_build_nodes(true).build(program).semantic;
        let (scoping, nodes) = sem.into_scoping_and_nodes();
        let mut m = Module { path: path.to_string(), source, program, scoping, nodes, imports: HashMap::new(), exports: HashMap::new(), stars: vec![], handed_out: Default::default(), banned: None, patch: Default::default(), waits: vec![], with_this: HashSet::new(), with_arguments: HashSet::new(), returns: HashMap::new(), lines: source.bytes().enumerate().filter(|(_, b)| *b == b'\n').map(|(i, _)| i as u32).collect() };
        let mut esm = false;
        for s in &program.body {
            match s {
                Statement::ImportDeclaration(d) => {
                    esm = true;
                    if d.import_kind.is_type() { continue; }
                    for sp in d.specifiers.iter().flatten() {
                        let (local, name, ty) = match sp {
                            ImportDeclarationSpecifier::ImportSpecifier(s) => (&s.local, Some(s.imported.name().as_str()), s.import_kind.is_type()),
                            ImportDeclarationSpecifier::ImportDefaultSpecifier(s) => (&s.local, Some("default"), false),
                            ImportDeclarationSpecifier::ImportNamespaceSpecifier(s) => (&s.local, None, false),
                        };
                        if let (Some(id), false) = (local.symbol_id.get(), ty) { m.imports.insert(id, Import { spec: d.source.value.as_str(), name }); }
                    }
                }
                Statement::ExportAllDeclaration(d) => {
                    esm = true;
                    if d.export_kind.is_type() { continue; }
                    match &d.exported { Some(n) => { m.exports.insert(n.name().as_str(), Export::Ns(d.source.value.as_str())); } None => m.stars.push(d.source.value.as_str()) }
                }
                Statement::ExportDefaultDeclaration(d) => {
                    esm = true;
                    let e = match &d.declaration {
                        ExportDefaultDeclarationKind::FunctionDeclaration(f) => f.id.as_ref().and_then(|i| i.symbol_id.get()).map(Export::Local),
                        ExportDefaultDeclarationKind::ClassDeclaration(c) => c.id.as_ref().and_then(|i| i.symbol_id.get()).map(Export::Local),
                        ExportDefaultDeclarationKind::Identifier(i) => m.symbol(i).filter(|s| m.known_symbol(*s)).map(Export::Local),
                        _ => None,
                    };
                    // (`export default x` is the value then: an import of it is not the name)
                    m.exports.insert("default", e.unwrap_or(Export::Default(&d.declaration)));
                }
                Statement::ExportDeclaration(d) => {
                    esm = true;
                    match &d.declaration {
                        Declaration::VariableDeclaration(v) => for x in &v.declarations { each_binding(&x.id, &mut |b| { if let Some(id) = b.symbol_id.get() { m.exports.insert(b.name.as_str(), Export::Local(id)); } }) },
                        Declaration::FunctionDeclaration(f) => if let Some(b) = &f.id { if let Some(id) = b.symbol_id.get() { m.exports.insert(b.name.as_str(), Export::Local(id)); } },
                        Declaration::ClassDeclaration(c) => if let Some(b) = &c.id { if let Some(id) = b.symbol_id.get() { m.exports.insert(b.name.as_str(), Export::Local(id)); } },
                        _ => {}
                    }
                }
                Statement::ExportNamedDeclaration(d) => {
                    esm = true;
                    if d.export_kind.is_type() { continue; }
                    for s in &d.specifiers {
                        if s.export_kind.is_type() { continue; }
                        if let ModuleExportName::IdentifierReference(i) = &s.local { if let Some(id) = m.symbol(i) { m.exports.insert(s.exported.name().as_str(), Export::Local(id)); } }
                    }
                }
                Statement::ExportFromDeclaration(d) => {
                    esm = true;
                    if d.export_kind.is_type() { continue; }
                    for s in &d.specifiers { if !s.export_kind.is_type() { m.exports.insert(s.exported.name().as_str(), Export::From(d.source.value.as_str(), s.local.name().as_str())); } }
                }
                _ => {}
            }
        }
        if !esm { return None; }
        // what an import hands on under another name is handed out too
        let out: Vec<SymbolId> = m.exports.values().filter_map(|e| if let Export::Local(s) = e { Some(*s) } else { None }).collect();
        m.handed_out.extend(out);
        if let Some(Export::Default(ExportDefaultDeclarationKind::Identifier(i))) = m.exports.get("default") { if let Some(s) = m.symbol(i) { m.handed_out.insert(s); } }
        m.facts();
        m.patch = super::patch::read(&m);
        if let Some(w) = m.patch.done { m.banned = Some(w); }
        Some(m)
    }

    fn facts(&mut self) {
        let (mut marks, mut waits, mut returns): (_, _, HashMap<NodeId, Vec<NodeId>>) = (vec![], vec![], HashMap::new());
        for n in self.nodes.iter() {
            let id = n.id();
            match n.kind() {
                AstKind::AwaitExpression(x) => waits.push(x.span.start),
                AstKind::YieldExpression(x) => waits.push(x.span.start),
                AstKind::ForOfStatement(x) if x.r#await => waits.push(x.span.start),
                AstKind::ReturnStatement(_) => if let Some(f) = self.function_of(id) { returns.entry(f).or_default().push(id); },
                AstKind::ThisExpression(_) | AstKind::Super(_) | AstKind::NewTarget(_) => marks.push((id, false)),
                AstKind::IdentifierReference(i) if i.name == "arguments" && self.symbol(i).is_none() => marks.push((id, true)),
                _ => {}
            }
        }
        waits.sort_unstable();
        (self.waits, self.returns) = (waits, returns);
        for (id, arguments) in marks { self.mark_this(id, arguments); }
    }
    fn mark_this(&mut self, id: NodeId, arguments: bool) {
        let mut own = true;
        for a in self.nodes.ancestor_ids(id).collect::<Vec<_>>() {
            match self.nodes.kind(a) {
                AstKind::ArrowFunctionExpression(_) if own => { self.with_this.insert(a); }
                AstKind::Function(_) => { if own { self.with_this.insert(a); } own = false; if arguments { self.with_arguments.insert(a); } else { break; } }
                _ => {}
            }
        }
    }
    /// Whether a span has an `await` or a `yield`, whoever's: what is after it may be another turn.
    pub fn waits_in(&self, span: Span) -> bool { let i = self.waits.partition_point(|w| *w < span.start); self.waits.get(i).is_some_and(|w| *w < span.end) }
    pub fn returns_of(&self, f: NodeId) -> &[NodeId] { self.returns.get(&f).map_or(&[], |v| v) }

    /// Every module this one names: imported, exported from.
    pub fn specs(&self) -> Vec<&'a str> {
        let mut v: Vec<&'a str> = self.program.body.iter().filter_map(|s| match s {
            Statement::ImportDeclaration(d) if !d.import_kind.is_type() => Some(d.source.value.as_str()),
            Statement::ExportAllDeclaration(d) if !d.export_kind.is_type() => Some(d.source.value.as_str()),
            Statement::ExportFromDeclaration(d) if !d.export_kind.is_type() => Some(d.source.value.as_str()),
            _ => None,
        }).collect();
        v.sort_unstable();
        v.dedup();
        v
    }
    pub fn symbol(&self, i: &IdentifierReference) -> Option<SymbolId> { i.reference_id.get().and_then(|r| self.scoping.get_reference(r).symbol_id()) }
    /// A name with one declaration and no write but it: it stands for its first value.
    pub fn known_symbol(&self, s: SymbolId) -> bool {
        self.scoping.symbol_redeclarations(s).is_empty() && !self.scoping.symbol_is_mutated(s)
    }
    /// A name of the global scope, declared nowhere in the module.
    pub fn is_global(&self, i: &IdentifierReference, name: &str) -> bool { i.name == name && self.symbol(i).is_none() && self.banned.is_none() }
    pub fn line(&self, at: u32) -> usize { self.lines.partition_point(|l| *l < at) + 1 }
    /// The node around, past parentheses and TypeScript's wrappers.
    pub fn outer(&self, mut id: NodeId) -> NodeId {
        loop {
            let p = self.nodes.parent_id(id);
            match self.nodes.kind(p) {
                AstKind::ParenthesizedExpression(_) | AstKind::TSAsExpression(_) | AstKind::TSNonNullExpression(_) | AstKind::TSSatisfiesExpression(_) | AstKind::TSTypeAssertion(_) => id = p,
                _ => return id,
            }
        }
    }
    /// Whether a member expression is where something is written: assigned, counted, deleted, a pattern's target, a loop's.
    pub fn is_written(&self, id: NodeId) -> bool {
        let at = self.outer(id);
        let span = self.nodes.kind(at).span();
        match self.nodes.kind(self.nodes.parent_id(at)) {
            AstKind::AssignmentExpression(a) => a.left.span() == span,
            AstKind::UpdateExpression(_) => true,
            AstKind::UnaryExpression(u) => u.operator == UnaryOperator::Delete,
            AstKind::ChainExpression(_) => self.is_written(self.nodes.parent_id(at)),
            AstKind::ForInStatement(f) => f.left.span() == span,
            AstKind::ForOfStatement(f) => f.left.span() == span,
            AstKind::ArrayAssignmentTarget(_) | AstKind::AssignmentTargetRest(_) => true,
            AstKind::AssignmentTargetWithDefault(d) => d.binding.span() == span,
            AstKind::AssignmentTargetPropertyProperty(p) => p.binding.span() == span,
            AstKind::ObjectAssignmentTarget(_) => true,
            _ => false,
        }
    }
    pub fn scoping_write(&self, id: NodeId) -> bool { matches!(self.nodes.kind(id), AstKind::IdentifierReference(i) if i.reference_id.get().is_some_and(|r| self.scoping.get_reference(r).is_write())) }
    pub fn references(&self, s: SymbolId) -> Vec<NodeId> { self.scoping.get_resolved_references(s).map(|r| r.node_id()).collect() }
    /// The function a node is in: the nearest that is, or None (the module's own code).
    pub fn function_of(&self, id: NodeId) -> Option<NodeId> {
        self.nodes.ancestor_ids(id).find(|a| matches!(self.nodes.kind(*a), AstKind::Function(_) | AstKind::ArrowFunctionExpression(_)))
    }
    pub fn at_top(&self, s: SymbolId) -> bool { self.scoping.symbol_scope_id(s) == self.scoping.root_scope_id() }
}

pub fn each_binding<'b, 'a>(p: &'b BindingPattern<'a>, f: &mut dyn FnMut(&'b BindingIdentifier<'a>)) {
    match p {
        BindingPattern::BindingIdentifier(b) => f(b),
        BindingPattern::ObjectPattern(o) => { for x in &o.properties { each_binding(&x.value, f); } if let Some(r) = &o.rest { each_binding(&r.argument, f); } }
        BindingPattern::ArrayPattern(a) => { for x in a.elements.iter().flatten() { each_binding(x, f); } if let Some(r) = &a.rest { each_binding(&r.argument, f); } }
        BindingPattern::AssignmentPattern(a) => each_binding(&a.left, f),
    }
}

/// Every module read, by its path; None for one that is no ES module that parses.
pub struct Modules<'a, 'r> {
    alloc: &'a Allocator,
    pub res: RefCell<Resolver<'r>>,
    by_path: RefCell<HashMap<String, Option<usize>>>,
    /// Boxes that are never taken out, so that a reference to one stands as long as this does (`get`).
    #[allow(clippy::vec_box)]
    all: RefCell<Vec<Box<Module<'a>>>>,
    places: RefCell<HashMap<(usize, usize, String), Found>>,
}
/// What a name that is imported is.
#[derive(Clone)]
pub enum Origin<'a> { Symbol(usize, SymbolId), Default(usize, &'a ExportDefaultDeclarationKind<'a>), Ns(usize), Solid(&'a str), SolidNs, Unknown(String), Never }

impl<'a, 'r> Modules<'a, 'r> {
    pub fn new(alloc: &'a Allocator, res: Resolver<'r>) -> Self { Modules { alloc, res: RefCell::new(res), by_path: Default::default(), all: Default::default(), places: Default::default() } }
    pub fn get(&self, i: usize) -> &Module<'a> {
        let p: *const Module<'a> = &*self.all.borrow()[i];
        // SAFETY: a module is boxed when it is read and dropped with `self`; nothing takes one out or writes it.
        unsafe { &*p }
    }
    pub fn len(&self) -> usize { self.all.borrow().len() }
    fn load(&self, path: &str) -> Option<usize> {
        if let Some(r) = self.by_path.borrow().get(path) { return *r; }
        let text = self.res.borrow_mut().text(path);
        let m = text.filter(|t| t.len() < 6_000_000).and_then(|t| Module::parse(path, &t, self.alloc));
        let r = m.map(|m| { let mut all = self.all.borrow_mut(); all.push(Box::new(m)); all.len() - 1 });
        self.by_path.borrow_mut().insert(path.to_string(), r);
        r
    }
    pub fn find(&self, h: Host, hi: usize, spec: &str, from: usize) -> Found {
        let k = (hi, from, spec.to_string());
        if let Some(f) = self.places.borrow().get(&k) { return f.clone(); }
        let dir = dirname(&self.get(from).path).to_string();
        let f = self.res.borrow_mut().resolve(h, spec, &dir);
        self.places.borrow_mut().insert(k, f.clone());
        f
    }
    /// The module a specifier loads, as an index.
    pub fn open(&self, h: Host, f: &Found) -> Result<usize, Origin<'a>> {
        match f {
            Found::File(p) => {
                if h.node && p.ends_with(".js") {
                    let t = self.res.borrow_mut().package_of(dirname(p)).map(|(_, pj)| pj["type"].as_str().map(String::from));
                    if t.flatten().as_deref() == Some("commonjs") {
                    // (one that is written as an ES module fails to load there: no program runs it)
                    return Err(if self.load(p).is_some() { Origin::Never } else { Origin::Unknown(format!("{p} is a CommonJS module")) });
                    }
                }
                self.load(p).ok_or_else(|| Origin::Unknown(format!("{p} is no ES module that can be read")))
            }
            Found::Unknown(w) => Err(Origin::Unknown(w.clone())),
            Found::Never => Err(Origin::Never),
        }
    }
    /// Every name a module exports: None where a star of it is not read.
    pub fn every_name(&self, h: Host, hi: usize, mi: usize) -> Option<Vec<String>> {
        let (mut out, mut todo, mut seen) = (std::collections::BTreeSet::new(), vec![(mi, true)], std::collections::BTreeSet::new());
        while let Some((i, top)) = todo.pop() {
            if !seen.insert(i) { continue; }
            let m = self.get(i);
            out.extend(m.exports.keys().filter(|k| top || **k != "default").map(|k| k.to_string()));
            for s in &m.stars { if is_solid(s) { return None; } todo.push((self.open(h, &self.find(h, hi, s, i)).ok()?, false)); }
        }
        Some(out.into_iter().collect())
    }
    /// What `name` is, as an export of a module.
    pub fn exported(&self, h: Host, hi: usize, mi: usize, name: &str, seen: &mut Vec<(usize, String)>) -> Origin<'a> {
        if seen.iter().any(|(m, n)| *m == mi && n == name) { return Origin::Unknown(format!("{name} is exported in a circle")); }
        seen.push((mi, name.to_string()));
        let m = self.get(mi);
        match m.exports.get(name) {
            Some(Export::Local(s)) => return self.symbol(h, hi, mi, *s, seen),
            Some(Export::Default(d)) => return Origin::Default(mi, d),
            Some(Export::From(spec, n)) => return self.imported(h, hi, mi, spec, Some(n), seen),
            Some(Export::Ns(spec)) => return self.imported(h, hi, mi, spec, None, seen),
            None => {}
        }
        if name == "default" { return Origin::Unknown("no default export".into()); }
        let mut found: Option<Origin<'a>> = None;
        for spec in &m.stars {
            let o = if is_solid(spec) { return Origin::Unknown(format!("{name} may be Solid's")) } else {
                match self.open(h, &self.find(h, hi, spec, mi)) { Ok(i) => self.exported(h, hi, i, name, &mut seen.clone()), Err(e) => return e }
            };
            match (&o, &found) {
                (Origin::Unknown(w), _) if w == "not exported" => {}
                (Origin::Never, _) | (Origin::Unknown(_), _) => return o,
                (_, None) => found = Some(o),
                (Origin::Symbol(a, b), Some(Origin::Symbol(c, d))) if a == c && b == d => {}
                _ => return Origin::Unknown(format!("{name} is exported by two modules")),
            }
        }
        found.unwrap_or(Origin::Unknown("not exported".into()))
    }
    pub fn imported(&self, h: Host, hi: usize, mi: usize, spec: &'a str, name: Option<&'a str>, seen: &mut Vec<(usize, String)>) -> Origin<'a> {
        if is_solid(spec) { return match name { Some(n) => Origin::Solid(n), None => Origin::SolidNs }; }
        match self.open(h, &self.find(h, hi, spec, mi)) {
            Ok(i) => match name { Some(n) => self.exported(h, hi, i, n, seen), None => Origin::Ns(i) },
            Err(e) => e,
        }
    }
    /// What a module's name is: itself, or what it imports.
    pub fn symbol(&self, h: Host, hi: usize, mi: usize, s: SymbolId, seen: &mut Vec<(usize, String)>) -> Origin<'a> {
        let m = self.get(mi);
        match m.imports.get(&s) { Some(i) => self.imported(h, hi, mi, i.spec, i.name, seen), None => Origin::Symbol(mi, s) }
    }
}
