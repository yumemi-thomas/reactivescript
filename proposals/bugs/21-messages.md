# Two messages that name the wrong mistake

The verdicts are right and stay. The text sends the writer elsewhere.

<!-- check branch=PARSE upstream=ASSIGNMENT says-branch="a parameter has no default" -->
```rx
fn add(a: number, b = 3): number => a + b
export default component App() { <p>{add(1)}</p> }
```

<!-- check branch=UNBOUND upstream=UNBOUND says-branch="globals are not in scope" says-upstream="not its caller" -->
```rx
export default component App() { source a := 1
  <p>{Math.max(a, 2)}</p> }
```

**On upstream (e650b85).** `ASSIGNMENT … a source is written with :=`, for a default. `Math is not declared here (a component sees its declaration site, not its caller — RG-7a)`.

**Spec.** 99, *Parse errors that name a habit*.

**Cause.** The `=` after a name is read as the habit of assignment, wherever it stands. One message serves every unbound name.

**Fix in this branch.** 8b4c611.

**Test.** S-parse-hints.
