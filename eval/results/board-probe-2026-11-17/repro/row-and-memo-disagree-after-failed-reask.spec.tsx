/**
 * @jsxImportSource @solidjs/web
 * @vitest-environment jsdom
 */
import { test, expect } from "vitest";
import { For, Show, Errored, action, refresh, createSignal, createMemo, createOptimisticStore, flush } from "solid-js";
import { render } from "../src/index.js";
const tick = async () => { for (let i = 0; i < 4; i++) { await new Promise(r => setTimeout(r, 0)); flush(); } };

for (const V of ["base", "nofail", "bare"]) test(`${V}: a row and a memo over one optimistic store show the same title while a declined rename is held`, async () => {
  const asks: { k: string; res: (v: any) => void; rej: (e: any) => void }[] = [];
  const ask = (k: string) => new Promise<any>((res, rej) => asks.push({ k, res, rej }));
  const take = (k: string) => { const i = asks.findIndex(a => a.k === k); if (i < 0) throw new Error(`no ask ${k} in ${asks.map(a => a.k)}`); return asks.splice(i, 1)[0]; };
  const server: Record<string, any[]> = { a: [{ id: 1, t: "W" }, { id: 2, t: "F" }], b: [{ id: 3, t: "R" }, { id: 4, t: "D" }] };
  const answer = (k: string) => take(k).res(structuredClone(server[k]));
  let api: any;
  function App() {
    const C: Record<string, any> = {};
    for (const k of ["a", "b"]) {
      const [ans] = createSignal(async () => await ask(k), { loadingValue: null } as any);
      const [rows, setRows] = createOptimisticStore(() => ans() ?? [], [] as any[], { key: "id" } as any);
      C[k] = { ans, rows, setRows };
    }
    const [selected, setSelected] = createSignal<number | null>(null);
    const sel = createMemo(() => C.b.rows.find((r: any) => r.id === selected()) ?? null);
    // move a row to the end of its own list; once accepted, re-ask both lists
    const move = action(function* (k: string, id: number) {
      try {
        const row = { ...C[k].rows.find((r: any) => r.id === id) };
        C[k].setRows((rs: any[]) => [...rs.filter(r => r.id !== id), row]);
        yield ask("move" + id);
        refresh(C.a.ans); refresh(C.b.ans);
      } catch {}
    });
    const rename = action(function* (i: number, t: string) {
      try { C.b.setRows((rs: any[]) => { rs[i].t = t; }); yield ask("rename"); refresh(C.b.ans); } catch {}
    });
    api = { move, rename, setSelected, C };
    const list = () => <For each={C.b.rows}>{(r: any) => <span>#{r.id} {r.t} </span>}</For>;
    return <section>
      <Errored fallback={(e: any) => <b>{e().message}</b>}>
        {V === "bare" ? list() : <Show when={C.b.ans() != null} fallback={<i>loading</i>}>{list()}</Show>}
      </Errored>|<Errored fallback={<i>none</i>}><Show when={sel()} fallback={<i>none</i>}>{s => <>detail #{s().id} {s().t}</>}</Show></Errored>
    </section>;
  }
  const c = document.body.appendChild(document.createElement("div"));
  render(() => <App />, c);
  const screen = () => c.textContent!.replace(/\s+/g, " ").trim();
  await tick();
  answer("a"); await tick();
  api.move("a", 1); await tick();                                // a write on list a
  answer("b"); await tick();
  api.move("b", 3); await tick();                                // a write on list b, the first still out
  server.a = [server.a[1], server.a[0]]; take("move1").res(true); await tick();   // the first accepted: both lists re-asked
  api.setSelected(4); await tick();
  if (V === "nofail") answer("b"); else take("b").rej(new Error("down")); await tick();   // b's re-ask fails; a's is still out
  server.b = [server.b[1], server.b[0]]; take("move3").res(true); await tick();   // the second accepted: both re-asked again
  api.rename(0, "A"); await tick();                              // rename #4, first in b now
  take("rename").rej(new Error("declined")); await tick();       // declined
  answer("b"); await tick();                                     // b's re-ask lands; a's two re-asks are still out
  const s = screen();
  // base: the row shows "#4 A" (the declined guess, held with the second write, whose re-ask of a is out) while the
  // memo over the same store shows "#4 D". nofail (b's first re-ask answered): both "A". bare (no Show): both "D".
  expect(s.match(/detail #4 (\w)/)?.[1]).toBe(s.match(/#4 (\w) #3/)?.[1]);
});
