import { useEffect, useReducer, useRef, useState } from "react";
import type { Column } from "./api";
import * as api from "./api";
import {
  COLUMNS,
  COLUMN_NAMES,
  WIP_LIMIT,
  boardReducer,
  errorMessage,
  initialBoard,
  shownChecklist,
  shownColumns,
  type BoardAction,
  type Op,
  type ShownCard,
} from "./board";

type Dispatch = (a: BoardAction) => void;

function loadColumn(dispatch: Dispatch, col: Column, req: number, live: () => boolean = () => true) {
  api.fetchCards(col).then(
    cards => { if (live()) dispatch({ type: "colLoaded", col, req, cards }); },
    err => { if (live()) dispatch({ type: "colFailed", col, req, message: errorMessage(err) }); },
  );
}

function loadChecklist(dispatch: Dispatch, id: number, req: number) {
  api.fetchChecklist(id).then(
    items => dispatch({ type: "checklistLoaded", req, items }),
    err => dispatch({ type: "checklistFailed", req, message: errorMessage(err) }),
  );
}

export default function Board() {
  const [state, dispatch] = useReducer(boardReducer, undefined, initialBoard);
  const counter = useRef(0);
  const next = () => ++counter.current;

  useEffect(() => {
    let live = true;
    for (const col of COLUMNS) loadColumn(dispatch, col, 0, () => live);
    return () => { live = false; };
  }, []);

  const run = (op: Op, call: () => Promise<unknown>) => {
    dispatch({ type: "start", op });
    let promise: Promise<unknown>;
    try {
      promise = call();
    } catch (err) {
      promise = Promise.reject(err);
    }
    promise.then(
      result => dispatch({ type: "accepted", op, result }),
      err => dispatch({ type: "declined", op, message: errorMessage(err) }),
    );
  };

  const cols = shownColumns(state);
  const items = shownChecklist(state);
  const doingFull = cols.doing.length >= WIP_LIMIT;

  const retry = (col: Column) => {
    const req = next();
    dispatch({ type: "colLoading", col, req });
    loadColumn(dispatch, col, req);
  };

  const select = (id: number) => {
    if (state.selected === id) return;
    const req = next();
    dispatch({ type: "select", id, req });
    loadChecklist(dispatch, id, req);
  };

  const retryChecklist = () => {
    if (state.selected === null) return;
    const req = next();
    dispatch({ type: "checklistLoading", req });
    loadChecklist(dispatch, state.selected, req);
  };

  const move = (id: number, column: Column, index: number) => {
    run({ kind: "move", op: next(), id, column, index }, () => api.moveCard(id, column, index));
  };

  const addCard = (title: string) => {
    run({ kind: "add", op: next(), title }, () => api.addCard("todo", title));
  };

  const rename = (id: number, title: string) => {
    run({ kind: "rename", op: next(), id, title }, () => api.renameCard(id, title));
  };

  const archive = (id: number) => {
    run({ kind: "archive", op: next(), id }, () => api.archiveCard(id));
  };

  const toggle = (cardId: number, itemId: number, done: boolean) => {
    run({ kind: "toggle", op: next(), cardId, itemId, done }, () => api.toggleItem(cardId, itemId, done));
  };

  const addItem = (cardId: number, text: string) => {
    run({ kind: "addItem", op: next(), cardId, text }, () => api.addItem(cardId, text));
  };

  let selectedCard: ShownCard | null = null;
  let selectedCol: Column | null = null;
  if (state.selected !== null) {
    for (const col of COLUMNS) {
      const c = cols[col].find(c => c.id === state.selected);
      if (c) { selectedCard = c; selectedCol = col; }
    }
  }

  return (
    <div className="board-page">
      <div className="alerts" aria-live="polite">
        {state.moveError !== null && <p className="error" data-testid="move-error" role="alert">move error: {state.moveError}</p>}
        {state.archiveError !== null && <p className="error" data-testid="archive-error" role="alert">archive error: {state.archiveError}</p>}
      </div>
      <div className="board">
        <div className="columns">
          {COLUMNS.map((col, ci) => {
            const cs = state.cols[col];
            const cards = cols[col];
            return (
              <section key={col} className="column" data-testid={`col-${col}`} aria-labelledby={`head-${col}`}>
                <h2 id={`head-${col}`} data-testid={`head-${col}`}>
                  {cs.status === "ok" ? `${COLUMN_NAMES[col]} (${cards.length})` : COLUMN_NAMES[col]}
                </h2>
                {cs.status === "loading" && <p className="muted">loading</p>}
                {cs.status === "error" && (
                  <div className="error" role="alert">
                    <span>error: {cs.error}</span>{" "}
                    <button type="button" data-testid={`retry-${col}`} onClick={() => retry(col)}>retry</button>
                  </div>
                )}
                {cs.status === "ok" && (
                  <ul className="cards">
                    {cards.map((c, i) => (
                      <CardRow
                        key={c.key}
                        card={c}
                        selected={c.id !== null && c.id === state.selected}
                        onSelect={select}
                        left={ci > 0 ? targetFor(state.cols, COLUMNS[ci - 1], doingFull) : null}
                        right={ci < COLUMNS.length - 1 ? targetFor(state.cols, COLUMNS[ci + 1], doingFull) : null}
                        canUp={i > 0}
                        canDown={i < cards.length - 1 && cards[i + 1].id !== null}
                        onMove={(dir) => {
                          if (c.id === null) return;
                          if (dir === "up") move(c.id, col, i - 1);
                          else if (dir === "down") move(c.id, col, i + 1);
                          else {
                            const to = COLUMNS[ci + (dir === "left" ? -1 : 1)];
                            move(c.id, to, cols[to].filter(x => x.id !== null).length);
                          }
                        }}
                      />
                    ))}
                  </ul>
                )}
                {col === "todo" && (
                  <NewCard
                    disabled={cs.status !== "ok"}
                    error={state.addError}
                    onAdd={addCard}
                  />
                )}
              </section>
            );
          })}
        </div>
        <aside className="detail" data-testid="detail" aria-label="Card detail">
          {state.selected === null || !selectedCard || selectedCol === null ? (
            <p className="muted">select a card</p>
          ) : (
            <Detail
              key={state.selected}
              id={state.selected}
              title={selectedCard.title}
              column={selectedCol}
              renameError={state.renameError}
              itemError={state.itemError}
              checklist={state.checklist}
              items={items}
              onRename={title => rename(state.selected as number, title)}
              onArchive={() => archive(state.selected as number)}
              onToggle={(itemId, done) => toggle(state.selected as number, itemId, done)}
              onAddItem={text => addItem(state.selected as number, text)}
              onRetryChecklist={retryChecklist}
            />
          )}
        </aside>
      </div>
    </div>
  );
}

