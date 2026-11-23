//! A program compiled for a bundler (spec/11 CP-4b): every module of the program `entry` starts, through Solid's
//! compiler for `target`, each importing its dependencies by `.rx` path, with the program's stylesheet. What `rxc app`
//! prints and the Node-API build (`src/node.rs`) returns to `@reactivescript/compiler/vite`.
use crate::check::check_modules;
use crate::emit::{compile_linked_as, lower_view, Target};
use crate::modules::load_modules;
use serde_json::{json, Map, Value};
use std::path::Path;

pub fn read_disk(p: &str) -> Option<String> {
    if Path::new(p).is_file() {
        std::fs::read_to_string(p).ok()
    } else {
        None
    }
}

pub fn target(name: &str) -> Target {
    match name {
        "ssr" => Target::Ssr,
        "universal" => Target::Universal,
        _ => Target::Dom,
    }
}

/// `{entry, css, modules: {path: {code, map, css}}}` (the program's stylesheet, and each module's own; for a library,
/// `components`: its exported components' names), or `{diagnostics: [...]}` / `{error}`; each with `asked`, the files the
/// program was read from or looked for. `entry` is an absolute path.
/// `spa`: a client-only build, checked under 08 CN-3d.
pub fn app(entry: &str, target: Target, module_name: &str, spa: bool) -> Value {
    app_as(entry, target, module_name, spa, false)
}
/// CP-4d: `library`, the entry's exports for a JS host (`compile_linked_as`).
pub fn app_as(entry: &str, target: Target, module_name: &str, spa: bool, library: bool) -> Value {
    app_whole(entry, target, module_name, spa, library, false, &[])
}
/// E-5a: `whole`, the program's modules checked as the whole program, with `hosts` the modules a JS host imports with
/// `?rx-lib` (their exported components are applied by JS).
pub fn app_whole(entry: &str, target: Target, module_name: &str, spa: bool, library: bool, whole: bool, hosts: &[String]) -> Value {
    app_with(entry, target, module_name, spa, library, whole, hosts, false)
}
/// MO-14g: `unchecked`, the program compiled whatever the checkers say of it (a parse error still refuses) — for the
/// tool that runs a router's module to ask it for its routes (`rx-declare --host --routes <module.rx>`): the
/// declaration it writes is what the program is checked by, so it cannot wait for the check. Never a build's.
#[allow(clippy::too_many_arguments)]
pub fn app_with(entry: &str, target: Target, module_name: &str, spa: bool, library: bool, whole: bool, hosts: &[String], unchecked: bool) -> Value {
    // module keys are POSIX paths (`modules::join_path`); Windows takes `D:/a/b.rx` as it takes `D:\a\b.rx`
    let entry = &entry.replace('\\', "/");
    // every file the program was read from or looked for (its modules, each declaration and package.json, and where a
    // declaration would be, MO-8k): what the result depends on, so a bundler knows when it is stale (`asked`)
    let asked = std::cell::RefCell::new(indexmap::IndexSet::<String>::new());
    let read_noting = |p: &str| {
        asked.borrow_mut().insert(p.to_string());
        read_disk(p)
    };
    let mut result = (|| {
        if read_disk(entry).is_none() {
            return Err(json!({ "error": format!("{entry}: no such file") }));
        }
        let set = load_modules(entry, &read_noting).map_err(|e| {
            // a parse error is a diagnostic like the checker's, with its code (PARSE, or the habit it names)
            let file = e.2.clone().unwrap_or_else(|| entry.to_string());
            let mut d = crate::serve::parse_error_in(&file, &e, read_disk(&file).as_deref());
            d["msg"] = json!(crate::serve::parse_message(&e));
            json!({ "diagnostics": [d] })
        })?;
        let hosts: Vec<String> = hosts.iter().map(|h| h.replace('\\', "/")).collect();
        let hosts = crate::modules::hosts_as_keys(&set, &hosts); // E-5a: a host is the module whose real path is its own
        let checked = if whole { crate::check::check_modules_hosts(&set, spa, true, &hosts) } else { check_modules(&set, spa) };
        if !checked.diags.is_empty() && !unchecked {
            return Err(json!({ "diagnostics": checked.diags.iter().map(|d| { let mut j = d.to_json(); if j["file"].is_null() { j["file"] = json!(set.entry); } j }).collect::<Vec<_>>() }));
        }
        let out = compile_linked_as(&set, &[], true, library).map_err(|e| json!({ "error": format!("{entry}: not compiled: {}", e.0) }))?;
        let mut modules = Map::new();
        for (name, module) in &out.files {
            let path = &out.paths[name];
            let text = read_disk(path).unwrap_or_default();
            let l = lower_view(module, path, target, module_name, Some((path, &text))).map_err(|e| json!({ "error": e }))?;
            modules.insert(path.clone(), json!({ "code": l.code, "map": l.map, "css": out.module_css[name] }));
        }
        let mut result = json!({ "entry": set.entry, "css": out.css, "modules": modules });
        if library {
            // CP-4d: the components a JS host may import by name (`import { PersonCard } from "./pages.rx?rx-lib"`)
            let names: Vec<&str> = set.programs[&set.entry]
                .decls
                .iter()
                .filter_map(|d| match d {
                    crate::ast::Decl::Component { name, exported: true, .. } => Some(name.as_str()),
                    _ => None,
                })
                .collect();
            result["components"] = json!(names);
            // CP-4d: the module's default component, which a file-based router takes as a route file's page
            // (`import Page from "./routes/people.rx?rx-page"`)
            if let Some(page) = set.programs[&set.entry].decls.iter().find_map(|d| match d {
                crate::ast::Decl::Component { name, is_default: true, .. } => Some(name.as_str()),
                _ => None,
            }) {
                result["page"] = json!(page);
            }
            // MO-13e: every module's signature as the compiler prints it (`//@ signature …`): what a package ships as its
            // `.d.rx`, beside the module's compiled JavaScript
            let mut sigs = Map::new();
            for p in &set.order {
                sigs.insert(p.clone(), json!(crate::signature::print_signature(&checked.sigs[p])));
            }
            result["signatures"] = Value::Object(sigs);
        }
        Ok(result)
    })()
    .unwrap_or_else(|e| e);
    result["asked"] = json!(asked.into_inner().into_iter().collect::<Vec<_>>());
    result
}
