// scripts/lib/lock.mjs, held to what it says: one at a time among many, a holder that is killed loses it, a number used
// again holds nothing, a wait is bounded, a process under a holder does not wait for it, and it is off in CI.
import assert from "node:assert";
import { spawn } from "node:child_process";
import { appendFileSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
const dir = mkdtempSync(path.join(os.tmpdir(), "rx-lock-")), log = path.join(dir, "log"), lock = path.join(import.meta.dirname, "lib/lock.mjs");
const env = { ...process.env, RX_LOCK_DIR: dir }; for (const k of ["CI", "RX_LOCK", "RX_LOCK_HELD", "RX_LOCK_WAIT"]) delete env[k];
const go = (body, e = {}) => { const c = spawn(process.execPath, ["--input-type=module", "-e", `import { heavy } from ${JSON.stringify(lock)}; import { appendFileSync } from "node:fs"; const say = s => appendFileSync(${JSON.stringify(log)}, s + "\\n"); const nap = ms => new Promise(r => setTimeout(r, ms)); const opt = { poll: 20, log: s => say("log " + s) };\n${body}`], { env: { ...env, ...e }, stdio: ["ignore", "ignore", "inherit"] }); c.end = new Promise(r => c.on("close", r)); return c; };
const said = () => existsSync(log) ? readFileSync(log, "utf8").trim().split("\n").filter(l => !l.startsWith("log lock: waiting for")) : [];
const reset = () => { rmSync(log, { force: true }); rmSync(path.join(dir, "lock"), { force: true }); };
const until = async f => { for (let i = 0; i < 400; i++) { if (f()) return; await new Promise(r => setTimeout(r, 20)); } throw new Error("waited too long"); };
const job = `const r = await heavy("job", opt); say("in"); await nap(20); say("out"); r();`;

// one at a time
await Promise.all(Array.from({ length: 12 }, () => go(job).end));
assert.equal(said().length, 24); said().forEach((l, i) => assert.equal(l, i % 2 ? "out" : "in"));
// a holder killed while it holds: the waiters go on, one at a time, whoever finds it
for (let k = 0; k < 4; k++) {
  reset(); const h = go(`await heavy("dies", opt); say("held"); await nap(60000);`); await until(() => said()[0] === "held");
  const ws = Array.from({ length: 8 }, () => go(job)); await new Promise(r => setTimeout(r, 300)); assert.deepEqual(said(), ["held"]);
  h.kill("SIGKILL"); await Promise.all(ws.map(w => w.end));
  const l = said().slice(1); assert.equal(l.length, 16); l.forEach((x, i) => assert.equal(x, i % 2 ? "out" : "in"));
}
// a number used again (this process is alive, and started at another time)
reset(); writeFileSync(path.join(dir, "lock"), JSON.stringify({ pid: process.pid, start: "Thu Jan  1 00:00:00 1970", what: "gone", id: "x", since: 0 }));
await go(job).end; assert.deepEqual(said(), ["in", "out"]);
// a wait is bounded, and the holder keeps it
reset(); const h = go(`await heavy("long", opt); say("held"); await nap(60000);`); await until(() => said()[0] === "held");
await go(job, { RX_LOCK_WAIT: "1" }).end; assert.match(said()[1], /still held by long .*going on without it/); assert.deepEqual(said().slice(2), ["in", "out"]); assert.ok(existsSync(path.join(dir, "lock")));
// off: CI, RX_LOCK=0
for (const e of [{ CI: "1" }, { RX_LOCK: "0" }]) { const n = said().length; await go(job, e).end; assert.deepEqual(said().slice(n), ["in", "out"]); }
// what a holder's environment says is believed only of a holder that still holds
const id = JSON.parse(readFileSync(path.join(dir, "lock"), "utf8")).id;
{ const n = said().length; await go(job, { RX_LOCK_HELD: id }).end; assert.deepEqual(said().slice(n), ["in", "out"]); }
h.kill("SIGKILL"); await h.end;
{ const n = said().length; await go(job, { RX_LOCK_HELD: id }).end; assert.deepEqual(said().slice(n), ["in", "out"]); }
// a holder that ends on a signal gives it up
reset(); const t = go(`await heavy("term", opt); say("held"); await nap(60000);`); await until(() => said()[0] === "held"); t.kill("SIGTERM"); await t.end; assert.ok(!existsSync(path.join(dir, "lock")));
rmSync(dir, { recursive: true, force: true });
console.log("lock: one at a time, dead holders, reused numbers, bounded waits, nesting, CI: as stated");
