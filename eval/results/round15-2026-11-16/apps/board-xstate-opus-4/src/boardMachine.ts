import { assign, enqueueActions, fromPromise, setup } from "xstate";
import * as api from "./api.js";
import type { Card, Column, Item } from "./api.js";
import { errorMessage, requestMachine, type RequestReport } from "./requests.js";
import {
  accept,
  deriveColumns,
  findCard,
  planMove,
  replayItems,
  toRequest,
  type BoardOp,
  type Direction,
  type Entry,
} from "./boardModel.js";

export type BoardContext = {
  /** each column as the server sent it; null until it has loaded */
  base: Record<Column, Card[] | null>;
  columnError: Record<Column, string | null>;
  /** the user's changes, oldest first; declined ones are taken out */
  entries: Entry[];
  nextSeq: number;
  selectedId: number | null;
  /** the selected card's checklist as the server last sent it */
  checklist: Item[];
  checklistError: string | null;
  /** the first checklist the server sent for each card, which its board counts are measured against */
  baselines: Record<number, Item[]>;
  moveError: string | null;
  addError: string | null;
  archiveError: string | null;
  renameError: string | null;
  itemError: string | null;
};

export type BoardEvent =
  | { type: "retry"; column: Column }
  | { type: "move"; id: number; dir: Direction }
  | { type: "addCard"; title: string }
  | { type: "select"; id: number }
  | { type: "rename"; title: string }
  | { type: "archive" }
  | { type: "retryChecklist" }
  | { type: "toggle"; itemId: number }
  | { type: "addItem"; text: string }
  | RequestReport;

const columnsOf = (context: BoardContext) => deriveColumns(context.base, context.entries, context.baselines);

const boardSetup = setup({
  types: {
    context: {} as BoardContext,
    events: {} as BoardEvent,
  },
  actors: {
    fetchCards: fromPromise<Card[], Column>(({ input }) => api.fetchCards(input)),
    fetchChecklist: fromPromise<Item[], number>(({ input }) => api.fetchChecklist(input)),
    request: requestMachine,
  },
  actions: {
    selectCard: assign(({ event }) =>
      event.type === "select" ? { selectedId: event.id, renameError: null, itemError: null } : {},
    ),
    /** records an op and sends its request */
    submit: enqueueActions(({ context, enqueue }, params: { op: BoardOp }) => {
      const seq = context.nextSeq;
      enqueue.assign({
        nextSeq: seq + 1,
        entries: [...context.entries, { seq, op: params.op, accepted: false }],
      });
      enqueue.spawnChild("request", { id: `request-${seq}`, input: { seq, request: toRequest(params.op) } });
    }),
  },
  guards: {
    hasSelection: ({ context }) => context.selectedId !== null,
    canSelect: ({ context, event }) =>
      event.type === "select" && event.id !== context.selectedId && findCard(columnsOf(context), event.id) !== null,
  },
});

function columnRegion(column: Column) {
  return boardSetup.createStateConfig({
    initial: "loading",
    states: {
      loading: {
        entry: assign({ columnError: ({ context }) => ({ ...context.columnError, [column]: null }) }),
        invoke: {
          src: "fetchCards",
          input: column,
          onDone: {
            target: "ready",
            actions: assign({ base: ({ context, event }) => ({ ...context.base, [column]: event.output }) }),
          },
          onError: {
            target: "failed",
            actions: assign({
              columnError: ({ context, event }) => ({ ...context.columnError, [column]: errorMessage(event.error) }),
            }),
          },
        },
      },
      failed: {
        on: {
          retry: { guard: ({ event }) => event.column === column, target: "loading" },
        },
      },
      ready: {},
    },
  });
}

