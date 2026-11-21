import { Effect, Schema } from 'effect'
import { Command } from 'foldkit'

import * as Api from './api.js'
import { ArchivedCard, Card, ColumnId, Item } from './domain'
import { Message } from './message'

// API

const UNEXPECTED_RESPONSE = 'unexpected response from the server'

const toErrorMessage = (error: unknown): string =>
  error instanceof Error && error.message !== ''
    ? error.message
    : typeof error === 'string' && error !== ''
      ? error
      : 'request failed'

const callApi = <S extends Schema.Constraint>(
  schema: S,
  request: () => PromiseLike<unknown>,
) =>
  Effect.tryPromise({ try: request, catch: toErrorMessage }).pipe(
    Effect.flatMap(response =>
      Schema.decodeUnknownEffect(schema)(response).pipe(
        Effect.mapError(() => UNEXPECTED_RESPONSE),
      ),
    ),
  )

const Acknowledged = Schema.Unknown
const AddedCardResponse = Schema.Struct({
  id: Schema.Number,
  title: Schema.optional(Schema.String),
})
const AddedItemResponse = Schema.Struct({
  id: Schema.Number,
  text: Schema.optional(Schema.String),
  done: Schema.optional(Schema.Boolean),
})

// COMMAND

export const FetchCards = Command.define('FetchCards', {
  args: { epoch: Schema.Number, column: ColumnId },
  messages: [Message.SucceededFetchCards, Message.FailedFetchCards],
  execute: ({ epoch, column }) =>
    callApi(Schema.Array(Card), () => Api.fetchCards(column)).pipe(
      Effect.match({
        onSuccess: cards => Message.SucceededFetchCards({ epoch, column, cards }),
        onFailure: error => Message.FailedFetchCards({ epoch, column, error }),
      }),
    ),
})

export const MoveCard = Command.define('MoveCard', {
  args: {
    epoch: Schema.Number,
    operationId: Schema.Number,
    cardId: Schema.Number,
    column: ColumnId,
    index: Schema.Number,
  },
  messages: [Message.SucceededMoveCard, Message.FailedMoveCard],
  execute: ({ epoch, operationId, cardId, column, index }) =>
    callApi(Acknowledged, () => Api.moveCard(cardId, column, index)).pipe(
      Effect.match({
        onSuccess: () =>
          Message.SucceededMoveCard({ epoch, operationId, column, index }),
        onFailure: error =>
          Message.FailedMoveCard({ epoch, operationId, error }),
      }),
    ),
})

export const AddCard = Command.define('AddCard', {
  args: { epoch: Schema.Number, operationId: Schema.Number, title: Schema.String },
  messages: [Message.SucceededAddCard, Message.FailedAddCard],
  execute: ({ epoch, operationId, title }) =>
    callApi(AddedCardResponse, () => Api.addCard('todo', title)).pipe(
      Effect.match({
        onSuccess: response =>
          Message.SucceededAddCard({
            epoch,
            operationId,
            id: response.id,
            title: response.title ?? title,
          }),
        onFailure: error => Message.FailedAddCard({ epoch, operationId, error }),
      }),
    ),
})

export const RenameCard = Command.define('RenameCard', {
  args: {
    epoch: Schema.Number,
    operationId: Schema.Number,
    cardId: Schema.Number,
    title: Schema.String,
  },
  messages: [Message.SucceededRenameCard, Message.FailedRenameCard],
  execute: ({ epoch, operationId, cardId, title }) =>
    callApi(Acknowledged, () => Api.renameCard(cardId, title)).pipe(
      Effect.match({
        onSuccess: () =>
          Message.SucceededRenameCard({ epoch, operationId, title }),
        onFailure: error =>
          Message.FailedRenameCard({ epoch, operationId, error }),
      }),
    ),
})

export const ArchiveCard = Command.define('ArchiveCard', {
  args: { epoch: Schema.Number, operationId: Schema.Number, cardId: Schema.Number },
  messages: [Message.SucceededArchiveCard, Message.FailedArchiveCard],
  execute: ({ epoch, operationId, cardId }) =>
    callApi(Acknowledged, () => Api.archiveCard(cardId)).pipe(
      Effect.match({
        onSuccess: () => Message.SucceededArchiveCard({ epoch, operationId }),
        onFailure: error =>
          Message.FailedArchiveCard({ epoch, operationId, error }),
      }),
    ),
})

export const FetchChecklist = Command.define('FetchChecklist', {
  args: { epoch: Schema.Number, selectionId: Schema.Number, cardId: Schema.Number },
  messages: [Message.SucceededFetchChecklist, Message.FailedFetchChecklist],
  execute: ({ epoch, selectionId, cardId }) =>
    callApi(Schema.Array(Item), () => Api.fetchChecklist(cardId)).pipe(
      Effect.match({
        onSuccess: items =>
          Message.SucceededFetchChecklist({ epoch, selectionId, items }),
        onFailure: error =>
          Message.FailedFetchChecklist({ epoch, selectionId, error }),
      }),
    ),
})

export const ToggleItem = Command.define('ToggleItem', {
  args: {
    epoch: Schema.Number,
    operationId: Schema.Number,
    cardId: Schema.Number,
    itemId: Schema.Number,
    done: Schema.Boolean,
  },
  messages: [Message.SucceededToggleItem, Message.FailedToggleItem],
  execute: ({ epoch, operationId, cardId, itemId, done }) =>
    callApi(Acknowledged, () => Api.toggleItem(cardId, itemId, done)).pipe(
      Effect.match({
        onSuccess: () =>
          Message.SucceededToggleItem({ epoch, operationId, done }),
        onFailure: error =>
          Message.FailedToggleItem({ epoch, operationId, error }),
      }),
    ),
})

export const AddItem = Command.define('AddItem', {
  args: {
    epoch: Schema.Number,
    operationId: Schema.Number,
    cardId: Schema.Number,
    text: Schema.String,
  },
  messages: [Message.SucceededAddItem, Message.FailedAddItem],
  execute: ({ epoch, operationId, cardId, text }) =>
    callApi(AddedItemResponse, () => Api.addItem(cardId, text)).pipe(
      Effect.match({
        onSuccess: response =>
          Message.SucceededAddItem({
            epoch,
            operationId,
            item: {
              id: response.id,
              text: response.text ?? text,
              done: response.done ?? false,
            },
          }),
        onFailure: error => Message.FailedAddItem({ epoch, operationId, error }),
      }),
    ),
})

export const FetchArchived = Command.define('FetchArchived', {
  args: { epoch: Schema.Number },
  messages: [Message.SucceededFetchArchived, Message.FailedFetchArchived],
  execute: ({ epoch }) =>
    callApi(Schema.Array(ArchivedCard), () => Api.fetchArchived()).pipe(
      Effect.match({
        onSuccess: cards => Message.SucceededFetchArchived({ epoch, cards }),
        onFailure: error => Message.FailedFetchArchived({ epoch, error }),
      }),
    ),
})

export const RestoreCard = Command.define('RestoreCard', {
  args: { epoch: Schema.Number, cardId: Schema.Number },
  messages: [Message.SucceededRestoreCard, Message.FailedRestoreCard],
  execute: ({ epoch, cardId }) =>
    callApi(Acknowledged, () => Api.restoreCard(cardId)).pipe(
      Effect.match({
        onSuccess: () => Message.SucceededRestoreCard({ epoch, cardId }),
        onFailure: error => Message.FailedRestoreCard({ epoch, cardId, error }),
      }),
    ),
})
