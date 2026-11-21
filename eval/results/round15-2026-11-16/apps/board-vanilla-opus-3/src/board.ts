import * as api from "./api.js";
import type { Card, Column, Item } from "./api.js";
import { errorMessage, h, onEnter, replaceKeepingFocus } from "./dom.js";

const COLUMNS: readonly Column[] = ["todo", "doing", "done"];
const NAMES: Record<Column, string> = { todo: "To do", doing: "Doing", done: "Done" };
const WIP_LIMIT = 3;

type Status = "loading" | "error" | "ok";
type ColumnState = { status: Status; error: string; cards: Card[] };
type Cols = Record<Column, Card[] | null>;
type Located = { col: Column; index: number; card: Card };

type BoardBody =
  | { kind: "move"; id: number; col: Column; index: number }
  | { kind: "rename"; id: number; title: string }
  | { kind: "archive"; id: number }
  | { kind: "add"; title: string; result?: { id: number; title: string } };
/** An optimistic board change. `ok` ops wait for earlier ones before being folded into the confirmed state. */
type BoardOp = { seq: number; state: "pending" | "ok"; body: BoardBody };

type ItemBody =
  | { kind: "toggle"; itemId: number; done: boolean }
  | { kind: "add"; text: string; result?: Item };
type ItemOp = { seq: number; state: "pending" | "ok"; body: ItemBody };
type Adding = { seq: number; text: string };

type Checklist = { cardId: number; status: Status; error: string; token: number };

