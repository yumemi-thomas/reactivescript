import * as api from "./api.js";
import type { Comment as IssueComment, Hit, Issue, IssueDetail } from "./api.js";
import { type Child, content, errorText, h, watchText } from "./dom.js";
import type { IssueStore, Listing } from "./store.js";

export interface IssuesHooks {
  /** Opens the help page with `query` searched and the hit `id` selected. */
  openHelp(query: string, id: number): void;
}

type Loadable<T> = { state: "loading" } | { state: "ok"; value: T } | { state: "error"; message: string };
type ListStatus = { state: "loading" } | { state: "ok" } | { state: "error"; message: string };

interface Post {
  author: string;
  text: string;
  sending: boolean;
}

interface Errors {
  assign: string | null;
  rename: string | null;
  close: string | null;
  post: string | null;
  label: string | null;
}

interface DetailUi {
  head: HTMLElement;
  errors: HTMLElement;
  assign: HTMLButtonElement;
  titleInput: HTMLInputElement;
  comments: HTMLElement;
  commentInput: HTMLInputElement;
  labels: HTMLElement;
  labelInput: HTMLInputElement;
  related: HTMLElement;
}

/** One selected issue. A new selection is a new object, so late answers for an old one find it stale. */
interface Selection {
  id: number;
  ui: DetailUi;
  detail: Loadable<IssueDetail | null>;
  detailGen: number;
  related: Loadable<Hit[]> | null;
  relatedGen: number;
  comments: Loadable<IssueComment[]>;
  posts: Post[];
  labels: Loadable<string[]>;
  errors: Errors;
}

function labelsOf(sel: Selection): string[] | null {
  return sel.labels.state === "ok" ? sel.labels.value : null;
}

/** The issues page. Discarded when the user leaves it: dispose() makes every later answer a no-op for the page. */
export class IssuesPage {
  private alive = true;
  private filter: Listing = "open";
  private listStatus: ListStatus = { state: "loading" };
  private listGen = 0;
  private rowError: string | null = null;
  private selection: Selection | null = null;
  private readonly store: IssueStore;
  private readonly hooks: IssuesHooks;
  private readonly userInput: HTMLInputElement;
  private readonly filterButtons: Record<Listing, HTMLButtonElement>;
  private readonly rowErrorEl: HTMLElement;
  private readonly listEl: HTMLElement;
  private readonly detailEl: HTMLElement;
  private readonly unsubscribe: () => void;

  constructor(root: HTMLElement, store: IssueStore, hooks: IssuesHooks) {
    this.store = store;
    this.hooks = hooks;
    this.userInput = h("input", { testid: "user", value: "guest" });
    watchText(this.userInput, () => this.onUserChanged());
    this.filterButtons = {
      open: h("button", { testid: "filter-open", onClick: () => this.setFilter("open") }, "Open"),
      closed: h("button", { testid: "filter-closed", onClick: () => this.setFilter("closed") }, "Closed"),
    };
    this.rowErrorEl = h("p", { testid: "row-error" });
    this.listEl = h("div", { testid: "list" });
    this.detailEl = h("div", { testid: "detail" }, "select an issue");
    root.replaceChildren(
      h(
        "section",
        {},
        h("label", {}, "Current user ", this.userInput),
        h("div", {}, this.filterButtons.open, this.filterButtons.closed),
        this.rowErrorEl,
        h("div", {}, this.listEl, this.detailEl),
      ),
    );
    this.unsubscribe = this.store.subscribe(() => this.renderList());
    this.renderFilters();
    this.loadList();
  }

  dispose(): void {
    this.alive = false;
    this.selection = null;
    this.unsubscribe();
  }

  // ---- the list ----

  private setFilter(filter: Listing): void {
    if (filter === this.filter) return;
    this.filter = filter;
    this.renderFilters();
    this.loadList();
  }

