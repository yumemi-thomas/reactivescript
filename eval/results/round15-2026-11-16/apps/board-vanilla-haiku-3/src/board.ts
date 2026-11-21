import { addCard, addItem, archiveCard, fetchCards, fetchChecklist, moveCard, renameCard, toggleItem } from "./api.js";
import type { Card, Column, Item } from "./api.js";
import { type Child, errorMessage, h } from "./dom.js";

export const COLUMNS: readonly Column[] = ["todo", "doing", "done"];
const NAME: Record<Column, string> = { todo: "To do", doing: "Doing", done: "Done" };
/** Doing holds at most this many cards. */
const WIP_LIMIT = 3;
const DIRECTIONS = ["left", "right", "up", "down"] as const;
type Direction = (typeof DIRECTIONS)[number];

type Status = { kind: "loading" } | { kind: "error"; message: string } | { kind: "ready" };
/** A card on the board. `id` is null while the server has not yet answered an add. */
interface BoardCard { id: number | null; title: string; done: number; total: number }
interface ColumnState { status: Status; cards: BoardCard[] }
interface ItemView { id: number | null; text: string; done: boolean }
interface Checklist { cardId: number; status: "loading" | "error" | "ready"; error: string; items: ItemView[] }
interface Where { column: Column; index: number }

function toBoardCard(card: Card): BoardCard {
  return { id: card.id, title: card.title, done: card.done, total: card.total };
}

function toItemView(item: Item): ItemView {
  return { id: item.id, text: item.text, done: item.done };
}

/**
 * The board page. Every change is applied to the local model first and rendered at once; the
 * server call follows, and a declined call reverts the local change. Callbacks that arrive after
 * the page was left (destroy) are ignored.
 */
export class BoardPage {
  private alive = true;
  private columns: Record<Column, ColumnState> = {
    todo: { status: { kind: "loading" }, cards: [] },
    doing: { status: { kind: "loading" }, cards: [] },
    done: { status: { kind: "loading" }, cards: [] },
  };
  private selectedId: number | null = null;
  private checklist: Checklist | null = null;
  private moveError = "";
  private addError = "";
  private archiveError = "";
  private renameError = "";
  private itemError = "";

  private readonly heads = {} as Record<Column, HTMLElement>;
  private readonly bodies = {} as Record<Column, HTMLElement>;
  private readonly moveErrorEl: HTMLElement;
  private readonly archiveErrorEl: HTMLElement;
  private addErrorEl!: HTMLElement;
  private newCardInput!: HTMLInputElement;
  private addButton!: HTMLButtonElement;
  private emptyNote!: HTMLElement;
  private selectedBody!: HTMLElement;
  private detailTitle!: HTMLElement;
  private detailColumn!: HTMLElement;
  private titleInput!: HTMLInputElement;
  private renameErrorEl!: HTMLElement;
  private archiveButton!: HTMLButtonElement;
  private checklistEl!: HTMLElement;
  private progressEl!: HTMLElement;
  private itemErrorEl!: HTMLElement;
  private itemInput!: HTMLInputElement;
  private addItemButton!: HTMLButtonElement;

  constructor(container: HTMLElement) {
    this.moveErrorEl = h("p", { testid: "move-error", cls: "error", attrs: { role: "alert" }, hidden: true });
    this.archiveErrorEl = h("p", { testid: "archive-error", cls: "error", attrs: { role: "alert" }, hidden: true });
    const columnEls = COLUMNS.map(column => this.buildColumn(column));
    const detail = this.buildDetail();
    container.append(
      h("div", { cls: "board" },
        h("div", { cls: "messages" }, this.moveErrorEl, this.archiveErrorEl),
        h("div", { cls: "columns" }, ...columnEls),
        detail,
      ),
    );
    this.renderAll();
    for (const column of COLUMNS) this.loadColumn(column);
  }

  destroy(): void {
    this.alive = false;
  }

  // ---- building the static DOM (inputs live here, so re-rendering never wipes what was typed)

