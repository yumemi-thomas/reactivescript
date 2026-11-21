import { Effect, Schema } from 'effect'
import { Command } from 'foldkit'

import * as Api from './api.js'
import { ArchivedCard, Card, Column, Item } from './domain'
import { Message } from './message'

// NOTE: The API rejects with an Error whose message is shown to the user.
// A response that does not match the documented shape is reported as a
// failure too, so a misbehaving server never corrupts the Model.
const UNEXPECTED_RESPONSE = 'unexpected response from server'

const describeRejection = (error: unknown): string =>
  error instanceof Error && error.message !== '' ? error.message : String(error)

const callApi = <S extends Schema.Top & { readonly DecodingServices: never }>(
  request: () => PromiseLike<unknown>,
  response: S,
): Effect.Effect<S['Type'], string> =>
  Effect.tryPromise({ try: request, catch: describeRejection }).pipe(
    Effect.flatMap(value =>
      Schema.decodeUnknownEffect(response)(value).pipe(
        Effect.mapError(() => UNEXPECTED_RESPONSE),
      ),
    ),
  )

const Session = Schema.Number
const OperationId = Schema.Number

// BOARD

export const FetchCards = Command.define('FetchCards', {
  args: { session: Session, column: Column },
  messages: [Message.SucceededFetchCards, Message.FailedFetchCards],
  execute: ({ session, column }) =>
    callApi(() => Api.fetchCards(column), Schema.Array(Card)).pipe(
      Effect.map(cards => Message.SucceededFetchCards({ session, column, cards })),
      Effect.catch(error =>
        Effect.succeed(Message.FailedFetchCards({ session, column, error })),
      ),
    ),
})

export const MoveCard = Command.define('MoveCard', {
  args: {
    session: Session,
    operationId: OperationId,
    cardId: Schema.Number,
    column: Column,
    index: Schema.Number,
  },
  messages: [Message.SucceededMoveCard, Message.FailedMoveCard],
  execute: ({ session, operationId, cardId, column, index }) =>
    callApi(() => Api.moveCard(cardId, column, index), Schema.Unknown).pipe(
      Effect.as(Message.SucceededMoveCard({ session, operationId })),
      Effect.catch(error =>
        Effect.succeed(Message.FailedMoveCard({ session, operationId, error })),
      ),
    ),
})

const AddedCard = Schema.Struct({ id: Schema.Number, title: Schema.String })

export const AddCard = Command.define('AddCard', {
  args: { session: Session, operationId: OperationId, title: Schema.String },
  messages: [Message.SucceededAddCard, Message.FailedAddCard],
  execute: ({ session, operationId, title }) =>
    callApi(() => Api.addCard('todo', title), AddedCard).pipe(
      Effect.map(added =>
        Message.SucceededAddCard({ session, operationId, id: added.id, title: added.title }),
      ),
      Effect.catch(error =>
        Effect.succeed(Message.FailedAddCard({ session, operationId, error })),
      ),
    ),
})

const RenamedCard = Schema.Struct({ title: Schema.String })

export const RenameCard = Command.define('RenameCard', {
  args: {
    session: Session,
    operationId: OperationId,
    cardId: Schema.Number,
    title: Schema.String,
  },
  messages: [Message.SucceededRenameCard, Message.FailedRenameCard],
  execute: ({ session, operationId, cardId, title }) =>
    callApi(() => Api.renameCard(cardId, title), RenamedCard).pipe(
      Effect.map(renamed =>
        Message.SucceededRenameCard({ session, operationId, title: renamed.title }),
      ),
      Effect.catch(error =>
        Effect.succeed(Message.FailedRenameCard({ session, operationId, error })),
      ),
    ),
})

export const ArchiveCard = Command.define('ArchiveCard', {
  args: { session: Session, operationId: OperationId, cardId: Schema.Number },
  messages: [Message.SucceededArchiveCard, Message.FailedArchiveCard],
  execute: ({ session, operationId, cardId }) =>
    callApi(() => Api.archiveCard(cardId), Schema.Unknown).pipe(
      Effect.as(Message.SucceededArchiveCard({ session, operationId })),
      Effect.catch(error =>
        Effect.succeed(Message.FailedArchiveCard({ session, operationId, error })),
      ),
    ),
})

// CHECKLIST

export const FetchChecklist = Command.define('FetchChecklist', {
  args: { session: Session, selection: Schema.Number, cardId: Schema.Number },
  messages: [Message.SucceededFetchChecklist, Message.FailedFetchChecklist],
  execute: ({ session, selection, cardId }) =>
    callApi(() => Api.fetchChecklist(cardId), Schema.Array(Item)).pipe(
      Effect.map(items => Message.SucceededFetchChecklist({ session, selection, items })),
      Effect.catch(error =>
        Effect.succeed(Message.FailedFetchChecklist({ session, selection, error })),
      ),
    ),
})

export const ToggleItem = Command.define('ToggleItem', {
  args: {
    session: Session,
    operationId: OperationId,
    cardId: Schema.Number,
    itemId: Schema.Number,
    done: Schema.Boolean,
  },
  messages: [Message.SucceededToggleItem, Message.FailedToggleItem],
  execute: ({ session, operationId, cardId, itemId, done }) =>
    callApi(() => Api.toggleItem(cardId, itemId, done), Schema.Unknown).pipe(
      Effect.as(Message.SucceededToggleItem({ session, operationId })),
      Effect.catch(error =>
        Effect.succeed(Message.FailedToggleItem({ session, operationId, error })),
      ),
    ),
})

export const AddItem = Command.define('AddItem', {
  args: {
    session: Session,
    operationId: OperationId,
    cardId: Schema.Number,
    text: Schema.String,
  },
  messages: [Message.SucceededAddItem, Message.FailedAddItem],
  execute: ({ session, operationId, cardId, text }) =>
    callApi(() => Api.addItem(cardId, text), Item).pipe(
      Effect.map(item => Message.SucceededAddItem({ session, operationId, item })),
      Effect.catch(error =>
        Effect.succeed(Message.FailedAddItem({ session, operationId, error })),
      ),
    ),
})

// ARCHIVE

export const FetchArchived = Command.define('FetchArchived', {
  args: { session: Session },
  messages: [Message.SucceededFetchArchived, Message.FailedFetchArchived],
  execute: ({ session }) =>
    callApi(() => Api.fetchArchived(), Schema.Array(ArchivedCard)).pipe(
      Effect.map(cards => Message.SucceededFetchArchived({ session, cards })),
      Effect.catch(error =>
        Effect.succeed(Message.FailedFetchArchived({ session, error })),
      ),
    ),
})

export const RestoreCard = Command.define('RestoreCard', {
  args: { session: Session, operationId: OperationId, cardId: Schema.Number },
  messages: [Message.SucceededRestoreCard, Message.FailedRestoreCard],
  execute: ({ session, operationId, cardId }) =>
    callApi(() => Api.restoreCard(cardId), Schema.Unknown).pipe(
      Effect.as(Message.SucceededRestoreCard({ session, operationId })),
      Effect.catch(error =>
        Effect.succeed(Message.FailedRestoreCard({ session, operationId, error })),
      ),
    ),
})
