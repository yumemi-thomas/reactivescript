import { useMachine } from '@xstate/react';
import type { KeyboardEvent, ReactNode } from 'react';
import type { Column } from './api';
import { boardMachine, type BoardEvent } from './boardMachine';
import {
  COLUMN_NAMES,
  COLUMNS,
  DIRS,
  deriveWorld,
  findCard,
  moveTarget,
  type ColStatus,
  type ViewCard,
  type World,
} from './boardModel';

type Send = (event: BoardEvent) => void;

const onEnter = (action: () => void) => (e: KeyboardEvent<HTMLInputElement>) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    action();
  }
};

export function BoardPage() {
  const [snapshot, send] = useMachine(boardMachine);
  const ctx = snapshot.context;
  const world = deriveWorld(ctx.base, ctx.ops);

  return (
    <section className="board-page">
      <div className="errors">
        {ctx.errors.move && (
          <p className="error" role="alert" data-testid="move-error">
            {ctx.errors.move}
          </p>
        )}
        {ctx.errors.archive && (
          <p className="error" role="alert" data-testid="archive-error">
            {ctx.errors.archive}
          </p>
        )}
      </div>
      <div className="layout">
        <div className="columns">
          {COLUMNS.map((column) => (
            <BoardColumn
              key={column}
              column={column}
              world={world}
              colStatus={ctx.colStatus}
              error={ctx.colError[column]}
              selected={ctx.selected}
              send={send}
            >
              {column === 'todo' && (
                <div className="add-card">
                  <input
                    data-testid="new-card"
                    aria-label="New card title"
                    placeholder="New card"
                    value={ctx.drafts.newCard}
                    onChange={(e) => send({ type: 'draft.newCard', value: e.target.value })}
                    onKeyDown={onEnter(() => send({ type: 'add' }))}
                  />
                  <button type="button" data-testid="add-card" onClick={() => send({ type: 'add' })}>
                    add
                  </button>
                  {ctx.errors.add && (
                    <p className="error" role="alert" data-testid="add-error">
                      {ctx.errors.add}
                    </p>
                  )}
                </div>
              )}
            </BoardColumn>
          ))}
        </div>
        <Detail
          world={world}
          selected={ctx.selected}
          checklist={
            snapshot.matches({ detail: 'loading' })
              ? 'loading'
              : snapshot.matches({ detail: 'failed' })
                ? 'failed'
                : 'ready'
          }
          checklistError={ctx.checklistError}
          titleDraft={ctx.drafts.title}
          itemDraft={ctx.drafts.item}
          renameError={ctx.errors.rename}
          itemError={ctx.errors.item}
          send={send}
        />
      </div>
    </section>
  );
}

function BoardColumn(props: {
  column: Column;
  world: World;
  colStatus: Record<Column, ColStatus>;
  error: string | null;
  selected: number | null;
  send: Send;
  children?: ReactNode;
}) {
  const { column, world, colStatus, error, selected, send, children } = props;
  const status = colStatus[column];
  const cards = world.cols[column];
  const name = COLUMN_NAMES[column];
  return (
    <div className="column" data-testid={`col-${column}`}>
      <h2 data-testid={`head-${column}`}>{status === 'ready' ? `${name} (${cards.length})` : name}</h2>
      {status === 'loading' && <p className="muted">loading</p>}
      {status === 'failed' && (
        <p className="error" role="alert">
          error: {error}{' '}
          <button type="button" data-testid={`retry-${column}`} onClick={() => send({ type: 'retry', column })}>
            retry
          </button>
        </p>
      )}
      {status === 'ready' && (
        <ul className="cards">
          {cards.map((card) => (
            <CardRow
              key={card.key}
              card={card}
              world={world}
              colStatus={colStatus}
              selected={card.id !== null && card.id === selected}
              send={send}
            />
          ))}
        </ul>
      )}
      {children}
    </div>
  );
}

