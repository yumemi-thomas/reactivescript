// A shared store updater reused by two handlers; what is read out of a draft (RFC 09, 09 MO-10i).
const drive = keep => async h => {
  const base = await h.serve(); const page = await h.open(base);
  await page.click(".keep"); await page.click(".one"); await page.click(".show");
  const seen = await h.text(page, ".seen");
  // what was kept is what the cart held when it was kept: not the live store, and not a draft the library took back
  h.check("what was kept from the draft is a snapshot", seen === keep, seen);
};
export default {
  title: "Solid store: an updater shared by two handlers, and values read out of its draft",
  types: [
    { name: "the draft is the store's type: a field written with another type is refused", edit: ["d.total := d.total + len(d.items)", 'd.total := "many"'], expect: /TS2322|TS2345/ },
    { name: "a row of the draft's items is typed", edit: ["item.qty := item.qty + 1", "item.qty := item.count + 1"], expect: /TS2339|TS2551/ },
    { name: "the store's fields are typed where the view reads them", edit: ["{item.name} × {item.qty}", "{item.name} × {item.quantity}"], expect: /TS2339|TS2551/ },
  ],
  bad: [
    { name: "the store written outside its setter", edit: ["onClick={() => { seen := first() }}", "onClick={() => { cart.total := 0 }}"], expect: "WRITE_TO_NON_SOURCE" },
    { name: "the setter called while the view computes", edit: ['<p class="total">total {cart.total}</p>', '<p class="total">total {setCart(restock)}</p>'], expect: "IO_IN_REACTIVE" },
    { name: "the shared updater also called by hand, with something that is no draft", edit: ["onClick={() => { setCart(restock); setCart(restock) }}", "onClick={() => { restock(cart) }}"], expect: "DRAFT_ESCAPES" },
    { name: "live rows of the draft kept by a forEach callback", edit: ['setCart((d) => { record("items", d.items) })', 'let rows = []; setCart((d) => { d.items.forEach((row) => { rows.push(row) }) }); record("items", rows)'], expect: "DRAFT_ESCAPES", orSafe: drive('[{"name":"tea","qty":1},{"name":"milk","qty":2}]') },
    { name: "the draft's iterator kept", edit: ['setCart((d) => { record("items", d.items) })', 'setCart((d) => { record("items", d.items.values()) })'], expect: "DRAFT_ESCAPES", orSafe: drive("{}") },
    { name: "an await inside the updater", edit: ['setCart((d) => { record("items", d.items) })', 'setCart((d) => { await record("items", d.items) })'], expect: "DRAFT_ESCAPES" },
    { name: "a closure made in the updater that writes the draft later", edit: ['setCart((d) => { record("items", d.items) })', 'setCart((d) => { record("later", () => { d.total := 0 }) })'], expect: "DRAFT_ESCAPES" },
  ],
  async run(h) {
    const base = await h.serve(); const page = await h.open(base);
    h.check("mounted", await h.until(async () => /tea × 1.*milk × 2.*total 3/.test(await h.text(page))), await h.text(page));
    await page.click(".keep");
    await page.click(".one");
    h.check("the shared updater, from the first handler", await h.until(async () => /tea × 2.*milk × 3.*total 5/.test(await h.text(page))), await h.text(page));
    await page.click(".two");
    h.check("and twice from the second", await h.until(async () => /tea × 4.*milk × 5.*total 9/.test(await h.text(page))), await h.text(page));
    await page.click(".show");
    h.check("what was read out of the draft is as it was then (a copy, not the live store)", await h.until(async () => (await h.text(page, ".seen")) === '[{"name":"tea","qty":1},{"name":"milk","qty":2}]'), await h.text(page, ".seen"));
    h.check("no console errors or warnings", h.problems.length === 0, h.problems);
  },
};
