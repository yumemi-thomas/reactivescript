// The data module: each source asks the backend (`src/api.js`) and projects its answer onto
// the Contract's shapes. Reads let a rejection through, so the resource fails with its message
// and keeps its last answer; writes turn a decline into a reply (`ok: false`) carrying the
// server's message and the token the view sent, so the view shows the newest write's error.
// `overlay` lays the writes still out over the answers they change: the optimistic view.
import type { Answer, Overlay, Result, Sources, Write } from './app.contract.d.ts';
import * as api from './src/api.js';

export const grants = '';

type Issue = Result<'loadIssues'>['items'][number];
type Detail = Result<'loadIssue'>;
type Comment = Result<'loadComments'>[number];
type Reply = Result<'assignIssue'>;

const message = (e: unknown): string => (e instanceof Error ? e.message : String(e));

const issue = (i: { id: number; title: string; assignee: string | null }): Issue => ({
  id: i.id,
  title: i.title,
  hasAssignee: i.assignee !== null,
  assignee: i.assignee ?? '',
});

/** Runs a write; a decline is a reply, not a failure, so the view can say why. */
async function write(token: number, run: () => Promise<unknown>): Promise<Reply> {
  try {
    await run();
    return { ok: true, error: '', token };
  } catch (e) {
    return { ok: false, error: message(e), token };
  }
}

const theme = (t: string): api.Theme => (t === 'dark' ? 'dark' : 'light');
const density = (d: string): api.Density => (d === 'comfortable' ? 'comfortable' : 'compact');

const sources: Sources = {
  loadIssues: async ([filter]) => {
    const rows = await api.fetchIssues(filter === 'closed' ? 'closed' : 'open');
    return { loaded: true, items: rows.map(issue) };
  },
  loadIssue: async ([id]) => {
    const d = await api.fetchIssue(id);
    return d === null
      ? { found: false, id, title: '', body: '' }
      : { found: true, id: d.id, title: d.title, body: d.body };
  },
  loadComments: async ([id]) =>
    (await api.fetchComments(id)).map((c) => ({ author: c.author, text: c.text, sending: false })),
  loadLabels: async ([id]) => [...(await api.fetchLabels(id))],
  searchHelp: async ([q]) => ({ q, hits: (await api.search(q)).map((h) => ({ id: h.id, name: h.name })) }),
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

  assignIssue: ([id, user, token]) => write(token, () => api.assign(id, user)),
  renameIssue: ([id, title, token]) => write(token, () => api.renameIssue(id, title)),
  closeIssue: ([id, token]) => write(token, () => api.closeIssue(id)),
  addComment: ([id, author, text, token]) => write(token, () => api.addComment(id, author, text)),
  addLabel: ([id, label, token]) => write(token, () => api.addLabel(id, label)),
  removeLabel: ([id, label, token]) => write(token, () => api.removeLabel(id, label)),
  saveSettings: async ([name, t, d]) => {
    const fallback = { name, theme: t, density: d };
    try {
      const s = await api.saveSettings({ name, theme: theme(t), density: density(d) });
      return { ok: true, error: '', settings: { name: s.name, theme: s.theme, density: s.density } };
    } catch (e) {
      return { ok: false, error: message(e), settings: fallback };
    }
  },
};
export const answer: Answer = (source, args, store, storage, native) =>
  sources[source](args, store, storage, native);

/** A write shows while it is out, and after an accepted reply until an answer asked after it. */
const showing = (w: Write): boolean => {
  if (w.reply === undefined) return true;
  const r = w.reply as { ok?: boolean };
  return r.ok === true && !w.answered;
};

function overIssues(filter: string, list: Result<'loadIssues'>, writes: readonly Write[]): Result<'loadIssues'> {
  let items = list.items.map((i) => ({ ...i }));
  for (const w of writes) {
    if (!showing(w)) continue;
    if (w.source === 'assignIssue') {
      const [id, user] = w.args as [number, string, number];
      items = items.map((i) => (i.id === id ? { ...i, hasAssignee: true, assignee: user } : i));
    } else if (w.source === 'renameIssue') {
      const [id, title] = w.args as [number, string, number];
      items = items.map((i) => (i.id === id ? { ...i, title } : i));
    } else if (w.source === 'closeIssue' && filter === 'open') {
      const [id] = w.args as [number, number];
      items = items.filter((i) => i.id !== id);
    }
  }
  return { loaded: list.loaded, items };
}

function overDetail(id: number, d: Detail, writes: readonly Write[]): Detail {
  let title = d.title;
  for (const w of writes) {
    if (!showing(w) || w.source !== 'renameIssue') continue;
    const [wid, t] = w.args as [number, string, number];
    if (wid === id && d.found && d.id === id) title = t;
  }
  return { ...d, title };
}

function overComments(id: number, cs: Comment[], writes: readonly Write[]): Comment[] {
  const shown = cs.map((c) => ({ ...c }));
  for (const w of writes) {
    if (!showing(w) || w.source !== 'addComment') continue;
    const [wid, author, text] = w.args as [number, string, string, number];
    if (wid !== id) continue;
    shown.push({ author, text, sending: w.reply === undefined });
  }
  return shown;
}

function overLabels(id: number, ls: string[], writes: readonly Write[]): string[] {
  let shown = [...ls];
  for (const w of writes) {
    if (!showing(w)) continue;
    if (w.source !== 'addLabel' && w.source !== 'removeLabel') continue;
    const [wid, label] = w.args as [number, string, number];
    if (wid !== id) continue;
    if (w.source === 'addLabel') {
      if (!shown.includes(label)) shown.push(label);
    } else {
      shown = shown.filter((l) => l !== label);
    }
  }
  return shown;
}

export const overlay: Overlay = (source, args, answer, writes) => {
  switch (source) {
    case 'loadIssues':
      return overIssues(args[0] as string, answer as Result<'loadIssues'>, writes) as never;
    case 'loadIssue':
      return overDetail(args[0] as number, answer as Detail, writes) as never;
    case 'loadComments':
      return overComments(args[0] as number, answer as Comment[], writes) as never;
    case 'loadLabels':
      return overLabels(args[0] as number, answer as string[], writes) as never;
    default:
      return undefined;
  }
};
