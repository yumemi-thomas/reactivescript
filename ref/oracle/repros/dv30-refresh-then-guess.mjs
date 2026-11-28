// DV-30, reduced (spec/05; the user's reduction, 2026-11-28): a guess on an optimistic store, once a plain `refresh` of
// it has landed, no longer holds a switch of what the store is computed from. Plain Solid, no ReactiveScript code.
//   node --conditions=browser repros/dv30-refresh-then-guess.mjs [nokey|key] [guess|noguess] [norefresh]
// `todos = createOptimisticStore(async () => call(filter()), [])` (no key needed). First answer `a`; then one
// `refresh(todos)` that lands (skipped with `norefresh`); then an action guesses a row (`setTodos(ts => [...ts, {id}])`)
// and awaits; while it is out, `setFilter("open")`. Expected (H-11, Solid D-34): the switch joins the guess's hold,
// `all | a,z` ("held"). Actual on main 510bb8d01 and npm 2.0.4: `open | a,z` ("TORN"). `norefresh` holds;
// `createOptimistic` (not a store) holds; writing an unrelated signal between the steps hides it.
// keyed-guess-refresh-tear.mjs is the first, larger form (a key, a refresh in the action, a first add).
import { createRoot, createRenderEffect, createSignal, createOptimisticStore, action, refresh, flush } from "solid-js";
const [, , KEY, GUESS] = process.argv;
const flights = new Map();
const call = key => new Promise(res => flights.set(key, res));
const answer = (key, v) => { flights.get(key)(v); flights.delete(key); };
const tick = async () => { for (let i = 0; i < 4; i++) { await new Promise(r => setTimeout(r, 0)); flush(); } };
let label = "", list = "", add, setFilter, todosRef;
createRoot(() => {
  const [filter, setF] = createSignal("all"); setFilter = setF;
  const [todos, setTodos] = createOptimisticStore(async () => await call(filter()), [], KEY === "key" ? { key: "id" } : undefined); todosRef = todos;
  add = action(function* (id) { if (GUESS === "guess") setTodos(ts => [...ts, { id }]); yield call("add" + id); if (process.env.R) refresh(todosRef); });
  createRenderEffect(() => filter(), v => { label = v; });
  createRenderEffect(() => todos.map(t => t.id).join(","), v => { list = v; });
});
flush(); await tick(); answer("all", [{ id: "a" }]); await tick();
if (process.argv[4] !== "norefresh") { refresh(todosRef); flush(); await tick(); answer("all", [{ id: "a" }]); await tick(); }
add("z"); flush(); await tick();
setFilter("open"); flush(); await tick();
console.log(KEY, GUESS, process.argv[4] ?? "", `${label} | ${list}`, label === "open" ? "TORN" : "held");
