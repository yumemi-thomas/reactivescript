// A row of a keyed list keeps its region where its key is kept (06 ST-4a), in the browser, in a development and in a
// production build, rendered there and taken over from the server: the state of a row (a source in its region) is still
// the row's after the list is written fresh rows, whether the row's body reads the row or not, and whether the list
// reaches the loop directly or through a prop. Solid's `reconcile(v, key)` gave a row whose fields nothing read a new
// proxy, and `<For>` remade it (X1 of the roadmap: silent in production); compile/keyed.ts keeps it.
// Needs what bench/run.mjs needs (the crate, the runtime's build, bench/.out/ws).   node compiler/test/rows.mjs
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { ws, repo, workspace } from "../../bench/harness.mjs";
import { bundle } from "../../scripts/lib/bundle.mjs";

workspace();
const dir = path.join(ws, "rows"); rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true });
const rxc = process.env.RXC ?? path.join(repo, `compiler/target/${process.env.RX_PROFILE ?? "release"}/rxc`), req = createRequire(path.join(ws, "package.json"));
const T = "{ id: string; v: string }";
// each part: a list of two rows (a, b) whose rows each hold a count; `.w` writes the list, `.u` writes it by an updater
writeFileSync(path.join(dir, "rows.rx"), `component Count(q: { v: string }) {
  source c := 0
  <button class="inc" onClick={() => { c := c + 1 }}>{q.v}{c}</button>
}
component Plain() {
  source c := 0
  <button class="inc" onClick={() => { c := c + 1 }}>{c}</button>
}
component L(p: { rows: ${T}[] }) {
  <ol>{for r in p.rows { <li><Plain /></li> }}</ol>
}
component LR(p: { rows: ${T}[] }) {
  <ol>{for r in p.rows { <li><Count v={r.v} /></li> }}</ol>
}
export component Direct() {
  source rows: ${T}[] key id := [{ id: "a", v: "a" }, { id: "b", v: "b" }]
  <button class="w" onClick={() => { rows := [{ id: "b", v: "B" }, { id: "c", v: "c" }] }}>w</button>
  <button class="u" onClick={() => { rows := rs => [{ id: "c", v: "c" }, { id: "b", v: "B" }] }}>u</button>
  <ol>{for r in rows { <li><Plain /></li> }}</ol>
}
export component Prop() {
  source rows: ${T}[] key id := [{ id: "a", v: "a" }, { id: "b", v: "b" }]
  <button class="w" onClick={() => { rows := [{ id: "b", v: "B" }, { id: "c", v: "c" }] }}>w</button>
  <button class="u" onClick={() => { rows := rs => [{ id: "c", v: "c" }, { id: "b", v: "B" }] }}>u</button>
  <L rows={rows} />
}
export component Read() {
  source rows: ${T}[] key id := [{ id: "a", v: "a" }, { id: "b", v: "b" }]
  <button class="w" onClick={() => { rows := [{ id: "b", v: "B" }, { id: "c", v: "c" }] }}>w</button>
  <button class="u" onClick={() => { rows := rs => [{ id: "c", v: "c" }, { id: "b", v: "B" }] }}>u</button>
  <LR rows={rows} />
}
`);
for (const target of ["dom", "ssr"]) {
  const app = JSON.parse(execFileSync(rxc, ["app", path.join(dir, "rows.rx"), "--lib", "--target", target], { encoding: "utf8", maxBuffer: 1 << 26 }));
  if (!app.modules) { console.error(JSON.stringify(app).slice(0, 2000)); process.exit(1); }
  for (const m of Object.values(app.modules)) writeFileSync(path.join(dir, `rows.${target}.mjs`), m.code);
}
let fail = 0; const check = (name, ok, got) => { if (!ok) fail++; console.log(`${ok ? "✓" : "✗"} ${name}${ok ? "" : `\n    ${JSON.stringify(got)}`}`); };
const PARTS = ["Direct", "Prop", "Read"];
// what each part shows: the rows' counts; the second row (b) is counted once, then the list is written
const want = { Direct: ["0,0", "0,1", "1,0", "0,1"], Prop: ["0,0", "0,1", "1,0", "0,1"], Read: ["a0,b0", "a0,b1", "B1,c0", "c0,B1"] };
writeFileSync(path.join(dir, "server.mjs"), `import kit from "./rows.ssr.mjs"; import { library } from "@reactivescript/runtime"; import { createComponent } from "solid-js"; import { renderToString, generateHydrationScript } from "@solidjs/web";
const lib = library(kit, "kit/rows"); console.log(JSON.stringify([generateHydrationScript(), ${JSON.stringify(PARTS)}.map(C => renderToString(() => createComponent(lib[C], {})))]));`);
const out = spawnSync(process.execPath, ["server.mjs"], { cwd: dir, encoding: "utf8", timeout: 60000 });
const [script, html] = out.status === 0 ? JSON.parse(out.stdout.trim().split("\n").pop()) : ["", []];
check("the rows, on the server", html.length === PARTS.length, out.stderr.slice(-600));
const browser = await req("playwright").chromium.launch();
try {
  for (const mode of ["development", "production"]) for (const how of ["render", "hydrate"]) for (const [i, C] of PARTS.entries()) {
    const code = await bundle(ws, { dir, conditions: ["browser", mode], code: `import kit from "./rows.dom.mjs"; import { library } from "@reactivescript/runtime"; import { createComponent, flush } from "solid-js"; import { render, hydrate } from "@solidjs/web";
const at = document.getElementById("app"), lib = library(kit, "kit/rows"); ${how}(() => createComponent(lib[${JSON.stringify(C)}], {}), at); flush();
const counts = () => [...at.querySelectorAll(".inc")].map(b => b.textContent).join(","), seen = [counts()];
at.querySelectorAll(".inc")[1].click(); flush(); seen.push(counts());
at.querySelector(".w").click(); flush(); seen.push(counts());
at.querySelector(".u").click(); flush(); seen.push(counts());
window.seen = seen;` });
    const page = await browser.newPage(); const said = [];
    page.on("console", m => { if (m.type() !== "log") said.push(m.text().split("\n")[0]); }); page.on("pageerror", e => said.push(e.message));
    await page.setContent(`<head>${script}</head><body><div id="app">${how === "hydrate" ? html[i] ?? "" : ""}</div></body>`);
    await page.addScriptTag({ type: "module", content: code }); await page.waitForTimeout(100);
    const got = await page.evaluate(() => window.seen);
    check(`a kept keyed row keeps its state (ST-4a): ${C}, ${how}, ${mode}`, JSON.stringify(got) === JSON.stringify(want[C]) && !said.length, [got, want[C], said]);
    await page.close();
  }
} finally { await browser.close(); }
console.log(fail ? `${fail} failed` : "ok");
process.exit(fail ? 1 : 0);
