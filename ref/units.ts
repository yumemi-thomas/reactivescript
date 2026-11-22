// Unit checks for what the scenarios cannot reach (the crate holds the same cases as #[test]s, under the same names).
// Run by run.ts after the scenarios; exits non-zero on the first failure.
import { deepStrictEqual } from "node:assert";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { readDisk } from "./disk.ts";
import { packageRelative, besideDeclaration } from "./src/modules.ts";
import { looksLikeTypes, parseProgram, parseDeclarations } from "./src/parse.ts";
import { loadModules } from "./src/modules.ts";
import { checkModules, tyStep, tyScalar } from "./src/check.ts";

const files = (fs: Record<string, string>) => (p: string) => fs[p];

// ---- MO-10k (ruled 2026-11-22): the guarantees, over every way a value is handed on ----
// Not a list of cases: each confined value is put through every wrapper below and every pair of them (one inside the
// other), and each result into every way out. The crate runs the same matrix (`check.rs`, the tests of these names).
const LIB = "export pure fn createTable(ref options: { columns: { cell: Component }[] }): any renders\nexport pure fn flexRender(comp: any, props: any): any\nexport fn stashJs(x: any): void\nexport pure fn createClock(): any instantiates methods(format)\nexport pure fn createLabel(width: number): any instantiates\nexport pure fn useQ(): { data: pending fails(Error) any; isFetching: boolean }\nexport pure fn createStore<T>(init: T): [T, (update: (draft state: T) => T | void) => void]\nexport fn later(f: handler () => void): void\n";
/** The ways an expression hands a value on: `X` is the value. */
const WRAPS = [
  "X", "[X]", "[X][0]", "({ a: X })", "({ a: X }).a", "keep(X)", "keep(keep(X))", "id(id(X))", "o.f(X)", "[(y) => y][0](X)", "(true ? keep : keep)(X)", "mk(X)()",
  "(() => X)()", "[].concat([X])", "[].concat([X])[0]", "(true ? X : null)", "(X ?? null)", "(X || null)", "map([X], (y) => y)", "map([X], (y) => y)[0]",
  "filter([X], (y) => true)", "[X, 1].filter((y) => true)", "[...[X]]", "({ ...({ a: X }) })", "X.part", "X[\"part\"]", "X[k]", "(peek X)",
];
function wrapped(of: string): string[] {
  const one = WRAPS.map(w => w.replaceAll("X", of)); const out = [...one];
  for (const w of WRAPS) for (const inner of one.slice(1)) out.push(w.replaceAll("X", inner));
  return out;
}
function codesOf(main: string): string[] {
  const src = `import { createTable, flexRender, stashJs, createClock, createLabel, useQ, createStore, later } from "./lib.js"\nfn keep(x) { x }\nfn mk(x) { () => x }\nsource held: any := null\ncontext ctx: any\ncomponent Cell() { <b>c</b> }\ncomponent Grid(props: { t: any }) { <button onClick={() => { held := props.t }}>ok</button> }\n${main}`;
  const set = loadModules("/app.rx", p => p === "/app.rx" ? src : p === "/lib.d.rx" ? LIB : undefined);
  return checkModules(set).diags.map(d => d.code);
}
const LOCALS = "  o = { f: (x) => x }\n  id = (x) => x\n  k = \"part\"\n";
const must = (ok: boolean, what: string, src: string) => { if (!ok) throw new Error(`${what}:\n${src}`); };
export const units: [string, () => void][] = [
  ["a_renders_value_leaves_through_no_way_out", () => {   // MO-11l
    const outs = ["  <Grid t={E} />", "  <Grid t={() => E} />", "  provide ctx = E\n  <p>x</p>", "  <button onClick={() => { held := E }}>x</button>", "  <button onClick={() => { stashJs(E) }}>x</button>", "  v = true ? throw E : 1\n  <p>x</p>"];
    for (const e of wrapped("table")) {
      for (const out of outs) { const src = `export default component App() {\n  table = createTable({ columns: [{ cell: Cell }] })\n${LOCALS}${out.replaceAll("E", e)}\n}\n`; must(codesOf(src).includes("RENDERS_ESCAPES"), "accepted", src); }
      const src = `table = createTable({ columns: [{ cell: Cell }] })\no = { f: (x) => x }\nid = (x) => x\nk = "part"\nexport out = ${e}\nexport default component App() {\n  <p>x</p>\n}\n`;
      must(codesOf(src).includes("RENDERS_ESCAPES"), "accepted", src);
    }
  }],
  ["a_primitive_made_of_a_renders_value_leaves", () => {   // MO-11l: the rule refuses values, not mentions
    const prims = ["len(E)", "str(E)", "E == null", "!E", "`${E}`", "(E ? 1 : 2)", "len(E) + 1"];
    // (a call of a function the checker cannot name is refused itself, whatever is made of its result)
    for (const e of wrapped("table").slice(0, WRAPS.length).filter(e => !["o.f(", "[0](", "? keep", "concat"].some(u => e.includes(u)))) for (const p of prims) {
      const v = p.replaceAll("E", e);
      const src = `export default component App() {\n  table = createTable({ columns: [{ cell: Cell }] })\n${LOCALS}  provide ctx = ${v}\n  <Grid t={${v}} />\n  <Grid t={() => { table.next() }} />\n}\n`;
      must(!codesOf(src).includes("RENDERS_ESCAPES"), "refused", src);
    }
  }],
  ["a_read_through_what_may_be_an_instance_changes", () => {   // E-10, E-5a
    for (const e of wrapped("clock")) for (const [read, code] of [["createLabel(E.now())", "SNAPSHOT_ARGUMENT"], ["createLabel(E.size)", "SNAPSHOT_ARGUMENT"], ["peek E.now()", "SNAPSHOT_KEPT"]]) {
      const src = `export default component App() {\n  clock = createClock()\n${LOCALS}  label = ${read.replaceAll("E", e)}\n  <p>{label}</p>\n}\n`;
      must(codesOf(src).includes(code), `accepted (${code})`, src);
    }
    const src = `export default component App() {\n  clock = createClock()\n  c = clock\n${LOCALS}  a = createLabel(clock.format())\n  b = createLabel(c.format())\n  d = peek clock.format()\n  <p>{a} {b} {d}</p>\n}\n`;
    deepStrictEqual(codesOf(src), []);
  }],
  ["a_result_with_held_fields_is_never_a_value", () => {   // MO-10f
    // a field read out of it by a path (`orig.part`) is a value like any other: every other way of handing it on
    for (const e of wrapped("orig").filter(e => !["orig.part", "orig[\"part\"]", "orig[k]"].some(p => e.includes(p)))) for (const out of ["  <Grid t={E} />", "  y = [E]\n  <p>x</p>", "  <button onClick={() => { held := E }}>x</button>", "  provide ctx = E\n  <p>x</p>"]) {
      const src = `export default component App() {\n  orig = useQ()\n${LOCALS}${out.replaceAll("E", e)}\n}\n`;
      must(codesOf(src).includes("RESULT_AS_VALUE"), "accepted", src);
    }
    deepStrictEqual(codesOf("export default component App() {\n  orig = useQ()\n  q = orig\n  <p>{q.isFetching ? 1 : 2} {orig == null} {!orig}</p>\n  <Grid t={orig.isFetching} />\n}\n"), []);
  }],
  ["a_draft_is_named_only_in_its_callback", () => {   // MO-10i
    const store = "  [todos, setTodos] = createStore<{ done: number }>({ done: 0 })\n";
    for (const e of wrapped("d")) {
      let src = `export default component App() {\n${store}${LOCALS}  <button onClick={() => { setTodos((d) => { later(() => { held := ${e} }) }) }}>x</button>\n}\n`;
      must(codesOf(src).includes("DRAFT_ESCAPES"), "accepted", src);
      src = `export default component App() {\n${store}${LOCALS}  <button onClick={() => { setTodos((d) => { held := ${e}; let v = ${e}; later(() => { held := v }) }) }}>x</button>\n}\n`;
      must(codesOf(src).includes("DRAFT_ESCAPES") === e.includes("(() =>"), "a read of the draft in its callback is a copy", src);
    }
  }],
  ["each_confined_value_has_a_closed_set_of_operations", () => {   // MO-10k (closed 2026-11-22); mirrors the crate's test
    const LIB2 = "export pure fn useQ(): { data: pending fails(Error) any; isFetching: boolean; refetch: () => void; inner: { more: pending any; n: number } }\nexport pure fn createStore<T>(init: T): [T, (update: (draft state: T) => T | void) => void]\nexport pure fn createTable(ref options: { columns: { cell: Component }[] }): { label: string; count: () => number; rows: { id: string; cells: any[] }[]; setPage: (n: any) => void; meta: any } renders methods(setPage)\nexport pure fn createClock(): any instantiates methods(format)\nexport pure fn createLabel(width: any): any instantiates\nexport fn later(f: handler () => void): void\nexport fn stashJs(x: any): void\n";
    const run = (main: string): string[] => {
      const src = `import { useQ, createStore, createTable, createClock, createLabel, later, stashJs } from "./lib.js"\nsource held: any := null\nsource n := 0\ncomponent Cell() { <b>c</b> }\ncomponent Grid(props: { t: any; onF: (x: any) => void }) { <button onClick={() => { held := props.t }}>ok</button> }\n${main}`;
      return checkModules(loadModules("/app.rx", p => p === "/app.rx" ? src : p === "/lib.d.rx" ? LIB2 : undefined)).diags.map(d => d.code);
    };
    // MO-10f: what is read from a result with held fields is a field its declaration names
    for (const m of ["valueOf", "toJSON", "toString", "hasOwnProperty", "constructor", "part"]) for (const read of ["orig.M()", "orig[\"M\"]()", "orig.M", "q.M()", "orig.inner.M()", "orig.inner.M"]) {
      const src = `export default component App() {\n  orig = useQ()\n  q = orig\n  k = "valueOf"\n  <Grid t={${read.replaceAll("M", m)}} onF={(x) => {}} />\n}\n`;
      must(run(src).includes("RESULT_AS_VALUE"), "accepted", src);
    }
    let src = "export default component App() {\n  orig = useQ()\n  k = \"valueOf\"\n  <Grid t={orig[k]()} onF={(x) => {}} />\n}\n";
    must(run(src).includes("RESULT_AS_VALUE"), "accepted", src);
    deepStrictEqual(run("export default component App() {\n  orig = useQ()\n  <Grid t={orig.isFetching} onF={(x) => { orig.refetch() }} />\n  <p>{orig.inner.n}</p>\n}\n"), []);
    // MO-10i: what is called on a draft is a method of plain data, by name; a function it calls is a closure written there
    const store = "  [todos, setTodos] = createStore<{ items: { n: number }[] }>({ items: [] })\n";
    for (const body of ["d.items.forEach(keep)", "d.items.map(keep)", "d.items.sort(keep)", "d.items.each((x) => x)", "d.items.push.bind(d.items)", "d.valueOf.call(d)", "d.items[\"forEach\"](keep)", "d.items[m]((x) => x)", "d.items.forEach((row) => { later(() => { held := row }) })", "d.items.slice(0).forEach(keep)"]) {
      src = `export default component App() {\n${store}  <button onClick={() => { let keep = (x) => { held := x }; let m = "forEach"; setTodos((d) => { ${body} }) }}>x</button>\n}\n`;
      must(run(src).includes("DRAFT_ESCAPES"), "accepted", src);
    }
    deepStrictEqual(run(`export default component App() {\n${store}  <button onClick={() => { setTodos((d) => { d.items.forEach((row) => { held := row; row.n := 1 }); held := d.items.values(); held := d.items.map((row) => row).filter((row) => row.n > 0); d.items.push({ n: 1 }); d.items.sort((a, b) => a.n - b.n); held := d.items.valueOf() }) }}>x</button>\n}\n`), []);
    // MO-11l: a method keeps nothing only when the declaration names it and it is called on the value's own name
    for (const call of ["({ f: props.onF, t: table }).f(table)", "[props.onF, table][0](table)", "box.f(table)", "table.meta.f(table)", "table.rows.push(table)", "table.other(table.rows)", "alias.f(table.rows[0])"]) {
      src = `component Host(props: { onF: (x: any) => void }) {\n  table = createTable({ columns: [{ cell: Cell }] })\n  box = { f: props.onF, t: table }\n  alias = box\n  <button onClick={() => { ${call} }}>x</button>\n}\nexport default component App() {\n  <Host onF={(x) => { held := x }} />\n}\n`;
      must(run(src).includes("RENDERS_ESCAPES"), "accepted", src);
    }
    // …and a declared method on its own name, a declared scalar, a primitive made of a part are free
    deepStrictEqual(run("component Host(props: { onF: (x: any) => void }) {\n  table = createTable({ columns: [{ cell: Cell }] })\n  <button onClick={() => { table.setPage(table.rows); props.onF(table.label); props.onF(table.count()); props.onF(table.rows[0].id); props.onF(len(table.rows)) }}>x</button>\n  <Grid t={table.label} onF={(x) => {}} />\n  {for row in table.rows { <Grid t={row.id} onF={(x) => {}} /> }}\n}\nexport default component App() {\n  <Host onF={(x) => { held := x }} />\n}\n"), []);
    // …but an undeclared field of it, or a part whose type is not a primitive's, is the value's
    for (const arg of ["table.meta", "table.rows[0]", "table.rows[0].cells", "table.rows", "table.other"]) {
      src = `component Host(props: { onF: (x: any) => void }) {\n  table = createTable({ columns: [{ cell: Cell }] })\n  <Grid t={${arg}} onF={(x) => {}} />\n}\nexport default component App() {\n  <Host onF={(x) => {}} />\n}\n`;
      must(run(src).includes("RENDERS_ESCAPES"), "accepted", src);
    }
    // E-10, E-5a: a closure kept in a value reads, when it is called, what its body reads
    for (const holder of ["box.read()", "fs[0]()", "mk()()", "again.read()", "({ read: () => n }).read()", "[() => n][0]()", "pick.any()", "boxes[0].read()"]) for (const [read, code] of [["createLabel(E)", "SNAPSHOT_ARGUMENT"], ["peek E", "SNAPSHOT_KEPT"]]) {
      src = `export default component App() {\n  box = { read: () => n }\n  fs = [() => n]\n  mk = () => () => n\n  again = box\n  pick = true ? box : { any: () => 1 }\n  boxes = [box]\n  label = ${read.replaceAll("E", holder)}\n  <p onClick={() => { n := n + 1 }}>{label}</p>\n}\n`;
      must(run(src).includes(code), `accepted (${code})`, src);
    }
    // …and a slot the expression itself names is that slot: another field, a literal's own item
    deepStrictEqual(run("export default component App() {\n  clock = createClock()\n  box = { read: () => n, unit: () => \"u\" }\n  a = createLabel(box.unit())\n  b = createLabel([clock, 5][1])\n  c = createLabel({ a: clock, b: 5 }.b)\n  d = peek [() => n, () => 1][1]()\n  <p onClick={() => { n := n + 1 }}>{a} {b} {c} {d} {box.read()}</p>\n}\n"), []);
  }],
  ["a_declared_type_is_read_a_step_at_a_time", () => {   // MO-10k: `tyStep`, `tyScalar`
    const t = "{ label: string; count: () => number; rows: { id: string; cells: any[] }[]; state?: { page: number } | undefined; get: (k: string) => readonly (\"a\" | \"b\")[] }";
    const f = (k: string) => ({ field: k });
    deepStrictEqual(tyStep(t, f("label")), "string");
    deepStrictEqual(tyStep(tyStep(t, f("count"))!, "call"), "number");
    const row = tyStep(tyStep(t, f("rows"))!, "elem")!;
    deepStrictEqual([tyStep(row, f("id")), tyScalar(tyStep(row, f("cells"))!)], ["string", false]);
    deepStrictEqual(tyStep(tyStep(t, f("state"))!, f("page")), "number");
    deepStrictEqual(tyScalar(tyStep(tyStep(tyStep(t, f("get"))!, "call")!, "elem")!), true);
    deepStrictEqual(tyStep(t, f("valueOf")), undefined);
    deepStrictEqual(["any", "Row", "string | Row", "{ a: string }", "() => string", "string[]"].map(tyScalar), [false, false, false, false, false, false]);
    deepStrictEqual(["string", "number | undefined", "\"a\" | \"b\"", "boolean | null", "(string)", "1 | 2"].map(tyScalar), [true, true, true, true, true, true]);
  }],
  ["a_wire_id_is_the_declarations_own_place", () => {   // SV-5a (ruled 2026-11-22)
    let read = files({ "/w/app/package.json": `{"name":"shop"}`, "/w/app/a/package.json": `{"type":"module"}` });
    deepStrictEqual(packageRelative("/w/app/a/err.d.rx", read), "shop/a/err.d.rx");
    deepStrictEqual(packageRelative("/w/app/src/err.d.rx", read), "shop/src/err.d.rx");
    read = files({ "/w/app/package.json": `{"type":"module"}`, "/w/app/web/package.json": `{"type":"module"}`, "/w/app/server/package.json": `{"type":"module"}` });
    deepStrictEqual([packageRelative("/w/app/web/err.d.rx", read), packageRelative("/w/app/server/err.d.rx", read), packageRelative("/w/app/shared/err.d.rx", read)], ["err.d.rx", "err.d.rx", "shared/err.d.rx"]);
    read = files({ "/home/u/package.json": "{}", "/home/u/work/proj/package.json": `{"type":"module"}` });
    deepStrictEqual(packageRelative("/home/u/work/proj/err.d.rx", read), "err.d.rx");
    read = files({});
    deepStrictEqual([packageRelative("/w/x/err.d.rx", read), packageRelative("a/err.d.rx", read)], ["err.d.rx", "err.d.rx"]);
    read = files({ "/w/app/package.json": "{}" });
    deepStrictEqual(packageRelative("/w/x/err.d.rx", read), "err.d.rx");
  }],
  ["a_wire_id_holds_no_machine_path_and_no_checkout_name", () => {   // SV-5a
    for (const root of ["/private/tmp/x/my-app", "/home/ci/build-101", "/Users/a/dev/proj"]) {
      const read = files({ [`${root}/package.json`]: `{"type":"module","private":true}` });
      deepStrictEqual(packageRelative(`${root}/err.d.rx`, read), "err.d.rx");
      deepStrictEqual(packageRelative(`${root}/lib/err.d.rx`, read), "lib/err.d.rx");
    }
  }],
  ["a_wire_id_does_not_depend_on_the_entry_and_two_classes_never_share_one", () => {   // SV-5a (ruled 2026-11-22)
    const D = "export error Gone\nexport pure fn load(id: string): Promise<string> rejects(Gone)\n";
    const MAIN = "export default component App() {\n  errored fallback(e: Gone) { <p>gone</p> } {\n    loading fallback { <p>…</p> } {\n      v = await load(\"1\")\n      <p>{v}</p>\n    }\n  }\n}\n";
    const fs: Record<string, string> = {
      "/w/app/package.json": `{"type":"module"}`, "/w/app/web/package.json": `{"type":"module"}`, "/w/app/server/package.json": `{"type":"module"}`,
      "/w/app/web/err.d.rx": D, "/w/app/server/err.d.rx": D,
      "/w/app/main.rx": `import { load, Gone } from "./web/err.js"\n${MAIN}`,
      "/w/app/web/main.rx": `import { load, Gone } from "./err.js"\n${MAIN}`,
      "/w/app/server/main.rx": `import { load, Gone } from "../web/err.js"\n${MAIN}`,
      "/w/app/server/both.rx": `import { load, Gone } from "../web/err.js"\nimport { Gone as Gone2 } from "./err.js"\n${MAIN}`,
    };
    deepStrictEqual(["/w/app/main.rx", "/w/app/web/main.rx", "/w/app/server/main.rx"].map(e => loadModules(e, files(fs)).declarationIds!.get("/w/app/web/err.d.rx")), ["err.d.rx", "err.d.rx", "err.d.rx"]);
    let err: any; try { loadModules("/w/app/server/both.rx", files(fs)); } catch (e) { err = e; }
    deepStrictEqual([err?.code, /"err\.d\.rx#Gone"/.test(err?.message), /\/w\/app\/web\/err\.d\.rx/.test(err?.message), /"name"/.test(err?.message)], ["DUPLICATE_WIRE_ID", true, true, true]);
    const set = loadModules("/w/app/server/both.rx", files({ ...fs, "/w/app/web/package.json": `{"name":"web"}` }));
    deepStrictEqual([set.declarationIds!.get("/w/app/web/err.d.rx"), set.declarationIds!.get("/w/app/server/err.d.rx")], ["web/err.d.rx", "err.d.rx"]);
  }],
  ["type_arguments_with_a_brace_in_a_string", () => {   // R4 (RFC 11): the crate's type_arguments_are_parsed_completely cases
    for (const t of ["`x${\"}\"}`", "`x${'}'}`", "`x${`}`}`", "`x${\"{\"}`", "{ k: `x${\"}\"}` }", "\"}\""]) deepStrictEqual([t, looksLikeTypes(t)], [t, true]);
    for (const t of ["`x${\"}\" + 1}`", "`x${\"}\"`"]) deepStrictEqual([t, looksLikeTypes(t)], [t, false]);
  }],
  ["a_brace_in_a_string_type_argument_keeps_the_call", () => {   // R4
    for (const [src, targs] of [["x = f<`k${\"}\"}`>(1)\n", "`k${\"}\"}`"], ["x = f<\"}\">(1)\n", "\"}\""], ["x = f<{ a: `${'}'}` }>(1)\n", "{ a: `${'}'}` }"]]) {
      const json = JSON.stringify(parseProgram(src));
      if (!json.includes(`"targs":${JSON.stringify(targs)}`)) throw new Error(`${src}: ${json}`);
    }
  }],
  ["a_relative_js_import_is_declared_by_its_whole_name_then_its_stem", () => {   // MO-8a
    let read = files({ "/w/old.cjs.d.rx": "", "/w/old.d.rx": "", "/w/v.d.rx": "", "/w/lib.d.rx": "" });
    deepStrictEqual(["./old.cjs", "./v.jsx", "./lib.mjs", "./lib.js", "./api"].map(f => besideDeclaration("/w/main.rx", f, read)), ["/w/old.cjs.d.rx", "/w/v.d.rx", "/w/lib.d.rx", "/w/lib.d.rx", "/w/api.d.rx"]);
    read = files({ "/w/v.jsx.d.rx": "" });
    deepStrictEqual(["./v.jsx", "./old.cjs"].map(f => besideDeclaration("/w/main.rx", f, read)), ["/w/v.jsx.d.rx", "/w/old.d.rx"]);
    read = files({ "/w/x.d.rx": "", "/w/y.tsx.d.rx": "", "/w/y.d.rx": "", "/w/z.d.rx": "" });   // TypeScript's are JavaScript's (RFC 23)
    deepStrictEqual(["./x.tsx", "./y.tsx", "./z.mts", "./z.cts"].map(f => besideDeclaration("/w/main.rx", f, read)), ["/w/x.d.rx", "/w/y.tsx.d.rx", "/w/z.d.rx", "/w/z.d.rx"]);
  }],
  ["a_prop_that_keeps_what_it_is_given_is_no_way_out", () => {   // MO-11l (2026-11-22): mirrors the crate's test
    const run = (comps: string, app: string) => {
      const src = `import { createTable, flexRender, stashJs, later } from "./lib.js"\nfn keep(x) { x }\nfn mk(x) { () => x }\nsource held: any := null\ncontext ctx: any\ncomponent Cell() { <b>c</b> }\n${comps}\nexport default component App() {\n  table = createTable({ columns: [{ cell: Cell }] })\n${LOCALS}${app}\n}\n`;
      const set = loadModules("/app.rx", p => p === "/app.rx" ? src : p === "/lib.d.rx" ? LIB : undefined);
      return checkModules(set).diags.map(d => d.code);
    };
    const keeps = [
      "component Kid(props: { t: any }) { <p>{flexRender(props.t.cell, {})} {len(props.t.rows)}</p> }",
      "component Kid(props: { t: any }) { <button onClick={() => { props.t.nextPage() }}>next</button> }",
      "component Kid(props: { t: any }) {\n  u = props.t\n  <p>{len(u.rows)}</p>\n  <Leaf t={u} />\n}\ncomponent Leaf(props: { t: any }) { <p>{len(props.t.rows)}</p> }",
      "component Kid(props: { t: any; n: number }) { <Kid t={props.t} n={props.n + 1} /> }",
      "component Kid(props: { t: any }) { <p>kid</p> }",
    ];
    // however the value is handed to the prop, by the ways that are not themselves a way out
    const handed = ["table", "[table][0]", "({ a: table }).a", "keep(table)", "(true ? table : null)", "(table ?? null)", "table.part", "(() => table)()", "[...[table]]"];
    for (const k of keeps) for (const e of handed) deepStrictEqual(run(k, `  <Kid t={${e}} n={0} />`), [], `refused:\n${k}\n${e}`);
    const lets = [
      "<button onClick={() => { held := props.t }}>x</button>",
      "<button onClick={() => { stashJs(props.t) }}>x</button>",
      "<button onClick={() => { props.up(props.t.rows) }}>x</button>",
      "<button onClick={() => { later(() => { held := [props.t] }) }}>x</button>",
      "<button onClick={() => { let u = props.t; held := u }}>x</button>",
    ];
    for (const l of lets) {
      const direct = `component Kid(props: { t: any; up: (x: any) => void }) { ${l} }`;
      const through = `component Kid(props: { t: any }) { <Leaf t={props.t} up={(x) => { }} /> }\ncomponent Leaf(props: { t: any; up: (x: any) => void }) { ${l} }`;
      for (const k of [direct, through]) must(run(k, "  <Kid t={table} up={(x) => { }} />").includes("RENDERS_ESCAPES"), "accepted", k);
    }
    for (const k of ["component Kid(props: { t: any }) {\n  provide ctx = props.t\n  <p>x</p>\n}", "component Kid(props: { t: any }) { <Kid {...props} /> }\ncomponent Other(props: { t: any }) { <p>x</p> }"]) {
      deepStrictEqual(run(k, "  <Kid t={table} />").includes("RENDERS_ESCAPES"), k.includes("provide"), k);
    }
  }],
  ["a_guess_needs_something_to_wait_for", () => {   // 06 AC-3 (2026-11-22): mirrors the crate's test
    const API = "export fn save(k: string): Promise<void>\nexport fn track(k: string): void\n";
    const run = (body: string) => {
      const src = `import { save, track } from "./api.js"\nexport default component App() {\n  source n := ""\n  source shown = n\n  action other() { n := "x" }\n  <button onClick={() => {\n${body.split("; ").map(l => `    ${l}`).join("\n")}\n  }}>{shown}</button>\n}\n`;
      const set = loadModules("/app.rx", p => p === "/app.rx" ? src : p === "/api.d.rx" ? API : undefined);
      const c = checkModules(set) as { diags: { code: string; line: number }[]; advice: { code: string; line: number }[] };
      return [...c.diags.map(d => `${d.code}@${d.line - 6}`), ...c.advice.map(a => `advice ${a.code}@${a.line - 6}`)];   // the body's first statement is line 1
    };
    // nothing to wait for: the guess alone, beside a local, a hook, a closure that is only made
    deepStrictEqual(run("guess shown := \"a\""), ["GUESS_OUTSIDE_HOLD@1"]);
    deepStrictEqual(run("let v = \"a\"; onFlush(() => { n := \"\" }); guess shown := v"), ["GUESS_OUTSIDE_HOLD@3"]);
    deepStrictEqual(run("let f = () => { track(\"k\") }; if (n == \"\") { guess shown := \"a\" }"), ["GUESS_OUTSIDE_HOLD@2"]);
    // something it could wait for: an await, a refresh, affects, a write, a call
    for (const more of ["try { await save(\"a\") } catch (e) { n := \"\" }", "refresh shown", "affects shown", "n := \"b\"", "other()", "track(\"k\")", "let g = () => { track(\"k\") }; g()"])
      deepStrictEqual(run(`guess shown := "a"; ${more}`), [], more);
    // advice: the first guess after an await; not a later guess, not a guess before it
    deepStrictEqual(run("try { await save(\"a\"); guess shown := \"a\" } catch (e) { n := \"\" }"), ["advice GUESS_AFTER_AWAIT@2"]);
    deepStrictEqual(run("guess shown := \"a\"; try { await save(\"a\"); guess shown := \"b\"; await save(\"b\") } catch (e) { n := \"\" }"), []);
  }],
  ["a_waterfall_is_advised_once_for_each_question", () => {   // 99, the advisory rows (2026-11-22): mirrors the crate's test
    const API = "export pure fn ask(k: string): Promise<string>\nexport fn load(k: string): Promise<string>\nexport fn save(k: string): Promise<void>\n";
    const advice = (body: string) => {
      const src = `import { ask, load, save } from "./api.js"\nexport default component App() {\n  source n := ""\n  action go() {\n    try {\n${body.split("; ").map(l => `      ${l}`).join("\n")}\n    } catch (e) { n := "" }\n  }\n  <button onClick={() => { go() }}>{n}</button>\n}\n`;
      const set = loadModules("/app.rx", p => p === "/app.rx" ? src : p === "/api.d.rx" ? API : undefined);
      const c = checkModules(set) as { diags: { code: string }[]; advice: { code: string; line: number; msg: string }[] };
      deepStrictEqual(c.diags.map(d => d.code), [], src);
      return c.advice.map(a => `${a.code}@${a.line - 5}${/declared io/.test(a.msg) ? " io" : ""}`);
    };
    // the first statement of the body is line 1
    deepStrictEqual(advice("let a = await ask(\"a\"); let b = await ask(\"b\"); n := a + b"), ["ASYNC_WATERFALL@2"]);
    // once: the second is told to move, and the third reads the first's answer
    deepStrictEqual(advice("let a = await ask(\"a\"); let b = await ask(\"b\"); let c = await ask(a); n := b + c"), ["ASYNC_WATERFALL@2"]);
    // a third that reads neither waits for the first too: its own advice, once
    deepStrictEqual(advice("let a = await ask(\"a\"); let b = await ask(a); let c = await ask(\"c\"); n := b + c"), ["ASYNC_WATERFALL@3"]);
    // an io fn awaited for its answer is a question: advised, with what only its declaration knows
    deepStrictEqual(advice("let a = await load(\"a\"); let b = await load(\"b\"); n := a + b"), ["ASYNC_WATERFALL@2 io"]);
    deepStrictEqual(advice("let a = await ask(\"a\"); let b = await load(\"b\"); n := a + b"), ["ASYNC_WATERFALL@2 io"]);
    // a command — an io call awaited for nothing — is a point of order: nothing after it is held up by what came before
    deepStrictEqual(advice("await save(\"a\"); await save(\"b\"); n := \"\""), []);
    deepStrictEqual(advice("let a = await ask(\"a\"); await save(a); let b = await ask(\"b\"); n := a + b"), []);
    // what one needs of the other is no waterfall
    deepStrictEqual(advice("let a = await load(\"a\"); let b = await load(a); n := b"), []);
  }],
  ["a_folder_named_as_a_module_is_no_module", () => {   // MO-6: MODULE_NOT_FOUND, as the crate says, not a read error (EISDIR)
    const dir = mkdtempSync(join(tmpdir(), "rx-dir-"));
    try {
      mkdirSync(join(dir, "x.rx")); writeFileSync(join(dir, "main.rx"), 'import { a } from "./x.rx"\nexport default component App() {\n  <p>{a}</p>\n}\n');
      deepStrictEqual(readDisk(join(dir, "x.rx")), undefined);
      const run = (f: string) => { try { return execFileSync(process.execPath, ["--experimental-strip-types", fileURLToPath(new URL("./check.ts", import.meta.url)), f], { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }); } catch (e) { return String((e as { stdout?: string }).stdout); } };
      deepStrictEqual([/error MODULE_NOT_FOUND \[MO-6\]/.test(run("x.rx")), /EISDIR|parse error/.test(run("x.rx"))], [true, false]);
      deepStrictEqual([/MODULE_NOT_FOUND/.test(run("main.rx")), /EISDIR|parse error/.test(run("main.rx"))], [true, false]);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }],
  ["a_component_row_may_have_type_parameters", () => {   // MO-8d: `component Picker<Option>(…)`, on a member component too; the props are read as they were
    const decls = parseDeclarations("export component Picker<Option, G = never>(props: { value?: Option; options: Option[]; onPick?: handler (v: Option) => void }) uses(kit)\nexport component Kit.Row<T extends { id: string }>(props: { row: T })\nexport component Plain(props: { id: string })\n");
    deepStrictEqual(decls.map(d => d.kind === "comp" ? d.tparams : "?"), ["<Option, G = never>", "<T extends { id: string }>", undefined]);
    const picker = decls[0] as Extract<typeof decls[number], { kind: "comp" }>;
    deepStrictEqual(picker.props.map(p => p.name), ["value", "options", "onPick"]);
    deepStrictEqual(picker.uses, ["kit"]);
  }],
];
