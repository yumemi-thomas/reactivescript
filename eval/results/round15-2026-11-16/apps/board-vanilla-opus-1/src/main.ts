import * as api from "./api.js";
import type { Card, Column, Item, Archived } from "./api.js";

const COLUMNS: Column[] = ["todo", "doing", "done"];
const COLUMN_NAMES: Record<Column, string> = { todo: "To do", doing: "Doing", done: "Done" };
const WIP_LIMIT = 3;

function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: { testid?: string; cls?: string; text?: string } = {},
  ...children: (Node | null | undefined)[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (attrs.testid) node.dataset.testid = attrs.testid;
  if (attrs.cls) node.className = attrs.cls;
  if (attrs.text !== undefined) node.textContent = attrs.text;
  for (const c of children) if (c) node.appendChild(c);
  return node;
}

function button(testid: string, label: string, onClick: () => void, title?: string): HTMLButtonElement {
  const b = el("button", { testid, text: label });
  b.type = "button";
  if (title) {
    b.title = title;
    b.setAttribute("aria-label", title);
  }
  b.addEventListener("click", onClick);
  return b;
}

function textInput(testid: string, placeholder: string, onEnter: () => void): HTMLInputElement {
  const i = el("input", { testid });
  i.type = "text";
  i.placeholder = placeholder;
  i.setAttribute("aria-label", placeholder);
  i.addEventListener("keydown", ev => {
    if (ev.key === "Enter" && !ev.isComposing) {
      ev.preventDefault();
      onEnter();
    }
  });
  return i;
}

// ---------------------------------------------------------------------------
// Board page
// ---------------------------------------------------------------------------

type ColState = { status: "loading" | "error" | "ok"; error: string; cards: Card[]; seq: number };

type CardView = { id: number | null; key: string; title: string; done: number; total: number; temp: boolean };

type Op =
  | { opId: number; kind: "move"; id: number; column: Column; index: number }
  | { opId: number; kind: "add"; title: string }
  | { opId: number; kind: "archive"; id: number }
  | { opId: number; kind: "rename"; id: number; title: string }
  | { opId: number; kind: "toggle"; cardId: number; itemId: number; done: boolean }
  | { opId: number; kind: "addItem"; cardId: number; text: string };

type ChecklistState = { cardId: number; status: "loading" | "error" | "ok"; error: string; items: Item[]; seq: number };

type ItemView = { id: number | null; key: string; text: string; done: boolean; temp: boolean };

type Cols<T> = Record<Column, T[] | null>;

function findIn<T extends { id: number | null }>(cols: Cols<T>, id: number): { column: Column; index: number } | null {
  for (const column of COLUMNS) {
    const list = cols[column];
    if (!list) continue;
    const index = list.findIndex(c => c.id === id);
    if (index >= 0) return { column, index };
  }
  return null;
}

function applyMove<T extends { id: number | null }>(cols: Cols<T>, id: number, column: Column, index: number): void {
  const from = findIn(cols, id);
  const target = cols[column];
  if (!from || !target) return;
  const [card] = cols[from.column]!.splice(from.index, 1);
  target.splice(Math.max(0, Math.min(index, target.length)), 0, card);
}

function removeFrom<T extends { id: number | null }>(cols: Cols<T>, id: number): void {
  const at = findIn(cols, id);
  if (at) cols[at.column]!.splice(at.index, 1);
}

