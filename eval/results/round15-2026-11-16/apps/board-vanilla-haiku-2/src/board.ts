import { addCard, addItem, archiveCard, fetchCards, fetchChecklist, moveCard, renameCard, toggleItem } from "./api.js";
import type { Column } from "./api.js";
import { button, h, messageOf, textInput } from "./dom.js";
import type { Child } from "./dom.js";

const COLUMNS: readonly Column[] = ["todo", "doing", "done"];
const NAME: Record<Column, string> = { todo: "To do", doing: "Doing", done: "Done" };
const WIP_LIMIT = 3;

type Direction = "left" | "right" | "up" | "down";

/** A card as shown. `id` is null while its add is still in the air. */
interface Card { id: number | null; title: string; done: number; total: number; }
interface Item { id: number | null; text: string; done: boolean; }
interface ColumnState { status: "loading" | "error" | "ready"; error: string; cards: Card[]; }
/** The selected card's detail. A new object per selection, so late answers for an old selection are ignored. */
interface Detail {
  cardId: number;
  status: "loading" | "error" | "ready";
  error: string;
  items: Item[];
  renameError: string;
  itemError: string;
}
interface Found { column: Column; index: number; card: Card; }

/** Opens the board page in `container`. Returns the function that discards it. */
export function openBoard(container: HTMLElement): () => void {
  let alive = true;
  const cols: Record<Column, ColumnState> = {
    todo: { status: "loading", error: "", cards: [] },
    doing: { status: "loading", error: "", cards: [] },
    done: { status: "loading", error: "", cards: [] },
  };
  let detail: Detail | null = null;
  let moveError = "";
  let addError = "";
  let archiveError = "";
  /** input values kept across a rebuild of the page */
  let captured = new Map<string, string>();

  const find = (id: number): Found | null => {
    for (const column of COLUMNS) {
      const index = cols[column].cards.findIndex(c => c.id === id);
      if (index >= 0) return { column, index, card: cols[column].cards[index] };
    }
    return null;
  };

  const field = (testid: string): HTMLInputElement | null =>
    container.querySelector<HTMLInputElement>(`input[data-testid="${testid}"]`);
  const valueOf = (testid: string): string => field(testid)?.value ?? "";
  const clearField = (testid: string): void => {
    const f = field(testid);
    if (f) f.value = "";
  };
  const inputFor = (testid: string, placeholder: string, onEnter: () => void): HTMLInputElement => {
    const el = textInput(testid, placeholder, onEnter);
    el.value = captured.get(testid) ?? "";
    return el;
  };

  /** Moving into a column is refused while that column is not loaded, or while Doing is full. */
  const moveDisabled = (to: Column): boolean =>
    cols[to].status !== "ready" || (to === "doing" && cols.doing.cards.length >= WIP_LIMIT);

  const adjust = (id: number, doneDelta: number, totalDelta: number): void => {
    const f = find(id);
    if (f) {
      f.card.done += doneDelta;
      f.card.total += totalDelta;
    }
  };

  function render(): void {
    const values = new Map<string, string>();
    container.querySelectorAll<HTMLInputElement>("input[data-testid]").forEach(input => {
      values.set(input.dataset.testid ?? "", input.value);
    });
    const active = document.activeElement;
    const focusId = active instanceof HTMLInputElement && container.contains(active) ? active.dataset.testid : undefined;
    captured = values;
    container.replaceChildren(boardView());
    captured = new Map();
    if (focusId) container.querySelector<HTMLInputElement>(`input[data-testid="${focusId}"]`)?.focus();
  }

  function load(column: Column): void {
    cols[column] = { status: "loading", error: "", cards: [] };
    render();
    fetchCards(column).then(
      cards => {
        if (!alive) return;
        cols[column] = {
          status: "ready",
          error: "",
          cards: cards.map(c => ({ id: c.id, title: c.title, done: c.done, total: c.total })),
        };
        render();
      },
      (e: unknown) => {
        if (!alive) return;
        cols[column] = { status: "error", error: messageOf(e), cards: [] };
        render();
      },
    );
  }

  function move(id: number, dir: Direction): void {
    const found = find(id);
    if (!found) return;
    const from = found.column;
    const fromIndex = found.index;
    const card = found.card;
    let to: Column;
    let toIndex: number;
    if (dir === "up" || dir === "down") {
      to = from;
      toIndex = dir === "up" ? fromIndex - 1 : fromIndex + 1;
      if (toIndex < 0 || toIndex >= cols[from].cards.length) return;
    } else {
      const next = COLUMNS.indexOf(from) + (dir === "right" ? 1 : -1);
      if (next < 0 || next >= COLUMNS.length) return;
      to = COLUMNS[next];
      if (moveDisabled(to)) return;
      toIndex = cols[to].cards.length;
    }
    moveError = "";
    cols[from].cards.splice(fromIndex, 1);
    cols[to].cards.splice(toIndex, 0, card);
    render();
    moveCard(id, to, toIndex).then(
      () => {},
      (e: unknown) => {
        if (!alive) return;
        const now = find(id);
        if (now) {
          cols[now.column].cards.splice(now.index, 1);
          cols[from].cards.splice(Math.min(fromIndex, cols[from].cards.length), 0, card);
        }
        moveError = `move error: ${messageOf(e)}`;
        render();
      },
    );
  }

  function addClick(): void {
    const title = valueOf("new-card").trim();
    if (cols.todo.status !== "ready" || !title) return;
    addError = "";
    const pending: Card = { id: null, title, done: 0, total: 0 };
    cols.todo.cards.push(pending);
    clearField("new-card");
    render();
    addCard("todo", title).then(
      created => {
        if (!alive) return;
        pending.id = created.id;
        render();
      },
      (e: unknown) => {
        if (!alive) return;
        const i = cols.todo.cards.indexOf(pending);
        if (i >= 0) cols.todo.cards.splice(i, 1);
        addError = `add error: ${messageOf(e)}`;
        render();
      },
    );
  }

  function select(id: number): void {
    if (detail?.cardId === id) return;
    const d: Detail = { cardId: id, status: "loading", error: "", items: [], renameError: "", itemError: "" };
    detail = d;
    clearField("title-input");
    clearField("item-input");
    render();
    fetchChecklist(id).then(
      items => {
        if (!alive || detail !== d) return;
        d.items = items.map(item => ({ id: item.id, text: item.text, done: item.done }));
        d.status = "ready";
        render();
      },
      (e: unknown) => {
        if (!alive || detail !== d) return;
        d.status = "error";
        d.error = messageOf(e);
        render();
      },
    );
  }

  function rename(): void {
    const d = detail;
    if (!d) return;
    const title = valueOf("title-input").trim();
    const found = find(d.cardId);
    if (!title || !found) return;
    const id = d.cardId;
    const previous = found.card.title;
    d.renameError = "";
    found.card.title = title;
    clearField("title-input");
    render();
    renameCard(id, title).then(
      () => {},
      (e: unknown) => {
        if (!alive) return;
        const now = find(id);
        if (now && now.card.title === title) now.card.title = previous;
        d.renameError = `rename error: ${messageOf(e)}`;
        render();
      },
    );
  }

  function archive(): void {
    const d = detail;
    const found = d ? find(d.cardId) : null;
    if (!d || !found) return;
    const id = d.cardId;
    const { column, index, card } = found;
    archiveError = "";
    cols[column].cards.splice(index, 1);
    detail = null;
    render();
    archiveCard(id).then(
      () => {},
      (e: unknown) => {
        if (!alive) return;
        const target = cols[column];
        target.cards.splice(Math.min(index, target.cards.length), 0, card);
        archiveError = `archive error: ${messageOf(e)}`;
        render();
      },
    );
  }

  function toggle(d: Detail, item: Item): void {
    if (item.id === null || d.status !== "ready") return;
    const cardId = d.cardId;
    const itemId = item.id;
    const next = !item.done;
    d.itemError = "";
    item.done = next;
    adjust(cardId, next ? 1 : -1, 0);
    render();
    toggleItem(cardId, itemId, next).then(
      () => {},
      (e: unknown) => {
        if (!alive) return;
        item.done = !next;
        adjust(cardId, next ? -1 : 1, 0);
        d.itemError = `item error: ${messageOf(e)}`;
        render();
      },
    );
  }

  function addItemClick(): void {
    const d = detail;
    const text = valueOf("item-input").trim();
    if (!d || d.status !== "ready" || !text) return;
    const cardId = d.cardId;
    const item: Item = { id: null, text, done: false };
    d.itemError = "";
    d.items.push(item);
    adjust(cardId, 0, 1);
    clearField("item-input");
    render();
    addItem(cardId, text).then(
      created => {
        if (!alive) return;
        item.id = created.id;
        render();
      },
      (e: unknown) => {
        if (!alive) return;
        const i = d.items.indexOf(item);
        if (i >= 0) d.items.splice(i, 1);
        adjust(cardId, 0, -1);
        d.itemError = `item error: ${messageOf(e)}`;
        render();
      },
    );
  }

  function moveButton(dir: Direction, column: Column, id: number): HTMLButtonElement {
    const ci = COLUMNS.indexOf(column);
    const to = dir === "left" ? COLUMNS[ci - 1] : dir === "right" ? COLUMNS[ci + 1] : column;
    const disabled = (dir === "left" || dir === "right") && moveDisabled(to);
    return button(dir, () => move(id, dir), { testid: dir, disabled });
  }

  /** The move buttons that have somewhere to go, as direct children of the card's row. */
  function moveButtons(column: Column, index: number, id: number): HTMLButtonElement[] {
    const ci = COLUMNS.indexOf(column);
    const count = cols[column].cards.length;
    const buttons: HTMLButtonElement[] = [];
    if (ci > 0) buttons.push(moveButton("left", column, id));
    if (ci < COLUMNS.length - 1) buttons.push(moveButton("right", column, id));
    if (index > 0) buttons.push(moveButton("up", column, id));
    if (index < count - 1) buttons.push(moveButton("down", column, id));
    return buttons;
  }

  function cardRow(column: Column, card: Card, index: number): HTMLElement {
    if (card.id === null) {
      const pending = h("div", { testid: "card", cls: "card pending" }, `${card.title} (adding…)`);
      return h("li", { cls: "card-row" }, pending);
    }
    const id = card.id;
    const selected = detail?.cardId === id;
    const body = button(`#${id} ${card.title} · ${card.done}/${card.total}`, () => select(id), { testid: "card" });
    body.className = selected ? "card selected" : "card";
    body.setAttribute("aria-pressed", String(selected));
    return h("li", { cls: "card-row" }, body, ...moveButtons(column, index, id));
  }

  function addForm(): HTMLElement {
    return h(
      "div",
      { cls: "add" },
      inputFor("new-card", "New card title", addClick),
      button("Add", addClick, { testid: "add-card" }),
      addError ? h("p", { testid: "add-error", cls: "error" }, addError) : null,
    );
  }

  function columnView(column: Column): HTMLElement {
    const state = cols[column];
    const heading = h(
      "h2",
      { testid: `head-${column}` },
      state.status === "ready" ? `${NAME[column]} (${state.cards.length})` : NAME[column],
    );
    let status: Child = null;
    if (state.status === "loading") {
      status = h("p", { cls: "muted" }, "loading");
    } else if (state.status === "error") {
      status = h(
        "div",
        { cls: "error-row" },
        h("p", { cls: "error" }, `error: ${state.error}`),
        button("retry", () => load(column), { testid: `retry-${column}` }),
      );
    }
    const list = state.status === "ready"
      ? h("ul", { cls: "cards" }, ...state.cards.map((card, index) => cardRow(column, card, index)))
      : null;
    return h(
      "section",
      { testid: `col-${column}`, cls: "column" },
      heading,
      status,
      list,
      column === "todo" ? addForm() : null,
    );
  }

  function checklistView(d: Detail): HTMLElement {
    if (d.status === "loading") return h("div", { testid: "checklist" }, "loading checklist");
    if (d.status === "error") return h("div", { testid: "checklist", cls: "error" }, `checklist error: ${d.error}`);
    return h("div", { testid: "checklist" }, h("ul", { cls: "items" }, ...d.items.map(item => itemRow(d, item))));
  }

  function itemRow(d: Detail, item: Item): HTMLElement {
    const pending = item.id === null;
    const label = `${item.done ? "[x]" : "[ ]"} ${item.text}${pending ? " (adding…)" : ""}`;
    return h(
      "li",
      { cls: "item-row" },
      h("span", { testid: "item" }, label),
      pending ? null : button("toggle", () => toggle(d, item), { testid: "toggle" }),
    );
  }

  function detailView(): HTMLElement {
    const d = detail;
    const found = d ? find(d.cardId) : null;
    if (!d || !found) {
      return h("section", { testid: "detail", cls: "detail" }, h("p", { cls: "muted" }, "select a card"));
    }
    const doneCount = d.items.filter(item => item.done).length;
    return h(
      "section",
      { testid: "detail", cls: "detail" },
      h("h2", {}, `#${d.cardId} ${found.card.title}`),
      h("p", {}, `in ${NAME[found.column]}`),
      h(
        "div",
        { cls: "row" },
        inputFor("title-input", "New title", rename),
        button("rename", rename, { testid: "rename" }),
      ),
      d.renameError ? h("p", { testid: "rename-error", cls: "error" }, d.renameError) : null,
      h("div", { cls: "row" }, button("archive", archive, { testid: "archive" })),
      checklistView(d),
      d.status === "ready" ? h("p", { testid: "progress" }, `${doneCount}/${d.items.length} done`) : null,
      h(
        "div",
        { cls: "add-item" },
        inputFor("item-input", "New checklist item", addItemClick),
        button("add item", addItemClick, { testid: "add-item" }),
      ),
      d.itemError ? h("p", { testid: "item-error", cls: "error" }, d.itemError) : null,
    );
  }

  function boardView(): HTMLElement {
    return h(
      "div",
      { cls: "layout" },
      h(
        "div",
        { cls: "board-wrap" },
        moveError ? h("p", { testid: "move-error", cls: "error" }, moveError) : null,
        archiveError ? h("p", { testid: "archive-error", cls: "error" }, archiveError) : null,
        h("div", { cls: "board" }, ...COLUMNS.map(column => columnView(column))),
      ),
      detailView(),
    );
  }

  COLUMNS.forEach(column => load(column));

  return () => {
    alive = false;
    container.replaceChildren();
  };
}
