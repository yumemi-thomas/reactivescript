// What a process of a suite read of this repository, for the result cache (scripts/lib/cache.mjs): loaded with
// `--require` (NODE_OPTIONS, so that the processes it starts load it too) when RX_READS names a file. Each file under one
// of RX_READS_ROOTS (`:`-separated folders; under none of RX_READS_SKIP) that the process loads as a module or reads is a
// line of that file, once a process; and each call of the compiler's Node-API build (`app`, what compiler/vite.mjs asks)
// is a line with its arguments, the hash of its answer, and the files of the folder it ran in that differ from what they
// were when the process started (`overlay`: what a test wrote while it ran, written again when the call is asked again).
// A suite then keys its result on those files' contents and asks the compiler again, instead of keying it on whole
// folders and builds. Nothing here changes what the process does.
"use strict";
const fs = require("node:fs"), path = require("node:path"), Module = require("node:module"), { createHash } = require("node:crypto"), { fileURLToPath } = require("node:url");

const roots = () => (process.env.RX_READS_ROOTS || "").split(":").filter(Boolean);
const skips = () => (process.env.RX_READS_SKIP || "").split(":").filter(Boolean);
const under = (p, d) => p === d || p.startsWith(d.endsWith(path.sep) ? d : d + path.sep);
const seen = new Map();   // (per log: a worker writes to a new one for each request)
const real = p => { try { return fs.realpathSync.native(p); } catch { return p; } };
let writing = false;   // (appending to the log writes a file too: not one of the process's)
function line(o) { const at = process.env.RX_READS; if (!at || writing) return; writing = true; try { original.appendFileSync(at, JSON.stringify(o) + "\n"); } catch { /* not kept */ } finally { writing = false; } }
/** Every file of the roots this process has read, whether a log was asked for then or not (what a suite's own process
 *  has loaded before a test of it begins). */
const all = globalThis.__rxReadsAll = new Set(), judged = new Map();
function read(p) {
  if (typeof p !== "string" || !path.isAbsolute(p)) return;
  const by = `${process.env.RX_READS_ROOTS}\0${process.env.RX_READS_SKIP}\0${p}`;
  let ours = judged.get(by);
  if (ours === undefined) { const r = real(p), rs = roots(); ours = rs.some(d => under(p, d) || under(r, d)) && !skips().some(d => under(p, d) || under(r, d)); judged.set(by, ours); }
  if (!ours) return;
  all.add(p);
  const at = process.env.RX_READS; if (!at) return;
  let s = seen.get(at); if (!s || !fs.existsSync(at)) { s = new Set(); seen.set(at, s); }   // (a log taken away is a new one)
  if (!s.has(p)) { s.add(p); line({ read: p }); }
}
const original = { readFileSync: fs.readFileSync, appendFileSync: fs.appendFileSync, writeFileSync: fs.writeFileSync };
const asPath = f => typeof f === "string" ? f : f instanceof URL ? fileURLToPath(f) : Buffer.isBuffer(f) ? f.toString() : null;
const look = f => { const p = typeof f === "number" ? null : asPath(f); if (p) read(path.resolve(p)); };
fs.readFileSync = function (f, ...rest) { look(f); return original.readFileSync.call(this, f, ...rest); };
const readFile = fs.readFile; fs.readFile = function (f, ...rest) { look(f); return readFile.call(this, f, ...rest); };
const pReadFile = fs.promises.readFile; fs.promises.readFile = function (f, ...rest) { if (typeof f === "string" || f instanceof URL) look(f); return pReadFile.call(this, f, ...rest); };
// what it writes under RX_READS_WRITES (a suite's workspace): the suite holds a file it wrote outside the folder of the test
// to be there, as it was, where the result is used again
const wrote = (f, recursive = false) => { const at = process.env.RX_READS, under_ = process.env.RX_READS_WRITES, p = typeof f === "number" ? null : asPath(f); if (!at || !under_ || !p) return; const q = path.resolve(p); if (under(q, under_) && q !== at && q !== process.env.RX_TRACE) line({ wrote: q, ...(recursive ? { tree: true } : {}) }); };
for (const [k, i, tree] of [["writeFileSync", 0], ["writeFile", 0], ["copyFileSync", 1], ["renameSync", 1], ["cpSync", 1, true]]) { const f = fs[k]; fs[k] = function (...a) { const r = f.apply(this, a); wrote(a[i], tree); return r; }; }
{ const f = fs.promises.writeFile; fs.promises.writeFile = async function (...a) { const r = await f.apply(this, a); wrote(a[0]); return r; }; }
// every module, required or imported
if (Module.registerHooks) Module.registerHooks({ load(url, ctx, next) { if (url.startsWith("file:")) read(fileURLToPath(url)); return next(url, ctx); } });
else { const load = Module._load; Module._load = function (req, parent, ...rest) { try { read(Module._resolveFilename(req, parent)); } catch { /* not a file */ } return load.call(this, req, parent, ...rest); }; }

