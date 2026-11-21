import { assign, fromPromise, setup } from "xstate";
import * as api from "../api.js";
import type { Hit, Item } from "../api.js";
import { errorMessage } from "./request";

export type HelpInput = {
  query: string;
  /** results already known for `query` (opening a related hit), or null to start empty */
  hits: Hit[] | null;
  /** the hit to select straight away, or null */
  hitId: number | null;
};

export type HelpContext = {
  query: string;
  /** the results on screen, and the query they answer */
  results: { q: string; hits: Hit[] } | null;
  searchError: string;
  selectedId: number | null;
  item: Item | null;
  itemError: string;
};

export type HelpEvent = { type: "query.change"; value: string } | { type: "hit.select"; id: number } | { type: "item.retry" };

export const MIN_QUERY = 2;

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
  id: "help",
  type: "parallel",
  context: ({ input }) => ({
    query: input.query,
    results: input.hits ? { q: input.query, hits: input.hits } : null,
    searchError: "",
    selectedId: input.hitId,
    item: null,
    itemError: "",
  }),
  states: {
    search: {
      initial: "start",
      on: {
        "query.change": [
          {
            guard: ({ event }) => event.value.length >= MIN_QUERY,
            target: ".searching",
            actions: assign({ query: ({ event }) => event.value }),
          },
          {
            // Empty or too short: nothing is asked, and nothing stays on screen.
            target: ".idle",
            actions: assign({ query: ({ event }) => event.value, results: null }),
          },
        ],
      },
      states: {
        start: {
          always: [
            { guard: ({ context }) => context.results !== null, target: "ready" },
            { guard: ({ context }) => context.query.length >= MIN_QUERY, target: "searching" },
            { target: "idle" },
          ],
        },
        idle: {},
        searching: {
          on: {
            // A newer query replaces the search in the air: its answer is dropped.
            "query.change": [
              {
                guard: ({ event }) => event.value.length >= MIN_QUERY,
                target: "searching",
                reenter: true,
                actions: assign({ query: ({ event }) => event.value }),
              },
              { target: "idle", actions: assign({ query: ({ event }) => event.value, results: null }) },
            ],
          },
          invoke: {
            src: "search",
            input: ({ context }) => context.query,
            onDone: {
              target: "ready",
              actions: assign({ results: ({ context, event }) => ({ q: context.query, hits: event.output }) }),
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
      initial: "start",
      on: {
        "hit.select": {
          target: ".loading",
          actions: assign({ selectedId: ({ event }) => event.id }),
        },
      },
      states: {
        start: {
          always: [{ guard: ({ context }) => context.selectedId !== null, target: "loading" }, { target: "none" }],
        },
        none: {},
        loading: {
          entry: assign({ item: null, itemError: "" }),
          on: {
            "hit.select": { target: "loading", reenter: true, actions: assign({ selectedId: ({ event }) => event.id }) },
          },
          invoke: {
            src: "fetchItem",
            input: ({ context }) => context.selectedId ?? 0,
            onDone: [
              { guard: ({ event }) => event.output === null, target: "notFound" },
              { target: "ready", actions: assign({ item: ({ event }) => event.output }) },
            ],
            onError: {
              target: "failed",
              actions: assign({ itemError: ({ event }) => errorMessage(event.error) }),
            },
          },
        },
        ready: {},
        notFound: {},
        failed: {
          on: { "item.retry": { target: "loading" } },
        },
      },
    },
  },
});
