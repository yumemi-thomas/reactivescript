// rx-cols fuzz seed 17: an answered add's "(adding…)" placeholder shows beside its real card.
// node probe-rx.mjs <desk> $PWD/cols-placeholder-beside-card.steps.mjs
import { land, near, typeClick, TODO, DOING, DONE } from "/tmp/claude-0/runs/r15prep/board-rx3/scratch/common.mjs";
export default [
  ["land todo", land("fetchCards:todo", TODO)], ["land done", land("fetchCards:done", DONE)],
  ["add Alpha 2", typeClick("new-card", "Alpha 2", "add-card")],
  ["land doing", land("fetchCards:doing", DOING)],
  ["right #3", p => near(p, 3, "right")],
  ["up #2", p => near(p, 2, "up")],
  ["right #1", p => near(p, 1, "right")],
  ["land add", land("addCard:todo,Alpha 2", { id: 10, title: "Alpha 2" })],
];