// ---- the compiler's Node-API build, as compiler/index.js gives it ----
const binding = process.env.RX_READS_BINDING;   // compiler/index.js (real path)
const sha = x => createHash("sha256").update(x).digest("hex").slice(0, 40);
const start = process.cwd();
const TEXT = /\.(rx|d\.rx|ts|tsx|js|mjs|cjs|jsx|json|css)$/;
function files(dir) {
  const out = new Map(), todo = [""];
  while (todo.length) {
    const d = todo.pop(); let es; try { es = fs.readdirSync(path.join(dir, d), { withFileTypes: true }); } catch { continue; }
    for (const e of es) {
      if (e.name === "node_modules" || e.name === "dist" || e.name.startsWith(".") || /\.rx\.\d+\.(dom|ssr)\.mjs/.test(e.name)) continue;
      const f = d ? `${d}/${e.name}` : e.name;
      if (e.isDirectory()) todo.push(f); else if (TEXT.test(e.name)) { try { out.set(f, original.readFileSync(path.join(dir, f), "utf8")); } catch { /* gone */ } }
    }
    if (out.size > 2000) break;
  }
  return out;
}
// The files the changes are of: RX_READS_BASE, a file of them as they were when the test began (the folder RX_READS_AT),
// which the suite's own process writes (`__rxReadsFrom(dir, file)`; `__rxReadsFrom(null)` when the test is over); else,
// RX_READS_OVERLAY, the folder this process began in, as it was then
let base = null;
if (process.env.RX_READS_BASE) { try { base = { at: process.env.RX_READS_AT, before: new Map(JSON.parse(original.readFileSync(process.env.RX_READS_BASE, "utf8"))) }; } catch { /* none: no changes said */ } }
else if (process.env.RX_READS_OVERLAY === "1") base = { at: start, before: files(start) };
globalThis.__rxReadsFrom = (dir, file) => { base = dir ? { at: dir, before: files(dir) } : null; if (base && file) original.writeFileSync(file, JSON.stringify([...base.before])); };
const overlay = () => {
  if (!base) return {};
  const now = files(base.at), o = {};
  for (const [f, text] of now) if (base.before.get(f) !== text) o[f] = text;
  for (const f of base.before.keys()) if (!now.has(f)) o[f] = null;
  return o;
};
/** A call of the compiler, made and said: its arguments, where, the files changed since (of `at`, the folder this process
 *  began in), and its answer's hash. */
function called(what, args, cwd, run) {
  if (!process.env.RX_READS) return run();
  const o = overlay(), at = base?.at ?? start; let r, error, threw = false;
  try { r = run(); } catch (e) { error = e; threw = true; }
  line({ [what]: args, cwd, at, overlay: o, said: sha(threw ? `threw ${String(error?.message ?? error)}` : what === "rxc" ? `${r.status} ${String(r.stdout)}` : String(r)) });
  if (threw) throw error;
  return r;
}
if (binding) {
  const load = Module._load;
  Module._load = function (req, parent, ...rest) {
    const got = load.call(this, req, parent, ...rest);
    let at; try { at = real(Module._resolveFilename(req, parent)); } catch { return got; }
    if (at !== binding) return got;
    return new Proxy(got, { get(t, k) { const f = t[k]; return k !== "app" || typeof f !== "function" ? f : (...args) => called("binding", args, process.cwd(), () => f.apply(t, args)); } });
  };
}
// …and its binary, where a tool runs it itself (RXC, or the suite's: RX_READS_RXC; src/routes/rx-router.js: `rxc app`)
{
  const cp = require("node:child_process"), spawnSync = cp.spawnSync;
  cp.spawnSync = function (file, args, opts, ...rest) {
    if (!process.env.RX_READS || !file || ![process.env.RXC, process.env.RX_READS_RXC].includes(file) || !Array.isArray(args) || args[0] === "serve") return spawnSync.call(this, file, args, opts, ...rest);
    return called("rxc", args, path.resolve(opts?.cwd ?? process.cwd()), () => spawnSync.call(this, file, args, opts, ...rest));
  };
}
// …and each question the language server asks the crate (src/rxc.js writes it to RX_TRACE): the files changed since, by
// the hash of its line there
{
  const append = fs.appendFileSync;
  fs.appendFileSync = function (f, data, ...rest) {
    const r = append.call(this, f, data, ...rest);
    if (base && process.env.RX_READS && process.env.RX_TRACE && asPath(f) === process.env.RX_TRACE) { const o = overlay(); if (Object.keys(o).length) line({ traced: sha(String(data)), at: base.at, overlay: o }); }
    return r;
  };
}
// (and as ES modules import them by name: `import { spawnSync } from "node:child_process"`)
Module.syncBuiltinESMExports();
