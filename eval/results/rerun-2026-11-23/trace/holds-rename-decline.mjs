// Hold probes for round 15 tracing (not a grader). Each probe replays a hidden test whose failure may be a by-design
// hold (H-11, shared-list holds). At the test's check it accepts either the expected screen or the screen as it was just
// before the write that should change it (a hold: consistent, nothing torn). Any other screen fails as a tear. Then it
// answers the writes and re-asks still out, as the server would, and requires the settled screen to be right.
import { DOING, DONE, TODO, card, move, rename, selected } from "../../../tasks/board/fixtures.mjs";

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
/** answer the column re-asks still out, a few rounds (an app may ask again once an answer lands); a column not given
 * answers as it first loaded (an app may re-ask every column after a write) */
async function reloads(app, todo, doing = DOING, done = DONE) {
  for (let i = 0; i < 3; i++) {
    if (todo) await app.landIfAsked("fetchCards:todo", todo);
    if (doing) await app.landIfAsked("fetchCards:doing", doing);
    if (done) await app.landIfAsked("fetchCards:done", done);
  }
}

export default [
  { name: "HOLD a rename and a move out together, the move declined: the card goes back with its new title", async run(app) {
    await selected(app, 2);
    await rename(app, "Fix signup");
    await move(app, 2, "right");
    const held = await snap(app);
    await app.fail("moveCard:2,doing,2", "nope");
    await either(app, held, () => app.colRows("todo", [W, "#2 Fix signup · 1/3"]), "move declined");
    await app.land("renameCard:2,Fix signup", { id: 2, title: "Fix signup" });
    await reloads(app, [TODO[0], { ...TODO[1], title: "Fix signup" }]);
    await app.colRows("todo", [W, "#2 Fix signup · 1/3"]);
    console.error(`  settled: ${await snap(app)}`);
  } },
  { name: "HOLD a declined archive of a card whose rename is out brings it back with the new title", async run(app) {
    await selected(app, 2);
    await rename(app, "Fix signup");
    await app.click("archive");
    const held = await snap(app);
    await app.fail("archiveCard:2", "in use");
    await either(app, held, () => app.colRows("todo", [W, "#2 Fix signup · 1/3"]), "archive declined");
    await app.land("renameCard:2,Fix signup", { id: 2, title: "Fix signup" });
    await reloads(app, [TODO[0], { ...TODO[1], title: "Fix signup" }]);
    await app.colRows("todo", [W, "#2 Fix signup · 1/3"]);
    console.error(`  settled: ${await snap(app)}`);
  } },
];
