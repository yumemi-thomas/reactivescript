// The `any` census (09 MO-8q, 2026-11-28): every module the tasks declare and the coverage suite drafts, drafted whole
// by `rx-declare` once (a module several tasks declare is one draft), each row's `any`s kept with the draft's cause, and
// then each `any` the draft calls the library's own (`vendor-any`) traced to where it comes from (bench/any-origin.cjs):
// the place it has in the row (what the checker reads of it, 09 MO-10k) and the reason the library's declaration has it.
//   node bench/any-census.mjs [--out dir] [--only substring] [--jobs n] [--classify-only]
// Needs the workspace bench/run.mjs installs (bench/.out/ws) and the crate's builds rx-declare reads code with. Each
// draft runs in a process of its own with a heap limit, a watch on its resident memory and a wall-time limit.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { spawn, execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import os from "node:os";

const here = path.dirname(fileURLToPath(import.meta.url)), repo = path.dirname(here), ws = path.join(here, ".out/ws");
const require_ = createRequire(import.meta.url);
const { declares } = require_("../tooling/rx-language-server/src/load.js");
const args = process.argv.slice(2), opt = k => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
const out = path.resolve(opt("--out") ?? path.join(here, ".out/census")), only = opt("--only");
const jobs = Number(opt("--jobs") ?? Math.max(1, Math.floor(Number(process.env.RX_CORES || os.cpus().length) / 2)));
const RSS_MB = Number(process.env.CENSUS_RSS_MB ?? 4000), WALL_S = Number(process.env.CENSUS_WALL_S ?? 300);
mkdirSync(out, { recursive: true });

/** Every `.d.rx` under a folder that is the task's own. */
const own = dir => { const r = []; const walk = d => { for (const e of readdirSync(d, { withFileTypes: true })) { if (e.name === "node_modules" || e.name === "dist" || e.name.startsWith(".")) continue; const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (e.name.endsWith(".d.rx")) r.push(p); } }; walk(dir); return r.sort(); };

// ---- the modules: (spec, from), a package once (drafted from the workspace's root, where the lock installs it)
const mods = new Map();
const add = (spec, from, who) => { const bare = !spec.startsWith("."); const key = bare ? spec : `${path.relative(ws, from)}:${spec}`; const m = mods.get(key) ?? { key, spec, from: bare ? ws : from, by: new Set() }; m.by.add(who); mods.set(key, m); };
for (const id of readdirSync(path.join(here, "tasks"))) {
  const dir = path.join(ws, "tasks", id); if (!existsSync(dir)) continue;
  for (const p of own(dir)) { const t = readFileSync(p, "utf8"); if (/^\s*export\s+default\s+component\b/m.test(t)) continue; const d = declares(p) ?? { spec: `./${path.basename(p, ".d.rx")}.js`, from: path.dirname(p) }; add(d.spec, d.from, `task:${id}`); }
}
const libs = JSON.parse(readFileSync(path.join(here, "coverage/libraries.json"), "utf8"));
for (const [group, g] of Object.entries(libs)) for (const [pkg, p] of Object.entries(g.packages ?? {})) for (const m of p.modules ?? [pkg]) add(m, ws, `coverage:${group}`);
const list = [...mods.values()].filter(m => !only || m.key.includes(only)).sort((a, b) => a.key < b.key ? -1 : 1);

// ---- the drafts
const file = (m, ext) => path.join(out, "drafts", m.key.replace(/[^\w@.-]+/g, "__") + ext);
mkdirSync(path.join(out, "drafts"), { recursive: true });
const rssOf = pid => { try { return execFileSync("ps", ["-o", "rss=", "-g", String(pid)], { encoding: "utf8" }).split("\n").map(Number).filter(Boolean).reduce((a, b) => a + b, 0) / 1024; } catch { return 0; } };
function draft(m) {
  return new Promise(resolve => {
    const causes = file(m, ".causes.json");
    const c = spawn(process.execPath, ["--max-old-space-size=3072", "--conditions=browser", path.join(repo, "tooling/rx-language-server/bin/declare.js"), m.spec, "--causes", causes], { cwd: m.from, detached: true, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env } });
    let so = "", se = "", killed = null; const t0 = Date.now();
    c.stdout.on("data", d => { so += d; }); c.stderr.on("data", d => { se += d; });
    const iv = setInterval(() => { const s = (Date.now() - t0) / 1000, r = rssOf(c.pid); if (s > WALL_S) killed = `wall ${WALL_S}s`; else if (r > RSS_MB) killed = `rss ${Math.round(r)}MB`; if (killed) { try { process.kill(-c.pid, "SIGKILL"); } catch { /* gone */ } } }, 500);
    c.on("close", code => { clearInterval(iv); writeFileSync(file(m, ".d.rx"), so); resolve({ code, killed, stderr: se.slice(-2000), secs: (Date.now() - t0) / 1000 }); });
  });
}
if (!args.includes("--classify-only")) {
  let next = 0, done = 0, runaway = null;
  const worker = async () => { while (next < list.length && !runaway) { const m = list[next++]; const r = await draft(m); m.run = r; done++; if (r.killed) { runaway = `${m.key}: ${r.killed}`; } process.stderr.write(`\r${done}/${list.length} ${m.key.slice(0, 60).padEnd(60)}`); } };
  await Promise.all(Array.from({ length: jobs }, worker));
  process.stderr.write("\n");
  if (runaway) { console.error(`census: stopped on a runaway draft — ${runaway}`); process.exit(1); }
  const failed = list.filter(m => m.run.code !== 0); for (const m of failed) console.error(`census: ${m.key} exited ${m.run.code}: ${m.run.stderr.split("\n").slice(-3).join(" | ")}`);
}
writeFileSync(path.join(out, "modules.json"), JSON.stringify(list.map(m => ({ key: m.key, spec: m.spec, from: m.from, by: [...m.by], draft: file(m, ".d.rx"), causes: file(m, ".causes.json"), secs: m.run?.secs, code: m.run?.code })), null, 1) + "\n");
console.log(`census: ${list.length} modules drafted into ${out}`);
