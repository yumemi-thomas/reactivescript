// The issue desk's data module: each source calls the backend (src/api.js) and answers
// exactly its shape. A read that fails rejects, so the view keeps what it showed and says
// why; a write the server declines answers `{ ok: false, error }`, which the view shows.
// `overlay` shows each write before its reply and drops it once declined.
import type { Answer, Args, Overlay, Result, Sources, Write } from './app.contract.d.ts';
import * as api from './src/api.js';

export const grants = '';

type IssueList = Result<'loadIssues'>;
type IssueRow = IssueList['items'][number];
type IssueDetail = Result<'loadIssue'>;
type Comment = Result<'loadComments'>[number];
type Ack = Result<'assignTo'>;
type Theme = 'light' | 'dark';
type Density = 'comfortable' | 'compact';

const messageOf = (e: unknown): string =>
  e instanceof Error ? e.message : typeof e === 'string' ? e : String(e);

const ack = async (gen: number, write: () => Promise<unknown>): Promise<Ack> => {
  try {
    await write();
    return { ok: true, error: '', gen };
  } catch (e) {
    return { ok: false, error: messageOf(e), gen };
  }
};

const row = (i: api.Issue): IssueRow => ({
  id: i.id,
  title: i.title,
  assignee: i.assignee ?? '',
  assigned: i.assignee !== null && i.assignee !== undefined,
});

const theme = (t: string): Theme => (t === 'dark' ? 'dark' : 'light');
const density = (d: string): Density => (d === 'compact' ? 'compact' : 'comfortable');

const sources: Sources = {
  loadIssues: async ([filter]) => {
    const items = await api.fetchIssues(filter === 'closed' ? 'closed' : 'open');
    return { loaded: true, items: items.map(row) };
  },
  loadIssue: async ([id]) => {
    const d = await api.fetchIssue(id);
    if (!d) return { found: false, id, title: '', body: '' };
    return { found: true, id: d.id, title: d.title, body: d.body };
  },
  loadComments: async ([id]) =>
    (await api.fetchComments(id)).map((c) => ({ author: c.author, text: c.text, sending: false })),
  loadLabels: async ([id]) => [...(await api.fetchLabels(id))],
  searchHelp: async ([q]) => {
    const hits = await api.search(q);
    return { q, hits: hits.map((h) => ({ id: h.id, name: h.name })) };
  },
  loadItem: async ([id]) => {
    const item = await api.fetchItem(id);
    if (!item) return { found: false, id, name: '', blurb: '' };
    return { found: true, id: item.id, name: item.name, blurb: item.blurb };
  },
  loadSettings: async () => {
    const s = await api.loadSettings();
    return { name: s.name, theme: s.theme, density: s.density };
  },

  assignTo: ([id, user, gen]) => ack(gen, () => api.assign(id, user)),
  renameTo: ([id, title, gen]) => ack(gen, () => api.renameIssue(id, title)),
  closeIt: ([id, gen]) => ack(gen, () => api.closeIssue(id)),
  postTo: ([id, author, text, gen]) => ack(gen, () => api.addComment(id, author, text)),
  addLabelTo: ([id, label, gen]) => ack(gen, () => api.addLabel(id, label)),
  removeLabelFrom: ([id, label, gen]) => ack(gen, () => api.removeLabel(id, label)),
  saveTo: async ([name, t, d]) => {
    const s = await api.saveSettings({ name, theme: theme(t), density: density(d) });
    return { name: s.name, theme: s.theme, density: s.density };
  },
};

export const answer: Answer = (source, args, store, storage, native) =>
  sources[source](args, store, storage, native);

// A write still shows while its reply is out, or once accepted until an answer asked
// after it has it; a declined write shows no longer.
const showing = (w: Write): boolean => {
  if (w.answered) return false;
  const reply = w.reply as Ack | undefined;
  return reply === undefined || reply.ok;
};

const overIssues = (filter: string, answer: IssueList, writes: readonly Write[]): IssueList => {
  let items = answer.items.map((i) => ({ ...i }));
  for (const w of writes) {
    if (!showing(w)) continue;
    if (w.source === 'assignTo') {
      const [id, user] = w.args as Args<'assignTo'>;
      items = items.map((i) => (i.id === id ? { ...i, assignee: user, assigned: true } : i));
    } else if (w.source === 'renameTo') {
      const [id, title] = w.args as Args<'renameTo'>;
      items = items.map((i) => (i.id === id ? { ...i, title } : i));
    } else if (w.source === 'closeIt' && filter === 'open') {
      const [id] = w.args as Args<'closeIt'>;
      items = items.filter((i) => i.id !== id);
    }
  }
  return { loaded: answer.loaded, items };
};

const overIssue = (answer: IssueDetail, writes: readonly Write[]): IssueDetail => {
  let shown = { ...answer };
  for (const w of writes) {
    if (!showing(w) || w.source !== 'renameTo') continue;
    const [id, title] = w.args as Args<'renameTo'>;
    if (shown.found && shown.id === id) shown = { ...shown, title };
  }
  return shown;
};

const overComments = (issueId: number, answer: Comment[], writes: readonly Write[]): Comment[] => {
  const shown = answer.map((c) => ({ ...c }));
  for (const w of writes) {
    if (!showing(w) || w.source !== 'postTo') continue;
    const [id, author, text] = w.args as Args<'postTo'>;
    if (id !== issueId) continue;
    shown.push({ author, text, sending: w.reply === undefined });
  }
  return shown;
};

const overLabels = (issueId: number, answer: string[], writes: readonly Write[]): string[] => {
  let shown = [...answer];
  for (const w of writes) {
    if (!showing(w)) continue;
    if (w.source === 'addLabelTo') {
      const [id, label] = w.args as Args<'addLabelTo'>;
      if (id === issueId && !shown.includes(label)) shown.push(label);
    } else if (w.source === 'removeLabelFrom') {
      const [id, label] = w.args as Args<'removeLabelFrom'>;
      if (id === issueId) shown = shown.filter((l) => l !== label);
    }
  }
  return shown;
};

export const overlay: Overlay = (source, args, answer, writes) => {
  switch (source) {
    case 'loadIssues':
      return overIssues((args as Args<'loadIssues'>)[0], answer as IssueList, writes) as never;
    case 'loadIssue':
      return overIssue(answer as IssueDetail, writes) as never;
    case 'loadComments':
      return overComments((args as Args<'loadComments'>)[0], answer as Comment[], writes) as never;
    case 'loadLabels':
      return overLabels((args as Args<'loadLabels'>)[0], answer as string[], writes) as never;
    default:
      return undefined;
  }
};
