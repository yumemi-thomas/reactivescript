import { useState, type FormEvent } from "react";
import { useMachine } from "@xstate/react";
import {
  COLUMN_NAMES,
  COLUMNS,
  DIRS,
  boardMachine,
  findCard,
  moveState,
  type BoardContext,
  type BoardEvent,
  type BoardCard,
  type ChecklistItem,
  type Column,
  type Dir,
} from "./machines/board";

type Send = (event: BoardEvent) => void;

/** The board page. Its machine is created when the page opens and stopped when it closes. */
export default function BoardPage() {
  const [snapshot, send] = useMachine(boardMachine);
  const ctx = snapshot.context;
  return (
    <div className="board-page">
      {ctx.errors.move && <p role="alert" data-testid="move-error" className="error">{ctx.errors.move}</p>}
      {ctx.errors.archive && (
        <p role="alert" data-testid="archive-error" className="error">{ctx.errors.archive}</p>
      )}
      <div className="board">
        <div className="columns">
          {COLUMNS.map((column) => (
            <ColumnView key={column} column={column} ctx={ctx} send={send} />
          ))}
        </div>
        <Detail ctx={ctx} send={send} />
      </div>
    </div>
  );
}

function ColumnView({ column, ctx, send }: { column: Column; ctx: BoardContext; send: Send }) {
  const load = ctx.loads[column];
  const cards = ctx.cols[column];
  const heading = load.status === "loaded" ? `${COLUMN_NAMES[column]} (${cards.length})` : COLUMN_NAMES[column];
  return (
    <section className="column" data-testid={`col-${column}`} aria-label={COLUMN_NAMES[column]}>
      <h2 data-testid={`head-${column}`}>{heading}</h2>
      {load.status === "loading" && <p>loading</p>}
      {load.status === "failed" && (
        <div>
          <p className="error">{`error: ${load.message}`}</p>
          <button type="button" data-testid={`retry-${column}`} onClick={() => send({ type: "RETRY", column })}>
            retry
          </button>
        </div>
      )}
      {load.status === "loaded" && (
        <ul className="cards">
          {cards.map((card) => (
            <CardRow key={card.key} card={card} ctx={ctx} send={send} />
          ))}
        </ul>
      )}
      {column === "todo" && <AddCard ctx={ctx} send={send} />}
    </section>
  );
}

function CardRow({ card, ctx, send }: { card: BoardCard; ctx: BoardContext; send: Send }) {
  if (card.id === null) {
    return (
      <li className="card">
        <span data-testid="card">{`${card.title} (adding…)`}</span>
      </li>
    );
  }
  const id = card.id;
  const selected = ctx.selectedId === id;
  return (
    <li className={selected ? "card selected" : "card"}>
      <button type="button" data-testid="card" aria-pressed={selected} onClick={() => send({ type: "SELECT", cardId: id })}>
        {`#${id} ${card.title} · ${card.done}/${card.total}`}
      </button>
      {DIRS.map((dir: Dir) => {
        const state = moveState(ctx, id, dir);
        if (state === "hidden") return null;
        return (
          <button
            key={dir}
            type="button"
            className="move"
            disabled={state === "disabled"}
            onClick={() => send({ type: "MOVE", cardId: id, dir })}
          >
            {dir}
          </button>
        );
      })}
    </li>
  );
}

function AddCard({ ctx, send }: { ctx: BoardContext; send: Send }) {
  const [title, setTitle] = useState("");
  const ready = ctx.loads.todo.status === "loaded";
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = title.trim();
    if (!ready || trimmed === "") return;
    send({ type: "ADD", title: trimmed });
    setTitle("");
  };
  return (
    <form className="add" onSubmit={submit}>
      <input
        data-testid="new-card"
        value={title}
        placeholder="New card"
        aria-label="New card title"
        onChange={(event) => setTitle(event.target.value)}
      />
      <button type="submit" data-testid="add-card">add</button>
      {ctx.errors.add && <p role="alert" data-testid="add-error" className="error">{ctx.errors.add}</p>}
    </form>
  );
}

function Detail({ ctx, send }: { ctx: BoardContext; send: Send }) {
  const card = ctx.selectedId === null ? undefined : findCard(ctx.cols, ctx.selectedId);
  if (!card || card.id === null) {
    return (
      <aside className="detail" data-testid="detail">
        <p>select a card</p>
      </aside>
    );
  }
  // Keyed by selection, so the inputs start empty for each card selected.
  return <SelectedCard key={ctx.selection} card={card} id={card.id} ctx={ctx} send={send} />;
}

function SelectedCard({
  card,
  id,
  ctx,
  send,
}: {
  card: BoardCard;
  id: number;
  ctx: BoardContext;
  send: Send;
}) {
  const [title, setTitle] = useState("");
  const [item, setItem] = useState("");
  const { checklist } = ctx;
  const ready = checklist.status === "loaded";
  const doneCount = checklist.items.filter((i) => i.done).length;

  const rename = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = title.trim();
    if (trimmed === "") return;
    send({ type: "RENAME", title: trimmed });
  };
  const addItem = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = item.trim();
    if (!ready || trimmed === "") return;
    send({ type: "ADD_ITEM", text: trimmed });
    setItem("");
  };

  return (
    <aside className="detail" data-testid="detail">
      <h2>{`#${id} ${card.title}`}</h2>
      <p>{`in ${COLUMN_NAMES[card.column]}`}</p>

      <form className="rename" onSubmit={rename}>
        <input
          data-testid="title-input"
          value={title}
          aria-label="New title"
          onChange={(event) => setTitle(event.target.value)}
        />
        <button type="submit" data-testid="rename">rename</button>
      </form>
      {ctx.errors.rename && <p role="alert" className="error">{ctx.errors.rename}</p>}

      <button type="button" data-testid="archive" onClick={() => send({ type: "ARCHIVE" })}>
        archive
      </button>

      <section data-testid="checklist" aria-label="Checklist">
        {checklist.status === "loading" && <p>loading checklist</p>}
        {checklist.status === "failed" && <p className="error">{`checklist error: ${checklist.message}`}</p>}
        {ready && (
          <ul className="items">
            {checklist.items.map((i) => (
              <ItemRow key={i.key} item={i} send={send} />
            ))}
          </ul>
        )}
        {ready && <p data-testid="progress">{`${doneCount}/${checklist.items.length} done`}</p>}
      </section>
      {ctx.errors.item && <p role="alert" className="error">{ctx.errors.item}</p>}

      <form className="add-item" onSubmit={addItem}>
        <input
          data-testid="item-input"
          value={item}
          aria-label="New checklist item"
          onChange={(event) => setItem(event.target.value)}
        />
        <button type="submit" data-testid="add-item">add item</button>
      </form>
    </aside>
  );
}

function ItemRow({ item, send }: { item: ChecklistItem; send: Send }) {
  const itemId = item.id;
  return (
    <li>
      <span data-testid="item">{`[${item.done ? "x" : " "}] ${item.text}${itemId === null ? " (adding…)" : ""}`}</span>
      {itemId !== null && (
        <button type="button" data-testid="toggle" onClick={() => send({ type: "TOGGLE_ITEM", itemId })}>
          toggle
        </button>
      )}
    </li>
  );
}
