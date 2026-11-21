import { Array, Match, Option, Schema, pipe } from 'effect'
import { defineTaggedUnion } from 'foldkit/schema'

// COLUMN

export const ColumnId = Schema.Literals(['todo', 'doing', 'done'])
export type ColumnId = typeof ColumnId.Type

export const COLUMN_IDS: ReadonlyArray<ColumnId> = ['todo', 'doing', 'done']

export const WIP_LIMIT = 3

export const columnName = (column: ColumnId): string =>
  Match.value(column).pipe(
    Match.when('todo', () => 'To do'),
    Match.when('doing', () => 'Doing'),
    Match.when('done', () => 'Done'),
    Match.exhaustive,
  )

export const columnOffset = (
  column: ColumnId,
  offset: number,
): Option.Option<ColumnId> =>
  pipe(
    Array.findFirstIndex(COLUMN_IDS, id => id === column),
    Option.flatMap(index => Array.get(COLUMN_IDS, index + offset)),
  )

// CARD

export const Card = Schema.Struct({
  id: Schema.Number,
  title: Schema.String,
  done: Schema.Number,
  total: Schema.Number,
})
export type Card = typeof Card.Type

export const ColumnLoad = defineTaggedUnion({
  ColumnLoading: {},
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

export const ChecklistLoad = defineTaggedUnion({
  ChecklistLoading: {},
  ChecklistFailed: { error: Schema.String },
  ChecklistLoaded: { items: Schema.Array(Item) },
})
export type ChecklistLoad = typeof ChecklistLoad.Type

// ARCHIVE

export const ArchivedCard = Schema.Struct({
  id: Schema.Number,
  title: Schema.String,
})
export type ArchivedCard = typeof ArchivedCard.Type

export const ArchiveLoad = defineTaggedUnion({
  ArchiveLoading: {},
  ArchiveFailed: { error: Schema.String },
  ArchiveLoaded: { cards: Schema.Array(ArchivedCard) },
})
export type ArchiveLoad = typeof ArchiveLoad.Type

// PENDING OPERATION

export const PendingOperation = defineTaggedUnion({
  PendingMove: {
    operationId: Schema.Number,
    cardId: Schema.Number,
    column: ColumnId,
    index: Schema.Number,
  },
  PendingRename: {
    operationId: Schema.Number,
    cardId: Schema.Number,
    title: Schema.String,
  },
  PendingAddCard: { operationId: Schema.Number, title: Schema.String },
  PendingArchive: { operationId: Schema.Number, cardId: Schema.Number },
  PendingToggle: {
    operationId: Schema.Number,
    cardId: Schema.Number,
    itemId: Schema.Number,
    done: Schema.Boolean,
    wasDone: Schema.Boolean,
  },
  PendingAddItem: {
    operationId: Schema.Number,
    cardId: Schema.Number,
    text: Schema.String,
  },
})
export type PendingOperation = typeof PendingOperation.Type

// SHOWN BOARD

export type ShownEntry =
  | Readonly<{ _tag: 'Real'; card: Card }>
  | Readonly<{ _tag: 'Adding'; operationId: number; title: string }>

export type ShownColumns = Readonly<
  Record<ColumnId, Option.Option<ReadonlyArray<ShownEntry>>>
>

const realEntry = (card: Card): ShownEntry => ({ _tag: 'Real', card })

const isEntryOf =
  (cardId: number) =>
  (entry: ShownEntry): boolean =>
    entry._tag === 'Real' && entry.card.id === cardId

const toShown = (columns: Columns): ShownColumns => ({
  todo: loadedEntries(columns.todo),
  doing: loadedEntries(columns.doing),
  done: loadedEntries(columns.done),
})

const loadedEntries = (
  load: ColumnLoad,
): Option.Option<ReadonlyArray<ShownEntry>> =>
  ColumnLoad.match(load, {
    ColumnLoading: () => Option.none(),
    ColumnFailed: () => Option.none(),
    ColumnLoaded: ({ cards }) => Option.some(Array.map(cards, realEntry)),
  })

export type CardLocation = Readonly<{
  column: ColumnId
  index: number
  card: Card
}>

export const locateCard = (
  shown: ShownColumns,
  cardId: number,
): Option.Option<CardLocation> =>
  Array.findFirst(COLUMN_IDS, column =>
    pipe(
      shown[column],
      Option.flatMap(entries =>
        pipe(
          Array.findFirstIndex(entries, isEntryOf(cardId)),
          Option.flatMap(index =>
            pipe(
              Array.get(entries, index),
              Option.flatMap(entry =>
                entry._tag === 'Real' ? Option.some(entry.card) : Option.none(),
              ),
              Option.map(card => ({ column, index, card })),
            ),
          ),
        ),
      ),
    ),
  )

const withColumn = (
  shown: ShownColumns,
  column: ColumnId,
  f: (entries: ReadonlyArray<ShownEntry>) => ReadonlyArray<ShownEntry>,
): ShownColumns => ({ ...shown, [column]: Option.map(shown[column], f) })

const mapCard = (
  shown: ShownColumns,
  cardId: number,
  f: (card: Card) => Card,
): ShownColumns =>
  Array.reduce(COLUMN_IDS, shown, (current, column) =>
    withColumn(current, column, entries =>
      Array.map(entries, entry =>
        isEntryOf(cardId)(entry) && entry._tag === 'Real'
          ? realEntry(f(entry.card))
          : entry,
      ),
    ),
  )

const removeCard = (shown: ShownColumns, cardId: number): ShownColumns =>
  Array.reduce(COLUMN_IDS, shown, (current, column) =>
    withColumn(current, column, entries =>
      Array.filter(entries, entry => !isEntryOf(cardId)(entry)),
    ),
  )

const moveCard = (
  shown: ShownColumns,
  cardId: number,
  column: ColumnId,
  index: number,
): ShownColumns =>
  Option.match(
    Option.all([locateCard(shown, cardId), shown[column]]),
    {
      onNone: () => shown,
      onSome: ([location]) => {
        const removed = removeCard(shown, cardId)
        return withColumn(removed, column, entries => {
          const at = Math.max(0, Math.min(index, entries.length))
          return [
            ...Array.take(entries, at),
            realEntry(location.card),
            ...Array.drop(entries, at),
          ]
        })
      },
    },
  )

const toggleDelta = (done: boolean, wasDone: boolean): number =>
  (done ? 1 : 0) - (wasDone ? 1 : 0)

const applyPending = (
  shown: ShownColumns,
  operation: PendingOperation,
): ShownColumns =>
  PendingOperation.match(operation, {
    PendingMove: ({ cardId, column, index }) =>
      moveCard(shown, cardId, column, index),
    PendingRename: ({ cardId, title }) =>
      mapCard(shown, cardId, card => ({ ...card, title })),
    PendingAddCard: () => shown,
    PendingArchive: ({ cardId }) => removeCard(shown, cardId),
    PendingToggle: ({ cardId, done, wasDone }) =>
      mapCard(shown, cardId, card => ({
        ...card,
        done: card.done + toggleDelta(done, wasDone),
      })),
    PendingAddItem: ({ cardId }) =>
      mapCard(shown, cardId, card => ({ ...card, total: card.total + 1 })),
  })

export const shownColumns = (
  columns: Columns,
  operations: ReadonlyArray<PendingOperation>,
): ShownColumns =>
  withColumn(
    Array.reduce(operations, toShown(columns), applyPending),
    'todo',
    entries =>
      Array.appendAll(
        entries,
        Array.flatMap(operations, (operation): ReadonlyArray<ShownEntry> =>
          operation._tag === 'PendingAddCard'
            ? [
                {
                  _tag: 'Adding',
                  operationId: operation.operationId,
                  title: operation.title,
                },
              ]
            : [],
        ),
      ),
  )

export const realCount = (shown: ShownColumns, column: ColumnId): number =>
  Option.match(shown[column], {
    onNone: () => 0,
    onSome: entries => Array.filter(entries, entry => entry._tag === 'Real').length,
  })

export const shownCount = (shown: ShownColumns, column: ColumnId): number =>
  Option.match(shown[column], {
    onNone: () => 0,
    onSome: entries => entries.length,
  })

// CONFIRMED CHANGES

export type Confirmed =
  | Readonly<{ _tag: 'Moved'; cardId: number; column: ColumnId; index: number }>
  | Readonly<{ _tag: 'Renamed'; cardId: number; title: string }>
  | Readonly<{ _tag: 'Added'; card: Card }>
  | Readonly<{ _tag: 'Archived'; cardId: number }>
  | Readonly<{ _tag: 'CountsChanged'; cardId: number; done: number; total: number }>

const applyConfirmedToShown = (
  shown: ShownColumns,
  confirmed: Confirmed,
): ShownColumns =>
  Match.value(confirmed).pipe(
    Match.tagsExhaustive({
      Moved: ({ cardId, column, index }) =>
        moveCard(shown, cardId, column, index),
      Renamed: ({ cardId, title }) =>
        mapCard(shown, cardId, card => ({ ...card, title })),
      Added: ({ card }) =>
        withColumn(shown, 'todo', entries =>
          Array.append(entries, realEntry(card)),
        ),
      Archived: ({ cardId }) => removeCard(shown, cardId),
      CountsChanged: ({ cardId, done, total }) =>
        mapCard(shown, cardId, card => ({
          ...card,
          done: card.done + done,
          total: card.total + total,
        })),
    }),
  )

const backToLoad = (
  load: ColumnLoad,
  maybeEntries: Option.Option<ReadonlyArray<ShownEntry>>,
): ColumnLoad =>
  Option.match(maybeEntries, {
    onNone: () => load,
    onSome: entries =>
      ColumnLoad.ColumnLoaded({
        cards: Array.flatMap(entries, entry =>
          entry._tag === 'Real' ? [entry.card] : [],
        ),
      }),
  })

export const confirm = (columns: Columns, confirmed: Confirmed): Columns => {
  const shown = applyConfirmedToShown(toShown(columns), confirmed)
  return {
    todo: backToLoad(columns.todo, shown.todo),
    doing: backToLoad(columns.doing, shown.doing),
    done: backToLoad(columns.done, shown.done),
  }
}

export const toggleCountDelta = (done: boolean, wasDone: boolean): number =>
  toggleDelta(done, wasDone)

// SHOWN CHECKLIST

export type ShownItem =
  | Readonly<{ _tag: 'RealItem'; item: Item; isToggling: boolean }>
  | Readonly<{ _tag: 'AddingItem'; operationId: number; text: string }>

export const shownItems = (
  cardId: number,
  items: ReadonlyArray<Item>,
  operations: ReadonlyArray<PendingOperation>,
): ReadonlyArray<ShownItem> => {
  const toggled = Array.map(items, (item): ShownItem => {
    const maybeLastToggle = pipe(
      operations,
      Array.flatMap(operation =>
        operation._tag === 'PendingToggle' &&
        operation.cardId === cardId &&
        operation.itemId === item.id
          ? [operation]
          : [],
      ),
      Array.last,
    )
    return Option.match(maybeLastToggle, {
      onNone: () => ({ _tag: 'RealItem', item, isToggling: false }),
      onSome: toggle => ({
        _tag: 'RealItem',
        item: { ...item, done: toggle.done },
        isToggling: true,
      }),
    })
  })
  const adding = Array.flatMap(
    operations,
    (operation): ReadonlyArray<ShownItem> =>
      operation._tag === 'PendingAddItem' && operation.cardId === cardId
        ? [
            {
              _tag: 'AddingItem',
              operationId: operation.operationId,
              text: operation.text,
            },
          ]
        : [],
  )
  return Array.appendAll(toggled, adding)
}
