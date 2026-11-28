import { Array, Option, Schema, pipe } from 'effect'
import { defineTaggedUnion } from 'foldkit/schema'
import { modifyFields } from 'foldkit/struct'

// COLUMN

export const ColumnId = Schema.Literals(['todo', 'doing', 'done'])
export type ColumnId = typeof ColumnId.Type

export const COLUMN_IDS: ReadonlyArray<ColumnId> = ['todo', 'doing', 'done']

export const DOING_LIMIT = 3

export const columnName = (column: ColumnId): string =>
  column === 'todo' ? 'To do' : column === 'doing' ? 'Doing' : 'Done'

export const columnToLeft = (column: ColumnId): Option.Option<ColumnId> =>
  column === 'todo'
    ? Option.none()
    : Option.some(column === 'doing' ? 'todo' : 'doing')

export const columnToRight = (column: ColumnId): Option.Option<ColumnId> =>
  column === 'done'
    ? Option.none()
    : Option.some(column === 'todo' ? 'doing' : 'done')

export const Direction = Schema.Literals(['left', 'right', 'up', 'down'])
export type Direction = typeof Direction.Type

// CARD

export const Card = Schema.Struct({
  id: Schema.Number,
  title: Schema.String,
  done: Schema.Number,
  total: Schema.Number,
})
export type Card = typeof Card.Type

export const ColumnLoad = defineTaggedUnion({
  ColumnLoading: { requestId: Schema.Number },
  ColumnFailed: { error: Schema.String },
  ColumnLoaded: { cards: Schema.Array(Card) },
})
export type ColumnLoad = typeof ColumnLoad.Type

export const Columns = Schema.Struct({
  todo: ColumnLoad,
  doing: ColumnLoad,
  done: ColumnLoad,
})
export type Columns = typeof Columns.Type

// CHECKLIST

export const Item = Schema.Struct({
  id: Schema.Number,
  text: Schema.String,
  done: Schema.Boolean,
})
export type Item = typeof Item.Type

export const KnownChecklist = Schema.Struct({
  cardId: Schema.Number,
  items: Schema.Array(Item),
})
export type KnownChecklist = typeof KnownChecklist.Type

// PENDING OPERATION

export const BoardOperation = defineTaggedUnion({
  MoveOperation: {
    operationId: Schema.Number,
    cardId: Schema.Number,
    column: ColumnId,
    index: Schema.Number,
  },
  RenameOperation: {
    operationId: Schema.Number,
    cardId: Schema.Number,
    title: Schema.String,
  },
  AddCardOperation: { operationId: Schema.Number, title: Schema.String },
  ArchiveOperation: { operationId: Schema.Number, cardId: Schema.Number },
  ToggleItemOperation: {
    operationId: Schema.Number,
    cardId: Schema.Number,
    itemId: Schema.Number,
    done: Schema.Boolean,
  },
  AddItemOperation: {
    operationId: Schema.Number,
    cardId: Schema.Number,
    text: Schema.String,
  },
})
export type BoardOperation = typeof BoardOperation.Type

export const findOperation = (
  operations: ReadonlyArray<BoardOperation>,
  operationId: number,
): Option.Option<BoardOperation> =>
  Array.findFirst(
    operations,
    operation => operation.operationId === operationId,
  )

export const withoutOperation = (
  operations: ReadonlyArray<BoardOperation>,
  operationId: number,
): ReadonlyArray<BoardOperation> =>
  Array.filter(operations, operation => operation.operationId !== operationId)

// LANES

export type Lanes<A> = Readonly<Record<ColumnId, Option.Option<ReadonlyArray<A>>>>

export type Located<A> = Readonly<{
  column: ColumnId
  index: number
  entry: A
}>

const mapLanes = <A, B>(
  lanes: Lanes<A>,
  f: (entries: ReadonlyArray<A>, column: ColumnId) => ReadonlyArray<B>,
): Lanes<B> => ({
  todo: Option.map(lanes.todo, entries => f(entries, 'todo')),
  doing: Option.map(lanes.doing, entries => f(entries, 'doing')),
  done: Option.map(lanes.done, entries => f(entries, 'done')),
})

