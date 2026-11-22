# Changelog

## Unreleased

**New**

- A library written in `.rx` can be published and used from `.rx` apps and from `.tsx` Solid 2 apps (spec/09 MO-13).
  `rx-lib` (`@reactivescript/compiler`) builds a package: each module compiled for the browser and the server, the
  module an import resolves to on each side, the printed signature as its `.d.rx`, the projection's types
  (`x.rx.d.ts`) and the types of the JavaScript (`x.d.ts`), and it holds the package.json's `exports` to that layout
  (`--write` writes them). An `.rx` app is checked against the shipped `.d.rx` as against the package's source; a
  `.tsx` app gets TypeScript's checks only. The runtime has `library(factory, name)` for the JavaScript side.
- A package's module has one instance in a page, whoever imports it (spec/09 MO-13g): an `.rx` program and a `.tsx`
  host that both import it share its state (they had an instance each). `library` and `components` bind to the page's
  app — the first app made in the page; the app the runtime makes for JavaScript is the one a program's `createApp`
  then returns. A second `createApp` in a page is still a second app.
- On the server, a `.tsx` app that uses an `.rx` package (or `?rx-lib` components) renders with a plain
  `renderToString` or `renderToStream`: outside Solid's request event the state is the render's, found through the
  owner, never shared by two renders. It threw before. Used where nothing renders and no request is answered, it still
  throws, and the message says what to do.
- In a request event, a package's state lives as the request does (spec/09 MO-13g). It was under the first render's
  root: a second render of the same request (a head rendered apart, a `renderToString` inside a stream) read nodes
  the first had disposed. Now each render of the request holds the state, it is disposed when a turn of the event
  loop passes with none open, and a render that begins after that throws, saying why. `holdRequest()` (new, server)
  holds it across an `await` between two renders.
- What the server runtime reads of Solid's internals to find a render's root owner is in one file
  (`ref/compile/solid-internals.ts`), checked against Solid's public `getHydrationWriter()`: a Solid shaped otherwise
  is refused with an error naming its version, where it would have been one app for whatever owner was topmost.
  `runtime/test.mjs` asserts those internals (CI runs it). A package export used under a root made outside any render
  and any request now throws as any use outside a render does (it took the topmost owner for a render).

- A package's module that JavaScript uses first is instantiated in a root no owner holds, whose id is the module's
  name (spec/09 MO-13h): it is not disposed with the component that first read it, and its nodes have the server's
  ids wherever the first use is.
