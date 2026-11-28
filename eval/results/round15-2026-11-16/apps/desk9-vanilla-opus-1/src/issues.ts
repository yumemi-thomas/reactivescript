import * as api from "./api.js";
import type { Comment, Hit, Issue, IssueDetail } from "./api.js";
import { button, errMsg, h, input, setText } from "./dom.js";
import type { Page } from "./dom.js";

export interface IssuesHost {
  /** The number of rows in the list of open issues, as the page shows it. */
  setCount(n: number): void;
  /** Open the help page on a related hit. */
  openRelated(query: string, hits: Hit[], hit: Hit): void;
}

type Filter = "open" | "closed";

type RowOp =
  | { n: number; kind: "assign"; id: number; user: string }
  | { n: number; kind: "rename"; id: number; title: string }
  | { n: number; kind: "close"; id: number };

interface PostedComment {
  n: number;
  author: string;
  text: string;
  sending: boolean;
}

interface LabelOp {
  n: number;
  kind: "add" | "remove";
  label: string;
}

interface Selection {
  id: number;
  detailTok: number;
  detail:
    | { status: "loading" }
    | { status: "ok"; data: IssueDetail }
    | { status: "missing" }
    | { status: "error"; error: string };
  assignError: string;
  renameError: string;
  closeError: string;
  postError: string;
  labelError: string;
  comments: { status: "loading" | "ok" | "error"; list: Comment[]; error: string };
  posted: PostedComment[];
  labels: { status: "loading" | "ok" | "error"; base: string[]; error: string; fromChange: boolean };
  labelOps: LabelOp[];
  relatedTok: number;
  related:
    | null
    | { status: "loading"; title: string }
    | { status: "ok"; title: string; hits: Hit[] }
    | { status: "error"; title: string; error: string };
  els: DetailEls;
}

interface DetailEls {
  root: HTMLElement;
  header: HTMLElement;
  assign: HTMLButtonElement;
  assignError: HTMLElement;
  titleInput: HTMLInputElement;
  renameError: HTMLElement;
  closeError: HTMLElement;
  related: HTMLElement;
  comments: HTMLElement;
  commentInput: HTMLInputElement;
  postError: HTMLElement;
  labels: HTMLElement;
  labelInput: HTMLInputElement;
  labelError: HTMLElement;
}

