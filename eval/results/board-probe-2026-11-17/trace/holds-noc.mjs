// Hold probes for round 15 tracing (not a grader). Each probe replays a hidden test whose failure may be a by-design
// hold (H-11, shared-list holds). At the test's check it accepts either the expected screen or the screen as it was just
// before the write that should change it (a hold: consistent, nothing torn). Any other screen fails as a tear. Then it
// answers the writes and re-asks still out, as the server would, and requires the settled screen to be right.
import { DOING, DOING3, DONE, TODO, TODO_ROWS, DOING_ROWS, L2, addCard, addItem, card, loaded, move, toggle, withChecklist } from "../../../tasks/board/fixtures.mjs";
import { selected, rename } from "../../../tasks/board/fixtures.mjs";

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
  { name: "HOLD a move into To do while a card is being added there keeps both", async run(app) {
    await loaded(app);
    await addCard(app, "Plan sprint");
    await move(app, 3, "left");
    await app.eq("head-todo", "To do (4)");
    await app.land("addCard:todo,Plan sprint", { id: 7, title: "Plan sprint" });
    await app.landOnly("moveCard", { id: 3, column: "todo", index: 3 });
    let held = await snap(app);
    const T = [...TODO, c(7, "Plan sprint", 0, 0), DOING[0]];
    await reloads(app, T, [DOING[1]]);
    await either(app, held, async () => { const shown = (await app.items("card")).filter(t => t.startsWith("#7 ") || t.startsWith("#3 ")); if (shown.length !== 2) throw new Error(JSON.stringify(shown)); await app.eq("head-todo", "To do (4)"); }, "both landed");
    await reloads(app, T, [DOING[1]], DONE);
    const shown = (await app.items("card")).filter(t => t.startsWith("#7 ") || t.startsWith("#3 "));
    if (shown.length !== 2) throw new Error(`settled: expected #7 and #3 once each, shown: ${JSON.stringify(shown)}`);
    await app.eq("head-todo", "To do (4)");
    console.error(`  settled: ${await snap(app)}`);
  } },
];
