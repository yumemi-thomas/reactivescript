// A folder of small programs through every runner, at one revision or several, and what each shows: do the interpreter, the
// oracle, both emitters, both servers (with hydration, and the browser alone) and both checkers say one thing of each?
//   node scripts/matrix.mjs <folder | scenario.md …> [--rev name=<checkout>]… [--runners interp,js,…] [--out file.json]
//        [--jobs n] [--time 120] [--mem 2000] [--show differ,server] [--max 20] [--from file.json]
// A program is a scenario file (`## Program`, `## Frames`; a frame `@` no runner can show: what each shows is read off its
// report). --rev (default: this checkout, `here`): a checkout that is built — its crate, ref/node_modules, runtime/dist. It
// is not written to: its runners are run in a copy of its ref/, so several runs can share one. With two, what changed
// between the first and the last: verdicts, and the output of programs all runners agree on in both.
// --from: a matrix written before, shown again; a revision named in both is taken from the new run.
//
// The runners are each revision's own, as they are (ref/run.ts, oracle/run.ts, compile/run.ts, ssr/run.ts, crate.ts): a
// process takes a share of the programs, says each as it is done, and a program that does not end in --time seconds or grows past
// --mem MB is stopped with its process, named, and the rest of the share goes on without it. The pages of all of them
// are one Chromium's. A runner that never gets as far as a program says so (`?`) and the run exits 2.
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync, copyFileSync } from "node:fs";
import { spawn, execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { cores, heavy } from "./lib/lock.mjs";

const args = process.argv.slice(2), repo = path.resolve(import.meta.dirname, "..");
const many = f => args.flatMap((a, i) => a === f ? [args[i + 1]] : []), opt = (f, d) => many(f)[0] ?? d;
const given = args.filter((a, i) => !a.startsWith("--") && !args[i - 1]?.startsWith("--"));
if (!given.length && !opt("--from")) { console.error("usage: node scripts/matrix.mjs <folder | scenario.md …> [--rev name=<checkout>]… [--runners …] [--out file.json] (see the file's first lines)"); process.exit(2); }
const revs = Object.fromEntries((many("--rev").length ? many("--rev") : [`here=${repo}`]).map(r => { const i = r.indexOf("="); return [r.slice(0, i), path.resolve(r.slice(i + 1))]; }));
let jobs = Number(opt("--jobs")) || 0;   // (its lease's, below)
const TIME = (Number(opt("--time")) || 120) * 1000, MEM = (Number(opt("--mem")) || 2000) * 1024;

// ---- the runners ----
const N = ["--experimental-strip-types", "--no-warnings", `--max-old-space-size=${Math.round(MEM / 1024)}`], C = ["--conditions=browser", "--conditions=development"];
const RUNNERS = {
  interp: { cmd: [...N, "run.ts", "S-zz-"], env: {}, share: 150 },
  oracle: { cmd: [...N, ...C, "oracle/run.ts", "S-zz-"], env: {}, share: 150 },
  js: { cmd: [...N, ...C, "compile/run.ts", "S-zz-"], env: {}, share: 100 },
  rust: { cmd: [...N, ...C, "compile/run.ts", "S-zz-"], env: { RX_CRATE: "1" }, share: 60 },
  ssr: { cmd: [...N, "ssr/run.ts", "S-zz-"], env: { CSR: "1" }, share: 24, page: true },
  "ssr-rust": { cmd: [...N, "ssr/run.ts", "S-zz-"], env: { CSR: "1", RX_CRATE: "1" }, share: 24, page: true },
  same: { cmd: [...N, "crate.ts", "S-zz-"], env: { VERBOSE: "1" }, share: 200, whole: true },
  lower: { cmd: [...N, "crate.ts", "--lower", "S-zz-"], env: { VERBOSE: "1" }, share: 100, whole: true },
  project: { cmd: [...N, "crate.ts", "--project", "S-zz-"], env: { VERBOSE: "1" }, share: 200, whole: true },
  types: { cmd: [...N, "types/run.ts", "S-zz-"], env: {}, share: 200, whole: true },
};
const runners = opt("--runners", "interp,oracle,js,rust,ssr,ssr-rust,same,lower").split(",");
for (const r of runners) if (!RUNNERS[r]) { console.error(`no runner ${r}: ${Object.keys(RUNNERS).join(", ")}`); process.exit(2); }

const tmp = realpathSync(mkdtempSync(path.join(tmpdir(), "rx-matrix-")));
const kids = new Set();
process.on("exit", () => { for (const k of kids) try { process.kill(-k.pid, "SIGKILL"); } catch { /* ended */ } rmSync(tmp, { recursive: true, force: true }); });
for (const s of ["SIGINT", "SIGTERM"]) process.on(s, () => process.exit(1));
// `cargo` for the runners: they build the crate first; here it is built, and several run at once
mkdirSync(path.join(tmp, "bin")); writeFileSync(path.join(tmp, "bin/cargo"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });

/** A revision's ref/, with a scenarios folder of its own: one for each process at once. */
function mirror(name, slot) {
  const at = path.join(tmp, `${name}.${slot}`), root = revs[name]; if (existsSync(at)) return at;
  mkdirSync(path.join(at, "scenarios"), { recursive: true });
  cpSync(path.join(root, "ref"), path.join(at, "ref"), { recursive: true, filter: f => !/\/node_modules(\/|$)/.test(f.slice(root.length)) && !/\/\.(out|types)$/.test(f) });
  symlinkSync(path.join(root, "ref/node_modules"), path.join(at, "ref/node_modules"));
  for (const d of ["compiler", "runtime", "spec", "examples", "tooling", "guide", "scripts", "declarations"]) if (existsSync(path.join(root, d))) symlinkSync(path.join(root, d), path.join(at, d));
  return at;
}
const clean = l => l.trim().replace(/\s*\((file:)?\/(Users|home|private|tmp|var)[^)]*\)/g, "").slice(0, 600);
/** One process over some programs: what it said of each, and (it was stopped) of which it said nothing and why. */
function runShare(name, runner, slot, programs) {
  const R = RUNNERS[runner], at = mirror(name, slot), sc = path.join(at, "scenarios");
  for (const f of readdirSync(sc)) rmSync(path.join(sc, f));
  for (const p of programs) copyFileSync(p.file, path.join(sc, `S-zz-${p.name}.md`));
  return new Promise(res => {
    const env = { ...process.env, ...R.env, RX_JOBS: "1", RX_NO_CACHE: "1", RX_LOCK: "0", TMPDIR: tmp, PATH: `${path.join(tmp, "bin")}:${process.env.PATH}`, NODE_OPTIONS: `--require ${path.join(repo, "scripts/lib/runner-preload.cjs")}` };
    const c = spawn(process.execPath, R.cmd, { cwd: path.join(at, "ref"), env, stdio: ["ignore", "pipe", "pipe"], detached: true }); kids.add(c);
    let out = "", err = "", told = 0, last = Date.now(), why = null;
    const stop = w => { why ??= w; try { process.kill(-c.pid, "SIGKILL"); } catch { /* ended */ } };
    c.stdout.setEncoding("utf8").on("data", d => { out += d; const n = (out.match(/^(PASS|FAIL|SKIP|OPEN) S-zz-/gm) ?? []).length; if (n > told) { told = n; last = Date.now(); } });
    c.stderr.setEncoding("utf8").on("data", d => { if (err.length < 20000) err += d; });
    // the time a program has: one that is not said after the one before it; the crate's runners answer for a share at once
    const tick = setInterval(() => {
      if (Date.now() - last > (R.whole ? TIME * 2 : TIME) + (told ? 0 : 5000)) return stop("time");
      let rss = 0; try { for (const l of execFileSync("ps", ["-ax", "-o", "pgid=,rss="], { encoding: "utf8" }).split("\n")) { const [g, r] = l.trim().split(/\s+/).map(Number); if (g === c.pid) rss = Math.max(rss, r); } } catch { /* not asked */ }
      if (rss > MEM) stop("memory");
    }, 1000);
    c.on("close", code => {
      clearInterval(tick); kids.delete(c);
      const per = new Map(); let cur = null;
      for (const l of out.split("\n")) {
        const m = /^(PASS|FAIL|SKIP|OPEN)\s+S-zz-(\S+)/.exec(l) ?? (R.whole ? /^(ok|FAIL)\s+S-zz-(\S+)/.exec(l) : null);
        if (m) { cur = m[2]; const v = m[1] === "ok" ? "PASS" : m[1]; const was = per.get(cur); if (was && R.whole) { if (v === "FAIL") was[0] = v; } else if (!was) per.set(cur, [v]); }
        else if (cur && /^\s+\S/.test(l) && !l.startsWith("    at ")) per.get(cur).push(clean(l));
        else if (/^\S/.test(l)) cur = null;
      }
      // (what came after a line cut by the stop is not said: the last program of a stopped process is said again)
      res({ per, why: why ?? (code !== 0 && programs.some(p => !per.has(p.name)) && !R.whole ? "crash" : null), err, out, code });
    });
  });
}
async function runAll(name, programs) {
  const res = {}, queue = [];
  for (const r of runners) { res[r] = {}; const n = RUNNERS[r].share; for (let i = 0; i < programs.length; i += n) queue.push({ r, programs: programs.slice(i, i + n) }); }
  // the slow ones first: a share of pages left for the end is run alone
  queue.sort((a, b) => Number(!!RUNNERS[b.r].page) - Number(!!RUNNERS[a.r].page));
  const t0 = Date.now(), spent = {}; let running = 0;
  await new Promise(done => {
    const idle = [...Array(jobs).keys()];
    const next = () => {
      if (!queue.length && !running) return done();
      while (idle.length && queue.length) {
        const job = queue.shift(), slot = idle.shift(), t = Date.now(); running++;
        runShare(name, job.r, slot, job.programs).then(x => {
          spent[job.r] = (spent[job.r] ?? 0) + Date.now() - t;
          const left = job.programs.filter(p => !x.per.has(p.name));
          for (const p of job.programs) if (x.per.has(p.name)) res[job.r][p.name] = x.per.get(p.name);
          if (x.why) {
            if (job.programs.length === 1) res[job.r][job.programs[0].name] = ["STOPPED", x.why === "crash" ? `crash: ${x.err.trim().split("\n").slice(-2).join(" ").slice(0, 200)}` : x.why];
            // said as each is done: the one it was at is the first it has not said. A crate's runner answers for all at once: halves
            else if (!RUNNERS[job.r].whole && left.length) { queue.unshift({ r: job.r, programs: [left[0]], }); if (left.length > 1) queue.push({ r: job.r, programs: left.slice(1) }); }
            else if (RUNNERS[job.r].whole) { for (const p of job.programs) delete res[job.r][p.name]; const h = job.programs.length >> 1; queue.push({ r: job.r, programs: job.programs.slice(0, h) }, { r: job.r, programs: job.programs.slice(h) }); }
          } else if (x.code !== 0 && RUNNERS[job.r].whole && job.programs.length > 1 && left.length === job.programs.length && !/^\d+\/\d+ /m.test(x.out)) { const h = job.programs.length >> 1; queue.push({ r: job.r, programs: job.programs.slice(0, h) }, { r: job.r, programs: job.programs.slice(h) }); }
          else if (RUNNERS[job.r].whole && x.code !== 0 && left.length && !/pass, |programs/.test(x.out)) for (const p of left) res[job.r][p.name] = ["STOPPED", `crash: ${x.err.trim().split("\n").slice(-2).join(" ").slice(0, 200)}`];
        }).finally(() => { running--; idle.push(slot); next(); });
      }
    };
    next();
  });
  return { res, seconds: Math.round((Date.now() - t0) / 100) / 10, spent: Object.fromEntries(Object.entries(spent).map(([k, v]) => [k, Math.round(v / 1000)])) };
}

