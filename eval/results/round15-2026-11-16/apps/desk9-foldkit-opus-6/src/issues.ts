import { Array, Effect, Match, Option, Schema, String, pipe } from 'effect'
import { Command, Submodel, type Update } from 'foldkit'
import { Html, HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { defineTaggedUnion } from 'foldkit/schema'
import { modifyFields } from 'foldkit/struct'

import * as Api from './domain'
import { Comment, Hit, Issue, IssueDetail, IssueFilter } from './domain'

// MODEL

export const OpStatus = defineTaggedUnion({
  Pending: {},
  Confirmed: { at: Schema.Number },
})
export type OpStatus = typeof OpStatus.Type

export const Origin = defineTaggedUnion({
  Detail: { selectionId: Schema.Number },
  Row: {},
})
export type Origin = typeof Origin.Type

export const IssueOp = defineTaggedUnion({
  Assign: {
    opId: Schema.Number,
    issueId: Schema.Number,
    assignee: Schema.String,
    origin: Origin,
    status: OpStatus,
  },
  Rename: {
    opId: Schema.Number,
    issueId: Schema.Number,
    title: Schema.String,
    origin: Origin,
    status: OpStatus,
  },
  Close: {
    opId: Schema.Number,
    issueId: Schema.Number,
    origin: Origin,
    status: OpStatus,
    wasCounted: Schema.Boolean,
  },
})
export type IssueOp = typeof IssueOp.Type

export const ListState = defineTaggedUnion({
  Loading: { requestId: Schema.Number },
  Failed: { error: Schema.String },
  Loaded: { requestId: Schema.Number, issues: Schema.Array(Issue) },
})
export type ListState = typeof ListState.Type

export const DetailState = defineTaggedUnion({
  Loading: { requestId: Schema.Number },
  Missing: {},
  Failed: { error: Schema.String },
  Loaded: { requestId: Schema.Number, issue: IssueDetail },
})
export type DetailState = typeof DetailState.Type

export const CommentsState = defineTaggedUnion({
  Loading: { requestId: Schema.Number },
  Failed: { error: Schema.String },
  Loaded: { comments: Schema.Array(Comment) },
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
  Loading: { requestId: Schema.Number },
  Failed: { error: Schema.String },
  Loaded: { labels: Schema.Array(Schema.String) },
})
export type LabelsState = typeof LabelsState.Type

export const LabelChangeKind = Schema.Literals(['Add', 'Remove'])
export type LabelChangeKind = typeof LabelChangeKind.Type

export const LabelChange = Schema.Struct({
  opId: Schema.Number,
  kind: LabelChangeKind,
  label: Schema.String,
})
export type LabelChange = typeof LabelChange.Type

export const RelatedState = defineTaggedUnion({
  Idle: {},
  Loading: { requestId: Schema.Number, title: Schema.String },
  Failed: { title: Schema.String, error: Schema.String },
  Loaded: { title: Schema.String, hits: Schema.Array(Hit) },
})
export type RelatedState = typeof RelatedState.Type

export const Selection = Schema.Struct({
  selectionId: Schema.Number,
  issueId: Schema.Number,
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

export const Model = Schema.Struct({
  nextId: Schema.Number,
  user: Schema.String,
  filter: IssueFilter,
  list: ListState,
  ops: Schema.Array(IssueOp),
  maybeRowError: Schema.Option(Schema.String),
  maybeSelection: Schema.Option(Selection),
})
export type Model = typeof Model.Type

// MESSAGE

export const Message = defineMessageUnion({
  UpdatedUser: { value: Schema.String },
  ClickedFilter: { filter: IssueFilter },
  ClickedIssue: { issueId: Schema.Number },
  ClickedRetryIssue: {},
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
    maybeIssue: Schema.Option(IssueDetail),
  },
  FailedFetchIssue: { requestId: Schema.Number, error: Schema.String },
  SucceededAssign: { opId: Schema.Number, assignee: Schema.String },
  FailedAssign: { opId: Schema.Number, error: Schema.String },
  SucceededRenameIssue: { opId: Schema.Number, title: Schema.String },
  FailedRenameIssue: { opId: Schema.Number, error: Schema.String },
  SucceededCloseIssue: { opId: Schema.Number },
  FailedCloseIssue: { opId: Schema.Number, error: Schema.String },
  SucceededFetchComments: {
    requestId: Schema.Number,
    comments: Schema.Array(Comment),
  },
  FailedFetchComments: { requestId: Schema.Number, error: Schema.String },
  SucceededAddComment: { opId: Schema.Number, comment: Comment },
  FailedAddComment: { opId: Schema.Number, error: Schema.String },
  SucceededFetchLabels: {
    requestId: Schema.Number,
    labels: Schema.Array(Schema.String),
  },
  FailedFetchLabels: { requestId: Schema.Number, error: Schema.String },
  SucceededAddLabel: {
    opId: Schema.Number,
    labels: Schema.Array(Schema.String),
  },
  FailedAddLabel: { opId: Schema.Number, error: Schema.String },
  SucceededRemoveLabel: {
    opId: Schema.Number,
    labels: Schema.Array(Schema.String),
  },
  FailedRemoveLabel: { opId: Schema.Number, error: Schema.String },
  SucceededSearchRelatedHelp: {
    requestId: Schema.Number,
    hits: Schema.Array(Hit),
  },
  FailedSearchRelatedHelp: { requestId: Schema.Number, error: Schema.String },
})
export type Message = typeof Message.Type

// OUT MESSAGE

export const OutMessage = defineMessageUnion({
  OpenedRelatedHelp: {
    query: Schema.String,
    hits: Schema.Array(Hit),
    hitId: Schema.Number,
  },
  RestoredClosedIssue: {},
})
export type OutMessage = typeof OutMessage.Type

// COMMAND

export const FetchIssues = Command.define('FetchIssues', {
  args: { requestId: Schema.Number, filter: IssueFilter },
  messages: [Message.SucceededFetchIssues, Message.FailedFetchIssues],
  execute: ({ requestId, filter }) =>
    Api.fetchIssues(filter).pipe(
      Effect.map(issues => Message.SucceededFetchIssues({ requestId, issues })),
      Effect.catch(error =>
        Effect.succeed(Message.FailedFetchIssues({ requestId, error })),
      ),
    ),
})

export const FetchIssue = Command.define('FetchIssue', {
  args: { requestId: Schema.Number, issueId: Schema.Number },
  messages: [Message.SucceededFetchIssue, Message.FailedFetchIssue],
  execute: ({ requestId, issueId }) =>
    Api.fetchIssue(issueId).pipe(
      Effect.map(answer =>
        Message.SucceededFetchIssue({
          requestId,
          maybeIssue: Option.fromNullOr(answer),
        }),
      ),
      Effect.catch(error =>
        Effect.succeed(Message.FailedFetchIssue({ requestId, error })),
      ),
    ),
})

export const Assign = Command.define('Assign', {
  args: { opId: Schema.Number, issueId: Schema.Number, user: Schema.String },
  messages: [Message.SucceededAssign, Message.FailedAssign],
  execute: ({ opId, issueId, user }) =>
    Api.assign(issueId, user).pipe(
      Effect.map(answer =>
        Message.SucceededAssign({ opId, assignee: answer.assignee }),
      ),
      Effect.catch(error =>
        Effect.succeed(Message.FailedAssign({ opId, error })),
      ),
    ),
})

export const RenameIssue = Command.define('RenameIssue', {
  args: { opId: Schema.Number, issueId: Schema.Number, title: Schema.String },
  messages: [Message.SucceededRenameIssue, Message.FailedRenameIssue],
  execute: ({ opId, issueId, title }) =>
    Api.renameIssue(issueId, title).pipe(
      Effect.map(answer =>
        Message.SucceededRenameIssue({ opId, title: answer.title }),
      ),
      Effect.catch(error =>
        Effect.succeed(Message.FailedRenameIssue({ opId, error })),
      ),
    ),
})

export const CloseIssue = Command.define('CloseIssue', {
  args: { opId: Schema.Number, issueId: Schema.Number },
  messages: [Message.SucceededCloseIssue, Message.FailedCloseIssue],
  execute: ({ opId, issueId }) =>
    Api.closeIssue(issueId).pipe(
      Effect.map(() => Message.SucceededCloseIssue({ opId })),
      Effect.catch(error =>
        Effect.succeed(Message.FailedCloseIssue({ opId, error })),
      ),
    ),
})

export const FetchComments = Command.define('FetchComments', {
  args: { requestId: Schema.Number, issueId: Schema.Number },
  messages: [Message.SucceededFetchComments, Message.FailedFetchComments],
  execute: ({ requestId, issueId }) =>
    Api.fetchComments(issueId).pipe(
      Effect.map(comments =>
        Message.SucceededFetchComments({ requestId, comments }),
      ),
      Effect.catch(error =>
        Effect.succeed(Message.FailedFetchComments({ requestId, error })),
      ),
    ),
})

export const AddComment = Command.define('AddComment', {
  args: {
    opId: Schema.Number,
    issueId: Schema.Number,
    author: Schema.String,
    text: Schema.String,
  },
  messages: [Message.SucceededAddComment, Message.FailedAddComment],
  execute: ({ opId, issueId, author, text }) =>
    Api.addComment(issueId, author, text).pipe(
      Effect.map(comment => Message.SucceededAddComment({ opId, comment })),
      Effect.catch(error =>
        Effect.succeed(Message.FailedAddComment({ opId, error })),
      ),
    ),
})

export const FetchLabels = Command.define('FetchLabels', {
  args: { requestId: Schema.Number, issueId: Schema.Number },
  messages: [Message.SucceededFetchLabels, Message.FailedFetchLabels],
  execute: ({ requestId, issueId }) =>
    Api.fetchLabels(issueId).pipe(
      Effect.map(labels => Message.SucceededFetchLabels({ requestId, labels })),
      Effect.catch(error =>
        Effect.succeed(Message.FailedFetchLabels({ requestId, error })),
      ),
    ),
})

export const AddLabel = Command.define('AddLabel', {
  args: { opId: Schema.Number, issueId: Schema.Number, label: Schema.String },
  messages: [Message.SucceededAddLabel, Message.FailedAddLabel],
  execute: ({ opId, issueId, label }) =>
    Api.addLabel(issueId, label).pipe(
      Effect.map(labels => Message.SucceededAddLabel({ opId, labels })),
      Effect.catch(error =>
        Effect.succeed(Message.FailedAddLabel({ opId, error })),
      ),
    ),
})

export const RemoveLabel = Command.define('RemoveLabel', {
  args: { opId: Schema.Number, issueId: Schema.Number, label: Schema.String },
  messages: [Message.SucceededRemoveLabel, Message.FailedRemoveLabel],
  execute: ({ opId, issueId, label }) =>
    Api.removeLabel(issueId, label).pipe(
      Effect.map(labels => Message.SucceededRemoveLabel({ opId, labels })),
      Effect.catch(error =>
        Effect.succeed(Message.FailedRemoveLabel({ opId, error })),
      ),
    ),
})

export const SearchRelatedHelp = Command.define('SearchRelatedHelp', {
  args: { requestId: Schema.Number, title: Schema.String },
  messages: [
    Message.SucceededSearchRelatedHelp,
    Message.FailedSearchRelatedHelp,
  ],
  execute: ({ requestId, title }) =>
    Api.search(title).pipe(
      Effect.map(hits =>
        Message.SucceededSearchRelatedHelp({ requestId, hits }),
      ),
      Effect.catch(error =>
        Effect.succeed(Message.FailedSearchRelatedHelp({ requestId, error })),
      ),
    ),
})

// INIT

const INITIAL_USER = 'guest'
const INITIAL_FILTER: IssueFilter = 'open'
const RELATED_HIT_LIMIT = 3

export const init = (): Update.Return<Model, Message> => {
  const requestId = 0
  return {
    model: {
      nextId: requestId + 1,
      user: INITIAL_USER,
      filter: INITIAL_FILTER,
      list: ListState.Loading({ requestId }),
      ops: [],
      maybeRowError: Option.none(),
      maybeSelection: Option.none(),
    },
    commands: [FetchIssues({ requestId, filter: INITIAL_FILTER })],
  }
}

// DERIVED

const isApplicable = (status: OpStatus, baseRequestId: number): boolean =>
  OpStatus.match(status, {
    Pending: () => true,
    Confirmed: ({ at }) => at > baseRequestId,
  })

const applyOp =
  (filter: IssueFilter, baseRequestId: number) =>
  (issues: ReadonlyArray<Issue>, op: IssueOp): ReadonlyArray<Issue> => {
    if (!isApplicable(op.status, baseRequestId)) {
      return issues
    }
    return IssueOp.match(op, {
      Assign: ({ issueId, assignee }) =>
        Array.map(issues, issue =>
          issue.id === issueId
            ? modifyFields(issue, { assignee: () => assignee })
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
  }

export const shownIssues = (
  model: Model,
): Option.Option<ReadonlyArray<Issue>> =>
  ListState.match(model.list, {
    Loading: () => Option.none(),
    Failed: () => Option.none(),
    Loaded: ({ requestId, issues }) =>
      Option.some(
        Array.reduce(model.ops, issues, applyOp(model.filter, requestId)),
      ),
  })

export const openIssueCount = (model: Model): Option.Option<number> =>
  model.filter === 'open'
    ? Option.map(shownIssues(model), Array.length)
    : Option.none()

const shownTitle = (
  model: Model,
  issueId: number,
  baseTitle: string,
  baseRequestId: number,
): string =>
  Array.reduce(model.ops, baseTitle, (title, op) =>
    op._tag === 'Rename' &&
    op.issueId === issueId &&
    isApplicable(op.status, baseRequestId)
      ? op.title
      : title,
  )

const applyLabelChange = (
  labels: ReadonlyArray<string>,
  change: LabelChange,
): ReadonlyArray<string> =>
  Match.value(change.kind).pipe(
    Match.when('Add', () =>
      Array.contains(labels, change.label)
        ? labels
        : Array.append(labels, change.label),
    ),
    Match.when('Remove', () =>
      Array.filter(labels, label => label !== change.label),
    ),
    Match.exhaustive,
  )

const shownLabels = (
  selection: Selection,
): Option.Option<ReadonlyArray<string>> =>
  LabelsState.match(selection.labels, {
    Loading: () => Option.none(),
    Failed: () => Option.none(),
    Loaded: ({ labels }) =>
      Option.some(
        Array.reduce(selection.labelChanges, labels, applyLabelChange),
      ),
  })

// UPDATE

type UpdateReturn = Update.ReturnWithOutMessage<Model, Message, OutMessage>

const modifySelection = (
  model: Model,
  f: (selection: Selection) => Selection,
): Model =>
  modifyFields(model, { maybeSelection: Option.map(f) })

const withSelection = (
  model: Model,
  f: (selection: Selection) => UpdateReturn,
): UpdateReturn =>
  Option.match(model.maybeSelection, {
    onNone: () => ({ model }),
    onSome: f,
  })

const findOp = (model: Model, opId: number): Option.Option<IssueOp> =>
  Array.findFirst(model.ops, op => op.opId === opId)

const confirmOp = (
  model: Model,
  opId: number,
  confirm: (op: IssueOp, status: OpStatus) => IssueOp,
): Model => {
  const at = model.nextId
  return modifyFields(model, {
    nextId: () => at + 1,
    ops: Array.map(op =>
      op.opId === opId ? confirm(op, OpStatus.Confirmed({ at })) : op,
    ),
  })
}

const removeOp = (model: Model, opId: number): Model =>
  modifyFields(model, {
    ops: Array.filter(op => op.opId !== opId),
  })

const reportOpError = (
  model: Model,
  origin: Origin,
  error: string,
  setDetailError: (selection: Selection, error: string) => Selection,
): Model =>
  Origin.match(origin, {
    Row: () => modifyFields(model, { maybeRowError: () => Option.some(error) }),
    Detail: ({ selectionId }) =>
      modifySelection(model, selection =>
        selection.selectionId === selectionId
          ? setDetailError(selection, error)
          : selection,
      ),
  })

const startAssign = (
  model: Model,
  issueId: number,
  origin: Origin,
): UpdateReturn => {
  const opId = model.nextId
  const started = modifyFields(model, {
    nextId: () => opId + 1,
    ops: Array.append(
      IssueOp.Assign({
        opId,
        issueId,
        assignee: model.user,
        origin,
        status: OpStatus.Pending(),
      }),
    ),
  })
  const cleared = Origin.match(origin, {
    Row: () => modifyFields(started, { maybeRowError: () => Option.none() }),
    Detail: () =>
      modifySelection(started, selection =>
        modifyFields(selection, { maybeAssignError: () => Option.none() }),
      ),
  })
  return {
    model: cleared,
    commands: [Assign({ opId, issueId, user: model.user })],
  }
}

const hasPendingClose = (model: Model, issueId: number): boolean =>
  Array.some(
    model.ops,
    op =>
      op._tag === 'Close' &&
      op.issueId === issueId &&
      op.status._tag === 'Pending',
  )

const startClose = (
  model: Model,
  issueId: number,
  origin: Origin,
): UpdateReturn => {
  if (hasPendingClose(model, issueId)) {
    return { model }
  }
  const opId = model.nextId
  const wasCounted = pipe(
    openIssueCount(model),
    Option.flatMap(() => shownIssues(model)),
    Option.exists(issues => Array.some(issues, issue => issue.id === issueId)),
  )
  const started = modifyFields(model, {
    nextId: () => opId + 1,
    ops: Array.append(
      IssueOp.Close({
        opId,
        issueId,
        origin,
        status: OpStatus.Pending(),
        wasCounted,
      }),
    ),
  })
  const cleared = Origin.match(origin, {
    Row: () => modifyFields(started, { maybeRowError: () => Option.none() }),
    Detail: () =>
      modifySelection(started, selection =>
        modifyFields(selection, { maybeCloseError: () => Option.none() }),
      ),
  })
  return { model: cleared, commands: [CloseIssue({ opId, issueId })] }
}

const selectIssue = (model: Model, issueId: number): UpdateReturn => {
  const selectionId = model.nextId
  const detailRequestId = selectionId + 1
  const commentsRequestId = selectionId + 2
  const labelsRequestId = selectionId + 3
  const selection: Selection = {
    selectionId,
    issueId,
    detail: DetailState.Loading({ requestId: detailRequestId }),
    comments: CommentsState.Loading({ requestId: commentsRequestId }),
    posts: [],
    labels: LabelsState.Loading({ requestId: labelsRequestId }),
    labelChanges: [],
    related: RelatedState.Idle(),
    titleInput: '',
    commentInput: '',
    labelInput: '',
    maybeAssignError: Option.none(),
    maybeRenameError: Option.none(),
    maybeCloseError: Option.none(),
    maybePostError: Option.none(),
    maybeLabelError: Option.none(),
  }
  return {
    model: modifyFields(model, {
      nextId: () => selectionId + 4,
      maybeSelection: () => Option.some(selection),
    }),
    commands: [
      FetchIssue({ requestId: detailRequestId, issueId }),
      FetchComments({ requestId: commentsRequestId, issueId }),
      FetchLabels({ requestId: labelsRequestId, issueId }),
    ],
  }
}

const isDetailRequest = (selection: Selection, requestId: number): boolean =>
  selection.detail._tag === 'Loading' &&
  selection.detail.requestId === requestId

const searchRelatedIfNeeded = (
  model: Model,
  selection: Selection,
  title: string,
): UpdateReturn => {
  const isCurrent = RelatedState.match(selection.related, {
    Idle: () => false,
    Loading: related => related.title === title,
    Failed: () => false,
    Loaded: related => related.title === title,
  })
  if (isCurrent) {
    return { model }
  }
  const requestId = model.nextId
  return {
    model: modifySelection(
      modifyFields(model, { nextId: () => requestId + 1 }),
      current =>
        modifyFields(current, {
          related: () => RelatedState.Loading({ requestId, title }),
        }),
    ),
    commands: [SearchRelatedHelp({ requestId, title })],
  }
}

const findPost = (selection: Selection, opId: number): boolean =>
  Array.some(selection.posts, post => post.opId === opId)

const findLabelChange = (selection: Selection, opId: number): boolean =>
  Array.some(selection.labelChanges, change => change.opId === opId)

const startLabelChange = (
  model: Model,
  selection: Selection,
  kind: LabelChangeKind,
  label: string,
  clearInput: boolean,
): UpdateReturn => {
  const opId = model.nextId
  const command =
    kind === 'Add'
      ? AddLabel({ opId, issueId: selection.issueId, label })
      : RemoveLabel({ opId, issueId: selection.issueId, label })
  return {
    model: modifySelection(
      modifyFields(model, { nextId: () => opId + 1 }),
      current =>
        modifyFields(current, {
          labelChanges: Array.append({ opId, kind, label }),
          labelInput: input => (clearInput ? '' : input),
          maybeLabelError: () => Option.none(),
        }),
    ),
    commands: [command],
  }
}

const settleLabelChange = (
  model: Model,
  opId: number,
  settle: (selection: Selection) => Selection,
): UpdateReturn =>
  withSelection(model, selection =>
    findLabelChange(selection, opId)
      ? {
          model: modifySelection(model, current =>
            settle(
              modifyFields(current, {
                labelChanges: Array.filter(change => change.opId !== opId),
              }),
            ),
          ),
        }
      : { model },
  )

const acceptLabels =
  (labels: ReadonlyArray<string>) =>
  (selection: Selection): Selection =>
    selection.labels._tag === 'Loaded'
      ? modifyFields(selection, {
          labels: () => LabelsState.Loaded({ labels }),
        })
      : selection

const declineLabelChange =
  (error: string) =>
  (selection: Selection): Selection =>
    modifyFields(selection, { maybeLabelError: () => Option.some(error) })

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
          nextId: () => requestId + 1,
          filter: () => filter,
          list: () => ListState.Loading({ requestId }),
        }),
        commands: [FetchIssues({ requestId, filter })],
      }
    },

    ClickedIssue: ({ issueId }) =>
      Option.match(model.maybeSelection, {
        onSome: selection =>
          selection.issueId === issueId
            ? { model }
            : selectIssue(model, issueId),
        onNone: () => selectIssue(model, issueId),
      }),

    ClickedRetryIssue: () =>
      withSelection(model, selection => {
        const requestId = model.nextId
        return {
          model: modifySelection(
            modifyFields(model, { nextId: () => requestId + 1 }),
            current =>
              modifyFields(current, {
                detail: () => DetailState.Loading({ requestId }),
              }),
          ),
          commands: [FetchIssue({ requestId, issueId: selection.issueId })],
        }
      }),

    ClickedAssign: () =>
      withSelection(model, selection =>
        startAssign(
          model,
          selection.issueId,
          Origin.Detail({ selectionId: selection.selectionId }),
        ),
      ),

    UpdatedTitleInput: ({ value }) => ({
      model: modifySelection(model, selection =>
        modifyFields(selection, { titleInput: () => value }),
      ),
    }),

    ClickedRename: () =>
      withSelection(model, selection => {
        const title = String.trim(selection.titleInput)
        if (String.isEmpty(title)) {
          return { model }
        }
        const opId = model.nextId
        return {
          model: modifySelection(
            modifyFields(model, {
              nextId: () => opId + 1,
              ops: Array.append(
                IssueOp.Rename({
                  opId,
                  issueId: selection.issueId,
                  title,
                  origin: Origin.Detail({
                    selectionId: selection.selectionId,
                  }),
                  status: OpStatus.Pending(),
                }),
              ),
            }),
            current =>
              modifyFields(current, { maybeRenameError: () => Option.none() }),
          ),
          commands: [RenameIssue({ opId, issueId: selection.issueId, title })],
        }
      }),

    ClickedClose: () =>
      withSelection(model, selection =>
        startClose(
          model,
          selection.issueId,
          Origin.Detail({ selectionId: selection.selectionId }),
        ),
      ),

    UpdatedCommentInput: ({ value }) => ({
      model: modifySelection(model, selection =>
        modifyFields(selection, { commentInput: () => value }),
      ),
    }),

    ClickedPost: () =>
      withSelection(model, selection => {
        const text = String.trim(selection.commentInput)
        if (String.isEmpty(text)) {
          return { model }
        }
        const opId = model.nextId
        const author = model.user
        return {
          model: modifySelection(
            modifyFields(model, { nextId: () => opId + 1 }),
            current =>
              modifyFields(current, {
                posts: Array.append(
                  Post.make({
                    opId,
                    comment: { author, text },
                    status: 'Sending',
                  }),
                ),
                commentInput: () => '',
                maybePostError: () => Option.none(),
              }),
          ),
          commands: [
            AddComment({ opId, issueId: selection.issueId, author, text }),
          ],
        }
      }),

    UpdatedLabelInput: ({ value }) => ({
      model: modifySelection(model, selection =>
        modifyFields(selection, { labelInput: () => value }),
      ),
    }),

    ClickedAddLabel: () =>
      withSelection(model, selection => {
        const label = String.trim(selection.labelInput)
        if (String.isEmpty(label)) {
          return { model }
        }
        return Option.match(shownLabels(selection), {
          onNone: () => ({ model }),
          onSome: labels =>
            Array.contains(labels, label)
              ? { model }
              : startLabelChange(model, selection, 'Add', label, true),
        })
      }),

    ClickedRemoveLabel: ({ label }) =>
      withSelection(model, selection =>
        Option.match(shownLabels(selection), {
          onNone: () => ({ model }),
          onSome: labels =>
            Array.contains(labels, label)
              ? startLabelChange(model, selection, 'Remove', label, false)
              : { model },
        }),
      ),

    ClickedRowAssign: ({ issueId }) =>
      startAssign(model, issueId, Origin.Row()),

    ClickedRowClose: ({ issueId }) => startClose(model, issueId, Origin.Row()),

    ClickedRelatedHit: ({ hitId }) =>
      withSelection(model, selection =>
        RelatedState.match<UpdateReturn>(selection.related, {
          Idle: () => ({ model }),
          Loading: () => ({ model }),
          Failed: () => ({ model }),
          Loaded: ({ title, hits }) =>
            Array.some(hits, hit => hit.id === hitId)
              ? {
                  model,
                  outMessage: OutMessage.OpenedRelatedHelp({
                    query: title,
                    hits,
                    hitId,
                  }),
                }
              : { model },
        }),
      ),

    SucceededFetchIssues: ({ requestId, issues }) =>
      model.list._tag === 'Loading' && model.list.requestId === requestId
        ? {
            model: modifyFields(model, {
              list: () => ListState.Loaded({ requestId, issues }),
            }),
          }
        : { model },

    FailedFetchIssues: ({ requestId, error }) =>
      model.list._tag === 'Loading' && model.list.requestId === requestId
        ? {
            model: modifyFields(model, {
              list: () => ListState.Failed({ error }),
            }),
          }
        : { model },

    SucceededFetchIssue: ({ requestId, maybeIssue }) =>
      withSelection(model, selection => {
        if (!isDetailRequest(selection, requestId)) {
          return { model }
        }
        return Option.match(maybeIssue, {
          onNone: () => ({
            model: modifySelection(model, current =>
              modifyFields(current, { detail: () => DetailState.Missing() }),
            ),
          }),
          onSome: issue => {
            const loaded = modifySelection(model, current =>
              modifyFields(current, {
                detail: () => DetailState.Loaded({ requestId, issue }),
              }),
            )
            return searchRelatedIfNeeded(loaded, selection, issue.title)
          },
        })
      }),

    FailedFetchIssue: ({ requestId, error }) =>
      withSelection(model, selection =>
        isDetailRequest(selection, requestId)
          ? {
              model: modifySelection(model, current =>
                modifyFields(current, {
                  detail: () => DetailState.Failed({ error }),
                }),
              ),
            }
          : { model },
      ),

    SucceededAssign: ({ opId, assignee }) => ({
      model: confirmOp(model, opId, (op, status) =>
        op._tag === 'Assign'
          ? IssueOp.Assign({ ...op, assignee, status })
          : op,
      ),
    }),

    FailedAssign: ({ opId, error }) =>
      Option.match(findOp(model, opId), {
        onNone: () => ({ model }),
        onSome: op => ({
          model: reportOpError(
            removeOp(model, opId),
            op.origin,
            error,
            (selection, message) =>
              modifyFields(selection, {
                maybeAssignError: () => Option.some(message),
              }),
          ),
        }),
      }),

    SucceededRenameIssue: ({ opId, title }) => ({
      model: confirmOp(model, opId, (op, status) =>
        op._tag === 'Rename' ? IssueOp.Rename({ ...op, title, status }) : op,
      ),
    }),

    FailedRenameIssue: ({ opId, error }) =>
      Option.match(findOp(model, opId), {
        onNone: () => ({ model }),
        onSome: op => ({
          model: reportOpError(
            removeOp(model, opId),
            op.origin,
            error,
            (selection, message) =>
              modifyFields(selection, {
                maybeRenameError: () => Option.some(message),
              }),
          ),
        }),
      }),

    SucceededCloseIssue: ({ opId }) => ({
      model: confirmOp(model, opId, (op, status) =>
        op._tag === 'Close' ? IssueOp.Close({ ...op, status }) : op,
      ),
    }),

    FailedCloseIssue: ({ opId, error }) =>
      Option.match(findOp(model, opId), {
        onNone: () => ({ model }),
        onSome: op => {
          const declined = reportOpError(
            removeOp(model, opId),
            op.origin,
            error,
            (selection, message) =>
              modifyFields(selection, {
                maybeCloseError: () => Option.some(message),
              }),
          )
          const isCountShown = Option.isSome(openIssueCount(declined))
          const wasCounted = op._tag === 'Close' && op.wasCounted
          return !isCountShown && wasCounted
            ? {
                model: declined,
                outMessage: OutMessage.RestoredClosedIssue(),
              }
            : { model: declined }
        },
      }),

    SucceededFetchComments: ({ requestId, comments }) => ({
      model: modifySelection(model, selection =>
        selection.comments._tag === 'Loading' &&
        selection.comments.requestId === requestId
          ? modifyFields(selection, {
              comments: () => CommentsState.Loaded({ comments }),
            })
          : selection,
      ),
    }),

    FailedFetchComments: ({ requestId, error }) => ({
      model: modifySelection(model, selection =>
        selection.comments._tag === 'Loading' &&
        selection.comments.requestId === requestId
          ? modifyFields(selection, {
              comments: () => CommentsState.Failed({ error }),
            })
          : selection,
      ),
    }),

    SucceededAddComment: ({ opId, comment }) => ({
      model: modifySelection(model, selection =>
        modifyFields(selection, {
          posts: Array.map(post =>
            post.opId === opId
              ? Post.make({ opId, comment, status: 'Sent' })
              : post,
          ),
        }),
      ),
    }),

    FailedAddComment: ({ opId, error }) => ({
      model: modifySelection(model, selection =>
        findPost(selection, opId)
          ? modifyFields(selection, {
              posts: Array.filter(post => post.opId !== opId),
              maybePostError: () => Option.some(error),
            })
          : selection,
      ),
    }),

    SucceededFetchLabels: ({ requestId, labels }) => ({
      model: modifySelection(model, selection =>
        selection.labels._tag === 'Loading' &&
        selection.labels.requestId === requestId
          ? modifyFields(selection, {
              labels: () => LabelsState.Loaded({ labels }),
            })
          : selection,
      ),
    }),

    FailedFetchLabels: ({ requestId, error }) => ({
      model: modifySelection(model, selection =>
        selection.labels._tag === 'Loading' &&
        selection.labels.requestId === requestId
          ? modifyFields(selection, {
              labels: () => LabelsState.Failed({ error }),
            })
          : selection,
      ),
    }),

    SucceededAddLabel: ({ opId, labels }) =>
      settleLabelChange(model, opId, acceptLabels(labels)),

    FailedAddLabel: ({ opId, error }) =>
      settleLabelChange(model, opId, declineLabelChange(error)),

    SucceededRemoveLabel: ({ opId, labels }) =>
      settleLabelChange(model, opId, acceptLabels(labels)),

    FailedRemoveLabel: ({ opId, error }) =>
      settleLabelChange(model, opId, declineLabelChange(error)),

    SucceededSearchRelatedHelp: ({ requestId, hits }) => ({
      model: modifySelection(model, selection => {
        const related = selection.related
        return related._tag === 'Loading' && related.requestId === requestId
          ? modifyFields(selection, {
              related: () => RelatedState.Loaded({ title: related.title, hits }),
            })
          : selection
      }),
    }),

    FailedSearchRelatedHelp: ({ requestId, error }) => ({
      model: modifySelection(model, selection => {
        const related = selection.related
        return related._tag === 'Loading' && related.requestId === requestId
          ? modifyFields(selection, {
              related: () =>
                RelatedState.Failed({ title: related.title, error }),
            })
          : selection
      }),
    }),
  })

