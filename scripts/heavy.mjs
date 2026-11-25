// Runs a command under a lease of the machine's cores (scripts/lib/lock.mjs): `node scripts/heavy.mjs <name> [--cores n] [--exclusive]
// -- <command…>`; the command is told how many it has (RX_JOBS, BENCH_JOBS, where they are not set). Default: half the
// budget. --exclusive: the machine alone, for a run that measures time. `--who`: who holds and who waits. Off in CI and
// under RX_LOCK=0.
import { spawn } from "node:child_process";
import { budget, heavy, leases } from "./lib/lock.mjs";
const args = process.argv.slice(2), at = args.indexOf("--"), opt = args.slice(0, at), k = opt.indexOf("--cores");
if (args[0] === "--who") { const all = leases(); console.log(all.length ? all.map(h => `${h.what}, pid ${h.pid}: ${h.waits ? "waits" : `${h.n} of ${budget()} cores`}${h.exclusive ? ", exclusive" : ""}, since ${new Date(h.since).toLocaleString()}`).join("\n") : "no one"); process.exit(0); }
if (at < 1 || at === args.length - 1) { console.error("usage: node scripts/heavy.mjs <name> [--cores n] [--exclusive] -- <command…>   |   --who"); process.exit(2); }
const release = await heavy(args[0], { exclusive: opt.includes("--exclusive"), want: k < 0 ? Math.ceil(budget() / 2) : Number(opt[k + 1]) });
const c = spawn(args[at + 1], args.slice(at + 2), { stdio: "inherit", env: { RX_JOBS: String(release.n), BENCH_JOBS: String(release.n), ...process.env, ...release.env } });
c.on("error", e => { console.error(e.message); release(); process.exit(127); });
c.on("close", (code, signal) => { release(); process.exit(code ?? (signal ? 1 : 0)); });
