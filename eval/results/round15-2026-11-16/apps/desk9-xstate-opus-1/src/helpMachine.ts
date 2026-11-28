import { assign, fromPromise, setup } from "xstate";
import * as api from "./api";
import type { Hit, Item } from "./api";

export type HelpInput = { query?: string; hits?: Hit[]; hitId?: number };

export interface HelpContext {
  query: string;
  /** the results on screen and the query they answer */
  results: { q: string; hits: Hit[] } | null;
  searchError: string | null;
  selectedId: number | null;
  item: Item | null;
  itemError: string | null;
}

export type HelpEvent =
  | { type: "QUERY"; value: string }
  | { type: "SELECT_HIT"; id: number }
  | { type: "RETRY_ITEM" };

export const MIN_QUERY = 2;

const searchable = (q: string) => q.length >= MIN_QUERY;

export const helpMachine = setup({
  types: {
    context: {} as HelpContext,
    events: {} as HelpEvent,
    input: {} as HelpInput,
  },
  actors: {
    search: fromPromise<Hit[], { q: string }>(({ input }) => api.search(input.q)),
    loadItem: fromPromise<Item | null, { id: number }>(({ input }) => api.fetchItem(input.id)),
  },
  guards: {
    hasHit: ({ context }) => context.selectedId !== null,
    searchable: ({ context }) => searchable(context.query),
  },
}).createMachine({
  id: "help",
  type: "parallel",
  context: ({ input }) => {
    const query = input.query ?? "";
    return {
      query,
      results: input.hits && searchable(query) ? { q: query, hits: input.hits } : null,
      searchError: null,
      selectedId: input.hitId ?? null,
      item: null,
      itemError: null,
    };
  },
  states: {
    search: {
      initial: "start",
      on: {
        QUERY: [
          {
            guard: ({ event }) => searchable(event.value),
            target: ".searching",
            actions: assign({ query: ({ event }) => event.value, searchError: null }),
          },
          {
            target: ".idle",
            actions: assign({ query: ({ event }) => event.value, results: null, searchError: null }),
          },
        ],
      },
      states: {
        start: {
          always: [{ guard: "searchable", target: "searching" }, { target: "idle" }],
        },
        idle: {},
        searching: {
          invoke: {
            src: "search",
            input: ({ context }) => ({ q: context.query }),
            onDone: {
              target: "done",
              actions: assign({ results: ({ context, event }) => ({ q: context.query, hits: event.output }) }),
            },
            onError: {
              target: "failed",
              actions: assign({ results: null, searchError: ({ event }) => (event.error instanceof Error ? event.error.message : String(event.error)) }),
            },
          },
        },
        done: {},
        failed: {},
      },
    },
    item: {
      initial: "start",
      on: {
        SELECT_HIT: {
          guard: ({ context, event }) => context.selectedId !== event.id,
          target: ".loading",
          actions: assign({ selectedId: ({ event }) => event.id }),
        },
      },
      states: {
        start: {
          always: [{ guard: "hasHit", target: "loading" }, { target: "none" }],
        },
        none: {},
        loading: {
          entry: assign({ item: null, itemError: null }),
          invoke: {
            src: "loadItem",
            input: ({ context }) => ({ id: context.selectedId! }),
            onDone: [
              { guard: ({ event }) => event.output === null, target: "notFound" },
              { target: "loaded", actions: assign({ item: ({ event }) => event.output }) },
            ],
            onError: {
              target: "failed",
              actions: assign({ itemError: ({ event }) => (event.error instanceof Error ? event.error.message : String(event.error)) }),
            },
          },
        },
        loaded: {},
        notFound: {},
        failed: {
          on: { RETRY_ITEM: { target: "loading" } },
        },
      },
    },
  },
});
