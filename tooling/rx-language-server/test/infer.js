// MO-8v: the words `rx-declare` reads from the code that runs (src/infer.js) — `pure`, `handler`, `draft`,
// `rejects(E)`. The suite is adversarial: each function of `bad` does one thing a word must not cover, as code hides
// it (a clock two calls down, a callback called on one branch, a store kept for a later call), and each must be
// refused its word, with a reason that names the thing; each function of `good` is its honest twin and must be given
// the word. Then the draft itself: the rows, their marks, the questions that are no longer asked, and both checkers
// reading it (rx-tsc over the crate; ref/'s declaration parser) with a program that is accepted only because of an
// inferred word and one refused because a word was withheld.
//   node test/infer.js            VERBOSE=1 prints the drafts
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const repo = path.resolve(__dirname, "../../..");
const ws = path.join(__dirname, "../.test/infer");
fs.rmSync(ws, { recursive: true, force: true });
fs.mkdirSync(path.join(ws, "node_modules/kit"), { recursive: true });
for (const d of fs.readdirSync(path.join(repo, "ref/node_modules"))) fs.symlinkSync(path.join(repo, "ref/node_modules", d), path.join(ws, "node_modules", d), "dir");

let pass = 0, fail = 0;
const ok = (name, cond, detail) => { if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}${detail !== undefined ? `\n      ${String(detail).slice(0, 900)}` : ""}`); } };

// ---- pure ----
const PURE_BAD = {
  // name: [code, what the reason must say]
  hiddenClock: ["const stamp = () => Date.now();\nconst tag = s => `${s}@${stamp()}`;\nexport function hiddenClock(s) { return tag(s).toUpperCase(); }", /clock/],
  newDate: ["export function newDate(s) { return new Date(s).getFullYear(); }", /Date/],
  mutatesArgument: ["export function mutatesArgument(list, x) { list.push(x); return list.length; }", /changes its argument `list`/],
  mutatesThroughAlias: ["export function mutatesThroughAlias(o) { const a = o.inner; a.count = 1; return a; }", /changes its argument `o`/],
  mutatesThroughCopy: ["export function mutatesThroughCopy(list) { const c = [...list]; c[0].done = true; return c; }", /change its argument `list`/],
  mutatesInCallback: ["export function mutatesInCallback(list) { list.forEach(x => { x.done = true; }); return list.length; }", /change its argument `list`/],
  assignsInto: ["export function assignsInto(o, p) { return Object.assign(o, p); }", /changes its argument `o`/],
  deletesFrom: ["export function deletesFrom(o) { delete o.k; return o; }", /changes its argument `o`/],
  globalWrite: ["export function globalWrite(n) { globalThis.count = n; return n; }", /globalThis/],
  moduleWrite: ["let calls = 0;\nexport function moduleWrite(n) { calls++; return n + calls; }", /calls/],
  moduleStateRead: ["let mode = \"a\";\nexport const setMode = m => { mode = m; };\nexport function moduleStateRead(s) { return s + mode; }", /assigned: state that changes/],
  writesModuleObject: ["const cache = {};\nexport function writesModuleObject(k, v) { cache[k] = v; return v; }", /cache/],
  readsMutatedConstant: ["const table = { a: { n: 1 } };\nexport const bump = () => { table.a.n++; };\nexport function readsMutatedConstant(k) { return table[k].n; }", /table.*written to|state that changes/],
  readsLeakedConstant: ["import { tweak } from \"kit\";\nconst table = { a: { n: 1 } };\nexport const leak = () => tweak(table);\nexport function readsLeakedConstant(k) { return table[k].n; }", /table/],
  computedCall: ["export function computedCall(o, name) { return o[name](); }", /computed member/],
  computedCallOfTable: ["const ops = { inc: n => n + 1 };\nexport function computedCallOfTable(name, n) { return ops[name](n); }", /computed member/],
  sortsInPlace: ["export function sortsInPlace(list) { return list.sort(); }", /changes its argument `list` in place \(\.sort\(\)\)/],
  reversesInPlace: ["export function reversesInPlace(list) { const r = list; return r.reverse(); }", /changes its argument `list`/],
  random: ["export function random(n) { return Math.floor(Math.random() * n); }", /randomness/],
  uuid: ["export function uuid() { return crypto.randomUUID(); }", /randomness|crypto/],
  getter: ["let reads = 0;\nconst settings = { get size() { reads++; return 4; } };\nexport function getter(n) { return n * settings.size; }", /settings/],
  valueOf: ["let asked = 0;\nconst unit = { valueOf() { asked++; return 2; } };\nexport function valueOf(n) { return n * unit; }", /unit/],
  evals: ["export function evals(src) { return eval(src); }", /eval/],
  functionCtor: ["export function functionCtor(src) { return new Function(src)(); }", /Function/],
  functionCall: ["export function functionCall(src) { return Function(src)(); }", /Function/],
  usesThis: ["export function usesThis(n) { return this.base + n; }", /`this`/],
  logs: ["export function logs(n) { console.log(n); return n; }", /console/],
  fetches: ["export async function fetches(id) { const r = await fetch(`/api/${id}`); return r.json(); }", /fetch/],
  storage: ["export function storage(k) { return localStorage.getItem(k); }", /localStorage/],
  locale: ["export function locale(n) { return n.toLocaleString(); }", /locale/],
  compares: ["export function compares(a, b) { return a.localeCompare(b); }", /locale/],
  unknownImport: ["import { mystery } from \"kit\";\nexport function unknownImport(n) { return mystery(n); }", /not read|mystery/],
  dynamicImport: ["export async function dynamicImport(n) { const m = await import(\"kit\"); return m.f(n); }", /import\(\)/],
  recursesThroughUnproven: ["const b = n => (n > 0 ? a(n - 1) : Date.now());\nconst a = n => b(n);\nexport function recursesThroughUnproven(n) { return a(n); }", /clock/],
  timerCallsBack: ["export function timerCallsBack(run) { setTimeout(run, 0); }", /calls back `run` later/],
  listens: ["export function listens(el, f) { el.addEventListener(\"click\", f); }", /registers with the platform/],
  statefulPattern: ["const re = /a/g;\nexport function statefulPattern(s) { return re.test(s); }", /re\b|pattern/],
  unknownMethod: ["export function unknownMethod(client) { return client.refetch(); }", /\.refetch/],
  viaApply: ["export function viaApply(f, args) { return f.apply(null, args); }", /\.apply/],
  environmentData: ["export function environmentData() { return typeof window === \"undefined\" ? \"server\" : \"browser\"; }", /answers data|environment/],
  environmentRead: ["export function environmentRead() { return navigator.language; }", /navigator/],
  generator: ["export function* generator(n) { yield n; }", /generator/],
  nestedWrite: ["let last;\nexport function nestedWrite(list) { const keep = x => { last = x; return x; }; return list.map(keep); }", /last/],
  freezesArgument: ["export function freezesArgument(o) { return Object.freeze(o); }", /freezes|changes/],
  asyncComputation: ["import { createMemo } from \"solid-js\";\nexport function asyncComputation(id) { return createMemo(async () => (await fetch(id())).json()); }", /starts work|fetch/],
  exportedObjectRead: ["export const config = { depth: { max: 3 } };\nexport function exportedObjectRead(n) { return n < config.depth.max; }", /exports: any importer may change it/],
  handsOutConstant: ["const rows = [{ n: 1 }];\nexport const first = () => rows[0];\nexport function handsOutConstant(i) { return rows[i].n; }", /handed back/],
};
const PURE_GOOD = {
  computes: "const HEX = \"0123456789abcdef\";\nexport function computes(n) { let s = \"\"; for (let i = n; i > 0; i = Math.floor(i / 16)) s = HEX[i % 16] + s; return s || \"0\"; }",
  copies: "export function copies(list, x) { const out = [...list]; out.push(x); out.sort(); return out; }",
  maps: "export function maps(rows, key) { return rows.filter(r => r[key] != null).map(r => ({ ...r, label: String(r[key]).trim().toUpperCase() })); }",
  builds: "export function builds(pairs) { const m = new Map(); for (const [k, v] of pairs) m.set(k, v); const o = {}; for (const [k, v] of m) o[k] = v; return o; }",
  json: "export function json(text) { try { return JSON.parse(text); } catch { return null; } }",
  viaHelpers: "const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));\nfunction pct(n) { return `${clamp(Math.round(n * 100), 0, 100)}%`; }\nexport const viaHelpers = n => pct(n);",
  recursion: "export function recursion(n) { return n <= 1 ? 1 : n * recursion(n - 1); }",
  mutualRecursion: "const even = n => (n === 0 ? true : odd(n - 1));\nconst odd = n => (n === 0 ? false : even(n - 1));\nexport const mutualRecursion = n => even(n);",
  constantTable: "const people = { 1: { name: \"Ann\" }, 2: { name: \"Bo\" } };\nexport function constantTable(id) { const p = people[id]; return p ? { ...p } : undefined; }",
  callsBack: "export function callsBack(list, by) { return list.map(x => by(x)); }",
  waits: "export async function waits(n) { await new Promise(r => setTimeout(r, 5)); return n * 2; }",
  closureState: "export function closureState(start) { let n = start; return { next: () => ++n, reset: () => { n = start; } }; }",
  primitive: "import { createSignal, createMemo, onCleanup } from \"solid-js\";\nexport function primitive(start) { const [n, setN] = createSignal(start); const double = createMemo(() => n() * 2); onCleanup(() => setN(0)); return [double, () => setN(n() + 1)]; }",
  effectLater: "import { createEffect } from \"solid-js\";\nexport function effectLater(read, el) { createEffect(() => read(), v => { el.textContent = String(v); }); }",
  guarded: "import { createSignal } from \"solid-js\";\nimport { isServer } from \"@solidjs/web\";\nconst noop = () => {};\nexport function guarded(start) { if (isServer) return [() => start, noop]; const [n, setN] = createSignal(start); return [n, setN]; }",
  errorClass: "export class Bad extends Error { constructor(what) { super(`bad ${what}`); this.what = what; } }\nexport function errorClass(n) { if (n < 0) throw new Bad(n); return Math.sqrt(n); }",
  attaches: "const attach = o => { o.kind = \"x\"; return o; };\nexport const attaches = n => attach({ n });",
  frozenTable: "const UNITS = Object.freeze({ s: 1, m: 60 });\nexport const frozenTable = (n, u) => n * UNITS[u];",
  pattern: "export const pattern = s => /^[a-z]+$/.test(s) && s.replace(/a/g, \"b\").length > 0;",
};

// ---- handler ----  each: [code, parameter index, field, what the reason must say]
const HANDLER_BAD = {
  syncOnOneBranch: ["export function syncOnOneBranch(el, cb, now) { if (now) cb(); else el.addEventListener(\"click\", cb); }", 1, undefined, /while the call runs/],
  storedThenReentered: ["let saved;\nexport function storedThenReentered(cb) { saved = cb; }\nexport function fire() { saved(); }", 0, undefined, /not followed|stored/],
  handedBackWrapped: ["export function handedBackWrapped(cb) { return () => cb(); }", 0, undefined, /handed back or kept/],
  keptInRecord: ["export function keptInRecord(cb) { return { run() { cb(); } }; }", 0, undefined, /handed back or kept/],
  inMemo: ["import { createMemo } from \"solid-js\";\nexport function inMemo(cb) { return createMemo(() => cb()); }", 0, undefined, /computation|while the call runs/],
  inEffectCompute: ["import { createEffect } from \"solid-js\";\nexport function inEffectCompute(cb) { createEffect(() => cb(), () => {}); }", 0, undefined, /computation|while the call runs/],
  inMap: ["export function inMap(list, cb) { return list.map(cb); }", 1, undefined, /calls it|while the call runs/],
  beforeAwait: ["export async function beforeAwait(cb) { cb(); await null; }", 0, undefined, /while the call runs/],
  awaitOnOneBranch: ["export async function awaitOnOneBranch(cb, slow) { if (slow) await null; cb(); }", 0, undefined, /while the call runs/],
  inExecutor: ["export function inExecutor(cb) { return new Promise(resolve => { cb(); resolve(); }); }", 0, undefined, /while the call runs/],
  toUnknown: ["import { mystery } from \"kit\";\nexport function toUnknown(cb) { mystery(cb); }", 0, undefined, /not read|not followed/],
  subscribes: ["export function subscribes(source, cb) { return source.subscribe(cb); }", 1, undefined, /\.subscribe/],
  throughHelperSync: ["const run = f => f();\nexport function throughHelperSync(cb) { run(cb); }", 0, undefined, /while the call runs/],
  throughHelperStored: ["const hold = [];\nconst keep = f => { hold.push(f); };\nexport function throughHelperStored(cb) { keep(cb); }", 0, undefined, /not followed|not read|\.push/],
  handedBack: ["export function handedBack(cb) { return cb; }", 0, undefined, /handed back/],
  fieldSync: ["export function fieldSync(opts) { return opts.onChange(1); }", 0, "onChange", /while the call runs/],
  fieldSpread: ["import { mystery } from \"kit\";\nexport function fieldSpread(opts) { mystery({ ...opts }); }", 0, "onChange", /given to mystery/],
  fieldWhole: ["import { mystery } from \"kit\";\nexport function fieldWhole(opts) { setTimeout(() => opts.onChange(1)); mystery(opts); }", 0, "onChange", /given to/],
  namedBoth: ["export function namedBoth(el, cb) { const go = () => cb(); el.addEventListener(\"click\", go); go(); }", 1, undefined, /while the call runs/],
  neverCalled: ["export function neverCalled(cb) { return 1; }", 0, undefined, /never called/],
  boundAndCalled: ["export function boundAndCalled(cb) { const f = cb.bind(null, 1); f(); }", 0, undefined, /while the call runs/],
};
const HANDLER_GOOD = {
  listener: ["export function listener(el, cb) { el.addEventListener(\"click\", cb); return () => el.removeEventListener(\"click\", cb); }", 1],
  timer: ["export function timer(cb, ms) { const id = setTimeout(() => cb(ms), ms); return () => clearTimeout(id); }", 0],
  afterAwait: ["export async function afterAwait(cb) { await new Promise(r => setTimeout(r, 1)); cb(); }", 0],
  inThen: ["export function inThen(p, cb) { return p.then(v => cb(v)); }", 1],
  observer: ["export function observer(el, cb) { const o = new ResizeObserver(entries => cb(entries[0])); o.observe(el); return () => o.disconnect(); }", 1],
  debounced: ["export function debounced(cb, ms) { let id; return (...args) => { clearTimeout(id); id = setTimeout(() => cb(...args), ms); }; }", 0],
  effectApply: ["import { createEffect } from \"solid-js\";\nexport function effectApply(read, cb) { createEffect(() => read(), v => cb(v)); }", 1],
  cleanup: ["import { onCleanup } from \"solid-js\";\nexport function cleanup(cb) { onCleanup(cb); }", 0],
  throughHelper: ["const on = (el, type, f) => { el.addEventListener(type, f); };\nexport function throughHelper(el, cb) { on(el, \"input\", e => cb(e.target.value)); }", 1],
  field: ["export function field(el, opts) { el.addEventListener(\"change\", e => opts.onChange(e.target.value)); }", 1, "onChange"],
  fieldDestructured: ["export function fieldDestructured(el, { onChange, name }) { el.addEventListener(name, () => onChange(1)); }", 1, "onChange"],
  bound: ["export function bound(el, cb) { el.addEventListener(\"focus\", cb.bind(undefined, true)); }", 1],
  namedListener: ["export function namedListener(el, cb) { const go = e => { if (e.key === \"x\") cb(); }; el.addEventListener(\"keydown\", go); return () => el.removeEventListener(\"keydown\", go); }", 1],
};

// ---- rejects ----  each: [code, what `rejects` must be: null (not shown) or the classes]
const REJECTS_BAD = {
  unknownCall: ["import { mystery } from \"kit\";\nexport class NotFound extends Error {}\nexport async function unknownCall(id) { if (!id) throw new NotFound(); return mystery(id); }", /not read|Error/],
  thrownValue: ["export class NotFound extends Error {}\nexport async function thrownValue(id) { if (!id) throw new NotFound(); if (id < 0) throw { code: 1 }; return id; }", /Error/],
  rethrown: ["export class NotFound extends Error {}\nexport async function rethrown(text) { try { return JSON.parse(text); } catch (e) { throw e; } }", /Error/],
  awaitedArgument: ["export class NotFound extends Error {}\nexport async function awaitedArgument(p) { const v = await p; if (!v) throw new NotFound(); return v; }", /Error/],
  privateClass: ["class Hidden extends Error {}\nexport async function privateClass(id) { if (!id) throw new Hidden(); return 1; }", /does not export/],
  builtinClass: ["export class NotFound extends Error {}\nexport async function builtinClass(id) { if (!id) throw new NotFound(); if (id < 0) throw new RangeError(\"negative\"); return 1; }", /Error/],
  callback: ["export class NotFound extends Error {}\nexport async function callback(id, pick) { if (!id) throw new NotFound(); return pick(id); }", /Error/],
  parsed: ["export class NotFound extends Error {}\nexport async function parsed(text) { if (!text) throw new NotFound(); return JSON.parse(text); }", /Error/],
  rejectedWithValue: ["export class NotFound extends Error {}\nexport function rejectedWithValue(id) { return new Promise((resolve, reject) => { if (!id) reject(new NotFound()); else if (id < 0) reject(id); else resolve(id); }); }", /Error/],
  helperThrows: ["export class NotFound extends Error {}\nconst check = id => { if (id < 0) throw new Error(\"negative\"); };\nexport async function helperThrows(id) { check(id); if (!id) throw new NotFound(); return 1; }", /Error/],
  handedPromise: ["export class NotFound extends Error {}\nexport function handedPromise(ps) { if (!ps.length) return Promise.reject(new NotFound()); return Promise.all(ps); }", /Error/],
};
const REJECTS_GOOD = {
  oneClass: ["export class NotFound extends Error {}\nconst people = { 1: \"Ann\" };\nexport async function oneClass(id) { await new Promise(r => setTimeout(r, 1)); const p = people[id]; if (!p) throw new NotFound(id); return p; }", ["NotFound"]],
  twoClasses: ["export class NotFound extends Error {}\nexport class Stale extends Error {}\nexport async function twoClasses(id) { if (id === \"0\") throw new Stale(); if (!id) throw new NotFound(); return `seen ${id}`; }", ["NotFound", "Stale"]],
  throughHelper: ["export class Offline extends Error {}\nconst guard = n => { if (n < 0) throw new Offline(\"offline\"); };\nexport async function throughHelper(n) { guard(n); return 1; }", ["Offline"]],
  rejected: ["export class Offline extends Error {}\nexport function rejected(n) { return new Promise((resolve, reject) => { if (n < 0) reject(new Offline()); else setTimeout(() => resolve(n), 1); }); }", ["Offline"]],
  caughtAndRenamed: ["export class Invalid extends Error {}\nexport async function caughtAndRenamed(text) { try { return JSON.parse(text); } catch { throw new Invalid(text); } }", ["Invalid"]],
  rethrownClass: ["export class Invalid extends Error {}\nconst check = t => { if (!t) throw new Invalid(); };\nexport async function rethrownClass(text) { try { check(text); } catch (e) { throw e; } return 1; }", ["Invalid"]],
  none: ["export async function none(n) { await null; return 1; }", []],
};

fs.writeFileSync(path.join(ws, "node_modules/kit/package.json"), JSON.stringify({ name: "kit", version: "1.0.0", type: "module", exports: { ".": { types: "./index.d.ts", default: "./index.cjs" } } }));
fs.writeFileSync(path.join(ws, "node_modules/kit/index.cjs"), "exports.mystery = x => x; exports.tweak = x => x; exports.f = x => x;\n");
fs.writeFileSync(path.join(ws, "node_modules/kit/index.d.ts"), "export declare function mystery(x: any): any;\nexport declare function tweak(x: any): any;\nexport declare function f(x: any): any;\n");

const { create } = require("../src/infer.js");
const facts = (name, code, types) => { const file = path.join(ws, `${name}.js`); fs.writeFileSync(file, code + "\n"); return create(ts).exportFacts(`./${name}.js`, ws, name, types); };
const reason = f => f.unread ?? f.why.map(w => w.why).join(" | ");

console.log("pure: each of these does one thing the word must not cover, and is refused");
for (const [name, [code, says]] of Object.entries(PURE_BAD)) { const f = facts(name, code); ok(`${name}: not pure`, !f.unread && f.pure === false && says.test(reason(f)), f.unread ?? (f.pure ? "PROVEN PURE" : reason(f))); }
console.log("pure: the honest twins are proven");
for (const [name, code] of Object.entries(PURE_GOOD)) { const f = facts(name, code); ok(`${name}: pure`, f.pure === true, reason(f)); }

console.log("handler: one call that is not later, or one place the callback goes that is not followed, and there is no word");
for (const [name, [code, index, field, says]] of Object.entries(HANDLER_BAD)) { const f = facts(name, code); const h = f.unread ? undefined : f.handler(index, field); const said = h ? (h.never ? "never called" : h.uses.filter(u => u.how !== "later").map(u => `${u.how}: ${u.why}`).join(" | ")) : f.unread; ok(`${name}: no handler`, !!h && h.ok === false && says.test(said), h?.ok ? "PROVEN HANDLER" : said); }
console.log("handler: called later on every path");
for (const [name, [code, index, field]] of Object.entries(HANDLER_GOOD)) { const f = facts(name, code); const h = f.unread ? undefined : f.handler(index, field); ok(`${name}: handler`, !!h && h.ok === true, h ? h.uses.map(u => `${u.how}: ${u.why}`).join(" | ") : f.unread); }

console.log("rejects: a path whose class the code does not show, and nothing is named");
for (const [name, [code, says]] of Object.entries(REJECTS_BAD)) { const f = facts(name, code); ok(`${name}: no classes`, !f.unread && f.rejects === null && says.test(f.rejectsWhy ?? ""), f.unread ?? (f.rejects ? `NAMED ${f.rejects.join(" | ")}` : f.rejectsWhy)); }
console.log("rejects: only classes the module exports");
for (const [name, [code, classes]] of Object.entries(REJECTS_GOOD)) { const f = facts(name, code, { plain: new Set([0]) }); ok(`${name}: rejects(${classes.join(" | ")})`, !f.unread && JSON.stringify(f.rejects) === JSON.stringify(classes), f.unread ?? (f.rejects ? f.rejects.join(" | ") : f.rejectsWhy)); }

console.log("draft: a parameter changed in place, one never changed, one that goes where it is not followed");
{
  const d = (name, code, i = 0) => { const f = facts(name, code); return f.unread ?? f.draft(i); };
  ok("splice in place: changes", d("moves", "export function moves(list, a, b) { const [x] = list.splice(a, 1); list.splice(b, 0, x); }") === "changes");
  ok("a field assigned through a loop variable: changes", d("marks", "export function marks(rows) { for (const r of rows) r.done = true; }") === "changes");
  ok("only read: never", d("sums", "export function sums(list) { let n = 0; for (const x of list) n += x.n; return n; }") === "never");
  ok("copied and the copy sorted: never", d("sorted", "export function sorted(list) { return [...list].sort(); }") === "never");
  ok("handed to code that is not read: not said", d("hands", "import { mystery } from \"kit\";\nexport function hands(list) { mystery(list); }") === undefined);
  ok("changed after the call (in a timer): not a draft", d("late", "export function late(list) { setTimeout(() => list.push(1)); }") === undefined);
  ok("changed and kept (a closure handed back): not a draft", d("keeps", "export function keeps(list) { list.push(1); return () => list.length; }") === undefined);
}

console.log("a package: every build its export map can hand out must agree, and a build that cannot be read stops the word");
{
  const pkg = path.join(ws, "node_modules/two");
  fs.mkdirSync(path.join(pkg, "dist"), { recursive: true });
  fs.writeFileSync(path.join(pkg, "package.json"), JSON.stringify({ name: "two", version: "1.0.0", type: "module", exports: { ".": { types: "./dist/index.d.ts", browser: "./dist/browser.js", node: "./dist/server.js", default: "./dist/browser.js" }, "./one": { default: "./dist/one.js" } } }));
  fs.writeFileSync(path.join(pkg, "dist/browser.js"), "import { half } from \"./shared.js\";\nexport const same = n => half(n) + 1;\nexport const differs = n => n + 1;\nexport * from \"./shared.js\";\n");
  fs.writeFileSync(path.join(pkg, "dist/server.js"), "import { half } from \"./shared.js\";\nexport const same = n => half(n) + 1;\nexport const differs = n => { globalThis.seen = n; return n + 1; };\nexport * from \"./shared.js\";\n");
  fs.writeFileSync(path.join(pkg, "dist/shared.js"), "export const half = n => n / 2;\nexport { stamp as renamed } from \"./deep.js\";\n");
  fs.writeFileSync(path.join(pkg, "dist/deep.js"), "export const stamp = s => `#${s}`;\n");
  fs.writeFileSync(path.join(pkg, "dist/one.js"), "import { mystery } from \"kit\";\nexport const viaOther = n => mystery(n);\nexport const alone = n => n * 2;\n");
  const inf = create(ts);
  ok("the same in both builds: pure", inf.exportFacts("two", ws, "same").pure === true);
  ok("pure in the browser's build and not in the server's: not pure", inf.exportFacts("two", ws, "differs").pure === false, JSON.stringify(inf.exportFacts("two", ws, "differs").why));
  ok("an export that comes through `export *` and a renaming `export { … } from` is followed", inf.exportFacts("two", ws, "renamed").pure === true && inf.exportFacts("two", ws, "half").pure === true);
  ok("a subpath of the export map", inf.exportFacts("two/one", ws, "alone").pure === true);
  ok("…where a call into a package that ships no ES module is code that is not read", inf.exportFacts("two/one", ws, "viaOther").pure === false);
  ok("a package with no ES module to read answers nothing", !!inf.exportFacts("kit", ws, "mystery").unread);
  // the `solid` condition: the package's source before Solid's compiler (JS or JSX), which is the module that is read
  const src = path.join(ws, "node_modules/withsource");
  fs.mkdirSync(path.join(src, "dist/part"), { recursive: true });
  fs.writeFileSync(path.join(src, "package.json"), JSON.stringify({ name: "withsource", version: "1.0.0", type: "module", exports: { ".": { types: "./dist/index.d.ts", solid: "./dist/index.jsx", default: "./dist/index.js" }, "./*": { solid: "./dist/*/index.jsx", default: "./dist/*/index.js" } } }));
  fs.writeFileSync(path.join(src, "dist/index.jsx"), "export const twice = n => n * 2;\nexport const Badge = props => <span class=\"badge\">{props.label}</span>;\nexport function onPress(el, cb) { el.addEventListener(\"click\", cb); }\n");
  fs.writeFileSync(path.join(src, "dist/index.js"), "import{mystery as m}from\"kit\";export const twice=n=>m(n);export const Badge=p=>m(p);export function onPress(e,c){m(c)}\n");
  fs.writeFileSync(path.join(src, "dist/part/index.jsx"), "export { a as half } from \"../chunk.jsx\";\n");
  fs.writeFileSync(path.join(src, "dist/part/index.js"), "export const half = n => { globalThis.x = n; };\n");
  fs.writeFileSync(path.join(src, "dist/chunk.jsx"), "const a = n => n / 2;\nexport { a };\n");
  const withSolid = create(ts), without = create(ts, { solid: false });
  ok("a package with a `solid` condition is read from that source: its JSX file parses, and is the module read", withSolid.exportFacts("withsource", ws, "twice").pure === true && withSolid.exportFacts("withsource", ws, "onPress").handler(1).ok === true, JSON.stringify(withSolid.exportFacts("withsource", ws, "twice").why));
  ok("…a component's JSX is rendering, not computing", withSolid.exportFacts("withsource", ws, "Badge").pure === false && /renders \(JSX\)/.test(reason(withSolid.exportFacts("withsource", ws, "Badge"))));
  ok("…through a `./*` pattern and a renamed export of a chunk beside it", withSolid.exportFacts("withsource/part", ws, "half").pure === true);
  ok("…and with the condition set aside, every build must agree, as for a package without one", without.exportFacts("withsource", ws, "twice").pure === false && without.exportFacts("withsource/part", ws, "half").pure === false);
}

