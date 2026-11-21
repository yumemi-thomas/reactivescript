import { addCard, addItem, archiveCard, fetchCards, fetchChecklist, moveCard, renameCard, toggleItem } from "./api.js";
import type { Column } from "./api.js";
import { errorMessage, h } from "./dom";

const COLUMNS: readonly Column[] = ["todo", "doing", "done"];
const NAMES: Readonly<Record<Column, string>> = { todo: "To do", doing: "Doing", done: "Done" };
const WIP_LIMIT = 3;
const DIRS = ["left", "right", "up", "down"] as const;
type Dir = (typeof DIRS)[number];

interface Item {
  id: number | undefined; // undefined while the add is in flight
  text: string;
  done: boolean;
}

interface BoardCard {
  id: number | undefined; // undefined while the add is in flight
  title: string;
  done: number;
  total: number;
  column: Column;
  items: Item[] | null; // the checklist, once loaded for this card
}

interface ColumnState {
  status: "loading" | "ok" | "error";
  error: string;
  cards: BoardCard[];
}

interface Target {
  column: Column;
  index: number;
}

interface DetailView {
  heading: HTMLElement;
  where: HTMLElement;
  renameInput: HTMLInputElement;
  renameErr: HTMLElement;
  checklist: HTMLElement;
  progress: HTMLElement;
  itemErr: HTMLElement;
  itemInput: HTMLInputElement;
  addItemBtn: HTMLButtonElement;
}

interface CheckState {
  status: "loading" | "ok" | "error";
  error: string;
}

