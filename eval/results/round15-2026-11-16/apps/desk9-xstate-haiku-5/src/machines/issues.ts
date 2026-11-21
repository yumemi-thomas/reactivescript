import { assign, enqueueActions, fromCallback, fromPromise, setup, stopChild } from 'xstate';
import * as api from '../api';
import type { Comment, Hit, Issue, IssueDetail } from '../api';
import { messageOf } from './shared';

export type Filter = 'open' | 'closed';
export type ErrKey = 'assign' | 'row' | 'rename' | 'close' | 'post' | 'label';
export type CommentRow = { key: string; author: string; text: string; pending: boolean };

/** A write in the air: what it changed, and what is needed to roll it back. */
export type Op = {
  kind: 'assign' | 'rename' | 'close' | 'post' | 'addLabel' | 'removeLabel';
  err: ErrKey;
  origin: 'detail' | 'row';
  seq: number;
  gen: number;
  id: number;
  prev?: string | null;
  item?: Issue;
  index?: number;
  key?: string;
  label?: string;
};

type OpInput = { opId: string; run: () => Promise<unknown> };
export type OpResult =
  | { type: 'OP_DONE'; opId: string; value: unknown }
  | { type: 'OP_FAILED'; opId: string; message: string };

/** Runs one server write and reports its answer back to the issues machine. */
const runOp = fromCallback<OpResult, OpInput>(({ input, sendBack }) => {
  let live = true;
  new Promise<unknown>((resolve) => resolve(input.run())).then(
    (value) => {
      if (live) sendBack({ type: 'OP_DONE', opId: input.opId, value });
    },
    (error: unknown) => {
      if (live) sendBack({ type: 'OP_FAILED', opId: input.opId, message: messageOf(error) });
    },
  );
  return () => {
    live = false;
  };
});

export type IssuesContext = {
  user: string;
  filter: Filter;
  /** bumped whenever the list is asked again; writes from an older list do not roll back into a newer one */
  gen: number;
  items: Issue[];
  listError: string | null;
  selectedId: number | null;
  issue: IssueDetail | null;
  detailError: string | null;
  related: Hit[];
  relatedError: string | null;
  comments: CommentRow[];
  commentsError: string | null;
  labels: string[];
  labelsError: string | null;
  titleDraft: string;
  commentDraft: string;
  labelDraft: string;
  errors: Record<ErrKey, string | null>;
  errSeq: Record<ErrKey, number>;
  ops: Record<string, Op>;
  nextOp: number;
};

export type IssuesEvent =
  | { type: 'SET_USER'; value: string }
  | { type: 'SET_FILTER'; filter: Filter }
  | { type: 'SELECT'; id: number }
  | { type: 'SET_TITLE_DRAFT'; value: string }
  | { type: 'SET_COMMENT_DRAFT'; value: string }
  | { type: 'SET_LABEL_DRAFT'; value: string }
  | { type: 'RETRY' }
  | { type: 'RENAME' }
  | { type: 'ASSIGN_DETAIL' }
  | { type: 'CLOSE_DETAIL' }
  | { type: 'POST' }
  | { type: 'ADD_LABEL' }
  | { type: 'REMOVE_LABEL'; label: string }
  | { type: 'ROW_ASSIGN'; id: number }
  | { type: 'ROW_CLOSE'; id: number }
  | { type: 'OPEN_RELATED'; query: string; hitId: number }
  | OpResult;

type Plan = {
  opId: string;
  run: () => Promise<unknown>;
  patch: Partial<IssuesContext>;
  count?: number;
};

type Outcome = { ok: true; value: unknown } | { ok: false; message: string };

const nextOpId = (ctx: IssuesContext) => `op${ctx.nextOp}`;

