// The issues page: the list of issues, the selected issue's detail with its actions,
// comments and labels, and its related help.

import { errMsg, h } from "./dom";
import { addComment, addLabel, fetchComments, fetchIssue, fetchLabels, removeLabel, search } from "./api.js";
import type { Comment as IssueComment, Hit, Issue, IssueDetail } from "./api.js";
import type { Filter, IssuesStore } from "./issues-store";

export interface HelpPreset {
  query: string;
  id: number;
}

export interface IssuesNav {
  openHelp(preset: HelpPreset): void;
}

type Status = { s: "loading" } | { s: "ok" } | { s: "err"; m: string };
type DetailState = { s: "loading" } | { s: "ok"; v: IssueDetail } | { s: "nf" } | { s: "err"; m: string };
type RelatedState = { s: "none" } | { s: "loading" } | { s: "ok"; hits: Hit[] } | { s: "err"; m: string };

interface Errs {
  assign?: string;
  rename?: string;
  close?: string;
  post?: string;
  label?: string;
}

/** Everything the detail shows for the selected issue. A new selection gets a new Sel. */
interface Sel {
  id: number;
  detail: DetailState;
  detailTok: object;
  relatedTitle: string;
  related: RelatedState;
  relatedTok: object;
  comments: IssueComment[];
  sending: IssueComment[];
  commentsStatus: Status;
  commentsTok: object;
  labels: string[];
  labelsStatus: Status;
  labelsTok: object;
  errs: Errs;
}

interface DetailUi {
  draw(): void;
  refreshUser(): void;
}

