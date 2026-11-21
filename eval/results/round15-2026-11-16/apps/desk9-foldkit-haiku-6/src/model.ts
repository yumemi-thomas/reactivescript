import { Schema } from 'effect'
import { defineTaggedUnion } from 'foldkit/schema'

import {
  Filter,
  Hit,
  IssueDetail,
  Item,
  Settings,
} from './domain.js'

// MODEL

export const Row = Schema.Struct({
  id: Schema.Number,
  title: Schema.String,
  assignee: Schema.Option(Schema.String),
  status: Schema.Literals(['Shown', 'Closing']),
})
export type Row = typeof Row.Type

export const ListState = defineTaggedUnion({
  Loading: {},
  Loaded: { rows: Schema.Array(Row) },
  Failed: { error: Schema.String },
})
export type ListState = typeof ListState.Type

export const DetailState = defineTaggedUnion({
  Loading: {},
  Found: { issue: IssueDetail },
  NotFound: {},
  Failed: { error: Schema.String },
})
export type DetailState = typeof DetailState.Type

export const CommentItem = defineTaggedUnion({
  Posted: { key: Schema.Number, author: Schema.String, text: Schema.String },
  Sending: { key: Schema.Number, author: Schema.String, text: Schema.String },
})
export type CommentItem = typeof CommentItem.Type

export const CommentsState = defineTaggedUnion({
  Loading: {},
  Loaded: { comments: Schema.Array(CommentItem) },
  Failed: { error: Schema.String },
})
export type CommentsState = typeof CommentsState.Type

export const LabelsState = defineTaggedUnion({
  Loading: {},
  Loaded: { labels: Schema.Array(Schema.String) },
  Failed: { error: Schema.String },
})
export type LabelsState = typeof LabelsState.Type

export const RelatedState = defineTaggedUnion({
  Idle: {},
  Loading: {},
  Found: { hits: Schema.Array(Hit) },
  Failed: { error: Schema.String },
})
export type RelatedState = typeof RelatedState.Type

export const Selection = Schema.Struct({
  id: Schema.Number,
  seq: Schema.Number,
  detail: DetailState,
  comments: CommentsState,
  labels: LabelsState,
  related: RelatedState,
  titleDraft: Schema.String,
  commentDraft: Schema.String,
  labelDraft: Schema.String,
  nextKey: Schema.Number,
  assignError: Schema.Option(Schema.String),
  renameError: Schema.Option(Schema.String),
  closeError: Schema.Option(Schema.String),
  postError: Schema.Option(Schema.String),
  labelError: Schema.Option(Schema.String),
})
export type Selection = typeof Selection.Type

export const IssuesModel = Schema.Struct({
  user: Schema.String,
  filter: Filter,
  list: ListState,
  listSeq: Schema.Number,
  selectionSeq: Schema.Number,
  selection: Schema.Option(Selection),
  rowError: Schema.Option(Schema.String),
  openCount: Schema.Option(Schema.Number),
})
export type IssuesModel = typeof IssuesModel.Type

export const HitsFor = Schema.Struct({
  query: Schema.String,
  hits: Schema.Array(Hit),
})
export type HitsFor = typeof HitsFor.Type

export const HelpResults = defineTaggedUnion({
  Empty: {},
  TooShort: { query: Schema.String },
  Searching: { query: Schema.String, previous: Schema.Option(HitsFor) },
  Found: { query: Schema.String, hits: Schema.Array(Hit) },
  Failed: { query: Schema.String, error: Schema.String },
})
export type HelpResults = typeof HelpResults.Type

export const ItemState = defineTaggedUnion({
  Empty: {},
  Loading: { id: Schema.Number },
  Shown: { item: Item },
  NotFound: { id: Schema.Number },
  Failed: { id: Schema.Number, error: Schema.String },
})
export type ItemState = typeof ItemState.Type

export const HelpModel = Schema.Struct({
  query: Schema.String,
  results: HelpResults,
  selected: Schema.Option(Schema.Number),
  item: ItemState,
})
export type HelpModel = typeof HelpModel.Type

export const SaveState = defineTaggedUnion({
  Idle: {},
  Saving: { pending: Settings, seq: Schema.Number },
})
export type SaveState = typeof SaveState.Type

export const SettingsLoad = defineTaggedUnion({
  Loading: {},
  Failed: { error: Schema.String },
  Loaded: {
    saved: Settings,
    draft: Settings,
    save: SaveState,
    saveError: Schema.Option(Schema.String),
    saveSeq: Schema.Number,
  },
})
export type SettingsLoad = typeof SettingsLoad.Type

export const SettingsModel = Schema.Struct({
  load: SettingsLoad,
})
export type SettingsModel = typeof SettingsModel.Type

export const Page = defineTaggedUnion({
  IssuesPage: { model: IssuesModel },
  HelpPage: { model: HelpModel },
  SettingsPage: { model: SettingsModel },
})
export type Page = typeof Page.Type

export const Model = Schema.Struct({
  visit: Schema.Number,
  page: Page,
  lastOpenCount: Schema.Option(Schema.Number),
})
export type Model = typeof Model.Type
