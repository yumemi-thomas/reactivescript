import type { Card, Column, Item } from "./api.js";
import { COLUMNS, type Outcome, type Request } from "./requests.js";

/**
 * A change the user made on the board. Changes are kept in the order they were made and
 * replayed on top of what the server sent, so a declined change can be taken out on its own
 * without undoing anything made after it.
 */
export type BoardOp =
  | { kind: "move"; id: number; column: Column; index: number }
  | { kind: "addCard"; column: Column; title: string; id: number | null }
  | { kind: "rename"; id: number; title: string }
  | { kind: "archive"; id: number }
  | { kind: "toggle"; cardId: number; itemId: number; done: boolean }
  | { kind: "addItem"; cardId: number; text: string; item: Item | null };

export type Entry = { seq: number; op: BoardOp; accepted: boolean };

export type ViewCard = {
  key: string;
  /** null while an added card waits for the server */
  id: number | null;
  title: string;
  done: number;
  total: number;
};

export type ViewItem = {
  key: string;
  /** null while an added item waits for the server */
  id: number | null;
  text: string;
  done: boolean;
};

export type Columns = Record<Column, ViewCard[] | null>;

export const COLUMN_NAMES: Record<Column, string> = { todo: "To do", doing: "Doing", done: "Done" };
export const WIP_LIMIT = 3;

export function toRequest(op: BoardOp): Request {
  switch (op.kind) {
    case "move":
      return { kind: "move", id: op.id, column: op.column, index: op.index };
    case "addCard":
      return { kind: "addCard", column: op.column, title: op.title };
    case "rename":
      return { kind: "rename", id: op.id, title: op.title };
    case "archive":
      return { kind: "archive", id: op.id };
    case "toggle":
      return { kind: "toggle", cardId: op.cardId, itemId: op.itemId, done: op.done };
    case "addItem":
      return { kind: "addItem", cardId: op.cardId, text: op.text };
  }
}

/** The op as the server settled it. */
export function accept(op: BoardOp, outcome: Outcome): BoardOp {
  if (op.kind === "move" && outcome.kind === "move") return { ...op, column: outcome.column, index: outcome.index };
  if (op.kind === "addCard" && outcome.kind === "addCard") return { ...op, id: outcome.id, title: outcome.title };
  if (op.kind === "rename" && outcome.kind === "rename") return { ...op, title: outcome.title };
  if (op.kind === "toggle" && outcome.kind === "toggle") return { ...op, done: outcome.done };
  if (op.kind === "addItem" && outcome.kind === "addItem") return { ...op, item: outcome.item };
  return op;
}

/** Replays the checklist changes of `cardId` on top of `items`. */
export function replayItems(items: readonly Item[], entries: readonly Entry[], cardId: number): ViewItem[] {
  const out: ViewItem[] = items.map(i => ({ key: `i${i.id}`, id: i.id, text: i.text, done: i.done }));
  for (const { seq, op } of entries) {
    if (op.kind === "toggle" && op.cardId === cardId) {
      const at = out.findIndex(i => i.id === op.itemId);
      if (at >= 0) out[at] = { ...out[at], done: op.done };
    } else if (op.kind === "addItem" && op.cardId === cardId) {
      if (op.item === null) out.push({ key: `new${seq}`, id: null, text: op.text, done: false });
      else if (!out.some(i => i.id === op.item?.id))
        out.push({ key: `i${op.item.id}`, id: op.item.id, text: op.item.text, done: op.item.done });
    }
  }
  return out;
}

const countDone = (items: readonly { done: boolean }[]) => items.filter(i => i.done).length;

/**
 * The board as shown: the columns the server sent with every change not declined replayed on top.
 * A card's checklist counts follow its checklist changes, measured against the first checklist
 * the server sent for it (fetched before any of its checklist changes could be made).
 */
