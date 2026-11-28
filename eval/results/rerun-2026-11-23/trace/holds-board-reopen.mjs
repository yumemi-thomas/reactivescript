// Rerun 2026-11-23 hold probe (not a grader). "the new-card input starts empty when the board opens again" checks the
// input before To do's re-ask lands. An app that keeps the add input under To do's loading (ruled acceptable 2026-11-12:
// an action under the loading boundary of the list it guesses into) has no input until then. This probe lands To do's
// re-ask first, then asks the same question: is the input there and empty?
import { DOING, DONE, TODO, loaded } from "../../../tasks/board/fixtures.mjs";
export default [
  { name: "HOLD the new-card input starts empty when the board opens again", async run(app) {
    await loaded(app);
    await app.type("new-card", "half typed");
    await app.click("tab-archive");
    await app.click("tab-board");
    for (let i = 0; i < 3; i++) { await app.landIfAsked("fetchCards:todo", TODO); await app.landIfAsked("fetchCards:doing", DOING); await app.landIfAsked("fetchCards:done", DONE); }
    await app.hasValue("new-card", "");
  } },
];
