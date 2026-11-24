// A draft's candidate readings, each checked whole (src/declare-check.js) while the next is being read. Reading the types
// is one thread's work (TypeScript's API, in this process); a check is a text in and a verdict out, so each is a worker
// thread's, with a checker of its own. What is checked, and what is made of the verdicts, is the same for any number of
// workers: a check is whole in one worker, and the verdicts are read in the order of the readings.
//
// RX_CHECKERS: how many workers (default: half the cores, at most 4; 1: no thread, each check in place, in turn).
const os = require("node:os");
const { Worker, MessageChannel, receiveMessageOnPort, isMainThread, workerData } = require("node:worker_threads");
const { failing } = require("./declare-check.js");

const asked = Number(process.env.RX_CHECKERS);
const count = () => Number.isInteger(asked) && asked > 0 ? asked : Math.max(1, Math.min(4, Math.floor(os.availableParallelism?.() ?? os.cpus().length) >> 1));
/** A check this small is over before a thread has started. */
const SMALL = 200_000;

/** The error a worker met, as it was thrown there. */
const thrown = e => ({ message: e.message, stack: e.stack, code: e.code, line: e.line, parse: e.parse });

class Pool {
  constructor() { this.workers = []; this.next = 0; }
  /** Starts `failing(...args)`; the answer is taken by calling what this returns. */
  start(args, size) {
    if (count() === 1 || size < SMALL) return () => failing(...args);
    if (this.workers.length < count()) {
      const { port1, port2 } = new MessageChannel(), flag = new Int32Array(new SharedArrayBuffer(4));
      const worker = new Worker(__filename, { workerData: { port: port2, flag }, transferList: [port2], env: process.env });
      worker.unref(); port1.unref();
      this.workers.push({ worker, port: port1, flag, sent: 0, answers: new Map() });
    }
    const w = this.workers[this.next++ % count()], id = w.sent++;
    w.port.postMessage({ id, args });
    return () => {
      while (!w.answers.has(id)) {
        const before = Atomics.load(w.flag, 0), m = receiveMessageOnPort(w.port);
        if (m) { w.answers.set(m.message.id, m.message); continue; }
        if (Atomics.wait(w.flag, 0, before, 600_000) === "timed-out") throw new Error("rx-declare: a worker that checks the draft did not answer in ten minutes");
      }
      const a = w.answers.get(id); w.answers.delete(id);
      if (a.error) throw Object.assign(new Error(a.error.message), a.error);
      return a.bad;
    };
  }
  close() { for (const w of this.workers) { w.port.postMessage({ end: true }); w.port.close(); } this.workers = []; }
}

if (!isMainThread && workerData?.port) {
  const { port, flag } = workerData;
  port.on("message", m => {
    if (m.end) { require("./checker.js").closeAll(); process.exit(0); }
    let answer; try { answer = { id: m.id, bad: failing(...m.args) }; } catch (e) { answer = { id: m.id, error: thrown(e) }; }
    port.postMessage(answer); Atomics.add(flag, 0, 1); Atomics.notify(flag, 0);
  });
}

module.exports = { Pool, count };