/** Records a write as in the air and clears its error key, as starting a new one does. */
function begin(
  ctx: IssuesContext,
  opId: string,
  op: Omit<Op, 'seq' | 'gen'>,
  run: () => Promise<unknown>,
  optimistic: Partial<IssuesContext>,
): Plan {
  const seq = ctx.errSeq[op.err] + 1;
  return {
    opId,
    run,
    patch: {
      ...optimistic,
      nextOp: ctx.nextOp + 1,
      errSeq: { ...ctx.errSeq, [op.err]: seq },
      errors: { ...ctx.errors, [op.err]: null },
      ops: { ...ctx.ops, [opId]: { ...op, seq, gen: ctx.gen } },
    },
  };
}

function planAssign(ctx: IssuesContext, origin: 'detail' | 'row', id: number): Plan | undefined {
  const user = ctx.user.trim();
  if (user === '') return undefined;
  const current = ctx.items.find((i) => i.id === id);
  return begin(
    ctx,
    nextOpId(ctx),
    { kind: 'assign', err: origin === 'detail' ? 'assign' : 'row', origin, id, prev: current ? current.assignee : null },
    () => api.assign(id, user),
    { items: ctx.items.map((i) => (i.id === id ? { ...i, assignee: user } : i)) },
  );
}

function planRename(ctx: IssuesContext): Plan | undefined {
  const title = ctx.titleDraft.trim();
  const issue = ctx.issue;
  if (title === '' || issue === null || issue.id !== ctx.selectedId) return undefined;
  const id = issue.id;
  return begin(
    ctx,
    nextOpId(ctx),
    { kind: 'rename', err: 'rename', origin: 'detail', id, prev: issue.title },
    () => api.renameIssue(id, title),
    {
      items: ctx.items.map((i) => (i.id === id ? { ...i, title } : i)),
      issue: { ...issue, title },
    },
  );
}

function planClose(ctx: IssuesContext, origin: 'detail' | 'row', id: number): Plan {
  const index = ctx.items.findIndex((i) => i.id === id);
  const removed = ctx.filter === 'open' && index >= 0;
  const items = removed ? ctx.items.filter((i) => i.id !== id) : ctx.items;
  const plan = begin(
    ctx,
    nextOpId(ctx),
    {
      kind: 'close',
      err: origin === 'detail' ? 'close' : 'row',
      origin,
      id,
      item: removed ? ctx.items[index] : undefined,
      index: removed ? index : undefined,
    },
    () => api.closeIssue(id),
    { items },
  );
  return removed ? { ...plan, count: items.length } : plan;
}

function planPost(ctx: IssuesContext): Plan | undefined {
  const text = ctx.commentDraft.trim();
  const id = ctx.selectedId;
  if (text === '' || id === null) return undefined;
  const author = ctx.user.trim();
  const opId = nextOpId(ctx);
  return begin(
    ctx,
    opId,
    { kind: 'post', err: 'post', origin: 'detail', id, key: opId },
    () => api.addComment(id, author, text),
    {
      comments: [...ctx.comments, { key: opId, author, text, pending: true }],
      commentDraft: '',
    },
  );
}

function planAddLabel(ctx: IssuesContext): Plan | undefined {
  const label = ctx.labelDraft.trim();
  const id = ctx.selectedId;
  if (label === '' || id === null || ctx.labels.includes(label)) return undefined;
  return begin(
    ctx,
    nextOpId(ctx),
    { kind: 'addLabel', err: 'label', origin: 'detail', id, label },
    () => api.addLabel(id, label),
    { labels: [...ctx.labels, label], labelDraft: '' },
  );
}

function planRemoveLabel(ctx: IssuesContext, label: string): Plan | undefined {
  const id = ctx.selectedId;
  const index = ctx.labels.indexOf(label);
  if (id === null || index < 0) return undefined;
  return begin(
    ctx,
    nextOpId(ctx),
    { kind: 'removeLabel', err: 'label', origin: 'detail', id, label, index },
    () => api.removeLabel(id, label),
    { labels: ctx.labels.filter((l) => l !== label) },
  );
}

