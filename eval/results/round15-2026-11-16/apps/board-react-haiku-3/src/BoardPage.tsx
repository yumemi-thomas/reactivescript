import { useEffect, useReducer, useState, type Dispatch, type FormEvent } from "react";
import { addCard, addItem, archiveCard, fetchCards, fetchChecklist, moveCard, renameCard, toggleItem } from "./api.js";
import type { Column } from "./api.js";
import {
  COLUMNS,
  COLUMN_NAME,
  DIRS,
  boardReducer,
  initialBoard,
  type Checklist,
  locate,
  messageOf,
  moveAvailability,
  moveTarget,
  progress,
  type Action,
  type BoardState,
  type Dir,
  type ItemView,
  type Location,
} from "./model";

const MOVE_ARROW: Record<Dir, string> = { left: "←", right: "→", up: "↑", down: "↓" };
const MOVE_LABEL: Record<Dir, string> = { left: "Move left", right: "Move right", up: "Move up", down: "Move down" };

let keySeq = 0;
function nextKey(prefix: string): string {
  keySeq += 1;
  return `${prefix}${keySeq}`;
}

function requestColumn(column: Column, dispatch: Dispatch<Action>, alive: () => boolean): void {
  fetchCards(column).then(
    cards => {
      if (alive()) dispatch({ type: "loadDone", column, cards });
    },
    (e: unknown) => {
      if (alive()) dispatch({ type: "loadFail", column, message: messageOf(e) });
    },
  );
}

export function BoardPage() {
  const [board, dispatch] = useReducer(boardReducer, undefined, initialBoard);

  useEffect(() => {
    let live = true;
    for (const column of COLUMNS) requestColumn(column, dispatch, () => live);
    return () => {
      live = false;
    };
  }, []);

  const retry = (column: Column) => {
    dispatch({ type: "loadStart", column });
    requestColumn(column, dispatch, () => true);
  };

  const move = (id: number, dir: Dir) => {
    const loc = locate(board, id);
    if (loc === null) return;
    const target = moveTarget(board, loc, dir);
    if (target === null || moveAvailability(board, loc, dir) !== "enabled") return;
    dispatch({ type: "moveStart", id, column: target.column, index: target.index });
    moveCard(id, target.column, target.index).catch((e: unknown) => {
      dispatch({ type: "moveRollback", id, column: loc.column, index: loc.index, message: messageOf(e) });
    });
  };

  const add = (title: string) => {
    if (board.columns.todo.status.kind !== "ready") return;
    const key = nextKey("new-");
    dispatch({ type: "addStart", key, title });
    addCard("todo", title).then(
      card => dispatch({ type: "addAccepted", key, id: card.id, title: card.title }),
      (e: unknown) => dispatch({ type: "addRollback", key, message: messageOf(e) }),
    );
  };

  const select = (id: number) => {
    if (board.detail?.cardId === id) return;
    dispatch({ type: "select", id });
    fetchChecklist(id).then(
      items => dispatch({ type: "checklistLoaded", cardId: id, items }),
      (e: unknown) => dispatch({ type: "checklistFailed", cardId: id, message: messageOf(e) }),
    );
  };

  const rename = (id: number, title: string) => {
    const loc = locate(board, id);
    if (loc === null) return;
    const previous = loc.card.title;
    dispatch({ type: "renameStart", id, title });
    renameCard(id, title).catch((e: unknown) => {
      dispatch({ type: "renameRollback", id, previous, message: messageOf(e) });
    });
  };

  const archive = (id: number) => {
    const loc = locate(board, id);
    if (loc === null) return;
    dispatch({ type: "archiveStart", id });
    archiveCard(id).catch((e: unknown) => {
      dispatch({
        type: "archiveRollback",
        id,
        column: loc.column,
        index: loc.index,
        card: loc.card,
        message: messageOf(e),
      });
    });
  };

  const toggle = (cardId: number, item: ItemView) => {
    if (item.id === null) return;
    const itemId = item.id;
    const done = !item.done;
    dispatch({ type: "toggleStart", cardId, itemId, done });
    toggleItem(cardId, itemId, done).catch((e: unknown) => {
      dispatch({ type: "toggleRollback", cardId, itemId, done, message: messageOf(e) });
    });
  };

  const addChecklistItem = (cardId: number, text: string) => {
    if (board.detail?.cardId !== cardId || board.detail.checklist.status.kind !== "ready") return;
    const key = nextKey("item-");
    dispatch({ type: "itemAddStart", cardId, key, text });
    addItem(cardId, text).then(
      item => dispatch({ type: "itemAddAccepted", cardId, key, id: item.id, text: item.text }),
      (e: unknown) => dispatch({ type: "itemAddRollback", cardId, key, message: messageOf(e) }),
    );
  };

  return (
    <div className="board-page">
      <div className="columns">
        {COLUMNS.map(column => (
          <ColumnView
            key={column}
            column={column}
            board={board}
            selectedId={board.detail?.cardId ?? null}
            onRetry={retry}
            onMove={move}
            onSelect={select}
            onAdd={add}
          />
        ))}
        <DetailPanel
          board={board}
          onRename={rename}
          onArchive={archive}
          onToggle={toggle}
          onAddItem={addChecklistItem}
        />
      </div>
      {board.moveError !== null && (
        <p className="error" role="alert" data-testid="move-error">
          {board.moveError}
        </p>
      )}
      {board.archiveError !== null && (
        <p className="error" role="alert" data-testid="archive-error">
          {board.archiveError}
        </p>
      )}
    </div>
  );
}

