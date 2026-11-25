// The rxc command line: what a script or CI sees.
use std::process::Command;

#[test]
fn checking_a_file_that_is_not_there_fails() {
    let rxc = env!("CARGO_BIN_EXE_rxc");
    let out = Command::new(rxc).args(["check", "no/such/file.rx"]).output().unwrap();
    assert_eq!(out.status.code(), Some(1));
    let stdout = String::from_utf8_lossy(&out.stdout);
    let stderr = String::from_utf8_lossy(&out.stderr);
    assert!(!stdout.contains("ok"), "{stdout}");
    assert!(stderr.contains("MODULE_NOT_FOUND"), "{stderr}");
    let out = Command::new(rxc).args(["check", "--json", "no/such/file.rx"]).output().unwrap();
    assert_eq!(out.status.code(), Some(1));
    assert!(String::from_utf8_lossy(&out.stdout).contains("\"MODULE_NOT_FOUND\""));
    let out = Command::new(rxc).args(["compile", "no/such/file.rx", "--out", "/nonexistent-rxc-out"]).output().unwrap();
    assert_eq!(out.status.code(), Some(1));
}

/// RG-7b, C-1: a provision given from its own context ends — what a `use` can fail with is what the context's provisions
/// can, and one that uses the context asked itself again without end (`fails_node` overflowed the stack, and the process
/// was aborted: a build, the editor). Each shape that did is read to its end: accepted (what is above it), or a CYCLE.
#[test]
fn a_provision_given_from_its_own_context_ends() {
    let rxc = env!("CARGO_BIN_EXE_rxc");
    let dir = std::env::temp_dir().join(format!("rxc-own-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();
    let tail = "component Leaf() { <i>{use c}</i> }\nexport default component App() { <P><Leaf /></P> }\n";
    let p = |body: &str| format!("component P(props: {{ children: View }}) {{\n{body}\n  <b>{{props.children}}</b>\n}}\n{tail}");
    let cases: Vec<(&str, String, Option<&str>)> = vec![
        ("itself", format!("context c: string = \"out\"\n{}", p("  provide c = use c")), None),
        ("plus", format!("context c: string = \"out\"\n{}", p("  provide c = (use c) + \"!\"")), None),
        ("closure", format!("context c: {{ n: number, twice: () => number }} = {{ n: 1, twice: () => 2 }}\ncomponent P(props: {{ children: View }}) {{\n  provide c = {{ n: 2, twice: () => (use c).n * 2 }}\n  <b>{{props.children}}</b>\n}}\ncomponent Leaf() {{ <i>{{(use c).twice()}}</i> }}\nexport default component App() {{ <P><Leaf /></P> }}\n"), None),
        ("branch", format!("context c: string = \"out\"\ncomponent P(props: {{ children: View }}) {{\n  <b>{{if true {{ provide c = (use c) + \"!\"\n    {{props.children}} }}}}</b>\n}}\n{tail}"), None),
        ("root", format!("context c: string = \"out\"\nprovide c = (use c) + \"!\"\n{}", p("")), None),
        ("two", format!("context c: string = \"out\"\ncontext d: string = \"d\"\n{}", p("  provide c = use d\n  provide d = use c")), Some("CYCLE")),
        ("name", format!("context c: string = \"out\"\n{}", p("  o = use c\n  provide c = o")), Some("CYCLE")),
        ("names", format!("context c: string = \"out\"\n{}", p("  o = use c\n  q = o + \"!\"\n  provide c = q")), Some("CYCLE")),
        ("default", format!("context c: string = (use c) + \"!\"\n{}", p("")), Some("CYCLE")),
        ("defaults", format!("context c: string = use d\ncontext d: string = use c\n{}", p("")), Some("CYCLE")),
        ("none above", format!("context c: string\ncomponent P(props: {{ children: View }}) {{\n  provide c = (use c) + \"!\"\n  <b>{{props.children}}</b>\n}}\nexport default component App() {{ <P>x</P> }}\n"), Some("CONTEXT_NOT_FOUND")),
    ];
    for (name, src, code) in cases {
        std::fs::write(dir.join("main.rx"), &src).unwrap();
        let out = Command::new(rxc).current_dir(&dir).args(["check", "main.rx"]).output().unwrap();
        let all = format!("{}{}", String::from_utf8_lossy(&out.stdout), String::from_utf8_lossy(&out.stderr));
        match code {
            None => assert_eq!(out.status.code(), Some(0), "{name}: {all}\n{src}"),
            Some(c) => assert!(out.status.code() == Some(1) && all.contains(c), "{name}: expected {c}: {all}\n{src}"),
        }
    }
    let _ = std::fs::remove_dir_all(&dir);
}

/// MO-6: a folder named as a module is no module (the reference's command line says the same, `ref/units.ts`
/// `a_folder_named_as_a_module_is_no_module`): as the entry, and as an import.
#[test]
fn a_folder_named_as_a_module_is_no_module() {
    let rxc = env!("CARGO_BIN_EXE_rxc");
    let dir = std::env::temp_dir().join(format!("rxc-dir-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(dir.join("x.rx")).unwrap();
    std::fs::write(dir.join("main.rx"), "import { a } from \"./x.rx\"\nexport default component App() {\n  <p>{a}</p>\n}\n").unwrap();
    for f in ["x.rx", "main.rx"] {
        let out = Command::new(rxc).current_dir(&dir).args(["check", f]).output().unwrap();
        let all = format!("{}{}", String::from_utf8_lossy(&out.stdout), String::from_utf8_lossy(&out.stderr));
        assert_eq!(out.status.code(), Some(1), "{all}");
        assert!(all.contains("MODULE_NOT_FOUND") && !all.contains("Is a directory") && !all.contains("EISDIR"), "{f}: {all}");
    }
    let _ = std::fs::remove_dir_all(&dir);
}
