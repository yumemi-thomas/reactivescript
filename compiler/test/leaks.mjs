// What unmounted is collected (11 CP-4c: an app keeps no table of its bindings): a page opens and closes a part many
// times, and each value and element the part made, held through a WeakRef, is gone after a collection — for a component,
// a `for` row, an `if` branch, an instantiation, an effect, a context, an action, a question, a store, a package's
// component rendered by a JavaScript host. On the server, an app and what it made are gone once its stream has ended.
// Needs what bench/run.mjs needs (the crate, the runtime's build, bench/.out/ws).   node compiler/test/leaks.mjs
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { ws, repo, workspace } from "../../bench/harness.mjs";
import { bundle } from "../../scripts/lib/bundle.mjs";

workspace();
const dir = path.join(ws, "leaks"); rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true });
const rxc = process.env.RXC ?? path.join(repo, `compiler/target/${process.env.RX_PROFILE ?? "release"}/rxc`);
const req = createRequire(path.join(ws, "package.json"));
writeFileSync(path.join(dir, "lib.d.rx"), `export pure fn make(kind: string): { text: string }\nexport fn keep(kind: string, x: any): void\nexport pure fn ask(kind: string): Promise<{ text: string }>\n`);
writeFileSync(path.join(dir, "lib.js"), `const made = globalThis.made ??= {};
export const keep = (kind, x) => { (made[kind] ??= []).push(new WeakRef(x)); };
export const make = kind => { const o = { text: kind, big: new Array(1000).fill(0) }; keep(kind, o); return o; };
export const ask = kind => Promise.resolve().then(() => make(kind));
`);
const part = `import { make, keep, ask } from "./lib.js"
context theme: { text: string }
fn useMade(ref on: boolean) {
  inside = on ? make("instantiation") : make("instantiation off")
  inside
}
component Leaf() {
  t = use theme
  <i>{t.text}</i>
}
component Shows(props: { rows: any[]; cell: (s: { row: any }) => View; children?: View | ((s: { on: boolean }) => View) }) {
  source lit := false
  <div onClick={() => { lit := !lit }}>{for r in props.rows { <props.cell row={r} /> }}<props.children on={lit} /></div>
}
export component Part() {
  x = make("component")
  source s := make("source")
  source list := [make("store")]
  q = await ask("question") catch (e) => ({ text: "failed" })
  source on := true
  u = useMade(on)
  rows = [make("row value"), make("row value")]
  provide theme = make("context")
  effect (s) { keep("effect input", $0) }
  action save() { let m = make("action"); list := [m]; keep("action local", m) }
  <section ref={(e: Element) => { keep("element", e) }} onClick={() => { save() }}>
    {x.text} {s.text} {list.length} {u.text}
    {for r in rows { y = make("row"); <b ref={(e: Element) => { keep("row element", e) }}>{r.text}{y.text}</b> }}
    {if on { z = make("branch"); <p>{z.text}</p> }}
    {loading fallback { <p>wait</p> } { <p>{q.text}</p> }}
    <Leaf />
    <Shows rows={rows}>
      {view cell (s) { c = make("named view"); <b ref={(e: Element) => { keep("named view element", e) }}>{s.row.text}{c.text}</b> }}
      {view (s) { v = make("view"); source held := make("view source"); <b ref={(e: Element) => { keep("view element", e) }}>{v.text}{held.text}{s.on ? "on" : "off"}</b> }}
    </Shows>
    <Shows rows={[]}>{view cell () { <i /> }}{(use theme).text}</Shows>
  </section>
}
`;
writeFileSync(path.join(dir, "part.rx"), part);
writeFileSync(path.join(dir, "main.rx"), `import { make } from "./lib.js"
import { Part } from "./part.rx"
context kind: { text: string }
export default component App() {
  source open := false
  <button id="t" onClick={() => { open := !open }}>t</button>
  {if open { provide kind = make("branch context"); <Part /> }}
}
`);
const compile = target => {
  const app = JSON.parse(execFileSync(rxc, ["app", path.join(dir, "main.rx"), "--target", target], { encoding: "utf8", maxBuffer: 1 << 26 }));
  if (!app.modules) { console.error(JSON.stringify(app).slice(0, 2000)); process.exit(1); }
  for (const [p, m] of Object.entries(app.modules)) writeFileSync(path.join(dir, `${path.basename(p)}.${target}.mjs`), m.code.replace(/from "(\.\/[^"]+\.rx)"/g, `from "$1.${target}.mjs"`));
};
compile("dom"); compile("ssr");
let fail = 0; const check = (name, ok, got) => { if (!ok) fail++; console.log(`${ok ? "✓" : "✗"} ${name}${ok ? "" : `\n    ${JSON.stringify(got)}`}`); };
const N = 20, KINDS = 19;
const alive = ([what, made]) => {
  // the last part mounted may be held by the engine's own caches (an event's target): one is not a leak, N are
  const kinds = Object.entries(made).filter(([, [of]]) => of >= N), kept = kinds.filter(([, [, left]]) => left > 2);
  check(`${what}: ${N} mounted and unmounted, ${kinds.length} kinds of value made, all collected`, kinds.length >= KINDS && !kept.length, { kinds: kinds.map(([k]) => k), kept });
};

