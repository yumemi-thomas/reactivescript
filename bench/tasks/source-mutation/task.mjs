// A source's value changed in place (`rows.push(2)`): nothing is told that it changed (W-1, W-6). Solid: mutating a
// signal's array, or a store outside its setter.
const click = async h => { const base = await h.serve(); const page = await h.open(base); await page.click(".add"); await new Promise(r => setTimeout(r, 300)); h.check("the view follows the click", /3 rows/.test(await h.text(page)), await h.text(page)); };
export default {
  title: "A list in a source: changed by a write, never in place",
  types: [
    { name: "a row keeps its type in the child", edit: ["<li>{it.name}</li>", "<li>{it.title}</li>"], expect: /TS2339|TS2551/ },
  ],
  bad: [
    { name: "the source's array pushed to in a handler: the view never hears of it", edit: ["rows := rs => [...rs, { id: len(rs) + 1, name: \"fig\" }]", "rows.push({ id: 3, name: \"fig\" })"], expect: "MUTATION_IN_PLACE" },
    { name: "a prop's array sorted in place while the view computes: the parent's source is reordered under it", edit: ["props.items.toSorted(", "props.items.sort("], expect: "MUTATION_IN_PLACE" },
    { name: "a row's field assigned through a local alias", edit: ["rows := rs => [...rs, { id: len(rs) + 1, name: \"fig\" }]", "let first = rows[0]; first.name := \"plum\""], expect: "WRITE_TO_NON_SOURCE" },
    { name: "the list spliced inside a functional write's own argument", edit: ["rows := rs => [...rs, { id: len(rs) + 1, name: \"fig\" }]", "rows := rs => rs.reverse()"], expect: "MUTATION_IN_PLACE" },
  ],
  async run(h) {
    const base = await h.serve(); const page = await h.open(base);
    h.check("mounted, sorted for display", await h.until(async () => /2 rows\s*apple\s*pear/.test(await h.text(page))), await h.text(page));
    await page.click(".add");
    h.check("a write adds a row; the sorted view follows; the source's own order is untouched", await h.until(async () => /3 rows\s*apple\s*fig\s*pear/.test(await h.text(page))), await h.text(page));
    h.check("no console errors or warnings", h.problems.length === 0, h.problems);
  },
};
