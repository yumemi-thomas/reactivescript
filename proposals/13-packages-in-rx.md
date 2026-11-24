# 13 — Packages written in `.rx`

Two decisions: a package an `.rx` app and a TSX app both import; and what a fn of it hands JavaScript.

## Problem

MO-9 lets a module be checked against a printed signature, with its own compiled JavaScript beside it. Nothing says how a
package ships the two, what `import … from "@demo/rates"` is, or what a TSX app gets. Upstream's `rxc` has no library build.

## Proposal: the package

- `rx-lib` compiles each module for the browser (hydratable) and for the server, and ships beside each its printed
  signature (`index.d.rx`), the types of its projection (`index.rx.d.ts`) and the types JavaScript sees (`index.d.ts`).
- A `.d.rx` whose first line is `//@ signature index.rx …` is a printed signature wherever a JS import finds it. The import
  is then an `.rx` import: rows, actions, contexts, instances.
- To JavaScript the module is a Solid 2 library: a component is a component, a source or an equation an accessor, an action
  a function that answers a promise.
- One instance of a module in a page, whoever imports it; on the server, one in a request, and outside a request one in a
  render.
- Exports are Solid's own conditions. No `solid` condition: an app compiles nothing.

## Proposal: a fn hands JavaScript its parts

An instantiating fn answers `.rx` one value. JavaScript was handed one accessor of the whole. It is handed each part:

```rx
export fn createPager(ref pages: number, first: number) {
  source raw := first
  page = raw > pages ? pages : raw
  action set(n: number) { raw := n }
  { page: page, set: set, first: first }
}
```

```ts
createPager: (pages: number | Accessor<number>, first: number) =>
  { page: Accessor<number>; set: (n: number) => Promise<void>; first: number }
```

- An accessor for a part that changes, the function for an action, the value for what is made once.
- A `ref` parameter takes an accessor or the value (a function is the accessor), where its type holds no function.
- A part whose shape is not known (a condition, a spread, a module's name) is one accessor, as before.
- The printed signature says the parts, and so an `.rx` caller is refused what it was not:

<!-- check branch=ACTION_CALLED_IN_OWNED_SCOPE upstream=PARSE -->
```rx
import { createPager } from "./pager.rx"
export default component App() {
  source n := 4
  p = createPager(n, 1)
  <p>{p.page} {p.set(2)}</p>
}
-- file: ./pager.d.rx
//@ signature pager.rx
export pure fn createPager(ref pages: number, first: number): { page: ref; set: io } instantiates
```

## Evidence

Twelve solid-primitives packages written in `.rx`, and the packages' own tests run against the build (jsdom; Solid 2.0.3;
solid-primitives at b053015). Re-run on this head, a349e48, from a copy of the experiment:

| | first measure, one accessor | with the parts | re-run at a349e48 |
| --- | --- | --- | --- |
| original browser-side tests that apply | 164 of 195 | 166 of 195 | 166 of 195 |
| original server tests | 17 of 29 | 29 of 29 | 29 of 29 |
| lines of the JavaScript facade | 261 | 198 | not re-run |
| one-line mistakes refused by both checkers | 9 of 12 | 11 of 12 | 11 of 12 |

By package, at a349e48 (browser, server): controlled-props 10/10; form-control 28/40, 5/5; history 9/9, 1/1; keyboard 1/7, 6/6;
keyed 9/9; media 11/11, 2/2; pagination 21/21, 6/6; presence 39/42, 2/2; resize-observer 6/8, 4/4; sortable 9/10, 1/1; timer
23/28, 2/2. Storage has another API, and a test of its own.

What the survey of 739 primitives says of the pitch: 22 can be written wholly in `.rx` with the API they have, 192 in `.rx`
with JavaScript beside, 9 with another API, 489 not (279 of them plain JavaScript or constants), 27 are in the language
(`node proposals/survey.mjs`). **"Write your library in `.rx`" is not an honest pitch.** "Write your components and your
app's shared state in `.rx`, and ship them" is.

`bench/tasks/rx-package` runs a package in an `.rx` app and in a TSX app, hydrated: 45 run-time checks, 11 mistakes
(`bench/scorecard.txt`).

## Cost

- The package: 106 lines in the crate's checker, 46 in its emitter, 23 and 37 in `ref` (2ba0966); `compiler/lib.mjs` 267.
- The parts: 328 + 69, and 108 + 58 (df2e30a).
- The runtime reads Solid's owner internals to keep one instance a render (`ref/compile/solid-internals.ts`), held against the
  public answer by a test.
- A TSX app with no `.rx` gets the runtime with its first package: 6.6 KB gzip at the first measure (not re-run).
- A signature's text grows, and an older runtime does not link with it.

## What it does not do

- A context and a type are not values for JavaScript. A server fn cannot be exported by a package.
- No type parameter, default or optional parameter: [14](14-optional-parameters.md), [16](16-generic-fns.md).
- What differs by design (48 of the 192): a write while an owner is being made, which Solid's `ownedWrite` allows.

## Alternatives tried and rejected

- *Ship `.rx` source.* The app's compiler version then checks a library's code.
- *One types file.* `.rx` reads a source as its value, TSX as an accessor. One file cannot say both.
- *Find the app by owner, not by page.* Exact while a component renders, and not available in its handlers.
- *A root under the first reader.* It died with that component, in silence. Found by a test.

## Compatibility

None for `.rx` programs. A package built before has another shape for JavaScript.

## Open questions

- Is one instance a page the rule upstream wants, or one an app?
- Does Solid want a request's end that a library can hear? Nothing offers it today; the runtime infers it.

## Prototype

MO-13a to i, MO-9b. S-module-33, 44; `bench/tasks/rx-package`; `runtime/test.mjs`. 2ba0966, 8424904, 79e3b8a, df2e30a. The
twelve packages are not in this branch, nor published: the numbers above and `proposals/survey.tsv` are what is kept.
