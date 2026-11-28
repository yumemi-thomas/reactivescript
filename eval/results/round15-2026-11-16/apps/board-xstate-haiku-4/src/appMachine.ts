import { setup } from "xstate";

export type AppEvent = { type: "GO_BOARD" } | { type: "GO_ARCHIVE" };

/**
 * The two pages behind the tabs. Only the open page is mounted, so leaving a page
 * discards it (its machine stops) and opening it again starts it afresh.
 */
export const appMachine = setup({
  types: { events: {} as AppEvent },
}).createMachine({
  id: "app",
  initial: "board",
  states: {
    board: { on: { GO_ARCHIVE: { target: "archive" } } },
    archive: { on: { GO_BOARD: { target: "board" } } },
  },
});
