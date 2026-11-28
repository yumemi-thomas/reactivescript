#!/bin/sh
# both modes, for the rewritten packages and (BASELINE=1) the published originals: results as JSON in .results/
mkdir -p .results
for b in "" 1; do for m in test ssr; do
  rm -rf node_modules/.vitest-cache   # vitest keeps what it transformed by file and config: the two runs are the same files
  BASELINE=$b npx vitest run --mode $m --reporter=json --outputFile=.results/${b:-0}-$m.json >/dev/null 2>.results/${b:-0}-$m.err
done; done
node summary.mjs "$@"
