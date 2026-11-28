// The board's data module: each source calls the backend and answers exactly its declared
// shape. A refused write is a normal reply (ok: false with the server's message), so the
// board can undo it; a failed read is an answer with ok: false, so the column can show it.
import * as api from './src/api.js';
import type { Column } from './src/api.js';
import type { Answer, Sources } from './app.contract.d.ts';

export const grants = '';

const reason = (e: unknown): string => (e instanceof Error && e.message ? e.message : 'request failed');

const tile = (c: { id: number; title: string; done: number; total: number }) => ({
  key: `c${c.id}`, id: c.id, tmp: 0, title: c.title, done: c.done, total: c.total, adding: false,
});

const checkItem = (i: { id: number; text: string; done: boolean }) => ({
  key: `i${i.id}`, id: i.id, tmp: 0, label: i.text, done: i.done, adding: false,
});

const sources: Sources = {
  loadColumn: async ([column]) => {
    try {
      const cards = await api.fetchCards(column as Column);
      return { ok: true, error: '', tiles: cards.map(tile) };
    } catch (e) {
      return { ok: false, error: reason(e), tiles: [] };
    }
  },
  loadChecklist: async ([id]) => {
    try {
      const items = await api.fetchChecklist(id);
      return { ok: true, error: '', items: items.map(checkItem) };
    } catch (e) {
      return { ok: false, error: reason(e), items: [] };
    }
  },
  loadArchive: async () => {
    try {
      const cards = await api.fetchArchived();
      return { ok: true, error: '', cards: cards.map((c) => ({ id: c.id, title: c.title })) };
    } catch (e) {
      return { ok: false, error: reason(e), cards: [] };
    }
  },
  writeOp: async ([op]) => {
    try {
      let id = 0;
      switch (op.kind) {
        case 'move': await api.moveCard(op.id, op.col as Column, op.pos); break;
        case 'rename': await api.renameCard(op.id, op.label); break;
        case 'archive': await api.archiveCard(op.id); break;
        case 'add': id = (await api.addCard('todo', op.label)).id; break;
        case 'toggle': await api.toggleItem(op.id, op.itemId, op.flag); break;
        case 'addItem': id = (await api.addItem(op.id, op.label)).id; break;
        case 'restore': await api.restoreCard(op.id); break;
        default: throw new Error(`unknown write ${op.kind}`);
      }
      return { ok: true, error: '', id, op };
    } catch (e) {
      return { ok: false, error: reason(e), id: 0, op };
    }
  },
};

export const answer: Answer = (source, args, store, storage, native) => sources[source](args, store, storage, native);
