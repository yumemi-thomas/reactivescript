import { Effect, Schema } from 'effect'
import { Command } from 'foldkit'

import * as Api from './api.js'
import { ArchivedCard, Card, ColumnId, Item } from './domain'
import { Message } from './message'

// COMMAND

const UNEXPECTED_RESPONSE = 'unexpected response from the server'

const toErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

const callApi = <A>(
  request: () => Promise<unknown>,
  response: Schema.Decoder<A>,
): Effect.Effect<A, string> =>
  Effect.tryPromise({ try: request, catch: toErrorMessage }).pipe(
    Effect.flatMap(value =>
      Schema.decodeUnknownEffect(response)(value).pipe(
        Effect.mapError(() => UNEXPECTED_RESPONSE),
      ),
    ),
  )

const Acknowledged = Schema.Struct({ id: Schema.Number })
const Renamed = Schema.Struct({ id: Schema.Number, title: Schema.String })
const Toggled = Schema.Struct({ id: Schema.Number, done: Schema.Boolean })

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
    operationId: Schema.Number,
    cardId: Schema.Number,
    column: ColumnId,
    index: Schema.Number,
  },
  messages: [Message.SucceededMoveCard, Message.FailedMoveCard],
  execute: ({ operationId, cardId, column, index }) =>
    callApi(() => Api.moveCard(cardId, column, index), Acknowledged).pipe(
      Effect.as(Message.SucceededMoveCard({ operationId })),
      Effect.catch(error =>
        Effect.succeed(Message.FailedMoveCard({ operationId, error })),
      ),
    ),
})

export const AddCard = Command.define('AddCard', {
  args: { operationId: Schema.Number, title: Schema.String },
  messages: [Message.SucceededAddCard, Message.FailedAddCard],
  execute: ({ operationId, title }) =>
    callApi(() => Api.addCard('todo', title), Renamed).pipe(
      Effect.map(added =>
        Message.SucceededAddCard({
          operationId,
          id: added.id,
          title: added.title,
        }),
      ),
      Effect.catch(error =>
        Effect.succeed(Message.FailedAddCard({ operationId, error })),
      ),
    ),
})

export const RenameCard = Command.define('RenameCard', {
  args: { operationId: Schema.Number, cardId: Schema.Number, title: Schema.String },
  messages: [Message.SucceededRenameCard, Message.FailedRenameCard],
  execute: ({ operationId, cardId, title }) =>
    callApi(() => Api.renameCard(cardId, title), Renamed).pipe(
      Effect.map(renamed =>
        Message.SucceededRenameCard({ operationId, title: renamed.title }),
      ),
      Effect.catch(error =>
        Effect.succeed(Message.FailedRenameCard({ operationId, error })),
      ),
    ),
})

export const ArchiveCard = Command.define('ArchiveCard', {
  args: { operationId: Schema.Number, cardId: Schema.Number },
  messages: [Message.SucceededArchiveCard, Message.FailedArchiveCard],
  execute: ({ operationId, cardId }) =>
    callApi(() => Api.archiveCard(cardId), Acknowledged).pipe(
      Effect.as(Message.SucceededArchiveCard({ operationId })),
      Effect.catch(error =>
        Effect.succeed(Message.FailedArchiveCard({ operationId, error })),
      ),
    ),
})

export const FetchChecklist = Command.define('FetchChecklist', {
  args: { requestId: Schema.Number, cardId: Schema.Number },
  messages: [Message.SucceededFetchChecklist, Message.FailedFetchChecklist],
  execute: ({ requestId, cardId }) =>
    callApi(() => Api.fetchChecklist(cardId), Schema.Array(Item)).pipe(
      Effect.map(items =>
        Message.SucceededFetchChecklist({ requestId, cardId, items }),
      ),
      Effect.catch(error =>
        Effect.succeed(Message.FailedFetchChecklist({ requestId, error })),
      ),
    ),
})

export const ToggleItem = Command.define('ToggleItem', {
  args: {
    operationId: Schema.Number,
    cardId: Schema.Number,
    itemId: Schema.Number,
    done: Schema.Boolean,
  },
  messages: [Message.SucceededToggleItem, Message.FailedToggleItem],
  execute: ({ operationId, cardId, itemId, done }) =>
    callApi(() => Api.toggleItem(cardId, itemId, done), Toggled).pipe(
      Effect.map(toggled =>
        Message.SucceededToggleItem({ operationId, done: toggled.done }),
      ),
      Effect.catch(error =>
        Effect.succeed(Message.FailedToggleItem({ operationId, error })),
      ),
    ),
})

export const AddItem = Command.define('AddItem', {
  args: { operationId: Schema.Number, cardId: Schema.Number, text: Schema.String },
  messages: [Message.SucceededAddItem, Message.FailedAddItem],
  execute: ({ operationId, cardId, text }) =>
    callApi(() => Api.addItem(cardId, text), Item).pipe(
      Effect.map(item => Message.SucceededAddItem({ operationId, item })),
      Effect.catch(error =>
        Effect.succeed(Message.FailedAddItem({ operationId, error })),
      ),
    ),
})

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
  args: { operationId: Schema.Number, cardId: Schema.Number },
  messages: [Message.SucceededRestoreCard, Message.FailedRestoreCard],
  execute: ({ operationId, cardId }) =>
    callApi(() => Api.restoreCard(cardId), Acknowledged).pipe(
      Effect.as(Message.SucceededRestoreCard({ operationId })),
      Effect.catch(error =>
        Effect.succeed(Message.FailedRestoreCard({ operationId, error })),
      ),
    ),
})
