import { Option, Schema } from 'effect'
import { defineTaggedUnion } from 'foldkit/schema'

// MODEL

export const ColumnId = Schema.Literals(['todo', 'doing', 'done'])
export type ColumnId = typeof ColumnId.Type

export const Direction = Schema.Literals(['left', 'right', 'up', 'down'])
export type Direction = typeof Direction.Type

export const SavedCard = Schema.Struct({
  id: Schema.Number,
  title: Schema.String,
  done: Schema.Number,
  total: Schema.Number,
})
export type SavedCard = typeof SavedCard.Type

export const BoardCard = defineTaggedUnion({
  Saved: SavedCard.fields,
  Adding: { localId: Schema.Number, title: Schema.String },
})
export type BoardCard = typeof BoardCard.Type

export const SavedItem = Schema.Struct({
  id: Schema.Number,
  text: Schema.String,
  done: Schema.Boolean,
})
export type SavedItem = typeof SavedItem.Type

export const ChecklistItem = defineTaggedUnion({
  Saved: SavedItem.fields,
  Adding: { localId: Schema.Number, text: Schema.String },
})
export type ChecklistItem = typeof ChecklistItem.Type

export const ArchivedCard = Schema.Struct({
  id: Schema.Number,
  title: Schema.String,
})
export type ArchivedCard = typeof ArchivedCard.Type

export const Checklist = defineTaggedUnion({
  Loading: {},
  Failed: { error: Schema.String },
  Loaded: { items: Schema.Array(ChecklistItem) },
})
export type Checklist = typeof Checklist.Type

export const ColumnLoad = defineTaggedUnion({
  Loading: {},
  Failed: { error: Schema.String },
  Loaded: {},
})
export type ColumnLoad = typeof ColumnLoad.Type

export const Column = Schema.Struct({
  load: ColumnLoad,
  cards: Schema.Array(BoardCard),
})
export type Column = typeof Column.Type

export const Selection = defineTaggedUnion({
  NoSelection: {},
  Selected: {
    cardId: Schema.Number,
    checklist: Checklist,
    titleInput: Schema.String,
    itemInput: Schema.String,
    maybeRenameError: Schema.Option(Schema.String),
    maybeItemError: Schema.Option(Schema.String),
  },
})
export type Selection = typeof Selection.Type
export type Selected = Extract<Selection, { readonly _tag: 'Selected' }>

export const Board = Schema.Struct({
  todo: Column,
  doing: Column,
  done: Column,
  newCardTitle: Schema.String,
  nextLocalId: Schema.Number,
  selection: Selection,
  maybeMoveError: Schema.Option(Schema.String),
  maybeAddError: Schema.Option(Schema.String),
  maybeArchiveError: Schema.Option(Schema.String),
})
export type Board = typeof Board.Type

export const ArchiveLoad = defineTaggedUnion({
  Loading: {},
  Failed: { error: Schema.String },
  Loaded: { cards: Schema.Array(ArchivedCard) },
})
export type ArchiveLoad = typeof ArchiveLoad.Type

export const Archive = Schema.Struct({
  load: ArchiveLoad,
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
  session: Schema.Number,
})
export type Model = typeof Model.Type

// INITIAL

export const initialBoard: Board = {
  todo: { load: ColumnLoad.Loading(), cards: [] },
  doing: { load: ColumnLoad.Loading(), cards: [] },
  done: { load: ColumnLoad.Loading(), cards: [] },
  newCardTitle: '',
  nextLocalId: 0,
  selection: Selection.NoSelection(),
  maybeMoveError: Option.none(),
  maybeAddError: Option.none(),
  maybeArchiveError: Option.none(),
}

export const initialArchive: Archive = {
  load: ArchiveLoad.Loading(),
  maybeRestoreError: Option.none(),
}
