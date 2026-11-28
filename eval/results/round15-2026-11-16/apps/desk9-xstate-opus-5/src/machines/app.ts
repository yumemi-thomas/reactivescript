import { assign, setup } from "xstate";
import type { Hit } from "../api.js";
import { helpMachine, type HelpSeed } from "./help";
import { issuesMachine } from "./issues";
import { settingsMachine } from "./settings";

export type Page = "issues" | "help" | "settings";

type AppContext = {
  /** the open-issue count last shown, or null before the open issues first loaded */
  openCount: number | null;
  helpSeed: HelpSeed | null;
};

type AppEvent =
  | { type: "tab"; page: Page }
  | { type: "issues.count"; count: number }
  | { type: "help.openRelated"; query: string; hits: Hit[]; hitId: number };

/**
 * The desk: one page open at a time. Each page is an actor invoked by its state, so leaving a
 * page stops it (and drops its requests) and opening it again starts it fresh.
 */
export const appMachine = setup({
  types: {
    context: {} as AppContext,
    events: {} as AppEvent,
    children: {} as { issues: "issuesPage"; help: "helpPage"; settings: "settingsPage" },
  },
  actors: {
    issuesPage: issuesMachine,
    helpPage: helpMachine,
    settingsPage: settingsMachine,
  },
  guards: {
    isPage: ({ event }, params: { page: Page }) => event.type === "tab" && event.page === params.page,
  },
}).createMachine({
  id: "desk",
  initial: "issues",
  context: { openCount: null, helpSeed: null },
  on: {
    "issues.count": { actions: assign({ openCount: ({ event }) => event.count }) },
  },
  states: {
    issues: {
      invoke: { id: "issues", src: "issuesPage" },
      on: {
        tab: [
          { guard: { type: "isPage", params: { page: "help" } }, target: "help" },
          { guard: { type: "isPage", params: { page: "settings" } }, target: "settings" },
        ],
        "help.openRelated": {
          target: "help",
          actions: assign({
            helpSeed: ({ event }) => ({ query: event.query, hits: event.hits, hitId: event.hitId }),
          }),
        },
      },
    },
    help: {
      invoke: { id: "help", src: "helpPage", input: ({ context }) => context.helpSeed },
      exit: assign({ helpSeed: null }),
      on: {
        tab: [
          { guard: { type: "isPage", params: { page: "issues" } }, target: "issues" },
          { guard: { type: "isPage", params: { page: "settings" } }, target: "settings" },
        ],
      },
    },
    settings: {
      invoke: { id: "settings", src: "settingsPage" },
      on: {
        tab: [
          { guard: { type: "isPage", params: { page: "issues" } }, target: "issues" },
          { guard: { type: "isPage", params: { page: "help" } }, target: "help" },
        ],
      },
    },
  },
});
