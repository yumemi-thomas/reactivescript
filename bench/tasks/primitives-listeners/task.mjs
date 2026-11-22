// solid-primitives' listeners and schedulers (09 MO-10g, 02 EF-5a, 02 SC-4, AC-1d): callbacks a library calls later may
// write (`handler`); what a `make…` listener answers undoes it, and is kept; a function a primitive hands back is called
// from a handler. Solid: `onCleanup(makeFocusListener(el, cb))`, `const save = debounce(cb, 250)`, `createRAF(cb)`.
export default {
  title: "solid-primitives: a focus listener kept by its effect, an event bus, a debounced save, an animation-frame loop",
  types: [
    { name: "the bus's payload is the type the app gave it", edit: ["bus.emit(\"hello\")", "bus.emit(5)"], expect: /TS2345/ },
    { name: "the debounced function takes the callback's arguments", edit: ["save(next)", "save(\"next\")"], expect: /TS2345/ },
    { name: "the listener's callback is given a boolean", edit: ["(isActive: boolean) => { focused := isActive }", "(isActive: string) => { focused := isActive == \"yes\" }"], expect: /TS2345/ },
  ],
  bad: [
    { name: "the focus listener's disposer dropped in the effect", edit: ["let unlisten = makeFocusListener($0, (isActive: boolean) => { focused := isActive })\n      return () => { unlisten() }", "makeFocusListener($0, (isActive: boolean) => { focused := isActive })"], expect: "DISPOSER_DROPPED" },
    { name: "the disposer kept in a local, and never called nor returned", edit: ["return () => { unlisten() }", "log(\"listening\")"], expect: "DISPOSER_DROPPED" },
    { name: "a debounced function made in a handler: a new one, with its own timer, on every input", edit: ["onInput={() => { let next = typed + 1; typed := next; save(next) }}", "onInput={() => { debounce((n: number) => { saved := n }, 80) }}"], expect: "INSTANTIATION_NOT_BOUND" },
    { name: "the source read after its own write: the save is given the old count", edit: ["let next = typed + 1; typed := next; save(next)", "typed := n => n + 1; save(typed + 1)"], expect: "STALE_OWN_READ" },
    { name: "the loop started while the view computes", edit: ['<p class="loop">', '<p class="loop">{start()}'], expect: "IO_IN_REACTIVE" },
    { name: "a handler attribute given the call, not the function", edit: ["onClick={() => { start() }}", "onClick={start()}"], expect: "IO_IN_REACTIVE" },
    { name: "the bus emitted on while the view computes", edit: ['<p class="loop">', '<p class="loop">{bus.emit("render")}'], expect: "IO_IN_REACTIVE" },
  ],
  async run(h) {
    const base = await h.serve(); const page = await h.open(base);
    await page.focus(".field");
    h.check("focus is heard by the listener the effect keeps", await h.until(async () => /^editing/.test(await h.text(page, ".state"))), await h.text(page, ".state"));
    await page.keyboard.type("abc");
    h.check("three inputs, one save once they stop", await h.until(async () => /typed 3, saved 3/.test(await h.text(page, ".state"))), await h.text(page, ".state"));
    await page.click(".say");
    h.check("the bus's listener heard the message (and focus left the field)", await h.until(async () => /^not editing.*heard hello/.test(await h.text(page, ".state"))), await h.text(page, ".state"));
    await page.click(".start");
    h.check("the loop runs, started from a handler", await h.until(async () => /running, frames drawn/.test(await h.text(page, ".loop"))), await h.text(page, ".loop"));
    await page.click(".stop");
    h.check("…and stops", await h.until(async () => /stopped, frames drawn/.test(await h.text(page, ".loop"))), await h.text(page, ".loop"));
    h.check("no console errors or warnings", h.problems.length === 0, h.problems);
  },
};