  private buildColumn(column: Column): HTMLElement {
    const head = h("h2", { testid: `head-${column}` }, NAME[column]);
    const body = h("div", { cls: "col-body" });
    this.heads[column] = head;
    this.bodies[column] = body;
    const parts: Child[] = [head, body];
    if (column === "todo") {
      this.newCardInput = h("input", {
        testid: "new-card",
        attrs: { type: "text", "aria-label": "New card title", placeholder: "New card", autocomplete: "off" },
      });
      this.addButton = h("button", { testid: "add-card", attrs: { type: "button" }, on: { click: () => this.add() } }, "add");
      this.addErrorEl = h("p", { testid: "add-error", cls: "error", attrs: { role: "alert" }, hidden: true });
      parts.push(
        h("form", { cls: "inline-form", on: { submit: event => { event.preventDefault(); this.add(); } } },
          this.newCardInput, this.addButton),
        this.addErrorEl,
      );
    }
    return h("section", { testid: `col-${column}`, cls: `column column-${column}` }, ...parts);
  }

  private buildDetail(): HTMLElement {
    this.emptyNote = h("p", { cls: "muted" }, "select a card");
    this.detailTitle = h("h2", {});
    this.detailColumn = h("p", { cls: "muted" });
    this.titleInput = h("input", {
      testid: "title-input",
      attrs: { type: "text", "aria-label": "New title", placeholder: "Rename card", autocomplete: "off" },
    });
    const renameButton = h("button", { testid: "rename", attrs: { type: "button" }, on: { click: () => this.rename() } }, "rename");
    this.renameErrorEl = h("p", { testid: "rename-error", cls: "error", attrs: { role: "alert" }, hidden: true });
    this.archiveButton = h("button", { testid: "archive", attrs: { type: "button" }, on: { click: () => this.archive() } }, "archive");
    this.checklistEl = h("div", { testid: "checklist", cls: "checklist" });
    this.progressEl = h("p", { testid: "progress", cls: "muted" });
    this.itemErrorEl = h("p", { testid: "item-error", cls: "error", attrs: { role: "alert" }, hidden: true });
    this.itemInput = h("input", {
      testid: "item-input",
      attrs: { type: "text", "aria-label": "New checklist item", placeholder: "Add an item", autocomplete: "off" },
    });
    this.addItemButton = h("button", { testid: "add-item", attrs: { type: "button" }, on: { click: () => this.addItem() } }, "add item");
    this.selectedBody = h("div", { cls: "detail-body", hidden: true },
      this.detailTitle,
      this.detailColumn,
      h("form", { cls: "inline-form", on: { submit: event => { event.preventDefault(); this.rename(); } } },
        this.titleInput, renameButton),
      this.renameErrorEl,
      h("div", { cls: "row" }, this.archiveButton),
      this.checklistEl,
      this.progressEl,
      this.itemErrorEl,
      h("form", { cls: "inline-form", on: { submit: event => { event.preventDefault(); this.addItem(); } } },
        this.itemInput, this.addItemButton),
    );
    return h("section", { testid: "detail", cls: "detail" }, this.emptyNote, this.selectedBody);
  }

  // ---- rendering

  private renderAll(): void {
    if (!this.alive) return;
    for (const column of COLUMNS) this.renderColumn(column);
    this.moveErrorEl.textContent = this.moveError;
    this.moveErrorEl.hidden = this.moveError === "";
    this.archiveErrorEl.textContent = this.archiveError;
    this.archiveErrorEl.hidden = this.archiveError === "";
    this.addErrorEl.textContent = this.addError;
    this.addErrorEl.hidden = this.addError === "";
    this.addButton.disabled = this.columns.todo.status.kind !== "ready";
    this.renderDetail();
  }

