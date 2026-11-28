// RXC=… RUNTIME=… node run.mjs: what eager2.rx shows, compiled; and the leak program, in real Chromium.
import { chromium } from "playwright"; import esbuild from "esbuild"; import { execFileSync } from "node:child_process"; import { writeFileSync, mkdirSync } from "node:fs"; import path from "node:path";
const here = path.dirname(new URL(import.meta.url).pathname), repo = path.resolve(here, "../../..");
const rxc = process.env.RXC ?? path.join(repo, "compiler/target/release/rxc"), runtime = process.env.RUNTIME ?? path.join(repo, "runtime/dist");
mkdirSync(here + "/.out", { recursive: true });
const b = await chromium.launch();
for (const name of ["eager2", "leak"]) {
  const out = JSON.parse(execFileSync(rxc, ["app", `${here}/${name}.rx`, "--target", "dom", "--spa"], { encoding: "utf8" })); if (!out.modules) { console.log(name, JSON.stringify(out).slice(0, 300)); continue; }
  writeFileSync(`${here}/.out/${name}.mjs`, Object.values(out.modules)[0].code.replaceAll("./make.js", "../make.js"));
  const r = await esbuild.build({ tsconfigRaw: {}, stdin: { contents: `import main from "./.out/${name}.mjs"; import { createApp } from "${runtime}/web.js"; const app = createApp({ root: document.getElementById("app") }); app.mount(main(app));`, resolveDir: here }, bundle: true, write: false, format: "esm", conditions: ["browser", "production"], logLevel: "error", plugins: [{ name: "one-solid", setup(x) { x.onResolve({ filter: /^(solid-js|@solidjs\/(web|signals))$/ }, async (a) => a.pluginData ? undefined : x.resolve(a.path, { resolveDir: here, kind: "import-statement", pluginData: true })); } }] });
  const p = await b.newPage(); p.on("pageerror", (e) => console.log(name, e.message)); await p.setContent('<div id="app"></div>'); await p.addScriptTag({ type: "module", content: r.outputFiles[0].text }); await p.waitForTimeout(200);
  if (name === "eager2") console.log("eager2:", await p.evaluate(() => document.getElementById("app").innerText.replace(/\n/g, " | ")));
  else { const cdp = await p.context().newCDPSession(p);
    await p.evaluate(async () => { for (let i = 0; i < 100; i++) { for (const _ of [0, 1]) { document.getElementById("t").click(); await new Promise((r) => setTimeout(r)); } } });
    for (let i = 0; i < 4; i++) { await cdp.send("HeapProfiler.collectGarbage"); await p.waitForTimeout(50); }
    console.log("leak: alive", await p.evaluate(() => window.refs.filter((r) => r.deref()).length), "of 100 unmounted rows’ values"); }
}
await b.close();