/** Applies a write's answer: the optimistic change stays on success and is undone on failure. */
function settle(ctx: IssuesContext, opId: string, outcome: Outcome): { patch: Partial<IssuesContext>; count?: number } {
  const op = ctx.ops[opId];
  const ops = { ...ctx.ops };
  delete ops[opId];
  const patch: Partial<IssuesContext> = { ops };
  if (!op) return { patch };
  const latest = ctx.errSeq[op.err] === op.seq;
  const onScreen = op.origin === 'row' || op.id === ctx.selectedId;
  const sameList = op.gen === ctx.gen;
  let count: number | undefined;

  if (outcome.ok) {
    const value = outcome.value;
    switch (op.kind) {
      case 'assign': {
        const { assignee } = value as { id: number; assignee: string };
        if (sameList) patch.items = ctx.items.map((i) => (i.id === op.id ? { ...i, assignee } : i));
        break;
      }
      case 'rename': {
        const { title } = value as { id: number; title: string };
        if (sameList) patch.items = ctx.items.map((i) => (i.id === op.id ? { ...i, title } : i));
        if (ctx.issue && ctx.issue.id === op.id) patch.issue = { ...ctx.issue, title };
        break;
      }
      case 'close':
        break;
      case 'post': {
        const comment = value as Comment;
        if (op.id === ctx.selectedId) {
          patch.comments = ctx.comments.map((c) =>
            c.key === op.key ? { key: c.key, author: comment.author, text: comment.text, pending: false } : c,
          );
        }
        break;
      }
      case 'addLabel':
      case 'removeLabel':
        if (op.id === ctx.selectedId && latest) patch.labels = value as string[];
        break;
    }
    return { patch, count };
  }

  if (latest && onScreen) patch.errors = { ...ctx.errors, [op.err]: outcome.message };
  switch (op.kind) {
    case 'assign':
      if (sameList) patch.items = ctx.items.map((i) => (i.id === op.id ? { ...i, assignee: op.prev ?? null } : i));
      break;
    case 'rename':
      if (sameList) patch.items = ctx.items.map((i) => (i.id === op.id ? { ...i, title: op.prev ?? i.title } : i));
      if (ctx.issue && ctx.issue.id === op.id) patch.issue = { ...ctx.issue, title: op.prev ?? ctx.issue.title };
      break;
    case 'close':
      if (op.item && sameList && ctx.filter === 'open' && !ctx.items.some((i) => i.id === op.id)) {
        const at = Math.min(op.index ?? ctx.items.length, ctx.items.length);
        const items = [...ctx.items.slice(0, at), op.item, ...ctx.items.slice(at)];
        patch.items = items;
        count = items.length;
      }
      break;
    case 'post':
      if (op.id === ctx.selectedId) patch.comments = ctx.comments.filter((c) => c.key !== op.key);
      break;
    case 'addLabel':
      if (op.id === ctx.selectedId && op.label !== undefined) {
        const label = op.label;
        patch.labels = ctx.labels.filter((l) => l !== label);
      }
      break;
    case 'removeLabel':
      if (op.id === ctx.selectedId && op.label !== undefined && !ctx.labels.includes(op.label)) {
        const at = Math.min(op.index ?? ctx.labels.length, ctx.labels.length);
        patch.labels = [...ctx.labels.slice(0, at), op.label, ...ctx.labels.slice(at)];
      }
      break;
  }
  return { patch, count };
}

