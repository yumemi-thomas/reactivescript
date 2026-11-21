import { useState, type FormEvent } from "react";
import { useActorRef, useSelector } from "@xstate/react";
import {
  boardMachine,
  checklistStatus,
  columnStatus,
  type BoardSend,
  type BoardSnapshot,
} from "./boardMachine";
import {
  COLUMNS,
  COLUMN_NAMES,
  WIP_LIMIT,
  locate,
  planMove,
  type CardView,
  type Column,
  type Direction,
  type ItemView,
} from "./model";

const DIRECTIONS: readonly Direction[] = ["left", "right", "up", "down"];

/** The board page. It is mounted when its tab opens, so leaving the tab discards it. */
export function BoardPage() {
  const actor = useActorRef(boardMachine);
  const snap = useSelector(actor, (s) => s);
  const send: BoardSend = (event) => actor.send(event);
  const { errors } = snap.context;

  return (
    <div className="board">
      <div className="columns">
        {COLUMNS.map((column) => (
          <ColumnView key={column} column={column} snap={snap} send={send} />
        ))}
      </div>
      {errors.move && (
        <p role="alert" data-testid="move-error" className="error">{`move error: ${errors.move}`}</p>
      )}
      {errors.archive && (
        <p role="alert" data-testid="archive-error" className="error">{`archive error: ${errors.archive}`}</p>
      )}
      <DetailPanel snap={snap} send={send} />
    </div>
  );
}

function ColumnView({ column, snap, send }: { column: Column; snap: BoardSnapshot; send: BoardSend }) {
  const status = columnStatus(snap, column);
  const cards = snap.context.cards[column];
  const name = COLUMN_NAMES[column];
  const heading = status === "ready" ? `${name} (${cards.length})` : name;

  return (
    <section data-testid={`col-${column}`} className="column" aria-label={name}>
      <h2 data-testid={`head-${column}`}>{heading}</h2>
      {status === "loading" && <p className="muted">loading</p>}
      {status === "failed" && (
        <div className="failed">
          <p role="alert">{`error: ${snap.context.loadErrors[column] ?? "unknown error"}`}</p>
          <button type="button" data-testid={`retry-${column}`} onClick={() => send({ type: "RETRY", column })}>
            retry
          </button>
        </div>
      )}
      {status === "ready" && (
        <ul className="cards">
          {cards.map((card, index) => (
            <CardRow key={card.key} card={card} column={column} index={index} snap={snap} send={send} />
          ))}
        </ul>
      )}
      {column === "todo" && <AddCardForm ready={status === "ready"} error={snap.context.errors.add} send={send} />}
    </section>
  );
}

function CardRow({
  card,
  column,
  index,
  snap,
  send,
}: {
  card: CardView;
  column: Column;
  index: number;
  snap: BoardSnapshot;
  send: BoardSend;
}) {
  const id = card.id;
  const selected = id !== null && snap.context.selectedId === id;
  const label = id === null ? `${card.title} (adding…)` : `#${id} ${card.title} · ${card.done}/${card.total}`;

  return (
    <li className={`card-row${selected ? " selected" : ""}`} data-column={column} data-index={index}>
      <button
        type="button"
        data-testid="card"
        className="card"
        disabled={id === null}
        aria-pressed={selected}
        onClick={() => {
          if (id !== null) send({ type: "SELECT", id });
        }}
      >
        {label}
      </button>
      {id !== null && (
        <div className="moves">
          {DIRECTIONS.map((dir) => (
            <MoveButton key={dir} id={id} dir={dir} snap={snap} send={send} />
          ))}
        </div>
      )}
    </li>
  );
}

function MoveButton({ id, dir, snap, send }: { id: number; dir: Direction; snap: BoardSnapshot; send: BoardSend }) {
  const plan = planMove(snap.context.cards, id, dir);
  if (!plan) return null; // nowhere to go: the button is not shown
  const target = plan.to.column;
  const targetReady = target === plan.from.column || columnStatus(snap, target) === "ready";
  const wipFull = target === "doing" && plan.from.column !== "doing" && snap.context.cards.doing.length >= WIP_LIMIT;
  return (
    <button
      type="button"
      data-testid={dir}
      disabled={!targetReady || wipFull}
      onClick={() => send({ type: "MOVE", id, dir })}
    >
      {dir}
    </button>
  );
}

