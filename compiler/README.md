# compiler — ReactiveScript's crate

The production compiler (spec/11 CP-1a): a Rust crate, `reactivescript`, with
the command line `rxc`. It has parse (07), modules (09), check (02–06, 08),
signatures (MO-9) and the resolved model between check and lower (CP-6),
ported from `ref/src/`, and the lowering, ported from `ref/compile/`: each
module is built as an `oxc_ast::Program` and handed to Solid's
`solidjs-compiler` (`compile_program`, CP-1c; styles through `compile_style`,
CP-1d). Both give the same answers as the reference.

| module | port of | |
| --- | --- | --- |
| `parse.rs`, `ast.rs` | `ref/src/parse.ts`, `ast.ts` | `.rx` and `.d.rx` declarations; the AST serialises as the reference's does |
| `modules.rs` | `modules.ts` | the module graph, MO-5 cycles, MO-6 missing modules, MO-8/MO-9 declaration files |
| `check.rs` | `check.ts` | every diagnostic, with the reference's messages |
| `signature.rs` | `signature.ts` | a module's signature, printed and read back as `.d.rx` |
| `content.rs` | `content.ts` | SV-7d HTML nesting |
| `model.rs` | `model.ts` | CP-6: regions, symbols, computations with their reads, writes and calls |
| `emit.rs`, `awaits.rs` | `ref/compile/emit.ts`, `awaits.ts` | the lowering: `__rt` calls around JSX views, and each target through Solid |
| `js.rs`, `oxc.rs` | | the lowered module as a tree, then as an Oxc program (spans: spec/11 CP-1c) |
| `spans.rs` | | what the AST's spans promise (spec/11 CP-8b), and a diagnostic's range (CP-8d) |
| `project.rs`, `prelude.ts` | `ref/types/project.ts` | the TSX projection TypeScript checks (spec/13 TY-1), with mappings onto `.rx` (CP-8c) |

The Solid pin (`solidjs-compiler` in `Cargo.toml`) must be the commit in
`ref/SOLID_NEXT`.

```sh
cargo build --release
target/release/rxc check ../examples/todo.rx     # diagnostics
target/release/rxc check --json ../examples/todo.rx   # … with ranges, for an editor or an agent (CP-8d)
target/release/rxc project ../examples/todo.rx   # the TSX projection, with mappings onto .rx (CP-8c)
target/release/rxc model ../examples/todo.rx     # the resolved model, as JSON
target/release/rxc serve                         # a language server's requests, a JSON line each (CP-8e)
cargo build --lib --release --target wasm32-unknown-unknown   # … the same requests as WebAssembly (src/wasm.rs), what the server loads
target/release/rxc compile ../examples/todo.rx --out out   # modules (dom; --target ssr|universal), source maps onto .rx, style.css
target/release/rxc app ../examples/todo.rx       # the same as JSON, imports by .rx path: what the Vite front end gets
target/release/rxc check --spa ../examples/todo.rx   # a client-only build: a first load nothing holds is an error (08 CN-3d); also compile, app
target/release/rxc check --whole-program ../examples/todo.rx   # the modules loaded are the whole program: a kept peek of a prop or provision is decided by every application and provision (E-5a)
npm --prefix ../ref run crate                    # CP-5: the crate against ref/ on every program
npm --prefix ../ref run crate -- --project       # … and the TSX projection, text for text, every mapping checked
RX_CRATE=1 npm --prefix ../ref run types         # the types scenarios, on the crate's projection
npm --prefix ../ref run crate -- --lower         # … and the lowered JavaScript, for every target, and its source maps
RX_CRATE=1 npm --prefix ../ref run compiled      # the scenarios, run on the crate's output
RX_CRATE=1 npm --prefix ../ref run ssr           # … served and hydrated from the crate's output
```

## The npm package: `@reactivescript/compiler`

The crate's Node-API build (`--features node`, `src/node.rs`) is the npm
package `@reactivescript/compiler`, with one binary per platform
(`@reactivescript/compiler-<platform>`, in `npm/`) as `@solidjs/compiler`
ships, plus `@reactivescript/compiler-wasm32-wasi`, the same build for
`wasm32-wasip1-threads`, which loads wherever no binary fits (WebContainers
such as StackBlitz, musl, Windows on ARM). Build it with
`RUSTC="$(rustup which rustc)" npx napi build --platform --release --strip
--features node --target wasm32-wasip1-threads -- --lib`, and test it with
`NAPI_RS_FORCE_WASI=1 npm test`. `build.rs` sets up emnapi for it as
`@solidjs/compiler`'s does, and the napi crates are held at the versions that
setup works with. Its `/vite` export (`vite.mjs`) is ReactiveScript's front end for
Solid's Vite plugin, which loads it on its own: an app installs the package
and keeps `solid()` as it is (spec/11 CP-7, decision 7).

