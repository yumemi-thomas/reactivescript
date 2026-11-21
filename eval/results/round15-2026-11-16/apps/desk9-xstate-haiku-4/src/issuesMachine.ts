import { assign, enqueueActions, fromPromise, sendParent, setup } from "xstate";
import * as api from "./api.js";
import type { Comment, Hit, Issue, IssueDetail } from "./api.js";
import { insertAt, messageOf, must, removeAt, without } from "./util";

export type Filter = "open" | "closed";
type Origin = "detail" | "row";

/**
 * A server write in flight. It carries what is needed to settle it either way:
 * the optimistic change is already on screen, and a decline puts the old value back.
 */
export type Pending =
  | { type: "assign"; issueId: number; origin: Origin; user: string; prev: string | null }
  | { type: "renameIssue"; issueId: number; title: string; prevRow: string | null; prevDetail: string | null }
  | { type: "closeIssue"; issueId: number; origin: Origin; removed: { issue: Issue; index: number } | null }
  | { type: "addComment"; issueId: number; key: number; author: string; text: string }
  | { type: "addLabel"; issueId: number; label: string }
  | { type: "removeLabel"; issueId: number; label: string; index: number };

type WriteResult = { assignee?: string; title?: string; labels?: string[] };

export type IssuesContext = {
  user: string;
  filter: Filter;
  /** the rows of the list on screen; null while it loads or after it failed */
  rows: Issue[] | null;
  listError: string | null;
  selectedId: number | null;
  /** counts selections, so the page can drop its unsent drafts when the selection changes */
  selectionSeq: number;
  detailTitle: string | null;
  detailBody: string | null;
  detailError: string | null;
  related: Hit[];
  relatedError: string | null;
  comments: Comment[];
  commentsError: string | null;
  /** comments this session posted, shown after the loaded ones */
  own: { key: number; author: string; text: string; pending: boolean }[];
  labels: string[];
  labelsError: string | null;
  labelError: string | null;
  assignError: string | null;
  renameError: string | null;
  closeError: string | null;
  postError: string | null;
  rowError: string | null;
  writes: Record<string, Pending>;
  seq: number;
};

export type IssuesEvent =
  | { type: "SET_USER"; name: string }
  | { type: "FILTER"; filter: Filter }
  | { type: "SELECT"; id: number }
  | { type: "RETRY_DETAIL" }
  | { type: "ASSIGN" }
  | { type: "RENAME"; title: string }
  | { type: "CLOSE" }
  | { type: "POST"; text: string }
  | { type: "OPEN_RELATED"; hitId: number }
  | { type: "ADD_LABEL"; label: string }
  | { type: "REMOVE_LABEL"; label: string }
  | { type: "ROW_ASSIGN"; id: number }
  | { type: "ROW_CLOSE"; id: number }
  | { type: `xstate.done.actor.${string}`; actorId: string; output: unknown }
  | { type: `xstate.error.actor.${string}`; actorId: string; error: unknown };

type Spawner = (requestId: string, pending: Pending) => void;

/** Records a write in flight and starts it, after the optimistic patch is applied. */
function launch(ctx: IssuesContext, spawner: Spawner, pending: Pending, patch: Partial<IssuesContext>): IssuesContext {
  const requestId = `w${ctx.seq}`;
  spawner(requestId, pending);
  return { ...ctx, ...patch, seq: ctx.seq + 1, writes: { ...ctx.writes, [requestId]: pending } };
}

function mapRow(rows: Issue[] | null, id: number, change: (issue: Issue) => Issue): Issue[] | null {
  return rows ? rows.map((r) => (r.id === id ? change(r) : r)) : null;
}

function requireId(ctx: IssuesContext): number {
  return must(ctx.selectedId, "no issue is selected");
}

function selectPatch(ctx: IssuesContext, id: number): Partial<IssuesContext> {
  return {
    selectedId: id,
    selectionSeq: ctx.selectionSeq + 1,
    detailTitle: null,
    detailBody: null,
    detailError: null,
    related: [],
    relatedError: null,
    comments: [],
    commentsError: null,
    own: [],
    labels: [],
    labelsError: null,
    labelError: null,
    assignError: null,
    renameError: null,
    closeError: null,
    postError: null,
  };
}

function startAssign(ctx: IssuesContext, spawner: Spawner, issueId: number | null, origin: Origin): IssuesContext {
  if (issueId === null || ctx.user.trim() === "") return ctx;
  const row = ctx.rows?.find((r) => r.id === issueId);
  const user = ctx.user;
  const pending: Pending = { type: "assign", issueId, origin, user, prev: row ? row.assignee : null };
  const patch: Partial<IssuesContext> = {
    rows: mapRow(ctx.rows, issueId, (r) => ({ ...r, assignee: user })),
    ...(origin === "row" ? { rowError: null } : { assignError: null }),
  };
  return launch(ctx, spawner, pending, patch);
}

