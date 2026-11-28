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
import type { Comment as Note, Hit, Issue, IssueDetail } from "./api.js";
import { el, errorMessage, onEnter } from "./dom.js";
import type { PageHandle, Shell } from "./shell.js";

type Filter = "open" | "closed";

type Loadable<T> =
  | { status: "loading" }
  | { status: "ok"; value: T }
  | { status: "error"; message: string };

interface Post {
  author: string;
  text: string;
  sent: boolean;
}

interface Errors {
  assign: string | null;
  rename: string | null;
  close: string | null;
  post: string | null;
  label: string | null;
}

/** The state of the selected issue. Its elements live in the DetailView built for it. */
interface Selection {
  id: number;
  issue: Loadable<IssueDetail | null>;
  related: { query: string; hits: Loadable<Hit[]> } | null;
  comments: Loadable<Note[]>;
  posts: Post[];
  labels: Loadable<string[]>;
  errors: Errors;
}

interface DetailView {
  status: HTMLElement;
  issue: HTMLElement;
  heading: HTMLElement;
  body: HTMLElement;
  retry: HTMLButtonElement;
  assign: HTMLButtonElement;
  assignError: HTMLElement;
  title: HTMLInputElement;
  rename: HTMLButtonElement;
  renameError: HTMLElement;
  close: HTMLButtonElement;
  closeError: HTMLElement;
  comments: HTMLElement;
  commentInput: HTMLInputElement;
  post: HTMLButtonElement;
  postError: HTMLElement;
  labels: HTMLElement;
  labelInput: HTMLInputElement;
  addLabel: HTMLButtonElement;
  labelError: HTMLElement;
  related: HTMLElement;
}

const okIssueOf = (s: Selection): IssueDetail | null => (s.issue.status === "ok" ? s.issue.value : null);

/**
 * The issues page: the open or closed issues, the selected issue with its
 * title, comments, labels and related help, and the row actions.
 *
 * Actions update the page at once and roll back if the server declines.
 * Answers that arrive after the page is left, or after another issue is
 * selected, are ignored.
 */
