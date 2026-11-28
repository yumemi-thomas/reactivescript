// solidjs/solid#5174
/**
 * @jsxImportSource @solidjs/web
 * @vitest-environment jsdom
 */
import { test, expect } from "vitest";
import { Loading, action, refresh, createSignal, flush } from "solid-js";
import { render } from "../src/index.js";
const tick = async () => { for (let i = 0; i < 4; i++) { await new Promise(r => setTimeout(r, 0)); flush(); } };

// A prop whose expression is a ternary over an async source. The compiled getter wraps the condition in a fresh memo.
// Read from a click handler while the source's re-ask is out (it already has a value), it throws NotReadyError.
for (const V of ["ternary", "plain"]) test(`a click handler reads a ${V} prop over a loaded source while the source re-asks`, async () => {
  const asks: { k: string; res: (v: any) => void }[] = [];
  const ask = (k: string) => new Promise<any>(res => asks.push({ k, res }));
  const land = (k: string, v: any) => { const i = asks.findIndex(a => a.k === k); asks.splice(i, 1)[0].res(v); };
  let got: any = "not clicked"; let read: any;
  function Child(props: { n: number }) {
    read = () => { try { got = props.n; } catch (e: any) { got = e.constructor.name; } };   // what a click handler does
    return <button>go</button>;
  }
  let reask: any;
  function App() {
    const [ans] = createSignal(async () => await ask("list"), { loadingValue: null } as any);
    reask = action(function* () { refresh(ans); });
    return <Loading fallback="L"><p>{ans() == null ? "loading" : ans().length}</p>{V === "ternary" ? <Child n={ans() == null ? -1 : ans().length} /> : <Child n={(ans() ?? []).length} />}</Loading>;
  }
  const c = document.body.appendChild(document.createElement("div"));
  render(() => <App />, c);
  await tick();
  land("list", [1, 2]); await tick();
  reask(); await tick();
  read();
  console.log("OUT", V, c.textContent, JSON.stringify(got));
  expect(got).toBe(2);
});
