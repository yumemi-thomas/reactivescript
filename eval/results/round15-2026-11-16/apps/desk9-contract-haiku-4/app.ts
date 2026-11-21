import * as api from './src/api.js';
import type { Answer, Sources } from './app.contract.d.ts';

export const grants = '';

type Theme = 'light' | 'dark';
type Density = 'comfortable' | 'compact';

// A listing of issues: the server's answer, with an unassigned issue's assignee as ''.
const listing = (items: { id: number; title: string; assignee: string | null }[]) => ({
  loaded: true,
  items: items.map((i) => ({ id: i.id, title: i.title, assignee: i.assignee ?? '' })),
});

const hits = (items: { id: number; name: string }[]) => ({
  loaded: true,
  items: items.map((h) => ({ id: h.id, name: h.name })),
});

// A write's reply: a refusal is an answer (ok false, with the server's message), so the view can undo the edit.
async function outcome(seq: number, vis: number, fromRow: boolean, run: () => Promise<unknown>) {
  try {
    await run();
    return { seq, vis, fromRow, ok: true, error: '' };
  } catch (e) {
    return { seq, vis, fromRow, ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

const sources: Sources = {
  loadOpen: async () => listing(await api.fetchIssues('open')),
  loadClosed: async () => listing(await api.fetchIssues('closed')),

  loadDetail: async ([id]) => {
    const d = await api.fetchIssue(id);
    return d
      ? { loaded: true, found: true, title: d.title, body: d.body }
      : { loaded: true, found: false, title: '', body: '' };
  },
  loadRemarks: async ([id]) => ({
    loaded: true,
    items: (await api.fetchComments(id)).map((c) => ({ author: c.author, text: c.text })),
  }),
  loadLabels: async ([id]) => ({ loaded: true, items: await api.fetchLabels(id) }),
  findRelated: async ([title]) => hits(await api.search(title)),

  findHelp: async ([q]) => hits(await api.search(q)),
  loadItem: async ([id]) => {
    const it = await api.fetchItem(id);
    return it
      ? { loaded: true, found: true, name: it.name, blurb: it.blurb }
      : { loaded: true, found: false, name: '', blurb: '' };
  },

  loadSettings: async () => {
    const s = await api.loadSettings();
    return { loaded: true, name: s.name, theme: s.theme, density: s.density };
  },
  saveSettings: async ([name, theme, density]) => {
    try {
      const s = await api.saveSettings({ name, theme: theme as Theme, density: density as Density });
      return { ok: true, error: '', name: s.name, theme: s.theme, density: s.density };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e), name, theme, density };
    }
  },

  assignIssue: ([seq, vis, fromRow, id, user]) => outcome(seq, vis, fromRow, () => api.assign(id, user)),
  renameIssue: ([seq, vis, fromRow, id, title]) => outcome(seq, vis, fromRow, () => api.renameIssue(id, title)),
  closeIssue: ([seq, vis, fromRow, id]) => outcome(seq, vis, fromRow, () => api.closeIssue(id)),
  postComment: ([seq, vis, fromRow, id, author, text]) =>
    outcome(seq, vis, fromRow, () => api.addComment(id, author, text)),
  addLabel: ([seq, vis, fromRow, id, label]) => outcome(seq, vis, fromRow, () => api.addLabel(id, label)),
  removeLabel: ([seq, vis, fromRow, id, label]) => outcome(seq, vis, fromRow, () => api.removeLabel(id, label)),
};

export const answer: Answer = (source, args, store, storage, native) =>
  sources[source](args, store, storage, native);
