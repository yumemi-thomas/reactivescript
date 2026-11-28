import { useMachine } from "@xstate/react";
import { boardMachine, type BoardContext, type BoardEvent } from "./boardMachine";
import {
  COLUMNS,
  COLUMN_NAME,
  findCard,
  moveOption,
  type CardView,
  type Column,
  type ItemView,
  type MoveDir,
  type Place,
} from "./model";

type Send = (event: BoardEvent) => void;
type ChecklistState = "loading" | "loaded" | "failed";

const DIRS: readonly MoveDir[] = ["left", "right", "up", "down"];

export function BoardPage() {
  const [snap, send] = useMachine(boardMachine);
  const ctx = snap.context;
  const checklist: ChecklistState | null = snap.matches({ selected: "loadingChecklist" })
    ? "loading"
    : snap.matches({ selected: "loaded" })
      ? "loaded"
      : snap.matches({ selected: "failed" })
        ? "failed"
        : null;

  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-start" }}>
        {COLUMNS.map((column) => (
          <BoardColumn key={column} column={column} ctx={ctx} send={send} />
        ))}
        <Detail ctx={ctx} checklist={checklist} send={send} />
      </div>
      {ctx.moveError && <p data-testid="move-error">{ctx.moveError}</p>}
      {ctx.archiveError && <p data-testid="archive-error">{ctx.archiveError}</p>}
    </div>
  );
}

function BoardColumn({ column, ctx, send }: { column: Column; ctx: BoardContext; send: Send }) {
  const view = ctx.columns[column];
  const heading = view.status === "loaded" ? `${COLUMN_NAME[column]} (${view.cards.length})` : COLUMN_NAME[column];
  return (
    <section data-testid={`col-${column}`} style={{ flex: "1 1 220px", minWidth: 200 }}>
      <h2 data-testid={`head-${column}`}>{heading}</h2>
      {view.status === "loading" && <p>loading</p>}
      {view.status === "failed" && (
        <p>
          {`error: ${view.error}`}{" "}
          <button type="button" data-testid={`retry-${column}`} onClick={() => send({ type: "retry", column })}>
            retry
          </button>
        </p>
      )}
      {view.status === "loaded" && (
        <ul>
          {view.cards.map((card, index) => (
            <CardRow key={card.key} card={card} place={{ column, index }} ctx={ctx} send={send} />
          ))}
        </ul>
      )}
      {column === "todo" && <AddCard ctx={ctx} send={send} />}
    </section>
  );
}

function CardRow({ card, place, ctx, send }: { card: CardView; place: Place; ctx: BoardContext; send: Send }) {
  const id = card.id;
  const label = id === null ? `${card.title} (adding…)` : `#${id} ${card.title} · ${card.done}/${card.total}`;
  return (
    <li>
      <span
        data-testid="card"
        style={{ cursor: id === null ? "default" : "pointer" }}
        onClick={id === null ? undefined : () => send({ type: "select", id })}
      >
        {label}
      </span>{" "}
      {id !== null &&
        DIRS.map((dir) => {
          const option = moveOption(ctx.columns, place, dir);
          if (!option) return null;
          return (
            <button
              key={dir}
              type="button"
              data-testid={dir}
              disabled={option.disabled}
              onClick={() => send({ type: "move", id, dir })}
            >
              {dir}
            </button>
          );
        })}
    </li>
  );
}

function AddCard({ ctx, send }: { ctx: BoardContext; send: Send }) {
  return (
    <div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          send({ type: "addCard" });
        }}
      >
        <input
          data-testid="new-card"
          aria-label="New card title"
          value={ctx.drafts.newCard}
          onChange={(event) => send({ type: "draft", field: "newCard", value: event.target.value })}
        />{" "}
        <button type="submit" data-testid="add-card">
          add
        </button>
      </form>
      {ctx.addError && <p data-testid="add-error">{ctx.addError}</p>}
    </div>
  );
}

function Detail({ ctx, checklist, send }: { ctx: BoardContext; checklist: ChecklistState | null; send: Send }) {
  const selectedId = ctx.selectedId;
  const found = selectedId === null ? null : findCard(ctx.columns, selectedId);
  if (selectedId === null || !found) {
    return (
      <section data-testid="detail" style={{ flex: "1 1 260px", minWidth: 240 }}>
        <p>select a card</p>
      </section>
    );
  }
  return (
    <section data-testid="detail" style={{ flex: "1 1 260px", minWidth: 240 }}>
      <h2>{`#${selectedId} ${found.card.title}`}</h2>
      <p>{`in ${COLUMN_NAME[found.column]}`}</p>
      <div>
        <input
          data-testid="title-input"
          aria-label="Card title"
          value={ctx.drafts.rename}
          onChange={(event) => send({ type: "draft", field: "rename", value: event.target.value })}
        />{" "}
        <button type="button" data-testid="rename" onClick={() => send({ type: "rename" })}>
          rename
        </button>
      </div>
      {ctx.renameError?.cardId === selectedId && <p>{ctx.renameError.message}</p>}
      <p>
        <button type="button" data-testid="archive" onClick={() => send({ type: "archive" })}>
          archive
        </button>
      </p>
      <div data-testid="checklist">
        {checklist === "loading" && <p>loading checklist</p>}
        {checklist === "failed" && <p>{`checklist error: ${ctx.checklist.error}`}</p>}
        {checklist === "loaded" && <Checklist items={ctx.checklist.items} send={send} />}
      </div>
      <div>
        <input
          data-testid="item-input"
          aria-label="New checklist item"
          value={ctx.drafts.item}
          onChange={(event) => send({ type: "draft", field: "item", value: event.target.value })}
        />{" "}
        <button type="button" data-testid="add-item" onClick={() => send({ type: "addItem" })}>
          add item
        </button>
      </div>
      {ctx.itemError?.cardId === selectedId && <p>{ctx.itemError.message}</p>}
    </section>
  );
}

function Checklist({ items, send }: { items: ItemView[]; send: Send }) {
  const done = items.filter((item) => item.done).length;
  return (
    <div>
      <ul>
        {items.map((item) => (
          <ChecklistRow key={item.key} item={item} send={send} />
        ))}
      </ul>
      <p data-testid="progress">{`${done}/${items.length} done`}</p>
    </div>
  );
}

function ChecklistRow({ item, send }: { item: ItemView; send: Send }) {
  const id = item.id;
  const mark = item.done ? "[x]" : "[ ]";
  return (
    <li>
      <span data-testid="item">{`${mark} ${item.text}${id === null ? " (adding…)" : ""}`}</span>{" "}
      {id !== null && (
        <button type="button" data-testid="toggle" onClick={() => send({ type: "toggleItem", itemId: id })}>
          toggle
        </button>
      )}
    </li>
  );
}
