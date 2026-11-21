import { useEffect, useReducer, useState } from "react";
import type { Dispatch } from "react";
import {
  addCard,
  addItem,
  archiveCard,
  fetchArchived,
  fetchCards,
  fetchChecklist,
  moveCard,
  renameCard,
  restoreCard,
  toggleItem,
} from "./api.js";
import type { Archived, Column, Card as ServerCard, Item as ServerItem } from "./api.js";

const COLUMNS: readonly Column[] = ["todo", "doing", "done"];
const LABEL: Record<Column, string> = { todo: "To do", doing: "Doing", done: "Done" };
const WIP_LIMIT = 3;
type Dir = "left" | "right" | "up" | "down";
const DIRS: readonly Dir[] = ["left", "right", "up", "down"];

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/* ---------- board state ----------
 * A card or item carries a local `key` for React and an `id` that is null
 * while the server has not yet answered its add. */

type Card = { key: string; id: number | null; title: string; done: number; total: number };
type Item = { key: string; id: number | null; text: string; done: boolean };
type ColState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; cards: Card[] };
type Checklist =
  | { cardId: number; status: "loading" }
  | { cardId: number; status: "error"; message: string }
  | { cardId: number; status: "ready"; items: Item[] };

type BoardState = {
  columns: Record<Column, ColState>;
  attempts: Record<Column, number>;
  selected: number | null;
  checklist: Checklist | null;
  moveError: string | null;
  addError: string | null;
  archiveError: string | null;
  renameError: string | null;
  itemError: string | null;
};

type Hit = { col: Column; index: number; card: Card };
type MovePlan = { key: string; id: number; from: Column; fromIndex: number; to: Column; toIndex: number };

type Action =
  | { type: "retry"; col: Column }
  | { type: "colLoaded"; col: Column; cards: ServerCard[] }
  | { type: "colFailed"; col: Column; message: string }
  | { type: "select"; id: number }
  | { type: "checklistLoaded"; cardId: number; items: ServerItem[] }
  | { type: "checklistFailed"; cardId: number; message: string }
  | { type: "moveStart"; plan: MovePlan }
  | { type: "moveRollback"; plan: MovePlan; message: string }
  | { type: "addStart"; key: string; title: string }
  | { type: "addDone"; key: string; id: number; title: string }
  | { type: "addFailed"; key: string; message: string }
  | { type: "renameStart"; id: number; title: string }
  | { type: "renameFailed"; id: number; prev: string; attempted: string; message: string }
  | { type: "archiveStart"; id: number }
  | { type: "archiveFailed"; card: Card; col: Column; index: number; message: string }
  | { type: "toggleStart"; cardId: number; itemId: number; done: boolean }
  | { type: "toggleFailed"; cardId: number; itemId: number; done: boolean; message: string }
  | { type: "itemAddStart"; cardId: number; key: string; text: string }
  | { type: "itemAddDone"; cardId: number; key: string; id: number }
  | { type: "itemAddFailed"; cardId: number; key: string; message: string };

const initialBoard: BoardState = {
  columns: { todo: { status: "loading" }, doing: { status: "loading" }, done: { status: "loading" } },
  attempts: { todo: 0, doing: 0, done: 0 },
  selected: null,
  checklist: null,
  moveError: null,
  addError: null,
  archiveError: null,
  renameError: null,
  itemError: null,
};

function toCard(c: ServerCard): Card {
  return { key: `c${c.id}`, id: c.id, title: c.title, done: c.done, total: c.total };
}
function toItem(i: ServerItem): Item {
  return { key: `i${i.id}`, id: i.id, text: i.text, done: i.done };
}

function readyCards(s: BoardState, col: Column): Card[] | null {
  const c = s.columns[col];
  return c.status === "ready" ? c.cards : null;
}

function setCards(s: BoardState, col: Column, cards: Card[]): BoardState {
  return { ...s, columns: { ...s.columns, [col]: { status: "ready", cards } } };
}

function findCard(s: BoardState, pred: (c: Card) => boolean): Hit | null {
  for (const col of COLUMNS) {
    const cs = readyCards(s, col);
    if (!cs) continue;
    const index = cs.findIndex(pred);
    if (index >= 0) return { col, index, card: cs[index] };
  }
  return null;
}

