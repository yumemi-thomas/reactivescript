# 12 — File-based routers: a host declaration, and `.rx` route files

Depends on [01](01-component-rows.md), [02](02-context-rows.md) and `nests` of [07](07-placement.md).

## Problem

A file-based router finds its route files. JavaScript renders each page under its layout. No `.rx` module shows what is
above a page, so a page with no region of its own is refused:

<!-- check branch=UNHANDLED_FAILURE upstream=UNHANDLED_FAILURE main=page.rx flags=--whole-program,--host,page.rx -->
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
```

(`--whole-program --host` are this branch's flags for a page a JS host renders. Upstream ignores them and checks the page
as an entry, with the same verdict.)

## Proposal

**A host declaration**, `host.d.rx`, says what the host renders, in the words a factory's row has. It imports the `.rx`
components by name, and has one view:

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

- It is checked as the app's view: as an entry that makes a factory of those records, and applies it.
- An import from JavaScript names a component the host renders through (a router's `<Outlet />`, its provider). Applied in
  an `.rx` view, it renders that component's children there.
- A page the view does not name is checked under a root of its own.

**Derived.** A first line `//@ routes ./routeTree.gen.ts` says that the file was written from the router's own tree.
`rx-declare --host --routes` writes it; the dev server writes it again; `rx-tsc` and a build refuse one that has fallen
behind (`HOST_VIEW_STALE`). To the checkers the line is a comment. Readers exist for TanStack Router's generated tree, for
a router made in `.rx`, for `filesystem-routing`, and for a JSON tree.

**`.rx` route files.** With `filesystem-routing` a page is an `.rx` file already. TanStack Router's generator takes a fixed
list of extensions, and parses each as JavaScript. A fork adds two options:

- `routeComponentExtensions: { ".rx": "?rx-page" }`: a file with the extension is a route; its default export is the
  component. The generator writes the route object, and never parses the file.
- `routeComponentOptionsExport: "route"`: the export through which the file gives `loader`, `validateSearch` and the rest.

Nothing in the options names ReactiveScript. They are TanStack's to accept; the branch does not depend on it, since a route
file in TSX that hands over an `.rx` component needs no fork.

## Evidence

- Six tasks: `file-routes` and `start-mode` (filesystem-routing, Solid's start mode), `router-provider`, `start-route`,
  `router-code-routes` (TanStack, TSX or code routes), `router-rx-routes` (the fork). 13 good entries, 60 run-time checks in
  Chromium and on the server, 71 mistakes caught (`bench/scorecard.txt`).
- `nests` taken off refuses the six programs with a host declaration and lets 40 mistakes through, with the factory's
  (`node proposals/words.mjs nests`).
- Each derived declaration is run: `rx-verify host.d.rx` holds 15 claims of the tasks' host views.

## Cost

- Checkers: 309 + 153 lines in the crate, 91 + 51 in `ref/src` (97ac7b5, 4122716).
- Tools: 218 (`host-routes.js`) + 63, and a reader for each router.
- The fork: two commits on TanStack Router, packed as tarballs in `bench/tasks/router-rx-routes/vendor`.
- A file a user did not write, in their source folder.

## What it does not do

- The view passes no props, and knows no path. A route's params are TypeScript's.
- What the host renders besides the view is not above its pages.
- TanStack's `.lazy` and `.component` pieces are refused for `.rx` route files.

## Alternatives tried and rejected

- *Each page has regions of its own.* It is what upstream asks today. It is correct, and repeats the layout in every page.
- *Words on the routes' values* (`nests(component under parent)`, `outlet`, `renders(later)`). One library. Withdrawn.
- *A route module in JavaScript, unchecked.* Every page is then checked under a root of its own.
- *The checker reads the router's tree.* No library's rule is a checker's (CN-8 here). The tool reads it.

## Compatibility

A file named `host.d.rx` in an entry's folder, or above it, is read. Upstream reads none.

## Open questions

- Is a declaration the right place, or an option of the Vite plugin?
- Should the derived file be under `node_modules` instead of the source?
- Upstream has no way yet for JavaScript to import an `.rx` component (`?rx-page`, 11 CP-4d here). That comes first, and is
  part of [13](13-packages-in-rx.md)'s runtime.

## Prototype

MO-14a to h, 11 CP-4d. S-module-37, 38, 40, 41. 97ac7b5, 4122716, c315c3c, aad6dbd, 49379fe, 8e21e9b.
