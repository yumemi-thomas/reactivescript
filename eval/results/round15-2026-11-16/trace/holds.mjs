// Hold probes for round 15 tracing (not a grader). Each probe replays a hidden test whose failure may be a by-design
// hold (H-11, shared-list holds). At the test's check it accepts either the expected screen or the screen as it was just
// before the write that should change it (a hold: consistent, nothing torn). Any other screen fails as a tear. Then it
// answers the writes and re-asks still out, as the server would, and requires the settled screen to be right.
import { DOING, DOING3, DONE, TODO, TODO_ROWS, DOING_ROWS, L2, addCard, addItem, card, loaded, move, toggle, withChecklist } from "../../../tasks/board/fixtures.mjs";

const [W, F] = [card(TODO[0]), card(TODO[1])];
const [R, D] = [card(DOING[0]), card(DOING[1])];
const K = card(DONE[0]);
const c = (id, title, done, total) => ({ id, title, done, total });

async function snap(app) {
  const col = async n => JSON.stringify(await app.page.locator(`[data-testid="col-${n}"] [data-testid="card"]`).allTextContents().then(r => r.map(t => t.replace(/\s+/g, " ").trim())));
  await app.page.waitForTimeout(60);
  return `todo ${await col("todo")} doing ${await col("doing")} done ${await col("done")} | ${await app.text("head-todo")} ${await app.text("head-doing")} ${await app.text("head-done")} | ${await app.text("progress")}`;
}
/** the expected screen, or the held one; anything else is a tear */
async function either(app, held, check, what) {
  try { await check(); console.error(`  ${what}: expected screen`); }
  catch (e) {
    const now = await snap(app);
    if (now === held) { console.error(`  ${what}: HELD (screen as before: ${now})`); return; }
    throw new Error(`${what}: TEAR — neither expected (${e.message}) nor held.\n    before: ${held}\n    now:    ${now}`);
  }
}
/** answer the column re-asks still out, a few rounds (an app may ask again once an answer lands) */
async function reloads(app, todo, doing, done) {
  for (let i = 0; i < 3; i++) {
    if (todo) await app.landIfAsked("fetchCards:todo", todo);
    if (doing) await app.landIfAsked("fetchCards:doing", doing);
    if (done) await app.landIfAsked("fetchCards:done", done);
  }
}

