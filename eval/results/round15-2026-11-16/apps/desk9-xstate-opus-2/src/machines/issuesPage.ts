import { assign, sendParent, setup } from "xstate";
import type { Filter, Issue } from "../types";
import { loadIssues } from "../requests";
import { errorMessage } from "../clock";
import { issueDetailMachine } from "./issueDetail";

type Context = {
  user: string;
  filter: Filter;
  /** the server's last answer for the current filter, stamped with when it was asked */
  list: { items: Issue[]; at: number } | null;
  listError: string | null;
  selectedId: number | null;
};

type Event =
  | { type: "user.change"; value: string }
  | { type: "filter.set"; filter: Filter }
  | { type: "issue.select"; id: number };

/** Events this page sends to the app. */
export type IssuesPageParentEvent =
  | { type: "issues.openLoaded"; items: Issue[]; at: number }
  | { type: "issues.selected"; id: number };

export const issuesPageMachine = setup({
  types: {
    context: {} as Context,
    events: {} as Event,
    children: {} as { detail: "issueDetail" },
  },
  actors: { loadIssues, issueDetail: issueDetailMachine },
}).createMachine({
  id: "issuesPage",
  type: "parallel",
  context: { user: "guest", filter: "open", list: null, listError: null, selectedId: null },
  on: {
    "user.change": { actions: assign({ user: ({ event }) => event.value }) },
  },
  states: {
    list: {
      initial: "loading",
      on: {
        "filter.set": {
          guard: ({ context, event }) => event.filter !== context.filter,
          target: ".loading",
          actions: assign({ filter: ({ event }) => event.filter, list: null, listError: null }),
        },
      },
      states: {
        loading: {
          invoke: {
            src: "loadIssues",
            input: ({ context }) => ({ filter: context.filter }),
            onDone: [
              {
                guard: ({ context }) => context.filter === "open",
                target: "ready",
                actions: [
                  assign({ list: ({ event }) => event.output, listError: null }),
                  sendParent(({ event }): IssuesPageParentEvent => ({
                    type: "issues.openLoaded",
                    items: event.output.items,
                    at: event.output.at,
                  })),
                ],
              },
              { target: "ready", actions: assign({ list: ({ event }) => event.output, listError: null }) },
            ],
            onError: {
              target: "failed",
              actions: assign({ listError: ({ event }) => errorMessage(event.error) }),
            },
          },
        },
        ready: {},
        failed: {},
      },
    },
    selection: {
      initial: "none",
      on: {
        "issue.select": {
          guard: ({ context, event }) => event.id !== context.selectedId,
          target: ".selected",
          actions: [
            assign({ selectedId: ({ event }) => event.id }),
            sendParent(({ event }): IssuesPageParentEvent => ({ type: "issues.selected", id: event.id })),
          ],
        },
      },
      states: {
        none: {},
        selected: {
          invoke: {
            id: "detail",
            src: "issueDetail",
            input: ({ context }) => ({ id: context.selectedId ?? 0 }),
          },
        },
      },
    },
  },
});
