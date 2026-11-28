#!/bin/sh
# Kobalte 2 is its kobaltedev/kobalte `solid2` branch (`main` is the Solid 1 line, 0.13.x), built from source at the
# commit pinned in ref/KOBALTE, against the Solid that ref/SOLID_NEXT pins (ref/scripts/solid-next.sh builds it). The
# checkout lives beside this repository (../kobalte, next to ../solid-next), or at $KOBALTE; Solid at $SOLID_NEXT.
#   sh ref/scripts/kobalte.sh            check out the pinned commit and build @kobalte/core and @kobalte/utils
#   sh ref/scripts/kobalte.sh --latest   move the pin to solid2's HEAD first
# Kobalte's own install takes Solid from npm (its catalog); here solid-js, @solidjs/web, @solidjs/signals and the
# compiler its build runs (unplugin-solid's @solidjs/compiler) are overridden with links to the pinned checkout, so a
# package that links Kobalte (examples/rx-packages, bench) resolves one Solid from Kobalte's files and its own. The two
# overridden files (pnpm-workspace.yaml, pnpm-lock.yaml) are restored before each checkout.
set -e
HERE=$(cd "$(dirname "$0")/.." && pwd)
DIR=${KOBALTE:-$HERE/../../kobalte}
SOLID=$(cd "${SOLID_NEXT:-$HERE/../../solid-next}" && pwd)
BRANCH=${KOBALTE_BRANCH:-solid2}
[ -d "$SOLID/packages/solid/dist" ] || { echo "no built Solid at $SOLID: run ref/scripts/solid-next.sh first" >&2; exit 1; }
[ -d "$DIR/.git" ] || git clone --branch "$BRANCH" https://github.com/kobaltedev/kobalte "$DIR"
if [ "$1" = "--latest" ]; then
  git -C "$DIR" fetch -q origin "$BRANCH"
  git -C "$DIR" rev-parse FETCH_HEAD > "$HERE/KOBALTE"
fi
PIN=$(cat "$HERE/KOBALTE")
git -C "$DIR" checkout -q -- pnpm-workspace.yaml pnpm-lock.yaml 2>/dev/null || true
git -C "$DIR" cat-file -e "$PIN^{commit}" 2>/dev/null || git -C "$DIR" fetch -q origin "$PIN"
git -C "$DIR" checkout -q "$PIN"
cd "$DIR"
node -e '
const fs = require("fs"), [solid] = process.argv.slice(1), f = "pnpm-workspace.yaml";
const pin = { "solid-js": "solid", "@solidjs/web": "web", "@solidjs/signals": "signals", "@solidjs/compiler": "compiler" };
let y = fs.readFileSync(f, "utf8");
for (const n of Object.keys(pin)) y = y.replace(new RegExp(`^  "?${n.replace(/[/@.]/g, "\\$&")}"?: .*\\n`, "gm"), "");
if (!/^overrides:$/m.test(y)) throw new Error("pnpm-workspace.yaml has no overrides block");
y = y.replace(/^overrides:\n/m, "overrides:\n" + Object.entries(pin).map(([n, p]) => `  "${n}": "link:${solid}/packages/${p}"\n`).join(""));
fs.writeFileSync(f, y);' "$SOLID"
pnpm install --no-frozen-lockfile --ignore-scripts --filter "@kobalte/core..."
pnpm --filter @kobalte/utils run build
pnpm --filter @kobalte/core run build
echo "kobalte @ $(git rev-parse --short HEAD) built in $DIR against solid $(git -C "$SOLID" rev-parse --short HEAD)"