function AddCardForm({ ready, error, send }: { ready: boolean; error: string | undefined; send: BoardSend }) {
  const [draft, setDraft] = useState("");
  const submit = () => {
    const title = draft.trim();
    if (title === "") return;
    send({ type: "ADD_CARD", title });
    setDraft("");
  };
  return (
    <div className="add-card">
      <input
        data-testid="new-card"
        aria-label="new card title"
        value={draft}
        disabled={!ready}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
        }}
      />
      <button type="button" data-testid="add-card" disabled={!ready} onClick={submit}>
        add
      </button>
      {error && (
        <p role="alert" data-testid="add-error" className="error">{`add error: ${error}`}</p>
      )}
    </div>
  );
}

function DetailPanel({ snap, send }: { snap: BoardSnapshot; send: BoardSend }) {
  const id = snap.context.selectedId;
  return (
    <section data-testid="detail" className="detail" aria-label="selected card">
      {id === null ? <p>select a card</p> : <SelectedCard key={id} id={id} snap={snap} send={send} />}
    </section>
  );
}

/** Keyed by card id, so its inputs start empty whenever another card is selected. */
function SelectedCard({ id, snap, send }: { id: number; snap: BoardSnapshot; send: BoardSend }) {
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const found = locate(snap.context.cards, id);
  const checklist = checklistStatus(snap);
  const { items, errors, checklistError } = snap.context;
  const doneCount = items.filter((i) => i.done).length;

  const submitRename = (e: FormEvent) => {
    e.preventDefault();
    const next = title.trim();
    if (next !== "") send({ type: "RENAME", title: next });
  };
  const submitItem = (e: FormEvent) => {
    e.preventDefault();
    const next = text.trim();
    if (next === "" || checklist !== "ready") return;
    send({ type: "ADD_ITEM", text: next });
    setText("");
  };

  return (
    <>
      <h3>{found ? `#${id} ${found.card.title}` : `#${id}`}</h3>
      {found && <p>{`in ${COLUMN_NAMES[found.column]}`}</p>}

      <form onSubmit={submitRename} className="inline">
        <input
          data-testid="title-input"
          aria-label="card title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <button type="submit" data-testid="rename">
          rename
        </button>
      </form>
      {errors.rename && <p role="alert" className="error">{`rename error: ${errors.rename}`}</p>}
      <button type="button" data-testid="archive" onClick={() => send({ type: "ARCHIVE" })}>
        archive
      </button>

      <section data-testid="checklist" aria-label="checklist">
        {checklist === "loading" && <p className="muted">loading checklist</p>}
        {checklist === "failed" && (
          <p role="alert" className="error">{`checklist error: ${checklistError ?? "unknown error"}`}</p>
        )}
        {checklist === "ready" && (
          <>
            <ul className="items">
              {items.map((item) => (
                <ItemRow key={item.key} item={item} send={send} />
              ))}
            </ul>
            <p data-testid="progress">{`${doneCount}/${items.length} done`}</p>
            <form onSubmit={submitItem} className="inline">
              <input
                data-testid="item-input"
                aria-label="new checklist item"
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
              <button type="submit" data-testid="add-item">
                add item
              </button>
            </form>
          </>
        )}
      </section>
      {errors.item && <p role="alert" className="error">{`item error: ${errors.item}`}</p>}
    </>
  );
}

function ItemRow({ item, send }: { item: ItemView; send: BoardSend }) {
  const itemId = item.id;
  const box = item.done ? "[x]" : "[ ]";
  return (
    <li className="item">
      <span data-testid="item">{itemId === null ? `[ ] ${item.text} (adding…)` : `${box} ${item.text}`}</span>
      {itemId !== null && (
        <button type="button" data-testid="toggle" onClick={() => send({ type: "TOGGLE_ITEM", itemId })}>
          toggle
        </button>
      )}
    </li>
  );
}
