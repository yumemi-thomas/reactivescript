import { Array, Match, Option, Schema, pipe } from 'effect'
import { defineTaggedUnion } from 'foldkit/schema'
import { modifyFields } from 'foldkit/struct'

// COLUMN

export const Column = Schema.Literals(['todo', 'doing', 'done'])
export type Column = typeof Column.Type

export const COLUMNS: ReadonlyArray<Column> = ['todo', 'doing', 'done']

export const WIP_LIMIT = 3

export const columnName = (column: Column): string =>
  Match.value(column).pipe(
    Match.when('todo', () => 'To do'),
    Match.when('doing', () => 'Doing'),
    Match.when('done', () => 'Done'),
    Match.exhaustive,
  )

export const columnToLeft = (column: Column): Option.Option<Column> =>
  Match.value(column).pipe(
    Match.when('todo', () => Option.none<Column>()),
    Match.when('doing', () => Option.some<Column>('todo')),
    Match.when('done', () => Option.some<Column>('doing')),
    Match.exhaustive,
  )

export const columnToRight = (column: Column): Option.Option<Column> =>
  Match.value(column).pipe(
    Match.when('todo', () => Option.some<Column>('doing')),
    Match.when('doing', () => Option.some<Column>('done')),
    Match.when('done', () => Option.none<Column>()),
    Match.exhaustive,
  )

export const Direction = Schema.Literals(['left', 'right', 'up', 'down'])
export type Direction = typeof Direction.Type

// SERVER DATA

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

// PENDING OPERATIONS

export const PendingOp = defineTaggedUnion({
  MovingCard: {
    opId: Schema.Number,
    cardId: Schema.Number,
    column: Column,
    index: Schema.Number,
  },
  RenamingCard: {
    opId: Schema.Number,
    cardId: Schema.Number,
    title: Schema.String,
  },
  ArchivingCard: { opId: Schema.Number, cardId: Schema.Number },
  AddingCard: { opId: Schema.Number, title: Schema.String },
  TogglingItem: {
    opId: Schema.Number,
    cardId: Schema.Number,
    itemId: Schema.Number,
    done: Schema.Boolean,
    wasDone: Schema.Boolean,
  },
  AddingItem: {
    opId: Schema.Number,
    cardId: Schema.Number,
    text: Schema.String,
  },
})
export type PendingOp = typeof PendingOp.Type

// BASE COLUMNS

export const ColumnState = defineTaggedUnion({
  ColumnLoading: { requestId: Schema.Number },
  ColumnFailed: { error: Schema.String },
  ColumnLoaded: { cards: Schema.Array(Card) },
})
export type ColumnState = typeof ColumnState.Type

export const Columns = Schema.Struct({
  todo: ColumnState,
  doing: ColumnState,
  done: ColumnState,
})
export type Columns = typeof Columns.Type

export const columnState = (columns: Columns, column: Column): ColumnState =>
  Match.value(column).pipe(
    Match.when('todo', () => columns.todo),
    Match.when('doing', () => columns.doing),
    Match.when('done', () => columns.done),
    Match.exhaustive,
  )

export const withColumnState = (
  columns: Columns,
  column: Column,
  state: ColumnState,
): Columns =>
  Match.value(column).pipe(
    Match.when('todo', () => modifyFields(columns, { todo: () => state })),
    Match.when('doing', () => modifyFields(columns, { doing: () => state })),
    Match.when('done', () => modifyFields(columns, { done: () => state })),
    Match.exhaustive,
  )

const loadedCards = (state: ColumnState): Option.Option<ReadonlyArray<Card>> =>
  ColumnState.match(state, {
    ColumnLoading: () => Option.none<ReadonlyArray<Card>>(),
    ColumnFailed: () => Option.none<ReadonlyArray<Card>>(),
    ColumnLoaded: ({ cards }) => Option.some(cards),
  })

const modifyLoaded = (
  columns: Columns,
  f: (cards: ReadonlyArray<Card>, column: Column) => ReadonlyArray<Card>,
): Columns =>
  Array.reduce(COLUMNS, columns, (accumulated, column) =>
    Option.match(loadedCards(columnState(accumulated, column)), {
      onNone: () => accumulated,
      onSome: cards =>
        withColumnState(
          accumulated,
          column,
          ColumnState.ColumnLoaded({ cards: f(cards, column) }),
        ),
    }),
  )

const insertClamped = <A>(
  values: ReadonlyArray<A>,
  index: number,
  value: A,
): ReadonlyArray<A> => {
  const clampedIndex = Math.max(0, Math.min(index, values.length))
  return Array.insertAt(values, clampedIndex, value).pipe(
    Option.getOrElse(() => Array.append(values, value)),
  )
}