const count = () => Object.fromEntries(Object.entries(globalThis.made).map(([k, rs]) => [k, [rs.length, rs.filter(r => r.deref()).length]]));
const pages = [
  ["an app", "production", `import main from "./main.rx.dom.mjs"; import { createApp } from "@reactivescript/runtime"; const app = createApp({ root: document.getElementById("app") }); app.mount(main(app));`],
  ["an app, Solid's development build", "development", `import main from "./main.rx.dom.mjs"; import { createApp } from "@reactivescript/runtime"; const app = createApp({ root: document.getElementById("app") }); app.mount(main(app));`],
  ["a package's component in a JavaScript host", "production", `import part from "./part.rx.dom.mjs"; import { library } from "@reactivescript/runtime"; import { createSignal, createComponent, Show } from "solid-js"; import { render } from "@solidjs/web";
const { Part } = library(part, "kit/part"); const [open, setOpen] = createSignal(false); const t = document.createElement("button"); t.id = "t"; t.onclick = () => setOpen(o => !o); document.body.append(t);
render(() => createComponent(Show, { get when() { return open(); }, get children() { return createComponent(Part, {}); } }), document.getElementById("app"));`],
];
const browser = await req("playwright").chromium.launch();
for (const [what, mode, contents] of pages) {
  const r = await bundle(ws, { code: contents, dir, conditions: ["browser", mode] });
  const page = await browser.newPage(); const errors = []; page.on("pageerror", e => errors.push(e.message));
  await page.setContent(`<div id="app"></div>`); await page.addScriptTag({ type: "module", content: r });
  await page.evaluate(async n => {
    const turn = () => new Promise(r => setTimeout(r, 5));
    for (let i = 0; i < n; i++) { document.getElementById("t").click(); await turn(); document.querySelector("section").click(); await turn(); document.getElementById("t").click(); await turn(); }
  }, N);
  const cdp = await page.context().newCDPSession(page);
  for (let i = 0; i < 5; i++) { await cdp.send("HeapProfiler.collectGarbage"); await page.waitForTimeout(30); }
  if (errors.length) check(what, false, errors); else alive([what, await page.evaluate(count)]);
  await page.close();
}
// SF-2b: a server fn asked in reactive scope is one request per arguments while it stands, and no longer
{
  const r = await bundle(ws, { dir, conditions: ["browser", "production"], code: `import { createApp } from "@reactivescript/runtime"; import { createRoot, createSignal, createMemo, createEffect, flush } from "solid-js";
const app = createApp({ root: null }); let asked = 0; const load = app.serverRef("load", async n => { asked++; return "r" + n; });
window.run = async () => createRoot(async dispose => { const [n, set] = createSignal(0); const a = createMemo(() => load(n())), b = createMemo(() => load(n())); createEffect(() => [a(), b()], () => {});
  for (let i = 1; i <= 20; i++) { set(i); flush(); await new Promise(r => setTimeout(r, 5)); } const during = app.flights.size; dispose(); await new Promise(r => setTimeout(r, 5)); return [asked, during, app.flights.size]; });` });
  const page = await browser.newPage(); await page.setContent(""); await page.addScriptTag({ type: "module", content: r });
  const got = await page.evaluate(() => window.run());
  check("a server fn's answers: one request per arguments, kept while one asks", got[0] === 21 && got[1] === 1 && got[2] === 0, got);
}
await browser.close();

writeFileSync(path.join(dir, "server.mjs"), `import main from "./open.rx.ssr.mjs"; import { createApp } from "@reactivescript/runtime";
const apps = []; let html = "";
for (let i = 0; i < ${N}; i++) { const app = createApp({ request: new Request("http://x/") }); apps.push(new WeakRef(app)); html = ""; await new Promise(end => app.stream(main(app), { write: s => { html += s; }, end })); }
for (let i = 0; i < 5; i++) { await new Promise(r => setTimeout(r, 10)); gc(); }
globalThis.made.app = apps;
console.log(JSON.stringify([html, Object.fromEntries(Object.entries(globalThis.made).map(([k, rs]) => [k, [rs.length, rs.filter(r => r.deref()).length]]))]));
`);
writeFileSync(path.join(dir, "open.rx"), `import { Part } from "./part.rx"\nexport default component App() {\n  <Part />\n}\n`);
{
  const app = JSON.parse(execFileSync(rxc, ["app", path.join(dir, "open.rx"), "--target", "ssr"], { encoding: "utf8", maxBuffer: 1 << 26 }));
  for (const [p, m] of Object.entries(app.modules)) writeFileSync(path.join(dir, `${path.basename(p)}.ssr.mjs`), m.code.replace(/from "(\.\/[^"]+\.rx)"/g, `from "$1.ssr.mjs"`));
  const r = spawnSync(process.execPath, ["--expose-gc", "server.mjs"], { cwd: dir, encoding: "utf8", timeout: 60000 });
  const [html, made] = r.status === 0 ? JSON.parse(r.stdout.trim().split("\n").pop()) : ["", {}];
  const kinds = Object.entries(made), kept = kinds.filter(([, [, left]]) => left > 2);
  check(`the server: ${N} requests, ${kinds.length} kinds of value made, all collected`, /question/.test(html) && kinds.length >= 9 && !kept.length, { err: r.stderr.slice(-800), kinds, kept });
}
console.log(fail ? `${fail} failed` : "ok");
process.exit(fail ? 1 : 0);
