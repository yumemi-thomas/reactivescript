import { useState, type FormEvent } from "react";
import { useMachine } from "@xstate/react";
import type { Column } from "./api";
import { boardMachine, planMove, type Direction } from "./boardMachine";
import { COLUMNS, COLUMN_NAMES, locate, shown, type BoardCard, type BoardData } from "./model";

type Send = ReturnType<typeof useMachine<typeof boardMachine>>[1];
type Snapshot = ReturnType<typeof useMachine<typeof boardMachine>>[0];

const DIRECTIONS: Direction[] = ["left", "right", "up", "down"];

export default function BoardPage() {
  const [snapshot, send] = useMachine(boardMachine);
  const { context } = snapshot;
  const data = shown(context.base, context.ops);
  const [newTitle, setNewTitle] = useState("");

  const addCard = (e: FormEvent) => {
    e.preventDefault();
    const title = newTitle.trim();
    if (!title || data.columns.todo === null) return;
    send({ type: "ADD", title });
    setNewTitle("");
  };

  return (
    <div className="board-page">
      <div className="notices" aria-live="polite">
        {context.errors.move !== null && (
          <p className="error" data-testid="move-error">
            move error: {context.errors.move}
          </p>
        )}
        {context.errors.add !== null && (
          <p className="error" data-testid="add-error">
            add error: {context.errors.add}
          </p>
        )}
        {context.errors.archive !== null && (
          <p className="error" data-testid="archive-error">
            archive error: {context.errors.archive}
          </p>
        )}
      </div>
      <div className="layout">
        <div className="columns">
          {COLUMNS.map(column => (
            <ColumnView
              key={column}
              column={column}
              snapshot={snapshot}
              data={data}
              send={send}
              footer={
                column === "todo" && (
                  <form className="add-card" onSubmit={addCard}>
                    <input
                      data-testid="new-card"
                      aria-label="New card title"
                      placeholder="New card"
                      value={newTitle}
                      onChange={e => setNewTitle(e.target.value)}
                    />
                    <button type="submit" data-testid="add-card" disabled={data.columns.todo === null}>
                      Add
                    </button>
                  </form>
                )
              }
            />
          ))}
        </div>
        <Detail key={context.selectedId ?? "none"} snapshot={snapshot} data={data} send={send} />
      </div>
    </div>
  );
}

function ColumnView({
  column,
  snapshot,
  data,
  send,
  footer,
}: {
  column: Column;
  snapshot: Snapshot;
  data: BoardData;
  send: Send;
  footer: React.ReactNode;
}) {
  const cards = data.columns[column];
  const loading = snapshot.matches({ columns: { [column]: "loading" } });
  const failed = snapshot.matches({ columns: { [column]: "failed" } });
  const name = COLUMN_NAMES[column];
  return (
    <section className="column" data-testid={`col-${column}`} aria-label={name}>
      <h2 data-testid={`head-${column}`}>{cards && !loading && !failed ? `${name} (${cards.length})` : name}</h2>
      {loading && <p className="status">loading</p>}
      {failed && (
        <div className="status error" role="alert">
          <span>error: {snapshot.context.columnErrors[column]}</span>{" "}
          <button type="button" data-testid={`retry-${column}`} onClick={() => send({ type: "RETRY", column })}>
            retry
          </button>
        </div>
      )}
      {cards && !loading && !failed && (
        <ul className="cards">
          {cards.map(card => (
            <CardRow
              key={card.key}
              card={card}
              data={data}
              selected={card.id !== null && card.id === snapshot.context.selectedId}
              send={send}
            />
          ))}
        </ul>
      )}
      {footer}
    </section>
  );
}

