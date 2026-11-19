#!/usr/bin/env node
// `rx-declare <module> [--out file.d.rx] [--no-run]`: a draft `.d.rx` for a JS module, from its TypeScript types
// (src/declare.js), then from running it (src/declare-run.js: which hooks read a context, which provider provides it),
// unless --no-run. The module is resolved from the current directory, as an import there would be
// (`@tanstack/solid-query`, `./lib.js`). Run it with `node --conditions=browser`, so Solid is its client build.
const fs = require("node:fs");
const { declare } = require("../src/declare.js");
const { runRows } = require("../src/declare-run.js");
const args = process.argv.slice(2);
const spec = args.find(a => !a.startsWith("--") && args[args.indexOf(a) - 1] !== "--out");
const outAt = args.indexOf("--out");
if (!spec) { process.stderr.write("usage: rx-declare <module> [--out file.d.rx] [--no-run]\n"); process.exit(2); }
(async () => {
  let text = declare(require("typescript"), spec, process.cwd());
  if (!args.includes("--no-run")) { const r = await runRows(text, spec, process.cwd()); text = r.draft; for (const n of r.notes) process.stderr.write(`rx-declare: ${n}\n`); }
  if (outAt >= 0) fs.writeFileSync(args[outAt + 1], text); else process.stdout.write(text);
  process.exit(0);   // what running the module left behind (timers, listeners) is not the draft's
})();
