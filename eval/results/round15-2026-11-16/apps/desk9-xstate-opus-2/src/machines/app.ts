import { assign, enqueueActions, setup } from "xstate";
import type { Hit, Issue } from "../types";
import type { Change, ConfirmedChange, PendingChange } from "../model";
import { changeRequest } from "../requests";
import { issuesPageMachine, type IssuesPageParentEvent } from "./issuesPage";
import { EMPTY_HELP, helpMachine, type HelpInput } from "./help";
import { settingsMachine } from "./settings";

export type DetailErrors = { assign: string | null; rename: string | null; close: string | null };
const NO_DETAIL_ERRORS: DetailErrors = { assign: null, rename: null, close: null };

type Context = {
  /** the last open-issues answer the issues page showed (drives the tab count) */
  openBase: { items: Issue[]; at: number } | null;
  /** issue changes in flight; they outlive the issues page so their answers are never lost */
  pending: PendingChange[];
  /** issue changes the server accepted */
  confirmed: ConfirmedChange[];
  detailErrors: DetailErrors;
  rowError: string | null;
  /** bumped whenever the selected issue changes (or the issues page opens again) */
  selToken: number;
  /** bumped whenever the issues page opens */
  pageToken: number;
  nextOpId: number;
  helpInput: HelpInput;
};

type Event =
  | { type: "tab.issues" }
  | { type: "tab.help" }
  | { type: "tab.settings" }
  | { type: "help.openRelated"; query: string; hits: Hit[]; selectedId: number }
  | { type: "change.start"; change: Change; source: "row" | "detail" }
  | { type: "change.done"; opId: number; output: Change; at: number }
  | { type: "change.failed"; opId: number; message: string }
  | IssuesPageParentEvent;

export const appMachine = setup({
  types: {
    context: {} as Context,
    events: {} as Event,
    children: {} as { issuesPage: "issuesPage"; help: "help"; settings: "settings" },
  },
  actors: { issuesPage: issuesPageMachine, help: helpMachine, settings: settingsMachine, changeRequest },
  actions: {
    resetIssuesPage: assign(({ context }) => ({
      selToken: context.selToken + 1,
      pageToken: context.pageToken + 1,
      detailErrors: NO_DETAIL_ERRORS,
      rowError: null,
    })),
  },
  guards: {
    canStart: ({ context, event }) => {
      if (event.type !== "change.start") return false;
      const { change } = event;
      if (change.kind === "assign") return change.assignee.trim() !== "";
      if (change.kind === "rename") return change.title.trim() !== "";
      // one close per issue at a time
      return !context.pending.some((p) => p.change.kind === "close" && p.change.id === change.id);
    },
  },
}).createMachine({
  id: "app",
  initial: "issues",
  context: {
    openBase: null,
    pending: [],
    confirmed: [],
    detailErrors: NO_DETAIL_ERRORS,
    rowError: null,
    selToken: 0,
    pageToken: 0,
    nextOpId: 1,
    helpInput: EMPTY_HELP,
  },
  on: {
    "change.start": {
      guard: "canStart",
      actions: enqueueActions(({ context, event, enqueue }) => {
        const opId = context.nextOpId;
        const change = event.change;
        const op: PendingChange = {
          opId,
          change,
          source: event.source,
          selToken: context.selToken,
          pageToken: context.pageToken,
        };
        enqueue.assign({
          pending: [...context.pending, op],
          nextOpId: opId + 1,
          rowError: event.source === "row" ? null : context.rowError,
          detailErrors:
            event.source === "detail" ? { ...context.detailErrors, [change.kind]: null } : context.detailErrors,
        });
        enqueue.spawnChild("changeRequest", { id: `change-${opId}`, input: { opId, change } });
      }),
    },
    "change.done": {
      actions: enqueueActions(({ context, event, enqueue }) => {
        enqueue.assign({
          pending: context.pending.filter((p) => p.opId !== event.opId),
          confirmed: [...context.confirmed, { change: event.output, at: event.at }],
        });
        enqueue.stopChild(`change-${event.opId}`);
      }),
    },
    "change.failed": {
      actions: enqueueActions(({ context, event, enqueue }) => {
        const op = context.pending.find((p) => p.opId === event.opId);
        const pending = context.pending.filter((p) => p.opId !== event.opId);
        if (!op) {
          enqueue.assign({ pending });
        } else if (op.source === "row") {
          enqueue.assign({
            pending,
            rowError: op.pageToken === context.pageToken ? event.message : context.rowError,
          });
        } else {
          enqueue.assign({
            pending,
            detailErrors:
              op.selToken === context.selToken
                ? { ...context.detailErrors, [op.change.kind]: event.message }
                : context.detailErrors,
          });
        }
        enqueue.stopChild(`change-${event.opId}`);
      }),
    },
    "issues.openLoaded": {
      actions: assign({ openBase: ({ event }) => ({ items: event.items, at: event.at }) }),
    },
    "issues.selected": {
      actions: assign(({ context }) => ({ selToken: context.selToken + 1, detailErrors: NO_DETAIL_ERRORS })),
    },
  },
  states: {
    issues: {
      entry: "resetIssuesPage",
      invoke: { id: "issuesPage", src: "issuesPage" },
      on: {
        "tab.help": { target: "help", actions: assign({ helpInput: EMPTY_HELP }) },
        "tab.settings": { target: "settings" },
        "help.openRelated": {
          target: "help",
          actions: assign({
            helpInput: ({ event }) => ({
              query: event.query,
              results: { q: event.query, hits: event.hits },
              selectedId: event.selectedId,
            }),
          }),
        },
      },
    },
    help: {
      invoke: { id: "help", src: "help", input: ({ context }) => context.helpInput },
      on: {
        "tab.issues": { target: "issues" },
        "tab.settings": { target: "settings" },
      },
    },
    settings: {
      invoke: { id: "settings", src: "settings" },
      on: {
        "tab.issues": { target: "issues" },
        "tab.help": { target: "help", actions: assign({ helpInput: EMPTY_HELP }) },
      },
    },
  },
});
