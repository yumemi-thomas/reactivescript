import { useEffect, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import {
  addCard as createCard,
  addItem as createItem,
  archiveCard,
  fetchArchived,
  fetchCards,
  fetchChecklist,
  moveCard,
  renameCard,
  restoreCard,
  toggleItem,
} from "./api.js";
import type { Archived, Card as ServerCard, Column, Item as ServerItem } from "./api.js";

const COLUMNS: readonly Column[] = ["todo", "doing", "done"];
const TITLES: Record<Column, string> = { todo: "To do", doing: "Doing", done: "Done" };
const DOING_LIMIT = 3;

type Dir = "left" | "right" | "up" | "down";

let keySeq = 0;
function nextKey(prefix: string): string {
  keySeq += 1;
  return `${prefix}-${keySeq}`;
}

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/* ---------- board state ---------- */

type BoardCard = { key: string; id: number | null; title: string; done: number; total: number };
type ColumnState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; cards: BoardCard[] };
type Cols = Record<Column, ColumnState>;
type Found = { column: Column; index: number; card: BoardCard };

const LOADING: ColumnState = { status: "loading" };
const START: Cols = { todo: LOADING, doing: LOADING, done: LOADING };

function fromServer(c: ServerCard): BoardCard {
  return { key: `card-${c.id}`, id: c.id, title: c.title, done: c.done, total: c.total };
}

function cardsOf(cols: Cols, column: Column): BoardCard[] {
  const state = cols[column];
  return state.status === "ready" ? state.cards : [];
}

function find(cols: Cols, id: number): Found | null {
  for (const column of COLUMNS) {
    const state = cols[column];
    if (state.status !== "ready") continue;
    const index = state.cards.findIndex(c => c.id === id);
    if (index >= 0) return { column, index, card: state.cards[index] };
  }
  return null;
}

function updateColumn(cols: Cols, column: Column, update: (cards: BoardCard[]) => BoardCard[]): Cols {
  const state = cols[column];
  if (state.status !== "ready") return cols;
  const next: ColumnState = { status: "ready", cards: update(state.cards) };
  return { ...cols, [column]: next };
}

function without(cols: Cols, found: Found): Cols {
  return updateColumn(cols, found.column, cards => cards.filter((_, i) => i !== found.index));
}

function withCard(cols: Cols, column: Column, index: number, card: BoardCard): Cols {
  return updateColumn(cols, column, cards => [...cards.slice(0, index), card, ...cards.slice(index)]);
}

/** takes the card `id` out and puts it at `index` of `column` (after its own removal) */
function relocate(cols: Cols, id: number, column: Column, index: number): Cols {
  const found = find(cols, id);
  if (!found || cols[column].status !== "ready") return cols;
  return withCard(without(cols, found), column, index, found.card);
}

function patchCard(cols: Cols, id: number, patch: (c: BoardCard) => BoardCard): Cols {
  const found = find(cols, id);
  if (!found) return cols;
  return updateColumn(cols, found.column, cards => cards.map((c, i) => (i === found.index ? patch(c) : c)));
}

function loadColumn(column: Column, done: (next: ColumnState) => void): void {
  fetchCards(column).then(
    cards => done({ status: "ready", cards: cards.map(fromServer) }),
    (e: unknown) => done({ status: "error", message: errorMessage(e) }),
  );
}

/* ---------- board page ---------- */

function MoveButton({ dir, label, disabled, onClick }: { dir: Dir; label: string; disabled: boolean; onClick: () => void }) {
  return (
    <button type="button" data-testid={dir} aria-label={`move ${dir}`} disabled={disabled} onClick={onClick}>
      {label}
    </button>
  );
}

type CardRowProps = {
  card: BoardCard;
  column: Column;
  index: number;
  count: number;
  selected: boolean;
  canEnter: Record<Column, boolean>;
  onMove: (id: number, dir: Dir) => void;
  onSelect: (id: number) => void;
};

