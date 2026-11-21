import { assign, enqueueActions, fromPromise, raise, sendParent, setup } from 'xstate';
import * as api from '../api.js';
import type { Comment, Hit, Issue, IssueDetail } from '../api.js';
import { messageOf } from '../errors.js';
import { newOpId, opMachine, type Op } from './ops.js';

export type Filter = 'open' | 'closed';

export type CommentRow = { key: number; author: string; text: string; sending: boolean };

export type IssuesContext = {
  user: string;
  filter: Filter;
  listError: string;
  /** the open issues as last answered, with the optimistic changes applied */
  openIssues: Issue[] | undefined;
  closedIssues: Issue[] | undefined;
  rowError: string | undefined;
  selectedId: number | undefined;
  issue: IssueDetail | undefined;
  issueError: string;
  titleDraft: string;
  assignError: string | undefined;
  renameError: string | undefined;
  closeError: string | undefined;
  comments: CommentRow[];
  commentsError: string;
  commentDraft: string;
  postError: string | undefined;
  labels: string[];
  labelsError: string;
  labelDraft: string;
  labelError: string | undefined;
  hits: Hit[];
  relatedError: string;
};

export type IssuesEvent =
  | { type: 'USER'; value: string }
  | { type: 'FILTER'; filter: Filter }
  | { type: 'ROW_ASSIGN'; id: number }
  | { type: 'ROW_CLOSE'; id: number }
  | { type: 'SELECT'; id: number }
  | { type: 'RETRY' }
  | { type: 'ASSIGN' }
  | { type: 'TITLE'; value: string }
  | { type: 'RENAME' }
  | { type: 'CLOSE' }
  | { type: 'COMMENT'; value: string }
  | { type: 'POST' }
  | { type: 'LABEL'; value: string }
  | { type: 'ADD_LABEL' }
  | { type: 'REMOVE_LABEL'; label: string }
  | { type: 'OPEN_RELATED'; hitId: number }
  | { type: 'DETAIL_LOADED' }
  | { type: 'opSucceeded'; op: Op }
  | { type: 'opFailed'; op: Op; message: string };

type Patch = Partial<IssuesContext>;

const allIssues = (c: IssuesContext): Issue[] => [...(c.openIssues ?? []), ...(c.closedIssues ?? [])];
const findIssue = (c: IssuesContext, id: number): Issue | undefined =>
  allIssues(c).find((i) => i.id === id);

/** What selecting an issue starts from: nothing loaded, no errors, empty drafts. */
const selectPatch = (id: number): Patch => ({
  selectedId: id,
  issue: undefined,
  issueError: '',
  titleDraft: '',
  comments: [],
  commentsError: '',
  commentDraft: '',
  postError: undefined,
  labels: [],
  labelsError: '',
  labelDraft: '',
  labelError: undefined,
  hits: [],
  relatedError: '',
  assignError: undefined,
  renameError: undefined,
  closeError: undefined,
});

function mapById<T extends { id: number }>(
  list: T[] | undefined,
  id: number,
  change: (item: T) => T,
): T[] | undefined {
  return list?.map((item) => (item.id === id ? change(item) : item));
}

function withoutId(list: Issue[] | undefined, id: number): Issue[] | undefined {
  return list?.filter((i) => i.id !== id);
}

/** Puts a removed issue back where it was, unless it is already there. */
function reinsert(list: Issue[] | undefined, issue: Issue | undefined, index: number): Issue[] | undefined {
  if (!list || !issue || index < 0 || list.some((i) => i.id === issue.id)) return list;
  const at = Math.min(index, list.length);
  return [...list.slice(0, at), issue, ...list.slice(at)];
}

function insertLabel(labels: string[], label: string, index: number): string[] {
  if (labels.includes(label)) return labels;
  const at = Math.min(index, labels.length);
  return [...labels.slice(0, at), label, ...labels.slice(at)];
}

function assigneePatch(c: IssuesContext, id: number, assignee: string | null): Patch {
  return {
    openIssues: mapById(c.openIssues, id, (i) => ({ ...i, assignee })),
    closedIssues: mapById(c.closedIssues, id, (i) => ({ ...i, assignee })),
  };
}

function titlePatch(c: IssuesContext, id: number, title: string): Patch {
  return {
    openIssues: mapById(c.openIssues, id, (i) => ({ ...i, title })),
    closedIssues: mapById(c.closedIssues, id, (i) => ({ ...i, title })),
    issue: c.issue && c.issue.id === id ? { ...c.issue, title } : c.issue,
  };
}

