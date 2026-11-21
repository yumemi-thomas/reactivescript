import * as api from "./api.js";
import type { Comment, Hit, Issue, IssueDetail } from "./api.js";
import type { AppContext, Page } from "./app.js";
import { Field, Op, errorMessage, h, nextSeq, onEnter, setMessage, textInput } from "./dom.js";

type Filter = "open" | "closed";
type Source = "row" | "detail";
type ErrorKey = "assign" | "rename" | "close" | "post" | "label";

interface ListState {
  filter: Filter;
  seq: number;
  state: "loading" | "ok" | "error";
  items: Issue[];
  msg: string;
}

interface LabelOp {
  seq: number;
  kind: "add" | "remove";
  label: string;
}

interface Post {
  key: number;
  author: string;
  text: string;
  sending: boolean;
}

interface DetailParts {
  head: HTMLElement;
  retry: HTMLButtonElement;
  assign: HTMLButtonElement;
  assignErr: HTMLElement;
  close: HTMLButtonElement;
  closeErr: HTMLElement;
  titleInput: HTMLInputElement;
  renameErr: HTMLElement;
  labels: HTMLElement;
  labelInput: HTMLInputElement;
  labelErr: HTMLElement;
  comments: HTMLElement;
  commentInput: HTMLInputElement;
  postErr: HTMLElement;
  relatedSlot: HTMLElement;
}

class Selection {
  detail: { state: "loading" | "ok" | "notfound" | "error"; seq: number; data: IssueDetail | null; msg: string };
  comments: { state: "loading" | "ok" | "error"; items: Comment[]; msg: string } = { state: "loading", items: [], msg: "" };
  posts: Post[] = [];
  labels: { state: "loading" | "ok" | "error"; base: string[] | null; baseSeq: number; msg: string } = {
    state: "loading",
    base: null,
    baseSeq: 0,
    msg: "",
  };
  labelOps: LabelOp[] = [];
  related: { seq: number; state: "loading" | "ok" | "error"; query: string; hits: Hit[]; msg: string } | null = null;
  errors: Record<ErrorKey, string | null> = { assign: null, rename: null, close: null, post: null, label: null };
  parts!: DetailParts;

  constructor(readonly id: number) {
    this.detail = { state: "loading", seq: 0, data: null, msg: "" };
  }

  shownLabels(): string[] {
    const out = [...(this.labels.base ?? [])];
    for (const op of this.labelOps) {
      const at = out.indexOf(op.label);
      if (op.kind === "add" && at < 0) out.push(op.label);
      if (op.kind === "remove" && at >= 0) out.splice(at, 1);
    }
    return out;
  }
}

