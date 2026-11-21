import { Option, Schema } from 'effect'
import { defineTaggedUnion } from 'foldkit/schema'

import { ArchivedCard, Columns, Item, PendingOp } from './domain'

// CHECKLIST

export const ChecklistState = defineTaggedUnion({
  ChecklistLoading: { requestId: Schema.Number },
  ChecklistFailed: { error: Schema.String },
  ChecklistLoaded: { items: Schema.Array(Item) },
})
export type ChecklistState = typeof ChecklistState.Type

export const Selection = defineTaggedUnion({
  NoCardSelected: {},
  CardSelected: {
    cardId: Schema.Number,
    titleInput: Schema.String,
    itemInput: Schema.String,
    checklist: ChecklistState,
    maybeRenameError: Schema.Option(Schema.String),
    maybeItemError: Schema.Option(Schema.String),
  },
})
export type Selection = typeof Selection.Type

// BOARD PAGE

export const Board = Schema.Struct({
  columns: Columns,
  pending: Schema.Array(PendingOp),
  newCardInput: Schema.String,
  maybeMoveError: Schema.Option(Schema.String),
  maybeAddError: Schema.Option(Schema.String),
  maybeArchiveError: Schema.Option(Schema.String),
  selection: Selection,
})
export type Board = typeof Board.Type

// ARCHIVE PAGE

export const ArchiveList = defineTaggedUnion({
  ArchiveLoading: { requestId: Schema.Number },
  ArchiveFailed: { error: Schema.String },
  ArchiveLoaded: { cards: Schema.Array(ArchivedCard) },
})
export type ArchiveList = typeof ArchiveList.Type

export const PendingRestore = Schema.Struct({
  opId: Schema.Number,
  cardId: Schema.Number,
})
export type PendingRestore = typeof PendingRestore.Type

export const Archive = Schema.Struct({
  list: ArchiveList,
  pendingRestores: Schema.Array(PendingRestore),
  maybeRestoreError: Schema.Option(Schema.String),
})
export type Archive = typeof Archive.Type

// MODEL

export const Page = defineTaggedUnion({
  BoardPage: { board: Board },
  ArchivePage: { archive: Archive },
})
export type Page = typeof Page.Type

export const Model = Schema.Struct({
  nextId: Schema.Number,
  page: Page,
})
export type Model = typeof Model.Type

export const noError = Option.none<string>()
