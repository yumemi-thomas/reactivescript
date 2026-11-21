import * as api from "./api.js";
import type { Card, Column, Item } from "./api.js";
import { errorMessage, h, replaceChildren, setMessage } from "./dom.js";

const COLUMNS: Column[] = ["todo", "doing", "done"];
const COLUMN_NAMES: Record<Column, string> = { todo: "To do", doing: "Doing", done: "Done" };
const WIP_LIMIT = 3;

interface BoardCard { key: string; id: number | null; title: string; done: number; total: number; adding: boolean }
interface ListItem { key: string; id: number | null; text: string; done: boolean; adding: boolean }
interface Model { cols: Record<Column, BoardCard[]>; lists: Map<number, ListItem[]> }

type Op =
  | { kind: "move"; cardId: number; to: Column; index: number }
  | { kind: "add"; tempKey: string; title: string; result?: { id: number; title: string } }
  | { kind: "rename"; cardId: number; title: string }
  | { kind: "archive"; cardId: number }
  | { kind: "toggle"; cardId: number; itemId: number; done: boolean }
  | { kind: "addItem"; cardId: number; tempKey: string; text: string; result?: Item };

/** An optimistic change: shown at once, kept in order, dropped if the server declines it. */
interface Flight { op: Op; accepted: boolean }

type LoadState = { status: "loading" } | { status: "error"; message: string } | { status: "ready" };

interface Selection {
  cardId: number;
  checklist: LoadState;
  renameError: string | null;
  itemError: string | null;
  titleInput: HTMLInputElement;
  itemInput: HTMLInputElement;
  root: HTMLElement;
  heading: HTMLElement;
  where: HTMLElement;
  renameErrorEl: HTMLElement;
  itemErrorEl: HTMLElement;
  checklistEl: HTMLElement;
  addItemButton: HTMLButtonElement;
}

const toBoardCard = (c: Card): BoardCard => ({ key: `c${c.id}`, id: c.id, title: c.title, done: c.done, total: c.total, adding: false });
const toListItem = (i: Item): ListItem => ({ key: `i${i.id}`, id: i.id, text: i.text, done: i.done, adding: false });

function findCard(model: Model, id: number): { col: Column; index: number; card: BoardCard } | null {
  for (const col of COLUMNS) {
    const index = model.cols[col].findIndex(c => c.id === id);
    if (index >= 0) return { col, index, card: model.cols[col][index] };
  }
  return null;
}

function cloneModel(m: Model): Model {
  return {
    cols: { todo: m.cols.todo.map(c => ({ ...c })), doing: m.cols.doing.map(c => ({ ...c })), done: m.cols.done.map(c => ({ ...c })) },
    lists: new Map(Array.from(m.lists, ([k, v]) => [k, v.map(i => ({ ...i }))])),
  };
}

function applyOp(m: Model, op: Op): void {
  switch (op.kind) {
    case "move": {
      const at = findCard(m, op.cardId);
      if (!at) return;
      m.cols[at.col].splice(at.index, 1);
      const target = m.cols[op.to];
      target.splice(Math.min(Math.max(op.index, 0), target.length), 0, at.card);
      return;
    }
    case "add": {
      if (op.result) {
        if (findCard(m, op.result.id)) return;
        m.cols.todo.push({ key: `c${op.result.id}`, id: op.result.id, title: op.result.title, done: 0, total: 0, adding: false });
      } else {
        m.cols.todo.push({ key: op.tempKey, id: null, title: op.title, done: 0, total: 0, adding: true });
      }
      return;
    }
    case "rename": {
      const at = findCard(m, op.cardId);
      if (at) at.card.title = op.title;
      return;
    }
    case "archive": {
      const at = findCard(m, op.cardId);
      if (at) m.cols[at.col].splice(at.index, 1);
      return;
    }
    case "toggle": {
      const item = m.lists.get(op.cardId)?.find(i => i.id === op.itemId);
      if (!item || item.done === op.done) return;
      item.done = op.done;
      const at = findCard(m, op.cardId);
      if (at) at.card.done = Math.max(0, at.card.done + (op.done ? 1 : -1));
      return;
    }
    case "addItem": {
      const list = m.lists.get(op.cardId);
      if (list) {
        if (op.result) {
          const id = op.result.id;
          if (!list.some(i => i.id === id)) list.push(toListItem(op.result));
        } else {
          list.push({ key: op.tempKey, id: null, text: op.text, done: false, adding: true });
        }
      }
      const at = findCard(m, op.cardId);
      if (at) at.card.total += 1;
      return;
    }
  }
}

