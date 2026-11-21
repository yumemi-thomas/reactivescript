#!/usr/bin/env node
// `rx-tsc`: TypeScript's own `tsc`, with `.rx` modules in the program (spec/13 TY-1a), for CI and the command line. It
// is Volar's tsc runner (the one `vue-tsc` uses) with the language server's `.rx` plugin, so the editor and the command
// line check the same projection. It takes tsc's arguments (`rx-tsc --noEmit`, `-p`, `--watch`) and reads the
// tsconfig.json's `include`, which must name the `.rx` files. Type errors are placed on the `.rx`.
//
// The crate's own diagnostics (parse errors, else the checker's, with their rules) are reported after TypeScript's, for
// every `.rx` module in the program: a module that does not parse has no projection, so TypeScript alone would pass it.
const path = require("node:path");
// TY-1d: `--rx-inputs <file>` writes, on exit, every file the run read (its content's hash, as read), every path it
// looked for and did not find, and every directory it listed (its names): the Vite front end's production gate is stale
// exactly when one of them is different now, whatever the mtimes say. Not tsc's flag.
const inputs = (() => {
  const at = process.argv.indexOf("--rx-inputs"); if (at < 0) return null;
  const out = process.argv[at + 1]; process.argv.splice(at, 2);
  return require("../src/inputs.js").record(out);
})();
const { runTsc } = require("@volar/typescript/lib/quickstart/runTsc");
const { rxLanguagePlugin, analyses, guideUrl } = require("../src/index.js");
const { checkBoundaries } = require("../src/boundary.js");

const tsc = require.resolve("typescript/lib/tsc");
// MO-8j: `--rx-strict` (or `"reactivescript": { "strict": true }` in the tsconfig): every row of a declaration the program
// imports must be verified by rx-verify (its record beside it) or say `trusted` (UNVERIFIED_ROW, TY-7). Not tsc's flag.
const strictFlag = process.argv.includes("--rx-strict");
process.argv = process.argv.filter(a => a !== "--rx-strict");
// E-5a: `--rx-whole-program` checks the crate's rows as a `wholeProgram` build does — each program from its entry (an .rx
// module no other imports), the loaded modules as the whole program — with `--rx-hosts <file>`, a JSON list of the modules
// a JS host imports with ?rx-lib (what the Vite front end found). TypeScript's own check is the same either way.
const wholeFlag = process.argv.includes("--rx-whole-program");
let hostList = [];
{ const at = process.argv.indexOf("--rx-hosts");
  if (at >= 0) { inputs?.ignore(process.argv[at + 1]); try { hostList = JSON.parse(require("node:fs").readFileSync(process.argv[at + 1], "utf8")); } catch (e) { process.stderr.write(`rx-tsc: --rx-hosts ${process.argv[at + 1]}: ${e.message}\n`); process.exit(2); } process.argv.splice(at, 2); } }
process.argv = process.argv.filter(a => a !== "--rx-whole-program");
const { patchSystem } = require("../src/declarations.js");   // TY-4b: a JS module typed only by its .d.rx, through ts.sys

