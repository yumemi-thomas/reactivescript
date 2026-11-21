import { Array, Match, Option, Schema, pipe } from 'effect'
import { defineTaggedUnion } from 'foldkit/schema'
import { modifyFields } from 'foldkit/struct'

// COLUMN

export const ColumnId = Schema.Literals(['todo', 'doing', 'done'])
export type ColumnId = typeof ColumnId.Type

export const COLUMN_IDS: ReadonlyArray<ColumnId> = ['todo', 'doing', 'done']

export const columnName = (column: ColumnId): string =>
  Match.value(column).pipe(
    Match.when('todo', () => 'To do'),
    Match.when('doing', () => 'Doing'),
    Match.when('done', () => 'Done'),
    Match.exhaustive,
  )

export const WIP_LIMIT = 3

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

// PENDING OPERATION

export const PendingOp = defineTaggedUnion({
  PendingMove: {
    opId: Schema.Number,
    cardId: Schema.Number,
    column: ColumnId,
    index: Schema.Number,
  },
  PendingAdd: { opId: Schema.Number, title: Schema.String },
  AcceptedAdd: { opId: Schema.Number, card: Card },
  PendingRename: {
    opId: Schema.Number,
    cardId: Schema.Number,
    title: Schema.String,
  },
  PendingArchive: { opId: Schema.Number, cardId: Schema.Number },
  PendingToggle: {
    opId: Schema.Number,
    cardId: Schema.Number,
    itemId: Schema.Number,
    done: Schema.Boolean,
    previous: Schema.Boolean,
  },
  PendingAddItem: {
    opId: Schema.Number,
    cardId: Schema.Number,
    text: Schema.String,
  },
  AcceptedAddItem: { opId: Schema.Number, cardId: Schema.Number, item: Item },
})
export type PendingOp = typeof PendingOp.Type

export const OpStatus = Schema.Literals(['Awaiting', 'Accepted'])
export type OpStatus = typeof OpStatus.Type

/** An operation shown on screen before the server answers. Accepted
 * operations stay in the queue until every earlier one has been answered, so
 * the confirmed state is built in the order the operations were sent. */
export const PendingEntry = Schema.Struct({ op: PendingOp, status: OpStatus })
export type PendingEntry = typeof PendingEntry.Type

export const findAwaitingOp = (
  pending: ReadonlyArray<PendingEntry>,
  opId: number,
): Option.Option<PendingOp> =>
  pipe(
    Array.findFirst(
      pending,
      entry => entry.op.opId === opId && entry.status === 'Awaiting',
    ),
    Option.map(entry => entry.op),
  )

export const acceptOp = (
  pending: ReadonlyArray<PendingEntry>,
  accepted: PendingOp,
): ReadonlyArray<PendingEntry> =>
  Array.map(pending, entry =>
    entry.op.opId === accepted.opId
      ? { op: accepted, status: 'Accepted' as const }
      : entry,
  )

const isToggleOf =
  (cardId: number, itemId: number) =>
  (op: PendingOp): boolean =>
    op._tag === 'PendingToggle' && op.cardId === cardId && op.itemId === itemId

/** Drops a declined operation. A later toggle of the same item then starts
 * from the state the declined toggle started from, so the counts stay
 * consistent with what the server holds. */
export const dropDeclinedOp = (
  pending: ReadonlyArray<PendingEntry>,
  declined: PendingOp,
): ReadonlyArray<PendingEntry> => {
  const remaining = Array.filter(
    pending,
    entry => entry.op.opId !== declined.opId,
  )
  if (declined._tag !== 'PendingToggle') {
    return remaining
  }
  return pipe(
    Array.findFirstIndex(
      remaining,
      entry =>
        entry.op.opId > declined.opId &&
        isToggleOf(declined.cardId, declined.itemId)(entry.op),
    ),
    Option.match({
      onNone: () => remaining,
      onSome: index =>
        Array.map(remaining, (entry, position) =>
          position === index && entry.op._tag === 'PendingToggle'
            ? {
                ...entry,
                op: PendingOp.PendingToggle({
                  ...entry.op,
                  previous: declined.previous,
                }),
              }
            : entry,
        ),
    }),
  )
}

export const toggleDelta = (done: boolean, previous: boolean): number =>
  (done ? 1 : 0) - (previous ? 1 : 0)

// BOARD ROWS

export const BoardRow = defineTaggedUnion({
  CardRow: { card: Card },
  AddingCardRow: { opId: Schema.Number, title: Schema.String },
})
export type BoardRow = typeof BoardRow.Type

export type Rows = ReadonlyArray<BoardRow>
export type Columns = Readonly<Record<ColumnId, Option.Option<Rows>>>

export type CardLocation = Readonly<{
  column: ColumnId
  index: number
  card: Card
}>

const isCardRow = (cardId: number) => (row: BoardRow) =>
  row._tag === 'CardRow' && row.card.id === cardId

export const locateCard = (
  columns: Columns,
  cardId: number,
): Option.Option<CardLocation> =>
  Array.findFirst(COLUMN_IDS, column =>
    pipe(
      columns[column],
      Option.flatMap(rows =>
        Option.flatMap(Array.findFirstIndex(rows, isCardRow(cardId)), index =>
          pipe(
            Array.get(rows, index),
            Option.flatMap(row =>
              row._tag === 'CardRow' ? Option.some(row.card) : Option.none(),
            ),
            Option.map(card => ({ column, index, card })),
          ),
        ),
      ),
    ),
  )

const mapColumns = (
  columns: Columns,
  f: (rows: Rows, column: ColumnId) => Rows,
): Columns => ({
  todo: Option.map(columns.todo, rows => f(rows, 'todo')),
  doing: Option.map(columns.doing, rows => f(rows, 'doing')),
  done: Option.map(columns.done, rows => f(rows, 'done')),
})

