//! The words `rx-declare` writes, proved from the code (DESIGN.md): `src/words.js` of the language server asks.
//!   `{ spec, from, exports: [{ name, kind: "fn" | "component", params: [type], handlers: [[index, field?]], refs: [path],
//!   ret: type, plain: [prop] }] }`  →  `{ unread? , exports: { name: { … } }, contexts: { exportName: key } }`.
//! A word holds under every host that can load the module (resolve.rs); one that loads what is not read leaves it unread.
pub mod constant;
pub mod dispatch;
pub mod eval;
pub mod graph;
pub mod patch;
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
use std::collections::{BTreeSet, HashSet};

struct Loaded { host: Host, hi: usize, entry: usize, files: BTreeSet<usize> }

/// Each host that reads another set of files than the ones before it.
fn hosts(mods: &Modules, spec: &str, from: &str) -> Result<Vec<Loaded>, String> {
    let (mut out, mut seen): (Vec<Loaded>, HashSet<(String, bool)>) = (vec![], HashSet::new());
    for (hi, h) in HOSTS.iter().enumerate() {
        let f = mods.res.borrow_mut().resolve(*h, spec, from);
        let entry = match mods.open(*h, &f) { Ok(e) => e, Err(Origin::Never) => continue, Err(Origin::Unknown(w)) => return Err(format!("{w} ({})", h.name)), Err(_) => return Err("not a module".into()) };
        let (files, sig, never, unread) = mods.reach(*h, hi, entry);
        // a file that is not read may do anything as it loads
        if let Some((i, s)) = unread.first() { return Err(format!("it loads {s}, which is not read ({}, {})", mods.get(*i).path, h.name)); }
        // a relative import this host cannot load: it loads no program with the module at all
        if never { continue; }
        if seen.insert((sig, h.browser)) { out.push(Loaded { host: *h, hi, entry, files }); }
    }
    if out.is_empty() { return Err("no host can load it".into()); }
    let more = others(mods, spec, from, &out, &mut seen)?;
    out.extend(more);
    // a built-in that a file changes: what the words are read with is not the language's
    for l in &out {
        let ty = Types::new();
        let p = Place::new(mods, l.host, l.hi, l.entry, &ty);
        if let Some((m, a, w)) = p.patches(&l.files) { let m = mods.get(m); return Err(format!("{w} ({}:{})", m.path, m.line(a))); }
    }
    Ok(out)
}
/// A host that asks with conditions the nine do not (`worker`, `deno`, `react-server`, a bundler's, a name of the package's
/// own), or with others of them together: where it loads other files, they are read too, or there are no words.
fn others(mods: &Modules, spec: &str, from: &str, loaded: &[Loaded], seen: &mut HashSet<(String, bool)>) -> Result<Vec<Loaded>, String> {
    let mut out = vec![];
    let mut all = BTreeSet::new();
    let mut dirs = HashSet::new();
    for l in loaded { for i in &l.files { let path = &mods.get(*i).path; if !dirs.insert(resolve::dirname(path).to_string()) { continue; } if let Some((_, pj)) = mods.res.borrow_mut().package_of(resolve::dirname(path)) { resolve::conditions(&pj, &mut all); } } }
    all.retain(|c| c != "default" && c != "import" && c != "require" && !c.starts_with("types"));
    let all: Vec<String> = all.into_iter().collect();
    let sets: Vec<Vec<String>> = if all.len() <= 8 { (0..1usize << all.len()).map(|b| all.iter().enumerate().filter(|(i, _)| b >> i & 1 == 1).map(|(_, c)| c.clone()).collect()).collect() }
        else {
            let (std, own): (Vec<String>, Vec<String>) = all.iter().cloned().partition(|c| resolve::READ.contains(&c.as_str()));
            let base: Vec<Vec<String>> = (0..1usize << std.len()).map(|b| std.iter().enumerate().filter(|(i, _)| b >> i & 1 == 1).map(|(_, c)| c.clone()).collect()).collect();
            let mut v = base.clone();
            for b in &base { for o in own.iter().map(|o| vec![o.clone()]).chain([own.clone()]) { v.push(b.iter().cloned().chain(o).collect()); } }
            v
        };
    for set in sets {
        // (no host is `development` and `production`)
        if set.iter().any(|c| c == "development") && set.iter().any(|c| c == "production") { continue; }
        let h = Host::with(&set);
        let hi = mods.number(h);
        let f = mods.res.borrow_mut().resolve(h, spec, from);
        let said = || format!("under the conditions {} it loads other files, which are not read", set.join(", "));
        let entry = match (&f, mods.open(h, &f)) { (_, Ok(e)) => e, (Found::File(_) | Found::Unknown(_), Err(_)) => { if matches!(&f, Found::Unknown(w) if w.ends_with("under these conditions")) { continue; } return Err(said()) } _ => continue };
        let (files, sig, never, unread) = mods.reach(h, hi, entry);
        if never { continue; }
        if !unread.is_empty() { return Err(said()); }
        let has = |c: &str| set.iter().any(|x| x == c);
        // (which of Solid's builds it loads, by the order of Solid's own conditions)
        let sides: &[bool] = if has("worker") { &[false] } else if has("browser") { &[true] } else if has("deno") || has("node") { &[false] } else { &[true] };
        for b in sides { if seen.insert((sig.clone(), *b)) { let mut h = h; h.browser = *b; let hi = mods.number(h); out.push(Loaded { host: h, hi, entry, files: files.clone() }); } }
        if out.len() > 24 { return Err("it loads other files under too many conditions".into()); }
    }
    Ok(out)
}

