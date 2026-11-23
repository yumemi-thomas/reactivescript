// MO-8w: what `rx-declare` reads from JSX and from Solid's contexts (src/infer.js) — `handler` on a prop that reaches
// an element's event, `uses(c)`, `provides(c)` — and from a value made by a call (the function its factory hands
// back). The suite is adversarial, as test/infer.js is: each dishonest function does one thing the word must not
// cover, as code hides it, and must be refused with a reason that names the thing; its honest twin must be proven.
// Then the audit (src/declare-audit.js): every word a declaration has, sorted into proven, contradicted and
// unproven; the draft, which says which words it read in one line and not one a row; and rx-verify, which tells the
// words the code proves from the ones written by hand without a mark in the file.
//   node test/infer-view.js            VERBOSE=1 prints the drafts
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const repo = path.resolve(__dirname, "../../..");
const ws = path.join(__dirname, "../.test/infer-view");
fs.rmSync(ws, { recursive: true, force: true });
fs.mkdirSync(path.join(ws, "node_modules/kit"), { recursive: true });
for (const d of fs.readdirSync(path.join(repo, "ref/node_modules"))) fs.symlinkSync(path.join(repo, "ref/node_modules", d), path.join(ws, "node_modules", d), "dir");
fs.writeFileSync(path.join(ws, "package.json"), JSON.stringify({ type: "module" }));
// a package that ships no ES module: code that is not read
fs.writeFileSync(path.join(ws, "node_modules/kit/package.json"), JSON.stringify({ name: "kit", version: "1.0.0", type: "module", exports: { ".": { types: "./index.d.ts", default: "./index.cjs" } } }));
fs.writeFileSync(path.join(ws, "node_modules/kit/index.cjs"), "exports.mystery = x => x; exports.Mystery = p => null; exports.Theirs = { id: Symbol() };\n");
fs.writeFileSync(path.join(ws, "node_modules/kit/index.d.ts"), "export declare function mystery(x: any): any;\nexport declare function Mystery(p: any): any;\nexport declare const Theirs: any;\n");

