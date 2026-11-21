import { Schema } from 'effect'
import { defineTaggedUnion } from 'foldkit/schema'

// MODEL

export const Tab = Schema.Literals(['issues', 'help', 'settings'])
export type Tab = typeof Tab.Type

export const Filter = Schema.Literals(['open', 'closed'])
export type Filter = typeof Filter.Type

export const Origin = Schema.Literals(['Detail', 'Row'])
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

export const IssueSummary = Schema.Struct({
  id: Schema.Number,
  title: Schema.String,
  assignee: Schema.NullOr(Schema.String),
})
export type IssueSummary = typeof IssueSummary.Type

export const IssueDetail = Schema.Struct({
  id: Schema.Number,
  title: Schema.String,
  body: Schema.String,
})
export type IssueDetail = typeof IssueDetail.Type

export const IssueRow = Schema.Struct({
  id: Schema.Number,
  title: Schema.String,
  assignee: Schema.Option(Schema.String),
})
export type IssueRow = typeof IssueRow.Type

export const CommentStatus = Schema.Literals(['Saved', 'Sending'])
export type CommentStatus = typeof CommentStatus.Type

export const CommentEntry = Schema.Struct({
  key: Schema.Number,
  author: Schema.String,
  text: Schema.String,
  status: CommentStatus,
})
export type CommentEntry = typeof CommentEntry.Type

export const LabelStatus = Schema.Literals(['Stable', 'Adding', 'Removing'])
export type LabelStatus = typeof LabelStatus.Type

export const LabelEntry = Schema.Struct({
  key: Schema.Number,
  name: Schema.String,
  status: LabelStatus,
})
export type LabelEntry = typeof LabelEntry.Type

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
  Loaded: { rows: Schema.Array(IssueRow) },
  Failed: { error: Schema.String },
})
export type IssueList = typeof IssueList.Type

export const IssueDetailState = defineTaggedUnion({
  Loading: {},
  Loaded: { title: Schema.String, body: Schema.String },
  NotFound: {},
  Failed: { error: Schema.String },
})
export type IssueDetailState = typeof IssueDetailState.Type

export const CommentsState = defineTaggedUnion({
  Loading: {},
  Loaded: { comments: Schema.Array(CommentEntry) },
  Failed: { error: Schema.String },
})
export type CommentsState = typeof CommentsState.Type

export const LabelsState = defineTaggedUnion({
  Loading: {},
  Loaded: { labels: Schema.Array(LabelEntry) },
  Failed: { error: Schema.String },
})
export type LabelsState = typeof LabelsState.Type

export const RelatedState = defineTaggedUnion({
  Idle: {},
  Loading: {},
  Loaded: { hits: Schema.Array(Hit) },
  Failed: { error: Schema.String },
})
export type RelatedState = typeof RelatedState.Type

export const ItemState = defineTaggedUnion({
  Idle: {},
  Loading: { id: Schema.Number },
  Loaded: { item: Item },
  NotFound: { id: Schema.Number },
  Failed: { id: Schema.Number, error: Schema.String },
})
export type ItemState = typeof ItemState.Type

export const Results = defineTaggedUnion({
  Idle: {},
  TooShort: { query: Schema.String },
  Searching: { query: Schema.String, shown: Schema.Array(Hit) },
  Loaded: { query: Schema.String, hits: Schema.Array(Hit) },
  Failed: { query: Schema.String, error: Schema.String },
})
export type Results = typeof Results.Type

export const SaveStatus = defineTaggedUnion({
  Idle: {},
  Saving: { settings: Settings },
  Failed: { error: Schema.String },
})
export type SaveStatus = typeof SaveStatus.Type

export const SettingsLoad = defineTaggedUnion({
  Loading: {},
  Loaded: { saved: Settings, draft: Settings, save: SaveStatus },
  Failed: { error: Schema.String },
})
export type SettingsLoad = typeof SettingsLoad.Type

export const SelectedIssue = Schema.Struct({
  id: Schema.Number,
  detail: IssueDetailState,
  comments: CommentsState,
  labels: LabelsState,
  related: RelatedState,
  titleDraft: Schema.String,
  commentDraft: Schema.String,
  labelDraft: Schema.String,
  assignError: Schema.Option(Schema.String),
  renameError: Schema.Option(Schema.String),
  closeError: Schema.Option(Schema.String),
  postError: Schema.Option(Schema.String),
  labelError: Schema.Option(Schema.String),
})
export type SelectedIssue = typeof SelectedIssue.Type

export const IssuesPage = Schema.Struct({
  user: Schema.String,
  filter: Filter,
  list: IssueList,
  closingIds: Schema.Array(Schema.Number),
  rowError: Schema.Option(Schema.String),
  selected: Schema.Option(SelectedIssue),
})
export type IssuesPage = typeof IssuesPage.Type

export const HelpPage = Schema.Struct({
  query: Schema.String,
  results: Results,
  selectedHit: Schema.Option(Schema.Number),
  item: ItemState,
})
export type HelpPage = typeof HelpPage.Type

export const SettingsPage = Schema.Struct({
  load: SettingsLoad,
})
export type SettingsPage = typeof SettingsPage.Type

export const Model = Schema.Struct({
  tab: Tab,
  visit: Schema.Number,
  openCount: Schema.Option(Schema.Number),
  nextKey: Schema.Number,
  issues: IssuesPage,
  help: HelpPage,
  settings: SettingsPage,
})
export type Model = typeof Model.Type
