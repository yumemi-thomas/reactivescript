import {
  addCard,
  addItem,
  archiveCard,
  fetchCards,
  fetchChecklist,
  moveCard,
  renameCard,
  toggleItem,
} from "./api.js";
import type { Column } from "./api.js";
import { alertLine, errorMessage, h, onEnter, setSlot } from "./dom.js";
import type { Child } from "./dom.js";

const COLUMNS: readonly Column[] = ["todo", "doing", "done"];
const NAMES: Record<Column, string> = { todo: "To do", doing: "Doing", done: "Done" };
const DIRS: readonly Dir[] = ["left", "right", "up", "down"];
const WIP_LIMIT = 3;

type Dir = "left" | "right" | "up" | "down";

/** A card on the board. `id` is null while its add is still in the air. */
interface Card {
  key: string;
  id: number | null;
  title: string;
  done: number;
  total: number;
}

/** A checklist item. `id` is null while its add is still in the air. */
interface Item {
  key: string;
  id: number | null;
  text: string;
  done: boolean;
}

type ColumnState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; cards: Card[] };

type ChecklistState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; items: Item[] };

/** One card selection. Replaced wholesale when another card is selected. */
interface Selection {
  key: string;
  checklist: ChecklistState;
  renameError: string | null;
  itemError: string | null;
}

interface MoveOption {
  column: Column;
  index: number;
  disabled: boolean;
}

let localSeq = 0;
function localKey(prefix: string): string {
  localSeq += 1;
  return `${prefix}-${localSeq}`;
}

function readyItems(sel: Selection): Item[] | null {
  return sel.checklist.status === "ready" ? sel.checklist.items : null;
}

/**
 * Builds the board page inside `page` and starts loading its three columns. Returns a
 * dispose function: once called, late answers from the server are ignored.
 */
