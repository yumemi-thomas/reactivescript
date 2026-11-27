// What bench/run.mjs runs a task with: the workspace (the libraries from npm, once), both checkers, rx-tsc, the compiled
// program on the server and in Chromium. See bench/README.md.
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import os from "node:os";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import { published } from "../compiler/scripts/published.mjs";
import * as cache from "../scripts/lib/cache.mjs";
import { bundle } from "../scripts/lib/bundle.mjs";
import * as tools from "../scripts/lib/tools.mjs";
import { linkedSolid } from "../scripts/lib/relink.mjs";

const require_ = createRequire(import.meta.url);
const { rowsOf, claimOf } = require_("../tooling/rx-language-server/src/rows.js");   // a declaration's rows, as the crate reads them
const { declares } = require_("../tooling/rx-language-server/src/load.js");   // …and the module it declares

export const here = path.dirname(fileURLToPath(import.meta.url));
export const repo = path.resolve(here, "..");
export const ws = path.join(here, ".out/ws");
export const rxc = process.env.RXC || path.join(repo, `compiler/target/${process.env.RX_PROFILE ?? "release"}/rxc`);

/** An install from a lockfile (`npm ci`), so that every machine has the same tree: `from` holds package.json and
 *  package-lock.json, `at` is where they are installed — once, and again when either changes. A tree npm resolved on
 *  its own (`npm install` with no lock) hoists what it likes, and what `rx-declare` drafts was once read off that. */
function installLocked(from, at) {
  mkdirSync(at, { recursive: true });
  const files = ["package.json", "package-lock.json"];
  for (const f of files) if (!existsSync(path.join(from, f))) throw new Error(`${path.relative(repo, path.join(from, f))} is missing: the benchmark installs from a lockfile (npm install --package-lock-only --legacy-peer-deps, in a copy of its folder, makes one)`);
  const same = f => existsSync(path.join(at, f)) && readFileSync(path.join(at, f), "utf8") === readFileSync(path.join(from, f), "utf8");
  // .installed holds the lock the tree was installed from: an install by hand (or an older harness) is redone once
  const stamp = path.join(at, "node_modules/.installed-from-lock");
  if (existsSync(path.join(at, "node_modules/solid-js")) && files.every(same) && existsSync(stamp) && readFileSync(stamp, "utf8") === readFileSync(path.join(from, "package-lock.json"), "utf8")) return;
  for (const f of files) writeFileSync(path.join(at, f), readFileSync(path.join(from, f), "utf8"));
  // packages the lock names by file (`file:vendor/x.tgz`: a library's fork, packed; each has its integrity in the lock)
  rmSync(path.join(at, "vendor"), { recursive: true, force: true });
  if (existsSync(path.join(from, "vendor"))) cpSync(path.join(from, "vendor"), path.join(at, "vendor"), { recursive: true });
  execFileSync("npm", ["ci", "--no-audit", "--no-fund", "--silent", "--legacy-peer-deps"], { cwd: at, stdio: "inherit" });
  writeFileSync(stamp, readFileSync(path.join(from, "package-lock.json"), "utf8"));
}
/** The workspace: bench/package.json installed from bench/package-lock.json (once; again when either changes), with this
 *  repository's compiler, runtime and language server linked as installed. Every task is a folder under it, so each
 *  resolves the same Solid. */
export function workspace() {
  installLocked(here, ws);
  linkOwn(path.join(ws, "node_modules"));
}
// ---- what is not run again (scripts/lib/cache.mjs) ----
/** BENCH_PROFILE=<file>: each operation and how long it took, a line each. */
const timed = (kind, f) => { if (!process.env.BENCH_PROFILE) return f(); const t = performance.now(); const end = () => writeFileSync(process.env.BENCH_PROFILE, `${kind}\t${(performance.now() - t).toFixed(0)}\t${process.argv.slice(2).join(" ")}\n`, { flag: "a" }); let r; try { r = f(); } catch (e) { end(); throw e; } if (r?.then) return r.finally(end); end(); return r; };
/** What every operation depends on, by content: hashed once, by the process that runs the suite, for those it starts. */
/** The folders over the workspace that hold packages (none does: a name that is not in the install is in no other). */
function above() { const out = []; for (let d = path.dirname(ws); ; d = path.dirname(d)) { const f = path.join(d, "node_modules"); if (existsSync(f)) out.push(`${cache.home(f)} ${readdirSync(f).sort().join()}`); if (path.dirname(d) === d) return out; } }
let shared_;
const DTS = /\.d\.[mc]?ts$/;
function shared() {
  if (shared_) return shared_;
  if (process.env.RX_SHARED_KEYS) return (shared_ = JSON.parse(process.env.RX_SHARED_KEYS));
  const at = (...p) => path.join(repo, ...p), nm = path.join(ws, "node_modules");
  shared_ = {
    harness: cache.inputs(...["harness.mjs", "run.mjs", "cover.mjs", "ref-check.ts", "probes"].map(f => at("bench", f)), ...["cache.mjs", "tools.mjs", "tool-worker.cjs", "bundle.mjs", "reads.cjs"].map(f => at("scripts/lib", f))),
    tools: cache.inputs(...["bin", "src", "package.json", "package-lock.json", "node_modules"].map(f => at("tooling/rx-language-server", f))),
    // …what a tool or a page whose process says what it reads (scripts/lib/reads.cjs) is keyed by instead: the language
    // server's own packages, and the declarations TypeScript (tsrs, a process of its own, which says nothing) may read in
    // this repository's packages — the source a tool loads is in its trace, file by file
    toolsDeps: cache.inputs(...["package.json", "package-lock.json", "node_modules"].map(f => at("tooling/rx-language-server", f))),
    types: [...["bin", "src"].map(d => cache.treeHash(at("tooling/rx-language-server", d), { keep: (r, n) => DTS.test(n) })), cache.inputs(...readdirSync(at("compiler")).filter(f => DTS.test(f)).map(f => at("compiler", f)), path.join(nm, "@reactivescript/compiler/package.json")), cache.treeHash(path.join(nm, "@reactivescript/runtime"), { keep: (r, n) => DTS.test(n) || n === "package.json" })],
    installed: [cache.treeHash(nm, { skip: (r, n) => r === "@reactivescript" || r === "@rx-types" || n === ".package-lock.json" }), cache.treeHash(path.join(nm, "@rx-types")), above()],
    // (the copies a program runs with, not what they were copied from: `workspace()` makes them again, a task run alone does not)
    runtime: cache.treeHash(path.join(nm, "@reactivescript/runtime")),
    // what a task that runs a build, or a process of its own, may reach: the compiler as it is built, and ref/
    builds: cache.inputs(rxc, ...["index.js", "vite.mjs", "lib.mjs", "package.json", "scripts"].map(f => at("compiler", f)), crateWasm, wordsWasm, ...(existsSync(at("compiler")) ? readdirSync(at("compiler")).filter(f => f.endsWith(".node")).map(f => at("compiler", f)) : []), ...["src", "compile", "check.ts", "disk.ts", "types"].map(f => at("ref", f))),
    browser: cache.browser(pw()),
  };
  cache.saveIndex();
  return shared_;
}
/** For the processes a suite starts: the hashes it has made. */
export const shareKeys = () => { if (cache.enabled) process.env.RX_SHARED_KEYS = JSON.stringify(shared()); };
/** A folder a task is staged in, its edits included. (What the crate's answers were written to is not its own: `compile`.) */
const folder = dir => cache.treeHash(dir, { skip: (r, n) => n === "node_modules" || /\.rx\.\d+\.(dom|ssr)\.mjs(\.entry\.mjs)?$/.test(n) });
/** A task's own install, where it has one. */
// (its copy of the runtime by its declarations: its code is in the trace of what runs it, as the workspace's is)
const deps = dir => { const l = path.join(dir, "node_modules"); return existsSync(l) ? cache.treeHash(l, { follow: true, skip: (r, n) => r === "@reactivescript/compiler" || r === "@reactivescript/language-server" || n === ".package-lock.json", keep: (r, n) => !r.startsWith("@reactivescript/runtime/") || DTS.test(n) || n === "package.json" }) : null; };
/** The crate's answers now, for questions an operation asked: the program compiled, or a tool's request of it, by the
 *  same build the tool asks (the WebAssembly one, unless RXC names a binary). */
let asked_;
function answer(a) {
  if (a.overlay && (a.k === "serve" || a.k === "trial")) { const { overlay, in: at, ...rest } = a; return withOverlay(at, overlay, () => answer(rest)); }
  if (a.k === "trial") { const f = `${a.at}.${process.pid}.trial.d.rx`; mkdirSync(path.dirname(f), { recursive: true }); writeFileSync(f, a.text); try { return anyTrial(answer({ ...a, k: "serve", method: "declaration", params: { file: f } })); } finally { rmSync(f, { force: true }); } }
  if (a.k === "app") return appOf(a.entry, a.target, a.spa);
  if (a.k === "file") return fileState(a.p);
  if (a.k === "tree") return cache.treeHash(a.p);
  if (a.k === "binding" || a.k === "rxc") return callAgain(a);
  if (a.k === "serve" && a.method === "words") { const k = wordsMemo(a); if (k && said_.has(k)) return said_.get(k); const r = serve(a); if (k) said_.set(k, r); return r; }
  if (a.k === "serve") return serve(a);
}
/** What rx-words answers reads the packages (the install's: the key's) and the task's own files: in one process, a
 *  question asked again of the same build, from a task's folder as it was, is answered as it was. */
const said_ = new Map();
function wordsMemo(a) {
  const tasks = path.join(ws, "tasks") + path.sep; if (!a.cwd?.startsWith(tasks)) return null;
  const id = a.cwd.slice(tasks.length).split(path.sep)[0], h = cache.fileHash(wordsWasm); if (!id || !h) return null;
  return `${h}\0${folder(path.join(tasks, id))}\0${JSON.stringify(a)}`;
}
// (`words` is the WebAssembly build's whatever RXC says, as src/rxc.js asks it: `rxc serve` has no such request)
function serve(a) {
  { if ((a.rxc || process.env.RXC) && a.method !== "words") { const r = spawnSync(rxc, ["serve"], { input: JSON.stringify({ id: 1, method: a.method, params: a.params }) + "\n", cwd: a.cwd, encoding: "utf8", maxBuffer: 1 << 28 }); return JSON.parse(r.stdout).result; } asked_ ??= require_("../tooling/rx-language-server/src/rxc.js").ask; const was = process.cwd(); try { process.chdir(a.cwd); return asked_(a.method, a.params); } finally { process.chdir(was); } }
}
/** The build that reads JavaScript (`words`): what it answers is in the packages' files and the task's — the key's, and the
 *  folders above, which have no packages (`above`, in the key) — so that, while it is the same file, its answers are. */
