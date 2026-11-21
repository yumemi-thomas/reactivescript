import * as api from "./api.js";
import type { Card, Column, Item } from "./api.js";
import { button, el, errorMessage, inlineForm, replaceChildren } from "./dom.js";

// The board keeps what the server has confirmed, plus a list of optimistic operations still in flight.
// What is shown is always confirmed state with the pending operations replayed on top, so any one
// operation can fail and be dropped without disturbing the others.

const COLUMNS: Column[] = ["todo", "doing", "done"];
const COLUMN_NAME: Record<Column, string> = { todo: "To do", doing: "Doing", done: "Done" };
const WIP_LIMIT = 3;

type ColState = { status: "loading" | "error" | "ready"; error: string; cards: Card[]; token: number };

type BoardOp =
  | { kind: "move"; opId: number; id: number; to: Column; index: number }
  | { kind: "add"; opId: number; title: string }
  | { kind: "rename"; opId: number; id: number; title: string }
  | { kind: "archive"; opId: number; id: number };

type ItemOp =
  | { kind: "toggle"; opId: number; itemId: number; done: boolean }
  | { kind: "add"; opId: number; text: string };

type ChecklistState = { status: "loading" | "error" | "ready"; error: string; items: Item[]; ops: ItemOp[]; token: number };

type ViewCard = { key: string; id: number | null; title: string; done: number; total: number; adding: boolean };
type ViewItem = { key: string; id: number | null; text: string; done: boolean; adding: boolean };
type View = Record<Column, ViewCard[] | null>;

function itemsView(cl: ChecklistState): ViewItem[] {
  const list: ViewItem[] = cl.items.map(i => ({ key: `i${i.id}`, id: i.id, text: i.text, done: i.done, adding: false }));
  for (const op of cl.ops) {
    if (op.kind === "toggle") {
      const it = list.find(i => i.id === op.itemId);
      if (it) it.done = op.done;
    } else {
      list.push({ key: `p${op.opId}`, id: null, text: op.text, done: false, adding: true });
    }
  }
  return list;
}

function counts(list: { done: boolean }[]): { done: number; total: number } {
  return { done: list.filter(i => i.done).length, total: list.length };
}

function isCardArray(v: unknown): v is Card[] {
  return Array.isArray(v);
}

