# examples — real programs in the 07 surface

Each `.rx` file is an app; `scenarios/S-app-*.md` runs it (`file: ../examples/x.rx`)
through the reference interpreter and the Solid oracle with a scripted
sequence of handler calls and landings.

| file | what it exercises |
| --- | --- |
| `todo.rx` | sources and equations, functional writes (W-6), per-row components, filters, imperative `if`/`return` in an action |
| `users.rx` | a derived source with a first paint (ST-5, R-7), optimistic rename over a structured value plus an optimistic UI flag, a held page change with `latest`, an `on(query)` boundary |
| `cart.rx` | written cold by a fresh agent from the spec alone (the AI-readability test): an optimistic checkout with `affects` for the spinner, a coupon question shown ahead with `latest`, functional root writes over a structured question source |
| `ai/feed.rx`, `ai/wizard.rx`, `ai/grid.rx` | written cold, spec-only (no examples shown), by fresh agents — streams/context/optimistic send; step regions with cleanups, `pre`, try/catch; keyed rows, `deferred`, `on(page)`. 34 of 35 frames predicted before running; the misses became rules (EF-2, H-1) |
| `shop/` | `cart.rx` in four modules (09): `catalog.rx` and `cart.rx` own their state and export actions to write it, `ui.rx` a row and a panel that keeps its children's failures inside it, `main.rx` the entry — checked against their signatures only (`ref/check.ts --signature examples/shop/main.rx`). S-app-shop runs it with S-app-cart's frames |
| `ai2/tracker/`, `ai2/settings/`, `ai2/search/` | the second AI test (see `ai2/README.md`): multi-module apps written cold from the spec with the checker in the loop — failures, declared contexts, modules; 36/36 frames predicted right by the spec |
| `todos.rx` | a list the server owns, in layers (solid next's `examples/todos`): the server's list (a question, re-asked after every write), failures laid over it (a plain source, kept until a retry is accepted), guesses on top (per row, and adds in a list of their own); nothing keeps a copy of what the server accepted. S-app-todos |
| `router/` | `@solidjs/router` 2.0 from `.rx` (09 MO-11): `createRouter` declared as a component factory in `router.d.rx` beside a re-export, `.rx` pages named in the route table, `useParams` and `useNavigate` as primitives, per-route data as an `await` over a param with the page's own `NotFound` boundary. No scenario runs it (the runners have no router); `compiler/test/vite.mjs` builds it and navigates it in Chromium |
| `virtual/` | render props (09 MO-11k) on a `VirtualList` built on `@tanstack/virtual-core`: `main.rx` renders 10,000 rows through `{view (row, i) { … }}` and a named `{view header (n) { … }}`; `headless.rx` is the headless virtualizer (TanStack's Solid adapter ported to Solid 2.0), the scroll element handed over with `ref` (07 §4). `compiler/test/vite.mjs` scrolls and clicks both in Chromium |
| `tanstack/` | `@tanstack/solid-router` 2.0 (rc) with its file-based routing (09 MO-14, MO-14f): `routes/` holds the route files (TSX, a few lines each: TanStack's generator reads TypeScript), which hand their routes the components of `pages.rx`; the generated `routeTree.gen.ts` registers the router (`router.tsx`), so every `<Link>` and hook of the `.rx` pages is typed by the routes. `main.rx` is the app's own component — it provides a context and frames the router's — and the layout renders its pages with `<Outlet />`. `host.d.rx` says where the router renders each: the layout where `App` applies `<AppRouter />`, the pages where the layout applies the outlet, so a page is checked under the layout's `errored` region and the app's provision. `compiler/test/vite.mjs` builds it with TanStack's Vite plugin, navigates it in Chromium, and holds that a link to no route fails the typed build and that a page's failure with no region around the outlet is refused on `host.d.rx` |
| `tanstack-factory/` | the same router with its route tree written in `.rx` (09 MO-11f, MO-11i, MO-8r): records given to a factory of the app's own (`tsr.js`, a dozen lines over the library's `createRoute`), declared `Component provides(router) nests(children in component)`; a layout renders its pages as `props.children`. No build plugin and no generated file — and no registered route types: a link to no route is not a type error here. `compiler/test/vite.mjs` builds it, navigates it, and holds that a route record with no component fails the typed build |
| `query/` | `@tanstack/solid-query` 6 from `.rx`: the client's context (MO-12), a query whose `data` waits where it is read, handed out by `query.js` as an accessor that says so (`pending fails(Error) ref`, MO-10l, MO-8r), a mutation whose `onSuccess` closure writes an `.rx` source (MO-10g). `compiler/test/vite.mjs` adds a todo and waits for the refetch |
| `signup.rx` | validation as equations, an async question with `latest`/`pending?` display-ahead, context-free components with children, an action with an early return, `errored fallback(e)` |

The prelude for the scenario runners: `import pure { len, str, … } from "./prelude"`,
`import { log } from "./prelude"` (io), and every function imported from
`"./api"` is a flight keyed by its name and its arguments formatted as the
frames format values — strings bare, objects and arrays as JSON
(`resolve "saveUser:1,Anne" …`, `resolve "checkout:[{"id":1,"qty":2}],SAVE10" …`).
A key is one flight for the program's lifetime: calling the same function
with the same arguments again lands the old answer at once (a "retry" in a
scenario must differ in its arguments).
