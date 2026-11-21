import * as api from "./api.js";
import type { Card, Column, Item } from "./api.js";
import { Lifetime, button, h, messageOf, textInput } from "./dom.js";

const COLUMNS: Column[] = ["todo", "doing", "done"];
const NAMES: Record<Column, string> = { todo: "To do", doing: "Doing", done: "Done" };
const WIP_LIMIT = 3;

type ColState = { status: "loading" | "error" | "ready"; error: string; ids: number[]; token: number };

type BoardOp =
  | { op: number; kind: "move"; id: number; column: Column; index: number }
  | { op: number; kind: "rename"; id: number; title: string }
  | { op: number; kind: "archive"; id: number }
  | { op: number; kind: "add"; title: string };

type ItemOp =
  | { op: number; kind: "toggle"; cardId: number; itemId: number; done: boolean }
  | { op: number; kind: "add"; cardId: number; text: string };

type ShownCard = { id: number; title: string; done: number; total: number };
type Shown = Record<Column, ShownCard[]>;
type ShownItem = { id: number | null; text: string; done: boolean };

type Detail = {
  id: number;
  lastColumn: Column | null;
  checklist: { status: "loading" | "error" | "ready"; error: string; token: number };
  renameError: string;
  itemError: string;
  root: HTMLElement;
  head: HTMLElement;
  where: HTMLElement;
  titleInput: HTMLInputElement;
  renameError_el: HTMLElement;
  checklistEl: HTMLElement;
  progress: HTMLElement;
  itemInput: HTMLInputElement;
  itemErrorEl: HTMLElement;
};

const isColumn = (v: unknown): v is Column => v === "todo" || v === "doing" || v === "done";

export class BoardPage {
  readonly el: HTMLElement;
  private life = new Lifetime();
  private seq = 0;

  // confirmed (server-answered) state
  private cols: Record<Column, ColState> = {
    todo: { status: "loading", error: "", ids: [], token: 0 },
    doing: { status: "loading", error: "", ids: [], token: 0 },
    done: { status: "loading", error: "", ids: [], token: 0 },
  };
  private cards = new Map<number, Card>();
  private items = new Map<number, Item[]>();

  // optimistic actions the server has not answered yet, oldest first
  private boardOps: BoardOp[] = [];
  private itemOps: ItemOp[] = [];

  private moveError = "";
  private addError = "";
  private archiveError = "";
  private detail: Detail | null = null;

  // persistent elements
  private heads = {} as Record<Column, HTMLElement>;
  private bodies = {} as Record<Column, HTMLElement>;
  private newCard: HTMLInputElement;
  private addErrorEl = h("p", { testid: "add-error", class: "error", role: "alert" });
  private moveErrorEl = h("p", { testid: "move-error", class: "error", role: "alert" });
  private archiveErrorEl = h("p", { testid: "archive-error", class: "error", role: "alert" });
  private errorsEl = h("div", { class: "board-errors" });
  private addErrorSlot = h("div");
  private detailEl = h("aside", { testid: "detail", class: "detail", "aria-label": "Card detail" });

  constructor() {
    this.newCard = textInput("new-card", "New card title", () => this.addCard());
    const columns = h("div", { class: "columns" });
    for (const c of COLUMNS) {
      this.heads[c] = h("h2", { testid: `head-${c}` });
      this.bodies[c] = h("div", { class: "cards", "aria-live": "polite" });
      const col = h("section", { testid: `col-${c}`, class: "column" }, this.heads[c], this.bodies[c]);
      if (c === "todo") {
        col.append(h("div", { class: "add-row" }, this.newCard, button("add", "add-card", () => this.addCard())), this.addErrorSlot);
      }
      columns.append(col);
    }
    this.el = h("div", { class: "board-page" }, this.errorsEl, h("div", { class: "board-layout" }, columns, this.detailEl));
    for (const c of COLUMNS) this.load(c);
    this.render();
  }

  destroy(): void { this.life.end(); }

  // ---------- loading ----------

