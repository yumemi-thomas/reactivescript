//! guide/diagnostics.md, the page each diagnostic code points to: every code the crate (and its type prelude) can
//! report has a section, every `rx before` fence gets its section's code, and every `rx after` fence checks clean
//! (without the section's advice), every `rx advice` fence checks clean and gets it. A `.rx` fence of another mark, or of
//! none, is a failure: an example that is not run says nothing of whether it holds. README's programs check clean. A
//! fence may declare the modules it imports (`-- module: ./ui.d.rx`, then `-- main`); `rx before spa` checks it as a
//! client-only build.

use reactivescript::check::check_modules;
use reactivescript::modules::load_modules;
use regex::Regex;
use std::collections::BTreeSet;
use std::path::Path;

fn root() -> &'static Path {
    Path::new(env!("CARGO_MANIFEST_DIR")).parent().unwrap()
}

/// The codes a program `src` gets: its parse error's, else its checker diagnostics'; and its advice's. A fence may hold other modules first,
/// each after a line `-- module: ./name` (as scenarios write them: `./ui.d.rx`, `./util.rx`), then `-- main` and the program.
fn codes(src: &str, spa: bool) -> (Vec<String>, Vec<String>) {
    let entry = "/page/main.rx";
    let mut files: std::collections::HashMap<String, String> = std::collections::HashMap::new();
    let mut main = String::new();
    let mut at: Option<String> = None;
    let modular = src.lines().any(|l| l.starts_with("-- module: "));
    for line in src.lines() {
        if let Some(m) = line.strip_prefix("-- module: ") {
            at = Some(format!("/page/{}", m.trim().trim_start_matches("./")));
            continue;
        }
        if line == "-- main" {
            at = None;
            continue;
        }
        match &at {
            Some(f) => {
                let b = files.entry(f.clone()).or_default();
                b.push_str(line);
                b.push('\n');
            }
            None => {
                main.push_str(line);
                main.push('\n');
            }
        }
    }
    let src = if modular { main } else { src.to_string() };
    let read = |p: &str| if p == entry { Some(src.clone()) } else { files.get(p).cloned() };
    match load_modules(entry, &read) {
        Err(e) => (vec![e.3.to_string()], vec![]),
        Ok(set) => {
            let c = check_modules(&set, spa);
            (c.diags.into_iter().map(|d| format!("{} ({}: {})", d.code, d.line, d.msg)).collect(), c.advice.into_iter().map(|d| d.code.to_string()).collect())
        }
    }
}

#[test]
fn every_code_has_a_section_and_its_examples_hold() {
    let page = std::fs::read_to_string(root().join("guide/diagnostics.md")).unwrap();
    let heading = Regex::new(r"^#{2,3} ([A-Z][A-Z_]+)$").unwrap();
    let mut sections = BTreeSet::new();
    let mut failures = vec![];
    let (mut code, mut fence): (Option<String>, Option<(String, String)>) = (None, None);
    for line in page.lines() {
        if let Some((mark, body)) = &mut fence {
            if line.trim() == "```" {
                // `rx before spa`: checked as a client-only build (08 CN-3d)
                let spa = mark.ends_with(" spa");
                let (got, advice) = codes(body, spa);
                let c = code.clone().unwrap_or_default();
                let advised = advice.contains(&c);
                let ok = match mark.trim_end_matches(" spa") {
                    "before" => got.iter().any(|g| g == &c || g.starts_with(&format!("{} (", c))),
                    "after" => got.is_empty() && !advised,
                    "advice" => got.is_empty() && advised,
                    _ => false,
                };
                if !ok {
                    failures.push(format!("{} `rx {}`: got {:?}, advice {:?}\n{}", c, mark, got, advice, body));
                }
                fence = None;
            } else {
                body.push_str(line);
                body.push('\n');
            }
            continue;
        }
        if let Some(m) = heading.captures(line) {
            code = Some(m[1].to_string());
            sections.insert(m[1].to_string());
        } else if let Some(mark) = line.trim_start().strip_prefix("```rx") {
            fence = Some((mark.trim().to_string(), String::new()));
        }
    }
    let mut emitted = BTreeSet::new();
    let patterns = [
        r#"err\(\s*"([A-Z][A-Z_]+)""#,
        r#"code: "([A-Z][A-Z_]+)""#,
        r#"\{ "([A-Z][A-Z_]+)" \} else \{ "([A-Z][A-Z_]+)" \}"#,
        r#"Some\(\("([A-Z][A-Z_]+)""#,
        r#"unwrap_or\("([A-Z][A-Z_]+)"\)"#,
        r#""([A-Z][A-Z_]+): "#,
    ];
    for f in std::fs::read_dir(root().join("compiler/src")).unwrap() {
        let p = f.unwrap().path();
        let src = std::fs::read_to_string(&p).unwrap();
        for pat in &patterns {
            for m in Regex::new(pat).unwrap().captures_iter(&src) {
                for g in m.iter().skip(1).flatten() {
                    emitted.insert(g.as_str().to_string());
                }
            }
        }
    }
    let missing: Vec<_> = emitted.difference(&sections).collect();
    assert!(missing.is_empty(), "codes with no section in guide/diagnostics.md: {:?}", missing);
    assert!(failures.is_empty(), "examples that do not hold:\n\n{}", failures.join("\n\n"));
}

#[test]
fn readme_programs_hold() {
    let page = std::fs::read_to_string(root().join("README.md")).unwrap();
    let fence = Regex::new(r"(?ms)^```rx\n(.*?)^```$").unwrap();
    let programs: Vec<_> = fence.captures_iter(&page).map(|m| m[1].to_string()).collect();
    assert!(!programs.is_empty());
    for p in programs {
        assert_eq!(codes(&p, false).0, Vec::<String>::new(), "{p}");
    }
}
