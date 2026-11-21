import { useSelector } from "@xstate/react";
import { useMemo } from "react";
import type { ActorRefFrom } from "xstate";
import type { Column } from "../api";
import type { boardMachine, BoardContext } from "./boardMachine";
import {
  COLUMN_NAMES,
  COLUMNS,
  findCard,
  moveAllowed,
  moveTarget,
  shown,
  type BoardData,
  type Direction,
  type ShownCard,
} from "./model";

type BoardActor = ActorRefFrom<typeof boardMachine>;

const DIRECTIONS: Direction[] = ["left", "right", "up", "down"];

export function BoardPage({ actor }: { actor: BoardActor }) {
  const context = useSelector(actor, s => s.context);
  const checklistState = useSelector(actor, s =>
    s.matches({ detail: { selected: "loading" } })
      ? "loading"
      : s.matches({ detail: { selected: "failed" } })
        ? "failed"
        : "ready",
  );
  const view = useMemo(() => shown(context.data, context.ops), [context.data, context.ops]);

  return (
    <div className="board-page">
      <div className="errors">
        {context.errors.move && (
          <p className="error" role="alert" data-testid="move-error">
            {context.errors.move}
          </p>
        )}
        {context.errors.archive && (
          <p className="error" role="alert" data-testid="archive-error">
            {context.errors.archive}
          </p>
        )}
      </div>
      <div className="board">
        <div className="columns">
          {COLUMNS.map(column => (
            <ColumnView key={column} column={column} context={context} view={view} actor={actor} />
          ))}
        </div>
        <Detail actor={actor} context={context} view={view} checklistState={checklistState} />
      </div>
    </div>
  );
}

function ColumnView({
  column,
  context,
  view,
  actor,
}: {
  column: Column;
  context: BoardContext;
  view: BoardData;
  actor: BoardActor;
}) {
  const status = context.status[column];
  const cards = view.cols[column];
  const name = COLUMN_NAMES[column];

  return (
    <section className="column" data-testid={`col-${column}`} aria-busy={status === "loading"}>
      <h2 data-testid={`head-${column}`}>{status === "ready" ? `${name} (${cards.length})` : name}</h2>
      {status === "loading" && <p className="muted">loading</p>}
      {status === "error" && (
        <p className="error" role="alert">
          {`error: ${context.loadError[column] ?? ""}`}{" "}
          <button type="button" data-testid={`retry-${column}`} onClick={() => actor.send({ type: "retry", column })}>
            retry
          </button>
        </p>
      )}
      {status === "ready" && (
        <ul className="cards">
          {cards.map(card => (
            <CardRow
              key={card.key}
              card={card}
              selected={card.id !== null && card.id === context.selectedId}
              context={context}
              view={view}
              actor={actor}
            />
          ))}
        </ul>
      )}
      {column === "todo" && (
        <form
          className="add-card"
          onSubmit={e => {
            e.preventDefault();
            actor.send({ type: "addCard" });
          }}
        >
          <input
            data-testid="new-card"
            aria-label="New card title"
            placeholder="New card"
            value={context.drafts.newCard}
            onChange={e => actor.send({ type: "draft", field: "newCard", value: e.target.value })}
          />
          <button type="submit" data-testid="add-card">
            add
          </button>
          {context.errors.add && (
            <p className="error" role="alert" data-testid="add-error">
              {context.errors.add}
            </p>
          )}
        </form>
      )}
    </section>
  );
}

