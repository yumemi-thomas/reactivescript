import { Schema } from 'effect'
import { AsyncData } from 'foldkit'
import { defineTaggedUnion } from 'foldkit/schema'

export const Column = Schema.Literals(['todo', 'doing', 'done'])
export type Column = typeof Column.Type

export const Direction = Schema.Literals(['Left', 'Right', 'Up', 'Down'])
export type Direction = typeof Direction.Type

export const columnsInOrder: ReadonlyArray<Column> = ['todo', 'doing', 'done']

export const columnLabels: Record<Column, string> = {
  todo: 'To do',
  doing: 'Doing',
  done: 'Done',
}

export const Card = Schema.Struct({
  localId: Schema.Number,
  maybeId: Schema.Option(Schema.Number),
  title: Schema.String,
  done: Schema.Number,
  total: Schema.Number,
})
export type Card = typeof Card.Type

export const Item = Schema.Struct({
  localId: Schema.Number,
  maybeId: Schema.Option(Schema.Number),
  text: Schema.String,
  done: Schema.Boolean,
})
export type Item = typeof Item.Type

export const Archived = Schema.Struct({
  id: Schema.Number,
  title: Schema.String,
})
export type Archived = typeof Archived.Type

export const CardsData = AsyncData.Schema(Schema.Array(Card), Schema.String)
export const ChecklistData = AsyncData.Schema(Schema.Array(Item), Schema.String)
export const ArchiveData = AsyncData.Schema(Schema.Array(Archived), Schema.String)

export type CardsState = AsyncData.AsyncData<ReadonlyArray<Card>, string>
export type ChecklistState = AsyncData.AsyncData<ReadonlyArray<Item>, string>
export type ArchiveState = AsyncData.AsyncData<ReadonlyArray<Archived>, string>

const BoardFields = {
  columns: Schema.Struct({
    todo: CardsData.schema,
    doing: CardsData.schema,
    done: CardsData.schema,
  }),
  selection: Schema.Option(Schema.Number),
  checklist: ChecklistData.schema,
  newCardTitle: Schema.String,
  renameTitle: Schema.String,
  newItemText: Schema.String,
  moveError: Schema.Option(Schema.String),
  addError: Schema.Option(Schema.String),
  renameError: Schema.Option(Schema.String),
  itemError: Schema.Option(Schema.String),
  archiveError: Schema.Option(Schema.String),
}
export const BoardPage = Schema.Struct(BoardFields)
export type BoardPage = typeof BoardPage.Type

const ArchiveFields = {
  list: ArchiveData.schema,
  restoreError: Schema.Option(Schema.String),
}
export const ArchivePage = Schema.Struct(ArchiveFields)
export type ArchivePage = typeof ArchivePage.Type

export const Page = defineTaggedUnion({
  Board: BoardFields,
  Archive: ArchiveFields,
})
export type Page = typeof Page.Type

export const Model = Schema.Struct({
  visit: Schema.Number,
  nextLocalId: Schema.Number,
  page: Page,
})
export type Model = typeof Model.Type
