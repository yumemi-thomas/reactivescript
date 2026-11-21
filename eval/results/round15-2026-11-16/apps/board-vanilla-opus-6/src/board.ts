// The board page: three columns, optimistic edits, and the detail panel.
//
// State is kept as "confirmed" data (what the server has told us) plus a log of
// pending optimistic operations. What is on screen is always derived by replaying
// the pending log over the confirmed data, so a declined request simply drops its
// operation and the screen falls back to whatever is still true, even when several
// requests are in the air at once.

import * as api from "./api.js";
import type { Card, Column, Item } from "./api.js";
import { errorMessage, h, replaceChildrenKeepingFocus, uid } from "./dom.js";

const COLUMNS: readonly Column[] = ["todo", "doing", "done"];
const COLUMN_NAME: Record<Column, string> = { todo: "To do", doing: "Doing", done: "Done" };
const WIP_LIMIT = 3;

type LoadState = { kind: "loading" } | { kind: "error"; message: string } | { kind: "ok" };

type Op =
  | { kind: "move"; opId: number; id: number; column: Column; index: number }
  | { kind: "rename"; opId: number; id: number; title: string }
  | { kind: "archive"; opId: number; id: number }
  | { kind: "add"; opId: number; title: string }
  | { kind: "toggle"; opId: number; cardId: number; itemId: number; done: boolean }
  | { kind: "addItem"; opId: number; cardId: number; text: string };

type ShownItem = { key: string; id: number | null; text: string; done: boolean; pending: boolean };
type ShownCard = Card;
type PendingCard = { opId: number; title: string };

type ChecklistState =
  | { kind: "loading"; cardId: number }
  | { kind: "error"; cardId: number; message: string }
  | { kind: "ok"; cardId: number };

