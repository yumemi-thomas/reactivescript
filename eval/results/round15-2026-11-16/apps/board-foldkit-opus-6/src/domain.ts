import { Array, Option, Schema, pipe } from 'effect'
import { defineTaggedUnion } from 'foldkit/schema'

// COLUMN

export const Column = Schema.Literals(['todo', 'doing', 'done'])
export type Column = typeof Column.Type

export const COLUMNS: ReadonlyArray<Column> = ['todo', 'doing', 'done']

export const WORK_IN_PROGRESS_LIMIT = 3

export const columnName = (column: Column): string =>
  ({ todo: 'To do', doing: 'Doing', done: 'Done' })[column]

export const previousColumn = (column: Column): Option.Option<Column> =>
  ({
    todo: Option.none<Column>(),
    doing: Option.some<Column>('todo'),
    done: Option.some<Column>('doing'),
  })[column]

export const nextColumn = (column: Column): Option.Option<Column> =>
  ({
    todo: Option.some<Column>('doing'),
    doing: Option.some<Column>('done'),
    done: Option.none<Column>(),
  })[column]

// CARD

export const Card = Schema.Struct({
  id: Schema.Number,
  title: Schema.String,
  done: Schema.Number,
  total: Schema.Number,
})
export type Card = typeof Card.Type

export const Item = Schema.Struct({
  id: Schema.Number,
  text: Schema.String,
  done: Schema.Boolean,
})
export type Item = typeof Item.Type

export const ArchivedCard = Schema.Struct({
  id: Schema.Number,
  title: Schema.String,
})
export type ArchivedCard = typeof ArchivedCard.Type

// LOAD STATE

export const ColumnState = defineTaggedUnion({
  Loading: {},
  Failed: { error: Schema.String },
  Loaded: { cards: Schema.Array(Card) },
})
export type ColumnState = typeof ColumnState.Type

export const Columns = Schema.Struct({
  todo: ColumnState,
  doing: ColumnState,
  done: ColumnState,
})
export type Columns = typeof Columns.Type

export const ChecklistState = defineTaggedUnion({
  Loading: {},
  Failed: { error: Schema.String },
  Loaded: { items: Schema.Array(Item) },
})
export type ChecklistState = typeof ChecklistState.Type

// PENDING OPERATION

export const BoardOperation = defineTaggedUnion({
  Move: {
    operationId: Schema.Number,
    cardId: Schema.Number,
    column: Column,
    index: Schema.Number,
  },
  AddCard: { operationId: Schema.Number, title: Schema.String },
  Rename: {
    operationId: Schema.Number,
    cardId: Schema.Number,
    title: Schema.String,
  },
  Archive: { operationId: Schema.Number, cardId: Schema.Number },
  Toggle: {
    operationId: Schema.Number,
    cardId: Schema.Number,
    itemId: Schema.Number,
    done: Schema.Boolean,
  },
  AddItem: {
    operationId: Schema.Number,
    cardId: Schema.Number,
    text: Schema.String,
  },
})
export type BoardOperation = typeof BoardOperation.Type

export const ItemBaseline = Schema.Struct({
  itemId: Schema.Number,
  done: Schema.Boolean,
})
export type ItemBaseline = typeof ItemBaseline.Type

// LANES

export type Lanes<T> = Readonly<Record<Column, Option.Option<ReadonlyArray<T>>>>

const lanesOf = <T>(
  f: (column: Column) => Option.Option<ReadonlyArray<T>>,
): Lanes<T> => ({ todo: f('todo'), doing: f('doing'), done: f('done') })

export const mapLanesTo = <A, B>(
  lanes: Lanes<A>,
  f: (items: ReadonlyArray<A>) => ReadonlyArray<B>,
): Lanes<B> => lanesOf(column => Option.map(lanes[column], f))

export const mapLanes = <T>(
  lanes: Lanes<T>,
  f: (items: ReadonlyArray<T>) => ReadonlyArray<T>,
): Lanes<T> => lanesOf(column => Option.map(lanes[column], f))

const setLane = <T>(
  lanes: Lanes<T>,
  target: Column,
  items: ReadonlyArray<T>,
): Lanes<T> =>
  lanesOf(column => (column === target ? Option.some(items) : lanes[column]))

export type Position<T> = Readonly<{ column: Column; index: number; item: T }>