export function mountBoard(page: HTMLElement): () => void {
  let alive = true;
  const cols: Record<Column, ColumnState> = {
    todo: { status: "loading" },
    doing: { status: "loading" },
    done: { status: "loading" },
  };
  let selection: Selection | null = null;
  let moveError: string | null = null;
  let addError: string | null = null;
  let archiveError: string | null = null;

  // Static shell. Inputs are created once so typing survives re-renders.
  const heads = {} as Record<Column, HTMLHeadingElement>;
  const bodies = {} as Record<Column, HTMLDivElement>;
  const columnsEl = h("div", { class: "columns" });
  const addSlot = h("div");
  const newCardInput = h("input", {
    type: "text",
    "data-testid": "new-card",
    "aria-label": "New card title",
    placeholder: "New card title",
  });
  const addButton = h("button", { type: "button", "data-testid": "add-card" }, "add card");
  for (const column of COLUMNS) {
    heads[column] = h("h2", { class: "col-head", "data-testid": `head-${column}` });
    bodies[column] = h("div", { class: "col-body" });
    const parts: Child[] = [heads[column], bodies[column]];
    if (column === "todo") {
      parts.push(h("div", { class: "add-form" }, newCardInput, addButton), addSlot);
    }
    columnsEl.append(h("section", { class: "column", "data-testid": `col-${column}` }, ...parts));
  }
  const moveSlot = h("div");
  const archiveSlot = h("div");

  const detail = h("aside", { class: "detail", "data-testid": "detail", "aria-label": "Selected card" });
  const emptyNote = h("p", { class: "muted" }, "select a card");
  const panel = h("div", { class: "panel" });
  const detailTitle = h("h3", { class: "detail-title" });
  const detailColumn = h("p", { class: "muted" });
  const titleInput = h("input", { type: "text", "data-testid": "title-input", "aria-label": "New title" });
  const renameButton = h("button", { type: "button", "data-testid": "rename" }, "rename");
  const renameErrorSlot = h("div");
  const archiveButton = h("button", { type: "button", "data-testid": "archive" }, "archive");
  const checklistEl = h("div", { class: "checklist", "data-testid": "checklist" });
  const itemErrorSlot = h("div");
  const itemInput = h("input", { type: "text", "data-testid": "item-input", "aria-label": "New checklist item" });
  const addItemButton = h("button", { type: "button", "data-testid": "add-item" }, "add item");
  panel.append(
    detailTitle,
    detailColumn,
    h("div", { class: "row-form" }, titleInput, renameButton),
    renameErrorSlot,
    h("div", { class: "row-form" }, archiveButton),
    checklistEl,
    itemErrorSlot,
    h("div", { class: "row-form" }, itemInput, addItemButton),
  );
  detail.append(emptyNote, panel);

  // Column data helpers.
  function readyCards(column: Column): Card[] | null {
    const state = cols[column];
    return state.status === "ready" ? state.cards : null;
  }

  function locate(key: string): { column: Column; index: number; card: Card } | null {
    for (const column of COLUMNS) {
      const cards = readyCards(column);
      if (!cards) continue;
      const index = cards.findIndex((c) => c.key === key);
      if (index >= 0) return { column, index, card: cards[index] };
    }
    return null;
  }

  /** Where a card at `index` in `column` can go with `dir`, or null when there is no such place. */
  function moveOption(column: Column, cards: Card[], index: number, dir: Dir): MoveOption | null {
    if (dir === "up" || dir === "down") {
      const at = dir === "up" ? index - 1 : index + 1;
      const neighbour = cards[at];
      if (!neighbour) return null;
      // A neighbour still being added has no id on the server yet, so its order is unknown.
      return { column, index: at, disabled: neighbour.id === null };
    }
    const position = COLUMNS.indexOf(column) + (dir === "right" ? 1 : -1);
    if (position < 0 || position >= COLUMNS.length) return null;
    const target = COLUMNS[position];
    const targetCards = readyCards(target);
    const full = target === "doing" && (targetCards?.length ?? 0) >= WIP_LIMIT;
    return {
      column: target,
      index: targetCards?.length ?? 0,
      disabled: targetCards === null || full,
    };
  }

  // Rendering.
  function renderColumn(column: Column): void {
    const state = cols[column];
    const head = heads[column];
    const body = bodies[column];
    if (state.status === "loading") {
      head.textContent = NAMES[column];
      body.replaceChildren(h("p", { role: "status", class: "muted" }, "loading"));
      return;
    }
    if (state.status === "error") {
      head.textContent = NAMES[column];
      const retry = h("button", { type: "button", "data-testid": `retry-${column}` }, "retry");
      retry.addEventListener("click", () => loadColumn(column));
      body.replaceChildren(h("p", { role: "alert", class: "alert" }, `error: ${state.message}`), retry);
      return;
    }
    head.textContent = `${NAMES[column]} (${state.cards.length})`;
    const cards = state.cards;
    body.replaceChildren(
      h("ul", { class: "cards" }, ...cards.map((_card, index) => cardRow(column, cards, index))),
    );
  }

  function cardRow(column: Column, cards: Card[], index: number): HTMLLIElement {
    const card = cards[index];
    const row = h("li", { class: "card-row" });
    if (card.id === null) {
      row.append(
        h("div", { class: "card pending", "data-testid": "card", "aria-busy": "true" }, `${card.title} (adding…)`),
      );
      return row;
    }
    const isSelected = selection !== null && selection.key === card.key;
    const cardButton = h(
      "button",
      {
        type: "button",
        class: "card",
        "data-testid": "card",
        "aria-pressed": isSelected ? "true" : "false",
      },
      `#${card.id} ${card.title} · ${card.done}/${card.total}`,
    );
    cardButton.addEventListener("click", () => select(card.key));
    const moves = h("div", { class: "moves" });
    for (const dir of DIRS) {
      const option = moveOption(column, cards, index, dir);
      if (option === null) continue;
      const button = h("button", { type: "button", "data-testid": dir, disabled: option.disabled }, dir);
      button.addEventListener("click", () => move(card.key, dir));
      moves.append(button);
    }
    row.append(cardButton, moves);
    return row;
  }

  function renderChecklist(sel: Selection): void {
    const state = sel.checklist;
    if (state.status === "loading") {
      checklistEl.replaceChildren(h("p", { role: "status", class: "muted" }, "loading checklist"));
      return;
    }
    if (state.status === "error") {
      checklistEl.replaceChildren(alertLine("checklist-error", `checklist error: ${state.message}`));
      return;
    }
    const rows = state.items.map((item) => {
      const row = h("li", { class: "item-row" });
      const label =
        item.id === null ? `[ ] ${item.text} (adding…)` : `${item.done ? "[x]" : "[ ]"} ${item.text}`;
      row.append(h("span", { "data-testid": "item" }, label));
      if (item.id !== null) {
        const toggleButton = h("button", { type: "button", "data-testid": "toggle" }, "toggle");
        toggleButton.addEventListener("click", () => toggle(item.key));
        row.append(toggleButton);
      }
      return row;
    });
    const done = state.items.filter((item) => item.done).length;
    checklistEl.replaceChildren(
      h("ul", { class: "items" }, ...rows),
      h("p", { class: "progress", "data-testid": "progress" }, `${done}/${state.items.length} done`),
    );
  }

  function renderDetail(): void {
    const sel = selection;
    const loc = sel ? locate(sel.key) : null;
    if (!sel || !loc || loc.card.id === null) {
      emptyNote.hidden = false;
      panel.hidden = true;
      return;
    }
    emptyNote.hidden = true;
    panel.hidden = false;
    detailTitle.textContent = `#${loc.card.id} ${loc.card.title}`;
    detailColumn.textContent = `in ${NAMES[loc.column]}`;
    setSlot(
      renameErrorSlot,
      sel.renameError === null ? null : alertLine("rename-error", `rename error: ${sel.renameError}`),
    );
    setSlot(
      itemErrorSlot,
      sel.itemError === null ? null : alertLine("item-error", `item error: ${sel.itemError}`),
    );
    renderChecklist(sel);
  }

  function renderAll(): void {
    for (const column of COLUMNS) renderColumn(column);
    setSlot(addSlot, addError === null ? null : alertLine("add-error", `add error: ${addError}`));
    setSlot(moveSlot, moveError === null ? null : alertLine("move-error", `move error: ${moveError}`));
    setSlot(
      archiveSlot,
      archiveError === null ? null : alertLine("archive-error", `archive error: ${archiveError}`),
    );
    renderDetail();
  }

  // Loading.
  function loadColumn(column: Column): void {
    cols[column] = { status: "loading" };
    renderAll();
    fetchCards(column).then(
      (cards) => {
        if (!alive) return;
        cols[column] = {
          status: "ready",
          cards: cards.map((c) => ({ key: `card-${c.id}`, id: c.id, title: c.title, done: c.done, total: c.total })),
        };
        renderAll();
      },
      (err: unknown) => {
        if (!alive) return;
        cols[column] = { status: "error", message: errorMessage(err) };
        renderAll();
      },
    );
  }

  // Moving.
  function move(key: string, dir: Dir): void {
    const from = locate(key);
    if (!from || from.card.id === null) return;
    const option = moveOption(from.column, readyCards(from.column) ?? [], from.index, dir);
    if (!option || option.disabled) return;
    const source = readyCards(from.column);
    const dest = readyCards(option.column);
    if (!source || !dest) return;
    const card = from.card;
    const id = card.id;
    if (id === null) return;
    const origin = { column: from.column, index: from.index };
    moveError = null;
    source.splice(origin.index, 1);
    dest.splice(option.index, 0, card);
    renderAll();
    moveCard(id, option.column, option.index).then(
      () => undefined,
      (err: unknown) => {
        if (!alive) return;
        const now = locate(key);
        const origins = readyCards(origin.column);
        if (now) readyCards(now.column)?.splice(now.index, 1);
        if (now && origins) origins.splice(Math.min(origin.index, origins.length), 0, now.card);
        moveError = errorMessage(err);
        renderAll();
      },
    );
  }

  // Adding cards.
  function addNewCard(): void {
    const title = newCardInput.value.trim();
    const cards = readyCards("todo");
    if (title === "" || !cards) return;
    const card: Card = { key: localKey("new"), id: null, title, done: 0, total: 0 };
    addError = null;
    cards.push(card);
    newCardInput.value = "";
    renderAll();
    addCard("todo", title).then(
      (created) => {
        if (!alive) return;
        card.id = created.id;
        renderAll();
      },
      (err: unknown) => {
        if (!alive) return;
        const list = readyCards("todo");
        const at = list ? list.indexOf(card) : -1;
        if (list && at >= 0) list.splice(at, 1);
        addError = errorMessage(err);
        renderAll();
      },
    );
  }

  // Selecting and the detail.
  function select(key: string): void {
    if (selection !== null && selection.key === key) return;
    const loc = locate(key);
    if (!loc || loc.card.id === null) return;
    const id = loc.card.id;
    const sel: Selection = { key, checklist: { status: "loading" }, renameError: null, itemError: null };
    selection = sel;
    titleInput.value = "";
    itemInput.value = "";
    renderAll();
    fetchChecklist(id).then(
      (items) => {
        if (!alive || selection !== sel) return;
        const list: Item[] = items.map((i) => ({ key: `item-${i.id}`, id: i.id, text: i.text, done: i.done }));
        sel.checklist = { status: "ready", items: list };
        const now = locate(key);
        if (now) {
          now.card.done = list.filter((i) => i.done).length;
          now.card.total = list.length;
        }
        renderAll();
      },
      (err: unknown) => {
        if (!alive || selection !== sel) return;
        sel.checklist = { status: "error", message: errorMessage(err) };
        renderAll();
      },
    );
  }

  function setItemDone(cardKey: string, item: Item, done: boolean): void {
    if (item.done === done) return;
    const loc = locate(cardKey);
    if (loc) loc.card.done += done ? 1 : -1;
    item.done = done;
  }

  function toggle(itemKey: string): void {
    const sel = selection;
    if (!sel) return;
    const items = readyItems(sel);
    const loc = locate(sel.key);
    const item = items?.find((i) => i.key === itemKey);
    if (!items || !item || item.id === null || !loc || loc.card.id === null) return;
    const cardKey = sel.key;
    const cardId = loc.card.id;
    const itemId = item.id;
    const next = !item.done;
    sel.itemError = null;
    setItemDone(cardKey, item, next);
    renderAll();
    toggleItem(cardId, itemId, next).then(
      () => undefined,
      (err: unknown) => {
        if (!alive) return;
        setItemDone(cardKey, item, !next);
        sel.itemError = errorMessage(err);
        renderAll();
      },
    );
  }

  function addChecklistItem(): void {
    const sel = selection;
    if (!sel) return;
    const items = readyItems(sel);
    const text = itemInput.value.trim();
    const loc = locate(sel.key);
    if (!items || text === "" || !loc || loc.card.id === null) return;
    const cardKey = sel.key;
    const cardId = loc.card.id;
    const item: Item = { key: localKey("item"), id: null, text, done: false };
    sel.itemError = null;
    itemInput.value = "";
    items.push(item);
    loc.card.total += 1;
    renderAll();
    addItem(cardId, text).then(
      (created) => {
        if (!alive) return;
        item.id = created.id;
        renderAll();
      },
      (err: unknown) => {
        if (!alive) return;
        const at = items.indexOf(item);
        if (at >= 0) items.splice(at, 1);
        const now = locate(cardKey);
        if (now) now.card.total -= 1;
        sel.itemError = errorMessage(err);
        renderAll();
      },
    );
  }

  function rename(): void {
    const sel = selection;
    const title = titleInput.value.trim();
    if (!sel || title === "") return;
    const loc = locate(sel.key);
    if (!loc || loc.card.id === null) return;
    const card = loc.card;
    const id = loc.card.id;
    const previous = card.title;
    sel.renameError = null;
    card.title = title;
    renderAll();
    renameCard(id, title).then(
      () => undefined,
      (err: unknown) => {
        if (!alive) return;
        card.title = previous;
        sel.renameError = errorMessage(err);
        renderAll();
      },
    );
  }

  function archiveSelected(): void {
    const sel = selection;
    if (!sel) return;
    const loc = locate(sel.key);
    if (!loc || loc.card.id === null) return;
    const id = loc.card.id;
    const { column, index, card } = loc;
    const source = readyCards(column);
    if (!source) return;
    source.splice(index, 1);
    selection = null;
    archiveError = null;
    titleInput.value = "";
    itemInput.value = "";
    renderAll();
    archiveCard(id).then(
      () => undefined,
      (err: unknown) => {
        if (!alive) return;
        const cards = readyCards(column);
        if (cards) cards.splice(Math.min(index, cards.length), 0, card);
        archiveError = errorMessage(err);
        renderAll();
      },
    );
  }

  // Wiring.
  addButton.addEventListener("click", addNewCard);
  newCardInput.addEventListener("keydown", onEnter(addNewCard));
  renameButton.addEventListener("click", rename);
  titleInput.addEventListener("keydown", onEnter(rename));
  archiveButton.addEventListener("click", archiveSelected);
  addItemButton.addEventListener("click", addChecklistItem);
  itemInput.addEventListener("keydown", onEnter(addChecklistItem));

  page.append(columnsEl, moveSlot, archiveSlot, detail);
  for (const column of COLUMNS) loadColumn(column);
  renderAll();

  return () => {
    alive = false;
  };
}
