import { Array, Option, Schema, pipe } from 'effect'
import { defineTaggedUnion } from 'foldkit/schema'
import { modifyFields } from 'foldkit/struct'

// DOMAIN

export const ColumnId = Schema.Literals(['todo', 'doing', 'done'])
export type ColumnId = typeof ColumnId.Type

export const COLUMN_IDS: ReadonlyArray<ColumnId> = ['todo', 'doing', 'done']

export const COLUMN_NAMES: Readonly<Record<ColumnId, string>> = {
  todo: 'To do',
  doing: 'Doing',
  done: 'Done',
}

export const DOING_LIMIT = 3

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

export const OpStatus = Schema.Literals(['Pending', 'Confirmed'])
export type OpStatus = typeof OpStatus.Type

export const PENDING: OpStatus = 'Pending'
export const CONFIRMED: OpStatus = 'Confirmed'

// MODEL

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

export const BoardOp = defineTaggedUnion({
  MoveOp: {
    opId: Schema.Number,
    cardId: Schema.Number,
    column: ColumnId,
    index: Schema.Number,
    status: OpStatus,
  },
  RenameOp: {
    opId: Schema.Number,
    cardId: Schema.Number,
    title: Schema.String,
    status: OpStatus,
  },
  ArchiveOp: { opId: Schema.Number, cardId: Schema.Number, status: OpStatus },
  AddOp: {
    opId: Schema.Number,
    column: ColumnId,
    title: Schema.String,
    maybeCard: Schema.Option(Card),
  },
  CountOp: {
    opId: Schema.Number,
    cardId: Schema.Number,
    doneDelta: Schema.Number,
    totalDelta: Schema.Number,
    status: OpStatus,
  },
})
export type BoardOp = typeof BoardOp.Type

export const ChecklistLoad = defineTaggedUnion({
  ChecklistLoading: {},
  ChecklistFailed: { error: Schema.String },
  ChecklistLoaded: { items: Schema.Array(Item) },
})
export type ChecklistLoad = typeof ChecklistLoad.Type

export const ItemOp = defineTaggedUnion({
  ToggleOp: {
    opId: Schema.Number,
    itemId: Schema.Number,
    done: Schema.Boolean,
    status: OpStatus,
  },
  AddItemOp: {
    opId: Schema.Number,
    text: Schema.String,
    maybeItem: Schema.Option(Item),
  },
})
export type ItemOp = typeof ItemOp.Type

export const Selection = Schema.Struct({
  selectionId: Schema.Number,
  cardId: Schema.Number,
  titleInput: Schema.String,
  itemInput: Schema.String,
  maybeRenameError: Schema.Option(Schema.String),
  maybeItemError: Schema.Option(Schema.String),
  checklist: ChecklistLoad,
  itemOps: Schema.Array(ItemOp),
})
export type Selection = typeof Selection.Type

export const Detail = defineTaggedUnion({
  NoSelection: {},
  Selected: { selection: Selection },
})
export type Detail = typeof Detail.Type

export const Model = Schema.Struct({
  nextId: Schema.Number,
  columns: Columns,
  ops: Schema.Array(BoardOp),
  newCardInput: Schema.String,
  maybeMoveError: Schema.Option(Schema.String),
  maybeAddError: Schema.Option(Schema.String),
  maybeArchiveError: Schema.Option(Schema.String),
  detail: Detail,
})
export type Model = typeof Model.Type

// SHOWN BOARD

export const Entry = defineTaggedUnion({
  SavedEntry: { card: Card },
  AddingEntry: { opId: Schema.Number, title: Schema.String },
})
export type Entry = typeof Entry.Type

export type ShownColumn = Option.Option<ReadonlyArray<Entry>>
export type ShownBoard = Readonly<Record<ColumnId, ShownColumn>>

export type CardLocation = Readonly<{
  column: ColumnId
  index: number
  card: Card
}>

const mapBoard = (
  board: ShownBoard,
  f: (column: ShownColumn, columnId: ColumnId) => ShownColumn,
): ShownBoard => ({
  todo: f(board.todo, 'todo'),
  doing: f(board.doing, 'doing'),
  done: f(board.done, 'done'),
})

const insertClamped = <A>(
  entries: ReadonlyArray<A>,
  index: number,
  entry: A,
): ReadonlyArray<A> => {
  const position = Math.max(0, Math.min(index, entries.length))
  return [...Array.take(entries, position), entry, ...Array.drop(entries, position)]
}

const isEntryFor =
  (cardId: number) =>
  (entry: Entry): boolean =>
    entry._tag === 'SavedEntry' && entry.card.id === cardId

const mapCard = (
  board: ShownBoard,
  cardId: number,
  f: (card: Card) => Card,
): ShownBoard =>
  mapBoard(board, column =>
    Option.map(column, entries =>
      Array.map(entries, entry =>
        Entry.match(entry, {
          SavedEntry: ({ card }) =>
            card.id === cardId ? Entry.SavedEntry({ card: f(card) }) : entry,
          AddingEntry: () => entry,
        }),
      ),
    ),
  )