function CardRow({ card, data, selected, send }: { card: BoardCard; data: BoardData; selected: boolean; send: Send }) {
  const id = card.id;
  if (id === null) {
    return (
      <li className="card-row adding">
        <span className="card" data-testid="card">
          {card.title} (adding…)
        </span>
      </li>
    );
  }
  return (
    <li className={selected ? "card-row selected" : "card-row"}>
      <button
        type="button"
        className="card"
        data-testid="card"
        aria-pressed={selected}
        onClick={() => send({ type: "SELECT", id })}
      >
        #{id} {card.title} · {card.done}/{card.total}
      </button>
      <span className="moves">
        {DIRECTIONS.map(dir => {
          const { button } = planMove(data, id, dir);
          if (!button.visible) return null;
          return (
            <button
              key={dir}
              type="button"
              data-testid={dir}
              aria-label={`move #${id} ${dir}`}
              disabled={!button.enabled}
              onClick={() => send({ type: "MOVE", id, dir })}
            >
              {dir}
            </button>
          );
        })}
      </span>
    </li>
  );
}

function Detail({ snapshot, data, send }: { snapshot: Snapshot; data: BoardData; send: Send }) {
  const { context } = snapshot;
  const [title, setTitle] = useState("");
  const [itemText, setItemText] = useState("");
  const id = context.selectedId;
  const at = id === null ? null : locate(data, id);

  if (id === null || !at) {
    return (
      <aside className="detail" data-testid="detail">
        <p className="muted">select a card</p>
      </aside>
    );
  }
  const card = data.columns[at.column]![at.index];
  const list = data.lists[id];
  const loading = snapshot.matches({ detail: { selected: "loading" } });
  const failed = snapshot.matches({ detail: { selected: "failed" } });
  const ready = snapshot.matches({ detail: { selected: "ready" } }) && list !== undefined;

  const rename = (e: FormEvent) => {
    e.preventDefault();
    const t = title.trim();
    if (!t) return;
    send({ type: "RENAME", title: t });
  };
  const addItem = (e: FormEvent) => {
    e.preventDefault();
    const t = itemText.trim();
    if (!t || !ready) return;
    send({ type: "ADD_ITEM", text: t });
    setItemText("");
  };

  return (
    <aside className="detail" data-testid="detail">
      <h2>
        #{id} {card.title}
      </h2>
      <p className="muted">in {COLUMN_NAMES[at.column]}</p>
      <form className="row" onSubmit={rename}>
        <input
          data-testid="title-input"
          aria-label="New title"
          placeholder="New title"
          value={title}
          onChange={e => setTitle(e.target.value)}
        />
        <button type="submit" data-testid="rename">
          rename
        </button>
      </form>
      {context.errors.rename !== null && (
        <p className="error" role="alert">
          rename error: {context.errors.rename}
        </p>
      )}
      <button type="button" data-testid="archive" onClick={() => send({ type: "ARCHIVE" })}>
        archive
      </button>
      <div className="checklist" data-testid="checklist">
        {loading && <p className="status">loading checklist</p>}
        {failed && (
          <p className="error" role="alert">
            checklist error: {context.checklistError}
          </p>
        )}
        {ready && (
          <>
            <ul className="items">
              {list.map(item =>
                item.id === null ? (
                  <li key={item.key} className="item-row adding">
                    <span data-testid="item">[ ] {item.text} (adding…)</span>
                  </li>
                ) : (
                  <li key={item.key} className="item-row">
                    <span data-testid="item">
                      [{item.done ? "x" : " "}] {item.text}
                    </span>
                    <button
                      type="button"
                      data-testid="toggle"
                      aria-label={`toggle ${item.text}`}
                      onClick={() => send({ type: "TOGGLE", itemId: item.id! })}
                    >
                      toggle
                    </button>
                  </li>
                ),
              )}
            </ul>
            <p data-testid="progress">
              {list.filter(i => i.done).length}/{list.length} done
            </p>
          </>
        )}
      </div>
      {context.errors.item !== null && (
        <p className="error" role="alert">
          item error: {context.errors.item}
        </p>
      )}
      <form className="row" onSubmit={addItem}>
        <input
          data-testid="item-input"
          aria-label="New checklist item"
          placeholder="New item"
          value={itemText}
          onChange={e => setItemText(e.target.value)}
        />
        <button type="submit" data-testid="add-item" disabled={!ready}>
          add item
        </button>
      </form>
    </aside>
  );
}
