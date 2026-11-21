// R-f-5, MO-10f (RFC 06, ruled 2026-11-22): a JS fn's result whose fields hold or fail is read a field at a time, by a
// path the checker sees. So a program it accepts cannot read the failing `data` where no boundary is — and that is what
// this runs, on the server (Node), with a query whose `data` throws:
//  - accepted programs render: what reads only `isFetching` reads no `data` (the result is the library's own object, read by its fields), directly,
//    through another name, through a field passed to a component, in a handler a component is given;
//  - a read of `data` under an `errored` region is caught by it, on the server too, wherever the field went (a prop):
//    the fallback is what is rendered (with the message the server lets out, SV-5);
//  - the programs that used to be accepted and crash the server render — the result handed to a closure a component
//    calls, provided, exported to another module, written to a source — are refused (`RESULT_AS_VALUE`), and each is
//    shown crashing when the same thing is done in JS, where no check looks.
// Needs the crate's Node-API build (`npm run build` in compiler/), the runtime's build (runtime/dist) and
// ref/node_modules (Solid).   node compiler/test/ssr-held.mjs
import { createRequire } from "node:module";
import { mkdirSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "../..");
const { app } = createRequire(import.meta.url)("../index.js");
const ws = path.join(here, ".out/ssr-held"); rmSync(ws, { recursive: true, force: true });
mkdirSync(path.join(ws, "node_modules/@reactivescript"), { recursive: true });
for (const d of readdirSync(path.join(repo, "ref/node_modules")).filter(f => !f.startsWith("."))) symlinkSync(path.join(repo, "ref/node_modules", d), path.join(ws, "node_modules", d), "dir");
symlinkSync(path.join(repo, "runtime"), path.join(ws, "node_modules/@reactivescript/runtime"), "dir");
writeFileSync(path.join(ws, "package.json"), JSON.stringify({ type: "module" }));
writeFileSync(path.join(ws, "lib.d.rx"), [
  "export pure fn useQ(): { data: pending fails(Error) any; isFetching: boolean }",
  "export fn note(x: any): void",
  "",
].join("\n"));
writeFileSync(path.join(ws, "lib.js"), [
  'export const useQ = () => ({ get data() { throw new Error("query failed"); }, get isFetching() { return false; } });',
  "export const note = () => {};",
  "",
].join("\n"));
const head = 'import { useQ, note } from "./lib.js"\n';
const page = body => `${head}export default component App() {\n  orig = useQ()\n${body}\n}\n`;
const accepted = {
  "a field that neither holds nor fails": [page('  <small>{orig.isFetching ? "refreshing" : "idle"}</small>'), /idle/],
  "through another name": [page('  q = orig\n  <small>{q.isFetching ? "refreshing" : "idle"}</small>'), /idle/],
  "compared, and tested": [page('  <small>{orig == null ? "none" : "idle"} {orig && orig.isFetching ? "refreshing" : "still"}</small>'), /idle still/],
  "the field passed to a component": [`${head}component Kid(props: { busy: boolean }) {\n  <small>{props.busy ? "refreshing" : "idle"}</small>\n}\nexport default component App() {\n  orig = useQ()\n  <Kid busy={orig.isFetching} />\n}\n`, /idle/],
  "a handler a component is given, reading a field": [`${head}component Btn(props: { onPress: () => void }) {\n  <button onClick={() => { props.onPress() }}>idle</button>\n}\nexport default component App() {\n  source n := 0\n  orig = useQ()\n  <Btn onPress={() => { n := orig.isFetching ? 1 : 2 }} />\n}\n`, /idle/],
  "data under an errored region: caught on the server": [page('  {errored fallback(e) { <p>failed: {e.message}</p> } { <p>{orig.data}</p> }}'), /<p>failed: [^<]+<\/p>/],
  "data passed to a component, read under its errored region": [`${head}component Kid(props: { data: any }) {\n  {errored fallback(e) { <p>failed: {e.message}</p> } { <p>{props.data}</p> }}\n}\nexport default component App() {\n  orig = useQ()\n  <Kid data={orig.data} />\n}\n`, /<p>failed: [^<]+<\/p>/],
  "data passed to a component, under an errored region above it": [`${head}component Kid(props: { data: any }) {\n  <p>{props.data}</p>\n}\nexport default component App() {\n  orig = useQ()\n  {errored fallback(e) { <p>failed: {e.message}</p> } { <Kid data={orig.data} /> }}\n}\n`, /<p>failed: [^<]+<\/p>/],
};
// each was accepted before the ruling, and read `data` where nothing catches it
const refused = {
  "the result returned by a closure a component calls": `${head}component Kid(props: { get: () => any }) {\n  <p>{props.get().data ? "r" : "idle"}</p>\n}\nexport default component App() {\n  orig = useQ()\n  <Kid get={() => orig} />\n}\n`,
  "the result provided": `${head}context qctx: any\ncomponent Ctx() {\n  q = use qctx\n  <p>{q.data ? "r" : "idle"}</p>\n}\nexport default component App() {\n  orig = useQ()\n  provide qctx = orig\n  <Ctx />\n}\n`,
  "the result written to a source from a handler": `${head}export default component App() {\n  source saved: any := null\n  orig = useQ()\n  <p>{saved == null ? "idle" : saved.data}</p><button onClick={() => { saved := orig }}>x</button>\n}\n`,
  "the result held in a record": page('  box = { q: orig }\n  <small>{box.q.isFetching ? "refreshing" : "idle"}</small>'),
  "the result passed to a JS fn": page('  <button onClick={() => { note(orig) }}>x</button>'),
  "a read of data with no errored region (R-f-5, as before)": [page('  <p>{orig.data}</p>'), "UNHANDLED_FAILURE"],
};
const modules = {
  "the result exported, read by another module": ['import { useQ } from "./lib.js"\nexport q = useQ()\n', 'import { q } from "./mod.rx"\nexport default component App() {\n  <p>{q.data ? "r" : "idle"}</p>\n}\n'],
  "a fn exported that gives the result": ['import { useQ } from "./lib.js"\nq = useQ()\nexport fn getQ() { q }\n', 'import { getQ } from "./mod.rx"\nexport default component App() {\n  <p>{getQ().data ? "r" : "idle"}</p>\n}\n'],
};
const { createApp } = await import(pathToFileURL(path.join(ws, "node_modules/@reactivescript/runtime/dist/server.js")).href);
let pass = 0, fail = 0, seq = 0;
const check = (name, ok, detail) => { if (ok) pass++; else fail++; console.log(`${ok ? "✓" : "✗"} ${name}${ok ? "" : `\n  ${String(detail).slice(0, 700)}`}`); };
const stream = async (main) => {
  let html = "", threw = null;
  const a = createApp({ request: new Request("http://x/") });
  try { await new Promise((res, rej) => { try { a.stream(main(a), { write: c => { html += c; }, end: res }); } catch (e) { rej(e); } setTimeout(res, 1500); }); } catch (e) { threw = e; }
  return { html: html.replace(/<!--.*?-->/g, ""), threw };
};
for (const [name, [src, want]] of Object.entries(accepted)) {
  const file = path.join(ws, `a${++seq}.rx`); writeFileSync(file, src);
  const out = JSON.parse(app(file, "ssr"));
  if (out.diagnostics || out.error) { check(`accepted: ${name}`, false, JSON.stringify(out)); continue; }
  const js = path.join(ws, `a${seq}.gen.mjs`); writeFileSync(js, Object.values(out.modules)[0].code);
  const { html, threw } = await stream((await import(pathToFileURL(js).href)).default);
  check(`accepted, and the server renders it: ${name} (${JSON.stringify(html.slice(0, 70))})`, !threw && want.test(html), threw?.message ?? html);
}
for (const [name, v] of Object.entries(refused)) {
  const [src, code] = Array.isArray(v) ? v : [v, "RESULT_AS_VALUE"];
  const file = path.join(ws, `r${++seq}.rx`); writeFileSync(file, src);
  const out = JSON.parse(app(file, "ssr"));
  check(`refused (${code}): ${name}`, (out.diagnostics ?? []).some(d => d.code === code), JSON.stringify(out).slice(0, 400));
}
for (const [name, [mod, main]] of Object.entries(modules)) {
  const dir = path.join(ws, `m${++seq}`); mkdirSync(dir);
  for (const f of ["lib.js", "lib.d.rx"]) symlinkSync(path.join(ws, f), path.join(dir, f));
  writeFileSync(path.join(dir, "mod.rx"), mod); writeFileSync(path.join(dir, "main.rx"), main);
  const out = JSON.parse(app(path.join(dir, "main.rx"), "ssr"));
  check(`refused (RESULT_AS_VALUE): ${name}`, (out.diagnostics ?? []).some(d => d.code === "RESULT_AS_VALUE" && /mod\.rx$/.test(d.file ?? "")), JSON.stringify(out).slice(0, 400));
}
// what the refusals are for: the same reads, done where no check looks, end the server's render
{
  const q = { get data() { throw new Error("query failed"); }, get isFetching() { return false; } };
  let threw = null; try { const get = () => q; void (get().data ? "r" : "idle"); } catch (e) { threw = e; }
  check("unchecked, the read throws where it is read (what a refused program would do under no boundary)", threw?.message === "query failed", threw);
}
rmSync(ws, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
