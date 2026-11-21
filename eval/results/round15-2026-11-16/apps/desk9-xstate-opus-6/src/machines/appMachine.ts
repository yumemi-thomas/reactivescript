import { assign, setup } from "xstate";
import type { Hit } from "../api.js";
import { helpMachine, type HelpInput } from "./helpMachine";
import { issuesMachine } from "./issuesMachine";
import { settingsMachine } from "./settingsMachine";

export type Page = "issues" | "help" | "settings";

export type AppEvent =
  | { type: "tab"; page: Page }
  | { type: "openCount"; n: number }
  | { type: "help.open"; query: string; hits: Hit[]; hitId: number };

const EMPTY_HELP: HelpInput = { query: "", hits: null, hitId: null };

/**
 * The app: one page at a time, each page an invoked machine, so that leaving a page stops it and
 * opening it again starts it afresh. The open-issue count outlives the pages.
 */
export const appMachine = setup({
  types: {
    context: {} as { openCount: number | null },
    events: {} as AppEvent,
    children: {} as { issues: "issuesMachine"; help: "helpMachine"; settings: "settingsMachine" },
  },
  actors: { issuesMachine, helpMachine, settingsMachine },
}).createMachine({
  id: "app",
  initial: "issues",
  context: { openCount: null },
  on: {
    openCount: { actions: assign({ openCount: ({ event }) => event.n }) },
  },
  states: {
    issues: {
      invoke: { id: "issues", src: "issuesMachine" },
      on: {
        tab: [
          { guard: ({ event }) => event.page === "help", target: "help" },
          { guard: ({ event }) => event.page === "settings", target: "settings" },
        ],
        "help.open": { target: "help" },
      },
    },
    help: {
      invoke: {
        id: "help",
        src: "helpMachine",
        input: ({ event }): HelpInput =>
          event.type === "help.open" ? { query: event.query, hits: event.hits, hitId: event.hitId } : EMPTY_HELP,
      },
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
          { guard: ({ event }) => event.page === "help", target: "help" },
        ],
      },
    },
  },
});
