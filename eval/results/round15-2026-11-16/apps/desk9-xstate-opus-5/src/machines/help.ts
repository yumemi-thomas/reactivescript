import { assign, fromPromise, setup } from "xstate";
import * as api from "../api.js";
import type { Hit, Item } from "../api.js";
import { errorMessage } from "./task";

/** How the help page opens from a related hit: the query, its results, and the hit picked. */
export type HelpSeed = { query: string; hits: Hit[]; hitId: number };

export type HelpContext = {
  query: string;
  /** the results on screen, and the query they answer */
  hits: Hit[];
  hitsQuery: string;
  searchError: string | null;
  selectedHitId: number | null;
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
    context: {} as HelpContext,
    events: {} as HelpEvent,
    input: {} as HelpSeed | null,
  },
  actors: {
    search: fromPromise<Hit[], { q: string }>(({ input }) => api.search(input.q)),
    loadItem: fromPromise<Item | null, { id: number }>(({ input }) => api.fetchItem(input.id)),
  },
  guards: {
    seededResults: ({ context }) => context.hitsQuery !== "" && context.hitsQuery === context.query,
    seededHit: ({ context }) => context.selectedHitId !== null,
  },
}).createMachine({
  id: "help",
  type: "parallel",
  context: ({ input }) => ({
    query: input?.query ?? "",
    hits: input && input.query.length >= MIN_QUERY ? input.hits : [],
    hitsQuery: input && input.query.length >= MIN_QUERY ? input.query : "",
    searchError: null,
    selectedHitId: input?.hitId ?? null,
    item: null,
    itemError: null,
  }),
  states: {
    results: {
      initial: "init",
      on: {
        "query.change": [
          {
            guard: ({ event }) => event.value.length === 0,
            target: ".empty",
            actions: assign({ query: ({ event }) => event.value }),
          },
          {
            guard: ({ event }) => event.value.length < MIN_QUERY,
            target: ".tooShort",
            actions: assign({ query: ({ event }) => event.value }),
          },
          {
            target: ".searching",
            actions: assign({ query: ({ event }) => event.value }),
          },
        ],
      },
      states: {
        init: {
          always: [
            { guard: "seededResults", target: "ready" },
            { guard: ({ context }) => context.query.length === 0, target: "empty" },
            { guard: ({ context }) => context.query.length < MIN_QUERY, target: "tooShort" },
            { target: "searching" },
          ],
        },
        empty: {
          entry: assign({ hits: [], hitsQuery: "", searchError: null }),
        },
        tooShort: {
          entry: assign({ hits: [], hitsQuery: "", searchError: null }),
        },
        searching: {
          invoke: {
            src: "search",
            input: ({ context }) => ({ q: context.query }),
            onDone: {
              target: "ready",
              actions: assign({
                hits: ({ event }) => event.output,
                hitsQuery: ({ context }) => context.query,
                searchError: null,
              }),
            },
            onError: {
              target: "failed",
              actions: assign({
                hits: [],
                hitsQuery: "",
                searchError: ({ event }) => errorMessage(event.error),
              }),
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
          target: ".loading",
          actions: assign({ selectedHitId: ({ event }) => event.id }),
        },
      },
      states: {
        init: {
          always: [{ guard: "seededHit", target: "loading" }, { target: "idle" }],
        },
        idle: {},
        loading: {
          entry: assign({ item: null, itemError: null }),
          invoke: {
            src: "loadItem",
            input: ({ context }) => ({ id: context.selectedHitId ?? 0 }),
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
          on: { "item.retry": "loading" },
        },
      },
    },
  },
});
