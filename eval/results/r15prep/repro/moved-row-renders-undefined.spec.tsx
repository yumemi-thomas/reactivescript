/**
 * @jsxImportSource @solidjs/web
 * @vitest-environment jsdom
 */
// Fuzz seed 44 (eval/reference/board/rx-cols: one keyed optimistic store per fetch). A card is moved into a list
// that just emptied; once every answer has landed (nothing in the air), the list renders one row whose item is
// undefined. Needs each row to read the list's first row (`rows[0]`, as an "up" button on all rows but the first);
// without that read it renders the card.
import { test, expect } from "vitest";
import { For, action, createSignal, createOptimisticStore, flush, refresh } from "solid-js";
import { render } from "../src/index.js";
const tick = async () => { for (let i = 0; i < 4; i++) { await new Promise(r => setTimeout(r, 0)); flush(); } };
type Row = { id: number };
type Col = "todo" | "doing" | "done";

test("a row moved into an empty keyed optimistic store renders as undefined once the answers land", async () => {
  const srv: Record<Col, number[]> = { todo: [1, 2], doing: [4], done: [3, 5] };
  const fl: Record<string, ((v: any) => void)[]> = {};
  const ask = (k: string) => new Promise<any>(r => (fl[k] ??= []).push(r));
  const air = () => Object.keys(fl).filter(x => fl[x].length).join(" ");
  const land = (k: string, v: any) => { const rs = fl[k] ?? []; if (!rs.length) throw new Error("no ask " + k + " in " + air()); fl[k] = []; rs.forEach(r => r(structuredClone(v))); };
  const landCards = (col: Col) => land(col, srv[col].map(id => ({ id })));
  const landMove = (id: number, from: Col, to: Col, at: number) => { srv[from] = srv[from].filter(x => x !== id); srv[to].splice(at, 0, id); land(`move:${id}`, {}); };

  const c = document.body.appendChild(document.createElement("div"));
  const [todoAns] = createSignal<any>(() => ask("todo"), { loadingValue: null } as any);
  const [doingAns] = createSignal<any>(() => ask("doing"), { loadingValue: null } as any);
  const [doneAns] = createSignal<any>(() => ask("done"), { loadingValue: null } as any);
  const anss = { todo: todoAns, doing: doingAns, done: doneAns };
  const [todo, setTodo] = createOptimisticStore<Row[]>(() => todoAns() ?? [], [], { key: "id" } as any);
  const [doing, setDoing] = createOptimisticStore<Row[]>(() => doingAns() ?? [], [], { key: "id" } as any);
  const [done, setDone] = createOptimisticStore<Row[]>(() => doneAns() ?? [], [], { key: "id" } as any);
  const stores = { todo, doing, done }, sets = { todo: setTodo, doing: setDoing, done: setDone };

  // a move: the card leaves one list and joins the end of another; accepted, it re-asks both
  const move = action(function* (id: number, from: Col, to: Col) {
    const row = { ...stores[from].find(r => r.id === id)! };
    sets[from]((rs: Row[]) => rs.filter(r => r.id !== id));
    sets[to]((rs: Row[]) => [...rs, row]);
    yield ask(`move:${id}`);
    refresh(anss[from]); refresh(anss[to]);
  });

  // each row reads the list's first row (as an "up" button shown on every row but the first)
  const col = (rows: Row[]) => <ul><For each={rows}>{(r: any) => <li><b>{String(r?.id)}</b>{rows[0]?.id === r?.id ? "" : " up"}</li>}</For></ul>;
  render(() => <div>{col(todo)}{col(doing)}{col(done)}</div>, c);
  const state = () => [...c.querySelectorAll("ul")].map(u => [...u.querySelectorAll("b")].map(b => b.textContent).join(",")).join(" | ");
  const S = async (f: () => void) => { f(); await tick(); };

  await S(() => { landCards("todo"); landCards("doing"); landCards("done"); });
  expect(state()).toBe("1,2 | 4 | 3,5");
  await S(() => move(4, "doing", "todo"));
  await S(() => landMove(4, "doing", "todo", 2));   // accepted: re-asks Doing and To do
  await S(() => landCards("doing"));                // Doing: [] (To do still out)
  expect(state()).toBe("1,2,4 |  | 3,5");
  await S(() => move(3, "done", "doing"));          // into the empty Doing
  expect(state()).toBe("1,2,4 | 3 | 5");
  await S(() => landMove(3, "done", "doing", 0));   // accepted: re-asks Done and Doing
  await S(() => landCards("todo"));
  await S(() => landCards("done"));
  expect(state()).toBe("1,2,4 | 3 | 5");
  await S(() => landCards("doing"));                // nothing in the air now
  expect(air()).toBe("");
  expect(state()).toBe("1,2,4 | 3 | 5");            // got "1,2,4 | undefined | 5"
});
