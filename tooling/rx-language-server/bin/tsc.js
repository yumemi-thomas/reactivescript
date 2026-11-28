#!/usr/bin/env node
// `rx-tsc`: a project type-checked with its `.rx` modules in the program (spec/13 TY-1a), for CI and the command line, by
// tsrs (TypeScript 7, src/checker.js) over the projections the editor checks (src/program.js). It takes tsc's arguments
// (`rx-tsc --noEmit`, `-p`, `--watch`, `--declaration …`) and reads the tsconfig.json's `include`, which must name the
// `.rx` files. Type errors are placed on the `.rx`.
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
const fs = require("node:fs");
const { analysis, analyses, isModule, guideUrl } = require("../src/index.js");
const { checkBoundaries } = require("../src/boundary.js");
const { Checker, overlay, readConfig, diagnosticsOf, isFile } = require("../src/program.js");
const { plain, versionText } = require("../src/checker.js");
const { report } = require("../src/report.js");

// MO-8j: `--rx-strict` (or `"reactivescript": { "strict": true }` in the tsconfig): every row of a declaration the program
// imports must be verified by rx-verify, its record beside it (UNVERIFIED_ROW, TY-7). Not tsc's flag.
// 08 CN-3d: `--rx-spa` (or `"reactivescript": { "spa": true }` in the tsconfig): the project is built for the client
// alone (Solid's `hydratable: false`), so what that build refuses is reported here too. Not tsc's flag.
if (process.argv.includes("--rx-spa")) { process.env.RX_SPA = "1"; process.argv = process.argv.filter(a => a !== "--rx-spa"); }
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

/** The crate's rows, and what is held of the declarations (MO-8f, MO-8j, MO-14g, TY-6), after TypeScript's: how many. */
function crateReport(checker, cfg, parsed, options) {
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
  // TY-1d: what a folder's listing counts for the gate — the files this project's program can hold
  if (parsed) inputs?.takes([".ts", ".tsx", ".mts", ".cts", ".rx", ...(options.allowJs ? [".js", ".jsx", ".mjs", ".cjs"] : []), ...(options.resolveJsonModule ? [".json"] : [])]);
  // MO-8f, MO-8j, TY-6 cover the declarations the program consumed — as the crate's loader resolved each import, from
  // the module that wrote it (`declarations` in each analysis: the declaration, its importer, the import's text) — and
  // every .d.rx the tsconfig names itself (a package that ships only declarations, or a declaration audited on its
  // own). A .d.rx that only sits beside a module, imported by nothing, is not the program's.
  const uses = [];
  for (const a of analyses()) for (const u of a.result.declarations ?? []) if (!uses.some(x => x.file === u.file && x.importer === u.importer && x.spec === u.spec)) uses.push(u);
  // (MO-13a: a printed signature — `//@ signature` before its first row — declares no JS module: the compiler wrote its rows)
  const printed = f => { try { for (const l of require("node:fs").readFileSync(f, "utf8").split("\n")) { const t = l.trim(); if (!t) continue; if (/^\/\/@\s*signature(\s|$)/.test(t)) return true; if (!t.startsWith("//")) return false; } } catch { /* unreadable: not one */ } return false; };
  const namedDecls = [...new Set((parsed?.declarations ?? []).map(f => path.resolve(f)))].filter(f => !printed(f));
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
    let config; try { config = checker.api.readConfigFile(file).config; } catch { /* none */ } if (!config) return undefined;
    if (config.reactivescript?.strict !== undefined) return !!config.reactivescript.strict;
    for (const ext of [].concat(config.extends ?? []).reverse()) {   // a later entry overrides an earlier one, as tsc's
      let base;
      if (ext.startsWith(".") || path.isAbsolute(ext)) { base = path.resolve(path.dirname(file), ext); if (!isFile(base)) base += ".json"; }
      else { try { base = require.resolve(ext, { paths: [path.dirname(file)] }); } catch { try { base = require.resolve(ext + ".json", { paths: [path.dirname(file)] }); } catch {} } }
      const found = strictOf(base, seen); if (found !== undefined) return found;
    }
    return undefined;
  };
  const strict = strictFlag || !!strictOf(cfg);
  // MO-14e: the host declarations the program's modules are under (`host.d.rx`, found from each one's folder upward) are
  // declarations the program is checked by: their pages are credited what they say, so strict mode asks for their record too
  const hostDecls = new Set(analyses().flatMap(a => a.result.host ? [path.resolve(a.result.host)] : []));
  // MO-14g: a host declaration that names the router's tree it was derived from (`//@ routes`) is that tree's: one that
  // has fallen behind it — a route file added, moved or gone since — credits pages what the router no longer does
  for (const f of hostDecls) { const H = require("../src/host-routes.js"); let d = null; try { d = H.drift(f); } catch (e) { d = { stale: true, problems: [String(e.message ?? e)], line: 1 }; }
    if (!d?.stale) continue;
    errors++; codes.add("HOST_VIEW_STALE");
    process.stdout.write(`${path.relative(process.cwd(), f)}:${d.line}:1 - error HOST_VIEW_STALE: ${H.message(f, d)} (MO-14g)\n`);
  }
  if (strict) for (const f of new Set([...pinned, ...hostDecls])) for (const u of require("../src/strict.js").checkStrict(f)) {
    errors++;
    codes.add("UNVERIFIED_ROW");
    process.stdout.write(`${path.relative(process.cwd(), u.file)}:${u.line}:1 - error UNVERIFIED_ROW: ${u.message} (TY-7)\n`);
  }
  // TY-6: each .d.rx against the JS module it declares
  for (const b of checkBoundaries(checker, options, { uses, named: namedDecls })) {
    errors++;
    codes.add("DECLARATION_MISMATCH");
    process.stdout.write(`${path.relative(process.cwd(), b.file)}:${b.line}:1 - error DECLARATION_MISMATCH: ${b.name ? `${b.name}: ` : ""}${b.message} (TY-6)\n`);
  }
  if (errors) {
    process.stdout.write(`\nFound ${errors} ReactiveScript error${errors === 1 ? "" : "s"}.\n`);
    for (const c of codes) process.stdout.write(`${c}: why, and the fix — ${guideUrl(c)}\n`);
  }
  return errors;
}

