import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'

import {
  ArchivedCard,
  BoardCard,
  ChecklistItem,
  ColumnName,
  MoveDirection,
} from './model'

// MESSAGE

export const Message = defineMessageUnion({
  ClickedBoardTab: {},
  ClickedArchiveTab: {},
  SucceededFetchCards: {
    visit: Schema.Number,
    column: ColumnName,
    cards: Schema.Array(BoardCard),
  },
  FailedFetchCards: {
    visit: Schema.Number,
    column: ColumnName,
    error: Schema.String,
  },
  ClickedRetryColumn: { column: ColumnName },
  ClickedMoveCard: { id: Schema.Number, direction: MoveDirection },
  SucceededMoveCard: {},
  FailedMoveCard: {
    visit: Schema.Number,
    id: Schema.Number,
    fromColumn: ColumnName,
    fromIndex: Schema.Number,
    error: Schema.String,
  },
  UpdatedNewCardTitle: { value: Schema.String },
  SubmittedNewCard: {},
  SucceededAddCard: {
    visit: Schema.Number,
    key: Schema.Number,
    id: Schema.Number,
    title: Schema.String,
  },
  FailedAddCard: {
    visit: Schema.Number,
    key: Schema.Number,
    error: Schema.String,
  },
  ClickedCard: { id: Schema.Number },
  UpdatedRenameTitle: { value: Schema.String },
  SubmittedRename: {},
  SucceededRenameCard: {},
  FailedRenameCard: {
    visit: Schema.Number,
    id: Schema.Number,
    previousTitle: Schema.String,
    error: Schema.String,
  },
  ClickedArchiveCard: {},
  SucceededArchiveCard: {},
  FailedArchiveCard: {
    visit: Schema.Number,
    card: BoardCard,
    column: ColumnName,
    index: Schema.Number,
    error: Schema.String,
  },
  SucceededFetchChecklist: {
    visit: Schema.Number,
    cardId: Schema.Number,
    items: Schema.Array(ChecklistItem),
  },
  FailedFetchChecklist: {
    visit: Schema.Number,
    cardId: Schema.Number,
    error: Schema.String,
  },
  ClickedToggleItem: { itemId: Schema.Number },
  SucceededToggleItem: {},
  FailedToggleItem: {
    visit: Schema.Number,
    cardId: Schema.Number,
    itemId: Schema.Number,
    done: Schema.Boolean,
    error: Schema.String,
  },
  UpdatedItemInput: { value: Schema.String },
  SubmittedItem: {},
  SucceededAddItem: {
    visit: Schema.Number,
    cardId: Schema.Number,
    key: Schema.Number,
    item: ChecklistItem,
  },
  FailedAddItem: {
    visit: Schema.Number,
    cardId: Schema.Number,
    key: Schema.Number,
    error: Schema.String,
  },
  SucceededFetchArchived: {
    visit: Schema.Number,
    archived: Schema.Array(ArchivedCard),
  },
  FailedFetchArchived: { visit: Schema.Number, error: Schema.String },
  ClickedRestoreCard: { id: Schema.Number },
  SucceededRestoreCard: {},
  FailedRestoreCard: {
    visit: Schema.Number,
    card: ArchivedCard,
    index: Schema.Number,
    error: Schema.String,
  },
})
export type Message = typeof Message.Type