pub fn request(params: &Value, read: &Read) -> Value {
    let alloc = oxc_allocator::Allocator::default();
    let mods = Modules::new(&alloc, Resolver::new(read));
    let (spec, from) = (params["spec"].as_str().unwrap_or(""), params["from"].as_str().unwrap_or(""));
    mods.relative.set(spec.starts_with('.') || spec.starts_with('/'));
    let loaded = match hosts(&mods, spec, from) { Ok(l) => l, Err(w) => return json!({ "unread": w }) };
    if params["stat"] == true {
        let l = &loaded[loaded.len().min(2) - 1];
        let ty = Types::new();
        let p = Place::new(&mods, l.host, l.hi, l.entry, &ty);
        return json!({ "files": l.files.len(), "patch": p.patches(&l.files).map(|(m, a, w)| format!("{w} {}:{}", mods.get(m).path, mods.get(m).line(a))) });
    }
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
    // the conditions the package's maps ask about, besides those the nine hosts ask with: each was read too
    let mut asked = BTreeSet::new();
    for l in &loaded { for i in &l.files { if let Some((_, pj)) = mods.res.borrow_mut().package_of(resolve::dirname(&mods.get(*i).path)) { resolve::conditions(&pj, &mut asked); } } }
    asked.retain(|c| c != "default" && c != "import" && c != "require" && !c.starts_with("types") && !resolve::READ.contains(&c.as_str()));
    json!({ "exports": out, "conditions": asked, "contexts": ctx, "files": loaded.iter().map(|l| mods.get(l.entry).path.clone()).collect::<BTreeSet<_>>() })
}

fn context_key(mods: &Modules, m: usize, s: oxc_syntax::symbol::SymbolId) -> String { format!("{}#{}", mods.get(m).path, mods.get(m).scoping.symbol_name(s)) }
fn at(mods: &Modules, w: &str, m: usize, at: u32) -> Value { if m >= mods.len() { return json!({ "why": w }); } let x = mods.get(m); json!({ "why": w, "file": x.path, "line": x.line(at) }) }
fn said(mods: &Modules, w: &Why) -> Value { at(mods, &w.why, w.module, w.at) }
fn stopped(mods: &Modules, s: &Stop) -> Value { at(mods, &s.why, s.module, s.at) }

fn export(mods: &Modules, loaded: &[Loaded], x: &Value, name: &str) -> Value {
    if name.contains('.') { return json!({ "unread": "a method of an object the module exports: any importer may change it" }); }
    let mut types = Types::new();
    let params: Vec<u32> = x["params"].as_array().into_iter().flatten().map(|t| types.read(t)).collect();
    let ret = types.read(&x["ret"]);
    let is_fn = x["kind"] == "fn";
    let origins: Vec<Origin> = loaded.iter().map(|l| mods.exported(l.host, l.hi, l.entry, name, &mut vec![])).collect();
    for o in &origins { if let Origin::Unknown(w) = o { return json!({ "unread": w }); } }
    let places: Vec<Place> = loaded.iter().map(|l| Place::new(mods, l.host, l.hi, l.entry, &types)).collect();
    let fns: Option<Vec<eval::FnAt>> = places.iter().zip(&origins).map(|(p, o)| p.function(o)).collect();
    let mut out = Map::new();

    // ---- the reading of the call: pure
    let mut owned = false;
    if is_fn {
        let mut facts: Vec<Facts> = vec![];
        let mut stop = None;
        for (l, o) in loaded.iter().zip(&origins) {
            let mut e = Eval::new(mods, l.host, l.hi, &types);
            match e.export(o, &params, ret) { Ok(_) => facts.push(e.facts.clone()), Err(s) => { stop = Some(s); break; } }
        }
        if let Some(s) = &stop { out.insert("pure".into(), json!({ "ok": false, "why": stopped(mods, s) })); }
        else {
            owned = facts.iter().any(|f| f.owned);
            let makes = facts.iter().any(|f| f.makes);
            let differs = facts.windows(2).any(|w| w[0].files != w[1].files);
            let no = if let Some(s) = facts.iter().find_map(|f| f.later.as_ref()) { Some(stopped(mods, s)) }
                else if facts.iter().any(|f| f.answers_timer) { Some(json!({ "why": "it answers a timer" })) }
                else if facts.iter().any(|f| f.env && f.answers_data) { Some(json!({ "why": "it asks where it runs, and answers data" })) }
                else if differs && facts.iter().any(|f| f.answers_data) { Some(json!({ "why": "its code is another under another host, and it answers data" })) }
                else { None };
            // the functions it answers that are not shown to only compute: the row has to say each is one that does something (declare-infer.js)
            let parts: Vec<Value> = facts.iter().flat_map(|f| &f.parts).map(|(p, callable, s)| { let mut v = stopped(mods, s); v["path"] = json!(p); v["callable"] = json!(callable); v }).collect();
            out.insert("pure".into(), match no { Some(w) => json!({ "ok": false, "why": w }), None => json!({ "ok": true, "makes": makes, "owned": owned, "parts": parts, "why": { "why": if makes { "its own code only computes, and makes Solid nodes of its own" } else { "its own code only computes" } } }) });
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
    if is_fn {
        // ---- the parts that are readers
        let refs: Vec<&str> = x["refs"].as_array().into_iter().flatten().filter_map(|p| p.as_str()).filter(|p| { let path: Vec<&str> = if p.is_empty() { vec![] } else { p.split('.').collect() }; places.iter().zip(&fns).all(|(pl, f)| pl.reader(*f, &path, 0)) }).collect();
        out.insert("refs".into(), json!(refs));
    }
    Value::Object(out)
}
