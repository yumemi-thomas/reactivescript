// solid-primitives' state helpers (09 MO-10a, MO-10b, 02 W-1a, C-3a): a signal's two halves, a store read a field at a
// time, accessors given on to another primitive, a pure function a memo computes with. Solid: `const [name, setName] =
// makePersisted(createSignal("anonymous"))`, `const sorted = createSorted(people, by(p => p.born))` — through a module of the app's own (sorted.js): the library's
// createSorted sorts in place when asked, so it is not `pure`, and the wrapper that never asks is (read from the code).
export default {
  title: "solid-primitives: a persisted signal, a static store, a sorted and paged list, a writable memo",
  types: [
    { name: "the sorted list keeps the row's type", edit: ["<li>{p.name}</li>", "<li>{p.nam}</li>"], expect: /TS2339|TS2551/ },
    { name: "the static store's setter takes the store's fields", edit: ["setSize({ width: 640, height: 480 })", "setSize({ width: \"640\", height: 480 })"], expect: /TS2322|TS2345|TS2769/ },
    { name: "the comparator's key is typed by the row", edit: ["=> p.born))", "=> p.birth))"], expect: /TS2339|TS2551/ },
  ],
  bad: [
    { name: "a setter called while the view computes", edit: ['<p class="who">hello {name}</p>', '<p class="who">hello {name}{setName("x")}</p>'], expect: "IO_IN_REACTIVE" },
    { name: "a handler attribute given the setter called", edit: ["onClick={() => { setName(\"Ada\") }}", "onClick={setName(\"Ada\")}"], expect: "IO_IN_REACTIVE" },
    { name: "the source's list sorted in place for display", edit: ["sorted = sortedBy(people, by((p: { name: string, born: number }) => p.born))", "sorted = people.sort((a: { name: string, born: number }, b: { name: string, born: number }) => a.born - b.born)"], expect: "MUTATION_IN_PLACE" },
    // 09 MO-8w: the library's own createSorted sorts the list it is given in place under `{ dirty: true }`, so its row is
    // not `pure` (it was, by hand, until the code was read): called where a view computes, it is refused
    // (no rule of the language reads the difference where the call is bound once — an instantiating fn is bound whether
    // or not it is `pure` — so the word is held where it can be: against the code, by rx-verify)
    { name: "the library's createSorted declared `pure`, as it was by hand: it sorts the list it is given in place when asked", file: "rx-types/@solid-primitives/sortable.d.rx", edit: ["export fn createSorted<T>(", "export pure fn createSorted<T>("], verify: ["rx-types/@solid-primitives/sortable.d.rx", /createSorted: declared pure, but when it is called it changes what it is given \(\[3,1,2\] to \[1,2,3\]\)/] },
    { name: "the memo's function writes a source", edit: ["createWritableMemo<number>(() => people.length > 3 ? 3 : 2)", "createWritableMemo<number>(() => { page := 1; return 2 })"], expect: "REACTIVE_WRITE_IN_OWNED_SCOPE" },
    { name: "the persisted name copied into a source by an effect", edit: ['  <p class="who">hello {name}</p>', '  source greeting: string := ""\n  effect (name) { greeting := "hello " + $0 }\n  <p class="who">{greeting}</p>'], advise: "EFFECT_RELAY_TEAR" },
    { name: "a primitive's value written as a source is", edit: ["onClick={() => { setPerPage(10); page := 1 }}", "onClick={() => { perPage := 10 }}"], expect: "WRITE_TO_NON_SOURCE" },
    { name: "a list primitive given a list computed from state, read once", edit: ["shown = createSegment(sorted, perPage, page)", "shown = createSegment(sorted, perPage, peek page)"], expect: "SNAPSHOT_KEPT" },
  ],
  async run(h) {
    const r = await h.ssr("/");
    h.check("server: the stored name's default, the first page of the sorted list", !r.error && /hello anonymous/.test(r.text) && /Ada ?Grace/.test(r.text) && !/Alan/.test(r.text), r.error?.message ?? r.text);
    const base = await h.serve({ ssr: true }); const page = await h.open(base);
    h.check("hydrated: sorted by year, two a page", await h.until(async () => /^Ada ?Grace$/.test(await h.text(page, "ol"))), await h.text(page, "ol"));
    await page.click(".next");
    h.check("the next page of the sorted list", await h.until(async () => /^Alan$/.test(await h.text(page, "ol"))), await h.text(page, "ol"));
    await page.click(".all");
    h.check("the memo written over: everyone on one page", await h.until(async () => /^Ada ?Grace ?Alan$/.test(await h.text(page, "ol")) && /10 a page/.test(await h.text(page, ".size"))), await h.text(page));
    await page.click(".add");
    h.check("the list changes: the memo is computed again, and the sort follows", await h.until(async () => /3 a page/.test(await h.text(page, ".size")) && /^Ada ?Grace ?Alan$/.test(await h.text(page, "ol"))), await h.text(page));
    await page.click(".sign");
    h.check("the persisted signal is set, and stored", await h.until(async () => /hello Ada/.test(await h.text(page, ".who"))) && /Ada/.test(await page.evaluate(() => localStorage.getItem("rx-bench-name") ?? "")), await h.text(page, ".who"));
    await page.click(".measure");
    h.check("the static store's fields follow its setter", await h.until(async () => /640 by 480/.test(await h.text(page, ".size"))), await h.text(page, ".size"));
    h.check("no console errors or warnings (no hydration mismatch)", h.problems.length === 0, h.problems);
  },
};
