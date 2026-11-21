import { useEffect, useState } from "react";
import type { Dispatch, FormEvent } from "react";
import { addItem, fetchChecklist, renameCard, toggleItem } from "./api.js";
import type { Column, Item } from "./api.js";
import { COLUMN_NAME, errorMessage, newKey } from "./boardState";
import type { Action, BoardCard } from "./boardState";

type CheckItem = { key: string; id: number | null; text: string; done: boolean };

type Checklist =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ok"; items: CheckItem[] };

type Props = {
  id: number;
  card: BoardCard;
  column: Column;
  dispatch: Dispatch<Action>;
  onArchive: (id: number) => void;
};

function toCheckItem(item: Item): CheckItem {
  return { key: `item-${item.id}`, id: item.id, text: item.text, done: item.done };
}

/** The selected card's detail. The board page renders it keyed by card id, so its inputs and errors reset on selection. */
export default function DetailPanel({ id, card, column, dispatch, onArchive }: Props) {
  const [checklist, setChecklist] = useState<Checklist>({ status: "loading" });
  const [renameInput, setRenameInput] = useState("");
  const [renameError, setRenameError] = useState<string | null>(null);
  const [itemInput, setItemInput] = useState("");
  const [itemError, setItemError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetchChecklist(id).then(
      items => {
        if (active) setChecklist({ status: "ok", items: items.map(toCheckItem) });
      },
      error => {
        if (active) setChecklist({ status: "error", message: errorMessage(error) });
      },
    );
    return () => {
      active = false;
    };
  }, [id]);

  const updateItems = (update: (items: CheckItem[]) => CheckItem[]) =>
    setChecklist(prev => (prev.status === "ok" ? { status: "ok", items: update(prev.items) } : prev));

  const onRename = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const title = renameInput.trim();
    if (title === "") return;
    const previous = card.title;
    setRenameInput("");
    setRenameError(null);
    dispatch({ type: "rename", id, title });
    renameCard(id, title).catch(error => {
      dispatch({ type: "rename", id, title: previous });
      setRenameError(`rename error: ${errorMessage(error)}`);
    });
  };

  const onToggle = (item: CheckItem) => {
    if (item.id === null) return;
    const itemId = item.id;
    const next = !item.done;
    setItemError(null);
    updateItems(items => items.map(i => (i.id === itemId ? { ...i, done: next } : i)));
    dispatch({ type: "adjust", id, dDone: next ? 1 : -1, dTotal: 0 });
    toggleItem(id, itemId, next).catch(error => {
      updateItems(items => items.map(i => (i.id === itemId ? { ...i, done: item.done } : i)));
      dispatch({ type: "adjust", id, dDone: next ? -1 : 1, dTotal: 0 });
      setItemError(`item error: ${errorMessage(error)}`);
    });
  };

  const onAddItem = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const text = itemInput.trim();
    if (text === "" || checklist.status !== "ok") return;
    const key = newKey("new-item");
    setItemInput("");
    setItemError(null);
    updateItems(items => [...items, { key, id: null, text, done: false }]);
    dispatch({ type: "adjust", id, dDone: 0, dTotal: 1 });
    addItem(id, text).then(
      created =>
        updateItems(items =>
          items.map(i => (i.key === key ? { ...i, id: created.id, text: created.text, done: created.done } : i)),
        ),
      error => {
        updateItems(items => items.filter(i => i.key !== key));
        dispatch({ type: "adjust", id, dDone: 0, dTotal: -1 });
        setItemError(`item error: ${errorMessage(error)}`);
      },
    );
  };

  const ready = checklist.status === "ok";
  const items = checklist.status === "ok" ? checklist.items : [];
  const doneCount = items.filter(item => item.done).length;

  return (
    <>
      <h2 className="detail-title">{`#${id} ${card.title}`}</h2>
      <p className="muted">{`in ${COLUMN_NAME[column]}`}</p>

      <form className="inline-form" onSubmit={onRename}>
        <input
          data-testid="title-input"
          aria-label="New title"
          value={renameInput}
          onChange={event => setRenameInput(event.target.value)}
        />
        <button type="submit" data-testid="rename">
          rename
        </button>
      </form>
      {renameError && (
        <p role="alert" className="error" data-testid="rename-error">
          {renameError}
        </p>
      )}

      <p>
        <button type="button" className="danger" data-testid="archive" onClick={() => onArchive(id)}>
          archive
        </button>
      </p>

      <h3>Checklist</h3>
      <div data-testid="checklist">
        {checklist.status === "loading" && <p className="muted">loading checklist</p>}
        {checklist.status === "error" && (
          <p role="alert" className="error">
            {`checklist error: ${checklist.message}`}
          </p>
        )}
        {checklist.status === "ok" && (
          <ul className="list-plain">
            {checklist.items.map(item => (
              <li key={item.key} className="check-row">
                <span data-testid="item">
                  {item.id === null
                    ? `[ ] ${item.text} (adding…)`
                    : `${item.done ? "[x]" : "[ ]"} ${item.text}`}
                </span>
                {item.id !== null && (
                  <button type="button" data-testid="toggle" onClick={() => onToggle(item)}>
                    toggle
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
      {ready && <p data-testid="progress">{`${doneCount}/${items.length} done`}</p>}

      <form className="inline-form" onSubmit={onAddItem}>
        <input
          data-testid="item-input"
          aria-label="New checklist item"
          value={itemInput}
          onChange={event => setItemInput(event.target.value)}
        />
        <button type="submit" data-testid="add-item" disabled={!ready}>
          add item
        </button>
      </form>
      {itemError && (
        <p role="alert" className="error" data-testid="item-error">
          {itemError}
        </p>
      )}
    </>
  );
}
