#!/usr/bin/env node
// `rx-tsc`: TypeScript's own `tsc`, with `.rx` modules in the program (spec/13 TY-1a), for CI and the command line. It
// is Volar's tsc runner (the one `vue-tsc` uses) with the language server's `.rx` plugin, so the editor and the command
// line check the same projection. It takes tsc's arguments (`rx-tsc --noEmit`, `-p`, `--watch`) and reads the
// tsconfig.json's `include`, which must name the `.rx` files. Type errors are placed on the `.rx`.
//
// The crate's own diagnostics (parse errors, else the checker's, with their rules) are reported after TypeScript's, for
// every `.rx` module in the program: a module that does not parse has no projection, so TypeScript alone would pass it.
const path = require("node:path");
const { runTsc } = require("@volar/typescript/lib/quickstart/runTsc");
const { rxLanguagePlugin, analyses, guideUrl } = require("../src/index.js");
const { checkBoundaries } = require("../src/boundary.js");

const tsc = require.resolve("typescript/lib/tsc");
// MO-8j: `--rx-strict` (or `"reactivescript": { "strict": true }` in the tsconfig): every row of a declaration the program
// imports must be verified by rx-verify (its record beside it) or say `trusted` (UNVERIFIED_ROW, TY-7). Not tsc's flag.
const strictFlag = process.argv.includes("--rx-strict");
process.argv = process.argv.filter(a => a !== "--rx-strict");
require("../src/declarations.js").install();   // TY-4b: a JS module typed only by its .d.rx

process.on("exit", code => {
  const watching = process.argv.includes("--watch") || process.argv.includes("-w");
  if (watching) return;
  let errors = 0;
  const codes = new Set();
  for (const { file, result } of analyses()) {
    for (const d of result.diagnostics ?? []) {
      errors++;
      codes.add(d.code);
      const where = d.range ? `${d.range.start.line}:${d.range.start.column + 1}` : "1:1";
      process.stdout.write(`${path.relative(process.cwd(), file)}:${where} - error ${d.code}: ${d.message} (${d.rule})\n`);
    }
  }
  // TY-6: each .d.rx against the JS module it declares
  const ts = require(require.resolve("typescript"));
  const cfg = ts.findConfigFile(process.cwd(), ts.sys.fileExists);
  const parsed = cfg ? ts.parseJsonConfigFileContent(ts.readConfigFile(cfg, ts.sys.readFile).config, ts.sys, path.dirname(cfg), undefined, undefined, undefined, [{ extension: ".rx", isMixedContent: true, scriptKind: ts.ScriptKind.Deferred }]) : null;
  const options = parsed ? parsed.options : {};
  // the files TY-6 and MO-8f look beside: every .rx module analysed, and every .rx or .d.rx the tsconfig names (a package
  // that ships only declarations has no .rx module of its own)
  const named = [...new Set([...analyses().map(a => a.file), ...(parsed?.fileNames ?? []).filter(f => f.endsWith(".rx")).map(f => path.resolve(f))])];
  // MO-8f: a declaration pinned to the version of the package it was written for
  const { declarations: declFiles } = require("../src/boundary.js");
  const { checkPins } = require("../src/versions.js");
  const pinned = new Set([...declFiles(named).map(d => d.file), ...analyses().flatMap(a => (a.result.declarations ?? []))]);
  for (const f of pinned) for (const p of checkPins(f)) {
    errors++;
    codes.add("DECLARATION_VERSION");
    process.stdout.write(`${path.relative(process.cwd(), f)}:${p.line}:1 - error DECLARATION_VERSION: ${p.message} (MO-8f)\n`);
  }
  // MO-8j, TY-7: strict declarations
  const strict = strictFlag || !!(cfg && ts.readConfigFile(cfg, ts.sys.readFile).config?.reactivescript?.strict);
  if (strict) for (const f of pinned) for (const u of require("../src/strict.js").checkStrict(f)) {
    errors++;
    codes.add("UNVERIFIED_ROW");
    process.stdout.write(`${path.relative(process.cwd(), u.file)}:${u.line}:1 - error UNVERIFIED_ROW: ${u.message} (TY-7)\n`);
  }
  for (const b of checkBoundaries(ts, named, options)) {
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

runTsc(tsc, [".rx"], ts => [rxLanguagePlugin(ts)]);
