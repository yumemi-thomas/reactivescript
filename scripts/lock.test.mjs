// scripts/lib/lock.mjs, held to what it says: one at a time among many, a holder that is killed loses it, a number used
// again holds nothing, a wait is bounded, a process under a holder does not wait for it, and it is off in CI.
import assert from "node:assert";
import { spawn } from "node:child_process";
import { appendFileSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
const dir = mkdtempSync(path.join(os.tmpdir(), "rx-lock-")), log = path.join(dir, "log"), lock = path.join(import.meta.dirname, "lib/lock.mjs");
const env = { ...process.env, RX_LOCK_DIR: dir, RX_LOCK_LOAD: "0", RX_FREE_MB: "0", RX_CORES: "10" }; for (const k of ["CI", "RX_LOCK", "RX_LOCK_HELD", "RX_LOCK_WAIT", "RX_LOCK_N"]) delete env[k];
const go = (body, e = {}) => { const c = spawn(process.execPath, ["--input-type=module", "-e", `import { heavy } from ${JSON.stringify(lock)}; import { appendFileSync } from "node:fs"; const say = s => appendFileSync(${JSON.stringify(log)}, s + "\\n"); const nap = ms => new Promise(r => setTimeout(r, ms)); const opt = { exclusive: true, poll: 20, log: s => say("log " + s) };\n${body}`], { env: { ...env, ...e }, stdio: ["ignore", "ignore", "inherit"] }); c.end = new Promise(r => c.on("close", r)); return c; };
const said = () => existsSync(log) ? readFileSync(log, "utf8").trim().split("\n").filter(l => !l.startsWith("log lock: waiting for")) : [];
const reset = () => { rmSync(log, { force: true }); for (const f of existsSync(dir) ? readdirSync(dir) : []) if (f.endsWith(".lease")) rmSync(path.join(dir, f), { force: true }); };
const leases = () => readdirSync(dir).filter(f => f.endsWith(".lease")).map(f => JSON.parse(readFileSync(path.join(dir, f), "utf8")));
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
reset(); writeFileSync(path.join(dir, "x.lease"), JSON.stringify({ pid: process.pid, start: "Thu Jan  1 00:00:00 1970", what: "gone", id: "x", since: 0, n: 10, exclusive: true }));
await go(job).end; assert.deepEqual(said(), ["in", "out"]);
// a wait is bounded, and the holder keeps it
reset(); const h = go(`await heavy("long", opt); say("held"); await nap(60000);`); await until(() => said()[0] === "held");
await go(job, { RX_LOCK_WAIT: "1" }).end; assert.match(said()[1], /still held by long .*going on beside it/); assert.deepEqual(said().slice(2), ["in", "out"]); assert.ok(leases().some(l => l.what === "long"));
// off: CI, RX_LOCK=0
for (const e of [{ CI: "1" }, { RX_LOCK: "0" }]) { const n = said().length; await go(job, e).end; assert.deepEqual(said().slice(n), ["in", "out"]); }
// what a holder's environment says is believed only of a holder that still holds
const id = leases().find(l => l.what === "long").id;
{ const n = said().length; await go(job, { RX_LOCK_HELD: id }).end; assert.deepEqual(said().slice(n), ["in", "out"]); }
h.kill("SIGKILL"); await h.end;
{ const n = said().length; await go(job, { RX_LOCK_HELD: id }).end; assert.deepEqual(said().slice(n), ["in", "out"]); }
// a holder that ends on a signal gives it up
reset(); const t = go(`await heavy("term", opt); say("held"); await nap(60000);`); await until(() => said()[0] === "held"); t.kill("SIGTERM"); await t.end; assert.equal(leases().length, 0);
// a holder that hangs, and one that holds too long; one whose child works does not hang
reset(); const z = go(`await heavy("hangs", opt); say("held"); await nap(60000);`); await until(() => said()[0] === "held");
await go(job, { RX_LOCK_IDLE: "2" }).end; assert.match(said()[1], /hangs .*no longer counts: its processes did nothing/); assert.deepEqual(said().slice(2), ["in", "out"]); z.kill("SIGKILL"); await z.end;
reset(); const y = go(`import { spawn } from "node:child_process"; await heavy("works", opt); const c = spawn(process.execPath, ["-e", "const t = Date.now(); while (Date.now() - t < 6000);"]); say("held"); c.on("close", () => { say("done"); process.exit(0); });`); await until(() => said()[0] === "held");
await go(job, { RX_LOCK_IDLE: "2" }).end; await y.end; assert.deepEqual(said(), ["held", "done", "in", "out"]);
reset(); const x = go(`await heavy("long", opt); say("held"); await nap(60000);`); await until(() => said()[0] === "held");
await go(job, { RX_LOCK_HOLD: "1" }).end; assert.match(said()[1], /long .*no longer counts: it has held/); x.kill("SIGKILL"); await x.end;
// the budget: one alone has all; those after it what is left, and wait for none; an exclusive one the machine, and is not passed by
reset(); const a = go(`const r = await heavy("a", { poll: 20, want: 6 }); say("a " + r.n); await nap(60000);`); await until(() => said().length === 1);
const b = go(`const r = await heavy("b", { poll: 20 }); say("b " + r.n); await nap(60000);`); await until(() => said().length === 2); assert.deepEqual(said(), ["a 6", "b 4"]);
const c = go(`const r = await heavy("c", opt); say("c " + r.n); await nap(300); say("c out"); r();`), d = new Promise(r => setTimeout(r, 400)).then(() => { const x = go(`const r = await heavy("d", { poll: 20 }); say("d " + r.n); r();`); return x.end; });
await new Promise(r => setTimeout(r, 900)); assert.equal(said().length, 2); b.kill("SIGKILL"); await b.end; await new Promise(r => setTimeout(r, 400)); assert.equal(said().length, 2); a.kill("SIGKILL"); await Promise.all([c.end, d]); assert.deepEqual(said().slice(2), ["c 10", "c out", "d 10"]);
// where the holders leave the machine idle, a run goes in with its share
reset(); const e = go(`const r = await heavy("e", { poll: 20 }); say("e " + r.n); await nap(60000);`); await until(() => said().length === 1);
if (os.loadavg()[0] < os.availableParallelism() / 3 - 1) { await go(`const r = await heavy("f", { poll: 20 }); say("f " + r.n); r();`, { RX_LOCK_LOAD: "" }).end; assert.deepEqual(said(), ["e 10", "f 5"]); }
// with no memory to spare it waits
await go(`const r = await heavy("g", { poll: 20, want: 1, wait: 1, orNot: true }); say("g " + (r ? r.n : "no")); process.exit(0);`, { RX_FREE_MB: "99999999", RX_LOCK_LOAD: "" }).end; assert.equal(said().at(-1), "g no"); e.kill("SIGKILL");
rmSync(dir, { recursive: true, force: true });
console.log("lock: exclusive runs, the budget, dead holders, reused numbers, bounded waits, nesting, CI: as stated");
