#!/bin/sh
# Everything the suites need, from a fresh clone: Solid built at the pin beside this repository (../solid-next, or
# $SOLID_NEXT), ref/'s links to it, the crate (its Node-API binding and the rxc binary), the runtime's build, the
# language server's packages, and Playwright's Chromium for the browser suites.
#   sh scripts/setup.sh
# Needs Node 22+, pnpm, a Rust toolchain, git and the network. Safe to run again: each step redoes only its own build.
# Then run the suites as CONTRIBUTING.md lists them.
set -e
ROOT=$(cd "$(dirname "$0")/.." && pwd)
step() { printf '\n== %s\n' "$1"; }

for tool in node pnpm cargo git; do
  command -v "$tool" >/dev/null 2>&1 || { echo "setup: $tool is not installed (Node 22+, pnpm, a Rust toolchain and git are needed)"; exit 1; }
done

step "Solid at ref/SOLID_NEXT"
sh "$ROOT/ref/scripts/solid-next.sh"

step "ref/ (links ../solid-next)"
(cd "$ROOT/ref" && npm install)

step "compiler: the Node-API binding, rxc, and the WebAssembly build the language server and rx-tsc read"
(cd "$ROOT/compiler" && npm install && npm run build && cargo build --release)
rustup target list --installed 2>/dev/null | grep -q wasm32-unknown-unknown || rustup target add wasm32-unknown-unknown
(cd "$ROOT/compiler" && cargo build --lib --release --target wasm32-unknown-unknown && cargo build -p rx-words --release --target wasm32-unknown-unknown)

step "runtime"
(cd "$ROOT/runtime" && npm install && npm run build)

step "language server"
(cd "$ROOT/tooling/rx-language-server" && npm install)

step "Chromium for the browser suites (ref ssr, compiler/test/*)"
if [ -n "$PLAYWRIGHT_BROWSERS_PATH" ] && [ -d "$PLAYWRIGHT_BROWSERS_PATH" ]; then
  echo "using the browsers already in $PLAYWRIGHT_BROWSERS_PATH"
else
  (cd "$ROOT/compiler" && npx playwright install chromium)
fi

printf '\nsetup done. The suites: see CONTRIBUTING.md, "Running the suite".\n'