export const findInLanes = <T>(
  lanes: Lanes<T>,
  predicate: (item: T) => boolean,
): Option.Option<Position<T>> =>
  Array.findFirst(COLUMNS, column =>
    Option.flatMap(lanes[column], items =>
      Option.flatMap(Array.findFirstIndex(items, predicate), index =>
        Option.map(Array.get(items, index), item => ({ column, index, item })),
      ),
    ),
  )

const insertClamped = <T>(
  items: ReadonlyArray<T>,
  index: number,
  item: T,
): ReadonlyArray<T> => {
  const clampedIndex = Math.max(0, Math.min(index, items.length))
  return [...Array.take(items, clampedIndex), item, ...Array.drop(items, clampedIndex)]
}

export const moveInLanes = <T>(
  lanes: Lanes<T>,
  predicate: (item: T) => boolean,
  column: Column,
  index: number,
): Lanes<T> =>
  Option.match(findInLanes(lanes, predicate), {
    onNone: () => lanes,
    onSome: ({ item }) => {
      const lanesWithout = mapLanes(lanes, Array.filter(other => !predicate(other)))
      return Option.match(lanesWithout[column], {
        onNone: () => lanes,
        onSome: items => setLane(lanesWithout, column, insertClamped(items, index, item)),
      })
    },
  })

export const appendToLane = <T>(
  lanes: Lanes<T>,
  column: Column,
  item: T,
): Lanes<T> =>
  Option.match(lanes[column], {
    onNone: () => lanes,
    onSome: items => setLane(lanes, column, Array.append(items, item)),
  })

export const removeFromLanes = <T>(
  lanes: Lanes<T>,
  predicate: (item: T) => boolean,
): Lanes<T> => mapLanes(lanes, Array.filter(item => !predicate(item)))

export const modifyInLanes = <T>(
  lanes: Lanes<T>,
  predicate: (item: T) => boolean,
  f: (item: T) => T,
): Lanes<T> =>
  mapLanes(lanes, Array.map(item => (predicate(item) ? f(item) : item)))

// CONFIRMED LANES

export const confirmedLanes = (columns: Columns): Lanes<Card> =>
  lanesOf(column =>
    ColumnState.match(columns[column], {
      Loading: () => Option.none(),
      Failed: () => Option.none(),
      Loaded: ({ cards }) => Option.some(cards),
    }),
  )

const withLane = (
  state: ColumnState,
  maybeCards: Option.Option<ReadonlyArray<Card>>,
): ColumnState =>
  ColumnState.match(state, {
    Loading: () => state,
    Failed: () => state,
    Loaded: () =>
      Option.match(maybeCards, {
        onNone: () => state,
        onSome: cards => ColumnState.Loaded({ cards }),
      }),
  })

export const modifyConfirmed = (
  columns: Columns,
  f: (lanes: Lanes<Card>) => Lanes<Card>,
): Columns => {
  const lanes = f(confirmedLanes(columns))
  return {
    todo: withLane(columns.todo, lanes.todo),
    doing: withLane(columns.doing, lanes.doing),
    done: withLane(columns.done, lanes.done),
  }
}

export const isCard =
  (cardId: number) =>
  (card: Card): boolean =>
    card.id === cardId

// SHOWN BOARD

export const BoardEntry = defineTaggedUnion({
  SavedCard: { card: Card },
  AddingCard: { operationId: Schema.Number, title: Schema.String },
})
export type BoardEntry = typeof BoardEntry.Type

export const isEntryOfCard =
  (cardId: number) =>
  (entry: BoardEntry): boolean =>
    entry._tag === 'SavedCard' && entry.card.id === cardId

const modifyEntryCard = (
  lanes: Lanes<BoardEntry>,
  cardId: number,
  f: (card: Card) => Card,
): Lanes<BoardEntry> =>
  modifyInLanes(lanes, isEntryOfCard(cardId), entry =>
    BoardEntry.match(entry, {
      SavedCard: ({ card }) => BoardEntry.SavedCard({ card: f(card) }),
      AddingCard: () => entry,
    }),
  )

const doneCount = (done: boolean): number => (done ? 1 : 0)

export const findBaseline = (
  baselines: ReadonlyArray<ItemBaseline>,
  itemId: number,
): Option.Option<boolean> =>
  pipe(
    Array.findFirst(baselines, baseline => baseline.itemId === itemId),
    Option.map(baseline => baseline.done),
  )

type ShownAccumulator = Readonly<{
  lanes: Lanes<BoardEntry>
  itemStates: ReadonlyArray<ItemBaseline>
}>

