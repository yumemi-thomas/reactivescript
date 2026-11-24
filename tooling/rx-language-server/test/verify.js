// `rx-verify` (bin/verify.js) on a small module: a hook that really reads a context passes, one that does not is a
// mismatch, as are an export the module lacks and an "error" that is not an Error subclass.
//   node test/verify.js
// (MO-8v) The modules these tests draft are stand-ins for their types: a body of one line that does nothing. What the code
// proves is test/infer.js's; here the draft is the types' alone, as `rx-declare --no-infer` writes it.
process.env.RX_DECLARE_INFER = "0";
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
check("a hook that throws with no provider holds its uses(…)", /lib\.d\.rx:2 held\s+useTheme: uses\(theme\) holds: with no provider it fails \(.*\), and under ThemeProvider it runs/.test(out), out);
check("a hook that does not is a mismatch", /lib\.d\.rx:3 MISMATCH\s+useClock: declared uses\(theme\), but with no provider it neither throws nor warns/.test(out), out);
check("an export the module lacks is a mismatch", /lib\.d\.rx:4 MISMATCH\s+useMissing: lib\.mjs exports nothing by that name/.test(out), out);
check("an error class is checked to be an Error subclass", /lib\.d\.rx:5 held\s+NotFound/.test(out) && /lib\.d\.rx:6 MISMATCH\s+Plain: declared an error/.test(out), out);
check("a plain field that waits where it is read is a mismatch, with what to write instead", /lib\.d\.rx:7 MISMATCH\s+useLoad: data holds \(its first read is not ready\): a plain field that waits where it is read has no row — hand it out as a function from a module of the app's own, declared `pending ref`/.test(out), out);
check("...whichever field it is", /lib\.d\.rx:8 MISMATCH\s+useEager: size holds/.test(out), out);
check("a hook that reads its context only when used: the probe's run finds it", /lib\.d\.rx:9 held\s+useLater: uses\(theme\) holds/.test(out), out);
check("a probe whose run throws under its providers too is not evidence", /lib\.d\.rx:10 unverified useWrongly: uses\(theme\) not shown: it fails under ThemeProvider too/.test(out), out);
check("a tuple's ref part is read as an accessor", /lib\.d\.rx:11 held\s+usePair: its fields read as declared/.test(out), out);
check("a ref part that is not an accessor is a mismatch", /lib\.d\.rx:12 MISMATCH\s+useBadRef: 0 is declared ref, but is not an accessor/.test(out), out);
check("pure: proven by the code and not refuted by two calls, it is held by that proof (running alone cannot show it)", /lib\.d\.rx:13 held\s+double: pure is proven by the code/.test(out), out);
check("pure that answers differently is a mismatch", /lib\.d\.rx:14 MISMATCH\s+roll: declared pure, but two calls/.test(out), out);
check("provides: a hook of the file runs under the component", /lib\.d\.rx:15 held\s+ThemeProvider: provides\(theme\) holds: useTheme, which fails without it, runs under it/.test(out), out);
check("a component that provides nothing is a mismatch", /lib\.d\.rx:16 MISMATCH\s+FakeProvider: declared provides\(theme\), but useTheme, which uses it, still fails under it/.test(out), out);
check("an accessor declared `pending fails(Error) ref` holds, then answers, and fails under the failing arguments (MO-10l)", /lib\.d\.rx:17 held\s+useJson: its fields read as declared \(the result held, then answered\)/.test(out) && /lib\.d\.rx:17 held\s+useJson: under the failing arguments it fails with Error, as declared/.test(out), out);
check("...as a part of a tuple", /lib\.d\.rx:19 held\s+useParts: its fields read as declared \(0 held, then answered\)/.test(out) && /lib\.d\.rx:19 held\s+useParts: under the failing arguments it fails with Error, as declared/.test(out), out);
check("an accessor that waits and does not say so is no mismatch: the row says less, and that is pointed out", /lib\.d\.rx:18 held\s+useQuiet: its fields read as declared; the result waited where it was read: `pending ref` would have the checker ask for a loading region/.test(out), out);
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
check("placement: a page renders inside its layout, and both inside the component the factory made (nests(children in component), by a scene)", /nested\.d\.rx:2 held\s+createRouter: placement holds: Person inside Root; Root inside the made component/.test(out2), out2);
check("placement: a library that renders the page beside its layout is a mismatch", /flat\.d\.rx:2 MISMATCH\s+createRouter: Person renders outside Root/.test(out2), out2);
check("draft: a setter that hands its draft holds", /store\.d\.rx:1 held\s+makeStore: draft holds/.test(out2), out2);
check("draft: one that hands a copy is a mismatch", /store\.d\.rx:2 MISMATCH\s+copyStore: declared a draft callback, but a write to what it is handed is not kept/.test(out2), out2);
check("a compound part that fails alone and renders inside its root holds its uses(…) (MO-11q)", /kit\.d\.rx:3 held\s+Dialog\.Trigger: uses\(dialog\) holds: with no provider it fails \(.*\), and under Dialog it runs/.test(out2), out2);
check("a part declared uses(…) that reads nothing is a mismatch", /kit\.d\.rx:4 MISMATCH\s+Dialog\.Title: declared uses\(dialog\), but with no provider it neither throws nor warns/.test(out2), out2);
check("the root's provides(…) is checked through a part that uses it alone: it fails without it and renders under it", /kit\.d\.rx:2 held\s+Dialog: provides\(dialog\) holds: Dialog\.Trigger, which uses it alone, fails without it and renders under it/.test(out2), out2);
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
  check("renders(H): a component the fn is given renders beneath an application of H (by a scene)", /toasts\.d\.rx:3 held\s+toast: placement holds: A beneath Toaster/.test(o), o);
  check("renders(H): H may be a member of an object (`Board.List`)", /toasts\.d\.rx:4 held\s+show: placement holds: B beneath Board\.List/.test(o), o);
  check("renders(H): a library that mounts the component under a root of its own is a mismatch", /toasts\.d\.rx:6 MISMATCH\s+popup: P renders outside Toaster/.test(o), o);
  check("a fn with no word that calls the component it is given with no owner is reported (MO-11s)", /toasts\.d\.rx:7 MISMATCH\s+bare: it calls N with no owner/.test(o), o);
  check("renders(H): a fn the scene does not call is not verified", /toasts\.d\.rx:8 unverified stray: the scene does not call it/.test(o), o);
  check("a component given to a prop renders beneath the component it is given to (MO-11c, DV-24, by a scene)", /toasts\.d\.rx:9 held\s+Panel: placement holds: X \(given as body\) beneath it/.test(o), o);
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
  "export fn never(cb: handler (n: number) => void): void",
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
check("callback: called outside tracking holds, as a handler", /cb\.d\.rx:1 held\s+onTick: callback cb holds/.test(out3), out3);
check("callback: declared handler and called inside a computation is a mismatch (MO-10g)", /cb\.d\.rx:2 MISMATCH\s+watchIn: cb is declared handler, but the library calls it inside a computation/.test(out3), out3);
check("callback: an unmarked function type claims nothing of the library", /cb\.d\.rx:6 n\/a\s+watchPure: cb is unmarked/.test(out3), out3);
check("callback: ...and one called inside a computation is safe there (MO-10g)", /cb\.d\.rx:5 n\/a\s+watchTracked: cb is unmarked/.test(out3), out3);
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
writeRecord(ux, [1, 2, 3, 5].map(line => ({ line, ob: "exists", status: "held", what: "exported" })));
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
check("...and strict refuses it either way (no `ok` for a row with a claim nothing ran)", oneLine.strict.some(u => u.name === "Box") && threeLines.strict.some(u => u.name === "Box" && /could not check provides\(theme\)/.test(u.message)), threeLines.strict);
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
check("provides(a, b): a hook that uses only a answers provides(a) alone; b is unverified", /both\.d\.rx:4 held\s+Both: provides\(a\) holds: useA, which fails without it, runs under it/.test(both.stdout) && /both\.d\.rx:4 unverified Both: provides\(b\) not run/.test(both.stdout) && !/provides\(…\) holds/.test(both.stdout), both.stdout + both.stderr);
check("...and strict refuses the row (no `ok` record for provides(a, b))", bothStrict.some(u => u.name === "Both" && /could not check provides\(b\)/.test(u.message)) && !bothStrict.some(u => u.name === "useA"), bothStrict);
check("a component's handler prop it never calls: unverified, and strict refuses it", /both\.d\.rx:5 unverified Lone: prop ref never called/.test(both.stdout) && bothStrict.some(u => u.name === "Lone" && /could not check callback ref/.test(u.message)), { out: both.stdout, bothStrict });
const bothRec = JSON.parse(fs.readFileSync(path.join(ws, "both.verified.json"), "utf8"));
check("...in a version-9 record, which holds each claim's own result", bothRec.version === 9 && Object.values(bothRec.rows).find(r => r.line === 4).claims["provides:a"].status === "held" && Object.values(bothRec.rows).find(r => r.line === 4).claims["provides:b"].status === "unverified" && Object.values(bothRec.rows).find(r => r.line === 5).claims["callbacks:ref"].status === "unverified", bothRec);

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
check("a hook declared uses(a, b) answers neither provides(a) nor provides(b)", /prov\.d\.rx:3 unverified useAB: uses\(b\) not shown apart: Both provides b and another context it names at once/.test(prov.stdout) && !/provides\(a\) holds|provides\(b\) holds/.test(prov.stdout), prov.stdout + prov.stderr);
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
check("a handler prop the component calls later holds", /props\.d\.rx:1 held\s+Later: prop onPress holds/.test(pr.stdout), pr.stdout + pr.stderr);
check("a handler prop it calls inside a computation is a mismatch", /props\.d\.rx:2 MISMATCH\s+Now: prop onPress is declared handler, but the component calls it inside a computation/.test(pr.stdout), pr.stdout + pr.stderr);
check("an unmarked prop claims nothing of how it is called", /props\.d\.rx:3 n\/a\s+Each: prop each is unmarked/.test(pr.stdout) && /props\.d\.rx:4 n\/a\s+Pick: prop pick is unmarked/.test(pr.stdout), pr.stdout + pr.stderr);
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
  check("a project's declaration of a package (rx-types/) is run against the package it declares", /tickpkg\.d\.rx:1 held\s+onTick: callback cb holds/.test(outp), outp);
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
  check("a host declaration's view is held to the probe's scene: each page inside its layout", /host\.d\.rx:5 held\s+the host's view holds: Home inside Layout; Page inside Layout/.test(held.out), held.out);
  check("...and each context it provides: the hook that uses it runs in every component", /host\.d\.rx:5 held\s+the host's view: provides\(nav\) holds: the hook that uses it runs in Layout, Home, Page/.test(held.out) && held.status === 0, held.out);
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
  check("a component the host renders through: the page renders inside it, where the layout applies it", /host\.d\.rx:2 held\s+the host's view: rendered through Slot: Home/.test(through.out) && /host\.d\.rx:4 held\s+the host's view holds: Home inside Layout/.test(through.out) && through.status === 0, through.out);
  check("...its record holds the import's row beside the view's, and strict mode accepts both", checkStrict(path.join(through.dir, "host.d.rx")).length === 0 && Object.keys(JSON.parse(fs.readFileSync(path.join(through.dir, "host.verified.json"), "utf8")).rows).length === 2, JSON.stringify(checkStrict(path.join(through.dir, "host.d.rx"))));
  const direct = run2("direct", probe2(routed("createComponent(rx.Home, {})")), ["--record"]);
  check("a scene that never applies it leaves the import unverified, and strict mode refuses that row", /host\.d\.rx:2 unverified the host's view: the scene does not apply rx\.Slot/.test(direct.out) && checkStrict(path.join(direct.dir, "host.d.rx")).map(u => u.line).join() === "2", direct.out + JSON.stringify(checkStrict(path.join(direct.dir, "host.d.rx"))));
  const empty = run2("empty", probe2(under("[createComponent(rx.Layout, { get children() { return createComponent(rx.Slot, {}); } }), createComponent(rx.Home, {})]")));
  check("applied, with nothing of the view rendered inside it: a mismatch", /host\.d\.rx:2 MISMATCH\s+the host's view: declared rendered through Slot, and nothing the view names renders inside it/.test(empty.out) && empty.status === 1, empty.out);
  const ungiven = run2("ungiven", probe2(routed("createComponent(rx.Slot, {})"), ""));
  check("with no component given for it, it is not verified", /host\.d\.rx:2 unverified the host's view: Slot is not run: give the component as the probe's through\.Slot/.test(ungiven.out), ungiven.out);
}

// 10 SV-7c: `pure` is run on the other side too — a second process, with a browser's globals when this one has none
{
  const dir = path.join(ws, "sides"); fs.mkdirSync(dir, { recursive: true });
  fs.symlinkSync(path.join(repo, "ref/node_modules"), path.join(dir, "node_modules"), "dir");
  fs.writeFileSync(path.join(dir, "env.mjs"), "export const whereNow = () => (typeof window === \"undefined\" ? \"the server\" : \"the browser\");\nexport const label = n => `#${n}`;\nlet n = 0;\nexport const nextId = () => `id${n++}`;\nexport const whereAmI = async () => typeof window;\n");
  fs.writeFileSync(path.join(dir, "env.d.rx"), "export pure fn whereNow(): string\nexport pure fn label(n: number): string\nexport pure fn nextId(): string\nexport client pure fn whereAmI(): Promise<string>\n");
  fs.writeFileSync(path.join(dir, "env.probe.mjs"), "export const probes = { label: { args: () => [1] } };\n");
  const happy = (() => { try { require.resolve("@happy-dom/global-registrator", { paths: [dir] }); return true; } catch { return false; } })();
  const o = spawnSync(process.execPath, ["--conditions=browser", path.join(__dirname, "../bin/verify.js"), "env.d.rx"], { cwd: dir, encoding: "utf8" }).stdout;
  if (happy) check("a `pure` fn that answers differently with a window than without is a mismatch: the page would be served with one answer and hydrated with the other (SV-7c)", /env\.d\.rx:1 MISMATCH\s+whereNow: declared pure, but it answers differently on the server and in the browser \("the server" with no window, "the browser" with one\)/.test(o), o);
  else console.log("  - (no @happy-dom/global-registrator here: the other side is not asked)");
  check("...one that answers alike on both sides is not contradicted: held where the code proves it, and not verified where it does not (a run cannot show a fn is pure)", /env\.d\.rx:2 held\s+label: pure is proven by the code \(it only computes\), and no run contradicts it/.test(o) && (happy || /env\.d\.rx:1 unverified whereNow: pure not contradicted/.test(o)), o);
  check("...one that answers anew each call is refuted by its own two calls, as before", /env\.d\.rx:3 MISMATCH\s+nextId: declared pure, but two calls with the same arguments answer differently/.test(o), o);
  check("...and a `client` fn is asked on one side only", !/whereAmI: declared pure, but it answers differently/.test(o), o);
}

// 2026-11-26 (an independent review of the record): three rows strict mode passed that nothing had tested. Each claim has
// a name and a result of its own; nothing answers for a whole row.
{
  const dir = path.join(ws, "claims"); fs.mkdirSync(dir, { recursive: true });
  fs.symlinkSync(path.join(repo, "ref/node_modules"), path.join(dir, "node_modules"), "dir");
  const run = (name, js, decl, probe, flags = ["--record"]) => {
    fs.writeFileSync(path.join(dir, `${name}.mjs`), js); fs.writeFileSync(path.join(dir, `${name}.d.rx`), decl);
    if (probe !== undefined) fs.writeFileSync(path.join(dir, `${name}.probe.mjs`), probe); else fs.rmSync(path.join(dir, `${name}.probe.mjs`), { force: true });
    fs.rmSync(path.join(dir, `${name}.verified.json`), { force: true });
    const r = spawnSync(process.execPath, ["--conditions=browser", path.join(__dirname, "../bin/verify.js"), ...flags, `${name}.d.rx`], { cwd: dir, encoding: "utf8" });
    return { out: r.stdout + r.stderr, stdout: r.stdout, status: r.status, strict: flags.includes("--record") ? checkStrict(path.join(dir, `${name}.d.rx`)).map(u => u.message) : [] };
  };
  // (1) uses(theme) on a warning that is about nothing: it was "holds: with no provider it warns"
  const NOISY = "export const useTheme = () => { console.warn(\"unrelated warning\"); return \"light\"; };\n";
  const noisy = run("noisy", NOISY, "export context theme\nexport fn useTheme(): string uses(theme)\n");
  check("uses(c): a warning with no provider, and nothing to run it under, is not evidence of c — unverified, and strict refuses the row", /noisy\.d\.rx:2 unverified useTheme: uses\(theme\) not shown: with no provider it fails \(it warns: unrelated warning\), which says something is missing and not that it is theme/.test(noisy.out) && noisy.strict.some(m => /^useTheme: rx-verify could not check uses\(theme\)/.test(m)), noisy);
  const noisy2 = run("noisy2", `import { createContext, createComponent } from "solid-js";\nconst Theme = createContext();\n${NOISY}export const Provider = props => createComponent(Theme, { value: "dark", get children() { return props.children; } });\n`, "export context theme\nexport fn useTheme(): string uses(theme)\nexport component Provider(props: { children?: View }) provides(theme)\n");
  check("...and with a provider of c in the file, a hook that warns the same under it is not shown to want c", /noisy2\.d\.rx:2 unverified useTheme: uses\(theme\) not shown: it fails under Provider too \(it warns: unrelated warning\)/.test(noisy2.out) && noisy2.strict.some(m => /^useTheme: /.test(m)), noisy2);
  // two contexts, each with its own provider: each is shown by taking its provider alone away
  const TWO = `import { createContext, useContext, createComponent } from "solid-js";\nconst A = createContext(), B = createContext();\nexport const useBoth = () => useContext(A) + useContext(B);\nexport const useOne = () => useContext(A);\nexport const PA = props => createComponent(A, { value: "a", get children() { return props.children; } });\nexport const PB = props => createComponent(B, { value: "b", get children() { return props.children; } });\n`;
  const two = run("two", TWO, "export context a\nexport context b\nexport fn useBoth(): string uses(a, b)\nexport fn useOne(): string uses(a, b)\nexport component PA(props: { children?: View }) provides(a)\nexport component PB(props: { children?: View }) provides(b)\n");
  check("uses(a, b): each context is a claim of its own, held where the hook fails with only that provider taken away", /two\.d\.rx:3 held\s+useBoth: uses\(a\) holds: it runs under PA, PB, and with only a's provider taken away it fails/.test(two.out) && /two\.d\.rx:3 held\s+useBoth: uses\(b\) holds/.test(two.out), two.out);
  check("...and a mismatch where it runs without it: a hook that reads only a does not use b", /two\.d\.rx:4 held\s+useOne: uses\(a\) holds/.test(two.out) && /two\.d\.rx:4 MISMATCH\s+useOne: declared uses\(b\), but it runs with every provider it names but b's/.test(two.out), two.out);
  // (2) pure + instantiates, a `ref` result that is a scalar, a required argument and no probe: the audit's summary on
  // line 1 answered for the row, and a comment above it changed the verdict
  const SCALAR = "export const makeLabel = n => `#${n}`;\n", ROW = "export pure fn makeLabel(n: number): ref string instantiates\n";
  const bare = run("scalar", SCALAR, ROW), commented = run("scalar2", SCALAR, `// a comment above the row\n${ROW}`);
  check("a claim nothing ran is unverified wherever the row stands: `fields` of a fn that needs an argument and has no probe", /scalar\.d\.rx:1 unverified makeLabel: its result's parts \(ref, pending, fails\) not checked by running/.test(bare.out) && /scalar2\.d\.rx:2 unverified makeLabel: its result's parts/.test(commented.out) && bare.strict.length === 1 && commented.strict.length === 1, { bare, commented });
  const probed = run("scalar3", SCALAR, ROW, "export const probes = { makeLabel: { args: () => [1] } };\n");
  check("...and with a probe it is run: a `ref` result that is not an accessor is a mismatch", /scalar3\.d\.rx:1 MISMATCH\s+makeLabel: the result is declared ref, but is not an accessor/.test(probed.out) && probed.status === 1, probed.out);
  check("what is said that is about no claim (the words read from the code) is not a result: it is in no record", !fs.readFileSync(path.join(dir, "scalar.verified.json"), "utf8").includes("words:") && /scalar\.d\.rx: words: /.test(bare.out), bare.out);
  // (3) rejects(E) with nothing that fails: no obligation was made for it
  const LOAD = "export class Refused extends Error {}\nexport const load = async id => { if (id === \"bad\") throw new Refused(\"no\"); if (id === \"odd\") throw new TypeError(\"odd\"); return globalThis.fetchIt?.(id) ?? id; };\n", LOADROW = "export error Refused\nexport fn load(id: string): Promise<string> rejects(Refused)\n";
  const unrun = run("load", LOAD, LOADROW);
  check("rejects(E) is a claim: with no failing arguments it is unverified, and strict refuses the row", /load\.d\.rx:2 (unverified load: rejects\(…\) not run: give failing arguments as the probe's fail|MISMATCH\s+load: rejects\(Refused\) is contradicted by the code)/.test(unrun.out) && unrun.strict.some(m => /^load: /.test(m)), unrun);
  const failing = run("load2", LOAD, LOADROW, "export const probes = { load: { fail: () => [\"bad\"] } };\n");
  check("...under the probe's failing arguments, it is shown to reject with a class the row names", /load2\.d\.rx:2 held\s+load: under the probe's failing arguments it rejects with Refused, as its row says/.test(failing.out), failing);
  const other = run("load3", LOAD, LOADROW, "export const probes = { load: { fail: () => [\"odd\"] } };\n");
  check("...and a mismatch when it rejects with another", /load3\.d\.rx:2 MISMATCH\s+load: declared to reject with Refused alone, but under the probe's failing arguments it rejects with TypeError/.test(other.out), other.out);
  // --json: each result with its claim, for a tool to read (the benchmark does)
  const j = run("load4", LOAD, LOADROW, "export const probes = { load: { fail: () => [\"bad\"] } };\n", ["--json"]);
  let parsed; try { parsed = JSON.parse(j.stdout); } catch { parsed = null; }
  check("--json prints the results by claim, and nothing else", Array.isArray(parsed) && parsed[0].results.some(r => r.name === "load" && r.ob === "rejects" && r.status === "held") && parsed[0].results.every(r => r.ob && r.status && r.name), j.stdout);
  // what is not evidence is not a result: a module that does not load, a loader's data asked twice, a part that fails
  // under its provider for want of something else
  const gone = run("gone", "import \"virtual:routes\";\nexport const f = () => 1;\n", "export pure fn f(): number\n", undefined, []);
  check("a module that does not load here: every claim of its rows is unverified, with why, and nothing is held", /gone\.d\.rx:1 unverified f: not run: gone\.mjs does not load here/.test(gone.out) && !/d\.rx:\d+ held/.test(gone.out), gone.out);
  const anew = run("anew", "let n = 0;\nexport const load = async () => [n++];\n", "export pure fn load(): Promise<number[]>\n", undefined, []);
  check("a loader asked twice answers differently: no mismatch (it is safe to ask again, R-io-4), and not shown", /anew\.d\.rx:1 unverified load: pure not shown: asked twice it answers differently/.test(anew.out) && !/MISMATCH/.test(anew.out), anew.out);
  const want = run("want", "import { createContext, useContext } from \"solid-js\";\nconst C = createContext();\nexport const P = props => C({ value: {}, get children() { return props.children; } });\nexport const useIt = () => { const c = useContext(C); return c.router.options; };\n", "export context it\nexport component P(props: { children?: View }) provides(it)\nexport fn useIt(): string uses(it)\n", undefined, []);
  check("a hook that fails under its provider otherwise than alone: provides is unverified, not a mismatch", /want\.d\.rx:2 unverified P: provides\(it\) not shown: useIt, which uses it, fails under it for another reason/.test(want.out) && !/MISMATCH/.test(want.out), want.out);
}

// what a run holds is tested: each claim false in the library is found, and a probe that shows nothing of it is no evidence
{
  const run = (name, js, decl, probe) => {
    fs.writeFileSync(path.join(ws, `${name}.mjs`), js); fs.writeFileSync(path.join(ws, `${name}.d.rx`), decl); fs.writeFileSync(path.join(ws, `${name}.probe.mjs`), probe);
    return spawnSync(process.execPath, ["--conditions=browser", path.join(__dirname, "../bin/verify.js"), `${name}.d.rx`], { cwd: ws, encoding: "utf8" }).stdout;
  };
  const solid = 'import { createSignal, createMemo, createContext, useContext, createComponent } from "solid-js";\n';
  const steady = run("steady", `${solid}export const abortable = () => [() => new AbortController().signal, () => {}];\nexport const steadyOne = () => { const [g] = createSignal(1); return g; };\nexport const handed = () => () => () => 1;\nexport const never = () => createMemo(() => 1);\n`,
    "export fn abortable(): [ref AbortSignal, () => void]\nexport fn steadyOne(): ref number\nexport fn handed(): ref () => number\nexport fn never(): pending ref number\n", "export const probes = {};\n");
  check("a `ref` that makes another value at each read is a mismatch", /abortable: 0 is declared ref, but each read makes another value/.test(steady) && /handed: the result is declared ref, but each read makes another value/.test(steady), steady);
  check("...one that answers alike holds", /:2 held\s+steadyOne: its fields read as declared/.test(steady), steady);
  check("a `pending` that is never seen to wait is unverified", /:4 unverified never: .*declared pending, never waited/.test(steady), steady);
  const scope = `${solid}let here; const Real = createContext();\nexport const useScope = () => { if (here === undefined) throw new Error("no scope"); return here; };\nexport const Scope = props => { const was = here; here = 1; try { return props.children; } finally { here = was; } };\nexport const useReal = () => { const v = useContext(Real); if (!v) throw new Error("no real"); return v; };\nexport const RealScope = props => createComponent(Real, { value: 1, get children() { return props.children; } });\nexport const Hides = () => null;\n`;
  const sc = run("scope", scope, "export context scope\nexport context real\nexport context hidden\nexport pure fn useScope(): number uses(scope)\nexport component Scope(props: { children?: View }) provides(scope)\nexport pure fn useReal(): number uses(real)\nexport component RealScope(props: { children?: View }) provides(real)\n", "");
  check("a scope set only while the component's body runs is no provider: what is made under it later fails", /:5 MISMATCH\s+Scope: declared provides\(scope\), but useScope made later under it/.test(sc), sc);
  check("...a context is", /:7 held\s+RealScope: provides\(real\) holds/.test(sc) && !/:7 MISMATCH/.test(sc), sc);
  const hid = run("hides", scope, "export context real\nexport pure fn useReal(): number uses(real)\nexport component Hides(props: { children?: View }) provides(real)\n", "");
  check("a provider that renders nothing of what it is given shows nothing", !/useReal: uses\(real\) holds/.test(hid) && /:3 unverified Hides: .*renders nothing of what it is given/.test(hid), hid);
  // the probe calls the callback itself, or the library it imports: the same is shown of a library that never does
  const own = run("own", `let kept;\nexport const onceLater = cb => { setTimeout(() => cb(1), 5); };\nexport const ignores = cb => { kept = cb; };\nexport const fire = () => kept?.(1);\nexport const rejects = async x => { if (x) throw new TypeError("no"); };\n`,
    "export fn onceLater(cb: handler (n: number) => void): void\nexport fn ignores(cb: handler (n: number) => void): void\n", 'import { ignores } from "./own.mjs";\nexport const probes = { onceLater: { args: () => [() => {}] }, ignores: { args: () => { const cb = () => {}; return [cb]; } } };\n');
  check("a handler the library calls later holds", /:1 held\s+onceLater: callback cb holds/.test(own), own);
  check("...one it never calls does not", /:2 unverified ignores/.test(own), own);
  const { mutant } = require("../src/verify-mutate.js");
  check("a changed module is the module but for the claim", Object.keys(mutant({ a: 1, f: () => 2 }, [], "uses", {})).join() === "a,f" && mutant({ f: () => 2 }, [{ name: "f", kind: "fn", facts: { uses: ["c"], params: [] } }], "uses", {}).f() === undefined && mutant({ k: { m: () => 2, n: 3 } }, [{ name: "k.m", kind: "fn", facts: { uses: ["c"], params: [] } }], "uses", {}).k.m() === undefined && mutant({ k: { m: () => 2, n: 3 } }, [{ name: "k.m", kind: "fn", facts: { uses: ["c"], params: [] } }], "uses", {}).k.n === 3);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
