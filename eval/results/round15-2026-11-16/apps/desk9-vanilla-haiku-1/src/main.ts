import {
  addComment,
  addLabel,
  assign,
  closeIssue,
  fetchComments,
  fetchIssue,
  fetchIssues,
  fetchItem,
  fetchLabels,
  loadSettings,
  removeLabel,
  renameIssue,
  saveSettings,
  search,
} from "./api.js";
import type {
  Comment as IssueComment,
  Density,
  Hit,
  Item,
  Settings,
  Theme,
} from "./api.js";

type Page = "issues" | "help" | "settings";
type Filter = "open" | "closed";
type Kid = Node | string | null | undefined | false;

interface Ctx {
  alive: () => boolean;
  openHelp: (query: string, hitId: number) => void;
}

interface HelpPreset {
  query: string;
  hitId: number;
}

type Loaded<T> =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; items: T };

interface IssueRow {
  id: number;
  title: string;
  assignee: string | null;
}

type ReadyList = { status: "ready"; items: IssueRow[] };
type ListView = { status: "loading" } | { status: "error"; message: string } | ReadyList;

type DetailView =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "notfound" }
  | { status: "ready"; issue: { id: number; title: string; body: string } };

interface Post {
  author: string;
  text: string;
  pending: boolean;
}

interface Selection {
  id: number;
  detail: DetailView;
  comments: Loaded<IssueComment[]>;
  posts: Post[];
  labels: Loaded<string[]>;
  related: Loaded<Hit[]> | null;
  errors: {
    assign: string | null;
    rename: string | null;
    close: string | null;
    post: string | null;
    label: string | null;
  };
}

interface Taken {
  list: ReadyList;
  row: IssueRow;
  index: number;
  epoch: number;
}

type ItemView =
  | { status: "none" }
  | { status: "loading" }
  | { status: "ready"; item: Item }
  | { status: "missing" }
  | { status: "failed"; message: string };

type SearchStatus = "idle" | "short" | "searching" | "ready" | "failed";
type LoadState = { status: "loading" } | { status: "error"; message: string } | { status: "ready" };

// ---- small helpers -------------------------------------------------------

interface Props {
  testid?: string;
  cls?: string;
  attrs?: Record<string, string>;
  value?: string;
  on?: Record<string, (ev: Event) => void>;
}

