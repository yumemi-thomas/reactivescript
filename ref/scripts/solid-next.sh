#!/bin/sh
# ref/ runs on Solid 2.0 built from source, at the commit pinned in ref/SOLID_NEXT. The checkout lives beside this
# repository (../solid-next), or at $SOLID_NEXT.
#   sh ref/scripts/solid-next.sh            check out the pinned commit and build what ref/ links
#   sh ref/scripts/solid-next.sh --latest   move the pin to main's HEAD first
# The pin is fetched by its hash, so it builds whichever branch it is on. $SOLID_BRANCH (default main) is the branch a
# new checkout starts on and --latest follows: `SOLID_BRANCH=<branch> sh ref/scripts/solid-next.sh --latest`.
set -e
HERE=$(cd "$(dirname "$0")/.." && pwd)
DIR=${SOLID_NEXT:-$HERE/../../solid-next}
BRANCH=${SOLID_BRANCH:-main}
[ -d "$DIR/.git" ] || git clone --branch "$BRANCH" https://github.com/solidjs/solid "$DIR"
if [ "$1" = "--latest" ]; then
  git -C "$DIR" fetch -q origin "$BRANCH"
  git -C "$DIR" rev-parse FETCH_HEAD > "$HERE/SOLID_NEXT"
fi
PIN=$(cat "$HERE/SOLID_NEXT")
git -C "$DIR" cat-file -e "$PIN^{commit}" 2>/dev/null || git -C "$DIR" fetch -q origin "$PIN"
git -C "$DIR" checkout -q "$PIN"
cd "$DIR"
pnpm install --frozen-lockfile
for p in signals solid web universal; do (cd "packages/$p" && pnpm run build && pnpm run --if-present types); done   # types: the JSX types the types runner checks against
(cd packages/compiler && pnpm run build)          # the native Oxc compiler (needs a Rust toolchain)
echo "solid next @ $(git rev-parse --short HEAD) built in $DIR"
