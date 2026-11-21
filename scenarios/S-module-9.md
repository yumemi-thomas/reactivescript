# S-module-9 — layout routes: what a factory nests, and what a layout's boundaries and provisions reach

Rules: MO-11i, MO-11f, MO-11g, DV-24, RG-7b, R-f-5, SV-7d.

## Modules

```rx
-- module: ./router.d.rx
// `nests(children in component)`: in a route record, the routes under `children` render inside that record's `component`
export type RouteDefinition = { path?: string; component?: Component; children?: RouteDefinition[] }
export pure fn createRouter(config: { routes: RouteDefinition[] }): Component nests(children in component)
export pure fn defineRoute(route: RouteDefinition): RouteDefinition forwards
```

```rx
-- module: ./theme.rx
export context theme: string
export component Swatch() {
  <i>{use theme}</i>
}
```

```rx
-- module: ./bad.d.rx
// nests(…) on a fn that hands back no component
export pure fn table(config: { routes: any[] }): string nests(children in component)
```

Without `nests(…)` a factory's components are all checked as children of
its application (DV-24), so a layout's `provide` or `errored` is credited to
none of its routes. With it, a record whose `component` is a component value
applies that component, and the entries under its `children` are applied
among that component's children, as `<Layout><Swatch /></Layout>` would be.
That is how `@solidjs/router` renders a nested route: inside its parent's
`props.children`.

## Program

```rx
import pure { fetch } from "./prelude"
import { createRouter, defineRoute } from "./router.js"
import { theme, Swatch } from "./theme.rx"

component Layout(props) {
  provide theme = "dark"
  errored fallback(e) { <p>failed</p> } {
    <main>{props.children}</main>
  }
}
component Page() {
  name = await fetch("name")
  <h1>{name}</h1>
}
Router = createRouter({ routes: [
  { path: "/", component: Layout, children: [{ path: "/", component: Swatch }, defineRoute({ path: "/page", component: Page })] }
] })

export default component App() {
  loading fallback { <p>loading…</p> } {
    <Router />
  }
}
```

Accepted. `Swatch` finds the `theme` that `Layout` provides, and `Page`'s
`Error` is discharged by `Layout`'s `errored`: both are applied among
`Layout`'s children (MO-11i), through `defineRoute` too (MO-11g).

## Rejected variants

```rx
-- reject: CONTEXT_NOT_FOUND
import { createRouter } from "./router.js"
import { theme, Swatch } from "./theme.rx"
component Layout(props) {
  provide theme = "dark"
  <main>{props.children}</main>
}
Router = createRouter({ routes: [{ path: "/", component: Layout }, { path: "/swatch", component: Swatch }] })
export default component App() {
  <Router />
}
```

A sibling route is not nested in the layout: `Swatch` renders beside it,
where no `theme` is provided.

```rx
-- reject: UNHANDLED_FAILURE
import pure { fetch } from "./prelude"
import { createRouter } from "./router.js"
component Layout(props) {
  <main>{props.children}</main>
  errored fallback(e) { <p>failed</p> } { <aside>side</aside> }
}
component Page() {
  name = await fetch("name")
  <h1>{name}</h1>
}
Router = createRouter({ routes: [{ path: "/", component: Layout, children: [{ path: "/", component: Page }] }] })
export default component App() {
  <Router />
}
```

A boundary in the layout counts only where it is above `props.children`.

```rx
-- reject: CONTENT_MODEL
import { createRouter } from "./router.js"
component Layout(props) {
  <p>{props.children}</p>
}
component Page() {
  <div>page</div>
}
Router = createRouter({ routes: [{ path: "/", component: Layout, children: [{ path: "/", component: Page }] }] })
export default component App() {
  <Router />
}
```

A nested route's content is checked where the layout places it: `Page`'s
`<div>` inside `Layout`'s `<p>` (SV-7d).

```rx
-- reject: PARSE
import { table } from "./bad.js"
export default component App() {
  t = table({ routes: [] })
  <p>{t}</p>
}
```

Only a fn that hands back a `Component` renders what it is given, so only
it nests (MO-11i).
