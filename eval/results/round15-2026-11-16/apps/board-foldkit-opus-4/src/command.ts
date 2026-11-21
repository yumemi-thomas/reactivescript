import { Effect, Schema } from 'effect'
import { Command } from 'foldkit'

import * as Api from './api'
import { ArchivedCard, Card, ColumnId, Item } from './domain'
import { Message } from './message'

const UNEXPECTED_RESPONSE = 'unexpected response from the server'

const errorMessage = (cause: unknown): string => {
  if (cause instanceof Error && cause.message !== '') {
    return cause.message
  }
  if (typeof cause === 'string' && cause !== '') {
    return cause
  }
  return 'request failed'
}

const callApi = <S extends Schema.Top>(
  request: () => Promise<unknown>,
  response: S,
): Effect.Effect<S['Type'], string, S['DecodingServices']> =>
  Effect.tryPromise({ try: request, catch: errorMessage }).pipe(
    Effect.flatMap(value =>
      Schema.decodeUnknownEffect(response)(value).pipe(
        Effect.mapError(() => UNEXPECTED_RESPONSE),
      ),
    ),
  )

const TitleResponse = Schema.Struct({ id: Schema.Number, title: Schema.String })

// CARDS

export const FetchCards = Command.define('FetchCards', {
  args: { requestId: Schema.Number, column: ColumnId },
  messages: [Message.SucceededFetchCards, Message.FailedFetchCards],
  execute: ({ requestId, column }) =>
    callApi(() => Api.fetchCards(column), Schema.Array(Card)).pipe(
      Effect.map(cards =>
        Message.SucceededFetchCards({ requestId, column, cards }),
      ),
      Effect.catch(error =>
        Effect.succeed(Message.FailedFetchCards({ requestId, column, error })),
      ),
    ),
})

export const MoveCard = Command.define('MoveCard', {
  args: {
    opId: Schema.Number,
    cardId: Schema.Number,
    column: ColumnId,
    index: Schema.Number,
  },
  messages: [Message.SucceededMoveCard, Message.FailedMoveCard],
  execute: ({ opId, cardId, column, index }) =>
    callApi(() => Api.moveCard(cardId, column, index), Schema.Unknown).pipe(
      Effect.as(Message.SucceededMoveCard({ opId })),
      Effect.catch(error =>
        Effect.succeed(Message.FailedMoveCard({ opId, error })),
      ),
    ),
})

export const AddCard = Command.define('AddCard', {
  args: { opId: Schema.Number, column: ColumnId, title: Schema.String },
  messages: [Message.SucceededAddCard, Message.FailedAddCard],
  execute: ({ opId, column, title }) =>
    callApi(() => Api.addCard(column, title), TitleResponse).pipe(
      Effect.map(response =>
        Message.SucceededAddCard({
          opId,
          card: { id: response.id, title: response.title, done: 0, total: 0 },
        }),
      ),
      Effect.catch(error =>
        Effect.succeed(Message.FailedAddCard({ opId, error })),
      ),
    ),
})

export const RenameCard = Command.define('RenameCard', {
  args: { opId: Schema.Number, cardId: Schema.Number, title: Schema.String },
  messages: [Message.SucceededRenameCard, Message.FailedRenameCard],
  execute: ({ opId, cardId, title }) =>
    callApi(() => Api.renameCard(cardId, title), TitleResponse).pipe(
      Effect.map(response =>
        Message.SucceededRenameCard({ opId, title: response.title }),
      ),
      Effect.catch(error =>
        Effect.succeed(Message.FailedRenameCard({ opId, error })),
      ),
    ),
})

export const ArchiveCard = Command.define('ArchiveCard', {
  args: { opId: Schema.Number, cardId: Schema.Number },
  messages: [Message.SucceededArchiveCard, Message.FailedArchiveCard],
  execute: ({ opId, cardId }) =>
    callApi(() => Api.archiveCard(cardId), Schema.Unknown).pipe(
      Effect.as(Message.SucceededArchiveCard({ opId })),
      Effect.catch(error =>
        Effect.succeed(Message.FailedArchiveCard({ opId, error })),
      ),
    ),
})

// CHECKLIST

export const FetchChecklist = Command.define('FetchChecklist', {
  args: { requestId: Schema.Number, cardId: Schema.Number },
  messages: [Message.SucceededFetchChecklist, Message.FailedFetchChecklist],
  execute: ({ requestId, cardId }) =>
    callApi(() => Api.fetchChecklist(cardId), Schema.Array(Item)).pipe(
      Effect.map(items => Message.SucceededFetchChecklist({ requestId, items })),
      Effect.catch(error =>
        Effect.succeed(Message.FailedFetchChecklist({ requestId, error })),
      ),
    ),
})

export const ToggleItem = Command.define('ToggleItem', {
  args: {
    opId: Schema.Number,
    cardId: Schema.Number,
    itemId: Schema.Number,
    done: Schema.Boolean,
  },
  messages: [Message.SucceededToggleItem, Message.FailedToggleItem],
  execute: ({ opId, cardId, itemId, done }) =>
    callApi(() => Api.toggleItem(cardId, itemId, done), Schema.Unknown).pipe(
      Effect.as(Message.SucceededToggleItem({ opId })),
      Effect.catch(error =>
        Effect.succeed(Message.FailedToggleItem({ opId, error })),
      ),
    ),
})

export const AddItem = Command.define('AddItem', {
  args: { opId: Schema.Number, cardId: Schema.Number, text: Schema.String },
  messages: [Message.SucceededAddItem, Message.FailedAddItem],
  execute: ({ opId, cardId, text }) =>
    callApi(() => Api.addItem(cardId, text), Item).pipe(
      Effect.map(item => Message.SucceededAddItem({ opId, item })),
      Effect.catch(error =>
        Effect.succeed(Message.FailedAddItem({ opId, error })),
      ),
    ),
})

// ARCHIVE

export const FetchArchived = Command.define('FetchArchived', {
  args: { requestId: Schema.Number },
  messages: [Message.SucceededFetchArchived, Message.FailedFetchArchived],
  execute: ({ requestId }) =>
    callApi(() => Api.fetchArchived(), Schema.Array(ArchivedCard)).pipe(
      Effect.map(cards => Message.SucceededFetchArchived({ requestId, cards })),
      Effect.catch(error =>
        Effect.succeed(Message.FailedFetchArchived({ requestId, error })),
      ),
    ),
})

export const RestoreCard = Command.define('RestoreCard', {
  args: { opId: Schema.Number, cardId: Schema.Number },
  messages: [Message.SucceededRestoreCard, Message.FailedRestoreCard],
  execute: ({ opId, cardId }) =>
    callApi(() => Api.restoreCard(cardId), Schema.Unknown).pipe(
      Effect.as(Message.SucceededRestoreCard({ opId })),
      Effect.catch(error =>
        Effect.succeed(Message.FailedRestoreCard({ opId, error })),
      ),
    ),
})
