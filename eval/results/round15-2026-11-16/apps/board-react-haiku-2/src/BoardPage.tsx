import { useEffect, useReducer, useState, type Dispatch } from "react";
import {
  addCard,
  addItem,
  archiveCard,
  fetchCards,
  fetchChecklist,
  moveCard,
  renameCard,
  toggleItem,
  type Column,
} from "./api.js";
import {
  boardReducer,
  findCard,
  initialBoard,
  movesFor,
  type Action,
  type BoardErrorKey,
  type Move,
  type UiCard,
  type UiItem,
} from "./boardState";
import { COLUMN_NAMES, COLUMNS, messageOf, nextKey } from "./shared";

const ERROR_LABEL: Record<BoardErrorKey, string> = {
  move: "move error",
  add: "add error",
  archive: "archive error",
  rename: "rename error",
  item: "item error",
};

/** Fetches one column; the reducer shows the result. */
function loadColumn(column: Column, dispatch: Dispatch<Action>) {
  fetchCards(column).then(
    cards => dispatch({ type: "columnLoaded", column, cards }),
    err => dispatch({ type: "columnFailed", column, message: messageOf(err) }),
  );
}

export default function BoardPage() {
  const [state, dispatch] = useReducer(boardReducer, initialBoard);
  const [newCard, setNewCard] = useState("");
  const [titleInput, setTitleInput] = useState("");
  const [itemInput, setItemInput] = useState("");

  useEffect(() => {
    for (const column of COLUMNS) loadColumn(column, dispatch);
  }, []);

  const selectedId = state.selectedId;
  const selected = selectedId === null ? undefined : findCard(state, selectedId);
  const checklist = selectedId === null ? undefined : state.checklists[selectedId];
  const items = checklist?.status === "ok" ? checklist.items : undefined;
  const todoReady = state.columns.todo.status === "ok";

  function retry(column: Column) {
    dispatch({ type: "columnLoading", column });
    loadColumn(column, dispatch);
  }

  function selectCard(id: number) {
    if (id === state.selectedId) return;
    setTitleInput("");
    dispatch({ type: "select", id });
    fetchChecklist(id).then(
      list => dispatch({ type: "checklistLoaded", id, items: list }),
      err => dispatch({ type: "checklistFailed", id, message: messageOf(err) }),
    );
  }

  function moveTo(id: number, from: { column: Column; index: number }, m: Move) {
    dispatch({ type: "setError", key: "move", message: undefined });
    dispatch({ type: "place", id, column: m.column, index: m.index });
    moveCard(id, m.column, m.index).catch((err: unknown) => {
      dispatch({ type: "place", id, column: from.column, index: from.index });
      dispatch({ type: "setError", key: "move", message: messageOf(err) });
    });
  }

  function submitCard() {
    const title = newCard.trim();
    if (!title || !todoReady) return;
    const key = nextKey("p");
    setNewCard("");
    dispatch({ type: "setError", key: "add", message: undefined });
    dispatch({ type: "addPending", key, title });
    addCard("todo", title).then(
      card => dispatch({ type: "addResolved", key, id: card.id }),
      err => {
        dispatch({ type: "removePending", key });
        dispatch({ type: "setError", key: "add", message: messageOf(err) });
      },
    );
  }

  function submitRename() {
    const id = state.selectedId;
    const title = titleInput.trim();
    if (id === null || !title) return;
    const loc = findCard(state, id);
    if (!loc) return;
    const previous = loc.card.title;
    dispatch({ type: "setError", key: "rename", message: undefined });
    dispatch({ type: "setTitle", id, title });
    renameCard(id, title).catch((err: unknown) => {
      dispatch({ type: "setTitle", id, title: previous });
      dispatch({ type: "setError", key: "rename", message: messageOf(err) });
    });
  }

  function archiveSelected() {
    const id = state.selectedId;
    if (id === null) return;
    const loc = findCard(state, id);
    if (!loc) return;
    dispatch({ type: "setError", key: "archive", message: undefined });
    dispatch({ type: "archive", id });
    archiveCard(id).catch((err: unknown) => {
      dispatch({ type: "insertCard", column: loc.column, index: loc.index, card: loc.card });
      dispatch({ type: "setError", key: "archive", message: messageOf(err) });
    });
  }

  function toggleRow(item: UiItem) {
    const cardId = state.selectedId;
    const itemId = item.id;
    if (cardId === null || itemId === null) return;
    const done = !item.done;
    dispatch({ type: "setError", key: "item", message: undefined });
    dispatch({ type: "setItemDone", cardId, itemId, done });
    toggleItem(cardId, itemId, done).catch((err: unknown) => {
      dispatch({ type: "setItemDone", cardId, itemId, done: !done });
      dispatch({ type: "setError", key: "item", message: messageOf(err) });
    });
  }

  function submitItem() {
    const cardId = state.selectedId;
    const text = itemInput.trim();
    if (cardId === null || !text || !items) return;
    const key = nextKey("p");
    setItemInput("");
    dispatch({ type: "setError", key: "item", message: undefined });
    dispatch({ type: "addItemPending", cardId, key, text });
    addItem(cardId, text).then(
      item => dispatch({ type: "resolveItem", cardId, key, id: item.id }),
      err => {
        dispatch({ type: "removeItem", cardId, key });
        dispatch({ type: "setError", key: "item", message: messageOf(err) });
      },
    );
  }

  const doneCount = items ? items.filter(i => i.done).length : 0;

  return (
    <div className="board-page">
      {state.errors.move && (
        <p role="alert" data-testid="move-error">{`${ERROR_LABEL.move}: ${state.errors.move}`}</p>
      )}
      {state.errors.archive && (
        <p role="alert" data-testid="archive-error">{`${ERROR_LABEL.archive}: ${state.errors.archive}`}</p>
      )}

      <div className="board-layout" style={{ display: "flex", gap: "1rem", alignItems: "flex-start" }}>
        <div className="columns" style={{ display: "flex", gap: "1rem", flex: "1 1 auto", minWidth: 0 }}>
          {COLUMNS.map(column => {
            const s = state.columns[column];
            const name = COLUMN_NAMES[column];
            const heading = s.status === "ok" ? `${name} (${s.cards.length})` : name;
            return (
              <section key={column} data-testid={`col-${column}`} aria-label={name} style={{ flex: "1 1 0", minWidth: 0 }}>
                <h2 data-testid={`head-${column}`}>{heading}</h2>

                {s.status === "loading" && <p>loading</p>}

                {s.status === "error" && (
                  <div role="alert">
                    <p>{`error: ${s.message}`}</p>
                    <button type="button" data-testid={`retry-${column}`} onClick={() => retry(column)}>
                      retry
                    </button>
                  </div>
                )}

                {s.status === "ok" && (
                  <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                    {s.cards.map((card, index) => (
                      <CardRow
                        key={card.key}
                        card={card}
                        selected={card.id !== null && card.id === selectedId}
                        moves={movesFor(state, { column, index, card })}
                        onSelect={selectCard}
                        onMove={(id, m) => moveTo(id, { column, index }, m)}
                      />
                    ))}
                  </ul>
                )}

                {column === "todo" && (
                  <form
                    onSubmit={e => {
                      e.preventDefault();
                      submitCard();
                    }}
                  >
                    <input
                      data-testid="new-card"
                      aria-label="New card title"
                      value={newCard}
                      onChange={e => setNewCard(e.target.value)}
                    />
                    <button type="submit" data-testid="add-card" disabled={!todoReady}>
                      add
                    </button>
                    {state.errors.add && (
                      <p role="alert" data-testid="add-error">{`${ERROR_LABEL.add}: ${state.errors.add}`}</p>
                    )}
                  </form>
                )}
              </section>
            );
          })}
        </div>

        <aside data-testid="detail" aria-label="Card detail" style={{ flex: "0 0 20rem", minWidth: 0 }}>
          {selected && selectedId !== null ? (
            <>
              <h2>{`#${selectedId} ${selected.card.title}`}</h2>
              <p>{`in ${COLUMN_NAMES[selected.column]}`}</p>

              <div>
                <input
                  data-testid="title-input"
                  aria-label="New title"
                  value={titleInput}
                  onChange={e => setTitleInput(e.target.value)}
                />
                <button type="button" data-testid="rename" onClick={submitRename}>
                  rename
                </button>
              </div>
              {state.errors.rename && (
                <p role="alert" data-testid="rename-error">{`${ERROR_LABEL.rename}: ${state.errors.rename}`}</p>
              )}

              <button type="button" data-testid="archive" onClick={archiveSelected}>
                archive
              </button>

              <section data-testid="checklist" aria-label="Checklist">
                {checklist?.status === "loading" && <p>loading checklist</p>}
                {checklist?.status === "error" && <p role="alert">{`checklist error: ${checklist.message}`}</p>}
                {items && (
                  <ul style={{ listStyle: "none", padding: 0 }}>
                    {items.map(item => (
                      <li key={item.key} style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                        <span data-testid="item">
                          {`${item.done ? "[x]" : "[ ]"} ${item.text}${item.id === null ? " (adding…)" : ""}`}
                        </span>
                        {item.id !== null && (
                          <button type="button" data-testid="toggle" onClick={() => toggleRow(item)}>
                            toggle
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
              {items && <p data-testid="progress">{`${doneCount}/${items.length} done`}</p>}

              <form
                onSubmit={e => {
                  e.preventDefault();
                  submitItem();
                }}
              >
                <input
                  data-testid="item-input"
                  aria-label="New checklist item"
                  value={itemInput}
                  onChange={e => setItemInput(e.target.value)}
                />
                <button type="submit" data-testid="add-item" disabled={!items}>
                  add item
                </button>
              </form>
              {state.errors.item && (
                <p role="alert" data-testid="item-error">{`${ERROR_LABEL.item}: ${state.errors.item}`}</p>
              )}
            </>
          ) : (
            <p>select a card</p>
          )}
        </aside>
      </div>
    </div>
  );
}

type CardRowProps = {
  card: UiCard;
  selected: boolean;
  moves: Move[];
  onSelect: (id: number) => void;
  onMove: (id: number, m: Move) => void;
};

function CardRow({ card, selected, moves, onSelect, onMove }: CardRowProps) {
  const id = card.id;
  return (
    <li style={{ display: "flex", gap: "0.25rem", alignItems: "center", marginBottom: "0.25rem" }}>
      {id === null ? (
        <div data-testid="card" style={{ flex: "1 1 auto" }}>
          {`${card.title} (adding…)`}
        </div>
      ) : (
        <button
          type="button"
          data-testid="card"
          aria-pressed={selected}
          style={{ flex: "1 1 auto", textAlign: "left" }}
          onClick={() => onSelect(id)}
        >
          {`#${id} ${card.title} · ${card.done}/${card.total}`}
        </button>
      )}
      {id !== null &&
        moves.map(m => (
          <button
            key={m.dir}
            type="button"
            data-testid={m.dir}
            disabled={m.disabled}
            onClick={() => onMove(id, m)}
          >
            {m.dir}
          </button>
        ))}
    </li>
  );
}
