import { assign, enqueueActions, fromPromise, sendParent, setup } from "xstate";
import * as api from "./api.js";
import type { Comment, Hit, Issue, IssueDetail } from "./api.js";
import { messageOf, runOp } from "./shared.js";

export type Filter = "open" | "closed";
export type Scope = "row" | "detail";
export type CommentItem = { key: string; author: string; text: string; pending: boolean };
export type Errors = {
  assign: string | null;
  rename: string | null;
  close: string | null;
  post: string | null;
  label: string | null;
};

const noErrors: Errors = { assign: null, rename: null, close: null, post: null, label: null };

/** What a server request needs to settle or undo its optimistic change. */
type OpRecord =
  | { kind: "assign"; scope: Scope; issueId: number; prev: string | null | undefined }
  | { kind: "rename"; issueId: number; prev: string | undefined }
  | { kind: "close"; scope: Scope; issueId: number; filter: Filter; removed: Issue | null; index: number }
  | { kind: "post"; issueId: number; key: string }
  | { kind: "addLabel"; issueId: number; label: string }
  | { kind: "removeLabel"; issueId: number; label: string; index: number };

export type IssuesContext = {
  user: string;
  filter: Filter;
  listStatus: "loading" | "loaded" | "failed";
  listError: string | null;
  rows: Issue[];
  rowError: string | null;
  selectedId: number | null;
  issue: IssueDetail | null;
  issueError: string | null;
  comments: CommentItem[];
  commentsError: string | null;
  labels: string[];
  labelsError: string | null;
  hits: Hit[];
  relatedError: string | null;
  errors: Errors;
  ops: Record<string, OpRecord>;
  nextOp: number;
};

type IssuesEvent =
  | { type: "SET_USER"; user: string }
  | { type: "FILTER"; filter: Filter }
  | { type: "SELECT"; id: number }
  | { type: "ASSIGN"; id: number; scope: Scope }
  | { type: "CLOSE"; id: number; scope: Scope }
  | { type: "RENAME"; title: string }
  | { type: "POST"; text: string }
  | { type: "ADD_LABEL"; label: string }
  | { type: "REMOVE_LABEL"; label: string }
  | { type: "RETRY" }
  | { type: "OPEN_RELATED"; id: number }
  | { type: "OP_DONE"; opId: string; value: unknown }
  | { type: "OP_FAILED"; opId: string; message: string };

/** Tells the desk the open list's length; `show` is false while another list or a loading list is up. */
export function countEvent(ctx: IssuesContext) {
  return {
    type: "OPEN_LIST" as const,
    count: ctx.rows.length,
    show: ctx.filter === "open" && ctx.listStatus === "loaded",
  };
}

function withoutOp(ops: Record<string, OpRecord>, opId: string): Record<string, OpRecord> {
  const rest = { ...ops };
  delete rest[opId];
  return rest;
}

/** A server request was accepted: keep the optimistic change, take the server's answer where it has one. */
function settle(ctx: IssuesContext, rec: OpRecord, value: unknown): Partial<IssuesContext> {
  switch (rec.kind) {
    case "post": {
      const c = value as Comment;
      return {
        comments: ctx.comments.map((item) =>
          item.key === rec.key ? { ...item, author: c.author, text: c.text, pending: false } : item,
        ),
      };
    }
    case "addLabel":
    case "removeLabel":
      return rec.issueId === ctx.selectedId ? { labels: value as string[] } : {};
    default:
      return {};
  }
}