/** The issues page: the list for a filter, the selected issue, and row actions. */
export const issuesMachine = setup({
  types: {
    context: {} as IssuesContext,
    events: {} as IssuesEvent,
  },
  actors: {
    op: opMachine,
    fetchIssues: fromPromise<Issue[], Filter>(({ input }) => api.fetchIssues(input)),
    fetchIssue: fromPromise<IssueDetail | null, number>(({ input }) => api.fetchIssue(input)),
    fetchComments: fromPromise<Comment[], number>(({ input }) => api.fetchComments(input)),
    fetchLabels: fromPromise<string[], number>(({ input }) => api.fetchLabels(input)),
    search: fromPromise<Hit[], string>(({ input }) => api.search(input)),
  },
}).createMachine({
  id: 'issues',
  type: 'parallel',
  context: {
    user: 'guest',
    filter: 'open',
    listError: '',
    openIssues: undefined,
    closedIssues: undefined,
    rowError: undefined,
    selectedId: undefined,
    issue: undefined,
    issueError: '',
    titleDraft: '',
    assignError: undefined,
    renameError: undefined,
    closeError: undefined,
    comments: [],
    commentsError: '',
    commentDraft: '',
    postError: undefined,
    labels: [],
    labelsError: '',
    labelDraft: '',
    labelError: undefined,
    hits: [],
    relatedError: '',
  },
  on: {
    USER: {
      actions: assign({ user: ({ event }) => event.value }),
    },
    opSucceeded: {
      actions: enqueueActions(({ context, event, enqueue }) => {
        const op = event.op;
        if (op.kind === 'post') {
          const key = op.key;
          enqueue.assign({
            comments: context.comments.map((c) => (c.key === key ? { ...c, sending: false } : c)),
          });
        }
      }),
    },
    opFailed: {
      actions: enqueueActions(({ context, event, enqueue }) => {
        const op = event.op;
        const message = event.message;
        const here = context.selectedId === op.id;
        switch (op.kind) {
          case 'assign': {
            const patch: Patch = op.previous === undefined ? {} : assigneePatch(context, op.id, op.previous);
            if (op.source === 'row') patch.rowError = message;
            else if (here) patch.assignError = message;
            enqueue.assign(patch);
            return;
          }
          case 'rename': {
            const patch: Patch = op.previous === undefined ? {} : titlePatch(context, op.id, op.previous);
            if (here) patch.renameError = message;
            enqueue.assign(patch);
            return;
          }
          case 'close': {
            const patch: Patch = { openIssues: reinsert(context.openIssues, op.issue, op.index) };
            if (op.source === 'row') patch.rowError = message;
            else if (here) patch.closeError = message;
            enqueue.assign(patch);
            enqueue.sendParent({ type: 'openCount', count: patch.openIssues?.length });
            return;
          }
          case 'post': {
            enqueue.assign({
              comments: context.comments.filter((c) => c.key !== op.key),
              postError: here ? message : context.postError,
            });
            return;
          }
          case 'addLabel': {
            enqueue.assign({
              labels: here ? context.labels.filter((l) => l !== op.label) : context.labels,
              labelError: here ? message : context.labelError,
            });
            return;
          }
          case 'removeLabel': {
            enqueue.assign({
              labels: here ? insertLabel(context.labels, op.label, op.index) : context.labels,
              labelError: here ? message : context.labelError,
            });
            return;
          }
        }
      }),
    },
  },
  states: {
    list: {
      initial: 'loading',
      on: {
        FILTER: {
          target: '.loading',
          actions: assign({
            filter: ({ event }) => event.filter,
            listError: '',
          }),
        },
      },
      states: {
        loading: {
          on: {
            // a filter change while loading restarts the request
            FILTER: {
              target: 'loading',
              reenter: true,
              actions: assign({
                filter: ({ event }) => event.filter,
                listError: '',
              }),
            },
          },
          invoke: {
            src: 'fetchIssues',
            input: ({ context }) => context.filter,
            onDone: {
              target: 'ready',
              actions: enqueueActions(({ context, event, enqueue }) => {
                enqueue.assign(
                  context.filter === 'open'
                    ? { openIssues: event.output }
                    : { closedIssues: event.output },
                );
                if (context.filter === 'open') {
                  enqueue.sendParent({ type: 'openCount', count: event.output.length });
                }
              }),
            },
            onError: {
              target: 'failed',
              actions: assign({ listError: ({ event }) => messageOf(event.error) }),
            },
          },
        },
        ready: {
          on: {
            ROW_ASSIGN: {
              actions: enqueueActions(({ context, event, enqueue }) => {
                const previous = findIssue(context, event.id)?.assignee;
                enqueue.assign({
                  ...assigneePatch(context, event.id, context.user),
                  rowError: undefined,
                });
                enqueue.spawnChild('op', {
                  id: newOpId(),
                  input: { kind: 'assign', id: event.id, user: context.user, previous, source: 'row' },
                });
              }),
            },
            ROW_CLOSE: {
              guard: ({ context }) => context.filter === 'open',
              actions: enqueueActions(({ context, event, enqueue }) => {
                const list = context.openIssues ?? [];
                const index = list.findIndex((i) => i.id === event.id);
                if (index < 0) return;
                const issue = list[index];
                const openIssues = withoutId(context.openIssues, event.id);
                enqueue.assign({ openIssues, rowError: undefined });
                enqueue.sendParent({ type: 'openCount', count: openIssues?.length });
                enqueue.spawnChild('op', {
                  id: newOpId(),
                  input: { kind: 'close', id: event.id, issue, index, source: 'row' },
                });
              }),
            },
          },
        },
        failed: {},
      },
    },
    detail: {
      initial: 'none',
      states: {
        none: {
          on: {
            SELECT: { target: 'selected', actions: assign(({ event }) => selectPatch(event.id)) },
          },
        },
        selected: {
          type: 'parallel',
          on: {
            // selecting while an issue is selected restarts all of its requests
            SELECT: {
              target: 'selected',
              reenter: true,
              actions: assign(({ event }) => selectPatch(event.id)),
            },
            TITLE: {
              actions: assign({ titleDraft: ({ event }) => event.value }),
            },
            COMMENT: {
              actions: assign({ commentDraft: ({ event }) => event.value }),
            },
            LABEL: {
              actions: assign({ labelDraft: ({ event }) => event.value }),
            },
            ASSIGN: {
              actions: enqueueActions(({ context, enqueue }) => {
                const id = context.selectedId;
                if (id === undefined) return;
                const previous = findIssue(context, id)?.assignee;
                enqueue.assign({
                  ...assigneePatch(context, id, context.user),
                  assignError: undefined,
                });
                enqueue.spawnChild('op', {
                  id: newOpId(),
                  input: { kind: 'assign', id, user: context.user, previous, source: 'detail' },
                });
              }),
            },
            RENAME: {
              guard: ({ context }) => context.titleDraft.trim() !== '' && context.selectedId !== undefined,
              actions: enqueueActions(({ context, enqueue }) => {
                const id = context.selectedId;
                if (id === undefined) return;
                const title = context.titleDraft.trim();
                const previous = findIssue(context, id)?.title ?? context.issue?.title;
                enqueue.assign({
                  ...titlePatch(context, id, title),
                  renameError: undefined,
                });
                enqueue.spawnChild('op', {
                  id: newOpId(),
                  input: { kind: 'rename', id, title, previous },
                });
              }),
            },
            CLOSE: {
              actions: enqueueActions(({ context, enqueue }) => {
                const id = context.selectedId;
                if (id === undefined) return;
                const list = context.openIssues ?? [];
                const index = list.findIndex((i) => i.id === id);
                const issue = index >= 0 ? list[index] : undefined;
                const openIssues = withoutId(context.openIssues, id);
                enqueue.assign({ openIssues, closeError: undefined });
                enqueue.sendParent({ type: 'openCount', count: openIssues?.length });
                enqueue.spawnChild('op', {
                  id: newOpId(),
                  input: { kind: 'close', id, issue, index, source: 'detail' },
                });
              }),
            },
          },
          states: {
            issue: {
              initial: 'loading',
              states: {
                loading: {
                  invoke: {
                    src: 'fetchIssue',
                    input: ({ context }) => context.selectedId ?? 0,
                    onDone: [
                      { guard: ({ event }) => event.output === null, target: 'notFound' },
                      {
                        target: 'ready',
                        actions: [
                          assign({ issue: ({ event }) => event.output ?? undefined }),
                          raise({ type: 'DETAIL_LOADED' }),
                        ],
                      },
                    ],
                    onError: {
                      target: 'failed',
                      actions: assign({ issueError: ({ event }) => messageOf(event.error) }),
                    },
                  },
                },
                ready: {
                  on: { RETRY: { target: 'loading', actions: assign({ issue: undefined, issueError: '' }) } },
                },
                notFound: {
                  on: { RETRY: { target: 'loading', actions: assign({ issue: undefined, issueError: '' }) } },
                },
                failed: {
                  on: { RETRY: { target: 'loading', actions: assign({ issue: undefined, issueError: '' }) } },
                },
              },
            },
            comments: {
              initial: 'loading',
              states: {
                loading: {
                  invoke: {
                    src: 'fetchComments',
                    input: ({ context }) => context.selectedId ?? 0,
                    onDone: {
                      target: 'ready',
                      actions: assign({
                        // server rows get negative keys so they never clash with pending ones
                        comments: ({ event }) =>
                          event.output.map((c, i) => ({
                            key: -(i + 1),
                            author: c.author,
                            text: c.text,
                            sending: false,
                          })),
                      }),
                    },
                    onError: {
                      target: 'failed',
                      actions: assign({ commentsError: ({ event }) => messageOf(event.error) }),
                    },
                  },
                },
                ready: {
                  on: {
                    POST: {
                      guard: ({ context }) => context.commentDraft.trim() !== '' && context.selectedId !== undefined,
                      actions: enqueueActions(({ context, enqueue }) => {
                        const id = context.selectedId;
                        if (id === undefined) return;
                        const text = context.commentDraft.trim();
                        const key = context.comments.reduce((m, c) => Math.max(m, c.key), 0) + 1;
                        const author = context.user;
                        enqueue.assign({
                          comments: [...context.comments, { key, author, text, sending: true }],
                          commentDraft: '',
                          postError: undefined,
                        });
                        enqueue.spawnChild('op', {
                          id: newOpId(),
                          input: { kind: 'post', id, key, author, text },
                        });
                      }),
                    },
                  },
                },
                failed: {},
              },
            },
            labels: {
              initial: 'loading',
              states: {
                loading: {
                  invoke: {
                    src: 'fetchLabels',
                    input: ({ context }) => context.selectedId ?? 0,
                    onDone: {
                      target: 'ready',
                      actions: assign({ labels: ({ event }) => event.output }),
                    },
                    onError: {
                      target: 'failed',
                      actions: assign({ labelsError: ({ event }) => messageOf(event.error) }),
                    },
                  },
                },
                ready: {
                  on: {
                    ADD_LABEL: {
                      guard: ({ context }) => {
                        const label = context.labelDraft.trim();
                        return label !== '' && !context.labels.includes(label) && context.selectedId !== undefined;
                      },
                      actions: enqueueActions(({ context, enqueue }) => {
                        const id = context.selectedId;
                        if (id === undefined) return;
                        const label = context.labelDraft.trim();
                        enqueue.assign({
                          labels: [...context.labels, label],
                          labelDraft: '',
                          labelError: undefined,
                        });
                        enqueue.spawnChild('op', {
                          id: newOpId(),
                          input: { kind: 'addLabel', id, label },
                        });
                      }),
                    },
                    REMOVE_LABEL: {
                      actions: enqueueActions(({ context, event, enqueue }) => {
                        const id = context.selectedId;
                        if (id === undefined) return;
                        const index = context.labels.indexOf(event.label);
                        if (index < 0) return;
                        enqueue.assign({
                          labels: context.labels.filter((_, i) => i !== index),
                          labelError: undefined,
                        });
                        enqueue.spawnChild('op', {
                          id: newOpId(),
                          input: { kind: 'removeLabel', id, label: event.label, index },
                        });
                      }),
                    },
                  },
                },
                failed: {},
              },
            },
            related: {
              initial: 'idle',
              on: {
                DETAIL_LOADED: { target: '.searching' },
              },
              states: {
                idle: {},
                searching: {
                  on: {
                    // a new detail while searching restarts the search
                    DETAIL_LOADED: { target: 'searching', reenter: true },
                  },
                  invoke: {
                    src: 'search',
                    input: ({ context }) => context.issue?.title ?? '',
                    onDone: {
                      target: 'ready',
                      actions: assign({ hits: ({ event }) => event.output }),
                    },
                    onError: {
                      target: 'failed',
                      actions: assign({ relatedError: ({ event }) => messageOf(event.error) }),
                    },
                  },
                },
                ready: {
                  on: {
                    OPEN_RELATED: {
                      actions: sendParent(({ context, event }) => ({
                        type: 'openRelatedHelp' as const,
                        query: context.issue?.title ?? '',
                        hitId: event.hitId,
                      })),
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
