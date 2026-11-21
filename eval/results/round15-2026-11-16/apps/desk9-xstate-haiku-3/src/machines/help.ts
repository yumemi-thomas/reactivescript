import { assign, enqueueActions, fromPromise, setup } from 'xstate';
import * as api from '../api.js';
import type { Hit, Item } from '../api.js';
import { messageOf } from '../errors.js';

export type HelpInput = { query: string; hitId?: number };

export type HelpContext = {
  query: string;
  hits: Hit[];
  /** a hit to select as soon as the search for `query` lands (opened from a related hit) */
  pendingHit: number | undefined;
  selectedId: number | undefined;
  searchError: string;
  item: Item | undefined;
  itemError: string;
};

export type HelpEvent =
  | { type: 'QUERY'; value: string }
  | { type: 'SELECT_HIT'; id: number }
  | { type: 'RETRY_ITEM' };

const selectPatch = (id: number): Partial<HelpContext> => ({ selectedId: id, item: undefined, itemError: '' });

/**
 * The help page: a search over the catalogue, and the item of the selected hit.
 * Restarts of a request are done on the leaf state that owns it (reenter on the
 * leaf), so that typing or selecting never resets the other region.
 */
export const helpMachine = setup({
  types: {
    context: {} as HelpContext,
    events: {} as HelpEvent,
    input: {} as HelpInput,
  },
  actors: {
    search: fromPromise<Hit[], string>(({ input }) => api.search(input)),
    fetchItem: fromPromise<Item | null, number>(({ input }) => api.fetchItem(input)),
  },
}).createMachine({
  id: 'help',
  type: 'parallel',
  context: ({ input }) => ({
    query: input.query,
    hits: [],
    pendingHit: input.hitId,
    selectedId: undefined,
    searchError: '',
    item: undefined,
    itemError: '',
  }),
  states: {
    results: {
      initial: 'start',
      on: {
        QUERY: [
          {
            guard: ({ event }) => event.value.length >= 2,
            target: '.searching',
            actions: assign({ query: ({ event }) => event.value }),
          },
          {
            guard: ({ event }) => event.value.length === 1,
            target: '.tooShort',
            actions: assign({ query: ({ event }) => event.value, hits: [], searchError: '' }),
          },
          {
            target: '.idle',
            actions: assign({ query: ({ event }) => event.value, hits: [], searchError: '' }),
          },
        ],
      },
      states: {
        start: {
          always: [
            { guard: ({ context }) => context.query.length >= 2, target: 'searching' },
            { guard: ({ context }) => context.query.length === 1, target: 'tooShort' },
            { target: 'idle' },
          ],
        },
        idle: {},
        tooShort: {},
        searching: {
          invoke: {
            src: 'search',
            input: ({ context }) => context.query,
            onDone: {
              target: 'ready',
              actions: enqueueActions(({ context, event, enqueue }) => {
                enqueue.assign({ hits: event.output, searchError: '', pendingHit: undefined });
                if (context.pendingHit !== undefined) {
                  enqueue.raise({ type: 'SELECT_HIT', id: context.pendingHit });
                }
              }),
            },
            onError: {
              target: 'failed',
              actions: assign({ searchError: ({ event }) => messageOf(event.error) }),
            },
          },
          on: {
            // a new query while searching restarts the search; the old hits stay on screen
            QUERY: [
              {
                guard: ({ event }) => event.value.length >= 2,
                target: 'searching',
                reenter: true,
                actions: assign({ query: ({ event }) => event.value }),
              },
              {
                guard: ({ event }) => event.value.length === 1,
                target: 'tooShort',
                actions: assign({ query: ({ event }) => event.value, hits: [], searchError: '' }),
              },
              {
                target: 'idle',
                actions: assign({ query: ({ event }) => event.value, hits: [], searchError: '' }),
              },
            ],
          },
        },
        ready: {},
        failed: {},
      },
    },
    pane: {
      initial: 'none',
      on: {
        SELECT_HIT: {
          target: '.loading',
          actions: assign(({ event }) => selectPatch(event.id)),
        },
      },
      states: {
        none: {},
        loading: {
          invoke: {
            src: 'fetchItem',
            input: ({ context }) => context.selectedId ?? 0,
            onDone: [
              { guard: ({ event }) => event.output === null, target: 'missing' },
              {
                target: 'ready',
                actions: assign({ item: ({ event }) => event.output ?? undefined }),
              },
            ],
            onError: {
              target: 'failed',
              actions: assign({ itemError: ({ event }) => messageOf(event.error) }),
            },
          },
          on: {
            // selecting another hit while loading restarts the request
            SELECT_HIT: {
              target: 'loading',
              reenter: true,
              actions: assign(({ event }) => selectPatch(event.id)),
            },
          },
        },
        ready: {},
        missing: {},
        failed: {
          on: { RETRY_ITEM: 'loading' },
        },
      },
    },
  },
});
