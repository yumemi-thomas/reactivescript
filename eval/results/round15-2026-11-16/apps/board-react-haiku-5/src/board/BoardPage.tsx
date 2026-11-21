import { useEffect, useReducer, useState, type FormEvent } from "react";
import { addCard, addItem, archiveCard, fetchCards, fetchChecklist, moveCard, renameCard, toggleItem, type Column } from "../api.js";
import { messageOf } from "../errors";
import { DetailPanel } from "./DetailPanel";
import {
  COLUMNS,
  COLUMN_NAMES,
  DIRS,
  WIP_LIMIT,
  boardReducer,
  initialBoard,
  locateById,
  nextReq,
  nextUid,
  targetOf,
  type ArchivePlan,
  type BoardCard,
  type Dir,
  type MovePlan,
} from "./state";

export function BoardPage() {
  const [state, dispatch] = useReducer(boardReducer, initialBoard);
  const [newTitle, setNewTitle] = useState("");
  const { load, cards, selectedId } = state;
  const selected = selectedId === null ? null : locateById(cards, selectedId);

  // The three columns load when the page opens (their state starts with req 0).
  useEffect(() => {
    for (const column of COLUMNS) {
      fetchCards(column).then(
        list => dispatch({ type: "load/ok", column, req: 0, cards: list }),
        err => dispatch({ type: "load/err", column, req: 0, message: messageOf(err) }),
      );
    }
  }, []);

  // The checklist of the selected card.
  useEffect(() => {
    if (selectedId === null) return;
    fetchChecklist(selectedId).then(
      items => dispatch({ type: "checklist/ok", cardId: selectedId, items }),
      err => dispatch({ type: "checklist/err", cardId: selectedId, message: messageOf(err) }),
    );
  }, [selectedId]);

  function retry(column: Column) {
    const req = nextReq();
    dispatch({ type: "load/start", column, req });
    fetchCards(column).then(
      list => dispatch({ type: "load/ok", column, req, cards: list }),
      err => dispatch({ type: "load/err", column, req, message: messageOf(err) }),
    );
  }

  /** A move into a column that is not loaded, or into a full Doing, is not allowed. */
  function moveBlocked(column: Column, to: Column): boolean {
    if (to === column) return false;
    if (load[to].status !== "ready") return true;
    return to === "doing" && cards.doing.length >= WIP_LIMIT;
  }

  function move(card: BoardCard, column: Column, index: number, dir: Dir) {
    const target = targetOf(cards, column, index, dir);
    if (card.id === null || target === null || moveBlocked(column, target.to)) return;
    const plan: MovePlan = {
      uid: card.uid,
      id: card.id,
      from: column,
      fromIndex: index,
      to: target.to,
      toIndex: target.toIndex,
    };
    dispatch({ type: "move/start", plan });
    moveCard(card.id, target.to, target.toIndex).catch(err =>
      dispatch({ type: "move/revert", plan, message: messageOf(err) }),
    );
  }

  function submitAdd(e: FormEvent) {
    e.preventDefault();
    const title = newTitle.trim();
    if (!title || load.todo.status !== "ready") return;
    const uid = nextUid();
    setNewTitle("");
    dispatch({ type: "add/start", uid, title });
    addCard("todo", title).then(
      card => dispatch({ type: "add/ok", uid, card }),
      err => dispatch({ type: "add/err", uid, message: messageOf(err) }),
    );
  }

  function renameSelected(title: string) {
    const card = selected?.card;
    const next = title.trim();
    if (card === undefined || card.id === null || !next) return;
    const id = card.id;
    dispatch({ type: "rename/start", id, title: next });
    renameCard(id, next).catch(err =>
      dispatch({ type: "rename/revert", id, previous: card.title, message: messageOf(err) }),
    );
  }

  function archiveSelected() {
    if (selected === null || selected.card.id === null) return;
    const id = selected.card.id;
    const plan: ArchivePlan = { card: selected.card, column: selected.column, index: selected.index };
    dispatch({ type: "archive/start", plan });
    archiveCard(id).catch(err => dispatch({ type: "archive/revert", plan, message: messageOf(err) }));
  }

  /** `value` is the item's current done state; the click flips it. */
  function flipItem(itemId: number, value: boolean) {
    if (selectedId === null) return;
    const cardId = selectedId;
    dispatch({ type: "toggle/start", cardId, itemId, value: !value });
    toggleItem(cardId, itemId, !value).catch(err =>
      dispatch({ type: "toggle/revert", cardId, itemId, value, message: messageOf(err) }),
    );
  }

  function addItemTo(text: string) {
    const next = text.trim();
    if (selectedId === null || !next || state.checklist?.status !== "ready") return;
    const cardId = selectedId;
    const uid = nextUid();
    dispatch({ type: "item-add/start", cardId, uid, text: next });
    addItem(cardId, next).then(
      item => dispatch({ type: "item-add/ok", cardId, uid, item }),
      err => dispatch({ type: "item-add/err", cardId, uid, message: messageOf(err) }),
    );
  }

  return (
    <div className="board-page">
      <div className="workspace">
        <div className="columns">
          {COLUMNS.map(column => {
            const ls = load[column];
            const list = cards[column];
            const heading = ls.status === "ready" ? `${COLUMN_NAMES[column]} (${list.length})` : COLUMN_NAMES[column];
            return (
              <section key={column} className="column" data-testid={`col-${column}`}>
                <h2 data-testid={`head-${column}`}>{heading}</h2>
                {ls.status === "loading" && <p className="muted">loading</p>}
                {ls.status === "error" && (
                  <div className="column-error">
                    <p className="error">{`error: ${ls.message}`}</p>
                    <button type="button" data-testid={`retry-${column}`} onClick={() => retry(column)}>
                      retry
                    </button>
                  </div>
                )}
                {ls.status === "ready" &&
                  list.map((card, index) => {
                    const id = card.id;
                    return (
                      <div className="card-row" key={card.uid}>
                        <button
                          type="button"
                          data-testid="card"
                          className="card"
                          disabled={id === null}
                          aria-pressed={id !== null && id === selectedId}
                          onClick={() => {
                            if (id !== null) dispatch({ type: "select", id });
                          }}
                        >
                          {id === null ? `${card.title} (adding…)` : `#${id} ${card.title} · ${card.done}/${card.total}`}
                        </button>
                        {id !== null && (
                          <div className="moves">
                            {DIRS.map(dir => {
                              const target = targetOf(cards, column, index, dir);
                              if (target === null) return null;
                              return (
                                <button
                                  key={dir}
                                  type="button"
                                  data-testid={dir}
                                  disabled={moveBlocked(column, target.to)}
                                  onClick={() => move(card, column, index, dir)}
                                >
                                  {dir}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                {column === "todo" && (
                  <>
                    <form className="add" onSubmit={submitAdd}>
                      <input
                        data-testid="new-card"
                        aria-label="New card title"
                        placeholder="New card"
                        value={newTitle}
                        onChange={e => setNewTitle(e.target.value)}
                      />
                      <button type="submit" data-testid="add-card" disabled={ls.status !== "ready"}>
                        add
                      </button>
                    </form>
                    {state.addError !== null && (
                      <p className="error" data-testid="add-error">{`add error: ${state.addError}`}</p>
                    )}
                  </>
                )}
              </section>
            );
          })}
        </div>
        <DetailPanel
          key={selectedId ?? "none"}
          card={selected?.card ?? null}
          column={selected?.column ?? "todo"}
          checklist={state.checklist}
          renameError={state.renameError}
          itemError={state.itemError}
          onRename={renameSelected}
          onArchive={archiveSelected}
          onFlip={flipItem}
          onAddItem={addItemTo}
        />
      </div>
      {state.moveError !== null && <p className="error" data-testid="move-error">{`move error: ${state.moveError}`}</p>}
      {state.archiveError !== null && (
        <p className="error" data-testid="archive-error">{`archive error: ${state.archiveError}`}</p>
      )}
    </div>
  );
}