  private renderColumn(column: Column): void {
    const state = this.columns[column];
    const body = this.bodies[column];
    this.heads[column].textContent = state.status.kind === "ready" ? `${NAME[column]} (${state.cards.length})` : NAME[column];
    const status = state.status;
    if (status.kind === "loading") {
      body.replaceChildren(h("p", { testid: "loading", cls: "muted" }, "loading"));
    } else if (status.kind === "error") {
      body.replaceChildren(
        h("p", { testid: "column-error", cls: "error", attrs: { role: "alert" } }, `error: ${status.message}`),
        h("button", { testid: `retry-${column}`, attrs: { type: "button" }, on: { click: () => this.retry(column) } }, "retry"),
      );
    } else {
      body.replaceChildren(h("ul", { cls: "cards" },
        ...state.cards.map((card, index) => this.cardRow(column, card, index))));
    }
  }

  private cardRow(column: Column, card: BoardCard, index: number): HTMLElement {
    if (card.id === null) {
      return h("li", { cls: "card-row" }, h("div", { testid: "card", cls: "card card-pending" }, `${card.title} (adding…)`));
    }
    const id = card.id;
    const selected = id === this.selectedId;
    const face = h("button", {
      testid: "card",
      cls: selected ? "card selected" : "card",
      attrs: { type: "button", "aria-pressed": String(selected) },
      on: { click: () => this.select(id) },
    }, `#${id} ${card.title} · ${card.done}/${card.total}`);
    const moves = h("div", { cls: "moves" });
    for (const dir of DIRECTIONS) {
      const to = this.destination(column, index, dir);
      if (!to) continue;
      moves.append(h("button", {
        testid: dir,
        attrs: { type: "button" },
        disabled: !this.canMove(column, to.column),
        on: { click: () => this.move(id, dir) },
      }, dir));
    }
    return h("li", { cls: "card-row" }, face, moves);
  }

  private renderDetail(): void {
    const id = this.selectedId;
    const card = id === null ? null : this.findCard(id);
    const where = id === null ? null : this.locate(id);
    if (!card || !where || card.id === null) {
      this.emptyNote.hidden = false;
      this.selectedBody.hidden = true;
      return;
    }
    this.emptyNote.hidden = true;
    this.selectedBody.hidden = false;
    this.detailTitle.textContent = `#${card.id} ${card.title}`;
    this.detailColumn.textContent = `in ${NAME[where.column]}`;
    this.renameErrorEl.textContent = this.renameError;
    this.renameErrorEl.hidden = this.renameError === "";
    this.itemErrorEl.textContent = this.itemError;
    this.itemErrorEl.hidden = this.itemError === "";
    this.renderChecklist();
  }

  private renderChecklist(): void {
    const list = this.checklist;
    if (!list) {
      this.checklistEl.replaceChildren();
      this.progressEl.textContent = "";
      return;
    }
    this.addItemButton.disabled = list.status !== "ready";
    if (list.status === "loading") {
      this.checklistEl.replaceChildren(h("p", { cls: "muted" }, "loading checklist"));
      this.progressEl.textContent = "";
    } else if (list.status === "error") {
      this.checklistEl.replaceChildren(h("p", { cls: "error", attrs: { role: "alert" } }, `checklist error: ${list.error}`));
      this.progressEl.textContent = "";
    } else {
      this.checklistEl.replaceChildren(h("ul", { cls: "items" },
        ...list.items.map(item => this.itemRow(list, item))));
      const done = list.items.filter(item => item.done).length;
      this.progressEl.textContent = `${done}/${list.items.length} done`;
    }
  }

  private itemRow(list: Checklist, item: ItemView): HTMLElement {
    if (item.id === null) {
      return h("li", { cls: "item-row" }, h("span", { testid: "item", cls: "item" }, `[ ] ${item.text} (adding…)`));
    }
    return h("li", { cls: "item-row" },
      h("span", { testid: "item", cls: "item" }, `${item.done ? "[x]" : "[ ]"} ${item.text}`),
      h("button", { testid: "toggle", attrs: { type: "button" }, on: { click: () => this.toggle(list, item) } }, "toggle"),
    );
  }

