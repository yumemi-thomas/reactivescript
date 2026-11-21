// trace: an item added while the checklist reloads (after an accepted toggle)
import { withChecklist, addItem, toggle, TODO, L2 } from "../../../tasks/board/fixtures.mjs";
const scr = async app => { await app.page.waitForTimeout(60); return `items ${JSON.stringify(await app.items("item"))} progress ${await app.text("progress")} card ${JSON.stringify((await app.items("card")).filter(t => t.startsWith("#2")))} air ${JSON.stringify(await app.pending())} | ${await app.page.evaluate(() => { const g = n => { try { const e = globalThis.__rx_reg.get(n); return JSON.stringify(e[e.length - 1].get()); } catch (x) { return String(x); } }; return ["progress", "items"].map(n => n + "=" + g(n)).join(" "); })}`; };
export default [{ name: "TRACE item added while the checklist reloads", async run(app) {
  await withChecklist(app);
  await addItem(app, "ship"); console.error("  add out: " + await scr(app));
  await toggle(app, "patch"); console.error("  toggle out: " + await scr(app));
  await app.land("toggleItem:2,22,true", { id: 22, done: true }); console.error("  toggle landed: " + await scr(app));
  await app.landIfAsked("fetchChecklist:2", [L2[0], { ...L2[1], done: true }, L2[2]]); console.error("  reload 1: " + await scr(app));
  await app.land("addItem:2,ship", { id: 24, text: "ship", done: false }); console.error("  add landed: " + await scr(app));
  for (let i = 0; i < 3; i++) {
    await app.landIfAsked("fetchChecklist:2", [L2[0], { ...L2[1], done: true }, L2[2], { id: 24, text: "ship", done: false }]);
    await app.landIfAsked("fetchCards:todo", [TODO[0], { ...TODO[1], done: 2, total: 4 }]);
  }
  console.error("  settled: " + await scr(app));
} }];
