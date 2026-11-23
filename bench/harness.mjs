// What bench/run.mjs runs a task with: the workspace (the libraries from npm, once), both checkers, rx-tsc, the compiled
// program on the server and in Chromium. See bench/README.md.
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import { published } from "../compiler/scripts/published.mjs";

const { rowsOf } = createRequire(import.meta.url)("../tooling/rx-language-server/src/rows.js");   // a declaration's rows, as the crate reads them

export const here = path.dirname(fileURLToPath(import.meta.url));
export const repo = path.resolve(here, "..");
export const ws = path.join(here, ".out/ws");
export const rxc = process.env.RXC || path.join(repo, "compiler/target/release/rxc");

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
  const rx = path.join(nm, "@reactivescript"); rmSync(rx, { recursive: true, force: true }); mkdirSync(path.join(rx, "runtime"), { recursive: true });
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

/** A task's folder in the workspace: its `src/`, copied fresh. A coverage entry (bench/coverage/<group>/<name>, `from`)
 *  is staged the same way, beside the tasks, under a name of its own. */
export function stage(id, from) {
  const dir = path.join(ws, "tasks", id);
  rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true });
  cpSync(from ?? path.join(here, "tasks", id, "src"), dir, { recursive: true });
  const own = from ? null : ownInstall(id); if (own) symlinkSync(own, path.join(dir, "node_modules"), "dir");
  if (!existsSync(path.join(dir, "tsconfig.json"))) writeFileSync(path.join(dir, "tsconfig.json"), JSON.stringify({ compilerOptions: { jsx: "preserve", jsxImportSource: "@solidjs/web", strict: true, noImplicitAny: true, target: "ES2022", module: "ESNext", moduleResolution: "Bundler", allowImportingTsExtensions: true, noEmit: true, skipLibCheck: true, lib: ["ES2023", "DOM", "DOM.Iterable"], types: [] }, include: ["**/*.rx", "**/*.d.ts"], exclude: ["node_modules", "dist", ".build"] }, null, 2));
  return dir;
}

