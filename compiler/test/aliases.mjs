// 09 MO-8x: a declaration file's own `export type` aliases are a shorter spelling of their bodies. Each case is a pair of
// declaration files — one whose rows name the file's aliases, one whose rows write every alias out by hand — and programs
// that use them. Both checkers must say the same of a program whichever file declares its module (every diagnostic: code,
// message, place), say it of each other (CP-5), and read the same rows from the two files (the crate's `rows`, the facts a
// row's words and parts come to, every row but the aliases themselves). And a file whose aliases cannot be followed — a
// cycle, a word in an alias's body, a wrong number of type arguments — is refused by both, with one message.
// Needs the crate's build (rxc).   node --experimental-strip-types compiler/test/aliases.mjs
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, existsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { loadModules } from "../../ref/src/modules.ts";
import { checkModules } from "../../ref/src/check.ts";
import { parseDeclarations } from "../../ref/src/parse.ts";

const here = path.dirname(fileURLToPath(import.meta.url)), root = path.resolve(here, "../..");
const rxc = path.join(root, `compiler/target/${process.env.RX_PROFILE ?? "release"}/rxc`);
const tmp = mkdtempSync(path.join(tmpdir(), "rx-aliases-"));
let fail = 0, ran = 0; const bad = (what, why) => { fail++; console.log(`✗ ${what}: ${why}`); };
const read = p => existsSync(p) ? readFileSync(p, "utf8") : undefined;

/** What the crate says of a program: each diagnostic as `code line:col message`, the file's folder taken out. */
function crate(file, dir) {
  const r = spawnSync(rxc, ["check", "--json", file], { encoding: "utf8" });
  try { return JSON.parse(r.stdout).diagnostics.map(d => `${d.code} ${d.line} ${d.message}`.replaceAll(dir, "<dir>")); } catch { return [`crate: ${r.stdout}${r.stderr}`.replaceAll(dir, "<dir>")]; }
}
function ref(file, dir) {
  try { return checkModules(loadModules(file, read)).diags.map(d => `${d.code} ${d.line} ${d.msg}`.replaceAll(dir, "<dir>")); } catch (e) { return [`${e.code ?? "PARSE"} ${/^\S+: line (\d+)/.exec(e.message)?.[1]} ${e.message.replace(/^\S+: line \d+: /, "")}`.replaceAll(dir, "<dir>")]; }
}
/** The rows the crate reads from a declaration file, the aliases' own left out (`rows`: each row's facts). */
function rows(file) {
  const r = spawnSync(rxc, ["serve"], { input: JSON.stringify({ id: 1, method: "rows", params: { file } }) + "\n", encoding: "utf8" });
  const out = JSON.parse(r.stdout.split("\n")[0]).result;
  return JSON.stringify(out.rows?.filter(x => x.kind !== "type").map(({ line, end, ...x }) => x) ?? out);
}
const refRows = file => { try { return JSON.stringify(parseDeclarations(readFileSync(file, "utf8")).filter(d => d.kind !== "type").map(({ line, ...d }) => d)); } catch (e) { return `throws ${e.message}`; } };

/** `named`: the rows as they name the aliases; `out`: the same rows with every alias written out by hand. Each program
 *  is checked against both; `codes`: what both checkers say of it. */
