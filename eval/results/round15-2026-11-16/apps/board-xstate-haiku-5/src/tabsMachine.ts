import { setup } from "xstate";

/** Which page is open. Each page is its own machine, started when its page mounts, so leaving a page discards it. */
export const tabsMachine = setup({
  types: {
    events: {} as { type: "SHOW_BOARD" } | { type: "SHOW_ARCHIVE" },
  },
}).createMachine({
  id: "tabs",
  initial: "board",
  states: {
    board: { on: { SHOW_ARCHIVE: "archive" } },
    archive: { on: { SHOW_BOARD: "board" } },
  },
});
