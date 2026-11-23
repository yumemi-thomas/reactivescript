# S-module-22 — components a library renders later, beneath a component of its own: `renders(H)`

Rules: MO-11u, MO-11s, MO-8r, MO-9, MO-12, E-10, R-f-5, RG-7b, CN-3d.

## Modules

```rx
-- module: ./tsr.d.rx
// @tanstack/solid-router's code-based routes: a route is a value made of a component, the provider renders them
export context router
export pure fn createRootRoute(options: { component?: Component }): any renders(RouterProvider)
export pure fn createRoute(options: { getParentRoute: () => any; path: string; component: Component }): any renders(RouterProvider)
export pure fn createRouter(options: { routeTree: any }): any instantiates
export component RouterProvider(props: { router: any }) provides(router)
export component Outlet(props: {}) uses(router)
export component Link(props: { to: string; children?: View }) uses(router)
export pure fn useParams(opts: { from: string }): ref any uses(router)
```

```rx
-- module: ./sonner.d.rx
// solid-sonner: toast() is given a message or a component, <Toaster> renders them
export component Toaster(props: {})
export fn toast(message: string | Component): number renders(Toaster)
```

```rx
-- module: ./kobalte.d.rx
// @kobalte/core's toast, behind the app's own `show` (the library's is a method, `toaster.show`)
export context toastRegion
export component Toast(props: { toastId: number; children?: View }) uses(toastRegion)
export component Toast.Title(props: { children?: View })
export component Toast.Region(props: { children?: View }) provides(toastRegion)
export component Toast.List(props: {}) uses(toastRegion)
export fn show(toast: Component<{ toastId: number }>): number renders(Toast.List)
```

```rx
-- module: ./plain.d.rx
// the same toaster with no word: the cautious placement (MO-11s)
export component Toaster(props: {})
export fn toast(message: string | Component): number
```

```rx
-- module: ./old.d.rx
// as the router was declared until 2026-11-23
export context router
export pure fn createRootRoute(options: { component?: Component }): any renders(later)
```

```rx
-- module: ./oldprop.d.rx
export context router
export component RouterProvider(props: { router: renders any }) provides(router)
```

```rx
-- module: ./alone.d.rx
export fn createTable(options: { cell: Component }): any renders
```

```rx
-- module: ./nohost.d.rx
export fn toast(message: string | Component): number renders(Toaster)
```

```rx
-- module: ./people.d.rx
export error NotFound
export pure fn fetchPerson(id: string): Promise<{ name: string }> rejects(NotFound)
```

```rx
-- module: ./theme.rx
export context accent: string
```

```rx
-- module: ./saved.rx
import { toast } from "./sonner.js"
import { accent } from "./theme.rx"
component Saved() {
  <b class={use accent}>saved</b>
}
export action save() {
  toast(Saved)
}
```

```rx
-- module: ./frame.rx
import { Toaster } from "./sonner.js"
import { accent } from "./theme.rx"
export component Frame(props: { children?: View }) {
  provide accent = "dark"
  <main>{props.children}</main>
  <Toaster />
}
export component Bare(props: { children?: View }) {
  <main>{props.children}</main>
  <Toaster />
}
```

Some libraries are given a component in one place and render it in
another, later, any number of times: a toaster's `toast(Saved)` is called
from a handler and `<Toaster>` renders the toast; a router's
`createRoute({ component: Person })` makes a route, and
`<RouterProvider>` renders the page when its path matches. Where the call
is written says nothing of what is above the component when it runs —
what is above the *other* component does. `renders(H)` after a fn's
signature says which: H is a component the same declaration declares, and
every component among the fn's arguments (found as MO-11s finds them:
through its records and arrays) is rendered beneath an application of H.
The word changes nothing else of the row: `toast` writes (it is `fn`, io,
called from a handler), and `createRoute` is a constructor (`pure fn`: a
pure fn that keeps what it is given made something to keep it in, so
`instantiates` is inferred and its result is bound once, E-9).

So each is checked as applied, with no arguments, among H's children, at
**every** place the program applies H: what H `provides`, and the
contexts, `errored` and `loading` regions above that place, are credited
to it; what it lets out of all of them is the program's error, on the
line of the call. Where the program applies H nowhere, nothing renders
the component yet: it is held to what H itself `uses` and `provides`,
under a root of its own (MO-11s). Three libraries of Solid 2 write the
word, by three authors (MO-8r): `@tanstack/solid-router`, `solid-sonner`
and `@kobalte/core`.

