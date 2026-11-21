/**
// solidjs/solid#5104
 * @jsxImportSource @solidjs/web
 * @vitest-environment jsdom
 */
import { test, expect } from "vitest";
import { For, Show, Errored, Loading, action, refresh, createSignal, createOptimisticStore, flush } from "solid-js";
import { render } from "../src/index.js";
const tick = async () => { for (let i = 0; i < 4; i++) { await new Promise(r => setTimeout(r, 0)); flush(); } };

// Two lists, each an optimistic store over its own answer. One action re-asks both; one answer lands; then a guessed
// move takes a row from that list to the other, still re-asking. The other list's heading, which reads its answer
// (`ans() != null`) and its store's length, misses the guess its own <For> shows.
for (const W of ["one re-ask has landed", "neither re-ask has landed"]) test(`a heading counts the guess its list shows (${W})`, async () => {
  const asks: { k: string; res: (v: any) => void }[] = [];
  const ask = (k: string) => new Promise<any>(res => asks.push({ k, res }));
  const answer = (k: string, v: any) => { const i = asks.findIndex(a => a.k === k); asks.splice(i, 1)[0].res(v); };
  let api: any;
  function App() {
    const [doingAns] = createSignal(async () => await ask("doing"), { loadingValue: null } as any);
    const [doing, setDoing] = createOptimisticStore(() => doingAns() ?? [], [] as any[], { key: "id" } as any);
    const [doneAns] = createSignal(async () => await ask("done"), { loadingValue: null } as any);
    const [done, setDone] = createOptimisticStore(() => doneAns() ?? [], [] as any[], { key: "id" } as any);
    const reask = action(function* () { refresh(doneAns); refresh(doingAns); });   // an accepted save elsewhere re-asks both
    const move = action(function* () {                                              // #5 from done to doing, guessed
      setDone((rs: any[]) => rs.filter(r => r.id !== 5)); setDoing((rs: any[]) => [...rs, { id: 5 }]);
    });
    api = { reask, move };
    return <section>
      <h3>{doingAns() != null ? `Doing (${doing.length})` : "Doing"}</h3>
      <Loading fallback={<i>loading</i>}><Errored fallback={<b>error</b>}>
        <Show when={doingAns() != null}><For each={doing}>{(r: any) => <span>#{r.id} </span>}</For></Show>
      </Errored></Loading>
      | done: <For each={done}>{(r: any) => <span>#{r.id} </span>}</For>
    </section>;
  }
  const c = document.body.appendChild(document.createElement("div"));
  render(() => <App />, c);
  await tick();
  answer("doing", [{ id: 3 }, { id: 4 }]); answer("done", [{ id: 5 }]); await tick();
  api.reask(); await tick();
  if (W === "one re-ask has landed") { answer("done", [{ id: 5 }]); await tick(); }
  api.move(); await tick();
  const s = c.textContent!.replace(/\s+/g, " ").trim();
  const counted = Number(s.match(/Doing \((\d+)\)/)?.[1]); const shown = (s.split("|")[0].match(/#\d+ /g) || []).length;
  // one re-ask landed (main 99db9bce4): "Doing (2)#3 #4 #5 | done:" — the list shows the guess, its heading doesn't
  expect({ counted, shown, s }).toEqual({ counted: shown, shown, s });
});
