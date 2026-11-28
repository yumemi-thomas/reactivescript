import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import {
  addCard,
  addItem,
  archiveCard,
  fetchCards,
  fetchChecklist,
  moveCard,
  renameCard,
  toggleItem,
  type Card,
  type Column,
  type Item,
} from "./api.js";
import { errorMessage, nextSeq, useRebased } from "./rebase";

const COLUMNS: Column[] = ["todo", "doing", "done"];
const NAMES: Record<Column, string> = { todo: "To do", doing: "Doing", done: "Done" };
const WIP_LIMIT = 3;

type CardView = Card & { pending?: boolean };
type ItemView = Item & { pending?: boolean };
type ColState = { status: "loading" } | { status: "error"; message: string } | { status: "ok"; cards: CardView[] };
type ListState = { status: "loading" } | { status: "error"; message: string } | { status: "ok"; items: ItemView[] };
type BoardState = { cols: Record<Column, ColState>; lists: Partial<Record<number, ListState>> };

type Op =
  | { kind: "move"; id: number; to: Column; index: number }
  | { kind: "rename"; id: number; title: string }
  | { kind: "archive"; id: number }
  | { kind: "addCard"; tempId: number; title: string; id?: number }
  | { kind: "toggle"; cardId: number; itemId: number; done: boolean }
  | { kind: "addItem"; cardId: number; tempId: number; text: string; item?: Item };

const init = (): BoardState => ({
  cols: { todo: { status: "loading" }, doing: { status: "loading" }, done: { status: "loading" } },
  lists: {},
});

function mapCard(s: BoardState, id: number, f: (c: CardView) => CardView): BoardState {
  let changed = false;
  const cols = { ...s.cols };
  for (const col of COLUMNS) {
    const st = cols[col];
    if (st.status !== "ok" || !st.cards.some(c => c.id === id)) continue;
    cols[col] = { status: "ok", cards: st.cards.map(c => (c.id === id ? f(c) : c)) };
    changed = true;
  }
  return changed ? { ...s, cols } : s;
}

function takeCard(s: BoardState, id: number): [BoardState["cols"], CardView | undefined] {
  const cols = { ...s.cols };
  for (const col of COLUMNS) {
    const st = cols[col];
    if (st.status !== "ok") continue;
    const i = st.cards.findIndex(c => c.id === id);
    if (i < 0) continue;
    cols[col] = { status: "ok", cards: st.cards.filter((_, j) => j !== i) };
    return [cols, st.cards[i]];
  }
  return [cols, undefined];
}

function setList(s: BoardState, cardId: number, list: ListState): BoardState {
  return { ...s, lists: { ...s.lists, [cardId]: list } };
}

function applyOp(s: BoardState, op: Op): BoardState {
  switch (op.kind) {
    case "move": {
      const target = s.cols[op.to];
      if (target.status !== "ok") return s;
      const [cols, card] = takeCard(s, op.id);
      if (!card) return s;
      const t = cols[op.to] as { status: "ok"; cards: CardView[] };
      const cards = [...t.cards];
      cards.splice(Math.max(0, Math.min(op.index, cards.length)), 0, card);
      cols[op.to] = { status: "ok", cards };
      return { ...s, cols };
    }
    case "rename":
      return mapCard(s, op.id, c => ({ ...c, title: op.title }));
    case "archive": {
      const [cols, card] = takeCard(s, op.id);
      return card ? { ...s, cols } : s;
    }
    case "addCard": {
      const todo = s.cols.todo;
      if (todo.status !== "ok") return s;
      const card: CardView =
        op.id === undefined
          ? { id: op.tempId, title: op.title, done: 0, total: 0, pending: true }
          : { id: op.id, title: op.title, done: 0, total: 0 };
      if (todo.cards.some(c => c.id === card.id)) return s;
      return { ...s, cols: { ...s.cols, todo: { status: "ok", cards: [...todo.cards, card] } } };
    }
    case "toggle": {
      const list = s.lists[op.cardId];
      if (list?.status !== "ok") return s;
      const item = list.items.find(i => i.id === op.itemId);
      if (!item || item.done === op.done) return s;
      const next = setList(s, op.cardId, {
        status: "ok",
        items: list.items.map(i => (i.id === op.itemId ? { ...i, done: op.done } : i)),
      });
      return mapCard(next, op.cardId, c => ({ ...c, done: c.done + (op.done ? 1 : -1) }));
    }
    case "addItem": {
      let next = mapCard(s, op.cardId, c => ({ ...c, total: c.total + 1 }));
      const list = s.lists[op.cardId];
      if (list?.status === "ok") {
        const item: ItemView = op.item ?? { id: op.tempId, text: op.text, done: false, pending: true };
        if (!list.items.some(i => i.id === item.id)) {
          next = setList(next, op.cardId, { status: "ok", items: [...list.items, item] });
        }
      }
      return next;
    }
  }
}

