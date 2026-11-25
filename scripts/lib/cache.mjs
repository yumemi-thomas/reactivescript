// The result cache of the slow suites (CONTRIBUTING.md, *Faster runs*): what a tool, a compiled program or a page
// answered, kept outside the repository and shared by its worktrees. An answer is used again only when everything that
// could change it is the same, by content:
//   - the key: the operation, the files it reads (a folder, an install, a build: hashed, never dated), the harness's own
//     text, the versions of Node and of the browser, the flags and the environment;
//   - the trace: what the crate was asked while it ran. The crate's binary is not in the key: its questions are asked
//     again, of the binary that is there now, and each must be answered as it was. A change of the compiler that leaves a
//     program's answers alone leaves its result alone; one that changes them is a miss.
// A failure is never kept. Never used in CI (CI is set), under RX_NO_CACHE=1 or --no-cache, nor to write a record.
import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, readlinkSync, renameSync, rmSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { gunzipSync, gzipSync } from "node:zlib";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const here = import.meta.dirname;
export const repo = path.resolve(here, "../..");
export const root = process.env.RX_CACHE_DIR || path.join(process.platform === "darwin" ? path.join(os.homedir(), "Library/Caches") : process.env.XDG_CACHE_HOME || path.join(os.homedir(), ".cache"), "reactivescript-results");
export const enabled = !process.env.CI && process.env.RX_NO_CACHE !== "1" && !process.argv.includes("--no-cache") && !process.argv.includes("--write");
/** The cache's size, in bytes: the results least recently used go first. */
const LIMIT = (Number(process.env.RX_CACHE_MB) || 512) * (1 << 20);
export const stats = { hits: 0, misses: 0, kept: 0, why: {} };

export const sha = x => createHash("sha256").update(x).digest("hex").slice(0, 40);
/** A value as text in one order, whatever order its fields were set in. */
const canon = x => JSON.stringify(x, (k, v) => v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a < b ? -1 : 1)) : v);

// ---- the content of files and folders ----
/** A file's hash, read again when what the disk says of it is different (device, inode, size, mtime, ctime — which cannot be set back). */
const memo = new Map();
let saved, dirty = 0;
const indexAt = () => path.join(root, "files", `${sha(repo)}.json`);
function index() {
  if (saved) return saved;
  saved = new Map();
  if (enabled) try { for (const [p, k, h] of JSON.parse(readFileSync(indexAt(), "utf8"))) saved.set(p, { k, h }); } catch { /* none yet */ }
  return saved;
}
export function fileHash(p, st) {
  try { st ??= statSync(p, { bigint: true }); } catch { return null; }
  if (!st.isFile()) return null;
  const k = `${st.dev}:${st.ino}:${st.size}:${st.mtimeNs}:${st.ctimeNs}`;
  const m = memo.get(p) ?? index().get(p); if (m && m.k === k) { memo.set(p, m); return m.h; }
  let h; try { h = sha(readFileSync(p)); } catch { return null; }
  // (a file written a moment ago may be written again within the clock's step: its hash is not kept beyond this process)
  memo.set(p, { k, h }); if (BigInt(Date.now()) * 1000000n - st.ctimeNs > 2000000000n) { index().set(p, { k, h }); dirty++; }
  return h;
}
/** Keeps the hashes of the files of large folders for the next run (a process that hashed many: the one that runs a suite). */
export function saveIndex() {
  if (!enabled || !dirty) return;
  try { mkdirSync(path.dirname(indexAt()), { recursive: true }); writeWhole(indexAt(), JSON.stringify([...index()].filter(([p]) => existsSync(p)).map(([p, x]) => [p, x.k, x.h]))); } catch { /* not kept */ }
}
const SKIP = new Set([".git", ".cache", ".vite", ".rx-types", ".reactivescript", ".vite-temp"]);
/** Every file of a folder by its path in it and its content; a link by where it points (and, `follow`, what is there).
 *  `skip`: what is left out, by its path and name. */
export function treeHash(dir, { skip = () => false, follow = false } = {}) {
  const h = createHash("sha256"); let n = 0; const seen = new Set();
  const walk = (d, rel) => {
    let es; try { es = readdirSync(d, { withFileTypes: true }); } catch { h.update(`absent ${rel}\0`); return; }
    for (const e of es.sort((a, b) => a.name < b.name ? -1 : 1)) {
      const p = path.join(d, e.name), r = rel ? `${rel}/${e.name}` : e.name;
      if (SKIP.has(e.name) || skip(r, e.name)) continue;
      if (e.isSymbolicLink()) { let t; try { t = readlinkSync(p); } catch { continue; } if (!follow) { h.update(`link ${r} ${home(t)}\0`); continue; } let st; try { st = statSync(p); } catch { h.update(`broken ${r}\0`); continue; } if (st.isDirectory()) { if (!seen.has(t)) { seen.add(t); walk(p, r); } continue; } }
      else if (e.isDirectory()) { walk(p, r); continue; }
      h.update(`${r} ${fileHash(p)}\0`); n++;
    }
  };
  walk(dir, "");
  return `${n}:${h.digest("hex").slice(0, 40)}`;
}
/** A list of files and folders, by content. */
export const inputs = (...ps) => ps.map(p => { let st; try { st = lstatSync(p); } catch { return `${home(p)} absent`; } return `${home(p)} ${statSync(p).isDirectory() ? treeHash(p) : fileHash(p)}`; });