function CardRow(props: {
  card: ViewCard;
  world: World;
  colStatus: Record<Column, ColStatus>;
  selected: boolean;
  send: Send;
}) {
  const { card, world, colStatus, selected, send } = props;
  const id = card.id;
  if (card.adding || id === null) {
    return (
      <li className="card-row adding">
        <span className="card" data-testid="card">{`${card.title} (adding…)`}</span>
      </li>
    );
  }
  return (
    <li className={selected ? 'card-row selected' : 'card-row'}>
      <button
        type="button"
        className="card"
        data-testid="card"
        aria-pressed={selected}
        onClick={() => send({ type: 'select', cardId: id })}
      >{`#${id} ${card.title} · ${card.done}/${card.total}`}</button>
      <span className="moves">
        {DIRS.map((dir) => {
          const target = moveTarget(world, colStatus, id, dir);
          if (target.kind === 'hidden') return null;
          return (
            <button
              key={dir}
              type="button"
              data-testid={dir}
              aria-label={`move #${id} ${dir}`}
              disabled={target.kind === 'disabled'}
              onClick={() => send({ type: 'move', cardId: id, dir })}
            >
              {dir}
            </button>
          );
        })}
      </span>
    </li>
  );
}

function Detail(props: {
  world: World;
  selected: number | null;
  checklist: 'loading' | 'failed' | 'ready';
  checklistError: string | null;
  titleDraft: string;
  itemDraft: string;
  renameError: string | null;
  itemError: string | null;
  send: Send;
}) {
  const { world, selected, checklist, checklistError, titleDraft, itemDraft, renameError, itemError, send } = props;
  const at = selected === null ? null : findCard(world.cols, selected);
  if (selected === null || at === null) {
    return (
      <aside className="detail" data-testid="detail">
        <p className="muted">select a card</p>
      </aside>
    );
  }
  const card = world.cols[at.column][at.index];
  const items = world.lists[selected] ?? [];
  const doneCount = items.filter((i) => i.done).length;
  return (
    <aside className="detail" data-testid="detail">
      <h2>{`#${selected} ${card.title}`}</h2>
      <p className="muted">{`in ${COLUMN_NAMES[at.column]}`}</p>
      <div className="rename">
        <input
          data-testid="title-input"
          aria-label="New title"
          placeholder="New title"
          value={titleDraft}
          onChange={(e) => send({ type: 'draft.title', value: e.target.value })}
          onKeyDown={onEnter(() => send({ type: 'rename' }))}
        />
        <button type="button" data-testid="rename" onClick={() => send({ type: 'rename' })}>
          rename
        </button>
        <button type="button" data-testid="archive" onClick={() => send({ type: 'archive' })}>
          archive
        </button>
      </div>
      {renameError && (
        <p className="error" role="alert" data-testid="rename-error">
          {renameError}
        </p>
      )}
      <div className="checklist" data-testid="checklist">
        {checklist === 'loading' && <p className="muted">loading checklist</p>}
        {checklist === 'failed' && (
          <p className="error" role="alert">{`checklist error: ${checklistError ?? ''}`}</p>
        )}
        {checklist === 'ready' && (
          <>
            <ul className="items">
              {items.map((item) => {
                const itemId = item.id;
                return (
                  <li key={item.key} className="item-row">
                    <span data-testid="item">
                      {`${item.done ? '[x]' : '[ ]'} ${item.text}${item.adding ? ' (adding…)' : ''}`}
                    </span>
                    {!item.adding && itemId !== null && (
                      <button
                        type="button"
                        data-testid="toggle"
                        aria-label={`toggle ${item.text}`}
                        onClick={() => send({ type: 'toggle', itemId })}
                      >
                        toggle
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
            <p data-testid="progress">{`${doneCount}/${items.length} done`}</p>
          </>
        )}
      </div>
      <div className="add-item">
        <input
          data-testid="item-input"
          aria-label="New checklist item"
          placeholder="New item"
          value={itemDraft}
          onChange={(e) => send({ type: 'draft.item', value: e.target.value })}
          onKeyDown={onEnter(() => send({ type: 'addItem' }))}
        />
        <button type="button" data-testid="add-item" onClick={() => send({ type: 'addItem' })}>
          add item
        </button>
      </div>
      {itemError && (
        <p className="error" role="alert" data-testid="item-error">
          {itemError}
        </p>
      )}
    </aside>
  );
}
