import { Array, Option } from 'effect'
import { modifyFields } from 'foldkit/struct'

import {
  Board,
  BoardCard,
  Checklist,
  ChecklistItem,
  Column,
  ColumnId,
  ColumnLoad,
  Direction,
  Selected,
  Selection,
  SavedCard,
  SavedItem,
} from './model'

// BOARD

export const WIP_LIMIT = 3

const columnOrder: ReadonlyArray<ColumnId> = ['todo', 'doing', 'done']

export type Located = {
  readonly column: ColumnId
  readonly index: number
  readonly card: BoardCard
}

export type Move = {
  readonly direction: Direction
  readonly toColumn: ColumnId
  readonly toIndex: number
  readonly enabled: boolean
}

export const isLoaded = (column: Column): boolean =>
  ColumnLoad.guards.Loaded(column.load)

export const titleOf = (card: BoardCard): string =>
  BoardCard.match<string>(card, {
    Saved: saved => saved.title,
    Adding: pending => pending.title,
  })

const isSavedWithId = (card: BoardCard, cardId: number): boolean =>
  BoardCard.match<boolean>(card, {
    Saved: saved => saved.id === cardId,
    Adding: () => false,
  })

const isPendingWith = (card: BoardCard, localId: number): boolean =>
  BoardCard.match<boolean>(card, {
    Saved: () => false,
    Adding: pending => pending.localId === localId,
  })

export const withColumn = (
  board: Board,
  columnId: ColumnId,
  change: (column: Column) => Column,
): Board =>
  modifyFields(board, {
    todo: column => (columnId === 'todo' ? change(column) : column),
    doing: column => (columnId === 'doing' ? change(column) : column),
    done: column => (columnId === 'done' ? change(column) : column),
  })

export const mapColumns = (
  board: Board,
  change: (column: Column) => Column,
): Board => modifyFields(board, { todo: change, doing: change, done: change })

export const mapCards = (
  board: Board,
  change: (card: BoardCard) => BoardCard,
): Board =>
  mapColumns(board, column =>
    modifyFields(column, { cards: cards => Array.map(cards, change) }),
  )

const mapSaved = (
  board: Board,
  cardId: number,
  change: (saved: SavedCard) => SavedCard,
): Board =>
  mapCards(board, card =>
    BoardCard.match<BoardCard>(card, {
      Saved: saved =>
        saved.id === cardId ? BoardCard.Saved(change(saved)) : card,
      Adding: () => card,
    }),
  )

export const adjustCounts = (
  board: Board,
  cardId: number,
  doneDelta: number,
  totalDelta: number,
): Board =>
  mapSaved(board, cardId, saved =>
    modifyFields(saved, {
      done: done => done + doneDelta,
      total: total => total + totalDelta,
    }),
  )

export const renameCardTitle = (
  board: Board,
  cardId: number,
  title: string,
): Board =>
  mapSaved(board, cardId, saved => modifyFields(saved, { title: () => title }))

export const locate = (board: Board, cardId: number): Option.Option<Located> =>
  Array.findFirst(
    Array.flatMap(columnOrder, columnId =>
      Array.map(board[columnId].cards, (card, index) => ({
        column: columnId,
        index,
        card,
      })),
    ),
    ({ card }) => isSavedWithId(card, cardId),
  )

export const removeCard = (board: Board, cardId: number): Board =>
  mapColumns(board, column =>
    modifyFields(column, {
      cards: cards =>
        Array.filter(cards, card => !isSavedWithId(card, cardId)),
    }),
  )

export const insertCard = (
  board: Board,
  columnId: ColumnId,
  index: number,
  card: BoardCard,
): Board =>
  withColumn(board, columnId, column =>
    modifyFields(column, {
      cards: cards => [...cards.slice(0, index), card, ...cards.slice(index)],
    }),
  )

export const moveCard = (
  board: Board,
  cardId: number,
  toColumn: ColumnId,
  toIndex: number,
): Board =>
  Option.match(locate(board, cardId), {
    onNone: () => board,
    onSome: ({ card }) =>
      insertCard(removeCard(board, cardId), toColumn, toIndex, card),
  })

const isSavedAt = (cards: ReadonlyArray<BoardCard>, index: number): boolean =>
  Option.match(Array.get(cards, index), {
    onNone: () => false,
    onSome: card =>
      BoardCard.match<boolean>(card, {
        Saved: () => true,
        Adding: () => false,
      }),
  })

const adjacentColumn = (
  columnId: ColumnId,
  step: number,
): Option.Option<ColumnId> =>
  Array.get(columnOrder, columnOrder.indexOf(columnId) + step)

