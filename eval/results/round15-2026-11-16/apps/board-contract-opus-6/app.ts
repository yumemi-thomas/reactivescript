// The sprint board's data module. Reads pass the backend's answers through, projected onto
// their shapes; writes answer a Reply (`ok`, the id, and the server's reason when it
// declined), and `overlay` lays every write still out over the reads it changes, so the
// board shows it at once and drops it when the server says no.
import type { Answer, Args, Overlay, Result, Sources, Write } from './app.contract.d.ts';
import * as api from './src/api.js';

export const grants = '';

type Card = Result<'fetchCards'>[number];
type Item = Result<'fetchChecklist'>[number];
type Archived = Result<'fetchArchived'>[number];
type Reply = Result<'moveCard'>;
type Column = 'todo' | 'doing' | 'done';

const column = (c: string): Column => {
  if (c === 'todo' || c === 'doing' || c === 'done') return c;
  throw new Error(`unknown column ${c}`);
};
const messageOf = (e: unknown): string => (e instanceof Error ? e.message : String(e));
/** A read's failure keeps the server's message for the view's `failure(x).message`. */
const readFailure = (e: unknown): Error => new Error(messageOf(e));
/** A write's outcome as a reply: a decline is an answer the view shows, not a crash. */
const write = async (id: number, run: () => Promise<number | void>): Promise<Reply> => {
  try {
    const made = await run();
    return { ok: true, id: typeof made === 'number' ? made : id, item: 0, error: '' };
  } catch (e) {
    return { ok: false, id, item: 0, error: messageOf(e) };
  }
};

const sources: Sources = {
  fetchCards: async ([col]) => {
    try {
      const cards = await api.fetchCards(column(col));
      return cards.map((c): Card => ({ id: c.id, title: c.title, done: c.done, total: c.total, adding: false }));
    } catch (e) { throw readFailure(e); }
  },
  fetchChecklist: async ([id]) => {
    try {
      const items = await api.fetchChecklist(id);
      return items.map((i): Item => ({ id: i.id, text: i.text, done: i.done, adding: false }));
    } catch (e) { throw readFailure(e); }
  },
  fetchArchived: async () => {
    try {
      const rows = await api.fetchArchived();
      return rows.map((a): Archived => ({ id: a.id, title: a.title }));
    } catch (e) { throw readFailure(e); }
  },
  // The card's title and counts travel with the move so the column it lands in can show it.
  moveCard: ([id, col, index]) => write(id, async () => { await api.moveCard(id, column(col), index); }),
  renameCard: ([id, title]) => write(id, async () => { await api.renameCard(id, title); }),
  addCard: ([col, title]) => write(0, async () => (await api.addCard(column(col), title)).id),
  archiveCard: ([id]) => write(id, async () => { await api.archiveCard(id); }),
  toggleItem: ([cardId, itemId, done]) => write(cardId, async () => { await api.toggleItem(cardId, itemId, done); }),
  // The reply's `id` is the card's (the view matches errors to the selection); `item` the new item's.
  addItem: async ([cardId, text]) => {
    try {
      const made = await api.addItem(cardId, text);
      return { ok: true, id: cardId, item: made.id, error: '' };
    } catch (e) {
      return { ok: false, id: cardId, item: 0, error: messageOf(e) };
    }
  },
  restoreCard: ([id]) => write(id, async () => { await api.restoreCard(id); }),
};
export const answer: Answer = (source, args, store, storage, native) =>
  sources[source](args, store, storage, native);

// ---- Optimistic writes -------------------------------------------------------------------

/** A write to lay over the answer: still out, or answered ok before the answer caught up. */
const showing = (w: Write): boolean => !w.answered && (w.reply === undefined || (w.reply as Reply).ok);

function overlayCards(col: string, answer: Card[], writes: readonly Write[]): Card[] {
  let shown = answer.map((c) => ({ ...c }));
  for (const w of writes) {
    if (!showing(w)) continue;
    switch (w.source) {
      case 'moveCard': {
        const [id, to, index, title, done, total] = w.args as Args<'moveCard'>;
        const here = shown.find((c) => c.id === id && !c.adding);
        shown = shown.filter((c) => c.adding || c.id !== id);
        if (to === col) {
          const card: Card = here ?? { id, title, done, total, adding: false };
          shown.splice(Math.max(0, Math.min(index, shown.length)), 0, card);
        }
        break;
      }
      case 'addCard': {
        const [to, title] = w.args as Args<'addCard'>;
        if (to !== col) break;
        const reply = w.reply as Reply | undefined;
        if (reply === undefined) shown.push({ id: -w.id, title, done: 0, total: 0, adding: true });
        else if (!shown.some((c) => !c.adding && c.id === reply.id)) shown.push({ id: reply.id, title, done: 0, total: 0, adding: false });
        break;
      }
      case 'renameCard': {
        const [id, title] = w.args as Args<'renameCard'>;
        shown = shown.map((c) => (!c.adding && c.id === id ? { ...c, title } : c));
        break;
      }
      case 'archiveCard': {
        const [id] = w.args as Args<'archiveCard'>;
        shown = shown.filter((c) => c.adding || c.id !== id);
        break;
      }
      case 'toggleItem': {
        const [cardId, , done] = w.args as Args<'toggleItem'>;
        shown = shown.map((c) => (!c.adding && c.id === cardId
          ? { ...c, done: Math.max(0, Math.min(c.total, c.done + (done ? 1 : -1))) } : c));
        break;
      }
      case 'addItem': {
        const [cardId] = w.args as Args<'addItem'>;
        shown = shown.map((c) => (!c.adding && c.id === cardId ? { ...c, total: c.total + 1 } : c));
        break;
      }
    }
  }
  return shown;
}

function overlayChecklist(cardId: number, answer: Item[], writes: readonly Write[]): Item[] {
  let shown = answer.map((i) => ({ ...i }));
  for (const w of writes) {
    if (!showing(w)) continue;
    if (w.source === 'toggleItem') {
      const [card, itemId, done] = w.args as Args<'toggleItem'>;
      if (card === cardId) shown = shown.map((i) => (!i.adding && i.id === itemId ? { ...i, done } : i));
    } else if (w.source === 'addItem') {
      const [card, text] = w.args as Args<'addItem'>;
      if (card !== cardId) continue;
      const reply = w.reply as Reply | undefined;
      if (reply === undefined) shown.push({ id: -w.id, text, done: false, adding: true });
      else if (!shown.some((i) => !i.adding && i.id === reply.item)) shown.push({ id: reply.item, text, done: false, adding: false });
    }
  }
  return shown;
}

function overlayArchived(answer: Archived[], writes: readonly Write[]): Archived[] {
  let shown = [...answer];
  for (const w of writes) {
    if (!showing(w) || w.source !== 'restoreCard') continue;
    const [id] = w.args as Args<'restoreCard'>;
    shown = shown.filter((a) => a.id !== id);
  }
  return shown;
}

export const overlay: Overlay = (source, args, answer, writes) => {
  if (source === 'fetchCards') return overlayCards((args as Args<'fetchCards'>)[0], answer as Card[], writes) as never;
  if (source === 'fetchChecklist') return overlayChecklist((args as Args<'fetchChecklist'>)[0], answer as Item[], writes) as never;
  if (source === 'fetchArchived') return overlayArchived(answer as Archived[], writes) as never;
  return undefined;
};
