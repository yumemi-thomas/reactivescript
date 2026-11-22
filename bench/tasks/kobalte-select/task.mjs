// Kobalte's Select with object options (09 MO-11c, MO-11q, MO-12): the options a list of records, each rendered by an
// .rx component, the value held by the app.
const options = async page => (await page.locator("[role=option]").allTextContents()).join(",");
// an item with no select above it: what Kobalte says when it is rendered
const stray = async h => { const base = await h.serve(); const page = await h.open(base); await new Promise(r => setTimeout(r, 300)); h.check("mounted", /picked: nothing/.test(await h.text(page, "body")), await h.text(page, "body")); };
export default {
  title: "Kobalte: a Select whose options are objects",
  declare: { "@kobalte/core/select": ["--run", "--dom"] },
  known: {
    "no console errors or warnings": "06 ST-1, ST-2, guide/libraries.md (\"A store has one identity\"): an `.rx` source of records is a Solid store, so the option the select is given as its `value` is a store's row. Kobalte 2.0.0-alpha reads the value's key inside an effect's callback (`SelectionManager.getKey`, from `SelectBase`'s effect), and Solid's development build warns of any reactive read there (`STRICT_READ_UNTRACKED`). The select works — every other check of this run is green — and the warning is the library's read, in the library: the same happens in a Solid app that keeps its options in `createStore`. `.rx` has no source of records that is not a store (the accepted limit: a structured source has one identity, and its rows are the store's).",
  },
  types: [
    { name: "the root's props are Kobalte's own", edit: ['optionValue="id"', "optionValue={5}"], expect: /TS2322|TS2769/ },
    { name: "an option keeps its type in the app's item component", edit: ["{props.item.rawValue.label}", "{props.item.rawValue.lable}"], expect: /TS2339|TS2551/ },
    { name: "what the select hands back is an option", edit: ["picked := next }}", "picked := next.id }}"], expect: /TS2322|TS2345|TS18047|TS2531/ },
  ],
  bad: [
    { name: "an item rendered outside the select (its context is the listbox's, which only running it shows)", edit: ['  <p class="picked">', '  <Option item={null} />\n  <p class="picked">'], dev: /context|Context|within|undefined|null/, drive: stray },
    { name: "the picked option written while the view computes", edit: ['<span class="value">{picked == null ? "" : picked.label}</span>', '<span class="value">{(() => { picked := null })()}</span>'], expect: "REACTIVE_WRITE_IN_OWNED_SCOPE" },
    { name: "the options sorted in place for the select", edit: ["options={fruits}", "options={fruits.sort()}"], expect: "MUTATION_IN_PLACE" },
    { name: "a part the kit does not have", edit: ["<Select.ItemLabel>{props.item.rawValue.label}</Select.ItemLabel>", "<Select.ItemText>{props.item.rawValue.label}</Select.ItemText>"], expect: "UNKNOWN_COMPONENT" },
  ],
  async run(h) {
    const base = await h.serve(); const page = await h.open(base);
    h.check("mounted: the placeholder, nothing picked", await h.until(async () => /Pick a fruit/.test(await h.text(page, "body")) && /picked: nothing/.test(await h.text(page, "body"))), await h.text(page, "body"));
    await page.click(".trigger");
    h.check("the options, each rendered by the app's component (in a portal)", await h.until(async () => (await options(page)) === "Apple,Banana"), await options(page));
    h.check("an option the app says is disabled", (await page.locator("[role=option][aria-disabled=true]").allTextContents()).join(",") === "Banana", await page.locator("[role=option][aria-disabled=true]").allTextContents());
    await page.click("[role=option] >> text=Apple");
    h.check("picking writes the app's source with the option itself", await h.until(async () => /picked: Apple/.test(await h.text(page, "body")) && (await h.text(page, ".value")) === "Apple"), await h.text(page, "body"));
    await page.click(".grow"); await page.click(".trigger");
    h.check("the options follow the source: an option added later is listed", await h.until(async () => (await options(page)) === "Apple,Banana,Cherry"), await options(page));
    await page.click("[role=option] >> text=Cherry");
    h.check("…and can be picked", await h.until(async () => /picked: Cherry/.test(await h.text(page, "body"))), await h.text(page, "body"));
    h.check("no console errors or warnings", h.problems.length === 0, h.problems);
  },
};
