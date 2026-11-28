import type { Answer, Overlay, Result, Sources } from './app.contract.d.ts';
import * as api from './src/api.js';

export const grants = '';

type Column = 'todo' | 'doing' | 'done';
type Card = { id: number; title: string; done: number; total: number };
type Item = { id: number; text: string; done: boolean };
type Archived = { id: number; title: string };
// A write as the overlay sees it: its source, its arguments (the last one is the page visit it
// was sent on), its reply once landed, and whether an answer has been asked since.
type Write = { source: string; args: unknown[]; reply?: unknown; answered: boolean; keep(): void };

// Writes are replayed over the answer in send order. A write declined before its reply has
// left the list, so nothing needs undoing; an accepted one is kept, so it stays where it was
// put whether or not a later answer already shows it (replaying it again changes nothing).
const ofThisVisit = (w: Write, visit: number) => w.args[w.args.length - 1] === visit;

// The board column `col` on page visit `visit`.
function column(col: string, visit: number, answer: Card[], writes: Write[]): Card[] {
  let cards = answer.map((c) => ({ ...c }));
  for (const w of writes) {
    if (!ofThisVisit(w, visit)) continue;
    if (w.answered) w.keep();
    const a = w.args;
    switch (w.source) {
      case 'moveOp': {
        const [id, src, dst, at, title, done, total] = a as [number, Column, Column, number, string, number, number];
        if (src === col) cards = cards.filter((c) => c.id !== id);
        if (dst === col) cards.splice(Math.max(0, Math.min(at, cards.length)), 0, { id, title, done, total });
        break;
      }
      case 'renameOp': {
        const [id, title] = a as [number, string];
        cards = cards.map((c) => (c.id === id ? { ...c, title } : c));
        break;
      }
      case 'archiveOp': {
        const [id] = a as [number];
        cards = cards.filter((c) => c.id !== id);
        break;
      }
      case 'addOp': {
        const [dst, title] = a as [Column, string];
        const id = w.reply ? (w.reply as { id: number }).id : 0;
        if (dst === col && !(id !== 0 && cards.some((c) => c.id === id))) cards.push({ id, title, done: 0, total: 0 });
        break;
      }
      case 'toggleOp': {
        const [cardId, , , cardDone] = a as [number, number, boolean, number];
        cards = cards.map((c) => (c.id === cardId ? { ...c, done: cardDone } : c));
        break;
      }
      case 'addItemOp': {
        const [cardId, , cardTotal] = a as [number, string, number];
        cards = cards.map((c) => (c.id === cardId ? { ...c, total: cardTotal } : c));
        break;
      }
    }
  }
  return cards;
}

// The open card's checklist on page visit `visit`: toggles and added items, over its answer.
function checklist(cardId: number, visit: number, answer: Item[], writes: Write[]): Item[] {
  let items = answer.map((i) => ({ ...i }));
  for (const w of writes) {
    if (!ofThisVisit(w, visit)) continue;
    if (w.answered) w.keep();
    const a = w.args;
    switch (w.source) {
      case 'toggleOp': {
        const [id, itemId, done] = a as [number, number, boolean];
        if (id === cardId) items = items.map((i) => (i.id === itemId ? { ...i, done } : i));
        break;
      }
      case 'addItemOp': {
        const [id, text] = a as [number, string, number];
        const itemId = w.reply ? (w.reply as Item).id : 0;
        if (id === cardId && !(itemId !== 0 && items.some((i) => i.id === itemId))) items.push({ id: itemId, text, done: false });
        break;
      }
    }
  }
  return items;
}

// The archive on page visit `visit`: restores still out take their row off.
function archive(visit: number, answer: Archived[], writes: Write[]): Archived[] {
  let list = answer.map((a) => ({ ...a }));
  for (const w of writes) {
    if (!ofThisVisit(w, visit)) continue;
    if (w.answered) w.keep();
    if (w.source === 'restoreOp') {
      const [id] = w.args as [number];
      list = list.filter((a) => a.id !== id);
    }
  }
  return list;
}

export const overlay: Overlay = (source, args, answer, writes) => {
  const ws = writes as unknown as Write[];
  if (source === 'loadColumn') return column(String(args[0]), Number(args[1]), answer as unknown as Card[], ws) as never;
  if (source === 'loadChecklist') return checklist(Number(args[0]), Number(args[2]), answer as unknown as Item[], ws) as never;
  if (source === 'loadArchived') return archive(Number(args[0]), answer as unknown as Archived[], ws) as never;
  return undefined;
};

const sources: Sources = {
  loadColumn: ([column]): Promise<Result<'loadColumn'>> => api.fetchCards(column as Column),
  loadChecklist: ([id]): Promise<Result<'loadChecklist'>> => api.fetchChecklist(id),
  loadArchived: (): Promise<Result<'loadArchived'>> => api.fetchArchived(),
  moveOp: ([id, , dst, at]): Promise<Result<'moveOp'>> => api.moveCard(id, dst as Column, at),
  renameOp: ([id, title]): Promise<Result<'renameOp'>> => api.renameCard(id, title),
  addOp: ([column, title]): Promise<Result<'addOp'>> => api.addCard(column as Column, title),
  archiveOp: ([id]): Promise<Result<'archiveOp'>> => api.archiveCard(id),
  toggleOp: ([cardId, itemId, done]): Promise<Result<'toggleOp'>> => api.toggleItem(cardId, itemId, done),
  addItemOp: ([cardId, text]): Promise<Result<'addItemOp'>> => api.addItem(cardId, text),
  restoreOp: ([id]): Promise<Result<'restoreOp'>> => api.restoreCard(id),
};

export const answer: Answer = (source, args, store, storage, native) =>
  sources[source](args, store, storage, native);
