import { setup } from "xstate";
import { archiveMachine } from "./archiveMachine";
import { boardMachine } from "./boardMachine";

/** The tabs. Each page is an invoked actor, so leaving a page stops it and opening it starts a fresh one. */
export const appMachine = setup({
  types: {
    events: {} as { type: "tab.board" } | { type: "tab.archive" },
  },
  actors: { board: boardMachine, archive: archiveMachine },
}).createMachine({
  id: "app",
  initial: "board",
  states: {
    board: {
      invoke: { id: "board", src: "board" },
      on: { "tab.archive": "archive" },
    },
    archive: {
      invoke: { id: "archive", src: "archive" },
      on: { "tab.board": "board" },
    },
  },
});
