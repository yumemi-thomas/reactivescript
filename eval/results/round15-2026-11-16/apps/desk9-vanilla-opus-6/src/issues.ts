import * as api from "./api.js";
import type { Comment, Hit, Issue, IssueDetail } from "./api.js";
import { IssueStore } from "./store";
import { Slot, button, errMsg, h, input } from "./dom";

type Filter = "open" | "closed";

export interface IssuesContext {
  store: IssueStore;
  setCount(n: number): void;
  openRelated(query: string, hits: Hit[], hit: Hit): void;
}

type Load<T> = { kind: "loading" } | { kind: "ok"; value: T } | { kind: "error"; message: string };

type DetailState =
  | { kind: "loading" }
  | { kind: "ok"; issue: IssueDetail; at: number }
  | { kind: "missing" }
  | { kind: "error"; message: string };

type RelatedState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ok"; q: string; hits: Hit[] }
  | { kind: "error"; message: string };

interface Post {
  author: string;
  text: string;
  sent: boolean;
}

interface LabelOp {
  seq: number;
  type: "add" | "remove";
  label: string;
}

interface Selection {
  id: number;
  detail: DetailState;
  detailGen: number;
  related: RelatedState;
  relatedGen: number;
  comments: Load<Comment[]>;
  posts: Post[];
  labelBase: string[] | null;
  labelBaseSeq: number;
  labelError: string | null; // fetch failure
  labelOps: LabelOp[];
  errors: { assign: string | null; rename: string | null; close: string | null; post: string | null; label: string | null };
  titleInput: HTMLInputElement;
  commentInput: HTMLInputElement;
  labelInput: HTMLInputElement;
  assignBtn: HTMLButtonElement;
  head: Slot;
  relatedSlot: Slot;
  commentsSlot: Slot;
  labelsSlot: Slot;
  errorSlots: { assign: Slot; rename: Slot; close: Slot; post: Slot; label: Slot };
}