const removeCard = (board: ShownBoard, cardId: number): ShownBoard =>
  mapBoard(board, column =>
    Option.map(column, entries =>
      Array.filter(entries, entry => !isEntryFor(cardId)(entry)),
    ),
  )

export const locateCard = (
  board: ShownBoard,
  cardId: number,
): Option.Option<CardLocation> =>
  Array.findFirst(COLUMN_IDS, columnId =>
    pipe(
      board[columnId],
      Option.flatMap(entries =>
        Option.map(
          Array.findFirstIndex(entries, isEntryFor(cardId)),
          index => ({ entries, index }),
        ),
      ),
      Option.flatMap(({ entries, index }) =>
        pipe(
          Array.get(entries, index),
          Option.flatMap(entry =>
            Entry.match(entry, {
              SavedEntry: ({ card }) =>
                Option.some<CardLocation>({ column: columnId, index, card }),
              AddingEntry: () => Option.none<CardLocation>(),
            }),
          ),
        ),
      ),
    ),
  )

const applyOp = (board: ShownBoard, op: BoardOp): ShownBoard =>
  BoardOp.match(op, {
    MoveOp: ({ cardId, column, index }) =>
      Option.match(
        Option.all({
          location: locateCard(board, cardId),
          target: board[column],
        }),
        {
          onNone: () => board,
          onSome: ({ location }) => {
            const withoutCard = removeCard(board, cardId)
            return mapBoard(withoutCard, (shownColumn, columnId) =>
              columnId === column
                ? Option.map(shownColumn, entries =>
                    insertClamped(
                      entries,
                      index,
                      Entry.SavedEntry({ card: location.card }),
                    ),
                  )
                : shownColumn,
            )
          },
        },
      ),
    RenameOp: ({ cardId, title }) =>
      mapCard(board, cardId, card => modifyFields(card, { title: () => title })),
    ArchiveOp: ({ cardId }) => removeCard(board, cardId),
    AddOp: ({ opId, column, title, maybeCard }) =>
      mapBoard(board, (shownColumn, columnId) =>
        columnId === column
          ? Option.map(shownColumn, entries =>
              Array.append(
                entries,
                Option.match(maybeCard, {
                  onNone: () => Entry.AddingEntry({ opId, title }),
                  onSome: card => Entry.SavedEntry({ card }),
                }),
              ),
            )
          : shownColumn,
      ),
    CountOp: ({ cardId, doneDelta, totalDelta }) =>
      mapCard(board, cardId, card =>
        modifyFields(card, {
          done: done => done + doneDelta,
          total: total => total + totalDelta,
        }),
      ),
  })

const baseBoard = (columns: Columns): ShownBoard => {
  const fromLoad = (load: ColumnLoad): ShownColumn =>
    ColumnLoad.match(load, {
      ColumnLoading: () => Option.none(),
      ColumnFailed: () => Option.none(),
      ColumnLoaded: ({ cards }) =>
        Option.some(Array.map(cards, card => Entry.SavedEntry({ card }))),
    })
  return {
    todo: fromLoad(columns.todo),
    doing: fromLoad(columns.doing),
    done: fromLoad(columns.done),
  }
}

export const shownBoard = (model: Model): ShownBoard =>
  Array.reduce(model.ops, baseBoard(model.columns), applyOp)

export const shownCount = (board: ShownBoard, columnId: ColumnId): number =>
  Option.match(board[columnId], {
    onNone: () => 0,
    onSome: entries => entries.length,
  })

export const isDoingFull = (board: ShownBoard): boolean =>
  shownCount(board, 'doing') >= DOING_LIMIT

const isBoardOpConfirmed = (op: BoardOp): boolean =>
  BoardOp.match(op, {
    MoveOp: ({ status }) => status === 'Confirmed',
    RenameOp: ({ status }) => status === 'Confirmed',
    ArchiveOp: ({ status }) => status === 'Confirmed',
    AddOp: ({ maybeCard }) => Option.isSome(maybeCard),
    CountOp: ({ status }) => status === 'Confirmed',
  })

const boardOpId = (op: BoardOp): number => op.opId

const savedCards = (entries: ReadonlyArray<Entry>): ReadonlyArray<Card> =>
  Array.getSomes(
    Array.map(entries, entry =>
      Entry.match(entry, {
        SavedEntry: ({ card }) => Option.some(card),
        AddingEntry: () => Option.none<Card>(),
      }),
    ),
  )

/** Folds the confirmed operations at the head of the queue into the
 *  server-confirmed columns, so the queue only holds what is still in doubt. */
const flushBoard = (model: Model): Model => {
  const [confirmed, remaining] = Array.span(model.ops, isBoardOpConfirmed)
  if (Array.isArrayEmpty(confirmed)) {
    return model
  }
  const flushed = Array.reduce(confirmed, baseBoard(model.columns), applyOp)
  const settleColumn = (load: ColumnLoad, columnId: ColumnId): ColumnLoad =>
    Option.match(flushed[columnId], {
      onNone: () => load,
      onSome: entries => ColumnLoad.ColumnLoaded({ cards: savedCards(entries) }),
    })
  return modifyFields(model, {
    columns: columns => ({
      todo: settleColumn(columns.todo, 'todo'),
      doing: settleColumn(columns.doing, 'doing'),
      done: settleColumn(columns.done, 'done'),
    }),
    ops: () => remaining,
  })
}

