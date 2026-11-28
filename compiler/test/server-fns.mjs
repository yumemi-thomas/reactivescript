// Server functions in a real Vite app (12 SF-2, SF-5a, SF-6, SF-7a; 10 SV-5a), end to end: Solid's start mode
// (bench/tasks/start-mode: filesystem-routing, @solidjs/router), with `server fn` pages over a server-only database, and a
// client-only app over a server fn. Built and served by Vite, in the benchmark's workspace (bench/.out/ws: npm's
// @solidjs/vite-plugin, with this repository's compiler and runtime linked as installed), driven in Chromium.
//   - the server-function pass off (the plugin's default, `solid({ ... })` with no `serverFunctions`): the build fails and
//     says why, and the dev server refuses the module — a server fn body never reaches a browser (found by the server hunt:
//     its body and the database's module shipped and ran in the browser)
//   - the pass on: no body and no server-only data in the client's files; a call is a request to /_server
//   - a request to a server fn runs in that request's app, whatever page the server rendered before or never rendered:
//     a page reached by client navigation on a fresh server, and a client-only app (found by the hunt: the body borrowed
//     the last render's app, or had none)
//   - a declared JS error class (`export error NotFound` in a .d.rx) and an `.rx` error class cross as themselves, served,
//     over the wire, and to an action's typed `catch`, in production and under the dev server alike
//   - a value the wire cannot carry (a Date) is named, in production as in development, and said on the server
// Needs the crate's Node-API build (`npm run build` here), the runtime's (`npm run build` in ../runtime) and the
// benchmark's install (bench/run.mjs installs it; `scripts/ci --only bench-install`).
// Usage: node compiler/test/server-fns.mjs
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "../..");
const { workspace, ws } = await import(pathToFileURL(path.join(repo, "bench/harness.mjs")).href);
const { linkedSolid } = await import(pathToFileURL(path.join(repo, "scripts/lib/relink.mjs")).href);   // Solid is the pin's, linked
if (!existsSync(path.join(ws, "node_modules/@solidjs/vite-plugin"))) { console.error("no benchmark install: run `scripts/ci --only bench-install` (or bench/run.mjs) first"); process.exit(2); }
workspace();   // this repository's compiler and runtime, as installed (again: the runtime is copied)
const vite = path.join(ws, "node_modules/vite/bin/vite.js");
const { chromium } = createRequire(path.join(repo, "ref/package.json"))("playwright");

let pass = 0, fail = 0;
const check = (name, ok, got) => { ok ? pass++ : fail++; console.log(`${ok ? "  ✓" : "  ✗"} ${name}${ok ? "" : `\n      ${String(typeof got === "string" ? got : JSON.stringify(got)).slice(0, 600)}`}`); };
const until = async (f, n = 100) => { for (let i = 0; i < n; i++) { if (await f()) return true; await new Promise(r => setTimeout(r, 50)); } return false; };
const listening = (child, re) => new Promise((resolve, reject) => { let out = ""; child.stdout.on("data", d => { out += d; const m = re.exec(out); if (m) resolve(Number(m[1])); }); child.on("exit", c => reject(new Error(`server exited ${c}: ${out}`))); });
const files = dir => readdirSync(dir, { recursive: true, withFileTypes: true }).filter(e => e.isFile()).map(e => path.join(e.parentPath ?? e.path, e.name));
const env = { ...process.env, RX_TYPECHECK: "0", NODE_OPTIONS: "--max-old-space-size=2000" };

