import { assign, enqueueActions, fromPromise, sendParent, setup } from "xstate";
import * as api from "./api";
import type { Comment, Hit, Issue, IssueDetail } from "./api";
import { requestMachine } from "./requests";

export type Filter = "open" | "closed";
type Source = "row" | "detail";

/** An optimistic change to the list, shown on top of the server's rows until the server answers. */
export type ListOp =
  | { opId: number; token: number; source: Source; kind: "assign"; id: number; user: string }
  | { opId: number; token: number; source: Source; kind: "rename"; id: number; title: string }
  | { opId: number; token: number; source: Source; kind: "close"; id: number };

export type PendingPost = { opId: number; author: string; text: string };
export type LabelOp = { opId: number; kind: "add" | "remove"; label: string };

export type DetailErrors = {
  assign: string | null;
  rename: string | null;
  close: string | null;
  post: string | null;
  label: string | null;
};

const noErrors: DetailErrors = { assign: null, rename: null, close: null, post: null, label: null };

export interface IssuesContext {
  user: string;
  filter: Filter;
  /** the rows as the server last answered them, for `listFilter` */
  issues: Issue[];
  listFilter: Filter;
  listReady: boolean;
  listError: string | null;
  ops: ListOp[];
  nextOpId: number;
  rowError: string | null;

  selectedId: number | null;
  /** bumped on every selection, so late answers for an earlier selection are ignored */
  token: number;
  detail: IssueDetail | null;
  detailError: string | null;
  titleInput: string;
  commentInput: string;
  labelInput: string;
  errors: DetailErrors;

  comments: Comment[];
  commentsError: string | null;
  pendingPosts: PendingPost[];

  labels: string[];
  labelsError: string | null;
  labelOps: LabelOp[];
  /** opId of the newest label change whose answer was applied */
  labelsAnsweredBy: number;

  relatedQuery: string;
  related: Hit[];
  relatedError: string | null;
}

type OpReq = { opId: number };
type AssignReq = OpReq & { id: number; user: string };
type RenameReq = OpReq & { id: number; title: string };
type CloseReq = OpReq & { id: number };
type PostReq = OpReq & { id: number; author: string; text: string };
type LabelReq = OpReq & { id: number; label: string };

type Done<N extends string, I, O> = { type: `${N}.done`; input: I; output: O };
type Failed<N extends string, I> = { type: `${N}.failed`; input: I; message: string };

export type IssuesEvent =
  | { type: "USER"; value: string }
  | { type: "FILTER"; filter: Filter }
  | { type: "SELECT"; id: number }
  | { type: "RETRY" }
  | { type: "ASSIGN" }
  | { type: "TITLE_INPUT"; value: string }
  | { type: "RENAME" }
  | { type: "CLOSE" }
  | { type: "ROW_ASSIGN"; id: number }
  | { type: "ROW_CLOSE"; id: number }
  | { type: "COMMENT_INPUT"; value: string }
  | { type: "POST" }
  | { type: "LABEL_INPUT"; value: string }
  | { type: "ADD_LABEL" }
  | { type: "REMOVE_LABEL"; label: string }
  | { type: "OPEN_RELATED"; hitId: number }
  | Done<"assign", AssignReq, { id: number; assignee: string }>
  | Failed<"assign", AssignReq>
  | Done<"rename", RenameReq, { id: number; title: string }>
  | Failed<"rename", RenameReq>
  | Done<"close", CloseReq, { id: number }>
  | Failed<"close", CloseReq>
  | Done<"post", PostReq, Comment>
  | Failed<"post", PostReq>
  | Done<"addLabel", LabelReq, string[]>
  | Failed<"addLabel", LabelReq>
  | Done<"removeLabel", LabelReq, string[]>
  | Failed<"removeLabel", LabelReq>;

/** The list as the page shows it: the server's rows with the pending changes on top. */
export function visibleIssues(ctx: IssuesContext): Issue[] {
  let rows = ctx.issues;
  for (const op of ctx.ops) {
    if (op.kind === "close") {
      if (ctx.listFilter === "open") rows = rows.filter(r => r.id !== op.id);
    } else if (op.kind === "assign") {
      rows = rows.map(r => (r.id === op.id ? { ...r, assignee: op.user } : r));
    } else {
      rows = rows.map(r => (r.id === op.id ? { ...r, title: op.title } : r));
    }
  }
  return rows;
}