function CardRow({ card, column, index, count, selected, canEnter, onMove, onSelect }: CardRowProps) {
  const id = card.id;
  if (id === null) {
    return (
      <li>
        <button type="button" data-testid="card" disabled>
          {`${card.title} (adding…)`}
        </button>
      </li>
    );
  }
  const ci = COLUMNS.indexOf(column);
  const left = ci > 0 ? COLUMNS[ci - 1] : null;
  const right = ci < COLUMNS.length - 1 ? COLUMNS[ci + 1] : null;
  return (
    <li>
      <button type="button" data-testid="card" aria-pressed={selected} onClick={() => onSelect(id)}>
        {`#${id} ${card.title} · ${card.done}/${card.total}`}
      </button>
      {left !== null && (
        <MoveButton dir="left" label="←" disabled={!canEnter[left]} onClick={() => onMove(id, "left")} />
      )}
      {right !== null && (
        <MoveButton dir="right" label="→" disabled={!canEnter[right]} onClick={() => onMove(id, "right")} />
      )}
      {index > 0 && <MoveButton dir="up" label="↑" disabled={false} onClick={() => onMove(id, "up")} />}
      {index < count - 1 && (
        <MoveButton dir="down" label="↓" disabled={false} onClick={() => onMove(id, "down")} />
      )}
    </li>
  );
}

type ColumnViewProps = {
  column: Column;
  state: ColumnState;
  selectedId: number | null;
  canEnter: Record<Column, boolean>;
  onMove: (id: number, dir: Dir) => void;
  onSelect: (id: number) => void;
  onRetry: (column: Column) => void;
  children?: ReactNode;
};

function ColumnView({ column, state, selectedId, canEnter, onMove, onSelect, onRetry, children }: ColumnViewProps) {
  const heading = state.status === "ready" ? `${TITLES[column]} (${state.cards.length})` : TITLES[column];
  return (
    <section data-testid={`col-${column}`} aria-label={TITLES[column]} style={columnStyle}>
      <h2 data-testid={`head-${column}`} style={headingStyle}>
        {heading}
      </h2>
      {state.status === "loading" && <p>loading</p>}
      {state.status === "error" && (
        <div>
          <p>{`error: ${state.message}`}</p>
          <button type="button" data-testid={`retry-${column}`} onClick={() => onRetry(column)}>
            retry
          </button>
        </div>
      )}
      {state.status === "ready" && (
        <ul style={listStyle}>
          {state.cards.map((card, index) => (
            <CardRow
              key={card.key}
              card={card}
              column={column}
              index={index}
              count={state.cards.length}
              selected={card.id !== null && card.id === selectedId}
              canEnter={canEnter}
              onMove={onMove}
              onSelect={onSelect}
            />
          ))}
        </ul>
      )}
      {children}
    </section>
  );
}

type DetailProps = {
  id: number;
  title: string;
  column: Column;
  onRename: (title: string) => Promise<void>;
  onArchive: () => void;
  onCount: (done: number, total: number) => void;
};

type Row = { key: string; id: number | null; text: string; done: boolean };
type ChecklistState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; items: Row[] };

const LOADING_LIST: ChecklistState = { status: "loading" };

function fromItem(i: ServerItem): Row {
  return { key: `item-${i.id}`, id: i.id, text: i.text, done: i.done };
}

