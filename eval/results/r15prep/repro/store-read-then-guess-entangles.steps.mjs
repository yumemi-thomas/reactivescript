import { land, fail, DOING, DONE, near } from "/tmp/claude-0/runs/r15prep/board-rx3/scratch/common.mjs";
export default [
  ["load", async p => { await land("fetchCards:doing", DOING)(p); await land("fetchCards:done", DONE)(p); }],
  ["3 right", p => near(p, 3, "right")],
  ["4 right", p => near(p, 4, "right")],
  ["fail 3", fail("moveCard:3,done,1", "nope")],
  ["land 4", land("moveCard:4,done,2", {})],
];
