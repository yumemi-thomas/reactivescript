/**
 * @jsxImportSource @solidjs/web
 * @vitest-environment jsdom
 */
import { test, expect } from "vitest";
import { refresh, createSignal, createMemo, createOptimisticStore, createErrorBoundary, flush, untrack } from "solid-js";
import { render } from "../src/index.js";
const tick = async () => { for (let i = 0; i < 4; i++) { await new Promise(r => setTimeout(r, 0)); flush(); } };

for (const v of ["over a memo", "over the store (control)"]) test(`a failed re-ask read through an error boundary ${v} doesn't halt`, async () => {
  const asks: { res: (v: any) => void; rej: (e: any) => void }[] = [];
  const ask = () => new Promise<any>((res, rej) => asks.push({ res, rej }));
  const halts: string[] = []; const ce = console.error;
  console.error = (...a: any[]) => { const m = a.map(String).join(" "); if (m.includes("REACTIVITY_HALTED")) halts.push(m.slice(0, 60)); };
  const c = document.body.appendChild(document.createElement("div"));
  let api: any;
  function App() {
    const [selected, setSelected] = createSignal(4);
    const [cards] = createOptimisticStore(async () => await ask(), [] as any[], { key: "id" } as any);
    const row = createMemo(() => cards.find((r: any) => r.id === selected()));
    const card = untrack(() => createErrorBoundary(
      v === "over the store (control)" ? () => cards.find((r: any) => r.id === selected()) : () => row(),
      () => null));
    api = { select: setSelected, reask: () => refresh(cards) };
    return <div>
      <h2>#{selected()} {card() == null ? "-" : card().title}</h2>
    </div>;
  }
  render(() => <App />, c);
  const screen = () => c.textContent!.replace(/\s+/g, " ").trim();
  await tick();
  asks.shift()!.res([{ id: 3, title: "Review" }, { id: 4, title: "Deploy" }]); await tick();
  expect(screen()).toBe("#4 Deploy");
  api.reask(); await tick();
  asks.shift()!.rej(new Error("declined")); await tick();   // the re-ask fails
  api.select(3); await tick();
  console.error = ce;
  expect(halts).toEqual([]);         // over a memo: ["[REACTIVITY_HALTED] An uncaught error halted…", …]
  expect(screen()).not.toBe("#4 Deploy");
});
