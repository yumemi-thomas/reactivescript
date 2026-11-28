import { useEffect, useReducer, useState } from "react";
import type { Dispatch, FormEvent, ReactNode } from "react";
import { addCard, archiveCard, fetchCards, moveCard } from "./api.js";
import type { Column } from "./api.js";
import {
  COLUMNS,
  COLUMN_NAME,
  INITIAL_BOARD,
  boardReducer,
  canMoveTo,
  cardsIn,
  errorMessage,
  findCard,
  newKey,
} from "./boardState";
import type { Action, BoardCard, ColumnState, Dir } from "./boardState";
import DetailPanel from "./DetailPanel";

/** Fetches one column and reports the result, unless `isCurrent` says the page has moved on. */
function loadColumn(column: Column, dispatch: Dispatch<Action>, isCurrent: () => boolean): void {
  fetchCards(column).then(
    cards => {
      if (isCurrent()) dispatch({ type: "loaded", column, cards });
    },
    error => {
      if (isCurrent()) dispatch({ type: "failed", column, message: errorMessage(error) });
    },
  );
}

export default function BoardPage() {
  const [board, dispatch] = useReducer(boardReducer, INITIAL_BOARD);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [moveError, setMoveError] = useState<string | null>(null);
  const [addError, setAddError] = useState<string | null>(null);
  const [archiveError, setArchiveError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    for (const column of COLUMNS) loadColumn(column, dispatch, () => active);
    return () => {
      active = false;
    };
  }, []);

  const retry = (column: Column) => {
    dispatch({ type: "loading", column });
    loadColumn(column, dispatch, () => true);
  };

  const moveDir = (card: BoardCard, dir: Dir) => {
    if (card.id === null) return;
    const id = card.id;
    const from = findCard(board, id);
    if (!from) return;
    let to: Column = from.column;
    let index = from.index;
    if (dir === "left" || dir === "right") {
      const target = COLUMNS[COLUMNS.indexOf(from.column) + (dir === "left" ? -1 : 1)];
      if (!target) return;
      to = target;
      index = cardsIn(board, target).length;
    } else {
      index = from.index + (dir === "up" ? -1 : 1);
      if (index < 0 || index >= cardsIn(board, from.column).length) return;
    }
    if (!canMoveTo(board, from.column, to)) return;
    setMoveError(null);
    dispatch({ type: "move", id, to, index });
    moveCard(id, to, index).catch(error => {
      dispatch({ type: "move", id, to: from.column, index: from.index });
      setMoveError(`move error: ${errorMessage(error)}`);
    });
  };

  const onAdd = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const title = newTitle.trim();
    if (title === "" || board.todo.status !== "ok") return;
    const key = newKey("new-card");
    setNewTitle("");
    setAddError(null);
    dispatch({ type: "addPending", key, title });
    addCard("todo", title).then(
      created => dispatch({ type: "addAccepted", key, id: created.id }),
      error => {
        dispatch({ type: "removeKey", key });
        setAddError(`add error: ${errorMessage(error)}`);
      },
    );
  };

  const onArchive = (id: number) => {
    const found = findCard(board, id);
    if (!found) return;
    setArchiveError(null);
    setSelectedId(null);
    dispatch({ type: "remove", id });
    archiveCard(id).catch(error => {
      dispatch({ type: "insert", card: found.card, column: found.column, index: found.index });
      setArchiveError(`archive error: ${errorMessage(error)}`);
    });
  };

  const selected = selectedId === null ? undefined : findCard(board, selectedId);

  const addForm = (
    <>
      <form className="add-form" onSubmit={onAdd}>
        <input
          data-testid="new-card"
          aria-label="New card title"
          placeholder="New card"
          value={newTitle}
          onChange={event => setNewTitle(event.target.value)}
        />
        <button type="submit" data-testid="add-card" disabled={board.todo.status !== "ok"}>
          add card
        </button>
      </form>
      {addError && (
        <p role="alert" className="error" data-testid="add-error">
          {addError}
        </p>
      )}
    </>
  );

  return (
    <div className="board-page">
      <div className="board-main">
        <div className="columns">
          {COLUMNS.map(column => (
            <ColumnView
              key={column}
              column={column}
              state={board[column]}
              canMove={to => canMoveTo(board, column, to)}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onMove={moveDir}
              onRetry={retry}
              footer={column === "todo" ? addForm : undefined}
            />
          ))}
        </div>
        {moveError && (
          <p role="alert" className="error" data-testid="move-error">
            {moveError}
          </p>
        )}
        {archiveError && (
          <p role="alert" className="error" data-testid="archive-error">
            {archiveError}
          </p>
        )}
      </div>
      <section className="detail" data-testid="detail" aria-label="Selected card">
        {selectedId !== null && selected ? (
          <DetailPanel
            key={selectedId}
            id={selectedId}
            card={selected.card}
            column={selected.column}
            dispatch={dispatch}
            onArchive={onArchive}
          />
        ) : (
          <p className="muted">select a card</p>
        )}
      </section>
    </div>
  );
}

