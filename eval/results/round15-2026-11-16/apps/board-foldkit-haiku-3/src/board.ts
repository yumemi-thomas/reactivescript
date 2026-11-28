import { Match, Option } from 'effect'
import { modifyFields } from 'foldkit/struct'

import {
  BoardCard,
  BoardPage,
  Card,
  ChecklistItem,
  ChecklistLoad,
  Column,
  ColumnLoad,
  Direction,
  Loads,
} from './model'

// BOARD

export const columns: ReadonlyArray<Column> = ['todo', 'doing', 'done']
export const columnLabels: Record<Column, string> = {
  todo: 'To do',
  doing: 'Doing',
  done: 'Done',
}
export const directions: ReadonlyArray<Direction> = [
  'left',
  'right',
  'up',
  'down',
]

const WIP_LIMIT = 3

export type SavedCard = Extract<BoardCard, { readonly _tag: 'Saved' }>
export type Location = {
  readonly column: Column
  readonly index: number
  readonly card: Card
}
export type MoveTarget = { readonly column: Column; readonly index: number }
export type MovePlan = {
  readonly from: Location
  readonly target: MoveTarget
  readonly blocked: boolean
}

export const insertAt = <A>(
  items: ReadonlyArray<A>,
  index: number,
  item: A,
): ReadonlyArray<A> => items.slice(0, index).concat([item], items.slice(index))

const setLoads = (loads: Loads, column: Column, load: ColumnLoad): Loads =>
  Match.value(column).pipe(
    Match.when('todo', () => modifyFields(loads, { todo: () => load })),
    Match.when('doing', () => modifyFields(loads, { doing: () => load })),
    Match.when('done', () => modifyFields(loads, { done: () => load })),
    Match.exhaustive,
  )

export const setLoad = (
  board: BoardPage,
  column: Column,
  load: ColumnLoad,
): BoardPage =>
  modifyFields(board, { columns: loads => setLoads(loads, column, load) })

export const isLoaded = (board: BoardPage, column: Column): boolean =>
  ColumnLoad.guards.Loaded(board.columns[column])

export const cardsIn = (
  board: BoardPage,
  column: Column,
): ReadonlyArray<BoardCard> =>
  ColumnLoad.matchOrElse(
    board.columns[column],
    { Loaded: ({ cards }) => cards },
    () => [],
  )

const editCards = (
  board: BoardPage,
  column: Column,
  edit: (cards: ReadonlyArray<BoardCard>) => ReadonlyArray<BoardCard>,
): BoardPage =>
  isLoaded(board, column)
    ? setLoad(
        board,
        column,
        ColumnLoad.Loaded({ cards: edit(cardsIn(board, column)) }),
      )
    : board

const isSaved = (card: BoardCard): card is SavedCard =>
  BoardCard.guards.Saved(card)

const isSavedWith = (card: BoardCard, id: number): boolean =>
  isSaved(card) && card.id === id

const isAdding = (card: BoardCard, key: number): boolean =>
  BoardCard.guards.Adding(card) && card.key === key

export const toCard = (card: SavedCard): Card => ({
  id: card.id,
  title: card.title,
  done: card.done,
  total: card.total,
})

const locateIn = (
  board: BoardPage,
  column: Column,
  id: number,
): Option.Option<Location> => {
  const cards = cardsIn(board, column)
  const index = cards.findIndex(card => isSavedWith(card, id))
  return Option.flatMap(Option.fromNullishOr(cards[index]), card =>
    isSaved(card)
      ? Option.some({ column, index, card: toCard(card) })
      : Option.none(),
  )
}

export const locate = (
  board: BoardPage,
  id: number,
): Option.Option<Location> =>
  columns.reduce<Option.Option<Location>>(
    (found, column) =>
      Option.isSome(found) ? found : locateIn(board, column, id),
    Option.none(),
  )

export const isSelected = (board: BoardPage, id: number): boolean =>
  Option.match(board.maybeSelectedId, {
    onNone: () => false,
    onSome: selectedId => selectedId === id,
  })

export const selectedLocation = (
  board: BoardPage,
): Option.Option<Location> =>
  Option.flatMap(board.maybeSelectedId, id => locate(board, id))

export const removeSaved = (board: BoardPage, id: number): BoardPage =>
  columns.reduce<BoardPage>(
    (next, column) =>
      editCards(next, column, cards =>
        cards.filter(card => !isSavedWith(card, id)),
      ),
    board,
  )

export const insertSaved = (
  board: BoardPage,
  column: Column,
  index: number,
  card: Card,
): BoardPage =>
  editCards(board, column, cards =>
    insertAt(cards, index, BoardCard.Saved(card)),
  )

export const appendCard = (
  board: BoardPage,
  column: Column,
  card: BoardCard,
): BoardPage =>
  editCards(board, column, cards => insertAt(cards, cards.length, card))

const mapSaved = (
  board: BoardPage,
  id: number,
  change: (card: Card) => Card,
): BoardPage =>
  columns.reduce<BoardPage>(
    (next, column) =>
      editCards(next, column, cards =>
        cards.map(card =>
          isSavedWith(card, id) && isSaved(card)
            ? BoardCard.Saved(change(toCard(card)))
            : card,
        ),
      ),
    board,
  )

export const renameCard = (
  board: BoardPage,
  id: number,
  title: string,
): BoardPage =>
  mapSaved(board, id, card => ({
    id: card.id,
    title,
    done: card.done,
    total: card.total,
  }))

