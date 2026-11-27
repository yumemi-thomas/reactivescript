// The peer range against npm (decided 2026-11-27): the package is built and tested on Solid at the pin (../../solid-next,
// test.mjs), which is not a release; this runs the same test on the newest release npm has. Where that release is in the
// peer range, every check passes there. Where it is not (the pin is ahead of npm), the range is right to leave it out
// only while the test does fail on it: a run that passes there fails this job, and says to lower the peer.
// Usage: node npm.mjs     (after `npm run build`; needs the registry)
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const peer = JSON.parse(readFileSync(path.join(here, "package.json"), "utf8")).peerDependencies["solid-js"];
const m = /^(>=|>|\^)(\d+)\.(\d+)\.(\d+)$/.exec(peer); if (!m) { console.error(`the peer range ${peer} is not one this reads (>x.y.z, >=x.y.z, ^x.y.z)`); process.exit(1); }
const latest = execFileSync("npm", ["view", "solid-js", "version"], { encoding: "utf8" }).trim();
const num = v => v.split("-")[0].split(".").map(Number), cmp = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
const c = cmp(num(latest), [Number(m[2]), Number(m[3]), Number(m[4])]);
const inRange = !latest.includes("-") && (m[1] === ">" ? c > 0 : c >= 0) && (m[1] !== "^" || num(latest)[0] === Number(m[2]));
const dir = path.join(here, ".npm"); rmSync(dir, { recursive: true, force: true }); mkdirSync(dir);
writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "rx-runtime-on-npm", private: true, type: "module", dependencies: { "solid-js": latest, "@solidjs/web": latest, "@solidjs/signals": latest } }));
execFileSync("npm", ["install", "--no-audit", "--no-fund", "--no-package-lock"], { cwd: dir, stdio: ["ignore", "ignore", "inherit"] });
const r = spawnSync(process.execPath, ["test.mjs"], { cwd: here, encoding: "utf8", env: { ...process.env, RX_SOLID_FROM: path.join(dir, "node_modules") } });
const failed = (r.stdout.match(/^✗ .*$/gm) ?? []).map(l => l.slice(0, 160));
rmSync(dir, { recursive: true, force: true });
console.log(`npm's solid-js is ${latest}; the peer range is ${peer}: ${inRange ? "in it" : "not in it"}`);
if (inRange) {
  if (r.status !== 0) { console.log(failed.join("\n") || r.stdout.slice(-2000) + r.stderr.slice(-2000)); console.error(`✗ the package's test fails on a release its peer range takes`); process.exit(1); }
  console.log(`✓ every check of test.mjs passes on solid-js ${latest}`);
} else {
  if (r.status === 0) { console.error(`✗ every check of test.mjs passes on solid-js ${latest}, which the peer range leaves out: lower the peer`); process.exit(1); }
  console.log(`✓ the range leaves ${latest} out, and it should: ${failed.length} check(s) of test.mjs fail there\n${failed.map(l => "  " + l).join("\n")}`);
}
