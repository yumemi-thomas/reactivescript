import { assign, enqueueActions, fromPromise, setup, type SnapshotFrom } from "xstate";
import * as api from "./api.js";
import {
  WIP_LIMIT,
  dropCards,
  errorMessage,
  insertAt,
  locate,
  mapCards,
  planMove,
  relocate,
  toCardView,
  toItemView,
  type Column,
  type Columns,
  type Direction,
  type ItemView,
} from "./model";
import { requestMachine, startRequest, type RequestMeta } from "./requests";

export type BoardErrorKey = "move" | "add" | "archive" | "rename" | "item";

export type BoardContext = {
  cards: Columns;
  loadErrors: Partial<Record<Column, string>>;
  selectedId: number | null;
  items: ItemView[];
  checklistError: string | undefined;
  errors: Partial<Record<BoardErrorKey, string>>;
  seq: number;
};

export type BoardEvent =
  | { type: "RETRY"; column: Column }
  | { type: "MOVE"; id: number; dir: Direction }
  | { type: "ADD_CARD"; title: string }
  | { type: "SELECT"; id: number }
  | { type: "RENAME"; title: string }
  | { type: "ARCHIVE" }
  | { type: "TOGGLE_ITEM"; itemId: number }
  | { type: "ADD_ITEM"; text: string }
  | { type: "request.succeeded"; meta: RequestMeta; result: unknown }
  | { type: "request.failed"; meta: RequestMeta; message: string };

export type BoardSend = (event: BoardEvent) => void;

/** Applies a server answer that is an accept: only adds need anything from it, the new id. */
function settleOk(context: BoardContext, meta: RequestMeta, result: unknown): Partial<BoardContext> {
  switch (meta.kind) {
    case "add": {
      const id = (result as { id: number }).id;
      return { cards: mapCards(context.cards, (c) => c.key === meta.key, (c) => ({ ...c, id })) };
    }
    case "addItem": {
      const id = (result as { id: number }).id;
      return { items: context.items.map((i) => (i.key === meta.key ? { ...i, id } : i)) };
    }
    default:
      return {};
  }
}

/** Rolls back an optimistic change whose server request was declined, and shows its error where the brief says. */
function settleErr(context: BoardContext, meta: RequestMeta, message: string): Partial<BoardContext> {
  const detailShowsCard = (id: number) => context.selectedId === id;
  switch (meta.kind) {
    case "move":
      return {
        cards: relocate(context.cards, meta.id, meta.from),
        errors: { ...context.errors, move: message },
      };
    case "rename":
      return {
        cards: mapCards(context.cards, (c) => c.id === meta.id, (c) => ({ ...c, title: meta.previous })),
        errors: detailShowsCard(meta.id) ? { ...context.errors, rename: message } : context.errors,
      };
    case "archive":
      return {
        cards: {
          ...context.cards,
          [meta.from.column]: insertAt(context.cards[meta.from.column], meta.from.index, meta.card),
        },
        errors: { ...context.errors, archive: message },
      };
    case "add":
      return {
        cards: dropCards(context.cards, (c) => c.key === meta.key),
        errors: { ...context.errors, add: message },
      };
    case "toggle": {
      const shown = detailShowsCard(meta.cardId);
      return {
        cards: mapCards(context.cards, (c) => c.id === meta.cardId, (c) => ({ ...c, done: c.done + (meta.done ? -1 : 1) })),
        items: shown
          ? context.items.map((i) => (i.id === meta.itemId ? { ...i, done: !meta.done } : i))
          : context.items,
        errors: shown ? { ...context.errors, item: message } : context.errors,
      };
    }
    case "addItem": {
      const shown = detailShowsCard(meta.cardId);
      return {
        cards: mapCards(context.cards, (c) => c.id === meta.cardId, (c) => ({ ...c, total: c.total - 1 })),
        items: shown ? context.items.filter((i) => i.key !== meta.key) : context.items,
        errors: shown ? { ...context.errors, item: message } : context.errors,
      };
    }
    default:
      return {};
  }
}

