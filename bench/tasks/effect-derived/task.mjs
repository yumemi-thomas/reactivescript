// State derived through an effect (02 C-3): Solid's `createEffect(() => setTotal(qty() * price()))` — a value that is
// an equation of others, kept in a signal of its own by an effect. It is a frame late at best (the view shows the new
// quantity beside the old total; the server, which runs no effect, never computes it), and stale for ever when the
// effect does not name what it reads.
export default {
  title: "Derived state: an equation, not a source an effect keeps in step",
  types: [
    { name: "the equation keeps its type: a number", edit: ["{qty} × {price} = {total}", "{qty} × {price} = {total.length}"], expect: /TS2339/ },
  ],
  bad: [
    { name: "the total kept in a source, written by a mount effect that reads the others: computed once, stale after", edit: ["total = qty * price", "source total := 0\n  effect () { total := qty * price }"], expect: "EFFECT_RELAY_TEAR" },
    { name: "the same with the inputs named: a frame late, an equation written the long way", edit: ["total = qty * price", "source total := 0\n  effect (qty, price) { total := $0 * $1 }"], expect: "EFFECT_RELAY_TEAR" },
    { name: "the history appended by an effect on the quantity, not by the click that changed it", edit: ["let n = qty + 1; qty := n; history := h => [...h, n]", "qty := qty + 1"], edit2: ["effect (total) {", "effect (qty) { history := [...history, $0] }\n  effect (total) {"], expect: "EFFECT_RELAY_TEAR" },
    { name: "the title set by a mount effect that reads the total by name: sent once, never again", edit: ["effect (total) { setTitle(`cart: ${$0}`) }", "effect () { setTitle(`cart: ${total}`) }"], advise: "SNAPSHOT_IN_EFFECT" },
    { name: "the effect's own input written by it", edit: ["effect (total) { setTitle(`cart: ${$0}`) }", "effect (qty) { qty := $0 + 1 }"], expect: "EFFECT_WRITES_OWN_SOURCE" },
  ],
  async run(h) {
    const base = await h.serve(); const page = await h.open(base);
    h.check("mounted: the total, and the title the effect set", await h.until(async () => /1 × 5 = 5/.test(await h.text(page)) && await page.title() === "cart: 5"), `${await h.text(page)} / ${await page.title()}`);
    await page.click(".more"); await page.click(".more");
    h.check("the total follows the quantity in the same frame; the history is what the clicks did", await h.until(async () => /3 × 5 = 15\s*2, 3/.test(await h.text(page))), await h.text(page));
    await page.click(".raise");
    h.check("…and the price; the effect sends the new total out", await h.until(async () => /3 × 6 = 18/.test(await h.text(page)) && await page.title() === "cart: 18"), `${await h.text(page)} / ${await page.title()}`);
    h.check("no console errors or warnings", h.problems.length === 0, h.problems);
  },
};