// ---- the apps ----
const DB = `// A server-only database, in memory: it holds a field no page may see.
export class NotFound extends Error { constructor(id) { super(\`no user \${id}\`); this.name = "NotFound"; this.id = id; } }
const users = { 1: { name: "Ann", n: 1, secret: "SECRET_FIELD_hunter2" } };
export async function dbUser(id) { await new Promise(r => setTimeout(r, 20)); const u = users[id]; if (!u) throw new NotFound(id); return { ...u }; }
export async function dbSave(id, name) { const u = users[id]; if (!u) throw new NotFound(id); u.name = name; u.n += 1; return { name, n: u.n }; }
export async function dbWhen(id) { return { id, at: new Date(0) }; }
`;
const DB_RX = `export error NotFound
export type User = { name: string; n: number; secret: string }
export server pure fn dbUser(id: string): Promise<User> rejects(NotFound)
export server fn dbSave(id: string, name: string): Promise<{ name: string; n: number }> rejects(NotFound)
export server pure fn dbWhen(id: string): Promise<{ id: string; at: Date }>
`;
// /u/:id — a page over two server fns: a question, and an action that writes and re-asks
const USER = `import { useParams } from "@solidjs/router"
import { dbUser, dbSave } from "../../../db.js"
server fn loadUser(id: string) {
  let u = await dbUser(id)
  return { name: u.name, n: u.n }
}
server fn rename(id: string, name: string) {
  let r = await dbSave(id, name)
  return r.n
}
export default component UserPage() {
  params = useParams()
  user = await loadUser(params.id ?? "")
  source status := ""
  action save(name: string) {
    try {
      let n = await rename(params.id ?? "", name)
      status := \`saved \${n}\`
      refresh user
    } catch (e) { status := \`error: \${e.message}\` }
  }
  errored fallback(e) { <p class="err">err: {e.message}</p> } {
    <h1 class="user">{user.name} ({user.n})</h1>
  }
  <button class="save" onClick={() => { save("Zed") }}>save</button>
  <p class="status">status: {status}</p>
}
`;
// /e/:id — failures across the wire: a JS class its .d.rx declares, an .rx class, and one nothing declares
const ERRORS = `import { useParams } from "@solidjs/router"
import { dbUser, NotFound } from "../../../db.js"
error TooLong(n: number) => \`too long: \${n}\`
server fn load(id: string) {
  if (id == "long") { throw TooLong(42) }
  let u = await dbUser(id)
  return { name: u.name, n: u.n }
}
server fn act(id: string) {
  if (id == "long") { throw TooLong(7) }
  let u = await dbUser(id)
  return u.name
}
export default component ErrPage() {
  params = useParams()
  u = await load(params.id ?? "")
  source msg := ""
  action go() {
    try {
      try {
        try { let r = await act(params.id ?? ""); msg := \`ok \${r}\` }
        catch (e: TooLong) { msg := \`toolong n=\${e.n} \${e.message}\` }
      } catch (e: NotFound) { msg := \`notfound \${e.message}\` }
    } catch (e) { msg := \`other \${e.message}\` }
  }
  <button class="go" onClick={() => { go() }}>go</button>
  <span class="msg">msg: {msg}</span>
  errored fallback(e) { <p class="b">other: {e.message}</p> } {
    errored fallback(e: NotFound) { <p class="b">NotFound: {e.message}</p> } {
      errored fallback(e: TooLong) { <p class="b">TooLong n={e.n}: {e.message}</p> } {
        <p class="b">user {u.name}</p>
      }
    }
  }
}
`;
// /w — a result the wire cannot carry
const WHEN = `import { dbWhen } from "../../db.js"
server fn when(id: string) {
  let r = await dbWhen(id)
  return { id: r.id, at: r.at }
}
export default component When() {
  w = await when("1")
  errored fallback(e) { <p class="b">failed: {e.message}</p> } {
    <p class="b">at {w.id}</p>
  }
}
`;
const LINKS = `<nav><a href={paths()}>Home</a> <a href={paths.people("1")}>Ann</a> <a href={paths.people("9")}>Nobody</a> <a class="tou" href="/u/1">user</a> <a class="toe9" href="/e/9">e9</a> <a class="toelong" href="/e/long">elong</a> <a class="tow" href="/w">w</a></nav>`;

