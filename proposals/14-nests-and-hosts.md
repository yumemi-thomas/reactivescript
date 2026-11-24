# 14 — A router renders pages under layouts: `nests`, and a host declaration

Needs [12](12-context-rows.md) and [13](13-factories.md).

## Problem

A router renders a page under its layout, so the layout's regions are above the page. With the cautious rule each page needs regions of its own. That is correct, and is what upstream asks.

<!-- check branch=ok upstream=COMPONENT_AS_VALUE+UNKNOWN_COMPONENT -->
```rx
import { createRouter } from "./router.js"
import { loadPerson } from "./people.js"
component Layout(props) {
  <main>{errored fallback(e) { <p>failed</p> } { loading fallback { <p>loading</p> } { <div>{props.children}</div> } }}</main>
}
component Person() { p = await loadPerson("a")
  <h1>{p}</h1> }
Router = createRouter({ routes: [{ path: "/", component: Layout, children: [{ path: "/a", component: Person }] }] })
export default component App() { <Router /> }
-- file: ./router.d.rx
export type Route = { path: string; component: Component; children?: Route[] }
export pure fn createRouter(config: { routes: Route[] }): Component nests(children in component)
-- file: ./people.d.rx
export pure fn loadPerson(id: string): Promise<string>
```

## Step 1: an app's TSX route bridge

A route file in TSX that hands over an `.rx` component needs nothing of this file. It needs a way for JavaScript to import an `.rx` component (`?rx-page`, 11 CP-4d: a proposed id), which is part of [17](17-packages.md). Establish that
contract first.

## Step 2: `nests(children in component)` on a factory

A record's `component` renders the entries under its `children` among its own children. A layout that renders no children is refused:

<!-- check branch=NESTED_NOT_RENDERED upstream=COMPONENT_AS_VALUE+UNKNOWN_COMPONENT -->
```rx
import { createRouter } from "./router.js"
component Layout() { <main>hi</main> }
component Person() { <h1>p</h1> }
Router = createRouter({ routes: [{ path: "/", component: Layout, children: [{ path: "/a", component: Person }] }] })
export default component App() { <Router /> }
-- file: ./router.d.rx
export type Route = { path: string; component: Component; children?: Route[] }
export pure fn createRouter(config: { routes: Route[] }): Component nests(children in component)
```

## Step 3: a host declaration

For a router that finds its own files, `host.d.rx` says the same of the host:

<!-- check branch=ok upstream=UNHANDLED_FAILURE main=page.rx flags=--whole-program,--host,page.rx -->
```rx
export component Layout(props) {
  <main>{errored fallback(e) { <p>failed</p> } { loading fallback { <p>loading</p> } { <div>{props.children}</div> } }}</main>
}
export default component App() { <p>a</p> }
-- file: ./page.rx
import { loadPerson } from "./people.js"
export default component Person() { p = await loadPerson("a")
  <h1>{p}</h1> }
-- file: ./people.d.rx
export pure fn loadPerson(id: string): Promise<string>
-- file: ./host.d.rx
import { Layout } from "./main.rx"
import { Person } from "./page.rx"
export default component nests(children in component) = [{ component: Layout, children: [{ component: Person }] }]
```

It is looked for up to the project's folder ([03](03-declaration-lookup.md)).

## What it does not show

**A host declaration is believed.** In the program above it turns `UNHANDLED_FAILURE` into `ok`, and nothing in the checkers shows that the host mounts the page there. If it does not, the failure takes the page down.
RG-7b needs a placement, and here a person, or a tool that reads the router's tree, writes it. This is the known gap. `rx-verify` can run a scene; a derived file (`//@ routes`) can be refused when the tree has moved.
Until a run establishes the contract, this step is a switch that silences an error.

## Evidence

Taken off (`words.mjs`): 7 rows in 7 programs; 7 correct programs refused; 40 variants of 6 programs missed, of which 0 are refused still by another diagnostic.

Those count `nests` on a factory (one program, `@solidjs/router`) and in host declarations (the other six) together: **one set of variants for steps 2 and 3**, not two. Routers: `@solidjs/router`, filesystem-routing (stable); TanStack (release
candidate). Six tasks, 13 entries, 60 run-time checks.

## Cost

`nests`: 131 lines in the crate, 33 in `ref/src` (c4a5a6f). Hosts: 462 and 142 (97ac7b5, 4122716), and tools: 281 lines and a reader for each router. A fork of TanStack Router's generator, which is TanStack's to take.

## Prototype

MO-11i, MO-14a to h (proposed ids). S-module-10, 37, 38, 40, 41.
