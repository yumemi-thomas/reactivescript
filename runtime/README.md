# @reactivescript/runtime

ReactiveScript's runtime (spec/11 CP-4a): `createApp` and the `__rt` helpers
that compiled `.rx` calls, over Solid. Each helper is a Solid primitive, a
composition of them, or plain JavaScript; nothing in it adds run-time
behaviour beyond Solid.

There is a browser build and a server build, chosen by export condition as
`@solidjs/web` chooses (`browser` → the browser build; `node`, `deno`,
`worker` → the server build; `./web` and `./server` name one explicitly).
Both create the same owners in the same order, so a page the server streamed
hydrates (spec/10).

```js
import { createApp } from "@reactivescript/runtime";
import main from "./app.rx";   // compiled by @reactivescript/compiler (Solid's Vite plugin loads it)

const app = createApp({ root: document.getElementById("app") });
app.mount(main(app));
```

On the server, an app is a request (spec/10 SV-4): pass it, so a library that
locates a render by Solid's request event (`@solidjs/router` reads the page's
URL from it) sees the request being served:

```js
import { createApp, generateHydrationScript } from "@reactivescript/runtime";   // the server build
import main from "./app.rx";

const app = createApp({ request });   // one app per request
app.stream(main(app), { write: chunk => res.write(chunk), end: () => res.end() });
```

`compiler/test/ssr-router.mjs` serves `examples/router` this way and hydrates
it in Chromium.

With Vite, `solid({ ssr: true })` compiles `.rx` for each side: build the
client (`entry.js`: `createApp({ root }).mount(main(app), true)`), then the
server (`build.ssr: "src/server.js"`), whose module exports a `render`:

```js
// src/server.js
import { createApp, generateHydrationScript } from "@reactivescript/runtime";
import main from "./main.rx";
export { generateHydrationScript };
export function render(request, sink) { const app = createApp({ request }); app.stream(main(app), sink); }
```

The host writes the client's `index.html` around the stream, with
`generateHydrationScript()` in its head. Solid, the router and this runtime
must be one copy each on the server: as installed packages they are
external to the server build; a linked checkout of Solid is not, so name
them in `ssr.external` (otherwise the compiled templates and the runtime
render with two copies of Solid, and nothing hydrates: the runtime warns
once when a stream's first chunk has markup and no hydration key). The Vite suite
(`compiler/test/vite.mjs router-ssr`) builds and serves it this way.

A JS module's error class declared in its `.d.rx` (`export error NotFound`) crosses to the client as itself when the
program awaits the rejection (spec/10 SV-5a). A library that serializes a rejection itself first, as
`@solidjs/router`'s `query` cache does, needs the adapter around the function it caches:

```js
import { sendErrors } from "@reactivescript/runtime";
export const getPerson = query(sendErrors(fetchPerson), "person");
```

It marks only instances of classes the rendering app declares, during its request; on the client it is the function
itself. Without it the router's cache sends the error redacted.

A JS host can render `.rx` components itself (spec/11 CP-4d): import the
module with `?rx-lib` and import its components:

```tsx
import { PersonCard } from "./pages.rx?rx-lib";
export default () => <PersonCard id="1" />;
```

(or `components(pages)` over the default export, `import pages from
"./pages.rx?rx-lib"`). `rx-tsc` types these imports from the `.rx` module,
so a wrong prop is a type error in the TSX; for a TypeScript without `.rx`
support, add `"types": ["@reactivescript/runtime/rx-lib"]` and they are
untyped.

On the client they share one app; on the server, one per request, found
through Solid's request event, so module state is per request. A server render
outside any request throws instead of sharing one app across renders: render
inside the framework's request, or pass the app, `components(pages,
createApp({ request }))`. TanStack
Start's file routes use this (`examples/start`).

Solid is a peer: `solid-js`, `@solidjs/web` and `@solidjs/signals` (the
runtime reads owner context from `@solidjs/signals`, which `solid-js` runs on;
with pnpm, add it to the app).

The source is the reference's runtime, `ref/compile/rt-web.ts` and
`rt-server.ts`, the one every scenario runs on; `npm run build` transpiles it
to `dist/` with its declarations. `npm test` checks both builds and renders
a program compiled by the crate on the server build (it needs the compiler's
Node-API build: `npm run build` in `../compiler`).

Not yet: the server build's `stream` takes no request (it provides a
placeholder one); a framework's request handling is to come.

Releases: as `@reactivescript/compiler`'s (`../compiler/README.md`,
Releasing), by the `runtime` workflow, tagged `runtime-v<version>`.
