# S-module-8 — typed route params: `defineRoute` inside a route table, and a page that declares its params

Rules: MO-11g, MO-11s, MO-8d, MO-11c, MO-11f, MO-11i, TY-1c.

## Modules

```rx
-- module: ./router.d.rx
// A router's route helper, with its TypeScript: `defineRoute` types a route's component from its path. (The real
// @solidjs/router's RouteParams reads every `:name`; this one reads `:id`, enough for the scenario.)
export type RouteParams<S> = S extends readonly (infer P)[] ? RouteParams<P> : S extends `${string}:id${string}` ? { id: string } : {}
export type RouteDefinition = { path?: string | readonly string[]; component?: Component; children?: RouteDefinition[] }
export pure fn createRouter(config: { routes: RouteDefinition[] }): Component nests(children in component)
export pure fn defineRoute<const S extends string | readonly string[]>(route: { path: S; component?: Component<{ params: RouteParams<S>; children?: View }>; children?: RouteDefinition[] }): RouteDefinition
// a helper that is not `pure`: it may render or keep the component it is given itself
export fn logged(route: any): any
```

```rx
-- module: ./pages.rx
import pure { fetch } from "./prelude"
export component Profile(props: { params: { id: string } }) {
  bio = await fetch(`bio:${props.params.id}`)
  <p>{bio}</p>
}
export component Home() {
  <h1>Home</h1>
}
export component Person(props: { params: { id: string } }) {
  <h1>{props.params.id}</h1>
}
// a page under a parent that has the param: the router types a child from its own path alone, so it is optional here
export component Member(props: { params: { id?: string } }) {
  <h1>{props.params.id ?? "?"}</h1>
}
export component Shell(props: { children?: View }) {
  <main>{props.children}</main>
}
```

A page says which params it needs as a prop, `params`, the way any
component declares its props. The route table names it inside
`defineRoute({ … })`: a call of a `pure` JS fn among a factory's argument
literals hands what it is given on to the factory (MO-11g: a `pure` fn that
makes nothing keeps nothing, and what it is given comes back only in its
result), so `Person` is a component value there, checked as applied
beneath `<Router />` (MO-11c). Whether its path supplies `id` is a type
question: `defineRoute`'s type parameter (MO-8d) carries the path's
literal type into the component's props, and the projection hands
TypeScript the route table as written (TY-1c).

A nested route's params include its parents' at run time (`/people/:id`
above `/` gives the child `id`), and the router's types do not say so: a
child is typed from its own path. That is the router's limit, in TSX as
here, and the language does not paper over it (a declaration could once
say `joins(path)`, and the projection then wrote each nested literal path
joined with its parents'; it was one router's rule, 08 CN-8c): a page
under a parent that has the param declares it optional (MO-11h).

## Program

```rx
import { createRouter, defineRoute } from "./router.js"
import { Home, Person, Member, Shell } from "./pages.rx"

Router = createRouter({ routes: [
  defineRoute({ path: "/", component: Home }),
  defineRoute({ path: "/people/:id", component: Person }),
  defineRoute({ path: "/team/:id", component: Shell, children: [defineRoute({ path: "/", component: Member })] }),
  defineRoute({ path: ["/crew/:id", "/staff/:id"], component: Shell, children: [defineRoute({ path: "/", component: Member })] })
] })

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
-- types: TS2322
import { createRouter, defineRoute } from "./router.js"
import { Person, Shell } from "./pages.rx"
Router = createRouter({ routes: [defineRoute({ path: "/team/:id", component: Shell, children: [defineRoute({ path: "/", component: Person })] })] })
export default component App() {
  <Router />
}
```

A child is typed from its own path: `/` supplies no `id`, though the
parent's does. `Member`, which declares it optional, is what the program
uses there.

```rx
-- reject: UNHANDLED_FAILURE
import { createRouter, defineRoute } from "./router.js"
import { Profile } from "./pages.rx"
route = defineRoute({ path: "/people/:id", component: Profile })
Router = createRouter({ routes: [route] })
export default component App() {
  errored fallback(e) { <p>failed</p> } {
    loading fallback { <p>…</p> } { <Router /> }
  }
}
```

A `pure` JS call hands components on to a factory only inside its arguments: bound
on its own, `defineRoute(…)` is not part of any route table the checker can
see (MO-11g). It says nothing of where it renders `Profile`, so `Profile`
is checked under a root of its own (MO-11s): the `errored` above
`<Router />` is not credited, and its fetch's failure escapes. Written
inside `createRouter({ routes: [defineRoute(…)] })`, it is discharged.

```rx
-- reject: UNHANDLED_FAILURE
import { createRouter, logged } from "./router.js"
import { Profile } from "./pages.rx"
Router = createRouter({ routes: [logged({ path: "/people/:id", component: Profile })] })
export default component App() {
  errored fallback(e) { <p>failed</p> } {
    loading fallback { <p>…</p> } { <Router /> }
  }
}
```

Only a call of a `pure` JS fn hands the components in its arguments on to
the factory (MO-11g): `defineRoute` is one, `logged` is io, so it may keep
or render `Profile` itself (and is `IO_IN_REACTIVE` where it is written). `Profile` is then checked under a root of its
own (MO-11s), and the `errored` above `<Router />` is not credited.
