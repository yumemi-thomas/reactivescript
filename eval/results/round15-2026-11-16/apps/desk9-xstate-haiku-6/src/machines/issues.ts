import { assign, fromPromise, setup, spawnChild } from 'xstate';
import * as api from '../api.js';
import type { Comment, Hit, Issue, IssueDetail } from '../api.js';
import { errorMessage, opMachine, type Pending, type Req } from './ops.js';

export type Filter = 'open' | 'closed';
export type ErrorKey = 'assign' | 'rename' | 'close' | 'post' | 'label';
export type Errors = Partial<Record<ErrorKey, string>>;

export type IssuesContext = {
  user: string;
  filter: Filter;
  /** The current filter's issues as the server last answered, with accepted writes applied. */
  rows: Issue[];
  listError: string;
  selectedId: number | null;
  selectedIssue: IssueDetail | null;
  detailError: string;
  comments: Comment[];
  commentsError: string;
  labels: string[];
  labelsError: string;
  related: Hit[];
  relatedError: string;
  titleDraft: string;
  commentDraft: string;
  labelDraft: string;
  /** Writes in the air. The views are the server's answers with these laid over them. */
  pending: Pending[];
  nextOpId: number;
  errors: Errors;
  rowError: string | null;
};

export type IssuesEvent =
  | { type: 'SET_USER'; value: string }
  | { type: 'SET_FILTER'; filter: Filter }
  | { type: 'SELECT'; id: number }
  | { type: 'RETRY_DETAIL' }
  | { type: 'SET_TITLE'; value: string }
  | { type: 'SET_COMMENT'; value: string }
  | { type: 'SET_LABEL'; value: string }
  | { type: 'DETAIL_ASSIGN' }
  | { type: 'DETAIL_RENAME' }
  | { type: 'DETAIL_CLOSE' }
  | { type: 'POST' }
  | { type: 'ADD_LABEL' }
  | { type: 'REMOVE_LABEL'; label: string }
  | { type: 'ROW_ASSIGN'; id: number }
  | { type: 'ROW_CLOSE'; id: number }
  | { type: 'OP_OK'; opId: number; req: Req; value: unknown }
  | { type: 'OP_ERR'; opId: number; req: Req; message: string };

function enqueue(context: IssuesContext, req: Req): Pick<IssuesContext, 'pending' | 'nextOpId'> {
  return {
    pending: [...context.pending, { opId: context.nextOpId, req }],
    nextOpId: context.nextOpId + 1,
  };
}

function lastPending({ context }: { context: IssuesContext }): Pending {
  return context.pending[context.pending.length - 1] as Pending;
}

function without(errors: Errors, key: ErrorKey): Errors {
  const next = { ...errors };
  delete next[key];
  return next;
}

function errorKey(req: Req): ErrorKey {
  switch (req.kind) {
    case 'assign':
      return 'assign';
    case 'rename':
      return 'rename';
    case 'close':
      return 'close';
    case 'comment':
      return 'post';
    case 'addLabel':
    case 'removeLabel':
      return 'label';
  }
}

/** The title shown for an issue: a rename in the air, else the given title. */
export function shownTitle(context: IssuesContext, id: number, base: string): string {
  let title = base;
  for (const { req } of context.pending) {
    if (req.kind === 'rename' && req.id === id) title = req.title;
  }
  return title;
}

/** The open list as the page shows it: closes in the air hidden, assignments and renames in the air applied. */
export function viewRows(context: IssuesContext): Issue[] {
  // Closes only leave the open list; the closed list is not touched by them.
  const closing = new Set(
    context.filter === 'open' ? context.pending.flatMap(({ req }) => (req.kind === 'close' ? [req.id] : [])) : [],
  );
  return context.rows
    .filter((row) => !closing.has(row.id))
    .map((row) => {
      let assignee = row.assignee;
      let title = row.title;
      for (const { req } of context.pending) {
        if (req.id !== row.id) continue;
        if (req.kind === 'assign') assignee = req.user;
        if (req.kind === 'rename') title = req.title;
      }
      return { id: row.id, title, assignee };
    });
}

