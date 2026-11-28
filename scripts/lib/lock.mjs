// The cores heavy runs may use on a machine, shared by every checkout (CONTRIBUTING.md, *Faster runs*): suites that start
// browsers and a process a core each take some of a budget — RX_CORES; else 10, and never more than the machine's less two —
// and wait when there is none left, so that what one measures by waiting (a page's frame, a tool's timeout) is not
// decided by the others' load. A run alone has all of it; one that comes while others run has its share of what is left.
// A run that measures time asks for the machine (`exclusive`). A lease is a file that says who holds it — pid and when that
// process started, so that a number used again by another process holds nothing. It counts for nothing when its process
// is gone, when its processes (it and those under it) used no CPU for RX_LOCK_IDLE seconds (600), or after RX_LOCK_HOLD
// (7200). Where the holders leave the machine idle (its 1-minute load under a third of its cores) a run goes in beside
// them; with less than RX_FREE_MB (8192) of memory to spare it waits. Waiting is bounded (RX_LOCK_WAIT seconds, 3600):
// past it the run goes on with its share, and says so. Off in CI (CI is set) and under RX_LOCK=0; what a holder starts
// runs under its lease (RX_LOCK_HELD, RX_LOCK_N).
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, renameSync, rmSync, rmdirSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

export const lockDir = () => process.env.RX_LOCK_DIR || path.join(os.homedir(), process.platform === "darwin" ? "Library/Caches" : ".cache", "reactivescript-lock", "cores");   // (not the temporary folder: an agent sets TMPDIR to its own)
export const budget = () => Math.max(1, Number(process.env.RX_CORES) || Math.min(10, os.availableParallelism() - 2));
/** When a process started, as the system says it; null: there is no such process. */
export function startOf(pid) {
  try { return execFileSync("ps", ["-o", "lstart=", "-p", String(pid)], { encoding: "utf8", env: { ...process.env, LC_ALL: "C" }, stdio: ["ignore", "pipe", "ignore"] }).trim() || null; } catch { return null; }
}
const read = f => { try { return JSON.parse(readFileSync(f, "utf8")); } catch { return null; } };
const HOLD = () => (Number(process.env.RX_LOCK_HOLD) || 7200) * 1000, IDLE = () => (Number(process.env.RX_LOCK_IDLE) || 600) * 1000;
/** The CPU a process and those under it have used, in seconds, and which they are. */
function cpuOf(pid) {
  let out; try { out = execFileSync("ps", ["-Ao", "pid=,ppid=,time="], { encoding: "utf8", env: { ...process.env, LC_ALL: "C" } }); } catch { return null; }
  const at = new Map(); for (const l of out.split("\n")) { const m = /^\s*(\d+)\s+(\d+)\s+(?:(\d+)-)?(?:(\d+):)?(\d+):([\d.]+)/.exec(l); if (m) at.set(Number(m[1]), { up: Number(m[2]), t: (Number(m[3] ?? 0) * 24 + Number(m[4] ?? 0)) * 3600 + Number(m[5]) * 60 + Number(m[6]) }); }
  let t = 0; const mine = new Set([pid]);
  for (let more = true; more;) { more = false; for (const [p, x] of at) if (!mine.has(p) && mine.has(x.up)) { mine.add(p); more = true; } }
  for (const p of mine) t += at.get(p)?.t ?? 0;
  return { t, who: [...mine].sort().join() };
}
/** The memory a new process could have, in MB (what is free, and what the system keeps only until it is wanted). */
function spare() {
  if (process.platform !== "darwin") return os.freemem() / (1 << 20);
  try { const v = execFileSync("vm_stat", { encoding: "utf8" }), size = Number(/page size of (\d+)/.exec(v)[1]); return ["free", "inactive", "speculative", "purgeable"].reduce((n, k) => n + Number(new RegExp(`Pages ${k}:\\s+(\\d+)`).exec(v)?.[1] ?? 0), 0) * size / (1 << 20); } catch { return Infinity; }
}
/** The leases of processes that are there: those that hold, and the runs that wait (`waits`). */
export function leases(dir = lockDir()) {
  let out = []; try { out = readdirSync(dir).filter(f => f.endsWith(".lease")).map(f => ({ file: path.join(dir, f), ...read(path.join(dir, f)) })).filter(h => h.pid); } catch { /* none */ }
  return out.filter(h => { if (startOf(h.pid) === h.start) return true; rmSync(h.file, { force: true }); return false; });
}
/** How many processes a run uses that was not told: its lease's, else what the others' leave of the budget; in CI, half
 *  the cores. */
