import type { Answer, Sources } from './app.contract.d.ts';
import * as api from './src/api.js';

export const grants = '';

type Column = 'todo' | 'doing' | 'done';

// The column names the view passes; anything unknown is refused by the server, so it is a To do card.
const toColumn = (c: string): Column => (c === 'doing' || c === 'done' ? c : 'todo');
const reason = (e: unknown): string => (e instanceof Error ? e.message : String(e));

// Reads answer with their error as data, so a column can show it and retry.
// Writes always answer a reply that echoes what the view needs to undo the change.
const sources: Sources = {
  fetchCards: ([column]) =>
    api.fetchCards(toColumn(column)).then(
      (cards) => ({ cards: cards.map((c) => ({ id: c.id, title: c.title, done: c.done, total: c.total })), error: '' }),
      (e) => ({ cards: [], error: reason(e) }),
    ),
  fetchChecklist: ([id]) =>
    api.fetchChecklist(id).then(
      (items) => ({ items: items.map((i) => ({ id: i.id, text: i.text, done: i.done })), error: '' }),
      (e) => ({ items: [], error: reason(e) }),
    ),
  fetchArchived: () =>
    api.fetchArchived().then(
      (items) => ({ items: items.map((a) => ({ id: a.id, title: a.title })), error: '' }),
      (e) => ({ items: [], error: reason(e) }),
    ),

  moveCard: ([id, column, index, fromColumn, fromIndex]) =>
    api.moveCard(id, toColumn(column), index).then(
      () => ({ ok: true, error: '', id, fromColumn, fromIndex }),
      (e) => ({ ok: false, error: reason(e), id, fromColumn, fromIndex }),
    ),
  renameCard: ([id, title, previous]) =>
    api.renameCard(id, title).then(
      () => ({ ok: true, error: '', id, previous }),
      (e) => ({ ok: false, error: reason(e), id, previous }),
    ),
  archiveCard: ([id, column, index, title, done, total]) =>
    api.archiveCard(id).then(
      () => ({ ok: true, error: '', id, column, index, title, done, total }),
      (e) => ({ ok: false, error: reason(e), id, column, index, title, done, total }),
    ),
  addCard: ([tmp, title]) =>
    api.addCard('todo', title).then(
      (c) => ({ ok: true, error: '', tmp, id: c.id }),
      (e) => ({ ok: false, error: reason(e), tmp, id: 0 }),
    ),
  toggleItem: ([cardId, itemId, done]) =>
    api.toggleItem(cardId, itemId, done).then(
      () => ({ ok: true, error: '', cardId, itemId, done }),
      (e) => ({ ok: false, error: reason(e), cardId, itemId, done }),
    ),
  addItem: ([cardId, text, tmp]) =>
    api.addItem(cardId, text).then(
      (i) => ({ ok: true, error: '', cardId, tmp, id: i.id }),
      (e) => ({ ok: false, error: reason(e), cardId, tmp, id: 0 }),
    ),
  restoreCard: ([id, title, index]) =>
    api.restoreCard(id).then(
      () => ({ ok: true, error: '', id, title, index }),
      (e) => ({ ok: false, error: reason(e), id, title, index }),
    ),
};

export const answer: Answer = (source, args, store, storage, native) =>
  sources[source](args, store, storage, native);
