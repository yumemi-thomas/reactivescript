// Pin 50a4bfd (#4906): an effect whose compute reads every key of a store (through the store's proxy) does not rerun
// when the store changes — neither by a guess (createOptimisticStore's setter in an action) nor by a new answer.
// Run: node --conditions=browser --conditions=development repros/pin-effect-store.mjs [guess|answer|plain]
import { createRoot, createEffect, createRenderEffect, createOptimisticStore, createStore, action, refresh, flush } from "@solidjs/signals";

const mode = process.argv[2] ?? "guess";
const flights = [];
const ask = () => new Promise(r => flights.push(r));
const tick = async () => { for (let i = 0; i < 4; i++) { await new Promise(r => setTimeout(r, 0)); flush(); } };
const copy = v => v === null || typeof v !== "object" ? v : Array.isArray(v) ? v.map(copy) : Object.fromEntries(Object.keys(v).map(k => [k, copy(v[k])]));
const log = [];
let screen = "";
let store, setStore;
createRoot(() => {
  if (mode === "plain") [store, setStore] = createStore([{ id: 1, title: "A" }, { id: 2, title: "C" }]);
  else [store, setStore] = createOptimisticStore(async () => await ask(), [], { key: "id" });
  createEffect(() => copy(store), { effect: v => { log.push(v.map(r => r.title).join(",")); } });
  createRenderEffect(() => store.map(r => r.title).join(""), v => { screen = v; });
});
flush();
const show = label => { console.log(label.padEnd(22), JSON.stringify(screen), "effect:", JSON.stringify(log.splice(0))); };
if (mode === "plain") {
  show("mount");
  setStore(d => { d[0].title = "x"; }); flush(); show("d[0].title = x");     // expected effect ["x,C"]
} else {
  await tick(); flights.shift()([{ id: 1, title: "A" }, { id: 2, title: "C" }]); await tick(); show("first answer");   // expected effect ["A,C"]
  if (mode === "guess") {
    let done; const save = new Promise(r => (done = r));
    const ren = action(function* () { setStore(d => { d[0].title = "x"; }); yield save; refresh(store); });
    ren(); flush(); await tick(); show("guess");                          // expected effect ["x,C"]
    done(); await tick(); flights.shift()([{ id: 1, title: "B" }, { id: 2, title: "C" }]); await tick(); show("refresh lands");   // expected effect ["B,C"]
  } else {
    refresh(store); await tick(); flights.shift()([{ id: 1, title: "B" }, { id: 2, title: "C" }]); await tick(); show("refresh lands");   // expected effect ["B,C"]
  }
}
