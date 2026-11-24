# An unimported `fetch` or `fail` in an app calls the test harness

A program that forgets the import, or thinks `fetch` is JavaScript's, is accepted, and compiles to the scenarios' harness. The request is never made.

<!-- app branch=failed upstream=ok says-branch="fetch is not declared here" says-upstream="__B.fetch" -->
```rx
export default component App() {
  source id := 1
  user = await fetch("user:" + id)
  errored fallback(e) { <p>failed</p> } { loading fallback { <p>loading</p> } { <p>{user}</p> } }
}
```

<!-- check branch=UNBOUND upstream=ok -->
```rx
export default component App() {
  source n := 1
  x = n > 1 ? fail("no") : n
  errored fallback(e) { <p>failed</p> } { <p>{x}</p> }
}
```

**On upstream (e650b85).** Both checkers accept both programs. The compiled code calls `__B.fetch`. With no `api` option, that is a flight nothing resolves (`ref/compile/rt-web.ts:149`): the page stays at `loading`. `setTimeout`, also not imported, is refused.

**Spec.** SV-7a: the way out of the language is an import. R-io-4: an undeclared JS value is io.

**Cause.** The scenario prelude's names are in every program's scope.

**Fix in this branch.** 9c742de: a load is marked as a conformance build by the runners. Only then are `fetch` and `fail` names. Otherwise `UNBOUND`, with what to write. `./prelude` in an app is the app's own module.

**Test.** S-module-46; `compiler/test/names.mjs`.

**Verdicts that change.** 38 of the 305 `.rx` modules in upstream's repository use an unimported `fetch` (all are old programs under `eval/results`, and each is already refused for another unbound name).