function startRename(ctx: IssuesContext, spawner: Spawner, rawTitle: string): IssuesContext {
  const title = rawTitle.trim();
  if (ctx.selectedId === null || title === "") return ctx;
  const issueId = ctx.selectedId;
  const row = ctx.rows?.find((r) => r.id === issueId);
  const pending: Pending = {
    type: "renameIssue",
    issueId,
    title,
    prevRow: row ? row.title : null,
    prevDetail: ctx.detailTitle,
  };
  const patch: Partial<IssuesContext> = {
    rows: mapRow(ctx.rows, issueId, (r) => ({ ...r, title })),
    detailTitle: title,
    renameError: null,
  };
  return launch(ctx, spawner, pending, patch);
}

/** Takes the issue off the open list, if it is on it. */
function startClose(ctx: IssuesContext, spawner: Spawner, issueId: number | null, origin: Origin): IssuesContext {
  if (issueId === null) return ctx;
  const index = ctx.filter === "open" && ctx.rows ? ctx.rows.findIndex((r) => r.id === issueId) : -1;
  const removed = index >= 0 && ctx.rows ? { issue: ctx.rows[index], index } : null;
  const pending: Pending = { type: "closeIssue", issueId, origin, removed };
  const patch: Partial<IssuesContext> = {
    rows: removed && ctx.rows ? ctx.rows.filter((r) => r.id !== issueId) : ctx.rows,
    ...(origin === "row" ? { rowError: null } : { closeError: null }),
  };
  return launch(ctx, spawner, pending, patch);
}

function startPost(ctx: IssuesContext, spawner: Spawner, rawText: string): IssuesContext {
  const text = rawText.trim();
  if (ctx.selectedId === null || text === "") return ctx;
  const key = ctx.seq;
  const author = ctx.user;
  const pending: Pending = { type: "addComment", issueId: ctx.selectedId, key, author, text };
  const patch: Partial<IssuesContext> = {
    postError: null,
    own: [...ctx.own, { key, author, text, pending: true }],
  };
  return launch(ctx, spawner, pending, patch);
}

function startAddLabel(ctx: IssuesContext, spawner: Spawner, rawLabel: string): IssuesContext {
  const label = rawLabel.trim();
  if (ctx.selectedId === null || label === "" || ctx.labels.includes(label)) return ctx;
  const pending: Pending = { type: "addLabel", issueId: ctx.selectedId, label };
  return launch(ctx, spawner, pending, { labels: [...ctx.labels, label], labelError: null });
}

function startRemoveLabel(ctx: IssuesContext, spawner: Spawner, label: string): IssuesContext {
  const index = ctx.labels.indexOf(label);
  if (ctx.selectedId === null || index < 0) return ctx;
  const pending: Pending = { type: "removeLabel", issueId: ctx.selectedId, label, index };
  return launch(ctx, spawner, pending, { labels: removeAt(ctx.labels, index), labelError: null });
}

/** A write the server accepted: keep what it answered. */
function succeed(ctx: IssuesContext, p: Pending, res: WriteResult): Partial<IssuesContext> {
  const selected = ctx.selectedId === p.issueId;
  switch (p.type) {
    case "assign":
      return { rows: mapRow(ctx.rows, p.issueId, (r) => ({ ...r, assignee: res.assignee ?? p.user })) };
    case "renameIssue": {
      const title = res.title ?? p.title;
      return {
        rows: mapRow(ctx.rows, p.issueId, (r) => ({ ...r, title })),
        detailTitle: selected ? title : ctx.detailTitle,
      };
    }
    case "closeIssue":
      return {};
    case "addComment":
      return { own: ctx.own.map((c) => (c.key === p.key ? { ...c, pending: false } : c)) };
    case "addLabel":
    case "removeLabel":
      return selected ? { labels: res.labels ?? ctx.labels } : {};
  }
}

