# Solid 2 packages rewritten in `.rx`: what the language still lacks, and what the checker then catches

Local branch `rx-packages` from `rx-best` 7cc1fc0e with the Rust generator merged (a5a6f374). 2026-11-26. Solid 2.0.3.
Nothing pushed or posted.

**59 packages or parts** of 9 sources: Kobalte 2.0.0-alpha.5 (16 parts), terracotta 2.0.0 (6), cmdk-solid 2.0.0-rc.0,
solid-slider 2.0.0, an icon set (@lucide/solid 1.80.0 / solid-icons 2.0.0), CodeMirror and Tiptap in a component
(solid-codemirror 3.0.0, solid-tiptap 1.0.0), a toast kit (@trev.zip/solid-toast 1.2.15 / solid-sonner 1.0.0), five
parts of UI SDK over its core (0.1.0-beta.17, the bridge of `../rx-ui-sdk`), and 25 solid-primitives packages (the next
class-B ones of `../rx-primitives`' survey by monthly downloads). Sources from the npm tarballs and the projects' git
repositories (no install scripts); licences in `LICENSES.md` and each package's `NOTICE`.

**2,029 lines of `.rx`, 457 of JavaScript, 495 of declarations (`.d.rx`, `.d.ts`), 87 of facade.**

## How it was measured (all here, `node <script>`)

- `build.mjs`: each package built with `rx-lib`, as an author would.
- `run.mjs` (`SSR=1` for the server): the originals' **own tests**, as they are in their repositories, run against the
  original and against the rewrite (vitest, jsdom; the transform cache is off, so a planted break in the rewrite is seen
  — it was, after the first run had silently read the original twice). A primitive package's facade re-exports what was
  not rewritten from the original, so its whole test file runs.
- `live.mjs`: one app per part (`cases/`), the same steps on the original and on the rewrite in Chromium, rendered there
  and then served and hydrated; the page compared after each step (attributes sorted, ids renamed); 50 mounts and
  unmounts in a production build, then what is still alive. `live.json`.
- `check.mjs`: one good program per part, as `.rx` over the rewrite, as `.rx` over the original with `rx-declare`'s draft
  (and `handler` added on the `on…` callbacks where the good program needs it, as a person would: 81 words in all), and
  as `.tsx` over the original. 12 one-line mistakes (6 reactivity, 3 placement/HTML, 3 async/props) and 8 correct
  changes, the same text in each column. `check.json`.
- `size.mjs`: lines by kind; gzip bytes of each case's app, minified production build, Solid left out, minus an empty
  app: the original; the rewrite in an app that already has the `.rx` runtime; the rewrite alone. `size.json`.
- `report.mjs` writes the table below.

## The table

Tests are the original's own (client in jsdom, and server where it has them), counted per part: "passing on the
original · passing on the rewrite, of all". Live: of the steps, how many pages were the same as the original's,
rendered in the browser, and served then hydrated. Lines are per package (″: as above).

| package / part | tests: original · rewrite | live: client, hydrated (same steps of) | alive after 50 mounts: orig · rx | lines .rx / JS / decl. / facade (package) | gzip B: original · rx in app with runtime · rx alone | mistakes caught: rx / draft / TSX (of 12) | correct refused: rx / draft / TSX (of 8) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Kobalte Switch | 36 · 36 of 36 | 6, 6 of 6 | 0 · 0 | 1031 / 92 / 69 / 19 | 3511 · 3613 · 10730 | 12 / 9 / 2 | 1 / 1 / 0 |
| Kobalte Checkbox | 41 · 41 of 41 | 5, 5 of 5 | 0 · 0 | ″ | 4211 · 3674 · 10871 | 12 / 9 / 2 | 1 / 1 / 0 |
| Kobalte Button, ToggleButton | 19 · 14 of 19 | – | – | ″ | – | – | – |
| Kobalte ToggleGroup | 9 · 9 of 9 | 0, 0 of 5 | 0 · 0 | ″ | 9326 · 2362 · 9603 | 11 / 9 / 2 | 1 / 1 / 0 |
| Kobalte Collapsible | 4 · 4 of 4 | – | – | ″ | – | – | – |
| Kobalte Accordion | 19 · 19 of 19 | 6, 6 of 6 | 0 · 0 | ″ | 11097 · 4139 · 11277 | 11 / 9 / 2 | 1 / 1 / 0 |
| Kobalte Tabs | 15 · 15 of 16 | 4, 4 of 4 | 0 · 0 | ″ | 11063 · 3032 · 10261 | 12 / 9 / 2 | 1 / 1 / 0 |
| Kobalte RadioGroup | 54 · 54 of 54 | 4, 1 of 4 | 0 · 0 | ″ | 5327 · 4122 · 11310 | 12 / 9 / 2 | 1 / 1 / 0 |
| Kobalte Pagination | 8 · 8 of 8 | 6, 6 of 6 | 0 · 0 | ″ | 3207 · 3638 · 10890 | 12 / 9 / 2 | 1 / 1 / 0 |
| Kobalte Meter, Progress | 17 · 17 of 17 | 3, 3 of 3 | 0 · 0 | ″ | 2879 · 1587 · 8863 | 11 / 10 / 0 | 1 / 1 / 1 |
| Kobalte Separator, Breadcrumbs, Link, Alert, Badge | 33 · 30 of 33 | 2, 2 of 2 | 0 · 0 | ″ | 1075 · 1336 · 8665 | – | – |
| Kobalte Dialog | 2 · 2 of 2 | 2, 2 of 5 | 0 · 0 | ″ | 8558 · 11040 · 18087 | 9 / 9 / 2 | 1 / 1 / 0 |
| Kobalte Popover | – | 1, 1 of 5 | 0 · 0 | ″ | 17178 · 10974 · 18031 | – | – |
| Kobalte Tooltip | – | 3, 3 of 7 | 0 · 0 | ″ | 14778 · 8656 · 15829 | 11 / 9 / 2 | 1 / 1 / 0 |
| Kobalte Select | 57 · 48 of 58 | 1, 1 of 6 | 0 · 0 | ″ | 28154 · 14015 · 21077 | 11 / 9 / 2 | 1 / 1 / 0 |
| Kobalte Toast (data API) | – | – | – | ″ | – | – | – |
| terracotta Button, Switch | 17 · 13 of 19 | 3, 3 of 3 | 0 · 0 | 273 / 42 / 49 / 7 | 1318 · 1220 · 8528 | 12 / 9 / 2 | 1 / 1 / 0 |
| terracotta Disclosure | 7 · 7 of 8 | 4, 4 of 4 | 0 · 0 | ″ | 1814 · 2792 · 10002 | 12 / 9 / 2 | 1 / 1 / 0 |
| terracotta Dialog | 22 · 16 of 26 | 5, 5 of 5 | 0 · 0 | ″ | 3459 · 2793 · 10006 | 12 / 9 / 2 | 1 / 1 / 0 |
| terracotta Menu | 24 · 14 of 24 | 6, 6 of 6 | 0 · 0 | ″ | 2429 · 6313 · 13379 | 12 / 9 / 2 | 1 / 1 / 0 |
| terracotta RadioGroup | 18 · 15 of 19 | 4, 0 of 4 | 0 · 0 | ″ | 3191 · 6240 · 13450 | 12 / 7 / 0 | 1 / 1 / 0 |
| terracotta Listbox | 14 · 12 of 19 | 4, 4 of 6 | 0 · 0 | ″ | 4753 · 6360 · 13421 | 12 / 7 / 0 | 2 / 2 / 2 |
| cmdk-solid Command | – | 7, 0 of 7 | 13 · 0 | 116 / 100 / 48 / 2 | 12362 · 4732 · 11989 | 12 / 9 / 2 | 1 / 1 / 0 |
| solid-slider | – | 2, 0 of 5 | 0 · 0 | 56 / 12 / 40 / 0 | 7031 · 7386 · 14647 | 12 / 10 / 0 | 0 / 0 / 1 |
| icon set (lucide-like) | – | 0, 0 of 2 | 0 · 0 | 19 / 4 / 45 / 0 | 1719 · 1318 · 8669 | 10 / 10 / 0 | 1 / 1 / 1 |
| CodeMirror / Tiptap in a component | – | – | – | 34 / 13 / 46 / 0 | – | – | – |
| toast kit (solid-toast / sonner-like) | – | – | – | 43 / 4 / 37 / 0 | – | – | – |
| UI SDK checkbox | – | 5, 5 of 5 | 0 · 0 | 171 / 123 / 121 / 5 | 15194 · 48042 · 55003 | 11 / 7 / 0 | 1 / 1 / 0 |
| UI SDK switch | – | 3, 3 of 3 | 0 · 0 | ″ | 12717 · 47964 · 54941 | 11 / 9 / 2 | 1 / 1 / 0 |
| UI SDK accordion | – | 4, 4 of 5 | 0 · 0 | ″ | 15084 · 47970 · 54953 | 12 / 8 / 1 | 1 / 1 / 0 |
| UI SDK tooltip | – | 0, 0 of 6 | 0 · 0 | ″ | 31936 · 47923 · 54909 | 12 / 9 / 2 | 1 / 1 / 0 |
| UI SDK listbox | – | 0, 0 of 5 | 0 · 0 | ″ | 24166 · 48102 · 55069 | 12 / 7 / 0 | 1 / 1 / 0 |
| @solid-primitives/animation | 43 · 29 of 55 | – | – | 11 / 1 / 1 / 2 | – | – | – |
| @solid-primitives/connectivity | 15 · 10 of 15 | – | – | 10 / 1 / 1 / 2 | – | – | – |
| @solid-primitives/controlled-signal | 62 · 45 of 62 | – | – | 25 / 0 / 0 / 5 | – | – | – |
| @solid-primitives/cursor | 15 · 13 of 15 | – | – | 9 / 2 / 2 / 2 | – | – | – |
| @solid-primitives/date | 21 · 16 of 21 | – | – | 19 / 3 / 3 / 2 | – | – | – |
| @solid-primitives/devices | 5 · 7 of 9 | – | – | 12 / 1 / 1 / 2 | – | – | – |
| @solid-primitives/event-listener | 20 · 16 of 20 | – | – | 10 / 5 / 1 / 2 | – | – | – |
| @solid-primitives/favicon | 74 · 71 of 74 | – | – | 6 / 3 / 2 / 2 | – | – | – |
| @solid-primitives/focus | 60 · 60 of 60 | – | – | 11 / 1 / 1 / 2 | – | – | – |
| @solid-primitives/geolocation | 44 · 37 of 44 | – | – | 8 / 1 / 1 / 2 | – | – | – |
| @solid-primitives/interaction | 83 · 82 of 83 | – | – | 5 / 0 / 1 / 2 | – | – | – |
| @solid-primitives/intersection-observer | 39 · 32 of 39 | – | – | 6 / 1 / 1 / 2 | – | – | – |
| @solid-primitives/mouse | 9 · 5 of 9 | – | – | 11 / 1 / 3 / 2 | – | – | – |
| @solid-primitives/pointer | 7 · 6 of 7 | – | – | 13 / 7 / 2 / 2 | – | – | – |
| @solid-primitives/raf | 23 · 19 of 23 | – | – | 8 / 0 / 0 / 2 | – | – | – |
| @solid-primitives/scroll | 20 · 9 of 20 | – | – | 9 / 4 / 3 / 3 | – | – | – |
| @solid-primitives/set | 26 · 26 of 26 | – | – | 6 / 2 / 2 / 2 | – | – | – |
| @solid-primitives/share | 6 · 6 of 6 | – | – | 14 / 1 / 1 / 2 | – | – | – |
| @solid-primitives/signal-builders | 112 · 111 of 112 | – | – | 10 / 2 / 2 / 2 | – | – | – |
| @solid-primitives/spring | 25 · 10 of 25 | – | – | 10 / 7 / 1 / 2 | – | – | – |
| @solid-primitives/sse | 37 · 36 of 37 | – | – | 8 / 1 / 1 / 2 | – | – | – |
| @solid-primitives/styles | 13 · 10 of 13 | – | – | 8 / 9 / 2 / 2 | – | – | – |
| @solid-primitives/upload | 44 · 28 of 47 | – | – | 37 / 2 / 2 / 2 | – | – | – |
| @solid-primitives/url | 36 · 35 of 36 | – | – | 8 / 5 / 3 / 2 | – | – | – |
| @solid-primitives/websocket | 21 · 18 of 21 | – | – | 12 / 7 / 3 / 2 | – | – | – |

Checks over 25 programs: caught 288 / 219 / 35 of 300; correct refused 25 / 25 / 5 of 200.
Tests: client 1175 · 1021, server 101 · 90 (original · rewrite, of the files in the table).

Not counted in the table: Kobalte's image, steps, text-field and number-field tests (not rewritten: both columns run the
original), the toast tests (they import Kobalte's i18n module by path), sse's three files that import its source by
path. The live "hydrated" column of a part with a Portal compares the rewrite with an original that fails on the
server (`Client-only API called on the server side`): the rewrite serves, the original does not.

## Scope, per source (what of it)

- **Kobalte**: Switch, Checkbox (with the form control), Button, ToggleButton, ToggleGroup, Collapsible, Accordion,
  Tabs (no indicator measuring on resize beyond `onResize`), RadioGroup, Pagination, Meter, Progress, Separator,
  Breadcrumbs, Link, Alert, Badge, Dialog, Popover, Tooltip (no safe area between trigger and content, no warm-up shared
  by all tooltips), Select (flat options, one or several; no sections, no virtual list), Toast (a data API: see
  blockers). `as` is not a prop. floating-ui and the focus/dismiss layer are JavaScript (`layer.js`, 33 lines).
- **terracotta**: Button (`render` for another element, DECISION item 2), Switch, Disclosure, Dialog, Menu,
  RadioGroup, Listbox. Focus navigation is JavaScript (`dom.js`).
- **cmdk-solid**: Command, Input, List, Item, Group, Separator, Empty, Loading; the scorer is the original's code.
  Not its Dialog (Kobalte's).
- **solid-slider**: Slider, SliderProvider, SliderButton, SliderDots, SliderThumbnails over keen-slider.
- **icons**: an `Icon` over shapes, a provider of defaults, two icons; tags by an `if` (proposals/29).
- **editors**: `CodeMirror` (value in and out, extensions and read-only that change), `Tiptap` (its state given to a
  view). The editors are JavaScript (`cm.js`, 15 lines). No tests run: none in the originals that fit; built only.
- **toast kit**: `show`, `dismiss`, `remove`, `promise`, `Toaster` with a view of each toast; not run in a browser.
- **UI SDK**: Checkbox (+Indicator), Switch (+Thumb), Accordion (5 parts), Tooltip (trigger, content), Listbox
  (+item, indicator), over core with `../rx-ui-sdk`'s bridge, generic parts by tag (`parts.rx`).
- **solid-primitives**: in each package the class-B functions named in its facade; the rest of the package is
  re-exported from the original.

## What `.rx` adds in checking

Over 25 good programs × 12 mistakes:

| | `.rx` over the rewrite | `.rx` over the original's draft | TypeScript over the original |
| --- | --- | --- | --- |
| caught, of 300 | **288** | 219 | 35 |
| reactivity (R1–R6, 150) | 150 | 150 | 0 |
| placement and HTML (P1–P3, 75) | 65 | 3 | 0 |
| async and props (A1–A3, 75) | 73 | 66 | 35 |
| correct changes refused, of 200 | 23 | 23 | 5 |
| the good program, as is | refused in 4 (signature bug 5) | refused in 21 until 81 `handler` words were added | accepted |

- **Placement is what the rewrite adds over a draft**: a part outside its root (`CONTEXT_NOT_FOUND`), block content in a
  `<p>`, a part where a table's rows go (`CONTENT_MODEL`). A draft knows no provider and no shape of a JavaScript
  component, and TypeScript neither. The 10 missed: four good programs already refused by bug 5 (so P1 is hidden), a
  part with no context (icons, slider dots), and an `<p>` around inline parts that are valid there.
- **Reactivity is caught as well over a draft**: those six are rules of the app's own code.
- **TypeScript** catches wrong prop types and unknown props, and none of the rest.
- **What is refused and correct** is one thing in 22 of 23: a `ref` closure that writes state, given to a component
  (`<Part ref={(e) => { el := e }}>`, `REACTIVE_WRITE_IN_OWNED_SCOPE`). It is the UI SDK report's "ref on a component"
  and blocker B3 below. The other: a class list on an `<svg>` (`TS2322`, the icon's own type).
- The two checkers agree on every program (no disagreement in 3 × 25 × 21).

## Blockers (count of packages; ≥ 2 is a language need)

| # | what | smallest program | JavaScript it forced | packages |
| --- | --- | --- | --- | --- |
| B1 | **A listener or a resource starts in an `effect`, after mount**; the original starts it when it is called (render effect, `onCleanup`). In a test's `createRoot` without a flush nothing listens | `export fn createWSMessage(ws: any) { source m: any := undefined` / `effect () { return watchMessage(ws, (d) => { m := () => d }) }` / `m }` | none; it is a timing difference the tests see (scroll 5/16, spring 10/25, websocket, styles, mouse, event-listener, intersection-observer, raf, date, devices, geolocation, connectivity) | **12** (all primitives with a listener) |
| B2 | **A `ref` closure that writes, given to a component** (`REACTIVE_WRITE_IN_OWNED_SCOPE`) | `<Part ref={(e: Element) => { el := e }} />` with `component Part(p: { ref?: (e: Element) => void })` | Kobalte's Trigger written as a `<button>` instead of its `Button`; UI SDK's `own()` (JS) | **5** (Kobalte, terracotta, UI SDK, cmdk, every check program's C7) |
| B3 | **A statement-bodied closure in a record** (`{ onKeyDown: (e) => { … } }`) is refused; actions stand in | `attrs = { onClick: (e: any) => { call(e, h) } }` | UI SDK `own()` (JS); terracotta used actions | 2 |
| B4 | **A view with a parameter through a spread** to another component (`VIEW_FN_EXPECTED`) | `repros/view-spread.rx` | none: written out as `{view row (s) { <props.row {...s} /> }}` | 2 (Kobalte Select, terracotta Switch/Button) |
| B5 | **Optional `ref` parameter** (value-or-accessor that may be left out): `PARSE [E-9a]` | `export fn createScrollPosition(ref target?: any)` | facade passes `undefined` | 3 (scroll, mouse, pointer) |
| B6 | **Optional parameters on an action** | `repros/action-optional.rx` | facade / required `| undefined` | 2 (toast kit, Kobalte Toast) |
| B7 | **No destructuring of a quoted key** (`{ "aria-label": label } = props`) | `{ "aria-label": l, ...rest } = props` → `PARSE` | none; `props["aria-label"]` (which then hit bug 1) | 2 (Kobalte form parts, cmdk) |
| B8 | **JavaScript's operators**: `as` (`x as T`, `as const`), `typeof`, unary `+`, `new`, `{ [k]: v }` | `tell(next as any)`; `+x`; `new Set(xs)`; `({ [k]: v })` | one-line helpers: `tell`, `num`, `setOf`, `one`, `attr` | 5 (Kobalte, icons, set, cmdk, terracotta); known (`rx-primitives`, cause 3) |
| B9 | **A view handed to a function or an action** (`toaster.show((p) => <Toast …/>)`) | `show((p) => view)` has no form | the API made data: `show({ title })` and `<Region>{view toast (p) { … }}</Region>` | 2 (Kobalte Toast, toast kit) |
| B10 | **An action answers nothing at once** (a toast's id) | `let id = show(…)` in TSX | the id is the caller's (`options.id`) | 2 (Kobalte Toast, toast kit) |
| B11 | **A tag chosen by a value** (`as`): DECISION item 2 says `render`; Kobalte's Link/Separator and terracotta's Button tests use `as` | `<Link as="div">` | none; 3 of their tests fail | 3 (Kobalte, terracotta, icons' shapes by `if`) — decided, not reopened |
| B12 | **State given to TSX children is values, where the original gave accessors** (`(s) => s.selectedOption().label`) | Kobalte Select's `Value` | facade wraps (`select.ts`, 6 lines) | 2 (Kobalte Select, ToggleButton/ToggleGroup tests) |
| B13 | **A generic context** (Select's `T` reaches its item view only as `any`) | `context itemOf: <T>(p: { item: Item<T> }) => View` | none; types lost | 1 |
| B14 | **Setters called inside an owner** (tests in `createRoot`) `ACTION_CALLED_IN_OWNED_SCOPE` | `createRoot(() => { const [v, set] = createControllableSignal(…); set(1) })` | none | 2; by design (`rx-primitives` cause 7) |

## Bugs

| # | bug | smallest | checkers | main? | state |
| --- | --- | --- | --- | --- | --- |
| 1 | **`props["aria-label"]` in a component given a view was read as a mention of all of `props`** (`VIEW_FN_MISPLACED`, `VIEW_NOT_SHOWN`): a correct program refused, with no other way to name such a prop | `scenarios/S-view-9.md` | both | the rule is rx-best's | **FIXED** 31986a0f, both checkers, S-view-9 in every runner |
| 2 | **A write inside an `if` that narrows the source is typed by the narrowed type** (`TS2345`): `if (a) { a := undefined }` on `{…} \| undefined`; `if (a == "x") { a := "y" }` on `"x" \| "y"` | `repros/narrowed-write.rx`, `narrowed-write-literals.rx` | the type pass (both checkers accept) | **yes** (e650b851) | open: the projection writes `set(a)(v)` with `a` as read; needs the declared type in both projections |
| 3 | **`on` and `from` as a name** give `PARSE` "expected a declaration or markup" | `repros/on-name.rx`, `from-name.rx` | both | **yes** | open (UI SDK report bug 7): which words are reserved is the spec's to say |
| 4 | **`rx-lib` does not ship a module imported only for types**: every prop of the package is silently `any` for `.rx` and TSX | a package whose `.rx` imports `{ Div } from "./types.js"` with only `types.d.ts`/`types.d.rx` | – | not run | open (UI SDK report bug 5); way round: an empty `types.js` |
| 5 | **A printed signature loses `provides` of a component that hands its whole props on** (Progress over Root, Dialog's Root over Shell, Select's Root over Shell): a correct `.rx` app over the built package is `CONTEXT_NOT_FOUND` | `repros/lost-provides/*.rx` (not reduced: six small shapes print correctly) | both | not run | open |
| 6 | **`fn f(ref x: number): ref number` is accepted by the checkers and is a syntax error for the type pass** (`TS1144`) | `repros/ref-result-in-source.rx` | crate and ref accept; rx-tsc refuses | yes | open (small; the word belongs to printed signatures only, a decision which side changes) |
| 7 | A trap, not a bug: `{c.text}` where `text` is `undefined` prints `undefined` (values are text in `.rx`); Kobalte's own test caught it | `repros/undefined-text.rx` | – | yes | by design |
| 8 | Not ours: cmdk-solid's original keeps 13 elements alive after 50 mounts; the rewrite 0 | `cases/cmdk.tsx` | – | – | – |

## Size

In an app that already has the runtime the rewrite is smaller than the original for 13 of 27 cases (Kobalte's
Select 28.2 → 14.0 KB, Tabs 11.1 → 3.0, ToggleGroup 9.3 → 2.4, cmdk 12.4 → 4.7) and about the same or larger in the
others: larger where the original is a thin component and the rewrite's module holds more parts (terracotta's menu
2.4 → 6.3: `menu.rx` holds Listbox and RadioGroup too), and Kobalte's Dialog (8.6 → 11.0: the layer is the rewrite's
own JavaScript, not shared). Alone, the runtime adds
about 7 KB. UI SDK's parts are 48 KB because `controls.rx` is one module over every core it imports (one bridge, five
cores): split by part it would be the toggle's size of `../rx-ui-sdk`.

## What is next

1. Bug 2 (narrowed write) in both projections: it refuses ordinary code and is on main.
2. B2 (a `ref` closure to a component): 22 of 23 correct programs refused here; a word for it exists (`handler`).
3. B1: a form for "listen when made, stop with the owner" (Solid's render effect / `onCleanup`), or a statement that
   the difference is by design; 12 packages' tests see it.
4. Bug 5 reduced, then fixed; bug 4 (types-only module).
5. B5/B6 optional parameters on `ref` and on actions.

## Not run

The `.rx` app over each built package in a browser (the checks compile it; the live cases are TSX); the 12 mistakes
for the 25 primitives and the editors and toast kit; Kobalte's Playwright stories; the UI SDK project's specs and leak
gates; the editors in a browser; the toast kit in a browser; Linux/Windows.
