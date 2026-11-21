/**
 * @jsxImportSource @solidjs/web
 * @vitest-environment jsdom
 */
// Fuzz seeds 15, 17 (eval/reference/board/rx-cols): an answered add's placeholder stays beside the card it became.
// One keyed optimistic store over one async answer. An add guesses a placeholder at the end; a reorder of the two
// rows above it (a function guess changing slots 0 and 1 only) is out; the add's answer is written into the answer
// and the add ends. Both the placeholder and the new card show. Without the reorder: only the card.
import { test, expect } from "vitest";
import { For, action, createSignal, createOptimisticStore, flush } from "solid-js";
import { render } from "../src/index.js";
const tick = async () => { for (let i = 0; i < 4; i++) { await new Promise(r => setTimeout(r, 0)); flush(); } };
type Row = { id: number; title: string; adding?: boolean };
// keyed landing: rows matched by key, leaves merged
function landDraft(draft: any[], v: any[]) {
  const had = new Map<unknown, any>(); for (const row of draft) had.set(row.id, row);
  v.forEach((x, i) => { const row = had.get(x.id); if (row) { for (const k of Object.keys(x)) if (row[k] !== x[k]) row[k] = x[k]; if (draft[i] !== row) draft[i] = row; } else draft[i] = x; });
  draft.length = v.length;
}
test("an answered add's placeholder stays beside its card while a reorder above it is out", async () => {
  const fl: Record<string, ((v: any) => void)[]> = {};
  const ask = (k: string) => new Promise<any>(r => (fl[k] ??= []).push(r));
  const land = (k: string, v: any) => { const rs = fl[k] ?? []; if (!rs.length) throw new Error("no ask " + k); fl[k] = []; rs.forEach(r => r(structuredClone(v))); };
  const c = document.body.appendChild(document.createElement("div"));
  const [ans, setAns] = createSignal<any>(() => ask("list"), { loadingValue: null } as any);
  const [rows, setRows] = createOptimisticStore<Row[]>((d: any) => { landDraft(d, ans() ?? []); }, [], { key: "id" } as any);
  // a reorder: the list's new shape (#4724: one write per differing index)
  const up = action(function* (id: number) {
    setRows((rs: Row[]) => { const i = rs.findIndex(r => r.id === id); const out = rs.slice(); [out[i - 1], out[i]] = [out[i], out[i - 1]]; return out; });
    yield ask("move");
  });
  // an add: a placeholder guessed at the end; the answer is the new row, written into the answer
  const add = action(function* (key: number, title: string, at: number) {
    setRows((d: any) => { d[at] = { id: key, title, adding: true }; });
    const r: any = yield ask("add");
    setAns((cs: any[]) => [...cs, { id: r.id, title: r.title }]);
  });
  render(() => <ul><For each={rows}>{(r: any) => <li>{r.adding ? `(${r.title})` : r.id}</li>}</For></ul>, c);
  const state = () => [...c.querySelectorAll("li")].map(l => l.textContent).join(",");

  land("list", [{ id: 1, title: "a" }, { id: 2, title: "b" }]); await tick();
  add(-1, "A", rows.length); await tick();
  expect(state()).toBe("1,2,(A)");
  up(2); await tick();
  expect(state()).toBe("2,1,(A)");
  land("add", { id: 10, title: "A" }); await tick();
  expect(state()).toBe("2,1,10");                // got "2,1,(A),10"
});
