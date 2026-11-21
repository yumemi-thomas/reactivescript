// R-f-5, MO-10f (RFC 06, revised 2026-11-21 after review): a JS fn's record result is compiled as a value whose fields are
// read where they are read (`__rt.lazy`), so a program the checker accepts because it reads only `isFetching` does not
// read the failing `data` when it renders — directly, through an alias, or through a record holding the result. Streams
// each on the server (Node), with a query whose `data` throws. Needs the crate's Node-API build (`npm run build` in
// compiler/), the runtime's build (runtime/dist) and ref/node_modules (Solid).   node compiler/test/ssr-held.mjs
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
writeFileSync(path.join(ws, "lib.d.rx"), "export pure fn useQ(): { data: pending fails(Error) any; isFetching: boolean }\n");
writeFileSync(path.join(ws, "lib.js"), 'export const useQ = () => ({ get data() { throw new Error("query failed"); }, get isFetching() { return false; } });\n');
const programs = {
  direct: "  <small>{orig.isFetching ? \"refreshing\" : \"idle\"}</small>",
  alias: "  q = orig\n  <small>{q.isFetching ? \"refreshing\" : \"idle\"}</small>",
  record: "  box = { q: orig }\n  <small>{box.q.isFetching ? \"refreshing\" : \"idle\"}</small>",
};
const { createApp } = await import(pathToFileURL(path.join(ws, "node_modules/@reactivescript/runtime/dist/server.js")).href);
let pass = 0, fail = 0;
const check = (name, ok, detail) => { if (ok) pass++; else fail++; console.log(`${ok ? "✓" : "✗"} ${name}${ok ? "" : `\n  ${String(detail).slice(0, 600)}`}`); };
for (const [name, body] of Object.entries(programs)) {
  const file = path.join(ws, `${name}.rx`);
  writeFileSync(file, `import { useQ } from "./lib.js"\nexport default component App() {\n  orig = useQ()\n${body}\n}\n`);
  const out = JSON.parse(app(file, "ssr"));
  if (out.diagnostics || out.error) { check(`${name}: the checker accepts it`, false, JSON.stringify(out)); continue; }
  const js = path.join(ws, `${name}.gen.mjs`); writeFileSync(js, Object.values(out.modules)[0].code);
  const main = (await import(pathToFileURL(js).href)).default;
  let html = "", threw = null;
  const a = createApp({ request: new Request("http://x/") });
  try { await new Promise((res, rej) => { try { a.stream(main(a), { write: c => { html += c; }, end: res }); } catch (e) { rej(e); } setTimeout(res, 1500); }); } catch (e) { threw = e; }
  check(`${name}: accepted, and it renders without reading data (${JSON.stringify(html.replace(/<!--.*?-->/g, "").slice(0, 60))})`, !threw && /idle/.test(html), threw?.message ?? html);
}
rmSync(ws, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
