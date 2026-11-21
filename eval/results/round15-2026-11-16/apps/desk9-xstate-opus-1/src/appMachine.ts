import { assign, setup } from "xstate";
import type { Hit } from "./api";
import { helpMachine, type HelpInput } from "./helpMachine";
import { issuesMachine } from "./issuesMachine";
import { settingsMachine } from "./settingsMachine";

export type Page = "issues" | "help" | "settings";

export type AppEvent =
  | { type: "OPEN"; page: Page }
  | { type: "COUNT"; count: number | null }
  | { type: "OPEN_RELATED"; query: string; hits: Hit[]; hitId: number };

/**
 * The app: one state per page. Each page is an invoked actor, so leaving a page
 * stops it (and drops its requests' answers), and opening it again starts it afresh.
 */
export const appMachine = setup({
  types: {
    context: {} as { openCount: number | null },
    events: {} as AppEvent,
    children: {} as { issues: "issuesPage"; help: "helpPage"; settings: "settingsPage" },
  },
  guards: {
    isIssues: ({ event }) => event.type === "OPEN" && event.page === "issues",
    isHelp: ({ event }) => event.type === "OPEN" && event.page === "help",
    isSettings: ({ event }) => event.type === "OPEN" && event.page === "settings",
  },
  actors: {
    issuesPage: issuesMachine,
    helpPage: helpMachine,
    settingsPage: settingsMachine,
  },
}).createMachine({
  id: "app",
  context: { openCount: null },
  initial: "issues",
  on: {
    // opening the page already on screen keeps it as it is
    OPEN: [
      { guard: "isIssues", target: ".issues" },
      { guard: "isHelp", target: ".help" },
      { guard: "isSettings", target: ".settings" },
    ],
    COUNT: {
      guard: ({ event }) => event.count !== null,
      actions: assign({ openCount: ({ event }) => event.count }),
    },
  },
  states: {
    issues: {
      invoke: { id: "issues", src: "issuesPage" },
      on: {
        OPEN: { guard: "isIssues" },
        OPEN_RELATED: { target: "help" },
      },
    },
    help: {
      invoke: {
        id: "help",
        src: "helpPage",
        input: ({ event }): HelpInput =>
          event.type === "OPEN_RELATED" ? { query: event.query, hits: event.hits, hitId: event.hitId } : {},
      },
      on: { OPEN: { guard: "isHelp" } },
    },
    settings: {
      invoke: { id: "settings", src: "settingsPage" },
      on: { OPEN: { guard: "isSettings" } },
    },
  },
});
