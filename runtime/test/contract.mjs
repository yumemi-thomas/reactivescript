// Solid's contract (ref/compile/solid-internals.ts): the four things the runtime reads of Solid that Solid does not
// publish, asserted against the installed Solid itself — nothing of the runtime is loaded — beside the public answer
// they are held against (getHydrationWriter). A Solid that moves one of them fails here, by name.
import { renderToString, renderToStream, getHydrationWriter, getRequestEvent, RequestContext } from "@solidjs/web";
import { provideRequestEvent } from "@solidjs/web/storage";
import { getOwner, runWithOwner, createRoot, createMemo, sharedConfig } from "solid-js";
const ROOTS = Symbol.for("@solidjs/web/render-roots");
const out = {};
const look = () => {
  let inner; createRoot(() => { createMemo(() => { inner = getOwner(); return 0; })(); });
  const roots = globalThis[ROOTS];
  const chain = []; for (let p = inner; p; p = p._parent) chain.push(p);
  const named = chain.filter(p => roots.has(p));
  const top = chain[chain.length - 1], root = named[0], w = getHydrationWriter();
  return { root, id: root.id, ctx: roots.get(root), w, facts: {
    "1 an owner has `_parent`, an owner or null at the top": chain.length >= 3 && chain.every(p => "_parent" in p) && top._parent === null,
    "2 globalThis[Symbol.for(\"@solidjs/web/render-roots\")] is a WeakMap that names the render's root owner": roots instanceof WeakMap && named.length >= 1 && typeof root.id === "string",
    "2 what it holds for the root is the render's context": typeof roots.get(root) === "object" && roots.get(root) === sharedConfig.context,
    "public: getHydrationWriter() is one object for the render, from any owner in it": typeof w?.write === "function" && runWithOwner(inner, getHydrationWriter) === w && runWithOwner(root, getHydrationWriter) === w,
  } };
};
let a, b, nested, s;
renderToString(() => { a = look(); renderToString(() => { nested = look(); return ""; }); return ""; });
renderToString(() => { b = look(); return ""; }, { renderId: "r2" });
await new Promise(end => renderToStream(() => { s = look(); return ""; }).pipe({ write() {}, end }));
for (const [name, r] of [["renderToString", a], ["a nested renderToString", nested], ["renderToStream", s]]) for (const [k, v] of Object.entries(r.facts)) out[`${k} (${name})`] = v;
out["2 the root is released from the table when its render ends, and unlinked"] = !globalThis[ROOTS].has(a.root) && !globalThis[ROOTS].has(s.root) && a.root._parent === null;
out["public: each render has a writer of its own, a nested one too"] = a.w !== b.w && nested.w !== a.w && s.w !== b.w && nested.root !== a.root;
out["the root owner's id is the render's (renderId)"] = b.id === "r2" && a.id === "";
const ev = { request: new Request("http://x/"), locals: {} };
out["4 globalThis[RequestContext] is the request scope's store, with getStore()"] = provideRequestEvent(ev, () => typeof globalThis[RequestContext]?.getStore === "function" && globalThis[RequestContext].getStore() === ev) && globalThis[RequestContext].getStore() === undefined;
renderToString(() => { const c = look().ctx; c.event = ev; out["3 the event an integration puts on its render is the context's `event`"] = getRequestEvent() === ev; c.event = undefined; return ""; });
console.log(JSON.stringify(out));
