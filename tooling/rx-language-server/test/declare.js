// `rx-declare` (bin/declare.js) on a small module with TypeScript types: each kind of export becomes the row it
// should, the hook gets its TODO, and the draft is a declaration rx-tsc accepts against the same types (TY-6).
//   node test/declare.js            VERBOSE=1 prints the draft
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const repo = path.resolve(__dirname, "../../..");
const ws = path.join(__dirname, "../.test/declare");
fs.rmSync(ws, { recursive: true, force: true });
fs.mkdirSync(ws, { recursive: true });
fs.symlinkSync(path.join(repo, "ref/node_modules"), path.join(ws, "node_modules"), "dir");
fs.writeFileSync(path.join(ws, "lib.js"), [
  "export class NotFound extends Error {}",
  "export const createDebounced = (source, ms) => source;",
  "export const createToggle = initial => { let v = initial; return [() => v, x => { v = x; }]; };",
  "export const useTheme = () => \"dark\";",
  "export const Card = props => props.children;",
  "export const Toggle = props => null;",
  "export const onIdle = run => run;",
  "export const watch = opts => opts;",
  "export const List = props => props.items.map(props.children);",
  "",
].join("\n"));
fs.writeFileSync(path.join(ws, "lib.d.ts"), [
  "import type { JSX } from \"@solidjs/web\";",
  "export declare class NotFound extends Error {}",
  "export declare function createDebounced(source: () => string, ms: number): () => string;",
  "export declare function createToggle(initial: boolean): [() => boolean, (v: boolean) => void];",
  "export declare function useTheme(): string;",
  "export declare function Card(props: { title: string; children?: JSX.Element }): JSX.Element;",
  "export declare function Toggle(props: { on: boolean; onToggle: (v: boolean) => void }): JSX.Element;",
  "export declare function onIdle(run: () => void, delay?: number): void;",
  "export declare function watch(opts: { onChange?: (v: number) => void; key: string }): void;",
  "export declare function List(props: { items: string[]; children: (item: string, index: number) => JSX.Element }): JSX.Element;",
  "",
].join("\n"));
fs.writeFileSync(path.join(ws, "main.rx"), [
  "import { createDebounced, Card } from \"./lib.js\"",
  "export default component App() {",
  "  q = createDebounced(\"milk\", 300)",
  "  <Card title=\"search\"><p>{q}</p></Card>",
  "}",
  "",
].join("\n"));
fs.writeFileSync(path.join(ws, "tsconfig.json"), JSON.stringify({
  compilerOptions: { jsx: "preserve", jsxImportSource: "@solidjs/web", strict: true, noImplicitAny: false, target: "ES2022", module: "ESNext", moduleResolution: "Bundler", allowImportingTsExtensions: true, noEmit: true, skipLibCheck: true, lib: ["ES2022", "DOM"], types: [] },
  include: ["main.rx"],
}, null, 2));

let pass = 0, fail = 0;
function check(name, ok, got) {
  if (ok) pass++; else fail++;
  console.log(`${ok ? "  ✓" : "  ✗"} ${name}${!ok || process.env.VERBOSE ? `\n      ${JSON.stringify(got).slice(0, 2000)}` : ""}`);
}

