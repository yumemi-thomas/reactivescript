import * as api from './src/api.js';
import type { Answer, Sources } from './app.contract.d.ts';

export const grants = '';

const msg = (e: unknown): string => (e instanceof Error ? e.message : String(e));

const sources: Sources = {
  loadIssues: async ([filter]) => {
    const items = await api.fetchIssues(filter as 'open' | 'closed');
    return { ok: true, items: items.map((i) => ({ id: i.id, title: i.title, assignee: i.assignee ?? '' })) };
  },
  loadIssue: async ([id]) => {
    const d = await api.fetchIssue(id);
    return d === null
      ? { found: false, id, title: '', body: '' }
      : { found: true, id: d.id, title: d.title, body: d.body };
  },
  loadComments: async ([id]) => (await api.fetchComments(id)).map((c) => ({ author: c.author, text: c.text })),
  loadLabels: ([id]) => api.fetchLabels(id),
  findHelp: async ([q]) => (await api.search(q)).map((h) => ({ id: h.id, name: h.name })),
  loadItem: async ([id]) => {
    const it = await api.fetchItem(id);
    return it === null
      ? { found: false, id, name: '', blurb: '' }
      : { found: true, id: it.id, name: it.name, blurb: it.blurb };
  },
  loadSettings: async () => {
    const s = await api.loadSettings();
    return { name: s.name, theme: s.theme, density: s.density };
  },
  doWrite: async ([seq, kind, scope, id, value, who]) => {
    try {
      if (kind === 'assign') await api.assign(id, value);
      else if (kind === 'rename') await api.renameIssue(id, value);
      else if (kind === 'close') await api.closeIssue(id);
      else if (kind === 'post') await api.addComment(id, who, value);
      else if (kind === 'label+') await api.addLabel(id, value);
      else await api.removeLabel(id, value);
      return { seq, kind, scope, id, ok: true, error: '' };
    } catch (e) {
      return { seq, kind, scope, id, ok: false, error: msg(e) };
    }
  },
  saveSettings: async ([name, theme, density]) => {
    try {
      const s = await api.saveSettings({
        name,
        theme: theme as 'light' | 'dark',
        density: density as 'comfortable' | 'compact',
      });
      return { ok: true, name: s.name, theme: s.theme, density: s.density, error: '' };
    } catch (e) {
      return { ok: false, name, theme, density, error: msg(e) };
    }
  },
};

export const answer: Answer = (source, args, store, storage, native) =>
  sources[source](args, store, storage, native);
