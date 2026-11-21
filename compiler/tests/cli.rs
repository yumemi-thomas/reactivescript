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
