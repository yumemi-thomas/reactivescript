# S-module-7 — a JS context: hooks that need the router, and the router that provides it

Rules: MO-12a, MO-12b, MO-12c, MO-11f, RG-7b, MO-3.

## Modules

```json
-- module: ./node_modules/@solidjs/router/package.json
{ "name": "@solidjs/router", "types": "./dist/index.d.ts", "exports": { ".": { "solid": "./dist/index.jsx", "default": "./dist/index.js" } } }
```

```rx
-- module: ./node_modules/@solidjs/router/dist/index.d.rx
// the router's context, named once; the hooks read it, the router's component provides it to its routes
export type Params = Record<string, string>
export type RouteDefinition = { path?: string; component?: any; children?: RouteDefinition[] }
export context router
export pure fn createRouter(config: { routes: RouteDefinition[] }): Component provides(router)
export pure fn useParams(): Params uses(router)
export pure fn useNavigate(): (to: string) => void uses(router)   // a comment's words are not rows: uses(other) here reads nothing
export component Outlet(props: {}) uses(router)
export component RouterProvider(props: { children?: View }) provides(router)
```

```rx
-- module: ./pages.rx
import { useParams } from "@solidjs/router"
export component Person() {
  params = useParams()
  <h1>{params.id}</h1>
}
```

```rx
-- module: ./hooks.d.rx
// names a context it does not declare
export pure fn useLocation(): { pathname: string } uses(router)
```

```rx
-- module: ./bad.d.rx
// provides a context from a fn that hands back no component
export context c
export pure fn make(): string provides(c)
```

`uses(router)` makes a hook's call a read of the router's context, checked
like `use` (RG-7b): some provision of it must be above the call on every
path that renders it. `provides(router)` on a factory says the component it
hands back provides it to what it renders, which is every component in its
arguments (MO-11f). `Person`'s signature carries the need across the module
boundary: `uses(./node_modules/@solidjs/router/dist/index.d.rx#router)`.

## Program

```rx
import { createRouter, useNavigate, useParams, RouterProvider } from "@solidjs/router"
import { Person } from "./pages.rx"

component Home() {
  navigate = useNavigate()
  action meetBo() { navigate("/people/2") }
  <button onClick={meetBo}>Bo</button>
}
Router = createRouter({ routes: [{ path: "/", component: Home }, { path: "/people/:id", component: Person }] })
component Page() {
  params = useParams()
  <p>{params.id}</p>
}

export default component App() {
  <Router />
  <RouterProvider><Page /></RouterProvider>
}
```

Accepted. `Home` and `Person` are checked as applied among the children of
`<Router />` (MO-11f), whose component provides `router` (MO-12c), so both
hooks find it. `Person`'s need comes from its signature (MO-3). A declared
JS component that provides the context provides it to its children, so
`Page` finds it under `<RouterProvider>`.

## Rejected variants

```rx
-- reject: CONTEXT_NOT_FOUND
import { useParams } from "@solidjs/router"
component Stray() {
  params = useParams()
  <p>{params.id}</p>
}
export default component App() {
  <Stray />
}
```

A hook called where no router is above: Solid would throw at run time when
`useContext` finds none (MO-12b).

```rx
-- reject: CONTEXT_NOT_FOUND
import { Person } from "./pages.rx"
export default component App() {
  <Person />
}
```

The need crosses modules: `Person` uses the router, from its signature.

```rx
-- reject: CONTEXT_NOT_FOUND
import { Outlet } from "@solidjs/router"
export default component App() {
  <Outlet />
}
```

A declared JS component may use a JS context itself (MO-12b).

```rx
-- reject: NOT_EXPORTED
import { useLocation } from "./hooks.js"
export default component App() {
  loc = useLocation()
  <p>{loc.pathname}</p>
}
```

A context a declaration names must be declared in the same file
(`export context router`, MO-12a).

```rx
-- reject: PARSE
import { make } from "./bad.js"
export default component App() {
  x = make()
  <p>{x}</p>
}
```

Only a fn that hands back a `Component` provides a context: what it
provides it to is what that component renders (MO-12c).