export function mountBoard(root: HTMLElement): () => void {
  let alive = true;
  let seq = 0;
  const confirmed: Model = { cols: { todo: [], doing: [], done: [] }, lists: new Map() };
  const flights: Flight[] = [];
  const loads: Record<Column, LoadState> = { todo: { status: "loading" }, doing: { status: "loading" }, done: { status: "loading" } };
  const loadTokens: Record<Column, number> = { todo: 0, doing: 0, done: 0 };
  let selection: Selection | null = null;
  let moveError: string | null = null;
  let addError: string | null = null;
  let archiveError: string | null = null;

  const view = (): Model => {
    const m = cloneModel(confirmed);
    for (const f of flights) applyOp(m, f.op);
    return m;
  };

  /** Start an optimistic change; returns callbacks for the server's answer. */
  function launch(op: Op): { accept: () => void; decline: () => void } {
    const flight: Flight = { op, accepted: false };
    flights.push(flight);
    return {
      accept() {
        if (!alive) return;
        flight.accepted = true;
        // Fold the settled prefix into the confirmed state; later changes stay replayed on top in order.
        while (flights.length && flights[0].accepted) applyOp(confirmed, flights.shift()!.op);
      },
      decline() {
        if (!alive) return;
        const i = flights.indexOf(flight);
        if (i >= 0) flights.splice(i, 1);
      },
    };
  }

  // ---- static structure ----
  const moveErrorEl = h("div", { testid: "move-error", className: "msg error", attrs: { role: "alert" } });
  const archiveErrorEl = h("div", { testid: "archive-error", className: "msg error", attrs: { role: "alert" } });
  const newCardInput = h("input", { testid: "new-card", attrs: { type: "text", placeholder: "New card title", "aria-label": "New card title", maxlength: "200" } });
  const addErrorEl = h("div", { testid: "add-error", className: "msg error", attrs: { role: "alert" } });
  const addForm = h("form", { className: "add-form" }, [newCardInput, h("button", { testid: "add-card", text: "Add card", attrs: { type: "submit" } })]);
  addForm.addEventListener("submit", ev => { ev.preventDefault(); onAddCard(); });

  const colEls = {} as Record<Column, { head: HTMLElement; body: HTMLElement }>;
  const columnsEl = h("div", { className: "columns" });
  for (const col of COLUMNS) {
    const head = h("h2", { testid: `head-${col}`, className: "col-head" });
    const body = h("div", { className: "col-body", attrs: { "aria-live": "polite" } });
    colEls[col] = { head, body };
    columnsEl.append(h("section", { testid: `col-${col}`, className: "column", attrs: { "aria-label": COLUMN_NAMES[col] } },
      [head, body, col === "todo" ? addForm : null, col === "todo" ? addErrorEl : null]));
  }
  const detailEl = h("aside", { testid: "detail", className: "detail", attrs: { "aria-label": "Card detail" } });
  const container = h("div", { className: "board" }, [h("div", { className: "board-msgs" }, [moveErrorEl, archiveErrorEl]), h("div", { className: "board-main" }, [columnsEl, detailEl])]);
  root.append(container);

  // ---- loading ----
  function loadColumn(col: Column): void {
    const token = ++loadTokens[col];
    loads[col] = { status: "loading" };
    render();
    api.fetchCards(col).then(
      cards => {
        if (!alive || token !== loadTokens[col]) return;
        confirmed.cols[col] = cards.map(toBoardCard);
        loads[col] = { status: "ready" };
        render();
      },
      e => {
        if (!alive || token !== loadTokens[col]) return;
        loads[col] = { status: "error", message: errorMessage(e) };
        render();
      },
    );
  }

  // ---- actions ----
  function onMove(cardId: number, dir: "left" | "right" | "up" | "down"): void {
    const m = view();
    const at = findCard(m, cardId);
    if (!at) return;
    const target = moveTarget(m, at.col, at.index, dir);
    if (!target) return;
    moveError = null;
    const { accept, decline } = launch({ kind: "move", cardId, to: target.col, index: target.index });
    render();
    api.moveCard(cardId, target.col, target.index).then(
      () => { accept(); if (alive) render(); },
      e => { decline(); if (!alive) return; moveError = `move error: ${errorMessage(e)}`; render(); },
    );
  }

  function moveTarget(m: Model, col: Column, index: number, dir: "left" | "right" | "up" | "down"): { col: Column; index: number } | null {
    const cards = m.cols[col];
    if (dir === "up" || dir === "down") {
      const other = dir === "up" ? index - 1 : index + 1;
      if (other < 0 || other >= cards.length || cards[other].adding) return null;
      return { col, index: other };
    }
    const ci = COLUMNS.indexOf(col) + (dir === "left" ? -1 : 1);
    if (ci < 0 || ci >= COLUMNS.length) return null;
    const to = COLUMNS[ci];
    if (loads[to].status !== "ready") return null;
    if (to === "doing" && m.cols.doing.length >= WIP_LIMIT) return null;
    return { col: to, index: m.cols[to].length };
  }

  function onAddCard(): void {
    const title = newCardInput.value.trim();
    if (!title || loads.todo.status !== "ready") return;
    addError = null;
    newCardInput.value = "";
    const op: Op = { kind: "add", tempKey: `t${++seq}`, title };
    const { accept, decline } = launch(op);
    render();
    api.addCard("todo", title).then(
      res => { op.result = { id: res.id, title: res.title }; accept(); if (alive) render(); },
      e => { decline(); if (!alive) return; addError = `add error: ${errorMessage(e)}`; render(); },
    );
  }

  function select(card: BoardCard): void {
    if (card.id === null || card.adding) return;
    if (selection && selection.cardId === card.id) return;
    const cardId = card.id;
    const sel = buildSelection(cardId);
    selection = sel;
    replaceChildren(detailEl, [sel.root]);
    render();
    api.fetchChecklist(cardId).then(
      items => {
        if (!alive || selection !== sel) return;
        confirmed.lists.set(cardId, items.map(toListItem));
        sel.checklist = { status: "ready" };
        render();
      },
      e => {
        if (!alive || selection !== sel) return;
        sel.checklist = { status: "error", message: errorMessage(e) };
        render();
      },
    );
  }

  function onRename(sel: Selection): void {
    const title = sel.titleInput.value.trim();
    if (!title || selection !== sel) return;
    sel.renameError = null;
    const { accept, decline } = launch({ kind: "rename", cardId: sel.cardId, title });
    render();
    api.renameCard(sel.cardId, title).then(
      () => { accept(); if (alive) render(); },
      e => { decline(); if (!alive) return; if (selection === sel) sel.renameError = `rename error: ${errorMessage(e)}`; render(); },
    );
  }

  function onArchive(sel: Selection): void {
    if (selection !== sel) return;
    const cardId = sel.cardId;
    archiveError = null;
    const { accept, decline } = launch({ kind: "archive", cardId });
    clearSelection();
    render();
    api.archiveCard(cardId).then(
      () => { accept(); if (alive) render(); },
      e => { decline(); if (!alive) return; archiveError = `archive error: ${errorMessage(e)}`; render(); },
    );
  }

  function onToggle(sel: Selection, itemId: number): void {
    if (selection !== sel) return;
    const item = view().lists.get(sel.cardId)?.find(i => i.id === itemId);
    if (!item) return;
    const done = !item.done;
    sel.itemError = null;
    const { accept, decline } = launch({ kind: "toggle", cardId: sel.cardId, itemId, done });
    render();
    api.toggleItem(sel.cardId, itemId, done).then(
      () => { accept(); if (alive) render(); },
      e => { decline(); if (!alive) return; if (selection === sel) sel.itemError = `item error: ${errorMessage(e)}`; render(); },
    );
  }

  function onAddItem(sel: Selection): void {
    const text = sel.itemInput.value.trim();
    if (!text || selection !== sel || sel.checklist.status !== "ready") return;
    sel.itemError = null;
    sel.itemInput.value = "";
    const op: Op = { kind: "addItem", cardId: sel.cardId, tempKey: `t${++seq}`, text };
    const { accept, decline } = launch(op);
    render();
    api.addItem(sel.cardId, text).then(
      res => { op.result = res; accept(); if (alive) render(); },
      e => { decline(); if (!alive) return; if (selection === sel) sel.itemError = `item error: ${errorMessage(e)}`; render(); },
    );
  }

  function clearSelection(): void {
    selection = null;
    replaceChildren(detailEl, [h("p", { className: "empty", text: "select a card" })]);
  }

  function buildSelection(cardId: number): Selection {
    const titleInput = h("input", { testid: "title-input", attrs: { type: "text", placeholder: "New title", "aria-label": "New title", maxlength: "200" } });
    const itemInput = h("input", { testid: "item-input", attrs: { type: "text", placeholder: "New checklist item", "aria-label": "New checklist item", maxlength: "200" } });
    const heading = h("h2", { className: "detail-title" });
    const where = h("p", { className: "detail-where" });
    const renameErrorEl = h("div", { className: "msg error", attrs: { role: "alert" } });
    const itemErrorEl = h("div", { className: "msg error", attrs: { role: "alert" } });
    const checklistEl = h("div", { testid: "checklist", className: "checklist" });
    const addItemButton = h("button", { testid: "add-item", text: "Add item", attrs: { type: "submit" } });
    const renameForm = h("form", { className: "inline-form" }, [titleInput, h("button", { testid: "rename", text: "Rename", attrs: { type: "submit" } })]);
    const itemForm = h("form", { className: "inline-form" }, [itemInput, addItemButton]);
    const archiveBtn = h("button", { testid: "archive", className: "danger", text: "Archive" });
    const sel: Selection = {
      cardId, checklist: { status: "loading" }, renameError: null, itemError: null,
      titleInput, itemInput, heading, where, renameErrorEl, itemErrorEl, checklistEl, addItemButton,
      root: h("div", { className: "detail-inner" }, [heading, where, renameForm, renameErrorEl, archiveBtn, h("h3", { text: "Checklist" }), checklistEl, itemForm, itemErrorEl]),
    };
    renameForm.addEventListener("submit", ev => { ev.preventDefault(); onRename(sel); });
    itemForm.addEventListener("submit", ev => { ev.preventDefault(); onAddItem(sel); });
    archiveBtn.addEventListener("click", () => onArchive(sel));
    return sel;
  }

  // ---- rendering ----
  function render(): void {
    if (!alive) return;
    const m = view();
    const doingFull = m.cols.doing.length >= WIP_LIMIT;
    for (const col of COLUMNS) {
      const load = loads[col];
      const { head, body } = colEls[col];
      if (load.status !== "ready") {
        head.textContent = COLUMN_NAMES[col];
        replaceChildren(body, load.status === "loading"
          ? [h("p", { className: "status", text: "loading" })]
          : [h("p", { className: "status error", text: `error: ${load.message}` }),
            h("button", { testid: `retry-${col}`, text: "retry", focusKey: `retry-${col}`, onClick: () => loadColumn(col) })]);
        continue;
      }
      const cards = m.cols[col];
      head.textContent = `${COLUMN_NAMES[col]} (${cards.length})`;
      const ci = COLUMNS.indexOf(col);
      replaceChildren(body, cards.length === 0 ? [h("p", { className: "status muted", text: "no cards" })] : [h("ul", { className: "cards" }, cards.map((card, index) => {
        if (card.adding || card.id === null) {
          return h("li", { className: "card-row pending" }, [h("div", { testid: "card", className: "card", text: `${card.title} (adding…)` })]);
        }
        const id = card.id;
        const selected = selection?.cardId === id;
        const buttons: HTMLButtonElement[] = [];
        const mk = (dir: "left" | "right" | "up" | "down", label: string, disabled = false) =>
          buttons.push(h("button", { testid: dir, className: "move", text: dir, focusKey: `${card.key}:${dir}`, disabled,
            attrs: { "aria-label": `${label}: ${card.title}`, title: label }, onClick: () => onMove(id, dir) }));
        if (ci > 0) mk("left", `Move to ${COLUMN_NAMES[COLUMNS[ci - 1]]}`, col === "done" && doingFull || loads[COLUMNS[ci - 1]].status !== "ready");
        if (ci < COLUMNS.length - 1) mk("right", `Move to ${COLUMN_NAMES[COLUMNS[ci + 1]]}`, col === "todo" && doingFull || loads[COLUMNS[ci + 1]].status !== "ready");
        if (index > 0 && !cards[index - 1].adding) mk("up", "Move up");
        if (index < cards.length - 1 && !cards[index + 1].adding) mk("down", "Move down");
        return h("li", { className: `card-row${selected ? " selected" : ""}` }, [
          h("button", { testid: "card", className: "card", text: `#${id} ${card.title} · ${card.done}/${card.total}`, focusKey: `${card.key}:card`,
            attrs: { "aria-pressed": String(selected) }, onClick: () => select(card) }),
          h("div", { className: "moves" }, buttons),
        ]);
      }))]);
    }
    setMessage(moveErrorEl, moveError);
    setMessage(archiveErrorEl, archiveError);
    setMessage(addErrorEl, addError);
    renderDetail(m);
  }

  function renderDetail(m: Model): void {
    const sel = selection;
    if (!sel) return;
    const at = findCard(m, sel.cardId);
    if (!at) { clearSelection(); return; }
    sel.heading.textContent = `#${sel.cardId} ${at.card.title}`;
    sel.where.textContent = `in ${COLUMN_NAMES[at.col]}`;
    setMessage(sel.renameErrorEl, sel.renameError);
    setMessage(sel.itemErrorEl, sel.itemError);
    sel.addItemButton.disabled = sel.checklist.status !== "ready";
    const cl = sel.checklist;
    if (cl.status === "loading") { replaceChildren(sel.checklistEl, [h("p", { className: "status", text: "loading checklist" })]); return; }
    if (cl.status === "error") { replaceChildren(sel.checklistEl, [h("p", { className: "status error", text: `checklist error: ${cl.message}` })]); return; }
    const items = m.lists.get(sel.cardId) ?? [];
    const done = items.filter(i => i.done).length;
    replaceChildren(sel.checklistEl, [
      h("ul", { className: "items" }, items.map(item => {
        const itemId = item.id;
        return h("li", { className: `item-row${item.adding ? " pending" : ""}` }, [
          h("span", { testid: "item", className: "item", text: `${item.done ? "[x]" : "[ ]"} ${item.text}${item.adding ? " (adding…)" : ""}` }),
          item.adding || itemId === null ? null : h("button", { testid: "toggle", className: "toggle", text: "toggle", focusKey: `${item.key}:toggle`,
            attrs: { "aria-label": `Mark ${item.text} as ${item.done ? "not done" : "done"}` }, onClick: () => onToggle(sel, itemId) }),
        ]);
      })),
      h("p", { testid: "progress", className: "progress", text: `${done}/${items.length} done` }),
    ]);
  }

  clearSelection();
  for (const col of COLUMNS) loadColumn(col);

  return () => { alive = false; container.remove(); };
}