export function deriveColumns(
  base: Record<Column, Card[] | null>,
  entries: readonly Entry[],
  baselines: Readonly<Record<number, Item[]>>,
): Columns {
  const cols: Columns = { todo: null, doing: null, done: null };
  for (const c of COLUMNS) {
    const cards = base[c];
    cols[c] = cards ? cards.map(card => ({ key: `c${card.id}`, ...card })) : null;
  }
  const locate = (id: number): [ViewCard[], number] | null => {
    for (const c of COLUMNS) {
      const list = cols[c];
      const at = list ? list.findIndex(card => card.id === id) : -1;
      if (list && at >= 0) return [list, at];
    }
    return null;
  };

  for (const { seq, op } of entries) {
    switch (op.kind) {
      case "move": {
        const found = locate(op.id);
        const target = cols[op.column];
        if (!found || !target) break;
        const [list, at] = found;
        const [card] = list.splice(at, 1);
        target.splice(Math.max(0, Math.min(op.index, target.length)), 0, card);
        break;
      }
      case "addCard": {
        const target = cols[op.column];
        if (!target) break;
        target.push({ key: op.id === null ? `new${seq}` : `c${op.id}`, id: op.id, title: op.title, done: 0, total: 0 });
        break;
      }
      case "rename": {
        const found = locate(op.id);
        if (found) found[0][found[1]] = { ...found[0][found[1]], title: op.title };
        break;
      }
      case "archive": {
        const found = locate(op.id);
        if (found) found[0].splice(found[1], 1);
        break;
      }
      default:
        break;
    }
  }

  for (const [key, baseline] of Object.entries(baselines)) {
    const cardId = Number(key);
    const found = locate(cardId);
    if (!found) continue;
    const items = replayItems(baseline, entries, cardId);
    const doneDelta = countDone(items) - countDone(baseline);
    const totalDelta = items.length - baseline.length;
    if (doneDelta === 0 && totalDelta === 0) continue;
    const card = found[0][found[1]];
    found[0][found[1]] = { ...card, done: card.done + doneDelta, total: card.total + totalDelta };
  }
  return cols;
}

export function findCard(cols: Columns, id: number): { card: ViewCard; column: Column; index: number } | null {
  for (const column of COLUMNS) {
    const list = cols[column];
    const index = list ? list.findIndex(c => c.id === id) : -1;
    if (list && index >= 0) return { card: list[index], column, index };
  }
  return null;
}

export type Direction = "left" | "right" | "up" | "down";

export type MoveButton = { dir: Direction; disabled: boolean };

/** The move buttons a card shows: absent when there is nowhere to go, disabled when it may not go there now. */
export function moveButtons(cols: Columns, column: Column, index: number): MoveButton[] {
  const list = cols[column] ?? [];
  const at = COLUMNS.indexOf(column);
  const doingFull = (cols.doing?.length ?? 0) >= WIP_LIMIT;
  const buttons: MoveButton[] = [];
  const sideways = (dir: Direction, target: Column) => ({
    dir,
    disabled: cols[target] === null || (target === "doing" && column !== "doing" && doingFull),
  });
  if (at > 0) buttons.push(sideways("left", COLUMNS[at - 1]));
  if (at < COLUMNS.length - 1) buttons.push(sideways("right", COLUMNS[at + 1]));
  if (index > 0) buttons.push({ dir: "up", disabled: false });
  if (index < list.length - 1) buttons.push({ dir: "down", disabled: false });
  return buttons;
}

/** Where a move of card `id` in direction `dir` lands, or null if that move is not allowed now. */
export function planMove(cols: Columns, id: number, dir: Direction): { column: Column; index: number } | null {
  const found = findCard(cols, id);
  if (!found) return null;
  const { column, index } = found;
  const button = moveButtons(cols, column, index).find(b => b.dir === dir);
  if (!button || button.disabled) return null;
  const at = COLUMNS.indexOf(column);
  switch (dir) {
    case "left":
    case "right": {
      const target = COLUMNS[dir === "left" ? at - 1 : at + 1];
      return { column: target, index: cols[target]?.length ?? 0 };
    }
    case "up":
      return { column, index: index - 1 };
    case "down":
      return { column, index: index + 1 };
  }
}