const setItemState = (
  itemStates: ReadonlyArray<ItemBaseline>,
  itemId: number,
  done: boolean,
): ReadonlyArray<ItemBaseline> =>
  Array.append(
    Array.filter(itemStates, state => state.itemId !== itemId),
    { itemId, done },
  )

const applyOperation = (
  accumulator: ShownAccumulator,
  operation: BoardOperation,
): ShownAccumulator =>
  BoardOperation.match(operation, {
    Move: ({ cardId, column, index }) => ({
      lanes: moveInLanes(accumulator.lanes, isEntryOfCard(cardId), column, index),
      itemStates: accumulator.itemStates,
    }),
    AddCard: ({ operationId, title }) => ({
      lanes: appendToLane(
        accumulator.lanes,
        'todo',
        BoardEntry.AddingCard({ operationId, title }),
      ),
      itemStates: accumulator.itemStates,
    }),
    Rename: ({ cardId, title }) => ({
      lanes: modifyEntryCard(accumulator.lanes, cardId, card => ({
        id: card.id,
        title,
        done: card.done,
        total: card.total,
      })),
      itemStates: accumulator.itemStates,
    }),
    Archive: ({ cardId }) => ({
      lanes: removeFromLanes(accumulator.lanes, isEntryOfCard(cardId)),
      itemStates: accumulator.itemStates,
    }),
    Toggle: ({ cardId, itemId, done }) => {
      const before = Option.getOrElse(
        findBaseline(accumulator.itemStates, itemId),
        () => !done,
      )
      const delta = doneCount(done) - doneCount(before)
      return {
        lanes: modifyEntryCard(accumulator.lanes, cardId, card => ({
          id: card.id,
          title: card.title,
          done: card.done + delta,
          total: card.total,
        })),
        itemStates: setItemState(accumulator.itemStates, itemId, done),
      }
    },
    AddItem: ({ cardId }) => ({
      lanes: modifyEntryCard(accumulator.lanes, cardId, card => ({
        id: card.id,
        title: card.title,
        done: card.done,
        total: card.total + 1,
      })),
      itemStates: accumulator.itemStates,
    }),
  })

const initialAccumulator = (
  columns: Columns,
  baselines: ReadonlyArray<ItemBaseline>,
): ShownAccumulator => ({
  lanes: mapLanesTo(
    confirmedLanes(columns),
    Array.map(card => BoardEntry.SavedCard({ card })),
  ),
  itemStates: baselines,
})

const savedItems = (
  items: ReadonlyArray<Item>,
): ReadonlyArray<ChecklistEntry> =>
  Array.map(items, item => ChecklistEntry.SavedItem({ item }))

export const shownLanes = (
  columns: Columns,
  operations: ReadonlyArray<BoardOperation>,
  baselines: ReadonlyArray<ItemBaseline>,
): Lanes<BoardEntry> =>
  Array.reduce(
    operations,
    initialAccumulator(columns, baselines),
    applyOperation,
  ).lanes

export const laneLength = <T>(lanes: Lanes<T>, column: Column): number =>
  Option.match(lanes[column], { onNone: () => 0, onSome: items => items.length })

// CHECKLIST

export const ChecklistEntry = defineTaggedUnion({
  SavedItem: { item: Item },
  AddingItem: { operationId: Schema.Number, text: Schema.String },
})
export type ChecklistEntry = typeof ChecklistEntry.Type

export const shownChecklist = (
  items: ReadonlyArray<Item>,
  cardId: number,
  operations: ReadonlyArray<BoardOperation>,
): ReadonlyArray<ChecklistEntry> =>
  Array.reduce(
    operations,
    savedItems(items),
    (entries, operation) =>
      BoardOperation.match(operation, {
        Move: () => entries,
        AddCard: () => entries,
        Rename: () => entries,
        Archive: () => entries,
        Toggle: toggle =>
          toggle.cardId !== cardId
            ? entries
            : Array.map(entries, entry =>
                ChecklistEntry.match(entry, {
                  SavedItem: ({ item }) =>
                    item.id === toggle.itemId
                      ? ChecklistEntry.SavedItem({
                          item: { id: item.id, text: item.text, done: toggle.done },
                        })
                      : entry,
                  AddingItem: () => entry,
                }),
              ),
        AddItem: addItem =>
          addItem.cardId !== cardId
            ? entries
            : Array.append(
                entries,
                ChecklistEntry.AddingItem({
                  operationId: addItem.operationId,
                  text: addItem.text,
                }),
              ),
      }),
  )
