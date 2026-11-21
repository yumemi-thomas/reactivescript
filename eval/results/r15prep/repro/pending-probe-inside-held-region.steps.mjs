import { land } from "/tmp/claude-0/runs/r15prep/board-rx3/scratch/common.mjs";
export default [
  ["load 2", land("fetchChecklist:2", [{ id: 21, text: "repro", done: true }, { id: 22, text: "patch", done: false }])],
  ["toggle patch", p => p.locator("[data-testid=toggle]").nth(1).click()],
  ["select 1 (held by the toggle's guess)", p => p.click("[data-testid=sel1]")],
  ["toggle is disabled?", async p => console.log("  disabled:", await p.locator("[data-testid=toggle]").evaluateAll(bs => bs.map(b => b.disabled)))],
];
