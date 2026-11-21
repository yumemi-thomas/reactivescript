import { useMachine } from "@xstate/react";
import { useState } from "react";
import {
  allowedMove,
  boardMachine,
  COLUMN_LABEL,
  COLUMNS,
  destinationOf,
  locate,
  type At,
  type BoardContext,
  type BoardEvent,
  type Checklist,
  type Column,
  type Dir,
  type Item,
  type Load,
} from "./boardMachine";

type Send = (event: BoardEvent) => void;
const DIRS: Dir[] = ["left", "right", "up", "down"];

/** The board page. It is mounted fresh each time the page opens, so it loads again and starts with nothing selected. */
export default function BoardPage() {
  const [snap, send] = useMachine(boardMachine);
  const ctx = snap.context;
  return (
    <div className="board">
      <Notices ctx={ctx} />
      <div className="columns">
        {COLUMNS.map((column) => (
          <ColumnView key={column} column={column} ctx={ctx} send={send} />
        ))}
      </div>
      <DetailPanel ctx={ctx} send={send} />
    </div>
  );
}

function Notices({ ctx }: { ctx: BoardContext }) {
  return (
    <div className="notices">
      {ctx.errors.move && <p role="alert" data-testid="move-error">{ctx.errors.move}</p>}
      {ctx.errors.add && <p role="alert" data-testid="add-error">{ctx.errors.add}</p>}
      {ctx.errors.archive && <p role="alert" data-testid="archive-error">{ctx.errors.archive}</p>}
    </div>
  );
}

function ColumnView({ column, ctx, send }: { column: Column; ctx: BoardContext; send: Send }) {
  const load = ctx.loads[column];
  const cards = ctx.cards[column];
  const label = COLUMN_LABEL[column];
  const heading = load.status === "loaded" ? `${label} (${cards.length})` : label;
  return (
    <section className="column" data-testid={`col-${column}`} aria-labelledby={`head-${column}`}>
      <h2 id={`head-${column}`} data-testid={`head-${column}`}>
        {heading}
      </h2>
      <LoadStatus column={column} load={load} send={send} />
      <ul className="cards">
        {cards.map((card, index) => (
          <CardRow key={card.key} ctx={ctx} at={{ column, index, card }} send={send} />
        ))}
      </ul>
      {column === "todo" && <AddCard ctx={ctx} send={send} />}
    </section>
  );
}

function LoadStatus({ column, load, send }: { column: Column; load: Load; send: Send }) {
  if (load.status === "loading") return <p className="muted">loading</p>;
  if (load.status === "failed") {
    return (
      <p role="alert">
        error: {load.message}{" "}
        <button type="button" data-testid={`retry-${column}`} onClick={() => send({ type: "RETRY", column })}>
          retry
        </button>
      </p>
    );
  }
  return null;
}

function CardRow({ ctx, at, send }: { ctx: BoardContext; at: At; send: Send }) {
  const { card } = at;
  const isNew = card.id === undefined;
  const moves = isNew
    ? []
    : DIRS.flatMap((dir) => {
        const to = destinationOf(ctx.cards, at, dir);
        return to ? [{ dir, disabled: !allowedMove(ctx, at, to) }] : [];
      });
  return (
    <li className={ctx.selected === card.key ? "card-row selected" : "card-row"}>
      <button
        type="button"
        data-testid="card"
        disabled={isNew}
        onClick={() => send({ type: "SELECT", key: card.key })}
      >
        {isNew ? `${card.title} (adding…)` : `#${card.id} ${card.title} · ${card.done}/${card.total}`}
      </button>
      {moves.map(({ dir, disabled }) => (
        <button
          key={dir}
          type="button"
          data-testid={dir}
          disabled={disabled}
          onClick={() => send({ type: "MOVE", key: card.key, dir })}
        >
          {dir}
        </button>
      ))}
    </li>
  );
}

function AddCard({ ctx, send }: { ctx: BoardContext; send: Send }) {
  const [draft, setDraft] = useState("");
  const ready = ctx.loads.todo.status === "loaded";
  return (
    <form
      className="add"
      onSubmit={(event) => {
        event.preventDefault();
        const title = draft.trim();
        if (!ready || !title) return;
        send({ type: "ADD_CARD", title });
        setDraft("");
      }}
    >
      <input
        data-testid="new-card"
        aria-label="New card title"
        value={draft}
        disabled={!ready}
        onChange={(event) => setDraft(event.target.value)}
      />
      <button type="submit" data-testid="add-card" disabled={!ready}>
        add card
      </button>
    </form>
  );
}

function DetailPanel({ ctx, send }: { ctx: BoardContext; send: Send }) {
  const at = ctx.selected === null ? undefined : locate(ctx.cards, ctx.selected);
  return (
    <aside className="detail" data-testid="detail">
      {at ? <CardDetail key={at.card.key} ctx={ctx} at={at} send={send} /> : <p>select a card</p>}
    </aside>
  );
}

function CardDetail({ ctx, at, send }: { ctx: BoardContext; at: At; send: Send }) {
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const { card } = at;
  const checklist: Checklist = ctx.checklist;
  const loaded = checklist.status === "loaded";
  const items: Item[] = checklist.status === "loaded" ? checklist.items : [];
  const done = items.filter((i) => i.done).length;
  return (
    <>
      <h2>
        #{card.id} {card.title}
      </h2>
      <p>in {COLUMN_LABEL[at.column]}</p>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          const next = title.trim();
          if (!next) return;
          send({ type: "RENAME", title: next });
          setTitle("");
        }}
      >
        <label>
          Title{" "}
          <input data-testid="title-input" value={title} onChange={(event) => setTitle(event.target.value)} />
        </label>{" "}
        <button type="submit" data-testid="rename">
          rename
        </button>
      </form>
      {ctx.errors.rename && <p role="alert" data-testid="rename-error">{ctx.errors.rename}</p>}

      <button type="button" data-testid="archive" onClick={() => send({ type: "ARCHIVE" })}>
        archive
      </button>

      <section data-testid="checklist" aria-label="Checklist">
        {checklist.status === "loading" && <p>loading checklist</p>}
        {checklist.status === "failed" && <p role="alert">checklist error: {checklist.message}</p>}
        {checklist.status === "loaded" && (
          <>
            <ul>
              {items.map((item) => (
                <li key={item.key}>
                  <span data-testid="item">
                    {`[${item.done ? "x" : " "}] ${item.text}${item.id === undefined ? " (adding…)" : ""}`}
                  </span>{" "}
                  {item.id !== undefined && (
                    <button
                      type="button"
                      data-testid="toggle"
                      onClick={() => send({ type: "TOGGLE_ITEM", key: item.key })}
                    >
                      toggle
                    </button>
                  )}
                </li>
              ))}
            </ul>
            <p data-testid="progress">{`${done}/${items.length} done`}</p>
          </>
        )}
      </section>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          const next = text.trim();
          if (!loaded || !next) return;
          send({ type: "ADD_ITEM", text: next });
          setText("");
        }}
      >
        <input
          data-testid="item-input"
          aria-label="New checklist item"
          value={text}
          disabled={!loaded}
          onChange={(event) => setText(event.target.value)}
        />{" "}
        <button type="submit" data-testid="add-item" disabled={!loaded}>
          add item
        </button>
      </form>
      {ctx.errors.item && <p role="alert" data-testid="item-error">{ctx.errors.item}</p>}
    </>
  );
}
