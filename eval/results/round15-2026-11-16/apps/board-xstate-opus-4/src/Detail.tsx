import { useSelector } from "@xstate/react";
import { useState, type FormEvent } from "react";
import type { Column } from "./api.js";
import type { BoardActor } from "./BoardPage.js";
import { COLUMN_NAMES, replayItems, type ViewCard } from "./boardModel.js";

type Selected = { card: ViewCard; column: Column } | null;

export function Detail({ actor, selected }: { actor: BoardActor; selected: Selected }) {
  return (
    <aside className="detail" data-testid="detail">
      {selected === null || selected.card.id === null ? (
        <p className="muted">select a card</p>
      ) : (
        <CardDetail actor={actor} card={selected.card} cardId={selected.card.id} column={selected.column} />
      )}
    </aside>
  );
}

function CardDetail({ actor, card, cardId, column }: { actor: BoardActor; card: ViewCard; cardId: number; column: Column }) {
  const renameError = useSelector(actor, s => s.context.renameError);
  const [title, setTitle] = useState("");

  const rename = (e: FormEvent) => {
    e.preventDefault();
    if (title.trim() === "") return;
    actor.send({ type: "rename", title });
  };

  return (
    <>
      <h2>{`#${cardId} ${card.title}`}</h2>
      <p className="muted">{`in ${COLUMN_NAMES[column]}`}</p>
      <form className="rename" onSubmit={rename}>
        <input
          data-testid="title-input"
          aria-label="new title"
          placeholder="New title"
          value={title}
          onChange={e => setTitle(e.target.value)}
        />
        <button type="submit" data-testid="rename">
          rename
        </button>
      </form>
      {renameError !== null && (
        <p className="error" role="alert" data-testid="rename-error">{`rename error: ${renameError}`}</p>
      )}
      <button type="button" className="danger" data-testid="archive" onClick={() => actor.send({ type: "archive" })}>
        archive
      </button>
      <Checklist actor={actor} cardId={cardId} />
    </>
  );
}

function Checklist({ actor, cardId }: { actor: BoardActor; cardId: number }) {
  const status = useSelector(actor, s =>
    s.matches({ detail: "ready" }) ? "ready" : s.matches({ detail: "failed" }) ? "failed" : "loading",
  );
  const checklist = useSelector(actor, s => s.context.checklist);
  const entries = useSelector(actor, s => s.context.entries);
  const checklistError = useSelector(actor, s => s.context.checklistError);
  const itemError = useSelector(actor, s => s.context.itemError);
  const [text, setText] = useState("");

  const items = replayItems(checklist, entries, cardId);
  const done = items.filter(i => i.done).length;

  const addItem = (e: FormEvent) => {
    e.preventDefault();
    if (status !== "ready" || text.trim() === "") return;
    actor.send({ type: "addItem", text });
    setText("");
  };

  return (
    <section className="checklist-wrap">
      <h3>Checklist</h3>
      <div data-testid="checklist" className="checklist">
        {status === "loading" && <p className="muted">loading checklist</p>}
        {status === "failed" && (
          <p className="error">
            {`checklist error: ${checklistError ?? ""}`}{" "}
            <button type="button" data-testid="retry-checklist" onClick={() => actor.send({ type: "retryChecklist" })}>
              retry
            </button>
          </p>
        )}
        {status === "ready" && (
          <>
            <ul className="rows">
              {items.map(item => (
                <li key={item.key} className="row">
                  <span data-testid="item" className={item.done ? "item done" : "item"}>
                    {`${item.done ? "[x]" : "[ ]"} ${item.text}${item.id === null ? " (adding…)" : ""}`}
                  </span>
                  {item.id !== null && (
                    <button
                      type="button"
                      data-testid="toggle"
                      aria-pressed={item.done}
                      onClick={() => item.id !== null && actor.send({ type: "toggle", itemId: item.id })}
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
      </div>
      {itemError !== null && (
        <p className="error" role="alert" data-testid="item-error">{`item error: ${itemError}`}</p>
      )}
      <form className="add-item" onSubmit={addItem}>
        <input
          data-testid="item-input"
          aria-label="new checklist item"
          placeholder="New item"
          value={text}
          onChange={e => setText(e.target.value)}
        />
        <button type="submit" data-testid="add-item" disabled={status !== "ready"}>
          add item
        </button>
      </form>
    </section>
  );
}
