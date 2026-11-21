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
} from './api.js'
import { Message } from './message'
import { ArchivedCard, BoardCard, ColumnId } from './model'

// COMMAND

const errorMessage = (cause: unknown): string =>
  cause instanceof Error ? cause.message : String(cause)

const attempt = <A>(run: () => Promise<A>) =>
  Effect.tryPromise({ try: run, catch: errorMessage })

export const FetchCards = Command.define('FetchCards', {
  args: { session: Schema.Number, column: ColumnId },
  messages: [Message.SucceededFetchCards, Message.FailedFetchCards],
  execute: ({ session, column }) =>
    attempt(() => fetchCards(column)).pipe(
      Effect.map(cards =>
        Message.SucceededFetchCards({ session, column, cards }),
      ),
      Effect.catch(error =>
        Effect.succeed(Message.FailedFetchCards({ session, column, error })),
      ),
    ),
})

export const MoveCard = Command.define('MoveCard', {
  args: {
    session: Schema.Number,
    cardId: Schema.Number,
    column: ColumnId,
    index: Schema.Number,
    fromColumn: ColumnId,
    fromIndex: Schema.Number,
  },
  messages: [Message.SucceededMoveCard, Message.FailedMoveCard],
  execute: ({ session, cardId, column, index, fromColumn, fromIndex }) =>
    attempt(() => moveCard(cardId, column, index)).pipe(
      Effect.map(() => Message.SucceededMoveCard({ session, cardId })),
      Effect.catch(error =>
        Effect.succeed(
          Message.FailedMoveCard({
            session,
            cardId,
            fromColumn,
            fromIndex,
            error,
          }),
        ),
      ),
    ),
})

export const AddCard = Command.define('AddCard', {
  args: {
    session: Schema.Number,
    localId: Schema.Number,
    title: Schema.String,
  },
  messages: [Message.SucceededAddCard, Message.FailedAddCard],
  execute: ({ session, localId, title }) =>
    attempt(() => addCard('todo', title)).pipe(
      Effect.map(card =>
        Message.SucceededAddCard({ session, localId, cardId: card.id }),
      ),
      Effect.catch(error =>
        Effect.succeed(Message.FailedAddCard({ session, localId, error })),
      ),
    ),
})

export const FetchChecklist = Command.define('FetchChecklist', {
  args: { session: Schema.Number, cardId: Schema.Number },
  messages: [
    Message.SucceededFetchChecklist,
    Message.FailedFetchChecklist,
  ],
  execute: ({ session, cardId }) =>
    attempt(() => fetchChecklist(cardId)).pipe(
      Effect.map(items =>
        Message.SucceededFetchChecklist({ session, cardId, items }),
      ),
      Effect.catch(error =>
        Effect.succeed(
          Message.FailedFetchChecklist({ session, cardId, error }),
        ),
      ),
    ),
})

export const RenameCard = Command.define('RenameCard', {
  args: {
    session: Schema.Number,
    cardId: Schema.Number,
    title: Schema.String,
    previousTitle: Schema.String,
  },
  messages: [Message.SucceededRenameCard, Message.FailedRenameCard],
  execute: ({ session, cardId, title, previousTitle }) =>
    attempt(() => renameCard(cardId, title)).pipe(
      Effect.map(() => Message.SucceededRenameCard({ session, cardId })),
      Effect.catch(error =>
        Effect.succeed(
          Message.FailedRenameCard({
            session,
            cardId,
            previousTitle,
            error,
          }),
        ),
      ),
    ),
})

export const ArchiveCard = Command.define('ArchiveCard', {
  args: {
    session: Schema.Number,
    cardId: Schema.Number,
    column: ColumnId,
    index: Schema.Number,
    card: BoardCard,
  },
  messages: [Message.SucceededArchiveCard, Message.FailedArchiveCard],
  execute: ({ session, cardId, column, index, card }) =>
    attempt(() => archiveCard(cardId)).pipe(
      Effect.map(() => Message.SucceededArchiveCard({ session, cardId })),
      Effect.catch(error =>
        Effect.succeed(
          Message.FailedArchiveCard({
            session,
            cardId,
            column,
            index,
            card,
            error,
          }),
        ),
      ),
    ),
})

export const ToggleItem = Command.define('ToggleItem', {
  args: {
    session: Schema.Number,
    cardId: Schema.Number,
    itemId: Schema.Number,
    done: Schema.Boolean,
  },
  messages: [Message.SucceededToggleItem, Message.FailedToggleItem],
  execute: ({ session, cardId, itemId, done }) =>
    attempt(() => toggleItem(cardId, itemId, done)).pipe(
      Effect.map(() =>
        Message.SucceededToggleItem({ session, cardId, itemId }),
      ),
      Effect.catch(error =>
        Effect.succeed(
          Message.FailedToggleItem({ session, cardId, itemId, done, error }),
        ),
      ),
    ),
})

export const AddItem = Command.define('AddItem', {
  args: {
    session: Schema.Number,
    cardId: Schema.Number,
    localId: Schema.Number,
    text: Schema.String,
  },
  messages: [Message.SucceededAddItem, Message.FailedAddItem],
  execute: ({ session, cardId, localId, text }) =>
    attempt(() => addItem(cardId, text)).pipe(
      Effect.map(item =>
        Message.SucceededAddItem({
          session,
          cardId,
          localId,
          itemId: item.id,
        }),
      ),
      Effect.catch(error =>
        Effect.succeed(
          Message.FailedAddItem({ session, cardId, localId, error }),
        ),
      ),
    ),
})

export const FetchArchived = Command.define('FetchArchived', {
  args: { session: Schema.Number },
  messages: [
    Message.SucceededFetchArchived,
    Message.FailedFetchArchived,
  ],
  execute: ({ session }) =>
    attempt(() => fetchArchived()).pipe(
      Effect.map(cards =>
        Message.SucceededFetchArchived({ session, cards }),
      ),
      Effect.catch(error =>
        Effect.succeed(Message.FailedFetchArchived({ session, error })),
      ),
    ),
})

export const RestoreCard = Command.define('RestoreCard', {
  args: {
    session: Schema.Number,
    index: Schema.Number,
    archived: ArchivedCard,
  },
  messages: [Message.SucceededRestoreCard, Message.FailedRestoreCard],
  execute: ({ session, index, archived }) =>
    attempt(() => restoreCard(archived.id)).pipe(
      Effect.map(() =>
        Message.SucceededRestoreCard({ session, cardId: archived.id }),
      ),
      Effect.catch(error =>
        Effect.succeed(
          Message.FailedRestoreCard({
            session,
            cardId: archived.id,
            index,
            archived,
            error,
          }),
        ),
      ),
    ),
})
