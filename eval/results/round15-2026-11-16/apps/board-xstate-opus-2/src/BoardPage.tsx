import { useMachine } from '@xstate/react';
import type { SnapshotFrom } from 'xstate';
import type { Column } from './api.js';
import { boardMachine } from './boardMachine';
import {
  boardView,
  checklistView,
  COLUMN_NAMES,
  COLUMNS,
  findCard,
  moveButtons,
  type BoardView,
  type Dir,
} from './boardModel';
import type { BoardContext, BoardEvent } from './boardMachine';

type Send = (event: BoardEvent) => void;

export function BoardPage() {
  const [snapshot, send] = useMachine(boardMachine);
  const { context } = snapshot;
  const view = boardView(context.cards, context.ops);

  return (
    <div className="board-page">
      <div className="notices">
        {context.moveError !== null && (
          <p className="error" role="alert" data-testid="move-error">
            move error: {context.moveError}
          </p>
        )}
        {context.archiveError !== null && (
          <p className="error" role="alert" data-testid="archive-error">
            archive error: {context.archiveError}
          </p>
        )}
      </div>
      <div className="layout">
        <div className="columns">
          {COLUMNS.map(column => (
            <ColumnPanel
              key={column}
              column={column}
              view={view}
              error={context.columnErrors[column]}
              selectedId={context.selectedId}
              send={send}
            >
              {column === 'todo' && (
                <form
                  className="add-card"
                  onSubmit={e => {
                    e.preventDefault();
                    send({ type: 'card.add' });
                  }}
                >
                  <input
                    data-testid="new-card"
                    aria-label="New card title"
                    placeholder="New card"
                    value={context.newCard}
                    onChange={e => send({ type: 'newCard.change', value: e.target.value })}
                  />
                  <button type="submit" data-testid="add-card" disabled={view.todo === null}>
                    add
                  </button>
                  {context.addError !== null && (
                    <p className="error" role="alert" data-testid="add-error">
                      add error: {context.addError}
                    </p>
                  )}
                </form>
              )}
            </ColumnPanel>
          ))}
        </div>
        <Detail context={context} view={view} send={send} checklistState={checklistState(snapshot)} />
      </div>
    </div>
  );
}

type ChecklistState = 'loading' | 'ready' | 'failed' | 'none';

function checklistState(snapshot: SnapshotFrom<typeof boardMachine>): ChecklistState {
  if (snapshot.matches({ detail: { selected: 'loading' } })) return 'loading';
  if (snapshot.matches({ detail: { selected: 'ready' } })) return 'ready';
  if (snapshot.matches({ detail: { selected: 'failed' } })) return 'failed';
  return 'none';
}

function ColumnPanel({
  column,
  view,
  error,
  selectedId,
  send,
  children,
}: {
  column: Column;
  view: BoardView;
  error: string | null;
  selectedId: number | null;
  send: Send;
  children?: React.ReactNode;
}) {
  const col = view[column];
  const name = COLUMN_NAMES[column];
  const count = col ? col.cards.length + col.adding.length : 0;
  return (
    <section className="column" data-testid={`col-${column}`} aria-label={name}>
      <h2 data-testid={`head-${column}`}>{col ? `${name} (${count})` : name}</h2>
      {col === null && error === null && <p className="muted">loading</p>}
      {col === null && error !== null && (
        <div className="error" role="alert">
          <span>error: {error}</span>{' '}
          <button type="button" data-testid={`retry-${column}`} onClick={() => send({ type: 'column.retry', column })}>
            retry
          </button>
        </div>
      )}
      {col !== null && (
        <ul className="cards">
          {col.cards.map(card => (
            <li key={card.id} className={card.id === selectedId ? 'card-row selected' : 'card-row'}>
              <button
                type="button"
                className="card"
                data-testid="card"
                aria-pressed={card.id === selectedId}
                onClick={() => send({ type: 'card.select', id: card.id })}
              >
                #{card.id} {card.title} · {card.done}/{card.total}
              </button>
              <span className="moves">
                {moveButtons(view, card.id).map(b => (
                  <MoveButton key={b.dir} dir={b.dir} disabled={b.disabled} onClick={() => send({ type: 'card.move', id: card.id, dir: b.dir })} />
                ))}
              </span>
            </li>
          ))}
          {col.adding.map(row => (
            <li key={row.key} className="card-row pending">
              <span className="card" data-testid="card">
                {row.title} (adding…)
              </span>
            </li>
          ))}
        </ul>
      )}
      {children}
    </section>
  );
}