// VIEW

const assigneeText = (issue: Issue): string =>
  issue.assignee === null ? 'unassigned' : issue.assignee

const errorLine = (
  testId: string,
  maybeError: Option.Option<string>,
  toText: (error: string) => string,
  h: HtmlBuilder<Message>,
): Html =>
  Option.match(maybeError, {
    onNone: () => h.empty,
    onSome: error =>
      h.p(
        [h.DataAttribute('testid', testId), h.Class('error'), h.Role('alert')],
        [toText(error)],
      ),
  })

const filterButton = (
  model: Model,
  filter: IssueFilter,
  h: HtmlBuilder<Message>,
): Html =>
  h.button(
    [
      h.DataAttribute('testid', `filter-${filter}`),
      h.Type('button'),
      h.AriaPressed(model.filter === filter ? "true" : "false"),
      h.OnClick(Message.ClickedFilter({ filter })),
    ],
    [filter],
  )

const issueRow = (
  model: Model,
  issue: Issue,
  h: HtmlBuilder<Message>,
): Html => {
  const isSelected = Option.exists(
    model.maybeSelection,
    selection => selection.issueId === issue.id,
  )
  return h.keyed('li')(
    String.concat('issue-', `${issue.id}`),
    [h.Class(isSelected ? 'row selected' : 'row')],
    [
      h.button(
        [
          h.DataAttribute('testid', 'issue'),
          h.Type('button'),
          h.Class('row-main'),
          h.AriaPressed(isSelected ? "true" : "false"),
          h.OnClick(Message.ClickedIssue({ issueId: issue.id })),
        ],
        [`#${issue.id} ${issue.title} (${assigneeText(issue)})`],
      ),
      h.button(
        [
          h.DataAttribute('testid', 'row-assign'),
          h.Type('button'),
          h.OnClick(Message.ClickedRowAssign({ issueId: issue.id })),
        ],
        [`assign to ${model.user}`],
      ),
      model.filter === 'open'
        ? h.button(
            [
              h.DataAttribute('testid', 'row-close'),
              h.Type('button'),
              h.OnClick(Message.ClickedRowClose({ issueId: issue.id })),
            ],
            ['close'],
          )
        : h.empty,
    ],
  )
}

