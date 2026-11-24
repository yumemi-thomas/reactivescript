//! `rxc serve`'s requests (spec/11 CP-8e), for a language server: the native binary answers them a line at a time, the
//! WebAssembly build (`wasm.rs`) a call at a time, the same way. `disk` reads a file the editor does not have open.
use serde_json::{json, Value};
use std::collections::HashMap;

/// One request: `analyze` (`{file, overlays, prelude}`) or `prelude`.
pub fn request(method: &str, params: &Value, disk: &dyn Fn(&str) -> Option<String>) -> Value {
    match method {
        "analyze" => analyze(params, disk),
        "prelude" => json!(crate::project::PRELUDE),
        "boundary" => boundary(params, disk),
        "declaration" => declaration(params, disk),
        // MO-8k: where a package import's declaration is found from `file` (null: none of the four places has one)
        "rows" => rows(params, disk),
        "lookup" => json!(crate::modules::declaration_for(params["file"].as_str().unwrap_or(""), params["spec"].as_str().unwrap_or(""), disk)),
        _ => json!({ "error": "unknown method" }),
    }
}

/// `rxc check --json`: a diagnostic with its range (CP-8), for an editor or an agent. Lines are 1-based, columns 0-based in
/// UTF-16 code units, as LSP counts; `start`/`end` are byte offsets; `rule` names the spec rule (spec/99).
pub struct Diagnostics<'a> {
    set: &'a crate::modules::ModuleSet,
    ranges: HashMap<String, crate::spans::Ranges<'a>>,
}
impl<'a> Diagnostics<'a> {
    pub fn new(set: &'a crate::modules::ModuleSet) -> Self {
        Diagnostics { set, ranges: HashMap::new() }
    }
    pub fn json(&mut self, d: &crate::check::Diagnostic) -> Value {
        let set = self.set;
        let file = d.file.clone().unwrap_or_else(|| set.entry.clone());
        let mut v = json!({ "file": file, "line": d.line, "code": d.code, "rule": d.rule, "message": d.msg });
        if let (Some(src), Some(p)) = (set.sources.get(&file), set.programs.get(&file)) {
            let ranges = self.ranges.entry(file).or_insert_with(|| crate::spans::Ranges::new(src, p));
            if let Some(r) = ranges.of(d.line.max(1) as usize) {
                v["range"] = range_json(&ranges.lines, r.start as usize, r.end as usize);
            }
        }
        v
    }
}
fn range_json(lines: &crate::spans::Lines, start: usize, end: usize) -> Value {
    let ((l0, c0), (l1, c1)) = (lines.line_col(start), lines.line_col(end));
    json!({ "start": { "line": l0, "column": c0 }, "end": { "line": l1, "column": c1 }, "offsets": [start, end] })
}

/// A parse error's message without the `file: line n:` it carries (the diagnostic's own fields say where).
pub fn parse_message(e: &crate::parse::ParseError) -> &str {
    e.0.split_once("line ").filter(|(pre, _)| pre.is_empty() || pre.ends_with(": ")).and_then(|(_, r)| r.split_once(": ")).map(|(_, m)| m).unwrap_or(&e.0)
}

pub fn parse_error_in(file: &str, e: &crate::parse::ParseError, src: Option<&str>) -> Value {
    parse_error_at(file, e, src.map(crate::spans::Lines::new).as_ref())
}
fn parse_error_at(file: &str, e: &crate::parse::ParseError, lines: Option<&crate::spans::Lines>) -> Value {
    static RULE: std::sync::LazyLock<regex::Regex> = std::sync::LazyLock::new(|| regex::Regex::new(r"\b([A-Z]+-\d+[a-z]?)\b").unwrap());
    let rule = RULE.captures(&e.0).map(|c| c[1].to_string()).unwrap_or_else(|| "07".into());
    let mut v = json!({ "file": file, "code": e.3, "rule": rule, "message": parse_message(e) });
    if let (Some(at), Some(lines)) = (e.1, lines) {
        let (at, end) = lines.rest(at);
        v["line"] = json!(lines.line(at));
        v["range"] = range_json(lines, at, end);
    }
    v
}

/// UTF-16 offsets of a text's byte offsets (what JavaScript strings, Volar and LSP index by).
pub fn utf16_index(s: &str) -> Vec<u32> {
    let mut idx = vec![0u32; s.len() + 1];
    let mut u = 0u32;
    for (b, ch) in s.char_indices() {
        for k in 0..ch.len_utf8() {
            idx[b + k] = u;
        }
        u += ch.len_utf16() as u32;
    }
    idx[s.len()] = u;
    idx
}

