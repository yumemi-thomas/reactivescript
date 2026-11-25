// Runs commands at once and says what each said, in the order they are written: `node scripts/parallel.mjs "a" "b"`.
// RX_JOBS: how many at a time (default: what is free of the machine's budget, scripts/lib/lock.mjs). Exits 1 when one of them fails.
import { spawn } from "node:child_process";
import { cores } from "./lib/lock.mjs";

const commands = process.argv.slice(2);
const jobs = Math.max(1, Number(process.env.RX_JOBS) || cores());
let next = 0, said = 0, failed = 0;
const done = [];
const worker = async () => {
  for (let i; (i = next++) < commands.length;) {
    const t0 = Date.now(); let out = "";
    const code = await new Promise(res => { const c = spawn(commands[i], { shell: true, stdio: ["ignore", "pipe", "pipe"] }); c.stdout.on("data", d => { out += d; }); c.stderr.on("data", d => { out += d; }); c.on("close", (code, signal) => res(code ?? signal)); });
    if (code !== 0) failed++;
    done[i] = `── ${commands[i]}\n${out}── ${code === 0 ? "passed" : `FAILED (${code})`} in ${((Date.now() - t0) / 1000).toFixed(1)} s\n`;
    for (; done[said] !== undefined; said++) process.stdout.write(done[said]);
  }
};
await Promise.all(Array.from({ length: jobs }, worker));
process.exit(failed ? 1 : 0);
