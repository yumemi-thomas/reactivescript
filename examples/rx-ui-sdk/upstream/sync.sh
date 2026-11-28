#!/bin/sh
# Installs the built package in a copy of the UI SDK repository ($1), with the alias UI=rx turns on.
here=$(cd "$(dirname "$0")/.." && pwd); ui=$1
d=$ui/node_modules/@rx-ui-sdk/solid; rm -rf "$d"; mkdir -p "$d"; cp -R "$here/dist" "$here/facade" "$here/package.json" "$d/"
mkdir -p "$ui/node_modules/@ui-sdk"; ln -sfn ../../packages/core "$ui/node_modules/@ui-sdk/core"
r=$ui/node_modules/@reactivescript/runtime; rm -rf "$r"; mkdir -p "$r"; cp -R "$here/node_modules/@reactivescript/runtime/" "$r/"
cp "$here/upstream/vite.config.ts" "$ui/apps/playground/vite.config.ts"
rm -rf "$ui/node_modules/.vite" "$ui/apps/playground/node_modules/.vite"