/** Mounts the board page into `host`; returns a function that discards it. */
export function mountBoard(host: HTMLElement): () => void {
  let disposed = false;
  let seq = 0;

  // Confirmed (server-acknowledged) state, plus optimistic ops replayed on top for display.
  const confirmed: Record<Column, ColumnState> = {
    todo: { status: "loading", error: "", cards: [] },
    doing: { status: "loading", error: "", cards: [] },
    done: { status: "loading", error: "", cards: [] },
  };
  const colTokens: Record<Column, number> = { todo: 0, doing: 0, done: 0 };
  let ops: BoardOp[] = [];
  const confirmedItems = new Map<number, Item[]>();
  const itemOps = new Map<number, ItemOp[]>();

  let selected: number | null = null;
  let checklist: Checklist | null = null;
  let checklistToken = 0;

  let moveError = "";
  let addError = "";
  let archiveError = "";
  let renameError = "";
  let itemError = "";

  // ---------- model ----------

  function find(cols: Cols, id: number): Located | null {
    for (const col of COLUMNS) {
      const list = cols[col];
      if (!list) continue;
      const index = list.findIndex(c => c.id === id);
      if (index >= 0) return { col, index, card: list[index] };
    }
    return null;
  }

  function applyBoard(cols: Cols, op: BoardOp, adding: Adding[] | null): void {
    const b = op.body;
    switch (b.kind) {
      case "move": {
        const target = cols[b.col];
        const at = find(cols, b.id);
        if (!target || !at) return;
        cols[at.col]!.splice(at.index, 1);
        target.splice(Math.max(0, Math.min(b.index, target.length)), 0, at.card);
        return;
      }
      case "rename": {
        const at = find(cols, b.id);
        if (at) at.card.title = b.title;
        return;
      }
      case "archive": {
        const at = find(cols, b.id);
        if (at) cols[at.col]!.splice(at.index, 1);
        return;
      }
      case "add": {
        if (op.state === "ok" && b.result) {
          const todo = cols.todo;
          if (todo && !find(cols, b.result.id)) todo.push({ id: b.result.id, title: b.result.title, done: 0, total: 0 });
        } else if (adding) {
          adding.push({ seq: op.seq, text: b.title });
        }
        return;
      }
    }
  }

  function applyItem(items: Item[], op: ItemOp, adding: Adding[] | null): void {
    const b = op.body;
    if (b.kind === "toggle") {
      const it = items.find(i => i.id === b.itemId);
      if (it) it.done = b.done;
    } else if (op.state === "ok" && b.result) {
      if (!items.some(i => i.id === b.result!.id)) items.push({ ...b.result });
    } else if (adding) {
      adding.push({ seq: op.seq, text: b.text });
    }
  }

  function replayItems(cardId: number): { items: Item[]; adding: Adding[] } | null {
    const base = confirmedItems.get(cardId);
    if (!base) return null;
    const items = base.map(i => ({ ...i }));
    const adding: Adding[] = [];
    for (const op of itemOps.get(cardId) ?? []) applyItem(items, op, adding);
    return { items, adding };
  }

  const countDone = (items: Item[]) => items.filter(i => i.done).length;

  function view(): { cols: Cols; adding: Adding[] } {
    const cols = {} as Cols;
    for (const c of COLUMNS) cols[c] = confirmed[c].status === "ok" ? confirmed[c].cards.map(x => ({ ...x })) : null;
    const adding: Adding[] = [];
    for (const op of ops) applyBoard(cols, op, adding);
    // Checklist changes not yet folded show in the card's counts.
    for (const [cardId, list] of itemOps) {
      if (!list.length) continue;
      const base = confirmedItems.get(cardId);
      const r = replayItems(cardId);
      const at = find(cols, cardId);
      if (!base || !r || !at) continue;
      at.card.done += countDone(r.items) - countDone(base);
      at.card.total += r.items.length + r.adding.length - base.length;
    }
    return { cols, adding };
  }

  function confirmedCols(): Cols {
    const cols = {} as Cols;
    for (const c of COLUMNS) cols[c] = confirmed[c].status === "ok" ? confirmed[c].cards : null;
    return cols;
  }

  /** Folds leading acknowledged ops into the confirmed state. */
  function foldBoard(): void {
    const cols = confirmedCols();
    while (ops.length && ops[0].state === "ok") applyBoard(cols, ops.shift()!, null);
  }

  function foldItems(cardId: number): void {
    const list = itemOps.get(cardId);
    if (!list) return;
    while (list.length && list[0].state === "ok") {
      const op = list.shift()!;
      const before = confirmedItems.get(cardId);
      if (!before) continue;
      const after = before.map(i => ({ ...i }));
      applyItem(after, op, null);
      confirmedItems.set(cardId, after);
      const at = find(confirmedCols(), cardId);
      if (at) {
        at.card.done += countDone(after) - countDone(before);
        at.card.total += after.length - before.length;
      }
    }
    if (!list.length) itemOps.delete(cardId);
  }

  // ---------- server calls ----------

  function loadColumn(col: Column): void {
    const token = ++colTokens[col];
    confirmed[col] = { status: "loading", error: "", cards: [] };
    api.fetchCards(col).then(
      cards => {
        if (disposed || token !== colTokens[col]) return;
        confirmed[col] = { status: "ok", error: "", cards: (cards ?? []).map(c => ({ ...c })) };
        render();
      },
      e => {
        if (disposed || token !== colTokens[col]) return;
        confirmed[col] = { status: "error", error: errorMessage(e), cards: [] };
        render();
      },
    );
  }

  function move(id: number, dir: "left" | "right" | "up" | "down"): void {
    const v = view();
    const at = find(v.cols, id);
    if (!at) return;
    const ci = COLUMNS.indexOf(at.col);
    let col = at.col;
    let index: number;
    if (dir === "left" || dir === "right") {
      const ti = dir === "left" ? ci - 1 : ci + 1;
      if (ti < 0 || ti >= COLUMNS.length) return;
      col = COLUMNS[ti];
      const target = v.cols[col];
      if (!target) return;
      if (col === "doing" && target.length >= WIP_LIMIT) return;
      index = target.length;
    } else {
      index = dir === "up" ? at.index - 1 : at.index + 1;
      if (index < 0 || index >= v.cols[col]!.length) return;
    }
    moveError = "";
    const op: BoardOp = { seq: ++seq, state: "pending", body: { kind: "move", id, col, index } };
    ops.push(op);
    render();
    api.moveCard(id, col, index).then(
      () => {
        if (disposed) return;
        op.state = "ok";
        foldBoard();
        render();
      },
      e => {
        if (disposed) return;
        ops = ops.filter(o => o !== op);
        foldBoard();
        moveError = `move error: ${errorMessage(e)}`;
        render();
      },
    );
  }

  function addCard(): void {
    const title = newCard.value.trim();
    if (!title || confirmed.todo.status !== "ok") return;
    addError = "";
    newCard.value = "";
    const body: BoardBody = { kind: "add", title };
    const op: BoardOp = { seq: ++seq, state: "pending", body };
    ops.push(op);
    render();
    api.addCard("todo", title).then(
      r => {
        if (disposed) return;
        body.result = { id: r.id, title: typeof r.title === "string" ? r.title : title };
        op.state = "ok";
        foldBoard();
        render();
      },
      e => {
        if (disposed) return;
        ops = ops.filter(o => o !== op);
        foldBoard();
        addError = `add error: ${errorMessage(e)}`;
        render();
      },
    );
  }

  function rename(): void {
    const id = selected;
    if (id === null) return;
    const title = detail.titleInput.value.trim();
    if (!title) return;
    renameError = "";
    const op: BoardOp = { seq: ++seq, state: "pending", body: { kind: "rename", id, title } };
    ops.push(op);
    render();
    api.renameCard(id, title).then(
      () => {
        if (disposed) return;
        op.state = "ok";
        foldBoard();
        render();
      },
      e => {
        if (disposed) return;
        ops = ops.filter(o => o !== op);
        foldBoard();
        if (selected === id) renameError = `rename error: ${errorMessage(e)}`;
        render();
      },
    );
  }

  function archive(): void {
    const id = selected;
    if (id === null) return;
    archiveError = "";
    const op: BoardOp = { seq: ++seq, state: "pending", body: { kind: "archive", id } };
    ops.push(op);
    select(null);
    api.archiveCard(id).then(
      () => {
        if (disposed) return;
        op.state = "ok";
        foldBoard();
        render();
      },
      e => {
        if (disposed) return;
        ops = ops.filter(o => o !== op);
        foldBoard();
        archiveError = `archive error: ${errorMessage(e)}`;
        render();
      },
    );
  }

  function loadChecklist(cardId: number): void {
    const token = ++checklistToken;
    checklist = { cardId, status: "loading", error: "", token };
    api.fetchChecklist(cardId).then(
      items => {
        if (disposed || !checklist || checklist.token !== token) return;
        confirmedItems.set(cardId, (items ?? []).map(i => ({ ...i })));
        checklist.status = "ok";
        render();
      },
      e => {
        if (disposed || !checklist || checklist.token !== token) return;
        checklist.status = "error";
        checklist.error = errorMessage(e);
        render();
      },
    );
  }

  function itemCall(cardId: number, body: ItemBody, call: () => Promise<unknown>, onOk?: (r: unknown) => void): void {
    itemError = "";
    const op: ItemOp = { seq: ++seq, state: "pending", body };
    let list = itemOps.get(cardId);
    if (!list) itemOps.set(cardId, (list = []));
    list.push(op);
    render();
    call().then(
      r => {
        if (disposed) return;
        onOk?.(r);
        op.state = "ok";
        foldItems(cardId);
        render();
      },
      e => {
        if (disposed) return;
        const l = itemOps.get(cardId);
        if (l) {
          const i = l.indexOf(op);
          if (i >= 0) l.splice(i, 1);
        }
        foldItems(cardId);
        if (selected === cardId) itemError = `item error: ${errorMessage(e)}`;
        render();
      },
    );
  }

  function toggle(itemId: number): void {
    const cardId = selected;
    if (cardId === null || checklist?.cardId !== cardId || checklist.status !== "ok") return;
    const r = replayItems(cardId);
    const item = r?.items.find(i => i.id === itemId);
    if (!item) return;
    const done = !item.done;
    itemCall(cardId, { kind: "toggle", itemId, done }, () => api.toggleItem(cardId, itemId, done));
  }

  function addItem(): void {
    const cardId = selected;
    if (cardId === null || checklist?.cardId !== cardId || checklist.status !== "ok") return;
    const text = detail.itemInput.value.trim();
    if (!text) return;
    detail.itemInput.value = "";
    const body: ItemBody = { kind: "add", text };
    itemCall(cardId, body, () => api.addItem(cardId, text), r => {
      const it = r as Partial<Item> | null;
      body.result = {
        id: Number(it?.id),
        text: typeof it?.text === "string" ? it.text : text,
        done: !!it?.done,
      };
    });
  }

  function select(id: number | null): void {
    if (selected === id) return;
    selected = id;
    renameError = "";
    itemError = "";
    checklist = null;
    checklistToken++;
    detail = buildDetail();
    detailHost.replaceChildren(detail.root);
    if (id !== null) loadChecklist(id);
    render();
  }

  // ---------- DOM ----------

  const banners = h("div", { class: "banners", attrs: { role: "status", "aria-live": "polite" } });
  const heads = {} as Record<Column, HTMLElement>;
  const bodies = {} as Record<Column, HTMLElement>;
  const newCard = h("input", { testid: "new-card", label: "New card title", attrs: { placeholder: "New card title", maxlength: "500" } });
  const addBtn = h("button", { testid: "add-card", text: "Add card", onClick: addCard });
  const addErrorHost = h("div", { attrs: { "aria-live": "polite" } });
  onEnter(newCard, addCard);

  const columnsEl = h("div", { class: "columns" });
  for (const col of COLUMNS) {
    heads[col] = h("h2", { testid: `head-${col}`, class: "col-head" });
    bodies[col] = h("div", { class: "col-body" });
    const section = h("section", { testid: `col-${col}`, class: "column", attrs: { "aria-label": NAMES[col] } }, heads[col], bodies[col]);
    if (col === "todo") section.append(h("div", { class: "add-row" }, newCard, addBtn), addErrorHost);
    columnsEl.append(section);
  }

  type Detail = {
    root: HTMLElement;
    titleInput: HTMLInputElement;
    itemInput: HTMLInputElement;
    heading: HTMLElement;
    where: HTMLElement;
    renameErr: HTMLElement;
    list: HTMLElement;
    itemErr: HTMLElement;
    addItemBtn: HTMLButtonElement;
  };

  function buildDetail(): Detail {
    const root = h("aside", { testid: "detail", class: "detail", attrs: { "aria-label": "Card detail" } });
    const titleInput = h("input", { testid: "title-input", label: "New title", attrs: { placeholder: "New title", maxlength: "500" } });
    const itemInput = h("input", { testid: "item-input", label: "New checklist item", attrs: { placeholder: "New item", maxlength: "500" } });
    const heading = h("h2", { testid: "detail-title" });
    const where = h("p", { testid: "detail-column", class: "muted" });
    const renameErr = h("div", { attrs: { "aria-live": "polite" } });
    const list = h("div", { testid: "checklist", class: "checklist" });
    const itemErr = h("div", { attrs: { "aria-live": "polite" } });
    const addItemBtn = h("button", { testid: "add-item", text: "Add item", onClick: addItem });
    onEnter(titleInput, rename);
    onEnter(itemInput, addItem);
    if (selected === null) {
      root.append(h("p", { class: "muted", text: "select a card" }));
    } else {
      root.append(
        heading,
        where,
        h("div", { class: "add-row" }, titleInput, h("button", { testid: "rename", text: "Rename", onClick: rename })),
        renameErr,
        h("button", { testid: "archive", class: "danger", text: "Archive", onClick: archive }),
        h("h3", { text: "Checklist" }),
        list,
        h("div", { class: "add-row" }, itemInput, addItemBtn),
        itemErr,
      );
    }
    return { root, titleInput, itemInput, heading, where, renameErr, list, itemErr, addItemBtn };
  }

  const detailHost = h("div", { class: "detail-host" });
  let detail = buildDetail();
  detailHost.append(detail.root);

  const page = h("div", { class: "board" }, banners, h("div", { class: "board-main" }, columnsEl, detailHost));
  host.append(page);

  const errorEl = (testid: string, text: string) => h("div", { testid, class: "error", attrs: { role: "alert" }, text });

  function cardRow(card: Card, col: Column, index: number, length: number, doingFull: boolean, cols: Cols): HTMLElement {
    const ci = COLUMNS.indexOf(col);
    const isSel = selected === card.id;
    const cardEl = h("button", {
      testid: "card",
      class: isSel ? "card selected" : "card",
      key: `card-${card.id}`,
      text: `#${card.id} ${card.title} · ${card.done}/${card.total}`,
      attrs: { "aria-pressed": String(isSel) },
      onClick: () => select(card.id),
    });
    const row = h("li", { class: "row" }, cardEl);
    const btns = h("span", { class: "moves" });
    const sideDisabled = (target: Column) => !cols[target] || (target === "doing" && col !== "doing" && doingFull);
    if (ci > 0) {
      const t = COLUMNS[ci - 1];
      btns.append(h("button", { testid: "left", key: `left-${card.id}`, text: "←", label: `Move #${card.id} to ${NAMES[t]}`, disabled: sideDisabled(t), onClick: () => move(card.id, "left") }));
    }
    if (ci < COLUMNS.length - 1) {
      const t = COLUMNS[ci + 1];
      btns.append(h("button", { testid: "right", key: `right-${card.id}`, text: "→", label: `Move #${card.id} to ${NAMES[t]}`, disabled: sideDisabled(t), onClick: () => move(card.id, "right") }));
    }
    if (index > 0) btns.append(h("button", { testid: "up", key: `up-${card.id}`, text: "↑", label: `Move #${card.id} up`, onClick: () => move(card.id, "up") }));
    if (index < length - 1) btns.append(h("button", { testid: "down", key: `down-${card.id}`, text: "↓", label: `Move #${card.id} down`, onClick: () => move(card.id, "down") }));
    row.append(btns);
    return row;
  }

  function render(): void {
    if (disposed) return;
    const v = view();

    // A selected card that is no longer on the board is deselected.
    if (selected !== null && !find(v.cols, selected)) {
      select(null);
      return;
    }

    const banner: HTMLElement[] = [];
    if (moveError) banner.push(errorEl("move-error", moveError));
    if (archiveError) banner.push(errorEl("archive-error", archiveError));
    banners.replaceChildren(...banner);
    addErrorHost.replaceChildren(...(addError ? [errorEl("add-error", addError)] : []));

    const doingFull = (v.cols.doing?.length ?? 0) >= WIP_LIMIT;
    for (const col of COLUMNS) {
      const state = confirmed[col];
      const cards = v.cols[col];
      if (state.status === "loading" || !cards) {
        heads[col].textContent = NAMES[col];
        if (state.status === "error") {
          replaceKeepingFocus(bodies[col], [
            h("p", { class: "error", text: `error: ${state.error}` }),
            h("button", { testid: `retry-${col}`, key: `retry-${col}`, text: "Retry", onClick: () => { loadColumn(col); render(); } }),
          ]);
        } else {
          bodies[col].replaceChildren(h("p", { class: "muted", text: "loading" }));
        }
        continue;
      }
      const adding = col === "todo" ? v.adding : [];
      heads[col].textContent = `${NAMES[col]} (${cards.length + adding.length})`;
      const list = h("ul", { class: "cards" });
      cards.forEach((c, i) => list.append(cardRow(c, col, i, cards.length, doingFull, v.cols)));
      for (const a of adding) list.append(h("li", { class: "row" }, h("div", { testid: "card", class: "card pending", text: `${a.text} (adding…)` })));
      replaceKeepingFocus(bodies[col], [list]);
    }
    addBtn.disabled = confirmed.todo.status !== "ok";

    renderDetail(v.cols);
  }

  function renderDetail(cols: Cols): void {
    if (selected === null) return;
    const at = find(cols, selected);
    if (!at) return;
    const d = detail;
    d.heading.textContent = `#${at.card.id} ${at.card.title}`;
    d.where.textContent = `in ${NAMES[at.col]}`;
    d.renameErr.replaceChildren(...(renameError ? [errorEl("rename-error", renameError)] : []));
    d.itemErr.replaceChildren(...(itemError ? [errorEl("item-error", itemError)] : []));

    const cl = checklist;
    const ready = !!cl && cl.cardId === selected && cl.status === "ok";
    d.addItemBtn.disabled = !ready;
    if (!cl || cl.cardId !== selected || cl.status === "loading") {
      d.list.replaceChildren(h("p", { class: "muted", text: "loading checklist" }));
      return;
    }
    if (cl.status === "error") {
      const id = selected;
      replaceKeepingFocus(d.list, [
        h("p", { class: "error", text: `checklist error: ${cl.error}` }),
        h("button", { testid: "retry-checklist", key: "retry-checklist", text: "Retry", onClick: () => { loadChecklist(id); render(); } }),
      ]);
      return;
    }
    const r = replayItems(selected) ?? { items: [], adding: [] };
    const ul = h("ul", { class: "items" });
    for (const it of r.items) {
      ul.append(h("li", { class: "row" },
        h("span", { testid: "item", class: it.done ? "item done" : "item", text: `${it.done ? "[x]" : "[ ]"} ${it.text}` }),
        h("button", { testid: "toggle", key: `toggle-${it.id}`, text: it.done ? "Undo" : "Done", label: `Toggle ${it.text}`, attrs: { "aria-pressed": String(it.done) }, onClick: () => toggle(it.id) }),
      ));
    }
    for (const a of r.adding) ul.append(h("li", { class: "row" }, h("span", { testid: "item", class: "item pending", text: `[ ] ${a.text} (adding…)` })));
    const total = r.items.length + r.adding.length;
    replaceKeepingFocus(d.list, [ul, h("p", { testid: "progress", class: "muted", text: `${countDone(r.items)}/${total} done` })]);
  }

  for (const col of COLUMNS) loadColumn(col);
  render();

  return () => {
    disposed = true;
    page.remove();
  };
}
