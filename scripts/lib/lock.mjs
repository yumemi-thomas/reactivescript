// One heavy run at a time on a machine (CONTRIBUTING.md, *Faster runs*): suites that start browsers and a process a core
// take turns, so that what one measures by waiting (a page's frame, a tool's timeout) is not decided by the others' load.
// A lock is a file that says who holds it — pid and when that process started, so that a number used again by another
// process holds nothing — and a holder that is gone loses it. Off in CI (CI is set) and under RX_LOCK=0; a process started
// by a holder runs under its lock (RX_LOCK_HELD). A holder that hangs does not keep the others: one whose processes (it and
// those under it) used no CPU for RX_LOCK_IDLE seconds (600), or that has held it for RX_LOCK_HOLD (7200), loses it to the
// next. Waiting is bounded (RX_LOCK_WAIT seconds, 3600): past it the run goes on
// without the lock, and says so: an agent that waits for ever is worse than two suites at once.
import { execFileSync } from "node:child_process";
import { linkSync, mkdirSync, readFileSync, rmSync, rmdirSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

export const lockDir = () => process.env.RX_LOCK_DIR || path.join(os.homedir(), process.platform === "darwin" ? "Library/Caches" : ".cache", "reactivescript-lock");   // (not the temporary folder: an agent sets TMPDIR to its own)
/** When a process started, as the system says it; null: there is no such process. */
export function startOf(pid) {
  try { return execFileSync("ps", ["-o", "lstart=", "-p", String(pid)], { encoding: "utf8", env: { ...process.env, LC_ALL: "C" }, stdio: ["ignore", "pipe", "ignore"] }).trim() || null; } catch { return null; }
}
const read = f => { try { return JSON.parse(readFileSync(f, "utf8")); } catch { return null; } };
const alive = h => !!h && startOf(h.pid) === h.start;
const HOLD = () => (Number(process.env.RX_LOCK_HOLD) || 7200) * 1000, IDLE = () => (Number(process.env.RX_LOCK_IDLE) || 600) * 1000;
/** The CPU a process and those under it have used, in seconds, and which they are. (What has ended is not counted: the sum may
 *  fall — that is work, too.) */
function cpuOf(pid) {
  let out; try { out = execFileSync("ps", ["-Ao", "pid=,ppid=,time="], { encoding: "utf8", env: { ...process.env, LC_ALL: "C" } }); } catch { return null; }
  const at = new Map(); for (const l of out.split("\n")) { const m = /^\s*(\d+)\s+(\d+)\s+(?:(\d+)-)?(?:(\d+):)?(\d+):([\d.]+)/.exec(l); if (m) at.set(Number(m[1]), { up: Number(m[2]), t: (Number(m[3] ?? 0) * 24 + Number(m[4] ?? 0)) * 3600 + Number(m[5]) * 60 + Number(m[6]) }); }
  let t = 0; const mine = new Set([pid]);
  for (let more = true; more;) { more = false; for (const [p, x] of at) if (!mine.has(p) && mine.has(x.up)) { mine.add(p); more = true; } }
  for (const p of mine) t += at.get(p)?.t ?? 0;
  return { t, who: [...mine].sort().join() };
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

/** Takes the machine's lock for `what`; answers `release`. `wait`: the seconds to wait, after which (`orNot`) it answers
 *  null and the caller does not go on. */
export async function heavy(what, { log = s => process.stderr.write(s + "\n"), poll = 1000, wait = Number(process.env.RX_LOCK_WAIT) || 3600, orNot = false } = {}) {
  if (process.env.CI || process.env.RX_LOCK === "0") return () => {};
  const dir = lockDir(); mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "lock"), held = read(file);
  if (process.env.RX_LOCK_HELD && held?.id === process.env.RX_LOCK_HELD && alive(held)) return () => {};   // (a holder that started this one, and still holds it)
  const me = { pid: process.pid, start: startOf(process.pid), what, since: Date.now(), id: `${process.pid}.${Math.random().toString(36).slice(2)}` };
  const mine = path.join(dir, `.${me.id}`);
  writeFileSync(mine, JSON.stringify(me));
  const until = Date.now() + wait * 1000; let said = 0, seen = null;
  try {
    for (;;) {
      // `link` makes the name whole or fails because it is there: a reader never sees a lock half written
      try { linkSync(mine, file); break; } catch (e) { if (e.code !== "EEXIST") { log(`lock: ${e.message}; going on without it`); return () => {}; } }
      const h = read(file);
      // a holder that hangs: no process under it begins, ends, or uses a hundredth of the time that passes
      let why = h && !alive(h) ? "gone" : h && Date.now() - h.since > HOLD() ? `held it for ${Math.round((Date.now() - h.since) / 1000)} s` : null;
      if (h && !why) {
        const c = cpuOf(h.pid);
        if (!c || !seen || seen.id !== h.id || c.who !== seen.who || c.t - seen.t > Math.max(1, (Date.now() - seen.at) / 100000)) seen = { id: h.id, at: Date.now(), ...c };
        else if (Date.now() - seen.at > IDLE()) why = `its processes did nothing for ${Math.round((Date.now() - seen.at) / 1000)} s`;
      }
      if (why) {
        if (why !== "gone") log(`lock: taken from ${h.what} (pid ${h.pid}): ${why}`);
        // the file is removed by one waiter at a time, which looks again first — a lock taken meanwhile by another is
        // never the one removed
        const turn = path.join(dir, "turn");
        try { mkdirSync(turn); } catch { try { if (Date.now() - statSync(turn).mtimeMs > 10000) rmdirSync(turn); } catch { /* gone */ } await sleep(50); continue; }
        try { const was = read(file); if (was && was.id === h.id) rmSync(file, { force: true }); } finally { try { rmdirSync(turn); } catch { /* gone */ } }
        continue;
      }
      if (Date.now() > until) { if (orNot) return null; log(`lock: still held by ${h ? `${h.what} (pid ${h.pid})` : "another run"} after ${Math.round((Date.now() - me.since) / 1000)} s; going on without it`); return () => {}; }
      if (h && Date.now() - said > 60000) { said = Date.now(); log(`lock: waiting for ${h.what} (pid ${h.pid}), which has held it ${Math.round((Date.now() - h.since) / 1000)} s; waited ${Math.round((Date.now() - me.since) / 1000)} s — RX_LOCK=0 runs without it`); }
      await sleep(poll + Math.random() * poll / 4);
    }
  } finally { rmSync(mine, { force: true }); }
  process.env.RX_LOCK_HELD = me.id;
  let done = false;
  const release = () => { if (done) return; done = true; delete process.env.RX_LOCK_HELD; if (read(file)?.id === me.id) rmSync(file, { force: true }); };
  process.on("exit", release);
  for (const s of ["SIGINT", "SIGTERM", "SIGHUP"]) process.once(s, () => { release(); process.kill(process.pid, s); });
  return release;
}
