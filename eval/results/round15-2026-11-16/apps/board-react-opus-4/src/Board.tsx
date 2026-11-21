import { useEffect, useState, useSyncExternalStore, type FormEvent } from "react";
import type { Column } from "./api.js";
import { BoardStore, COLUMNS, COLUMN_NAMES, type BoardCard, type BoardView } from "./boardStore";

const DIRS = ["left", "right", "up", "down"] as const;

export default function BoardPage() {
  const [store] = useState(() => new BoardStore());
  const view = useSyncExternalStore(store.subscribe, store.getSnapshot);
  useEffect(() => { store.start(); }, [store]);

  return (
    <div className="board">
      <div className="board-main">
        {view.moveError !== null && <p className="error" data-testid="move-error" role="alert">move error: {view.moveError}</p>}
        {view.archiveError !== null && <p className="error" data-testid="archive-error" role="alert">archive error: {view.archiveError}</p>}
        <div className="columns">
          {COLUMNS.map(column => <ColumnPanel key={column} column={column} view={view} store={store} />)}
        </div>
      </div>
      <Detail key={view.selected?.card.id ?? "none"} view={view} store={store} />
    </div>
  );
}

function ColumnPanel({ column, view, store }: { column: Column; view: BoardView; store: BoardStore }) {
  const col = view.cols[column];
  const name = COLUMN_NAMES[column];
  const doingFull = view.cols.doing.cards.length >= 3;
  const [title, setTitle] = useState("");

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const t = title.trim();
    if (!t) return;
    setTitle("");
    store.addCard(t);
  };

  const buttonsFor = (card: BoardCard) => {
    const list = col.cards;
    const index = list.indexOf(card);
    const ci = COLUMNS.indexOf(column);
    const shown = {
      left: ci > 0,
      right: ci < COLUMNS.length - 1,
      up: index > 0,
      down: index < list.length - 1,
    };
    return DIRS.filter(d => shown[d]).map(d => {
      const target = d === "left" ? COLUMNS[ci - 1] : d === "right" ? COLUMNS[ci + 1] : column;
      const blockedByWip = target === "doing" && column !== "doing" && doingFull;
      const disabled = blockedByWip || view.cols[target].status !== "ok";
      return (
        <button key={d} type="button" data-testid={d} disabled={disabled} aria-label={`move #${card.id} ${d}`}
          onClick={() => store.move(card.id, d)}>{d}</button>
      );
    });
  };

  return (
    <section className="column" data-testid={`col-${column}`}>
      <h2 data-testid={`head-${column}`}>{col.status === "ok" ? `${name} (${col.cards.length})` : name}</h2>
      {col.status === "loading" && <p className="muted">loading</p>}
      {col.status === "error" && (
        <div>
          <p className="error" role="alert">error: {col.error}</p>
          <button type="button" data-testid={`retry-${column}`} onClick={() => store.loadColumn(column)}>retry</button>
        </div>
      )}
      {col.status === "ok" && (
        <ul className="list">
          {col.cards.map(card => (
            <li key={card.id} className="row">
              {card.temp ? (
                <span className="card temp" data-testid="card">{card.title} (adding…)</span>
              ) : (
                <>
                  <span className={`card${view.selected?.card.id === card.id ? " selected" : ""}`} data-testid="card"
                    role="button" tabIndex={0} aria-pressed={view.selected?.card.id === card.id}
                    onClick={() => store.select(card.id)}
                    onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); store.select(card.id); } }}>
                    #{card.id} {card.title} · {card.done}/{card.total}
                  </span>
                  {buttonsFor(card)}
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      {column === "todo" && (
        <>
          <form className="inline" onSubmit={submit}>
            <input data-testid="new-card" aria-label="new card title" placeholder="New card" value={title}
              onChange={e => setTitle(e.target.value)} />
            <button type="submit" data-testid="add-card">add</button>
          </form>
          {view.addError !== null && <p className="error" data-testid="add-error" role="alert">add error: {view.addError}</p>}
        </>
      )}
    </section>
  );
}

function Detail({ view, store }: { view: BoardView; store: BoardStore }) {
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const sel = view.selected;

  if (!sel) {
    return <aside className="detail" data-testid="detail"><p className="muted">select a card</p></aside>;
  }

  const rename = (e: FormEvent) => {
    e.preventDefault();
    const t = title.trim();
    if (!t) return;
    store.rename(t);
  };
  const addItem = (e: FormEvent) => {
    e.preventDefault();
    const t = text.trim();
    if (!t || view.checklist?.status !== "ok") return;
    setText("");
    store.addItem(t);
  };
  const cl = view.checklist;
  const items = cl?.items ?? [];

  return (
    <aside className="detail" data-testid="detail">
      <h2>#{sel.card.id} {sel.card.title}</h2>
      <p>in {COLUMN_NAMES[sel.column]}</p>
      <form className="inline" onSubmit={rename}>
        <input data-testid="title-input" aria-label="new title" placeholder="New title" value={title}
          onChange={e => setTitle(e.target.value)} />
        <button type="submit" data-testid="rename">rename</button>
      </form>
      {view.renameError !== null && <p className="error" role="alert">rename error: {view.renameError}</p>}
      <button type="button" data-testid="archive" onClick={() => store.archive()}>archive</button>
      <div data-testid="checklist">
        {(!cl || cl.status === "loading") && <p className="muted">loading checklist</p>}
        {cl?.status === "error" && <p className="error" role="alert">checklist error: {cl.error}</p>}
        {cl?.status === "ok" && (
          <>
            <ul className="list">
              {items.map(item => (
                <li key={item.id} className="row">
                  <span data-testid="item">{item.done ? "[x]" : "[ ]"} {item.text}{item.temp ? " (adding…)" : ""}</span>
                  {!item.temp && <button type="button" data-testid="toggle" onClick={() => store.toggle(item.id)}>toggle</button>}
                </li>
              ))}
            </ul>
            <p data-testid="progress">{items.filter(i => i.done).length}/{items.length} done</p>
          </>
        )}
      </div>
      <form className="inline" onSubmit={addItem}>
        <input data-testid="item-input" aria-label="new item" placeholder="New item" value={text}
          onChange={e => setText(e.target.value)} />
        <button type="submit" data-testid="add-item" disabled={cl?.status !== "ok"}>add item</button>
      </form>
      {view.itemError !== null && <p className="error" role="alert">item error: {view.itemError}</p>}
    </aside>
  );
}
