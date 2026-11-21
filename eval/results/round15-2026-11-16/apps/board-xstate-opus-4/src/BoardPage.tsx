import { useSelector } from "@xstate/react";
import { useState, type FormEvent, type ReactNode } from "react";
import type { ActorRefFrom } from "xstate";
import type { Column } from "./api.js";
import type { boardMachine } from "./boardMachine.js";
import { COLUMNS } from "./requests.js";
import { COLUMN_NAMES, deriveColumns, findCard, moveButtons, type Columns, type ViewCard } from "./boardModel.js";
import { Detail } from "./Detail.js";

export type BoardActor = ActorRefFrom<typeof boardMachine>;

const cardText = (card: ViewCard) =>
  card.id === null ? `${card.title} (adding…)` : `#${card.id} ${card.title} · ${card.done}/${card.total}`;

export function BoardPage({ actor }: { actor: BoardActor }) {
  const snapshot = useSelector(actor, s => s);
  const { context } = snapshot;
  const columns = deriveColumns(context.base, context.entries, context.baselines);
  const selected = context.selectedId === null ? null : findCard(columns, context.selectedId);

  return (
    <section className="board-page">
      <div className="notices">
        {context.moveError !== null && (
          <p className="error" role="alert" data-testid="move-error">{`move error: ${context.moveError}`}</p>
        )}
        {context.archiveError !== null && (
          <p className="error" role="alert" data-testid="archive-error">{`archive error: ${context.archiveError}`}</p>
        )}
      </div>
      <div className="board">
        <div className="columns">
          {COLUMNS.map(column => (
            <ColumnView
              key={column}
              actor={actor}
              column={column}
              columns={columns}
              status={snapshot.matches({ [column]: "ready" }) ? "ready" : snapshot.matches({ [column]: "failed" }) ? "failed" : "loading"}
              error={context.columnError[column]}
              selectedId={context.selectedId}
              footer={
                column === "todo" ? (
                  <AddCard actor={actor} enabled={columns.todo !== null} error={context.addError} />
                ) : null
              }
            />
          ))}
        </div>
        <Detail
          key={selected ? selected.card.id : "none"}
          actor={actor}
          selected={selected}
        />
      </div>
    </section>
  );
}

function ColumnView({
  actor,
  column,
  columns,
  status,
  error,
  selectedId,
  footer,
}: {
  actor: BoardActor;
  column: Column;
  columns: Columns;
  status: "loading" | "failed" | "ready";
  error: string | null;
  selectedId: number | null;
  footer: ReactNode;
}) {
  const cards = columns[column];
  const name = COLUMN_NAMES[column];
  return (
    <section className="column" data-testid={`col-${column}`} aria-label={name}>
      <h2 data-testid={`head-${column}`}>{status === "ready" && cards ? `${name} (${cards.length})` : name}</h2>
      {status === "loading" && <p className="muted">loading</p>}
      {status === "failed" && (
        <div className="error">
          <span>{`error: ${error ?? ""}`}</span>{" "}
          <button type="button" data-testid={`retry-${column}`} onClick={() => actor.send({ type: "retry", column })}>
            retry
          </button>
        </div>
      )}
      {status === "ready" && cards && (
        <ul className="cards">
          {cards.map((card, index) => (
            <li key={card.key} className={card.id !== null && card.id === selectedId ? "card-row selected" : "card-row"}>
              {card.id === null ? (
                <span className="card pending" data-testid="card">
                  {cardText(card)}
                </span>
              ) : (
                <button
                  type="button"
                  className="card"
                  data-testid="card"
                  aria-pressed={card.id === selectedId}
                  onClick={() => card.id !== null && actor.send({ type: "select", id: card.id })}
                >
                  {cardText(card)}
                </button>
              )}
              {card.id !== null && (
                <span className="moves">
                  {moveButtons(columns, column, index).map(({ dir, disabled }) => (
                    <button
                      key={dir}
                      type="button"
                      data-testid={dir}
                      aria-label={`move ${dir}`}
                      disabled={disabled}
                      onClick={() => card.id !== null && actor.send({ type: "move", id: card.id, dir })}
                    >
                      {dir}
                    </button>
                  ))}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      {footer}
    </section>
  );
}

function AddCard({ actor, enabled, error }: { actor: BoardActor; enabled: boolean; error: string | null }) {
  const [title, setTitle] = useState("");
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!enabled || title.trim() === "") return;
    actor.send({ type: "addCard", title });
    setTitle("");
  };
  return (
    <form className="add-card" onSubmit={submit}>
      <input
        data-testid="new-card"
        aria-label="new card title"
        placeholder="New card"
        value={title}
        onChange={e => setTitle(e.target.value)}
      />
      <button type="submit" data-testid="add-card" disabled={!enabled}>
        add
      </button>
      {error !== null && (
        <p className="error" role="alert" data-testid="add-error">{`add error: ${error}`}</p>
      )}
    </form>
  );
}