function mountBoard(container: HTMLElement, alive: () => boolean): void {
  const cols: Record<Column, ColState> = {
    todo: { status: "loading", error: "", cards: [], seq: 0 },
    doing: { status: "loading", error: "", cards: [], seq: 0 },
    done: { status: "loading", error: "", cards: [], seq: 0 },
  };
  let ops: Op[] = [];
  let nextOpId = 1;
  /** confirmed done-state of checklist items, keyed `${cardId}:${itemId}` */
  const itemDone = new Map<string, boolean>();
  let selectedId: number | null = null;
  let checklist: ChecklistState | null = null;
  let checklistSeq = 0;

  let moveError: string | null = null;
  let addError: string | null = null;
  let archiveError: string | null = null;
  let renameError: string | null = null;
  let itemError: string | null = null;

  const dropOp = (op: Op) => {
    ops = ops.filter(o => o !== op);
  };

  // ---- derived views ------------------------------------------------------

  function boardView(): Cols<CardView> {
    const out = {} as Cols<CardView>;
    for (const c of COLUMNS) {
      const st = cols[c];
      out[c] = st.status === "ok" ? st.cards.map(card => ({ ...card, key: `c${card.id}`, temp: false })) : null;
    }
    const itemState = new Map<string, boolean>();
    for (const op of ops) {
      switch (op.kind) {
        case "move":
          applyMove(out, op.id, op.column, op.index);
          break;
        case "add":
          out.todo?.push({ id: null, key: `t${op.opId}`, title: op.title, done: 0, total: 0, temp: true });
          break;
        case "archive":
          removeFrom(out, op.id);
          break;
        case "rename": {
          const at = findIn(out, op.id);
          if (at) out[at.column]![at.index].title = op.title;
          break;
        }
        case "toggle": {
          const k = `${op.cardId}:${op.itemId}`;
          const cur = itemState.has(k) ? itemState.get(k)! : itemDone.has(k) ? itemDone.get(k)! : !op.done;
          itemState.set(k, op.done);
          const at = findIn(out, op.cardId);
          if (at) out[at.column]![at.index].done += (op.done ? 1 : 0) - (cur ? 1 : 0);
          break;
        }
        case "addItem": {
          const at = findIn(out, op.cardId);
          if (at) out[at.column]![at.index].total += 1;
          break;
        }
      }
    }
    return out;
  }

  function itemsView(): ItemView[] {
    if (!checklist || checklist.status !== "ok") return [];
    const cardId = checklist.cardId;
    const items: ItemView[] = checklist.items.map(i => ({ ...i, key: `i${i.id}`, temp: false }));
    for (const op of ops) {
      if (op.kind === "toggle" && op.cardId === cardId) {
        const it = items.find(i => i.id === op.itemId);
        if (it) it.done = op.done;
      } else if (op.kind === "addItem" && op.cardId === cardId) {
        items.push({ id: null, key: `n${op.opId}`, text: op.text, done: false, temp: true });
      }
    }
    return items;
  }

  // ---- loading ------------------------------------------------------------

  function loadColumn(column: Column): void {
    const st = cols[column];
    const seq = ++st.seq;
    st.status = "loading";
    st.error = "";
    st.cards = [];
    api.fetchCards(column).then(
      cards => {
        if (!alive() || st.seq !== seq) return;
        st.status = "ok";
        st.cards = Array.isArray(cards) ? cards.map(c => ({ ...c })) : [];
        render();
      },
      e => {
        if (!alive() || st.seq !== seq) return;
        st.status = "error";
        st.error = errorMessage(e);
        render();
      },
    );
  }

  function loadChecklist(cardId: number): void {
    const seq = ++checklistSeq;
    const st: ChecklistState = { cardId, status: "loading", error: "", items: [], seq };
    checklist = st;
    api.fetchChecklist(cardId).then(
      items => {
        if (!alive() || checklist !== st) return;
        st.status = "ok";
        st.items = Array.isArray(items) ? items.map(i => ({ ...i })) : [];
        for (const i of st.items) itemDone.set(`${cardId}:${i.id}`, i.done);
        render();
      },
      e => {
        if (!alive() || checklist !== st) return;
        st.status = "error";
        st.error = errorMessage(e);
        render();
      },
    );
  }

  // ---- actions ------------------------------------------------------------

  function move(id: number, dir: "left" | "right" | "up" | "down"): void {
    const view = boardView();
    const at = findIn(view, id);
    if (!at) return;
    const ci = COLUMNS.indexOf(at.column);
    let column: Column;
    let index: number;
    if (dir === "left" || dir === "right") {
      const ti = ci + (dir === "left" ? -1 : 1);
      if (ti < 0 || ti >= COLUMNS.length) return;
      column = COLUMNS[ti];
      const target = view[column];
      if (!target) return;
      if (column === "doing" && target.length >= WIP_LIMIT) return;
      index = target.length;
    } else {
      column = at.column;
      const list = view[column]!;
      index = at.index + (dir === "up" ? -1 : 1);
      if (index < 0 || index >= list.length) return;
    }
    moveError = null;
    const op: Op = { opId: nextOpId++, kind: "move", id, column, index };
    ops.push(op);
    render();
    api.moveCard(id, column, index).then(
      () => {
        if (!alive()) return;
        dropOp(op);
        applyMove(confirmedCols(), id, column, index);
        render();
      },
      e => {
        if (!alive()) return;
        dropOp(op);
        moveError = `move error: ${errorMessage(e)}`;
        render();
      },
    );
  }

  function confirmedCols(): Cols<Card> {
    const out = {} as Cols<Card>;
    for (const c of COLUMNS) out[c] = cols[c].status === "ok" ? cols[c].cards : null;
    return out;
  }

  function findConfirmed(id: number): Card | null {
    const c = confirmedCols();
    const at = findIn(c, id);
    return at ? c[at.column]![at.index] : null;
  }

  function addCard(): void {
    const title = newCardInput.value.trim();
    if (!title || cols.todo.status !== "ok") return;
    addError = null;
    newCardInput.value = "";
    const op: Op = { opId: nextOpId++, kind: "add", title };
    ops.push(op);
    render();
    api.addCard("todo", title).then(
      res => {
        if (!alive()) return;
        dropOp(op);
        if (cols.todo.status === "ok") {
          cols.todo.cards.push({ id: res.id, title: typeof res.title === "string" ? res.title : title, done: 0, total: 0 });
        }
        render();
      },
      e => {
        if (!alive()) return;
        dropOp(op);
        addError = `add error: ${errorMessage(e)}`;
        render();
      },
    );
  }

  function select(id: number): void {
    if (selectedId === id) return;
    selectedId = id;
    renameError = null;
    itemError = null;
    buildDetail();
    loadChecklist(id);
    render();
  }

  function clearSelection(): void {
    selectedId = null;
    checklist = null;
    checklistSeq++;
    renameError = null;
    itemError = null;
    buildDetail();
  }

  function rename(): void {
    if (selectedId === null || !detailEls) return;
    const title = detailEls.titleInput.value.trim();
    if (!title) return;
    const id = selectedId;
    renameError = null;
    const op: Op = { opId: nextOpId++, kind: "rename", id, title };
    ops.push(op);
    render();
    api.renameCard(id, title).then(
      res => {
        if (!alive()) return;
        dropOp(op);
        const card = findConfirmed(id);
        if (card) card.title = typeof res.title === "string" ? res.title : title;
        render();
      },
      e => {
        if (!alive()) return;
        dropOp(op);
        if (selectedId === id) renameError = `rename error: ${errorMessage(e)}`;
        render();
      },
    );
  }

  function archive(): void {
    if (selectedId === null) return;
    const id = selectedId;
    archiveError = null;
    const op: Op = { opId: nextOpId++, kind: "archive", id };
    ops.push(op);
    clearSelection();
    render();
    api.archiveCard(id).then(
      () => {
        if (!alive()) return;
        dropOp(op);
        removeFrom(confirmedCols(), id);
        render();
      },
      e => {
        if (!alive()) return;
        dropOp(op);
        archiveError = `archive error: ${errorMessage(e)}`;
        render();
      },
    );
  }

  function toggle(itemId: number): void {
    if (selectedId === null) return;
    const cardId = selectedId;
    const item = itemsView().find(i => i.id === itemId);
    if (!item) return;
    const done = !item.done;
    itemError = null;
    const op: Op = { opId: nextOpId++, kind: "toggle", cardId, itemId, done };
    ops.push(op);
    render();
    api.toggleItem(cardId, itemId, done).then(
      res => {
        if (!alive()) return;
        const k = `${cardId}:${itemId}`;
        const newDone = typeof res.done === "boolean" ? res.done : done;
        const prev = itemDone.has(k) ? itemDone.get(k)! : !newDone;
        itemDone.set(k, newDone);
        const card = findConfirmed(cardId);
        if (card) card.done += (newDone ? 1 : 0) - (prev ? 1 : 0);
        if (checklist && checklist.cardId === cardId) {
          const it = checklist.items.find(i => i.id === itemId);
          if (it) it.done = newDone;
        }
        dropOp(op);
        render();
      },
      e => {
        if (!alive()) return;
        dropOp(op);
        if (selectedId === cardId) itemError = `item error: ${errorMessage(e)}`;
        render();
      },
    );
  }

  function addItem(): void {
    if (selectedId === null || !detailEls) return;
    if (!checklist || checklist.status !== "ok") return;
    const text = detailEls.itemInput.value.trim();
    if (!text) return;
    const cardId = selectedId;
    itemError = null;
    detailEls.itemInput.value = "";
    const op: Op = { opId: nextOpId++, kind: "addItem", cardId, text };
    ops.push(op);
    render();
    api.addItem(cardId, text).then(
      res => {
        if (!alive()) return;
        dropOp(op);
        const card = findConfirmed(cardId);
        if (card) card.total += 1;
        const item: Item = { id: res.id, text: typeof res.text === "string" ? res.text : text, done: !!res.done };
        itemDone.set(`${cardId}:${item.id}`, item.done);
        if (checklist && checklist.cardId === cardId && checklist.status === "ok") checklist.items.push(item);
        render();
      },
      e => {
        if (!alive()) return;
        dropOp(op);
        if (selectedId === cardId) itemError = `item error: ${errorMessage(e)}`;
        render();
      },
    );
  }

  // ---- DOM skeleton -------------------------------------------------------

  const errorsEl = el("div", { cls: "errors" });
  const colEls = {} as Record<Column, { head: HTMLElement; body: HTMLElement }>;
  const columnsEl = el("div", { cls: "columns" });
  const newCardInput = textInput("new-card", "New card title", addCard);
  const addCardBtn = button("add-card", "Add card", addCard);

  for (const c of COLUMNS) {
    const head = el("h2", { testid: `head-${c}`, cls: "col-head" });
    const body = el("div", { cls: "col-body" });
    const section = el("section", { testid: `col-${c}`, cls: "column" }, head, body);
    colEls[c] = { head, body };
    if (c === "todo") {
      section.appendChild(el("div", { cls: "add-row" }, newCardInput, addCardBtn));
    }
    columnsEl.appendChild(section);
  }

  const detailEl = el("aside", { testid: "detail", cls: "detail" });
  type DetailEls = {
    heading: HTMLElement;
    where: HTMLElement;
    titleInput: HTMLInputElement;
    renameError: HTMLElement;
    itemError: HTMLElement;
    checklist: HTMLElement;
    itemInput: HTMLInputElement;
    addItemBtn: HTMLButtonElement;
  };
  let detailEls: DetailEls | null = null;

  function buildDetail(): void {
    detailEl.replaceChildren();
    if (selectedId === null) {
      detailEls = null;
      detailEl.appendChild(el("p", { cls: "muted", text: "select a card" }));
      return;
    }
    const heading = el("h3", { cls: "detail-title" });
    const where = el("p", { cls: "muted" });
    const titleInput = textInput("title-input", "New title", rename);
    const renameBtn = button("rename", "Rename", rename);
    const archiveBtn = button("archive", "Archive", archive);
    const renameErr = el("p", { cls: "error", testid: "rename-error" });
    const itemErr = el("p", { cls: "error", testid: "item-error" });
    const list = el("div", { testid: "checklist", cls: "checklist" });
    const itemInput = textInput("item-input", "New checklist item", addItem);
    const addItemBtn = button("add-item", "Add item", addItem);
    detailEl.append(
      heading,
      where,
      el("div", { cls: "add-row" }, titleInput, renameBtn),
      renameErr,
      el("div", { cls: "row" }, archiveBtn),
      el("h4", { text: "Checklist" }),
      list,
      el("div", { cls: "add-row" }, itemInput, addItemBtn),
      itemErr,
    );
    detailEls = { heading, where, titleInput, renameError: renameErr, itemError: itemErr, checklist: list, itemInput, addItemBtn };
  }

  container.append(el("div", { cls: "board" }, columnsEl, detailEl), errorsEl);
  container.insertBefore(errorsEl, container.firstChild);

  // ---- render -------------------------------------------------------------

  function render(): void {
    const view = boardView();

    errorsEl.replaceChildren();
    if (moveError) errorsEl.appendChild(el("p", { testid: "move-error", cls: "error", text: moveError }));
    if (addError) errorsEl.appendChild(el("p", { testid: "add-error", cls: "error", text: addError }));
    if (archiveError) errorsEl.appendChild(el("p", { testid: "archive-error", cls: "error", text: archiveError }));

    const doingFull = (view.doing?.length ?? 0) >= WIP_LIMIT;

    for (const c of COLUMNS) {
      const st = cols[c];
      const { head, body } = colEls[c];
      const list = view[c];
      head.textContent = list ? `${COLUMN_NAMES[c]} (${list.length})` : COLUMN_NAMES[c];
      body.replaceChildren();
      if (st.status === "loading") {
        body.appendChild(el("p", { cls: "muted", text: "loading" }));
        continue;
      }
      if (st.status === "error" || !list) {
        body.append(
          el("p", { cls: "error", text: `error: ${st.error}` }),
          button(`retry-${c}`, "Retry", () => {
            loadColumn(c);
            render();
          }),
        );
        continue;
      }
      const ul = el("ul", { cls: "cards" });
      const ci = COLUMNS.indexOf(c);
      list.forEach((card, idx) => {
        const li = el("li", { cls: "card-row" });
        if (card.temp || card.id === null) {
          li.classList.add("pending");
          li.appendChild(el("div", { testid: "card", cls: "card", text: `${card.title} (adding…)` }));
          ul.appendChild(li);
          return;
        }
        const id = card.id;
        const cardEl = el("div", { testid: "card", cls: "card", text: `#${id} ${card.title} · ${card.done}/${card.total}` });
        cardEl.tabIndex = 0;
        cardEl.setAttribute("role", "button");
        if (selectedId === id) {
          cardEl.classList.add("selected");
          cardEl.setAttribute("aria-pressed", "true");
        }
        cardEl.addEventListener("click", () => select(id));
        cardEl.addEventListener("keydown", ev => {
          if (ev.key === "Enter" || ev.key === " ") {
            ev.preventDefault();
            select(id);
          }
        });
        const btns = el("div", { cls: "moves" });
        if (ci > 0) {
          const target = COLUMNS[ci - 1];
          const b = button("left", "left", () => move(id, "left"), `Move to ${COLUMN_NAMES[target]}`);
          b.disabled = !view[target] || (target === "doing" && doingFull);
          btns.appendChild(b);
        }
        if (ci < COLUMNS.length - 1) {
          const target = COLUMNS[ci + 1];
          const b = button("right", "right", () => move(id, "right"), `Move to ${COLUMN_NAMES[target]}`);
          b.disabled = !view[target] || (target === "doing" && doingFull);
          btns.appendChild(b);
        }
        if (idx > 0) btns.appendChild(button("up", "up", () => move(id, "up"), "Move up"));
        if (idx < list.length - 1) btns.appendChild(button("down", "down", () => move(id, "down"), "Move down"));
        li.append(cardEl, btns);
        ul.appendChild(li);
      });
      body.appendChild(ul);
    }

    renderDetail(view);
  }

  function renderDetail(view: Cols<CardView>): void {
    if (selectedId === null || !detailEls) return;
    const at = findIn(view, selectedId);
    const d = detailEls;
    if (!at) {
      d.heading.textContent = `#${selectedId}`;
      d.where.textContent = "";
    } else {
      const card = view[at.column]![at.index];
      d.heading.textContent = `#${selectedId} ${card.title}`;
      d.where.textContent = `in ${COLUMN_NAMES[at.column]}`;
    }
    d.renameError.textContent = renameError ?? "";
    d.renameError.hidden = !renameError;
    d.itemError.textContent = itemError ?? "";
    d.itemError.hidden = !itemError;

    d.checklist.replaceChildren();
    const st = checklist;
    d.addItemBtn.disabled = !st || st.status !== "ok";
    if (!st || st.status === "loading") {
      d.checklist.appendChild(el("p", { cls: "muted", text: "loading checklist" }));
      return;
    }
    if (st.status === "error") {
      d.checklist.appendChild(el("p", { cls: "error", text: `checklist error: ${st.error}` }));
      return;
    }
    const items = itemsView();
    const ul = el("ul", { cls: "items" });
    for (const it of items) {
      const li = el("li", { cls: "item-row" });
      if (it.temp || it.id === null) {
        li.classList.add("pending");
        li.appendChild(el("span", { testid: "item", text: `[ ] ${it.text} (adding…)` }));
      } else {
        const itemId = it.id;
        li.append(
          el("span", { testid: "item", text: `${it.done ? "[x]" : "[ ]"} ${it.text}` }),
          button("toggle", "toggle", () => toggle(itemId), it.done ? `Mark "${it.text}" not done` : `Mark "${it.text}" done`),
        );
      }
      ul.appendChild(li);
    }
    const doneCount = items.filter(i => i.done).length;
    d.checklist.append(ul, el("p", { testid: "progress", cls: "progress", text: `${doneCount}/${items.length} done` }));
  }

  buildDetail();
  for (const c of COLUMNS) loadColumn(c);
  render();
}

