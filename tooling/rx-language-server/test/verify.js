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
  "export pure fn useLoad(ref opts: { load: () => Promise<any> }): { data: holds fails(Error) any; size: number }",
  "export pure fn useEager(ref opts: { load: () => Promise<any> }): { data: any; size: number }",
  "export pure fn useLater(ref opts: { x: string }): any uses(theme)",
  "export pure fn useWrongly(ref opts: { x: string }): any uses(theme)",
  "export pure fn usePair(): [ref number, (v: number) => void]",
  "export pure fn useBadRef(): [ref number, () => void]",
  "export pure fn double(n: number): number",
  "export pure fn roll(): number",
  "export component ThemeProvider(props: { children?: View }) provides(theme)",
  "export component FakeProvider(props: { children?: View }) provides(theme)",
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
check("a hook that does not is a mismatch", /lib\.d\.rx:3 MISMATCH\s+useClock: declared uses\(…\), but called with no provider it does not throw/.test(out), out);
check("an export the module lacks is a mismatch", /lib\.d\.rx:4 MISMATCH\s+useMissing: lib\.mjs exports nothing by that name/.test(out), out);
check("an error class is checked to be an Error subclass", /lib\.d\.rx:5 ok\s+NotFound/.test(out) && /lib\.d\.rx:6 MISMATCH\s+Plain: declared an error/.test(out), out);
check("a probe's fields: a held, failing field read as declared", /lib\.d\.rx:7 ok\s+useLoad: its fields read as declared \(data held, then answered\)/.test(out), out);
check("a probe's failing arguments fail with the declared class", /lib\.d\.rx:7 ok\s+useLoad: under the failing arguments it fails with Error/.test(out), out);
check("a field that holds without holds is a mismatch", /lib\.d\.rx:8 MISMATCH\s+useEager: size holds/.test(out), out);
check("a hook that reads its context only when used: the probe's run finds it", /lib\.d\.rx:9 ok\s+useLater: uses\(…\) holds/.test(out), out);
check("a probe whose run throws under its providers too is not evidence", /lib\.d\.rx:10 unverified useWrongly: the probe's run throws under its providers too/.test(out), out);
check("a tuple's ref part is read as an accessor", /lib\.d\.rx:11 ok\s+usePair: its fields read as declared/.test(out), out);
check("a ref part that is not an accessor is a mismatch", /lib\.d\.rx:12 MISMATCH\s+useBadRef: 0 is declared ref, but is not an accessor/.test(out), out);
check("pure: two calls with the probe's arguments answer alike", /lib\.d\.rx:13 ok\s+double: pure/.test(out), out);
check("pure that answers differently is a mismatch", /lib\.d\.rx:14 MISMATCH\s+roll: declared pure, but two calls/.test(out), out);
check("provides: a hook of the file runs under the component", /lib\.d\.rx:15 ok\s+ThemeProvider: provides\(…\) holds: useTheme runs under it/.test(out), out);
check("a component that provides nothing is a mismatch", /lib\.d\.rx:16 MISMATCH\s+FakeProvider: declared provides\(theme\), but useTheme under it still fails/.test(out), out);
check("mismatches fail the run", r.status === 1, r.status);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
