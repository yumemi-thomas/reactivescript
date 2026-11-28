import { assign, setup } from "xstate";
import { helpMachine, type HelpInput } from "./help.js";
import { issuesMachine, type IssuesOutput } from "./issues.js";
import { settingsMachine } from "./settings.js";

export type AppContext = {
  /** the open-issue count last published by the issues page; null until it has loaded once */
  openCount: number | null;
  /** what the help page starts with when opened from a related-help hit */
  helpInput: HelpInput | undefined;
};

/**
 * The app: one page at a time. Each page is an invoked machine, so leaving a page
 * stops it and opening it again starts it afresh.
 */
export const appMachine = setup({
  types: {
    context: {} as AppContext,
    events: {} as IssuesOutput | { type: "tab.issues" } | { type: "tab.help" } | { type: "tab.settings" },
  },
  actors: {
    issuesMachine,
    helpMachine,
    settingsMachine,
  },
}).createMachine({
  id: "app",
  context: { openCount: null, helpInput: undefined },
  initial: "issues",
  on: {
    openCount: {
      actions: assign({
        openCount: ({ context, event }) => (event.type === "openCount" && event.count !== null ? event.count : context.openCount),
      }),
    },
  },
  states: {
    issues: {
      invoke: { id: "issues", src: "issuesMachine" },
      on: {
        "tab.help": { target: "help", actions: assign({ helpInput: undefined }) },
        "tab.settings": "settings",
        openHelp: {
          target: "help",
          actions: assign({
            helpInput: ({ event }) => (event.type === "openHelp" ? { query: event.query, selectedId: event.id } : undefined),
          }),
        },
      },
    },
    help: {
      invoke: {
        id: "help",
        src: "helpMachine",
        input: ({ context }) => context.helpInput ?? { query: "", selectedId: null },
      },
      on: {
        "tab.issues": { target: "issues", actions: assign({ helpInput: undefined }) },
        "tab.settings": { target: "settings", actions: assign({ helpInput: undefined }) },
      },
    },
    settings: {
      invoke: { id: "settings", src: "settingsMachine" },
      on: {
        "tab.issues": { target: "issues", actions: assign({ helpInput: undefined }) },
        "tab.help": { target: "help", actions: assign({ helpInput: undefined }) },
      },
    },
  },
});
