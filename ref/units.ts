// Unit checks for what the scenarios cannot reach (the crate holds the same cases as #[test]s, under the same names).
// Run by run.ts after the scenarios; exits non-zero on the first failure.
import { deepStrictEqual } from "node:assert";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { readDisk } from "./disk.ts";
import { packageRelative, besideDeclaration, isPrintedSignature, relativeModule } from "./src/modules.ts";
import { looksLikeTypes, parseProgram, parseDeclarations, holdsComponent } from "./src/parse.ts";
import { printSignature, parseSignature } from "./src/signature.ts";
import { loadModules, hostProgram } from "./src/modules.ts";
import { checkModules, tyStep, tyScalar } from "./src/check.ts";

const files = (fs: Record<string, string>) => (p: string) => fs[p];

// ---- MO-10k (ruled 2026-11-22): the guarantees, over every way a value is handed on ----
// Not a list of cases: each confined value is put through every wrapper below and every pair of them (one inside the
// other), and each result into every way out. The crate runs the same matrix (`check.rs`, the tests of these names).
const LIB = "export fn stashJs(x: any): void\nexport pure fn createClock(): any instantiates\nexport pure fn createLabel(width: number): any instantiates\nexport pure fn createStore<T>(init: T): [T, (update: (draft state: T) => T | void) => void]\nexport fn later(f: handler () => void): void\n";
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
  const src = `import { stashJs, createClock, createLabel, createStore, later } from "./lib.js"\nfn keep(x) { x }\nfn mk(x) { () => x }\nsource held: any := null\ncontext ctx: any\ncomponent Cell() { <b>c</b> }\ncomponent Grid(props: { t: any }) { <button onClick={() => { held := props.t }}>ok</button> }\n${main}`;
  const set = loadModules("/app.rx", p => p === "/app.rx" ? src : p === "/lib.d.rx" ? LIB : undefined);
  return checkModules(set).diags.map(d => d.code);
}
const LOCALS = "  o = { f: (x) => x }\n  id = (x) => x\n  k = \"part\"\n";
const must = (ok: boolean, what: string, src: string) => { if (!ok) throw new Error(`${what}:\n${src}`); };
export const units: [string, () => void][] = [
  ["a_read_through_what_may_be_an_instance_changes", () => {   // E-10, E-5a
    for (const e of wrapped("clock")) for (const [read, code] of [["createLabel(E.now())", "SNAPSHOT_ARGUMENT"], ["createLabel(E.size)", "SNAPSHOT_ARGUMENT"], ["peek E.now()", "SNAPSHOT_KEPT"]]) {
      const src = `export default component App() {\n  clock = createClock()\n${LOCALS}  label = ${read.replaceAll("E", e)}\n  <p>{label}</p>\n}\n`;
      must(codesOf(src).includes(code), `accepted (${code})`, src);
    }
    const src = `export default component App() {\n  clock = createClock()\n  c = clock\n${LOCALS}  a = createLabel(peek clock.format())\n  b = createLabel(peek c.format())\n  d = createLabel(clock)\n  <p>{a} {b} {d}</p>\n}\n`;
    deepStrictEqual(codesOf(src), []);
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
    const LIB2 = "export pure fn createStore<T>(init: T): [T, (update: (draft state: T) => T | void) => void]\nexport pure fn createClock(): any instantiates\nexport pure fn createLabel(width: any): any instantiates\nexport fn later(f: handler () => void): void\nexport fn stashJs(x: any): void\n";
    const run = (main: string): string[] => {
      const src = `import { createStore, createClock, createLabel, later, stashJs } from "./lib.js"\nsource held: any := null\nsource n := 0\ncomponent Cell() { <b>c</b> }\ncomponent Grid(props: { t: any; onF: (x: any) => void }) { <button onClick={() => { held := props.t }}>ok</button> }\n${main}`;
      return checkModules(loadModules("/app.rx", p => p === "/app.rx" ? src : p === "/lib.d.rx" ? LIB2 : undefined)).diags.map(d => d.code);
    };
    let src = "";
    // MO-10i: what is called on a draft is a method of plain data, by name; a function it calls is a closure written there
    const store = "  [todos, setTodos] = createStore<{ items: { n: number }[] }>({ items: [] })\n";
    for (const body of ["d.items.forEach(keep)", "d.items.map(keep)", "d.items.sort(keep)", "d.items.each((x) => x)", "d.items.push.bind(d.items)", "d.valueOf.call(d)", "d.items[\"forEach\"](keep)", "d.items[m]((x) => x)", "d.items.forEach((row) => { later(() => { held := row }) })", "d.items.slice(0).forEach(keep)"]) {
      src = `export default component App() {\n${store}  <button onClick={() => { let keep = (x) => { held := x }; let m = "forEach"; setTodos((d) => { ${body} }) }}>x</button>\n}\n`;
      must(run(src).includes("DRAFT_ESCAPES"), "accepted", src);
    }
    deepStrictEqual(run(`export default component App() {\n${store}  <button onClick={() => { setTodos((d) => { d.items.forEach((row) => { held := row; row.n := 1 }); held := d.items.values(); held := d.items.map((row) => row).filter((row) => row.n > 0); d.items.push({ n: 1 }); d.items.sort((a, b) => a.n - b.n); held := d.items.valueOf() }) }}>x</button>\n}\n`), []);
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
  ["a_component_row_may_name_its_props_type", () => {   // MO-8o: `props: Kit.SelectProps<Option> & { … }` — the library's type, and the record of the fields that carry words
    const decls = parseDeclarations("export type PickerProps<O> = { value?: O; options: O[]; onPick?: (v: O) => void; label?: string }\nexport component Picker<Option>(props: PickerProps<Option> & { onPick?: handler (v: Option) => void; item?: Component }) uses(kit)\nexport component Kit.Row(props: import(\"./kit.js\").RowProps<{ a: \")\" } & { b: 1 }>)\nexport component Plain(props: { id: string })\nexport context kit\n");
    const comps = decls.filter((d): d is Extract<typeof decls[number], { kind: "comp" }> => d.kind === "comp");
    deepStrictEqual(comps.map(d => d.propsType), ["PickerProps<Option>", "import(\"./kit.js\").RowProps<{ a: \")\" } & { b: 1 }>", undefined]);
    deepStrictEqual(comps[0].props.map(p => [p.name, !!p.callback, p.component]), [["onPick", true, false], ["item", false, true]]);
    deepStrictEqual(comps[0].uses, ["kit"]);
    deepStrictEqual(comps[1].props, []);
    let failed = false; try { parseDeclarations("export component A(props: & { a: string })\n"); } catch { failed = true; }
    deepStrictEqual(failed, true);
    const more = parseDeclarations("export component B(props: { id: string } & Extra & { onPick?: handler () => void })\nexport component C(props: { id: string } & Extra)\n") as typeof comps;
    deepStrictEqual(more.map(d => [d.propsType, d.props.length]), [["{ id: string } & Extra", 1], ["{ id: string } & Extra", 0]]);
  }],
  ["a_declared_prop_may_be_readonly", () => {   // MO-11a, MO-10b: `readonly` before a declared prop is TypeScript's modifier, not part of its name; a prop may itself be named `readonly`
    const decls = parseDeclarations("export component Group(props: { readonly children?: View; readonly id?: string | undefined; readonly onPick?: handler (v: string) => void; readonly?: boolean; readonly readonly: boolean })\n");
    const comp = decls[0] as Extract<typeof decls[number], { kind: "comp" }>;
    deepStrictEqual(comp.props.map(p => [p.name, p.optional, !!p.callback]), [["children", true, false], ["id", true, false], ["onPick", true, true], ["readonly", true, false], ["readonly", false, false]]);
  }],
  ["a_prop_typed_view_takes_a_component_by_name", () => {   // MO-11t: a prop that takes a view is one typed `View` (alone, optional, or beside a string), other than `children`; a function giving a view is a render prop, a `Component` a component value
    const decls = parseDeclarations("export component Rows(props: KitProps & { fallback?: View; icon: View | undefined; label?: string | View; children?: View; item: (n: number) => View; as?: Component; either?: View | (() => View); title?: string })\n");
    const comp = decls[0] as Extract<typeof decls[number], { kind: "comp" }>;
    deepStrictEqual(comp.props.filter(p => p.view).map(p => p.name), ["fallback", "icon", "label"]);
    deepStrictEqual(comp.props.filter(p => p.render).map(p => p.name), ["item"]);
  }],
  ["a_props_record_is_held_to_the_props_type", () => {   // MO-8o, TY-6f: what the boundary check holds a record's field by — its name, the type it is written with (the word taken off), the props' type and the row's type parameters — is read here as the crate reads it (the check itself is the crate's to write, 13 TY-6d: compiler/src/project.rs `boundary_checks`, the unit of this name there)
    const decls = parseDeclarations("export component Picker<const Option, G = never, T extends Tag = \"div\", K extends keyof K = any, F extends (a: Option) => void = (a: Option) => void, R extends R[]>(props: import(\"./kit.js\").PickerProps<Option, G, T> & { onPick?: handler (v: Option) => void; item?: Component; slot?: any })\nexport component Plain(props: PlainProps)\nexport component Rec(props: { onPick?: handler () => void })\n");
    const comps = decls.filter((d): d is Extract<typeof decls[number], { kind: "comp" }> => d.kind === "comp");
    deepStrictEqual(comps.map(d => [d.name, d.line, d.propsType, d.tparams]), [
      ["Picker", 1, "import(\"./kit.js\").PickerProps<Option, G, T>", "<const Option, G = never, T extends Tag = \"div\", K extends keyof K = any, F extends (a: Option) => void = (a: Option) => void, R extends R[]>"],
      ["Plain", 2, "PlainProps", undefined],
      ["Rec", 3, undefined, undefined],
    ]);
    deepStrictEqual(comps[0].props.map(p => [p.name, p.optional, p.type]), [["onPick", true, "(v: Option) => void"], ["item", true, "Component"], ["slot", true, "any"]]);
    deepStrictEqual(comps[1].props, []);   // props that are a type alone: nothing written again, nothing to hold
  }],
  ["an_export_has_one_row", () => {   // MO-8b: a fn with several signatures is declared by one row; a second row of its name is refused (it was MO-8p's overload)
    for (const bad of [
      "export pure fn on(ref target: Window, type_: string): () => void\nexport pure fn on(ref target: Document, type_: string, options?: boolean): () => void\n",
      "export fn on(a: number): void\nexport fn on(a: string): void\n",
    ]) { let msg = ""; try { parseDeclarations(bad); } catch (e) { msg = (e as Error).message; } deepStrictEqual(/declared again: an export has one row/.test(msg), true, bad); }
    deepStrictEqual(parseDeclarations("export fn on(a: number | string): void\nexport fn other(): void\n").map(d => d.name), ["on", "other"]);
  }],
  ["a_word_no_longer_in_the_vocabulary_is_refused", () => {   // MO-8i (pruned 2026-11-22): each by name, with what says it now — never read as type text
    for (const [bad, word] of [
      ["export pure fn f(route: any): any forwards\n", "forwards"],
      ["export pure fn f(config: any): Component nests(children in component) joins(path)\n", "joins"],
      ["export pure fn f(): any instantiates methods(format)\n", "methods"],
      ["export fn f(): void trusted\n", "trusted"],
      ["export component C(props: {}) trusted\n", "trusted"],
      ["export pure fn f(options: { template: Component }): any renders(root)\n", "renders\\(root"],
      ["export pure fn f(options: { template: Component }): any renders(root, theme)\n", "renders\\(root"],
      ["export pure fn f(ref options: { queryFn: tracked () => Promise<any> }): any\n", "tracked"],
      ["export component C(props: { onCompare: tracked (v: number) => number })\n", "tracked"],
      // withdrawn 2026-11-23 (MO-8r, Settled): a plain field's rows, wherever in the result (before a `ref` part they are MO-10l's); `renders` alone
      ["export pure fn useQ(): { data: pending fails(Error) any; n: number }\n", "pending"],
      ["export pure fn useQ(): { inner: { data: fails(Error) any } }\n", "pending"],
      ["export pure fn useQ(): { inner: { data: pending ref any } }\n", "pending"],   // a `ref` below the first level is no part (MO-10b)
      ["export pure fn useQ(): [pending string, () => void]\n", "pending"],
      ["export pure fn useQ(): pending fails(Error) string[]\n", "pending"],
      ["export pure fn useQ(): { load: () => pending ref string }\n", "pending"],
      ["export pure fn createTable(options: { cell: Component }): any renders\n", "renders` alone"],
      ["export pure fn createTable(options: { cell: Component }): { rows: any[] } renders uses(kit)\n", "renders` alone"],
      // withdrawn 2026-11-23 (MO-8r, Settled, the third): components that travel in values, and the tree they nest in
      ["export pure fn createRoute(options: { component?: Component }): any renders(later)\n", "renders\\(later\\)"],
      ["export pure fn createRoute(options: { getParentRoute: () => any; component?: Component }): any renders(later) nests(component under getParentRoute)\n", "renders\\(later\\)"],
      ["export pure fn createRoute(options: any): any carries\n", "renders\\(later\\)"],
      ["export component RouterProvider(props: { router: renders any }) provides(router)\nexport context router\n", "renders\\(later\\)"],
      ["export pure fn createRoute(options: any): Component nests(component under getParentRoute)\n", "nests\\(component under parent\\)"],
      ["export pure fn createRoute(options: any): any under(getParentRoute in component)\n", "nests\\(component under parent\\)"],
      ["export component Outlet(props: {}) outlet\n", "outlet"],
    ] as const) { let msg = ""; try { parseDeclarations(bad); } catch (e) { msg = (e as Error).message; } deepStrictEqual(new RegExp("`" + word + ".*is not a word of a declaration").test(msg), true, `${bad} → ${msg}`); }
    // `signal init: T` is no parameter word: the row does not parse
    { let msg = ""; try { parseDeclarations("export pure fn makePersisted(signal init: string): [ref string, (v: string) => void]\n"); } catch (e) { msg = (e as Error).message; } deepStrictEqual(msg !== "", true); }
    // and a name that is one of them is still a name where a name goes
    deepStrictEqual(parseDeclarations("export pure fn f(signal: string, tracked: boolean, methods?: string[]): { trusted: boolean; forwards: string }\n").map(d => d.kind === "fn" ? d.params : []), [["signal", "tracked", "methods"]]);
    deepStrictEqual(parseDeclarations("export pure fn f(): { pending: ref boolean; fails: number; renders: string; outlet: boolean }\nexport pure fn g(outlet: any, nests: any, later: any): any\n").length, 2);
  }],
  ["an_accessor_that_waits_or_fails_says_so_before_ref", () => {   // MO-10l: `pending` and `fails(…)` before a `ref` part of a declared result — the whole result, an item of its tuple, a field of its record — and nowhere else; the words are taken out of the type text
    const fn = (src: string) => parseDeclarations(src)[0] as Extract<ReturnType<typeof parseDeclarations>[number], { kind: "fn" }>;
    const whole = fn("export pure fn createJson(url: string): pending fails(HttpError | Error) ref { name: string } uses(http)\nexport context http\n");
    deepStrictEqual([whole.waits, whole.held, whole.ret, whole.shape, whole.instantiates], [[true, ["HttpError", "Error"]], undefined, "{ name: string }", "ref", true]);
    const tuple = fn("export pure fn createStream(want: any): [pending fails(Error) ref MediaStream | undefined, { stop: () => void }]\n");
    deepStrictEqual([tuple.waits, tuple.held, tuple.ret], [undefined, [["0", true, ["Error"]]], "[MediaStream | undefined, { stop: () => void }]"]);
    const rec = fn("export pure fn useQuery(): { data: pending fails(Error) ref string[]; error: fails(Error) ref unknown; readonly isFetching?: pending ref boolean; refetch: () => void }\n");
    deepStrictEqual([rec.waits, rec.held], [undefined, [["data", true, ["Error"]], ["error", false, ["Error"]], ["isFetching", true, []]]]);
    deepStrictEqual(rec.ret, "{ data: string[]; error: unknown; readonly isFetching?: boolean; refetch: () => void }");
    const plain = fn("export pure fn createSignal(): [ref number, (v: number) => void]\n");
    deepStrictEqual([plain.waits, plain.held, plain.ret], [undefined, undefined, "[number, (v: number) => void]"]);
  }],
  ["a_declaration_names_another_modules_context", () => {   // MO-12e: `export context c from "<module>"` names the context that module's declaration declares, under that declaration's key: found as an import from the declaration's own file would find it, and through a module that takes it from another
    const fs = files({
      "/app/rx-types/@demo/query.d.rx": "export context client\nexport component ClientProvider(props: { children?: View }) provides(client)\n",
      "/app/src/todos.d.rx": "export context client from \"@demo/query\"\nexport pure fn useTodos(): ref string uses(client)\n",
      "/app/src/deep/count.d.rx": "export context client from \"../todos.js\"\nexport pure fn useCount(): ref number uses(client)\n",
      "/app/src/typo.d.rx": "export context klient from \"@demo/query\"\nexport pure fn useTypo(): ref number uses(klient)\n",
      "/app/src/main.rx": "import { ClientProvider } from \"@demo/query\"\nimport { useTodos } from \"./todos.js\"\nimport { useCount } from \"./deep/count.js\"\ncomponent Todos() {\n  t = useTodos()\n  n = useCount()\n  <p>{t}{n}</p>\n}\nexport default component App() {\n  <ClientProvider><Todos /></ClientProvider>\n}\n",
      "/app/src/bare.rx": "import { useCount } from \"./deep/count.js\"\nexport default component App() {\n  n = useCount()\n  <p>{n}</p>\n}\n",
      "/app/src/typo.rx": "import { useTypo } from \"./typo.js\"\nexport default component App() {\n  n = useTypo()\n  <p>{n}</p>\n}\n",
    });
    const codes = (entry: string) => checkModules(loadModules(entry, fs)).diags.map(d => d.code);
    const set = loadModules("/app/src/main.rx", fs);
    const at = (dts: string) => { const c = set.declarations!.get(dts)!.find(d => d.kind === "context") as { from?: string; resolved?: string }; return [c.from, c.resolved]; };
    deepStrictEqual([at("/app/rx-types/@demo/query.d.rx"), at("/app/src/todos.d.rx"), at("/app/src/deep/count.d.rx")], [[undefined, undefined], ["@demo/query", "/app/rx-types/@demo/query.d.rx"], ["../todos.js", "/app/rx-types/@demo/query.d.rx"]]);
    deepStrictEqual([codes("/app/src/main.rx"), codes("/app/src/bare.rx"), codes("/app/src/typo.rx")], [[], ["CONTEXT_NOT_FOUND"], ["NOT_EXPORTED", "CONTEXT_NOT_FOUND"]]);
    let failed = false; try { parseDeclarations("export context client from query\n"); } catch { failed = true; }
    deepStrictEqual(failed, true);
  }],
  ["a_host_declaration_places_the_components_a_js_host_renders", () => {   // MO-14: `host.d.rx`, found at or above a program — the `.rx` components a JS host renders (a file-based router's route files), imported by name, and the view it makes of them in a factory's words; checked as the app's view, what it says on the declaration's line
    const HOST = "// what the file router does with the route files\nimport { Layout } from \"./routes/layout.rx\"\nimport { Home } from \"./routes/index.rx\"\nimport { Person, Banner } from \"./routes/person.rx\"\nexport context router from \"./router.js\"\nexport default component provides(router) nests(children in component) = [\n  { component: Layout, children: [{ component: Home }, { component: Person }] }\n]\n";
    const LAYOUT = "import { NotFound } from \"../people.js\"\nexport default component Layout(props: { children?: View }) {\n  errored fallback(e: NotFound) { <p>{e.message}</p> } {\n    loading fallback { <p>loading…</p> } { <main>{props.children}</main> }\n  }\n}\n";
    const app = (host: string | null = HOST, layout = LAYOUT) => files({
      "/app/src/router.d.rx": "export context router\nexport pure fn useParams(): { id: string } instantiates uses(router)\n",
      "/app/src/people.d.rx": "export error NotFound\nexport pure fn fetchPerson(id: string): Promise<{ name: string }> rejects(NotFound)\n",
      "/app/src/routes/layout.rx": layout,
      "/app/src/routes/index.rx": "export default component Home() { <h1>People</h1> }\n",
      "/app/src/routes/person.rx": "import { useParams } from \"../router.js\"\nimport { fetchPerson } from \"../people.js\"\nexport default component Person() {\n  params = useParams()\n  person = await fetchPerson(params.id)\n  <h1>{person.name}</h1>\n}\nexport component Banner() {\n  params = useParams()\n  <p>{params.id}</p>\n}\n",
      ...(host === null ? {} : { "/app/src/host.d.rx": host }),
    });
    const diags = (fs: (p: string) => string | undefined, entry = "/app/src/routes/person.rx", spa = false, whole = false) => checkModules(loadModules(entry, fs), spa, whole).diags.map(d => `${d.code}@${(d.file ?? entry).split("/").pop()}:${d.line}`);
    // the route files as they are, each a page that relies on its layout and on the router: accepted from any of them
    deepStrictEqual([diags(app()), diags(app(), "/app/src/routes/layout.rx"), diags(app(), "/app/src/routes/index.rx", true)], [[], [], []]);
    // with no declaration, a route file's default component is a mounted view, and nothing is above it
    deepStrictEqual(diags(app(null)), ["UNHANDLED_FAILURE@person.rx:6", "CONTEXT_NOT_FOUND@person.rx:4"]);
    // the layout's regions hold its pages: without one, the page's failure (or, in a client-only build, its first load) is the host's
    deepStrictEqual(diags(app(HOST, LAYOUT.replace(/  errored[^\n]*\n    (loading[^\n]*)\n  \}\n/, "  $1\n"))), ["UNHANDLED_FAILURE@host.d.rx:6"]);
    deepStrictEqual(diags(app(HOST, LAYOUT.replace(/loading fallback \{ <p>loading…<\/p> \} \{ (<main>\{props\.children\}<\/main>) \}/, "$1")), "/app/src/routes/person.rx", true), ["ASYNC_OUTSIDE_LOADING_BOUNDARY@host.d.rx:6"]);
    // a page the host renders beside the layout, not in it; a host that provides no router
    deepStrictEqual(diags(app(HOST.replace("children: [{ component: Home }, { component: Person }] }", "children: [{ component: Home }] }, { component: Person }"))), ["UNHANDLED_FAILURE@host.d.rx:6"]);
    deepStrictEqual(diags(app(HOST.replace(" provides(router)", ""))), ["CONTEXT_NOT_FOUND@host.d.rx:6"]);
    // a component the declaration imports and leaves out of its tree is rendered where no one says: in a whole-program
    // build it is checked under a root of its own (CP-4d), as every export of a module a host renders that is not placed
    deepStrictEqual([diags(app(), "/app/src/routes/person.rx", false, true), diags(app(HOST.replace("{ component: Person }] }", "{ component: Person }, { component: Banner }] }")), "/app/src/routes/person.rx", false, true)], [["CONTEXT_NOT_FOUND@person.rx:1"], []]);
    // the tree names what the declaration imports
    deepStrictEqual(diags(app(HOST.replace("component: Home", "component: Nope"))), ["UNBOUND@host.d.rx:6"]);
    const refused = (text: string) => { try { parseDeclarations(text); return false; } catch { return true; } };
    deepStrictEqual(["import Layout from \"./layout.rx\"\n", "import { Layout } from \"@demo/pages.rx\"\n", "import { Layout } from \"/abs/layout.rx\"\n", "export default component provides(router)\n", "export default component = 3\n", "export default fn f()\n", "export default component = []\nexport default component = []\n", "export default component uses(router) = []\n"].map(refused), [true, true, true, true, true, true, true, true]);
    deepStrictEqual(refused("import { Layout as L } from \"../pages/layout.rx\"\nexport context router\nexport default component provides(router) nests(children in component) = { component: L }\n"), false);
    // lowered text for text, each piece on its line: the declaration's imports, and its tree given to a factory with the row's words
    const low = hostProgram(HOST, parseDeclarations(HOST), "host.d.rx")!;
    deepStrictEqual(low.rx.split("\n").map(l => l.trim()), ["", "import { Layout } from \"./routes/layout.rx\"", "import { Home } from \"./routes/index.rx\"", "import { Person, Banner } from \"./routes/person.rx\"", "", "import { jsHostFactory } from \"./host.d.rx.host.js\"; export default component JsHost() { <JsHostView /> }; JsHostView = jsHostFactory([", "{ component: Layout, children: [{ component: Home }, { component: Person }] }", "])", ""]);
    deepStrictEqual(low.decl, "export context router from \"./router.js\"\nexport pure fn jsHostFactory(tree: unknown): Component provides(router) nests(children in component)\n");
    // a view written over several lines keeps each line: what it says is on the line it starts on, its tree where it was
    const SPREAD = HOST.replace("nests(children in component) = [", "nests(children in component) =\n\n[");
    deepStrictEqual([hostProgram(SPREAD, parseDeclarations(SPREAD), "host.d.rx")!.rx.split("\n").length, SPREAD.split("\n").length, diags(app(SPREAD.replace(" provides(router)", ""))), diags(app(SPREAD))], [11, 11, ["CONTEXT_NOT_FOUND@host.d.rx:6"], []]);
    // the view's words are on its own line, as a row's are
    deepStrictEqual(refused("export default component\n  provides(router) = []\n"), true);
 
    // MO-11i: a layout the view nests pages in renders them among its own children — one that renders none is refused
    // (it was accepted, and its pages checked under nothing)
    const OUTLET = LAYOUT.replace("(props: { children?: View })", "()").replace("{props.children}", "<Outlet />").replace("import {", "import { Outlet } from \"../router.js\"\nimport {");
    const outlet = (host = HOST, layout = OUTLET) => { const fs = app(host, layout); return (p: string) => p === "/app/src/router.d.rx" ? fs(p)! + "export component Outlet(props: {}) uses(router)\nexport component AppRouter(props: {}) provides(router)\n" : fs(p); };
    deepStrictEqual(diags(outlet()), ["NESTED_NOT_RENDERED@host.d.rx:6"]);
    // MO-14f: a component of the host's own that the declaration imports from JavaScript is one the host renders through —
    // a layout that applies it renders its pages there, under what the layout has around it
    const THROUGH = HOST.replace("export context", "import { Outlet } from \"./router.js\"\nexport context");
    deepStrictEqual([diags(outlet(THROUGH)), diags(outlet(THROUGH), "/app/src/routes/layout.rx", true)], [[], []]);
    deepStrictEqual(diags(outlet(THROUGH, OUTLET.replace(/  errored[^\n]*\n    loading[^\n]*\n  \}\n/, "  errored fallback(e: NotFound) { <p>{e.message}</p> } { <p>ready</p> }\n  <main><Outlet /></main>\n"))), ["UNHANDLED_FAILURE@host.d.rx:7"]);
    deepStrictEqual(diags(outlet(THROUGH, OUTLET.replace(/loading fallback \{ <p>loading…<\/p> \} \{ (<main><Outlet \/><\/main>) \}/, "$1")), "/app/src/routes/person.rx", true), ["ASYNC_OUTSIDE_LOADING_BOUNDARY@host.d.rx:7"]);
    // …and the app's own component, when it is `.rx` and applies the router: the view names it, the host's records its
    // children, and what it has around the router's component holds every page. The router is provided by that
    // component's own row, so a hook above it in the app is still outside the router
    const HELD = "  errored fallback(e: NotFound) { <p>{e.message}</p> } {\n    loading fallback { <p>loading…</p> } { <AppRouter /> }\n  }\n";
    const ENTRY = (above = "", body = HELD) => "import { AppRouter } from \"../router.js\"\nimport { useParams } from \"../router.js\"\nimport { NotFound } from \"../people.js\"\nexport default component App() {\n" + above + body + "}\n";
    const BARE = "export default component Layout(props: { children?: View }) {\n  <main>{props.children}</main>\n}\n";
    const UNDER = "import { App } from \"./routes/app.rx\"\nimport { Layout } from \"./routes/layout.rx\"\nimport { Home } from \"./routes/index.rx\"\nimport { Person } from \"./routes/person.rx\"\nimport { AppRouter } from \"./router.js\"\nexport default component nests(children in component) = [\n  { component: App, children: [{ component: Layout, children: [{ component: Home }, { component: Person }] }] }\n]\n";
    const entry = (host = UNDER, main = ENTRY()) => { const fs = outlet(host, BARE); return (p: string) => p === "/app/src/routes/app.rx" ? main : fs(p); };
    deepStrictEqual([diags(entry()), diags(entry(), "/app/src/routes/app.rx", true)], [[], []]);
    deepStrictEqual(diags(entry(UNDER, ENTRY("  at = useParams()\n"))), ["CONTEXT_NOT_FOUND@host.d.rx:6"]);
    deepStrictEqual(diags(entry(UNDER, ENTRY("", "  errored fallback(e: NotFound) { <p>{e.message}</p> } { <p>ready</p> }\n  loading fallback { <p>…</p> } { <AppRouter /> }\n"))), ["UNHANDLED_FAILURE@host.d.rx:6"]);
    deepStrictEqual(diags(entry(UNDER.replace("import { AppRouter } from \"./router.js\"\n", ""))), ["NESTED_NOT_RENDERED@host.d.rx:5"]);
    // what is imported from JavaScript is a component its module's declaration declares
    const fails = (host: string) => { try { loadModules("/app/src/routes/person.rx", outlet(host)); return ""; } catch (e) { return (e as { code?: string }).code ?? "?"; } };
    deepStrictEqual([fails(THROUGH.replace("{ Outlet }", "{ Inlet }")), fails(THROUGH.replace("\"./router.js\"\nexport", "\"./nowhere.js\"\nexport")), fails(THROUGH)], ["NOT_EXPORTED", "NOT_EXPORTED", ""]);
  }],
  ["a_brace_that_closes_nothing_is_refused", () => {   // found 2026-11-23: at a module's top level the parser read it again and again, with no end; the crate refused it
    let code = ""; try { parseProgram("export default component App() {\n  <p>a</p>\n  }\n}\n"); } catch (e) { code = (e as { code?: string }).code ?? "?"; }
    deepStrictEqual(code, "PARSE");
  }],
  ["a_dependencys_default_component_is_mounted_by_no_one", () => {   // MO-1c: the runtime mounts the entry's default component; another module's is a component like any other, checked where it is applied
    const app = (main: string) => files({
      "/app/people.d.rx": "export error NotFound\nexport pure fn fetchPerson(id: string): Promise<{ name: string }> rejects(NotFound)\n",
      "/app/page.rx": "import { fetchPerson } from \"./people.js\"\nexport fn label(n: number) { `#${n}` }\nexport default component Page() {\n  person = await fetchPerson(\"1\")\n  <h1>{person.name}</h1>\n}\n",
      "/app/main.rx": main,
    });
    const diags = (fs: (p: string) => string | undefined, entry = "/app/main.rx") => checkModules(loadModules(entry, fs)).diags.map(d => `${d.code}@${(d.file ?? entry).split("/").pop()}:${d.line}`);
    // a module imported for a fn: its default component is applied by no one, and is nobody's failure (it was walked as a mounted view)
    deepStrictEqual(diags(app("import { label } from \"./page.rx\"\nexport default component App() { <p>{label(1)}</p> }\n")), []);
    // applied, it is checked where it is applied; as the entry, it is the mounted view
    deepStrictEqual(diags(app("import { Page } from \"./page.rx\"\nexport default component App() { <Page /> }\n")), ["UNHANDLED_FAILURE@main.rx:2"]);
    deepStrictEqual(diags(app("import { Page } from \"./page.rx\"\nimport { NotFound } from \"./people.js\"\nexport default component App() { errored fallback(e: NotFound) { <p>no</p> } { <Page /> } }\n")), []);
    deepStrictEqual(diags(app(""), "/app/page.rx"), ["UNHANDLED_FAILURE@page.rx:5"]);
  }],
  ["a_marked_declaration_is_read_as_a_signature", () => {   // MO-13a, MO-13b: `//@ signature` on a declaration a JS import finds makes it the .rx module's signature (MO-9b)
    deepStrictEqual(["//@ signature x.rx\nexport a", "\n// built\n//@signature\nexport a", "//@ signatures\nexport a", "export a\n//@ signature", "// signature\nexport a", ""].map(isPrintedSignature), [true, true, false, false, false, false]);
    deepStrictEqual([relativeModule("/app/src/main.rx", "/app/node_modules/kit/dist/index.rx"), relativeModule("main.rx", "node_modules/kit/dist/index.rx"), relativeModule("/app/main.rx", "/app/vendor/x.rx"), relativeModule("a/b/main.rx", "a/x.rx")], ["../node_modules/kit/dist/index.rx", "./node_modules/kit/dist/index.rx", "./vendor/x.rx", "../x.rx"]);
    const rows = "export pure fn load(id)\nexport source n := …\nexport component Badge(props: {}) uses(./theme.rx#theme) shape(roots b)\n";
    const pkg = (marked: boolean) => files({
      "/app/node_modules/kit/package.json": `{"name":"kit","exports":{".":{"browser":"./dist/index.js","default":"./dist/index.js"},"./theme":"./dist/theme.js"}}`,
      "/app/node_modules/kit/dist/index.d.rx": marked ? `//@ signature index.rx\n${rows}` : "export pure fn load(id: string): Promise<number>\n",
      "/app/node_modules/kit/dist/theme.d.rx": "//@ signature theme.rx\nexport context theme: string\nexport component Themed(props: { children: provides(./theme.rx#theme) }) shape(roots div; children-at div)\n",
      "/app/vendor/kit.d.rx": `//@ signature kit.rx\n${rows}`,
      "/app/main.rx": `import { load } from "kit"\nexport default component App() {\n  v = await load("a")\n  <p>{v}</p>\n}\n`,
      "/app/write.rx": `import { n } from "kit"\nexport default component App() {\n  <button onClick={() => { n := 1 }}>{n}</button>\n}\n`,
      "/app/bare.rx": `import { Badge } from "kit"\nexport default component App() {\n  <Badge />\n}\n`,
      "/app/themed.rx": `import { Badge } from "kit"\nimport { Themed, theme } from "kit/theme"\ncomponent Own() {\n  provide theme = "x"\n  <Badge />\n}\nexport default component App() {\n  <Themed><Badge /></Themed>\n  <Own />\n}\n`,
      "/app/local.rx": `import { n, Badge } from "./vendor/kit.js"\nexport default component App() {\n  <p>{n}</p>\n}\n`,
    });
    const codes = (entry: string, marked = true) => { const set = loadModules(entry, pkg(marked)); return checkModules(set).diags.map(d => d.code); };
    // the marker: an .rx import in everything but its specifier — resolved to the module the signature stands for
    const set = loadModules("/app/main.rx", pkg(true));
    deepStrictEqual([set.programs.get("/app/main.rx")!.decls[0].k === "import" && (set.programs.get("/app/main.rx")!.decls[0] as { resolved?: string }).resolved, [...set.signatures!.keys()], [...set.declarations!.keys()]], ["/app/node_modules/kit/dist/index.rx", ["/app/node_modules/kit/dist/index.rx"], []]);
    deepStrictEqual(codes("/app/main.rx"), []);                               // MO-9b: `rejects(…)` absent — nothing that rejects
    deepStrictEqual(codes("/app/main.rx", false), ["UNHANDLED_FAILURE"]);     // MO-8a: unmarked, the same row is a JS fn's, and absent is Error
    deepStrictEqual(codes("/app/write.rx"), ["WRITE_TO_NON_SOURCE"]);         // MO-2a across the package boundary
    deepStrictEqual(codes("/app/bare.rx"), ["CONTEXT_NOT_FOUND"]);            // MO-13b: `./theme.rx#theme` is the package's own module
    deepStrictEqual(codes("/app/themed.rx"), []);                             // … provided by its component, and by the app with the context it exports
    const local = loadModules("/app/local.rx", pkg(true));                    // beside a relative JS module (MO-8a), the same
    deepStrictEqual([[...local.signatures!.keys()], checkModules(local).diags.map(d => d.code)], [["/app/vendor/kit.rx"], []]);
  }],
  ["renders_names_the_component_a_fns_components_render_beneath", () => {   // MO-11u: `renders(H)` after a fn: the components it is given are checked among H's children, at every application of H in the program (in whichever module), with what H itself uses and provides; with none, under a root of their own
    const fs = files({
      "/app/kit.d.rx": "export context region\nexport error Lost\nexport pure fn load(): Promise<string> rejects(Lost)\nexport component Region(props: { children?: View }) provides(region)\nexport component Toaster(props: {}) uses(region)\nexport component Toast(props: { children?: View }) uses(region)\nexport fn toast(message: string | Component): number renders(Toaster)\nexport pure fn createRoute(options: { component: Component }): any renders(Toaster)\nexport fn plain(message: string | Component): number\nexport component Markdown(props: { builtins?: { Heading?: Component<{ depth: number }> }; tabs?: Component[]; table?: Record<string, Component>; one?: Component; meta?: { title: string }; children?: View })\n",
      "/app/theme.rx": "export context accent: string\n",
      "/app/saved.rx": "import { toast, Toast } from \"./kit.js\"\nimport { accent } from \"./theme.rx\"\ncomponent Saved() {\n  <Toast><b class={use accent}>saved</b></Toast>\n}\nexport action save() {\n  toast(Saved)\n}\n",
      "/app/frame.rx": "import { Toaster, Region } from \"./kit.js\"\nimport { accent } from \"./theme.rx\"\nexport component Frame(props: { children?: View }) {\n  provide accent = \"dark\"\n  {props.children}\n  <Region><Toaster /></Region>\n}\nexport component Bare(props: { children?: View }) {\n  {props.children}\n  <Region><Toaster /></Region>\n}\n",
      "/app/good.rx": "import { toast, plain, createRoute, Toast, Toaster, Region } from \"./kit.js\"\ncontext accent: string\ncomponent Saved() {\n  <Toast><b class={use accent}>saved</b></Toast>\n}\nexport default component App() {\n  provide accent = \"dark\"\n  <button onClick={() => { toast(Saved) }}>save</button>\n  <Region><Toaster /></Region>\n}\n",
      "/app/beside.rx": "import { toast, plain, createRoute, Toast, Toaster, Region } from \"./kit.js\"\ncontext accent: string\ncomponent Saved() {\n  <Toast><b class={use accent}>saved</b></Toast>\n}\ncomponent Editor() {\n  provide accent = \"dark\"\n  <button onClick={() => { toast(Saved) }}>save</button>\n}\nexport default component App() {\n  <Editor />\n  <Region><Toaster /></Region>\n}\n",
      "/app/two.rx": "import { toast, plain, createRoute, Toast, Toaster, Region } from \"./kit.js\"\ncontext accent: string\ncomponent Saved() {\n  <Toast><b class={use accent}>saved</b></Toast>\n}\ncomponent Themed() {\n  provide accent = \"dark\"\n  <Region><Toaster /></Region>\n}\nexport default component App() {\n  <button onClick={() => { toast(Saved) }}>save</button>\n  <Themed />\n  <Region><Toaster /></Region>\n}\n",
      "/app/nosite.rx": "import { toast, plain, createRoute, Toast, Toaster, Region } from \"./kit.js\"\ncontext accent: string\ncomponent Saved() {\n  <Toast><b class={use accent}>saved</b></Toast>\n}\nexport default component App() {\n  provide accent = \"dark\"\n  <button onClick={() => { toast(Saved) }}>save</button>\n}\n",
      "/app/noword.rx": "import { toast, plain, createRoute, Toast, Toaster, Region } from \"./kit.js\"\ncontext accent: string\ncomponent Saved() {\n  <Toast><b class={use accent}>saved</b></Toast>\n}\nexport default component App() {\n  provide accent = \"dark\"\n  <button onClick={() => { plain(Saved) }}>save</button>\n  <Region><Toaster /></Region>\n}\n",
      "/app/route.rx": "import { toast, plain, createRoute, Toast, Toaster, Region } from \"./kit.js\"\ncontext accent: string\ncomponent Saved() {\n  <Toast><b class={use accent}>saved</b></Toast>\n}\nroute = createRoute({ component: Saved })\nexport default component App() {\n  provide accent = \"dark\"\n  <p>{route ? \"made\" : \"\"}</p>\n  <Region><Toaster /></Region>\n}\n",
      "/app/routebad.rx": "import { toast, plain, createRoute, Toast, Toaster, Region } from \"./kit.js\"\ncontext accent: string\ncomponent Saved() {\n  <Toast><b class={use accent}>saved</b></Toast>\n}\nroute = createRoute({ component: Saved })\nexport default component App() {\n  <p>{route ? \"made\" : \"\"}</p>\n  <Region><Toaster /></Region>\n}\n",
      "/app/unbound.rx": "import { toast, plain, createRoute, Toast, Toaster, Region } from \"./kit.js\"\ncontext accent: string\ncomponent Saved() {\n  <Toast><b class={use accent}>saved</b></Toast>\n}\nexport default component App() {\n  <button onClick={() => { createRoute({ component: Saved }) }}>save</button>\n}\n",
      "/app/fails.rx": "import { toast, load, Toaster, Region } from \"./kit.js\"\ncomponent Loads() {\n  text = await load()\n  <i>{text}</i>\n}\nexport default component App() {\n  <button onClick={() => { toast(Loads) }}>save</button>\n  loading fallback { <p>…</p> } { <Region><Toaster /></Region> }\n}\n",
      "/app/held.rx": "import { toast, load, Toaster, Region } from \"./kit.js\"\ncomponent Loads() {\n  text = await load()\n  <i>{text}</i>\n}\nexport default component App() {\n  <button onClick={() => { toast(Loads) }}>save</button>\n  errored fallback(e) { <p>lost</p> } { loading fallback { <p>…</p> } { <Region><Toaster /></Region> } }\n}\n",
      "/app/waits.rx": "import { toast, load, Toaster, Region } from \"./kit.js\"\ncomponent Loads() {\n  text = await load()\n  <i>{text}</i>\n}\nexport default component App() {\n  <button onClick={() => { toast(Loads) }}>save</button>\n  errored fallback(e) { <p>lost</p> } { <Region><Toaster /></Region> }\n}\n",
      "/app/cross.rx": "import { save } from \"./saved.rx\"\nimport { Frame } from \"./frame.rx\"\nexport default component App() {\n  <Frame><button onClick={() => { save() }}>save</button></Frame>\n}\n",
      "/app/crossbad.rx": "import { save } from \"./saved.rx\"\nimport { Bare } from \"./frame.rx\"\nexport default component App() {\n  <Bare><button onClick={() => { save() }}>save</button></Bare>\n}\n",
    });
    const diags = (name: string, spa = false) => { const entry = `/app/${name}.rx`; return checkModules(loadModules(entry, fs), spa).diags.map(x => `${x.code}@${(x.file ?? entry).split("/").pop()}:${x.line}`); };
    deepStrictEqual(diags("good"), []);   // a toast that reads the app's context and the library's region, under the app's provision and a toaster in its region
    deepStrictEqual(diags("beside"), ["CONTEXT_NOT_FOUND@beside.rx:8"]);   // the context provided above the call, not above the toaster
    deepStrictEqual(diags("two"), ["CONTEXT_NOT_FOUND@two.rx:11"]);   // two toasters, one without the provision: every application is held to it
    deepStrictEqual(diags("nosite"), ["CONTEXT_NOT_FOUND@nosite.rx:8"]);   // no toaster in the program: held to what the toaster itself uses (the region's context is credited, the app's is not)
    deepStrictEqual(diags("noword"), ["CONTEXT_NOT_FOUND@noword.rx:4", "CONTEXT_NOT_FOUND@noword.rx:4"]);   // the row without the word: a root of its own (MO-11s), nothing credited
    deepStrictEqual(diags("route"), []);   // a `pure` fn with the word is a constructor (`instantiates` inferred), bound at the module's top
    deepStrictEqual(diags("routebad"), ["CONTEXT_NOT_FOUND@routebad.rx:6"]);   // ... and its component is held to the same
    deepStrictEqual(diags("unbound"), ["INSTANTIATION_NOT_BOUND@unbound.rx:7", "CONTEXT_NOT_FOUND@unbound.rx:7"]);   // ... so it is bound, not called from a handler
    deepStrictEqual(diags("fails"), ["UNHANDLED_FAILURE@fails.rx:7"]);   // a failure, with no errored region above the toaster
    deepStrictEqual(diags("held"), []);   // ... and with one
    deepStrictEqual(diags("held", true), []);   // a client-only build: the first load is held by the region above the toaster
    deepStrictEqual(diags("waits", true), ["ASYNC_OUTSIDE_LOADING_BOUNDARY@waits.rx:7"]);   // ... and is not, with none
    deepStrictEqual(diags("cross"), []);   // the call in one module, the toaster in another: judged at the program
    deepStrictEqual(diags("crossbad"), ["CONTEXT_NOT_FOUND@saved.rx:7"]);   // ... on the line of the call, in its module
    // MO-9: the requirement and the place are rows of the modules' printed signatures, and read back
    const c = checkModules(loadModules("/app/cross.rx", fs));
    const [saved, frame] = [printSignature(c.sigs.get("/app/saved.rx")!), printSignature(c.sigs.get("/app/frame.rx")!)];
    deepStrictEqual([saved, frame], ["//@ signature saved.rx (09-modules MO-3, MO-13a). Sources are read-only to importers (MO-2).\nexport action save\nexport renders ./kit.d.rx#Toaster from toast:7 uses(./theme.rx#accent)\n", "//@ signature frame.rx (09-modules MO-3, MO-13a). Sources are read-only to importers (MO-2).\nexport component Frame(props: { children: provides(./theme.rx#accent) }) hosts(./kit.d.rx#Toaster provides(./kit.d.rx#region, ./theme.rx#accent)) shape(children-at )\nexport component Bare(props: { children }) hosts(./kit.d.rx#Toaster provides(./kit.d.rx#region)) shape(children-at )\n"]);
    deepStrictEqual([printSignature(parseSignature(saved, "/app/saved.rx")), printSignature(parseSignature(frame, "/app/frame.rx"))], [saved, frame]);
    // the word names one component, of the same file; a factory has no use for it
    for (const [bad, why] of [["export fn toast(c: Component): number renders(Toaster)\n", "declares no component Toaster"], ["export component Toaster(props: {})\nexport fn toast(c: Component): number renders(toaster)\n", "renders(H)"], ["export component A(props: {})\nexport fn toast(c: Component): number renders(A) renders(A)\n", "twice"], ["export component A(props: {})\nexport pure fn make(c: Component): Component renders(A)\n", "hands back a Component"], ["export component A(props: {})\nexport fn toast(c: Component): number renders(A, theme)\n", "renders(H)"]] as [string, string][]) { let msg = ""; try { parseDeclarations(bad); } catch (e) { msg = (e as Error).message; } deepStrictEqual([bad, msg.includes(why)], [bad, true]); }
    { const ds = parseDeclarations("export component Toast.List(props: {})\nexport fn show(c: Component): number renders(Toast.List)\nexport pure fn createRoute(o: any): any renders(Toast.List)\n") as { kind: string; renders?: string; instantiates?: boolean }[]; deepStrictEqual(ds.slice(1).map(x => [x.renders, !!x.instantiates]), [["Toast.List", false], ["Toast.List", true]]); }
  }],
  ["a_component_inside_a_record_or_an_array_in_a_prop_is_a_value_there", () => {   // MO-11c (2026-11-24): a JS component's prop whose declared type holds a `Component` inside a record or an array takes the components written in the literal it is given, each applied among the application's children
    const fs = files({
      "/app/kit.d.rx": "export context region\nexport error Lost\nexport pure fn load(): Promise<string> rejects(Lost)\nexport component Region(props: { children?: View }) provides(region)\nexport component Toaster(props: {}) uses(region)\nexport component Toast(props: { children?: View }) uses(region)\nexport fn toast(message: string | Component): number renders(Toaster)\nexport pure fn createRoute(options: { component: Component }): any renders(Toaster)\nexport fn plain(message: string | Component): number\nexport component Markdown(props: { builtins?: { Heading?: Component<{ depth: number }> }; tabs?: Component[]; table?: Record<string, Component>; one?: Component; meta?: { title: string }; children?: View })\n",
      "/app/md.rx": "import { Markdown } from \"./kit.js\"\ncontext accent: string\ncomponent Heading() {\n  <h2 class={use accent}>x</h2>\n}\ncomponent Plain() {\n  <p>y</p>\n}\nexport default component App() {\n  provide accent = \"dark\"\n  <Markdown builtins={{ Heading: Heading }} tabs={[Plain, Heading]} table={{ h1: Heading, deep: [Plain] }} one={Plain}>{\"# hi\"}</Markdown>\n}\n",
      "/app/mdbad.rx": "import { Markdown } from \"./kit.js\"\ncontext accent: string\ncomponent Heading() {\n  <h2 class={use accent}>x</h2>\n}\ncomponent Plain() {\n  <p>y</p>\n}\nexport default component App() {\n  <Markdown builtins={{ Heading: Heading }}>{\"# hi\"}</Markdown>\n}\n",
      "/app/mdmeta.rx": "import { Markdown } from \"./kit.js\"\ncontext accent: string\ncomponent Heading() {\n  <h2 class={use accent}>x</h2>\n}\ncomponent Plain() {\n  <p>y</p>\n}\nexport default component App() {\n  <Markdown meta={{ title: \"x\", icon: Plain }} />\n}\n",
      "/app/mdone.rx": "import { Markdown } from \"./kit.js\"\ncontext accent: string\ncomponent Heading() {\n  <h2 class={use accent}>x</h2>\n}\ncomponent Plain() {\n  <p>y</p>\n}\nexport default component App() {\n  <Markdown one={{ a: Plain }} />\n}\n",
      "/app/mdname.rx": "import { Markdown } from \"./kit.js\"\ncontext accent: string\ncomponent Heading() {\n  <h2 class={use accent}>x</h2>\n}\ncomponent Plain() {\n  <p>y</p>\n}\nexport default component App() {\n  tabs = [Plain]\n  <Markdown tabs={tabs} />\n}\n",
      "/app/mdnamed.rx": "import { Markdown } from \"./kit.js\"\ncontext accent: string\ncomponent Heading() {\n  <h2 class={use accent}>x</h2>\n}\ncomponent Plain() {\n  <p>y</p>\n}\nbuiltins = { Heading: Heading }\nexport default component App() {\n  provide accent = \"dark\"\n  tabs = [Plain, Heading]\n  <Markdown builtins={builtins} tabs={tabs} />\n  <Markdown tabs={tabs} />\n}\n",
      "/app/mdnamedbad.rx": "import { Markdown } from \"./kit.js\"\ncontext accent: string\ncomponent Heading() {\n  <h2 class={use accent}>x</h2>\n}\ncomponent Plain() {\n  <p>y</p>\n}\nbuiltins = { Heading: Heading }\nexport default component App() {\n  <Markdown builtins={builtins} />\n}\n",
      "/app/mdelse.rx": "import { Markdown, plain } from \"./kit.js\"\ncontext accent: string\ncomponent Heading() {\n  <h2 class={use accent}>x</h2>\n}\ncomponent Plain() {\n  <p>y</p>\n}\nexport default component App() {\n  tabs = [Plain]\n  first = tabs[0]\n  <Markdown tabs={tabs} />\n}\n",
      "/app/mdcall.rx": "import { Markdown, plain } from \"./kit.js\"\ncontext accent: string\ncomponent Heading() {\n  <h2 class={use accent}>x</h2>\n}\ncomponent Plain() {\n  <p>y</p>\n}\nexport default component App() {\n  tabs = [Plain]\n  <Markdown tabs={tabs} />\n  <button onClick={() => { plain(tabs) }}>x</button>\n}\n",
      "/app/mdshadow.rx": "import { Markdown } from \"./kit.js\"\ncontext accent: string\ncomponent Heading() {\n  <h2 class={use accent}>x</h2>\n}\ncomponent Plain() {\n  <p>y</p>\n}\nexport default component App() {\n  tabs = [Plain]\n  <Markdown tabs={tabs} />\n  for tabs in [[1]] { <i>{tabs.length}</i> }\n}\n",
      "/app/mdexport.rx": "import { Markdown } from \"./kit.js\"\ncontext accent: string\ncomponent Heading() {\n  <h2 class={use accent}>x</h2>\n}\ncomponent Plain() {\n  <p>y</p>\n}\nexport tabs = [Plain]\nexport default component App() {\n  <Markdown tabs={tabs} />\n}\n",
      "/app/mdundeclared.rx": "import { Markdown } from \"./kit.js\"\ncontext accent: string\ncomponent Heading() {\n  <h2 class={use accent}>x</h2>\n}\ncomponent Plain() {\n  <p>y</p>\n}\nexport default component App() {\n  <Markdown other={{ a: Plain }} />\n}\n",
    });
    const diags = (name: string) => { const entry = `/app/${name}.rx`; return checkModules(loadModules(entry, fs)).diags.map(x => `${x.code}@${(x.file ?? entry).split("/").pop()}:${x.line}`); };
    deepStrictEqual(diags("md"), []);   // a record, a list, a table and a nested list of components, and a direct one
    deepStrictEqual(diags("mdbad"), ["CONTEXT_NOT_FOUND@mdbad.rx:4"]);   // checked as applied there: the heading's context is not above the component
    deepStrictEqual(diags("mdmeta"), ["COMPONENT_AS_VALUE@mdmeta.rx:10"]);   // a record in a prop whose type holds no component
    deepStrictEqual(diags("mdone"), ["COMPONENT_AS_VALUE@mdone.rx:10"]);   // a record in a prop typed `Component`
    deepStrictEqual(diags("mdname"), []);   // (2026-11-25) a list bound to a name and given only to such a prop is read as the literal
    deepStrictEqual(diags("mdnamed"), []);   // … a module's binding and a component's, the second given to two applications
    deepStrictEqual(diags("mdnamedbad"), ["CONTEXT_NOT_FOUND@mdnamedbad.rx:4"]);   // … checked as applied where it is given
    deepStrictEqual(diags("mdelse"), ["COMPONENT_AS_VALUE@mdelse.rx:10"]);   // … read elsewhere too (`tabs[0]`): a value
    deepStrictEqual(diags("mdcall"), ["COMPONENT_AS_VALUE@mdcall.rx:10"]);   // … given to a fn too
    deepStrictEqual(diags("mdshadow"), ["COMPONENT_AS_VALUE@mdshadow.rx:10"]);   // … a second binding of the name: the count is of the name as written, and errs on that side
    deepStrictEqual(diags("mdexport"), ["COMPONENT_AS_VALUE@mdexport.rx:9"]);   // … exported: a signature says nothing of what a value holds
    deepStrictEqual(diags("mdundeclared"), ["COMPONENT_AS_VALUE@mdundeclared.rx:10"]);   // an undeclared prop
    deepStrictEqual(["{ Heading?: Component<{ depth: number }> }", "Component[]", "Record<string, Component>", "Partial<{ a: Component }> | undefined", "readonly [Component, string]", "Component", "string | Component", "(c: Component) => void", "{ render: (c: Component) => View }", "{ title: string }", "Array<{ view: Component; path: string }>"].map(t => holdsComponent(t)), [true, true, true, true, true, false, false, false, false, false, true]);
  }],
];
