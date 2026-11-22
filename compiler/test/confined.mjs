// CN-7, 09 MO-10k (closed 2026-11-22): the four counterexamples of the fourth review, kept. Each was accepted by both
// checkers and did at run time what its rule says cannot happen; each is now refused — or, for a draft, made a copy —
// and this runs both halves: the verdict of the crate and of ref/ (which must agree), and what the program does when
// it runs. The safe forms beside each are still accepted, and run.
//  - RFC 06: `<Child v={q.valueOf()} />` — an inherited method answers the result itself; the child read `.data`
//    under no boundary and the server's render threw.
//  - RFC 09: `d.items.forEach((row) => { kept.push(row) })` and `d.items.values()` — live rows and a live iterator
//    left the callback; reading them after the library took its draft back threw "proxy revoked".
//  - RFC 17: `({ onSend: props.onSend, t: table }).onSend(table)` — a record that mentions the table was taken for
//    the table, and the parent received it.
//  - RFC 14/34: `box = { read: () => n }; peek box.read()` and `createLabel(box.read())` — a closure kept in a record
//    lost what its body reads, and the value was frozen.
// The probes of this kind that bench/ once held as "mistakes" live here (2026-11-22): they are not what a Solid user
// writes by accident, they are what a review writes to find the edge of a rule.
// Needs what bench/run.mjs needs (the crate, the runtime's build, bench/.out/ws).   node compiler/test/confined.mjs
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { ws, workspace, both, Runner } from "../../bench/harness.mjs";

workspace();
const dir = path.join(ws, "confined"); rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true });
writeFileSync(path.join(dir, "lib.d.rx"), [
  "export pure fn useQuery(): { data: pending fails(Error) string; status: string; refetch: () => void }",
  "export pure fn createStore<T>(init: T): [T, (update: (draft state: T) => T | void) => void]",
  "export pure fn createTable(options: { cell: Component }): { page: number; label: string; nextPage: () => void; setLabel: (text: string) => void; rows: any[] } renders methods(setLabel)",
  "export pure fn makeClock(): any instantiates methods(format)",
  "export pure fn createLabel(text: any): ref string",
  "export component Run(props: { go: handler () => void })",
  "export fn sink(label: string, x: any): void",
  "export fn reverseIt(list: any[]): void",
  "",
].join("\n"));
writeFileSync(path.join(dir, "lib.js"), `
import { createSignal, createMemo } from "solid-js";
export const sunk = {};
export const sink = (label, x) => { sunk[label] = x; };
export const reverseIt = list => { list.reverse(); };
export const Run = props => { props.go(); return ""; };
// a query whose data throws where it is read with no boundary (as @tanstack/solid-query's does)
export const useQuery = () => ({ get data() { throw new Error("query read without boundary"); }, status: "ready", refetch() {} });
// a store whose setter takes its draft back: every object it hands the callback is revoked when the setter returns
export const createStore = init => {
  const state = init;
  const set = f => {
    const revokes = []; const made = new WeakMap(); const targets = new WeakMap();
    const wrap = o => {
      if (o === null || typeof o !== "object") return o;
      if (made.has(o)) return made.get(o);
      const { proxy, revoke } = Proxy.revocable(o, { get: (t, k, r) => { const v = Reflect.get(t, k, r); return typeof v === "function" ? v : wrap(v); }, set: (t, k, v) => Reflect.set(t, k, targets.get(v) ?? v) });
      made.set(o, proxy); targets.set(proxy, o); revokes.push(revoke); return proxy;
    };
    try { f(wrap(state)); } finally { for (const r of revokes) r(); }
  };
  return [state, set];
};
export const createTable = options => { const [page, setPage] = createSignal(1); const [label, setLabel] = createSignal("people"); return { get page() { return page(); }, get label() { return label(); }, nextPage: () => setPage(p => p + 1), setLabel, rows: [{ id: 1 }], cell: options.cell }; };
export const makeClock = () => ({ now: () => Date.now(), format: () => "noon" });
export const createLabel = text => { const made = "[" + text + "]"; return () => made; };
`);
let pass = 0, fail = 0;
const check = (name, ok, got) => { ok ? pass++ : fail++; console.log(`${ok ? "✓" : "✗"} ${name}${ok ? "" : `\n    ${String(typeof got === "string" ? got : JSON.stringify(got)).slice(0, 700)}`}`); };
const head = 'import { useQuery, createStore, createTable, makeClock, createLabel, Run, sink, reverseIt } from "./lib.js"\n';
let seq = 0;
const file = src => { const f = path.join(dir, `p${++seq}.rx`); writeFileSync(f, head + src); return f; };
const show = r => `crate: ${r.crate.diagnostics.map(d => d.code).join(",") || "accepted"} / ref: ${r.ref.diagnostics.map(d => d.code).join(",") || "accepted"}`;
/** Refused by both checkers, alike, with `code`. */
const refused = (name, code, src) => { const r = both(file(src)); check(`refused (${code}): ${name}`, r.agree && r.crate.diagnostics.some(d => d.code === code) && r.ref.diagnostics.some(d => d.code === code), show(r)); };
/** Accepted by both checkers; returns a runner for its compiled program. */
const accepted = (name, src) => { const f = file(src); const r = both(f); const ok = r.agree && !r.crate.diagnostics.length && !r.ref.diagnostics.length; check(`accepted: ${name}`, ok, `${show(r)} ${r.crate.diagnostics.map(d => d.message).join(" | ").slice(0, 400)}`); return ok ? new Runner(dir, path.basename(f)) : null; };
const lib = await import(pathToFileURL(path.join(dir, "lib.js")).href);