// ---- one machine, several worktrees: a path of this one is written `⟨repo⟩`, so that a result can be another's ----
const solid = path.resolve(process.env.SOLID_NEXT || path.join(repo, "../solid-next"));
export const home = s => s.replaceAll(repo, "⟨repo⟩").replaceAll(solid, "⟨solid⟩");
export const away = s => s.replaceAll("⟨repo⟩", repo).replaceAll("⟨solid⟩", solid);
const homeOf = x => x === undefined ? undefined : JSON.parse(home(JSON.stringify(x)));
const awayOf = x => x === undefined ? undefined : JSON.parse(away(JSON.stringify(x)));

/** The environment a tool may read. (`RX_CACHE_*`, `RX_NO_CACHE` and what says how many run at once change no answer.) */
const QUIET = new Set(["RX_NO_CACHE", "RX_TOOLS", "RX_TOOLS_MB", "RX_RUN", "NODE_COMPILE_CACHE", "RX_BUILT", "RX_BROWSER", "RX_VERIFY_READING", "RX_CACHE_DIR", "RX_CACHE_MB", "RX_CACHE_LOG", "RX_CACHE_KEYS", "RX_TRACE", "RX_LOCK", "RX_LOCK_HELD", "RX_LOCK_N", "RX_LOCK_DIR", "RX_LOCK_WAIT", "RX_LOCK_IDLE", "RX_LOCK_HOLD", "RX_LOCK_LOAD", "RX_CORES", "RX_FREE_MB", "RX_CI_MEM", "RX_CI_LIMIT", "RX_JOBS", "BENCH_JOBS", "BENCH_PROFILE", "RX_SHARED_KEYS", "RX_SSR_KEYS", "RX_SHARD", "RXC"]);
export const environment = () => Object.fromEntries(Object.entries(process.env).filter(([k]) => /^(RX|BENCH_|NODE_|TS|SOLID|CHROMIUM|DEBUG|VERBOSE|LANG|LC_|TZ|CSR$|SV_|WAIT$|NO_HYDRATE$|PLAYWRIGHT)/.test(k) && !QUIET.has(k)).map(([k, v]) => [k, home(v)]).sort());

/** What Node, the platform and the tools are. */
let platform_; export const platform = () => platform_ ??= { node: process.version, v8: process.versions.v8, os: `${process.platform} ${process.arch} ${os.release()}` };
/** The browser Playwright starts, as it is on disk: its version and its executable. */
export function browser(playwright) {
  try { const at = process.env.CHROMIUM || playwright.chromium.executablePath(); const st = statSync(at, { bigint: true }); return { at: path.basename(path.dirname(path.dirname(path.dirname(path.dirname(path.dirname(at)))))), bytes: String(st.size), mtime: String(st.mtimeNs), headless: headless(at) }; } catch { return null; }
}
function headless(at) { try { const base = path.join(at.split("/ms-playwright/")[0], "ms-playwright"); return readdirSync(base).filter(d => /^chromium/.test(d)).sort(); } catch { return null; } }

// ---- the crate's answers ----
/** What an operation asked of the crate: `[{ ask, said }]`, `ask` the question as `answer` takes it, `said` the hash of its answer. */
export const said = x => sha(home(typeof x === "string" ? x : canon(x)));

// ---- results ----
function writeWhole(file, data) { const tmp = `${file}.${process.pid}.tmp`; try { writeFileSync(tmp, data); renameSync(tmp, file); } finally { rmSync(tmp, { force: true }); } }
const log = process.env.RX_CACHE_LOG ? s => writeFileSync(process.env.RX_CACHE_LOG, s + "\n", { flag: "a" }) : () => {};
/** How many results one key may have (a program whose compiler answers differ from branch to branch). */
const VARIANTS = 6;

/** The result of an operation: one kept before, or `run()`'s. `key`: what it depends on (above). `answer(ask)`: the
 *  crate's answer now (undefined: it has none, which is a miss). `run` answers `{ value, trace, files }` — `trace`:
 *  `[{ ask, said }]`; `files`: what the operation wrote and others read (`{ path: text }`), written again with the result.
 *  Returns `{ value, hit, keep(ok) }`: the result is kept when `keep(true)` is called, by whoever judges it. */
