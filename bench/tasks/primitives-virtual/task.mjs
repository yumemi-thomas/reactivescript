// solid-primitives and TanStack Virtual around an element ref (07 §4, 09 MO-10a/b/g, 02 EF-5a). Solid: `let el;
// <div ref={el}>`, `createEventListener(() => el, …)`, `makeEventListener` / `makeResizeObserver` in `onMount` with an
// `onCleanup`, `createVirtualizer({ getScrollElement: () => el })`.
const first = async page => (await page.locator(".row").first().textContent()) ?? "";
export default {
  title: "solid-primitives and TanStack Virtual: listeners, an observer and a virtualizer on an element ref",
  types: [
    { name: "a listener's event is the library's, by the event's name", edit: ['if (e.key == "End")', 'if (e.keyy == "End")'], expect: /TS2339|TS2551/ },
    { name: "a virtual row is the library's VirtualItem", edit: ["row {item.index}</div>", "row {item.idx}</div>"], expect: /TS2339|TS2551/ },
    { name: "the observer's methods take an element", edit: ["sizes.observe($0)", "sizes.observe(5)"], expect: /TS2345|TS2769/ },
  ],
  bad: [
    { name: "the ref read while the view first computes: no element yet", edit: ['<p class="seen">{scrolls > 0 ? "scrolled" : "at rest"}, {width}px wide</p>', '<p class="seen">{scrolls > 0 ? "scrolled" : "at rest"}, {box.clientWidth}px wide</p>'], ts: /TS18047|TS18048|TS2531|TS2532/ },
    { name: "a listener's disposer dropped (its type is the library's alias for `() => void`)", edit: ["let stop = makeEventListener($0, \"scroll\", () => { scrolls := n => n + 1 })", "makeEventListener($0, \"scroll\", () => { scrolls := n => n + 1 })"], edit2: ["return () => { stop(); sizes.unobserve($0) }", "return () => { sizes.unobserve($0) }"], advise: "DISPOSER_DROPPED" },
    { name: "a listener added by hand in a click handler, its disposer dropped: one more on every click", edit: ["onClick={() => { scrollToIndex(0) }}", 'onClick={() => { makeEventListener(box, "scroll", () => { scrolls := 0 }) }}'], advise: "DISPOSER_DROPPED" },
    { name: "a listener primitive made in a handler, not where the component is made", edit: ["onClick={() => { scrollToIndex(0) }}", 'onClick={() => { createEventListener(box, "click", () => { scrolls := 0 }) }}'], expect: "INSTANTIATION_NOT_BOUND" },
    { name: "the virtualizer told to scroll while the view computes", edit: ['<p class="seen">', '<p class="seen">{scrollToIndex(5)}'], expect: "IO_IN_REACTIVE" },
    { name: "the observer made where the view reads it, again on every change", edit: ['<p class="seen">', '<p class="seen">{makeResizeObserver(() => {}).observe(box)}'], expect: "INSTANTIATION_NOT_BOUND" },
  ],
  async run(h) {
    const base = await h.serve(); const page = await h.open(base);
    h.check("only the rows in view are rendered, from the top", await h.until(async () => (await first(page)) === "row 0" && (await page.locator(".row").count()) < 40), `${await first(page)}, ${await page.locator(".row").count()} rows`);
    h.check("the resize observer reports the box's width", await h.until(async () => /at rest, 2\d\dpx wide/.test(await h.text(page, ".seen"))), await h.text(page, ".seen"));
    await page.focus(".box"); await page.keyboard.press("End");
    h.check("a key on the box (the primitive's listener, on the ref) jumps to the last row; the scroll listener hears it", await h.until(async () => /row 99\d\d/.test(await first(page)) && /scrolled/.test(await h.text(page, ".seen"))), `${await first(page)} / ${await h.text(page, ".seen")}`);
    await page.click(".top");
    h.check("the virtualizer's own method, from a handler: back to the top", await h.until(async () => (await first(page)) === "row 0"), await first(page));
    await page.evaluate(() => { document.querySelector(".box").style.width = "180px"; });
    h.check("the observer follows the element as it is resized", await h.until(async () => /1\d\dpx wide/.test(await h.text(page, ".seen"))), await h.text(page, ".seen"));
    h.check("no console errors or warnings", h.problems.length === 0, h.problems);
  },
};