const ARROWS: Record<Dir, string> = { left: '←', right: '→', up: '↑', down: '↓' };

function MoveButton({ dir, disabled, onClick }: { dir: Dir; disabled: boolean; onClick: () => void }) {
  return (
    <button type="button" data-testid={dir} aria-label={`move ${dir}`} title={ARROWS[dir]} disabled={disabled} onClick={onClick}>
      {dir}
    </button>
  );
}

function Detail({
  context,
  view,
  send,
  checklistState,
}: {
  context: BoardContext;
  view: BoardView;
  send: Send;
  checklistState: ChecklistState;
}) {
  const found = context.selectedId === null ? null : findCard(view, context.selectedId);
  if (!found) {
    return (
      <aside className="detail" data-testid="detail">
        <p className="muted">select a card</p>
      </aside>
    );
  }
  const { card, column } = found;
  const rows = checklistView(context.items, context.ops, card.id);
  const doneCount = rows ? rows.filter(r => r.kind === 'item' && r.item.done).length : 0;
  return (
    <aside className="detail" data-testid="detail">
      <h2>
        #{card.id} {card.title}
      </h2>
      <p className="muted">in {COLUMN_NAMES[column]}</p>

      <form
        className="rename"
        onSubmit={e => {
          e.preventDefault();
          send({ type: 'card.rename' });
        }}
      >
        <input
          data-testid="title-input"
          aria-label="New title"
          placeholder="New title"
          value={context.titleInput}
          onChange={e => send({ type: 'title.change', value: e.target.value })}
        />
        <button type="submit" data-testid="rename">
          rename
        </button>
      </form>
      {context.renameError !== null && (
        <p className="error" role="alert">
          rename error: {context.renameError}
        </p>
      )}
      <button type="button" data-testid="archive" onClick={() => send({ type: 'card.archive' })}>
        archive
      </button>

      <div className="checklist" data-testid="checklist">
        <h3>Checklist</h3>
        {checklistState === 'loading' && <p className="muted">loading checklist</p>}
        {checklistState === 'failed' && (
          <p className="error" role="alert">
            checklist error: {context.checklistError}
          </p>
        )}
        {rows !== null && (
          <>
            <ul className="items">
              {rows.map(row =>
                row.kind === 'item' ? (
                  <li key={row.item.id} className="row">
                    <span data-testid="item">
                      {row.item.done ? '[x]' : '[ ]'} {row.item.text}
                    </span>
                    <button
                      type="button"
                      data-testid="toggle"
                      onClick={() => send({ type: 'item.toggle', itemId: row.item.id })}
                    >
                      toggle
                    </button>
                  </li>
                ) : (
                  <li key={row.key} className="row pending">
                    <span data-testid="item">[ ] {row.text} (adding…)</span>
                  </li>
                ),
              )}
            </ul>
            <p data-testid="progress">
              {doneCount}/{rows.length} done
            </p>
          </>
        )}
      </div>
      <form
        className="add-item"
        onSubmit={e => {
          e.preventDefault();
          send({ type: 'item.add' });
        }}
      >
        <input
          data-testid="item-input"
          aria-label="New item"
          placeholder="New item"
          value={context.itemInput}
          onChange={e => send({ type: 'itemInput.change', value: e.target.value })}
        />
        <button type="submit" data-testid="add-item">
          add item
        </button>
      </form>
      {context.itemError !== null && (
        <p className="error" role="alert">
          item error: {context.itemError}
        </p>
      )}
    </aside>
  );
}
