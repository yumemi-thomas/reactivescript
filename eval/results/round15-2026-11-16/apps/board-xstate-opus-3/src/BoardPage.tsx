import { useSelector } from "@xstate/react";
import type { ActorRefFrom } from "xstate";
import type { Column } from "./api";
import { type BoardContext, type boardMachine, columnsReady, shown } from "./boardMachine";
import { COLUMNS, COLUMN_NAMES, DIRS, type BoardData, findCard, moveOption } from "./model";

type BoardRef = ActorRefFrom<typeof boardMachine>;

export function BoardPage({ actor }: { actor: BoardRef }) {
  const context = useSelector(actor, s => s.context);
  const checklistState = useSelector(actor, s =>
    s.matches({ detail: "loading" }) ? "loading" : s.matches({ detail: "failed" }) ? "failed" : "ready",
  );
  const data = shown(context);
  const ready = columnsReady(context);

  return (
    <main className="board-page">
      <div className="notices" aria-live="polite">
        {context.moveError !== null && (
          <p className="error" data-testid="move-error">move error: {context.moveError}</p>
        )}
        {context.archiveError !== null && (
          <p className="error" data-testid="archive-error">archive error: {context.archiveError}</p>
        )}
      </div>
      <div className="columns">
        {COLUMNS.map(column => (
          <ColumnView key={column} actor={actor} context={context} data={data} ready={ready} column={column} />
        ))}
      </div>
      <Detail actor={actor} context={context} data={data} checklistState={checklistState} />
    </main>
  );
}

function ColumnView({
  actor,
  context,
  data,
  ready,
  column,
}: {
  actor: BoardRef;
  context: BoardContext;
  data: BoardData;
  ready: Record<Column, boolean>;
  column: Column;
}) {
  const status = context.colStatus[column];
  const cards = data.cols[column];
  return (
    <section className="column" data-testid={`col-${column}`} aria-labelledby={`head-${column}`}>
      <h2 id={`head-${column}`} data-testid={`head-${column}`}>
        {status === "ready" ? `${COLUMN_NAMES[column]} (${cards.length})` : COLUMN_NAMES[column]}
      </h2>
      {status === "loading" && <p className="muted">loading</p>}
      {status === "failed" && (
        <div className="error">
          <span>error: {context.colError[column]}</span>{" "}
          <button type="button" data-testid={`retry-${column}`} onClick={() => actor.send({ type: "retry", column })}>
            retry
          </button>
        </div>
      )}
      {status === "ready" && (
        <ul className="cards">
          {cards.map((card, index) => (
            <li key={card.key} className={card.id === context.selectedId && !card.pending ? "selected" : undefined}>
              <button
                type="button"
                className="card"
                data-testid="card"
                disabled={card.pending}
                aria-pressed={!card.pending && card.id === context.selectedId}
                onClick={() => actor.send({ type: "select", cardId: card.id })}
              >
                {card.pending ? `${card.title} (adding…)` : `#${card.id} ${card.title} · ${card.done}/${card.total}`}
              </button>
              {!card.pending && (
                <span className="moves">
                  {DIRS.map(dir => {
                    const opt = moveOption(data, ready, column, index, dir);
                    if (opt.kind === "hidden") return null;
                    return (
                      <button
                        key={dir}
                        type="button"
                        data-testid={dir}
                        disabled={opt.kind === "disabled"}
                        onClick={() => actor.send({ type: "move", cardId: card.id, dir })}
                      >
                        {dir}
                      </button>
                    );
                  })}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      {column === "todo" && (
        <form
          className="add"
          onSubmit={e => {
            e.preventDefault();
            actor.send({ type: "addCard" });
          }}
        >
          <input
            data-testid="new-card"
            aria-label="New card title"
            placeholder="New card"
            value={context.newCard}
            onChange={e => actor.send({ type: "newCard.change", value: e.target.value })}
          />
          <button type="submit" data-testid="add-card">add</button>
          {context.addError !== null && (
            <p className="error" data-testid="add-error">add error: {context.addError}</p>
          )}
        </form>
      )}
    </section>
  );
}

function Detail({
  actor,
  context,
  data,
  checklistState,
}: {
  actor: BoardRef;
  context: BoardContext;
  data: BoardData;
  checklistState: "loading" | "failed" | "ready";
}) {
  const at = context.selectedId === null ? null : findCard(data, context.selectedId);
  if (!at) {
    return (
      <aside className="detail" data-testid="detail">
        <p className="muted">select a card</p>
      </aside>
    );
  }
  const { card, column } = at;
  const items = data.items[card.id] ?? [];
  const doneCount = items.filter(i => i.done).length;
  const renameError = context.renameError?.cardId === card.id ? context.renameError.message : null;
  const itemError = context.itemError?.cardId === card.id ? context.itemError.message : null;

  return (
    <aside className="detail" data-testid="detail">
      <h2>#{card.id} {card.title}</h2>
      <p className="muted">in {COLUMN_NAMES[column]}</p>
      <form
        className="row"
        onSubmit={e => {
          e.preventDefault();
          actor.send({ type: "rename" });
        }}
      >
        <input
          data-testid="title-input"
          aria-label="New title"
          placeholder="New title"
          value={context.titleInput}
          onChange={e => actor.send({ type: "title.change", value: e.target.value })}
        />
        <button type="submit" data-testid="rename">rename</button>
        <button type="button" data-testid="archive" onClick={() => actor.send({ type: "archive" })}>
          archive
        </button>
      </form>
      {renameError !== null && <p className="error">rename error: {renameError}</p>}

      <div className="checklist" data-testid="checklist">
        {checklistState === "loading" && <p className="muted">loading checklist</p>}
        {checklistState === "failed" && (
          <p className="error">
            checklist error: {context.checklistError}{" "}
            <button type="button" onClick={() => actor.send({ type: "checklist.retry" })}>retry</button>
          </p>
        )}
        {checklistState === "ready" && (
          <>
            <ul className="items">
              {items.map(item => (
                <li key={item.key}>
                  <span data-testid="item">
                    {item.done ? "[x]" : "[ ]"} {item.text}
                    {item.pending ? " (adding…)" : ""}
                  </span>
                  {!item.pending && (
                    <button
                      type="button"
                      data-testid="toggle"
                      onClick={() => actor.send({ type: "toggle", itemId: item.id })}
                    >
                      toggle
                    </button>
                  )}
                </li>
              ))}
            </ul>
            <p data-testid="progress">{doneCount}/{items.length} done</p>
          </>
        )}
      </div>
      <form
        className="row"
        onSubmit={e => {
          e.preventDefault();
          actor.send({ type: "addItem" });
        }}
      >
        <input
          data-testid="item-input"
          aria-label="New checklist item"
          placeholder="New item"
          value={context.itemInput}
          onChange={e => actor.send({ type: "item.change", value: e.target.value })}
        />
        <button type="submit" data-testid="add-item">add item</button>
      </form>
      {itemError !== null && <p className="error">item error: {itemError}</p>}
    </aside>
  );
}
