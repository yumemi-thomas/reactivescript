// Wardic (Motion's API on Solid 2; 09 MO-11q, MO-12, MO-10a, 05 R-f-6): a motion element whose target follows the app's
// state, a gesture heard from the element's ward, and an exit animation under <AnimatePresence>. Solid: `<wardic.div
// animate={{ scale: big() ? 1.5 : 1 }} exit={{ opacity: 0 }} wardRef={card} />`, `const card = ward()`, `await
// card.next("tap")`. The animations are timed (0.3s), so the run asks for what must be true during and after one, with
// room on both sides, never for a frame.
const card = page => page.evaluate(() => { const c = document.querySelector(".card"); return c ? { opacity: Number(getComputedStyle(c).opacity), scale: new DOMMatrix(getComputedStyle(c).transform).a, text: c.textContent } : null; });
const stray = async h => { const base = await h.serve(); const page = await h.open(base); await new Promise(r => setTimeout(r, 400)); h.check("mounted", (await page.locator(".card").count()) === 2, await h.text(page, "body")); };
export default {
  title: "Wardic: a motion element with reactive props, a gesture heard from its ward, an exit animation",
  types: [
    { name: "a motion prop is the library's: a transition's duration is a number", edit: ["transition={{ duration: 0.3 }}", 'transition={{ duration: "slow" }}'], expect: /TS2322|TS2769|TS2345/ },
    { name: "a ward's events are the library's names", edit: ['card.next("tap")', 'card.next("tapp")'], expect: /TS2345|TS2769/ },
    { name: "the provider's environment is the library's", edit: ["env={DomLive}", "env={5}"], expect: /TS2322|TS2769/ },
    { name: "an element's own props are still the element's", edit: ['class="card" wardRef', 'clas="card" wardRef'], expect: /TS2322|TS2769|TS2353/ },
  ],
  bad: [
    { name: "a motion element beside the provider, not under it", edit: ["  <WardicProvider env={DomLive}>", "  <Card big={false} />\n  <WardicProvider env={DomLive}>"], expect: "CONTEXT_NOT_FOUND" },
    { name: "a ward made where the view reads it, a new one on every change", edit: ["wardRef={card}", "wardRef={ward()}"], expect: "INSTANTIATION_NOT_BOUND" },
    { name: "a ward made in a click handler, not where the component is made", edit: ["onClick={() => { big := b => !b }}", "onClick={() => { ward() }}"], expect: "INSTANTIATION_NOT_BOUND" },
    { name: "the hearing started while the component computes, not from its mount effect", edit: ["effect () { hear() }", "started = hear()"], expect: "ACTION_CALLED_IN_OWNED_SCOPE" },
    { name: "the ward's end let out of the action: its promise rejects when the element leaves", edit: ["    try {\n      await card.next(\"tap\")\n      taps := n => n + 1\n      onFlush(() => { hear() })\n    } catch (e) {\n      // the ward went with its element: nothing more to hear\n    }", "    await card.next(\"tap\")\n    taps := n => n + 1\n    onFlush(() => { hear() })"], expect: "UNCAUGHT_ACTION_FAILURE" },
    { name: "the taps counted by an effect, from a value the effect never hears of", edit: ["effect () { hear() }", "effect () { taps := props.big ? 1 : 0 }"], expect: "EFFECT_RELAY_TEAR" },
    { name: "the prop read once into a local: the target would never follow it", edit: ["  card = ward()", "  let scale = props.big ? 1.5 : 1\n  card = ward()"], expect: "JS_LOCAL" },
  ],
  async run(h) {
    const base = await h.serve(); const page = await h.open(base);
    h.check("mounted: the card is on the page", await h.until(async () => (await page.locator(".card").count()) === 1), await h.text(page, "body"));
    h.check("it fades in to its target (initial → animate)", await h.until(async () => { const c = await card(page); return c.opacity === 1 && Math.abs(c.scale - 1) < 0.01; }), await card(page));
    await page.click(".grow");
    h.check("the target follows the app's state: a reactive `animate` grows the card", await h.until(async () => Math.abs((await card(page)).scale - 1.5) < 0.01), await card(page));
    await page.click(".grow");
    h.check("…and back", await h.until(async () => Math.abs((await card(page)).scale - 1) < 0.01), await card(page));
    await page.click(".card");
    h.check("a tap is heard from the ward (awaited in the card's action)", await h.until(async () => /tapped 1$/.test((await card(page)).text)), await card(page));
    await page.click(".card");
    h.check("…and the next one: the action hears again", await h.until(async () => /tapped 2$/.test((await card(page)).text)), await card(page));
    await h.until(async () => Math.abs((await card(page)).scale - 1) < 0.01);
    await page.click(".toggle");
    // the exit: for a while the card is still on the page, fading; then it is gone
    let seen = null; for (let i = 0; i < 40 && !seen; i++) { const c = await card(page); if (c && c.opacity < 1 && c.opacity > 0) seen = c; else if (!c) break; else await new Promise(r => setTimeout(r, 10)); }
    h.check("leaving, the card stays on the page while it fades (exit)", !!seen, await card(page));
    h.check("…and is removed when the exit has ended", await h.until(async () => (await card(page)) === null), await card(page));
    await page.click(".toggle");
    h.check("shown again, a new card enters, its taps its own", await h.until(async () => { const c = await card(page); return !!c && c.opacity === 1 && /tapped 0$/.test(c.text); }), await card(page));
    h.check("no console errors or warnings", h.problems.length === 0, h.problems);
  },
};
