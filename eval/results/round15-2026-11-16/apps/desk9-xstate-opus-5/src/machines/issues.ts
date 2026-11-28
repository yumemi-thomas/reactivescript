import { assign, enqueueActions, fromPromise, raise, sendParent, setup } from "xstate";
import * as api from "../api.js";
import type { Comment, Hit, Issue, IssueDetail } from "../api.js";
import { errorMessage, taskMachine, type TaskEvent } from "./task";

export type Filter = "open" | "closed";
type Source = "detail" | "row";

type OpBody =
  | { kind: "assign"; issueId: number; user: string }
  | { kind: "rename"; issueId: number; title: string }
  | { kind: "close"; issueId: number }
  | { kind: "post"; issueId: number; author: string; text: string }
  | { kind: "addLabel"; issueId: number; label: string }
  | { kind: "removeLabel"; issueId: number; label: string };

/** A change sent to the server and not answered yet. */
export type Op = OpBody & {
  /** issue order of the change; also the id of the task actor carrying it */
  seq: number;
  /** where it was started: the detail's buttons or a row's */
  source: Source;
  /** the selection it was started under (comment and label changes belong to it) */
  selSeq: number;
};

type DetailErrorKind = "assign" | "rename" | "close" | "post" | "label";
type DetailErrors = Record<DetailErrorKind, string | null>;

const noErrors: DetailErrors = { assign: null, rename: null, close: null, post: null, label: null };

export type IssuesContext = {
  user: string;
  filter: Filter;
  /** the list as the server last answered it, with accepted changes applied */
  issues: Issue[];
  listReady: boolean;
  listError: string | null;

  ops: Op[];
  nextSeq: number;
  /** per `<kind>:<issue id>`, the seq of the latest change the server accepted */
  confirmed: Record<string, number>;

  selectedId: number | null;
  selSeq: number;
  detail: IssueDetail | null;
  detailError: string | null;
  comments: Comment[];
  commentsReady: boolean;
  commentsError: string | null;
  labels: string[];
  labelsReady: boolean;
  labelsSeq: number;
  labelsError: string | null;
  relatedQuery: string;
  related: Hit[];
  relatedError: string | null;

  titleDraft: string;
  commentDraft: string;
  labelDraft: string;
  errors: DetailErrors;
  rowError: string | null;
};

export type IssuesEvent =
  | { type: "user.change"; value: string }
  | { type: "filter.set"; filter: Filter }
  | { type: "list.retry" }
  | { type: "select"; id: number }
  | { type: "detail.retry" }
  | { type: "assign"; source: Source; id: number }
  | { type: "close"; source: Source; id: number }
  | { type: "title.change"; value: string }
  | { type: "rename" }
  | { type: "comment.change"; value: string }
  | { type: "post" }
  | { type: "label.change"; value: string }
  | { type: "label.add" }
  | { type: "label.remove"; label: string }
  | { type: "related.open"; hitId: number }
  | { type: "related.search" }
  | { type: "related.reset" }
  | TaskEvent;

/** What the issues page tells the app. */
export type IssuesParentEvent =
  | { type: "issues.count"; count: number }
  | { type: "help.openRelated"; query: string; hits: Hit[]; hitId: number };

// ---------------------------------------------------------------------------
// Derived views

const fieldKey = (kind: OpBody["kind"], issueId: number) => `${kind}:${issueId}`;

/** The newest pending change of `kind` to issue `issueId` that is newer than what the server accepted. */
function latestPending<K extends "assign" | "rename">(
  ctx: IssuesContext,
  kind: K,
  issueId: number,
): Extract<Op, { kind: K }> | undefined {
  const floor = ctx.confirmed[fieldKey(kind, issueId)] ?? -1;
  let found: Extract<Op, { kind: K }> | undefined;
  for (const op of ctx.ops) {
    if (op.kind === kind && op.issueId === issueId && op.seq > floor) found = op as Extract<Op, { kind: K }>;
  }
  return found;
}

const closing = (ctx: IssuesContext, issueId: number) =>
  ctx.ops.some(op => op.kind === "close" && op.issueId === issueId);

/** The rows of the list as they show: the server's list with the pending changes applied. */
export function visibleIssues(ctx: IssuesContext): Issue[] {
  const rows: Issue[] = [];
  for (const issue of ctx.issues) {
    if (ctx.filter === "open" && closing(ctx, issue.id)) continue;
    const a = latestPending(ctx, "assign", issue.id);
    const r = latestPending(ctx, "rename", issue.id);
    rows.push(a || r ? { ...issue, assignee: a ? a.user : issue.assignee, title: r ? r.title : issue.title } : issue);
  }
  return rows;
}

