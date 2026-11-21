# rx-language-server

The `.rx` language server (spec/11 CP-8e), built on [Volar](https://volarjs.dev).
A `.rx` file's virtual code is its TSX projection (spec/13 TY-1c), which the
crate makes with mappings back onto the `.rx` (CP-8c). TypeScript answers hover,
go to definition, references, rename, completion and type errors on the
projection, and Volar maps the answers back. The crate's own diagnostics (parse
errors, else the checker's, each with its rule) are a second service.

- `src/rxc.js` asks the crate for a file's analysis, with the editor's unsaved
  text as overlays: its WebAssembly build in process (`src/wasm.rs`; one build
  for every platform, about a millisecond a file once loaded), or, when `RXC`
  names a binary, `rxc serve` as a process per request. It writes the
  projection's prelude to `node_modules/.reactivescript/prelude.d.ts`.
- `src/index.js` is the language plugin (exact mappings carry every feature;
  ranges only place type errors) and the diagnostics service.
- `bin/server.js` is the server, over stdio or IPC.

The project needs a `tsconfig.json` with Solid's JSX (`"jsx": "preserve"`,
`"jsxImportSource": "@solidjs/web"`) and Solid in its `node_modules`.

## Running it

From npm (published from this folder, `../RELEASING.md`):

```sh
npx @reactivescript/language-server --stdio
```

From the repository:

```sh
cargo build --lib --release --target wasm32-unknown-unknown --manifest-path ../../compiler/Cargo.toml
npm install
node bin/server.js --stdio
```

`initializationOptions: { typescript: { tsdk } }` picks TypeScript's `lib`
folder; without it, the server uses its own `typescript`.

## Type-checking from the command line

`rx-tsc` (`bin/tsc.js`) is `tsc` with `.rx` modules in the program, for CI.
It is Volar's tsc runner (the one `vue-tsc` uses) with this package's
language plugin, so it checks the same projection the editor does, and places
type errors on the `.rx`. It takes `tsc`'s arguments and reads
`tsconfig.json`, whose `include` must name the `.rx` files.

```sh
npx rx-tsc --noEmit
```

