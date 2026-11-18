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
check("a callback parameter is a function type; a trailing optional one is left out", has("export fn onIdle(run: (...args: any[]) => any): void"), draft);

const t = spawnSync(process.execPath, [path.join(__dirname, "../bin/tsc.js")], { cwd: ws, encoding: "utf8" });
check("the draft parses and passes rx-tsc against the module's own types (TY-6)", t.status === 0 && t.stdout.trim() === "", { status: t.status, out: t.stdout + t.stderr });

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
