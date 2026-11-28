import { Schema } from 'effect'
import { defineTaggedUnion } from 'foldkit/schema'

// MODEL

export const Tab = defineTaggedUnion({
  Issues: {},
  Help: {},
  Settings: {},
})
export type Tab = typeof Tab.Type

export const Filter = Schema.Literals(['open', 'closed'])
export type Filter = typeof Filter.Type

export const Origin = defineTaggedUnion({
  Detail: {},
  Row: {},
})
export type Origin = typeof Origin.Type

export const IssueSummary = Schema.Struct({
  id: Schema.Number,
  title: Schema.String,
  maybeAssignee: Schema.Option(Schema.String),
})
export type IssueSummary = typeof IssueSummary.Type

export const IssueDetail = Schema.Struct({
  id: Schema.Number,
  title: Schema.String,
  body: Schema.String,
})
export type IssueDetail = typeof IssueDetail.Type

export const IssueRowStatus = Schema.Literals(['Shown', 'Closing'])
export type IssueRowStatus = typeof IssueRowStatus.Type

export const IssueRow = Schema.Struct({
  id: Schema.Number,
  title: Schema.String,
  maybeAssignee: Schema.Option(Schema.String),
  status: IssueRowStatus,
})
export type IssueRow = typeof IssueRow.Type

export const IssueList = defineTaggedUnion({
  Loading: { filter: Filter },
  Failed: { filter: Filter, error: Schema.String },
  Loaded: { filter: Filter, rows: Schema.Array(IssueRow) },
})
export type IssueList = typeof IssueList.Type

export const DetailLoad = defineTaggedUnion({
  Loading: {},
  NotFound: {},
  Failed: { error: Schema.String },
  Loaded: { title: Schema.String, body: Schema.String },
})
export type DetailLoad = typeof DetailLoad.Type

export const Comment = Schema.Struct({
  author: Schema.String,
  text: Schema.String,
})
export type Comment = typeof Comment.Type

export const CommentStatus = Schema.Literals(['Sending', 'Sent'])
export const CommentEntry = Schema.Struct({
  author: Schema.String,
  text: Schema.String,
  status: CommentStatus,
})
export type CommentEntry = typeof CommentEntry.Type

export const CommentsLoad = defineTaggedUnion({
  Loading: {},
  Failed: { error: Schema.String },
  Loaded: { comments: Schema.Array(CommentEntry) },
})
export type CommentsLoad = typeof CommentsLoad.Type

export const LabelStatus = Schema.Literals(['Adding', 'Shown', 'Removing'])
export const LabelEntry = Schema.Struct({
  name: Schema.String,
  status: LabelStatus,
})
export type LabelEntry = typeof LabelEntry.Type

export const LabelsLoad = defineTaggedUnion({
  Loading: {},
  Failed: { error: Schema.String },
  Loaded: { labels: Schema.Array(LabelEntry) },
})
export type LabelsLoad = typeof LabelsLoad.Type

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

export const RelatedHelp = defineTaggedUnion({
  Idle: {},
  Searching: {},
  Found: { hits: Schema.Array(Hit) },
  Failed: { error: Schema.String },
})
export type RelatedHelp = typeof RelatedHelp.Type

export const Selection = defineTaggedUnion({
  None: {},
  Selected: {
    id: Schema.Number,
    detail: DetailLoad,
    renameDraft: Schema.String,
    commentDraft: Schema.String,
    labelDraft: Schema.String,
    comments: CommentsLoad,
    labels: LabelsLoad,
    related: RelatedHelp,
    maybeAssignError: Schema.Option(Schema.String),
    maybeRenameError: Schema.Option(Schema.String),
    maybeCloseError: Schema.Option(Schema.String),
    maybePostError: Schema.Option(Schema.String),
    maybeLabelError: Schema.Option(Schema.String),
  },
})
export type Selection = typeof Selection.Type

export const IssuesPage = Schema.Struct({
  user: Schema.String,
  list: IssueList,
  selection: Selection,
  maybeRowError: Schema.Option(Schema.String),
})
export type IssuesPage = typeof IssuesPage.Type

export const HelpResults = defineTaggedUnion({
  Empty: {},
  TooShort: { query: Schema.String },
  Searching: { query: Schema.String, previous: Schema.Array(Hit) },
  Found: { query: Schema.String, hits: Schema.Array(Hit) },
  Failed: { query: Schema.String, error: Schema.String },
})
export type HelpResults = typeof HelpResults.Type

export const ItemPane = defineTaggedUnion({
  NoPick: {},
  Loading: { id: Schema.Number },
  Loaded: { item: Item },
  NotFound: { id: Schema.Number },
  Failed: { id: Schema.Number, error: Schema.String },
})
export type ItemPane = typeof ItemPane.Type

export const HelpPage = Schema.Struct({
  query: Schema.String,
  results: HelpResults,
  pane: ItemPane,
})
export type HelpPage = typeof HelpPage.Type

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

export const SaveState = defineTaggedUnion({
  Idle: {},
  Saving: { values: Settings },
  Failed: { error: Schema.String },
})
export type SaveState = typeof SaveState.Type

export const SettingsLoad = defineTaggedUnion({
  Loading: {},
  Failed: { error: Schema.String },
  Loaded: { saved: Settings, draft: Settings, save: SaveState },
})
export type SettingsLoad = typeof SettingsLoad.Type

export const SettingsPage = Schema.Struct({
  load: SettingsLoad,
})
export type SettingsPage = typeof SettingsPage.Type

export const Model = Schema.Struct({
  serial: Schema.Number,
  tab: Tab,
  maybeOpenCount: Schema.Option(Schema.Number),
  issues: IssuesPage,
  help: HelpPage,
  settings: SettingsPage,
})
export type Model = typeof Model.Type