function selectPatch(ctx: IssuesContext, id: number): Partial<IssuesContext> {
  return {
    selectedId: id,
    issue: null,
    detailError: null,
    related: [],
    relatedError: null,
    comments: [],
    commentsError: null,
    labels: [],
    labelsError: null,
    titleDraft: '',
    commentDraft: '',
    labelDraft: '',
    errors: { ...ctx.errors, assign: null, rename: null, close: null, post: null, label: null },
  };
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
    searchRelated: fromPromise<Hit[], string>(({ input }) => api.search(input)),
    runOp,
  },
}).createMachine({
  id: 'issues',
  type: 'parallel',
  context: {
    user: 'guest',
    filter: 'open',
    gen: 0,
    items: [],
    listError: null,
    selectedId: null,
    issue: null,
    detailError: null,
    related: [],
    relatedError: null,
    comments: [],
    commentsError: null,
    labels: [],
    labelsError: null,
    titleDraft: '',
    commentDraft: '',
    labelDraft: '',
    errors: { assign: null, row: null, rename: null, close: null, post: null, label: null },
    errSeq: { assign: 0, row: 0, rename: 0, close: 0, post: 0, label: 0 },
    ops: {},
    nextOp: 1,
  },
  on: {
    SET_USER: { actions: assign({ user: ({ event }) => event.value }) },
    SET_TITLE_DRAFT: { actions: assign({ titleDraft: ({ event }) => event.value }) },
    SET_COMMENT_DRAFT: { actions: assign({ commentDraft: ({ event }) => event.value }) },
    SET_LABEL_DRAFT: { actions: assign({ labelDraft: ({ event }) => event.value }) },
    ROW_ASSIGN: {
      actions: enqueueActions(({ context, event, enqueue }) => {
        const plan = planAssign(context, 'row', event.id);
        if (!plan) return;
        enqueue.assign(plan.patch);
        enqueue.spawnChild('runOp', { id: plan.opId, input: { opId: plan.opId, run: plan.run } });
      }),
    },
    ROW_CLOSE: {
      actions: enqueueActions(({ context, event, enqueue }) => {
        const plan = planClose(context, 'row', event.id);
        enqueue.assign(plan.patch);
        enqueue.spawnChild('runOp', { id: plan.opId, input: { opId: plan.opId, run: plan.run } });
        if (plan.count !== undefined) enqueue.sendParent({ type: 'OPEN_COUNT', count: plan.count });
      }),
    },
    OPEN_RELATED: {
      actions: enqueueActions(({ event, enqueue }) => {
        enqueue.sendParent({ type: 'OPEN_HELP', query: event.query, hitId: event.hitId });
      }),
    },
    OP_DONE: {
      actions: [
        enqueueActions(({ context, event, enqueue }) => {
          const settled = settle(context, event.opId, { ok: true, value: event.value });
          enqueue.assign(settled.patch);
          if (settled.count !== undefined) enqueue.sendParent({ type: 'OPEN_COUNT', count: settled.count });
        }),
        stopChild(({ event }) => event.opId),
      ],
    },
    OP_FAILED: {
      actions: [
        enqueueActions(({ context, event, enqueue }) => {
          const settled = settle(context, event.opId, { ok: false, message: event.message });
          enqueue.assign(settled.patch);
          if (settled.count !== undefined) enqueue.sendParent({ type: 'OPEN_COUNT', count: settled.count });
        }),
        stopChild(({ event }) => event.opId),
      ],
    },
  },
  states: {
    list: {
      initial: 'loading',
      on: {
        SET_FILTER: {
          guard: ({ context, event }) => event.filter !== context.filter,
          target: '.loading',
          actions: assign({
            filter: ({ event }) => event.filter,
            gen: ({ context }) => context.gen + 1,
          }),
        },
      },
      states: {
        loading: {
          entry: assign({ items: [], listError: null }),
          invoke: {
            src: 'fetchIssues',
            input: ({ context }) => context.filter,
            onDone: {
              target: 'ready',
              actions: [
                assign({ items: ({ event }) => event.output }),
                enqueueActions(({ context, event, enqueue }) => {
                  if (context.filter === 'open') enqueue.sendParent({ type: 'OPEN_COUNT', count: event.output.length });
                }),
              ],
            },
            onError: {
              target: 'failed',
              actions: assign({ listError: ({ event }) => messageOf(event.error) }),
            },
          },
        },
        ready: {},
        failed: {},
      },
    },
    selection: {
      initial: 'none',
      states: {
        none: {
          on: {
            SELECT: { target: 'selected', actions: assign(({ context, event }) => selectPatch(context, event.id)) },
          },
        },
        selected: {
          type: 'parallel',
          on: {
            SELECT: {
              guard: ({ context, event }) => event.id !== context.selectedId,
              target: 'selected',
              reenter: true,
              actions: assign(({ context, event }) => selectPatch(context, event.id)),
            },
            ASSIGN_DETAIL: {
              actions: enqueueActions(({ context, enqueue }) => {
                const id = context.selectedId;
                if (id === null) return;
                const plan = planAssign(context, 'detail', id);
                if (!plan) return;
                enqueue.assign(plan.patch);
                enqueue.spawnChild('runOp', { id: plan.opId, input: { opId: plan.opId, run: plan.run } });
              }),
            },
            CLOSE_DETAIL: {
              actions: enqueueActions(({ context, enqueue }) => {
                const id = context.selectedId;
                if (id === null) return;
                const plan = planClose(context, 'detail', id);
                enqueue.assign(plan.patch);
                enqueue.spawnChild('runOp', { id: plan.opId, input: { opId: plan.opId, run: plan.run } });
                if (plan.count !== undefined) enqueue.sendParent({ type: 'OPEN_COUNT', count: plan.count });
              }),
            },
          },
          states: {
            detail: {
              initial: 'loading',
              states: {
                loading: {
                  entry: assign({ issue: null, detailError: null }),
                  invoke: {
                    src: 'fetchIssue',
                    input: ({ context }) => context.selectedId ?? 0,
                    onDone: [
                      { guard: ({ event }) => event.output === null, target: 'notFound' },
                      {
                        target: 'ready',
                        actions: assign({ issue: ({ event }) => event.output }),
                      },
                    ],
                    onError: {
                      target: 'failed',
                      actions: assign({ detailError: ({ event }) => messageOf(event.error) }),
                    },
                  },
                },
                ready: {
                  initial: 'searching',
                  on: {
                    RETRY: { target: 'loading' },
                    RENAME: {
                      actions: enqueueActions(({ context, enqueue }) => {
                        const plan = planRename(context);
                        if (!plan) return;
                        enqueue.assign(plan.patch);
                        enqueue.spawnChild('runOp', { id: plan.opId, input: { opId: plan.opId, run: plan.run } });
                      }),
                    },
                  },
                  states: {
                    searching: {
                      entry: assign({ related: [], relatedError: null }),
                      invoke: {
                        src: 'searchRelated',
                        input: ({ context }) => context.issue?.title ?? '',
                        onDone: {
                          target: 'found',
                          actions: assign({ related: ({ event }) => event.output.slice(0, 3) }),
                        },
                        onError: {
                          target: 'failed',
                          actions: assign({ relatedError: ({ event }) => messageOf(event.error) }),
                        },
                      },
                    },
                    found: {},
                    failed: {},
                  },
                },
                notFound: { on: { RETRY: { target: 'loading' } } },
                failed: { on: { RETRY: { target: 'loading' } } },
              },
            },
            comments: {
              initial: 'loading',
              states: {
                loading: {
                  entry: assign({ comments: [], commentsError: null }),
                  invoke: {
                    src: 'fetchComments',
                    input: ({ context }) => context.selectedId ?? 0,
                    onDone: {
                      target: 'ready',
                      actions: assign({
                        comments: ({ event }) =>
                          event.output.map((c, i) => ({ key: `c${i}`, author: c.author, text: c.text, pending: false })),
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
                      actions: enqueueActions(({ context, enqueue }) => {
                        const plan = planPost(context);
                        if (!plan) return;
                        enqueue.assign(plan.patch);
                        enqueue.spawnChild('runOp', { id: plan.opId, input: { opId: plan.opId, run: plan.run } });
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
                  entry: assign({ labels: [], labelsError: null }),
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
                      actions: enqueueActions(({ context, enqueue }) => {
                        const plan = planAddLabel(context);
                        if (!plan) return;
                        enqueue.assign(plan.patch);
                        enqueue.spawnChild('runOp', { id: plan.opId, input: { opId: plan.opId, run: plan.run } });
                      }),
                    },
                    REMOVE_LABEL: {
                      actions: enqueueActions(({ context, event, enqueue }) => {
                        const plan = planRemoveLabel(context, event.label);
                        if (!plan) return;
                        enqueue.assign(plan.patch);
                        enqueue.spawnChild('runOp', { id: plan.opId, input: { opId: plan.opId, run: plan.run } });
                      }),
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
