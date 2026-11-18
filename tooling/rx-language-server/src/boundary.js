// TY-6: each `.d.rx` checked against the JS module it declares. The checker trusts a `.d.rx` (MO-8b); this pass makes
// TypeScript confirm what types can confirm: that every declared export exists, that a `ref` parameter or result is an
// accessor in the real types, that a component takes the declared props, that a fn's real signature fits the declared
// one. The crate writes the check (`boundary`); this file type-checks it in memory, beside the `.d.rx`, with the
// project's compiler options, and places each error on the declaration's line. Rows TypeScript cannot see (`pure`,
// `uses`, `holds`, `fails`) are not checked here.
const fs = require("node:fs");
const path = require("node:path");
const { boundary } = require("./rxc");

const JS = [".js", ".mjs", ".jsx", ".ts", ".tsx"];

/** The `.d.rx` files that declare a JS module beside them, in the directories of the program's `.rx` modules. */
function declarations(rxFiles) {
  const out = [];
  for (const dir of new Set(rxFiles.map(f => path.dirname(f)))) {
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith(".d.rx")) continue;
      const base = f.slice(0, -".d.rx".length);
      const js = JS.map(x => base + x).find(x => fs.existsSync(path.join(dir, x)) && !x.endsWith(".d.ts"));
      if (js) out.push({ file: path.join(dir, f), module: "./" + js });   // a .d.rx with no JS beside it is an .rx module's signature (MO-9)
    }
  }
  return out;
}

/** @param {typeof import("typescript")} ts @returns {{ file: string, line: number, name: string, message: string }[]} */
function checkBoundaries(ts, rxFiles, options) {
  const found = [];
  const units = [];
  for (const d of declarations(rxFiles)) {
    const r = boundary(d.file, d.module);
    if (r.error) { found.push({ file: d.file, line: 1, name: "", message: r.error }); continue; }
    units.push({ ...d, at: d.file.replace(/\.d\.rx$/, ".rx-boundary.ts"), code: r.code, checks: r.checks });
  }
  if (!units.length) return found;
  const byPath = new Map(units.map(u => [path.resolve(u.at), u]));
  const host = ts.createCompilerHost(options);
  const { getSourceFile, fileExists, readFile } = host;
  host.getSourceFile = (f, lang, ...rest) => byPath.has(path.resolve(f)) ? ts.createSourceFile(f, byPath.get(path.resolve(f)).code, lang) : getSourceFile.call(host, f, lang, ...rest);
  host.fileExists = f => byPath.has(path.resolve(f)) || fileExists.call(host, f);
  host.readFile = f => byPath.has(path.resolve(f)) ? byPath.get(path.resolve(f)).code : readFile.call(host, f);
  const program = ts.createProgram([...byPath.keys()], { ...options, noEmit: true }, host);
  for (const u of units) {
    const sf = program.getSourceFile(u.at);
    const typesOf = program.getSourceFile(u.at) && ts.resolveModuleName(u.module, u.at, options, host).resolvedModule;
    if (!typesOf || /\.(m?js|jsx)$/.test(typesOf.resolvedFileName)) {
      found.push({ file: u.file, line: 1, name: "", message: `${u.module} has no TypeScript types (a .d.ts beside it, or the package's): its declarations are not checked against it` });
      continue;
    }
    for (const dg of [...program.getSyntacticDiagnostics(sf), ...program.getSemanticDiagnostics(sf)]) {
      const line = dg.start === undefined ? 0 : sf.getLineAndCharacterOfPosition(dg.start).line + 1;
      const c = u.checks.find(x => x.at === line);
      const text = ts.flattenDiagnosticMessageText(dg.messageText, "\n  ");
      found.push(c ? { file: u.file, line: c.line, name: c.name, message: text } : { file: u.file, line: 1, name: "", message: `in a type the declaration states: ${text}` });
    }
  }
  return found;
}

module.exports = { checkBoundaries, declarations };
