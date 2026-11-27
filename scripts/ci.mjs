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
import { budget, cores, heavy } from "./lib/lock.mjs";

const repo = path.resolve(import.meta.dirname, ".."), args = process.argv.slice(2), flag = f => args.includes(f), opt = (f, d) => { const i = args.indexOf(f); return i < 0 ? d : args[i + 1]; };
const quick = flag("--quick"), cached = (quick || flag("--cached")) && !flag("--no-cache") && !process.env.CI && process.env.RX_NO_CACHE !== "1";
// quick: one lease of the machine's cores for the whole run (scripts/lib/lock.mjs), what its steps share — it waits at most
// 30 s for it, and then goes on with its share of what the others leave
const lease = quick && !flag("--list") ? await heavy("quick", { want: Number(opt("--jobs")) || budget(), wait: 30, log() {} }) : null;
const jobs = Math.max(1, Number(opt("--jobs")) || lease?.n || cores());
const solid = path.resolve(process.env.SOLID_NEXT || path.join(repo, "../solid-next"));
const LS = "tooling/rx-language-server";
const has = c => { try { execFileSync("sh", ["-c", `command -v ${c}`], { stdio: "ignore" }); return true; } catch { return false; } };
const targets = (() => { try { return execFileSync("rustup", ["target", "list", "--installed"], { encoding: "utf8" }).split("\n"); } catch { return []; } })();
const installed = (dir, lock = "package-lock.json") => { try { return statSync(path.join(repo, dir, "node_modules")).mtimeMs >= 0 && statSync(path.join(repo, dir, "node_modules/.package-lock.json")).mtimeMs >= statSync(path.join(repo, dir, lock)).mtimeMs; } catch { return false; } };
const ci = dir => quick && installed(dir) ? null : "npm ci --no-audit --no-fund";
const strip = "node --experimental-strip-types --no-warnings", crate = ["", "--spa", "--whole-program", "--lower", "--project", "--text", "--text --lower", "--text --project"];
// quick's builds: the profile `checks` (compiler/Cargo.toml) — incremental, the crate not optimised, its dependencies as they
// ship — one compilation of the crate under rxc, the tests and the binding (compiler/checks). Its tests run right after it
// (every cargo run puts target/checks/rxc in place again, a moment with no file there: what runs rxc waits for them), and
// the WebAssembly builds, whose files are elsewhere, beside what runs rxc. `--release`: the builds that ship.
const fast = quick && !flag("--release"), target = path.join(repo, "compiler/target"), profile = fast ? "checks" : "release", rxc = path.join(target, profile, "rxc");
const lib = { darwin: "librx_checks.dylib", win32: "rx_checks.dll" }[process.platform] ?? "librx_checks.so", binding = `compiler.${process.platform}-${process.arch}${{ linux: "-gnu", win32: "-msvc" }[process.platform] ?? ""}.node`;
const FAST = {
  crate: `cargo build --profile checks -p reactivescript -p rx-checks --lib --bins --tests && cp target/checks/${lib} ${binding}.new && { cmp -s ${binding}.new ${binding} && rm ${binding}.new || mv -f ${binding}.new ${binding}; }`,
  wasm: "CARGO_PROFILE_CHECKS_OPT_LEVEL=1 cargo build --profile checks -p reactivescript -p rx-words --lib --target wasm32-unknown-unknown",
  "cargo-test": "cargo test --profile checks -p reactivescript -p rx-checks",
};
// …and the cores they keep busy, as measured (one crate, incremental: what cargo can run at once is a few units), so that
// what does not wait for them runs beside them; `ref-crate` runs the built rxc, which the WebAssembly builds do not touch;
// `ref-ssr` mostly waits for frames (`waits`: it runs as many processes as quick has), and what it has to run again (a
// change of the runtime) runs beside the benchmark's
const FAST_N = { crate: 2, wasm: 3, "cargo-test": 2, "ref-crate": 4, "ref-ssr": 4 };
const napi = "npx napi build --platform --release --features node --manifest-path ./Cargo.toml -- --lib";
const pluginOf = () => process.env.SOLID_VITE_PLUGIN ? null : "SOLID_VITE_PLUGIN is not set (a Solid plugin with context.resolve: compiler/README.md)";

/** The language server's tests (its package.json's `npm test`), a suite cut in shards cut in as many as there are
 *  processes to run them (`words-cases --shard i/4`: each of four was the longest of them, alone). */
