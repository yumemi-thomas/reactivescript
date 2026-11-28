/**
 * @jsxImportSource @solidjs/web
 * @vitest-environment jsdom
 */
// Fuzz seed 41 (eval/reference/board/rx-cols: one keyed optimistic store per fetch). A toggle guesses a card's count
// (`todo[0].done += 1`); the card is then moved into another store, the row passed as it is (a store row). Once the
// move's answers land, the card shows the server's count while the toggle is still out. Passing a copy (`{ ...row }`)
// keeps the guess.
import { test, expect } from "vitest";
import { For, action, createSignal, createOptimisticStore, flush, refresh } from "solid-js";
import { render } from "../src/index.js";
const tick = async () => { for (let i = 0; i < 4; i++) { await new Promise(r => setTimeout(r, 0)); flush(); } };
type Row = { id: number; done: number; total: number };
// the .rx runtime's keyed landing (rt-web.ts landDraft): rows matched by key, leaves merged
function landDraft(draft: any[], v: any[]) {
  const had = new Map<unknown, any>(); for (const row of draft) had.set(row.id, row);
  v.forEach((x, i) => { const row = had.get(x.id); if (row) { for (const k of Object.keys(x)) if (row[k] !== x[k]) row[k] = x[k]; if (draft[i] !== row) draft[i] = row; } else draft[i] = x; });
  draft.length = v.length;
}
for (const copy of [false, true])
test(`a path guess on a row moved into another store ${copy ? "(as a copy)" : "(the row itself)"} stays while its action is out`, async () => {
  const fl: Record<string, ((v: any) => void)[]> = {};
  const ask = (k: string) => new Promise<any>(r => (fl[k] ??= []).push(r));
  const land = (k: string, v: any) => { const rs = fl[k] ?? []; if (!rs.length) throw new Error("no ask " + k); fl[k] = []; rs.forEach(r => r(structuredClone(v))); };
  const c = document.body.appendChild(document.createElement("div"));

  const [todoAns] = createSignal<any>(() => ask("todo"), { loadingValue: null } as any);
  const [doneAns] = createSignal<any>(() => ask("done"), { loadingValue: null } as any);
  const [todo, setTodo] = createOptimisticStore<Row[]>((d: any) => { landDraft(d, todoAns() ?? []); }, [], { key: "id" } as any);
  const [done, setDone] = createOptimisticStore<Row[]>((d: any) => { landDraft(d, doneAns() ?? []); }, [], { key: "id" } as any);
  const toggle = action(function* (i: number) {
    setTodo((d: any) => { d[i].done += 1; });
    yield ask("toggle");
  });
  const move = action(function* (id: number) {
    const row = todo.find(r => r.id === id)!;
    setTodo((rs: Row[]) => rs.filter(r => r.id !== id));
    setDone((rs: Row[]) => [...rs, copy ? { ...row } : row]);
    yield ask("move");
    refresh(todoAns); refresh(doneAns);
  });

  const col = (rows: Row[]) => <ul><For each={rows}>{(r: any) => <li>{r.id}:{r.done}/{r.total}</li>}</For></ul>;
  render(() => <div>{col(todo)}{col(done)}</div>, c);
  const state = () => [...c.querySelectorAll("ul")].map(u => [...u.querySelectorAll("li")].map(l => l.textContent).join(",")).join(" | ");

  land("todo", [{ id: 1, done: 0, total: 2 }]); land("done", [{ id: 5, done: 3, total: 3 }]); await tick();
  toggle(0); await tick();
  expect(state()).toBe("1:1/2 | 5:3/3");
  move(1); await tick();
  expect(state()).toBe(" | 5:3/3,1:1/2");
  land("move", {}); await tick();                       // accepted: both answers re-asked
  land("todo", []); await tick();
  expect(state()).toBe(" | 5:3/3,1:1/2");
  land("done", [{ id: 5, done: 3, total: 3 }, { id: 1, done: 0, total: 2 }]); await tick();
  expect(state()).toBe(" | 5:3/3,1:1/2");               // the row itself: got " | 5:3/3,1:0/2" (the toggle is still out)
});