// ---- the draft ----
console.log("rx-declare writes the proven words into the rows, marks each row, and does not ask what is answered");
fs.writeFileSync(path.join(ws, "api.js"), [
  "export class NotFound extends Error {}",
  "const people = { 1: { name: \"Ann\" } };",
  "export async function fetchPerson(id) { await new Promise(r => setTimeout(r, 5)); const p = people[id]; if (!p) throw new NotFound(id); return { ...p }; }",
  "let saves = 0;",
  "export async function savePerson(id, name) { saves++; return fetch(`/people/${id}`, { method: \"POST\", body: name }); }",
  "export function onKey(key, run) { const l = e => { if (e.key === key) run(); }; document.addEventListener(\"keydown\", l); return () => document.removeEventListener(\"keydown\", l); }",
  "export function each(list, visit) { list.forEach(visit); }",
  "export function watch(opts) { opts.onStart(); document.addEventListener(\"change\", () => opts.onChange(1)); }",
  "export function moveItem(list, from, to) { const [x] = list.splice(from, 1); list.splice(to, 0, x); }",
  "export function total(list) { let n = 0; for (const x of list) n += x; return n; }",
  "export function log(list) { console.log(list); }",
  "export const createCounter = start => { let n = start; return [() => n, () => { n++; }]; };",
  "export const fmt = (n, unit = \"\") => `${n}${unit}`;",
  "export function sub(a, b) { (b ?? a)(); }",
  "",
].join("\n"));
fs.writeFileSync(path.join(ws, "api.d.ts"), [
  "export declare class NotFound extends Error {}",
  "export declare function fetchPerson(id: string): Promise<{ name: string }>;",
  "export declare function savePerson(id: string, name: string): Promise<Response>;",
  "export declare function onKey(key: string, run: () => void): () => void;",
  "export declare function each(list: number[], visit: (n: number) => void): void;",
  "export declare function watch(opts: { onStart: () => void; onChange: (n: number) => void }): void;",
  "export declare function moveItem<T>(list: T[], from: number, to: number): void;",
  "export declare function total(list: number[]): number;",
  "export declare function log(list: number[]): void;",
  "export declare function createCounter(start: number): [() => number, () => void];",
  "export declare function fmt(n: number): string;",
  "export declare function fmt(n: number, unit: string): string;",
  "export declare function sub(run: () => void): void;",
  "export declare function sub(key: string, run: () => void): void;",
  "",
].join("\n"));
const declare = (...a) => spawnSync(process.execPath, [path.join(__dirname, "../bin/declare.js"), ...a], { cwd: ws, encoding: "utf8", env: { ...process.env, RX_DECLARE_INFER: "" } });
const r = declare("./api.js", "--out", "api.d.rx", "--why", "--explain");
const draft = fs.existsSync(path.join(ws, "api.d.rx")) ? fs.readFileSync(path.join(ws, "api.d.rx"), "utf8") : "";
if (process.env.VERBOSE) console.log(draft, r.stderr);
const rowOf = n => draft.split("\n").find(l => new RegExp(`^export (?:pure )?fn ${n}\\b`).test(l)) ?? "";
const above = n => { const ls = draft.split("\n"); const i = ls.findIndex(l => new RegExp(`^export (?:pure )?fn ${n}\\b`).test(l)); return i > 0 ? ls[i - 1] : ""; };
ok("a loader that only computes and waits: `pure`, and what it rejects with", rowOf("fetchPerson") === "export pure fn fetchPerson(id: string): Promise<{ name: string }> rejects(NotFound)", rowOf("fetchPerson") + r.stderr);
ok("…with no line above it (MO-8w): which words were read is said once, at the head of the draft, and again by --audit and rx-verify from the code", !/\/\/@ inferred/.test(draft), above("fetchPerson"));
ok("…and neither question is asked", !/TODO fetchPerson/.test(draft));
ok("one that writes and fetches is io, and its question stays", rowOf("savePerson") === "export fn savePerson(id: string, name: string): Promise<Response>" && /TODO savePerson: what does its promise reject with/.test(draft), rowOf("savePerson"));
ok("a callback given to a listener: `handler`", rowOf("onKey") === "export fn onKey(key: string, run: handler () => void): () => void", rowOf("onKey"));
ok("a callback called while the call runs: no `handler` — and the fn is `pure`, as a fn that only calls the pure function it is given is", rowOf("each") === "export pure fn each(list: number[], visit: (n: number) => void): void", rowOf("each"));
ok("a record's callbacks, each by what the code does with it", rowOf("watch") === "export fn watch(opts: { onStart: () => void; onChange: handler (n: number) => void }): void", rowOf("watch"));
ok("…and the question about them is not asked: one is a handler, the other is called while the call runs", !/TODO watch: on/.test(draft), draft.split("\n").filter(l => /TODO watch/.test(l)).join("\n"));
ok("a parameter changed in place: `draft`, and no question", rowOf("moveItem") === "export fn moveItem<T>(draft list: T[], from: number, to: number): void" && !/TODO moveItem/.test(draft), rowOf("moveItem"));
ok("a parameter only read: `pure`, no `draft`", rowOf("total") === "export pure fn total(list: number[]): number", rowOf("total"));
ok("a parameter never changed, in a fn that answers nothing: the question is not asked", rowOf("log") === "export fn log(list: number[]): void" && !/TODO log: does it change/.test(draft), draft.split("\n").filter(l => /TODO log/.test(l)).join("\n"));
ok("a primitive by its name that only computes: `pure`, and the name's question is not asked", /^export pure fn createCounter\(/.test(rowOf("createCounter")) && !/TODO createCounter: pure\?/.test(draft), rowOf("createCounter"));
ok("the draft says how many words were read from the code", /^\/\/ Read from the code that runs \(MO-8v\): 5 pure, 2 handler, 1 rejects, 1 draft/m.test(draft), draft.split("\n")[1]);
ok("several signatures that are one row to the checker: a note for --explain, not a question", !/TODO fmt/.test(draft) && /rx-declare: fmt: 2 signatures in the library's types/.test(r.stderr), draft + r.stderr);
ok("…and a question where they differ in what the checker reads (a callback first in one, second in the other)", /TODO sub: 2 signatures in the library's types/.test(draft), draft);
ok("--why: each word proven with what shows it", /fetchPerson: pure proven/.test(r.stderr) && /onKey: handler\(run\) proven — .*\[api\.js:6\]/.test(r.stderr), r.stderr);
ok("…and each refused with the first thing in the way, and its place", /savePerson: pure not proven — .*saves.*\[api\.js:5\]/.test(r.stderr) && /each: handler\(visit\) not proven — called while the call runs/.test(r.stderr), r.stderr);
{
  const plain = declare("./api.js", "--no-infer");
  ok("--no-infer: the draft from the types alone, every question asked", !/\/\/@ inferred|^export pure fn|: handler \(|rejects\(N|draft list:/m.test(plain.stdout) && /TODO fetchPerson: what does its promise reject with/.test(plain.stdout) && /TODO createCounter: pure\?/.test(plain.stdout), plain.stdout);
  const only = declare("./api.js", "--only", "onKey");
  ok("--only keeps the row, words and all", /^export fn onKey\(key: string, run: handler \(\) => void\)/m.test(only.stdout) && !/fetchPerson/.test(only.stdout), only.stdout);
}

// ---- both checkers read the draft ----
console.log("the checkers read the rows as any rows: a word that was proven lets a program through, one withheld does not");
fs.writeFileSync(path.join(ws, "tsconfig.json"), JSON.stringify({ compilerOptions: { strict: true, noEmit: true, allowJs: true, checkJs: false, module: "ESNext", moduleResolution: "Bundler", target: "ES2022", jsx: "preserve", jsxImportSource: "@solidjs/web", skipLibCheck: true }, include: ["*.rx"] }));
const program = body => ["import { fetchPerson, onKey, each, total, log, NotFound } from \"./api.js\"", "export default component App() {", ...body, "}", ""].join("\n");
// each checker's diagnostics for one program: rx-tsc (the crate), and ref/'s checker (bench/ref-check.ts)
const both = (file, body) => {
  fs.writeFileSync(path.join(ws, file), program(body));
  const t = spawnSync(process.execPath, [path.join(__dirname, "../bin/tsc.js"), "--noEmit", "-p", "tsconfig.json"], { cwd: ws, encoding: "utf8" });
  const r = spawnSync(process.execPath, ["--experimental-strip-types", "--no-warnings", path.join(repo, "bench/ref-check.ts"), path.join(ws, file)], { cwd: ws, encoding: "utf8" });
  fs.rmSync(path.join(ws, file));
  let ref; try { ref = JSON.parse(r.stdout); } catch { ref = { error: r.stdout + r.stderr }; }
  return { crate: t.stdout + t.stderr, ref: ref.error ? `error: ${ref.error}` : ref.diagnostics.map(d => d.code).join(" ") };
};
const good = both("good.rx", ["  source n := 0", "  source nums: number[] := [1, 2]", "  sum = total(nums)", "  effect () {", "    let stop = onKey(\"k\", () => { n := h => h + 1 })", "    return () => { stop() }", "  }", "  <p>{sum} {n}</p>"]);
ok("rx-tsc (the crate): a `pure` fn in an equation, a closure that writes given to a `handler` parameter", !/error/.test(good.crate), good.crate);
ok("…and ref/'s checker reads the same rows the same way", good.ref === "", good.ref);
const badPure = both("bad1.rx", ["  source nums: number[] := [1, 2]", "  gone = log(nums)", "  <p>{nums.length}</p>"]);
ok("a fn that was not proven pure is io there (IO_IN_REACTIVE), to both", /IO_IN_REACTIVE/.test(badPure.crate) && /IO_IN_REACTIVE/.test(badPure.ref), JSON.stringify(badPure));
const badHandler = both("bad2.rx", ["  source n := 0", "  source nums: number[] := [1, 2]", "  effect () {", "    each(nums, x => { n := x })", "  }", "  seen = each(nums, x => { n := x })", "  <p>{n}</p>"]);
ok("a closure that writes, given to a callback that was not proven a handler, is refused by both", /REACTIVE_WRITE_IN_OWNED_SCOPE/.test(badHandler.crate) && /REACTIVE_WRITE_IN_OWNED_SCOPE/.test(badHandler.ref), JSON.stringify(badHandler));

// ---- rx-verify: a word read from the code is run against what the reading claims ----
console.log("rx-verify runs each inferred word: an observation against it is a mismatch, whoever wrote the mark");
{
  const app = path.join(ws, "verify"); fs.mkdirSync(app, { recursive: true });
  fs.symlinkSync(path.join(ws, "node_modules"), path.join(app, "node_modules"), "dir");
  fs.writeFileSync(path.join(app, "package.json"), JSON.stringify({ type: "module" }));
  // a module whose rows claim, as if read from the code, what its code does not do: the marks are forged here, since
  // the reading itself refuses every one of them (above)
  fs.writeFileSync(path.join(app, "lies.js"), [
    "export class NotFound extends Error {}", "export class Other extends Error {}",
    "export const stamps = s => `${s}@${Date.now()}`;",
    "export const rolls = n => Math.floor(Math.random() * n);",
    "export const pushes = (list, x) => { list.push(x); return list.length; };",
    "export const leaks = n => { globalThis.__leaked = n; return n; };",
    "export const honest = (list, x) => [...list, x].length;",
    "export const callsNow = (el, cb) => { cb(1); el.addEventListener(\"x\", cb); };",
    "export const callsLater = (el, cb) => { el.addEventListener(\"x\", cb); };",
    "export const rejectsOther = async id => { if (!id) throw new Other(\"no\"); return id; };",
    "export const rejectsRight = async id => { if (!id) throw new NotFound(\"no\"); return id; };",
    "",
  ].join("\n"));
  fs.writeFileSync(path.join(app, "lies.d.rx"), [
    "export error NotFound", "export error Other",
    "//@ inferred stamps: pure", "export pure fn stamps(s: string): string",
    "//@ inferred rolls: pure", "export pure fn rolls(n: number): number",
    "//@ inferred pushes: pure", "export pure fn pushes(list: number[], x: number): number",
    "//@ inferred leaks: pure", "export pure fn leaks(n: number): number",
    "//@ inferred honest: pure", "export pure fn honest(list: number[], x: number): number",
    "//@ inferred callsNow: handler(cb)", "export fn callsNow(el: EventTarget, cb: handler (n: number) => void): void",
    "//@ inferred callsLater: handler(cb)", "export fn callsLater(el: EventTarget, cb: handler (n: number) => void): void",
    "//@ inferred rejectsOther: pure, rejects(NotFound)", "export pure fn rejectsOther(id: string): Promise<string> rejects(NotFound)",
    "//@ inferred rejectsRight: pure, rejects(NotFound)", "export pure fn rejectsRight(id: string): Promise<string> rejects(NotFound)",
    "",
  ].join("\n"));
  fs.writeFileSync(path.join(app, "lies.probe.mjs"), [
    "const target = () => { const t = new EventTarget(); return t; };",
    "let last;",
    "export const probes = {",
    "  stamps: { args: () => [\"a\"] }, rolls: { args: () => [1000000] }, pushes: { args: () => [[1, 2], 3] }, leaks: { args: () => [7] }, honest: { args: () => [[1, 2], 3] },",
    "  callsNow: { args: () => [(last = target()), () => {}], act: () => last.dispatchEvent(new Event(\"x\")) },",
    "  callsLater: { args: () => [(last = target()), () => {}], act: () => last.dispatchEvent(new Event(\"x\")) },",
    "  rejectsOther: { args: () => [\"1\"], fail: () => [\"\"] }, rejectsRight: { args: () => [\"1\"], fail: () => [\"\"] },",
    "};", "",
  ].join("\n"));
  const v = spawnSync(process.execPath, ["--conditions=browser", path.join(__dirname, "../bin/verify.js"), "lies.d.rx"], { cwd: app, encoding: "utf8" });
  const said = v.stdout + v.stderr; if (process.env.VERBOSE) console.log(said);
  const line = n => said.split("\n").filter(l => new RegExp(`\\b${n}:`).test(l)).join("\n");
  ok("a `pure` that asks the clock: mismatch", /stamps: read from its code as pure\b.*Date\.now\(\)/.test(said) && /✗|MISMATCH|mismatch/i.test(line("stamps")), line("stamps") || said.slice(0, 600));
  ok("a `pure` that asks for a random number: mismatch", /rolls: read from its code as pure\b.*Math\.random\(\)/.test(said), line("rolls"));
  ok("a `pure` that changes its argument: mismatch", /pushes: read from its code as pure\b.*changed what it was given/.test(said), line("pushes"));
  ok("a `pure` that leaves a global: mismatch", /leaks: read from its code as pure\b.*__leaked/.test(said), line("leaks"));
  ok("an honest one is not contradicted", /honest: the pure read from its code is not contradicted/.test(said), line("honest"));
  ok("a `handler` called while the call runs: mismatch", /callsNow: cb was read from the code as a handler\b.*while the call itself runs/.test(said), line("callsNow"));
  ok("…and one called only by the listener holds", /callsLater: callback cb holds/.test(said), line("callsLater"));
  ok("a `rejects(E)` that rejects with another class: mismatch", /rejectsOther: read from its code to reject with NotFound alone\b.*rejects with Other/.test(said), line("rejectsOther"));
  ok("…and one that rejects with the class its row names holds", /rejectsRight: under the probe's failing arguments it rejects with NotFound, as its row says/.test(said), line("rejectsRight"));
  ok("rx-verify exits 1 on the mismatches", v.status === 1, String(v.status));
  // the drafts of the suite's honest twins, run: no inferred word of a real draft is contradicted
  fs.writeFileSync(path.join(app, "twins.js"), [PURE_GOOD.copies, PURE_GOOD.maps, PURE_GOOD.constantTable, HANDLER_GOOD.listener[0], HANDLER_GOOD.timer[0], REJECTS_GOOD.twoClasses[0]].join("\n") + "\n");
  fs.writeFileSync(path.join(app, "twins.d.ts"), ["export declare function copies(list: number[], x: number): number[];", "export declare function maps(rows: { a?: string }[], key: \"a\"): { a?: string; label: string }[];", "export declare function constantTable(id: number): { name: string } | undefined;", "export declare function listener(el: EventTarget, cb: (e: Event) => void): () => void;", "export declare function timer(cb: (ms: number) => void, ms: number): () => void;", "export declare class NotFound extends Error {}", "export declare class Stale extends Error {}", "export declare function twoClasses(id: string): Promise<string>;", ""].join("\n"));
  const d = spawnSync(process.execPath, [path.join(__dirname, "../bin/declare.js"), "./twins.js", "--out", "twins.d.rx"], { cwd: app, encoding: "utf8", env: { ...process.env, RX_DECLARE_INFER: "" } });
  const twins = fs.existsSync(path.join(app, "twins.d.rx")) ? fs.readFileSync(path.join(app, "twins.d.rx"), "utf8") : d.stderr;
  ok("the twins' draft has its words: 4 pure, 2 handler, 1 rejects", /4 pure, 2 handler, 1 rejects/.test(twins), twins);
  fs.writeFileSync(path.join(app, "twins.probe.mjs"), ["let last;", "export const probes = {", "  copies: { args: () => [[3, 1], 2] }, maps: { args: () => [[{ a: \" x \" }, {}], \"a\"] }, constantTable: { args: () => [1] },", "  listener: { args: () => [(last = new EventTarget()), () => {}], act: () => last.dispatchEvent(new Event(\"click\")) },", "  timer: { args: () => [() => {}, 1] },", "  twoClasses: { args: () => [\"7\"], fail: () => [\"0\"] },", "};", ""].join("\n"));
  const tv = spawnSync(process.execPath, ["--conditions=browser", path.join(__dirname, "../bin/verify.js"), "twins.d.rx"], { cwd: app, encoding: "utf8" });
  ok("…and run, none is contradicted: every probed word holds", tv.status === 0 && /copies: the pure read from its code is not contradicted/.test(tv.stdout) && /listener: callback cb holds/.test(tv.stdout) && /timer: callback cb holds/.test(tv.stdout) && /twoClasses: under the probe's failing arguments it rejects with Stale, as its row says/.test(tv.stdout), tv.stdout + tv.stderr);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
