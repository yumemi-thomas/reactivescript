import { addCard, addItem, archiveCard, fetchCards, fetchChecklist, moveCard, renameCard, toggleItem } from "./api.js";
import type { Card, Column, Item } from "./api.js";
import { el, messageOf, newKey } from "./dom.js";

const COLUMNS: readonly Column[] = ["todo", "doing", "done"];
const NAMES: Record<Column, string> = { todo: "To do", doing: "Doing", done: "Done" };
const WIP_LIMIT = 3;

type Dir = "left" | "right" | "up" | "down";
type Load = "loading" | "error" | "ok";

/** A card on the board. `id` is null while its add is still at the server. */
interface CardView {
  readonly key: number;
  id: number | null;
  title: string;
  done: number;
  total: number;
  col: Column;
}

/** A checklist row. `id` is null while its add is still at the server. */
interface ItemView {
  readonly key: number;
  id: number | null;
  text: string;
  done: boolean;
}

/** The checklist of the selected card. */
interface Checklist {
  readonly card: CardView;
  status: Load;
  error: string;
  items: ItemView[];
}

interface ColumnState {
  status: Load;
  error: string;
}

interface ColumnView {
  head: HTMLElement;
  status: HTMLElement;
  retry: HTMLButtonElement;
  list: HTMLElement;
  section: HTMLElement;
}

function neighbour(col: Column, step: -1 | 1): Column | null {
  const i = COLUMNS.indexOf(col) + step;
  return i >= 0 && i < COLUMNS.length ? COLUMNS[i] : null;
}

function removeFrom<T>(list: T[], item: T): boolean {
  const i = list.indexOf(item);
  if (i < 0) return false;
  list.splice(i, 1);
  return true;
}

/** Cards with a server id; pending adds always sit below them. */
function realCount(list: { id: number | null }[]): number {
  return list.filter(x => x.id !== null).length;
}

/** Inserts at `index`, never below the pending adds at the bottom of the list. */
function insertAt(list: CardView[], card: CardView, index: number): void {
  let end = list.findIndex(x => x.id === null);
  if (end < 0) end = list.length;
  list.splice(Math.max(0, Math.min(index, end)), 0, card);
}

function cardView(c: Card, col: Column): CardView {
  return { key: newKey(), id: c.id, title: c.title, done: c.done, total: c.total, col };
}

function itemView(i: Item): ItemView {
  return { key: newKey(), id: i.id, text: i.text, done: i.done };
}

