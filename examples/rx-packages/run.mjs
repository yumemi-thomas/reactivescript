// The originals' tests, both ways: node run.mjs [filter…] → a line per file
import { execFileSync, spawnSync } from "node:child_process"; import { existsSync, readFileSync, mkdirSync } from "node:fs"; import path from "node:path";
const here = import.meta.dirname, out = path.join(here, ".results"); mkdirSync(out, { recursive: true });
const run = (orig, mode) => { const f = path.join(out, `${orig ? "orig" : "rx"}-${mode}.json`); spawnSync("npx", ["vitest", "run", "--mode", mode, "--reporter=json", "--outputFile=" + f, ...process.argv.slice(2)], { cwd: here, env: { ...process.env, ORIGINAL: orig ? "1" : "", NODE_OPTIONS: "--max-old-space-size=2048" }, timeout: 180000, stdio: "ignore" });
  const m = new Map(); if (existsSync(f)) for (const t of JSON.parse(readFileSync(f)).testResults) m.set(path.relative(path.join(here, "test"), t.name), t); return m; };
const modes = process.env.SSR ? ["ssr"] : ["test"];
for (const mode of modes) { const o = run(true, mode), r = run(false, mode);
  for (const [k, t] of o) { const n = (x) => x ? `${x.assertionResults.filter((a) => a.status === "passed").length}/${x.assertionResults.length}` : "—"; console.log(k.padEnd(40), n(t), n(r.get(k)), r.get(k)?.assertionResults.length ? "" : (r.get(k)?.message ?? "").slice(0, 200));
    if (process.env.V) { const ok = new Set(t.assertionResults.filter((a) => a.status === "passed").map((a) => a.fullName)); for (const a of r.get(k)?.assertionResults ?? []) if (a.status === "failed" && ok.has(a.fullName)) console.log("   - " + a.fullName + "\n       " + (a.failureMessages[0] ?? "").replace(/\x1b\[\d+m/g, "").split("\n").filter((l) => l.trim()).slice(0, 2).join(" ").slice(0, 260)); } } }