// ---------------------------------------------------------------- RFC 06: a result with held fields
const kid = "component Child(props: { v: any }) { <p>{props.v.data}</p> }\ncomponent Plain(props: { v: any }) { <p class=\"v\">{props.v}</p> }\n";
const q = body => `${kid}export default component App() {\n  q = useQuery()\n${body}\n}\n`;
refused("the result answered by an inherited method, read by a child", "RESULT_AS_VALUE", q("  <Child v={q.valueOf()} />"));
refused("…by toJSON", "RESULT_AS_VALUE", q("  <Child v={q.toJSON()} />"));
refused("…by a key in brackets", "RESULT_AS_VALUE", q('  <Child v={q["valueOf"]()} />'));
refused("…by a computed key, called", "RESULT_AS_VALUE", q('  source k := "valueOf"\n  <Child v={q[k]()} />'));
refused("…through another name for the result", "RESULT_AS_VALUE", q("  r = q\n  <Child v={r.valueOf()} />"));
{ // what the refusal is for: the same read where no check looks ends the server's render
  let threw = null; try { const r = lib.useQuery(); void r.valueOf().data; } catch (e) { threw = e; }
  check("unchecked, that read throws where it is read (what the server's render did)", threw?.message === "query read without boundary", threw);
}
{ const h = accepted("a field that neither holds nor fails, passed to a child", q("  <Plain v={q.status} />"));
  if (h) { const r = await h.ssr("/"); check("…and the server renders it", !r.error && /ready/.test(r.text), r.error?.message ?? r.text); await h.close(); } }
{ const h = accepted("a declared function field, called from a handler", q("  <Plain v={q.status} />\n  <button onClick={() => { q.refetch() }}>again</button>"));
  if (h) { const r = await h.ssr("/"); check("…and the server renders it", !r.error && /ready/.test(r.text), r.error?.message ?? r.text); await h.close(); } }

