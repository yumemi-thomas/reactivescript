import * as api from './src/api.js';
import type { Answer, Result, Sources } from './app.contract.d.ts';

// The data module reaches only the backend's API (src/api.js).
export const grants = '';

const reason = (e: unknown): string => (e instanceof Error ? e.message : String(e));
const filterOf = (f: string): 'open' | 'closed' => (f === 'closed' ? 'closed' : 'open');

const sources: Sources = {
  listIssues: async ([filter]): Promise<Result<'listIssues'>> =>
    (await api.fetchIssues(filterOf(filter))).map((i) => ({ id: i.id, title: i.title, assignee: i.assignee ?? '' })),

  issueDetail: async ([id]): Promise<Result<'issueDetail'>> => {
    const issue = await api.fetchIssue(id);
    return issue === null
      ? { found: false, id, title: '', body: '' }
      : { found: true, id: issue.id, title: issue.title, body: issue.body };
  },

  issueComments: async ([id]): Promise<Result<'issueComments'>> =>
    (await api.fetchComments(id)).map((c) => ({ author: c.author, text: c.text })),

  issueLabels: async ([id]): Promise<Result<'issueLabels'>> => api.fetchLabels(id),

  searchHelp: async ([q]): Promise<Result<'searchHelp'>> =>
    (await api.search(q)).map((h) => ({ id: h.id, name: h.name })),

  loadHelpItem: async ([id]): Promise<Result<'loadHelpItem'>> => {
    const item = await api.fetchItem(id);
    return item === null
      ? { found: false, id, name: '', blurb: '' }
      : { found: true, id: item.id, name: item.name, blurb: item.blurb };
  },

  settingsLoad: async (): Promise<Result<'settingsLoad'>> => {
    const s = await api.loadSettings();
    return { name: s.name, theme: s.theme, density: s.density };
  },

  // A thrown refusal is a request failure (failure(saved)); the saved line keeps its previous value.
  saveSettingsNow: async ([name, theme, density]): Promise<Result<'saveSettingsNow'>> => {
    const s = await api.saveSettings({
      name,
      theme: theme === 'dark' ? 'dark' : 'light',
      density: density === 'compact' ? 'compact' : 'comfortable',
    });
    return { name: s.name, theme: s.theme, density: s.density };
  },

  // Every write answers a shaped reply, so the queue's `settle` runs for accepted and refused writes alike.
  writeOp: async ([key, kind, id, value, who]): Promise<Result<'writeOp'>> => {
    try {
      switch (kind) {
        case 'assign':
        case 'rowAssign':
          await api.assign(id, value);
          break;
        case 'rename':
          await api.renameIssue(id, value);
          break;
        case 'close':
        case 'rowClose':
          await api.closeIssue(id);
          break;
        case 'post':
          await api.addComment(id, who, value);
          break;
        case 'addLabel':
          await api.addLabel(id, value);
          break;
        case 'removeLabel':
          await api.removeLabel(id, value);
          break;
      }
      return { key, ok: true, error: '' };
    } catch (e) {
      return { key, ok: false, error: reason(e) };
    }
  },
};

export const answer: Answer = (source, args, store, storage, native) =>
  sources[source](args, store, storage, native);
