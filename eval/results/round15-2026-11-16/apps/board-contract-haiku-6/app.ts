import * as api from './src/api.js';
import type { Answer, Sources } from './app.contract.d.ts';

// The data module only adapts the backend to the view: every call answers its reply
// shape, and a refused call is an ok: false reply carrying the server's message, so the
// view can put optimistic changes back. `session` (the board's visit) is echoed so the
// view ignores replies that belong to a visit it has left.
export const grants = '';

type Column = 'todo' | 'doing' | 'done';
const column = (name: string): Column => name as Column;
const reason = (e: unknown): string => (e instanceof Error ? e.message : String(e));

const sources: Sources = {
  fetchCards: ([name]) =>
    api.fetchCards(column(name)).then(
      (cards) => ({ ok: true, error: '', cards: cards.map(({ id, title, done, total }) => ({ id, title, done, total })) }),
      (e) => ({ ok: false, error: reason(e), cards: [] }),
    ),
  moveCard: ([card, fromCol, fromPos, toCol, toPos, session]) =>
    api.moveCard(card.id, column(toCol), toPos).then(
      () => ({ ok: true, error: '', card, fromCol, fromPos, session }),
      (e) => ({ ok: false, error: reason(e), card, fromCol, fromPos, session }),
    ),
  renameCard: ([id, title, prev, session]) =>
    api.renameCard(id, title).then(
      () => ({ ok: true, error: '', id, prev, session }),
      (e) => ({ ok: false, error: reason(e), id, prev, session }),
    ),
  addCard: ([tempId, title, session]) =>
    api.addCard('todo', title).then(
      (card) => ({ ok: true, error: '', tempId, id: card.id, session }),
      (e) => ({ ok: false, error: reason(e), tempId, id: 0, session }),
    ),
  archiveCard: ([card, fromCol, fromPos, session]) =>
    api.archiveCard(card.id).then(
      () => ({ ok: true, error: '', card, fromCol, fromPos, session }),
      (e) => ({ ok: false, error: reason(e), card, fromCol, fromPos, session }),
    ),
  fetchChecklist: ([cardId]) =>
    api.fetchChecklist(cardId).then(
      (items) => ({ ok: true, error: '', items: items.map(({ id, text, done }) => ({ id, text, done })) }),
      (e) => ({ ok: false, error: reason(e), items: [] }),
    ),
  toggleItem: ([cardId, itemId, done, session]) =>
    api.toggleItem(cardId, itemId, done).then(
      () => ({ ok: true, error: '', cardId, itemId, done, session }),
      (e) => ({ ok: false, error: reason(e), cardId, itemId, done, session }),
    ),
  addItem: ([cardId, text, tempId, session]) =>
    api.addItem(cardId, text).then(
      (item) => ({ ok: true, error: '', cardId, tempId, id: item.id, session }),
      (e) => ({ ok: false, error: reason(e), cardId, tempId, id: 0, session }),
    ),
  fetchArchived: () =>
    api.fetchArchived().then(
      (rows) => ({ ok: true, error: '', items: rows.map(({ id, title }) => ({ id, title })) }),
      (e) => ({ ok: false, error: reason(e), items: [] }),
    ),
  restoreCard: ([row, pos, session]) =>
    api.restoreCard(row.id).then(
      () => ({ ok: true, error: '', row, pos, session }),
      (e) => ({ ok: false, error: reason(e), row, pos, session }),
    ),
};

export const answer: Answer = (source, args, store, storage, native) =>
  sources[source](args, store, storage, native);
