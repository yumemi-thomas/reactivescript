// Issue desk data module: answers the view's sources with the backend's API
// (src/api.js). A declined write is a reply (`ok: false`) carrying its seq;
// a failed read throws, so its resource shows the error.
import * as api from './src/api.js';
import type { Answer, Overlay, Result, Sources } from './app.contract.d.ts';

export const grants = '';

const messageOf = (e: unknown): string => (e instanceof Error ? e.message : String(e));

const ack = (seq: number, p: Promise<unknown>): Promise<Result<'doAssign'>> =>
  p.then(
    () => ({ ok: true, seq, error: '' }),
    (e) => ({ ok: false, seq, error: messageOf(e) }),
  );

type IssueRow = { id: number; title: string; assignee: string };
type IssueView = { found: boolean; id: number; title: string; body: string };
type Comment = { author: string; text: string; sending: boolean };

const sources: Sources = {
  issueList: ([filter]) =>
    api.fetchIssues(filter as 'open' | 'closed').then((rows) =>
      rows.map((i) => ({ id: i.id, title: i.title, assignee: i.assignee ?? '' })),
    ),
  issueDetail: ([id]) =>
    api.fetchIssue(id).then((d) =>
      d ? { found: true, id: d.id, title: d.title, body: d.body } : { found: false, id, title: '', body: '' },
    ),
  issueComments: ([id]) =>
    api.fetchComments(id).then((cs) => cs.map((c) => ({ author: c.author, text: c.text, sending: false }))),
  issueLabels: ([id]) => api.fetchLabels(id),
  helpHits: ([q]) => api.search(q).then((hs) => hs.map((h) => ({ id: h.id, name: h.name }))),
  helpItem: ([id]) =>
    api.fetchItem(id).then((i) =>
      i ? { found: true, id: i.id, name: i.name, blurb: i.blurb } : { found: false, id, name: '', blurb: '' },
    ),
  loadPrefs: () => api.loadSettings().then((s) => ({ name: s.name, theme: s.theme, density: s.density })),
  doAssign: ([id, user, seq]) => ack(seq, api.assign(id, user)),
  doRename: ([id, title, seq]) => ack(seq, api.renameIssue(id, title)),
  doClose: ([id, seq]) => ack(seq, api.closeIssue(id)),
  doPost: ([id, author, text, seq]) => ack(seq, api.addComment(id, author, text)),
  doAddLabel: ([id, label, seq]) => ack(seq, api.addLabel(id, label)),
  doDropLabel: ([id, label, seq]) => ack(seq, api.removeLabel(id, label)),
  doSave: ([name, theme, density, seq]) =>
    api
      .saveSettings({ name, theme: theme as 'light' | 'dark', density: density as 'comfortable' | 'compact' })
      .then(
        (s) => ({ ok: true, seq, error: '', name: s.name, theme: s.theme, density: s.density }),
        (e) => ({ ok: false, seq, error: messageOf(e), name, theme, density }),
      ),
};

export const answer: Answer = (source, args, store, storage, native) =>
  sources[source](args, store, storage, native);

// Optimistic writes: each write shows until the server's answer reflects it.
// A write the answer already reflects is dropped; one still unreflected after
// its answer keeps showing (keep) so the server's lag does not flicker the UI.
export const overlay: Overlay = (source, args, answer, writes) => {
  if (source === 'issueList') {
    const [filter] = args as [string];
    const rows: IssueRow[] = (answer as IssueRow[]).map((r) => ({ ...r }));
    for (const w of writes) {
      const [id, arg] = w.args as unknown as [number, string];
      const i = rows.findIndex((r) => r.id === id);
      let changed = false;
      if (w.source === 'doAssign') {
        if (i >= 0 && rows[i].assignee !== arg) { rows[i] = { ...rows[i], assignee: arg }; changed = true; }
      } else if (w.source === 'doRename') {
        if (i >= 0 && rows[i].title !== arg) { rows[i] = { ...rows[i], title: arg }; changed = true; }
      } else if (w.source === 'doClose' && filter === 'open') {
        if (i >= 0) { rows.splice(i, 1); changed = true; }
      }
      if (changed && w.answered) w.keep();
    }
    return rows as never;
  }
  if (source === 'issueDetail') {
    const [id] = args as [number];
    const view: IssueView = { ...(answer as IssueView) };
    for (const w of writes) {
      if (w.source !== 'doRename' || !view.found) continue;
      const [wid, title] = w.args as unknown as [number, string];
      if (wid !== id || view.title === title) continue;
      view.title = title;
      if (w.answered) w.keep();
    }
    return view as never;
  }
  if (source === 'issueComments') {
    const [id] = args as [number];
    const list: Comment[] = (answer as Comment[]).map((c) => ({ ...c }));
    for (const w of writes) {
      if (w.source !== 'doPost') continue;
      const [wid, author, text] = w.args as unknown as [number, string, string];
      if (wid !== id || list.some((c) => c.author === author && c.text === text)) continue;
      list.push({ author, text, sending: w.reply === undefined });
      if (w.answered) w.keep();
    }
    return list as never;
  }
  if (source === 'issueLabels') {
    const [id] = args as [number];
    let labels: string[] = [...(answer as string[])];
    for (const w of writes) {
      const [wid, label] = w.args as unknown as [number, string];
      if (wid !== id) continue;
      let changed = false;
      if (w.source === 'doAddLabel' && !labels.includes(label)) {
        labels = [...labels, label];
        changed = true;
      } else if (w.source === 'doDropLabel' && labels.includes(label)) {
        labels = labels.filter((l) => l !== label);
        changed = true;
      }
      if (changed && w.answered) w.keep();
    }
    return labels as never;
  }
  return undefined;
};
