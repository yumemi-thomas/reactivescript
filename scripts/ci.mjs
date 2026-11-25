// The suites, one command, a summary with each step's time (CONTRIBUTING.md, *Faster runs*).
//   scripts/ci                     every job of .github/workflows that this machine can run, nothing kept from before (the run before a push)
//   scripts/ci --cached            the same, with results that nothing could have changed used again (scripts/lib/cache.mjs)
//   scripts/quick                  while working: both checkers and their parity over every program, the interpreter, the oracle,
//                                  the emitters, the crate's tests; in the browser, the programs whose compiled code is new
//   --only a,b | --skip a,b        the steps so named (a prefix will do), what they need built first included; --list names them
//   --jobs n                       (default: what is free of the machine's budget, scripts/lib/lock.mjs) processes at once (a suite that starts several counts as several); --keep-going is the default
// Logs and times: .out/ci (or --log <folder>). Exits 1 when a step fails; a step that cannot run here says why, and fails
// nothing.
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { cores, heavy } from "./lib/lock.mjs";

const repo = path.resolve(import.meta.dirname, ".."), args = process.argv.slice(2), flag = f => args.includes(f), opt = (f, d) => { const i = args.indexOf(f); return i < 0 ? d : args[i + 1]; };
const quick = flag("--quick"), cached = (quick || flag("--cached")) && !flag("--no-cache") && !process.env.CI && process.env.RX_NO_CACHE !== "1";
const jobs = Math.max(1, Number(opt("--jobs")) || cores());
const solid = path.resolve(process.env.SOLID_NEXT || path.join(repo, "../solid-next"));
const rxc = path.join(repo, "compiler/target/release/rxc"), LS = "tooling/rx-language-server";
const has = c => { try { execFileSync("sh", ["-c", `command -v ${c}`], { stdio: "ignore" }); return true; } catch { return false; } };
const targets = (() => { try { return execFileSync("rustup", ["target", "list", "--installed"], { encoding: "utf8" }).split("\n"); } catch { return []; } })();
const installed = (dir, lock = "package-lock.json") => { try { return statSync(path.join(repo, dir, "node_modules")).mtimeMs >= 0 && statSync(path.join(repo, dir, "node_modules/.package-lock.json")).mtimeMs >= statSync(path.join(repo, dir, lock)).mtimeMs; } catch { return false; } };
const ci = dir => quick && installed(dir) ? null : "npm ci --no-audit --no-fund";
const strip = "node --experimental-strip-types --no-warnings", crate = ["", "--spa", "--whole-program", "--lower", "--project", "--text", "--text --lower", "--text --project"];
const napi = "npx napi build --platform --release --features node --manifest-path ./Cargo.toml -- --lib";
const pluginOf = () => process.env.SOLID_VITE_PLUGIN ? null : "SOLID_VITE_PLUGIN is not set (a Solid plugin with context.resolve: compiler/README.md)";

/** The steps. `after`: what they need; `uses`: what two steps may not use at once — cargo's target folder, the bench's
 *  workspace, compiler/test/.out, the package's built files; `n`: how many processes it counts as (it is given that many);
 *  `soft` (quick): the seconds it has — what it did is kept, and the
 *  next run goes on from there; what it did not is said, and is `scripts/ci`'s; `heavy`: several browsers, under the machine's lock; `quick`: in the quick tier too; `not`: why it cannot run here. */
