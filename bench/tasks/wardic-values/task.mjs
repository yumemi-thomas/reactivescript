// Wardic's values (09 MO-10a, MO-10b, MO-12, MO-11q): a value derived from a `ref` argument, a tuple whose function is
// called from a handler, a motion element that animates to them — all under the provider whose context they read.
// Solid: `const percent = createTransform(() => props.progress, p => p * 100)`, `const [size, next] = createCycle(…)`.
// Not rendered on the server here (bench/tasks/wardic-motion: Wardic's server render is its `solid` condition's source).
const width = page => page.evaluate(() => Math.round(document.querySelector(".bar").getBoundingClientRect().width));
export default {
  title: "Wardic: a derived value, a cycle and an element that animates to them, under the provider",
  types: [
    { name: "the transform's function is typed by its source", edit: ["(p: number) => p * 100", "(p: string) => p.length"], expect: /TS2345|TS2769/ },
    { name: "the derived value keeps its type", edit: ["{percent}% {size}", "{percent.toUpperCase()}% {size}"], expect: /TS2339|TS2551/ },
    { name: "a motion element's props are the library's", edit: ["transition={{ duration: 0.05 }}", "transition={{ duration: \"fast\" }}"], expect: /TS2322|TS2769/ },
  ],
  bad: [
    { name: "the meter beside the provider, not under it", edit: ["    <Meter progress={progress} />\n    <button class=\"more\" onClick={() => { progress := 0.5 }}>more</button>\n  </WardicProvider>", "    <button class=\"more\" onClick={() => { progress := 0.5 }}>more</button>\n  </WardicProvider>\n  <Meter progress={progress} />"], expect: "CONTEXT_NOT_FOUND" },
    { name: "a value made in a handler, not where the component is made", edit: ["onClick={() => { next() }}", "onClick={() => { createCycle(1, 2) }}"], expect: "INSTANTIATION_NOT_BOUND" },
    { name: "the cycle turned while the view computes", edit: ['<p class="label">', '<p class="label">{next()}'], expect: "IO_IN_REACTIVE" },
    { name: "the transform's function writes", edit: ["(p: number) => p * 100", "(p: number) => { seen := p; return p * 100 }"], edit2: ["  percent = createTransform", "  source seen: number := 0\n  percent = createTransform"], expect: "REACTIVE_WRITE_IN_OWNED_SCOPE" },
    { name: "the derived value written", edit: ["onClick={() => { next() }}", "onClick={() => { percent := 100 }}"], expect: "WRITE_TO_NON_SOURCE" },
    { name: "the derived value kept in a source by an effect", edit: ["  [size, next] = createCycle", "  source shown: number := 0\n  effect (percent) { shown := $0 }\n  [size, next] = createCycle"], advise: "EFFECT_RELAY_TEAR" },
  ],
  async run(h) {
    const base = await h.serve(); const page = await h.open(base);
    h.check("the derived value, and the bar animated to it", await h.until(async () => /^25% small/.test(await h.text(page, ".label")) && (await width(page)) === 50), `${await h.text(page, ".label")} / ${await width(page)}px`);
    await page.click(".more");
    h.check("the value follows the prop, and the bar follows the value", await h.until(async () => /^50% small/.test(await h.text(page, ".label")) && (await width(page)) === 100), `${await h.text(page, ".label")} / ${await width(page)}px`);
    await page.click(".size");
    h.check("the cycle turns, from a handler", await h.until(async () => /^50% large/.test(await h.text(page, ".label"))), await h.text(page, ".label"));
    h.check("no console errors or warnings", h.problems.length === 0, h.problems);
  },
};