// ---- what a report says a program shows ----
function shows(runner, x) {
  if (!x) return "?";
  const [v, ...lines] = x, t = lines.join(" ");
  if (v === "STOPPED") return `STOPPED:${t.slice(0, 60)}`;
  if (v === "PASS" && runner.startsWith("ssr")) return "PASS";
  if (t.includes("refused by the checker")) return "REF";
  if (t.includes("not compiled") || t.includes("not lowered")) return "NC";
  let m = /server frame '(.*?)' is not/.exec(t); if (m) return m[1];
  const ms = [...t.matchAll(/got '(.*?)' effects \[(.*?)\]/g)];
  if (ms.length) return ms.map(m => m[1] + (m[2] ? `|${m[2]}` : "")).join(" / ") + (t.split("✗").length - 1 > ms.length ? ` / ERR:${t.slice(t.lastIndexOf("✗") + 1).slice(0, 60)}` : "");
  m = /\b([A-Z]+_[A-Z_]+)\b/.exec(t); if (m && runner === "interp") return "REF";
  m = /(no provision for \w+|call of non-function|hydrat\w+[^|]{0,60}|mismatch[^|]{0,60})/.exec(t); if (m) return `THROW:${m[1].slice(0, 40)}`;
  return v === "SKIP" || v === "PASS" ? v : `ERR:${t.slice(0, 80)}`;
}
const CORE = ["interp", "oracle", "js", "rust"], SERVER = ["ssr", "ssr-rust"], PAIR = ["same", "lower", "project", "types"];
/** What the runners, together, say of a program: `refused`, `not compiled`, `agree` (and what they show), `same error`, `differ`, `server differs`, `stopped`. */
function verdict(res, n) {
  const of = ks => ks.filter(k => res[k]).map(k => shows(k, res[k][n])), core = of(CORE), srv = of(SERVER);
  if ([...core, ...srv].some(x => x.startsWith("STOPPED"))) return ["stopped", null];
  if (core.includes("REF")) return ["refused", null];
  if ([...core, ...srv].includes("NC")) return ["not compiled", null];
  const said = core.filter(x => x !== "?"); if (!said.length) return ["not run", null];
  if (new Set(said).size !== 1 || said.length !== core.length) return ["differ", null];
  if (/^(ERR|THROW)/.test(said[0])) return ["same error", said[0]];
  const first = said[0].split(" / ")[0].split("|")[0];
  return srv.some(x => !["PASS", "SKIP", said[0], first].includes(x)) ? ["server differs", said[0]] : ["agree", said[0]];
}