// (the files src/rxc.js loads, found as it finds them: a copy bundled beside it comes first, and a key of another file would
// keep an answer of the copy's)
const builds_ = require_("../tooling/rx-language-server/src/rxc.js");
const wordsWasm = (() => { try { return builds_.wordsPath(); } catch { return path.join(repo, "compiler/target/wasm32-unknown-unknown/release/rx_words.wasm"); } })();
const crateWasm = builds_.wasmPath() ?? path.join(repo, "compiler/target/wasm32-unknown-unknown/release/reactivescript.wasm");
/** What rx-declare reads the code with (compiler/words): without it, every draft says only "the code could not be read" —
 *  no word proven, every one a question — and a run measures the missing build, not the generator. A run refuses to start. */
export function needWords() {
  if (existsSync(wordsWasm)) return;
  console.error(`no ${wordsWasm}: rx-declare reads no code without it (every draft would be all questions). Build it: (cd compiler && cargo build -p rx-words --release --target wasm32-unknown-unknown)`);
  process.exit(1);
}
answer.by = a => a.k === "serve" && a.method === "words" ? cache.fileHash(wordsWasm) ?? undefined : undefined;
/** The questions for `rxc serve`, from one folder, in one process (it answers a line a line, each alone). */
answer.many = asks => {
  const out = new Array(asks.length).fill(undefined), by = new Map();
  asks.forEach((a, i) => { if (a.k === "serve" && a.method !== "words" && !a.overlay && (a.rxc || process.env.RXC)) by.set(a.cwd, [...(by.get(a.cwd) ?? []), i]); });
  for (const [cwd, is] of by) {
    if (is.length < 2) continue;
    const r = spawnSync(rxc, ["serve"], { input: is.map(i => JSON.stringify({ id: i, method: asks[i].method, params: asks[i].params })).join("\n") + "\n", cwd, encoding: "utf8", maxBuffer: 1 << 30 });
    for (const l of String(r.stdout ?? "").split("\n")) { if (!l) continue; let x; try { x = JSON.parse(l); } catch { continue; } if (is.includes(x.id)) out[x.id] = x.result; }
  }
  return out;
};
const told = (ask, said) => { const by = answer.by(ask); return { ask, said, ...(by ? { by } : {}) }; };
const anyTrial = r => JSON.parse(JSON.stringify(r ?? null).replace(/\.\d+\.trial\.d\.rx/g, ".trial.d.rx"));
// ---- what a process read (scripts/lib/reads.cjs) ----
/** The environment that has a process (and those it starts) say what of this repository it read, and what it asked the
 *  compiler's Node-API build or `rxc` itself, in `log`. `overlay`: with each call, the files of its folder changed since
 *  it began (a test that edits a file while a dev server runs). The builds themselves are not among the files: their
 *  answers are asked again, as the crate's are. */
const LSDIR = path.join(repo, "tooling/rx-language-server");
function readsRoots() {
  let binding; try { binding = realpathSync(path.join(repo, "compiler/index.js")); } catch { /* none */ }
  let own = []; try { own = readdirSync(path.join(ws, "deps")).map(d => path.join(ws, "deps", d, "node_modules/@reactivescript/runtime")); } catch { /* none */ }
  return {
    RX_READS_ROOTS: [LSDIR, path.join(repo, "compiler"), path.join(repo, "ref"), path.join(repo, "runtime"), path.join(ws, "node_modules/@reactivescript/runtime"), ...own].join(":"),
    RX_READS_SKIP: [path.join(LSDIR, "node_modules"), path.join(LSDIR, "src/rxc.wasm"), path.join(LSDIR, "src/words.wasm"), ...["target", "node_modules"].map(d => path.join(repo, "compiler", d)), path.join(repo, "ref/node_modules"), path.join(repo, "runtime/node_modules")].join(":"),
    ...(binding ? { RX_READS_BINDING: binding } : {}), RX_READS_RXC: rxc,
  };
}
export function readsEnv(log) {
  return {
    RX_READS: log, RX_READS_WRITES: ws, ...readsRoots(),
    NODE_OPTIONS: `${(process.env.NODE_OPTIONS ?? "").replaceAll(`--require ${cache.READS}`, "").trim()} --require ${cache.READS}`.trim(),
  };
}
/** The environment that has each call of the compiler say what the test had changed of `dir` when it was made (the
 *  folder as it is now, in `file`; this process's own calls too). */
function changesOf(dir, file) { globalThis.__rxReadsFrom?.(dir, file); return existsSync(file) ? { RX_READS_BASE: file, RX_READS_AT: dir } : {}; }
const fileState = p => cache.fileHash(p) ?? (existsSync(p) ? "not a file" : "absent");
/** A log of reads.cjs as a trace: a file by its content now, a call of the compiler by the hash of its answer; a file it
 *  wrote in the workspace outside `dir` (the test's own folder: its key's) by its content now too — what comes after
 *  holds it to be there (a declaration a build drafted beside the install). null: a log that is not read (the result
 *  is not kept). */
function readsOf(log, dir) {
  let text; try { text = readFileSync(log, "utf8"); } catch { return []; }
  const out = [], put = new Set(); out.overlays = new Map();
  for (const l of text.split("\n")) {
    if (!l) continue; let t; try { t = JSON.parse(l); } catch { return null; }
    if (t.traced) { out.overlays.set(t.traced, { at: t.at, overlay: t.overlay }); continue; }
    if (t.wrote) { if ((dir && (t.wrote === dir || t.wrote.startsWith(dir + path.sep))) || put.has(t.wrote)) continue; put.add(t.wrote); out.push(t.tree ? { ask: { k: "tree", p: t.wrote }, said: cache.said(cache.treeHash(t.wrote)) } : { ask: { k: "file", p: t.wrote }, said: cache.said(fileState(t.wrote)) }); continue; }
    if (t.read) out.push({ ask: { k: "file", p: t.read }, said: cache.said(fileState(t.read)) });
    else for (const k of ["binding", "rxc"]) if (t[k]) out.push({ ask: { k, args: t[k], cwd: t.cwd, at: t.at, overlay: t.overlay ?? {} }, said: cache.said(t.said) });
  }
  return out;
}
const sha = x => createHash("sha256").update(x).digest("hex").slice(0, 40);
/** `f()` with the files of `overlay` (by their path in `cwd`; null: none there) as they were when the call was made. */
function withOverlay(cwd, overlay, f) {
  const was = []; try {
    for (const [rel, text] of Object.entries(overlay ?? {})) { const at = path.join(cwd, rel); let had = null; try { had = readFileSync(at, "utf8"); } catch { /* none */ } was.push([at, had]); if (text === null) rmSync(at, { force: true }); else { mkdirSync(path.dirname(at), { recursive: true }); writeFileSync(at, text); } }
    return f();
  } finally { for (const [at, had] of was.reverse()) { if (had === null) rmSync(at, { force: true }); else writeFileSync(at, had); } }
}
let binding_;
/** A call of the compiler a process made, made again here: the hash of its answer, as reads.cjs took it. */
function callAgain(a) {
  return withOverlay(a.at ?? a.cwd, a.overlay, () => {
    if (a.k === "binding") { binding_ ??= require_("../compiler/index.js"); const was = process.cwd(); let r; try { process.chdir(a.cwd); r = String(binding_.app(...a.args)); } catch (e) { r = `threw ${String(e?.message ?? e)}`; } finally { process.chdir(was); } return sha(r); }
    const r = spawnSync(rxc, a.args, { cwd: a.cwd, encoding: "utf8", maxBuffer: 1 << 28 }); return sha(`${r.status} ${String(r.stdout)}`);
  });
}

/** What a traced process asked of the crate (src/rxc.js, RX_TRACE); null: a log that is not read, and a result that is not kept. */
function asks(log, viaRxc, overlays = new Map()) {
  let text; try { text = readFileSync(log, "utf8"); } catch { return []; }
  // (a question asked while a test had files of its folder changed — a copy it made, an edit — is asked again with them: reads.cjs)
  try { return text.split("\n").filter(Boolean).map(l => { const t = JSON.parse(l), o = overlays.get(sha(l + "\n")), at = { rxc: viaRxc, cwd: t.cwd, ...(o ? { in: o.at, overlay: o.overlay } : {}) }; return t.trial !== undefined ? { ask: { k: "trial", at: t.params.file.replace(/\.\d+\.trial\.d\.rx$/, ""), text: t.trial, ...at }, said: cache.said(anyTrial(t.result)) } : told({ k: "serve", method: t.method, params: t.params, ...at }, cache.said(t.result)); }); } catch { return null; }
}
/** 09 MO-8l: the declaration generated for a package as a module imports it (src/generate.js), written where the compiler
 *  finds it; what a suite asks for with `node_modules/.rx-types` empty. */
export function generate(spec, from) {
  const { rootOf, ensureDeclarations } = require_("../tooling/rx-language-server/src/generate.js");
  const root = rootOf(spec.split("/").slice(0, spec[0] === "@" ? 2 : 1).join("/"), path.dirname(from)); if (!root) return;
  const file = `${path.join(root, "node_modules/.rx-types", spec)}.d.rx`, folders = path.dirname(file);
  const key = cache.enabled ? { spec, from: path.dirname(from), environment: cache.environment(), near: cache.inputs(path.join(root, "package.json"), path.join(path.dirname(from), "package.json")), ...pick("harness", "tools", "installed", "types") } : null;
  const r = cache.resultSync("generate", key, answer, () => timed("generate", () => {
    const log = cache.enabled ? path.join(ws, `.trace-${process.pid}`) : null; if (log) { rmSync(log, { force: true }); process.env.RX_TRACE = log; }
    let out; try { out = ensureDeclarations(from, { text: `import { a } from ${JSON.stringify(spec)}\n` }); } finally { delete process.env.RX_TRACE; }
    const trace = log ? asks(log, !!process.env.RXC) : []; if (log) rmSync(log, { force: true });
    const text = out[0]?.status === "written" ? readFileSync(file, "utf8") : null;
    return { value: { status: out[0]?.status, text }, trace, files: {} };
  }));
  if (!r.hit && r.value.text !== null) { rmSync(file, { force: true }); r.keep(true); }   // (asked again as it was asked: with no draft there)
  if (r.value.text !== null && !existsSync(file)) { mkdirSync(folders, { recursive: true }); writeFileSync(`${file}.${process.pid}.tmp`, r.value.text); renameSync(`${file}.${process.pid}.tmp`, file); }
}
/** A tool of the language server, run over a folder: `{ status, signal, stdout, stderr, extra, keep }`. `keep(ok)`: the
 *  answer is kept, if whoever judges it says it is right. `file`: one it writes beside its answer (its name is this
 *  process's, so it is no part of the key). `sealed`: it reaches more of the crate than the requests it makes (a host's
 *  routes, a build's output): keyed by the builds themselves. */