/** A start-mode app (bench/tasks/start-mode) with the pages above; `on`: the plugin's server-function pass. */
function startApp(name, on) {
  const dir = path.join(ws, `server-fns-${name}`);
  rmSync(dir, { recursive: true, force: true });
  cpSync(path.join(repo, "bench/tasks/start-mode/src"), dir, { recursive: true });
  const at = f => path.join(dir, "src", f);
  writeFileSync(at("db.js"), DB); writeFileSync(at("db.d.rx"), DB_RX);
  for (const [f, src] of [["routes/(app)/u/[id].rx", USER], ["routes/(app)/e/[id].rx", ERRORS], ["routes/(app)/w.rx", WHEN]]) { mkdirSync(path.dirname(at(f)), { recursive: true }); writeFileSync(at(f), src); }
  const layout = at("routes/(app).rx");
  writeFileSync(layout, readFileSync(layout, "utf8").replace(/<nav>.*<\/nav>/, LINKS));
  const config = path.join(dir, "vite.config.ts");
  writeFileSync(config, linkedSolid(readFileSync(config, "utf8").replace("solid({ ssr: true,", on ? "solid({ ssr: true, serverFunctions: true," : "solid({ ssr: true,")));
  // MO-14g: the host's declaration follows the routes directory
  const d = spawnSync(process.execPath, [path.join(ws, "node_modules/@reactivescript/language-server/bin/declare.js"), "--host", "--sync", "src/host.d.rx"], { cwd: dir, encoding: "utf8" });
  if (d.status !== 0) throw new Error(`rx-declare --host --sync: ${d.stdout}${d.stderr}`);
  return dir;
}
const build = dir => spawnSync(process.execPath, [vite, "build"], { cwd: dir, encoding: "utf8", env, timeout: 600000 });

