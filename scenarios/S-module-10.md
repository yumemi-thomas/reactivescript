# S-module-10 — an exported router: a factory's component as a module's export

Rules: MO-11j, MO-11f, MO-3, MO-9, R-f-5, RG-7b, MO-12.

## Modules

```rx
-- module: ./router.d.rx
export type RouteDefinition = { path?: string; component?: Component; children?: RouteDefinition[] }
export context router
export pure fn createRouter(config: { routes: RouteDefinition[] }): Component provides(router) nests(children in component)
export pure fn useParams(): Record<string, string> uses(router)
```

```rx
-- module: ./theme.rx
export context theme: string
```

```rx
-- module: ./pages.rx
import pure { fetch } from "./prelude"
import { useParams } from "./router.js"
import { theme } from "./theme.rx"
export component Home() {
  <h1>Home {use theme}</h1>
}
export component Person() {
  params = useParams()
  person = await fetch(`person:${params.id}`)
  <h1>{person.name}</h1>
}
```

```rx
-- module: ./routes.rx
import { createRouter } from "./router.js"
import { Home, Person } from "./pages.rx"
export Router = createRouter({ routes: [{ path: "/", component: Home }, { path: "/people/:id", component: Person }] })
```

An exported factory's component is summarised as a component whose view
applies it (MO-11j): what its components let out and need from above is its
signature, `export component Router(props: {}) made fails(Error) uses(./theme.rx#theme)
shape(roots h1; closes-p)`. The router's own context is provided inside it
(MO-12c), so it does not escape. An importer applies `<Router />` as any
imported component and checks it against that signature (MO-3).

## Program

```rx
import { Router } from "./routes.rx"
import { theme } from "./theme.rx"

export default component App() {
  provide theme = "dark"
  errored fallback(e) { <p>failed</p> } {
    <Router />
  }
}
```

Accepted: the importer discharges `Person`'s `Error` and provides `theme` to
`Home`, above `<Router />`.

## Rejected variants

```rx
-- reject: UNHANDLED_FAILURE
import { Router } from "./routes.rx"
import { theme } from "./theme.rx"
export default component App() {
  provide theme = "dark"
  <Router />
}
```

`Person`'s failure escapes the exported router's root, so it comes out at
the importer's `<Router />`.

```rx
-- reject: CONTEXT_NOT_FOUND
import { Router } from "./routes.rx"
export default component App() {
  errored fallback(e) { <p>failed</p> } { <Router /> }
}
```

`Home` needs `theme`; the signature carries the need to the importer.
