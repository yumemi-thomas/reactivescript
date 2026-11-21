import {
  fetchIssues, fetchIssue, assign, renameIssue, closeIssue, fetchComments, addComment,
  fetchLabels, addLabel, removeLabel, search,
  type Issue, type IssueDetail, type Comment, type Hit,
} from "./api.js";
import { h, fill, button, input, message, onEnter } from "./dom";
import type { AppContext } from "./main";

type Filter = "open" | "closed";
type Op<T> = { seq: number; value: T };

type ListState =
  | { kind: "loading"; filter: Filter }
  | { kind: "ok"; filter: Filter; rows: Issue[] }
  | { kind: "error"; filter: Filter; message: string };

type DetailState =
  | { kind: "loading" }
  | { kind: "ok"; issue: IssueDetail }
  | { kind: "missing" }
  | { kind: "error"; message: string };

type Loadable<T> = { kind: "loading" } | { kind: "ok"; value: T } | { kind: "error"; message: string };

type LocalComment = { author: string; text: string; sending: boolean };
type LabelOp = { seq: number; kind: "add" | "remove"; label: string };

interface DetailErrors {
  assign: string | null;
  rename: string | null;
  close: string | null;
  post: string | null;
  label: string | null;
}

interface Selection {
  id: number;
  detail: DetailState;
  detailToken: number;
  errors: DetailErrors;
  comments: Loadable<Comment[]>;
  localComments: LocalComment[];
  labels: Loadable<string[]>;
  labelOps: LabelOp[];
  labelAppliedSeq: number;
  related: Loadable<{ query: string; hits: Hit[] }> | null;
  relatedToken: number;
  el: DetailElements;
}

interface DetailElements {
  head: HTMLElement;
  retry: HTMLButtonElement;
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
}

/** The newest pending value of a field, if any. */
function top<T>(ops: Map<number, Op<T>[]>, id: number): Op<T> | undefined {
  const list = ops.get(id);
  return list && list.length ? list[list.length - 1] : undefined;
}

function addOp<T>(ops: Map<number, Op<T>[]>, id: number, op: Op<T>): void {
  const list = ops.get(id);
  if (list) list.push(op); else ops.set(id, [op]);
}

function dropOp<T>(ops: Map<number, Op<T>[]>, id: number, op: Op<T>): void {
  const list = ops.get(id);
  if (!list) return;
  const i = list.indexOf(op);
  if (i >= 0) list.splice(i, 1);
  if (!list.length) ops.delete(id);
}

