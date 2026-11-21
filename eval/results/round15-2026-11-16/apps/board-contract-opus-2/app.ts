// The sprint board's data module: each source asks src/api.js and projects its answer onto
// the shape app.contract declares, field by field. `overlay` lays the writes still in
// flight over the answers they change, so the view shows each write at once; a write the
// server declines stops showing in that commit, which puts the board back as it was.
import type { Answer, Overlay, Result, Sources, Write } from './app.contract.d.ts';
import * as api from './src/api.js';
import type { Column as ApiColumn } from './src/api.js';

export const grants = '';

type Card = Result<'loadCards'>[number];
type Item = Result<'loadChecklist'>[number];
type Archived = Result<'loadArchived'>[number];

const COLUMNS: readonly string[] = ['todo', 'doing', 'done'];
const asColumn = (name: string): ApiColumn => {
  if (!COLUMNS.includes(name)) throw new Error(`unknown column ${name}`);
  return name as ApiColumn;
};

/** A rejection becomes an Error whose message is the server's, whatever was thrown. */
const reason = (e: unknown): never => {
  if (e instanceof Error) throw e;
  const message = typeof e === 'string' ? e : (e as { message?: unknown } | null)?.message;
  throw new Error(typeof message === 'string' ? message : String(e));
};

const toCard = (c: { id: number; title: string; done: number; total: number }): Card => ({
  key: `c${c.id}`, id: c.id, title: c.title, done: c.done, total: c.total, adding: false,
});
const toItem = (i: { id: number; text: string; done: boolean }): Item => ({
  key: `i${i.id}`, id: i.id, text: i.text, done: i.done, adding: false,
});

const sources: Sources = {
  loadCards: ([column]) => api.fetchCards(asColumn(column)).then((cs) => cs.map(toCard), reason),
  loadChecklist: ([id]) => api.fetchChecklist(id).then((is) => is.map(toItem), reason),
  loadArchived: () => api.fetchArchived().then((as) => as.map((a): Archived => ({ id: a.id, title: a.title })), reason),

  moveCard: ([id, , to, index]) => api.moveCard(id, asColumn(to), index)
    .then((r) => ({ id: r.id, column: String(r.column), index: r.index }), reason),
  addCard: ([title]) => api.addCard('todo', title).then((r) => ({ id: r.id, title: r.title }), reason),
  renameCard: ([id, title]) => api.renameCard(id, title).then((r) => ({ id: r.id, title: r.title }), reason),
  archiveCard: ([id]) => api.archiveCard(id).then((r) => ({ id: r.id }), reason),
  toggleItem: ([cardId, itemId, done]) => api.toggleItem(cardId, itemId, done)
    .then((r) => ({ id: r.id, done: r.done }), reason),
  addItem: ([cardId, text]) => api.addItem(cardId, text)
    .then((r) => ({ id: r.id, text: r.text, done: r.done }), reason),
  restoreCard: ([id]) => api.restoreCard(id).then((r) => ({ id: r.id }), reason),
};
export const answer: Answer = (source, args, store, storage, native) =>
  sources[source](args, store, storage, native);

// ---- the overlay ----------------------------------------------------------------------

/** The writes an answer does not include yet, in the order they were sent. */
const unanswered = (writes: readonly Write[]): Write[] =>
  writes.filter((w) => !w.answered).sort((a, b) => a.id - b.id);

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

function overlayColumn(column: string, answer: Card[], writes: readonly Write[]): Card[] {
  let list = answer.map((c) => ({ ...c }));
  const indexOf = (id: number) => list.findIndex((c) => !c.adding && c.id === id);
  const update = (id: number, f: (c: Card) => Card) => { list = list.map((c) => (!c.adding && c.id === id ? f(c) : c)); };
  for (const w of unanswered(writes)) {
    switch (w.source) {
      case 'moveCard': {
        const [id, , to, index, title, done, total] = w.args;
        const at = indexOf(id);
        const card = at >= 0 ? list[at] : toCard({ id, title, done, total });
        if (at >= 0) list.splice(at, 1);
        if (to === column) list.splice(clamp(index, 0, list.length), 0, card);
        break;
      }
      case 'addCard': {
        if (column !== 'todo') break;
        const [title] = w.args;
        if (w.reply) {
          if (indexOf(w.reply.id) < 0) list.push(toCard({ id: w.reply.id, title: w.reply.title, done: 0, total: 0 }));
        } else {
          list.push({ key: `new-${w.id}`, id: 0, title, done: 0, total: 0, adding: true });
        }
        break;
      }
      case 'renameCard': {
        const [id, title] = w.args;
        update(id, (c) => ({ ...c, title }));
        break;
      }
      case 'archiveCard': {
        const at = indexOf(w.args[0]);
        if (at >= 0) list.splice(at, 1);
        break;
      }
      case 'toggleItem': {
        const [cardId, , done] = w.args;
        update(cardId, (c) => ({ ...c, done: clamp(c.done + (done ? 1 : -1), 0, c.total) }));
        break;
      }
      case 'addItem': {
        const [cardId] = w.args;
        update(cardId, (c) => ({ ...c, total: c.total + 1 }));
        break;
      }
      default:
        break;
    }
  }
  return list;
}

function overlayChecklist(cardId: number, answer: Item[], writes: readonly Write[]): Item[] {
  let list = answer.map((i) => ({ ...i }));
  for (const w of unanswered(writes)) {
    if (w.source === 'toggleItem') {
      const [card, itemId, done] = w.args;
      if (card !== cardId) continue;
      list = list.map((i) => (!i.adding && i.id === itemId ? { ...i, done } : i));
    } else if (w.source === 'addItem') {
      const [card, text] = w.args;
      if (card !== cardId) continue;
      if (w.reply) {
        const r = w.reply;
        if (!list.some((i) => !i.adding && i.id === r.id)) list.push(toItem(r));
      } else {
        list.push({ key: `new-${w.id}`, id: 0, text, done: false, adding: true });
      }
    }
  }
  return list;
}

function overlayArchived(answer: Archived[], writes: readonly Write[]): Archived[] {
  let list = answer.map((a) => ({ ...a }));
  for (const w of unanswered(writes)) {
    if (w.source === 'restoreCard') list = list.filter((a) => a.id !== w.args[0]);
  }
  return list;
}

export const overlay: Overlay = (source, args, answer, writes) => {
  if (source === 'loadCards') {
    return overlayColumn((args as unknown as [string])[0], answer as Card[], writes) as never;
  }
  if (source === 'loadChecklist') {
    return overlayChecklist((args as unknown as [number])[0], answer as Item[], writes) as never;
  }
  if (source === 'loadArchived') return overlayArchived(answer as Archived[], writes) as never;
  return undefined;
};
