/**
 * @jsxImportSource @solidjs/web
 * @vitest-environment jsdom
 */
// A keyed optimistic store over a truth signal. An action guesses one field of row #4 (b[i].col = "done") and waits.
// Meanwhile the truth drops row #4 (its column's re-ask failed, or another write took it off). Expected: the store
// shows the truth's rows, #4's guess having nothing to stand on (or #4 whole, if the guess keeps it). Observed?
import { test, expect } from "vitest";
import { action, createSignal, createOptimisticStore, flush, For } from "solid-js";
import { render } from "../src/index.js";
const tick = async () => { for (let i = 0; i < 4; i++) { await new Promise(r => setTimeout(r, 0)); flush(); } };
type Row = { id: number; title: string; col: string };
test("a row guessed by path leaves the truth while its action is out", async () => {
  const asks: { key: string; res: (v: any) => void }[] = [];
  const ask = (key: string) => new Promise<any>(res => asks.push({ key, res }));
  const c = document.body.appendChild(document.createElement("div"));
  const [ans, setAns] = createSignal<Row[]>([{ id: 3, title: "R", col: "doing" }, { id: 4, title: "D", col: "doing" }, { id: 5, title: "K", col: "done" }]);
  const [board, guess] = createOptimisticStore<Row[]>(() => ans().map(r => ({ ...r })), [], { key: "id" });
  const move = action(function* (id: number) {
    guess(b => { const i = b.findIndex(r => r.id === id); b[i].col = "done"; });
    yield ask(`move:${id}`);
  });
  render(() => <p><For each={board}>{r => <span>{`#${r.id} ${r.title} ${r.col}; `}</span>}</For></p>, c);
  await tick();
  move(4); await tick();
  const guessed = c.textContent;
  setAns([{ id: 5, title: "K", col: "done" }]); await tick();   // the truth no longer has #3 or #4
  const after = c.textContent;
  console.log("guessed:", guessed, "| truth without #3,#4:", after);
  expect(after).not.toMatch(/#undefined|# /);
});
