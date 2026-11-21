// The Node-API build loads on this platform and compiles a program for every target: what CI checks on each binary
// before it is published. Usage: node test/node.mjs (after `npm run build`)
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";

const { app } = createRequire(import.meta.url)("../index.js");
const examples = fileURLToPath(new URL("../../examples/", import.meta.url));
let fail = 0;
// the last: a client-only build (08 CN-3d), as the Vite front end asks for one
for (const [entry, target, spa] of [["todo.rx", "dom"], ["todo.rx", "ssr"], ["shop/main.rx", "universal"], ["shop/main.rx", "dom", true]]) {
  const out = JSON.parse(app(path.join(examples, entry), target, null, spa));
  const modules = Object.keys(out.modules ?? {});
  const ok = modules.length > 0 && !out.error && !out.diagnostics;
  if (!ok) fail++;
  console.log(`${ok ? "✓" : "✗"} ${entry} (${target}${spa ? ", client-only" : ""}): ${ok ? `${modules.length} modules` : JSON.stringify(out).slice(0, 300)}`);
}
const bad = JSON.parse(app(path.join(examples, "missing.rx")));
if (!bad.error) { fail++; console.log("✗ a missing entry is not an error"); } else console.log("✓ a missing entry is an error");
// a relative JS import is the app's own file (MO-8): it stays an ES import, no package.json `#imports` needed; `./api`
// stays the injected API (CP-4)
const dir = mkdtempSync(path.join(tmpdir(), "rx-import-"));
writeFileSync(path.join(dir, "util.js"), "export const greet = n => `hi ${n}`;\n");
writeFileSync(path.join(dir, "main.rx"), [
  'import pure { greet } from "./util.js"',
  'import { save } from "./api"',
  'export default component App() {',
  '  source n := 1',
  '  <p onClick={() => { save(n) }}>{greet(n)}</p>',
  '}',
].join("\n"));
const rel = JSON.parse(app(path.join(dir, "main.rx"), "dom", null, true));
const code = Object.values(rel.modules ?? {}).map(m => m.code).join("\n");
const relOk = !rel.error && !rel.diagnostics && /from "\.\/util\.js"/.test(code) && !/from "\.\/api"/.test(code);
if (!relOk) fail++;
console.log(`${relOk ? "✓" : "✗"} a relative JS import stays an ES import${relOk ? "" : `: ${JSON.stringify(rel).slice(0, 300)}`}`);
// W-6, MO-10i: a draft's updater evaluates its place once — the object, then the key — so a key with an effect is
// computed once, and the old value is read from the element the new one is written to; run here on a plain draft
writeFileSync(path.join(dir, "store.js"), "export const createStore = init => { const s = init; return [s, f => { f(s); }]; };\nlet i = 0;\nexport const next = () => i++;\n");
writeFileSync(path.join(dir, "store.d.rx"), "export pure fn createStore<T>(init: T): [T, (update: (draft state: T) => T | void) => void]\nexport fn next(): number\n");
writeFileSync(path.join(dir, "draft.rx"), [
  'import { createStore, next } from "./store.js"',
  'export default component App() {',
  '  [todos, setTodos] = createStore<{ items: number[] }>({ items: [10, 20, 30] })',
  '  <button onClick={() => { setTodos((d) => { d.items[next()] := v => v + 1 }) }}>bump</button>',
  '}',
].join("\n"));
const dr = JSON.parse(app(path.join(dir, "draft.rx"), "dom", null, true));
const dcode = Object.values(dr.modules ?? {}).map(m => m.code).join("\n");
const calls = (dcode.match(/next\(\)/g) ?? []).length;
const place = /const __o\$d = [^;]+\["items"\];\s*const __k\$d = [^;]*next\(\);\s*__o\$d\[__k\$d\] = \(/.test(dcode);
const dOk = !dr.error && !dr.diagnostics && calls === 1 && place;
if (!dOk) fail++;
console.log(`${dOk ? "✓" : "✗"} a draft updater's key is computed once (${calls} call${calls === 1 ? "" : "s"} of next)${dOk ? "" : `: ${(dr.error ?? JSON.stringify(dr.diagnostics) ?? dcode).slice(0, 900)}`}`);
// and the same statement, as JavaScript runs it: one element read and written
{
  const body = dcode.match(/\{\s*const __o\$d[\s\S]*?__o\$d\[__k\$d\]\);\s*\}/)?.[0];
  let calls2 = 0; const d = { items: [10, 20, 30] };
  const run = body && new Function("v$d", "next", body.replace(/\b[\w$]+\.next\(\)|\bv\$next\(\)|\bnext\(\)/g, "next()"));
  try { run?.(d, () => calls2++); } catch (e) { console.log(String(e)); }
  const ran = !!run && calls2 === 1 && JSON.stringify(d.items) === "[11,20,30]";
  if (!ran) fail++;
  console.log(`${ran ? "✓" : "✗"} ...run: one call, items ${JSON.stringify(d.items)}${ran ? "" : ` (${body ?? "no block"})`}`);
}
process.exit(fail ? 1 : 0);