const r = spawnSync(process.execPath, [path.join(__dirname, "../bin/declare.js"), "./lib.js", "--out", "lib.d.rx"], { cwd: ws, encoding: "utf8" });
const draft = fs.existsSync(path.join(ws, "lib.d.rx")) ? fs.readFileSync(path.join(ws, "lib.d.rx"), "utf8") : r.stderr;
if (process.env.VERBOSE) console.log(draft);
const has = line => draft.split("\n").includes(line);
check("an Error subclass is an error", has("export error NotFound"), draft);
check("an accessor parameter and result are ref", has("export fn createDebounced(ref source: string, ms: number): ref string"), draft);
check("a tuple keeps its ref part and its setter (instantiates is inferred from the ref)", has("export fn createToggle(initial: boolean): [ref boolean, (...args: any[]) => void]"), draft);
check("a plain result gets no store TODO", !/TODO useTheme: is the result a store/.test(draft), draft);
check("a hook instantiates, is io until a person writes `pure` (a TODO suggests it), with a TODO for its context", has("export fn useTheme(): string instantiates") && /\/\/ TODO useTheme: pure\? its name is a primitive's/.test(draft) && /\/\/ TODO useTheme: which context does this hook read\?/.test(draft), draft);
check("a component's JSX children are a View", has("export component Card(props: { title: string; children?: View })"), draft);
check("a function-typed children prop is a render prop (MO-11k)", has("export component List(props: { items: string[]; children: (item: any, index: any) => View })"), draft);
check("a callback parameter is a function type; an optional one keeps its `?` (MO-8e)", has("export fn onIdle(run: (...args: any[]) => any, delay?: number): void"), draft);
check("a function type is drafted pure, with `handler` suggested for one named like an event (MO-10g)", /\/\/ TODO watch: onChange: called later, outside any computation\? mark it `handler/.test(draft) && !/handler \(/.test(draft.split("\n").filter(l => !l.startsWith("//")).join("\n")), draft);
check("a component's on… prop is drafted pure too, with `handler` only suggested (MO-10g)", /\/\/ TODO Toggle: onToggle: called later, outside any computation\? mark it `handler/.test(draft) && has("export component Toggle(props: { on: boolean; onToggle: (...args: any[]) => any })"), draft);

// what a result is, a step at a time (EF-5a, MO-10b, MO-10k): a disposer through the library's own name for it, a small
// object by its fields, a class instance by the methods that answer nothing or a promise, the module's own types by name
fs.writeFileSync(path.join(ws, "more.js"), "export const listen = () => () => {};\nexport const makePager = () => ({});\nexport const makeClient = () => ({});\nexport const load = async () => ({});\n");
fs.writeFileSync(path.join(ws, "more.d.ts"), [
  "export type Unsubscribe = VoidFunction;",
  "export type Row = { id: string };",
  "export type Page<T> = { rows: T[] };",
  "export type Cell<T, V = unknown> = { row: T; value: V };",
  "export declare class Client { private secret: number; invalidate(key?: string): Promise<void>; fetch<T>(key: string): Promise<T>; size(): number; peek(key: string): Row | undefined; clear(): void; }",
  "export declare function listen(run: () => void): Unsubscribe;",
  "export declare function makePager(): { page: () => number; getPageCount: () => number; next: () => void; rows: Row[]; label: string; nested: { open: boolean; close: () => void } };",
  "export declare function makeClient(): Client;",
  "export declare function load(id: string): Promise<Row[]>;",
  "",
].join("\n"));
const r1 = spawnSync(process.execPath, [path.join(__dirname, "../bin/declare.js"), "./more.js"], { cwd: ws, encoding: "utf8" });
const more = r1.stdout; if (process.env.VERBOSE) console.log(more, r1.stderr);
const hasMore = line => more.split("\n").includes(line);
check("a result that takes nothing and answers nothing is `() => void`, through the library's own name for it (EF-5a)", hasMore("export fn listen(run: (...args: any[]) => any): () => void"), more);
check("a small object result is typed by its fields: an accessor `ref`, a called getter and a function by what they answer, a nested object a step further", hasMore("export fn makePager(): { page: ref number; getPageCount: () => number; next: () => void; rows: Row[]; label: string; nested: { open: boolean; close: () => void } }"), more);
check("a class instance is typed by its methods, each as it is written where it can be (a generic one by what it answers), and stays the library's own object", hasMore("export fn makeClient(): { invalidate: (key?: string) => Promise<void>; fetch: (...args: any[]) => Promise<any>; size: () => number; peek: (key: string) => Row | undefined; clear: () => void }"), more);
check("a row names the module's own types, which the draft declares", hasMore("export fn load(id: string): Promise<Row[]>") && hasMore("export type Row = import(\"./more.js\").Row"), more);
check("a generic type is declared with the parameters that have no default", hasMore("export type Page<T> = import(\"./more.js\").Page<T>") && hasMore("export type Cell<T, V> = import(\"./more.js\").Cell<T, V>"), more);

// the run pass (src/declare-run.js): which hook reads which context, which provider provides it
fs.writeFileSync(path.join(ws, "ctx.mjs"), [
  "import { createContext, useContext, createComponent } from \"solid-js\";",
  "export const ThemeContext = createContext();",
  "export const useTheme = () => { const t = useContext(ThemeContext); if (!t) throw new Error(\"no theme\"); return t; };",
  "export const useLazy = () => ({ read: () => { const t = useContext(ThemeContext); if (!t) throw new Error(\"no theme yet\"); return t; } });",
  "export const useBroken = () => { throw new Error(\"always\"); };",
  "export const useFree = () => 1;",
  "export const ThemeProvider = props => createComponent(ThemeContext, { value: \"dark\", get children() { return props.children; } });",
  "",
].join("\n"));
fs.writeFileSync(path.join(ws, "ctx.d.mts"), [
  "import type { JSX } from \"@solidjs/web\";",
  "import type { Context } from \"solid-js\";",
  "export declare const ThemeContext: Context<string | undefined>;",
  "export declare function useTheme(): string;",
  "export declare function useLazy(): { read: () => string };",
  "export declare function useFree(): number;",
  "export declare function useBroken(): number;",
  "export declare function ThemeProvider(props: { children?: JSX.Element }): JSX.Element;",
  "",
].join("\n"));
const r2 = spawnSync(process.execPath, ["--conditions=browser", path.join(__dirname, "../bin/declare.js"), "./ctx.mjs", "--run"], { cwd: ws, encoding: "utf8" });
const ran = r2.stdout;
if (process.env.VERBOSE) console.log(ran, r2.stderr);
const hasRan = line => ran.split("\n").some(l => l.split("   //")[0] === line);
check("running: the exported context is named from its export", hasRan("export context theme"), ran + r2.stderr);
check("running: a hook that throws with no provider uses it", hasRan("export fn useTheme(): string uses(theme)"), ran);
check("running: a provider that lets it run provides it", hasRan("export component ThemeProvider(props: { children?: View }) provides(theme)"), ran);
check("running: a hook that reads its context only when its result is read uses it too", /export fn useLazy\(\): .* uses\(theme\)/.test(ran), ran);
check("running: a hook that throws under every context gets no invented one", /TODO useBroken: run with no provider it throws, and under each of this module's contexts too/.test(ran) && !/useBroken\(\).*uses\(/.test(ran), ran);
check("running: a hook that never throws keeps a TODO, not a claim", /TODO useFree: run with no provider, and its result read, it does not throw/.test(ran), ran);

// MO-11q: a kit's compound parts on its root (`Dialog.Trigger`), which read the root's context; an `aria-label` prop, and a
// value export
fs.writeFileSync(path.join(ws, "kit.mjs"), [
  "import { createContext, useContext, createComponent } from \"solid-js\";",
  "const DialogContext = createContext();",
  "const part = name => props => { if (!useContext(DialogContext)) throw new Error(`<Dialog.${name}> outside <Dialog>`); return props.children; };",
  "const Trigger = part(\"Trigger\"), Content = part(\"Content\");",
  "export const Dialog = Object.assign(props => createComponent(DialogContext, { value: {}, get children() { return props.children; } }), { Trigger, Content });",
  "export { Trigger };",
  "export const normalizeProps = { button: x => x };",
  "",
].join("\n"));
fs.writeFileSync(path.join(ws, "kit.d.mts"), [
  "import type { JSX } from \"@solidjs/web\";",
  "type Part = (props: { \"aria-label\"?: string; children?: JSX.Element }) => JSX.Element;",
  "export declare const Dialog: ((props: { open?: boolean; children?: JSX.Element }) => JSX.Element) & { Trigger: Part; Content: Part };",
  "export declare const Trigger: Part;",
  "export declare const normalizeProps: { button: (x: object) => object };",
  "",
].join("\n"));
const r3 = spawnSync(process.execPath, ["--conditions=browser", path.join(__dirname, "../bin/declare.js"), "./kit.mjs", "--run"], { cwd: ws, encoding: "utf8" });
const kit = r3.stdout;
if (process.env.VERBOSE) console.log(kit, r3.stderr);
const kitHas = line => kit.split("\n").includes(line);
check("a compound root is a component that provides its parts' context (MO-11q, by running)", kitHas("export component Dialog(props: { open?: boolean | undefined; children?: View }) provides(dialog)"), kit + r3.stderr);
check("its parts are dotted members that use it (MO-11q, by running)", kitHas("export component Dialog.Trigger(props: { children?: View }) uses(dialog)") && kitHas("export component Dialog.Content(props: { children?: View }) uses(dialog)"), kit);
check("the same part exported by its own name gets the same rows; a prop a .d.rx cannot name (`aria-label`) is left out", kitHas("export component Trigger(props: { children?: View }) uses(dialog)") && /^export context dialog   \/\/ drafted by running: compound parts/m.test(kit), kit);
check("a value is declared a value (MO-8g)", kitHas("export const normalizeProps: typeof import(\"./kit.mjs\").normalizeProps"), kit);

// a package that ships .jsx (its solid build) runs compiled by the project's Solid compiler; a context it does not export is
// named after its hook (`usePanelContext` → panel), or as `--context` says
fs.writeFileSync(path.join(ws, "jsxkit.jsx"), [
  "import { createContext, useContext } from \"solid-js\";",
  "const PanelContext = createContext();",
  "export const usePanelContext = () => { const c = useContext(PanelContext); if (!c) throw new Error(\"no panel\"); return c; };",
  "export const Panel = props => <PanelContext value={{}}><section>{props.children}</section></PanelContext>;",
  "",
].join("\n"));
fs.writeFileSync(path.join(ws, "jsxkit.d.ts"), [
  "import type { JSX } from \"@solidjs/web\";",
  "export declare function usePanelContext(): object;",
  "export declare function Panel(props: { children?: JSX.Element }): JSX.Element;",
  "",
].join("\n"));
const r4 = spawnSync(process.execPath, ["--conditions=browser", path.join(__dirname, "../bin/declare.js"), "./jsxkit.jsx", "--run"], { cwd: ws, encoding: "utf8" });
if (process.env.VERBOSE) console.log(r4.stdout, r4.stderr);
check("a .jsx module runs compiled; its hook's context is named after the hook", /^rx-declare: ran 1 hook: 1 read a context/m.test(r4.stderr) && r4.stdout.split("\n").includes("export fn usePanelContext(): object uses(panel)") && /^export context panel /m.test(r4.stdout), r4.stdout + r4.stderr);
const r5 = spawnSync(process.execPath, ["--conditions=browser", path.join(__dirname, "../bin/declare.js"), "./jsxkit.jsx", "--context", "sidePanel", "--run"], { cwd: ws, encoding: "utf8" });
check("--context names it", r5.stdout.split("\n").includes("export fn usePanelContext(): object uses(sidePanel)"), r5.stdout + r5.stderr);

// a hook that warns, not throws, with no provider reads its context too
fs.writeFileSync(path.join(ws, "warns.mjs"), [
  "import { createContext, useContext } from \"solid-js\";",
  "export const RouterContext = createContext();",
  "export const useRouter = () => { const r = useContext(RouterContext); if (!r) console.warn(\"useRouter must be used inside a <RouterProvider>\"); return r; };",
  "",
].join("\n"));
fs.writeFileSync(path.join(ws, "warns.d.mts"), ["import type { Context } from \"solid-js\";", "export declare const RouterContext: Context<object | undefined>;", "export declare function useRouter(): object | undefined;", ""].join("\n"));
const r6 = spawnSync(process.execPath, ["--conditions=browser", path.join(__dirname, "../bin/declare.js"), "./warns.mjs", "--run"], { cwd: ws, encoding: "utf8" });
check("running: a hook that warns with no provider uses the context it warns about", /^export fn useRouter\(\): .* uses\(router\)$/m.test(r6.stdout), r6.stdout + r6.stderr);

const t = spawnSync(process.execPath, [path.join(__dirname, "../bin/tsc.js")], { cwd: ws, encoding: "utf8" });
check("the draft parses and passes rx-tsc against the module's own types (TY-6)", t.status === 0 && t.stdout.trim() === "", { status: t.status, out: t.stdout + t.stderr });

// rx-declare runs a package as a browser bundle imports it: an ESM-only package whose `exports` maps subpaths by a
// pattern (`"./*": { "import": "./dist/*.mjs" }`) is found, as the crate finds its declaration
{
  const pkg = path.join(ws, "node_modules-pat/node_modules/kit"); fs.mkdirSync(path.join(pkg, "dist/menu"), { recursive: true });
  fs.writeFileSync(path.join(pkg, "package.json"), JSON.stringify({ name: "kit", type: "module", exports: { ".": { import: "./dist/index.mjs" }, "./*": { import: "./dist/*.mjs" }, "./menu/*": { import: "./dist/menu/*.mjs" } } }));
  for (const f of ["dist/index.mjs", "dist/button.mjs", "dist/menu/item.mjs"]) fs.writeFileSync(path.join(pkg, f), "export const x = 1;\n");
  const { resolveModule } = require("../src/declare-run.js");
  const from = path.join(ws, "node_modules-pat");
  check("an exports pattern resolves (./* and the longer ./menu/*), as the crate's packageDeclaration does", resolveModule("kit/button", from) === path.join(pkg, "dist/button.mjs") && resolveModule("kit/menu/item", from) === path.join(pkg, "dist/menu/item.mjs") && resolveModule("kit", from) === path.join(pkg, "dist/index.mjs") && resolveModule("kit/nope", from) === null, [resolveModule("kit/button", from), resolveModule("kit/menu/item", from), resolveModule("kit", from)]);
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
