/**
 * @jsxImportSource @solidjs/web
 * @vitest-environment jsdom
 */
// Fuzz seeds 24 and 39 (board-rx3), "duplicate card": one card shows in two columns. One keyed optimistic store
// (`board`) over three async answers; each column is a memo filtering it by `col`. Two adds are out, guessed on a
// list of their own (whole-list guesses, so one change); the first is accepted and writes its card into To do's
// answer (held with the other add). Move A (card 3, a pos guess) is accepted and re-asks all three answers; move B
// (card 4 to done, a col guess) is out. Then move C guesses card 3's col = "done": the Done memo shows card 3, and the
// Doing memo still shows it too. Needs: the held add write (one add out, or none landed: passes) and a re-ask of To do
// plus one more answer (re-asking only one: passes). Variant column-memo-loses-guess.variant.spec.tsx (no move B):
// card 3 shows in neither column.
import { test, expect } from "vitest";
import { For, action, createMemo, createSignal, createOptimisticStore, flush, refresh } from "solid-js";
import { render } from "../src/index.js";
const tick = async () => { for (let i = 0; i < 4; i++) { await new Promise(r => setTimeout(r, 0)); flush(); } };
type Row = { id: number; title: string; col: string; pos: number };
// the .rx runtime's keyed landing (rt-web.ts landDraft): rows matched by key, leaves merged
function landDraft(draft: any[], v: any[]) {
  const had = new Map<unknown, any>(); for (const row of draft) had.set(row.id, row);
  v.forEach((x, i) => { const row = had.get(x.id); if (row) { for (const k of Object.keys(x)) if (row[k] !== x[k]) row[k] = x[k]; if (draft[i] !== row) draft[i] = row; } else draft[i] = x; });
  draft.length = v.length;
}
test("a column memo over a store misses a col guess while a re-ask and a held add write are out", async () => {
  const fl: Record<string, ((v: any) => void)[]> = {};
  const ask = (k: string) => new Promise<any>(r => (fl[k] ??= []).push(r));
  const land = (k: string, v: any) => { const rs = fl[k] ?? []; if (!rs.length) throw new Error("no ask " + k); fl[k] = []; rs.forEach(r => r(structuredClone(v))); };
  const c = document.body.appendChild(document.createElement("div"));

  const [todoAns, setTodoAns] = createSignal<any>(() => ask("todo"), { loadingValue: null } as any);
  const [doingAns] = createSignal<any>(() => ask("doing"), { loadingValue: null } as any);
  const [doneAns] = createSignal<any>(() => ask("done"), { loadingValue: null } as any);
  const rowsOf = (cs: any[] | null, col: string) => (cs ?? []).map((x, i) => ({ ...x, col, pos: i }));
  const [board, setBoard] = createOptimisticStore<Row[]>((d: any) => { landDraft(d, [...rowsOf(todoAns(), "todo"), ...rowsOf(doingAns(), "doing"), ...rowsOf(doneAns(), "done")]); }, [], { key: "id" } as any);
  const [adding, setAdding] = createOptimisticStore<Row[]>((d: any) => { landDraft(d, []); }, [], { key: "id" } as any);
  const inCol = (col: string) => board.filter(r => r.col === col).sort((x, y) => x.pos - y.pos);
  const todo = createMemo(() => [...inCol("todo"), ...adding]);
  const doing = createMemo(() => inCol("doing"));
  const done = createMemo(() => inCol("done"));

  const reask = action(function* () { refresh(todoAns); refresh(doingAns); refresh(doneAns); });
  const move = action(function* (i: number, id: number, col: string, pos: number) {
    try {
      setBoard((d: any) => { d[i].col = col; });
      setBoard((d: any) => { d[i].pos = pos; });
      yield ask(`move:${id},${col}`);
      yield reask();
    } catch { /* declined */ }
  });
  const add = action(function* (key: number, title: string) {
    try {
      setAdding((d: any) => [...d, { id: key, title, col: "todo", pos: 0 }]);
      const r: any = yield ask(`add:${title}`);
      setTodoAns((cs: any[]) => [...cs, { id: r.id, title: r.title }]);
    } catch { /* declined */ }
  });
  const at = (id: number) => board.findIndex(r => r.id === id);   // the handler's index, as the app passes it

  const col = (rows: () => Row[]) => <ul><For each={rows()}>{(r: any) => <li>{r.id}</li>}</For></ul>;
  render(() => <div>{col(todo)}{col(doing)}{col(done)}</div>, c);
  const state = () => [...c.querySelectorAll("ul")].map(u => [...u.querySelectorAll("li")].map(l => l.textContent).join(",")).join(" | ");

  land("todo", [{ id: 1, title: "a" }, { id: 2, title: "b" }]); land("doing", [{ id: 3, title: "c" }, { id: 4, title: "d" }]); land("done", [{ id: 5, title: "e" }]); await tick();
  expect(state()).toBe("1,2 | 3,4 | 5");
  add(-1, "A"); await tick(); add(-2, "B"); await tick();
  land("add:A", { id: 10, title: "A" }); await tick();          // held with B (one change on `adding`)
  move(at(3), 3, "doing", 2); await tick();                     // down #3
  expect(state()).toBe("1,2,-1,-2 | 4,3 | 5");
  move(at(4), 4, "done", 1); await tick();                      // right #4
  expect(state()).toBe("1,2,-1,-2 | 3 | 5,4");
  land("move:3,doing", {}); await tick();                       // accepted: re-asks out
  move(at(3), 3, "done", 2); await tick();                      // right #3
  console.log("after right #3:", state());
  expect(state()).toBe("1,2,-1,-2 |  | 5,4,3");
});
