// Issue desk: the data module. Each source asks the backend (`src/api.js`) and answers exactly
// its declared shape; a rejection is let through, so the view's `failure(...)` carries its message.
// `overlay` shows every write over the resources it changes from the moment it is sent, until the
// server's answer includes it; a declined write ends without landing and stops showing.
import type { Answer, Overlay, Result, Sources, Write } from './app.contract.d.ts';
import * as api from './src/api.js';

export const grants = '';

type IssueList = Result<'loadIssues'>;
type Issue = IssueList['items'][number];
type Detail = NonNullable<Result<'loadIssue'>>;
type Comment = Result<'loadComments'>[number];
type Settings = Result<'loadSettings'>;

const issue = (i: { id: number; title: string; assignee: string | null }): Issue =>
  ({ id: i.id, title: i.title, assignee: i.assignee ?? null });
const comment = (c: { author: string; text: string }, sending = false): Comment =>
  ({ author: c.author, text: c.text, sending });
const settings = (s: Settings): Settings => ({ name: s.name, theme: s.theme, density: s.density });

const sources: Sources = {
  loadIssues: async ([filter]) => {
    const rows = await api.fetchIssues(filter === 'closed' ? 'closed' : 'open');
    return { loaded: true, items: rows.map(issue) };
  },
  // The second argument is the retry count: a new one asks again.
  loadIssue: async ([id]) => {
    const d = await api.fetchIssue(id);
    return d ? { id: d.id, title: d.title, body: d.body } : null;
  },
  assignIssue: async ([id, user]) => ({ id: (await api.assign(id, user)).id }),
  renameIssue: async ([id, title]) => ({ id: (await api.renameIssue(id, title)).id }),
  closeIssue: async ([id]) => ({ id: (await api.closeIssue(id)).id }),
  loadComments: async ([id]) => (await api.fetchComments(id)).map((c) => comment(c)),
  postComment: async ([id, author, text]) => comment(await api.addComment(id, author, text)),
  loadLabels: async ([id]) => [...(await api.fetchLabels(id))],
  addLabel: async ([id, label]) => [...(await api.addLabel(id, label))],
  removeLabel: async ([id, label]) => [...(await api.removeLabel(id, label))],
  searchHelp: async ([q]) => {
    const hits = await api.search(q);
    return { q, hits: hits.map((h) => ({ id: h.id, name: h.name })) };
  },
  loadItem: async ([id]) => {
    const it = await api.fetchItem(id);
    return it ? { id: it.id, name: it.name, blurb: it.blurb } : null;
  },
  loadSettings: async () => settings(await api.loadSettings()),
  saveSettings: async ([name, theme, density]) => settings(await api.saveSettings({ name, theme, density })),
};
export const answer: Answer = (source, args, store, storage, native) =>
  sources[source](args as never, store, storage, native);

// Issue lists: assignments, renames and closes in flight.
function overlayIssues(filter: string, answer: IssueList, writes: readonly Write[]): IssueList {
  let items = answer.items.map((i) => ({ ...i }));
  for (const w of writes) {
    if (w.source === 'assignIssue') {
      const [id, user] = w.args;
      const row = items.find((i) => i.id === id);
      if (!row || (w.answered && row.assignee === user)) continue;
      if (w.answered) w.keep(); // the server has not caught up yet
      row.assignee = user;
    } else if (w.source === 'renameIssue') {
      const [id, title] = w.args;
      const row = items.find((i) => i.id === id);
      if (!row || (w.answered && row.title === title)) continue;
      if (w.answered) w.keep();
      row.title = title;
    } else if (w.source === 'closeIssue' && filter === 'open') {
      const [id] = w.args;
      if (!items.some((i) => i.id === id)) continue;
      if (w.answered) w.keep();
      items = items.filter((i) => i.id !== id);
    }
  }
  return { loaded: answer.loaded, items };
}

// One issue's heading: renames in flight.
function overlayDetail(id: number, answer: Detail | null, writes: readonly Write[]): Detail | null {
  if (!answer) return answer;
  let shown = answer;
  for (const w of writes) {
    if (w.source !== 'renameIssue' || w.args[0] !== id) continue;
    if (w.answered && shown.title === w.args[1]) continue;
    if (w.answered) w.keep();
    shown = { ...shown, title: w.args[1] };
  }
  return shown;
}

// One issue's comments: posts in flight are the last rows, marked as sending until answered.
function overlayComments(id: number, answer: Comment[], writes: readonly Write[]): Comment[] {
  const shown = answer.map((c) => ({ ...c }));
  const used = new Set<number>();
  for (const w of writes) {
    if (w.source !== 'postComment' || w.args[0] !== id) continue;
    const [, author, text] = w.args;
    if (w.answered) {
      const at = shown.findIndex((c, i) => !used.has(i) && !c.sending && c.author === author && c.text === text);
      if (at >= 0) { used.add(at); continue; } // the answer has it
      w.keep();
    }
    shown.push({ author, text, sending: w.reply === undefined });
  }
  return shown;
}

// One issue's labels: adds and removes in flight, in the order they were made.
function overlayLabels(id: number, answer: string[], writes: readonly Write[]): string[] {
  let shown = [...answer];
  for (const w of writes) {
    if ((w.source !== 'addLabel' && w.source !== 'removeLabel') || w.args[0] !== id) continue;
    const label = w.args[1];
    if (w.source === 'addLabel') {
      if (shown.includes(label)) continue;
      if (w.answered) w.keep();
      shown.push(label);
    } else {
      if (!shown.includes(label)) continue;
      if (w.answered) w.keep();
      shown = shown.filter((l) => l !== label);
    }
  }
  return shown;
}

export const overlay: Overlay = (source, args, answer, writes) => {
  switch (source) {
    case 'loadIssues':
      return overlayIssues(String(args[0]), answer as IssueList, writes) as never;
    case 'loadIssue':
      return overlayDetail(args[0] as number, answer as Detail | null, writes) as never;
    case 'loadComments':
      return overlayComments(args[0] as number, answer as Comment[], writes) as never;
    case 'loadLabels':
      return overlayLabels(args[0] as number, answer as string[], writes) as never;
    default:
      return undefined;
  }
};
