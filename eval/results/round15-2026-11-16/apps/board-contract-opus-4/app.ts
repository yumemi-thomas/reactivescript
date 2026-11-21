// The board's data module: each source asks the backend (src/api.js) and answers its shape.
// A rejected call is answered as data (`ok: false` with the server's message), so the view
// can say why; `overlay` draws every write before its reply and drops a declined one.
import type { Answer, Overlay, Result, Sources, Write } from './app.contract.d.ts';
import * as api from './src/api.js';

export const grants = '';

type Card = Result<'loadColumn'>['cards'][number];
type Item = Result<'loadChecklist'>['items'][number];
type Archived = Result<'loadArchived'>['cards'][number];
type ColumnKey = 'todo' | 'doing' | 'done';

const COLUMNS: readonly string[] = ['todo', 'doing', 'done'];
const asColumn = (c: string): ColumnKey => {
  if (!COLUMNS.includes(c)) throw new Error(`unknown column ${c}`);
  return c as ColumnKey;
};
const messageOf = (e: unknown): string => (e instanceof Error ? e.message : String(e));
const refused = (e: unknown, tag: number) => ({ ok: false, error: messageOf(e), tag });

const card = (c: { id: number; title: string; done: number; total: number }): Card =>
  ({ id: c.id, title: c.title, done: c.done, total: c.total });
const item = (i: { id: number; text: string; done: boolean }): Item => ({ id: i.id, text: i.text, done: i.done });

const sources: Sources = {
  loadColumn: async ([column]): Promise<Result<'loadColumn'>> => {
    try {
      const cards = await api.fetchCards(asColumn(column));
      return { ok: true, error: '', cards: cards.map(card) };
    } catch (e) {
      return { ok: false, error: messageOf(e), cards: [] };
    }
  },
  loadChecklist: async ([id]): Promise<Result<'loadChecklist'>> => {
    try {
      const items = await api.fetchChecklist(id);
      return { ok: true, error: '', items: items.map(item) };
    } catch (e) {
      return { ok: false, error: messageOf(e), items: [] };
    }
  },
  loadArchived: async (): Promise<Result<'loadArchived'>> => {
    try {
      const cards = await api.fetchArchived();
      return { ok: true, error: '', cards: cards.map((a): Archived => ({ id: a.id, title: a.title })) };
    } catch (e) {
      return { ok: false, error: messageOf(e), cards: [] };
    }
  },
  moveCard: async ([id, column, index, , , , tag]): Promise<Result<'moveCard'>> => {
    try {
      await api.moveCard(id, asColumn(column), index);
      return { ok: true, error: '', tag };
    } catch (e) {
      return refused(e, tag);
    }
  },
  addCard: async ([column, title, tag]): Promise<Result<'addCard'>> => {
    try {
      const added = await api.addCard(asColumn(column), title);
      return { ok: true, error: '', tag, id: added.id, title: added.title };
    } catch (e) {
      return { ...refused(e, tag), id: 0, title };
    }
  },
  renameCard: async ([id, title, tag]): Promise<Result<'renameCard'>> => {
    try {
      await api.renameCard(id, title);
      return { ok: true, error: '', tag };
    } catch (e) {
      return refused(e, tag);
    }
  },
  archiveCard: async ([id, tag]): Promise<Result<'archiveCard'>> => {
    try {
      await api.archiveCard(id);
      return { ok: true, error: '', tag };
    } catch (e) {
      return refused(e, tag);
    }
  },
  // `was` is the item's state as shown when toggled; only the overlay reads it.
  toggleItem: async ([cardId, itemId, done, , tag]): Promise<Result<'toggleItem'>> => {
    try {
      await api.toggleItem(cardId, itemId, done);
      return { ok: true, error: '', tag };
    } catch (e) {
      return refused(e, tag);
    }
  },
  addItem: async ([cardId, text, tag]): Promise<Result<'addItem'>> => {
    try {
      const added = await api.addItem(cardId, text);
      return { ok: true, error: '', tag, id: added.id, text: added.text, done: added.done };
    } catch (e) {
      return { ...refused(e, tag), id: 0, text, done: false };
    }
  },
  restoreCard: async ([id, tag]): Promise<Result<'restoreCard'>> => {
    try {
      await api.restoreCard(id);
      return { ok: true, error: '', tag };
    } catch (e) {
      return refused(e, tag);
    }
  },
};
export const answer: Answer = (source, args, store, storage, native) => sources[source](args, store, storage, native);

