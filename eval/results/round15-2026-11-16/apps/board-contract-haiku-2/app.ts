import type { Answer, Sources } from './app.contract.d.ts';
import * as api from './src/api.js';

export const grants = '';

type Column = 'todo' | 'doing' | 'done';

// A declined write is a reply, not a throw: the view reverts it and shows the message.
const reason = (e: unknown): string => (e instanceof Error ? e.message : String(e));

const sources: Sources = {
  fetchCards: ([column]) => api.fetchCards(column as Column),
  fetchChecklist: ([id]) => api.fetchChecklist(id),
  fetchArchived: () => api.fetchArchived(),

  moveCard: async ([id, column, index, fromCol, fromIndex]) => {
    try {
      await api.moveCard(id, column as Column, index);
      return { ok: true, error: '', id, column, index, fromCol, fromIndex };
    } catch (e) {
      return { ok: false, error: reason(e), id, column, index, fromCol, fromIndex };
    }
  },

  renameCard: async ([id, title, oldTitle]) => {
    try {
      const r = await api.renameCard(id, title);
      return { ok: true, error: '', id: r.id, title: r.title, oldTitle };
    } catch (e) {
      return { ok: false, error: reason(e), id, title, oldTitle };
    }
  },

  archiveCard: async ([id, column, index, title, done, total]) => {
    try {
      const r = await api.archiveCard(id);
      return { ok: true, error: '', id: r.id, column, index, title, done, total };
    } catch (e) {
      return { ok: false, error: reason(e), id, column, index, title, done, total };
    }
  },

  addCard: async ([column, title, tmp]) => {
    try {
      const r = await api.addCard(column as Column, title);
      return { ok: true, error: '', tmp, id: r.id, title: r.title };
    } catch (e) {
      return { ok: false, error: reason(e), tmp, id: 0, title };
    }
  },

  toggleItem: async ([cardId, itemId, done]) => {
    try {
      const r = await api.toggleItem(cardId, itemId, done);
      return { ok: true, error: '', cardId, itemId, done: r.done };
    } catch (e) {
      return { ok: false, error: reason(e), cardId, itemId, done };
    }
  },

  addItem: async ([cardId, label, tmp]) => {
    try {
      const r = await api.addItem(cardId, label);
      return { ok: true, error: '', cardId, tmp, id: r.id, label: r.text };
    } catch (e) {
      return { ok: false, error: reason(e), cardId, tmp, id: 0, label };
    }
  },

  restoreCard: async ([id]) => {
    try {
      const r = await api.restoreCard(id);
      return { ok: true, error: '', id: r.id };
    } catch (e) {
      return { ok: false, error: reason(e), id };
    }
  },
};

export const answer: Answer = (source, args, store, storage, native) =>
  sources[source](args, store, storage, native);
