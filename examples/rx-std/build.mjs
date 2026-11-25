// Builds every package with rx-lib (as an author would: `rx-lib --write`), and links them and this repository's runtime
// into node_modules, so that the tests import them by name.
import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url)), repo = path.resolve(here, "../..");
process.env.RXC ??= path.join(repo, "compiler/target/release/rxc");
process.env.RX_TSC ??= path.join(repo, "tooling/rx-language-server/bin/tsc.js");
const { build } = await import("../../compiler/lib.mjs");
const nm = path.join(here, "node_modules"), rt = path.join(nm, "@reactivescript/runtime");
rmSync(rt, { recursive: true, force: true }); mkdirSync(rt, { recursive: true });
for (const f of ["package.json", "dist", "rx-lib.d.ts"]) cpSync(path.join(repo, "runtime", f), path.join(rt, f), { recursive: true });
mkdirSync(path.join(nm, "@rx-primitives"), { recursive: true });
const std = path.join(nm, "@reactivescript/std"); rmSync(std, { recursive: true, force: true }); cpSync(path.join(repo, "std"), std, { recursive: true });
const only = process.argv[2]; let bad = 0;
for (const at of ["packages", "repros"]) for (const name of readdirSync(path.join(here, at))) {
  const dir = path.join(here, at, name); if (!existsSync(path.join(dir, "src"))) continue;
  const pkg = path.join(dir, "package.json");
  if (!existsSync(pkg)) writeFileSync(pkg, JSON.stringify({ name: `@rx-primitives/${name}`, version: "0.0.0", type: "module", sideEffects: false, license: "MIT", files: ["dist", "src", "index.js", "index.d.ts"], scripts: { build: "rx-lib" }, reactivescript: { entries: ["src/core.rx"] }, exports: { ".": { types: "./index.d.ts", default: "./index.js" } } }, null, 2) + "\n");
  const link = path.join(nm, "@rx-primitives", name);
  if (!existsSync(link)) symlinkSync(dir, link, "dir");
  if (only && only !== name) continue;
  const b = build(dir, { write: true });
  console.log(`${name}: ${b.ok ? "built" : "REFUSED"}`); for (const p of b.problems) { bad++; console.log("   " + p); }
}
process.exit(bad ? 1 : 0);
