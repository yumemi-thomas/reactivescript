import { Schema } from 'effect'
import { defineTaggedUnion } from 'foldkit/schema'

import {
  Comment,
  Filter,
  Hit,
  Issue,
  IssueDetail,
  Item,
  Origin,
  Settings,
} from './domain'

// NOTE: Every request carries a token drawn from `Model.nextToken`, which only
// ever grows. A response is applied only while the state that asked for it
// still holds its token, so answers for a discarded page, an old filter, a
// previous selection or a superseded query are dropped.

// ISSUES PAGE

export const IssueList = defineTaggedUnion({
  ListLoading: { token: Schema.Number },
  ListFailed: { error: Schema.String },
  ListLoaded: { issues: Schema.Array(Issue) },
})
export type IssueList = typeof IssueList.Type

export const IssueChange = defineTaggedUnion({
  Assigning: {
    opId: Schema.Number,
    issueId: Schema.Number,
    user: Schema.String,
    origin: Origin,
  },
  Renaming: {
    opId: Schema.Number,
    issueId: Schema.Number,
    title: Schema.String,
  },
  Closing: { opId: Schema.Number, issueId: Schema.Number, origin: Origin },
})
export type IssueChange = typeof IssueChange.Type

export const DetailState = defineTaggedUnion({
  DetailLoading: {},
  DetailMissing: {},
  DetailFailed: { error: Schema.String },
  DetailLoaded: { issue: IssueDetail },
})
export type DetailState = typeof DetailState.Type

export const CommentsState = defineTaggedUnion({
  CommentsLoading: {},
  CommentsFailed: { error: Schema.String },
  CommentsLoaded: { comments: Schema.Array(Comment) },
})
export type CommentsState = typeof CommentsState.Type

export const PostStatus = Schema.Literals(['Sending', 'Sent'])
export type PostStatus = typeof PostStatus.Type

export const Post = Schema.Struct({
  opId: Schema.Number,
  author: Schema.String,
  text: Schema.String,
  status: PostStatus,
})
export type Post = typeof Post.Type

export const LabelsState = defineTaggedUnion({
  LabelsLoading: {},
  LabelsFailed: { error: Schema.String },
  LabelsLoaded: { labels: Schema.Array(Schema.String) },
})
export type LabelsState = typeof LabelsState.Type

export const LabelChange = defineTaggedUnion({
  AddingLabel: { opId: Schema.Number, label: Schema.String },
  RemovingLabel: { opId: Schema.Number, label: Schema.String },
})
export type LabelChange = typeof LabelChange.Type

export const RelatedState = defineTaggedUnion({
  RelatedIdle: {},
  RelatedLoading: { token: Schema.Number, query: Schema.String },
  RelatedFailed: { error: Schema.String },
  RelatedLoaded: { query: Schema.String, hits: Schema.Array(Hit) },
})
export type RelatedState = typeof RelatedState.Type

export const Selection = Schema.Struct({
  issueId: Schema.Number,
  selectionToken: Schema.Number,
  detailToken: Schema.Number,
  detail: DetailState,
  comments: CommentsState,
  posts: Schema.Array(Post),
  labels: LabelsState,
  labelChanges: Schema.Array(LabelChange),
  related: RelatedState,
  titleInput: Schema.String,
  commentInput: Schema.String,
  labelInput: Schema.String,
  maybeAssignError: Schema.Option(Schema.String),
  maybeRenameError: Schema.Option(Schema.String),
  maybeCloseError: Schema.Option(Schema.String),
  maybePostError: Schema.Option(Schema.String),
  maybeLabelError: Schema.Option(Schema.String),
})
export type Selection = typeof Selection.Type

export const IssuesPage = Schema.Struct({
  user: Schema.String,
  filter: Filter,
  list: IssueList,
  changes: Schema.Array(IssueChange),
  maybeRowError: Schema.Option(Schema.String),
  maybeSelection: Schema.Option(Selection),
})
export type IssuesPage = typeof IssuesPage.Type

// HELP PAGE

export const ShownResults = Schema.Struct({
  query: Schema.String,
  hits: Schema.Array(Hit),
})
export type ShownResults = typeof ShownResults.Type

export const Results = defineTaggedUnion({
  ResultsNone: {},
  ResultsSearching: {
    token: Schema.Number,
    maybeShown: Schema.Option(ShownResults),
  },
  ResultsFailed: { error: Schema.String },
  ResultsLoaded: { shown: ShownResults },
})
export type Results = typeof Results.Type

export const ItemState = defineTaggedUnion({
  ItemLoading: {},
  ItemMissing: {},
  ItemFailed: { error: Schema.String },
  ItemLoaded: { item: Item },
})
export type ItemState = typeof ItemState.Type

export const SelectedHit = Schema.Struct({
  hitId: Schema.Number,
  token: Schema.Number,
  item: ItemState,
})
export type SelectedHit = typeof SelectedHit.Type

export const HelpPage = Schema.Struct({
  query: Schema.String,
  results: Results,
  maybeSelectedHit: Schema.Option(SelectedHit),
})
export type HelpPage = typeof HelpPage.Type

// SETTINGS PAGE

export const Saving = Schema.Struct({
  token: Schema.Number,
  settings: Settings,
})
export type Saving = typeof Saving.Type

export const SettingsForm = Schema.Struct({
  saved: Settings,
  savedToken: Schema.Number,
  draft: Settings,
  maybeSaving: Schema.Option(Saving),
  maybeSaveError: Schema.Option(Schema.String),
})
export type SettingsForm = typeof SettingsForm.Type

export const SettingsPage = defineTaggedUnion({
  SettingsLoading: { token: Schema.Number },
  SettingsFailed: { error: Schema.String },
  SettingsReady: { form: SettingsForm },
})
export type SettingsPage = typeof SettingsPage.Type

// ROOT

export const Page = defineTaggedUnion({
  IssuesTab: { issues: IssuesPage },
  HelpTab: { help: HelpPage },
  SettingsTab: { settings: SettingsPage },
})
export type Page = typeof Page.Type

export const Model = Schema.Struct({
  nextToken: Schema.Number,
  maybeOpenCount: Schema.Option(Schema.Number),
  page: Page,
})
export type Model = typeof Model.Type
