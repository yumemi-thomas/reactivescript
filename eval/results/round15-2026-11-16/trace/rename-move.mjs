// trace: rename then move of card 2; screen and requests in the air after each step
import { selected, rename, move, TODO, DOING, DONE } from "../../../tasks/board/fixtures.mjs";
const show = async (app, what) => console.error(`  ${what}: doing ${JSON.stringify(await app.page.locator('[data-testid="col-doing"] [data-testid="card"]').allTextContents().then(r => r.map(t => t.replace(/\s+/g, " ").trim())))} air ${JSON.stringify(await app.pending())}`);
export default [{ name: "TRACE renamed card moved", async run(app) {
  await selected(app, 2);
  await rename(app, "Fix signup"); await show(app, "renamed");
  await move(app, 2, "right"); await show(app, "moved");
  await app.land("renameCard:2,Fix signup", { id: 2, title: "Fix signup" }); await show(app, "rename landed");
  await app.land("moveCard:2,doing,2", { id: 2, column: "doing", index: 2 }); await show(app, "move landed");
  for (let i = 0; i < 3; i++) {
    await app.landIfAsked("fetchCards:todo", [TODO[0]]);
    await app.landIfAsked("fetchCards:doing", [...DOING, { ...TODO[1], title: "Fix signup" }]);
    await app.landIfAsked("fetchCards:done", DONE);
  }
  await show(app, "re-asks landed");
} }];
