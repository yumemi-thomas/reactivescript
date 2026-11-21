import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'

import { ArchivedCard, Card, Column, Item } from './domain'

export const Tab = Schema.Literals(['board', 'archive'])
export type Tab = typeof Tab.Type

export const Direction = Schema.Literals(['left', 'right', 'up', 'down'])
export type Direction = typeof Direction.Type

const Session = Schema.Number
const OperationId = Schema.Number

export const Message = defineMessageUnion({
  ClickedTab: { tab: Tab },

  ClickedRetryColumn: { column: Column },
  SucceededFetchCards: { session: Session, column: Column, cards: Schema.Array(Card) },
  FailedFetchCards: { session: Session, column: Column, error: Schema.String },

  ClickedMove: { cardId: Schema.Number, direction: Direction },
  SucceededMoveCard: { session: Session, operationId: OperationId },
  FailedMoveCard: { session: Session, operationId: OperationId, error: Schema.String },

  UpdatedNewCardTitle: { value: Schema.String },
  SubmittedNewCard: {},
  SucceededAddCard: { session: Session, operationId: OperationId, id: Schema.Number, title: Schema.String },
  FailedAddCard: { session: Session, operationId: OperationId, error: Schema.String },

  ClickedCard: { cardId: Schema.Number },

  UpdatedTitleInput: { value: Schema.String },
  SubmittedRename: {},
  SucceededRenameCard: { session: Session, operationId: OperationId, title: Schema.String },
  FailedRenameCard: { session: Session, operationId: OperationId, error: Schema.String },

  ClickedArchive: {},
  SucceededArchiveCard: { session: Session, operationId: OperationId },
  FailedArchiveCard: { session: Session, operationId: OperationId, error: Schema.String },

  ClickedRetryChecklist: {},
  SucceededFetchChecklist: { session: Session, selection: Schema.Number, items: Schema.Array(Item) },
  FailedFetchChecklist: { session: Session, selection: Schema.Number, error: Schema.String },

  ClickedToggle: { itemId: Schema.Number },
  SucceededToggleItem: { session: Session, operationId: OperationId },
  FailedToggleItem: { session: Session, operationId: OperationId, error: Schema.String },

  UpdatedItemInput: { value: Schema.String },
  SubmittedNewItem: {},
  SucceededAddItem: { session: Session, operationId: OperationId, item: Item },
  FailedAddItem: { session: Session, operationId: OperationId, error: Schema.String },

  ClickedRetryArchive: {},
  SucceededFetchArchived: { session: Session, cards: Schema.Array(ArchivedCard) },
  FailedFetchArchived: { session: Session, error: Schema.String },

  ClickedRestore: { cardId: Schema.Number },
  SucceededRestoreCard: { session: Session, operationId: OperationId },
  FailedRestoreCard: { session: Session, operationId: OperationId, error: Schema.String },
})
export type Message = typeof Message.Type
