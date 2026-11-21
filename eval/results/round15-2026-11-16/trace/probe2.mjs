// trace: a toggle declined while an item add is out (shared-list hold?), and an add accepted while To do reloads
import { withChecklist, toggle, addItem, loaded, addCard, move, TODO, L2 } from "../../../tasks/board/fixtures.mjs";
const scr = async app => { await app.page.waitForTimeout(60); return `todo ${JSON.stringify(await app.page.locator('[data-testid="col-todo"] [data-testid="card"]').allTextContents().then(r => r.map(t => t.replace(/\s+/g, " ").trim())))} progress ${await app.text("progress")} air ${JSON.stringify(await app.pending())}`; };
const c = (id, title, done, total) => ({ id, title, done, total });
export default [
  { name: "TRACE toggle declined while an item add is out", async run(app) {
    await withChecklist(app);
    await toggle(app, "patch");
    await addItem(app, "ship"); console.error("  both out: " + await scr(app));
    await app.fail("toggleItem:2,22,true", "read only"); console.error("  toggle declined: " + await scr(app));
    await app.landOnly("addItem", { id: 24, text: "ship", done: false }); console.error("  add landed: " + await scr(app));
    for (let i = 0; i < 3; i++) {
      await app.landIfAsked("fetchChecklist:2", [...L2, { id: 24, text: "ship", done: false }]);
      await app.landIfAsked("fetchCards:todo", [TODO[0], { ...TODO[1], total: 4 }]);
    }
    console.error("  settled: " + await scr(app));
  } },
  { name: "TRACE add accepted while To do reloads", async run(app) {
    await loaded(app);
    await addCard(app, "Plan sprint");
    await move(app, 1, "down"); console.error("  both out: " + await scr(app));
    await app.land("moveCard:1,todo,1", { id: 1, column: "todo", index: 1 }); console.error("  move landed: " + await scr(app));
    await app.landIfAsked("fetchCards:todo", [TODO[1], TODO[0]]); console.error("  reload landed: " + await scr(app));
    await app.land("addCard:todo,Plan sprint", { id: 7, title: "Plan sprint" }); console.error("  add landed: " + await scr(app));
    for (let i = 0; i < 3; i++) await app.landIfAsked("fetchCards:todo", [TODO[1], TODO[0], c(7, "Plan sprint", 0, 0)]);
    console.error("  settled: " + await scr(app));
  } },
];