/** A server request was declined: undo its optimistic change and show the error where it belongs. */
function fail(ctx: IssuesContext, rec: OpRecord, message: string): Partial<IssuesContext> {
  const mine = rec.issueId === ctx.selectedId;
  switch (rec.kind) {
    case "assign": {
      const prev = rec.prev;
      const rows =
        prev === undefined
          ? ctx.rows
          : ctx.rows.map((r) => (r.id === rec.issueId ? { ...r, assignee: prev } : r));
      if (rec.scope === "row") return { rows, rowError: message };
      return mine ? { rows, errors: { ...ctx.errors, assign: message } } : { rows };
    }
    case "rename": {
      const prev = rec.prev;
      const rows =
        prev === undefined ? ctx.rows : ctx.rows.map((r) => (r.id === rec.issueId ? { ...r, title: prev } : r));
      const issue =
        prev !== undefined && ctx.issue && ctx.issue.id === rec.issueId ? { ...ctx.issue, title: prev } : ctx.issue;
      return mine ? { rows, issue, errors: { ...ctx.errors, rename: message } } : { rows, issue };
    }
    case "close": {
      const removed = rec.removed;
      let rows = ctx.rows;
      if (
        rec.filter === "open" &&
        removed &&
        ctx.listStatus === "loaded" &&
        !ctx.rows.some((r) => r.id === removed.id)
      ) {
        rows = [...ctx.rows.slice(0, rec.index), removed, ...ctx.rows.slice(rec.index)];
      }
      if (rec.scope === "row") return { rows, rowError: message };
      return mine ? { rows, errors: { ...ctx.errors, close: message } } : { rows };
    }
    case "post":
      return {
        comments: ctx.comments.filter((c) => c.key !== rec.key),
        ...(mine ? { errors: { ...ctx.errors, post: message } } : {}),
      };
    case "addLabel": {
      if (!mine) return {};
      const i = ctx.labels.indexOf(rec.label);
      const labels = i < 0 ? ctx.labels : [...ctx.labels.slice(0, i), ...ctx.labels.slice(i + 1)];
      return { labels, errors: { ...ctx.errors, label: message } };
    }
    case "removeLabel": {
      if (!mine) return {};
      const labels = ctx.labels.includes(rec.label)
        ? ctx.labels
        : [...ctx.labels.slice(0, rec.index), rec.label, ...ctx.labels.slice(rec.index)];
      return { labels, errors: { ...ctx.errors, label: message } };
    }
  }
}

