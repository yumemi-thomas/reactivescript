import * as api from './src/api.js';
import type { Answer, Overlay, Sources } from './app.contract.d.ts';

export const grants = '';

type Reply = { ok: boolean; error: string };
type Issue = { id: number; title: string; assignee: string };
type Write = { source: string; args: unknown[]; reply?: Reply; answered: boolean; keep(): void };

const okReply = (): Reply => ({ ok: true, error: '' });
const failReply = (e: unknown): Reply => ({ ok: false, error: e instanceof Error ? e.message : String(e) });

// The settings the server last answered: what a failed save shows as saved.
let lastSaved: { name: string; theme: string; density: string } = { name: '', theme: 'light', density: 'comfortable' };

const sources: Sources = {
  fetchIssues: async ([filter]) =>
    (await api.fetchIssues(filter as 'open' | 'closed')).map(i => ({ id: i.id, title: i.title, assignee: i.assignee ?? '' })),
  fetchIssue: async ([id]) => {
    const d = await api.fetchIssue(id);
    return d ? { found: true, id: d.id, title: d.title, body: d.body } : { found: false, id, title: '', body: '' };
  },
  assignIssue: async ([id, user]) => { try { await api.assign(id, user); return okReply(); } catch (e) { return failReply(e); } },
  renameIssue: async ([id, title]) => { try { await api.renameIssue(id, title); return okReply(); } catch (e) { return failReply(e); } },
  closeIssue: async ([id]) => { try { await api.closeIssue(id); return okReply(); } catch (e) { return failReply(e); } },
  fetchComments: async ([id]) =>
    (await api.fetchComments(id)).map(c => ({ author: c.author, text: c.text, sending: false })),
  addComment: async ([id, author, text]) => { try { await api.addComment(id, author, text); return okReply(); } catch (e) { return failReply(e); } },
  fetchLabels: async ([id]) => api.fetchLabels(id),
  addLabel: async ([id, label]) => { try { await api.addLabel(id, label); return okReply(); } catch (e) { return failReply(e); } },
  removeLabel: async ([id, label]) => { try { await api.removeLabel(id, label); return okReply(); } catch (e) { return failReply(e); } },
  search: async ([q]) => (await api.search(q)).map(h => ({ id: h.id, name: h.name })),
  fetchItem: async ([id]) => {
    const it = await api.fetchItem(id);
    return it ? { found: true, id: it.id, name: it.name, blurb: it.blurb } : { found: false, id, name: '', blurb: '' };
  },
  loadSettings: async () => {
    const s = await api.loadSettings();
    lastSaved = { name: s.name, theme: s.theme, density: s.density };
    return { ...lastSaved };
  },
  saveSettings: async ([name, theme, density]) => {
    try {
      const s = await api.saveSettings({ name, theme, density } as api.Settings);
      lastSaved = { name: s.name, theme: s.theme, density: s.density };
      return { ok: true, error: '', ...lastSaved };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e), ...lastSaved };
    }
  },
};

const declined = (w: Write) => w.reply !== undefined && !w.reply.ok;

// Writes shown before their replies: an accepted write stays until the server answers with it,
// a declined one is never shown (its row, label or comment goes back to what the server has).
export const overlay: Overlay = (source, args, answer, writes) => {
  const ws = writes as unknown as Write[];
  const key = (args as unknown[])[0];

  if (source === 'fetchIssues') {
    const filter = key as string;
    const cur = answer as Issue[];
    let rows = cur.map(r => ({ ...r }));
    for (const w of ws) {
      if (declined(w)) continue;
      let reflected = true;
      if (w.source === 'assignIssue') {
        const [id, user] = w.args as [number, string];
        const r = rows.find(x => x.id === id);
        if (r) r.assignee = user;
        const a = cur.find(x => x.id === id);
        reflected = !a || a.assignee === user;
      } else if (w.source === 'renameIssue') {
        const [id, title] = w.args as [number, string];
        const r = rows.find(x => x.id === id);
        if (r) r.title = title;
        const a = cur.find(x => x.id === id);
        reflected = !a || a.title === title;
      } else if (w.source === 'closeIssue') {
        if (filter !== 'open') continue;
        const [id] = w.args as [number];
        rows = rows.filter(x => x.id !== id);
        reflected = !cur.some(x => x.id === id);
      } else {
        continue;
      }
      if (w.answered && !reflected) w.keep();
    }
    return rows as never;
  }

  if (source === 'fetchIssue') {
    const cur = answer as { found: boolean; id: number; title: string; body: string };
    let d = { ...cur };
    for (const w of ws) {
      if (declined(w) || w.source !== 'renameIssue') continue;
      const [id, title] = w.args as [number, string];
      if (!cur.found || id !== cur.id) continue;
      d = { ...d, title };
      if (w.answered && cur.title !== title) w.keep();
    }
    return d as never;
  }

  if (source === 'fetchComments') {
    const cur = answer as { author: string; text: string; sending: boolean }[];
    const out = cur.map(c => ({ ...c }));
    for (const w of ws) {
      if (declined(w) || w.source !== 'addComment') continue;
      const [id, author, text] = w.args as [number, string, string];
      if (id !== key) continue;
      if (w.answered && cur.some(c => c.author === author && c.text === text)) continue;
      out.push({ author, text, sending: w.reply === undefined });
      if (w.answered) w.keep();
    }
    return out as never;
  }

  if (source === 'fetchLabels') {
    const cur = answer as string[];
    let out = [...cur];
    for (const w of ws) {
      if (declined(w)) continue;
      let reflected: boolean;
      if (w.source === 'addLabel') {
        const [id, label] = w.args as [number, string];
        if (id !== key) continue;
        if (!out.includes(label)) out.push(label);
        reflected = cur.includes(label);
      } else if (w.source === 'removeLabel') {
        const [id, label] = w.args as [number, string];
        if (id !== key) continue;
        out = out.filter(l => l !== label);
        reflected = !cur.includes(label);
      } else {
        continue;
      }
      if (w.answered && !reflected) w.keep();
    }
    return out as never;
  }

  return undefined;
};

export const answer: Answer = (source, args, store, storage, native) =>
  sources[source](args, store, storage, native);
