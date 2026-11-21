import { assign, fromPromise, raise, setup } from "xstate";
import * as api from "./api.js";
import type { Hit, Item } from "./api.js";
import { messageOf } from "./shared.js";

export type HelpInput = { query: string; hitId: number | null };

type HelpEvent =
  | { type: "QUERY"; q: string }
  | { type: "SELECT"; id: number }
  | { type: "DESELECT" }
  | { type: "RETRY" };

export type HelpContext = {
  query: string;
  hits: Hit[];
  searchError: string | null;
  selectedId: number | null;
  item: Item | null;
  itemError: string | null;
};

/** The help page: a search region and an item region, both alive only while the page is open. */
export const helpMachine = setup({
  types: {
    context: {} as HelpContext,
    events: {} as HelpEvent,
    input: {} as HelpInput,
  },
  actors: {
    searchHits: fromPromise<Hit[], string>(({ input }) => api.search(input)),
    loadItem: fromPromise<Item | null, number>(({ input }) => api.fetchItem(input)),
  },
}).createMachine({
  id: "help",
  type: "parallel",
  context: ({ input }) => ({
    query: input.query,
    hits: [],
    searchError: null,
    selectedId: input.hitId,
    item: null,
    itemError: null,
  }),
  states: {
    search: {
      initial: "start",
      on: {
        QUERY: [
          {
            guard: ({ event }) => event.q.length === 0,
            target: ".empty",
            reenter: true,
            actions: [assign({ query: ({ event }) => event.q }), raise({ type: "DESELECT" })],
          },
          {
            guard: ({ event }) => event.q.length === 1,
            target: ".tooShort",
            reenter: true,
            actions: [assign({ query: ({ event }) => event.q }), raise({ type: "DESELECT" })],
          },
          {
            target: ".searching",
            reenter: true,
            actions: [assign({ query: ({ event }) => event.q }), raise({ type: "DESELECT" })],
          },
        ],
      },
      states: {
        start: {
          always: [
            { guard: ({ context }) => context.query.length === 0, target: "empty" },
            { guard: ({ context }) => context.query.length === 1, target: "tooShort" },
            { target: "searching" },
          ],
        },
        empty: {},
        tooShort: {},
        searching: {
          invoke: {
            src: "searchHits",
            input: ({ context }) => context.query,
            onDone: {
              target: "results",
              actions: assign({ hits: ({ event }) => event.output, searchError: null }),
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
      initial: "choose",
      on: {
        SELECT: {
          target: ".loading",
          reenter: true,
          actions: assign({ selectedId: ({ event }) => event.id }),
        },
        DESELECT: {
          target: ".none",
          actions: assign({ selectedId: null }),
        },
        RETRY: { target: ".loading", reenter: true },
      },
      states: {
        choose: {
          always: [
            { guard: ({ context }) => context.selectedId !== null, target: "loading" },
            { target: "none" },
          ],
        },
        none: {},
        loading: {
          invoke: {
            src: "loadItem",
            input: ({ context }) => context.selectedId as number,
            onDone: [
              { guard: ({ event }) => event.output === null, target: "notFound" },
              {
                target: "loaded",
                actions: assign({ item: ({ event }) => event.output }),
              },
            ],
            onError: {
              target: "failed",
              actions: assign({ itemError: ({ event }) => messageOf(event.error) }),
            },
          },
        },
        loaded: {},
        notFound: {},
        failed: {},
      },
    },
  },
});
