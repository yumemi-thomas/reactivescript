import { Array, Option, Schema, pipe } from 'effect'
import { defineTaggedUnion } from 'foldkit/schema'
import { modifyFields } from 'foldkit/struct'

import {
  Comment,
  Filter,
  Hit,
  IssueDetail,
  IssueRow,
  Item,
  Settings,
} from './domain'

// MODEL

export const IssueList = defineTaggedUnion({
  LoadingIssues: { requestId: Schema.Number },
  FailedIssues: { error: Schema.String },
  LoadedIssues: { issues: Schema.Array(IssueRow) },
})
export type IssueList = typeof IssueList.Type

export const Origin = defineTaggedUnion({
  FromDetail: { token: Schema.Number },
  FromRow: {},
})
export type Origin = typeof Origin.Type

export const PendingChange = defineTaggedUnion({
  PendingAssign: {
    opId: Schema.Number,
    issueId: Schema.Number,
    assignee: Schema.String,
    origin: Origin,
  },
  PendingRename: {
    opId: Schema.Number,
    issueId: Schema.Number,
    title: Schema.String,
    token: Schema.Number,
  },
  PendingClose: {
    opId: Schema.Number,
    issueId: Schema.Number,
    origin: Origin,
  },
})
export type PendingChange = typeof PendingChange.Type

export const DetailState = defineTaggedUnion({
  LoadingDetail: { requestId: Schema.Number },
  MissingDetail: {},
  FailedDetail: { error: Schema.String },
  LoadedDetail: { detail: IssueDetail },
})
export type DetailState = typeof DetailState.Type

export const RelatedState = defineTaggedUnion({
  RelatedIdle: {},
  LoadingRelated: { requestId: Schema.Number, query: Schema.String },
  FailedRelated: { error: Schema.String },
  LoadedRelated: { query: Schema.String, hits: Schema.Array(Hit) },
})
export type RelatedState = typeof RelatedState.Type

export const CommentsState = defineTaggedUnion({
  LoadingComments: {},
  FailedComments: { error: Schema.String },
  LoadedComments: { comments: Schema.Array(Comment) },
})
export type CommentsState = typeof CommentsState.Type

export const PostStatus = Schema.Literals(['Sending', 'Sent'])
export type PostStatus = typeof PostStatus.Type

export const Post = Schema.Struct({
  opId: Schema.Number,
  comment: Comment,
  status: PostStatus,
})
export type Post = typeof Post.Type

export const LabelsState = defineTaggedUnion({
  LoadingLabels: {},
  FailedLabels: { error: Schema.String },
  LoadedLabels: { labels: Schema.Array(Schema.String) },
})
export type LabelsState = typeof LabelsState.Type

export const LabelChange = defineTaggedUnion({
  PendingAddLabel: { opId: Schema.Number, label: Schema.String },
  PendingRemoveLabel: { opId: Schema.Number, label: Schema.String },
})
export type LabelChange = typeof LabelChange.Type

