import { Schema } from 'effect'
import { defineTaggedUnion } from 'foldkit/schema'

// MODEL

export const Column = Schema.Literals(['todo', 'doing', 'done'])
export type Column = typeof Column.Type

export const Direction = Schema.Literals(['left', 'right', 'up', 'down'])
export type Direction = typeof Direction.Type

export const Card = Schema.Struct({
  id: Schema.Number,
  title: Schema.String,
  done: Schema.Number,
  total: Schema.Number,
})
export type Card = typeof Card.Type

export const Archived = Schema.Struct({
  id: Schema.Number,
  title: Schema.String,
})
export type Archived = typeof Archived.Type

export const Item = Schema.Struct({
  id: Schema.Number,
  text: Schema.String,
  done: Schema.Boolean,
})
export type Item = typeof Item.Type

export const BoardCard = defineTaggedUnion({
  Saved: {
    id: Schema.Number,
    title: Schema.String,
    done: Schema.Number,
    total: Schema.Number,
  },
  Adding: { key: Schema.Number, title: Schema.String },
})
export type BoardCard = typeof BoardCard.Type

export const ColumnLoad = defineTaggedUnion({
  Loading: {},
  Loaded: { cards: Schema.Array(BoardCard) },
  Failed: { error: Schema.String },
})
export type ColumnLoad = typeof ColumnLoad.Type

export const Loads = Schema.Struct({
  todo: ColumnLoad,
  doing: ColumnLoad,
  done: ColumnLoad,
})
export type Loads = typeof Loads.Type

export const ChecklistItem = defineTaggedUnion({
  Saved: {
    id: Schema.Number,
    text: Schema.String,
    done: Schema.Boolean,
  },
  Adding: { key: Schema.Number, text: Schema.String },
})
export type ChecklistItem = typeof ChecklistItem.Type

export const ChecklistLoad = defineTaggedUnion({
  Idle: {},
  Loading: {},
  Loaded: { items: Schema.Array(ChecklistItem) },
  Failed: { error: Schema.String },
})
export type ChecklistLoad = typeof ChecklistLoad.Type

export const ArchivedLoad = defineTaggedUnion({
  Loading: {},
  Loaded: { cards: Schema.Array(Archived) },
  Failed: { error: Schema.String },
})
export type ArchivedLoad = typeof ArchivedLoad.Type

export const BoardPage = Schema.Struct({
  columns: Loads,
  maybeSelectedId: Schema.Option(Schema.Number),
  checklist: ChecklistLoad,
  newCardTitle: Schema.String,
  titleInput: Schema.String,
  itemInput: Schema.String,
  maybeMoveError: Schema.Option(Schema.String),
  maybeAddError: Schema.Option(Schema.String),
  maybeArchiveError: Schema.Option(Schema.String),
  maybeRenameError: Schema.Option(Schema.String),
  maybeItemError: Schema.Option(Schema.String),
})
export type BoardPage = typeof BoardPage.Type

export const ArchivePage = Schema.Struct({
  archived: ArchivedLoad,
  maybeRestoreError: Schema.Option(Schema.String),
})
export type ArchivePage = typeof ArchivePage.Type

export const Page = defineTaggedUnion({
  Board: { board: BoardPage },
  Archive: { archive: ArchivePage },
})
export type Page = typeof Page.Type

export const Model = Schema.Struct({
  session: Schema.Number,
  nextKey: Schema.Number,
  page: Page,
})
export type Model = typeof Model.Type
