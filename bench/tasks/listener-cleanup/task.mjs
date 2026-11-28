// A subscription's disposer dropped: the listener outlives the component that made it (O-2, EF-5). Solid: an
// `addEventListener` in `onMount` with no `onCleanup`.
export default {
  title: "A JS listener: its disposer is kept and called when the panel closes",
  types: [
    { name: "the helper's callback takes no argument", edit: ['onShortcut("k", () => { hits := h => h + 1 })', 'onShortcut("k", (e: string) => { hits := h => h + 1 })'], expect: /TS2345/ },
  ],
  bad: [
    { name: "the disposer dropped in the mount effect", edit: ["let stop = onShortcut(\"k\", () => { hits := h => h + 1 })\n    return () => { stop() }", "onShortcut(\"k\", () => { hits := h => h + 1 })"], advise: "DISPOSER_DROPPED" },
    { name: "the disposer dropped in a click handler: a listener added per click", edit: ["onClick={() => { listeners := liveListeners() }}", "onClick={() => { onShortcut(\"j\", () => { listeners := 0 }) }}"], advise: "DISPOSER_DROPPED" },
    { name: "the disposer kept in a local, and never called nor returned", edit: ["return () => { stop() }", "log(\"listening\")"], advise: "DISPOSER_DROPPED" },
    { name: "a subscription made while the view computes", edit: ['<p class="hits">{hits} hits</p>', '<p class="hits">{hits} hits {onShortcut("j", () => {}) ? "" : ""}</p>'], expect: "IO_IN_REACTIVE" },
  ],
  async run(h) {
    const base = await h.serve(); const page = await h.open(base);
    await h.until(async () => /0 hits/.test(await h.text(page)));
    await page.keyboard.press("k"); await page.keyboard.press("k");
    h.check("the shortcut is heard while the panel is shown", await h.until(async () => /2 hits/.test(await h.text(page))), await h.text(page));
    await page.click(".count");
    h.check("one listener while it is shown", await h.until(async () => /1 listening/.test(await h.text(page))), await h.text(page));
    await page.click(".toggle"); await page.click(".count");
    h.check("none once it is closed: the effect's cleanup called the disposer", await h.until(async () => /0 listening/.test(await h.text(page))), await h.text(page));
    h.check("no console errors or warnings", h.problems.length === 0, h.problems);
  },
};