export function issuesPage(ctx: AppContext): Page {
  let alive = true;
  let filter: Filter = "open";
  let list: ListState = { filter, seq: 0, state: "loading", items: [], msg: "" };
  let rowErr: string | null = null;
  let sel: Selection | null = null;

  const userInput = textInput("user", "Current user", "guest");
  const filterOpen = h("button", { testid: "filter-open", text: "Open" });
  const filterClosed = h("button", { testid: "filter-closed", text: "Closed" });
  const listEl = h("div", { testid: "list", cls: "list", attrs: { "aria-live": "polite" } });
  const rowErrorEl = h("div", { testid: "row-error", cls: "error", attrs: { role: "alert" } });
  const detailEl = h("section", { testid: "detail", cls: "detail", attrs: { "aria-live": "polite" } });

  const el = h(
    "div",
    { cls: "issues" },
    h(
      "div",
      { cls: "toolbar" },
      h("label", { cls: "field" }, "User ", userInput),
      h("div", { cls: "segmented", attrs: { role: "group", "aria-label": "Filter" } }, filterOpen, filterClosed),
    ),
    h("div", { cls: "columns" }, h("div", { cls: "list-col" }, rowErrorEl, listEl), detailEl),
  );

  const user = (): string => userInput.value.trim();

  // ---- list ----

  function loadList(): void {
    const seq = nextSeq();
    const f = filter;
    list = { filter: f, seq, state: "loading", items: [], msg: "" };
    renderList();
    api.fetchIssues(f).then(
      items => {
        if (!alive || list.seq !== seq) return;
        list = { filter: f, seq, state: "ok", items, msg: "" };
        if (f === "open") ctx.setOpenIssues(items, seq);
        renderList();
      },
      e => {
        if (!alive || list.seq !== seq) return;
        list = { filter: f, seq, state: "error", items: [], msg: errorMessage(e) };
        renderList();
      },
    );
  }

  function visibleRows(): Issue[] {
    const { seq } = list;
    return list.items
      .filter(i => list.filter !== "open" || !ctx.overlay(i.id).closed.resolve(false, seq))
      .map(i => {
        const o = ctx.overlay(i.id);
        return { id: i.id, title: o.title.resolve(i.title, seq), assignee: o.assignee.resolve(i.assignee, seq) };
      });
  }

  function renderList(): void {
    filterOpen.setAttribute("aria-pressed", String(filter === "open"));
    filterClosed.setAttribute("aria-pressed", String(filter === "closed"));
    if (list.state === "loading") {
      listEl.replaceChildren(h("p", { cls: "muted", text: `loading ${list.filter} issues` }));
      return;
    }
    if (list.state === "error") {
      listEl.replaceChildren(h("p", { cls: "error", text: `list error: ${list.msg}` }));
      return;
    }
    const rows = visibleRows();
    if (!rows.length) {
      listEl.replaceChildren(h("p", { cls: "muted", text: `no ${list.filter} issues` }));
      return;
    }
    const who = user();
    const ul = h("ul", { cls: "rows" });
    for (const r of rows) {
      const id = r.id;
      const row = h(
        "button",
        {
          testid: "issue",
          cls: "issue",
          text: `#${id} ${r.title} (${r.assignee ?? "unassigned"})`,
          onClick: () => select(id),
        },
      );
      if (sel && sel.id === id) row.setAttribute("aria-current", "true");
      const assignBtn = h("button", {
        testid: "row-assign",
        cls: "small",
        text: `assign to ${who}`,
        onClick: () => assignIssue(id, "row"),
      });
      const li = h("li", { cls: "row" }, row, assignBtn);
      if (list.filter === "open") {
        li.append(h("button", { testid: "row-close", cls: "small", text: "close", onClick: () => closeIssue(id, "row") }));
      }
      ul.append(li);
    }
    listEl.replaceChildren(ul);
  }

  function renderRowError(): void {
    setMessage(rowErrorEl, rowErr ? `row error: ${rowErr}` : null);
  }

  function setFilter(f: Filter): void {
    if (f === filter) return;
    filter = f;
    loadList();
  }

  // ---- shared issue actions (from a row or the detail) ----

  function startAction(source: Source, s: Selection | null, key: ErrorKey): void {
    if (source === "row") {
      rowErr = null;
      renderRowError();
    } else if (s) {
      s.errors[key] = null;
    }
  }

  function reportDecline<T>(
    source: Source,
    field: Field<T>,
    op: Op,
    s: Selection | null,
    key: ErrorKey,
    text: string,
  ): void {
    if (!alive || !field.isLatest(op)) return;
    if (source === "row") {
      rowErr = text;
      renderRowError();
    } else if (s && sel === s) {
      s.errors[key] = key === "assign" ? text : `${key} error: ${text}`;
    }
  }

  function assignIssue(id: number, source: Source): void {
    const who = user();
    if (!who) return;
    const s = source === "detail" ? sel : null;
    const field = ctx.overlay(id).assignee;
    startAction(source, s, "assign");
    const op = field.start(who, source);
    ctx.changed();
    api.assign(id, who).then(
      r => {
        field.accept(op, r.assignee);
        ctx.changed();
      },
      e => {
        field.decline(op);
        reportDecline(source, field, op, s, "assign", errorMessage(e));
        ctx.changed();
      },
    );
  }

  function closeIssue(id: number, source: Source): void {
    const s = source === "detail" ? sel : null;
    const field = ctx.overlay(id).closed;
    startAction(source, s, "close");
    const op = field.start(true, source);
    ctx.changed();
    api.closeIssue(id).then(
      () => {
        field.accept(op, true);
        ctx.changed();
      },
      e => {
        field.decline(op);
        reportDecline(source, field, op, s, "close", errorMessage(e));
        ctx.changed();
      },
    );
  }

  function renameIssue(s: Selection): void {
    const title = s.parts.titleInput.value.trim();
    if (!title) return;
    const id = s.id;
    const field = ctx.overlay(id).title;
    startAction("detail", s, "rename");
    const op = field.start(title, "detail");
    ctx.changed();
    api.renameIssue(id, title).then(
      r => {
        field.accept(op, r.title);
        ctx.changed();
      },
      e => {
        field.decline(op);
        reportDecline("detail", field, op, s, "rename", errorMessage(e));
        ctx.changed();
      },
    );
  }

  // ---- detail ----

  function select(id: number): void {
    if (sel && sel.id === id) return;
    const s = new Selection(id);
    sel = s;
    s.parts = buildDetail(s);
    loadDetail(s);
    loadComments(s);
    loadLabels(s);
    renderList();
    renderDetail();
  }

  function loadDetail(s: Selection): void {
    const seq = nextSeq();
    s.detail = { state: "loading", seq, data: null, msg: "" };
    s.related = null;
    api.fetchIssue(s.id).then(
      d => {
        if (!alive || sel !== s || s.detail.seq !== seq) return;
        s.detail = d ? { state: "ok", seq, data: d, msg: "" } : { state: "notfound", seq, data: null, msg: "" };
        if (d) loadRelated(s, ctx.overlay(s.id).title.resolve(d.title, seq));
        renderDetail();
      },
      e => {
        if (!alive || sel !== s || s.detail.seq !== seq) return;
        s.detail = { state: "error", seq, data: null, msg: errorMessage(e) };
        renderDetail();
      },
    );
  }

  function loadRelated(s: Selection, query: string): void {
    const seq = nextSeq();
    s.related = { seq, state: "loading", query, hits: [], msg: "" };
    api.search(query).then(
      hits => {
        if (!alive || sel !== s || s.related?.seq !== seq) return;
        s.related = { seq, state: "ok", query, hits, msg: "" };
        renderDetail();
      },
      e => {
        if (!alive || sel !== s || s.related?.seq !== seq) return;
        s.related = { seq, state: "error", query, hits: [], msg: errorMessage(e) };
        renderDetail();
      },
    );
  }

  function loadComments(s: Selection): void {
    api.fetchComments(s.id).then(
      items => {
        if (!alive || sel !== s) return;
        s.comments = { state: "ok", items, msg: "" };
        renderDetail();
      },
      e => {
        if (!alive || sel !== s) return;
        s.comments = { state: "error", items: [], msg: errorMessage(e) };
        renderDetail();
      },
    );
  }

  function loadLabels(s: Selection): void {
    const seq = nextSeq();
    s.labels.baseSeq = 0;
    api.fetchLabels(s.id).then(
      labels => {
        if (!alive || sel !== s) return;
        if (seq > s.labels.baseSeq) s.labels = { state: "ok", base: labels, baseSeq: seq, msg: "" };
        renderDetail();
      },
      e => {
        if (!alive || sel !== s) return;
        if (s.labels.base === null) s.labels = { state: "error", base: null, baseSeq: 0, msg: errorMessage(e) };
        renderDetail();
      },
    );
  }

  function postComment(s: Selection): void {
    const text = s.parts.commentInput.value;
    const author = user();
    if (!text.trim() || !author) return;
    s.errors.post = null;
    const post: Post = { key: nextSeq(), author, text, sending: true };
    s.posts.push(post);
    s.parts.commentInput.value = "";
    renderDetail();
    api.addComment(s.id, author, text).then(
      c => {
        post.sending = false;
        post.author = c.author;
        post.text = c.text;
        if (alive && sel === s) renderDetail();
      },
      e => {
        s.posts = s.posts.filter(p => p !== post);
        if (!alive || sel !== s) return;
        s.errors.post = `post error: ${errorMessage(e)}`;
        renderDetail();
      },
    );
  }

  function changeLabel(s: Selection, kind: "add" | "remove", label: string): void {
    s.errors.label = null;
    const op: LabelOp = { seq: nextSeq(), kind, label };
    s.labelOps.push(op);
    renderDetail();
    const call = kind === "add" ? api.addLabel(s.id, label) : api.removeLabel(s.id, label);
    call.then(
      labels => {
        s.labelOps = s.labelOps.filter(o => o !== op);
        if (op.seq > s.labels.baseSeq) s.labels = { state: "ok", base: labels, baseSeq: op.seq, msg: "" };
        if (alive && sel === s) renderDetail();
      },
      e => {
        s.labelOps = s.labelOps.filter(o => o !== op);
        if (!alive || sel !== s) return;
        s.errors.label = `label error: ${errorMessage(e)}`;
        renderDetail();
      },
    );
  }

  function addLabel(s: Selection): void {
    const label = s.parts.labelInput.value.trim();
    if (!label || s.shownLabels().includes(label)) return;
    s.parts.labelInput.value = "";
    changeLabel(s, "add", label);
  }

  function buildDetail(s: Selection): DetailParts {
    const errorEl = (testid: string): HTMLElement => {
      const e = h("p", { testid, cls: "error", attrs: { role: "alert" } });
      e.hidden = true;
      return e;
    };
    const titleInput = textInput("title-input", "New title");
    const labelInput = textInput("label-input", "New label");
    const commentInput = textInput("comment-input", "New comment");
    const parts: DetailParts = {
      head: h("div", { cls: "head" }),
      retry: h("button", { testid: "retry", text: "retry", onClick: () => sel === s && (loadDetail(s), renderDetail()) }),
      assign: h("button", { testid: "assign", onClick: () => sel === s && assignIssue(s.id, "detail") }),
      assignErr: errorEl("assign-error"),
      close: h("button", { testid: "close", text: "close", onClick: () => sel === s && closeIssue(s.id, "detail") }),
      closeErr: errorEl("close-error"),
      titleInput,
      renameErr: errorEl("rename-error"),
      labels: h("ul", { testid: "labels", cls: "labels" }),
      labelInput,
      labelErr: errorEl("label-error"),
      comments: h("ul", { testid: "comments", cls: "comments" }),
      commentInput,
      postErr: errorEl("post-error"),
      relatedSlot: h("div"),
    };
    const rename = (): void => {
      if (sel === s) renameIssue(s);
    };
    const add = (): void => {
      if (sel === s) addLabel(s);
    };
    const post = (): void => {
      if (sel === s) postComment(s);
    };
    onEnter(titleInput, rename);
    onEnter(labelInput, add);
    onEnter(commentInput, post);
    parts.labelInput.setAttribute("placeholder", "label");
    parts.commentInput.setAttribute("placeholder", "comment");
    parts.titleInput.setAttribute("placeholder", "new title");
    return parts;
  }

  function detailBody(s: Selection): Node {
    const p = s.parts;
    return h(
      "div",
      { cls: "detail-body" },
      p.head,
      h("div", { cls: "actions" }, p.retry, p.assign, p.close),
      p.assignErr,
      p.closeErr,
      h("div", { cls: "inline" }, p.titleInput, h("button", { testid: "rename", text: "rename", onClick: () => sel === s && renameIssue(s) })),
      p.renameErr,
      h("h3", { text: "Labels" }),
      p.labels,
      h("div", { cls: "inline" }, p.labelInput, h("button", { testid: "add-label", text: "add label", onClick: () => sel === s && addLabel(s) })),
      p.labelErr,
      h("h3", { text: "Comments" }),
      p.comments,
      h("div", { cls: "inline" }, p.commentInput, h("button", { testid: "post", text: "post", onClick: () => sel === s && postComment(s) })),
      p.postErr,
      p.relatedSlot,
    );
  }

  function renderDetail(): void {
    const s = sel;
    if (!s) {
      detailEl.replaceChildren(h("p", { cls: "muted", text: "select an issue" }));
      return;
    }
    const p = s.parts;
    if (!detailEl.contains(p.head)) detailEl.replaceChildren(detailBody(s));

    const d = s.detail;
    if (d.state === "loading") p.head.replaceChildren(h("p", { cls: "muted", text: `loading #${s.id}` }));
    else if (d.state === "notfound") p.head.replaceChildren(h("p", { cls: "error", text: `detail error: issue #${s.id} not found` }));
    else if (d.state === "error") p.head.replaceChildren(h("p", { cls: "error", text: `detail error: ${d.msg}` }));
    else if (d.data) {
      const title = ctx.overlay(s.id).title.resolve(d.data.title, d.seq);
      p.head.replaceChildren(h("h2", { text: `#${s.id} ${title}` }), h("p", { cls: "body", text: d.data.body }));
    }

    p.assign.textContent = `assign to ${user()}`;
    setMessage(p.assignErr, s.errors.assign);
    setMessage(p.closeErr, s.errors.close);
    setMessage(p.renameErr, s.errors.rename);
    setMessage(p.labelErr, s.errors.label);
    setMessage(p.postErr, s.errors.post);

    // labels
    if (s.labels.base === null) {
      p.labels.replaceChildren(
        h("li", { cls: s.labels.state === "error" ? "error" : "muted", text: s.labels.state === "error" ? `labels error: ${s.labels.msg}` : "loading labels" }),
      );
    } else {
      const shown = s.shownLabels();
      if (!shown.length) p.labels.replaceChildren(h("li", { cls: "muted", text: "no labels" }));
      else
        p.labels.replaceChildren(
          ...shown.map(label =>
            h(
              "li",
              { cls: "label-item" },
              h("span", { testid: "label", cls: "label", text: label }),
              h("button", {
                testid: "remove-label",
                cls: "small",
                text: `remove ${label}`,
                onClick: () => sel === s && changeLabel(s, "remove", label),
              }),
            ),
          ),
        );
    }

    // comments
    const c = s.comments;
    const commentRows: Node[] = [];
    if (c.state === "loading") commentRows.push(h("li", { cls: "muted", text: "loading comments" }));
    else if (c.state === "error") commentRows.push(h("li", { cls: "error", text: `comments error: ${c.msg}` }));
    else for (const item of c.items) commentRows.push(h("li", { testid: "comment", text: `${item.author}: ${item.text}` }));
    for (const post of s.posts) {
      commentRows.push(
        h("li", { testid: "comment", cls: post.sending ? "muted" : "", text: `${post.author}: ${post.text}${post.sending ? " (sending…)" : ""}` }),
      );
    }
    if (c.state === "ok" && !commentRows.length) commentRows.push(h("li", { cls: "muted", text: "no comments" }));
    p.comments.replaceChildren(...commentRows);

    // related help
    const r = s.related;
    if (d.state !== "ok" || !r) {
      p.relatedSlot.replaceChildren();
    } else {
      const related = h("div", { testid: "related", cls: "related" }, h("h3", { text: "Related help" }));
      if (r.state === "loading") related.append(h("p", { cls: "muted", text: "finding related help" }));
      else if (r.state === "error") related.append(h("p", { cls: "error", text: `related help failed: ${r.msg}` }));
      else if (!r.hits.length) related.append(h("p", { cls: "muted", text: "no related help" }));
      else {
        const query = r.query;
        const hits = r.hits;
        for (const hit of hits.slice(0, 3)) {
          related.append(
            h("button", {
              testid: "related-hit",
              cls: "link",
              text: hit.name,
              onClick: () => ctx.openPage("help", { query, hits, selectedId: hit.id }),
            }),
          );
        }
      }
      p.relatedSlot.replaceChildren(related);
    }
  }

  // ---- wiring ----

  userInput.addEventListener("input", () => {
    renderList();
    renderDetail();
  });
  filterOpen.addEventListener("click", () => setFilter("open"));
  filterClosed.addEventListener("click", () => setFilter("closed"));

  renderRowError();
  renderDetail();
  loadList();

  return {
    el,
    refresh() {
      if (!alive) return;
      renderList();
      renderDetail();
      renderRowError();
    },
    dispose() {
      alive = false;
    },
  };
}