const listView = (model: Model, h: HtmlBuilder<Message>): Html =>
  h.div(
    [h.DataAttribute('testid', 'list'), h.Class('list'), h.AriaLive('polite')],
    [
      ListState.match(model.list, {
        Loading: () =>
          h.p([h.Class('muted')], [`loading ${model.filter} issues`]),
        Failed: ({ error }) =>
          h.p([h.Class('error')], [`list error: ${error}`]),
        Loaded: () =>
          Option.match(shownIssues(model), {
            onNone: () => h.empty,
            onSome: issues =>
              Array.match(issues, {
                onEmpty: () =>
                  h.p([h.Class('muted')], [`no ${model.filter} issues`]),
                onNonEmpty: nonEmpty =>
                  h.ul(
                    [h.Class('rows')],
                    Array.map(nonEmpty, issue => issueRow(model, issue, h)),
                  ),
              }),
          }),
      }),
    ],
  )

const headingView = (
  model: Model,
  selection: Selection,
  h: HtmlBuilder<Message>,
): Html =>
  DetailState.match(selection.detail, {
    Loading: () => h.p([h.Class('muted')], [`loading #${selection.issueId}`]),
    Missing: () =>
      h.p(
        [h.Class('error')],
        [`detail error: issue #${selection.issueId} not found`],
      ),
    Failed: ({ error }) => h.p([h.Class('error')], [`detail error: ${error}`]),
    Loaded: ({ requestId, issue }) =>
      h.div(
        [],
        [
          h.h2(
            [h.DataAttribute('testid', 'heading')],
            [
              `#${issue.id} ${shownTitle(model, issue.id, issue.title, requestId)}`,
            ],
          ),
          h.p([h.Class('body')], [issue.body]),
        ],
      ),
  })

