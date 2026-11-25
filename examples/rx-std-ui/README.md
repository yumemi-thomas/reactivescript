# UI SDK's Toggle, Tabs and Dialog in `.rx`: an experiment

Three components of `@ui-sdk/solid` (Apache-2.0: `LICENSE`, `NOTICE`) in ReactiveScript over the unchanged
`@ui-sdk/core`. The verdict, numbers, bugs and blockers: [REPORT.md](REPORT.md). `src/` is the package, `dist/` what
`rx-lib` built, `facade/` what a `.tsx` app imports.

Both sides are 0.1.0-beta.17, built from source (vercel-labs/ui at d5c6249e), on Solid 2.0.3. Needed beside this repository's
built crate, runtime, `ref/` and language server: a copy `$UI` of that repository (`pnpm install --ignore-scripts`, Solid
replaced by 2.0.3 in its `node_modules`; `pnpm build` in `packages/core` and `packages/solid`), and here a `node_modules` as
`bench/`'s workspace has it, with `@solidjs/compiler`. Then:

    node install.mjs $UI && node build.mjs && sh upstream/sync.sh $UI
    node app/test.mjs                                     # this suite, both packages and the .rx app, Chromium
    node upstream/run.mjs $UI rx,toggle,tabs,dialog out.json specs/toggle specs/tabs specs/dialog specs/item-icon   # or: orig
    GREP="(a dialog|tabs)" RETRIES=0 node upstream/run.mjs $UI rx,toggle,tabs,dialog out.json specs/leaks
    sh upstream/no-registry.sh $UI                        # the leak gates without the runtime's bug 1 (then sync again)
    cp upstream/vitest.rx.config.ts $UI/packages/solid/   # the unit tests: UI=rx,toggle,tabs,dialog vitest run --config vitest.rx.config.ts …
    node measure.mjs [size|perf]; node check/run.mjs; node generate.mjs [-v] [--write]; node probe/run.mjs
