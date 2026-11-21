import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'

import { Archived, Card, Column, Direction } from './model'

const ServerCard = Schema.Struct({
  id: Schema.Number,
  title: Schema.String,
  done: Schema.Number,
  total: Schema.Number,
})

const ServerItem = Schema.Struct({
  id: Schema.Number,
  text: Schema.String,
  done: Schema.Boolean,
})

export const Message = defineMessageUnion({
  ClickedBoardTab: {},
  ClickedArchiveTab: {},
  SucceededFetchCards: {
    visit: Schema.Number,
    column: Column,
    cards: Schema.Array(ServerCard),
  },
  FailedFetchCards: { visit: Schema.Number, column: Column, error: Schema.String },
  ClickedRetryColumn: { column: Column },
  ClickedMoveCard: { localId: Schema.Number, direction: Direction },
  SucceededMoveCard: { visit: Schema.Number },
  FailedMoveCard: {
    visit: Schema.Number,
    localId: Schema.Number,
    fromColumn: Column,
    fromIndex: Schema.Number,
    error: Schema.String,
  },
  ClickedCard: { localId: Schema.Number },
  ChangedNewCardTitle: { value: Schema.String },
  SubmittedNewCard: {},
  SucceededAddCard: { visit: Schema.Number, localId: Schema.Number, id: Schema.Number },
  FailedAddCard: { visit: Schema.Number, localId: Schema.Number, error: Schema.String },
  ChangedRenameTitle: { value: Schema.String },
  SubmittedRename: {},
  SucceededRenameCard: { visit: Schema.Number },
  FailedRenameCard: {
    visit: Schema.Number,
    localId: Schema.Number,
    previousTitle: Schema.String,
    error: Schema.String,
  },
  ClickedArchiveCard: {},
  SucceededArchiveCard: { visit: Schema.Number },
  FailedArchiveCard: {
    visit: Schema.Number,
    card: Card,
    column: Column,
    index: Schema.Number,
    error: Schema.String,
  },
  SucceededFetchChecklist: {
    visit: Schema.Number,
    cardId: Schema.Number,
    items: Schema.Array(ServerItem),
  },
  FailedFetchChecklist: { visit: Schema.Number, cardId: Schema.Number, error: Schema.String },
  ClickedToggleItem: { localId: Schema.Number },
  SucceededToggleItem: { visit: Schema.Number },
  FailedToggleItem: {
    visit: Schema.Number,
    cardId: Schema.Number,
    itemLocalId: Schema.Number,
    done: Schema.Boolean,
    error: Schema.String,
  },
  ChangedNewItemText: { value: Schema.String },
  SubmittedNewItem: {},
  SucceededAddItem: {
    visit: Schema.Number,
    cardId: Schema.Number,
    itemLocalId: Schema.Number,
    id: Schema.Number,
  },
  FailedAddItem: {
    visit: Schema.Number,
    cardId: Schema.Number,
    itemLocalId: Schema.Number,
    error: Schema.String,
  },
  SucceededFetchArchived: { visit: Schema.Number, items: Schema.Array(Archived) },
  FailedFetchArchived: { visit: Schema.Number, error: Schema.String },
  ClickedRestore: { id: Schema.Number },
  SucceededRestoreCard: { visit: Schema.Number },
  FailedRestoreCard: {
    visit: Schema.Number,
    item: Archived,
    index: Schema.Number,
    error: Schema.String,
  },
})
export type Message = typeof Message.Type
