// rx-cols (one keyed store per column answer) fuzz seed 24: after `right #4`, #4 shows in Doing and in Done.
// node probe-rx.mjs <desk> $PWD/cols-move-guess-missing.steps.mjs
import { land, near, typeClick, TODO, DOING, DONE } from "/tmp/claude-0/runs/r15prep/board-rx3/scratch/common.mjs";
export default [
  ["land done", land("fetchCards:done", DONE)], ["land doing", land("fetchCards:doing", DOING)], ["land todo", land("fetchCards:todo", TODO)],
  ["add Bravo 1", typeClick("new-card", "Bravo 1", "add-card")], ["land add 1", land("addCard:todo,Bravo 1", { id: 10, title: "Bravo 1" })],
  ["right #10", p => near(p, 10, "right")],
  ["add Bravo 2", typeClick("new-card", "Bravo 2", "add-card")], ["land add 2", land("addCard:todo,Bravo 2", { id: 11, title: "Bravo 2" })],
  ["up #10", p => near(p, 10, "up")],
  ["land move 10", land("moveCard:10,doing,2", { id: 10, column: "doing", index: 2 })],
  ["add Alpha 3", typeClick("new-card", "Alpha 3", "add-card")],
  ["land doing again", land("fetchCards:doing", [...DOING, { id: 10, title: "Bravo 1", done: 0, total: 0 }])],
  ["left #3", p => near(p, 3, "left")],
  ["add Bravo 4", typeClick("new-card", "Bravo 4", "add-card")],
  ["down #3", p => near(p, 3, "down")],
  ["right #4", p => near(p, 4, "right")],
];
