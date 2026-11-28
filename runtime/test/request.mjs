// MO-13g: a package's state in a request event lives as the request does, not as its first render does. state.rx's
// `stamp` is the number of the module instance that answers, and probe.js lists the instances disposed. Run with
// --expose-gc: the last part asks that nothing of a request is kept once it is over.
import mod from "./state.mjs";
import { library, holdRequest } from "@reactivescript/runtime";
import { renderToString, renderToStream } from "@solidjs/web";
import { provideRequestEvent } from "@solidjs/web/storage";
import { createMemo } from "solid-js";
const lib = library(mod, "t/state");
const g = (globalThis.__probe ??= { made: 0, disposed: [] });
const turn = () => new Promise(r => setTimeout(r, 0));
const turns = async () => { await turn(); await turn(); };
const tryIt = f => { try { return f(); } catch (e) { return "threw: " + e.message; } };
const stampOf = html => Number(/<b[^>]*><!--\$-->(\d+)/.exec(html)?.[1]);
const page = () => lib.Show({});
const disposed = () => [...g.disposed];
const out = {};
const events = [];
const req = fn => { const ev = { request: new Request("http://x/"), locals: {} }; events.push(new WeakRef(ev)); return provideRequestEvent(ev, fn); };
// a stream that stays open until `open()`, and renders the package before and after
const stream = () => {
  let open, done, html = ""; const gate = new Promise(r => { open = r; }); const ended = new Promise(r => { done = r; });
  const late = createMemo(async () => { await gate; return lib.stamp(); });
  renderToStream(() => [lib.Show({}), "|", late]).pipe({ write: s => { html += s; }, end: done });
  return { open, ended, html: () => html };
};

// two renders one after the other, in one turn: one instance, live for both; released when a turn passes with none open
await req(async () => {
  const a = renderToString(page), between = disposed(), b = renderToString(page);
  out.sequential = { a: stampOf(a), b: stampOf(b), between, before: disposed() };
  await turns();
  out.sequential.after = disposed();
  out.sequential.late = tryIt(() => renderToString(page));
  out.sequential.lateHold = tryIt(() => holdRequest());
});
// two renders open at once: the one that instantiated the module ends first, and the other still reads it
await req(async () => {
  const before = disposed();
  let endFirst; const first = new Promise(r => { endFirst = r; });
  let h1 = ""; renderToStream(page).pipe({ write: s => { h1 += s; }, end: endFirst });   // instantiates
  const second = stream();
  await first; await turns();
  const during = renderToString(page);   // a third, while the second is open
  const whileOpen = disposed().length - before.length;
  second.open(); await second.ended;
  const atEnd = disposed().length - before.length;
  await turns();
  out.overlapping = { first: stampOf(h1), second: stampOf(second.html()), during: stampOf(during), lateRead: second.html().includes(`|`) && new RegExp(`\\b${stampOf(h1)}\\b`).test(second.html().split("|").slice(1).join("|")), whileOpen, atEnd, after: disposed().length - before.length, last: disposed().at(-1) };
});
// a render that begins after the state was released is refused; a host that holds the request across the gap is served
await req(async () => {
  const a = renderToString(page); await turns();
  out.gap = { a: stampOf(a), b: tryIt(() => renderToString(page)), disposed: disposed().at(-1) };
});
await req(async () => {
  const release = holdRequest();
  const a = renderToString(page); await turns();
  const b = renderToString(page); await turns();
  const whileHeld = !disposed().includes(stampOf(a));
  release(); release(); await turns();
  out.held = { a: stampOf(a), b: stampOf(b), whileHeld, after: disposed().at(-1) };
});
// two requests at once: an instance each, each request's two renders on its own
out.concurrent = (await Promise.all([1, 2].map(() => req(async () => { const a = renderToString(page); await Promise.resolve(); const b = renderToString(page); return [stampOf(a), stampOf(b)]; }))));
// a request that renders nothing (a server function's): its state is not held by a render, and goes with its event
await req(async () => { out.noRender = { stamp: lib.stamp(), again: lib.stamp() }; });
out.outside = tryIt(() => holdRequest());
await turns();
out.made = g.made; out.allDisposed = disposed().length;
// nothing of a request is kept after it: every event is collected (the request's app and its modules are reached
// from the event's locals, and from nowhere else)
renderToString(() => "");   // Solid keeps the last render's context, and with it that render's request: a render outside any request takes its place
let kept = events.length;
for (let i = 0; i < 20 && kept; i++) { await turn(); globalThis.gc?.(); kept = events.filter(w => w.deref()).length; }
out.kept = globalThis.gc ? kept : "no gc";
console.log(JSON.stringify(out));
