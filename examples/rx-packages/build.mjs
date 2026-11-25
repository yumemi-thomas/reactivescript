// Builds the packages with rx-lib, as an author would (`rx-lib --write`), and links them by name: node build.mjs [package…]
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import path from "node:path"; import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url)), repo = path.resolve(here, "../..");
process.env.RXC ??= path.join(repo, "compiler/target/release/rxc");
process.env.RX_TSC ??= path.join(repo, "tooling/rx-language-server/bin/tsc.js");
const { build } = await import("../../compiler/lib.mjs");
const nm = path.join(here, "node_modules");
for (const [from, to, files] of [["runtime", "@reactivescript/runtime", ["package.json", "dist", "rx-lib.d.ts"]], ["std", "@reactivescript/std", ["package.json", "src"]]]) { mkdirSync(path.join(nm, to), { recursive: true }); for (const f of files) cpSync(path.join(repo, from, f), path.join(nm, to, f), { recursive: true }); }
mkdirSync(path.join(nm, "@rx-packages"), { recursive: true });
const only = process.argv.slice(2); let bad = 0;
for (const name of readdirSync(path.join(here, "packages"))) {
  const dir = path.join(here, "packages", name), src = path.join(dir, "src"); if (!existsSync(src)) continue;
  const link = path.join(nm, "@rx-packages", name); if (!existsSync(link)) symlinkSync(dir, link, "dir");
  if (only.length && !only.includes(name)) continue;
  const entries = readdirSync(src).filter((f) => f.endsWith(".rx") && !f.endsWith(".d.rx")).map((f) => "src/" + f).sort();
  const file = path.join(dir, "package.json"), had = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {};
  writeFileSync(file, JSON.stringify({ name: `@rx-packages/${name}`, version: "0.0.0", private: true, type: "module", sideEffects: false, license: had.license ?? "MIT", files: ["dist", "src", "NOTICE"], scripts: { build: "rx-lib" }, reactivescript: { entries }, exports: had.exports ?? {}, peerDependencies: { "solid-js": "^2.0.0", "@solidjs/web": "^2.0.0", "@reactivescript/runtime": "*" } }, null, 2) + "\n");
  const b = build(dir, { write: true });
  console.log(`${name}: ${b.ok ? "built" : "REFUSED"}`); for (const p of b.problems) { bad++; console.log("   " + p); }
}
process.exit(bad ? 1 : 0);
