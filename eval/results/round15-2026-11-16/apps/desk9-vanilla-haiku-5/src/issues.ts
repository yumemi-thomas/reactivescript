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
import type { Hit } from "./api.js";
import { button, div, errorMessage, field, h2, li, p, section, span, ul } from "./dom.js";
import type { OpenIssues } from "./open-count.js";

type Filter = "open" | "closed";

interface Row {
  id: number;
  title: string;
  assignee: string | null;
}

interface Entry {
  author: string;
  text: string;
  sending: boolean;
}

type DetailState =
  | { kind: "loading" }
  | { kind: "ok" }
  | { kind: "missing" }
  | { kind: "error"; message: string };

type CommentsState =
  | { kind: "loading" }
  | { kind: "ok"; items: Entry[] }
  | { kind: "error"; message: string };

type LabelsState =
  | { kind: "loading" }
  | { kind: "ok"; items: string[] }
  | { kind: "error"; message: string };

type RelatedState =
  | { kind: "idle" }
  | { kind: "loading"; query: string }
  | { kind: "ok"; query: string; hits: Hit[] }
  | { kind: "error"; message: string };

/** the elements of the detail pane for the selected issue; rebuilt on every selection */
interface DetailEls {
  status: HTMLParagraphElement;
  view: HTMLDivElement;
  retry: HTMLButtonElement;
  assign: HTMLButtonElement;
  assignError: HTMLParagraphElement;
  title: HTMLInputElement;
  rename: HTMLButtonElement;
  renameError: HTMLParagraphElement;
  close: HTMLButtonElement;
  closeError: HTMLParagraphElement;
  comments: HTMLDivElement;
  commentInput: HTMLInputElement;
  post: HTMLButtonElement;
  postError: HTMLParagraphElement;
  labels: HTMLDivElement;
  labelInput: HTMLInputElement;
  addLabel: HTMLButtonElement;
  labelError: HTMLParagraphElement;
  related: HTMLDivElement;
}

/** The issues page. Leaving it discards it; answers that arrive afterwards are ignored. */
export function mountIssues(
  host: HTMLElement,
  counter: OpenIssues,
  openHelp: (query: string, hitId: number) => void,
): () => void {
  const page = new IssuesPage(host, counter, openHelp);
  page.start();
  return () => page.dispose();
}

class IssuesPage {
  private readonly host: HTMLElement;
  private readonly counter: OpenIssues;
  private readonly openHelp: (query: string, hitId: number) => void;

  private alive = true;
  private filter: Filter = "open";
  private listSeq = 0;
  private listLoading = true;
  private listError: string | null = null;
  private rows: Row[] = [];

  private selected: number | null = null;
  /** bumps on every selection; answers for an older token are ignored */
  private token = 0;
  private d: DetailEls | null = null;
  private detail: DetailState = { kind: "loading" };
  private title = "";
  private body = "";
  private comments: CommentsState = { kind: "loading" };
  private labels: LabelsState = { kind: "loading" };
  private labelOps = 0;
  private related: RelatedState = { kind: "idle" };

  private rowError: string | null = null;
  private assignError: string | null = null;
  private renameError: string | null = null;
  private closeError: string | null = null;
  private postError: string | null = null;
  private labelError: string | null = null;

  private readonly userInput: HTMLInputElement;
  private readonly filterOpen: HTMLButtonElement;
  private readonly filterClosed: HTMLButtonElement;
  private readonly listEl: HTMLDivElement;
  private readonly rowErrorEl: HTMLParagraphElement;
  private readonly detailEl: HTMLElement;

  constructor(host: HTMLElement, counter: OpenIssues, openHelp: (query: string, hitId: number) => void) {
    this.host = host;
    this.counter = counter;
    this.openHelp = openHelp;
    this.userInput = field("user", "guest", () => this.onUserInput(), { "aria-label": "Current user" });
    this.filterOpen = button("Open", () => this.setFilter("open"), { test: "filter-open" });
    this.filterClosed = button("Closed", () => this.setFilter("closed"), { test: "filter-closed" });
    this.listEl = div({ test: "list" });
    this.rowErrorEl = p({ test: "row-error" });
    this.detailEl = section({ test: "detail" });
  }

