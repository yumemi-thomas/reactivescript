import { Effect, Schema } from 'effect'
import { Command } from 'foldkit'

import * as Api from './api.js'
import { ArchivedCard, Card, Column, Item } from './domain'
import { Message } from './message'

const UNEXPECTED_RESPONSE = 'unexpected response from the server'

const errorMessage = (cause: unknown): string =>
  cause instanceof Error && cause.message !== ''
    ? cause.message
    : 'request failed'

const callApi = <A>(request: () => Promise<A>): Effect.Effect<A, string> =>
  Effect.tryPromise({ try: () => request(), catch: errorMessage })

const decodeCards = Schema.decodeUnknownEffect(Schema.Array(Card))
const decodeItems = Schema.decodeUnknownEffect(Schema.Array(Item))
const decodeItem = Schema.decodeUnknownEffect(Item)
const decodeArchived = Schema.decodeUnknownEffect(Schema.Array(ArchivedCard))
const decodeAddedCard = Schema.decodeUnknownEffect(
  Schema.Struct({ id: Schema.Number, title: Schema.String }),
)
const decodeRenamedCard = Schema.decodeUnknownEffect(
  Schema.Struct({ title: Schema.String }),
)

const asUnexpected = Effect.mapError(() => UNEXPECTED_RESPONSE)

// BOARD

export const FetchCards = Command.define('FetchCards', {
  args: { requestId: Schema.Number, column: Column },
  messages: [Message.SucceededFetchCards, Message.FailedFetchCards],
  execute: ({ requestId, column }) =>
    callApi(() => Api.fetchCards(column)).pipe(
      Effect.flatMap(response => asUnexpected(decodeCards(response))),
      Effect.map(cards =>
        Message.SucceededFetchCards({ requestId, column, cards }),
      ),
      Effect.catch(error =>
        Effect.succeed(
          Message.FailedFetchCards({ requestId, column, error }),
        ),
      ),
    ),
})

export const MoveCard = Command.define('MoveCard', {
  args: {
    opId: Schema.Number,
    cardId: Schema.Number,
    column: Column,
    index: Schema.Number,
  },
  messages: [Message.SucceededMoveCard, Message.FailedMoveCard],
  execute: ({ opId, cardId, column, index }) =>
    callApi(() => Api.moveCard(cardId, column, index)).pipe(
      Effect.as(Message.SucceededMoveCard({ opId })),
      Effect.catch(error =>
        Effect.succeed(Message.FailedMoveCard({ opId, error })),
      ),
    ),
})

export const AddCard = Command.define('AddCard', {
  args: { opId: Schema.Number, column: Column, title: Schema.String },
  messages: [Message.SucceededAddCard, Message.FailedAddCard],
  execute: ({ opId, column, title }) =>
    callApi(() => Api.addCard(column, title)).pipe(
      Effect.flatMap(response => asUnexpected(decodeAddedCard(response))),
      Effect.map(card =>
        Message.SucceededAddCard({ opId, id: card.id, title: card.title }),
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
    callApi(() => Api.renameCard(cardId, title)).pipe(
      Effect.flatMap(response =>
        decodeRenamedCard(response).pipe(
          Effect.map(renamed => renamed.title),
          Effect.orElseSucceed(() => title),
        ),
      ),
      Effect.map(confirmedTitle =>
        Message.SucceededRenameCard({ opId, title: confirmedTitle }),
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
    callApi(() => Api.archiveCard(cardId)).pipe(
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
    callApi(() => Api.fetchChecklist(cardId)).pipe(
      Effect.flatMap(response => asUnexpected(decodeItems(response))),
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
    callApi(() => Api.toggleItem(cardId, itemId, done)).pipe(
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
    callApi(() => Api.addItem(cardId, text)).pipe(
      Effect.flatMap(response => asUnexpected(decodeItem(response))),
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
    callApi(() => Api.fetchArchived()).pipe(
      Effect.flatMap(response => asUnexpected(decodeArchived(response))),
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
    callApi(() => Api.restoreCard(cardId)).pipe(
      Effect.as(Message.SucceededRestoreCard({ opId })),
      Effect.catch(error =>
        Effect.succeed(Message.FailedRestoreCard({ opId, error })),
      ),
    ),
})
