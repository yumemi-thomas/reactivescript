/**
 * @jsxImportSource @solidjs/web
 * @vitest-environment jsdom
 *
 * Plain Solid for pending-probe-inside-held-region.rx (no .rx runtime): a guess on `list` is out, then `sel := 1` (an
 * input of list's question) joins its hold (rx 05 H-11). The ruled verdict is `pending? list` true (H-11; Solid's
 * #4695 / S-44); Solid reads it true outside the Loading on(sel) region (with the whole read the .rx lowering makes) and
 * false in the same probe inside it, so `disabled={pending? list}` never disables there. rx records it as DV-22.
 * Run: copy to solid-next/packages/web/test/, `npx vitest run test/<file>`.
 */
import { test, expect } from "vitest";
import { Loading, Errored, For, action, createSignal, createOptimisticStore, isPending, flush } from "solid-js";
import { render } from "../src/index.js";
const tick = async () => { for (let i = 0; i < 4; i++) { await new Promise(r => setTimeout(r, 0)); flush(); } };
test("isPending(list) inside a Loading on(sel) region reads as outside it while a guess's action holds a sel change", async () => {
  const asks: { key: string; res: (v: any) => void }[] = [];
  const ask = (key: string) => new Promise<any>(res => asks.push({ key, res }));
  const take = (key: string) => { const i = asks.findIndex(a => a.key === key); if (i < 0) throw new Error("no ask " + key + " in " + asks.map(a => a.key)); return asks.splice(i, 1)[0]; };
  const c = document.body.appendChild(document.createElement("div"));

  const [sel, setSel] = createSignal(2);
  const [list, setList] = createOptimisticStore<any[]>(async (draft: any[]) => {
    const items = await ask(`checklist:${sel()}`);
    draft.length = 0; draft.push(...items);
  }, [], { key: "id" } as any);
  const flip = action(function* (item: number, to: boolean) {
    const j = list.findIndex((it: any) => it.id === item);
    setList((d: any) => { d[j].done = to; });
    yield ask(`toggle:${item}`);
  });

  render(() => <div>
    <p id="probe">pending: {isPending(() => { Reflect.ownKeys(list); return list; }) ? "yes" : "no"} sel: {sel()}</p>
    <Loading on={sel()} fallback={<p>loading</p>}>
      <Errored fallback={<p>err</p>}>
        <For each={list}>{(it: any) => <button disabled={isPending(() => { Reflect.ownKeys(list); return list; })} onClick={() => flip(it.id, !it.done)}>{it.text}:{it.done ? "x" : "_"}</button>}</For>
      </Errored>
    </Loading>
  </div>, c);
  const screen = () => c.textContent!.replace(/\s+/g, " ").trim();
  const disabled = () => [...c.querySelectorAll("button")].map(b => (b as HTMLButtonElement).disabled);

  take("checklist:2").res([{ id: 21, text: "repro", done: true }, { id: 22, text: "patch", done: false }]); await tick();
  console.log("loaded:", screen(), disabled());
  flip(22, true); await tick();
  console.log("after toggle:", screen(), disabled());
  setSel(1); await tick();
  console.log("after select 1:", screen(), disabled(), "| air:", asks.map(a => a.key).join(", "));
  expect(c.querySelector("#probe")!.textContent).toContain("pending: yes");   // outside the region: true
  expect(disabled()).toEqual([true, true]);   // inside: false on Solid (fails here)
});