  start(): void {
    this.counter.activate(true);
    this.detailEl.replaceChildren(p({ text: "select an issue" }));
    this.host.replaceChildren(
      div({ test: "issues-page" }, [
        div({}, [span({ text: "Current user" }), this.userInput]),
        div({}, [this.filterOpen, this.filterClosed]),
        this.listEl,
        this.rowErrorEl,
        this.detailEl,
      ]),
    );
    this.renderFilters();
    this.loadList();
  }

  dispose(): void {
    this.alive = false;
    this.counter.activate(false);
  }

  private me(): string {
    return this.userInput.value.trim();
  }

  private onUserInput(): void {
    this.renderControlLabels();
    this.renderList();
  }

  // ---- list ---------------------------------------------------------------

  private setFilter(filter: Filter): void {
    this.filter = filter;
    this.loadList();
  }

  private loadList(): void {
    const seq = ++this.listSeq;
    const filter = this.filter;
    this.listLoading = true;
    this.listError = null;
    this.renderFilters();
    this.renderList();
    fetchIssues(filter).then(
      (issues) => {
        if (!this.alive || seq !== this.listSeq) return;
        this.listLoading = false;
        this.rows = issues.map((issue) => ({ id: issue.id, title: issue.title, assignee: issue.assignee }));
        if (filter === "open") this.counter.loaded(issues.map((issue) => issue.id));
        this.renderList();
      },
      (e: unknown) => {
        if (!this.alive || seq !== this.listSeq) return;
        this.listLoading = false;
        this.listError = errorMessage(e);
        this.renderList();
      },
    );
  }

  private visibleRows(): Row[] {
    return this.filter === "open" ? this.rows.filter((row) => !this.counter.isHidden(row.id)) : this.rows;
  }

  private renderFilters(): void {
    this.filterOpen.setAttribute("aria-pressed", String(this.filter === "open"));
    this.filterClosed.setAttribute("aria-pressed", String(this.filter === "closed"));
  }

  private renderList(): void {
    if (!this.alive) return;
    if (this.listLoading) {
      this.listEl.textContent = `loading ${this.filter} issues`;
      return;
    }
    if (this.listError !== null) {
      this.listEl.textContent = `list error: ${this.listError}`;
      return;
    }
    const me = this.me();
    this.listEl.replaceChildren(ul({}, this.visibleRows().map((row) => this.rowEl(row, me))));
  }

  private rowEl(row: Row, me: string): HTMLLIElement {
    const items: HTMLElement[] = [
      button(`#${row.id} ${row.title} (${row.assignee ?? "unassigned"})`, () => this.select(row.id), {
        test: "issue",
        current: this.selected === row.id,
      }),
      button(`assign to ${me}`, () => this.rowAssign(row.id), { test: "row-assign" }),
    ];
    if (this.filter === "open") {
      items.push(button("close", () => this.rowClose(row.id), { test: "row-close" }));
    }
    return li({}, items);
  }

  private renderRowError(): void {
    if (!this.alive) return;
    this.rowErrorEl.textContent = this.rowError ?? "";
  }

  private rowAssign(id: number): void {
    const user = this.me();
    if (user === "") return;
    this.rowError = null;
    this.renderRowError();
    this.assignOne(id, user).then((message) => {
      if (message === null || !this.alive) return;
      this.rowError = `row error: ${message}`;
      this.renderRowError();
    });
  }

  private rowClose(id: number): void {
    this.rowError = null;
    this.renderRowError();
    this.closeOne(id).then((message) => {
      if (message === null || !this.alive) return;
      this.rowError = `row error: ${message}`;
      this.renderRowError();
    });
  }

  /** shows the new assignee at once; resolves with the server's message when it declines */
  private assignOne(id: number, user: string): Promise<string | null> {
    const row = this.rows.find((r) => r.id === id);
    const before = row ? row.assignee : null;
    if (row) row.assignee = user;
    this.renderList();
    return assign(id, user).then(
      () => null,
      (e: unknown) => {
        if (row && row.assignee === user) row.assignee = before;
        this.renderList();
        return errorMessage(e);
      },
    );
  }

