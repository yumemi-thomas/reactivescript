import { assertEvent, assign, enqueueActions, sendParent, setup } from "xstate";
import type { Comment, Hit, Issue, IssueDetail } from "./api";
import {
  errorMessage,
  fetchCommentsLogic,
  fetchIssueLogic,
  fetchIssuesLogic,
  fetchLabelsLogic,
  mutationMachine,
  searchLogic,
  type IssueFilter,
  type Op,
  type OpResult,
  type OpSettledEvent,
} from "./requests";

export type IssuesContext = {
  user: string;
  filter: IssueFilter;
  /** Sequence counter: every request start takes the next number, so answers can be ordered against writes. */
  seq: number;

  /** The list as the server last answered it (plus confirmed writes); pending writes are laid over it for display. */
  issues: Issue[];
  issuesSeq: number;
  listError: string | null;
  /** The last open list loaded, kept for the tab's count. */
  openIssues: Issue[] | null;

  /** Writes still in the air, oldest first. */
  pending: Op[];
  /** Writes the server accepted, so a list that was asked for before they landed can be brought up to date. */
  confirmed: { op: Op; result: OpResult }[];
  rowError: string | null;

  /** Bumped on every selection, so answers and errors for an earlier selection are not shown. */
  selection: number;
  selectedId: number | null;
  detail: IssueDetail | null;
  detailSeq: number;
  detailError: string | null;

  comments: Comment[];
  commentsSeq: number;
  commentsError: string | null;

  labels: string[];
  labelsFetchSeq: number;
  labelsBaseSeq: number;
  labelsError: string | null;

  relatedQuery: string;
  related: Hit[];
  relatedError: string | null;

  titleInput: string;
  commentInput: string;
  labelInput: string;

  assignError: string | null;
  renameError: string | null;
  closeError: string | null;
  postError: string | null;
  labelError: string | null;
};

export type IssuesEvent =
  | { type: "user.change"; value: string }
  | { type: "filter.set"; filter: IssueFilter }
  | { type: "issue.select"; id: number }
  | { type: "detail.retry" }
  | { type: "assign" }
  | { type: "row.assign"; id: number }
  | { type: "title.change"; value: string }
  | { type: "rename" }
  | { type: "close" }
  | { type: "row.close"; id: number }
  | { type: "comment.change"; value: string }
  | { type: "post" }
  | { type: "labelInput.change"; value: string }
  | { type: "label.add" }
  | { type: "label.remove"; label: string }
  | { type: "related.pick"; hitId: number }
  | OpSettledEvent;

/** What the issues page tells the app. */
export type IssuesParentEvent =
  | { type: "issues.count"; count: number }
  | { type: "related.open"; query: string; hits: Hit[]; hitId: number };

// ---- Pure helpers: laying writes over what the server answered ----

function applyIssueOp(list: Issue[], op: Op, result: OpResult | undefined, filter: IssueFilter): Issue[] {
  switch (op.kind) {
    case "assign": {
      const assignee = result?.kind === "assign" ? result.value.assignee : op.user;
      return list.map(i => (i.id === op.id ? { ...i, assignee } : i));
    }
    case "rename": {
      const title = result?.kind === "rename" ? result.value.title : op.title;
      return list.map(i => (i.id === op.id ? { ...i, title } : i));
    }
    case "close":
      return filter === "open" ? list.filter(i => i.id !== op.id) : list;
    default:
      return list;
  }
}

function applyLabelOp(labels: string[], op: Op): string[] {
  if (op.kind === "addLabel") return labels.includes(op.label) ? labels : [...labels, op.label];
  if (op.kind === "removeLabel") return labels.filter(l => l !== op.label);
  return labels;
}

const overlayIssues = (base: Issue[], pending: Op[], filter: IssueFilter) =>
  pending.reduce((list, op) => applyIssueOp(list, op, undefined, filter), base);

export const visibleIssues = (c: IssuesContext) => overlayIssues(c.issues, c.pending, c.filter);

