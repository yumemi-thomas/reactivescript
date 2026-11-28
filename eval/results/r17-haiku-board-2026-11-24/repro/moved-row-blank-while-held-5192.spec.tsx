/**
 * @jsxImportSource @solidjs/web
 * @vitest-environment jsdom
 */
import { test, expect } from "vitest";
import { For, Loading, action, createSignal, createOptimistic, flush } from "solid-js";
import { render } from "../src/index.js";
const tick = async () => { for (let i = 0; i < 4; i++) { await new Promise(r => setTimeout(r, 0)); flush(); } };
type C = { id: number };

test("a row moved by a guess renders blank once later guesses and held writes pile on", async () => {
  const asks: any[] = [];
  const ask = (k: string) => new Promise<any>(res => asks.push({ k, res }));
  const land = (k: string, v: any) => asks.splice(asks.findIndex(a => a.k === k), 1)[0].res(v);
  const [truth, setTruth] = createSignal<C[]>(async () => await ask("list"));
  const [list, guess] = createOptimistic(() => truth());
  const toEnd = action(function* (c: C) {
    guess(rs => [...rs.filter(x => x.id != c.id), c]);
    yield ask(`move:${c.id}`);
    setTruth(rs => [...rs.filter(x => x.id != c.id), c]);
  });
  const remove = action(function* (id: number) {
    guess(rs => rs.filter(x => x.id != id));
    yield ask(`rm:${id}`);
    setTruth(rs => rs.filter(x => x.id != id));
  });
  const add = action(function* (tmp: number) {
    guess(rs => [...rs, { id: tmp }]);
    const r = yield ask("add");
    setTruth(rs => [...rs.filter(x => x.id != tmp), { id: r.id }]);
  });
  const c = document.body.appendChild(document.createElement("div"));
  render(() => <Loading fallback="L"><ul><For each={list()}>{r => <li>{r.id}</li>}</For></ul></Loading>, c);
  const steps = [
    () => land("list", [{ id: 1 }, { id: 2 }]),
    () => add(-1),                 // guess [1, 2, -1]
    () => toEnd({ id: 2 }),        // guess [1, -1, 2']  (2' a new object)
    () => remove(1),               // guess [-1, 2']
    () => land("add", { id: 6 }),  // add's truth write, held: its change is entangled with the others
    () => land("move:2", true),    // move's truth write, held
    () => toEnd({ id: 4 }),        // guess [-1, 2', 4]
  ];
  await tick();
  for (let i = 0; i < steps.length; i++) { steps[i](); await tick(); }
  const held = c.innerHTML;
  land("rm:1", true); await tick(); land("move:4", true); await tick();
  expect(held).toBe("<ul><li>-1</li><li>2</li><li>4</li></ul>");     // actual: <ul><li>-1</li><li></li><li>4</li></ul>
  expect(c.innerHTML).toBe("<ul><li>6</li><li>2</li><li>4</li></ul>"); // passes: it settles right
});