export function mountIssues(root: HTMLElement, ctx: AppContext): () => void {
  let alive = true;
  let seq = 0;

  let filter: Filter = "open";
  let list: ListState = { kind: "loading", filter };
  let listToken = 0;

  // optimistic changes still in flight, per issue id
  const assignOps = new Map<number, Op<string>[]>();
  const titleOps = new Map<number, Op<string>[]>();
  const closeOps = new Map<number, Op<true>[]>();
  // the newest op whose answer has been applied, per issue id
  const assignApplied = new Map<number, number>();
  const titleApplied = new Map<number, number>();

  let rowError: string | null = null;
  let sel: Selection | null = null;

  // ---- skeleton ----
  const userInput = input("user", "Current user", "guest");
  const filterOpen = button("filter-open", "Open", () => setFilter("open"));
  const filterClosed = button("filter-closed", "Closed", () => setFilter("closed"));
  const rowErrEl = h("p", { testid: "row-error", role: "alert" });
  const listEl = h("div", { testid: "list", "aria-live": "polite" });
  const detailEl = h("div", { testid: "detail" });
  root.append(
    h("h2", {}, "Issues"),
    h("label", {}, "Current user ", userInput),
    h("div", { role: "group", "aria-label": "Filter" }, filterOpen, " ", filterClosed),
    rowErrEl,
    h("div", { class: "issues-layout" }, listEl, detailEl),
  );
  userInput.addEventListener("input", () => { renderList(); renderDetail(); });

  const currentUser = () => userInput.value.trim();

  // ---- list ----
  function viewRow(row: Issue): Issue {
    return {
      id: row.id,
      title: top(titleOps, row.id)?.value ?? row.title,
      assignee: top(assignOps, row.id)?.value ?? row.assignee,
    };
  }

  function visibleRows(): Issue[] {
    if (list.kind !== "ok") return [];
    const rows = list.filter === "open" ? list.rows.filter(r => !closeOps.has(r.id)) : list.rows;
    return rows.map(viewRow);
  }

  function renderList(): void {
    filterOpen.setAttribute("aria-pressed", String(filter === "open"));
    filterClosed.setAttribute("aria-pressed", String(filter === "closed"));
    rowErrEl.textContent = rowError === null ? "" : `row error: ${rowError}`;
    rowErrEl.hidden = rowError === null;

    if (list.kind === "loading") { fill(listEl, h("p", { role: "status" }, `loading ${list.filter} issues`)); return; }
    if (list.kind === "error") { fill(listEl, h("p", { role: "alert" }, `list error: ${list.message}`)); return; }

    const rows = visibleRows();
    const user = userInput.value;
    const ul = h("ul", {});
    for (const r of rows) {
      const selected = sel?.id === r.id;
      const label = h("span", {
        testid: "issue", role: "button", tabindex: "0", "aria-current": selected ? "true" : undefined,
      }, `#${r.id} ${r.title} (${r.assignee ?? "unassigned"})`);
      label.addEventListener("click", () => select(r.id));
      label.addEventListener("keydown", e => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); select(r.id); }
      });
      ul.appendChild(h("li", { class: selected ? "selected" : undefined },
        label, " ",
        button("row-assign", `assign to ${user}`, () => doAssign(r.id, "row")),
        list.filter === "open" ? [" ", button("row-close", "close", () => doClose(r.id, "row"))] : null,
      ));
    }
    fill(listEl, rows.length ? ul : h("p", {}, `no ${list.filter} issues`));
    if (list.filter === "open") ctx.setOpenCount(rows.length);
  }

  function loadList(): void {
    const token = ++listToken;
    const f = filter;
    list = { kind: "loading", filter: f };
    renderList();
    fetchIssues(f).then(
      rows => {
        if (!alive || token !== listToken) return;
        list = { kind: "ok", filter: f, rows };
        renderList();
      },
      err => {
        if (!alive || token !== listToken) return;
        list = { kind: "error", filter: f, message: message(err) };
        renderList();
      },
    );
  }

  function setFilter(f: Filter): void {
    if (f === filter) return;
    filter = f;
    loadList();
  }

  function patchRow(id: number, patch: Partial<Issue>): void {
    if (list.kind !== "ok") return;
    list = { ...list, rows: list.rows.map(r => (r.id === id ? { ...r, ...patch } : r)) };
  }

  const render = () => { renderList(); renderDetail(); };

  // ---- actions shared by the rows and the detail ----
  function doAssign(id: number, origin: "row" | "detail"): void {
    const user = currentUser();
    if (!user) return;
    const from = origin === "detail" ? sel : null;
    if (origin === "row") rowError = null;
    else if (from) from.errors.assign = null;
    const op: Op<string> = { seq: seq++, value: user };
    addOp(assignOps, id, op);
    render();
    assign(id, user).then(
      answer => {
        if (!alive) return;
        dropOp(assignOps, id, op);
        if (op.seq > (assignApplied.get(id) ?? -1)) {
          assignApplied.set(id, op.seq);
          patchRow(id, { assignee: answer.assignee });
        }
        render();
      },
      err => {
        if (!alive) return;
        dropOp(assignOps, id, op);
        if (origin === "row") rowError = message(err);
        else if (from && from === sel) from.errors.assign = message(err);
        render();
      },
    );
  }

  function doClose(id: number, origin: "row" | "detail"): void {
    const from = origin === "detail" ? sel : null;
    if (origin === "row") rowError = null;
    else if (from) from.errors.close = null;
    const op: Op<true> = { seq: seq++, value: true };
    addOp(closeOps, id, op);
    render();
    closeIssue(id).then(
      () => {
        if (!alive) return;
        if (list.kind === "ok" && list.filter === "open") {
          list = { ...list, rows: list.rows.filter(r => r.id !== id) };
        }
        dropOp(closeOps, id, op);
        render();
      },
      err => {
        if (!alive) return;
        dropOp(closeOps, id, op);
        if (origin === "row") rowError = message(err);
        else if (from && from === sel) from.errors.close = message(err);
        render();
      },
    );
  }

  // ---- detail ----
  function select(id: number): void {
    if (sel?.id === id) return;
    const s = newSelection(id);
    sel = s;
    fill(detailEl, buildDetail(s));
    loadDetail(s);
    loadComments(s);
    loadLabels(s);
    render();
  }

  function newSelection(id: number): Selection {
    const el: DetailElements = {
      head: h("div", { "aria-live": "polite" }),
      retry: button("retry", "retry", () => { if (sel === s) loadDetail(s); }),
      assignBtn: button("assign", "", () => { if (sel === s) doAssign(s.id, "detail"); }),
      assignErr: h("p", { testid: "assign-error", role: "alert" }),
      titleInput: input("title-input", "New title", "", { placeholder: "New title" }),
      renameErr: h("p", { testid: "rename-error", role: "alert" }),
      closeErr: h("p", { testid: "close-error", role: "alert" }),
      comments: h("div", { testid: "comments", "aria-live": "polite" }),
      commentInput: input("comment-input", "Comment", "", { placeholder: "Write a comment" }),
      postErr: h("p", { testid: "post-error", role: "alert" }),
      labels: h("div", { testid: "labels", "aria-live": "polite" }),
      labelInput: input("label-input", "Label", "", { placeholder: "Add a label" }),
      labelErr: h("p", { testid: "label-error", role: "alert" }),
      related: h("div", { testid: "related", "aria-live": "polite" }),
    };
    const s: Selection = {
      id,
      detail: { kind: "loading" },
      detailToken: 0,
      errors: { assign: null, rename: null, close: null, post: null, label: null },
      comments: { kind: "loading" },
      localComments: [],
      labels: { kind: "loading" },
      labelOps: [],
      labelAppliedSeq: -1,
      related: null,
      relatedToken: 0,
      el,
    };
    onEnter(el.titleInput, () => { if (sel === s) doRename(s); });
    onEnter(el.commentInput, () => { if (sel === s) doPost(s); });
    onEnter(el.labelInput, () => { if (sel === s) doAddLabel(s); });
    return s;
  }

  function buildDetail(s: Selection): Node[] {
    const e = s.el;
    return [
      e.head,
      e.retry,
      h("div", { class: "actions" },
        e.assignBtn, e.assignErr,
        h("div", {}, e.titleInput, " ", button("rename", "rename", () => { if (sel === s) doRename(s); })),
        e.renameErr,
        button("close", "close", () => { if (sel === s) doClose(s.id, "detail"); }),
        e.closeErr,
      ),
      h("h3", {}, "Labels"),
      e.labels,
      h("div", {}, e.labelInput, " ", button("add-label", "add label", () => { if (sel === s) doAddLabel(s); })),
      e.labelErr,
      h("h3", {}, "Comments"),
      e.comments,
      h("div", {}, e.commentInput, " ", button("post", "post", () => { if (sel === s) doPost(s); })),
      e.postErr,
      e.related,
    ];
  }

  function setErr(el: HTMLElement, text: string | null): void {
    el.textContent = text ?? "";
    el.hidden = text === null;
  }

  function renderDetail(): void {
    const s = sel;
    if (!s) { fill(detailEl, h("p", {}, "select an issue")); return; }
    const e = s.el;

    switch (s.detail.kind) {
      case "loading": fill(e.head, h("p", { role: "status" }, `loading #${s.id}`)); break;
      case "ok": {
        const title = top(titleOps, s.id)?.value ?? s.detail.issue.title;
        fill(e.head, h("h3", {}, `#${s.id} ${title}`), h("p", {}, s.detail.issue.body));
        break;
      }
      case "missing": fill(e.head, h("p", { role: "alert" }, `detail error: issue #${s.id} not found`)); break;
      case "error": fill(e.head, h("p", { role: "alert" }, `detail error: ${s.detail.message}`)); break;
    }

    e.assignBtn.textContent = `assign to ${userInput.value}`;
    setErr(e.assignErr, s.errors.assign);
    setErr(e.renameErr, s.errors.rename === null ? null : `rename error: ${s.errors.rename}`);
    setErr(e.closeErr, s.errors.close === null ? null : `close error: ${s.errors.close}`);
    setErr(e.postErr, s.errors.post === null ? null : `post error: ${s.errors.post}`);
    setErr(e.labelErr, s.errors.label === null ? null : `label error: ${s.errors.label}`);

    // comments
    const commentParts: Node[] = [];
    if (s.comments.kind === "loading") commentParts.push(h("p", { role: "status" }, "loading comments"));
    if (s.comments.kind === "error") commentParts.push(h("p", { role: "alert" }, `comments error: ${s.comments.message}`));
    const rows: Node[] = [];
    if (s.comments.kind === "ok") {
      for (const c of s.comments.value) rows.push(h("li", { testid: "comment" }, `${c.author}: ${c.text}`));
    }
    for (const c of s.localComments) {
      rows.push(h("li", { testid: "comment", "aria-busy": c.sending ? "true" : undefined },
        `${c.author}: ${c.text}${c.sending ? " (sending…)" : ""}`));
    }
    if (rows.length) commentParts.push(h("ul", {}, rows));
    else if (s.comments.kind === "ok") commentParts.push(h("p", {}, "no comments"));
    fill(e.comments, commentParts);

    // labels
    const labelParts: Node[] = [];
    if (s.labels.kind === "loading") labelParts.push(h("p", { role: "status" }, "loading labels"));
    if (s.labels.kind === "error") labelParts.push(h("p", { role: "alert" }, `labels error: ${s.labels.message}`));
    const shown = shownLabels(s);
    if (shown.length) {
      labelParts.push(h("ul", {}, shown.map(l => h("li", {},
        h("span", { testid: "label" }, l), " ",
        button("remove-label", `remove ${l}`, () => { if (sel === s) doRemoveLabel(s, l); }),
      ))));
    } else if (s.labels.kind === "ok") labelParts.push(h("p", {}, "no labels"));
    fill(e.labels, labelParts);

    // related help
    if (s.detail.kind !== "ok" || s.related === null) {
      e.related.hidden = true;
      fill(e.related);
    } else {
      e.related.hidden = false;
      const r = s.related;
      if (r.kind === "loading") fill(e.related, h("p", { role: "status" }, "finding related help"));
      else if (r.kind === "error") fill(e.related, h("p", { role: "alert" }, `related help failed: ${r.message}`));
      else if (!r.value.hits.length) fill(e.related, h("p", {}, "no related help"));
      else {
        const { query, hits } = r.value;
        fill(e.related, h("h3", {}, "Related help"), h("ul", {}, hits.slice(0, 3).map(hit => h("li", {},
          button("related-hit", hit.name, () => ctx.openHelp({ query, hits, selectId: hit.id }))))));
      }
    }
  }

  function loadDetail(s: Selection): void {
    const token = ++s.detailToken;
    s.detail = { kind: "loading" };
    s.related = null;
    s.relatedToken++;
    renderDetail();
    fetchIssue(s.id).then(
      issue => {
        if (!alive || sel !== s || token !== s.detailToken) return;
        s.detail = issue ? { kind: "ok", issue } : { kind: "missing" };
        if (issue) loadRelated(s, issue.title);
        renderDetail();
      },
      err => {
        if (!alive || sel !== s || token !== s.detailToken) return;
        s.detail = { kind: "error", message: message(err) };
        renderDetail();
      },
    );
  }

  function loadRelated(s: Selection, query: string): void {
    const token = ++s.relatedToken;
    s.related = { kind: "loading" };
    search(query).then(
      hits => {
        if (!alive || sel !== s || token !== s.relatedToken) return;
        s.related = { kind: "ok", value: { query, hits } };
        renderDetail();
      },
      err => {
        if (!alive || sel !== s || token !== s.relatedToken) return;
        s.related = { kind: "error", message: message(err) };
        renderDetail();
      },
    );
  }

  function loadComments(s: Selection): void {
    fetchComments(s.id).then(
      comments => {
        if (!alive || sel !== s) return;
        s.comments = { kind: "ok", value: comments };
        renderDetail();
      },
      err => {
        if (!alive || sel !== s) return;
        s.comments = { kind: "error", message: message(err) };
        renderDetail();
      },
    );
  }

  function loadLabels(s: Selection): void {
    fetchLabels(s.id).then(
      labels => {
        if (!alive || sel !== s) return;
        if (s.labelAppliedSeq < 0) s.labels = { kind: "ok", value: labels };
        renderDetail();
      },
      err => {
        if (!alive || sel !== s) return;
        if (s.labelAppliedSeq < 0) s.labels = { kind: "error", message: message(err) };
        renderDetail();
      },
    );
  }

  function doRename(s: Selection): void {
    const title = s.el.titleInput.value.trim();
    if (!title) return;
    const id = s.id;
    s.errors.rename = null;
    const op: Op<string> = { seq: seq++, value: title };
    addOp(titleOps, id, op);
    render();
    renameIssue(id, title).then(
      answer => {
        if (!alive) return;
        dropOp(titleOps, id, op);
        if (op.seq > (titleApplied.get(id) ?? -1)) {
          titleApplied.set(id, op.seq);
          patchRow(id, { title: answer.title });
          if (sel && sel.id === id && sel.detail.kind === "ok") {
            sel.detail = { kind: "ok", issue: { ...sel.detail.issue, title: answer.title } };
          }
        }
        render();
      },
      err => {
        if (!alive) return;
        dropOp(titleOps, id, op);
        if (sel === s) s.errors.rename = message(err);
        render();
      },
    );
  }

  function doPost(s: Selection): void {
    const text = s.el.commentInput.value.trim();
    const author = currentUser();
    if (!text || !author) return;
    s.errors.post = null;
    const local: LocalComment = { author, text, sending: true };
    s.localComments.push(local);
    s.el.commentInput.value = "";
    renderDetail();
    addComment(s.id, author, text).then(
      answer => {
        if (!alive || sel !== s) return;
        local.sending = false;
        local.author = answer.author;
        local.text = answer.text;
        renderDetail();
      },
      err => {
        if (!alive || sel !== s) return;
        const i = s.localComments.indexOf(local);
        if (i >= 0) s.localComments.splice(i, 1);
        s.errors.post = message(err);
        renderDetail();
      },
    );
  }

  function shownLabels(s: Selection): string[] {
    const out = s.labels.kind === "ok" ? [...s.labels.value] : [];
    for (const op of s.labelOps) {
      const i = out.indexOf(op.label);
      if (op.kind === "add" && i < 0) out.push(op.label);
      if (op.kind === "remove" && i >= 0) out.splice(i, 1);
    }
    return out;
  }

  function labelChange(s: Selection, kind: "add" | "remove", label: string): void {
    s.errors.label = null;
    const op: LabelOp = { seq: seq++, kind, label };
    s.labelOps.push(op);
    renderDetail();
    const call = kind === "add" ? addLabel(s.id, label) : removeLabel(s.id, label);
    const done = () => {
      const i = s.labelOps.indexOf(op);
      if (i >= 0) s.labelOps.splice(i, 1);
    };
    call.then(
      labels => {
        if (!alive || sel !== s) return;
        done();
        if (op.seq > s.labelAppliedSeq) {
          s.labelAppliedSeq = op.seq;
          s.labels = { kind: "ok", value: labels };
        }
        renderDetail();
      },
      err => {
        if (!alive || sel !== s) return;
        done();
        s.errors.label = message(err);
        renderDetail();
      },
    );
  }

  function doAddLabel(s: Selection): void {
    const label = s.el.labelInput.value.trim();
    if (!label) return;
    if (shownLabels(s).includes(label)) return;
    s.el.labelInput.value = "";
    labelChange(s, "add", label);
  }

  function doRemoveLabel(s: Selection, label: string): void {
    if (!shownLabels(s).includes(label)) return;
    labelChange(s, "remove", label);
  }

  loadList();
  renderDetail();
  return () => { alive = false; };
}