let asked = 0;
function tool(kind, flags, bin, args, { cwd, dir = cwd, env = {}, timeout, file, sealed = opaque.has(dir) }) {
  const at = bin => path.join(repo, "tooling/rx-language-server/bin", bin);
  // (what of this repository it ran — the language server's modules, the runtime's, the compiler's calls — is in its trace: reads.cjs)
  const key = cache.enabled ? { flags, bin, args, cwd, dir, env, environment: cache.environment(), rxc: !!(env.RXC ?? process.env.RXC), folder: folder(dir), deps: deps(dir), timeout, sealed, ...pick("harness", "toolsDeps", "types", "installed") } : null;
  const r = cache.resultSync(`tool ${kind}`, key, answer, () => once(kind, args, flags, dir, env, traced => timed(kind, () => {
    const log = cache.enabled || traced ? path.join(ws, `.trace-${process.pid}`) : null, reads = log && `${log}.${++asked}.reads`;   // (a new one each time: a worker that runs it remembers what it said in each) if (log) { rmSync(log, { force: true }); rmSync(reads, { force: true }); }
    if (file) rmSync(file, { force: true });
    const given = [...args, ...(file ? ["--causes", file] : [])], around = { cwd, timeout, env: { ...process.env, ...env, ...(log ? { RX_TRACE: log, ...readsEnv(reads) } : {}) } };
    // (what runs the package — rx-verify, a draft made with --run — is a process of its own: the module's state is)
    const r = (bin !== "verify.js" && !given.includes("--run") && !given.includes("--dom") && tools.ask(bin, given, around)) || spawnSync(process.execPath, [...flags, at(bin), ...given], { ...around, encoding: "utf8", maxBuffer: 1 << 26 });
    let extra; if (file) { try { extra = readFileSync(file, "utf8"); } catch { /* none */ } rmSync(file, { force: true }); }
    const said = log ? asks(log, !!(env.RXC ?? process.env.RXC)) : [], read = log ? readsOf(reads, dir) : [], trace = said && read && [...said, ...read], files = {};
    if (log) { try { for (const m of readFileSync(log, "utf8").matchAll(/"([^"]*node_modules\/\.rx-types\/[^"]+\.d\.rx)"/g)) if (existsSync(m[1])) files[m[1]] = readFileSync(m[1], "utf8"); } catch { /* it asked nothing */ } rmSync(log, { force: true }); rmSync(reads, { force: true }); }
    return { value: { status: r.status, signal: r.signal, stdout: r.stdout, stderr: r.stderr, extra }, trace, files };
  })));
  return { ...r.value, keep: ok => r.keep(ok && !r.value.signal) };
}
/** A package's draft is one for every program of a run that asks for it (a library of fifteen entries is drafted whole by
 *  each): it depends on the install, which is the workspace's, and on the crate's answers — asked again from the folder that
 *  asks, and each must be the one it was made with. Not of a folder with an install of its own, nor of a module beside it. */
function once(kind, args, flags, dir, env, run) {
  const spec = args[0];
  if (kind !== "draft" || !process.env.RX_RUN || /^[./]/.test(spec) || ["node_modules", "package.json"].some(f => existsSync(path.join(dir, f)))) return run(false);
  const at = path.join(process.env.RX_RUN, cache.said([args, flags, env])), lock = `${at}.lock`, file = `${at}.json`, pause = new Int32Array(new SharedArrayBuffer(4));
  let mine = false; const until = Date.now() + 300000;
  while (!existsSync(file) && Date.now() < until) { try { mkdirSync(lock); mine = true; break; } catch { Atomics.wait(pause, 0, 0, 5); } }
  let kept; if (!mine) try { kept = JSON.parse(readFileSync(file, "utf8")); } catch { /* none was made */ }
  if (kept) {
    const to = (x, a, b) => JSON.parse(JSON.stringify(x ?? null).replaceAll(JSON.stringify(a).slice(1, -1), JSON.stringify(b).slice(1, -1)));
    const trace = kept.trace.map(t => { const ask = to(t.ask, kept.dir, dir); let now; try { now = answer(ask); } catch { return null; } return cache.said(to(now, dir, kept.dir)) === t.said ? told(ask, cache.said(now)) : null; });
    if (trace.every(Boolean)) return { value: kept.value, trace, files: {} };
    return run(false);
  }
  const r = run(true);
  if (mine) { if (r.value.status === 0 && r.trace && !JSON.stringify(r.value).includes(dir)) { writeFileSync(`${file}.tmp`, JSON.stringify({ dir, ...r })); renameSync(`${file}.tmp`, file); } else writeFileSync(file, "null"); }
  return r;
}
const pick = (...ks) => Object.fromEntries(ks.map(k => [k, shared()[k]]));
/** Folders whose task reaches past the crate's answers: it prepares itself with a build, or is under a JS host. */
const opaque = new Set();
export const reaches = dir => opaque.add(dir);
/** What a task does with its compiled program (`drive(h)`): the checks it made, the problems the page reported, what it
 *  threw. Kept under the crate's answer for each program it compiled. A task whose file imports anything, or reads the
 *  process, may do anything: it is keyed by the builds; one that looks at a moment of an animation is run every time. */
export async function driven(what, { dir, entry, spa, module }, drive) {
  const text = readFileSync(module, "utf8"), free = /\bimport\b(?!\.meta)|\brequire\b|\bprocess\b/.test(text.replace(/^import \{ use \} from "\.\.\/\.\.\/\.\.\/cover\.mjs";$/m, ""));
  // a task that starts processes of its own (a build, a dev server, a tool) is keyed by the runtime whole (a bundler reads
  // it in code of its own, which says nothing) and by what this process and its processes read and asked (reads.cjs); one
  // that does not, by what its page loads: its programs as the crate compiles them, and the runtime's files in its bundle
  const wide = free || opaque.has(dir);
  const key = cache.enabled && !/\b(?:Date\.now|performance\.now|getComputedStyle|opacity)\b/.test(text) ? { what, entry, spa, module: cache.treeHash(path.dirname(module)), dir, environment: cache.environment(), folder: folder(dir), deps: deps(dir), wide, ...pick("harness", "installed", "browser", ...(wide ? ["runtime", "toolsDeps", "types"] : [])) } : null;
  const r = await cache.result("drive", key, answer, () => timed("drive", async () => {
    const h = new Runner(dir, entry, spa); let threw = "", stack = "";
    const log = path.join(ws, `.drive-${process.pid}`), reads = `${log}.reads`; rmSync(log, { force: true }); rmSync(reads, { force: true });
    const env = wide && cache.enabled ? { RX_TRACE: log, ...readsEnv(reads), ...changesOf(dir, `${log}.base`) } : {}, was = Object.fromEntries(Object.keys(env).map(k => [k, process.env[k]]));
    Object.assign(process.env, env);
    try { await drive(h); } catch (e) { threw = String(e.message ?? e); stack = e.stack ?? String(e); }
    finally { for (const [k, v] of Object.entries(was)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } globalThis.__rxReadsFrom?.(null); }
    await h.close();
    let trace = h.asked;
    if (wide && cache.enabled) { const read = readsOf(reads, dir), said = asks(log, !!process.env.RXC, read?.overlays), own = [...(globalThis.__rxReadsAll ?? [])].map(p => ({ ask: { k: "file", p }, said: cache.said(fileState(p)) })); trace = said && read && globalThis.__rxReadsAll ? [...trace, ...said, ...read, ...own] : null; }
    rmSync(log, { force: true }); rmSync(reads, { force: true }); rmSync(`${log}.base`, { force: true });
    return { value: { checks: h.checks, problems: h.problems, threw, stack }, trace, files: {} };
  }));
  return { ...r.value, keep: r.keep };
}

/** A task's `prepare(dir)` (a build before anything reads the program: the route tree a router's plugin writes, the app
 *  a page is served from): what it wrote is kept, under what it read and asked as a page that starts processes is
 *  (`driven`), and written again where nothing it depends on has changed. */
export async function prepared(id, module, dir, prepare) {
  const key = cache.enabled ? { id, module: cache.treeHash(path.dirname(module)), dir, environment: cache.environment(), folder: folder(dir), deps: deps(dir), ...pick("harness", "installed", "runtime", "toolsDeps", "types") } : null;
  const r = await cache.result("prepare", key, answer, async () => {
    const log = path.join(ws, `.prepare-${process.pid}`), reads = `${log}.reads`; rmSync(log, { force: true }); rmSync(reads, { force: true });
    const before = texts(dir), envBefore = { ...process.env }, env = cache.enabled ? { RX_TRACE: log, ...readsEnv(reads), ...changesOf(dir, `${log}.base`) } : {}, was = Object.fromEntries(Object.keys(env).map(k => [k, process.env[k]]));
    Object.assign(process.env, env);
    try { await prepare(dir); } finally { for (const [k, v] of Object.entries(was)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } globalThis.__rxReadsFrom?.(null); }
    // (what it set in this process's environment — rx-package's RXC — is set again where it is not run)
    const after = texts(dir), files = {}, removed = [], setEnv = Object.fromEntries(Object.entries(process.env).filter(([k, v]) => envBefore[k] !== v)), unset = Object.keys(envBefore).filter(k => !(k in process.env));
    for (const [f, t] of after) if (JSON.stringify(before.get(f)) !== JSON.stringify(t)) files[f] = t;
    for (const f of before.keys()) if (!after.has(f)) removed.push(f);
    let trace = null;
    if (cache.enabled && before.complete && after.complete) { const read = readsOf(reads, dir), said = asks(log, !!process.env.RXC, read?.overlays), own = [...(globalThis.__rxReadsAll ?? [])].map(p => ({ ask: { k: "file", p }, said: cache.said(fileState(p)) })); trace = said && read && globalThis.__rxReadsAll ? [...said, ...read, ...own] : null; }
    rmSync(log, { force: true }); rmSync(reads, { force: true }); rmSync(`${log}.base`, { force: true });
    return { value: { files, removed, env: setEnv, unset }, trace, files: {} };
  });
  // (written here, not by the cache before it asks again: what the build asked, it asked of the folder as it was before it)
  if (r.hit) { for (const [f, t] of Object.entries(r.value.files)) { mkdirSync(path.dirname(path.join(dir, f)), { recursive: true }); writeFileSync(path.join(dir, f), typeof t === "string" ? t : Buffer.from(t.base64, "base64")); } for (const f of r.value.removed) rmSync(path.join(dir, f), { force: true }); Object.assign(process.env, r.value.env ?? {}); for (const k of r.value.unset ?? []) delete process.env[k]; }
  else r.keep(true);
}
/** The files of a task's folder, as text (one that is not, `{ base64 }`) — those of a folder it links to (its own
 *  install) are not its; `complete`: there are not too many. */