## Program

```rx
import { createRootRoute, createRoute, createRouter, RouterProvider, Outlet, Link, useParams } from "./tsr.js"
import { fetchPerson, NotFound } from "./people.js"
component Root() {
  <nav><Link to="/">Home</Link></nav>
  <main><Outlet /></main>
}
component Home() {
  <h1>People</h1>
}
component Person() {
  params = useParams({ from: "/people/$id" })
  person = await fetchPerson(params.id)
  <h1>{person.name}</h1>
}
rootRoute = createRootRoute({ component: Root })
homeRoute = createRoute({ getParentRoute: () => rootRoute, path: "/", component: Home })
personRoute = createRoute({ getParentRoute: () => rootRoute, path: "/people/$id", component: Person })
router = createRouter({ routeTree: peek rootRoute.addChildren([homeRoute, personRoute]) })
export default component App() {
  <header>Directory</header>
  errored fallback(e: NotFound) { <p>{e.message}</p> } {
    loading fallback { <p>loading…</p> } { <RouterProvider router={router} /> }
  }
}
```

Accepted. `Root`'s `<Link>` and `<Outlet>` and `Person`'s `useParams` are
under the provider's `provides(router)`; `Person`'s `NotFound` and its
first load are held by the regions the app wrote around the provider.
The pages are checked flat under the provider: a layout's own regions are
not credited to the pages its outlet renders (below).

## Rejected variants

```rx
-- reject: UNHANDLED_FAILURE
import { createRootRoute, createRoute, createRouter, RouterProvider, useParams } from "./tsr.js"
import { fetchPerson, NotFound } from "./people.js"
component Person() {
  params = useParams({ from: "/people/$id" })
  person = await fetchPerson(params.id)
  <h1>{person.name}</h1>
}
rootRoute = createRootRoute({})
personRoute = createRoute({ getParentRoute: () => rootRoute, path: "/people/$id", component: Person })
router = createRouter({ routeTree: peek rootRoute.addChildren([personRoute]) })
export default component App() {
  loading fallback { <p>loading…</p> } { <RouterProvider router={router} /> }
}
```

A page's failure reaches the provider, and nothing above it holds it. The
error is on the line of `createRoute`, where the page was handed over.

```rx
-- reject: UNHANDLED_FAILURE
import { createRootRoute, createRoute, createRouter, RouterProvider, Outlet, useParams } from "./tsr.js"
import { fetchPerson, NotFound } from "./people.js"
component Root() {
  errored fallback(e: NotFound) { <p>{e.message}</p> } { <main><Outlet /></main> }
}
component Person() {
  params = useParams({ from: "/people/$id" })
  person = await fetchPerson(params.id)
  <h1>{person.name}</h1>
}
rootRoute = createRootRoute({ component: Root })
personRoute = createRoute({ getParentRoute: () => rootRoute, path: "/people/$id", component: Person })
router = createRouter({ routeTree: peek rootRoute.addChildren([personRoute]) })
export default component App() {
  <RouterProvider router={router} />
}
```

The same page under a layout whose own region surrounds its outlet. At
run time that region does hold the page; the word does not say so. It
places every component the fn is given beneath H, side by side, and a
tree's nesting is not its to describe: that stays with a factory's
`nests(children in component)` (MO-11i, S-module-23) and a host
declaration's view (MO-14). The check errs on the strict side: the region
goes above the provider, or the tree to a factory.

```rx
-- reject: CONTEXT_NOT_FOUND
import { Toaster, toast } from "./sonner.js"
context accent: string
component Saved() {
  <b class={use accent}>saved</b>
}
component Editor() {
  provide accent = "dark"
  <button onClick={() => { toast(Saved) }}>save</button>
}
export default component App() {
  <Editor />
  <Toaster />
}
```

The context is provided above the call and not above the toaster, which
is where the toast renders: Solid's `useContext` walks the owners above
`<Toaster>`, and finds none.

```rx
-- reject: CONTEXT_NOT_FOUND
import { Toaster, toast } from "./sonner.js"
context accent: string
component Saved() {
  <b class={use accent}>saved</b>
}
component Themed() {
  provide accent = "dark"
  <Toaster />
}
export default component App() {
  <button onClick={() => { toast(Saved) }}>save</button>
  <Themed />
  <Toaster />
}
```

