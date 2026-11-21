import * as api from "./api.js";
import type { Comment, Hit, Issue, IssueDetail } from "./api.js";
import { errMsg, fill, h, onEnter, textInput } from "./dom.js";

export interface IssuesContext {
  /** Report the number of rows in the list of open issues. */
  setOpenCount(n: number): void;
  /** Open the help page on a related hit. */
  openRelated(query: string, hits: Hit[], hit: Hit): void;
}

type Filter = "open" | "closed";

/** An optimistic change to the list that the server has not answered yet. */
type ListOp =
  | { tick: number; id: number; kind: "assign"; value: string }
  | { tick: number; id: number; kind: "rename"; value: string }
  | { tick: number; id: number; kind: "close" };

/** A change the server accepted, kept so that answers asked before it can be brought up to date. */
type Confirm =
  | { tick: number; id: number; kind: "assign"; value: string }
  | { tick: number; id: number; kind: "rename"; value: string }
  | { tick: number; id: number; kind: "close" };

type ListState =
  | { status: "loading"; token: number; filter: Filter }
  | { status: "loaded"; token: number; filter: Filter; base: Issue[] }
  | { status: "error"; token: number; filter: Filter; message: string };

type DetailState =
  | { status: "loading"; token: number }
  | { status: "loaded"; token: number; data: IssueDetail }
  | { status: "notfound"; token: number }
  | { status: "error"; token: number; message: string };

type RelatedState =
  | { status: "loading"; token: number; title: string }
  | { status: "loaded"; token: number; title: string; hits: Hit[] }
  | { status: "error"; token: number; title: string; message: string };

interface LocalComment {
  key: number;
  author: string;
  text: string;
  state: "sending" | "sent";
  confirmTick: number;
}

type CommentsState =
  | { status: "loading"; token: number }
  | { status: "loaded"; token: number; list: Comment[] }
  | { status: "error"; token: number; message: string };

type LabelsState =
  | { status: "loading" }
  | { status: "loaded" }
  | { status: "error"; message: string };

interface LabelOp {
  tick: number;
  kind: "add" | "remove";
  label: string;
}

/** Everything that belongs to one selection of one issue. */
interface Selection {
  id: number;
  detail: DetailState;
  related: RelatedState | null;
  comments: CommentsState;
  local: LocalComment[];
  labels: LabelsState;
  labelBase: string[];
  labelBaseTick: number;
  labelOps: LabelOp[];
  assignError: string | null;
  renameError: string | null;
  closeError: string | null;
  postError: string | null;
  labelError: string | null;
  // DOM
  root: HTMLElement;
  status: HTMLElement;
  assignBtn: HTMLButtonElement;
  errors: HTMLElement;
  titleInput: HTMLInputElement;
  commentsBox: HTMLElement;
  commentInput: HTMLInputElement;
  labelsBox: HTMLElement;
  labelInput: HTMLInputElement;
  relatedBox: HTMLElement;
}

