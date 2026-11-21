import { assign, fromPromise, sendParent, setup } from "xstate";
import * as api from "../api.js";
import type { Comment, Hit, Issue, IssueDetail } from "../api.js";
import { errMessage, without } from "./shared.js";

export type Filter = "open" | "closed";
type Scope = "detail" | "row";
export type ErrKey =
  | "list" | "detail" | "comments" | "labels" | "related"
  | "assign" | "rename" | "close" | "post" | "label" | "row";

/** "no": shown. "closing": a close is in the air. "closed": the server accepted a close. */
export type Hidden = "no" | "closing" | "closed";
export type Row = Issue & { hidden: Hidden };
/** a comment; `tempId` is set while it is still being sent */
export type CommentRow = Comment & { tempId?: string };

/** a server request started by a mutation, kept until it settles */
type Op =
  | { kind: "assign"; issueId: number; prev: string | null; scope: Scope }
  | { kind: "rename"; issueId: number; prevRow: string; prevDetail: string | null }
  | { kind: "close"; issueId: number; scope: Scope }
  | { kind: "post"; issueId: number; tempId: string }
  | { kind: "addLabel"; issueId: number; label: string }
  | { kind: "removeLabel"; issueId: number; label: string; index: number };

export type IssuesContext = {
  user: string;
  filter: Filter;
  listLoaded: boolean;
  rows: Row[];
  selectedId: number | null;
  titleDraft: string;
  commentDraft: string;
  labelDraft: string;
  detail: IssueDetail | null;
  comments: CommentRow[];
  labels: string[];
  hits: Hit[];
  errors: Partial<Record<ErrKey, string>>;
  ops: Record<string, Op>;
};

export type IssuesEvent =
  | { type: "user.set"; value: string }
  | { type: "filter.set"; filter: Filter }
  | { type: "select"; id: number }
  | { type: "title.set"; value: string }
  | { type: "comment.set"; value: string }
  | { type: "label.set"; value: string }
  | { type: "detail.retry" }
  | { type: "detail.assign" }
  | { type: "detail.rename" }
  | { type: "detail.close" }
  | { type: "detail.post" }
  | { type: "detail.addLabel" }
  | { type: "detail.removeLabel"; label: string }
  | { type: "row.assign"; id: number }
  | { type: "row.close"; id: number }
  | { type: "related.open"; hit: Hit };

/** what the parent (the app) hears from the issues page */
export type IssuesOutput = { type: "openCount"; count: number | null } | { type: "openHelp"; query: string; id: number };

type DoneLike = { type: string; actorId: string; output?: unknown; error?: unknown };

/** The open-issue count, while the open list is on screen and loaded; null otherwise. */
export function openCountOf(c: IssuesContext): number | null {
  return c.filter === "open" && c.listLoaded ? c.rows.filter((r) => r.hidden === "no").length : null;
}

const mapRow = (rows: Row[], id: number, f: (r: Row) => Row): Row[] =>
  rows.map((r) => (r.id === id ? f(r) : r));

const clearErr = (errors: IssuesContext["errors"], ...keys: ErrKey[]): IssuesContext["errors"] => {
  let out = errors;
  for (const k of keys) out = without(out, k);
  return out;
};

const hasSel = ({ context }: { context: IssuesContext }) => context.selectedId !== null;

