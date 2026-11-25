# rx-language-server

The `.rx` language server (spec/11 CP-8e), built on [Volar](https://volarjs.dev).
A `.rx` file's virtual code is its TSX projection (spec/13 TY-1c), which the
crate makes with mappings back onto the `.rx` (CP-8c). TypeScript answers hover,
go to definition, references, rename and completion on the projection, and
Volar maps the answers back. The type errors are the checker's (*The checker*,
below), placed through the same mappings. The crate's own diagnostics (parse
errors, else the checker's, each with its rule) are a service of their own.

- `src/rxc.js` asks the crate for a file's analysis, with the editor's unsaved
  text as overlays: its WebAssembly build in process (`src/wasm.rs`; one build
  for every platform, about a millisecond a file once loaded), or, when `RXC`
  names a binary, `rxc serve` as a process per request. It writes the
  projection's prelude to `node_modules/.reactivescript/prelude.d.ts`.
- `src/index.js` is the language plugin (exact mappings carry every feature;
  ranges only place type errors) and the diagnostics service.
- `src/checker.js` is the one way to TypeScript's diagnostics; `src/program.js` a project's `.rx` modules in its program;
  `src/editor.js` the editor's type errors.
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
cargo build -p rx-words --release --target wasm32-unknown-unknown --manifest-path ../../compiler/Cargo.toml
npm install
node bin/server.js --stdio
```

`initializationOptions: { typescript: { tsdk } }` picks TypeScript's `lib`
folder for hover, completion and the rest; without it, the server uses its own
`typescript`. The type errors are tsrs's either way.

## The checker

Types are checked by [tsrs](https://github.com/oxc-project/tsrs), a port of TypeScript 7, at the one version
`package.json` pins (`rx-tsc --version` prints it with the TypeScript it is). `src/checker.js` is the only file that speaks
to it: files and options in, diagnostics with positions out, in order. It is a process that stays up, spoken to through its
API; a projection or a boundary check is given with the question and is no file on disk.

- **One answer.** A program is checked by one checker, in the order its files are given, so what is reported does not
  depend on a number of threads. No program is cut to run in parallel: a row near TypeScript's depth limit (TS2589) is not the
  same row beside others.
- **No other checker stands in.** tsrs has a binary for macOS, Linux (glibc and musl) and Windows, on x64 and arm64, as
  optional packages npm picks from. Where none is installed (`--omit=optional`, a lockfile from another platform, another
  platform), or another version is, `rx-tsc` exits 2 and `rx-declare` writes nothing, each with the reason. `TSRS_BINARY`
  names a binary built by hand. (tsrs's WebAssembly build is a command line for WASI, without the API; it is not used.)
- **The editor's extension** holds no binary: it takes the tsrs of the project's `@reactivescript/language-server`, and
  where there is none it says so once and the type errors are the editor's TypeScript's.
- **What stays on TypeScript 6** (`typescript`, in process): hover and the rest of the editor. A draft reads a library's
  types through the same API as the checks (`src/ts-api.js`, `src/row-types.js`), in batches.


## Type-checking from the command line

`rx-tsc` (`bin/tsc.js`) is `tsc` with `.rx` modules in the program, for CI.
It checks the projection the editor does with the checker above, and places
type errors on the `.rx`. It takes `tsc`'s arguments (not `-b`, `--init` or
`--showConfig`) and reads `tsconfig.json`, whose `include` must name the `.rx`
files.

```sh
npx rx-tsc --noEmit
```

After TypeScript's errors it prints the crate's diagnostics for every `.rx`
module in the program (parse errors, else the checker's, with their rules),
and exits non-zero if there are any. It also checks each `.d.rx` beside a JS module against that module's real
types (spec/13 TY-6), reporting `DECLARATION_MISMATCH` on the declaration's line. A module that does not parse has no
projection, so TypeScript alone would pass it.

## Drafting a declaration

`rx-declare <module> [--out file.d.rx] [--no-infer] [--why] [--explain] [--causes file.json] [--readings export] [--any]` (`bin/declare.js`) writes a draft `.d.rx` for a JS module from its TypeScript
types, resolved from the current directory as an import there would be. A package's declaration goes in the project's
`rx-types/` folder, named by the import (spec/09 MO-8k); the import in `.rx` stays as written:

```sh
npx rx-declare @tanstack/solid-query --out rx-types/@tanstack/solid-query.d.rx
```

**Words read from the code** (spec/09 MO-8v, `compiler/words`, `src/words.js`, `src/declare-infer.js`). Beside the types,
the draft reads the JavaScript the import resolves to, under each host that loads it (Node, Vite's client and server), and
writes a word only where the code proves it: `pure`, `handler`, `instantiates`, `uses(c)`,
`provides(c)`, and `ref` on a part that is an accessor. What proves each is in `compiler/words/DESIGN.md`, a line a word;
what is not listed there gives no word. The draft's second line counts the words it read; no row is marked: `rx-declare
--audit <file.d.rx>` and `rx-verify` read the code again and say, of every word a declaration has, whether the code proves
it (`src/declare-audit.js`). The question each word answers is not asked. `--why` prints, for every row, what proved each
word or the first thing in the way with its file and line; `--no-infer` (or `RX_DECLARE_INFER=0`) drafts from the types
alone.

```sh
npx rx-declare ./api.js --why
# rx-declare: total: pure proven — its own code only computes
# rx-declare: savePerson: pure not proven — it assigns saves, a variable of the module [api.js:5]
# rx-declare: onKey: handler(run) proven — called later [api.js:6]
```

You may not need to run it: for a package nothing declares, the language server, rx-tsc and the Vite plugin draft one
themselves from its types (`src/generate.js`, MO-8l) into `node_modules/.rx-types/`, redrafted when the package's
version changes, with no questions. Those drafts don't run the package, so a hook's context and a field that waits or throws go unchecked
there; write the `rx-types/` file (this command, then its TODOs) to check them. `RX_GENERATE=0` turns drafting off.

What the types show becomes rows: an accessor parameter or result is `ref`, a function of props to a JSX element is a
component (its JSX props are `View`, its component props `Component`), a tuple keeps its `ref` parts, an `Error`
subclass is an `error`, a function that hands back a component is a factory. A method of an exported object, or of
an exported function, that the library's own types declare is a row of its own after its object's (`export fn
toaster.show(…)`, 09 MO-8t), and a module's default export the row named `default` (MO-8u: `export fn default(…)`,
`export component default(…)`). Every fn is drafted io unless its code
proves more; no word and no question is chosen by a name. What is left to a person is a `// TODO` above the row it
concerns, asked only where the answer changes what a checker does (`src/questions.js`: what the row does now, what the
word changes, why it is not proven, with its place). `rx-tsc` then checks the draft against
the same types (spec/13 TY-6).

