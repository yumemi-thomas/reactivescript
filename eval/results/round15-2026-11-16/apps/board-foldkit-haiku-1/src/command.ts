import { Effect, Schema } from 'effect'
import { Command } from 'foldkit'

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
} from './api'
import { Message } from './message'
import { Archived, Card, ColumnName, Item } from './model'

// COMMAND

const errorText = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

const attempt = <A>(promise: () => Promise<A>) =>
  Effect.tryPromise({ try: promise, catch: errorText })

export const FetchCards = Command.define('FetchCards', {
  args: { visit: Schema.Number, column: ColumnName },
  messages: [Message.SucceededFetchCards, Message.FailedFetchCards],
  execute: ({ visit, column }) =>
    attempt(() => fetchCards(column)).pipe(
      Effect.map(cards => Message.SucceededFetchCards({ visit, column, cards })),
      Effect.catch(error =>
        Effect.succeed(Message.FailedFetchCards({ visit, column, error })),
      ),
    ),
})

export const MoveCard = Command.define('MoveCard', {
  args: {
    visit: Schema.Number,
    id: Schema.Number,
    column: ColumnName,
    index: Schema.Number,
    fromColumn: ColumnName,
    fromIndex: Schema.Number,
  },
  messages: [Message.SucceededMoveCard, Message.FailedMoveCard],
  execute: ({ visit, id, column, index, fromColumn, fromIndex }) =>
    attempt(() => moveCard(id, column, index)).pipe(
      Effect.map(() => Message.SucceededMoveCard({ visit })),
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
    attempt(() => addCard('todo', title)).pipe(
      Effect.map(created =>
        Message.SucceededAddCard({
          visit,
          key,
          card: Card.make({
            id: created.id,
            title: created.title,
            done: 0,
            total: 0,
          }),
        }),
      ),
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
    attempt(() => renameCard(id, title)).pipe(
      Effect.map(() => Message.SucceededRenameCard({ visit })),
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
    column: ColumnName,
    index: Schema.Number,
  },
  messages: [Message.SucceededArchiveCard, Message.FailedArchiveCard],
  execute: ({ visit, card, column, index }) =>
    attempt(() => archiveCard(card.id)).pipe(
      Effect.map(() => Message.SucceededArchiveCard({ visit })),
      Effect.catch(error =>
        Effect.succeed(
          Message.FailedArchiveCard({ visit, card, column, index, error }),
        ),
      ),
    ),
})

export const FetchChecklist = Command.define('FetchChecklist', {
  args: { visit: Schema.Number, cardId: Schema.Number },
  messages: [Message.SucceededFetchChecklist, Message.FailedFetchChecklist],
  execute: ({ visit, cardId }) =>
    attempt(() => fetchChecklist(cardId)).pipe(
      Effect.map(items =>
        Message.SucceededFetchChecklist({ visit, cardId, items }),
      ),
      Effect.catch(error =>
        Effect.succeed(Message.FailedFetchChecklist({ visit, cardId, error })),
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
    attempt(() => toggleItem(cardId, itemId, done)).pipe(
      Effect.map(() => Message.SucceededToggleItem({ visit })),
      Effect.catch(error =>
        Effect.succeed(
          Message.FailedToggleItem({ visit, cardId, itemId, done, error }),
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
    attempt(() => addItem(cardId, text)).pipe(
      Effect.map(item =>
        Message.SucceededAddItem({
          visit,
          cardId,
          key,
          item: Item.make({ id: item.id, text: item.text, done: item.done }),
        }),
      ),
      Effect.catch(error =>
        Effect.succeed(Message.FailedAddItem({ visit, cardId, key, error })),
      ),
    ),
})

export const FetchArchived = Command.define('FetchArchived', {
  args: { visit: Schema.Number },
  messages: [Message.SucceededFetchArchived, Message.FailedFetchArchived],
  execute: ({ visit }) =>
    attempt(() => fetchArchived()).pipe(
      Effect.map(archived =>
        Message.SucceededFetchArchived({ visit, archived }),
      ),
      Effect.catch(error =>
        Effect.succeed(Message.FailedFetchArchived({ visit, error })),
      ),
    ),
})

export const RestoreCard = Command.define('RestoreCard', {
  args: {
    visit: Schema.Number,
    archived: Archived,
    index: Schema.Number,
  },
  messages: [Message.SucceededRestoreCard, Message.FailedRestoreCard],
  execute: ({ visit, archived, index }) =>
    attempt(() => restoreCard(archived.id)).pipe(
      Effect.map(() => Message.SucceededRestoreCard({ visit })),
      Effect.catch(error =>
        Effect.succeed(
          Message.FailedRestoreCard({ visit, archived, index, error }),
        ),
      ),
    ),
})
