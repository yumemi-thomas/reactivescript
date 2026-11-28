import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'

import { ArchivedCard, Card, Column, Direction, Item } from './domain'

export const Message = defineMessageUnion({
  ClickedBoardTab: {},
  ClickedArchiveTab: {},
  SucceededFetchCards: { requestId: Schema.Number, column: Column, cards: Schema.Array(Card) },
  FailedFetchCards: { requestId: Schema.Number, column: Column, error: Schema.String },
  ClickedRetryColumn: { column: Column },
  ClickedMoveCard: { cardId: Schema.Number, direction: Direction },
  SucceededMoveCard: { opId: Schema.Number },
  FailedMoveCard: { opId: Schema.Number, error: Schema.String },
  UpdatedNewCardInput: { value: Schema.String },
  SubmittedNewCard: {},
  SucceededAddCard: { opId: Schema.Number, id: Schema.Number, title: Schema.String },
  FailedAddCard: { opId: Schema.Number, error: Schema.String },
  ClickedCard: { cardId: Schema.Number },
  UpdatedTitleInput: { value: Schema.String },
  SubmittedRename: {},
  SucceededRenameCard: { opId: Schema.Number, title: Schema.String },
  FailedRenameCard: { opId: Schema.Number, error: Schema.String },
  ClickedArchive: {},
  SucceededArchiveCard: { opId: Schema.Number },
  FailedArchiveCard: { opId: Schema.Number, error: Schema.String },
  SucceededFetchChecklist: { requestId: Schema.Number, items: Schema.Array(Item) },
  FailedFetchChecklist: { requestId: Schema.Number, error: Schema.String },
  ClickedRetryChecklist: {},
  ClickedToggleItem: { itemId: Schema.Number },
  SucceededToggleItem: { opId: Schema.Number },
  FailedToggleItem: { opId: Schema.Number, error: Schema.String },
  UpdatedItemInput: { value: Schema.String },
  SubmittedNewItem: {},
  SucceededAddItem: { opId: Schema.Number, item: Item },
  FailedAddItem: { opId: Schema.Number, error: Schema.String },
  SucceededFetchArchived: { requestId: Schema.Number, cards: Schema.Array(ArchivedCard) },
  FailedFetchArchived: { requestId: Schema.Number, error: Schema.String },
  ClickedRetryArchive: {},
  ClickedRestore: { cardId: Schema.Number },
  SucceededRestoreCard: { opId: Schema.Number },
  FailedRestoreCard: { opId: Schema.Number, error: Schema.String },
})
export type Message = typeof Message.Type
