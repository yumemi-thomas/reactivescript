import { assign, enqueueActions, fromPromise, setup } from "xstate";
import * as api from "./api.js";
import type { Hit, Item } from "./api.js";
import { messageOf, must } from "./util";

export type HelpInput = { query: string; hitId: number | null };

type Shown = { q: string; hits: Hit[] };

export type HelpContext = {
  query: string;
  /** the last results that arrived, kept on screen while a newer search runs */
  shown: Shown | null;
  searchError: string | null;
  /** a hit to pick as soon as the first search answers (set when opened from an issue) */
  pendingPick: number | null;
  selectedId: number | null;
  item: Item | null;
  itemError: string | null;
};

type HelpEvent = { type: "QUERY"; q: string } | { type: "PICK"; id: number } | { type: "RETRY_ITEM" };

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
  actions: {
    pickItem: assign({
      selectedId: ({ event }) => (event.type === "PICK" ? event.id : null),
      pendingPick: null,
      item: null,
      itemError: null,
    }),
    raisePendingPick: enqueueActions(({ context, enqueue }) => {
      if (context.pendingPick !== null) enqueue.raise({ type: "PICK", id: context.pendingPick });
    }),
  },
}).createMachine({
  id: "help",
  type: "parallel",
  context: ({ input }) => ({
    query: input.query,
    shown: null,
    searchError: null,
    pendingPick: input.hitId,
    selectedId: null,
    item: null,
    itemError: null,
  }),
  states: {
    // Every change of query or pick goes through a transient state, so a running
    // search or fetch is cancelled and started again without `reenter`, which would
    // also restart the sibling region.
    search: {
      initial: "route",
      on: {
        QUERY: {
          target: ".route",
          actions: assign({
            query: ({ event }) => event.q,
            searchError: null,
            shown: ({ context, event }) => (event.q.length >= 2 ? context.shown : null),
          }),
        },
      },
      states: {
        route: {
          always: [
            { guard: ({ context }) => context.query.length === 0, target: "empty" },
            { guard: ({ context }) => context.query.length === 1, target: "short" },
            { target: "searching" },
          ],
        },
        empty: {},
        short: {},
        searching: {
          invoke: {
            src: "search",
            input: ({ context }) => context.query,
            onDone: {
              target: "results",
              actions: [
                assign({
                  shown: ({ context, event }) => ({ q: context.query, hits: event.output }),
                  searchError: null,
                }),
                "raisePendingPick",
              ],
            },
            onError: {
              target: "failed",
              actions: assign({ searchError: ({ event }) => messageOf(event.error) }),
            },
          },
        },
        results: {},
        failed: {},
      },
    },
    item: {
      initial: "none",
      on: {
        PICK: { target: ".reloading", actions: "pickItem" },
        RETRY_ITEM: { target: ".reloading", actions: assign({ itemError: null }) },
      },
      states: {
        none: {},
        reloading: {
          always: { target: "loading" },
        },
        loading: {
          invoke: {
            src: "fetchItem",
            input: ({ context }) => must(context.selectedId, "no help item is picked"),
            onDone: [
              {
                guard: ({ event }) => event.output !== null,
                target: "shown",
                actions: assign({ item: ({ event }) => event.output }),
              },
              { target: "notFound" },
            ],
            onError: {
              target: "failed",
              actions: assign({ itemError: ({ event }) => messageOf(event.error) }),
            },
          },
        },
        shown: {},
        notFound: {},
        failed: {},
      },
    },
  },
});