  /** hides the row at once; resolves with the server's message when it declines */
  private closeOne(id: number): Promise<string | null> {
    this.counter.hide(id);
    this.renderList();
    return closeIssue(id).then(
      () => null,
      (e: unknown) => {
        this.counter.restore(id);
        this.renderList();
        return errorMessage(e);
      },
    );
  }

  // ---- selection and detail ----------------------------------------------

  private select(id: number): void {
    this.token += 1;
    const token = this.token;
    this.selected = id;
    this.detail = { kind: "loading" };
    this.title = "";
    this.body = "";
    this.comments = { kind: "loading" };
    this.labels = { kind: "loading" };
    this.labelOps = 0;
    this.related = { kind: "idle" };
    this.assignError = null;
    this.renameError = null;
    this.closeError = null;
    this.postError = null;
    this.labelError = null;
    this.buildDetail();
    this.renderList();
    this.loadDetail(id, token);

    fetchComments(id).then(
      (list) => {
        if (!this.current(token)) return;
        this.comments = { kind: "ok", items: list.map((c) => ({ author: c.author, text: c.text, sending: false })) };
        this.renderComments();
      },
      (e: unknown) => {
        if (!this.current(token)) return;
        this.comments = { kind: "error", message: errorMessage(e) };
        this.renderComments();
      },
    );

    fetchLabels(id).then(
      (names) => {
        if (!this.current(token)) return;
        this.labels = { kind: "ok", items: [...names] };
        this.renderLabels();
      },
      (e: unknown) => {
        if (!this.current(token)) return;
        this.labels = { kind: "error", message: errorMessage(e) };
        this.renderLabels();
      },
    );
  }

  private current(token: number): boolean {
    return this.alive && token === this.token;
  }

  private buildDetail(): void {
    const d: DetailEls = {
      status: p({ test: "detail-status" }),
      view: div({ test: "issue-view" }),
      retry: button("retry", () => this.retry(), { test: "retry" }),
      assign: button("", () => this.assignSelected(), { test: "assign" }),
      assignError: p({ test: "assign-error" }),
      title: field("title-input", ""),
      rename: button("rename", () => this.renameSelected(), { test: "rename" }),
      renameError: p({ test: "rename-error" }),
      close: button("close", () => this.closeSelected(), { test: "close" }),
      closeError: p({ test: "close-error" }),
      comments: div({ test: "comments" }),
      commentInput: field("comment-input", ""),
      post: button("post", () => this.postComment(), { test: "post" }),
      postError: p({ test: "post-error" }),
      labels: div({ test: "labels" }),
      labelInput: field("label-input", ""),
      addLabel: button("add label", () => this.addLabelFromInput(), { test: "add-label" }),
      labelError: p({ test: "label-error" }),
      related: div({ test: "related" }),
    };
    this.d = d;
    this.detailEl.replaceChildren(
      div({}, [d.status, d.retry]),
      d.view,
      div({}, [d.assign, d.assignError]),
      div({}, [d.title, d.rename, d.renameError]),
      div({}, [d.close, d.closeError]),
      d.comments,
      div({}, [d.commentInput, d.post, d.postError]),
      d.labels,
      div({}, [d.labelInput, d.addLabel, d.labelError]),
      d.related,
    );
    this.renderAll();
  }

  private loadDetail(id: number, token: number): void {
    this.detail = { kind: "loading" };
    this.renderDetailView();
    fetchIssue(id).then(
      (issue) => {
        if (!this.current(token)) return;
        if (issue === null) {
          this.detail = { kind: "missing" };
        } else {
          this.detail = { kind: "ok" };
          this.title = issue.title;
          this.body = issue.body;
        }
        this.renderDetailView();
        if (issue !== null) this.loadRelated(issue.title, token);
      },
      (e: unknown) => {
        if (!this.current(token)) return;
        this.detail = { kind: "error", message: errorMessage(e) };
        this.renderDetailView();
      },
    );
  }

  private retry(): void {
    if (this.selected === null) return;
    this.loadDetail(this.selected, this.token);
  }

  private loadRelated(query: string, token: number): void {
    if (this.related.kind !== "idle") return;
    this.related = { kind: "loading", query };
    this.renderRelated();
    search(query).then(
      (hits) => {
        if (!this.current(token)) return;
        this.related = { kind: "ok", query, hits };
        this.renderRelated();
      },
      (e: unknown) => {
        if (!this.current(token)) return;
        this.related = { kind: "error", message: errorMessage(e) };
        this.renderRelated();
      },
    );
  }

