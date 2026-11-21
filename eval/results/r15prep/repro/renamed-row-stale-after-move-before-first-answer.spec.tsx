/**
 * @jsxImportSource @solidjs/web
 * @vitest-environment jsdom
 */
// Fuzz seed 11 (eval/reference/board/rx-cols: one keyed optimistic store per fetch, each derive returning its answer).
// A row is moved, by reference, into a store whose first answer hasn't come yet, and renamed there by a path guess.
// Both writes are accepted and every answer lands; at rest the row shows its title from before the rename, while
// the last answer of its store has the new title.
import { test, expect } from "vitest";
import { For, action, createSignal, createOptimisticStore, flush, refresh } from "solid-js";
import { render } from "../src/index.js";
const tick = async () => { for (let i = 0; i < 4; i++) { await new Promise(r => setTimeout(r, 0)); flush(); } };
type Row = { id: number; title: string };

test("a row moved into a store before its first answer, then renamed there: at rest it shows the last answer's title", async () => {
  const srv = { doing: [{ id: 3, title: "Review" }, { id: 4, title: "Deploy" }], done: [{ id: 5, title: "Kickoff" }] };
  const fl: Record<string, ((v: any) => void)[]> = {};
  const ask = (k: string) => new Promise<any>(r => (fl[k] ??= []).push(r));
  const air = () => Object.keys(fl).filter(x => fl[x].length).join(" ");
  const land = (k: string, v?: any) => { const rs = fl[k] ?? []; if (!rs.length) throw new Error("no ask " + k + " in " + air()); fl[k] = []; rs.forEach(r => r(structuredClone(v))); };
  const c = document.body.appendChild(document.createElement("div"));

  const [doingAns] = createSignal<any>(() => ask("doing"), { loadingValue: null } as any);
  const [doneAns] = createSignal<any>(() => ask("done"), { loadingValue: null } as any);
  const [doing, setDoing] = createOptimisticStore<Row[]>(() => doingAns() ?? [], [], { key: "id" } as any);
  const [done, setDone] = createOptimisticStore<Row[]>(() => doneAns() ?? [], [], { key: "id" } as any);
  // a move to the top of Done, the row passed as it is; accepted, it re-asks both answers
  const move = action(function* (id: number) {
    const row = doing.find(r => r.id === id)!;
    setDoing((rs: Row[]) => rs.filter(r => r.id !== id));
    setDone((rs: Row[]) => [row, ...rs]);
    yield ask("move");
    refresh(doingAns); refresh(doneAns);
  });
  const rename = action(function* (i: number, t: string) {
    setDone((d: any) => { d[i].title = t; });
    yield ask("rename");
    refresh(doneAns);
  });

  const col = (rows: Row[]) => <ul><For each={rows}>{(r: any) => <li>{r.id}:{r.title}</li>}</For></ul>;
  render(() => <div>{col(doing)}{col(done)}</div>, c);
  const state = () => [...c.querySelectorAll("ul")].map(u => [...u.querySelectorAll("li")].map(l => l.textContent).join(",")).join(" | ");

  land("doing", srv.doing); await tick();                         // Done's first answer is still out
  move(3); await tick();
  expect(state()).toBe("4:Deploy | 3:Review");
  rename(0, "Alpha"); await tick();
  expect(state()).toBe("4:Deploy | 3:Alpha");
  srv.doing = [srv.doing[1]]; srv.done = [{ id: 3, title: "Review" }, ...srv.done];
  land("move"); await tick();                                     // accepted: re-asks Doing and Done
  land("done", srv.done); await tick();                           // Done's answers so far (before the rename)
  srv.done[0] = { id: 3, title: "Alpha" };
  land("rename"); await tick();                                   // accepted: re-asks Done
  land("done", srv.done); await tick();
  expect(state()).toBe("4:Deploy | 3:Alpha");
  land("doing", srv.doing); await tick();                         // the last answer: nothing in the air now
  expect(air()).toBe("");
  expect(state()).toBe("4:Deploy | 3:Alpha,5:Kickoff");           // got "4:Deploy | 3:Review,5:Kickoff"
});
