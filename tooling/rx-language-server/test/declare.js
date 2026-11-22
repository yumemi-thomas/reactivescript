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
check("a tuple keeps its ref part and its setter (instantiates is inferred from the ref)", has("export fn createToggle(initial: boolean): [ref boolean, (v: boolean) => void]"), draft);
check("a plain result gets no store TODO", !/TODO useTheme: is the result a store/.test(draft), draft);
check("a hook instantiates, is io until a person writes `pure` (a TODO suggests it), with a TODO for its context", has("export fn useTheme(): string instantiates") && /\/\/ TODO useTheme: pure\? its name is a primitive's/.test(draft) && /\/\/ TODO useTheme: which context does this hook read\?/.test(draft), draft);
check("a component's JSX children are a View", has("export component Card(props: { title: string; children?: View })"), draft);
check("a function-typed children prop is a render prop (MO-11k)", has("export component List(props: { items: string[]; children: (item: string, index: number) => View })"), draft);
check("a callback parameter is a function type; an optional one keeps its `?` (MO-8e)", has("export fn onIdle(run: () => void, delay?: number): void"), draft);
check("a function type is drafted pure, with `handler` suggested for one named like an event (MO-10g)", /\/\/ TODO watch: onChange: called later, outside any computation\? mark it `handler/.test(draft) && !/handler \(/.test(draft.split("\n").filter(l => !l.startsWith("//")).join("\n")), draft);
check("a component's on… prop is drafted pure too, with `handler` only suggested (MO-10g)", /\/\/ TODO Toggle: onToggle: called later, outside any computation\? mark it `handler/.test(draft) && has("export component Toggle(props: { on: boolean; onToggle: (v: boolean) => void })"), draft);

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
check("a result that takes nothing and answers nothing is `() => void`, through the library's own name for it (EF-5a)", hasMore("export fn listen(run: () => void): () => void"), more);
check("a small object result is typed by its fields: an accessor `ref`, a called getter and a function by what they answer, a nested object a step further", hasMore("export fn makePager(): { page: ref number; getPageCount: () => number; next: () => void; rows: Row[]; label: string; nested: { open: boolean; close: () => void } }"), more);
check("a class instance is typed by its methods, each as it is written where it can be (a generic one by what it answers), and stays the library's own object", hasMore("export fn makeClient(): { invalidate: (key?: string) => Promise<void>; fetch: (key: string) => Promise<unknown>; size: () => number; peek: (key: string) => Row | undefined; clear: () => void }"), more);
check("a row names the module's own types, which the draft declares", hasMore("export fn load(id: string): Promise<Row[]>") && hasMore("export type Row = import(\"./more.js\").Row"), more);
check("a generic type is declared with the parameters that have no default", hasMore("export type Page<T> = import(\"./more.js\").Page<T>") && hasMore("export type Cell<T, V = unknown> = import(\"./more.js\").Cell<T, V>"), more);

// MO-8m: the library's types are named, not `any` — by the name the module exports, by `import("<package>")` for another
// package's, by its place in the library's declaration for one no module exports; a row TypeScript does not hold with
// them is written as every draft was
fs.writeFileSync(path.join(ws, "named.js"), "export const make = o => o;\nexport const inner = x => x;\nexport const over = x => x;\nexport const open = x => 1;\nexport const watchAll = (a, b) => b;\nexport const pick = (rows, by) => rows[0];\nexport const lossy = () => ({});\nexport const all = ps => Promise.all(ps);\nexport const atLeast = n => ({ expects: `>=${n}` });\nexport const Picker = props => null;\nexport const loose = x => x;\n");
fs.writeFileSync(path.join(ws, "named.d.ts"), [
  "import type { Accessor } from \"solid-js\";",
  "interface Secret { id: string; tags: string[] }",
  "declare class Sealed { private key; id: string }",
  "export type Opts<T extends object = object> = { seed: T; depth?: number };",
  "export interface Shape { kind: \"a\" | \"b\" }",
  "export declare function make<const T extends object>(opts: Opts<T>, shapes: Shape[]): Opts<T>;",
  "export declare function inner(x: Sealed, n?: number): Secret;",
  "export declare function open(x: Secret): number;",
  "export declare function over(a: Sealed): number;",
  "export declare function over(a: Sealed, b: number): number;",
  "export declare function watchAll(source: Accessor<number>, done: (shape: Shape, from: Accessor<number>) => void): Map<string, Accessor<Shape>>;",
  "export declare function pick<T>(rows: readonly T[], by: Sealed): T | undefined;",
  "export declare function lossy(): { at: Secret | null; n: number };",
  "export declare function all<T extends readonly unknown[] | []>(ps: T): Promise<{ -readonly [P in keyof T]: Awaited<T[P]> }>;",
  "export declare function atLeast<const N extends number>(n: N): { expects: `>=${N}`; kind: N extends 0 ? \"none\" : \"some\" };",
  "export declare function Picker<Option, Group = never>(props: { value?: Option; options: Option[]; onPick?: (v: Option) => void }): import(\"@solidjs/web\").JSX.Element;",
  "type Anything = unknown;",
  "export declare function loose<T extends Anything>(x: T): T;",
  "export {};",
  "",
].join("\n"));
const rn = spawnSync(process.execPath, [path.join(__dirname, "../bin/declare.js"), "./named.js", "--explain"], { cwd: ws, encoding: "utf8" });
const named = rn.stdout; if (process.env.VERBOSE) console.log(named, rn.stderr);
const hasNamed = line => named.split("\n").includes(line);
check("a generic type is declared with its parameters' bounds and defaults, as the library declares them (MO-8m)", hasNamed("export type Opts<T extends object = object> = import(\"./named.js\").Opts<T>"), named);
check("a generic fn keeps its type parameters, and names the module's own types by the draft's aliases — its result too, where its fields say nothing the checker reads (MO-8d, MO-8m, MO-8o)", hasNamed("export fn make<const T extends object>(opts: Opts<T>, shapes: Shape[]): Opts<T>"), named);
check("a type no module exports is named by its place in the library's declaration", hasNamed("export fn inner(x: Parameters<typeof import(\"./named.js\").inner>[0], n?: number): { id: string; tags: string[] }"), named);
check("another package's type is named by an import of that package; a callback is written with its own signature", hasNamed("export fn watchAll(ref source: number, done: (shape: Shape, from: import(\"solid-js\").Accessor<number>) => void): Map<string, import(\"solid-js\").Accessor<Shape>>"), named);
check("an overloaded fn has a row for each signature (MO-8p) and no one place: what cannot be named there stays `any`, and --explain says why and whose", hasNamed("export fn over(a: any): number") && hasNamed("export fn over(a: any, b: number): number") && /2 `any` drafted \(0 the library's own, 2 the draft's\) — 2 overload/.test(rn.stderr), named + rn.stderr);
check("an interface of fields that no module exports is written as the record of them (MO-8o)", hasNamed("export fn open(x: { id: string; tags: string[] }): number"), named);
check("beside a type parameter, a part with no name is said by its place, where TypeScript holds the row", hasNamed("export fn pick<T>(rows: readonly T[], by: Parameters<typeof import(\"./named.js\").pick>[1]): T | undefined"), named);
check("a nested object keeps what it may also be (`| null`)", hasNamed("export fn lossy(): { at: { id: string; tags: string[] } | null; n: number }"), named);
check("a computed type is written as the library computes it: a mapped tuple, a template of a literal, a conditional (MO-8m)", hasNamed("export fn all<T extends readonly unknown[] | []>(ps: T): Promise<{ -readonly [P in keyof T]: Awaited<T[P]> }>") && hasNamed("export fn atLeast<const N extends number>(n: N): { expects: `>=${N}`; kind: N extends 0 ? \"none\" : \"some\" }"), named);
check("a generic component keeps the type parameters its props name (MO-8d): the others are not the row's", hasNamed("export component Picker<Option>(props: { value?: Option | undefined; options: Option[]; onPick?: (v: Option) => void })"), named);
check("a bound that is `unknown` bounds nothing, and is not written", hasNamed("export fn loose<T>(x: T): T"), named);
const rl = spawnSync(process.execPath, [path.join(__dirname, "../bin/declare.js"), "./named.js", "--any"], { cwd: ws, encoding: "utf8" });
check("--any drafts as before MO-8m: every type the draft cannot restate is `any`", rl.stdout.split("\n").includes("export fn inner(x: any, n?: number): { id: string; tags: string[] }") && rl.stdout.split("\n").includes("export fn make(opts: any, shapes: Shape[]): { seed: any; depth?: number | undefined }") && rl.stdout.split("\n").includes("export type Opts = import(\"./named.js\").Opts"), rl.stdout + rl.stderr);
fs.writeFileSync(path.join(ws, "named.d.rx"), named);
fs.writeFileSync(path.join(ws, "named.rx"), "import { open } from \"./named.js\"\nexport default component N() {\n  <button onClick={() => { open({ id: \"a\", tags: [] }) }}>x</button>\n}\n");
const tn = spawnSync(process.execPath, [path.join(__dirname, "../bin/tsc.js"), "--noEmit", "-p", "tsconfig.named.json"], { cwd: (fs.writeFileSync(path.join(ws, "tsconfig.named.json"), JSON.stringify({ extends: "./tsconfig.json", include: ["named.rx"] })), ws), encoding: "utf8" });
check("the draft that names the library's types passes rx-tsc against them (TY-6)", tn.status === 0 && tn.stdout.trim() === "", { status: tn.status, out: tn.stdout + tn.stderr });

// MO-8o, MO-8p, MO-8q: a package whose declarations are a bundle — its types named by the module that exports them (a
// subpath, under the name it has there), its props by their type, a row for each signature, its own `any`s as they are
{
  const app = path.join(ws, "wideapp"); const pkg = path.join(app, "node_modules/wide");
  fs.mkdirSync(path.join(pkg, "dist"), { recursive: true });
  for (const n of ["@solidjs", "solid-js"]) fs.symlinkSync(path.join(repo, "ref/node_modules", n), path.join(app, "node_modules", n), "dir");
  fs.writeFileSync(path.join(pkg, "package.json"), JSON.stringify({ name: "wide", version: "1.0.0", type: "module", exports: { ".": { types: "./dist/index.d.ts", default: "./dist/index.js" }, "./internals": { types: "./dist/internals.d.ts", default: "./dist/internals.js" } } }));
  fs.writeFileSync(path.join(pkg, "dist/index.js"), "export const insert = () => {};\nexport const on = () => () => {};\nexport const loosely = () => ({});\nexport const Picker = () => null;\n");
  fs.writeFileSync(path.join(pkg, "dist/internals.js"), "export {};\n");
  fs.writeFileSync(path.join(pkg, "dist/chunk.d.ts"), [
    "interface Store$1<TItem$1> { readonly items: TItem$1[]; readonly size: number }",
    "type Row$1 = { id: string };",
    "interface PickerOwn<O> { value?: O; onPick?: (v: O) => void; render?: (v: O) => import(\"@solidjs/web\").JSX.Element; label?: string }",
    "export { Store$1 as S, Row$1 as R, PickerOwn as P };", ""].join("\n"));
  fs.writeFileSync(path.join(pkg, "dist/internals.d.ts"), "export type { S as BaseStore } from \"./chunk.js\";\n");
  fs.writeFileSync(path.join(pkg, "dist/index.d.ts"), [
    "import { S as Store$1, R as Row$1, P as PickerOwn } from \"./chunk.js\";",
    "export declare function insert<TItem$1 extends Row$1>(store: Store$1<TItem$1>, item: TItem$1): void;",
    "export declare function on(target: Window, cb: (e: Event) => void): () => void;",
    "export declare function on(target: Document, cb: (e: Event) => void, capture?: boolean): () => void;",
    "export declare function loosely(x: any, y: unknown): Record<string, any>;",
    "export declare function Picker<O>(props: PickerOwn<O>): import(\"@solidjs/web\").JSX.Element;",
    "export type { Row$1 as Row, PickerOwn as PickerProps };", ""].join("\n"));
  const rw = spawnSync(process.execPath, [path.join(__dirname, "../bin/declare.js"), "wide", "--explain", "--causes", path.join(app, "causes.json")], { cwd: app, encoding: "utf8" });
  const wide = rw.stdout.split("\n"); if (process.env.VERBOSE) console.log(rw.stdout, rw.stderr);
  check("a type the entry does not export is named by the subpath that does, under its name there; a bundle's `$1` names are not the row's (MO-8o)", wide.includes("export fn insert<TItem extends Row>(store: import(\"wide/internals\").BaseStore<TItem>, item: TItem): void"), rw.stdout + rw.stderr);
  check("a fn with several signatures has a row for each (MO-8p)", wide.includes("export fn on(target: Window, cb: (e: Event) => void): () => void") && wide.includes("export fn on(target: Document, cb: (e: Event) => void, capture?: boolean): () => void"), rw.stdout);
  check("a component's props are the type the library declares them with, and after it the fields the checker reads (MO-8o)", wide.includes("export component Picker<O>(props: PickerProps<O> & { onPick?: (v: O) => void; render?: Component })"), rw.stdout);
  const causes = JSON.parse(fs.readFileSync(path.join(app, "causes.json"), "utf8")).causes;
  check("the library's own `any` is written as it is, and counted as the library's; its `unknown` stays `unknown` (MO-8q)", wide.includes("export fn loosely(x: any, y: unknown): Record<string, any>") && causes.length === 2 && causes.every(c => c.cause === "vendor-any" && c.name === "loosely") && /2 `any` drafted \(2 the library's own, 0 the draft's\)/.test(rw.stderr), rw.stdout + rw.stderr);
  fs.writeFileSync(path.join(app, "tsconfig.json"), fs.readFileSync(path.join(ws, "tsconfig.json"), "utf8"));
  fs.mkdirSync(path.join(app, "rx-types"), { recursive: true }); fs.writeFileSync(path.join(app, "rx-types/wide.d.rx"), rw.stdout);
  fs.writeFileSync(path.join(app, "main.rx"), "import { Picker, on } from \"wide\"\nexport default component N() {\n  <Picker value=\"a\" label=\"x\" />\n}\n");
  const tw = spawnSync(process.execPath, [path.join(__dirname, "../bin/tsc.js"), "--noEmit", "-p", "tsconfig.json"], { cwd: app, encoding: "utf8" });
  check("that draft passes rx-tsc against the package's own types: the props type, the record after it, each signature (TY-6)", tw.status === 0 && tw.stdout.trim() === "", { status: tw.status, out: tw.stdout + tw.stderr });
}

// MO-8n: `--source` — what the library's own source shows of the words its types cannot, as comments above the rows
// (never as rows), each with the file and line that is the reason
fs.writeFileSync(path.join(ws, "evid.js"), [
  "import { createMemo, createEffect, onCleanup, createContext, useContext } from \"solid-js\";",
  "const Theme = createContext(\"light\");",
  "export function useShade() { return useContext(Theme); }",
  "export function listen(target, run) { target.addEventListener(\"click\", run); return () => target.removeEventListener(\"click\", run); }",
  "const wrap = pick => createMemo(() => pick(1));",
  "export function derive(pick) { return wrap(pick); }",
  "export function later(opts) { setTimeout(() => opts.onDone(1), 0); }",
  "export function each(items, visit) { for (const x of items) visit(x); }",
  "export function hand(run) { elsewhere(run); }",
  "",
].join("\n"));
fs.writeFileSync(path.join(ws, "evid.d.ts"), [
  "export declare function useShade(): string;",
  "export declare function listen(target: EventTarget, run: (e: Event) => void): () => void;",
  "export declare function derive(pick: (n: number) => number): () => number;",
  "export declare function later(opts: { onDone: (n: number) => void }): void;",
  "export declare function each(items: number[], visit: (n: number) => void): void;",
  "export declare function hand(run: (n: number) => void): void;",
  "",
].join("\n"));
const rs = spawnSync(process.execPath, [path.join(__dirname, "../bin/declare.js"), "./evid.js", "--source"], { cwd: ws, encoding: "utf8" });
const evid = rs.stdout; if (process.env.VERBOSE) console.log(evid, rs.stderr);
const note = (name, re) => evid.split("\n").some(l => l.startsWith(`// SOURCE ${name}: `) && re.test(l));
check("--source: a callback given to addEventListener is suggested `handler`, with the file and line", note("listen", /`run`: called from addEventListener.*`handler`\? \(MO-10g\) \[evid\.js:4\]$/), evid + rs.stderr);
check("--source: a result that removes what the call added is said to undo it (EF-5a)", note("listen", /its result calls removeEventListener.*\[evid\.js:4\]$/), evid);
check("--source: a callback called inside createMemo, through the library's own helper, is suggested `tracked`", note("derive", /`pick`: called inside createMemo, a computation — `tracked`\? \(MO-10j\) \[evid\.js:5\]$/), evid);
check("--source: a field of an options object called from a timer is suggested `handler`", note("later", /`opts\.onDone`: called from setTimeout.*`handler`\?/), evid);
check("--source: a context the hook reads is suggested as uses(…); state it reaches as `instantiates`", note("useShade", /it reads this context \(useContext\): Theme — uses\(<its name>\)\? \(MO-12b\) \[evid\.js:3\]$/) && note("derive", /it reaches createMemo.*`instantiates`\?/), evid);
check("--source: a callback called while the call runs needs no word, and one handed to code it cannot read is not guessed", note("each", /`visit`: called while the call runs — no word/) && !evid.split("\n").some(l => l.startsWith("// SOURCE hand: ")), evid);
const plainRows = t => t.split("\n").filter(l => !l.startsWith("// SOURCE"));
const re0 = spawnSync(process.execPath, [path.join(__dirname, "../bin/declare.js"), "./evid.js"], { cwd: ws, encoding: "utf8" });
check("--source changes no row: the evidence is comments, and a word stays a person's to write", JSON.stringify(plainRows(evid)) === JSON.stringify(re0.stdout.split("\n")) && /source: the module itself \(evid\.js\)/.test(rs.stderr) && /source: \d+ suggestions? for 5 of 6 rows/.test(rs.stderr), rs.stderr);
// where the source is: the `src/` a package publishes, the text its source maps carry, or neither (then the note says what to check out)
{
  const { locate } = require("../src/declare-source.js"); const ts = require("typescript");
  const app = path.join(ws, "srcapp"); const pkg = path.join(app, "node_modules/kit");
  fs.mkdirSync(path.join(pkg, "dist"), { recursive: true });
  fs.writeFileSync(path.join(pkg, "package.json"), JSON.stringify({ name: "kit", version: "1.2.3", main: "dist/index.js", types: "dist/index.d.ts", repository: { url: "git+https://example.test/kit.git", directory: "packages/kit" } }));
  fs.writeFileSync(path.join(pkg, "dist/index.js"), "export const make = () => 1;\n");
  fs.writeFileSync(path.join(pkg, "dist/index.d.ts"), "export declare function make(): number;\n");
  const none = locate(ts, "kit", app);
  check("--source: a package that ships built files only is said so, with its repository and the version to check out", none.kind === "none" && /publishes built files only/.test(none.note) && /https:\/\/example\.test\/kit \(packages\/kit\) at 1\.2\.3/.test(none.note), none);
  fs.writeFileSync(path.join(pkg, "dist/index.js.map"), JSON.stringify({ version: 3, sources: ["../src/index.ts"], sourcesContent: ["export const make = (): number => 1;\n"], mappings: "" }));
  const carried = locate(ts, "kit", app);
  check("--source: sources a source map carries (sourcesContent) are read from it", carried.kind === "sourcemap" && carried.files.size === 1 && [...carried.files.values()][0].includes("(): number => 1"), { kind: carried.kind, note: carried.note });
  fs.mkdirSync(path.join(pkg, "src")); fs.writeFileSync(path.join(pkg, "src/index.ts"), "export { make } from \"./make\";\n"); fs.writeFileSync(path.join(pkg, "src/make.ts"), "export const make = (): number => 1;\n");
  const shipped = locate(ts, "kit", app);
  check("--source: a package that publishes its src/ is read from there, every file of it", shipped.kind === "published" && shipped.files.size === 2, { kind: shipped.kind, note: shipped.note });
  const co = path.join(ws, "checkout/packages/kit"); fs.mkdirSync(path.join(co, "src"), { recursive: true });
  fs.writeFileSync(path.join(co, "package.json"), JSON.stringify({ name: "kit", version: "1.3.0" })); fs.writeFileSync(path.join(co, "src/index.ts"), "export const make = (): number => 1;\n");
  const given = locate(ts, "kit", app, path.join(ws, "checkout"));
  check("--source <checkout>: the package is found in the checkout by its name, and a version that differs from the installed one is said", given.kind === "checkout" && given.files.size === 1 && /the checkout is 1\.3\.0 and 1\.2\.3 is installed/.test(given.note), { kind: given.kind, note: given.note });
}

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
check("a compound root is a component that provides its parts' context (MO-11q, by running)", kitHas("export component Dialog(props: { open?: boolean; children?: View }) provides(dialog)"), kit + r3.stderr);
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
