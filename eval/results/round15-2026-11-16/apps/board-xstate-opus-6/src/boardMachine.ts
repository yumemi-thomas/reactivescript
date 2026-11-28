import { and, assign, enqueueActions, fromPromise, setup, stateIn } from 'xstate';
import * as api from './api';
import type { Card, Column, Item } from './api';
import {
  confirmOp,
  deriveWorld,
  emptyWorld,
  findCard,
  moveTarget,
  toViewCard,
  toViewItem,
  type ColStatus,
  type Dir,
  type Op,
  type World,
} from './boardModel';
import { errorMessage, requestMachine, type Request, type RequestEvent } from './request';

type Errors = {
  move: string | null;
  add: string | null;
  archive: string | null;
  rename: string | null;
  item: string | null;
};

export type BoardContext = {
  /** the board as the server has it (accepted changes folded in) */
  base: World;
  /** changes shown at once and not yet folded into `base`, oldest first */
  ops: Op[];
  nextOpId: number;
  colStatus: Record<Column, ColStatus>;
  colError: Record<Column, string | null>;
  selected: number | null;
  checklistError: string | null;
  drafts: { newCard: string; title: string; item: string };
  errors: Errors;
};

export type BoardEvent =
  | { type: 'retry'; column: Column }
  | { type: 'move'; cardId: number; dir: Dir }
  | { type: 'draft.newCard'; value: string }
  | { type: 'add' }
  | { type: 'select'; cardId: number }
  | { type: 'draft.title'; value: string }
  | { type: 'rename' }
  | { type: 'archive' }
  | { type: 'toggle'; itemId: number }
  | { type: 'draft.item'; value: string }
  | { type: 'addItem' }
  | RequestEvent;

type OpDraft = Op extends infer O ? (O extends Op ? Omit<O, 'opId' | 'ok' | 'newId'> : never) : never;

/** selecting a card (again) restarts its checklist load; the transition sits on each child so only the detail region is re-entered */
const selectTransition = { guard: 'canSelect', target: 'loading', reenter: true, actions: 'selectCard' } as const;

const noErrors: Errors = { move: null, add: null, archive: null, rename: null, item: null };

