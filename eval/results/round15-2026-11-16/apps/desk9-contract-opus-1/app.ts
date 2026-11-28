// The data module: each source asks the backend (src/api.js) and answers exactly its
// shape; `overlay` lays the writes still in the air over the answers they change, so
// a write shows at once and goes away by itself when the server declines it.
import type { Answer, Overlay, Result, Sources } from './app.contract.d.ts';
import * as api from './src/api.js';

export const grants = '';

type Issue = Result<'fetchIssues'>[number];
type Detail = Result<'fetchIssue'>;
type Comment = Result<'fetchComments'>[number];
type Labels = Result<'fetchLabels'>;

/** A rejection the view shows: keep the backend's own message. */
const rethrow = (e: unknown): never => {
  throw new Error(e instanceof Error ? e.message : String(e));
};

const theme = (t: string): api.Theme => (t === 'dark' ? 'dark' : 'light');
const density = (d: string): api.Density => (d === 'comfortable' ? 'comfortable' : 'compact');

const sources: Sources = {
  fetchIssues: async ([filter]): Promise<Result<'fetchIssues'>> => {
    const rows = await api.fetchIssues(filter === 'closed' ? 'closed' : 'open').catch(rethrow);
    return rows.map((r) => ({ id: r.id, title: r.title, assignee: r.assignee ?? '', assigned: r.assignee !== null }));
  },
  fetchIssue: async ([id]): Promise<Result<'fetchIssue'>> => {
    const d = await api.fetchIssue(id).catch(rethrow);
    return d ? { found: true, id: d.id, title: d.title, body: d.body } : { found: false, id, title: '', body: '' };
  },
  fetchComments: async ([id]): Promise<Result<'fetchComments'>> => {
    const cs = await api.fetchComments(id).catch(rethrow);
    return cs.map((c) => ({ author: c.author, text: c.text, sending: false }));
  },
  fetchLabels: async ([id]): Promise<Result<'fetchLabels'>> => {
    const ls = await api.fetchLabels(id).catch(rethrow);
    return { labels: [...ls] };
  },
  search: async ([q]): Promise<Result<'search'>> => {
    const hits = await api.search(q).catch(rethrow);
    return { q, hits: hits.map((h) => ({ id: h.id, name: h.name })) };
  },
  fetchItem: async ([id]): Promise<Result<'fetchItem'>> => {
    const it = await api.fetchItem(id).catch(rethrow);
    return it ? { found: true, id: it.id, name: it.name, blurb: it.blurb } : { found: false, id, name: '', blurb: '' };
  },
  loadSettings: async (): Promise<Result<'loadSettings'>> => {
    const s = await api.loadSettings().catch(rethrow);
    return { name: s.name, theme: s.theme, density: s.density };
  },

  assign: async ([id, user]): Promise<Result<'assign'>> => {
    const r = await api.assign(id, user).catch(rethrow);
    return { id: r.id };
  },
  renameIssue: async ([id, title]): Promise<Result<'renameIssue'>> => {
    const r = await api.renameIssue(id, title).catch(rethrow);
    return { id: r.id };
  },
  closeIssue: async ([id]): Promise<Result<'closeIssue'>> => {
    const r = await api.closeIssue(id).catch(rethrow);
    return { id: r.id };
  },
  addComment: async ([id, author, text]): Promise<Result<'addComment'>> => {
    const c = await api.addComment(id, author, text).catch(rethrow);
    return { author: c.author, text: c.text };
  },
  addLabel: async ([id, label]): Promise<Result<'addLabel'>> => {
    const ls = await api.addLabel(id, label).catch(rethrow);
    return { labels: [...ls] };
  },
  removeLabel: async ([id, label]): Promise<Result<'removeLabel'>> => {
    const ls = await api.removeLabel(id, label).catch(rethrow);
    return { labels: [...ls] };
  },
  saveSettings: async ([name, t, d]): Promise<Result<'saveSettings'>> => {
    const s = await api.saveSettings({ name, theme: theme(t), density: density(d) }).catch(rethrow);
    return { name: s.name, theme: s.theme, density: s.density };
  },
};
export const answer: Answer = (source, args, store, storage, native) =>
  sources[source](args, store, storage, native);

type Write = Parameters<Overlay>[3][number];

/** The writes the answer does not include yet: those out, and those whose reply landed after it was asked. */
const showing = (writes: readonly Write[]) => writes.filter((w) => !w.answered);

const overIssues = ([filter]: unknown[], answer: Issue[], writes: readonly Write[]): Issue[] => {
  let shown = answer.map((i) => ({ ...i }));
  for (const w of showing(writes)) {
    if (w.source === 'assign') {
      const [id, user] = w.args as [number, string];
      shown = shown.map((i) => (i.id === id ? { ...i, assignee: user, assigned: true } : i));
    } else if (w.source === 'renameIssue') {
      const [id, title] = w.args as [number, string];
      shown = shown.map((i) => (i.id === id ? { ...i, title } : i));
    } else if (w.source === 'closeIssue' && filter === 'open') {
      const [id] = w.args as [number];
      shown = shown.filter((i) => i.id !== id);
    }
  }
  return shown;
};

const overDetail = ([id]: unknown[], answer: Detail, writes: readonly Write[]): Detail => {
  let shown = { ...answer };
  for (const w of showing(writes)) {
    if (w.source !== 'renameIssue') continue;
    const [wid, title] = w.args as [number, string];
    if (wid === id && shown.found) shown = { ...shown, title };
  }
  return shown;
};

const overComments = ([id]: unknown[], answer: Comment[], writes: readonly Write[]): Comment[] => {
  const shown = answer.map((c) => ({ ...c }));
  for (const w of showing(writes)) {
    if (w.source !== 'addComment') continue;
    const [wid, author, text] = w.args as [number, string, string];
    if (wid !== id) continue;
    const reply = w.reply as { author: string; text: string } | undefined;
    shown.push(reply ? { author: reply.author, text: reply.text, sending: false } : { author, text, sending: true });
  }
  return shown;
};

const overLabels = ([id]: unknown[], answer: Labels, writes: readonly Write[]): Labels => {
  let labels = [...answer.labels];
  for (const w of showing(writes)) {
    const [wid, label] = w.args as [number, string];
    if (wid !== id) continue;
    if (w.source === 'addLabel' && !labels.includes(label)) labels = [...labels, label];
    else if (w.source === 'removeLabel') labels = labels.filter((l) => l !== label);
  }
  return { labels };
};

export const overlay: Overlay = (source, args, answer, writes) => {
  const a = args as unknown[];
  switch (source) {
    case 'fetchIssues': return overIssues(a, answer as Issue[], writes) as never;
    case 'fetchIssue': return overDetail(a, answer as Detail, writes) as never;
    case 'fetchComments': return overComments(a, answer as Comment[], writes) as never;
    case 'fetchLabels': return overLabels(a, answer as Labels, writes) as never;
    default: return undefined;
  }
};