// A write shows until the answer asked after its reply includes it; one the server declined
// (`ok: false`) shows no more, so what it changed goes back by itself.
const live = (w: Write): boolean => !w.answered && (w.reply === undefined || w.reply.ok);
// A row still waiting for its id gets a negative one, unique among the writes.
const placeholderId = (w: Write): number => -(w.id + 1);

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

function overlayColumn(column: string, answer: Result<'loadColumn'>, writes: readonly Write[]): Result<'loadColumn'> {
  if (!answer.ok) return answer;
  let cards = answer.cards.map(card);
  // Each item's state as the writes so far leave it, so a toggle counts only what it changes
  // (two quick toggles, the first declined, leave the count where it was).
  const itemState = new Map<string, boolean>();
  for (const w of writes) {
    if (w.source === 'toggleItem' && !w.answered) {
      const [cardId, itemId, done, was] = w.args;
      const key = `${cardId}:${itemId}`;
      const before = itemState.get(key) ?? was;
      if (!live(w)) {
        itemState.set(key, before);
        continue;
      }
      itemState.set(key, done);
      const delta = (done ? 1 : 0) - (before ? 1 : 0);
      if (delta !== 0) {
        cards = cards.map((c) => (c.id === cardId ? { ...c, done: clamp(c.done + delta, 0, c.total) } : c));
      }
      continue;
    }
    if (!live(w)) continue;
    switch (w.source) {
      case 'moveCard': {
        const [id, to, index, title, done, total] = w.args;
        const existing = cards.find((c) => c.id === id);
        cards = cards.filter((c) => c.id !== id);
        if (to === column) {
          const moved = existing ?? { id, title, done, total };
          cards.splice(clamp(index, 0, cards.length), 0, moved);
        }
        break;
      }
      case 'addCard': {
        const [to, title] = w.args;
        if (to !== column) break;
        const r = w.reply;
        const id = r ? r.id : placeholderId(w);
        if (cards.some((c) => c.id === id)) break;
        cards.push({ id, title: r ? r.title : title, done: 0, total: 0 });
        break;
      }
      case 'renameCard': {
        const [id, title] = w.args;
        cards = cards.map((c) => (c.id === id ? { ...c, title } : c));
        break;
      }
      case 'archiveCard': {
        const [id] = w.args;
        cards = cards.filter((c) => c.id !== id);
        break;
      }
      case 'addItem': {
        const [cardId] = w.args;
        cards = cards.map((c) => (c.id === cardId ? { ...c, total: c.total + 1 } : c));
        break;
      }
      default:
        break;
    }
  }
  return { ok: answer.ok, error: answer.error, cards };
}

function overlayChecklist(cardId: number, answer: Result<'loadChecklist'>, writes: readonly Write[]): Result<'loadChecklist'> {
  if (!answer.ok) return answer;
  let items = answer.items.map(item);
  for (const w of writes) {
    if (!live(w)) continue;
    if (w.source === 'toggleItem') {
      const [card, itemId, done] = w.args;
      if (card !== cardId) continue;
      items = items.map((i) => (i.id === itemId ? { ...i, done } : i));
    } else if (w.source === 'addItem') {
      const [card, text] = w.args;
      if (card !== cardId) continue;
      const r = w.reply;
      const id = r ? r.id : placeholderId(w);
      if (items.some((i) => i.id === id)) continue;
      items.push(r ? { id: r.id, text: r.text, done: r.done } : { id, text, done: false });
    }
  }
  return { ok: answer.ok, error: answer.error, items };
}

function overlayArchived(answer: Result<'loadArchived'>, writes: readonly Write[]): Result<'loadArchived'> {
  if (!answer.ok) return answer;
  let cards = answer.cards.map((a) => ({ id: a.id, title: a.title }));
  for (const w of writes) {
    if (!live(w) || w.source !== 'restoreCard') continue;
    const [id] = w.args;
    cards = cards.filter((c) => c.id !== id);
  }
  return { ok: answer.ok, error: answer.error, cards };
}

export const overlay: Overlay = (source, args, answer, writes) => {
  switch (source) {
    case 'loadColumn':
      return overlayColumn((args as [string])[0], answer as Result<'loadColumn'>, writes) as never;
    case 'loadChecklist':
      return overlayChecklist((args as [number])[0], answer as Result<'loadChecklist'>, writes) as never;
    case 'loadArchived':
      return overlayArchived(answer as Result<'loadArchived'>, writes) as never;
    default:
      return undefined;
  }
};
