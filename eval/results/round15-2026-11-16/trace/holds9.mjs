// desk9 hold probes (round 15 tracing, not a grader): as holds.mjs, for the shared-list cases of the desk9 graders
import { OPEN, selected, rename } from "../../../tasks/rename/fixtures.mjs";
import { rowClose } from "../../../tasks/rows/fixtures.mjs";
const snap = async app => `list ${JSON.stringify(await app.items("issue"))}`;
async function either(app, held, check, what) {
  try { await check(); console.error(`  ${what}: expected screen`); }
  catch (e) {
    const now = await snap(app);
    if (now === held) { console.error(`  ${what}: HELD (${now})`); return; }
    throw new Error(`${what}: TEAR — neither expected (${e.message}) nor held.\n    before: ${held}\n    now:    ${now}`);
  }
}
const reask = async (app, list) => { for (let i = 0; i < 3; i++) await app.landIfAsked("fetchIssues:open", list); };
export default [
  { name: "HOLD base: a declined assignment keeps a rename in flight on the same issue", async run(app) {
    await selected(app);
    await app.type("user", "ann"); await app.click("assign");
    await rename(app, "Crash at boot");
    const held = await snap(app);
    await app.fail("assign:3,ann", "declined");
    await either(app, held, () => app.see("list", "#3 Crash at boot (unassigned)"), "assign declined");
    await app.land("renameIssue:3,Crash at boot", { id: 3, title: "Crash at boot" });
    await reask(app, OPEN.map(i => i.id === 3 ? { ...i, title: "Crash at boot" } : i));
    await app.see("list", "#3 Crash at boot (unassigned)");
    console.error(`  settled: ${await snap(app)}`);
  } },
  { name: "HOLD base: a declined rename keeps an assignment in flight on the same issue", async run(app) {
    await selected(app);
    await app.type("user", "ann"); await app.click("assign");
    await rename(app, "Crash at boot");
    const held = await snap(app);
    await app.fail("renameIssue:3,Crash at boot", "declined");
    await either(app, held, () => app.see("list", "#3 Crash on save (ann)"), "rename declined");
    await app.land("assign:3,ann", { id: 3, assignee: "ann" });
    await reask(app, OPEN.map(i => i.id === 3 ? { ...i, assignee: "ann" } : i));
    await app.see("list", "#3 Crash on save (ann)");
    await app.see("detail", "rename error: declined");
    console.error(`  settled: ${await snap(app)}`);
  } },
  { name: "HOLD rows: a declined row close leaves a rename out on another issue", async run(app) {
    await selected(app);
    await rename(app, "Crash at boot");
    await rowClose(app, 0);
    await app.rows("issue", ["#3 Crash at boot (unassigned)", "#4 Typo in footer (dana)"]);
    const held = await snap(app);
    await app.fail("closeIssue:1", "declined");
    await either(app, held, () => app.rows("issue", ["#1 Login fails (unassigned)", "#3 Crash at boot (unassigned)", "#4 Typo in footer (dana)"]), "close declined");
    await app.land("renameIssue:3,Crash at boot", { id: 3, title: "Crash at boot" });
    await reask(app, OPEN.map(i => i.id === 3 ? { ...i, title: "Crash at boot" } : i));
    await app.rows("issue", ["#1 Login fails (unassigned)", "#3 Crash at boot (unassigned)", "#4 Typo in footer (dana)"]);
    console.error(`  settled: ${await snap(app)}`);
  } },
];