export async function result(kind, key, answer, run) {
  const r = lookup(kind, key, answer);
  if (r.hit) return r;
  return r.done(await run());
}
/** The same for an operation that does not wait. */
export function resultSync(kind, key, answer, run) { const r = lookup(kind, key, answer); return r.hit ? r : r.done(run()); }

function lookup(kind, key, answer) {
  const off = { hit: false, done: x => ({ value: x.value, hit: false, keep() {} }) };
  if (!enabled || key === null) { if (enabled) { stats.misses++; count("not cacheable", kind); } return off; }
  const text = canon(homeOf({ v: 1, kind, platform: platform(), key }));
  const id = sha(text), file = path.join(root, "results", id.slice(0, 2), `${id}.gz`);
  let kept = []; try { kept = JSON.parse(gunzipSync(readFileSync(file)).toString()).variants; } catch { /* none */ }
  const answers = new Map();
  const ask = a => { const k = canon(a); if (!answers.has(k)) { let x; try { const v = answer(awayOf(a)); x = v === undefined ? null : said(v); } catch { x = null; } answers.set(k, x); } return answers.get(k); };
  for (const v of kept) {
    const before = new Map();
    for (const [p, t] of Object.entries(v.files ?? {})) { const at = away(p); let was = null; try { was = readFileSync(at, "utf8"); } catch { /* none */ } if (was !== away(t)) { before.set(at, was); mkdirSync(path.dirname(at), { recursive: true }); writeWhole(at, away(t)); answers.clear(); } }
    const bad = (v.trace ?? []).find(t => ask(t.ask) !== t.said);
    if (bad) { for (const [at, was] of before) { if (was === null) rmSync(at, { force: true }); else writeWhole(at, was); } if (before.size) answers.clear(); if (process.env.RX_CACHE_LOG) log(`differs ${kind} ${canon(bad.ask).slice(0, 300)}`); continue; }
    stats.hits++; log(`hit ${kind} ${id}`); try { const now = new Date(); utimesSync(file, now, now); } catch { /* gone */ }
    return { value: awayOf(v.value), hit: true, keep() {} };
  }
  stats.misses++; count(kept.length ? "the crate answers otherwise" : "new", kind); log(`miss ${kind} ${id} ${kept.length ? "answers" : "key"} ${process.env.RX_CACHE_KEYS ? text : ""}`);
  return { hit: false, done: x => ({ value: x.value, hit: false, keep(ok = true) {
    if (!ok || x.trace === null) return;
    const trace = [], seen = new Set();
    for (const t of x.trace ?? []) { const a = homeOf(t.ask), k = canon(a); if (seen.has(k)) continue; seen.add(k); trace.push({ ask: a, said: t.said }); }
    // asked at the end as it will be asked: an answer that does not come back (what the operation itself changed) is no key
    answers.clear(); if (trace.some(t => ask(t.ask) !== t.said)) { count("an answer of its own making", kind); log(`unkept ${kind} ${id}`); return; }
    try { mkdirSync(path.dirname(file), { recursive: true }); writeWhole(file, gzipSync(JSON.stringify({ variants: [{ value: homeOf(x.value), trace, files: homeOf(x.files) ?? {} }, ...kept].slice(0, VARIANTS) }))); stats.kept++; } catch { /* not kept */ }
  } }) };
}
const count = (why, kind) => { const k = `${why}: ${kind}`; stats.why[k] = (stats.why[k] ?? 0) + 1; };

/** Drops the results least recently used until the cache is under its size, and hashes of folders that are gone. */
export function prune() {
  if (!enabled) return;
  const all = []; let total = 0;
  for (const part of ["results", "files"]) { let ds; try { ds = readdirSync(path.join(root, part), { recursive: true, withFileTypes: true }); } catch { continue; }
    for (const e of ds) if (e.isFile()) { const p = path.join(e.parentPath, e.name); let st; try { st = statSync(p); } catch { continue; } all.push({ p, size: st.size, t: st.mtimeMs }); total += st.size; } }
  for (const f of all.sort((a, b) => a.t - b.t)) { if (total <= LIMIT) break; rmSync(f.p, { force: true }); total -= f.size; }
}
/** What a run used: one line, for a person. */
export const summary = (s = stats) => !enabled ? "" : `cache: ${s.hits} result${s.hits === 1 ? "" : "s"} used again, ${s.misses} run, ${s.kept} kept${process.env.VERBOSE ? ` (${Object.entries(s.why).map(([k, n]) => `${k} ${n}`).join(", ")})` : ""} — --no-cache runs everything`;
export const merge = (a, b) => { a.hits += b.hits; a.misses += b.misses; a.kept += b.kept; for (const [k, n] of Object.entries(b.why ?? {})) a.why[k] = (a.why[k] ?? 0) + n; };
