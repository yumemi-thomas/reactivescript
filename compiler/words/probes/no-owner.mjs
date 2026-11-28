// What `instantiates` says, run (DESIGN.md, "What each word costs where it is false"): each fn a hand-written declaration of
// the benchmark marks `instantiates` and the code does not prove, called with NO owner under Solid's development build in a
// DOM. The word says such a call is a mistake (09 MO-8l: it is refused in a handler, an action, an effect's block), and
// Solid's development build is what reports one: a warning, an error, a throw. `silent`: the call is correct there, and the
// word would refuse a correct program. The controls first: what Solid itself reports of each of its own.
//   cd bench/.out/ws && cp ../../../compiler/words/probes/no-owner.mjs ./__no-owner.mjs &&
//     node --max-old-space-size=2000 --conditions=browser --conditions=development __no-owner.mjs; rm __no-owner.mjs
//   (run from the workspace so that the packages resolve as an app's do; --conditions=production shows the other build)
import { GlobalRegistrator } from "@happy-dom/global-registrator";
GlobalRegistrator.register({ url: "http://localhost/" });
const seen = [];
for (const k of ["warn", "error"]) { const was = console[k]; console[k] = (...a) => { seen.push(`${k}: ${a.map(String).join(" ").slice(0, 160)}`); }; }
const { getOwner, createRoot } = await import("solid-js");
const cases = [
  ["@solid-primitives/event-bus", "createEventBus", m => m.createEventBus()],
  ["@solid-primitives/analytics", "createAnalytics", m => m.createAnalytics([])],
  ["@solid-primitives/event-dispatcher", "createEventDispatcher", m => m.createEventDispatcher({})],
  ["@solid-primitives/event-props", "createEventProps", m => m.createEventProps("click")],
  ["@solid-primitives/filesystem", "createFileSystem", m => m.createFileSystem(m.makeVirtualFileSystem({}))],
  ["@solid-primitives/input-mask", "createInputMask", m => m.createInputMask("99-99")],
  ["@solid-primitives/keyboard", "createShortcut", m => m.createShortcut(["A"], () => {})],
  ["@solid-primitives/masonry", "createMasonry", m => m.createMasonry({ source: () => [1, 2], columns: 2, mapHeight: x => x, mapElement: x => x })],
  ["@solid-primitives/resize-observer", "createWindowSize", m => m.createWindowSize()],
  ["@solid-primitives/scheduled", "debounce", m => m.debounce(() => {}, 10)],
  ["@solid-primitives/url", "createURL", m => m.createURL("http://localhost/a")],
  ["@solid-primitives/map", "ReactiveMap (makeMap)", m => new m.ReactiveMap([[1, 2]])],
  ["@solid-primitives/set", "ReactiveSet (makeSet)", m => new m.ReactiveSet([1])],
  ["@solid-primitives/mutable", "createMutable (createCart)", m => m.createMutable({ count: 0 })],
  ["@solid-primitives/flux-store", "createFluxStore (createCounter)", m => m.createFluxStore({ count: 1 }, { getters: s => ({ doubled: () => s.count * 2 }), actions: set => ({ inc: () => set(s => { s.count++; }) }) })],
  ["solid-use/server-value", "useServerValue (useTicket)", m => m.default(() => "x")],
  ["@formisch/solid/v2", "createForm", async m => { const v = await import("valibot"); return m.createForm({ schema: v.object({ a: v.string() }) }); }],
  ["@tanstack/solid-query", "QueryClient (makeClient)", m => new m.QueryClient()],
  ["@wardic/solid", "ward", m => m.ward()],
  ["@tanstack/solid-router", "createRouter", m => m.createRouter({ routeTree: m.createRootRoute() })],
];
if (getOwner()) throw new Error("an owner at the top");
const S = await import("solid-js");
const control = (name, f) => { seen.length = 0; let threw = ""; try { f(); } catch (e) { threw = `threw ${String(e?.message ?? e).slice(0, 100)}`; } console.log(`control   ${name}: ${[...seen.map(x => x.split("\n")[0]), threw].filter(Boolean).join(" | ") || "silent"}`); };
control("createEffect", () => S.createEffect(() => 1, () => {}));
control("createRenderEffect", () => S.createRenderEffect(() => 1, () => {}));
control("onCleanup", () => S.onCleanup(() => {}));
control("useContext of a context with no default", () => S.useContext(S.createContext()));
control("createSignal", () => S.createSignal(1));
control("createMemo", () => S.createMemo(() => 1));
control("createStore", () => S.createStore({}));
control("onSettled", () => S.onSettled(() => {}));
for (const [spec, name, run] of cases) {
  seen.length = 0; let threw = "";
  try { const m = await import(spec); await run(m); } catch (e) { threw = `threw ${String(e?.message ?? e).slice(0, 140)}`; }
  await new Promise(r => setTimeout(r, 5));
  const all = [...seen, ...(threw ? [threw] : [])];
  console.log(`${all.length ? "REPORTED " : "silent   "} ${spec} ${name}${all.length ? `\n            ${all.slice(0, 2).join("\n            ")}` : ""}`);
}
process.exit(0);