A type the draft cannot restate is named where the library declares it rather than written `any` (spec/09 MO-8m): the
module's own exported type by an alias the draft declares, another package's by `import("<package>").T`, a row's type
parameters as the library declares them (a component's too: `export component Select.Item<T extends …>(…)`), a
callback by its own signature, a conditional or mapped type as the library computes it, and an internal type by its
place (`Parameters<typeof import("kit").inner>[0]`). Each row is checked against the module before the draft is
written (`src/declare-check.js`: the crate's TY-6 boundary check on the draft's text), and a row TypeScript does not
hold falls back to the row with `any`s, so the draft passes `rx-tsc` as it stands. `--explain` prints, on stderr, how
many `any`s are left and why (`overload`, `generic`, `generic-computed`, `internal-type`, `vendor-any`, …) and each
row that fell back with TypeScript's reason; `--any` drafts as before, every unnamed type `any`.

The types are written from the library's own declaration (spec/09 MO-8o): each parameter's, result's and prop's
annotation, with every name rewritten to a module the app can import it from — the module itself, a subpath its
package exports (`@formisch/solid/v2/internals`), a package it depends on — under the name it has there. A component's
props are its props type and, after `&`, the fields the checker reads (`props: SelectRootProps<Option> & { onChange?:
(…) => void; itemComponent?: Component }`); a fn with several signatures has one row, the shortest signature's, and a note of how many
the library has (an export has one row, MO-8b); a result the library names keeps that name unless its parts say something the checker reads. An `any`
is written only where the library's own type has one (MO-8q): `--explain` counts the library's (`vendor-any`) and the
draft's apart, with the parts said by place, and `--causes <file>` writes them by row as JSON (what `bench/` counts).
A draft writes none of its own, for any export: where a type has no name it is said by its place — at the row's type
parameters (`Parameters<typeof import("kit").f<T>>[1]`) where the row has them — and the last reading of a row, tried
only before an `any`, has no type parameters and says every part without a name by its place as it stands.
`--readings <export>[,<export>]` prints each reading of that row and what TypeScript said of it, which is how to find out
why a row was drafted the way it was. A component's props record is held to the props' type as `rx-tsc` holds it (13
TY-6f) before the row is written.

A result is typed a step at a time, as the checker reads it (MO-10b, MO-10k). One that takes nothing and answers
nothing is `() => void`, through the library's own name for it (`VoidFunction`), so the checker holds a call to keeping
it (EF-5a). A small object the library declares is drafted by its fields — an accessor `ref`, a getter the app calls
(`getPageCount()`) and a function by what they answer (`void`, a promise, a primitive), a nested object a step further —
and an instance of a class by the methods that answer nothing, a promise or a primitive (`invalidateQueries: (...args:
any[]) => Promise<void>`); a larger type stays `any`. An accessor of an options object lists its callbacks, so `handler`
is one word on the row. The module's own exported types are named (`Promise<Todo[]>`), and a generic type
is declared with its parameters (`export type Table<TData> = import(…).Table<TData>`).

A parameter that is a component is written `Component<P>`; one that is a view or a function of nothing giving one, as
that (`View | (() => View)`, not an accessor); a prop that holds components in a record or a list, so that the checker
reads them (`builtins: { Heading?: Component }`, 09 MO-11c). A fn that is given a component gets the question a type
cannot answer — where the library renders it (`renders(<Component>)`, 09 MO-11u).

A draft holds no word off a name, a shape, a run or a list of libraries: what the code proves is written, and the rest is a
question or nothing (DECLARATIONS.md, MO-8v). Drafted over all 98
`@solid-primitives` packages with a Solid 2 release, the drafts pass TY-6 but for three types no draft can spell (a
props type intersected with a tuple, a callable interface), which a person writes.

## Checking a declaration by running it

`rx-verify <file.d.rx>...` (`bin/verify.js`) imports the JS module beside each declaration and checks the rows running
can check: every declared export exists, a fn is a function, an `error` is an `Error` subclass, and a hook declared
`uses(…)` that takes no arguments throws when called with no provider (otherwise the row claims a need the hook does
not have). `rx-tsc` checks what types can (TY-6); this checks what running can.

A parameter declared as a function (a callback, MO-10g) is wrapped in a spy: the row holds if the library calls it
outside tracking, as a handler, and is a mismatch if it calls it inside a computation.

`rx-verify` first asks which words of the file the code proves (MO-8w, the audit `rx-declare --audit` prints), and its last
line counts them. Every `pure` fn is called and must change nothing it was given (its data, what the accessors among its
arguments answer); one the code proves must also leave no new global and ask neither `Date.now()`, `performance.now()` nor
`Math.random()`. A `handler` must not be called while the fn's own call is still running, in a computation or under an
owner; a `rejects(E)`, under the probe's arguments and its failing ones, must reject with a class of its row. An
observation the other way is a mismatch; where the word is one the code proves, the reading is wrong: report it. A row that is mounted to
be read needs `@solidjs/universal` in the project; without it that row is not run, and the others are.

Where a library renders the components it is given is run against a scene (spec/09 MO-11r): the probe exports
`scene(lib, h)`, a small app built of the module's exports with `h.component(name)` for the program's components (and
`act(lib, h)` for what happens after it is mounted: `lib.toast(Saved)`). A fn that hands back a `Component` must render
what it was given inside the made component; `nests(children in component)`, each entry inside its record's component;
`renders(H)` (MO-11u), beneath an application of H — every one in the scene is recorded; and a component with a prop
that takes components (MO-11c, DV-24), beneath that application. A component a fn *calls with no owner at all* is
reported whatever its row says, a fn with no placement word included (MO-11s): nothing it makes is ever disposed, and
in development Solid's `useContext` throws there.

A host declaration (`host.d.rx`, spec/09 MO-14: what a JS host, such as a file-based router, does with the `.rx`
components it renders) declares no module's exports, and its view is run against a scene: a probe beside it
(`host.probe.mjs`) exports `scene(rx, h)`, the host's view built of `rx.Layout`, `rx.Person`, … — a recording
component for each one the declaration imports — and `uses`, by context, a hook that throws or warns with no
provider (`act(rx, h)` may then navigate). Each component the view names must render inside the component of the
record it is a child of, and each hook must work where each renders. A component the declaration imports from
JavaScript (MO-14f: one the host renders through — a layout's `<Outlet />`, the router's component in an `.rx`
entry) is given by the probe as `through.Outlet`; the scene applies `rx.Outlet` where the app's component applies the
real one, and a component of the view must render inside it (the claim is the import's own row). `rx-tsc --rx-strict`
asks for a host declaration's record as for any declaration's. `rx-declare --host <module.rx>...` drafts the
declaration: the imports, the contexts those modules' imports are declared to use, and a view with every component
at the top — which page is in which layout is the router's knowledge, and is left to write. Or read from the router
(MO-14g): `rx-declare --host --routes <routeTree.gen.ts | routes directory | router module | router.rx | routes.json> [<entry.rx>…]` writes the
whole declaration from the router's own tree, with `//@ routes …` on its first line; `rx-declare --host --sync
host.d.rx` writes it again from there, `--check` exits 1 when it has fallen behind, and so do `rx-tsc`
(`HOST_VIEW_STALE`) and `rx-verify`, which hands the probe the routes (`scene(rx, h, routes)`, `act(rx, h, route)`
for each page). `src/host-routes.js` is the reader. A router made in `.rx` (code-based routes: `export router =
createRouter({ routeTree })`) is read by compiling its module (whatever the checkers say of it: the declaration being
written is what it is checked by), running it in a child process with a browser's globals (happy-dom, from the
project) and asking the router object for its tree; the outlet, and the entry's router component, are found through
the `.rx` modules a layout or an entry imports.

`rx-verify` runs a `pure` fn on the other side too (10 SV-7c): a second process, with a browser's globals when the
first has none; a plain answer that is steady on each side and differs between them is a MISMATCH.

`rx-verify --record lib.d.rx` also writes `lib.verified.json`: each row's result, by a hash of its text. `rx-tsc
--rx-strict` (or `"reactivescript": { "strict": true }` in the tsconfig) then refuses every row of an imported
declaration not recorded as holding (`UNVERIFIED_ROW`, MO-8j). Commit the record beside
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
read: a plain field that holds or fails is a mismatch (no row describes it: it is handed out as a function, declared
`pending fails(…) ref`, MO-10l), a `ref` part that waited without saying `pending` is pointed out (the row says less,
which is no mismatch), and under `fail`'s arguments a `fails(C)` part must fail with a `C`. Run it with `node --conditions=browser`, so Solid is its client build. A failure that only says there is no browser
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
node test/words.js                   # the words read from the code (MO-8v): the draft, --why, both checkers; rx-verify against a false mark
node test/words-audit.js             # MO-8w: the contexts a draft declares, the audit, rx-verify over the same file
node test/words-cases.js             # every case kept as data (test/words/): what a word must not cover, its honest twin, the facts found by running (--shard 1/2)
node test/generate.js                # generated declarations: drafted, found by the crate, kept, redrafted, and in the Vite plugin
node test/verify.js                  # rx-verify: uses(…) rows, missing exports, errors, probes, callbacks, --record and strict mode
```

`test/run.js` drives the server over LSP on a copy of `examples/shop` (Solid's
types from `ref/node_modules`, via `ref/scripts/solid-next.sh`): hover, go to
definition across modules, references, completion while typing (in code and in
markup), a parse error, a TypeScript type error and a crate diagnostic, each
placed on the `.rx`. `test/tsc.js` runs `rx-tsc` on the same copy.
