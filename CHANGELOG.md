# Changelog

## Unreleased

**Changed**

- Values the checker confines have a closed set of operations (spec/09 MO-10k, spec/08 CN-7d). A JS result whose
  fields wait or fail is read by the fields its declaration names: `q.valueOf()`, `q.toJSON()`, an undeclared field and
  `q[k]()` are `RESULT_AS_VALUE`. What is called on a library's draft is a method of plain data; a callback given to one
  (`d.items.forEach((row) => { … })`) has parameters that are places of the draft, an iterator read out of one is kept
  as an iterator over copies, and any other method is `DRAFT_ESCAPES`. A method keeps nothing of a `renders` value only
  when `methods(…)` names it and it is called on the value's own name. A call through a record, an array or a call
  (`box.read()`, `fs[0]()`, `mk()()`) reads what the closures it may call read (`SNAPSHOT_KEPT`, `SNAPSHOT_ARGUMENT`).
- The loop `for (const x of xs) { … }` visits what `xs` held when it started, as the spec said; it compiled to a loop
  over `xs` itself, which a turn could lengthen.
- A record result with no accessor part is the library's own object, not a copy with a getter per declared field.
- A declared fn whose result hands out drafts (`createStore`) is a primitive: its setter is io.
- `catch` follows only an `await`: `await f(x) catch (e) => alt` makes a matching rejection the answer. A `catch` after
  anything else is the new compile error `CATCH_NOT_ON_AWAIT` (R-f-4). Show a failed value with an `errored` region
  where it is read; in a handler or action, read it inside `try { … } catch (e) { … }`; write validation as a value
  (`""` or a message), not a thrown class.

**Fixed**

- `affects` on a keyed or structured source that takes a guess threw `INVALID_AFFECTS_TARGET` in a dev build, so the
  action never reached its `await`, and did nothing in a production build, so `pending?` stayed false (#50,
  S-affects-keyed).
- A keyed source that takes a guess (`source rows key id = q.rows`) merges each answer by key instead of replacing every
  row, so a row's readers re-run only when its own leaves change (#51).
- The guide's action example (`guide/async.md` §3) lost an error thrown before the first `await`: the `onFlush` clear
  ran after the catch. The catch now writes the error through `onFlush` as well (#52).
- A `catch` expression read with no observer (a component `fn` called from a handler or an action) built a fresh error
  boundary, which had no value while a `refresh` was out, so the click threw `NotReadyError` and was lost. It is now a
  snapshot: the committed value, or the alternative on a matching failure (R-8, S-catch-snapshot).

**New**

- `bench/`: a representative-task benchmark over the Solid ecosystem's libraries (Formisch, TanStack Query, Router,
  Start and Table, Kobalte, Solid's store). Each task is a good program (accepted by both checkers, typed by the
  library's types, run in Chromium) and one-line mistakes that must be refused. `node bench/run.mjs`; CI holds the
  scorecard.
- A whole query result can be passed to a component whose prop's type keeps the fields' rows:
  `props: { query: { data: pending fails(Error) T; status: string } }` (MO-10f).
- A component that gives a prop on to a provider that renders it (`<RouterProvider router={props.router} />`) renders
  it in turn: a router can be wrapped in the app's own frame, in any module (MO-11o).
- A store updater can have a name: `bump = (d) => { d.done := d.done + 1 }`, then `setTodos(bump)` (MO-10i).
- A part of a `renders` value that its declaration types as a primitive (`getPageCount: () => number`, a row's `id`)
  is passed to a child or a callback as it is, with its type (MO-11l).
- `MUTATION_IN_PLACE` (W-1a): `rows.push(x)`, `props.items.sort()` and the like on the value of a source, an equation,
  a prop or a row.
- `DISPOSER_DROPPED` (EF-5a): a declared JS call whose result is `() => void`, dropped.
- `DUPLICATE_KEY` (ST-4d): two rows of a keyed list written with one key.
- A handler attribute given a call of something io (`onClick={save()}`) is refused (SC-4); a method declared to answer
  nothing is io where the view computes (MO-10b).
- A component a JS host renders (`?rx-lib`) is checked under a root of its own in a whole-program build (CP-4d).
- Advice: `rxc check` lists `advice` beside its diagnostics, never an error. `ASYNC_WATERFALL`: a question awaited
  after another whose answer it does not read.

- `ARGUMENT_COUNT` (AC-1f): a call of an action declared in the module with another number of arguments than its
  parameters is refused.
- `props` in a component declared without props (`component C()`) is `UNBOUND` (RG-4b); it read `undefined`.
- `guide/async.md`: "One store over the server"; the `GUESS_WHILE_LOADING` advice says what holds when a selection
  changes while a guess is out (05 DV-22).

## 0.3.1

**New**

- Spread attributes in markup, `<button {...rest}>` and `<Inner {...rest} />`, lowered to Solid's spread and `merge`:
  later attributes override, and each field keeps updating (07 §4, S-surface-5).

## 0.3.0

`@reactivescript/compiler`, `@reactivescript/runtime`, `@reactivescript/language-server` and the editor extension,
together.

**Breaking**

- `UNGUARDED_SNAPSHOT` (R-8) is stricter: an `errored` region or `disabled` covers a failure only when it reads the
  value. A region whose content reads `x` only under `pending? x` never shows its fallback, so it no longer counts
  (#58).

**New**

- Solid libraries (MO-10): declare a primitive once in a `.d.rx` (`export pure fn createToggle(v: boolean): [ref
  boolean, (v: boolean) => void]`) and use it like .rx: it is called once, `ref` arguments go in as accessors, readers
  are read without a call, and setters are io. A package's `.d.rx` sits beside the file its import resolves to.
  `guide/libraries.md` (#57).
- The guide (shipped in `@reactivescript/compiler`) places data by its lifetime: what a visit, a write or the screen
  needs, with a module only for data whose writes outlive their page (#58, #59).

**Fixed**

- `refresh` of a keyed equation re-asks it. It used to re-ask nothing in compiled code (#58).

## 0.2.0

`@reactivescript/compiler`, `@reactivescript/runtime`, `@reactivescript/language-server` and the editor extension,
together.

**Breaking**

- `optimistic` is now `guess` (`guess todos := …`), and errors clear with `onFlush` (#47). `optimistic` is no longer
  a keyword.
- A new check, `GUESS_WHILE_LOADING` (AC-3a): a guess written before its value has been shown is an error (#53).

**New**

- `rx-tsc`, in `@reactivescript/language-server`: TypeScript's `tsc` with `.rx` files in the program, for CI (#41).
- `else if` in markup: `{if a { … } else if b { … } else { … }}`.
- A guess over an equation, as Solid's `createOptimistic(fn)` (#48).
- Destructuring (RG-4b): live in declarations, a snapshot in `let`, with rest (#49).
- Parse errors are coded and name the JS or React habit they come from; every code has a page in
  `guide/diagnostics.md`, linked from Vite, `rx-tsc` and the editor (#42).

**Fixed**

- A relative JS import (`import pure { f } from "./util.js"`) compiles to an ES import. It used to fail as "not in
  the scenario prelude", so a package.json `#imports` alias was needed. `./api` is still the app's injected API.
