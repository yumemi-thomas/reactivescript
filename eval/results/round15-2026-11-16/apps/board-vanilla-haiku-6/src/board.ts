import * as api from "./api.js";
import { attempt, button, el, errorMessage } from "./dom.js";

type Column = "todo" | "doing" | "done";
type Dir = "left" | "right" | "up" | "down";
interface Target {
  column: Column;
  index: number;
}

const COLUMNS: readonly Column[] = ["todo", "doing", "done"];
const NAMES: Record<Column, string> = { todo: "To do", doing: "Doing", done: "Done" };
const DIRS: readonly Dir[] = ["left", "right", "up", "down"];
const WIP_LIMIT = 3;

interface Card {
  /** null while the server has not yet answered the add */
  id: number | null;
  title: string;
  done: number;
  total: number;
  column: Column;
  /** a move of this card is with the server */
  moving: boolean;
}

interface Item {
  /** null while the server has not yet answered the add */
  id: number | null;
  text: string;
  done: boolean;
  /** a toggle (or the add) is with the server */
  busy: boolean;
}

interface Checklist {
  cardId: number;
  status: "loading" | "ok" | "error";
  error: string;
  items: Item[];
}

interface ColumnState {
  status: "loading" | "ok" | "error";
  error: string;
  token: number;
  cards: Card[];
}

function emptyColumn(): ColumnState {
  return { status: "loading", error: "", token: 0, cards: [] };
}

