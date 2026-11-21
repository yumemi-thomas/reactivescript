import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'

import { ArchivedCard, Card, ColumnId, Item } from './domain'

export const Direction = Schema.Literals(['left', 'right', 'up', 'down'])
export type Direction = typeof Direction.Type

export const Message = defineMessageUnion({
  ClickedBoardTab: {},
  ClickedArchiveTab: {},

  SucceededFetchCards: {
    requestId: Schema.Number,
    column: ColumnId,
    cards: Schema.Array(Card),
  },
  FailedFetchCards: {
    requestId: Schema.Number,
    column: ColumnId,
    error: Schema.String,
  },
  ClickedRetryColumn: { column: ColumnId },

  ClickedMoveCard: { cardId: Schema.Number, direction: Direction },
  SucceededMoveCard: { opId: Schema.Number },
  FailedMoveCard: { opId: Schema.Number, error: Schema.String },

  UpdatedNewCardTitle: { value: Schema.String },
  ClickedAddCard: {},
  SucceededAddCard: { opId: Schema.Number, card: Card },
  FailedAddCard: { opId: Schema.Number, error: Schema.String },

  ClickedCard: { cardId: Schema.Number },

  UpdatedTitleInput: { value: Schema.String },
  ClickedRename: {},
  SucceededRenameCard: { opId: Schema.Number, title: Schema.String },
  FailedRenameCard: { opId: Schema.Number, error: Schema.String },

  ClickedArchive: {},
  SucceededArchiveCard: { opId: Schema.Number },
  FailedArchiveCard: { opId: Schema.Number, error: Schema.String },

  SucceededFetchChecklist: {
    requestId: Schema.Number,
    items: Schema.Array(Item),
  },
  FailedFetchChecklist: { requestId: Schema.Number, error: Schema.String },

  ClickedToggleItem: { itemId: Schema.Number },
  SucceededToggleItem: { opId: Schema.Number },
  FailedToggleItem: { opId: Schema.Number, error: Schema.String },

  UpdatedItemInput: { value: Schema.String },
  ClickedAddItem: {},
  SucceededAddItem: { opId: Schema.Number, item: Item },
  FailedAddItem: { opId: Schema.Number, error: Schema.String },

  SucceededFetchArchived: {
    requestId: Schema.Number,
    cards: Schema.Array(ArchivedCard),
  },
  FailedFetchArchived: { requestId: Schema.Number, error: Schema.String },

  ClickedRestore: { cardId: Schema.Number },
  SucceededRestoreCard: { opId: Schema.Number },
  FailedRestoreCard: { opId: Schema.Number, error: Schema.String },
})
export type Message = typeof Message.Type