/** The board page. Returns the function that discards it. */
export function createBoard(host: HTMLElement): () => void {
  let alive = true;
  const lists: Record<Column, CardView[]> = { todo: [], doing: [], done: [] };
  const columns: Record<Column, ColumnState> = {
    todo: { status: "loading", error: "" },
    doing: { status: "loading", error: "" },
    done: { status: "loading", error: "" },
  };
  let selected: CardView | null = null;
  let check: Checklist | null = null;
  let moveError = "";
  let addError = "";
  let renameError = "";
  let itemError = "";
  let archiveError = "";

  // Static elements. Inputs live here for the life of the page so typing survives re-renders.
  const moveErrEl = el("p", { class: "error", "data-testid": "move-error" });
  const addErrEl = el("p", { class: "error", "data-testid": "add-error" });
  const archiveErrEl = el("p", { class: "error", "data-testid": "archive-error" });

  const newCard = el("input", { type: "text", "data-testid": "new-card", "aria-label": "New card title", placeholder: "New card title" });
  const addCardBtn = el("button", { type: "button", "data-testid": "add-card" }, "add");

  const emptyEl = el("p", { class: "empty" });
  const heading = el("h2", {});
  const where = el("p", { class: "where" });
  const renameInput = el("input", { type: "text", "data-testid": "title-input", "aria-label": "Card title" });
  const renameBtn = el("button", { type: "button", "data-testid": "rename" }, "rename");
  const renameErr = el("p", { class: "error" });
  const archiveBtn = el("button", { type: "button", "data-testid": "archive" }, "archive");
  const checklistEl = el("section", { "data-testid": "checklist" });
  const progressEl = el("p", { "data-testid": "progress", class: "progress" });
  const itemInput = el("input", { type: "text", "data-testid": "item-input", "aria-label": "New checklist item" });
  const itemAddBtn = el("button", { type: "button", "data-testid": "add-item" }, "add item");
  const itemErr = el("p", { class: "error" });
  const selBox = el(
    "div",
    { class: "selected" },
    heading,
    where,
    el("div", { class: "row" }, renameInput, renameBtn),
    renameErr,
    archiveBtn,
    checklistEl,
    progressEl,
    el("div", { class: "row" }, itemInput, itemAddBtn),
    itemErr,
  );
  selBox.hidden = true;
  const detail = el("section", { class: "detail", "data-testid": "detail" }, emptyEl, selBox);

  newCard.addEventListener("keydown", e => { if (e.key === "Enter") addNewCard(); });
  addCardBtn.addEventListener("click", () => addNewCard());
  renameInput.addEventListener("keydown", e => { if (e.key === "Enter") rename(); });
  renameBtn.addEventListener("click", () => rename());
  archiveBtn.addEventListener("click", () => archive());
  itemInput.addEventListener("keydown", e => { if (e.key === "Enter") addChecklistItem(); });
  itemAddBtn.addEventListener("click", () => addChecklistItem());

  /** Fetches one column; used on open and by its retry button. */
  function load(col: Column): void {
    columns[col] = { status: "loading", error: "" };
    render();
    fetchCards(col).then(
      (cards: Card[]) => {
        if (!alive) return;
        lists[col] = cards.map(c => cardView(c, col));
        columns[col] = { status: "ok", error: "" };
        render();
      },
      (err: unknown) => {
        if (!alive) return;
        columns[col] = { status: "error", error: messageOf(err) };
        render();
      },
    );
  }

  /** A column accepts a card only once it has loaded, and Doing only up to the limit. */
  function canEnter(col: Column): boolean {
    if (columns[col].status !== "ok") return false;
    return !(col === "doing" && lists.doing.length >= WIP_LIMIT);
  }

  function moveButton(card: CardView, dir: Dir, disabled: boolean): HTMLButtonElement {
    const btn = el("button", { type: "button", "data-testid": dir, "aria-label": `move ${dir}` }, dir);
    btn.disabled = disabled;
    btn.addEventListener("click", () => move(card, dir));
    return btn;
  }

  function cardRow(col: Column, card: CardView, index: number, cards: CardView[]): HTMLElement {
    const pending = card.id === null;
    const label = pending
      ? `${card.title} (adding…)`
      : `#${card.id} ${card.title} · ${card.done}/${card.total}`;
    const body = el("div", { class: selected === card ? "card selected" : "card", "data-testid": "card" }, label);
    if (!pending) body.addEventListener("click", () => select(card));
    const row = el("li", { class: "card-row" }, body);
    if (!pending) {
      const prev = neighbour(col, -1);
      const next = neighbour(col, 1);
      if (prev !== null) row.append(moveButton(card, "left", !canEnter(prev)));
      if (next !== null) row.append(moveButton(card, "right", !canEnter(next)));
      if (index > 0 && cards[index - 1].id !== null) row.append(moveButton(card, "up", false));
      if (index < cards.length - 1 && cards[index + 1].id !== null) row.append(moveButton(card, "down", false));
    }
    return row;
  }

  /** Moves a card on screen at once, then asks the server; a decline puts it back. */
  function move(card: CardView, dir: Dir): void {
    const id = card.id;
    if (id === null) return;
    const from = card.col;
    const origin = lists[from].indexOf(card);
    if (origin < 0) return;
    let to: Column = from;
    let target: number;
    if (dir === "up" || dir === "down") {
      target = dir === "up" ? origin - 1 : origin + 1;
    } else {
      const col = neighbour(from, dir === "left" ? -1 : 1);
      if (col === null) return;
      to = col;
      target = realCount(lists[to]);
    }
    moveError = "";
    removeFrom(lists[from], card);
    insertAt(lists[to], card, target);
    card.col = to;
    render();
    moveCard(id, to, target).then(
      () => {},
      (err: unknown) => {
        if (!alive) return;
        // Archived meanwhile: nothing to put back.
        if (!removeFrom(lists[card.col], card)) return;
        insertAt(lists[from], card, origin);
        card.col = from;
        moveError = `move error: ${messageOf(err)}`;
        render();
      },
    );
  }

  function addNewCard(): void {
    const title = newCard.value.trim();
    if (title === "" || columns.todo.status !== "ok") return;
    addError = "";
    const card: CardView = { key: newKey(), id: null, title, done: 0, total: 0, col: "todo" };
    lists.todo.push(card);
    newCard.value = "";
    render();
    addCard("todo", title).then(
      (created: { id: number; title: string }) => {
        if (!alive) return;
        card.id = created.id;
        render();
      },
      (err: unknown) => {
        if (!alive) return;
        removeFrom(lists.todo, card);
        addError = `add error: ${messageOf(err)}`;
        render();
      },
    );
  }

  function select(card: CardView): void {
    const id = card.id;
    if (id === null || selected === card) return;
    selected = card;
    renameError = "";
    itemError = "";
    renameInput.value = "";
    const state: Checklist = { card, status: "loading", error: "", items: [] };
    check = state;
    render();
    fetchChecklist(id).then(
      (items: Item[]) => {
        if (!alive || check !== state) return;
        state.items = items.map(itemView);
        state.status = "ok";
        card.done = state.items.filter(i => i.done).length;
        card.total = state.items.length;
        render();
      },
      (err: unknown) => {
        if (!alive || check !== state) return;
        state.status = "error";
        state.error = messageOf(err);
        render();
      },
    );
  }

  function rename(): void {
    const card = selected;
    const title = renameInput.value.trim();
    if (card === null || card.id === null || title === "") return;
    const id = card.id;
    renameError = "";
    const previous = card.title;
    card.title = title;
    render();
    renameCard(id, title).then(
      () => {},
      (err: unknown) => {
        if (!alive) return;
        card.title = previous;
        if (selected === card) renameError = `rename error: ${messageOf(err)}`;
        render();
      },
    );
  }

  function archive(): void {
    const card = selected;
    if (card === null || card.id === null) return;
    const id = card.id;
    const home = card.col;
    const index = lists[home].indexOf(card);
    archiveError = "";
    removeFrom(lists[home], card);
    selected = null;
    check = null;
    renameError = "";
    itemError = "";
    render();
    archiveCard(id).then(
      () => {},
      (err: unknown) => {
        if (!alive) return;
        insertAt(lists[home], card, index);
        card.col = home;
        archiveError = `archive error: ${messageOf(err)}`;
        render();
      },
    );
  }

  function toggleChecklist(state: Checklist, item: ItemView): void {
    const card = state.card;
    const cardId = card.id;
    const itemId = item.id;
    if (cardId === null || itemId === null || state.status !== "ok") return;
    itemError = "";
    const before = item.done;
    const after = !before;
    item.done = after;
    card.done += after ? 1 : -1;
    render();
    toggleItem(cardId, itemId, after).then(
      () => {},
      (err: unknown) => {
        if (!alive) return;
        item.done = before;
        card.done += after ? -1 : 1;
        if (check === state) itemError = `item error: ${messageOf(err)}`;
        render();
      },
    );
  }

  function addChecklistItem(): void {
    const state = check;
    const text = itemInput.value.trim();
    if (state === null || state.status !== "ok" || text === "") return;
    const card = state.card;
    const cardId = card.id;
    if (cardId === null) return;
    itemError = "";
    const item: ItemView = { key: newKey(), id: null, text, done: false };
    state.items.push(item);
    card.total += 1;
    itemInput.value = "";
    render();
    addItem(cardId, text).then(
      (created: Item) => {
        if (!alive) return;
        item.id = created.id;
        render();
      },
      (err: unknown) => {
        if (!alive) return;
        removeFrom(state.items, item);
        card.total -= 1;
        if (check === state) itemError = `item error: ${messageOf(err)}`;
        render();
      },
    );
  }

  function checklistBody(state: Checklist): HTMLElement {
    if (state.status === "loading") return el("p", {}, "loading checklist");
    if (state.status === "error") return el("p", { class: "error" }, `checklist error: ${state.error}`);
    const rows = state.items.map(item => {
      const pending = item.id === null;
      const mark = item.done ? "[x]" : "[ ]";
      const label = pending ? `${mark} ${item.text} (adding…)` : `${mark} ${item.text}`;
      const row = el("li", { class: "item" }, el("span", { "data-testid": "item" }, label));
      if (!pending) {
        const toggle = el("button", { type: "button", "data-testid": "toggle" }, "toggle");
        toggle.addEventListener("click", () => toggleChecklist(state, item));
        row.append(toggle);
      }
      return row;
    });
    return el("ul", { class: "items" }, ...rows);
  }

  function renderDetail(): void {
    const card = selected;
    const state = check;
    emptyEl.hidden = card !== null;
    emptyEl.textContent = card === null ? "select a card" : "";
    selBox.hidden = card === null;
    if (card === null || state === null) return;
    heading.textContent = `#${card.id} ${card.title}`;
    where.textContent = `in ${NAMES[card.col]}`;
    renameErr.textContent = renameError;
    itemErr.textContent = itemError;
    const ready = state.status === "ok";
    itemInput.disabled = !ready;
    itemAddBtn.disabled = !ready;
    checklistEl.replaceChildren(checklistBody(state));
    if (ready) {
      const done = state.items.filter(i => i.done).length;
      progressEl.textContent = `${done}/${state.items.length} done`;
    } else {
      progressEl.textContent = "";
    }
  }

  function renderColumn(col: Column): void {
    const view = colViews[col];
    const state = columns[col];
    const cards = lists[col];
    view.head.textContent = state.status === "ok" ? `${NAMES[col]} (${cards.length})` : NAMES[col];
    view.status.textContent = state.status === "loading" ? "loading" : state.status === "error" ? `error: ${state.error}` : "";
    view.status.hidden = state.status === "ok";
    view.retry.hidden = state.status !== "error";
    view.list.replaceChildren(...cards.map((card, i) => cardRow(col, card, i, cards)));
  }

  function render(): void {
    moveErrEl.textContent = moveError;
    addErrEl.textContent = addError;
    archiveErrEl.textContent = archiveError;
    const todoReady = columns.todo.status === "ok";
    newCard.disabled = !todoReady;
    addCardBtn.disabled = !todoReady;
    for (const col of COLUMNS) renderColumn(col);
    renderDetail();
  }

  function buildColumn(col: Column): ColumnView {
    const head = el("h2", { "data-testid": `head-${col}` }, NAMES[col]);
    const status = el("p", { class: "status" });
    const retry = el("button", { type: "button", "data-testid": `retry-${col}`, hidden: true }, "retry");
    retry.addEventListener("click", () => load(col));
    const list = el("ul", { class: "cards" });
    const add = col === "todo" ? el("div", { class: "row" }, newCard, addCardBtn) : null;
    const section = el("section", { class: "column", "data-testid": `col-${col}` }, head, status, retry, list, add);
    return { head, status, retry, list, section };
  }

  const colViews = {} as Record<Column, ColumnView>;
  for (const col of COLUMNS) colViews[col] = buildColumn(col);

  const columnsEl = el("div", { class: "columns" }, ...COLUMNS.map(col => colViews[col].section));
  const messages = el("div", { class: "messages" }, moveErrEl, addErrEl, archiveErrEl);
  host.replaceChildren(el("div", { class: "board" }, messages, el("div", { class: "layout" }, columnsEl, detail)));

  render();
  for (const col of COLUMNS) load(col);

  return () => { alive = false; };
}