/** Mounts the board page into `host`. Returns a function that discards the page: late answers are ignored. */
export function mountBoard(host: HTMLElement): () => void {
  let alive = true;
  const columns: Record<Column, ColumnState> = { todo: emptyColumn(), doing: emptyColumn(), done: emptyColumn() };
  let moveError = "";
  let addError = "";
  let archiveError = "";
  let renameError = "";
  let itemError = "";
  let selectedId: number | null = null;
  let checklist: Checklist | null = null;

  // Elements that persist across renders, so that typed text survives the lists re-rendering around them.
  const heads = {} as Record<Column, HTMLHeadingElement>;
  const bodies = {} as Record<Column, HTMLElement>;
  for (const column of COLUMNS) {
    heads[column] = el("h2", { "data-testid": `head-${column}` });
    bodies[column] = el("div", { "data-testid": `col-${column}`, class: "col-body" });
  }
  const moveErrorEl = el("p", { class: "error", "data-testid": "move-error", role: "alert" });
  const archiveErrorEl = el("p", { class: "error", "data-testid": "archive-error", role: "alert" });
  const addErrorEl = el("p", { class: "error", "data-testid": "add-error", role: "alert" });
  const newCardInput = el("input", { type: "text", "data-testid": "new-card", "aria-label": "New card title" });
  const addButton = button("Add", { "data-testid": "add-card" }, submitAdd);
  newCardInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") submitAdd();
  });

  const todoSection = el(
    "section",
    { class: "column", "data-column": "todo" },
    heads.todo,
    bodies.todo,
    el("div", { class: "row" }, newCardInput, addButton),
    addErrorEl,
  );
  const doingSection = el("section", { class: "column", "data-column": "doing" }, heads.doing, bodies.doing);
  const doneSection = el("section", { class: "column", "data-column": "done" }, heads.done, bodies.done);
  const boardEl = el(
    "div",
    { class: "board" },
    moveErrorEl,
    archiveErrorEl,
    el("div", { class: "columns" }, todoSection, doingSection, doneSection),
  );

  const detailHead = el("div", { class: "detail-head" });
  const renameErrorEl = el("p", { class: "error", "data-testid": "rename-error", role: "alert" });
  const titleInput = el("input", { type: "text", "data-testid": "title-input", "aria-label": "Card title" });
  const renameButton = button("Rename", { "data-testid": "rename" }, renameSelected);
  const archiveButton = button("Archive", { "data-testid": "archive" }, archiveSelected);
  titleInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") renameSelected();
  });
  const checklistEl = el("div", { "data-testid": "checklist", class: "checklist" });
  const itemErrorEl = el("p", { class: "error", "data-testid": "item-error", role: "alert" });
  const itemInput = el("input", { type: "text", "data-testid": "item-input", "aria-label": "New checklist item" });
  const addItemButton = button("Add item", { "data-testid": "add-item" }, addItemSelected);
  itemInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") addItemSelected();
  });
  const detailEl = el(
    "section",
    { class: "detail", "data-testid": "detail" },
    detailHead,
    renameErrorEl,
    el("div", { class: "row" }, titleInput, renameButton, archiveButton),
    checklistEl,
    itemErrorEl,
    el("div", { class: "row" }, itemInput, addItemButton),
  );

  const page = el("div", { class: "board-page" }, boardEl, detailEl);

  // ---- model helpers ----

  function findCard(id: number): Card | undefined {
    for (const column of COLUMNS) {
      const card = columns[column].cards.find((c) => c.id === id);
      if (card) return card;
    }
    return undefined;
  }

  function selectedCard(): Card | undefined {
    return selectedId === null ? undefined : findCard(selectedId);
  }

  function isOnBoard(card: Card): boolean {
    return COLUMNS.some((column) => columns[column].cards.includes(card));
  }

  function detach(card: Card): void {
    for (const column of COLUMNS) {
      const cards = columns[column].cards;
      const at = cards.indexOf(card);
      if (at !== -1) {
        cards.splice(at, 1);
        return;
      }
    }
  }

  function place(card: Card, column: Column, index: number): void {
    detach(card);
    const cards = columns[column].cards;
    card.column = column;
    cards.splice(Math.min(index, cards.length), 0, card);
  }

  /** Where a move button sends the card, or null when there is nowhere to go (the button is then not shown). */
  function moveTarget(card: Card, dir: Dir): Target | null {
    const cards = columns[card.column].cards;
    const at = cards.indexOf(card);
    if (dir === "up") return at > 0 ? { column: card.column, index: at - 1 } : null;
    if (dir === "down") return at !== -1 && at < cards.length - 1 ? { column: card.column, index: at + 1 } : null;
    const next = COLUMNS.indexOf(card.column) + (dir === "right" ? 1 : -1);
    if (next < 0 || next >= COLUMNS.length) return null;
    const column = COLUMNS[next];
    return { column, index: columns[column].cards.length };
  }

  /** A shown move button is disabled while the move cannot start: the card is already moving, the target column is not loaded, or Doing is full. */
  function moveBlocked(card: Card, target: Target): boolean {
    if (card.moving) return true;
    if (columns[target.column].status !== "ok") return true;
    return target.column === "doing" && card.column !== "doing" && columns.doing.cards.length >= WIP_LIMIT;
  }

  // ---- rendering ----

  function renderAll(): void {
    for (const column of COLUMNS) renderColumn(column);
    moveErrorEl.textContent = moveError;
    archiveErrorEl.textContent = archiveError;
    addErrorEl.textContent = addError;
    addButton.disabled = columns.todo.status !== "ok";
    renderDetail();
  }

  function renderColumn(column: Column): void {
    const state = columns[column];
    heads[column].textContent = state.status === "ok" ? `${NAMES[column]} (${state.cards.length})` : NAMES[column];
    const body = bodies[column];
    if (state.status === "loading") {
      body.replaceChildren(el("p", { "data-testid": "loading" }, "loading"));
    } else if (state.status === "error") {
      body.replaceChildren(
        el("p", { class: "error", role: "alert" }, `error: ${state.error}`),
        button("Retry", { "data-testid": `retry-${column}` }, () => load(column)),
      );
    } else {
      body.replaceChildren(...state.cards.map(cardRow));
    }
  }

  function cardRow(card: Card): HTMLElement {
    const id = card.id;
    if (id === null) {
      return el("div", { class: "card-row" }, el("div", { class: "card adding", "data-testid": "card" }, `${card.title} (adding…)`));
    }
    const selected = id === selectedId;
    const cardEl = button(
      `#${id} ${card.title} · ${card.done}/${card.total}`,
      { "data-testid": "card", class: selected ? "card selected" : "card", "aria-pressed": String(selected) },
      () => select(id),
    );
    const moves = DIRS.map((dir) => {
      const target = moveTarget(card, dir);
      if (!target) return null;
      return button(dir, { "data-testid": dir, disabled: moveBlocked(card, target) }, () => move(card, dir));
    });
    return el("div", { class: "card-row" }, cardEl, ...moves);
  }

  function renderDetail(): void {
    const card = selectedCard();
    detailHead.replaceChildren(
      ...(card
        ? [el("h3", {}, `#${card.id} ${card.title}`), el("p", { class: "muted" }, `in ${NAMES[card.column]}`)]
        : [el("p", { class: "muted" }, "select a card")]),
    );
    renameErrorEl.textContent = renameError;
    itemErrorEl.textContent = itemError;
    renameButton.disabled = !card;
    archiveButton.disabled = !card;
    const list = checklist;
    addItemButton.disabled = list === null || list.status !== "ok";
    checklistEl.replaceChildren(...checklistNodes(list));
  }

  function checklistNodes(list: Checklist | null): Node[] {
    if (list === null) return [];
    if (list.status === "loading") return [el("p", {}, "loading checklist")];
    if (list.status === "error") return [el("p", { class: "error", role: "alert" }, `checklist error: ${list.error}`)];
    const done = list.items.filter((item) => item.done).length;
    return [
      ...list.items.map((item) => itemRow(list, item)),
      el("p", { "data-testid": "progress" }, `${done}/${list.items.length} done`),
    ];
  }

  function itemRow(list: Checklist, item: Item): HTMLElement {
    const text = item.id === null ? `[ ] ${item.text} (adding…)` : `${item.done ? "[x]" : "[ ]"} ${item.text}`;
    return el(
      "div",
      { class: "item-row" },
      el("div", { "data-testid": "item", class: "item" }, text),
      item.id === null ? null : button("toggle", { "data-testid": "toggle", disabled: item.busy }, () => toggle(list, item)),
    );
  }

  // ---- loading ----

  function load(column: Column): void {
    const state = columns[column];
    const token = state.token + 1;
    state.token = token;
    state.status = "loading";
    state.error = "";
    state.cards = [];
    renderAll();
    attempt(() => api.fetchCards(column)).then(
      (cards) => {
        if (!alive || state.token !== token) return;
        state.status = "ok";
        state.cards = cards.map((c) => ({ id: c.id, title: c.title, done: c.done, total: c.total, column, moving: false }));
        renderAll();
      },
      (err: unknown) => {
        if (!alive || state.token !== token) return;
        state.status = "error";
        state.error = errorMessage(err);
        renderAll();
      },
    );
  }

  // ---- moving ----

  function move(card: Card, dir: Dir): void {
    const target = moveTarget(card, dir);
    if (!alive || card.id === null || !target || moveBlocked(card, target)) return;
    const id = card.id;
    const origin: Target = { column: card.column, index: columns[card.column].cards.indexOf(card) };
    moveError = "";
    place(card, target.column, target.index);
    card.moving = true;
    renderAll();
    attempt(() => api.moveCard(id, target.column, target.index)).then(
      () => {
        card.moving = false;
        if (alive) renderAll();
      },
      (err: unknown) => {
        card.moving = false;
        if (!alive) return;
        if (isOnBoard(card)) place(card, origin.column, origin.index);
        moveError = `move error: ${errorMessage(err)}`;
        renderAll();
      },
    );
  }

  // ---- adding ----

  function submitAdd(): void {
    const title = newCardInput.value.trim();
    if (!alive || title === "" || columns.todo.status !== "ok") return;
    const card: Card = { id: null, title, done: 0, total: 0, column: "todo", moving: false };
    newCardInput.value = "";
    addError = "";
    place(card, "todo", columns.todo.cards.length);
    renderAll();
    attempt(() => api.addCard("todo", title)).then(
      (created) => {
        card.id = created.id;
        if (alive) renderAll();
      },
      (err: unknown) => {
        if (!alive) return;
        detach(card);
        addError = `add error: ${errorMessage(err)}`;
        renderAll();
      },
    );
  }

  // ---- selecting, renaming, archiving ----

  function select(id: number): void {
    if (!alive || id === selectedId) return;
    selectedId = id;
    renameError = "";
    itemError = "";
    titleInput.value = "";
    itemInput.value = "";
    const list: Checklist = { cardId: id, status: "loading", error: "", items: [] };
    checklist = list;
    renderAll();
    attempt(() => api.fetchChecklist(id)).then(
      (items) => {
        if (!alive || checklist !== list) return;
        list.status = "ok";
        list.items = items.map((item) => ({ id: item.id, text: item.text, done: item.done, busy: false }));
        renderAll();
      },
      (err: unknown) => {
        if (!alive || checklist !== list) return;
        list.status = "error";
        list.error = errorMessage(err);
        renderAll();
      },
    );
  }

  function renameSelected(): void {
    const card = selectedCard();
    const title = titleInput.value.trim();
    if (!alive || !card || card.id === null || title === "") return;
    const id = card.id;
    const previous = card.title;
    renameError = "";
    card.title = title;
    titleInput.value = "";
    renderAll();
    attempt(() => api.renameCard(id, title)).then(
      () => undefined,
      (err: unknown) => {
        if (!alive) return;
        card.title = previous;
        if (selectedId === id) renameError = `rename error: ${errorMessage(err)}`;
        renderAll();
      },
    );
  }

  function archiveSelected(): void {
    const card = selectedCard();
    if (!alive || !card || card.id === null) return;
    const id = card.id;
    const origin: Target = { column: card.column, index: columns[card.column].cards.indexOf(card) };
    detach(card);
    selectedId = null;
    checklist = null;
    renameError = "";
    itemError = "";
    archiveError = "";
    titleInput.value = "";
    itemInput.value = "";
    renderAll();
    attempt(() => api.archiveCard(id)).then(
      () => undefined,
      (err: unknown) => {
        if (!alive) return;
        place(card, origin.column, origin.index);
        archiveError = `archive error: ${errorMessage(err)}`;
        renderAll();
      },
    );
  }

  // ---- checklist ----

  function toggle(list: Checklist, item: Item): void {
    if (!alive || list.status !== "ok" || item.id === null || item.busy) return;
    const id = item.id;
    const next = !item.done;
    const delta = next ? 1 : -1;
    const card = findCard(list.cardId);
    itemError = "";
    item.done = next;
    item.busy = true;
    if (card) card.done += delta;
    renderAll();
    attempt(() => api.toggleItem(list.cardId, id, next)).then(
      () => {
        item.busy = false;
        if (alive) renderAll();
      },
      (err: unknown) => {
        item.busy = false;
        if (!alive) return;
        item.done = !next;
        if (card) card.done -= delta;
        if (checklist === list) itemError = `item error: ${errorMessage(err)}`;
        renderAll();
      },
    );
  }

  function addItemSelected(): void {
    const list = checklist;
    const text = itemInput.value.trim();
    if (!alive || list === null || list.status !== "ok" || text === "") return;
    const cardId = list.cardId;
    const card = findCard(cardId);
    const item: Item = { id: null, text, done: false, busy: true };
    itemError = "";
    itemInput.value = "";
    list.items = [...list.items, item];
    if (card) card.total += 1;
    renderAll();
    attempt(() => api.addItem(cardId, text)).then(
      (created) => {
        item.id = created.id;
        item.done = created.done;
        item.busy = false;
        if (alive) renderAll();
      },
      (err: unknown) => {
        if (!alive) return;
        list.items = list.items.filter((i) => i !== item);
        if (card) card.total -= 1;
        if (checklist === list) itemError = `item error: ${errorMessage(err)}`;
        renderAll();
      },
    );
  }

  // ---- start ----

  host.append(page);
  for (const column of COLUMNS) load(column);

  return () => {
    alive = false;
    page.remove();
  };
}
