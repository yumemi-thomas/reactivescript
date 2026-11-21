import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'

import { Archived, Card, ColumnName, Direction, Item } from './model'

// MESSAGE

export const Message = defineMessageUnion({
  ClickedBoardTab: {},
  ClickedArchiveTab: {},
  SucceededFetchCards: {
    visit: Schema.Number,
    column: ColumnName,
    cards: Schema.Array(Card),
  },
  FailedFetchCards: {
    visit: Schema.Number,
    column: ColumnName,
    error: Schema.String,
  },
  ClickedRetryFetchCards: { column: ColumnName },
  ClickedMoveCard: { id: Schema.Number, direction: Direction },
  SucceededMoveCard: { visit: Schema.Number },
  FailedMoveCard: {
    visit: Schema.Number,
    id: Schema.Number,
    fromColumn: ColumnName,
    fromIndex: Schema.Number,
    error: Schema.String,
  },
  UpdatedNewCardTitle: { value: Schema.String },
  ClickedAddCard: {},
  SucceededAddCard: {
    visit: Schema.Number,
    key: Schema.Number,
    card: Card,
  },
  FailedAddCard: {
    visit: Schema.Number,
    key: Schema.Number,
    error: Schema.String,
  },
  ClickedSelectCard: { id: Schema.Number },
  UpdatedRenameInput: { value: Schema.String },
  ClickedRenameCard: {},
  SucceededRenameCard: { visit: Schema.Number },
  FailedRenameCard: {
    visit: Schema.Number,
    id: Schema.Number,
    previousTitle: Schema.String,
    error: Schema.String,
  },
  ClickedArchiveCard: {},
  SucceededArchiveCard: { visit: Schema.Number },
  FailedArchiveCard: {
    visit: Schema.Number,
    card: Card,
    column: ColumnName,
    index: Schema.Number,
    error: Schema.String,
  },
  SucceededFetchChecklist: {
    visit: Schema.Number,
    cardId: Schema.Number,
    items: Schema.Array(Item),
  },
  FailedFetchChecklist: {
    visit: Schema.Number,
    cardId: Schema.Number,
    error: Schema.String,
  },
  ClickedToggleItem: { itemId: Schema.Number },
  SucceededToggleItem: { visit: Schema.Number },
  FailedToggleItem: {
    visit: Schema.Number,
    cardId: Schema.Number,
    itemId: Schema.Number,
    done: Schema.Boolean,
    error: Schema.String,
  },
  UpdatedItemInput: { value: Schema.String },
  ClickedAddItem: {},
  SucceededAddItem: {
    visit: Schema.Number,
    cardId: Schema.Number,
    key: Schema.Number,
    item: Item,
  },
  FailedAddItem: {
    visit: Schema.Number,
    cardId: Schema.Number,
    key: Schema.Number,
    error: Schema.String,
  },
  SucceededFetchArchived: {
    visit: Schema.Number,
    archived: Schema.Array(Archived),
  },
  FailedFetchArchived: { visit: Schema.Number, error: Schema.String },
  ClickedRestoreCard: { id: Schema.Number },
  SucceededRestoreCard: { visit: Schema.Number },
  FailedRestoreCard: {
    visit: Schema.Number,
    archived: Archived,
    index: Schema.Number,
    error: Schema.String,
  },
})
export type Message = typeof Message.Type
