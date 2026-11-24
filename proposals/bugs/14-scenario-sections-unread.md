# A scenario's section that no runner reads is skipped in silence

The heading is not one the parser knows. The scenario passes, and the programs under it never run.

<!-- scenario branch=fail upstream=pass -->
````md
# S-proposal-1 — a section no runner reads

Rules exercised: none.

## Program

```rx
export default component App() { <p>a</p> }
```

## Frames

| instant | action | frame |
| ------- | ------ | ----- |
| 0 | mount | `a` |

## Accepted variations

```rx
-- accept
this is not a program
```
````

**On upstream (e650b85).** `PASS S-proposal-1`.

**Spec.** CONTRIBUTING: a behaviour claim is a rule or a scenario.

**Cause.** `parseScenario` looks for the headings it knows.

**Fix in this branch.** a349e48: a heading, a block, a directive, a table, a column or a row that no runner reads fails every runner. An accepted program is type-checked and lowered too. Upstream's own files held three rejected variants written as a table of predictions (S-ai2-tracker); they are programs now. The two *Accepted* sections that had never run were this branch's.

**Test.** `ref/units.ts`.
