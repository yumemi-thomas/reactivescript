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
