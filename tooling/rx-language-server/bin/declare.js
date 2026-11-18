#!/usr/bin/env node
// `rx-declare <module> [--out file.d.rx]`: a draft `.d.rx` for a JS module, from its TypeScript types (src/declare.js).
// The module is resolved from the current directory, as an import there would be (`@tanstack/solid-query`, `./lib.js`).
const fs = require("node:fs");
const { declare } = require("../src/declare.js");
const args = process.argv.slice(2);
const spec = args.find(a => !a.startsWith("--"));
const outAt = args.indexOf("--out");
if (!spec) { process.stderr.write("usage: rx-declare <module> [--out file.d.rx]\n"); process.exit(2); }
const text = declare(require("typescript"), spec, process.cwd());
if (outAt >= 0) fs.writeFileSync(args[outAt + 1], text); else process.stdout.write(text);