let pass = 0, fail = 0;
const ok = (name, cond, detail) => { if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}${detail !== undefined ? `\n      ${String(detail).slice(0, 900)}` : ""}`); } };
const { create } = require("../src/infer.js");
const SOLID = "import { createContext, useContext, createComponent, createMemo, createEffect, createSignal, untrack, omit, merge, children, Show } from \"solid-js\";\nimport { dynamic } from \"@solidjs/web\";\nimport { mystery, Mystery, Theirs } from \"kit\";\n";
const facts = (name, code, types) => { const file = path.join(ws, `${name}.jsx`); fs.writeFileSync(file, SOLID + code + "\n"); return create(ts, { debug: true }).exportFacts(`./${name}.jsx`, ws, name, types); };

// ---- handler: a prop that reaches an element's event ----  each: [code, parameter index, field, what the reason must say]
const HANDLER_GOOD = {
  ElementEvent: ["export const ElementEvent = props => <button onClick={props.onPress}>{props.children}</button>;", 0, "onPress"],
  InlineListener: ["export const InlineListener = props => <button onClick={e => props.onPress(e.detail)}>go</button>;", 0, "onPress"],
  BoundWithData: ["export const BoundWithData = props => <li onClick={[props.onPick, props.id]}>{props.label}</li>;", 0, "onPick"],
  SpreadOnElement: ["export const SpreadOnElement = props => { const rest = omit(props, \"label\"); return <button {...rest}>{props.label}</button>; };", 0, "onClick"],
  MergedDefaults: ["export const MergedDefaults = props => { const p = merge({ type: \"button\" }, props); return <button type={p.type} onClick={p.onPress} />; };", 0, "onPress"],
  ThroughOwnComponent: ["const Inner = p => <button onClick={p.onGo}>{p.children}</button>;\nexport const ThroughOwnComponent = props => <Inner onGo={props.onPress}>x</Inner>;", 0, "onPress"],
  SpreadThroughOwn: ["const Inner = p => <button onClick={p.onGo}>{p.children}</button>;\nexport const SpreadThroughOwn = props => <Inner {...props} />;", 0, "onGo"],
  ClosureToOwn: ["const Inner = p => <button onClick={p.onGo}>x</button>;\nexport const ClosureToOwn = props => <Inner onGo={() => props.onPress(1)} />;", 0, "onPress"],
  SpreadCopy: ["export const SpreadCopy = props => { const p = { ...props, role: \"button\" }; return <div onKeyDown={p.onKey} />; };", 0, "onKey"],
  entriesListeners: ["export function entriesListeners(el, handlers) { for (const [name, h] of Object.entries(handlers)) el.addEventListener(name, h); }", 1, "play"],
  keysListeners: ["const keys = Object.keys;\nexport function keysListeners(el, props) { keys(props).forEach(k => { if (k.startsWith(\"on\") && typeof props[k] === \"function\") el.addEventListener(k.slice(2).toLowerCase(), props[k]); }); }", 1, "onResize"],
  valuesListeners: ["export function valuesListeners(el, handlers) { Object.values(handlers).filter(Boolean).forEach(h => el.addEventListener(\"x\", h)); }", 1, "any"],
  MadeByFactory: ["const scoped = render => props => createMemo(() => untrack(() => render(props)));\nexport const MadeByFactory = scoped(function Made(props) { return <button onClick={props.onPress}>x</button>; });", 0, "onPress"],
};
const HANDLER_BAD = {
  CalledInRender: ["export const CalledInRender = props => { props.onPress(); return <button>x</button>; };", 0, "onPress", /while the call runs/],
  CalledInAttribute: ["export const CalledInAttribute = props => <div title={props.label()}>x</div>;", 0, "label", /while the call runs/],
  RenderedAsChild: ["export const RenderedAsChild = props => <div>{props.render()}</div>;", 0, "render", /while the call runs/],
  SpreadChildren: ["export const SpreadChildren = props => <div {...props} />;", 0, "children", /renders its children/],
  OwnComponentCallsNow: ["const Inner = p => { p.onGo(); return <button>x</button>; };\nexport const OwnComponentCallsNow = props => <Inner onGo={props.onPress} />;", 0, "onPress", /while the call runs/],
  GivenToForeign: ["export const GivenToForeign = props => <Mystery onPress={props.onPress} />;", 0, "onPress", /given to <Mystery>/],
  SpreadOnForeign: ["export const SpreadOnForeign = props => <Mystery {...props} />;", 0, "onPress", /spread on <Mystery>, which is not read/],
  DynamicTag: ["export const DynamicTag = props => { const Tag = dynamic(() => props.as); const rest = omit(props, \"as\"); return <Tag {...rest} />; };", 0, "onClick", /not read/],
  NotAnEvent: ["export const NotAnEvent = props => <button action={props.action}>x</button>;", 0, "action", /given to <button> as action/],
  OmittedFirst: ["export const OmittedFirst = props => { const rest = omit(props, \"onPress\"); return <button {...rest}>x</button>; };", 0, "onPress", /never called/],
  OverriddenInCopy: ["export const OverriddenInCopy = props => { const p = { ...props, onKey: undefined }; return <div onKeyDown={p.onKey} />; };", 0, "onKey", /never called/],
  KeptInSignal: ["export const KeptInSignal = props => { const [h] = createSignal(props.onPress); return <button onClick={() => h()()}>x</button>; };", 0, "onPress", /given to createSignal/],
  valuesCalledNow: ["export function valuesCalledNow(handlers) { Object.values(handlers).forEach(h => h()); }", 0, "any", /while the call runs/],
  entriesHandedBack: ["export function entriesHandedBack(handlers) { return Object.entries(handlers).filter(([k]) => k !== \"x\"); }", 0, "any", /not followed/],
  computedReadCalled: ["export function computedReadCalled(el, props, k) { props[k](); el.addEventListener(\"x\", props.onX); }", 1, "onX", /while the call runs/],
  FactoryCallsNow: ["const scoped = render => props => createMemo(() => untrack(() => render(props)));\nexport const FactoryCallsNow = scoped(function Made(props) { props.onPress(); return <button onClick={props.onPress}>x</button>; });", 0, "onPress", /in a computation|while the call runs/],
  FactoryNotFollowed: ["export const FactoryNotFollowed = mystery(function Made(props) { return <button onClick={props.onPress}>x</button>; });", 0, "onPress", /UNREAD/],
};
console.log("handler: a prop that reaches only an element's event — through spreads, omit, merge, the module's own components, a factory");
for (const [name, [code, index, field]] of Object.entries(HANDLER_GOOD)) { const f = facts(name, code); const h = f.unread ? undefined : f.handler(index, field); ok(`${name}: handler(${field})`, !!h && h.ok === true, h ? (h.never ? "never called" : h.uses.map(u => `${u.how}: ${u.why}`).join(" | ")) : f.unread); }
console.log("handler: the dishonest twins — called while it renders, rendered, given where the code is not read");
for (const [name, [code, index, field, says]] of Object.entries(HANDLER_BAD)) { const f = facts(name, code); const h = f.unread ? undefined : f.handler(index, field); const said = h ? (h.never ? "never called" : h.uses.filter(u => u.how !== "later").map(u => `${u.how}: ${u.why}`).join(" | ")) : `UNREAD ${f.unread}`; ok(`${name}: no handler`, (!h || h.ok === false) && says.test(said), h?.ok ? "PROVEN A HANDLER" : said); }

// ---- uses(c): a context read on every path, with no default to answer ----
const CTX = "const Ctx = createContext();\nconst Soft = createContext(null);\nconst Dflt = createContext({ n: 1 });\n";
const USES_GOOD = {
  useDirect: "export const useDirect = () => useContext(Ctx);",
  useChecked: "export function useChecked() { const c = useContext(Soft); if (!c) throw new Error(\"outside\"); return c; }",
  useCheckedNull: "export function useCheckedNull() { const c = useContext(Soft); if (c === null) { throw new Error(\"outside\"); } return c; }",
  useThroughHook: "const useInner = () => { const c = useContext(Ctx); return c; };\nexport function useThroughHook() { const c = useInner(); return c.n; }",
  useInArgument: "const pick = c => c;\nexport function useInArgument() { return pick(useContext(Ctx)); }",
  ReadsInBody: "export function ReadsInBody(props) { const c = useContext(Ctx); return <p>{props.children}</p>; }",
  RendersAReader: "function Part(props) { const c = useContext(Ctx); return <p>{props.children}</p>; }\nexport function RendersAReader(props) { return <Part>{props.children}</Part>; }",
  useMade: "const made = f => () => f();\nexport const useMade = made(() => useContext(Ctx));",
  useInMemo: "export function useInMemo() { return createMemo(() => useContext(Ctx)); }",
  useUntracked: "export function useUntracked() { return untrack(() => useContext(Ctx)); }",
};
const USES_BAD = {   // name: [code, what it is: "may" | "none" | "opaque", what the reason must say]
  useOnAProp: ["export function useOnAProp(opts) { return opts.strict ? useContext(Ctx) : undefined; }", "may"],
  useAfterReturn: ["export function useAfterReturn(flag) { if (flag) return 1; return useContext(Ctx); }", "may"],
  useInBranch: ["export function useInBranch(flag) { let c; if (flag) { c = useContext(Ctx); } return c; }", "may"],
  useShortCircuit: ["export function useShortCircuit(flag) { return flag && useContext(Ctx); }", "may"],
  useCaught: ["export function useCaught() { try { return useContext(Ctx); } catch { return null; } }", "may"],
  useLazily: ["export function useLazily() { return () => useContext(Ctx); }", "may"],
  useInLazyMemo: ["export function useInLazyMemo() { return createMemo(() => useContext(Ctx), { lazy: true }); }", "may"],
  useInEffect: ["export function useInEffect() { createEffect(() => useContext(Ctx), () => {}); }", "may"],
  useOptionalCall: ["export function useOptionalCall(opts) { return opts.with?.(useContext(Ctx)); }", "may"],
  UnderShow: ["function Part() { const c = useContext(Ctx); return <p>x</p>; }\nexport function UnderShow(props) { return <Show when={props.on}><Part /></Show>; }", "may"],
  useDefaulted: ["export function useDefaulted() { return useContext(Dflt).n; }", "none"],
  useNullUnchecked: ["export function useNullUnchecked() { return useContext(Soft); }", "none"],
  useNullCheckedLate: ["export function useNullCheckedLate(flag) { const c = useContext(Soft); if (flag) return 0; if (!c) throw new Error(\"outside\"); return c; }", "none"],
  ReadsBeneathItsOwn: ["function Part() { const c = useContext(Ctx); return <p>x</p>; }\nexport function ReadsBeneathItsOwn(props) { return <Ctx value={1}><Part /></Ctx>; }", "none"],
  useTheirs: ["export function useTheirs() { return useContext(Theirs); }", "opaque", /does not show to be one the module makes/],
  useComputed: ["const table = new Map();\nexport function useComputed(key) { return useContext(table.get(key)); }", "opaque", /does not show to be one the module makes/],
  useUnreadHook: ["export function useUnreadHook() { return mystery(); }", "opaque", /mystery, of kit: code that is not read/],
  useValueMethod: ["export function useValueMethod() { const c = useContext(Ctx); return c.router.current(); }", "must+opaque", /holds a context's value/],
  RendersForeign: ["export function RendersForeign(props) { return <Mystery>{props.children}</Mystery>; }", "opaque", /it renders Mystery, of kit/],
  useUnderAnotherOwner: ["import { runWithOwner, getOwner } from \"solid-js\";\nconst owner = getOwner();\nexport function useUnderAnotherOwner() { return runWithOwner(owner, () => useContext(Ctx)); }", "opaque", /under another owner \(runWithOwner\)/],
};
console.log("uses: `useContext(C)` on every path of the call, where nothing answers without a provider");
for (const [name, code] of Object.entries(USES_GOOD)) { const f = facts(name, CTX + code); const u = f.unread ? undefined : f.uses; ok(`${name}: uses`, !!u && u.must.length === 1 && !u.may.length && !u.opaque.length, u ? `must ${u.must.map(c => c.name)} may ${u.may.map(c => c.name)} opaque ${u.opaque.map(o => o.why)}` : f.unread); }
console.log("uses: the dishonest twins — on one path only, later, a context with a default, one that is not the module's");
for (const [name, [code, what, says]] of Object.entries(USES_BAD)) {
  const f = facts(name, CTX + code); const u = f.unread ? undefined : f.uses;
  const got = !u ? "unread" : `${u.must.length ? "must" : ""}${u.must.length && u.opaque.length ? "+" : ""}${u.opaque.length ? "opaque" : !u.must.length ? (u.may.length ? "may" : "none") : ""}`;
  ok(`${name}: ${what === "may" ? "not on every path: no word, and the question stays" : what === "none" ? "it needs no context: no word, and no question" : "code that is not read: the question stays"}`, got === what && (!says || says.test(u.opaque.map(o => o.why).join(" | "))), u ? `${got}: must ${u.must.map(c => c.name)} may ${u.may.map(c => c.name)} opaque ${u.opaque.map(o => o.why)}` : f.unread);
}

// ---- provides(c): a provider around everything the component is given ----
const viewFields = new Set(["children", "title", "fallback"]);
const views = { outside: o => o.field !== null ? viewFields.has(o.field) : !o.except || [...viewFields].some(n => !o.except.includes(n)) };
const provided = f => f.provides(0).list.filter(x => x.inside.length && !x.outside.some(o => views.outside(o)));
const PROVIDES_GOOD = {
  Around: "export function Around(props) { return <Ctx value={props.value}>{props.children}</Ctx>; }",
  AroundJs: "export function AroundJs(props) { return createComponent(Ctx, { value: props.value, get children() { return props.children; } }); }",
  AroundMarkup: "export function AroundMarkup(props) { return <Ctx value={1}><section><header>{props.title}</header>{props.children}</section></Ctx>; }",
  SpreadInside: "export function SpreadInside(props) { const rest = omit(props, \"value\"); return <Ctx value={props.value}><div {...rest} /></Ctx>; }",
  OmittedGoesElsewhere: "export function OmittedGoesElsewhere(props) { const options = omit(props, \"children\", \"title\", \"fallback\"); const state = mystery({ ...options }); return <Ctx value={state}>{props.children}</Ctx>; }",
  ValueFromAFunction: "const make = p => { const [n] = createSignal(p.initial); return { n }; };\nexport function ValueFromAFunction(props) { return <Ctx value={make(props)}>{props.children}</Ctx>; }",
  Delegated: "const scoped = render => props => createMemo(() => untrack(() => render(props)));\nexport const Delegated = scoped(function Root(props) { return <Ctx value={props.value}>{props.children}</Ctx>; });",
  ThroughOwnComponent: "function Shell(p) { return <Ctx value={1}><div>{p.children}</div></Ctx>; }\nexport function ThroughOwnComponent(props) { return <Shell {...props} />; }",
};
const PROVIDES_BAD = {   // name: [code, what the reason must say]
  Beside: ["export function Beside(props) { return <><Ctx value={1}><p>header</p></Ctx>{props.children}</>; }", /children is read/],
  ReadBefore: ["export function ReadBefore(props) { const kids = props.children; return <Ctx value={1}>{kids}</Ctx>; }", /children is read/],
  Destructured: ["export function Destructured({ children, value }) { return <Ctx value={value}>{children}</Ctx>; }", /taken out of the record/],
  ResolvedOutside: ["export function ResolvedOutside(props) { const kids = children(() => props.children); return <Ctx value={1}>{kids()}</Ctx>; }", /children is read/],
  OneBranchWithout: ["export function OneBranchWithout(props) { return props.bare ? props.children : <Ctx value={1}>{props.children}</Ctx>; }", /children is read/],
  AnotherPropOutside: ["export function AnotherPropOutside(props) { return <><header>{props.title}</header><Ctx value={1}>{props.children}</Ctx></>; }", /title is read/],
  WholeToUnread: ["export function WholeToUnread(props) { mystery(props); return <Ctx value={1}>{props.children}</Ctx>; }", /given to code that is not read/],
  SpreadOutside: ["export function SpreadOutside(props) { return <><div {...props} /><Ctx value={1}><p>x</p></Ctx></>; }", /spread on <div>/],
  OmittedNotEnough: ["export function OmittedNotEnough(props) { const options = omit(props, \"children\"); const state = mystery({ ...options }); return <Ctx value={state}>{props.children}</Ctx>; }", /handed on/],
  ComputedRead: ["export function ComputedRead(props) { const k = props.slot; const v = props[k]; return <Ctx value={1}>{props.children}{v}</Ctx>; }", /computed name/],
};
console.log("provides: every prop that may hold a view is rendered among the provider's children");
for (const [name, code] of Object.entries(PROVIDES_GOOD)) { const f = facts(name, CTX + code); const p = f.unread ? undefined : provided(f); ok(`${name}: provides`, !!p && p.length === 1, f.unread ?? JSON.stringify(f.provides(0).list.map(x => ({ in: x.inside.map(o => o.field), out: x.outside.map(o => `${o.field}: ${o.why}`) })))); }
console.log("provides: the dishonest twins — a provider around something else, children made before it, a view prop beside it");
for (const [name, [code, says]] of Object.entries(PROVIDES_BAD)) { const f = facts(name, CTX + code); const p = f.unread ? undefined : provided(f); const why = f.unread ?? f.provides(0).list.flatMap(x => x.outside.filter(o => views.outside(o)).map(o => o.why)).join(" | "); ok(`${name}: no provides`, !!p && p.length === 0 && says.test(why), p?.length ? "PROVEN A PROVIDER" : why); }
{
  const f = facts("NoProvider", CTX + "export function NoProvider(props) { return <section>{props.children}</section>; }");
  ok("a component that renders no provider, and nothing that is not read: it provides nothing, and the question goes", f.provides(0).list.length === 0 && f.provides(0).clean === true);
  const g = facts("MaybeProvider", CTX + "export function MaybeProvider(props) { return <Mystery>{props.children}</Mystery>; }");
  ok("…one that renders a component that is not read: not shown, and the question stays", g.provides(0).clean === false);
}

// ---- a value made by a call: the function its factory hands back ----
const MADE_GOOD = {
  named: "const NAMES = new WeakMap();\nfunction name(f, n) { NAMES.set(f, n); return f; }\nconst line = (a, b) => t => a * t + b;\nexport const named = name(line(2, 1), \"line\");",
  mirrored: "const line = (a, b) => t => a * t + b;\nconst mirror = ease => t => t <= 0.5 ? ease(2 * t) / 2 : (2 - ease(2 * (1 - t))) / 2;\nexport const mirrored = mirror(line(1, 0));",
  composed: "const compose = (f, g) => x => f(g(x));\nconst inc = x => x + 1;\nexport const composed = compose(compose(inc, inc), x => x * 2);",
  fromTuple: "const pair = init => { const get = () => init; const twice = () => init * 2; return [get, twice]; };\nconst [first, fromTupleFn] = pair(2);\nexport const fromTuple = fromTupleFn;",
  fromRecord: "const kit = { twice: x => x * 2 };\nconst { twice } = kit;\nexport const fromRecord = twice;",
  withConstant: "const UNITS = { px: 1 };\nconst scale = unit => n => n * UNITS[unit];\nexport const withConstant = scale(\"px\");",
};
const MADE_BAD = {   // name: [code, what the reason must say]
  counter: ["const count = () => { let n = 0; return () => ++n; };\nexport const counter = count();", /assigns n, a variable of the function around it/],
  memoized: ["const memo = f => { const cache = new Map(); return k => { if (!cache.has(k)) cache.set(k, f(k)); return cache.get(k); }; };\nexport const memoized = memo(k => k * 2);", /cache/],
  tableAtLoad: ["const table = n => { const xs = []; for (let i = 0; i < n; i++) xs.push(i); return i => xs[i]; };\nexport const tableAtLoad = table(4);", /a value the function that made it holds/],
  sharedRecord: ["const read = cfg => () => cfg.n;\nexport const sharedRecord = read({ n: 1 });", /a value the function that made it holds/],
  reassigned: ["const pick = (a, b) => { let impl = a; const swap = () => { impl = b; }; setTimeout(swap, 0); return x => impl(x); };\nexport const reassigned = pick(x => x, x => -x);", /impl/],
  clockInArgument: ["const wrap = f => x => f(x);\nexport const clockInArgument = wrap(x => x + Date.now());", /clock/],
  oneOfTwo: ["const choose = flag => flag ? (x => x) : (x => -x);\nexport const oneOfTwo = choose(globalThis.flip);", /UNREAD/],
  unreadFactory: ["export const unreadFactory = mystery(x => x);", /UNREAD/],
  spreadArguments: ["const wrap = f => x => f(x);\nconst args = [x => x];\nexport const spreadArguments = wrap(...args);", /UNREAD/],
};
console.log("a value made by a call: the function its factory hands back, with the factory's parameters standing for its arguments");
for (const [name, code] of Object.entries(MADE_GOOD)) { const f = facts(name, code); ok(`${name}: pure`, f.pure === true, f.unread ?? f.why.map(w => w.why).join(" | ")); }
console.log("…and the dishonest twins: state its calls share, a factory that is not followed");
for (const [name, [code, says]] of Object.entries(MADE_BAD)) { const f = facts(name, code); const said = f.unread ? `UNREAD ${f.unread}` : f.why.map(w => w.why).join(" | "); ok(`${name}: not pure`, !f.pure && says.test(said), f.pure ? "PROVEN PURE" : said); }
{
  const f = facts("later", "const on = (type, cb) => el => { el.addEventListener(type, cb); };\nexport const later = (el, run) => on(\"x\", run)(el);");
  ok("a callback given to a function a factory made: when that function calls it", f.handler(1).ok === true, JSON.stringify(f.handler(1).uses));
  const g = facts("stores", "export function stores(make) { return createSignal(0); }\nexport const fromSolid = createMemo;");
  ok("a result that is a store Solid makes from a function is not shown to be built there", !!facts("projected", "import { createStore } from \"solid-js\";\nexport function projected(load) { const [s] = createStore(load, {}); return s; }").plainWhy);
  void g;
  ok("…and a record whose getter only reads a signal made there is", facts("counted", "export function counted() { const [n, setN] = createSignal(0); return { get n() { return n(); }, bump: () => setN(x => x + 1) }; }").plain === true, JSON.stringify(facts("counted", "export function counted() { const [n, setN] = createSignal(0); return { get n() { return n(); }, bump: () => setN(x => x + 1) }; }").plainWhy));
  ok("…one whose getter calls what it was given is not", facts("lazyRecord", "export function lazyRecord(load) { return { get data() { return load(); } }; }").plain === false);
}

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
ok("a hook that reads it: uses(tabs), and its question is not asked", /^export pure fn useTabs\(\): .* uses\(tabs\)$/.test(rowOf("useTabs")) && !/TODO useTabs: which context/.test(draft), rowOf("useTabs"));
ok("a hook that reads a context no row provides: no word — it would refuse every program — and the question stays", !/uses\(/.test(rowOf("useLoose")) && /TODO useLoose: which context does this hook read/.test(draft) && /useLoose: uses not proven — it reads Loose on every path, and no component of this module is shown to provide it/.test(r.stderr), rowOf("useLoose") + r.stderr);
ok("a hook that reads none: no word, and no question", !/uses\(/.test(rowOf("useNothing")) && !/TODO useNothing: which context/.test(draft), rowOf("useNothing"));
ok("a hook that reads one on a path only: no word, and the question stays", !/uses\(/.test(rowOf("useSometimes")) && /TODO useSometimes: which context/.test(draft), rowOf("useSometimes"));
ok("a provider around something other than its children: no provides", /^export component Sidebar\(/.test(rowOf("Sidebar")) && !/provides\(/.test(rowOf("Sidebar")), rowOf("Sidebar"));
ok("a component named …Provider that renders none: the question is answered, no", !/TODO PlainProvider/.test(draft) && !/provides\(/.test(rowOf("PlainProvider")), draft);
ok("the draft says once which words it read, and no row has a line above it", /^\/\/ Read from the code that runs \(MO-8v\): .*2 uses, 1 provides/m.test(draft) && !/\/\/@ inferred/.test(draft), draft.split("\n")[1]);
{
  const said = JSON.parse(fs.readFileSync(path.join(ws, "tabs.causes.json"), "utf8")).inferred ?? {};
  ok("--causes says which, export by export (what the benchmark counts)", JSON.stringify(said.Tabs) === JSON.stringify(["provides(tabs)"]) && JSON.stringify(said.Tab) === JSON.stringify(["handler(onSelect)", "uses(tabs)"]), JSON.stringify(said));
  ok("--why says each: proven with what shows it, refused with the first thing in the way", /Tabs: provides\(tabs\) proven — everything it is given is rendered among <TabsContext value>'s children \[tabs\.jsx:\d+\]/.test(r.stderr) && /Sidebar: provides\(TabsContext\) not proven — children is read outside the provider/.test(r.stderr) && /useSometimes: uses not proven — it reads TabsContext on some path only/.test(r.stderr), r.stderr);
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
  ok("a component called in a computation the fn makes: rendered where the fn is called — no word, and no question", !/TODO resolveNow: `view` is given a component/.test(d.stdout) && /resolveNow: renders not proven — view: called while the fn runs, or in a computation it makes there/.test(d.stderr), d.stdout + d.stderr);
  ok("a component kept in the module's state for a host to render: no `renders(Host)` is written — another export hands the same list out — and the question stays", /TODO showLater: `view` is given a component: where does the library render it/.test(d.stdout) && !/renders\(/.test(d.stdout.replace(/\/\/.*$/gm, "")), d.stdout);
  ok("a component rendered outside the host too (kept, and called where the fn runs): the question stays", /TODO showBoth: `view` is given a component/.test(d.stdout), d.stdout);
}

// ---- --run: a field seen to wait or to throw is said; none seen is no proof ----
console.log("rx-declare --run: a field of a result that waits or throws where it is read is named; one that was not seen to is still asked about");
fs.writeFileSync(path.join(ws, "late.js"), [
  "class NotReadyError extends Error { constructor() { super(\"not ready\"); this.name = \"NotReadyError\"; } }",
  "export function makeLate() { return { get data() { throw new NotReadyError(); }, get broken() { throw new Error(\"no\"); }, ready: 1 }; }",
  "export function makeQuiet(load) { return { get data() { return load?.(); } }; }",
  "export function makePlain() { return { data: \"x\" }; }",
  "",
].join("\n"));
fs.writeFileSync(path.join(ws, "late.d.ts"), [
  "export interface Late { data: string; broken: string; ready: number }",
  "export interface Quiet { data: string | undefined }",
  "export declare function makeLate(): Late;",
  "export declare function makeQuiet(load?: () => string): Quiet;",
  "export declare function makePlain(): Quiet;",
  "",
].join("\n"));
{
  const plain = declare("./late.js").stdout;
  ok("the draft asks of a result whose getter may wait or throw, and not of one built there", /TODO makeLate: is the result a store with fields that wait or throw/.test(plain) && /TODO makeQuiet: is the result a store with fields that wait or throw/.test(plain) && !/TODO makePlain: is the result/.test(plain), plain);
  const ran = declare("./late.js", "--run").stdout;
  ok("--run: the fields seen to wait and to throw are named in the question", /TODO makeLate: run with no arguments, its field `data` waits where it is read \(Solid's NotReadyError\), and its field `broken` throws where it is read/.test(ran), ran);
  ok("--run: a field that was not seen to wait is no proof that it never does: the question stays as it was", /TODO makeQuiet: is the result a store with fields that wait or throw/.test(ran), ran);
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
  "export function onLater(el, cb) { el.addEventListener(\"x\", cb); }",
  "export function onNow(el, cb) { cb(); el.addEventListener(\"x\", cb); }",
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
  is("sortedInPlace", "pure", "contradicted", /it changes its argument `list` in place \(\.sort\(\)\) \[lib\.js:7\]/);
  is("loads", "pure", "unproven", /mystery/);
  is("onLater", "handler(cb)", "proven");
  is("onNow", "handler(cb)", "contradicted", /called while the call runs/);
  is("onUnknown", "handler(cb)", "unproven", /not followed/);
  is("moves", "draft(list)", "proven");
  is("reads", "draft(list)", "contradicted", /never changed/);
  is("finds", "rejects(NotFound)", "proven");
  is("findsOther", "rejects(NotFound)", "contradicted", /it throws Stale, which the row does not name/);
  is("useIt", "uses(it)", "proven");
  is("useNone", "uses(it)", "contradicted", /none asks for a context/);
  is("Gives", "provides(it)", "proven");
  is("GivesBeside", "provides(it)", "contradicted", /children is read outside the provider/);
  // what is contradicted is what the code shows the opposite of — not what the reading merely does not follow
  is("GivesAFunction", "provides(it)", "unproven", /children is read outside the provider.*a function\) is called only among the provider's children/);
  is("patches", "pure", "unproven", /it changes its argument `ws` in place.*an object with methods of its own, not data/);
  is("useOwnScope", "uses(scope)", "unproven", /none reads a context Solid makes: if the library keeps a scope of its own/);
  ok("rx-declare --audit exits 1 where a word is contradicted", a.status === 1, String(a.status));
  const text = declare("--audit", "lib.d.rx").stdout;
  ok("…and lists what is not proven, with what to check", /lib\.d\.rx:5: sortedInPlace: pure CONTRADICTED/.test(text) && /lib\.d\.rx:6: loads: pure unproven — it calls mystery/.test(text) && /lib\.d\.rx: 10 words read from the code, 6 contradicted by it, 5 it neither shows nor refutes/.test(text), text);
}

// ---- rx-verify ----
console.log("rx-verify tells the words the code proves from the ones written by hand, and runs each");
{
  fs.writeFileSync(path.join(ws, "lib.probe.mjs"), "let last;\nexport const probes = { sortedCopy: { args: () => [() => [3, 1, 2]] }, onLater: { args: () => [(last = new EventTarget()), () => {}], act: () => last.dispatchEvent(new Event(\"x\")) }, finds: { args: () => [\"1\"], fail: () => [\"\"] } };\n");
  const v = spawnSync(process.execPath, ["--conditions=browser", path.join(__dirname, "../bin/verify.js"), "lib.d.rx"], { cwd: ws, encoding: "utf8" });
  const said = v.stdout + v.stderr; if (process.env.VERBOSE) console.log(said);
  ok("a word the code contradicts is a mismatch, with what the code does", /MISMATCH\s+sortedInPlace: pure is contradicted by the code: it changes its argument `list` in place/.test(said) && /MISMATCH\s+onNow: handler\(cb\) is contradicted by the code/.test(said) && v.status === 1, said.slice(0, 1500));
  ok("a `pure` the code proves is run against what the reading claims, with no mark in the file", /sortedCopy: pure is proven by the code \(it only computes[^)]*\), and no run contradicts it/.test(said), said.split("\n").filter(l => /sortedCopy/.test(l)).join("\n"));
  ok("…a `handler` and a `rejects(E)` too", /onLater: callback cb holds/.test(said) && /finds: under the probe's failing arguments it rejects with NotFound, as its row says/.test(said), said.split("\n").filter(l => /onLater|finds:/.test(l)).join("\n"));
  ok("…and the file's words are counted", /words: 10 read from the code .* 6 contradicted by it, 5 it neither shows nor refutes/.test(said), said.split("\n").filter(l => /words:/.test(l)).join("\n"));
  // (a module that ships JSX is run compiled, by the project's Solid compiler — a native addon: where it is not built,
  // the draft is not run here, and says so)
  let compiles = false; try { compiles = typeof require(require.resolve("@solidjs/compiler", { paths: [ws] })).transform("const a = <p>x</p>;", { filename: "a.jsx" }).code === "string"; } catch { compiles = false; }
  const draftRun = compiles ? spawnSync(process.execPath, ["--conditions=browser", path.join(__dirname, "../bin/verify.js"), "tabs.d.rx"], { cwd: ws, encoding: "utf8" }) : { stdout: "" };
  if (!compiles) { pass++; console.log("  ✓ (the draft of a JSX module is not run here: @solidjs/compiler is not built in this checkout)"); }
  else ok("the draft of a module, run: no word it read is contradicted (its components need a page to mount: --dom)", !/MISMATCH.*(read from|contradicted by the code)/.test(draftRun.stdout) && /useTabs: uses\(tabs\) (holds: with no provider it fails|is proven by the code)/.test(draftRun.stdout) && /words: \d+ read from the code\s*, 0 contradicted/.test(draftRun.stdout.replace(/\([^)]*\)/g, "")), draftRun.stdout + draftRun.stderr);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
