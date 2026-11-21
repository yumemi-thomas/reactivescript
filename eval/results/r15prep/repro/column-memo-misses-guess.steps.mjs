// board-rx3 (eval/reference/board/rx-store) repro of column-memo-misses-guess (fuzz seeds 24, 39): node probe-rx.mjs <desk> $PWD/column-memo-misses-guess.steps.mjs
// last dump: #3 shows in Doing and in Done. Seed 39 reduced: land done/doing/todo ; add Delta 1 ; add Bravo 2 ; land addCard:todo,Delta 1 ; down #3 ; right #4 ; land moveCard:3,doing,1 ; right #3
const land = (k, v) => p => p.evaluate(([k, v]) => globalThis.__flights.land(k, v), [k, v]);
const TODO = [{ id: 1, title: "Write spec", done: 0, total: 2 }, { id: 2, title: "Fix login", done: 1, total: 3 }];
const DOING = [{ id: 3, title: "Review PR", done: 2, total: 2 }, { id: 4, title: "Deploy", done: 0, total: 1 }];
const DONE = [{ id: 5, title: "Kickoff", done: 3, total: 3 }];
const loaded = async p => { await land("fetchCards:todo", TODO)(p); await land("fetchCards:doing", DOING)(p); await land("fetchCards:done", DONE)(p); };
const near = (p, id, b) => p.locator('li', { has: p.locator(`[data-testid=card]:text-matches("^#${id} ")`) }).locator(`[data-testid=${b}]`).click();
const typeClick = (tid, text, btn) => async p => { await p.fill(`[data-testid=${tid}]`, text); await p.click(`[data-testid=${btn}]`); };
const s = [["load", loaded], ["add A", typeClick("new-card", "A", "add-card")], ["add B", typeClick("new-card", "B", "add-card")],
  ["land A", land("addCard:todo,A", { id: 10, title: "A" })], ["down #3", p => near(p, 3, "down")]];
s.push(["right #4", p => near(p, 4, "right")]);
s.push(["land move3", land("moveCard:3,doing,1", { id: 3, column: "doing", index: 1 })], ["right #3", p => near(p, 3, "right")]);
export default s;
