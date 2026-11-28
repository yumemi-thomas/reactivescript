import { Array, Option, Schema, pipe } from 'effect'
import { defineTaggedUnion } from 'foldkit/schema'
import { modifyFields } from 'foldkit/struct'

import { Comment, Filter, Hit, IssueDetail, IssueRow } from '../domain'

// MODEL

export const ListState = defineTaggedUnion({
  Loading: { requestId: Schema.Number },
  Loaded: { issues: Schema.Array(IssueRow) },
  Failed: { error: Schema.String },
})
export type ListState = typeof ListState.Type

export const PendingChange = defineTaggedUnion({
  Assign: { opId: Schema.Number, issueId: Schema.Number, assignee: Schema.String },
  Rename: { opId: Schema.Number, issueId: Schema.Number, title: Schema.String },
  Close: { opId: Schema.Number, issueId: Schema.Number },
})
export type PendingChange = typeof PendingChange.Type

export const ActionSource = defineTaggedUnion({
  Detail: { selectionId: Schema.Number },
  Row: {},
})
export type ActionSource = typeof ActionSource.Type

export const DetailState = defineTaggedUnion({
  Loading: { requestId: Schema.Number },
  Found: { issue: IssueDetail },
  NotFound: {},
  Failed: { error: Schema.String },
})
export type DetailState = typeof DetailState.Type

export const CommentsState = defineTaggedUnion({
  Loading: {},
  Loaded: { comments: Schema.Array(Comment) },
  Failed: { error: Schema.String },
})
export type CommentsState = typeof CommentsState.Type

export const PendingComment = Schema.Struct({
  opId: Schema.Number,
  author: Schema.String,
  text: Schema.String,
})
export type PendingComment = typeof PendingComment.Type

export const LabelsState = defineTaggedUnion({
  Loading: {},
  Loaded: { labels: Schema.Array(Schema.String) },
  Failed: { error: Schema.String },
})
export type LabelsState = typeof LabelsState.Type

export const PendingLabelChange = defineTaggedUnion({
  Add: { opId: Schema.Number, label: Schema.String },
  Remove: { opId: Schema.Number, label: Schema.String },
})
export type PendingLabelChange = typeof PendingLabelChange.Type

export const RelatedState = defineTaggedUnion({
  NotStarted: {},
  Searching: { requestId: Schema.Number, query: Schema.String },
  Found: { query: Schema.String, hits: Schema.Array(Hit) },
  Failed: { error: Schema.String },
})
export type RelatedState = typeof RelatedState.Type

export const Selected = Schema.Struct({
  selectionId: Schema.Number,
  issueId: Schema.Number,
  detail: DetailState,
  related: RelatedState,
  comments: CommentsState,
  pendingComments: Schema.Array(PendingComment),
  labels: LabelsState,
  pendingLabelChanges: Schema.Array(PendingLabelChange),
  titleInput: Schema.String,
  commentInput: Schema.String,
  labelInput: Schema.String,
  maybeAssignError: Schema.Option(Schema.String),
  maybeRenameError: Schema.Option(Schema.String),
  maybeCloseError: Schema.Option(Schema.String),
  maybePostError: Schema.Option(Schema.String),
  maybeLabelError: Schema.Option(Schema.String),
})
export type Selected = typeof Selected.Type

export const Model = Schema.Struct({
  nextId: Schema.Number,
  user: Schema.String,
  filter: Filter,
  list: ListState,
  maybeOpenIssues: Schema.Option(Schema.Array(IssueRow)),
  pendingChanges: Schema.Array(PendingChange),
  maybeSelected: Schema.Option(Selected),
  maybeRowError: Schema.Option(Schema.String),
})
export type Model = typeof Model.Type

export const INITIAL_USER = 'guest'

export const initSelected = (
  selectionId: number,
  issueId: number,
  detailRequestId: number,
): Selected => ({
  selectionId,
  issueId,
  detail: DetailState.Loading({ requestId: detailRequestId }),
  related: RelatedState.NotStarted(),
  comments: CommentsState.Loading(),
  pendingComments: [],
  labels: LabelsState.Loading(),
  pendingLabelChanges: [],
  titleInput: '',
  commentInput: '',
  labelInput: '',
  maybeAssignError: Option.none(),
  maybeRenameError: Option.none(),
  maybeCloseError: Option.none(),
  maybePostError: Option.none(),
  maybeLabelError: Option.none(),
})