export const Selection = Schema.Struct({
  token: Schema.Number,
  issueId: Schema.Number,
  detail: DetailState,
  related: RelatedState,
  comments: CommentsState,
  posts: Schema.Array(Post),
  labels: LabelsState,
  labelsVersion: Schema.Number,
  labelChanges: Schema.Array(LabelChange),
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

export const IssuesModel = Schema.Struct({
  user: Schema.String,
  filter: Filter,
  list: IssueList,
  pendingChanges: Schema.Array(PendingChange),
  maybeSelection: Schema.Option(Selection),
  maybeRowError: Schema.Option(Schema.String),
})
export type IssuesModel = typeof IssuesModel.Type

export const FoundResults = Schema.Struct({
  query: Schema.String,
  hits: Schema.Array(Hit),
})
export type FoundResults = typeof FoundResults.Type

export const Results = defineTaggedUnion({
  NoQuery: {},
  TooShort: { query: Schema.String },
  Searching: {
    requestId: Schema.Number,
    query: Schema.String,
    maybePrevious: Schema.Option(FoundResults),
  },
  Found: { query: Schema.String, hits: Schema.Array(Hit) },
  SearchFailed: { query: Schema.String, error: Schema.String },
})
export type Results = typeof Results.Type

export const ItemState = defineTaggedUnion({
  NoItem: {},
  LoadingItem: { requestId: Schema.Number, hitId: Schema.Number },
  LoadedItem: { item: Item },
  MissingItem: { hitId: Schema.Number },
  FailedItem: { hitId: Schema.Number, error: Schema.String },
})
export type ItemState = typeof ItemState.Type

export const HelpModel = Schema.Struct({
  query: Schema.String,
  results: Results,
  maybeSelectedHitId: Schema.Option(Schema.Number),
  item: ItemState,
})
export type HelpModel = typeof HelpModel.Type

export const Saving = Schema.Struct({
  requestId: Schema.Number,
  settings: Settings,
})
export type Saving = typeof Saving.Type

export const SettingsForm = Schema.Struct({
  saved: Settings,
  savedVersion: Schema.Number,
  draft: Settings,
  maybeSaving: Schema.Option(Saving),
  maybeSaveError: Schema.Option(Schema.String),
})
export type SettingsForm = typeof SettingsForm.Type

export const SettingsModel = defineTaggedUnion({
  LoadingSettings: { requestId: Schema.Number },
  FailedSettings: { error: Schema.String },
  LoadedSettings: { form: SettingsForm },
})
export type SettingsModel = typeof SettingsModel.Type

export const Page = defineTaggedUnion({
  IssuesPage: { issues: IssuesModel },
  HelpPage: { help: HelpModel },
  SettingsPage: { settings: SettingsModel },
})
export type Page = typeof Page.Type

export const Model = Schema.Struct({
  page: Page,
  maybeOpenCount: Schema.Option(Schema.Number),
  nextId: Schema.Number,
})
export type Model = typeof Model.Type

// DERIVED

const changesFor = (
  pendingChanges: ReadonlyArray<PendingChange>,
  issueId: number,
): ReadonlyArray<PendingChange> =>
  Array.filter(pendingChanges, change => change.issueId === issueId)

export const isClosing = (
  pendingChanges: ReadonlyArray<PendingChange>,
  issueId: number,
): boolean =>
  Array.some(
    pendingChanges,
    change => change._tag === 'PendingClose' && change.issueId === issueId,
  )

const applyChanges =
  (pendingChanges: ReadonlyArray<PendingChange>) =>
  (issue: IssueRow): IssueRow =>
    Array.reduce(
      changesFor(pendingChanges, issue.id),
      issue,
      (shown, change) =>
        PendingChange.match<IssueRow>(change, {
          PendingAssign: ({ assignee }) =>
            modifyFields(shown, { maybeAssignee: () => Option.some(assignee) }),
          PendingRename: ({ title }) =>
            modifyFields(shown, { title: () => title }),
          PendingClose: () => shown,
        }),
    )

export const shownIssues = (
  page: IssuesModel,
  issues: ReadonlyArray<IssueRow>,
): ReadonlyArray<IssueRow> =>
  pipe(
    issues,
    Array.filter(
      issue =>
        page.filter !== 'open' || !isClosing(page.pendingChanges, issue.id),
    ),
    Array.map(applyChanges(page.pendingChanges)),
  )

export const shownTitle = (page: IssuesModel, detail: IssueDetail): string =>
  Array.reduce(
    changesFor(page.pendingChanges, detail.id),
    detail.title,
    (title, change) =>
      change._tag === 'PendingRename' ? change.title : title,
  )

export const shownLabels = (
  selection: Selection,
  labels: ReadonlyArray<string>,
): ReadonlyArray<string> =>
  Array.reduce(selection.labelChanges, labels, (shown, change) =>
    LabelChange.match<ReadonlyArray<string>>(change, {
      PendingAddLabel: ({ label }) =>
        Array.contains(shown, label) ? shown : Array.append(shown, label),
      PendingRemoveLabel: ({ label }) =>
        Array.filter(shown, existing => existing !== label),
    }),
  )

export const openCountFor = (
  page: IssuesModel,
  maybeOpenCount: Option.Option<number>,
): Option.Option<number> =>
  page.filter === 'open' && page.list._tag === 'LoadedIssues'
    ? Option.some(shownIssues(page, page.list.issues).length)
    : maybeOpenCount