type ColumnViewProps = {
  column: Column;
  state: ColumnState;
  canMove: (to: Column) => boolean;
  selectedId: number | null;
  onSelect: (id: number) => void;
  onMove: (card: BoardCard, dir: Dir) => void;
  onRetry: (column: Column) => void;
  footer?: ReactNode;
};

/** The move buttons a card shows. A button with nowhere to go is left out; one blocked by a rule is disabled. */
function movesFor(
  column: Column,
  index: number,
  count: number,
  canMove: (to: Column) => boolean,
): { dir: Dir; disabled: boolean }[] {
  const at = COLUMNS.indexOf(column);
  const moves: { dir: Dir; disabled: boolean }[] = [];
  if (at > 0) moves.push({ dir: "left", disabled: !canMove(COLUMNS[at - 1]) });
  if (at < COLUMNS.length - 1) moves.push({ dir: "right", disabled: !canMove(COLUMNS[at + 1]) });
  if (index > 0) moves.push({ dir: "up", disabled: false });
  if (index < count - 1) moves.push({ dir: "down", disabled: false });
  return moves;
}

function ColumnView({ column, state, canMove, selectedId, onSelect, onMove, onRetry, footer }: ColumnViewProps) {
  const heading = state.status === "ok" ? `${COLUMN_NAME[column]} (${state.cards.length})` : COLUMN_NAME[column];
  return (
    <section className="column" data-testid={`col-${column}`} aria-labelledby={`head-${column}`}>
      <h2 id={`head-${column}`} data-testid={`head-${column}`}>
        {heading}
      </h2>
      {state.status === "loading" && <p className="muted">loading</p>}
      {state.status === "error" && (
        <div role="alert">
          <p className="error">{`error: ${state.message}`}</p>
          <button type="button" data-testid={`retry-${column}`} onClick={() => onRetry(column)}>
            retry
          </button>
        </div>
      )}
      {state.status === "ok" && (
        <ul className="cards">
          {state.cards.map((card, index) => {
            const moves = card.id === null ? [] : movesFor(column, index, state.cards.length, canMove);
            return (
              <li key={card.key} className="card-row">
                <button
                  type="button"
                  className="card"
                  data-testid="card"
                  aria-pressed={card.id !== null && card.id === selectedId}
                  disabled={card.id === null}
                  onClick={() => {
                    if (card.id !== null) onSelect(card.id);
                  }}
                >
                  {card.id === null
                    ? `${card.title} (adding…)`
                    : `#${card.id} ${card.title} · ${card.done}/${card.total}`}
                </button>
                {moves.length > 0 && (
                  <div className="moves">
                    {moves.map(move => (
                      <button
                        key={move.dir}
                        type="button"
                        data-testid={move.dir}
                        title={`Move ${move.dir}`}
                        disabled={move.disabled}
                        onClick={() => onMove(card, move.dir)}
                      >
                        {move.dir}
                      </button>
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {footer}
    </section>
  );
}