  private loadList(): void {
    const filter = this.filter;
    const gen = ++this.listGen;
    this.listStatus = { state: "loading" };
    this.renderList();
    api.fetchIssues(filter).then(
      (items) => {
        if (!this.alive || gen !== this.listGen) return;
        this.listStatus = { state: "ok" };
        this.store.setList(filter, items);
      },
      (err) => {
        if (!this.alive || gen !== this.listGen) return;
        this.listStatus = { state: "error", message: errorText(err) };
        this.renderList();
      },
    );
  }

  private renderFilters(): void {
    for (const f of ["open", "closed"] as const) {
      this.filterButtons[f].setAttribute("aria-pressed", String(f === this.filter));
    }
  }

  private renderList(): void {
    if (!this.alive) return;
    const status = this.listStatus;
    if (status.state === "loading") {
      this.listEl.replaceChildren(`loading ${this.filter} issues`);
    } else if (status.state === "error") {
      this.listEl.replaceChildren(`list error: ${status.message}`);
    } else {
      const items = (this.filter === "open" ? this.store.visibleOpen() : this.store.listOf("closed")) ?? [];
      this.listEl.replaceChildren(
        items.length === 0 ? `no ${this.filter} issues` : h("ul", {}, ...items.map((i) => this.issueRow(i))),
      );
    }
    this.renderRowError();
  }

  private renderRowError(): void {
    if (!this.alive) return;
    this.rowErrorEl.textContent = this.rowError ?? "";
  }

  private issueRow(issue: Issue): HTMLElement {
    const assignee = issue.assignee ?? "unassigned";
    return h(
      "li",
      {},
      h("button", { testid: "issue", onClick: () => this.select(issue.id) }, `#${issue.id} ${issue.title} (${assignee})`),
      h("button", { testid: "row-assign", onClick: () => this.rowAssign(issue.id) }, this.assignLabel()),
      this.filter === "open" ? h("button", { testid: "row-close", onClick: () => this.rowClose(issue.id) }, "close") : false,
    );
  }

  private user(): string {
    return this.userInput.value.trim();
  }

  private assignLabel(): string {
    return `assign to ${this.user()}`;
  }

  private onUserChanged(): void {
    this.renderList();
    if (this.selection) this.selection.ui.assign.textContent = this.assignLabel();
  }

  private rowAssign(id: number): void {
    const user = this.user();
    if (!user) return;
    this.rowError = null;
    this.assignWith(id, user, (message) => {
      this.rowError = `row error: ${message}`;
      this.renderRowError();
    });
  }

  private rowClose(id: number): void {
    if (this.store.isClosing(id)) return;
    this.rowError = null;
    this.closeWith(id, (message) => {
      this.rowError = `row error: ${message}`;
      this.renderRowError();
    });
  }

  // ---- the shared operations (the row and the detail both use these) ----

  private assignWith(id: number, user: string, onFail: (message: string) => void): void {
    const previous = this.store.assigneeOf(id);
    this.store.patch(id, { assignee: user });
    api.assign(id, user).then(
      (result) => this.store.patch(id, { assignee: result.assignee }),
      (err) => {
        if (previous !== undefined) this.store.patch(id, { assignee: previous });
        onFail(errorText(err));
      },
    );
  }

  private closeWith(id: number, onFail: (message: string) => void): void {
    this.store.beginClose(id);
    api.closeIssue(id).then(
      () => this.store.endClose(id, true),
      (err) => {
        this.store.endClose(id, false);
        onFail(errorText(err));
      },
    );
  }

  // ---- selection and the detail ----

  private select(id: number): void {
    const ui = this.buildDetail();
    const sel: Selection = {
      id,
      ui,
      detail: { state: "loading" },
      detailGen: 0,
      related: null,
      relatedGen: 0,
      comments: { state: "loading" },
      posts: [],
      labels: { state: "loading" },
      errors: { assign: null, rename: null, close: null, post: null, label: null },
    };
    this.selection = sel;
    this.loadDetail(sel);
    this.loadComments(sel);
    this.loadLabels(sel);
  }

