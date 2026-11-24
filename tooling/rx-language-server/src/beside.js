// MO-8 (revised 2026-11-22): which `.d.rx` declares a JS module beside it, the same names in the same order as the
// crate's `modules::beside_declaration` (`declaration_names`). `./x.js` and `./x.ts` are declared by `x.d.rx`; every
// other JS or TypeScript module — `./x.mjs`, `./x.cjs`, `./x.jsx`, `./x.tsx`, `./x.mts`, `./x.cts` — by the file's whole
// name first (`x.tsx.d.rx`), then by `x.d.rx`. rx-tsc's declarations, the boundary check, strict mode's inputs and
// rx-verify all go through here; `test/tsc.js` holds the two lists against each other.
const fs = require("node:fs");
const path = require("node:path");

const NAMED = [".mjs", ".cjs", ".jsx", ".tsx", ".mts", ".cts"];                       // whose whole name may name their declaration
const JS = [".js", ".mjs", ".cjs", ".jsx", ".ts", ".tsx", ".mts", ".cts"];   // a declaration's `x.d.rx` stands for `x` with one of these, first that exists

/** The names a JS module's declaration may have, in the order they are looked for (the crate's `declaration_names`). */
function declarationNames(js) {
  const ext = NAMED.find(x => js.endsWith(x));
  return ext ? [js + ".d.rx", js.slice(0, -ext.length) + ".d.rx"] : [js.replace(/\.(js|ts)$/, "") + ".d.rx"];
}
/** The `.d.rx` that declares the JS module `js` (a path), or undefined when none exists beside it. */
function declarationOf(js, exists = fs.existsSync) {
  const names = declarationNames(js);
  return names.find(n => exists(n));
}
/** The JS module the `.d.rx` at `file` declares beside it (a path), or undefined (an `.rx` module's signature, MO-9). */
function jsOf(file, exists = fs.existsSync) {
  const base = file.slice(0, -".d.rx".length);
  if (NAMED.some(x => base.endsWith(x)) && exists(base)) return base;               // `old.cjs.d.rx` → `old.cjs`
  return JS.map(x => base + x).find(f => exists(f) && declarationOf(f, exists) === file);   // `old.d.rx` → `old.cjs`, unless `old.cjs.d.rx` is its own
}
/** MO-8k, MO-14a: a project's folder, the nearest at or above `from` whose package.json has a name (the crate's `project_top`). */
function projectTop(from) {
  for (let dir = from; ; dir = path.dirname(dir)) {
    try { const v = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8")); if (typeof v?.name === "string" && v.name) return dir; } catch { /* none here */ }
    if (path.dirname(dir) === dir) return dir;
  }
}
module.exports = { projectTop, declarationOf, declarationNames, jsOf, NAMED, JS };
