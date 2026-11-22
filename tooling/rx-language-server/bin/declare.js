#!/usr/bin/env node
// `rx-declare <module> [--out file.d.rx] [--run] [--dom] [--context name] [--types-only] [--explain] [--causes file.json] [--readings export] [--any] [--source [checkout]]`: a draft `.d.rx` for a JS module, from its TypeScript types
// (src/declare.js) and, for a library it knows (src/known.js), the rows types cannot show (--types-only leaves those out),
// then from running it (src/declare-run.js: which hooks read a context, which provider provides it),
// only with --run (it executes the package's code). The module is resolved from the current directory, as an import there would be
// (`@tanstack/solid-query`, `./lib.js`). Run it with `node --conditions=browser`, so Solid is its client build.
const fs = require("node:fs");
const { declare } = require("../src/declare.js");
const { runRows } = require("../src/declare-run.js");
const args = process.argv.slice(2);
// `rx-declare --host <route.rx>... [--out host.d.rx]` (09 MO-14): a draft of a host declaration for the `.rx` modules a
// JS host renders (a file-based router's route files) — an import of each one's exported components, the contexts
// their own imports are declared to use (the host must provide them), and a view that places every one at the top.
// Which page is among which layout's children is the router's to know: it is left to write, and said so.
if (args.includes("--host")) {
  const path = require("node:path");
  const outAt = args.indexOf("--out"); const out = outAt >= 0 ? args[outAt + 1] : undefined;
  const files = args.filter((a, i) => !a.startsWith("--") && args[i - 1] !== "--out");
  if (!files.length) { process.stderr.write("usage: rx-declare --host <route.rx>... [--out host.d.rx]\n"); process.exit(2); }
  process.stdout.write("");
  const text = require("../src/declare-host.js").draftHost(files.map(f => path.resolve(f)), out ? path.dirname(path.resolve(out)) : process.cwd());
  if (out) fs.writeFileSync(out, text); else process.stdout.write(text);
  process.exit(0);
}
const spec = args.find(a => !a.startsWith("--") && args[args.indexOf(a) - 1] !== "--out" && args[args.indexOf(a) - 1] !== "--context" && args[args.indexOf(a) - 1] !== "--source" && args[args.indexOf(a) - 1] !== "--causes" && args[args.indexOf(a) - 1] !== "--readings");
const srcAt = args.indexOf("--source");     // MO-8n: evidence from the library's original source (a checkout, its published src/, its source maps)
const ctxAt = args.indexOf("--context");   // the name for a context the module reads but does not export (MO-12a)
const outAt = args.indexOf("--out");
const causesAt = args.indexOf("--causes");   // MO-8q: each row's `any`s by cause and its parts said by place, as JSON, to a file
if (!spec) { process.stderr.write("usage: rx-declare <module> [--out file.d.rx] [--run] [--dom] [--context name] [--types-only] [--explain] [--causes file.json] [--readings export] [--any] [--source [checkout]]\n"); process.exit(2); }
(async () => {
  if (args.includes("--dom")) {   // a browser's globals (happy-dom, from the project), so hooks that need a page run here
    let reg;
    try { reg = require(require.resolve("@happy-dom/global-registrator", { paths: [process.cwd(), __dirname] })); }
    catch { process.stderr.write("rx-declare --dom: install @happy-dom/global-registrator in the project\n"); process.exit(2); }
    reg.GlobalRegistrator.register({ url: "http://localhost/" });
  }
  // --explain: why each `any` the draft holds is one (its cause, by export), and each row TypeScript did not hold with
  // the library's types named (MO-8m), on stderr; --any: the draft as it was before MO-8m, every unnamed type `any`
  const causes = [], unheld = {}, places = {};
  // --readings <export>[,<export>]: each reading of a row the draft tried (MO-8m, MO-8o) and TypeScript's answer to it, on stderr
  const readAt = args.indexOf("--readings");
  const readings = readAt >= 0 ? { names: (args[readAt + 1] ?? "").split(","), out: [] } : undefined;
  let text;
  try { text = declare(require("typescript"), spec, process.cwd(), {}, { known: !args.includes("--types-only"), refs: !args.includes("--any"), causes, unheld, places, readings }); }
  catch (e) {
    // a draft the crate cannot read: nothing is written, and the line and the parser's reason are the message (it was a
    // silent fall back to `any` for every row)
    if (e?.code !== "RX_DRAFT_UNREADABLE") throw e;
    process.stderr.write(`rx-declare: ${e.message}\n`); process.exit(1);
  }
  if (readings) for (const r of readings.out) process.stderr.write(`rx-declare: ${r.name} read ${r.reading}: ${r.bad === null ? "held" : `not held — ${r.bad}`}\n${r.rows.map(l => `    ${l}`).join("\n")}\n`);
  if (causesAt >= 0) fs.writeFileSync(args[causesAt + 1], JSON.stringify({ causes, places, unheld }, null, 1) + "\n");
  if (args.includes("--explain")) {
    const by = {}; for (const c of causes) by[c.cause] = (by[c.cause] ?? 0) + 1;
    // MO-8q: the library's own `any`s (vendor-any) are written as they are; every other is the draft's
    const own = causes.filter(c => c.cause !== "vendor-any").length;
    process.stderr.write(`rx-declare: ${causes.length} \`any\` drafted (${causes.length - own} the library's own, ${own} the draft's)${causes.length ? ` — ${Object.entries(by).sort((a, b) => b[1] - a[1]).map(([c, n]) => `${n} ${c}`).join(", ")}` : ""}\n`);
    const np = Object.values(places).reduce((a, b) => a + b, 0); if (np) process.stderr.write(`rx-declare: ${np} part${np === 1 ? "" : "s"} said by place (Parameters<…>, ReturnType<…>) in ${Object.keys(places).length} row${Object.keys(places).length === 1 ? "" : "s"}\n`);
    for (const [n, why] of Object.entries(unheld)) process.stderr.write(`rx-declare: ${n}: written with \`any\` — with the library's types named, TypeScript does not hold the row: ${why}\n`);
  }
  // MO-8n: what the library's own source shows of the words types cannot — written as `// SOURCE` comments above the
  // rows, each with its file and line, never as a row: a word stays a person's to write
  if (srcAt >= 0) {
    const ts = require("typescript"); const src = require("../src/declare-source.js");
    const given = args[srcAt + 1] && !args[srcAt + 1].startsWith("--") && args[srcAt + 1] !== spec ? args[srcAt + 1] : undefined;
    const at = src.locate(ts, spec, process.cwd(), given, { customConditions: process.execArgv.flatMap(a => /^--conditions=/.test(a) ? [a.slice(13)] : []) });
    process.stderr.write(`rx-declare: source: ${at.note}\n`);
    if (at.files.size) {
      const names = [...text.matchAll(/^export\s+(?:(?:pure|server|client)\s+)*(?:fn|component|const)\s+([\w$.]+)/gm)].map(m => m[1]);
      const evidence = src.analyze(ts, at.files, names, at.root);
      text = src.annotate(text, evidence);
      const by = {}; for (const e of evidence) by[e.word] = (by[e.word] ?? 0) + 1;
      process.stderr.write(`rx-declare: source: ${evidence.length} suggestion${evidence.length === 1 ? "" : "s"} for ${new Set(evidence.map(e => e.name)).size} of ${names.length} rows${evidence.length ? ` (${Object.entries(by).map(([w, n]) => `${n} ${w}`).join(", ")})` : ""}: each is a comment above its row, to check at the place it names\n`);
    }
  }
  // RFC 26: running the package is the user's choice: it executes third-party code
  if (args.includes("--run")) { const r = await runRows(text, spec, process.cwd(), ctxAt >= 0 ? { context: args[ctxAt + 1] } : {}); text = r.draft; for (const n of r.notes) process.stderr.write(`rx-declare: ${n}\n`); }
  // what running the module left behind (timers, listeners) is not the draft's: the process ends here — once the draft
  // is written out (a pipe takes a long draft in parts: exiting before the last cut it short)
  if (outAt >= 0) { fs.writeFileSync(args[outAt + 1], text); process.exit(0); }
  else process.stdout.write(text, () => process.exit(0));
})();
