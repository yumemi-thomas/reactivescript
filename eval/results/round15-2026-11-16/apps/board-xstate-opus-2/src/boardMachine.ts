import { assign, enqueueActions, fromPromise, setup } from 'xstate';
import * as api from './api.js';
import type { Card, Column, Item } from './api.js';
import { errorMessage, opMachine, type OpEvent, type Request } from './ops';
import {
  applyAccepted,
  boardView,
  checklistView,
  findCard,
  moveTarget,
  type BoardOp,
  type Columns,
  type Dir,
} from './boardModel';

export type BoardContext = {
  /** Cards as the server last confirmed them. */
  cards: Columns;
  columnErrors: Record<Column, string | null>;
  /** Writes shown on screen that the server has not answered yet, oldest first. */
  ops: BoardOp[];
  nextOp: number;
  selectedId: number | null;
  /** The selected card's checklist as the server last confirmed it; null until it loads. */
  items: Item[] | null;
  checklistError: string | null;
  newCard: string;
  titleInput: string;
  itemInput: string;
  moveError: string | null;
  addError: string | null;
  archiveError: string | null;
  renameError: string | null;
  itemError: string | null;
};

export type BoardEvent =
  | { type: 'column.retry'; column: Column }
  | { type: 'card.move'; id: number; dir: Dir }
  | { type: 'newCard.change'; value: string }
  | { type: 'card.add' }
  | { type: 'card.select'; id: number }
  | { type: 'title.change'; value: string }
  | { type: 'card.rename' }
  | { type: 'card.archive' }
  | { type: 'item.toggle'; itemId: number }
  | { type: 'itemInput.change'; value: string }
  | { type: 'item.add' }
  | OpEvent;

type OpDraft = BoardOp extends infer T ? (T extends BoardOp ? Omit<T, 'opId'> : never) : never;

function toRequest(op: BoardOp): Request {
  switch (op.type) {
    case 'moveCard':
      return { type: op.type, id: op.id, column: op.column, index: op.index };
    case 'renameCard':
      return { type: op.type, id: op.id, title: op.title };
    case 'addCard':
      return { type: op.type, column: op.column, title: op.title };
    case 'archiveCard':
      return { type: op.type, id: op.id };
    case 'toggleItem':
      return { type: op.type, cardId: op.cardId, itemId: op.itemId, done: op.done };
    case 'addItem':
      return { type: op.type, cardId: op.cardId, text: op.text };
  }
}

const initialContext: BoardContext = {
  cards: { todo: null, doing: null, done: null },
  columnErrors: { todo: null, doing: null, done: null },
  ops: [],
  nextOp: 0,
  selectedId: null,
  items: null,
  checklistError: null,
  newCard: '',
  titleInput: '',
  itemInput: '',
  moveError: null,
  addError: null,
  archiveError: null,
  renameError: null,
  itemError: null,
};