/** The selected card's detail. Keyed by card id, so switching cards starts it fresh. */
function Detail({ id, title, column, onRename, onArchive, onCount }: DetailProps) {
  const [draft, setDraft] = useState("");
  const [renameError, setRenameError] = useState<string | null>(null);
  const [itemDraft, setItemDraft] = useState("");
  const [itemError, setItemError] = useState<string | null>(null);
  const [list, setList] = useState<ChecklistState>(LOADING_LIST);

  useEffect(() => {
    let alive = true;
    fetchChecklist(id).then(
      items => {
        if (alive) setList({ status: "ready", items: items.map(fromItem) });
      },
      (e: unknown) => {
        if (alive) setList({ status: "error", message: errorMessage(e) });
      },
    );
    return () => {
      alive = false;
    };
  }, [id]);

  const setRows = (update: (rows: Row[]) => Row[]) =>
    setList((prev): ChecklistState => (prev.status === "ready" ? { status: "ready", items: update(prev.items) } : prev));

  function rename(event: FormEvent) {
    event.preventDefault();
    const next = draft.trim();
    if (next === "") return;
    setRenameError(null);
    onRename(next).catch((e: unknown) => setRenameError(errorMessage(e)));
  }

  function toggle(row: Row) {
    if (row.id === null || list.status !== "ready") return;
    const itemId = row.id;
    const next = !row.done;
    setItemError(null);
    setRows(rows => rows.map(r => (r.key === row.key ? { ...r, done: next } : r)));
    onCount(next ? 1 : -1, 0);
    toggleItem(id, itemId, next).catch((e: unknown) => {
      setRows(rows => rows.map(r => (r.key === row.key ? { ...r, done: !next } : r)));
      onCount(next ? -1 : 1, 0);
      setItemError(errorMessage(e));
    });
  }

  function addItem(event: FormEvent) {
    event.preventDefault();
    const text = itemDraft.trim();
    if (text === "" || list.status !== "ready") return;
    const key = nextKey("pending-item");
    setItemError(null);
    setItemDraft("");
    setRows(rows => [...rows, { key, id: null, text, done: false }]);
    onCount(0, 1);
    createItem(id, text).then(
      created =>
        setRows(rows =>
          rows.map(r =>
            r.key === key ? { key: `item-${created.id}`, id: created.id, text: created.text, done: created.done } : r,
          ),
        ),
      (e: unknown) => {
        setRows(rows => rows.filter(r => r.key !== key));
        onCount(0, -1);
        setItemError(errorMessage(e));
      },
    );
  }

  const doneCount = list.status === "ready" ? list.items.filter(r => r.done).length : 0;

  return (
    <div>
      <h2 style={headingStyle}>{`#${id} ${title}`}</h2>
      <p>{`in ${TITLES[column]}`}</p>
      <form onSubmit={rename} style={rowStyle}>
        <input
          data-testid="title-input"
          aria-label="Card title"
          value={draft}
          onChange={e => setDraft(e.target.value)}
        />
        <button type="submit" data-testid="rename">
          rename
        </button>
      </form>
      {renameError !== null && <p>{`rename error: ${renameError}`}</p>}
      <p>
        <button type="button" data-testid="archive" onClick={onArchive}>
          archive
        </button>
      </p>
      <div data-testid="checklist">
        {list.status === "loading" && <p>loading checklist</p>}
        {list.status === "error" && <p>{`checklist error: ${list.message}`}</p>}
        {list.status === "ready" && (
          <>
            <ul style={listStyle}>
              {list.items.map(row => (
                <li key={row.key} style={rowStyle}>
                  <span data-testid="item">
                    {`${row.done ? "[x]" : "[ ]"} ${row.text}${row.id === null ? " (adding…)" : ""}`}
                  </span>
                  {row.id !== null && (
                    <button type="button" data-testid="toggle" onClick={() => toggle(row)}>
                      toggle
                    </button>
                  )}
                </li>
              ))}
            </ul>
            <p data-testid="progress">{`${doneCount}/${list.items.length} done`}</p>
            <form onSubmit={addItem} style={rowStyle}>
              <input
                data-testid="item-input"
                aria-label="New checklist item"
                value={itemDraft}
                onChange={e => setItemDraft(e.target.value)}
              />
              <button type="submit" data-testid="add-item">
                add item
              </button>
            </form>
          </>
        )}
      </div>
      {itemError !== null && <p>{`item error: ${itemError}`}</p>}
    </div>
  );
}