const argv = process.argv.slice(2);
const usage = m => { process.stderr.write(`rx-tsc: ${m}\n`); process.exit(2); };
if (argv.includes("--version") || argv.includes("-v")) { process.stdout.write(`Version ${versionText()}\n`); process.exit(0); }
for (const f of ["-b", "--build", "--init", "--showConfig", "--lsp", "--help", "-h", "--all", "--locale"]) if (argv.includes(f)) usage(`${f} is not one of rx-tsc's: run the project's own tsc for it`);

/** One check of the project: what it found, and the files it read that are the project's. */
function run() {
  const checker = new Checker({ overlay: overlay(), record: !!inputs });
  try {
    const cmd = checker.api.parseCommandLine(argv);
    const named = cmd.fileNames.length > 0;
    const project = cmd.options.project;
    const { project: _p, watch, ...given } = cmd.options;
    let errors = [...cmd.errors], cfg;
    if (project) { cfg = !named && fs.existsSync(project) ? (fs.statSync(project).isDirectory() ? path.join(project, "tsconfig.json") : project) : undefined; if (named || !cfg || !isFile(cfg)) usage(named ? "a project and files cannot both be given (TS5042)" : `there is no tsconfig.json at ${project} (TS5058)`); }
    else if (!named) { for (let d = process.cwd(); ; d = path.dirname(d)) { if (isFile(path.join(d, "tsconfig.json"))) { cfg = path.join(d, "tsconfig.json"); break; } if (path.dirname(d) === d) break; } if (!cfg) usage("there is no tsconfig.json here or above"); }
    const parsed = cfg ? readConfig(checker, cfg) : null;
    const options = { ...(parsed?.options ?? {}), ...given, allowArbitraryExtensions: true };
    if (parsed) errors.push(...parsed.errors);
    const roots = parsed ? parsed.roots : cmd.fileNames.map(f => isModule(f) ? f + ".tsx" : f);
    const pretty = options.pretty ?? !!process.stdout.isTTY;
    const { program, dispose } = checker.program({ roots, options, references: parsed?.references });
    let found, emitted, files;
    try {
      files = program.getSourceFileNames();
      if (options.listFiles || options.listFilesOnly) process.stdout.write(files.map(f => f.endsWith(".rx.tsx") ? f.slice(0, -4) : f).join("\n") + "\n");
      found = options.listFilesOnly ? [] : diagnosticsOf(program, options, errors);
      if (!options.noEmit && !options.listFilesOnly) { const e = program.emit(); emitted = !e.emitSkipped;
        // a projection's JavaScript is `x.rx.js`, whatever `jsx` makes of a .tsx's name
        for (const f of e.emittedFiles) { const m = /\.rx\.jsx(\.map)?$/.exec(f); if (m && fs.existsSync(f)) fs.renameSync(f, f.slice(0, -m[0].length) + `.rx.js${m[1] ?? ""}`); }
         const more = e.diagnostics.map(plain); found.push(...more.filter(d => !found.some(x => x.code === d.code && x.file === d.file && x.start === d.start))); }
    } finally { dispose(); }
    process.stdout.write(report(found, { pretty }));
    const bad = found.filter(d => d.category === 1).length;
    const rx = crateReport(checker, cfg, parsed, options);
    return { status: bad ? (options.noEmit || emitted ? 2 : 1) : rx ? 1 : 0, watch, files, cfg };
  } finally { checker.close(); }
}

if (inputs) process.on("exit", () => inputs.write());
let last;
try { last = run(); } catch (e) { if (e.code !== "RX_NO_CHECKER") throw e; process.stderr.write(`rx-tsc: ${e.message}\n`); process.exit(2); }
if (!last.watch) process.exitCode = last.status;
else {
  // --watch: the project's own files (and its tsconfig's folder, for one added) are looked at again twice a second
  const stamp = () => { const own = new Set([last.cfg, ...last.files.filter(f => !/[\\/]node_modules[\\/]/.test(f)).map(f => f.endsWith(".rx.tsx") ? f.slice(0, -4) : f), ...analyses().flatMap(a => (a.result.declarations ?? []).map(u => u.file))].filter(Boolean)); const dirs = new Set([...own].map(f => path.dirname(f))); const at = f => { try { return `${f}:${fs.statSync(f).mtimeMs}`; } catch { return `${f}:-`; } }; return [...own, ...dirs].map(at).join("\n"); };
  let seen = stamp();
  const say = () => process.stdout.write(`[${new Date().toLocaleTimeString()}] Watching for file changes.\n`);
  say();
  setInterval(() => { const now = stamp(); if (now === seen) return; analysis.forget(); require("../src/declarations.js").forget(); try { last = run(); } catch (e) { process.stderr.write(`rx-tsc: ${e.stack ?? e}\n`); } seen = stamp(); say(); }, 500);
}