function insertAt<T>(list: T[], index: number, item: T): T[] {
  const i = Math.max(0, Math.min(index, list.length));
  return [...list.slice(0, i), item, ...list.slice(i)];
}

function removeWhere(s: BoardState, pred: (c: Card) => boolean): BoardState {
  let next = s;
  for (const col of COLUMNS) {
    const cs = readyCards(s, col);
    if (cs && cs.some(pred)) next = setCards(next, col, cs.filter(c => !pred(c)));
  }
  return next;
}

/** takes the card with `key` out of wherever it is and puts it into `to` at `toIndex` */
function relocate(s: BoardState, key: string, to: Column, toIndex: number): BoardState {
  const hit = findCard(s, c => c.key === key);
  if (!hit || !readyCards(s, to)) return s;
  const removed = removeWhere(s, c => c.key === key);
  return setCards(removed, to, insertAt(readyCards(removed, to) ?? [], toIndex, hit.card));
}

function mapCard(s: BoardState, pred: (c: Card) => boolean, f: (c: Card) => Card): BoardState {
  const hit = findCard(s, pred);
  if (!hit) return s;
  return setCards(s, hit.col, (readyCards(s, hit.col) ?? []).map(c => (pred(c) ? f(c) : c)));
}

function bumpCard(s: BoardState, cardId: number, dDone: number, dTotal: number): BoardState {
  return mapCard(s, c => c.id === cardId, c => ({ ...c, done: c.done + dDone, total: c.total + dTotal }));
}

function mapItems(s: BoardState, cardId: number, f: (items: Item[]) => Item[]): BoardState {
  const cl = s.checklist;
  if (!cl || cl.cardId !== cardId || cl.status !== "ready") return s;
  return { ...s, checklist: { cardId, status: "ready", items: f(cl.items) } };
}

function setItemDone(s: BoardState, cardId: number, itemId: number, done: boolean): BoardState {
  return mapItems(s, cardId, items => items.map(i => (i.id === itemId ? { ...i, done } : i)));
}

/** where a move button leads: null when the button is not shown at all */
type Option = { to: Column; toIndex: number; enabled: boolean };
function moveOption(s: BoardState, col: Column, index: number, dir: Dir): Option | null {
  if (dir === "up" || dir === "down") {
    const count = (readyCards(s, col) ?? []).length;
    const toIndex = dir === "up" ? index - 1 : index + 1;
    if (toIndex < 0 || toIndex >= count) return null;
    return { to: col, toIndex, enabled: true };
  }
  const i = COLUMNS.indexOf(col) + (dir === "right" ? 1 : -1);
  if (i < 0 || i >= COLUMNS.length) return null;
  const to = COLUMNS[i];
  const target = readyCards(s, to);
  if (!target) return { to, toIndex: 0, enabled: false };
  const full = to === "doing" && target.length >= WIP_LIMIT;
  return { to, toIndex: target.length, enabled: !full };
}

function planMove(s: BoardState, key: string, dir: Dir): MovePlan | null {
  const hit = findCard(s, c => c.key === key);
  if (!hit) return null;
  const card = hit.card;
  if (card.id === null) return null;
  const opt = moveOption(s, hit.col, hit.index, dir);
  if (!opt || !opt.enabled) return null;
  return { key, id: card.id, from: hit.col, fromIndex: hit.index, to: opt.to, toIndex: opt.toIndex };
}

