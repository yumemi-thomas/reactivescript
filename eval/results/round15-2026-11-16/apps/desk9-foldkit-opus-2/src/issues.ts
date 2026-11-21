import { Array, Effect, Option, Schema, String, pipe } from 'effect'
import { Command, Submodel, type Update } from 'foldkit'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { defineTaggedUnion } from 'foldkit/schema'
import { modifyFields } from 'foldkit/struct'

import * as Api from './api.js'
import {
  Comment,
  Filter,
  Hit,
  Issue,
  IssueDetail,
  callApi,
} from './domain'

// MODEL

export const ListState = defineTaggedUnion({
  ListLoading: { requestId: Schema.Number },
  ListFailed: { error: Schema.String },
  ListLoaded: { issues: Schema.Array(Issue) },
})
export type ListState = typeof ListState.Type

export const ActionOrigin = defineTaggedUnion({
  FromRow: {},
  FromDetail: { selectionId: Schema.Number },
})
export type ActionOrigin = typeof ActionOrigin.Type

export const ListOperation = defineTaggedUnion({
  PendingAssign: {
    operationId: Schema.Number,
    issueId: Schema.Number,
    assignee: Schema.String,
    origin: ActionOrigin,
  },
  PendingRename: {
    operationId: Schema.Number,
    issueId: Schema.Number,
    title: Schema.String,
    selectionId: Schema.Number,
  },
  PendingClose: {
    operationId: Schema.Number,
    issueId: Schema.Number,
    origin: ActionOrigin,
  },
})
export type ListOperation = typeof ListOperation.Type

export const DetailState = defineTaggedUnion({
  DetailLoading: { requestId: Schema.Number },
  DetailNotFound: {},
  DetailFailed: { error: Schema.String },
  DetailLoaded: { detail: IssueDetail },
})
export type DetailState = typeof DetailState.Type

export const CommentsState = defineTaggedUnion({
  CommentsLoading: {},
  CommentsFailed: { error: Schema.String },
  CommentsLoaded: { comments: Schema.Array(Comment) },
})
export type CommentsState = typeof CommentsState.Type

export const OwnComment = defineTaggedUnion({
  SendingComment: { operationId: Schema.Number, comment: Comment },
  SentComment: { operationId: Schema.Number, comment: Comment },
})
export type OwnComment = typeof OwnComment.Type

export const LabelsState = defineTaggedUnion({
  LabelsLoading: {},
  LabelsFailed: { error: Schema.String },
  LabelsLoaded: { labels: Schema.Array(Schema.String) },
})
export type LabelsState = typeof LabelsState.Type

export const LabelOperation = defineTaggedUnion({
  PendingAddLabel: { operationId: Schema.Number, label: Schema.String },
  PendingRemoveLabel: { operationId: Schema.Number, label: Schema.String },
})
export type LabelOperation = typeof LabelOperation.Type

export const RelatedState = defineTaggedUnion({
  RelatedIdle: {},
  RelatedSearching: { requestId: Schema.Number, query: Schema.String },
  RelatedFound: { query: Schema.String, hits: Schema.Array(Hit) },
  RelatedFailed: { query: Schema.String, error: Schema.String },
})
export type RelatedState = typeof RelatedState.Type