/** Applies the outcome of a mutation request (spawned actor) to the page. */
function settle(c: IssuesContext, ev: DoneLike): Partial<IssuesContext> {
  const op = c.ops[ev.actorId];
  if (!op) return {};
  const ops = without(c.ops, ev.actorId);
  const failed = ev.type.startsWith("xstate.error");
  const msg = failed ? errMessage(ev.error) : "";
  const sel = c.selectedId === op.issueId;

  switch (op.kind) {
    case "assign": {
      if (!failed) {
        const out = ev.output as { assignee: string };
        return { ops, rows: mapRow(c.rows, op.issueId, (r) => ({ ...r, assignee: out.assignee })) };
      }
      const errors: IssuesContext["errors"] =
        op.scope === "row"
          ? { ...c.errors, row: `row error: ${msg}` }
          : sel ? { ...c.errors, assign: `assign error: ${msg}` } : c.errors;
      return { ops, rows: mapRow(c.rows, op.issueId, (r) => ({ ...r, assignee: op.prev })), errors };
    }
    case "rename": {
      if (!failed) {
        const out = ev.output as { title: string };
        return {
          ops,
          rows: mapRow(c.rows, op.issueId, (r) => ({ ...r, title: out.title })),
          detail: sel && c.detail ? { ...c.detail, title: out.title } : c.detail,
        };
      }
      return {
        ops,
        rows: mapRow(c.rows, op.issueId, (r) => ({ ...r, title: op.prevRow })),
        detail: sel && c.detail ? { ...c.detail, title: op.prevDetail ?? c.detail.title } : c.detail,
        errors: sel ? { ...c.errors, rename: `rename error: ${msg}` } : c.errors,
      };
    }
    case "close": {
      if (!failed) return { ops, rows: mapRow(c.rows, op.issueId, (r) => ({ ...r, hidden: "closed" })) };
      const errors: IssuesContext["errors"] =
        op.scope === "row"
          ? { ...c.errors, row: `row error: ${msg}` }
          : sel ? { ...c.errors, close: `close error: ${msg}` } : c.errors;
      return {
        ops,
        rows: mapRow(c.rows, op.issueId, (r) => (r.hidden === "closing" ? { ...r, hidden: "no" } : r)),
        errors,
      };
    }
    case "post": {
      if (!sel) return { ops };
      if (!failed) {
        return {
          ops,
          comments: c.comments.map((r) => (r.tempId === op.tempId ? { author: r.author, text: r.text } : r)),
        };
      }
      return {
        ops,
        comments: c.comments.filter((r) => r.tempId !== op.tempId),
        errors: { ...c.errors, post: `post error: ${msg}` },
      };
    }
    case "addLabel": {
      if (!sel) return { ops };
      if (!failed) return { ops, labels: ev.output as string[] };
      return {
        ops,
        labels: c.labels.filter((l) => l !== op.label),
        errors: { ...c.errors, label: `label error: ${msg}` },
      };
    }
    case "removeLabel": {
      if (!sel) return { ops };
      if (!failed) return { ops, labels: ev.output as string[] };
      const labels = c.labels.includes(op.label)
        ? c.labels
        : [...c.labels.slice(0, op.index), op.label, ...c.labels.slice(op.index)];
      return { ops, labels, errors: { ...c.errors, label: `label error: ${msg}` } };
    }
  }
}

