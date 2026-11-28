import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'

import {
  ArchivedCard,
  BoardCard,
  ColumnId,
  Direction,
  SavedCard,
  SavedItem,
} from './model'

// MESSAGE

export const Message = defineMessageUnion({
  ClickedBoardTab: {},
  ClickedArchiveTab: {},
  SucceededFetchCards: {
    session: Schema.Number,
    column: ColumnId,
    cards: Schema.Array(SavedCard),
  },
  FailedFetchCards: {
    session: Schema.Number,
    column: ColumnId,
    error: Schema.String,
  },
  ClickedRetryColumn: { column: ColumnId },
  ClickedMove: { cardId: Schema.Number, direction: Direction },
  SucceededMoveCard: { session: Schema.Number, cardId: Schema.Number },
  FailedMoveCard: {
    session: Schema.Number,
    cardId: Schema.Number,
    fromColumn: ColumnId,
    fromIndex: Schema.Number,
    error: Schema.String,
  },
  ChangedNewCardTitle: { value: Schema.String },
  SubmittedNewCard: {},
  SucceededAddCard: {
    session: Schema.Number,
    localId: Schema.Number,
    cardId: Schema.Number,
  },
  FailedAddCard: {
    session: Schema.Number,
    localId: Schema.Number,
    error: Schema.String,
  },
  ClickedCard: { cardId: Schema.Number },
  SucceededFetchChecklist: {
    session: Schema.Number,
    cardId: Schema.Number,
    items: Schema.Array(SavedItem),
  },
  FailedFetchChecklist: {
    session: Schema.Number,
    cardId: Schema.Number,
    error: Schema.String,
  },
  ChangedTitleInput: { value: Schema.String },
  ClickedRename: {},
  SucceededRenameCard: { session: Schema.Number, cardId: Schema.Number },
  FailedRenameCard: {
    session: Schema.Number,
    cardId: Schema.Number,
    previousTitle: Schema.String,
    error: Schema.String,
  },
  ClickedArchive: {},
  SucceededArchiveCard: { session: Schema.Number, cardId: Schema.Number },
  FailedArchiveCard: {
    session: Schema.Number,
    cardId: Schema.Number,
    column: ColumnId,
    index: Schema.Number,
    card: BoardCard,
    error: Schema.String,
  },
  ClickedToggleItem: { itemId: Schema.Number },
  SucceededToggleItem: {
    session: Schema.Number,
    cardId: Schema.Number,
    itemId: Schema.Number,
  },
  FailedToggleItem: {
    session: Schema.Number,
    cardId: Schema.Number,
    itemId: Schema.Number,
    done: Schema.Boolean,
    error: Schema.String,
  },
  ChangedItemInput: { value: Schema.String },
  SubmittedItem: {},
  SucceededAddItem: {
    session: Schema.Number,
    cardId: Schema.Number,
    localId: Schema.Number,
    itemId: Schema.Number,
  },
  FailedAddItem: {
    session: Schema.Number,
    cardId: Schema.Number,
    localId: Schema.Number,
    error: Schema.String,
  },
  SucceededFetchArchived: {
    session: Schema.Number,
    cards: Schema.Array(ArchivedCard),
  },
  FailedFetchArchived: { session: Schema.Number, error: Schema.String },
  ClickedRestore: { cardId: Schema.Number },
  SucceededRestoreCard: { session: Schema.Number, cardId: Schema.Number },
  FailedRestoreCard: {
    session: Schema.Number,
    cardId: Schema.Number,
    index: Schema.Number,
    archived: ArchivedCard,
    error: Schema.String,
  },
})
export type Message = typeof Message.Type
