// A function kept in a record, read under `peek`, by a value parameter or by a seed: the read is frozen (E-5a, E-10;
// RFC 14, RFC 34). Solid: `untrack(() => fmt.total())`, `createSignal(fmt.total())`.
export default {
  title: "A formatter kept in a record: live where it is read, never frozen without saying so",
  types: [
    { name: "a formatter's result keeps its type through the record", edit: ['<p class="total">{fmt.total()}</p>', '<p class="total">{fmt.total().toFixed(1)}</p>'], expect: /TS2339|TS2551/ },
  ],
  bad: [
    { name: "the formatter read under a kept peek: the view shows the first value for ever", edit: ['<p class="total">{fmt.total()}</p>', '<p class="total">{peek fmt.total()}</p>'], expect: "SNAPSHOT_KEPT" },
    { name: "a kept peek of it in an equation", edit: ["label = createLabel(fmt.total())", "label = createLabel(fmt.total())\n  first = peek fmt.total()"], expect: "SNAPSHOT_KEPT" },
    { name: "the formatter's value given to a value parameter: the primitive is made from the first value", edit: ["stamp = createStamp(fmt.unit())", "stamp = createStamp(fmt.total())"], expect: "SNAPSHOT_ARGUMENT" },
    { name: "the formatter's value as a source's seed, with no peek", edit: ["stamp = createStamp(fmt.unit())", "stamp = createStamp(fmt.unit())\n  source seeded := fmt.total()"], expect: "SNAPSHOT_INITIALIZER" },
  ],
  async run(h) {
    const base = await h.serve(); const page = await h.open(base);
    h.check("mounted", await h.until(async () => /0 items\s*\[0 items\]\s*#items/.test(await h.text(page))), await h.text(page));
    await page.click("button"); await page.click("button");
    h.check("the view and the label follow the source through the record's formatter; the stamp is made once from a constant", await h.until(async () => /2 items\s*\[2 items\]\s*#items/.test(await h.text(page))), await h.text(page));
    h.check("no console errors or warnings", h.problems.length === 0, h.problems);
  },
};
