import {
  addComment,
  addLabel,
  assign,
  closeIssue,
  fetchComments,
  fetchIssue,
  fetchIssues,
  fetchLabels,
  removeLabel,
  renameIssue,
  search,
} from "./api.js";
import type { Hit, Issue, IssueDetail } from "./api.js";
import { type App, type Child, type Destroy, call, el, errMsg, fill } from "./shared";

type Filter = "open" | "closed";

type ListState = { kind: "loading" } | { kind: "ok" } | { kind: "error"; message: string };

type Head =
  | { kind: "loading" }
  | { kind: "ok"; detail: IssueDetail }
  | { kind: "notfound" }
  | { kind: "error"; message: string };

interface Shown {
  author: string;
  text: string;
  /** posted from this page */
  local: boolean;
  /** still being sent */
  pending: boolean;
}

interface Loaded<T> {
  status: "loading" | "ok" | "error";
  items: T;
  message: string;
}

interface Related {
  status: "loading" | "ok" | "error";
  query: string;
  hits: Hit[];
  message: string;
}

interface Dom {
  root: HTMLElement;
  head: HTMLElement;
  retry: HTMLButtonElement;
  assign: HTMLButtonElement;
  assignErr: HTMLElement;
  title: HTMLInputElement;
  rename: HTMLButtonElement;
  renameErr: HTMLElement;
  close: HTMLButtonElement;
  closeErr: HTMLElement;
  related: HTMLElement;
  comments: HTMLElement;
  commentInput: HTMLInputElement;
  post: HTMLButtonElement;
  postErr: HTMLElement;
  labels: HTMLElement;
  labelInput: HTMLInputElement;
  addLabel: HTMLButtonElement;
  labelErr: HTMLElement;
}

/** The selected issue and everything the detail shows about it. */
interface Sel {
  id: number;
  dom: Dom;
  head: Head;
  related: Related;
  comments: Loaded<Shown[]>;
  labels: Loaded<string[]>;
  assignErr: string | null;
  renameErr: string | null;
  closeErr: string | null;
  postErr: string | null;
  labelErr: string | null;
  /** latest request for the detail head; older answers are ignored */
  headSeq: number;
  /** latest related-help search; older answers are ignored */
  relSeq: number;
}

