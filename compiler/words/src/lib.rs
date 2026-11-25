//! The words `rx-declare` writes, proved from the code (DESIGN.md): `src/words.js` of the language server asks.
//!   `{ spec, from, exports: [{ name, kind: "fn" | "component", params: [type], handlers: [[index, field?]], refs: [path],
//!   prims: [index], plain: [prop] }] }`  →  `{ unread? , exports: { name: { … } }, contexts: { exportName: key } }`.
//! A word holds under every host that can load the module (resolve.rs); one that loads what is not read leaves it unread.
pub mod constant;
pub mod dispatch;
pub mod eval;
pub mod graph;
pub mod place;
pub mod resolve;
pub mod target;
#[cfg(target_arch = "wasm32")]
pub mod wasm;

use eval::{Eval, Facts, Stop, Types};
use graph::{Modules, Origin};
use place::{Place, Why};
use resolve::{Found, Host, Read, Resolver, HOSTS};
use serde_json::{json, Map, Value};
use std::collections::{BTreeMap, BTreeSet, HashSet};

struct Loaded { host: Host, hi: usize, entry: usize }

/// Each host that reads another set of files than the ones before it.
fn hosts(mods: &Modules, spec: &str, from: &str) -> Result<Vec<Loaded>, String> {
    let (mut out, mut seen): (Vec<Loaded>, HashSet<String>) = (vec![], HashSet::new());
    for (hi, h) in HOSTS.iter().enumerate() {
        let f = mods.res.borrow_mut().resolve(*h, spec, from);
        let entry = match mods.open(*h, &f) { Ok(e) => e, Err(Origin::Never) => continue, Err(Origin::Unknown(w)) => return Err(format!("{w} ({})", h.name)), Err(_) => return Err("not a module".into()) };
        let mut sig = format!("{} ", h.browser);
        let (mut todo, mut done) = (vec![entry], BTreeSet::new());
        let mut never = false;
        while let Some(i) = todo.pop() {
            if !done.insert(i) { continue; }
            for s in mods.get(i).specs() {
                if graph::is_solid(s) { continue; }
                let f = mods.find(*h, hi, s, i);
                match mods.open(*h, &f) { Ok(j) => todo.push(j), Err(Origin::Never) => never |= s.starts_with('.'), Err(_) => {} }
                if let Found::File(p) = &f { sig.push_str(p); sig.push(' '); }
            }
        }
        // a relative import this host cannot load: it loads no program with the module at all
        if never { continue; }
        sig.push_str(&mods.get(entry).path);
        if seen.insert(sig) { out.push(Loaded { host: *h, hi, entry }); }
    }
    if out.is_empty() { return Err("no host can load it".into()); }
    Ok(out)
}

pub fn request(params: &Value, read: &Read) -> Value {
    let alloc = oxc_allocator::Allocator::default();
    let mods = Modules::new(&alloc, Resolver::new(read));
    let (spec, from) = (params["spec"].as_str().unwrap_or(""), params["from"].as_str().unwrap_or(""));
    let loaded = match hosts(&mods, spec, from) { Ok(l) => l, Err(w) => return json!({ "unread": w }) };
    if params["names"] == true {
        let mut all = BTreeSet::new();
        for l in &loaded { match mods.every_name(l.host, l.hi, l.entry) { Some(n) => all.extend(n), None => return json!({ "names": null }) } }
        return json!({ "names": all });
    }
    let mut out = Map::new();
    for x in params["exports"].as_array().into_iter().flatten() {
        let name = x["name"].as_str().unwrap_or("");
        out.insert(name.to_string(), export(&mods, &loaded, x, name));
    }
    let mut ctx = Map::new();
    let l = &loaded[0];
    for n in params["contexts"].as_array().into_iter().flatten().filter_map(|n| n.as_str()) {
        if let Origin::Symbol(m, s) = mods.exported(l.host, l.hi, l.entry, n, &mut vec![]) { ctx.insert(n.into(), json!(context_key(&mods, m, s))); }
    }
    json!({ "exports": out, "contexts": ctx, "files": loaded.iter().map(|l| mods.get(l.entry).path.clone()).collect::<BTreeSet<_>>() })
}

fn context_key(mods: &Modules, m: usize, s: oxc_syntax::symbol::SymbolId) -> String { format!("{}#{}", mods.get(m).path, mods.get(m).scoping.symbol_name(s)) }
fn at(mods: &Modules, w: &str, m: usize, at: u32) -> Value { if m >= mods.len() { return json!({ "why": w }); } let x = mods.get(m); json!({ "why": w, "file": x.path, "line": x.line(at) }) }
fn said(mods: &Modules, w: &Why) -> Value { at(mods, &w.why, w.module, w.at) }
fn stopped(mods: &Modules, s: &Stop) -> Value { at(mods, &s.why, s.module, s.at) }

