// 11 CP-4a: an app needs only the compiler in its package.json — the runtime is the compiler's dependency, and the
// front end (compiler/vite.mjs) finds it. Solid's start mode (`solid({ start, ssr: true })`) over an `.rx` root that
// provides a context a component under it reads: under the dev server the request is rendered in Vite's module graph,
// so a runtime that Vite leaves to Node runs on Node's copy of Solid and `provide` finds no owner. Three installs:
//   - nested: the runtime only under the compiler (what a package manager that hoists nothing gives): the compiled
//     module imports that copy, by its folder;
//   - hoisted: the runtime at the top of node_modules, the app listing only the compiler (npm): the import is the bare
//     name, and Solid's plugin reaches the runtime through the compiler's package.json;
//   - unlisted: both at the top, the app listing neither — nothing tells Solid's plugin the runtime runs on Solid: the
//     setup that is really broken, which the runtime says in words.
// Each is the compiler as it is published (scripts/published.mjs). The root is named to start mode as a file, and to the
// front end as a page (`rx({ pages })`, CP-4d). The libraries are bench/.out/ws's (bench/package.json, from its lock),
// as compiler/test/confined.mjs's are.   node compiler/test/runtime-resolve.mjs
import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { execFileSync, spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { ws, workspace } from "../../bench/harness.mjs";
import { published } from "../scripts/published.mjs";

workspace();
const here = path.dirname(fileURLToPath(import.meta.url));
const pkg = path.resolve(here, ".."), repo = path.resolve(pkg, "..");
const out = path.join(here, ".out/runtime-resolve"); rmSync(out, { recursive: true, force: true });
const read = f => JSON.parse(readFileSync(f, "utf8"));
const { chromium } = createRequire(path.join(ws, "package.json"))("playwright");

/** An app under `.out/runtime-resolve/<name>`: the workspace's libraries linked one by one, the compiler copied as it is
 *  published (so its own folder is where it looks for its dependency), the runtime where `runtimeAt` says. */
function project(name, { runtimeAt, lists }) {
  const dir = path.join(out, name), nm = path.join(dir, "node_modules");
  mkdirSync(path.join(nm, "@reactivescript/compiler"), { recursive: true });
  for (const d of readdirSync(path.join(ws, "node_modules"))) {
    if (d.startsWith(".") || d === "@reactivescript") continue;
    if (!d.startsWith("@")) { symlinkSync(path.join(ws, "node_modules", d), path.join(nm, d)); continue; }
    mkdirSync(path.join(nm, d), { recursive: true });
    for (const e of readdirSync(path.join(ws, "node_modules", d))) symlinkSync(path.join(ws, "node_modules", d, e), path.join(nm, d, e));
  }
  const compiler = path.join(nm, "@reactivescript/compiler");
  writeFileSync(path.join(compiler, "package.json"), JSON.stringify(published(read(path.join(pkg, "package.json")), read(path.join(repo, "runtime/package.json"))), null, 2));
  for (const f of readdirSync(pkg)) if (["index.js", "vite.mjs", "lib.mjs"].includes(f) || f.endsWith(".node")) cpSync(path.join(pkg, f), path.join(compiler, f));
  const runtime = path.join(runtimeAt === "nested" ? path.join(compiler, "node_modules") : nm, "@reactivescript/runtime");
  mkdirSync(runtime, { recursive: true });
  for (const f of ["package.json", "dist"]) cpSync(path.join(repo, "runtime", f), path.join(runtime, f), { recursive: true });
  writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name, private: true, type: "module", dependencies: Object.fromEntries([...lists, "@solidjs/vite-plugin", "@solidjs/web", "solid-js", "vite"].map(d => [d, "*"])) }, null, 2));
  writeFileSync(path.join(dir, "vite.config.mjs"), `import { defineConfig } from "vite";
import solid from "@solidjs/vite-plugin";
import rx from "@reactivescript/compiler/vite";
const app = "src/App.rx";
export default defineConfig({ resolve: { preserveSymlinks: true }, plugins: [solid({ ssr: true, start: { app, nodeServer: true }, frontends: { ".rx": rx({ pages: [app], generate: false }) } })] });
`);   // preserveSymlinks: Solid is the pin's, linked (scripts/lib/relink.mjs, linkedSolid)
  writeFileSync(path.join(dir, "dev.mjs"), `import { createServer } from "vite";
const server = await createServer({ logLevel: process.env.RR_LOG ? "info" : "silent", server: { host: "127.0.0.1", port: 0, watch: null } });
await server.listen();
console.log(\`listening \${server.httpServer.address().port}\`);
`);   // watch: null — the project is written a moment before its server starts, and on macOS the watcher (chokidar
  // over FSEvents) reports each file just written as changed once it starts: `vite.config.mjs changed, restarting
  // server`. A restart that lands during the first render dropped it ("transport was disconnected, cannot call
  // fetchModule", Vite's error overlay over the page, the click never landing); one that lands before it passed. Nothing
  // here edits a file under a running server, so it watches none. `RR_LOG=1` prints the servers' logs.
  mkdirSync(path.join(dir, "src"));
  writeFileSync(path.join(dir, "src/team.rx"), "export context team: { name: string }\n");
  writeFileSync(path.join(dir, "src/App.rx"), `import { team } from "./team.rx"

source clicks := 0

component Title() {
  t = use team
  <h1>People of {t.name}</h1>
}

export default component App() {
  provide team = { name: "Directory" }
  <Title />
  <button class="counter" onClick={() => { clicks := clicks + 1 }}>clicks: {clicks}</button>
}
`);
  return dir;
}