/** The selected issue's labels: removals in the air hidden, additions in the air appended. */
export function viewLabels(context: IssuesContext): string[] {
  if (context.selectedId === null) return [];
  const id = context.selectedId;
  const removing = new Set(
    context.pending.flatMap(({ req }) => (req.kind === 'removeLabel' && req.id === id ? [req.label] : [])),
  );
  const shown = context.labels.filter((label) => !removing.has(label));
  for (const { req } of context.pending) {
    if (req.kind === 'addLabel' && req.id === id && !shown.includes(req.label)) shown.push(req.label);
  }
  return shown;
}

/** The selected issue's comments still in the air. */
export function pendingComments(context: IssuesContext): Comment[] {
  return context.pending.flatMap(({ req }) =>
    req.kind === 'comment' && req.id === context.selectedId ? [{ author: req.author, text: req.text }] : [],
  );
}

/** The count on the issues tab: the open list's length while it shows, else null (keep the last number). */
export function openCountOf(context: IssuesContext, listLoaded: boolean): number | null {
  return listLoaded && context.filter === 'open' ? viewRows(context).length : null;
}

function applyOk(context: IssuesContext, opId: number, req: Req, value: unknown): Partial<IssuesContext> {
  const pending = context.pending.filter((p) => p.opId !== opId);
  switch (req.kind) {
    case 'assign': {
      const { assignee } = value as { assignee: string };
      return { pending, rows: context.rows.map((r) => (r.id === req.id ? { ...r, assignee } : r)) };
    }
    case 'rename': {
      const { title } = value as { title: string };
      return {
        pending,
        rows: context.rows.map((r) => (r.id === req.id ? { ...r, title } : r)),
        selectedIssue:
          context.selectedIssue !== null && context.selectedIssue.id === req.id
            ? { ...context.selectedIssue, title }
            : context.selectedIssue,
      };
    }
    case 'close':
      return {
        pending,
        rows: context.filter === 'open' ? context.rows.filter((r) => r.id !== req.id) : context.rows,
      };
    case 'comment':
      return {
        pending,
        comments: context.selectedId === req.id ? [...context.comments, value as Comment] : context.comments,
      };
    case 'addLabel':
    case 'removeLabel':
      return { pending, labels: context.selectedId === req.id ? (value as string[]) : context.labels };
  }
}

function applyErr(context: IssuesContext, opId: number, req: Req, message: string): Partial<IssuesContext> {
  const pending = context.pending.filter((p) => p.opId !== opId);
  if ((req.kind === 'assign' || req.kind === 'close') && req.via === 'row') {
    return { pending, rowError: `row error: ${message}` };
  }
  if (req.id !== context.selectedId) return { pending };
  const errors = { ...context.errors };
  errors[errorKey(req)] = message;
  return { pending, errors };
}

