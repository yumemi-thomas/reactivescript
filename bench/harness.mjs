// What bench/run.mjs runs a task with: the workspace (the libraries from npm, once), both checkers, rx-tsc, the compiled
// program on the server and in Chromium. See bench/README.md.
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

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
/** This repository's packages in a node_modules, as an app installs them: the compiler and the language server linked,
 *  the runtime copied (its peers are then that install's Solid, one copy), the shipped declaration of solid-js copied. */
function linkOwn(nm) {
  const rx = path.join(nm, "@reactivescript"); rmSync(rx, { recursive: true, force: true }); mkdirSync(path.join(rx, "runtime"), { recursive: true });
  symlinkSync(path.join(repo, "compiler"), path.join(rx, "compiler"));
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
    return page;
  }
  /** Opens `url` of a served program and waits for the client to mount. */
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
const exported = line => /^export\s+(?:(?:pure|server|client)\s+)*(?:fn|component|const|type|context|error)\s+([\w$.]+)/.exec(line.trim())?.[1];
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
 *  `draftOf.inherited`: per export, the `any`s of the draft that are the library's own (09 MO-8q). */
const drafted = new Map();   // a module is drafted once in a run of a task: its declarations' measure and its whole draft are one draft
export function draftOf(spec, from, flags = []) {
  const key = JSON.stringify([spec, from, flags]); if (drafted.has(key)) return drafted.get(key);
  const lines = draftNow(spec, from, flags); drafted.set(key, lines); return lines;
}
function draftNow(spec, from, flags) {
  const at = path.join(ws, `.causes-${process.pid}.json`); rmSync(at, { force: true });
  const r = spawnSync(process.execPath, ["--conditions=browser", path.join(repo, "tooling/rx-language-server/bin/declare.js"), spec, "--causes", at, ...flags], { cwd: from, encoding: "utf8", maxBuffer: 1 << 26 });
  const inherited = new Map(), caused = new Map(), why = new Map();
  try { for (const c of JSON.parse(readFileSync(at, "utf8")).causes) { if (!c.name) continue; caused.set(c.name, (caused.get(c.name) ?? 0) + 1); if (c.cause === "vendor-any") inherited.set(c.name, (inherited.get(c.name) ?? 0) + 1); else why.set(c.name, [...(why.get(c.name) ?? []), c.cause]); } } catch { /* no draft */ }
  rmSync(at, { force: true });
  const lines = r.status === 0 ? code(r.stdout).map(l => l.trim()).filter(Boolean) : [];
  lines.inherited = inherited;
  // 09 MO-8q, over the whole draft — every export of the module, not only the rows an app keeps: the `any`s that are the
  // library's own, the ones that are not (each with the draft's cause for it; an `any` no cause answers for is a row of
  // known.js, written by hand), and the parts said by place
  const anyBy = new Map(); let places = 0;
  for (const l of lines) { const n = exported(l); const k = anysIn(l); if (k) anyBy.set(n ?? l, (anyBy.get(n ?? l) ?? 0) + k); places += tokens(l).filter(t => PLACE.has(t)).length; }
  const rows = [];
  for (const [n, k] of anyBy) { const own = k - (inherited.get(n) ?? 0); if (own > 0) rows.push({ name: n, introduced: own, causes: [...new Set([...(why.get(n) ?? []), ...(k > (caused.get(n) ?? 0) ? ["written by hand (known.js)"] : [])])] }); }
  const any = [...anyBy.values()].reduce((a, b) => a + b, 0), introduced = rows.reduce((a, x) => a + x.introduced, 0);
  lines.whole = { rows: lines.length, any, vendor: any - introduced, introduced, places, introducedRows: rows, drafted: r.status === 0, error: r.status === 0 ? undefined : String(r.stderr ?? "").trim().split("\n").pop()?.slice(0, 300) };
  return lines;
}
const PLACE = new Set(["Parameters", "ReturnType", "ConstructorParameters", "InstanceType"]);
/** The `any`s a row writes: the word in a type, not the name of what it exports (valibot exports a schema called `any`). */
const anysIn = line => { const ts = tokens(line); const at = ts.findIndex((t, i) => i > 0 && /^(fn|component|const|type|context|error)$/.test(ts[i - 1]) && ts.slice(0, i).includes("export")); return ts.filter((t, i) => t === "any" && i !== at).length; };
/** A task's declarations, measured against the tool that drafts them: for each `.d.rx` of the task, the words a person
 *  wrote on top of `rx-declare`'s draft of the same module (a row the draft has, word for word, costs nothing; a row it
 *  has otherwise costs the words that differ; a row it has not costs every word; a row left out costs nothing), and the
 *  `any`s the file holds — what the checker is told nothing about — in two numbers (09 MO-8q): `inherited`, the ones the
 *  library's own declaration has at that place (as many, for an export, as the draft of the same export writes for the
 *  library's own), and `introduced`, every other: an `any` where the library has a type. `places`: the parts said by
 *  their place in the library's declaration (`Parameters<typeof import(…)>`), counted apart — not a way around the rule.
 *  `{ words, any, inherited, introduced, places, files: [{ file, words, any, inherited, introduced, places, drafted, rows }] }`. */