export const boardMachine = setup({
  types: {
    context: {} as BoardContext,
    events: {} as BoardEvent,
  },
  actors: {
    fetchCards: fromPromise<Card[], Column>(({ input }) => api.fetchCards(input)),
    fetchChecklist: fromPromise<Item[], number>(({ input }) => api.fetchChecklist(input)),
    op: opMachine,
  },
  actions: {
    /** Records a write as pending (so the board shows it at once) and sends it to the server. */
    startOp: enqueueActions(({ context, enqueue }, draft: OpDraft) => {
      const opId = `op-${context.nextOp}`;
      const op = { ...draft, opId } as BoardOp;
      enqueue.assign({ ops: [...context.ops, op], nextOp: context.nextOp + 1 });
      enqueue.spawnChild('op', { id: opId, input: { opId, request: toRequest(op) } });
    }),
  },
  guards: {
    isOtherCard: ({ context, event }) =>
      event.type === 'card.select' &&
      event.id !== context.selectedId &&
      findCard(boardView(context.cards, context.ops), event.id) !== null,
    hasSelection: ({ context }) => context.selectedId !== null,
  },
}).createMachine({
  id: 'board',
  context: initialContext,
  type: 'parallel',
  states: {
    todo: {
      initial: 'loading',
      states: {
        loading: {
          entry: assign({ columnErrors: ({ context }) => ({ ...context.columnErrors, todo: null }) }),
          invoke: {
            src: 'fetchCards',
            input: 'todo' as const,
            onDone: {
              target: 'ready',
              actions: assign({ cards: ({ context, event }) => ({ ...context.cards, todo: event.output }) }),
            },
            onError: {
              target: 'failed',
              actions: assign({
                columnErrors: ({ context, event }) => ({ ...context.columnErrors, todo: errorMessage(event.error) }),
              }),
            },
          },
        },
        failed: {
          on: { 'column.retry': { guard: ({ event }) => event.column === 'todo', target: 'loading' } },
        },
        ready: {},
      },
    },
    doing: {
      initial: 'loading',
      states: {
        loading: {
          entry: assign({ columnErrors: ({ context }) => ({ ...context.columnErrors, doing: null }) }),
          invoke: {
            src: 'fetchCards',
            input: 'doing' as const,
            onDone: {
              target: 'ready',
              actions: assign({ cards: ({ context, event }) => ({ ...context.cards, doing: event.output }) }),
            },
            onError: {
              target: 'failed',
              actions: assign({
                columnErrors: ({ context, event }) => ({ ...context.columnErrors, doing: errorMessage(event.error) }),
              }),
            },
          },
        },
        failed: {
          on: { 'column.retry': { guard: ({ event }) => event.column === 'doing', target: 'loading' } },
        },
        ready: {},
      },
    },
    done: {
      initial: 'loading',
      states: {
        loading: {
          entry: assign({ columnErrors: ({ context }) => ({ ...context.columnErrors, done: null }) }),
          invoke: {
            src: 'fetchCards',
            input: 'done' as const,
            onDone: {
              target: 'ready',
              actions: assign({ cards: ({ context, event }) => ({ ...context.cards, done: event.output }) }),
            },
            onError: {
              target: 'failed',
              actions: assign({
                columnErrors: ({ context, event }) => ({ ...context.columnErrors, done: errorMessage(event.error) }),
              }),
            },
          },
        },
        failed: {
          on: { 'column.retry': { guard: ({ event }) => event.column === 'done', target: 'loading' } },
        },
        ready: {},
      },
    },
    detail: {
      initial: 'none',
      on: {
        'card.select': {
          guard: 'isOtherCard',
          target: '.selected',
          reenter: true,
          actions: assign({
            selectedId: ({ event }) => event.id,
            items: null,
            checklistError: null,
            titleInput: '',
            itemInput: '',
            renameError: null,
            itemError: null,
          }),
        },
        'card.archive': {
          guard: 'hasSelection',
          target: '.none',
          actions: enqueueActions(({ context, enqueue }) => {
            const id = context.selectedId;
            if (id === null) return;
            enqueue.assign({
              selectedId: null,
              items: null,
              checklistError: null,
              titleInput: '',
              itemInput: '',
              renameError: null,
              itemError: null,
              archiveError: null,
            });
            enqueue({ type: 'startOp', params: { type: 'archiveCard', id } });
          }),
        },
      },
      states: {
        none: {},
        selected: {
          initial: 'loading',
          states: {
            loading: {
              invoke: {
                src: 'fetchChecklist',
                input: ({ context }) => context.selectedId ?? -1,
                onDone: { target: 'ready', actions: assign({ items: ({ event }) => event.output }) },
                onError: {
                  target: 'failed',
                  actions: assign({ checklistError: ({ event }) => errorMessage(event.error) }),
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
  on: {
    'newCard.change': { actions: assign({ newCard: ({ event }) => event.value }) },
    'title.change': { actions: assign({ titleInput: ({ event }) => event.value }) },
    'itemInput.change': { actions: assign({ itemInput: ({ event }) => event.value }) },

    'card.move': {
      actions: enqueueActions(({ context, event, enqueue }) => {
        const view = boardView(context.cards, context.ops);
        const target = moveTarget(view, event.id, event.dir);
        if (target.column === undefined) return;
        enqueue.assign({ moveError: null });
        enqueue({
          type: 'startOp',
          params: { type: 'moveCard', id: event.id, column: target.column, index: target.index },
        });
      }),
    },

    'card.add': {
      actions: enqueueActions(({ context, enqueue }) => {
        const title = context.newCard.trim();
        if (!title || context.cards.todo === null) return;
        enqueue.assign({ newCard: '', addError: null });
        enqueue({ type: 'startOp', params: { type: 'addCard', column: 'todo', title } });
      }),
    },

    'card.rename': {
      actions: enqueueActions(({ context, enqueue }) => {
        const title = context.titleInput.trim();
        const id = context.selectedId;
        if (!title || id === null) return;
        enqueue.assign({ renameError: null });
        enqueue({ type: 'startOp', params: { type: 'renameCard', id, title } });
      }),
    },

    'item.toggle': {
      actions: enqueueActions(({ context, event, enqueue }) => {
        const cardId = context.selectedId;
        if (cardId === null) return;
        const rows = checklistView(context.items, context.ops, cardId);
        const row = rows?.find(r => r.kind === 'item' && r.item.id === event.itemId);
        if (!row || row.kind !== 'item') return;
        const done = !row.item.done;
        enqueue.assign({ itemError: null });
        enqueue({
          type: 'startOp',
          params: { type: 'toggleItem', cardId, itemId: event.itemId, done, delta: done ? 1 : -1 },
        });
      }),
    },

    'item.add': {
      actions: enqueueActions(({ context, enqueue }) => {
        const text = context.itemInput.trim();
        const cardId = context.selectedId;
        if (!text || cardId === null) return;
        enqueue.assign({ itemInput: '', itemError: null });
        enqueue({ type: 'startOp', params: { type: 'addItem', cardId, text } });
      }),
    },

    'op.done': {
      actions: assign(({ context, event }) => {
        const op = context.ops.find(o => o.opId === event.opId);
        if (!op) return {};
        const ops = context.ops.filter(o => o !== op);
        const cards = applyAccepted(context.cards, op, event.output);
        let items = context.items;
        if (items && context.selectedId !== null) {
          if (op.type === 'toggleItem' && op.cardId === context.selectedId) {
            const out = event.output as { id?: number; done?: boolean } | null;
            const done = typeof out?.done === 'boolean' ? out.done : op.done;
            items = items.map(item => (item.id === op.itemId ? { ...item, done } : item));
          } else if (op.type === 'addItem' && op.cardId === context.selectedId) {
            const out = event.output as Item;
            if (!items.some(item => item.id === out.id)) {
              items = [...items, { id: out.id, text: out.text ?? op.text, done: Boolean(out.done) }];
            }
          }
        }
        return { ops, cards, items };
      }),
    },

    'op.failed': {
      actions: assign(({ context, event }) => {
        const op = context.ops.find(o => o.opId === event.opId);
        if (!op) return {};
        const ops = context.ops.filter(o => o !== op);
        switch (op.type) {
          case 'moveCard':
            return { ops, moveError: event.message };
          case 'addCard':
            return { ops, addError: event.message };
          case 'archiveCard':
            return { ops, archiveError: event.message };
          case 'renameCard':
            return op.id === context.selectedId ? { ops, renameError: event.message } : { ops };
          case 'toggleItem':
          case 'addItem':
            return op.cardId === context.selectedId ? { ops, itemError: event.message } : { ops };
        }
      }),
    },
  },
});
