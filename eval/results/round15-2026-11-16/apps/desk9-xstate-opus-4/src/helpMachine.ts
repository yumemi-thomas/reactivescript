import { assign, setup } from "xstate";
import type { Hit, Item } from "./api";
import { errorMessage, fetchItemLogic, searchLogic } from "./requests";

export type HelpInput = { query: string; hits: Hit[] | null; hitId: number | null };

export type HelpContext = {
  query: string;
  /** The hits on screen and the query they answer. */
  hits: Hit[];
  hitsFor: string | null;
  searchError: string | null;
  selectedId: number | null;
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
    input: {} as HelpInput,
  },
  actors: {
    search: searchLogic,
    fetchItem: fetchItemLogic,
  },
  guards: {
    queryEmpty: ({ context }) => context.query === "",
    queryShort: ({ context }) => context.query.length < MIN_QUERY,
    hasHitsForQuery: ({ context }) => context.hitsFor === context.query,
    hasSelection: ({ context }) => context.selectedId !== null,
    queryChanges: ({ context, event }) => event.type === "query.change" && event.value !== context.query,
    otherHit: ({ context, event }) => event.type === "hit.select" && event.id !== context.selectedId,
  },
  actions: {
    setQuery: assign({ query: ({ context, event }) => (event.type === "query.change" ? event.value : context.query) }),
    setSelected: assign({
      selectedId: ({ context, event }) => (event.type === "hit.select" ? event.id : context.selectedId),
    }),
    clearHits: assign({ hits: [], hitsFor: null, searchError: null }),
  },
}).createMachine({
  id: "help",
  type: "parallel",
  context: ({ input }) => ({
    query: input.query,
    hits: input.hits ?? [],
    hitsFor: input.hits ? input.query : null,
    searchError: null,
    selectedId: input.hitId,
    item: null,
    itemError: null,
  }),
  states: {
    results: {
      initial: "boot",
      // Each state handles its own transitions so that a new query restarts this region only.
      states: {
        // Opened from a related hit: its results are already known.
        boot: {
          always: [{ guard: "hasHitsForQuery", target: "ready" }, { target: "deciding" }],
        },
        deciding: {
          always: [
            { guard: "queryEmpty", target: "empty", actions: "clearHits" },
            { guard: "queryShort", target: "tooShort", actions: "clearHits" },
            { target: "searching" },
          ],
        },
        empty: { on: { "query.change": { guard: "queryChanges", target: "deciding", actions: "setQuery" } } },
        tooShort: { on: { "query.change": { guard: "queryChanges", target: "deciding", actions: "setQuery" } } },
        searching: {
          on: { "query.change": { guard: "queryChanges", target: "deciding", actions: "setQuery" } },
          invoke: {
            src: "search",
            input: ({ context }) => ({ q: context.query }),
            onDone: {
              target: "ready",
              actions: assign(({ context, event }) => ({
                hits: event.output,
                hitsFor: context.query,
                searchError: null,
              })),
            },
            onError: {
              target: "failed",
              actions: assign({
                hits: [],
                hitsFor: null,
                searchError: ({ event }) => errorMessage(event.error),
              }),
            },
          },
        },
        ready: { on: { "query.change": { guard: "queryChanges", target: "deciding", actions: "setQuery" } } },
        failed: { on: { "query.change": { guard: "queryChanges", target: "deciding", actions: "setQuery" } } },
      },
    },
    item: {
      initial: "deciding",
      states: {
        deciding: {
          always: [{ guard: "hasSelection", target: "loading" }, { target: "none" }],
        },
        none: { on: { "hit.select": { target: "loading", actions: "setSelected" } } },
        loading: {
          on: { "hit.select": { guard: "otherHit", target: "loading", reenter: true, actions: "setSelected" } },
          entry: assign({ item: null, itemError: null }),
          invoke: {
            src: "fetchItem",
            input: ({ context }) => ({ id: context.selectedId! }),
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
        loaded: { on: { "hit.select": { guard: "otherHit", target: "loading", actions: "setSelected" } } },
        notFound: { on: { "hit.select": { guard: "otherHit", target: "loading", actions: "setSelected" } } },
        failed: {
          on: {
            "item.retry": { target: "loading" },
            // Clicking the same hit again after a failure asks again too.
            "hit.select": { target: "loading", actions: "setSelected" },
          },
        },
      },
    },
  },
});