function lsTests() {
  const cmds = [...JSON.parse(readFileSync(path.join(repo, LS, "package.json"), "utf8")).scripts.test.matchAll(/"(node [^"]+)"/g)].map(m => m[1]), out = [];
  for (const c of cmds) {
    const m = /^(.*) --shard (\d+)\/(\d+)$/.exec(c); if (!m) { out.push(c); continue; }
    if (m[2] !== "1") continue;
    const n = Math.max(Number(m[3]), jobs); for (let i = 1; i <= n; i++) out.push(`${m[1]} --shard ${i}/${n}`);
  }
  return out;
}
/** The suites that use what `t-vite` installs under compiler/test/.out: the plugin, the router. */
const NEED_VITE = ["vite-types", "ssr-router", "vite-hosts"];

/** The steps. `after`: what they need; `uses`: what two steps may not use at once — cargo's target folder, the bench's
 *  workspace, compiler/test/.out, the package's built files; `n`: how many processes it counts as (it is given that many; 0: one that mostly waits, on timers);
 *  `heavy`: several browsers, under the machine's lock (quick holds one lease for all of its steps); `eager` (quick): it starts while the steps that run take no more than half the cores, as the longest; `quick`: in the quick tier too; `not`: why it cannot run here. */
const steps = [
  { id: "npm-compiler", dir: "compiler", run: ci("compiler"), quick: true, skipQuietly: true },
  { id: "npm-runtime", dir: "runtime", run: ci("runtime"), quick: true, skipQuietly: true },
  { id: "npm-language-server", dir: LS, run: ci(LS), quick: true, skipQuietly: true },
  { id: "crate", dir: "compiler", run: "cargo build --release", uses: ["cargo"], n: jobs, quick: true },
  { id: "wasm", dir: "compiler", run: "cargo build --lib --release --target wasm32-unknown-unknown && cargo build -p rx-words --release --target wasm32-unknown-unknown", uses: ["cargo"], n: jobs, after: ["crate"], quick: true, not: () => targets.includes("wasm32-unknown-unknown") ? null : "no wasm32-unknown-unknown target (rustup target add)" },
  { id: "cargo-test", dir: "compiler", run: "cargo test --release", uses: ["cargo"], n: jobs, after: ["wasm"], quick: true },
  { id: "node-build", dir: "compiler", run: napi, uses: ["cargo", "binding"], n: jobs, after: ["npm-compiler", "cargo-test"], quick: true },
  { id: "runtime", dir: "runtime", run: "npm run -s build", after: ["npm-runtime"], quick: true },
  { id: "runtime-test", dir: "runtime", run: "npm test && npm pack --silent && rm -f *.tgz && node test.mjs", after: ["runtime", "node-build"], uses: ["binding-read"], quick: true },
  { id: "names", dir: ".", run: `${strip} compiler/test/names.mjs`, after: ["crate", "cargo-test"], quick: true },
  { id: "spec-refs", dir: ".", run: "node scripts/spec-refs.mjs", quick: true },
  { id: "tools", dir: ".", run: "node scripts/lock.test.mjs && node scripts/cache.test.mjs" },
  { id: "tools-worker", dir: ".", run: "node scripts/tools.test.mjs", after: ["wasm", "npm-language-server"] },
  { id: "ref-run", dir: "ref", run: "npm test -s", quick: true },
  { id: "ref-oracle", dir: "ref", run: "npm run -s oracle", n: 0, quick: true },
  { id: "ref-compiled", dir: "ref", run: "npm run -s compiled", n: 0, quick: true },
  { id: "ref-compiled-crate", dir: "ref", run: "RX_CRATE=1 npm run -s compiled", n: 0, after: ["crate", "cargo-test"], quick: true, only: "quick" },
  { id: "ref-types", dir: "ref", run: "npm run -s types", after: ["npm-language-server"], quick: true },
  { id: "ref-crate", dir: "ref", run: `node ../scripts/parallel.mjs ${crate.map(c => `"npm run -s crate -- ${c}"`).join(" ")}`, after: ["node-build"], uses: ["cargo"], n: jobs, quick: true },
  { id: "ref-ssr", dir: "ref", run: "npm run -s ssr", n: jobs, heavy: true, quick: true, waits: true },
  { id: "drafts", dir: ".", run: "node compiler/test/drafts.mjs", after: ["crate", "cargo-test", "runtime"], quick: true },
  { id: "lib", dir: ".", run: "node compiler/test/lib.mjs", after: ["node-build"], uses: ["binding-read"], quick: true },
  { id: "bench-install", dir: ".", run: 'test -d ../kobalte/packages/core/dist || { echo "no Kobalte built at ../kobalte (bench/package.json links it): sh ref/scripts/kobalte.sh"; exit 1; } && mkdir -p bench/.out/ws && cd bench/.out/ws && if cmp -s ../../package-lock.json node_modules/.installed-from-lock && cmp -s ../../package.json package.json; then echo installed; else cp ../../package.json ../../package-lock.json . && npm ci --no-audit --no-fund --legacy-peer-deps && cp package-lock.json node_modules/.installed-from-lock; fi', uses: ["ws"], quick: true },
  { id: "confined", dir: ".", run: "node compiler/test/confined.mjs", after: ["node-build", "bench-install", "runtime"], uses: ["ws"], quick: true },
  { id: "runtime-resolve", dir: ".", run: "node compiler/test/runtime-resolve.mjs", after: ["node-build", "bench-install", "runtime"], uses: ["ws", "binding-read"] },
  { id: "leaks", dir: ".", run: "node compiler/test/leaks.mjs", after: ["node-build", "bench-install", "runtime"], uses: ["ws", "binding-read"] },
  { id: "js-host", dir: ".", run: "node compiler/test/js-host.mjs", after: ["node-build", "bench-install", "runtime"], uses: ["ws", "binding-read"] },
  { id: "rows", dir: ".", run: "node compiler/test/rows.mjs", after: ["node-build", "bench-install", "runtime"], uses: ["ws", "binding-read"], quick: true },
  { id: "measure", dir: ".", run: "node bench/measure.test.mjs", after: ["wasm", "npm-language-server"], quick: true },
  { id: "generated", dir: ".", run: `${strip} bench/generated.mjs`, after: ["wasm", "node-build", "bench-install", "runtime", "npm-language-server"], uses: ["ws"], n: jobs, heavy: true },
  // the tasks and the coverage suite, in one pool (CI runs them apart: --tasks-only, --coverage-only, --shard)
  { id: "bench", dir: ".", run: "node bench/run.mjs --check --strict", after: ["generated", "confined", "wasm", "npm-language-server", "runtime"], uses: ["ws", "binding-read"], n: jobs, heavy: true, quick: true, eager: true },
  { id: "tree-sitter", dir: "tooling/tree-sitter-rx", run: "pnpm install --frozen-lockfile && pnpm run generate && git diff --exit-code -- src/ && pnpm test && pnpm run parse:repo && pnpm run query -- ../../examples/*.rx > /dev/null", not: () => has("pnpm") ? null : "no pnpm" },
  { id: "editor-ls", dir: LS, run: `node ../../scripts/parallel.mjs ${lsTests().map(c => JSON.stringify(c)).join(" ")} && RXC=${rxc} node test/run.js`, after: ["npm-language-server", "wasm", "crate", "runtime", "node-build"], n: jobs },
  { id: "editor-vscode", dir: "tooling/vscode-rx", run: "npm ci --no-audit --no-fund && npm run package && SERVER=dist/server.js node ../rx-language-server/test/run.js && rm -f *.vsix", after: ["editor-ls"], uses: ["ls-pack"] },
  { id: "editor-pack", dir: LS, run: "npm pack --silent && rm -f *.tgz", after: ["wasm", "editor-vscode"], uses: ["ls-pack"] },
  ...["vite-gate", "vite-types", "vite", "wardic", "formisch", "ssr-router", "start"].map(t => ({ id: `t-${t}`, dir: ".", run: t === "vite" ? `node scripts/parallel.mjs ${[1, 2, 3].map(i => `"node compiler/test/vite.mjs --shard ${i}/3"`).join(" ")}` : `node compiler/test/${t}.mjs`, after: ["node-build", "runtime", "npm-language-server", ...(NEED_VITE.includes(t) ? ["t-vite"] : [])], uses: ["binding-read"], n: t === "vite" ? jobs : 1, heavy: t === "vite" })),
  ...["vite-hosts", "vite-watch"].map(t => ({ id: `t-${t}`, dir: ".", run: `node compiler/test/${t}.mjs`, after: ["node-build", "runtime", ...(NEED_VITE.includes(t) ? ["t-vite"] : [])], uses: ["binding-read"], not: pluginOf })),
  { id: "proposals", dir: ".", run: "node proposals/check.mjs", after: ["node-build", "runtime", "npm-language-server"], uses: [], n: jobs, heavy: true },
  // the package as it is published, last: these write over the binding the suites above have loaded
  { id: "node-darwin", dir: "compiler", run: 'RUSTC="$(rustup which rustc)" npx napi build --platform --release --strip --features node --target aarch64-apple-darwin --manifest-path ./Cargo.toml -- --lib && npm test -s', uses: ["cargo", "binding"], n: jobs, last: true, not: () => process.platform === "darwin" && process.arch === "arm64" ? null : "another platform" },
  { id: "node-wasi", dir: "compiler", run: 'RUSTC="$(rustup which rustc)" npx napi build --platform --release --strip --features node --target wasm32-wasip1-threads --manifest-path ./Cargo.toml -- --lib && NAPI_RS_FORCE_WASI=1 npm test -s', uses: ["cargo", "binding"], n: jobs, last: true, not: () => targets.includes("wasm32-wasip1-threads") ? null : "no wasm32-wasip1-threads target" },
  { id: "win-check", dir: "compiler", run: "cargo check --release --features node --lib --target x86_64-pc-windows-msvc", uses: ["cargo"], n: jobs, last: true, not: () => targets.includes("x86_64-pc-windows-msvc") ? null : "no x86_64-pc-windows-msvc target" },
].map(s => !fast ? s : { ...s, run: s.id === "node-build" ? null : FAST[s.id] ?? s.run, n: FAST_N[s.id] ?? s.n, uses: s.id === "ref-crate" ? [] : s.uses, after: s.id === "cargo-test" ? ["crate"] : s.id === "wasm" ? ["cargo-test"] : s.after?.flatMap(d => d === "node-build" ? ["crate", "cargo-test"] : [d]) }).filter(s => s.run !== null && (quick ? s.quick : s.only !== "quick"));
if (flag("--list")) { for (const s of steps) console.log(s.id); process.exit(0); }
const names = s => (opt(s, "") || "").split(",").filter(Boolean), only = names("--only"), skip = names("--skip"), byId = new Map(steps.map(s => [s.id, s]));
let chosen = new Set(steps.map(s => s.id).filter(id => (!only.length || only.some(o => id.startsWith(o))) && !skip.some(o => id.startsWith(o))));
const need = id => { for (const d of byId.get(id)?.after ?? []) if (byId.has(d) && !skip.some(o => d.startsWith(o)) && !chosen.has(d)) { if (!/^(bench|generated|confined|editor|cargo-test)/.test(d)) { chosen.add(d); } need(d); } };
if (only.length) for (const id of [...chosen]) need(id);
const todo = steps.filter(s => chosen.has(s.id));
for (const s of todo) if (s.last) s.after = [...(s.after ?? []), ...todo.filter(x => !x.last).map(x => x.id)];

