// TY-6: each `.d.rx` checked against the JS module it declares. The checker trusts a `.d.rx` (MO-8b); this pass makes
// TypeScript confirm what types can confirm: that every declared export exists, that a `ref` parameter or result is an
// accessor in the real types, that a component takes the declared props, that a fn's real signature fits the declared
// one. The crate writes the check (`boundary`); this file has it type-checked (src/checker.js), beside the `.d.rx`, with the
// project's compiler options, and places each error on the declaration's line. Rows TypeScript cannot see (`pure`,
// `uses`, `pending`, `fails`) are not checked here.
const fs = require("node:fs");
const path = require("node:path");
const { boundary } = require("./rxc");
const { jsOf } = require("./beside.js");
const { asLibrary } = require("./checker.js");


/** The module a `.d.rx` declares, as an import from beside it: the JS module of the same name there, or, under a
 *  project's `rx-types/`, the package its path names. Undefined for an `.rx` module's signature (MO-9). */
function moduleOf(file) {
  const parts = path.resolve(file).split(path.sep), at = parts.lastIndexOf("rx-types");
  if (at >= 0 && at < parts.length - 1) return parts.slice(at + 1).join("/").slice(0, -".d.rx".length);
  const js = jsOf(path.resolve(file));
  return js ? "./" + path.basename(js) : undefined;
}
const inPackage = f => /[\\/]node_modules[\\/]/.test(f) || (fs.existsSync(f) && /[\\/]node_modules[\\/]/.test(fs.realpathSync(f)));
/** A resolved file as an import from `dir`: relative, with the extension an import of its JavaScript has (`lib.d.ts`
 *  is `./lib.js`), so every module resolution TypeScript has accepts it. */
function importFrom(dir, file) {
  const js = file.replace(/\.d\.(m|c)?ts$/, (_, x) => `.${x ?? ""}js`).replace(/\.(m|c)?tsx?$/, (_, x) => `.${x ?? ""}js`);
  let rel = path.relative(dir, js).split(path.sep).join("/");
  if (!rel.startsWith(".")) rel = "./" + rel;
  return rel;
}
/** MO-8, TY-6: what the boundary check covers — each declaration the compiler consumed (`uses`: `{ file, importer,
 *  spec }` from the crate's analysis), checked against the module its importer's import resolves to, and each `.d.rx`
 *  the project names itself (`named`), against the module beside it. A declaration nothing imports and the project
 *  does not name is not the program's. */
function boundaryUnits(checker, uses, named, options) {
  const out = [], seen = new Set();
  const add = (file, module, why) => { const k = `${path.resolve(file)}\0${module}`; if (seen.has(k)) return; seen.add(k); out.push({ file, module, why }); };
  for (const u of uses) {
    const r = checker.resolve(u.spec, path.dirname(u.importer), options);
    if (!r) continue;   // nothing TypeScript can type: the .d.rx stands for it (TY-4b)
    add(u.file, importFrom(path.dirname(u.file), r.resolvedFileName), u);
  }
  for (const f of named) { const m = moduleOf(f); if (m) add(f, m); }
  return out;
}

/** @param {import("./checker.js").Checker} checker
 *  @param {{ uses?: { file: string, importer: string, spec: string }[], named?: string[] }} scope what to check: the
 *  declarations the program consumed and the ones the project names
 *  @returns {{ file: string, line: number, name: string, message: string }[]} */
function checkBoundaries(checker, options, scope) {
  const found = [];
  const units = [];
  const taken = new Set();
  for (const d of boundaryUnits(checker, scope.uses ?? [], scope.named ?? [], options)) {
    const r = boundary(d.file, d.module);
    if (r.error) { if (!found.some(f => f.file === d.file && f.message === r.error)) found.push({ file: d.file, line: 1, name: "", message: r.error }); continue; }
    const beside = path.dirname(d.file), module = checker.resolve(d.module, beside, options)?.resolvedFileName;
    // a module with no TypeScript types of its own is typed by its .d.rx (TY-4b): there is nothing to check it against
    if (!module || /\.(m?js|jsx)$/.test(module) || require("./declarations.js").isVirtual(module)) continue;
    // one declaration checked against two installed copies is two files
    const stem = path.basename(d.file).replace(/\.d\.rx$/, ".rx-boundary");
    let name = `${stem}.ts`;
    for (let n = 2; taken.has(path.join(beside, name)); n++) name = `${stem}-${n}.ts`;
    taken.add(path.join(beside, name));
    // MO-8o: a package a row names (`import("@solid-primitives/utils").Many<T>`) is the one the declared library imports:
    // resolved from where that library is installed (nested under it or hoisted beside the app, the same), then from
    // beside the declaration. A relative name is the declaration's own (`import("./table.js")`)
    const lib = inPackage(module) ? module : undefined;
    units.push({ ...d, ...(lib ? asLibrary(checker, { name, code: r.code, beside, lib }, options) : { file: path.join(beside, name), resolutions: [] }), decl: d.file, code: r.code, checks: r.checks });
  }
  if (!units.length) return found;
  const dgsOf = new Map(units.map(u => [u.file, []]));
  for (const dg of checker.check({ roots: units.map(u => u.file), files: new Map(units.map(u => [u.file, u.code])), options: { ...options, noEmit: true }, resolutions: units.flatMap(u => u.resolutions) })) dgsOf.get(dg.file)?.push(dg);
  for (const u of units) {
    const dgs = dgsOf.get(u.file).map(dg => ({ c: u.checks.find(x => x.at === dg.line), code: dg.code, text: dg.message.replace(/\n/g, "\n  ") }));
    const via = u.why && units.filter(x => x.decl === u.decl).length > 1 ? ` (as ${path.basename(u.why.importer)} imports ${u.why.spec})` : "";
    // MO-8o, TY-6f: a field of the record after a props' type is held on its own lines: what such a line finds is the
    // field's (TS2322, said once a prop, the name before the type), and anything else on it is the props' type, which
    // the row's own check says where it fails.
    const rowBad = new Set(dgs.filter(d => d.c && !d.c.overlay).map(d => d.c.line));
    const said = new Set();
    for (const { c, code, text } of dgs) {
      if (c?.overlay) {
        const k = `${c.line}\0${c.prop}`;
        if (said.has(k) || (code !== 2322 && rowBad.has(c.line))) continue;
        said.add(k);
        found.push({ file: u.decl, line: c.line, name: c.name, message: (code !== 2322 ? text : c.overlay === "has" ? c.says : `${c.says}\n  ${text}`) + via });
        continue;
      }
      found.push(c ? { file: u.decl, line: c.line, name: c.name, message: text + via } : { file: u.decl, line: 1, name: "", message: `in a type the declaration states: ${text}${via}` });
    }
  }
  return found;
}

module.exports = { checkBoundaries, moduleOf };