interface ColumnViewProps {
  column: Column;
  board: BoardState;
  selectedId: number | null;
  onRetry: (column: Column) => void;
  onMove: (id: number, dir: Dir) => void;
  onSelect: (id: number) => void;
  onAdd: (title: string) => void;
}

function ColumnView({ column, board, selectedId, onRetry, onMove, onSelect, onAdd }: ColumnViewProps) {
  const { status, cards } = board.columns[column];
  const heading = status.kind === "ready" ? `${COLUMN_NAME[column]} (${cards.length})` : COLUMN_NAME[column];
  return (
    <section className="column" data-testid={`col-${column}`} aria-label={COLUMN_NAME[column]}>
      <h2 data-testid={`head-${column}`}>{heading}</h2>
      {status.kind === "loading" && <p className="status">loading</p>}
      {status.kind === "error" && (
        <div className="status" role="alert">
          <p>{`error: ${status.message}`}</p>
          <button type="button" data-testid={`retry-${column}`} onClick={() => onRetry(column)}>
            Retry
          </button>
        </div>
      )}
      <ul className="cards">
        {cards.map((card, index) => {
          const loc: Location = { column, index, card };
          return (
            <CardRow
              key={card.key}
              loc={loc}
              board={board}
              selected={card.id !== null && card.id === selectedId}
              onMove={onMove}
              onSelect={onSelect}
            />
          );
        })}
      </ul>
      {column === "todo" && <AddCardForm ready={status.kind === "ready"} error={board.addError} onAdd={onAdd} />}
    </section>
  );
}

interface CardRowProps {
  loc: Location;
  board: BoardState;
  selected: boolean;
  onMove: (id: number, dir: Dir) => void;
  onSelect: (id: number) => void;
}

function CardRow({ loc, board, selected, onMove, onSelect }: CardRowProps) {
  const card = loc.card;
  const id = card.id;
  if (id === null) {
    return (
      <li className="card-row">
        <span className="card pending" data-testid="card">{`${card.title} (adding…)`}</span>
      </li>
    );
  }
  return (
    <li className="card-row">
      <button type="button" className="card" data-testid="card" aria-pressed={selected} onClick={() => onSelect(id)}>
        {`#${id} ${card.title} · ${card.done}/${card.total}`}
      </button>
      {DIRS.map(dir => {
        const availability = moveAvailability(board, loc, dir);
        if (availability === "hidden") return null;
        return (
          <button
            key={dir}
            type="button"
            className="move"
            data-testid={dir}
            aria-label={MOVE_LABEL[dir]}
            disabled={availability === "disabled"}
            onClick={() => onMove(id, dir)}
          >
            {MOVE_ARROW[dir]}
          </button>
        );
      })}
    </li>
  );
}

function AddCardForm({ ready, error, onAdd }: { ready: boolean; error: string | null; onAdd: (title: string) => void }) {
  const [title, setTitle] = useState("");
  const trimmed = title.trim();
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!ready || trimmed === "") return;
    setTitle("");
    onAdd(trimmed);
  };
  return (
    <form className="add" onSubmit={submit}>
      <input
        data-testid="new-card"
        aria-label="New card title"
        value={title}
        disabled={!ready}
        onChange={e => setTitle(e.currentTarget.value)}
      />
      <button type="submit" data-testid="add-card" disabled={!ready || trimmed === ""}>
        Add
      </button>
      {error !== null && (
        <p className="error" role="alert" data-testid="add-error">
          {error}
        </p>
      )}
    </form>
  );
}

