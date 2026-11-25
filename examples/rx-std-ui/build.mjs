// Builds the package with rx-lib (as an author would: `rx-lib --write`).
import path from "node:path"; import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url)), repo = path.resolve(here, "../..");
process.env.RXC ??= path.join(repo, "compiler/target/release/rxc");
process.env.RX_TSC ??= path.join(repo, "tooling/rx-language-server/bin/tsc.js");
const { build } = await import("../../compiler/lib.mjs");
const b = build(here, { write: true });
console.log(b.ok ? "built" : "REFUSED"); for (const p of b.problems) console.log("  " + p);
process.exit(b.problems.length ? 1 : 0);
