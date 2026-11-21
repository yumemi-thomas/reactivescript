import { Schema } from 'effect'
import { defineTaggedUnion } from 'foldkit/schema'

import {
  ArchiveLoad,
  BoardOperation,
  Columns,
  KnownChecklist,
  RestoreOperation,
} from './domain'

// MODEL

export const ChecklistLoad = defineTaggedUnion({
  ChecklistLoading: { requestId: Schema.Number },
  ChecklistFailed: { error: Schema.String },
  ChecklistLoaded: {},
})
export type ChecklistLoad = typeof ChecklistLoad.Type

export const SelectedCard = Schema.Struct({
  cardId: Schema.Number,
  titleInput: Schema.String,
  itemInput: Schema.String,
  checklist: ChecklistLoad,
  maybeRenameError: Schema.Option(Schema.String),
  maybeItemError: Schema.Option(Schema.String),
})
export type SelectedCard = typeof SelectedCard.Type

export const Board = Schema.Struct({
  columns: Columns,
  operations: Schema.Array(BoardOperation),
  checklists: Schema.Array(KnownChecklist),
  newCardInput: Schema.String,
  maybeSelected: Schema.Option(SelectedCard),
  maybeMoveError: Schema.Option(Schema.String),
  maybeAddError: Schema.Option(Schema.String),
  maybeArchiveError: Schema.Option(Schema.String),
})
export type Board = typeof Board.Type

export const Archive = Schema.Struct({
  list: ArchiveLoad,
  restores: Schema.Array(RestoreOperation),
  maybeRestoreError: Schema.Option(Schema.String),
})
export type Archive = typeof Archive.Type

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
