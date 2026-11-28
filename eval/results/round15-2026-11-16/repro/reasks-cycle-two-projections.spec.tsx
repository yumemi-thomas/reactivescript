/**
 * @jsxImportSource @solidjs/web
 * @vitest-environment jsdom
 */
import { test, expect } from "vitest";
import { For, Show, Loading, action, untrack, onFlush, createMemo, createSignal, createOptimistic, createProjection, flush } from "solid-js";
import { render } from "../src/index.js";
const tick = async () => { for (let i = 0; i < 4; i++) { await new Promise(r => setTimeout(r, 0)); flush(); } };

test("re-asked columns land after an accepted move written into them (no stack overflow)", async () => {
  const asks: { key: string; res: (v: any) => void }[] = [];
  const ask = (key: string) => new Promise<any>(res => asks.push({ key, res }));
  const take = (key: string) => { const i = asks.findIndex(a => a.key === key); if (i < 0) throw new Error("no ask " + key + " in " + asks.map(a => a.key)); return asks.splice(i, 1)[0]; };
  const c = document.body.appendChild(document.createElement("div"));
  type Card = { id: number; title: string };
  type Move = { id: number; card: Card; to: string; index: number };

  const [visit, setVisit] = createSignal(0);
  const col = (name: string) => createSignal<Card[]>(async () => (visit() >= 0 ? await ask("cards:" + name) : []) as any);
  const [todoAns, setTodoAns] = col("todo"), [doingAns, setDoingAns] = col("doing");
  const [moving, guessMoving] = createOptimistic<Move[]>(() => []);

  const without = (rs: Card[], id: number) => rs.filter(c => c.id !== id);
  const place = (rs: Card[], col: string, to: string, id: number, i: number, card: Card) =>
    to === col ? [...without(rs, id).slice(0, i), card, ...without(rs, id).slice(i)] : without(rs, id);
  const arranged = (rs: Card[], col: string, ms: Move[]) => ms.reduce((acc, m) => place(acc, col, m.to, m.id, m.index, m.card), rs);
  const keyed = (fn: () => any) => { const m = createMemo(fn); return createProjection(() => m() as any, [] as any, { key: "id" } as any) as any; };
  const todoRows = keyed(() => arranged(todoAns(), "todo", moving()).map(c => ({ id: c.id, title: c.title, card: c })));
  const doingRows = keyed(() => arranged(doingAns(), "doing", moving()).map(c => ({ id: c.id, title: c.title, card: c })));

  const moveTo = action(function* (card: Card, from: string, to: string, index: number) {
    guessMoving(ms => [...ms, { id: card.id, card, to, index }]);
    const r: any = yield ask(`move:${card.id},${to},${index}`);
    if (from === "todo" || r.column === "todo") setTodoAns(rs => place(rs, "todo", r.column, card.id, r.index, card));
    if (from === "doing" || r.column === "doing") setDoingAns(rs => place(rs, "doing", r.column, card.id, r.index, card));
  });

  const seenRows = new Map<number, any>();
  const colView = (name: string, rows: any) => <Loading on={visit()} fallback={<p>loading {name}</p>}><ul data-col={name}><For each={rows}>{(r: any) => (seenRows.set(untrack(() => r.id), r), <li>#{r.id} {r.title}</li>)}</For></ul></Loading>;
  render(() => <div>{colView("todo", todoRows)}{colView("doing", doingRows)}</div>, c);
  const row = (_rows: any, id: number) => seenRows.get(id).card;   // the moved card is the row's own card, as the click hands it over

  await tick();
  take("cards:doing").res([{ id: 3, title: "Review PR" }, { id: 4, title: "Deploy" }]); await tick();
  take("cards:todo").res([{ id: 1, title: "Write spec" }, { id: 2, title: "Fix login" }]); await tick();
  moveTo(row(todoRows, 2), "todo", "doing", 2); await tick();        // right #2
  moveTo(row(doingRows, 4), "doing", "todo", 1); await tick();       // left #4
  take("move:4,todo,1").res({ id: 4, column: "todo", index: 1 }); await tick();
  setVisit(v => v + 1); await tick();                               // re-ask both columns
  take("cards:todo").res([{ id: 1, title: "Write spec" }, { id: 4, title: "Deploy" }]); await tick();
  expect(c.textContent).toContain("#4 Deploy");
});