export const locateInLanes = <A>(
  lanes: Lanes<A>,
  isWanted: (entry: A) => boolean,
): Option.Option<Located<A>> =>
  Array.findFirst(COLUMN_IDS, (column): Option.Option<Located<A>> =>
    pipe(
      lanes[column],
      Option.flatMap(entries =>
        pipe(
          Array.findFirstIndex(entries, isWanted),
          Option.flatMap(index =>
            Option.map(Array.get(entries, index), entry => ({
              column,
              index,
              entry,
            })),
          ),
        ),
      ),
    ),
  )

const clampIndex = (index: number, length: number): number =>
  Math.max(0, Math.min(index, length))

const insertClamped = <A>(
  entries: ReadonlyArray<A>,
  index: number,
  entry: A,
): ReadonlyArray<A> =>
  pipe(
    Array.insertAt(entries, clampIndex(index, entries.length), entry),
    Option.getOrElse(() => Array.append(entries, entry)),
  )

export const moveInLanes = <A>(
  lanes: Lanes<A>,
  isWanted: (entry: A) => boolean,
  toColumn: ColumnId,
  toIndex: number,
): Lanes<A> =>
  Option.match(locateInLanes(lanes, isWanted), {
    onNone: () => lanes,
    onSome: located => {
      if (Option.isNone(lanes[toColumn])) {
        return lanes
      }
      const removed = mapLanes(lanes, (entries, column) =>
        column === located.column ? Array.remove(entries, located.index) : entries,
      )
      return mapLanes(removed, (entries, column) =>
        column === toColumn
          ? insertClamped(entries, toIndex, located.entry)
          : entries,
      )
    },
  })

export const removeFromLanes = <A>(
  lanes: Lanes<A>,
  isWanted: (entry: A) => boolean,
): Lanes<A> =>
  mapLanes(lanes, entries => Array.filter(entries, entry => !isWanted(entry)))

export const mapLaneEntries = <A, B>(
  lanes: Lanes<A>,
  f: (entry: A) => B,
): Lanes<B> => mapLanes(lanes, entries => Array.map(entries, f))

export const appendToLane = <A>(
  lanes: Lanes<A>,
  column: ColumnId,
  entry: A,
): Lanes<A> =>
  mapLanes(lanes, (entries, laneColumn) =>
    laneColumn === column ? Array.append(entries, entry) : entries,
  )

// SERVER STATE

const loadedCards = (load: ColumnLoad): Option.Option<ReadonlyArray<Card>> =>
  ColumnLoad.match(load, {
    ColumnLoading: () => Option.none(),
    ColumnFailed: () => Option.none(),
    ColumnLoaded: ({ cards }) => Option.some(cards),
  })

export const columnsToLanes = (columns: Columns): Lanes<Card> => ({
  todo: loadedCards(columns.todo),
  doing: loadedCards(columns.doing),
  done: loadedCards(columns.done),
})

const writeLane = (
  load: ColumnLoad,
  maybeCards: Option.Option<ReadonlyArray<Card>>,
): ColumnLoad =>
  ColumnLoad.match(load, {
    ColumnLoading: () => load,
    ColumnFailed: () => load,
    ColumnLoaded: () =>
      Option.match(maybeCards, {
        onNone: () => load,
        onSome: cards => ColumnLoad.ColumnLoaded({ cards }),
      }),
  })

export const modifyServerCards = (
  columns: Columns,
  f: (lanes: Lanes<Card>) => Lanes<Card>,
): Columns => {
  const nextLanes = f(columnsToLanes(columns))
  return {
    todo: writeLane(columns.todo, nextLanes.todo),
    doing: writeLane(columns.doing, nextLanes.doing),
    done: writeLane(columns.done, nextLanes.done),
  }
}

export const hasCardId =
  (cardId: number) =>
  (card: Card): boolean =>
    card.id === cardId

export const confirmOperation = (
  columns: Columns,
  checklists: ReadonlyArray<KnownChecklist>,
  operation: BoardOperation,
): Readonly<{
  columns: Columns
  checklists: ReadonlyArray<KnownChecklist>
}> =>
  BoardOperation.match(operation, {
    MoveOperation: ({ cardId, column, index }) => ({
      columns: modifyServerCards(columns, lanes =>
        moveInLanes(lanes, hasCardId(cardId), column, index),
      ),
      checklists,
    }),
    RenameOperation: ({ cardId, title }) => ({
      columns: modifyServerCards(columns, lanes =>
        mapLaneEntries(lanes, card =>
          card.id === cardId ? modifyFields(card, { title: () => title }) : card,
        ),
      ),
      checklists,
    }),
    AddCardOperation: () => ({ columns, checklists }),
    ArchiveOperation: ({ cardId }) => ({
      columns: modifyServerCards(columns, lanes =>
        removeFromLanes(lanes, hasCardId(cardId)),
      ),
      checklists,
    }),
    ToggleItemOperation: ({ cardId, itemId, done }) => ({
      columns,
      checklists: modifyKnownItems(checklists, cardId, items =>
        Array.map(items, item =>
          item.id === itemId ? modifyFields(item, { done: () => done }) : item,
        ),
      ),
    }),
    AddItemOperation: () => ({ columns, checklists }),
  })