export function issuesPage(host: IssuesHost): Page {
  let alive = true;
  let seq = 0;
  const next = () => ++seq;

  let user = "guest";
  let filter: Filter = "open";
  const bases: Record<Filter, Issue[] | null> = { open: null, closed: null };
  let listStatus: "loading" | "ok" | "error" = "loading";
  let listError = "";
  let listTok = 0;
  let ops: RowOp[] = [];
  let rowError = "";
  let sel: Selection | null = null;

  // ---- static layout ----
  const userInput = input("user", user, "Current user");
  userInput.addEventListener("input", () => {
    user = userInput.value;
    render();
  });
  const filterOpen = button("filter-open", "open", () => setFilter("open"));
  const filterClosed = button("filter-closed", "closed", () => setFilter("closed"));
  const rowErrorEl = h("div", { testid: "row-error", cls: "error", attrs: { role: "alert" } });
  const listEl = h("div", { testid: "list", cls: "list", attrs: { "aria-live": "polite" } });
  const detailEl = h("div", { testid: "detail", cls: "detail" });

  const el = h(
    "section",
    { cls: "page issues" },
    h("div", { cls: "toolbar" },
      h("label", { cls: "field" }, "User ", userInput),
      h("div", { cls: "filters", attrs: { role: "group", "aria-label": "Filter" } }, filterOpen, filterClosed),
    ),
    rowErrorEl,
    h("div", { cls: "columns" }, listEl, detailEl),
  );

  // ---- helpers ----
  function lastOp<K extends RowOp["kind"]>(id: number, kind: K): Extract<RowOp, { kind: K }> | undefined {
    for (let i = ops.length - 1; i >= 0; i--) {
      const o = ops[i];
      if (o.id === id && o.kind === kind) return o as Extract<RowOp, { kind: K }>;
    }
    return undefined;
  }
  const removeOp = (n: number) => {
    ops = ops.filter(o => o.n !== n);
  };

  function project(base: Issue[], f: Filter): Issue[] {
    const out: Issue[] = [];
    for (const r of base) {
      if (f === "open" && lastOp(r.id, "close")) continue;
      const rn = lastOp(r.id, "rename");
      const as = lastOp(r.id, "assign");
      out.push({ id: r.id, title: rn ? rn.title : r.title, assignee: as ? as.user : r.assignee });
    }
    return out;
  }

  function updateBases(id: number, patch: Partial<Issue>): void {
    for (const f of ["open", "closed"] as const) {
      const b = bases[f];
      if (b) bases[f] = b.map(r => (r.id === id ? { ...r, ...patch } : r));
    }
  }

  function shownTitle(s: Selection): string | null {
    const rn = lastOp(s.id, "rename");
    if (rn) return rn.title;
    return s.detail.status === "ok" ? s.detail.data.title : null;
  }

  function shownLabels(s: Selection): string[] {
    let l = [...s.labels.base];
    for (const op of s.labelOps) {
      if (op.kind === "add") {
        if (!l.includes(op.label)) l.push(op.label);
      } else l = l.filter(x => x !== op.label);
    }
    return l;
  }

  // ---- list ----
  function loadList(): void {
    const tok = ++listTok;
    const f = filter;
    listStatus = "loading";
    listError = "";
    render();
    api.fetchIssues(f).then(
      rows => {
        if (!alive || tok !== listTok) return;
        bases[f] = Array.isArray(rows) ? rows : [];
        listStatus = "ok";
        render();
      },
      e => {
        if (!alive || tok !== listTok) return;
        listStatus = "error";
        listError = errMsg(e);
        render();
      },
    );
  }

  function setFilter(f: Filter): void {
    if (f === filter) return;
    filter = f;
    loadList();
  }

  // ---- shared actions ----
  function doAssign(id: number, onDecline: (msg: string) => void): void {
    const who = user;
    const op: RowOp = { n: next(), kind: "assign", id, user: who };
    ops.push(op);
    render();
    api.assign(id, who).then(
      res => {
        if (!alive) return;
        removeOp(op.n);
        updateBases(id, { assignee: res && typeof res.assignee === "string" ? res.assignee : who });
        render();
      },
      e => {
        if (!alive) return;
        removeOp(op.n);
        onDecline(errMsg(e));
        render();
      },
    );
  }

  function doClose(id: number, onDecline: (msg: string) => void): void {
    const op: RowOp = { n: next(), kind: "close", id };
    ops.push(op);
    render();
    api.closeIssue(id).then(
      () => {
        if (!alive) return;
        removeOp(op.n);
        if (bases.open) bases.open = bases.open.filter(r => r.id !== id);
        render();
      },
      e => {
        if (!alive) return;
        removeOp(op.n);
        onDecline(errMsg(e));
        render();
      },
    );
  }

  // ---- row actions ----
  function rowAssign(id: number): void {
    rowError = "";
    doAssign(id, msg => {
      rowError = `row error: ${msg}`;
    });
  }
  function rowClose(id: number): void {
    rowError = "";
    doClose(id, msg => {
      rowError = `row error: ${msg}`;
    });
  }

  // ---- selection / detail ----
  function select(id: number): void {
    if (sel && sel.id === id) return;
    const els = buildDetail();
    const s: Selection = {
      id,
      detailTok: 0,
      detail: { status: "loading" },
      assignError: "",
      renameError: "",
      closeError: "",
      postError: "",
      labelError: "",
      comments: { status: "loading", list: [], error: "" },
      posted: [],
      labels: { status: "loading", base: [], error: "", fromChange: false },
      labelOps: [],
      relatedTok: 0,
      related: null,
      els,
    };
    sel = s;
    detailEl.replaceChildren(els.root);
    loadDetail(s);
    api.fetchComments(id).then(
      list => {
        if (!alive || sel !== s) return;
        s.comments = { status: "ok", list: Array.isArray(list) ? list : [], error: "" };
        render();
      },
      e => {
        if (!alive || sel !== s) return;
        s.comments = { status: "error", list: [], error: errMsg(e) };
        render();
      },
    );
    api.fetchLabels(id).then(
      labels => {
        if (!alive || sel !== s || s.labels.fromChange) return;
        s.labels = { status: "ok", base: Array.isArray(labels) ? labels : [], error: "", fromChange: false };
        render();
      },
      e => {
        if (!alive || sel !== s || s.labels.fromChange) return;
        s.labels = { status: "error", base: [], error: errMsg(e), fromChange: false };
        render();
      },
    );
    render();
  }

  function loadDetail(s: Selection): void {
    const tok = ++s.detailTok;
    s.detail = { status: "loading" };
    s.related = null;
    s.relatedTok++;
    render();
    api.fetchIssue(s.id).then(
      d => {
        if (!alive || sel !== s || tok !== s.detailTok) return;
        if (d === null || d === undefined) {
          s.detail = { status: "missing" };
        } else {
          s.detail = { status: "ok", data: d };
          loadRelated(s, d.title);
        }
        render();
      },
      e => {
        if (!alive || sel !== s || tok !== s.detailTok) return;
        s.detail = { status: "error", error: errMsg(e) };
        render();
      },
    );
  }

  function loadRelated(s: Selection, title: string): void {
    const tok = ++s.relatedTok;
    s.related = { status: "loading", title };
    api.search(title).then(
      hits => {
        if (!alive || sel !== s || tok !== s.relatedTok) return;
        s.related = { status: "ok", title, hits: Array.isArray(hits) ? hits : [] };
        render();
      },
      e => {
        if (!alive || sel !== s || tok !== s.relatedTok) return;
        s.related = { status: "error", title, error: errMsg(e) };
        render();
      },
    );
  }

  function buildDetail(): DetailEls {
    const header = h("div", { cls: "detail-header" });
    const assignBtn = button("assign", "", () => detailAssign());
    const assignError = h("div", { testid: "assign-error", cls: "error", attrs: { role: "alert" } });
    const titleInput = input("title-input", "", "New title");
    titleInput.placeholder = "New title";
    titleInput.addEventListener("keydown", ev => {
      if (ev.key === "Enter") detailRename();
    });
    const renameError = h("div", { testid: "rename-error", cls: "error", attrs: { role: "alert" } });
    const closeError = h("div", { testid: "close-error", cls: "error", attrs: { role: "alert" } });
    const related = h("div", { testid: "related", cls: "related" });
    const comments = h("div", { testid: "comments", cls: "comments" });
    const commentInput = input("comment-input", "", "Comment");
    commentInput.placeholder = "Write a comment";
    commentInput.addEventListener("keydown", ev => {
      if (ev.key === "Enter") detailPost();
    });
    const postError = h("div", { testid: "post-error", cls: "error", attrs: { role: "alert" } });
    const labels = h("div", { testid: "labels", cls: "labels" });
    const labelInput = input("label-input", "", "Label");
    labelInput.placeholder = "Add a label";
    labelInput.addEventListener("keydown", ev => {
      if (ev.key === "Enter") detailAddLabel();
    });
    const labelError = h("div", { testid: "label-error", cls: "error", attrs: { role: "alert" } });
    const root = h(
      "div",
      { cls: "detail-inner" },
      header,
      h("div", { cls: "actions" },
        button("retry", "retry", () => {
          if (sel) loadDetail(sel);
        }),
        assignBtn,
        button("close", "close", () => detailClose()),
      ),
      assignError,
      closeError,
      h("div", { cls: "inline-form" }, titleInput, button("rename", "rename", () => detailRename())),
      renameError,
      related,
      h("h3", { text: "Labels" }),
      labels,
      h("div", { cls: "inline-form" }, labelInput, button("add-label", "add label", () => detailAddLabel())),
      labelError,
      h("h3", { text: "Comments" }),
      comments,
      h("div", { cls: "inline-form" }, commentInput, button("post", "post", () => detailPost())),
      postError,
    );
    return {
      root, header, assign: assignBtn, assignError, titleInput, renameError, closeError, related,
      comments, commentInput, postError, labels, labelInput, labelError,
    };
  }

  function detailAssign(): void {
    const s = sel;
    if (!s) return;
    s.assignError = "";
    doAssign(s.id, msg => {
      if (sel === s) s.assignError = msg;
    });
  }

  function detailClose(): void {
    const s = sel;
    if (!s) return;
    s.closeError = "";
    doClose(s.id, msg => {
      if (sel === s) s.closeError = `close error: ${msg}`;
    });
  }

  function detailRename(): void {
    const s = sel;
    if (!s) return;
    const title = s.els.titleInput.value.trim();
    if (!title) return;
    s.renameError = "";
    const id = s.id;
    const op: RowOp = { n: next(), kind: "rename", id, title };
    ops.push(op);
    render();
    api.renameIssue(id, title).then(
      res => {
        if (!alive) return;
        removeOp(op.n);
        const t = res && typeof res.title === "string" ? res.title : title;
        updateBases(id, { title: t });
        if (sel && sel.id === id && sel.detail.status === "ok") {
          sel.detail = { status: "ok", data: { ...sel.detail.data, title: t } };
        }
        render();
      },
      e => {
        if (!alive) return;
        removeOp(op.n);
        if (sel === s) s.renameError = `rename error: ${errMsg(e)}`;
        render();
      },
    );
  }

  function detailPost(): void {
    const s = sel;
    if (!s) return;
    const text = s.els.commentInput.value.trim();
    if (!text) return;
    const author = user;
    s.postError = "";
    s.els.commentInput.value = "";
    const entry: PostedComment = { n: next(), author, text, sending: true };
    s.posted.push(entry);
    render();
    api.addComment(s.id, author, text).then(
      c => {
        if (!alive || sel !== s) return;
        entry.sending = false;
        if (c && typeof c.author === "string" && typeof c.text === "string") {
          entry.author = c.author;
          entry.text = c.text;
        }
        render();
      },
      e => {
        if (!alive || sel !== s) return;
        s.posted = s.posted.filter(p => p !== entry);
        s.postError = `post error: ${errMsg(e)}`;
        render();
      },
    );
  }

  function labelChange(s: Selection, kind: "add" | "remove", label: string): void {
    s.labelError = "";
    const op: LabelOp = { n: next(), kind, label };
    s.labelOps.push(op);
    render();
    const call = kind === "add" ? api.addLabel(s.id, label) : api.removeLabel(s.id, label);
    call.then(
      labels => {
        if (!alive || sel !== s) return;
        s.labelOps = s.labelOps.filter(o => o !== op);
        if (Array.isArray(labels)) s.labels = { status: "ok", base: labels, error: "", fromChange: true };
        render();
      },
      e => {
        if (!alive || sel !== s) return;
        s.labelOps = s.labelOps.filter(o => o !== op);
        s.labelError = `label error: ${errMsg(e)}`;
        render();
      },
    );
  }

  function detailAddLabel(): void {
    const s = sel;
    if (!s) return;
    const label = s.els.labelInput.value.trim();
    if (!label) return;
    if (shownLabels(s).includes(label)) return;
    s.els.labelInput.value = "";
    labelChange(s, "add", label);
  }

  // ---- render ----
  function render(): void {
    if (!alive) return;
    filterOpen.setAttribute("aria-pressed", String(filter === "open"));
    filterClosed.setAttribute("aria-pressed", String(filter === "closed"));
    setText(rowErrorEl, rowError);
    rowErrorEl.hidden = !rowError;

    // list
    if (listStatus === "loading") {
      listEl.replaceChildren(h("p", { cls: "muted", text: `loading ${filter} issues` }));
    } else if (listStatus === "error") {
      listEl.replaceChildren(h("p", { cls: "error", text: `list error: ${listError}` }));
    } else {
      const rows = project(bases[filter] ?? [], filter);
      const ul = h("ul", { cls: "rows" });
      for (const r of rows) {
        const id = r.id;
        const li = h(
          "li",
          { cls: sel && sel.id === id ? "row selected" : "row" },
          h("button", {
            testid: "issue",
            cls: "issue",
            attrs: { type: "button", "aria-current": String(!!sel && sel.id === id) },
            text: `#${r.id} ${r.title} (${r.assignee ?? "unassigned"})`,
            onClick: () => select(id),
          }),
          button("row-assign", `assign to ${user}`, () => rowAssign(id), "small"),
          filter === "open" ? button("row-close", "close", () => rowClose(id), "small") : null,
        );
        ul.append(li);
      }
      listEl.replaceChildren(rows.length ? ul : h("p", { cls: "muted", text: `no ${filter} issues` }));
    }

    if (bases.open) host.setCount(project(bases.open, "open").length);

    // detail
    const s = sel;
    if (!s) {
      if (detailEl.textContent !== "select an issue" || detailEl.children.length) {
        detailEl.replaceChildren(h("p", { cls: "muted", text: "select an issue" }));
      }
      return;
    }
    const e = s.els;
    const d = s.detail;
    if (d.status === "loading") e.header.replaceChildren(h("p", { cls: "muted", text: `loading #${s.id}` }));
    else if (d.status === "missing")
      e.header.replaceChildren(h("p", { cls: "error", text: `detail error: issue #${s.id} not found` }));
    else if (d.status === "error") e.header.replaceChildren(h("p", { cls: "error", text: `detail error: ${d.error}` }));
    else {
      e.header.replaceChildren(
        h("h2", { text: `#${s.id} ${shownTitle(s) ?? d.data.title}` }),
        h("p", { cls: "body", text: d.data.body }),
      );
    }
    setText(e.assign, `assign to ${user}`);
    for (const [node, msg] of [
      [e.assignError, s.assignError],
      [e.renameError, s.renameError],
      [e.closeError, s.closeError],
      [e.postError, s.postError],
      [e.labelError, s.labelError],
    ] as const) {
      setText(node, msg);
      node.hidden = !msg;
    }

    // related
    const rel = s.related;
    e.related.hidden = d.status !== "ok";
    if (d.status !== "ok" || !rel) e.related.replaceChildren();
    else if (rel.status === "loading") e.related.replaceChildren(h("p", { cls: "muted", text: "finding related help" }));
    else if (rel.status === "error")
      e.related.replaceChildren(h("p", { cls: "error", text: `related help failed: ${rel.error}` }));
    else if (!rel.hits.length) e.related.replaceChildren(h("p", { cls: "muted", text: "no related help" }));
    else {
      const all = rel.hits;
      const title = rel.title;
      e.related.replaceChildren(
        h("span", { cls: "muted", text: "Related help: " }),
        ...all.slice(0, 3).map(hit =>
          button("related-hit", hit.name, () => host.openRelated(title, all, hit), "link"),
        ),
      );
    }

    // comments
    const commentRows: Node[] = [];
    if (s.comments.status === "loading") commentRows.push(h("p", { cls: "muted", text: "loading comments" }));
    else if (s.comments.status === "error")
      commentRows.push(h("p", { cls: "error", text: `comments error: ${s.comments.error}` }));
    const list = h("ul", { cls: "comment-list" });
    if (s.comments.status === "ok")
      for (const c of s.comments.list) list.append(h("li", { testid: "comment", text: `${c.author}: ${c.text}` }));
    for (const p of s.posted)
      list.append(
        h("li", {
          testid: "comment",
          cls: p.sending ? "sending" : undefined,
          text: `${p.author}: ${p.text}${p.sending ? " (sending…)" : ""}`,
        }),
      );
    if (list.children.length) commentRows.push(list);
    e.comments.replaceChildren(...commentRows);

    // labels
    const labelNodes: Node[] = [];
    if (s.labels.status === "loading") labelNodes.push(h("p", { cls: "muted", text: "loading labels" }));
    else if (s.labels.status === "error")
      labelNodes.push(h("p", { cls: "error", text: `labels error: ${s.labels.error}` }));
    const shown = s.labels.status === "loading" && !s.labelOps.length ? [] : shownLabels(s);
    if (shown.length) {
      const ul = h("ul", { cls: "label-list" });
      for (const label of shown) {
        ul.append(
          h("li", { cls: "chip" },
            h("span", { testid: "label", text: label }),
            button("remove-label", `remove ${label}`, () => {
              if (sel === s) labelChange(s, "remove", label);
            }, "small"),
          ),
        );
      }
      labelNodes.push(ul);
    }
    e.labels.replaceChildren(...labelNodes);
  }

  loadList();
  render();

  return {
    el,
    dispose() {
      alive = false;
    },
  };
}