const CASES = [
  {
    name: "a generic alias (a render prop), a word through an alias, an alias of an alias",
    types: [
      "export type State = { open: boolean }",
      "export type RenderProp<S = {}> = (props: Record<string, any>, state: S) => View",
      "export type DialogRender = RenderProp<State>",
      "export type Change = (open: boolean) => void",
    ],
    named: [
      "export component Dialog(props: { render?: DialogRender; onOpenChange?: handler Change; onPick?: Change; children?: View })",
      "export component Picker(props: { children: RenderProp<{ value: string; }>; label?: RenderProp })",
      "export fn later(f: handler Change): void",
      "export fn now(f: Change): void",
    ],
    out: [
      "export component Dialog(props: { render?: (props: Record<string, any>, state: { open: boolean }) => View; onOpenChange?: handler (open: boolean) => void; onPick?: (open: boolean) => void; children?: View })",
      "export component Picker(props: { children: (props: Record<string, any>, state: { value: string; }) => View; label?: (props: Record<string, any>, state: {}) => View })",
      "export fn later(f: handler (open: boolean) => void): void",
      "export fn now(f: (open: boolean) => void): void",
    ],
    programs: [
      { src: `import { Dialog } from "./lib.js"\nsource n := 0\nexport default component App() {\n  <Dialog onOpenChange={(o) => { n := 1 }}>{view render (p, s) { <p>{s.open}</p> }}</Dialog>\n}`, codes: [] },
      { src: `import { Dialog } from "./lib.js"\nsource n := 0\nexport default component App() {\n  <Dialog onPick={(o) => { n := 2 }} />\n}`, codes: ["REACTIVE_WRITE_IN_OWNED_SCOPE"] },
      { src: `import { later } from "./lib.js"\nsource n := 0\nexport default component App() {\n  <button onClick={() => { later((o) => { n := 3 }) }}>x</button>\n}`, codes: [] },
      { src: `import { now } from "./lib.js"\nsource n := 0\nexport default component App() {\n  <button onClick={() => { now((o) => { n := 3 }) }}>x</button>\n}`, codes: null },
      { src: `import { Picker } from "./lib.js"\nexport default component App() {\n  <Picker><p>static</p></Picker>\n}`, codes: ["VIEW_FN_EXPECTED"] },
      { src: `import { Picker } from "./lib.js"\nexport default component App() {\n  <Picker>{view (p, s) { <p>{s.value}</p> }}{view label (p, s) { <b>x</b> }}</Picker>\n}`, codes: [] },
      { src: `import { Dialog } from "./lib.js"\nexport default component App() {\n  <Dialog>{view (p) { <p>x</p> }}</Dialog>\n}`, codes: ["VIEW_FN_MISPLACED"] },
    ],
  },
  {
    name: "a record alias read field by field, a union alias among a union's members, props that are an alias",
    types: [
      "export type Row = { id: number; title: string }",
      "export type Label = string | View",
      "export type BoxProps = { title: string; body?: Label | undefined; each: (row: Row) => View }",
      "export type Off = () => void",
    ],
    named: [
      "export pure fn rows(): Row[]",
      "export pure fn first(): Row",
      "export component Box(props: BoxProps)",
      "export fn listen(f: handler (e: string) => void): Off",
    ],
    out: [
      "export pure fn rows(): { id: number; title: string }[]",
      "export pure fn first(): { id: number; title: string }",
      "export component Box(props: { title: string; body?: string | View | undefined; each: (row: { id: number; title: string }) => View })",
      "export fn listen(f: handler (e: string) => void): () => void",
    ],
    programs: [
      { src: `import { rows, Box } from "./lib.js"\nexport default component App() {\n  <Box title="t" body="b">{view each (r) { <p>{r.title}</p> }}</Box>\n  <ul>{for r in rows() { <li>{r.id}</li> }}</ul>\n}`, codes: null },
      { src: `import { Box } from "./lib.js"\nexport default component App() {\n  <Box title="t"><p>static</p></Box>\n}`, codes: null },
      { src: `import { first } from "./lib.js"\nexport default component App() {\n  r = first()\n  <p>{r.title}</p>\n}`, codes: null },
      { src: `import { listen } from "./lib.js"\nsource n := 0\nexport default component App() {\n  <button onClick={() => { let off = listen((e) => { n := 1 }); off() }}>x</button>\n}`, codes: null },
    ],
  },
];
// a recursive alias (a route tree): written out once, and where it names itself inside a record, a list, a function or a
// type argument — what TypeScript defers — that reference stays its name
CASES.push({
  name: "a recursive alias",
  types: [],
  named: ["export type RouteDefinition = { path: string; load?: () => void; children?: RouteDefinition[] }", "export fn routes(r: RouteDefinition[], f: handler (r: RouteDefinition) => void): void", "export pure fn tree(): { root: RouteDefinition }"],
  out: ["export interface RouteDefinition { path: string; load?: () => void; children?: RouteDefinition[] }", "export fn routes(r: { path: string; load?: () => void; children?: RouteDefinition[] }[], f: handler (r: { path: string; load?: () => void; children?: RouteDefinition[] }) => void): void", "export pure fn tree(): { root: { path: string; load?: () => void; children?: RouteDefinition[] } }"],
  programs: [
    { src: `import { routes, tree } from "./lib.js"\nsource n := 0\nexport default component App() {\n  t = tree()\n  <button onClick={() => { routes([{ path: "/" }], (r) => { n := 1 }) }}>{t.root.path}</button>\n}`, codes: [] },
  ],
});
/** Files both checkers refuse: the message, and what it says. */
const REFUSED = [
  { name: "a cycle", file: ["export type A = B | string", "export type B = A", "export fn f(a: A): void"], says: /type A: A names itself: A → B → A/ },
  { name: "a cycle through a type argument", file: ["export type Box<T> = { v: T }", "export type Loop = Box<Loop>"], says: /Loop names itself/ },
  { name: "a word in an alias's body", file: ["export type Change = handler (open: boolean) => void", "export fn later(f: Change): void"], says: /is a row's, not an alias's/ },
  { name: "too many type arguments", file: ["export type P<S> = (s: S) => View", "export component C(props: { render: P<string, number> })"], says: /P takes 1 type argument, and is given 2/ },
  { name: "a missing type argument", file: ["export type P<S> = (s: S) => View", "export fn f(r: P): void"], says: /P is given 0 type arguments: its parameter S has no default/ },
  { name: "an alias declared twice", file: ["export type P = string", "export type P = number"], says: /type P is declared twice/ },
];