/// `rxc serve`, one request: `{file, overlays: {path: text}, prelude}` — the file loaded (and its imports) as an editor
/// has them, recovering (CP-8e); its projection with mappings in UTF-16 offsets, and its diagnostics: the parse's, else
/// the checker's.
pub fn analyze(params: &Value, disk: &dyn Fn(&str) -> Option<String>) -> Value {
    let file = params["file"].as_str().unwrap_or_default().to_string();
    let overlays: HashMap<String, String> = params["overlays"].as_object().map(|o| o.iter().filter_map(|(k, v)| Some((k.clone(), v.as_str()?.to_string()))).collect()).unwrap_or_default();
    let read = |p: &str| overlays.get(p).cloned().or_else(|| disk(p));
    let set = match crate::modules::load_modules_recovering(&file, &read) {
        Ok(s) => s,
        Err(e) => {
            let src = e.2.as_deref().and_then(|f| read(f));
            return json!({ "diagnostics": [parse_error_in(e.2.as_deref().unwrap_or(&file), &e, src.as_deref())] });
        }
    };
    let src = set.sources.get(&file).cloned().unwrap_or_default();
    let prelude = params["prelude"].as_str();
    let mut out = json!({ "code": null, "mappings": [] });
    if let Some(p) = crate::project::project_modules_with(&set, prelude).into_iter().find(|p| p.rx == file) {
        let (gi, si) = (utf16_index(&p.code), utf16_index(&src));
        let maps: Vec<[u32; 3]> = p.mappings.iter().map(|m| [gi[m.gen as usize], si[m.src as usize], si[(m.src + m.len) as usize] - si[m.src as usize]]).collect();
        let u = |i: &[u32], a: u32, n: u32| [i[a as usize], i[(a + n) as usize] - i[a as usize]];
        let ranges: Vec<[u32; 4]> = p.ranges.iter().map(|r| { let (g, s) = (u(&gi, r.gen, r.glen), u(&si, r.src, r.len)); [g[0], g[1], s[0], s[1]] }).collect();
        out = json!({ "code": p.code, "mappings": maps, "ranges": ranges });
    }
    // `whole` (E-5a): the loaded modules checked as the whole program, `hosts` the modules a JS host imports with ?rx-lib
    // (as a build is checked, `app.rs`); `all`: every loaded module's diagnostics, not only the file's (`rx-tsc
    // --rx-whole-program`, which checks from each program's entry)
    let all = params["all"].as_bool().unwrap_or(false);
    let hosts: Vec<String> = params["hosts"].as_array().map(|a| a.iter().filter_map(|h| h.as_str().map(|h| h.replace('\\', "/"))).collect()).unwrap_or_default();
    let hosts = crate::modules::hosts_as_keys(&set, &hosts);
    let mut ranges = Diagnostics::new(&set);
    let own: Vec<Value> = if set.parse_errors.iter().any(|e| all || e.2.as_deref() == Some(file.as_str())) {
        let mut lines: HashMap<&str, crate::spans::Lines> = HashMap::new();
        set.parse_errors
            .iter()
            .filter(|e| all || e.2.as_deref() == Some(file.as_str()))
            .map(|e| {
                let f = e.2.as_deref().unwrap_or(&file);
                let lines = set.sources.get(f).map(|src| &*lines.entry(f).or_insert_with(|| crate::spans::Lines::new(src)));
                parse_error_at(f, e, lines)
            })
            .collect()
    } else {
        crate::check::check_modules_hosts(&set, params["spa"].as_bool().unwrap_or(false), params["whole"].as_bool().unwrap_or(false), &hosts).diags.iter().map(|d| ranges.json(d)).filter(|d| all || d["file"] == json!(file)).collect()
    };
    // MO-5, per module: a cycle is found where it closes, so its diagnostic sits on the import that closes it — in another
    // module than the one an editor (or per-module rx-tsc) analyses, which then passed in silence. Each module on the
    // cycle has it, at its own import that goes on around it.
    let mut own = own;
    if !all && !own.iter().any(|d| d["code"] == json!("MODULE_CYCLE")) {
        for d in set.diags.iter().filter(|d| d.code == "MODULE_CYCLE" && d.file.as_deref() != Some(file.as_str())) {
            let chain: Vec<&str> = d.msg.split(": modules may not").next().unwrap_or_default().split(" → ").collect();
            let Some(i) = chain.iter().position(|m| *m == file) else { continue };
            let Some(next) = chain.get(i + 1) else { continue };
            let line = set.programs.get(&file).and_then(|p| p.decls.iter().find_map(|x| match x {
                crate::ast::Decl::Import { resolved: Some(r), line, .. } if r == next => Some(*line as i64),
                _ => None,
            }));
            let Some(line) = line else { continue };
            let mine = crate::check::Diagnostic { code: d.code.clone(), rule: d.rule.clone(), line, msg: d.msg.clone(), file: Some(file.clone()) };
            own.push(ranges.json(&mine));
            break;
        }
    }
    out["diagnostics"] = json!(own);
    out["modules"] = json!(set.order);
    // MO-8f, MO-8j, TY-6: the declarations this load consumed, each with its importer and the import's text
    let mut uses: Vec<Value> = set.declaration_uses.iter().map(|u| json!({ "file": u.declaration, "importer": u.importer, "spec": u.spec })).collect();
    // MO-14e: the host declaration this program is under is a declaration it is checked by — and what that declaration
    // imports from JavaScript (MO-14f) is consumed through it, by the declaration's own place
    if let Some(h) = &set.host {
        out["host"] = json!(h.file);
        let own = format!("{}.host.d.rx", h.file);
        for u in h.set.declaration_uses.iter().filter(|u| u.importer == h.entry && u.declaration != own) {
            let v = json!({ "file": u.declaration, "importer": h.file, "spec": u.spec });
            if !uses.contains(&v) {
                uses.push(v);
            }
        }
    }
    out["declarations"] = json!(uses);
    out
}


