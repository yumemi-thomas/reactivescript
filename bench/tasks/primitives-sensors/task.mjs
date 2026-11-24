// solid-primitives' browser sensors (09 MO-10a, MO-10b, MO-10d, MO-10g): accessors a primitive hands back, read as values;
// a store whose fields are followed; a callback the library calls later. Solid: `const wide = createMediaQuery(…)`,
// `const pos = createMousePosition()`, `createShortcut(["Control", "S"], save)`. Rendered on the server and hydrated:
// three of the four packages make an effect in the browser that they do not make on the server, which a primitive's own
// owner keeps from moving the page's hydration keys (MO-10a).
export default {
  title: "solid-primitives: media, network, keyboard and pointer sensors as values, a shortcut that writes",
  types: [
    { name: "a sensor's value keeps its type: a boolean, not a string", edit: ['layout = compact || !wide ? "narrow" : "wide"', 'layout = compact || !wide.startsWith("w") ? "narrow" : "wide"'], expect: /TS2339|TS2551/ },
    { name: "a primitive's parameter is the library's", edit: ['createMediaQuery("(min-width: 600px)")', "createMediaQuery(600)"], expect: /TS2345|TS2769/ },
    { name: "a store's fields are the library's", edit: ["pointer at {pointer.x}, {pointer.y}", "pointer at {pointer.x}, {pointer.z}"], expect: /TS2339|TS2551/ },
    { name: "the keys held are a list of strings", edit: ['{keys.join("+") || "none"}', '{keys.toFixed(1) || "none"}'], expect: /TS2339|TS2551/ },
  ],
  bad: [
    { name: "a primitive made where the view reads it, again on every change", edit: ['{online ? "online" : "offline"}', '{createConnectivitySignal() ? "online" : "offline"}'], expect: "INSTANTIATION_NOT_BOUND" },
    { name: "a primitive made in a click handler, not where the component is made", edit: ["onClick={() => { compact := c => !c }}", "onClick={() => { createMousePosition() }}"], expect: "INSTANTIATION_NOT_BOUND" },
    { name: "the query computed from state: the primitive reads it once", edit: ['createMediaQuery("(min-width: 600px)")', 'createMediaQuery(compact ? "(min-width: 900px)" : "(min-width: 600px)")'], expect: "SNAPSHOT_ARGUMENT" },
    { name: "a sensor's value written", edit: ["onClick={() => { compact := c => !c }}", "onClick={() => { wide := false }}"], expect: "WRITE_TO_NON_SOURCE" },
    { name: "the layout kept in a source by an effect, not derived", edit: ['  layout = compact || !wide ? "narrow" : "wide"', '  source layout: string := "narrow"\n  effect (wide) { layout := $0 && !compact ? "wide" : "narrow" }'], advise: "EFFECT_RELAY_TEAR" },
    { name: "the shortcut's callback called where it is given", edit: ["() => { saves := n => n + 1 }, { preventDefault: true }", "bump(), { preventDefault: true }"], edit2: ["  wide = createMediaQuery", "  action bump() { saves := n => n + 1 }\n  wide = createMediaQuery"], expect: "ACTION_CALLED_IN_OWNED_SCOPE" },
    { name: "the accessor called, as in Solid", edit: ['{online ? "online" : "offline"}', '{online() ? "online" : "offline"}'], ts: /TS2349|TS6234/ },
  ],
  async run(h) {
    const r = await h.ssr("/");
    h.check("server: no window, no network, no pointer — the sensors' server values", !r.error && /narrow, online/.test(r.text) && /held: none; saved 0/.test(r.text) && /pointer at 0, 0/.test(r.text), r.error?.message ?? r.text);
    const base = await h.serve({ ssr: true }); const page = await h.open(base);
    h.check("hydrated: the window's width is heard", await h.until(async () => /wide, online/.test(await h.text(page, ".layout"))), await h.text(page));
    await page.setViewportSize({ width: 400, height: 600 });
    h.check("the media query follows the window", await h.until(async () => /narrow, online/.test(await h.text(page, ".layout"))), await h.text(page, ".layout"));
    await page.setViewportSize({ width: 800, height: 600 }); await h.until(async () => /wide/.test(await h.text(page, ".layout")));
    await page.click(".compact");
    h.check("an equation over a sensor and a source", await h.until(async () => /narrow, online/.test(await h.text(page, ".layout"))), await h.text(page, ".layout"));
    await page.context().setOffline(true);
    h.check("the network going away is heard", await h.until(async () => /offline/.test(await h.text(page, ".layout"))), await h.text(page, ".layout"));
    await page.context().setOffline(false);
    await page.mouse.move(30, 40);
    h.check("the pointer's position, a field at a time", await h.until(async () => /pointer at 30, 40/.test(await h.text(page, ".pointer"))), await h.text(page, ".pointer"));
    await page.keyboard.down("Control"); await page.keyboard.down("s");
    h.check("the keys held are listed, and the shortcut's callback wrote", await h.until(async () => /held: CONTROL\+S; saved 1/.test(await h.text(page, ".keys"))), await h.text(page, ".keys"));
    await page.keyboard.up("s"); await page.keyboard.up("Control");
    h.check("no console errors or warnings (no hydration mismatch)", h.problems.length === 0, h.problems);
  },
};
