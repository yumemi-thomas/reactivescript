// A keyed list edited in place (06 ST-4, W-6): rows keep their identity, and so their own state, by their key through
// an insert, a removal, a move and a rename. Solid: `<For>` over a store, rows keyed by `id`.
const order = async (h, page) => (await page.locator("li .title").allTextContents()).join(",");
const open = async (h, page) => (await page.locator("li.open .title").allTextContents()).join(",");
// rows by position: open the second row, put a row in front — the open row should still be `cook`
const byIndex = async h => {
  const base = await h.serve(); const page = await h.open(base);
  await page.click("li >> nth=1 >> .title"); await page.click(".add"); await new Promise(r => setTimeout(r, 300));
  h.check("the opened row is still the row that was opened", (await open(h, page)) === "cook", `open: ${await open(h, page)} of ${await order(h, page)}`);
};
export default {
  title: "A keyed list, edited: insert, remove, move, rename, reset",
  types: [
    { name: "a row keeps its type where the list is edited", edit: ["tasks := ts => [{ id: id, title: \"new\" }, ...ts]", "tasks := ts => [{ id: id, name: \"new\" }, ...ts]"], expect: /TS2322|TS2353|TS2345/ },
    { name: "a path write is typed by the row's field", edit: ["tasks[i].title := t => `${t}!`", "tasks[i].title := t => len(t)"], expect: /TS2322|TS2345/ },
  ],
  bad: [
    { name: "the list reset from a handler with two rows of one key", edit: ['tasks := [{ id: 1, title: "wash" }, { id: 2, title: "cook" }] }}>reset', 'tasks := [{ id: 1, title: "wash" }, { id: 1, title: "cook" }] }}>reset'], expect: "DUPLICATE_KEY" },
    { name: "rows added in a handler's functional write, two written with one key", edit: ['tasks := ts => [{ id: id, title: "new" }, ...ts]', 'tasks := ts => [{ id: 9, title: "new" }, { id: 9, title: "newer" }, ...ts]'], expect: "DUPLICATE_KEY" },
    { name: "the rows keyed by their index: a row's state stays at its position, not with its row", edit: ["source tasks: Task[] key id := [", "source tasks: Task[] := ["], expect: "UNSTABLE_LIST_IDENTITY", orSafe: byIndex },
    { name: "the rows shown from a copy rebuilt with the index as its key", edit: ["<ul>{for task in tasks {", "<ul>{for task in tasks.map((t, i) => ({ id: i, title: t.title })) {"], expect: "UNSTABLE_LIST_IDENTITY" },
    { name: "a row renamed by assigning its field through the loop's name", edit: ["let i = tasks.findIndex(t => t.id == task.id); tasks[i].title := t => `${t}!`", "task.title := `${task.title}!`"], expect: "WRITE_TO_NON_SOURCE" },
    { name: "the list reordered in place", edit: ["let i = tasks.findIndex(t => t.id == task.id); tasks := ts => swapped(ts, i)", "tasks.reverse()"], expect: "MUTATION_IN_PLACE" },
  ],
  async run(h) {
    const base = await h.serve(); const page = await h.open(base);
    await h.until(async () => (await order(h, page)) === "wash,cook,read");
    await page.click("li >> nth=1 >> .title");
    h.check("a row's own state", (await open(h, page)) === "cook", await open(h, page));
    await page.click(".add");
    h.check("insert in front: four rows, the opened one still `cook`", await h.until(async () => (await order(h, page)) === "new,wash,cook,read") && (await open(h, page)) === "cook", `${await order(h, page)} / open ${await open(h, page)}`);
    await page.click("li >> nth=2 >> .up");
    h.check("move up: the row moves, its state with it", await h.until(async () => (await order(h, page)) === "new,cook,wash,read") && (await open(h, page)) === "cook", `${await order(h, page)} / open ${await open(h, page)}`);
    await page.click("li >> nth=1 >> .rename");
    h.check("rename in place: the row keeps its state", await h.until(async () => (await order(h, page)) === "new,cook!,wash,read") && (await open(h, page)) === "cook!", `${await order(h, page)} / open ${await open(h, page)}`);
    await page.click("li >> nth=0 >> .remove");
    h.check("remove: the others stay as they are", await h.until(async () => (await order(h, page)) === "cook!,wash,read") && (await open(h, page)) === "cook!", `${await order(h, page)} / open ${await open(h, page)}`);
    await page.click(".reset");
    h.check("reset to rows written out: the kept keys keep their rows' state", await h.until(async () => (await order(h, page)) === "wash,cook") && (await open(h, page)) === "cook", `${await order(h, page)} / open ${await open(h, page)}`);
    h.check("no console errors or warnings", h.problems.length === 0, h.problems);
  },
};
