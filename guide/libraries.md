# Using Solid libraries from .rx

A Solid library (solid-primitives, a design system's hooks, your own `create*` helpers) is plain JavaScript. To use
one from .rx, declare what it exports once, in a `.d.rx` file, and then use it like .rx. The declaration is checked
at every use; the JavaScript itself is not checked (it's the library's).

## Declare it

To start from a draft, run `npx rx-declare <package> --out <name>.d.rx` (the language server's package): it writes
what the package's TypeScript types show and leaves a `// TODO` line for each row only you can decide. For the routers
(`@tanstack/solid-router`, `@solidjs/router`) and TanStack Query it also writes the rows types cannot show.

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
  `rx-types/@kobalte/core/dialog.d.rx`). `npx rx-declare @solid-primitives/media --out rx-types/@solid-primitives/media.d.rx`
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
`--run` also runs the package to find which hooks need a provider (it executes the package's code).
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

A result that is a store whose field waits or throws when read (a query's `data`) says so on that field:
`export pure fn useQuery(ref options: { … }): { data: pending fails(Error) any; isFetching: boolean }`. A read of
`todos.data` then needs an `errored` (or a `catch`) above it, and in a client-only build a `loading`, like an `await`.
Such a result is read a field at a time: pass `todos.data` to a component, and the field carries what it needs to
where it is read. To pass the whole result, the component says so in its prop's type, with the same words on the
fields: `component Panel(props: { query: { data: pending fails(Error) Todo[]; status: string } })`. Then
`<Panel query={todos} />` is accepted, and `props.query.data` in `Panel` is checked as `todos.data` is. Given to a
prop typed any other way, the whole result is `RESULT_AS_VALUE`: on the other side it would be a plain value. What
is read from the result is a field its declaration names: `todos.valueOf()` and a field the `.d.rx` leaves out are
refused too (declare the field).

`isOn`, `query` and `wide` are equations like any other: read them without calling them. They may hold, like a
value from an `await` (Solid promises nothing about an accessor), so `latest`, `pending?` and `loading` apply.

What the compiler catches:

| you write | you get |
| --- | --- |
| `createToggle(props.start)` | `SNAPSHOT_ARGUMENT`: a value argument is read once; write `peek props.start`, or the library should take `ref` |
| `x = setOn(true)` | `IO_IN_REACTIVE`: a setter is called from an action or handler |
| `<p>{createMediaQuery(q)}</p>` | `INSTANTIATION_NOT_BOUND`: bind it, `wide = createMediaQuery(q)` |
| `<List query={todos} />` for a result with a `pending` or `fails` field | `RESULT_AS_VALUE`: pass the field, `items={todos.data}`, or type the prop with the fields' rows |
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
- **A function the library calls inside its own computation is `tracked`.** TanStack Query runs `queryFn` while it
  computes `data`, so `queryFn: tracked () => Promise<any>`: a closure there is a pure one, as anywhere in reactive
  scope (no writes; its reads are tracked by the library). `rx-verify` tells the three apart by running: a `handler`
  called inside a computation is a mismatch, and it reports which unmarked functions could be either word.
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
  { id: string }[] } } renders`. A part declared a primitive (`table.getPageCount()`, a row's `id`) can be passed to
  a child or a callback as it is; a method declared to answer nothing (`nextPage`) is called from a handler; the
  rest stays in the view the value is bound in (`RENDERS_ESCAPES`). `rx-tsc` checks the declared type against the
  library's own.
- **A store has one identity.** An `.rx` source of records is a Solid store: a write changes what it holds, not which
  object it is. A library that sees a change by identity (TanStack Table's `data`) is given a fresh list,
  `data: [...rows]`.
- **Without a declaration,** an import is io unless you import it `pure`, and `import pure` of a primitive is
  unchecked: the call is then an equation, re-run (and the primitive rebuilt) whenever an argument changes. Declare
  primitives instead.

## Components and routers

A Solid component from JS is declared the same way, with its props as TypeScript types. A function that hands back a
component (a router's `createRouter`) is declared with `Component` as its result:

```rx
// router.d.rx, beside router.js: export { createRouter, useParams, useNavigate } from "@solidjs/router"
export type RouteDefinition = { path?: string; component?: Component; children?: RouteDefinition[] }
export context router
export pure fn createRouter(config: { routes: RouteDefinition[] }): Component provides(router) nests(children in component) joins(path)
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
  component's prop typed `Component` (`<Shell header={Title} />`). Given to any other JS call, it is checked under a root
  of its own, with nothing above the call credited (MO-11s); applied nowhere else, it is `COMPONENT_AS_VALUE`.
- **Each component you hand over is checked as if it were applied there:** its failures need an `errored` above
  `<Router />` (or inside the page), the contexts it uses need a `provide` above `<Router />`, and in a client-only
  app its first load needs a `loading` above it.
- **Layouts count for their nested routes** when the factory is declared `nests(children in component)`: a route
  under a record's `children` is checked inside that record's `component`, so an `errored` or `provide` the layout
  puts above `props.children` covers it. Without the word, put them above `<Router />`.
- **A router can live in its own module.** `export Router = createRouter(…)` exports it; whoever applies `<Router />`
  gets its pages' needs through its signature, so the `errored` or `provide` they need goes above `<Router />` there.
- **A provider can be wrapped.** With a router that travels in a value (TanStack's `<RouterProvider router={…} />`),
  the app's own frame can take the router as a prop and give it on: `component Shell(props: { router: AnyRouter })
  { <header>…</header> <RouterProvider router={props.router} /> }`. The pages are checked where `Shell` is applied,
  under what `Shell` puts around the provider; pass the prop on as it is (`props.router`).
- **Say which context a hook needs.** `export context router` names the library's context; `uses(router)` on a hook
  makes a call with no router above it `CONTEXT_NOT_FOUND`, instead of a run-time throw, and `provides(router)` on
  `createRouter` (or on a provider component) says where it comes from. A hook that uses a context is called once, where
  it is bound, so `instantiates` is implied.
- **A JS import you apply must be declared.** Without `export component X(…)` in its `.d.rx`, `<X />` is
  `UNKNOWN_COMPONENT`.

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
export pure fn defineRoute<const S extends string | readonly string[]>(route: { path: S; component?: Component<{ params: RouteParams<S>; children?: View }>; children?: RouteDefinition[] }): RouteDefinition forwards
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
`<Router />`. Under a router declared `nests(…)` (MO-11i), a child route is typed from its whole path, its parents' joined
in front, so it sees their params.

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

Rules: `spec/09-modules.md` MO-10, MO-11 and MO-12 (and MO-8 for declaration files).
