/**
 * @jsxImportSource @solidjs/web
 * @vitest-environment jsdom
 */
import { test, expect } from "vitest";
import { For, Loading, action, createSignal, createMemo, createProjection, createErrorBoundary, untrack, createOptimisticStore, flush } from "solid-js";
import { render } from "../src/index.js";
const tick = async () => { for (let i = 0; i < 4; i++) { await new Promise(r => setTimeout(r, 0)); flush(); } };

test("two readers of one store row agree on a guess made while a selection is held", async () => {
  const asks: { key: string; res: (v: any) => void; rej: (e: any) => void }[] = [];
  const ask = (key: string) => new Promise<any>((res, rej) => asks.push({ key, res, rej }));
  const take = (key: string) => asks.splice(asks.findIndex(a => a.key === key), 1)[0];
  const c = document.body.appendChild(document.createElement("div"));
  let api: any;
  function App() {
    const [selected, setSelected] = createSignal(3);
    const [cards, setCards] = createOptimisticStore(async () => await ask("cards"), [] as any[], { key: "id" } as any);
    const [items, setItems] = createOptimisticStore(async () => await ask(`items${selected()}`), [] as any[], { key: "id" } as any);
    const addItem = action(function* (text: string) {
      setItems((rs: any[]) => [...rs, { id: -1, text, done: false }]);
      setCards((d: any) => { d[0].total = d[0].total + 1; });
      yield ask("addItem");
    });
    const toggle = action(function* (i: number) {
      setItems((d: any) => { d[i].done = !d[i].done; });
      setCards((d: any) => { d[0].done = d[0].done + 1; });
      yield ask("toggle");
    });
    const select = action(function* (id: number) { setSelected(id); });
    api = { addItem, toggle, select };
    const caught = (f: () => any, alt: any) => { const acc = untrack(() => (createErrorBoundary as any)(() => f(), () => ({ fb: alt }))); return () => { const v = acc(); return v && typeof v === "object" && "fb" in v ? v.fb : v; }; };
    const selM = createMemo(() => [{ id: selected() }]);
    const sel = createProjection(() => selM() as any, [] as any, { key: "id" } as any) as any;
    function Detail(props: { id: number }) {
      const di = caught(createMemo(() => cards.findIndex((r: any) => r.id === props.id)), -1);
      const here = createMemo(() => caught(() => cards[di()], null)());
      return <span>detail {here()?.done}/{here()?.total} <Loading on={props.id} fallback="loading">{items.filter((x: any) => x.done).length}/{items.length} done</Loading></span>;
    }
    return <div>
      <Loading on={"v1"} fallback="loading"><For each={cards}>{(r: any) => <span>#{r.id} {r.done}/{r.total}</span>}</For></Loading>|
      <For each={sel}>{(s: any) => <Detail id={s.id} />}</For>
    </div>;
  }
  render(() => <App />, c);
  const screen = () => c.textContent!.replace(/\s+/g, " ").trim();
  await tick();
  take("cards").res([{ id: 3, done: 1, total: 2 }, { id: 1, done: 0, total: 1 }]); await tick();
  take("items3").res([{ id: 31, text: "read", done: true }, { id: 32, text: "approve", done: false }]); await tick();
  api.addItem("qa"); await tick();
  api.select(1); await tick();                     // held with the add (its guess is on the items answer)
  api.toggle(1); await tick();                     // toggle "approve" on the held list
  // the card, the detail and the progress all show the toggle
  expect(screen()).toBe("#3 2/3#1 0/1|detail 2/3 2/3 done");   // got "#3 2/3#1 0/1|detail 1/3 1/3 done"
});