  private load(c: Column): void {
    const col = this.cols[c];
    const token = ++col.token;
    col.status = "loading";
    col.error = "";
    this.life.watch(api.fetchCards(c), list => {
      if (this.cols[c].token !== token) return;
      const ids: number[] = [];
      for (const card of Array.isArray(list) ? list : []) {
        if (ids.includes(card.id)) continue;
        this.cards.set(card.id, { ...card });
        ids.push(card.id);
      }
      // the fresh list wins: a card can only be in one column
      for (const other of COLUMNS) if (other !== c) this.cols[other].ids = this.cols[other].ids.filter(id => !ids.includes(id));
      col.ids = ids;
      col.status = "ready";
      this.render();
    }, err => {
      if (this.cols[c].token !== token) return;
      col.status = "error";
      col.error = messageOf(err);
      col.ids = [];
      this.render();
    });
  }

  // ---------- derived (shown) state ----------

  private shownItems(cardId: number): ShownItem[] | null {
    const base = this.items.get(cardId);
    if (!base) return null;
    const list: ShownItem[] = base.map(i => ({ id: i.id, text: i.text, done: i.done }));
    for (const o of this.itemOps) {
      if (o.cardId !== cardId) continue;
      if (o.kind === "toggle") {
        const it = list.find(i => i.id === o.itemId);
        if (it) it.done = o.done;
      } else {
        list.push({ id: null, text: o.text, done: false });
      }
    }
    return list;
  }

  private shownCounts(card: Card): { done: number; total: number } {
    const base = this.items.get(card.id);
    if (!base || !this.itemOps.some(o => o.cardId === card.id)) return { done: card.done, total: card.total };
    const shown = this.shownItems(card.id) ?? [];
    const doneDelta = shown.filter(i => i.done).length - base.filter(i => i.done).length;
    const totalDelta = shown.length - base.length;
    return { done: card.done + doneDelta, total: card.total + totalDelta };
  }

  private shown(): { cols: Shown; adding: string[] } {
    const pos: Record<Column, number[]> = { todo: [...this.cols.todo.ids], doing: [...this.cols.doing.ids], done: [...this.cols.done.ids] };
    const titles = new Map<number, string>();
    const adding: string[] = [];
    const remove = (id: number): boolean => {
      for (const c of COLUMNS) {
        const i = pos[c].indexOf(id);
        if (i >= 0) { pos[c].splice(i, 1); return true; }
      }
      return false;
    };
    for (const o of this.boardOps) {
      if (o.kind === "move") {
        if (remove(o.id)) pos[o.column].splice(Math.max(0, Math.min(o.index, pos[o.column].length)), 0, o.id);
      } else if (o.kind === "archive") remove(o.id);
      else if (o.kind === "rename") titles.set(o.id, o.title);
      else adding.push(o.title);
    }
    const cols = {} as Shown;
    for (const c of COLUMNS) {
      cols[c] = pos[c].flatMap(id => {
        const card = this.cards.get(id);
        if (!card) return [];
        return [{ id, title: titles.get(id) ?? card.title, ...this.shownCounts(card) }];
      });
    }
    return { cols, adding };
  }

  // ---------- board actions ----------

  private move(id: number, column: Column, index: number): void {
    this.moveError = "";
    const o: BoardOp = { op: ++this.seq, kind: "move", id, column, index };
    this.boardOps.push(o);
    this.render();
    this.life.watch(api.moveCard(id, column, index), res => {
      this.drop(o);
      const col = res && isColumn(res.column) ? res.column : column;
      const at = res && typeof res.index === "number" ? res.index : index;
      for (const c of COLUMNS) this.cols[c].ids = this.cols[c].ids.filter(x => x !== id);
      const ids = this.cols[col].ids;
      if (this.cards.has(id)) ids.splice(Math.max(0, Math.min(at, ids.length)), 0, id);
      this.render();
    }, err => {
      this.drop(o);
      this.moveError = messageOf(err);
      this.render();
    });
  }

  private drop(o: BoardOp): void { this.boardOps = this.boardOps.filter(x => x !== o); }
  private dropItem(o: ItemOp): void { this.itemOps = this.itemOps.filter(x => x !== o); }