process.on("exit", code => {
  const watching = process.argv.includes("--watch") || process.argv.includes("-w");
  if (watching) return;
  let errors = 0;
  const codes = new Set();
  // per module, as the editor has them; or, whole-program, from each program's entry
  let crateDiags = analyses().map(({ file, result }) => ({ file, diagnostics: result.diagnostics ?? [] }));
  if (wholeFlag) {
    const { checkProgram } = require("../src/rxc.js");
    const all = analyses();
    const imported = new Set(all.flatMap(a => (a.result.modules ?? []).filter(m => path.resolve(m) !== path.resolve(a.file)).map(m => path.resolve(m))));
    const entries = all.filter(a => !imported.has(path.resolve(a.file))).map(a => a.file);
    const byFile = new Map(all.map(a => [path.resolve(a.file), []]));
    const seen = new Set(), covered = new Set();
    const program = e => {
      const r = checkProgram(e, { whole: true, hosts: hostList });
      covered.add(path.resolve(e)); for (const m of r.modules ?? []) covered.add(path.resolve(m));
      for (const d of r.diagnostics ?? []) {   // the loader's own (a parse error, MODULE_CYCLE) with the checker's
        const f = path.resolve(d.file ?? e), k = `${f}\0${d.code}\0${d.line}\0${d.message}`;
        if (seen.has(k)) continue; seen.add(k);
        if (!byFile.has(f)) byFile.set(f, []);
        byFile.get(f).push(d);
      }
    };
    for (const e of entries) program(e);
    // modules no entry reached — those that import each other with nothing importing them: each cycle from a root of
    // its own, the first such module in the program's order, until every module is checked
    for (const a of all) if (!covered.has(path.resolve(a.file))) program(a.file);
    crateDiags = [...byFile].map(([file, diagnostics]) => ({ file, diagnostics }));
  }
  for (const { file, diagnostics } of crateDiags) {
    for (const d of diagnostics) {
      errors++;
      codes.add(d.code);
      const where = d.range ? `${d.range.start.line}:${d.range.start.column + 1}` : "1:1";
      process.stdout.write(`${path.relative(process.cwd(), file)}:${where} - error ${d.code}: ${d.message} (${d.rule})\n`);
    }
  }
  // TY-6: each .d.rx against the JS module it declares
  const ts = require(require.resolve("typescript"));
  // the tsconfig tsc itself reads: `-p`/`--project` (a file, or a folder holding tsconfig.json), else the nearest above the
  // working directory; TY-6's options and the strict setting come from the same file
  const at = process.argv.findIndex(x => x === "-p" || x === "--project");
  const project = at >= 0 && process.argv[at + 1] ? path.resolve(process.argv[at + 1]) : undefined;
  const cfg = project ? (ts.sys.directoryExists(project) ? path.join(project, "tsconfig.json") : project) : ts.findConfigFile(process.cwd(), ts.sys.fileExists);
  const parsed = cfg ? ts.parseJsonConfigFileContent(ts.readConfigFile(cfg, ts.sys.readFile).config, ts.sys, path.dirname(cfg), undefined, undefined, undefined, [{ extension: ".rx", isMixedContent: true, scriptKind: ts.ScriptKind.Deferred }]) : null;
  const options = parsed ? parsed.options : {};
  // TY-1d: what a folder's listing counts for the gate — the files this project's program can hold
  if (parsed) inputs?.takes([".ts", ".tsx", ".mts", ".cts", ".rx", ...(options.allowJs ? [".js", ".jsx", ".mjs", ".cjs"] : []), ...(options.resolveJsonModule ? [".json"] : [])]);
  // MO-8f, MO-8j, TY-6 cover the declarations the program consumed — as the crate's loader resolved each import, from
  // the module that wrote it (`declarations` in each analysis: the declaration, its importer, the import's text) — and
  // every .d.rx the tsconfig names itself (a package that ships only declarations, or a declaration audited on its
  // own). A .d.rx that only sits beside a module, imported by nothing, is not the program's.
  const uses = [];
  for (const a of analyses()) for (const u of a.result.declarations ?? []) if (!uses.some(x => x.file === u.file && x.importer === u.importer && x.spec === u.spec)) uses.push(u);
  const namedDecls = [...new Set((parsed?.fileNames ?? []).filter(f => f.endsWith(".d.rx")).map(f => path.resolve(f)))];
  const importers = new Map();
  for (const u of uses) importers.set(path.resolve(u.file), [...(importers.get(path.resolve(u.file)) ?? []), u.importer]);
  for (const f of namedDecls) if (!importers.has(f)) importers.set(f, []);
  // MO-8f: a declaration pinned to the version of the package it was written for, as each importer resolves it
  const { checkPins } = require("../src/versions.js");
  const pinned = new Set(importers.keys());
  for (const f of pinned) for (const p of checkPins(f, importers.get(f))) {
    errors++;
    codes.add("DECLARATION_VERSION");
    process.stdout.write(`${path.relative(process.cwd(), f)}:${p.line}:1 - error DECLARATION_VERSION: ${p.message} (MO-8f)\n`);
  }
  // MO-8j, TY-7: strict declarations
  // the setting is the tsconfig's own, or the nearest one up its `extends` (TypeScript merges only what it knows, so a
  // shared base that sets it would otherwise be passed over in silence)
  const strictOf = (file, seen = new Set()) => {
    if (!file || seen.has(file)) return undefined; seen.add(file);
    const config = ts.readConfigFile(file, ts.sys.readFile).config; if (!config) return undefined;
    if (config.reactivescript?.strict !== undefined) return !!config.reactivescript.strict;
    for (const ext of [].concat(config.extends ?? []).reverse()) {   // a later entry overrides an earlier one, as tsc's
      let base;
      if (ext.startsWith(".") || path.isAbsolute(ext)) { base = path.resolve(path.dirname(file), ext); if (!ts.sys.fileExists(base)) base += ".json"; }
      else { try { base = require.resolve(ext, { paths: [path.dirname(file)] }); } catch { try { base = require.resolve(ext + ".json", { paths: [path.dirname(file)] }); } catch {} } }
      const found = strictOf(base, seen); if (found !== undefined) return found;
    }
    return undefined;
  };
  const strict = strictFlag || !!strictOf(cfg);
  if (strict) for (const f of pinned) for (const u of require("../src/strict.js").checkStrict(f)) {
    errors++;
    codes.add("UNVERIFIED_ROW");
    process.stdout.write(`${path.relative(process.cwd(), u.file)}:${u.line}:1 - error UNVERIFIED_ROW: ${u.message} (TY-7)\n`);
  }
  for (const b of checkBoundaries(ts, [], options, { uses, named: namedDecls })) {
    errors++;
    codes.add("DECLARATION_MISMATCH");
    process.stdout.write(`${path.relative(process.cwd(), b.file)}:${b.line}:1 - error DECLARATION_MISMATCH: ${b.name ? `${b.name}: ` : ""}${b.message} (TY-6)\n`);
  }
  if (errors) {
    process.stdout.write(`\nFound ${errors} ReactiveScript error${errors === 1 ? "" : "s"}.\n`);
    for (const c of codes) process.stdout.write(`${c}: why, and the fix — ${guideUrl(c)}\n`);
    if (!code) process.exitCode = 1;
  }
});

if (inputs) process.on("exit", () => inputs.write());   // after the handler above, which reads declarations and records too
runTsc(tsc, [".rx"], ts => { patchSystem(ts.sys); return [rxLanguagePlugin(ts)]; });