export default [
  { name: "HOLD two adds show both, each taking its own id", async run(app) {
    await loaded(app);
    await addCard(app, "Plan sprint");
    await addCard(app, "Retro");
    await app.colRows("todo", [...TODO_ROWS, "Plan sprint (adding…)", "Retro (adding…)"]);
    let held = await snap(app);
    await app.land("addCard:todo,Retro", { id: 8, title: "Retro" });
    await either(app, held, () => app.colRows("todo", [...TODO_ROWS, "Plan sprint (adding…)", "#8 Retro · 0/0"]), "Retro accepted");
    held = await snap(app);
    await reloads(app, [...TODO, c(8, "Retro", 0, 0)]);
    await either(app, held, () => app.colRows("todo", [...TODO_ROWS, "Plan sprint (adding…)", "#8 Retro · 0/0"]), "To do re-asked");
    await app.land("addCard:todo,Plan sprint", { id: 7, title: "Plan sprint" });
    await reloads(app, [...TODO, c(8, "Retro", 0, 0), c(7, "Plan sprint", 0, 0)]);
    const rows = (await app.items("card")).filter(t => t.startsWith("#7 ") || t.startsWith("#8 "));
    if (rows.length !== 2 || (await app.items("card")).some(t => t.includes("adding"))) throw new Error(`settled: expected #7 and #8 once each, shown ${JSON.stringify(await app.items("card"))}`);
    console.error(`  settled: ${await snap(app)}`);
  } },
  { name: "HOLD one of two moves declined puts back only its card", async run(app) {
    await loaded(app);
    await move(app, 3, "right");
    await move(app, 4, "right");
    await app.colRows("done", [K, R, D]); await app.colRows("doing", []);
    const held = await snap(app);
    await app.fail("moveCard:3,done,1", "nope");
    await either(app, held, async () => { await app.colRows("doing", [R]); await app.colRows("done", [K, D]); await app.eq("head-doing", "Doing (1)"); await app.eq("head-done", "Done (2)"); }, "#3 declined");
    await app.landOnly("moveCard", { id: 4, column: "done", index: 1 });
    await reloads(app, TODO, [DOING[0]], [...DONE, DOING[1]]);
    await app.colRows("doing", [R]); await app.colRows("done", [K, D]); await app.eq("head-doing", "Doing (1)"); await app.eq("head-done", "Done (2)");
    console.error(`  settled: ${await snap(app)}`);
  } },
  { name: "HOLD a move into Doing that fills it while a move out is pending disables the rest", async run(app) {
    await loaded(app, TODO, DOING3);
    await move(app, 6, "right");
    await move(app, 2, "right");
    await app.nearDisabled("card", "#1 ", "right");
    const held = await snap(app);
    const ok = async () => {
      const doing = (await app.items("card")).filter(t => ["#3 ", "#4 ", "#6 ", "#2 "].some(p => t.startsWith(p)));
      if (doing.length !== 4) throw new Error(`expected #3, #4, #6 and #2 in Doing, shown: ${JSON.stringify(doing)}`);
      await app.eq("head-doing", "Doing (4)");
      await app.nearDisabled("card", "#1 ", "right");
    };
    await app.fail("moveCard:6,done,1", "nope");
    await either(app, held, ok, "#6 declined");
    await app.landOnly("moveCard", { id: 2, column: "doing", index: 3 });
    await reloads(app, [TODO[0]], [...DOING3, TODO[1]], DONE);
    await ok();
    console.error(`  settled: ${await snap(app)}`);
  } },
  { name: "HOLD an earlier move declined while a later move of the card is out leaves it where the later one put it", async run(app) {
    await loaded(app);
    await move(app, 2, "right");
    await move(app, 2, "right");
    const held = await snap(app);
    await app.fail("moveCard:2,doing,2", "nope");
    await either(app, held, async () => { await app.colRows("done", [K, F]); await app.colRows("doing", DOING_ROWS); await app.colRows("todo", [W]); }, "earlier declined");
    await app.land("moveCard:2,done,1", { id: 2, column: "done", index: 1 });
    await reloads(app, [TODO[0]], DOING, [...DONE, TODO[1]]);
    await app.colRows("done", [K, F]); await app.colRows("todo", [W]); await app.colRows("doing", DOING_ROWS);
    console.error(`  settled: ${await snap(app)}`);
  } },
  { name: "HOLD a toggle declined after another card was selected puts the first card's count back", async run(app) {
    await withChecklist(app);
    await toggle(app, "patch");
    await app.clickText("card", "#1 ");
    const held = await snap(app);
    await app.fail("toggleItem:2,22,true", "read only");
    await either(app, held, () => app.colRows("todo", TODO_ROWS), "toggle declined");
    await app.landIfAsked("fetchChecklist:1", [{ id: 11, text: "outline", done: false }, { id: 12, text: "draft", done: false }]);
    await reloads(app, TODO);
    await app.colRows("todo", TODO_ROWS);
    console.error(`  settled: ${await snap(app)}`);
  } },
  { name: "HOLD a toggle and an item add out together: the progress and the card's count agree", async run(app) {
    await withChecklist(app);
    await toggle(app, "patch");
    await addItem(app, "ship");
    await app.eq("progress", "2/4 done");
    await app.colRows("todo", [W, "#2 Fix login · 2/4"]);
    const held = await snap(app);
    await app.fail("toggleItem:2,22,true", "read only");
    await either(app, held, async () => { await app.eq("progress", "1/4 done"); await app.colRows("todo", [W, "#2 Fix login · 1/4"]); }, "toggle declined");
    await app.landOnly("addItem", { id: 24, text: "ship", done: false });
    for (let i = 0; i < 3; i++) await app.landIfAsked("fetchChecklist:2", [...L2, { id: 24, text: "ship", done: false }]);
    await reloads(app, [TODO[0], { ...TODO[1], total: 4 }]);
    await app.eq("progress", "1/4 done"); await app.colRows("todo", [W, "#2 Fix login · 1/4"]);
    console.error(`  settled: ${await snap(app)}`);
  } },
];
