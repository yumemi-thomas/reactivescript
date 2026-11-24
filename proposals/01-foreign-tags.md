# 01 — A JavaScript component is applied by its tag

Needs nothing. A *row* is one export's line in a `.d.rx` file, the file that declares a JavaScript module to `.rx`.

## Problem

A JavaScript component has no row, so a tag of it cannot be written.

<!-- check branch=ok upstream=PARSE says-upstream="near 'component Dialog" -->
```rx
import { Dialog } from "./kit.js"
export default component App() { <Dialog open={true}>hi</Dialog> }
-- file: ./kit.d.rx
export component Dialog(props: { open: boolean; children?: View })
```

There is a way today: a JavaScript function that makes the component, imported `pure` and called in the view. It renders, with no
element `ref`:

<!-- app branch=ok upstream=ok -->
```rx
import pure { box } from "./kit.js"
export default component App() { <main>{box("hi")}</main> }
-- file: ./kit.js
import { createComponent } from "solid-js";
import { Dialog } from "kit";
export const box = text => createComponent(Dialog, { open: true, children: text });
```

Its subtree is opaque: its props are fixed when it is called, what is inside is not checked, and each component needs such a function.

## Proposal

- `export component C(props: { … })` in a JavaScript module's `.d.rx`. A field's type is TypeScript's. `View` is a view.
- `<C a={e}>…</C>` applies it. It lowers to JSX's tag: a prop is a getter.
- **The HTML shape is said, or the component is opaque.** `shape(…)` is what SV-7d needs: what the component's root is. With no `shape`,
  its content is not checked, and the row is not a claim that it is safe:

<!-- check branch=ok upstream=PARSE -->
```rx
import { Block } from "./kit.js"
export default component App() { <p><Block /></p> }
-- file: ./kit.d.rx
export component Block(props: {})
```

  (`Block` may return a `div`; the HTML parser then closes the `p`.) Open: should a missing `shape` be refused inside `<p>`, `<a>`, `<table>` and the other elements
  where it matters?
- `fails(E)` after the props: what escapes the component (R-f-5). Absent, none.
- With no row, or a name that is computed: `UNKNOWN_COMPONENT`, `COMPONENT_AS_VALUE`, as today.

Not in this step: components and views given as props ([05](05-foreign-views.md)), contexts ([12](12-context-rows.md)), where a library renders what it is given
([13](13-factories.md)).

## Evidence

- 132 component rows in 64 declarations, in the benchmark's programs (author-selected). The packages: solid-sonner, solid-marked, solid-use,
  Formisch, Wardic, solid-primitives (stable releases); UI SDK (beta), Kobalte (alpha), TanStack Router (release candidate).
- Upstream refuses every application, so no count of mistakes can be given.

## Cost

With [05](05-foreign-views.md): 820 lines in the crate, 260 in `ref/src` (a54830a, ec7cd13). Not measured apart. One row form to learn.

## Compatibility

`component` at the head of a `.d.rx` row was a parse error. No accepted program changes.

## Prototype

MO-11a (proposed id). S-module-5, 14.