// ---------------------------------------------------------------------------
// Archive page
// ---------------------------------------------------------------------------

function mountArchive(container: HTMLElement, alive: () => boolean): void {
  let status: "loading" | "error" | "ok" = "loading";
  let loadError = "";
  let rows: Archived[] = [];
  const pendingRestore = new Set<number>();
  let restoreError: string | null = null;

  const errorEl = el("div");
  const listEl = el("div", { testid: "archived", cls: "archived" });
  container.append(el("h2", { text: "Archive" }), errorEl, listEl);

  function restore(id: number): void {
    if (pendingRestore.has(id)) return;
    restoreError = null;
    pendingRestore.add(id);
    render();
    api.restoreCard(id).then(
      () => {
        if (!alive()) return;
        pendingRestore.delete(id);
        rows = rows.filter(r => r.id !== id);
        render();
      },
      e => {
        if (!alive()) return;
        pendingRestore.delete(id);
        restoreError = `restore error: ${errorMessage(e)}`;
        render();
      },
    );
  }

  function render(): void {
    errorEl.replaceChildren();
    if (restoreError) errorEl.appendChild(el("p", { testid: "restore-error", cls: "error", text: restoreError }));
    listEl.replaceChildren();
    if (status === "loading") {
      listEl.appendChild(el("p", { cls: "muted", text: "loading archive" }));
      return;
    }
    if (status === "error") {
      listEl.appendChild(el("p", { cls: "error", text: `archive error: ${loadError}` }));
      return;
    }
    const visible = rows.filter(r => !pendingRestore.has(r.id));
    if (!visible.length) {
      listEl.appendChild(el("p", { cls: "muted", text: "nothing archived" }));
      return;
    }
    const ul = el("ul", { cls: "cards" });
    for (const r of visible) {
      const id = r.id;
      ul.appendChild(
        el(
          "li",
          { cls: "card-row" },
          el("div", { testid: "archived-card", cls: "card", text: `#${id} ${r.title}` }),
          button("restore", "restore", () => restore(id), `Restore #${id}`),
        ),
      );
    }
    listEl.appendChild(ul);
  }

  api.fetchArchived().then(
    list => {
      if (!alive()) return;
      status = "ok";
      rows = Array.isArray(list) ? list.map(r => ({ ...r })) : [];
      render();
    },
    e => {
      if (!alive()) return;
      status = "error";
      loadError = errorMessage(e);
      render();
    },
  );
  render();
}