function texts(dir) {
  const out = new Map(); out.complete = true;
  const walk = rel => { for (const e of readdirSync(path.join(dir, rel), { withFileTypes: true })) {
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isSymbolicLink() || /\.rx\.\d+\.(dom|ssr)\.mjs/.test(e.name)) continue;
    if (e.isDirectory()) { walk(r); continue; } if (!e.isFile()) continue;
    const b = readFileSync(path.join(dir, r)), t = b.toString("utf8");
    if (out.size > 5000) out.complete = false; out.set(r, Buffer.from(t, "utf8").equals(b) ? t : { base64: b.toString("base64") });
  } };
  walk(""); return out;
}

/** The compiler as npm installs it: a folder with the manifest it is published with (compiler/scripts/published.mjs:
 *  the runtime its dependency, Solid its peer — what Solid's plugin reads to load the runtime with the app, so no task
 *  lists the runtime for the plugin's sake) and the files it ships, each linked to the repository's. */
export function installCompiler(at) {
  mkdirSync(at, { recursive: true });
  const from = path.join(repo, "compiler"), read = f => JSON.parse(readFileSync(f, "utf8"));
  writeFileSync(path.join(at, "package.json"), JSON.stringify(published(read(path.join(from, "package.json")), read(path.join(repo, "runtime/package.json"))), null, 2) + "\n");
  for (const f of ["index.js", "index.d.ts", "vite.mjs", "vite.d.mts", "lib.mjs", "README.md"]) symlinkSync(path.join(from, f), path.join(at, f));
}
/** This repository's packages in a node_modules, as an app installs them: the compiler and the language server linked,
 *  the runtime copied (its peers are then that install's Solid, one copy), the shipped declaration of solid-js copied. */
function linkOwn(nm) {
  const rx = path.join(nm, "@reactivescript");
  // what Vite's dev server pre-bundled is a copy of the runtime it found then: with another runtime it is out of date,
  // and a task's dev server would run the old one (`__rt.slot is not a function` under a runtime that has it)
  const built = f => { try { return readFileSync(path.join(f, "dist/web.js"), "utf8"); } catch { return ""; } };
  if (built(path.join(rx, "runtime")) !== built(path.join(repo, "runtime"))) rmSync(path.join(nm, ".vite"), { recursive: true, force: true });
  rmSync(rx, { recursive: true, force: true }); mkdirSync(path.join(rx, "runtime"), { recursive: true });
  installCompiler(path.join(rx, "compiler"));
  symlinkSync(path.join(repo, "tooling/rx-language-server"), path.join(rx, "language-server"));
  for (const f of ["package.json", "dist", "rx-lib.d.ts"]) cpSync(path.join(repo, "runtime", f), path.join(rx, "runtime", f), { recursive: true });
  // and the declaration of Solid itself the repository ships (09 MO-8k, a shared declaration): @rx-types/solid-js, copied
  // (a link's real path would be this repository's, where a folder named `rx-types` is a project's own declarations)
  const shared = path.join(nm, "@rx-types"); rmSync(path.join(shared, "solid-js"), { recursive: true, force: true }); mkdirSync(shared, { recursive: true });
  cpSync(path.join(repo, "declarations/solid-js"), path.join(shared, "solid-js"), { recursive: true });
}
/** A task with a package.json of its own (beside its task.mjs, with its package-lock.json) has an install of its own,
 *  for a library that pins another version of what the workspace holds: installed from that lock into
 *  bench/.out/ws/deps/<id> (once; again when either changes). */
function ownInstall(id) {
  const from = path.join(here, "tasks", id); if (!existsSync(path.join(from, "package.json"))) return null;
  const at = path.join(ws, "deps", id);
  installLocked(from, at);
  linkOwn(path.join(at, "node_modules"));
  return path.join(at, "node_modules");
}

/** How many processes a run uses: BENCH_JOBS, else its lease of the machine, else half the cores (the machine is someone's). What a run says does not
 *  depend on it: each result is kept at its place in the list. */
export let jobs = Math.max(1, Number(process.env.BENCH_JOBS) || Math.floor(os.availableParallelism() / 2));
/** …and what a run was given (scripts/lib/lock.mjs), where BENCH_JOBS does not say. */
export const given = lease => { Object.assign(process.env, lease.env); if (!Number(process.env.BENCH_JOBS)) jobs = lease.n; };
/** `fn` of each item, `jobs` at a time (with every other pool's); of the items `few` picks (a dev server, a production build) at most two at a
 *  time (three where there are eight processes or more): they wait on their own timers and on a whole toolchain. Answers the results in the items' order. */
export async function pool(items, fn, few = () => false) {
  const out = new Array(items.length), waiting = items.map((x, i) => i); let mine = 0, ended;
  const done = new Promise(res => { ended = res; }); if (!items.length) return out;
  const next = () => {
    while (busy < jobs) {
      const k = waiting.findIndex(i => busyFew < (jobs >= 8 ? 6 : 2) || !few(items[i])); if (k < 0) break;
      const i = waiting.splice(k, 1)[0], h = few(items[i]); busy++; mine++; if (h) busyFew++;
      fn(items[i], i).then(r => { out[i] = r; }, e => { out[i] = { crash: e.stack ?? String(e) }; }).finally(() => { busy--; mine--; if (h) busyFew--; if (!waiting.length && !mine) { pools.delete(next); ended(); } for (const p of [...pools]) p(); });
    }
  };
  pools.add(next); next(); await done;
  return out;
}
/** (several pools at once — the tasks' and the coverage suite's — share the `jobs` processes, the first one's items first) */
const pools = new Set(); let busy = 0, busyFew = 0;
/** A browser for a process to be started: `{ env, back() }`. */
const browsers = [], upBrowsers = new Set();
async function lendBrowser() {
  if (!tools.enabled) return { env: {}, back() {} };
  let b; while ((b = browsers.pop()) && b.gone);
  if (!b) try { const server = await pw().chromium.launchServer({ handleSIGINT: false, handleSIGTERM: false, handleSIGHUP: false }); b = { server, gone: false }; upBrowsers.add(b); server.on("close", () => { b.gone = true; upBrowsers.delete(b); }); } catch { return { env: {}, back() {} }; }
  return { env: { RX_BROWSER: b.server.wsEndpoint() }, back() { if (!b.gone) browsers.push(b); } };
}
export const end = async () => { saveTook(); await Promise.all([tools.end(), ...[...upBrowsers].map(b => b.server.close().catch(() => {}))]); };
/** How long each task, entry and draft took in the runs before (seconds; bench/.out/ws/.took.json): a pool starts the
 *  longest first, so that what has to run again — a result no longer kept — is not left alone at the end of the run. */
const tookAt = path.join(ws, ".took.json"); let took_;
export const took = id => (took_ ??= (() => { try { return JSON.parse(readFileSync(tookAt, "utf8")); } catch { return {}; } })())[id];
const tookNow = {};
function saveTook() { if (!Object.keys(tookNow).length) return; try { const all = { ...(took(""), took_), ...tookNow }; writeFileSync(`${tookAt}.${process.pid}`, JSON.stringify(all)); renameSync(`${tookAt}.${process.pid}`, tookAt); } catch { /* not kept */ } }
/** The items longest first (one never timed first of all: it may be new), `long` ones before the rest. */
export const longestFirst = (items, idOf, long = () => false) => items.map((x, i) => ({ x, i, t: (long(x) ? 1e6 : 0) + (took(idOf(x)) ?? 1e5) })).sort((a, b) => b.t - a.t || a.i - b.i).map(e => e.x);
/** `run.mjs` again, for one task, entry or draft (`args`), in a process of its own; its result is read from
 *  `tasks/<id>.result.json` (one left by an earlier run is not taken for it). What it says on stderr is said when it
 *  ends. `crash`: what stands for a result that is not there. */
/** Several of them (`[{ args, id, crash }]`: a `--cover` or a `--draft` each) in one process, one after the other: the
 *  results in their order. */
export async function together(items, timeout = 900000) {
  if (items.length === 1) { const [x] = items; return [await alone(x.args, x.id, x.crash, timeout)]; }
  const b = await lendBrowser();
  for (const x of items) rmSync(path.join(ws, "tasks", `${x.id}.result.json`), { force: true });
  const [, err] = await aloneWith(b, items.flatMap(x => x.args), `.together-${process.pid}`, x => ({ crash: x }), timeout * items.length); b.back();
  return items.map(x => { let r; try { r = JSON.parse(readFileSync(path.join(ws, "tasks", `${x.id}.result.json`), "utf8")); } catch { r = x.crash(`no result (the process of ${items.length}) ${err.trim().split("\n").slice(-3).join(" | ").slice(0, 400)}`); } if (r.cache) { cache.merge(cache.stats, r.cache); delete r.cache; } if (r.took !== undefined) { tookNow[x.id] = r.took; delete r.took; } return [r, err]; });
}
export const alone = async (args, id, crash, timeout = 600000) => { const b = await lendBrowser(), t = Date.now(); const r = await aloneWith(b, args, id, crash, timeout); b.back(); tookNow[id] = (Date.now() - t) / 1000; return r; };
const aloneWith = (browser, args, id, crash, timeout) => new Promise(res => {
  const at = path.join(ws, "tasks", `${id}.result.json`); rmSync(at, { force: true });
  const worker = tools.lend();
  // (with reads.cjs: what it loads itself is part of what a page that starts processes of its own is keyed by)
  const c = spawn(process.execPath, ["--experimental-strip-types", "--no-warnings", ...(cache.enabled ? ["--require", cache.READS] : []), path.join(here, "run.mjs"), ...args], { stdio: ["ignore", "ignore", "pipe"], env: { ...process.env, ...worker.env, ...browser.env, ...(cache.enabled ? readsRoots() : {}) } });
  let err = ""; c.stderr.on("data", d => { err += d; });
  const timer = setTimeout(() => c.kill("SIGKILL"), timeout);
  c.on("close", (code, signal) => { clearTimeout(timer); worker.back(); let r; try { r = JSON.parse(readFileSync(at, "utf8")); } catch { r = crash(`no result (exit ${code}${signal ? `, ${signal}` : ""}) ${err.trim().split("\n").slice(-3).join(" | ").slice(0, 400)}`); } if (r.cache) { cache.merge(cache.stats, r.cache); delete r.cache; } delete r.took; res([r, err]); });
});

