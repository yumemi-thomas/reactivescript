import { fromPromise, sendParent, setup } from "xstate";
import * as api from "./api.js";
import type { Column, Item } from "./api.js";

export const COLUMNS = ["todo", "doing", "done"] as const satisfies readonly Column[];

export function isColumn(value: unknown): value is Column {
  return typeof value === "string" && (COLUMNS as readonly string[]).includes(value);
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "request failed";
}

/** A change sent to the server. */
export type Request =
  | { kind: "move"; id: number; column: Column; index: number }
  | { kind: "addCard"; column: Column; title: string }
  | { kind: "rename"; id: number; title: string }
  | { kind: "archive"; id: number }
  | { kind: "toggle"; cardId: number; itemId: number; done: boolean }
  | { kind: "addItem"; cardId: number; text: string }
  | { kind: "restore"; id: number };

/** What the server answered to an accepted request. */
export type Outcome =
  | { kind: "move"; column: Column; index: number }
  | { kind: "addCard"; id: number; title: string }
  | { kind: "rename"; title: string }
  | { kind: "archive" }
  | { kind: "toggle"; done: boolean }
  | { kind: "addItem"; item: Item }
  | { kind: "restore" };

async function perform(request: Request): Promise<Outcome> {
  switch (request.kind) {
    case "move": {
      const r = await api.moveCard(request.id, request.column, request.index);
      return {
        kind: "move",
        column: isColumn(r?.column) ? r.column : request.column,
        index: typeof r?.index === "number" ? r.index : request.index,
      };
    }
    case "addCard": {
      const r = await api.addCard(request.column, request.title);
      return { kind: "addCard", id: r.id, title: typeof r.title === "string" ? r.title : request.title };
    }
    case "rename": {
      const r = await api.renameCard(request.id, request.title);
      return { kind: "rename", title: typeof r?.title === "string" ? r.title : request.title };
    }
    case "archive":
      await api.archiveCard(request.id);
      return { kind: "archive" };
    case "toggle": {
      const r = await api.toggleItem(request.cardId, request.itemId, request.done);
      return { kind: "toggle", done: typeof r?.done === "boolean" ? r.done : request.done };
    }
    case "addItem": {
      const item = await api.addItem(request.cardId, request.text);
      return { kind: "addItem", item };
    }
    case "restore":
      await api.restoreCard(request.id);
      return { kind: "restore" };
  }
}

export type RequestReport =
  | { type: "request.succeeded"; seq: number; outcome: Outcome }
  | { type: "request.failed"; seq: number; message: string };

type RequestInput = { seq: number; request: Request };

/**
 * One request in flight: sends it, then reports the answer to its parent
 * as `request.succeeded` / `request.failed`, tagged with the parent's sequence number.
 */
export const requestMachine = setup({
  types: {
    context: {} as RequestInput,
    input: {} as RequestInput,
  },
  actors: {
    perform: fromPromise<Outcome, Request>(({ input }) => perform(input)),
  },
}).createMachine({
  id: "request",
  context: ({ input }) => input,
  initial: "sending",
  states: {
    sending: {
      invoke: {
        src: "perform",
        input: ({ context }) => context.request,
        onDone: {
          target: "settled",
          actions: sendParent(({ context, event }): RequestReport => ({
            type: "request.succeeded",
            seq: context.seq,
            outcome: event.output,
          })),
        },
        onError: {
          target: "settled",
          actions: sendParent(({ context, event }): RequestReport => ({
            type: "request.failed",
            seq: context.seq,
            message: errorMessage(event.error),
          })),
        },
      },
    },
    settled: { type: "final" },
  },
});