// ---------------------------------------------------------------------------
// App shell
// ---------------------------------------------------------------------------

const STYLE = `
.sb-app { font: 14px/1.4 system-ui, sans-serif; color: #1d232b; padding: 12px; max-width: 1200px; margin: 0 auto; }
.sb-app .tabs { display: flex; gap: 4px; margin-bottom: 12px; border-bottom: 1px solid #d4d9e0; }
.sb-app .tabs button { border: none; background: none; padding: 8px 14px; cursor: pointer; border-bottom: 2px solid transparent; font: inherit; }
.sb-app .tabs button[aria-selected="true"] { border-bottom-color: #2f6fde; font-weight: 600; }
.sb-app .board { display: flex; gap: 12px; flex-wrap: wrap; align-items: flex-start; }
.sb-app .columns { display: grid; grid-template-columns: repeat(3, minmax(180px, 1fr)); gap: 12px; flex: 3 1 560px; }
.sb-app .column { background: #f3f5f8; border-radius: 8px; padding: 8px; min-width: 0; }
.sb-app .col-head { font-size: 15px; margin: 0 0 8px; }
.sb-app ul { list-style: none; margin: 0; padding: 0; }
.sb-app .card-row { background: #fff; border: 1px solid #d4d9e0; border-radius: 6px; padding: 6px; margin-bottom: 6px; }
.sb-app .card-row.pending { opacity: .6; }
.sb-app .card { cursor: pointer; overflow-wrap: anywhere; }
.sb-app .card.selected { font-weight: 600; color: #2f6fde; }
.sb-app .moves { display: flex; gap: 4px; margin-top: 4px; flex-wrap: wrap; }
.sb-app button { font: inherit; padding: 2px 8px; cursor: pointer; }
.sb-app button:disabled { cursor: not-allowed; opacity: .5; }
.sb-app .add-row { display: flex; gap: 4px; margin-top: 8px; }
.sb-app .add-row input { flex: 1; min-width: 0; font: inherit; padding: 3px 6px; }
.sb-app .detail { flex: 1 1 260px; border: 1px solid #d4d9e0; border-radius: 8px; padding: 10px; min-width: 0; }
.sb-app .detail-title { margin: 0; overflow-wrap: anywhere; }
.sb-app .row { margin-top: 8px; }
.sb-app .item-row { display: flex; gap: 6px; align-items: center; justify-content: space-between; padding: 2px 0; }
.sb-app .item-row.pending { opacity: .6; }
.sb-app .muted { color: #66707d; margin: 4px 0; }
.sb-app .error { color: #b42318; margin: 4px 0; }
.sb-app .progress { margin: 6px 0 0; color: #3d4652; }
@media (max-width: 700px) { .sb-app .columns { grid-template-columns: 1fr; } }
`;