/** A record as data, one line an entry: what `--check` compares with, and a diff shows entry by entry. */
export const compact = o => `{\n${Object.entries(o).map(([k, v]) => `${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(",\n")}\n}\n`;
/** What rx-verify runs a package's rows with is one file a package (bench/probes/<spec>.probe.mjs), put beside each
 *  declaration of it (`rx-types/<spec>.d.rx`) that has no probe of its own. */
function shareProbes(dir) {
  for (const f of readdirSync(dir, { recursive: true })) {
    const at = f.split(path.sep); const i = at.indexOf("rx-types"); if (i < 0 || !f.endsWith(".d.rx")) continue;
    const probe = path.join(here, "probes", `${at.slice(i + 1).join("/").slice(0, -".d.rx".length)}.probe.mjs`), to = path.join(dir, f.replace(/\.d\.rx$/, ".probe.mjs"));
    if (existsSync(probe) && !existsSync(to)) cpSync(probe, to);
  }
}
/** A task's folder in the workspace: its `src/`, copied fresh. A coverage entry (bench/coverage/<group>/<name>, `from`)
 *  is staged the same way, beside the tasks, under a name of its own. */
export function stage(id, from) {
  const dir = path.join(ws, "tasks", id);
  rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true });
  // a group's own `rx-types/` is the project's every entry of it is in (09 MO-8k: a declaration is found in a folder above)
  if (from && existsSync(path.join(from, "../rx-types"))) cpSync(path.join(from, "../rx-types"), path.join(dir, "rx-types"), { recursive: true });
  cpSync(from ?? path.join(here, "tasks", id, "src"), dir, { recursive: true });
  shareProbes(dir);
  const own = from ? null : ownInstall(id); if (own) symlinkSync(own, path.join(dir, "node_modules"), "dir");
  for (const f of ["vite.config.ts", "vite.config.mjs", "vite.config.js"]) if (existsSync(path.join(dir, f))) writeFileSync(path.join(dir, f), linkedSolid(readFileSync(path.join(dir, f), "utf8")));   // Solid is the pin's, linked (scripts/lib/relink.mjs)
  if (!existsSync(path.join(dir, "tsconfig.json"))) writeFileSync(path.join(dir, "tsconfig.json"), JSON.stringify({ compilerOptions: { jsx: "preserve", jsxImportSource: "@solidjs/web", strict: true, noImplicitAny: true, target: "ES2022", module: "ESNext", moduleResolution: "Bundler", allowImportingTsExtensions: true, noEmit: true, skipLibCheck: true, lib: ["ES2023", "DOM", "DOM.Iterable"], types: [] }, include: ["**/*.rx", "**/*.d.ts"], exclude: ["node_modules", "dist", ".build"] }, null, 2));
  return dir;
}

const codes = ds => ds.map(d => `${d.code}@${path.basename(d.file ?? "")}:${d.line}`);
/** The crate's diagnostics for a program (`rxc check --json`). */
export const crate = (entry, spa, host) => timed("crate", () => crateNow(entry, spa, host));
function crateNow(entry, spa, host) {
  const r = spawnSync(rxc, ["check", "--json", ...(spa ? ["--spa"] : []), ...(host ? ["--whole-program", "--host", entry] : []), entry], { encoding: "utf8", maxBuffer: 1 << 26 });
  try { const out = JSON.parse(r.stdout); return { diagnostics: out.diagnostics ?? [], advice: out.advice ?? [] }; } catch { return { diagnostics: [{ code: "CRASH", line: 0, file: entry, message: (r.stderr || r.stdout || "").slice(0, 400) }], advice: [] }; }
}
/** The reference checker's (`ref/src/check.ts`): in this process once `loadRef` has been waited for, else in one of its own (ref-check.ts). */
let refChecker;
export async function loadRef() { refChecker ??= (await import("./ref-check.ts")).answer; }
export const ref = (entry, spa, host) => timed("ref", () => refNow(entry, spa, host));
function refNow(entry, spa, host) {
  if (refChecker) { const out = JSON.parse(JSON.stringify(refChecker(entry, !!spa, !!host))); return out.error ? { diagnostics: [{ code: out.code ?? "PARSE", line: 0, file: entry, message: out.error }], advice: [] } : out; }
  const r = spawnSync(process.execPath, ["--experimental-strip-types", "--no-warnings", path.join(here, "ref-check.ts"), ...(spa ? ["--spa"] : []), ...(host ? ["--host"] : []), entry], { encoding: "utf8", maxBuffer: 1 << 26 });
  try { const out = JSON.parse(r.stdout); return out.error ? { diagnostics: [{ code: out.code ?? "PARSE", line: 0, file: entry, message: out.error }], advice: [] } : out; } catch { return { diagnostics: [{ code: "CRASH", line: 0, file: entry, message: (r.stderr || r.stdout || "").slice(0, 400) }], advice: [] }; }
}
/** Both checkers on one program: what each says, and whether they say the same (code and line, in order). */
export function both(entry, spa, host) {
  const c = crate(entry, spa, host), r = ref(entry, spa, host);
  // a parse error is one diagnostic on either side, placed differently: compared by code
  const loose = [...c.diagnostics, ...r.diagnostics].some(d => d.line === 0);
  const key = x => loose ? x.diagnostics.map(d => d.code) : codes(x.diagnostics);
  return { crate: c, ref: r, agree: JSON.stringify(key(c)) === JSON.stringify(key(r)) && JSON.stringify(codes(c.advice)) === JSON.stringify(codes(r.advice)) };
}

/** rx-tsc over the task's tsconfig: TypeScript's errors and the crate's, as text ("" when clean). */
export function rxTsc(dir) {
  const r = tool("tsc", [], "tsc.js", ["--noEmit", "-p", "tsconfig.json"], { cwd: dir, env: { RXC: rxc } });
  const out = r.status === 0 ? "" : String(r.stdout ?? "") + String(r.stderr ?? "") || `exit ${r.status}`;
  return Object.assign(new String(out), { keep: r.keep });
}

/** One edit of one file, undone by the function it returns. A variant is one line changed: `[from, to]`, each once. */
export function edit(dir, file, [from, to]) {
  const f = path.join(dir, file); const good = readFileSync(f, "utf8");
  if (!good.includes(from)) throw new Error(`the edit does not apply: ${JSON.stringify(from)} is not in ${file}`);
  writeFileSync(f, good.replace(from, to));
  return () => writeFileSync(f, good);
}

let seq = 0;
/** The program compiled by the crate for one target (`rxc app`), each module written beside its `.rx` (`x.rx.<n>.<target>.mjs`),
 *  importing the others by those names. Returns the entry's file, or `{ diagnostics }`. */
function appOf(entry, target, spa) {
  const r = timed("app", () => spawnSync(rxc, ["app", entry, "--target", target, ...(spa ? ["--spa"] : [])], { encoding: "utf8", maxBuffer: 1 << 27 }));
  try { JSON.parse(r.stdout); return r.stdout; } catch { return JSON.stringify({ error: (r.stderr || r.stdout || "").slice(0, 600) }); }
}
export function compile(entry, target, spa, asked) {
  const text = appOf(entry, target, spa); asked?.push({ ask: { k: "app", entry, target, spa: !!spa }, said: cache.said(text) });
  const out = JSON.parse(text);
  if (!out.modules) return out;
  const n = ++seq; const name = p => `${p}.${n}.${target}.mjs`;
  for (const [p, m] of Object.entries(out.modules)) writeFileSync(name(p), m.code.replace(/from "(\.{1,2}\/[^"]+\.rx)"/g, (_, s) => `from "${s}.${n}.${target}.mjs"`));
  return { file: name(out.entry ?? entry), css: out.css };
}

/** A package that ships its source as JSX, compiled as an app's bundler compiles it. */
const jsxOfPackages = () => ({ name: "package-jsx", transform: { filter: { id: /[\\/]node_modules[\\/].*\.jsx$/ }, handler: (code, id) => ({ code: createRequire(path.join(ws, "package.json"))("@solidjs/compiler").transform(code, { filename: id, generate: "dom", hydratable: true }).code, moduleType: "js" }) } });
/** Node's own modules, in a bundle for the browser: empty, as a bundler for the web makes them (Vite externalizes them
 *  with a warning). A package with one entry for every platform imports its Node adapter beside its browser's
 *  (@solid-primitives/filesystem: `node:fs/promises`, chokidar). */
const nodeBuiltins = () => { const stub = path.join(ws, ".node-stub.cjs"); if (!existsSync(stub)) writeFileSync(stub, "module.exports = {};\n"); const names = ["fs", "fs/promises", "path", "os", "events", "stream", "util", "url", "child_process", "crypto", "module", "worker_threads", "http", "https", "net", "tty", "zlib", "buffer"]; return Object.fromEntries(names.flatMap(n => [[n, stub], [`node:${n}`, stub]])); };
const pw = () => createRequire(path.join(ws, "package.json"))("playwright");

/** The browser a process was lent (RX_BROWSER), connected to once. */
let lent;
/** What a task's `run` drives the compiled program with. */
export class Runner {
  constructor(dir, entry, spa) { this.dir = dir; this.entry = path.join(dir, entry); this.spa = spa; this.checks = []; this.servers = []; this.problems = []; this.asked = []; this.pages = []; }
  check(name, ok, got) { this.checks.push({ name, ok: !!ok, got: ok ? undefined : typeof got === "string" ? got.slice(0, 600) : JSON.stringify(got)?.slice(0, 600) }); return !!ok; }
  /** The server's render of one URL: `{ html, text, error }` (the stream, to its end; hydration comments dropped from `text`). */
  async ssr(url = "/", { wait = 4000 } = {}) {
    const built = this.server ??= compile(this.entry, "ssr", this.spa, this.asked);
    if (!built.file) return { html: "", text: "", error: new Error(JSON.stringify(built).slice(0, 600)) };
    const { createApp } = await import(pathToFileURL(this.loads(path.join(ws, "node_modules/@reactivescript/runtime/dist/server.js"))).href);
    let html = "", error = null;
    const caught = e => { error ??= e; };
    process.on("uncaughtException", caught); process.on("unhandledRejection", caught);
    try {
      const main = (await import(pathToFileURL(built.file).href)).default;
      const app = createApp({ request: new Request("http://localhost" + url) });
      await new Promise((res, rej) => { try { app.stream(main(app), { write: c => { html += c; }, end: res }); } catch (e) { rej(e); } setTimeout(res, wait); });
      await new Promise(r => setTimeout(r, 20));
    } catch (e) { error ??= e; }
    process.off("uncaughtException", caught); process.off("unhandledRejection", caught);
    return { html, text: html.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<!--.*?-->/g, "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim(), error };
  }
  /** The client's bundle (the dom build, with Solid's development build, so its dev errors are loud). */
  async client(hydrate) {
    const built = compile(this.entry, "dom", this.spa, this.asked);
    if (!built.file) throw new Error(JSON.stringify(built).slice(0, 600));
    const entry = built.file + ".entry.mjs";
    writeFileSync(entry, `import main from ${JSON.stringify("./" + path.basename(built.file))};\nimport { createApp } from "@reactivescript/runtime";\nconst app = createApp({ root: document.getElementById("app") });\ntry { app.mount(main(app)${hydrate ? ", true" : ""}); } catch (e) { console.error("mount threw: " + (e && e.message)); }\nwindow.__mounted = true;\n`);
    const b = await timed("bundle", () => bundle(ws, { entry, dir: this.dir, conditions: ["browser", "development"], alias: nodeBuiltins(), plugins: [jsxOfPackages()], ids: true }));
    // the page's key: what of this repository its bundle holds (the runtime's files; the install and the task's folder are the key's)
    for (const id of b.ids) if (path.isAbsolute(id) && (id.includes(`${path.sep}node_modules${path.sep}@reactivescript${path.sep}runtime${path.sep}`) || !id.startsWith(ws + path.sep))) this.loads(id);
    return b.code;
  }
  /** A file of this repository the page runs, in its trace by its content. */
  loads(file) { this.asked.push({ ask: { k: "file", p: file }, said: cache.said(fileState(file)) }); return file; }
  /** Serves the program: `ssr` renders each URL on the server and hydrates it; otherwise an empty page the client mounts in. */
  async serve({ ssr = false } = {}) {
    const client = await this.client(ssr);
    let render = null;
    if (ssr) {
      const built = this.server ??= compile(this.entry, "ssr", this.spa, this.asked);
      if (!built.file) throw new Error(JSON.stringify(built).slice(0, 600));
      const rt = await import(pathToFileURL(this.loads(path.join(ws, "node_modules/@reactivescript/runtime/dist/server.js"))).href);
      const main = (await import(pathToFileURL(built.file).href)).default;
      render = (url, res) => {
        res.write(`<!doctype html><html><head>${rt.generateHydrationScript()}</head><body><div id="app">`);
        const app = rt.createApp({ request: new Request("http://localhost" + url) });
        let first = true;
        app.stream(main(app), { write: s => { res.write(s); if (first) { first = false; res.write(`</div><script type="module" src="/client.js"></script>`); } }, end: () => res.end("</body></html>") });
      };
    }
    const server = createServer((rq, res) => {
      if (rq.url === "/client.js") { res.writeHead(200, { "content-type": "text/javascript" }); return res.end(client); }
      if (rq.url === "/favicon.ico") { res.writeHead(404); return res.end(); }
      res.writeHead(200, { "content-type": "text/html" });
      if (render) { try { render(rq.url, res); } catch (e) { this.problems.push("server: " + e.message); res.end(); } return; }
      res.end(`<!doctype html><html><head><meta charset="utf-8"></head><body><div id="app"></div><script type="module" src="/client.js"></script></body></html>`);
    });
    await new Promise(r => server.listen(0, "127.0.0.1", r));
    this.servers.push(server);
    return `http://127.0.0.1:${server.address().port}`;
  }
  /** A page in Chromium; console errors and warnings and page errors are collected in `problems`. */
  async page() {
    // (a run of many lends each of its processes a browser that is up: a page of it is in a context of its own, as a launched browser's is)
    // (one connection to the browser this process was lent, for all its pages: each page is a context of its own)
    this.browser ??= await timed("launch", async () => { if (process.env.RX_BROWSER) try { if (!lent?.isConnected()) lent = await pw().chromium.connect(process.env.RX_BROWSER, { timeout: 5000 }); return lent; } catch { /* gone: one of its own */ } this.own = true; return pw().chromium.launch(); });
    const page = await this.browser.newPage(); this.pages.push(page);
    page.on("console", m => { if (["error", "warning"].includes(m.type())) this.problems.push(m.text().slice(0, 300)); });
    page.on("pageerror", e => this.problems.push(String(e).slice(0, 300)));
    // what a library says on a timer of its own (a development check it defers: `setTimeout(warnIfUnnamed, 300)`) is
    // part of what the page says: the timers a page has set and not yet run are counted, so `settled(page)` can wait
    // for them — a warning of that kind is then seen on every run, where it was seen on the runs that took long enough
    await page.addInitScript(() => {
      const pending = new Set(); const set = window.setTimeout, clear = window.clearTimeout;
      window.setTimeout = (fn, ms, ...rest) => { if (typeof fn !== "function" || (ms ?? 0) > 2000) return set(fn, ms, ...rest); const id = set((...a) => { pending.delete(id); return fn(...a); }, ms, ...rest); pending.add(id); return id; };
      window.clearTimeout = id => { pending.delete(id); return clear(id); };
      window.__timersPending = () => pending.size;
    });
    return page;
  }
  /** Opens `url` of a served program and waits for the client to mount. */
  /** Waits until the page has no timer of up to two seconds left to run (at most three seconds), then a frame. */
  async settled(page) {
    await page.waitForFunction(() => !window.__timersPending || window.__timersPending() === 0, null, { timeout: 3000, polling: 50 }).catch(() => {});
    await page.evaluate(() => new Promise(done => requestAnimationFrame(() => setTimeout(done, 0)))).catch(() => {});
  }
  async open(base, url = "/") {
    const page = await this.page();
    await page.goto(base + url);
    await page.waitForFunction(() => window.__mounted, null, { timeout: 10000 }).catch(() => this.problems.push("the client never mounted"));
    return page;
  }
  async text(page, sel = "#app") { return ((await page.textContent(sel)) ?? "").replace(/\s+/g, " ").trim(); }
  async until(ok, tries = 80) { for (let i = 0; i < tries; i++) { try { if (await ok()) return true; } catch { /* not yet */ } await new Promise(r => setTimeout(r, 50)); } return false; }
  async close() { if (this.own) await this.browser?.close(); else await Promise.all(this.pages.map(p => p.context().close().catch(() => {}))); for (const s of this.servers) s.close(); }
}