export const issuesMachine = setup({
  types: {
    context: {} as IssuesContext,
    events: {} as IssuesEvent,
    output: {} as IssuesOutput,
  },
  actors: {
    fetchIssues: fromPromise<Issue[], { filter: Filter }>(async ({ input }) => api.fetchIssues(input.filter)),
    fetchIssue: fromPromise<IssueDetail | null, { id: number }>(async ({ input }) => api.fetchIssue(input.id)),
    fetchComments: fromPromise<Comment[], { id: number }>(async ({ input }) => api.fetchComments(input.id)),
    fetchLabels: fromPromise<string[], { id: number }>(async ({ input }) => api.fetchLabels(input.id)),
    search: fromPromise<Hit[], { q: string }>(async ({ input }) => api.search(input.q)),
    assignIssue: fromPromise<{ id: number; assignee: string }, { id: number; user: string }>(
      async ({ input }) => api.assign(input.id, input.user),
    ),
    renameIssue: fromPromise<{ id: number; title: string }, { id: number; title: string }>(
      async ({ input }) => api.renameIssue(input.id, input.title),
    ),
    closeIssue: fromPromise<{ id: number }, { id: number }>(async ({ input }) => api.closeIssue(input.id)),
    addComment: fromPromise<Comment, { id: number; author: string; text: string }>(
      async ({ input }) => api.addComment(input.id, input.author, input.text),
    ),
    addLabel: fromPromise<string[], { id: number; label: string }>(
      async ({ input }) => api.addLabel(input.id, input.label),
    ),
    removeLabel: fromPromise<string[], { id: number; label: string }>(
      async ({ input }) => api.removeLabel(input.id, input.label),
    ),
  },
  actions: {
    publishCount: sendParent(({ context }: { context: IssuesContext }): IssuesOutput => ({
      type: "openCount",
      count: openCountOf(context),
    })),
  },
}).createMachine({
  id: "issues",
  type: "parallel",
  context: {
    user: "guest",
    filter: "open",
    listLoaded: false,
    rows: [],
    selectedId: null,
    titleDraft: "",
    commentDraft: "",
    labelDraft: "",
    detail: null,
    comments: [],
    labels: [],
    hits: [],
    errors: {},
    ops: {},
  },
  on: {
    "user.set": { actions: assign({ user: ({ event }) => event.value }) },
    "title.set": { actions: assign({ titleDraft: ({ event }) => event.value }) },
    "comment.set": { actions: assign({ commentDraft: ({ event }) => event.value }) },
    "label.set": { actions: assign({ labelDraft: ({ event }) => event.value }) },

    // row actions: no selection needed, the row carries its issue
    "row.assign": {
      actions: assign(({ context, event, spawn }) => {
        const row = context.rows.find((r) => r.id === event.id);
        const ref = spawn("assignIssue", { input: { id: event.id, user: context.user } });
        return {
          rows: mapRow(context.rows, event.id, (r) => ({ ...r, assignee: context.user })),
          errors: clearErr(context.errors, "row"),
          ops: { ...context.ops, [ref.id]: { kind: "assign", issueId: event.id, prev: row ? row.assignee : null, scope: "row" } },
        };
      }),
    },
    "row.close": {
      actions: [
        assign(({ context, event, spawn }) => {
          const ref = spawn("closeIssue", { input: { id: event.id } });
          return {
            rows: mapRow(context.rows, event.id, (r) => ({ ...r, hidden: "closing" })),
            errors: clearErr(context.errors, "row"),
            ops: { ...context.ops, [ref.id]: { kind: "close", issueId: event.id, scope: "row" } },
          };
        }),
        "publishCount",
      ],
    },

    // the help page opens with the issue's title as its query and the hit selected
    "related.open": {
      actions: sendParent(({ context, event }): IssuesOutput => ({
        type: "openHelp",
        query: context.detail?.title ?? "",
        id: (event as { hit: Hit }).hit.id,
      })),
    },

    // answers of spawned mutation requests
    "xstate.done.actor.*": {
      actions: [assign(({ context, event }) => settle(context as IssuesContext, event as unknown as DoneLike)), "publishCount"],
    },
    "xstate.error.actor.*": {
      actions: [assign(({ context, event }) => settle(context as IssuesContext, event as unknown as DoneLike)), "publishCount"],
    },
  },
  states: {
    list: {
      initial: "start",
      // a filter change goes through `start` so the request restarts without touching the selection
      on: {
        "filter.set": {
          guard: ({ context, event }) => context.filter !== event.filter,
          target: ".start",
          actions: assign({
            filter: ({ event }) => event.filter,
            listLoaded: false,
            rows: [],
            errors: ({ context }) => clearErr(context.errors, "list"),
          }),
        },
      },
      states: {
        start: { always: { target: "loading" } },
        loading: {
          invoke: {
            src: "fetchIssues",
            input: ({ context }) => ({ filter: context.filter }),
            onDone: {
              target: "loaded",
              actions: [
                assign({
                  rows: ({ event }) => event.output.map((i): Row => ({ ...i, hidden: "no" })),
                  listLoaded: true,
                }),
                "publishCount",
              ],
            },
            onError: {
              target: "failed",
              actions: assign({ errors: ({ context, event }) => ({ ...context.errors, list: errMessage(event.error) }) }),
            },
          },
        },
        loaded: {},
        failed: {},
      },
    },

    selection: {
      initial: "none",
      on: {
        select: {
          target: ".none",
          actions: assign(({ context, event }) => ({
            selectedId: event.id,
            titleDraft: "",
            detail: null,
            comments: [],
            labels: [],
            hits: [],
            errors: { list: context.errors.list, row: context.errors.row },
          })),
        },
      },
      states: {
        none: {
          always: { guard: ({ context }) => context.selectedId !== null, target: "selected" },
        },
        selected: {
          type: "parallel",
          states: {
            detail: {
              initial: "start",
              on: { "detail.retry": { target: ".start" } },
              states: {
                start: { always: { target: "loading" } },
                loading: {
                  entry: assign({
                    detail: null,
                    errors: ({ context }) => clearErr(context.errors, "detail"),
                  }),
                  invoke: {
                    src: "fetchIssue",
                    input: ({ context }) => ({ id: context.selectedId as number }),
                    onDone: [
                      {
                        guard: ({ event }) => event.output !== null,
                        target: "loaded",
                        actions: assign({ detail: ({ event }) => event.output }),
                      },
                      { target: "notFound" },
                    ],
                    onError: {
                      target: "failed",
                      actions: assign({ errors: ({ context, event }) => ({ ...context.errors, detail: errMessage(event.error) }) }),
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
                  entry: assign({
                    comments: [],
                    errors: ({ context }) => clearErr(context.errors, "comments"),
                  }),
                  invoke: {
                    src: "fetchComments",
                    input: ({ context }) => ({ id: context.selectedId as number }),
                    onDone: {
                      target: "loaded",
                      actions: assign({
                        comments: ({ context, event }) => [
                          ...event.output.map((c): CommentRow => ({ author: c.author, text: c.text })),
                          ...context.comments.filter((r) => r.tempId !== undefined),
                        ],
                      }),
                    },
                    onError: {
                      target: "failed",
                      actions: assign({ errors: ({ context, event }) => ({ ...context.errors, comments: errMessage(event.error) }) }),
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
                  entry: assign({
                    labels: [],
                    errors: ({ context }) => clearErr(context.errors, "labels"),
                  }),
                  invoke: {
                    src: "fetchLabels",
                    input: ({ context }) => ({ id: context.selectedId as number }),
                    onDone: { target: "loaded", actions: assign({ labels: ({ event }) => event.output }) },
                    onError: {
                      target: "failed",
                      actions: assign({ errors: ({ context, event }) => ({ ...context.errors, labels: errMessage(event.error) }) }),
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
                  always: { guard: ({ context }) => context.detail !== null, target: "searching" },
                },
                searching: {
                  entry: assign({ errors: ({ context }) => clearErr(context.errors, "related") }),
                  invoke: {
                    src: "search",
                    input: ({ context }) => ({ q: context.detail?.title ?? "" }),
                    onDone: { target: "found", actions: assign({ hits: ({ event }) => event.output }) },
                    onError: {
                      target: "failed",
                      actions: assign({ errors: ({ context, event }) => ({ ...context.errors, related: errMessage(event.error) }) }),
                    },
                  },
                },
                found: {},
                failed: {},
              },
            },

            // mutations made from the detail; each is a spawned request that settles in `settle`
            mutations: {
              initial: "ready",
              states: { ready: {} },
              on: {
                "detail.assign": {
                  guard: hasSel,
                  actions: assign(({ context, spawn }) => {
                    const id = context.selectedId as number;
                    const row = context.rows.find((r) => r.id === id);
                    const ref = spawn("assignIssue", { input: { id, user: context.user } });
                    return {
                      rows: mapRow(context.rows, id, (r) => ({ ...r, assignee: context.user })),
                      errors: clearErr(context.errors, "assign"),
                      ops: { ...context.ops, [ref.id]: { kind: "assign", issueId: id, prev: row ? row.assignee : null, scope: "detail" } },
                    };
                  }),
                },
                "detail.rename": {
                  guard: ({ context }) => context.selectedId !== null && context.titleDraft.trim() !== "",
                  actions: assign(({ context, spawn }) => {
                    const id = context.selectedId as number;
                    const title = context.titleDraft.trim();
                    const row = context.rows.find((r) => r.id === id);
                    const ref = spawn("renameIssue", { input: { id, title } });
                    return {
                      rows: mapRow(context.rows, id, (r) => ({ ...r, title })),
                      detail: context.detail ? { ...context.detail, title } : null,
                      errors: clearErr(context.errors, "rename"),
                      ops: {
                        ...context.ops,
                        [ref.id]: {
                          kind: "rename",
                          issueId: id,
                          prevRow: row ? row.title : title,
                          prevDetail: context.detail ? context.detail.title : null,
                        },
                      },
                    };
                  }),
                },
                "detail.close": {
                  guard: hasSel,
                  actions: [
                    assign(({ context, spawn }) => {
                      const id = context.selectedId as number;
                      const ref = spawn("closeIssue", { input: { id } });
                      return {
                        rows: mapRow(context.rows, id, (r) => ({ ...r, hidden: "closing" })),
                        errors: clearErr(context.errors, "close"),
                        ops: { ...context.ops, [ref.id]: { kind: "close", issueId: id, scope: "detail" } },
                      };
                    }),
                    "publishCount",
                  ],
                },
                "detail.post": {
                  guard: ({ context }) => context.selectedId !== null && context.commentDraft.trim() !== "",
                  actions: assign(({ context, spawn }) => {
                    const id = context.selectedId as number;
                    const text = context.commentDraft.trim();
                    const ref = spawn("addComment", { input: { id, author: context.user, text } });
                    return {
                      comments: [...context.comments, { author: context.user, text, tempId: ref.id }],
                      commentDraft: "",
                      errors: clearErr(context.errors, "post"),
                      ops: { ...context.ops, [ref.id]: { kind: "post", issueId: id, tempId: ref.id } },
                    };
                  }),
                },
                "detail.addLabel": {
                  guard: ({ context }) =>
                    context.selectedId !== null &&
                    context.labelDraft.trim() !== "" &&
                    !context.labels.includes(context.labelDraft.trim()),
                  actions: assign(({ context, spawn }) => {
                    const id = context.selectedId as number;
                    const label = context.labelDraft.trim();
                    const ref = spawn("addLabel", { input: { id, label } });
                    return {
                      labels: [...context.labels, label],
                      labelDraft: "",
                      errors: clearErr(context.errors, "label"),
                      ops: { ...context.ops, [ref.id]: { kind: "addLabel", issueId: id, label } },
                    };
                  }),
                },
                "detail.removeLabel": {
                  guard: ({ context }) => context.selectedId !== null,
                  actions: assign(({ context, event, spawn }) => {
                    const id = context.selectedId as number;
                    const index = context.labels.indexOf(event.label);
                    if (index < 0) return {};
                    const ref = spawn("removeLabel", { input: { id, label: event.label } });
                    return {
                      labels: context.labels.filter((_, i) => i !== index),
                      errors: clearErr(context.errors, "label"),
                      ops: { ...context.ops, [ref.id]: { kind: "removeLabel", issueId: id, label: event.label, index } },
                    };
                  }),
                },
              },
            },
          },
        },
      },
    },
  },
});
