// A keyed optimistic store over an async fn reading `filter` (createOptimisticStore(fn, [], { key })), and an action that
// guesses a row and refreshes it. After one such add has settled (guess, answer, refresh landed), a second add's guess
// is out and `filter` is switched: the switch should join the guess's hold (the screen stays on the old filter with the
// guessed list until the action ends, H-11, Solid D-34), and does on a fresh store. Here it tears — the filter's reader
// shows "open" while the list's reader still shows the "all" answer with the guess, for as long as the action is out.
// Found by the claims hunt (rx-hunt.noindex/claims, finding 4: t/s01-solid-tear torn, t/s02-solid-fresh held).
// Run: node --conditions=browser --conditions=development repros/keyed-guess-refresh-tear.mjs [fresh]
import { createRoot, createRenderEffect, createSignal, createOptimisticStore, action, refresh, flush } from "@solidjs/signals";

const fresh = process.argv[2] === "fresh";
const flights = new Map();
const call = key => new Promise((res, rej) => flights.set(key, { res, rej }));
const answer = (key, v) => { const f = flights.get(key); if (!f) throw new Error(`no flight ${key} (out: ${[...flights.keys()]})`); flights.delete(key); f.res(v); };
const tick = async () => { for (let i = 0; i < 4; i++) { await new Promise(r => setTimeout(r, 0)); flush(); } };
let label = "", list = "", add, setFilter;
createRoot(() => {
  const [filter, setF] = createSignal("all"); setFilter = setF;
  const [todos, setTodos] = createOptimisticStore(async () => await call(filter()), [], { key: "id" });
  add = action(function* (id) {
    setTodos(ts => [...ts, { id }]);
    try { yield call("add" + id); refresh(todos); } catch (e) { console.log(e); }
  });
  createRenderEffect(() => filter(), v => { label = v; });
  createRenderEffect(() => todos.map(t => t.id).join(","), v => { list = v; });
});
flush();
const show = s => console.log(s.padEnd(30), `${label} | ${list}`);
await tick(); answer("all", [{ id: "a" }]); await tick(); show("first answer");             // all | a
if (!fresh) {
  add("x"); flush(); await tick(); show("add x (guess)");                                   // all | a,x
  answer("addx", "ok"); await tick(); show("addx answered, refresh out");                    // all | a,x
  answer("all", [{ id: "a" }, { id: "x" }]); await tick(); show("refresh landed");           // all | a,x
}
add("z"); flush(); await tick(); show("add z (guess)");                                      // all | a,(x,)z
setFilter("open"); flush(); await tick(); show("filter := open (held)");                    // expected: all | a,(x,)z — torn: open | a,(x,)z
answer("open", [{ id: "o" }]); await tick(); show("open answered (still held)");             // expected: all | a,(x,)z
answer("addz", "ok"); await tick(); show("addz answered, refresh out");                      // expected: all | a,(x,)z
answer("open", [{ id: "o" }, { id: "z" }]); await tick(); show("refresh landed");            // open | o,z