export const addConfirmedCard = (columns: Columns, card: Card): Columns =>
  modifyServerCards(columns, lanes =>
    Option.isSome(locateInLanes(lanes, hasCardId(card.id)))
      ? lanes
      : appendToLane(lanes, 'todo', card),
  )

// KNOWN CHECKLISTS

export const findKnownItems = (
  checklists: ReadonlyArray<KnownChecklist>,
  cardId: number,
): Option.Option<ReadonlyArray<Item>> =>
  pipe(
    Array.findFirst(checklists, checklist => checklist.cardId === cardId),
    Option.map(({ items }) => items),
  )

export const rememberChecklist = (
  checklists: ReadonlyArray<KnownChecklist>,
  cardId: number,
  items: ReadonlyArray<Item>,
): ReadonlyArray<KnownChecklist> =>
  Array.append(
    Array.filter(checklists, checklist => checklist.cardId !== cardId),
    { cardId, items },
  )

export const modifyKnownItems = (
  checklists: ReadonlyArray<KnownChecklist>,
  cardId: number,
  f: (items: ReadonlyArray<Item>) => ReadonlyArray<Item>,
): ReadonlyArray<KnownChecklist> =>
  Array.map(checklists, checklist =>
    checklist.cardId === cardId
      ? modifyFields(checklist, { items: () => f(checklist.items) })
      : checklist,
  )

export const addConfirmedItem = (
  checklists: ReadonlyArray<KnownChecklist>,
  cardId: number,
  item: Item,
): ReadonlyArray<KnownChecklist> =>
  modifyKnownItems(checklists, cardId, items =>
    Array.some(items, ({ id }) => id === item.id)
      ? items
      : Array.append(items, item),
  )

// SHOWN STATE

export const ShownRow = defineTaggedUnion({
  SettledRow: { card: Card },
  AddingRow: { operationId: Schema.Number, title: Schema.String },
})
export type ShownRow = typeof ShownRow.Type

export const ShownItem = defineTaggedUnion({
  SettledItem: { item: Item },
  AddingItem: { operationId: Schema.Number, text: Schema.String },
})
export type ShownItem = typeof ShownItem.Type

export const isRowOfCard =
  (cardId: number) =>
  (row: ShownRow): boolean =>
    row._tag === 'SettledRow' && row.card.id === cardId

export const shownItems = (
  checklists: ReadonlyArray<KnownChecklist>,
  operations: ReadonlyArray<BoardOperation>,
  cardId: number,
): Option.Option<ReadonlyArray<ShownItem>> =>
  Option.map(findKnownItems(checklists, cardId), items =>
    Array.reduce(
      operations,
      Array.map(items, item => ShownItem.SettledItem({ item })),
      (shown: ReadonlyArray<ShownItem>, operation) => {
        if (operation._tag === 'ToggleItemOperation' && operation.cardId === cardId) {
          return Array.map(shown, entry =>
            entry._tag === 'SettledItem' && entry.item.id === operation.itemId
              ? ShownItem.SettledItem({
                  item: modifyFields(entry.item, { done: () => operation.done }),
                })
              : entry,
          )
        }
        if (operation._tag === 'AddItemOperation' && operation.cardId === cardId) {
          return Array.append(
            shown,
            ShownItem.AddingItem({
              operationId: operation.operationId,
              text: operation.text,
            }),
          )
        }
        return shown
      },
    ),
  )

export const isItemDone = (item: ShownItem): boolean =>
  item._tag === 'SettledItem' && item.item.done

export const countDone = (items: ReadonlyArray<ShownItem>): number =>
  Array.filter(items, isItemDone).length