/// `boundary` (`{file, text?, module}`): a TypeScript file that checks a `.d.rx` against the JS module it declares
/// (TY-6): each export's declared row as a type, then the module's real export assigned to it. `checks` maps each
/// assignment's line in `code` (1-based) to the declaration's line and name, so a type error lands on the `.d.rx`.
pub fn boundary(params: &Value, disk: &dyn Fn(&str) -> Option<String>) -> Value {
    let file = params["file"].as_str().unwrap_or_default();
    let module = params["module"].as_str().unwrap_or_default();
    let Some(text) = params["text"].as_str().map(str::to_string).or_else(|| disk(file)) else { return json!({ "error": format!("cannot read {}", file) }) };
    // MO-13a: a printed signature declares no JS module: its rows are the compiler's, and nothing is held against types here
    if crate::modules::is_printed_signature(&text) {
        return json!({ "signature": true, "code": "export {};\n", "checks": [] });
    }
    match crate::parse::parse_declarations(&text) {
        Ok(decls) => {
            let (code, checks, overlay) = crate::project::boundary_checks(&decls, module);
            let mut all: Vec<Value> = checks.iter().map(|(at, line, name)| json!({ "at": at, "line": line, "name": name })).collect();
            // MO-8o: a field of a props' record against the library's type for that prop; `says` is the finding
            all.extend(overlay.iter().map(|o| json!({ "at": o.at, "line": o.line, "name": o.name, "prop": o.prop, "overlay": if o.has { "has" } else { "type" }, "says": o.says })));
            json!({ "code": code, "checks": all })
        }
        Err(e) => json!({ "error": e.0 }),
    }
}