export const issuesMachine = setup({
  types: {
    context: {} as IssuesContext,
    events: {} as IssuesEvent,
  },
  actions: {
    /** Selecting an issue starts its detail afresh: nothing of the previous issue carries over. */
    selectIssue: assign(({ event }) => {
      if (event.type !== 'SELECT') return {};
      return {
        selectedId: event.id,
        selectedIssue: null,
        detailError: '',
        comments: [],
        commentsError: '',
        labels: [],
        labelsError: '',
        related: [],
        relatedError: '',
        titleDraft: '',
        commentDraft: '',
        labelDraft: '',
        errors: {},
      };
    }),
  },
  actors: {
    op: opMachine,
    loadIssues: fromPromise<Issue[], { filter: Filter }>(({ input }) => api.fetchIssues(input.filter)),
    loadIssue: fromPromise<IssueDetail | null, { id: number }>(({ input }) => api.fetchIssue(input.id)),
    loadComments: fromPromise<Comment[], { id: number }>(({ input }) => api.fetchComments(input.id)),
    loadLabels: fromPromise<string[], { id: number }>(({ input }) => api.fetchLabels(input.id)),
    searchHelp: fromPromise<Hit[], { q: string }>(({ input }) => api.search(input.q)),
  },
}).createMachine({
  id: 'issues',
  type: 'parallel',
  context: {
    user: 'guest',
    filter: 'open',
    rows: [],
    listError: '',
    selectedId: null,
    selectedIssue: null,
    detailError: '',
    comments: [],
    commentsError: '',
    labels: [],
    labelsError: '',
    related: [],
    relatedError: '',
    titleDraft: '',
    commentDraft: '',
    labelDraft: '',
    pending: [],
    nextOpId: 1,
    errors: {},
    rowError: null,
  },
  on: {
    SET_USER: { actions: assign({ user: ({ event }) => event.value }) },
    SET_TITLE: { actions: assign({ titleDraft: ({ event }) => event.value }) },
    SET_COMMENT: { actions: assign({ commentDraft: ({ event }) => event.value }) },
    SET_LABEL: { actions: assign({ labelDraft: ({ event }) => event.value }) },

    DETAIL_ASSIGN: {
      guard: ({ context }) => context.selectedId !== null,
      actions: [
        assign(({ context }) => ({
          ...enqueue(context, {
            kind: 'assign',
            via: 'detail',
            id: context.selectedId as number,
            user: context.user,
          }),
          errors: without(context.errors, 'assign'),
        })),
        spawnChild('op', { input: lastPending }),
      ],
    },
    DETAIL_RENAME: {
      guard: ({ context }) => context.selectedId !== null && context.titleDraft.trim() !== '',
      actions: [
        assign(({ context }) => ({
          ...enqueue(context, {
            kind: 'rename',
            via: 'detail',
            id: context.selectedId as number,
            title: context.titleDraft.trim(),
          }),
          errors: without(context.errors, 'rename'),
        })),
        spawnChild('op', { input: lastPending }),
      ],
    },
    DETAIL_CLOSE: {
      guard: ({ context }) => context.selectedId !== null,
      actions: [
        assign(({ context }) => ({
          ...enqueue(context, { kind: 'close', via: 'detail', id: context.selectedId as number }),
          errors: without(context.errors, 'close'),
        })),
        spawnChild('op', { input: lastPending }),
      ],
    },
    POST: {
      guard: ({ context }) => context.selectedId !== null && context.commentDraft.trim() !== '',
      actions: [
        assign(({ context }) => ({
          ...enqueue(context, {
            kind: 'comment',
            id: context.selectedId as number,
            author: context.user,
            text: context.commentDraft.trim(),
          }),
          commentDraft: '',
          errors: without(context.errors, 'post'),
        })),
        spawnChild('op', { input: lastPending }),
      ],
    },
    ADD_LABEL: {
      guard: ({ context }) => {
        const label = context.labelDraft.trim();
        return context.selectedId !== null && label !== '' && !viewLabels(context).includes(label);
      },
      actions: [
        assign(({ context }) => ({
          ...enqueue(context, {
            kind: 'addLabel',
            id: context.selectedId as number,
            label: context.labelDraft.trim(),
          }),
          labelDraft: '',
          errors: without(context.errors, 'label'),
        })),
        spawnChild('op', { input: lastPending }),
      ],
    },
    REMOVE_LABEL: {
      guard: ({ context }) => context.selectedId !== null,
      actions: [
        assign(({ context, event }) => ({
          ...enqueue(context, {
            kind: 'removeLabel',
            id: context.selectedId as number,
            label: event.label,
          }),
          errors: without(context.errors, 'label'),
        })),
        spawnChild('op', { input: lastPending }),
      ],
    },
    ROW_ASSIGN: {
      actions: [
        assign(({ context, event }) => ({
          ...enqueue(context, { kind: 'assign', via: 'row', id: event.id, user: context.user }),
          rowError: null,
        })),
        spawnChild('op', { input: lastPending }),
      ],
    },
    ROW_CLOSE: {
      actions: [
        assign(({ context, event }) => ({
          ...enqueue(context, { kind: 'close', via: 'row', id: event.id }),
          rowError: null,
        })),
        spawnChild('op', { input: lastPending }),
      ],
    },
    OP_OK: {
      actions: assign(({ context, event }) => applyOk(context, event.opId, event.req, event.value)),
    },
    OP_ERR: {
      actions: assign(({ context, event }) => applyErr(context, event.opId, event.req, event.message)),
    },
  },
  states: {
    list: {
      initial: 'loading',
      on: {
        SET_FILTER: {
          guard: ({ context, event }) => context.filter !== event.filter,
          target: '.loading',
          actions: assign({ filter: ({ event }) => event.filter }),
        },
      },
      states: {
        loading: {
          invoke: {
            src: 'loadIssues',
            input: ({ context }) => ({ filter: context.filter }),
            onDone: { target: 'loaded', actions: assign({ rows: ({ event }) => event.output }) },
            onError: {
              target: 'failed',
              actions: assign({ listError: ({ event }) => errorMessage(event.error) }),
            },
          },
        },
        loaded: {},
        failed: {},
      },
    },

    selection: {
      initial: 'none',
      states: {
        none: {
          on: { SELECT: { target: 'selected', actions: 'selectIssue' } },
        },
        selected: {
          type: 'parallel',
          on: { SELECT: { target: 'selected', reenter: true, actions: 'selectIssue' } },
          states: {
            detail: {
              initial: 'loading',
              states: {
                loading: {
                  invoke: {
                    src: 'loadIssue',
                    input: ({ context }) => ({ id: context.selectedId as number }),
                    onDone: [
                      {
                        guard: ({ event }) => event.output !== null,
                        target: 'shown',
                        actions: assign({ selectedIssue: ({ event }) => event.output }),
                      },
                      { target: 'notFound' },
                    ],
                    onError: {
                      target: 'failed',
                      actions: assign({ detailError: ({ event }) => errorMessage(event.error) }),
                    },
                  },
                },
                shown: {
                  type: 'parallel',
                  on: { RETRY_DETAIL: { target: 'loading' } },
                  states: {
                    related: {
                      initial: 'searching',
                      states: {
                        searching: {
                          invoke: {
                            src: 'searchHelp',
                            input: ({ context }) => ({ q: context.selectedIssue?.title ?? '' }),
                            onDone: {
                              target: 'found',
                              actions: assign({ related: ({ event }) => event.output }),
                            },
                            onError: {
                              target: 'failed',
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
                notFound: { on: { RETRY_DETAIL: { target: 'loading' } } },
                failed: { on: { RETRY_DETAIL: { target: 'loading' } } },
              },
            },
            comments: {
              initial: 'loading',
              states: {
                loading: {
                  invoke: {
                    src: 'loadComments',
                    input: ({ context }) => ({ id: context.selectedId as number }),
                    onDone: { target: 'loaded', actions: assign({ comments: ({ event }) => event.output }) },
                    onError: {
                      target: 'failed',
                      actions: assign({ commentsError: ({ event }) => errorMessage(event.error) }),
                    },
                  },
                },
                loaded: {},
                failed: {},
              },
            },
            labels: {
              initial: 'loading',
              states: {
                loading: {
                  invoke: {
                    src: 'loadLabels',
                    input: ({ context }) => ({ id: context.selectedId as number }),
                    onDone: { target: 'loaded', actions: assign({ labels: ({ event }) => event.output }) },
                    onError: {
                      target: 'failed',
                      actions: assign({ labelsError: ({ event }) => errorMessage(event.error) }),
                    },
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
