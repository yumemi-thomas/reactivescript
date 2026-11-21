import * as api from './src/api.js';
import type { Answer, Sources } from './app.contract.d.ts';

export const grants = '';

const failure = (e: unknown): string => (e instanceof Error ? e.message : String(e));
const toRow = (i: { id: number; title: string; assignee: string | null }) => ({ id: i.id, title: i.title, assignee: i.assignee ?? '' });

const sources: Sources = {
  fetchOpen: async () => (await api.fetchIssues('open')).map(toRow),
  fetchClosed: async () => (await api.fetchIssues('closed')).map(toRow),
  fetchDetail: async ([id]) => {
    const d = await api.fetchIssue(id);
    return d === null
      ? { found: false, id, title: '', body: '' }
      : { found: true, id: d.id, title: d.title, body: d.body };
  },
  fetchRemarks: async ([id]) => (await api.fetchComments(id)).map((c) => ({ author: c.author, body: c.text })),
  fetchHits: async ([q]) => (await api.search(q)).map((h) => ({ id: h.id, name: h.name })),
  fetchItem: async ([id]) => {
    const it = await api.fetchItem(id);
    return it === null
      ? { found: false, id, name: '', blurb: '' }
      : { found: true, id: it.id, name: it.name, blurb: it.blurb };
  },
  loadPrefs: async () => {
    const s = await api.loadSettings();
    return { name: s.name, theme: s.theme, density: s.density };
  },
  savePrefs: async ([name, theme, density]) => {
    try {
      const s = await api.saveSettings({
        name,
        theme: theme as 'light' | 'dark',
        density: density as 'comfortable' | 'compact',
      });
      return { ok: true, error: '', name: s.name, theme: s.theme, density: s.density };
    } catch (e) {
      return { ok: false, error: failure(e), name: '', theme: '', density: '' };
    }
  },
  loadLabels: async ([id]) => ({ id, labels: await api.fetchLabels(id) }),
  changeLabel: async ([id, label, op, prev]) => {
    try {
      const labels = op === 'add' ? await api.addLabel(id, label) : await api.removeLabel(id, label);
      return { ok: true, error: '', id, labels, prev };
    } catch (e) {
      return { ok: false, error: failure(e), id, labels: prev, prev };
    }
  },
  changeIssue: async ([origin, id, field, value, prev]) => {
    try {
      if (field === 'assignee') await api.assign(id, value);
      else if (field === 'title') await api.renameIssue(id, value);
      else await api.closeIssue(id);
      return { ok: true, error: '', origin, id, field, prev };
    } catch (e) {
      return { ok: false, error: failure(e), origin, id, field, prev };
    }
  },
  postRemark: async ([seq, id, author, body]) => {
    try {
      await api.addComment(id, author, body);
      return { ok: true, error: '', seq, id };
    } catch (e) {
      return { ok: false, error: failure(e), seq, id };
    }
  },
};

export const answer: Answer = (source, args, store, storage, native) =>
  sources[source](args, store, storage, native);