// ---------------------------------------------------------------- RFC 09: a library's draft
const store = body => `export default component App() {\n  [todos, setTodos] = createStore<{ items: { n: number }[] }>({ items: [{ n: 0 }] })\n  <Run go={() => { ${body} }} />\n}\n`;
const draft = async (name, body, after) => {
  const h = accepted(name, store(body)); if (!h) return;
  for (const k of Object.keys(lib.sunk)) delete lib.sunk[k];
  const r = await h.ssr("/");
  // lib.js is one module for the test and the program: what the program sank is read here, after the setter returned
  let got, threw = r.error; try { got = after(lib.sunk); } catch (e) { threw = e; }
  check(`…and what left the callback is read after the library took its draft back: ${JSON.stringify(got)}`, !threw && got !== false, threw?.message ?? got);
  await h.close();
};
await draft("rows a forEach callback kept", 'let kept = []; setTodos((d) => { d.items.forEach((row) => { kept.push(row) }) }); sink("row", kept[0])', s => s.row.n === 0 && s.row);
await draft("the draft's iterator", 'setTodos((d) => { sink("iter", d.items.values()) })', s => { const xs = [...s.iter]; return xs.length === 1 && xs[0].n === 0 && xs; });
await draft("an iterator held in a local, stepped later", 'let its = []; setTodos((d) => { let it = d.items.values(); its.push(it) }); sink("first", its[0].next().value)', s => s.first.n === 0 && s.first);
await draft("what map and find answer", 'setTodos((d) => { sink("mapped", d.items.map((row) => row)); sink("found", d.items.find((row) => row.n == 0)) })', s => s.mapped[0].n === 0 && s.found.n === 0 && [s.mapped, s.found]);
await draft("a loop that adds to the list it loops over visits what was there when it started", 'setTodos((d) => { for (const row of d.items) { if (len(d.items) < 3) { d.items.push({ n: 7 }) }; row.n := 1 } }); sink("items", todos.items)', s => JSON.stringify(s.items) === '[{"n":1},{"n":7}]' && s.items);
await draft("a loop over the draft writes it (the safe form)", 'setTodos((d) => { for (const row of d.items) { row.n := 5 } }); sink("items", todos.items)', s => s.items[0].n === 5 && s.items);
await draft("a callback of the draft's own method writes its rows", 'setTodos((d) => { d.items.forEach((row) => { row.n := 9 }) }); sink("items", todos.items)', s => s.items[0].n === 9 && s.items);
refused("a function made elsewhere, given to a draft's forEach", "DRAFT_ESCAPES", store('let kept = []; let keep = (row) => { kept.push(row) }; setTodos((d) => { d.items.forEach(keep) })'));
refused("a method of the draft that is not plain data's", "DRAFT_ESCAPES", store('setTodos((d) => { d.items.each((row) => { sink("row", row) }) })'));
refused("a bound method of the draft", "DRAFT_ESCAPES", store('setTodos((d) => { sink("push", d.items.push.bind(d.items)) })'));
refused("a closure in a forEach callback that names the row later", "DRAFT_ESCAPES", store('let later = []; setTodos((d) => { d.items.forEach((row) => { later.push(() => row) }) })'));
{ // what the copies are for: the same rows, kept where nothing copies, are the library's revoked proxies
  const [, set] = lib.createStore({ items: [{ n: 0 }] }); const kept = []; set(d => { d.items.forEach(row => { kept.push(row); }); });
  let threw = null; try { void kept[0].n; } catch (e) { threw = e; }
  check("unchecked, a row kept by a forEach callback is a revoked proxy", /revoked/.test(threw?.message ?? ""), threw);
}

{ // MO-10i (2026-11-22): a JS fn that is lent a copy of a draft and changes it. The change would be lost; in a development
  // build it is refused where it is made, by an error that names the missing word — never a silent no-op
  const h = accepted("a JS fn whose parameter is not `draft`, given a read of the draft", `export default component App() {\n  [todos, setTodos] = createStore<{ items: { n: number }[] }>({ items: [{ n: 0 }, { n: 1 }] })\n  <button class="b" onClick={() => { setTodos((d) => { reverseIt(d.items) }) }}>go</button>\n}\n`);
  if (h) {
    const base = await h.serve(); const page = await h.open(base);
    await page.click(".b"); await new Promise(r => setTimeout(r, 200));
    check("…changing what it was lent is an error in a development build, and says which word is missing", h.problems.some(p => /reverseIt\(…\) changed what it was given/.test(p) && /`draft`/.test(p)), h.problems);
    await h.close();
  }
}

