import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'

import { Card, ColumnId, Item } from './model'

export const Direction = Schema.Literals(['left', 'right', 'up', 'down'])
export type Direction = typeof Direction.Type

export const Message = defineMessageUnion({
  ClickedRetryColumn: { column: ColumnId },
  SucceededFetchCards: { column: ColumnId, cards: Schema.Array(Card) },
  FailedFetchCards: { column: ColumnId, error: Schema.String },
  ClickedMove: { cardId: Schema.Number, direction: Direction },
  SucceededMoveCard: { opId: Schema.Number },
  FailedMoveCard: { opId: Schema.Number, error: Schema.String },
  UpdatedNewCardInput: { value: Schema.String },
  ClickedAddCard: {},
  SucceededAddCard: { opId: Schema.Number, id: Schema.Number, title: Schema.String },
  FailedAddCard: { opId: Schema.Number, error: Schema.String },
  ClickedCard: { cardId: Schema.Number },
  UpdatedTitleInput: { value: Schema.String },
  ClickedRename: {},
  SucceededRenameCard: { opId: Schema.Number, title: Schema.String },
  FailedRenameCard: { opId: Schema.Number, selectionId: Schema.Number, error: Schema.String },
  ClickedArchive: {},
  SucceededArchiveCard: { opId: Schema.Number },
  FailedArchiveCard: { opId: Schema.Number, error: Schema.String },
  SucceededFetchChecklist: { selectionId: Schema.Number, items: Schema.Array(Item) },
  FailedFetchChecklist: { selectionId: Schema.Number, error: Schema.String },
  ClickedToggleItem: { itemId: Schema.Number },
  SucceededToggleItem: { opId: Schema.Number },
  FailedToggleItem: { opId: Schema.Number, error: Schema.String },
  UpdatedItemInput: { value: Schema.String },
  ClickedAddItem: {},
  SucceededAddItem: { opId: Schema.Number, item: Item },
  FailedAddItem: { opId: Schema.Number, error: Schema.String },
})
export type Message = typeof Message.Type