function reducer(s: BoardState, a: Action): BoardState {
  switch (a.type) {
    case "retry":
      return {
        ...s,
        columns: { ...s.columns, [a.col]: { status: "loading" } },
        attempts: { ...s.attempts, [a.col]: s.attempts[a.col] + 1 },
      };
    case "colLoaded":
      return setCards(s, a.col, a.cards.map(toCard));
    case "colFailed":
      return { ...s, columns: { ...s.columns, [a.col]: { status: "error", message: a.message } } };
    case "select": {
      if (s.selected === a.id) return s;
      return {
        ...s,
        selected: a.id,
        checklist: { cardId: a.id, status: "loading" },
        renameError: null,
        itemError: null,
      };
    }
    case "checklistLoaded": {
      if (!s.checklist || s.checklist.cardId !== a.cardId) return s;
      return { ...s, checklist: { cardId: a.cardId, status: "ready", items: a.items.map(toItem) } };
    }
    case "checklistFailed": {
      if (!s.checklist || s.checklist.cardId !== a.cardId) return s;
      return { ...s, checklist: { cardId: a.cardId, status: "error", message: a.message } };
    }
    case "moveStart":
      return { ...relocate(s, a.plan.key, a.plan.to, a.plan.toIndex), moveError: null };
    case "moveRollback":
      return {
        ...relocate(s, a.plan.key, a.plan.from, a.plan.fromIndex),
        moveError: `move error: ${a.message}`,
      };
    case "addStart": {
      const todo = readyCards(s, "todo");
      if (!todo) return s;
      const card: Card = { key: a.key, id: null, title: a.title, done: 0, total: 0 };
      return { ...setCards(s, "todo", [...todo, card]), addError: null };
    }
    case "addDone":
      return mapCard(s, c => c.key === a.key, c => ({ ...c, key: `c${a.id}`, id: a.id, title: a.title }));
    case "addFailed":
      return { ...removeWhere(s, c => c.key === a.key), addError: `add error: ${a.message}` };
    case "renameStart":
      return {
        ...mapCard(s, c => c.id === a.id, c => ({ ...c, title: a.title })),
        renameError: null,
      };
    case "renameFailed": {
      let next = mapCard(s, c => c.id === a.id && c.title === a.attempted, c => ({ ...c, title: a.prev }));
      if (next.selected === a.id) next = { ...next, renameError: `rename error: ${a.message}` };
      return next;
    }
    case "archiveStart":
      return {
        ...removeWhere(s, c => c.id === a.id),
        selected: null,
        checklist: null,
        renameError: null,
        itemError: null,
        archiveError: null,
      };
    case "archiveFailed": {
      const cs = readyCards(s, a.col);
      if (!cs) return { ...s, archiveError: `archive error: ${a.message}` };
      return { ...setCards(s, a.col, insertAt(cs, a.index, a.card)), archiveError: `archive error: ${a.message}` };
    }
    case "toggleStart":
      return {
        ...bumpCard(setItemDone(s, a.cardId, a.itemId, a.done), a.cardId, a.done ? 1 : -1, 0),
        itemError: null,
      };
    case "toggleFailed": {
      let next = bumpCard(setItemDone(s, a.cardId, a.itemId, !a.done), a.cardId, a.done ? -1 : 1, 0);
      if (next.selected === a.cardId) next = { ...next, itemError: `item error: ${a.message}` };
      return next;
    }
    case "itemAddStart": {
      const next = mapItems(s, a.cardId, items => [...items, { key: a.key, id: null, text: a.text, done: false }]);
      if (next === s) return s;
      return { ...bumpCard(next, a.cardId, 0, 1), itemError: null };
    }
    case "itemAddDone":
      return mapItems(s, a.cardId, items => items.map(i => (i.key === a.key ? { ...i, id: a.id } : i)));
    case "itemAddFailed": {
      const next = mapItems(s, a.cardId, items => items.filter(i => i.key !== a.key));
      const base = next === s ? s : bumpCard(next, a.cardId, 0, -1);
      return base.selected === a.cardId ? { ...base, itemError: `item error: ${a.message}` } : base;
    }
    default:
      return s;
  }
}

/* ---------- effects that load, kept in components so each attempt remounts them ---------- */

function ColumnLoader({ col, dispatch }: { col: Column; dispatch: Dispatch<Action> }) {
  useEffect(() => {
    let live = true;
    fetchCards(col).then(
      cards => {
        if (live) dispatch({ type: "colLoaded", col, cards });
      },
      e => {
        if (live) dispatch({ type: "colFailed", col, message: errorMessage(e) });
      },
    );
    return () => {
      live = false;
    };
  }, [col, dispatch]);
  return null;
}