// ---------------------------------------------------------------- RFC 17: a `renders` value
const grid = (body, app = '<Grid onSend={(x) => { sink("sent", x) }} />') => `component Cell() { <p>cell</p> }\ncomponent Btn(props: { onPress: () => void; text: string; n: number }) { <button class="b" onClick={() => { props.onPress() }}>{props.text} {props.n}</button> }\ncomponent Grid(props: { onSend: (x: any) => void }) {\n  table = createTable({ cell: Cell })\n${body}\n}\nexport default component App() {\n  ${app}\n}\n`;
refused("the table sent up through a callback kept in a record", "RENDERS_ESCAPES", grid("  <Run go={() => { ({ onSend: props.onSend, t: table }).onSend(table) }} />"));
refused("…kept in a record that has a name", "RENDERS_ESCAPES", grid("  box = { onSend: props.onSend, t: table }\n  <Run go={() => { box.onSend(table) }} />"));
refused("…kept in an array", "RENDERS_ESCAPES", grid("  <Run go={() => { [props.onSend, table][0](table) }} />"));
refused("…through a method the declaration does not name, given a row", "RENDERS_ESCAPES", grid("  <Run go={() => { table.rows.push(table) }} />\n  <Btn onPress={() => { props.onSend(table.rows) }} text=\"x\" n={1} />"));
{ // what the refusal is for
  const sent = []; const props = { onSend: x => sent.push(x) }; const table = lib.createTable({ cell: () => "" });
  ({ onSend: props.onSend, t: table }).onSend(table);
  check("unchecked, the parent receives the table itself", sent[0] === table, sent);
}
{ const h = accepted("the table's method called from a handler a child is given; a declared scalar field and a declared method's argument", grid('  <Btn onPress={() => { table.nextPage() }} text={table.label} n={table.page} />\n  <button class="rename" onClick={() => { table.setLabel(`${table.label}!`) }}>rename</button>'));
  if (h) {
    const base = await h.serve(); const page = await h.open(base);
    check("…mounted: the child shows the table's scalars", await h.until(async () => /people 1/.test(await h.text(page))), await h.text(page));
    await page.click(".b"); await page.click(".rename");
    check("…and they follow the table", await h.until(async () => /people! 2/.test(await h.text(page))), await h.text(page));
    check("…with no console errors", h.problems.length === 0, h.problems);
    await h.close();
  } }

// ---------------------------------------------------------------- RFC 14, RFC 34: what is read once
const clock = body => `export default component App() {\n  source n := 0\n  clock = makeClock()\n${body}\n  <button class="b" onClick={() => { n := n + 1 }}>add</button>\n}\n`;
refused("a closure kept in a record, read under a kept peek", "SNAPSHOT_KEPT", clock("  box = { read: () => n }\n  result = peek box.read()\n  <p>{result}</p>"));
refused("…given to a value parameter", "SNAPSHOT_ARGUMENT", clock("  box = { read: () => n }\n  result = createLabel(box.read())\n  <p>{result}</p>"));
refused("…kept in an array", "SNAPSHOT_ARGUMENT", clock("  fs = [() => n]\n  result = createLabel(fs[0]())\n  <p>{result}</p>"));
refused("…read out of an array written where it is called (a record's formatter)", "SNAPSHOT_ARGUMENT", clock("  box = { read: () => n }\n  result = createLabel([box.read][0]())\n  <p>{result}</p>"));
refused("…through a closure that returns it", "SNAPSHOT_ARGUMENT", clock("  mk = () => () => n\n  result = createLabel(mk()())\n  <p>{result}</p>"));
refused("…a record reached through another name", "SNAPSHOT_KEPT", clock("  box = { read: () => n }\n  again = box\n  result = peek again.read()\n  <p>{result}</p>"));
refused("a method of the instance its declaration does not name, in a record's closure", "SNAPSHOT_ARGUMENT", clock("  box = { read: () => clock.now() }\n  result = createLabel(box.read())\n  <p>{result}</p>"));
{ const h = accepted("the same closure read live; a declared method; a literal's own slot; another field of the record", clock('  box = { read: () => n, unit: () => "clicks" }\n  made = createLabel(clock.format())\n  slot = createLabel([clock, 5][1])\n  unit = createLabel(box.unit())\n  <p class="live">{box.read()} {made} {slot} {unit}</p>'));
  if (h) {
    const base = await h.serve(); const page = await h.open(base);
    check("…mounted", await h.until(async () => /0 \[noon\] \[5\] \[clicks\]/.test(await h.text(page))), await h.text(page));
    await page.click(".b"); await page.click(".b");
    check("…the live read follows the source (a kept peek of it would have shown 0 for ever); what was made once is as it was", await h.until(async () => /2 \[noon\] \[5\] \[clicks\]/.test(await h.text(page))), await h.text(page));
    await h.close();
  } }

