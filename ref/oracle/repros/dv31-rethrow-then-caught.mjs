// DV-31: a boundary that took a failure rethrown by an inner boundary's fallback does not leave its fallback when the
// failure changes, after a pending answer, to one the inner boundary takes (found by compiler/test/server-fns.mjs: a
// typed boundary, R-f-4; scenarios/S-fail-10). Plain Solid (@solidjs/signals, solid-js), no ReactiveScript code.
//   node --conditions=browser --conditions=development repros/dv31-rethrow-then-caught.mjs [sync|async] [later] [component] [derived] [typed] [three] [effect] [own]
// STUCK exactly with `async own effect` (any of the others added): the inner boundary made inside the outer's content
// and handed out unread, the failing read a render effect's, the answer pending in between. `sync own effect`,
// `async effect` and `async own` print "inner:toolong" (ok). Main 510bb8d01 and npm 2.0.4 alike.
// The inner boundary takes TooLong and rethrows anything else; the outer takes what it is given. `which` 1 throws
// NotFound: the inner fallback rethrows it, the outer shows "outer:nf". `which` 2 throws TooLong: the inner fallback
// returns "inner:toolong" and throws nothing, so the outer's content has a value. Expected (R-f-4, D-41 — a value
// replaces the error): "inner:toolong". Then `which` 0: "ok0".
import { createRoot, createSignal, createMemo, createRenderEffect, createErrorBoundary, flush, untrack } from "@solidjs/signals";
import { Errored, createComponent } from "solid-js";
class NotFound extends Error {}
class TooLong extends Error {}
const ASYNC = process.argv[2] === "async", LATER = process.argv.includes("later"), COMPONENT = process.argv.includes("component"), DERIVED = process.argv.includes("derived"), TYPED = process.argv.includes("typed"), THREE = process.argv.includes("three"), EFFECT = process.argv.includes("effect"), OWN = process.argv.includes("own");
// `component`: solid-js's <Errored>, the fallback deciding in a memo of its own whether the failure is its class (as a
// typed boundary is lowered: ref/compile/rt-web.ts `TypedErrored`)
const typed = (cls, content, show) => COMPONENT
  ? createComponent(Errored, { fallback: err => { const ok = createMemo(() => cls === null || err() instanceof cls); if (!ok()) throw err(); return show(err); }, get children() { return content(); } })
  : untrack(() => createErrorBoundary(content, err => { const e = err(); if (cls !== null && !(e instanceof cls)) throw e; return show(err); }));
const [which, setWhich] = createSignal(0);
let screen = "";
// async: each value of `which` is a question answered later (`land`), and the computation throws after the answer
const flights = new Map();
const ask = w => new Promise(res => flights.set(w, res));
const land = async w => { flights.get(w)?.(w); flights.delete(w); for (let i = 0; i < 4; i++) { await new Promise(r => setTimeout(r, 0)); flush(); } };
const decide = w => { if (w === 1) throw new NotFound("nf"); if (w === 2) throw new TooLong("toolong"); return "ok" + w; };
createRoot(() => {
  // `derived`: the question answers data, and a memo over it and over `which` decides (`u = u0 == null ? throw … : …`)
  const q = ASYNC ? createMemo(async () => await ask(which())) : createMemo(() => which());
  const m = DERIVED ? createMemo(() => { const v = q(); return decide(which() === v ? v : -1); }) : ASYNC ? createMemo(async () => decide(await ask(which()))) : createMemo(() => decide(which()));
  // `effect`: the content reads the failing value in a render effect of its own (as compiled JSX's `insert` does) and
  // returns a node; `three`: an untyped boundary above the two (`errored fallback(e) { … } { <typed ones> }`)
  const node = { text: "" };
  const content = EFFECT ? () => { createRenderEffect(() => m(), v => { node.text = v; }); return node; } : () => m();
  const read = x => { let v = x; while (typeof v === "function") v = v(); return v === node ? node.text : v; };
  // `own`: each boundary is made inside the content of the one above and handed out unread, as JSX nests `<Errored>`
  // (the reader resolves the accessors); without it each is made beside the others and read in the content above
  const innerOf = () => typed(TooLong, content, err => "inner:" + err().message);
  const inner = OWN ? null : innerOf();
  const midOf = () => typed(TYPED || THREE ? NotFound : null, OWN ? innerOf : () => read(inner), err => "outer:" + err().message);
  const mid = OWN && THREE ? null : midOf();
  const outer = THREE ? typed(null, OWN ? midOf : () => read(mid), err => "top:" + err().message) : mid;
  createRenderEffect(() => read(outer), v => { screen = v; });
});
const seen = [];
const tick = async () => { for (let i = 0; i < 4; i++) { await new Promise(r => setTimeout(r, 0)); flush(); } };
// (with `later`, the write is an instant of its own — the question out, the screen held — before its answer lands)
const show = () => screen === node.text || screen === node ? node.text : screen;
const step = async w => { if (w !== undefined) setWhich(w); flush(); if (ASYNC && LATER) await tick(); if (ASYNC) await land(w ?? 0); seen.push(screen); };
await step(); await step(1); await step(2); await step(0);
console.log(process.argv.slice(2).join(" "), seen.join(" | "), seen[2] === "inner:toolong" ? "ok" : "STUCK");
