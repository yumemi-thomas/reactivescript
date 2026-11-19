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
  "export const onIdle = run => run;",
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
  "export declare function onIdle(run: () => void, delay?: number): void;",
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
check("an accessor parameter and result are ref", has("export pure fn createDebounced(ref source: string, ms: number): ref string"), draft);
check("a tuple keeps its ref part and its setter (instantiates is inferred from the ref)", has("export pure fn createToggle(initial: boolean): [ref boolean, (...args: any[]) => void]"), draft);
check("a plain result gets no store TODO", !/TODO useTheme: is the result a store/.test(draft), draft);
check("a hook is pure and instantiates, with a TODO for its context", has("export pure fn useTheme(): string instantiates") && /\/\/ TODO useTheme: which context does this hook read\?/.test(draft), draft);
check("a component's JSX children are a View", has("export component Card(props: { title: string; children?: View })"), draft);
check("a function-typed children prop is a render prop (MO-11k)", has("export component List(props: { items: string[]; children: (item: any, index: any) => View })"), draft);
check("a callback parameter is a function type; an optional one keeps its `?` (MO-8e)", has("export fn onIdle(run: (...args: any[]) => any, delay?: number): void"), draft);

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
const r2 = spawnSync(process.execPath, ["--conditions=browser", path.join(__dirname, "../bin/declare.js"), "./ctx.mjs"], { cwd: ws, encoding: "utf8" });
const ran = r2.stdout;
if (process.env.VERBOSE) console.log(ran, r2.stderr);
const hasRan = line => ran.split("\n").some(l => l.split("   //")[0] === line);
check("running: the exported context is named from its export", hasRan("export context theme"), ran + r2.stderr);
check("running: a hook that throws with no provider uses it", hasRan("export pure fn useTheme(): string uses(theme)"), ran);
check("running: a provider that lets it run provides it", hasRan("export component ThemeProvider(props: { children?: View }) provides(theme)"), ran);
check("running: a hook that reads its context only when its result is read uses it too", /export pure fn useLazy\(\): .* uses\(theme\)/.test(ran), ran);
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
const r3 = spawnSync(process.execPath, ["--conditions=browser", path.join(__dirname, "../bin/declare.js"), "./kit.mjs"], { cwd: ws, encoding: "utf8" });
const kit = r3.stdout;
if (process.env.VERBOSE) console.log(kit, r3.stderr);
const kitHas = line => kit.split("\n").includes(line);
check("a compound root is a component that provides its parts' context (MO-11q, by running)", kitHas("export component Dialog(props: { open?: boolean | undefined; children?: View }) provides(dialog)"), kit + r3.stderr);
check("its parts are dotted members that use it (MO-11q, by running)", kitHas("export component Dialog.Trigger(props: { children?: View }) uses(dialog)") && kitHas("export component Dialog.Content(props: { children?: View }) uses(dialog)"), kit);
check("the same part exported by its own name gets the same rows; a prop a .d.rx cannot name (`aria-label`) is left out", kitHas("export component Trigger(props: { children?: View }) uses(dialog)") && /^export context dialog   \/\/ drafted by running: compound parts/m.test(kit), kit);
check("a value is declared a value (MO-8g)", kitHas("export const normalizeProps: typeof import(\"./kit.mjs\").normalizeProps"), kit);

const t = spawnSync(process.execPath, [path.join(__dirname, "../bin/tsc.js")], { cwd: ws, encoding: "utf8" });
check("the draft parses and passes rx-tsc against the module's own types (TY-6)", t.status === 0 && t.stdout.trim() === "", { status: t.status, out: t.stdout + t.stderr });

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
