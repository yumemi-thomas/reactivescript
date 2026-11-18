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
  const options = cfg ? ts.parseJsonConfigFileContent(ts.readConfigFile(cfg, ts.sys.readFile).config, ts.sys, path.dirname(cfg)).options : {};
  // MO-8f: a declaration pinned to the version of the package it was written for
  const { declarations: declFiles } = require("../src/boundary.js");
  const { checkPins } = require("../src/versions.js");
  const pinned = new Set([...declFiles(analyses().map(a => a.file)).map(d => d.file), ...analyses().flatMap(a => (a.result.declarations ?? []))]);
  for (const f of pinned) for (const p of checkPins(f)) {
    errors++;
    codes.add("DECLARATION_VERSION");
    process.stdout.write(`${path.relative(process.cwd(), f)}:${p.line}:1 - error DECLARATION_VERSION: ${p.message} (MO-8f)\n`);
  }
  for (const b of checkBoundaries(ts, analyses().map(a => a.file), options)) {
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