let pass = 0, fail = 0;
const check = (name, ok, got) => { ok ? pass++ : fail++; console.log(`${ok ? "  ✓" : "  ✗"} ${name}${ok ? "" : `\n      ${String(typeof got === "string" ? got : JSON.stringify(got)).slice(0, 900)}`}`); };
const listening = (child, re) => new Promise((resolve, reject) => { let err = ""; child.stderr.on("data", d => { err += d; }); child.stdout.on("data", d => { const m = re.exec(String(d)); if (m) resolve(Number(m[1])); }); child.on("exit", c => reject(new Error(`server exited ${c}: ${err.slice(-600)}`))); });
const bodyText = html => html.replace(/<head[\s\S]*?<\/head>/, "").replace(/<script[\s\S]*?<\/script>/g, "").replace(/<style[\s\S]*?<\/style>/g, "").replace(/<!--.*?-->/g, "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
const browser = await chromium.launch();

/** The dev server's own render of `/`, then the page hydrated and clicked: `{ served, raw, text, problems }`. */
async function dev(dir, { hydrate = true } = {}) {
  const child = spawn(process.execPath, ["dev.mjs"], { cwd: dir, env: { ...process.env, RX_TYPECHECK: "0" } });
  if (process.env.RR_LOG) { const t0 = Date.now(); const tag = d => String(d).split("\n").filter(Boolean).map(l => `[${path.basename(dir)} +${Date.now() - t0}ms] ${l}`).join("\n") + "\n"; child.stdout.on("data", d => process.stderr.write(tag(d))); child.stderr.on("data", d => process.stderr.write(tag(d))); }
  try {
    const base = `http://127.0.0.1:${await listening(child, /listening (\d+)/)}`;
    // (asked once: the `fetch failed` a retry here used to hide was the same watcher's restart, see dev.mjs)
    const raw = await (await fetch(base + "/", { headers: { accept: "text/html" } })).text();
    const r = { raw, served: bodyText(raw), text: "", problems: [] };
    if (!hydrate) return r;
    const page = await browser.newPage();
    page.on("console", m => { if (["error", "warning"].includes(m.type())) r.problems.push(m.text().slice(0, 300)); }); page.on("pageerror", e => r.problems.push(String(e).slice(0, 300)));
    await page.goto(base + "/");
    try { await page.click("button.counter"); }
    catch (e) { const overlay = await page.evaluate(() => document.querySelector("vite-error-overlay")?.shadowRoot?.textContent ?? null).catch(() => null); throw new Error(`${overlay ? `Vite's error overlay: ${overlay.replace(/\s+/g, " ").slice(0, 1500)}\n` : ""}${e.message}`); }
    for (let i = 0; i < 100 && !/clicks: 1/.test(r.text); i++) { r.text = ((await page.textContent("body")) ?? "").replace(/\s+/g, " ").trim(); if (!/clicks: 1/.test(r.text)) await page.waitForTimeout(50); }
    await page.close();
    return r;
  } finally { child.kill(); }
}
/** `vite build`, then the Node server start mode wrote: its render of `/`. */
async function built(dir) {
  execFileSync(process.execPath, [path.join(dir, "node_modules/vite/bin/vite.js"), "build"], { cwd: dir, stdio: ["ignore", "ignore", "pipe"], env: { ...process.env, RX_TYPECHECK: "0" } });
  const child = spawn(process.execPath, ["dist/server/node.js"], { cwd: dir, env: { ...process.env, PORT: "0", HOST: "127.0.0.1" } });
  try { return bodyText(await (await fetch(`http://127.0.0.1:${await listening(child, /Listening on http:\/\/[^:]+:(\d+)/)}/`)).text()); }
  finally { child.kill(); }
}

for (const [name, runtimeAt, how] of [
  ["nested", "nested", "the runtime only under the compiler: the compiled root imports that copy, by its folder"],
  ["hoisted", "top", "the runtime at the top, the app listing only the compiler: Solid's plugin reaches it through the compiler's package.json"],
]) {
  console.log(`${name} — ${how}`);
  const dir = project(name, { runtimeAt, lists: ["@reactivescript/compiler"] });
  try {
    const d = await dev(dir);
    check("the dev server renders the request: the root's provision is read by a component under it (one Solid under the app and the runtime)", /People of Directory/.test(d.served) && /clicks: 0/.test(d.served), d.raw.slice(0, 900));
    check("hydrated and live in the browser: an .rx source written by a click", /clicks: 1/.test(d.text) && /People of Directory/.test(d.text), d.text);
    check("no console errors or warnings (no hydration mismatch, one runtime in the page)", d.problems.length === 0, d.problems);
  } catch (e) { check("the dev server ran", false, String(e?.stack ?? e)); }
  try { const served = await built(dir); check("the build's Node server renders the same", /People of Directory/.test(served) && /clicks: 0/.test(served), served); }
  catch (e) { check("the build ran", false, String(e?.stderr ?? e?.stack ?? e)); }
}
{
  console.log("unlisted — the app lists neither package: the runtime is left to Node, and says what happened");
  const dir = project("unlisted", { runtimeAt: "top", lists: [] });
  try {
    const d = await dev(dir, { hydrate: false });
    check("the dev server's render fails with the cause in words, and the package.json line that fixes it", /provide team: no owner/.test(d.raw) && /list @reactivescript\/compiler/.test(d.raw) && !/People of Directory/.test(d.served), d.raw.slice(0, 900));
  } catch (e) { check("the dev server ran", false, String(e?.stack ?? e)); }
}
await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
