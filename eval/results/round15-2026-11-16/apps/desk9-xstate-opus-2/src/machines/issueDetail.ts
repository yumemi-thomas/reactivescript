import { assign, enqueueActions, raise, setup } from "xstate";
import type { Comment, Hit, IssueDetail } from "../types";
import type { LabelOp } from "../model";
import { viewLabels } from "../model";
import { labelRequest, loadComments, loadIssue, loadLabels, postRequest, searchHelp } from "../requests";
import { errorMessage } from "../clock";

/** A comment this client posted: `sentAt` is null while the server has not answered. */
export type Post = { opId: number; author: string; text: string; sentAt: number | null };

type Context = {
  id: number;
  issue: IssueDetail | null;
  issueAt: number;
  issueError: string | null;
  titleInput: string;
  commentInput: string;
  labelInput: string;
  comments: Comment[];
  commentsError: string | null;
  posts: Post[];
  postError: string | null;
  labels: string[];
  labelsAt: number;
  labelsError: string | null;
  labelOps: LabelOp[];
  labelError: string | null;
  related: Hit[];
  relatedError: string | null;
  nextOpId: number;
};

type Event =
  | { type: "retry" }
  | { type: "title.change"; value: string }
  | { type: "comment.change"; value: string }
  | { type: "label.change"; value: string }
  | { type: "post"; author: string }
  | { type: "post.done"; opId: number; output: Comment; at: number }
  | { type: "post.failed"; opId: number; message: string }
  | { type: "label.add" }
  | { type: "label.remove"; label: string }
  | { type: "label.done"; opId: number; output: string[]; at: number }
  | { type: "label.failed"; opId: number; message: string }
  | { type: "related.find" }
  | { type: "related.reset" };