```sh
npm ci && npm run build      # compiler.<platform>.node and its loader, index.js
npm test                     # the binding compiles a program for every target
SOLID_VITE_PLUGIN=../../solid-vite-plugin node test/vite.mjs   # every example app, built by Vite and run in Chromium
```

`test/vite.mjs` needs a built checkout of solid-vite-plugin with built-in
`.rx` (solidjs/solid-vite-plugin#471, released in 3.0.0-next.57). The npm release works: with
`@solidjs/vite-plugin@3.0.1` installed somewhere, point `SOLID_VITE_PLUGIN` at its package directory.

Two tests need what npm's 3.0.1 does not have yet, front ends given Vite's resolver (`context.resolve`) and called
at each build's start (`Frontend.buildStart`): the `frontend-resolve` branch of
`github.com/yumemi-thomas/solid-vite-plugin`, built (`pnpm install && npx rolldown -c`).

```sh
SOLID_VITE_PLUGIN=<that checkout> node test/vite-hosts.mjs   # whole-program hosts: an alias only Vite knows, a host beyond the root (hostRoots)
SOLID_VITE_PLUGIN=<that checkout> node test/vite-watch.mjs   # vite build --watch: a .ts-only edit is type-checked, a created .d.rx is read
```

(`vite-watch` polls, and makes an edit again until a rebuild has started for it: Rolldown's watcher takes a file's
state some time after the build that named it has ended, and on macOS an edit made before that was never seen. Run at
`27e56ed` of that branch, 2026-11-23, and again with 09 MO-14f in the crate: `vite-hosts` 6/6, `vite-watch` 7/7.)

What happens to a `.rx` module in Vite:

- **Entries find themselves.** JavaScript imports only a program's entry,
  whose default export mounts the app; a dependency is a factory over the
  app (09 MO-1b) that only `.rx` imports. So an `.rx` module imported
  plainly is an entry. The program is checked and compiled whole from it
  (CP-2), once per target and again after a change to one of its files.
  Dependencies are imported as `./x.rx?rx-dep` and served from the build of
  a program that contains them; a module two programs share is one module
  (CP-4b `module`). A failed check fails the transform with the checker's
  diagnostics.
- **Already through Solid's compiler** for the environment's `generate`,
  with its map onto `.rx` (by line, CP-1c) and, on the entry, the program's
  stylesheet. Solid's plugin then runs its lazy, refresh and
  server-function passes (12 SF-7a) and links the stylesheet as a CSS module
  (CSS-4).

The app mounts a program with `createApp` from `@reactivescript/runtime`
(`../runtime`, CP-4a), as the examples do.

- **Rebuilds are checked.** Under `vite build --watch`, the type-check (13
  TY-1d) runs again when an entry is compiled after a change, and, where
  Solid's plugin calls front ends at each build's start, when only a `.ts`
  module changed. A `.d.rx` created where the program looked for one is
  read at the program's next compile; nothing watches a path that has no
  file, so creating it starts no rebuild by itself.
- **A route file's page.** `import Person from "./routes/people/[id].rx?rx-page"` is `?rx-lib` with the module's
  default component as the default export (spec/11 CP-4d): what a file-based router that takes `.rx` route files
  imports each as (`bench/tasks/file-routes`). A `host.d.rx` in the folder of a program's modules, or one above
  it, says what the host does with the components it renders (spec/09 MO-14) and which of its own components it
  renders through (MO-14f: the router's component in an `.rx` entry, a layout's `<Outlet />`): the crate reads it
  with the program, and it is watched as every declaration the program read is. `examples/tanstack` is such an app,
  built here with TanStack Router's Vite plugin (`test/vite.mjs` installs it once into `test/.out`).
- **A host declaration derived from the router's tree** (`//@ routes <source>` on its first line, spec/09 MO-14g) is
  held to the tree before a program is read: the dev server writes one that has fallen behind again and says so (a
  route file was added while it runs), a build refuses it (`HOST_VIEW_STALE`). The reader is the language server's
  (`@reactivescript/language-server/src/host-routes.js`): the project's, else this checkout's.
- **Under the dev server a module is named** (`module.__rxKey`: its path from the root and a hash of its compiled
  text), and the runtime keys its instance by the name (spec/11 CP-4b). A dev server serves one module under several
  URLs — a timestamp after each edit, and Vite 8 spells the query of a `?import` module in two orders — and the
  browser evaluates each: without the name a module's state and its contexts were made twice, and an edited route
  file read `no provision` for what the app's entry provides. A build names nothing. `test/vite.mjs` (*context*).
- **Solid's start mode** (`solid({ start: true, ssr: true })`): the root is `src/App.ts`, one line that hands an
  `.rx` root over as a page (`export { default } from "./App.rx?rx-page"`); `bench/tasks/start-mode`. List
  `@reactivescript/runtime` in the app's `package.json`: Solid's plugin then loads it with the app's copy of Solid
  under the dev server.
- **Whole program (opt-in).** `rx({ wholeProgram: true })` counts the JS
  under the Vite root that imports a module with `?rx-lib` as its hosts
  (02 E-5a); `hostRoots: ["../site"]` names folders or files beyond the
  root that hold more.

Not yet: Solid's refresh of a single `.rx` component in place is untested (an edit of an `.rx` module reloads the
page, or re-runs the module that hosts it, and what the page shows after it is tested: `test/vite.mjs`,
`bench/tasks/router-rx-routes`, `start-mode`); server rendering in Vite needs a request-scoped app for server
functions to run in.