function isColumn(v: unknown): v is Column {
  return v === "todo" || v === "doing" || v === "done";
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function placeCard(cols: Record<Column, Card[]>, id: number, column: Column, index: number): void {
  let found: Card | undefined;
  for (const c of COLUMNS) {
    const i = cols[c].findIndex(card => card.id === id);
    if (i >= 0) {
      found = cols[c][i];
      cols[c].splice(i, 1);
    }
  }
  if (!found) return;
  const list = cols[column];
  list.splice(clamp(Math.trunc(index), 0, list.length), 0, found);
}

export function mountBoard(root: HTMLElement): () => void {
  let alive = true;

  // ---- confirmed state ----
  const confirmed: Record<Column, Card[]> = { todo: [], doing: [], done: [] };
  const load: Record<Column, LoadState> = { todo: { kind: "loading" }, doing: { kind: "loading" }, done: { kind: "loading" } };
  const loadToken: Record<Column, number> = { todo: 0, doing: 0, done: 0 };
  /** confirmed checklists, by card id, for cards whose checklist has been loaded on this page */
  const items = new Map<number, Item[]>();

  // ---- pending and UI state ----
  let ops: Op[] = [];
  let selectedId: number | null = null;
  let checklist: ChecklistState | null = null;
  let checklistToken = 0;
  let moveError: string | null = null;
  let addError: string | null = null;
  let archiveError: string | null = null;
  let renameError: { cardId: number; message: string } | null = null;
  let itemError: { cardId: number; message: string } | null = null;

  // ---- derived view ----
  function shownItems(cardId: number): ShownItem[] | null {
    const base = items.get(cardId);
    if (!base) return null;
    const list: ShownItem[] = base.map(it => ({ key: `i${it.id}`, id: it.id, text: it.text, done: it.done, pending: false }));
    for (const op of ops) {
      if (op.kind === "toggle" && op.cardId === cardId) {
        const it = list.find(x => x.id === op.itemId);
        if (it) it.done = op.done;
      } else if (op.kind === "addItem" && op.cardId === cardId) {
        list.push({ key: `p${op.opId}`, id: null, text: op.text, done: false, pending: true });
      }
    }
    return list;
  }

  function shownBoard(): { cols: Record<Column, ShownCard[]>; adding: PendingCard[] } {
    const cols: Record<Column, Card[]> = {
      todo: confirmed.todo.map(c => ({ ...c })),
      doing: confirmed.doing.map(c => ({ ...c })),
      done: confirmed.done.map(c => ({ ...c })),
    };
    const adding: PendingCard[] = [];
    for (const op of ops) {
      if (op.kind === "move") placeCard(cols, op.id, op.column, op.index);
      else if (op.kind === "rename") {
        for (const c of COLUMNS) for (const card of cols[c]) if (card.id === op.id) card.title = op.title;
      } else if (op.kind === "archive") {
        for (const c of COLUMNS) cols[c] = cols[c].filter(card => card.id !== op.id);
      } else if (op.kind === "add") adding.push({ opId: op.opId, title: op.title });
    }
    for (const c of COLUMNS) {
      for (const card of cols[c]) {
        const list = shownItems(card.id);
        if (list) {
          card.total = list.length;
          card.done = list.filter(it => it.done).length;
        }
      }
    }
    return { cols, adding };
  }

  function findShown(cols: Record<Column, ShownCard[]>, id: number): { card: ShownCard; column: Column; index: number } | null {
    for (const c of COLUMNS) {
      const index = cols[c].findIndex(card => card.id === id);
      if (index >= 0) return { card: cols[c][index], column: c, index };
    }
    return null;
  }

  function dropOp(opId: number): void {
    ops = ops.filter(op => op.opId !== opId);
  }

  // ---- loading ----
  function fetchColumn(column: Column): void {
    const token = ++loadToken[column];
    load[column] = { kind: "loading" };
    confirmed[column] = [];
    api.fetchCards(column).then(
      cards => {
        if (!alive || token !== loadToken[column]) return;
        // A card can live in one column only; trust the freshest answer.
        const ids = new Set(cards.map(c => c.id));
        for (const c of COLUMNS) if (c !== column) confirmed[c] = confirmed[c].filter(card => !ids.has(card.id));
        confirmed[column] = cards.map(c => ({ id: c.id, title: c.title, done: c.done, total: c.total }));
        load[column] = { kind: "ok" };
        render();
      },
      err => {
        if (!alive || token !== loadToken[column]) return;
        load[column] = { kind: "error", message: errorMessage(err) };
        render();
      },
    );
  }

  function fetchItems(cardId: number): void {
    const token = ++checklistToken;
    checklist = { kind: "loading", cardId };
    api.fetchChecklist(cardId).then(
      list => {
        if (!alive || token !== checklistToken) return;
        items.set(cardId, list.map(it => ({ id: it.id, text: it.text, done: it.done })));
        checklist = { kind: "ok", cardId };
        render();
      },
      err => {
        if (!alive || token !== checklistToken) return;
        checklist = { kind: "error", cardId, message: errorMessage(err) };
        render();
      },
    );
  }

  // ---- actions ----
  function select(id: number): void {
    if (selectedId === id) return;
    selectedId = id;
    renameError = null;
    itemError = null;
    buildDetailEditors();
    fetchItems(id);
    render();
  }

  function clearSelection(): void {
    selectedId = null;
    checklist = null;
    checklistToken++;
    renameError = null;
    itemError = null;
    buildDetailEditors();
  }

  function move(id: number, column: Column, index: number): void {
    moveError = null;
    const op: Op = { kind: "move", opId: uid(), id, column, index };
    ops.push(op);
    render();
    api.moveCard(id, column, index).then(
      res => {
        if (!alive) return;
        dropOp(op.opId);
        const col = res && isColumn(res.column) ? res.column : column;
        const idx = res && typeof res.index === "number" && Number.isFinite(res.index) ? res.index : index;
        placeCard(confirmed, id, col, idx);
        render();
      },
      err => {
        if (!alive) return;
        dropOp(op.opId);
        moveError = errorMessage(err);
        render();
      },
    );
  }

  function addCard(title: string): void {
    addError = null;
    const op: Op = { kind: "add", opId: uid(), title };
    ops.push(op);
    render();
    api.addCard("todo", title).then(
      res => {
        if (!alive) return;
        dropOp(op.opId);
        const card: Card = { id: res.id, title: typeof res.title === "string" ? res.title : title, done: 0, total: 0 };
        if (!findShown(confirmed, card.id)) confirmed.todo.push(card);
        render();
      },
      err => {
        if (!alive) return;
        dropOp(op.opId);
        addError = errorMessage(err);
        render();
      },
    );
  }

  function rename(id: number, title: string): void {
    renameError = null;
    const op: Op = { kind: "rename", opId: uid(), id, title };
    ops.push(op);
    render();
    api.renameCard(id, title).then(
      res => {
        if (!alive) return;
        dropOp(op.opId);
        const found = findShown(confirmed, id);
        if (found) found.card.title = res && typeof res.title === "string" ? res.title : title;
        render();
      },
      err => {
        if (!alive) return;
        dropOp(op.opId);
        renameError = { cardId: id, message: errorMessage(err) };
        render();
      },
    );
  }

  function archive(id: number): void {
    archiveError = null;
    const op: Op = { kind: "archive", opId: uid(), id };
    ops.push(op);
    if (selectedId === id) clearSelection();
    render();
    api.archiveCard(id).then(
      () => {
        if (!alive) return;
        dropOp(op.opId);
        for (const c of COLUMNS) confirmed[c] = confirmed[c].filter(card => card.id !== id);
        // Pending work on a card that is gone has nothing left to show.
        ops = ops.filter(o => !((o.kind === "move" || o.kind === "rename") && o.id === id));
        render();
      },
      err => {
        if (!alive) return;
        dropOp(op.opId);
        archiveError = errorMessage(err);
        render();
      },
    );
  }

  function toggle(cardId: number, itemId: number, done: boolean): void {
    itemError = null;
    const op: Op = { kind: "toggle", opId: uid(), cardId, itemId, done };
    ops.push(op);
    render();
    api.toggleItem(cardId, itemId, done).then(
      res => {
        if (!alive) return;
        dropOp(op.opId);
        const it = items.get(cardId)?.find(x => x.id === itemId);
        if (it) it.done = res && typeof res.done === "boolean" ? res.done : done;
        render();
      },
      err => {
        if (!alive) return;
        dropOp(op.opId);
        itemError = { cardId, message: errorMessage(err) };
        render();
      },
    );
  }

  function addItem(cardId: number, text: string): void {
    itemError = null;
    const op: Op = { kind: "addItem", opId: uid(), cardId, text };
    ops.push(op);
    render();
    api.addItem(cardId, text).then(
      res => {
        if (!alive) return;
        dropOp(op.opId);
        const list = items.get(cardId);
        if (list && !list.some(x => x.id === res.id)) {
          list.push({ id: res.id, text: typeof res.text === "string" ? res.text : text, done: Boolean(res.done) });
        }
        render();
      },
      err => {
        if (!alive) return;
        dropOp(op.opId);
        itemError = { cardId, message: errorMessage(err) };
        render();
      },
    );
  }

  // ---- static skeleton ----
  const moveErrorEl = h("p", { testid: "move-error", class: "error", role: "alert" });
  const addErrorEl = h("p", { testid: "add-error", class: "error", role: "alert" });
  const archiveErrorEl = h("p", { testid: "archive-error", class: "error", role: "alert" });
  const errorsEl = h("div", { class: "errors" });

  const heads = {} as Record<Column, HTMLHeadingElement>;
  const lists = {} as Record<Column, HTMLDivElement>;
  const colEls = {} as Record<Column, HTMLElement>;
  for (const c of COLUMNS) {
    heads[c] = h("h2", { testid: `head-${c}`, class: "col-head" });
    lists[c] = h("div", { class: "col-list" });
    colEls[c] = h("section", { testid: `col-${c}`, class: "column", "aria-label": COLUMN_NAME[c] }, heads[c], lists[c]);
  }

  const newCardInput = h("input", { testid: "new-card", type: "text", placeholder: "New card title", "aria-label": "New card title", maxlength: "500" });
  const addCardButton = h("button", { testid: "add-card", type: "submit" }, "Add card");
  const addForm = h("form", { class: "add-form" }, newCardInput, addCardButton);
  addForm.addEventListener("submit", e => {
    e.preventDefault();
    if (load.todo.kind !== "ok") return;
    const title = newCardInput.value.trim();
    if (!title) return;
    newCardInput.value = "";
    addCard(title);
  });
  colEls.todo.append(addForm);

  const detailEl = h("aside", { testid: "detail", class: "detail", "aria-label": "Card detail" });
  const detailInfo = h("div", { class: "detail-info" });
  let detailEditors: HTMLElement | null = null;
  let titleInput: HTMLInputElement | null = null;
  let itemInput: HTMLInputElement | null = null;
  const checklistEl = h("div", { testid: "checklist", class: "checklist" });
  const progressEl = h("p", { testid: "progress", class: "progress" });
  let checklistSection: HTMLElement | null = null;

  /** (Re)build the detail's inputs: called whenever the selection changes, so they start empty. */
  function buildDetailEditors(): void {
    detailEditors?.remove();
    checklistSection?.remove();
    detailEditors = null;
    checklistSection = null;
    titleInput = null;
    itemInput = null;
    if (selectedId === null) return;
    const cardId = selectedId;

    const tInput = h("input", { testid: "title-input", type: "text", placeholder: "New title", "aria-label": "New title", maxlength: "500" });
    const renameForm = h("form", { class: "rename-form" }, tInput, h("button", { testid: "rename", type: "submit" }, "Rename"));
    renameForm.addEventListener("submit", e => {
      e.preventDefault();
      const title = tInput.value.trim();
      if (!title) return;
      rename(cardId, title);
    });
    const archiveButton = h("button", { testid: "archive", type: "button", class: "danger" }, "Archive");
    archiveButton.addEventListener("click", () => archive(cardId));
    detailEditors = h("div", { class: "detail-editors" }, renameForm, archiveButton);

    const iInput = h("input", { testid: "item-input", type: "text", placeholder: "New checklist item", "aria-label": "New checklist item", maxlength: "500" });
    const addItemButton = h("button", { testid: "add-item", type: "submit" }, "Add item");
    const itemForm = h("form", { class: "item-form" }, iInput, addItemButton);
    itemForm.addEventListener("submit", e => {
      e.preventDefault();
      if (!(checklist && checklist.kind === "ok" && checklist.cardId === cardId)) return;
      const text = iInput.value.trim();
      if (!text) return;
      iInput.value = "";
      addItem(cardId, text);
    });
    checklistSection = h("div", { class: "checklist-section" }, h("h3", {}, "Checklist"), checklistEl, progressEl, itemForm);

    titleInput = tInput;
    itemInput = iInput;
    detailEl.append(detailEditors, checklistSection);
  }

  detailEl.append(detailInfo);
  const page = h(
    "div",
    { class: "board-page" },
    errorsEl,
    h("div", { class: "board-layout" }, h("div", { class: "columns" }, colEls.todo, colEls.doing, colEls.done), detailEl),
  );
  root.append(page);

  // ---- rendering ----
  function moveButton(dir: "left" | "right" | "up" | "down", cardId: number, disabled: boolean, onClick: () => void): HTMLButtonElement {
    const label = { left: "←", right: "→", up: "↑", down: "↓" }[dir];
    const btn = h("button", {
      testid: dir,
      type: "button",
      class: "move",
      "aria-label": `Move ${dir}`,
      title: `Move ${dir}`,
      "data-key": `${dir}-${cardId}`,
      disabled,
    }, label);
    btn.addEventListener("click", e => {
      e.stopPropagation();
      onClick();
    });
    return btn;
  }

  function render(): void {
    if (!alive) return;
    const { cols, adding } = shownBoard();
    const doingFull = cols.doing.length >= WIP_LIMIT;

    for (const c of COLUMNS) {
      const state = load[c];
      const shownCount = cols[c].length + (c === "todo" ? adding.length : 0);
      heads[c].textContent = state.kind === "ok" ? `${COLUMN_NAME[c]} (${shownCount})` : COLUMN_NAME[c];

      const rows: Node[] = [];
      if (state.kind === "loading") {
        rows.push(h("p", { class: "status" }, "loading"));
      } else if (state.kind === "error") {
        const retry = h("button", { testid: `retry-${c}`, type: "button", "data-key": `retry-${c}` }, "Retry");
        retry.addEventListener("click", () => {
          fetchColumn(c);
          render();
        });
        rows.push(h("div", { class: "status error", role: "alert" }, h("span", {}, `error: ${state.message}`), " ", retry));
      } else {
        const ci = COLUMNS.indexOf(c);
        const leftCol = ci > 0 ? COLUMNS[ci - 1] : null;
        const rightCol = ci < COLUMNS.length - 1 ? COLUMNS[ci + 1] : null;
        cols[c].forEach((card, index, list) => {
          const cardEl = h("div", {
            testid: "card",
            class: "card" + (card.id === selectedId ? " selected" : ""),
            role: "button",
            tabindex: "0",
            "aria-pressed": card.id === selectedId ? "true" : "false",
            "data-key": `card-${card.id}`,
          }, `#${card.id} ${card.title} · ${card.done}/${card.total}`);
          cardEl.addEventListener("click", () => select(card.id));
          cardEl.addEventListener("keydown", e => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              select(card.id);
            }
          });
          const buttons: HTMLElement[] = [];
          if (leftCol) {
            const blocked = load[leftCol].kind !== "ok" || (leftCol === "doing" && doingFull);
            buttons.push(moveButton("left", card.id, blocked, () => move(card.id, leftCol, cols[leftCol].length)));
          }
          if (rightCol) {
            const blocked = load[rightCol].kind !== "ok" || (rightCol === "doing" && doingFull);
            buttons.push(moveButton("right", card.id, blocked, () => move(card.id, rightCol, cols[rightCol].length)));
          }
          if (index > 0) buttons.push(moveButton("up", card.id, false, () => move(card.id, c, index - 1)));
          if (index < list.length - 1) buttons.push(moveButton("down", card.id, false, () => move(card.id, c, index + 1)));
          rows.push(h("div", { class: "card-row" }, cardEl, h("div", { class: "moves" }, ...buttons)));
        });
        if (c === "todo") {
          for (const p of adding) {
            rows.push(h("div", { class: "card-row" }, h("div", { testid: "card", class: "card pending", "aria-busy": "true" }, `${p.title} (adding…)`)));
          }
        }
        if (rows.length === 0) rows.push(h("p", { class: "empty" }, "No cards"));
      }
      replaceChildrenKeepingFocus(lists[c], rows);
    }
    addCardButton.disabled = load.todo.kind !== "ok";

    // errors
    const errs: HTMLElement[] = [];
    if (moveError !== null) { moveErrorEl.textContent = `move error: ${moveError}`; errs.push(moveErrorEl); }
    if (addError !== null) { addErrorEl.textContent = `add error: ${addError}`; errs.push(addErrorEl); }
    if (archiveError !== null) { archiveErrorEl.textContent = `archive error: ${archiveError}`; errs.push(archiveErrorEl); }
    errorsEl.replaceChildren(...errs);

    renderDetail(cols);
  }

  function renderDetail(cols: Record<Column, ShownCard[]>): void {
    const found = selectedId === null ? null : findShown(cols, selectedId);
    if (selectedId === null || !found) {
      detailInfo.replaceChildren(h("p", { class: "placeholder" }, "select a card"));
      if (detailEditors) detailEditors.hidden = true;
      if (checklistSection) checklistSection.hidden = true;
      return;
    }
    if (detailEditors) detailEditors.hidden = false;
    if (checklistSection) checklistSection.hidden = false;
    const cardId = selectedId;

    const info: Node[] = [
      h("h2", { class: "detail-title" }, `#${found.card.id} ${found.card.title}`),
      h("p", { class: "detail-column" }, `in ${COLUMN_NAME[found.column]}`),
    ];
    if (renameError && renameError.cardId === cardId) info.push(h("p", { class: "error", role: "alert" }, `rename error: ${renameError.message}`));
    if (itemError && itemError.cardId === cardId) info.push(h("p", { class: "error", role: "alert" }, `item error: ${itemError.message}`));
    detailInfo.replaceChildren(...info);

    const list = checklist && checklist.cardId === cardId && checklist.kind === "ok" ? shownItems(cardId) : null;
    if (!checklist || checklist.cardId !== cardId || checklist.kind === "loading") {
      checklistEl.replaceChildren(h("p", { class: "status" }, "loading checklist"));
    } else if (checklist.kind === "error") {
      checklistEl.replaceChildren(h("p", { class: "status error" }, `checklist error: ${checklist.message}`));
    } else if (list) {
      const rows = list.map(it => {
        const itemEl = h("span", { testid: "item", class: "item" + (it.done ? " done" : "") + (it.pending ? " pending" : "") },
          `${it.done ? "[x]" : "[ ]"} ${it.text}${it.pending ? " (adding…)" : ""}`);
        const row = h("div", { class: "item-row" }, itemEl);
        if (!it.pending && it.id !== null) {
          const itemId = it.id;
          const done = it.done;
          const btn = h("button", {
            testid: "toggle",
            type: "button",
            "data-key": `toggle-${itemId}`,
            "aria-label": done ? `Mark "${it.text}" not done` : `Mark "${it.text}" done`,
          }, done ? "Undo" : "Done");
          btn.addEventListener("click", () => toggle(cardId, itemId, !done));
          row.append(btn);
        }
        return row;
      });
      if (rows.length === 0) rows.push(h("div", { class: "empty" }, "No items"));
      replaceChildrenKeepingFocus(checklistEl, rows);
    }
    if (list) {
      progressEl.hidden = false;
      progressEl.textContent = `${list.filter(it => it.done).length}/${list.length} done`;
    } else {
      progressEl.hidden = true;
      progressEl.textContent = "";
    }
    const itemForm = itemInput?.form;
    const addItemBtn = itemForm?.querySelector<HTMLButtonElement>('[data-testid="add-item"]');
    if (addItemBtn) addItemBtn.disabled = !list;
    void titleInput;
  }

  for (const c of COLUMNS) fetchColumn(c);
  render();

  return () => {
    alive = false;
    page.remove();
  };
}
