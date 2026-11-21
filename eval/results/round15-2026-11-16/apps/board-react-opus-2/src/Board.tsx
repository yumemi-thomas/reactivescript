import { useEffect, useReducer, useState, type FormEvent } from "react";
import * as api from "./api.js";
import type { Column } from "./api.js";
import {
  COLUMN_NAMES,
  COLUMNS,
  WIP_LIMIT,
  boardReducer,
  initialBoard,
  viewBoard,
  viewItems,
  type BoardAction,
  type BoardState,
  type ViewCard,
} from "./model";

let counter = 1;
const nextId = () => counter++;
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

type Dispatch = (a: BoardAction) => void;

function loadColumn(dispatch: Dispatch, column: Column, token: number, isCancelled: () => boolean = () => false) {
  api.fetchCards(column).then(
    cards => { if (!isCancelled()) dispatch({ type: "colOk", column, token, cards }); },
    e => { if (!isCancelled()) dispatch({ type: "colFail", column, token, error: message(e) }); },
  );
}

function loadChecklist(dispatch: Dispatch, cardId: number, token: number) {
  api.fetchChecklist(cardId).then(
    items => dispatch({ type: "listOk", cardId, token, items }),
    e => dispatch({ type: "listFail", cardId, token, error: message(e) }),
  );
}

