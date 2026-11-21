import { createMachine } from "xstate";

/** The two pages. Leaving a page stops it; its machine and its requests go with it. */
export const appMachine = createMachine({
  id: "app",
  initial: "board",
  states: {
    board: {
      on: { "tab.archive": { target: "archive" } },
    },
    archive: {
      on: { "tab.board": { target: "board" } },
    },
  },
});
