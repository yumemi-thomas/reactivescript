# rx-packages

Solid 2 packages rewritten in `.rx`, to learn what the language still lacks. Read `REPORT.md`.

    npm install --ignore-scripts --legacy-peer-deps   # the originals and what runs the tests (no install scripts)
    node build.mjs                                    # every package, with rx-lib
    node run.mjs; SSR=1 node run.mjs                  # the originals' tests, both ways
    node live.mjs; node check.mjs; node size.mjs; node report.mjs
