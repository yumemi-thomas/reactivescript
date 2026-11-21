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

/** The workspace: bench/package.json installed from npm (once; again when it changes), with this repository's compiler,
 *  runtime and language server linked as installed. Every task is a folder under it, so each resolves the same Solid. */
export function workspace() {
  const pkg = readFileSync(path.join(here, "package.json"), "utf8");
  mkdirSync(ws, { recursive: true });
  const at = path.join(ws, "package.json");
  if (!existsSync(path.join(ws, "node_modules/solid-js")) || !existsSync(at) || readFileSync(at, "utf8") !== pkg) {
    writeFileSync(at, pkg);
    execFileSync("npm", ["install", "--no-audit", "--no-fund", "--silent", "--legacy-peer-deps"], { cwd: ws, stdio: "inherit" });
  }
  const rx = path.join(ws, "node_modules/@reactivescript"); rmSync(rx, { recursive: true, force: true }); mkdirSync(path.join(rx, "runtime"), { recursive: true });
  symlinkSync(path.join(repo, "compiler"), path.join(rx, "compiler"));
  symlinkSync(path.join(repo, "tooling/rx-language-server"), path.join(rx, "language-server"));
  for (const f of ["package.json", "dist", "rx-lib.d.ts"]) cpSync(path.join(repo, "runtime", f), path.join(rx, "runtime", f), { recursive: true });
}

/** A task's folder in the workspace: its `src/`, copied fresh. */
export function stage(id) {
  const dir = path.join(ws, "tasks", id);
  rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true });
  cpSync(path.join(here, "tasks", id, "src"), dir, { recursive: true });
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
  const r = spawnSync(process.execPath, [path.join(ws, "node_modules/@reactivescript/language-server/bin/tsc.js"), "--noEmit", "-p", "tsconfig.json"], { cwd: dir, encoding: "utf8", env: { ...process.env, RXC: rxc } });
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
    const r = esbuild().buildSync({ entryPoints: [entry], bundle: true, write: false, format: "esm", platform: "browser", conditions: ["browser", "development"], logLevel: "silent", tsconfigRaw: "{}", absWorkingDir: this.dir, loader: { ".css": "empty" } });
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

/** `any` written in a task's `.rx` (an annotation or a cast): what the program gave up of the library's types. */
export function anysWritten(dir) {
  const out = [];
  const walk = d => { for (const e of readdirSync(d, { withFileTypes: true })) { if (e.name === "node_modules" || e.name.startsWith(".")) continue; const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (e.name.endsWith(".rx") && !e.name.endsWith(".d.rx")) readFileSync(p, "utf8").split("\n").forEach((l, i) => { if (/(:|\bas)\s*any\b|<any>/.test(l.replace(/\/\/.*$/, ""))) out.push(`${e.name}:${i + 1}`); }); } };
  walk(dir);
  return out;
}
export { statSync };
