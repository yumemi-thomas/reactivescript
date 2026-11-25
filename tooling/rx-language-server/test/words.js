// MO-8v: the words `rx-declare` writes from the code's proof (src/words.js, compiler/words): the rows, the questions that
// are no longer asked, `--why`; a package's hosts; both checkers reading the rows, with a program accepted only because of a
// proven word and one refused because a word was withheld; rx-verify over rows that claim what their code does not do; the
// `ref` of a part. The cases a word must not be written over are test/words-cases.js's.
//   node test/words.js            VERBOSE=1 prints the drafts
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { words } = require("../src/words.js");

const repo = path.resolve(__dirname, "../../..");
const ws = path.join(__dirname, "../.test/words");
fs.rmSync(ws, { recursive: true, force: true });
fs.mkdirSync(path.join(ws, "node_modules/kit"), { recursive: true });
for (const d of fs.readdirSync(path.join(repo, "ref/node_modules"))) if (!d.startsWith(".")) fs.symlinkSync(path.join(repo, "ref/node_modules", d), path.join(ws, "node_modules", d), "dir");
fs.writeFileSync(path.join(ws, "package.json"), '{"type":"module"}');
fs.writeFileSync(path.join(ws, "node_modules/kit/package.json"), JSON.stringify({ name: "kit", version: "1.0.0", type: "module", exports: { ".": { types: "./index.d.ts", default: "./index.cjs" } } }));
fs.writeFileSync(path.join(ws, "node_modules/kit/index.cjs"), "exports.mystery = x => x;\n");
fs.writeFileSync(path.join(ws, "node_modules/kit/index.d.ts"), "export declare function mystery(x: any): any;\n");
let pass = 0, fail = 0;
const ok = (name, cond, detail) => { if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}${detail !== undefined ? `\n      ${String(detail).slice(0, 900)}` : ""}`); } };

console.log("a package: a word holds under every host that can load it, and a host that loads what is not read leaves it unread");
{
  const put = (name, json, files) => { const at = path.join(ws, "node_modules", name); fs.mkdirSync(at, { recursive: true }); fs.writeFileSync(path.join(at, "package.json"), JSON.stringify({ name, version: "1.0.0", type: "module", ...json })); for (const [f, text] of Object.entries(files)) { fs.mkdirSync(path.dirname(path.join(at, f)), { recursive: true }); fs.writeFileSync(path.join(at, f), text); } };
  const pure = (spec, ...names) => { const r = words(spec, ws, names.map(name => ({ name, kind: "fn" }))); return r.unread ?? names.map(n => !!r.exports[n].pure?.ok).join(); };
  const d = "export declare const same: (n: number) => number; export declare const differs: (n: number) => number; export declare const half: (n: number) => number; export declare const renamed: (s: string) => string; export declare const viaOther: (n: number) => number; export declare const alone: (n: number) => number; export declare const twice: (n: number) => number;\n";
  put("two", { exports: { ".": { types: "./index.d.ts", browser: "./browser.js", node: "./server.js", default: "./browser.js" }, "./one": { types: "./index.d.ts", default: "./one.js" } } }, {
    "index.d.ts": d, "browser.js": 'import { half } from "./shared.js";\nexport const same = n => { half(n); };\nexport const differs = n => n + 1;\nexport * from "./shared.js";\n',
    "server.js": 'import { half } from "./shared.js";\nexport const same = n => { half(n); };\nexport const differs = n => { globalThis.seen = n; return n + 1; };\nexport * from "./shared.js";\n',
    "shared.js": 'export const half = n => n / 2;\nexport { stamp as renamed } from "./deep.js";\n', "deep.js": "export const stamp = s => `#${s}`;\n", "one.js": 'import { mystery } from "kit";\nexport const viaOther = n => mystery(n);\nexport const alone = n => n * 2;\n',
  });
  ok("the same under each host, and no data: pure; pure in the browser's build and not in the server's: not", pure("two", "same", "differs") === "true,false", pure("two", "same", "differs"));
  ok("an export through `export *` and a renaming `export { … } from` is followed", pure("two", "half", "renamed") === "true,true");
  ok("a subpath; a call into a package with no ES module is code that is not read", pure("two/one", "alone", "viaOther") === "true,false");
  ok("a package with no ES module has no words", /no ES module/.test(pure("kit", "mystery")));
  put("withsource", { exports: { ".": { types: "./index.d.ts", solid: "./src.jsx", default: "./index.js" } } }, { "index.d.ts": d, "src.jsx": "export const twice = n => n * 2;\nexport const half = n => n / 2;\n", "index.js": "export const twice = n => { globalThis.x = n; };\nexport const half = n => n / 2;\n" });
  ok("the `solid` condition's source and the other build must each show it; two builds that answer data show neither", pure("withsource", "twice", "half") === "false,false", pure("withsource", "twice", "half"));
  put("field", { main: "./main.cjs", module: "./index.js", types: "./index.d.ts", type: undefined }, { "index.d.ts": d, "main.cjs": "exports.twice = n => n;", "index.js": "export const twice = n => n * 2;\n" });
  ok("`main` is CommonJS, which is what Node loads: no words, though `module` is not", /main\.cjs/.test(pure("field", "twice")), pure("field", "twice"));
  put("mapped", { main: "./index.js", browser: { "./a.js": "./b.js" }, types: "./index.d.ts" }, { "index.d.ts": d, "index.js": 'export { twice } from "./a.js";\n', "a.js": "export const twice = n => n * 2;\n", "b.js": "export const twice = n => n * 3;\n" });
  ok("a `browser` map is not followed: no words", /browser/.test(pure("mapped", "twice")), pure("mapped", "twice"));
}