const log = path.resolve(opt("--log", path.join(repo, ".out/ci"))); rmSync(log, { recursive: true, force: true }); mkdirSync(log, { recursive: true });
const env = { ...process.env, SOLID_NEXT: solid, CARGO_BUILD_JOBS: String(jobs), GITHUB_WORKSPACE: repo, TIMEFORMAT: "%R %U %S", ...lease?.env };
if (!cached) env.RX_NO_CACHE = "1";
// (Node's own cache of compiled code — what a module's text compiles to, by its content: no result of a suite)
env.NODE_COMPILE_CACHE ??= path.join(repo, ".out/node-code");
if (fast) Object.assign(env, { RX_PROFILE: profile, RX_WASM: path.join(target, "wasm32-unknown-unknown/checks/reactivescript.wasm"), RX_WORDS_WASM: path.join(target, "wasm32-unknown-unknown/checks/rx_words.wasm") });
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

/** A heavy step waits for the machine's lock first (its time is its own, not the wait's). The quick tier holds one lease
 *  for the whole run (below): its heavy steps share it, and none waits for another of the same run. */
async function start(s) {
  const n0 = Math.min(s.n ?? 1, jobs); running.set(s.id, { child: null, s, n: n0 });
  const release = s.heavy && !quick ? await heavy(`ci ${s.id}`, { want: n0, log: t => console.log(`${at()}  ${t}`) }) : () => {};
  const file = path.join(log, `${s.id}.log`), n = Math.min(n0, release.n ?? n0), cmd = s.run;
  const procs = fast && s.waits ? jobs : Math.max(1, n);   // (one that mostly waits runs as many processes as the run has; it counts `n`)
  const child = spawn("bash", ["-c", `exec >${JSON.stringify(file)} 2>&1; time { ${cmd}\n} 2>&1; code=$?; exit $code`], { cwd: path.join(repo, s.dir), env: { ...env, RX_JOBS: String(procs), BENCH_JOBS: String(procs), ...(done.get("crate")?.ok ? { RX_BUILT: "1" } : {}), ...release.env }, stdio: "ignore", detached: true });
  const began = Date.now(), wall = setTimeout(() => { try { process.kill(-child.pid, "SIGKILL"); } catch { /* ended */ } }, (s.limit ?? (Number(process.env.RX_CI_LIMIT) || 3600)) * 1000);
  running.set(s.id, { child, s, n });
  child.on("close", code => {
    clearTimeout(wall); release(); running.delete(s.id);
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
      if (load && load + n > jobs && !(quick && s.eager && load <= jobs / 2)) continue;
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