/** Builds an element. Text always goes in as text nodes, never as markup. */
function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Props = {},
  ...kids: Kid[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (props.testid !== undefined) node.setAttribute("data-testid", props.testid);
  if (props.cls !== undefined) node.className = props.cls;
  for (const [name, val] of Object.entries(props.attrs ?? {})) node.setAttribute(name, val);
  if (props.value !== undefined && node instanceof HTMLInputElement) node.value = props.value;
  for (const [type, fn] of Object.entries(props.on ?? {})) node.addEventListener(type, fn);
  for (const kid of kids) {
    if (kid !== null && kid !== undefined && kid !== false) node.append(kid);
  }
  return node;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function inputValue(ev: Event): string {
  return (ev.target as HTMLInputElement).value;
}

function errorLine(message: string | null): Kid {
  return message === null ? null : h("p", { cls: "error" }, message);
}

function formatSettings(s: Settings): string {
  return `${s.name} · ${s.theme} · ${s.density}`;
}

function nameError(name: string): string | null {
  if (name.trim() === "") return "Display name is required";
  if (name.length > 20) return `Display name must be at most 20 characters, not ${name.length}`;
  return null;
}

/**
 * Replaces the page's content and keeps focus and caret in a text input across the
 * rebuild. Does nothing once the page has been left.
 */
function redraw(host: HTMLElement, alive: () => boolean, build: () => HTMLElement): void {
  if (!alive()) return;
  const focused = document.activeElement;
  let focusId: string | null = null;
  let caret: number | null = null;
  if (focused instanceof HTMLInputElement && host.contains(focused)) {
    focusId = focused.getAttribute("data-testid");
    caret = focused.selectionStart;
  }
  host.replaceChildren(build());
  if (focusId !== null) {
    const next = host.querySelector<HTMLInputElement>(`input[data-testid="${focusId}"]`);
    if (next !== null) {
      next.focus();
      if (caret !== null) next.setSelectionRange(caret, caret);
    }
  }
}

// ---- app-level state (the open-issue count outlives the issues page) ----

let tabBar: HTMLElement = document.createElement("nav");
let pageHost: HTMLElement = document.createElement("main");
let activePage: Page | null = null;
let session = 0;
let openCount: number | null = null;
let countEpoch = 0;

function renderTabs(): void {
  const tab = (page: Page, text: string): HTMLElement =>
    h(
      "button",
      {
        testid: `tab-${page}`,
        cls: page === activePage ? "tab active" : "tab",
        attrs: page === activePage ? { type: "button", "aria-current": "page" } : { type: "button" },
        on: { click: () => openPage(page) },
      },
      text,
    );
  tabBar.replaceChildren(
    tab("issues", openCount === null ? "Issues" : `Issues (${openCount})`),
    tab("help", "Help"),
    tab("settings", "Settings"),
  );
}

/** A load of the open list answered: the count follows it. */
function setOpenCount(n: number): void {
  openCount = n;
  countEpoch += 1;
  renderTabs();
}

function countDown(): void {
  if (openCount !== null) {
    openCount -= 1;
    renderTabs();
  }
}

function openPage(page: Page, preset: HelpPreset | null = null): void {
  if (page === activePage && preset === null) return;
  activePage = page;
  const token = ++session;
  const ctx: Ctx = {
    alive: () => session === token,
    openHelp: (query, hitId) => openPage("help", { query, hitId }),
  };
  renderTabs();
  pageHost.replaceChildren();
  if (page === "issues") issuesPage(pageHost, ctx);
  else if (page === "help") helpPage(pageHost, ctx, preset);
  else settingsPage(pageHost, ctx);
}

// ---- issues page ----------------------------------------------------------

function issuesPage(host: HTMLElement, ctx: Ctx): void {
  const alive = ctx.alive;
  const drafts = new Map<string, string>([["user", "guest"]]);
  let filter: Filter = "open";
  let list: ListView = { status: "loading" };
  let rowError: string | null = null;
  let sel: Selection | null = null;

  const draw = (): void => redraw(host, alive, build);

  function fieldValue(id: string): string {
    const el = host.querySelector<HTMLInputElement>(`input[data-testid="${id}"]`);
    if (el !== null) {
      drafts.set(id, el.value);
      return el.value;
    }
    return drafts.get(id) ?? "";
  }

  const user = (): string => fieldValue("user");

  function refreshUserLabels(): void {
    host.querySelectorAll<HTMLElement>("[data-user-label]").forEach((el) => {
      el.textContent = `${el.getAttribute("data-user-label") ?? ""} ${user()}`;
    });
  }

  function build(): HTMLElement {
    return h(
      "section",
      { cls: "page issues" },
      h(
        "div",
        { cls: "toolbar" },
        h(
          "label",
          { cls: "field" },
          "Current user",
          h("input", {
            testid: "user",
            value: drafts.get("user") ?? "",
            attrs: { type: "text", autocomplete: "off" },
            on: {
              input: (ev) => {
                drafts.set("user", inputValue(ev));
                refreshUserLabels();
              },
            },
          }),
        ),
        h("div", { cls: "filters" }, filterButton("open"), filterButton("closed")),
      ),
      h("div", { testid: "list", cls: "list" }, ...listKids()),
      h("p", { testid: "row-error", cls: "error" }, rowError ?? ""),
      h("div", { testid: "detail", cls: "detail" }, ...detailKids()),
    );
  }

  function filterButton(f: Filter): HTMLElement {
    return h(
      "button",
      {
        testid: `filter-${f}`,
        cls: filter === f ? "chip active" : "chip",
        attrs: { type: "button", "aria-pressed": String(filter === f) },
        on: { click: () => setFilter(f) },
      },
      f === "open" ? "Open" : "Closed",
    );
  }

  function setFilter(f: Filter): void {
    if (f === filter) return;
    filter = f;
    loadList();
  }

  function loadList(): void {
    const f = filter;
    const mine: ListView = { status: "loading" };
    list = mine;
    draw();
    fetchIssues(f).then(
      (issues) => {
        if (!alive() || list !== mine) return;
        const ready: ReadyList = {
          status: "ready",
          items: issues.map((i) => ({ id: i.id, title: i.title, assignee: i.assignee })),
        };
        list = ready;
        if (f === "open") setOpenCount(ready.items.length);
        draw();
      },
      (err: unknown) => {
        if (!alive() || list !== mine) return;
        list = { status: "error", message: errorMessage(err) };
        draw();
      },
    );
  }

  function listKids(): Kid[] {
    const l = list;
    if (l.status === "loading") return [h("p", { cls: "status" }, `loading ${filter} issues`)];
    if (l.status === "error") return [h("p", { cls: "error" }, `list error: ${l.message}`)];
    if (l.items.length === 0) return [h("p", { cls: "status" }, `no ${filter} issues`)];
    return [h("ul", { cls: "rows" }, ...l.items.map((r) => rowEl(r)))];
  }

  function rowEl(r: IssueRow): HTMLElement {
    const kids: Kid[] = [
      h(
        "button",
        {
          testid: "issue",
          cls: "issue",
          attrs: { type: "button" },
          on: { click: () => select(r.id) },
        },
        `#${r.id} ${r.title} (${r.assignee ?? "unassigned"})`,
      ),
      h(
        "button",
        {
          testid: "row-assign",
          attrs: { type: "button", "data-user-label": "assign to" },
          on: {
            click: () =>
              assignIssue(r.id, (m) => {
                rowError = m === null ? null : `row error: ${m}`;
              }),
          },
        },
        `assign to ${user()}`,
      ),
    ];
    if (filter === "open") {
      kids.push(
        h(
          "button",
          { testid: "row-close", attrs: { type: "button" }, on: { click: () => closeRow(r) } },
          "close",
        ),
      );
    }
    return h("li", { cls: "row" }, ...kids);
  }

  // Takes an open row out of the list for an optimistic close. Null when the row is not shown.
  function takeOpenRow(id: number): Taken | null {
    const l = list;
    if (l.status !== "ready" || filter !== "open") return null;
    const index = l.items.findIndex((r) => r.id === id);
    if (index < 0) return null;
    const row = l.items[index];
    l.items.splice(index, 1);
    countDown();
    return { list: l, row, index, epoch: countEpoch };
  }

  // Undoes a taken row after the server declined the close.
  function giveBack(t: Taken | null): void {
    if (t === null) return;
    if (list === t.list && !t.list.items.includes(t.row)) {
      t.list.items.splice(Math.min(t.index, t.list.items.length), 0, t.row);
    }
    if (countEpoch === t.epoch && openCount !== null) {
      openCount += 1;
      renderTabs();
    }
  }

  function closeRow(r: IssueRow): void {
    rowError = null;
    const taken = takeOpenRow(r.id);
    draw();
    closeIssue(r.id).then(
      () => {},
      (err: unknown) => {
        giveBack(taken);
        rowError = `row error: ${errorMessage(err)}`;
        draw();
      },
    );
  }

  /** Optimistic assign: the row (if shown) takes the user at once and goes back on a decline. */
  function assignIssue(id: number, setError: (message: string | null) => void): void {
    const who = user();
    if (who.trim() === "") return;
    const l = list;
    const row = l.status === "ready" ? l.items.find((r) => r.id === id) : undefined;
    const before = row === undefined ? null : row.assignee;
    if (row !== undefined) row.assignee = who;
    setError(null);
    draw();
    assign(id, who).then(
      () => {},
      (err: unknown) => {
        if (
          row !== undefined &&
          list === l &&
          l.status === "ready" &&
          l.items.includes(row) &&
          row.assignee === who
        ) {
          row.assignee = before;
        }
        setError(errorMessage(err));
        draw();
      },
    );
  }

  function select(id: number): void {
    const s: Selection = {
      id,
      detail: { status: "loading" },
      comments: { status: "loading" },
      posts: [],
      labels: { status: "loading" },
      related: null,
      errors: { assign: null, rename: null, close: null, post: null, label: null },
    };
    sel = s;
    drafts.set("title-input", "");
    drafts.set("comment-input", "");
    drafts.set("label-input", "");
    loadDetail(s);
    loadComments(s);
    loadLabels(s);
  }

  function loadDetail(s: Selection): void {
    s.detail = { status: "loading" };
    s.related = null;
    draw();
    fetchIssue(s.id).then(
      (issue) => {
        if (sel !== s) return;
        if (issue === null) {
          s.detail = { status: "notfound" };
        } else {
          s.detail = { status: "ready", issue: { id: issue.id, title: issue.title, body: issue.body } };
          loadRelated(s, issue.title);
        }
        draw();
      },
      (err: unknown) => {
        if (sel !== s) return;
        s.detail = { status: "error", message: errorMessage(err) };
        draw();
      },
    );
  }

  function loadRelated(s: Selection, title: string): void {
    const mine: Loaded<Hit[]> = { status: "loading" };
    s.related = mine;
    search(title).then(
      (hits) => {
        if (s.related !== mine || sel !== s) return;
        s.related = { status: "ready", items: hits.slice(0, 3) };
        draw();
      },
      (err: unknown) => {
        if (s.related !== mine || sel !== s) return;
        s.related = { status: "error", message: errorMessage(err) };
        draw();
      },
    );
  }

  function loadComments(s: Selection): void {
    const mine: Loaded<IssueComment[]> = { status: "loading" };
    s.comments = mine;
    draw();
    fetchComments(s.id).then(
      (items) => {
        if (s.comments !== mine || sel !== s) return;
        s.comments = { status: "ready", items };
        draw();
      },
      (err: unknown) => {
        if (s.comments !== mine || sel !== s) return;
        s.comments = { status: "error", message: errorMessage(err) };
        draw();
      },
    );
  }

  function loadLabels(s: Selection): void {
    const mine: Loaded<string[]> = { status: "loading" };
    s.labels = mine;
    draw();
    fetchLabels(s.id).then(
      (items) => {
        if (s.labels !== mine || sel !== s) return;
        s.labels = { status: "ready", items };
        draw();
      },
      (err: unknown) => {
        if (s.labels !== mine || sel !== s) return;
        s.labels = { status: "error", message: errorMessage(err) };
        draw();
      },
    );
  }

  function renameFromDetail(s: Selection): void {
    const title = fieldValue("title-input").trim();
    if (title === "") return;
    const id = s.id;
    const l = list;
    const row = l.status === "ready" ? l.items.find((r) => r.id === id) : undefined;
    const rowBefore = row === undefined ? "" : row.title;
    const detailBefore = s.detail.status === "ready" ? s.detail.issue.title : null;
    s.errors.rename = null;
    if (row !== undefined) row.title = title;
    if (s.detail.status === "ready") s.detail.issue.title = title;
    draw();
    renameIssue(id, title).then(
      () => {},
      (err: unknown) => {
        if (
          row !== undefined &&
          list === l &&
          l.status === "ready" &&
          l.items.includes(row) &&
          row.title === title
        ) {
          row.title = rowBefore;
        }
        if (s.detail.status === "ready" && s.detail.issue.title === title && detailBefore !== null) {
          s.detail.issue.title = detailBefore;
        }
        s.errors.rename = `rename error: ${errorMessage(err)}`;
        draw();
      },
    );
  }

  function closeFromDetail(s: Selection): void {
    s.errors.close = null;
    const taken = takeOpenRow(s.id);
    draw();
    closeIssue(s.id).then(
      () => {},
      (err: unknown) => {
        giveBack(taken);
        s.errors.close = `close error: ${errorMessage(err)}`;
        draw();
      },
    );
  }

  function postComment(s: Selection): void {
    const text = fieldValue("comment-input").trim();
    const author = user();
    if (text === "" || author.trim() === "") return;
    const post: Post = { author, text, pending: true };
    s.posts.push(post);
    s.errors.post = null;
    drafts.set("comment-input", "");
    draw();
    addComment(s.id, author, text).then(
      () => {
        post.pending = false;
        draw();
      },
      (err: unknown) => {
        s.posts = s.posts.filter((p) => p !== post);
        s.errors.post = `post error: ${errorMessage(err)}`;
        draw();
      },
    );
  }

  function addLabelFlow(s: Selection): void {
    const label = fieldValue("label-input").trim();
    const ls = s.labels;
    if (label === "" || ls.status !== "ready") return;
    const items = ls.items;
    if (items.includes(label)) return;
    items.push(label);
    s.errors.label = null;
    drafts.set("label-input", "");
    draw();
    addLabel(s.id, label).then(
      () => {},
      (err: unknown) => {
        const at = items.lastIndexOf(label);
        if (at >= 0) items.splice(at, 1);
        s.errors.label = `label error: ${errorMessage(err)}`;
        draw();
      },
    );
  }

  function removeLabelFlow(s: Selection, label: string): void {
    const ls = s.labels;
    if (ls.status !== "ready") return;
    const items = ls.items;
    const at = items.indexOf(label);
    if (at < 0) return;
    items.splice(at, 1);
    s.errors.label = null;
    draw();
    removeLabel(s.id, label).then(
      () => {},
      (err: unknown) => {
        if (!items.includes(label)) items.splice(Math.min(at, items.length), 0, label);
        s.errors.label = `label error: ${errorMessage(err)}`;
        draw();
      },
    );
  }

  function issueTitle(s: Selection): string {
    return s.detail.status === "ready" ? s.detail.issue.title : "";
  }

  function detailKids(): Kid[] {
    const s = sel;
    if (s === null) return [h("p", { cls: "status" }, "select an issue")];
    const kids: Kid[] = [];
    const d = s.detail;
    if (d.status === "loading") {
      kids.push(h("p", { cls: "status" }, `loading #${s.id}`));
    } else if (d.status === "error") {
      kids.push(h("p", { cls: "error" }, `detail error: ${d.message}`));
    } else if (d.status === "notfound") {
      kids.push(h("p", { cls: "error" }, `detail error: issue #${s.id} not found`));
    } else {
      kids.push(
        h("h2", { cls: "issue-title" }, `#${d.issue.id} ${d.issue.title}`),
        h("p", { cls: "body" }, d.issue.body),
      );
    }
    kids.push(
      h("button", { testid: "retry", attrs: { type: "button" }, on: { click: () => loadDetail(s) } }, "retry"),
    );

    kids.push(
      h(
        "section",
        { cls: "actions" },
        h(
          "button",
          {
            testid: "assign",
            attrs: { type: "button", "data-user-label": "assign to" },
            on: {
              click: () =>
                assignIssue(s.id, (m) => {
                  s.errors.assign = m === null ? null : `assign error: ${m}`;
                }),
            },
          },
          `assign to ${user()}`,
        ),
        errorLine(s.errors.assign),
        h(
          "div",
          { cls: "rename" },
          h("input", {
            testid: "title-input",
            value: drafts.get("title-input") ?? "",
            attrs: { type: "text", "aria-label": "New title" },
            on: {
              input: (ev) => {
                drafts.set("title-input", inputValue(ev));
              },
            },
          }),
          h(
            "button",
            { testid: "rename", attrs: { type: "button" }, on: { click: () => renameFromDetail(s) } },
            "rename",
          ),
        ),
        errorLine(s.errors.rename),
        h(
          "button",
          { testid: "close", attrs: { type: "button" }, on: { click: () => closeFromDetail(s) } },
          "close",
        ),
        errorLine(s.errors.close),
      ),
    );

    kids.push(
      h("h3", {}, "Comments"),
      h("div", { testid: "comments", cls: "comments" }, ...commentKids(s)),
      h(
        "div",
        { cls: "post" },
        h("input", {
          testid: "comment-input",
          value: drafts.get("comment-input") ?? "",
          attrs: { type: "text", "aria-label": "Comment" },
          on: {
            input: (ev) => {
              drafts.set("comment-input", inputValue(ev));
            },
          },
        }),
        h("button", { testid: "post", attrs: { type: "button" }, on: { click: () => postComment(s) } }, "post"),
      ),
      errorLine(s.errors.post),
    );

    kids.push(
      h("h3", {}, "Labels"),
      h("div", { testid: "labels", cls: "labels" }, ...labelKids(s)),
      h(
        "div",
        { cls: "post" },
        h("input", {
          testid: "label-input",
          value: drafts.get("label-input") ?? "",
          attrs: { type: "text", "aria-label": "Label" },
          on: {
            input: (ev) => {
              drafts.set("label-input", inputValue(ev));
            },
          },
        }),
        h("button", { testid: "add-label", attrs: { type: "button" }, on: { click: () => addLabelFlow(s) } }, "add label"),
      ),
      errorLine(s.errors.label),
    );

    if (d.status === "ready" && s.related !== null) {
      kids.push(h("div", { testid: "related", cls: "related" }, ...relatedKids(s, s.related)));
    }
    return kids;
  }

  function commentKids(s: Selection): Kid[] {
    const c = s.comments;
    if (c.status === "loading") return [h("p", { cls: "status" }, "loading comments")];
    if (c.status === "error") return [h("p", { cls: "error" }, `comments error: ${c.message}`)];
    const rows: Kid[] = c.items.map((x) => h("p", { testid: "comment", cls: "comment" }, `${x.author}: ${x.text}`));
    for (const p of s.posts) {
      rows.push(
        h(
          "p",
          { testid: "comment", cls: "comment" },
          `${p.author}: ${p.text}${p.pending ? " (sending…)" : ""}`,
        ),
      );
    }
    return rows;
  }

  function labelKids(s: Selection): Kid[] {
    const l = s.labels;
    if (l.status === "loading") return [h("p", { cls: "status" }, "loading labels")];
    if (l.status === "error") return [h("p", { cls: "error" }, `labels error: ${l.message}`)];
    return l.items.map((name) =>
      h(
        "span",
        { cls: "chip-label" },
        h("span", { testid: "label" }, name),
        h(
          "button",
          {
            testid: "remove-label",
            attrs: { type: "button" },
            on: { click: () => removeLabelFlow(s, name) },
          },
          `remove ${name}`,
        ),
      ),
    );
  }

  function relatedKids(s: Selection, r: Loaded<Hit[]>): Kid[] {
    if (r.status === "loading") return [h("p", { cls: "status" }, "finding related help")];
    if (r.status === "error") return [h("p", { cls: "error" }, `related help failed: ${r.message}`)];
    if (r.items.length === 0) return [h("p", { cls: "status" }, "no related help")];
    return r.items.map((hit) =>
      h(
        "button",
        {
          testid: "related-hit",
          attrs: { type: "button" },
          on: { click: () => ctx.openHelp(issueTitle(s), hit.id) },
        },
        hit.name,
      ),
    );
  }

  loadList();
}

// ---- help page ------------------------------------------------------------

function helpPage(host: HTMLElement, ctx: Ctx, preset: HelpPreset | null): void {
  const alive = ctx.alive;
  let query = preset !== null ? preset.query : "";
  let status: SearchStatus = "idle";
  let shownQuery = "";
  let hits: Hit[] = [];
  let failure = "";
  let selected: number | null = preset !== null ? preset.hitId : null;
  let item: ItemView = { status: "none" };
  let searchTag: object = {};
  let itemTag: object = {};

  const draw = (): void => redraw(host, alive, build);

  function build(): HTMLElement {
    return h(
      "section",
      { cls: "page help" },
      h(
        "label",
        { cls: "field" },
        "Search the help",
        h("input", {
          testid: "query",
          value: query,
          attrs: { type: "search", autocomplete: "off" },
          on: {
            input: (ev) => {
              query = inputValue(ev);
              runSearch(query);
            },
          },
        }),
      ),
      h("div", { testid: "results", cls: "results" }, ...resultsKids()),
      h("div", { testid: "item", cls: "item" }, ...itemKids()),
    );
  }

  function runSearch(q: string): void {
    const tag = {};
    searchTag = tag;
    shownQuery = q;
    failure = "";
    if (q.length < 2) {
      hits = [];
      status = q.length === 0 ? "idle" : "short";
      draw();
      return;
    }
    // Results already on screen stay until the new ones arrive.
    status = "searching";
    draw();
    search(q).then(
      (found) => {
        if (searchTag !== tag || !alive()) return;
        hits = found;
        status = "ready";
        draw();
      },
      (err: unknown) => {
        if (searchTag !== tag || !alive()) return;
        hits = [];
        failure = errorMessage(err);
        status = "failed";
        draw();
      },
    );
  }

  function statusLine(): string | null {
    switch (status) {
      case "idle":
        return null;
      case "short":
        return `too short: ${shownQuery}`;
      case "searching":
        return "searching…";
      case "ready":
        return `${hits.length} results for ${shownQuery}`;
      case "failed":
        return `search failed: ${failure}`;
    }
  }

  function resultsKids(): Kid[] {
    const kids: Kid[] = [];
    const line = statusLine();
    if (line !== null) kids.push(h("p", { cls: "status" }, line));
    kids.push(
      h(
        "ul",
        { cls: "hits" },
        ...hits.map((hit) =>
          h(
            "li",
            {},
            h(
              "button",
              {
                testid: "hit",
                cls: "hit",
                attrs: { type: "button", "aria-pressed": String(hit.id === selected) },
                on: { click: () => loadItem(hit.id) },
              },
              `${hit.id === selected ? "> " : ""}${hit.name}`,
            ),
          ),
        ),
      ),
    );
    return kids;
  }

  function loadItem(id: number): void {
    const tag = {};
    itemTag = tag;
    selected = id;
    item = { status: "loading" };
    draw();
    fetchItem(id).then(
      (found) => {
        if (itemTag !== tag || !alive()) return;
        item = found === null ? { status: "missing" } : { status: "ready", item: found };
        draw();
      },
      (err: unknown) => {
        if (itemTag !== tag || !alive()) return;
        item = { status: "failed", message: errorMessage(err) };
        draw();
      },
    );
  }

  function itemKids(): Kid[] {
    const v = item;
    if (v.status === "none") return [h("p", { cls: "status" }, "pick a result")];
    if (v.status === "loading") return [h("p", { cls: "status" }, "loading…")];
    if (v.status === "ready") {
      return [h("h2", {}, v.item.name), h("p", { cls: "body" }, v.item.blurb)];
    }
    if (v.status === "missing") return [h("p", { cls: "error" }, `item ${selected ?? ""} not found`)];
    const retryId = selected;
    return [
      h("p", { cls: "error" }, `failed: ${v.message}`),
      h(
        "button",
        {
          testid: "retry-item",
          attrs: { type: "button" },
          on: { click: () => { if (retryId !== null) loadItem(retryId); } },
        },
        "retry",
      ),
    ];
  }

  draw();
  if (preset !== null) {
    runSearch(preset.query);
    loadItem(preset.hitId);
  }
}

// ---- settings page --------------------------------------------------------

function settingsPage(host: HTMLElement, ctx: Ctx): void {
  const alive = ctx.alive;
  let loadState: LoadState = { status: "loading" };
  let loadTag: object = {};
  let saved: Settings | null = null;
  let saving: Settings | null = null;
  let saveTag: object = {};
  let saveError = "";
  let draft: Settings = { name: "", theme: "light", density: "comfortable" };

  const draw = (): void => redraw(host, alive, build);

  function build(): HTMLElement {
    const kids: Kid[] = [];
    if (loadState.status === "loading") {
      kids.push(h("p", { testid: "load", cls: "status" }, "Loading settings…"));
    } else if (loadState.status === "error") {
      kids.push(
        h("p", { testid: "load", cls: "error" }, `Could not load settings: ${loadState.message}`),
        h("button", { testid: "retry-load", attrs: { type: "button" }, on: { click: () => load() } }, "Try again"),
      );
    } else {
      kids.push(h("p", { testid: "load", cls: "status" }, ""));
    }
    kids.push(h("p", { testid: "saved", cls: "saved" }, savedText()));
    if (loadState.status === "ready") kids.push(form());
    return h("section", { cls: "page settings" }, ...kids);
  }

  function savedText(): string {
    if (saving !== null) return `Saved: ${formatSettings(saving)} (saving…)`;
    if (saved !== null) return `Saved: ${formatSettings(saved)}`;
    return "";
  }

  function form(): HTMLElement {
    const err = nameError(draft.name);
    const themeButton = (t: Theme, text: string): HTMLElement =>
      h(
        "button",
        {
          testid: `theme-${t}`,
          cls: draft.theme === t ? "chip active" : "chip",
          attrs: { type: "button", "aria-pressed": String(draft.theme === t) },
          on: {
            click: () => {
              draft = { ...draft, theme: t };
              draw();
            },
          },
        },
        text,
      );
    return h(
      "div",
      { cls: "settings-form" },
      h(
        "label",
        { cls: "field" },
        "Display name",
        h("input", {
          testid: "name",
          value: draft.name,
          attrs: { type: "text", autocomplete: "nickname" },
          on: {
            input: (ev) => {
              draft = { ...draft, name: inputValue(ev) };
              draw();
            },
          },
        }),
      ),
      h("p", { testid: "name-count", cls: "hint" }, `${draft.name.length}/20`),
      h("p", { testid: "name-error", cls: "error" }, err ?? ""),
      h("div", { cls: "theme" }, themeButton("light", "Light"), themeButton("dark", "Dark")),
      h(
        "button",
        {
          testid: "density-toggle",
          attrs: { type: "button" },
          on: {
            click: () => {
              const next: Density = draft.density === "compact" ? "comfortable" : "compact";
              draft = { ...draft, density: next };
              draw();
            },
          },
        },
        `Density: ${draft.density}`,
      ),
      h("p", { testid: "preview", cls: "preview" }, `Preview: ${draft.theme} / ${draft.density}`),
      h("button", { testid: "save", attrs: { type: "button" }, on: { click: () => save() } }, "Save"),
      h("p", { testid: "save-error", cls: "error" }, saveError),
    );
  }

  function save(): void {
    if (nameError(draft.name) !== null) return;
    const snapshot: Settings = { ...draft };
    const tag = {};
    saveTag = tag;
    saving = snapshot;
    saveError = "";
    draw();
    saveSettings(snapshot).then(
      (s) => {
        if (saveTag !== tag || !alive()) return;
        saved = s;
        saving = null;
        draw();
      },
      (err: unknown) => {
        if (saveTag !== tag || !alive()) return;
        saving = null;
        saveError = `Save failed: ${errorMessage(err)}`;
        draw();
      },
    );
  }

  function load(): void {
    const tag = {};
    loadTag = tag;
    loadState = { status: "loading" };
    draw();
    loadSettings().then(
      (s) => {
        if (loadTag !== tag || !alive()) return;
        saved = s;
        draft = { ...s };
        loadState = { status: "ready" };
        draw();
      },
      (err: unknown) => {
        if (loadTag !== tag || !alive()) return;
        loadState = { status: "error", message: errorMessage(err) };
        draw();
      },
    );
  }

  load();
}

// ---- entry ----------------------------------------------------------------

const STYLE = `
:root { color-scheme: light dark; --bg: #ffffff; --fg: #1b1f24; --muted: #5b6470; --accent: #2f5fd0; --err: #b42318; --line: #d8dde5; --chip: #eef2f8; }
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) { --bg: #0f1115; --fg: #e8ebf0; --muted: #9aa4b2; --accent: #7aa2ff; --err: #ff8a80; --line: #2e3440; --chip: #1c222d; }
}
:root[data-theme="dark"] { --bg: #0f1115; --fg: #e8ebf0; --muted: #9aa4b2; --accent: #7aa2ff; --err: #ff8a80; --line: #2e3440; --chip: #1c222d; }
body { margin: 0; background: var(--bg); color: var(--fg); font: 15px/1.45 system-ui, sans-serif; }
#app { max-width: 860px; margin: 0 auto; padding: 0 16px; }
.tabs { display: flex; gap: 8px; padding: 12px 0; border-bottom: 1px solid var(--line); flex-wrap: wrap; }
.tab, .chip, .issue, .row button, .actions button, .post button, .related button, .hit, .labels button, .settings-form button, .load button, .item button { font: inherit; }
.tab, .chip, button { background: var(--chip); color: var(--fg); border: 1px solid var(--line); border-radius: 6px; padding: 6px 10px; cursor: pointer; }
.tab.active, .chip.active { border-color: var(--accent); color: var(--accent); }
button:focus-visible, input:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
input { font: inherit; background: var(--bg); color: var(--fg); border: 1px solid var(--line); border-radius: 6px; padding: 6px 8px; max-width: 100%; box-sizing: border-box; }
.page { padding: 16px 0; display: grid; gap: 12px; }
.toolbar, .filters, .actions, .rename, .post, .theme, .labels, .comments { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.field { display: grid; gap: 4px; }
.issues { grid-template-columns: 1fr; }
.list, .detail, .results, .item, .related, .comments, .labels { min-width: 0; }
.rows, .hits { list-style: none; padding: 0; margin: 0; display: grid; gap: 6px; }
.row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.issue { text-align: left; flex: 1 1 260px; }
.detail { border-top: 1px solid var(--line); padding-top: 12px; display: grid; gap: 10px; }
.status { color: var(--muted); margin: 4px 0; }
.error { color: var(--err); margin: 4px 0; }
.hint, .preview, .saved { color: var(--muted); margin: 0; }
.chip-label { display: inline-flex; gap: 4px; align-items: center; }
.body { white-space: pre-wrap; }
@media (max-width: 480px) { .tabs { gap: 6px; } .tab { flex: 1 1 auto; } }
`;

function injectStyles(): void {
  if (document.getElementById("issue-desk-style") !== null) return;
  document.head.append(h("style", { attrs: { id: "issue-desk-style" } }, STYLE));
}

export default function mount(root: HTMLElement): void {
  injectStyles();
  openCount = null;
  countEpoch = 0;
  session = 0;
  activePage = null;
  tabBar = h("nav", { cls: "tabs", attrs: { "aria-label": "Pages" } });
  pageHost = h("main", { cls: "page-host" });
  root.replaceChildren(tabBar, pageHost);
  openPage("issues");
}
