/**
 * @jsxImportSource @solidjs/web
 * @vitest-environment jsdom
 */
// A keyed optimistic store whose derive returns its answer. A path guess on a row (`d[i].done += 1`) is out; the
// answer is re-asked and comes back without the row, then again with it. The guess's action is still running, but the
// row shows the answer's value. The same derive writing its draft (keyed merge, then `length`) keeps the guess.
import { test, expect } from "vitest";
import { For, action, createSignal, createOptimisticStore, flush, refresh } from "solid-js";
import { render } from "../src/index.js";
const tick = async () => { for (let i = 0; i < 4; i++) { await new Promise(r => setTimeout(r, 0)); flush(); } };
type Row = { id: number; done: number };
function landDraft(draft: any[], v: any[]) {
  const had = new Map<unknown, any>(); for (const row of draft) had.set(row.id, row);
  v.forEach((x, i) => { const row = had.get(x.id); if (row) { for (const k of Object.keys(x)) if (row[k] !== x[k]) row[k] = x[k]; if (draft[i] !== row) draft[i] = row; } else draft[i] = x; });
  draft.length = v.length;
}
for (const mode of ["returns its answer", "writes its draft"] as const)
test(`a row's path guess stays while its row leaves the answer and comes back (derive ${mode})`, async () => {
  const fl: Record<string, ((v: any) => void)[]> = {};
  const ask = (k: string) => new Promise<any>(r => (fl[k] ??= []).push(r));
  const land = (k: string, v: any) => { const rs = fl[k] ?? []; if (!rs.length) throw new Error("no ask " + k); fl[k] = []; rs.forEach(r => r(structuredClone(v))); };
  const c = document.body.appendChild(document.createElement("div"));
  const [ans] = createSignal<any>(() => ask("list"), { loadingValue: null } as any);
  const [rows, setRows] = createOptimisticStore<Row[]>(
    mode === "returns its answer" ? () => ans() ?? [] : (d: any) => { landDraft(d, ans() ?? []); }, [], { key: "id" } as any);
  const toggle = action(function* (i: number) {
    setRows((d: any) => { d[i].done += 1; });
    yield ask("toggle");
  });
  render(() => <ul><For each={rows}>{(r: any) => <li>{r.id}:{r.done}</li>}</For></ul>, c);
  const state = () => [...c.querySelectorAll("li")].map(l => l.textContent).join(",");

  land("list", [{ id: 1, done: 0 }, { id: 3, done: 2 }]); await tick();
  toggle(1); await tick();
  expect(state()).toBe("1:0,3:3");
  refresh(ans); await tick();
  land("list", []); await tick();                                  // row 3 leaves the answer
  expect(state()).toBe("");
  refresh(ans); await tick();
  land("list", [{ id: 1, done: 0 }, { id: 3, done: 2 }]); await tick();   // and comes back; the toggle is still out
  expect(state()).toBe("1:0,3:3");                                 // returns its answer: got "1:0,3:2"
});
