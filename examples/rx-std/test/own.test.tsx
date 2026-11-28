// What the originals' tests cannot show: the same primitives where an app uses them (events and effects outside an owner),
// the primitive with another API (storage), and the bugs of REPORT.md that run.
import { expect, test } from "vitest";
import { createRoot, createSignal, flush, createEffect } from "solid-js";
import { useKeyDownList, useCurrentlyHeldKey, createKeyHold, useKeyDownSequence } from "@rx-primitives/keyboard";
import { createFormControl } from "@rx-primitives/form-control";
import { createPersisted } from "@rx-primitives/storage";
import * as bug from "@rx-primitives/effect-cleanup/core";
import { log } from "../repros/effect-cleanup/dist/log.js";

const press = (type: string, key: string) => { window.dispatchEvent(Object.assign(new Event(type, { cancelable: true }), { key })); flush(); };
test("keyboard: keys pressed by the page, not inside a root", () => {
  const k = createRoot(() => ({ list: useKeyDownList(), held: useCurrentlyHeldKey(), seq: useKeyDownSequence(), a: createKeyHold("a") }));
  flush();
  press("keydown", "a"); expect(k.list()).toEqual(["A"]); expect(k.held()).toBe("A"); expect(k.a()).toBe(true);
  press("keydown", "b"); expect(k.list()).toEqual(["A", "B"]); expect(k.held()).toBe(null); expect(k.seq()).toEqual([["A"], ["A", "B"]]);
  press("keyup", "a"); press("keyup", "b"); expect(k.list()).toEqual([]);
});
test("form-control: a label registered from an event", async () => {
  const c = createRoot(() => createFormControl({ id: "f" }));
  const off = c.registerLabel("l"); flush(); expect(c.labelId()).toBe("l"); expect(c.getAriaLabelledBy("x", "y", undefined)).toBe("l x");
  off(); flush(); expect(c.labelId()).toBe(undefined);
});
test("storage: a value kept, and read again", async () => {
  const map = new Map<string, string>(); const store = { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => { map.set(k, v); }, removeItem: (k: string) => { map.delete(k); } };
  const [value, set] = createRoot(() => createPersisted("k", 1, store)); const seen: number[] = [];
  createRoot(() => createEffect(value, (v: number) => { seen.push(v); }));
  await new Promise(r => setTimeout(r)); flush(); await set(5); flush(); expect(map.get("k")).toBe("5"); expect(value()).toBe(5);
  const [again] = createRoot(() => createPersisted("k", 1, store)); createRoot(() => createEffect(again, () => {}));
  await new Promise(r => setTimeout(r)); flush(); expect(again()).toBe(5);
});
test("bug 1, fixed: an effect over an expression that stays equal keeps its listener", () => {
  const run = (f: (x: () => number) => unknown) => { log.length = 0; const [x, set] = createSignal(1); createRoot(() => { f(x); }); flush(); set(2); flush(); return log.join(","); };
  expect(run(bug.useListeningNamed)).toBe("on");
  expect(run(bug.useListening)).toBe("on");   // fixed (EF-5)
});
test("keyboard: a key pressed while an owner is being made is refused (the originals' signals are ownedWrite)", () => {
  const errors: string[] = []; const on = (e: ErrorEvent) => { errors.push(e.error?.message ?? e.message); e.preventDefault(); };
  window.addEventListener("error", on);
  createRoot(dispose => { const keys = useKeyDownList(); window.dispatchEvent(Object.assign(new Event("keydown"), { key: "q" })); flush(); expect(keys()).toEqual([]); dispose(); });
  window.removeEventListener("error", on);
  expect(errors.join()).toMatch(/REACTIVE_WRITE_IN_OWNED_SCOPE/);
});
