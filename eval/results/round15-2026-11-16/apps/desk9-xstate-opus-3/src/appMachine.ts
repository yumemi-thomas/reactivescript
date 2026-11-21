import { assign, setup } from "xstate";
import { helpMachine, type HelpSeed } from "./helpMachine";
import { issuesMachine, type IssuesParentEvent } from "./issuesMachine";
import { settingsMachine } from "./settingsMachine";

export type Page = "issues" | "help" | "settings";

export type AppEvent = { type: "tab"; page: Page } | IssuesParentEvent;

/**
 * The tabs. Each page is an actor invoked by its state, so leaving a page stops it (and drops its requests' answers)
 * and opening it again starts a fresh one.
 */
export const appMachine = setup({
  types: {
    context: {} as { openCount: number | null; helpSeed: HelpSeed },
    events: {} as AppEvent,
    children: {} as { issues: "issuesMachine"; help: "helpMachine"; settings: "settingsMachine" },
  },
  actors: { issuesMachine, helpMachine, settingsMachine },
}).createMachine({
  id: "app",
  context: { openCount: null, helpSeed: null },
  initial: "issues",
  on: {
    openCount: { actions: assign({ openCount: ({ event }) => event.count }) },
  },
  states: {
    issues: {
      invoke: { id: "issues", src: "issuesMachine" },
      on: {
        tab: [
          { guard: ({ event }) => event.page === "help", target: "help", actions: assign({ helpSeed: null }) },
          { guard: ({ event }) => event.page === "settings", target: "settings" },
        ],
        "related.open": {
          target: "help",
          actions: assign({ helpSeed: ({ event }) => ({ query: event.query, hitId: event.hitId }) }),
        },
      },
    },
    help: {
      invoke: { id: "help", src: "helpMachine", input: ({ context }) => context.helpSeed },
      on: {
        tab: [
          { guard: ({ event }) => event.page === "issues", target: "issues" },
          { guard: ({ event }) => event.page === "settings", target: "settings" },
        ],
      },
    },
    settings: {
      invoke: { id: "settings", src: "settingsMachine" },
      on: {
        tab: [
          { guard: ({ event }) => event.page === "issues", target: "issues" },
          { guard: ({ event }) => event.page === "help", target: "help", actions: assign({ helpSeed: null }) },
        ],
      },
    },
  },
});
