// MO-8w: `handler` on a prop that is an element's event, `uses(c)` and `provides(c)` in a draft, with the context rows they name;
// the audit (src/declare-audit.js): every word a declaration has, sorted into proven, contradicted and unproven; and rx-verify,
// which tells the words the code proves from the ones written by hand without a mark in the file.
//   node test/words-audit.js            VERBOSE=1 prints the drafts
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const repo = path.resolve(__dirname, "../../..");
const ws = path.join(__dirname, "../.test/words-audit");
fs.rmSync(ws, { recursive: true, force: true });
fs.mkdirSync(path.join(ws, "node_modules/kit"), { recursive: true });
for (const d of fs.readdirSync(path.join(repo, "ref/node_modules"))) if (!d.startsWith(".")) fs.symlinkSync(path.join(repo, "ref/node_modules", d), path.join(ws, "node_modules", d), "dir");
fs.writeFileSync(path.join(ws, "package.json"), JSON.stringify({ type: "module" }));
fs.writeFileSync(path.join(ws, "node_modules/kit/package.json"), JSON.stringify({ name: "kit", version: "1.0.0", type: "module", exports: { ".": { types: "./index.d.ts", default: "./index.js" }, "./cjs": { types: "./index.d.ts", default: "./index.cjs" } } }));
fs.writeFileSync(path.join(ws, "node_modules/kit/index.js"), "export const mystery = x => x.unknown();\n");
fs.writeFileSync(path.join(ws, "node_modules/kit/index.cjs"), "exports.mystery = x => x;\n");
fs.writeFileSync(path.join(ws, "node_modules/kit/index.d.ts"), "export declare function mystery(x: any): any;\n");
let pass = 0, fail = 0;
const ok = (name, cond, detail) => { if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}${detail !== undefined ? `\n      ${String(detail).slice(0, 900)}` : ""}`); } };
const SOLID = "import { createContext, useContext, createComponent, createMemo, createSignal } from \"solid-js\";\nimport { mystery } from \"kit\";\n";

// ---- the draft ----
console.log("rx-declare writes the words into the rows, with the context rows they name, and says which it read in one line");
fs.writeFileSync(path.join(ws, "tabs.jsx"), SOLID + [
  "const TabsContext = createContext();",
  "const Loose = createContext();",
  "export function Tabs(props) { const [tab, setTab] = createSignal(props.initial); return <TabsContext value={{ tab, setTab }}><div class=\"tabs\">{props.children}</div></TabsContext>; }",
  "export function Tab(props) { const tabs = useContext(TabsContext); return <button onClick={props.onSelect}>{props.children}</button>; }",
  "export function useTabs() { const c = useContext(TabsContext); return c; }",
  "export function useLoose() { return useContext(Loose); }",
  "export function useNothing() { return 1; }",
  "export function useSometimes(strict) { return strict ? useContext(TabsContext) : undefined; }",
  "export function Sidebar(props) { return <><TabsContext value={{}}><nav>fixed</nav></TabsContext>{props.children}</>; }",
  "export function Plain(props) { return <section>{props.children}</section>; }",
  "export const PlainProvider = props => <section>{props.children}</section>;",
].join("\n") + "\n");
fs.writeFileSync(path.join(ws, "tabs.d.ts"), [
  "import type { JSX } from \"@solidjs/web\";",
  "export declare function Tabs(props: { initial: string; children?: JSX.Element }): JSX.Element;",
  "export declare function Tab(props: { onSelect?: (e: MouseEvent) => void; children?: JSX.Element }): JSX.Element;",
  "export declare function useTabs(): number;",
  "export declare function useLoose(): number;",
  "export declare function useNothing(): number;",
  "export declare function useSometimes(strict?: boolean): unknown;",
  "export declare function Sidebar(props: { children?: JSX.Element }): JSX.Element;",
  "export declare function Plain(props: { children?: JSX.Element }): JSX.Element;",
  "export declare const PlainProvider: (props: { children?: JSX.Element }) => JSX.Element;",
  "",
].join("\n"));
const declare = (...a) => spawnSync(process.execPath, [path.join(__dirname, "../bin/declare.js"), ...a], { cwd: ws, encoding: "utf8", env: { ...process.env, RX_DECLARE_INFER: "" } });
const r = declare("./tabs.jsx", "--out", "tabs.d.rx", "--why", "--causes", "tabs.causes.json");
const draft = fs.existsSync(path.join(ws, "tabs.d.rx")) ? fs.readFileSync(path.join(ws, "tabs.d.rx"), "utf8") : "";
if (process.env.VERBOSE) console.log(draft, r.stderr);
const rowOf = n => draft.split("\n").find(l => new RegExp(`^export (?:pure )?(?:fn|component) ${n}\\b`).test(l)) ?? "";
ok("the context a row names is declared, by the name the code binds it to", /^export context tabs$/m.test(draft), draft);
ok("a provider around its children: provides(tabs)", /^export component Tabs\(props: \{ initial: string; children\?: .* \}\) provides\(tabs\)$/.test(rowOf("Tabs")), rowOf("Tabs"));
ok("a part that reads it on every path, and whose prop is an element's event: uses(tabs), handler", /^export component Tab\(props: \{ onSelect\?: handler \(e: MouseEvent\) => void; children\?: .* \}\) uses\(tabs\)$/.test(rowOf("Tab")), rowOf("Tab"));
ok("a hook that reads it: uses(tabs), and its question is not asked", /^export fn useTabs\(\): .* uses\(tabs\)$/.test(rowOf("useTabs")) && !/TODO useTabs: .*uses/.test(draft), rowOf("useTabs"));
ok("a hook that reads a context no row provides: no word — it would refuse every program — and one question, by what the code shows", !/uses\(/.test(rowOf("useLoose")) && /TODO useLoose: useLoose reads Loose, and a call with no provider above it is accepted\. `uses\(<context>\)`.*no component here is shown to provide it \(tabs\.jsx:\d+\)/.test(draft) && /useLoose: uses not proven — it reads Loose on every path/.test(r.stderr), rowOf("useLoose") + r.stderr + draft);
ok("a hook that reads none: no word, and no question", !/uses\(/.test(rowOf("useNothing")) && !/TODO useNothing: .*uses/.test(draft), rowOf("useNothing"));
ok("a hook that reads one on a path only: no word, and no question — the word says every call", !/uses\(/.test(rowOf("useSometimes")) && !/TODO useSometimes: .*uses\(/.test(draft), rowOf("useSometimes"));
ok("a provider around something other than its children: no provides", /^export component Sidebar\(/.test(rowOf("Sidebar")) && !/provides\(/.test(rowOf("Sidebar")), rowOf("Sidebar"));
ok("a component named …Provider that renders none: the question is answered, no", !/TODO PlainProvider/.test(draft) && !/provides\(/.test(rowOf("PlainProvider")), draft);
ok("the draft says once which words it read, and no row has a line above it", /^\/\/ Read from the code that runs \(MO-8v\): .*2 uses, 1 provides/m.test(draft) && !/\/\/@ inferred/.test(draft), draft.split("\n")[1]);
{
  const said = JSON.parse(fs.readFileSync(path.join(ws, "tabs.causes.json"), "utf8")).inferred ?? {};
  ok("--causes says which, export by export (what the benchmark counts)", JSON.stringify(said.Tabs) === JSON.stringify(["provides(tabs)"]) && JSON.stringify(said.Tab) === JSON.stringify(["handler(onSelect)", "uses(tabs)"]), JSON.stringify(said));
  ok("--why says each: proven with what shows it, refused with the first thing in the way", /Tabs: provides\(tabs\) proven — everything it is given that may be a view/.test(r.stderr) && /Sidebar: provides not proven — what it answers is no provider of a value that is shown to be one, whose children are read \[tabs\.jsx:\d+\]/.test(r.stderr), r.stderr);
}

// ---- a component a fn is given: rendered where the fn is called, or kept for a component of the library's ----
console.log("a fn given a component: where it is called while the fn runs the question is answered; kept for later, or rendered outside the host too, it stays");
fs.writeFileSync(path.join(ws, "shows.jsx"), SOLID + [
  "const kept = [];",
  "export function resolveNow(view) { const shown = createMemo(() => view()); return () => [shown()].flat().length; }",
  "export function showLater(view) { kept.push(view); return kept.length; }",
  "export function showBoth(view) { kept.push(view); return view(); }",
  "export function Host() { return <ul>{kept.map(v => <li>{v()}</li>)}</ul>; }",
  "export function history() { return kept; }",
].join("\n") + "\n");
fs.writeFileSync(path.join(ws, "shows.d.ts"), [
  "import type { JSX } from \"@solidjs/web\";",
  "export declare function resolveNow(view: () => JSX.Element): () => number;",
  "export declare function showLater(view: () => JSX.Element): number;",
  "export declare function showBoth(view: () => JSX.Element): JSX.Element;",
  "export declare function Host(): JSX.Element;",
  "export declare function history(): (() => JSX.Element)[];",
  "",
].join("\n"));
{
  const d = declare("./shows.jsx", "--why");
  ok("a component called in a computation the fn makes: rendered where the fn is called — no word, and no question", !/TODO resolveNow: `view`/.test(d.stdout), d.stdout + d.stderr);
  ok("a component kept in the module's state for a host to render: no `renders(Host)` is written — another export hands the same list out — and the question stays", /TODO showLater: `view`: a component given there/.test(d.stdout) && !/renders\(/.test(d.stdout.replace(/\/\/.*$/gm, "")), d.stdout);
  ok("a component rendered outside the host too (kept, and called where the fn runs): the question stays", /TODO showBoth: `view`: a component given there/.test(d.stdout), d.stdout);
}

// ---- the audit ----
console.log("rx-declare --audit: every word a declaration has, proven, contradicted or neither");
fs.writeFileSync(path.join(ws, "lib.js"), [
  "import { createMemo, createContext, useContext, createComponent } from \"solid-js\";",
  "import { mystery } from \"kit\";",
  "export class NotFound extends Error {}", "export class Stale extends Error {}",
  "const access = v => typeof v === \"function\" ? v() : v;",
  "export function sortedCopy(list) { return createMemo(() => access(list).slice().sort()); }",
  "export function sortedInPlace(list, options) { if (options?.dirty) return createMemo(() => { const arr = access(list); arr.sort(); return arr; }); return createMemo(() => access(list).slice().sort()); }",
  "export function loads(id) { return mystery(id); }",
  "export function onLater(el, cb) { setTimeout(cb); }",
  "export function onNow(el, cb) { cb(); setTimeout(cb); }",
  "export function onUnknown(el, cb) { mystery(cb); }",
  "export function moves(list, a, b) { const [x] = list.splice(a, 1); list.splice(b, 0, x); }",
  "export function reads(list) { let n = 0; for (const x of list) n += x; console.log(n); }",
  "export async function finds(id) { if (!id) throw new NotFound(); return id; }",
  "export async function findsOther(id) { if (!id) throw new Stale(); return id; }",
  "const Ctx = createContext();",
  "export function useIt() { return useContext(Ctx); }",
  "export function useNone() { return 1; }",
  "export function Gives(props) { return createComponent(Ctx, { value: 1, get children() { return props.children; } }); }",
  "export function GivesBeside(props) { return [createComponent(Ctx, { value: 1, get children() { return null; } }), props.children]; }",
  "export function GivesAFunction(props) { const root = props.children; return createComponent(Ctx, { value: 1, get children() { return root(1); } }); }",
  "export function patches(ws) { const close = ws.close.bind(ws); ws.close = () => { close(); }; return 1; }",
  "let SCOPE;", "export function withScope(v, run) { const was = SCOPE; SCOPE = v; try { return run(); } finally { SCOPE = was; } }",
  "export function useOwnScope() { if (SCOPE === undefined) throw new Error(\"no scope\"); return SCOPE; }",
  "",
].join("\n"));
fs.writeFileSync(path.join(ws, "lib.d.ts"), [
  "import type { JSX } from \"@solidjs/web\";",
  "export declare class NotFound extends Error {}", "export declare class Stale extends Error {}",
  "export declare function sortedCopy(list: () => number[]): () => number[];",
  "export declare function sortedInPlace(list: () => number[], options?: { dirty?: boolean }): () => number[];",
  "export declare function loads(id: string): unknown;",
  "export declare function onLater(el: EventTarget, cb: () => void): void;",
  "export declare function onNow(el: EventTarget, cb: () => void): void;",
  "export declare function onUnknown(el: EventTarget, cb: () => void): void;",
  "export declare function moves(list: number[], a: number, b: number): void;",
  "export declare function reads(list: number[]): void;",
  "export declare function finds(id: string): Promise<string>;",
  "export declare function findsOther(id: string): Promise<string>;",
  "export declare function useIt(): number;", "export declare function useNone(): number;",
  "export declare function Gives(props: { children?: JSX.Element }): JSX.Element;",
  "export declare function GivesBeside(props: { children?: JSX.Element }): JSX.Element;",
  "export declare function GivesAFunction(props: { children: (n: number) => JSX.Element }): JSX.Element;",
  "export declare function patches(ws: WebSocket): number;",
  "export declare function withScope<T>(v: number, run: () => T): T;",
  "export declare function useOwnScope(): number;",
  "",
].join("\n"));
fs.writeFileSync(path.join(ws, "lib.d.rx"), [
  "export error NotFound", "export error Stale", "export context it",
  "export pure fn sortedCopy(ref list: number[]): ref number[]",
  "export pure fn sortedInPlace(ref list: number[], options?: { dirty?: boolean }): ref number[]",
  "export pure fn loads(id: string): unknown",
  "export fn onLater(el: EventTarget, cb: handler () => void): void",
  "export fn onNow(el: EventTarget, cb: handler () => void): void",
  "export fn onUnknown(el: EventTarget, cb: handler () => void): void",
  "export fn moves(draft list: number[], a: number, b: number): void",
  "export fn reads(draft list: number[]): void",
  "export pure fn finds(id: string): Promise<string> rejects(NotFound)",
  "export pure fn findsOther(id: string): Promise<string> rejects(NotFound)",
  "export pure fn useIt(): number uses(it)",
  "export pure fn useNone(): number uses(it)",
  "export component Gives(props: { children?: View }) provides(it)",
  "export component GivesBeside(props: { children?: View }) provides(it)",
  "export component GivesAFunction(props: { children: (n: number) => View }) provides(it)",
  "export pure fn patches(ws: WebSocket): number",
  "export context scope",
  "export fn useOwnScope(): number uses(scope)",
  "",
].join("\n"));
{
  const a = declare("--audit", "--json", "lib.d.rx");
  let rows = []; try { rows = JSON.parse(a.stdout)[0].rows; } catch { /* below */ }
  const v = (name, word) => { const w = rows.find(x => x.name === name)?.words.find(x => x.word === word); return w ? `${w.verdict}: ${w.why}` : `no such word (${a.stdout.slice(0, 200)}${a.stderr.slice(0, 300)})`; };
  const is = (name, word, verdict, says) => ok(`${name}: ${word} is ${verdict}`, v(name, word).startsWith(`${verdict}:`) && (!says || says.test(v(name, word))), v(name, word));
  is("sortedCopy", "pure", "proven");
  is("sortedInPlace", "pure", "unproven", /it may change in place a list that is not its own \(\.sort\(\)\) \[lib\.js:7\]/);
  is("loads", "pure", "unproven", /it calls \.unknown\(\)/);
  is("onLater", "handler(cb)", "proven");
  is("onNow", "handler(cb)", "unproven", /called while the call runs/);
  is("onUnknown", "handler(cb)", "unproven", /not followed/);
  is("moves", "draft(list)", "unproven", /is not read/);
  is("reads", "draft(list)", "unproven");
  is("finds", "rejects(NotFound)", "unproven", /what it throws is not read/);
  is("findsOther", "rejects(NotFound)", "unproven", /what it throws is not read/);
  is("useIt", "uses(it)", "proven");
  is("useNone", "uses(it)", "unproven", /no context is shown/);
  is("Gives", "provides(it)", "proven");
  is("GivesBeside", "provides(it)", "unproven", /no provider of a value that is shown to be one, whose children are read/);
  is("GivesAFunction", "provides(it)", "unproven");
  is("patches", "pure", "unproven", /an argument that is no data/);
  is("useOwnScope", "uses(scope)", "unproven", /no context is shown/);
  ok("rx-declare --audit answers: what it does not prove is unproven, not false", a.status === 0, String(a.status));
  const text = declare("--audit", "lib.d.rx").stdout;
  ok("…and lists what is not proven, with what to check", /lib\.d\.rx:5: sortedInPlace: pure unproven — it may change/.test(text) && /lib\.d\.rx:6: loads: pure unproven — it calls \.unknown\(\)/.test(text) && /lib\.d\.rx: 5 words read from the code, 16 it does not show/.test(text), text);
}

// ---- rx-verify ----
console.log("rx-verify tells the words the code proves from the ones written by hand, and runs each");
{
  fs.writeFileSync(path.join(ws, "lib.probe.mjs"), "let last;\nexport const probes = { sortedCopy: { args: () => [() => [3, 1, 2]] }, sortedInPlace: { args: () => { const list = [3, 1, 2]; return [() => list, { dirty: true }]; } }, onNow: { args: () => [new EventTarget(), () => {}] }, onLater: { args: () => [(last = new EventTarget()), () => {}], act: () => last.dispatchEvent(new Event(\"x\")) }, finds: { args: () => [\"1\"], fail: () => [\"\"] } };\n");
  const v = spawnSync(process.execPath, ["--conditions=browser", path.join(__dirname, "../bin/verify.js"), "lib.d.rx"], { cwd: ws, encoding: "utf8" });
  const said = v.stdout + v.stderr; if (process.env.VERBOSE) console.log(said);
  ok("a word that is false is a mismatch where the probe runs it", /MISMATCH\s+sortedInPlace: declared pure, but when it is called it changes what it is given \(\[3,1,2\] to \[1,2,3\]\)/.test(said) && /MISMATCH\s+onNow: /.test(said) && v.status === 1, said.slice(0, 1500));
  ok("a `pure` the code proves is run against what the reading claims, with no mark in the file", /sortedCopy: pure is read from the code \(its own code only computes[^)]*\), and no run contradicts it/.test(said), said.split("\n").filter(l => /sortedCopy/.test(l)).join("\n"));
  ok("…a `handler` and a `rejects(E)` too", /onLater: callback cb holds/.test(said) && /finds: under the probe's failing arguments it rejects with NotFound, as its row says/.test(said), said.split("\n").filter(l => /onLater|finds:/.test(l)).join("\n"));
  ok("…and the file's words are counted", /words: 5 read from the code .* 16 it does not show/.test(said), said.split("\n").filter(l => /words:/.test(l)).join("\n"));
  // (a module that ships JSX is run compiled, by the project's Solid compiler — a native addon: where it is not built,
  // the draft is not run here, and says so)
  let compiles = false; try { compiles = typeof require(require.resolve("@solidjs/compiler", { paths: [ws] })).transform("const a = <p>x</p>;", { filename: "a.jsx" }).code === "string"; } catch { compiles = false; }
  const draftRun = compiles ? spawnSync(process.execPath, ["--conditions=browser", path.join(__dirname, "../bin/verify.js"), "tabs.d.rx"], { cwd: ws, encoding: "utf8" }) : { stdout: "" };
  if (!compiles) { pass++; console.log("  ✓ (the draft of a JSX module is not run here: @solidjs/compiler is not built in this checkout)"); }
  else ok("the draft of a module, run: no word it read is contradicted (its components need a page to mount: --dom)", !/MISMATCH.*read from/.test(draftRun.stdout) && /useTabs: uses\(tabs\) (holds: with no provider it fails|is read from the code)/.test(draftRun.stdout) && /words: \d+ read from the code/.test(draftRun.stdout.replace(/\([^)]*\)/g, "")), draftRun.stdout + draftRun.stderr);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