const sideMoves = (
  board: Board,
  columnId: ColumnId,
  direction: Direction,
  step: number,
): ReadonlyArray<Move> =>
  Option.match(adjacentColumn(columnId, step), {
    onNone: () => [],
    onSome: toColumn =>
      isLoaded(board[toColumn])
        ? [
            {
              direction,
              toColumn,
              toIndex: board[toColumn].cards.length,
              enabled:
                toColumn !== 'doing' || board.doing.cards.length < WIP_LIMIT,
            },
          ]
        : [],
  })

const verticalMove = (
  cards: ReadonlyArray<BoardCard>,
  columnId: ColumnId,
  direction: Direction,
  toIndex: number,
): ReadonlyArray<Move> =>
  isSavedAt(cards, toIndex)
    ? [{ direction, toColumn: columnId, toIndex, enabled: true }]
    : []

export const movesFrom = (
  board: Board,
  columnId: ColumnId,
  index: number,
): ReadonlyArray<Move> => {
  const column = board[columnId]
  return isLoaded(column)
    ? [
        ...sideMoves(board, columnId, 'left', -1),
        ...sideMoves(board, columnId, 'right', 1),
        ...verticalMove(column.cards, columnId, 'up', index - 1),
        ...verticalMove(column.cards, columnId, 'down', index + 1),
      ]
    : []
}

export const addPending = (
  board: Board,
  localId: number,
  title: string,
): Board =>
  withColumn(board, 'todo', column =>
    modifyFields(column, {
      cards: cards => [...cards, BoardCard.Adding({ localId, title })],
    }),
  )

export const resolvePending = (
  board: Board,
  localId: number,
  cardId: number,
): Board =>
  mapCards(board, card =>
    BoardCard.match<BoardCard>(card, {
      Saved: () => card,
      Adding: pending =>
        pending.localId === localId
          ? BoardCard.Saved({
              id: cardId,
              title: pending.title,
              done: 0,
              total: 0,
            })
          : card,
    }),
  )

export const dropPending = (board: Board, localId: number): Board =>
  mapColumns(board, column =>
    modifyFields(column, {
      cards: cards =>
        Array.filter(cards, card => !isPendingWith(card, localId)),
    }),
  )

export const selectedOf = (board: Board): Option.Option<Selected> =>
  Selection.match<Option.Option<Selected>>(board.selection, {
    NoSelection: () => Option.none(),
    Selected: selected => Option.some(selected),
  })

export const updateSelection = (
  board: Board,
  change: (selected: Selected) => Selected,
): Board =>
  modifyFields(board, {
    selection: selection =>
      Selection.match<Selection>(selection, {
        NoSelection: () => selection,
        Selected: change,
      }),
  })

export const updateSelected = (
  board: Board,
  cardId: number,
  change: (selected: Selected) => Selected,
): Board =>
  updateSelection(board, selected =>
    selected.cardId === cardId ? change(selected) : selected,
  )

export const mapItems = (
  selected: Selected,
  change: (
    items: ReadonlyArray<ChecklistItem>,
  ) => ReadonlyArray<ChecklistItem>,
): Selected =>
  modifyFields(selected, {
    checklist: checklist =>
      Checklist.match<Checklist>(checklist, {
        Loading: () => checklist,
        Failed: () => checklist,
        Loaded: ({ items }) => Checklist.Loaded({ items: change(items) }),
      }),
  })

export const mapSavedItems = (
  selected: Selected,
  itemId: number,
  change: (saved: SavedItem) => SavedItem,
): Selected =>
  mapItems(selected, items =>
    Array.map(items, item =>
      ChecklistItem.match<ChecklistItem>(item, {
        Saved: saved =>
          saved.id === itemId ? ChecklistItem.Saved(change(saved)) : item,
        Adding: () => item,
      }),
    ),
  )

export const savedItems = (selected: Selected): ReadonlyArray<SavedItem> =>
  Checklist.match<ReadonlyArray<SavedItem>>(selected.checklist, {
    Loading: () => [],
    Failed: () => [],
    Loaded: ({ items }) =>
      Array.flatMap(items, item =>
        ChecklistItem.match<ReadonlyArray<SavedItem>>(item, {
          Saved: saved => [saved],
          Adding: () => [],
        }),
      ),
  })

export const setItemDone = (
  board: Board,
  cardId: number,
  itemId: number,
  done: boolean,
): Board =>
  updateSelected(board, cardId, selected =>
    mapSavedItems(selected, itemId, saved =>
      modifyFields(saved, { done: () => done }),
    ),
  )
