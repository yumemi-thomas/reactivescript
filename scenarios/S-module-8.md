# S-module-8 — typed route params: `defineRoute` inside a route table, and a page that declares its params

Rules: MO-11g, MO-8d, MO-11c, MO-11f, TY-1c.

## Modules

```rx
-- module: ./router.d.rx
// A router's route helper, with its TypeScript: `defineRoute` types a route's component from its path. (The real
// @solidjs/router's RouteParams reads every `:name`; this one reads `:id`, enough for the scenario.)
export type RouteParams<S> = S extends `${string}:id${string}` ? { id: string } : {}
export type RouteDefinition = { path?: string | readonly string[]; component?: Component; children?: RouteDefinition[] }
export pure fn createRouter(config: { routes: RouteDefinition[] }): Component
export pure fn defineRoute<const S extends string>(route: { path: S; component?: Component<{ params: RouteParams<S>; children?: View }>; children?: RouteDefinition[] }): RouteDefinition
```

```rx
-- module: ./pages.rx
export component Home() {
  <h1>Home</h1>
}
export component Person(props: { params: { id: string } }) {
  <h1>{props.params.id}</h1>
}
```

A page says which params it needs as a prop, `params`, the way any
component declares its props. The route table names it inside
`defineRoute({ … })`: a JS call among a factory's argument literals hands
what it is given on to the factory (MO-11g), so `Person` is a component
value there, checked as applied beneath `<Router />` (MO-11c). Whether its
path supplies `id` is a type question: `defineRoute`'s type parameter
(MO-8d) carries the path's literal type into the component's props, and the
projection hands TypeScript the route table as written (TY-1c).

## Program

```rx
import { createRouter, defineRoute } from "./router.js"
import { Home, Person } from "./pages.rx"

Router = createRouter({ routes: [defineRoute({ path: "/", component: Home }), defineRoute({ path: "/people/:id", component: Person })] })

export default component App() {
  <Router />
}
```

Accepted by the checker and by TypeScript: `/people/:id` supplies `id`.

## Rejected variants

```rx
-- types: TS2322
import { createRouter, defineRoute } from "./router.js"
import { Person } from "./pages.rx"
Router = createRouter({ routes: [defineRoute({ path: "/people", component: Person })] })
export default component App() {
  <Router />
}
```

`/people` supplies no `id`, and `Person` needs one: refused by TypeScript
on the route, where the table is written.

```rx
-- reject: COMPONENT_AS_VALUE
import { createRouter, defineRoute } from "./router.js"
import { Person } from "./pages.rx"
route = defineRoute({ path: "/people/:id", component: Person })
Router = createRouter({ routes: [route] })
export default component App() {
  <Router />
}
```

A JS call hands components on only inside a factory's arguments: bound on
its own, `defineRoute(…)` is not part of any route table the checker can
see (MO-11g).