export function mountIssues(container: HTMLElement, app: App): Destroy {
  let alive = true;
  let filter: Filter = "open";
  let gen = 0;
  let user = "guest";
  let issues: Issue[] = [];
  let listState: ListState = { kind: "loading" };
  /** ids whose close is in the air: a reload must not bring them back */
  const closing = new Set<number>();
  let rowError: string | null = null;
  let sel: Sel | null = null;

  const userName = (): string => user.trim();

  const listEl = el("div", { testid: "list", cls: "d-list", attrs: { "aria-live": "polite" } });
  const rowErrorEl = el("p", { testid: "row-error", cls: "d-error" });
  const detailEl = el("section", { testid: "detail", cls: "d-detail", attrs: { "aria-live": "polite" } });
  const filterOpen = el("button", { testid: "filter-open", cls: "d-chip", onClick: () => setFilter("open") }, "Open");
  const filterClosed = el("button", { testid: "filter-closed", cls: "d-chip", onClick: () => setFilter("closed") }, "Closed");
  const userInput = el("input", {
    testid: "user",
    value: user,
    attrs: { "aria-label": "Current user", autocomplete: "off" },
    onInput: v => {
      user = v;
      renderList();
      if (sel !== null) sel.dom.assign.textContent = `assign to ${userName()}`;
    },
  });

  container.replaceChildren(
    el(
      "div",
      { cls: "d-issues" },
      el("div", { cls: "d-toolbar" }, el("label", { cls: "d-field" }, "Current user", userInput), el("div", { cls: "d-filters" }, filterOpen, filterClosed)),
      listEl,
      rowErrorEl,
      detailEl,
    ),
  );
  fill(detailEl, el("p", { cls: "d-status" }, "select an issue"));

  function renderFilters(): void {
    filterOpen.setAttribute("aria-pressed", String(filter === "open"));
    filterClosed.setAttribute("aria-pressed", String(filter === "closed"));
  }

  function renderRowError(): void {
    fill(rowErrorEl, rowError);
  }

  function rowEl(issue: Issue, isSelected: boolean): HTMLElement {
    return el(
      "li",
      { cls: isSelected ? "d-row d-selected" : "d-row" },
      el("button", { testid: "issue", cls: "d-issue", onClick: () => select(issue.id) }, `#${issue.id} ${issue.title} (${issue.assignee ?? "unassigned"})`),
      el("button", { testid: "row-assign", cls: "d-small", onClick: () => rowAssign(issue.id) }, `assign to ${userName()}`),
      filter === "open" ? el("button", { testid: "row-close", cls: "d-small", onClick: () => rowClose(issue.id) }, "close") : null,
    );
  }

  function renderList(): void {
    const kids: Child[] = [];
    if (listState.kind === "loading") kids.push(el("p", { cls: "d-status" }, `loading ${filter} issues`));
    if (listState.kind === "error") kids.push(el("p", { cls: "d-error" }, `list error: ${listState.message}`));
    const selectedId = sel !== null ? sel.id : null;
    kids.push(el("ul", { cls: "d-rows" }, ...issues.map(issue => rowEl(issue, issue.id === selectedId))));
    fill(listEl, ...kids);
  }

  /** The count follows the open list while it shows; otherwise it keeps its last number. */
  function updateCount(): void {
    if (alive && filter === "open" && listState.kind === "ok") app.setOpenCount(issues.length);
  }

  function loadList(): void {
    const my = ++gen;
    const f = filter;
    issues = [];
    listState = { kind: "loading" };
    renderList();
    call(() => fetchIssues(f)).then(
      list => {
        if (!alive || my !== gen) return;
        issues = f === "open" ? list.filter(i => !closing.has(i.id)) : list;
        listState = { kind: "ok" };
        renderList();
        updateCount();
      },
      e => {
        if (!alive || my !== gen) return;
        listState = { kind: "error", message: errMsg(e) };
        renderList();
      },
    );
  }

  function setFilter(f: Filter): void {
    if (f === filter) return;
    filter = f;
    renderFilters();
    loadList();
  }

  // ---- selection and the detail ----

  function select(id: number): void {
    const dom = buildDetail(id);
    const s: Sel = {
      id,
      dom,
      head: { kind: "loading" },
      related: { status: "loading", query: "", hits: [], message: "" },
      comments: { status: "loading", items: [], message: "" },
      labels: { status: "loading", items: [], message: "" },
      assignErr: null,
      renameErr: null,
      closeErr: null,
      postErr: null,
      labelErr: null,
      headSeq: 0,
      relSeq: 0,
    };
    sel = s;
    detailEl.replaceChildren(dom.root);
    renderDetail(s);
    renderList();
    loadHead(s);
    loadComments(s);
    loadLabels(s);
  }

  /** Builds the detail's controls once per selection; the inputs live as long as the selection. */
  function buildDetail(id: number): Dom {
    const current = (): Sel | null => (sel !== null && sel.id === id ? sel : null);

    const head = el("div", { cls: "d-head" });
    const retry = el("button", { testid: "retry", cls: "d-small", onClick: () => { const s = current(); if (s) loadHead(s); } }, "retry");
    const assignBtn = el("button", { testid: "assign", cls: "d-small", onClick: () => { const s = current(); if (s) assignFromDetail(s); } }, `assign to ${userName()}`);
    const assignErr = el("p", { cls: "d-error" });

    const title = el("input", { testid: "title-input", attrs: { "aria-label": "New title", placeholder: "New title" } });
    const rename = el("button", { testid: "rename", cls: "d-small", onClick: () => { const s = current(); if (s) renameFromDetail(s); } }, "rename");
    const renameErr = el("p", { cls: "d-error" });

    const close = el("button", { testid: "close", cls: "d-small", onClick: () => { const s = current(); if (s) closeFromDetail(s); } }, "close");
    const closeErr = el("p", { cls: "d-error" });

    const related = el("div", { testid: "related", cls: "d-plain" });

    const comments = el("div", { testid: "comments", cls: "d-plain" });
    const commentInput = el("input", {
      testid: "comment-input",
      attrs: { "aria-label": "Comment", placeholder: "Write a comment" },
      onEnter: () => { const s = current(); if (s) postFromDetail(s); },
    });
    const post = el("button", { testid: "post", cls: "d-small", onClick: () => { const s = current(); if (s) postFromDetail(s); } }, "post");
    const postErr = el("p", { cls: "d-error" });

    const labels = el("div", { testid: "labels", cls: "d-plain" });
    const labelInput = el("input", {
      testid: "label-input",
      attrs: { "aria-label": "Label", placeholder: "Add a label" },
      onEnter: () => { const s = current(); if (s) addLabelFromDetail(s); },
    });
    const addLabelBtn = el("button", { testid: "add-label", cls: "d-small", onClick: () => { const s = current(); if (s) addLabelFromDetail(s); } }, "add label");
    const labelErr = el("p", { cls: "d-error" });

    const root = el(
      "div",
      { cls: "d-body" },
      head,
      el("div", { cls: "d-actions" }, retry, assignBtn),
      assignErr,
      el("div", { cls: "d-actions" }, title, rename),
      renameErr,
      el("div", { cls: "d-actions" }, close),
      closeErr,
      el("section", { cls: "d-sub" }, el("h3", {}, "Related help"), related),
      el("section", { cls: "d-sub" }, el("h3", {}, "Comments"), comments, el("div", { cls: "d-actions" }, commentInput, post), postErr),
      el("section", { cls: "d-sub" }, el("h3", {}, "Labels"), labels, el("div", { cls: "d-actions" }, labelInput, addLabelBtn), labelErr),
    );
    return {
      root,
      head,
      retry,
      assign: assignBtn,
      assignErr,
      title,
      rename,
      renameErr,
      close,
      closeErr,
      related,
      comments,
      commentInput,
      post,
      postErr,
      labels,
      labelInput,
      addLabel: addLabelBtn,
      labelErr,
    };
  }

  function renderDetail(s: Sel): void {
    const d = s.dom;
    const h = s.head;
    if (h.kind === "loading") fill(d.head, el("p", { cls: "d-status" }, `loading #${s.id}`));
    else if (h.kind === "ok") fill(d.head, el("h2", {}, `#${s.id} ${h.detail.title}`), el("p", {}, h.detail.body));
    else if (h.kind === "notfound") fill(d.head, el("p", { cls: "d-error" }, `detail error: issue #${s.id} not found`));
    else fill(d.head, el("p", { cls: "d-error" }, `detail error: ${h.message}`));
    d.assign.textContent = `assign to ${userName()}`;
    fill(d.assignErr, s.assignErr);
    fill(d.renameErr, s.renameErr);
    fill(d.closeErr, s.closeErr);
    fill(d.postErr, s.postErr);
    fill(d.labelErr, s.labelErr);
    fill(d.related, ...relatedKids(s));
    fill(d.comments, ...commentKids(s));
    fill(d.labels, ...labelKids(s));
  }

  function relatedKids(s: Sel): Child[] {
    if (s.head.kind !== "ok") return [];
    const r = s.related;
    if (r.status === "loading") return [el("p", { cls: "d-status" }, "finding related help")];
    if (r.status === "error") return [el("p", { cls: "d-error" }, `related help failed: ${r.message}`)];
    if (r.hits.length === 0) return [el("p", { cls: "d-status" }, "no related help")];
    return r.hits.map(hit =>
      el("button", { testid: "related-hit", cls: "d-chip", onClick: () => app.openHelp({ query: r.query, hitId: hit.id }) }, hit.name),
    );
  }

  function commentKids(s: Sel): Child[] {
    const c = s.comments;
    const kids: Child[] = [];
    if (c.status === "loading") kids.push(el("p", { cls: "d-status" }, "loading comments"));
    if (c.status === "error") kids.push(el("p", { cls: "d-error" }, `comments error: ${c.message}`));
    kids.push(
      el(
        "ul",
        { cls: "d-plain-list" },
        ...c.items.map(it => el("li", { testid: "comment" }, `${it.author}: ${it.text}${it.pending ? " (sending…)" : ""}`)),
      ),
    );
    return kids;
  }

  function labelKids(s: Sel): Child[] {
    const l = s.labels;
    const kids: Child[] = [];
    if (l.status === "loading") kids.push(el("p", { cls: "d-status" }, "loading labels"));
    if (l.status === "error") kids.push(el("p", { cls: "d-error" }, `labels error: ${l.message}`));
    kids.push(
      el(
        "ul",
        { cls: "d-chips" },
        ...l.items.map(label =>
          el(
            "li",
            { cls: "d-chip-item" },
            el("span", { testid: "label", cls: "d-label" }, label),
            el("button", { testid: "remove-label", cls: "d-small", onClick: () => removeLabelFromDetail(s, label) }, `remove ${label}`),
          ),
        ),
      ),
    );
    return kids;
  }

  function loadHead(s: Sel): void {
    const my = ++s.headSeq;
    s.head = { kind: "loading" };
    renderDetail(s);
    call(() => fetchIssue(s.id)).then(
      d => {
        if (!alive || my !== s.headSeq) return;
        if (d === null) {
          s.head = { kind: "notfound" };
        } else {
          s.head = { kind: "ok", detail: d };
          loadRelated(s, d.title);
        }
        renderDetail(s);
      },
      e => {
        if (!alive || my !== s.headSeq) return;
        s.head = { kind: "error", message: errMsg(e) };
        renderDetail(s);
      },
    );
  }

  function loadRelated(s: Sel, query: string): void {
    const my = ++s.relSeq;
    s.related = { status: "loading", query, hits: [], message: "" };
    renderDetail(s);
    call(() => search(query)).then(
      hits => {
        if (!alive || my !== s.relSeq) return;
        s.related = { status: "ok", query, hits: hits.slice(0, 3), message: "" };
        renderDetail(s);
      },
      e => {
        if (!alive || my !== s.relSeq) return;
        s.related = { status: "error", query, hits: [], message: errMsg(e) };
        renderDetail(s);
      },
    );
  }

  function loadComments(s: Sel): void {
    s.comments = { status: "loading", items: s.comments.items, message: "" };
    renderDetail(s);
    call(() => fetchComments(s.id)).then(
      list => {
        if (!alive) return;
        // comments posted while the list loaded stay until the server has them
        const locals = s.comments.items.filter(c => c.local && !list.some(x => x.author === c.author && x.text === c.text));
        const fetched: Shown[] = list.map(x => ({ author: x.author, text: x.text, local: false, pending: false }));
        s.comments = { status: "ok", items: [...fetched, ...locals], message: "" };
        renderDetail(s);
      },
      e => {
        if (!alive) return;
        s.comments = { status: "error", items: s.comments.items, message: errMsg(e) };
        renderDetail(s);
      },
    );
  }

  function loadLabels(s: Sel): void {
    s.labels = { status: "loading", items: s.labels.items, message: "" };
    renderDetail(s);
    call(() => fetchLabels(s.id)).then(
      list => {
        if (!alive) return;
        s.labels = { status: "ok", items: list.slice(), message: "" };
        renderDetail(s);
      },
      e => {
        if (!alive) return;
        s.labels = { status: "error", items: s.labels.items, message: errMsg(e) };
        renderDetail(s);
      },
    );
  }

  // ---- assign ----

  /** Shows `name` as the assignee at once; `fail` gets the server's message if it declines. */
  function assignFlow(id: number, name: string, fail: (message: string) => void): void {
    const row = issues.find(i => i.id === id);
    const prev = row !== undefined ? row.assignee : undefined;
    if (row !== undefined) row.assignee = name;
    renderList();
    call(() => assign(id, name)).then(
      res => {
        if (!alive) return;
        const cur = issues.find(i => i.id === id);
        if (cur !== undefined) cur.assignee = res.assignee;
        renderList();
      },
      e => {
        if (!alive) return;
        const cur = issues.find(i => i.id === id);
        if (cur !== undefined && prev !== undefined) cur.assignee = prev;
        renderList();
        fail(errMsg(e));
      },
    );
  }

  function assignFromDetail(s: Sel): void {
    const name = userName();
    if (name === "") return;
    s.assignErr = null;
    renderDetail(s);
    assignFlow(s.id, name, m => {
      s.assignErr = m;
      renderDetail(s);
    });
  }

  function rowAssign(id: number): void {
    const name = userName();
    if (name === "") return;
    rowError = null;
    renderRowError();
    assignFlow(id, name, m => {
      rowError = `row error: ${m}`;
      renderRowError();
    });
  }

  // ---- rename ----

  function renameFromDetail(s: Sel): void {
    const title = s.dom.title.value.trim();
    if (title === "") return;
    s.renameErr = null;
    renderDetail(s);
    renameFlow(s, title);
  }

  function renameFlow(s: Sel, title: string): void {
    const id = s.id;
    const row = issues.find(i => i.id === id);
    const prevRow = row !== undefined ? row.title : undefined;
    const prevHead = s.head.kind === "ok" ? s.head.detail.title : undefined;
    if (row !== undefined) row.title = title;
    if (s.head.kind === "ok") s.head.detail.title = title;
    renderList();
    renderDetail(s);
    call(() => renameIssue(id, title)).then(
      () => {},
      e => {
        if (!alive) return;
        const cur = issues.find(i => i.id === id);
        if (cur !== undefined && prevRow !== undefined) cur.title = prevRow;
        if (s.head.kind === "ok" && prevHead !== undefined) s.head.detail.title = prevHead;
        s.renameErr = `rename error: ${errMsg(e)}`;
        renderList();
        renderDetail(s);
      },
    );
  }

  // ---- close ----

  /** Takes the issue off the open list at once; puts it back if the server declines. */
  function closeFlow(id: number, fail: (message: string) => void): void {
    const index = filter === "open" ? issues.findIndex(i => i.id === id) : -1;
    const removed = index >= 0 ? { issue: issues.splice(index, 1)[0], index } : null;
    closing.add(id);
    renderList();
    updateCount();
    call(() => closeIssue(id)).then(
      () => {
        closing.delete(id);
      },
      e => {
        closing.delete(id);
        if (!alive) return;
        if (removed !== null && filter === "open" && !issues.some(i => i.id === id)) {
          issues.splice(Math.min(removed.index, issues.length), 0, removed.issue);
        }
        renderList();
        updateCount();
        fail(errMsg(e));
      },
    );
  }

  function closeFromDetail(s: Sel): void {
    s.closeErr = null;
    renderDetail(s);
    closeFlow(s.id, m => {
      s.closeErr = `close error: ${m}`;
      renderDetail(s);
    });
  }

  function rowClose(id: number): void {
    rowError = null;
    renderRowError();
    closeFlow(id, m => {
      rowError = `row error: ${m}`;
      renderRowError();
    });
  }

  // ---- comments ----

  function postFromDetail(s: Sel): void {
    const text = s.dom.commentInput.value.trim();
    const author = userName();
    if (text === "" || author === "") return;
    s.dom.commentInput.value = "";
    s.postErr = null;
    const item: Shown = { author, text, local: true, pending: true };
    s.comments.items.push(item);
    renderDetail(s);
    call(() => addComment(s.id, author, text)).then(
      () => {
        if (!alive) return;
        item.pending = false;
        renderDetail(s);
      },
      e => {
        if (!alive) return;
        const i = s.comments.items.indexOf(item);
        if (i >= 0) s.comments.items.splice(i, 1);
        s.postErr = `post error: ${errMsg(e)}`;
        renderDetail(s);
      },
    );
  }

  // ---- labels ----

  function addLabelFromDetail(s: Sel): void {
    const label = s.dom.labelInput.value.trim();
    if (label === "" || s.labels.items.includes(label)) return;
    s.dom.labelInput.value = "";
    s.labelErr = null;
    s.labels.items.push(label);
    renderDetail(s);
    call(() => addLabel(s.id, label)).then(
      () => {
        if (!alive) return;
        if (!s.labels.items.includes(label)) s.labels.items.push(label);
        renderDetail(s);
      },
      e => {
        if (!alive) return;
        const i = s.labels.items.indexOf(label);
        if (i >= 0) s.labels.items.splice(i, 1);
        s.labelErr = `label error: ${errMsg(e)}`;
        renderDetail(s);
      },
    );
  }

  function removeLabelFromDetail(s: Sel, label: string): void {
    const idx = s.labels.items.indexOf(label);
    if (idx < 0) return;
    s.labelErr = null;
    s.labels.items.splice(idx, 1);
    renderDetail(s);
    call(() => removeLabel(s.id, label)).then(
      () => {},
      e => {
        if (!alive) return;
        if (!s.labels.items.includes(label)) {
          s.labels.items.splice(Math.min(idx, s.labels.items.length), 0, label);
        }
        s.labelErr = `label error: ${errMsg(e)}`;
        renderDetail(s);
      },
    );
  }

  renderFilters();
  renderRowError();
  loadList();

  return () => {
    alive = false;
  };
}
