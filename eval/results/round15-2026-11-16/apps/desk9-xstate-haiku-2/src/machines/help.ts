import { assign, fromPromise, setup } from "xstate";
import * as api from "../api.js";
import type { Hit, Item } from "../api.js";
import { errMessage } from "./shared.js";

export type HelpInput = { query: string; selectedId: number | null };

export type HelpContext = {
  query: string;
  hits: Hit[];
  /** the query the shown hits answer */
  hitsFor: string;
  searchError: string;
  selectedId: number | null;
  item: Item | null;
  itemError: string;
};

export type HelpEvent =
  | { type: "query.set"; value: string }
  | { type: "hit.select"; id: number }
  | { type: "item.retry" };

/**
 * The help page. Two parallel regions: the search (driven by the query) and the
 * item pane (driven by the selected hit). Each region's request is an invoked
 * actor, so a newer query or selection stops the older request and its answer is dropped.
 */
export const helpMachine = setup({
  types: {
    context: {} as HelpContext,
    events: {} as HelpEvent,
    input: {} as HelpInput,
  },
  actors: {
    search: fromPromise<Hit[], { q: string }>(async ({ input }) => api.search(input.q)),
    fetchItem: fromPromise<Item | null, { id: number }>(async ({ input }) => api.fetchItem(input.id)),
  },
}).createMachine({
  id: "help",
  type: "parallel",
  context: ({ input }) => ({
    query: input.query,
    hits: [],
    hitsFor: "",
    searchError: "",
    selectedId: input.selectedId,
    item: null,
    itemError: "",
  }),
  states: {
    search: {
      initial: "route",
      on: {
        "query.set": { target: ".route", actions: assign({ query: ({ event }) => event.value }) },
      },
      states: {
        route: {
          always: [
            { guard: ({ context }) => context.query.length >= 2, target: "searching" },
            { guard: ({ context }) => context.query.length === 1, target: "tooShort" },
            { target: "empty" },
          ],
        },
        empty: {},
        tooShort: {},
        searching: {
          invoke: {
            src: "search",
            input: ({ context }) => ({ q: context.query }),
            onDone: {
              target: "results",
              actions: assign({
                hits: ({ event }) => event.output,
                hitsFor: ({ context }) => context.query,
              }),
            },
            onError: {
              target: "failed",
              actions: assign({ searchError: ({ event }) => errMessage(event.error) }),
            },
          },
        },
        results: {},
        failed: {},
      },
    },

    item: {
      initial: "route",
      on: {
        "hit.select": { target: ".route", actions: assign({ selectedId: ({ event }) => event.id }) },
        "item.retry": { target: ".route" },
      },
      states: {
        route: {
          always: [
            { guard: ({ context }) => context.selectedId === null, target: "none" },
            { target: "loading" },
          ],
        },
        none: {},
        loading: {
          entry: assign({ item: null, itemError: "" }),
          invoke: {
            src: "fetchItem",
            input: ({ context }) => ({ id: context.selectedId as number }),
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
              actions: assign({ itemError: ({ event }) => errMessage(event.error) }),
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