const steps = [
  { id: "npm-compiler", dir: "compiler", run: ci("compiler"), quick: true, skipQuietly: true },
  { id: "npm-runtime", dir: "runtime", run: ci("runtime"), quick: true, skipQuietly: true },
  { id: "npm-language-server", dir: LS, run: ci(LS), quick: true, skipQuietly: true },
  { id: "crate", dir: "compiler", run: "cargo build --release", uses: ["cargo"], n: jobs, quick: true },
  { id: "wasm", dir: "compiler", run: "cargo build --lib --release --target wasm32-unknown-unknown", uses: ["cargo"], n: jobs, after: ["crate"], quick: true, not: () => targets.includes("wasm32-unknown-unknown") ? null : "no wasm32-unknown-unknown target (rustup target add)" },
  { id: "cargo-test", dir: "compiler", run: "cargo test --release", uses: ["cargo"], n: jobs, after: ["wasm"], quick: true },
  { id: "node-build", dir: "compiler", run: napi, uses: ["cargo", "binding"], n: jobs, after: ["npm-compiler", "cargo-test"], quick: true },
  { id: "runtime", dir: "runtime", run: "npm run -s build", after: ["npm-runtime"], quick: true },
  { id: "runtime-test", dir: "runtime", run: "npm test && npm pack --silent && rm -f *.tgz && node test.mjs", after: ["runtime", "node-build"], uses: ["binding-read"], quick: true },
  { id: "names", dir: ".", run: `${strip} compiler/test/names.mjs`, after: ["crate"], quick: true },
  { id: "spec-refs", dir: ".", run: "node scripts/spec-refs.mjs", quick: true },
  { id: "tools", dir: ".", run: "node scripts/lock.test.mjs && node scripts/cache.test.mjs", quick: true },
  { id: "ref-run", dir: "ref", run: "npm test -s", quick: true },
  { id: "ref-oracle", dir: "ref", run: "npm run -s oracle", quick: true },
  { id: "ref-compiled", dir: "ref", run: "npm run -s compiled", uses: ["ref-out"], quick: true },
  { id: "ref-compiled-crate", dir: "ref", run: "RX_CRATE=1 npm run -s compiled", uses: ["ref-out", "cargo"], after: ["crate"], quick: true, only: "quick" },
  { id: "ref-types", dir: "ref", run: "npm run -s types", after: ["npm-language-server"], quick: true },
  { id: "ref-crate", dir: "ref", run: `node ../scripts/parallel.mjs ${crate.map(c => `"npm run -s crate -- ${c}"`).join(" ")}`, after: ["node-build"], uses: ["cargo"], n: jobs, quick: true },
  { id: "ref-ssr", dir: "ref", run: "npm run -s ssr", n: jobs, heavy: true, quick: true, soft: 45 },
  { id: "drafts", dir: ".", run: "node compiler/test/drafts.mjs", after: ["crate"], quick: true },
  { id: "lib", dir: ".", run: "node compiler/test/lib.mjs", after: ["node-build"], uses: ["binding-read"], quick: true },
  { id: "bench-install", dir: ".", run: 'mkdir -p bench/.out/ws && cd bench/.out/ws && if cmp -s ../../package-lock.json node_modules/.installed-from-lock && cmp -s ../../package.json package.json; then echo installed; else cp ../../package.json ../../package-lock.json . && npm ci --no-audit --no-fund --legacy-peer-deps && cp package-lock.json node_modules/.installed-from-lock; fi', uses: ["ws"], quick: true },
  { id: "confined", dir: ".", run: "node compiler/test/confined.mjs", after: ["node-build", "bench-install", "runtime"], uses: ["ws"], quick: true },
  { id: "runtime-resolve", dir: ".", run: "node compiler/test/runtime-resolve.mjs", after: ["node-build", "bench-install", "runtime"], uses: ["ws", "binding-read"] },
  { id: "leaks", dir: ".", run: "node compiler/test/leaks.mjs", after: ["node-build", "bench-install", "runtime"], uses: ["ws", "binding-read"] },
  { id: "js-host", dir: ".", run: "node compiler/test/js-host.mjs", after: ["node-build", "bench-install", "runtime"], uses: ["ws", "binding-read"] },
  { id: "measure", dir: ".", run: "node bench/measure.test.mjs", after: ["wasm", "npm-language-server"], quick: true },
  { id: "generated", dir: ".", run: `${strip} bench/generated.mjs`, after: ["wasm", "node-build", "bench-install", "runtime", "npm-language-server"], uses: ["ws"], n: jobs, heavy: true },
  { id: "bench-tasks", dir: ".", run: "node bench/run.mjs --tasks-only --check --strict", after: ["generated", "confined"], uses: ["ws"], n: jobs, heavy: true },
  { id: "bench-coverage", dir: ".", run: "node bench/run.mjs --coverage-only --check --strict", after: ["bench-tasks"], uses: ["ws"], n: jobs, heavy: true },
  { id: "bench", dir: ".", run: "node bench/run.mjs --check --strict", after: ["confined", "wasm", "npm-language-server", "runtime"], uses: ["ws", "binding-read"], n: jobs, heavy: true, quick: true, only: "quick", soft: 45 },
  { id: "tree-sitter", dir: "tooling/tree-sitter-rx", run: "pnpm install --frozen-lockfile && pnpm run generate && git diff --exit-code -- src/ && pnpm test && pnpm run parse:repo && pnpm run query -- ../../examples/*.rx > /dev/null", not: () => has("pnpm") ? null : "no pnpm" },
  { id: "editor-ls", dir: LS, run: `npm test -s && RXC=${rxc} node test/run.js`, after: ["npm-language-server", "wasm", "crate", "runtime", "node-build"], n: jobs },
  { id: "editor-vscode", dir: "tooling/vscode-rx", run: "npm ci --no-audit --no-fund && npm run package && SERVER=dist/server.js node ../rx-language-server/test/run.js && rm -f *.vsix", after: ["editor-ls"], uses: ["ls-pack"] },
  { id: "editor-pack", dir: LS, run: "npm pack --silent && rm -f *.tgz", after: ["wasm", "editor-vscode"], uses: ["ls-pack"] },
  ...["vite-gate", "vite-types", "vite", "wardic", "formisch", "ssr-router", "start"].map(t => ({ id: `t-${t}`, dir: ".", run: t === "vite" ? `node scripts/parallel.mjs ${[1, 2, 3].map(i => `"node compiler/test/vite.mjs --shard ${i}/3"`).join(" ")}` : `node compiler/test/${t}.mjs`, after: ["node-build", "runtime", "npm-language-server"], uses: ["binding-read"], n: t === "vite" ? jobs : 1, heavy: t === "vite" })),
  ...["vite-hosts", "vite-watch"].map(t => ({ id: `t-${t}`, dir: ".", run: `node compiler/test/${t}.mjs`, after: ["node-build", "runtime"], uses: ["binding-read"], not: pluginOf })),
  { id: "proposals", dir: ".", run: "node proposals/check.mjs", after: ["node-build", "runtime", "npm-language-server"], uses: [], n: jobs, heavy: true },
  // the package as it is published, last: these write over the binding the suites above have loaded
  { id: "node-darwin", dir: "compiler", run: 'RUSTC="$(rustup which rustc)" npx napi build --platform --release --strip --features node --target aarch64-apple-darwin --manifest-path ./Cargo.toml -- --lib && npm test -s', uses: ["cargo", "binding"], n: jobs, last: true, not: () => process.platform === "darwin" && process.arch === "arm64" ? null : "another platform" },
  { id: "node-wasi", dir: "compiler", run: 'RUSTC="$(rustup which rustc)" npx napi build --platform --release --strip --features node --target wasm32-wasip1-threads --manifest-path ./Cargo.toml -- --lib && NAPI_RS_FORCE_WASI=1 npm test -s', uses: ["cargo", "binding"], n: jobs, last: true, not: () => targets.includes("wasm32-wasip1-threads") ? null : "no wasm32-wasip1-threads target" },
  { id: "win-check", dir: "compiler", run: "cargo check --release --features node --lib --target x86_64-pc-windows-msvc", uses: ["cargo"], n: jobs, last: true, not: () => targets.includes("x86_64-pc-windows-msvc") ? null : "no x86_64-pc-windows-msvc target" },
].filter(s => s.run !== null && (quick ? s.quick : s.only !== "quick"));
if (flag("--list")) { for (const s of steps) console.log(s.id); process.exit(0); }
const names = s => (opt(s, "") || "").split(",").filter(Boolean), only = names("--only"), skip = names("--skip"), byId = new Map(steps.map(s => [s.id, s]));
let chosen = new Set(steps.map(s => s.id).filter(id => (!only.length || only.some(o => id.startsWith(o))) && !skip.some(o => id.startsWith(o))));
const need = id => { for (const d of byId.get(id)?.after ?? []) if (byId.has(d) && !skip.some(o => d.startsWith(o)) && !chosen.has(d)) { if (!/^(bench|generated|confined|editor|cargo-test)/.test(d)) { chosen.add(d); } need(d); } };
if (only.length) for (const id of [...chosen]) need(id);
const todo = steps.filter(s => chosen.has(s.id));
for (const s of todo) if (s.last) s.after = [...(s.after ?? []), ...todo.filter(x => !x.last).map(x => x.id)];

