import { assign, fromPromise, setup } from "xstate";
import * as api from "./api.js";
import type { Hit, Item } from "./api.js";
import { errorMessage } from "./request";

/** How the help page opens: empty from its tab, or with a query and a hit already chosen (a related hit). */
export type HelpSeed = { query: string; hitId: number } | null;

export type HelpContext = {
  query: string;
  /** the results on screen, and the query they answer */
  results: { query: string; hits: Hit[] } | null;
  searchError: string | null;
  selected: number | null;
  item: Item | null;
  itemError: string | null;
};

export type HelpEvent =
  | { type: "query.change"; value: string }
  | { type: "hit.select"; id: number }
  | { type: "item.retry" };

export const MIN_QUERY = 2;

export const helpMachine = setup({
  types: {
    input: {} as HelpSeed,
    context: {} as HelpContext,
    events: {} as HelpEvent,
  },
  actors: {
    search: fromPromise<Hit[], string>(({ input }) => api.search(input)),
    fetchItem: fromPromise<Item | null, number>(({ input }) => api.fetchItem(input)),
  },
  guards: {
    searchable: ({ context }) => context.query.length >= MIN_QUERY,
    hasSelection: ({ context }) => context.selected !== null,
  },
}).createMachine({
  id: "help",
  type: "parallel",
  context: ({ input }) => ({
    query: input?.query ?? "",
    results: null,
    searchError: null,
    selected: input?.hitId ?? null,
    item: null,
    itemError: null,
  }),
  states: {
    search: {
      initial: "init",
      on: {
        "query.change": {
          // through `init`, so a search for the previous query still in flight is dropped
          target: ".init",
          actions: assign(({ event }) =>
            event.value.length >= MIN_QUERY
              ? { query: event.value }
              : { query: event.value, results: null, searchError: null },
          ),
        },
      },
      states: {
        init: {
          always: [{ guard: "searchable", target: "searching" }, { target: "idle" }],
        },
        /** empty or too short: nothing asked */
        idle: {},
        searching: {
          entry: assign({ searchError: null }),
          invoke: {
            src: "search",
            input: ({ context }) => context.query,
            onDone: {
              target: "ready",
              actions: assign({
                results: ({ context, event }) => ({ query: context.query, hits: event.output }),
              }),
            },
            onError: {
              target: "failed",
              actions: assign({ results: null, searchError: ({ event }) => errorMessage(event.error) }),
            },
          },
        },
        ready: {},
        failed: {},
      },
    },
    item: {
      initial: "init",
      on: {
        "hit.select": {
          guard: ({ context, event }) => context.selected !== event.id,
          target: ".init",
          actions: assign({ selected: ({ event }) => event.id }),
        },
      },
      states: {
        init: {
          always: [{ guard: "hasSelection", target: "loading" }, { target: "none" }],
        },
        none: {},
        loading: {
          entry: assign({ item: null, itemError: null }),
          invoke: {
            src: "fetchItem",
            input: ({ context }) => context.selected ?? 0,
            onDone: [
              { guard: ({ event }) => event.output === null, target: "notFound" },
              { target: "loaded", actions: assign({ item: ({ event }) => event.output }) },
            ],
            onError: {
              target: "failed",
              actions: assign({ itemError: ({ event }) => errorMessage(event.error) }),
            },
          },
        },
        loaded: {},
        notFound: {},
        failed: {
          on: { "item.retry": { target: "loading" } },
        },
      },
    },
  },
});