export const adjustCounts = (
  board: BoardPage,
  id: number,
  doneDelta: number,
  totalDelta: number,
): BoardPage =>
  mapSaved(board, id, card => ({
    id: card.id,
    title: card.title,
    done: card.done + doneDelta,
    total: card.total + totalDelta,
  }))

export const replaceAdding = (
  board: BoardPage,
  column: Column,
  key: number,
  card: Card,
): BoardPage =>
  editCards(board, column, cards =>
    cards.map(existing =>
      isAdding(existing, key) ? BoardCard.Saved(card) : existing,
    ),
  )

export const removeAdding = (
  board: BoardPage,
  column: Column,
  key: number,
): BoardPage =>
  editCards(board, column, cards =>
    cards.filter(existing => !isAdding(existing, key)),
  )

export const setChecklist = (
  board: BoardPage,
  checklist: ChecklistLoad,
): BoardPage => modifyFields(board, { checklist: () => checklist })

export const checklistItems = (
  board: BoardPage,
): ReadonlyArray<ChecklistItem> =>
  ChecklistLoad.matchOrElse(
    board.checklist,
    { Loaded: ({ items }) => items },
    () => [],
  )

const mapChecklist = (
  board: BoardPage,
  edit: (items: ReadonlyArray<ChecklistItem>) => ReadonlyArray<ChecklistItem>,
): BoardPage =>
  ChecklistLoad.guards.Loaded(board.checklist)
    ? setChecklist(
        board,
        ChecklistLoad.Loaded({ items: edit(checklistItems(board)) }),
      )
    : board

export const itemDone = (
  board: BoardPage,
  itemId: number,
): Option.Option<boolean> =>
  Option.flatMap(
    Option.fromNullishOr(
      checklistItems(board).find(
        item => ChecklistItem.guards.Saved(item) && item.id === itemId,
      ),
    ),
    item =>
      ChecklistItem.guards.Saved(item)
        ? Option.some(item.done)
        : Option.none(),
  )

export const setItemDone = (
  board: BoardPage,
  itemId: number,
  done: boolean,
): BoardPage =>
  mapChecklist(board, items =>
    items.map(item =>
      ChecklistItem.guards.Saved(item) && item.id === itemId
        ? ChecklistItem.Saved({ id: item.id, text: item.text, done })
        : item,
    ),
  )

export const appendChecklistItem = (
  board: BoardPage,
  item: ChecklistItem,
): BoardPage => mapChecklist(board, items => insertAt(items, items.length, item))

export const replaceChecklistAdding = (
  board: BoardPage,
  key: number,
  saved: { readonly id: number; readonly text: string; readonly done: boolean },
): BoardPage =>
  mapChecklist(board, items =>
    items.map(item =>
      ChecklistItem.guards.Adding(item) && item.key === key
        ? ChecklistItem.Saved(saved)
        : item,
    ),
  )

export const removeChecklistAdding = (
  board: BoardPage,
  key: number,
): BoardPage =>
  mapChecklist(board, items =>
    items.filter(
      item => !(ChecklistItem.guards.Adding(item) && item.key === key),
    ),
  )

export const select = (board: BoardPage, id: number): BoardPage =>
  modifyFields(deselect(board), {
    maybeSelectedId: () => Option.some(id),
    checklist: () => ChecklistLoad.Loading(),
  })

export const deselect = (board: BoardPage): BoardPage =>
  modifyFields(board, {
    maybeSelectedId: () => Option.none(),
    checklist: () => ChecklistLoad.Idle(),
    titleInput: () => '',
    itemInput: () => '',
    maybeRenameError: () => Option.none(),
    maybeItemError: () => Option.none(),
  })

const neighbour = (column: Column, step: number): Option.Option<Column> =>
  Option.fromNullishOr(columns[columns.indexOf(column) + step])

const sideways = (
  board: BoardPage,
  column: Column,
  step: number,
): Option.Option<MoveTarget> =>
  Option.map(neighbour(column, step), next => ({
    column: next,
    index: cardsIn(board, next).length,
  }))

const targetFor = (
  board: BoardPage,
  from: Location,
  direction: Direction,
): Option.Option<MoveTarget> => {
  if (direction === 'left') {
    return sideways(board, from.column, -1)
  }
  if (direction === 'right') {
    return sideways(board, from.column, 1)
  }
  if (direction === 'up') {
    return from.index > 0
      ? Option.some({ column: from.column, index: from.index - 1 })
      : Option.none()
  }
  return from.index + 1 < cardsIn(board, from.column).length
    ? Option.some({ column: from.column, index: from.index + 1 })
    : Option.none()
}

const isMoveBlocked = (board: BoardPage, from: Column, to: Column): boolean => {
  if (from === to) {
    return false
  }
  if (!isLoaded(board, to)) {
    return true
  }
  return to === 'doing' && cardsIn(board, 'doing').length >= WIP_LIMIT
}

export const movePlan = (
  board: BoardPage,
  id: number,
  direction: Direction,
): Option.Option<MovePlan> =>
  Option.flatMap(locate(board, id), from =>
    Option.map(targetFor(board, from, direction), target => ({
      from,
      target,
      blocked: isMoveBlocked(board, from.column, target.column),
    })),
  )

export const moveCardTo = (
  board: BoardPage,
  from: Location,
  target: MoveTarget,
): BoardPage =>
  insertSaved(
    removeSaved(board, from.card.id),
    target.column,
    target.index,
    from.card,
  )

export const returnCard = (
  board: BoardPage,
  id: number,
  column: Column,
  index: number,
): BoardPage =>
  Option.match(locate(board, id), {
    onNone: () => board,
    onSome: location =>
      insertSaved(removeSaved(board, id), column, index, location.card),
  })
