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
 *  Where node_modules is itself a link (a benchmark task with an install of its own, `linked`), preserved paths would
 *  give a router two identities (one through the link, one Node's real path); there Solid's packages are made external
 *  to the server build instead, which is what an install from npm gets for them. (Not everywhere: under a dev server
 *  Solid's plugin keeps the runtime in Vite's graph on purpose, compiler/test/runtime-resolve.mjs.) */
export const SOLID_PACKAGES = ["solid-js", "@solidjs/web", "@solidjs/signals", "@solidjs/universal"];
export const linkedSolid = (text, linked = false) => /preserveSymlinks|ssr: \{ external:/.test(text) ? text
  : text.replace("defineConfig({", linked ? `defineConfig({ ssr: { external: ${JSON.stringify(SOLID_PACKAGES)} },` : "defineConfig({ resolve: { preserveSymlinks: true },");
