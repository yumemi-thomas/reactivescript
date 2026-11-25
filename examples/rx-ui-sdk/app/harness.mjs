// Bundles app/cases.tsx over one of the packages (client and server), compiles the .rx app, and serves them.
import esbuild from "esbuild"; import { transform } from "@solidjs/compiler"; import { createServer } from "node:http"; import { readFileSync, writeFileSync, mkdirSync } from "node:fs"; import { execFileSync } from "node:child_process"; import { pathToFileURL } from "node:url"; import path from "node:path";
export const here = path.dirname(new URL(import.meta.url).pathname), root = path.dirname(here), repo = path.resolve(root, "../..");
export const rxc = process.env.RXC ?? path.join(repo, "compiler/target/release/rxc");
export const own = path.join(root, "node_modules/@rx-ui-sdk/solid");
const solid = (generate, dev) => ({ name: "solid", setup(b) { b.onLoad({ filter: /\.[tj]sx$/ }, (a) => ({ contents: transform(readFileSync(a.path, "utf8"), { filename: a.path, generate, hydratable: true, dev, moduleName: "@solidjs/web" }).code, loader: "ts" })); } });
const parts = (which) => ({ name: "parts", setup(b) { b.onResolve({ filter: /^#(toggle|tabs|dialog)$/ }, (a) => which === "orig" ? b.resolve(`@ui-sdk/solid/${a.path.slice(1)}`, { resolveDir: root, kind: a.kind }) : { path: path.join(root, "facade", a.path.slice(1) + ".js") }); } });
export async function bundle(which, { dev = true, entry = "client.tsx", minify = false, external = [], contents, resolveDir } = {}) {
  const r = await esbuild.build({ ...(contents ? { stdin: { contents, resolveDir: resolveDir ?? here, loader: "tsx" } } : { entryPoints: [path.join(here, entry)] }), bundle: true, write: false, format: "esm", platform: "browser", minify, treeShaking: true, external, conditions: ["browser", "solid", dev ? "development" : "production"], define: { "process.env.NODE_ENV": dev ? '"development"' : '"production"' }, logLevel: "error", plugins: [parts(which), solid("dom", dev)] });
  return r.outputFiles[0].text;
}
let seq = 0;
export async function server(which) {
  const out = path.join(root, "app/.out"); mkdirSync(out, { recursive: true }); const f = path.join(out, `server.${which}.${++seq}.mjs`);
  await esbuild.build({ entryPoints: [path.join(here, "server.tsx")], bundle: true, outfile: f, format: "esm", platform: "node", packages: "bundle", conditions: ["node", "solid", "development"], external: ["solid-js", "@solidjs/*", "node:*"], logLevel: "error", plugins: [parts(which), solid("ssr", true)] });
  return import(pathToFileURL(f).href);
}
export async function rxApp() {
  const j = JSON.parse(execFileSync(rxc, ["app", path.join(here, "main.rx"), "--target", "dom"], { encoding: "utf8", maxBuffer: 1e8 })); if (!j.modules) throw new Error(JSON.stringify(j).slice(0, 800));
  const out = path.join(root, "app/.out"); mkdirSync(out, { recursive: true }); const ss = JSON.parse(execFileSync(rxc, ["app", path.join(here, "main.rx"), "--target", "ssr"], { encoding: "utf8", maxBuffer: 1e8 }));
  const put = (m, t) => { const [k] = Object.entries(m).find(([p]) => p.endsWith("app/main.rx")); writeFileSync(path.join(out, `main.${t}.mjs`), m[k].code); }; put(j.modules, "dom"); put(ss.modules, "ssr");
  const client = await bundle("rx", { contents: `import main from "./.out/main.dom.mjs"; import { createApp } from "@reactivescript/runtime"; import { OBSERVE } from "solid-js"; window.__diag = []; try { OBSERVE?.diagnostics?.subscribe((e) => window.__diag.push(e.code)); } catch {} const root = document.getElementById("app"); const app = createApp({ root }); app.mount(main(app), !!root.firstChild); window.__mounted = true;` });
  const rt = await import("@reactivescript/runtime"); const main = (await import(pathToFileURL(path.join(out, "main.ssr.mjs")).href)).default;
  const ssr = () => new Promise((res) => { let html = ""; const app = rt.createApp({ request: new Request("http://localhost/") }); app.stream(main(app), { write: (s) => { html += s; }, end: () => res(html) }); });
  return { client, ssr, head: rt.generateHydrationScript() };
}
/** `client`: the script; `html(name)`: the server's markup, or undefined to render in the browser. */
export const serve = (client, html) => new Promise((res) => { const s = createServer(async (rq, out) => {
  const u = new URL(rq.url, "http://x"); if (u.pathname === "/client.js") { out.writeHead(200, { "content-type": "text/javascript" }); return out.end(client); } if (u.pathname !== "/") { out.writeHead(404); return out.end(); }
  out.writeHead(200, { "content-type": "text/html" }); const name = u.searchParams.get("case"); const h = u.searchParams.get("ssr") ? await html(name) : undefined;
  out.end(`<!doctype html><html><head><meta charset="utf-8">${h?.head ?? ""}</head><body><button id="before">Before</button><div id="app">${h?.body ?? ""}</div><button id="after">After</button><script type="module" src="/client.js"></script></body></html>`);
}).listen(0, "127.0.0.1", () => res({ url: `http://127.0.0.1:${s.address().port}/`, close: () => s.close() })); });
