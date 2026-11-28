// The same program over the rewrite, over the original with rx-declare's drafts, and as .tsx over the original (TypeScript):
// 12 one-line mistakes and 8 correct lines. node check/run.mjs
import { execFileSync, spawnSync } from "node:child_process"; import { mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs"; import path from "node:path";
import { both } from "../../../bench/harness.mjs";
const here = path.dirname(new URL(import.meta.url).pathname), root = path.dirname(here), repo = path.resolve(root, "../..");
const good = readFileSync(path.join(root, "app/main.rx"), "utf8");
const cfg = { compilerOptions: { jsx: "preserve", jsxImportSource: "@solidjs/web", strict: true, target: "ES2022", module: "ESNext", moduleResolution: "Bundler", noEmit: true, skipLibCheck: true, lib: ["ES2022", "DOM", "DOM.Iterable"] } };
for (const d of ["rx", "orig", "tsx"]) { mkdirSync(path.join(here, d), { recursive: true }); writeFileSync(path.join(here, d, "tsconfig.json"), JSON.stringify({ ...cfg, include: d === "tsx" ? ["main.tsx"] : ["main.rx", "rx-types/**/*.d.rx"] })); }
const tsx = `import { createSignal, For, Show } from "solid-js";
import { Toggle, ToggleGroup } from "@ui-sdk/solid/toggle";
import { Tabs, TabsList, TabsTab, TabsPanel } from "@ui-sdk/solid/tabs";
import { Dialog, DialogTrigger, DialogContent, DialogTitle, DialogClose } from "@ui-sdk/solid/dialog";
export default function App() {
  const [bold, setBold] = createSignal(false); const [align, setAlign] = createSignal<string[]>(["left"]); const [tab, setTab] = createSignal<string | null>("one"); const [open, setOpen] = createSignal(false); const [extra, setExtra] = createSignal(false); const [clicks, setClicks] = createSignal(0);
  return <>
  <p id="seen">{bold() ? "bold" : "plain"} {align().join("+")} {tab()} {open() ? "open" : "shut"} {clicks()}</p>
  <Toggle id="bold" class="t" pressed={bold()} onPressedChange={(p: boolean) => { setBold(p) }} onClick={() => { setClicks((n) => n + 1) }}>{bold() ? "B!" : "B"}</Toggle>
  <ToggleGroup id="align" value={align()} onValueChange={(v: string[]) => { setAlign(v) }}>
    <For each={["left", "right"]}>{(side) => <Toggle id={side} value={side}>{side}</Toggle>}</For>
  </ToggleGroup>
  <button id="extra" onClick={() => { setExtra((x) => !x) }}>extra</button>
  <Tabs value={tab()} onValueChange={(v: string | null) => { setTab(v) }}>
    <TabsList aria-label="n">
      <TabsTab value="one">One</TabsTab>
      <TabsTab value="two">Two</TabsTab>
      <Show when={extra()}><TabsTab value="three">Three</TabsTab></Show>
    </TabsList>
    <TabsPanel value="one">first</TabsPanel>
    <TabsPanel value="two">second</TabsPanel>
  </Tabs>
  <Dialog open={open()} onOpenChange={(o: boolean) => { setOpen(o) }}>
    <DialogTrigger id="trigger">Open</DialogTrigger>
    <DialogContent id="content"><DialogTitle>Title</DialogTitle><DialogClose id="close">Close</DialogClose></DialogContent>
  </Dialog>
  </>;
}
`;
const END = "    <TabsPanel value=\"two\">second</TabsPanel>\n  </Tabs>";
// [name, .rx from, to, .tsx from, to]
const mistakes = [
  ["a tab outside Tabs", END, END + "\n  <TabsTab value=\"x\">X</TabsTab>"],
  ["a panel outside Tabs", END, END + "\n  <TabsPanel value=\"x\">X</TabsPanel>"],
  ["dialog content outside Dialog", "  <Dialog open", "  <DialogContent>late</DialogContent>\n  <Dialog open"],
  ["a dialog's close beside its dialog", "  </Dialog>", "  </Dialog>\n  <DialogClose>x</DialogClose>"],
  ["state written while the view computes", "{bold ? \"B!\" : \"B\"}", "{bold := true}", "{bold() ? \"B!\" : \"B\"}", "{setBold(true)}"],
  ["a handler called, not passed", "onClick={() => { extra := !extra }}", "onClick={alert(extra)}", "onClick={() => { setExtra((x) => !x) }}", "onClick={alert(extra())}"],
  ["the parts' value mutated in place", "align := v }", "align.push(v[0]) }", "setAlign(v) }", "align().push(v[0]) }"],
  ["a value of the wrong type", "<TabsTab value=\"two\">", "<TabsTab value={2}>"],
  ["a required prop left out", "<TabsPanel value=\"two\">second", "<TabsPanel>second"],
  ["a prop that is not one", "<DialogTrigger id=\"trigger\">", "<DialogTrigger id=\"trigger\" opened={true}>"],
  ["a change handler with the wrong parameter", "(o: boolean) => { open := o }", "(o: string) => { open := o == \"yes\" }", "(o: boolean) => { setOpen(o) }", "(o: string) => { setOpen(o == \"yes\") }"],
  ["an option of a fixed set misspelt", "<Tabs value", "<Tabs orientation=\"sideways\" value"],
];
const correct = [
  ["a class that is a function of the state", "class=\"t\" pressed", "class={(s) => s.pressed ? \"on\" : \"off\"} pressed"],
  ["children that are a function of the state", "{bold ? \"B!\" : \"B\"}</Toggle>", "{view (s) { <b>{s.pressed ? \"B!\" : \"B\"}</b> }}</Toggle>", "{bold() ? \"B!\" : \"B\"}</Toggle>", "{(s) => <b>{s.pressed ? \"B!\" : \"B\"}</b>}</Toggle>"],
  ["a render function", "<DialogTrigger id=\"trigger\">Open", "<DialogTrigger id=\"trigger\">{view element (e) { <a {...e.attrs}>Open</a> }}", "<DialogTrigger id=\"trigger\">Open", "<DialogTrigger id=\"trigger\" render={(p) => <a {...p}>Open</a>}>Open"],
  ["a ref", "<Toggle id=\"bold\"", "<Toggle ref={(e: HTMLButtonElement) => { clicks := 1 }} id=\"bold\"", "<Toggle id=\"bold\"", "<Toggle ref={(e) => { queueMicrotask(() => setClicks(1)) }} id=\"bold\""],
  ["a data attribute", "<Toggle id=\"bold\"", "<Toggle data-k=\"v\" id=\"bold\""],
  ["parts in a component of the app's own, applied inside the root", "export default component App() {", "component Mine() { <TabsTab value=\"mine\">Mine</TabsTab> }\nexport default component App() {", "export default function App() {", "const Mine = () => <TabsTab value=\"mine\">Mine</TabsTab>;\nexport default function App() {"],
  ["a trigger outside every dialog", "  <Dialog open", "  <DialogTrigger id=\"lone\">Lone</DialogTrigger>\n  <Dialog open"],
  ["the details of a change, used to cancel it", "(o: boolean) => { open := o }", "(o: boolean, d: any) => { if (d.reason == \"outside-press\") { d.cancel() } else { open := o } }", "(o: boolean) => { setOpen(o) }", "(o, d) => { if (d.reason === \"outside-press\") d.cancel(); else setOpen(o) }"],
];
const orig = (t) => t.replaceAll("@rx-ui-sdk/solid/", "@ui-sdk/solid/");
// `handler` on the four callbacks the program writes state in: the only words a person adds to the drafts.
import { readdirSync } from "node:fs"; { const at = path.join(here, "orig/rx-types/@ui-sdk/solid"); if (!process.env.AS_DRAFTED) for (const f of readdirSync(at)) { const t = readFileSync(path.join(at, f), "utf8"); writeFileSync(path.join(at, f), t.replace(/(& \{|;) (on(?:Pressed|Value|Open)Change)\?: \(/g, "$1 $2?: handler (")); } }
const codes = (text) => [...new Set(text.match(/\b(TS\d+|[A-Z][A-Z]+(?:_[A-Z]+)+)\b(?=[:\s[])/g) ?? [])].filter((c) => !/^DECLARATION_(STALE|UNPINNED)/.test(c));
function rx(d, text) { const f = path.join(here, d, "main.rx"); writeFileSync(f, text); const b = both(f); const t = spawnSync(process.execPath, [path.join(repo, "tooling/rx-language-server/bin/tsc.js"), "--noEmit", "-p", "tsconfig.json"], { cwd: path.join(here, d), encoding: "utf8", env: { ...process.env, RXC: path.join(repo, "compiler/target/release/rxc") } }); const out = t.status === 0 ? "" : t.stdout + t.stderr; if (process.env.V) console.log(out.slice(0, 1500)); return { codes: [...new Set([...b.crate.diagnostics.map((x) => x.code), ...codes(out)])], agree: b.agree }; }
function ts(text) { writeFileSync(path.join(here, "tsx/main.tsx"), text); const t = spawnSync(process.execPath, [path.join(root, "node_modules/typescript/bin/tsc"), "-p", "tsconfig.json"], { cwd: path.join(here, "tsx"), encoding: "utf8" }); return { codes: t.status ? codes(t.stdout) : [], agree: true }; }
const sub = (t, a, b) => { if (!t.includes(a)) throw new Error("no " + a); return t.replace(a, b); };
const row = (name, r) => console.log(`| ${name} | ${r.map((x) => (x.codes.join(" ") || "—") + (x.agree ? "" : " (checkers disagree)")).join(" | ")} |`);
console.log("| | .rx, the rewrite | .rx, the original's drafts | TypeScript, the original |\n| --- | --- | --- | --- |");
row("the good program", [rx("rx", good), rx("orig", orig(good)), ts(tsx)]);
if (process.argv[2] === "good") process.exit(0);
for (const list of [mistakes, correct]) { for (const [n, a, b, ta = a, tb = b] of list) { if (process.argv[2] && !n.includes(process.argv[2])) continue; row((list === correct ? "correct: " : "") + n, [rx("rx", sub(good, a, b)), rx("orig", orig(sub(good, a, b))), ts(sub(tsx, ta, tb))]); } }
writeFileSync(path.join(here, "rx/main.rx"), good); writeFileSync(path.join(here, "orig/main.rx"), orig(good)); writeFileSync(path.join(here, "tsx/main.tsx"), tsx);