/** The selected issue's title as the page shows it, with a pending rename on top. */
export function visibleTitle(ctx: IssuesContext): string | null {
  if (!ctx.detail) return null;
  let title = ctx.detail.title;
  for (const op of ctx.ops) if (op.kind === "rename" && op.id === ctx.detail.id) title = op.title;
  return title;
}

export function visibleLabels(ctx: IssuesContext): string[] {
  let labels = ctx.labels;
  for (const op of ctx.labelOps) {
    if (op.kind === "add") {
      if (!labels.includes(op.label)) labels = [...labels, op.label];
    } else {
      labels = labels.filter(l => l !== op.label);
    }
  }
  return labels;
}

/** The open-issue count to show on the tab, or null when the list does not show loaded open issues. */
export function openCount(ctx: IssuesContext): number | null {
  if (!ctx.listReady || ctx.listFilter !== "open" || ctx.filter !== "open") return null;
  return visibleIssues(ctx).length;
}

export const issuesMachine = setup({
  types: {
    context: {} as IssuesContext,
    events: {} as IssuesEvent,
  },
  actors: {
    loadIssues: fromPromise<Issue[], { filter: Filter }>(({ input }) => api.fetchIssues(input.filter)),
    loadIssue: fromPromise<IssueDetail | null, { id: number }>(({ input }) => api.fetchIssue(input.id)),
    loadComments: fromPromise<Comment[], { id: number }>(({ input }) => api.fetchComments(input.id)),
    loadLabels: fromPromise<string[], { id: number }>(({ input }) => api.fetchLabels(input.id)),
    findRelated: fromPromise<Hit[], { q: string }>(({ input }) => api.search(input.q)),
    assignRequest: requestMachine("assign", (r: AssignReq) => api.assign(r.id, r.user)),
    renameRequest: requestMachine("rename", (r: RenameReq) => api.renameIssue(r.id, r.title)),
    closeRequest: requestMachine("close", (r: CloseReq) => api.closeIssue(r.id)),
    postRequest: requestMachine("post", (r: PostReq) => api.addComment(r.id, r.author, r.text)),
    addLabelRequest: requestMachine("addLabel", (r: LabelReq) => api.addLabel(r.id, r.label)),
    removeLabelRequest: requestMachine("removeLabel", (r: LabelReq) => api.removeLabel(r.id, r.label)),
  },
  actions: {
    /** tells the app the open count whenever the list shows loaded open issues */
    reportCount: sendParent(({ context }) => ({ type: "COUNT", count: openCount(context) })),
  },
}).createMachine({
  id: "issues",
  type: "parallel",
  context: {
    user: "guest",
    filter: "open",
    issues: [],
    listFilter: "open",
    listReady: false,
    listError: null,
    ops: [],
    nextOpId: 1,
    rowError: null,
    selectedId: null,
    token: 0,
    detail: null,
    detailError: null,
    titleInput: "",
    commentInput: "",
    labelInput: "",
    errors: noErrors,
    comments: [],
    commentsError: null,
    pendingPosts: [],
    labels: [],
    labelsError: null,
    labelOps: [],
    labelsAnsweredBy: 0,
    relatedQuery: "",
    related: [],
    relatedError: null,
  },
  on: {
    USER: { actions: assign({ user: ({ event }) => event.value }) },
    TITLE_INPUT: { actions: assign({ titleInput: ({ event }) => event.value }) },
    COMMENT_INPUT: { actions: assign({ commentInput: ({ event }) => event.value }) },
    LABEL_INPUT: { actions: assign({ labelInput: ({ event }) => event.value }) },

    // ---- assign
    ASSIGN: {
      guard: ({ context }) => context.selectedId !== null,
      actions: enqueueActions(({ context, enqueue }) => {
        const op: ListOp = { opId: context.nextOpId, token: context.token, source: "detail", kind: "assign", id: context.selectedId!, user: context.user };
        enqueue.assign({ ops: [...context.ops, op], nextOpId: op.opId + 1, errors: { ...context.errors, assign: null } });
        enqueue.spawnChild("assignRequest", { input: { opId: op.opId, id: op.id, user: op.user } });
      }),
    },
    ROW_ASSIGN: {
      actions: enqueueActions(({ context, event, enqueue }) => {
        const op: ListOp = { opId: context.nextOpId, token: context.token, source: "row", kind: "assign", id: event.id, user: context.user };
        enqueue.assign({ ops: [...context.ops, op], nextOpId: op.opId + 1, rowError: null });
        enqueue.spawnChild("assignRequest", { input: { opId: op.opId, id: op.id, user: op.user } });
      }),
    },
    "assign.done": {
      actions: assign({
        issues: ({ context, event }) => context.issues.map(r => (r.id === event.output.id ? { ...r, assignee: event.output.assignee } : r)),
        ops: ({ context, event }) => context.ops.filter(o => o.opId !== event.input.opId),
      }),
    },

    // ---- rename
    RENAME: {
      guard: ({ context }) => context.selectedId !== null && context.titleInput.trim() !== "",
      actions: enqueueActions(({ context, enqueue }) => {
        const op: ListOp = { opId: context.nextOpId, token: context.token, source: "detail", kind: "rename", id: context.selectedId!, title: context.titleInput };
        enqueue.assign({ ops: [...context.ops, op], nextOpId: op.opId + 1, errors: { ...context.errors, rename: null } });
        enqueue.spawnChild("renameRequest", { input: { opId: op.opId, id: op.id, title: op.title } });
      }),
    },
    "rename.done": {
      actions: assign({
        issues: ({ context, event }) => context.issues.map(r => (r.id === event.output.id ? { ...r, title: event.output.title } : r)),
        detail: ({ context, event }) => (context.detail && context.detail.id === event.output.id ? { ...context.detail, title: event.output.title } : context.detail),
        ops: ({ context, event }) => context.ops.filter(o => o.opId !== event.input.opId),
      }),
    },

    // ---- close
    CLOSE: {
      guard: ({ context }) => context.selectedId !== null,
      actions: [
        enqueueActions(({ context, enqueue }) => {
          const op: ListOp = { opId: context.nextOpId, token: context.token, source: "detail", kind: "close", id: context.selectedId! };
          enqueue.assign({ ops: [...context.ops, op], nextOpId: op.opId + 1, errors: { ...context.errors, close: null } });
          enqueue.spawnChild("closeRequest", { input: { opId: op.opId, id: op.id } });
        }),
        "reportCount",
      ],
    },
    ROW_CLOSE: {
      actions: [
        enqueueActions(({ context, event, enqueue }) => {
          const op: ListOp = { opId: context.nextOpId, token: context.token, source: "row", kind: "close", id: event.id };
          enqueue.assign({ ops: [...context.ops, op], nextOpId: op.opId + 1, rowError: null });
          enqueue.spawnChild("closeRequest", { input: { opId: op.opId, id: op.id } });
        }),
        "reportCount",
      ],
    },
    "close.done": {
      actions: [
        assign({
          issues: ({ context, event }) => (context.listFilter === "open" ? context.issues.filter(r => r.id !== event.input.id) : context.issues),
          ops: ({ context, event }) => context.ops.filter(o => o.opId !== event.input.opId),
        }),
        "reportCount",
      ],
    },

    // ---- a declined list change: drop it, so the row shows what it had before, and say so
    "assign.failed": { actions: enqueueActions(({ context, event, enqueue }) => listOpFailed(context, event.input.opId, "assign", event.message, enqueue)) },
    "rename.failed": { actions: enqueueActions(({ context, event, enqueue }) => listOpFailed(context, event.input.opId, "rename", event.message, enqueue)) },
    "close.failed": {
      actions: [enqueueActions(({ context, event, enqueue }) => listOpFailed(context, event.input.opId, "close", event.message, enqueue)), "reportCount"],
    },
  },
  states: {
    list: {
      initial: "loading",
      on: {
        FILTER: {
          guard: ({ context, event }) => event.filter !== context.filter || context.listError !== null,
          target: ".loading",
          actions: assign({ filter: ({ event }) => event.filter, listReady: false, listError: null }),
        },
      },
      states: {
        loading: {
          invoke: {
            src: "loadIssues",
            input: ({ context }) => ({ filter: context.filter }),
            onDone: {
              target: "loaded",
              actions: [
                assign({ issues: ({ event }) => event.output, listFilter: ({ context }) => context.filter, listReady: true }),
                "reportCount",
              ],
            },
            onError: {
              target: "failed",
              actions: assign({ listError: ({ event }) => messageOf(event.error) }),
            },
          },
        },
        loaded: {},
        failed: {},
      },
    },

    detail: {
      initial: "idle",
      on: {
        SELECT: {
          guard: ({ context, event }) => event.id !== context.selectedId,
          target: ".selected",
          actions: assign(({ context, event }) => ({
            selectedId: event.id,
            token: context.token + 1,
            detail: null,
            detailError: null,
            titleInput: "",
            commentInput: "",
            labelInput: "",
            errors: noErrors,
            comments: [],
            commentsError: null,
            pendingPosts: [],
            labels: [],
            labelsError: null,
            labelOps: [],
            labelsAnsweredBy: 0,
            relatedQuery: "",
            related: [],
            relatedError: null,
          })),
        },
      },
      states: {
        idle: {},
        selected: {
          type: "parallel",
          states: {
            issue: {
              initial: "loading",
              on: {
                RETRY: { target: ".loading" },
              },
              states: {
                loading: {
                  entry: assign({ detail: null, detailError: null }),
                  invoke: {
                    src: "loadIssue",
                    input: ({ context }) => ({ id: context.selectedId! }),
                    onDone: [
                      { guard: ({ event }) => event.output === null, target: "notFound" },
                      { target: "loaded", actions: assign({ detail: ({ event }) => event.output }) },
                    ],
                    onError: {
                      target: "failed",
                      actions: assign({ detailError: ({ event }) => messageOf(event.error) }),
                    },
                  },
                },
                notFound: {},
                failed: {},
                loaded: {
                  initial: "searching",
                  on: {
                    OPEN_RELATED: {
                      actions: sendParent(({ context, event }) => ({
                        type: "OPEN_RELATED",
                        query: context.relatedQuery,
                        hits: context.related,
                        hitId: event.hitId,
                      })),
                    },
                  },
                  states: {
                    searching: {
                      entry: assign({ relatedQuery: ({ context }) => context.detail!.title, related: [], relatedError: null }),
                      invoke: {
                        src: "findRelated",
                        input: ({ context }) => ({ q: context.relatedQuery }),
                        onDone: { target: "found", actions: assign({ related: ({ event }) => event.output }) },
                        onError: { target: "failed", actions: assign({ relatedError: ({ event }) => messageOf(event.error) }) },
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
              on: {
                POST: {
                  guard: ({ context }) => context.commentInput.trim() !== "",
                  actions: enqueueActions(({ context, enqueue }) => {
                    const post: PendingPost = { opId: context.nextOpId, author: context.user, text: context.commentInput };
                    enqueue.assign({
                      pendingPosts: [...context.pendingPosts, post],
                      nextOpId: post.opId + 1,
                      commentInput: "",
                      errors: { ...context.errors, post: null },
                    });
                    enqueue.spawnChild("postRequest", { input: { ...post, id: context.selectedId! } });
                  }),
                },
                "post.done": {
                  guard: ({ context, event }) => context.pendingPosts.some(p => p.opId === event.input.opId),
                  actions: assign({
                    comments: ({ context, event }) => [...context.comments, event.output],
                    pendingPosts: ({ context, event }) => context.pendingPosts.filter(p => p.opId !== event.input.opId),
                  }),
                },
                "post.failed": {
                  guard: ({ context, event }) => context.pendingPosts.some(p => p.opId === event.input.opId),
                  actions: assign({
                    pendingPosts: ({ context, event }) => context.pendingPosts.filter(p => p.opId !== event.input.opId),
                    errors: ({ context, event }) => ({ ...context.errors, post: event.message }),
                  }),
                },
              },
              states: {
                loading: {
                  invoke: {
                    src: "loadComments",
                    input: ({ context }) => ({ id: context.selectedId! }),
                    onDone: {
                      target: "loaded",
                      actions: assign({
                        // keep comments posted while the list was loading, unless the server already has them
                        comments: ({ context, event }) => [
                          ...event.output,
                          ...context.comments.filter(c => !event.output.some(o => o.author === c.author && o.text === c.text)),
                        ],
                      }),
                    },
                    onError: { target: "failed", actions: assign({ commentsError: ({ event }) => messageOf(event.error) }) },
                  },
                },
                loaded: {},
                failed: {},
              },
            },

            labels: {
              initial: "loading",
              on: {
                ADD_LABEL: {
                  guard: ({ context }) => {
                    const label = context.labelInput.trim();
                    return label !== "" && !visibleLabels(context).includes(label);
                  },
                  actions: enqueueActions(({ context, enqueue }) => {
                    const op: LabelOp = { opId: context.nextOpId, kind: "add", label: context.labelInput.trim() };
                    enqueue.assign({
                      labelOps: [...context.labelOps, op],
                      nextOpId: op.opId + 1,
                      labelInput: "",
                      errors: { ...context.errors, label: null },
                    });
                    enqueue.spawnChild("addLabelRequest", { input: { opId: op.opId, id: context.selectedId!, label: op.label } });
                  }),
                },
                REMOVE_LABEL: {
                  guard: ({ context, event }) => visibleLabels(context).includes(event.label),
                  actions: enqueueActions(({ context, event, enqueue }) => {
                    const op: LabelOp = { opId: context.nextOpId, kind: "remove", label: event.label };
                    enqueue.assign({
                      labelOps: [...context.labelOps, op],
                      nextOpId: op.opId + 1,
                      errors: { ...context.errors, label: null },
                    });
                    enqueue.spawnChild("removeLabelRequest", { input: { opId: op.opId, id: context.selectedId!, label: op.label } });
                  }),
                },
                "addLabel.done": { actions: enqueueActions(({ context, event, enqueue }) => labelOpDone(context, event.input.opId, event.output, enqueue)) },
                "removeLabel.done": { actions: enqueueActions(({ context, event, enqueue }) => labelOpDone(context, event.input.opId, event.output, enqueue)) },
                "addLabel.failed": { actions: enqueueActions(({ context, event, enqueue }) => labelOpFailed(context, event.input.opId, event.message, enqueue)) },
                "removeLabel.failed": { actions: enqueueActions(({ context, event, enqueue }) => labelOpFailed(context, event.input.opId, event.message, enqueue)) },
              },
              states: {
                loading: {
                  invoke: {
                    src: "loadLabels",
                    input: ({ context }) => ({ id: context.selectedId! }),
                    onDone: {
                      target: "loaded",
                      actions: assign({
                        // a label change answered first already carries the server's newer labels
                        labels: ({ context, event }) => (context.labelsAnsweredBy === 0 ? event.output : context.labels),
                      }),
                    },
                    onError: { target: "failed", actions: assign({ labelsError: ({ event }) => messageOf(event.error) }) },
                  },
                },
                loaded: {},
                failed: {},
              },
            },
          },
        },
      },
    },
  },
});

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

type Enqueue = {
  assign: (patch: Partial<IssuesContext>) => void;
};

function listOpFailed(context: IssuesContext, opId: number, kind: "assign" | "rename" | "close", message: string, enqueue: Enqueue) {
  const op = context.ops.find(o => o.opId === opId);
  if (!op) return;
  const patch: Partial<IssuesContext> = { ops: context.ops.filter(o => o.opId !== opId) };
  if (op.source === "row") patch.rowError = message;
  else if (op.token === context.token) patch.errors = { ...context.errors, [kind]: message };
  enqueue.assign(patch);
}

function labelOpDone(context: IssuesContext, opId: number, labels: string[], enqueue: Enqueue) {
  if (!context.labelOps.some(o => o.opId === opId)) return;
  const newer = opId > context.labelsAnsweredBy;
  enqueue.assign({
    labelOps: context.labelOps.filter(o => o.opId !== opId),
    ...(newer ? { labels, labelsAnsweredBy: opId } : {}),
  });
}

function labelOpFailed(context: IssuesContext, opId: number, message: string, enqueue: Enqueue) {
  if (!context.labelOps.some(o => o.opId === opId)) return;
  enqueue.assign({
    labelOps: context.labelOps.filter(o => o.opId !== opId),
    errors: { ...context.errors, label: message },
  });
}