export const Selection = Schema.Struct({
  selectionId: Schema.Number,
  issueId: Schema.Number,
  detail: DetailState,
  comments: CommentsState,
  ownComments: Schema.Array(OwnComment),
  labels: LabelsState,
  labelsVersion: Schema.Number,
  labelOperations: Schema.Array(LabelOperation),
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

export const Model = Schema.Struct({
  user: Schema.String,
  filter: Filter,
  list: ListState,
  listOperations: Schema.Array(ListOperation),
  maybeRowError: Schema.Option(Schema.String),
  maybeSelection: Schema.Option(Selection),
  nextId: Schema.Number,
})
export type Model = typeof Model.Type

// MESSAGE

export const Message = defineMessageUnion({
  UpdatedUser: { value: Schema.String },
  ClickedFilter: { filter: Filter },
  ClickedIssue: { issueId: Schema.Number },
  ClickedRetryDetail: {},
  ClickedAssign: {},
  UpdatedTitleInput: { value: Schema.String },
  ClickedRename: {},
  ClickedClose: {},
  UpdatedCommentInput: { value: Schema.String },
  ClickedPost: {},
  UpdatedLabelInput: { value: Schema.String },
  ClickedAddLabel: {},
  ClickedRemoveLabel: { label: Schema.String },
  ClickedRowAssign: { issueId: Schema.Number },
  ClickedRowClose: { issueId: Schema.Number },
  ClickedRelatedHit: { hitId: Schema.Number },
  SucceededFetchIssues: {
    requestId: Schema.Number,
    issues: Schema.Array(Issue),
  },
  FailedFetchIssues: { requestId: Schema.Number, error: Schema.String },
  SucceededFetchIssue: {
    requestId: Schema.Number,
    maybeDetail: Schema.Option(IssueDetail),
  },
  FailedFetchIssue: { requestId: Schema.Number, error: Schema.String },
  SucceededFetchComments: {
    selectionId: Schema.Number,
    comments: Schema.Array(Comment),
  },
  FailedFetchComments: { selectionId: Schema.Number, error: Schema.String },
  SucceededFetchLabels: {
    selectionId: Schema.Number,
    labels: Schema.Array(Schema.String),
  },
  FailedFetchLabels: { selectionId: Schema.Number, error: Schema.String },
  SucceededSearchRelated: {
    requestId: Schema.Number,
    hits: Schema.Array(Hit),
  },
  FailedSearchRelated: { requestId: Schema.Number, error: Schema.String },
  SucceededAssign: { operationId: Schema.Number, assignee: Schema.String },
  FailedAssign: { operationId: Schema.Number, error: Schema.String },
  SucceededRenameIssue: { operationId: Schema.Number, title: Schema.String },
  FailedRenameIssue: { operationId: Schema.Number, error: Schema.String },
  SucceededCloseIssue: { operationId: Schema.Number },
  FailedCloseIssue: { operationId: Schema.Number, error: Schema.String },
  SucceededAddComment: { operationId: Schema.Number, comment: Comment },
  FailedAddComment: { operationId: Schema.Number, error: Schema.String },
  SucceededAddLabel: {
    operationId: Schema.Number,
    labels: Schema.Array(Schema.String),
  },
  FailedAddLabel: { operationId: Schema.Number, error: Schema.String },
  SucceededRemoveLabel: {
    operationId: Schema.Number,
    labels: Schema.Array(Schema.String),
  },
  FailedRemoveLabel: { operationId: Schema.Number, error: Schema.String },
})
export type Message = typeof Message.Type

// OUT MESSAGE

export const OutMessage = defineTaggedUnion({
  OpenedRelatedHit: {
    query: Schema.String,
    hits: Schema.Array(Hit),
    hitId: Schema.Number,
  },
})
export type OutMessage = typeof OutMessage.Type

// COMMAND

const FetchIssues = Command.define('FetchIssues', {
  args: { requestId: Schema.Number, filter: Filter },
  messages: [Message.SucceededFetchIssues, Message.FailedFetchIssues],
  execute: ({ requestId, filter }) =>
    callApi(() => Api.fetchIssues(filter)).pipe(
      Effect.map(issues =>
        Message.SucceededFetchIssues({
          requestId,
          issues: Array.map(issues, issue => ({
            id: issue.id,
            title: issue.title,
            maybeAssignee: Option.fromNullishOr(issue.assignee),
          })),
        }),
      ),
      Effect.catch(error =>
        Effect.succeed(Message.FailedFetchIssues({ requestId, error })),
      ),
    ),
})

const FetchIssue = Command.define('FetchIssue', {
  args: { requestId: Schema.Number, issueId: Schema.Number },
  messages: [Message.SucceededFetchIssue, Message.FailedFetchIssue],
  execute: ({ requestId, issueId }) =>
    callApi(() => Api.fetchIssue(issueId)).pipe(
      Effect.map(detail =>
        Message.SucceededFetchIssue({
          requestId,
          maybeDetail: Option.map(Option.fromNullishOr(detail), found => ({
            id: found.id,
            title: found.title,
            body: found.body,
          })),
        }),
      ),
      Effect.catch(error =>
        Effect.succeed(Message.FailedFetchIssue({ requestId, error })),
      ),
    ),
})

const FetchComments = Command.define('FetchComments', {
  args: { selectionId: Schema.Number, issueId: Schema.Number },
  messages: [Message.SucceededFetchComments, Message.FailedFetchComments],
  execute: ({ selectionId, issueId }) =>
    callApi(() => Api.fetchComments(issueId)).pipe(
      Effect.map(comments =>
        Message.SucceededFetchComments({ selectionId, comments }),
      ),
      Effect.catch(error =>
        Effect.succeed(Message.FailedFetchComments({ selectionId, error })),
      ),
    ),
})

const FetchLabels = Command.define('FetchLabels', {
  args: { selectionId: Schema.Number, issueId: Schema.Number },
  messages: [Message.SucceededFetchLabels, Message.FailedFetchLabels],
  execute: ({ selectionId, issueId }) =>
    callApi(() => Api.fetchLabels(issueId)).pipe(
      Effect.map(labels =>
        Message.SucceededFetchLabels({ selectionId, labels }),
      ),
      Effect.catch(error =>
        Effect.succeed(Message.FailedFetchLabels({ selectionId, error })),
      ),
    ),
})

const SearchRelated = Command.define('SearchRelated', {
  args: { requestId: Schema.Number, query: Schema.String },
  messages: [Message.SucceededSearchRelated, Message.FailedSearchRelated],
  execute: ({ requestId, query }) =>
    callApi(() => Api.search(query)).pipe(
      Effect.map(hits => Message.SucceededSearchRelated({ requestId, hits })),
      Effect.catch(error =>
        Effect.succeed(Message.FailedSearchRelated({ requestId, error })),
      ),
    ),
})

const Assign = Command.define('Assign', {
  args: {
    operationId: Schema.Number,
    issueId: Schema.Number,
    user: Schema.String,
  },
  messages: [Message.SucceededAssign, Message.FailedAssign],
  execute: ({ operationId, issueId, user }) =>
    callApi(() => Api.assign(issueId, user)).pipe(
      Effect.map(answer =>
        Message.SucceededAssign({ operationId, assignee: answer.assignee }),
      ),
      Effect.catch(error =>
        Effect.succeed(Message.FailedAssign({ operationId, error })),
      ),
    ),
})

const RenameIssue = Command.define('RenameIssue', {
  args: {
    operationId: Schema.Number,
    issueId: Schema.Number,
    title: Schema.String,
  },
  messages: [Message.SucceededRenameIssue, Message.FailedRenameIssue],
  execute: ({ operationId, issueId, title }) =>
    callApi(() => Api.renameIssue(issueId, title)).pipe(
      Effect.map(answer =>
        Message.SucceededRenameIssue({ operationId, title: answer.title }),
      ),
      Effect.catch(error =>
        Effect.succeed(Message.FailedRenameIssue({ operationId, error })),
      ),
    ),
})

const CloseIssue = Command.define('CloseIssue', {
  args: { operationId: Schema.Number, issueId: Schema.Number },
  messages: [Message.SucceededCloseIssue, Message.FailedCloseIssue],
  execute: ({ operationId, issueId }) =>
    callApi(() => Api.closeIssue(issueId)).pipe(
      Effect.as(Message.SucceededCloseIssue({ operationId })),
      Effect.catch(error =>
        Effect.succeed(Message.FailedCloseIssue({ operationId, error })),
      ),
    ),
})

const AddComment = Command.define('AddComment', {
  args: {
    operationId: Schema.Number,
    issueId: Schema.Number,
    author: Schema.String,
    text: Schema.String,
  },
  messages: [Message.SucceededAddComment, Message.FailedAddComment],
  execute: ({ operationId, issueId, author, text }) =>
    callApi(() => Api.addComment(issueId, author, text)).pipe(
      Effect.map(comment =>
        Message.SucceededAddComment({ operationId, comment }),
      ),
      Effect.catch(error =>
        Effect.succeed(Message.FailedAddComment({ operationId, error })),
      ),
    ),
})

const AddLabel = Command.define('AddLabel', {
  args: {
    operationId: Schema.Number,
    issueId: Schema.Number,
    label: Schema.String,
  },
  messages: [Message.SucceededAddLabel, Message.FailedAddLabel],
  execute: ({ operationId, issueId, label }) =>
    callApi(() => Api.addLabel(issueId, label)).pipe(
      Effect.map(labels => Message.SucceededAddLabel({ operationId, labels })),
      Effect.catch(error =>
        Effect.succeed(Message.FailedAddLabel({ operationId, error })),
      ),
    ),
})

const RemoveLabel = Command.define('RemoveLabel', {
  args: {
    operationId: Schema.Number,
    issueId: Schema.Number,
    label: Schema.String,
  },
  messages: [Message.SucceededRemoveLabel, Message.FailedRemoveLabel],
  execute: ({ operationId, issueId, label }) =>
    callApi(() => Api.removeLabel(issueId, label)).pipe(
      Effect.map(labels =>
        Message.SucceededRemoveLabel({ operationId, labels }),
      ),
      Effect.catch(error =>
        Effect.succeed(Message.FailedRemoveLabel({ operationId, error })),
      ),
    ),
})

// INIT

export const init = (): Update.Return<Model, Message> => ({
  model: {
    user: 'guest',
    filter: 'open',
    list: ListState.ListLoading({ requestId: 0 }),
    listOperations: [],
    maybeRowError: Option.none(),
    maybeSelection: Option.none(),
    nextId: 1,
  },
  commands: [FetchIssues({ requestId: 0, filter: 'open' })],
})

const initSelection = (selectionId: number, issueId: number): Selection => ({
  selectionId,
  issueId,
  detail: DetailState.DetailLoading({ requestId: selectionId }),
  comments: CommentsState.CommentsLoading(),
  ownComments: [],
  labels: LabelsState.LabelsLoading(),
  labelsVersion: selectionId,
  labelOperations: [],
  related: RelatedState.RelatedIdle(),
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

const operationIssueId = (operation: ListOperation): number =>
  operation.issueId

const isClosing = (
  operations: ReadonlyArray<ListOperation>,
  issueId: number,
): boolean =>
  Array.some(
    operations,
    operation =>
      operation._tag === 'PendingClose' && operation.issueId === issueId,
  )

const applyListOperation = (issue: Issue, operation: ListOperation): Issue =>
  operationIssueId(operation) !== issue.id
    ? issue
    : ListOperation.match(operation, {
        PendingAssign: ({ assignee }) =>
          modifyFields(issue, { maybeAssignee: () => Option.some(assignee) }),
        PendingRename: ({ title }) =>
          modifyFields(issue, { title: () => title }),
        PendingClose: () => issue,
      })

const displayedIssues = (
  model: Model,
  issues: ReadonlyArray<Issue>,
): ReadonlyArray<Issue> =>
  pipe(
    issues,
    Array.filter(
      issue =>
        model.filter !== 'open' || !isClosing(model.listOperations, issue.id),
    ),
    Array.map(issue =>
      Array.reduce(model.listOperations, issue, applyListOperation),
    ),
  )

export const maybeOpenCount = (model: Model): Option.Option<number> =>
  model.filter !== 'open'
    ? Option.none()
    : ListState.match(model.list, {
        ListLoading: () => Option.none(),
        ListFailed: () => Option.none(),
        ListLoaded: ({ issues }) =>
          Option.some(displayedIssues(model, issues).length),
      })

export const countedCloseOperationIds = (
  model: Model,
): ReadonlyArray<number> => {
  const loadedIssues: ReadonlyArray<Issue> =
    model.filter === 'open' && model.list._tag === 'ListLoaded'
      ? model.list.issues
      : []
  return pipe(
    model.listOperations,
    Array.filter(
      operation =>
        operation._tag === 'PendingClose' &&
        Array.some(loadedIssues, issue => issue.id === operation.issueId),
    ),
    Array.map(operation => operation.operationId),
  )
}

const displayedTitle = (model: Model, detail: IssueDetail): string =>
  Array.reduce(model.listOperations, detail.title, (title, operation) =>
    operation._tag === 'PendingRename' && operation.issueId === detail.id
      ? operation.title
      : title,
  )

const baseLabels = (labels: LabelsState): ReadonlyArray<string> =>
  LabelsState.match<ReadonlyArray<string>>(labels, {
    LabelsLoading: () => [],
    LabelsFailed: () => [],
    LabelsLoaded: ({ labels: loaded }) => loaded,
  })

export const displayedLabels = (
  selection: Selection,
): ReadonlyArray<string> =>
  Array.reduce(
    selection.labelOperations,
    baseLabels(selection.labels),
    (current, operation) =>
      LabelOperation.match<ReadonlyArray<string>>(operation, {
        PendingAddLabel: ({ label }) =>
          Array.contains(current, label)
            ? current
            : Array.append(current, label),
        PendingRemoveLabel: ({ label }) =>
          Array.filter(current, existing => existing !== label),
      }),
  )

// UPDATE

type UpdateReturn = Update.ReturnWithOutMessage<Model, Message, OutMessage>

const withSelection = (
  model: Model,
  f: (selection: Selection) => UpdateReturn,
): UpdateReturn =>
  Option.match(model.maybeSelection, {
    onNone: () => ({ model }),
    onSome: f,
  })

const writeSelection = (model: Model, selection: Selection): Model =>
  modifyFields(model, { maybeSelection: () => Option.some(selection) })

const modifyMatchingSelection = (
  model: Model,
  isMatch: (selection: Selection) => boolean,
  f: (selection: Selection) => Selection,
): Model =>
  modifyFields(model, {
    maybeSelection: Option.map(selection =>
      isMatch(selection) ? f(selection) : selection,
    ),
  })

const findListOperation = (
  model: Model,
  operationId: number,
): Option.Option<ListOperation> =>
  Array.findFirst(
    model.listOperations,
    operation => operation.operationId === operationId,
  )

const withoutListOperation = (model: Model, operationId: number): Model =>
  modifyFields(model, {
    listOperations: Array.filter(
      operation => operation.operationId !== operationId,
    ),
  })

const modifyLoadedIssues = (
  model: Model,
  f: (issues: ReadonlyArray<Issue>) => ReadonlyArray<Issue>,
): Model =>
  modifyFields(model, {
    list: list =>
      ListState.match(list, {
        ListLoading: () => list,
        ListFailed: () => list,
        ListLoaded: ({ issues }) => ListState.ListLoaded({ issues: f(issues) }),
      }),
  })

const modifyIssue = (
  model: Model,
  issueId: number,
  f: (issue: Issue) => Issue,
): Model =>
  modifyLoadedIssues(model, issues =>
    Array.map(issues, issue => (issue.id === issueId ? f(issue) : issue)),
  )

const recordOriginError = (
  model: Model,
  origin: ActionOrigin,
  error: string,
  writeDetailError: (selection: Selection) => Selection,
): Model =>
  ActionOrigin.match(origin, {
    FromRow: () =>
      modifyFields(model, {
        maybeRowError: () => Option.some(`row error: ${error}`),
      }),
    FromDetail: ({ selectionId }) =>
      modifyMatchingSelection(
        model,
        selection => selection.selectionId === selectionId,
        writeDetailError,
      ),
  })

const startAssign = (
  model: Model,
  issueId: number,
  origin: ActionOrigin,
): UpdateReturn => {
  const operationId = model.nextId
  return {
    model: modifyFields(model, {
      nextId: nextId => nextId + 1,
      listOperations: Array.append(
        ListOperation.PendingAssign({
          operationId,
          issueId,
          assignee: model.user,
          origin,
        }),
      ),
    }),
    commands: [Assign({ operationId, issueId, user: model.user })],
  }
}

const startClose = (
  model: Model,
  issueId: number,
  origin: ActionOrigin,
): UpdateReturn => {
  const operationId = model.nextId
  return {
    model: modifyFields(model, {
      nextId: nextId => nextId + 1,
      listOperations: Array.append(
        ListOperation.PendingClose({ operationId, issueId, origin }),
      ),
    }),
    commands: [CloseIssue({ operationId, issueId })],
  }
}

const findLabelOperation = (
  selection: Selection,
  operationId: number,
): boolean =>
  Array.some(
    selection.labelOperations,
    operation => operation.operationId === operationId,
  )

const settleLabelOperation = (
  model: Model,
  operationId: number,
  settle: (selection: Selection) => Selection,
): UpdateReturn => ({
  model: modifyMatchingSelection(
    model,
    selection => findLabelOperation(selection, operationId),
    selection =>
      settle(
        modifyFields(selection, {
          labelOperations: Array.filter(
            operation => operation.operationId !== operationId,
          ),
        }),
      ),
  ),
})

const acceptLabels = (
  operationId: number,
  labels: ReadonlyArray<string>,
): ((selection: Selection) => Selection) => selection =>
  operationId > selection.labelsVersion
    ? modifyFields(selection, {
        labels: () => LabelsState.LabelsLoaded({ labels }),
        labelsVersion: () => operationId,
      })
    : selection

const rejectLabelChange =
  (error: string): ((selection: Selection) => Selection) =>
  selection =>
    modifyFields(selection, {
      maybeLabelError: () => Option.some(`label error: ${error}`),
    })

const isOwnComment = (selection: Selection, operationId: number): boolean =>
  Array.some(
    selection.ownComments,
    ownComment => ownComment.operationId === operationId,
  )

const shouldSearchRelated = (related: RelatedState, title: string): boolean =>
  RelatedState.match(related, {
    RelatedIdle: () => true,
    RelatedSearching: ({ query }) => query !== title,
    RelatedFound: ({ query }) => query !== title,
    RelatedFailed: () => true,
  })

export const update = (model: Model, message: Message): UpdateReturn =>
  Message.match<UpdateReturn>(message, {
    UpdatedUser: ({ value }) => ({
      model: modifyFields(model, { user: () => value }),
    }),

    ClickedFilter: ({ filter }) => {
      if (filter === model.filter) {
        return { model }
      }
      const requestId = model.nextId
      return {
        model: modifyFields(model, {
          nextId: nextId => nextId + 1,
          filter: () => filter,
          list: () => ListState.ListLoading({ requestId }),
        }),
        commands: [FetchIssues({ requestId, filter })],
      }
    },

    SucceededFetchIssues: ({ requestId, issues }) => ({
      model: modifyFields(model, {
        list: list =>
          list._tag === 'ListLoading' && list.requestId === requestId
            ? ListState.ListLoaded({ issues })
            : list,
      }),
    }),

    FailedFetchIssues: ({ requestId, error }) => ({
      model: modifyFields(model, {
        list: list =>
          list._tag === 'ListLoading' && list.requestId === requestId
            ? ListState.ListFailed({ error })
            : list,
      }),
    }),

    ClickedIssue: ({ issueId }) => {
      const isAlreadySelected = Option.exists(
        model.maybeSelection,
        selection => selection.issueId === issueId,
      )
      if (isAlreadySelected) {
        return { model }
      }
      const selectionId = model.nextId
      return {
        model: modifyFields(model, {
          nextId: nextId => nextId + 1,
          maybeSelection: () =>
            Option.some(initSelection(selectionId, issueId)),
        }),
        commands: [
          FetchIssue({ requestId: selectionId, issueId }),
          FetchComments({ selectionId, issueId }),
          FetchLabels({ selectionId, issueId }),
        ],
      }
    },

    ClickedRetryDetail: () =>
      withSelection(model, selection => {
        const requestId = model.nextId
        return {
          model: writeSelection(
            modifyFields(model, { nextId: nextId => nextId + 1 }),
            modifyFields(selection, {
              detail: () => DetailState.DetailLoading({ requestId }),
            }),
          ),
          commands: [FetchIssue({ requestId, issueId: selection.issueId })],
        }
      }),

    SucceededFetchIssue: ({ requestId, maybeDetail }) =>
      withSelection(model, selection => {
        const isAwaited =
          selection.detail._tag === 'DetailLoading' &&
          selection.detail.requestId === requestId
        if (!isAwaited) {
          return { model }
        }
        return Option.match(maybeDetail, {
          onNone: () => ({
            model: writeSelection(
              model,
              modifyFields(selection, {
                detail: () => DetailState.DetailNotFound(),
              }),
            ),
          }),
          onSome: detail => {
            const loadedSelection = modifyFields(selection, {
              detail: () => DetailState.DetailLoaded({ detail }),
            })
            if (!shouldSearchRelated(selection.related, detail.title)) {
              return { model: writeSelection(model, loadedSelection) }
            }
            const relatedRequestId = model.nextId
            return {
              model: writeSelection(
                modifyFields(model, { nextId: nextId => nextId + 1 }),
                modifyFields(loadedSelection, {
                  related: () =>
                    RelatedState.RelatedSearching({
                      requestId: relatedRequestId,
                      query: detail.title,
                    }),
                }),
              ),
              commands: [
                SearchRelated({
                  requestId: relatedRequestId,
                  query: detail.title,
                }),
              ],
            }
          },
        })
      }),

    FailedFetchIssue: ({ requestId, error }) => ({
      model: modifyMatchingSelection(
        model,
        selection =>
          selection.detail._tag === 'DetailLoading' &&
          selection.detail.requestId === requestId,
        selection =>
          modifyFields(selection, {
            detail: () => DetailState.DetailFailed({ error }),
          }),
      ),
    }),

    SucceededSearchRelated: ({ requestId, hits }) => ({
      model: modifyMatchingSelection(
        model,
        selection =>
          selection.related._tag === 'RelatedSearching' &&
          selection.related.requestId === requestId,
        selection =>
          modifyFields(selection, {
            related: related =>
              RelatedState.RelatedFound({
                query:
                  related._tag === 'RelatedSearching' ? related.query : '',
                hits,
              }),
          }),
      ),
    }),

    FailedSearchRelated: ({ requestId, error }) => ({
      model: modifyMatchingSelection(
        model,
        selection =>
          selection.related._tag === 'RelatedSearching' &&
          selection.related.requestId === requestId,
        selection =>
          modifyFields(selection, {
            related: related =>
              RelatedState.RelatedFailed({
                query:
                  related._tag === 'RelatedSearching' ? related.query : '',
                error,
              }),
          }),
      ),
    }),

    SucceededFetchComments: ({ selectionId, comments }) => ({
      model: modifyMatchingSelection(
        model,
        selection => selection.selectionId === selectionId,
        selection =>
          modifyFields(selection, {
            comments: () => CommentsState.CommentsLoaded({ comments }),
          }),
      ),
    }),

    FailedFetchComments: ({ selectionId, error }) => ({
      model: modifyMatchingSelection(
        model,
        selection => selection.selectionId === selectionId,
        selection =>
          modifyFields(selection, {
            comments: () => CommentsState.CommentsFailed({ error }),
          }),
      ),
    }),

    SucceededFetchLabels: ({ selectionId, labels }) => ({
      model: modifyMatchingSelection(
        model,
        selection =>
          selection.selectionId === selectionId &&
          selection.labelsVersion === selectionId,
        selection =>
          modifyFields(selection, {
            labels: () => LabelsState.LabelsLoaded({ labels }),
          }),
      ),
    }),

    FailedFetchLabels: ({ selectionId, error }) => ({
      model: modifyMatchingSelection(
        model,
        selection =>
          selection.selectionId === selectionId &&
          selection.labelsVersion === selectionId,
        selection =>
          modifyFields(selection, {
            labels: () => LabelsState.LabelsFailed({ error }),
          }),
      ),
    }),

    ClickedAssign: () =>
      withSelection(model, selection =>
        startAssign(
          writeSelection(
            model,
            modifyFields(selection, { maybeAssignError: () => Option.none() }),
          ),
          selection.issueId,
          ActionOrigin.FromDetail({ selectionId: selection.selectionId }),
        ),
      ),

    ClickedRowAssign: ({ issueId }) =>
      startAssign(
        modifyFields(model, { maybeRowError: () => Option.none() }),
        issueId,
        ActionOrigin.FromRow(),
      ),

    SucceededAssign: ({ operationId, assignee }) =>
      Option.match(findListOperation(model, operationId), {
        onNone: () => ({ model }),
        onSome: operation => ({
          model: modifyIssue(
            withoutListOperation(model, operationId),
            operation.issueId,
            issue =>
              modifyFields(issue, {
                maybeAssignee: () => Option.some(assignee),
              }),
          ),
        }),
      }),

    FailedAssign: ({ operationId, error }) =>
      Option.match(findListOperation(model, operationId), {
        onNone: () => ({ model }),
        onSome: operation => ({
          model:
            operation._tag === 'PendingAssign'
              ? recordOriginError(
                  withoutListOperation(model, operationId),
                  operation.origin,
                  error,
                  selection =>
                    modifyFields(selection, {
                      maybeAssignError: () => Option.some(error),
                    }),
                )
              : withoutListOperation(model, operationId),
        }),
      }),

    UpdatedTitleInput: ({ value }) => ({
      model: modifyMatchingSelection(
        model,
        () => true,
        selection => modifyFields(selection, { titleInput: () => value }),
      ),
    }),

    ClickedRename: () =>
      withSelection(model, selection => {
        const title = selection.titleInput
        if (String.isEmpty(String.trim(title))) {
          return { model }
        }
        const operationId = model.nextId
        return {
          model: modifyFields(
            writeSelection(
              model,
              modifyFields(selection, {
                maybeRenameError: () => Option.none(),
              }),
            ),
            {
              nextId: nextId => nextId + 1,
              listOperations: Array.append(
                ListOperation.PendingRename({
                  operationId,
                  issueId: selection.issueId,
                  title,
                  selectionId: selection.selectionId,
                }),
              ),
            },
          ),
          commands: [
            RenameIssue({ operationId, issueId: selection.issueId, title }),
          ],
        }
      }),

    SucceededRenameIssue: ({ operationId, title }) =>
      Option.match(findListOperation(model, operationId), {
        onNone: () => ({ model }),
        onSome: operation => ({
          model: modifyMatchingSelection(
            modifyIssue(
              withoutListOperation(model, operationId),
              operation.issueId,
              issue => modifyFields(issue, { title: () => title }),
            ),
            selection =>
              selection.issueId === operation.issueId &&
              selection.detail._tag === 'DetailLoaded',
            selection =>
              modifyFields(selection, {
                detail: detail =>
                  detail._tag === 'DetailLoaded'
                    ? DetailState.DetailLoaded({
                        detail: modifyFields(detail.detail, {
                          title: () => title,
                        }),
                      })
                    : detail,
              }),
          ),
        }),
      }),

    FailedRenameIssue: ({ operationId, error }) =>
      Option.match(findListOperation(model, operationId), {
        onNone: () => ({ model }),
        onSome: operation => ({
          model: modifyMatchingSelection(
            withoutListOperation(model, operationId),
            selection =>
              operation._tag === 'PendingRename' &&
              selection.selectionId === operation.selectionId,
            selection =>
              modifyFields(selection, {
                maybeRenameError: () =>
                  Option.some(`rename error: ${error}`),
              }),
          ),
        }),
      }),

    ClickedClose: () =>
      withSelection(model, selection =>
        startClose(
          writeSelection(
            model,
            modifyFields(selection, { maybeCloseError: () => Option.none() }),
          ),
          selection.issueId,
          ActionOrigin.FromDetail({ selectionId: selection.selectionId }),
        ),
      ),

    ClickedRowClose: ({ issueId }) =>
      startClose(
        modifyFields(model, { maybeRowError: () => Option.none() }),
        issueId,
        ActionOrigin.FromRow(),
      ),

    SucceededCloseIssue: ({ operationId }) =>
      Option.match(findListOperation(model, operationId), {
        onNone: () => ({ model }),
        onSome: operation => {
          const settledModel = withoutListOperation(model, operationId)
          return {
            model:
              model.filter === 'open'
                ? modifyLoadedIssues(settledModel, issues =>
                    Array.filter(
                      issues,
                      issue => issue.id !== operation.issueId,
                    ),
                  )
                : settledModel,
          }
        },
      }),

    FailedCloseIssue: ({ operationId, error }) =>
      Option.match(findListOperation(model, operationId), {
        onNone: () => ({ model }),
        onSome: operation => ({
          model:
            operation._tag === 'PendingClose'
              ? recordOriginError(
                  withoutListOperation(model, operationId),
                  operation.origin,
                  error,
                  selection =>
                    modifyFields(selection, {
                      maybeCloseError: () =>
                        Option.some(`close error: ${error}`),
                    }),
                )
              : withoutListOperation(model, operationId),
        }),
      }),

    UpdatedCommentInput: ({ value }) => ({
      model: modifyMatchingSelection(
        model,
        () => true,
        selection => modifyFields(selection, { commentInput: () => value }),
      ),
    }),

    ClickedPost: () =>
      withSelection(model, selection => {
        const text = selection.commentInput
        if (String.isEmpty(String.trim(text))) {
          return { model }
        }
        const operationId = model.nextId
        const comment = { author: model.user, text }
        return {
          model: writeSelection(
            modifyFields(model, { nextId: nextId => nextId + 1 }),
            modifyFields(selection, {
              commentInput: () => '',
              maybePostError: () => Option.none(),
              ownComments: Array.append(
                OwnComment.SendingComment({ operationId, comment }),
              ),
            }),
          ),
          commands: [
            AddComment({
              operationId,
              issueId: selection.issueId,
              author: comment.author,
              text,
            }),
          ],
        }
      }),

    SucceededAddComment: ({ operationId, comment }) => ({
      model: modifyMatchingSelection(
        model,
        selection => isOwnComment(selection, operationId),
        selection =>
          modifyFields(selection, {
            ownComments: Array.map(ownComment =>
              ownComment.operationId === operationId
                ? OwnComment.SentComment({ operationId, comment })
                : ownComment,
            ),
          }),
      ),
    }),

    FailedAddComment: ({ operationId, error }) => ({
      model: modifyMatchingSelection(
        model,
        selection => isOwnComment(selection, operationId),
        selection =>
          modifyFields(selection, {
            ownComments: Array.filter(
              ownComment => ownComment.operationId !== operationId,
            ),
            maybePostError: () => Option.some(`post error: ${error}`),
          }),
      ),
    }),

    UpdatedLabelInput: ({ value }) => ({
      model: modifyMatchingSelection(
        model,
        () => true,
        selection => modifyFields(selection, { labelInput: () => value }),
      ),
    }),

    ClickedAddLabel: () =>
      withSelection(model, selection => {
        const label = String.trim(selection.labelInput)
        const isUnusable =
          String.isEmpty(label) ||
          Array.contains(displayedLabels(selection), label)
        if (isUnusable) {
          return { model }
        }
        const operationId = model.nextId
        return {
          model: writeSelection(
            modifyFields(model, { nextId: nextId => nextId + 1 }),
            modifyFields(selection, {
              labelInput: () => '',
              maybeLabelError: () => Option.none(),
              labelOperations: Array.append(
                LabelOperation.PendingAddLabel({ operationId, label }),
              ),
            }),
          ),
          commands: [
            AddLabel({ operationId, issueId: selection.issueId, label }),
          ],
        }
      }),

    ClickedRemoveLabel: ({ label }) =>
      withSelection(model, selection => {
        const operationId = model.nextId
        return {
          model: writeSelection(
            modifyFields(model, { nextId: nextId => nextId + 1 }),
            modifyFields(selection, {
              maybeLabelError: () => Option.none(),
              labelOperations: Array.append(
                LabelOperation.PendingRemoveLabel({ operationId, label }),
              ),
            }),
          ),
          commands: [
            RemoveLabel({ operationId, issueId: selection.issueId, label }),
          ],
        }
      }),

    SucceededAddLabel: ({ operationId, labels }) =>
      settleLabelOperation(
        model,
        operationId,
        acceptLabels(operationId, labels),
      ),

    FailedAddLabel: ({ operationId, error }) =>
      settleLabelOperation(model, operationId, rejectLabelChange(error)),

    SucceededRemoveLabel: ({ operationId, labels }) =>
      settleLabelOperation(
        model,
        operationId,
        acceptLabels(operationId, labels),
      ),

    FailedRemoveLabel: ({ operationId, error }) =>
      settleLabelOperation(model, operationId, rejectLabelChange(error)),

    ClickedRelatedHit: ({ hitId }) =>
      withSelection(model, selection =>
        RelatedState.match(selection.related, {
          RelatedIdle: () => ({ model }),
          RelatedSearching: () => ({ model }),
          RelatedFailed: () => ({ model }),
          RelatedFound: ({ query, hits }) => ({
            model,
            outMessage: OutMessage.OpenedRelatedHit({ query, hits, hitId }),
          }),
        }),
      ),
  })

// VIEW

const RELATED_HIT_LIMIT = 3

const testId = (h: HtmlBuilder<Message>, id: string) =>
  h.DataAttribute('testid', id)

const errorLine = (
  h: HtmlBuilder<Message>,
  id: string,
  maybeError: Option.Option<string>,
): Html =>
  Option.match(maybeError, {
    onNone: () => h.empty,
    onSome: error =>
      h.p([testId(h, id), h.Class('error'), h.Role('alert')], [error]),
  })

const assigneeText = (issue: Issue): string =>
  Option.getOrElse(issue.maybeAssignee, () => 'unassigned')

const issueRowView = (
  model: Model,
  issue: Issue,
  isSelected: boolean,
  h: HtmlBuilder<Message>,
): Html =>
  h.keyed('li')(
    `${issue.id}`,
    [h.Class(isSelected ? 'issue-row selected' : 'issue-row')],
    [
      h.button(
        [
          testId(h, 'issue'),
          h.Type('button'),
          h.Class('issue'),
          h.AriaPressed(isSelected ? 'true' : 'false'),
          h.OnClick(Message.ClickedIssue({ issueId: issue.id })),
        ],
        [`#${issue.id} ${issue.title} (${assigneeText(issue)})`],
      ),
      h.button(
        [
          testId(h, 'row-assign'),
          h.Type('button'),
          h.OnClick(Message.ClickedRowAssign({ issueId: issue.id })),
        ],
        [`assign to ${model.user}`],
      ),
      model.filter === 'open'
        ? h.button(
            [
              testId(h, 'row-close'),
              h.Type('button'),
              h.OnClick(Message.ClickedRowClose({ issueId: issue.id })),
            ],
            ['close'],
          )
        : h.empty,
    ],
  )

const listView = (model: Model, h: HtmlBuilder<Message>): Html =>
  h.section(
    [testId(h, 'list'), h.Class('list'), h.AriaLive('polite')],
    [
      ListState.match(model.list, {
        ListLoading: () =>
          h.p([h.Class('status')], [`loading ${model.filter} issues`]),
        ListFailed: ({ error }) =>
          h.p([h.Class('error')], [`list error: ${error}`]),
        ListLoaded: ({ issues }) =>
          h.ul(
            [h.Class('issues')],
            Array.map(displayedIssues(model, issues), issue =>
              issueRowView(
                model,
                issue,
                Option.exists(
                  model.maybeSelection,
                  selection => selection.issueId === issue.id,
                ),
                h,
              ),
            ),
          ),
      }),
    ],
  )

const detailHeaderView = (
  model: Model,
  selection: Selection,
  h: HtmlBuilder<Message>,
): Html =>
  DetailState.match(selection.detail, {
    DetailLoading: () =>
      h.p([h.Class('status')], [`loading #${selection.issueId}`]),
    DetailNotFound: () =>
      h.p(
        [h.Class('error')],
        [`detail error: issue #${selection.issueId} not found`],
      ),
    DetailFailed: ({ error }) =>
      h.p([h.Class('error')], [`detail error: ${error}`]),
    DetailLoaded: ({ detail }) =>
      h.div(
        [],
        [
          h.h2(
            [testId(h, 'heading')],
            [`#${detail.id} ${displayedTitle(model, detail)}`],
          ),
          h.p([testId(h, 'body'), h.Class('body')], [detail.body]),
        ],
      ),
  })

const commentText = (comment: Comment): string =>
  `${comment.author}: ${comment.text}`

const commentRow = (
  key: string,
  text: string,
  h: HtmlBuilder<Message>,
): Html => h.keyed('li')(key, [testId(h, 'comment')], [text])

const ownCommentRow = (ownComment: OwnComment, h: HtmlBuilder<Message>): Html =>
  OwnComment.match(ownComment, {
    SendingComment: ({ operationId, comment }) =>
      commentRow(
        `own-${operationId}`,
        `${commentText(comment)} (sending…)`,
        h,
      ),
    SentComment: ({ operationId, comment }) =>
      commentRow(`own-${operationId}`, commentText(comment), h),
  })

const commentsView = (selection: Selection, h: HtmlBuilder<Message>): Html =>
  h.section(
    [testId(h, 'comments'), h.Class('comments')],
    [
      h.h3([], ['Comments']),
      CommentsState.match(selection.comments, {
        CommentsLoading: () => h.p([h.Class('status')], ['loading comments']),
        CommentsFailed: ({ error }) =>
          h.p([h.Class('error')], [`comments error: ${error}`]),
        CommentsLoaded: () => h.empty,
      }),
      h.ul(
        [],
        [
          ...CommentsState.match(selection.comments, {
            CommentsLoading: () => [],
            CommentsFailed: () => [],
            CommentsLoaded: ({ comments }) =>
              Array.map(comments, (comment, index) =>
                commentRow(`loaded-${index}`, commentText(comment), h),
              ),
          }),
          ...Array.map(selection.ownComments, ownComment =>
            ownCommentRow(ownComment, h),
          ),
        ],
      ),
      h.div(
        [h.Class('field')],
        [
          h.input([
            testId(h, 'comment-input'),
            h.Type('text'),
            h.AriaLabel('Comment'),
            h.Placeholder('Write a comment'),
            h.Value(selection.commentInput),
            h.OnInput(value => Message.UpdatedCommentInput({ value })),
          ]),
          h.button(
            [testId(h, 'post'), h.Type('button'), h.OnClick(Message.ClickedPost())],
            ['post'],
          ),
        ],
      ),
      errorLine(h, 'post-error', selection.maybePostError),
    ],
  )

const labelsView = (selection: Selection, h: HtmlBuilder<Message>): Html =>
  h.section(
    [testId(h, 'labels'), h.Class('labels')],
    [
      h.h3([], ['Labels']),
      LabelsState.match(selection.labels, {
        LabelsLoading: () => h.p([h.Class('status')], ['loading labels']),
        LabelsFailed: ({ error }) =>
          h.p([h.Class('error')], [`labels error: ${error}`]),
        LabelsLoaded: () =>
          h.ul(
            [],
            Array.map(displayedLabels(selection), label =>
              h.keyed('li')(
                label,
                [h.Class('label-chip')],
                [
                  h.span([testId(h, 'label')], [label]),
                  h.button(
                    [
                      testId(h, 'remove-label'),
                      h.Type('button'),
                      h.OnClick(Message.ClickedRemoveLabel({ label })),
                    ],
                    [`remove ${label}`],
                  ),
                ],
              ),
            ),
          ),
      }),
      h.div(
        [h.Class('field')],
        [
          h.input([
            testId(h, 'label-input'),
            h.Type('text'),
            h.AriaLabel('Label'),
            h.Placeholder('New label'),
            h.Value(selection.labelInput),
            h.OnInput(value => Message.UpdatedLabelInput({ value })),
          ]),
          h.button(
            [
              testId(h, 'add-label'),
              h.Type('button'),
              h.OnClick(Message.ClickedAddLabel()),
            ],
            ['add label'],
          ),
        ],
      ),
      errorLine(h, 'label-error', selection.maybeLabelError),
    ],
  )

const relatedView = (selection: Selection, h: HtmlBuilder<Message>): Html =>
  selection.detail._tag !== 'DetailLoaded'
    ? h.empty
    : h.section(
        [testId(h, 'related'), h.Class('related')],
        [
          h.h3([], ['Related help']),
          RelatedState.match(selection.related, {
            RelatedIdle: () =>
              h.p([h.Class('status')], ['finding related help']),
            RelatedSearching: () =>
              h.p([h.Class('status')], ['finding related help']),
            RelatedFailed: ({ error }) =>
              h.p([h.Class('error')], [`related help failed: ${error}`]),
            RelatedFound: ({ hits }) =>
              Array.match(hits, {
                onEmpty: () => h.p([], ['no related help']),
                onNonEmpty: nonEmptyHits =>
                  h.ul(
                    [],
                    Array.map(Array.take(nonEmptyHits, RELATED_HIT_LIMIT), hit =>
                      h.keyed('li')(
                        `${hit.id}`,
                        [],
                        [
                          h.button(
                            [
                              testId(h, 'related-hit'),
                              h.Type('button'),
                              h.OnClick(
                                Message.ClickedRelatedHit({ hitId: hit.id }),
                              ),
                            ],
                            [hit.name],
                          ),
                        ],
                      ),
                    ),
                  ),
              }),
          }),
        ],
      )

const selectedDetailView = (
  model: Model,
  selection: Selection,
  h: HtmlBuilder<Message>,
): ReadonlyArray<Html> => [
  detailHeaderView(model, selection, h),
  h.button(
    [
      testId(h, 'retry'),
      h.Type('button'),
      h.OnClick(Message.ClickedRetryDetail()),
    ],
    ['retry'],
  ),
  h.div(
    [h.Class('actions')],
    [
      h.button(
        [testId(h, 'assign'), h.Type('button'), h.OnClick(Message.ClickedAssign())],
        [`assign to ${model.user}`],
      ),
      h.button(
        [testId(h, 'close'), h.Type('button'), h.OnClick(Message.ClickedClose())],
        ['close'],
      ),
    ],
  ),
  errorLine(h, 'assign-error', selection.maybeAssignError),
  errorLine(h, 'close-error', selection.maybeCloseError),
  h.div(
    [h.Class('field')],
    [
      h.input([
        testId(h, 'title-input'),
        h.Type('text'),
        h.AriaLabel('New title'),
        h.Placeholder('New title'),
        h.Value(selection.titleInput),
        h.OnInput(value => Message.UpdatedTitleInput({ value })),
      ]),
      h.button(
        [testId(h, 'rename'), h.Type('button'), h.OnClick(Message.ClickedRename())],
        ['rename'],
      ),
    ],
  ),
  errorLine(h, 'rename-error', selection.maybeRenameError),
  commentsView(selection, h),
  labelsView(selection, h),
  relatedView(selection, h),
]

const detailView = (model: Model, h: HtmlBuilder<Message>): Html =>
  h.section(
    [testId(h, 'detail'), h.Class('detail')],
    Option.match(model.maybeSelection, {
      onNone: () => [h.p([h.Class('status')], ['select an issue'])],
      onSome: selection => selectedDetailView(model, selection, h),
    }),
  )

const filterButton = (
  model: Model,
  filter: Filter,
  h: HtmlBuilder<Message>,
): Html =>
  h.button(
    [
      testId(h, `filter-${filter}`),
      h.Type('button'),
      h.AriaPressed(model.filter === filter ? 'true' : 'false'),
      h.OnClick(Message.ClickedFilter({ filter })),
    ],
    [filter],
  )

export const view = Submodel.defineView<Model, Message>((model, h) =>
  h.div(
    [h.Class('issues-page')],
    [
      h.div(
        [h.Class('toolbar')],
        [
          h.label(
            [],
            [
              'Current user ',
              h.input([
                testId(h, 'user'),
                h.Type('text'),
                h.Value(model.user),
                h.OnInput(value => Message.UpdatedUser({ value })),
              ]),
            ],
          ),
          h.div(
            [h.Class('filters'), h.Role('group'), h.AriaLabel('Filter')],
            [filterButton(model, 'open', h), filterButton(model, 'closed', h)],
          ),
        ],
      ),
      Option.match(model.maybeRowError, {
        onNone: () => h.empty,
        onSome: error =>
          h.p([testId(h, 'row-error'), h.Class('error'), h.Role('alert')], [error]),
      }),
      h.div(
        [h.Class('columns')],
        [listView(model, h), detailView(model, h)],
      ),
    ],
  ),
)
