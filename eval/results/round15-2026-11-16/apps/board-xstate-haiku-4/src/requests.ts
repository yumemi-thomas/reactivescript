import * as api from "./api";
import type { Column } from "./model";

/** Every server call the app makes. Plain data, so it can be given to an actor as input. */
export type Request =
  | { type: "load"; column: Column }
  | { type: "move"; id: number; column: Column; index: number }
  | { type: "add"; title: string }
  | { type: "rename"; id: number; title: string }
  | { type: "archive"; id: number }
  | { type: "toggle"; cardId: number; itemId: number; done: boolean }
  | { type: "addItem"; cardId: number; text: string }
  | { type: "restore"; id: number };

/** Starts the server call for a request. The call is made synchronously. */
export function runRequest(request: Request): Promise<unknown> {
  switch (request.type) {
    case "load":
      return api.fetchCards(request.column);
    case "move":
      return api.moveCard(request.id, request.column, request.index);
    case "add":
      return api.addCard("todo", request.title);
    case "rename":
      return api.renameCard(request.id, request.title);
    case "archive":
      return api.archiveCard(request.id);
    case "toggle":
      return api.toggleItem(request.cardId, request.itemId, request.done);
    case "addItem":
      return api.addItem(request.cardId, request.text);
    case "restore":
      return api.restoreCard(request.id);
  }
}
