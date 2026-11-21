import { fromPromise } from "xstate";
import * as api from "./api";
import type { ArchivedCard, BoardCard, Column, Pos } from "./types";

/** Every request the app makes to the server. */
export type CallInput =
  | { op: "fetchCards"; column: Column }
  | { op: "moveCard"; id: number; column: Column; index: number; from: Pos }
  | { op: "renameCard"; id: number; title: string; previous: string }
  | { op: "addCard"; key: string; title: string }
  | { op: "archiveCard"; id: number; card: BoardCard; from: Pos }
  | { op: "fetchChecklist"; id: number }
  | { op: "toggleItem"; cardId: number; key: string; itemId: number; done: boolean }
  | { op: "addItem"; cardId: number; key: string; text: string }
  | { op: "fetchArchived" }
  | { op: "restoreCard"; id: number; index: number; card: ArchivedCard };

export type CallResult = { ok: true; value: unknown } | { ok: false; message: string };

/** What the `call` actor reports back: the request it made and how it ended. It never rejects. */
export type CallDone = { input: CallInput; result: CallResult };

export function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** The error message of a finished call, or "" when it succeeded. */
export function failureOf(done: CallDone): string {
  return done.result.ok ? "" : done.result.message;
}

/** The value of a finished call, or undefined when it failed. */
export function valueOf<T>(done: CallDone): T | undefined {
  return done.result.ok ? (done.result.value as T) : undefined;
}

function request(input: CallInput): Promise<unknown> {
  switch (input.op) {
    case "fetchCards":
      return api.fetchCards(input.column);
    case "moveCard":
      return api.moveCard(input.id, input.column, input.index);
    case "renameCard":
      return api.renameCard(input.id, input.title);
    case "addCard":
      return api.addCard("todo", input.title);
    case "archiveCard":
      return api.archiveCard(input.id);
    case "fetchChecklist":
      return api.fetchChecklist(input.id);
    case "toggleItem":
      return api.toggleItem(input.cardId, input.itemId, input.done);
    case "addItem":
      return api.addItem(input.cardId, input.text);
    case "fetchArchived":
      return api.fetchArchived();
    case "restoreCard":
      return api.restoreCard(input.id);
  }
}

/**
 * Actors whose request has already been sent. Under StrictMode (development builds) React stops and
 * restarts a mounted page, and XState then runs a restarted promise actor's creator again. The first
 * request is still in flight and its result is still delivered, so the restart must not send it twice.
 */
const sent = new WeakSet<object>();

/** One server request as a promise actor. Failures are reported as data so the machine can roll back. */
export const call = fromPromise<CallDone, CallInput>(({ input, self }) => {
  if (sent.has(self)) return new Promise<CallDone>(() => {});
  sent.add(self);
  return run(input);
});

async function run(input: CallInput): Promise<CallDone> {
  try {
    return { input, result: { ok: true, value: await request(input) } };
  } catch (error) {
    return { input, result: { ok: false, message: messageOf(error) } };
  }
}

export type Spawn = (src: "call", options: { id: string; input: CallInput }) => unknown;

/** A planned user action: the optimistic change to make now, and the request to send. */
export type Step<C> = { patch: Partial<C>; call: CallInput };

/** Applies a planned step: spawns its request under a fresh id and returns the optimistic patch. */
export function launch<C extends { seq: number }>(ctx: C, step: Step<C> | null, spawn: Spawn): Partial<C> {
  if (!step) return {};
  spawn("call", { id: `call.${ctx.seq}`, input: step.call });
  return { ...step.patch, seq: ctx.seq + 1 } as Partial<C>;
}