const commentRow = (
  key: string,
  comment: Comment,
  suffix: string,
  h: HtmlBuilder<Message>,
): Html =>
  h.keyed('li')(
    key,
    [h.DataAttribute('testid', 'comment')],
    [`${comment.author}: ${comment.text}${suffix}`],
  )

const commentsView = (selection: Selection, h: HtmlBuilder<Message>): Html => {
  const postRows = Array.map(selection.posts, post =>
    commentRow(
      `post-${post.opId}`,
      post.comment,
      post.status === 'Sending' ? ' (sending…)' : '',
      h,
    ),
  )
  return h.section(
    [h.DataAttribute('testid', 'comments'), h.Class('comments')],
    [
      h.h3([], ['Comments']),
      CommentsState.match(selection.comments, {
        Loading: () => h.p([h.Class('muted')], ['loading comments']),
        Failed: ({ error }) =>
          h.p([h.Class('error')], [`comments error: ${error}`]),
        Loaded: () => h.empty,
      }),
      h.ul(
        [],
        [
          ...(selection.comments._tag === 'Loaded'
            ? Array.map(selection.comments.comments, (comment, index) =>
                commentRow(`comment-${index}`, comment, '', h),
              )
            : []),
          ...postRows,
        ],
      ),
    ],
  )
}