  // ---- locating and moving

  private locate(id: number): Where | null {
    for (const column of COLUMNS) {
      const index = this.columns[column].cards.findIndex(card => card.id === id);
      if (index >= 0) return { column, index };
    }
    return null;
  }

  private findCard(id: number): BoardCard | null {
    const at = this.locate(id);
    return at ? this.columns[at.column].cards[at.index] : null;
  }

  /** Where a card at `index` in `from` lands with `dir`, or null when there is nowhere to go. */
  private destination(from: Column, index: number, dir: Direction): Where | null {
    const at = COLUMNS.indexOf(from);
    switch (dir) {
      case "left": {
        if (at === 0) return null;
        const column = COLUMNS[at - 1];
        return { column, index: this.columns[column].cards.length };
      }
      case "right": {
        if (at === COLUMNS.length - 1) return null;
        const column = COLUMNS[at + 1];
        return { column, index: this.columns[column].cards.length };
      }
      case "up":
        return index > 0 ? { column: from, index: index - 1 } : null;
      case "down":
        return index < this.columns[from].cards.length - 1 ? { column: from, index: index + 1 } : null;
    }
  }

  private canMove(from: Column, to: Column): boolean {
    if (this.columns[to].status.kind !== "ready") return false;
    if (to !== from && to === "doing" && this.columns.doing.cards.length >= WIP_LIMIT) return false;
    return true;
  }

  private move(id: number, dir: Direction): void {
    this.moveError = "";
    const at = this.locate(id);
    if (!at) return;
    const to = this.destination(at.column, at.index, dir);
    if (!to || !this.canMove(at.column, to.column)) {
      this.renderAll();
      return;
    }
    const [card] = this.columns[at.column].cards.splice(at.index, 1);
    this.columns[to.column].cards.splice(to.index, 0, card);
    this.renderAll();
    moveCard(id, to.column, to.index).then(
      () => {},
      (error: unknown) => {
        if (!this.alive) return;
        const now = this.locate(id);
        // Put the card back where it was, unless it has left the board meanwhile (archived).
        if (now) {
          this.columns[now.column].cards.splice(now.index, 1);
          const origin = this.columns[at.column].cards;
          origin.splice(Math.min(at.index, origin.length), 0, card);
        }
        this.moveError = `move error: ${errorMessage(error)}`;
        this.renderAll();
      },
    );
  }

  // ---- loading columns

  private loadColumn(column: Column): void {
    fetchCards(column).then(
      cards => {
        if (!this.alive) return;
        this.columns[column] = { status: { kind: "ready" }, cards: cards.map(toBoardCard) };
        this.renderAll();
      },
      (error: unknown) => {
        if (!this.alive) return;
        this.columns[column] = { status: { kind: "error", message: errorMessage(error) }, cards: [] };
        this.renderAll();
      },
    );
  }

  private retry(column: Column): void {
    this.columns[column] = { status: { kind: "loading" }, cards: [] };
    this.renderAll();
    this.loadColumn(column);
  }

  // ---- adding cards

  private add(): void {
    const title = this.newCardInput.value.trim();
    if (!title || this.columns.todo.status.kind !== "ready") return;
    this.addError = "";
    const card: BoardCard = { id: null, title, done: 0, total: 0 };
    this.columns.todo.cards.push(card);
    this.newCardInput.value = "";
    this.renderAll();
    addCard("todo", title).then(
      created => {
        if (!this.alive) return;
        card.id = created.id;
        this.renderAll();
      },
      (error: unknown) => {
        if (!this.alive) return;
        const at = this.columns.todo.cards.indexOf(card);
        if (at >= 0) this.columns.todo.cards.splice(at, 1);
        this.addError = `add error: ${errorMessage(error)}`;
        this.renderAll();
      },
    );
  }

  // ---- selecting and the detail

