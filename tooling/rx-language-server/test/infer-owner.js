// MO-8v, MO-10a: `instantiates`, read from the code — the call makes what its owner keeps on every path that returns.
// Each of BAD makes it on some path only, later, under another owner or not at all, and is refused; each of GOOD is its
// honest twin. Then the draft: what is written beside which result, and `pure` as strict as it was.
//   node test/infer-owner.js
const fs = require("node:fs"), path = require("node:path"), ts = require("typescript"), { spawnSync } = require("node:child_process");
const repo = path.resolve(__dirname, "../../.."), ws = path.join(__dirname, "../.test/infer-owner");
fs.rmSync(ws, { recursive: true, force: true }); fs.mkdirSync(path.join(ws, "node_modules"), { recursive: true });
for (const d of fs.readdirSync(path.join(repo, "ref/node_modules"))) fs.symlinkSync(path.join(repo, "ref/node_modules", d), path.join(ws, "node_modules", d), "dir");
let pass = 0, fail = 0;
const ok = (name, cond, detail) => { if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}\n      ${String(detail).slice(0, 600)}`); } };
const HEAD = `import { createSignal, createEffect, createMemo, createRoot, onCleanup, useContext, createContext, untrack, getOwner, runWithOwner, onSettled } from "solid-js";
import { isServer } from "@solidjs/web";
const C = createContext(); const isClient = !isServer, isDev = globalThis.DEV;
const tryOnCleanup = isDev ? fn => getOwner() ? onCleanup(fn) : fn : onCleanup;
const plain = isDev ? f => onCleanup(f) : onCleanup;
const helper = v => { const [n] = createSignal(v); return n; };
const sometimes = v => { if (v) return helper(v); };
const twice = f => [f(), f()];
`;
const BAD = {
  nothing: "return a + window.innerWidth;",
  listenerOnly: "window.addEventListener('x', b);",
  oneBranch: "if (a) { const [n] = createSignal(0); return n; } return b;",
  elseOnly: "if (a) return b; else return createMemo(b);",
  earlyReturn: "if (a) return 1; const [n] = createSignal(0); return n;",
  guardThatActs: "if (a()) return; const [n] = createSignal(0); return n;",
  guardAfterWork: "b(); if (a) return; const [n] = createSignal(0); return n;",
  returnsInLoop: "for (const x of a) { if (x) return x; } return createMemo(b);",
  returnsInSwitch: "switch (a) { case 1: return 2; } return createMemo(b);",
  inLoop: "for (const x of a) createMemo(() => x); return 1;",
  inForEach: "a.forEach(x => { createMemo(() => x); }); return 1;",
  shortCircuit: "a && createMemo(b); return 1;",
  orElse: "return a || createMemo(b);",
  nullish: "return a ?? createMemo(b);",
  orAssign: "let x; x ||= createMemo(b); return x;",
  conditional: "return a ? createMemo(b) : b;",
  optionalChain: "return a?.b(createMemo(b));",
  optionalCall: "return a?.(createMemo(b));",
  optionalIndex: "return a?.[createMemo(b)];",
  inTry: "try { a(); createMemo(b); } catch { return 1; } return 2;",
  handedBack: "return () => createMemo(b);",
  inRecord: "return { make() { return createMemo(b); }, get m() { return createMemo(b); } };",
  later: "setTimeout(() => createMemo(b)); return 1;",
  afterAwait: "(async () => { await a; createMemo(b); })(); return 1;",
  inHandler: "a.addEventListener('x', () => { createMemo(b); });",
  ownRoot: "return createRoot(d => { createMemo(b); return d; });",
  otherOwner: "return runWithOwner(a, () => createMemo(b));",
  conditionalCleanup: "return tryOnCleanup(() => {});",
  conditionalKept: "const off = tryOnCleanup(() => {}); return { off };",
  conditionalHanded: "const off = () => {}; tryOnCleanup(off); return { off };",
  conditionalOnBranch: "if (a) tryOnCleanup(() => {}); return 1;",
  helperSometimes: "return sometimes(a);",
  settledOnly: "onSettled(() => {}); return 1;",
  neverCalled: "function m() { return createMemo(b); } return 1;",
  unread: "return a.createMemo(b);",
  parameter: "return a(b);",
  itself: "return a ? itself(a - 1) : createMemo(b);",
  serverOnly: "if (isServer) { createMemo(b); } return 1;",
  serverOnlyExpr: "return isServer ? createMemo(b) : 1;",
  clientEarly: "if (isClient) return 1; return createMemo(b);",
  windowEarly: "if (typeof window !== 'undefined') return 1; return createMemo(b);",
  hydratingEarly: "if (globalThis.hydrating) return 1; return createMemo(b);",
  callbackOfHelper: "return helperless(() => createMemo(b));\nfunction helperless(f) { return f; }",
  defaultOnly: "const { m = createMemo(b) } = a; return m;",
};
const GOOD = {
  signal: "const [n, set] = createSignal(0); window.addEventListener('x', () => set(1)); return n;",
  effect: "createEffect(() => a, b);",
  cleanup: "window.addEventListener('x', b); onCleanup(() => window.removeEventListener('x', b));",
  context: "return useContext(C).value;",
  bothBranches: "if (a) { return createMemo(b); } else { return helper(a); }",
  conditionalBoth: "return a ? createMemo(b) : helper(a);",
  guardFirst: "if (isServer || !a.length) return; tryOnCleanup(() => {});",
  beforeReturn: "const n = helper(1); if (a) return; return n;",
  throwsInstead: "if (!a) throw new Error('no'); return createMemo(b);",
  throughHelper: "const { x } = { x: helper(a) }; return x;",
  eitherHelper: "plain(b); return a;",
  inTryBoth: "let x; try { x = createMemo(b); } catch { x = helper(a); } return x;",
  inFinally: "try { a(); } finally { onCleanup(b); }",
  iife: "const x = (() => createMemo(b))(); return x;",
  untracked: "return untrack(() => createMemo(b));",
  notOnServer: "if (isServer) return () => 1; return createMemo(b);",
  onClient: "if (isClient) { createMemo(b); } return 1;",
  noWindow: "if (typeof window === 'undefined') return; onCleanup(b);",
  serverTernary: "return isServer ? a : createMemo(b);",
  outsideToo: "document.title = a; fetch(b); return createMemo(b);",
  conditionalThrown: "tryOnCleanup(() => {}); return a;",
  conditionalHelper: "const h = () => {}; keep(h); return a;\nfunction keep(h) { window.addEventListener('x', h); return tryOnCleanup(() => window.removeEventListener('x', h)); }",
  nestedReturnIsItsOwn: "const f = () => { return 1; }; createMemo(f); return f;",
};
const { create } = require("../src/infer.js");
const facts = (name, body) => { fs.writeFileSync(path.join(ws, `${name}.js`), `${HEAD}export function ${name}(a, b) { ${body} }\n`); return create(ts, { debug: true }).exportFacts(`./${name}.js`, ws, name); };
for (const [name, body] of Object.entries(BAD)) { const f = facts(name, body); ok(`refused: ${name}`, !f.unread && !!f.unbound(), f.unread); }
for (const [name, body] of Object.entries(GOOD)) { const f = facts(name, body); ok(`proven:  ${name}`, !f.unread && !f.unbound(), f.unread ?? JSON.stringify(f.unbound())); }
ok("a generator, an async fn", (() => { fs.writeFileSync(path.join(ws, "gen.js"), `${HEAD}export function* g() { createMemo(() => 1); }\nexport async function h() { createMemo(() => 1); }\n`); const x = create(ts); return !!x.exportFacts("./gen.js", ws, "g").unbound() && !!x.exportFacts("./gen.js", ws, "h").unbound(); })());
ok("`pure` is as strict as it was: what else the call does blocks it", facts("outside2", GOOD.outsideToo).pure === false);
// the draft
fs.writeFileSync(path.join(ws, "kit.js"), `${HEAD}export function watch(a) { const [n, set] = createSignal(0); window.addEventListener("x", () => set(1)); return { get n() { return n(); } }; }\nexport function listenTo(a) { window.addEventListener(a, listenTo); return tryOnCleanup(() => window.removeEventListener(a, listenTo)); }\nexport function shortcut(a) { listenTo(a); }\nexport function undoable(a) { window.x = 1; onCleanup(() => {}); return () => {}; }\nexport function asked(a) { window.x = 1; onCleanup(() => {}); return Promise.resolve(1); }\nexport function Shown(a) { window.x = 1; onCleanup(() => {}); return {}; }\n`);
fs.writeFileSync(path.join(ws, "kit.d.ts"), "export function watch(a: string): { n: number };\nexport function listenTo(a: string): () => void;\nexport function shortcut(a: string): void;\nexport function undoable(a: string): () => void;\nexport function asked(a: string): Promise<number>;\nexport function Shown(a: string): { x: 1 };\n");
const d = spawnSync(process.execPath, ["--conditions=browser", path.join(__dirname, "../bin/declare.js"), "./kit.js"], { cwd: ws, encoding: "utf8" }).stdout;
const row = n => d.split("\n").find(l => new RegExp(`^export .*\\b${n}\\(`).test(l)) ?? "";
ok("the draft: written, with no `pure`", /^export fn watch\(a: string\): \{ n: number;? \} instantiates$/.test(row("watch")) && /^export fn shortcut\(a: string\): void instantiates$/.test(row("shortcut")), d);
ok("...and not beside an undo, a promise or a component's name", ["listenTo", "undoable", "asked", "Shown"].every(n => row(n) && !/instantiates/.test(row(n))), d);
console.log(`${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
