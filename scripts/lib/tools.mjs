// The language server's tools for a suite that runs them hundreds of times: a worker (tool-worker.cjs) for each process of
// the suite's pool. `lend()` gives a free one, for a process to be started (its environment names it: RX_TOOLS), which
// asks it synchronously (`ask`); with none, or one that is gone, hung or not sure, `ask` answers undefined and the tool is
// run in a process of its own.
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../../tooling/rx-language-server");
const free = [], all = new Set();
export const enabled = process.env.RX_TOOLS !== "0";
function start() {
  const at = mkdtempSync(path.join(os.tmpdir(), "rx-tools-"));
  const c = spawn(process.execPath, ["--conditions=browser", "--max-old-space-size=1800", path.join(import.meta.dirname, "tool-worker.cjs"), root, at], { stdio: "ignore", env: { ...process.env, RX_TOOLS: "0" } });
  const w = { at, c, env: `${at}|${c.pid}`, gone: false }; all.add(w); c.unref();
  c.on("close", () => { w.gone = true; all.delete(w); rmSync(at, { recursive: true, force: true }); }); c.on("error", () => { w.gone = true; });
  return w;
}
const stop = () => { for (const w of all) { try { w.c.kill("SIGKILL"); } catch { /* gone */ } rmSync(w.at, { recursive: true, force: true }); } };
process.on("exit", stop);
/** A worker for a process to be started: `{ env, back() }`. */
export function lend() {
  if (!enabled) return { env: {}, back() {} };
  let w; while ((w = free.pop()) && (w.gone || w.c.exitCode !== null)); w ??= start();
  return { env: { RX_TOOLS: w.env }, back() { rmSync(path.join(w.at, "ask"), { force: true }); rmSync(path.join(w.at, "answer"), { force: true }); if (!w.gone) free.push(w); } };
}
/** Ends them, and waits until they have (what they used is then this process's to count). */
export const end = () => Promise.all([...all].map(w => new Promise(res => { if (w.gone) return res(); w.c.ref(); w.c.on("close", res); w.c.kill("SIGTERM"); })));
const pause = new Int32Array(new SharedArrayBuffer(4));
let mine, seq = 0;
/** A tool run by this process's worker: `{ status, signal, stdout, stderr }`, as spawnSync answers; undefined: run it yourself. */
export function ask(bin, args, { cwd, env, timeout = 600000 }) {
  if (!process.env.RX_TOOLS || process.env.RX_TOOLS === "0" || mine === null) return;
  const [at, pid] = (mine ??= process.env.RX_TOOLS).split("|"), question = path.join(at, "ask"), answer = path.join(at, "answer"), id = `${process.pid}.${++seq}`;
  const { RX_TOOLS, ...rest } = env;
  try { writeFileSync(question + ".tmp", JSON.stringify({ id, bin, args, cwd, env: rest })); renameSync(question + ".tmp", question); } catch { mine = null; return; }
  const until = Date.now() + timeout;
  for (let n = 1; ; n++) {
    let r; try { r = JSON.parse(readFileSync(answer, "utf8")); } catch { /* not yet */ }
    if (r) { rmSync(answer, { force: true }); if (r.last) mine = null; if (r.id === id) return r.again ? undefined : { status: r.status, signal: r.signal, stdout: r.stdout, stderr: r.stderr }; }
    if (Date.now() > until) { mine = null; try { process.kill(Number(pid), "SIGKILL"); } catch { /* gone */ } return { status: null, signal: "SIGTERM", stdout: "", stderr: "" }; }
    if (n % 100 === 0) try { process.kill(Number(pid), 0); } catch { mine = null; return; }
    Atomics.wait(pause, 0, 0, 2);
  }
}