function ChecklistLoader({ cardId, dispatch }: { cardId: number; dispatch: Dispatch<Action> }) {
  useEffect(() => {
    let live = true;
    fetchChecklist(cardId).then(
      items => {
        if (live) dispatch({ type: "checklistLoaded", cardId, items });
      },
      e => {
        if (live) dispatch({ type: "checklistFailed", cardId, message: errorMessage(e) });
      },
    );
    return () => {
      live = false;
    };
  }, [cardId, dispatch]);
  return null;
}

let localSeq = 0;

/* ---------- the detail panel for the selected card ---------- */

type DetailProps = {
  id: number;
  col: Column;
  card: Card;
  checklist: Checklist | null;
  renameError: string | null;
  itemError: string | null;
  dispatch: Dispatch<Action>;
  onRename: (title: string) => void;
  onArchive: () => void;
  onToggle: (item: Item) => void;
  onAddItem: (text: string) => void;
};

function SelectedDetail(p: DetailProps) {
  const [titleInput, setTitleInput] = useState("");
  const [itemInput, setItemInput] = useState("");
  const cl = p.checklist && p.checklist.cardId === p.id ? p.checklist : null;
  const ready = cl !== null && cl.status === "ready";
  const items = cl && cl.status === "ready" ? cl.items : [];
  const doneCount = items.filter(i => i.done).length;

  return (
    <>
      <ChecklistLoader cardId={p.id} dispatch={p.dispatch} />
      <h2 className="detail-title">{`#${p.id} ${p.card.title}`}</h2>
      <p className="muted">{`in ${LABEL[p.col]}`}</p>
      <div className="row">
        <input
          data-testid="title-input"
          aria-label="Card title"
          value={titleInput}
          onChange={e => setTitleInput(e.target.value)}
        />
        <button type="button" data-testid="rename" onClick={() => p.onRename(titleInput)}>
          rename
        </button>
      </div>
      {p.renameError && (
        <p role="alert" className="err" data-testid="rename-error">
          {p.renameError}
        </p>
      )}
      <div className="row">
        <button type="button" data-testid="archive" onClick={p.onArchive}>
          archive
        </button>
      </div>

      <div data-testid="checklist" className="checklist">
        {cl === null || cl.status === "loading" ? (
          <p>loading checklist</p>
        ) : cl.status === "error" ? (
          <p role="alert" className="err">{`checklist error: ${cl.message}`}</p>
        ) : (
          <>
            <ul>
              {items.map(item => (
                <li key={item.key} className="item-row">
                  <span data-testid="item">
                    {`${item.done ? "[x]" : "[ ]"} ${item.text}${item.id === null ? " (adding…)" : ""}`}
                  </span>
                  {item.id !== null && (
                    <button type="button" data-testid="toggle" onClick={() => p.onToggle(item)}>
                      toggle
                    </button>
                  )}
                </li>
              ))}
            </ul>
            <p data-testid="progress">{`${doneCount}/${items.length} done`}</p>
          </>
        )}
      </div>
      <div className="row">
        <input
          data-testid="item-input"
          aria-label="New checklist item"
          value={itemInput}
          onChange={e => setItemInput(e.target.value)}
        />
        <button
          type="button"
          data-testid="add-item"
          disabled={!ready}
          onClick={() => {
            if (!itemInput.trim()) return;
            setItemInput("");
            p.onAddItem(itemInput);
          }}
        >
          add item
        </button>
      </div>
      {p.itemError && (
        <p role="alert" className="err" data-testid="item-error">
          {p.itemError}
        </p>
      )}
    </>
  );
}

/* ---------- the board page ---------- */