// The board page. Returns a dispose function; once disposed, late responses are ignored.
export function createBoard(container: HTMLElement): () => void {
  let alive = true;
  const cols: Record<Column, ColumnState> = {
    todo: { status: "loading", error: "", cards: [] },
    doing: { status: "loading", error: "", cards: [] },
    done: { status: "loading", error: "", cards: [] },
  };
  let selected: BoardCard | null = null;
  let checkToken = 0;
  let check: CheckState = { status: "loading", error: "" };
  let moveError: string | null = null;
  let addError: string | null = null;
  let archiveError: string | null = null;
  let renameError: string | null = null;
  let itemError: string | null = null;
  let view: DetailView | null = null;
  let built: BoardCard | null | undefined = undefined;

  const heads = {} as Record<Column, HTMLElement>;
  const bodies = {} as Record<Column, HTMLElement>;

  const notices = h("div", { cls: "notices" });
  const newCard = h("input", { testid: "new-card", placeholder: "New card title" });
  const addCardBtn = h("button", { testid: "add-card", type: "submit" }, "add");
  const addForm = h("form", { cls: "add", onSubmit: onAdd }, newCard, addCardBtn);
  const addErrorSlot = h("div", {});
  const detail = h("aside", { testid: "detail", cls: "detail" });

  const sections = COLUMNS.map((col) => {
    const head = h("h2", { testid: `head-${col}`, cls: "col-head" }, NAMES[col]);
    const body = h("div", { cls: "col-body" });
    heads[col] = head;
    bodies[col] = body;
    return h(
      "section",
      { testid: `col-${col}`, cls: `column column-${col}` },
      head,
      body,
      ...(col === "todo" ? [addForm, addErrorSlot] : []),
    );
  });
  const columns = h("div", { cls: "columns" }, ...sections);
  container.replaceChildren(h("section", { testid: "board", cls: "board" }, notices, h("div", { cls: "workspace" }, columns, detail)));

  // ---- column state ----

  function attach(card: BoardCard, column: Column, index: number): void {
    card.column = column;
    const list = cols[column].cards;
    list.splice(Math.max(0, Math.min(index, list.length)), 0, card);
  }

  function detach(card: BoardCard): number {
    const list = cols[card.column].cards;
    const i = list.indexOf(card);
    if (i >= 0) list.splice(i, 1);
    return i;
  }

  function attached(card: BoardCard): boolean {
    return cols[card.column].cards.includes(card);
  }

  function syncCounts(card: BoardCard): void {
    if (card.items === null) return;
    card.total = card.items.length;
    card.done = card.items.filter((i) => i.done).length;
  }

  function loadColumn(col: Column): void {
    const st = cols[col];
    st.status = "loading";
    st.error = "";
    renderAll();
    fetchCards(col).then(
      (list) => {
        if (!alive) return;
        st.cards = list.map((c) => ({ id: c.id, title: c.title, done: c.done, total: c.total, column: col, items: null }));
        st.status = "ok";
        renderAll();
      },
      (err: unknown) => {
        if (!alive) return;
        st.status = "error";
        st.error = errorMessage(err);
        renderAll();
      },
    );
  }

  // Where a move button would put the card, or null when the button has nowhere to go.
  function targetOf(card: BoardCard, dir: Dir): Target | null {
    const list = cols[card.column].cards;
    const i = list.indexOf(card);
    if (i < 0) return null;
    const at = COLUMNS.indexOf(card.column);
    switch (dir) {
      case "left": {
        if (at === 0) return null;
        const column = COLUMNS[at - 1];
        return { column, index: cols[column].cards.length };
      }
      case "right": {
        if (at === COLUMNS.length - 1) return null;
        const column = COLUMNS[at + 1];
        return { column, index: cols[column].cards.length };
      }
      case "up":
        return i > 0 ? { column: card.column, index: i - 1 } : null;
      case "down":
        return i < list.length - 1 ? { column: card.column, index: i + 1 } : null;
    }
  }

  function cardRow(card: BoardCard): HTMLElement {
    if (card.id === undefined) {
      return h("div", { cls: "card-row" }, h("div", { testid: "card", cls: "card pending" }, `${card.title} (adding…)`));
    }
    const row = h(
      "div",
      { cls: "card-row" },
      h(
        "button",
        { testid: "card", cls: selected === card ? "card selected" : "card", onClick: () => select(card) },
        `#${card.id} ${card.title} · ${card.done}/${card.total}`,
      ),
    );
    for (const dir of DIRS) {
      const target = targetOf(card, dir);
      if (target === null) continue;
      // Entering Doing is held back while Doing already has the work-in-progress limit (answered or not).
      const entering = target.column === "doing" && card.column !== "doing";
      const disabled = cols[target.column].status !== "ok" || (entering && cols.doing.cards.length >= WIP_LIMIT);
      row.append(h("button", { testid: dir, cls: "move", disabled, onClick: () => move(card, dir) }, dir));
    }
    return row;
  }

  function columnNodes(col: Column): Node[] {
    const st = cols[col];
    if (st.status === "loading") return [h("p", { cls: "status" }, "loading")];
    if (st.status === "error") {
      return [
        h("p", { cls: "error" }, `error: ${st.error}`),
        h("button", { testid: `retry-${col}`, type: "button", onClick: () => loadColumn(col) }, "retry"),
      ];
    }
    return st.cards.map((card) => cardRow(card));
  }

  function renderColumns(): void {
    for (const col of COLUMNS) {
      const st = cols[col];
      heads[col].textContent = st.status === "ok" ? `${NAMES[col]} (${st.cards.length})` : NAMES[col];
      bodies[col].replaceChildren(...columnNodes(col));
    }
    addCardBtn.disabled = cols.todo.status !== "ok";
    addErrorSlot.replaceChildren(
      ...(addError === null ? [] : [h("p", { testid: "add-error", cls: "error" }, `add error: ${addError}`)]),
    );
  }

  function renderNotices(): void {
    const nodes: Node[] = [];
    if (moveError !== null) nodes.push(h("p", { testid: "move-error", cls: "error" }, `move error: ${moveError}`));
    if (archiveError !== null) nodes.push(h("p", { testid: "archive-error", cls: "error" }, `archive error: ${archiveError}`));
    notices.replaceChildren(...nodes);
  }

  // ---- detail panel ----

  // Builds the panel's fixed parts (inputs keep what is typed in them) for the current selection.
  function buildPanel(): void {
    if (selected === null) {
      view = null;
      detail.replaceChildren(h("p", { cls: "hint" }, "select a card"));
      return;
    }
    const heading = h("h2", {});
    const where = h("p", { cls: "where" });
    const renameInput = h("input", { testid: "title-input", placeholder: "Rename card" });
    const renameErr = h("div", {});
    const renameForm = h(
      "form",
      { cls: "inline", onSubmit: onRename },
      renameInput,
      h("button", { testid: "rename", type: "submit" }, "rename"),
    );
    const archiveBtn = h("button", { testid: "archive", type: "button", cls: "danger", onClick: onArchive }, "archive");
    const checklist = h("section", { testid: "checklist", cls: "checklist" });
    const progress = h("div", {});
    const itemErr = h("div", {});
    const itemInput = h("input", { testid: "item-input", placeholder: "New checklist item" });
    const addItemBtn = h("button", { testid: "add-item", type: "submit" }, "add");
    const itemForm = h("form", { cls: "inline", onSubmit: onAddItem }, itemInput, addItemBtn);
    detail.replaceChildren(heading, where, renameForm, renameErr, archiveBtn, h("h3", {}, "Checklist"), checklist, progress, itemErr, itemForm);
    view = { heading, where, renameInput, renameErr, checklist, progress, itemErr, itemInput, addItemBtn };
  }

  function checklistNodes(card: BoardCard): Node[] {
    if (check.status === "loading") return [h("p", { cls: "status" }, "loading checklist")];
    if (check.status === "error") return [h("p", { cls: "error" }, `checklist error: ${check.error}`)];
    return (card.items ?? []).map((item) => itemRow(card, item));
  }

  function itemRow(card: BoardCard, item: Item): HTMLElement {
    const pending = item.id === undefined;
    const label = `[${item.done ? "x" : " "}] ${item.text}${pending ? " (adding…)" : ""}`;
    const row = h("div", { cls: "item-row" }, h("span", { testid: "item" }, label));
    if (!pending) row.append(h("button", { testid: "toggle", type: "button", onClick: () => toggle(card, item) }, "toggle"));
    return row;
  }

  function progressNodes(card: BoardCard): Node[] {
    if (check.status !== "ok" || card.items === null) return [];
    const items = card.items;
    const done = items.filter((i) => i.done).length;
    return [h("p", { testid: "progress" }, `${done}/${items.length} done`)];
  }

  function updateDetail(): void {
    const card = selected;
    const v = view;
    if (card === null || v === null || card.id === undefined) return;
    v.heading.textContent = `#${card.id} ${card.title}`;
    v.where.textContent = `in ${NAMES[card.column]}`;
    v.renameErr.replaceChildren(
      ...(renameError === null ? [] : [h("p", { cls: "error" }, `rename error: ${renameError}`)]),
    );
    v.itemErr.replaceChildren(...(itemError === null ? [] : [h("p", { cls: "error" }, `item error: ${itemError}`)]));
    v.addItemBtn.disabled = check.status !== "ok";
    v.checklist.replaceChildren(...checklistNodes(card));
    v.progress.replaceChildren(...progressNodes(card));
  }

  function renderDetail(): void {
    if (built !== selected) {
      built = selected;
      buildPanel();
    }
    updateDetail();
  }

  function renderAll(): void {
    renderNotices();
    renderColumns();
    renderDetail();
  }

  // ---- actions ----

  function select(card: BoardCard): void {
    if (card.id === undefined || selected === card) return;
    const cardId = card.id;
    selected = card;
    checkToken += 1;
    const token = checkToken;
    renameError = null;
    itemError = null;
    card.items = null;
    check = { status: "loading", error: "" };
    renderAll();
    fetchChecklist(cardId).then(
      (list) => {
        if (!alive || token !== checkToken) return;
        card.items = list.map((i) => ({ id: i.id, text: i.text, done: i.done }));
        check = { status: "ok", error: "" };
        syncCounts(card);
        renderAll();
      },
      (err: unknown) => {
        if (!alive || token !== checkToken) return;
        check = { status: "error", error: errorMessage(err) };
        renderAll();
      },
    );
  }

  function move(card: BoardCard, dir: Dir): void {
    const target = targetOf(card, dir);
    if (target === null || card.id === undefined) return;
    const id = card.id;
    const from = card.column;
    const fromIndex = cols[from].cards.indexOf(card);
    moveError = null;
    detach(card);
    attach(card, target.column, target.index);
    renderAll();
    moveCard(id, target.column, target.index).then(
      () => undefined,
      (err: unknown) => {
        if (!alive) return;
        if (attached(card)) {
          detach(card);
          attach(card, from, fromIndex);
        }
        moveError = errorMessage(err);
        renderAll();
      },
    );
  }

  function onAdd(event: Event): void {
    event.preventDefault();
    const title = newCard.value.trim();
    if (title === "" || cols.todo.status !== "ok") return;
    addError = null;
    newCard.value = "";
    const card: BoardCard = { id: undefined, title, done: 0, total: 0, column: "todo", items: null };
    attach(card, "todo", cols.todo.cards.length);
    renderAll();
    addCard("todo", title).then(
      (created) => {
        if (!alive) return;
        card.id = created.id;
        renderAll();
      },
      (err: unknown) => {
        if (!alive) return;
        detach(card);
        addError = errorMessage(err);
        renderAll();
      },
    );
  }

  function onRename(event: Event): void {
    event.preventDefault();
    const card = selected;
    const v = view;
    if (card === null || v === null || card.id === undefined) return;
    const title = v.renameInput.value.trim();
    if (title === "") return;
    const cardId = card.id;
    const previous = card.title;
    renameError = null;
    card.title = title;
    renderAll();
    renameCard(cardId, title).then(
      () => undefined,
      (err: unknown) => {
        if (!alive) return;
        card.title = previous;
        if (selected === card) renameError = errorMessage(err);
        renderAll();
      },
    );
  }

  function onArchive(): void {
    if (selected !== null) archive(selected);
  }

  // Takes the card off the board and clears the selection; a declined archive puts it back where it was.
  function archive(card: BoardCard): void {
    if (card.id === undefined) return;
    const cardId = card.id;
    const from = card.column;
    const index = detach(card);
    archiveError = null;
    renameError = null;
    itemError = null;
    selected = null;
    checkToken += 1;
    check = { status: "loading", error: "" };
    renderAll();
    archiveCard(cardId).then(
      () => undefined,
      (err: unknown) => {
        if (!alive) return;
        attach(card, from, index);
        archiveError = errorMessage(err);
        renderAll();
      },
    );
  }

  function toggle(card: BoardCard, item: Item): void {
    const cardId = card.id;
    const itemId = item.id;
    if (cardId === undefined || itemId === undefined) return;
    const next = !item.done;
    itemError = null;
    item.done = next;
    syncCounts(card);
    renderAll();
    toggleItem(cardId, itemId, next).then(
      () => undefined,
      (err: unknown) => {
        if (!alive) return;
        item.done = !next;
        syncCounts(card);
        if (selected === card) itemError = errorMessage(err);
        renderAll();
      },
    );
  }

  function onAddItem(event: Event): void {
    event.preventDefault();
    const card = selected;
    const v = view;
    if (card === null || v === null || card.id === undefined || card.items === null || check.status !== "ok") return;
    const text = v.itemInput.value.trim();
    if (text === "") return;
    const cardId = card.id;
    const items = card.items;
    const pending: Item = { id: undefined, text, done: false };
    itemError = null;
    v.itemInput.value = "";
    items.push(pending);
    syncCounts(card);
    renderAll();
    addItem(cardId, text).then(
      (created) => {
        if (!alive) return;
        pending.id = created.id;
        pending.done = created.done;
        renderAll();
      },
      (err: unknown) => {
        if (!alive) return;
        const i = items.indexOf(pending);
        if (i >= 0) items.splice(i, 1);
        syncCounts(card);
        if (selected === card) itemError = errorMessage(err);
        renderAll();
      },
    );
  }

  // ---- start ----

  renderAll();
  for (const col of COLUMNS) loadColumn(col);

  return () => {
    alive = false;
  };
}
