import { Option, Schema } from 'effect'
import { AsyncData } from 'foldkit'
import { defineTaggedUnion } from 'foldkit/schema'

// MODEL

export const Filter = Schema.Literals(['open', 'closed'])
export type Filter = typeof Filter.Type

export const Origin = Schema.Literals(['Detail', 'Row'])
export type Origin = typeof Origin.Type

export const Issue = Schema.Struct({
  id: Schema.Number,
  title: Schema.String,
  assignee: Schema.NullOr(Schema.String),
})
export type Issue = typeof Issue.Type

export const IssueDetail = Schema.Struct({
  id: Schema.Number,
  title: Schema.String,
  body: Schema.String,
})
export type IssueDetail = typeof IssueDetail.Type

export const ApiComment = Schema.Struct({
  author: Schema.String,
  text: Schema.String,
})

export const CommentRow = Schema.Struct({
  id: Schema.Number,
  author: Schema.String,
  text: Schema.String,
  status: Schema.Literals(['Sending', 'Sent']),
})
export type CommentRow = typeof CommentRow.Type

export const LabelRow = Schema.Struct({
  id: Schema.Number,
  name: Schema.String,
})
export type LabelRow = typeof LabelRow.Type

export const Removed = Schema.Struct({
  index: Schema.Number,
  issue: Issue,
})

export const Hit = Schema.Struct({
  id: Schema.Number,
  name: Schema.String,
})
export type Hit = typeof Hit.Type

export const HelpItem = Schema.Struct({
  id: Schema.Number,
  name: Schema.String,
  blurb: Schema.String,
})
export type HelpItem = typeof HelpItem.Type

export const Theme = Schema.Literals(['light', 'dark'])
export const Density = Schema.Literals(['comfortable', 'compact'])
export const Settings = Schema.Struct({
  name: Schema.String,
  theme: Theme,
  density: Density,
})
export type Settings = typeof Settings.Type

export const IssueRows = AsyncData.Schema(Schema.Array(Issue), Schema.String)
export const DetailData = AsyncData.Schema(
  Schema.NullOr(IssueDetail),
  Schema.String,
)
export const CommentsData = AsyncData.Schema(
  Schema.Array(CommentRow),
  Schema.String,
)
export const LabelsData = AsyncData.Schema(
  Schema.Array(LabelRow),
  Schema.String,
)
export const HitsData = AsyncData.Schema(Schema.Array(Hit), Schema.String)

export const SelectedIssue = Schema.Struct({
  id: Schema.Number,
  detail: DetailData.schema,
  titleInput: Schema.String,
  comments: CommentsData.schema,
  commentInput: Schema.String,
  labels: LabelsData.schema,
  labelInput: Schema.String,
  related: HitsData.schema,
  assignError: Schema.Option(Schema.String),
  renameError: Schema.Option(Schema.String),
  closeError: Schema.Option(Schema.String),
  postError: Schema.Option(Schema.String),
  labelError: Schema.Option(Schema.String),
})
export type SelectedIssue = typeof SelectedIssue.Type

export const IssuesModel = Schema.Struct({
  user: Schema.String,
  filter: Filter,
  list: IssueRows.schema,
  rowError: Schema.Option(Schema.String),
  selected: Schema.Option(SelectedIssue),
  nextId: Schema.Number,
})
export type IssuesModel = typeof IssuesModel.Type

export const HitResults = defineTaggedUnion({
  Idle: {},
  TooShort: { query: Schema.String },
  Searching: { query: Schema.String, shown: Schema.Array(Hit) },
  Found: { query: Schema.String, hits: Schema.Array(Hit) },
  Failed: { query: Schema.String, error: Schema.String },
})

export const HelpPane = defineTaggedUnion({
  NoneSelected: {},
  Loading: { id: Schema.Number },
  Loaded: { item: HelpItem },
  NotFound: { id: Schema.Number },
  Failed: { id: Schema.Number, error: Schema.String },
})

export const HelpModel = Schema.Struct({
  query: Schema.String,
  results: HitResults,
  pane: HelpPane,
})
export type HelpModel = typeof HelpModel.Type

export const SettingsForm = Schema.Struct({
  saved: Settings,
  saving: Schema.Option(Settings),
  draft: Settings,
  saveError: Schema.Option(Schema.String),
})
export type SettingsForm = typeof SettingsForm.Type

export const SettingsData = AsyncData.Schema(SettingsForm, Schema.String)

export const SettingsModel = Schema.Struct({
  form: SettingsData.schema,
})
export type SettingsModel = typeof SettingsModel.Type

export const Page = defineTaggedUnion({
  IssuesPage: { issues: IssuesModel },
  HelpPage: { help: HelpModel },
  SettingsPage: { settings: SettingsModel },
})

export const Model = Schema.Struct({
  generation: Schema.Number,
  openCount: Schema.Option(Schema.Number),
  page: Page,
})
export type Model = typeof Model.Type

export const nameProblem = (name: string): Option.Option<string> => {
  if (name.trim().length === 0) {
    return Option.some('Display name is required')
  }
  if (name.length > 20) {
    return Option.some(
      `Display name must be at most 20 characters, not ${name.length}`,
    )
  }
  return Option.none()
}