fn export(mods: &Modules, loaded: &[Loaded], x: &Value, name: &str) -> Value {
    if name.contains('.') { return json!({ "unread": "a method of an object the module exports: any importer may change it" }); }
    let mut types = Types::new();
    let params: Vec<u32> = x["params"].as_array().into_iter().flatten().map(|t| types.read(t)).collect();
    let is_fn = x["kind"] == "fn";
    place::PRIMS.with(|p| *p.borrow_mut() = x["prims"].as_array().into_iter().flatten().filter_map(|n| n.as_u64().map(|n| n as usize)).collect());
    let origins: Vec<Origin> = loaded.iter().map(|l| mods.exported(l.host, l.hi, l.entry, name, &mut vec![])).collect();
    for o in &origins { if let Origin::Unknown(w) = o { return json!({ "unread": w }); } }
    let places: Vec<Place> = loaded.iter().map(|l| Place::new(mods, l.host, l.hi, l.entry, &types)).collect();
    let fns: Option<Vec<eval::FnAt>> = places.iter().zip(&origins).map(|(p, o)| p.function(o)).collect();
    let mut out = Map::new();

    // ---- the reading of the call: pure, rejects
    let mut owned = false;
    if is_fn {
        let mut facts: Vec<(Facts, BTreeMap<String, String>)> = vec![];
        let mut stop = None;
        for (l, o) in loaded.iter().zip(&origins) {
            let mut e = Eval::new(mods, l.host, l.hi, &types);
            match e.export(o, &params) {
                Ok(_) => {
                    let mut classes = BTreeMap::new();
                    if e.facts.throws.iter().any(|t| t != "Error") {
                        for n in mods.every_name(l.host, l.hi, l.entry).unwrap_or_default() { let o = mods.exported(l.host, l.hi, l.entry, &n, &mut vec![]); if let Some(k) = e.class_key(&o) { classes.entry(k).or_insert(n); } }
                    }
                    facts.push((e.facts.clone(), classes));
                }
                Err(s) => { stop = Some(s); break; }
            }
        }
        if let Some(s) = &stop { out.insert("pure".into(), json!({ "ok": false, "why": stopped(mods, s) })); }
        else {
            owned = facts.iter().any(|(f, _)| f.owned);
            let makes = facts.iter().any(|(f, _)| f.makes);
            let differs = facts.windows(2).any(|w| w[0].0.files != w[1].0.files);
            let no = if facts.iter().any(|(f, _)| f.answers_timer) { Some("it answers a timer") }
                else if facts.iter().any(|(f, _)| f.env && f.answers_data) { Some("it asks where it runs, and answers data") }
                else if differs && facts.iter().any(|(f, _)| f.answers_data) { Some("its code is another under another host, and it answers data") }
                else { None };
            out.insert("pure".into(), match no { Some(w) => json!({ "ok": false, "why": { "why": w } }), None => json!({ "ok": true, "makes": makes, "owned": owned, "why": { "why": if makes { "its own code only computes, and makes Solid nodes of its own" } else { "its own code only computes" } } }) });
            // rejects
            let mut names: Option<BTreeSet<String>> = Some(BTreeSet::new());
            for (f, classes) in &facts {
                if !(f.is_async || f.promise) || f.tries { names = None; break; }
                for t in &f.throws { match (classes.get(t), &mut names) { (Some(n), Some(s)) => { s.insert(n.clone()); } _ => names = None } }
                if names.is_none() { break; }
            }
            // (under every host the same)
            if let Some(s) = &names { if facts.windows(2).any(|w| w[0].0.throws.len() != w[1].0.throws.len()) { let _ = s; names = None; } }
            out.insert("rejects".into(), match names { Some(s) => json!(s), None => Value::Null });
        }
    }
    let Some(fns) = fns else { out.insert("unplaced".into(), json!("it is no function written out in the module, under a name nothing writes")); return Value::Object(out); };

    // ---- instantiates: the browser's builds
    let browsers: Vec<usize> = (0..loaded.len()).filter(|i| loaded[*i].host.browser).collect();
    let needs: Vec<Option<place::Hit>> = browsers.iter().map(|i| places[*i].needs_owner(fns[*i])).collect();
    let inst = !needs.is_empty() && needs.iter().all(|n| n.is_some());
    out.insert("instantiates".into(), if let (true, Some(Some(h))) = (inst, needs.first()) { let mut v = at(mods, &format!("every path calls Solid's {}, which needs an owner", h.api), h.module, h.at.start); v["ok"] = json!(true); v } else { json!({ "ok": false, "why": "no call that needs an owner is made on every path" }) });
    // an effect made on some path alone belongs to no one where there is no owner
    if owned && !inst { out.insert("pure".into(), json!({ "ok": false, "why": { "why": "it makes an effect or a cleanup, and not on every path: where there is no owner it belongs to no one" } })); }

    // ---- uses
    let uses: Vec<Vec<(usize, oxc_syntax::symbol::SymbolId, place::Hit)>> = places.iter().zip(&fns).map(|(p, f)| p.uses(*f)).collect();
    let names = |u: &Vec<(usize, oxc_syntax::symbol::SymbolId, place::Hit)>| u.iter().map(|(m, s, _)| mods.get(*m).scoping.symbol_name(*s).to_string()).collect::<BTreeSet<_>>();
    let same = uses.windows(2).all(|w| names(&w[0]) == names(&w[1]));
    let mut seen = BTreeSet::new();
    out.insert("uses".into(), if same { Value::Array(uses[0].iter().filter(|(m, s, _)| seen.insert((*m, s.index()))).map(|(m, s, h)| { let mut v = at(mods, "read on every path", h.module, h.at.start); v["key"] = json!(context_key(mods, *m, *s)); v["name"] = json!(mods.get(*m).scoping.symbol_name(*s)); v["of"] = json!(mods.get(*m).path); v }).collect()) } else { json!([]) });

    // ---- provides
    if x["kind"] == "component" {
        let plain: BTreeSet<String> = x["plain"].as_array().into_iter().flatten().filter_map(|n| n.as_str().map(String::from)).collect();
        let ps: Vec<Result<Vec<_>, Why>> = places.iter().zip(&fns).map(|(p, f)| p.provides(*f, &plain)).collect();
        let key = |v: &Vec<(usize, oxc_syntax::symbol::SymbolId)>| v.iter().map(|(m, s)| mods.get(*m).scoping.symbol_name(*s).to_string()).collect::<Vec<_>>();
        let ok = ps.iter().all(|p| p.is_ok()) && ps.windows(2).all(|w| matches!((&w[0], &w[1]), (Ok(a), Ok(b)) if key(a) == key(b)));
        out.insert("provides".into(), match (ok, &ps[0]) { (true, Ok(v)) => json!({ "ok": true, "list": v.iter().map(|(m, s)| json!({ "key": context_key(mods, *m, *s), "name": mods.get(*m).scoping.symbol_name(*s), "of": mods.get(*m).path })).collect::<Vec<_>>() }), _ => json!({ "ok": false, "why": ps.iter().find_map(|p| p.as_ref().err()).map(|w| said(mods, w)) }) });
    }
    // ---- handler
    let mut hs = Map::new();
    for h in x["handlers"].as_array().into_iter().flatten() {
        let (i, field) = (h[0].as_u64().unwrap_or(0) as usize, h[1].as_str());
        let rs: Vec<Result<Vec<Why>, Why>> = places.iter().zip(&fns).map(|(p, f)| p.handler(*f, i, field, &params)).collect();
        let v = match rs.iter().find_map(|r| r.as_ref().err()) { Some(w) => { let mut v = said(mods, w); v["ok"] = json!(false); v } None => { let mut v = rs[0].as_ref().ok().and_then(|l| l.first()).map(|w| said(mods, w)).unwrap_or(json!({})); v["ok"] = json!(true); v } };
        hs.insert(match field { Some(f) => format!("{i}.{f}"), None => i.to_string() }, v);
    }
    out.insert("handlers".into(), Value::Object(hs));
    // ---- draft
    if is_fn {
        let n = x["params"].as_array().map_or(0, |a| a.len());
        let mut d = Map::new();
        for i in 0..n {
            let rs: Vec<Result<Why, Why>> = places.iter().zip(&fns).map(|(p, f)| p.draft(*f, i)).collect();
            if let (true, Ok(w)) = (rs.iter().all(|r| r.is_ok()), &rs[0]) { d.insert(i.to_string(), said(mods, w)); }
        }
        out.insert("draft".into(), Value::Object(d));
        // ---- the parts that are readers
        let refs: Vec<&str> = x["refs"].as_array().into_iter().flatten().filter_map(|p| p.as_str()).filter(|p| { let path: Vec<&str> = if p.is_empty() { vec![] } else { p.split('.').collect() }; places.iter().zip(&fns).all(|(pl, f)| pl.reader(*f, &path, 0)) }).collect();
        out.insert("refs".into(), json!(refs));
    }
    Value::Object(out)
}