  private isCurrent(sel: Selection): boolean {
    return this.alive && this.selection === sel;
  }

  private buildDetail(): DetailUi {
    const ui: DetailUi = {
      head: h("div", {}),
      errors: h("div", {}),
      assign: h("button", { testid: "assign", onClick: () => this.assignFromDetail() }, this.assignLabel()),
      titleInput: h("input", { testid: "title-input", placeholder: "New title" }),
      comments: h("div", { testid: "comments" }),
      commentInput: h("input", { testid: "comment-input", placeholder: "Comment" }),
      labels: h("div", { testid: "labels" }),
      labelInput: h("input", { testid: "label-input", placeholder: "Label" }),
      related: h("div", { testid: "related" }),
    };
    this.detailEl.replaceChildren(
      ui.head,
      h("button", { testid: "retry", onClick: () => this.retryDetail() }, "retry"),
      ui.errors,
      h("div", {}, ui.assign),
      h(
        "div",
        {},
        ui.titleInput,
        h("button", { testid: "rename", onClick: () => this.renameFromDetail() }, "rename"),
        h("button", { testid: "close", onClick: () => this.closeFromDetail() }, "close"),
      ),
      h(
        "div",
        {},
        ui.comments,
        ui.commentInput,
        h("button", { testid: "post", onClick: () => this.postComment() }, "post"),
      ),
      h(
        "div",
        {},
        ui.labels,
        ui.labelInput,
        h("button", { testid: "add-label", onClick: () => this.addLabelFromDetail() }, "add label"),
      ),
      ui.related,
    );
    return ui;
  }

  private retryDetail(): void {
    if (this.selection) this.loadDetail(this.selection);
  }

  private loadDetail(sel: Selection): void {
    const gen = ++sel.detailGen;
    sel.detail = { state: "loading" };
    sel.related = null;
    this.renderHead(sel);
    this.renderRelated(sel);
    api.fetchIssue(sel.id).then(
      (issue) => {
        if (gen !== sel.detailGen) return;
        sel.detail = { state: "ok", value: issue };
        this.renderHead(sel);
        if (issue !== null) this.loadRelated(sel);
      },
      (err) => {
        if (gen !== sel.detailGen) return;
        sel.detail = { state: "error", message: errorText(err) };
        this.renderHead(sel);
      },
    );
  }

  private loadRelated(sel: Selection): void {
    const d = sel.detail;
    if (d.state !== "ok" || d.value === null) return;
    const gen = ++sel.relatedGen;
    sel.related = { state: "loading" };
    this.renderRelated(sel);
    api.search(d.value.title).then(
      (hits) => {
        if (gen !== sel.relatedGen) return;
        sel.related = { state: "ok", value: hits };
        this.renderRelated(sel);
      },
      (err) => {
        if (gen !== sel.relatedGen) return;
        sel.related = { state: "error", message: errorText(err) };
        this.renderRelated(sel);
      },
    );
  }

  private loadComments(sel: Selection): void {
    this.renderComments(sel);
    api.fetchComments(sel.id).then(
      (comments) => {
        sel.comments = { state: "ok", value: comments };
        this.renderComments(sel);
      },
      (err) => {
        sel.comments = { state: "error", message: errorText(err) };
        this.renderComments(sel);
      },
    );
  }

  private loadLabels(sel: Selection): void {
    this.renderLabels(sel);
    api.fetchLabels(sel.id).then(
      (labels) => {
        sel.labels = { state: "ok", value: labels };
        this.renderLabels(sel);
      },
      (err) => {
        sel.labels = { state: "error", message: errorText(err) };
        this.renderLabels(sel);
      },
    );
  }

  private detailTitle(sel: Selection): string | undefined {
    return sel.detail.state === "ok" && sel.detail.value ? sel.detail.value.title : undefined;
  }