/** A write the server declined: put back what it changed, and show the message where it belongs. */
function fail(ctx: IssuesContext, p: Pending, message: string): Partial<IssuesContext> {
  const selected = ctx.selectedId === p.issueId;
  switch (p.type) {
    case "assign":
      return {
        rows: mapRow(ctx.rows, p.issueId, (r) => ({ ...r, assignee: p.prev })),
        ...(p.origin === "row"
          ? { rowError: message }
          : { assignError: selected ? message : ctx.assignError }),
      };
    case "renameIssue":
      return {
        rows: mapRow(ctx.rows, p.issueId, (r) => ({ ...r, title: p.prevRow ?? r.title })),
        detailTitle: selected ? p.prevDetail : ctx.detailTitle,
        renameError: selected ? message : ctx.renameError,
      };
    case "closeIssue": {
      let rows = ctx.rows;
      if (p.removed && rows && ctx.filter === "open" && !rows.some((r) => r.id === p.issueId)) {
        rows = insertAt(rows, p.removed.index, p.removed.issue);
      }
      return {
        rows,
        ...(p.origin === "row"
          ? { rowError: message }
          : { closeError: selected ? message : ctx.closeError }),
      };
    }
    case "addComment":
      return {
        own: ctx.own.filter((c) => c.key !== p.key),
        postError: selected ? message : ctx.postError,
      };
    case "addLabel": {
      if (!selected) return {};
      const index = ctx.labels.indexOf(p.label);
      return { labels: index < 0 ? ctx.labels : removeAt(ctx.labels, index), labelError: message };
    }
    case "removeLabel":
      if (!selected) return {};
      return {
        labels: ctx.labels.includes(p.label) ? ctx.labels : insertAt(ctx.labels, p.index, p.label),
        labelError: message,
      };
  }
}

