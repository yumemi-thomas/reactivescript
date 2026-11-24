// Formisch field arrays (RFC 23, 13 TY-1; 09 MO-11k): `<FieldArray>`, and the methods that change one — insert,
// remove, move — called from handlers.
const labels = async page => (await page.locator("input.label").evaluateAll(xs => xs.map(x => x.value))).join(",");
export default {
  title: "Formisch: an array field — insert, remove, move",
  types: [
    { name: "a row's path is typed through the array: a field the row has not is refused", edit: ['path={["items", list.items.indexOf(id), "label"]}', 'path={["items", list.items.indexOf(id), "lable"]}'], expect: /TS2322|TS2820/ },
    { name: "the methods take the paths of array fields only", edit: ['insert(form, { path: ["items"], initialInput: { label: "" } })', 'insert(form, { path: ["itmes"], initialInput: { label: "" } })'], expect: /TS2322|TS2820|TS2345/ },
    { name: "a new row's input is the schema's row", edit: ['initialInput: { label: "" } })', 'initialInput: { label: 5 } })'], expect: /TS2322|TS2345/ },
    { name: "the submit's output is the schema's output", edit: ["output.items.map(item => item.label)", "output.items.map(item => item.name)"], expect: /TS2339|TS2551/ },
  ],
  bad: [
    { name: "a row inserted while the view computes, not from a handler", edit: ['<p class="packed">packed: {packed}</p>', '<p class="packed">packed: {insert(form, { path: ["items"] })}{packed}</p>'], expect: "IO_IN_REACTIVE" },
    { name: "a method given to a button, called, not passed", edit: ['onClick={() => { insert(form, { path: ["items"], initialInput: { label: "" } }) }}', 'onClick={insert(form, { path: ["items"], initialInput: { label: "" } })}'], expect: "IO_IN_REACTIVE" },
    { name: "the form made in the view, again on every change", edit: ["<Form of={form} onSubmit", "<Form of={createForm({ schema: schema })} onSubmit"], expect: "INSTANTIATION_NOT_BOUND" },
    { name: "the form's rows kept in app state beside the form: copied once", edit: ["  form = createForm({ schema: schema, initialInput: { items: [{ label: \"tent\" }, { label: \"stove\" }] } })\n", "  form = createForm({ schema: schema, initialInput: { items: [{ label: \"tent\" }, { label: \"stove\" }] } })\n  source count := len(packed)\n"], expect: "SNAPSHOT_INITIALIZER" },
  ],
  async run(h) {
    const base = await h.serve(); const page = await h.open(base);
    h.check("mounted: the rows of the initial input", await h.until(async () => (await labels(page)) === "tent,stove"), await labels(page));
    await page.click(".more");
    h.check("insert: a third row, empty", await h.until(async () => (await labels(page)) === "tent,stove,"), await labels(page));
    await page.locator("input.label").nth(2).fill("map");
    await page.locator(".up").nth(2).click();
    h.check("move: the row goes up with what was typed in it", await h.until(async () => (await labels(page)) === "tent,map,stove"), await labels(page));
    await page.locator(".drop").nth(0).click();
    h.check("remove: the others keep their input", await h.until(async () => (await labels(page)) === "map,stove"), await labels(page));
    await page.click(".submit");
    h.check("the submit's typed output is the rows as they stand", await h.until(async () => /packed: map, stove/.test(await h.text(page, ".packed"))), await h.text(page, ".packed"));
    await page.locator(".drop").nth(0).click(); await page.locator(".drop").nth(0).click(); await page.click(".submit");
    h.check("the array's own rule: an empty list is refused with the schema's message", await h.until(async () => /Pack something/.test(await h.text(page))), await h.text(page));
    h.check("no console errors or warnings", h.problems.length === 0, h.problems);
  },
};