for (const [ci, c] of CASES.entries()) {
  const dirs = { named: path.join(tmp, `c${ci}-named`), out: path.join(tmp, `c${ci}-out`) };
  for (const [k, dir] of Object.entries(dirs)) { mkdirSync(dir, { recursive: true }); writeFileSync(path.join(dir, "lib.d.rx"), [...c.types, ...c[k]].join("\n") + "\n"); }
  const r1 = rows(path.join(dirs.named, "lib.d.rx")), r2 = rows(path.join(dirs.out, "lib.d.rx"));
  ran++; if (r1 !== r2) bad(`${c.name}: the crate's rows`, `\n  named: ${r1}\n  out:   ${r2}`);
  const f1 = refRows(path.join(dirs.named, "lib.d.rx")), f2 = refRows(path.join(dirs.out, "lib.d.rx"));
  ran++; if (f1 !== f2) bad(`${c.name}: ref's rows`, `\n  named: ${f1}\n  out:   ${f2}`);
  for (const [pi, p] of c.programs.entries()) {
    const what = `${c.name}, program ${pi}`; const said = {};
    for (const [k, dir] of Object.entries(dirs)) { const f = path.join(dir, `p${pi}.rx`); writeFileSync(f, p.src + "\n"); said[`crate ${k}`] = crate(f, dir); said[`ref ${k}`] = ref(f, dir); }
    const all = Object.values(said).map(x => JSON.stringify(x)); ran++;
    if (new Set(all).size !== 1) bad(what, Object.entries(said).map(([k, v]) => `\n  ${k}: ${JSON.stringify(v)}`).join(""));
    else if (p.codes && JSON.stringify(said["crate named"].map(d => d.split(" ")[0])) !== JSON.stringify(p.codes)) bad(what, `expected [${p.codes}], both say ${JSON.stringify(said["crate named"])}`);
    else if (process.env.VERBOSE) console.log(`✓ ${what}: ${JSON.stringify(said["crate named"].map(d => d.split(" ")[0]))}`);
  }
}
for (const [i, r] of REFUSED.entries()) {
  const dir = path.join(tmp, `r${i}`); mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "lib.d.rx"), r.file.join("\n") + "\n");
  const f = path.join(dir, "app.rx"); writeFileSync(f, `import { f } from "./lib.js"\nexport default component App() {\n  <p>x</p>\n}\n`);
  const a = crate(f, dir), b = ref(f, dir); ran++;
  const msg = x => x.map(s => s.replace(/^\S+ \S+ /, "")).join(" | ");
  if (!r.says.test(msg(a))) bad(r.name, `the crate says ${JSON.stringify(a)}`);
  else if (!r.says.test(msg(b))) bad(r.name, `ref says ${JSON.stringify(b)}`);
  else if (msg(a) !== msg(b) && !msg(b).includes(msg(a).replace(/^.*?: line/, "line"))) bad(r.name, `the two say it otherwise:\n  crate: ${msg(a)}\n  ref:   ${msg(b)}`);
}
console.log(fail ? `aliases: ${fail} of ${ran} failed` : `aliases: ${ran} checks, each pair read alike by both checkers`);
process.exit(fail ? 1 : 0);
