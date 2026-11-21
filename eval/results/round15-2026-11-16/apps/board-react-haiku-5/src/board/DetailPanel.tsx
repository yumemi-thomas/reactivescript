import { useState, type FormEvent } from "react";
import { COLUMN_NAMES, type BoardCard, type Checklist } from "./state";
import type { Column } from "../api.js";

type Props = {
  card: BoardCard | null;
  column: Column;
  checklist: Checklist | null;
  renameError: string | null;
  itemError: string | null;
  onRename: (title: string) => void;
  onArchive: () => void;
  onFlip: (itemId: number, value: boolean) => void;
  onAddItem: (text: string) => void;
};

/** The selected card's detail. The parent keys it by card, so its inputs start empty for each selection. */
export function DetailPanel({ card, column, checklist, renameError, itemError, onRename, onArchive, onFlip, onAddItem }: Props) {
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");

  if (card === null) {
    return (
      <aside className="detail" data-testid="detail">
        <p>select a card</p>
      </aside>
    );
  }

  function submitRename(e: FormEvent) {
    e.preventDefault();
    if (title.trim()) onRename(title);
  }

  function submitItem(e: FormEvent) {
    e.preventDefault();
    const next = text.trim();
    if (!next) return;
    setText("");
    onAddItem(next);
  }

  const cl = checklist;
  return (
    <aside className="detail" data-testid="detail">
      <h2>{`#${card.id} ${card.title}`}</h2>
      <p>{`in ${COLUMN_NAMES[column]}`}</p>

      <form className="inline" onSubmit={submitRename}>
        <input
          data-testid="title-input"
          aria-label="Card title"
          value={title}
          onChange={e => setTitle(e.target.value)}
        />
        <button type="submit" data-testid="rename">
          rename
        </button>
      </form>
      {renameError !== null && <p className="error">{`rename error: ${renameError}`}</p>}

      <button type="button" data-testid="archive" className="danger" onClick={onArchive}>
        archive
      </button>

      <section data-testid="checklist" className="checklist">
        {cl === null ? null : cl.status === "loading" ? (
          <p className="muted">loading checklist</p>
        ) : cl.status === "error" ? (
          <p className="error">{`checklist error: ${cl.message}`}</p>
        ) : (
          <>
            <ul className="items">
              {cl.items.map(item => {
                const itemId = item.id;
                return (
                  <li className="row" key={item.uid}>
                    <span data-testid="item">{`[${item.done ? "x" : " "}] ${item.text}${itemId === null ? " (adding…)" : ""}`}</span>
                    {itemId !== null && (
                      <button type="button" data-testid="toggle" onClick={() => onFlip(itemId, item.done)}>
                        toggle
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
            <p data-testid="progress">{`${cl.items.filter(i => i.done).length}/${cl.items.length} done`}</p>
            <form className="inline" onSubmit={submitItem}>
              <input
                data-testid="item-input"
                aria-label="New checklist item"
                value={text}
                onChange={e => setText(e.target.value)}
              />
              <button type="submit" data-testid="add-item">
                add item
              </button>
            </form>
          </>
        )}
      </section>
      {itemError !== null && <p className="error">{`item error: ${itemError}`}</p>}
    </aside>
  );
}
