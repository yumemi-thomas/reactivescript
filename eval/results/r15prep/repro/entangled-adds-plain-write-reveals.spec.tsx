/**
 * @jsxImportSource @solidjs/web
 * @vitest-environment jsdom
 */
// Two adds guess a row each into one optimistic store (b[n] = …, b[n+1] = …: one length slot, so their holds are
// one, A34/H-11). The first add's answer lands: its action writes the answer into the store's truth (a writable
// signal the store derives from) and returns. Expected (H-11, S-action-4): neither action's writes reveal until both
// have returned — the screen keeps "A1 (adding) A2 (adding)". Landing the SECOND add first does hold.
import { test, expect } from "vitest";
import { action, createSignal, createOptimisticStore, flush, For } from "solid-js";
import { render } from "../src/index.js";
const tick = async () => { for (let i = 0; i < 4; i++) { await new Promise(r => setTimeout(r, 0)); flush(); } };
type Row = { id: number; title: string; adding?: boolean };
function setup() {
  const asks: { key: string; res: (v: any) => void }[] = [];
  const ask = (key: string) => new Promise<any>(res => asks.push({ key, res }));
  const take = (key: string) => asks.splice(asks.findIndex(a => a.key === key), 1)[0];
  const c = document.body.appendChild(document.createElement("div"));
  const [ans, setAns] = createSignal<Row[]>([{ id: 1, title: "W" }]);
  const [board, guess] = createOptimisticStore<Row[]>(() => ans().map(r => ({ ...r })), [], { key: "id" });
  const add = action(function* (key: number, title: string, at: number) {
    guess(b => { b[at] = { id: key, title, adding: true }; });
    const r = yield ask(`add:${title}`);
    setAns(cs => [...cs, { id: r.id, title }]);
  });
  render(() => <p><For each={board}>{r => <span>{r.adding ? `${r.title}(adding) ` : `#${r.id} ${r.title} `}</span>}</For></p>, c);
  return { add, take, screen: () => c.textContent!.trim(), board };
}
for (const first of ["A1", "A2"]) test(`two adds, ${first} answered first`, async () => {
  const { add, take, screen, board } = setup(); await tick();
  add(-1, "A1", board.length); await tick();
  add(-2, "A2", board.length); await tick();
  const before = screen();
  take(`add:${first}`).res({ id: first === "A1" ? 10 : 11 }); await tick();
  const after = screen();
  console.log(first, "first | before:", before, "| after:", after);
  expect(after).toBe(before);
});
