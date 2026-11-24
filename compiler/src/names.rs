//! 11 CP-4: the language's functions, by scope (`ref/src/names.ts`). A name is its binding's (09 MO-1d): one of these is the
//! language's only where nothing binds it. Every stage asks here, with what its own scope says of the name; none keeps a
//! list of its own.

use crate::ast::Decl;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Lang {
    /// `len`, `map`, …: pure, `__B.len`
    Fn,
    /// `log`: io, and only in imperative scope
    Log,
    /// AC-6
    Until,
    /// EF-7
    OnSettled,
    /// EF-8
    OnFlush,
}
pub const NAMES: [(&str, Lang); 13] = [
    ("len", Lang::Fn),
    ("str", Lang::Fn),
    ("map", Lang::Fn),
    ("filter", Lang::Fn),
    ("sum", Lang::Fn),
    ("fail", Lang::Fn),
    ("fetch", Lang::Fn),
    ("every", Lang::Fn),
    ("indexOf", Lang::Fn),
    ("log", Lang::Log),
    ("until", Lang::Until),
    ("onSettled", Lang::OnSettled),
    ("onFlush", Lang::OnFlush),
];
/// CP-4c: the scenario prelude's, names of the language in a conformance build and nowhere else.
fn harness(name: &str) -> bool {
    matches!(name, "fetch" | "fail")
}
/// The function of the language `name` is where it is mentioned; `bound`: something binds it there; `conformance`: the
/// program was loaded for the scenario runners (`ModuleSet::conformance`).
pub fn language(name: &str, bound: bool, conformance: bool) -> Option<Lang> {
    if bound || (!conformance && harness(name)) {
        return None;
    }
    NAMES.iter().find(|(n, _)| *n == name).map(|(_, l)| *l)
}
/// MO-10k: a function of the language that answers a primitive, whatever it is given.
pub fn scalar(name: &str, bound: bool) -> bool {
    !bound && matches!(name, "len" | "str" | "sum" | "every" | "indexOf")
}
/// W-1a: a function of the language that answers a list — of rows made anew (`Some(false)`), or of its argument's own.
pub fn list_of(name: &str, bound: bool) -> Option<bool> {
    match name {
        _ if bound => None,
        "map" => Some(false),
        "filter" => Some(true),
        _ => None,
    }
}
/// UNBOUND's reason, for a name of the harness an app has not declared.
pub fn harness_reason(name: &str) -> Option<&'static str> {
    match name {
        "fetch" => Some(": JavaScript's globals are not in scope — export a function that makes the request from a `.js` module (`./api.js`), and import that (`import pure` for a loader)"),
        "fail" => Some(": it is no function of the language — `throw` an error (`error Failed(…)`), or import yours"),
        _ => None,
    }
}
/// What `import { name } from "./prelude"` names, in an import of the prelude.
pub fn in_prelude(d: &Decl, name: &str, conformance: bool) -> bool {
    matches!(d, Decl::Import { prelude: true, .. }) && matches!(language(name, false, conformance), Some(Lang::Fn | Lang::Log))
}
/// The scenario prelude's own module, as a specifier. The loader takes the mark off where the program has such a module
/// itself (a file, or a declaration, of that name): then it is that module's.
pub fn is_prelude(from: &str) -> bool {
    from.starts_with('.') && from.ends_with("/prelude")
}
pub const PRELUDE_FILES: [&str; 8] = [".js", ".ts", ".jsx", ".tsx", ".mjs", ".mts", "/index.js", "/index.ts"];