export function mountIssues(root: HTMLElement, ctx: IssuesContext): () => void {
  let alive = true;
  let tick = 0;
  const next = () => ++tick;

  let user = "guest";
  let filter: Filter = "open";
  let list: ListState = { status: "loading", token: 0, filter };
  let ops: ListOp[] = [];
  const confirms: Confirm[] = [];
  let rowError: string | null = null;
  let sel: Selection | null = null;

  // ---- static DOM ----
  const userInput = textInput("user", user);
  userInput.setAttribute("aria-label", "Current user");
  userInput.addEventListener("input", () => {
    user = userInput.value;
    render();
  });

  const filterOpen = h("button", { testid: "filter-open", text: "open", onClick: () => setFilter("open") });
  const filterClosed = h("button", { testid: "filter-closed", text: "closed", onClick: () => setFilter("closed") });
  const rowErrorBox = h("div", { cls: "row-error-slot" });
  const listBox = h("div", { testid: "list", cls: "list" });
  const detailBox = h("div", { testid: "detail", cls: "detail" });

  const page = h(
    "div",
    { cls: "issues-page" },
    h("label", { cls: "user" }, "Current user ", userInput),
    h("div", { cls: "filters" }, filterOpen, filterClosed),
    rowErrorBox,
    h("div", { cls: "columns" }, listBox, detailBox),
  );
  root.append(page);

  // ---- list ----
  function setFilter(f: Filter): void {
    if (f === filter) return;
    filter = f;
    loadList();
  }

  function applyConfirm(rows: Issue[], c: Confirm, rowsFilter: Filter): Issue[] {
    switch (c.kind) {
      case "assign":
        return rows.map(r => (r.id === c.id ? { ...r, assignee: c.value } : r));
      case "rename":
        return rows.map(r => (r.id === c.id ? { ...r, title: c.value } : r));
      case "close":
        return rowsFilter === "open" ? rows.filter(r => r.id !== c.id) : rows;
    }
  }

  function loadList(): void {
    const token = next();
    const f = filter;
    list = { status: "loading", token, filter: f };
    render();
    api.fetchIssues(f).then(
      rows => {
        if (!alive || list.token !== token) return;
        let base: Issue[] = Array.isArray(rows) ? rows.map(r => ({ ...r })) : [];
        for (const c of confirms) if (c.tick > token) base = applyConfirm(base, c, f);
        list = { status: "loaded", token, filter: f, base };
        render();
      },
      e => {
        if (!alive || list.token !== token) return;
        list = { status: "error", token, filter: f, message: errMsg(e) };
        render();
      },
    );
  }

  function confirm(c: Confirm): void {
    confirms.push(c);
    if (list.status === "loaded") list = { ...list, base: applyConfirm(list.base, c, list.filter) };
    if (c.kind === "rename" && sel && sel.id === c.id && sel.detail.status === "loaded") {
      sel.detail = { ...sel.detail, data: { ...sel.detail.data, title: c.value } };
    }
  }

  function overlay(issue: Issue): Issue {
    let out = issue;
    for (const op of ops) {
      if (op.id !== issue.id) continue;
      if (op.kind === "assign") out = { ...out, assignee: op.value };
      else if (op.kind === "rename") out = { ...out, title: op.value };
    }
    return out;
  }

  function closing(id: number): boolean {
    return ops.some(op => op.kind === "close" && op.id === id);
  }

  function displayRows(): Issue[] {
    if (list.status !== "loaded") return [];
    const open = list.filter === "open";
    return list.base.filter(r => !(open && closing(r.id))).map(overlay);
  }

  function displayTitle(id: number, title: string): string {
    let t = title;
    for (const op of ops) if (op.id === id && op.kind === "rename") t = op.value;
    return t;
  }

  function removeOp(op: ListOp): void {
    ops = ops.filter(o => o !== op);
  }

  // ---- actions on the list (shared by rows and detail) ----
  function doAssign(id: number, fromRow: boolean): void {
    const who = user.trim();
    if (!who) return;
    const s = sel;
    if (fromRow) rowError = null;
    else if (s) s.assignError = null;
    const op: ListOp = { tick: next(), id, kind: "assign", value: who };
    ops.push(op);
    render();
    api.assign(id, who).then(
      res => {
        if (!alive) return;
        removeOp(op);
        const value = res && typeof res.assignee === "string" ? res.assignee : who;
        confirm({ tick: next(), id, kind: "assign", value });
        render();
      },
      e => {
        if (!alive) return;
        removeOp(op);
        if (fromRow) rowError = `row error: ${errMsg(e)}`;
        else if (s && sel === s) s.assignError = errMsg(e);
        render();
      },
    );
  }

  function doClose(id: number, fromRow: boolean): void {
    if (closing(id)) return;
    const s = sel;
    if (fromRow) rowError = null;
    else if (s) s.closeError = null;
    const op: ListOp = { tick: next(), id, kind: "close" };
    ops.push(op);
    render();
    api.closeIssue(id).then(
      () => {
        if (!alive) return;
        removeOp(op);
        confirm({ tick: next(), id, kind: "close" });
        render();
      },
      e => {
        if (!alive) return;
        removeOp(op);
        if (fromRow) rowError = `row error: ${errMsg(e)}`;
        else if (s && sel === s) s.closeError = `close error: ${errMsg(e)}`;
        render();
      },
    );
  }

  function doRename(s: Selection): void {
    const title = s.titleInput.value.trim();
    if (!title) return;
    const id = s.id;
    s.renameError = null;
    const op: ListOp = { tick: next(), id, kind: "rename", value: title };
    ops.push(op);
    render();
    api.renameIssue(id, title).then(
      res => {
        if (!alive) return;
        removeOp(op);
        const value = res && typeof res.title === "string" ? res.title : title;
        confirm({ tick: next(), id, kind: "rename", value });
        render();
      },
      e => {
        if (!alive) return;
        removeOp(op);
        if (sel === s) s.renameError = `rename error: ${errMsg(e)}`;
        render();
      },
    );
  }

  // ---- selection ----
  function select(id: number): void {
    if (sel && sel.id === id) return;
    const status = h("div", { cls: "detail-status" });
    const assignBtn = h("button", { testid: "assign" });
    const errors = h("div", { cls: "errors" });
    const titleInput = textInput("title-input");
    titleInput.placeholder = "New title";
    const commentsBox = h("div", { testid: "comments", cls: "comments" });
    const commentInput = textInput("comment-input");
    commentInput.placeholder = "Add a comment";
    const labelsBox = h("div", { testid: "labels", cls: "labels" });
    const labelInput = textInput("label-input");
    labelInput.placeholder = "Add a label";
    const relatedBox = h("div", { cls: "related-slot" });

    const s: Selection = {
      id,
      detail: { status: "loading", token: 0 },
      related: null,
      comments: { status: "loading", token: 0 },
      local: [],
      labels: { status: "loading" },
      labelBase: [],
      labelBaseTick: 0,
      labelOps: [],
      assignError: null,
      renameError: null,
      closeError: null,
      postError: null,
      labelError: null,
      root: h("div"),
      status,
      assignBtn,
      errors,
      titleInput,
      commentsBox,
      commentInput,
      labelsBox,
      labelInput,
      relatedBox,
    };

    const retryBtn = h("button", { testid: "retry", text: "retry", onClick: () => loadDetail(s) });
    assignBtn.addEventListener("click", () => doAssign(s.id, false));
    const renameBtn = h("button", { testid: "rename", text: "rename", onClick: () => doRename(s) });
    onEnter(titleInput, () => doRename(s));
    const closeBtn = h("button", { testid: "close", text: "close", onClick: () => doClose(s.id, false) });
    const postBtn = h("button", { testid: "post", text: "post", onClick: () => doPost(s) });
    onEnter(commentInput, () => doPost(s));
    const addLabelBtn = h("button", { testid: "add-label", text: "add label", onClick: () => doAddLabel(s) });
    onEnter(labelInput, () => doAddLabel(s));

    s.root = h(
      "div",
      { cls: "detail-inner" },
      status,
      h("div", { cls: "actions" }, retryBtn, assignBtn, closeBtn),
      h("div", { cls: "rename" }, titleInput, renameBtn),
      errors,
      relatedBox,
      h("h4", { text: "Labels" }),
      labelsBox,
      h("div", { cls: "add-label" }, labelInput, addLabelBtn),
      h("h4", { text: "Comments" }),
      commentsBox,
      h("div", { cls: "post" }, commentInput, postBtn),
    );

    sel = s;
    loadDetail(s);
    loadComments(s);
    loadLabels(s);
    render();
  }

  function loadDetail(s: Selection): void {
    const token = next();
    s.detail = { status: "loading", token };
    s.related = null;
    render();
    api.fetchIssue(s.id).then(
      d => {
        if (!alive || sel !== s || s.detail.token !== token) return;
        if (!d) {
          s.detail = { status: "notfound", token };
        } else {
          let data: IssueDetail = { ...d };
          for (const c of confirms) {
            if (c.tick > token && c.id === s.id && c.kind === "rename") data = { ...data, title: c.value };
          }
          s.detail = { status: "loaded", token, data };
          loadRelated(s, data.title);
        }
        render();
      },
      e => {
        if (!alive || sel !== s || s.detail.token !== token) return;
        s.detail = { status: "error", token, message: errMsg(e) };
        render();
      },
    );
  }

  function loadRelated(s: Selection, title: string): void {
    const token = next();
    s.related = { status: "loading", token, title };
    api.search(title).then(
      hits => {
        if (!alive || sel !== s || !s.related || s.related.token !== token) return;
        s.related = { status: "loaded", token, title, hits: Array.isArray(hits) ? hits.map(x => ({ ...x })) : [] };
        render();
      },
      e => {
        if (!alive || sel !== s || !s.related || s.related.token !== token) return;
        s.related = { status: "error", token, title, message: errMsg(e) };
        render();
      },
    );
  }

  function loadComments(s: Selection): void {
    const token = next();
    s.comments = { status: "loading", token };
    api.fetchComments(s.id).then(
      list => {
        if (!alive || sel !== s || s.comments.token !== token) return;
        s.comments = { status: "loaded", token, list: Array.isArray(list) ? list.map(c => ({ ...c })) : [] };
        // Comments accepted before this answer was asked are in it already.
        s.local = s.local.filter(c => c.state === "sending" || c.confirmTick > token);
        render();
      },
      e => {
        if (!alive || sel !== s || s.comments.token !== token) return;
        s.comments = { status: "error", token, message: errMsg(e) };
        render();
      },
    );
  }

  function doPost(s: Selection): void {
    const text = s.commentInput.value.trim();
    const author = user.trim();
    if (!text || !author) return;
    s.commentInput.value = "";
    s.postError = null;
    const entry: LocalComment = { key: next(), author, text, state: "sending", confirmTick: 0 };
    s.local.push(entry);
    render();
    api.addComment(s.id, author, text).then(
      res => {
        if (!alive || sel !== s) return;
        entry.state = "sent";
        if (res && typeof res.author === "string") entry.author = res.author;
        if (res && typeof res.text === "string") entry.text = res.text;
        entry.confirmTick = next();
        render();
      },
      e => {
        if (!alive || sel !== s) return;
        s.local = s.local.filter(c => c !== entry);
        s.postError = `post error: ${errMsg(e)}`;
        render();
      },
    );
  }

  function loadLabels(s: Selection): void {
    const token = next();
    s.labels = { status: "loading" };
    api.fetchLabels(s.id).then(
      labels => {
        if (!alive || sel !== s) return;
        if (token > s.labelBaseTick) {
          s.labelBase = Array.isArray(labels) ? [...labels] : [];
          s.labelBaseTick = token;
        }
        s.labels = { status: "loaded" };
        render();
      },
      e => {
        if (!alive || sel !== s) return;
        if (s.labels.status === "loading") s.labels = { status: "error", message: errMsg(e) };
        render();
      },
    );
  }

  function displayLabels(s: Selection): string[] {
    let out = [...s.labelBase];
    for (const op of s.labelOps) {
      if (op.kind === "add") {
        if (!out.includes(op.label)) out.push(op.label);
      } else {
        out = out.filter(l => l !== op.label);
      }
    }
    return out;
  }

  function labelChange(s: Selection, kind: "add" | "remove", label: string): void {
    s.labelError = null;
    const op: LabelOp = { tick: next(), kind, label };
    s.labelOps.push(op);
    render();
    const call = kind === "add" ? api.addLabel(s.id, label) : api.removeLabel(s.id, label);
    call.then(
      labels => {
        if (!alive || sel !== s) return;
        s.labelOps = s.labelOps.filter(o => o !== op);
        if (op.tick > s.labelBaseTick && Array.isArray(labels)) {
          s.labelBase = [...labels];
          s.labelBaseTick = op.tick;
        }
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

  function doAddLabel(s: Selection): void {
    const label = s.labelInput.value.trim();
    if (!label) return;
    if (s.labels.status !== "loaded") return;
    if (displayLabels(s).includes(label)) return;
    s.labelInput.value = "";
    labelChange(s, "add", label);
  }

  // ---- rendering ----
  function render(): void {
    if (!alive) return;
    filterOpen.setAttribute("aria-pressed", String(filter === "open"));
    filterClosed.setAttribute("aria-pressed", String(filter === "closed"));

    fill(rowErrorBox, rowError ? h("div", { testid: "row-error", cls: "error", text: rowError }) : null);

    const label = `assign to ${user}`;
    if (list.status === "loading") {
      fill(listBox, `loading ${list.filter} issues`);
    } else if (list.status === "error") {
      fill(listBox, `list error: ${list.message}`);
    } else {
      const rows = displayRows();
      if (list.filter === "open") ctx.setOpenCount(rows.length);
      const showClose = list.filter === "open";
      if (rows.length === 0) {
        fill(listBox, h("div", { cls: "empty", text: `no ${list.filter} issues` }));
      } else {
        fill(
          listBox,
          ...rows.map(r => {
            const issue = h("div", {
              testid: "issue",
              cls: sel && sel.id === r.id ? "issue selected" : "issue",
              text: `#${r.id} ${r.title} (${r.assignee === null || r.assignee === undefined ? "unassigned" : r.assignee})`,
              onClick: () => select(r.id),
            });
            issue.tabIndex = 0;
            issue.addEventListener("keydown", ev => {
              if (ev.key === "Enter") select(r.id);
            });
            return h(
              "div",
              { cls: "row" },
              issue,
              h("button", { testid: "row-assign", text: label, onClick: () => doAssign(r.id, true) }),
              showClose ? h("button", { testid: "row-close", text: "close", onClick: () => doClose(r.id, true) }) : null,
            );
          }),
        );
      }
    }

    const s = sel;
    if (!s) {
      fill(detailBox, "select an issue");
      return;
    }
    if (detailBox.firstChild !== s.root || detailBox.childNodes.length !== 1) fill(detailBox, s.root);

    // status
    const d = s.detail;
    if (d.status === "loading") fill(s.status, `loading #${s.id}`);
    else if (d.status === "notfound") fill(s.status, `detail error: issue #${s.id} not found`);
    else if (d.status === "error") fill(s.status, `detail error: ${d.message}`);
    else
      fill(
        s.status,
        h("h3", { text: `#${d.data.id} ${displayTitle(d.data.id, d.data.title)}` }),
        h("p", { text: d.data.body }),
      );

    s.assignBtn.textContent = label;

    fill(
      s.errors,
      s.assignError ? h("div", { cls: "error", text: s.assignError }) : null,
      s.renameError ? h("div", { cls: "error", text: s.renameError }) : null,
      s.closeError ? h("div", { cls: "error", text: s.closeError }) : null,
      s.postError ? h("div", { cls: "error", text: s.postError }) : null,
      s.labelError ? h("div", { cls: "error", text: s.labelError }) : null,
    );

    // related
    if (d.status === "loaded" && s.related) {
      const rel = s.related;
      let content: (Node | string)[];
      if (rel.status === "loading") content = ["finding related help"];
      else if (rel.status === "error") content = [`related help failed: ${rel.message}`];
      else if (rel.hits.length === 0) content = ["no related help"];
      else
        content = rel.hits.slice(0, 3).map(hit =>
          h("button", {
            testid: "related-hit",
            text: hit.name,
            onClick: () => ctx.openRelated(rel.title, rel.hits, hit),
          }),
        );
      fill(s.relatedBox, h("div", { testid: "related", cls: "related" }, ...content));
    } else {
      fill(s.relatedBox);
    }

    // comments
    const c = s.comments;
    const localRows = s.local.map(e =>
      h("div", { testid: "comment", text: e.state === "sending" ? `${e.author}: ${e.text} (sending…)` : `${e.author}: ${e.text}` }),
    );
    if (c.status === "loading") fill(s.commentsBox, h("div", { text: "loading comments" }), ...localRows);
    else if (c.status === "error") fill(s.commentsBox, h("div", { text: `comments error: ${c.message}` }), ...localRows);
    else
      fill(
        s.commentsBox,
        ...c.list.map(x => h("div", { testid: "comment", text: `${x.author}: ${x.text}` })),
        ...localRows,
      );

    // labels
    const l = s.labels;
    if (l.status === "loading") fill(s.labelsBox, "loading labels");
    else if (l.status === "error") fill(s.labelsBox, `labels error: ${l.message}`);
    else
      fill(
        s.labelsBox,
        ...displayLabels(s).map(name =>
          h(
            "span",
            { cls: "label-chip" },
            h("span", { testid: "label", text: name }),
            h("button", {
              testid: "remove-label",
              text: `remove ${name}`,
              onClick: () => labelChange(s, "remove", name),
            }),
          ),
        ),
      );
  }

  loadList();

  return () => {
    alive = false;
    page.remove();
  };
}
