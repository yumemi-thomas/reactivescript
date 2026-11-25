// `rx-declare` (bin/declare.js) on a small module with TypeScript types: each kind of export becomes the row it
// should, the hook gets its TODO, and the draft is a declaration rx-tsc accepts against the same types (TY-6).
//   node test/declare.js            VERBOSE=1 prints the draft
// (MO-8v) The modules these tests draft are stand-ins for their types: a body of one line that does nothing. What the code
// proves is test/words.js's; here the draft is the types' alone, as `rx-declare --no-infer` writes it.
process.env.RX_DECLARE_INFER = "0";
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
  "import type { Accessor } from \"solid-js\";", "export declare function createDebounced(source: Accessor<string>, ms: number): Accessor<string>;",
  "export declare function createToggle(initial: boolean): [Accessor<boolean>, (v: boolean) => void];",
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
check("a fn that answers a value is io until a person writes `pure`, asked of whatever its name; a context it may read is not asked of its name", has("export fn useTheme(): string") && /\/\/ TODO useTheme: io as drafted, refused in a view or an equation\. `pure fn` if it only computes\. Not read: /.test(draft) && !/uses\(/.test(draft), draft);
check("a component's JSX children are a View", has("export component Card(props: { title: string; children?: View })"), draft);
check("a function-typed children prop is a render prop (MO-11k)", has("export component List(props: { items: string[]; children: (item: string, index: number) => View })"), draft);
check("a callback parameter is a function type; an optional one keeps its `?` (MO-8e)", has("export fn onIdle(run: () => void, delay?: number): void"), draft);
check("a callback of an io fn is not asked about: a closure there may write already (MO-10g)", !/TODO (watch|onIdle)/.test(draft) && !/handler \(/.test(draft.split("\n").filter(l => !l.startsWith("//")).join("\n")), draft);
check("a component's callback that answers nothing is asked about; one that gives a view is not", /\/\/ TODO Toggle: onToggle: a closure there may not write a source\. `handler/.test(draft) && !/TODO List/.test(draft) && has("export component Toggle(props: { on: boolean; onToggle: (v: boolean) => void })"), draft);

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
  "export declare function makePager(): { page: import(\"solid-js\").Accessor<number>; turns: () => number; getPageCount: () => number; next: () => void; rows: Row[]; label: string; nested: { open: boolean; close: () => void } };",
  "export declare function makeClient(): Client;",
  "export declare function load(id: string): Promise<Row[]>;",
  "",
].join("\n"));
const r1 = spawnSync(process.execPath, [path.join(__dirname, "../bin/declare.js"), "./more.js"], { cwd: ws, encoding: "utf8" });
const more = r1.stdout; if (process.env.VERBOSE) console.log(more, r1.stderr);
const hasMore = line => more.split("\n").includes(line);
check("a result that takes nothing and answers nothing is `() => void`, through the library's own name for it (EF-5a)", hasMore("export fn listen(run: () => void): () => void"), more);
check("a small object result is typed by its fields: an accessor `ref`, one only shaped as an accessor and a called getter and a function by what they answer, a nested object a step further", hasMore("export fn makePager(): { page: ref number; turns: () => number; getPageCount: () => number; next: () => void; rows: Row[]; label: string; nested: { open: boolean; close: () => void } }"), more);
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
check("an overloaded fn whose signatures' rows would hold an `any` of the draft's is its last signature, the part with no name by its place (MO-8q): no `any` is drafted, and --explain says so", hasNamed("export fn over(a: Parameters<typeof import(\"./named.js\").over>[0], b: number): number") && !/^export fn over\(a: any/m.test(named) && /0 `any` drafted \(0 the library's own, 0 the draft's\)/.test(rn.stderr), named + rn.stderr);
check("an interface of fields that no module exports is written as the record of them (MO-8o)", hasNamed("export fn open(x: { id: string; tags: string[] }): number"), named);
check("beside a type parameter, a part with no name is said by its place at the row's type parameters (`typeof import(…).pick<T>`), where TypeScript holds the row (MO-8q)", hasNamed("export fn pick<T>(rows: readonly T[], by: Parameters<typeof import(\"./named.js\").pick<T>>[1]): T | undefined"), named);

// MO-8q: no `any` in a draft is the draft's. Each way a draft wrote one, and what it writes now: the library's own `any`
// reproduced (and not counted against the reading that names the type), a bound that is a long helper alias written
// out, a predicate as the library writes it, a parameter that is a type parameter by its name, an accessor of a type no
// module exports by its place at the row's type parameters, options with a field a row cannot write by their name, a
// result the app's project cannot resolve but the library calls `JSX.Element`, a function of nothing that gives an
// element, and — where a bound has no name at all — the last reading: the last signature, each part by its place
fs.writeFileSync(path.join(ws, "whole.js"), "export const tag = x => x, guard = x => x, keep = f => f, watch = () => {}, walk = p => p, Lost = () => null, Catch = () => null, adapt = o => o, fwd = a => a, Block = () => null, wide = s => s;\n");
const WIDE = Array.from({ length: 70 }, (_, k) => `Box<"${k < 26 ? "" : String.fromCharCode(96 + Math.floor(k / 26))}${String.fromCharCode(97 + k % 26)}">`).join(" | ");   // longer than a row was once allowed to be
fs.writeFileSync(path.join(ws, "whole.d.ts"), [
  "import type { Accessor } from \"solid-js\";",
  "import type { JSX } from \"@solidjs/web\";",
  "export interface Box<T> { value: T }",
  "interface Hidden<T> { secret: T; more: Hidden<T> | null }",
  "type Walk<P> = P extends readonly [infer H, ...infer R] ? [H, ...Walk<R>] : [];",
  `type Wide = ${WIDE};`,
  "export interface Adapter<T> { key: string; test: (v: unknown) => v is T }",
  "export interface Std { \"~run\": () => void; kind: string }",
  "export declare function tag<T extends Box<any>>(x: T, y: Box<any>): T;",
  "export declare function guard<T>(test: (x: unknown) => x is T): T;",
  "export declare function keep<const F extends (...args: any[]) => unknown>(f: F): void;",
  "export declare function watch<T>(opts: Accessor<Hidden<T>>): void;",
  "export declare function walk<const P extends readonly unknown[], S extends Walk<P>>(paths: P, pick: (s: S) => boolean): S;",
  "export declare function walk<const P extends readonly unknown[], S extends Walk<P>>(paths: P, pick: (s: S) => boolean, label: string): S;",
  "export declare function wide<const S extends Wide>(s: S): S[\"value\"];",
  "export declare function Lost(props: { id: string }): import(\"no-such-package\").JSX.Element;",
  "export declare function Catch(props: { render?: () => JSX.Element; children?: JSX.Element }): JSX.Element;",
  "export declare function adapt<T>(opts: Adapter<T>): Adapter<T>;",
  "export declare function fwd(a: Std): Std;",
  "interface BlockComponent { <T extends string = string>(props: { when: (x: Hidden<T>) => boolean; children?: JSX.Element }): JSX.Element; (props: { old: (x: Hidden<string>) => boolean }): JSX.Element }",
  "export declare const Block: BlockComponent;",
  "export {};",
  "",
].join("\n"));
const rw = spawnSync(process.execPath, [path.join(__dirname, "../bin/declare.js"), "./whole.js", "--explain", "--readings", "walk"], { cwd: ws, encoding: "utf8" });
const wholeDraft = rw.stdout; if (process.env.VERBOSE) console.log(wholeDraft, rw.stderr);
const hasWhole = line => wholeDraft.split("\n").includes(line);
const W = 'typeof import("./whole.js")';
check("MO-8q: a draft of such a module holds no `any` of its own, and --explain counts the library's", /3 `any` drafted \(3 the library's own, 0 the draft's\) — 3 vendor-any/.test(rw.stderr) && !/the draft's, not the library's/.test(wholeDraft), wholeDraft + rw.stderr);
check("...the library's `any` is reproduced beside the type it is in (a reading that names the type is not the worse for it)", hasWhole("export fn tag<T extends Box<any>>(x: T, y: Box<any>): T"), wholeDraft);
check("...a predicate is written as the library writes it", hasWhole("export fn guard<T>(test: (x: unknown) => x is T): T"), wholeDraft);
check("...a parameter that is one of the row's type parameters is that parameter, not its bound's signature", hasWhole("export fn keep<const F extends (...args: any[]) => unknown>(f: F): void"), wholeDraft);
check("...an accessor of a type no module exports is what the parameter answers, at the row's type parameters", hasWhole(`export fn watch<T>(ref opts: ReturnType<Parameters<${W}.watch<T>>[0]>): void`), wholeDraft);
check("...a bound that is a helper alias is written out, however long", hasWhole(`export fn wide<const S extends (${WIDE})>(s: S): S["value"]`), wholeDraft);
check("...a bound with no name leaves the last reading: the last signature, a part with no name by its place", hasWhole(`export fn walk(paths: Parameters<${W}.walk>[0], pick: (...args: Parameters<Parameters<${W}.walk>[1]>) => ReturnType<Parameters<${W}.walk>[1]>, label: string): ReturnType<${W}.walk>`), wholeDraft);
check("...and --readings says what each reading of a row was, and TypeScript's answer to it", /rx-declare: walk read \{"generics":true,"paths":true,"decl":true\}: held\n {4}export fn walk\(/.test(rw.stderr) && /rx-declare: walk read \{"generics":false,"paths":true,"decl":true,"whole":true\}: held/.test(rw.stderr), rw.stderr);
check("...a result the app's project cannot resolve, written `JSX.Element` by the library, is a component's", hasWhole("export component Lost(props: { id: string })"), wholeDraft);
check("...a function of nothing that gives an element is a render prop, `() => View` (a `Component` takes props, and TypeScript does not hold it there)", hasWhole("export component Catch(props: { render?: () => View; children?: View })"), wholeDraft);
check("...options with a predicate field, or a field a row cannot name, are the type the library declares", hasWhole("export fn adapt<T>(opts: Adapter<T>): Adapter<T>") && hasWhole("export fn fwd(a: Std): Std"), wholeDraft);
check("...a component with several signatures whose first has a prop with no text is its last, by its place", hasWhole(`export component Block(props: { old: (...args: Parameters<Parameters<${W}.Block>[0]["old"]>) => ReturnType<Parameters<${W}.Block>[0]["old"]> })`), wholeDraft);
fs.writeFileSync(path.join(ws, "whole.d.rx"), wholeDraft);
fs.writeFileSync(path.join(ws, "whole.rx"), 'import { fwd } from "./whole.js"\nexport action go(a: import("./whole.js").Std) { fwd(a) }\n');
fs.writeFileSync(path.join(ws, "tsconfig.whole.json"), JSON.stringify({ compilerOptions: { jsx: "preserve", jsxImportSource: "@solidjs/web", strict: true, target: "ES2022", module: "ESNext", moduleResolution: "Bundler", noEmit: true, skipLibCheck: true, lib: ["ES2022", "DOM"], types: [] }, include: ["whole.rx", "whole.d.rx"] }));
const twh = spawnSync(process.execPath, [path.join(__dirname, "../bin/tsc.js"), "-p", "tsconfig.whole.json"], { cwd: ws, encoding: "utf8" });
check("...and rx-tsc holds every row of it against the module (TY-6)", twh.status === 0 && !/DECLARATION_MISMATCH/.test(twh.stdout), { status: twh.status, out: twh.stdout + twh.stderr });
fs.rmSync(path.join(ws, "tsconfig.whole.json"), { force: true }); fs.rmSync(path.join(ws, "whole.rx")); fs.rmSync(path.join(ws, "whole.d.rx"));
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

// MO-8o, MO-8q: a package whose declarations are a bundle — its types named by the module that exports them (a
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
  check("a fn with several signatures has one row, the shortest; how many the library has is a note, said with --explain and not among the questions (MO-8b)", wide.includes("export fn on(target: Window, cb: (e: Event) => void): () => void") && !wide.includes("export fn on(target: Document") && /rx-declare: on: 2 signatures in the library's types/.test(rw.stderr) && !/TODO on: 2 signatures/.test(rw.stdout), rw.stdout + rw.stderr);
  check("a component's props are the type the library declares them with, and after it the fields the checker reads (MO-8o)", wide.includes("export component Picker<O>(props: PickerProps<O> & { onPick?: (v: O) => void; render?: Component })"), rw.stdout);
  const causes = JSON.parse(fs.readFileSync(path.join(app, "causes.json"), "utf8")).causes;
  check("the library's own `any` is written as it is, and counted as the library's; its `unknown` stays `unknown` (MO-8q)", wide.includes("export fn loosely(x: any, y: unknown): Record<string, any>") && causes.length === 2 && causes.every(c => c.cause === "vendor-any" && c.name === "loosely") && /2 `any` drafted \(2 the library's own, 0 the draft's\)/.test(rw.stderr), rw.stdout + rw.stderr);
  fs.writeFileSync(path.join(app, "tsconfig.json"), fs.readFileSync(path.join(ws, "tsconfig.json"), "utf8"));
  fs.mkdirSync(path.join(app, "rx-types"), { recursive: true }); fs.writeFileSync(path.join(app, "rx-types/wide.d.rx"), rw.stdout);
  fs.writeFileSync(path.join(app, "main.rx"), "import { Picker, on } from \"wide\"\nexport default component N() {\n  <Picker value=\"a\" label=\"x\" />\n}\n");
  const tw = spawnSync(process.execPath, [path.join(__dirname, "../bin/tsc.js"), "--noEmit", "-p", "tsconfig.json"], { cwd: app, encoding: "utf8" });
  check("that draft passes rx-tsc against the package's own types: the props type, the record after it, each signature (TY-6)", tw.status === 0 && tw.stdout.trim() === "", { status: tw.status, out: tw.stdout + tw.stderr });
}

const t = spawnSync(process.execPath, [path.join(__dirname, "../bin/tsc.js")], { cwd: ws, encoding: "utf8" });
check("the draft parses and passes rx-tsc against the module's own types (TY-6)", t.status === 0 && t.stdout.trim() === "", { status: t.status, out: t.stdout + t.stderr });

// rx-declare runs a package as a browser bundle imports it: an ESM-only package whose `exports` maps subpaths by a
// pattern (`"./*": { "import": "./dist/*.mjs" }`) is found, as the crate finds its declaration
{
  const pkg = path.join(ws, "node_modules-pat/node_modules/kit"); fs.mkdirSync(path.join(pkg, "dist/menu"), { recursive: true });
  fs.writeFileSync(path.join(pkg, "package.json"), JSON.stringify({ name: "kit", type: "module", exports: { ".": { import: "./dist/index.mjs" }, "./*": { import: "./dist/*.mjs" }, "./menu/*": { import: "./dist/menu/*.mjs" } } }));
  for (const f of ["dist/index.mjs", "dist/button.mjs", "dist/menu/item.mjs"]) fs.writeFileSync(path.join(pkg, f), "export const x = 1;\n");
  const { resolveModule } = require("../src/load.js");
  const from = path.join(ws, "node_modules-pat");
  check("an exports pattern resolves (./* and the longer ./menu/*), as the crate's packageDeclaration does", resolveModule("kit/button", from) === path.join(pkg, "dist/button.mjs") && resolveModule("kit/menu/item", from) === path.join(pkg, "dist/menu/item.mjs") && resolveModule("kit", from) === path.join(pkg, "dist/index.mjs") && resolveModule("kit/nope", from) === null, [resolveModule("kit/button", from), resolveModule("kit/menu/item", from), resolveModule("kit", from)]);
}
// MO-8o: a type of a package the library depends on is named as the *library* resolves it — the same rows whether the
// install hoisted that dependency beside the app or nested it under the library, and whatever other copy of it (another
// version) the app's folder can see. (The benchmark's draft of @solid-primitives/event-listener said `Many<Target>` on
// one machine and `Target | Target[]` on another: nothing but npm's hoisting differed.)
{
  const kitFiles = { "package.json": JSON.stringify({ name: "kit", version: "1.0.0", type: "module", main: "./index.js", types: "./index.d.ts", dependencies: { dep: "^2.0.0" } }), "index.js": "export const listen = () => {};\n", "index.d.ts": "import type { Many } from \"dep\";\nexport declare function listen<T extends EventTarget>(target: Many<T | undefined>, type: Many<string>): void;\n" };
  const dep2 = { "package.json": JSON.stringify({ name: "dep", version: "2.0.0", type: "module", main: "./index.js", types: "./index.d.ts" }), "index.js": "export {};\n", "index.d.ts": "export type Many<T> = T | T[];\n" };
  const dep1 = { "package.json": JSON.stringify({ name: "dep", version: "1.0.0", type: "module", main: "./index.js", types: "./index.d.ts" }), "index.js": "export {};\n", "index.d.ts": "export type Many<T> = T[];\nexport type Old = 1;\n" };   // another version, hoisted: another type under the same name
  const lay = (name, where) => {
    const app = path.join(ws, name); fs.rmSync(app, { recursive: true, force: true });
    const put = (dir, files) => { fs.mkdirSync(dir, { recursive: true }); for (const [f, t] of Object.entries(files)) fs.writeFileSync(path.join(dir, f), t); };
    put(path.join(app, "node_modules/kit"), kitFiles);
    for (const [at, files] of where) put(path.join(app, "node_modules", at), files);
    for (const n of ["@solidjs", "solid-js", "typescript"]) fs.symlinkSync(path.join(repo, "ref/node_modules", n), path.join(app, "node_modules", n), "dir");
    const r = spawnSync(process.execPath, [path.join(__dirname, "../bin/declare.js"), "kit"], { cwd: app, encoding: "utf8" });
    // the draft, kept as the project's declaration of the package, and a program that imports it: rx-tsc holds the row (TY-6)
    fs.mkdirSync(path.join(app, "rx-types"), { recursive: true });
    fs.writeFileSync(path.join(app, "rx-types/kit.d.rx"), r.stdout);
    fs.writeFileSync(path.join(app, "main.rx"), 'import { listen } from "kit"\nexport default component App() {\n  <button onClick={(e) => { listen(e.currentTarget, "x") }}>x</button>\n}\n');
    fs.writeFileSync(path.join(app, "tsconfig.json"), JSON.stringify({ compilerOptions: { jsx: "preserve", jsxImportSource: "@solidjs/web", strict: true, target: "ES2022", module: "ESNext", moduleResolution: "Bundler", noEmit: true, skipLibCheck: true, lib: ["ES2023", "DOM"], types: [] }, include: ["main.rx"] }));
    const t = spawnSync(process.execPath, [path.join(__dirname, "../bin/tsc.js"), "--noEmit"], { cwd: app, encoding: "utf8" });
    return { draft: r.stdout, err: r.stderr, tsc: { status: t.status, out: t.stdout + t.stderr } };
  };
  const hoisted = lay("lay-hoisted", [["dep", dep2]]);
  const nested = lay("lay-nested", [["kit/node_modules/dep", dep2]]);
  const skewed = lay("lay-skewed", [["kit/node_modules/dep", dep2], ["dep", dep1]]);
  const row = 'export fn listen<T extends EventTarget>(target: import("dep").Many<T | undefined>, type_: import("dep").Many<string>): void';
  check("a dependency's type is named as the library resolves it, hoisted beside the app (MO-8o)", hoisted.draft.split("\n").includes(row), hoisted.draft + hoisted.err);
  check("...nested under the library: the same draft, row for row", nested.draft === hoisted.draft, nested.draft + nested.err);
  check("...and with another version of it hoisted beside the app: the same draft still (the library's copy is the one named)", skewed.draft === hoisted.draft, skewed.draft + skewed.err);
  check("rx-tsc holds that row against the module in each layout (TY-6 resolves what a row names from the library too)", [hoisted, nested, skewed].every(l => l.tsc.status === 0 && l.tsc.out.trim() === ""), [hoisted.tsc, nested.tsc, skewed.tsc]);
}

// MO-8o: props of more fields than a reader can use, of a type no module exports (a part's own beside an element's
// attributes), are the library's by their place — at the row's type parameters — with the fields the checker reads after it;
// a few such props are written out
{
  fs.writeFileSync(path.join(ws, "wide.js"), "export const Part = props => null;\nexport const Pick = props => null;\nexport const Small = props => null;\n");
  fs.writeFileSync(path.join(ws, "wide.d.ts"), [
    "import type { JSX } from \"@solidjs/web\";",
    `type Attrs = { ${Array.from({ length: 30 }, (_, i) => `a${i}?: string | { k: ${i} }`).join("; ")} };`,
    "interface Comp<S, N> { (props: Omit<Attrs, keyof N> & N & { render?: (state: S) => JSX.Element; icon?: JSX.Element; onPick?: (v: string) => void; onAbort?: ((e: Event) => void) | { handle: 1 }; children?: JSX.Element | ((s: S) => JSX.Element) }): JSX.Element }",
    "export declare const Part: Comp<{ open: boolean }, { value?: string }>;",
    "interface Gen<N> { <T extends string = string>(props: Attrs & N & { value?: T; onPick?: (v: T) => void }): JSX.Element }",
    "export declare const Pick: Gen<{ b?: string }>;",
    "interface Few<N> { (props: N & { onPick: (v: string) => void }): JSX.Element }",
    "export declare const Small: Few<{ a: string }>;", "export {};", ""].join("\n"));
  const r = spawnSync(process.execPath, [path.join(__dirname, "../bin/declare.js"), "./wide.js", "--out", "wide.d.rx"], { cwd: ws, encoding: "utf8" });
  const text = fs.readFileSync(path.join(ws, "wide.d.rx"), "utf8"), row = n => text.split("\n").find(l => l.startsWith(`export component ${n}`));
  check("a component's many unnamed props are their place, and the fields the checker reads", row("Part") === 'export component Part(props: Parameters<typeof import("./wide.js").Part>[0] & { render?: Component; icon?: View; onPick?: (v: string) => void })', text + r.stderr);
  check("...at the row's type parameters, a generic component's", row("Pick") === 'export component Pick<T extends string = string>(props: Parameters<typeof import("./wide.js").Pick<T>>[0] & { onPick?: (v: T) => void })', text);
  check("...and a few are written out", row("Small") === "export component Small(props: { a: string; onPick: (v: string) => void })", text);
}

// `ref` is read in the result's own record (MO-10b), and a record that may be absent is a union: its accessors are drafted
// as the functions they are, and the crate's check of the row is TypeScript
{
  fs.writeFileSync(path.join(ws, "absent.js"), "export const x = 1;\n");
  fs.writeFileSync(path.join(ws, "absent.d.ts"), 'import type { Accessor } from "solid-js";\ninterface Inner { name: Accessor<string | undefined>; deep: { on: Accessor<boolean> }; set: (v: string) => void }\nexport declare function useMaybe(id: string): Inner | null;\nexport declare function useMaybeNot(id: string): { open: Accessor<boolean> } | undefined;\nexport declare function useAlways(id: string): { open: Accessor<boolean> };\nexport {};\n');
  const r = spawnSync(process.execPath, [path.join(__dirname, "../bin/declare.js"), "./absent.js", "--no-infer"], { cwd: ws, encoding: "utf8" });
  const row = n => r.stdout.split("\n").find(l => l.includes(`fn ${n}(`)) ?? "";
  check("a record that may be absent has no `ref` field: an accessor in it is a function", !/\bref\b/.test(row("useMaybe")) && /name: \(\) => string \| undefined;.*deep: \{ on: \(\) => boolean \};.*\} \| null/.test(row("useMaybe")) && /\{ open: \(\) => boolean \} \| undefined/.test(row("useMaybeNot")), r.stdout + r.stderr);
  check("...and one that is always there has", /: \{ open: ref boolean \}/.test(row("useAlways")), row("useAlways"));
  const b = require("../src/rxc.js").boundary(path.join(ws, "absent.d.rx"), "./absent.js", r.stdout);
  check("...so no check the crate writes of a draft holds a word TypeScript cannot read", typeof b.code === "string" && !/[:[,(]\s*ref\s+[\w({[]/.test(b.code), b);
}

// a draft the crate cannot read is an error, with the line and the parser's reason — not `any` for every row and nothing
// said (a `readonly` prop the parser refused did that to a whole library)
{
  const { failing } = require("../src/declare-check.js");
  let thrown; try { failing("export pure fn ok(): number\nexport component Broken(props: { a b })\n", 0, ["export pure fn ok(): number", "export component Broken(props: { a b })"], "./more.js", ws, {}); } catch (e) { thrown = e; }
  check("a draft the crate cannot parse is not checked row by row: it throws, naming the line, the parser's reason and the row", thrown?.code === "RX_DRAFT_UNREADABLE" && thrown.line === 2 && /line 2: /.test(thrown.message) && /2 \| export component Broken\(props: \{ a b \}\)/.test(thrown.message), String(thrown?.message ?? thrown));
  // the same through rx-declare: the crate is made to refuse the draft, and the run fails with that message and writes nothing
  const stub = path.join(ws, "refuse-draft.cjs");
  fs.writeFileSync(stub, `const rxc = require(${JSON.stringify(path.join(__dirname, "../src/rxc.js"))}); rxc.boundary = () => ({ error: "line 3: expected '}' near 'readonly x'" });\n`);
  fs.rmSync(path.join(ws, "refused.d.rx"), { force: true });
  const rr = spawnSync(process.execPath, ["--require", stub, path.join(__dirname, "../bin/declare.js"), "./more.js", "--out", "refused.d.rx"], { cwd: ws, encoding: "utf8" });
  check("rx-declare fails loudly on a draft that cannot be read back: non-zero, the line and the parse error on stderr, no file written", rr.status === 1 && /rx-declare: the draft for \.\/more\.js cannot be read back as a \.d\.rx.*line 3: expected '}' near 'readonly x'/.test(rr.stderr) && /\n    3 \| /.test(rr.stderr) && !fs.existsSync(path.join(ws, "refused.d.rx")), rr.stdout + rr.stderr);
}
// 09 MO-14: `rx-declare --host`, a draft of a host declaration from the modules a JS host renders
{
  const app = path.join(ws, "hostapp"); fs.mkdirSync(path.join(app, "src/routes"), { recursive: true });
  fs.writeFileSync(path.join(app, "src/router.d.rx"), "export context router\nexport pure fn useParams(): { id: string } instantiates uses(router)\nexport fn go(to: string): void\n");
  fs.writeFileSync(path.join(app, "src/routes/layout.rx"), "import { go } from \"../router.js\"\nexport default component Layout(props: { children?: View }) {\n  <main>{props.children}</main>\n}\n");
  fs.writeFileSync(path.join(app, "src/routes/person.rx"), "import { useParams } from \"../router.js\"\nexport default component Person() {\n  params = useParams()\n  <h1>{params.id}</h1>\n}\nexport component Crumb() { <p>crumb</p> }\n");
  const rh = spawnSync(process.execPath, [path.join(__dirname, "../bin/declare.js"), "--host", "src/routes/layout.rx", "src/routes/person.rx", "--out", "src/host.d.rx"], { cwd: app, encoding: "utf8" });
  const text = rh.status === 0 ? fs.readFileSync(path.join(app, "src/host.d.rx"), "utf8") : rh.stderr;
  const rows = text.split("\n").filter(l => l && !l.startsWith("//"));
  check("rx-declare --host drafts a host declaration: an import of each module's exported components, as the declaration's own folder names it", rows[0] === "import { Layout } from \"./routes/layout.rx\"" && rows[1] === "import { Person, Crumb } from \"./routes/person.rx\"", text);
  check("...the contexts those modules' imports are declared to use, for the host to provide", rows[2] === "export context router from \"./router.js\"", text);
  check("...and a view with every component at the top, the nesting left to write", rows[3] === "export default component provides(router) nests(children in component) = [{ component: Layout }, { component: Person }, { component: Crumb }]" && /TODO: every component is placed at the top/.test(text), text);
  const read = require("../src/rxc").rows(path.join(app, "src/host.d.rx"));
  check("...which the crate reads as a host declaration (its view claims placement and each provision)", !read.error && JSON.stringify(read.rows.filter(r => r.kind === "host").map(r => r.obligations)) === JSON.stringify([["placement", "provides:router"]]), JSON.stringify(read));
}
// 09 MO-8t: the methods of an exported object, and of an exported function, each drafted as a fn is, after its object
{
  const app = path.join(ws, "methods"); fs.mkdirSync(app, { recursive: true });
  fs.symlinkSync(path.join(repo, "ref/node_modules"), path.join(app, "node_modules"), "dir");
  fs.writeFileSync(path.join(app, "kit.js"), "const list = [];\nexport const toaster = { show(c) { list.push(c); return list.length; }, dismiss(id) {}, getCount() { return list.length; }, words: [\"a\"] };\nexport const toast = Object.assign(m => 1, { success: m => 2, Region: () => null });\nexport const sizes = [1, 2];\n");
  fs.writeFileSync(path.join(app, "kit.d.ts"), [
    "import type { JSX } from \"@solidjs/web\";",
    "export declare const toaster: { show(toast: (props: { id: number }) => JSX.Element): number; dismiss(id: number): void; getCount(): number; words: string[] };",
    "export declare function toast(message: string): number;",
    "export declare namespace toast { function success(message: string, options?: { onDismiss?: () => void }): number; function Region(props: {}): JSX.Element; }",
    "export declare const sizes: number[];", "",
  ].join("\n"));
  const r = spawnSync(process.execPath, [path.join(__dirname, "../bin/declare.js"), "./kit.js"], { cwd: app, encoding: "utf8" });
  const text = r.stdout + r.stderr; const rows = text.split("\n").filter(l => /^export /.test(l));
  check("rx-declare drafts a row for each method of an exported object, after the object's (09 MO-8t): io as drafted; where a component it is given is rendered is not asked, the module having no component to name", JSON.stringify(rows.filter(l => /toaster/.test(l))) === JSON.stringify(["export const toaster: typeof import(\"./kit.js\").toaster", "export fn toaster.show(toast: Component<{ id: number; }>): number", "export fn toaster.dismiss(id: number): void", "export fn toaster.getCount(): number"]) && !/TODO toaster\.show: `toast`: a component given there/.test(text), text);
  check("...and asks `pure` of each that answers, whatever its name (never written by a guess)", /TODO toaster\.getCount: io as drafted/.test(text) && /TODO toaster\.show: io as drafted/.test(text) && !/TODO toaster\.dismiss: io/.test(text) && !/pure fn toaster/.test(text), text);
  check("...and for each method of an exported function, after the function's; a member that is a component is no method, and an array's own are not the library's", JSON.stringify(rows.filter(l => /\btoast\b/.test(l) && !/toaster/.test(l))) === JSON.stringify(["export fn toast(message: string): number", "export fn toast.success(message: string, options?: { onDismiss?: () => void }): number"]) && !/sizes\./.test(text) && !/toaster\.words/.test(text), text);
  fs.writeFileSync(path.join(app, "kit.d.rx"), rows.join("\n") + "\n");
  const read = require("../src/rxc").rows(path.join(app, "kit.d.rx"));
  check("...rows the crate reads back, each by its dotted name", !read.error && read.rows.filter(x => x.kind === "fn").map(x => x.name).join() === "toaster.show,toaster.dismiss,toaster.getCount,toast,toast.success", JSON.stringify(read).slice(0, 400));
  const decl = require("../src/rxc").declaration(path.join(app, "kit.d.rx"));
  check("...and projects to a `.d.ts`: a value's methods in its type, a fn's in the namespace merged with it (13 TY-4b)", /export declare const toaster: \(typeof import\("\.\/kit\.js"\)\.toaster\) & \{ show: \(toast: Component<\{ id: number; \}>\) => number; dismiss: \(id: number\) => void; getCount: \(\) => number; \};/.test(decl.code) && /export declare namespace toast \{ function success\(message: string, options\?: \{ onDismiss\?: \(\) => void \}\): number; \}/.test(decl.code), JSON.stringify(decl).slice(0, 600));
}
// 09 MO-8u: a module's default export is drafted as the row named `default` (it was a TODO to write a JS helper)
{
  const app = path.join(ws, "defaults"); fs.mkdirSync(app, { recursive: true });
  fs.symlinkSync(path.join(repo, "ref/node_modules"), path.join(app, "node_modules"), "dir");
  fs.writeFileSync(path.join(app, "status.js"), "export default function useOnline() { return () => true; }\n");
  fs.writeFileSync(path.join(app, "status.d.ts"), "export default function useOnline(): import(\"solid-js\").Accessor<boolean>;\n");
  fs.writeFileSync(path.join(app, "card.js"), "export default function Card(props) { return props.children; }\n");
  fs.writeFileSync(path.join(app, "card.d.ts"), "import type { JSX } from \"@solidjs/web\";\nexport default function Card(props: { title: string; children?: JSX.Element }): JSX.Element;\n");
  const draftOf = m => { const r = spawnSync(process.execPath, [path.join(__dirname, "../bin/declare.js"), m], { cwd: app, encoding: "utf8" }); return r.stdout + r.stderr; };
  const fnDraft = draftOf("./status.js"), compDraft = draftOf("./card.js");
  check("rx-declare drafts a module's default export as the row named `default`: a fn", /^export fn default\(\): ref boolean$/m.test(fnDraft) && !/JS helper/.test(fnDraft), fnDraft);
  check("...and a component (it has no capital to go by: a component by what it is)", /^export component default\(props: \{ title: string; children\?: View \}\)$/m.test(compDraft), compDraft);
  fs.writeFileSync(path.join(app, "status.d.rx"), "export pure fn default(): ref boolean\n");
  fs.writeFileSync(path.join(app, "card.d.rx"), "export component default(props: { title: string; children?: View })\n");
  fs.writeFileSync(path.join(app, "main.rx"), "import { default as useOnline } from \"./status.js\"\nimport { default as Card } from \"./card.js\"\nexport default component App() {\n  online = useOnline()\n  <Card title=\"net\">{online ? \"on\" : \"off\"}</Card>\n}\n");
  const got = require("../src/rxc").checkProgram(path.join(app, "main.rx"));
  check("...which an `.rx` module imports as JavaScript does, `import { default as x }`: checked by the row", !got.error && (got.diagnostics ?? []).length === 0, JSON.stringify(got).slice(0, 400));
  fs.writeFileSync(path.join(app, "main.rx"), "import { default as useOnline } from \"./status.js\"\nexport default component App() {\n  <p>{useOnline() ? \"on\" : \"off\"}</p>\n}\n");
  const bad = require("../src/rxc").checkProgram(path.join(app, "main.rx"));
  check("...and projects to a `.d.ts` as the module's default export (13 TY-4b)", /declare function __default\(\): \(\(\) => boolean\);\nexport default __default;/.test(require("../src/rxc").declaration(path.join(app, "status.d.rx")).code) && /declare function __default\(props: \{ title: string; children\?: View; \}\): View;\nexport default __default;/.test(require("../src/rxc").declaration(path.join(app, "card.d.rx")).code), JSON.stringify([require("../src/rxc").declaration(path.join(app, "status.d.rx")), require("../src/rxc").declaration(path.join(app, "card.d.rx"))]));
  check("...its words the row's: a primitive made where the view reads it is refused", (bad.diagnostics ?? []).some(d => d.code === "INSTANTIATION_NOT_BOUND"), JSON.stringify(bad).slice(0, 400));
}
// 09 MO-14g: `rx-declare --host --routes`, the whole declaration derived from the router's own tree — and held to it
{
  const app = path.join(ws, "routesapp"); fs.mkdirSync(path.join(app, "src/routes"), { recursive: true }); fs.mkdirSync(path.join(app, "src/pages"), { recursive: true });
  const w = (f, text) => fs.writeFileSync(path.join(app, "src", f), text);
  w("router.d.rx", "export context router\nexport component AppRouter(props: {}) provides(router)\nexport component Outlet(props: {}) uses(router)\nexport pure fn useParams(): { id: string } instantiates uses(router)\n");
  w("router.tsx", "import { routeTree } from \"./routeTree.gen\";\nexport const AppRouter = () => routeTree;\nexport const Outlet = () => null;\nexport const useParams = () => ({ id: \"1\" });\n");
  w("main.rx", "import { AppRouter } from \"./router.tsx\"\nexport default component App() {\n  <main><AppRouter /></main>\n}\n");
  w("routes/__root.rx", "export default component Root(props: { children?: View }) {\n  <main>{props.children}</main>\n}\n");
  w("routes/index.rx", "export default component Page() {\n  <h1>home</h1>\n}\n");
  w("routes/people.$id.rx", "import { useParams } from \"../router.tsx\"\nexport default component Page() {\n  params = useParams()\n  <h1>{params.id}</h1>\n}\n");
  w("pages/about.rx", "export component About() {\n  <h1>about</h1>\n}\nexport component Team() {\n  <h1>team</h1>\n}\n");
  w("routes/about.tsx", "import { createFileRoute } from \"@tanstack/solid-router\";\nimport { About, Team } from \"../pages/about.rx?rx-lib\";\nvoid Team;\nexport const Route = createFileRoute(\"/about\")({ component: About });\n");
  w("routes/plain.tsx", "import { createFileRoute } from \"@tanstack/solid-router\";\nexport const Route = createFileRoute(\"/plain\")({ component: () => null });\n");
  const tree = extra => [
    "import { createFileRoute, createRootRoute } from '@tanstack/solid-router'", "",
    "import { default as rootRouteComponent } from './routes/__root.rx?rx-page'",
    "import { default as IndexRouteComponent } from './routes/index.rx?rx-page'",
    "import { default as PeopleIdRouteComponent } from './routes/people.$id.rx?rx-page'",
    "import { Route as AboutRouteImport } from './routes/about'",
    "import { Route as PlainRouteImport } from './routes/plain'",
    "const rootRouteImport = createRootRoute({ component: rootRouteComponent })",
    "const IndexRouteImport = createFileRoute('/')({\n  component: IndexRouteComponent,\n})",
    "const PeopleIdRouteImport = createFileRoute('/people/$id')({\n  component: PeopleIdRouteComponent,\n})",
    "const IndexRoute = IndexRouteImport.update({\n  id: '/',\n  path: '/',\n  getParentRoute: () => rootRouteImport,\n} as any)",
    `const PeopleIdRoute = PeopleIdRouteImport.update({\n  id: '/people/$id',\n  path: '/people/$id',\n  getParentRoute: () => ${extra ? "AboutRoute" : "rootRouteImport"},\n} as any)`,
    "const AboutRoute = AboutRouteImport.update({\n  id: '/about',\n  path: '/about',\n  getParentRoute: () => rootRouteImport,\n} as any)",
    "const PlainRoute = PlainRouteImport.update({\n  id: '/plain',\n  path: '/plain',\n  getParentRoute: () => rootRouteImport,\n} as any)", "",
  ].join("\n");
  w("routeTree.gen.ts", tree(false));
  const declare = (...a) => spawnSync(process.execPath, [path.join(__dirname, "../bin/declare.js"), ...a], { cwd: app, encoding: "utf8" });
  const rh = declare("--host", "--routes", "src/routeTree.gen.ts", "src/main.rx", "--out", "src/host.d.rx");
  const text = rh.status === 0 ? fs.readFileSync(path.join(app, "src/host.d.rx"), "utf8") : rh.stderr;
  const rows = text.split("\n").filter(l => l && !l.startsWith("//"));
  check("rx-declare --host --routes records where the declaration comes from, on its first line", text.startsWith("//@ routes ./routeTree.gen.ts ./main.rx\n"), text);
  check("...imports each route's component — a route file's default component, two of one name told apart; the component a TSX route file hands its route — and the app's component that renders the routes (the one from the module that imports the tree)", JSON.stringify(rows.slice(0, 6)) === JSON.stringify(["import { App } from \"./main.rx\"", "import { Root } from \"./routes/__root.rx\"", "import { Page } from \"./routes/index.rx\"", "import { Page as Page2 } from \"./routes/people.$id.rx\"", "import { About } from \"./pages/about.rx\"", "import { AppRouter } from \"./router.tsx\""]), text);
  check("...and writes the view as the tree nests it, the entry around it; a route with no .rx component is left out; a context the entry's router component provides is not the view's to provide", rows[6] === "export default component nests(children in component) = [{ component: App, children: [{ component: Root, children: [{ component: Page }, { component: Page2 }, { component: About }] }] }]" && rows.length === 7, text);
  const read = require("../src/rxc").rows(path.join(app, "src/host.d.rx"));
  check("...which the crate reads as a host declaration (the pragma is a comment to it)", !read.error && read.rows.some(r => r.kind === "host"), JSON.stringify(read).slice(0, 300));
  check("rx-declare --host --check: in step with the tree", declare("--host", "--check", "src/host.d.rx").status === 0);
  w("routeTree.gen.ts", tree(true));   // the router nests a page elsewhere
  const stale = declare("--host", "--check", "src/host.d.rx");
  check("...and refused once the tree has moved, saying which route and where (HOST_VIEW_STALE)", stale.status === 1 && /HOST_VIEW_STALE/.test(stale.stderr) && /Page2 is among About's children in \.\/routeTree\.gen\.ts, and among Root's in the view/.test(stale.stderr), stale.stderr);
  const H = require("../src/host-routes.js");
  check("...drift() says the same to rx-tsc, rx-verify and the build", H.drift(path.join(app, "src/host.d.rx")).stale === true && H.hostFor(path.join(app, "src/routes/index.rx")) === path.join(app, "src/host.d.rx"));
  const sync = declare("--host", "--sync", "src/host.d.rx");
  check("rx-declare --host --sync writes it again from the tree", sync.status === 0 && /\{ component: About, children: \[\{ component: Page2 \}\] \}/.test(fs.readFileSync(path.join(app, "src/host.d.rx"), "utf8")) && declare("--host", "--check", "src/host.d.rx").status === 0, sync.stderr);
  // no entry named: the routes' own imports say what the host must provide
  const bare = declare("--host", "--routes", "src/routeTree.gen.ts");
  check("with no entry, the view provides what the routes' imports are declared to use", /export context router from "\.\/src\/router\.tsx"\nexport default component provides\(router\) nests/.test(bare.stdout), bare.stdout + bare.stderr);
  // a tree in JSON, for a host no reader is written for
  w("routes.json", JSON.stringify([{ file: "./routes/__root.rx", path: "/", children: [{ file: "./pages/about.rx", component: "Team", path: "/team" }] }]));
  const js = declare("--host", "--routes", "src/routes.json");
  check("a JSON tree names each file, and a component other than the default by name", /import \{ Team \} from "\.\/src\/pages\/about\.rx"/.test(js.stdout) && /\[\{ component: Root, children: \[\{ component: Team \}\] \}\]/.test(js.stdout), js.stdout + js.stderr);
  // MO-14f (2026-11-25): the host's own components reached through `.rx` components of the app's — the entry applies
  // <Shell />, which applies the router's component; the root applies <Frame />, which applies the router's outlet
  {
    const was = Object.fromEntries(["main.rx", "routes/__root.rx", "routeTree.gen.ts"].map(f => [f, fs.readFileSync(path.join(app, "src", f), "utf8")]));
    w("routeTree.gen.ts", tree(false).replace("from '@tanstack/solid-router'", "from '@tanstack/solid-router'"));
    w("shell.rx", "import { AppRouter } from \"./router.tsx\"\nexport component Shell() {\n  <main><AppRouter /></main>\n}\n");
    w("frame.rx", "import { Outlet } from \"@tanstack/solid-router\"\nexport component Frame() {\n  <main><Outlet /></main>\n}\n");
    w("main.rx", "import { Shell } from \"./shell.rx\"\nexport default component App() {\n  <Shell />\n}\n");
    w("routes/__root.rx", "import { Frame } from \"../frame.rx\"\nexport default component Root() {\n  <Frame />\n}\n");
    const far = declare("--host", "--routes", "src/routeTree.gen.ts", "src/main.rx");
    check("a component of the host's own applied by an `.rx` component in between is found: the entry's router component through <Shell />, the root's outlet through <Frame />", /import \{ AppRouter \} from "\.\/src\/router\.tsx"\nimport \{ Outlet \} from "@tanstack\/solid-router"/.test(far.stdout) && /\[\{ component: App, children: \[\{ component: Root, children:/.test(far.stdout), far.stdout + far.stderr);
    for (const [f, text] of Object.entries(was)) w(f, text);
  }
  // a routes directory is filesystem-routing's convention: a Vite config that gives the plugin another is not answered
  // with the default tree (the router's own module is the source then; bench/tasks/file-routes runs one)
  fs.writeFileSync(path.join(app, "package.json"), "{}");
  const cfg = opts => fs.writeFileSync(path.join(app, "vite.config.ts"), `import { fileRoutes } from "filesystem-routing/vite";\nexport default { plugins: [fileRoutes({ extensions: ["rx"], ${opts} })] };\n`);
  cfg("toPath: file => file.endsWith(\".page\") ? file.slice(0, -5) : undefined");
  const own = declare("--host", "--routes", "src/routes");
  check("a routes directory under a Vite config with a `toPath` of its own is refused, with the source to name instead (the router's module)", own.status === 1 && /vite\.config\.ts gives filesystem-routing `toPath` of its own/.test(own.stderr) && /fileRoutes\(\{ router \}\)/.test(own.stderr), own.stdout + own.stderr);
  cfg("toRoute: (src, router) => ({ path: router.toPath(src), page: true })");
  const dflt = declare("--host", "--routes", "src/routes");
  check("...and not where the config only calls the router's own toPath (the convention is the package's: the directory is scanned with it)", !/of its own/.test(dflt.stderr) && /filesystem-routing, which did not run/.test(dflt.stderr), dflt.stdout + dflt.stderr);
  fs.rmSync(path.join(app, "vite.config.ts"));
  w("hand.d.rx", "import { Root } from \"./routes/__root.rx\"\nexport default component nests(children in component) = [{ component: Root }]\n");
  check("a declaration that names no routes is written by hand: not derived, never stale", H.drift(path.join(app, "src/hand.d.rx")) === null);
}
// MO-8k: `--only`, the rows an app keeps — those exports', the contexts their words name, the types they name
{
  const app = path.join(ws, "ownapp"), kit = path.join(app, "node_modules/kit"); fs.rmSync(app, { recursive: true, force: true }); fs.mkdirSync(kit, { recursive: true });
  fs.writeFileSync(path.join(kit, "package.json"), JSON.stringify({ name: "kit", version: "1.0.0", type: "module", main: "index.js", types: "index.d.ts" }));
  fs.writeFileSync(path.join(kit, "index.js"), "export const useThing = () => 1;\nexport const other = () => 2;\n");
  fs.writeFileSync(path.join(kit, "index.d.ts"), "export declare function useThing(): number;\nexport declare function other(): number;\n");
  const all = spawnSync(process.execPath, [path.join(__dirname, "../bin/declare.js"), "kit"], { cwd: app, encoding: "utf8" });
  const some = spawnSync(process.execPath, [path.join(__dirname, "../bin/declare.js"), "kit", "--only", "useThing,Nope"], { cwd: app, encoding: "utf8" });
  const rows = t => t.split("\n").filter(l => /^export /.test(l)).map(l => /^export\s+(?:pure\s+)?(?:fn|component|type|context|const)\s+([\w$.]+)/.exec(l)?.[1]);
  check("--only keeps the rows of the exports named, with their TODOs, and nothing else of the module", JSON.stringify(rows(some.stdout)) === JSON.stringify(["useThing"]) && rows(all.stdout).length === 2 && /TODO useThing:/.test(some.stdout) && !/TODO Provider:/.test(some.stdout), some.stdout);
  check("...and says which name is no export", /--only Nope: kit has no such export/.test(some.stderr), some.stderr);
}
// MO-11u, MO-11c (2026-11-24): what a library is given to render. A parameter that is a component is a `Component<P>`,
// one that is a view or a function giving one is that (not an accessor: the call is a call), and each gets the question
// types cannot answer — where the library renders it. A prop that holds components in a record or a list is written so
// that the checker reads them, with its component fields alone after a type the library names.
fs.writeFileSync(path.join(ws, "kit.js"), "export const show = () => 1;\nexport const toast = () => 1;\nexport const createPage = o => o;\nexport const Toaster = () => null;\nexport const Markdown = () => null;\nexport const Tabs = () => null;\n");
fs.writeFileSync(path.join(ws, "kit.d.ts"), [
  "import type { JSX } from \"@solidjs/web\";",
  "type C<P = {}> = (props: P) => JSX.Element;",
  "export interface Builtins { Heading?: C<{ depth: number }>; Paragraph?: C; Break?: () => JSX.Element; title?: string }",
  "export interface MarkdownProps { builtins: Builtins; components?: Record<string, C<any>>; children: string }",
  "export declare function show(toast: C<{ toastId: number }>, ms?: number): number;",
  "export declare function toast(message: (() => JSX.Element) | JSX.Element): number;",
  "export declare function createPage(options: { path: string; component?: C }): { path: string };",
  "export declare function Toaster(props: {}): JSX.Element;",
  "export declare function Markdown(props: MarkdownProps): JSX.Element;",
  "export declare function Tabs(props: { panels: C[]; labels: string[] }): JSX.Element;",
  "",
].join("\n"));
{
  const rk = spawnSync(process.execPath, [path.join(__dirname, "../bin/declare.js"), "./kit.js"], { cwd: ws, encoding: "utf8" });
  const kit = rk.stdout; const hasKit = line => kit.split("\n").includes(line);
  if (process.env.VERBOSE) console.log(kit);
  check("a parameter that is a component is written `Component<P>` (MO-11c)", hasKit("export fn show(toast: Component<{ toastId: number; }>, ms?: number): number"), kit);
  check("…and the draft asks where the library renders it (MO-11u)", /\/\/ TODO show: `toast`: a component given there is checked under a root of its own\. `renders\(<Component>\)`/.test(kit), kit);
  check("a view, or a function of nothing giving one, is no accessor: the fn is called, not instantiated", hasKit("export fn toast(message: View | (() => View)): number") && /\/\/ TODO toast: `message`: a component given there/.test(kit), kit);
  check("a component in a record a fn takes is asked about too", /\/\/ TODO createPage: `options`: a component given there/.test(kit), kit);
  check("a prop that holds components in a record is written with its component fields, after the type the library names", hasKit("export component Markdown(props: MarkdownProps & { builtins: { Heading?: Component; Paragraph?: Component }; components?: Record<string, Component> })"), kit);
  check("…and a list of components, in a record the row writes whole", hasKit("export component Tabs(props: { panels: Component[]; labels: string[] })"), kit);
  fs.writeFileSync(path.join(ws, "kit.d.rx"), kit.replace("export fn show(toast: Component<{ toastId: number; }>, ms?: number): number", "export fn show(toast: Component<{ toastId: number; }>, ms?: number): number renders(Toaster)"));
  fs.writeFileSync(path.join(ws, "kit.rx"), [
    "import { show, toast, Toaster, Markdown, Tabs } from \"./kit.js\"",
    "component Saved(props: { toastId: number }) {",
    "  <b>saved {props.toastId}</b>",
    "}",
    "component Plain() {",
    "  <i>plain</i>",
    "}",
    "export default component App() {",
    "  <button onClick={() => { show(Saved) }}>save</button>",
    "  <button onClick={() => { toast(Plain) }}>note</button>",
    "  <Markdown builtins={{ Paragraph: Plain }}>{\"text\"}</Markdown>",
    "  <Tabs panels={[Plain]} labels={[\"one\"]} />",
    "  <Toaster />",
    "}",
    "",
  ].join("\n"));
  fs.writeFileSync(path.join(ws, "tsconfig.kit.json"), JSON.stringify({ extends: "./tsconfig.json", include: ["kit.rx"] }));
  const tk = spawnSync(process.execPath, [path.join(__dirname, "../bin/tsc.js"), "-p", "tsconfig.kit.json"], { cwd: ws, encoding: "utf8" });
  check("rx-tsc holds the draft, with `renders(Toaster)` added, against the same types — and a component that declares no props where a function of nothing is asked for (TY-3d)", tk.status === 0, tk.stdout + tk.stderr);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
