import { assign, setup } from "xstate";
import { helpMachine, type HelpInput } from "./helpMachine";
import { issuesMachine } from "./issuesMachine";
import { settingsMachine } from "./settingsMachine";

/**
 * The root: one of three pages is open at a time. Leaving a page stops its machine,
 * so opening it again starts it afresh. The open-issue count lives here, so the tab
 * keeps it while another page is open.
 */
export const deskMachine = setup({
  types: {
    context: {} as { openCount: number | undefined; helpSeed: HelpInput | null },
    events: {} as
      | { type: "SHOW_ISSUES" }
      | { type: "SHOW_HELP" }
      | { type: "SHOW_SETTINGS" }
      | { type: "OPEN_HELP"; query: string; hitId: number }
      | { type: "OPEN_COUNT"; count: number },
  },
  actors: {
    issuesPage: issuesMachine,
    helpPage: helpMachine,
    settingsPage: settingsMachine,
  },
}).createMachine({
  id: "desk",
  initial: "issues",
  context: { openCount: undefined, helpSeed: null },
  on: {
    OPEN_COUNT: {
      actions: assign({ openCount: ({ event }) => event.count }),
    },
    SHOW_ISSUES: { target: ".issues" },
    SHOW_HELP: {
      target: ".help",
      actions: assign({ helpSeed: null }),
    },
    SHOW_SETTINGS: { target: ".settings" },
    OPEN_HELP: {
      target: ".help",
      actions: assign({ helpSeed: ({ event }) => ({ query: event.query, hitId: event.hitId }) }),
    },
  },
  states: {
    issues: {
      invoke: { id: "issues", src: "issuesPage" },
    },
    help: {
      invoke: {
        id: "help",
        src: "helpPage",
        input: ({ context }) => context.helpSeed ?? { query: "", hitId: null },
      },
    },
    settings: {
      invoke: { id: "settings", src: "settingsPage" },
    },
  },
});
