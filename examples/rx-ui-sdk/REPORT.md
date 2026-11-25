# Can UI SDK's Solid components be written in `.rx`?

## On `rx-best` (2026-11-26): under the rule that a view is only shown

The package as it was written (fd2eb969, below) is **refused** by this branch's checkers in two places, both of the
same kind: a component of the module declared `children: View` handed them to a JavaScript function
(`viewOf(props.children)`, in the dialog's `Popup` and `Viewport`): `VIEW_NOT_SHOWN`, "a fn does not take it — a
component does". Rewritten, in `src/`:

- **Children are shown** where they were passed through JavaScript: `{props.children}` in the dialog's portal and
  viewport, with no helper between.
- **Children that are told the part's state are a view with a parameter**: `Toggle` and `DialogTrigger` declare
  `children?: View | ((s: ToggleState) => View)` and show them `<props.children {...now} />`; an `.rx` app writes
  `<Toggle>{view (s) { … }}</Toggle>` and its view keeps its own state while the toggle changes (`app/extra.mjs`).
- **`render` is a view of the part** for those two: `element?: (e: { attrs; state }) => View`, shown
  `<props.element attrs={…} state={now} />`. A `.tsx` app's `render={(props, state) => …}` is adapted to it by six
  lines of `facade/render.js`. The other fourteen parts keep `render` as a JavaScript function whose answer is shown
  (`viewOf(render(all, now))`): their types are the library's `.d.ts`, which the rule does not read.

Nothing of what else this branch adds changes these three components: no part carries a view to another by a context
(the dialog's contexts hold instances and containers), no fn of the package has a trailing optional or a type
parameter to give (`usePart`'s are all `ref`), and no provider merges with the one above. So this is the rewrite of
the children rule, and no more.

Run here, with this branch's compiler and runtime, `@ui-sdk/core` and `@ui-sdk/solid` 0.1.0-beta.17 as built before:
`node build.mjs` builds; `node app/test.mjs`, 44 tests in Chromium, **original 44, rewrite 44**, the `.rx` app rendered
and server-rendered then hydrated. Not run again here: the project's Playwright specs (552 of 553 on the children-rule
branch), its unit tests, the leak gates, sizes and times. The numbers below are fd2eb969's.

2026-11-25, 21cbee57, Solid 2.0.3, `@ui-sdk/core` unchanged, 0.1.0-beta.17 built from source on both sides. Started on
beta.13; the bridge's code is the same in both (one export fewer), and everything below was run on beta.17. The times are of one run on one machine.

## Verdict

**Toggle and Tabs: yes. Dialog: yes for behaviour, with one dev-only diagnostic. None can be shipped today, because the
ReactiveScript runtime leaks every instance (bug 1).** The stop rule was never met: 117 lines of JavaScript do what
736 did for these parts, and the server's markup is the original's but for the order of attributes.

Three honest limits. The JavaScript kept is real work (binding an element at the right moment, holding core's objects, shaping
views). The 739-line bridge serves 50 components; this one was only asked to serve three. A part is written out by hand or
generated, about 14 lines each, where the original has one line.

| | verdict | its own specs, original · rewrite |
| --- | --- | --- |
| Toggle, ToggleIcon, ToggleGroup | yes; not inside a Toolbar (not rewritten) | all pass · all pass |
| Tabs and its 5 parts | yes | all pass · all pass, one dev diagnostic in a unit test |
| Dialog and its 7 parts (portal, controller, nested, sheet, shortcut) | yes | all pass · one fails, on a dev diagnostic alone |

## Lines (no comments, no blanks)

| | lines |
| --- | --- |
| `.rx`: part 13, toggle 61, tabs 101, dialog 187 | 362 |
| JavaScript bridge | 117 (7.4 KB; the original's bridge is 20.8 KB) |
| re-exports of core and Portal | 4 |
| `.d.rx` / `.d.ts` of that JavaScript | 51 / 63 |
| facade for `.tsx` (the controllers) | 6 |
| original: `use-primitive.jsx` 736, toggle 89, tabs 26, dialog 30, dialog-parts 158, popup 43, controller-target 44 | 1,126 |

Of the 739, by hand and approximate: **gone** ~430 (the part factories and their schema reading ~230, replaced by written
parts; the Proxies over props and the tag machinery ~110; the event-name table; per-key marks; child flags); **in JavaScript** ~210,
as ~115 (create/follow, attributes' shape, binding with hydration care, views, handlers); **in `.rx`** ~100 (subscription,
options, contexts, presence, render). The other frameworks' bridges over the same core, total lines with comments: React 1,261,
Vue 798 + 574, Svelte 631 + 337, web 2,385, Solid 1,348.

## Size: gzip bytes, Solid left out, with core / without core

| | original | rewrite, app has the runtime | rewrite alone |
| --- | --- | --- | --- |
| toggle | 16,587 / 4,256 | 15,572 / 3,908 | 22,764 / 11,247 |
| tabs | 19,610 / 3,913 | 19,313 / 4,292 | 26,475 / 11,654 |
| dialog | 46,189 / 5,100 | 46,149 / 5,988 | 53,872 / 13,404 |
| all three | 57,315 / 5,709 | 59,378 / 9,056 | 67,186 / 16,497 |

Written-out parts grow with each component; the original's factory is paid once. A `.tsx` app that has no `.rx` pays ~7.4 KB.

## Tests: original · rewrite

| suite | original | rewrite |
| --- | --- | --- |
| the project's Playwright specs (toggle, tabs, dialog, item-icon; client and server-rendered), Chromium, 2 retries | 553 of 553 (6 skipped, 2 flaky) | 552 of 553 (6 skipped, 3 flaky: the same two, and one that was flaky on the original in an earlier run) |
| the project's unit tests that import these parts (jsdom and server), 11 files | 81 of 81 | 79 of 81 |
| the project's leak gates for dialog and tabs | 5 of 5 | **0 of 5**; 5 of 5 with bug 1's line removed |
| `app/test.mjs`, 44 tests in Chromium (events, refs, lists, nested, unmount listeners, hydration, a stream behind Loading) | 44 | 44 |
| `.rx` app over the package, rendered in the browser and hydrated | – | both pass |
| the project's toolbar specs (not counted) | not run | 37 pass, 45 fail |

Every difference:

- *ReactiveScript's bug*: the 5 leak gates (bug 1).
- *The rewrite's*: 1 spec and 1 unit test fail only on Solid's development diagnostic `EFFECT_RELAY_TEAR` (a controlled change
  reaches a part once through the options and once through core's own write). What the page does is the same. Why the
  original raises none was not established; it is not `ownedWrite`, which taken off its two ticks raises none either.
- *The rewrite's scope*: 1 unit test and the toolbar specs: a Toggle does not join the original's Toolbar, whose context is private.
- *By design of `.rx`*: a popup of the original inside this dialog does not inherit its container (its context is its package's). Not run.
- A trigger whose controller changes dialogs keeps its element; the original makes another. Not run.
- The unstable tests (5 titles seen over the runs) read `inert` or `scrollY` right after a dialog shows; each was unstable on the original too, three of them also at Solid 2.0.0.

## Updates (production build, counted by wrapping the DOM and core's reads)

| | original | rewrite |
| --- | --- | --- |
| mount 100 toggles, median (two runs) | 3.1, 2.9 ms | 2.8, 2.5 ms |
| mount 50 tabs and panels | 2.3, 2.3 ms | 2.4, 2.3 ms |
| a controlled change among 50 tabs | 1.3, 1.5 ms | 1.1, 1.0 ms |
| one press: attribute calls; core's attrs / state reads | 3; 1 / 1 | 3; 1 / 3 |
| controlled change, 50 tabs: attribute calls; attrs / state / present | 80; 56 / 111 / 51 | 80; **105** / 0 / 51 |
| press, 50 tabs uncontrolled: attribute calls; attrs / state | 78; 53 / 108 | 78; **102** / 0 |
| dialog opened: attribute calls; attrs / state / present | 22; 15 / 12 / 9 | 21; 10 / 3 / 4 |

The writes to the page are the same. Core is asked for attributes twice as often on a tab change (once for the options or the
first write, once more for core's following write), and for state only where something reads it. These times are near the clock's resolution:
read them as "no difference seen".

## What the checker gives (`node check/run.mjs`)

| | `.rx` over the rewrite | `.rx` over the original, rx-declare's drafts | TypeScript, original |
| --- | --- | --- | --- |
| the good program | accepted | **refused as drafted** (`handler` not proven); accepted with 4 words by hand | accepted |
| a part outside its root (4 mistakes) | 4 `CONTEXT_NOT_FOUND` | 0 | 0 |
| state written while the view computes | `PARSE` | `PARSE` | 0 |
| a handler called, not passed | yes | yes | yes |
| the parts' value mutated in place | `MUTATION_IN_PLACE` | `MUTATION_IN_PLACE` | 0 |
| wrong value, missing prop, unknown prop, wrong callback, misspelt option (5) | 5 | 5 | 5 |
| **caught of 12** | **12** | **8** | **6** |
| correct lines refused, of 8 | **3** | 2 | 0 |

Refused and correct: children that are a function of the state, a `render` function (a view lambda, refused of the rewrite only:
the draft takes it), and a `ref` that writes state. The first two are the rewrite's real loss for `.rx` users.

## The generator

`generate.mjs` (schemaOf, and each slot's `on`, `press`, `present`) writes plain parts. 8 of 16 comparable parts are the same text as
the source (5 of Tabs, 3 of Dialog); 2 icons differ in the order of two fields; Toggle and ToggleGroup in
their group's wiring (2 lines each); Trigger, Backdrop, Content and Shortcut are shaped by the adapter (what a dialog is found by,
where it renders) and no schema says so; the root of Dialog, Popup and Viewport are not generated. The source's tabs were
themselves first stamped from one pattern, so the equality says the schema is enough, not that two authors agree. Tags,
element types and which props to leave to the element are not in the schema. The generated text was not built or run.

## Bugs found (`probe/`, `node probe/run.mjs`)

"main" is origin/main at e650b851, its crate and runtime built here.

| # | bug | interpreter | main |
| --- | --- | --- | --- |
| 1 | **The runtime keeps every binding of every instance**: `reg` pushes into an app-wide table and nothing removes it (`ref/compile/rt-web.ts:289`). `leak.rx`: 101 of 101 values alive after 100 unmounts | not asked | **yes, run** |
| 2 | **A destructured `children` (even unused) is evaluated at once, above the component's `provide`**: `eager2.rx` shows `destructured:none`, where the two checkers credit the provision. `props.children` is right. Nothing warns | right (`given`) | **yes, run** |
| 3 | A view from a `.tsx` app in a hole is data: no children prints `undefined`, a list of strings or with a number prints JSON. `{props.children}` takes lists but prints `undefined` and `false`. The bridge shapes them (`shown`) | – | not run |
| 4 | A type imported from a JS module that has no `.d.rx` stays in the output as a value import, and the module fails to load (`type-import.rx`). Both checkers accept | – | **yes** (emitted code read) |
| 5 | With an `export type` row instead, `rx-lib` does not ship a module imported only for types: every prop of the package is silently `any` | – | not run |
| 6 | A `ref` closure's read of a prop is not a snapshot (a source's is): Solid warns `STRICT_READ_UNTRACKED` when the props are a merge (`ref-read.rx`) | – | not applicable (it refuses the closure's types) |
| 7 | `source on` is accepted, and `on := !on` is refused with a message about `=` (`on` opens `loading on`) (`on-name.rx`) | – | yes |

Ways round, all in the source: `props.children`; `ref: user` in the pattern; types beside values in one module. Bug 1 has none.

## What still needs JavaScript or a language change

| what | smallest | what would remove it | others that need it |
| --- | --- | --- | --- |
| a function of the state as children or `render`, passed from `.rx` to a `.rx` component | `view-lambda.rx`: `VIEW_FN_MISPLACED` | language (MO-11k is for JS components only; 03 RG-4c calls a function prop "ordinary") | Kobalte (`typeof body === "function" ? body(state)`, 14 files), solid-primitives and TanStack Router (function children in their types) → **candidate** |
| `f?.(e)` | `optional-call.rx`: `PARSE` | language | not counted in the libraries; any component with an optional handler |
| the element's `ref` closure on a component, with a write | `ref={(e) => { n := 1 }}` on a component | our tool: a word for it exists (`handler`) and the printed signature does not carry a prop's | Kobalte and Wardic have `ref` props (47 and 12 type files; what each needs not run) → **candidate, needs a check** |
| a record kept live for a JavaScript function (`stateOf`, `elementProps`) | a pure fn is handed a value, a `ref` argument a memo computed at once | language: a lazy record. The spread markup already has it | Kobalte, Wardic merge props in JS (127, 17 files) → question |
| binding an element after hydration, rebinding when its part changes | `binder`, 20 lines | not the language: `source el` + `effect` works but adds a flush and Solid's relay diagnostic | not looked at |
| create/follow/destroy of core's objects, WeakMaps, shaping attributes | `create`, `attrsOf`, `attach` | never: a library's objects | by design |
| a registry of roots by controller | `register`, `entryOf` | never | by design |
| a tag held in a value | not needed: tags are written out | – | Wardic, Kobalte, TanStack Router use dynamic tags (12, 2, 6 files); not needed here, so no evidence |

Only the first has two libraries shown; the counts are of files that match a pattern, not programs run.

## Not run

Chromium only (no WebKit, Firefox). Toolbar specs on the original. Streaming: one page behind one `Loading`. The upstream
`*-data`, `*-portal`, `*-sheet` projects and its count gates (`counts.spec`). The main
check of bugs 3 and 5. The generated parts. `.rx` use with a view lambda (refused). No scale other than 50 and 100.