export const boardMachine = boardSetup.createMachine({
  id: "board",
  type: "parallel",
  context: {
    base: { todo: null, doing: null, done: null },
    columnError: { todo: null, doing: null, done: null },
    entries: [],
    nextSeq: 0,
    selectedId: null,
    checklist: [],
    checklistError: null,
    baselines: {},
    moveError: null,
    addError: null,
    archiveError: null,
    renameError: null,
    itemError: null,
  },
  on: {
    move: {
      actions: enqueueActions(({ context, event, enqueue }) => {
        const to = planMove(columnsOf(context), event.id, event.dir);
        if (!to) return;
        enqueue.assign({ moveError: null });
        enqueue({ type: "submit", params: { op: { kind: "move", id: event.id, ...to } } });
      }),
    },
    addCard: {
      guard: ({ context, event }) => context.base.todo !== null && event.title.trim() !== "",
      actions: [
        assign({ addError: null }),
        { type: "submit", params: ({ event }) => ({ op: { kind: "addCard", column: "todo", title: event.title.trim(), id: null } }) },
      ],
    },
    "request.succeeded": {
      actions: assign({
        entries: ({ context, event }) =>
          context.entries.map(e => (e.seq === event.seq ? { ...e, op: accept(e.op, event.outcome), accepted: true } : e)),
      }),
    },
    "request.failed": {
      actions: assign(({ context, event }) => {
        const entry = context.entries.find(e => e.seq === event.seq);
        if (!entry) return {};
        const entries = context.entries.filter(e => e.seq !== event.seq);
        const { op } = entry;
        switch (op.kind) {
          case "move":
            return { entries, moveError: event.message };
          case "addCard":
            return { entries, addError: event.message };
          case "archive":
            return { entries, archiveError: event.message };
          case "rename":
            return { entries, renameError: op.id === context.selectedId ? event.message : context.renameError };
          case "toggle":
          case "addItem":
            return { entries, itemError: op.cardId === context.selectedId ? event.message : context.itemError };
        }
      }),
    },
  },
  states: {
    todo: columnRegion("todo"),
    doing: columnRegion("doing"),
    done: columnRegion("done"),
    detail: {
      initial: "idle",
      on: {
        rename: {
          guard: ({ context, event }) => context.selectedId !== null && event.title.trim() !== "",
          actions: [
            assign({ renameError: null }),
            {
              type: "submit",
              params: ({ context, event }) => ({
                op: { kind: "rename", id: context.selectedId ?? -1, title: event.title.trim() },
              }),
            },
          ],
        },
        archive: {
          guard: "hasSelection",
          target: ".idle",
          actions: [
            assign({ archiveError: null }),
            { type: "submit", params: ({ context }) => ({ op: { kind: "archive", id: context.selectedId ?? -1 } }) },
            assign({ selectedId: null, renameError: null, itemError: null, checklist: [] }),
          ],
        },
      },
      states: {
        idle: {
          on: { select: { guard: "canSelect", target: "loading", actions: "selectCard" } },
        },
        loading: {
          on: { select: { guard: "canSelect", target: "loading", reenter: true, actions: "selectCard" } },
          entry: assign({ checklist: [], checklistError: null }),
          invoke: {
            src: "fetchChecklist",
            input: ({ context }) => context.selectedId ?? -1,
            onDone: {
              target: "ready",
              actions: assign(({ context, event }) => {
                const id = context.selectedId;
                if (id === null) return {};
                return {
                  checklist: event.output,
                  baselines: id in context.baselines ? context.baselines : { ...context.baselines, [id]: event.output },
                };
              }),
            },
            onError: {
              target: "failed",
              actions: assign({ checklistError: ({ event }) => errorMessage(event.error) }),
            },
          },
        },
        failed: {
          on: {
            retryChecklist: { target: "loading" },
            select: { guard: "canSelect", target: "loading", actions: "selectCard" },
          },
        },
        ready: {
          on: {
            select: { guard: "canSelect", target: "loading", actions: "selectCard" },
            toggle: {
              actions: enqueueActions(({ context, event, enqueue }) => {
                const cardId = context.selectedId;
                if (cardId === null) return;
                const item = replayItems(context.checklist, context.entries, cardId).find(i => i.id === event.itemId);
                if (!item) return;
                enqueue.assign({ itemError: null });
                enqueue({ type: "submit", params: { op: { kind: "toggle", cardId, itemId: event.itemId, done: !item.done } } });
              }),
            },
            addItem: {
              guard: ({ context, event }) => context.selectedId !== null && event.text.trim() !== "",
              actions: [
                assign({ itemError: null }),
                {
                  type: "submit",
                  params: ({ context, event }) => ({
                    op: { kind: "addItem", cardId: context.selectedId ?? -1, text: event.text.trim(), item: null },
                  }),
                },
              ],
            },
          },
        },
      },
    },
  },
});
