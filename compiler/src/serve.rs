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
pub fn diagnostic_json(set: &crate::modules::ModuleSet, d: &crate::check::Diagnostic) -> Value {
    let file = d.file.clone().unwrap_or_else(|| set.entry.clone());
    let mut v = json!({ "file": file, "line": d.line, "code": d.code, "rule": d.rule, "message": d.msg });
    if let (Some(src), Some(p)) = (set.sources.get(&file), set.programs.get(&file)) {
        if let Some(r) = crate::spans::line_range(src, p, d.line.max(1) as usize) {
            let ((l0, c0), (l1, c1)) = (crate::spans::line_col(src, r.start), crate::spans::line_col(src, r.end));
            v["range"] = json!({ "start": { "line": l0, "column": c0 }, "end": { "line": l1, "column": c1 }, "offsets": [r.start, r.end] });
        }
    }
    v
}

/// A parse error's message without the `file: line n:` it carries (the diagnostic's own fields say where).
pub fn parse_message(e: &crate::parse::ParseError) -> &str {
    e.0.split_once("line ").filter(|(pre, _)| pre.is_empty() || pre.ends_with(": ")).and_then(|(_, r)| r.split_once(": ")).map(|(_, m)| m).unwrap_or(&e.0)
}

pub fn parse_error_in(file: &str, e: &crate::parse::ParseError, src: Option<&str>) -> Value {
    static RULE: std::sync::LazyLock<regex::Regex> = std::sync::LazyLock::new(|| regex::Regex::new(r"\b([A-Z]+-\d+[a-z]?)\b").unwrap());
    let rule = RULE.captures(&e.0).map(|c| c[1].to_string()).unwrap_or_else(|| "07".into());
    let mut v = json!({ "file": file, "code": e.3, "rule": rule, "message": parse_message(e) });
    if let (Some(at), Some(src)) = (e.1, src) {
        let at = at.min(src.len());
        let end = src[at..].find('\n').map(|j| at + j).unwrap_or(src.len());
        let end = at + src[at..end].trim_end().len();
        let ((l0, c0), (l1, c1)) = (crate::spans::line_col(src, at as u32), crate::spans::line_col(src, end as u32));
        v["line"] = json!(l0);
        v["range"] = json!({ "start": { "line": l0, "column": c0 }, "end": { "line": l1, "column": c1 }, "offsets": [at, end] });
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
    let own: Vec<Value> = if set.parse_errors.iter().any(|e| all || e.2.as_deref() == Some(file.as_str())) {
        set.parse_errors.iter().filter(|e| all || e.2.as_deref() == Some(file.as_str())).map(|e| { let f = e.2.clone().unwrap_or_else(|| file.clone()); let src = set.sources.get(&f).cloned(); parse_error_in(&f, e, src.as_deref()) }).collect()
    } else {
        crate::check::check_modules_hosts(&set, params["spa"].as_bool().unwrap_or(false), params["whole"].as_bool().unwrap_or(false), &hosts).diags.iter().map(|d| diagnostic_json(&set, d)).filter(|d| all || d["file"] == json!(file)).collect()
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
            own.push(diagnostic_json(&set, &mine));
            break;
        }
    }
    out["diagnostics"] = json!(own);
    out["modules"] = json!(set.order);
    // MO-8f, MO-8j, TY-6: the declarations this load consumed, each with its importer and the import's text
    out["declarations"] = json!(set.declaration_uses.iter().map(|u| json!({ "file": u.declaration, "importer": u.importer, "spec": u.spec })).collect::<Vec<_>>());
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
/// MO-8j, TY-7: a declaration file's rows as the parser reads them, for strict declarations: each row's name and kind,
/// the lines it spans (to the next row), whether it says `trusted`, and what running must show for it to be verified
/// (`obligations`, `parse::obligations`): rx-verify reads the same rows, and a record needs a result for each.
pub fn rows(params: &Value, disk: &dyn Fn(&str) -> Option<String>) -> Value {
    use crate::parse::JsDecl;
    let file = params["file"].as_str().unwrap_or_default();
    let Some(text) = params["text"].as_str().map(str::to_string).or_else(|| disk(file)) else { return json!({ "error": format!("cannot read {}", file) }) };
    // MO-13a: a printed signature's rows are what the compiler inferred, not assertions: none to verify (MO-8j)
    if crate::modules::is_printed_signature(&text) {
        return json!({ "signature": true, "rows": [] });
    }
    match crate::parse::parse_declaration_rows(&text) {
        Ok((decls, starts, trusted)) => {
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
                    };
                    json!({ "name": d.name(), "kind": kind, "line": line, "end": end, "trusted": trusted.iter().any(|t| *t >= line && *t <= end), "obligations": crate::parse::obligations(d) })
                })
                .collect();
            json!({ "rows": rows })
        }
        Err(e) => json!({ "error": e.0 }),
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
