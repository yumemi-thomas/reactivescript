/**
 * @jsxImportSource @solidjs/web
 * @vitest-environment jsdom
 */
import { test, expect } from "vitest";
import { For, Loading, Errored, action, createMemo, createSignal, createOptimistic, flush } from "solid-js";
import { render } from "../src/index.js";
const tick = async () => { for (let i = 0; i < 4; i++) { await new Promise(r => setTimeout(r, 0)); flush(); } };
type C = { id: number };

test("a guess that mounts a row reading a failed optimistic signal re-asks it and is held on that re-ask", async () => {
  const asks: any[] = [];
  const ask = (k: string) => new Promise<any>((res, rej) => asks.push({ k, res, rej }));
  const find = (k: string) => asks.splice(asks.findIndex(a => a.k === k), 1)[0];
  const [aT] = createSignal<C[]>(async () => await ask("a"));
  const [a, guessA] = createOptimistic(() => aT());
  const [bT] = createSignal<C[]>(async () => await ask("b"));
  const [b] = createOptimistic(() => bT());       // b has a guess layer too; no guess is ever made on it (with `const b = bT` it passes)
  const full = createMemo(() => b().length >= 3);
  const toFront = action(function* (id: number) {
    guessA(rs => [{ id }, ...rs.filter(x => x.id != id)]);   // a new object for the row, so For mounts a new row
    yield ask(`move:${id}`);
  });
  const c = document.body.appendChild(document.createElement("div"));
  render(() => <Loading fallback="L">
    <For each={a()}>{r => <i>{r.id}<Errored fallback="-"><b>{full() ? "full" : "ok"}</b></Errored></i>}</For>|
    <Errored fallback="b failed">{b().length}</Errored>
  </Loading>, c);
  await tick();
  find("a").res([{ id: 1 }, { id: 2 }]); await tick();
  find("b").rej(new Error("declined")); await tick();
  expect(c.textContent).toBe("1-2-|b failed");
  toFront(2); await tick();
  expect(asks.map(x => x.k)).toEqual(["move:2"]);  // actual: ["move:2", "b"]: the new row's read of `full` re-asks b
  expect(c.textContent).toBe("2-1-|b failed");     // actual: "1-2-|b failed": the guess waits for that re-ask
  // once the re-ask fails again, the guess shows: "2-1-|b failed"
});
