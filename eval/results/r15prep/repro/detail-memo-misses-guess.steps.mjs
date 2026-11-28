// board-rx3 (rx-store, placeholder in the store) fuzz seed 46, "two views": the card shows the rename's guess, the
// detail heading (from `sel = board.find(...)`) shows the old title. node probe-rx.mjs <desk> $PWD/detail-memo-misses-guess.steps.mjs
import { land, near, card, typeClick, TODO, DOING, DONE } from "/tmp/claude-0/runs/r15prep/board-rx3/scratch/common.mjs";
const ITEMS5 = [{ id: 51, text: "invite", done: true }, { id: 52, text: "agenda", done: true }, { id: 53, text: "notes", done: true }];
export default [
  ["land done", land("fetchCards:done", DONE)],
  ["select #5", p => card(p, 5)],
  ["land checklist 5", land("fetchChecklist:5", ITEMS5)],
  ["land doing", land("fetchCards:doing", DOING)],
  ["land todo", land("fetchCards:todo", TODO)],
  ["down #3", p => near(p, 3, "down")],
  ["right #1", p => near(p, 1, "right")],
  ["left #3", p => near(p, 3, "left")],
  ["add Delta 1", typeClick("new-card", "Delta 1", "add-card")],
  ["land move 3 -> todo", land("moveCard:3,todo,1", { id: 3, column: "todo", index: 1 })],
  ["down #4", p => near(p, 4, "down")],
  ["up #3", p => near(p, 3, "up")],
  ["rename Bravo", typeClick("title-input", "Bravo", "rename")],
];
