#!/bin/sh
# ref/ runs on Solid 2.0's `next` branch built from source — the branch the async rules come from — at the commit
# pinned in ref/SOLID_NEXT. The checkout lives beside this repository (../solid-next), or at $SOLID_NEXT.
#   sh ref/scripts/solid-next.sh            check out the pinned commit and build what ref/ links
#   sh ref/scripts/solid-next.sh --latest   move the pin to main's HEAD first
set -e
HERE=$(cd "$(dirname "$0")/.." && pwd)
DIR=${SOLID_NEXT:-$HERE/../../solid-next}
# `next` was merged into `main` when 2.0 shipped and no longer exists, so the pin is fetched by commit.
[ -d "$DIR/.git" ] || git clone https://github.com/solidjs/solid "$DIR"
if [ "$1" = "--latest" ]; then git -C "$DIR" fetch -q origin main && git -C "$DIR" rev-parse origin/main > "$HERE/SOLID_NEXT"; fi
PIN=$(cat "$HERE/SOLID_NEXT")
git -C "$DIR" cat-file -e "$PIN^{commit}" 2>/dev/null || git -C "$DIR" fetch -q origin "$PIN"
git -C "$DIR" checkout -q "$PIN"
cd "$DIR"
pnpm install --frozen-lockfile
for p in signals solid web universal; do (cd "packages/$p" && pnpm run build && pnpm run --if-present types); done   # types: the JSX types the types runner checks against
(cd packages/compiler && pnpm run build)          # the native Oxc compiler (needs a Rust toolchain)
echo "solid next @ $(git rev-parse --short HEAD) built in $DIR"