Two toasters, one with the provision above it and one without: either may
render the toast, so every application of H is held to it.

```rx
-- reject: CONTEXT_NOT_FOUND
import { toast } from "./sonner.js"
context accent: string
component Saved() {
  <b class={use accent}>saved</b>
}
export default component App() {
  provide accent = "dark"
  <button onClick={() => { toast(Saved) }}>save</button>
}
```

No `<Toaster>` anywhere in the program: the toast is held to what
`Toaster` itself uses and provides, which is nothing, under a root of its
own.

```rx
-- reject: CONTEXT_NOT_FOUND
import { Toaster, toast } from "./plain.js"
context accent: string
component Saved() {
  <b class={use accent}>saved</b>
}
export default component App() {
  provide accent = "dark"
  <button onClick={() => { toast(Saved) }}>save</button>
  <Toaster />
}
```

The row without the word: a correct program, refused — the component is
checked under a root of its own, wherever the toaster is (MO-11s). This
is the program the word is for.

```rx
-- reject: CONTEXT_NOT_FOUND
import { Toast } from "./kobalte.js"
export default component App() {
  <Toast toastId={1}><Toast.Title>saved</Toast.Title></Toast>
}
```

A toast written in the view, outside any region: Kobalte throws there.

```rx
-- reject: CONTEXT_NOT_FOUND
import { save } from "./saved.rx"
import { Bare } from "./frame.rx"
export default component App() {
  <Bare><button onClick={() => { save() }}>save</button></Bare>
}
```

The call in one module and the toaster in another: judged at the
program, on the line of the call in `saved.rx`. `Bare` provides nothing
above its toaster.

```rx
-- reject: CONTEXT_NOT_FOUND
import { createRootRoute, createRoute, createRouter, RouterProvider, Outlet } from "./tsr.js"
import { Toaster, toast } from "./sonner.js"
context accent: string
component Saved() {
  <b class={use accent}>saved</b>
}
component Root() {
  <main><Outlet /></main>
  <Toaster />
}
component Home() {
  provide accent = "dark"
  <button onClick={() => { toast(Saved) }}>save</button>
}
rootRoute = createRootRoute({ component: Root })
homeRoute = createRoute({ getParentRoute: () => rootRoute, path: "/", component: Home })
router = createRouter({ routeTree: peek rootRoute.addChildren([homeRoute]) })
export default component App() {
  <RouterProvider router={router} />
}
```

The toaster in the routed layout, and the context provided by the page
that shows the toast: above the call, and not above the toaster. The
layout is itself a component the router renders, so its toaster is
wherever the provider is — and nothing there provides the context.

```rx
-- reject: ASYNC_OUTSIDE_LOADING_BOUNDARY
-- spa
import { createRootRoute, createRoute, createRouter, RouterProvider, useParams } from "./tsr.js"
import { fetchPerson, NotFound } from "./people.js"
component Person() {
  params = useParams({ from: "/people/$id" })
  person = await fetchPerson(params.id)
  <h1>{person.name}</h1>
}
rootRoute = createRootRoute({})
personRoute = createRoute({ getParentRoute: () => rootRoute, path: "/people/$id", component: Person })
router = createRouter({ routeTree: peek rootRoute.addChildren([personRoute]) })
export default component App() {
  errored fallback(e: NotFound) { <p>{e.message}</p> } { <RouterProvider router={router} /> }
}
```

In a client-only build a page that waits needs a `loading` region above
where it renders (CN-3d): above the provider.

```rx
-- reject: PARSE
import { createRootRoute } from "./old.js"
export default component App() {
  <p>{createRootRoute ? "routes" : ""}</p>
}
```

`renders(later)` stays withdrawn, refused by name with what to write
(MO-8r): it named no place.

```rx
-- reject: PARSE
import { RouterProvider } from "./oldprop.js"
export default component App() {
  <RouterProvider />
}
```

So does `renders` before a prop's type,

```rx
-- reject: PARSE
import { createTable } from "./alone.js"
export default component App() {
  <p>{createTable ? "table" : ""}</p>
}
```

and `renders` alone.

```rx
-- reject: PARSE
import { toast } from "./nohost.js"
export default component App() {
  <button onClick={() => { toast("saved") }}>save</button>
}
```

`renders(Toaster)` in a file that declares no component `Toaster`: the
word names a component of the same declaration.

