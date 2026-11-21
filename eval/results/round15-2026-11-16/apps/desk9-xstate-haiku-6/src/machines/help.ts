import { assign, fromPromise, setup } from 'xstate';
import * as api from '../api.js';
import type { Hit, Item } from '../api.js';
import { errorMessage } from './ops.js';

export type HelpInput = { query: string; hitId: number | null };

export type HelpContext = {
  query: string;
  hits: Hit[];
  resultsFor: string;
  searchError: string;
  selectedId: number | null;
  item: Item | null;
  itemError: string;
};

export type HelpEvent = { type: 'TYPE'; value: string } | { type: 'SELECT_HIT'; id: number } | { type: 'RETRY_ITEM' };

/** The help page. Opening it from a related hit starts it with that query and hit already chosen. */
export const helpMachine = setup({
  types: {
    context: {} as HelpContext,
    events: {} as HelpEvent,
    input: {} as HelpInput,
  },
  actions: {
    setQuery: assign(({ event }) => (event.type === 'TYPE' ? { query: event.value } : {})),
    selectHit: assign(({ event }) => (event.type === 'SELECT_HIT' ? { selectedId: event.id } : {})),
  },
  guards: {
    longEnough: ({ event }) => event.type === 'TYPE' && event.value.length >= 2,
    oneChar: ({ event }) => event.type === 'TYPE' && event.value.length === 1,
  },
  actors: {
    searchHelp: fromPromise<Hit[], { q: string }>(({ input }) => api.search(input.q)),
    loadItem: fromPromise<Item | null, { id: number }>(({ input }) => api.fetchItem(input.id)),
  },
}).createMachine({
  id: 'help',
  type: 'parallel',
  context: ({ input }) => ({
    query: input.query,
    hits: [],
    resultsFor: '',
    searchError: '',
    selectedId: input.hitId,
    item: null,
    itemError: '',
  }),
  states: {
    // Every query state carries the same TYPE handling on its own node, so a new
    // query restarts the search without re-entering the page's other regions.
    search: {
      initial: 'idle',
      states: {
        idle: {
          always: [
            { guard: ({ context }) => context.query.length >= 2, target: 'searching' },
            { guard: ({ context }) => context.query.length === 1, target: 'tooShort' },
          ],
          on: {
            TYPE: [
              { guard: 'longEnough', target: 'searching', reenter: true, actions: 'setQuery' },
              { guard: 'oneChar', target: 'tooShort', actions: 'setQuery' },
              { target: 'idle', actions: 'setQuery' },
            ],
          },
        },
        tooShort: {
          on: {
            TYPE: [
              { guard: 'longEnough', target: 'searching', reenter: true, actions: 'setQuery' },
              { guard: 'oneChar', target: 'tooShort', reenter: true, actions: 'setQuery' },
              { target: 'idle', actions: 'setQuery' },
            ],
          },
        },
        searching: {
          invoke: {
            src: 'searchHelp',
            input: ({ context }) => ({ q: context.query }),
            onDone: {
              target: 'results',
              actions: assign({
                hits: ({ event }) => event.output,
                resultsFor: ({ context }) => context.query,
              }),
            },
            onError: {
              target: 'failed',
              actions: assign({ searchError: ({ event }) => errorMessage(event.error) }),
            },
          },
          on: {
            TYPE: [
              { guard: 'longEnough', target: 'searching', reenter: true, actions: 'setQuery' },
              { guard: 'oneChar', target: 'tooShort', actions: 'setQuery' },
              { target: 'idle', actions: 'setQuery' },
            ],
          },
        },
        results: {
          on: {
            TYPE: [
              { guard: 'longEnough', target: 'searching', reenter: true, actions: 'setQuery' },
              { guard: 'oneChar', target: 'tooShort', actions: 'setQuery' },
              { target: 'idle', actions: 'setQuery' },
            ],
          },
        },
        failed: {
          on: {
            TYPE: [
              { guard: 'longEnough', target: 'searching', reenter: true, actions: 'setQuery' },
              { guard: 'oneChar', target: 'tooShort', actions: 'setQuery' },
              { target: 'idle', actions: 'setQuery' },
            ],
          },
        },
      },
    },
    item: {
      initial: 'none',
      states: {
        none: {
          always: { guard: ({ context }) => context.selectedId !== null, target: 'loading' },
          on: { SELECT_HIT: { target: 'loading', actions: 'selectHit' } },
        },
        loading: {
          invoke: {
            src: 'loadItem',
            input: ({ context }) => ({ id: context.selectedId as number }),
            onDone: [
              {
                guard: ({ event }) => event.output !== null,
                target: 'shown',
                actions: assign({ item: ({ event }) => event.output }),
              },
              { target: 'notFound' },
            ],
            onError: {
              target: 'failed',
              actions: assign({ itemError: ({ event }) => errorMessage(event.error) }),
            },
          },
          on: { SELECT_HIT: { target: 'loading', reenter: true, actions: 'selectHit' } },
        },
        shown: {
          on: { SELECT_HIT: { target: 'loading', actions: 'selectHit' } },
        },
        notFound: {
          on: { SELECT_HIT: { target: 'loading', actions: 'selectHit' } },
        },
        failed: {
          on: {
            SELECT_HIT: { target: 'loading', actions: 'selectHit' },
            RETRY_ITEM: { target: 'loading' },
          },
        },
      },
    },
  },
});
