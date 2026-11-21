/**
 * @jsxImportSource @solidjs/web
 * @vitest-environment jsdom
 */
// A click handler reads (untracked) an async memo that has an answer on screen, while an action's refresh of it is
// in flight. Expected: the committed answer (the screen's). Observed: does it throw NotReadyError?
import { test, expect } from "vitest";
import { action, createMemo, createOptimisticStore, refresh, untrack, flush, NotReadyError } from "solid-js";
import { render } from "../src/index.js";
const tick = async () => { for (let i = 0; i < 4; i++) { await new Promise(r => setTimeout(r, 0)); flush(); } };
test("an untracked read of an answered memo while an action's refresh of it is out", async () => {
  const asks: { key: string; res: (v: any) => void }[] = [];
  const ask = (key: string) => new Promise<any>(res => asks.push({ key, res }));
  const take = (key: string) => { const i = asks.findIndex(a => a.key === key); return asks.splice(i, 1)[0]; };
  const c = document.body.appendChild(document.createElement("div"));
  const ans = createMemo(() => ask("cards"));
  const [board, guess] = createOptimisticStore(() => (ans() as any[]).map(x => ({ ...x })), [], { key: "id" });
  const move = action(function* (id: number) {
    guess(b => { const r = b.find(r => r.id === id); if (r) r.col = "done"; });
    yield ask(`move:${id}`);
    refresh(ans);
  });
  render(() => <ul>{(board as any[]).map(r => <li>{r.id} {r.col}</li>)}</ul>, c);
  take("cards").res([{ id: 3, col: "doing" }, { id: 4, col: "doing" }]); await tick();
  const before = untrack(() => (ans() as any[]).length);
  move(3); await tick();
  take("move:3").res({}); await tick();      // the refresh of `ans` is now in flight, inside the action
  let read: unknown;
  try { read = untrack(() => (ans() as any[]).length); } catch (e) { read = e instanceof NotReadyError ? "NotReadyError" : String(e); }
  console.log("before:", before, "during refresh:", read, "| in the air:", asks.map(a => a.key).join(", "));
  expect(read).toBe(2);
});