  private select(id: number | null): void {
    if (id === this.selectedId) return;
    this.selectedId = id;
    this.renameError = "";
    this.itemError = "";
    this.titleInput.value = "";
    this.itemInput.value = "";
    this.checklist = null;
    if (id !== null) this.loadChecklist(id);
    this.renderAll();
  }

  private loadChecklist(cardId: number): void {
    const list: Checklist = { cardId, status: "loading", error: "", items: [] };
    this.checklist = list;
    fetchChecklist(cardId).then(
      items => {
        if (!this.alive || this.checklist !== list) return;
        list.items = items.map(toItemView);
        list.status = "ready";
        // The server's checklist is authoritative for the card's counts.
        const card = this.findCard(cardId);
        if (card) {
          card.done = list.items.filter(item => item.done).length;
          card.total = list.items.length;
        }
        this.renderAll();
      },
      (error: unknown) => {
        if (!this.alive || this.checklist !== list) return;
        list.status = "error";
        list.error = errorMessage(error);
        this.renderAll();
      },
    );
  }

  /** Moves a card's done and total counts on the board, if the card is still there. */
  private adjustCounts(cardId: number, doneDelta: number, totalDelta: number): void {
    const card = this.findCard(cardId);
    if (card) {
      card.done += doneDelta;
      card.total += totalDelta;
    }
  }

  private rename(): void {
    const id = this.selectedId;
    const title = this.titleInput.value.trim();
    if (id === null || !title) return;
    const card = this.findCard(id);
    if (!card) return;
    const previous = card.title;
    this.renameError = "";
    card.title = title;
    this.renderAll();
    renameCard(id, title).then(
      () => {},
      (error: unknown) => {
        if (!this.alive) return;
        card.title = previous;
        if (this.selectedId === id) this.renameError = `rename error: ${errorMessage(error)}`;
        this.renderAll();
      },
    );
  }

  private archive(): void {
    const id = this.selectedId;
    if (id === null) return;
    const at = this.locate(id);
    if (!at) return;
    this.archiveError = "";
    const [card] = this.columns[at.column].cards.splice(at.index, 1);
    this.select(null);
    this.renderAll();
    archiveCard(id).then(
      () => {},
      (error: unknown) => {
        if (!this.alive) return;
        const cards = this.columns[at.column].cards;
        cards.splice(Math.min(at.index, cards.length), 0, card);
        this.archiveError = `archive error: ${errorMessage(error)}`;
        this.renderAll();
      },
    );
  }

  private toggle(list: Checklist, item: ItemView): void {
    const itemId = item.id;
    if (itemId === null || list.status !== "ready") return;
    const next = !item.done;
    this.itemError = "";
    item.done = next;
    this.adjustCounts(list.cardId, next ? 1 : -1, 0);
    this.renderAll();
    toggleItem(list.cardId, itemId, next).then(
      () => {},
      (error: unknown) => {
        if (!this.alive) return;
        item.done = !next;
        this.adjustCounts(list.cardId, next ? -1 : 1, 0);
        if (this.checklist === list) this.itemError = `item error: ${errorMessage(error)}`;
        this.renderAll();
      },
    );
  }

  private addItem(): void {
    const list = this.checklist;
    if (!list || list.status !== "ready") return;
    const text = this.itemInput.value.trim();
    if (!text) return;
    const cardId = list.cardId;
    this.itemError = "";
    const item: ItemView = { id: null, text, done: false };
    list.items.push(item);
    this.adjustCounts(cardId, 0, 1);
    this.itemInput.value = "";
    this.renderAll();
    addItem(cardId, text).then(
      created => {
        if (!this.alive) return;
        item.id = created.id;
        this.renderAll();
      },
      (error: unknown) => {
        if (!this.alive) return;
        const at = list.items.indexOf(item);
        if (at >= 0) list.items.splice(at, 1);
        this.adjustCounts(cardId, 0, -1);
        if (this.checklist === list) this.itemError = `item error: ${errorMessage(error)}`;
        this.renderAll();
      },
    );
  }
}