export const hasBoardOp = (model: Model, opId: number): boolean =>
  Array.some(model.ops, op => boardOpId(op) === opId)

export const confirmBoardOp = (
  model: Model,
  opId: number,
  confirm: (op: BoardOp) => BoardOp,
): Model =>
  flushBoard(
    modifyFields(model, {
      ops: ops =>
        Array.map(ops, op => (boardOpId(op) === opId ? confirm(op) : op)),
    }),
  )

export const dropBoardOp = (model: Model, opId: number): Model =>
  flushBoard(
    modifyFields(model, {
      ops: ops => Array.filter(ops, op => boardOpId(op) !== opId),
    }),
  )

export const confirmStatus = (op: BoardOp): BoardOp =>
  BoardOp.match(op, {
    MoveOp: move => modifyFields(move, { status: () => CONFIRMED }),
    RenameOp: rename =>
      modifyFields(rename, { status: () => CONFIRMED }),
    ArchiveOp: archive =>
      modifyFields(archive, { status: () => CONFIRMED }),
    AddOp: add => add,
    CountOp: count => modifyFields(count, { status: () => CONFIRMED }),
  })

// SHOWN CHECKLIST

export const ItemEntry = defineTaggedUnion({
  SavedItem: { item: Item },
  AddingItem: { opId: Schema.Number, text: Schema.String },
})
export type ItemEntry = typeof ItemEntry.Type

const applyItemOp = (
  entries: ReadonlyArray<ItemEntry>,
  op: ItemOp,
): ReadonlyArray<ItemEntry> =>
  ItemOp.match(op, {
    ToggleOp: ({ itemId, done }) =>
      Array.map(entries, entry =>
        ItemEntry.match(entry, {
          SavedItem: ({ item }) =>
            item.id === itemId
              ? ItemEntry.SavedItem({
                  item: modifyFields(item, { done: () => done }),
                })
              : entry,
          AddingItem: () => entry,
        }),
      ),
    AddItemOp: ({ opId, text, maybeItem }) =>
      Array.append(
        entries,
        Option.match(maybeItem, {
          onNone: () => ItemEntry.AddingItem({ opId, text }),
          onSome: item => ItemEntry.SavedItem({ item }),
        }),
      ),
  })

export const shownItems = (
  items: ReadonlyArray<Item>,
  itemOps: ReadonlyArray<ItemOp>,
): ReadonlyArray<ItemEntry> =>
  Array.reduce(
    itemOps,
    Array.map(items, item => ItemEntry.SavedItem({ item })),
    applyItemOp,
  )

export const findShownItem = (
  entries: ReadonlyArray<ItemEntry>,
  itemId: number,
): Option.Option<Item> =>
  Array.findFirst(entries, entry =>
    ItemEntry.match(entry, {
      SavedItem: ({ item }) =>
        item.id === itemId ? Option.some(item) : Option.none<Item>(),
      AddingItem: () => Option.none<Item>(),
    }),
  )

const isItemOpConfirmed = (op: ItemOp): boolean =>
  ItemOp.match(op, {
    ToggleOp: ({ status }) => status === 'Confirmed',
    AddItemOp: ({ maybeItem }) => Option.isSome(maybeItem),
  })

const flushItems = (selection: Selection): Selection => {
  const [confirmed, remaining] = Array.span(selection.itemOps, isItemOpConfirmed)
  if (Array.isArrayEmpty(confirmed)) {
    return selection
  }
  return ChecklistLoad.match(selection.checklist, {
    ChecklistLoading: () => selection,
    ChecklistFailed: () => selection,
    ChecklistLoaded: ({ items }) =>
      modifyFields(selection, {
        checklist: () =>
          ChecklistLoad.ChecklistLoaded({
            items: Array.getSomes(
              Array.map(shownItems(items, confirmed), entry =>
                ItemEntry.match(entry, {
                  SavedItem: ({ item }) => Option.some(item),
                  AddingItem: () => Option.none<Item>(),
                }),
              ),
            ),
          }),
        itemOps: () => remaining,
      }),
  })
}

export const hasItemOp = (selection: Selection, opId: number): boolean =>
  Array.some(selection.itemOps, op => op.opId === opId)

export const confirmItemOp = (
  selection: Selection,
  opId: number,
  confirm: (op: ItemOp) => ItemOp,
): Selection =>
  flushItems(
    modifyFields(selection, {
      itemOps: itemOps =>
        Array.map(itemOps, op => (op.opId === opId ? confirm(op) : op)),
    }),
  )

export const dropItemOp = (selection: Selection, opId: number): Selection =>
  flushItems(
    modifyFields(selection, {
      itemOps: itemOps => Array.filter(itemOps, op => op.opId !== opId),
    }),
  )
