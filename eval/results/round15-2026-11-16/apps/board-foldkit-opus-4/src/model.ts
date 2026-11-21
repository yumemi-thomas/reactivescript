import { Schema } from 'effect'
import { defineTaggedUnion } from 'foldkit/schema'

import { ArchivedCard, Card, Item, PendingEntry } from './domain'

// BOARD

export const ColumnState = defineTaggedUnion({
  ColumnLoading: { requestId: Schema.Number },
  ColumnFailed: { error: Schema.String },
  ColumnLoaded: { cards: Schema.Array(Card) },
})
export type ColumnState = typeof ColumnState.Type

export const ColumnStates = Schema.Struct({
  todo: ColumnState,
  doing: ColumnState,
  done: ColumnState,
})
export type ColumnStates = typeof ColumnStates.Type

export const ChecklistState = defineTaggedUnion({
  ChecklistLoading: { requestId: Schema.Number },
  ChecklistFailed: { error: Schema.String },
  ChecklistLoaded: { items: Schema.Array(Item) },
})
export type ChecklistState = typeof ChecklistState.Type

export const Detail = defineTaggedUnion({
  NothingSelected: {},
  CardSelected: {
    cardId: Schema.Number,
    titleInput: Schema.String,
    itemInput: Schema.String,
    checklist: ChecklistState,
    maybeRenameError: Schema.Option(Schema.String),
    maybeItemError: Schema.Option(Schema.String),
  },
})
export type Detail = typeof Detail.Type

export const Board = Schema.Struct({
  columns: ColumnStates,
  pending: Schema.Array(PendingEntry),
  newCardInput: Schema.String,
  maybeMoveError: Schema.Option(Schema.String),
  maybeAddError: Schema.Option(Schema.String),
  maybeArchiveError: Schema.Option(Schema.String),
  detail: Detail,
})
export type Board = typeof Board.Type

// ARCHIVE

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

// PAGE

export const Page = defineTaggedUnion({
  BoardPage: { board: Board },
  ArchivePage: { archive: Archive },
})
export type Page = typeof Page.Type

export const Model = Schema.Struct({
  page: Page,
  nextId: Schema.Number,
})
export type Model = typeof Model.Type
