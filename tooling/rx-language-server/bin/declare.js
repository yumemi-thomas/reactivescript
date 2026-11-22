#!/usr/bin/env node
// `rx-declare <module> [--out file.d.rx] [--run] [--dom] [--context name] [--types-only]`: a draft `.d.rx` for a JS module, from its TypeScript types
// (src/declare.js) and, for a library it knows (src/known.js), the rows types cannot show (--types-only leaves those out),
// then from running it (src/declare-run.js: which hooks read a context, which provider provides it),
// only with --run (it executes the package's code). The module is resolved from the current directory, as an import there would be
// (`@tanstack/solid-query`, `./lib.js`). Run it with `node --conditions=browser`, so Solid is its client build.
const fs = require("node:fs");
const { declare } = require("../src/declare.js");
const { runRows } = require("../src/declare-run.js");
const args = process.argv.slice(2);
const spec = args.find(a => !a.startsWith("--") && args[args.indexOf(a) - 1] !== "--out" && args[args.indexOf(a) - 1] !== "--context");
const ctxAt = args.indexOf("--context");   // the name for a context the module reads but does not export (MO-12a)
const outAt = args.indexOf("--out");
if (!spec) { process.stderr.write("usage: rx-declare <module> [--out file.d.rx] [--run] [--dom] [--context name] [--types-only]\n"); process.exit(2); }
(async () => {
  if (args.includes("--dom")) {   // a browser's globals (happy-dom, from the project), so hooks that need a page run here
    let reg;
    try { reg = require(require.resolve("@happy-dom/global-registrator", { paths: [process.cwd(), __dirname] })); }
    catch { process.stderr.write("rx-declare --dom: install @happy-dom/global-registrator in the project\n"); process.exit(2); }
    reg.GlobalRegistrator.register({ url: "http://localhost/" });
  }
  let text = declare(require("typescript"), spec, process.cwd(), {}, { known: !args.includes("--types-only") });
  // RFC 26: running the package is the user's choice: it executes third-party code
  if (args.includes("--run")) { const r = await runRows(text, spec, process.cwd(), ctxAt >= 0 ? { context: args[ctxAt + 1] } : {}); text = r.draft; for (const n of r.notes) process.stderr.write(`rx-declare: ${n}\n`); }
  if (outAt >= 0) fs.writeFileSync(args[outAt + 1], text); else process.stdout.write(text);
  process.exit(0);   // what running the module left behind (timers, listeners) is not the draft's
})();