function settle(ctx: IssuesContext, requestId: string, change: (p: Pending) => Partial<IssuesContext>): Partial<IssuesContext> {
  const p = ctx.writes[requestId];
  return { ...change(p), writes: without(ctx.writes, requestId) };
}

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
    search: fromPromise<Hit[], string>(({ input }) => api.search(input)),
    write: fromPromise<WriteResult, Pending>(async ({ input }) => {
      switch (input.type) {
        case "assign":
          return { assignee: (await api.assign(input.issueId, input.user)).assignee };
        case "renameIssue":
          return { title: (await api.renameIssue(input.issueId, input.title)).title };
        case "closeIssue":
          await api.closeIssue(input.issueId);
          return {};
        case "addComment":
          await api.addComment(input.issueId, input.author, input.text);
          return {};
        case "addLabel":
          return { labels: await api.addLabel(input.issueId, input.label) };
        case "removeLabel":
          return { labels: await api.removeLabel(input.issueId, input.label) };
      }
    }),
  },
  actions: {
    /** Tells the desk how many open issues the list shows, when it shows them. */
    reportOpen: enqueueActions(({ context, enqueue }) => {
      if (context.filter === "open" && context.rows !== null) {
        enqueue.sendParent({ type: "OPEN_COUNT", count: context.rows.length });
      }
    }),
  },
}).createMachine({
  id: "issues",
  type: "parallel",
  context: {
    user: "guest",
    filter: "open",
    rows: null,
    listError: null,
    selectedId: null,
    selectionSeq: 0,
    detailTitle: null,
    detailBody: null,
    detailError: null,
    related: [],
    relatedError: null,
    comments: [],
    commentsError: null,
    own: [],
    labels: [],
    labelsError: null,
    labelError: null,
    assignError: null,
    renameError: null,
    closeError: null,
    postError: null,
    rowError: null,
    writes: {},
    seq: 1,
  },
  on: {
    SET_USER: {
      actions: assign({ user: ({ event }) => event.name }),
    },
    ROW_ASSIGN: {
      actions: assign(({ context, event, spawn }) =>
        startAssign(context, (rid, p) => spawn("write", { id: rid, input: p }), event.id, "row"),
      ),
    },
    ROW_CLOSE: {
      actions: [
        assign(({ context, event, spawn }) =>
          startClose(context, (rid, p) => spawn("write", { id: rid, input: p }), event.id, "row"),
        ),
        "reportOpen",
      ],
    },
    "xstate.done.actor.*": {
      guard: ({ context, event }) => "actorId" in event && event.actorId in context.writes,
      actions: [
        assign(({ context, event }) => {
          const output = "output" in event ? event.output : undefined;
          return settle(context, event.actorId, (p) => succeed(context, p, output as WriteResult));
        }),
        "reportOpen",
      ],
    },
    "xstate.error.actor.*": {
      guard: ({ context, event }) => "actorId" in event && event.actorId in context.writes,
      actions: [
        assign(({ context, event }) =>
          settle(context, event.actorId, (p) => fail(context, p, messageOf("error" in event ? event.error : undefined))),
        ),
        "reportOpen",
      ],
    },
  },
  states: {
    list: {
      initial: "loading",
      on: {
        FILTER: {
          target: ".reloading",
          actions: assign({ filter: ({ event }) => event.filter, rows: null, listError: null }),
        },
      },
      states: {
        reloading: {
          always: { target: "loading" },
        },
        loading: {
          invoke: {
            src: "fetchIssues",
            input: ({ context }) => context.filter,
            onDone: {
              target: "ready",
              actions: [assign({ rows: ({ event }) => event.output, listError: null }), "reportOpen"],
            },
            onError: {
              target: "failed",
              actions: assign({ listError: ({ event }) => messageOf(event.error) }),
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
        SELECT: {
          target: ".reselecting",
          actions: assign(({ context, event }) => selectPatch(context, event.id)),
        },
      },
      states: {
        none: {},
        reselecting: {
          always: { target: "selected" },
        },
        selected: {
          type: "parallel",
          on: {
            ASSIGN: {
              actions: assign(({ context, spawn }) =>
                startAssign(context, (rid, p) => spawn("write", { id: rid, input: p }), context.selectedId, "detail"),
              ),
            },
            RENAME: {
              actions: assign(({ context, event, spawn }) =>
                startRename(context, (rid, p) => spawn("write", { id: rid, input: p }), event.title),
              ),
            },
            CLOSE: {
              actions: [
                assign(({ context, spawn }) =>
                  startClose(context, (rid, p) => spawn("write", { id: rid, input: p }), context.selectedId, "detail"),
                ),
                "reportOpen",
              ],
            },
            POST: {
              actions: assign(({ context, event, spawn }) =>
                startPost(context, (rid, p) => spawn("write", { id: rid, input: p }), event.text),
              ),
            },
            OPEN_RELATED: {
              guard: ({ context }) => context.detailTitle !== null,
              actions: sendParent(({ context, event }) => ({
                type: "OPEN_HELP",
                query: must(context.detailTitle, "no issue title"),
                hitId: event.hitId,
              })),
            },
          },
          states: {
            detail: {
              initial: "loading",
              on: {
                RETRY_DETAIL: {
                  target: ".retrying",
                  actions: assign({ detailError: null }),
                },
              },
              states: {
                retrying: {
                  always: { target: "loading" },
                },
                loading: {
                  invoke: {
                    src: "fetchIssue",
                    input: ({ context }) => requireId(context),
                    onDone: [
                      {
                        guard: ({ event }) => event.output !== null,
                        target: "shown",
                        actions: assign(({ event }) => ({
                          detailTitle: event.output ? event.output.title : null,
                          detailBody: event.output ? event.output.body : null,
                          detailError: null,
                        })),
                      },
                      { target: "notFound" },
                    ],
                    onError: {
                      target: "failed",
                      actions: assign({ detailError: ({ event }) => messageOf(event.error) }),
                    },
                  },
                },
                shown: {
                  initial: "searching",
                  states: {
                    searching: {
                      entry: assign({ related: [], relatedError: null }),
                      invoke: {
                        src: "search",
                        input: ({ context }) => must(context.detailTitle, "no issue title"),
                        onDone: {
                          target: "hits",
                          actions: assign({ related: ({ event }) => event.output }),
                        },
                        onError: {
                          target: "failed",
                          actions: assign({ relatedError: ({ event }) => messageOf(event.error) }),
                        },
                      },
                    },
                    hits: {},
                    failed: {},
                  },
                },
                notFound: {},
                failed: {},
              },
            },
            comments: {
              initial: "loading",
              states: {
                loading: {
                  invoke: {
                    src: "fetchComments",
                    input: ({ context }) => requireId(context),
                    onDone: {
                      target: "ready",
                      actions: assign({ comments: ({ event }) => event.output, commentsError: null }),
                    },
                    onError: {
                      target: "failed",
                      actions: assign({ commentsError: ({ event }) => messageOf(event.error) }),
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
                    input: ({ context }) => requireId(context),
                    onDone: {
                      target: "ready",
                      actions: assign({ labels: ({ event }) => event.output, labelsError: null }),
                    },
                    onError: {
                      target: "failed",
                      actions: assign({ labelsError: ({ event }) => messageOf(event.error) }),
                    },
                  },
                },
                ready: {
                  on: {
                    ADD_LABEL: {
                      actions: assign(({ context, event, spawn }) =>
                        startAddLabel(context, (rid, p) => spawn("write", { id: rid, input: p }), event.label),
                      ),
                    },
                    REMOVE_LABEL: {
                      actions: assign(({ context, event, spawn }) =>
                        startRemoveLabel(context, (rid, p) => spawn("write", { id: rid, input: p }), event.label),
                      ),
                    },
                  },
                },
                failed: {},
              },
            },
          },
        },
      },
    },
  },
});
