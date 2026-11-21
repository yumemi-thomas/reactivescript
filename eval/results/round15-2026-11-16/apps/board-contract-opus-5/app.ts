// The sprint board's data module: each source calls the backend (src/api.js) and projects its
// answer onto the declared shape, field by field. A rejection is let through, so the view's
// `failure(…)` carries the server's message. `overlay` lays every write still in flight (or
// answered but not yet re-read) over the resources it changes, so the board shows it at once.
import type { Answer, Overlay, Result, Sources, Write } from './app.contract.d.ts';
import * as api from './src/api.js';

export const grants = '';

type Card = Result<'fetchCards'>[number];
type Item = Result<'fetchChecklist'>[number];
type Archived = Result<'fetchArchived'>[number];
type Column = 'todo' | 'doing' | 'done';

const COLUMNS: readonly string[] = ['todo', 'doing', 'done'];
function column(name: string): Column {
  if (!COLUMNS.includes(name)) throw new Error(`unknown column ${name}`);
  return name as Column;
}

const sources: Sources = {
  fetchCards: async ([col]) =>
    (await api.fetchCards(column(col))).map((c): Card => ({
      id: c.id, title: c.title, done: c.done, total: c.total,
      serverTitle: c.title, serverDone: c.done, serverTotal: c.total, adding: false,
    })),
  moveCard: async ([id, to, index]) => {
    const r = await api.moveCard(id, column(to), index);
    return { id: r.id, column: r.column, index: r.index };
  },
  renameCard: async ([id, title]) => {
    const r = await api.renameCard(id, title);
    return { id: r.id, title: r.title };
  },
  addCard: async ([col, title]) => {
    const r = await api.addCard(column(col), title);
    return { id: r.id, title: r.title };
  },
  archiveCard: async ([id]) => {
    const r = await api.archiveCard(id);
    return { id: r.id };
  },
  fetchChecklist: async ([id]) =>
    (await api.fetchChecklist(id)).map((i): Item => ({ id: i.id, text: i.text, done: i.done, was: i.done, adding: false })),
  toggleItem: async ([cardId, itemId, done]) => {
    const r = await api.toggleItem(cardId, itemId, done);
    return { id: r.id, done: r.done };
  },
  addItem: async ([cardId, text]) => {
    const r = await api.addItem(cardId, text);
    return { id: r.id, text: r.text, done: r.done, was: r.done, adding: false };
  },
  fetchArchived: async () =>
    (await api.fetchArchived()).map((a): Archived => ({ id: a.id, title: a.title })),
  restoreCard: async ([id]) => {
    const r = await api.restoreCard(id);
    return { id: r.id };
  },
};

export const answer: Answer = (source, args, store, storage, native) =>
  sources[source](args, store, storage, native);

// A placeholder id for a row the server has not numbered yet: negative, so it never meets a real one.
const placeholderId = (w: Write) => -1 - w.id;

/** One column's cards with the writes laid over them.
 *
 * First where the cards are (moves, adds, archives, in send order), working on the server's
 * values, which every card carries in its `server…` fields and a move carries to its new column;
 * then what they read (renames, added items, toggles), by id, wherever the card now is. So a
 * write that is declined takes only its own effect with it. */