### A library: `rx-lib`

`rx-lib` (`lib.mjs`, the package's bin; spec/09 MO-13e) builds a package written in `.rx` for every app that may use
it, `.rx` or `.tsx`:

```sh
npx rx-lib --write           # entries from package.json's "reactivescript": { "entries": [...] }, or src/index.rx
npx rx-lib src/index.rx src/theme.rx --root src --out dist   # the same, said on the command line
```

For each module the entries reach it writes `x.dom.js` and `x.ssr.js` (the module compiled for the browser and for
the server, `rxc app --lib`), `x.js` and `x.server.js` (what an import resolves to on each side: the factory as
`__rx`, and each export through the runtime's `library`, with the module's name), `x.d.rx` (the printed signature, `//@ signature x.rx`),
`x.rx.d.ts` (the projection's types, emitted by the project's `rx-tsc`: `@reactivescript/language-server` must be
installed, or pass `--no-types`) and `x.d.ts` (the types of `x.js`). It fails when the package.json's `exports` do
not name those files under Solid's conditions, printing the map; `--write` writes it, and the peers. `RXC=<rxc>`
compiles with a binary in place of the Node-API build. `test/lib.mjs` covers the build; `bench/tasks/rx-package`
builds a package, installs it and runs an `.rx` app and a `.tsx` app against it.

### Releasing

A release is a version bump merged to `main`: `npm version <patch|minor>
--no-git-tag-version` here, whose `version` script brings `npm/*` along. The
`optionalDependencies` on the platform packages are written by the publish
job, never committed: committed, they would put the platform packages in the
lock once they are on npm, and the next version bump would leave the lock out
of sync until the new ones were published. The `compiler` workflow builds and tests
every platform on every change; on `main`, once the repository variable
`RELEASES` is `on`, it publishes a version npm does not have, platform
packages first, by trusted publishing from the `release` environment, and
tags it `compiler-v<version>`.

`@reactivescript/runtime` (`../runtime`) is released the same way by the
`runtime` workflow, tagged `runtime-v<version>`.

Once, by hand: npm sets up trusted publishing only on a package that
exists, so each of the eight packages needs a placeholder first,

```sh
npm login
for p in runtime compiler compiler-darwin-x64 compiler-darwin-arm64 compiler-linux-x64-gnu compiler-linux-arm64-gnu compiler-win32-x64-msvc compiler-wasm32-wasi; do
  npx setup-npm-trusted-publish "@reactivescript/$p"
done
```

then, on each package's **Settings › Trusted publishing**, GitHub Actions:
owner `solidjs`, repository `reactivescript`, workflow `compiler.yml`
(`runtime.yml` for the runtime), environment `release`.

`ref/` stays the specification: a change of behaviour lands there first (with
its scenario), then here, and `ref/crate.ts` keeps the two equal.
