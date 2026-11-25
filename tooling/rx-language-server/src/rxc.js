// The crate's side of the server: `rxc serve`'s requests (spec/11 CP-8e). Volar asks for a file's virtual code
// synchronously, so the requests are synchronous calls: into the crate's WebAssembly build, loaded in process (one build
// for every platform), or, when $RXC names a binary, a short `rxc serve` run per request.
const { spawnSync } = require("node:child_process");
const { existsSync, mkdirSync, writeFileSync, readFileSync, realpathSync, statSync } = require("node:fs");
const path = require("node:path");

const repo = path.resolve(__dirname, "../../..");

/** The `rxc` binary, when $RXC names one. */
function rxcPath() {
  return process.env.RXC || path.join(repo, "compiler/target/release/rxc");
}

/** The WebAssembly build: $RX_WASM, else the one bundled beside this file (the packaged extension), else the
 *  repository's (`cargo build --lib --release --target wasm32-unknown-unknown`). */
function wasmPath() {
  if (process.env.RX_WASM) return process.env.RX_WASM;
  for (const f of [path.join(__dirname, "rxc.wasm"), path.join(repo, "compiler/target/wasm32-unknown-unknown/release/reactivescript.wasm")]) if (existsSync(f)) return f;
  return undefined;
}

/** The reading of JavaScript `rx-declare` asks (compiler/words, a crate beside the compiler's): `$RX_WORDS_WASM`, else the
 *  one bundled beside this file, else the repository's (`cargo build -p rx-words …`). A program is checked without it. */
function wordsPath() {
  if (process.env.RX_WORDS_WASM) return process.env.RX_WORDS_WASM;
  const at = [path.join(__dirname, "words.wasm"), path.join(repo, "compiler/target/wasm32-unknown-unknown/release/rx_words.wasm")];
  const f = at.find(existsSync);
  if (!f) throw new Error(`no ${at[1]}: cargo build -p rx-words --release --target wasm32-unknown-unknown --manifest-path compiler/Cargo.toml`);
  return f;
}

/** Every file of a package's folder and those in it, but the packages in it: undefined past 20,000. */
function listing(dir) {
  const out = [], todo = [""];
  while (todo.length) {
    const d = todo.pop(); let es; try { es = require("node:fs").readdirSync(path.join(dir, d), { withFileTypes: true }); } catch { continue; }
    for (const e of es) { if (e.name === "node_modules") continue; const f = d ? `${d}/${e.name}` : e.name; if (e.isDirectory()) todo.push(f); else out.push(f); }
    if (out.length > 20000) return undefined;
  }
  return out;
}

/** A crate in process, over `src/wasm.rs`'s ABI (compiler/words's is the same). */
function loadWasm(file) {
  let x;
  const enc = new TextEncoder(), dec = new TextDecoder();
  const put = bytes => {
    const p = x.rx_alloc(bytes.length + 4);
    const m = new Uint8Array(x.memory.buffer);
    new DataView(x.memory.buffer).setUint32(p, bytes.length, true);
    m.set(bytes, p + 4);
    return p;
  };
  const env = {
    rx_read(ptr, len) {
      const f = dec.decode(new Uint8Array(x.memory.buffer, ptr, len));
      if (f[0] === "\x01") { const l = listing(f.slice(1)); return l === undefined ? 0 : put(enc.encode(l.join("\n"))); }   // a package's files
      if (f[0] === "\0") { try { return put(enc.encode(realpathSync(f.slice(1)))); } catch { return 0; } }   // a path's real one (compiler/words/src/resolve.rs)
      try { if (!statSync(f).isFile()) return 0; return put(readFileSync(f)); } catch { return 0; }
    },
  };
  x = new WebAssembly.Instance(new WebAssembly.Module(readFileSync(file)), { env }).exports;
  return (method, params) => {
    const req = enc.encode(JSON.stringify({ method, params }));
    const p = x.rx_alloc(req.length);
    new Uint8Array(x.memory.buffer).set(req, p);
    const out = x.rx_call(p, req.length);
    const n = new DataView(x.memory.buffer).getUint32(out, true);
    const text = dec.decode(new Uint8Array(x.memory.buffer, out + 4, n));
    x.rx_free(out, n + 4);
    return JSON.parse(text);
  };
}

