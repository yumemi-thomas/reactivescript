// MO-10i (RFC 09, ruled 2026-11-22): a library's draft is a place, not a value. What this runs is the guarantee itself,
// not a list of cases: whatever a callback does with its draft, nothing `.rx` holds afterwards is the library's own
// object. The library here takes its draft back for real — every object it hands the callback is a revocable proxy,
// revoked when the setter returns, so touching one later throws — and the compiled callback
//  - copies what it reads out (the draft whole, a field, a nested record, through fns, in records and arrays, into a
//    closure's capture): every value that left is read, deeply, after the revocation;
//  - writes the draft in place: by path, with an updater that reads the draft, in a loop over a list of its own and
//    over a path of the draft (`for (const t of d.items) { t.done := true }`), by the draft's own methods;
// and, with Solid 2's own store (whose draft is the store itself, live and tracked), what was read out does not follow
// the store. The programs that could keep the draft are refused (`DRAFT_ESCAPES`): a closure that names it, an `await`,
// a callback made elsewhere, the setter under another name, in a prop, or inside the result it came in.
// Runs on the server (Node): a JS component calls the handler it is given while it renders. Needs the crate's Node-API
// build (`npm run build` in compiler/), the runtime's build (runtime/dist) and ref/node_modules (Solid).
//   node compiler/test/drafts.mjs
import { createRequire } from "node:module";
import { mkdirSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "../..");
const { app } = createRequire(import.meta.url)("../index.js");
const ws = path.join(here, ".out/drafts"); rmSync(ws, { recursive: true, force: true });
mkdirSync(path.join(ws, "node_modules/@reactivescript"), { recursive: true });
for (const d of readdirSync(path.join(repo, "ref/node_modules")).filter(f => !f.startsWith("."))) symlinkSync(path.join(repo, "ref/node_modules", d), path.join(ws, "node_modules", d), "dir");
symlinkSync(path.join(repo, "runtime"), path.join(ws, "node_modules/@reactivescript/runtime"), "dir");
writeFileSync(path.join(ws, "package.json"), JSON.stringify({ type: "module" }));
writeFileSync(path.join(ws, "lib.d.rx"), [
  "export pure fn createStore<T>(init: T): [T, (update: (draft state: T) => T | void) => void]",
  "export pure fn solidStore<T>(init: T): [T, (update: (draft state: T) => T | void) => void]",
  "export fn sink(label: string, x: any): void",
  "export fn later(f: handler () => void): void",
  "export component Run(props: { go: handler () => void })",
  "",
].join("\n"));
writeFileSync(path.join(ws, "lib.js"), `
import { createStore as solid } from "solid-js";
export const sunk = {}; export const laters = []; export const states = []; export const leaked = [];
export const sink = (label, x) => { sunk[label] = x; };
export const later = f => { laters.push(f); };
export const Run = props => { props.go(); return ""; };
// a store whose setter takes its draft back: every object the callback is handed is revoked when the setter returns
export const createStore = init => {
  const state = init; states.push(state);
  const set = f => {
    const revokes = []; const made = new WeakMap(); const targets = new WeakMap();
    const wrap = o => {
      if (o === null || typeof o !== "object") return o;
      if (made.has(o)) return made.get(o);
      // what is written back is its own object, never its proxy (as Solid's store and Immer unwrap what they are given)
      const { proxy, revoke } = Proxy.revocable(o, { get: (t, k, r) => wrap(Reflect.get(t, k, r)), set: (t, k, v) => Reflect.set(t, k, targets.get(v) ?? v) });
      made.set(o, proxy); targets.set(proxy, o); revokes.push(revoke); return proxy;
    };
    const draft = wrap(state); leaked.push(draft);
    try { f(draft); } finally { for (const r of revokes) r(); }
  };
  return [state, set];
};
export const solidStore = init => solid(init);
`);
const head = 'import { createStore, solidStore, sink, later, Run } from "./lib.js"\nfn keep(x) { x }\n';
const main = `${head}export default component App() {
  [todos, setTodos] = createStore<{ done: number; step: number; items: { text: string; done: boolean }[]; sub: { n: number } }>({ done: 0, step: 10, items: [{ text: "a", done: false }, { text: "b", done: false }], sub: { n: 1 } })
  <Run go={() => { setTodos((d) => {
    sink("whole", d)
    sink("kept", keep(keep(d)))
    sink("held", [d.items, { s: d.sub }, true ? d : null])
    sink("scalar", d.done)
    let xs = d.items
    let n = d.done
    let sub = d.sub
    later(() => { sink("later", [xs, n, sub]) })
    for (const t of d.items) { t.done := true }
    for (const x of [1, 2]) { d.done := d.done + x }
    d.done := v => v + d.step
    d.items.push({ text: "c", done: false })
    d.sub := { n: d.sub.n + 1 }
    let i = d.items.findIndex((t) => t.text == "a")
    if (i >= 0) { d.items.splice(i, 1) }
    sink("found", d.items.find((t) => t.text == "b"))
    sink("count", len(d.items))
    sink("after", d)
  }) }} />
  <p>{todos.done}</p>
}
`;
const solid = `${head}export default component App() {
  [todos, setTodos] = solidStore<{ items: string[] }>({ items: ["a"] })
  <Run go={() => {
    setTodos((d) => { sink("items", d.items); sink("store", d) })
    setTodos((d) => { d.items.push("b") })
    setTodos((d) => { for (const x of ["c", "d"]) { d.items.push(x) }; sink("len", len(d.items)) })
  }} />
  <p>{len(todos.items)}</p>
}
`;
const store = "  [todos, setTodos] = createStore<{ done: number; items: string[] }>({ done: 0, items: [] })\n";
const page = (body, pre = "") => `${head}${pre}export default component App() {\n${store}${body}\n  <p>{todos.done}</p>\n}\n`;
const refused = {
  "a closure made in the callback writes a path later": [page("  <Run go={() => { setTodos((d) => { later(() => { d.done := 1 }) }) }} />"), "DRAFT_ESCAPES"],
  "a closure made in the callback reads it later": [page("  <Run go={() => { setTodos((d) => { later(() => { sink(\"n\", d.done) }) }) }} />"), "DRAFT_ESCAPES"],
  "a closure given to a method names it (a loop is the statement)": [page("  <Run go={() => { setTodos((d) => { [1, 2].forEach((x) => { d.done := d.done + x }) }) }} />"), "DRAFT_ESCAPES"],
  "an await in the callback": [page("  <Run go={() => { setTodos((d) => { let v = await sink(\"x\", 1); d.done := 2 }) }} />"), "DRAFT_ESCAPES"],
  "a callback made elsewhere": [page("  <Run go={() => { let up = (d) => { sink(\"d\", d) }; setTodos(up) }} />"), "DRAFT_ESCAPES"],
  "the setter under another name": [page("  <Run go={() => { let set2 = setTodos; set2((d) => { sink(\"d\", d) }) }} />"), "DRAFT_ESCAPES"],
  "the setter passed to a component": [page("  <Row set={setTodos} />", "component Row(props: { set: any }) {\n  <Run go={() => { props.set((d) => { sink(\"d\", d) }) }} />\n}\n"), "DRAFT_ESCAPES"],
  "the setter inside the result it came in, passed whole": [`${head}component Row(props: { st: any }) {\n  <Run go={() => { props.st[1]((d) => { sink("d", d) }) }} />\n}\nexport default component App() {\n  st = createStore<{ done: number }>({ done: 0 })\n  <Row st={st} />\n}\n`, "DRAFT_ESCAPES"],
  "a path of a local read from the draft (a copy) is not written": [page("  <Run go={() => { setTodos((d) => { let a = d; a.done := 1 }) }} />"), "WRITE_TO_NON_SOURCE"],
};
const { createApp } = await import(pathToFileURL(path.join(ws, "node_modules/@reactivescript/runtime/dist/server.js")).href);
const lib = await import(pathToFileURL(path.join(ws, "lib.js")).href);
let pass = 0, fail = 0, seq = 0;
const check = (name, ok, detail) => { if (ok) pass++; else fail++; console.log(`${ok ? "✓" : "✗"} ${name}${ok ? "" : `\n  ${String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 900)}`}`); };
const run = async (name, src) => {
  const file = path.join(ws, `${name}.rx`); writeFileSync(file, src);
  const out = JSON.parse(app(file, "ssr"));
  if (out.diagnostics || out.error) return { refused: out };
  const js = path.join(ws, `${name}.gen.mjs`); writeFileSync(js, Object.values(out.modules)[0].code);
  const m = (await import(pathToFileURL(js).href)).default;
  let html = "", threw = null;
  const a = createApp({ request: new Request("http://x/") });
  try { await new Promise((res, rej) => { try { a.stream(m(a), { write: c => { html += c; }, end: res }); } catch (e) { rej(e); } setTimeout(res, 1500); }); } catch (e) { threw = e; }
  return { html, threw, code: Object.values(out.modules)[0].code };
};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
{
  const r = await run("main", main);
  check("the callback is accepted, and runs", !r.refused && !r.threw && Object.keys(lib.sunk).length > 0, r.refused ?? r.threw?.stack ?? r.html);
  // the library did take its draft back: its own object throws when touched
  let revoked = false; try { void lib.leaked[0].done; } catch { revoked = true; }
  check("the library's draft is revoked once its setter returns (touching it throws)", revoked);
  // the guarantee: everything that left the callback is readable now, to its leaves — nothing of it is the draft
  let alive = null; try { for (const f of lib.laters) f(); JSON.stringify(lib.sunk); } catch (e) { alive = e; }
  check("everything read out of the draft is a copy: all of it reads after the revocation, the closure's captures too", alive === null, alive?.message);
  const before = { done: 0, step: 10, items: [{ text: "a", done: false }, { text: "b", done: false }], sub: { n: 1 } };
  check("the draft read whole is what it held then", same(lib.sunk.whole, before) && same(lib.sunk.kept, before), lib.sunk.whole);
  check("its parts, in a record and an array, and through `?:`", same(lib.sunk.held, [before.items, { s: before.sub }, before]), lib.sunk.held);
  check("a scalar is itself", lib.sunk.scalar === 0 && lib.sunk.count === 2, [lib.sunk.scalar, lib.sunk.count]);
  check("locals a later closure captured hold what the draft held at the read", same(lib.sunk.later, [before.items, 0, before.sub]), lib.sunk.later);
  const after = { done: 13, step: 10, items: [{ text: "b", done: true }, { text: "c", done: false }], sub: { n: 2 } };
  check("the writes landed in the library's state: paths, a loop over a list, a loop over the draft's items, an updater reading the draft, its own methods", same(lib.states[0], after), lib.states[0]);
  check("what a method of the draft answers is copied where it is kept", same(lib.sunk.found, { text: "b", done: true }) && same(lib.sunk.after, after), [lib.sunk.found, lib.sunk.after]);
  check("the copies are the program's own: none is the library's object", lib.sunk.whole !== lib.states[0] && lib.sunk.after.items !== lib.states[0].items && lib.sunk.found !== lib.states[0].items[0]);
  check("what goes straight back to the library is not copied (a value written to a path, a method's argument)", /v\$d\["sub"\] = \{/.test(r.code ?? "") && !/push\(__rt\.copy/.test(r.code ?? "") && /__rt\.copy\(v\$d\)/.test(r.code ?? ""), (r.code ?? "").slice((r.code ?? "").indexOf("v$setTodos"), (r.code ?? "").indexOf("v$setTodos") + 1500));
}
{
  for (const k of Object.keys(lib.sunk)) delete lib.sunk[k];
  const r = await run("solid", solid);
  check("Solid 2's store: the callbacks run", !r.refused && !r.threw && lib.sunk.len === 4, r.refused ?? r.threw?.stack ?? lib.sunk);
  check("what was read out of Solid's draft does not follow the store (it is not the store)", same(lib.sunk.items, ["a"]) && same(lib.sunk.store, { items: ["a"] }), lib.sunk);
}
// the same guarantee over every way an expression hands a value on, and every pair of them (the matrix the checkers'
// tests run, `a_draft_is_named_only_in_its_callback`): each read of the draft is sunk, and all of it read afterwards
{
  for (const k of Object.keys(lib.sunk)) delete lib.sunk[k];
  const WRAPS = ["X", "[X]", "[X][0]", "({ a: X })", "({ a: X }).a", "keep(X)", "keep(keep(X))", "id(id(X))", "o.f(X)", "[(y) => y][0](X)", "(true ? keep : keep)(X)", "mk(X)()", "[].concat([X])", "[].concat([X])[0]", "(true ? X : null)", "(X ?? null)", "(X || null)", "map([X], (y) => y)", "map([X], (y) => y)[0]", "filter([X], (y) => true)", "[X, 1].filter((y) => true)", "[...[X]]", "({ ...({ a: X }) })", "X.part", "X[\"part\"]", "X[k]"];
  const one = WRAPS.map(w => w.replaceAll("X", "d")); const all = [...one]; for (const w of WRAPS) for (const inner of one.slice(1)) all.push(w.replaceAll("X", inner));
  const src = `${head}fn mk(x) { () => x }\nexport default component App() {\n  [todos, setTodos] = createStore<any>({ part: { n: 1, part: { m: [2] } }, done: 0 })\n  o = { f: (x) => x }\n  id = (x) => x\n  k = "part"\n  <Run go={() => { setTodos((d) => {\n${all.map((e, i) => `    sink("w${i}", ${e})`).join("\n")}\n    d.done := d.done + 1\n  }) }} />\n  <p>{todos.done}</p>\n}\n`;
  const r = await run("matrix", src);
  let alive = null; try { JSON.stringify(lib.sunk); } catch (e) { alive = e; }
  check(`every way of handing a read of the draft on, and every pair of them (${all.length}): accepted, run, and all of it reads after the revocation`, !r.refused && !r.threw && Object.keys(lib.sunk).length === all.length && alive === null, r.refused ?? r.threw?.stack ?? alive?.message ?? Object.keys(lib.sunk).length);
  check("and the callback still wrote the draft", lib.states[lib.states.length - 1]?.done === 1, lib.states[lib.states.length - 1]);
}
for (const [name, [src, code]] of Object.entries(refused)) {
  const r = await run(`r${++seq}`, src);
  check(`refused (${code}): ${name}`, (r.refused?.diagnostics ?? []).some(d => d.code === code), r.refused ?? "accepted");
}
rmSync(ws, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