const mapCard = (
  columns: Columns,
  cardId: number,
  f: (card: Card) => Card,
): Columns =>
  mapColumns(columns, rows =>
    Array.map(rows, row =>
      row._tag === 'CardRow' && row.card.id === cardId
        ? BoardRow.CardRow({ card: f(row.card) })
        : row,
    ),
  )

const removeCard = (columns: Columns, cardId: number): Columns =>
  mapColumns(columns, rows => Array.filter(rows, row => !isCardRow(cardId)(row)))

const insertAt = (rows: Rows, index: number, row: BoardRow): Rows => {
  const position = Math.max(0, Math.min(index, rows.length))
  return [...rows.slice(0, position), row, ...rows.slice(position)]
}

export const moveCardTo = (
  columns: Columns,
  cardId: number,
  target: ColumnId,
  index: number,
): Columns =>
  Option.match(locateCard(columns, cardId), {
    onNone: () => columns,
    onSome: ({ card }) => {
      if (Option.isNone(columns[target])) {
        return columns
      }
      const without = removeCard(columns, cardId)
      return {
        ...without,
        [target]: Option.map(without[target], rows =>
          insertAt(rows, index, BoardRow.CardRow({ card })),
        ),
      }
    },
  })

export const appendCard = (columns: Columns, column: ColumnId, row: BoardRow) => ({
  ...columns,
  [column]: Option.map(columns[column], rows => Array.append(rows, row)),
})

export const renameCardIn = (columns: Columns, cardId: number, title: string) =>
  mapCard(columns, cardId, card => modifyFields(card, { title: () => title }))

export const archiveCardIn = removeCard

export const adjustCounts = (
  columns: Columns,
  cardId: number,
  doneDelta: number,
  totalDelta: number,
): Columns =>
  mapCard(columns, cardId, card =>
    modifyFields(card, {
      done: done => done + doneDelta,
      total: total => total + totalDelta,
    }),
  )

export const applyPendingOp = (columns: Columns, op: PendingOp): Columns =>
  PendingOp.match(op, {
    PendingMove: ({ cardId, column, index }) =>
      moveCardTo(columns, cardId, column, index),
    PendingAdd: ({ opId, title }) =>
      appendCard(columns, 'todo', BoardRow.AddingCardRow({ opId, title })),
    AcceptedAdd: ({ card }) =>
      Option.isSome(locateCard(columns, card.id))
        ? columns
        : appendCard(columns, 'todo', BoardRow.CardRow({ card })),
    PendingRename: ({ cardId, title }) => renameCardIn(columns, cardId, title),
    PendingArchive: ({ cardId }) => archiveCardIn(columns, cardId),
    PendingToggle: ({ cardId, done, previous }) =>
      adjustCounts(columns, cardId, toggleDelta(done, previous), 0),
    PendingAddItem: ({ cardId }) => adjustCounts(columns, cardId, 0, 1),
    AcceptedAddItem: ({ cardId, item }) =>
      adjustCounts(columns, cardId, item.done ? 1 : 0, 1),
  })

export const applyPendingOps = (
  columns: Columns,
  pending: ReadonlyArray<PendingEntry>,
): Columns =>
  Array.reduce(pending, columns, (current, entry) =>
    applyPendingOp(current, entry.op),
  )

export const rowsToCards = (rows: Rows): ReadonlyArray<Card> =>
  Array.flatMap(rows, row => (row._tag === 'CardRow' ? [row.card] : []))

export const cardsToRows = (cards: ReadonlyArray<Card>): Rows =>
  Array.map(cards, card => BoardRow.CardRow({ card }))

// CHECKLIST ROWS

export const ChecklistRow = defineTaggedUnion({
  ItemRow: { item: Item },
  AddingItemRow: { opId: Schema.Number, text: Schema.String },
})
export type ChecklistRow = typeof ChecklistRow.Type

export const applyPendingItemOp =
  (cardId: number) =>
  (
    rows: ReadonlyArray<ChecklistRow>,
    op: PendingOp,
  ): ReadonlyArray<ChecklistRow> => {
    if (op._tag === 'PendingToggle' && op.cardId === cardId) {
      return Array.map(rows, row =>
        row._tag === 'ItemRow' && row.item.id === op.itemId
          ? ChecklistRow.ItemRow({
              item: modifyFields(row.item, { done: () => op.done }),
            })
          : row,
      )
    }
    if (op._tag === 'AcceptedAddItem' && op.cardId === cardId) {
      return Array.some(
        rows,
        row => row._tag === 'ItemRow' && row.item.id === op.item.id,
      )
        ? rows
        : Array.append(rows, ChecklistRow.ItemRow({ item: op.item }))
    }
    if (op._tag === 'PendingAddItem' && op.cardId === cardId) {
      return Array.append(
        rows,
        ChecklistRow.AddingItemRow({ opId: op.opId, text: op.text }),
      )
    }
    return rows
  }

export const applyPendingItemOps = (
  items: ReadonlyArray<Item>,
  pending: ReadonlyArray<PendingEntry>,
  cardId: number,
): ReadonlyArray<ChecklistRow> => {
  const itemRows: ReadonlyArray<ChecklistRow> = Array.map(items, item =>
    ChecklistRow.ItemRow({ item }),
  )
  return Array.reduce(pending, itemRows, (rows, entry) =>
    applyPendingItemOp(cardId)(rows, entry.op),
  )
}

export const rowsToItems = (
  rows: ReadonlyArray<ChecklistRow>,
): ReadonlyArray<Item> =>
  Array.flatMap(rows, row => (row._tag === 'ItemRow' ? [row.item] : []))
