import { setup } from "xstate";
import { archiveMachine } from "./archive/archiveMachine";
import { boardMachine } from "./board/boardMachine";

export type Page = "board" | "archive";

/** The tabs. Each page is an actor that lives only while its tab is open. */
export const appMachine = setup({
  types: {
    events: {} as { type: "open"; page: Page },
    children: {} as { board: "boardMachine"; archive: "archiveMachine" },
  },
  actors: { boardMachine, archiveMachine },
}).createMachine({
  id: "app",
  initial: "board",
  states: {
    board: {
      invoke: { id: "board", src: "boardMachine" },
      on: { open: { guard: ({ event }) => event.page === "archive", target: "archive" } },
    },
    archive: {
      invoke: { id: "archive", src: "archiveMachine" },
      on: { open: { guard: ({ event }) => event.page === "board", target: "board" } },
    },
  },
});
