import { Array, Effect, Option, Schema, String } from 'effect'
import { Command, type Runtime, type Update } from 'foldkit'
import { type Document, type Html, type HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { defineTaggedUnion } from 'foldkit/schema'
import { modifyFields } from 'foldkit/struct'

import {
  addCard,
  addItem,
  archiveCard,
  fetchArchived,
  fetchCards,
  fetchChecklist,
  moveCard,
  renameCard,
  restoreCard,
  toggleItem,
} from './api.js'

// MODEL

const Column = Schema.Literals(['todo', 'doing', 'done'])
type Column = typeof Column.Type

const Direction = Schema.Literals(['left', 'right', 'up', 'down'])
type Direction = typeof Direction.Type

const columnOrder: ReadonlyArray<Column> = ['todo', 'doing', 'done']
const columnLabel: Record<Column, string> = {
  todo: 'To do',
  doing: 'Doing',
  done: 'Done',
}
const directions: ReadonlyArray<Direction> = ['left', 'right', 'up', 'down']
const DOING_LIMIT = 3

const Card = Schema.Struct({
  id: Schema.Number,
  title: Schema.String,
  done: Schema.Number,
  total: Schema.Number,
})
type Card = typeof Card.Type

const BoardCard = defineTaggedUnion({
  Saved: Card.fields,
  Adding: { key: Schema.Number, title: Schema.String },
})
type BoardCard = typeof BoardCard.Type

const ColumnLoad = defineTaggedUnion({
  Loading: {},
  Failed: { error: Schema.String },
  Loaded: { cards: Schema.Array(BoardCard) },
})
type ColumnLoad = typeof ColumnLoad.Type

const ChecklistRecord = Schema.Struct({
  id: Schema.Number,
  text: Schema.String,
  done: Schema.Boolean,
})

const ChecklistItem = defineTaggedUnion({
  Saved: ChecklistRecord.fields,
  Adding: { key: Schema.Number, text: Schema.String },
})
type ChecklistItem = typeof ChecklistItem.Type

const Checklist = defineTaggedUnion({
  Loading: {},
  Failed: { error: Schema.String },
  Loaded: { items: Schema.Array(ChecklistItem) },
})
type Checklist = typeof Checklist.Type

const Selection = defineTaggedUnion({
  None: {},
  Selected: {
    id: Schema.Number,
    checklist: Checklist,
    titleDraft: Schema.String,
    itemDraft: Schema.String,
    renameError: Schema.Option(Schema.String),
    itemError: Schema.Option(Schema.String),
  },
})
type Selection = typeof Selection.Type
type SelectedState = Extract<Selection, { readonly _tag: 'Selected' }>

const Columns = Schema.Struct({
  todo: ColumnLoad,
  doing: ColumnLoad,
  done: ColumnLoad,
})
type Columns = typeof Columns.Type

const Board = Schema.Struct({
  columns: Columns,
  selection: Selection,
  addDraft: Schema.String,
  addError: Schema.Option(Schema.String),
  moveError: Schema.Option(Schema.String),
  archiveError: Schema.Option(Schema.String),
  nextKey: Schema.Number,
})
type Board = typeof Board.Type

const ArchivedCard = Schema.Struct({ id: Schema.Number, title: Schema.String })
type ArchivedCard = typeof ArchivedCard.Type

const ArchiveList = defineTaggedUnion({
  Loading: {},
  Failed: { error: Schema.String },
  Loaded: { cards: Schema.Array(ArchivedCard) },
})
type ArchiveList = typeof ArchiveList.Type

const Archive = Schema.Struct({
  list: ArchiveList,
  restoreError: Schema.Option(Schema.String),
})
type Archive = typeof Archive.Type

const Page = Schema.Literals(['board', 'archive'])
type Page = typeof Page.Type

export const Model = Schema.Struct({
  visit: Schema.Number,
  page: Page,
  board: Board,
  archive: Archive,
})
export type Model = typeof Model.Type

// MESSAGE

export const Message = defineMessageUnion({
  ClickedTabBoard: {},
  ClickedTabArchive: {},

  SucceededFetchCards: {
    visit: Schema.Number,
    column: Column,
    cards: Schema.Array(Card),
  },
  FailedFetchCards: {
    visit: Schema.Number,
    column: Column,
    error: Schema.String,
  },
  ClickedRetryColumn: { column: Column },

  ClickedMoveCard: { id: Schema.Number, direction: Direction },
  SucceededMoveCard: {},
  FailedMoveCard: {
    visit: Schema.Number,
    id: Schema.Number,
    fromColumn: Column,
    fromIndex: Schema.Number,
    error: Schema.String,
  },

  UpdatedNewCardTitle: { value: Schema.String },
  ClickedAddCard: {},
  SucceededAddCard: {
    visit: Schema.Number,
    key: Schema.Number,
    id: Schema.Number,
  },
  FailedAddCard: {
    visit: Schema.Number,
    key: Schema.Number,
    error: Schema.String,
  },

  ClickedCard: { id: Schema.Number },
  SucceededFetchChecklist: {
    visit: Schema.Number,
    cardId: Schema.Number,
    items: Schema.Array(ChecklistRecord),
  },
  FailedFetchChecklist: {
    visit: Schema.Number,
    cardId: Schema.Number,
    error: Schema.String,
  },

  UpdatedTitleDraft: { value: Schema.String },
  ClickedRename: {},
  SucceededRenameCard: {},
  FailedRenameCard: {
    visit: Schema.Number,
    id: Schema.Number,
    previousTitle: Schema.String,
    error: Schema.String,
  },

  ClickedArchive: {},
  SucceededArchiveCard: {},
  FailedArchiveCard: {
    visit: Schema.Number,
    card: Card,
    column: Column,
    index: Schema.Number,
    error: Schema.String,
  },

  UpdatedItemDraft: { value: Schema.String },
  ClickedToggleItem: { itemId: Schema.Number },
  SucceededToggleItem: {},
  FailedToggleItem: {
    visit: Schema.Number,
    cardId: Schema.Number,
    itemId: Schema.Number,
    done: Schema.Boolean,
    error: Schema.String,
  },
  ClickedAddItem: {},
  SucceededAddItem: {
    visit: Schema.Number,
    cardId: Schema.Number,
    key: Schema.Number,
    id: Schema.Number,
  },
  FailedAddItem: {
    visit: Schema.Number,
    cardId: Schema.Number,
    key: Schema.Number,
    error: Schema.String,
  },

  SucceededFetchArchived: {
    visit: Schema.Number,
    cards: Schema.Array(ArchivedCard),
  },
  FailedFetchArchived: { visit: Schema.Number, error: Schema.String },
  ClickedRestoreCard: { id: Schema.Number },
  SucceededRestoreCard: {},
  FailedRestoreCard: {
    visit: Schema.Number,
    card: ArchivedCard,
    index: Schema.Number,
    error: Schema.String,
  },
})
export type Message = typeof Message.Type

// COMMAND

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : 'unknown error'

export const FetchCards = Command.define('FetchCards', {
  args: { visit: Schema.Number, column: Column },
  messages: [Message.SucceededFetchCards, Message.FailedFetchCards],
  execute: ({ visit, column }) =>
    Effect.tryPromise({
      try: () => fetchCards(column),
      catch: errorMessage,
    }).pipe(
      Effect.map(cards =>
        Message.SucceededFetchCards({ visit, column, cards }),
      ),
      Effect.catch(error =>
        Effect.succeed(Message.FailedFetchCards({ visit, column, error })),
      ),
    ),
})

export const MoveCard = Command.define('MoveCard', {
  args: {
    visit: Schema.Number,
    id: Schema.Number,
    column: Column,
    index: Schema.Number,
    fromColumn: Column,
    fromIndex: Schema.Number,
  },
  messages: [Message.SucceededMoveCard, Message.FailedMoveCard],
  execute: ({ visit, id, column, index, fromColumn, fromIndex }) =>
    Effect.tryPromise({
      try: () => moveCard(id, column, index),
      catch: errorMessage,
    }).pipe(
      Effect.map(() => Message.SucceededMoveCard()),
      Effect.catch(error =>
        Effect.succeed(
          Message.FailedMoveCard({
            visit,
            id,
            fromColumn,
            fromIndex,
            error,
          }),
        ),
      ),
    ),
})

export const AddCard = Command.define('AddCard', {
  args: { visit: Schema.Number, key: Schema.Number, title: Schema.String },
  messages: [Message.SucceededAddCard, Message.FailedAddCard],
  execute: ({ visit, key, title }) =>
    Effect.tryPromise({
      try: () => addCard('todo', title),
      catch: errorMessage,
    }).pipe(
      Effect.map(card => Message.SucceededAddCard({ visit, key, id: card.id })),
      Effect.catch(error =>
        Effect.succeed(Message.FailedAddCard({ visit, key, error })),
      ),
    ),
})

export const RenameCard = Command.define('RenameCard', {
  args: {
    visit: Schema.Number,
    id: Schema.Number,
    title: Schema.String,
    previousTitle: Schema.String,
  },
  messages: [Message.SucceededRenameCard, Message.FailedRenameCard],
  execute: ({ visit, id, title, previousTitle }) =>
    Effect.tryPromise({
      try: () => renameCard(id, title),
      catch: errorMessage,
    }).pipe(
      Effect.map(() => Message.SucceededRenameCard()),
      Effect.catch(error =>
        Effect.succeed(
          Message.FailedRenameCard({ visit, id, previousTitle, error }),
        ),
      ),
    ),
})

export const ArchiveCard = Command.define('ArchiveCard', {
  args: {
    visit: Schema.Number,
    card: Card,
    column: Column,
    index: Schema.Number,
  },
  messages: [Message.SucceededArchiveCard, Message.FailedArchiveCard],
  execute: ({ visit, card, column, index }) =>
    Effect.tryPromise({
      try: () => archiveCard(card.id),
      catch: errorMessage,
    }).pipe(
      Effect.map(() => Message.SucceededArchiveCard()),
      Effect.catch(error =>
        Effect.succeed(
          Message.FailedArchiveCard({ visit, card, column, index, error }),
        ),
      ),
    ),
})

export const FetchChecklist = Command.define('FetchChecklist', {
  args: { visit: Schema.Number, cardId: Schema.Number },
  messages: [
    Message.SucceededFetchChecklist,
    Message.FailedFetchChecklist,
  ],
  execute: ({ visit, cardId }) =>
    Effect.tryPromise({
      try: () => fetchChecklist(cardId),
      catch: errorMessage,
    }).pipe(
      Effect.map(items =>
        Message.SucceededFetchChecklist({ visit, cardId, items }),
      ),
      Effect.catch(error =>
        Effect.succeed(
          Message.FailedFetchChecklist({ visit, cardId, error }),
        ),
      ),
    ),
})

export const ToggleItem = Command.define('ToggleItem', {
  args: {
    visit: Schema.Number,
    cardId: Schema.Number,
    itemId: Schema.Number,
    done: Schema.Boolean,
  },
  messages: [Message.SucceededToggleItem, Message.FailedToggleItem],
  execute: ({ visit, cardId, itemId, done }) =>
    Effect.tryPromise({
      try: () => toggleItem(cardId, itemId, done),
      catch: errorMessage,
    }).pipe(
      Effect.map(() => Message.SucceededToggleItem()),
      Effect.catch(error =>
        Effect.succeed(
          Message.FailedToggleItem({
            visit,
            cardId,
            itemId,
            done,
            error,
          }),
        ),
      ),
    ),
})

export const AddItem = Command.define('AddItem', {
  args: {
    visit: Schema.Number,
    cardId: Schema.Number,
    key: Schema.Number,
    text: Schema.String,
  },
  messages: [Message.SucceededAddItem, Message.FailedAddItem],
  execute: ({ visit, cardId, key, text }) =>
    Effect.tryPromise({
      try: () => addItem(cardId, text),
      catch: errorMessage,
    }).pipe(
      Effect.map(item =>
        Message.SucceededAddItem({ visit, cardId, key, id: item.id }),
      ),
      Effect.catch(error =>
        Effect.succeed(Message.FailedAddItem({ visit, cardId, key, error })),
      ),
    ),
})

export const FetchArchived = Command.define('FetchArchived', {
  args: { visit: Schema.Number },
  messages: [
    Message.SucceededFetchArchived,
    Message.FailedFetchArchived,
  ],
  execute: ({ visit }) =>
    Effect.tryPromise({
      try: () => fetchArchived(),
      catch: errorMessage,
    }).pipe(
      Effect.map(cards => Message.SucceededFetchArchived({ visit, cards })),
      Effect.catch(error =>
        Effect.succeed(Message.FailedFetchArchived({ visit, error })),
      ),
    ),
})

export const RestoreCard = Command.define('RestoreCard', {
  args: {
    visit: Schema.Number,
    card: ArchivedCard,
    index: Schema.Number,
  },
  messages: [Message.SucceededRestoreCard, Message.FailedRestoreCard],
  execute: ({ visit, card, index }) =>
    Effect.tryPromise({
      try: () => restoreCard(card.id),
      catch: errorMessage,
    }).pipe(
      Effect.map(() => Message.SucceededRestoreCard()),
      Effect.catch(error =>
        Effect.succeed(
          Message.FailedRestoreCard({ visit, card, index, error }),
        ),
      ),
    ),
})

// INIT

const initialColumns: Columns = {
  todo: ColumnLoad.Loading(),
  doing: ColumnLoad.Loading(),
  done: ColumnLoad.Loading(),
}

const initialBoard: Board = {
  columns: initialColumns,
  selection: Selection.None(),
  addDraft: '',
  addError: Option.none(),
  moveError: Option.none(),
  archiveError: Option.none(),
  nextKey: 0,
}

const initialArchive: Archive = {
  list: ArchiveList.Loading(),
  restoreError: Option.none(),
}

const boardCommands = (visit: number) =>
  columnOrder.map(column => FetchCards({ visit, column }))

export const init: Runtime.ApplicationInit<Model, Message> = () => ({
  model: {
    visit: 0,
    page: 'board',
    board: initialBoard,
    archive: initialArchive,
  },
  commands: boardCommands(0),
})

// UPDATE

const cardsOf = (load: ColumnLoad): ReadonlyArray<BoardCard> =>
  ColumnLoad.match<ReadonlyArray<BoardCard>>(load, {
    Loading: () => [],
    Failed: () => [],
    Loaded: ({ cards }) => cards,
  })

const isLoaded = (load: ColumnLoad): boolean =>
  ColumnLoad.match<boolean>(load, {
    Loading: () => false,
    Failed: () => false,
    Loaded: () => true,
  })

const columnOf = (board: Board, column: Column): ColumnLoad =>
  board.columns[column]

const mapCards = (
  load: ColumnLoad,
  f: (cards: ReadonlyArray<BoardCard>) => ReadonlyArray<BoardCard>,
): ColumnLoad =>
  ColumnLoad.match<ColumnLoad>(load, {
    Loading: () => load,
    Failed: () => load,
    Loaded: ({ cards }) => ColumnLoad.Loaded({ cards: f(cards) }),
  })

const setColumnLoad = (
  board: Board,
  column: Column,
  load: ColumnLoad,
): Board =>
  modifyFields(board, {
    columns: columns => ({
      todo: column === 'todo' ? load : columns.todo,
      doing: column === 'doing' ? load : columns.doing,
      done: column === 'done' ? load : columns.done,
    }),
  })

const mapColumn = (
  board: Board,
  column: Column,
  f: (cards: ReadonlyArray<BoardCard>) => ReadonlyArray<BoardCard>,
): Board => setColumnLoad(board, column, mapCards(columnOf(board, column), f))

const removeAt = (
  cards: ReadonlyArray<BoardCard>,
  index: number,
): ReadonlyArray<BoardCard> => cards.slice(0, index).concat(cards.slice(index + 1))

const insertAt = (
  cards: ReadonlyArray<BoardCard>,
  index: number,
  card: BoardCard,
): ReadonlyArray<BoardCard> =>
  cards.slice(0, index).concat([card], cards.slice(index))

const detach = (board: Board, column: Column, index: number): Board =>
  mapColumn(board, column, cards => removeAt(cards, index))

const attach = (
  board: Board,
  column: Column,
  index: number,
  card: BoardCard,
): Board => mapColumn(board, column, cards => insertAt(cards, index, card))

const mapSavedCard = (
  board: Board,
  id: number,
  f: (card: Card) => Card,
): Board =>
  columnOrder.reduce(
    (next, column) =>
      mapColumn(next, column, cards =>
        cards.map(card =>
          card._tag === 'Saved' && card.id === id
            ? BoardCard.Saved(f(card))
            : card,
        ),
      ),
    board,
  )

type Location = {
  readonly column: Column
  readonly index: number
  readonly card: Card
}

const locations = (board: Board): ReadonlyArray<Location> =>
  columnOrder.flatMap(column =>
    cardsOf(columnOf(board, column)).flatMap((card, index) =>
      card._tag === 'Saved' ? [{ column, index, card }] : [],
    ),
  )

const locate = (board: Board, id: number): Option.Option<Location> =>
  Option.fromNullishOr(
    locations(board).find(location => location.card.id === id),
  )

type MoveTarget = {
  readonly column: Column
  readonly index: number
  readonly blocked: boolean
}

type MovePlan = {
  readonly location: Location
  readonly target: MoveTarget
}

const neighborColumn = (column: Column, delta: number): Option.Option<Column> =>
  Option.fromNullishOr(columnOrder[columnOrder.indexOf(column) + delta])

const doingIsFull = (board: Board): boolean =>
  cardsOf(columnOf(board, 'doing')).length >= DOING_LIMIT

const verticalTarget = (
  location: Location,
  siblingCount: number,
  direction: 'up' | 'down',
): Option.Option<MoveTarget> => {
  if (direction === 'up' && location.index > 0) {
    return Option.some({
      column: location.column,
      index: location.index - 1,
      blocked: false,
    })
  }
  if (direction === 'down' && location.index < siblingCount - 1) {
    return Option.some({
      column: location.column,
      index: location.index + 1,
      blocked: false,
    })
  }
  return Option.none()
}

const sidewaysTarget = (
  board: Board,
  column: Column,
  direction: 'left' | 'right',
): Option.Option<MoveTarget> =>
  Option.flatMap(
    neighborColumn(column, direction === 'left' ? -1 : 1),
    target =>
      ColumnLoad.match<Option.Option<MoveTarget>>(columnOf(board, target), {
        Loading: () => Option.none(),
        Failed: () => Option.none(),
        Loaded: ({ cards }) =>
          Option.some({
            column: target,
            index: cards.length,
            blocked: target === 'doing' && doingIsFull(board),
          }),
      }),
  )

const planMove = (
  board: Board,
  id: number,
  direction: Direction,
): Option.Option<MovePlan> =>
  Option.flatMap(locate(board, id), location => {
    const siblings = cardsOf(columnOf(board, location.column)).length
    const target =
      direction === 'up' || direction === 'down'
        ? verticalTarget(location, siblings, direction)
        : sidewaysTarget(board, location.column, direction)
    return Option.map(target, target => ({ location, target }))
  })

const applyMove = (board: Board, plan: MovePlan): Board =>
  attach(
    detach(board, plan.location.column, plan.location.index),
    plan.target.column,
    plan.target.index,
    BoardCard.Saved(plan.location.card),
  )

const revertMove = (
  board: Board,
  id: number,
  fromColumn: Column,
  fromIndex: number,
): Board =>
  Option.match(locate(board, id), {
    onNone: () => board,
    onSome: location =>
      attach(
        detach(board, location.column, location.index),
        fromColumn,
        fromIndex,
        BoardCard.Saved(location.card),
      ),
  })

const mapSelected = (
  board: Board,
  f: (selected: SelectedState) => SelectedState,
): Board =>
  modifyFields(board, {
    selection: selection =>
      Selection.match<Selection>(selection, {
        None: () => selection,
        Selected: f,
      }),
  })

const mapSelectedCard = (
  board: Board,
  id: number,
  f: (selected: SelectedState) => SelectedState,
): Board =>
  mapSelected(board, selected => (selected.id === id ? f(selected) : selected))

const selectedOf = (board: Board): Option.Option<SelectedState> =>
  Selection.match<Option.Option<SelectedState>>(board.selection, {
    None: () => Option.none(),
    Selected: selected => Option.some(selected),
  })

const isChecklistLoaded = (selected: SelectedState): boolean =>
  Checklist.match<boolean>(selected.checklist, {
    Loading: () => false,
    Failed: () => false,
    Loaded: () => true,
  })

const mapItems = (
  selected: SelectedState,
  f: (items: ReadonlyArray<ChecklistItem>) => ReadonlyArray<ChecklistItem>,
): SelectedState =>
  modifyFields(selected, {
    checklist: checklist =>
      Checklist.match<Checklist>(checklist, {
        Loading: () => checklist,
        Failed: () => checklist,
        Loaded: ({ items }) => Checklist.Loaded({ items: f(items) }),
      }),
  })

const setItemDone = (
  items: ReadonlyArray<ChecklistItem>,
  itemId: number,
  done: boolean,
): ReadonlyArray<ChecklistItem> =>
  items.map(item =>
    item._tag === 'Saved' && item.id === itemId
      ? ChecklistItem.Saved({ id: item.id, text: item.text, done })
      : item,
  )

const withBoard = (model: Model, f: (board: Board) => Board): Model =>
  modifyFields(model, { board: f })

const withArchive = (model: Model, f: (archive: Archive) => Archive): Model =>
  modifyFields(model, { archive: f })

const archiveCards = (archive: Archive): ReadonlyArray<ArchivedCard> =>
  ArchiveList.match<ReadonlyArray<ArchivedCard>>(archive.list, {
    Loading: () => [],
    Failed: () => [],
    Loaded: ({ cards }) => cards,
  })

const ifCurrent = (
  model: Model,
  visit: number,
  next: () => Update.Return<Model, Message>,
): Update.Return<Model, Message> => (visit === model.visit ? next() : { model })

const openPage = (model: Model, page: Page): Update.Return<Model, Message> => {
  const visit = model.visit + 1
  return {
    model: {
      visit,
      page,
      board: initialBoard,
      archive: initialArchive,
    },
    commands:
      page === 'board'
        ? boardCommands(visit)
        : [FetchArchived({ visit })],
  }
}

const startAdd = (model: Model): Update.Return<Model, Message> => {
  const title = model.board.addDraft.trim()
  const key = model.board.nextKey
  if (title.length === 0 || !isLoaded(columnOf(model.board, 'todo'))) {
    return { model }
  }
  return {
    model: withBoard(model, board =>
      modifyFields(
        mapColumn(board, 'todo', cards =>
          cards.concat([BoardCard.Adding({ key, title })]),
        ),
        {
          addDraft: () => '',
          addError: () => Option.none(),
          nextKey: () => key + 1,
        },
      ),
    ),
    commands: [AddCard({ visit: model.visit, key, title })],
  }
}

const startRename = (model: Model): Update.Return<Model, Message> =>
  Option.match(selectedOf(model.board), {
    onNone: () => ({ model }),
    onSome: selected => {
      const title = selected.titleDraft.trim()
      if (title.length === 0) {
        return { model }
      }
      return Option.match(locate(model.board, selected.id), {
        onNone: () => ({ model }),
        onSome: location => ({
          model: withBoard(model, board =>
            mapSelectedCard(
              mapSavedCard(board, selected.id, card =>
                modifyFields(card, { title: () => title }),
              ),
              selected.id,
              current =>
                modifyFields(current, {
                  renameError: () => Option.none(),
                  titleDraft: () => '',
                }),
            ),
          ),
          commands: [
            RenameCard({
              visit: model.visit,
              id: selected.id,
              title,
              previousTitle: location.card.title,
            }),
          ],
        }),
      })
    },
  })

const startArchive = (model: Model): Update.Return<Model, Message> =>
  Option.match(selectedOf(model.board), {
    onNone: () => ({ model }),
    onSome: selected =>
      Option.match(locate(model.board, selected.id), {
        onNone: () => ({ model }),
        onSome: location => ({
          model: withBoard(model, board =>
            modifyFields(detach(board, location.column, location.index), {
              selection: () => Selection.None(),
              archiveError: () => Option.none(),
            }),
          ),
          commands: [
            ArchiveCard({
              visit: model.visit,
              card: location.card,
              column: location.column,
              index: location.index,
            }),
          ],
        }),
      }),
  })

const startToggle = (model: Model, itemId: number): Update.Return<Model, Message> =>
  Option.match(selectedOf(model.board), {
    onNone: () => ({ model }),
    onSome: selected => {
      if (!isChecklistLoaded(selected)) {
        return { model }
      }
      const maybeItem = Checklist.match<Option.Option<ChecklistItem>>(
        selected.checklist,
        {
          Loading: () => Option.none(),
          Failed: () => Option.none(),
          Loaded: ({ items }) =>
            Option.fromNullishOr(
              items.find(item => item._tag === 'Saved' && item.id === itemId),
            ),
        },
      )
      return Option.match(maybeItem, {
        onNone: () => ({ model }),
        onSome: item => {
          if (item._tag !== 'Saved') {
            return { model }
          }
          const done = !item.done
          return {
            model: withBoard(model, board =>
              mapSavedCard(
                mapSelectedCard(board, selected.id, current =>
                  modifyFields(
                    mapItems(current, items => setItemDone(items, itemId, done)),
                    { itemError: () => Option.none() },
                  ),
                ),
                selected.id,
                card => modifyFields(card, { done: count => count + (done ? 1 : -1) }),
              ),
            ),
            commands: [
              ToggleItem({
                visit: model.visit,
                cardId: selected.id,
                itemId,
                done,
              }),
            ],
          }
        },
      })
    },
  })

const startAddItem = (model: Model): Update.Return<Model, Message> =>
  Option.match(selectedOf(model.board), {
    onNone: () => ({ model }),
    onSome: selected => {
      const text = selected.itemDraft.trim()
      if (text.length === 0 || !isChecklistLoaded(selected)) {
        return { model }
      }
      const key = model.board.nextKey
      return {
        model: modifyFields(model, {
          board: board =>
            modifyFields(
              mapSavedCard(
                mapSelectedCard(board, selected.id, current =>
                  modifyFields(
                    mapItems(current, items =>
                      items.concat([ChecklistItem.Adding({ key, text })]),
                    ),
                    {
                      itemDraft: () => '',
                      itemError: () => Option.none(),
                    },
                  ),
                ),
                selected.id,
                card => modifyFields(card, { total: count => count + 1 }),
              ),
              { nextKey: () => key + 1 },
            ),
        }),
        commands: [
          AddItem({ visit: model.visit, cardId: selected.id, key, text }),
        ],
      }
    },
  })

export const update = (model: Model, message: Message) =>
  Message.match<Update.Return<Model, Message>>(message, {
    ClickedTabBoard: () =>
      model.page === 'board' ? { model } : openPage(model, 'board'),
    ClickedTabArchive: () =>
      model.page === 'archive' ? { model } : openPage(model, 'archive'),

    SucceededFetchCards: ({ visit, column, cards }) =>
      ifCurrent(model, visit, () => ({
        model: withBoard(model, board =>
          setColumnLoad(
            board,
            column,
            ColumnLoad.Loaded({ cards: cards.map(card => BoardCard.Saved(card)) }),
          ),
        ),
      })),
    FailedFetchCards: ({ visit, column, error }) =>
      ifCurrent(model, visit, () => ({
        model: withBoard(model, board =>
          setColumnLoad(board, column, ColumnLoad.Failed({ error })),
        ),
      })),
    ClickedRetryColumn: ({ column }) => ({
      model: withBoard(model, board =>
        setColumnLoad(board, column, ColumnLoad.Loading()),
      ),
      commands: [FetchCards({ visit: model.visit, column })],
    }),

    ClickedMoveCard: ({ id, direction }) =>
      Option.match(planMove(model.board, id, direction), {
        onNone: () => ({ model }),
        onSome: plan => {
          if (plan.target.blocked) {
            return { model }
          }
          return {
            model: withBoard(model, board =>
              modifyFields(applyMove(board, plan), {
                moveError: () => Option.none(),
              }),
            ),
            commands: [
              MoveCard({
                visit: model.visit,
                id,
                column: plan.target.column,
                index: plan.target.index,
                fromColumn: plan.location.column,
                fromIndex: plan.location.index,
              }),
            ],
          }
        },
      }),
    SucceededMoveCard: () => ({ model }),
    FailedMoveCard: ({ visit, id, fromColumn, fromIndex, error }) =>
      ifCurrent(model, visit, () => ({
        model: withBoard(model, board =>
          modifyFields(revertMove(board, id, fromColumn, fromIndex), {
            moveError: () => Option.some(`move error: ${error}`),
          }),
        ),
      })),

    UpdatedNewCardTitle: ({ value }) => ({
      model: withBoard(model, board =>
        modifyFields(board, { addDraft: () => value }),
      ),
    }),
    ClickedAddCard: () => startAdd(model),
    SucceededAddCard: ({ visit, key, id }) =>
      ifCurrent(model, visit, () => ({
        model: withBoard(model, board =>
          mapColumn(board, 'todo', cards =>
            cards.map(card =>
              card._tag === 'Adding' && card.key === key
                ? BoardCard.Saved({ id, title: card.title, done: 0, total: 0 })
                : card,
            ),
          ),
        ),
      })),
    FailedAddCard: ({ visit, key, error }) =>
      ifCurrent(model, visit, () => ({
        model: withBoard(model, board =>
          modifyFields(
            mapColumn(board, 'todo', cards =>
              cards.filter(
                card => !(card._tag === 'Adding' && card.key === key),
              ),
            ),
            { addError: () => Option.some(`add error: ${error}`) },
          ),
        ),
      })),

    ClickedCard: ({ id }) => ({
      model: withBoard(model, board =>
        modifyFields(board, {
          selection: () =>
            Selection.Selected({
              id,
              checklist: Checklist.Loading(),
              titleDraft: '',
              itemDraft: '',
              renameError: Option.none(),
              itemError: Option.none(),
            }),
        }),
      ),
      commands: [FetchChecklist({ visit: model.visit, cardId: id })],
    }),
    SucceededFetchChecklist: ({ visit, cardId, items }) =>
      ifCurrent(model, visit, () => ({
        model: withBoard(model, board =>
          mapSelectedCard(board, cardId, selected =>
            modifyFields(selected, {
              checklist: () =>
                Checklist.Loaded({
                  items: items.map(item => ChecklistItem.Saved(item)),
                }),
            }),
          ),
        ),
      })),
    FailedFetchChecklist: ({ visit, cardId, error }) =>
      ifCurrent(model, visit, () => ({
        model: withBoard(model, board =>
          mapSelectedCard(board, cardId, selected =>
            modifyFields(selected, {
              checklist: () => Checklist.Failed({ error }),
            }),
          ),
        ),
      })),

    UpdatedTitleDraft: ({ value }) => ({
      model: withBoard(model, board =>
        mapSelected(board, selected =>
          modifyFields(selected, { titleDraft: () => value }),
        ),
      ),
    }),
    ClickedRename: () => startRename(model),
    SucceededRenameCard: () => ({ model }),
    FailedRenameCard: ({ visit, id, previousTitle, error }) =>
      ifCurrent(model, visit, () => ({
        model: withBoard(model, board =>
          mapSelectedCard(
            mapSavedCard(board, id, card =>
              modifyFields(card, { title: () => previousTitle }),
            ),
            id,
            selected =>
              modifyFields(selected, {
                renameError: () => Option.some(`rename error: ${error}`),
              }),
          ),
        ),
      })),

    ClickedArchive: () => startArchive(model),
    SucceededArchiveCard: () => ({ model }),
    FailedArchiveCard: ({ visit, card, column, index, error }) =>
      ifCurrent(model, visit, () => ({
        model: withBoard(model, board =>
          modifyFields(attach(board, column, index, BoardCard.Saved(card)), {
            archiveError: () => Option.some(`archive error: ${error}`),
          }),
        ),
      })),

    UpdatedItemDraft: ({ value }) => ({
      model: withBoard(model, board =>
        mapSelected(board, selected =>
          modifyFields(selected, { itemDraft: () => value }),
        ),
      ),
    }),
    ClickedToggleItem: ({ itemId }) => startToggle(model, itemId),
    SucceededToggleItem: () => ({ model }),
    FailedToggleItem: ({ visit, cardId, itemId, done, error }) =>
      ifCurrent(model, visit, () => ({
        model: withBoard(model, board =>
          mapSavedCard(
            mapSelectedCard(board, cardId, selected =>
              modifyFields(
                mapItems(selected, items =>
                  setItemDone(items, itemId, !done),
                ),
                {
                  itemError: () => Option.some(`item error: ${error}`),
                },
              ),
            ),
            cardId,
            card => modifyFields(card, { done: count => count + (done ? -1 : 1) }),
          ),
        ),
      })),
    ClickedAddItem: () => startAddItem(model),
    SucceededAddItem: ({ visit, cardId, key, id }) =>
      ifCurrent(model, visit, () => ({
        model: withBoard(model, board =>
          mapSelectedCard(board, cardId, selected =>
            mapItems(selected, items =>
              items.map(item =>
                item._tag === 'Adding' && item.key === key
                  ? ChecklistItem.Saved({ id, text: item.text, done: false })
                  : item,
              ),
            ),
          ),
        ),
      })),
    FailedAddItem: ({ visit, cardId, key, error }) =>
      ifCurrent(model, visit, () => ({
        model: withBoard(model, board =>
          mapSavedCard(
            mapSelectedCard(board, cardId, selected =>
              modifyFields(
                mapItems(selected, items =>
                  items.filter(
                    item => !(item._tag === 'Adding' && item.key === key),
                  ),
                ),
                {
                  itemError: () => Option.some(`item error: ${error}`),
                },
              ),
            ),
            cardId,
            card => modifyFields(card, { total: count => count - 1 }),
          ),
        ),
      })),

    SucceededFetchArchived: ({ visit, cards }) =>
      ifCurrent(model, visit, () => ({
        model: withArchive(model, archive =>
          modifyFields(archive, {
            list: () => ArchiveList.Loaded({ cards }),
          }),
        ),
      })),
    FailedFetchArchived: ({ visit, error }) =>
      ifCurrent(model, visit, () => ({
        model: withArchive(model, archive =>
          modifyFields(archive, {
            list: () => ArchiveList.Failed({ error }),
          }),
        ),
      })),
    ClickedRestoreCard: ({ id }) => {
      const cards = archiveCards(model.archive)
      const index = cards.findIndex(card => card.id === id)
      return Option.match(Option.fromNullishOr(cards[index]), {
        onNone: () => ({ model }),
        onSome: card => ({
          model: withArchive(model, archive =>
            modifyFields(archive, {
              list: () =>
                ArchiveList.Loaded({ cards: cards.filter((_, i) => i !== index) }),
              restoreError: () => Option.none(),
            }),
          ),
          commands: [RestoreCard({ visit: model.visit, card, index })],
        }),
      })
    },
    SucceededRestoreCard: () => ({ model }),
    FailedRestoreCard: ({ visit, card, index, error }) =>
      ifCurrent(model, visit, () => ({
        model: withArchive(model, archive =>
          modifyFields(archive, {
            list: list =>
              ArchiveList.match<ArchiveList>(list, {
                Loading: () => list,
                Failed: () => list,
                Loaded: ({ cards }) =>
                  ArchiveList.Loaded({
                    cards: cards
                      .slice(0, index)
                      .concat([card], cards.slice(index)),
                  }),
              }),
            restoreError: () => Option.some(`restore error: ${error}`),
          }),
        ),
      })),
  })

// VIEW

const errorLine = (
  testId: string,
  maybeError: Option.Option<string>,
  h: HtmlBuilder<Message>,
): Html =>
  Option.match(maybeError, {
    onNone: () => h.empty,
    onSome: text => h.p([h.DataAttribute('testid', testId)], [text]),
  })

const tabButton = (
  testId: string,
  label: string,
  message: Message,
  selected: boolean,
  h: HtmlBuilder<Message>,
): Html =>
  h.button(
    [
      h.Type('button'),
      h.DataAttribute('testid', testId),
      h.AriaPressed(selected ? 'true' : 'false'),
      h.OnClick(message),
      h.Class(
        selected
          ? 'px-4 py-2 rounded bg-slate-800 text-white'
          : 'px-4 py-2 rounded bg-white border border-slate-300',
      ),
    ],
    [label],
  )

const headingOf = (column: Column, load: ColumnLoad): string =>
  ColumnLoad.match<string>(load, {
    Loading: () => columnLabel[column],
    Failed: () => columnLabel[column],
    Loaded: ({ cards }) => `${columnLabel[column]} (${cards.length})`,
  })

const moveButton = (
  id: number,
  direction: Direction,
  target: MoveTarget,
  h: HtmlBuilder<Message>,
): Html =>
  h.button(
    [
      h.Type('button'),
      h.DataAttribute('testid', direction),
      h.Disabled(target.blocked),
      h.OnClick(Message.ClickedMoveCard({ id, direction })),
      h.Class(
        'px-2 py-0.5 text-sm rounded border border-slate-300 bg-white disabled:opacity-40',
      ),
    ],
    [direction],
  )

const moveButtons = (
  board: Board,
  id: number,
  h: HtmlBuilder<Message>,
): ReadonlyArray<Html> =>
  directions.flatMap(direction =>
    Option.match(moveTarget(board, id, direction), {
      onNone: (): ReadonlyArray<Html> => [],
      onSome: target => [moveButton(id, direction, target, h)],
    }),
  )

const moveTarget = (
  board: Board,
  id: number,
  direction: Direction,
): Option.Option<MoveTarget> =>
  Option.map(planMove(board, id, direction), plan => plan.target)

const cardRow = (
  board: Board,
  card: BoardCard,
  h: HtmlBuilder<Message>,
): Html =>
  BoardCard.match<Html>(card, {
    Saved: saved =>
      h.keyed('li')(
        `card-${saved.id}`,
        [h.Class('flex items-center justify-between gap-2 py-1')],
        [
          h.div(
            [
              h.DataAttribute('testid', 'card'),
              h.OnClick(Message.ClickedCard({ id: saved.id })),
              h.Class('cursor-pointer text-sm'),
            ],
            [`#${saved.id} ${saved.title} · ${saved.done}/${saved.total}`],
          ),
          h.div([h.Class('flex gap-1')], moveButtons(board, saved.id, h)),
        ],
      ),
    Adding: adding =>
      h.keyed('li')(
        `adding-${adding.key}`,
        [h.Class('py-1 text-sm text-slate-500')],
        [
          h.div(
            [h.DataAttribute('testid', 'card')],
            [`${adding.title} (adding…)`],
          ),
        ],
      ),
  })

const columnBody = (
  board: Board,
  column: Column,
  load: ColumnLoad,
  h: HtmlBuilder<Message>,
): Html =>
  ColumnLoad.match<Html>(load, {
    Loading: () => h.p([h.DataAttribute('testid', 'loading')], ['loading']),
    Failed: ({ error }) =>
      h.div(
        [h.Class('flex flex-col gap-2')],
        [
          h.p([h.DataAttribute('testid', 'column-error')], [`error: ${error}`]),
          h.button(
            [
              h.Type('button'),
              h.DataAttribute('testid', `retry-${column}`),
              h.OnClick(Message.ClickedRetryColumn({ column })),
            ],
            ['retry'],
          ),
        ],
      ),
    Loaded: ({ cards }) =>
      h.ul(
        [h.Class('flex flex-col')],
        cards.map(card => cardRow(board, card, h)),
      ),
  })

const addCardForm = (
  board: Board,
  load: ColumnLoad,
  h: HtmlBuilder<Message>,
): Html =>
  h.form(
    [
      h.Class('flex flex-col gap-2 border-t pt-3'),
      h.OnSubmit(Message.ClickedAddCard()),
    ],
    [
      h.input([
        h.Type('text'),
        h.DataAttribute('testid', 'new-card'),
        h.AriaLabel('New card title'),
        h.Placeholder('New card'),
        h.Value(board.addDraft),
        h.OnInput(value => Message.UpdatedNewCardTitle({ value })),
        h.Disabled(!isLoaded(columnOf(board, 'todo'))),
        h.Class('border rounded px-2 py-1'),
      ]),
      h.button(
        [
          h.Type('submit'),
          h.DataAttribute('testid', 'add-card'),
          h.Disabled(!isLoaded(columnOf(board, 'todo'))),
        ],
        ['Add card'],
      ),
      errorLine('add-error', board.addError, h),
    ],
  )

const columnView = (
  board: Board,
  column: Column,
  h: HtmlBuilder<Message>,
): Html => {
  const load = columnOf(board, column)
  return h.section(
    [
      h.DataAttribute('testid', `col-${column}`),
      h.Class('flex flex-col gap-3 bg-white rounded-lg p-3 min-w-0'),
    ],
    [
      h.h2(
        [h.DataAttribute('testid', `head-${column}`), h.Class('font-semibold')],
        [headingOf(column, load)],
      ),
      columnBody(board, column, load, h),
      column === 'todo' ? addCardForm(board, load, h) : h.empty,
    ],
  )
}

const itemRow = (item: ChecklistItem, h: HtmlBuilder<Message>): Html =>
  ChecklistItem.match<Html>(item, {
    Saved: saved =>
      h.keyed('li')(
        `item-${saved.id}`,
        [h.Class('flex items-center gap-2 py-1')],
        [
          h.span(
            [h.DataAttribute('testid', 'item')],
            [`${saved.done ? '[x]' : '[ ]'} ${saved.text}`],
          ),
          h.button(
            [
              h.Type('button'),
              h.DataAttribute('testid', 'toggle'),
              h.OnClick(Message.ClickedToggleItem({ itemId: saved.id })),
            ],
            ['toggle'],
          ),
        ],
      ),
    Adding: adding =>
      h.keyed('li')(
        `adding-item-${adding.key}`,
        [h.Class('flex items-center gap-2 py-1 text-slate-500')],
        [
          h.span(
            [h.DataAttribute('testid', 'item')],
            [`[ ] ${adding.text} (adding…)`],
          ),
        ],
      ),
  })

const checklistView = (selected: SelectedState, h: HtmlBuilder<Message>): Html =>
  h.section(
    [h.DataAttribute('testid', 'checklist')],
    Checklist.match<ReadonlyArray<Html>>(selected.checklist, {
      Loading: () => [h.p([], ['loading checklist'])],
      Failed: ({ error }) => [h.p([], [`checklist error: ${error}`])],
      Loaded: ({ items }) => [
        h.ul([], items.map(item => itemRow(item, h))),
        h.p(
          [h.DataAttribute('testid', 'progress')],
          [
            `${items.filter(item => item._tag === 'Saved' && item.done).length}/${items.length} done`,
          ],
        ),
      ],
    }),
  )

const selectedDetail = (
  board: Board,
  selected: SelectedState,
  h: HtmlBuilder<Message>,
): ReadonlyArray<Html> => {
  const loaded = isChecklistLoaded(selected)
  return Option.match(locate(board, selected.id), {
    onNone: (): ReadonlyArray<Html> => [h.p([], ['select a card'])],
    onSome: location => [
      h.h2([], [`#${location.card.id} ${location.card.title}`]),
      h.p([], [`in ${columnLabel[location.column]}`]),
      h.div(
        [h.Class('flex gap-2')],
        [
          h.input([
            h.Type('text'),
            h.DataAttribute('testid', 'title-input'),
            h.AriaLabel('Card title'),
            h.Value(selected.titleDraft),
            h.OnInput(value => Message.UpdatedTitleDraft({ value })),
            h.Class('border rounded px-2 py-1 flex-1'),
          ]),
          h.button(
            [
              h.Type('button'),
              h.DataAttribute('testid', 'rename'),
              h.OnClick(Message.ClickedRename()),
            ],
            ['rename'],
          ),
        ],
      ),
      errorLine('rename-error', selected.renameError, h),
      h.button(
        [
          h.Type('button'),
          h.DataAttribute('testid', 'archive'),
          h.OnClick(Message.ClickedArchive()),
        ],
        ['archive'],
      ),
      checklistView(selected, h),
      h.form(
        [h.OnSubmit(Message.ClickedAddItem())],
        [
          h.input([
            h.Type('text'),
            h.DataAttribute('testid', 'item-input'),
            h.AriaLabel('New checklist item'),
            h.Value(selected.itemDraft),
            h.OnInput(value => Message.UpdatedItemDraft({ value })),
            h.Disabled(!loaded),
            h.Class('border rounded px-2 py-1'),
          ]),
          h.button(
            [
              h.Type('submit'),
              h.DataAttribute('testid', 'add-item'),
              h.Disabled(!loaded),
            ],
            ['add item'],
          ),
        ],
      ),
      errorLine('item-error', selected.itemError, h),
    ],
  })
}

const detailView = (board: Board, h: HtmlBuilder<Message>): Html =>
  h.section(
    [
      h.DataAttribute('testid', 'detail'),
      h.Class('flex flex-col gap-3 bg-white rounded-lg p-4'),
    ],
    Option.match(selectedOf(board), {
      onNone: (): ReadonlyArray<Html> => [h.p([], ['select a card'])],
      onSome: selected => selectedDetail(board, selected, h),
    }),
  )

const boardView = (board: Board, h: HtmlBuilder<Message>): Html =>
  h.div(
    [h.Class('flex flex-col gap-4 p-4')],
    [
      h.div(
        [h.Class('grid grid-cols-3 gap-4')],
        columnOrder.map(column => columnView(board, column, h)),
      ),
      errorLine('move-error', board.moveError, h),
      errorLine('archive-error', board.archiveError, h),
      detailView(board, h),
    ],
  )

const archiveView = (archive: Archive, h: HtmlBuilder<Message>): Html =>
  h.section(
    [
      h.DataAttribute('testid', 'archived'),
      h.Class('flex flex-col gap-3 bg-white rounded-lg p-4 m-4'),
    ],
    [
      ArchiveList.match<Html>(archive.list, {
        Loading: () => h.p([], ['loading archive']),
        Failed: ({ error }) => h.p([], [`archive error: ${error}`]),
        Loaded: ({ cards }) =>
          h.ul(
            [],
            cards.map(card =>
              h.keyed('li')(
                `archived-${card.id}`,
                [h.Class('flex items-center justify-between gap-2 py-1')],
                [
                  h.span(
                    [h.DataAttribute('testid', 'archived-card')],
                    [`#${card.id} ${card.title}`],
                  ),
                  h.button(
                    [
                      h.Type('button'),
                      h.DataAttribute('testid', 'restore'),
                      h.OnClick(Message.ClickedRestoreCard({ id: card.id })),
                    ],
                    ['restore'],
                  ),
                ],
              ),
            ),
          ),
      }),
      errorLine('restore-error', archive.restoreError, h),
    ],
  )

export const view = (model: Model, h: HtmlBuilder<Message>): Document => ({
  title: 'Sprint board',
  body: h.div(
    [h.Class('min-h-screen bg-slate-100 text-slate-900')],
    [
      h.nav(
        [h.Class('flex gap-2 p-4 bg-white border-b border-slate-200')],
        [
          tabButton(
            'tab-board',
            'Board',
            Message.ClickedTabBoard(),
            model.page === 'board',
            h,
          ),
          tabButton(
            'tab-archive',
            'Archive',
            Message.ClickedTabArchive(),
            model.page === 'archive',
            h,
          ),
        ],
      ),
      model.page === 'board'
        ? boardView(model.board, h)
        : archiveView(model.archive, h),
    ],
  ),
})