// ---------------------------------------------------------------- RFC 18: a router rendered at a known outlet
writeFileSync(path.join(dir, "tsr.d.rx"), [
  "export context router",
  "export pure fn createRootRoute(options: { component?: Component }): any renders(later) methods(addChildren)",
  "export pure fn createRoute(options: { getParentRoute: () => any; path: string; component?: Component }): any renders(later) methods(addChildren) nests(component under getParentRoute)",
  "export pure fn createRouter(options: { routeTree: any }): any instantiates",
  "export component RouterProvider(props: { router: renders any }) provides(router)",
  "export component Outlet(props: {}) uses(router) outlet",
  "export pure fn useParams(opts: { from: string }): ref any uses(router)",
  "export error NotFound",
  "export pure fn fetchPerson(id: string): Promise<{ name: string }> rejects(NotFound)",
  "",
].join("\n"));
const routes = app => `import { createRootRoute, createRoute, createRouter, RouterProvider, Outlet, useParams, fetchPerson, NotFound } from "./tsr.js"
component Root() {
  errored fallback(e: NotFound) { <p>{e.message}</p> } {
    loading fallback { <p>loading…</p> } { <main><Outlet /></main> }
  }
}
component Person() {
  params = useParams({ from: "/people/$id" })
  person = await fetchPerson(params.id)
  <h1>{person.name}</h1>
}
rootRoute = createRootRoute({ component: Root })
personRoute = createRoute({ getParentRoute: () => rootRoute, path: "/people/$id", component: Person })
router = createRouter({ routeTree: rootRoute.addChildren([personRoute]) })
${app}
`;
const plain = src => { const f = path.join(dir, `p${++seq}.rx`); writeFileSync(f, src); return both(f); };
{ const r = plain(routes("export default component App() {\n  <RouterProvider router={router} />\n}"));
  check("accepted: a router rendered at its provider, its pages at the root's outlet under the root's boundaries", r.agree && !r.crate.diagnostics.length && !r.ref.diagnostics.length, show(r)); }
{ const r = plain(routes("component Host(props: { r: any }) { <RouterProvider router={props.r} /> }\nexport default component App() {\n  <Host r={router} />\n}"));
  check("accepted: the same router given to the provider through the app's own component (a prop given on)", r.agree && !r.crate.diagnostics.length && !r.ref.diagnostics.length, show(r)); }
{ const r = plain(routes("component Host(props: { r: any }) { <RouterProvider router={props.r} /> }\nexport default component App() {\n  <Host r={router} />\n}").replace("errored fallback(e: NotFound) { <p>{e.message}</p> } {\n    loading fallback { <p>loading…</p> } { <main><Outlet /></main> }\n  }", "loading fallback { <p>loading…</p> } { <main><Outlet /></main> }"));
  check("refused (UNHANDLED_FAILURE): …and a page that can fail with no boundary at the outlet is still refused through it", r.agree && r.crate.diagnostics.some(d => d.code === "UNHANDLED_FAILURE") && r.ref.diagnostics.some(d => d.code === "UNHANDLED_FAILURE"), show(r)); }

rmSync(dir, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
