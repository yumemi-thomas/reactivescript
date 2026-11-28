import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'

import { Archived, Card, Column, Direction, Item } from './model'

// MESSAGE

export const Message = defineMessageUnion({
  ClickedBoardTab: {},
  ClickedArchiveTab: {},

  SucceededFetchCards: {
    session: Schema.Number,
    column: Column,
    cards: Schema.Array(Card),
  },
  FailedFetchCards: {
    session: Schema.Number,
    column: Column,
    error: Schema.String,
  },
  ClickedRetryColumn: { column: Column },

  ClickedMoveCard: { id: Schema.Number, direction: Direction },
  SucceededMoveCard: { session: Schema.Number },
  FailedMoveCard: {
    session: Schema.Number,
    id: Schema.Number,
    fromColumn: Column,
    fromIndex: Schema.Number,
    error: Schema.String,
  },

  UpdatedNewCardTitle: { value: Schema.String },
  ClickedAddCard: {},
  SucceededAddCard: {
    session: Schema.Number,
    key: Schema.Number,
    card: Card,
  },
  FailedAddCard: {
    session: Schema.Number,
    key: Schema.Number,
    error: Schema.String,
  },

  ClickedCard: { id: Schema.Number },
  UpdatedTitleInput: { value: Schema.String },
  ClickedRename: {},
  SucceededRenameCard: { session: Schema.Number },
  FailedRenameCard: {
    session: Schema.Number,
    id: Schema.Number,
    previousTitle: Schema.String,
    error: Schema.String,
  },
  ClickedArchive: {},
  SucceededArchiveCard: { session: Schema.Number },
  FailedArchiveCard: {
    session: Schema.Number,
    card: Card,
    column: Column,
    index: Schema.Number,
    error: Schema.String,
  },

  SucceededFetchChecklist: {
    session: Schema.Number,
    cardId: Schema.Number,
    items: Schema.Array(Item),
  },
  FailedFetchChecklist: {
    session: Schema.Number,
    cardId: Schema.Number,
    error: Schema.String,
  },
  ClickedToggleItem: { itemId: Schema.Number },
  SucceededToggleItem: { session: Schema.Number },
  FailedToggleItem: {
    session: Schema.Number,
    cardId: Schema.Number,
    itemId: Schema.Number,
    previousDone: Schema.Boolean,
    error: Schema.String,
  },
  UpdatedItemInput: { value: Schema.String },
  ClickedAddItem: {},
  SucceededAddItem: {
    session: Schema.Number,
    cardId: Schema.Number,
    key: Schema.Number,
    item: Item,
  },
  FailedAddItem: {
    session: Schema.Number,
    cardId: Schema.Number,
    key: Schema.Number,
    error: Schema.String,
  },

  SucceededFetchArchived: {
    session: Schema.Number,
    cards: Schema.Array(Archived),
  },
  FailedFetchArchived: { session: Schema.Number, error: Schema.String },
  ClickedRestore: { id: Schema.Number },
  SucceededRestoreCard: { session: Schema.Number },
  FailedRestoreCard: {
    session: Schema.Number,
    archived: Archived,
    index: Schema.Number,
    error: Schema.String,
  },
})
export type Message = typeof Message.Type
