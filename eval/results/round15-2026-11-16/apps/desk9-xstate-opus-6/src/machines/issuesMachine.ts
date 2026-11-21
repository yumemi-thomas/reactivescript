import { assign, enqueueActions, fromPromise, sendParent, setup, stopChild } from "xstate";
import * as api from "../api.js";
import type { Comment, Hit, Issue, IssueDetail } from "../api.js";
import { errorMessage, request } from "./request";

export type Filter = "open" | "closed";
type Origin = "detail" | "row";

/** An optimistic change to an issue, shown in the list until the server answers. */
export type IssueOp =
  | { opId: string; kind: "assign"; id: number; user: string; origin: Origin; sel: number }
  | { opId: string; kind: "rename"; id: number; title: string; origin: Origin; sel: number }
  | { opId: string; kind: "close"; id: number; origin: Origin; sel: number };

export type Post = { opId: string; author: string; text: string; status: "sending" | "sent" };
export type LabelOp = { opId: string; kind: "add" | "remove"; label: string };

export type IssuesContext = {
  user: string;
  /** the filter asked for */
  filter: Filter;
  /** the filter of the list in `issues` (as the server last answered it) */
  listFilter: Filter;
  listReady: boolean;
  issues: Issue[];
  listError: string;
  issueOps: IssueOp[];
  rowError: string | null;

  selectedId: number | null;
  /** bumps on every selection, so that late answers for an earlier selection are not shown */
  sel: number;
  detail: IssueDetail | null;
  detailError: string;
  titleInput: string;
  commentInput: string;
  labelInput: string;
  assignError: string | null;
  renameError: string | null;
  closeError: string | null;
  postError: string | null;
  labelError: string | null;
  latestAssign: string | null;
  latestRename: string | null;

  comments: Comment[];
  commentsError: string;
  posts: Post[];

  labels: string[];
  labelsError: string;
  labelOps: LabelOp[];

  relatedQuery: string;
  related: Hit[];
  relatedError: string;

  seq: number;
};

export type IssuesEvent =
  | { type: "user.change"; value: string }
  | { type: "filter.set"; filter: Filter }
  | { type: "select"; id: number }
  | { type: "retry" }
  | { type: "title.change"; value: string }
  | { type: "comment.change"; value: string }
  | { type: "label.change"; value: string }
  | { type: "assign" }
  | { type: "rename" }
  | { type: "close" }
  | { type: "row.assign"; id: number }
  | { type: "row.close"; id: number }
  | { type: "post" }
  | { type: "label.add" }
  | { type: "label.remove"; label: string }
  | { type: "related.open"; hitId: number }
  | { type: "issueOp.ok"; opId: string }
  | { type: "issueOp.fail"; opId: string; message: string }
  | { type: "post.ok"; opId: string; comment: Comment }
  | { type: "post.fail"; opId: string; message: string }
  | { type: "labelOp.ok"; opId: string }
  | { type: "labelOp.fail"; opId: string; message: string };

/** The list as the page shows it: the server's list with the changes still in the air. */
export function visibleIssues(ctx: Pick<IssuesContext, "issues" | "issueOps" | "listFilter">): Issue[] {
  let list = ctx.issues;
  for (const op of ctx.issueOps) {
    if (op.kind === "assign") list = list.map((i) => (i.id === op.id ? { ...i, assignee: op.user } : i));
    else if (op.kind === "rename") list = list.map((i) => (i.id === op.id ? { ...i, title: op.title } : i));
    else if (ctx.listFilter === "open") list = list.filter((i) => i.id !== op.id);
  }
  return list;
}

/** The detail's title with the renames still in the air. */
export function visibleTitle(ctx: Pick<IssuesContext, "detail" | "issueOps">): string {
  const detail = ctx.detail;
  if (!detail) return "";
  let title = detail.title;
  for (const op of ctx.issueOps) if (op.kind === "rename" && op.id === detail.id) title = op.title;
  return title;
}

export function visibleLabels(ctx: Pick<IssuesContext, "labels" | "labelOps">): string[] {
  let labels = ctx.labels;
  for (const op of ctx.labelOps) labels = applyLabelOp(labels, op);
  return labels;
}

