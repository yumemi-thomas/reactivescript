// MO-8 (revised 2026-11-21 after review): which `.d.rx` declares a JS module beside it, the same names in the same order as
// the crate's `modules::beside_declaration`. `./x.mjs`, `./x.cjs` and `./x.jsx` are declared by `x.mjs.d.rx`
// (`x.cjs.d.rx`, `x.jsx.d.rx`), the file's whole name, first, then by `x.d.rx`; `./x.js` and `./x.ts` by `x.d.rx`.
// rx-tsc's declarations, the boundary check, strict mode's inputs and rx-verify all go through here.
const fs = require("node:fs");

const NAMED = [".mjs", ".cjs", ".jsx"];                       // whose whole name may name their declaration
const JS = [".js", ".mjs", ".cjs", ".jsx", ".ts", ".tsx"];   // a declaration's `x.d.rx` stands for `x` with one of these, first that exists

/** The `.d.rx` that declares the JS module `js` (a path), or undefined when none exists beside it. */
function declarationOf(js, exists = fs.existsSync) {
  const ext = NAMED.find(x => js.endsWith(x));
  const names = ext ? [js + ".d.rx", js.slice(0, -ext.length) + ".d.rx"] : [js.replace(/\.(js|ts|tsx)$/, "") + ".d.rx"];
  return names.find(n => exists(n));
}
/** The JS module the `.d.rx` at `file` declares beside it (a path), or undefined (an `.rx` module's signature, MO-9). */
function jsOf(file, exists = fs.existsSync) {
  const base = file.slice(0, -".d.rx".length);
  if (NAMED.some(x => base.endsWith(x)) && exists(base)) return base;               // `old.cjs.d.rx` → `old.cjs`
  return JS.map(x => base + x).find(f => exists(f) && declarationOf(f, exists) === file);   // `old.d.rx` → `old.cjs`, unless `old.cjs.d.rx` is its own
}
module.exports = { declarationOf, jsOf, NAMED, JS };
