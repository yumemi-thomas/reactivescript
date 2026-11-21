import * as api from "./api.js";
import type { Comment, Hit, Issue, IssueDetail } from "./api.js";
import { errMsg, h, Page, setMsg, tick } from "./dom.js";

export type HelpInit = { query: string; hits: Hit[]; selectedId: number };
export type IssuesCtx = { setCount(n: number): void; openHelp(init: HelpInit): void };

type Filter = "open" | "closed";
type Pending<T> = { seq: number; value: T };
/** An answer the server accepted: `start` orders it against other ops, `at` against list fetches. */
type Accepted<T> = { value: T; start: number; at: number };

type ListState =
  | { kind: "loading" }
  | { kind: "error"; msg: string }
  | { kind: "ok"; items: Issue[]; at: number };

type DetailState =
  | { kind: "loading" }
  | { kind: "ok"; data: IssueDetail; at: number }
  | { kind: "missing" }
  | { kind: "error"; msg: string };

type CommentsState = { kind: "loading" } | { kind: "ok"; items: Comment[] } | { kind: "error"; msg: string };
type LocalPost = { key: number; author: string; text: string; sending: boolean };
type LabelOp = { seq: number; kind: "add" | "remove"; label: string };
type RelatedState = { kind: "idle" } | { kind: "loading" } | { kind: "ok"; hits: Hit[]; title: string } | { kind: "error"; msg: string };

type Selection = {
  id: number;
  detail: DetailState;
  detailToken: number;
  comments: CommentsState;
  posts: LocalPost[];
  labelsStatus: { kind: "loading" } | { kind: "error"; msg: string } | { kind: "ok" };
  labelsConfirmed: { labels: string[]; start: number } | null;
  labelOps: LabelOp[];
  related: RelatedState;
  relatedToken: number;
  assignError: string | null;
  renameError: string | null;
  closeError: string | null;
  postError: string | null;
  labelError: string | null;
  nodes: DetailNodes;
};

type DetailNodes = {
  root: HTMLElement;
  head: HTMLElement;
  body: HTMLElement;
  assignBtn: HTMLButtonElement;
  assignErr: HTMLElement;
  titleInput: HTMLInputElement;
  renameErr: HTMLElement;
  closeErr: HTMLElement;
  comments: HTMLElement;
  commentInput: HTMLInputElement;
  postErr: HTMLElement;
  labels: HTMLElement;
  labelInput: HTMLInputElement;
  labelErr: HTMLElement;
  related: HTMLElement;
};

function pushOp<T>(m: Map<number, Pending<T>[]>, id: number, op: Pending<T>): void {
  const list = m.get(id);
  if (list) list.push(op); else m.set(id, [op]);
}
function dropOp<T>(m: Map<number, Pending<T>[]>, id: number, seq: number): void {
  const list = m.get(id);
  if (!list) return;
  const rest = list.filter(o => o.seq !== seq);
  if (rest.length) m.set(id, rest); else m.delete(id);
}
function lastOp<T>(m: Map<number, Pending<T>[]>, id: number): Pending<T> | undefined {
  const list = m.get(id);
  return list && list.length ? list[list.length - 1] : undefined;
}
function accept<T>(m: Map<number, Accepted<T>>, id: number, value: T, start: number): void {
  const cur = m.get(id);
  if (cur && cur.start > start) return;
  m.set(id, { value, start, at: tick() });
}

