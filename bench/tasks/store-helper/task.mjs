// A draft handed to a JS helper that changes it in place (09 MO-10i). Solid: `setStore(s => { arrayMove(s.columns, from,
// to) })` — the documented way to use an imperative helper on a store.
const names = async page => (await page.locator("li").allTextContents()).join(",");
// the helper used on the store itself, outside its setter: what Solid's development build says
const outside = async h => { const base = await h.serve(); const page = await h.open(base); await page.click(".first-last"); await new Promise(r => setTimeout(r, 300)); h.check("the list follows", (await names(page)) === "doing,done,todo", await names(page)); };
export default {
  title: "Solid store: a draft changed in place by a helper written in JS",
  types: [
    { name: "the helper's parameters are its own: a position is a number", edit: ["moveItem(d.columns, from, to)", "moveItem(d.columns, \"0\", to)"], expect: /TS2345/ },
    { name: "the helper is typed by the draft's rows: a key the row has not is refused", edit: ['sortBy(d.columns, "name")', 'sortBy(d.columns, "title")'], expect: /TS2345/ },
  ],
  bad: [
    { name: "the helper given the store itself, outside its setter", edit: ["setBoard((d) => { moveItem(d.columns, from, to); d.moves := d.moves + 1 })", "moveItem(board.columns, from, to)"], dev: /STORE|store|setter|mutat/i, drive: outside },
    { name: "the helper called while the view computes", edit: ['<p class="moves">{board.moves} moves</p>', '<p class="moves">{moveItem(board.columns, 0, 1)} moves</p>'], expect: "IO_IN_REACTIVE" },
    { name: "the draft kept by a closure the helper is given for later", edit: ['sortBy(d.columns, "name")', 'later(() => { sortBy(d.columns, "name") })'], edit2: ['import { moveItem, sortBy } from "./array.js"', 'import { moveItem, sortBy, later } from "./array.js"'], expect: "DRAFT_ESCAPES" },
    { name: "the setter called with the helper's answer, not a callback", edit: ['setBoard((d) => { sortBy(d.columns, "name") })', 'setBoard(sortBy(board.columns, "name"))'], expect: "DRAFT_ESCAPES" },
  ],
  async run(h) {
    const base = await h.serve(); const page = await h.open(base);
    await h.until(async () => (await names(page)) === "todo,doing,done");
    await page.click(".first-last");
    h.check("the helper moved the draft's own list: the store follows", await h.until(async () => (await names(page)) === "doing,done,todo" && /1 moves/.test(await h.text(page))), `${await names(page)} / ${await h.text(page, ".moves")}`);
    await page.click(".sort");
    h.check("a helper that sorts in place", await h.until(async () => (await names(page)) === "doing,done,todo"), await names(page));
    await page.click(".first-last"); await page.click(".sort");
    h.check("and again, composed", await h.until(async () => (await names(page)) === "doing,done,todo" && /2 moves/.test(await h.text(page))), `${await names(page)} / ${await h.text(page, ".moves")}`);
    h.check("no console errors or warnings", h.problems.length === 0, h.problems);
  },
};
