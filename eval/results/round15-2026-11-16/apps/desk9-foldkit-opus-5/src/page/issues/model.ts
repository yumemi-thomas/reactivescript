import { Array, Option, Schema, pipe } from 'effect'
import { defineTaggedUnion } from 'foldkit/schema'
import { modifyFields } from 'foldkit/struct'

import { Comment, Filter, Hit, Issue, IssueDetail } from '../../domain'

// LIST

export const IssueList = defineTaggedUnion({
  Loading: {},
  Failed: { error: Schema.String },
  Loaded: { issues: Schema.Array(Issue) },
})
export type IssueList = typeof IssueList.Type

// PENDING ISSUE CHANGES

export const IssueChange = defineTaggedUnion({
  Assign: { assignee: Schema.String },
  Rename: { title: Schema.String },
  Close: {},
})
export type IssueChange = typeof IssueChange.Type

export const ChangeOrigin = defineTaggedUnion({
  Detail: { selectionId: Schema.Number },
  Row: {},
})
export type ChangeOrigin = typeof ChangeOrigin.Type

export const PendingChange = Schema.Struct({
  changeId: Schema.Number,
  issueId: Schema.Number,
  origin: ChangeOrigin,
  change: IssueChange,
})
export type PendingChange = typeof PendingChange.Type

// SELECTION

export const DetailState = defineTaggedUnion({
  Loading: {},
  NotFound: {},
  Failed: { error: Schema.String },
  Loaded: { detail: IssueDetail },
})
export type DetailState = typeof DetailState.Type

export const CommentsState = defineTaggedUnion({
  Loading: {},
  Failed: { error: Schema.String },
  Loaded: { comments: Schema.Array(Comment) },
})
export type CommentsState = typeof CommentsState.Type

export const PostStatus = Schema.Literals(['Sending', 'Sent'])
export type PostStatus = typeof PostStatus.Type

export const Post = Schema.Struct({
  postId: Schema.Number,
  comment: Comment,
  status: PostStatus,
})
export type Post = typeof Post.Type

export const LabelsState = defineTaggedUnion({
  Loading: {},
  Failed: { error: Schema.String },
  Loaded: { labels: Schema.Array(Schema.String) },
})
export type LabelsState = typeof LabelsState.Type

export const LabelChange = defineTaggedUnion({
  Add: { label: Schema.String },
  Remove: { label: Schema.String },
})
export type LabelChange = typeof LabelChange.Type

export const PendingLabelChange = Schema.Struct({
  changeId: Schema.Number,
  change: LabelChange,
})
export type PendingLabelChange = typeof PendingLabelChange.Type

export const RelatedState = defineTaggedUnion({
  Idle: {},
  Searching: { requestId: Schema.Number, query: Schema.String },
  Failed: { query: Schema.String, error: Schema.String },
  Found: { query: Schema.String, hits: Schema.Array(Hit) },
})
export type RelatedState = typeof RelatedState.Type

export const DetailErrors = Schema.Struct({
  maybeAssignError: Schema.Option(Schema.String),
  maybeRenameError: Schema.Option(Schema.String),
  maybeCloseError: Schema.Option(Schema.String),
  maybePostError: Schema.Option(Schema.String),
  maybeLabelError: Schema.Option(Schema.String),
})
export type DetailErrors = typeof DetailErrors.Type

export const Selection = Schema.Struct({
  selectionId: Schema.Number,
  issueId: Schema.Number,
  detailRequestId: Schema.Number,
  detail: DetailState,
  comments: CommentsState,
  posts: Schema.Array(Post),
  labels: LabelsState,
  labelChanges: Schema.Array(PendingLabelChange),
  related: RelatedState,
  titleInput: Schema.String,
  commentInput: Schema.String,
  labelInput: Schema.String,
  errors: DetailErrors,
})
export type Selection = typeof Selection.Type

// MODEL

export const Model = Schema.Struct({
  user: Schema.String,
  filter: Filter,
  listRequestId: Schema.Number,
  list: IssueList,
  maybeKnownOpenIds: Schema.Option(Schema.Array(Schema.Number)),
  changes: Schema.Array(PendingChange),
  maybeSelection: Schema.Option(Selection),
  maybeRowError: Schema.Option(Schema.String),
  lastId: Schema.Number,
})
export type Model = typeof Model.Type

export const noDetailErrors: DetailErrors = {
  maybeAssignError: Option.none(),
  maybeRenameError: Option.none(),
  maybeCloseError: Option.none(),
  maybePostError: Option.none(),
  maybeLabelError: Option.none(),
}

// DERIVED

const changesFor = (
  changes: ReadonlyArray<PendingChange>,
  issueId: number,
): ReadonlyArray<IssueChange> =>
  pipe(
    changes,
    Array.filter(pending => pending.issueId === issueId),
    Array.map(({ change }) => change),
  )

const isClosing = (
  changes: ReadonlyArray<PendingChange>,
  issueId: number,
): boolean =>
  Array.some(
    changesFor(changes, issueId),
    change => change._tag === 'Close',
  )

const withChange = (issue: Issue, change: IssueChange): Issue =>
  IssueChange.match<Issue>(change, {
    Assign: ({ assignee }) =>
      modifyFields(issue, { maybeAssignee: () => Option.some(assignee) }),
    Rename: ({ title }) => modifyFields(issue, { title: () => title }),
    Close: () => issue,
  })

export const shownIssue = (
  changes: ReadonlyArray<PendingChange>,
  issue: Issue,
): Issue => Array.reduce(changesFor(changes, issue.id), issue, withChange)

export const shownTitle = (
  changes: ReadonlyArray<PendingChange>,
  detail: IssueDetail,
): string =>
  Array.reduce(changesFor(changes, detail.id), detail.title, (title, change) =>
    change._tag === 'Rename' ? change.title : title,
  )

export const shownIssues = (
  model: Model,
  issues: ReadonlyArray<Issue>,
): ReadonlyArray<Issue> =>
  pipe(
    issues,
    Array.filter(
      issue => model.filter !== 'open' || !isClosing(model.changes, issue.id),
    ),
    Array.map(issue => shownIssue(model.changes, issue)),
  )

export const openIssueCount = (model: Model): Option.Option<number> =>
  Option.map(
    model.maybeKnownOpenIds,
    ids =>
      Array.filter(ids, issueId => !isClosing(model.changes, issueId)).length,
  )

const withLabelChange = (
  labels: ReadonlyArray<string>,
  change: LabelChange,
): ReadonlyArray<string> =>
  LabelChange.match<ReadonlyArray<string>>(change, {
    Add: ({ label }) =>
      Array.contains(labels, label) ? labels : Array.append(labels, label),
    Remove: ({ label }) => Array.filter(labels, shown => shown !== label),
  })

export const shownLabels = (
  selection: Selection,
  labels: ReadonlyArray<string>,
): ReadonlyArray<string> =>
  Array.reduce(
    selection.labelChanges,
    labels,
    (shown, { change }) => withLabelChange(shown, change),
  )