function BoardPage() {
  const [s, dispatch] = useReducer(reducer, initialBoard);
  const [newTitle, setNewTitle] = useState("");

  const selId = s.selected;
  const sel = selId === null ? null : findCard(s, c => c.id === selId);

  const onMove = (key: string, dir: Dir) => {
    const plan = planMove(s, key, dir);
    if (!plan) return;
    dispatch({ type: "moveStart", plan });
    moveCard(plan.id, plan.to, plan.toIndex).catch(e =>
      dispatch({ type: "moveRollback", plan, message: errorMessage(e) }),
    );
  };

  const onAdd = () => {
    const title = newTitle.trim();
    if (!title || s.columns.todo.status !== "ready") return;
    const key = `new${++localSeq}`;
    setNewTitle("");
    dispatch({ type: "addStart", key, title });
    addCard("todo", title).then(
      card => dispatch({ type: "addDone", key, id: card.id, title: card.title }),
      e => dispatch({ type: "addFailed", key, message: errorMessage(e) }),
    );
  };

  const onRename = (input: string) => {
    const id = s.selected;
    const title = input.trim();
    if (id === null || !title) return;
    const hit = findCard(s, c => c.id === id);
    if (!hit) return;
    const prev = hit.card.title;
    dispatch({ type: "renameStart", id, title });
    renameCard(id, title).catch(e =>
      dispatch({ type: "renameFailed", id, prev, attempted: title, message: errorMessage(e) }),
    );
  };

  const onArchive = () => {
    const id = s.selected;
    if (id === null) return;
    const hit = findCard(s, c => c.id === id);
    if (!hit) return;
    dispatch({ type: "archiveStart", id });
    archiveCard(id).catch(e =>
      dispatch({ type: "archiveFailed", card: hit.card, col: hit.col, index: hit.index, message: errorMessage(e) }),
    );
  };

  const onToggle = (item: Item) => {
    const cardId = s.selected;
    const itemId = item.id;
    if (cardId === null || itemId === null) return;
    const done = !item.done;
    dispatch({ type: "toggleStart", cardId, itemId, done });
    toggleItem(cardId, itemId, done).catch(e =>
      dispatch({ type: "toggleFailed", cardId, itemId, done, message: errorMessage(e) }),
    );
  };

  const onAddItem = (text: string) => {
    const cardId = s.selected;
    const t = text.trim();
    const cl = s.checklist;
    if (cardId === null || !t || !cl || cl.cardId !== cardId || cl.status !== "ready") return;
    const key = `item${++localSeq}`;
    dispatch({ type: "itemAddStart", cardId, key, text: t });
    addItem(cardId, t).then(
      item => dispatch({ type: "itemAddDone", cardId, key, id: item.id }),
      e => dispatch({ type: "itemAddFailed", cardId, key, message: errorMessage(e) }),
    );
  };

  const renderCard = (col: Column, card: Card, index: number) => {
    if (card.id === null) {
      return (
        <div data-testid="card" className="card pending">
          {`${card.title} (adding…)`}
        </div>
      );
    }
    const id = card.id;
    return (
      <>
        <button
          type="button"
          data-testid="card"
          className="card"
          aria-pressed={s.selected === id}
          onClick={() => dispatch({ type: "select", id })}
        >
          {`#${id} ${card.title} · ${card.done}/${card.total}`}
        </button>
        <span className="moves">
          {DIRS.map(dir => {
            const opt = moveOption(s, col, index, dir);
            if (!opt) return null;
            return (
              <button
                key={dir}
                type="button"
                data-testid={dir}
                disabled={!opt.enabled}
                onClick={() => onMove(card.key, dir)}
              >
                {dir}
              </button>
            );
          })}
        </span>
      </>
    );
  };

  const renderColumn = (col: Column) => {
    const st = s.columns[col];
    const heading = st.status === "ready" ? `${LABEL[col]} (${st.cards.length})` : LABEL[col];
    return (
      <section key={col} className="col" data-testid={`col-${col}`} aria-label={LABEL[col]}>
        <h2 data-testid={`head-${col}`}>{heading}</h2>
        {st.status === "loading" && <p data-testid="loading">loading</p>}
        {st.status === "error" && (
          <div>
            <p role="alert" className="err">{`error: ${st.message}`}</p>
            <button type="button" data-testid={`retry-${col}`} onClick={() => dispatch({ type: "retry", col })}>
              retry
            </button>
          </div>
        )}
        {st.status === "ready" && (
          <ul>
            {st.cards.map((card, index) => (
              <li key={card.key} className="card-row">
                {renderCard(col, card, index)}
              </li>
            ))}
          </ul>
        )}
        {col === "todo" && (
          <>
            <div className="row">
              <input
                data-testid="new-card"
                aria-label="New card title"
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Enter") onAdd();
                }}
              />
              <button
                type="button"
                data-testid="add-card"
                disabled={s.columns.todo.status !== "ready"}
                onClick={onAdd}
              >
                add
              </button>
            </div>
            {s.addError && (
              <p role="alert" className="err" data-testid="add-error">
                {s.addError}
              </p>
            )}
          </>
        )}
      </section>
    );
  };

  return (
    <div className="board">
      {s.moveError && (
        <p role="alert" className="err" data-testid="move-error">
          {s.moveError}
        </p>
      )}
      {s.archiveError && (
        <p role="alert" className="err" data-testid="archive-error">
          {s.archiveError}
        </p>
      )}
      <div className="layout">
        <div className="columns">
          {COLUMNS.map(col => (
            <ColumnLoader key={`${col}:${s.attempts[col]}`} col={col} dispatch={dispatch} />
          ))}
          {COLUMNS.map(col => renderColumn(col))}
        </div>
        <aside className="detail" data-testid="detail" aria-label="Card detail">
          {sel && selId !== null ? (
            <SelectedDetail
              key={selId}
              id={selId}
              col={sel.col}
              card={sel.card}
              checklist={s.checklist}
              renameError={s.renameError}
              itemError={s.itemError}
              dispatch={dispatch}
              onRename={onRename}
              onArchive={onArchive}
              onToggle={onToggle}
              onAddItem={onAddItem}
            />
          ) : (
            <p>select a card</p>
          )}
        </aside>
      </div>
    </div>
  );
}

