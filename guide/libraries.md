# Using Solid libraries from .rx

A Solid library (solid-primitives, a design system's hooks, your own `create*` helpers) is plain JavaScript. To use
one from .rx, declare what it exports once, in a `.d.rx` file, and then use it like .rx. The declaration is checked
at every use; the JavaScript itself is not checked (it's the library's).

## Declare it

To start from a draft, run `npx rx-declare <package> --out <name>.d.rx` (the language server's package): it writes
what the package's TypeScript types show and leaves a `// TODO` line for each row only you can decide. For the routers
(`@tanstack/solid-router`, `@solidjs/router`) and TanStack Query it also writes the rows types cannot show.

The draft's types are the library's own, by name: `import("@tanstack/solid-query").QueryClient`, a generic row's type
parameters, a callback's signature. You rarely need to touch them, and never need to restate them: TypeScript checks
your `.rx` against the package's types either way, and the checker reads only a row's shape and words. For the words,
`npx rx-declare <package> --source [<checkout>]` reads the library's source and writes what it finds above each row —
`// SOURCE …: called from addEventListener … — `handler`? [src/eventListener.ts:67]` — as a suggestion with its place.
It never writes the word for you.

A component's props can be the library's own type, with only the fields that carry a word written after it —
`export component Dialog(props: import("@ui-sdk/solid/dialog").DialogProps & { onOpenChange?: handler (open: boolean,
details: DialogOpenChangeDetails) => void }) provides(dialog)`. A function with several signatures (TypeScript's
overloads) has one row, as every export has: one of its signatures, with the words, which are the function's — your
calls are typed by the library's own overloads either way. A field in that record is the library's prop written again: `rx-tsc` refuses one the
props' type has no prop for, or one given another type than the library's (it may be narrower). Don't write `any` where the library has a type: name the type (`rx-declare --explain`
says which `any`s are the library's own and which are the draft's).

Solid itself needs none of this: `npm i -D @rx-types/solid-js` is its declaration (`createStore`, `snapshot`, `merge`,
`omit`, `flush`), found as an `@types` package is.

```rx
// media.d.rx, beside media.js — or shipped by the package beside the file its import resolves to
export pure fn createToggle(initial: boolean): [ref boolean, (v: boolean) => void]
export pure fn createDebounced(ref source: string, ms: number): ref string
export pure fn createMediaQuery(query: string): ref boolean
export pure fn createEventListener(target: EventTarget, type: string, handler: (e: Event) => void) instantiates
```

- **`ref T` is an accessor.** In a parameter, the library takes an accessor (Solid's `Accessor<T>`); in a result, it
  hands one back. .rx has no accessor type: you pass and read plain values, and the compiler adds the `() => …` and
  the call.
- **A function in a result is io.** A setter can be called only in imperative code (an action, a handler).
- **Anything else is a value.** A store a library returns is a value whose fields track, as in Solid.
- **`instantiates`** says the call creates state and must run once. It is inferred from any `ref`, so you write it
  only for a primitive with no `ref` on either side (one that registers a listener, or returns a store).
- `pure fn` is right for a primitive: making it writes nothing but its own state.

Where the file goes:

- **Your own JS module:** `./media.js` with `./media.d.rx` beside it.
- **A package that ships one:** nothing to do. The compiler resolves the import the way a bundler does (`exports`,
  `module`, `main`) and reads the `.d.rx` beside that file (`dist/index.jsx` → `dist/index.d.rx`).
- **A package that doesn't:** put it in `rx-types/`, named by the import: `rx-types/@solid-primitives/media.d.rx` for
  `import { createMediaQuery } from "@solid-primitives/media"` (a subpath is a folder:
  `rx-types/@ui-sdk/solid/dialog.d.rx`). `npx rx-declare @solid-primitives/media --out rx-types/@solid-primitives/media.d.rx`
  drafts it. Your import stays as written; nothing re-exports it.
- **A shared declaration:** an `@rx-types/<scope>__<name>` package (like `@types`), with `index.d.rx` (and
  `<subpath>.d.rx`).
- **Nothing written:** the Vite plugin and the editor draft one from the package's types into
  `node_modules/.rx-types/` (see [Generated declarations](#generated-declarations)).

The first of these that exists is the declaration, in this order: `rx-types/`, the package's own, `@rx-types`,
generated. So a project file replaces a shipped one that is wrong; pin it (`//@ for <package> <range>`) so it can't go
stale silently. rx-tsc checks a `rx-types/` file against the package's own types (`DECLARATION_MISMATCH`), and types a
package that has none from it.

### Generated declarations

A package you import with no declaration anywhere gets one drafted for you. Before a build (and in the editor), the
plugin reads the package's TypeScript types and writes `node_modules/.rx-types/<package>.d.rx`: its components with
their props, its functions as io, accessors as `ref`. A draft never guesses that a function is `pure` (a name like
`useX` is a convention, not a fact), so calling one where a component computes is refused until you say it is, and the
error says where. It's redrafted when you upgrade
the package. So `import { Badge } from "some-solid-kit"` just works.

A draft says only what types show:

- a component you hand to one of its functions is checked under a root of its own (MO-11s): give it its own
  `errored`/`loading` and the contexts it reads;
- a hook's provider and a field that suspends or throws are **not** checked: as in TypeScript, they fail at run time;
- a function is io until a person writes `pure` for it.

To say those, write `rx-types/<package>.d.rx` (it wins over the draft): `npx rx-declare <package> --out
rx-types/<package>.d.rx` starts from the same draft, with a `// TODO` for each guess to confirm (`pure`, `handler`);
`--run` also runs the package to find which hooks need a provider (it executes the package's code). `npx rx-verify
rx-types/<package>.d.rx` runs your rows against the package (`--record` keeps the result for `rx-tsc --rx-strict`).
One thing to look at in a draft: a function that takes nothing and answers a value is drafted `ref`, as an accessor is,
and types cannot tell `size: () => number` from `remove: () => Item` — write the second as the function it is.
Turn drafting off with `RX_GENERATE=0` or `rx({ generate: false })`.

## Use it

```rx
import { createToggle, createDebounced, createMediaQuery } from "./media.js"

export component Search(props: { start: boolean, q: string }) {
  [isOn, setOn] = createToggle(peek props.start)   // runs once; peek: `start` is read once, and you mean it
  query = createDebounced(props.q, 300)            // passed as an accessor: it follows props.q
  wide = createMediaQuery("(min-width: 768px)")
  action flip() { setOn(!isOn) }

  <button onClick={flip}>{isOn && wide ? query : "off"}</button>
}
```

What a library hands back that waits or throws where it is read is an accessor to `.rx`: declared `ref`, read as a
value, and able to hold like a value from an `await`. A plain `ref` asks nothing of you. Where the accessor is known
to wait for its first value, or to throw, the row says so before the `ref`, and you are asked for the regions an
`await` would need:

```rx
export pure fn createJson(url: string): pending fails(Error) ref User             // the whole result
export pure fn createSSE<T>(ref url: string): { data: pending fails(Error) ref T; readyState: ref number; close: () => void }
```

```rx
user = createJson("/api/user")
errored fallback(e) { <p>failed: {e.message}</p> } {
  loading fallback { <p>loading…</p> } { <p>hello {user.name}</p> }
}
```

Without the `errored` region the read is `UNHANDLED_FAILURE`; in a client-only app, without the `loading` one it is
`ASYNC_OUTSIDE_LOADING_BOUNDARY`. The words go before a `ref` part and nowhere else: the whole result, an item of a
tuple, a field of a record. A record or a tuple with such a part is read a part at a time (`q.data`, never `q` passed
whole: `RESULT_AS_VALUE`); the part itself goes anywhere. `rx-declare` writes the words where it knows them (a release
it was checked against, or a hook `--run` could run), and `rx-verify` points out an accessor that waited without
saying so.

One library hands back a store whose plain field waits instead (a query's `data`), and no row says so of a plain
field (until 2026-11-23 `pending` and `fails(…)` before the field did: one library wrote them, and they are refused
now). Hand the field out as a function, in a few lines of your own (`data: () => q.data`), and declare it `pending
fails(Error) ref`: see *When no word says what a library does*, below.

A primitive runs in an owner of its own, under the place you wrote it. You don't see it, except that a library whose
server render makes fewer effects than its browser one — many return early under `isServer` — no longer breaks the
hydration of what you write after it, as it does in a `.tsx` app (`Hydration key miss`). What it registers with
`onCleanup` runs when the place you wrote it goes (the branch closes, the row leaves), and a failure while it is made,
or later in what it made, goes to the `errored` region you wrote it under.

`isOn`, `query` and `wide` are equations like any other: read them without calling them. They may hold, like a
value from an `await` (Solid promises nothing about an accessor), so `latest`, `pending?` and `loading` apply; only
one whose row says `pending` or `fails(…)` asks for a region.

What the compiler catches:

| you write | you get |
| --- | --- |
| `createToggle(props.start)` | `SNAPSHOT_ARGUMENT`: a value argument is read once; write `peek props.start`, or the library should take `ref` |
| `x = setOn(true)` | `IO_IN_REACTIVE`: a setter is called from an action or handler |
| `<p>{createMediaQuery(q)}</p>` | `INSTANTIATION_NOT_BOUND`: bind it, `wide = createMediaQuery(q)` |
| `onClick={setOn(true)}`, `onNext={table.nextPage()}` | `IO_IN_REACTIVE`: a handler is passed, not called: `onClick={() => { setOn(true) }}` |
| `rows.push(x)` on a source, `props.items.sort()` | `MUTATION_IN_PLACE`: write it (`rows := rs => [...rs, x]`), or take a copy (`toSorted()`) |
| `listen(…)` as a statement, when `listen` is declared `(): () => void` | `DISPOSER_DROPPED`: keep what it answers and call it in the effect's cleanup |

## What stays the library's

- **Its own rules.** The compiler checks Solid's rules where your program meets the library, as its declaration
  states them; it doesn't check the library's own. A TanStack query key that leaves out a value its `queryFn` reads
  compiles, and answers from the cache for every value: that's the cache's contract, and TanStack's ESLint rule
  (`exhaustive-deps`) is what checks it.

- **Its setters are not writes of a source.** The compiler can't see them as writes, so a read right after one, in
  the same action, gives the value from before it (Solid batches the write), and nothing warns you:

  ```rx
  action flip() {
    setOn(!isOn)
    label := isOn ? "on" : "off"     // still the old isOn
  }
  ```

  Compute the new value once and use it: `let next = !isOn; setOn(next); label := next ? "on" : "off"`.
- **A callback the library calls later is `handler`.** With `onSuccess?: handler () => void` in the declared options,
  `onSuccess: () => { saved := saved + 1 }` may write sources, as an `onClick` may. A function type without the word
  is pure: the library might call it while it computes (a comparator, a mapper), so a statement closure there is
  refused (`REACTIVE_WRITE_IN_OWNED_SCOPE`). The word is the declaration's promise; `rx-verify` checks it by running.
  The same holds for a JS component's props, whatever their names: `onChange: handler (v: string) => void` takes a
  writing closure, `onChange: (v: string) => void` does not. Only a prop the declaration leaves untyped (or does not
  name) is read by its name, an `on…` one as an event handler.
- **A function the library calls inside its own computation takes no word.** TanStack Query runs `queryFn` while it
  computes `data`: `queryFn: () => Promise<any>`, a function type without `handler`, is already what that needs — a
  closure there is a pure one, as anywhere in reactive scope (no writes; its reads are tracked by the library).
  `rx-verify` tells the two apart by running: a `handler` called inside a computation is a mismatch, and it reports
  which unmarked functions the library calls later, where `handler` would let a closure write.
- **Callbacks you pass are plain functions.** An action passed as `handler` is checked as an action; a plain closure
  is not checked beyond what any closure is.
- **A store's updater can have a name.** `setTodos((d) => { d.done := d.done + 1 })` writes the library's draft (a
  parameter declared `draft`). To share one change between handlers, name the closure and give the name to the setter:
  `bump = (d) => { d.done := d.done + 1 }`, then `setTodos(bump)` wherever it is needed. The name is used for
  nothing else (`DRAFT_ESCAPES`). Inside an updater the draft's own methods work as in JS (`d.items.push(x)`,
  `d.items.forEach((row) => { row.done := true })`), and whatever is read out of it to keep is a copy.
- **A loop over a draft visits what it held when the loop started.** `for (const t of d.items) { … }` is not
  JavaScript's `for … of`, which reads the list as it goes: a turn that pushes to `d.items` is not handed what it
  pushed, and one that removes a row still visits it. A loop's turn is a place of the draft (`t.done := true` writes
  the row).
- **A row of a draft is written where it is read.** A row found by a method is a copy once it has a name of its own
  (`let t = d.items.find((x) => x.id == id)`), so `t.done := true` would change nothing and is refused. Write the
  place: `let i = d.items.findIndex((x) => x.id == id); d.items[i].done := true`, or loop:
  `for (const t of d.items) { if (t.id == id) { t.done := true } }`.
- **A helper that changes a draft says so.** A JS function that changes the list it is given in place
  (`moveItem(list, from, to)`, a drag-and-drop library's `arrayMove`) declares that parameter `draft`:
  `export fn moveItem(draft list: any[], from: number, to: number): void`. Then `setBoard((d) => { moveItem(d.columns,
  0, 2) })` hands it the draft itself, and the store follows. Given anything else that is not its own to change — a
  source's list, a prop, the store outside its setter — the call is `MUTATION_IN_PLACE`. A JS function whose parameter
  is not marked is lent a copy of the draft, to read or to keep; in a development build that copy throws if the
  function tries to change it, and the error says which word is missing.
- **What a library's value answers is its declaration's.** A table or a client is declared with the type of what the
  app reads of it: `createTable(…): { getPageCount: () => number; nextPage: () => void; getRowModel: () => { rows:
  { id: string }[] } } instantiates`. A method declared to answer nothing (`nextPage`) is called from a handler, one
  that answers a value is read where you like, and the table is a value you may hand to a component of your own.
  `rx-tsc` checks the declared type against the library's own. The components you give such a function (a column's
  cell) are checked each under a root of its own: a cell takes what it needs from the context the table hands it,
  not from a context of your app (until 2026-11-23 `renders` after the row said "where the table is bound"; one
  library wrote it, and it is refused now).
- **A store has one identity.** An `.rx` source of records is a Solid store: a write changes what it holds, not which
  object it is. A library that sees a change by identity (TanStack Table's `data`) is given a fresh list,
  `data: [...rows]`.
- **Without a declaration,** an import is io unless you import it `pure`, and `import pure` of a primitive is
  unchecked: the call is then an equation, re-run (and the primitive rebuilt) whenever an argument changes. Declare
  primitives instead.

## When no word says what a library does

A declaration has few words on purpose (spec/09 MO-8r): one is there only when more than one library needs it to be
used correctly. What a single package does, you say without one, in one of three ways.

- **Leave it undeclared.** An import with no row is io and can fail with `Error`: call it from a handler or an action,
  and TypeScript still types the call from the library's own `.d.ts`. A component you give such a function is checked
  under a root of its own (it must bring its own boundaries and contexts), which is also exactly right for a
  modal manager that mounts what it is given itself. (A library that renders it beneath a component of its own — a
  toaster's `<Toaster>`, a router's provider — says so, `renders(Toaster)`: *Components and routers*, below.)
- **A few lines of your own JavaScript, declared in the words there are.** A module beside your app (`./storage.js`
  with `./storage.d.rx`, and a `.d.ts` or TypeScript source for its types) turns the library's shape into one a row
  can say:

  ```js
  // a primitive that wraps a Solid signal: make the signal here
  import { createSignal } from "solid-js"
  import { makePersisted } from "@solid-primitives/storage"
  export const persisted = (init, options) => makePersisted(createSignal(init), options)
  // a module's default export: give it a name
  export { default as useOnlineStatus } from "solid-use/online-status"
  // one function that reads and writes (an "atom"): a reader and a setter
  import atom from "solid-use/atom"
  export const createAtom = (init) => { const a = atom(init); return [() => a(), (v) => { a(v) }] }
  // a callback the library runs once, on the server, and that is impure on purpose: write it in JavaScript
  import useServerValue from "solid-use/server-value"
  export const useTicket = () => useServerValue(() => Math.random().toString(36).slice(2))
  ```

  ```rx
  export pure fn persisted(init: string, options?: { name?: string }): [ref string, (v: string) => void]
  export pure fn useOnlineStatus(): ref boolean
  export pure fn createAtom<T>(init: T): [ref T, (v: T) => void]
  export pure fn useTicket(): string
  ```

  The same module is where these go (each met in more than one library, none with a row of its own):

  ```js
  // a function the view calls, handed back by a primitive (a translator's `t`): give it as a field
  import { translator, resolveTemplate } from "@solid-primitives/i18n"
  export const createI18n = locale => ({ t: translator(() => dictionaries[locale()], resolveTemplate) })
  // a class you construct
  import { ReactiveMap } from "@solid-primitives/map"
  export const makeMap = initial => new ReactiveMap(initial)
  // one function that is the ref and the reading (a Wardic sensor): two names
  import { createHover } from "@wardic/solid"
  export const createHoverSensor = () => { const h = createHover(); return { ref: el => h(el), hovered: () => h() } }
  ```

  ```rx
  export pure fn createI18n(ref locale: "en" | "fr"): { t: (key: string, args?: Record<string, string>) => string } instantiates
  export pure fn makeMap<K, V>(initial?: [K, V][]): import("@solid-primitives/map").ReactiveMap<K, V> instantiates
  export pure fn createHoverSensor(): { ref: (element: Element) => void; hovered: ref boolean } instantiates
  ```

  `i18n.t("hello")` in the view is then a read: a function that is a *field* of a result and answers a value may be
  called anywhere, while a function a primitive hands back by itself (or as a tuple's part) is io — it is how a setter
  is told from a reader.

  A store whose plain field waits or throws where it is read goes the same way, a function a field:

  ```js
  import { useQuery as useLibraryQuery } from "@tanstack/solid-query"
  export const useQuery = options => { const q = useLibraryQuery(options); return { data: () => q.data, isFetching: () => q.isFetching, refetch: o => q.refetch(o) } }
  ```

  ```rx
  export context queryClient from "@tanstack/solid-query"
  export pure fn useQuery<T>(ref options: { queryKey: unknown[]; queryFn: () => Promise<T> }): { data: pending fails(Error) ref T; isFetching: ref boolean; refetch: () => Promise<unknown> } uses(queryClient)
  ```

  `data` says what the library's field does — it waits for the first answer and throws the query's error — so a read
  of `todos.data` with no `errored` region above it is refused, as a read of an `await` would be.

  **You do not write those rows.** `rx-declare ./query.js` drafts them whole (spec/09 MO-8s): the module only hands
  the library's hook on, so its row takes the library's words — `pure` and `uses(queryClient)`, because the body
  calls the hook at its top and does nothing else; `ref` for each field that only reads the result; `pending
  fails(Error)` on `data`, which rx-declare knows of the release. The same goes for the other small modules an app
  writes over a library: a component that renders the library's provider and nothing else takes its
  `provides(router)`, `export const Router = createRouter(…)` takes the factory's, a component exported again keeps
  its row's words, and a function that hands its argument straight to Kobalte's `toaster.show` takes
  `renders(Toast.List)`. Nothing is guessed: a word is copied from the row it was written on, only in the shapes
  where the text shows the module does that and no more (a hook called behind a condition takes nothing, and its
  TODO stays). `--types-only` leaves them out.

  **Your wrapper still needs the library's provider, and says so.** `export context queryClient from
  "@tanstack/solid-query"` names the context that package's declaration declares, so `uses(queryClient)` on your hook
  is the library's context: the hook outside `<QueryClientProvider>` is `CONTEXT_NOT_FOUND`, as the library's own is.
  The same line lets a component of yours that renders the library's provider say `provides(…)` of it. The module
  you name must be declared (your `rx-types/`, or the package's own `.d.rx`) and declare that context.

- **The library's own types.** A row restates no more of a type than its words need: props can be the library's type
  (`props: DialogProps & { onOpenChange?: handler (…) => void }`), a result its name, and of several signatures one.
  `rx-tsc` checks your calls against the library's `.d.ts`, not against the row.

Two things the language says itself. A method of a library's object that makes its value once is read once with
`peek`: `createRouter({ routeTree: peek rootRoute.addChildren([indexRoute, personRoute]) })` (without it the checker
cannot know the answer never changes, `SNAPSHOT_ARGUMENT`). And an object of components exported under a small letter
(Motion's `motion`, Wardic's `wardic`) is imported under a capital — `import { wardic as Wardic }`, then
`<Wardic.div>` — because a tag is a component's by its capital; `<wardic.div>` is refused, with that spelling.

## Components and routers

A Solid component from JS is declared the same way, with its props as TypeScript types. A function that hands back a
component (a router's `createRouter`) is declared with `Component` as its result:

```rx
// router.d.rx, beside router.js: export { createRouter, useParams, useNavigate } from "@solidjs/router"
export type RouteDefinition = { path?: string; component?: Component; children?: RouteDefinition[] }
export context router
export pure fn createRouter(config: { routes: RouteDefinition[] }): Component provides(router) nests(children in component)
export pure fn useParams(): Record<string, string> uses(router)
export pure fn useNavigate(): (to: string) => void uses(router)

// ui.d.rx, beside ui.js
export component Shell(props: { header?: Component; children?: View })
```

```rx
import { createRouter, useParams } from "./router.js"
import { fetchUser } from "./users.js"

component Home() { <h1>Home</h1> }
component User() {
  params = useParams()                 // the router's store: params.id follows the URL
  user = await fetchUser(params.id)    // asked again when the param changes
  loading fallback { <p>Loading…</p> } { <h1>{user.name}</h1> }
}
Router = createRouter({ routes: [{ path: "/", component: Home }, { path: "/users/:id", component: User }] })

export default component App() {
  errored fallback(e) { <p>{e.message}</p> } {
    <nav><a href="/">Home</a> <a href="/users/1">Ada</a></nav>   // plain links: the router handles their clicks
    <Router />
  }
}
```

- **A component is a value only where JS takes one:** in a factory's arguments (`component: Home`), or on a JS
  component's prop typed `Component` (`<Shell header={Title} />`) — or holding one in a record or a list, in the
  literal you write there (`<Markdown builtins={{ Heading: Heading }}>`, `<Tabs panels={[First, Second]} />`): each is
  checked as applied beneath that component. Given to any other JS call, it is checked under a root of its own, with
  nothing above the call credited (MO-11s), unless the fn's row says where the library renders it (next); applied
  nowhere else, it is `COMPONENT_AS_VALUE`.
- **A component a library renders later, beneath one of its own.** A toaster is given a toast in a handler and renders
  it in its `<Toaster>`; a router is given a page by `createRoute` and renders it in its provider. The row names that
  component, which the same declaration declares:

  ```rx
  // rx-types/solid-sonner.d.rx
  export component Toaster(props: ToasterProps)
  export fn toast(message: View | (() => View), data?: ExternalToast): string | number renders(Toaster)
  ```

  ```rx
  import { Toaster, toast } from "solid-sonner"
  context accent: string
  component Saved() { <b class={use accent}>saved</b> }
  export default component App() {
    provide accent = "dark"
    <button onClick={() => { toast(Saved) }}>save</button>
    <Toaster />                       // Saved is checked here: `accent` is above it
  }
  ```

  The component is checked among `<Toaster>`'s children, at every place your program applies it — in whichever module
  — with what is above each: move the `provide` beside the toaster and `toast(Saved)` is `CONTEXT_NOT_FOUND`, on the
  line of the call. With no `<Toaster>` anywhere, the component is held to what `Toaster` itself uses and provides.
  A `<Toaster />` in a layout that a router renders is where the router's provider is: what you provide above the
  provider is above the layout, and so above the toaster.
  `rx-declare` asks the question of every function that is given a component, and writes the word for the releases it
  was run against (solid-sonner's `toast`, TanStack Router's `createRoute`). Where the library's function is a method
  of an object (Kobalte's `toaster.show`), hand it out from a module of your own with the parts it renders with, and
  the word is said there: `export fn show(toast: Component<{ toastId: number }>): number renders(Toast.List)` —
  which `rx-declare` drafts for that module, with the parts' contexts (`bench/tasks/kobalte-toast`: no word by hand).
  A row for the method itself was weighed and not taken (spec/09 MO-11u): of the two libraries with such a method,
  one renders what it is given beneath its list and the other calls it with no owner. A library that *calls* what it is given with no owner at all (sonner's
  `toast.custom(fn)`) is another matter: nothing your component reads from above is there (in development Solid
  throws `NoOwnerError` from `useContext`), and nothing it makes is cleaned up. No row describes that; `rx-verify`
  reports it.
- **Each component you hand over is checked as if it were applied there:** its failures need an `errored` above
  `<Router />` (or inside the page), the contexts it uses need a `provide` above `<Router />`, and in a client-only
  app its first load needs a `loading` above it.
- **Layouts count for their nested routes** when the factory is declared `nests(children in component)`: a route
  under a record's `children` is checked inside that record's `component`, so an `errored` or `provide` the layout
  puts above `props.children` covers it. Without the word, put them above `<Router />`.
- **A router can live in its own module.** `export Router = createRouter(…)` exports it; whoever applies `<Router />`
  gets its pages' needs through its signature, so the `errored` or `provide` they need goes above `<Router />` there.
- **A router whose routes are values.** TanStack Router builds its tree from values (`createRoute({ getParentRoute,
  component })`, `createRouter({ routeTree })`, `<RouterProvider router={…} />`) and renders a page at its parent's
  `<Outlet />`. Its rows say where the pages render — `createRoute(…) renders(RouterProvider)`, drafted by
  `rx-declare` — so you write the tree with the library's own functions, the route types register your router (a link
  to no route is a type error), and every page is checked beneath the provider: the router's hooks are found, and what
  you provide or catch above `<RouterProvider>` reaches it (`bench/tasks/router-code-routes`). What the word does not
  say is the tree's nesting: pages are checked side by side beneath the provider, so a layout's own `errored` around
  its `<Outlet />` is not credited to its pages — a page holds its own failure, or the region goes above the provider.
  (`renders(later)`, a prop's `renders`, `nests(component under parent)` and `outlet`, which followed the route values
  to the provider, stay refused by name.) For a tree whose layouts' regions are checked, write it as records and give
  it to a few lines of JavaScript that build the library's routes from them, in the shape above:

  ```js
  // routes.js
  import { createComponent } from "solid-js"
  import { createRootRoute, createRoute, createRouter, RouterProvider, Outlet } from "@tanstack/solid-router"
  export function createAppRouter(tree) {
    const route = (record, parent) => {
      const component = () => createComponent(record.component, { get children() { return createComponent(Outlet, {}) } })
      const made = parent ? createRoute({ getParentRoute: () => parent, path: record.path, component }) : createRootRoute({ component })
      return record.children?.length ? made.addChildren(record.children.map(child => route(child, made))) : made
    }
    const router = createRouter({ routeTree: route(tree) })
    return () => createComponent(RouterProvider, { router })
  }
  ```

  ```rx
  // routes.d.rx
  export context router from "@tanstack/solid-router"
  export type RouteRecord = import("./routes.js").RouteRecord
  export pure fn createAppRouter(tree: RouteRecord): Component provides(router) nests(children in component)
  ```

  A layout renders its pages as `props.children`, the library's hooks (`useParams`, `<Link>`) are imported from the
  package as usual, and every check above holds: a page's failure needs the layout's `errored` around its children, a
  hook outside `<AppRouter />` is `CONTEXT_NOT_FOUND`. What it gives up is TanStack's registered route types (a link
  to no route is no longer a type error): they need the router's own value to name its type. A route tree kept in
  TypeScript — a file-based router's — keeps them, and keeps the layouts' checks too once you say what the router
  does with your pages: *File-based routers*, below.
- **A provider can be wrapped.** The made router is a component: your app's frame takes it as its children
  (`<Shell title="Directory"><AppRouter /></Shell>`), and the pages are checked under what `Shell` puts around
  `props.children`. (With a router built in JavaScript, name your app's component in `host.d.rx`: *File-based
  routers*, below.)
- **Say which context a hook needs.** `export context router` names the library's context; `uses(router)` on a hook
  makes a call with no router above it `CONTEXT_NOT_FOUND`, instead of a run-time throw, and `provides(router)` on
  `createRouter` (or on a provider component) says where it comes from. A hook that uses a context is called once, where
  it is bound, so `instantiates` is implied.
- **A JS import you apply must be declared.** Without `export component X(…)` in its `.d.rx`, `<X />` is
  `UNKNOWN_COMPONENT`.

### File-based routers

A file-based router finds its route files itself: a generated route tree, or a manifest of the routes directory,
imports each file's component and renders it under the router's provider, inside the layout its file name puts it
in. No `.rx` module applies your pages, so nothing in `.rx` shows the checker what is above them — and a component
JavaScript renders is checked as if nothing were (a root of its own): a page that leaves its failure to its
layout's `errored` region, or calls `useParams`, is refused. Say what the router does, once, in `host.d.rx` (spec/09
MO-14), in the folder of your `.rx` modules or one above it:

```rx
// src/host.d.rx
import { Layout, Home, Person } from "./pages.rx"
export context router from "@tanstack/solid-router"
export default component provides(router) nests(children in component) = [
  { component: Layout, children: [{ component: Home }, { component: Person }] }
]
```

**You do not write this file either: it is read off the router** (spec/09 MO-14g). The router has the tree — the
file it generates, or the directory it scans — and `rx-declare` writes the declaration from it:

```sh
npx vite build                                                        # the router's plugin writes its tree first
npx rx-declare --host --routes src/routeTree.gen.ts src/main.rx --out src/host.d.rx   # TanStack Router, TanStack Start
npx rx-declare --host --routes src/routes src/App.rx --out src/host.d.rx              # filesystem-routing: the routes directory
```

The first line of the file it writes records where it came from (`//@ routes ./routeTree.gen.ts ./main.rx`), and
from then on the file is that tree's: the dev server writes it again when a route file is added or moved; `rx-tsc`,
`rx-verify` and a build refuse it once it has fallen behind (`HOST_VIEW_STALE`, saying which route and where;
`rx-declare --host --sync src/host.d.rx` writes it again, `--check` only asks). The `.rx` module named after the
source is your entry, where it is `.rx`: its component goes around the routes, with the component of your own it
renders them through (the one from the module that imports the tree) and the router's outlet where a layout uses it.
What follows is what the file says, for when you read one — or write one for a host no reader knows (a JSON tree,
`[{ "file": "./pages/home.rx", "children": [...] }]`, is read too).

It imports the components the host renders, as an `.rx` module would, and states the view the host makes of them
in the words a factory's row has: `provides(router)`, what it provides to all of them, and `nests(children in
component)`, that a record's `children` are rendered among its `component`'s children. The checker walks that view
as your app's: `Person` is checked among `Layout`'s children, under the router. A layout with no `errored` region
around `{props.children}` is then `UNHANDLED_FAILURE` — reported on `host.d.rx`, at the view, naming the page's read
(`person.name at pages.rx:23`) — and a hook in a component the view does not name is still `CONTEXT_NOT_FOUND` in a
whole-program build, since JavaScript may render that one anywhere.

- **TanStack Router, with `.rx` route files** — the native shape, on a fork for now. The generator as released takes
  `.ts`, `.tsx`, `.js`, `.jsx` and `.vue` files and reads a route file as JavaScript. One option changes that:
  `routeComponentExtensions`, which is not upstream yet (`github.com/yumemi-thomas/router`, branch `rx-route-files`).
  With it a route file is its component:

  ```ts
  // vite.config.ts
  tanstackRouter({ target: "solid", routeComponentExtensions: { ".rx": "?rx-page" } })
  ```

  ```rx
  // src/routes/people.$id.rx
  import { useParams } from "@tanstack/solid-router"
  import { fetchPerson } from "../people.js"
  export default component Person() {
    params = useParams({ from: "/people/$id" })
    person = await fetchPerson(params.id)
    <h1>{person.name}</h1>
  }
  ```

  The generator writes the route objects itself into `routeTree.gen.ts`, importing each file's default component as
  a page (`?rx-page`), so links and hooks are typed by the tree as ever, and `host.d.rx` is derived from that tree
  (`bench/tasks/router-rx-routes`, which installs the fork's two packages from tarballs: its `vendor/README.md` says
  which commit and how they were built). A route that needs a loader or search validation is a TS route file
  beside the `.rx` ones, as the fork's documentation says.
- **TanStack Router and TanStack Start, as released: the fallback.** A route file is a few lines of TSX that hand the
  route a component of yours. (No option of the released generator changes that: a virtual route config may name any
  file, and the generator then parses it as JavaScript.)

  ```tsx
  // src/routes/__root.tsx
  import { createRootRoute } from "@tanstack/solid-router";
  import { Layout } from "../pages.rx?rx-lib";
  export const Route = createRootRoute({ component: Layout });
  ```

  ```tsx
  // src/routes/people.$id.tsx
  import { createFileRoute } from "@tanstack/solid-router";
  import { Person } from "../pages.rx?rx-lib";
  export const Route = createFileRoute("/people/$id")({ component: Person });
  ```

  The layout renders its pages with the router's `<Outlet />`, as TanStack's documentation writes one — see *What
  the router renders through*, below, for the line `host.d.rx` needs for it. (A route file may also pass the outlet
  as the layout's children, `component: () => <Layout><Outlet /></Layout>`, to a layout written with
  `props.children`: `bench/tasks/start-route` does.) The generated `routeTree.gen.ts` registers the router as usual,
  so `<Link to="/peeple/$id">` and `useParams({ from: "/person/$id" })` in `pages.rx` are type errors
  (`examples/tanstack` and `bench/tasks/router-provider`, apps whose entry is `.rx` and whose router is a TSX
  module's component; `bench/tasks/start-route`, served and hydrated by Start).
- **File-system routes on `@solidjs/router`** (`filesystem-routing`: SolidStart's conventions as a package, for
  Solid 2). The route files themselves are `.rx`: the scanner takes the extension, and each file is imported as its
  page, its default component (`?rx-page`):

  ```ts
  // vite.config.ts
  fileRoutes({ extensions: ["rx"], types: "src/file-routes.d.ts",
    toRoute: (src, router) => ({ path: router.toPath(src), page: true, $component: { src: `${src}?rx-page`, pick: ["default"] }, $$route: undefined }) })
  ```

  ```rx
  // src/routes/(app)/people/[id].rx
  import { useParams } from "@solidjs/router"
  import { getPerson } from "../../../people.js"
  export default component Person() {
    params = useParams()
    person = await getPerson(params.id ?? "")
    <h1>{person.name}</h1>
  }
  ```

  `host.d.rx` imports each route file's page by its name (`import { Person } from "./routes/(app)/people/[id].rx"`).
  With the declaration there, a route file's default component is not a mounted view: it is the host's to render.
  The plugin's `types` option writes the manifest as a literal tuple, which types the router's `paths`:
  `paths.person("9")` in a layout is a type error (`bench/tasks/file-routes`).
- **Solid's start mode** — server rendering and hydration with nothing but Solid's Vite plugin. SolidStart is not
  needed on Solid 2 (and `@solidjs/start` 2 still asks for Solid 1.9): `@solidjs/vite-plugin` 3 has Start as a mode,
  which owns the entries, the dev server's render and the build. An app is its root component and its routes — no
  `index.html`, no mount file, no server file:

  ```ts
  // vite.config.ts
  export default defineConfig({ plugins: [
    fileRoutes({ extensions: ["rx"], types: "src/file-routes.d.ts", toRoute: /* as above */ }),
    solid({ ssr: true, start: { nodeServer: true } }),      // `vite` renders each request; `vite build`, then `node dist/server/node.js`
  ] })
  ```

  ```ts
  // src/App.ts — start mode's root is a TS or JSX file: hand it the .rx root as a page
  export { default } from "./App.rx?rx-page";
  ```

  ```rx
  // src/App.rx
  import { Router } from "./router.ts"
  export default component App() {
    provide team = { name: "Directory" }
    loading fallback { <p>loading…</p> } { <Router /> }
  }
  ```

  The routes are the `.rx` files of `src/routes`, as above, and `host.d.rx` is derived from that directory
  (`rx-declare --host --routes src/routes src/App.rx`). Each request is rendered on the server, streamed, and
  hydrated (`bench/tasks/start-mode`). List `@reactivescript/runtime` in your `package.json` dependencies: Solid's
  plugin finds the packages that run on Solid there, and under the dev server loads them with your app's copy of
  Solid — a runtime Node loads on its own has another, and the first `provide` then says so.

For a host with no tree to read, `rx-declare --host src/pages.rx` (or the route files) drafts what it can: the
imports, the contexts those modules' imports are declared to use, and a view with every component at the top; which
page is in which layout is then yours to write. Either way, run it with `rx-verify --dom src/host.d.rx`: a probe
beside it (`host.probe.mjs`) builds the host's view out of recording components, and each page must render inside
its declared layout, with the router's hook working in each (`uses`). For a derived declaration the probe is handed
the routes — `scene(rx, h, routes)`, each with its path and its recording component, and `act(rx, h, route)` called
for each page — so it makes the router's objects from them and names no route itself:

```js
// src/host.probe.mjs (TanStack Router)
export const scene = (rx, h, routes) => {
  const shown = node => node.children.length ? () => h.s.createComponent(node.component, { get children() { return h.s.createComponent(rx.Outlet, {}); } }) : node.component;
  const make = (node, parent) => {
    const route = parent ? createRoute({ getParentRoute: () => parent, path: node.path, component: shown(node) }) : createRootRoute({ component: shown(node) });
    if (node.children.length) route.addChildren(node.children.map(child => make(child, route)));
    return route;
  };
  router = createRouter({ routeTree: make(routes[0]), history: createMemoryHistory({ initialEntries: ["/"] }) });
  return () => h.s.createComponent(rx.App, { get children() { return h.s.createComponent(rx.AppRouter, {}); } });
};
export const act = (rx, h, route) => router.navigate({ to: route.path.replace(/\$\w+/g, "1") });
```

**What the router renders through** (spec/09 MO-14f). A component renders the records nested in it *among its
children*, and an `.rx` component has two ways to say where those are. One is `{props.children}`. The other is a
component of the router's own that it applies: a TanStack layout's `<Outlet />`, or — when your app's entry is `.rx`
— the router's component itself (`<AppRouter />`, `<Router />`). Those are JavaScript, so `host.d.rx` says which
they are by importing them, and names your entry's component around the rest:

```rx
// src/main.rx — the app's own component: what every page shares, around the router's
import { AppRouter } from "./router.tsx"
import { team } from "./team.rx"
export default component App() {
  provide team = { name: "Directory" }
  <header>Directory</header>
  <AppRouter />
}
```

```rx
// src/pages.rx
export component Root() {
  <nav>…</nav>
  errored fallback(e: NotFound) { <p>{e.message}</p> } { <main><Outlet /></main> }
}
```

```rx
// src/router.d.rx, beside router.tsx: the library's <RouterProvider> with your router — rx-declare ./router.tsx
// drafts both rows (the component renders the provider and nothing else, so it takes its word)
export context router from "@tanstack/solid-router"
export component AppRouter(props: {}) provides(router)
```

```rx
// src/host.d.rx
import { App } from "./main.rx"
import { Root, Home, Person } from "./pages.rx"
import { AppRouter } from "./router.tsx"
import { Outlet } from "@tanstack/solid-router"
export default component nests(children in component) = [
  { component: App, children: [{ component: Root, children: [{ component: Home }, { component: Person }] }] }
]
```

The root layout is checked where `App` applies `<AppRouter />`, the pages where `Root` applies `<Outlet />`: a page
may read the context `App` provides, and its failure needs a region around the outlet (or around the router's
component, in `App`). The router's own context is `AppRouter`'s to provide, by its row — the view has no
`provides(router)` — so a hook in `App` above the router is still `CONTEXT_NOT_FOUND`. With `@solidjs/router`, a
layout takes `props.children` and only the entry needs the import (`import { Router } from "./router.ts"`:
`bench/tasks/file-routes`).

A component the view gives children that renders none — a layout that forgot `{props.children}`, an outlet the
declaration does not import — is `NESTED_NOT_RENDERED`. A component of the router's that another component applies
for the layout (`<Frame />` around the outlet, inside `Root`) is that component's: write `<Frame><Outlet /></Frame>`.
In the probe, give each such component as `through.Outlet` and apply `rx.Outlet` in the scene where your component
applies the real one; `rx-verify` holds that a page renders inside it. And strict mode (`rx-tsc --rx-strict`) asks
for `host.d.rx`'s record as it does for any declaration's.

An `.rx` entry the view does not name credits nothing to a page: its regions and provisions are its own.

### An element in a prop

Solid's JSX puts an element in a prop: `<Show fallback={<p>none</p>}>`, a list's `fallback`, a kit's `icon`. In `.rx`
markup is written in a view, so the element is a component of yours, given to the prop by its name:

```rx
component Nobody() {
  <li>nobody yet</li>
}
<Key each={people} by="id" fallback={Nobody}>{view (person) { <li>{person().name}</li> }}</Key>
<ClientOnly fallback={Measuring}><Chart /></ClientOnly>
```

The declaration says which props take one: a prop typed `View` (`fallback?: View`, `icon?: string | View`), other than
`children`. The component is applied there with no arguments — it is `fallback={<Nobody />}` — so it is checked as the
library's children are: under what the library's component provides, above what it catches. It is given no props (one
it requires is a type error on its name), and it is given by name: `fallback={Nobody()}` and `fallback={ok ? A : B}`
are `COMPONENT_AS_VALUE`. A string is still a view: `fallback="none"`. `rx-declare` drafts such props for you; for a
library whose props are a type of its own, they are in the record after it (`props: ClientOnlyProps & { fallback?:
View }`).

### Render props

A component that calls its children for each thing it renders (a virtual list, a headless table) declares `children`
as a function giving a `View`, and `.rx` passes a view lambda as its only child:

```rx
// virtual.d.rx
export component VirtualList(props: { items: any[]; height?: number; children: (item: any, index: number) => View })
```

```rx
<VirtualList items={rows} height={300}>
  {view (row, i) {
    mark = i == picked ? " ✓" : ""
    <button onClick={() => { picked := i }}>{row}{mark}</button>
  }}
</VirtualList>
```

`row` and `i` are what the component passes on each call. The body is checked as the component's children are: a
failure in it needs an `errored` above `<VirtualList>`, a context it uses a `provide` above it. With the component's
`.d.ts`, `rx-tsc` types `row` from `items`.

### Typed params

A page declares the params it reads as a prop, and the route table names it through the router's `defineRoute`, whose
type gives each route's component the params its path supplies:

```rx
// router.d.rx: the router's own types, and defineRoute's type parameter, as TypeScript text
export type RouteParams<S> = import("@solidjs/router").RouteParams<S>
export type RouteDefinition = import("@solidjs/router").RouteDefinition
export pure fn defineRoute<const S extends string | readonly string[]>(route: { path: S; component?: Component<{ params: RouteParams<S>; children?: View }>; children?: RouteDefinition[] }): RouteDefinition
```

```rx
component Person(props: { params: { id: string } }) {
  person = await fetchPerson(props.params.id)        // id: string, not string | undefined
  …
}
Router = createRouter({ routes: [defineRoute({ path: "/people/:id", component: Person })] })
```

`rx-tsc` reads a JS module's types from its `.d.ts` when it has one (else from its `.d.rx`), so for the router's own
inference put one beside the re-export (`router.d.ts`: `export { createRouter, defineRoute, … } from "@solidjs/router"`).
Then `rx-tsc` refuses
`defineRoute({ path: "/people", component: Person })` on that line: `/people` has no `id`. Write
`defineRoute(…)` inside the `createRouter({ … })` call: bound on its own, it is not part of a route table the checker can
see, so its component is checked under a root of its own (MO-11s), with no `errored`, `loading` or `provide` from above
`<Router />`. (`defineRoute` hands its component on to the router because it is `pure` and makes nothing: what it is
given can only come back in its result, MO-11g.) A child route is typed from its own path, as in TSX — the router's
types do not join it with its parents' — so a page under a parent that has the param declares it optional:
`component Member(props: { params: { id?: string } })`.

### Typed search params

A page can't import `paths` from the module that makes the router (that module imports the page). Put the route
definitions in a module of their own and build the typed paths from them:

```rx
// defs.rx: no pages here
export people = defineRoute({ path: "/people", search: pageSearch })   // pageSearch: `export const` in a .d.rx
export paths = pathsOf([people])                                        // router.js: createRouter({ routes }).paths

// pages.rx
[search, setSearch] = useSearchParams(peek paths.people)                // search.page: number, from the schema

// main.rx
Router = createRouter({ routes: [{ ...(peek people), component: People }] })
```

## Publishing a library written in .rx

A package written in `.rx` is built once and used by `.rx` apps and by JavaScript or TypeScript Solid 2 apps. Nothing
is declared by hand: the package's `.d.rx` is the signature the compiler prints.

```jsonc
// package.json
{
  "name": "@demo/rates",
  "type": "module",
  "files": ["dist"],
  "scripts": { "build": "rx-lib" },
  "reactivescript": { "entries": ["src/index.rx", "src/theme.rx"] },   // each becomes an export: ".", "./theme"
  "peerDependencies": { "solid-js": "^2.0.0", "@solidjs/web": "^2.0.0", "@reactivescript/runtime": "*" }
}
```

`npx rx-lib --write` (from `@reactivescript/compiler`; types need `@reactivescript/language-server`) checks the
package, writes `dist/`, and writes the `exports` map; after that `rx-lib` alone fails if the map and the build
disagree. For each module it writes the browser build and the server build (`index.js`, `index.server.js`, picked by
the `browser` / `node` conditions as Solid's own packages are), `index.d.rx` (first line `//@ signature index.rx`),
`index.rx.d.ts` (types for `.rx` apps) and `index.d.ts` (types for TypeScript).

**From .rx**, import it by name. The app is checked against the shipped `.d.rx` exactly as against a local module:

```rx
import { rate, pick, Badge, Offline } from "@demo/rates"
import { ThemeProvider } from "@demo/rates/theme"
```

`<Badge />` outside `<ThemeProvider>` is `CONTEXT_NOT_FOUND`, `rate` under no `errored` is `UNHANDLED_FAILURE`,
`rate := 2` is `WRITE_TO_NON_SOURCE`, and `pick("USD")` in the view is `ACTION_CALLED_IN_OWNED_SCOPE`. Don't write an
`rx-types/` file for such a package and don't run `rx-declare` on it.

**From .tsx**, it is a Solid library. A source or an equation is an accessor, a `ref` parameter takes an accessor:

```tsx
import { rate, pick, useLabel, Badge } from "@demo/rates";
const label = useLabel(amount);              // amount: Accessor<number>; label: Accessor<string>
<Loading fallback="…"><i>{rate()}</i></Loading>
```

TypeScript checks the types and nothing else: a component outside its provider, a read with no boundary or an action
called during render compile, and fail at run time as with any Solid library. The package's state is one per page, shared with an `.rx` program in the same page. On the server it is per request
inside Solid's request event (a framework's), and per render otherwise: a plain `renderToString(() => <App />)` works,
and two renders never share it. Two renders in one request share the request's state, which is released when the last of them has ended; with an `await`
between two renders and nothing open meanwhile, hold it (`const release = holdRequest()` from `@reactivescript/runtime`, `release()` when the request is answered). Reading an export where nothing renders and no request is answered (a module's top
level, a timer) throws on the server: do it in the render, or inside `provideRequestEvent` from `@solidjs/web/storage`. A package cannot export a server
fn or a context to JavaScript: export a provider component and the components or fns that read it. It needs Solid 2.

Rules: `spec/09-modules.md` MO-10, MO-11 and MO-12 (and MO-8 for declaration files); MO-13 for packages written in `.rx`.
