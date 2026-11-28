import { land, DOING, near } from "/tmp/claude-0/runs/r15prep/board-rx3/scratch/common.mjs";
export default [
  ["load", land("fetchCards:doing", DOING)],
  ["3 right", p => near(p, 3, "right")],
  ["land 3", land("moveCard:3,done,2", {})],
  ["4 right (reads board while refresh is out)", p => near(p, 4, "right")],
  ["land doing", land("fetchCards:doing", DOING)],
];