const labelsView = (selection: Selection, h: HtmlBuilder<Message>): Html =>
  h.section(
    [h.DataAttribute('testid', 'labels'), h.Class('labels')],
    [
      h.h3([], ['Labels']),
      LabelsState.match(selection.labels, {
        Loading: () => h.p([h.Class('muted')], ['loading labels']),
        Failed: ({ error }) =>
          h.p([h.Class('error')], [`labels error: ${error}`]),
        Loaded: () =>
          Option.match(shownLabels(selection), {
            onNone: () => h.empty,
            onSome: labels =>
              h.ul(
                [h.Class('label-list')],
                Array.map(labels, label =>
                  h.keyed('li')(
                    `label-${label}`,
                    [h.Class('label-item')],
                    [
                      h.span(
                        [h.DataAttribute('testid', 'label'), h.Class('label')],
                        [label],
                      ),
                      h.button(
                        [
                          h.DataAttribute('testid', 'remove-label'),
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
      }),
    ],
  )

const relatedView = (selection: Selection, h: HtmlBuilder<Message>): Html =>
  selection.detail._tag === 'Loaded'
    ? h.section(
        [h.DataAttribute('testid', 'related'), h.Class('related')],
        [
          h.h3([], ['Related help']),
          RelatedState.match(selection.related, {
            Idle: () => h.p([h.Class('muted')], ['finding related help']),
            Loading: () => h.p([h.Class('muted')], ['finding related help']),
            Failed: ({ error }) =>
              h.p([h.Class('error')], [`related help failed: ${error}`]),
            Loaded: ({ hits }) =>
              Array.match(Array.take(hits, RELATED_HIT_LIMIT), {
                onEmpty: () => h.p([h.Class('muted')], ['no related help']),
                onNonEmpty: shown =>
                  h.ul(
                    [],
                    Array.map(shown, hit =>
                      h.keyed('li')(`related-${hit.id}`, [], [
                        h.button(
                          [
                            h.DataAttribute('testid', 'related-hit'),
                            h.Type('button'),
                            h.OnClick(
                              Message.ClickedRelatedHit({ hitId: hit.id }),
                            ),
                          ],
                          [hit.name],
                        ),
                      ]),
                    ),
                  ),
              }),
          }),
        ],
      )
    : h.empty

const textInput = (
  testId: string,
  label: string,
  value: string,
  onInput: (value: string) => Message,
  h: HtmlBuilder<Message>,
): Html =>
  h.input([
    h.DataAttribute('testid', testId),
    h.Type('text'),
    h.AriaLabel(label),
    h.Placeholder(label),
    h.Value(value),
    h.OnInput(onInput),
  ])

const actionButton = (
  testId: string,
  text: string,
  message: Message,
  h: HtmlBuilder<Message>,
): Html =>
  h.button(
    [h.DataAttribute('testid', testId), h.Type('button'), h.OnClick(message)],
    [text],
  )

const selectionView = (
  model: Model,
  selection: Selection,
  h: HtmlBuilder<Message>,
): Html =>
  h.div(
    [h.Class('selection')],
    [
      headingView(model, selection, h),
      actionButton('retry', 'retry', Message.ClickedRetryIssue(), h),
      h.div(
        [h.Class('actions')],
        [
          actionButton(
            'assign',
            `assign to ${model.user}`,
            Message.ClickedAssign(),
            h,
          ),
          actionButton('close', 'close', Message.ClickedClose(), h),
        ],
      ),
      errorLine('assign-error', selection.maybeAssignError, error => error, h),
      errorLine(
        'close-error',
        selection.maybeCloseError,
        error => `close error: ${error}`,
        h,
      ),
      h.div(
        [h.Class('inline-form')],
        [
          textInput(
            'title-input',
            'New title',
            selection.titleInput,
            value => Message.UpdatedTitleInput({ value }),
            h,
          ),
          actionButton('rename', 'rename', Message.ClickedRename(), h),
        ],
      ),
      errorLine(
        'rename-error',
        selection.maybeRenameError,
        error => `rename error: ${error}`,
        h,
      ),
      labelsView(selection, h),
      h.div(
        [h.Class('inline-form')],
        [
          textInput(
            'label-input',
            'New label',
            selection.labelInput,
            value => Message.UpdatedLabelInput({ value }),
            h,
          ),
          actionButton('add-label', 'add label', Message.ClickedAddLabel(), h),
        ],
      ),
      errorLine(
        'label-error',
        selection.maybeLabelError,
        error => `label error: ${error}`,
        h,
      ),
      commentsView(selection, h),
      h.div(
        [h.Class('inline-form')],
        [
          textInput(
            'comment-input',
            'Comment',
            selection.commentInput,
            value => Message.UpdatedCommentInput({ value }),
            h,
          ),
          actionButton('post', 'post', Message.ClickedPost(), h),
        ],
      ),
      errorLine(
        'post-error',
        selection.maybePostError,
        error => `post error: ${error}`,
        h,
      ),
      relatedView(selection, h),
    ],
  )

const detailView = (model: Model, h: HtmlBuilder<Message>): Html =>
  h.section(
    [h.DataAttribute('testid', 'detail'), h.Class('detail')],
    [
      Option.match(model.maybeSelection, {
        onNone: () => h.p([h.Class('muted')], ['select an issue']),
        onSome: selection => selectionView(model, selection, h),
      }),
    ],
  )

export const view = Submodel.defineView<Model, Message>(
  (model, h): Html =>
    h.div(
      [h.Class('issues-page')],
      [
        h.div(
          [h.Class('toolbar')],
          [
            h.label(
              [h.Class('field')],
              [
                'Current user ',
                h.input([
                  h.DataAttribute('testid', 'user'),
                  h.Type('text'),
                  h.Value(model.user),
                  h.OnInput(value => Message.UpdatedUser({ value })),
                ]),
              ],
            ),
            h.div(
              [h.Class('filters'), h.Role('group'), h.AriaLabel('Filter')],
              [
                filterButton(model, 'open', h),
                filterButton(model, 'closed', h),
              ],
            ),
          ],
        ),
        errorLine(
          'row-error',
          model.maybeRowError,
          error => `row error: ${error}`,
          h,
        ),
        h.div(
          [h.Class('columns')],
          [listView(model, h), detailView(model, h)],
        ),
      ],
    ),
)