const log = path.resolve(opt("--log", path.join(repo, ".out/ci"))); rmSync(log, { recursive: true, force: true }); mkdirSync(log, { recursive: true });
const env = { ...process.env, SOLID_NEXT: solid, CARGO_BUILD_JOBS: String(jobs), GITHUB_WORKSPACE: repo, TIMEFORMAT: "%R %U %S" };
if (!cached) env.RX_NO_CACHE = "1";
const t0 = Date.now(), at = () => `${((Date.now() - t0) / 1000).toFixed(0).padStart(4)} s`;
const done = new Map(), running = new Map();
// what a step may grow to (RX_CI_MEM MB, 4000): a process of ours past it is stopped — ours: a descendant of this one
const LIMIT = (Number(process.env.RX_CI_MEM) || 4000) * 1024;
const watch = setInterval(() => {
  let ps; try { ps = execFileSync("ps", ["-Ao", "pid=,ppid=,rss=,comm="], { encoding: "utf8" }); } catch { return; }
  const p = new Map(ps.split("\n").map(l => /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(.*)$/.exec(l)).filter(Boolean).map(m => [Number(m[1]), { up: Number(m[2]), rss: Number(m[3]), c: m[4] }]));
  for (const [pid, x] of p) if (x.rss > LIMIT) { let q = x.up, k = 0; while (q > 1 && q !== process.pid && k++ < 60) q = p.get(q)?.up ?? 0; if (q === process.pid) { console.log(`${at()}  stopped ${pid} (${x.c}): ${Math.round(x.rss / 1024)} MB`); try { process.kill(pid, "SIGKILL"); } catch { /* ended */ } } }
}, 2000);
const stopAll = () => { for (const c of running.values()) if (c.child) try { process.kill(-c.child.pid, "SIGTERM"); } catch { /* ended */ } };
process.on("exit", stopAll); for (const s of ["SIGINT", "SIGTERM"]) process.on(s, () => process.exit(130));

