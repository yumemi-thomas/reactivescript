// solid-use's atom and provider (09 MO-10b, MO-12, MO-8r): shapes with no row — a default export, one function that
// reads and writes, a call made while a component is made — given names by two modules of the app's own, and declared
// in the words there are. Solid: `const count = atom(0)`, `provide(Theme, value)`, `inject(Theme)`.
export default {
  title: "solid-use: an atom as a reader and a setter, its injection as a context of the app's own module",
  types: [
    { name: "the atom's setter takes the atom's type", edit: ["setCount(count + 1)", "setCount(\"1\")"], expect: /TS2345/ },
    { name: "the scope's value is a string", edit: ['<ThemeScope value={dark ? "dark" : "light"}>', "<ThemeScope value={dark ? 1 : 0}>"], expect: /TS2322|TS2769/ },
    { name: "the hook's value keeps its type", edit: ["{props.count} in {theme}", "{props.count} in {theme.toFixed(1)}"], expect: /TS2339|TS2551/ },
  ],
  bad: [
    { name: "the hook's reader beside its scope, not under it", edit: ['<ThemeScope value={dark ? "dark" : "light"}><Badge count={count} /></ThemeScope>', '<ThemeScope value={dark ? "dark" : "light"}></ThemeScope><Badge count={count} />'], expect: "CONTEXT_NOT_FOUND" },
    { name: "the atom's setter called while the view computes", edit: ["<Badge count={count} />", "<Badge count={count} />{setCount(1)}"], expect: "IO_IN_REACTIVE" },
    { name: "the atom's value written as a source is", edit: ["onClick={() => { setCount(count + 1) }}", "onClick={() => { count := count + 1 }}"], expect: "WRITE_TO_NON_SOURCE" },
    { name: "an atom made in a handler", edit: ["onClick={() => { dark := true }}", "onClick={() => { createAtom(1) }}"], expect: "INSTANTIATION_NOT_BOUND" },
    { name: "the count copied into a source by an effect", edit: ["  [count, setCount] = createAtom(0)", "  [count, setCount] = createAtom(0)\n  source doubled: number := 0\n  effect (count) { doubled := $0 * 2 }"], expect: "EFFECT_RELAY_TEAR" },
    { name: "the atom seeded from state, read once", edit: ["createAtom(0)", "createAtom(dark ? 1 : 0)"], expect: "SNAPSHOT_ARGUMENT" },
  ],
  async run(h) {
    const r = await h.ssr("/");
    h.check("server: the atom's value under the scope's theme", !r.error && /0 in light/.test(r.text), r.error?.message ?? r.text);
    const base = await h.serve({ ssr: true }); const page = await h.open(base);
    await page.click(".add");
    h.check("hydrated: the atom's setter, read back through a prop", await h.until(async () => /1 in light/.test(await h.text(page, "b"))), await h.text(page));
    await page.click(".dark");
    h.check("the provided value follows the app's state", await h.until(async () => /1 in dark/.test(await h.text(page, "b"))), await h.text(page));
    h.check("no console errors or warnings (no hydration mismatch)", h.problems.length === 0, h.problems);
  },
};
