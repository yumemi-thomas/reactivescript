import type { Answer, Overlay, Result, Sources } from './app.contract.d.ts';
import * as api from './src/api.js';

export const grants = '';

type Issue = Result<'loadIssues'>['issues'][number];
type Comment = Result<'loadComments'>[number];
type Hit = Result<'searchHelp'>['hits'][number];
type Settings = Result<'loadSettings'>;

const toIssue = (i: api.Issue): Issue => ({
  id: i.id,
  title: i.title,
  assignee: i.assignee ?? '',
  assigned: i.assignee !== null && i.assignee !== undefined,
});
const toHit = (h: api.Hit): Hit => ({ id: h.id, name: h.name });
const toSettings = (s: api.Settings): Settings => ({ name: s.name, theme: s.theme, density: s.density });
const theme = (t: string): api.Theme => (t === 'dark' ? 'dark' : 'light');
const density = (d: string): api.Density => (d === 'compact' ? 'compact' : 'comfortable');

const sources: Sources = {
  loadIssues: async ([filter]): Promise<Result<'loadIssues'>> => {
    const issues = await api.fetchIssues(filter === 'closed' ? 'closed' : 'open');
    return { loaded: true, issues: issues.map(toIssue) };
  },
  loadIssue: async ([id]): Promise<Result<'loadIssue'>> => {
    const d = await api.fetchIssue(id);
    if (d === null || d === undefined) return { found: false, id, title: '', body: '' };
    return { found: true, id: d.id, title: d.title, body: d.body };
  },
  loadComments: async ([id]): Promise<Result<'loadComments'>> =>
    (await api.fetchComments(id)).map((c) => ({ author: c.author, text: c.text, sending: false })),
  loadLabels: async ([id]): Promise<Result<'loadLabels'>> => [...(await api.fetchLabels(id))],
  searchHelp: async ([q]): Promise<Result<'searchHelp'>> => ({ q, hits: (await api.search(q)).map(toHit) }),
  loadItem: async ([id]): Promise<Result<'loadItem'>> => {
    const it = await api.fetchItem(id);
    if (it === null || it === undefined) return { found: false, id, name: '', blurb: '' };
    return { found: true, id: it.id, name: it.name, blurb: it.blurb };
  },
  loadSettings: async (): Promise<Result<'loadSettings'>> => toSettings(await api.loadSettings()),

  assignIssue: async ([id, user]): Promise<Result<'assignIssue'>> => {
    const r = await api.assign(id, user);
    return { id: r.id, assignee: r.assignee };
  },
  renameIssue: async ([id, title]): Promise<Result<'renameIssue'>> => {
    const r = await api.renameIssue(id, title);
    return { id: r.id, title: r.title };
  },
  closeIssue: async ([id]): Promise<Result<'closeIssue'>> => {
    const r = await api.closeIssue(id);
    return { id: r.id };
  },
  addComment: async ([id, author, text]): Promise<Result<'addComment'>> => {
    const c = await api.addComment(id, author, text);
    return { author: c.author, text: c.text };
  },
  changeLabel: async ([id, op, label]): Promise<Result<'changeLabel'>> => {
    const labels = op === 'remove' ? await api.removeLabel(id, label) : await api.addLabel(id, label);
    return { labels: [...labels] };
  },
  rowAction: async ([op, id, user]): Promise<Result<'rowAction'>> => {
    if (op === 'close') await api.closeIssue(id);
    else await api.assign(id, user);
    return { id };
  },
  saveSettings: async ([name, t, d]): Promise<Result<'saveSettings'>> =>
    toSettings(await api.saveSettings({ name, theme: theme(t), density: density(d) })),
};
export const answer: Answer = (source, args, store, storage, native) => sources[source](args, store, storage, native);

// Pending writes, shown before the server answers. A write stops showing once an answer asked
// after its reply has landed (that answer has it), or as soon as it fails.
type Write = Parameters<Overlay>[3][number];

const issueWrite = (issues: Issue[], w: Write, filter: string): Issue[] => {
  const a = w.args as unknown[];
  if (w.source === 'assignIssue' || (w.source === 'rowAction' && a[0] === 'assign')) {
    const [id, user] = w.source === 'assignIssue' ? [a[0], a[1]] : [a[1], a[2]];
    return issues.map((i) => (i.id === id ? { ...i, assignee: String(user), assigned: true } : i));
  }
  if (w.source === 'renameIssue') {
    const [id, title] = a as [number, string];
    return issues.map((i) => (i.id === id ? { ...i, title } : i));
  }
  if (filter === 'open' && (w.source === 'closeIssue' || (w.source === 'rowAction' && a[0] === 'close'))) {
    const id = w.source === 'closeIssue' ? a[0] : a[1];
    return issues.filter((i) => i.id !== id);
  }
  return issues;
};

export const overlay: Overlay = (source, args, answer, writes) => {
  const pending = writes.filter((w) => !w.answered);
  const a = args as unknown[];
  if (source === 'loadIssues') {
    const list = answer as Result<'loadIssues'>;
    let issues = list.issues;
    for (const w of pending) issues = issueWrite(issues, w, String(a[0]));
    return { loaded: list.loaded, issues } as never;
  }
  if (source === 'loadIssue') {
    const d = answer as Result<'loadIssue'>;
    let shown = d;
    for (const w of pending) {
      const [id, title] = w.args as [number, string];
      if (w.source === 'renameIssue' && d.found && id === d.id) shown = { ...shown, title };
    }
    return shown as never;
  }
  if (source === 'loadComments') {
    const shown: Comment[] = [...(answer as Comment[])];
    for (const w of pending) {
      const [id, author, text] = w.args as [number, string, string];
      if (w.source === 'addComment' && id === a[0]) shown.push({ author, text, sending: w.reply === undefined });
    }
    return shown as never;
  }
  if (source === 'loadLabels') {
    let shown: string[] = [...(answer as string[])];
    for (const w of pending) {
      const [id, op, label] = w.args as [number, string, string];
      if (w.source !== 'changeLabel' || id !== a[0]) continue;
      if (op === 'remove') shown = shown.filter((l) => l !== label);
      else if (!shown.includes(label)) shown.push(label);
    }
    return shown as never;
  }
  return undefined;
};