/** Every file under a task's folder (its own: no node_modules, no dot folders, nothing the build wrote), by a test of its name. */
export function own(dir, keep) {
  const out = [];
  const walk = d => { for (const e of readdirSync(d, { withFileTypes: true })) { if (e.name === "node_modules" || e.name === "dist" || e.name.startsWith(".")) continue; const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (keep(e.name)) out.push(p); } };
  walk(dir);
  return out.sort();
}
const code = text => text.split("\n").map(l => l.replace(/\/\/.*$/, ""));
/** `any` written in a task's `.rx` (an annotation or a cast): what the program gave up of the library's types. */
export function anysWritten(dir) {
  const out = [];
  for (const p of own(dir, n => n.endsWith(".rx") && !n.endsWith(".d.rx"))) code(readFileSync(p, "utf8")).forEach((l, i) => { if (/(:|\bas)\s*any\b|<any>/.test(l)) out.push(`${path.basename(p)}:${i + 1}`); });
  return out;
}

// ---- the declarations a task's checker reasons with (its `.d.rx` files) ----
const tokens = line => line.match(/[A-Za-z_$][\w$]*|\d+|[^\s\w]/g) ?? [];
const isWord = t => /^[\w$]/.test(t);
const exported = line => /^export\s+default\s+component\b/.test(line.trim()) ? "default" : /^export\s+(?:(?:pure|server|client)\s+)*(?:fn|component|const|type|context|error)\s+([\w$.]+)/.exec(line.trim())?.[1];   // default: a host declaration's view (09 MO-14)
/** 09 MO-14: whether a `.d.rx` is a host declaration (it states the view a JS host makes), and its rows a line each: the
 *  view may be written over several lines, and is measured as one row. */
