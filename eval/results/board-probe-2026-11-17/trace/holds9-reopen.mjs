// desk9 hold probes for the rx-one reference (fuzz seed 10): the issues page reopened while a write on the list is out.
// As round 15's holds9.mjs: at the check, the expected screen or the screen as before; then settle and require right.
import { OPEN, CLOSED } from "../../../tasks/desk9/fixtures.mjs";
const snap = async app => `body ${(await app.page.locator("body").innerText()).replace(/\s+/g, " ").slice(0, 300)}`;
async function either(app, held, check, what) {
  try { await check(); console.error(`  ${what}: expected screen`); }
  catch (e) {
    const now = await snap(app);
    if (now === held) { console.error(`  ${what}: HELD (${now})`); return; }
    console.error(`  NOW: ${now}\n  BEFORE: ${held}`);
    throw new Error(`${what}: TEAR — neither expected (${e.message}) nor held.\n    before: ${held}\n    now:    ${now}`);
  }
}
export default [
  { name: "HOLD reopened with a row close out: the open list", async run(app) {
    await app.land("fetchIssues:open", OPEN);
    await app.clickText("issue", "#1 "); await app.click("tab-help"); await app.click("tab-issues");
    await app.land("fetchIssues:open", OPEN);
    const rows = await app.items("issue");
    await app.page.locator('[data-testid="row-close"]').first().click();
    const held = await snap(app);
    await app.click("tab-help"); await app.click("tab-issues");
    await either(app, held, () => app.see("list", "loading open issues"), "reopened");
    await app.land("closeIssue:1", { id: 1 });
    for (let i = 0; i < 3; i++) await app.landIfAsked("fetchIssues:open", OPEN.filter(i => i.id !== 1));
    await app.see("list", "#3 Crash on save (unassigned)");
    const now = await app.items("issue"); if (now.some(t => t.startsWith("#1 "))) throw new Error("closed #1 still shown: " + now);
    console.error(`  settled: ${await snap(app)} (before: ${rows})`);
  } },
  { name: "HOLD reopened from the closed list with an assign out: the open list", async run(app) {
    await app.land("fetchIssues:open", OPEN);
    await app.click("filter-closed"); await app.land("fetchIssues:closed", CLOSED);
    await app.page.locator('[data-testid="row-assign"]').first().click();
    const held = await snap(app);
    await app.click("tab-help"); await app.click("tab-issues");
    await either(app, held, () => app.see("list", "loading open issues"), "reopened");
    await app.land("assign:2,guest", { id: 2, assignee: "guest" });
    for (let i = 0; i < 3; i++) await app.landIfAsked("fetchIssues:open", OPEN);
    await app.see("list", "#1 Login fails (unassigned)");
    const now = await app.items("issue"); if (now.some(t => t.startsWith("#2 "))) throw new Error("closed #2 in open list: " + now);
    console.error(`  settled: ${await snap(app)}`);
  } },
];