type Target = { show: boolean; disabled: boolean };

function targetFor(base: Record<Column, { status: string }>, to: Column, doingFull: boolean): Target {
  const disabled = base[to].status !== "ok" || (to === "doing" && doingFull);
  return { show: true, disabled };
}

type Dir = "left" | "right" | "up" | "down";

function CardRow(props: {
  card: ShownCard;
  selected: boolean;
  onSelect: (id: number) => void;
  left: Target | null;
  right: Target | null;
  canUp: boolean;
  canDown: boolean;
  onMove: (dir: Dir) => void;
}) {
  const { card, selected, onSelect, left, right, canUp, canDown, onMove } = props;
  if (card.id === null) {
    return (
      <li className="card-row pending">
        <span className="card" data-testid="card" aria-busy="true">{card.title} (adding…)</span>
      </li>
    );
  }
  const id = card.id;
  const text = `#${id} ${card.title} · ${card.done}/${card.total}`;
  return (
    <li className={`card-row${selected ? " selected" : ""}`}>
      <button type="button" className="card" data-testid="card" aria-pressed={selected} onClick={() => onSelect(id)}>
        {text}
      </button>
      <span className="moves">
        {left && (
          <button type="button" data-testid="left" aria-label={`move #${id} left`} disabled={left.disabled} onClick={() => onMove("left")}>left</button>
        )}
        {right && (
          <button type="button" data-testid="right" aria-label={`move #${id} right`} disabled={right.disabled} onClick={() => onMove("right")}>right</button>
        )}
        {canUp && (
          <button type="button" data-testid="up" aria-label={`move #${id} up`} onClick={() => onMove("up")}>up</button>
        )}
        {canDown && (
          <button type="button" data-testid="down" aria-label={`move #${id} down`} onClick={() => onMove("down")}>down</button>
        )}
      </span>
    </li>
  );
}

