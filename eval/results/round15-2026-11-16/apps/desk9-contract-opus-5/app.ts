import type { Answer, Overlay, Result, Sources, Write } from './app.contract.d.ts';
import * as api from './src/api.js';

export const grants = '';

type Reply = Result<'assignIssue'>;
type IssueList = Result<'loadIssues'>;
type Detail = Result<'loadIssue'>;
type Comment = Result<'loadComments'>[number];

const message = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/** A write's answer as a shaped reply: a server's refusal is a reply too, so the view shows its message. */
async function reply(tok: number, work: () => Promise<unknown>): Promise<Reply> {
  try {
    await work();
    return { ok: true, error: '', tok };
  } catch (e) {
    return { ok: false, error: message(e), tok };
  }
}

/** A failed read rethrows with the server's message, so the resource fails and keeps its last answer. */
const fail = (e: unknown): never => {
  throw new Error(message(e));
};

const sources: Sources = {
  loadIssues: async ([filter]): Promise<IssueList> => {
    const rows = await api.fetchIssues(filter === 'closed' ? 'closed' : 'open').catch(fail);
    return {
      loaded: true,
      issues: rows.map((r) => ({
        id: r.id,
        title: r.title,
        assignee: r.assignee ?? '',
        assigned: r.assignee !== null && r.assignee !== undefined,
      })),
    };
  },
  loadIssue: async ([id]): Promise<Detail> => {
    const d = await api.fetchIssue(id).catch(fail);
    if (!d) return { id, found: false, title: '', body: '' };
    return { id, found: true, title: d.title, body: d.body };
  },
  loadComments: async ([id]): Promise<Comment[]> => {
    const cs = await api.fetchComments(id).catch(fail);
    return cs.map((c) => ({ author: c.author, text: c.text, sending: false }));
  },
  loadLabels: async ([id]): Promise<string[]> => {
    const ls = await api.fetchLabels(id).catch(fail);
    return ls.map((l) => String(l));
  },
  searchHelp: async ([q]): Promise<Result<'searchHelp'>> => {
    const hits = await api.search(q).catch(fail);
    return { q, hits: hits.map((h) => ({ id: h.id, name: h.name })) };
  },
  loadItem: async ([id]): Promise<Result<'loadItem'>> => {
    const it = await api.fetchItem(id).catch(fail);
    if (!it) return { id, found: false, name: '', blurb: '' };
    return { id, found: true, name: it.name, blurb: it.blurb };
  },
  loadSettings: async (): Promise<Result<'loadSettings'>> => {
    const s = await api.loadSettings().catch(fail);
    return { loaded: true, name: s.name, theme: s.theme, density: s.density };
  },

  assignIssue: ([id, user, tok]) => reply(tok, () => api.assign(id, user)),
  renameIssue: ([id, title, tok]) => reply(tok, () => api.renameIssue(id, title)),
  closeIssue: ([id, tok]) => reply(tok, () => api.closeIssue(id)),
  addComment: ([id, author, text, tok]) => reply(tok, () => api.addComment(id, author, text)),
  addLabel: ([id, label, tok]) => reply(tok, () => api.addLabel(id, label)),
  removeLabel: ([id, label, tok]) => reply(tok, () => api.removeLabel(id, label)),
  saveSettings: async ([name, theme, density, tok]): Promise<Result<'saveSettings'>> => {
    try {
      const s = await api.saveSettings({
        name,
        theme: theme === 'dark' ? 'dark' : 'light',
        density: density === 'compact' ? 'compact' : 'comfortable',
      });
      return { ok: true, error: '', tok, name: s.name, theme: s.theme, density: s.density };
    } catch (e) {
      return { ok: false, error: message(e), tok, name: '', theme: '', density: '' };
    }
  },
};
export const answer: Answer = (source, args, store, storage, native) =>
  sources[source](args, store, storage, native);

/** A write shows until an answer asked after its reply has it, unless the server declined it (`ok: false`). */
const live = (w: Write): boolean => !w.answered && !(w.reply && (w.reply as Reply).ok === false);

function overlayIssues(filter: string, answer: IssueList, writes: readonly Write[]): IssueList {
  let issues = answer.issues.map((i) => ({ ...i }));
  for (const w of writes) {
    if (!live(w)) continue;
    if (w.source === 'assignIssue') {
      const [id, user] = w.args;
      issues = issues.map((i) => (i.id === id ? { ...i, assignee: user, assigned: true } : i));
    } else if (w.source === 'renameIssue') {
      const [id, title] = w.args;
      issues = issues.map((i) => (i.id === id ? { ...i, title } : i));
    } else if (w.source === 'closeIssue' && filter === 'open') {
      const [id] = w.args;
      issues = issues.filter((i) => i.id !== id);
    }
  }
  return { loaded: answer.loaded, issues };
}

function overlayDetail(id: number, answer: Detail, writes: readonly Write[]): Detail {
  let shown = answer;
  for (const w of writes) {
    if (!live(w) || w.source !== 'renameIssue') continue;
    const [wid, title] = w.args;
    if (wid === id && shown.found && shown.id === id) shown = { ...shown, title };
  }
  return shown;
}

function overlayComments(id: number, answer: Comment[], writes: readonly Write[]): Comment[] {
  const shown = answer.map((c) => ({ ...c }));
  for (const w of writes) {
    if (!live(w) || w.source !== 'addComment') continue;
    const [wid, author, text] = w.args;
    if (wid !== id) continue;
    shown.push({ author, text, sending: !w.reply });
  }
  return shown;
}

function overlayLabels(id: number, answer: string[], writes: readonly Write[]): string[] {
  let shown = [...answer];
  for (const w of writes) {
    if (!live(w)) continue;
    if (w.source === 'addLabel') {
      const [wid, label] = w.args;
      if (wid === id && !shown.includes(label)) shown = [...shown, label];
    } else if (w.source === 'removeLabel') {
      const [wid, label] = w.args;
      if (wid === id) shown = shown.filter((l) => l !== label);
    }
  }
  return shown;
}

export const overlay: Overlay = (source, args, answer, writes) => {
  if (writes.length === 0) return undefined;
  switch (source) {
    case 'loadIssues':
      return overlayIssues(String(args[0]), answer as IssueList, writes) as never;
    case 'loadIssue':
      return overlayDetail(Number(args[0]), answer as Detail, writes) as never;
    case 'loadComments':
      return overlayComments(Number(args[0]), answer as Comment[], writes) as never;
    case 'loadLabels':
      return overlayLabels(Number(args[0]), answer as string[], writes) as never;
    default:
      return undefined;
  }
};
