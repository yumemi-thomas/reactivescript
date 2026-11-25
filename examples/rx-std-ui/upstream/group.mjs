// Runs a command in a process group of its own; past its time, or when one of its processes passes 4 GB, that group is ended, and nothing else.
import { spawn, execFileSync } from "node:child_process";
export function group(cmd, args, { seconds = 240, ...options } = {}) {
  const child = spawn(cmd, args, { detached: true, ...options });
  const end = (why) => { child.ended = why; try { process.kill(-child.pid, "SIGTERM"); } catch {} setTimeout(() => { try { process.kill(-child.pid, "SIGKILL"); } catch {} }, 2000).unref(); };
  const over = setTimeout(() => end("time"), seconds * 1000);
  const watch = setInterval(() => { try { const big = execFileSync("ps", ["-axo", "pgid=,rss="], { encoding: "utf8" }).trim().split("\n").map((l) => l.trim().split(/\s+/).map(Number)).some(([g, rss]) => g === child.pid && rss > 4 << 20); if (big) end("memory"); } catch {} }, 2000);
  const stop = () => { clearTimeout(over); clearInterval(watch); end(child.ended ?? "done"); };
  for (const s of ["SIGINT", "SIGTERM"]) process.on(s, () => { stop(); process.exit(1); });
  return { child, done: new Promise((res) => child.on("exit", (code) => { stop(); res({ code, ended: child.ended }); })), stop };
}
