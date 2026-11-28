// Hold probe (not a grader) for the hidden test "an item added while the checklist reloads shows once". An app whose
// toggle re-asks every column holds the checklist with that change until those re-asks land; the test answers only
// To do. At the test's check this accepts the expected rows, or the rows as they were before the add's answer landed
// (the add's guess still shown: a consistent hold). Then it answers the column re-asks still out and requires the
// settled checklist, progress and card count.
import { DOING, DONE, L2, TODO, addItem, card, toggle, withChecklist } from "../../../tasks/board/fixtures.mjs";

const W = card(TODO[0]);
const items = async app => JSON.stringify(await app.page.locator('[data-testid="item"]').allTextContents().then(r => r.map(t => t.replace(/\s+/g, " ").trim())));

export default [
  { name: "HOLD an item added while the checklist reloads shows once", async run(app) {
    await withChecklist(app);
    await addItem(app, "ship");
    await toggle(app, "patch");
    await app.land("toggleItem:2,22,true", { id: 22, done: true });
    await app.landIfAsked("fetchChecklist:2", [L2[0], { ...L2[1], done: true }, L2[2]]);
    const held = await items(app);
    await app.land("addItem:2,ship", { id: 24, text: "ship", done: false });
    const done4 = [L2[0], { ...L2[1], done: true }, L2[2], { id: 24, text: "ship", done: false }];
    await app.landIfAsked("fetchChecklist:2", done4);
    await app.landIfAsked("fetchCards:todo", [TODO[0], { ...TODO[1], done: 2, total: 4 }]);
    try { await app.rows("item", ["[x] repro", "[x] patch", "[ ] test", "[ ] ship"]); console.error("  expected screen"); }
    catch (e) {
      const now = await items(app);
      if (now !== held) throw new Error(`TEAR — neither expected (${e.message}) nor held.\n    before: ${held}\n    now:    ${now}`);
      console.error(`  HELD (rows as before the add's answer: ${now}); out: ${JSON.stringify(await app.pending())}`);
    }
    for (let i = 0; i < 3; i++) {
      await app.landIfAsked("fetchChecklist:2", done4);
      await app.landIfAsked("fetchCards:todo", [TODO[0], { ...TODO[1], done: 2, total: 4 }]);
      await app.landIfAsked("fetchCards:doing", DOING);
      await app.landIfAsked("fetchCards:done", DONE);
    }
    await app.rows("item", ["[x] repro", "[x] patch", "[ ] test", "[ ] ship"]);
    await app.eq("progress", "2/4 done");
    await app.colRows("todo", [W, "#2 Fix login · 2/4"]);
  } },
];