function BoardPage() {
  const [cols, setCols] = useState<Cols>(START);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [moveError, setMoveError] = useState<string | null>(null);
  const [addError, setAddError] = useState<string | null>(null);
  const [archiveError, setArchiveError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    for (const column of COLUMNS) {
      loadColumn(column, next => {
        if (alive) setCols(prev => ({ ...prev, [column]: next }));
      });
    }
    return () => {
      alive = false;
    };
  }, []);

  const canEnter: Record<Column, boolean> = {
    todo: cols.todo.status === "ready",
    doing: cols.doing.status === "ready" && cardsOf(cols, "doing").length < DOING_LIMIT,
    done: cols.done.status === "ready",
  };

  const selectedFound = selectedId === null ? null : find(cols, selectedId);

  function retry(column: Column) {
    setCols(prev => ({ ...prev, [column]: LOADING }));
    loadColumn(column, next => setCols(prev => ({ ...prev, [column]: next })));
  }

  function select(id: number) {
    setSelectedId(id);
  }

  function move(id: number, dir: Dir) {
    const found = find(cols, id);
    if (!found) return;
    const from = found.column;
    const fromIndex = found.index;
    const ci = COLUMNS.indexOf(from);
    let to: Column = from;
    let index = fromIndex;
    if (dir === "left") {
      to = COLUMNS[ci - 1];
      index = cardsOf(cols, to).length;
    } else if (dir === "right") {
      to = COLUMNS[ci + 1];
      index = cardsOf(cols, to).length;
    } else if (dir === "up") {
      index = fromIndex - 1;
    } else {
      index = fromIndex + 1;
    }
    if (to !== from && !canEnter[to]) return;
    setMoveError(null);
    setCols(prev => relocate(prev, id, to, index));
    moveCard(id, to, index).catch((e: unknown) => {
      setCols(prev => relocate(prev, id, from, fromIndex));
      setMoveError(errorMessage(e));
    });
  }

  function addNew() {
    const title = newTitle.trim();
    if (title === "" || cols.todo.status !== "ready") return;
    const key = nextKey("new");
    setAddError(null);
    setNewTitle("");
    setCols(prev =>
      updateColumn(prev, "todo", cards => [...cards, { key, id: null, title, done: 0, total: 0 }]),
    );
    createCard("todo", title).then(
      created =>
        setCols(prev =>
          updateColumn(prev, "todo", cards =>
            cards.map(c =>
              c.key === key ? { key: `card-${created.id}`, id: created.id, title: created.title, done: 0, total: 0 } : c,
            ),
          ),
        ),
      (e: unknown) => {
        setCols(prev => updateColumn(prev, "todo", cards => cards.filter(c => c.key !== key)));
        setAddError(errorMessage(e));
      },
    );
  }

  function rename(id: number, title: string): Promise<void> {
    const previous = find(cols, id)?.card.title;
    setCols(prev => patchCard(prev, id, c => ({ ...c, title })));
    return renameCard(id, title).then(
      () => undefined,
      (e: unknown) => {
        if (previous !== undefined) setCols(prev => patchCard(prev, id, c => ({ ...c, title: previous })));
        throw e;
      },
    );
  }

  function adjustCounts(id: number, done: number, total: number) {
    setCols(prev => patchCard(prev, id, c => ({ ...c, done: c.done + done, total: c.total + total })));
  }

  function archive(id: number) {
    const found = find(cols, id);
    if (!found) return;
    setArchiveError(null);
    setSelectedId(null);
    setCols(prev => {
      const f = find(prev, id);
      return f ? without(prev, f) : prev;
    });
    archiveCard(id).catch((e: unknown) => {
      setCols(prev => withCard(prev, found.column, found.index, found.card));
      setArchiveError(errorMessage(e));
    });
  }

  const addForm = (
    <form
      style={rowStyle}
      onSubmit={e => {
        e.preventDefault();
        addNew();
      }}
    >
      <input
        data-testid="new-card"
        aria-label="New card title"
        value={newTitle}
        onChange={e => setNewTitle(e.target.value)}
      />
      <button type="submit" data-testid="add-card">
        add
      </button>
      {addError !== null && <p data-testid="add-error">{`add error: ${addError}`}</p>}
    </form>
  );

  return (
    <div>
      <div style={boardStyle}>
        <div style={columnsStyle}>
          {COLUMNS.map(column => (
            <ColumnView
              key={column}
              column={column}
              state={cols[column]}
              selectedId={selectedId}
              canEnter={canEnter}
              onMove={move}
              onSelect={select}
              onRetry={retry}
            >
              {column === "todo" && cols.todo.status === "ready" ? addForm : null}
            </ColumnView>
          ))}
        </div>
        <aside data-testid="detail" style={detailStyle}>
          {selectedId !== null && selectedFound ? (
            <Detail
              key={selectedId}
              id={selectedId}
              title={selectedFound.card.title}
              column={selectedFound.column}
              onRename={title => rename(selectedId, title)}
              onArchive={() => archive(selectedId)}
              onCount={(done, total) => adjustCounts(selectedId, done, total)}
            />
          ) : (
            <p>select a card</p>
          )}
        </aside>
      </div>
      {moveError !== null && <p data-testid="move-error">{`move error: ${moveError}`}</p>}
      {archiveError !== null && <p data-testid="archive-error">{`archive error: ${archiveError}`}</p>}
    </div>
  );
}

