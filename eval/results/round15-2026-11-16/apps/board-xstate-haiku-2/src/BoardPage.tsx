import { useMachine } from "@xstate/react";
import type { Column } from "./api";
import {
  COLUMNS,
  COLUMN_NAME,
  DIRS,
  boardMachine,
  isMoving,
  moveButton,
  selectedLocation,
} from "./board";
import type { BoardContext, BoardEvent, CardRow, Dir } from "./board";

type Send = (event: BoardEvent) => void;

export function BoardPage() {
  const [snap, send] = useMachine(boardMachine);
  const ctx = snap.context;
  return (
    <main className="page board-page">
      <div className="columns">
        {COLUMNS.map((column) => (
          <BoardColumn key={column} column={column} ctx={ctx} send={send} />
        ))}
      </div>
      {ctx.errors.move !== null && (
        <p role="alert" className="error" data-testid="move-error">{`move error: ${ctx.errors.move}`}</p>
      )}
      {ctx.errors.archive !== null && (
        <p role="alert" className="error" data-testid="archive-error">{`archive error: ${ctx.errors.archive}`}</p>
      )}
      <Detail ctx={ctx} send={send} />
    </main>
  );
}

function BoardColumn({ column, ctx, send }: { column: Column; ctx: BoardContext; send: Send }) {
  const status = ctx.status[column];
  const cards = ctx.columns[column];
  const label = COLUMN_NAME[column];
  const ready = status === "ready";
  return (
    <section className="column">
      <h2 data-testid={`head-${column}`}>{ready ? `${label} (${cards.length})` : label}</h2>
      <div data-testid={`col-${column}`}>
        {status === "loading" && <p className="muted">loading</p>}
        {status === "failed" && (
          <p className="error">
            {`error: ${ctx.loadErrors[column] ?? ""}`}
            <button type="button" data-testid={`retry-${column}`} onClick={() => send({ type: "retry", column })}>
              retry
            </button>
          </p>
        )}
        {ready && (
          <ul className="cards">
            {cards.map((card) => (
              <CardView key={card.key} card={card} ctx={ctx} send={send} />
            ))}
          </ul>
        )}
      </div>
      {column === "todo" && (
        <form
          className="add-form"
          onSubmit={(e) => {
            e.preventDefault();
            send({ type: "add" });
          }}
        >
          <input
            data-testid="new-card"
            aria-label="New card title"
            placeholder="New card"
            value={ctx.drafts.newCard}
            disabled={!ready}
            onChange={(e) => send({ type: "draft", field: "newCard", text: e.target.value })}
          />
          <button type="submit" data-testid="add-card" disabled={!ready}>
            Add
          </button>
        </form>
      )}
      {column === "todo" && ctx.errors.add !== null && (
        <p role="alert" className="error" data-testid="add-error">{`add error: ${ctx.errors.add}`}</p>
      )}
    </section>
  );
}

function CardView({ card, ctx, send }: { card: CardRow; ctx: BoardContext; send: Send }) {
  return (
    <li className="card-row">
      {card.id === null ? (
        <span className="card" data-testid="card">{`${card.title} (adding…)`}</span>
      ) : (
        <SelectableCard card={card} ctx={ctx} send={send} />
      )}
      <span className="moves">
        {DIRS.map((dir) => {
          const state = moveButton(ctx, card.key, dir);
          if (state === "hidden") return null;
          return (
            <MoveButton key={dir} card={card} dir={dir} disabled={state === "disabled"} send={send} />
          );
        })}
      </span>
    </li>
  );
}

function SelectableCard({ card, ctx, send }: { card: CardRow; ctx: BoardContext; send: Send }) {
  const id = card.id ?? 0;
  const selected = ctx.selectedId === id;
  return (
    <button
      type="button"
      className="card"
      data-testid="card"
      aria-pressed={selected}
      onClick={() => send({ type: "select", id })}
    >
      {`#${id} ${card.title} · ${card.done}/${card.total}`}
    </button>
  );
}

function MoveButton({ card, dir, disabled, send }: { card: CardRow; dir: Dir; disabled: boolean; send: Send }) {
  return (
    <button type="button" disabled={disabled} onClick={() => send({ type: "move", key: card.key, dir })}>
      {dir}
    </button>
  );
}

function Detail({ ctx, send }: { ctx: BoardContext; send: Send }) {
  const hit = selectedLocation(ctx);
  if (!hit || hit.card.id === null) {
    return (
      <aside className="detail" data-testid="detail">
        <p className="muted">select a card</p>
      </aside>
    );
  }
  const card = hit.card;
  const busy = isMoving(ctx, card.key);
  const checklistReady = ctx.checklist === "ready";
  const done = ctx.items.filter((i) => i.done).length;
  return (
    <aside className="detail" data-testid="detail">
      <h2>{`#${card.id} ${card.title}`}</h2>
      <p>{`in ${COLUMN_NAME[hit.column]}`}</p>
      <form
        className="inline-form"
        onSubmit={(e) => {
          e.preventDefault();
          send({ type: "rename" });
        }}
      >
        <input
          data-testid="title-input"
          aria-label="Card title"
          value={ctx.drafts.title}
          onChange={(e) => send({ type: "draft", field: "title", text: e.target.value })}
        />
        <button type="submit" data-testid="rename">
          rename
        </button>
      </form>
      {ctx.errors.rename !== null && <p role="alert" className="error">{`rename error: ${ctx.errors.rename}`}</p>}
      <button type="button" data-testid="archive" disabled={busy} onClick={() => send({ type: "archive" })}>
        archive
      </button>

      <div data-testid="checklist" className="checklist">
        {ctx.checklist === "loading" && <p className="muted">loading checklist</p>}
        {ctx.checklist === "failed" && <p className="error">{`checklist error: ${ctx.checklistError ?? ""}`}</p>}
        {checklistReady && (
          <ul>
            {ctx.items.map((item) => (
              <li key={item.key}>
                <span data-testid="item">{`${item.done ? "[x]" : "[ ]"} ${item.text}${item.id === null ? " (adding…)" : ""}`}</span>
                {item.id !== null && (
                  <button type="button" onClick={() => send({ type: "toggleItem", key: item.key })}>
                    toggle
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
      {checklistReady && <p data-testid="progress">{`${done}/${ctx.items.length} done`}</p>}
      <form
        className="inline-form"
        onSubmit={(e) => {
          e.preventDefault();
          send({ type: "addItem" });
        }}
      >
        <input
          data-testid="item-input"
          aria-label="New checklist item"
          value={ctx.drafts.item}
          disabled={!checklistReady}
          onChange={(e) => send({ type: "draft", field: "item", text: e.target.value })}
        />
        <button type="submit" data-testid="add-item" disabled={!checklistReady}>
          add item
        </button>
      </form>
      {ctx.errors.item !== null && <p role="alert" className="error">{`item error: ${ctx.errors.item}`}</p>}
    </aside>
  );
}
