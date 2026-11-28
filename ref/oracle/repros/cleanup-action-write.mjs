// A render effect over a memo misses a change after a shown part's effect cleanup called an action. Plain Solid, no
// ReactiveScript code. Found by examples/rx-packages' Kobalte popover (its Title registers with the dialog in an
// effect and unregisters in the effect's cleanup), reduced from the compiled module of the same shape.
//   node --conditions=browser --conditions=development repros/cleanup-action-write.mjs [action|plain]
// `open` is a signal an action sets; `now` a memo of it; `rec` a memo of { open: now(), title }. The trigger renders
// memo(() => rec()).open. While `now` is true, solid-js <Show> shows a part that makes a memo of rec (unread) and an
// effect whose cleanup writes `title` — through an action (`action`) or plainly (`plain`).
// Expected after each set: T, F, T, F.
import { createComponent, Show } from "solid-js";
import { createRoot, createRenderEffect, createEffect, createMemo, createSignal, action, untrack, flush } from "@solidjs/signals";
const how = process.argv[2] ?? "action";
const tick = async () => { for (let i = 0; i < 3; i++) { await new Promise(r => setTimeout(r, 0)); flush(); } };
let trigger = "", set;
createRoot(() => {
  const [title, setTitle] = createSignal(undefined);
  const name = how === "action" ? action(function* (v) { setTitle(v); }) : v => setTitle(v);
  const [open, setOpen] = createSignal(false);
  set = action(function* (v) { if (v !== untrack(now)) setOpen(v); });
  const now = createMemo(() => open());
  const rec = createMemo(() => ({ open: now(), title: title() }));
  function Trigger() { const c = createMemo(() => rec()); createRenderEffect(() => c().open ? "T" : "F", v => { trigger = v; }); return "b"; }
  function Part() { createMemo(() => rec()); createEffect(() => "t", { effect: () => () => { name(undefined); } }); return "i"; }
  const view = [createComponent(Trigger, {}), createComponent(Show, { get when() { return now(); }, fallback: null, children: () => createComponent(Part, {}) })];
  createRenderEffect(() => { const walk = x => typeof x === "function" ? walk(x()) : Array.isArray(x) ? x.map(walk) : x; return walk(view); }, () => {});
});
flush(); await tick();
const out = [`mount ${trigger}`];
for (const v of [true, false, true, false]) { set(v); flush(); await tick(); out.push(`set(${v}) ${trigger}`); }
console.log(how.padEnd(7), out.join(" | "), "  (expected F | T | F | T | F)");
