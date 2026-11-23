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
  check("a fn with several signatures has one row, the shortest, and the draft says how many the library has (MO-8b)", wide.includes("export fn on(target: Window, cb: (e: Event) => void): () => void") && !wide.includes("export fn on(target: Document") && /\/\/ TODO on: 2 signatures in the library's types/.test(wide), rw.stdout);
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
check("--source: a callback called inside createMemo, through the library's own helper, is said to need no word (pure, MO-10g)", note("derive", /`pick`: called inside createMemo, a computation — no word: a function type without `handler` is a pure function.* \(MO-10g\) \[evid\.js:5\]$/), evid);
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
  "import { createContext, useContext, createComponent, createMemo } from \"solid-js\";",
  "export const ThemeContext = createContext();",
  "export const useTheme = () => { const t = useContext(ThemeContext); if (!t) throw new Error(\"no theme\"); return t; };",
  "export const useLazy = () => ({ read: () => { const t = useContext(ThemeContext); if (!t) throw new Error(\"no theme yet\"); return t; } });",
  "export const useBroken = () => { throw new Error(\"always\"); };",
  "export const useFree = () => 1;",
  "export const useAnswer = () => createMemo(async () => 1);",
  "export const useBoth = () => ({ answer: createMemo(async () => 1), size: createMemo(() => 2) });",
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
  "export declare function useAnswer(): () => number;",
  "export declare function useBoth(): { answer: () => number; size: () => number };",
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
check("running: an accessor whose first read is not ready is drafted `pending ref`, the whole result or a field (MO-10l)", /export (pure )?fn useAnswer\(\): pending ref number/.test(ran) && /export (pure )?fn useBoth\(\): \{ answer: pending ref number; size: ref number \}/.test(ran), ran);
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

// a draft the crate cannot read is an error, with the line and the parser's reason — not `any` for every row and nothing
// said (a `readonly` prop the parser refused did that to a whole library)
{
  const { failing } = require("../src/declare-check.js");
  let thrown; try { failing(require("typescript"), "export pure fn ok(): number\nexport component Broken(props: { a b })\n", 0, ["export pure fn ok(): number", "export component Broken(props: { a b })"], "./more.js", ws, {}, undefined); } catch (e) { thrown = e; }
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
  check("…and the draft asks where the library renders it (MO-11u)", /\/\/ TODO show: `toast` is given a component: where does the library render it\? If beneath a component this module exports, name that component, `renders\(<Component>\)`/.test(kit), kit);
  check("a view, or a function of nothing giving one, is no accessor: the fn is called, not instantiated", hasKit("export fn toast(message: View | (() => View)): number") && /\/\/ TODO toast: `message` is given a component/.test(kit), kit);
  check("a component in a record a fn takes is asked about too", /\/\/ TODO createPage: `options` is given a component/.test(kit), kit);
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
