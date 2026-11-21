/**
 * @jsxImportSource @solidjs/web
 * @vitest-environment jsdom
 */
// Fuzz seed 24 (eval/reference/board/rx-cols: one keyed optimistic store per fetch). Each store derives from its
// answer through an error boundary (the .rx `answer catch (e) => null`). An add is held with a move (both guessed on
// To do's slot 2); the move is accepted and refreshes both answers. A new add's placeholder guess, To do's slot 3,
// then never shows while the refreshes are out (its action is running: its request is out). Needs the boundary under
// To do's store (stores reading the answers directly: shows; a boundary under To do's alone: still lost) and the held
// add B (no B: shows).
import { test, expect } from "vitest";
import { For, action, createSignal, createErrorBoundary, untrack, createOptimisticStore, flush, refresh } from "solid-js";
import { render } from "../src/index.js";
const tick = async () => { for (let i = 0; i < 4; i++) { await new Promise(r => setTimeout(r, 0)); flush(); } };
type Row = { id: number; title: string; adding?: boolean };
// the .rx runtime's keyed landing (rt-web.ts landDraft): rows matched by key, leaves merged
function landDraft(draft: any[], v: any[]) {
  const had = new Map<unknown, any>(); for (const row of draft) had.set(row.id, row);
  v.forEach((x, i) => { const row = had.get(x.id); if (row) { for (const k of Object.keys(x)) if (row[k] !== x[k]) row[k] = x[k]; if (draft[i] !== row) draft[i] = row; } else draft[i] = x; });
  draft.length = v.length;
}
// `x catch (e) => null`, as the .rx runtime lowers it (rt-web.ts catchAcc)
const orNull = (f: () => any) => { const acc: any = untrack(() => createErrorBoundary(() => f(), () => ({ failed: true }))); return () => { const v = acc(); return v?.failed ? null : v; }; };

test("a guess into a store over an error boundary doesn't show while an accepted move's refreshes are out", async () => {
  const fl: Record<string, ((v: any) => void)[]> = {};
  const ask = (k: string) => new Promise<any>(r => (fl[k] ??= []).push(r));
  const land = (k: string, v: any) => { const rs = fl[k] ?? []; if (!rs.length) throw new Error("no ask " + k); fl[k] = []; rs.forEach(r => r(structuredClone(v))); };
  const c = document.body.appendChild(document.createElement("div"));

  const [todoAns, setTodoAns] = createSignal<any>(() => ask("todo"), { loadingValue: null } as any);
  const [doingAns] = createSignal<any>(() => ask("doing"), { loadingValue: null } as any);
  const todoSeen = orNull(todoAns), doingSeen = orNull(doingAns);
  const [todo, setTodo] = createOptimisticStore<Row[]>((d: any) => { landDraft(d, todoSeen() ?? []); }, [], { key: "id" } as any);
  const [doing, setDoing] = createOptimisticStore<Row[]>((d: any) => { landDraft(d, doingSeen() ?? []); }, [], { key: "id" } as any);

  // a move as the server makes it: each list's new shape (#4724: one write per differing index)
  const move = action(function* (id: number) {
    const row = todo.find(r => r.id === id)!;
    setTodo((rs: Row[]) => rs.filter(r => r.id !== id));
    setDoing((rs: Row[]) => [...rs, { ...row }]);
    yield ask("move");
    refresh(todoAns); refresh(doingAns);
  });
  // an add: a placeholder at the end of To do; the answer is the new card, written into To do's answer
  const add = action(function* (key: number, title: string, at: number) {
    setTodo((d: any) => { d[at] = { id: key, title, adding: true }; });
    const r: any = yield ask(`add:${title}`);
    setTodoAns((cs: any[]) => [...cs, { id: r.id, title: r.title }]);
  });

  const col = (rows: Row[]) => <ul><For each={rows}>{(r: any) => <li>{r.adding ? `(${r.title})` : r.id}</li>}</For></ul>;
  render(() => <div>{col(todo)}{col(doing)}</div>, c);
  const state = () => [...c.querySelectorAll("ul")].map(u => [...u.querySelectorAll("li")].map(l => l.textContent).join(",")).join(" | ");

  land("todo", [{ id: 1, title: "a" }, { id: 2, title: "b" }]); land("doing", [{ id: 3, title: "c" }]); await tick();
  add(-1, "A", todo.length); await tick();
  land("add:A", { id: 10, title: "A" }); await tick();
  expect(state()).toBe("1,2,10 | 3");
  move(10); await tick();
  expect(state()).toBe("1,2 | 3,10");
  add(-2, "B", todo.length); await tick();
  land("add:B", { id: 11, title: "B" }); await tick();          // held with the move (both on To do's slot 2)
  expect(state()).toBe("1,2,(B) | 3,10");
  land("move", {}); await tick();                               // accepted: both refreshes out
  add(-3, "C", todo.length); await tick();
  expect(state()).toBe("1,2,(B),(C) | 3,10");                   // got "1,2,(B) | 3,10": C's guess never shows
});