function NewCard({ disabled, error, onAdd }: { disabled: boolean; error: string | null; onAdd: (title: string) => void }) {
  const [title, setTitle] = useState("");
  const submit = () => {
    const t = title.trim();
    if (!t || disabled) return;
    setTitle("");
    onAdd(t);
  };
  return (
    <form className="new-card" onSubmit={e => { e.preventDefault(); submit(); }}>
      <input
        data-testid="new-card"
        aria-label="New card title"
        placeholder="New card"
        value={title}
        maxLength={500}
        onChange={e => setTitle(e.target.value)}
      />
      <button type="submit" data-testid="add-card">add</button>
      {error !== null && <p className="error" data-testid="add-error" role="alert">add error: {error}</p>}
    </form>
  );
}

function Detail(props: {
  id: number;
  title: string;
  column: Column;
  renameError: string | null;
  itemError: string | null;
  checklist: { cardId: number; status: "loading" | "error" | "ok"; error: string } | null;
  items: { key: string; id: number | null; text: string; done: boolean }[] | null;
  onRename: (title: string) => void;
  onArchive: () => void;
  onToggle: (itemId: number, done: boolean) => void;
  onAddItem: (text: string) => void;
  onRetryChecklist: () => void;
}) {
  const { id, title, column, renameError, itemError, checklist, items, onRename, onArchive, onToggle, onAddItem, onRetryChecklist } = props;
  const [newTitle, setNewTitle] = useState("");
  const [itemText, setItemText] = useState("");

  const doRename = () => {
    const t = newTitle.trim();
    if (!t) return;
    setNewTitle("");
    onRename(t);
  };
  const doAddItem = () => {
    const t = itemText.trim();
    if (!t || !items) return;
    setItemText("");
    onAddItem(t);
  };

  const doneCount = items ? items.filter(i => i.done).length : 0;

  return (
    <div className="detail-body">
      <h2>#{id} {title}</h2>
      <p className="muted">in {COLUMN_NAMES[column]}</p>
      <form className="row" onSubmit={e => { e.preventDefault(); doRename(); }}>
        <input
          data-testid="title-input"
          aria-label="New title"
          placeholder="New title"
          value={newTitle}
          maxLength={500}
          onChange={e => setNewTitle(e.target.value)}
        />
        <button type="submit" data-testid="rename">rename</button>
      </form>
      {renameError !== null && <p className="error" data-testid="rename-error" role="alert">rename error: {renameError}</p>}
      <p><button type="button" data-testid="archive" onClick={onArchive}>archive</button></p>

      <div className="checklist" data-testid="checklist">
        <h3>Checklist</h3>
        {(!checklist || checklist.status === "loading") && <p className="muted">loading checklist</p>}
        {checklist?.status === "error" && (
          <div className="error" role="alert">
            <span>checklist error: {checklist.error}</span>{" "}
            <button type="button" data-testid="retry-checklist" onClick={onRetryChecklist}>retry</button>
          </div>
        )}
        {items && (
          <>
            <ul className="items">
              {items.map(it => (
                <li key={it.key}>
                  <span data-testid="item">{it.done ? "[x]" : "[ ]"} {it.text}{it.id === null ? " (adding…)" : ""}</span>
                  {it.id !== null && (
                    <button
                      type="button"
                      data-testid="toggle"
                      aria-label={`toggle ${it.text}`}
                      onClick={() => onToggle(it.id as number, !it.done)}
                    >toggle</button>
                  )}
                </li>
              ))}
            </ul>
            <p data-testid="progress">{doneCount}/{items.length} done</p>
          </>
        )}
        <form className="row" onSubmit={e => { e.preventDefault(); doAddItem(); }}>
          <input
            data-testid="item-input"
            aria-label="New checklist item"
            placeholder="New item"
            value={itemText}
            maxLength={500}
            onChange={e => setItemText(e.target.value)}
          />
          <button type="submit" data-testid="add-item">add item</button>
        </form>
      </div>
      {itemError !== null && <p className="error" data-testid="item-error" role="alert">item error: {itemError}</p>}
    </div>
  );
}
