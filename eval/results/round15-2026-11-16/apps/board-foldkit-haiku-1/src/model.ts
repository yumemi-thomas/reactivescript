import { Schema } from 'effect'
import { AsyncData } from 'foldkit'
import { defineTaggedUnion } from 'foldkit/schema'

// MODEL

export const ColumnName = Schema.Literals(['todo', 'doing', 'done'])
export type ColumnName = typeof ColumnName.Type

export const Direction = Schema.Literals(['left', 'right', 'up', 'down'])
export type Direction = typeof Direction.Type

export const Card = Schema.Struct({
  id: Schema.Number,
  title: Schema.String,
  done: Schema.Number,
  total: Schema.Number,
})
export type Card = typeof Card.Type

export const BoardCard = defineTaggedUnion({
  Saved: Card.fields,
  Adding: { key: Schema.Number, title: Schema.String },
})
export type BoardCard = typeof BoardCard.Type

export const CardsState = AsyncData.Schema(
  Schema.Array(BoardCard),
  Schema.String,
)

export const Item = Schema.Struct({
  id: Schema.Number,
  text: Schema.String,
  done: Schema.Boolean,
})
export type Item = typeof Item.Type

export const ChecklistItem = defineTaggedUnion({
  Saved: Item.fields,
  Adding: { key: Schema.Number, text: Schema.String },
})
export type ChecklistItem = typeof ChecklistItem.Type

export const ChecklistState = AsyncData.Schema(
  Schema.Array(ChecklistItem),
  Schema.String,
)

export const Archived = Schema.Struct({
  id: Schema.Number,
  title: Schema.String,
})
export type Archived = typeof Archived.Type

export const ArchivedState = AsyncData.Schema(
  Schema.Array(Archived),
  Schema.String,
)

export const Selection = Schema.Struct({
  cardId: Schema.Number,
  titleInput: Schema.String,
  itemInput: Schema.String,
  checklist: ChecklistState.schema,
  maybeRenameError: Schema.Option(Schema.String),
  maybeItemError: Schema.Option(Schema.String),
})
export type Selection = typeof Selection.Type

export const Column = Schema.Struct({
  name: ColumnName,
  cards: CardsState.schema,
})
export type Column = typeof Column.Type

export const BoardPage = Schema.Struct({
  columns: Schema.Array(Column),
  maybeSelection: Schema.Option(Selection),
  newCardTitle: Schema.String,
  nextKey: Schema.Number,
  maybeMoveError: Schema.Option(Schema.String),
  maybeAddError: Schema.Option(Schema.String),
  maybeArchiveError: Schema.Option(Schema.String),
})
export type BoardPage = typeof BoardPage.Type

export const ArchivePage = Schema.Struct({
  archived: ArchivedState.schema,
  maybeRestoreError: Schema.Option(Schema.String),
})
export type ArchivePage = typeof ArchivePage.Type

export const Page = defineTaggedUnion({
  Board: { board: BoardPage },
  Archive: { archive: ArchivePage },
})
export type Page = typeof Page.Type

export const Model = Schema.Struct({
  visit: Schema.Number,
  page: Page,
})
export type Model = typeof Model.Type
