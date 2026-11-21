// The Vite plugin's options, as a TypeScript project sees them through the package's public export
// (`@reactivescript/compiler/vite`, typed by vite.d.mts): `rx({ wholeProgram: true })` type-checks, and a wrong option
// does not. Usage: node compiler/test/vite-types.mjs   (needs a @solidjs/vite-plugin that loads `.rx`: run
// compiler/test/vite.mjs once, which installs one under .out/.plugin, or set SOLID_VITE_PLUGIN)
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const pkg = path.resolve(here, "..");
const plugin = process.env.SOLID_VITE_PLUGIN ? path.resolve(process.env.SOLID_VITE_PLUGIN) : path.join(here, ".out/.plugin/node_modules/@solidjs/vite-plugin");
if (!existsSync(path.join(plugin, "package.json"))) { console.error(`no @solidjs/vite-plugin at ${plugin}: run compiler/test/vite.mjs first, or set SOLID_VITE_PLUGIN`); process.exit(2); }
const ws = path.join(here, ".out/vite-types"); rmSync(ws, { recursive: true, force: true });
mkdirSync(path.join(ws, "node_modules/@reactivescript"), { recursive: true }); mkdirSync(path.join(ws, "node_modules/@solidjs"), { recursive: true });
symlinkSync(pkg, path.join(ws, "node_modules/@reactivescript/compiler"), "dir");
symlinkSync(plugin, path.join(ws, "node_modules/@solidjs/vite-plugin"), "dir");
for (const d of ["vite", "@solidjs/compiler", "solid-js"]) { const from = path.resolve(plugin, "../..", d); if (existsSync(from) && !existsSync(path.join(ws, "node_modules", d))) symlinkSync(from, path.join(ws, "node_modules", d), "dir"); }
writeFileSync(path.join(ws, "tsconfig.json"), JSON.stringify({ compilerOptions: { module: "nodenext", moduleResolution: "nodenext", strict: true, noEmit: true, skipLibCheck: true, types: [] }, include: ["*.ts", "*.mts"] }));
writeFileSync(path.join(ws, "package.json"), JSON.stringify({ name: "fixture", type: "module" }));
const tsc = path.resolve(pkg, "../ref/node_modules/typescript/bin/tsc");
const run = text => { writeFileSync(path.join(ws, "config.ts"), text); try { execFileSync(process.execPath, [tsc, "-p", ws], { encoding: "utf8" }); return ""; } catch (e) { return (e.stdout || "") + (e.stderr || "") || String(e); } };

let fail = 0;
const check = (name, ok, detail = "") => { if (!ok) fail++; console.log(`${ok ? "✓" : "✗"} ${name}${!ok && detail ? `\n  ${detail.slice(0, 1500)}` : ""}`); };
const good = run([
  `import rx from "@reactivescript/compiler/vite";`,
  `import type { Frontend } from "@solidjs/vite-plugin";`,
  `const whole: Frontend = rx({ wholeProgram: true });`,
  `const aliased: Frontend = rx({ wholeProgram: true, alias: { "@": "/src" }, generate: false });`,
  `const regexp: Frontend = rx({ wholeProgram: true, alias: [{ find: /^@\\//, replacement: "/src/" }] });`,
  `const plain: Frontend = rx();`,
  `export { whole, aliased, regexp, plain };`,
  ``,
].join("\n"));
check("rx({ wholeProgram: true }) and its other options type-check through @reactivescript/compiler/vite", good === "", good);
const bad = run(`import rx from "@reactivescript/compiler/vite";\nexport const f = rx({ wholeProgram: "yes" });\n`);
check("a wrong option is a type error", /TS2322/.test(bad), bad);
const unknown = run(`import rx from "@reactivescript/compiler/vite";\nexport const f = rx({ whole: true });\n`);
check("an unknown option is a type error", /TS2353|TS2345/.test(unknown), unknown);
rmSync(ws, { recursive: true, force: true });
process.exit(fail ? 1 : 0);