type PageName = "board" | "archive";

export default function mount(root: HTMLElement): void {
  if (!document.getElementById("sprint-board-style")) {
    const style = document.createElement("style");
    style.id = "sprint-board-style";
    style.textContent = STYLE;
    document.head.appendChild(style);
  }
  root.replaceChildren();
  const app = el("div", { cls: "sb-app" });
  const page = el("main", { cls: "page" });
  let current: PageName | null = null;
  let generation = 0;

  const tabs: Record<PageName, HTMLButtonElement> = {
    board: button("tab-board", "Board", () => open("board")),
    archive: button("tab-archive", "Archive", () => open("archive")),
  };
  const nav = el("nav", { cls: "tabs" }, tabs.board, tabs.archive);
  nav.setAttribute("role", "tablist");
  for (const t of Object.values(tabs)) t.setAttribute("role", "tab");

  function open(name: PageName): void {
    if (current === name) return;
    current = name;
    const gen = ++generation;
    const alive = () => gen === generation;
    for (const [n, b] of Object.entries(tabs)) b.setAttribute("aria-selected", String(n === name));
    page.replaceChildren();
    if (name === "board") mountBoard(page, alive);
    else mountArchive(page, alive);
  }

  app.append(nav, page);
  root.appendChild(app);
  open("board");
}
