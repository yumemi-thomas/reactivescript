# S-module-37 — a host declaration: where a file-based router renders the route files

Rules: MO-14, MO-11f, MO-11i, MO-12c, CP-4d, R-f-5, CN-3d, RG-7b.

## Modules

```rx
-- module: ./router.d.rx
// a router in rows: its context, and a hook that reads it
export context router
export pure fn useParams(): { id: string } instantiates uses(router)
```

```rx
-- module: ./people.d.rx
export error NotFound
export pure fn fetchPerson(id: string): Promise<{ name: string }> rejects(NotFound)
```

```rx
-- module: ./pages.rx
// two route files' pages: neither has a region of its own, nor a router above it in `.rx`
import { useParams } from "./router.js"
import { fetchPerson } from "./people.js"
export component Home() {
  <h1>People</h1>
}
export component Person() {
  params = useParams()
  person = await fetchPerson(params.id)
  <h1>{person.name}</h1>
}
```

```rx
-- module: ./host.d.rx
// what the file router does with them: every one under its provider, the pages among the layout's children
import { Layout } from "./main.rx"
import { Home, Person } from "./pages.rx"
export context router from "./router.js"
export default component provides(router) nests(children in component) = {
  component: Layout,
  children: [{ component: Home }, { component: Person }]
}
```

A file-based router finds its route files itself: JavaScript — a generated
route tree, a manifest — imports each one's component and renders it under
the router's provider, inside the layout its file name puts it in. No
`.rx` module applies the pages, so no `.rx` module can show the checker
what is above them (11 CP-4d: a component JS renders is checked under a
root of its own). A host declaration says it: `host.d.rx`, found in a
program's folder or one above it, imports the components the host renders
as an `.rx` module would, and states the view the host makes of them in
the words a factory's row has (MO-11f) — the contexts it provides to all
of them (`provides`, MO-12c) and how a record's `children` nest in its
`component` (`nests`, MO-11i). The checker walks that view as the app's:
a page is checked among its layout's children, under the router. What it
finds is the declaration's, on the line of its view.

## Program

```rx
import { NotFound } from "./people.js"
export component Layout(props: { children?: View }) {
  <nav><a href="/">Home</a></nav>
  errored fallback(e: NotFound) { <p class="missing">{e.message}</p> } {
    loading fallback { <p>loading…</p> } { <main>{props.children}</main> }
  }
}
```

Accepted: `Person` waits and can fail with `NotFound`, and reads the
router; the layout's regions hold the first two, the host's provider the
third.

## Rejected variants

```rx
-- reject: UNHANDLED_FAILURE
import { NotFound } from "./people.js"
export component Layout(props: { children?: View }) {
  <nav><a href="/">Home</a></nav>
  loading fallback { <p>loading…</p> } { <main>{props.children}</main> }
}
```

The layout no longer discharges `NotFound`, and nothing above the layout
does: the page's reader is refused, in the host's view.

```rx
-- reject: ASYNC_OUTSIDE_LOADING_BOUNDARY
-- spa
import { NotFound } from "./people.js"
export component Layout(props: { children?: View }) {
  errored fallback(e: NotFound) { <p class="missing">{e.message}</p> } {
    <main>{props.children}</main>
  }
}
```

In a client-only build the page's first load needs a `loading` region,
and the layout was the one that had it.

```rx
-- reject: UNHANDLED_FAILURE
import { NotFound } from "./people.js"
export component Layout(props: { children?: View }) {
  errored fallback(e: NotFound) { <p class="missing">{e.message}</p> } {
    loading fallback { <p>loading…</p> } { <nav><a href="/">Home</a></nav> }
  }
  <main>{props.children}</main>
}
```

The regions are the layout's, and its pages are rendered where it puts its
`children`: beside the regions, they are held by neither.

What the declaration credits is what the host renders, where it says it
renders it: a page it places beside the layout, a host that provides no
router, a component it imports and leaves out of its tree are each refused
(`ref/units.ts` and the crate's `modules.rs`,
`a_host_declaration_places_the_components_a_js_host_renders`).
