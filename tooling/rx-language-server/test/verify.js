// `rx-verify` (bin/verify.js) on a small module: a hook that really reads a context passes, one that does not is a
// mismatch, as are an export the module lacks and an "error" that is not an Error subclass.
//   node test/verify.js
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const repo = path.resolve(__dirname, "../../..");
const ws = path.join(__dirname, "../.test/verify");
fs.rmSync(ws, { recursive: true, force: true });
fs.mkdirSync(ws, { recursive: true });
fs.symlinkSync(path.join(repo, "ref/node_modules"), path.join(ws, "node_modules"), "dir");
fs.writeFileSync(path.join(ws, "lib.mjs"), [
  "import { createContext, useContext } from \"solid-js\";",
  "const Theme = createContext();",
  "export const useTheme = () => { const t = useContext(Theme); if (!t) throw new Error(\"no theme\"); return t; };",
  "export const useClock = () => Date.now();",
  "export class NotFound extends Error {}",
  "export class Plain {}",
  "// what a store-backed hook does: a field read waits on an async memo, and throws its error",
  "export const useLoad = opts => { const d = createMemo(() => opts().load()); return { get data() { return d(); }, get size() { return 1; } }; };",
  "export const useEager = opts => { const d = createMemo(() => opts().load()); return { get data() { return 1; }, get size() { return d(); } }; };",
  "export const useLater = opts => { const o = getOwner(); return { run: () => runWithOwner(o, () => { const t = useContext(Theme); if (!t) throw new Error(\"no theme\"); return opts().x + t; }) }; };",
  "export const useWrongly = opts => ({ run: () => opts().x });",
  "export { Theme };",
  "export const usePair = () => { const [g] = createSignal(1); return [g, v => {}]; };",
  "export const useBadRef = () => [1, () => {}];",
  "export const double = n => n * 2;",
  "export const roll = () => Math.random();",
  "export const ThemeProvider = props => createComponent(Theme, { value: \"x\", get children() { return props.children; } });",
  "export const FakeProvider = props => props.children;",
  "// an accessor that waits for its first answer and throws its error, alone and as a tuple's part",
  "export const useJson = opts => createMemo(() => opts().load());",
  "export const useQuiet = opts => createMemo(() => opts().load());",
  "export const useParts = opts => [createMemo(() => opts().load()), () => {}];",
  "",
].join("\n").replace("import { createContext, useContext }", "import { createContext, useContext, createMemo, getOwner, runWithOwner, createSignal, createComponent }"));
fs.writeFileSync(path.join(ws, "lib.probe.mjs"), [
  "import { createComponent } from \"solid-js\";",
  "import { Theme } from \"./lib.mjs\";",
  "export const provide = children => createComponent(Theme, { value: \"dark\", get children() { return children(); } });",
  "export const probes = {",
  "  useLoad: { args: () => [() => ({ load: async () => [1] })], fail: () => [() => ({ load: async () => { throw new Error(\"down\"); } })] },",
  "  useEager: { args: () => [() => ({ load: async () => 2 })] },",
  "  useLater: { args: () => [() => ({ x: \"a\" })], run: r => r.run() },",
  "  useWrongly: { args: () => [() => ({ x: \"a\" })], run: r => r.nope() },",
  "  double: { args: () => [3] },",
  "  useJson: { args: () => [() => ({ load: async () => [1] })], fail: () => [() => ({ load: async () => { throw new Error(\"down\"); } })] },",
  "  useQuiet: { args: () => [() => ({ load: async () => [1] })] },",
  "  useParts: { args: () => [() => ({ load: async () => [1] })], fail: () => [() => ({ load: async () => { throw new Error(\"down\"); } })] },",
  "};",
  "",
].join("\n"));
fs.writeFileSync(path.join(ws, "lib.d.rx"), [
  "export context theme",
  "export pure fn useTheme(): string uses(theme)",
  "export pure fn useClock(): number uses(theme)",
  "export pure fn useMissing(): number",
  "export error NotFound",
  "export error Plain",
  "export pure fn useLoad(ref opts: { load: () => Promise<any> }): { data: any; size: number }",
  "export pure fn useEager(ref opts: { load: () => Promise<any> }): { data: any; size: number }",
  "export pure fn useLater(ref opts: { x: string }): any uses(theme)",
  "export pure fn useWrongly(ref opts: { x: string }): any uses(theme)",
  "export pure fn usePair(): [ref number, (v: number) => void]",
  "export pure fn useBadRef(): [ref number, () => void]",
  "export pure fn double(n: number): number",
  "export pure fn roll(): number",
  "export component ThemeProvider(props: { children?: View }) provides(theme)",
  "export component FakeProvider(props: { children?: View }) provides(theme)",
  "export pure fn useJson(ref opts: { load: () => Promise<any> }): pending fails(Error) ref any",
  "export pure fn useQuiet(ref opts: { load: () => Promise<any> }): ref any",
  "export pure fn useParts(ref opts: { load: () => Promise<any> }): [pending fails(Error) ref any, () => void]",
  "",
].join("\n"));

