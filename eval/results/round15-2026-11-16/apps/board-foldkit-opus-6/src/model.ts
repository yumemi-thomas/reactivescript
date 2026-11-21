import { Schema } from 'effect'
import { defineTaggedUnion } from 'foldkit/schema'

import {
  ArchivedCard,
  BoardOperation,
  ChecklistState,
  Columns,
  ItemBaseline,
} from './domain'

// BOARD

export const Selection = defineTaggedUnion({
  NotSelected: {},
  Selected: {
    cardId: Schema.Number,
    selection: Schema.Number,
    checklist: ChecklistState,
    titleInput: Schema.String,
    itemInput: Schema.String,
    maybeRenameError: Schema.Option(Schema.String),
    maybeItemError: Schema.Option(Schema.String),
  },
})
export type Selection = typeof Selection.Type

export const BoardModel = Schema.Struct({
  session: Schema.Number,
  columns: Columns,
  operations: Schema.Array(BoardOperation),
  baselines: Schema.Array(ItemBaseline),
  nextOperationId: Schema.Number,
  nextSelection: Schema.Number,
  newCardTitle: Schema.String,
  selection: Selection,
  maybeMoveError: Schema.Option(Schema.String),
  maybeAddError: Schema.Option(Schema.String),
  maybeArchiveError: Schema.Option(Schema.String),
})
export type BoardModel = typeof BoardModel.Type

// ARCHIVE

export const ArchiveList = defineTaggedUnion({
  Loading: {},
  Failed: { error: Schema.String },
  Loaded: { cards: Schema.Array(ArchivedCard) },
})
export type ArchiveList = typeof ArchiveList.Type

export const PendingRestore = Schema.Struct({
  operationId: Schema.Number,
  cardId: Schema.Number,
})
export type PendingRestore = typeof PendingRestore.Type

export const ArchiveModel = Schema.Struct({
  session: Schema.Number,
  list: ArchiveList,
  pendingRestores: Schema.Array(PendingRestore),
  nextOperationId: Schema.Number,
  maybeRestoreError: Schema.Option(Schema.String),
})
export type ArchiveModel = typeof ArchiveModel.Type

// APP

export const Page = defineTaggedUnion({
  BoardPage: { board: BoardModel },
  ArchivePage: { archive: ArchiveModel },
})
export type Page = typeof Page.Type

export const Model = Schema.Struct({
  nextSession: Schema.Number,
  page: Page,
})
export type Model = typeof Model.Type