export const openCount = (c: IssuesContext): number | null =>
  c.openIssues ? overlayIssues(c.openIssues, c.pending, "open").length : null;

export function visibleTitle(c: IssuesContext): string | null {
  if (!c.detail) return null;
  const id = c.detail.id;
  return c.pending.reduce<string>(
    (title, op) => (op.kind === "rename" && op.id === id ? op.title : title),
    c.detail.title,
  );
}

export type CommentRow = Comment & { sending: boolean; key: string };

export function visibleComments(c: IssuesContext): CommentRow[] {
  const rows: CommentRow[] = c.comments.map((cm, i) => ({ ...cm, sending: false, key: `c${i}` }));
  for (const op of c.pending) {
    if (op.kind === "post" && op.id === c.selectedId) {
      rows.push({ author: op.author, text: op.text, sending: true, key: `p${op.seq}` });
    }
  }
  return rows;
}

export const visibleLabels = (c: IssuesContext) =>
  c.pending.filter(op => "id" in op && op.id === c.selectedId).reduce(applyLabelOp, c.labels);

/**
 * Confirmed writes are kept only while a read that was asked for before them
 * may still land; once every current read is newer, they can go.
 */
const pruneConfirmed = (c: IssuesContext) => {
  const oldest = c.selectedId === null ? c.issuesSeq : Math.min(c.issuesSeq, c.detailSeq, c.commentsSeq);
  return c.confirmed.filter(e => e.op.seq > oldest);
};

const isClosePending = (c: IssuesContext, id: number) => c.pending.some(op => op.kind === "close" && op.id === id);

/** Starts a write: records it as pending and spawns the actor that sends it. */
function startOp(c: IssuesContext, build: (seq: number) => Op) {
  const op = build(c.seq + 1);
  return { op, patch: { seq: op.seq, pending: [...c.pending, op] } };
}