export function mountIssues(container: HTMLElement, store: IssuesStore, nav: IssuesNav): () => void {
  let filter: Filter = "open";
  let user = "guest";
  let listStatus: Status = { s: "loading" };
  let listTok: object = {};
  let rowErr: string | null = null;
  let sel: Sel | null = null;
  let ui: DetailUi | null = null;

  const userInput = h("input", {
    testid: "user",
    type: "text",
    value: "guest",
    oninput: () => {
      user = userInput.value;
      // Only the labels change: rebuilding the rows here would replace a button the
      // pointer may be on when the input's change event fires on blur.
      for (const b of rowsEl.querySelectorAll<HTMLButtonElement>('[data-testid="row-assign"]')) {
        b.textContent = `assign to ${user}`;
      }
      ui?.refreshUser();
    },
  });
  const filterOpen = h("button", { testid: "filter-open", text: "Open", onclick: () => setFilter("open") });
  const filterClosed = h("button", { testid: "filter-closed", text: "Closed", onclick: () => setFilter("closed") });
  const rowErrEl = h("p", { testid: "row-error", cls: "error" });
  const listStatusEl = h("p", { cls: "status" });
  const rowsEl = h("ul", { cls: "rows" });
  const listEl = h("div", { testid: "list" }, listStatusEl, rowsEl);
  const detailEl = h("div", { testid: "detail", cls: "detail" });

  container.replaceChildren(
    h("div", { cls: "toolbar" }, h("label", {}, "Current user ", userInput), filterOpen, filterClosed),
    rowErrEl,
    h("div", { cls: "split" }, listEl, detailEl),
  );
  detailEl.replaceChildren(h("p", { cls: "status", text: "select an issue" }));

  // ---- list ----

  function setFilter(f: Filter): void {
    if (f === filter) return;
    filter = f;
    load();
  }

  function renderFilters(): void {
    filterOpen.setAttribute("aria-pressed", String(filter === "open"));
    filterClosed.setAttribute("aria-pressed", String(filter === "closed"));
  }

  function load(): void {
    const tok = {};
    listTok = tok;
    listStatus = { s: "loading" };
    renderFilters();
    renderList();
    store.load(filter).then(
      () => {
        if (listTok === tok) listStatus = { s: "ok" };
        renderList();
      },
      (e: unknown) => {
        if (listTok === tok) listStatus = { s: "err", m: errMsg(e) };
        renderList();
      },
    );
  }

  function renderList(): void {
    if (listStatus.s === "loading") listStatusEl.textContent = `loading ${filter} issues`;
    else if (listStatus.s === "err") listStatusEl.textContent = `list error: ${listStatus.m}`;
    else listStatusEl.textContent = "";
    const rows = listStatus.s === "ok" ? (store.rowsOf(filter) ?? []) : [];
    rowsEl.replaceChildren(...rows.map(rowItem));
  }

  function rowItem(r: Issue): HTMLLIElement {
    const who = r.assignee ?? "unassigned";
    return h(
      "li",
      { cls: "row" },
      h("button", { testid: "issue", cls: "issue", text: `#${r.id} ${r.title} (${who})`, onclick: () => select(r.id) }),
      h("button", { testid: "row-assign", text: `assign to ${user}`, onclick: () => rowAssign(r.id) }),
      filter === "open" ? h("button", { testid: "row-close", text: "close", onclick: () => rowClose(r.id) }) : null,
    );
  }

  function renderRowErr(): void {
    rowErrEl.textContent = rowErr === null ? "" : `row error: ${rowErr}`;
  }

  function rowAssign(id: number): void {
    rowErr = null;
    renderRowErr();
    const who = user.trim();
    if (who === "") return;
    store.assign(id, who).catch((e: unknown) => {
      rowErr = errMsg(e);
      renderRowErr();
    });
  }

  function rowClose(id: number): void {
    rowErr = null;
    renderRowErr();
    store.close(id).catch((e: unknown) => {
      rowErr = errMsg(e);
      renderRowErr();
    });
  }

  // ---- selection and detail ----

  function select(id: number): void {
    const s: Sel = {
      id,
      detail: { s: "loading" },
      detailTok: {},
      relatedTitle: "",
      related: { s: "none" },
      relatedTok: {},
      comments: [],
      sending: [],
      commentsStatus: { s: "loading" },
      commentsTok: {},
      labels: [],
      labelsStatus: { s: "loading" },
      labelsTok: {},
      errs: {},
    };
    sel = s;
    ui = buildDetail(s);
    loadDetail(s);
    loadComments(s);
    loadLabels(s);
  }

  function redraw(s: Sel): void {
    if (sel === s) ui?.draw();
  }

  function buildDetail(s: Sel): DetailUi {
    const statusEl = h("p", { cls: "status" });
    const headingEl = h("h2", { cls: "title" });
    const bodyEl = h("p", { cls: "body" });
    const retryBtn = h("button", { testid: "retry", text: "retry", onclick: () => loadDetail(s) });
    const assignBtn = h("button", { testid: "assign", text: `assign to ${user}`, onclick: () => doAssign(s) });
    const titleInput = h("input", { testid: "title-input", type: "text", placeholder: "New title" });
    const renameBtn = h("button", { testid: "rename", text: "rename", onclick: () => doRename(s, titleInput.value) });
    const closeBtn = h("button", { testid: "close", text: "close", onclick: () => doClose(s) });
    const errsEl = h("div", { cls: "errors" });

    const commentsStatus = h("p", { cls: "status" });
    const commentsList = h("ul", { cls: "comments" });
    const commentsEl = h("div", { testid: "comments" }, commentsStatus, commentsList);
    const commentInput = h("input", { testid: "comment-input", type: "text", placeholder: "Write a comment" });
    const postBtn = h("button", { testid: "post", text: "post", onclick: () => doPost(s, commentInput) });

    const labelsStatus = h("p", { cls: "status" });
    const labelsList = h("ul", { cls: "labels" });
    const labelsEl = h("div", { testid: "labels" }, labelsStatus, labelsList);
    const labelInput = h("input", { testid: "label-input", type: "text", placeholder: "Add a label" });
    const addLabelBtn = h("button", { testid: "add-label", text: "add label", onclick: () => doAddLabel(s, labelInput) });

    const relatedStatus = h("p", { cls: "status" });
    const relatedHits = h("div", { cls: "hits" });
    const relatedEl = h("div", { testid: "related" }, relatedStatus, relatedHits);

    detailEl.replaceChildren(
      h(
        "div",
        { cls: "sel" },
        statusEl,
        headingEl,
        bodyEl,
        h("div", { cls: "bar" }, retryBtn),
        h("div", { cls: "bar" }, assignBtn, titleInput, renameBtn, closeBtn),
        errsEl,
        commentsEl,
        h("div", { cls: "bar" }, commentInput, postBtn),
        labelsEl,
        h("div", { cls: "bar" }, labelInput, addLabelBtn),
        relatedEl,
      ),
    );

    const draw = (): void => {
      const d = s.detail;
      if (d.s === "loading") {
        statusEl.textContent = `loading #${s.id}`;
        headingEl.textContent = "";
        bodyEl.textContent = "";
      } else if (d.s === "ok") {
        statusEl.textContent = "";
        headingEl.textContent = `#${s.id} ${d.v.title}`;
        bodyEl.textContent = d.v.body;
      } else if (d.s === "nf") {
        statusEl.textContent = `detail error: issue #${s.id} not found`;
        headingEl.textContent = "";
        bodyEl.textContent = "";
      } else {
        statusEl.textContent = `detail error: ${d.m}`;
        headingEl.textContent = "";
        bodyEl.textContent = "";
      }

      const e = s.errs;
      const msgs: string[] = [];
      if (e.assign !== undefined) msgs.push(e.assign);
      if (e.rename !== undefined) msgs.push(`rename error: ${e.rename}`);
      if (e.close !== undefined) msgs.push(`close error: ${e.close}`);
      if (e.post !== undefined) msgs.push(`post error: ${e.post}`);
      if (e.label !== undefined) msgs.push(`label error: ${e.label}`);
      errsEl.replaceChildren(...msgs.map((text) => h("p", { cls: "error", text })));

      const cs = s.commentsStatus;
      if (cs.s === "loading") {
        commentsStatus.textContent = "loading comments";
        commentsList.replaceChildren();
      } else if (cs.s === "err") {
        commentsStatus.textContent = `comments error: ${cs.m}`;
        commentsList.replaceChildren();
      } else {
        commentsStatus.textContent = "";
        commentsList.replaceChildren(
          ...s.comments.map((c) => h("li", { testid: "comment", text: `${c.author}: ${c.text}` })),
          ...s.sending.map((c) => h("li", { testid: "comment", text: `${c.author}: ${c.text} (sending…)` })),
        );
      }

      const ls = s.labelsStatus;
      if (ls.s === "loading") {
        labelsStatus.textContent = "loading labels";
        labelsList.replaceChildren();
      } else if (ls.s === "err") {
        labelsStatus.textContent = `labels error: ${ls.m}`;
        labelsList.replaceChildren();
      } else {
        labelsStatus.textContent = "";
        labelsList.replaceChildren(
          ...s.labels.map((label) =>
            h(
              "li",
              {},
              h("span", { testid: "label", text: label }),
              h("button", { testid: "remove-label", text: `remove ${label}`, onclick: () => doRemoveLabel(s, label) }),
            ),
          ),
        );
      }

      const rs = s.related;
      if (rs.s === "none") {
        relatedStatus.textContent = "";
        relatedHits.replaceChildren();
      } else if (rs.s === "loading") {
        relatedStatus.textContent = "finding related help";
        relatedHits.replaceChildren();
      } else if (rs.s === "err") {
        relatedStatus.textContent = `related help failed: ${rs.m}`;
        relatedHits.replaceChildren();
      } else {
        relatedStatus.textContent = rs.hits.length === 0 ? "no related help" : "";
        relatedHits.replaceChildren(
          ...rs.hits
            .slice(0, 3)
            .map((hit) => h("button", { testid: "related-hit", text: hit.name, onclick: () => openRelated(s, hit) })),
        );
      }
    };

    draw();
    return {
      draw,
      refreshUser: () => {
        assignBtn.textContent = `assign to ${user}`;
      },
    };
  }

  function loadDetail(s: Sel): void {
    const tok = {};
    s.detailTok = tok;
    s.detail = { s: "loading" };
    s.related = { s: "none" };
    redraw(s);
    fetchIssue(s.id).then(
      (v) => {
        if (s.detailTok !== tok) return;
        if (v === null) {
          s.detail = { s: "nf" };
        } else {
          s.detail = { s: "ok", v };
        }
        redraw(s);
        if (v !== null) loadRelated(s, v.title);
      },
      (e: unknown) => {
        if (s.detailTok !== tok) return;
        s.detail = { s: "err", m: errMsg(e) };
        redraw(s);
      },
    );
  }

  function loadRelated(s: Sel, title: string): void {
    const tok = {};
    s.relatedTok = tok;
    s.relatedTitle = title;
    s.related = { s: "loading" };
    redraw(s);
    search(title).then(
      (hits) => {
        if (s.relatedTok !== tok) return;
        s.related = { s: "ok", hits };
        redraw(s);
      },
      (e: unknown) => {
        if (s.relatedTok !== tok) return;
        s.related = { s: "err", m: errMsg(e) };
        redraw(s);
      },
    );
  }

  function loadComments(s: Sel): void {
    const tok = {};
    s.commentsTok = tok;
    s.commentsStatus = { s: "loading" };
    redraw(s);
    fetchComments(s.id).then(
      (list) => {
        if (s.commentsTok !== tok) return;
        s.comments = list;
        s.commentsStatus = { s: "ok" };
        redraw(s);
      },
      (e: unknown) => {
        if (s.commentsTok !== tok) return;
        s.commentsStatus = { s: "err", m: errMsg(e) };
        redraw(s);
      },
    );
  }

  function loadLabels(s: Sel): void {
    const tok = {};
    s.labelsTok = tok;
    s.labelsStatus = { s: "loading" };
    redraw(s);
    fetchLabels(s.id).then(
      (list) => {
        if (s.labelsTok !== tok) return;
        s.labels = list;
        s.labelsStatus = { s: "ok" };
        redraw(s);
      },
      (e: unknown) => {
        if (s.labelsTok !== tok) return;
        s.labelsStatus = { s: "err", m: errMsg(e) };
        redraw(s);
      },
    );
  }

  function doAssign(s: Sel): void {
    s.errs.assign = undefined;
    redraw(s);
    const who = user.trim();
    if (who === "") return;
    store.assign(s.id, who).catch((e: unknown) => {
      s.errs.assign = errMsg(e);
      redraw(s);
    });
  }

  function doRename(s: Sel, raw: string): void {
    const title = raw.trim();
    if (title === "") return;
    s.errs.rename = undefined;
    const before = s.detail.s === "ok" ? s.detail.v.title : null;
    if (s.detail.s === "ok") s.detail.v.title = title;
    redraw(s);
    store.rename(s.id, title).catch((e: unknown) => {
      if (before !== null && s.detail.s === "ok") s.detail.v.title = before;
      s.errs.rename = errMsg(e);
      redraw(s);
    });
  }

  function doClose(s: Sel): void {
    s.errs.close = undefined;
    redraw(s);
    store.close(s.id).catch((e: unknown) => {
      s.errs.close = errMsg(e);
      redraw(s);
    });
  }

  function doPost(s: Sel, input: HTMLInputElement): void {
    const text = input.value.trim();
    const author = user.trim();
    if (text === "" || author === "") return;
    s.errs.post = undefined;
    const item: IssueComment = { author, text };
    s.sending.push(item);
    input.value = "";
    redraw(s);
    addComment(s.id, author, text).then(
      (c) => {
        s.sending = s.sending.filter((x) => x !== item);
        s.comments.push({ author: c.author, text: c.text });
        redraw(s);
      },
      (e: unknown) => {
        s.sending = s.sending.filter((x) => x !== item);
        s.errs.post = errMsg(e);
        redraw(s);
      },
    );
  }

  function doAddLabel(s: Sel, input: HTMLInputElement): void {
    const label = input.value.trim();
    if (label === "" || s.labels.includes(label)) return;
    s.errs.label = undefined;
    s.labels.push(label);
    input.value = "";
    redraw(s);
    addLabel(s.id, label).catch((e: unknown) => {
      const at = s.labels.lastIndexOf(label);
      if (at >= 0) s.labels.splice(at, 1);
      s.errs.label = errMsg(e);
      redraw(s);
    });
  }

  function doRemoveLabel(s: Sel, label: string): void {
    const at = s.labels.indexOf(label);
    if (at < 0) return;
    s.errs.label = undefined;
    s.labels.splice(at, 1);
    redraw(s);
    removeLabel(s.id, label).catch((e: unknown) => {
      s.labels.splice(Math.min(at, s.labels.length), 0, label);
      s.errs.label = errMsg(e);
      redraw(s);
    });
  }

  function openRelated(s: Sel, hit: Hit): void {
    const query = s.detail.s === "ok" ? s.detail.v.title : s.relatedTitle;
    nav.openHelp({ query, id: hit.id });
  }

  // ---- start ----

  const unsubscribe = store.subscribe(renderList);
  renderFilters();
  load();
  renderList();
  return () => {
    unsubscribe();
  };
}