export const boardMachine = setup({
  types: {
    context: {} as BoardContext,
    events: {} as BoardEvent,
  },
  actors: {
    fetchCards: fromPromise<Card[], Column>(({ input }) => api.fetchCards(input)),
    fetchChecklist: fromPromise<Item[], number>(({ input }) => api.fetchChecklist(input)),
    request: requestMachine,
  },
  actions: {
    columnLoading: assign(({ context }, params: { column: Column }) => ({
      colStatus: { ...context.colStatus, [params.column]: 'loading' },
      colError: { ...context.colError, [params.column]: null },
    })),
    columnLoaded: assign(({ context }, params: { column: Column; cards: Card[] }) => ({
      colStatus: { ...context.colStatus, [params.column]: 'ready' },
      base: { ...context.base, cols: { ...context.base.cols, [params.column]: params.cards.map(toViewCard) } },
    })),
    columnFailed: assign(({ context }, params: { column: Column; error: unknown }) => ({
      colStatus: { ...context.colStatus, [params.column]: 'failed' },
      colError: { ...context.colError, [params.column]: errorMessage(params.error) },
    })),
    checklistLoaded: assign(({ context }, params: { items: Item[] }) => {
      if (context.selected === null) return {};
      return {
        checklistError: null,
        base: { ...context.base, lists: { ...context.base.lists, [context.selected]: params.items.map(toViewItem) } },
      };
    }),
    checklistFailed: assign((_, params: { error: unknown }) => ({ checklistError: errorMessage(params.error) })),
    selectCard: assign(({ context, event }) => {
      if (event.type !== 'select') return {};
      return {
        selected: event.cardId,
        checklistError: null,
        drafts: { ...context.drafts, title: '', item: '' },
        errors: { ...context.errors, rename: null, item: null },
      };
    }),
    /** shows a change at once and sends its request */
    startOp: enqueueActions(({ context, enqueue }, params: { op: OpDraft; request: Request; clear: keyof Errors }) => {
      const opId = context.nextOpId;
      enqueue.assign({
        nextOpId: opId + 1,
        ops: [...context.ops, { ...params.op, opId, ok: false, newId: null } as Op],
        errors: { ...context.errors, [params.clear]: null },
      });
      enqueue.spawnChild('request', { id: `op-${opId}`, input: { opId, request: params.request } });
    }),
  },
  guards: {
    isColumn: ({ event }, params: { column: Column }) => event.type === 'retry' && event.column === params.column,
    canSelect: ({ context, event }) => {
      if (event.type !== 'select' || event.cardId === context.selected) return false;
      const world = deriveWorld(context.base, context.ops);
      const at = findCard(world.cols, event.cardId);
      return at !== null && !world.cols[at.column][at.index].adding;
    },
    hasSelection: ({ context }) => context.selected !== null,
  },
}).createMachine({
  id: 'board',
  type: 'parallel',
  context: {
    base: emptyWorld,
    ops: [],
    nextOpId: 1,
    colStatus: { todo: 'loading', doing: 'loading', done: 'loading' },
    colError: { todo: null, doing: null, done: null },
    selected: null,
    checklistError: null,
    drafts: { newCard: '', title: '', item: '' },
    errors: noErrors,
  },
  on: {
    'op.ok': {
      actions: assign(({ context, event }) => confirmOp(context.base, context.ops, event.opId, event.newId)),
    },
    'op.fail': {
      actions: assign(({ context, event }) => {
        const op = context.ops.find((o) => o.opId === event.opId);
        if (!op) return {};
        const ops = context.ops.filter((o) => o.opId !== event.opId);
        const message = event.message;
        switch (op.kind) {
          case 'move':
            return { ops, errors: { ...context.errors, move: `move error: ${message}` } };
          case 'add':
            return { ops, errors: { ...context.errors, add: `add error: ${message}` } };
          case 'archive':
            return { ops, errors: { ...context.errors, archive: `archive error: ${message}` } };
          case 'rename':
            return {
              ops,
              errors:
                context.selected === op.cardId ? { ...context.errors, rename: `rename error: ${message}` } : context.errors,
            };
          case 'toggle':
          case 'addItem':
            return {
              ops,
              errors: context.selected === op.cardId ? { ...context.errors, item: `item error: ${message}` } : context.errors,
            };
        }
      }),
    },
    move: {
      actions: enqueueActions(({ context, event, enqueue }) => {
        const world = deriveWorld(context.base, context.ops);
        const target = moveTarget(world, context.colStatus, event.cardId, event.dir);
        if (target.kind !== 'ok') return;
        enqueue({
          type: 'startOp',
          params: {
            op: { kind: 'move', cardId: event.cardId, to: target.to, index: target.index },
            request: { kind: 'moveCard', id: event.cardId, column: target.to, index: target.index },
            clear: 'move',
          },
        });
      }),
    },
    'draft.newCard': {
      actions: assign(({ context, event }) => ({ drafts: { ...context.drafts, newCard: event.value } })),
    },
    add: {
      actions: enqueueActions(({ context, enqueue }) => {
        const title = context.drafts.newCard.trim();
        if (!title || context.colStatus.todo !== 'ready') return;
        enqueue.assign({ drafts: { ...context.drafts, newCard: '' } });
        enqueue({
          type: 'startOp',
          params: {
            op: { kind: 'add', title },
            request: { kind: 'addCard', column: 'todo', title },
            clear: 'add',
          },
        });
      }),
    },
    'draft.title': {
      actions: assign(({ context, event }) => ({ drafts: { ...context.drafts, title: event.value } })),
    },
    'draft.item': {
      actions: assign(({ context, event }) => ({ drafts: { ...context.drafts, item: event.value } })),
    },
    rename: {
      guard: 'hasSelection',
      actions: enqueueActions(({ context, enqueue }) => {
        const title = context.drafts.title.trim();
        const id = context.selected;
        if (!title || id === null) return;
        enqueue({
          type: 'startOp',
          params: {
            op: { kind: 'rename', cardId: id, title },
            request: { kind: 'renameCard', id, title },
            clear: 'rename',
          },
        });
      }),
    },
  },
  states: {
    todo: {
      initial: 'loading',
      states: {
        loading: {
          entry: { type: 'columnLoading', params: { column: 'todo' } },
          invoke: {
            src: 'fetchCards',
            input: 'todo',
            onDone: { target: 'ready', actions: { type: 'columnLoaded', params: ({ event }) => ({ column: 'todo', cards: event.output }) } },
            onError: { target: 'failed', actions: { type: 'columnFailed', params: ({ event }) => ({ column: 'todo', error: event.error }) } },
          },
        },
        ready: {},
        failed: { on: { retry: { guard: { type: 'isColumn', params: { column: 'todo' } }, target: 'loading' } } },
      },
    },
    doing: {
      initial: 'loading',
      states: {
        loading: {
          entry: { type: 'columnLoading', params: { column: 'doing' } },
          invoke: {
            src: 'fetchCards',
            input: 'doing',
            onDone: { target: 'ready', actions: { type: 'columnLoaded', params: ({ event }) => ({ column: 'doing', cards: event.output }) } },
            onError: { target: 'failed', actions: { type: 'columnFailed', params: ({ event }) => ({ column: 'doing', error: event.error }) } },
          },
        },
        ready: {},
        failed: { on: { retry: { guard: { type: 'isColumn', params: { column: 'doing' } }, target: 'loading' } } },
      },
    },
    done: {
      initial: 'loading',
      states: {
        loading: {
          entry: { type: 'columnLoading', params: { column: 'done' } },
          invoke: {
            src: 'fetchCards',
            input: 'done',
            onDone: { target: 'ready', actions: { type: 'columnLoaded', params: ({ event }) => ({ column: 'done', cards: event.output }) } },
            onError: { target: 'failed', actions: { type: 'columnFailed', params: ({ event }) => ({ column: 'done', error: event.error }) } },
          },
        },
        ready: {},
        failed: { on: { retry: { guard: { type: 'isColumn', params: { column: 'done' } }, target: 'loading' } } },
      },
    },
    detail: {
      initial: 'none',
      on: {
        archive: {
          guard: 'hasSelection',
          target: '.none',
          actions: enqueueActions(({ context, enqueue }) => {
            const id = context.selected;
            if (id === null) return;
            enqueue.assign({
              selected: null,
              checklistError: null,
              drafts: { ...context.drafts, title: '', item: '' },
              errors: { ...context.errors, rename: null, item: null },
            });
            enqueue({
              type: 'startOp',
              params: { op: { kind: 'archive', cardId: id }, request: { kind: 'archiveCard', id }, clear: 'archive' },
            });
          }),
        },
      },
      states: {
        none: { on: { select: selectTransition } },
        loading: {
          on: { select: selectTransition },
          invoke: {
            src: 'fetchChecklist',
            input: ({ context }) => context.selected ?? 0,
            onDone: { target: 'ready', actions: { type: 'checklistLoaded', params: ({ event }) => ({ items: event.output }) } },
            onError: { target: 'failed', actions: { type: 'checklistFailed', params: ({ event }) => ({ error: event.error }) } },
          },
        },
        ready: {
          on: {
            select: selectTransition,
            toggle: {
              actions: enqueueActions(({ context, event, enqueue }) => {
                const cardId = context.selected;
                if (cardId === null) return;
                const world = deriveWorld(context.base, context.ops);
                const item = world.lists[cardId]?.find((i) => i.id === event.itemId);
                if (!item || item.adding) return;
                const done = !item.done;
                enqueue({
                  type: 'startOp',
                  params: {
                    op: { kind: 'toggle', cardId, itemId: event.itemId, done },
                    request: { kind: 'toggleItem', cardId, itemId: event.itemId, done },
                    clear: 'item',
                  },
                });
              }),
            },
            addItem: {
              guard: and(['hasSelection', stateIn({ detail: 'ready' })]),
              actions: enqueueActions(({ context, enqueue }) => {
                const cardId = context.selected;
                const text = context.drafts.item.trim();
                if (cardId === null || !text) return;
                enqueue.assign({ drafts: { ...context.drafts, item: '' } });
                enqueue({
                  type: 'startOp',
                  params: {
                    op: { kind: 'addItem', cardId, text },
                    request: { kind: 'addItem', cardId, text },
                    clear: 'item',
                  },
                });
              }),
            },
          },
        },
        failed: { on: { select: selectTransition } },
      },
    },
  },
});