// ---- run ----
let programs = [], file = opt("--from") ? JSON.parse(readFileSync(opt("--from"), "utf8")) : { revs: {} };
if (given.length) {
  const files = given.flatMap(g => statSync(g).isDirectory() ? readdirSync(g).filter(f => f.endsWith(".md")).sort().map(f => path.join(g, f)) : [g]);
  programs = files.map(f => ({ file: path.resolve(f), name: path.basename(f, ".md").replace(/^S-(zz-)?/, "") }));
  if (new Set(programs.map(p => p.name)).size !== programs.length) { console.error("two programs of one name"); process.exit(2); }
  for (const [n, root] of Object.entries(revs)) for (const f of ["ref/node_modules/solid-js", ...(runners.some(r => /rust|same|lower|project/.test(r)) ? ["compiler/target/release/rxc"] : [])]) if (!existsSync(path.join(root, f))) { console.error(`--rev ${n}: no ${f} in ${root}`); process.exit(2); }
  const release = programs.length > 20 ? await heavy("matrix", jobs ? { want: jobs } : {}) : Object.assign(() => {}, { n: Math.min(4, cores()) });
  jobs ||= release.n;
  // one Chromium: each revision's Playwright must be the one that started it
  let server = null;
  if (runners.some(r => RUNNERS[r].page)) {
    const version = root => JSON.parse(readFileSync(path.join(root, "ref/node_modules/playwright/package.json"), "utf8")).version, vs = new Set(Object.values(revs).map(version));
    if (vs.size === 1) { server = await createRequire(path.join(Object.values(revs)[0], "ref/package.json"))("playwright").chromium.launchServer(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}); process.env.RX_BROWSER = server.wsEndpoint(); }
  }
  for (const name of Object.keys(revs)) {
    const x = await runAll(name, programs); file.revs[name] = x.res;
    console.log(`${name}: ${programs.length} programs, ${runners.length} runners, ${x.seconds} s (${Object.entries(x.spent).map(([k, s]) => `${k} ${s}`).join(", ")} s of process)`);
  }
  await server?.close(); release();
}
if (opt("--out")) { mkdirSync(path.dirname(path.resolve(opt("--out"))), { recursive: true }); writeFileSync(opt("--out"), JSON.stringify(file)); }

