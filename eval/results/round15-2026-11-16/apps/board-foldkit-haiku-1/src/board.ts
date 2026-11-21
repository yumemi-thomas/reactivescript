import { Array, Option } from 'effect'
import { AsyncData } from 'foldkit'
import { modifyFields } from 'foldkit/struct'

import { FetchCards } from './command'
import {
  BoardCard,
  BoardPage,
  Card,
  CardsState,
  ColumnName,
  Direction,
} from './model'

// BOARD

export const columnNames: ReadonlyArray<ColumnName> = ['todo', 'doing', 'done']

export const columnLabel: Record<ColumnName, string> = {
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

export const doingLimit = 3

export type Placed = Readonly<{
  column: ColumnName
  index: number
  card: Card
}>

export type Step = Readonly<{
  column: ColumnName
  index: number
}>

export const freshBoard = (): BoardPage => ({
  columns: columnNames.map(name => ({ name, cards: CardsState.Loading() })),
  maybeSelection: Option.none(),
  newCardTitle: '',
  nextKey: 1,
  maybeMoveError: Option.none(),
  maybeAddError: Option.none(),
  maybeArchiveError: Option.none(),
})

export const boardCommands = (visit: number) =>
  columnNames.map(column => FetchCards({ visit, column }))

export const loadedCards = (
  board: BoardPage,
  name: ColumnName,
): Option.Option<ReadonlyArray<BoardCard>> =>
  Option.flatMap(
    Array.findFirst(board.columns, column => column.name === name),
    column =>
      AsyncData.isSuccess(column.cards)
        ? Option.some(column.cards.data)
        : Option.none(),
  )

export const cardsOf = (
  board: BoardPage,
  name: ColumnName,
): ReadonlyArray<BoardCard> =>
  Option.getOrElse(loadedCards(board, name), () => [])

export const savedOf = ({ id, title, done, total }: Card): Card => ({
  id,
  title,
  done,
  total,
})

const savedCount = (cards: ReadonlyArray<BoardCard>): number =>
  cards.filter(card => card._tag === 'Saved').length

export const placedSaved = (board: BoardPage): ReadonlyArray<Placed> =>
  columnNames.flatMap(column =>
    cardsOf(board, column).flatMap((card, index) =>
      card._tag === 'Saved'
        ? [{ column, index, card: savedOf(card) }]
        : [],
    ),
  )

export const locate = (
  board: BoardPage,
  id: number,
): Option.Option<Placed> =>
  Array.findFirst(placedSaved(board), placed => placed.card.id === id)

export const changeCards = (
  board: BoardPage,
  name: ColumnName,
  change: (cards: ReadonlyArray<BoardCard>) => ReadonlyArray<BoardCard>,
): BoardPage =>
  modifyFields(board, {
    columns: columns =>
      columns.map(column => {
        if (column.name !== name || !AsyncData.isSuccess(column.cards)) {
          return column
        }
        const data = change(column.cards.data)
        return modifyFields(column, { cards: () => CardsState.Success({ data }) })
      }),
  })

export const setColumn = (
  board: BoardPage,
  name: ColumnName,
  cards: typeof CardsState.schema.Type,
): BoardPage =>
  modifyFields(board, {
    columns: columns =>
      columns.map(column =>
        column.name === name
          ? modifyFields(column, { cards: () => cards })
          : column,
      ),
  })

export const mapSaved = (
  board: BoardPage,
  id: number,
  change: (card: Card) => Card,
): BoardPage =>
  columnNames.reduce(
    (next, name) =>
      changeCards(next, name, cards =>
        cards.map(card =>
          card._tag === 'Saved' && card.id === id
            ? BoardCard.Saved(change(savedOf(card)))
            : card,
        ),
      ),
    board,
  )

export const insertedAt = <A>(
  items: ReadonlyArray<A>,
  index: number,
  item: A,
): ReadonlyArray<A> => [...items.slice(0, index), item, ...items.slice(index)]

export const removedAt = <A>(
  items: ReadonlyArray<A>,
  index: number,
): ReadonlyArray<A> => items.filter((_, position) => position !== index)

const adjacentColumn = (
  column: ColumnName,
  offset: number,
): Option.Option<ColumnName> =>
  Option.fromNullishOr(columnNames[columnNames.indexOf(column) + offset])

const isSavedAt = (cards: ReadonlyArray<BoardCard>, index: number): boolean => {
  const card = cards[index]
  return card !== undefined && card._tag === 'Saved'
}

export const stepFor = (
  board: BoardPage,
  placed: Placed,
  direction: Direction,
): Option.Option<Step> => {
  const cards = cardsOf(board, placed.column)
  const sameColumn = (index: number): Option.Option<Step> =>
    isSavedAt(cards, index)
      ? Option.some({ column: placed.column, index })
      : Option.none()
  if (direction === 'up') {
    return sameColumn(placed.index - 1)
  }
  if (direction === 'down') {
    return sameColumn(placed.index + 1)
  }
  const offset = direction === 'left' ? -1 : 1
  return Option.flatMap(adjacentColumn(placed.column, offset), column =>
    Option.map(loadedCards(board, column), targetCards => ({
      column,
      index: savedCount(targetCards),
    })),
  )
}

export const blocked = (
  board: BoardPage,
  placed: Placed,
  step: Step,
): boolean =>
  step.column !== placed.column &&
  step.column === 'doing' &&
  cardsOf(board, 'doing').length >= doingLimit

export const movedBoard = (
  board: BoardPage,
  placed: Placed,
  step: Step,
): BoardPage => {
  const removed = changeCards(board, placed.column, cards =>
    removedAt(cards, placed.index),
  )
  return changeCards(removed, step.column, cards =>
    insertedAt(cards, step.index, BoardCard.Saved(placed.card)),
  )
}