export const isColumnLoaded = (columns: Columns, column: Column): boolean =>
  Option.isSome(loadedCards(columnState(columns, column)))

export const baseCard = (
  columns: Columns,
  cardId: number,
): Option.Option<Card> =>
  pipe(
    COLUMNS,
    Array.flatMap(column =>
      Option.getOrElse(loadedCards(columnState(columns, column)), () => []),
    ),
    Array.findFirst(card => card.id === cardId),
  )

export const baseMoveCard = (
  columns: Columns,
  cardId: number,
  toColumn: Column,
  index: number,
): Columns =>
  Option.match(baseCard(columns, cardId), {
    onNone: () => columns,
    onSome: card =>
      isColumnLoaded(columns, toColumn)
        ? modifyLoaded(baseRemoveCard(columns, cardId), (cards, column) =>
            column === toColumn ? insertClamped(cards, index, card) : cards,
          )
        : columns,
  })

export const baseRemoveCard = (columns: Columns, cardId: number): Columns =>
  modifyLoaded(columns, cards => Array.filter(cards, card => card.id !== cardId))

export const baseModifyCard = (
  columns: Columns,
  cardId: number,
  f: (card: Card) => Card,
): Columns =>
  modifyLoaded(columns, cards =>
    Array.map(cards, card => (card.id === cardId ? f(card) : card)),
  )

export const baseAppendCard = (
  columns: Columns,
  toColumn: Column,
  card: Card,
): Columns =>
  modifyLoaded(columns, (cards, column) =>
    column === toColumn ? Array.append(cards, card) : cards,
  )

// DISPLAYED BOARD

export type ShownCard = Readonly<{
  key: string
  maybeId: Option.Option<number>
  title: string
  done: number
  total: number
}>

export type ShownItem = Readonly<{
  key: string
  maybeId: Option.Option<number>
  text: string
  done: boolean
}>

export type Lanes = Readonly<{
  todo: Option.Option<ReadonlyArray<ShownCard>>
  doing: Option.Option<ReadonlyArray<ShownCard>>
  done: Option.Option<ReadonlyArray<ShownCard>>
}>

export type ShownBoard = Readonly<{
  lanes: Lanes
  maybeItems: Option.Option<ReadonlyArray<ShownItem>>
}>

export type SelectedChecklist = Readonly<{
  cardId: number
  items: ReadonlyArray<Item>
}>

export const lane = (
  lanes: Lanes,
  column: Column,
): Option.Option<ReadonlyArray<ShownCard>> =>
  Match.value(column).pipe(
    Match.when('todo', () => lanes.todo),
    Match.when('doing', () => lanes.doing),
    Match.when('done', () => lanes.done),
    Match.exhaustive,
  )

const mapLanes = (
  lanes: Lanes,
  f: (
    cards: ReadonlyArray<ShownCard>,
    column: Column,
  ) => ReadonlyArray<ShownCard>,
): Lanes => ({
  todo: Option.map(lanes.todo, cards => f(cards, 'todo')),
  doing: Option.map(lanes.doing, cards => f(cards, 'doing')),
  done: Option.map(lanes.done, cards => f(cards, 'done')),
})

const hasId = (cardId: number) => (card: ShownCard) =>
  Option.exists(card.maybeId, id => id === cardId)

export type ShownPlace = Readonly<{
  column: Column
  index: number
  card: ShownCard
  laneSize: number
}>

export const findShown = (
  lanes: Lanes,
  cardId: number,
): Option.Option<ShownPlace> =>
  pipe(
    COLUMNS,
    Array.findFirst(column =>
      pipe(
        lane(lanes, column),
        Option.flatMap(cards =>
          pipe(
            Array.findFirstIndex(cards, hasId(cardId)),
            Option.flatMap(index =>
              pipe(
                Array.get(cards, index),
                Option.map(card => ({
                  column,
                  index,
                  card,
                  laneSize: cards.length,
                })),
              ),
            ),
          ),
        ),
      ),
    ),
  )

export const laneSize = (lanes: Lanes, column: Column): Option.Option<number> =>
  Option.map(lane(lanes, column), cards => cards.length)

const modifyShown = (
  lanes: Lanes,
  cardId: number,
  f: (card: ShownCard) => ShownCard,
): Lanes =>
  mapLanes(lanes, cards =>
    Array.map(cards, card => (hasId(cardId)(card) ? f(card) : card)),
  )

const toShownCard = (card: Card): ShownCard => ({
  key: `card-${card.id}`,
  maybeId: Option.some(card.id),
  title: card.title,
  done: card.done,
  total: card.total,
})

