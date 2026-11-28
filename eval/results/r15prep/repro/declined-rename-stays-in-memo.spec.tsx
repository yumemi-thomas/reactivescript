/**
 * @jsxImportSource @solidjs/web
 * @vitest-environment jsdom
 */
import { test, expect } from "vitest";
import { For, action, createMemo, createSignal, createOptimisticStore, refresh, flush } from "solid-js";
import { render } from "../src/index.js";
const tick = async () => { for (let i = 0; i < 4; i++) { await new Promise(r => setTimeout(r, 0)); flush(); } };

// One keyed optimistic store over an async list. Three reorders are guessed (whole-list guesses that put the row back
// by reference); the third is accepted and re-asks the list. A rename guesses a row path. The re-ask lands, then the
// rename is declined. The list row goes back to "Write spec"; a memo that finds the same row in the same store (the
// selection's heading) keeps showing "Alpha".
test("a declined rename reverts the row everywhere it is read", async () => {
  const asks: { key: string; res: (v: any) => void; rej: (e: any) => void }[] = [];
  const ask = (key: string) => new Promise<any>((res, rej) => asks.push({ key, res, rej }));
  const take = (key: string) => { const i = asks.findIndex(a => a.key === key); if (i < 0) throw new Error("no ask " + key + " in " + asks.map(a => a.key)); return asks.splice(i, 1)[0]; };
  const c = document.body.appendChild(document.createElement("div"));
  const srv = () => [{ id: 2, title: "Fix login" }, { id: 1, title: "Write spec" }];

  const [ans] = createSignal<any>(() => ask("list"), { loadingValue: null } as any);
  const seen = createMemo(() => { try { return ans(); } catch { return null; } });
  const [rows, setRows] = createOptimisticStore<any[]>(() => (seen() ?? []).map((x: any) => ({ id: x.id, title: x.title })), [], { key: "id" } as any);
  const [selected, setSelected] = createSignal<number | null>(null);
  const sel = createMemo(() => { const s = selected(); return s == null ? null : rows.find((r: any) => r.id === s) ?? null; });

  const reorder = action(function* (id: number, index: number, row: any) {
    setRows((rs: any[]) => { const w = rs.filter(r => r.id !== id); return [...w.slice(0, index), row, ...w.slice(index)]; });
    try { yield ask(`move:${id},${index}`); } catch { return; }
    refresh(ans);
  });
  const rename = action(function* (i: number, id: number, t: string) {
    setRows((d: any) => { d[i].title = t; });
    try { yield ask(`rename:${id}`); } catch { return; }
    refresh(ans);
  });

  render(() => <div><ul><For each={rows}>{(r: any) => <li>#{r.id} {r.title}</li>}</For></ul><h2>{sel() ? `#${sel()!.id} ${sel()!.title}` : "none"}</h2></div>, c);
  const screen = () => [...c.querySelectorAll("li")].map(l => l.textContent).join(",") + " || " + c.querySelector("h2")!.textContent;
  const row = (id: number) => rows.find((r: any) => r.id === id);

  take("list").res([{ id: 1, title: "Write spec" }, { id: 2, title: "Fix login" }]); await tick();
  reorder(2, 0, row(2)); await tick();           // up #2
  reorder(1, 0, row(1)); await tick();           // up #1
  reorder(1, 1, row(1)); await tick();           // down #1
  take("move:1,1").res({}); await tick();        // accepted: re-asks the list
  setSelected(1); await tick();
  rename(rows.findIndex((r: any) => r.id === 1), 1, "Alpha"); await tick();
  expect(screen()).toBe("#2 Fix login,#1 Alpha || #1 Alpha");
  take("list").res(srv()); await tick();
  take("rename:1").rej(new Error("declined")); await tick();
  // in the air: move:2,0 and move:1,0
  expect(screen()).toBe("#2 Fix login,#1 Write spec || #1 Write spec");   // got "... || #1 Alpha"
});