  private assignSelected(): void {
    const id = this.selected;
    const user = this.me();
    if (id === null || user === "") return;
    const token = this.token;
    this.assignError = null;
    this.renderDetailErrors();
    this.assignOne(id, user).then((message) => {
      if (message === null || !this.current(token)) return;
      this.assignError = `assign error: ${message}`;
      this.renderDetailErrors();
    });
  }

  private renameSelected(): void {
    const id = this.selected;
    const d = this.d;
    if (id === null || d === null) return;
    const title = d.title.value.trim();
    if (title === "") return;
    const token = this.token;
    const row = this.rows.find((r) => r.id === id);
    const rowBefore = row ? row.title : null;
    const titleBefore = this.title;
    this.renameError = null;
    if (row) row.title = title;
    this.title = title;
    this.renderDetailView();
    this.renderList();
    this.renderDetailErrors();
    renameIssue(id, title).then(
      () => undefined,
      (e: unknown) => {
        if (row && rowBefore !== null && row.title === title) row.title = rowBefore;
        this.renderList();
        if (!this.current(token)) return;
        this.title = titleBefore;
        this.renameError = `rename error: ${errorMessage(e)}`;
        this.renderDetailView();
        this.renderDetailErrors();
      },
    );
  }

  private closeSelected(): void {
    const id = this.selected;
    if (id === null) return;
    const token = this.token;
    this.closeError = null;
    this.renderDetailErrors();
    this.closeOne(id).then((message) => {
      if (message === null || !this.current(token)) return;
      this.closeError = `close error: ${message}`;
      this.renderDetailErrors();
    });
  }

  private postComment(): void {
    const id = this.selected;
    const d = this.d;
    const author = this.me();
    if (id === null || d === null || this.comments.kind !== "ok") return;
    const text = d.commentInput.value.trim();
    if (text === "" || author === "") return;
    const token = this.token;
    const entry: Entry = { author, text, sending: true };
    this.comments.items.push(entry);
    d.commentInput.value = "";
    this.postError = null;
    this.renderComments();
    this.renderDetailErrors();
    addComment(id, author, text).then(
      () => {
        if (!this.current(token)) return;
        entry.sending = false;
        this.renderComments();
      },
      (e: unknown) => {
        if (!this.current(token)) return;
        this.removeEntry(entry);
        this.postError = `post error: ${errorMessage(e)}`;
        this.renderComments();
        this.renderDetailErrors();
      },
    );
  }

  private removeEntry(entry: Entry): void {
    if (this.comments.kind !== "ok") return;
    const index = this.comments.items.indexOf(entry);
    if (index >= 0) this.comments.items.splice(index, 1);
  }

  private labelItems(): string[] | null {
    return this.labels.kind === "ok" ? this.labels.items : null;
  }

  private addLabelFromInput(): void {
    const id = this.selected;
    const d = this.d;
    if (id === null || d === null || this.labels.kind !== "ok") return;
    const label = d.labelInput.value.trim();
    if (label === "" || this.labels.items.includes(label)) return;
    const token = this.token;
    this.labels.items.push(label);
    d.labelInput.value = "";
    this.labelError = null;
    this.labelOps += 1;
    this.renderLabels();
    this.renderDetailErrors();
    addLabel(id, label).then(
      (answer) => {
        if (!this.current(token)) return;
        this.labelOps -= 1;
        if (this.labelOps === 0) this.labels = { kind: "ok", items: [...answer] };
        this.renderLabels();
      },
      (e: unknown) => {
        if (!this.current(token)) return;
        this.labelOps -= 1;
        const items = this.labelItems();
        if (items !== null) {
          const index = items.lastIndexOf(label);
          if (index >= 0) items.splice(index, 1);
        }
        this.labelError = `label error: ${errorMessage(e)}`;
        this.renderLabels();
        this.renderDetailErrors();
      },
    );
  }

