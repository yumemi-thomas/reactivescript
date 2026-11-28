import { useEffect, useReducer, useRef, useState, type FormEvent } from "react";
import * as api from "./api";
import type { Column } from "./api";
import { COLUMNS, COLUMN_NAMES, WIP_LIMIT, findCard, view, type CardRow, type Data, type Op } from "./board";
import { errorMessage, initialBoard, reducer, type Action } from "./boardState";

let nextId = 1;
const newId = () => nextId++;

type Dir = "left" | "right" | "up" | "down";

export default function BoardPage() {
  const [state, dispatch] = useReducer(reducer, undefined, initialBoard);
  const [newTitle, setNewTitle] = useState("");
  // Latest request per column / per card's checklist, so a late answer to a superseded request is ignored.
  const colRequests = useRef<Record<Column, number>>({ todo: 0, doing: 0, done: 0 });
  const clRequests = useRef(new Map<number, number>());
  const started = useRef(false);

  function loadColumn(column: Column, initial = false) {
    const req = ++colRequests.current[column];
    if (!initial) dispatch({ type: "colLoading", column });
    api.fetchCards(column).then(
      cards => { if (colRequests.current[column] === req) dispatch({ type: "colLoaded", column, cards }); },
      (e: unknown) => { if (colRequests.current[column] === req) dispatch({ type: "colFailed", column, error: errorMessage(e) }); },
    );
  }

  function loadChecklist(cardId: number) {
    const req = (clRequests.current.get(cardId) ?? 0) + 1;
    clRequests.current.set(cardId, req);
    dispatch({ type: "clLoading", cardId });
    api.fetchChecklist(cardId).then(
      items => { if (clRequests.current.get(cardId) === req) dispatch({ type: "clLoaded", cardId, items }); },
      (e: unknown) => { if (clRequests.current.get(cardId) === req) dispatch({ type: "clFailed", cardId, error: errorMessage(e) }); },
    );
  }

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    for (const column of COLUMNS) loadColumn(column, true);
  });

  function run<T>(op: Op, call: () => Promise<T>, fold: (result: T) => Extract<Action, { type: "succeed" }>) {
    dispatch({ type: "start", op });
    call().then(
      result => dispatch(fold(result)),
      (e: unknown) => dispatch({ type: "fail", opId: op.opId, error: errorMessage(e) }),
    );
  }

  const shown: Data = view(state.base, state.ops);
  const doingCol = shown.columns.doing;
  const doingFull = doingCol.status === "ok" && doingCol.cards.length >= WIP_LIMIT;

  function moveTarget(column: Column, index: number, dir: Dir): { to: Column; index: number } | null {
    const col = shown.columns[column];
    if (col.status !== "ok") return null;
    const ci = COLUMNS.indexOf(column);
    if (dir === "up") return index > 0 ? { to: column, index: index - 1 } : null;
    if (dir === "down") {
      const below = col.cards[index + 1];
      return below && !below.temp ? { to: column, index: index + 1 } : null;
    }
    const to = COLUMNS[ci + (dir === "left" ? -1 : 1)];
    if (!to) return null;
    const target = shown.columns[to];
    const realCount = target.status === "ok" ? target.cards.filter(c => !c.temp).length : 0;
    return { to, index: realCount };
  }

  function moveBlocked(column: Column, to: Column): boolean {
    if (shown.columns[to].status !== "ok") return true;
    return to === "doing" && column !== "doing" && doingFull;
  }

  function move(card: CardRow, column: Column, index: number, dir: Dir) {
    const target = moveTarget(column, index, dir);
    if (!target || moveBlocked(column, target.to)) return;
    const op: Op = { kind: "move", opId: newId(), cardId: card.id, to: target.to, index: target.index };
    run(op, () => api.moveCard(card.id, target.to, target.index), () => ({ type: "succeed", opId: op.opId, fold: op }));
  }

  function addCard(e: FormEvent) {
    e.preventDefault();
    const title = newTitle.trim();
    if (!title || shown.columns.todo.status !== "ok") return;
    setNewTitle("");
    const opId = newId();
    const op: Op = { kind: "addCard", opId, tempId: -opId, title };
    run(op, () => api.addCard("todo", title), r => ({
      type: "succeed", opId, fold: { kind: "addCardDone", card: { id: r.id, title: r.title, done: 0, total: 0 } },
    }));
  }

  function select(card: CardRow) {
    if (card.temp || state.selected === card.id) return;
    dispatch({ type: "select", cardId: card.id });
    loadChecklist(card.id);
  }

  const selected = state.selected === null ? null : findCard(shown, state.selected);

  return (
    <div className="board-page">
      <div className="columns">
        {COLUMNS.map(column => {
          const col = shown.columns[column];
          return (
            <section key={column} className="column" data-testid={`col-${column}`}>
              <h2 data-testid={`head-${column}`}>
                {col.status === "ok" ? `${COLUMN_NAMES[column]} (${col.cards.length})` : COLUMN_NAMES[column]}
              </h2>
              {col.status === "loading" && <p className="muted" role="status">loading</p>}
              {col.status === "error" && (
                <p className="error" role="alert">
                  <span>error: {col.error}</span>{" "}
                  <button type="button" data-testid={`retry-${column}`} onClick={() => loadColumn(column)}>retry</button>
                </p>
              )}
              {col.status === "ok" && (
                <ul className="cards">
                  {col.cards.map((card, index) => (
                    <li key={card.temp ? `t${card.id}` : card.id} className={card.id === state.selected && !card.temp ? "row selected" : "row"}>
                      {card.temp ? (
                        <span className="card pending" data-testid="card">{card.title} (adding…)</span>
                      ) : (
                        <>
                          <button type="button" className="card" data-testid="card" aria-pressed={card.id === state.selected} onClick={() => select(card)}>
                            #{card.id} {card.title} · {card.done}/{card.total}
                          </button>
                          <span className="moves">
                            {(["left", "right", "up", "down"] as const).map(dir => {
                              const target = moveTarget(column, index, dir);
                              if (!target) return null;
                              return (
                                <button
                                  key={dir}
                                  type="button"
                                  data-testid={dir}
                                  disabled={moveBlocked(column, target.to)}
                                  onClick={() => move(card, column, index, dir)}
                                >
                                  {dir}
                                </button>
                              );
                            })}
                          </span>
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {column === "todo" && (
                <form className="add" onSubmit={addCard}>
                  <input
                    data-testid="new-card"
                    aria-label="New card title"
                    placeholder="New card"
                    value={newTitle}
                    onChange={e => setNewTitle(e.target.value)}
                  />
                  <button type="submit" data-testid="add-card" disabled={col.status !== "ok"}>add</button>
                  {state.addError !== null && <p className="error" role="alert" data-testid="add-error">add error: {state.addError}</p>}
                </form>
              )}
            </section>
          );
        })}
      </div>
      {state.moveError !== null && <p className="error" role="alert" data-testid="move-error">move error: {state.moveError}</p>}
      {state.archiveError !== null && <p className="error" role="alert" data-testid="archive-error">archive error: {state.archiveError}</p>}
      <Detail
        key={selected ? selected.card.id : "none"}
        selected={selected}
        shown={shown}
        renameError={state.renameError && selected && state.renameError.cardId === selected.card.id ? state.renameError.message : null}
        itemError={state.itemError && selected && state.itemError.cardId === selected.card.id ? state.itemError.message : null}
        onRetryChecklist={loadChecklist}
        onRename={(cardId, title) => {
          const op: Op = { kind: "rename", opId: newId(), cardId, title };
          run(op, () => api.renameCard(cardId, title), r => ({ type: "succeed", opId: op.opId, fold: { ...op, title: r.title } }));
        }}
        onArchive={cardId => {
          const op: Op = { kind: "archive", opId: newId(), cardId };
          run(op, () => api.archiveCard(cardId), () => ({ type: "succeed", opId: op.opId, fold: op }));
        }}
        onToggle={(cardId, itemId, done) => {
          const op: Op = { kind: "toggle", opId: newId(), cardId, itemId, done };
          run(op, () => api.toggleItem(cardId, itemId, done), () => ({ type: "succeed", opId: op.opId, fold: op }));
        }}
        onAddItem={(cardId, text) => {
          const opId = newId();
          const op: Op = { kind: "addItem", opId, cardId, tempId: -opId, text };
          run(op, () => api.addItem(cardId, text), item => ({ type: "succeed", opId, fold: { kind: "addItemDone", cardId, item } }));
        }}
      />
    </div>
  );
}

type DetailProps = {
  selected: ReturnType<typeof findCard>;
  shown: Data;
  renameError: string | null;
  itemError: string | null;
  onRetryChecklist: (cardId: number) => void;
  onRename: (cardId: number, title: string) => void;
  onArchive: (cardId: number) => void;
  onToggle: (cardId: number, itemId: number, done: boolean) => void;
  onAddItem: (cardId: number, text: string) => void;
};

function Detail({ selected, shown, renameError, itemError, onRetryChecklist, onRename, onArchive, onToggle, onAddItem }: DetailProps) {
  const [title, setTitle] = useState("");
  const [itemText, setItemText] = useState("");

  if (!selected) {
    return (
      <aside className="detail" data-testid="detail">
        <p className="muted">select a card</p>
      </aside>
    );
  }

  const { card, column } = selected;
  const checklist = shown.checklists[card.id];
  const items = checklist?.status === "ok" ? checklist.items ?? [] : null;

  function rename(e: FormEvent) {
    e.preventDefault();
    const t = title.trim();
    if (!t) return;
    onRename(card.id, t);
  }

  function addItem(e: FormEvent) {
    e.preventDefault();
    const t = itemText.trim();
    if (!t || !items) return;
    setItemText("");
    onAddItem(card.id, t);
  }

  return (
    <aside className="detail" data-testid="detail">
      <h2>#{card.id} {card.title}</h2>
      <p className="muted">in {COLUMN_NAMES[column]}</p>
      <form className="inline" onSubmit={rename}>
        <input data-testid="title-input" aria-label="New title" placeholder="New title" value={title} onChange={e => setTitle(e.target.value)} />
        <button type="submit" data-testid="rename">rename</button>
      </form>
      {renameError !== null && <p className="error" role="alert">rename error: {renameError}</p>}
      <button type="button" data-testid="archive" onClick={() => onArchive(card.id)}>archive</button>

      <h3>Checklist</h3>
      <div data-testid="checklist">
        {(!checklist || checklist.status === "loading") && <p className="muted" role="status">loading checklist</p>}
        {checklist?.status === "error" && (
          <p className="error" role="alert">
            <span>checklist error: {checklist.error}</span>{" "}
            <button type="button" data-testid="retry-checklist" onClick={() => onRetryChecklist(card.id)}>retry</button>
          </p>
        )}
        {items && (
          <>
            <ul className="items">
              {items.map(item => (
                <li key={item.temp ? `t${item.id}` : item.id} className="row">
                  <span data-testid="item">
                    {item.done ? "[x]" : "[ ]"} {item.text}{item.temp ? " (adding…)" : ""}
                  </span>
                  {!item.temp && (
                    <button type="button" data-testid="toggle" onClick={() => onToggle(card.id, item.id, !item.done)}>
                      toggle
                    </button>
                  )}
                </li>
              ))}
            </ul>
            <p data-testid="progress">{items.filter(i => i.done).length}/{items.length} done</p>
          </>
        )}
      </div>
      <form className="inline" onSubmit={addItem}>
        <input data-testid="item-input" aria-label="New item" placeholder="New item" value={itemText} onChange={e => setItemText(e.target.value)} />
        <button type="submit" data-testid="add-item" disabled={!items}>add item</button>
      </form>
      {itemError !== null && <p className="error" role="alert">item error: {itemError}</p>}
    </aside>
  );
}
