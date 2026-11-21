import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'

import { ArchivedCard, Card, ColumnId, Item } from './domain'

export const Direction = Schema.Literals(['left', 'right', 'up', 'down'])
export type Direction = typeof Direction.Type

export const Message = defineMessageUnion({
  ClickedBoardTab: {},
  ClickedArchiveTab: {},
  SucceededFetchCards: { epoch: Schema.Number, column: ColumnId, cards: Schema.Array(Card) },
  FailedFetchCards: { epoch: Schema.Number, column: ColumnId, error: Schema.String },
  ClickedRetryColumn: { column: ColumnId },
  ClickedMove: { cardId: Schema.Number, direction: Direction },
  SucceededMoveCard: { epoch: Schema.Number, operationId: Schema.Number, column: ColumnId, index: Schema.Number },
  FailedMoveCard: { epoch: Schema.Number, operationId: Schema.Number, error: Schema.String },
  UpdatedNewCardInput: { value: Schema.String },
  SubmittedNewCard: {},
  SucceededAddCard: { epoch: Schema.Number, operationId: Schema.Number, id: Schema.Number, title: Schema.String },
  FailedAddCard: { epoch: Schema.Number, operationId: Schema.Number, error: Schema.String },
  ClickedCard: { cardId: Schema.Number },
  UpdatedTitleInput: { value: Schema.String },
  SubmittedRename: {},
  SucceededRenameCard: { epoch: Schema.Number, operationId: Schema.Number, title: Schema.String },
  FailedRenameCard: { epoch: Schema.Number, operationId: Schema.Number, error: Schema.String },
  ClickedArchive: {},
  SucceededArchiveCard: { epoch: Schema.Number, operationId: Schema.Number },
  FailedArchiveCard: { epoch: Schema.Number, operationId: Schema.Number, error: Schema.String },
  SucceededFetchChecklist: { epoch: Schema.Number, selectionId: Schema.Number, items: Schema.Array(Item) },
  FailedFetchChecklist: { epoch: Schema.Number, selectionId: Schema.Number, error: Schema.String },
  ClickedToggleItem: { itemId: Schema.Number },
  SucceededToggleItem: { epoch: Schema.Number, operationId: Schema.Number, done: Schema.Boolean },
  FailedToggleItem: { epoch: Schema.Number, operationId: Schema.Number, error: Schema.String },
  UpdatedItemInput: { value: Schema.String },
  SubmittedNewItem: {},
  SucceededAddItem: { epoch: Schema.Number, operationId: Schema.Number, item: Item },
  FailedAddItem: { epoch: Schema.Number, operationId: Schema.Number, error: Schema.String },
  SucceededFetchArchived: { epoch: Schema.Number, cards: Schema.Array(ArchivedCard) },
  FailedFetchArchived: { epoch: Schema.Number, error: Schema.String },
  ClickedRestore: { cardId: Schema.Number },
  SucceededRestoreCard: { epoch: Schema.Number, cardId: Schema.Number },
  FailedRestoreCard: { epoch: Schema.Number, cardId: Schema.Number, error: Schema.String },
})
export type Message = typeof Message.Type