export const issueDetailMachine = setup({
  types: {
    context: {} as Context,
    events: {} as Event,
    input: {} as { id: number },
  },
  actors: { loadIssue, loadComments, loadLabels, searchHelp, postRequest, labelRequest },
  guards: {
    canPost: ({ context, event }) =>
      event.type === "post" && context.commentInput.trim() !== "" && event.author.trim() !== "",
    canAddLabel: ({ context }) => {
      const label = context.labelInput.trim();
      return label !== "" && !viewLabels(context.labels, context.labelOps).includes(label);
    },
    canRemoveLabel: ({ context, event }) =>
      event.type === "label.remove" && viewLabels(context.labels, context.labelOps).includes(event.label),
  },
}).createMachine({
  id: "issueDetail",
  type: "parallel",
  context: ({ input }) => ({
    id: input.id,
    issue: null,
    issueAt: 0,
    issueError: null,
    titleInput: "",
    commentInput: "",
    labelInput: "",
    comments: [],
    commentsError: null,
    posts: [],
    postError: null,
    labels: [],
    labelsAt: 0,
    labelsError: null,
    labelOps: [],
    labelError: null,
    related: [],
    relatedError: null,
    nextOpId: 1,
  }),
  on: {
    "title.change": { actions: assign({ titleInput: ({ event }) => event.value }) },
    "comment.change": { actions: assign({ commentInput: ({ event }) => event.value }) },
    "label.change": { actions: assign({ labelInput: ({ event }) => event.value }) },

    post: {
      guard: "canPost",
      actions: enqueueActions(({ context, event, enqueue }) => {
        const opId = context.nextOpId;
        const text = context.commentInput.trim();
        const author = event.author.trim();
        enqueue.assign({
          posts: [...context.posts, { opId, author, text, sentAt: null }],
          commentInput: "",
          postError: null,
          nextOpId: opId + 1,
        });
        enqueue.spawnChild("postRequest", { id: `post-${opId}`, input: { opId, id: context.id, author, text } });
      }),
    },
    "post.done": {
      actions: enqueueActions(({ context, event, enqueue }) => {
        enqueue.assign({
          posts: context.posts.map((p) =>
            p.opId === event.opId ? { ...p, author: event.output.author, text: event.output.text, sentAt: event.at } : p,
          ),
        });
        enqueue.stopChild(`post-${event.opId}`);
      }),
    },
    "post.failed": {
      actions: enqueueActions(({ context, event, enqueue }) => {
        enqueue.assign({
          posts: context.posts.filter((p) => p.opId !== event.opId),
          postError: event.message,
        });
        enqueue.stopChild(`post-${event.opId}`);
      }),
    },

    "label.done": {
      actions: enqueueActions(({ context, event, enqueue }) => {
        const fresher = event.at > context.labelsAt;
        enqueue.assign({
          labels: fresher ? event.output : context.labels,
          labelsAt: fresher ? event.at : context.labelsAt,
          labelOps: context.labelOps.filter((op) => op.opId !== event.opId),
        });
        enqueue.stopChild(`label-${event.opId}`);
      }),
    },
    "label.failed": {
      actions: enqueueActions(({ context, event, enqueue }) => {
        enqueue.assign({
          labelOps: context.labelOps.filter((op) => op.opId !== event.opId),
          labelError: event.message,
        });
        enqueue.stopChild(`label-${event.opId}`);
      }),
    },
  },
  states: {
    issue: {
      initial: "loading",
      on: { retry: { target: ".loading" } },
      states: {
        loading: {
          entry: raise({ type: "related.reset" }),
          invoke: {
            src: "loadIssue",
            input: ({ context }) => ({ id: context.id }),
            onDone: [
              {
                guard: ({ event }) => event.output.issue === null,
                target: "notFound",
                actions: assign({ issue: null, issueError: null }),
              },
              {
                target: "loaded",
                actions: assign({
                  issue: ({ event }) => event.output.issue,
                  issueAt: ({ event }) => event.output.at,
                  issueError: null,
                }),
              },
            ],
            onError: {
              target: "failed",
              actions: assign({ issue: null, issueError: ({ event }) => errorMessage(event.error) }),
            },
          },
        },
        loaded: { entry: raise({ type: "related.find" }) },
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
            input: ({ context }) => ({ id: context.id }),
            onDone: {
              target: "ready",
              actions: assign({
                comments: ({ event }) => event.output.comments,
                // posts that landed before this answer was asked are part of it
                posts: ({ context, event }) =>
                  context.posts.filter((p) => p.sentAt === null || p.sentAt > event.output.at),
              }),
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
            input: ({ context }) => ({ id: context.id }),
            onDone: {
              target: "ready",
              actions: assign(({ context, event }) =>
                event.output.at > context.labelsAt ? { labels: event.output.labels, labelsAt: event.output.at } : {},
              ),
            },
            onError: {
              target: "failed",
              actions: assign({ labelsError: ({ event }) => errorMessage(event.error) }),
            },
          },
        },
        ready: {
          on: {
            "label.add": {
              guard: "canAddLabel",
              actions: enqueueActions(({ context, enqueue }) => {
                const opId = context.nextOpId;
                const label = context.labelInput.trim();
                enqueue.assign({
                  labelOps: [...context.labelOps, { opId, kind: "add", label }],
                  labelInput: "",
                  labelError: null,
                  nextOpId: opId + 1,
                });
                enqueue.spawnChild("labelRequest", { id: `label-${opId}`, input: { opId, id: context.id, kind: "add", label } });
              }),
            },
            "label.remove": {
              guard: "canRemoveLabel",
              actions: enqueueActions(({ context, event, enqueue }) => {
                const opId = context.nextOpId;
                const label = event.label;
                enqueue.assign({
                  labelOps: [...context.labelOps, { opId, kind: "remove", label }],
                  labelError: null,
                  nextOpId: opId + 1,
                });
                enqueue.spawnChild("labelRequest", {
                  id: `label-${opId}`,
                  input: { opId, id: context.id, kind: "remove", label },
                });
              }),
            },
          },
        },
        failed: {},
      },
    },

    related: {
      initial: "idle",
      on: {
        "related.find": { target: ".searching" },
        "related.reset": { target: ".idle" },
      },
      states: {
        idle: {},
        searching: {
          invoke: {
            src: "searchHelp",
            input: ({ context }) => ({ q: context.issue?.title ?? "" }),
            onDone: {
              target: "done",
              actions: assign({ related: ({ event }) => event.output.hits, relatedError: null }),
            },
            onError: {
              target: "failed",
              actions: assign({ relatedError: ({ event }) => errorMessage(event.error) }),
            },
          },
        },
        done: {},
        failed: {},
      },
    },
  },
});