After TypeScript's errors it prints the crate's diagnostics for every `.rx`
module in the program (parse errors, else the checker's, with their rules),
and exits non-zero if there are any. It also checks each `.d.rx` beside a JS module against that module's real
types (spec/13 TY-6), reporting `DECLARATION_MISMATCH` on the declaration's line. A module that does not parse has no
projection, so TypeScript alone would pass it. Under `--watch` only
TypeScript's errors are reported.

## Drafting a declaration

`rx-declare <module> [--out file.d.rx]` (`bin/declare.js`) writes a draft `.d.rx` for a JS module from its TypeScript
types, resolved from the current directory as an import there would be. A package's declaration goes in the project's
`rx-types/` folder, named by the import (spec/09 MO-8k); the import in `.rx` stays as written:

```sh
npx rx-declare @tanstack/solid-query --out rx-types/@tanstack/solid-query.d.rx
```

You may not need to run it: for a package nothing declares, the language server, rx-tsc and the Vite plugin draft one
themselves from its types (`src/generate.js`, MO-8l) into `node_modules/.rx-types/`, redrafted when the package's
version changes. Those drafts don't run the package, so a hook's context and a field that waits or throws go unchecked
there; write the `rx-types/` file (this command, then its TODOs) to check them. `RX_GENERATE=0` turns drafting off.

What the types show becomes rows: an accessor parameter or result is `ref`, a function of props to a JSX element is a
component (its JSX props are `View`, its component props `Component`), a tuple keeps its `ref` parts, an `Error`
subclass is an `error`, a function that hands back a component is a factory. `create*`, `use*`, `define*` and
`*Options` fns are `pure` (Solid's convention for primitives and config helpers); every other fn stays io. What types
cannot show is a `// TODO` line above the declaration it concerns: which context a hook reads (`uses(…)`), whether a
result's fields wait or throw (`pending fails(…)`), what a promise rejects with. `rx-tsc` then checks the draft against
the same types (spec/13 TY-6).

Then it runs the module (`--no-run` skips this; run it with `node --conditions=browser`) to settle what running can:
a hook whose parameters are all optional is called with nothing providing anything, and its result read (fields,
accessors), since a hook may look its context up only then. One that throws reads a context: the module's exported
contexts are tried around it (with a placeholder value) and the one under which it runs is named (`QueryClientContext`
→ `export context queryClient`, `uses(queryClient)`); a module that exports none gets one context named after it
(`export context router`). A `…Provider` component under which the hook then runs, with no props or placeholder ones,
`provides` it. A hook that never throws keeps its TODO rather than a claim of no need (it may read its context later
than running reaches), and one that throws under every context gets no invented one. On `@solidjs/router` 2.0 this
settles 7 of 8 argument-free hooks; on `@tanstack/solid-query` 6, `useQueryClient` and `QueryClientProvider`. A hook
that throws only for want of a browser (no `window` in Node) is not a context read; `--dom` runs with happy-dom's
globals (`@happy-dom/global-registrator`, installed in the project) so such hooks run as in a page. Drafted over all 98
`@solid-primitives` packages with a Solid 2 release, the drafts pass TY-6 but for three types no draft can spell (a
props type intersected with a tuple, a callable interface), which a person writes.

## Checking a declaration by running it

`rx-verify <file.d.rx>...` (`bin/verify.js`) imports the JS module beside each declaration and checks the rows running
can check: every declared export exists, a fn is a function, an `error` is an `Error` subclass, and a hook declared
`uses(…)` that takes no arguments throws when called with no provider (otherwise the row claims a need the hook does
not have). `rx-tsc` checks what types can (TY-6); this checks what running can.

A parameter declared as a function (a callback, MO-10g) is wrapped in a spy: the row holds if the library calls it
outside tracking, as a handler, and is a mismatch if it calls it inside a computation.

`rx-verify --record lib.d.rx` also writes `lib.verified.json`: each row's result, by a hash of its text. `rx-tsc
--rx-strict` (or `"reactivescript": { "strict": true }` in the tsconfig) then refuses every row of an imported
declaration not recorded as holding, unless the row says `trusted` (`UNVERIFIED_ROW`, MO-8j). Commit the record beside
the declaration; editing a row invalidates its entry.

What needs the app (a hook's arguments, its providers) comes from a probe, `lib.probe.mjs` beside `lib.d.rx`:

```js
import { createComponent } from "solid-js";
import { QueryClientProvider, makeClient } from "./query.js";
let n = 0;
export const provide = children => createComponent(QueryClientProvider, { client: makeClient(), get children() { return children(); } });
export const probes = {
  useQuery: {
    args: () => [() => ({ queryKey: ["probe", n++], queryFn: async () => ["a"] })],
    fail: () => [() => ({ queryKey: ["probe", n++], queryFn: async () => { throw new Error("probe"); } })],
  },
  useMutation: { args: () => [() => ({ mutationFn: async v => v })], run: m => m.mutate(1) },
};
```

With it, a `uses(…)` hook with parameters is run with no provider (it, or the probe's `run` on its result, must
throw; `run` is checked under `provide` too, so a broken probe is reported, not counted), and a hook whose result is a
declared record is mounted under `provide` (with `@solidjs/universal`, beneath an errored boundary) and each field
read: a field that holds or fails without `pending`/`fails(…)` is a mismatch, and under `fail`'s arguments a
`fails(C)` field must fail with a `C`. Run it with `node --conditions=browser`, so Solid is its client build. A failure that only says there is no browser
(a missing `window`) is reported as unverified, never as a mismatch; `--dom` runs with happy-dom's globals. On
`@tanstack/solid-query` 6 it found that `isFetching` holds on the first load too: the whole result waits.
A tuple's parts and a `ref` result are read the same way (a `ref` part must be an accessor). A `pure` fn that makes
nothing is called twice with the probe's arguments: answering differently is a mismatch, answering alike is reported
as not contradicted (unverified), since running can show a fn is not pure but never that it is. A component that `provides(c)` is mounted,
with the probe's `props` (`QueryClientProvider: { props: () => ({ client: makeClient() }) }`), around a hook of the
same file that uses only what it provides, which must then run cleanly.

## Editors

**VS Code** (and Cursor, VSCodium): the extension in
[`../vscode-rx`](../vscode-rx), which bundles this server and the WebAssembly
build.

**Neovim** (0.11+), in `init.lua`:

```lua
vim.filetype.add({ extension = { rx = "reactivescript" } })
vim.lsp.config("rx", {
  cmd = { "node", "/path/to/reactivescript/tooling/rx-language-server/bin/server.js", "--stdio" },
  filetypes = { "reactivescript" },
  root_markers = { "tsconfig.json", "package.json" },
})
vim.lsp.enable("rx")
```

Neovim has no `.rx` grammar yet; the server's semantic tokens color names.

**Helix**, in `languages.toml`:

```toml
[language-server.rx]
command = "node"
args = ["/path/to/reactivescript/tooling/rx-language-server/bin/server.js", "--stdio"]

[[language]]
name = "reactivescript"
scope = "source.rx"
file-types = ["rx"]
roots = ["tsconfig.json", "package.json"]
language-servers = ["rx"]
```

**JetBrains IDEs** (WebStorm, IntelliJ): install the
[LSP4IJ](https://plugins.jetbrains.com/plugin/23257-lsp4ij) plugin, add a
language server with the command
`node /path/to/reactivescript/tooling/rx-language-server/bin/server.js --stdio`,
map the file name pattern `*.rx` to it, and add the `tooling/vscode-rx`
folder under Settings › Editor › TextMate Bundles for highlighting.

**Zed** needs an extension of its own (a Zed extension declares the language
and starts the server); there isn't one yet.

The `/path/to/reactivescript` paths are a checkout of this repository; with
the npm package, the command is `npx @reactivescript/language-server --stdio`
instead (or `rx-language-server --stdio` once installed).

## Tests

```sh
cargo build --release --manifest-path ../../compiler/Cargo.toml
npm install && node test/run.js      # VERBOSE=1 prints each answer
node test/tsc.js                     # rx-tsc: a clean program, a type, a parse and a checker error, a .d.rx that disagrees with its types
node test/declare.js                 # rx-declare: each kind of export drafted as its row, the run pass, and the draft passes rx-tsc
node test/generate.js                # generated declarations: drafted, found by the crate, kept, redrafted, and in the Vite plugin
node test/verify.js                  # rx-verify: uses(…) rows, missing exports, errors, probes, callbacks, --record and strict mode
```

`test/run.js` drives the server over LSP on a copy of `examples/shop` (Solid's
types from `ref/node_modules`, via `ref/scripts/solid-next.sh`): hover, go to
definition across modules, references, completion while typing (in code and in
markup), a parse error, a TypeScript type error and a crate diagnostic, each
placed on the `.rx`. `test/tsc.js` runs `rx-tsc` on the same copy.