export function declarations(dir, flagsFor = {}) {
  const files = [];
  for (const p of own(dir, n => n.endsWith(".d.rx"))) {
    const { spec, from } = declares(dir, p);
    const draft = draftOf(spec, from, flagsFor[spec] ?? []);
    const whole = new Set(draft), byName = new Map(draft.map(l => [exported(l), l]).filter(([n]) => n));
    // a name the draft has more than one line for: each row is measured against the nearest of them
    const allByName = new Map(); for (const l of draft) { const n = exported(l); if (n) allByName.set(n, [...(allByName.get(n) ?? []), l]); }
    let words = 0, places = 0; const anyBy = new Map();
    for (const line of code(readFileSync(p, "utf8")).map(l => l.trim()).filter(Boolean)) {
      const k = anysIn(line);
      if (k) anyBy.set(exported(line) ?? line, (anyBy.get(exported(line) ?? line) ?? 0) + k);
      places += tokens(line).filter(t => PLACE.has(t)).length;
      if (whole.has(line)) continue;
      const was = allByName.get(exported(line));
      words += was ? Math.min(...was.map(w => written(line, w))) : tokens(line).filter(isWord).length;
    }
    let any = 0, inherited = 0; const rows = [];
    for (const [n, k] of anyBy) { any += k; const h = Math.min(k, draft.inherited.get(n) ?? 0); inherited += h; if (k > h) rows.push({ name: n, introduced: k - h }); }
    void byName;
    files.push({ file: path.relative(dir, p), spec, words, any, inherited, introduced: any - inherited, places, drafted: draft.length > 0, rows, whole: draft.whole });
  }
  const sum = k => files.reduce((n, f) => n + f[k], 0);
  const wsum = k => files.reduce((n, f) => n + f.whole[k], 0);
  // `draft`: the same modules drafted whole (every export), 09 MO-8q's numbers over what no app of the benchmark keeps
  return { words: sum("words"), any: sum("any"), inherited: sum("inherited"), introduced: sum("introduced"), places: sum("places"), draft: { rows: wsum("rows"), any: wsum("any"), vendor: wsum("vendor"), introduced: wsum("introduced"), places: wsum("places") }, files };
}

/** rx-tsc's errors that are on the lines an edit wrote: `file(line,col): error …` rows whose file is the edited one and
 *  whose line is one of the edit's. What a type probe is judged by: an error elsewhere is not the type refusing the edit. */
export function onEdit(out, dir, file, [from, to]) {
  const good = readFileSync(path.join(dir, file), "utf8");   // read after the undo: the program as it was
  const first = good.slice(0, good.indexOf(from)).split("\n").length, last = first + to.split("\n").length - 1;
  const name = file.split("/").pop().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return out.split("\n").filter(l => { const m = new RegExp(`(?:^|[\\\\/])${name}[(:](\\d+)[,:]`).exec(l); return m && Number(m[1]) >= first && Number(m[1]) <= last; }).join("\n");
}
export { statSync };