  private addCard(): void {
    const title = this.newCard.value.trim();
    if (!title) return;
    this.addError = "";
    this.newCard.value = "";
    const o: BoardOp = { op: ++this.seq, kind: "add", title };
    this.boardOps.push(o);
    this.render();
    this.life.watch(api.addCard("todo", title), res => {
      this.drop(o);
      if (res && typeof res.id === "number") {
        this.cards.set(res.id, { id: res.id, title: typeof res.title === "string" ? res.title : title, done: 0, total: 0 });
        if (!COLUMNS.some(c => this.cols[c].ids.includes(res.id))) this.cols.todo.ids.push(res.id);
      }
      this.render();
    }, err => {
      this.drop(o);
      this.addError = messageOf(err);
      this.render();
    });
  }

  private rename(): void {
    const d = this.detail;
    if (!d) return;
    const title = d.titleInput.value.trim();
    if (!title) return;
    const id = d.id;
    d.renameError = "";
    const o: BoardOp = { op: ++this.seq, kind: "rename", id, title };
    this.boardOps.push(o);
    this.render();
    this.life.watch(api.renameCard(id, title), res => {
      this.drop(o);
      const card = this.cards.get(id);
      if (card) card.title = res && typeof res.title === "string" ? res.title : title;
      this.render();
    }, err => {
      this.drop(o);
      if (this.detail && this.detail.id === id) this.detail.renameError = messageOf(err);
      this.render();
    });
  }

  private archive(): void {
    const d = this.detail;
    if (!d) return;
    const id = d.id;
    this.archiveError = "";
    this.detail = null;
    const o: BoardOp = { op: ++this.seq, kind: "archive", id };
    this.boardOps.push(o);
    this.render();
    this.life.watch(api.archiveCard(id), () => {
      this.drop(o);
      for (const c of COLUMNS) this.cols[c].ids = this.cols[c].ids.filter(x => x !== id);
      this.render();
    }, err => {
      this.drop(o);
      this.archiveError = messageOf(err);
      this.render();
    });
  }

  // ---------- detail ----------

  private select(id: number): void {
    if (this.detail && this.detail.id === id) return;
    const titleInput = textInput("title-input", "New title", () => this.rename());
    const itemInput = textInput("item-input", "New checklist item", () => this.addItem());
    const d: Detail = {
      id,
      lastColumn: null,
      checklist: { status: "loading", error: "", token: 0 },
      renameError: "",
      itemError: "",
      root: h("div", { class: "detail-body" }),
      head: h("h2", { testid: "detail-title" }),
      where: h("p", { testid: "detail-column", class: "muted" }),
      titleInput,
      renameError_el: h("p", { testid: "rename-error", class: "error", role: "alert" }),
      checklistEl: h("ul", { testid: "checklist", class: "checklist" }),
      progress: h("p", { testid: "progress" }),
      itemInput,
      itemErrorEl: h("p", { testid: "item-error", class: "error", role: "alert" }),
    };
    d.root.append(
      d.head, d.where,
      h("div", { class: "add-row" }, titleInput, button("rename", "rename", () => this.rename())),
      h("div", { class: "rename-slot" }),
      button("archive", "archive", () => this.archive()),
      h("h3", {}, "Checklist"),
      d.checklistEl,
      h("div", { class: "progress-slot" }),
      h("div", { class: "add-row" }, itemInput, button("add item", "add-item", () => this.addItem())),
      h("div", { class: "item-slot" }),
    );
    this.detail = d;
    this.loadChecklist(d);
    this.render();
  }

  private loadChecklist(d: Detail): void {
    const token = ++d.checklist.token;
    d.checklist.status = "loading";
    d.checklist.error = "";
    this.life.watch(api.fetchChecklist(d.id), list => {
      if (this.detail !== d || d.checklist.token !== token) return;
      const items = (Array.isArray(list) ? list : []).map(i => ({ id: i.id, text: i.text, done: !!i.done }));
      this.items.set(d.id, items);
      const card = this.cards.get(d.id);
      if (card) { card.done = items.filter(i => i.done).length; card.total = items.length; }
      d.checklist.status = "ready";
      this.render();
    }, err => {
      if (this.detail !== d || d.checklist.token !== token) return;
      d.checklist.status = "error";
      d.checklist.error = messageOf(err);
      this.render();
    });
  }