  private setDetailTitle(sel: Selection, title: string): void {
    if (sel.detail.state === "ok" && sel.detail.value) {
      sel.detail = { state: "ok", value: { ...sel.detail.value, title } };
      this.renderHead(sel);
    }
  }

  private assignFromDetail(): void {
    const sel = this.selection;
    const user = this.user();
    if (!sel || !user) return;
    sel.errors.assign = null;
    this.renderErrors(sel);
    this.assignWith(sel.id, user, (message) => {
      sel.errors.assign = `assign error: ${message}`;
      this.renderErrors(sel);
    });
  }

  private renameFromDetail(): void {
    const sel = this.selection;
    if (!sel) return;
    const title = sel.ui.titleInput.value.trim();
    if (!title) return;
    const id = sel.id;
    const previous = this.store.titleOf(id) ?? this.detailTitle(sel);
    sel.errors.rename = null;
    this.renderErrors(sel);
    this.store.patch(id, { title });
    this.setDetailTitle(sel, title);
    api.renameIssue(id, title).then(
      (renamed) => {
        this.store.patch(id, { title: renamed.title });
        this.setDetailTitle(sel, renamed.title);
      },
      (err) => {
        if (previous !== undefined) {
          this.store.patch(id, { title: previous });
          this.setDetailTitle(sel, previous);
        }
        sel.errors.rename = `rename error: ${errorText(err)}`;
        this.renderErrors(sel);
      },
    );
  }

  private closeFromDetail(): void {
    const sel = this.selection;
    if (!sel || this.store.isClosing(sel.id)) return;
    sel.errors.close = null;
    this.renderErrors(sel);
    this.closeWith(sel.id, (message) => {
      sel.errors.close = `close error: ${message}`;
      this.renderErrors(sel);
    });
  }

  private postComment(): void {
    const sel = this.selection;
    if (!sel) return;
    const text = sel.ui.commentInput.value.trim();
    const author = this.user();
    if (!text || !author) return;
    sel.ui.commentInput.value = "";
    sel.errors.post = null;
    const post: Post = { author, text, sending: true };
    sel.posts.push(post);
    this.renderComments(sel);
    this.renderErrors(sel);
    api.addComment(sel.id, author, text).then(
      () => {
        post.sending = false;
        this.renderComments(sel);
      },
      (err) => {
        sel.posts = sel.posts.filter((p) => p !== post);
        sel.errors.post = `post error: ${errorText(err)}`;
        this.renderComments(sel);
        this.renderErrors(sel);
      },
    );
  }

  private addLabelFromDetail(): void {
    const sel = this.selection;
    if (!sel) return;
    const label = sel.ui.labelInput.value.trim();
    const current = labelsOf(sel);
    if (!label || current === null || current.includes(label)) return;
    sel.errors.label = null;
    sel.labels = { state: "ok", value: [...current, label] };
    sel.ui.labelInput.value = "";
    this.renderLabels(sel);
    this.renderErrors(sel);
    api.addLabel(sel.id, label).then(
      (answer) => {
        if (labelsOf(sel) !== null) sel.labels = { state: "ok", value: answer };
        this.renderLabels(sel);
      },
      (err) => {
        const now = labelsOf(sel);
        if (now !== null) sel.labels = { state: "ok", value: now.filter((x) => x !== label) };
        sel.errors.label = `label error: ${errorText(err)}`;
        this.renderLabels(sel);
        this.renderErrors(sel);
      },
    );
  }