const applyToRows = (
  lanes: Lanes<ShownRow>,
  operation: BoardOperation,
): Lanes<ShownRow> =>
  BoardOperation.match(operation, {
    MoveOperation: ({ cardId, column, index }) =>
      moveInLanes(lanes, isRowOfCard(cardId), column, index),
    RenameOperation: ({ cardId, title }) =>
      mapLaneEntries(lanes, row =>
        isRowOfCard(cardId)(row) && row._tag === 'SettledRow'
          ? ShownRow.SettledRow({
              card: modifyFields(row.card, { title: () => title }),
            })
          : row,
      ),
    AddCardOperation: ({ operationId, title }) =>
      appendToLane(lanes, 'todo', ShownRow.AddingRow({ operationId, title })),
    ArchiveOperation: ({ cardId }) =>
      removeFromLanes(lanes, isRowOfCard(cardId)),
    ToggleItemOperation: () => lanes,
    AddItemOperation: () => lanes,
  })

export const shownLanes = (
  columns: Columns,
  checklists: ReadonlyArray<KnownChecklist>,
  operations: ReadonlyArray<BoardOperation>,
): Lanes<ShownRow> => {
  const settled = mapLaneEntries(columnsToLanes(columns), card =>
    ShownRow.SettledRow({ card }),
  )
  const moved = Array.reduce(operations, settled, applyToRows)
  return mapLaneEntries(moved, row =>
    ShownRow.match(row, {
      AddingRow: () => row,
      SettledRow: ({ card }) =>
        Option.match(shownItems(checklists, operations, card.id), {
          onNone: () => row,
          onSome: items =>
            ShownRow.SettledRow({
              card: modifyFields(card, {
                done: () => countDone(items),
                total: () => items.length,
              }),
            }),
        }),
    }),
  )
}

export const laneLength = <A>(lanes: Lanes<A>, column: ColumnId): Option.Option<number> =>
  Option.map(lanes[column], entries => entries.length)

export const isDoingFull = (lanes: Lanes<ShownRow>): boolean =>
  Option.exists(laneLength(lanes, 'doing'), length => length >= DOING_LIMIT)

export const findShownCard = (
  lanes: Lanes<ShownRow>,
  cardId: number,
): Option.Option<Readonly<{ column: ColumnId; index: number; card: Card }>> =>
  pipe(
    locateInLanes(lanes, isRowOfCard(cardId)),
    Option.flatMap(({ column, index, entry }) =>
      entry._tag === 'SettledRow'
        ? Option.some({ column, index, card: entry.card })
        : Option.none(),
    ),
  )

export type MoveTarget = Readonly<{ column: ColumnId; index: number }>

const sideTarget = (
  lanes: Lanes<ShownRow>,
  maybeColumn: Option.Option<ColumnId>,
): Option.Option<MoveTarget> =>
  pipe(
    maybeColumn,
    Option.filter(column => column !== 'doing' || !isDoingFull(lanes)),
    Option.flatMap(column =>
      Option.map(laneLength(lanes, column), index => ({ column, index })),
    ),
  )

export const moveTarget = (
  lanes: Lanes<ShownRow>,
  column: ColumnId,
  index: number,
  direction: Direction,
): Option.Option<MoveTarget> => {
  const length = Option.getOrElse(laneLength(lanes, column), () => 0)
  if (direction === 'left') {
    return sideTarget(lanes, columnToLeft(column))
  }
  if (direction === 'right') {
    return sideTarget(lanes, columnToRight(column))
  }
  if (direction === 'up') {
    return index > 0 ? Option.some({ column, index: index - 1 }) : Option.none()
  }
  return index < length - 1
    ? Option.some({ column, index: index + 1 })
    : Option.none()
}

// ARCHIVE

export const ArchivedCard = Schema.Struct({
  id: Schema.Number,
  title: Schema.String,
})
export type ArchivedCard = typeof ArchivedCard.Type

export const ArchiveLoad = defineTaggedUnion({
  ArchiveLoading: { requestId: Schema.Number },
  ArchiveFailed: { error: Schema.String },
  ArchiveLoaded: { cards: Schema.Array(ArchivedCard) },
})
export type ArchiveLoad = typeof ArchiveLoad.Type

export const RestoreOperation = Schema.Struct({
  operationId: Schema.Number,
  cardId: Schema.Number,
})
export type RestoreOperation = typeof RestoreOperation.Type