  private toggle(cardId: number, itemId: number): void {
    const shown = this.shownItems(cardId);
    const it = shown?.find(i => i.id === itemId);
    if (!it) return;
    const done = !it.done;
    if (this.detail) this.detail.itemError = "";
    const o: ItemOp = { op: ++this.seq, kind: "toggle", cardId, itemId, done };
    this.itemOps.push(o);
    this.render();
    this.life.watch(api.toggleItem(cardId, itemId, done), res => {
      this.dropItem(o);
      const now = res && typeof res.done === "boolean" ? res.done : done;
      const base = this.items.get(cardId)?.find(i => i.id === itemId);
      const card = this.cards.get(cardId);
      if (base && base.done !== now) {
        base.done = now;
        if (card) card.done += now ? 1 : -1;
      }
      this.render();
    }, err => {
      this.dropItem(o);
      if (this.detail && this.detail.id === cardId) this.detail.itemError = messageOf(err);
      this.render();
    });
  }

  private addItem(): void {
    const d = this.detail;
    if (!d || d.checklist.status !== "ready") return;
    const text = d.itemInput.value.trim();
    if (!text) return;
    const cardId = d.id;
    d.itemError = "";
    d.itemInput.value = "";
    const o: ItemOp = { op: ++this.seq, kind: "add", cardId, text };
    this.itemOps.push(o);
    this.render();
    this.life.watch(api.addItem(cardId, text), res => {
      this.dropItem(o);
      const base = this.items.get(cardId);
      if (base && res && typeof res.id === "number" && !base.some(i => i.id === res.id)) {
        const item = { id: res.id, text: typeof res.text === "string" ? res.text : text, done: !!res.done };
        base.push(item);
        const card = this.cards.get(cardId);
        if (card) { card.total += 1; if (item.done) card.done += 1; }
      }
      this.render();
    }, err => {
      this.dropItem(o);
      if (this.detail && this.detail.id === cardId) this.detail.itemError = messageOf(err);
      this.render();
    });
  }

  // ---------- rendering ----------