```rx
-- reject: SNAPSHOT_ARGUMENT
import { createRootRoute, createRouter } from "./tsr.js"
rootRoute = createRootRoute({})
router = createRouter({ routeTree: rootRoute.currentTree() })
export default component App() {
  <p>{router ? "made" : ""}</p>
}
```

What a method of a route returns may change after the router is made, so
the argument is a snapshot: `peek rootRoute.currentTree()` if that is
meant (E-10).

## Accepted variants

```rx
-- accept
import { Toaster, toast } from "./sonner.js"
context accent: string
component Saved() {
  <b class={use accent}>saved</b>
}
export default component App() {
  provide accent = "dark"
  <button onClick={() => { toast(Saved) }}>save</button>
  <button onClick={() => { toast("saved") }}>plain</button>
  <Toaster />
}
```

`solid-sonner`: the toast reads a context the app provides above its
`<Toaster>`. A message that is a string is a string.

```rx
-- accept
import { Toast, show } from "./kobalte.js"
context accent: string
component Saved(props: { toastId: number }) {
  <Toast toastId={props.toastId}><Toast.Title><b class={use accent}>saved</b></Toast.Title></Toast>
}
export default component App() {
  provide accent = "dark"
  <button onClick={() => { show(Saved) }}>save</button>
  <Toast.Region><Toast.List /></Toast.Region>
}
```

Kobalte: the toast's `<Toast>` uses the region's context, which
`Toast.List` uses itself — so it is above everything the list renders —
and the app's context is above the region.

```rx
-- accept
import { Toast, show } from "./kobalte.js"
component Saved(props: { toastId: number }) {
  <Toast toastId={props.toastId}><Toast.Title>saved</Toast.Title></Toast>
}
export default component App() {
  <button onClick={() => { show(Saved) }}>save</button>
}
```

No list in the program yet: the toast is still credited with what
`Toast.List` uses, the region's context.

```rx
-- accept
import { save } from "./saved.rx"
import { Frame } from "./frame.rx"
export default component App() {
  <Frame><button onClick={() => { save() }}>save</button></Frame>
}
```

Across modules: `saved.rx`'s signature carries the requirement
(`export renders ./sonner.d.rx#Toaster from toast:7 uses(./theme.rx#accent)`)
and `Frame`'s what is above its toaster (`hosts(./sonner.d.rx#Toaster
provides(./theme.rx#accent))`), so a module read by its signature (MO-9)
is judged as its source is.

```rx
-- accept
import { createRootRoute, createRoute, createRouter, RouterProvider, Outlet } from "./tsr.js"
import { Toaster, toast } from "./sonner.js"
context accent: string
component Saved() {
  <b class={use accent}>saved</b>
}
component Root() {
  <main><Outlet /></main>
  <Toaster />
}
component Home() {
  <button onClick={() => { toast(Saved) }}>save</button>
}
rootRoute = createRootRoute({ component: Root })
homeRoute = createRoute({ getParentRoute: () => rootRoute, path: "/", component: Home })
router = createRouter({ routeTree: peek rootRoute.addChildren([homeRoute]) })
export default component App() {
  provide accent = "dark"
  <RouterProvider router={router} />
}
```

A host inside a hosted component: the app's `<Toaster />` is in the
routed layout, which the provider renders. The toaster's place is then
the provider's: what is above `<RouterProvider>` is above the layout, so
it is above the toaster, and the toast reads the app's context. A call's
row carries the places its components apply a host themselves
(`export renders ./tsr.d.rx#RouterProvider from createRootRoute:… hosts(./sonner.d.rx#Toaster provides(./tsr.d.rx#router))`),
and the program's judgment composes them with each place of their own
host.

```rx
-- accept
import { createRootRoute, createRouter } from "./tsr.js"
rootRoute = createRootRoute({})
router = createRouter({ routeTree: rootRoute })
tree = createRouter({ routeTree: peek rootRoute.addChildren([]) })
export default component App() {
  <p>{router ? "made" : ""}{tree ? "" : "none"}</p>
}
```

The library's values, with no component in them, are values like any
other. A route never changes, so reading it in another call's arguments
(`createRouter({ routeTree: rootRoute })`) needs no `peek` (E-10). A
method called on it is another matter: a stable receiver says nothing of
what a method gives back. `addChildren` makes its tree once, and the
program says so where it passes it.
