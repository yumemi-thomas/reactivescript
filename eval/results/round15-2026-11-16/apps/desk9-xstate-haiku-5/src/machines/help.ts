import { assign, fromPromise, setup } from 'xstate';
import * as api from '../api';
import type { Hit, Item } from '../api';
import { messageOf } from './shared';

export type HelpInput = { query: string; hitId: number | null };

type HelpContext = {
  query: string;
  hits: Hit[];
  hitsFor: string;
  searchError: string | null;
  selectedId: number | null;
  item: Item | null;
  itemError: string | null;
};

type HelpEvent = { type: 'SET_QUERY'; value: string } | { type: 'SELECT_HIT'; id: number } | { type: 'RETRY_ITEM' };

/** The help page: a search region and an item region, both started from the page's input. */
export const helpMachine = setup({
  types: {
    context: {} as HelpContext,
    events: {} as HelpEvent,
    input: {} as HelpInput,
  },
  actors: {
    searchHits: fromPromise<Hit[], string>(({ input }) => api.search(input)),
    fetchItem: fromPromise<Item | null, number>(({ input }) => api.fetchItem(input)),
  },
}).createMachine({
  id: 'help',
  type: 'parallel',
  context: ({ input }) => ({
    query: input.query,
    hits: [],
    hitsFor: '',
    searchError: null,
    selectedId: input.hitId,
    item: null,
    itemError: null,
  }),
  states: {
    search: {
      initial: 'start',
      on: {
        SET_QUERY: [
          {
            guard: ({ event }) => event.value.length >= 2,
            target: '.searching',
            actions: assign({ query: ({ event }) => event.value }),
          },
          {
            target: '.idle',
            actions: assign({ query: ({ event }) => event.value }),
          },
        ],
      },
      states: {
        start: {
          always: [
            { guard: ({ context }) => context.query.length >= 2, target: 'searching' },
            { target: 'idle' },
          ],
        },
        idle: {
          entry: assign({ hits: [], hitsFor: '', searchError: null }),
        },
        searching: {
          entry: assign({ searchError: null }),
          invoke: {
            src: 'searchHits',
            input: ({ context }) => context.query,
            onDone: {
              target: 'done',
              actions: assign({
                hits: ({ event }) => event.output,
                hitsFor: ({ context }) => context.query,
              }),
            },
            onError: {
              target: 'failed',
              actions: assign({
                hits: [],
                searchError: ({ event }) => messageOf(event.error),
              }),
            },
          },
        },
        done: {},
        failed: {},
      },
    },
    item: {
      initial: 'start',
      on: {
        SELECT_HIT: {
          target: '.loading',
          actions: assign({ selectedId: ({ event }) => event.id }),
        },
      },
      states: {
        start: {
          always: [
            { guard: ({ context }) => context.selectedId !== null, target: 'loading' },
            { target: 'nothing' },
          ],
        },
        nothing: {},
        loading: {
          entry: assign({ item: null, itemError: null }),
          invoke: {
            src: 'fetchItem',
            input: ({ context }) => context.selectedId ?? 0,
            onDone: [
              { guard: ({ event }) => event.output === null, target: 'notFound' },
              {
                target: 'shown',
                actions: assign({ item: ({ event }) => event.output }),
              },
            ],
            onError: {
              target: 'failed',
              actions: assign({ itemError: ({ event }) => messageOf(event.error) }),
            },
          },
        },
        shown: {},
        notFound: {},
        failed: {
          on: { RETRY_ITEM: { target: 'loading' } },
        },
      },
    },
  },
});