export function mountIssuesPage(root: HTMLElement, shell: Shell): PageHandle {
  let alive = true;
  let filter: Filter = "open";
  let list: Loadable<Issue[]> = { status: "loading" };
  let listSeq = 0;
  /** Ids closed from this page whose close is pending or accepted; kept out of the open list. */
  const closed = new Set<number>();
  let sel: Selection | null = null;
  let view: DetailView | null = null;

  const userInput = el("input", { type: "text", "data-testid": "user", autocomplete: "off", "aria-label": "Current user" });
  userInput.value = "guest";
  const openFilter = el("button", { type: "button", "data-testid": "filter-open" }, "Open");
  const closedFilter = el("button", { type: "button", "data-testid": "filter-closed" }, "Closed");
  const listEl = el("div", { "data-testid": "list", class: "list" });
  const rowErrorEl = el("p", { "data-testid": "row-error", class: "error", role: "alert" });
  const detailEl = el("div", { "data-testid": "detail", class: "detail" });

  const currentUser = (): string => userInput.value.trim();
  const isCurrent = (s: Selection): boolean => alive && sel === s;
  const viewOf = (s: Selection): DetailView | null => (isCurrent(s) ? view : null);
  const findRow = (id: number): Issue | undefined =>
    list.status === "ok" ? list.value.find(r => r.id === id) : undefined;
  const visibleRows = (): Issue[] => {
    if (list.status !== "ok") return [];
    return filter === "closed" ? list.value : list.value.filter(r => !closed.has(r.id));
  };

  // ---- the list ----

  function loadList(): void {
    const seq = ++listSeq;
    const requested = filter;
    list = { status: "loading" };
    renderRows();
    fetchIssues(requested).then(
      rows => {
        if (!alive || seq !== listSeq) return;
        list = { status: "ok", value: rows };
        if (requested === "open") shell.setCount(visibleRows().length);
        renderRows();
      },
      e => {
        if (!alive || seq !== listSeq) return;
        list = { status: "error", message: errorMessage(e) };
        renderRows();
      }
    );
  }

  function setFilter(next: Filter): void {
    if (!alive || next === filter) return;
    filter = next;
    loadList();
  }

  function renderRows(): void {
    openFilter.setAttribute("aria-pressed", String(filter === "open"));
    closedFilter.setAttribute("aria-pressed", String(filter === "closed"));
    if (list.status === "loading") {
      listEl.replaceChildren(el("p", {}, `loading ${filter} issues`));
      return;
    }
    if (list.status === "error") {
      listEl.replaceChildren(el("p", { class: "error" }, `list error: ${list.message}`));
      return;
    }
    const user = currentUser();
    listEl.replaceChildren(...visibleRows().map(r => rowNode(r, user)));
  }

  function rowNode(r: Issue, user: string): HTMLElement {
    const issueBtn = el(
      "button",
      { type: "button", "data-testid": "issue", class: "issue" },
      `#${r.id} ${r.title} (${r.assignee ?? "unassigned"})`
    );
    issueBtn.addEventListener("click", () => select(r.id));

    const assignBtn = el("button", { type: "button", "data-testid": "row-assign" }, `assign to ${user}`);
    assignBtn.disabled = user === "";
    assignBtn.addEventListener("click", () => rowAssign(r.id));

    const nodes: HTMLElement[] = [issueBtn, assignBtn];
    if (filter === "open") {
      const closeBtn = el("button", { type: "button", "data-testid": "row-close" }, "close");
      closeBtn.addEventListener("click", () => rowClose(r.id));
      nodes.push(closeBtn);
    }
    return el("div", { class: sel?.id === r.id ? "row selected" : "row" }, ...nodes);
  }

  /** Re-renders what depends on the user's name: the rows' and the detail's assign buttons. */
  function renderUser(): void {
    renderRows();
    if (view) {
      const user = currentUser();
      view.assign.textContent = `assign to ${user}`;
      view.assign.disabled = user === "";
    }
  }

  // ---- title, assignee and open state shared by the row and the detail ----

  function setTitle(id: number, title: string): void {
    const row = findRow(id);
    if (row) row.title = title;
    if (sel && sel.id === id) {
      const issue = okIssueOf(sel);
      if (issue) issue.title = title;
    }
  }

  /** Assigns `id` to the current user at once; rolls back and reports if the server declines. */
  function startAssign(id: number, onError: (message: string) => void): void {
    const user = currentUser();
    if (user === "") return;
    const row = findRow(id);
    const before = row ? row.assignee : null;
    if (row) row.assignee = user;
    renderRows();
    assign(id, user).then(
      result => {
        if (!alive) return;
        const latest = findRow(id);
        if (latest) latest.assignee = result.assignee;
        renderRows();
      },
      e => {
        if (!alive) return;
        const latest = findRow(id);
        if (latest) latest.assignee = before;
        renderRows();
        onError(errorMessage(e));
      }
    );
  }

  /**
   * Takes issue `id` out of the open list at once. If the server declines, it
   * comes back and the count follows. If the server accepts, it stays out.
   */
  function startClose(id: number, onError: (message: string) => void): void {
    const counted = filter === "open" && list.status === "ok" && findRow(id) !== undefined && !closed.has(id);
    closed.add(id);
    if (counted) shell.adjustCount(-1);
    renderRows();
    closeIssue(id).then(
      () => undefined,
      e => {
        closed.delete(id);
        if (!alive) {
          if (counted) shell.adjustCount(1);
          return;
        }
        if (filter === "open" && list.status === "ok") shell.setCount(visibleRows().length);
        else if (filter === "open" && list.status === "loading") {
          // The next load counts the issue again.
        } else if (counted) shell.adjustCount(1);
        renderRows();
        onError(errorMessage(e));
      }
    );
  }

  function rowAssign(id: number): void {
    rowErrorEl.textContent = "";
    startAssign(id, message => {
      if (alive) rowErrorEl.textContent = `row error: ${message}`;
    });
  }

  function rowClose(id: number): void {
    rowErrorEl.textContent = "";
    startClose(id, message => {
      if (alive) rowErrorEl.textContent = `row error: ${message}`;
    });
  }

  // ---- selection and the detail ----

  function select(id: number): void {
    if (!alive || sel?.id === id) return;
    const s: Selection = {
      id,
      issue: { status: "loading" },
      related: null,
      comments: { status: "loading" },
      posts: [],
      labels: { status: "loading" },
      errors: { assign: null, rename: null, close: null, post: null, label: null },
    };
    sel = s;
    view = buildDetail(s);
    renderUser();
    loadIssue(s);
    loadComments(s);
    loadLabels(s);
  }

  function buildDetail(s: Selection): DetailView {
    const v: DetailView = {
      status: el("p", { class: "status", role: "status" }),
      issue: el("div", { class: "issue" }),
      heading: el("h2", {}),
      body: el("p", { class: "body" }),
      retry: el("button", { type: "button", "data-testid": "retry" }, "retry"),
      assign: el("button", { type: "button", "data-testid": "assign" }, `assign to ${currentUser()}`),
      assignError: el("p", { class: "error" }),
      title: el("input", { type: "text", "data-testid": "title-input", placeholder: "New title", "aria-label": "New title" }),
      rename: el("button", { type: "button", "data-testid": "rename" }, "rename"),
      renameError: el("p", { class: "error" }),
      close: el("button", { type: "button", "data-testid": "close" }, "close"),
      closeError: el("p", { class: "error" }),
      comments: el("div", { "data-testid": "comments", class: "comments" }),
      commentInput: el("input", { type: "text", "data-testid": "comment-input", placeholder: "Write a comment", "aria-label": "Comment" }),
      post: el("button", { type: "button", "data-testid": "post" }, "post"),
      postError: el("p", { class: "error" }),
      labels: el("div", { "data-testid": "labels", class: "labels" }),
      labelInput: el("input", { type: "text", "data-testid": "label-input", placeholder: "Add a label", "aria-label": "Label" }),
      addLabel: el("button", { type: "button", "data-testid": "add-label" }, "add label"),
      labelError: el("p", { class: "error" }),
      related: el("div", { "data-testid": "related", class: "related" }),
    };
    v.issue.append(v.heading, v.body);
    v.issue.hidden = true;

    v.retry.addEventListener("click", () => loadIssue(s));
    v.assign.addEventListener("click", () => {
      s.errors.assign = null;
      renderErrors(s);
      startAssign(s.id, message => {
        if (!isCurrent(s)) return;
        s.errors.assign = `assign error: ${message}`;
        renderErrors(s);
      });
    });
    v.rename.addEventListener("click", () => startRename(s, v));
    onEnter(v.title, () => startRename(s, v));
    v.close.addEventListener("click", () => {
      s.errors.close = null;
      renderErrors(s);
      startClose(s.id, message => {
        if (!isCurrent(s)) return;
        s.errors.close = `close error: ${message}`;
        renderErrors(s);
      });
    });
    v.post.addEventListener("click", () => startPost(s, v));
    onEnter(v.commentInput, () => startPost(s, v));
    v.addLabel.addEventListener("click", () => startAddLabel(s, v));
    onEnter(v.labelInput, () => startAddLabel(s, v));

    detailEl.replaceChildren(
      el(
        "div",
        { class: "detail-body" },
        v.status,
        v.issue,
        el("div", { class: "actions" }, v.retry),
        el("div", { class: "action" }, v.assign, v.assignError),
        el("div", { class: "action" }, v.title, v.rename, v.renameError),
        el("div", { class: "action" }, v.close, v.closeError),
        el("section", {}, el("h3", {}, "Comments"), v.comments, v.commentInput, v.post, v.postError),
        el("section", {}, el("h3", {}, "Labels"), v.labels, v.labelInput, v.addLabel, v.labelError),
        el("section", {}, el("h3", {}, "Related help"), v.related)
      )
    );
    return v;
  }

  function loadIssue(s: Selection): void {
    s.issue = { status: "loading" };
    renderIssue(s);
    fetchIssue(s.id).then(
      issue => {
        if (!isCurrent(s)) return;
        s.issue = { status: "ok", value: issue };
        renderIssue(s);
        if (issue) startRelated(s);
      },
      e => {
        if (!isCurrent(s)) return;
        s.issue = { status: "error", message: errorMessage(e) };
        renderIssue(s);
      }
    );
  }

  function loadComments(s: Selection): void {
    s.comments = { status: "loading" };
    renderComments(s);
    fetchComments(s.id).then(
      notes => {
        if (!isCurrent(s)) return;
        s.comments = { status: "ok", value: notes };
        renderComments(s);
      },
      e => {
        if (!isCurrent(s)) return;
        s.comments = { status: "error", message: errorMessage(e) };
        renderComments(s);
      }
    );
  }

  function loadLabels(s: Selection): void {
    s.labels = { status: "loading" };
    renderLabels(s);
    fetchLabels(s.id).then(
      labels => {
        if (!isCurrent(s)) return;
        s.labels = { status: "ok", value: labels };
        renderLabels(s);
      },
      e => {
        if (!isCurrent(s)) return;
        s.labels = { status: "error", message: errorMessage(e) };
        renderLabels(s);
      }
    );
  }

  /** Searches for the loaded issue's title, once per selection. */
  function startRelated(s: Selection): void {
    const issue = okIssueOf(s);
    if (!issue || s.related) return;
    const related: { query: string; hits: Loadable<Hit[]> } = { query: issue.title, hits: { status: "loading" } };
    s.related = related;
    renderRelated(s);
    search(issue.title).then(
      hits => {
        if (!isCurrent(s)) return;
        related.hits = { status: "ok", value: hits };
        renderRelated(s);
      },
      e => {
        if (!isCurrent(s)) return;
        related.hits = { status: "error", message: errorMessage(e) };
        renderRelated(s);
      }
    );
  }

  function startRename(s: Selection, v: DetailView): void {
    const title = v.title.value.trim();
    if (title === "") return;
    const id = s.id;
    const before = okIssueOf(s)?.title ?? findRow(id)?.title;
    s.errors.rename = null;
    setTitle(id, title);
    renderRows();
    renderIssue(s);
    renderErrors(s);
    renameIssue(id, title).then(
      result => {
        if (!alive) return;
        setTitle(id, result.title);
        renderRows();
        renderIssue(s);
      },
      e => {
        if (!alive) return;
        if (before !== undefined) setTitle(id, before);
        renderRows();
        renderIssue(s);
        s.errors.rename = `rename error: ${errorMessage(e)}`;
        renderErrors(s);
      }
    );
  }

  function startPost(s: Selection, v: DetailView): void {
    const author = currentUser();
    const text = v.commentInput.value.trim();
    if (author === "" || text === "") return;
    const post: Post = { author, text, sent: false };
    s.posts.push(post);
    s.errors.post = null;
    v.commentInput.value = "";
    renderComments(s);
    renderErrors(s);
    addComment(s.id, author, text).then(
      () => {
        if (!alive) return;
        post.sent = true;
        renderComments(s);
      },
      e => {
        if (!alive) return;
        s.posts = s.posts.filter(p => p !== post);
        s.errors.post = `post error: ${errorMessage(e)}`;
        renderComments(s);
        renderErrors(s);
      }
    );
  }

  function startAddLabel(s: Selection, v: DetailView): void {
    const loaded = s.labels;
    if (loaded.status !== "ok") return;
    const labels = loaded.value;
    const label = v.labelInput.value.trim();
    if (label === "" || labels.includes(label)) return;
    labels.push(label);
    v.labelInput.value = "";
    s.errors.label = null;
    renderLabels(s);
    renderErrors(s);
    addLabel(s.id, label).then(
      () => undefined,
      e => {
        if (!alive) return;
        const at = labels.lastIndexOf(label);
        if (at >= 0) labels.splice(at, 1);
        s.errors.label = `label error: ${errorMessage(e)}`;
        renderLabels(s);
        renderErrors(s);
      }
    );
  }

  function startRemoveLabel(s: Selection, label: string): void {
    const loaded = s.labels;
    if (loaded.status !== "ok") return;
    const labels = loaded.value;
    const at = labels.indexOf(label);
    if (at < 0) return;
    labels.splice(at, 1);
    s.errors.label = null;
    renderLabels(s);
    renderErrors(s);
    removeLabel(s.id, label).then(
      () => undefined,
      e => {
        if (!alive) return;
        labels.splice(Math.min(at, labels.length), 0, label);
        s.errors.label = `label error: ${errorMessage(e)}`;
        renderLabels(s);
        renderErrors(s);
      }
    );
  }

  // ---- rendering of the detail ----

  function renderIssue(s: Selection): void {
    const v = viewOf(s);
    if (!v) return;
    const issue = s.issue;
    v.issue.hidden = true;
    if (issue.status === "loading") {
      v.status.textContent = `loading #${s.id}`;
    } else if (issue.status === "error") {
      v.status.textContent = `detail error: ${issue.message}`;
    } else if (issue.value === null) {
      v.status.textContent = `detail error: issue #${s.id} not found`;
    } else {
      v.status.textContent = "";
      v.heading.textContent = `#${issue.value.id} ${issue.value.title}`;
      v.body.textContent = issue.value.body;
      v.issue.hidden = false;
    }
  }

  function renderErrors(s: Selection): void {
    const v = viewOf(s);
    if (!v) return;
    v.assignError.textContent = s.errors.assign ?? "";
    v.renameError.textContent = s.errors.rename ?? "";
    v.closeError.textContent = s.errors.close ?? "";
    v.postError.textContent = s.errors.post ?? "";
    v.labelError.textContent = s.errors.label ?? "";
  }

  function renderComments(s: Selection): void {
    const v = viewOf(s);
    if (!v) return;
    const nodes: HTMLElement[] = [];
    const loaded = s.comments;
    if (loaded.status === "loading") {
      nodes.push(el("p", {}, "loading comments"));
    } else if (loaded.status === "error") {
      nodes.push(el("p", { class: "error" }, `comments error: ${loaded.message}`));
    } else {
      for (const note of loaded.value) nodes.push(el("p", { "data-testid": "comment" }, `${note.author}: ${note.text}`));
    }
    for (const post of s.posts) {
      const text = post.sent ? `${post.author}: ${post.text}` : `${post.author}: ${post.text} (sending…)`;
      nodes.push(el("p", { "data-testid": "comment" }, text));
    }
    v.comments.replaceChildren(...nodes);
  }

  function renderLabels(s: Selection): void {
    const v = viewOf(s);
    if (!v) return;
    const loaded = s.labels;
    if (loaded.status === "loading") {
      v.labels.replaceChildren(el("p", {}, "loading labels"));
      return;
    }
    if (loaded.status === "error") {
      v.labels.replaceChildren(el("p", { class: "error" }, `labels error: ${loaded.message}`));
      return;
    }
    v.labels.replaceChildren(
      ...loaded.value.map(label => {
        const remove = el("button", { type: "button", "data-testid": "remove-label" }, `remove ${label}`);
        remove.addEventListener("click", () => startRemoveLabel(s, label));
        return el("div", { class: "chip" }, el("span", { "data-testid": "label" }, label), remove);
      })
    );
  }

  function renderRelated(s: Selection): void {
    const v = viewOf(s);
    if (!v) return;
    const related = s.related;
    if (!related) {
      v.related.replaceChildren();
      return;
    }
    const { query, hits } = related;
    if (hits.status === "loading") {
      v.related.replaceChildren(el("p", {}, "finding related help"));
    } else if (hits.status === "error") {
      v.related.replaceChildren(el("p", { class: "error" }, `related help failed: ${hits.message}`));
    } else if (hits.value.length === 0) {
      v.related.replaceChildren(el("p", {}, "no related help"));
    } else {
      v.related.replaceChildren(
        ...hits.value.slice(0, 3).map(hit => {
          const button = el("button", { type: "button", "data-testid": "related-hit" }, hit.name);
          button.addEventListener("click", () => shell.openHelp({ query, hitId: hit.id }));
          return button;
        })
      );
    }
  }

  // ---- mount ----

  openFilter.addEventListener("click", () => setFilter("open"));
  closedFilter.addEventListener("click", () => setFilter("closed"));
  userInput.addEventListener("input", () => renderUser());

  root.replaceChildren(
    el(
      "section",
      { class: "page issues-page" },
      el(
        "div",
        { class: "toolbar" },
        el("label", { class: "field" }, "Current user", userInput),
        el("div", { class: "filters" }, openFilter, closedFilter)
      ),
      rowErrorEl,
      el(
        "div",
        { class: "split" },
        el("div", { class: "pane list-pane" }, listEl),
        el("div", { class: "pane detail-pane" }, detailEl)
      )
    )
  );
  detailEl.replaceChildren(el("p", {}, "select an issue"));
  loadList();

  return {
    destroy(): void {
      alive = false;
    },
  };
}