export const boardMachine = setup({
  types: {
    context: {} as BoardContext,
    events: {} as BoardEvent,
  },
  actors: {
    fetchCards: fromPromise<api.Card[], Column>(({ input }) => api.fetchCards(input)),
    fetchChecklist: fromPromise<api.Item[], number>(({ input }) => api.fetchChecklist(input)),
    request: requestMachine,
  },
}).createMachine({
  id: "board",
  type: "parallel",
  context: {
    cards: { todo: [], doing: [], done: [] },
    loadErrors: {},
    selectedId: null,
    items: [],
    checklistError: undefined,
    errors: {},
    seq: 0,
  },
  on: {
    ADD_CARD: {
      guard: ({ event }) => event.title.trim() !== "",
      actions: enqueueActions(({ context, event, enqueue }) => {
        const title = event.title.trim();
        const key = `t${context.seq}`;
        const req = startRequest(context.seq, { kind: "add", key }, () => api.addCard("todo", title));
        enqueue.spawnChild("request", req);
        enqueue.assign({
          cards: {
            ...context.cards,
            todo: [...context.cards.todo, { key, id: null, title, done: 0, total: 0 }],
          },
          errors: { ...context.errors, add: undefined },
          seq: context.seq + 1,
        });
      }),
    },

    MOVE: {
      actions: enqueueActions(({ context, event, enqueue }) => {
        const plan = planMove(context.cards, event.id, event.dir);
        if (!plan) return;
        const { from, to } = plan;
        // Doing holds at most WIP_LIMIT cards, counting moves the server has not answered yet.
        if (to.column === "doing" && from.column !== "doing" && context.cards.doing.length >= WIP_LIMIT) return;
        const id = event.id;
        const req = startRequest(context.seq, { kind: "move", id, from, to }, () =>
          api.moveCard(id, to.column, to.index),
        );
        enqueue.spawnChild("request", req);
        enqueue.assign({
          cards: relocate(context.cards, id, to),
          errors: { ...context.errors, move: undefined },
          seq: context.seq + 1,
        });
      }),
    },

    RENAME: {
      actions: enqueueActions(({ context, event, enqueue }) => {
        const id = context.selectedId;
        const title = event.title.trim();
        if (id === null || title === "") return;
        const found = locate(context.cards, id);
        if (!found) return;
        const req = startRequest(context.seq, { kind: "rename", id, previous: found.card.title }, () =>
          api.renameCard(id, title),
        );
        enqueue.spawnChild("request", req);
        enqueue.assign({
          cards: mapCards(context.cards, (c) => c.id === id, (c) => ({ ...c, title })),
          errors: { ...context.errors, rename: undefined },
          seq: context.seq + 1,
        });
      }),
    },

    "request.succeeded": {
      actions: assign(({ context, event }) => settleOk(context, event.meta, event.result)),
    },
    "request.failed": {
      actions: assign(({ context, event }) => settleErr(context, event.meta, event.message)),
    },
  },
  states: {
    todo: {
      initial: "loading",
      states: {
        loading: {
          invoke: {
            src: "fetchCards",
            input: "todo",
            onDone: {
              target: "ready",
              actions: assign(({ context, event }) => ({
                cards: { ...context.cards, todo: event.output.map(toCardView) },
              })),
            },
            onError: {
              target: "failed",
              actions: assign(({ context, event }) => ({
                loadErrors: { ...context.loadErrors, todo: errorMessage(event.error) },
              })),
            },
          },
        },
        ready: {},
        failed: {
          on: {
            RETRY: {
              guard: ({ event }) => event.type === "RETRY" && event.column === "todo",
              target: "loading",
              actions: assign(({ context }) => ({
                loadErrors: { ...context.loadErrors, todo: undefined },
              })),
            },
          },
        },
      },
    },
    doing: {
      initial: "loading",
      states: {
        loading: {
          invoke: {
            src: "fetchCards",
            input: "doing",
            onDone: {
              target: "ready",
              actions: assign(({ context, event }) => ({
                cards: { ...context.cards, doing: event.output.map(toCardView) },
              })),
            },
            onError: {
              target: "failed",
              actions: assign(({ context, event }) => ({
                loadErrors: { ...context.loadErrors, doing: errorMessage(event.error) },
              })),
            },
          },
        },
        ready: {},
        failed: {
          on: {
            RETRY: {
              guard: ({ event }) => event.type === "RETRY" && event.column === "doing",
              target: "loading",
              actions: assign(({ context }) => ({
                loadErrors: { ...context.loadErrors, doing: undefined },
              })),
            },
          },
        },
      },
    },
    done: {
      initial: "loading",
      states: {
        loading: {
          invoke: {
            src: "fetchCards",
            input: "done",
            onDone: {
              target: "ready",
              actions: assign(({ context, event }) => ({
                cards: { ...context.cards, done: event.output.map(toCardView) },
              })),
            },
            onError: {
              target: "failed",
              actions: assign(({ context, event }) => ({
                loadErrors: { ...context.loadErrors, done: errorMessage(event.error) },
              })),
            },
          },
        },
        ready: {},
        failed: {
          on: {
            RETRY: {
              guard: ({ event }) => event.type === "RETRY" && event.column === "done",
              target: "loading",
              actions: assign(({ context }) => ({
                loadErrors: { ...context.loadErrors, done: undefined },
              })),
            },
          },
        },
      },
    },
    detail: {
      initial: "none",
      on: {
        ARCHIVE: {
          guard: ({ context }) => context.selectedId !== null && locate(context.cards, context.selectedId) !== undefined,
          target: ".none",
          actions: enqueueActions(({ context, enqueue }) => {
            const id = context.selectedId;
            if (id === null) return;
            const found = locate(context.cards, id);
            if (!found) return;
            const meta: RequestMeta = {
              kind: "archive",
              card: found.card,
              from: { column: found.column, index: found.index },
            };
            enqueue.spawnChild("request", startRequest(context.seq, meta, () => api.archiveCard(id)));
            enqueue.assign({
              cards: dropCards(context.cards, (c) => c.id === id),
              selectedId: null,
              items: [],
              checklistError: undefined,
              errors: { ...context.errors, archive: undefined, rename: undefined, item: undefined },
              seq: context.seq + 1,
            });
          }),
        },
      },
      states: {
        none: {
          on: {
            SELECT: {
              target: "selected",
              actions: assign(({ context, event }) => ({
                selectedId: event.id,
                items: [],
                checklistError: undefined,
                errors: { ...context.errors, rename: undefined, item: undefined },
              })),
            },
          },
        },
        selected: {
          // Selecting another card restarts the checklist: a self-transition, so only this node re-enters.
          on: {
            SELECT: {
              target: "selected",
              reenter: true,
              actions: assign(({ context, event }) => ({
                selectedId: event.id,
                items: [],
                checklistError: undefined,
                errors: { ...context.errors, rename: undefined, item: undefined },
              })),
            },
          },
          initial: "loading",
          states: {
            loading: {
              invoke: {
                src: "fetchChecklist",
                input: ({ context }) => context.selectedId ?? 0,
                onDone: {
                  target: "ready",
                  actions: assign({ items: ({ event }) => event.output.map(toItemView) }),
                },
                onError: {
                  target: "failed",
                  actions: assign({ checklistError: ({ event }) => errorMessage(event.error) }),
                },
              },
            },
            ready: {
              on: {
                TOGGLE_ITEM: {
                  actions: enqueueActions(({ context, event, enqueue }) => {
                    const cardId = context.selectedId;
                    const itemId = event.itemId;
                    const item = context.items.find((i) => i.id === itemId);
                    if (cardId === null || !item) return;
                    const done = !item.done;
                    const req = startRequest(
                      context.seq,
                      { kind: "toggle", cardId, itemId, done },
                      () => api.toggleItem(cardId, itemId, done),
                    );
                    enqueue.spawnChild("request", req);
                    enqueue.assign({
                      items: context.items.map((i) => (i.id === itemId ? { ...i, done } : i)),
                      cards: mapCards(context.cards, (c) => c.id === cardId, (c) => ({
                        ...c,
                        done: c.done + (done ? 1 : -1),
                      })),
                      errors: { ...context.errors, item: undefined },
                      seq: context.seq + 1,
                    });
                  }),
                },
                ADD_ITEM: {
                  actions: enqueueActions(({ context, event, enqueue }) => {
                    const cardId = context.selectedId;
                    const text = event.text.trim();
                    if (cardId === null || text === "") return;
                    const key = `i${context.seq}`;
                    const req = startRequest(context.seq, { kind: "addItem", cardId, key }, () =>
                      api.addItem(cardId, text),
                    );
                    enqueue.spawnChild("request", req);
                    enqueue.assign({
                      items: [...context.items, { key, id: null, text, done: false }],
                      cards: mapCards(context.cards, (c) => c.id === cardId, (c) => ({ ...c, total: c.total + 1 })),
                      errors: { ...context.errors, item: undefined },
                      seq: context.seq + 1,
                    });
                  }),
                },
              },
            },
            failed: {},
          },
        },
      },
    },
  },
});

export type BoardSnapshot = SnapshotFrom<typeof boardMachine>;

export function columnStatus(snap: BoardSnapshot, column: Column): "loading" | "ready" | "failed" {
  return (snap.value as Record<Column, "loading" | "ready" | "failed">)[column];
}

export function checklistStatus(snap: BoardSnapshot): "none" | "loading" | "ready" | "failed" {
  if (snap.matches({ detail: { selected: "loading" } })) return "loading";
  if (snap.matches({ detail: { selected: "ready" } })) return "ready";
  if (snap.matches({ detail: { selected: "failed" } })) return "failed";
  return "none";
}
