// Unit checks for what the scenarios cannot reach (the crate holds the same cases as #[test]s, under the same names).
// Run by run.ts after the scenarios; exits non-zero on the first failure.
import { deepStrictEqual } from "node:assert";
import { packageRelative, besideDeclaration } from "./src/modules.ts";
import { looksLikeTypes, parseProgram } from "./src/parse.ts";
import { loadModules } from "./src/modules.ts";
import { checkModules } from "./src/check.ts";

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
  const src = `import { createTable, flexRender, stashJs, createClock, createLabel, useQ, createStore, later } from "./lib.js"\nfn keep(x) { x }\nfn mk(x) { () => x }\nsource held: any := null\ncontext ctx: any\ncomponent Cell() { <b>c</b> }\ncomponent Grid(props: { t: any }) { <p>ok</p> }\n${main}`;
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
];
