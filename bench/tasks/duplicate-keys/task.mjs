// Two rows of a keyed list with one key (06 ST-4): Solid keeps one row's state for both, or drops one.
const dup = async h => {
  const base = await h.serve(); const page = await h.open(base);
  await page.click(".add"); await page.click(".add");
  await new Promise(r => setTimeout(r, 300));
  h.check("the list after two adds", (await page.locator("li").count()) === 4, `${await page.locator("li").count()} rows: ${await h.text(page)}`);
};
export default {
  title: "A keyed list: every row has its own key",
  types: [
    { name: "a row's key field is its type's", edit: ["{ id: next, text: \"new\" }", "{ id: \"x\", text: \"new\" }"], expect: /TS2322|TS2345/ },
  ],
  bad: [
    { name: "two rows written with one key", edit: ['[{ id: 1, text: "a" }, { id: 2, text: "b" }]', '[{ id: 1, text: "a" }, { id: 1, text: "b" }]'], expect: "DUPLICATE_KEY" },
    // a key a click computes is not the checker's to read (bin R): the development build's runtime reads the rows a keyed
    // list is given and names the list on the console (06 ST-4d; Solid's own development build says nothing)
    { name: "rows added with a key the list already has (known only when it runs)", edit: ["rows := rs => [{ id: next, text: \"new\" }, ...rs]; next := n => n + 1", "rows := rs => [{ id: 1, text: \"new\" }, ...rs]"], dev: /duplicate key|DUPLICATE_KEY/i, drive: dup },
  ],
  async run(h) {
    const base = await h.serve(); const page = await h.open(base);
    await h.until(async () => (await page.locator("li").count()) === 2);
    await page.click("li >> nth=1");
    h.check("a row's own state", await h.until(async () => (await page.locator("li.on").count()) === 1 && (await page.textContent("li.on")) === "b"), await h.text(page));
    await page.click(".add");
    h.check("a row added in front: the picked row is still `b` (identity by key)", await h.until(async () => (await page.locator("li").count()) === 3 && (await page.textContent("li.on")) === "b"), await h.text(page));
    h.check("no console errors or warnings", h.problems.length === 0, h.problems);
  },
};