/** The selected issue's title as it shows (a pending rename shows at once). */
export function detailTitle(ctx: IssuesContext): string {
  if (!ctx.detail) return "";
  return latestPending(ctx, "rename", ctx.detail.id)?.title ?? ctx.detail.title;
}

export type CommentRow = Comment & { sending: boolean; key: string };

export function visibleComments(ctx: IssuesContext): CommentRow[] {
  const rows: CommentRow[] = ctx.comments.map((c, i) => ({ ...c, sending: false, key: `c${i}` }));
  for (const op of ctx.ops) {
    if (op.kind === "post" && op.selSeq === ctx.selSeq) {
      rows.push({ author: op.author, text: op.text, sending: true, key: `p${op.seq}` });
    }
  }
  return rows;
}

export function visibleLabels(ctx: IssuesContext): string[] {
  let labels = ctx.labels;
  for (const op of ctx.ops) {
    if (op.selSeq !== ctx.selSeq || op.seq <= ctx.labelsSeq) continue;
    if (op.kind === "addLabel" && !labels.includes(op.label)) labels = [...labels, op.label];
    if (op.kind === "removeLabel") labels = labels.filter(l => l !== op.label);
  }
  return labels;
}

function runOp(op: Op): Promise<unknown> {
  switch (op.kind) {
    case "assign":
      return api.assign(op.issueId, op.user);
    case "rename":
      return api.renameIssue(op.issueId, op.title);
    case "close":
      return api.closeIssue(op.issueId);
    case "post":
      return api.addComment(op.issueId, op.author, op.text);
    case "addLabel":
      return api.addLabel(op.issueId, op.label);
    case "removeLabel":
      return api.removeLabel(op.issueId, op.label);
  }
}

const errorKindOf = (op: Op): DetailErrorKind =>
  op.kind === "addLabel" || op.kind === "removeLabel" ? "label" : op.kind;

// ---------------------------------------------------------------------------
// The machine