  private render(): void {
    const { cols, adding } = this.shown();
    const doingCount = cols.doing.length;

    for (const c of COLUMNS) {
      const col = this.cols[c];
      const list = cols[c];
      const extra = c === "todo" ? adding : [];
      const body = this.bodies[c];
      if (col.status === "loading") {
        this.heads[c].textContent = NAMES[c];
        body.replaceChildren(h("p", { class: "muted" }, "loading"));
        continue;
      }
      if (col.status === "error") {
        this.heads[c].textContent = NAMES[c];
        body.replaceChildren(
          h("p", { class: "error" }, `error: ${col.error}`),
          button("retry", `retry-${c}`, () => { this.load(c); this.render(); }),
        );
        continue;
      }
      this.heads[c].textContent = `${NAMES[c]} (${list.length + extra.length})`;
      const ci = COLUMNS.indexOf(c);
      const rows: HTMLElement[] = list.map((card, i) => {
        const selected = this.detail?.id === card.id;
        const label = h("span", { testid: "card", class: selected ? "card selected" : "card", role: "button", tabindex: "0", "aria-pressed": selected ? "true" : "false" });
        label.textContent = `#${card.id} ${card.title} · ${card.done}/${card.total}`;
        label.addEventListener("click", () => this.select(card.id));
        label.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); this.select(card.id); } });
        const row = h("div", { class: "card-row" }, label);
        const blocked = (target: Column): boolean =>
          this.cols[target].status !== "ready" || (target === "doing" && doingCount >= WIP_LIMIT);
        if (ci > 0) {
          const target = COLUMNS[ci - 1];
          row.append(button("left", "left", () => this.move(card.id, target, cols[target].length), blocked(target)));
        }
        if (ci < COLUMNS.length - 1) {
          const target = COLUMNS[ci + 1];
          row.append(button("right", "right", () => this.move(card.id, target, cols[target].length), blocked(target)));
        }
        if (i > 0) row.append(button("up", "up", () => this.move(card.id, c, i - 1)));
        if (i < list.length - 1) row.append(button("down", "down", () => this.move(card.id, c, i + 1)));
        return row;
      });
      for (const title of extra) {
        const label = h("span", { testid: "card", class: "card pending" });
        label.textContent = `${title} (adding…)`;
        rows.push(h("div", { class: "card-row" }, label));
      }
      if (!rows.length) rows.push(h("p", { class: "muted empty" }, "no cards"));
      body.replaceChildren(...rows);
    }

    this.setError(this.moveErrorEl, this.moveError, "move error");
    this.setError(this.archiveErrorEl, this.archiveError, "archive error");
    const errs: HTMLElement[] = [];
    if (this.moveError) errs.push(this.moveErrorEl);
    if (this.archiveError) errs.push(this.archiveErrorEl);
    this.errorsEl.replaceChildren(...errs);
    this.setError(this.addErrorEl, this.addError, "add error");
    this.addErrorSlot.replaceChildren(...(this.addError ? [this.addErrorEl] : []));

    this.renderDetail(cols);
  }

  private setError(el: HTMLElement, message: string, prefix: string): void {
    el.textContent = message ? `${prefix}: ${message}` : "";
  }

  private renderDetail(cols: Shown): void {
    let d = this.detail;
    if (d) {
      let found: { card: ShownCard; column: Column } | null = null;
      for (const c of COLUMNS) {
        const card = cols[c].find(x => x.id === d!.id);
        if (card) { found = { card, column: c }; break; }
      }
      const allReady = COLUMNS.every(c => this.cols[c].status === "ready");
      const pendingArchive = this.boardOps.some(o => o.kind === "archive" && o.id === d!.id);
      if (!found && (allReady || pendingArchive)) { this.detail = null; d = null; }
      else if (found) {
        d.lastColumn = found.column;
        d.head.textContent = `#${found.card.id} ${found.card.title}`;
      } else {
        d.head.textContent = `#${d.id} ${this.cards.get(d.id)?.title ?? ""}`;
      }
    }
    if (!d) {
      this.detailEl.replaceChildren(h("p", { class: "muted" }, "select a card"));
      return;
    }
    d.where.textContent = d.lastColumn ? `in ${NAMES[d.lastColumn]}` : "";
    this.setError(d.renameError_el, d.renameError, "rename error");
    d.root.querySelector(".rename-slot")!.replaceChildren(...(d.renameError ? [d.renameError_el] : []));

    const progressSlot = d.root.querySelector(".progress-slot")!;
    const cl = d.checklist;
    if (cl.status === "loading") {
      d.checklistEl.replaceChildren(h("li", { class: "muted" }, "loading checklist"));
      progressSlot.replaceChildren();
    } else if (cl.status === "error") {
      const det = d;
      d.checklistEl.replaceChildren(
        h("li", { class: "error" }, `checklist error: ${cl.error}`),
        h("li", {}, button("retry", "retry-checklist", () => { this.loadChecklist(det); this.render(); })),
      );
      progressSlot.replaceChildren();
    } else {
      const items = this.shownItems(d.id) ?? [];
      const cardId = d.id;
      d.checklistEl.replaceChildren(...items.map(it => {
        const text = h("span", { testid: "item", class: it.id === null ? "item pending" : "item" });
        text.textContent = `${it.done ? "[x]" : "[ ]"} ${it.text}${it.id === null ? " (adding…)" : ""}`;
        const row = h("li", { class: "item-row" }, text);
        const itemId = it.id;
        if (itemId !== null) row.append(button("toggle", "toggle", () => this.toggle(cardId, itemId)));
        return row;
      }));
      if (!items.length) d.checklistEl.append(h("li", { class: "muted empty" }, "no items"));
      d.progress.textContent = `${items.filter(i => i.done).length}/${items.length} done`;
      progressSlot.replaceChildren(d.progress);
    }
    this.setError(d.itemErrorEl, d.itemError, "item error");
    d.root.querySelector(".item-slot")!.replaceChildren(...(d.itemError ? [d.itemErrorEl] : []));

    if (this.detailEl.firstChild !== d.root || this.detailEl.childNodes.length !== 1) this.detailEl.replaceChildren(d.root);
  }
}
