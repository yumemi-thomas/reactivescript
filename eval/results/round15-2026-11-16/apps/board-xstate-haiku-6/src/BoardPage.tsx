import { useMachine } from "@xstate/react";
import { boardMachine, findCard, moveTarget, type BoardContext, type BoardEvent } from "./boardMachine";
import { COLUMNS, COLUMN_NAME, type BoardCard, type Column, type Dir } from "./types";

const DIRS: readonly Dir[] = ["left", "right", "up", "down"];

type Send = (event: BoardEvent) => void;
type ChecklistStatus = "none" | "loading" | "failed" | "loaded";

export default function BoardPage() {
  const [snap, send] = useMachine(boardMachine);
  const ctx = snap.context;
  const selected = ctx.selectedId === null ? undefined : findCard(ctx, ctx.selectedId);
  const checklist: ChecklistStatus = snap.matches({ selection: { card: "loading" } })
    ? "loading"
    : snap.matches({ selection: { card: "failed" } })
      ? "failed"
      : snap.matches({ selection: { card: "loaded" } })
        ? "loaded"
        : "none";

  return (
    <section className="page">
      <div className="columns">
        {COLUMNS.map((column) => (
          <ColumnView key={column} column={column} ctx={ctx} send={send} />
        ))}
      </div>
      {ctx.errors.move && <p className="error" data-testid="move-error">{ctx.errors.move}</p>}
      {ctx.errors.archive && <p className="error" data-testid="archive-error">{ctx.errors.archive}</p>}

      <aside className="detail" data-testid="detail">
        {selected === undefined || ctx.selectedId === null ? (
          <p>select a card</p>
        ) : (
          <>
            <h2>{`#${ctx.selectedId} ${selected.card.title}`}</h2>
            <p>{`in ${COLUMN_NAME[selected.pos.column]}`}</p>
            <div className="row">
              <input
                data-testid="title-input"
                value={ctx.drafts.title}
                onChange={(e) => send({ type: "typeTitle", text: e.target.value })}
              />
              <button data-testid="rename" onClick={() => send({ type: "rename" })}>rename</button>
            </div>
            {ctx.errors.rename && <p className="error">{ctx.errors.rename}</p>}
            <button data-testid="archive" onClick={() => send({ type: "archive" })}>archive</button>

            <Checklist ctx={ctx} send={send} status={checklist} />
            {ctx.errors.item && <p className="error">{ctx.errors.item}</p>}
            <div className="row">
              <input
                data-testid="item-input"
                value={ctx.drafts.item}
                onChange={(e) => send({ type: "typeItem", text: e.target.value })}
              />
              <button data-testid="add-item" disabled={checklist !== "loaded"} onClick={() => send({ type: "addItem" })}>
                add item
              </button>
            </div>
          </>
        )}
      </aside>
    </section>
  );
}

function ColumnView({ column, ctx, send }: { column: Column; ctx: BoardContext; send: Send }) {
  const load = ctx.loads[column];
  const cards = ctx.columns[column];
  const heading = load.status === "loaded" ? `${COLUMN_NAME[column]} (${cards.length})` : COLUMN_NAME[column];

  return (
    <section className="column" data-testid={`col-${column}`}>
      <h2 data-testid={`head-${column}`}>{heading}</h2>
      {load.status === "loading" && <p>loading</p>}
      {load.status === "failed" && (
        <>
          <p className="error">{`error: ${load.message}`}</p>
          <button data-testid={`retry-${column}`} onClick={() => send({ type: "retry", column })}>retry</button>
        </>
      )}
      {load.status === "loaded" && (
        <ul className="cards">
          {cards.map((card, index) => (
            <CardRow key={card.key} ctx={ctx} send={send} column={column} index={index} card={card} />
          ))}
        </ul>
      )}
      {column === "todo" && (
        <div className="add">
          <input
            data-testid="new-card"
            placeholder="New card"
            value={ctx.drafts.newCard}
            onChange={(e) => send({ type: "typeNewCard", text: e.target.value })}
          />
          <button data-testid="add-card" disabled={load.status !== "loaded"} onClick={() => send({ type: "addCard" })}>
            add
          </button>
          {ctx.errors.add && <p className="error" data-testid="add-error">{ctx.errors.add}</p>}
        </div>
      )}
    </section>
  );
}

function CardRow({ ctx, send, column, index, card }: { ctx: BoardContext; send: Send; column: Column; index: number; card: BoardCard }) {
  if (card.id === undefined) {
    return (
      <li className="card-row">
        <span data-testid="card" className="card pending">{`${card.title} (adding…)`}</span>
      </li>
    );
  }
  const id = card.id;
  const selected = ctx.selectedId === id;
  return (
    <li className="card-row">
      <button
        data-testid="card"
        className={selected ? "card selected" : "card"}
        aria-pressed={selected}
        onClick={() => send({ type: "select", id })}
      >
        {`#${id} ${card.title} · ${card.done}/${card.total}`}
      </button>
      {DIRS.map((dir) => {
        const target = moveTarget(ctx, { column, index }, dir);
        if (!target) return null;
        return (
          <button
            key={dir}
            data-testid={dir}
            disabled={target.disabled}
            onClick={() => send({ type: "move", id, dir })}
          >
            {dir}
          </button>
        );
      })}
    </li>
  );
}

function Checklist({ ctx, send, status }: { ctx: BoardContext; send: Send; status: ChecklistStatus }) {
  const done = ctx.items.filter((i) => i.done).length;
  return (
    <>
      <section data-testid="checklist">
        {status === "loading" && <p>loading checklist</p>}
        {status === "failed" && <p className="error">{`checklist error: ${ctx.checklistError}`}</p>}
        {status === "loaded" && (
          <ul>
            {ctx.items.map((item) => (
              <li key={item.key} className="item-row">
                <span data-testid="item">
                  {item.id === undefined ? `[ ] ${item.text} (adding…)` : `${item.done ? "[x]" : "[ ]"} ${item.text}`}
                </span>
                {item.id !== undefined && (
                  <button data-testid="toggle" onClick={() => send({ type: "toggle", key: item.key })}>toggle</button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
      {status === "loaded" && <p data-testid="progress">{`${done}/${ctx.items.length} done`}</p>}
    </>
  );
}