export const issuesMachine = setup({
  types: {
    context: {} as IssuesContext,
    events: {} as IssuesEvent,
  },
  actors: {
    task: taskMachine,
    loadIssues: fromPromise<Issue[], { filter: Filter }>(({ input }) => api.fetchIssues(input.filter)),
    loadIssue: fromPromise<IssueDetail | null, { id: number }>(({ input }) => api.fetchIssue(input.id)),
    loadComments: fromPromise<Comment[], { id: number }>(({ input }) => api.fetchComments(input.id)),
    loadLabels: fromPromise<string[], { id: number }>(({ input }) => api.fetchLabels(input.id)),
    searchRelated: fromPromise<Hit[], { q: string }>(({ input }) => api.search(input.q)),
  },
  actions: {
    /** Tell the app how many open issues the list shows (only while it shows the loaded open list). */
    reportCount: enqueueActions(({ context, enqueue }) => {
      if (context.filter !== "open" || !context.listReady) return;
      enqueue.sendParent({ type: "issues.count", count: visibleIssues(context).length } satisfies IssuesParentEvent);
    }),
    /** Start a change: record it as pending, clear the error it replaces, and send it. */
    startOp: enqueueActions(({ context, enqueue }, params: { body: OpBody; source: Source }) => {
      const op = { ...params.body, seq: context.nextSeq, source: params.source, selSeq: context.selSeq } as Op;
      enqueue.assign({
        ops: [...context.ops, op],
        nextSeq: context.nextSeq + 1,
        errors: op.source === "detail" ? { ...context.errors, [errorKindOf(op)]: null } : context.errors,
        rowError: op.source === "row" ? null : context.rowError,
      });
      enqueue.spawnChild("task", { id: `task-${op.seq}`, input: { taskId: op.seq, run: () => runOp(op) } });
    }),
  },
  guards: {
    sameFilter: ({ context, event }) => event.type === "filter.set" && event.filter === context.filter,
    sameSelection: ({ context, event }) => event.type === "select" && event.id === context.selectedId,
  },
}).createMachine({
  id: "issues",
  type: "parallel",
  context: {
    user: "guest",
    filter: "open",
    issues: [],
    listReady: false,
    listError: null,
    ops: [],
    nextSeq: 1,
    confirmed: {},
    selectedId: null,
    selSeq: 0,
    detail: null,
    detailError: null,
    comments: [],
    commentsReady: false,
    commentsError: null,
    labels: [],
    labelsReady: false,
    labelsSeq: 0,
    labelsError: null,
    relatedQuery: "",
    related: [],
    relatedError: null,
    titleDraft: "",
    commentDraft: "",
    labelDraft: "",
    errors: noErrors,
    rowError: null,
  },
  on: {
    "user.change": { actions: assign({ user: ({ event }) => event.value }) },

    assign: {
      actions: enqueueActions(({ context, event, enqueue }) => {
        const user = context.user.trim();
        if (!user) return;
        enqueue({ type: "startOp", params: { body: { kind: "assign", issueId: event.id, user }, source: event.source } });
      }),
    },
    close: {
      actions: [
        { type: "startOp", params: ({ event }) => ({ body: { kind: "close", issueId: event.id }, source: event.source }) },
        "reportCount",
      ],
    },

    "task.done": {
      actions: [
        enqueueActions(({ context, event, enqueue }) => {
          const op = context.ops.find(o => o.seq === event.taskId);
          if (!op) return;
          const ops = context.ops.filter(o => o !== op);
          const key = fieldKey(op.kind, op.issueId);
          const newer = op.seq > (context.confirmed[key] ?? -1);
          const confirmed = newer ? { ...context.confirmed, [key]: op.seq } : context.confirmed;
          const current = op.selSeq === context.selSeq;
          switch (op.kind) {
            case "assign": {
              const out = event.output as { id: number; assignee: string };
              const assignee = out?.assignee ?? op.user;
              enqueue.assign({
                ops,
                confirmed,
                issues: newer ? context.issues.map(i => (i.id === op.issueId ? { ...i, assignee } : i)) : context.issues,
              });
              break;
            }
            case "rename": {
              const out = event.output as { id: number; title: string };
              const title = out?.title ?? op.title;
              enqueue.assign({
                ops,
                confirmed,
                issues: newer ? context.issues.map(i => (i.id === op.issueId ? { ...i, title } : i)) : context.issues,
                detail:
                  newer && context.detail && context.detail.id === op.issueId
                    ? { ...context.detail, title }
                    : context.detail,
              });
              break;
            }
            case "close":
              enqueue.assign({
                ops,
                confirmed,
                issues: context.filter === "open" ? context.issues.filter(i => i.id !== op.issueId) : context.issues,
              });
              break;
            case "post": {
              const out = event.output as Comment | undefined;
              const comment = out && typeof out.text === "string" ? out : { author: op.author, text: op.text };
              enqueue.assign({
                ops,
                comments: current && context.commentsReady ? [...context.comments, comment] : context.comments,
              });
              break;
            }
            case "addLabel":
            case "removeLabel": {
              const labels = event.output;
              const accept = current && context.labelsReady && Array.isArray(labels) && op.seq > context.labelsSeq;
              enqueue.assign({
                ops,
                labels: accept ? (labels as string[]) : context.labels,
                labelsSeq: accept ? op.seq : context.labelsSeq,
              });
              break;
            }
          }
        }),
        "reportCount",
      ],
    },
    "task.failed": {
      actions: [
        enqueueActions(({ context, event, enqueue }) => {
          const op = context.ops.find(o => o.seq === event.taskId);
          if (!op) return;
          const ops = context.ops.filter(o => o !== op);
          if (op.source === "row") {
            enqueue.assign({ ops, rowError: event.message });
          } else if (op.selSeq === context.selSeq) {
            enqueue.assign({ ops, errors: { ...context.errors, [errorKindOf(op)]: event.message } });
          } else {
            enqueue.assign({ ops });
          }
        }),
        "reportCount",
      ],
    },
  },
  states: {
    list: {
      initial: "loading",
      on: {
        "filter.set": [
          { guard: "sameFilter" },
          {
            target: ".loading",
            actions: assign({ filter: ({ event }) => event.filter }),
          },
        ],
      },
      states: {
        loading: {
          entry: assign({ issues: [], listReady: false, listError: null }),
          invoke: {
            src: "loadIssues",
            input: ({ context }) => ({ filter: context.filter }),
            onDone: {
              target: "ready",
              actions: [assign({ issues: ({ event }) => event.output, listReady: true }), "reportCount"],
            },
            onError: {
              target: "failed",
              actions: assign({ listError: ({ event }) => errorMessage(event.error) }),
            },
          },
        },
        ready: {},
        failed: {
          on: { "list.retry": "loading" },
        },
      },
    },

    detail: {
      initial: "idle",
      on: {
        select: [
          { guard: "sameSelection" },
          {
            target: ".selected",
            actions: assign(({ context, event }) => ({
              selectedId: event.id,
              selSeq: context.selSeq + 1,
              detail: null,
              detailError: null,
              comments: [],
              commentsReady: false,
              commentsError: null,
              labels: [],
              labelsReady: false,
              labelsSeq: 0,
              labelsError: null,
              relatedQuery: "",
              related: [],
              relatedError: null,
              titleDraft: "",
              commentDraft: "",
              labelDraft: "",
              errors: noErrors,
            })),
          },
        ],
      },
      states: {
        idle: {},
        selected: {
          type: "parallel",
          on: {
            "title.change": { actions: assign({ titleDraft: ({ event }) => event.value }) },
            "comment.change": { actions: assign({ commentDraft: ({ event }) => event.value }) },
            "label.change": { actions: assign({ labelDraft: ({ event }) => event.value }) },
            rename: {
              actions: enqueueActions(({ context, enqueue }) => {
                const title = context.titleDraft.trim();
                if (!title || context.selectedId === null) return;
                enqueue({
                  type: "startOp",
                  params: { body: { kind: "rename", issueId: context.selectedId, title }, source: "detail" },
                });
              }),
            },
            post: {
              actions: enqueueActions(({ context, enqueue }) => {
                const text = context.commentDraft.trim();
                if (!text || context.selectedId === null) return;
                enqueue.assign({ commentDraft: "" });
                enqueue({
                  type: "startOp",
                  params: {
                    body: { kind: "post", issueId: context.selectedId, author: context.user, text },
                    source: "detail",
                  },
                });
              }),
            },
            "label.add": {
              actions: enqueueActions(({ context, enqueue }) => {
                const label = context.labelDraft.trim();
                if (!label || context.selectedId === null) return;
                if (visibleLabels(context).includes(label)) return;
                enqueue.assign({ labelDraft: "" });
                enqueue({
                  type: "startOp",
                  params: { body: { kind: "addLabel", issueId: context.selectedId, label }, source: "detail" },
                });
              }),
            },
            "label.remove": {
              actions: enqueueActions(({ context, event, enqueue }) => {
                if (context.selectedId === null || !visibleLabels(context).includes(event.label)) return;
                enqueue({
                  type: "startOp",
                  params: { body: { kind: "removeLabel", issueId: context.selectedId, label: event.label }, source: "detail" },
                });
              }),
            },
            "related.open": {
              actions: sendParent(({ context, event }) => ({
                type: "help.openRelated",
                query: context.relatedQuery,
                hits: context.related,
                hitId: event.hitId,
              }) satisfies IssuesParentEvent),
            },
          },
          states: {
            issue: {
              initial: "loading",
              on: {
                "detail.retry": {
                  target: ".loading",
                  actions: raise({ type: "related.reset" }),
                },
              },
              states: {
                loading: {
                  entry: assign({ detail: null, detailError: null }),
                  invoke: {
                    src: "loadIssue",
                    input: ({ context }) => ({ id: context.selectedId ?? 0 }),
                    onDone: [
                      { guard: ({ event }) => event.output === null, target: "notFound" },
                      {
                        target: "loaded",
                        actions: [assign({ detail: ({ event }) => event.output }), raise({ type: "related.search" })],
                      },
                    ],
                    onError: {
                      target: "failed",
                      actions: assign({ detailError: ({ event }) => errorMessage(event.error) }),
                    },
                  },
                },
                loaded: {},
                notFound: {},
                failed: {},
              },
            },
            comments: {
              initial: "loading",
              states: {
                loading: {
                  invoke: {
                    src: "loadComments",
                    input: ({ context }) => ({ id: context.selectedId ?? 0 }),
                    onDone: {
                      target: "ready",
                      actions: assign({ comments: ({ event }) => event.output, commentsReady: true }),
                    },
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
                    src: "loadLabels",
                    input: ({ context }) => ({ id: context.selectedId ?? 0 }),
                    onDone: {
                      target: "ready",
                      actions: assign({ labels: ({ event }) => event.output, labelsReady: true }),
                    },
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
            related: {
              initial: "idle",
              on: {
                "related.reset": { target: ".idle" },
                "related.search": {
                  target: ".searching",
                  actions: assign({ relatedQuery: ({ context }) => context.detail?.title ?? "" }),
                },
              },
              states: {
                idle: {
                  entry: assign({ related: [], relatedError: null }),
                },
                searching: {
                  entry: assign({ related: [], relatedError: null }),
                  invoke: {
                    src: "searchRelated",
                    input: ({ context }) => ({ q: context.relatedQuery }),
                    onDone: {
                      target: "ready",
                      actions: assign({ related: ({ event }) => event.output }),
                    },
                    onError: {
                      target: "failed",
                      actions: assign({ relatedError: ({ event }) => errorMessage(event.error) }),
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
