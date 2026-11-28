// A package.json installed somewhere other than its folder (a test's workspace, bench/.out/…): each `file:` dependency
// it names — Solid linked from the pin beside the repository, `file:../../../solid-next/packages/solid` — is made
// relative to where it is installed, so it names the same folder there.
//   relinked(text, from, to): the package.json's text, its `file:` specs re-based from folder `from` to folder `to`
import path from "node:path";
export function relinked(text, from, to) {
  const j = JSON.parse(text);
  for (const k of ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies", "overrides"]) for (const [n, v] of Object.entries(j[k] ?? {})) {
    if (typeof v !== "string" || !v.startsWith("file:") || path.isAbsolute(v.slice(5))) continue;
    j[k][n] = "file:" + path.relative(to, path.resolve(from, v.slice(5)));
  }
  return JSON.stringify(j, null, 2) + "\n";
}

/** A Vite config, as a test or the benchmark installs it beside the pin's Solid. Solid is linked from ../solid-next, so
 *  its real path is outside any node_modules, and Vite keeps a linked dependency in its server bundle, beside what Node
 *  loads from node_modules (the runtime, a router) on the installed copy: two Solids, and `provide` finds no owner. An app
 *  installed from npm has Solid in node_modules. `resolve.preserveSymlinks` keeps every path as that install has it.
 *  (A benchmark task with an install of its own, whose node_modules is a link, once had Solid's packages made external
 *  to the server build instead: preserved paths gave its router two identities. That was TanStack Start's task, on an
 *  install of its own while Start's rc.11 did not build; on rc.12 it is on the workspace's, and the one task still with
 *  an install of its own, router-rx-routes, holds only a generator and a plugin there. Not everywhere: under a dev
 *  server Solid's plugin keeps the runtime in Vite's graph on purpose, compiler/test/runtime-resolve.mjs.) */
export const linkedSolid = text => /preserveSymlinks/.test(text) ? text : text.replace("defineConfig({", "defineConfig({ resolve: { preserveSymlinks: true },");
