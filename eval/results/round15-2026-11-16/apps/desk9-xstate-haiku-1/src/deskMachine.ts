import { assign, setup } from "xstate";
import { helpMachine, type HelpInput } from "./helpMachine.js";
import { issuesMachine } from "./issuesMachine.js";
import { settingsMachine } from "./settingsMachine.js";

type DeskEvent =
  | { type: "GO_ISSUES" }
  | { type: "GO_HELP" }
  | { type: "GO_SETTINGS" }
  | { type: "OPEN_HELP"; query: string; hitId: number | null }
  | { type: "OPEN_LIST"; count: number; show: boolean };

type DeskContext = {
  /** the open issues' count, kept while another page is open */
  openCount: number | null;
  helpInput: HelpInput;
};

/** The app root: one page at a time, each page a child machine that is discarded when the page is left. */
export const deskMachine = setup({
  types: {
    context: {} as DeskContext,
    events: {} as DeskEvent,
  },
  actors: {
    issues: issuesMachine,
    help: helpMachine,
    settings: settingsMachine,
  },
}).createMachine({
  id: "desk",
  initial: "issues",
  context: {
    openCount: null,
    helpInput: { query: "", hitId: null },
  },
  on: {
    OPEN_LIST: {
      guard: ({ event }) => event.show,
      actions: assign({ openCount: ({ event }) => event.count }),
    },
    GO_ISSUES: { target: ".issues" },
    GO_HELP: {
      target: ".help",
      actions: assign({ helpInput: { query: "", hitId: null } }),
    },
    GO_SETTINGS: { target: ".settings" },
    OPEN_HELP: {
      target: ".help",
      actions: assign({
        helpInput: ({ event }) => ({ query: event.query, hitId: event.hitId }),
      }),
    },
  },
  states: {
    issues: {
      invoke: { id: "issues", src: "issues" },
    },
    help: {
      invoke: { id: "help", src: "help", input: ({ context }) => context.helpInput },
    },
    settings: {
      invoke: { id: "settings", src: "settings" },
    },
  },
});