- A `.d.rx` that begins `//@ signature <module>.rx` is the printed signature of a compiled `.rx` module, and is read
  as one wherever a JS import finds it (beside a relative module, or a package's): absent `rejects(…)` is nothing,
  sources, equations, actions, contexts with relative keys, `catches`, `shape(…)` are the signature's. The compiler
  writes the line on every signature it prints (the header comment it wrote before is gone). A `.d.rx` without it is
  a JS module's declaration, as before. The tree-sitter grammar reads such a file.

**Changed**

- The record after a component's props' type is held to that type (spec/13 TY-6f, 09 MO-8o). `props: P & { onChange?:
  handler (v: Option) => void }` was checked as `P & NoInfer<{ … }>`, which an intersection satisfies whatever the record
  says. `rx-tsc` now checks each field of the record on its own: it names a prop the type has, and the type it is written
  with is one the library's type for that prop takes (the same, or narrower). Otherwise `DECLARATION_MISMATCH` on the
  row, naming the prop and both types. A declaration with a retyped or misspelt field in such a record, accepted before,
  is refused.
- `rx-declare` writes no `any` of its own for a module with types, for any export (spec/09 MO-8q, extended): a type
  parameter's bound is written out however long, a part with no name is its place at the row's type parameters
  (`Parameters<typeof import("kit").f<T>>[1]`), a predicate is written as the library writes it, options a row cannot
  write field by field are the type the library declares, a result the library calls `JSX.Element` is a component's
  though the app's project cannot resolve it, a function of nothing that gives an element is `() => View`, and a row
  with a bound that has no name is its last signature with each such part by its place. `--readings <export>` prints
  each reading of a row and TypeScript's answer. The library's own `any`s inside a type it names are reproduced (they
  were counted against the row, which then dropped the type). `bench --check` drafts every export of each module its
  tasks declare and fails on an `any` of the draft's, or on more parts said by place than the scorecard records.
  Generated declarations are redrafted (draft 6).
- The tree-sitter grammar reads a member of an import type, `import("pkg").Types["error"]`.
- A declared component's props may be a type, with the fields that carry words in a record after it (spec/09 MO-8o):
  `export component Select<Option>(props: import("@kobalte/core/select").SelectRootProps<Option> & { onChange?: handler
  (value: Option | Option[]) => void }) provides(select)`. The checker reads the record as it read a record of props; a
  prop it does not list is passed as any undeclared prop is. TypeScript reads the intersection; the boundary check
  (TY-6) finds the row's type parameters from the type alone. Props that are a union of records are written as they are.
- A declaration may hold several rows of one fn's name, one for each of its signatures (spec/09 MO-8p). The checker
  reads the first; a later row that says another word (on the row, a parameter, the result) is a parse error. The
  declaration's `.d.ts` writes an overload per row, and TY-6 holds each.
- `rx-declare` writes a row's types from the library's own declaration (spec/09 MO-8o): the annotation of each parameter,
  result and prop, with every name rewritten to a module the app can import it from — any subpath the package exports
  (`@formisch/solid/v2/internals`), the packages it depends on — under the name it has there (a bundle's `Store$1` is
  `BaseStore`). A result the library names is written by that name unless its parts say something the checker reads; a
  component's props are its props type and the fields that carry words; a fn with several signatures has a row for each;
  a generic method is written at its type parameters' defaults. Generated declarations are redrafted (draft 5).
- `any` is the library's, or it is not written (spec/09 MO-8q): a `.d.rx` holds `any` only where the library's own type
  has it, reproduced as it is; `unknown` stays `unknown`. `rx-declare --explain` reports the library's `any`s and the
  draft's apart, with the parts said by place; `--causes <file>` writes them by row. `bench --check` counts inherited
  and introduced `any`s and by-place parts for each task, fails on an introduced `any` that is not on
  `bench/any-allowlist.json`, and on any of the numbers rising.
- A declared component may have type parameters, as a declared fn may (spec/09 MO-8d): `export component
  Picker<Option>(props: { value?: Option; options: Option[]; onPick?: handler (v: Option) => void })`, on a member
  component too. It was a parse error, so a generic component's props could only be `any`. The checker reads none of
  it; the declaration's `.d.ts` and the boundary check (TY-6) carry it.
- `rx-declare` names a library's types where it wrote `any` (spec/09 MO-8m): another package's type by
  `import("<package>").T`, the module's own by an alias with its bounds, a row's type parameters as the library
  declares them, a callback by its own signature, a conditional or mapped type as the library computes it, an internal
  type by its place. Each row is checked against the module before the draft is written, and one TypeScript does not
  hold is written as before, so a draft passes `rx-tsc` as it stands. `--explain` says why each `any` left is one;
  `--any` drafts as before. Generated declarations are redrafted (draft 4).
- `rx-declare --source [<checkout>]` reads the library's own TypeScript source — a checkout, the `src/` the package
  publishes, or the sources its source maps carry — and writes what it shows of the words types cannot (`handler`,
  `tracked`, `ref`, `uses`, `provides`, `instantiates`, a result that undoes the call) as `// SOURCE` comments above
  the rows, each with its file and line (spec/09 MO-8n). It never writes a word into a row.
- Values the checker confines have a closed set of operations (spec/09 MO-10k, spec/08 CN-7d). A JS result whose
  fields wait or fail is read by the fields its declaration names: `q.valueOf()`, `q.toJSON()`, an undeclared field and
  `q[k]()` are `RESULT_AS_VALUE`. What is called on a library's draft is a method of plain data; a callback given to one
  (`d.items.forEach((row) => { … })`) has parameters that are places of the draft, an iterator read out of one is kept
  as an iterator over copies, and any other method is `DRAFT_ESCAPES`. A method keeps nothing of a `renders` value only
  when `methods(…)` names it and it is called on the value's own name. A call through a record, an array or a call
  (`box.read()`, `fs[0]()`, `mk()()`) reads what the closures it may call read (`SNAPSHOT_KEPT`, `SNAPSHOT_ARGUMENT`).
- `@rx-types/solid-js` (in `declarations/solid-js`): the declaration of Solid itself, found as an `@types` package is
  (09 MO-8k): `createStore` with its draft setter, `snapshot`, `merge`, `omit`, `flush`.
- `rx-declare` types a result a step at a time: a disposer as `() => void`, a small object by its fields (an accessor
  `ref`, a function by what it answers), a class instance by the methods that answer nothing or a promise; an accessor of
  an options object lists its callbacks; the module's own types are named; a generic type is declared with its
  parameters. For `@tanstack/solid-router`, `@solidjs/router` and `@tanstack/solid-query` it also drafts what types
  cannot show (`renders(later)`, `nests(…)`, contexts, `pending fails(Error)`, `tracked`/`handler`, `pure`), from
  `src/known.js`, for the version range each entry was checked against. Generated declarations stay types-only.
- A function field of a declared result that answers a promise (`mutate`, `refetch`) and is not awaited in reactive
  scope is `IO_IN_REACTIVE` (09 MO-10b): `{rename.mutate(v)}` in a view started the mutation on every computation.
- A `draft(…)` equation with a declared type types its draft by it (`sel: Record<string, boolean> = draft({}) { … }`
  was a TypeScript error on `d[k]`).
- A function a context provides or a prop is given is read by its declared type, as a method of a JS result is (09
  MO-10b): one that answers nothing (`add: (id: string) => void`), or a promise of nothing, is called for what it
  does, so `{c.add(id)}` in a view and `onClick={c.add(id)}` are refused — `ACTION_CALLED_IN_OWNED_SCOPE` where every
  provision the module writes gives the field an action, else `IO_IN_REACTIVE`. A prop declared a primitive
  (`title: string`) holds no part of a confined value.
- `GUESS_OUTSIDE_HOLD` also refuses a guess in a run that starts nothing to wait for (06 AC-3): no `await`, `refresh`,
  `affects`, write or call of its own, so the guess would be taken back in the instant it is made. New advice,
  `GUESS_AFTER_AWAIT`: an action's first guess written after an `await`.
- `MUTATION_IN_PLACE` covers what a JS component hands its view (`view (list) { … }`): the library's own state.
- A render prop declared optional (`children?: (items: T) => View`) may be left out: `<Select.Listbox />`.
- Writing through a row found in a store's draft (`let t = d.items.find(…); t.done := true`) is still refused — the
  local is a copy — and the message now says so and gives the two ways to write the row.
- A value `renders` checked where it is bound may be given to a component that keeps it (09 MO-11l): shadcn/ui's
  `<DataTablePagination table={table} />` is accepted. A component keeps a prop when its body lets no value that may
  hold a part of `props.<field>` out (a prop of a component that does not keep it, a provision, a source, an export, a
  thrown value, a call that may keep it); its signature says so, `keeps(table)`, for importers. A component that lets
  it out is still `RENDERS_ESCAPES`, at the application, with the line where it leaves; a JS component never keeps.
- A closure given to a closure is called by it (02 E-10): `pick = (o) => o.total()`, then `createStamp(pick(fmt))`,
  reads what `fmt.total` reads, and so does `apply = (g) => g()` given `total`, a parameter handed on to another
  closure, and a closure the callee gives what it reads. These froze a value; they are `SNAPSHOT_ARGUMENT` /
  `SNAPSHOT_KEPT`. A slot the argument's literal names stays that slot (`(o) => o.name` reads no closure).
- A closure's parameter may have a function type: `(g: () => string) => g()` (it was a `PARSE` error).
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
- `DISPOSER_DROPPED` (EF-5a): a declared JS call whose result is `() => void`, dropped. The type is read through a
  name its declaration file gives it (`export type Unsubscribe = () => void`) and TypeScript's `VoidFunction`; a
  subscription object counts (`{ unsubscribe: () => void }`, and `dispose`, `destroy`, `disconnect`, `stop`, `cancel`,
  `close`); and the local it is bound to must be used on every path (`if (on) { return () => { stop() } }` drops it
  where `on` is false; `let later = stop` keeps it only as far as `later` is used). `rx-declare` drafts such a result
  as `() => void`.
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