/** A heavy step waits for the machine's lock first (its time is its own, not the wait's); in the quick tier, 30 s: a machine
 *  that is busy with another suite is no reason to wait for it. */
async function start(s) {
  const n0 = Math.min(s.n ?? 1, jobs); running.set(s.id, { child: null, s, n: n0 });
  const release = s.heavy ? await heavy(`${quick ? "quick" : "ci"} ${s.id}`, quick ? { want: n0, wait: 30, orNot: true, log() {} } : { want: n0, log: t => console.log(`${at()}  ${t}`) }) : () => {};
  if (!release) { running.delete(s.id); done.set(s.id, { not: "another heavy run holds the machine (node scripts/heavy.mjs --who)" }); console.log(`${at()}  part ${s.id.padEnd(22)} not run: the machine is busy`); return next(); }
  const file = path.join(log, `${s.id}.log`), n = Math.min(n0, release.n ?? n0), cmd = s.run;
  const child = spawn("bash", ["-c", `exec >${JSON.stringify(file)} 2>&1; time { ${cmd}\n} 2>&1; code=$?; exit $code`], { cwd: path.join(repo, s.dir), env: { ...env, RX_JOBS: String(n), BENCH_JOBS: String(n), ...release.env }, stdio: "ignore", detached: true });
  let late = false; const soft = quick && s.soft ? setTimeout(() => { late = true; try { process.kill(-child.pid, "SIGTERM"); } catch { /* ended */ } setTimeout(() => { try { process.kill(-child.pid, "SIGKILL"); } catch { /* ended */ } }, 3000); }, s.soft * 1000) : null;
  const began = Date.now(), wall = setTimeout(() => { try { process.kill(-child.pid, "SIGKILL"); } catch { /* ended */ } }, (s.limit ?? (Number(process.env.RX_CI_LIMIT) || 3600)) * 1000);
  running.set(s.id, { child, s, n });
  child.on("close", code => {
    clearTimeout(wall); clearTimeout(soft); release(); running.delete(s.id);
    if (late && code !== 0) { done.set(s.id, { not: `stopped after ${s.soft} s with part of it run (kept): again, or scripts/ci, for the rest`, wall: (Date.now() - began) / 1000 }); console.log(`${at()}  part ${s.id.padEnd(22)} ${((Date.now() - began) / 1000).toFixed(1).padStart(6)} s  more is new than there was time for`); return next(); }
    const text = existsSync(file) ? readFileSync(file, "utf8") : "", m = /(\d+[.,]\d+) (\d+[.,]\d+) (\d+[.,]\d+)\s*$/.exec(text), cpu = m ? Number(m[2].replace(",", ".")) + Number(m[3].replace(",", ".")) : null;
    const used = /cache: .*? — --no-cache/.exec(text)?.[0]?.replace(" — --no-cache", "");
    done.set(s.id, { ok: code === 0, wall: (Date.now() - began) / 1000, cpu });
    console.log(`${at()}  ${code === 0 ? "ok  " : "FAIL"} ${s.id.padEnd(22)} ${((Date.now() - began) / 1000).toFixed(1).padStart(6)} s${cpu === null ? "" : `  ${cpu.toFixed(1).padStart(6)} s cpu`}${used ? `  ${used}` : ""}`);
    if (code !== 0) console.log(text.trim().split("\n").filter(l => !/^\d+[.,]\d+ \d+/.test(l)).slice(-12).map(l => `          ${l.slice(0, 200)}`).join("\n"));
    next();
  });
}
let ended; const finished = new Promise(r => { ended = r; });
function next() {
  for (let more = true; more;) {
    more = false;
    for (const s of todo) {
      if (done.has(s.id) || running.has(s.id)) continue;
      const why = s.not?.(); if (why) { done.set(s.id, { not: why }); more = true; continue; }
      const needs = (s.after ?? []).filter(d => chosen.has(d)), lost = needs.find(d => done.get(d)?.ok === false && /^(npm|crate$|wasm|node-build|runtime$|bench-install)/.test(d));
      if (lost && !s.last) { done.set(s.id, { ok: false, not: `${lost} failed` }); console.log(`${at()}  FAIL ${s.id}: not run, ${lost} failed`); more = true; continue; }
      if (!needs.every(d => done.has(d))) continue;
      const busy = [...running.values()].flatMap(r => r.s.uses ?? []), uses = s.uses ?? [];
      if (uses.some(u => (u !== "binding-read" && busy.includes(u)) || (u === "binding" && busy.includes("binding-read")) || (u === "binding-read" && busy.includes("binding")))) continue;
      const load = [...running.values()].reduce((a, r) => a + r.n, 0), n = Math.min(s.n ?? 1, jobs);
      if (load && load + n > jobs) continue;
      start(s); more = true;
    }
  }
  if (!running.size) { if (todo.some(s => !done.has(s.id))) { console.log(`steps that wait for each other: ${todo.filter(s => !done.has(s.id)).map(s => s.id).join(", ")}`); process.exit(3); } ended(); }
}
console.log(`${quick ? "quick" : "everything"}: ${todo.length} steps, ${jobs} at once${cached ? ", results kept" : ", nothing kept from before"} — logs in ${path.relative(process.cwd(), log) || log}`);
next(); await finished; clearInterval(watch);
const rows = todo.map(s => ({ id: s.id, ...done.get(s.id) })), failed = rows.filter(r => r.ok === false), not = rows.filter(r => r.not && r.ok !== false);
const cpu = rows.reduce((a, r) => a + (r.cpu ?? 0), 0), wall = (Date.now() - t0) / 1000;
writeFileSync(path.join(log, "summary.json"), JSON.stringify({ quick, cached, jobs, wall, cpu, steps: rows }, null, 1));
for (const r of not) console.log(`not run: ${r.id}: ${r.not}`);
console.log(`\n${rows.filter(r => r.ok).length} passed, ${failed.length} failed${failed.length ? ` (${failed.map(r => r.id).join(", ")})` : ""}${not.length ? `, ${not.length} not run here` : ""} — ${wall.toFixed(0)} s, ${cpu.toFixed(0)} s of CPU; longest: ${rows.filter(r => r.wall).sort((a, b) => b.wall - a.wall).slice(0, 5).map(r => `${r.id} ${r.wall.toFixed(0)}`).join(", ")}`);
process.exit(failed.length ? 1 : 0);
