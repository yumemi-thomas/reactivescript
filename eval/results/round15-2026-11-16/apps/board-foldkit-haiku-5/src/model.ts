import { Array, Option, Schema } from 'effect'
import { AsyncData } from 'foldkit'
import { defineTaggedUnion } from 'foldkit/schema'

// MODEL

export const ColumnName = Schema.Literals(['todo', 'doing', 'done'])
export type ColumnName = typeof ColumnName.Type

export const MoveDirection = Schema.Literals(['left', 'right', 'up', 'down'])
export type MoveDirection = typeof MoveDirection.Type

export const BoardCard = Schema.Struct({
  id: Schema.Number,
  title: Schema.String,
  done: Schema.Number,
  total: Schema.Number,
})
export type BoardCard = typeof BoardCard.Type

export const ChecklistItem = Schema.Struct({
  id: Schema.Number,
  text: Schema.String,
  done: Schema.Boolean,
})
export type ChecklistItem = typeof ChecklistItem.Type

export const ArchivedCard = Schema.Struct({
  id: Schema.Number,
  title: Schema.String,
})
export type ArchivedCard = typeof ArchivedCard.Type

export const CardsData = AsyncData.Schema(
  Schema.Array(BoardCard),
  Schema.String,
)
export type CardsState = typeof CardsData.schema.Type

export const ChecklistData = AsyncData.Schema(
  Schema.Array(ChecklistItem),
  Schema.String,
)
export type ChecklistState = typeof ChecklistData.schema.Type

export const ArchiveData = AsyncData.Schema(
  Schema.Array(ArchivedCard),
  Schema.String,
)
export type ArchiveState = typeof ArchiveData.schema.Type

export const BoardColumn = Schema.Struct({
  name: ColumnName,
  cards: CardsData.schema,
})
export type BoardColumn = typeof BoardColumn.Type

export const PendingCard = Schema.Struct({
  key: Schema.Number,
  title: Schema.String,
})
export type PendingCard = typeof PendingCard.Type

export const PendingItem = Schema.Struct({
  key: Schema.Number,
  text: Schema.String,
})
export type PendingItem = typeof PendingItem.Type

export const Selection = Schema.Struct({
  cardId: Schema.Number,
  checklist: ChecklistData.schema,
  pendingItems: Schema.Array(PendingItem),
  renameInput: Schema.String,
  itemInput: Schema.String,
  maybeRenameError: Schema.Option(Schema.String),
  maybeItemError: Schema.Option(Schema.String),
})
export type Selection = typeof Selection.Type

export const Page = defineTaggedUnion({
  Board: {
    visit: Schema.Number,
    columns: Schema.Array(BoardColumn),
    pendingCards: Schema.Array(PendingCard),
    nextKey: Schema.Number,
    newCardTitle: Schema.String,
    maybeMoveError: Schema.Option(Schema.String),
    maybeAddError: Schema.Option(Schema.String),
    maybeArchiveError: Schema.Option(Schema.String),
    maybeSelection: Schema.Option(Selection),
  },
  Archive: {
    visit: Schema.Number,
    archived: ArchiveData.schema,
    maybeRestoreError: Schema.Option(Schema.String),
  },
})
export type Page = typeof Page.Type
export type BoardPage = typeof Page.Board.Type
export type ArchivePage = typeof Page.Archive.Type

export const Model = Schema.Struct({
  page: Page,
  nextVisit: Schema.Number,
})
export type Model = typeof Model.Type

export const COLUMN_NAMES: ReadonlyArray<ColumnName> = ['todo', 'doing', 'done']
export const MOVE_DIRECTIONS: ReadonlyArray<MoveDirection> = [
  'left',
  'right',
  'up',
  'down',
]
const WIP_LIMIT = 3

export const boardPageFor = (visit: number): BoardPage =>
  Page.Board({
  visit,
  columns: COLUMN_NAMES.map(name => ({ name, cards: CardsData.Loading() })),
  pendingCards: [],
  nextKey: 0,
  newCardTitle: '',
  maybeMoveError: Option.none(),
  maybeAddError: Option.none(),
  maybeArchiveError: Option.none(),
  maybeSelection: Option.none(),
  })

// QUERY

export const dataOf = (state: CardsState): ReadonlyArray<BoardCard> =>
  Option.getOrElse(
    AsyncData.getData(state),
    (): ReadonlyArray<BoardCard> => [],
  )

export const columnCards = (board: BoardPage, name: ColumnName): CardsState =>
  Option.match(
    Array.findFirst(board.columns, column => column.name === name),
    {
      onNone: () => CardsData.Idle(),
      onSome: column => column.cards,
    },
  )

export const savedCards = (
  board: BoardPage,
  name: ColumnName,
): ReadonlyArray<BoardCard> => dataOf(columnCards(board, name))

export const isColumnLoaded = (board: BoardPage, name: ColumnName): boolean =>
  AsyncData.isSuccess(columnCards(board, name))

const canEnter = (board: BoardPage, name: ColumnName): boolean =>
  isColumnLoaded(board, name) &&
  !(name === 'doing' && savedCards(board, 'doing').length >= WIP_LIMIT)

export type Placement = {
  readonly column: ColumnName
  readonly index: number
  readonly card: BoardCard
}

export type Destination = {
  readonly column: ColumnName
  readonly index: number
}

export const placements = (board: BoardPage): ReadonlyArray<Placement> =>
  board.columns.flatMap(column =>
    dataOf(column.cards).map((card, index) => ({
      column: column.name,
      index,
      card,
    })),
  )

export const locateCard = (
  board: BoardPage,
  id: number,
): Option.Option<Placement> =>
  Array.findFirst(placements(board), placement => placement.card.id === id)

const columnNeighbor = (
  name: ColumnName,
  offset: number,
): Option.Option<ColumnName> =>
  Option.fromNullishOr(COLUMN_NAMES[COLUMN_NAMES.indexOf(name) + offset])

export const moveDestination = (
  board: BoardPage,
  placement: Placement,
  direction: MoveDirection,
): Option.Option<Destination> => {
  if (direction === 'up') {
    return placement.index > 0
      ? Option.some({ column: placement.column, index: placement.index - 1 })
      : Option.none()
  }
  if (direction === 'down') {
    return placement.index + 1 < savedCards(board, placement.column).length
      ? Option.some({ column: placement.column, index: placement.index + 1 })
      : Option.none()
  }
  return Option.map(
    columnNeighbor(placement.column, direction === 'left' ? -1 : 1),
    column => ({ column, index: savedCards(board, column).length }),
  )
}

export const moveAllowed = (
  board: BoardPage,
  placement: Placement,
  destination: Destination,
): boolean =>
  destination.column === placement.column ||
  canEnter(board, destination.column)