  private removeLabelAt(label: string): void {
    const id = this.selected;
    const items = this.labelItems();
    if (id === null || items === null) return;
    const index = items.indexOf(label);
    if (index < 0) return;
    const token = this.token;
    items.splice(index, 1);
    this.labelError = null;
    this.labelOps += 1;
    this.renderLabels();
    this.renderDetailErrors();
    removeLabel(id, label).then(
      (answer) => {
        if (!this.current(token)) return;
        this.labelOps -= 1;
        if (this.labelOps === 0) this.labels = { kind: "ok", items: [...answer] };
        this.renderLabels();
      },
      (e: unknown) => {
        if (!this.current(token)) return;
        this.labelOps -= 1;
        const now = this.labelItems();
        if (now !== null) now.splice(Math.min(index, now.length), 0, label);
        this.labelError = `label error: ${errorMessage(e)}`;
        this.renderLabels();
        this.renderDetailErrors();
      },
    );
  }

  // ---- rendering of the detail ------------------------------------------

  private renderAll(): void {
    this.renderDetailView();
    this.renderControlLabels();
    this.renderDetailErrors();
    this.renderComments();
    this.renderLabels();
    this.renderRelated();
  }

  private renderDetailView(): void {
    const d = this.d;
    if (d === null || this.selected === null || !this.alive) return;
    const id = this.selected;
    const state = this.detail;
    if (state.kind === "ok") {
      d.status.textContent = "";
      d.view.replaceChildren(h2({ text: `#${id} ${this.title}` }), p({ text: this.body }));
      return;
    }
    d.view.replaceChildren();
    if (state.kind === "loading") {
      d.status.textContent = `loading #${id}`;
    } else if (state.kind === "missing") {
      d.status.textContent = `detail error: issue #${id} not found`;
    } else {
      d.status.textContent = `detail error: ${state.message}`;
    }
  }

  private renderControlLabels(): void {
    if (this.d !== null) this.d.assign.textContent = `assign to ${this.me()}`;
  }

  private renderDetailErrors(): void {
    const d = this.d;
    if (d === null || !this.alive) return;
    d.assignError.textContent = this.assignError ?? "";
    d.renameError.textContent = this.renameError ?? "";
    d.closeError.textContent = this.closeError ?? "";
    d.postError.textContent = this.postError ?? "";
    d.labelError.textContent = this.labelError ?? "";
  }

  private renderComments(): void {
    const d = this.d;
    if (d === null || !this.alive) return;
    const c = this.comments;
    d.post.disabled = c.kind !== "ok";
    if (c.kind === "loading") {
      d.comments.textContent = "loading comments";
      return;
    }
    if (c.kind === "error") {
      d.comments.textContent = `comments error: ${c.message}`;
      return;
    }
    d.comments.replaceChildren(
      ul(
        {},
        c.items.map((entry) =>
          li({ test: "comment", text: `${entry.author}: ${entry.text}${entry.sending ? " (sending…)" : ""}` }),
        ),
      ),
    );
  }

  private renderLabels(): void {
    const d = this.d;
    if (d === null || !this.alive) return;
    const l = this.labels;
    d.addLabel.disabled = l.kind !== "ok";
    if (l.kind === "loading") {
      d.labels.textContent = "loading labels";
      return;
    }
    if (l.kind === "error") {
      d.labels.textContent = `labels error: ${l.message}`;
      return;
    }
    d.labels.replaceChildren(
      ul(
        {},
        l.items.map((name) =>
          li({}, [
            span({ test: "label", text: name }),
            button(`remove ${name}`, () => this.removeLabelAt(name), { test: "remove-label" }),
          ]),
        ),
      ),
    );
  }

  private renderRelated(): void {
    const d = this.d;
    if (d === null || !this.alive) return;
    const r = this.related;
    if (r.kind === "idle") {
      d.related.textContent = "";
      return;
    }
    if (r.kind === "loading") {
      d.related.textContent = "finding related help";
      return;
    }
    if (r.kind === "error") {
      d.related.textContent = `related help failed: ${r.message}`;
      return;
    }
    if (r.hits.length === 0) {
      d.related.textContent = "no related help";
      return;
    }
    const query = r.query;
    d.related.replaceChildren(
      ...r.hits
        .slice(0, 3)
        .map((hit) => button(hit.name, () => this.openHelp(query, hit.id), { test: "related-hit" })),
    );
  }
}
