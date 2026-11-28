// FIXED in solid main fc0dac0cd (its follow-up is solidjs/solid#5146, repros/proj-hydrate). Solid server: a projection over a pending async store, created in a component body with <Loading> below it, throws
// NotReadyError out of renderToStream; the client build shows the fallback, then "A". Run from ref/: node oracle/repros/ssr-projection-over-pending-store.mjs (solidjs/solid#5097)
import { createStore, createProjection, Loading, For, createComponent } from "solid-js";
import { renderToStream } from "@solidjs/web";
function App() {
  const [rows] = createStore(async () => { await new Promise(r => setTimeout(r, 10)); return [{ id: 1, t: "A" }]; }, [], { key: "id" });
  const view = createProjection(() => rows, [], { key: "id" });   // a projection over the async store
  return createComponent(Loading, { fallback: "loading", get children() { return () => view.map(r => r.t).join(","); } });
}
let out = "";
try {
  await new Promise((res, rej) => renderToStream(() => createComponent(App, {}), { onError: rej }).pipe({ write: c => { out += c; }, end: res }));
  console.log("rendered:", out.replace(/<script[\s\S]*?<\/script>/g, ""));
} catch (e) { console.log("threw", e?.constructor?.name, e?.message ?? ""); }