export default function Board() {
  const [state, dispatch] = useReducer(boardReducer, undefined, initialBoard);

  useEffect(() => {
    let cancelled = false;
    for (const c of COLUMNS) loadColumn(dispatch, c, 0, () => cancelled);
    return () => { cancelled = true; };
  }, []);

  const view = viewBoard(state);

  const retry = (column: Column) => {
    const token = nextId();
    dispatch({ type: "colStart", column, token });
    loadColumn(dispatch, column, token);
  };

  const move = (card: ViewCard, column: Column, index: number) => {
    if (card.id === null) return;
    const opId = nextId();
    const id = card.id;
    dispatch({ type: "opStart", op: { kind: "move", opId, id, column, index, ok: false } });
    api.moveCard(id, column, index).then(
      () => dispatch({ type: "opOk", opId }),
      e => dispatch({ type: "opFail", opId, error: message(e) }),
    );
  };

  const add = (title: string) => {
    const opId = nextId();
    dispatch({ type: "opStart", op: { kind: "add", opId, title, ok: false } });
    api.addCard("todo", title).then(
      r => dispatch({ type: "opOk", opId, result: { id: r.id, title: r.title } }),
      e => dispatch({ type: "opFail", opId, error: message(e) }),
    );
  };

  const select = (id: number) => {
    if (state.selected === id) return;
    const token = nextId();
    dispatch({ type: "select", id, token });
    loadChecklist(dispatch, id, token);
  };

  const doingCount = view.doing.length;
  const loaded = (c: Column) => state.cols[c].status === "success";

  let selectedCard: { card: ViewCard; column: Column } | null = null;
  if (state.selected !== null) {
    for (const c of COLUMNS) {
      const found = view[c].find(x => x.id === state.selected);
      if (found) selectedCard = { card: found, column: c };
    }
  }

  return (
    <div className="board-page">
      <div className="errors" aria-live="polite">
        {state.moveError !== null && <p className="error" data-testid="move-error">move error: {state.moveError}</p>}
        {state.archiveError !== null && <p className="error" data-testid="archive-error">archive error: {state.archiveError}</p>}
      </div>
      <div className="board">
        <div className="columns">
          {COLUMNS.map((c, ci) => {
            const col = state.cols[c];
            const cards = view[c];
            const left = ci > 0 ? COLUMNS[ci - 1] : null;
            const right = ci < COLUMNS.length - 1 ? COLUMNS[ci + 1] : null;
            const blocked = (target: Column) =>
              !loaded(target) || (target === "doing" && c !== "doing" && doingCount >= WIP_LIMIT);
            return (
              <section key={c} className="column" data-testid={`col-${c}`} aria-labelledby={`head-${c}`}>
                <h2 id={`head-${c}`} data-testid={`head-${c}`}>
                  {col.status === "success" ? `${COLUMN_NAMES[c]} (${cards.length})` : COLUMN_NAMES[c]}
                </h2>
                {col.status === "loading" && <p className="muted">loading</p>}
                {col.status === "error" && (
                  <div className="error-box">
                    <p className="error">error: {col.error}</p>
                    <button type="button" data-testid={`retry-${c}`} onClick={() => retry(c)}>retry</button>
                  </div>
                )}
                {col.status === "success" && (
                  <ul className="cards">
                    {cards.map((card, i) => (
                      <li key={card.key} className={"card-row" + (card.id !== null && card.id === state.selected ? " selected" : "") + (card.id === null ? " pending" : "")}>
                        {card.id === null ? (
                          <div className="card" data-testid="card">{card.title} (adding…)</div>
                        ) : (
                          <>
                            <div
                              className="card"
                              data-testid="card"
                              tabIndex={0}
                              aria-current={card.id === state.selected ? "true" : undefined}
                              onClick={() => select(card.id!)}
                              onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); select(card.id!); } }}
                            >
                              #{card.id} {card.title} · {card.done}/{card.total}
                            </div>
                            <div className="moves">
                              {left && (
                                <button type="button" data-testid="left" disabled={blocked(left)} onClick={() => move(card, left, view[left].length)}>left</button>
                              )}
                              {right && (
                                <button type="button" data-testid="right" disabled={blocked(right)} onClick={() => move(card, right, view[right].length)}>right</button>
                              )}
                              {i > 0 && (
                                <button type="button" data-testid="up" onClick={() => move(card, c, i - 1)}>up</button>
                              )}
                              {i < cards.length - 1 && (
                                <button type="button" data-testid="down" onClick={() => move(card, c, i + 1)}>down</button>
                              )}
                            </div>
                          </>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                {c === "todo" && <AddCard disabled={!loaded("todo")} error={state.addError} onAdd={add} />}
              </section>
            );
          })}
        </div>
        <Detail
          key={selectedCard ? selectedCard.card.id! : "none"}
          state={state}
          dispatch={dispatch}
          selected={selectedCard}
        />
      </div>
    </div>
  );
}

function AddCard({ disabled, error, onAdd }: { disabled: boolean; error: string | null; onAdd: (title: string) => void }) {
  const [title, setTitle] = useState("");
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const t = title.trim();
    if (!t || disabled) return;
    setTitle("");
    onAdd(t);
  };
  return (
    <form className="add-form" onSubmit={submit}>
      <input data-testid="new-card" aria-label="New card title" placeholder="New card" value={title} onChange={e => setTitle(e.target.value)} />
      <button type="submit" data-testid="add-card" disabled={disabled}>add</button>
      {error !== null && <p className="error" data-testid="add-error">add error: {error}</p>}
    </form>
  );
}

function Detail({ state, dispatch, selected }: { state: BoardState; dispatch: Dispatch; selected: { card: ViewCard; column: Column } | null }) {
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");

  if (!selected) {
    return (
      <aside className="detail" data-testid="detail">
        <p className="muted">select a card</p>
      </aside>
    );
  }
  const { card, column } = selected;
  const id = card.id!;
  const list = state.lists[id];
  const items = viewItems(state, id);
  const renameError = state.renameError?.cardId === id ? state.renameError.message : null;
  const itemError = state.itemError?.cardId === id ? state.itemError.message : null;

  const rename = (e: FormEvent) => {
    e.preventDefault();
    const t = title.trim();
    if (!t) return;
    const opId = nextId();
    dispatch({ type: "opStart", op: { kind: "rename", opId, id, title: t, ok: false } });
    api.renameCard(id, t).then(
      r => dispatch({ type: "opOk", opId, result: { id: r.id, title: r.title } }),
      err => dispatch({ type: "opFail", opId, error: message(err) }),
    );
  };

  const archive = () => {
    const opId = nextId();
    dispatch({ type: "opStart", op: { kind: "archive", opId, id, ok: false } });
    api.archiveCard(id).then(
      () => dispatch({ type: "opOk", opId }),
      err => dispatch({ type: "opFail", opId, error: message(err) }),
    );
  };

  const toggle = (itemId: number, done: boolean) => {
    const opId = nextId();
    dispatch({ type: "itemStart", op: { kind: "toggle", opId, cardId: id, itemId, done, ok: false } });
    api.toggleItem(id, itemId, done).then(
      r => dispatch({ type: "itemOk", opId, result: r }),
      err => dispatch({ type: "itemFail", opId, error: message(err) }),
    );
  };

  const addItem = (e: FormEvent) => {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    setText("");
    const opId = nextId();
    dispatch({ type: "itemStart", op: { kind: "addItem", opId, cardId: id, text: t, ok: false } });
    api.addItem(id, t).then(
      r => dispatch({ type: "itemOk", opId, result: r }),
      err => dispatch({ type: "itemFail", opId, error: message(err) }),
    );
  };

  const retryList = () => {
    const token = nextId();
    dispatch({ type: "listStart", cardId: id, token });
    loadChecklist(dispatch, id, token);
  };

  const ready = list?.status === "success" && items !== null;
  const done = items ? items.filter(i => i.done).length : 0;

  return (
    <aside className="detail" data-testid="detail">
      <h2>#{id} {card.title}</h2>
      <p className="muted">in {COLUMN_NAMES[column]}</p>
      <form className="row" onSubmit={rename}>
        <input data-testid="title-input" aria-label="New title" placeholder="New title" value={title} onChange={e => setTitle(e.target.value)} />
        <button type="submit" data-testid="rename">rename</button>
      </form>
      {renameError !== null && <p className="error">rename error: {renameError}</p>}
      <button type="button" className="danger" data-testid="archive" onClick={archive}>archive</button>
      <div className="checklist" data-testid="checklist">
        <h3>Checklist</h3>
        {(!list || list.status === "loading") && <p className="muted">loading checklist</p>}
        {list?.status === "error" && (
          <div className="error-box">
            <p className="error">checklist error: {list.error}</p>
            <button type="button" data-testid="retry-checklist" onClick={retryList}>retry</button>
          </div>
        )}
        {ready && (
          <>
            <ul className="items">
              {items.map(it => (
                <li key={it.key} className="item-row">
                  <span data-testid="item">{it.done ? "[x]" : "[ ]"} {it.text}{it.id === null ? " (adding…)" : ""}</span>
                  {it.id !== null && (
                    <button type="button" data-testid="toggle" onClick={() => toggle(it.id!, !it.done)}>toggle</button>
                  )}
                </li>
              ))}
            </ul>
            <p data-testid="progress">{done}/{items.length} done</p>
            <form className="row" onSubmit={addItem}>
              <input data-testid="item-input" aria-label="New item" placeholder="New item" value={text} onChange={e => setText(e.target.value)} />
              <button type="submit" data-testid="add-item">add item</button>
            </form>
          </>
        )}
      </div>
      {itemError !== null && <p className="error">item error: {itemError}</p>}
    </aside>
  );
}