// DERIVED

const applyChange =
  (filter: Filter) =>
  (issues: ReadonlyArray<IssueRow>, change: PendingChange): ReadonlyArray<IssueRow> =>
    PendingChange.match(change, {
      Assign: ({ issueId, assignee }) =>
        Array.map(issues, issue =>
          issue.id === issueId
            ? modifyFields(issue, { assignee: () => Option.some(assignee) })
            : issue,
        ),
      Rename: ({ issueId, title }) =>
        Array.map(issues, issue =>
          issue.id === issueId ? modifyFields(issue, { title: () => title }) : issue,
        ),
      Close: ({ issueId }) =>
        filter === 'open'
          ? Array.filter(issues, issue => issue.id !== issueId)
          : issues,
    })

export const withPendingChanges = (
  issues: ReadonlyArray<IssueRow>,
  filter: Filter,
  pendingChanges: ReadonlyArray<PendingChange>,
): ReadonlyArray<IssueRow> =>
  Array.reduce(pendingChanges, issues, applyChange(filter))

export const displayedIssues = (
  model: Model,
): Option.Option<ReadonlyArray<IssueRow>> =>
  ListState.match(model.list, {
    Loading: () => Option.none(),
    Loaded: ({ issues }) =>
      Option.some(withPendingChanges(issues, model.filter, model.pendingChanges)),
    Failed: () => Option.none(),
  })

export const openIssueCount = (model: Model): Option.Option<number> =>
  Option.map(
    model.maybeOpenIssues,
    issues => withPendingChanges(issues, 'open', model.pendingChanges).length,
  )

export const displayedTitle = (
  issue: IssueDetail,
  pendingChanges: ReadonlyArray<PendingChange>,
): string =>
  Array.reduce(pendingChanges, issue.title, (title, change) =>
    PendingChange.match(change, {
      Assign: () => title,
      Rename: rename => (rename.issueId === issue.id ? rename.title : title),
      Close: () => title,
    }),
  )

export const isClosePending = (model: Model, issueId: number): boolean =>
  Array.some(
    model.pendingChanges,
    change => change._tag === 'Close' && change.issueId === issueId,
  )

export const displayedLabels = (selected: Selected): ReadonlyArray<string> =>
  Array.reduce(
    selected.pendingLabelChanges,
    LabelsState.match(selected.labels, {
      Loading: (): ReadonlyArray<string> => [],
      Loaded: ({ labels }) => labels,
      Failed: (): ReadonlyArray<string> => [],
    }),
    (labels, change) =>
      PendingLabelChange.match(change, {
        Add: ({ label }) =>
          Array.contains(labels, label) ? labels : Array.append(labels, label),
        Remove: ({ label }) => Array.filter(labels, current => current !== label),
      }),
  )

export const mapIssueRows =
  (f: (issue: IssueRow) => IssueRow) =>
  (model: Model): Model =>
    modifyFields(model, {
      list: list =>
        ListState.match(list, {
          Loading: () => list,
          Loaded: ({ issues }) => ListState.Loaded({ issues: Array.map(issues, f) }),
          Failed: () => list,
        }),
      maybeOpenIssues: Option.map(Array.map(f)),
    })

export const removeOpenIssue =
  (issueId: number) =>
  (model: Model): Model =>
    modifyFields(model, {
      list: list =>
        model.filter === 'open'
          ? ListState.match(list, {
              Loading: () => list,
              Loaded: ({ issues }) =>
                ListState.Loaded({
                  issues: Array.filter(issues, issue => issue.id !== issueId),
                }),
              Failed: () => list,
            })
          : list,
      maybeOpenIssues: Option.map(
        Array.filter(issue => issue.id !== issueId),
      ),
    })

export const withoutPendingChange =
  (opId: number) =>
  (model: Model): Model =>
    modifyFields(model, {
      pendingChanges: Array.filter(change => change.opId !== opId),
    })

export const selectedFor = (
  model: Model,
  selectionId: number,
): Option.Option<Selected> =>
  pipe(
    model.maybeSelected,
    Option.filter(selected => selected.selectionId === selectionId),
  )