export const isHost = text => /^\s*export\s+default\s+component\b/m.test(text);
const hostRows = text => { const ls = code(text).map(l => l.trim()).filter(Boolean); const at = ls.findIndex(l => /^export\s+default\s+component\b/.test(l)); return at < 0 ? ls : [...ls.slice(0, at), ls.slice(at).join(" ").replace(/([\[{(])\s+/g, "$1 ").replace(/\s+/g, " ").replace(/\[ /g, "[").replace(/ \]/g, "]")]; };
/** What `rx-declare --host` drafts for the modules a host declaration imports (its lines, comments dropped): the
 *  imports, the contexts those modules use, and every component placed at the top. */
function hostDraft(file) {
  const text = readFileSync(file, "utf8");
  // 09 MO-14g: a declaration that names the router's tree it is derived from (`//@ routes <source> [<entry.rx>…]`) is
  // drafted from there, whole: the command its first line records
  const from = /^[ \t]*\/\/@[ \t]*routes[ \t]+(\S+)((?:[ \t]+\S+)*)[ \t]*$/m.exec(text);
  if (from) {
    const r = timed("host", () => spawnSync(process.execPath, [path.join(repo, "tooling/rx-language-server/bin/declare.js"), "--host", "--routes", from[1], ...from[2].trim().split(/\s+/).filter(Boolean)], { cwd: path.dirname(file), encoding: "utf8", env: { ...process.env, RXC: rxc } }));
    const lines = r.status === 0 ? hostRows(r.stdout) : [];
    lines.whole = { rows: lines.length, any: 0, vendor: 0, introduced: 0, places: 0, introducedRows: [], drafted: r.status === 0, error: r.status === 0 ? undefined : String(r.stderr ?? "").trim().split("\n").pop()?.slice(0, 300) };
    return lines;
  }
  // (the `.rx` modules: what it imports from JavaScript, MO-14f, is not the draft's to know — those rows are by hand)
  const modules = [...text.matchAll(/^\s*import\s*\{[^}]*\}\s*from\s*(["'])(.*?)\1/gm)].filter(m => m[2].endsWith(".rx")).map(m => path.resolve(path.dirname(file), m[2]));
  const r = spawnSync(process.execPath, [path.join(repo, "tooling/rx-language-server/bin/declare.js"), "--host", ...modules], { cwd: path.dirname(file), encoding: "utf8", env: { ...process.env, RXC: rxc } });
  const lines = r.status === 0 ? hostRows(r.stdout) : [];
  lines.whole = { rows: lines.length, any: 0, vendor: 0, introduced: 0, places: 0, introducedRows: [], drafted: r.status === 0, error: r.status === 0 ? undefined : String(r.stderr ?? "").trim().split("\n").pop()?.slice(0, 300) };
  return lines;
}
/** The words of `hand` that are not `draft`'s: the tokens of `hand` outside a longest common subsequence of the two. */
function written(hand, draft) {
  const a = tokens(hand), b = tokens(draft);
  const m = Array.from({ length: a.length + 1 }, () => new Uint16Array(b.length + 1));
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) m[i][j] = a[i] === b[j] ? m[i + 1][j + 1] + 1 : Math.max(m[i + 1][j], m[i][j + 1]);
  let n = 0;
  for (let i = 0, j = 0; i < a.length;) { if (j < b.length && a[i] === b[j]) { i++; j++; } else if (j < b.length && m[i][j + 1] >= m[i + 1][j]) j++; else { if (isWord(a[i])) n++; i++; } }
  return n;
}
/** The module a `.d.rx` declares, as `rx-declare` is asked for it, and the folder it is asked from: a package under
 *  `rx-types/` by its import name (09 MO-8k), a file beside a JS module by that module. */
/** What `rx-declare` drafts for a module (its lines, comments dropped), with the flags the task says its draft was made
 *  with (`--run`, `--dom`: 09 MO-12, what running the package shows); [] when the module has no types to draft from.
 *  `draftOf(…).vendorAt`: per export, the `any`s of the draft that are the library's own, by place (09 MO-8q). */
const drafted = new Map();   // a module is drafted once in a run of a task: its declarations' measure and its whole draft are one draft
export function draftOf(spec, from, flags = []) {
  const key = JSON.stringify([spec, from, flags]); if (drafted.has(key)) return drafted.get(key);
  const lines = draftNow(spec, from, flags); drafted.set(key, lines); return lines;
}
function draftNow(spec, from, flags) {
  const r = tool("draft", ["--conditions=browser"], "declare.js", [spec, ...flags], { cwd: from, file: path.join(ws, `.causes-${process.pid}.json`) }); r.keep(r.status === 0 && r.extra !== undefined);
  const inherited = new Map(), caused = new Map(), why = new Map();
  let said = {}, anyRows = [];
  try { const j = JSON.parse(r.extra); said = j.inferred ?? {}; anyRows = j.rows ?? []; } catch { /* no draft */ }
  try { for (const c of JSON.parse(r.extra).causes) { if (!c.name) continue; caused.set(c.name, (caused.get(c.name) ?? 0) + 1); if (c.cause === "vendor-any") inherited.set(c.name, (inherited.get(c.name) ?? 0) + 1); else why.set(c.name, [...(why.get(c.name) ?? []), c.cause]); } } catch { /* no draft */ }
  const lines = r.status === 0 ? code(r.stdout).map(l => l.trim()).filter(Boolean) : [];
  lines.vendorAt = r.status === 0 ? vendorPlaces(r.stdout, anyRows) : new Map();
  // 09 MO-8v, MO-8w: the words the draft read from the code that runs (said beside the draft, not in it: `--causes`),
  // by export and by kind; and the questions it still asks (its `// TODO` lines), by export and by kind
  const todoBy = new Map(), inferredBy = {}, todosBy = {};
  for (const ws of Object.values(r.status === 0 ? said : {})) for (const w of ws) { const k = w.replace(/\(.*$/, ""); inferredBy[k] = (inferredBy[k] ?? 0) + 1; }
  for (const l of r.status === 0 ? r.stdout.split("\n") : []) {
    const t = /^\/\/ TODO(?: ([\w$.]+))?: (.*)$/.exec(l);
    if (t) { const k = todoKind(t[2]); todosBy[k] = (todosBy[k] ?? 0) + 1; if (t[1]) todoBy.set(t[1], [...(todoBy.get(t[1]) ?? []), k]); }
  }
  lines.todoBy = todoBy;
  // 09 MO-8q, over the whole draft — every export of the module, not only the rows an app keeps: the `any`s that are the
  // library's own, the ones that are not (each with the draft's cause for it; an `any` no cause answers for is a row of
  // a row written by hand), and the parts said by place
  const anyBy = new Map(); let places = 0;
  for (const l of lines) { const n = exported(l); const k = anysIn(l); if (k) anyBy.set(n ?? l, (anyBy.get(n ?? l) ?? 0) + k); places += tokens(l).filter(t => PLACE.has(t)).length; }
  const rows = [];
  for (const [n, k] of anyBy) { const own = k - (inherited.get(n) ?? 0); if (own > 0) rows.push({ name: n, introduced: own, causes: [...new Set([...(why.get(n) ?? [])])] }); }
  const any = [...anyBy.values()].reduce((a, b) => a + b, 0), introduced = rows.reduce((a, x) => a + x.introduced, 0);
  const count = o => Object.values(o).reduce((a, b) => a + b, 0);
  lines.whole = { rows: lines.length, any, vendor: any - introduced, introduced, places, introducedRows: rows, inferred: count(inferredBy), inferredBy, todos: count(todosBy), todosBy, drafted: r.status === 0, error: r.status === 0 ? undefined : String(r.stderr ?? "").trim().split("\n").pop()?.slice(0, 300) };
  return lines;
}
/** 09 MO-8q, place by place: for each row of a draft, how many of the `any`s at each place a type is written
 *  (`param:0`, `result.1`, `prop:label` — the crate's `types`, src/rows.js) are the library's own. `Map(export → [Map(place
 *  → count)])`, one map a row (an overloaded fn has several). A row whose `any`s the places do not account for one by
 *  one gives no credit, and is said (`out.unplaced`). */
export function vendorPlaces(draftText, anyRows) {
  const out = new Map(); const unplaced = out.unplaced = [];
  let rows; try { rows = rowsOf("draft.d.rx", draftText); } catch { rows = []; }
  const causes = new Map(); for (const x of anyRows) causes.set(x.row.replace(/\s+/g, " "), [...(causes.get(x.row.replace(/\s+/g, " ")) ?? []), x.anys]);
  for (const row of rows) {
    const anys = causes.get(row.text)?.shift() ?? []; const places = row.facts.types ?? []; const at = new Map(); let k = 0;
    const counts = places.map(([, t]) => anysOf(t));
    if (counts.reduce((a, b) => a + b, 0) === anys.length) places.forEach(([id], i) => { const v = anys.slice(k, k + counts[i]).filter(c => c === "vendor-any").length; k += counts[i]; if (v) at.set(id, (at.get(id) ?? 0) + v); });
    else unplaced.push(`${row.name}: ${anys.length} \`any\`s drafted, ${counts.reduce((a, b) => a + b, 0)} placed`);
    if (process.env.BENCH_ANY && unplaced.length) console.error("[unplaced]", unplaced.at(-1));
    out.set(row.name, [...(out.get(row.name) ?? []), at]);
  }
  return out;
}
/** The `any`s a type's text writes (a word, outside its string literals). */
const anysOf = t => (String(t ?? "").split(/("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/).filter((_, i) => i % 2 === 0).join(" ").match(/\bany\b/g) ?? []).length;
/** A kept row's `any`s against one draft row of the same export: `inherited`, those at a place where the draft has as
 *  many of the library's own (or under a place the library types `any` whole); `introduced`, every other — an `any`
 *  where the library has a type, wherever else in the row it has one. */
export function anysAgainst(row, vendor) {
  let inherited = 0, introduced = 0;
  const places = row.facts.types ?? [];
  for (const [id, t] of places) {
    const k = anysOf(t); if (!k) continue;
    let own = vendor.get(id) ?? 0;
    for (let up = id; !own && up.includes("."); ) { up = up.slice(0, up.lastIndexOf(".")); if (vendor.get(up)) own = k; }   // a part of what the library types `any` whole
    const h = Math.min(k, own); inherited += h; introduced += k - h;
  }
  return { inherited, introduced };
}
/** What a draft's question is about (the kinds the scorecard counts). */
export const todoKind = require_("../tooling/rx-language-server/src/questions.js").kindOf;
const PLACE = new Set(["Parameters", "ReturnType", "ConstructorParameters", "InstanceType"]);
/** The `any`s a draft's line writes: the word in a type, not the name of what it exports (valibot exports a schema called `any`). */
const anysIn = line => { const ts = tokens(line); const at = ts.findIndex((t, i) => i > 0 && /^(fn|component|const|type|context|error)$/.test(ts[i - 1]) && ts.slice(0, i).includes("export")); return ts.filter((t, i) => t === "any" && i !== at).length; };
/** A task's declarations, measured against the tool that drafts them: for each `.d.rx` of the task, the words a person
 *  wrote on top of `rx-declare`'s draft of the same module (a row the draft has, word for word, costs nothing; a row it
 *  has otherwise costs the words that differ; a row it has not costs every word; a row left out costs nothing), and the
 *  `any`s the file holds — what the checker is told nothing about — in two numbers (09 MO-8q), counted at each place a
 *  type is written: `inherited`, an `any` where the library's own declaration has one (as the draft of the same export
 *  shows, at the same parameter, result part or prop), and `introduced`, every other: an `any` where the library has a
 *  type. (They were counted by export until 2026-11-26, so an `any` moved from a parameter the library leaves untyped
 *  to a result it types was inherited.) `places`: the parts said by their place in the library's declaration
 *  (`Parameters<typeof import(…)>`), counted apart — not a way around the rule. `claims`: what rx-verify shows of each
 *  claim the kept rows make (`run`: held by running; `code`: held by the code's proof alone; `unverified`; `mismatch`).
 *  `problems`: what could not be measured (an audit or a verifier that did not run) — never an empty measure. */
export function declarations(dir, flagsFor = {}) {
  const files = [];
  for (const p of own(dir, n => n.endsWith(".d.rx"))) {
    const text = readFileSync(p, "utf8"); const host = isHost(text); const problems = [];
    const { spec, from } = host ? { spec: "the JS host", from: path.dirname(p) } : declares(p) ?? { spec: `./${path.basename(p, ".d.rx")}.js`, from: path.dirname(p) };
    const draft = host ? hostDraft(p) : draftOf(spec, from, flagsFor[spec] ?? []);
    const whole = new Set(draft);
    // a name the draft has more than one line for: each row is measured against the nearest of them
    const allByName = new Map(); for (const l of draft) { const n = exported(l); if (n) allByName.set(n, [...(allByName.get(n) ?? []), l]); }
    let words = 0, places = 0, todos = 0; const kept = new Set();
    // 09 MO-8w: every behaviour word of the file, held against what the code shows (`rx-declare --audit`): proven — a
    // word read from the code, counted apart from the words written by hand; unproven — a person's, listed. `contradicted`:
    // what a run shows false (rx-verify)
    const read = host ? { rows: [] } : audited(p, from);
    const said = v => read.rows.flatMap(x => x.words.filter(w => w.verdict === v && w.word !== "instantiates").map(w => `${x.name}: ${w.word} — ${w.why}`));
    const inferred = read.rows.reduce((n, x) => n + x.words.filter(w => w.verdict === "proven").length, 0);
    for (const line of host ? hostRows(text) : code(text).map(l => l.trim()).filter(Boolean)) {
      { const n = exported(line); if (n && !kept.has(n)) { kept.add(n); todos += (draft.todoBy?.get(n) ?? []).length; } }
      places += tokens(line).filter(t => PLACE.has(t)).length;
      if (whole.has(line)) continue;
      const was = allByName.get(exported(line));
      const cost = was ? Math.min(...was.map(w => written(line, w))) : tokens(line).filter(isWord).length;
      // BENCH_WORDS=1: each row written by hand, with the draft's row of the same export (what a person added to it)
      if (process.env.BENCH_WORDS && cost) console.error(`[words] ${path.relative(dir, p)} +${cost}\n   written: ${line.slice(0, 400)}\n   drafted: ${was ? was[0].slice(0, 400) : "(no row)"}`);
      words += cost;
    }
    // the `any`s, row by row and place by place, against the draft's row of the same export (the nearest of several)
    let any = 0, inherited = 0; const rows = [];
    let mine = []; try { mine = rowsOf(p); } catch (e) { problems.push(`the declaration is not read (${String(e.message ?? e).slice(0, 200)})`); }
    for (const row of mine) {
      const best = (draft.vendorAt?.get(row.name) ?? [new Map()]).map(v => anysAgainst(row, v)).sort((a, b) => a.introduced - b.introduced)[0];
      any += best.inherited + best.introduced; inherited += best.inherited;
      if (best.introduced) rows.push({ name: row.name, introduced: best.introduced });
    }
    const claims = claimsOf(dir, p, problems, read);
    files.push({ file: path.relative(dir, p), spec, words, inferred, todos, contradicted: claims.mismatches, unproven: said("unproven"), claims, problems, any, inherited, introduced: any - inherited, places, drafted: draft.length > 0, rows, whole: draft.whole });
  }
  const sum = k => files.reduce((n, f) => n + f[k], 0);
  const wsum = k => files.reduce((n, f) => n + (f.whole[k] ?? 0), 0);
  const wby = k => { const o = {}; for (const f of files) for (const [n, v] of Object.entries(f.whole[k] ?? {})) o[n] = (o[n] ?? 0) + v; return o; };
  const all = k => files.flatMap(f => f[k].map(c => `${f.file}: ${c}`));
  const csum = k => files.reduce((n, f) => n + f.claims[k], 0);
  // `draft`: the same modules drafted whole (every export), 09 MO-8q's numbers over what no app of the benchmark keeps
  return { words: sum("words"), inferred: sum("inferred"), todos: sum("todos"), claims: { total: csum("total"), run: csum("run"), code: csum("code"), unverified: csum("unverified"), mismatch: csum("mismatch"), by: claimKinds(files.map(f => f.claims.by)) }, contradicted: all("contradicted"), unproven: all("unproven"), problems: all("problems"), any: sum("any"), inherited: sum("inherited"), introduced: sum("introduced"), places: sum("places"), draft: { rows: wsum("rows"), any: wsum("any"), vendor: wsum("vendor"), introduced: wsum("introduced"), places: wsum("places"), inferred: wsum("inferred"), inferredBy: wby("inferredBy"), todos: wsum("todos"), todosBy: wby("todosBy") }, files };
}
/** 09 MO-8w: a declaration's words, each sorted by what the code shows (`rx-declare --audit --json`). `error`: the audit
 *  did not answer — which is not an audit with nothing to say. */
function audited(file, from) {
  const r = tool("audit", ["--conditions=browser"], "declare.js", ["--audit", "--json", file], { cwd: from, timeout: 300000 });
  try { const out = JSON.parse(r.stdout); if (!Array.isArray(out)) throw new Error("not a list"); r.keep(true); return out[0] ?? { rows: [] }; } catch { return { rows: [], error: String(r.stderr ?? "").trim().split("\n").pop()?.slice(0, 200) || `exit ${r.status ?? r.signal}` }; }
}
/** The claims of several files, kind by kind. */
export const claimKinds = bys => { const o = {}; for (const by of bys) for (const [k, c] of Object.entries(by ?? {})) { o[k] ??= { run: 0, code: 0, unverified: 0, mismatch: 0 }; for (const s in c) o[k][s] += c[s]; } return o; };
export const claimsSaid = by => Object.entries(by).sort((a, b) => a[0].localeCompare(b[0])).map(([k, c]) => `${k} ${c.code} proven + ${c.run} held + ${c.unverified} the author's${c.mismatch ? ` + ${c.mismatch} MISMATCHED` : ""}`).join(", ");
/** The claims of a declaration file: one for each behaviour word of each row (`pure`, `handler(x)`, `draft(x)`, `rejects(E)`,
 *  `uses(c)`, `provides(c)`, `nests(…)`, `renders(H)`, `instantiates`), one for the accessors of a row's result (`ref`, with
 *  its `pending`) and one for what they `fails(E)` with, and a host declaration's view. `by`: `code`, proven by the reading
 *  the generator writes a word from (`rx-declare --audit`); `run`, held by a probe that fails over a module changed to make
 *  the claim false (`rx-verify`); `mismatch`; or `unverified` — nothing has shown it: a person's own claim. */
export function claimsIn(dir, file, read = audited(file, declares(file)?.from ?? path.dirname(file))) {
  const problems = []; const claims = [];
  if (read.error) problems.push(`the audit did not run (${read.error})`);
  // (the reading just made of the same file is given to the run, where nothing is kept: what a kept result depended on is its own)
  const given = !cache.enabled && !read.error && read.spec ? path.join(ws, `.reading-${process.pid}.json`) : null;
  if (given) writeFileSync(given, JSON.stringify({ file: path.resolve(file), text: readFileSync(file, "utf8"), read }));
  let v; try { v = tool("verify", ["--conditions=browser"], "verify.js", ["--dom", "--json", path.relative(dir, file)], { cwd: dir, timeout: 180000, env: given ? { RX_VERIFY_READING: given } : {} }); } finally { if (given) rmSync(given, { force: true }); }
  let res; try { res = JSON.parse(String(v.stdout).trim().split("\n").pop())[0].results; } catch { return { claims, problems: [...problems, `rx-verify did not run (${String(v.stderr ?? "").trim().split("\n").pop()?.slice(0, 200) || `exit ${v.status ?? v.signal}`})`], mismatches: [] }; }
  v.keep(!res.some(r => r.status === "mismatch"));
  const worst = new Map(); const RANK = { mismatch: 3, unverified: 2, read: 1, held: 1, na: 0 };
  for (const r of res) { const k = `${r.line}:${r.ob}`; const was = worst.get(k); if (!was || RANK[r.status] > RANK[was.status]) worst.set(k, r); }
  const mismatches = [...worst.values()].filter(r => r.status === "mismatch").map(r => String(r.what).slice(0, 300));   // (an export that is not there, too)
  const byOf = r => r?.status === "read" ? "code" : r?.status === "held" ? (r.by === "code" ? "code" : "run") : r?.status === "mismatch" ? "mismatch" : "unverified";
  let rows = []; try { rows = rowsOf(file); } catch { /* said by rx-verify */ }
  const words = new Map(read.rows.map(x => [x.line, x.words]));
  for (const row of rows) {
    const at = ob => [...worst.values()].find(r => r.line >= row.line && r.line <= row.end && r.ob === ob);
    const add = (kind, word, r, w) => claims.push({ name: row.name, line: row.line, kind, word, by: w?.verdict === "proven" && r?.status !== "mismatch" ? "code" : byOf(r), why: String(byOf(r) === "unverified" ? w?.why ?? r?.what ?? "" : r?.what ?? w?.why ?? "").slice(0, 300) });
    for (const w of words.get(row.line) ?? []) { const ob = claimOf(w.word); add(w.word.replace(/\(.*$/, ""), w.word, ob && at(ob), w); }
    if (row.obligations.includes("fields")) add(row.facts.parts?.some(x => x.pending) ? "pending ref" : "ref", null, at("fields"));
    if (row.obligations.includes("fails")) add("fails", null, at("fails"));
    if (row.kind === "host" || row.kind === "import") for (const ob of row.obligations.filter(o => o !== "exists")) add("host", null, at(ob));
  }
  if (process.env.BENCH_CLAIMS) for (const c of claims) console.error(`[claim] ${c.by} ${path.relative(ws, file)} ${c.name}: ${c.word ?? c.kind}: ${c.why.slice(0, 200)}`);
  return { claims, problems, mismatches };
}
/** The claims of one file, counted: by what shows them, and of each kind. */
function claimsOf(dir, file, problems, read) {
  const out = { total: 0, run: 0, code: 0, unverified: 0, mismatch: 0, mismatches: [], by: {} };
  const c = claimsIn(dir, file, read); problems.push(...c.problems); out.mismatches = c.mismatches;
  for (const x of c.claims) { out.total++; out[x.by]++; out.by[x.kind] ??= { run: 0, code: 0, unverified: 0, mismatch: 0 }; out.by[x.kind][x.by]++; }
  return out;
}

/** rx-tsc's errors that are on the lines an edit wrote: `file(line,col): error …` rows whose file is the edited one and
 *  whose line is one of the edit's. What a type probe is judged by: an error elsewhere is not the type refusing the edit. */
export function onEdit(out, dir, file, [from, to]) {
  const good = readFileSync(path.join(dir, file), "utf8");   // read after the undo: the program as it was
  const first = good.slice(0, good.indexOf(from)).split("\n").length, last = first + to.split("\n").length - 1;
  const name = file.split("/").pop().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return out.split("\n").filter(l => { const m = new RegExp(`(?:^|[\\\\/])${name}[(:](\\d+)[,:]`).exec(l); return m && Number(m[1]) >= first && Number(m[1]) <= last; }).join("\n");
}
