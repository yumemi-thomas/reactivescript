// One heavy run at a time on a machine (CONTRIBUTING.md, *Faster runs*): suites that start browsers and a process a core
// take turns, so that what one measures by waiting (a page's frame, a tool's timeout) is not decided by the others' load.
// A lock is a file that says who holds it — pid and when that process started, so that a number used again by another
// process holds nothing — and a holder that is gone loses it. Off in CI (CI is set) and under RX_LOCK=0; a process started
// by a holder runs under its lock (RX_LOCK_HELD). Waiting is bounded (RX_LOCK_WAIT seconds, 3600): past it the run goes on
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
const sleep = ms => new Promise(r => setTimeout(r, ms));

/** Takes the machine's lock for `what`; answers `release`. */
export async function heavy(what, { log = s => process.stderr.write(s + "\n"), poll = 1000 } = {}) {
  if (process.env.CI || process.env.RX_LOCK === "0") return () => {};
  const dir = lockDir(); mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "lock"), held = read(file);
  if (process.env.RX_LOCK_HELD && held?.id === process.env.RX_LOCK_HELD && alive(held)) return () => {};   // (a holder that started this one, and still holds it)
  const me = { pid: process.pid, start: startOf(process.pid), what, since: Date.now(), id: `${process.pid}.${Math.random().toString(36).slice(2)}` };
  const mine = path.join(dir, `.${me.id}`);
  writeFileSync(mine, JSON.stringify(me));
  const until = Date.now() + (Number(process.env.RX_LOCK_WAIT) || 3600) * 1000; let said = 0;
  try {
    for (;;) {
      // `link` makes the name whole or fails because it is there: a reader never sees a lock half written
      try { linkSync(mine, file); break; } catch (e) { if (e.code !== "EEXIST") { log(`lock: ${e.message}; going on without it`); return () => {}; } }
      const h = read(file);
      if (h && !alive(h)) {
        // a holder that is gone: its file is removed by one waiter at a time, which looks again first — a lock taken
        // meanwhile by another is never the one removed
        const turn = path.join(dir, "turn");
        try { mkdirSync(turn); } catch { try { if (Date.now() - statSync(turn).mtimeMs > 10000) rmdirSync(turn); } catch { /* gone */ } await sleep(50); continue; }
        try { const was = read(file); if (was && was.id === h.id) rmSync(file, { force: true }); } finally { try { rmdirSync(turn); } catch { /* gone */ } }
        continue;
      }
      if (Date.now() > until) { log(`lock: still held by ${h ? `${h.what} (pid ${h.pid})` : "another run"} after ${Math.round((Date.now() - me.since) / 1000)} s; going on without it`); return () => {}; }
      if (h && Date.now() - said > 60000) { said = Date.now(); log(`lock: waiting for ${h.what} (pid ${h.pid}, since ${new Date(h.since).toLocaleTimeString()}) — RX_LOCK=0 runs without it`); }
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