  private removeLabelFromDetail(sel: Selection, label: string): void {
    const current = labelsOf(sel);
    if (current === null) return;
    const index = current.indexOf(label);
    if (index < 0) return;
    sel.errors.label = null;
    sel.labels = { state: "ok", value: current.filter((_, i) => i !== index) };
    this.renderLabels(sel);
    this.renderErrors(sel);
    api.removeLabel(sel.id, label).then(
      (answer) => {
        if (labelsOf(sel) !== null) sel.labels = { state: "ok", value: answer };
        this.renderLabels(sel);
      },
      (err) => {
        const now = labelsOf(sel);
        if (now !== null && !now.includes(label)) {
          const restored = [...now];
          restored.splice(Math.min(index, restored.length), 0, label);
          sel.labels = { state: "ok", value: restored };
        }
        sel.errors.label = `label error: ${errorText(err)}`;
        this.renderLabels(sel);
        this.renderErrors(sel);
      },
    );
  }

  // ---- rendering of the detail ----

  private renderHead(sel: Selection): void {
    if (!this.isCurrent(sel)) return;
    const d = sel.detail;
    let kids: Child[] = [];
    if (d.state === "loading") kids = [h("p", {}, `loading #${sel.id}`)];
    else if (d.state === "error") kids = [h("p", {}, `detail error: ${d.message}`)];
    else if (d.value === null) kids = [h("p", {}, `detail error: issue #${sel.id} not found`)];
    else kids = [h("h2", {}, `#${sel.id} ${d.value.title}`), h("p", {}, d.value.body)];
    sel.ui.head.replaceChildren(...content(kids));
  }

  private renderErrors(sel: Selection): void {
    if (!this.isCurrent(sel)) return;
    const e = sel.errors;
    const messages = [e.assign, e.rename, e.close, e.post, e.label].filter((m): m is string => m !== null);
    sel.ui.errors.replaceChildren(...messages.map((m) => h("p", {}, m)));
  }

  private renderComments(sel: Selection): void {
    if (!this.isCurrent(sel)) return;
    const c = sel.comments;
    const kids: Child[] = [];
    if (c.state === "loading") kids.push(h("p", {}, "loading comments"));
    else if (c.state === "error") kids.push(h("p", {}, `comments error: ${c.message}`));
    const fetched = c.state === "ok" ? c.value.map((x) => `${x.author}: ${x.text}`) : [];
    const posted = sel.posts.map((p) => `${p.author}: ${p.text}${p.sending ? " (sending…)" : ""}`);
    kids.push(h("ul", {}, ...[...fetched, ...posted].map((line) => h("li", { testid: "comment" }, line))));
    sel.ui.comments.replaceChildren(...content(kids));
  }

  private renderLabels(sel: Selection): void {
    if (!this.isCurrent(sel)) return;
    const l = sel.labels;
    const kids: Child[] = [];
    if (l.state === "loading") {
      kids.push(h("p", {}, "loading labels"));
    } else if (l.state === "error") {
      kids.push(h("p", {}, `labels error: ${l.message}`));
    } else {
      kids.push(
        h(
          "ul",
          {},
          ...l.value.map((label) =>
            h(
              "li",
              {},
              h("span", { testid: "label" }, label),
              " ",
              h("button", { testid: "remove-label", onClick: () => this.removeLabelFromDetail(sel, label) }, `remove ${label}`),
            ),
          ),
        ),
      );
    }
    sel.ui.labels.replaceChildren(...content(kids));
  }

  private renderRelated(sel: Selection): void {
    if (!this.isCurrent(sel)) return;
    const r = sel.related;
    let kids: Child[] = [];
    if (r === null) kids = [];
    else if (r.state === "loading") kids = [h("p", {}, "finding related help")];
    else if (r.state === "error") kids = [h("p", {}, `related help failed: ${r.message}`)];
    else if (r.value.length === 0) kids = [h("p", {}, "no related help")];
    else {
      kids = r.value
        .slice(0, 3)
        .map((hit) => h("button", { testid: "related-hit", onClick: () => this.openRelated(hit) }, hit.name));
    }
    sel.ui.related.replaceChildren(...content(kids));
  }

  private openRelated(hit: Hit): void {
    const sel = this.selection;
    if (!sel) return;
    const title = this.detailTitle(sel) ?? "";
    this.hooks.openHelp(title, hit.id);
  }
}
