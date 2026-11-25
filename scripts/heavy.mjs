// Runs a command under the machine's lock for heavy runs (scripts/lib/lock.mjs): `node scripts/heavy.mjs <name> -- <command…>`.
// Off in CI and under RX_LOCK=0.  `node scripts/heavy.mjs --who`: who holds it.
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { heavy, lockDir, startOf } from "./lib/lock.mjs";
const args = process.argv.slice(2), at = args.indexOf("--");
if (args[0] === "--who") { let h; try { h = JSON.parse(readFileSync(path.join(lockDir(), "lock"), "utf8")); } catch { /* none */ } console.log(h ? `${h.what}, pid ${h.pid}, since ${new Date(h.since).toLocaleString()}${startOf(h.pid) === h.start ? "" : " (gone: the next run takes it)"}` : "no one"); process.exit(0); }
if (at < 1 || at === args.length - 1) { console.error("usage: node scripts/heavy.mjs <name> -- <command…>   |   --who"); process.exit(2); }
const release = await heavy(args[0]);
const c = spawn(args[at + 1], args.slice(at + 2), { stdio: "inherit" });
c.on("error", e => { console.error(e.message); release(); process.exit(127); });
c.on("close", (code, signal) => { release(); process.exit(code ?? (signal ? 1 : 0)); });
