# S-module-19 — a router's data layer: a query with its rows, a form action, its submissions

Rules: MO-8, MO-8g, MO-12b, MO-10b, R-f-5, R-f-6.

## Modules

```rx
-- module: ./router.d.rx
export context router
export pure fn createRouter(config: { routes: any[] }): Component provides(router) nests(children in component)
// a form action's settled submissions (a result or an error), as values
export pure fn useSubmissions(action: any): { input: any; result?: any; error: any }[] uses(router)
```

```rx
-- module: ./people.d.rx
// the app's data module, made with the router's data layer in JS and declared with its rows: a query is the fn it
// caches, with the same rows; a form action is a value a <form> is bound to
export type Person = { name: string; role: string }
// the fields sent with it (SV-5a): `id`, which every instance has, and `hint`, which one may come without
export error NotFound(id: string, hint?: string)
export pure fn getPerson(id: string): Promise<Person> rejects(NotFound)
export const promoteForm: any
```

```rx
-- module: ./pages.rx
import { useSubmissions } from "./router.js"
import { getPerson, promoteForm, NotFound } from "./people.js"
export component Person(props: { params: { id: string } }) {
  person = await getPerson(props.params.id)
  submissions = useSubmissions(promoteForm)
  last = len(submissions) > 0 ? submissions[len(submissions) - 1] : null
  errored fallback(e: NotFound) { <p class="missing">{e.message}</p> } {
    loading fallback { <p>loading…</p> } {
      <h1>{person.name}</h1>
      <form action={promoteForm} method="post">
        <input type="hidden" name="id" value={props.params.id} />
        <button type="submit">Promote</button> <small>{last != null && last.result != null ? last.result : ""}</small>
      </form>
    }
  }
}
```

`query(fetchPerson, "person")` and `formAction(fn)` wrap JS functions, so
they are made in the app's JS data module, and its `.d.rx` declares what
they are: the query is a fn with the rows of the one it caches (`rejects(NotFound)`,
so a typed `errored` discharges it), the form action a value (MO-8g) that
a `<form action={…}>` is bound to. The router submits the form, revalidates
its queries, and lists the settled submission; `useSubmissions` reads that
list, so it needs the router above it (MO-12b).

## Program

```rx
import { createRouter } from "./router.js"
import { Person } from "./pages.rx"
Router = createRouter({ routes: [{ path: "/people/:id", component: Person }] })
export default component App() {
  <Router />
}
```

Accepted.

## Rejected variants

```rx
-- reject: CONTEXT_NOT_FOUND
import { Person } from "./pages.rx"
export default component App() {
  <Person params={{ id: "1" }} />
}
```

A page that reads the router's submissions, rendered with no router above.

```rx
-- reject: UNHANDLED_FAILURE
import { createRouter } from "./router.js"
import { getPerson } from "./people.js"
component Bare(props: { params: { id: string } }) {
  person = await getPerson(props.params.id)
  loading fallback { <p>loading…</p> } {
    <h1>{person.name}</h1>
  }
}
Router = createRouter({ routes: [{ path: "/people/:id", component: Bare }] })
export default component App() {
  <Router />
}
```

The query keeps the rows of the fn it caches: its `NotFound` must be
discharged.