export const issuesMachine = setup({
  types: {
    context: {} as IssuesContext,
    events: {} as IssuesEvent,
  },
  actors: {
    fetchIssues: fetchIssuesLogic,
    fetchIssue: fetchIssueLogic,
    fetchComments: fetchCommentsLogic,
    fetchLabels: fetchLabelsLogic,
    search: searchLogic,
    mutation: mutationMachine,
  },
  guards: {
    filterChanges: ({ context, event }) => event.type === "filter.set" && event.filter !== context.filter,
    otherIssue: ({ context, event }) => event.type === "issue.select" && event.id !== context.selectedId,
  },
  actions: {
    setFilter: assign({
      filter: ({ context, event }) => (event.type === "filter.set" ? event.filter : context.filter),
    }),
    select: assign(({ context, event }) => {
      assertEvent(event, "issue.select");
      return {
            selection: context.selection + 1,
            selectedId: event.id,
            detail: null,
            detailError: null,
            comments: [],
            commentsError: null,
            labels: [],
            labelsError: null,
            related: [],
            relatedError: null,
            relatedQuery: "",
            titleInput: "",
            commentInput: "",
            labelInput: "",
            assignError: null,
            renameError: null,
            closeError: null,
            postError: null,
            labelError: null,
          };
    }),
    reportCount: enqueueActions(({ context, enqueue }) => {
      const count = openCount(context);
      if (count !== null) enqueue.sendParent({ type: "issues.count", count } satisfies IssuesParentEvent);
    }),
  },
}).createMachine({
  id: "issues",
  type: "parallel",
  context: {
    user: "guest",
    filter: "open",
    seq: 0,
    issues: [],
    issuesSeq: 0,
    listError: null,
    openIssues: null,
    pending: [],
    confirmed: [],
    rowError: null,
    selection: 0,
    selectedId: null,
    detail: null,
    detailSeq: 0,
    detailError: null,
    comments: [],
    commentsSeq: 0,
    commentsError: null,
    labels: [],
    labelsFetchSeq: 0,
    labelsBaseSeq: 0,
    labelsError: null,
    relatedQuery: "",
    related: [],
    relatedError: null,
    titleInput: "",
    commentInput: "",
    labelInput: "",
    assignError: null,
    renameError: null,
    closeError: null,
    postError: null,
    labelError: null,
  },
  on: {
    "user.change": { actions: assign({ user: ({ event }) => event.value }) },
    "title.change": { actions: assign({ titleInput: ({ event }) => event.value }) },
    "comment.change": { actions: assign({ commentInput: ({ event }) => event.value }) },
    "labelInput.change": { actions: assign({ labelInput: ({ event }) => event.value }) },

    // ---- Writes ----
    assign: {
      guard: ({ context }) => context.selectedId !== null && context.user.trim() !== "",
      actions: enqueueActions(({ context, enqueue }) => {
        const { op, patch } = startOp(context, seq => ({
          kind: "assign",
          seq,
          id: context.selectedId!,
          user: context.user,
          source: "detail",
          selection: context.selection,
        }));
        enqueue.assign({ ...patch, assignError: null });
        enqueue.spawnChild("mutation", { id: `op-${op.seq}`, input: { op } });
      }),
    },
    "row.assign": {
      guard: ({ context }) => context.user.trim() !== "",
      actions: enqueueActions(({ context, event, enqueue }) => {
        const { op, patch } = startOp(context, seq => ({
          kind: "assign",
          seq,
          id: event.id,
          user: context.user,
          source: "row",
          selection: context.selection,
        }));
        enqueue.assign({ ...patch, rowError: null });
        enqueue.spawnChild("mutation", { id: `op-${op.seq}`, input: { op } });
      }),
    },
    rename: {
      guard: ({ context }) => context.selectedId !== null && context.titleInput.trim() !== "",
      actions: enqueueActions(({ context, enqueue }) => {
        const { op, patch } = startOp(context, seq => ({
          kind: "rename",
          seq,
          id: context.selectedId!,
          title: context.titleInput.trim(),
          selection: context.selection,
        }));
        enqueue.assign({ ...patch, renameError: null });
        enqueue.spawnChild("mutation", { id: `op-${op.seq}`, input: { op } });
      }),
    },
    close: {
      guard: ({ context }) => context.selectedId !== null && !isClosePending(context, context.selectedId),
      actions: [
        enqueueActions(({ context, enqueue }) => {
          const { op, patch } = startOp(context, seq => ({
            kind: "close",
            seq,
            id: context.selectedId!,
            source: "detail",
            selection: context.selection,
          }));
          enqueue.assign({ ...patch, closeError: null });
          enqueue.spawnChild("mutation", { id: `op-${op.seq}`, input: { op } });
        }),
        "reportCount",
      ],
    },
    "row.close": {
      guard: ({ context, event }) => !isClosePending(context, event.id),
      actions: [
        enqueueActions(({ context, event, enqueue }) => {
          const { op, patch } = startOp(context, seq => ({
            kind: "close",
            seq,
            id: event.id,
            source: "row",
            selection: context.selection,
          }));
          enqueue.assign({ ...patch, rowError: null });
          enqueue.spawnChild("mutation", { id: `op-${op.seq}`, input: { op } });
        }),
        "reportCount",
      ],
    },
    post: {
      guard: ({ context }) => context.selectedId !== null && context.commentInput.trim() !== "",
      actions: enqueueActions(({ context, enqueue }) => {
        const { op, patch } = startOp(context, seq => ({
          kind: "post",
          seq,
          id: context.selectedId!,
          author: context.user,
          text: context.commentInput.trim(),
          selection: context.selection,
        }));
        enqueue.assign({ ...patch, postError: null, commentInput: "" });
        enqueue.spawnChild("mutation", { id: `op-${op.seq}`, input: { op } });
      }),
    },
    "label.add": {
      guard: ({ context }) => {
        const label = context.labelInput.trim();
        return context.selectedId !== null && label !== "" && !visibleLabels(context).includes(label);
      },
      actions: enqueueActions(({ context, enqueue }) => {
        const { op, patch } = startOp(context, seq => ({
          kind: "addLabel",
          seq,
          id: context.selectedId!,
          label: context.labelInput.trim(),
          selection: context.selection,
        }));
        enqueue.assign({ ...patch, labelError: null, labelInput: "" });
        enqueue.spawnChild("mutation", { id: `op-${op.seq}`, input: { op } });
      }),
    },
    "label.remove": {
      guard: ({ context }) => context.selectedId !== null,
      actions: enqueueActions(({ context, event, enqueue }) => {
        const { op, patch } = startOp(context, seq => ({
          kind: "removeLabel",
          seq,
          id: context.selectedId!,
          label: event.label,
          selection: context.selection,
        }));
        enqueue.assign({ ...patch, labelError: null });
        enqueue.spawnChild("mutation", { id: `op-${op.seq}`, input: { op } });
      }),
    },

    // ---- Write answers ----
    "op.done": {
      actions: [
        assign(({ context, event }) => {
          const { op, result } = event;
          const pending = context.pending.filter(p => p.seq !== op.seq);
          const confirmed = [...context.confirmed, { op, result }];
          const patch: Partial<IssuesContext> = { pending, confirmed };
          if (op.kind === "assign" || op.kind === "rename" || op.kind === "close") {
            patch.issues = applyIssueOp(context.issues, op, result, context.filter);
            if (context.openIssues) patch.openIssues = applyIssueOp(context.openIssues, op, result, "open");
          }
          if (op.kind === "rename" && result.kind === "rename" && context.detail?.id === op.id) {
            patch.detail = { ...context.detail, title: result.value.title };
          }
          if (op.kind === "post" && result.kind === "post" && op.id === context.selectedId && op.seq > context.commentsSeq) {
            patch.comments = [...context.comments, result.value];
          }
          if (
            (op.kind === "addLabel" || op.kind === "removeLabel") &&
            result.kind === "labels" &&
            op.id === context.selectedId &&
            op.seq > context.labelsBaseSeq
          ) {
            patch.labels = result.value;
            patch.labelsBaseSeq = op.seq;
          }
          return patch;
        }),
        "reportCount",
      ],
    },
    "op.failed": {
      actions: [
        assign(({ context, event }) => {
          const { op, message } = event;
          const patch: Partial<IssuesContext> = { pending: context.pending.filter(p => p.seq !== op.seq) };
          if (op.kind === "save") return patch;
          const here = op.selection === context.selection && op.id === context.selectedId;
          switch (op.kind) {
            case "assign":
              if (op.source === "row") patch.rowError = message;
              else if (here) patch.assignError = message;
              break;
            case "close":
              if (op.source === "row") patch.rowError = message;
              else if (here) patch.closeError = message;
              break;
            case "rename":
              if (here) patch.renameError = message;
              break;
            case "post":
              if (here) patch.postError = message;
              break;
            case "addLabel":
            case "removeLabel":
              if (here) patch.labelError = message;
              break;
          }
          return patch;
        }),
        "reportCount",
      ],
    },
    "related.pick": {
      actions: sendParent(({ context, event }): IssuesParentEvent => ({
        type: "related.open",
        query: context.relatedQuery,
        hits: context.related,
        hitId: event.hitId,
      })),
    },
  },
  states: {
    list: {
      initial: "loading",
      // Transitions sit on the region's own states: a reload restarts this region only.
      states: {
        loading: {
          on: { "filter.set": { guard: "filterChanges", target: "loading", reenter: true, actions: "setFilter" } },
          entry: assign(({ context }) => ({ seq: context.seq + 1, issuesSeq: context.seq + 1, listError: null })),
          invoke: {
            src: "fetchIssues",
            input: ({ context }) => ({ filter: context.filter }),
            onDone: {
              target: "ready",
              actions: [
                assign(({ context, event }) => {
                  // Writes accepted after this list was asked for are not in it yet.
                  const issues = context.confirmed
                    .filter(c => c.op.seq > context.issuesSeq)
                    .reduce((list, c) => applyIssueOp(list, c.op, c.result, context.filter), event.output);
                  const confirmed = pruneConfirmed(context);
                  return context.filter === "open" ? { issues, openIssues: issues, confirmed } : { issues, confirmed };
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
        ready: {
          on: { "filter.set": { guard: "filterChanges", target: "loading", actions: "setFilter" } },
        },
        failed: {
          // After a failure, the same filter asks again.
          on: { "filter.set": { target: "loading", actions: "setFilter" } },
        },
      },
    },
    detail: {
      initial: "none",
      states: {
        none: {
          on: { "issue.select": { target: "selected", actions: "select" } },
        },
        selected: {
          on: { "issue.select": { guard: "otherIssue", target: "selected", reenter: true, actions: "select" } },
          type: "parallel",
          states: {
            info: {
              initial: "loading",
              states: {
                loading: {
                  on: { "detail.retry": { target: "loading", reenter: true } },
                  entry: assign(({ context }) => ({ seq: context.seq + 1, detailSeq: context.seq + 1, detailError: null })),
                  invoke: {
                    src: "fetchIssue",
                    input: ({ context }) => ({ id: context.selectedId! }),
                    onDone: [
                      { guard: ({ event }) => event.output === null, target: "notFound" },
                      {
                        target: "loaded",
                        actions: assign(({ context, event }) => {
                          const fetched = event.output!;
                          const title = context.confirmed
                            .filter(c => c.op.seq > context.detailSeq && c.op.kind === "rename" && c.op.id === fetched.id)
                            .reduce((t, c) => (c.result.kind === "rename" ? c.result.value.title : t), fetched.title);
                          return { detail: { ...fetched, title } };
                        }),
                      },
                    ],
                    onError: {
                      target: "failed",
                      actions: assign({ detailError: ({ event }) => errorMessage(event.error) }),
                    },
                  },
                },
                loaded: {
                  on: { "detail.retry": "loading" },
                  initial: "searching",
                  states: {
                    searching: {
                      entry: assign(({ context }) => ({
                        relatedQuery: context.detail?.title ?? "",
                        related: [],
                        relatedError: null,
                      })),
                      invoke: {
                        src: "search",
                        input: ({ context }) => ({ q: context.relatedQuery }),
                        onDone: { target: "ready", actions: assign({ related: ({ event }) => event.output }) },
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
                notFound: { on: { "detail.retry": "loading" } },
                failed: { on: { "detail.retry": "loading" } },
              },
            },
            comments: {
              initial: "loading",
              states: {
                loading: {
                  entry: assign(({ context }) => ({ seq: context.seq + 1, commentsSeq: context.seq + 1 })),
                  invoke: {
                    src: "fetchComments",
                    input: ({ context }) => ({ id: context.selectedId! }),
                    onDone: {
                      target: "ready",
                      actions: assign(({ context, event }) => ({
                        comments: [
                          ...event.output,
                          ...context.confirmed.flatMap(c =>
                            c.op.kind === "post" &&
                            c.op.id === context.selectedId &&
                            c.op.seq > context.commentsSeq &&
                            c.result.kind === "post"
                              ? [c.result.value]
                              : [],
                          ),
                        ],
                      })),
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
                  entry: assign(({ context }) => ({ seq: context.seq + 1, labelsFetchSeq: context.seq + 1 })),
                  invoke: {
                    src: "fetchLabels",
                    input: ({ context }) => ({ id: context.selectedId! }),
                    onDone: {
                      target: "ready",
                      actions: assign(({ context, event }) =>
                        // A label change answered after this was asked for knows better.
                        context.labelsFetchSeq > context.labelsBaseSeq
                          ? { labels: event.output, labelsBaseSeq: context.labelsFetchSeq }
                          : {},
                      ),
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
          },
        },
      },
    },
  },
});
