import { assign, enqueueActions, fromPromise, setup } from "xstate";
import * as api from "./api.js";
import type { Comment, Hit, IssueDetail } from "./api.js";
import { errorMessage, requestMachine, type RequestEvent } from "./request";

export type PendingPost = { seq: number; author: string; text: string };
export type LabelOp = { seq: number; kind: "add" | "remove"; label: string };

export type DetailContext = {
  id: number;
  issue: IssueDetail | null;
  issueError: string | null;
  comments: Comment[];
  commentsError: string | null;
  pendingPosts: PendingPost[];
  commentDraft: string;
  postError: string | null;
  labels: string[];
  labelsSeq: number;
  labelOps: LabelOp[];
  labelDraft: string;
  labelError: string | null;
  labelsError: string | null;
  relatedQuery: string;
  related: Hit[];
  relatedError: string | null;
  nextSeq: number;
};

export type DetailEvent =
  | { type: "retry" }
  | { type: "comment.change"; value: string }
  | { type: "comment.post"; author: string }
  | { type: "label.change"; value: string }
  | { type: "label.add" }
  | { type: "label.remove"; label: string }
  | { type: "title.confirmed"; title: string }
  | RequestEvent;

/** The labels as the user should see them: the server's last answer with the changes still in flight applied. */
export function shownLabels(labels: string[], ops: LabelOp[]): string[] {
  let shown = labels;
  for (const op of ops) {
    if (op.kind === "add") {
      if (!shown.includes(op.label)) shown = [...shown, op.label];
    } else {
      shown = shown.filter(l => l !== op.label);
    }
  }
  return shown;
}

