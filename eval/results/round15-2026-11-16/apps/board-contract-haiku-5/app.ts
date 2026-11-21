// The data module: each source calls the backend (src/api.js) and answers with its reply shape.
// A backend refusal or failure is answered as ok: false with the message, so the view can
// settle its optimistic change; nothing is thrown from here.
import * as api from './src/api.js';
import type { Answer, Result, Sources } from './app.contract.d.ts';

export const grants = '';

type Column = 'todo' | 'doing' | 'done';
const column = (c: string): Column => c as Column;
const reason = (e: unknown): string => (e instanceof Error ? e.message : String(e));

const sources: Sources = {
  loadColumn: async ([name]): Promise<Result<'loadColumn'>> => {
    const c = column(name);
    try {
      const cards = await api.fetchCards(c);
      return {
        ok: true,
        error: '',
        tiles: cards.map((card, pos) => ({
          uid: `c${card.id}`, id: card.id, title: card.title, done: card.done, total: card.total, column: c, pos,
        })),
      };
    } catch (e) {
      return { ok: false, error: reason(e), tiles: [] };
    }
  },

  moveCard: async ([visit, uid, id, dest, index, fromColumn, fromPos]): Promise<Result<'moveCard'>> => {
    try {
      await api.moveCard(id, column(dest), index);
      return { ok: true, error: '', visit, uid, fromColumn, fromPos };
    } catch (e) {
      return { ok: false, error: reason(e), visit, uid, fromColumn, fromPos };
    }
  },

  renameCard: async ([visit, uid, id, title, oldTitle]): Promise<Result<'renameCard'>> => {
    try {
      await api.renameCard(id, title);
      return { ok: true, error: '', visit, uid, oldTitle };
    } catch (e) {
      return { ok: false, error: reason(e), visit, uid, oldTitle };
    }
  },

  addCard: async ([visit, uid, name, title]): Promise<Result<'addCard'>> => {
    try {
      const card = await api.addCard(column(name), title);
      return { ok: true, error: '', visit, uid, id: card.id };
    } catch (e) {
      return { ok: false, error: reason(e), visit, uid, id: 0 };
    }
  },

  archiveCard: async ([visit, uid, id, title, done, total, name, pos]): Promise<Result<'archiveCard'>> => {
    try {
      await api.archiveCard(id);
      return { ok: true, error: '', visit, uid, id, title, done, total, column: name, pos };
    } catch (e) {
      return { ok: false, error: reason(e), visit, uid, id, title, done, total, column: name, pos };
    }
  },

  loadChecklist: async ([cardId]): Promise<Result<'loadChecklist'>> => {
    try {
      const items = await api.fetchChecklist(cardId);
      return {
        ok: true,
        error: '',
        cardId,
        items: items.map((i) => ({ id: i.id, text: i.text, done: i.done })),
      };
    } catch (e) {
      return { ok: false, error: reason(e), cardId, items: [] };
    }
  },

  toggleItem: async ([visit, uid, cardId, itemId, done]): Promise<Result<'toggleItem'>> => {
    try {
      await api.toggleItem(cardId, itemId, done);
      return { ok: true, error: '', visit, uid, cardId, itemId, done };
    } catch (e) {
      return { ok: false, error: reason(e), visit, uid, cardId, itemId, done };
    }
  },

  addItem: async ([visit, uid, cardId, text, localId]): Promise<Result<'addItem'>> => {
    try {
      const item = await api.addItem(cardId, text);
      return { ok: true, error: '', visit, uid, cardId, localId, id: item.id };
    } catch (e) {
      return { ok: false, error: reason(e), visit, uid, cardId, localId, id: 0 };
    }
  },

  loadArchived: async (): Promise<Result<'loadArchived'>> => {
    try {
      const rows = await api.fetchArchived();
      return { ok: true, error: '', rows: rows.map((r) => ({ id: r.id, title: r.title })) };
    } catch (e) {
      return { ok: false, error: reason(e), rows: [] };
    }
  },

  restoreCard: async ([visit, id, title, index]): Promise<Result<'restoreCard'>> => {
    try {
      await api.restoreCard(id);
      return { ok: true, error: '', visit, id, title, index };
    } catch (e) {
      return { ok: false, error: reason(e), visit, id, title, index };
    }
  },
};

export const answer: Answer = (source, args, store, storage, native) =>
  sources[source](args, store, storage, native);
