import { Effect, Schema } from 'effect'
import { Command } from 'foldkit'

import * as Api from '../api.js'
import { callApi, callApiDecoded } from '../apiCall'
import { Message } from './message'
import { Card, ColumnId, Item } from './model'

const AddedCard = Schema.Struct({ id: Schema.Number, title: Schema.String })
const RenamedCard = Schema.Struct({ id: Schema.Number, title: Schema.String })

export const FetchCards = Command.define('FetchCards', {
  args: { column: ColumnId },
  messages: [Message.SucceededFetchCards, Message.FailedFetchCards],
  execute: ({ column }) =>
    callApiDecoded(Schema.Array(Card), () => Api.fetchCards(column)).pipe(
      Effect.map(cards => Message.SucceededFetchCards({ column, cards })),
      Effect.catch(error =>
        Effect.succeed(Message.FailedFetchCards({ column, error })),
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
    callApi(() => Api.moveCard(cardId, column, index)).pipe(
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
    callApiDecoded(AddedCard, () => Api.addCard(column, title)).pipe(
      Effect.map(card =>
        Message.SucceededAddCard({ opId, id: card.id, title: card.title }),
      ),
      Effect.catch(error =>
        Effect.succeed(Message.FailedAddCard({ opId, error })),
      ),
    ),
})

export const RenameCard = Command.define('RenameCard', {
  args: {
    opId: Schema.Number,
    selectionId: Schema.Number,
    cardId: Schema.Number,
    title: Schema.String,
  },
  messages: [Message.SucceededRenameCard, Message.FailedRenameCard],
  execute: ({ opId, selectionId, cardId, title }) =>
    callApiDecoded(RenamedCard, () => Api.renameCard(cardId, title)).pipe(
      Effect.map(renamed =>
        Message.SucceededRenameCard({ opId, title: renamed.title }),
      ),
      Effect.catch(error =>
        Effect.succeed(Message.FailedRenameCard({ opId, selectionId, error })),
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

export const FetchChecklist = Command.define('FetchChecklist', {
  args: { selectionId: Schema.Number, cardId: Schema.Number },
  messages: [Message.SucceededFetchChecklist, Message.FailedFetchChecklist],
  execute: ({ selectionId, cardId }) =>
    callApiDecoded(Schema.Array(Item), () => Api.fetchChecklist(cardId)).pipe(
      Effect.map(items =>
        Message.SucceededFetchChecklist({ selectionId, items }),
      ),
      Effect.catch(error =>
        Effect.succeed(Message.FailedFetchChecklist({ selectionId, error })),
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
    callApiDecoded(Item, () => Api.addItem(cardId, text)).pipe(
      Effect.map(item => Message.SucceededAddItem({ opId, item })),
      Effect.catch(error =>
        Effect.succeed(Message.FailedAddItem({ opId, error })),
      ),
    ),
})