export function issuesPage(ctx: IssuesCtx): Page {
  let alive = true;
  let user = "guest";
  let filter: Filter = "open";
  let list: ListState = { kind: "loading" };
  let listToken = 0;
  /** The last open list that loaded, kept while the closed list shows: the count follows it. */
  let openBase: { items: Issue[]; at: number } | null = null;
  let rowError: string | null = null;

  const assignOps = new Map<number, Pending<string>[]>();
  const assignDone = new Map<number, Accepted<string>>();
  const titleOps = new Map<number, Pending<string>[]>();
  const titleDone = new Map<number, Accepted<string>>();
  const closeOps = new Map<number, Pending<true>[]>();
  const closeDone = new Map<number, Accepted<true>>();

  let sel: Selection | null = null;

  // ---------- derived values ----------
  function assigneeOf(i: Issue, at: number): string | null {
    const p = lastOp(assignOps, i.id);
    if (p) return p.value;
    const d = assignDone.get(i.id);
    if (d && d.at > at) return d.value;
    return i.assignee;
  }
  function titleOf(id: number, base: string, at: number): string {
    const p = lastOp(titleOps, id);
    if (p) return p.value;
    const d = titleDone.get(id);
    if (d && d.at > at) return d.value;
    return base;
  }
  function hiddenFromOpen(id: number, at: number): boolean {
    if (closeOps.has(id)) return true;
    const d = closeDone.get(id);
    return !!d && d.at > at;
  }
  function visibleRows(): { items: Issue[]; at: number } | null {
    if (list.kind !== "ok") return null;
    const { items, at } = list;
    return { items: filter === "open" ? items.filter(i => !hiddenFromOpen(i.id, at)) : items, at };
  }
  function updateCount(): void {
    if (!openBase) return;
    const { items, at } = openBase;
    ctx.setCount(items.filter(i => !hiddenFromOpen(i.id, at)).length);
  }

  // ---------- skeleton ----------
  const userInput = h("input", { testid: "user", type: "text", "aria-label": "Current user" });
  userInput.value = user;
  const filterOpen = h("button", { testid: "filter-open", type: "button" }, "Open");
  const filterClosed = h("button", { testid: "filter-closed", type: "button" }, "Closed");
  const listEl = h("ul", { testid: "list", class: "list" });
  const rowErrEl = h("div", { testid: "row-error", class: "error", role: "alert" });
  const detailEl = h("section", { testid: "detail", class: "detail" });
  const el = h("div", { class: "issues" },
    h("div", { class: "toolbar" }, h("label", {}, "User ", userInput), filterOpen, filterClosed),
    rowErrEl,
    h("div", { class: "split" }, listEl, detailEl),
  );

  userInput.addEventListener("input", () => { user = userInput.value; renderList(); renderDetail(); });
  filterOpen.addEventListener("click", () => setFilter("open"));
  filterClosed.addEventListener("click", () => setFilter("closed"));

  // ---------- list ----------
  function loadList(): void {
    const token = ++listToken;
    const f = filter;
    const at = tick();
    list = { kind: "loading" };
    renderList();
    api.fetchIssues(f).then(
      items => {
        if (!alive || token !== listToken) return;
        list = { kind: "ok", items, at };
        if (f === "open") { openBase = { items, at }; updateCount(); }
        renderList();
      },
      e => {
        if (!alive || token !== listToken) return;
        list = { kind: "error", msg: errMsg(e) };
        renderList();
      },
    );
  }

  function setFilter(f: Filter): void {
    if (f === filter) return;
    filter = f;
    loadList();
  }

  function renderList(): void {
    filterOpen.setAttribute("aria-pressed", String(filter === "open"));
    filterClosed.setAttribute("aria-pressed", String(filter === "closed"));
    setMsg(rowErrEl, rowError);
    listEl.replaceChildren();
    if (list.kind === "loading") { listEl.append(h("li", { class: "status" }, `loading ${filter} issues`)); return; }
    if (list.kind === "error") { listEl.append(h("li", { class: "status error" }, `list error: ${list.msg}`)); return; }
    const rows = visibleRows();
    if (!rows) return;
    for (const issue of rows.items) {
      const assignee = assigneeOf(issue, rows.at);
      const title = titleOf(issue.id, issue.title, rows.at);
      const row = h("span", {
        testid: "issue", class: "issue-row", role: "button", tabindex: "0",
        "aria-current": sel?.id === issue.id ? "true" : undefined,
      }, `#${issue.id} ${title} (${assignee ?? "unassigned"})`);
      row.addEventListener("click", () => select(issue.id));
      row.addEventListener("keydown", ev => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); select(issue.id); } });
      const ra = h("button", { testid: "row-assign", type: "button" }, `assign to ${user}`);
      ra.addEventListener("click", ev => { ev.stopPropagation(); doAssign(issue.id, "row"); });
      const li = h("li", { class: sel?.id === issue.id ? "selected" : undefined }, row, ra);
      if (filter === "open") {
        const rc = h("button", { testid: "row-close", type: "button" }, "close");
        rc.addEventListener("click", ev => { ev.stopPropagation(); doClose(issue.id, "row"); });
        li.append(rc);
      }
      listEl.append(li);
    }
  }

  // ---------- actions ----------
  function isCurrent(s: Selection): boolean { return alive && sel === s; }

  function doAssign(id: number, source: "detail" | "row"): void {
    const who = user;
    if (!who.trim()) return;
    const seq = tick();
    const s = source === "detail" ? sel : null;
    if (s) s.assignError = null;
    if (source === "row") rowError = null;
    pushOp(assignOps, id, { seq, value: who });
    renderAll();
    api.assign(id, who).then(
      res => {
        if (!alive) return;
        dropOp(assignOps, id, seq);
        accept(assignDone, id, res && typeof res.assignee === "string" ? res.assignee : who, seq);
        renderAll();
      },
      e => {
        if (!alive) return;
        dropOp(assignOps, id, seq);
        if (source === "row") rowError = `row error: ${errMsg(e)}`;
        else if (s && isCurrent(s)) s.assignError = errMsg(e);
        renderAll();
      },
    );
  }

  function doRename(): void {
    const s = sel;
    if (!s) return;
    const title = s.nodes.titleInput.value.trim();
    if (!title) return;
    const id = s.id;
    const seq = tick();
    s.renameError = null;
    pushOp(titleOps, id, { seq, value: title });
    renderAll();
    api.renameIssue(id, title).then(
      res => {
        if (!alive) return;
        dropOp(titleOps, id, seq);
        accept(titleDone, id, res && typeof res.title === "string" ? res.title : title, seq);
        renderAll();
      },
      e => {
        if (!alive) return;
        dropOp(titleOps, id, seq);
        if (isCurrent(s)) s.renameError = `rename error: ${errMsg(e)}`;
        renderAll();
      },
    );
  }

  function doClose(id: number, source: "detail" | "row"): void {
    const seq = tick();
    const s = source === "detail" ? sel : null;
    if (s) s.closeError = null;
    if (source === "row") rowError = null;
    pushOp(closeOps, id, { seq, value: true });
    updateCount();
    renderAll();
    api.closeIssue(id).then(
      () => {
        if (!alive) return;
        dropOp(closeOps, id, seq);
        accept(closeDone, id, true, seq);
        updateCount();
        renderAll();
      },
      e => {
        if (!alive) return;
        dropOp(closeOps, id, seq);
        if (source === "row") rowError = `row error: ${errMsg(e)}`;
        else if (s && isCurrent(s)) s.closeError = `close error: ${errMsg(e)}`;
        updateCount();
        renderAll();
      },
    );
  }

  function doPost(): void {
    const s = sel;
    if (!s) return;
    const text = s.nodes.commentInput.value;
    const author = user;
    if (!text.trim() || !author.trim()) return;
    const key = tick();
    s.postError = null;
    const post: LocalPost = { key, author, text, sending: true };
    s.posts.push(post);
    s.nodes.commentInput.value = "";
    renderDetail();
    api.addComment(s.id, author, text).then(
      res => {
        if (!isCurrent(s)) return;
        post.sending = false;
        if (res && typeof res.author === "string" && typeof res.text === "string") { post.author = res.author; post.text = res.text; }
        renderDetail();
      },
      e => {
        if (!isCurrent(s)) return;
        s.posts = s.posts.filter(p => p !== post);
        s.postError = `post error: ${errMsg(e)}`;
        renderDetail();
      },
    );
  }

  function shownLabels(s: Selection): string[] | null {
    if (!s.labelsConfirmed && s.labelsStatus.kind !== "ok") return null;
    let labels = s.labelsConfirmed ? [...s.labelsConfirmed.labels] : [];
    for (const op of s.labelOps) {
      if (op.kind === "add") { if (!labels.includes(op.label)) labels.push(op.label); }
      else labels = labels.filter(l => l !== op.label);
    }
    return labels;
  }

  function labelChange(kind: "add" | "remove", label: string): void {
    const s = sel;
    if (!s) return;
    const seq = tick();
    s.labelError = null;
    const op: LabelOp = { seq, kind, label };
    s.labelOps.push(op);
    renderDetail();
    const call = kind === "add" ? api.addLabel(s.id, label) : api.removeLabel(s.id, label);
    call.then(
      labels => {
        if (!isCurrent(s)) return;
        s.labelOps = s.labelOps.filter(o => o !== op);
        if (Array.isArray(labels) && (!s.labelsConfirmed || s.labelsConfirmed.start < seq)) {
          s.labelsConfirmed = { labels, start: seq };
        }
        renderDetail();
      },
      e => {
        if (!isCurrent(s)) return;
        s.labelOps = s.labelOps.filter(o => o !== op);
        s.labelError = `label error: ${errMsg(e)}`;
        renderDetail();
      },
    );
  }

  function doAddLabel(): void {
    const s = sel;
    if (!s) return;
    const label = s.nodes.labelInput.value.trim();
    if (!label) return;
    const shown = shownLabels(s) ?? [];
    if (shown.includes(label)) return;
    s.nodes.labelInput.value = "";
    labelChange("add", label);
  }

  // ---------- selection ----------
  function buildDetailNodes(): DetailNodes {
    const head = h("h2", { class: "detail-head" });
    const body = h("p", { class: "detail-body" });
    const retry = h("button", { testid: "retry", type: "button" }, "retry");
    const assignBtn = h("button", { testid: "assign", type: "button" });
    const assignErr = h("div", { testid: "assign-error", class: "error", role: "alert" });
    const titleInput = h("input", { testid: "title-input", type: "text", "aria-label": "New title", placeholder: "new title" });
    const renameBtn = h("button", { testid: "rename", type: "button" }, "rename");
    const renameErr = h("div", { testid: "rename-error", class: "error", role: "alert" });
    const closeBtn = h("button", { testid: "close", type: "button" }, "close");
    const closeErr = h("div", { testid: "close-error", class: "error", role: "alert" });
    const comments = h("ul", { testid: "comments", class: "comments" });
    const commentInput = h("input", { testid: "comment-input", type: "text", "aria-label": "Comment", placeholder: "comment" });
    const postBtn = h("button", { testid: "post", type: "button" }, "post");
    const postErr = h("div", { testid: "post-error", class: "error", role: "alert" });
    const labels = h("div", { testid: "labels", class: "labels" });
    const labelInput = h("input", { testid: "label-input", type: "text", "aria-label": "Label", placeholder: "label" });
    const addLabelBtn = h("button", { testid: "add-label", type: "button" }, "add label");
    const labelErr = h("div", { testid: "label-error", class: "error", role: "alert" });
    const related = h("div", { testid: "related", class: "related" });

    retry.addEventListener("click", () => { if (sel) loadDetail(sel); });
    assignBtn.addEventListener("click", () => { if (sel) doAssign(sel.id, "detail"); });
    renameBtn.addEventListener("click", doRename);
    titleInput.addEventListener("keydown", ev => { if (ev.key === "Enter") doRename(); });
    closeBtn.addEventListener("click", () => { if (sel) doClose(sel.id, "detail"); });
    postBtn.addEventListener("click", doPost);
    commentInput.addEventListener("keydown", ev => { if (ev.key === "Enter") doPost(); });
    addLabelBtn.addEventListener("click", doAddLabel);
    labelInput.addEventListener("keydown", ev => { if (ev.key === "Enter") doAddLabel(); });

    const root = h("div", { class: "detail-inner" },
      head, body, retry,
      h("div", { class: "actions" }, assignBtn, closeBtn),
      assignErr, closeErr,
      h("div", { class: "rename" }, titleInput, renameBtn), renameErr,
      h("h3", {}, "Comments"), comments,
      h("div", { class: "post" }, commentInput, postBtn), postErr,
      h("h3", {}, "Labels"), labels,
      h("div", { class: "add-label" }, labelInput, addLabelBtn), labelErr,
      related,
    );
    return { root, head, body, assignBtn, assignErr, titleInput, renameErr, closeErr, comments, commentInput, postErr, labels, labelInput, labelErr, related };
  }

  function select(id: number): void {
    if (sel && sel.id === id) return;
    const s: Selection = {
      id,
      detail: { kind: "loading" },
      detailToken: 0,
      comments: { kind: "loading" },
      posts: [],
      labelsStatus: { kind: "loading" },
      labelsConfirmed: null,
      labelOps: [],
      related: { kind: "idle" },
      relatedToken: 0,
      assignError: null,
      renameError: null,
      closeError: null,
      postError: null,
      labelError: null,
      nodes: buildDetailNodes(),
    };
    sel = s;
    detailEl.replaceChildren(s.nodes.root);
    loadDetail(s);
    api.fetchComments(id).then(
      items => { if (isCurrent(s)) { s.comments = { kind: "ok", items: Array.isArray(items) ? items : [] }; renderDetail(); } },
      e => { if (isCurrent(s)) { s.comments = { kind: "error", msg: errMsg(e) }; renderDetail(); } },
    );
    const labelsAt = tick();
    api.fetchLabels(id).then(
      labels => {
        if (!isCurrent(s)) return;
        s.labelsStatus = { kind: "ok" };
        if (!s.labelsConfirmed || s.labelsConfirmed.start < labelsAt) s.labelsConfirmed = { labels: Array.isArray(labels) ? labels : [], start: labelsAt };
        renderDetail();
      },
      e => { if (isCurrent(s)) { s.labelsStatus = { kind: "error", msg: errMsg(e) }; renderDetail(); } },
    );
    renderAll();
  }

  function loadDetail(s: Selection): void {
    const token = ++s.detailToken;
    const at = tick();
    s.detail = { kind: "loading" };
    s.related = { kind: "idle" };
    s.relatedToken++;
    renderDetail();
    api.fetchIssue(s.id).then(
      data => {
        if (!isCurrent(s) || token !== s.detailToken) return;
        if (data == null) { s.detail = { kind: "missing" }; renderDetail(); return; }
        s.detail = { kind: "ok", data, at };
        loadRelated(s, data.title);
        renderDetail();
      },
      e => {
        if (!isCurrent(s) || token !== s.detailToken) return;
        s.detail = { kind: "error", msg: errMsg(e) };
        renderDetail();
      },
    );
  }

  function loadRelated(s: Selection, title: string): void {
    const token = ++s.relatedToken;
    s.related = { kind: "loading" };
    api.search(title).then(
      hits => {
        if (!isCurrent(s) || token !== s.relatedToken) return;
        s.related = { kind: "ok", hits: Array.isArray(hits) ? hits : [], title };
        renderDetail();
      },
      e => {
        if (!isCurrent(s) || token !== s.relatedToken) return;
        s.related = { kind: "error", msg: errMsg(e) };
        renderDetail();
      },
    );
  }

  function renderDetail(): void {
    const s = sel;
    if (!s) { detailEl.replaceChildren(h("p", { class: "status" }, "select an issue")); return; }
    const n = s.nodes;
    const d = s.detail;
    switch (d.kind) {
      case "loading": n.head.textContent = `loading #${s.id}`; setMsg(n.body, null); break;
      case "missing": n.head.textContent = `detail error: issue #${s.id} not found`; setMsg(n.body, null); break;
      case "error": n.head.textContent = `detail error: ${d.msg}`; setMsg(n.body, null); break;
      case "ok":
        n.head.textContent = `#${d.data.id} ${titleOf(s.id, d.data.title, d.at)}`;
        setMsg(n.body, d.data.body ?? "");
        break;
    }
    n.assignBtn.textContent = `assign to ${user}`;
    setMsg(n.assignErr, s.assignError);
    setMsg(n.renameErr, s.renameError);
    setMsg(n.closeErr, s.closeError);
    setMsg(n.postErr, s.postError);
    setMsg(n.labelErr, s.labelError);

    // comments
    n.comments.replaceChildren();
    if (s.comments.kind === "loading") n.comments.append(h("li", { class: "status" }, "loading comments"));
    else if (s.comments.kind === "error") n.comments.append(h("li", { class: "status error" }, `comments error: ${s.comments.msg}`));
    else for (const c of s.comments.items) n.comments.append(h("li", { testid: "comment" }, `${c.author}: ${c.text}`));
    for (const p of s.posts) {
      n.comments.append(h("li", { testid: "comment", class: p.sending ? "sending" : undefined },
        `${p.author}: ${p.text}${p.sending ? " (sending…)" : ""}`));
    }

    // labels
    n.labels.replaceChildren();
    const labels = shownLabels(s);
    if (labels) {
      for (const l of labels) {
        const rm = h("button", { testid: "remove-label", type: "button" }, `remove ${l}`);
        rm.addEventListener("click", () => labelChange("remove", l));
        n.labels.append(h("span", { class: "label-chip" }, h("span", { testid: "label" }, l), rm));
      }
    } else if (s.labelsStatus.kind === "error") {
      n.labels.append(h("span", { class: "status error" }, `labels error: ${s.labelsStatus.msg}`));
    } else {
      n.labels.append(h("span", { class: "status" }, "loading labels"));
    }

    // related
    n.related.replaceChildren();
    n.related.hidden = d.kind !== "ok";
    const r = s.related;
    if (d.kind === "ok") {
      n.related.append(h("h3", {}, "Related help"));
      if (r.kind === "loading" || r.kind === "idle") n.related.append(h("p", { class: "status" }, "finding related help"));
      else if (r.kind === "error") n.related.append(h("p", { class: "status error" }, `related help failed: ${r.msg}`));
      else if (r.hits.length === 0) n.related.append(h("p", { class: "status" }, "no related help"));
      else {
        const { hits, title } = r;
        for (const hit of hits.slice(0, 3)) {
          const b = h("button", { testid: "related-hit", type: "button" }, hit.name);
          b.addEventListener("click", () => ctx.openHelp({ query: title, hits, selectedId: hit.id }));
          n.related.append(b);
        }
      }
    }
  }

  function renderAll(): void { renderList(); renderDetail(); }

  renderAll();
  loadList();

  return { el, dispose() { alive = false; } };
}