export function cores() {
  if (Number(process.env.RX_LOCK_N)) return Number(process.env.RX_LOCK_N);
  if (process.env.CI) return Math.max(1, Math.floor(os.availableParallelism() / 2));
  const held = leases().filter(h => !h.waits), used = held.reduce((a, h) => a + h.n, 0);
  return Math.max(Math.floor(budget() / (held.length + 1)), budget() - used, 1);
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

/** Takes up to `want` cores for `what`; answers `release`, with `release.n` the cores it has. `exclusive`: the machine alone.
 *  `wait`: the seconds to wait, after which (`orNot`) it answers null and the caller does not go on. */
export async function heavy(what, { want = budget(), exclusive = false, log = s => process.stderr.write(s + "\n"), poll = 1000, wait = Number(process.env.RX_LOCK_WAIT) || 3600, orNot = false } = {}) {
  const none = n => Object.assign(() => {}, { n });
  if (process.env.CI || process.env.RX_LOCK === "0") return none(Math.min(want, cores()));
  const dir = lockDir(); mkdirSync(dir, { recursive: true });
  if (process.env.RX_LOCK_HELD && leases(dir).some(h => h.id === process.env.RX_LOCK_HELD)) return none(Math.min(want, Number(process.env.RX_LOCK_N) || want));   // (a holder that started this one, and still holds it)
  const all = budget(), me = { pid: process.pid, start: startOf(process.pid), what, since: Date.now(), id: `${process.pid}.${Math.random().toString(36).slice(2)}`, n: 0, exclusive, waits: true };
  const mine = path.join(dir, `${me.id}.lease`), put = x => { writeFileSync(`${mine}.tmp`, JSON.stringify(x)); renameSync(`${mine}.tmp`, mine); };
  put(me);
  const until = Date.now() + wait * 1000, seen = new Map(), turn = path.join(dir, "turn"); let said = 0, n = 0;
  try {
    while (!n) {
      // one at a time looks, and takes
      try { mkdirSync(turn); } catch { try { if (Date.now() - statSync(turn).mtimeMs > 10000) rmdirSync(turn); } catch { /* gone */ } await sleep(30); continue; }
      let held = [];
      try {
        const others = leases(dir).filter(h => h.id !== me.id), before = others.filter(h => h.waits && h.since < me.since);
        for (const h of others.filter(h => !h.waits)) {
          let why = Date.now() - h.since > HOLD() ? `it has held for ${Math.round((Date.now() - h.since) / 1000)} s` : null;
          if (!why) { const c = cpuOf(h.pid), s = seen.get(h.id); if (!c || !s || c.who !== s.who || c.t - s.t > Math.max(1, (Date.now() - s.at) / 100000)) seen.set(h.id, { at: Date.now(), ...c }); else if (Date.now() - s.at > IDLE()) why = `its processes did nothing for ${Math.round((Date.now() - s.at) / 1000)} s`; }
          if (why) { log(`lock: ${h.what} (pid ${h.pid}) no longer counts: ${why}`); rmSync(h.file, { force: true }); } else held.push(h);
        }
        const free = all - held.reduce((a, h) => a + h.n, 0), share = Math.max(1, Math.floor(all / (held.length + before.length + 1)));
        if (Date.now() > until) {
          if (orNot) return null;
          log(`lock: still held by ${held.map(h => `${h.what} (pid ${h.pid})`).join(", ") || "another run"} after ${Math.round((Date.now() - me.since) / 1000)} s; going on beside it`);
          n = Math.min(want, share);
        } else if (exclusive) { if (!held.length && !before.length) n = all; }
        else if (![...held, ...before].some(h => h.exclusive) && (!held.length || spare() >= Number(process.env.RX_FREE_MB ?? 8192))) {
          if (free >= Math.min(want, share, 2)) n = Math.min(want, free, before.length ? share : free);
          else if (os.loadavg()[0] < os.availableParallelism() / 3 && process.env.RX_LOCK_LOAD !== "0") n = Math.min(want, share);
        }
        if (n) put({ ...me, n, waits: false, since: Date.now() });
      } finally { try { rmdirSync(turn); } catch { /* gone */ } }
      if (n) break;
      if (Date.now() - said > 60000) { said = Date.now(); log(`lock: waiting for ${held.map(h => `${h.what} (pid ${h.pid}, ${h.n} cores, ${Math.round((Date.now() - h.since) / 1000)} s)`).join(", ") || "those before it, or memory"}; waited ${Math.round((Date.now() - me.since) / 1000)} s — RX_LOCK=0 runs without it`); }
      await sleep(poll + Math.random() * poll / 4);
    }
  } finally { if (!n) rmSync(mine, { force: true }); }
  let done = false;
  const release = () => { if (done) return; done = true; rmSync(mine, { force: true }); };
  process.on("exit", release);
  for (const s of ["SIGINT", "SIGTERM", "SIGHUP"]) process.once(s, () => { release(); process.kill(process.pid, s); });
  return Object.assign(release, { n, env: { RX_LOCK_HELD: me.id, RX_LOCK_N: String(n) } });
}