function applyLabelOp(labels: string[], op: LabelOp): string[] {
  if (op.kind === "add") return labels.includes(op.label) ? labels : [...labels, op.label];
  return labels.filter((l) => l !== op.label);
}

const initialSelection = {
  detail: null,
  detailError: "",
  titleInput: "",
  commentInput: "",
  labelInput: "",
  assignError: null,
  renameError: null,
  closeError: null,
  postError: null,
  labelError: null,
  latestAssign: null,
  latestRename: null,
  comments: [],
  commentsError: "",
  posts: [],
  labels: [],
  labelsError: "",
  labelOps: [],
  relatedQuery: "",
  related: [],
  relatedError: "",
} satisfies Partial<IssuesContext>;

type IssueOpInput = { opId: string; id: number };

export const issuesMachine = setup({
  types: {
    context: {} as IssuesContext,
    events: {} as IssuesEvent,
  },
  actors: {
    fetchIssues: fromPromise<Issue[], Filter>(({ input }) => api.fetchIssues(input)),
    fetchIssue: fromPromise<IssueDetail | null, number>(({ input }) => api.fetchIssue(input)),
    fetchComments: fromPromise<Comment[], number>(({ input }) => api.fetchComments(input)),
    fetchLabels: fromPromise<string[], number>(({ input }) => api.fetchLabels(input)),
    searchRelated: fromPromise<Hit[], string>(({ input }) => api.search(input)),
    assignIssue: request(
      (i: IssueOpInput & { user: string }) => api.assign(i.id, i.user),
      (i): IssuesEvent => ({ type: "issueOp.ok", opId: i.opId }),
      (i, message): IssuesEvent => ({ type: "issueOp.fail", opId: i.opId, message }),
    ),
    renameIssue: request(
      (i: IssueOpInput & { title: string }) => api.renameIssue(i.id, i.title),
      (i): IssuesEvent => ({ type: "issueOp.ok", opId: i.opId }),
      (i, message): IssuesEvent => ({ type: "issueOp.fail", opId: i.opId, message }),
    ),
    closeIssue: request(
      (i: IssueOpInput) => api.closeIssue(i.id),
      (i): IssuesEvent => ({ type: "issueOp.ok", opId: i.opId }),
      (i, message): IssuesEvent => ({ type: "issueOp.fail", opId: i.opId, message }),
    ),
    addComment: request(
      (i: IssueOpInput & { author: string; text: string }) => api.addComment(i.id, i.author, i.text),
      (i, comment): IssuesEvent => ({ type: "post.ok", opId: i.opId, comment }),
      (i, message): IssuesEvent => ({ type: "post.fail", opId: i.opId, message }),
    ),
    addLabel: request(
      (i: IssueOpInput & { label: string }) => api.addLabel(i.id, i.label),
      (i): IssuesEvent => ({ type: "labelOp.ok", opId: i.opId }),
      (i, message): IssuesEvent => ({ type: "labelOp.fail", opId: i.opId, message }),
    ),
    removeLabel: request(
      (i: IssueOpInput & { label: string }) => api.removeLabel(i.id, i.label),
      (i): IssuesEvent => ({ type: "labelOp.ok", opId: i.opId }),
      (i, message): IssuesEvent => ({ type: "labelOp.fail", opId: i.opId, message }),
    ),
  },
  actions: {
    /** Tell the app how many open issues the list shows, when it shows the open issues. */
    reportCount: enqueueActions(({ context, enqueue }) => {
      if (context.listReady && context.listFilter === "open") {
        enqueue.sendParent({ type: "openCount", n: visibleIssues(context).length });
      }
    }),
    /** Start an optimistic change to an issue and its request. */
    startIssueOp: enqueueActions(
      ({ context, enqueue }, op: { kind: "assign" | "rename" | "close"; id: number; value: string; origin: Origin }) => {
        const opId = `issue-${context.seq}`;
        const base = { opId, id: op.id, origin: op.origin, sel: context.sel };
        const entry: IssueOp =
          op.kind === "assign"
            ? { ...base, kind: "assign", user: op.value }
            : op.kind === "rename"
              ? { ...base, kind: "rename", title: op.value }
              : { ...base, kind: "close" };
        const errors: Partial<IssuesContext> =
          op.origin === "row"
            ? { rowError: null }
            : op.kind === "assign"
              ? { assignError: null, latestAssign: opId }
              : op.kind === "rename"
                ? { renameError: null, latestRename: opId }
                : { closeError: null };
        enqueue.assign({ seq: context.seq + 1, issueOps: [...context.issueOps, entry], ...errors });
        if (op.kind === "assign") {
          enqueue.spawnChild("assignIssue", { id: opId, input: { opId, id: op.id, user: op.value } });
        } else if (op.kind === "rename") {
          enqueue.spawnChild("renameIssue", { id: opId, input: { opId, id: op.id, title: op.value } });
        } else {
          enqueue.spawnChild("closeIssue", { id: opId, input: { opId, id: op.id } });
        }
      },
    ),
    select: assign(({ context, event }) =>
      event.type === "select" ? { ...initialSelection, selectedId: event.id, sel: context.sel + 1 } : {},
    ),
    stopRequest: stopChild(({ event }) => ("opId" in event ? event.opId : "")),
  },
  guards: {
    hasUser: ({ context }) => context.user.trim() !== "",
    isSelected: ({ context }) => context.selectedId !== null,
  },
}).createMachine({
  id: "issues",
  type: "parallel",
  context: {
    user: "guest",
    filter: "open",
    listFilter: "open",
    listReady: false,
    issues: [],
    listError: "",
    issueOps: [],
    rowError: null,
    selectedId: null,
    sel: 0,
    seq: 0,
    ...initialSelection,
  },
  on: {
    "user.change": { actions: assign({ user: ({ event }) => event.value }) },

    // Issue changes: the detail's buttons and the rows' buttons.
    assign: {
      guard: ({ context }) => context.selectedId !== null && context.user.trim() !== "",
      actions: {
        type: "startIssueOp",
        params: ({ context }) => ({ kind: "assign" as const, id: context.selectedId ?? 0, value: context.user.trim(), origin: "detail" as const }),
      },
    },
    rename: {
      guard: ({ context }) => context.selectedId !== null && context.titleInput.trim() !== "",
      actions: {
        type: "startIssueOp",
        params: ({ context }) => ({ kind: "rename" as const, id: context.selectedId ?? 0, value: context.titleInput.trim(), origin: "detail" as const }),
      },
    },
    close: {
      guard: ({ context }) =>
        context.selectedId !== null && !context.issueOps.some((op) => op.kind === "close" && op.id === context.selectedId),
      actions: [
        {
          type: "startIssueOp",
          params: ({ context }) => ({ kind: "close" as const, id: context.selectedId ?? 0, value: "", origin: "detail" as const }),
        },
        "reportCount",
      ],
    },
    "row.assign": {
      guard: "hasUser",
      actions: {
        type: "startIssueOp",
        params: ({ context, event }) => ({ kind: "assign" as const, id: event.id, value: context.user.trim(), origin: "row" as const }),
      },
    },
    "row.close": {
      guard: ({ context, event }) => !context.issueOps.some((op) => op.kind === "close" && op.id === event.id),
      actions: [
        { type: "startIssueOp", params: ({ event }) => ({ kind: "close" as const, id: event.id, value: "", origin: "row" as const }) },
        "reportCount",
      ],
    },
    "issueOp.ok": {
      actions: [
        assign(({ context, event }) => {
          const op = context.issueOps.find((o) => o.opId === event.opId);
          if (!op) return {};
          const issueOps = context.issueOps.filter((o) => o !== op);
          if (op.kind === "assign") {
            return { issueOps, issues: context.issues.map((i) => (i.id === op.id ? { ...i, assignee: op.user } : i)) };
          }
          if (op.kind === "rename") {
            return {
              issueOps,
              issues: context.issues.map((i) => (i.id === op.id ? { ...i, title: op.title } : i)),
              detail: context.detail && context.detail.id === op.id ? { ...context.detail, title: op.title } : context.detail,
            };
          }
          return {
            issueOps,
            issues: context.listFilter === "open" ? context.issues.filter((i) => i.id !== op.id) : context.issues,
          };
        }),
        "stopRequest",
        "reportCount",
      ],
    },
    "issueOp.fail": {
      actions: [
        assign(({ context, event }) => {
          const op = context.issueOps.find((o) => o.opId === event.opId);
          if (!op) return {};
          const issueOps = context.issueOps.filter((o) => o !== op);
          if (op.origin === "row") return { issueOps, rowError: `row error: ${event.message}` };
          // A detail error is shown only for the issue still selected, and only for the latest change of its kind.
          if (op.sel !== context.sel) return { issueOps };
          if (op.kind === "assign") return op.opId === context.latestAssign ? { issueOps, assignError: event.message } : { issueOps };
          if (op.kind === "rename") {
            return op.opId === context.latestRename ? { issueOps, renameError: `rename error: ${event.message}` } : { issueOps };
          }
          return { issueOps, closeError: `close error: ${event.message}` };
        }),
        "stopRequest",
        "reportCount",
      ],
    },

    // Comments.
    "comment.change": { actions: assign({ commentInput: ({ event }) => event.value }) },
    post: {
      guard: ({ context }) => context.selectedId !== null && context.commentInput.trim() !== "",
      actions: enqueueActions(({ context, enqueue }) => {
        const opId = `post-${context.seq}`;
        const author = context.user.trim() || context.user;
        const text = context.commentInput.trim();
        enqueue.assign({
          seq: context.seq + 1,
          commentInput: "",
          postError: null,
          posts: [...context.posts, { opId, author, text, status: "sending" }],
        });
        enqueue.spawnChild("addComment", { id: opId, input: { opId, id: context.selectedId ?? 0, author, text } });
      }),
    },
    "post.ok": {
      actions: [
        assign({
          posts: ({ context, event }) =>
            context.posts.map((p) =>
              p.opId === event.opId ? { ...p, author: event.comment.author, text: event.comment.text, status: "sent" as const } : p,
            ),
        }),
        "stopRequest",
      ],
    },
    "post.fail": {
      actions: [
        assign(({ context, event }) =>
          context.posts.some((p) => p.opId === event.opId)
            ? { posts: context.posts.filter((p) => p.opId !== event.opId), postError: `post error: ${event.message}` }
            : {},
        ),
        "stopRequest",
      ],
    },

    // Labels.
    "label.change": { actions: assign({ labelInput: ({ event }) => event.value }) },
    "label.add": {
      guard: ({ context }) => {
        const label = context.labelInput.trim();
        return context.selectedId !== null && label !== "" && !visibleLabels(context).includes(label);
      },
      actions: enqueueActions(({ context, enqueue }) => {
        const opId = `label-${context.seq}`;
        const label = context.labelInput.trim();
        enqueue.assign({
          seq: context.seq + 1,
          labelInput: "",
          labelError: null,
          labelOps: [...context.labelOps, { opId, kind: "add", label }],
        });
        enqueue.spawnChild("addLabel", { id: opId, input: { opId, id: context.selectedId ?? 0, label } });
      }),
    },
    "label.remove": {
      guard: ({ context, event }) => context.selectedId !== null && visibleLabels(context).includes(event.label),
      actions: enqueueActions(({ context, enqueue, event }) => {
        const opId = `label-${context.seq}`;
        enqueue.assign({
          seq: context.seq + 1,
          labelError: null,
          labelOps: [...context.labelOps, { opId, kind: "remove", label: event.label }],
        });
        enqueue.spawnChild("removeLabel", { id: opId, input: { opId, id: context.selectedId ?? 0, label: event.label } });
      }),
    },
    "labelOp.ok": {
      actions: [
        assign(({ context, event }) => {
          const op = context.labelOps.find((o) => o.opId === event.opId);
          if (!op) return {};
          return { labels: applyLabelOp(context.labels, op), labelOps: context.labelOps.filter((o) => o !== op) };
        }),
        "stopRequest",
      ],
    },
    "labelOp.fail": {
      actions: [
        assign(({ context, event }) =>
          context.labelOps.some((o) => o.opId === event.opId)
            ? { labelOps: context.labelOps.filter((o) => o.opId !== event.opId), labelError: `label error: ${event.message}` }
            : {},
        ),
        "stopRequest",
      ],
    },

    "title.change": { actions: assign({ titleInput: ({ event }) => event.value }) },
  },
  states: {
    list: {
      initial: "loading",
      on: {
        "filter.set": {
          guard: ({ context, event }) => event.filter !== context.filter || !context.listReady,
          target: ".loading",
          actions: assign({ filter: ({ event }) => event.filter }),
        },
      },
      states: {
        loading: {
          entry: assign({ listReady: false }),
          on: {
            // A newer filter replaces the load in the air: its answer is dropped.
            "filter.set": { target: "loading", reenter: true, actions: assign({ filter: ({ event }) => event.filter }) },
          },
          invoke: {
            src: "fetchIssues",
            input: ({ context }) => context.filter,
            onDone: {
              target: "ready",
              actions: [
                assign({
                  issues: ({ event }) => event.output,
                  listFilter: ({ context }) => context.filter,
                  listReady: true,
                }),
                "reportCount",
              ],
            },
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
    detail: {
      initial: "none",
      on: {
        select: {
          guard: ({ context, event }) => context.selectedId !== event.id,
          target: ".selected",
          actions: "select",
        },
      },
      states: {
        none: {},
        selected: {
          type: "parallel",
          on: {
            // Another issue: everything about the previous one is dropped and loads again.
            select: {
              guard: ({ context, event }) => context.selectedId !== event.id,
              target: "selected",
              reenter: true,
              actions: "select",
            },
            "related.open": {
              actions: sendParent(({ context, event }) => ({
                type: "help.open",
                query: context.relatedQuery,
                hits: context.related,
                hitId: event.hitId,
              })),
            },
          },
          states: {
            issue: {
              initial: "loading",
              on: { retry: { target: ".loading" } },
              states: {
                loading: {
                  on: { retry: { target: "loading", reenter: true } },
                  invoke: {
                    src: "fetchIssue",
                    input: ({ context }) => context.selectedId ?? 0,
                    onDone: [
                      { guard: ({ event }) => event.output === null, target: "notFound", actions: assign({ detail: null }) },
                      { target: "ready", actions: assign({ detail: ({ event }) => event.output }) },
                    ],
                    onError: {
                      target: "failed",
                      actions: assign({ detail: null, detailError: ({ event }) => errorMessage(event.error) }),
                    },
                  },
                },
                notFound: {},
                failed: {},
                ready: {
                  initial: "searching",
                  entry: assign({ relatedQuery: ({ context }) => context.detail?.title ?? "", related: [], relatedError: "" }),
                  states: {
                    searching: {
                      invoke: {
                        src: "searchRelated",
                        input: ({ context }) => context.relatedQuery,
                        onDone: { target: "found", actions: assign({ related: ({ event }) => event.output }) },
                        onError: {
                          target: "failed",
                          actions: assign({ relatedError: ({ event }) => errorMessage(event.error) }),
                        },
                      },
                    },
                    found: {},
                    failed: {},
                  },
                },
              },
            },
            comments: {
              initial: "loading",
              states: {
                loading: {
                  invoke: {
                    src: "fetchComments",
                    input: ({ context }) => context.selectedId ?? 0,
                    onDone: { target: "ready", actions: assign({ comments: ({ event }) => event.output }) },
                    onError: {
                      target: "failed",
                      actions: assign({ commentsError: ({ event }) => errorMessage(event.error) }),
                    },
                  },
                },
                ready: {},
                failed: {},
              },
            },
            labels: {
              initial: "loading",
              states: {
                loading: {
                  invoke: {
                    src: "fetchLabels",
                    input: ({ context }) => context.selectedId ?? 0,
                    onDone: { target: "ready", actions: assign({ labels: ({ event }) => event.output }) },
                    onError: {
                      target: "failed",
                      actions: assign({ labelsError: ({ event }) => errorMessage(event.error) }),
                    },
                  },
                },
                ready: {},
                failed: {},
              },
            },
          },
        },
      },
    },
  },
});