/* ---------- archive page ---------- */

type ArchiveState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; rows: Archived[] };

function ArchivePage() {
  const [state, setState] = useState<ArchiveState>({ status: "loading" });
  const [restoreError, setRestoreError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetchArchived().then(
      rows => {
        if (alive) setState({ status: "ready", rows });
      },
      (e: unknown) => {
        if (alive) setState({ status: "error", message: errorMessage(e) });
      },
    );
    return () => {
      alive = false;
    };
  }, []);

  function restore(row: Archived) {
    if (state.status !== "ready") return;
    const index = state.rows.findIndex(r => r.id === row.id);
    setRestoreError(null);
    setState((prev): ArchiveState =>
      prev.status === "ready" ? { status: "ready", rows: prev.rows.filter(r => r.id !== row.id) } : prev,
    );
    restoreCard(row.id).catch((e: unknown) => {
      setState((prev): ArchiveState =>
        prev.status === "ready"
          ? { status: "ready", rows: [...prev.rows.slice(0, index), row, ...prev.rows.slice(index)] }
          : prev,
      );
      setRestoreError(errorMessage(e));
    });
  }

  return (
    <div>
      <section data-testid="archived">
        {state.status === "loading" && <p>loading archive</p>}
        {state.status === "error" && <p>{`archive error: ${state.message}`}</p>}
        {state.status === "ready" && (
          <ul style={listStyle}>
            {state.rows.map(row => (
              <li key={row.id} style={rowStyle}>
                <span data-testid="archived-card">{`#${row.id} ${row.title}`}</span>
                <button type="button" data-testid="restore" onClick={() => restore(row)}>
                  restore
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      {restoreError !== null && <p data-testid="restore-error">{`restore error: ${restoreError}`}</p>}
    </div>
  );
}

/* ---------- root ---------- */

export default function App() {
  const [page, setPage] = useState<"board" | "archive">("board");
  return (
    <main style={pageStyle}>
      <nav style={rowStyle}>
        <button type="button" data-testid="tab-board" aria-pressed={page === "board"} onClick={() => setPage("board")}>
          Board
        </button>
        <button
          type="button"
          data-testid="tab-archive"
          aria-pressed={page === "archive"}
          onClick={() => setPage("archive")}
        >
          Archive
        </button>
      </nav>
      {page === "board" ? <BoardPage /> : <ArchivePage />}
    </main>
  );
}

/* ---------- styles ---------- */

const pageStyle = { fontFamily: "system-ui, sans-serif", padding: 16, maxWidth: 1100, margin: "0 auto" } as const;
const boardStyle = { display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-start" } as const;
const columnsStyle = { display: "flex", gap: 12, flexWrap: "wrap", flex: 3, minWidth: 0 } as const;
const columnStyle = { flex: "1 1 200px", minWidth: 0 } as const;
const detailStyle = { flex: "1 1 260px", minWidth: 0 } as const;
const headingStyle = { fontSize: 16 } as const;
const listStyle = { listStyle: "none", padding: 0 } as const;
const rowStyle = { display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" } as const;
