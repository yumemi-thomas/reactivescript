import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'

import { ArchivedCard, Card, ColumnId, Direction, Item } from './domain'

// MESSAGE

export const Message = defineMessageUnion({
  ClickedBoardTab: {},
  ClickedArchiveTab: {},
  SucceededFetchCards: { requestId: Schema.Number, column: ColumnId, cards: Schema.Array(Card) },
  FailedFetchCards: { requestId: Schema.Number, column: ColumnId, error: Schema.String },
  ClickedRetryColumn: { column: ColumnId },
  ClickedMove: { cardId: Schema.Number, direction: Direction },
  SucceededMoveCard: { operationId: Schema.Number },
  FailedMoveCard: { operationId: Schema.Number, error: Schema.String },
  UpdatedNewCardInput: { value: Schema.String },
  ClickedAddCard: {},
  SucceededAddCard: { operationId: Schema.Number, id: Schema.Number, title: Schema.String },
  FailedAddCard: { operationId: Schema.Number, error: Schema.String },
  ClickedCard: { cardId: Schema.Number },
  UpdatedTitleInput: { value: Schema.String },
  ClickedRename: {},
  SucceededRenameCard: { operationId: Schema.Number, title: Schema.String },
  FailedRenameCard: { operationId: Schema.Number, error: Schema.String },
  ClickedArchive: {},
  SucceededArchiveCard: { operationId: Schema.Number },
  FailedArchiveCard: { operationId: Schema.Number, error: Schema.String },
  SucceededFetchChecklist: { requestId: Schema.Number, cardId: Schema.Number, items: Schema.Array(Item) },
  FailedFetchChecklist: { requestId: Schema.Number, error: Schema.String },
  ClickedToggleItem: { itemId: Schema.Number },
  SucceededToggleItem: { operationId: Schema.Number, done: Schema.Boolean },
  FailedToggleItem: { operationId: Schema.Number, error: Schema.String },
  UpdatedItemInput: { value: Schema.String },
  ClickedAddItem: {},
  SucceededAddItem: { operationId: Schema.Number, item: Item },
  FailedAddItem: { operationId: Schema.Number, error: Schema.String },
  SucceededFetchArchived: { requestId: Schema.Number, cards: Schema.Array(ArchivedCard) },
  FailedFetchArchived: { requestId: Schema.Number, error: Schema.String },
  ClickedRestore: { cardId: Schema.Number },
  SucceededRestoreCard: { operationId: Schema.Number },
  FailedRestoreCard: { operationId: Schema.Number, error: Schema.String },
})
export type Message = typeof Message.Type