function overlayCards(col: string, answer: readonly Card[], writes: readonly Write[]): Card[] {
  // An answer asked after a write's reply landed already holds that write.
  const live = writes.filter((w) => !w.answered);
  let shown: Card[] = answer.map((c) => ({ ...c }));
  const real = (c: Card, id: number) => c.id === id && !c.adding;
  for (const w of live) {
    if (w.source === 'moveCard') {
      const [id, to, index, , serverTitle, serverDone, serverTotal] = w.args;
      const here = shown.find((c) => real(c, id));
      shown = shown.filter((c) => !real(c, id));
      if (to === col) {
        const moving: Card = here ?? {
          id, title: serverTitle, done: serverDone, total: serverTotal,
          serverTitle, serverDone, serverTotal, adding: false,
        };
        shown.splice(Math.max(0, Math.min(index, shown.length)), 0, moving);
      }
    } else if (w.source === 'addCard') {
      const [to, title] = w.args;
      if (to !== col) continue;
      if (w.reply) {
        const r = w.reply;
        if (!shown.some((c) => real(c, r.id))) {
          shown.push({ id: r.id, title: r.title, done: 0, total: 0, serverTitle: r.title, serverDone: 0, serverTotal: 0, adding: false });
        }
      } else {
        shown.push({ id: placeholderId(w), title, done: 0, total: 0, serverTitle: title, serverDone: 0, serverTotal: 0, adding: true });
      }
    } else if (w.source === 'archiveCard') {
      const [id] = w.args;
      shown = shown.filter((c) => !real(c, id));
    }
  }
  for (const w of live) {
    if (w.source === 'renameCard') {
      const [id, title] = w.args;
      shown = shown.map((c) => (real(c, id) ? { ...c, title } : c));
    } else if (w.source === 'addItem') {
      const [cardId] = w.args;
      shown = shown.map((c) => (real(c, cardId) ? { ...c, total: c.total + 1 } : c));
    }
  }
  // A card's done count follows each item's last toggle: from what the server had when the
  // first of them was sent to what the last one asks for.
  const toggles = new Map<string, { cardId: number; from: boolean; to: boolean }>();
  for (const w of live) {
    if (w.source !== 'toggleItem') continue;
    const [cardId, itemId, done, was] = w.args;
    const key = `${cardId}:${itemId}`;
    const seen = toggles.get(key);
    toggles.set(key, { cardId, from: seen ? seen.from : was, to: done });
  }
  for (const t of toggles.values()) {
    const delta = (t.to ? 1 : 0) - (t.from ? 1 : 0);
    if (delta === 0) continue;
    shown = shown.map((c) =>
      real(c, t.cardId) ? { ...c, done: Math.max(0, Math.min(c.total, c.done + delta)) } : c);
  }
  return shown;
}

/** A card's checklist with its toggles and added items laid over it. */
function overlayChecklist(cardId: number, answer: readonly Item[], writes: readonly Write[]): Item[] {
  let shown: Item[] = answer.map((i) => ({ ...i }));
  for (const w of writes) {
    if (w.answered) continue;
    if (w.source === 'toggleItem') {
      const [card, itemId, done] = w.args;
      if (card !== cardId) continue;
      shown = shown.map((i) => (i.id === itemId && !i.adding ? { ...i, done } : i));
    } else if (w.source === 'addItem') {
      const [card, text] = w.args;
      if (card !== cardId) continue;
      if (w.reply) {
        const r = w.reply;
        if (!shown.some((i) => i.id === r.id && !i.adding)) shown.push({ id: r.id, text: r.text, done: r.done, was: r.done, adding: false });
      } else {
        shown.push({ id: placeholderId(w), text, done: false, was: false, adding: true });
      }
    }
  }
  return shown;
}

/** The archive with the restores still showing taken off it. */
function overlayArchive(answer: readonly Archived[], writes: readonly Write[]): Archived[] {
  let shown: Archived[] = answer.map((a) => ({ ...a }));
  for (const w of writes) {
    if (w.answered || w.source !== 'restoreCard') continue;
    const [id] = w.args;
    shown = shown.filter((a) => a.id !== id);
  }
  return shown;
}

export const overlay: Overlay = (source, args, answer, writes) => {
  if (source === 'fetchCards') {
    const [col] = args as [string];
    return overlayCards(col, answer as Card[], writes) as never;
  }
  if (source === 'fetchChecklist') {
    const [cardId] = args as [number];
    return overlayChecklist(cardId, answer as Item[], writes) as never;
  }
  if (source === 'fetchArchived') {
    return overlayArchive(answer as Archived[], writes) as never;
  }
  return undefined;
};
