/**
 * @jsxImportSource @solidjs/web
 * @vitest-environment jsdom
 */
import { test, expect } from "vitest";
import { For, Loading, Errored, action, createMemo, createSignal, createOptimisticStore, createErrorBoundary, refresh, flush, untrack } from "solid-js";
import { render } from "../src/index.js";
const tick = async () => { for (let i = 0; i < 4; i++) { await new Promise(r => setTimeout(r, 0)); flush(); } };

test("a row mounted by For after a held selection shows its values, not blanks, when the latest re-ask of a list it reads fails", async () => {
  const asks: { key: string; res: (v: any) => void; rej: (e: any) => void }[] = [];
  const ask = (key: string) => new Promise<any>((res, rej) => asks.push({ key, res, rej }));
  const take = (key: string) => asks.splice(asks.findIndex(a => a.key === key), 1)[0];
  const takeLatest = (key: string) => asks.splice(asks.map(a => a.key).lastIndexOf(key), 1)[0];
  const keys = () => asks.map(a => a.key).join(",");
  const c = document.body.appendChild(document.createElement("div"));
  let api: any;
  // `x catch () => alt`: an error boundary over x
  const caught = (f: () => any, alt: any) => {
    const acc = untrack(() => (createErrorBoundary as any)(() => f(), () => ({ fb: alt })));
    return () => { const v = acc(); return v && typeof v === "object" && "fb" in v ? v.fb : v; };
  };
  function App() {
    const [selected, setSelected] = createSignal<number | null>(null);
    const [todo] = createOptimisticStore(async () => await ask("todo"), [] as any[], { key: "id" } as any);
    const [doing, setDoing] = createOptimisticStore(async () => await ask("doing"), [] as any[], { key: "id" } as any);
    const sel = createMemo(() => selected() == null ? [] : [{ id: selected() }]);
    const move = action(function* (id: number, j: number) {
      setDoing((rs: any[]) => { const r = rs.find(x => x.id === id); const o = rs.filter(x => x.id !== id); return [...o.slice(0, j), r, ...o.slice(j)]; });
      yield ask(`move${j}`);
      refresh(todo); refresh(doing);
    });
    const select = action(function* (id: number) { setSelected(id); });
    api = { move, select };
    function Detail(props: { id: number }) {
      // which list holds the card
      const ti = caught(() => todo.findIndex((r: any) => r.id === props.id), -1);
      const di = caught(() => doing.findIndex((r: any) => r.id === props.id), -1);
      const col = createMemo(() => ti() >= 0 ? "todo" : di() >= 0 ? "doing" : "");
      return <b>#{props.id} in {col()}</b>;
    }
    const list = (rs: any[]) => <Loading fallback="loading"><Errored fallback={() => "error"}><For each={rs}>{(r: any) => <span>{r.id}</span>}</For></Errored></Loading>;
    return <div>{list(todo)}|{list(doing)}|{sel().length === 0 ? "select a card" : ""}<For each={sel()}>{(s: any) => <Detail id={s.id} />}</For></div>;
  }
  render(() => <App />, c);
  const screen = () => c.textContent!.replace(/\s+/g, " ").trim();
  await tick();
  take("todo").rej(new Error("declined")); await tick();
  take("doing").res([{ id: 3 }, { id: 4 }]); await tick();
  expect(screen()).toBe("error|34|select a card");
  api.move(4, 0); await tick();                    // #4 up: never answered
  api.move(4, 1); await tick();                    // #4 down
  api.select(4); await tick();                     // held with the moves (the detail reads Doing)
  expect(screen()).toBe("error|34|select a card");
  expect(keys()).toBe("move0,move1,todo");         // (mounting the held detail asked To do again)
  take("move1").res(true); await tick();           // accepted: re-asks To do and Doing
  expect(keys()).toBe("move0,todo,todo,doing");
  takeLatest("todo").rej(new Error("declined")); await tick();   // the latest To do ask fails; Doing's is still out
  // still held, or the detail says where #4 is. Got "error|34|#4 in": the detail mounted with `col` blank.
  expect(["error|34|select a card", "error|34|#4 in doing"]).toContain(screen());
  // with take("todo") (the older ask) instead of takeLatest, it stays held
});