/// `declaration` (`{file, text?}`): the `.d.ts` a `.d.rx` stands for (TY-4b), for a JS module that has no TypeScript types
/// of its own: what `rx-tsc` gives TypeScript in its place.
/// MO-8j, TY-7: a declaration file's rows as the parser reads them: each row's name and kind, the lines it spans (to
/// the next row), what running must show for it to be verified (`obligations`, `parse::obligations`), and what the row
/// says (`facts`). Every tool that asks what a row means — rx-verify, the strict record, the audit, the benchmark —
/// reads these, so none reads the row's text for itself.
pub fn rows(params: &Value, disk: &dyn Fn(&str) -> Option<String>) -> Value {
    use crate::parse::JsDecl;
    let file = params["file"].as_str().unwrap_or_default();
    let Some(text) = params["text"].as_str().map(str::to_string).or_else(|| disk(file)) else { return json!({ "error": format!("cannot read {}", file) }) };
    // MO-13a: a printed signature's rows are what the compiler inferred, not assertions: none to verify (MO-8j)
    if crate::modules::is_printed_signature(&text) {
        return json!({ "signature": true, "rows": [] });
    }
    match crate::parse::parse_declaration_rows(&text) {
        Ok((decls, starts)) => {
            let last = text.lines().count().max(1);
            let rows: Vec<Value> = decls
                .iter()
                .enumerate()
                .map(|(i, d)| {
                    let line = starts[i];
                    let end = starts.get(i + 1).map(|n| n - 1).unwrap_or(last);
                    let kind = match d {
                        JsDecl::Fn { .. } => "fn",
                        JsDecl::Comp { .. } => "component",
                        JsDecl::Error { .. } => "error",
                        JsDecl::Value { .. } => "const",
                        JsDecl::Type { .. } => "type",
                        JsDecl::Context { .. } => "context",
                        JsDecl::Import { .. } => "import",
                        JsDecl::Host { .. } => "host",
                    };
                    let mut facts = facts(d);
                    facts["types"] = json!(type_places(d));
                    if let JsDecl::Host { span, .. } = d {
                        facts["tree"] = json!(text.get(span.1..span.2).unwrap_or_default().trim()); // MO-14b: the view, as written
                    }
                    json!({ "name": d.name(), "kind": kind, "line": line, "end": end, "obligations": crate::parse::obligations(d), "facts": facts })
                })
                .collect();
            json!({ "rows": rows })
        }
        Err(e) => json!({ "error": e.0 }),
    }
}

