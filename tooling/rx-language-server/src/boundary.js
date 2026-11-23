// TY-6: each `.d.rx` checked against the JS module it declares. The checker trusts a `.d.rx` (MO-8b); this pass makes
// TypeScript confirm what types can confirm: that every declared export exists, that a `ref` parameter or result is an
// accessor in the real types, that a component takes the declared props, that a fn's real signature fits the declared
// one. The crate writes the check (`boundary`); this file type-checks it in memory, beside the `.d.rx`, with the
// project's compiler options, and places each error on the declaration's line. Rows TypeScript cannot see (`pure`,
// `uses`, `pending`, `fails`) are not checked here.
const fs = require("node:fs");
const path = require("node:path");
const { boundary } = require("./rxc");
const { jsOf } = require("./beside.js");


/** The module a `.d.rx` declares, as an import from beside it: the JS module of the same name there, or, under a
 *  project's `rx-types/`, the package its path names. Undefined for an `.rx` module's signature (MO-9). */
function moduleOf(file) {
  const parts = path.resolve(file).split(path.sep), at = parts.lastIndexOf("rx-types");
  if (at >= 0 && at < parts.length - 1) return parts.slice(at + 1).join("/").slice(0, -".d.rx".length);
  const js = jsOf(path.resolve(file));
  return js ? "./" + path.basename(js) : undefined;
}
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
function boundaryUnits(ts, uses, named, options, host, cache) {
  const out = [], seen = new Set();
  const add = (file, module, why) => { const k = `${path.resolve(file)}\0${module}`; if (seen.has(k)) return; seen.add(k); out.push({ file, module, why }); };
  for (const u of uses) {
    const r = ts.resolveModuleName(u.spec, u.importer, options, host, cache).resolvedModule;
    if (!r) continue;   // nothing TypeScript can type: the .d.rx stands for it (TY-4b)
    add(u.file, importFrom(path.dirname(u.file), r.resolvedFileName), u);
  }
  for (const f of named) { const m = moduleOf(f); if (m) add(f, m); }
  return out;
}

/** The `.d.rx` files that declare a JS module beside them, in the directories of the program's `.rx` modules. */
function declarations(rxFiles) {
  const out = [];
  for (const dir of new Set(rxFiles.map(f => path.dirname(f)))) {
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith(".d.rx")) continue;
      const js = jsOf(path.join(dir, f));
      if (js) out.push({ file: path.join(dir, f), module: "./" + path.basename(js) });   // a .d.rx with no JS beside it is an .rx module's signature (MO-9)
    }
  }
  // MO-8k: a project's declarations for packages, `rx-types/<spec>.d.rx` in a module's directory or one above it
  const seen = new Set();
  for (let dir of new Set(rxFiles.map(f => path.resolve(path.dirname(f))))) {
    for (;;) {
      const root = path.join(dir, "rx-types");
      if (!seen.has(root) && fs.existsSync(root) && fs.statSync(root).isDirectory()) {
        seen.add(root);
        const walk = d => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) walk(f); else if (e.name.endsWith(".d.rx")) out.push({ file: f, module: path.relative(root, f).slice(0, -".d.rx".length).split(path.sep).join("/") }); } };
        walk(root);
      }
      const up = path.dirname(dir); if (up === dir) break; dir = up;
    }
  }
  return out;
}

/** @param {typeof import("typescript")} ts
 *  @param {{ uses?: { file: string, importer: string, spec: string }[], named?: string[] }} [scope] what to check: the
 *  declarations the program consumed and the ones the project names; without it, every `.d.rx` beside `rxFiles` (the
 *  older, directory-wide reading)
 *  @returns {{ file: string, line: number, name: string, message: string }[]} */