/* ---------- the archive page ---------- */

type ListState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; items: Archived[] };
type ArchState = { list: ListState; restoreError: string | null };
type ArchAction =
  | { type: "loaded"; items: Archived[] }
  | { type: "failed"; message: string }
  | { type: "restoreStart"; id: number }
  | { type: "restoreFailed"; item: Archived; index: number; message: string };

function archReducer(s: ArchState, a: ArchAction): ArchState {
  switch (a.type) {
    case "loaded":
      return { ...s, list: { status: "ready", items: a.items } };
    case "failed":
      return { ...s, list: { status: "error", message: a.message } };
    case "restoreStart": {
      if (s.list.status !== "ready") return s;
      const items = s.list.items.filter(i => i.id !== a.id);
      return { list: { status: "ready", items }, restoreError: null };
    }
    case "restoreFailed": {
      if (s.list.status !== "ready") return { ...s, restoreError: `restore error: ${a.message}` };
      const items = insertAt(s.list.items, a.index, a.item);
      return { list: { status: "ready", items }, restoreError: `restore error: ${a.message}` };
    }
    default:
      return s;
  }
}

function ArchivePage() {
  const [s, dispatch] = useReducer(archReducer, { list: { status: "loading" }, restoreError: null });

  useEffect(() => {
    let live = true;
    fetchArchived().then(
      items => {
        if (live) dispatch({ type: "loaded", items });
      },
      e => {
        if (live) dispatch({ type: "failed", message: errorMessage(e) });
      },
    );
    return () => {
      live = false;
    };
  }, []);

  const restore = (item: Archived, index: number) => {
    dispatch({ type: "restoreStart", id: item.id });
    restoreCard(item.id).catch(e =>
      dispatch({ type: "restoreFailed", item, index, message: errorMessage(e) }),
    );
  };

  return (
    <section className="archive">
      <h2>Archive</h2>
      <div data-testid="archived">
        {s.list.status === "loading" && <p>loading archive</p>}
        {s.list.status === "error" && <p role="alert" className="err">{`archive error: ${s.list.message}`}</p>}
        {s.list.status === "ready" && s.list.items.length === 0 && <p className="muted">No archived cards.</p>}
        {s.list.status === "ready" && (
          <ul>
            {s.list.items.map((item, index) => (
              <li key={item.id} className="archived-row">
                <span data-testid="archived-card">{`#${item.id} ${item.title}`}</span>
                <button type="button" data-testid="restore" onClick={() => restore(item, index)}>
                  restore
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {s.restoreError && (
        <p role="alert" className="err" data-testid="restore-error">
          {s.restoreError}
        </p>
      )}
    </section>
  );
}

/* ---------- the app ---------- */

const CSS = `
:root { color-scheme: light dark; --bg:#f6f7f9; --fg:#1d2330; --muted:#5b6474; --card:#ffffff; --line:#d9dde5; --accent:#2f6fed; --err:#b42318; }
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) { --bg:#14171c; --fg:#e8ebf0; --muted:#9aa3b2; --card:#1d222a; --line:#303745; --accent:#6ea0ff; --err:#ff8a80; }
}
:root[data-theme="dark"] { --bg:#14171c; --fg:#e8ebf0; --muted:#9aa3b2; --card:#1d222a; --line:#303745; --accent:#6ea0ff; --err:#ff8a80; }
*, *::before, *::after { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--fg); font: 15px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif; }
.app { max-width: 1120px; margin: 0 auto; padding: 16px; overflow-wrap: anywhere; }
h1 { font-size: 1.4rem; margin: 0 0 12px; }
h2 { font-size: 1.05rem; margin: 0 0 8px; }
p { margin: 6px 0; }
ul { list-style: none; padding: 0; margin: 0; }
.muted { color: var(--muted); }
.err { color: var(--err); }
.tabs { display: flex; gap: 8px; margin-bottom: 16px; flex-wrap: wrap; }
button { font: inherit; min-height: 36px; padding: 6px 12px; border: 1px solid var(--line); border-radius: 6px; background: var(--card); color: var(--fg); cursor: pointer; }
button[aria-current="page"] { border-color: var(--accent); color: var(--accent); font-weight: 600; }
button:disabled { opacity: .45; cursor: not-allowed; }
input { font: inherit; min-width: 0; flex: 1 1 160px; padding: 8px 10px; border: 1px solid var(--line); border-radius: 6px; background: var(--card); color: var(--fg); }
button:focus-visible, input:focus-visible, .card:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.layout { display: grid; gap: 16px; grid-template-columns: minmax(0, 1fr); }
.columns { display: grid; gap: 12px; grid-template-columns: minmax(0, 1fr); }
@media (min-width: 640px) { .columns { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
@media (min-width: 960px) { .layout { grid-template-columns: minmax(0, 1fr) 320px; align-items: start; } }
.col { background: var(--card); border: 1px solid var(--line); border-radius: 10px; padding: 12px; min-width: 0; }
.card-row { margin-bottom: 8px; }
.card { display: block; width: 100%; text-align: left; overflow-wrap: anywhere; }
.card[aria-pressed="true"] { border-color: var(--accent); }
.card.pending { padding: 8px 12px; border: 1px dashed var(--line); border-radius: 6px; color: var(--muted); }
.moves { display: flex; gap: 4px; flex-wrap: wrap; margin-top: 4px; }
.moves button { min-height: 32px; padding: 2px 8px; font-size: .9rem; }
.row { display: flex; gap: 6px; flex-wrap: wrap; margin: 8px 0; align-items: center; }
.detail { background: var(--card); border: 1px solid var(--line); border-radius: 10px; padding: 12px; min-width: 0; }
.detail-title { overflow-wrap: anywhere; }
.checklist { margin-top: 8px; }
.item-row { display: flex; gap: 8px; align-items: center; justify-content: space-between; padding: 4px 0; overflow-wrap: anywhere; }
.archive { background: var(--card); border: 1px solid var(--line); border-radius: 10px; padding: 12px; max-width: 640px; }
.archived-row { display: flex; gap: 8px; align-items: center; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid var(--line); }
.archived-row span { overflow-wrap: anywhere; min-width: 0; }
`;

export default function App() {
  const [tab, setTab] = useState<"board" | "archive">("board");
  return (
    <div className="app">
      <style>{CSS}</style>
      <h1>Sprint board</h1>
      <nav className="tabs" aria-label="Pages">
        <button
          type="button"
          data-testid="tab-board"
          aria-current={tab === "board" ? "page" : undefined}
          onClick={() => setTab("board")}
        >
          Board
        </button>
        <button
          type="button"
          data-testid="tab-archive"
          aria-current={tab === "archive" ? "page" : undefined}
          onClick={() => setTab("archive")}
        >
          Archive
        </button>
      </nav>
      <main>{tab === "board" ? <BoardPage /> : <ArchivePage />}</main>
    </div>
  );
}
