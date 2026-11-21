# Contributing

ReactiveScript is an early-stage language design. The spec is the product;
the reference implementation in `ref/` exists to check it.

## How claims are made

Every behaviour claim is either a numbered rule (`E-n`, `H-n`, `AC-n`, …;
see the README's *Rule IDs*) or a scenario under `scenarios/`
(program → actions → frames → verdict). A change to the language comes
with the rule it adds or amends and at least one scenario that shows it.
`scenarios/TEMPLATE.md` is the starting point for a new one.

Decisions recorded in the spec as *ruled* with a date are settled; please
open an issue rather than a PR to revisit one. Decisions marked *taken by
default* are still open to change.

Semantics follow Solid 2.0 (`solidjs/solid@next`, pinned in
`ref/SOLID_NEXT`). An open question in Solid's
`packages/signals/docs/RULES-FUNDAMENTALS.md` is open here too. Where this
spec diverges from Solid, the divergence is recorded as a `DV-n` in
`spec/05-holds.md` or `spec/10-server.md`.

## Running the suite

Solid is built from its `main` branch at the pinned commit (needs Node 22+,
pnpm, a Rust toolchain and the network). `scripts/setup.sh` does every step
from a fresh clone: Solid beside this repository (`../solid-next`), `ref/`'s
links to it, the crate (its Node-API binding, `rxc` and the WebAssembly build the language server reads), the runtime, the
language server, and Playwright's Chromium for the browser suites.

```sh
sh scripts/setup.sh            # or, for ref/ alone: sh ref/scripts/solid-next.sh && (cd ref && npm install)
cd ref
npm test                       # interpreter over every scenario
npm run oracle                 # the same scenarios lowered onto Solid
npm run compiled               # compiled modules
npm run ssr                    # streamed SSR + hydration in Chromium
npm run types                  # TSX projection checked by TypeScript
npm run crate                  # the Rust crate against ref/ (also --spa, --whole-program, --lower, --project)
```

The crate, the plugin, the runtime and the tooling, from the repository's root:

```sh
(cd compiler && cargo test --release)
for t in vite kobalte formisch ssr-router start vite-types vite-gate ssr-held drafts confined; do node compiler/test/$t.mjs; done
# with a Solid plugin that has context.resolve and Frontend.buildStart (compiler/README.md):
for t in vite-hosts vite-watch; do SOLID_VITE_PLUGIN=<checkout> node compiler/test/$t.mjs; done
(cd tooling/tree-sitter-rx && pnpm install && pnpm run generate && pnpm test && pnpm run parse:repo)   # a new form in .rx or .d.rx needs its grammar
(cd runtime && node test.mjs)
(cd tooling/rx-language-server && npm test)
node bench/run.mjs --check     # the representative tasks (bench/README.md): real libraries, good programs and one-line mistakes
```

`ref/README.md` describes each runner. Please run the suite before opening a
pull request and note any scenario whose result changed.

## Issues

Bug reports and questions are welcome as GitHub issues. For a semantics
question, a small `.rx` program and the frames you expected is the most
useful form.