const toShownItem = (item: Item): ShownItem => ({
  key: `item-${item.id}`,
  maybeId: Option.some(item.id),
  text: item.text,
  done: item.done,
})

const itemKey = (cardId: number, itemId: number): string =>
  `${cardId}:${itemId}`

type Replay = Readonly<{
  lanes: Lanes
  itemStates: ReadonlyMap<string, boolean>
  maybeItems: Option.Option<ReadonlyArray<ShownItem>>
}>

const isSelectedCard = (
  maybeChecklist: Option.Option<SelectedChecklist>,
  cardId: number,
): boolean => Option.exists(maybeChecklist, ({ cardId: id }) => id === cardId)

const replayOp =
  (maybeChecklist: Option.Option<SelectedChecklist>) =>
  (replay: Replay, op: PendingOp): Replay =>
    PendingOp.match<Replay>(op, {
      MovingCard: ({ cardId, column, index }) =>
        Option.match(findShown(replay.lanes, cardId), {
          onNone: () => replay,
          onSome: ({ card }) =>
            Option.isSome(lane(replay.lanes, column))
              ? modifyFields(replay, {
                  lanes: () =>
                    mapLanes(
                    mapLanes(replay.lanes, cards =>
                      Array.filter(cards, shown => !hasId(cardId)(shown)),
                    ),
                    (cards, laneColumn) =>
                      laneColumn === column
                        ? insertClamped(cards, index, card)
                        : cards,
                    ),
                })
              : replay,
        }),
      RenamingCard: ({ cardId, title }) =>
        modifyFields(replay, {
          lanes: lanes =>
            modifyShown(lanes, cardId, card =>
              modifyFields(card, { title: () => title }),
            ),
        }),
      ArchivingCard: ({ cardId }) =>
        modifyFields(replay, {
          lanes: lanes =>
            mapLanes(lanes, cards =>
              Array.filter(cards, card => !hasId(cardId)(card)),
            ),
        }),
      AddingCard: ({ opId, title }) =>
        modifyFields(replay, {
          lanes: lanes => mapLanes(lanes, (cards, column) =>
          column === 'todo'
            ? Array.append(cards, {
                key: `adding-card-${opId}`,
                maybeId: Option.none(),
                title,
                done: 0,
                total: 0,
              })
            : cards,
        ),
        }),
      TogglingItem: ({ cardId, itemId, done, wasDone }) => {
        const key = itemKey(cardId, itemId)
        const current = replay.itemStates.get(key) ?? wasDone
        const delta = (done ? 1 : 0) - (current ? 1 : 0)
        return {
          lanes: modifyShown(replay.lanes, cardId, card =>
            modifyFields(card, { done: count => count + delta }),
          ),
          itemStates: new Map([...replay.itemStates, [key, done]]),
          maybeItems: isSelectedCard(maybeChecklist, cardId)
            ? Option.map(replay.maybeItems, items =>
                Array.map(items, item =>
                  Option.exists(item.maybeId, id => id === itemId)
                    ? modifyFields(item, { done: () => done })
                    : item,
                ),
              )
            : replay.maybeItems,
        }
      },
      AddingItem: ({ opId, cardId, text }) =>
        modifyFields(replay, {
          lanes: lanes =>
            modifyShown(lanes, cardId, card =>
              modifyFields(card, { total: count => count + 1 }),
            ),
          maybeItems: maybeItems =>
            isSelectedCard(maybeChecklist, cardId)
          ? Option.map(maybeItems, items =>
              Array.append(items, {
                key: `adding-item-${opId}`,
                maybeId: Option.none(),
                text,
                done: false,
              }),
            )
          : maybeItems,
        }),
    })

export const showBoard = (
  columns: Columns,
  pending: ReadonlyArray<PendingOp>,
  maybeChecklist: Option.Option<SelectedChecklist>,
): ShownBoard => {
  const shownLane = (column: Column) =>
    Option.map(loadedCards(columnState(columns, column)), cards =>
      Array.map(cards, toShownCard),
    )
  const initial: Replay = {
    lanes: {
      todo: shownLane('todo'),
      doing: shownLane('doing'),
      done: shownLane('done'),
    },
    itemStates: new Map(
      Option.match(maybeChecklist, {
        onNone: () => [],
        onSome: ({ cardId, items }) =>
          Array.map(items, (item): [string, boolean] => [
            itemKey(cardId, item.id),
            item.done,
          ]),
      }),
    ),
    maybeItems: Option.map(maybeChecklist, ({ items }) =>
      Array.map(items, toShownItem),
    ),
  }
  const replayed = Array.reduce(pending, initial, replayOp(maybeChecklist))
  return { lanes: replayed.lanes, maybeItems: replayed.maybeItems }
}
