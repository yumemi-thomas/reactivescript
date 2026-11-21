/**
 * @jsxImportSource @solidjs/web
 * @vitest-environment jsdom
 */
import { test, expect } from "vitest";
import { For, action, createMemo, createSignal, createOptimisticStore, flush } from "solid-js";
import { render } from "../src/index.js";
const tick = async () => { for (let i = 0; i < 4; i++) { await new Promise(r => setTimeout(r, 0)); flush(); } };

// Two keyed optimistic stores (Doing, Done), each over its own async answer. A move guesses card 3 out of Doing and
// into Done, by reference (the Doing store's row). While the move is out, another action's answer bumps card 3's
// total in the Doing answer. Done shows the moved row with the new total (2/3) as long as the Done answer is left
// alone. If the same action also writes the Done answer (a new array, card 3 not in it), Done re-derives and the
// moved row shows the old total (2/2) until the move settles.
for (const writeDone of [true, false]) test(`a row guessed into another store by reference follows its answer (Done answer written too: ${writeDone})`, async () => {
  const asks: { key: string; res: (v: any) => void }[] = [];
  const ask = (key: string) => new Promise<any>(res => asks.push({ key, res }));
  const take = (key: string) => { const i = asks.findIndex(a => a.key === key); if (i < 0) throw new Error("no ask " + key); return asks.splice(i, 1)[0]; };
  const c = document.body.appendChild(document.createElement("div"));

  const [doingAns, setDoingAns] = createSignal<any>(() => ask("doing"), { loadingValue: null } as any);
  const [doneAns, setDoneAns] = createSignal<any>(() => ask("done"), { loadingValue: null } as any);
  const seen = (a: () => any) => createMemo(() => { try { return a(); } catch { return null; } });
  const doingSeen = seen(doingAns), doneSeen = seen(doneAns);
  const mk = (ans: () => any) => createOptimisticStore<any[]>(() => (ans() ?? []).map((x: any) => ({ id: x.id, title: x.title, done: x.done, total: x.total })), [], { key: "id" } as any);
  const [doing, setDoing] = mk(doingSeen), [done, setDone] = mk(doneSeen);

  const addItem = action(function* (card: number) {
    yield ask(`addItem:${card}`);
    const counted = (cs: any[] | null) => cs == null ? cs : cs.map(x => x.id === card ? { ...x, total: x.total + 1 } : x);
    setDoingAns(counted);
    if (writeDone) setDoneAns(counted);
  });
  const move = action(function* (row: any) {
    setDoing((rs: any[]) => rs.filter(r => r.id !== row.id));
    setDone((rs: any[]) => [...rs, row]);
    yield ask(`move:${row.id}`);
  });

  const col = (rows: any[]) => <ul><For each={rows}>{(r: any) => <li>#{r.id} {r.title} · {r.done}/{r.total}</li>}</For></ul>;
  render(() => <div>{col(doing)}|{col(done)}</div>, c);
  const screen = () => c.textContent!.replace(/\s+/g, " ").trim();

  take("doing").res([{ id: 3, title: "Review PR", done: 2, total: 2 }]);
  take("done").res([{ id: 5, title: "Kickoff", done: 3, total: 3 }]);
  await tick();
  addItem(3); await tick();
  move(doing[0]); await tick();
  expect(screen()).toBe("|#5 Kickoff · 3/3#3 Review PR · 2/2");
  take("addItem:3").res({}); await tick();
  // move:3 still in the air
  expect(screen()).toBe("|#5 Kickoff · 3/3#3 Review PR · 2/3");   // Done answer written too: "... · 2/2"
});