function checkBoundaries(ts, rxFiles, options, scope) {
  const found = [];
  const units = [];
  const host = ts.createCompilerHost(options);
  const { resolutions, resolveUnitsAsLibrary } = require("./library-resolve.js");
  const list = scope ? boundaryUnits(ts, scope.uses ?? [], scope.named ?? [], options, host, resolutions(ts, options, host)) : declarations(rxFiles);
  const taken = new Set();
  for (const d of list) {
    const r = boundary(d.file, d.module);
    if (r.error) { if (!found.some(f => f.file === d.file && f.message === r.error)) found.push({ file: d.file, line: 1, name: "", message: r.error }); continue; }
    // one declaration checked against two installed copies is two files
    let at = d.file.replace(/\.d\.rx$/, ".rx-boundary.ts");
    for (let n = 2; taken.has(path.resolve(at)); n++) at = d.file.replace(/\.d\.rx$/, `.rx-boundary-${n}.ts`);
    taken.add(path.resolve(at));
    units.push({ ...d, at, code: r.code, checks: r.checks });
  }
  if (!units.length) return found;
  const byPath = new Map(units.map(u => [path.resolve(u.at), u]));
  const { getSourceFile, fileExists, readFile } = host;
  host.getSourceFile = (f, lang, ...rest) => byPath.has(path.resolve(f)) ? ts.createSourceFile(f, byPath.get(path.resolve(f)).code, lang) : getSourceFile.call(host, f, lang, ...rest);
  host.fileExists = f => byPath.has(path.resolve(f)) || fileExists.call(host, f);
  host.readFile = f => byPath.has(path.resolve(f)) ? byPath.get(path.resolve(f)).code : readFile.call(host, f);
  // MO-8o: a package a row names (`import("@solid-primitives/utils").Many<T>`) is the one the declared library imports:
  // resolved from where that library is installed (nested under it or hoisted beside the app, the same), then from
  // beside the declaration. A relative name is the declaration's own (`import("./table.js")`)
  const libs = new Map(), cache = resolutions(ts, options, host);   // (made here: the units, which the host has now, are not in the one above)
  const inPackage = f => /[\\/]node_modules[\\/]/.test(f) || (fs.existsSync(f) && /[\\/]node_modules[\\/]/.test(fs.realpathSync(f)));
  for (const u of units) { const lib = ts.resolveModuleName(u.module, u.at, options, host, cache).resolvedModule?.resolvedFileName; if (lib && inPackage(lib)) libs.set(path.resolve(u.at), lib); }
  if (libs.size) resolveUnitsAsLibrary(ts, host, libs, cache);
  const program = ts.createProgram([...byPath.keys()], { ...options, noEmit: true }, host);
  for (const u of units) {
    const sf = program.getSourceFile(u.at);
    const typesOf = program.getSourceFile(u.at) && ts.resolveModuleName(u.module, u.at, options, host, cache).resolvedModule;
    // a module with no TypeScript types of its own is typed by its .d.rx (TY-4b): there is nothing to check it against
    if (!typesOf || /\.(m?js|jsx)$/.test(typesOf.resolvedFileName) || require("./declarations.js").isVirtual(typesOf.resolvedFileName)) continue;
    const dgs = [...program.getSyntacticDiagnostics(sf), ...program.getSemanticDiagnostics(sf)].map(dg => {
      const line = dg.start === undefined ? 0 : sf.getLineAndCharacterOfPosition(dg.start).line + 1;
      return { c: u.checks.find(x => x.at === line), code: dg.code, text: ts.flattenDiagnosticMessageText(dg.messageText, "\n  ") };
    });
    const via = u.why && units.filter(x => x.file === u.file).length > 1 ? ` (as ${path.basename(u.why.importer)} imports ${u.why.spec})` : "";
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
        found.push({ file: u.file, line: c.line, name: c.name, message: (code !== 2322 ? text : c.overlay === "has" ? c.says : `${c.says}\n  ${text}`) + via });
        continue;
      }
      found.push(c ? { file: u.file, line: c.line, name: c.name, message: text + via } : { file: u.file, line: 1, name: "", message: `in a type the declaration states: ${text}${via}` });
    }
  }
  return found;
}

module.exports = { checkBoundaries, declarations, moduleOf };