// ---- say ----
const show = opt("--show", "differ,server differs,stopped,not run").split(","), max = Number(opt("--max")) || 20; let exit = 0;
const names = [...new Set(Object.values(file.revs).flatMap(r => Object.values(r).flatMap(Object.keys)))].sort();
const row = (res, n) => Object.keys(res).map(k => `${k} ${JSON.stringify(shows(k, res[k][n]).slice(0, 70))}`).join("  ");
for (const [name, res] of Object.entries(file.revs)) {
  const by = new Map(); for (const n of names) { const v = verdict(res, n)[0]; by.set(v, [...(by.get(v) ?? []), n]); }
  console.log(`\n${name}: ${[...by].sort((a, b) => b[1].length - a[1].length).map(([v, ns]) => `${ns.length} ${v}`).join(", ")}`);
  for (const k of PAIR) if (res[k]) { const bad = names.filter(n => !["PASS", "SKIP"].includes(res[k][n]?.[0]) && (res[k][n] || !["lower", "project"].includes(k))); console.log(`  ${k}: ${names.length - bad.length}/${names.length}`); for (const n of bad.slice(0, max)) console.log(`    ${n}: ${(res[k][n] ?? ["no answer"]).slice(0, 3).join(" ").slice(0, 300)}`); }
  for (const [v, ns] of by) if (show.some(s => v.startsWith(s))) for (const n of ns.slice(0, max)) console.log(`  ${v}: ${n}: ${row(res, n)}`);
  if (by.has("not run")) exit = 2;
}
const [a, b] = [Object.keys(file.revs)[0], Object.keys(file.revs).at(-1)];
if (a !== b) {
  const moves = new Map(), changed = new Map(), A = file.revs[a], B = file.revs[b];
  for (const n of names) { const [va, oa] = verdict(A, n), [vb, ob] = verdict(B, n), k = `${va} → ${vb}`; moves.set(k, [...(moves.get(k) ?? []), n]); if (va === "agree" && vb === "agree" && oa !== ob) { const c = `${JSON.stringify(oa.slice(0, 40))} → ${JSON.stringify(ob.slice(0, 40))}`; changed.set(c, [...(changed.get(c) ?? []), n]); } }
  console.log(`\n${a} → ${b}`);
  for (const [k, ns] of [...moves].sort((x, y) => y[1].length - x[1].length)) { console.log(`  ${String(ns.length).padStart(5)} ${k}`); const [x, y] = k.split(" → "); if (x !== y) for (const n of ns.slice(0, max)) console.log(`        ${n}: ${row(A, n).slice(0, 260)}\n        ${" ".repeat(n.length)}→ ${row(B, n).slice(0, 260)}`); }
  console.log(`  ${[...changed.values()].flat().length} agree in both and show something else`);
  for (const [k, ns] of [...changed].sort((x, y) => y[1].length - x[1].length)) console.log(`        ${k}: ${ns.length} (${ns.slice(0, 5).join(", ")})`);
}
process.exit(exit);