function CardRow({
  card,
  selected,
  context,
  view,
  actor,
}: {
  card: ShownCard;
  selected: boolean;
  context: BoardContext;
  view: BoardData;
  actor: BoardActor;
}) {
  const id = card.id;
  if (id === null || card.adding) {
    return (
      <li className="card-row adding">
        <span className="card" data-testid="card">{`${card.title} (adding…)`}</span>
      </li>
    );
  }
  return (
    <li className={selected ? "card-row selected" : "card-row"}>
      <span
        className="card"
        data-testid="card"
        role="button"
        tabIndex={0}
        aria-pressed={selected}
        onClick={() => actor.send({ type: "select", id })}
        onKeyDown={e => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            actor.send({ type: "select", id });
          }
        }}
      >{`#${id} ${card.title} · ${card.done}/${card.total}`}</span>
      {DIRECTIONS.filter(dir => moveTarget(view, id, dir) !== null).map(dir => (
          <button
            key={dir}
            type="button"
            data-testid={dir}
            disabled={!moveAllowed(view, context.status, id, dir)}
            onClick={() => actor.send({ type: "move", id, dir })}
          >
            {dir}
          </button>
        ))}
    </li>
  );
}

function Detail({
  actor,
  context,
  view,
  checklistState,
}: {
  actor: BoardActor;
  context: BoardContext;
  view: BoardData;
  checklistState: "loading" | "failed" | "ready";
}) {
  const at = context.selectedId === null ? null : findCard(view, context.selectedId);
  if (!at || at.card.id === null) {
    return (
      <aside className="detail" data-testid="detail">
        <p className="muted">select a card</p>
      </aside>
    );
  }
  const card = at.card;
  const checklist = view.checklist?.cardId === card.id ? view.checklist : null;
  const items = checklist?.items ?? [];
  const doneCount = items.filter(i => i.done).length;

  return (
    <aside className="detail" data-testid="detail">
      <h2>{`#${card.id} ${card.title}`}</h2>
      <p className="muted">{`in ${COLUMN_NAMES[at.column]}`}</p>

      <form
        className="inline"
        onSubmit={e => {
          e.preventDefault();
          actor.send({ type: "rename" });
        }}
      >
        <input
          data-testid="title-input"
          aria-label="New title"
          placeholder="New title"
          value={context.drafts.title}
          onChange={e => actor.send({ type: "draft", field: "title", value: e.target.value })}
        />
        <button type="submit" data-testid="rename">
          rename
        </button>
      </form>
      {context.errors.rename && (
        <p className="error" role="alert">
          {context.errors.rename}
        </p>
      )}
      <button type="button" className="danger" data-testid="archive" onClick={() => actor.send({ type: "archive" })}>
        archive
      </button>

      <h3>Checklist</h3>
      <div data-testid="checklist">
        {checklistState === "loading" && <p className="muted">loading checklist</p>}
        {checklistState === "failed" && (
          <p className="error" role="alert">
            {`checklist error: ${context.checklistError ?? ""}`}{" "}
            <button type="button" data-testid="retry-checklist" onClick={() => actor.send({ type: "retryChecklist" })}>
              retry
            </button>
          </p>
        )}
        {checklistState === "ready" && checklist && (
          <>
            <ul className="items">
              {items.map(item => (
                <li key={item.key} className="item-row">
                  <span data-testid="item">
                    {`${item.done ? "[x]" : "[ ]"} ${item.text}${item.adding ? " (adding…)" : ""}`}
                  </span>
                  {item.id !== null && !item.adding && (
                    <button
                      type="button"
                      data-testid="toggle"
                      onClick={() => item.id !== null && actor.send({ type: "toggle", itemId: item.id })}
                    >
                      toggle
                    </button>
                  )}
                </li>
              ))}
            </ul>
            <p data-testid="progress">{`${doneCount}/${items.length} done`}</p>
          </>
        )}
      </div>
      <form
        className="inline"
        onSubmit={e => {
          e.preventDefault();
          actor.send({ type: "addItem" });
        }}
      >
        <input
          data-testid="item-input"
          aria-label="New checklist item"
          placeholder="New item"
          value={context.drafts.item}
          onChange={e => actor.send({ type: "draft", field: "item", value: e.target.value })}
        />
        <button type="submit" data-testid="add-item">
          add item
        </button>
      </form>
      {context.errors.item && (
        <p className="error" role="alert">
          {context.errors.item}
        </p>
      )}
    </aside>
  );
}