export function mountIssues(host: HTMLElement, ctx: IssuesContext): () => void {
  const { store } = ctx;
  let alive = true;
  let user = "guest";
  let filter: Filter = "open";
  let listGen = 0;
  let listStatus: Load<null> = { kind: "loading" };
  const bases: Partial<Record<Filter, { items: Issue[]; at: number }>> = {};
  let rowError: string | null = null;
  let sel: Selection | null = null;

  // ---- static layout ----
  const userInput = input("user", "Current user");
  userInput.value = user;
  userInput.addEventListener("input", () => {
    user = userInput.value;
    render();
  });
  const filterOpen = button("filter-open", "Open", () => setFilter("open"));
  const filterClosed = button("filter-closed", "Closed", () => setFilter("closed"));
  const listEl = h("div", { testid: "list", class: "list", attrs: { "aria-live": "polite" } });
  const list = new Slot(listEl);
  const rowErrSlot = new Slot(h("div", { attrs: { role: "alert" } }));
  const detailEl = h("section", { testid: "detail", class: "detail", attrs: { "aria-label": "Issue detail" } });

  host.append(
    h(
      "div",
      { class: "issues" },
      h(
        "div",
        { class: "toolbar" },
        h("label", { class: "field" }, "User ", userInput),
        h("div", { class: "seg", attrs: { role: "group", "aria-label": "Filter" } }, filterOpen, filterClosed),
      ),
      h("div", { class: "cols" }, h("div", { class: "col" }, rowErrSlot.el, listEl), detailEl),
    ),
  );
  detailEl.textContent = "select an issue";

  const unsubscribe = store.subscribe(() => {
    if (alive) render();
  });

  // ---- list ----
  function loadList(): void {
    const gen = ++listGen;
    const f = filter;
    const at = store.now();
    listStatus = { kind: "loading" };
    render();
    api.fetchIssues(f).then(
      items => {
        if (!alive || gen !== listGen) return;
        bases[f] = { items, at };
        listStatus = { kind: "ok", value: null };
        render();
      },
      e => {
        if (!alive || gen !== listGen) return;
        listStatus = { kind: "error", message: errMsg(e) };
        render();
      },
    );
  }

  function setFilter(f: Filter): void {
    if (f === filter) return;
    filter = f;
    loadList();
  }

  function view(issue: Issue, at: number): Issue {
    return {
      id: issue.id,
      title: store.resolve(issue.id, "rename", issue.title, at) ?? issue.title,
      assignee: store.resolve(issue.id, "assign", issue.assignee, at),
    };
  }

  function rows(f: Filter): Issue[] {
    const base = bases[f];
    if (!base) return [];
    const items = f === "open" ? base.items.filter(i => !store.isClosed(i.id, base.at)) : base.items;
    return items.map(i => view(i, base.at));
  }

  const rowText = (i: Issue) => `#${i.id} ${i.title} (${i.assignee ?? "unassigned"})`;

  // ---- actions (shared by rows and the detail) ----
  function doAssign(id: number, onFail: (message: string) => void): void {
    const u = user;
    const op = store.start(id, "assign", u);
    api.assign(id, u).then(
      r => store.settle(op, true, typeof r?.assignee === "string" ? r.assignee : u),
      e => {
        if (alive) onFail(errMsg(e));
        store.settle(op, false);
      },
    );
  }

  function doClose(id: number, onFail: (message: string) => void): void {
    const op = store.start(id, "close", "closed");
    api.closeIssue(id).then(
      () => store.settle(op, true),
      e => {
        if (alive) onFail(errMsg(e));
        store.settle(op, false);
      },
    );
  }

  function rowAssign(id: number): void {
    if (!user.trim()) return;
    rowError = null;
    doAssign(id, m => (rowError = `row error: ${m}`));
  }

  function rowClose(id: number): void {
    rowError = null;
    doClose(id, m => (rowError = `row error: ${m}`));
  }

  // ---- selection ----
  function select(id: number): void {
    if (sel && sel.id === id) return;
    const s = buildSelection(id);
    sel = s;
    loadDetail(s);
    loadComments(s);
    loadLabels(s);
    render();
  }

  function buildSelection(id: number): Selection {
    const errorSlot = (name: string) => new Slot(h("div", { testid: `${name}-error`, class: "error", attrs: { role: "alert" } }));
    const s: Selection = {
      id,
      detail: { kind: "loading" },
      detailGen: 0,
      related: { kind: "idle" },
      relatedGen: 0,
      comments: { kind: "loading" },
      posts: [],
      labelBase: null,
      labelBaseSeq: -1,
      labelError: null,
      labelOps: [],
      errors: { assign: null, rename: null, close: null, post: null, label: null },
      titleInput: input("title-input", "New title", () => rename(s)),
      commentInput: input("comment-input", "Comment", () => postComment(s)),
      labelInput: input("label-input", "Label", () => addLabel(s)),
      assignBtn: button("assign", "", () => detailAssign(s)),
      head: new Slot(h("div", { class: "head", attrs: { "aria-live": "polite" } })),
      relatedSlot: new Slot(h("div")),
      commentsSlot: new Slot(h("ul", { testid: "comments", class: "comments", attrs: { "aria-live": "polite" } })),
      labelsSlot: new Slot(h("div", { testid: "labels", class: "labels", attrs: { "aria-live": "polite" } })),
      errorSlots: {
        assign: errorSlot("assign"),
        rename: errorSlot("rename"),
        close: errorSlot("close"),
        post: errorSlot("post"),
        label: errorSlot("label"),
      },
    };
    detailEl.replaceChildren(
      s.head.el,
      h("div", { class: "row" }, button("retry", "retry", () => loadDetail(s))),
      s.relatedSlot.el,
      h("div", { class: "row" }, s.assignBtn, button("close", "close", () => detailClose(s))),
      s.errorSlots.assign.el,
      s.errorSlots.close.el,
      h("div", { class: "row" }, s.titleInput, button("rename", "rename", () => rename(s))),
      s.errorSlots.rename.el,
      h("h3", {}, "Labels"),
      s.labelsSlot.el,
      h("div", { class: "row" }, s.labelInput, button("add-label", "add label", () => addLabel(s))),
      s.errorSlots.label.el,
      h("h3", {}, "Comments"),
      s.commentsSlot.el,
      h("div", { class: "row" }, s.commentInput, button("post", "post", () => postComment(s))),
      s.errorSlots.post.el,
    );
    return s;
  }

  const current = (s: Selection) => alive && sel === s;

  function loadDetail(s: Selection): void {
    const gen = ++s.detailGen;
    const at = store.now();
    s.detail = { kind: "loading" };
    s.related = { kind: "idle" };
    s.relatedGen++;
    render();
    api.fetchIssue(s.id).then(
      d => {
        if (!current(s) || gen !== s.detailGen) return;
        if (d === null) s.detail = { kind: "missing" };
        else {
          s.detail = { kind: "ok", issue: d, at };
          loadRelated(s, detailTitle(s) ?? d.title);
        }
        render();
      },
      e => {
        if (!current(s) || gen !== s.detailGen) return;
        s.detail = { kind: "error", message: errMsg(e) };
        render();
      },
    );
  }

  function detailTitle(s: Selection): string | null {
    if (s.detail.kind !== "ok") return null;
    return store.resolve(s.id, "rename", s.detail.issue.title, s.detail.at);
  }

  function loadRelated(s: Selection, q: string): void {
    const gen = ++s.relatedGen;
    s.related = { kind: "loading" };
    api.search(q).then(
      hits => {
        if (!current(s) || gen !== s.relatedGen) return;
        s.related = { kind: "ok", q, hits };
        render();
      },
      e => {
        if (!current(s) || gen !== s.relatedGen) return;
        s.related = { kind: "error", message: errMsg(e) };
        render();
      },
    );
  }

  function loadComments(s: Selection): void {
    s.comments = { kind: "loading" };
    api.fetchComments(s.id).then(
      value => {
        if (!current(s)) return;
        s.comments = { kind: "ok", value };
        render();
      },
      e => {
        if (!current(s)) return;
        s.comments = { kind: "error", message: errMsg(e) };
        render();
      },
    );
  }

  function loadLabels(s: Selection): void {
    const seq = store.now();
    api.fetchLabels(s.id).then(
      value => {
        if (!current(s)) return;
        if (seq > s.labelBaseSeq) {
          s.labelBase = value;
          s.labelBaseSeq = seq;
          s.labelError = null;
        }
        render();
      },
      e => {
        if (!current(s)) return;
        if (s.labelBase === null) s.labelError = errMsg(e);
        render();
      },
    );
  }

  function detailAssign(s: Selection): void {
    if (!user.trim()) return;
    s.errors.assign = null;
    doAssign(s.id, m => {
      if (sel === s) s.errors.assign = m;
    });
    render();
  }

  function detailClose(s: Selection): void {
    s.errors.close = null;
    doClose(s.id, m => {
      if (sel === s) s.errors.close = `close error: ${m}`;
    });
    render();
  }

  function rename(s: Selection): void {
    const title = s.titleInput.value.trim();
    if (!title) return;
    s.errors.rename = null;
    const op = store.start(s.id, "rename", title);
    api.renameIssue(s.id, title).then(
      r => store.settle(op, true, typeof r?.title === "string" ? r.title : title),
      e => {
        if (alive && sel === s) s.errors.rename = `rename error: ${errMsg(e)}`;
        store.settle(op, false);
      },
    );
  }

  function postComment(s: Selection): void {
    const text = s.commentInput.value;
    if (!text.trim()) return;
    s.errors.post = null;
    const p: Post = { author: user, text, sent: false };
    s.posts.push(p);
    s.commentInput.value = "";
    render();
    api.addComment(s.id, p.author, text).then(
      c => {
        p.sent = true;
        if (c && typeof c.author === "string") p.author = c.author;
        if (c && typeof c.text === "string") p.text = c.text;
        if (current(s)) render();
      },
      e => {
        s.posts = s.posts.filter(x => x !== p);
        if (!current(s)) return;
        s.errors.post = `post error: ${errMsg(e)}`;
        render();
      },
    );
  }

  function shownLabels(s: Selection): string[] {
    let labels = [...(s.labelBase ?? [])];
    for (const op of s.labelOps) {
      if (op.type === "add") {
        if (!labels.includes(op.label)) labels.push(op.label);
      } else labels = labels.filter(l => l !== op.label);
    }
    return labels;
  }

  function changeLabel(s: Selection, type: "add" | "remove", label: string): void {
    s.errors.label = null;
    const op: LabelOp = { seq: store.now(), type, label };
    s.labelOps.push(op);
    render();
    const call = type === "add" ? api.addLabel(s.id, label) : api.removeLabel(s.id, label);
    call.then(
      labels => {
        s.labelOps = s.labelOps.filter(o => o !== op);
        if (Array.isArray(labels) && op.seq > s.labelBaseSeq) {
          s.labelBase = labels;
          s.labelBaseSeq = op.seq;
          s.labelError = null;
        }
        if (current(s)) render();
      },
      e => {
        s.labelOps = s.labelOps.filter(o => o !== op);
        if (!current(s)) return;
        s.errors.label = `label error: ${errMsg(e)}`;
        render();
      },
    );
  }

  function addLabel(s: Selection): void {
    const label = s.labelInput.value.trim();
    if (!label || shownLabels(s).includes(label)) return;
    s.labelInput.value = "";
    changeLabel(s, "add", label);
  }

  // ---- render ----
  function render(): void {
    if (!alive) return;
    filterOpen.setAttribute("aria-pressed", String(filter === "open"));
    filterClosed.setAttribute("aria-pressed", String(filter === "closed"));

    const openBase = bases.open;
    if (openBase) ctx.setCount(openBase.items.filter(i => !store.isClosed(i.id, openBase.at)).length);

    const shown = listStatus.kind === "ok" ? rows(filter) : [];
    const selId = sel?.id ?? null;
    list.render(JSON.stringify([listStatus, filter, shown, user, selId]), () => {
      if (listStatus.kind === "loading") return [h("p", { class: "muted" }, `loading ${filter} issues`)];
      if (listStatus.kind === "error") return [h("p", { class: "error" }, `list error: ${listStatus.message}`)];
      if (!shown.length) return [h("p", { class: "muted" }, `no ${filter} issues`)];
      return [
        h(
          "ul",
          { class: "rows" },
          shown.map(i => {
            const rowBtn = h("button", { testid: "issue", type: "button", class: "issue", onclick: () => select(i.id) }, rowText(i));
            if (i.id === selId) rowBtn.setAttribute("aria-current", "true");
            return h(
              "li",
              { class: i.id === selId ? "selected" : undefined },
              rowBtn,
              h(
                "span",
                { class: "row-actions" },
                button("row-assign", `assign to ${user}`, () => rowAssign(i.id), "small"),
                filter === "open" ? button("row-close", "close", () => rowClose(i.id), "small") : null,
              ),
            );
          }),
        ),
      ];
    });
    rowErrSlot.render(JSON.stringify(rowError), () =>
      rowError === null ? [] : [h("p", { testid: "row-error", class: "error" }, rowError)],
    );

    const s = sel;
    if (!s) return;
    s.assignBtn.textContent = `assign to ${user}`;

    const title = detailTitle(s);
    s.head.render(JSON.stringify([s.detail, title]), () => {
      switch (s.detail.kind) {
        case "loading":
          return [h("p", { class: "muted" }, `loading #${s.id}`)];
        case "missing":
          return [h("p", { class: "error" }, `detail error: issue #${s.id} not found`)];
        case "error":
          return [h("p", { class: "error" }, `detail error: ${s.detail.message}`)];
        case "ok":
          return [h("h2", {}, `#${s.id} ${title ?? s.detail.issue.title}`), h("p", { class: "body" }, s.detail.issue.body)];
      }
    });

    const rel = s.related;
    s.relatedSlot.render(JSON.stringify([s.detail.kind, rel]), () => {
      if (s.detail.kind !== "ok" || rel.kind === "idle") return [];
      let inner: (Node | string)[];
      if (rel.kind === "loading") inner = [h("p", { class: "muted" }, "finding related help")];
      else if (rel.kind === "error") inner = [h("p", { class: "error" }, `related help failed: ${rel.message}`)];
      else if (!rel.hits.length) inner = [h("p", { class: "muted" }, "no related help")];
      else
        inner = rel.hits
          .slice(0, 3)
          .map(hit => button("related-hit", hit.name, () => ctx.openRelated(rel.q, rel.hits, hit), "link"));
      return [h("div", { testid: "related", class: "related" }, h("span", { class: "muted" }, "Related help: "), inner)];
    });

    const c = s.comments;
    s.commentsSlot.render(JSON.stringify([c, s.posts]), () => {
      const out: (Node | string)[] = [];
      if (c.kind === "loading") out.push(h("li", { class: "muted" }, "loading comments"));
      if (c.kind === "error") out.push(h("li", { class: "error" }, `comments error: ${c.message}`));
      const items: Post[] = [...(c.kind === "ok" ? c.value.map(x => ({ ...x, sent: true })) : []), ...s.posts];
      for (const p of items)
        out.push(h("li", { testid: "comment", class: p.sent ? undefined : "muted" }, `${p.author}: ${p.text}${p.sent ? "" : " (sending…)"}`));
      if (c.kind === "ok" && !items.length) out.push(h("li", { class: "muted" }, "no comments yet"));
      return out;
    });

    const labels = shownLabels(s);
    s.labelsSlot.render(JSON.stringify([s.labelBase === null, s.labelError, labels]), () => {
      const out: (Node | string)[] = [];
      if (s.labelBase === null) {
        out.push(
          s.labelError === null
            ? h("span", { class: "muted" }, "loading labels")
            : h("span", { class: "error" }, `labels error: ${s.labelError}`),
        );
      }
      for (const l of labels)
        out.push(
          h(
            "span",
            { class: "chip" },
            h("span", { testid: "label" }, l),
            button("remove-label", `remove ${l}`, () => changeLabel(s, "remove", l), "small"),
          ),
        );
      if (s.labelBase !== null && !labels.length) out.push(h("span", { class: "muted" }, "no labels"));
      return out;
    });

    for (const k of ["assign", "rename", "close", "post", "label"] as const) {
      const msg = s.errors[k];
      s.errorSlots[k].render(JSON.stringify(msg), () => (msg === null ? [] : [msg]));
    }
  }

  loadList();

  return () => {
    alive = false;
    unsubscribe();
  };
}