/** One selected issue: its detail, comments, labels and related help. Discarded when another issue is selected. */
export const detailMachine = setup({
  types: {
    input: {} as { id: number },
    context: {} as DetailContext,
    events: {} as DetailEvent,
  },
  actors: {
    fetchIssue: fromPromise<IssueDetail | null, number>(({ input }) => api.fetchIssue(input)),
    fetchComments: fromPromise<Comment[], number>(({ input }) => api.fetchComments(input)),
    fetchLabels: fromPromise<string[], number>(({ input }) => api.fetchLabels(input)),
    searchRelated: fromPromise<Hit[], string>(({ input }) => api.search(input)),
    request: requestMachine,
  },
  guards: {
    canPost: ({ context }) => context.commentDraft.trim() !== "",
    canAddLabel: ({ context }) => {
      const label = context.labelDraft.trim();
      return label !== "" && !shownLabels(context.labels, context.labelOps).includes(label);
    },
    hasLabel: ({ context, event }) =>
      event.type === "label.remove" && shownLabels(context.labels, context.labelOps).includes(event.label),
  },
}).createMachine({
  id: "detail",
  type: "parallel",
  context: ({ input }) => ({
    id: input.id,
    issue: null,
    issueError: null,
    comments: [],
    commentsError: null,
    pendingPosts: [],
    commentDraft: "",
    postError: null,
    labels: [],
    labelsSeq: -1,
    labelOps: [],
    labelDraft: "",
    labelError: null,
    labelsError: null,
    relatedQuery: "",
    related: [],
    relatedError: null,
    nextSeq: 0,
  }),
  states: {
    issue: {
      initial: "loading",
      on: {
        retry: { target: ".start" },
        "title.confirmed": {
          actions: assign({
            issue: ({ context, event }) => (context.issue ? { ...context.issue, title: event.title } : null),
          }),
        },
      },
      states: {
        start: { always: "loading" },
        loading: {
          invoke: {
            src: "fetchIssue",
            input: ({ context }) => context.id,
            onDone: [
              {
                guard: ({ event }) => event.output === null,
                target: "notFound",
                actions: assign({ issue: null, issueError: null }),
              },
              {
                target: "loaded",
                actions: assign({
                  issue: ({ event }) => event.output,
                  issueError: null,
                  relatedQuery: ({ event }) => event.output?.title ?? "",
                }),
              },
            ],
            onError: {
              target: "failed",
              actions: assign({ issue: null, issueError: ({ event }) => errorMessage(event.error) }),
            },
          },
        },
        loaded: {
          initial: "searching",
          states: {
            searching: {
              invoke: {
                src: "searchRelated",
                input: ({ context }) => context.relatedQuery,
                onDone: {
                  target: "found",
                  actions: assign({ related: ({ event }) => event.output, relatedError: null }),
                },
                onError: {
                  target: "failed",
                  actions: assign({ related: [], relatedError: ({ event }) => errorMessage(event.error) }),
                },
              },
            },
            found: {},
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
            input: ({ context }) => context.id,
            onDone: {
              target: "loaded",
              // comments accepted while the list was loading are kept after it
              actions: assign({ comments: ({ context, event }) => [...event.output, ...context.comments] }),
            },
            onError: {
              target: "failed",
              actions: assign({ commentsError: ({ event }) => errorMessage(event.error) }),
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
            src: "fetchLabels",
            input: ({ context }) => context.id,
            onDone: {
              target: "loaded",
              actions: assign({ labels: ({ event }) => event.output }),
            },
            onError: {
              target: "failed",
              actions: assign({ labelsError: ({ event }) => errorMessage(event.error) }),
            },
          },
        },
        loaded: {
          on: {
            "label.add": {
              guard: "canAddLabel",
              actions: enqueueActions(({ context, enqueue }) => {
                const seq = context.nextSeq;
                const label = context.labelDraft.trim();
                const id = context.id;
                enqueue.assign({
                  nextSeq: seq + 1,
                  labelOps: [...context.labelOps, { seq, kind: "add", label }],
                  labelDraft: "",
                  labelError: null,
                });
                enqueue.spawnChild("request", { input: { seq, run: () => api.addLabel(id, label) } });
              }),
            },
            "label.remove": {
              guard: "hasLabel",
              actions: enqueueActions(({ context, event, enqueue }) => {
                const seq = context.nextSeq;
                const label = event.label;
                const id = context.id;
                enqueue.assign({
                  nextSeq: seq + 1,
                  labelOps: [...context.labelOps, { seq, kind: "remove", label }],
                  labelError: null,
                });
                enqueue.spawnChild("request", { input: { seq, run: () => api.removeLabel(id, label) } });
              }),
            },
          },
        },
        failed: {},
      },
    },
  },
  on: {
    "comment.change": { actions: assign({ commentDraft: ({ event }) => event.value }) },
    "label.change": { actions: assign({ labelDraft: ({ event }) => event.value }) },
    "comment.post": {
      guard: "canPost",
      actions: enqueueActions(({ context, event, enqueue }) => {
        const seq = context.nextSeq;
        const text = context.commentDraft;
        const author = event.author;
        const id = context.id;
        enqueue.assign({
          nextSeq: seq + 1,
          pendingPosts: [...context.pendingPosts, { seq, author, text }],
          commentDraft: "",
          postError: null,
        });
        enqueue.spawnChild("request", { input: { seq, run: () => api.addComment(id, author, text) } });
      }),
    },
    "request.done": {
      actions: assign(({ context, event }) => {
        const post = context.pendingPosts.find(p => p.seq === event.seq);
        if (post) {
          return {
            pendingPosts: context.pendingPosts.filter(p => p.seq !== event.seq),
            comments: [...context.comments, event.output as Comment],
          };
        }
        const op = context.labelOps.find(o => o.seq === event.seq);
        if (op) {
          const newer = event.seq > context.labelsSeq;
          return {
            labelOps: context.labelOps.filter(o => o.seq !== event.seq),
            labels: newer ? (event.output as string[]) : context.labels,
            labelsSeq: newer ? event.seq : context.labelsSeq,
          };
        }
        return {};
      }),
    },
    "request.failed": {
      actions: assign(({ context, event }) => {
        if (context.pendingPosts.some(p => p.seq === event.seq)) {
          return {
            pendingPosts: context.pendingPosts.filter(p => p.seq !== event.seq),
            postError: event.message,
          };
        }
        if (context.labelOps.some(o => o.seq === event.seq)) {
          return {
            labelOps: context.labelOps.filter(o => o.seq !== event.seq),
            labelError: event.message,
          };
        }
        return {};
      }),
    },
  },
});
