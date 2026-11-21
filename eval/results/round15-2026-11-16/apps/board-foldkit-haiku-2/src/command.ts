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
import { Archived, Card, Column } from './model'

const errorMessage = (cause: unknown): string =>
  cause instanceof Error ? cause.message : String(cause)

const attempt = <A>(run: () => Promise<A>): Effect.Effect<A, string> =>
  Effect.tryPromise({ try: run, catch: errorMessage })

export const FetchCards = Command.define('FetchCards', {
  args: { visit: Schema.Number, column: Column },
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
    localId: Schema.Number,
    id: Schema.Number,
    column: Column,
    index: Schema.Number,
    fromColumn: Column,
    fromIndex: Schema.Number,
  },
  messages: [Message.SucceededMoveCard, Message.FailedMoveCard],
  execute: ({ visit, localId, id, column, index, fromColumn, fromIndex }) =>
    attempt(() => moveCard(id, column, index)).pipe(
      Effect.map(() => Message.SucceededMoveCard({ visit })),
      Effect.catch(error =>
        Effect.succeed(
          Message.FailedMoveCard({ visit, localId, fromColumn, fromIndex, error }),
        ),
      ),
    ),
})

export const AddCard = Command.define('AddCard', {
  args: { visit: Schema.Number, localId: Schema.Number, title: Schema.String },
  messages: [Message.SucceededAddCard, Message.FailedAddCard],
  execute: ({ visit, localId, title }) =>
    attempt(() => addCard('todo', title)).pipe(
      Effect.map(({ id }) => Message.SucceededAddCard({ visit, localId, id })),
      Effect.catch(error =>
        Effect.succeed(Message.FailedAddCard({ visit, localId, error })),
      ),
    ),
})

export const RenameCard = Command.define('RenameCard', {
  args: {
    visit: Schema.Number,
    localId: Schema.Number,
    id: Schema.Number,
    title: Schema.String,
    previousTitle: Schema.String,
  },
  messages: [Message.SucceededRenameCard, Message.FailedRenameCard],
  execute: ({ visit, localId, id, title, previousTitle }) =>
    attempt(() => renameCard(id, title)).pipe(
      Effect.map(() => Message.SucceededRenameCard({ visit })),
      Effect.catch(error =>
        Effect.succeed(
          Message.FailedRenameCard({ visit, localId, previousTitle, error }),
        ),
      ),
    ),
})

export const ArchiveCard = Command.define('ArchiveCard', {
  args: {
    visit: Schema.Number,
    id: Schema.Number,
    card: Card,
    column: Column,
    index: Schema.Number,
  },
  messages: [Message.SucceededArchiveCard, Message.FailedArchiveCard],
  execute: ({ visit, id, card, column, index }) =>
    attempt(() => archiveCard(id)).pipe(
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
      Effect.map(items => Message.SucceededFetchChecklist({ visit, cardId, items })),
      Effect.catch(error =>
        Effect.succeed(Message.FailedFetchChecklist({ visit, cardId, error })),
      ),
    ),
})

export const ToggleItem = Command.define('ToggleItem', {
  args: {
    visit: Schema.Number,
    cardId: Schema.Number,
    itemLocalId: Schema.Number,
    itemId: Schema.Number,
    done: Schema.Boolean,
  },
  messages: [Message.SucceededToggleItem, Message.FailedToggleItem],
  execute: ({ visit, cardId, itemLocalId, itemId, done }) =>
    attempt(() => toggleItem(cardId, itemId, done)).pipe(
      Effect.map(() => Message.SucceededToggleItem({ visit })),
      Effect.catch(error =>
        Effect.succeed(
          Message.FailedToggleItem({ visit, cardId, itemLocalId, done, error }),
        ),
      ),
    ),
})

export const AddItem = Command.define('AddItem', {
  args: {
    visit: Schema.Number,
    cardId: Schema.Number,
    itemLocalId: Schema.Number,
    text: Schema.String,
  },
  messages: [Message.SucceededAddItem, Message.FailedAddItem],
  execute: ({ visit, cardId, itemLocalId, text }) =>
    attempt(() => addItem(cardId, text)).pipe(
      Effect.map(({ id }) =>
        Message.SucceededAddItem({ visit, cardId, itemLocalId, id }),
      ),
      Effect.catch(error =>
        Effect.succeed(Message.FailedAddItem({ visit, cardId, itemLocalId, error })),
      ),
    ),
})

export const FetchArchived = Command.define('FetchArchived', {
  args: { visit: Schema.Number },
  messages: [Message.SucceededFetchArchived, Message.FailedFetchArchived],
  execute: ({ visit }) =>
    attempt(() => fetchArchived()).pipe(
      Effect.map(items => Message.SucceededFetchArchived({ visit, items })),
      Effect.catch(error =>
        Effect.succeed(Message.FailedFetchArchived({ visit, error })),
      ),
    ),
})

export const RestoreCard = Command.define('RestoreCard', {
  args: { visit: Schema.Number, item: Archived, index: Schema.Number },
  messages: [Message.SucceededRestoreCard, Message.FailedRestoreCard],
  execute: ({ visit, item, index }) =>
    attempt(() => restoreCard(item.id)).pipe(
      Effect.map(() => Message.SucceededRestoreCard({ visit })),
      Effect.catch(error =>
        Effect.succeed(Message.FailedRestoreCard({ visit, item, index, error })),
      ),
    ),
})
