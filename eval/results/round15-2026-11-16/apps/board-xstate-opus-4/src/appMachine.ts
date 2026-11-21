import { setup } from "xstate";
import { archiveMachine } from "./archiveMachine.js";
import { boardMachine } from "./boardMachine.js";

export type Page = "board" | "archive";

/** The open page. Each page's machine lives only while its page is open, so leaving a page discards it. */
export const appMachine = setup({
  types: {
    events: {} as { type: "open"; page: Page },
    children: {} as { board: "board"; archive: "archive" },
  },
  actors: { board: boardMachine, archive: archiveMachine },
}).createMachine({
  id: "app",
  initial: "board",
  states: {
    board: {
      invoke: { id: "board", src: "board" },
      on: { open: { guard: ({ event }) => event.page === "archive", target: "archive" } },
    },
    archive: {
      invoke: { id: "archive", src: "archive" },
      on: { open: { guard: ({ event }) => event.page === "board", target: "board" } },
    },
  },
});
