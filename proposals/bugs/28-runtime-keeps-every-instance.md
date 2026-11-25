# The runtime keeps every instance

<!-- app branch=ok upstream=ok says-upstream="__rt.reg(" -->
```rx
component Row() {
  x = [1, 2, 3]
  <p>{x.length}</p>
}
export default component App() {
  source open := true
  <button onClick={() => { open := !open }}>t</button>
  {if open { <Row /> }}
}
```

Open and close the row a hundred times: the hundred values are alive, with the elements they hold.

**On upstream (e650b85).** In Chromium, production build: 101 of 101 alive. Here: 1, the one shown.

**Spec.** 11 CP-4c: `reg` is the harness's. "Compiled code calls it only in a conformance build."

**Cause.** The crate emits `__rt.reg` for every binding of every app, and the runtime pushes it in a table of the app. Only a scenario's handler rows read the table.

**Fix in this branch.** Both emitters write `reg` in a conformance build alone (and where an equation claims its hoisted awaits, which `refresh` asks again). The runtime keeps the table, and the log a runner reads, for a conformance app alone: a package compiled earlier does not leak either. A server fn's answer (12 SF-2b, "while it stands") goes with the last computation that asked it; it was kept for the page.

**Test.** `compiler/test/leaks.mjs`: twenty mounts, fifteen kinds of value held by weak references, in an app, in Solid's development build, under a JavaScript host, and on the server.