interface DetailPanelProps {
  board: BoardState;
  onRename: (id: number, title: string) => void;
  onArchive: (id: number) => void;
  onToggle: (cardId: number, item: ItemView) => void;
  onAddItem: (cardId: number, text: string) => void;
}

function DetailPanel({ board, onRename, onArchive, onToggle, onAddItem }: DetailPanelProps) {
  const detail = board.detail;
  const loc = detail === null ? null : locate(board, detail.cardId);
  if (detail === null || loc === null) {
    return (
      <aside className="detail" data-testid="detail">
        <p>select a card</p>
      </aside>
    );
  }
  return (
    <SelectedDetail
      key={detail.cardId}
      loc={loc}
      cardId={detail.cardId}
      checklist={detail.checklist}
      renameError={detail.renameError}
      itemError={detail.itemError}
      onRename={onRename}
      onArchive={onArchive}
      onToggle={onToggle}
      onAddItem={onAddItem}
    />
  );
}

interface SelectedDetailProps {
  loc: Location;
  cardId: number;
  checklist: Checklist;
  renameError: string | null;
  itemError: string | null;
  onRename: (id: number, title: string) => void;
  onArchive: (id: number) => void;
  onToggle: (cardId: number, item: ItemView) => void;
  onAddItem: (cardId: number, text: string) => void;
}

function SelectedDetail({
  loc,
  cardId,
  checklist,
  renameError,
  itemError,
  onRename,
  onArchive,
  onToggle,
  onAddItem,
}: SelectedDetailProps) {
  const [title, setTitle] = useState("");
  const [itemText, setItemText] = useState("");
  const ready = checklist.status.kind === "ready";
  const counts = progress(checklist.items);

  const submitRename = (e: FormEvent) => {
    e.preventDefault();
    const next = title.trim();
    if (next === "") return;
    setTitle("");
    onRename(cardId, next);
  };

  const submitItem = (e: FormEvent) => {
    e.preventDefault();
    const text = itemText.trim();
    if (!ready || text === "") return;
    setItemText("");
    onAddItem(cardId, text);
  };

  return (
    <aside className="detail" data-testid="detail">
      <h2>{`#${cardId} ${loc.card.title}`}</h2>
      <p>{`in ${COLUMN_NAME[loc.column]}`}</p>

      <form className="rename" onSubmit={submitRename}>
        <input
          data-testid="title-input"
          aria-label="Card title"
          value={title}
          onChange={e => setTitle(e.currentTarget.value)}
        />
        <button type="submit" data-testid="rename" disabled={title.trim() === ""}>
          Rename
        </button>
      </form>
      {renameError !== null && (
        <p className="error" role="alert">
          {renameError}
        </p>
      )}

      <button type="button" data-testid="archive" onClick={() => onArchive(cardId)}>
        Archive
      </button>

      <section data-testid="checklist" aria-label="Checklist">
        {checklist.status.kind === "loading" && <p className="status">loading checklist</p>}
        {checklist.status.kind === "error" && (
          <p className="error" role="alert">
            {`checklist error: ${checklist.status.message}`}
          </p>
        )}
        <ul className="items">
          {checklist.items.map(item => (
            <li key={item.key} className="item-row">
              <span data-testid="item">
                {item.id === null
                  ? `[ ] ${item.text} (adding…)`
                  : `${item.done ? "[x]" : "[ ]"} ${item.text}`}
              </span>
              {item.id !== null && (
                <button type="button" data-testid="toggle" onClick={() => onToggle(cardId, item)}>
                  Toggle
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>
      {ready && <p data-testid="progress">{`${counts.done}/${counts.total} done`}</p>}

      <form className="add-item" onSubmit={submitItem}>
        <input
          data-testid="item-input"
          aria-label="New checklist item"
          value={itemText}
          onChange={e => setItemText(e.currentTarget.value)}
        />
        <button type="submit" data-testid="add-item" disabled={!ready || itemText.trim() === ""}>
          Add item
        </button>
      </form>
      {itemError !== null && (
        <p className="error" role="alert">
          {itemError}
        </p>
      )}
    </aside>
  );
}