// ---- the draft ----
console.log("rx-declare writes the proven words into the rows, marks each row, and does not ask what is answered");
fs.writeFileSync(path.join(ws, "api.js"), [
  "export class NotFound extends Error {}",
  "const people = { 1: { name: \"Ann\" } };",
  "export async function fetchPerson(id) { await new Promise(r => setTimeout(r, 5)); const p = people[id]; if (!p) throw new NotFound(id); return { ...p }; }",
  "let saves = 0;",
  "export async function savePerson(id, name) { saves++; return fetch(`/people/${id}`, { method: \"POST\", body: name }); }",
  "export function onKey(key, run) { const l = e => { if (e.key === key) run(); }; document.addEventListener(\"keydown\", l); return () => document.removeEventListener(\"keydown\", l); }",
  "export function each(list, visit) { list.forEach(visit); }",
  "export function watch(opts) { opts.onStart(); document.addEventListener(\"change\", () => opts.onChange(1)); }",
  "export function moveItem(list, from, to) { const [x] = list.splice(from, 1); list.splice(to, 0, x); }",
  "export function total(list) { let n = 0; for (const x of list) n += x; return n; }",
  "export function log(list) { console.log(list); }",
  "export const createCounter = start => { let n = start; return [() => n, () => { n++; }]; };",
  "export const fmt = (n, unit = \"\") => `${n}${unit}`;",
  "export function sub(a, b) { (b ?? a)(); }",
  "",
].join("\n"));
fs.writeFileSync(path.join(ws, "api.d.ts"), [
  "export declare class NotFound extends Error {}",
  "export declare function fetchPerson(id: string): Promise<{ name: string }>;",
  "export declare function savePerson(id: string, name: string): Promise<Response>;",
  "export declare function onKey(key: string, run: () => void): () => void;",
  "export declare function each(list: number[], visit: (n: number) => void): void;",
  "export declare function watch(opts: { onStart: () => void; onChange: (n: number) => void }): void;",
  "export declare function moveItem<T>(list: T[], from: number, to: number): void;",
  "export declare function total(list: number[]): number;",
  "export declare function log(list: number[]): void;",
  "export declare function createCounter(start: number): [() => number, () => void];",
  "export declare function fmt(n: number): string;",
  "export declare function fmt(n: number, unit: string): string;",
  "export declare function sub(run: () => void): void;",
  "export declare function sub(key: string, run: () => void): void;",
  "",
].join("\n"));
const declare = (...a) => spawnSync(process.execPath, [path.join(__dirname, "../bin/declare.js"), ...a], { cwd: ws, encoding: "utf8", env: { ...process.env, RX_DECLARE_INFER: "" } });
const r = declare("./api.js", "--out", "api.d.rx", "--why", "--explain");
const draft = fs.existsSync(path.join(ws, "api.d.rx")) ? fs.readFileSync(path.join(ws, "api.d.rx"), "utf8") : "";
if (process.env.VERBOSE) console.log(draft, r.stderr);
const rowOf = n => draft.split("\n").find(l => new RegExp(`^export (?:pure )?fn ${n}\\b`).test(l)) ?? "";
const above = n => { const ls = draft.split("\n"); const i = ls.findIndex(l => new RegExp(`^export (?:pure )?fn ${n}\\b`).test(l)); return i > 0 ? ls[i - 1] : ""; };
ok("a loader that only computes and waits: `pure`, and what it rejects with", rowOf("fetchPerson") === "export pure fn fetchPerson(id: string): Promise<{ name: string }> rejects(NotFound)", rowOf("fetchPerson") + r.stderr);
ok("…with no line above it (MO-8w): which words were read is said once, at the head of the draft, and again by --audit and rx-verify from the code", !/\/\/@ inferred/.test(draft), above("fetchPerson"));
ok("…and neither question is asked", !/TODO fetchPerson/.test(draft));
ok("one that writes and fetches is io, and its question stays", rowOf("savePerson") === "export fn savePerson(id: string, name: string): Promise<Response>" && /TODO savePerson: io as drafted, .*\n\/\/ TODO savePerson: its promise rejects with Error as far as/.test(draft), rowOf("savePerson"));
ok("a callback given to a listener: `handler`", rowOf("onKey") === "export fn onKey(key: string, run: handler () => void): () => void", rowOf("onKey"));
ok("a callback called while the call runs: no `handler`; one that answers nothing is run for what it does: no `pure`", rowOf("each") === "export fn each(list: number[], visit: (n: number) => void): void", rowOf("each"));
ok("a listener's callback in a fn that calls what could dispatch the event: no `handler`", rowOf("watch") === "export fn watch(opts: { onStart: () => void; onChange: (n: number) => void }): void", rowOf("watch"));
ok("…and nothing is asked: a closure given to an io fn may write already", !/TODO watch/.test(draft), draft.split("\n").filter(l => /TODO watch/.test(l)).join("\n"));
ok("a parameter changed in place: `draft`, and no question", rowOf("moveItem") === "export fn moveItem<T>(draft list: T[], from: number, to: number): void" && !/TODO moveItem/.test(draft), rowOf("moveItem"));
ok("a parameter only read: `pure`, no `draft`", rowOf("total") === "export pure fn total(list: number[]): number", rowOf("total"));
ok("a parameter never changed, in a fn that answers nothing: the question is not asked", rowOf("log") === "export fn log(list: number[]): void" && !/TODO log/.test(draft), draft.split("\n").filter(l => /TODO log/.test(l)).join("\n"));
ok("a primitive by its name that only computes: `pure`, and the name's question is not asked", /^export pure fn createCounter\(/.test(rowOf("createCounter")) && !/TODO createCounter/.test(draft), rowOf("createCounter"));
ok("the draft says how many words were read from the code", /^\/\/ Read from the code that runs \(MO-8v\): 4 pure, 1 handler, 1 rejects, 1 draft/m.test(draft), draft.split("\n")[1]);
ok("several signatures that are one row to the checker: a note for --explain, not a question", !/TODO fmt/.test(draft) && /rx-declare: fmt: 2 signatures in the library's types/.test(r.stderr), draft + r.stderr);
ok("…and a question where they differ in what the checker reads (a callback first in one, second in the other)", /TODO sub: one of 2 signatures/.test(draft), draft);
ok("--why: each word proven with what shows it", /fetchPerson: pure proven/.test(r.stderr) && /onKey: handler\(run\) proven — .*\[api\.js:6\]/.test(r.stderr), r.stderr);
ok("…and each refused with the first thing in the way, and its place", /savePerson: pure not proven — .*saves.*\[api\.js:\d\]/.test(r.stderr) && /each: handler\(visit\) not proven — it is handed to code that is not followed \[api\.js:7\]/.test(r.stderr), r.stderr);
{
  const plain = declare("./api.js", "--no-infer");
  ok("--no-infer: the draft from the types alone, every question asked", !/\/\/@ inferred|^export pure fn|: handler \(|rejects\(N|draft list:/m.test(plain.stdout) && /TODO fetchPerson: its promise rejects/.test(plain.stdout) && /TODO total: io as drafted, refused in a view or an equation/.test(plain.stdout), plain.stdout);
  ok("the same module is drafted to the same bytes, from a process of its own", declare("./api.js").stdout === draft && declare("./api.js", "--no-infer").stdout === plain.stdout, draft);
  fs.writeFileSync(path.join(ws, "ask.js"), "import { isServer } from \"solid-js\";\nimport { mystery } from \"kit\";\nexport function stamp(n) { return n + Date.now(); }\nexport function title(n) { return document.title + n; }\nexport function unsure(n) { return mystery(n); }\nexport function where(n) { return isServer ? 1 : n; }\nexport function acts(n) { mystery(n); }\n");
  fs.writeFileSync(path.join(ws, "ask.d.ts"), ["stamp", "title", "unsure", "where"].map(n => `export declare function ${n}(n: number): number;\n`).join("") + "export declare function acts(n: number): void;\n");
  const asked = [...declare("./ask.js").stdout.matchAll(/^\/\/ TODO (\w+): io as drafted/gm)].map(m => m[1]).join();
  ok("`pure` is asked where the reading stops, not where an effect is shown (the clock, the environment) nor of a fn that answers nothing", asked === "unsure,where", asked);
  const only = declare("./api.js", "--only", "onKey");
  ok("--only keeps the row, words and all", /^export fn onKey\(key: string, run: handler \(\) => void\)/m.test(only.stdout) && !/fetchPerson/.test(only.stdout), only.stdout);
}

// ---- both checkers read the draft ----
console.log("the checkers read the rows as any rows: a word that was proven lets a program through, one withheld does not");
fs.writeFileSync(path.join(ws, "tsconfig.json"), JSON.stringify({ compilerOptions: { strict: true, noEmit: true, allowJs: true, checkJs: false, module: "ESNext", moduleResolution: "Bundler", target: "ES2022", jsx: "preserve", jsxImportSource: "@solidjs/web", skipLibCheck: true }, include: ["*.rx"] }));
const program = body => ["import { fetchPerson, onKey, each, total, log, NotFound } from \"./api.js\"", "export default component App() {", ...body, "}", ""].join("\n");
// each checker's diagnostics for one program: rx-tsc (the crate), and ref/'s checker (bench/ref-check.ts)
const both = (file, body) => {
  fs.writeFileSync(path.join(ws, file), program(body));
  const t = spawnSync(process.execPath, [path.join(__dirname, "../bin/tsc.js"), "--noEmit", "-p", "tsconfig.json"], { cwd: ws, encoding: "utf8" });
  const r = spawnSync(process.execPath, ["--experimental-strip-types", "--no-warnings", path.join(repo, "bench/ref-check.ts"), path.join(ws, file)], { cwd: ws, encoding: "utf8" });
  fs.rmSync(path.join(ws, file));
  let ref; try { ref = JSON.parse(r.stdout); } catch { ref = { error: r.stdout + r.stderr }; }
  return { crate: t.stdout + t.stderr, ref: ref.error ? `error: ${ref.error}` : ref.diagnostics.map(d => d.code).join(" ") };
};
const good = both("good.rx", ["  source n := 0", "  source nums: number[] := [1, 2]", "  sum = total(nums)", "  effect () {", "    let stop = onKey(\"k\", () => { n := h => h + 1 })", "    return () => { stop() }", "  }", "  <p>{sum} {n}</p>"]);
ok("rx-tsc (the crate): a `pure` fn in an equation, a closure that writes given to a `handler` parameter", !/error/.test(good.crate), good.crate);
ok("…and ref/'s checker reads the same rows the same way", good.ref === "", good.ref);
const badPure = both("bad1.rx", ["  source nums: number[] := [1, 2]", "  gone = log(nums)", "  <p>{nums.length}</p>"]);
ok("a fn that was not proven pure is io there (IO_IN_REACTIVE), to both", /IO_IN_REACTIVE/.test(badPure.crate) && /IO_IN_REACTIVE/.test(badPure.ref), JSON.stringify(badPure));
const badHandler = both("bad2.rx", ["  source n := 0", "  source nums: number[] := [1, 2]", "  effect () {", "    each(nums, x => { n := x })", "  }", "  seen = each(nums, x => { n := x })", "  <p>{n}</p>"]);
ok("a closure that writes, given to a callback that was not proven a handler, is refused by both", /REACTIVE_WRITE_IN_OWNED_SCOPE/.test(badHandler.crate) && /REACTIVE_WRITE_IN_OWNED_SCOPE/.test(badHandler.ref), JSON.stringify(badHandler));

// ---- rx-verify: a word read from the code is run against what the reading claims ----
console.log("rx-verify runs each word the code proves: an observation against it is a mismatch");
{
  const app = path.join(ws, "verify"); fs.mkdirSync(app, { recursive: true });
  fs.symlinkSync(path.join(ws, "node_modules"), path.join(app, "node_modules"), "dir");
  fs.writeFileSync(path.join(app, "package.json"), JSON.stringify({ type: "module" }));
  // the reading refuses a function that does what its word must not cover (above), so what the run observes is made here by
  // the world: the code proves each word of the platform it is written for, and the probe's platform is another one
  fs.writeFileSync(path.join(app, "lies.js"), [
    "export class NotFound extends Error {}", "export class Other extends Error {}",
    "export const stamps = s => s.trim();",
    "export const rolls = n => n.toFixed(1);",
    "export const pushes = (list, x) => list.slice(0, x).length;",
    "export const leaks = n => n.toString();",
    "export const honest = (list, x) => [...list, x].length;",
    "export const callsNow = (el, cb) => { requestAnimationFrame(cb); };",
    "export const callsLater = (el, cb) => { setTimeout(cb); };",
    "export const rejectsOther = async id => { if (!id.trim()) throw new NotFound(\"no\"); return id; };",
    "export const rejectsRight = async id => { if (!id) throw new NotFound(\"no\"); return id; };",
    "",
  ].join("\n"));
  fs.writeFileSync(path.join(app, "lies.d.ts"), ["stamps(s: string): string", "rolls(n: number): string", "pushes(list: number[], x: number): number", "leaks(n: bigint): string", "honest(list: number[], x: number): number", "callsNow(el: EventTarget, cb: (n: number) => void): void", "callsLater(el: EventTarget, cb: (n: number) => void): void", "rejectsOther(id: string): Promise<string>", "rejectsRight(id: string): Promise<string>"].map(x => `export declare function ${x};`).join("\n") + "\nexport declare class NotFound extends Error {}\nexport declare class Other extends Error {}\n");
  fs.writeFileSync(path.join(app, "lies.d.rx"), [
    "export error NotFound", "export error Other",
    "export pure fn stamps(s: string): string",
    "export pure fn rolls(n: number): string",
    "export pure fn pushes(list: number[], x: number): number",
    "export pure fn leaks(n: bigint): string",
    "export pure fn honest(list: number[], x: number): number",
    "export fn callsNow(el: EventTarget, cb: handler (n: number) => void): void",
    "export fn callsLater(el: EventTarget, cb: handler (n: number) => void): void",
    "export pure fn rejectsOther(id: string): Promise<string> rejects(NotFound)",
    "export pure fn rejectsRight(id: string): Promise<string> rejects(NotFound)",
    "",
  ].join("\n"));
  fs.writeFileSync(path.join(app, "lies.probe.mjs"), [
    "const target = () => { const t = new EventTarget(); return t; };",
    "globalThis.requestAnimationFrame = f => f(0); const now = () => new EventTarget();",
    "const patch = (proto, name, f) => { const real = proto[name]; proto[name] = function (...a) { f(this); return real.apply(this, a); }; };",
    "patch(String.prototype, \"trim\", () => Date.now()); patch(Number.prototype, \"toFixed\", () => Math.random());",
    "patch(Array.prototype, \"slice\", me => { if (me.mine) me.push(0); }); patch(BigInt.prototype, \"toString\", me => { if (Number(me) === 7) globalThis.__leaked = me; });",
    "import { Other } from \"./lies.js\";", "let last;",
    "export const probes = {",
    "  stamps: { args: () => [\"a\"] }, rolls: { args: () => [1000000] }, pushes: { args: () => [Object.assign([1, 2], { mine: true }), 3] }, leaks: { args: () => [7n] }, honest: { args: () => [[1, 2], 3] },",
    "  callsNow: { args: () => [now(), () => {}], act: () => {} },",
    "  callsLater: { args: () => [(last = target()), () => {}], act: () => last.dispatchEvent(new Event(\"x\")) },",
    "  rejectsOther: { args: () => [\"1\"], fail: () => [{ trim() { throw new Other(\"no\"); } }] }, rejectsRight: { args: () => [\"1\"], fail: () => [\"\"] },",
    "};", "",
  ].join("\n"));
  const v = spawnSync(process.execPath, ["--conditions=browser", path.join(__dirname, "../bin/verify.js"), "lies.d.rx"], { cwd: app, encoding: "utf8" });
  const said = v.stdout + v.stderr; if (process.env.VERBOSE) console.log(said);
  const line = n => said.split("\n").filter(l => new RegExp(`\\b${n}:`).test(l)).join("\n");
  ok("a `pure` that asks the clock: mismatch", /stamps: read from its code as pure\b.*Date\.now\(\)/.test(said) && /✗|MISMATCH|mismatch/i.test(line("stamps")), line("stamps") || said.slice(0, 600));
  ok("a `pure` that asks for a random number: mismatch", /rolls: read from its code as pure\b.*Math\.random\(\)/.test(said), line("rolls"));
  ok("a `pure` that changes its argument: mismatch", /pushes: read from its code as pure\b.*changes what it is given/.test(said), line("pushes"));
  ok("a `pure` that leaves a global: mismatch", /leaks: read from its code as pure\b.*__leaked/.test(said), line("leaks"));
  ok("an honest one is not contradicted", /honest: pure is read from the code \(its own code only computes[^)]*\), and no run contradicts it/.test(said), line("honest"));
  ok("a `handler` called while the call runs: mismatch", /callsNow: cb was read from the code as a handler\b.*while the call itself runs/.test(said), line("callsNow"));
  ok("…and one called only by the listener holds", /callsLater: callback cb holds/.test(said), line("callsLater"));
  ok("a `rejects(E)` that rejects with another class: mismatch", /rejectsOther: declared to reject with NotFound alone\b.*rejects with Other/.test(said), line("rejectsOther"));
  ok("…and one that rejects with the class its row names holds", /rejectsRight: under the probe's failing arguments it rejects with NotFound, as its row says/.test(said), line("rejectsRight"));
  ok("rx-verify exits 1 on the mismatches", v.status === 1, String(v.status));
  // the drafts of the suite's honest twins, run: no inferred word of a real draft is contradicted
  fs.writeFileSync(path.join(app, "twins.js"), ["export function copies(list, x) { const out = [...list]; out.push(x); out.sort(); return out; }", "export function maps(rows, key) { return rows.filter(r => r[key] != null).map(r => ({ ...r, label: String(r[key]).trim().toUpperCase() })); }", "const people = { 1: { name: \"Ann\" }, 2: { name: \"Bo\" } };\nexport function constantTable(id) { const p = people[id]; return p ? { ...p } : undefined; }", ["export function listener(el, cb) { el.addEventListener(\"click\", cb); return () => el.removeEventListener(\"click\", cb); }", 1][0], ["export function timer(cb, ms) { const id = setTimeout(() => cb(ms), ms); return () => clearTimeout(id); }", 0][0], ["export class NotFound extends Error {}\nexport class Stale extends Error {}\nexport async function twoClasses(id) { if (id === \"0\") throw new Stale(); if (!id) throw new NotFound(); return `seen ${id}`; }", ["NotFound", "Stale"]][0]].join("\n") + "\n");
  fs.writeFileSync(path.join(app, "twins.d.ts"), ["export declare function copies(list: number[], x: number): number[];", "export declare function maps(rows: { a?: string }[], key: \"a\"): { a?: string; label: string }[];", "export declare function constantTable(id: number): { name: string } | undefined;", "export declare function listener(el: EventTarget, cb: (e: Event) => void): () => void;", "export declare function timer(cb: (ms: number) => void, ms: number): () => void;", "export declare class NotFound extends Error {}", "export declare class Stale extends Error {}", "export declare function twoClasses(id: string): Promise<string>;", ""].join("\n"));
  const d = spawnSync(process.execPath, [path.join(__dirname, "../bin/declare.js"), "./twins.js", "--out", "twins.d.rx"], { cwd: app, encoding: "utf8", env: { ...process.env, RX_DECLARE_INFER: "" } });
  const twins = fs.existsSync(path.join(app, "twins.d.rx")) ? fs.readFileSync(path.join(app, "twins.d.rx"), "utf8") : d.stderr;
  ok("the twins' draft has its words: 3 pure, 1 handler, 1 rejects", /3 pure, 1 handler, 1 rejects/.test(twins), twins);
  fs.writeFileSync(path.join(app, "twins.probe.mjs"), ["let last;", "export const probes = {", "  copies: { args: () => [[3, 1], 2] }, maps: { args: () => [[{ a: \" x \" }, {}], \"a\"] }, constantTable: { args: () => [1] },", "  listener: { args: () => [(last = new EventTarget()), () => {}], act: () => last.dispatchEvent(new Event(\"click\")) },", "  timer: { args: () => [() => {}, 1] },", "  twoClasses: { args: () => [\"7\"], fail: () => [\"0\"] },", "};", ""].join("\n"));
  const tv = spawnSync(process.execPath, ["--conditions=browser", path.join(__dirname, "../bin/verify.js"), "twins.d.rx"], { cwd: app, encoding: "utf8" });
  ok("…and run, none is contradicted: every probed word holds", tv.status === 0 && /copies: pure is read from the code \(its own code only computes[^)]*\), and no run contradicts it/.test(tv.stdout) && /timer: callback cb holds/.test(tv.stdout) && /twoClasses: under the probe's failing arguments it rejects with Stale, as its row says/.test(tv.stdout), tv.stdout + tv.stderr);
}

// ---- `ref` on a part only shaped as an accessor (`() => T`): where the code shows a reader, and nowhere else ----
console.log("a function of nothing is `ref` where the code shows that calling it only reads");
{
  const app = path.join(ws, "verify");
  const READS = { memo: "const m = createMemo(() => x); return m;", memoField: "return { v: createMemo(() => x) };", getter: "const [g] = createSignal(x); return g;", tuple: "const [g, set] = createSignal(x); return [g, v => set(v)];" };
  const NOT = {
    closure: "const [g] = createSignal(x); return () => g() + 1;", branches: "const [g] = createSignal(x); return x ? g : () => 0;", named: "const [g] = createSignal(x); const read = () => ({ n: g() }); return { v: read };", constant: "return () => 1;",
    aborts: "let c; return () => { c?.abort(); c = new AbortController(); return c.signal; };", counts: "let n = 0; return () => n++;", clock: "return () => Date.now();", random: "return () => Math.random();",
    made: "return () => new FormData();", writes: "const [g, set] = createSignal(x); return () => { set(1); return g(); };", setter: "const [g, set] = createSignal(x); return set;", calls: "return () => x();", fetches: "return () => fetch(x);",
    held: "let n = 0; globalThis.addEventListener?.('x', () => n++); return () => n;", makes: "return () => createMemo(() => x);", logs: "return () => { console.log(x); return 1; };", oneBranch: "let n = 0; const [g] = createSignal(x); return x ? g : () => n++;",
    reassigned: "let [g] = createSignal(x); g = () => Date.now(); return g;", secondPart: "const [, set] = createSignal(x); return { v: set };", listed: "const ls = []; return () => ls.push(x);", lookalike: "const createMemo2 = f => f; let n = 0; return createMemo2(() => n++);", asyncs: "return async () => 1;", another: "return other;", viaHelper: "const [g, set] = createSignal(x); const bump = () => { set(1); }; return () => { bump(); return g(); };", viaRecord: "const [g, set] = createSignal(x); const api = { bump: () => set(1) }; return () => { api.bump(); return g(); };", viaValue: "const [g, set] = createSignal(x); return () => { [1].forEach(set); return g(); };", viaPair: "const s = createSignal(x); return () => { s[1](2); return s[0](); };", store: "const [st, setSt] = createStore({ n: 0 }); return () => { setSt(d => { d.n++; }); return st.n; };",
  };
  const body = { ...READS, ...NOT };
  fs.writeFileSync(path.join(app, "readers.js"), `import { createMemo, createSignal, createStore } from "solid-js";\nimport { other } from "./elsewhere.js";\n${Object.entries(body).map(([n, b]) => `export function ${n}(x) { ${b} }`).join("\n")}\n`);
  const type = (n, b) => /\{ v: /.test(b) ? "{ v: () => number }" : n === "tuple" ? "[() => number, (v: number) => void]" : "() => number";
  fs.writeFileSync(path.join(app, "readers.d.ts"), Object.entries(body).map(([n, b]) => `export declare function ${n}(x: any): ${type(n, b)};`).join("\n") + "\n");
  const d = spawnSync(process.execPath, [path.join(__dirname, "../bin/declare.js"), "./readers.js"], { cwd: app, encoding: "utf8", env: { ...process.env, RX_DECLARE_INFER: "1" } }).stdout;
  const row = n => d.split("\n").find(l => l.includes(`fn ${n}(`)) ?? "";
  for (const n in READS) ok(`a reader: ${n}`, /\bref number/.test(row(n)), row(n));
  for (const n in NOT) ok(`no reader: ${n}`, row(n) && !/\bref\b/.test(row(n)) && /\(\) => number/.test(row(n)), row(n));
  const off = spawnSync(process.execPath, [path.join(__dirname, "../bin/declare.js"), "./readers.js", "--no-infer"], { cwd: app, encoding: "utf8" }).stdout;
  ok("no code read: no part is ref off its shape, and no row instantiates off its name", !/\bref\b|instantiates/.test(off.split("\n").filter(l => l.startsWith("export")).join("\n")), off);
}

// A value the types declare and no build of the code exports (valibot's `BrandSymbol`, a `unique symbol` its types are
// written with) is no row: an import of it is undefined. Where a build's exports are not read to their end, it is one.
{
  const app = path.join(ws, "absent"); fs.mkdirSync(app, { recursive: true });
  fs.writeFileSync(path.join(app, "part.js"), "export const held = 1;\n");
  fs.writeFileSync(path.join(app, "lib.js"), "const go = () => 1;\nexport { go, go as alias };\nexport * from './part.js';\n");
  const types = "export declare const Brand: unique symbol;\nexport declare const held: number;\nexport declare function go(): number;\nexport declare function alias(): number;\nexport declare function gone(): number;\nexport type T = { [Brand]: 1 };\n";
  fs.writeFileSync(path.join(app, "lib.d.ts"), types);
  fs.writeFileSync(path.join(app, "open.js"), "export const go = () => 1;\nexport * from 'not-installed';\n");
  fs.writeFileSync(path.join(app, "open.d.ts"), types);
  const run = (m, ...a) => spawnSync(process.execPath, [path.join(__dirname, "../bin/declare.js"), m, ...a], { cwd: app, encoding: "utf8", env: { ...process.env, RX_DECLARE_INFER: "1" } }).stdout;
  const names = d => [...d.matchAll(/^export (?:(?:pure|const|fn|type) )+(\w+)/gm)].map(m => m[1]).sort().join();
  ok("a value no build of the code exports is not drafted", names(run("./lib.js")) === "T,alias,go,held", run("./lib.js"));
  ok("…and is where the code's exports are not read to their end, or not read", names(run("./open.js")) === "Brand,T,alias,go,gone,held" && names(run("./lib.js", "--no-infer")) === "Brand,T,alias,go,gone,held", run("./open.js"));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
