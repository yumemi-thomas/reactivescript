import { Schema } from 'effect'
import { defineTaggedUnion } from 'foldkit/schema'

// MODEL

export const Tab = Schema.Literals(['issues', 'help', 'settings'])
export type Tab = typeof Tab.Type

export const Filter = Schema.Literals(['open', 'closed'])
export type Filter = typeof Filter.Type

export const Origin = Schema.Literals(['detail', 'row'])
export type Origin = typeof Origin.Type

export const Theme = Schema.Literals(['light', 'dark'])
export type Theme = typeof Theme.Type

export const Density = Schema.Literals(['comfortable', 'compact'])
export type Density = typeof Density.Type

export const Settings = Schema.Struct({
  name: Schema.String,
  theme: Theme,
  density: Density,
})
export type Settings = typeof Settings.Type

export const IssueRow = Schema.Struct({
  id: Schema.Number,
  title: Schema.String,
  assignee: Schema.Option(Schema.String),
  closing: Schema.Boolean,
})
export type IssueRow = typeof IssueRow.Type

export const IssueDetail = Schema.Struct({
  id: Schema.Number,
  title: Schema.String,
  body: Schema.String,
})
export type IssueDetail = typeof IssueDetail.Type

export const CommentData = Schema.Struct({
  author: Schema.String,
  text: Schema.String,
})
export type CommentData = typeof CommentData.Type

export const CommentRow = Schema.Struct({
  key: Schema.Number,
  author: Schema.String,
  text: Schema.String,
  status: Schema.Literals(['saved', 'sending']),
})
export type CommentRow = typeof CommentRow.Type

export const LabelRow = Schema.Struct({
  name: Schema.String,
  status: Schema.Literals(['saved', 'adding', 'removing']),
})
export type LabelRow = typeof LabelRow.Type

export const Hit = Schema.Struct({
  id: Schema.Number,
  name: Schema.String,
})
export type Hit = typeof Hit.Type

export const Item = Schema.Struct({
  id: Schema.Number,
  name: Schema.String,
  blurb: Schema.String,
})
export type Item = typeof Item.Type

export const IssueList = defineTaggedUnion({
  Loading: {},
  Loaded: { issues: Schema.Array(IssueRow) },
  Failed: { message: Schema.String },
})
export type IssueList = typeof IssueList.Type

export const DetailLoad = defineTaggedUnion({
  Loading: {},
  Found: { title: Schema.String, body: Schema.String },
  NotFound: {},
  Failed: { message: Schema.String },
})
export type DetailLoad = typeof DetailLoad.Type

export const CommentsLoad = defineTaggedUnion({
  Loading: {},
  Loaded: { rows: Schema.Array(CommentRow) },
  Failed: { message: Schema.String },
})
export type CommentsLoad = typeof CommentsLoad.Type

export const LabelsLoad = defineTaggedUnion({
  Loading: {},
  Loaded: { rows: Schema.Array(LabelRow) },
  Failed: { message: Schema.String },
})
export type LabelsLoad = typeof LabelsLoad.Type

export const Related = defineTaggedUnion({
  Idle: {},
  Searching: {},
  Found: { hits: Schema.Array(Hit) },
  Failed: { message: Schema.String },
})
export type Related = typeof Related.Type

export const IssuesPage = Schema.Struct({
  user: Schema.String,
  filter: Filter,
  list: IssueList,
  selected: Schema.Option(Schema.Number),
  detail: DetailLoad,
  titleInput: Schema.String,
  commentInput: Schema.String,
  labelInput: Schema.String,
  comments: CommentsLoad,
  labels: LabelsLoad,
  related: Related,
  rowError: Schema.Option(Schema.String),
  assignError: Schema.Option(Schema.String),
  renameError: Schema.Option(Schema.String),
  closeError: Schema.Option(Schema.String),
  postError: Schema.Option(Schema.String),
  labelError: Schema.Option(Schema.String),
})
export type IssuesPage = typeof IssuesPage.Type

export const HelpResults = defineTaggedUnion({
  Idle: {},
  TooShort: { query: Schema.String },
  Searching: { query: Schema.String, hits: Schema.Array(Hit) },
  Found: { query: Schema.String, hits: Schema.Array(Hit) },
  Failed: { query: Schema.String, message: Schema.String },
})
export type HelpResults = typeof HelpResults.Type

export const HelpItem = defineTaggedUnion({
  Nothing: {},
  Loading: {},
  Found: { item: Item },
  NotFound: {},
  Failed: { message: Schema.String },
})
export type HelpItem = typeof HelpItem.Type

export const HelpPage = Schema.Struct({
  query: Schema.String,
  results: HelpResults,
  selectedHit: Schema.Option(Schema.Number),
  item: HelpItem,
})
export type HelpPage = typeof HelpPage.Type

export const SettingsPage = defineTaggedUnion({
  Loading: {},
  Loaded: {
    saved: Settings,
    draft: Settings,
    saving: Schema.Option(Settings),
    saveError: Schema.Option(Schema.String),
  },
  LoadFailed: { message: Schema.String },
})
export type SettingsPage = typeof SettingsPage.Type

export const Model = Schema.Struct({
  tab: Tab,
  openCount: Schema.Option(Schema.Number),
  nextKey: Schema.Number,
  issues: IssuesPage,
  help: HelpPage,
  settings: SettingsPage,
})
export type Model = typeof Model.Type
