import { assign, setup } from "xstate";
import { helpMachine, type HelpInput } from "./helpMachine";
import { issuesMachine, type IssuesParentEvent } from "./issuesMachine";
import { settingsMachine } from "./settingsMachine";

export type AppEvent =
  | { type: "tab.issues" }
  | { type: "tab.help" }
  | { type: "tab.settings" }
  | IssuesParentEvent;

/**
 * The tabs. Each page is an actor invoked by its tab's state, so leaving a
 * page stops it (and everything it was waiting for), and opening it again
 * starts a fresh one.
 */
export const appMachine = setup({
  types: {
    context: {} as { openCount: number | null },
    events: {} as AppEvent,
    children: {} as { issues: "issues"; help: "help"; settings: "settings" },
  },
  actors: {
    issues: issuesMachine,
    help: helpMachine,
    settings: settingsMachine,
  },
}).createMachine({
  id: "app",
  initial: "issues",
  context: { openCount: null },
  on: {
    "issues.count": { actions: assign({ openCount: ({ event }) => event.count }) },
  },
  states: {
    issues: {
      invoke: { id: "issues", src: "issues" },
      on: {
        "tab.help": "help",
        "tab.settings": "settings",
        "related.open": "help",
      },
    },
    help: {
      invoke: {
        id: "help",
        src: "help",
        input: ({ event }): HelpInput =>
          event.type === "related.open"
            ? { query: event.query, hits: event.hits, hitId: event.hitId }
            : { query: "", hits: null, hitId: null },
      },
      on: {
        "tab.issues": "issues",
        "tab.settings": "settings",
      },
    },
    settings: {
      invoke: { id: "settings", src: "settings" },
      on: {
        "tab.issues": "issues",
        "tab.help": "help",
      },
    },
  },
});