/// Every place of a row a type is written at, in the order the row writes them, each under a name: `tparams`,
/// `param:0`, `param:1.onDone` (a field of a record written there), `result`, `result.0` (an item of a tuple), `param:0.()0` and `param:0.=>` (a function type's
/// parameter and result), `.<0>` (a type argument), `.|0` (a member of a union), `.[]` (an array's element), `props`
/// (a component's props where they are a type the library names), `prop:label`, `type` (a value's, an alias's). What a
/// tool compares two rows of one export by: an `any` at one place says nothing of another (09 MO-8q).
fn type_places(d: &crate::parse::JsDecl) -> Vec<(String, String)> {
    use crate::parse::{split_top, JsDecl};
    /// Where the bracket `t` starts with is closed.
    fn closes_at(t: &str) -> Option<usize> {
        let (mut depth, mut quote) = (0i64, None::<char>);
        for (i, ch) in t.char_indices() {
            match quote {
                Some(q) => {
                    if ch == q {
                        quote = None;
                    }
                }
                None if "\"'`".contains(ch) => quote = Some(ch),
                None if "([{<".contains(ch) => depth += 1,
                None if ")]}".contains(ch) || (ch == '>' && !t[..i].ends_with('=')) => {
                    depth -= 1;
                    if depth == 0 {
                        return Some(i);
                    }
                }
                None => {}
            }
        }
        None
    }
    fn walk(id: String, t: &str, out: &mut Vec<(String, String)>) {
        let t = t.trim();
        if t.is_empty() {
            return;
        }
        let end = closes_at(t);
        let whole = end == Some(t.len() - 1);
        // `(a: A) => R`: each parameter and the result are places of their own
        if t.starts_with('(') {
            if let Some((e, r)) = end.and_then(|e| t[e + 1..].trim_start().strip_prefix("=>").map(|r| (e, r))) {
                for (k, p) in split_top(&t[1..e], ",").iter().enumerate() {
                    walk(format!("{id}.(){k}"), p.split_once(':').map_or(p.as_str(), |(_, ty)| ty), out);
                }
                return walk(format!("{id}.=>"), r, out);
            }
            if whole {
                return walk(id, &t[1..t.len() - 1], out);
            }
        }
        let members = split_top(t, "|&");
        if members.iter().filter(|m| !m.trim().is_empty()).count() > 1 {
            for (k, m) in members.iter().enumerate() {
                walk(format!("{id}.|{k}"), m, out);
            }
            return;
        }
        if let Some(of) = t.strip_suffix("[]") {
            return walk(format!("{id}.[]"), of, out);
        }
        let body = t.strip_prefix("readonly").map(str::trim_start).filter(|r| r.starts_with('[')).unwrap_or(t);
        let shut = closes_at(body) == Some(body.len() - 1);
        if body.starts_with('{') && shut {
            for (k, f) in split_top(&body[1..body.len() - 1], ",;").iter().enumerate() {
                let name = f.find(':').map(|i| f[..i].trim().trim_start_matches("readonly ").trim().trim_end_matches('?').to_string()).filter(|n| !n.is_empty() && n.chars().all(|c| c.is_alphanumeric() || c == '_' || c == '$'));
                match name {
                    Some(n) => walk(format!("{id}.{n}"), &f[f.find(':').unwrap() + 1..], out),
                    None => out.push((format!("{id}.#{k}"), f.clone())), // a method, an index signature: a place of its own
                }
            }
        } else if body.starts_with('[') && shut {
            for (k, x) in split_top(&body[1..body.len() - 1], ",").iter().enumerate() {
                walk(format!("{id}.{k}"), x, out);
            }
        } else if let Some(lt) = body.find('<').filter(|&i| i > 0 && body[..i].chars().all(|c| c.is_alphanumeric() || "_$.".contains(c)) && closes_at(&body[i..]).is_some_and(|e| i + e == body.len() - 1)) {
            for (k, x) in split_top(&body[lt + 1..body.len() - 1], ",").iter().enumerate() {
                walk(format!("{id}.<{k}>"), x, out);
            }
        } else {
            out.push((id, t.to_string()));
        }
    }
    let mut out = vec![];
    match d {
        JsDecl::Fn { ptypes, ret, tparams, .. } => {
            if let Some(t) = tparams {
                out.push(("tparams".to_string(), t.clone()));
            }
            for (i, t) in ptypes.iter().enumerate() {
                walk(format!("param:{i}"), t.as_deref().unwrap_or(""), &mut out);
            }
            walk("result".to_string(), ret.as_deref().unwrap_or(""), &mut out);
        }
        JsDecl::Comp { props, tparams, props_type, .. } => {
            if let Some(t) = tparams {
                out.push(("tparams".to_string(), t.clone()));
            }
            if let Some(t) = props_type {
                out.push(("props".to_string(), t.clone()));
            }
            for p in props {
                walk(format!("prop:{}", p.name), p.ty.as_deref().unwrap_or(""), &mut out);
            }
        }
        JsDecl::Value { ty, .. } => walk("type".to_string(), ty.as_deref().unwrap_or(""), &mut out),
        JsDecl::Type { text, .. } => walk("type".to_string(), text, &mut out),
        JsDecl::Error { .. } | JsDecl::Context { .. } | JsDecl::Import { .. } | JsDecl::Host { .. } => {}
    }
    out
}
/// What a row says, as the parser read it. A fn: its words (`pure`, `side`, `instantiates`, `rejects`, `uses`,
/// `provides`, `nests`, `renders`), its parameters (`name`, `type`, `ref`, `draft`, `optional`, `rest`), its callback
/// positions (`callbacks`: `index`, `name`, `field`, `handler`), its result (`result`, TypeScript's text; `shape`; and
/// `parts`, every place a read of the result may be asked about — the whole result when it is a `ref`, a tuple's items,
/// a record's fields, a plain record below a field too — each with `ref`, `pending`, `fails`, `draft`). A component: its
/// props (`name`, `type`, `optional`, `function`, `handler`, `render`, `component`, `components`, `view`) and its words.
fn facts(d: &crate::parse::JsDecl) -> Value {
    use crate::parse::{split_top, JsDecl, Part, Shape};
    match d {
        JsDecl::Fn { pure, params, rejects, side, ptypes, ret, refs, shape, instantiates, uses, provides, nests, held, opts, waits, part_drafts, draft_args, renders, cbs, .. } => {
            let ps: Vec<Value> = params
                .iter()
                .enumerate()
                .map(|(i, n)| json!({ "name": n.trim_start_matches("..."), "type": ptypes.get(i).cloned().flatten(), "ref": refs.get(i).copied().unwrap_or(false), "draft": draft_args.contains(&i), "optional": opts.get(i).copied().unwrap_or(false), "rest": n.starts_with("...") }))
                .collect();
            let cbs: Vec<Value> = crate::parse::callbacks_of(params, ptypes, cbs).into_iter().map(|c| json!({ "index": c.index, "name": c.name, "field": c.field, "handler": c.handler })).collect();
            let rows = |key: &str| held.iter().find(|h| h.0 == key).map(|h| (h.1, h.2.clone())).unwrap_or_default();
            let part = |path: Vec<String>, kind: Part, rows: (bool, Vec<String>)| json!({ "path": path, "ref": kind == Part::Ref, "fn": kind == Part::Fn, "pending": rows.0, "fails": rows.1, "draft": path.len() == 1 && part_drafts.iter().any(|p| p.0 == path[0]) });
            // a plain record below a field is read field by field as well: a read that waits or fails there has no row
            fn below(t: &str, path: &[String], out: &mut Vec<Value>) -> bool {
                let t = t.trim();
                if !(t.len() >= 2 && t.starts_with('{') && t.ends_with('}')) {
                    return false;
                }
                for f in split_top(&t[1..t.len() - 1], ",;") {
                    let Some(i) = f.find(':') else { continue };
                    let k = f[..i].trim().trim_start_matches("readonly ").trim().trim_end_matches('?').to_string();
                    if k.is_empty() || !k.chars().all(|c| c.is_alphanumeric() || c == '_' || c == '$') {
                        continue;
                    }
                    let p: Vec<String> = path.iter().cloned().chain([k]).collect();
                    if !below(&f[i + 1..], &p, out) {
                        out.push(json!({ "path": p, "ref": false, "fn": false, "pending": false, "fails": [], "draft": false }));
                    }
                }
                true
            }
            let ret_text = ret.as_deref().unwrap_or("");
            let body = ret_text.trim().strip_prefix("readonly").map(str::trim).filter(|r| r.starts_with('[')).unwrap_or(ret_text.trim());
            let mut parts: Vec<Value> = vec![];
            let kind = match shape {
                Shape::Comp => "comp",
                Shape::Part(Part::Ref) => {
                    parts.push(part(vec![], Part::Ref, waits.clone().unwrap_or_default()));
                    "ref"
                }
                Shape::Part(Part::Fn) => "fn",
                Shape::Part(Part::Value) => "value",
                Shape::Items(items) => {
                    parts.extend(items.iter().enumerate().map(|(i, k)| part(vec![i.to_string()], *k, rows(&i.to_string()))));
                    "items"
                }
                Shape::Fields(fields) => {
                    let texts = if body.len() >= 2 { split_top(&body[1..body.len() - 1], ",;") } else { vec![] };
                    for (i, (name, k)) in fields.iter().enumerate() {
                        let ty = texts.get(i).and_then(|f| f.find(':').map(|at| f[at + 1..].to_string())).unwrap_or_default();
                        if *k != Part::Value || !below(&ty, std::slice::from_ref(name), &mut parts) {
                            parts.push(part(vec![name.clone()], *k, rows(name)));
                        }
                    }
                    "fields"
                }
            };
            json!({ "pure": pure, "side": side.map(|s| s.as_str()), "instantiates": instantiates, "rejects": rejects, "uses": uses, "provides": provides, "nests": nests.as_ref().map(|(kids, inside)| json!({ "kids": kids, "inside": inside })), "renders": renders, "params": ps, "callbacks": cbs, "result": ret, "shape": kind, "parts": parts })
        }
        JsDecl::Comp { props, fails, uses, provides, props_type, .. } => {
            let ps: Vec<Value> = props.iter().map(|p| json!({ "name": p.name, "type": p.ty, "optional": p.optional, "function": p.callback || p.pure, "handler": p.callback, "render": p.render, "component": p.component, "components": p.components, "view": p.view })).collect();
            json!({ "props": ps, "propsType": props_type, "fails": fails, "uses": uses, "provides": provides })
        }
        JsDecl::Error { fields, .. } => json!({ "fields": fields }),
        JsDecl::Type { text, .. } => json!({ "type": text }),
        JsDecl::Value { ty, .. } => json!({ "type": ty }),
        JsDecl::Context { from, .. } => json!({ "from": from }),
        JsDecl::Import { names, from, .. } => json!({ "names": names.iter().map(|(n, a)| json!([n, a])).collect::<Vec<_>>(), "from": from }),
        JsDecl::Host { provides, nests, .. } => json!({ "provides": provides, "nests": nests.as_ref().map(|(kids, inside)| json!({ "kids": kids, "inside": inside })) }),
    }
}

pub fn declaration(params: &Value, disk: &dyn Fn(&str) -> Option<String>) -> Value {
    let file = params["file"].as_str().unwrap_or_default();
    let Some(text) = params["text"].as_str().map(str::to_string).or_else(|| disk(file)) else { return json!({ "error": format!("cannot read {}", file) }) };
    // MO-13a: a printed signature carries rows, not types: its module's types are the `.d.ts` shipped beside it (TY-4c)
    if crate::modules::is_printed_signature(&text) {
        return json!({ "signature": true });
    }
    match crate::parse::parse_declarations(&text) {
        Ok(decls) => json!({ "code": crate::project::declaration_file(&decls) }),
        Err(e) => json!({ "error": e.0 }),
    }
}