export function mountBoard(container: HTMLElement): () => void {
  let alive = true;
  let seq = 0;
  const nextId = () => ++seq;

  const cols: Record<Column, ColState> = {
    todo: { status: "loading", error: "", cards: [], token: 0 },
    doing: { status: "loading", error: "", cards: [], token: 0 },
    done: { status: "loading", error: "", cards: [], token: 0 },
  };
  let ops: BoardOp[] = [];
  const checklists = new Map<number, ChecklistState>();
  let selectedId: number | null = null;
  let moveError = "";
  let addError = "";
  let archiveError = "";
  let renameError = "";
  let itemError = "";

  // ---------- derived state ----------

  function view(): View {
    const v: View = { todo: null, doing: null, done: null };
    for (const c of COLUMNS) {
      if (cols[c].status === "ready") {
        v[c] = cols[c].cards.map(x => ({ key: `c${x.id}`, id: x.id, title: x.title, done: x.done, total: x.total, adding: false }));
      }
    }
    for (const op of ops) {
      if (op.kind === "add") {
        v.todo?.push({ key: `a${op.opId}`, id: null, title: op.title, done: 0, total: 0, adding: true });
        continue;
      }
      const loc = locate(v, op.id);
      if (!loc) continue;
      const list = v[loc.col]!;
      if (op.kind === "rename") {
        list[loc.index].title = op.title;
      } else if (op.kind === "archive") {
        list.splice(loc.index, 1);
      } else {
        const target = v[op.to];
        if (!target) continue;
        const [card] = list.splice(loc.index, 1);
        target.splice(Math.min(op.index, target.length), 0, card);
      }
    }
    for (const c of COLUMNS) {
      for (const card of v[c] ?? []) {
        if (card.id === null) continue;
        const cl = checklists.get(card.id);
        if (!cl) continue;
        const shown = counts(itemsView(cl));
        const base = counts(cl.items);
        card.done += shown.done - base.done;
        card.total += shown.total - base.total;
      }
    }
    return v;
  }

  function locate(v: Record<Column, { id: number | null }[] | null>, id: number): { col: Column; index: number } | null {
    for (const c of COLUMNS) {
      const list = v[c];
      if (!list) continue;
      const index = list.findIndex(x => x.id === id);
      if (index >= 0) return { col: c, index };
    }
    return null;
  }

  function confirmedCard(id: number): Card | null {
    const loc = locate({ todo: cols.todo.cards, doing: cols.doing.cards, done: cols.done.cards }, id);
    return loc ? cols[loc.col].cards[loc.index] : null;
  }

  function removeOp(op: BoardOp): void {
    ops = ops.filter(o => o !== op);
  }

  // ---------- loading ----------

  function loadColumn(c: Column): void {
    const st = cols[c];
    const token = ++st.token;
    st.status = "loading";
    st.error = "";
    st.cards = [];
    render();
    api.fetchCards(c).then(
      cards => {
        if (!alive || token !== st.token) return;
        if (!isCardArray(cards)) {
          st.status = "error";
          st.error = "bad response";
        } else {
          st.status = "ready";
          st.cards = cards.map(x => ({ id: x.id, title: x.title, done: x.done, total: x.total }));
        }
        render();
      },
      e => {
        if (!alive || token !== st.token) return;
        st.status = "error";
        st.error = errorMessage(e);
        render();
      },
    );
  }

  function loadChecklist(id: number): void {
    let cl = checklists.get(id);
    if (!cl) {
      cl = { status: "loading", error: "", items: [], ops: [], token: 0 };
      checklists.set(id, cl);
    }
    const st = cl;
    const token = ++st.token;
    st.status = "loading";
    st.error = "";
    api.fetchChecklist(id).then(
      items => {
        if (!alive || token !== st.token) return;
        if (!Array.isArray(items)) {
          st.status = "error";
          st.error = "bad response";
        } else {
          st.status = "ready";
          st.items = items.map(i => ({ id: i.id, text: i.text, done: !!i.done }));
        }
        render();
      },
      e => {
        if (!alive || token !== st.token) return;
        st.status = "error";
        st.error = errorMessage(e);
        render();
      },
    );
  }

  // ---------- actions ----------

  function move(card: ViewCard, from: Column, index: number, dir: "left" | "right" | "up" | "down"): void {
    if (card.id === null) return;
    const v = view();
    let to: Column = from;
    let toIndex: number;
    if (dir === "left" || dir === "right") {
      to = COLUMNS[COLUMNS.indexOf(from) + (dir === "left" ? -1 : 1)];
      const target = v[to];
      if (!to || !target) return;
      if (to === "doing" && target.length >= WIP_LIMIT) return;
      toIndex = target.length;
    } else {
      const list = v[from];
      if (!list) return;
      toIndex = index + (dir === "up" ? -1 : 1);
      if (toIndex < 0 || toIndex >= list.length) return;
    }
    const id = card.id;
    moveError = "";
    const op: BoardOp = { kind: "move", opId: nextId(), id, to, index: toIndex };
    ops.push(op);
    render();
    api.moveCard(id, to, toIndex).then(
      () => {
        if (!alive) return;
        removeOp(op);
        const cur = { todo: cols.todo.cards, doing: cols.doing.cards, done: cols.done.cards };
        const loc = locate(cur, id);
        if (loc && cols[to].status === "ready") {
          const [c] = cols[loc.col].cards.splice(loc.index, 1);
          const target = cols[to].cards;
          target.splice(Math.min(toIndex, target.length), 0, c);
        }
        render();
      },
      e => {
        if (!alive) return;
        removeOp(op);
        moveError = `move error: ${errorMessage(e)}`;
        render();
      },
    );
  }

  function addCard(input: HTMLInputElement): void {
    const title = input.value.trim();
    if (!title || cols.todo.status !== "ready") return;
    addError = "";
    input.value = "";
    const op: BoardOp = { kind: "add", opId: nextId(), title };
    ops.push(op);
    render();
    api.addCard("todo", title).then(
      res => {
        if (!alive) return;
        removeOp(op);
        if (!confirmedCard(res.id)) {
          cols.todo.cards.push({ id: res.id, title: typeof res.title === "string" ? res.title : title, done: 0, total: 0 });
        }
        render();
      },
      e => {
        if (!alive) return;
        removeOp(op);
        addError = `add error: ${errorMessage(e)}`;
        render();
      },
    );
  }

  function select(card: ViewCard): void {
    if (card.id === null || card.id === selectedId) return;
    selectedId = card.id;
    renameError = "";
    itemError = "";
    detailParts = null;
    loadChecklist(card.id);
    render();
  }

  function rename(input: HTMLInputElement): void {
    const id = selectedId;
    const title = input.value.trim();
    if (id === null || !title) return;
    renameError = "";
    const op: BoardOp = { kind: "rename", opId: nextId(), id, title };
    ops.push(op);
    render();
    api.renameCard(id, title).then(
      () => {
        if (!alive) return;
        removeOp(op);
        const c = confirmedCard(id);
        if (c) c.title = title;
        render();
      },
      e => {
        if (!alive) return;
        removeOp(op);
        if (selectedId === id) renameError = `rename error: ${errorMessage(e)}`;
        render();
      },
    );
  }

  function archive(): void {
    const id = selectedId;
    if (id === null) return;
    archiveError = "";
    const op: BoardOp = { kind: "archive", opId: nextId(), id };
    ops.push(op);
    selectedId = null;
    renameError = "";
    itemError = "";
    detailParts = null;
    render();
    api.archiveCard(id).then(
      () => {
        if (!alive) return;
        removeOp(op);
        const loc = locate({ todo: cols.todo.cards, doing: cols.doing.cards, done: cols.done.cards }, id);
        if (loc) cols[loc.col].cards.splice(loc.index, 1);
        checklists.delete(id);
        render();
      },
      e => {
        if (!alive) return;
        removeOp(op);
        archiveError = `archive error: ${errorMessage(e)}`;
        render();
      },
    );
  }

  /** Apply a settled checklist change to confirmed state, keeping the card's confirmed counts in step. */
  function commitItems(cardId: number, cl: ChecklistState, change: (items: Item[]) => void): void {
    const before = counts(cl.items);
    change(cl.items);
    const after = counts(cl.items);
    const c = confirmedCard(cardId);
    if (c) {
      c.done += after.done - before.done;
      c.total += after.total - before.total;
    }
  }

  function toggle(item: ViewItem): void {
    const cardId = selectedId;
    if (cardId === null || item.id === null) return;
    const cl = checklists.get(cardId);
    if (!cl) return;
    const itemId = item.id;
    const done = !item.done;
    itemError = "";
    const op: ItemOp = { kind: "toggle", opId: nextId(), itemId, done };
    cl.ops.push(op);
    render();
    api.toggleItem(cardId, itemId, done).then(
      () => {
        if (!alive) return;
        cl.ops = cl.ops.filter(o => o !== op);
        commitItems(cardId, cl, items => {
          const it = items.find(i => i.id === itemId);
          if (it) it.done = done;
        });
        render();
      },
      e => {
        if (!alive) return;
        cl.ops = cl.ops.filter(o => o !== op);
        if (selectedId === cardId) itemError = `item error: ${errorMessage(e)}`;
        render();
      },
    );
  }

  function addItem(input: HTMLInputElement): void {
    const cardId = selectedId;
    const text = input.value.trim();
    if (cardId === null || !text) return;
    const cl = checklists.get(cardId);
    if (!cl) return;
    itemError = "";
    input.value = "";
    const op: ItemOp = { kind: "add", opId: nextId(), text };
    cl.ops.push(op);
    render();
    api.addItem(cardId, text).then(
      res => {
        if (!alive) return;
        cl.ops = cl.ops.filter(o => o !== op);
        commitItems(cardId, cl, items => {
          if (!items.some(i => i.id === res.id)) {
            items.push({ id: res.id, text: typeof res.text === "string" ? res.text : text, done: !!res.done });
          }
        });
        render();
      },
      e => {
        if (!alive) return;
        cl.ops = cl.ops.filter(o => o !== op);
        if (selectedId === cardId) itemError = `item error: ${errorMessage(e)}`;
        render();
      },
    );
  }

  // ---------- DOM skeleton ----------

  const heads = {} as Record<Column, HTMLElement>;
  const bodies = {} as Record<Column, HTMLElement>;
  const sections: HTMLElement[] = [];
  const addErrorSlot = el("div", { cls: "slot" });
  const add = inlineForm("new-card", "add-card", "Add card", "New card title", addCard);
  for (const c of COLUMNS) {
    heads[c] = el("h2", { testid: `head-${c}`, cls: "col-head" });
    bodies[c] = el("div", { cls: "col-body", attrs: { "aria-live": "polite" } });
    const section = el("section", { testid: `col-${c}`, cls: "column", attrs: { "aria-label": COLUMN_NAME[c] } }, heads[c], bodies[c]);
    if (c === "todo") section.append(el("div", { cls: "add-card" }, add.form, addErrorSlot));
    sections.push(section);
  }
  const bannerSlot = el("div", { cls: "banners" });
  const detail = el("aside", { testid: "detail", cls: "detail", attrs: { "aria-label": "Card detail" } });
  const boardEl = el("div", { cls: "board-page" }, bannerSlot, el("div", { cls: "board" }, el("div", { cls: "columns" }, ...sections), detail));
  container.replaceChildren(boardEl);

  // Detail parts live as long as one selection, so typing and focus survive re-renders.
  type DetailParts = {
    root: HTMLElement; title: HTMLElement; where: HTMLElement; renameInput: HTMLInputElement; renameErr: HTMLElement;
    checklist: HTMLElement; progress: HTMLElement; itemErr: HTMLElement; itemSubmit: HTMLButtonElement;
  };
  let detailParts: DetailParts | null = null;
  const placeholder = el("p", { cls: "muted", text: "select a card" });

  function buildDetail(): DetailParts {
    const title = el("h3", { cls: "detail-title" });
    const where = el("p", { cls: "muted" });
    const r = inlineForm("title-input", "rename", "Rename", "New title", rename);
    const renameErr = el("div", { cls: "slot" });
    const archiveBtn = button("archive", "Archive", archive);
    const checklist = el("ul", { testid: "checklist", cls: "checklist", attrs: { "aria-label": "Checklist" } });
    const progress = el("p", { testid: "progress", cls: "progress" });
    const ai = inlineForm("item-input", "add-item", "Add item", "New checklist item", addItem);
    const itemErr = el("div", { cls: "slot" });
    const root = el("div", { cls: "detail-body" },
      title, where, r.form, renameErr, el("div", { cls: "detail-actions" }, archiveBtn),
      el("h4", { text: "Checklist" }), checklist, progress, ai.form, itemErr);
    return { root, title, where, renameInput: r.input, renameErr, checklist, progress, itemErr, itemSubmit: ai.submit };
  }

  function errorNode(testid: string | undefined, text: string): HTMLElement[] {
    return text ? [el("p", { testid, cls: "error", text, attrs: { role: "alert" } })] : [];
  }

  // ---------- render ----------

  function render(): void {
    if (!alive) return;
    const v = view();
    const doingCount = v.doing?.length ?? 0;
    const wipFull = doingCount >= WIP_LIMIT;

    for (const c of COLUMNS) {
      const st = cols[c];
      const list = v[c];
      heads[c].textContent = list ? `${COLUMN_NAME[c]} (${list.length})` : COLUMN_NAME[c];
      if (st.status === "loading") {
        replaceChildren(bodies[c], [el("p", { cls: "muted", text: "loading" })]);
      } else if (st.status === "error" || !list) {
        replaceChildren(bodies[c], [
          el("p", { cls: "error", text: `error: ${st.error}` }),
          button(`retry-${c}`, "Retry", () => loadColumn(c), { fkey: `retry-${c}` }),
        ]);
      } else {
        const ci = COLUMNS.indexOf(c);
        const rows = list.map((card, i) => {
          const text = card.adding ? `${card.title} (adding…)` : `#${card.id} ${card.title} · ${card.done}/${card.total}`;
          const cardEl = el("div", { testid: "card", cls: "card", text });
          const row = el("li", { cls: "card-row" }, cardEl);
          if (card.adding) {
            row.classList.add("pending");
            return row;
          }
          cardEl.tabIndex = 0;
          cardEl.setAttribute("role", "button");
          cardEl.dataset.fkey = `${card.key}:select`;
          if (card.id === selectedId) {
            row.classList.add("selected");
            cardEl.setAttribute("aria-pressed", "true");
          } else {
            cardEl.setAttribute("aria-pressed", "false");
          }
          cardEl.addEventListener("click", () => select(card));
          cardEl.addEventListener("keydown", ev => {
            if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); select(card); }
          });
          const btns = el("div", { cls: "moves" });
          const mk = (dir: "left" | "right" | "up" | "down", disabled: boolean) =>
            btns.append(button(dir, dir, () => move(card, c, i, dir), { disabled, title: `Move ${dir}`, fkey: `${card.key}:${dir}` }));
          if (ci > 0) {
            const to = COLUMNS[ci - 1];
            mk("left", !v[to] || (to === "doing" && wipFull));
          }
          if (ci < COLUMNS.length - 1) {
            const to = COLUMNS[ci + 1];
            mk("right", !v[to] || (to === "doing" && wipFull));
          }
          if (i > 0) mk("up", false);
          if (i < list.length - 1) mk("down", false);
          row.append(btns);
          return row;
        });
        replaceChildren(bodies[c], [el("ul", { cls: "cards" }, ...rows)]);
      }
    }
    add.submit.disabled = cols.todo.status !== "ready";
    replaceChildren(addErrorSlot, errorNode("add-error", addError));
    replaceChildren(bannerSlot, [...errorNode("move-error", moveError), ...errorNode("archive-error", archiveError)]);

    // detail
    const loc = selectedId === null ? null : locate(v, selectedId);
    if (selectedId === null || !loc) {
      detailParts = null;
      if (detail.firstChild !== placeholder || detail.childNodes.length !== 1) detail.replaceChildren(placeholder);
      return;
    }
    if (!detailParts) {
      detailParts = buildDetail();
      detail.replaceChildren(detailParts.root);
    }
    const d = detailParts;
    const card = v[loc.col]![loc.index];
    d.title.textContent = `#${card.id} ${card.title}`;
    d.where.textContent = `in ${COLUMN_NAME[loc.col]}`;
    replaceChildren(d.renameErr, errorNode("rename-error", renameError));
    replaceChildren(d.itemErr, errorNode("item-error", itemError));

    const cl = checklists.get(selectedId);
    const rows: Node[] = [];
    if (!cl || cl.status === "loading") rows.push(el("li", { cls: "muted", text: "loading checklist" }));
    else if (cl.status === "error") rows.push(el("li", { cls: "error", text: `checklist error: ${cl.error}` }));
    const items = cl ? itemsView(cl).filter(it => cl.status === "ready" || it.adding) : [];
    for (const it of items) {
      const text = `${it.done ? "[x]" : "[ ]"} ${it.text}${it.adding ? " (adding…)" : ""}`;
      const row = el("li", { cls: "item-row" }, el("span", { testid: "item", cls: "item", text }));
      if (it.adding) row.classList.add("pending");
      else row.append(button("toggle", "toggle", () => toggle(it), { title: it.done ? "Mark not done" : "Mark done", fkey: `${it.key}:toggle` }));
      rows.push(row);
    }
    replaceChildren(d.checklist, rows);
    if (cl && cl.status === "ready") {
      const n = counts(items);
      d.progress.textContent = `${n.done}/${n.total} done`;
      d.progress.hidden = false;
      if (!d.progress.isConnected) d.checklist.after(d.progress);
    } else {
      d.progress.remove();
    }
  }

  for (const c of COLUMNS) loadColumn(c);
  render();

  return () => {
    alive = false;
    container.replaceChildren();
  };
}
