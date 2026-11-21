# S-module-17 — typed search params in a page: route definitions in a module of their own

Rules: MO-8g, MO-11m, MO-5, MO-12b, E-10.

## Modules

```rx
-- module: ./router.d.rx
export context router
export pure fn createRouter(config: { routes: any[] }): Component & { paths: any } provides(router) nests(children in component)
export pure fn defineRoute(route: any): any forwards
export pure fn pathsOf(routes: any[]): any
export pure fn useSearchParams(path?: any): [any, (params: any) => void] uses(router)
```

```rx
-- module: ./schema.d.rx
// a value the module exports: a Standard Schema validator for ?page=
export const pageSearch: any
```

```rx
-- module: ./defs.rx
// the route tree's paths and search schemas, without its pages
import { defineRoute, pathsOf } from "./router.js"
import { pageSearch } from "./schema.js"
export people = defineRoute({ path: "/people", search: pageSearch })
export paths = pathsOf([people])
```

```rx
-- module: ./pages.rx
import { useSearchParams } from "./router.js"
import { paths } from "./defs.rx"
export component People() {
  [search, setSearch] = useSearchParams(peek paths.people)
  next = search.page + 1
  <p>page {search.page}</p>
  <button onClick={() => { setSearch({ page: `${next}` }) }}>next</button>
}
```

A page types its search params through the router's typed path
(`useSearchParams(paths.people)`), but `paths` comes from the router, and the
module that makes the router imports the pages: a page importing it would be
a cycle (MO-5). The route tree's definitions (paths, search schemas) go in a
module of their own, `defs.rx`, which imports no page; `pathsOf(defs)` builds
the typed path builder from them (`createRouter({ routes }).paths`, typed
`RouterInstance<R>["paths"]` in its `.d.ts`), and the routing module adds the
components to the same definitions. A schema is a value its module exports:
`export const pageSearch: …` (MO-8g). With the router's own `.d.ts`,
`rx-tsc` types `search.page` as the schema's output, a `number`.

## Program

```rx
import { createRouter } from "./router.js"
import { people } from "./defs.rx"
import { People } from "./pages.rx"
Router = createRouter({ routes: [{ ...(peek people), component: People }] })
export default component App() {
  <Router />
}
```

Accepted. `peek` reads the definitions once: they are equations, and the
call is an instantiation, which reads its arguments once (E-10).

## Rejected variants

```rx
-- reject: SNAPSHOT_ARGUMENT
import { createRouter } from "./router.js"
import { people } from "./defs.rx"
import { People } from "./pages.rx"
Router = createRouter({ routes: [{ ...people, component: People }] })
export default component App() {
  <Router />
}
```

Without `peek`, a later change of `people` would be missed: E-10 says so.

```rx
-- reject: NOT_EXPORTED
import { pageSchema } from "./schema.js"
export default component App() {
  <p>{pageSchema}</p>
}
```

A declared value is the name the declaration gives.