function findCard(s: BoardState, id: number): { card: CardView; column: Column } | null {
  for (const column of COLUMNS) {
    const st = s.cols[column];
    if (st.status !== "ok") continue;
    const card = st.cards.find(c => c.id === id);
    if (card) return { card, column };
  }
  return null;
}

export default function Board() {
  const { view, setBase, run } = useRebased(applyOp, init);
  const [selection, setSelection] = useState<{ id: number; seq: number } | null>(null);
  const [moveError, setMoveError] = useState<string | null>(null);
  const [addError, setAddError] = useState<string | null>(null);
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const started = useRef(false);
  const colRequests = useRef<Record<Column, number>>({ todo: 0, doing: 0, done: 0 });
  const listRequests = useRef(new Map<number, number>());

  const loadColumn = useCallback(
    (col: Column) => {
      const n = nextSeq();
      colRequests.current[col] = n;
      fetchCards(col).then(
        cards => {
          if (colRequests.current[col] === n) setBase(b => ({ ...b, cols: { ...b.cols, [col]: { status: "ok", cards } } }));
        },
        (e: unknown) => {
          if (colRequests.current[col] === n)
            setBase(b => ({ ...b, cols: { ...b.cols, [col]: { status: "error", message: errorMessage(e) } } }));
        },
      );
    },
    [setBase],
  );

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    for (const col of COLUMNS) loadColumn(col);
  }, [loadColumn]);

  function retry(col: Column) {
    setBase(b => ({ ...b, cols: { ...b.cols, [col]: { status: "loading" } } }));
    loadColumn(col);
  }

  function loadList(id: number) {
    const n = nextSeq();
    listRequests.current.set(id, n);
    // keep a checklist already shown while it is asked again
    setBase(b => (b.lists[id]?.status === "ok" ? b : setList(b, id, { status: "loading" })));
    fetchChecklist(id).then(
      items => {
        if (listRequests.current.get(id) === n) setBase(b => setList(b, id, { status: "ok", items }));
      },
      (e: unknown) => {
        if (listRequests.current.get(id) === n)
          setBase(b => (b.lists[id]?.status === "ok" ? b : setList(b, id, { status: "error", message: errorMessage(e) })));
      },
    );
  }

  function select(id: number) {
    setSelection({ id, seq: nextSeq() });
    loadList(id);
  }

  function move(id: number, to: Column, index: number) {
    setMoveError(null);
    const op: Op = { kind: "move", id, to, index };
    run(op, () => moveCard(id, to, index), () => op).catch((e: unknown) => setMoveError(errorMessage(e)));
  }

  function submitCard(e: FormEvent) {
    e.preventDefault();
    const title = newTitle.trim();
    if (!title) return;
    setNewTitle("");
    setAddError(null);
    const tempId = -nextSeq();
    run(
      { kind: "addCard", tempId, title },
      () => addCard("todo", title),
      r => ({ kind: "addCard", tempId, title: r.title, id: r.id }),
    ).catch((err: unknown) => setAddError(errorMessage(err)));
  }

  function archive(id: number) {
    setSelection(null);
    setArchiveError(null);
    const op: Op = { kind: "archive", id };
    run(op, () => archiveCard(id), () => op).catch((e: unknown) => setArchiveError(errorMessage(e)));
  }

  function rename(id: number, title: string): Promise<unknown> {
    return run({ kind: "rename", id, title }, () => renameCard(id, title), r => ({ kind: "rename", id, title: r.title }));
  }

  function toggle(cardId: number, itemId: number, done: boolean): Promise<unknown> {
    return run(
      { kind: "toggle", cardId, itemId, done },
      () => toggleItem(cardId, itemId, done),
      r => ({ kind: "toggle", cardId, itemId, done: r.done }),
    );
  }

  function addChecklistItem(cardId: number, text: string): Promise<unknown> {
    const tempId = -nextSeq();
    return run(
      { kind: "addItem", cardId, tempId, text },
      () => addItem(cardId, text),
      item => ({ kind: "addItem", cardId, tempId, text, item }),
    );
  }

  const doing = view.cols.doing;
  const doingFull = doing.status === "ok" && doing.cards.length >= WIP_LIMIT;
  const selected = selection ? findCard(view, selection.id) : null;

  return (
    <div className="board">
      {moveError !== null && (
        <p className="error" role="alert" data-testid="move-error" style={{ gridColumn: "1 / -1" }}>
          move error: {moveError}
        </p>
      )}
      {archiveError !== null && (
        <p className="error" role="alert" data-testid="archive-error" style={{ gridColumn: "1 / -1" }}>
          archive error: {archiveError}
        </p>
      )}
      {COLUMNS.map((col, ci) => {
        const st = view.cols[col];
        const left = COLUMNS[ci - 1] as Column | undefined;
        const right = COLUMNS[ci + 1] as Column | undefined;
        const canEnter = (target: Column) => {
          const t = view.cols[target];
          return t.status === "ok" && !(target === "doing" && doingFull);
        };
        const bottomOf = (target: Column) => {
          const t = view.cols[target];
          return t.status === "ok" ? t.cards.length : 0;
        };
        return (
          <section key={col} className="col" data-testid={`col-${col}`} aria-labelledby={`head-${col}`}>
            <h2 id={`head-${col}`} data-testid={`head-${col}`}>
              {st.status === "ok" ? `${NAMES[col]} (${st.cards.length})` : NAMES[col]}
            </h2>
            {st.status === "loading" && <p className="muted">loading</p>}
            {st.status === "error" && (
              <p className="error" role="alert">
                error: {st.message}{" "}
                <button type="button" className="small" data-testid={`retry-${col}`} onClick={() => retry(col)}>
                  retry
                </button>
              </p>
            )}
            {st.status === "ok" && (
              <ul className="cards">
                {st.cards.map((c, i) => (
                  <li key={c.id}>
                    {c.pending ? (
                      <span className="card pending" data-testid="card">{`${c.title} (adding…)`}</span>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="card"
                          data-testid="card"
                          aria-pressed={selection?.id === c.id}
                          onClick={() => select(c.id)}
                        >{`#${c.id} ${c.title} · ${c.done}/${c.total}`}</button>
                        <span className="moves">
                          {left && (
                            <button type="button" data-testid="left" disabled={!canEnter(left)} onClick={() => move(c.id, left, bottomOf(left))}>
                              left
                            </button>
                          )}
                          {right && (
                            <button type="button" data-testid="right" disabled={!canEnter(right)} onClick={() => move(c.id, right, bottomOf(right))}>
                              right
                            </button>
                          )}
                          {i > 0 && (
                            <button type="button" data-testid="up" onClick={() => move(c.id, col, i - 1)}>
                              up
                            </button>
                          )}
                          {i < st.cards.length - 1 && (
                            <button type="button" data-testid="down" onClick={() => move(c.id, col, i + 1)}>
                              down
                            </button>
                          )}
                        </span>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {col === "todo" && (
              <>
                <form className="row" onSubmit={submitCard}>
                  <input
                    data-testid="new-card"
                    aria-label="New card title"
                    placeholder="New card"
                    value={newTitle}
                    onChange={e => setNewTitle(e.target.value)}
                  />
                  <button type="submit" data-testid="add-card" disabled={st.status !== "ok"}>
                    add
                  </button>
                </form>
                {addError !== null && (
                  <p className="error" role="alert" data-testid="add-error">
                    add error: {addError}
                  </p>
                )}
              </>
            )}
          </section>
        );
      })}
      <aside className="detail" data-testid="detail" aria-label="Card detail">
        {selection && selected ? (
          <Detail
            key={selection.seq}
            card={selected.card}
            column={selected.column}
            list={view.lists[selected.card.id] ?? { status: "loading" }}
            onRename={rename}
            onArchive={archive}
            onToggle={toggle}
            onAddItem={addChecklistItem}
          />
        ) : (
          <p className="muted">select a card</p>
        )}
      </aside>
    </div>
  );
}

type DetailProps = {
  card: CardView;
  column: Column;
  list: ListState;
  onRename: (id: number, title: string) => Promise<unknown>;
  onArchive: (id: number) => void;
  onToggle: (cardId: number, itemId: number, done: boolean) => Promise<unknown>;
  onAddItem: (cardId: number, text: string) => Promise<unknown>;
};

function Detail({ card, column, list, onRename, onArchive, onToggle, onAddItem }: DetailProps) {
  const [title, setTitle] = useState("");
  const [itemText, setItemText] = useState("");
  const [renameError, setRenameError] = useState<string | null>(null);
  const [itemError, setItemError] = useState<string | null>(null);

  function submitRename(e: FormEvent) {
    e.preventDefault();
    const t = title.trim();
    if (!t) return;
    setRenameError(null);
    onRename(card.id, t).catch((err: unknown) => setRenameError(errorMessage(err)));
  }

  function submitItem(e: FormEvent) {
    e.preventDefault();
    const t = itemText.trim();
    if (!t) return;
    setItemText("");
    setItemError(null);
    onAddItem(card.id, t).catch((err: unknown) => setItemError(errorMessage(err)));
  }

  function toggle(item: Item) {
    setItemError(null);
    onToggle(card.id, item.id, !item.done).catch((err: unknown) => setItemError(errorMessage(err)));
  }

  const items = list.status === "ok" ? list.items : [];
  const doneCount = items.filter(i => i.done).length;

  return (
    <>
      <h2>{`#${card.id} ${card.title}`}</h2>
      <p className="muted">{`in ${NAMES[column]}`}</p>
      <form className="row" onSubmit={submitRename}>
        <input data-testid="title-input" aria-label="New title" placeholder="New title" value={title} onChange={e => setTitle(e.target.value)} />
        <button type="submit" data-testid="rename">
          rename
        </button>
      </form>
      {renameError !== null && (
        <p className="error" role="alert">
          rename error: {renameError}
        </p>
      )}
      <p>
        <button type="button" data-testid="archive" onClick={() => onArchive(card.id)}>
          archive
        </button>
      </p>
      <div data-testid="checklist">
        <h3>Checklist</h3>
        {list.status === "loading" && <p className="muted">loading checklist</p>}
        {list.status === "error" && (
          <p className="error" role="alert">
            checklist error: {list.message}
          </p>
        )}
        {list.status === "ok" && (
          <>
            <ul className="items">
              {items.map(item => (
                <li key={item.id}>
                  <span data-testid="item">{`${item.done ? "[x]" : "[ ]"} ${item.text}${item.pending ? " (adding…)" : ""}`}</span>
                  {!item.pending && (
                    <button type="button" className="small" data-testid="toggle" onClick={() => toggle(item)}>
                      toggle
                    </button>
                  )}
                </li>
              ))}
            </ul>
            <p data-testid="progress">{`${doneCount}/${items.length} done`}</p>
          </>
        )}
      </div>
      <form className="row" onSubmit={submitItem}>
        <input data-testid="item-input" aria-label="New checklist item" placeholder="New item" value={itemText} onChange={e => setItemText(e.target.value)} />
        <button type="submit" data-testid="add-item">
          add item
        </button>
      </form>
      {itemError !== null && (
        <p className="error" role="alert">
          item error: {itemError}
        </p>
      )}
    </>
  );
}
