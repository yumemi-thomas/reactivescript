// A project's `.rx` modules in a TypeScript program (spec/13 TY-1a), as tsrs reads it. A module `x.rx` is its projection
// (TY-1c), a file `x.rx.tsx` that exists only here: an import of `./x.rx` finds it where TypeScript adds its extensions,
// and where it does not (node16, a package's `exports`) it asks for `x.d.rx.ts`, which hands the projection on. A JS
// module typed only by its `.d.rx` is typed by the `.d.ts` that stands for (TY-4b). What TypeScript says of a projection
// is placed on the `.rx` through the crate's mappings, by the rules the editor's are (Volar's source map).
const fs = require("node:fs");
const path = require("node:path");
const { SourceMap } = require("@volar/source-map");
const { Checker, plain, ordered } = require("./checker.js");
const { analysis, mappingsOf, isModule, isDeclaration } = require("./index.js");
const { virtualText, virtualDir } = require("./declarations.js");

const TSX = ".rx.tsx", ARBITRARY = ".d.rx.ts";
const isFile = f => { try { return fs.statSync(f).isFile(); } catch { return false; } };
/** The `.rx` module a projection's file stands for. */
const moduleOf = p => p.endsWith(TSX) && isModule(p.slice(0, -4)) && isFile(p.slice(0, -4)) ? p.slice(0, -4) : undefined;
const shimOf = p => p.endsWith(ARBITRARY) ? (f => isModule(f) && isFile(f) ? f : undefined)(p.slice(0, -ARBITRARY.length) + ".rx") : undefined;

/** The disk with the projections and the `.d.ts` files a `.d.rx` stands for. `text`: a module's text where it is not the
 *  disk's (the editor's open documents). */
function overlay(text = f => fs.readFileSync(f, "utf8")) {
  return {
    file: p => moduleOf(p) || shimOf(p) || virtualText(p) !== null ? true : undefined,
    dir: p => virtualDir(p) ? true : undefined,
    read: p => {
      const m = moduleOf(p); if (m) return analysis(m, text(m)).code ?? "";
      const s = shimOf(p); if (s) { const from = JSON.stringify("./" + path.basename(s) + ".tsx"); return `export * from ${from};\nexport { default } from ${from};\n`; }
      return virtualText(p) ?? undefined;
    },
    // a folder is seen with each `.rx` beside its projection: what the `include` globs read
    list: p => {
      let entries; try { entries = fs.readdirSync(p, { withFileTypes: true }); } catch { return undefined; }
      if (!entries.some(e => e.name.endsWith(".rx"))) return undefined;
      const files = [], directories = [], symlinks = [];
      for (const e of entries) {
        let d = e.isDirectory(), f = e.isFile();
        if (e.isSymbolicLink()) { symlinks.push(e.name); try { const s = fs.statSync(path.join(p, e.name)); d = s.isDirectory(); f = s.isFile(); } catch { /* broken */ } }
        if (d) directories.push(e.name); else if (f) { files.push(e.name); if (e.name.endsWith(".rx")) files.push(e.name + ".tsx"); }
      }
      return { files, directories, symlinks: symlinks.length ? symlinks : undefined };
    },
  };
}

/** The tsconfig.json of a project with `.rx` modules in it, as tsrs reads it: `include` and `files` name the `.rx`
 *  themselves, which TypeScript's own reading passes over, so the globs are read again over the folder as `overlay` shows
 *  it. @returns {{ options, roots: string[], declarations: string[], references, errors }} `roots`: the program's files
 *  (a projection for each module); `declarations`: the `.d.rx` the project names. */
function readConfig(checker, file) {
  const own = checker.api.parseConfigFile(file);
  const { include, exclude, files } = own.raw ?? {};
  const rx = p => typeof p === "string" && p.endsWith(".rx") ? p + ".tsx" : p;
  const spec = { ...(Array.isArray(files) ? { files: files.map(rx) } : {}), ...(Array.isArray(include) ? { include: include.map(rx) } : {}), ...(Array.isArray(exclude) ? { exclude: exclude.map(rx) } : {}),
    compilerOptions: { allowJs: own.options.allowJs, resolveJsonModule: own.options.resolveJsonModule, ...(own.options.outDir ? { outDir: own.options.outDir } : {}), ...(own.options.declarationDir ? { declarationDir: own.options.declarationDir } : {}) } };
  const all = checker.api.parseJsonConfigFileContent(spec, { configFileName: file });
  const names = all.fileNames.map(f => f.endsWith(TSX) && isFile(f.slice(0, -4)) ? f.slice(0, -4) : f);
  const roots = names.filter(f => !isDeclaration(f)).map(f => isModule(f) ? f + ".tsx" : f);
  // "no inputs were found" (18003) is the first reading's, which cannot see the `.rx`
  const errors = own.errors.filter(e => !(e.code === 18003 && names.length));
  return { options: own.options, roots, declarations: names.filter(isDeclaration), references: own.projectReferences ?? [], errors, raw: own.raw };
}

/** A diagnostic of a projection, on the module it is of; undefined where the projection wrote what the `.rx` does not say
 *  (as the editor drops it); any other diagnostic as it is. */
const maps = new Map();
function placed(d) {
  const m = d.file === undefined ? undefined : moduleOf(d.file);
  const related = d.related.map(placed).filter(Boolean);
  if (!m) return related.length === d.related.length && related.every((r, i) => r === d.related[i]) ? d : { ...d, related };
  const a = analysis.last(m);
  if (!a) return undefined;
  if (maps.get(m)?.of !== a.result) maps.set(m, { of: a.result, map: new SourceMap(mappingsOf(a.result)), lines: lineStarts(a.text) });
  const { map, lines } = maps.get(m);
  for (const [s, e] of map.toSourceRange(d.start, d.start + d.length, true, data => !!data.verification)) {
    const at = position(lines, s);
    return { ...d, file: m, start: s, length: e - s, line: at.line, column: at.column, end: position(lines, e), related };
  }
  return undefined;
}
function lineStarts(text) { const out = [0]; for (let i = 0; i < text.length; i++) { const c = text.charCodeAt(i); if (c === 10 || (c === 13 && text.charCodeAt(i + 1) !== 10)) out.push(i + 1); } return out; }
function position(lines, at) { let lo = 0, hi = lines.length - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (lines[m] <= at) lo = m; else hi = m - 1; } return { line: lo + 1, column: at - lines[lo] }; }

/** What `tsc` reports for a program, in its order: the options' errors, the syntax errors, and where there are none the
 *  program's, the globals', the types' (and the declarations', where it writes them). */
function diagnosticsOf(program, options, configErrors = []) {
  const out = [...configErrors];
  const syntax = program.getSyntacticDiagnostics();
  out.push(...syntax);
  if (!syntax.length) {
    out.push(...program.getProgramDiagnostics(), ...program.getGlobalDiagnostics(), ...program.getSemanticDiagnostics());
    if ((options.declaration || options.composite) && !options.noEmit) out.push(...program.getDeclarationDiagnostics());
  }
  return ordered(out.map(plain).map(placed).filter(Boolean));
}

module.exports = { Checker, overlay, readConfig, placed, diagnosticsOf, isFile };
