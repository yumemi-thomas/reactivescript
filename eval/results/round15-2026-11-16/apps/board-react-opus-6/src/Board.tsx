import { useEffect, useReducer, useState, type FormEvent } from "react";
import * as api from "./api.js";
import type { Column } from "./api.js";
import {
  COLUMNS, COLUMN_NAME, WIP_LIMIT, boardReducer, displayed, errorMessage, initialBoard, uid,
  type BoardCard, type ChecklistItem, type ChecklistState, type Op, type OpBody,
} from "./model";

export default function Board() {
  const [state, dispatch] = useReducer(boardReducer, undefined, initialBoard);

  useEffect(() => {
    let live = true;
    for (const col of COLUMNS) {
      api.fetchCards(col).then(
        cards => { if (live) dispatch({ type: "colOk", col, req: 0, cards }); },
        (e: unknown) => { if (live) dispatch({ type: "colErr", col, req: 0, message: errorMessage(e) }); },
      );
    }
    return () => { live = false; };
  }, []);

  const { lists, items } = displayed(state);

  function retry(col: Column) {
    const req = uid();
    dispatch({ type: "colStart", col, req });
    api.fetchCards(col).then(
      cards => dispatch({ type: "colOk", col, req, cards }),
      (e: unknown) => dispatch({ type: "colErr", col, req, message: errorMessage(e) }),
    );
  }

  /** apply a change at once, then settle it with the server's answer */
  function run<T>(body: OpBody, call: () => Promise<T>, patch: (res: T) => Partial<OpBody> = () => ({})) {
    const opId = uid();
    dispatch({ type: "opStart", op: { ...body, opId, confirmed: false } as Op });
    let p: Promise<T>;
    try { p = call(); } catch (e) { p = Promise.reject(e); }
    p.then(
      res => dispatch({ type: "opOk", opId, patch: patch(res) }),
      (e: unknown) => dispatch({ type: "opFail", opId, message: errorMessage(e) }),
    );
  }

  function move(id: number, to: Column, index: number) {
    run({ kind: "move", id, to, index }, () => api.moveCard(id, to, index));
  }

  function select(id: number) {
    if (state.selected === id) return;
    const req = uid();
    dispatch({ type: "select", id, req });
    api.fetchChecklist(id).then(
      list => dispatch({ type: "clOk", req, items: list }),
      (e: unknown) => dispatch({ type: "clErr", req, message: errorMessage(e) }),
    );
  }

  const doingCount = lists.doing?.length ?? 0;
  const doingFull = lists.doing !== null && doingCount >= WIP_LIMIT;

  let selectedCard: BoardCard | null = null;
  let selectedCol: Column | null = null;
  if (state.selected !== null) {
    for (const col of COLUMNS) {
      const c = lists[col]?.find(x => x.id === state.selected);
      if (c) { selectedCard = c; selectedCol = col; }
    }
  }

  return (
    <div className="board-page">
      <div className="notices">
        {state.moveError !== null && <p className="error" data-testid="move-error" role="alert">move error: {state.moveError}</p>}
        {state.archiveError !== null && <p className="error" data-testid="archive-error" role="alert">archive error: {state.archiveError}</p>}
      </div>
      <div className="board">
        <div className="columns">
          {COLUMNS.map((col, ci) => {
            const cs = state.columns[col];
            const cards = lists[col];
            return (
              <section key={col} className="column" data-testid={`col-${col}`}>
                <h2 data-testid={`head-${col}`}>{cards ? `${COLUMN_NAME[col]} (${cards.length})` : COLUMN_NAME[col]}</h2>
                {cs.status === "loading" && <p className="muted">loading</p>}
                {cs.status === "error" && (
                  <div>
                    <p className="error">error: {cs.message}</p>
                    <button data-testid={`retry-${col}`} onClick={() => retry(col)}>retry</button>
                  </div>
                )}
                {cards && (
                  <ul className="cards">
                    {cards.map((c, i) => {
                      const id = c.id;
                      if (id === null) {
                        return (
                          <li key={c.key} className="card-row pending">
                            <span className="card" data-testid="card">{c.title} (adding…)</span>
                          </li>
                        );
                      }
                      const left = ci > 0 ? COLUMNS[ci - 1] : null;
                      const right = ci < COLUMNS.length - 1 ? COLUMNS[ci + 1] : null;
                      const below = cards[i + 1];
                      const canDown = below !== undefined && below.id !== null;
                      const blocked = (to: Column | null) => to === null || lists[to] === null || (to === "doing" && doingFull);
                      return (
                        <li key={c.key} className={`card-row${state.selected === id ? " selected" : ""}`}>
                          <button type="button" className="card" data-testid="card" onClick={() => select(id)}>
                            #{id} {c.title} · {c.done}/{c.total}
                          </button>
                          <span className="moves">
                            {left && (
                              <button type="button" data-testid="left" disabled={blocked(left)}
                                onClick={() => move(id, left, lists[left]?.filter(x => x.id !== null).length ?? 0)}>left</button>
                            )}
                            {right && (
                              <button type="button" data-testid="right" disabled={blocked(right)}
                                onClick={() => move(id, right, lists[right]?.filter(x => x.id !== null).length ?? 0)}>right</button>
                            )}
                            {i > 0 && <button type="button" data-testid="up" onClick={() => move(id, col, i - 1)}>up</button>}
                            {canDown && <button type="button" data-testid="down" onClick={() => move(id, col, i + 1)}>down</button>}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
                {col === "todo" && (
                  <AddCard disabled={lists.todo === null} error={state.addError}
                    onAdd={title => run({ kind: "add", title, newId: null }, () => api.addCard("todo", title), res => ({ newId: res.id, title: res.title }))} />
                )}
              </section>
            );
          })}
        </div>
        <aside className="detail" data-testid="detail">
          {selectedCard && selectedCard.id !== null && selectedCol ? (
            <Detail
              key={selectedCard.id}
              card={selectedCard as BoardCard & { id: number }}
              column={selectedCol}
              checklist={state.checklist}
              items={items}
              renameError={state.renameError?.cardId === selectedCard.id ? state.renameError.message : null}
              itemError={state.itemError?.cardId === selectedCard.id ? state.itemError.message : null}
              run={run}
            />
          ) : (
            <p className="muted">select a card</p>
          )}
        </aside>
      </div>
    </div>
  );
}

function AddCard({ disabled, error, onAdd }: { disabled: boolean; error: string | null; onAdd: (title: string) => void }) {
  const [title, setTitle] = useState("");
  function submit(e: FormEvent) {
    e.preventDefault();
    const t = title.trim();
    if (!t || disabled) return;
    setTitle("");
    onAdd(t);
  }
  return (
    <form className="add-card" onSubmit={submit}>
      <input data-testid="new-card" aria-label="new card title" placeholder="New card" value={title}
        onChange={e => setTitle(e.target.value)} />
      <button type="submit" data-testid="add-card" disabled={disabled}>add</button>
      {error !== null && <p className="error" data-testid="add-error" role="alert">add error: {error}</p>}
    </form>
  );
}

type Run = <T>(body: OpBody, call: () => Promise<T>, patch?: (res: T) => Partial<OpBody>) => void;

function Detail({ card, column, checklist, items, renameError, itemError, run }: {
  card: BoardCard & { id: number };
  column: Column;
  checklist: ChecklistState | null;
  items: ChecklistItem[] | null;
  renameError: string | null;
  itemError: string | null;
  run: Run;
}) {
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const id = card.id;

  function rename(e: FormEvent) {
    e.preventDefault();
    const t = title.trim();
    if (!t) return;
    run({ kind: "rename", id, title: t }, () => api.renameCard(id, t), res => ({ title: res.title }));
  }

  function addItem(e: FormEvent) {
    e.preventDefault();
    const t = text.trim();
    if (!t || !items) return;
    setText("");
    run({ kind: "addItem", cardId: id, text: t, newItem: null }, () => api.addItem(id, t), res => ({ newItem: res }));
  }

  function toggle(item: ChecklistItem) {
    const itemId = item.id;
    if (itemId === null) return;
    const done = !item.done;
    run({ kind: "toggle", cardId: id, itemId, done, delta: done ? 1 : -1 }, () => api.toggleItem(id, itemId, done));
  }

  const doneCount = items?.filter(it => it.done).length ?? 0;

  return (
    <div>
      <h2>#{id} {card.title}</h2>
      <p className="muted">in {COLUMN_NAME[column]}</p>
      <form className="row" onSubmit={rename}>
        <input data-testid="title-input" aria-label="new title" placeholder="New title" value={title}
          onChange={e => setTitle(e.target.value)} />
        <button type="submit" data-testid="rename">rename</button>
      </form>
      {renameError !== null && <p className="error" role="alert">rename error: {renameError}</p>}
      <button type="button" data-testid="archive" onClick={() => run({ kind: "archive", id }, () => api.archiveCard(id))}>archive</button>
      <div className="checklist" data-testid="checklist">
        {checklist?.status === "loading" && <p className="muted">loading checklist</p>}
        {checklist?.status === "error" && <p className="error">checklist error: {checklist.message}</p>}
        {items && (
          <>
            <ul>
              {items.map(it => (
                <li key={it.key} className="row">
                  <span data-testid="item">{it.done ? "[x]" : "[ ]"} {it.text}{it.id === null ? " (adding…)" : ""}</span>
                  {it.id !== null && <button type="button" data-testid="toggle" onClick={() => toggle(it)}>toggle</button>}
                </li>
              ))}
            </ul>
            <p data-testid="progress">{doneCount}/{items.length} done</p>
            <form className="row" onSubmit={addItem}>
              <input data-testid="item-input" aria-label="new item" placeholder="New item" value={text}
                onChange={e => setText(e.target.value)} />
              <button type="submit" data-testid="add-item">add item</button>
            </form>
          </>
        )}
      </div>
      {itemError !== null && <p className="error" role="alert">item error: {itemError}</p>}
    </div>
  );
}