let pass = 0, fail = 0;
function check(name, ok, got) {
  if (ok) pass++; else fail++;
  console.log(`${ok ? "  ✓" : "  ✗"} ${name}${!ok || process.env.VERBOSE ? `\n      ${JSON.stringify(got).slice(0, 2000)}` : ""}`);
}
const r = spawnSync(process.execPath, ["--conditions=browser", path.join(__dirname, "../bin/verify.js"), "lib.d.rx"], { cwd: ws, encoding: "utf8" });
const out = r.stdout + r.stderr;
check("a hook that throws with no provider holds its uses(…)", /lib\.d\.rx:2 ok\s+useTheme: uses\(…\) holds/.test(out), out);
check("a hook that does not is a mismatch", /lib\.d\.rx:3 MISMATCH\s+useClock: declared uses\(…\), but called with no provider it neither throws nor warns/.test(out), out);
check("an export the module lacks is a mismatch", /lib\.d\.rx:4 MISMATCH\s+useMissing: lib\.mjs exports nothing by that name/.test(out), out);
check("an error class is checked to be an Error subclass", /lib\.d\.rx:5 ok\s+NotFound/.test(out) && /lib\.d\.rx:6 MISMATCH\s+Plain: declared an error/.test(out), out);
check("a plain field that waits where it is read is a mismatch, with what to write instead", /lib\.d\.rx:7 MISMATCH\s+useLoad: data holds \(its first read is not ready\): a plain field that waits where it is read has no row — hand it out as a function from a module of the app's own, declared `pending ref`/.test(out), out);
check("...whichever field it is", /lib\.d\.rx:8 MISMATCH\s+useEager: size holds/.test(out), out);
check("a hook that reads its context only when used: the probe's run finds it", /lib\.d\.rx:9 ok\s+useLater: uses\(…\) holds/.test(out), out);
check("a probe whose run throws under its providers too is not evidence", /lib\.d\.rx:10 unverified useWrongly: the probe's run throws under its providers too/.test(out), out);
check("a tuple's ref part is read as an accessor", /lib\.d\.rx:11 ok\s+usePair: its fields read as declared/.test(out), out);
check("a ref part that is not an accessor is a mismatch", /lib\.d\.rx:12 MISMATCH\s+useBadRef: 0 is declared ref, but is not an accessor/.test(out), out);
check("pure: two calls answering alike is not contradicted, and not verified either", /lib\.d\.rx:13 unverified\s+double: pure not contradicted/.test(out), out);
check("pure that answers differently is a mismatch", /lib\.d\.rx:14 MISMATCH\s+roll: declared pure, but two calls/.test(out), out);
check("provides: a hook of the file runs under the component", /lib\.d\.rx:15 ok\s+ThemeProvider: provides\(theme\) holds: useTheme runs under it/.test(out), out);
check("a component that provides nothing is a mismatch", /lib\.d\.rx:16 MISMATCH\s+FakeProvider: declared provides\(theme\), but useTheme, which uses it, still fails under it/.test(out), out);
check("an accessor declared `pending fails(Error) ref` holds, then answers, and fails under the failing arguments (MO-10l)", /lib\.d\.rx:17 ok\s+useJson: its fields read as declared \(the result held, then answered\)/.test(out) && /lib\.d\.rx:17 ok\s+useJson: under the failing arguments it fails with Error, as declared/.test(out), out);
check("...as a part of a tuple", /lib\.d\.rx:19 ok\s+useParts: its fields read as declared \(0 held, then answered\)/.test(out) && /lib\.d\.rx:19 ok\s+useParts: under the failing arguments it fails with Error, as declared/.test(out), out);
check("an accessor that waits and does not say so is no mismatch: the row says less, and that is pointed out", /lib\.d\.rx:18 ok\s+useQuiet: its fields read as declared; the result waited where it was read: `pending ref` would have the checker ask for a loading region/.test(out), out);
check("mismatches fail the run", r.status === 1, r.status);

// MO-11r, MO-10i: placement rows against a scene, and drafts. A small router that is given its routes as records and
// renders each page inside its layout; a "flat" one, declared the same, that renders every route side by side; a store
// whose setter hands its draft, and one that hands a copy.
const router = (flat) => [
  "import { createComponent } from \"solid-js\";",
  flat
    ? "export const createRouter = o => () => o.routes.flatMap(function all(r) { return [createComponent(r.component, {}), ...(r.children ?? []).flatMap(all)]; });"
    : "export const createRouter = o => () => o.routes.map(function one(r) { return createComponent(r.component, { get children() { return (r.children ?? []).map(one); } }); });",
  "",
].join("\n");
const routerDecl = [
  "export context router",
  "export pure fn createRouter(config: { routes: { component: Component; children?: any[] }[] }): Component provides(router) nests(children in component)",
  "",
].join("\n");
const scene = [
  "export const scene = (lib, h) => {",
  "  const Root = h.component(\"Root\", props => props.children);",
  "  const Person = h.component(\"Person\");",
  "  const Router = lib.createRouter({ routes: [{ component: Root, children: [{ component: Person }] }] });",
  "  return () => h.s.createComponent(Router, {});",
  "};",
  "",
].join("\n");
for (const [name, flat] of [["nested", false], ["flat", true]]) {
  fs.writeFileSync(path.join(ws, `${name}.mjs`), router(flat));
  fs.writeFileSync(path.join(ws, `${name}.d.rx`), routerDecl);
  fs.writeFileSync(path.join(ws, `${name}.probe.mjs`), scene);
}
fs.writeFileSync(path.join(ws, "store.mjs"), [
  "import { createStore } from \"solid-js\";",
  "export const makeStore = init => createStore(init);",
  "export const copyStore = init => { const [s, set] = createStore(init); return [s, fn => fn({ ...s })]; };",
  "",
].join("\n"));
fs.writeFileSync(path.join(ws, "store.d.rx"), [
  "export pure fn makeStore(init: any): [any, (update: (draft state: any) => any) => void]",
  "export pure fn copyStore(init: any): [any, (update: (draft state: any) => any) => void]",
  "",
].join("\n"));
fs.writeFileSync(path.join(ws, "unscened.mjs"), router(false));
fs.writeFileSync(path.join(ws, "unscened.d.rx"), routerDecl);
fs.writeFileSync(path.join(ws, "kit.mjs"), [
  "import { createContext, useContext, createComponent } from \"solid-js\";",
  "const Ctx = createContext();",
  "const Trigger = props => { if (!useContext(Ctx)) throw new Error(\"<Dialog.Trigger> outside <Dialog>\"); return props.children; };",
  "const Title = props => props.children;   // declared uses(dialog), but reads nothing",
  "export const Dialog = Object.assign(props => createComponent(Ctx, { value: {}, get children() { return props.children; } }), { Trigger, Title });",
  "",
].join("\n"));
fs.writeFileSync(path.join(ws, "kit.d.rx"), [
  "export context dialog",
  "export component Dialog(props: { children?: View }) provides(dialog)",
  "export component Dialog.Trigger(props: { children?: View }) uses(dialog)",
  "export component Dialog.Title(props: { children?: View }) uses(dialog)",
  "",
].join("\n"));
const r2 = spawnSync(process.execPath, ["--conditions=browser", path.join(__dirname, "../bin/verify.js"), "nested.d.rx", "flat.d.rx", "store.d.rx", "unscened.d.rx", "kit.d.rx"], { cwd: ws, encoding: "utf8" });
const out2 = r2.stdout + r2.stderr;
if (process.env.VERBOSE) console.log(out2);
check("placement: a page renders inside its layout, and both inside the component the factory made (nests(children in component), by a scene)", /nested\.d\.rx:2 ok\s+createRouter: placement holds: Person inside Root; Root inside the made component/.test(out2), out2);
check("placement: a library that renders the page beside its layout is a mismatch", /flat\.d\.rx:2 MISMATCH\s+createRouter: Person renders outside Root/.test(out2), out2);
check("draft: a setter that hands its draft holds", /store\.d\.rx:1 ok\s+makeStore: draft holds/.test(out2), out2);
check("draft: one that hands a copy is a mismatch", /store\.d\.rx:2 MISMATCH\s+copyStore: declared a draft callback, but a write to what it is handed is not kept/.test(out2), out2);
check("a compound part that fails alone and renders inside its root holds its uses(…) (MO-11q)", /kit\.d\.rx:3 ok\s+Dialog\.Trigger: uses\(…\) holds: it fails alone and renders inside Dialog/.test(out2), out2);
check("a part declared uses(…) that reads nothing is a mismatch", /kit\.d\.rx:4 MISMATCH\s+Dialog\.Title: declared uses\(dialog\), but rendered with no provider it neither fails nor warns/.test(out2), out2);
check("the root's provides(…) is checked through a part that uses it alone: it fails without it and renders under it", /kit\.d\.rx:2 ok\s+Dialog: provides\(dialog\) holds: Dialog\.Trigger, which uses it alone, fails without it and renders under it/.test(out2), out2);
check("placement with no scene is not verified, and says so", /unscened\.d\.rx:2 unverified createRouter: where it renders what it is given is not run: give a scene/.test(out2), out2);

// MO-11u, MO-11c, MO-11s: `renders(H)` against a scene, a component given to a prop, and a component called with no
// owner. A toaster whose `toast` hands a component to `<Toaster>`; `show`, to a member (`Board.List`); `popup`, declared
// the same, mounts it under a root of its own; `bare`, with no word, calls it with no owner at all. `Panel` renders the
// component its prop is given beneath itself; `Later`, declared the same, mounts it from a root of its own, later.
fs.writeFileSync(path.join(ws, "toasts.mjs"), [
  "import { createSignal, createComponent, createRoot } from \"solid-js\";",
  "const [items, setItems] = createSignal([]);",
  "const [listed, setListed] = createSignal([]);",
  "export const toast = C => { setItems(xs => [...xs, C]); return 1; };",
  "export const show = C => { setListed(xs => [...xs, C]); return 1; };",
  "export const Toaster = () => () => items().map(C => createComponent(C, {}));",
  "export const Board = { List: () => () => listed().map(C => createComponent(C, {})) };",
  "export const popup = C => { createRoot(() => createComponent(C, {})); return 1; };",
  "export const bare = C => { C({}); return 1; };",
  "export const stray = () => 1;",
  "export const Panel = props => createComponent(props.body, {});",
  "export const Later = props => { const C = props.body; queueMicrotask(() => createRoot(() => createComponent(C, {}))); return null; };",
  "export const Unused = () => null;",
  "",
].join("\n"));
const toastsDecl = [
  "export component Toaster(props: {})",
  "export component Board.List(props: {})",
  "export fn toast(c: Component): number renders(Toaster)",
  "export fn show(c: Component): number renders(Board.List)",
  "// a comment line between rows",
  "export fn popup(c: Component): number renders(Toaster)",
  "export fn bare(c: Component): number",
  "export fn stray(c: Component): number renders(Toaster)",
  "export component Panel(props: { body: Component })",
  "export component Later(props: { body: Component })",
  "export component Unused(props: { tabs: { view: Component }[] })",
  "",
].join("\n");
fs.writeFileSync(path.join(ws, "toasts.d.rx"), toastsDecl);
fs.writeFileSync(path.join(ws, "toasts.probe.mjs"), [
  "let made;",
  "export const scene = (lib, h) => {",
  "  made = Object.fromEntries([\"A\", \"B\", \"P\", \"N\", \"X\", \"Y\"].map(n => [n, h.component(n)]));",
  "  return () => [h.s.createComponent(lib.Toaster, {}), h.s.createComponent(lib.Board.List, {}), h.s.createComponent(lib.Panel, { body: made.X }), h.s.createComponent(lib.Later, { body: made.Y })];",
  "};",
  "export const act = lib => { lib.toast(made.A); lib.show(made.B); lib.popup(made.P); lib.bare(made.N); };",
  "",
].join("\n"));
fs.writeFileSync(path.join(ws, "toasts2.mjs"), fs.readFileSync(path.join(ws, "toasts.mjs"), "utf8"));
fs.writeFileSync(path.join(ws, "toasts2.d.rx"), toastsDecl);
{
  const r = spawnSync(process.execPath, ["--conditions=browser", path.join(__dirname, "../bin/verify.js"), "toasts.d.rx", "toasts2.d.rx"], { cwd: ws, encoding: "utf8" });
  const o = r.stdout + r.stderr;
  if (process.env.VERBOSE) console.log(o);
  check("renders(H): a component the fn is given renders beneath an application of H (by a scene)", /toasts\.d\.rx:3 ok\s+toast: placement holds: A beneath Toaster/.test(o), o);
  check("renders(H): H may be a member of an object (`Board.List`)", /toasts\.d\.rx:4 ok\s+show: placement holds: B beneath Board\.List/.test(o), o);
  check("renders(H): a library that mounts the component under a root of its own is a mismatch", /toasts\.d\.rx:6 MISMATCH\s+popup: P renders outside Toaster/.test(o), o);
  check("a fn with no word that calls the component it is given with no owner is reported (MO-11s)", /toasts\.d\.rx:7 MISMATCH\s+bare: it calls N with no owner/.test(o), o);
  check("renders(H): a fn the scene does not call is not verified", /toasts\.d\.rx:8 unverified stray: the scene does not call it/.test(o), o);
  check("a component given to a prop renders beneath the component it is given to (MO-11c, DV-24, by a scene)", /toasts\.d\.rx:9 ok\s+Panel: placement holds: X \(given as body\) beneath it/.test(o), o);
  check("a component that mounts what its prop is given from a root of its own, later, is a mismatch", /toasts\.d\.rx:10 MISMATCH\s+Later: Y \(given as body\) renders outside it/.test(o), o);
  check("a component the scene does not apply leaves its props unverified", /toasts\.d\.rx:11 unverified Unused: the scene does not apply it/.test(o), o);
  check("with no scene, neither is run: each says to give one", /toasts2\.d\.rx:3 unverified toast: where it renders what it is given is not run: give a scene/.test(o) && /toasts2\.d\.rx:9 unverified Panel: where it renders the component given as body is not run: give a scene/.test(o) && /toasts2\.d\.rx:11 unverified Unused: where it renders the component given as tabs is not run/.test(o) && !/toasts2\.d\.rx:7 (unverified|MISMATCH)/.test(o), o);
  check("a fn declared renders(H) is not run twice to refute `pure`: it makes something each call", !/toasts\.d\.rx:\d+ MISMATCH\s+\w+: declared pure/.test(o), o);
}

// MO-10g: a callback row checked by running — the library calls it outside tracking (a handler), inside a computation
// (a mismatch: the parameter would be `ref`), or never under the probe (unverified).
// MO-8j: `--record` writes what running showed; strict mode refuses the rows not recorded as verified.
fs.writeFileSync(path.join(ws, "cb.mjs"), [
  "import { createMemo } from \"solid-js\";",
  "export const onTick = cb => { queueMicrotask(() => cb(1)); };",
  "export const watchIn = cb => { const m = createMemo(() => cb(2)); m(); };",
  "export const never = cb => {};",
  "export const later = n => n;",
  "export const watchTracked = cb => { const m = createMemo(() => cb(2)); m(); };",
  "export const watchPure = cb => { const m = createMemo(() => cb(2)); m(); };",
  "",
].join("\n"));
fs.writeFileSync(path.join(ws, "cb.probe.mjs"), [
  "export const probes = {",
  "  onTick: { args: () => [n => {}] },",
  "  watchIn: { args: () => [n => n] },",
  "  never: { args: () => [n => {}] },",
  "  watchTracked: { args: () => [n => n] },",
  "  watchPure: { args: () => [n => n] },",
  "};",
  "",
].join("\n"));
const cbDecl = [
  "export fn onTick(cb: handler (n: number) => void): void",
  "export fn watchIn(cb: handler (n: number) => number): void",
  "export fn never(cb: (n: number) => void): void",
  "export fn later(n: number): number",
  "export fn watchTracked(cb: (n: number) => number): void",
  "export fn watchPure(cb: (n: number) => number): void",
  "",
].join("\n");
fs.writeFileSync(path.join(ws, "cb.d.rx"), cbDecl);
fs.rmSync(path.join(ws, "cb.verified.json"), { force: true });
const { checkStrict } = require("../src/strict.js");
const before = checkStrict(path.join(ws, "cb.d.rx"));
check("strict: with no record, every row is refused", before.length === 6 && before.every(u => /nothing verified it/.test(u.message)), before);
const r3 = spawnSync(process.execPath, ["--conditions=browser", path.join(__dirname, "../bin/verify.js"), "--record", "cb.d.rx"], { cwd: ws, encoding: "utf8" });
const out3 = r3.stdout + r3.stderr;
if (process.env.VERBOSE) console.log(out3);
check("callback: called outside tracking holds, as a handler", /cb\.d\.rx:1 ok\s+onTick: callback cb holds/.test(out3), out3);
check("callback: declared handler and called inside a computation is a mismatch (MO-10g)", /cb\.d\.rx:2 MISMATCH\s+watchIn: cb is declared handler, but the library calls it inside a computation/.test(out3), out3);
check("callback: an unmarked function type is pure, which holds inside a computation too", /cb\.d\.rx:6 ok\s+watchPure: cb is pure, as declared/.test(out3), out3);
check("callback: an unmarked one called inside a computation is pure, as declared: no word says more (MO-10g)", /cb\.d\.rx:5 ok\s+watchTracked: cb is pure, as declared; the library calls it inside a computation/.test(out3), out3);
check("callback: never called under the probe is unverified", /cb\.d\.rx:3 unverified never: callback cb never called/.test(out3), out3);
check("--record writes the record beside the declaration", fs.existsSync(path.join(ws, "cb.verified.json")) && /recorded/.test(out3), out3);
const after = checkStrict(path.join(ws, "cb.d.rx"));
check("strict: a verified row passes; a mismatched or unverified one is refused, saying why", after.length === 2 && /mismatch/.test(after.find(u => u.name === "watchIn")?.message) && /could not check/.test(after.find(u => u.name === "never")?.message), after);
fs.writeFileSync(path.join(ws, "cb.d.rx"), cbDecl.replace("onTick(cb: handler (n: number) => void)", "onTick(cb: handler (n: number) => number)"));
const edited = checkStrict(path.join(ws, "cb.d.rx"));
check("strict: a row edited since the record is not verified any more", edited.some(u => u.name === "onTick" && /changed since/.test(u.message)), edited);

// strict mode reads rows through the parser: a `//` inside a string is part of the row, a type that only mentions
// a row spans its lines, and a record holds only for the library and probe it was made against
const { writeRecord } = require("../src/strict.js");
const ux = path.join(ws, "urls.d.rx");
const uxDecl = [
  "export fn link(to: \"https://a.example/one\"): string   // a comment, not the row",
  "export fn word(): \"trusted\"",
  "export fn spaced(): \"a  b\"",
  "export component Card(props: {",
  "  title: string",
  "})",
  "",
].join("\n");
fs.writeFileSync(path.join(ws, "urls.mjs"), "export const link = to => to; export const word = () => \"trusted\"; export const Card = p => p.title;\n");
fs.writeFileSync(path.join(ws, "urls.probe.mjs"), "export const probes = {};\n");
fs.writeFileSync(ux, uxDecl);
fs.rmSync(path.join(ws, "urls.verified.json"), { force: true });
const fresh = checkStrict(ux);
check("strict: a return type that mentions a word that was one (\"trusted\") is a type", fresh.some(u => u.name === "word" && /nothing verified it/.test(u.message)), fresh);
writeRecord(ux, [{ line: 1, status: "ok", what: "link" }, { line: 2, status: "ok", what: "word" }, { line: 3, status: "ok", what: "spaced" }, { line: 5, status: "ok", what: "Card" }]);
check("strict: recorded rows pass", checkStrict(ux).length === 0, checkStrict(ux));
fs.writeFileSync(ux, uxDecl.replace("a comment, not the row", "another comment"));
check("strict: a comment is not part of the row", checkStrict(ux).length === 0, checkStrict(ux));
fs.writeFileSync(ux, uxDecl.replace("https://a.example/one", "https://a.example/two"));
const url = checkStrict(ux);
check("strict: a `//` inside a string literal is part of the row (an edit there loses the record)", url.some(u => u.name === "link" && /changed since/.test(u.message)) && !url.some(u => u.name === "word"), url);
fs.writeFileSync(ux, uxDecl.replace("\"a  b\"", "\"a b\""));
const spaces = checkStrict(ux);
check("strict: whitespace inside a string literal is part of the row (\"a  b\" to \"a b\" loses the record)", spaces.length === 1 && spaces[0].name === "spaced" && /changed since/.test(spaces[0].message), spaces);
fs.writeFileSync(ux, uxDecl.replace("export fn spaced():", "export   fn spaced():  "));
check("strict: whitespace outside string literals is not", checkStrict(ux).length === 0, checkStrict(ux));
fs.writeFileSync(ux, uxDecl.replace("title: string", "title: number"));
const multi = checkStrict(ux);
check("strict: a row spans its lines (an edit on a props line loses the record)", multi.some(u => u.name === "Card" && /changed since/.test(u.message)), multi);
fs.writeFileSync(ux, uxDecl);
fs.writeFileSync(path.join(ws, "urls.probe.mjs"), "export const probes = { link: { args: () => [\"x\"] } };\n");
const probeMoved = checkStrict(ux);
check("strict: a record made with another probe does not count", probeMoved.length === 4 && probeMoved.every(u => /probe changed since/.test(u.message)), probeMoved);
fs.writeFileSync(path.join(ws, "urls.probe.mjs"), "export const probes = {};\n");
fs.writeFileSync(path.join(ws, "urls.mjs"), "export const link = to => to + \"!\"; export const word = () => \"trusted\"; export const Card = p => p.title;\n");
const modMoved = checkStrict(ux);
check("strict: a record made against another version of the module does not count", modMoved.length === 4 && modMoved.every(u => /module urls\.mjs changed since/.test(u.message)), modMoved);

// MO-8j: rx-verify reads the rows the crate reads, and a record needs every claim answered: a provider whose props record
// is broken over lines, with `provides(theme)` on the last, and nothing in the file that uses theme, is not verified —
// on one line or on three, the same
const boxRun = decl => {
  fs.writeFileSync(path.join(ws, "box.mjs"), "export const Box = p => p.label;\n");
  fs.writeFileSync(path.join(ws, "box.d.rx"), decl);
  fs.rmSync(path.join(ws, "box.verified.json"), { force: true });
  const r = spawnSync(process.execPath, ["--conditions=browser", path.join(__dirname, "../bin/verify.js"), "--record", "box.d.rx"], { cwd: ws, encoding: "utf8" });
  return { out: r.stdout + r.stderr, strict: checkStrict(path.join(ws, "box.d.rx")) };
};
const oneLine = boxRun("export context theme\nexport component Box(props: { label: string }) provides(theme)\n");
const threeLines = boxRun("export context theme\nexport component Box(props: {\n  label: string\n}) provides(theme)\n");
check("a provides(…) on a row's later line is read: unverified, as on one line", /box\.d\.rx:2 unverified Box: provides\(theme\) not run/.test(oneLine.out) && /box\.d\.rx:2 unverified Box: provides\(theme\) not run/.test(threeLines.out) && !/ok\s+— Box/.test(threeLines.out), threeLines.out);
check("...and strict refuses it either way (no `ok` for a row with a claim nothing ran)", oneLine.strict.some(u => u.name === "Box") && threeLines.strict.some(u => u.name === "Box" && /could not check it/.test(u.message)), threeLines.strict);
// a claim no check of rx-verify's answers (here where a made component renders what it is given, with no scene) is
// recorded as not verified, not passed over
fs.writeFileSync(path.join(ws, "fw.mjs"), "export const wrap = c => c;\n");
fs.writeFileSync(path.join(ws, "fw.d.rx"), "export fn wrap(c: Component): Component\n");
const fw = spawnSync(process.execPath, ["--conditions=browser", path.join(__dirname, "../bin/verify.js"), "--record", "fw.d.rx"], { cwd: ws, encoding: "utf8" });
check("a claim nothing in rx-verify runs is unverified, and strict refuses the row", /fw\.d\.rx:1 unverified wrap: where it renders/.test(fw.stdout) && checkStrict(path.join(ws, "fw.d.rx")).some(u => u.name === "wrap"), fw.stdout + fw.stderr);
// a record an older rx-verify wrote (no version: its checks missed claims) no longer counts
const recFile = path.join(ws, "cb.verified.json");
const rec = JSON.parse(fs.readFileSync(recFile, "utf8"));
fs.writeFileSync(path.join(ws, "cb.d.rx"), fs.readFileSync(path.join(ws, "cb.d.rx"), "utf8"));
const okBefore = checkStrict(path.join(ws, "cb.d.rx")).length;
delete rec.version; fs.writeFileSync(recFile, JSON.stringify(rec));
const old = checkStrict(path.join(ws, "cb.d.rx"));
check("strict: a record from an older rx-verify does not count (its passes may be false)", old.length > okBefore && old.every(u => /older rx-verify|changed since|could not|mismatch/.test(u.message)) && old.some(u => /older rx-verify/.test(u.message)), old);

// RFC 28, 29: each named context and each callback position is a claim of its own. `Both` declares provides(a, b) and
// provides only `a`, and the file's one hook uses only `a`: `provides(a)` holds, `b` is unverified, and strict refuses the
// row. `Lone`'s `ref` prop is a handler: that its export is a function says nothing of how it calls it
fs.writeFileSync(path.join(ws, "both.mjs"), [
  "import { createContext, useContext, createComponent } from \"solid-js\";",
  "const A = createContext();",
  "export const useA = () => { const v = useContext(A); if (!v) throw new Error(\"no a\"); return v; };",
  "export const Both = props => createComponent(A, { value: \"x\", get children() { return props.children; } });",
  "export const Lone = props => null;",
  "",
].join("\n"));
fs.writeFileSync(path.join(ws, "both.d.rx"), [
  "export context a",
  "export context b",
  "export pure fn useA(): string uses(a)",
  "export component Both(props: { children?: View }) provides(a, b)",
  "export component Lone(props: { ref?: handler (el: number) => void })",
  "",
].join("\n"));
fs.rmSync(path.join(ws, "both.verified.json"), { force: true });
const both = spawnSync(process.execPath, ["--conditions=browser", path.join(__dirname, "../bin/verify.js"), "--record", "both.d.rx"], { cwd: ws, encoding: "utf8" });
const bothStrict = checkStrict(path.join(ws, "both.d.rx"));
check("provides(a, b): a hook that uses only a answers provides(a) alone; b is unverified", /both\.d\.rx:4 ok\s+Both: provides\(a\) holds: useA runs under it/.test(both.stdout) && /both\.d\.rx:4 unverified Both: provides\(b\) not run/.test(both.stdout) && !/provides\(…\) holds/.test(both.stdout), both.stdout + both.stderr);
check("...and strict refuses the row (no `ok` record for provides(a, b))", bothStrict.some(u => u.name === "Both" && /could not check it/.test(u.message)), bothStrict);
check("a component's handler prop it never calls: unverified, and strict refuses it", /both\.d\.rx:5 unverified Lone: prop ref never called/.test(both.stdout) && bothStrict.some(u => u.name === "Lone" && /could not check it/.test(u.message)), { out: both.stdout, bothStrict });
const bothRec = JSON.parse(fs.readFileSync(path.join(ws, "both.verified.json"), "utf8"));
check("...in a version-6 record", bothRec.version === 6 && !Object.values(bothRec.rows).some(r => r.line === 5 && r.status === "ok"), bothRec);

// RFC 28 (revised after review): provides(b) is not shown by a hook declared uses(a, b) that reads only a, nor by a part
// that still fails under the provider; only actual provision verifies it
fs.writeFileSync(path.join(ws, "prov.mjs"), [
  "import { createContext, useContext, createComponent } from \"solid-js\";",
  "const A = createContext(); const B = createContext();",
  "export const useAB = () => { const v = useContext(A); if (!v) throw new Error(\"no a\"); return v; };",
  "export const Both = props => createComponent(A, { value: \"x\", get children() { return props.children; } });",
  "export const Part = props => { if (!useContext(B)) throw new Error(\"no b\"); return null; };",
  "export const OnlyA = props => createComponent(A, { value: \"x\", get children() { return props.children; } });",
  "",
].join("\n"));
fs.writeFileSync(path.join(ws, "prov.d.rx"), [
  "export context a",
  "export context b",
  "export pure fn useAB(): string uses(a, b)",
  "export component Both(props: { children?: View }) provides(a, b)",
  "export component Part(props: {}) uses(b)",
  "",
].join("\n"));
const prov = spawnSync(process.execPath, ["--conditions=browser", path.join(__dirname, "../bin/verify.js"), "prov.d.rx"], { cwd: ws, encoding: "utf8" });
check("a hook declared uses(a, b) answers neither provides(a) nor provides(b)", /prov\.d\.rx:4 unverified Both: provides\(a\) not run/.test(prov.stdout) && !/provides\(a\) holds|provides\(b\) holds/.test(prov.stdout), prov.stdout + prov.stderr);
check("a part that uses b alone and still fails under the component: provides(b) is a mismatch, not ok", /prov\.d\.rx:4 MISMATCH\s+Both: declared provides\(b\), but Part, which uses it, still fails under it/.test(prov.stdout), prov.stdout + prov.stderr);

// RFC 29 (revised after review): a component's function-typed props are run — the probe's props, each wrapped in a spy:
// a handler called later holds, one called inside a computation is a mismatch, an unmarked one holds however it is
// called, and strict mode then accepts the row
fs.writeFileSync(path.join(ws, "props.mjs"), [
  "import { createEffect, createMemo } from \"solid-js\";",
  "export const Later = props => { queueMicrotask(() => props.onPress()); return null; };",
  "export const Now = props => { createMemo(() => props.onPress()); return null; };",
  "export const Each = props => { createEffect(() => props.each(), () => {}); return null; };",
  "export const Pick = props => { props.pick(1); return null; };",
  "",
].join("\n"));
fs.writeFileSync(path.join(ws, "props.d.rx"), [
  "export component Later(props: { onPress: handler () => void })",
  "export component Now(props: { onPress: handler () => void })",
  "export component Each(props: { each: () => number })",
  "export component Pick(props: { pick: (n: number) => number })",
  "",
].join("\n"));
fs.rmSync(path.join(ws, "props.verified.json"), { force: true });
const pr = spawnSync(process.execPath, ["--conditions=browser", path.join(__dirname, "../bin/verify.js"), "--record", "props.d.rx"], { cwd: ws, encoding: "utf8" });
check("a handler prop the component calls later holds", /props\.d\.rx:1 ok\s+Later: prop onPress holds/.test(pr.stdout), pr.stdout + pr.stderr);
check("a handler prop it calls inside a computation is a mismatch", /props\.d\.rx:2 MISMATCH\s+Now: prop onPress is declared handler, but the component calls it inside a computation/.test(pr.stdout), pr.stdout + pr.stderr);
check("an unmarked prop is pure however it is called: inside a computation, or while it renders", /props\.d\.rx:3 ok\s+Each: prop each is pure/.test(pr.stdout) && /props\.d\.rx:4 ok\s+Pick: prop pick is pure/.test(pr.stdout), pr.stdout + pr.stderr);
const prStrict = checkStrict(path.join(ws, "props.d.rx"));
check("...and strict mode accepts those rows, refusing only the mismatch", !prStrict.some(u => ["Later", "Each", "Pick"].includes(u.name)) && prStrict.some(u => u.name === "Now"), prStrict);

// MO-8k's first place: a project's declaration of a package, `rx-types/<package>.d.rx`, is paired with the module that
// import resolves to from the folder that holds `rx-types/` (it was "no JS module beside": no such row could be shown)
{
  const pkg = path.join(ws, "node_modules/tickpkg"); fs.mkdirSync(pkg, { recursive: true }); fs.mkdirSync(path.join(ws, "rx-types"), { recursive: true });
  fs.writeFileSync(path.join(pkg, "package.json"), JSON.stringify({ name: "tickpkg", version: "1.0.0", type: "module", exports: { ".": "./index.mjs" } }));
  fs.writeFileSync(path.join(pkg, "index.mjs"), "export const onTick = cb => { setTimeout(() => cb(1), 0); };\n");
  fs.writeFileSync(path.join(ws, "rx-types/tickpkg.d.rx"), "export fn onTick(cb: handler (n: number) => void): void\n");
  fs.writeFileSync(path.join(ws, "rx-types/tickpkg.probe.mjs"), "export const probes = { onTick: { args: () => [n => {}] } };\n");
  fs.writeFileSync(path.join(ws, "rx-types/nopkg.d.rx"), "export fn nothing(): void\n");
  fs.rmSync(path.join(ws, "rx-types/tickpkg.verified.json"), { force: true });
  const rp = spawnSync(process.execPath, ["--conditions=browser", path.join(__dirname, "../bin/verify.js"), "--record", "rx-types/tickpkg.d.rx", "rx-types/nopkg.d.rx"], { cwd: ws, encoding: "utf8" });
  const outp = rp.stdout + rp.stderr;
  check("a project's declaration of a package (rx-types/) is run against the package it declares", /tickpkg\.d\.rx:1 ok\s+onTick: callback cb holds/.test(outp), outp);
  check("...its record is written beside it, and strict mode accepts the row", fs.existsSync(path.join(ws, "rx-types/tickpkg.verified.json")) && checkStrict(path.join(ws, "rx-types/tickpkg.d.rx")).length === 0, checkStrict(path.join(ws, "rx-types/tickpkg.d.rx")));
  check("...and one whose package does not resolve says so", /nopkg\.d\.rx.*not a project's declaration of a package that resolves/.test(outp), outp);
}

// 09 MO-14: a host declaration (`host.d.rx`) declares no module's exports: its view is run against the probe's scene
{
  const NAV = "import { createContext, useContext } from \"solid-js\";\nexport const Nav = createContext();\nexport const useNav = () => { const n = useContext(Nav); if (!n) throw new Error(\"no nav\"); return n; };\n";
  const HOST = "// what the host renders\nimport { Layout, Home } from \"./pages.rx\"\nimport { Page } from \"./page.rx\"\nexport context nav from \"./nav.mjs\"\nexport default component provides(nav) nests(children in component) = [\n  { component: Layout, children: [{ component: Home }, { component: Page }] }\n]\n";
  const probe = view => `import { createComponent } from "solid-js";\nimport { Nav, useNav } from "./nav.mjs";\nexport const scene = (rx, h) => () => ${view};\nexport const uses = { nav: () => useNav() };\n`;
  const under = inner => `createComponent(Nav, { value: {}, get children() { return ${inner}; } })`;
  const cases = {
    held: probe(under("createComponent(rx.Layout, { get children() { return [createComponent(rx.Home, {}), createComponent(rx.Page, {})]; } })")),
    beside: probe(under("[createComponent(rx.Layout, { get children() { return createComponent(rx.Home, {}); } }), createComponent(rx.Page, {})]")),
    bare: probe("createComponent(rx.Layout, { get children() { return [createComponent(rx.Home, {}), createComponent(rx.Page, {})]; } })"),
    partly: probe(under("createComponent(rx.Layout, { get children() { return createComponent(rx.Home, {}); } })")),
  };
  const run = (name, text, flags = []) => {
    const dir = path.join(ws, `host-${name}`); fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "nav.mjs"), NAV); fs.writeFileSync(path.join(dir, "nav.d.rx"), "export context nav\nexport pure fn useNav(): { } instantiates uses(nav)\n"); fs.writeFileSync(path.join(dir, "host.d.rx"), HOST);
    if (text) fs.writeFileSync(path.join(dir, "host.probe.mjs"), text);
    const r = spawnSync(process.execPath, ["--conditions=browser", path.join(__dirname, "../bin/verify.js"), ...flags, "host.d.rx"], { cwd: dir, encoding: "utf8" });
    return { out: r.stdout + r.stderr, status: r.status, dir };
  };
  const held = run("held", cases.held, ["--record"]);
  check("a host declaration's view is held to the probe's scene: each page inside its layout", /host\.d\.rx:5 ok\s+the host's view holds: Home inside Layout; Page inside Layout/.test(held.out), held.out);
  check("...and each context it provides: the hook that uses it runs in every component", /host\.d\.rx:5 ok\s+the host's view: provides\(nav\) holds: the hook that uses it runs in Layout, Home, Page/.test(held.out) && held.status === 0, held.out);
  check("...its record is written, and strict mode accepts the row", fs.existsSync(path.join(held.dir, "host.verified.json")) && checkStrict(path.join(held.dir, "host.d.rx")).length === 0, JSON.stringify(checkStrict(path.join(held.dir, "host.d.rx"))));
  const beside = run("beside", cases.beside);
  check("a page the host renders outside its declared layout is a mismatch", /host\.d\.rx:5 MISMATCH\s+the host's view: Page renders outside Layout/.test(beside.out) && beside.status === 1, beside.out);
  const bare = run("bare", cases.bare);
  check("a host that does not provide a declared context is a mismatch", /host\.d\.rx:5 MISMATCH\s+the host's view: declared provides\(nav\), but the hook that uses it fails in Layout, Home, Page/.test(bare.out), bare.out);
  const partly = run("partly", cases.partly);
  check("a component the scene never renders is not verified, and named", /host\.d\.rx:5 unverified the host's view: the scene does not render Page/.test(partly.out) && partly.status === 0, partly.out);
  const none = run("none", null);
  check("with no scene, nothing of the view is verified", (none.out.match(/host\.d\.rx:5 unverified the host's view is not run: give a scene/g) ?? []).length === 2, none.out);
  // MO-14f: a component the declaration imports from JavaScript is one the host renders through. The scene applies
  // `rx.Slot` where the app's layout applies the real one; the probe gives the real one as `through.Slot`
  const SLOT = "export const Pages = createContext(() => null);\nexport const Slot = () => useContext(Pages)();\n";
  const HOST2 = "import { Layout, Home } from \"./pages.rx\"\nimport { Slot } from \"./nav.mjs\"\nexport context nav from \"./nav.mjs\"\nexport default component provides(nav) nests(children in component) = [{ component: Layout, children: [{ component: Home }] }]\n";
  const probe2 = (view, extra = "export const through = { Slot };\n") => `import { createComponent } from "solid-js";\nimport { Nav, useNav, Pages, Slot } from "./nav.mjs";\nexport const scene = (rx, h) => () => ${view};\nexport const uses = { nav: () => useNav() };\n${extra}`;
  const routed = slot => under(`createComponent(Pages, { value: () => createComponent(rx.Home, {}), get children() { return createComponent(rx.Layout, { get children() { return ${slot}; } }); } })`);
  const run2 = (name, text, flags = []) => {
    const dir = path.join(ws, `host-${name}`); fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "nav.mjs"), NAV + SLOT); fs.writeFileSync(path.join(dir, "nav.d.rx"), "export context nav\nexport pure fn useNav(): { } instantiates uses(nav)\nexport component Slot(props: {})\n"); fs.writeFileSync(path.join(dir, "host.d.rx"), HOST2); fs.writeFileSync(path.join(dir, "host.probe.mjs"), text);
    const r = spawnSync(process.execPath, ["--conditions=browser", path.join(__dirname, "../bin/verify.js"), ...flags, "host.d.rx"], { cwd: dir, encoding: "utf8" });
    return { out: r.stdout + r.stderr, status: r.status, dir };
  };
  const through = run2("through", probe2(routed("createComponent(rx.Slot, {})")), ["--record"]);
  check("a component the host renders through: the page renders inside it, where the layout applies it", /host\.d\.rx:2 ok\s+the host's view: rendered through Slot: Home/.test(through.out) && /host\.d\.rx:4 ok\s+the host's view holds: Home inside Layout/.test(through.out) && through.status === 0, through.out);
  check("...its record holds the import's row beside the view's, and strict mode accepts both", checkStrict(path.join(through.dir, "host.d.rx")).length === 0 && Object.keys(JSON.parse(fs.readFileSync(path.join(through.dir, "host.verified.json"), "utf8")).rows).length === 2, JSON.stringify(checkStrict(path.join(through.dir, "host.d.rx"))));
  const direct = run2("direct", probe2(routed("createComponent(rx.Home, {})")), ["--record"]);
  check("a scene that never applies it leaves the import unverified, and strict mode refuses that row", /host\.d\.rx:2 unverified the host's view: the scene does not apply rx\.Slot/.test(direct.out) && checkStrict(path.join(direct.dir, "host.d.rx")).map(u => u.line).join() === "2", direct.out + JSON.stringify(checkStrict(path.join(direct.dir, "host.d.rx"))));
  const empty = run2("empty", probe2(under("[createComponent(rx.Layout, { get children() { return createComponent(rx.Slot, {}); } }), createComponent(rx.Home, {})]")));
  check("applied, with nothing of the view rendered inside it: a mismatch", /host\.d\.rx:2 MISMATCH\s+the host's view: declared rendered through Slot, and nothing the view names renders inside it/.test(empty.out) && empty.status === 1, empty.out);
  const ungiven = run2("ungiven", probe2(routed("createComponent(rx.Slot, {})"), ""));
  check("with no component given for it, it is not verified", /host\.d\.rx:2 unverified the host's view: Slot is not run: give the component as the probe's through\.Slot/.test(ungiven.out), ungiven.out);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