function viaProcess(method, params) {
  const r = spawnSync(rxcPath(), ["serve"], { input: JSON.stringify({ id: 1, method, params }) + "\n", maxBuffer: 1 << 28 });
  if (r.error) throw r.error;
  const line = r.stdout.toString().split("\n").find(Boolean);
  if (!line) throw new Error(`rxc serve: no answer (${r.stderr.toString().slice(0, 300)})`);
  return JSON.parse(line).result;
}

let wasm, reader;
/** RX_TRACE=<file>: each request and its answer, a line each (what a result of a tool depended on: scripts/lib/cache.mjs). */
function ask(method, params) {
  const result = answer(method, params);
  if (process.env.RX_TRACE) require("node:fs").appendFileSync(process.env.RX_TRACE, JSON.stringify({ cwd: process.cwd(), method, params, result, ...(/\.trial\.d\.rx$/.test(params.file ?? "") ? { trial: readFileSync(params.file, "utf8") } : {}) }) + "\n");   // (a trial is gone by the time it is asked again: its text with it)
  return result;
}
function answer(method, params) {
  if (method === "words") {
    try { return (reader ??= loadWasm(wordsPath()))(method, params); } catch (e) { reader = undefined; throw e; }
  }
  if (process.env.RXC || !wasmPath()) return viaProcess(method, params);
  try {
    return (wasm ??= loadWasm(wasmPath()))(method, params);
  } catch (e) {
    wasm = undefined; // a trap (a panic in the crate) leaves the instance unusable: the next request makes a new one
    throw e;
  }
}

/** A file's projection (`code`, `mappings`, `ranges`, UTF-16 offsets) and its diagnostics, as the editor has it. */
function analyze(file, text, prelude) {
  return ask("analyze", { file, overlays: { [file]: text }, prelude });
}

/** E-5a: the crate's diagnostics for every module `entry` loads, checked as a build checks them: `whole`, the loaded
 *  modules as the whole program, with `hosts` the modules a JS host imports with ?rx-lib; `spa`, a client-only build. */
function checkProgram(entry, { whole = false, hosts = [], spa = false } = {}) {
  return ask("analyze", { file: entry, overlays: {}, prelude: undefined, whole, hosts, spa, all: true });
}

/** Where a file's projection imports the prelude from: written once beside the nearest `node_modules`, so its own
 *  `@solidjs/web` resolves; a `.d.ts`, so the import needs no extension. */
const preludes = new Map();
function preludeFor(file) {
  let dir = path.dirname(file);
  while (!existsSync(path.join(dir, "node_modules")) && path.dirname(dir) !== dir) dir = path.dirname(dir);
  const at = path.join(dir, "node_modules", ".reactivescript", "prelude");
  if (!preludes.has(at)) {
    const text = ask("prelude", {});
    mkdirSync(path.dirname(at), { recursive: true });
    const f = at + ".d.ts";
    if (!existsSync(f) || readFileSync(f, "utf8") !== text) writeFileSync(f, text);
    preludes.set(at, true);
  }
  return at;
}

/** TY-6: the boundary check for a `.d.rx` against the JS module it declares (`module`, as an import from beside it);
 *  `text`: the declaration's text, where it is not the file's (a draft not yet written, MO-8m). */
function boundary(file, module, text) {
  return ask("boundary", text === undefined ? { file, module } : { file, module, text });
}

/** TY-4b: the `.d.ts` a `.d.rx` stands for, for a JS module with no TypeScript types of its own. */
function declaration(file) {
  return ask("declaration", { file });
}

/** MO-8k: the declaration a package import from `file` finds (rx-types/, the package's, @rx-types, generated), or null. */
function lookup(file, spec) {
  return ask("lookup", { file, spec });
}
/** MO-8j, TY-7: a declaration file's rows as the parser reads them: `{ rows: [{ name, kind, line, end, obligations }] }`. */
function rows(file, text) {
  return ask("rows", text === undefined ? { file } : { file, text });
}
module.exports = { ask, analyze, checkProgram, preludeFor, boundary, declaration, lookup, rows };
