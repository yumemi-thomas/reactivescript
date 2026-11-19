// Routing under SSR (10 SV-4, SV-5a; 09 MO-11): examples/router rendered on the server for each URL, one app per request
// (`createApp({ request })`, so @solidjs/router reads the page's URL from Solid's request event), streamed to Chromium
// and hydrated by the same program's client build. Checks each URL's page once hydrated, that the `NotFound` a route
// rejects with crosses as itself (its typed boundary's fallback, SV-5a), and that a link navigates on the client.
// Needs the crate (`cargo build --release` here), the runtime (`npm run build` in ../runtime), and the router install
// compiler/test/vite.mjs makes (`node compiler/test/vite.mjs router` once).
// Usage: node compiler/test/ssr-router.mjs
import { mkdirSync, rmSync, symlinkSync, writeFileSync, cpSync, existsSync } from "node:fs";
import { createServer } from "node:http";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "../..");
const example = path.join(repo, "examples/router");
const installed = path.join(here, ".out/router/node_modules");
if (!existsSync(path.join(installed, "@solidjs/router"))) { console.error("no router install: run `node compiler/test/vite.mjs router` first"); process.exit(2); }
const ws = path.join(here, ".out/ssr-router");
rmSync(ws, { recursive: true, force: true }); mkdirSync(path.join(ws, "client"), { recursive: true });
// one Solid: the install's, for the app, the router and the runtime alike (the runtime's own node_modules stay out)
mkdirSync(path.join(ws, "node_modules/@solidjs"), { recursive: true }); mkdirSync(path.join(ws, "node_modules/@reactivescript/runtime"), { recursive: true });
symlinkSync(path.join(installed, "solid-js"), path.join(ws, "node_modules/solid-js"));
for (const p of ["router", "web", "signals"]) symlinkSync(path.join(installed, "@solidjs", p), path.join(ws, "node_modules/@solidjs", p));
for (const p of ["dist", "package.json"]) cpSync(path.join(repo, "runtime", p), path.join(ws, "node_modules/@reactivescript/runtime", p), { recursive: true });
writeFileSync(path.join(ws, "package.json"), `{ "type": "module" }`);
for (const f of ["router.js", "people.js"]) cpSync(path.join(example, f), path.join(ws, f));
// the program, for each side: `rxc app` modules import each other by `.rx` path
const rxc = path.join(repo, "compiler/target/release/rxc");
for (const [target, dir, js] of [["ssr", ws, "./"], ["dom", path.join(ws, "client"), "../"]]) {
  const app = JSON.parse(execFileSync(rxc, ["app", path.join(example, "main.rx"), "--target", target], { encoding: "utf8", maxBuffer: 1 << 26 }));
  if (!app.modules) { console.error(JSON.stringify(app).slice(0, 2000)); process.exit(1); }
  for (const [p, m] of Object.entries(app.modules)) writeFileSync(path.join(dir, path.basename(p) + ".mjs"), m.code.replace(/from "(\.\/[^"]+\.rx)"/g, `from "$1.mjs"`).replace(/from "\.\/([^"]+\.js)"/g, `from "${js}$1"`));
}
writeFileSync(path.join(ws, "client/entry.mjs"), `import main from "./main.rx.mjs";\nimport { createApp } from "@reactivescript/runtime";\nconst app = createApp({ root: document.getElementById("app") });\napp.mount(main(app), true);\nwindow.__hydrated = true;\n`);
const req = createRequire(path.join(repo, "ref/package.json"));
const { buildSync } = req("esbuild");
const client = buildSync({ entryPoints: [path.join(ws, "client/entry.mjs")], bundle: true, write: false, format: "esm", platform: "browser", conditions: ["browser", "development"], logLevel: "silent", tsconfigRaw: "{}", nodePaths: [path.join(ws, "node_modules")] }).outputFiles[0].text;
const { createApp, generateHydrationScript } = await import(pathToFileURL(path.join(ws, "node_modules/@reactivescript/runtime/dist/server.js")).href);
const main = (await import(pathToFileURL(path.join(ws, "main.rx.mjs")).href)).default;

const server = createServer((rq, res) => {
  if (rq.url === "/client.js") { res.writeHead(200, { "content-type": "text/javascript" }); return res.end(client); }
  res.writeHead(200, { "content-type": "text/html" });
  res.write(`<!doctype html><html><head>${generateHydrationScript()}</head><body><div id="app">`);
  const app = createApp({ request: new Request("http://localhost" + rq.url) });   // SV-4: one app per request, for its URL
  let first = true;
  app.stream(main(app), { write: s => { res.write(s); if (first) { first = false; res.write(`</div><script type="module" src="/client.js"></script>`); } }, end: () => res.end("</body></html>") });
});
await new Promise(r => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await createRequire(import.meta.url)("playwright").chromium.launch();
const page = await browser.newPage();
const problems = []; page.on("console", m => { if (m.type() === "error" || m.type() === "warning") problems.push(m.text().slice(0, 200)); }); page.on("pageerror", e => problems.push(String(e).slice(0, 200)));
const text = () => page.evaluate(() => document.getElementById("app").innerText.replace(/\s+/g, " ").trim());
let pass = 0, fail = 0;
const check = (name, ok, got) => { ok ? pass++ : fail++; console.log(`${ok ? "  ✓" : "  ✗"} ${name}${ok ? "" : `\n      ${JSON.stringify(got)}`}`); };
async function open(url) { problems.length = 0; await page.goto(base + url); await page.waitForFunction(() => window.__hydrated, null, { timeout: 10000 }); await page.waitForTimeout(600); }
const nav = "Home Ann Bo Nobody";
for (const [url, want] of [["/", "People Meet Bo"], ["/people/1", "Ann engineer, #1"], ["/people/2", "Bo designer, #2"]]) {
  await open(url); const got = await text();
  check(`${url}: served for its URL and hydrated`, got === `${nav} ${want}` && !problems.length, { got, problems });
}
await open("/people/9");
check("/people/9: the route's NotFound crosses as itself, to its typed boundary (SV-5a)", (await page.evaluate(() => document.querySelector("p.missing")?.textContent)) === "no person 9" && !problems.length, { got: await text(), problems });
await page.evaluate(() => { window.__sameDocument = true; });
await page.click("a[href='/people/2']"); await page.waitForTimeout(700);
check("a link navigates on the hydrated page, in the same document", (await text()) === `${nav} Bo designer, #2` && (await page.evaluate(() => window.__sameDocument === true)) && new URL(page.url()).pathname === "/people/2", { got: await text(), url: page.url() });
await browser.close(); server.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
