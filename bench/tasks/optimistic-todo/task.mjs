// An optimistic add (06 AC-1, AC-3, AC-4). Solid 2: `createOptimisticStore` over the fetched list, an `action` that
// writes the optimistic row, awaits the server and `refresh`es the list.
const rows = async page => (await page.locator("li").evaluateAll(ls => ls.map(l => `${l.textContent}:${l.className}`))).join(",");
export default {
  title: "An optimistic todo: a guess shown at once, the server asked, the list asked again",
  types: [
    { name: "a guessed row is the list's row type", edit: ["{ id: id, title: title, saving: true }", "{ id: id, title: title, saving: \"yes\" }"], expect: /TS2322|TS2345/ },
    { name: "the server's function keeps its parameters' types", edit: ["await addTodo(id, title)", "await addTodo(id, len(title))"], expect: /TS2345/ },
  ],
  bad: [
    { name: "an optimistic write with nothing to wait for: a guess in a handler that awaits nothing", edit: ["add(newId(), t) }}", "guess todos := ts => [...ts, { id: newId(), title: t, saving: true }] }}"], expect: "GUESS_OUTSIDE_HOLD" },
    { name: "an await before the optimistic write: the row shows only once the server has answered", edit: ["    guess todos := ts => [...ts, { id: id, title: title, saving: true }]\n    onFlush(() => { failed := \"\" })\n    try {\n      await addTodo(id, title)", "    onFlush(() => { failed := \"\" })\n    try {\n      await addTodo(id, title)\n      guess todos := ts => [...ts, { id: id, title: title, saving: true }]"], advise: "GUESS_AFTER_AWAIT" },
    { name: "the server's answer written to, not guessed on", edit: ["guess todos := ts =>", "todos := ts =>"], expect: "WRITE_TO_NON_SOURCE" },
    { name: "the server's refusal let out of the action", edit: ["    try {\n      await addTodo(id, title)\n      refresh todos\n    } catch (e) {\n      failed := e.message\n    }", "    await addTodo(id, title)\n    refresh todos"], expect: "UNCAUGHT_ACTION_FAILURE" },
    { name: "the list kept in a source seeded from the first answer, so there is nothing to ask again", edit: ["todos key id = await fetchTodos()", "source todos key id := await fetchTodos()"], expect: "INVALID_REFRESH_TARGET" },
    { name: "the action called while the view computes", edit: ['<p class="failed">{failed}</p>', '<p class="failed">{add("x", "y")}{failed}</p>'], expect: "ACTION_CALLED_IN_OWNED_SCOPE" },
  ],
  async run(h) {
    const base = await h.serve(); const page = await h.open(base);
    h.check("the list loads", await h.until(async () => (await rows(page)) === "milk:saved"), await rows(page));
    await page.fill(".new", "eggs"); await page.click(".add");
    // 150 ms before the server answers: the guess is on screen well before that
    await new Promise(r => setTimeout(r, 60));
    h.check("the new row shows at once, as a guess, and the input is cleared", (await rows(page)) === "milk:saved,eggs:saving" && (await page.inputValue(".new")) === "", `${await rows(page)} / input ${JSON.stringify(await page.inputValue(".new"))}`);
    h.check("the server's list replaces the guess (asked again, the row saved)", await h.until(async () => (await rows(page)) === "milk:saved,eggs:saved"), await rows(page));
    await page.fill(".new", "nothing"); await page.click(".add");
    await new Promise(r => setTimeout(r, 60));
    h.check("a row the server will refuse shows as a guess too", (await rows(page)) === "milk:saved,eggs:saved,nothing:saving", await rows(page));
    h.check("the refusal takes the guess back and says why, in one frame", await h.until(async () => (await rows(page)) === "milk:saved,eggs:saved" && /nothing to do/.test(await h.text(page, ".failed"))), `${await rows(page)} / ${await h.text(page, ".failed")}`);
    h.check("no console errors or warnings", h.problems.length === 0, h.problems);
  },
};
