# 01 — A row for a Solid component

## Problem

A JS component cannot be applied from `.rx`.

<!-- check branch=ok upstream=PARSE says-upstream="near 'component Dialog" -->
```rx
import { Dialog } from "./kit.js"
export default component App() { <Dialog open={true}>hi</Dialog> }
-- file: ./kit.d.rx
export component Dialog(props: { open: boolean; children?: View })
```

Upstream: `kit.d.rx:1:8: error PARSE fn near 'component Dialog(pro'`. Without the declaration, with `import pure`:

<!-- check branch=UNKNOWN_COMPONENT upstream=UNKNOWN_COMPONENT -->
```rx
import pure { Dialog } from "./kit.js"
export default component App() { <Dialog open={true}>hi</Dialog> }
```

The only way round is to mount JavaScript by hand in an element's `ref`.

## Proposal

- **The row.** `export component C(props: { … })` in a JS module's `.d.rx`. Each field is a TypeScript type. `View` is a
  view. After the props: `fails(E)`, what escapes its root (R-f-5); `shape(…)`, what SV-7d needs. Absent, each is empty.
- **The application** is one step of the static application tree, with the row as its summary. An argument's failures and
  its children's go on at the application, unless the field says `catches(E)`. What its own body reads is JavaScript's,
  and outside the graph (CN-3b).
- **It lowers** to JSX's `<C … />`. A prop is a getter, as Solid's is.
- **A component as a value.** `.rx` names a component where the declared type says `Component`: a prop's, a field of a
  record in a prop, an argument of a declared fn. Anywhere else it is `COMPONENT_AS_VALUE`, as today. It is checked as
  applied there, with no arguments, on every path, whether or not the library renders it.
- **A render prop.** A `children` field typed as a function giving a `View` takes a view lambda:

<!-- check branch=ok upstream=PARSE -->
```rx
import { VirtualList } from "./v.js"
export default component App() {
  source rows := ["a"]
  <VirtualList items={rows}>{view (row, i) { <p>{row}</p> }}</VirtualList>
}
-- file: ./v.d.rx
export component VirtualList(props: { items: string[]; children: (item: string, index: number) => View })
```

- **A compound component** has a row for each member, `export component Dialog.Trigger(props: …)`. A member with no row
  is `UNKNOWN_COMPONENT`.
- **An element in a prop.** A prop typed `View` takes a component by its name: `fallback={Empty}`.

Refused: a component with no row (`UNKNOWN_COMPONENT`); a component computed, or read out of a value
(`COMPONENT_AS_VALUE`); a view lambda where the type has no function (`VIEW_FN_MISPLACED`); other children where it has
one (`VIEW_FN_EXPECTED`).

## Evidence

- 132 component rows, in 64 declarations, are kept by the benchmark's programs: UI SDK, Wardic, Kobalte, TanStack Router,
  Formisch, solid-sonner, solid-marked, solid-use and solid-primitives (`grep -rhoE --include='*.d.rx' '^export component
  [A-Z][A-Za-z.]*' bench/tasks bench/coverage | wc -l`).
- The programs run in Chromium and on the server: `node bench/run.mjs` (44 good programs of 37 tasks accepted by both
  checkers, 279 run-time checks; `bench/scorecard.txt`, held by CI at a349e48).
- Upstream always refuses an application with no row, so there is no count of mistakes to give.

## Cost

- About 820 lines in the crate's checker and parser, 260 in `ref/src`, 250 in the two emitters and the projections (the
  five commits below, as they landed).
- Checking time: not measured for this alone. For the whole branch, `rxc check examples/shop/main.rx` is 5.0 ms against
  4.4 (median of 30), `ref/check.ts` 142 against 119.
- To learn: one row form, `View`, `Component`, and the view lambda. The view lambda is new surface syntax.
- Harder: every check that walks the application tree (R-f-5, RG-7b, CN-3d, SV-7d) meets a summary it did not infer.

## What it does not do

- It does not say where a library renders a component it is given: that is [07](07-placement.md). The rule here is the
  strict one: as applied at the place it is written.
- It does not check the library's own body, or its props' reactivity.
- It does not say that the library renders a value under another root. Solid allows it; the check assumes it does not
  (recorded as DV-24).

## Alternatives tried and rejected

- *Any import with a capital is a component.* Nothing then says what it catches or provides, and a spelling error is a
  run-time error.
- *Read the props from the `.d.ts`.* The checkers read no TypeScript (CN-5), and a `.d.ts` does not say which function
  prop is a view.
- *A computed component (`<X />` for a value `X`).* Not taken: the static tree needs to know what is applied.
- *A view lambda for any function prop, by name.* Taken in part: `{view header (n) { … }}` for a named one.

## Compatibility

No program accepted upstream changes. Over the 305 `.rx` modules in upstream's repository (both binaries, `rxc check`),
no verdict changes for this reason. `component` at the head of a `.d.rx` row was a parse error.

## Open questions

- Is `View` the right word in a `.d.rx`, or `JSX.Element`?
- Should a `Component` value be allowed as an argument of a declared fn at all before 07 is decided?
- A namespace object exported in lower case (`wardic.div`) must be imported under a capital. Acceptable?

## Prototype

MO-11a, b, c, k, q, t, DV-24. S-module-5, 14, 15, 24, 28, 34, 39. a54830a, ec7cd13, 656d035, 4b3f957, 8e21e9b, 0c674ca.
