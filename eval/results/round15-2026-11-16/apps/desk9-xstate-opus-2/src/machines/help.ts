import { assign, setup } from "xstate";
import type { Hit, Item } from "../types";
import { loadItem, searchHelp } from "../requests";
import { errorMessage } from "../clock";

export const EMPTY_HELP: HelpInput = { query: "", results: null, selectedId: null };

export type HelpInput = { query: string; results: { q: string; hits: Hit[] } | null; selectedId: number | null };

type Context = HelpInput & {
  searchError: string | null;
  item: Item | null;
  itemError: string | null;
};

type Event = { type: "query.change"; value: string } | { type: "hit.select"; id: number } | { type: "item.retry" };

export const helpMachine = setup({
  types: {
    context: {} as Context,
    events: {} as Event,
    input: {} as HelpInput,
  },
  actors: { searchHelp, loadItem },
  guards: {
    hasResults: ({ context }) => context.results !== null && context.results.q === context.query,
    isEmpty: ({ context }) => context.query.length === 0,
    isTooShort: ({ context }) => context.query.length < 2,
    hasSelection: ({ context }) => context.selectedId !== null,
  },
}).createMachine({
  id: "help",
  type: "parallel",
  context: ({ input }) => ({
    query: input.query,
    results: input.results,
    selectedId: input.selectedId,
    searchError: null,
    item: null,
    itemError: null,
  }),
  states: {
    search: {
      initial: "start",
      on: {
        "query.change": {
          target: ".route",
          actions: assign({ query: ({ event }) => event.value }),
        },
      },
      states: {
        start: {
          always: [{ guard: "hasResults", target: "ready" }, { target: "route" }],
        },
        route: {
          always: [
            { guard: "isEmpty", target: "idle", actions: assign({ results: null, searchError: null }) },
            { guard: "isTooShort", target: "tooShort", actions: assign({ results: null, searchError: null }) },
            { target: "searching" },
          ],
        },
        idle: {},
        tooShort: {},
        searching: {
          invoke: {
            src: "searchHelp",
            input: ({ context }) => ({ q: context.query }),
            onDone: {
              target: "ready",
              actions: assign({ results: ({ event }) => event.output, searchError: null }),
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
          guard: ({ context, event }) => event.id !== context.selectedId,
          target: ".loading",
          actions: assign({ selectedId: ({ event }) => event.id }),
        },
      },
      states: {
        start: {
          always: [{ guard: "hasSelection", target: "loading" }, { target: "none" }],
        },
        none: {},
        loading: {
          invoke: {
            src: "loadItem",
            input: ({ context }) => ({ id: context.selectedId ?? 0 }),
            onDone: [
              { guard: ({ event }) => event.output === null, target: "notFound", actions: assign({ item: null }) },
              { target: "loaded", actions: assign({ item: ({ event }) => event.output, itemError: null }) },
            ],
            onError: {
              target: "failed",
              actions: assign({ item: null, itemError: ({ event }) => errorMessage(event.error) }),
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