export const issuesMachine = setup({
  types: {
    context: {} as IssuesContext,
    events: {} as IssuesEvent,
  },
  actors: {
    runOp,
    loadIssues: fromPromise<Issue[], Filter>(({ input }) => api.fetchIssues(input)),
    loadIssue: fromPromise<IssueDetail | null, number>(({ input }) => api.fetchIssue(input)),
    loadComments: fromPromise<Comment[], number>(({ input }) => api.fetchComments(input)),
    loadLabels: fromPromise<string[], number>(({ input }) => api.fetchLabels(input)),
    searchRelated: fromPromise<Hit[], string>(({ input }) => api.search(input)),
  },
}).createMachine({
  id: "issues",
  type: "parallel",
  context: {
    user: "guest",
    filter: "open",
    listStatus: "loading",
    listError: null,
    rows: [],
    rowError: null,
    selectedId: null,
    issue: null,
    issueError: null,
    comments: [],
    commentsError: null,
    labels: [],
    labelsError: null,
    hits: [],
    relatedError: null,
    errors: noErrors,
    ops: {},
    nextOp: 0,
  },
  on: {
    SET_USER: {
      actions: assign({ user: ({ event }) => event.user }),
    },
    ASSIGN: {
      actions: enqueueActions(({ context, event, enqueue }) => {
        const id = event.id;
        const user = context.user;
        const opId = `op${context.nextOp}`;
        const row = context.rows.find((r) => r.id === id);
        enqueue.assign({
          nextOp: context.nextOp + 1,
          ops: {
            ...context.ops,
            [opId]: { kind: "assign", scope: event.scope, issueId: id, prev: row ? row.assignee : undefined },
          },
          rows: context.rows.map((r) => (r.id === id ? { ...r, assignee: user } : r)),
          rowError: event.scope === "row" ? null : context.rowError,
          errors: event.scope === "detail" ? { ...context.errors, assign: null } : context.errors,
        });
        enqueue.spawnChild("runOp", {
          id: opId,
          input: { opId, run: () => api.assign(id, user) },
        });
      }),
    },
    CLOSE: {
      actions: [
        enqueueActions(({ context, event, enqueue }) => {
          const id = event.id;
          const opId = `op${context.nextOp}`;
          const index = context.rows.findIndex((r) => r.id === id);
          const removed = index >= 0 ? context.rows[index] : null;
          const removes = context.filter === "open" && removed !== null;
          enqueue.assign({
            nextOp: context.nextOp + 1,
            ops: {
              ...context.ops,
              [opId]: { kind: "close", scope: event.scope, issueId: id, filter: context.filter, removed, index },
            },
            rows: removes ? context.rows.filter((r) => r.id !== id) : context.rows,
            rowError: event.scope === "row" ? null : context.rowError,
            errors: event.scope === "detail" ? { ...context.errors, close: null } : context.errors,
          });
          enqueue.spawnChild("runOp", {
            id: opId,
            input: { opId, run: () => api.closeIssue(id) },
          });
        }),
        sendParent(({ context }) => countEvent(context)),
      ],
    },
    OP_DONE: {
      actions: enqueueActions(({ context, event, enqueue }) => {
        enqueue.stopChild(event.opId);
        const rec = context.ops[event.opId];
        if (!rec) return;
        enqueue.assign({
          ops: withoutOp(context.ops, event.opId),
          ...settle(context, rec, event.value),
        });
      }),
    },
    OP_FAILED: {
      actions: [
        enqueueActions(({ context, event, enqueue }) => {
          enqueue.stopChild(event.opId);
          const rec = context.ops[event.opId];
          if (!rec) return;
          enqueue.assign({
            ops: withoutOp(context.ops, event.opId),
            ...fail(context, rec, event.message),
          });
        }),
        sendParent(({ context }) => countEvent(context)),
      ],
    },
    OPEN_RELATED: {
      actions: sendParent(({ context, event }) => ({
        type: "OPEN_HELP" as const,
        query: context.issue?.title ?? "",
        hitId: event.id,
      })),
    },
  },
  states: {
    list: {
      initial: "loading",
      on: {
        FILTER: {
          guard: ({ context, event }) => event.filter !== context.filter,
          target: ".loading",
          reenter: true,
          actions: assign({
            filter: ({ event }) => event.filter,
            listStatus: "loading",
            listError: null,
            rows: [],
          }),
        },
      },
      states: {
        loading: {
          invoke: {
            src: "loadIssues",
            input: ({ context }) => context.filter,
            onDone: {
              target: "loaded",
              actions: [
                assign({ rows: ({ event }) => event.output, listStatus: "loaded" }),
                sendParent(({ context }) => countEvent(context)),
              ],
            },
            onError: {
              target: "failed",
              actions: assign({
                rows: [],
                listStatus: "failed",
                listError: ({ event }) => messageOf(event.error),
              }),
            },
          },
        },
        loaded: {},
        failed: {},
      },
    },
    detail: {
      initial: "none",
      on: {
        SELECT: {
          target: ".selected",
          reenter: true,
          actions: assign({
            selectedId: ({ event }) => event.id,
            issue: null,
            issueError: null,
            comments: [],
            commentsError: null,
            labels: [],
            labelsError: null,
            hits: [],
            relatedError: null,
            errors: noErrors,
          }),
        },
      },
      states: {
        none: {},
        selected: {
          type: "parallel",
          on: {
            RENAME: {
              guard: ({ context, event }) => context.selectedId !== null && event.title.trim() !== "",
              actions: enqueueActions(({ context, event, enqueue }) => {
                const id = context.selectedId as number;
                const title = event.title;
                const opId = `op${context.nextOp}`;
                const prev = context.issue?.title ?? context.rows.find((r) => r.id === id)?.title;
                enqueue.assign({
                  nextOp: context.nextOp + 1,
                  ops: { ...context.ops, [opId]: { kind: "rename", issueId: id, prev } },
                  rows: context.rows.map((r) => (r.id === id ? { ...r, title } : r)),
                  issue: context.issue && context.issue.id === id ? { ...context.issue, title } : context.issue,
                  errors: { ...context.errors, rename: null },
                });
                enqueue.spawnChild("runOp", {
                  id: opId,
                  input: { opId, run: () => api.renameIssue(id, title) },
                });
              }),
            },
            POST: {
              guard: ({ context, event }) => context.selectedId !== null && event.text.trim() !== "",
              actions: enqueueActions(({ context, event, enqueue }) => {
                const id = context.selectedId as number;
                const text = event.text;
                const author = context.user;
                const opId = `op${context.nextOp}`;
                enqueue.assign({
                  nextOp: context.nextOp + 1,
                  ops: { ...context.ops, [opId]: { kind: "post", issueId: id, key: opId } },
                  comments: [...context.comments, { key: opId, author, text, pending: true }],
                  errors: { ...context.errors, post: null },
                });
                enqueue.spawnChild("runOp", {
                  id: opId,
                  input: { opId, run: () => api.addComment(id, author, text) },
                });
              }),
            },
            ADD_LABEL: {
              guard: ({ context, event }) => {
                const label = event.label.trim();
                return context.selectedId !== null && label !== "" && !context.labels.includes(label);
              },
              actions: enqueueActions(({ context, event, enqueue }) => {
                const id = context.selectedId as number;
                const label = event.label.trim();
                const opId = `op${context.nextOp}`;
                enqueue.assign({
                  nextOp: context.nextOp + 1,
                  ops: { ...context.ops, [opId]: { kind: "addLabel", issueId: id, label } },
                  labels: [...context.labels, label],
                  errors: { ...context.errors, label: null },
                });
                enqueue.spawnChild("runOp", {
                  id: opId,
                  input: { opId, run: () => api.addLabel(id, label) },
                });
              }),
            },
            REMOVE_LABEL: {
              guard: ({ context, event }) => context.selectedId !== null && context.labels.includes(event.label),
              actions: enqueueActions(({ context, event, enqueue }) => {
                const id = context.selectedId as number;
                const label = event.label;
                const index = context.labels.indexOf(label);
                const opId = `op${context.nextOp}`;
                enqueue.assign({
                  nextOp: context.nextOp + 1,
                  ops: { ...context.ops, [opId]: { kind: "removeLabel", issueId: id, label, index } },
                  labels: context.labels.filter((l) => l !== label),
                  errors: { ...context.errors, label: null },
                });
                enqueue.spawnChild("runOp", {
                  id: opId,
                  input: { opId, run: () => api.removeLabel(id, label) },
                });
              }),
            },
          },
          states: {
            issue: {
              initial: "loading",
              on: {
                RETRY: { target: ".loading", reenter: true },
              },
              states: {
                loading: {
                  entry: assign({ issueError: null }),
                  invoke: {
                    src: "loadIssue",
                    input: ({ context }) => context.selectedId as number,
                    onDone: [
                      {
                        guard: ({ event }) => event.output === null,
                        target: "notFound",
                        actions: assign({ issue: null }),
                      },
                      {
                        target: "loaded",
                        actions: assign({ issue: ({ event }) => event.output }),
                      },
                    ],
                    onError: {
                      target: "failed",
                      actions: assign({ issueError: ({ event }) => messageOf(event.error) }),
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
                    input: ({ context }) => context.selectedId as number,
                    onDone: {
                      target: "loaded",
                      actions: assign({
                        comments: ({ context, event }) => [
                          ...event.output.map((c, i) => ({
                            key: `server${i}`,
                            author: c.author,
                            text: c.text,
                            pending: false,
                          })),
                          ...context.comments.filter((c) => c.pending),
                        ],
                      }),
                    },
                    onError: {
                      target: "failed",
                      actions: assign({ commentsError: ({ event }) => messageOf(event.error) }),
                    },
                  },
                },
                loaded: {},
                failed: {},
              },
            },
            labels: {
              initial: "loading",
              states: {
                loading: {
                  invoke: {
                    src: "loadLabels",
                    input: ({ context }) => context.selectedId as number,
                    onDone: {
                      target: "loaded",
                      actions: assign({ labels: ({ event }) => event.output }),
                    },
                    onError: {
                      target: "failed",
                      actions: assign({ labelsError: ({ event }) => messageOf(event.error) }),
                    },
                  },
                },
                loaded: {},
                failed: {},
              },
            },
            related: {
              initial: "waiting",
              states: {
                waiting: {
                  always: {
                    guard: ({ context }) => context.issue !== null,
                    target: "searching",
                  },
                },
                searching: {
                  invoke: {
                    src: "searchRelated",
                    input: ({ context }) => context.issue?.title ?? "",
                    onDone: {
                      target: "done",
                      actions: assign({ hits: ({ event }) => event.output.slice(0, 3) }),
                    },
                    onError: {
                      target: "failed",
                      actions: assign({ relatedError: ({ event }) => messageOf(event.error) }),
                    },
                  },
                },
                done: {},
                failed: {},
              },
            },
          },
        },
      },
    },
  },
});