const codes = ds => ds.map(d => `${d.code}@${path.basename(d.file ?? "")}:${d.line}`);
/** The crate's diagnostics for a program (`rxc check --json`). */
export function crate(entry, spa, host) {
  const r = spawnSync(rxc, ["check", "--json", ...(spa ? ["--spa"] : []), ...(host ? ["--whole-program", "--host", entry] : []), entry], { encoding: "utf8", maxBuffer: 1 << 26 });
  try { const out = JSON.parse(r.stdout); return { diagnostics: out.diagnostics ?? [], advice: out.advice ?? [] }; } catch { return { diagnostics: [{ code: "CRASH", line: 0, file: entry, message: (r.stderr || r.stdout || "").slice(0, 400) }], advice: [] }; }
}
/** The reference checker's (`ref/src/check.ts`). */
export function ref(entry, spa, host) {
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
  const r = spawnSync(process.execPath, [path.join(repo, "tooling/rx-language-server/bin/tsc.js"), "--noEmit", "-p", "tsconfig.json"], { cwd: dir, encoding: "utf8", env: { ...process.env, RXC: rxc } });
  return r.status === 0 ? "" : String(r.stdout ?? "") + String(r.stderr ?? "") || `exit ${r.status}`;
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
export function compile(entry, target, spa) {
  const r = spawnSync(rxc, ["app", entry, "--target", target, ...(spa ? ["--spa"] : [])], { encoding: "utf8", maxBuffer: 1 << 27 });
  let out; try { out = JSON.parse(r.stdout); } catch { return { error: (r.stderr || r.stdout || "").slice(0, 600) }; }
  if (!out.modules) return out;
  const n = ++seq; const name = p => `${p}.${n}.${target}.mjs`;
  for (const [p, m] of Object.entries(out.modules)) writeFileSync(name(p), m.code.replace(/from "(\.{1,2}\/[^"]+\.rx)"/g, (_, s) => `from "${s}.${n}.${target}.mjs"`));
  return { file: name(out.entry ?? entry), css: out.css };
}

const esbuild = () => createRequire(path.join(ws, "package.json"))("esbuild");
/** Node's own modules, in a bundle for the browser: empty, as a bundler for the web makes them (Vite externalizes them
 *  with a warning). A package with one entry for every platform imports its Node adapter beside its browser's
 *  (@solid-primitives/filesystem: `node:fs/promises`, chokidar). */
const nodeBuiltins = () => { const stub = path.join(ws, ".node-stub.cjs"); if (!existsSync(stub)) writeFileSync(stub, "module.exports = {};\n"); const names = ["fs", "fs/promises", "path", "os", "events", "stream", "util", "url", "child_process", "crypto", "module", "worker_threads", "http", "https", "net", "tty", "zlib", "buffer"]; return Object.fromEntries(names.flatMap(n => [[n, stub], [`node:${n}`, stub]])); };
const pw = () => createRequire(path.join(ws, "package.json"))("playwright");

/** What a task's `run` drives the compiled program with. */
export class Runner {
  constructor(dir, entry, spa) { this.dir = dir; this.entry = path.join(dir, entry); this.spa = spa; this.checks = []; this.servers = []; this.problems = []; }
  check(name, ok, got) { this.checks.push({ name, ok: !!ok, got: ok ? undefined : typeof got === "string" ? got.slice(0, 600) : JSON.stringify(got)?.slice(0, 600) }); return !!ok; }
  /** The server's render of one URL: `{ html, text, error }` (the stream, to its end; hydration comments dropped from `text`). */
  async ssr(url = "/", { wait = 4000 } = {}) {
    const built = this.server ??= compile(this.entry, "ssr", this.spa);
    if (!built.file) return { html: "", text: "", error: new Error(JSON.stringify(built).slice(0, 600)) };
    const { createApp } = await import(pathToFileURL(path.join(ws, "node_modules/@reactivescript/runtime/dist/server.js")).href);
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
  client(hydrate) {
    const built = compile(this.entry, "dom", this.spa);
    if (!built.file) throw new Error(JSON.stringify(built).slice(0, 600));
    const entry = built.file + ".entry.mjs";
    writeFileSync(entry, `import main from ${JSON.stringify("./" + path.basename(built.file))};\nimport { createApp } from "@reactivescript/runtime";\nconst app = createApp({ root: document.getElementById("app") });\ntry { app.mount(main(app)${hydrate ? ", true" : ""}); } catch (e) { console.error("mount threw: " + (e && e.message)); }\nwindow.__mounted = true;\n`);
    const r = esbuild().buildSync({ entryPoints: [entry], bundle: true, write: false, format: "esm", platform: "browser", conditions: ["browser", "development"], logLevel: "silent", tsconfigRaw: "{}", absWorkingDir: this.dir, loader: { ".css": "empty" }, alias: nodeBuiltins() });
    return r.outputFiles[0].text;
  }
  /** Serves the program: `ssr` renders each URL on the server and hydrates it; otherwise an empty page the client mounts in. */
  async serve({ ssr = false } = {}) {
    const client = this.client(ssr);
    let render = null;
    if (ssr) {
      const built = this.server ??= compile(this.entry, "ssr", this.spa);
      if (!built.file) throw new Error(JSON.stringify(built).slice(0, 600));
      const rt = await import(pathToFileURL(path.join(ws, "node_modules/@reactivescript/runtime/dist/server.js")).href);
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
    this.browser ??= await pw().chromium.launch();
    const page = await this.browser.newPage();
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
  async close() { await this.browser?.close(); for (const s of this.servers) s.close(); }
}

/** Every file under a task's folder (its own: no node_modules, no dot folders, nothing the build wrote), by a test of its name. */
function own(dir, keep) {
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
const isHost = text => /^\s*export\s+default\s+component\b/m.test(text);
const hostRows = text => { const ls = code(text).map(l => l.trim()).filter(Boolean); const at = ls.findIndex(l => /^export\s+default\s+component\b/.test(l)); return at < 0 ? ls : [...ls.slice(0, at), ls.slice(at).join(" ").replace(/([\[{(])\s+/g, "$1 ").replace(/\s+/g, " ").replace(/\[ /g, "[").replace(/ \]/g, "]")]; };
/** What `rx-declare --host` drafts for the modules a host declaration imports (its lines, comments dropped): the
 *  imports, the contexts those modules use, and every component placed at the top. */
function hostDraft(file) {
  const text = readFileSync(file, "utf8");
  // 09 MO-14g: a declaration that names the router's tree it is derived from (`//@ routes <source> [<entry.rx>…]`) is
  // drafted from there, whole: the command its first line records
  const from = /^[ \t]*\/\/@[ \t]*routes[ \t]+(\S+)((?:[ \t]+\S+)*)[ \t]*$/m.exec(text);
  if (from) {
    const r = spawnSync(process.execPath, [path.join(repo, "tooling/rx-language-server/bin/declare.js"), "--host", "--routes", from[1], ...from[2].trim().split(/\s+/).filter(Boolean)], { cwd: path.dirname(file), encoding: "utf8", env: { ...process.env, RXC: rxc } });
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
function declares(dir, file) {
  const rel = path.relative(dir, file).split(path.sep);
  const at = rel.lastIndexOf("rx-types");
  if (at >= 0) return { spec: rel.slice(at + 1).join("/").replace(/\.d\.rx$/, ""), from: path.join(dir, ...rel.slice(0, at)) };
  const stem = file.replace(/\.d\.rx$/, "");
  const js = [".js", ".mjs", ".jsx", ".ts", ".tsx"].find(x => existsSync(stem + x));
  return { spec: `./${path.basename(stem)}${js ?? ".js"}`, from: path.dirname(file) };
}
/** What `rx-declare` drafts for a module (its lines, comments dropped), with the flags the task says its draft was made
 *  with (`--run`, `--dom`: 09 MO-12, what running the package shows); [] when the module has no types to draft from.
 *  `draftOf(…).vendorAt`: per export, the `any`s of the draft that are the library's own, by place (09 MO-8q). */
const drafted = new Map();   // a module is drafted once in a run of a task: its declarations' measure and its whole draft are one draft
export function draftOf(spec, from, flags = []) {
  const key = JSON.stringify([spec, from, flags]); if (drafted.has(key)) return drafted.get(key);
  const lines = draftNow(spec, from, flags); drafted.set(key, lines); return lines;
}
function draftNow(spec, from, flags) {
  const at = path.join(ws, `.causes-${process.pid}.json`); rmSync(at, { force: true });
  const r = spawnSync(process.execPath, ["--conditions=browser", path.join(repo, "tooling/rx-language-server/bin/declare.js"), spec, "--causes", at, ...flags], { cwd: from, encoding: "utf8", maxBuffer: 1 << 26 });
  const inherited = new Map(), caused = new Map(), why = new Map();
  let said = {}, anyRows = [];
  try { const j = JSON.parse(readFileSync(at, "utf8")); said = j.inferred ?? {}; anyRows = j.rows ?? []; } catch { /* no draft */ }
  try { for (const c of JSON.parse(readFileSync(at, "utf8")).causes) { if (!c.name) continue; caused.set(c.name, (caused.get(c.name) ?? 0) + 1); if (c.cause === "vendor-any") inherited.set(c.name, (inherited.get(c.name) ?? 0) + 1); else why.set(c.name, [...(why.get(c.name) ?? []), c.cause]); } } catch { /* no draft */ }
  rmSync(at, { force: true });
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
  // known.js, written by hand), and the parts said by place
  const anyBy = new Map(); let places = 0;
  for (const l of lines) { const n = exported(l); const k = anysIn(l); if (k) anyBy.set(n ?? l, (anyBy.get(n ?? l) ?? 0) + k); places += tokens(l).filter(t => PLACE.has(t)).length; }
  const rows = [];
  for (const [n, k] of anyBy) { const own = k - (inherited.get(n) ?? 0); if (own > 0) rows.push({ name: n, introduced: own, causes: [...new Set([...(why.get(n) ?? []), ...(k > (caused.get(n) ?? 0) ? ["written by hand (known.js)"] : [])])] }); }
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
export const todoKind = q => /^which context does this hook read beside/.test(q) ? "uses" : /^pure\?/.test(q) ? "pure" : /^is the result a store with fields|^run with no arguments, its fields? /.test(q) ? "store fields" : /called later, outside any computation\?/.test(q) ? "handler" : /signatures in the library's types/.test(q) ? "overloads" : /which context does this hook read|likely read a context|the module's contexts/.test(q) ? "uses" : /its fields drafted `ref`/.test(q) ? "ref fields" : /^does it change /.test(q) ? "draft" : /^what does its promise reject with/.test(q) ? "rejects" : /does it provide a context|does its component provide/.test(q) ? "provides/nests" : /is a class\b/.test(q) ? "class" : /where does the library render/.test(q) ? "renders" : /takes a Solid signal/.test(q) ? "signal" : /`any` here (is|are) the draft's/.test(q) ? "any" : "other";
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
    const { spec, from } = host ? { spec: "the JS host", from: path.dirname(p) } : declares(dir, p);
    const draft = host ? hostDraft(p) : draftOf(spec, from, flagsFor[spec] ?? []);
    const whole = new Set(draft);
    // a name the draft has more than one line for: each row is measured against the nearest of them
    const allByName = new Map(); for (const l of draft) { const n = exported(l); if (n) allByName.set(n, [...(allByName.get(n) ?? []), l]); }
    let words = 0, places = 0, todos = 0; const kept = new Set();
    // 09 MO-8w: every behaviour word of the file, held against what the code shows (`rx-declare --audit`): proven — a
    // word read from the code, counted apart from the words written by hand; contradicted — a false word, which is a
    // problem whoever wrote it; unproven — a person's, listed
    const read = host ? { rows: [] } : audited(p, from);
    if (read.error) problems.push(`the audit did not run (${read.error})`);
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
    const claims = host ? { total: 0, run: 0, code: 0, unverified: 0, mismatch: 0, mismatches: [], by: {} } : claimsOf(dir, p, problems);
    files.push({ file: path.relative(dir, p), spec, words, inferred, todos, contradicted: [...said("contradicted").map(c => `${c} (the code contradicts the word)`), ...claims.mismatches], unproven: said("unproven"), claims, problems, any, inherited, introduced: any - inherited, places, drafted: draft.length > 0, rows, whole: draft.whole });
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
  const r = spawnSync(process.execPath, ["--conditions=browser", path.join(repo, "tooling/rx-language-server/bin/declare.js"), "--audit", "--json", file], { cwd: from, encoding: "utf8", maxBuffer: 1 << 26, timeout: 300000 });
  try { const out = JSON.parse(r.stdout); if (!Array.isArray(out)) throw new Error("not a list"); return out[0] ?? { rows: [] }; } catch { return { rows: [], error: String(r.stderr ?? "").trim().split("\n").pop()?.slice(0, 200) || `exit ${r.status ?? r.signal}` }; }
}
/** The claims of several files, kind by kind. */
export const claimKinds = bys => { const o = {}; for (const by of bys) for (const [k, c] of Object.entries(by ?? {})) { o[k] ??= { run: 0, code: 0, unverified: 0, mismatch: 0 }; for (const s in c) o[k][s] += c[s]; } return o; };
export const claimsSaid = by => Object.entries(by).sort((a, b) => (b[1].unverified - a[1].unverified) || a[0].localeCompare(b[0])).map(([k, c]) => `${k} ${c.run + c.code}/${c.run + c.code + c.unverified + c.mismatch}`).join(", ");
/** What rx-verify shows of each claim a declaration's rows make (`rx-verify --json`: one result a claim, by name):
 *  `total` (that an export is there, `exists`, is no claim about what it does, and a claim that does not apply, are not counted); `run`, held by running; `code`, held by the code's proof where no run reached it; `unverified`; `mismatch`,
 *  with what each says. A verifier that did not answer is a problem, and counts nothing. */
function claimsOf(dir, file, problems) {
  const out = { total: 0, run: 0, code: 0, unverified: 0, mismatch: 0, mismatches: [], by: {} };
  const v = spawnSync(process.execPath, ["--conditions=browser", path.join(repo, "tooling/rx-language-server/bin/verify.js"), "--dom", "--json", path.relative(dir, file)], { cwd: dir, encoding: "utf8", timeout: 180000, maxBuffer: 1 << 26 });
  let res; try { res = JSON.parse(String(v.stdout).trim().split("\n").pop())[0].results; } catch { problems.push(`rx-verify did not run (${String(v.stderr ?? "").trim().split("\n").pop()?.slice(0, 200) || `exit ${v.status ?? v.signal}`})`); return out; }
  const worst = new Map(); const RANK = { mismatch: 3, unverified: 2, held: 1, na: 0 };
  for (const r of res) { const k = `${r.line}:${r.ob}`; const was = worst.get(k); if (!was || RANK[r.status] > RANK[was.status]) worst.set(k, r); }
  for (const r of worst.values()) {
    if (r.status === "mismatch") out.mismatches.push(String(r.what).slice(0, 300));   // (an export that is not there, too)
    if (r.ob === "exists" || r.status === "na") continue;
    if (process.env.BENCH_CLAIMS) console.error(`[claim] ${r.status}${r.by ? ` by ${r.by}` : ""} ${path.relative(ws, file)} ${r.ob}: ${String(r.what).slice(0, 220)}`);
    const st = r.status === "held" ? (r.by === "code" ? "code" : "run") : r.status, kind = r.ob.replace(/:.*$/, "");
    out.total++; out[st]++; out.by[kind] ??= { run: 0, code: 0, unverified: 0, mismatch: 0 }; out.by[kind][st]++;
  }
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