const browser = await chromium.launch();
const problems = [];
async function page() {
  const p = await browser.newPage(); const requests = [];
  p.on("request", r => requests.push(`${r.method()} ${r.url()}`));
  p.on("console", m => { if (m.type() === "error") problems.push(m.text()); });
  p.on("pageerror", e => problems.push(String(e)));
  const text = async () => ((await p.textContent("body")) ?? "").replace(/\s+/g, " ").trim();
  return { p, requests, text };
}
const bodyText = html => html.replace(/<head[\s\S]*?<\/head>/, "").replace(/<script[\s\S]*?<\/script>/g, "").replace(/<style[\s\S]*?<\/style>/g, "").replace(/<!--.*?-->/g, "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
/** `node dist/server/node.js`, fresh: what it printed on stderr is `err()`. */
async function serve(dir) {
  const server = spawn(process.execPath, ["--max-old-space-size=2000", "dist/server/node.js"], { cwd: dir, env: { ...process.env, PORT: "0", HOST: "127.0.0.1" } });
  let err = ""; server.stderr.on("data", d => { err += d; });
  const base = `http://127.0.0.1:${await listening(server, /Listening on http:\/\/[^:]+:(\d+)/)}`;
  return { base, err: () => err, stop: () => server.kill() };
}

try {
  // ---- the pass off: refused, at build and under the dev server ----
  console.log("server-function pass off (the plugin's default)");
  {
    const dir = startApp("off", false);
    const b = build(dir);
    check("the build fails: a server fn would run in the browser", b.status !== 0, b.stdout + b.stderr);
    check("and says which fn, where, and how to turn the pass on", /server fn (loadUser|rename|load|act|when) \(src\/routes\/.*?\.rx\) would run in the browser: turn on Solid's server-function pass, solid\(\{ serverFunctions: true \}\)/.test(b.stdout + b.stderr), (b.stdout + b.stderr).slice(-1500));
    check("nothing was written for the browser", !existsSync(path.join(dir, "dist/client")) || !files(path.join(dir, "dist/client")).some(f => /\.(js|mjs)$/.test(f)), existsSync(path.join(dir, "dist")) ? files(path.join(dir, "dist")) : []);
    const { createServer } = await import(pathToFileURL(path.join(ws, "node_modules/vite/dist/node/index.js")).href);
    const server = await createServer({ root: dir, configFile: path.join(dir, "vite.config.ts"), logLevel: "silent", server: { host: "127.0.0.1", port: 0, hmr: false } });
    try {
      let said = "";
      try { await server.environments.client.transformRequest("/src/routes/(app)/u/[id].rx?rx-page"); } catch (e) { said = String(e?.message ?? e); }
      check("the dev server refuses to serve the page's module to the browser, saying why", /server fn loadUser \(src\/routes\/\(app\)\/u\/\[id\]\.rx\) would run in the browser: turn on Solid's server-function pass/.test(said), said);
    } finally { await server.close(); }
  }

  // ---- the pass on: production ----
  console.log("server-function pass on (`solid({ serverFunctions: true })`), production");
  const dir = startApp("on", true);
  {
    const b = build(dir);
    check("the build passes", b.status === 0, (b.stdout + b.stderr).slice(-2000));
    const client = files(path.join(dir, "dist/client")).filter(f => /\.(js|mjs|html)$/.test(f));
    const shipped = client.filter(f => { const t = readFileSync(f, "utf8"); return t.includes("SECRET_FIELD") || t.includes("would run in the browser: turn on Solid's server-function pass") || /function\*\s*\(\s*\w*\$?id\b[\s\S]{0,200}dbSave/.test(t); });
    check("the client's files hold no server fn body and nothing of the server-only database", client.length > 0 && shipped.length === 0, shipped.map(f => path.relative(dir, f)));
    check("the server's build holds the bodies", files(path.join(dir, "dist/server")).some(f => readFileSync(f, "utf8").includes("SECRET_FIELD")), "");
  }
  {
    // a fresh server: the first page it renders has no server fn; the user page is reached by a link
    const s = await serve(dir);
    try {
      const { p, requests, text } = await page();
      await p.goto(s.base + "/people/1");
      check("/people/1, a page with no server fn, hydrated", await until(async () => /Ann\s*engineer/.test(await text())), await text());
      await p.click("a.tou");
      check("a client navigation to a server fn page on a fresh server: its question is answered over the wire (12 SF-2b)", await until(async () => /Ann \(1\)/.test(await text())), await text());
      await p.click("button.save");
      check("an action's server fn call, then `refresh` of the question: the server's write and its new answer", await until(async () => /Zed \(2\)/.test(await text()) && /status: saved 2/.test(await text())), await text());
      const calls = requests.filter(r => r.includes("/_server"));
      check("each call was a request to the server's endpoint, nothing else left the page", calls.length >= 3 && requests.every(r => r.startsWith(`GET ${s.base}`) || r.startsWith(`POST ${s.base}/_server`) || r.includes("/_server")), requests);
      await p.close();
    } finally { s.stop(); }
  }
  {
    const s = await serve(dir);
    try {
      const served = bodyText(await (await fetch(s.base + "/e/9")).text());
      check("served: a declared JS class (db.d.rx `export error NotFound`) rejected in a server fn reaches its typed boundary as itself (SV-5a)", /NotFound: no user 9/.test(served), served);
      const long = bodyText(await (await fetch(s.base + "/e/long")).text());
      check("served: an .rx error class thrown in a server fn, with its field", /TooLong n=42: too long: 42/.test(long), long);
      const { p, text } = await page();
      await p.goto(s.base + "/people/1");
      await until(async () => /Ann\s*engineer/.test(await text()));
      await p.click("a.toe9");
      check("over the wire after a client navigation: the JS class reaches its typed boundary", await until(async () => /NotFound: no user 9/.test(await text())), await text());
      await p.click("button.go");
      check("an action's typed catch takes the JS class, over the wire", await until(async () => /msg: notfound no user 9/.test(await text())), await text());
      // (from a page that shows no failure: a boundary that shows NotFound does not hand over to an inner one when the
      // failure changes class after a pending answer in the Solid runners — an open difference, DECISION.md)
      await p.click("a[href='/people/1']");
      await until(async () => /Ann\s*engineer/.test(await text()));
      await p.click("a.toelong");
      check("over the wire: the .rx class reaches its typed boundary with its field", await until(async () => /TooLong n=42: too long: 42/.test(await text())), await text());
      await p.click("button.go");
      check("an action's typed catch takes the .rx class, over the wire", await until(async () => /msg: toolong n=7 too long: 7/.test(await text())), await text());
      await p.click("a.tow");
      check("a Date in a server fn's result is named in production, not an anonymous Internal Server Error (12 SF-6a)", await until(async () => /failed: WIRE_VALUE: when: its result\.at is an instance of Date/.test(await text())), await text());
      check("and said on the server", /WIRE_VALUE: when: its result\.at is an instance of Date/.test(s.err()), s.err());
      await p.close();
    } finally { s.stop(); }
  }

  // ---- the pass on: the dev server ----
  console.log("server-function pass on, the dev server");
  {
    const dev = spawn(process.execPath, ["--max-old-space-size=2000", "dev.mjs"], { cwd: dir, env });
    try {
      const base = `http://127.0.0.1:${await listening(dev, /listening (\d+)/)}`;
      const { p, text } = await page();
      await p.goto(base + "/e/long");
      check("dev, served: the .rx class at its typed boundary", await until(async () => /TooLong n=42: too long: 42/.test(await text()), 300), await text());
      await p.click("button.go");
      check("dev: an action's typed catch takes the .rx class over the wire, as in production", await until(async () => /msg: toolong n=7 too long: 7/.test(await text()), 300), await text());
      await p.click("a.toe9");
      await until(async () => /NotFound: no user 9/.test(await text()), 300);
      await p.click("button.go");
      check("dev: and the declared JS class", await until(async () => /msg: notfound no user 9/.test(await text()), 300), await text());
      await p.click("a.tow");
      check("dev: a Date in a result named as in production", await until(async () => /failed: WIRE_VALUE: when: its result\.at is an instance of Date/.test(await text()), 300), await text());
      await p.close();
    } finally { dev.kill(); }
  }

  // ---- a client-only app over a server fn, under the dev server: no render ever runs on the server ----
  console.log("a client-only app with the pass on, the dev server");
  {
    const spa = path.join(ws, "server-fns-spa");
    rmSync(spa, { recursive: true, force: true }); mkdirSync(path.join(spa, "src"), { recursive: true });
    writeFileSync(path.join(spa, "package.json"), `{ "name": "server-fns-spa", "private": true, "type": "module" }\n`);
    writeFileSync(path.join(spa, "index.html"), `<!doctype html><html><head><meta charset="utf-8"></head><body><div id="app"></div><script type="module" src="/src/boot.ts"></script></body></html>\n`);
    writeFileSync(path.join(spa, "src/boot.ts"), `import main from "./App.rx";\nimport { createApp } from "@reactivescript/runtime";\nconst app = createApp({ root: document.getElementById("app")! });\napp.mount(main(app));\n`);
    writeFileSync(path.join(spa, "vite.config.ts"), linkedSolid(`import { defineConfig } from "vite";\nimport solid from "@solidjs/vite-plugin";\nexport default defineConfig({ plugins: [solid({ serverFunctions: true })] });\n`));
    writeFileSync(path.join(spa, "src/db.js"), DB); writeFileSync(path.join(spa, "src/db.d.rx"), DB_RX);
    writeFileSync(path.join(spa, "src/App.rx"), `import { dbUser } from "./db.js"
server fn loadUser(id: string) {
  let u = await dbUser(id)
  return { name: u.name, n: u.n }
}
export default component App() {
  source id := "1"
  u = await loadUser(id)
  errored fallback(e) { <p class="b">failed: {e.message}</p> } {
    loading fallback { <p class="b">loading</p> } { <p class="b">user {u.name}</p> }
  }
}
`);
    cpSync(path.join(dir, "dev.mjs"), path.join(spa, "dev.mjs"));
    const dev = spawn(process.execPath, ["--max-old-space-size=2000", "dev.mjs"], { cwd: spa, env });
    try {
      const base = `http://127.0.0.1:${await listening(dev, /listening (\d+)/)}`;
      const { p, text } = await page();
      await p.goto(base + "/");
      check("a client-only app's server fn is answered in an app of its request's own (no render ran on the server)", await until(async () => /user Ann/.test(await text()), 300), await text());
      await p.close();
    } finally { dev.kill(); }
  }
} finally { await browser.close(); }

check("no page error outside what was asked for", problems.filter(t => !/WIRE_VALUE|Internal Server Error|no user 9|too long|500/.test(t)).length === 0, problems);
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
