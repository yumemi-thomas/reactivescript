import { Array, Effect, Option, Schema } from 'effect'
import { Command, Submodel, type Update } from 'foldkit'
import { Html, HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { defineTaggedUnion } from 'foldkit/schema'
import { modifyFields } from 'foldkit/struct'

import {
  addComment,
  addLabel,
  assign,
  closeIssue,
  fetchComments,
  fetchIssue,
  fetchIssues,
  fetchLabels,
  removeLabel,
  renameIssue,
  search,
} from './api'
import { Hit, callApi } from './shared'

// MODEL

const IssueFilter = Schema.Literals(['open', 'closed'])
type IssueFilter = typeof IssueFilter.Type

const Origin = Schema.Literals(['Detail', 'Row'])
type Origin = typeof Origin.Type

const IssueSummary = Schema.Struct({
  id: Schema.Number,
  title: Schema.String,
  assignee: Schema.NullOr(Schema.String),
})

const IssueDetail = Schema.Struct({
  id: Schema.Number,
  title: Schema.String,
  body: Schema.String,
})

const Comment = Schema.Struct({
  author: Schema.String,
  text: Schema.String,
})

export const IssueRow = Schema.Struct({
  id: Schema.Number,
  title: Schema.String,
  maybeAssignee: Schema.Option(Schema.String),
  isClosing: Schema.Boolean,
})
export type IssueRow = typeof IssueRow.Type

const IssueList = defineTaggedUnion({
  Loading: {},
  Loaded: { rows: Schema.Array(IssueRow) },
  Failed: { message: Schema.String },
})
type IssueList = typeof IssueList.Type

const DetailState = defineTaggedUnion({
  Loading: {},
  Loaded: { title: Schema.String, body: Schema.String },
  NotFound: {},
  Failed: { message: Schema.String },
})
type DetailState = typeof DetailState.Type

const RelatedState = defineTaggedUnion({
  Loading: {},
  Loaded: { hits: Schema.Array(Hit) },
  Failed: { message: Schema.String },
})
type RelatedState = typeof RelatedState.Type

const LoadStatus = defineTaggedUnion({
  Loading: {},
  Loaded: {},
  Failed: { message: Schema.String },
})
type LoadStatus = typeof LoadStatus.Type

const CommentRow = Schema.Struct({
  key: Schema.Number,
  author: Schema.String,
  text: Schema.String,
  isSending: Schema.Boolean,
})

const LabelRow = Schema.Struct({
  name: Schema.String,
  isRemoving: Schema.Boolean,
})

const SelectedIssue = Schema.Struct({
  id: Schema.Number,
  detail: DetailState,
  related: RelatedState,
  titleInput: Schema.String,
  maybeRenameError: Schema.Option(Schema.String),
  maybeAssignError: Schema.Option(Schema.String),
  maybeCloseError: Schema.Option(Schema.String),
  commentsStatus: LoadStatus,
  comments: Schema.Array(CommentRow),
  nextCommentKey: Schema.Number,
  commentInput: Schema.String,
  maybePostError: Schema.Option(Schema.String),
  labelsStatus: LoadStatus,
  labels: Schema.Array(LabelRow),
  labelInput: Schema.String,
  maybeLabelError: Schema.Option(Schema.String),
})
type SelectedIssue = typeof SelectedIssue.Type

export const Model = Schema.Struct({
  user: Schema.String,
  filter: IssueFilter,
  list: IssueList,
  maybeRowError: Schema.Option(Schema.String),
  maybeSelected: Schema.Option(SelectedIssue),
})
export type Model = typeof Model.Type

// MESSAGE

export const Message = defineMessageUnion({
  UpdatedUser: { value: Schema.String },
  ClickedFilter: { filter: IssueFilter },
  ClickedIssue: { id: Schema.Number },
  ClickedRetryIssue: {},
  ClickedRowAssign: { id: Schema.Number },
  ClickedRowClose: { id: Schema.Number },
  UpdatedTitleInput: { value: Schema.String },
  ClickedRename: {},
  ClickedAssign: {},
  ClickedClose: {},
  UpdatedCommentInput: { value: Schema.String },
  ClickedPost: {},
  UpdatedLabelInput: { value: Schema.String },
  ClickedAddLabel: {},
  ClickedRemoveLabel: { label: Schema.String },
  ClickedRelatedHit: { id: Schema.Number },
  SucceededFetchIssues: {
    filter: IssueFilter,
    issues: Schema.Array(IssueSummary),
  },
  FailedFetchIssues: { filter: IssueFilter, message: Schema.String },
  SucceededFetchIssue: {
    id: Schema.Number,
    issue: Schema.NullOr(IssueDetail),
  },
  FailedFetchIssue: { id: Schema.Number, message: Schema.String },
  SucceededAssignIssue: { id: Schema.Number, assignee: Schema.String },
  FailedAssignIssue: {
    id: Schema.Number,
    origin: Origin,
    previousAssignee: Schema.Option(Schema.String),
    message: Schema.String,
  },
  SucceededRenameIssue: { id: Schema.Number, title: Schema.String },
  FailedRenameIssue: {
    id: Schema.Number,
    previousTitle: Schema.String,
    message: Schema.String,
  },
  SucceededCloseIssue: { id: Schema.Number },
  FailedCloseIssue: {
    id: Schema.Number,
    origin: Origin,
    message: Schema.String,
  },
  SucceededFetchComments: {
    id: Schema.Number,
    comments: Schema.Array(Comment),
  },
  FailedFetchComments: { id: Schema.Number, message: Schema.String },
  SucceededAddComment: {
    id: Schema.Number,
    key: Schema.Number,
    comment: Comment,
  },
  FailedAddComment: { id: Schema.Number, key: Schema.Number, message: Schema.String },
  SucceededFetchLabels: {
    id: Schema.Number,
    labels: Schema.Array(Schema.String),
  },
  FailedFetchLabels: { id: Schema.Number, message: Schema.String },
  SucceededAddLabel: {
    id: Schema.Number,
    labels: Schema.Array(Schema.String),
  },
  FailedAddLabel: {
    id: Schema.Number,
    label: Schema.String,
    message: Schema.String,
  },
  SucceededRemoveLabel: {
    id: Schema.Number,
    labels: Schema.Array(Schema.String),
  },
  FailedRemoveLabel: {
    id: Schema.Number,
    label: Schema.String,
    message: Schema.String,
  },
  SucceededFindRelatedHelp: { id: Schema.Number, hits: Schema.Array(Hit) },
  FailedFindRelatedHelp: { id: Schema.Number, message: Schema.String },
})
export type Message = typeof Message.Type

// OUT MESSAGE

export const OutMessage = defineMessageUnion({
  OpenedRelatedHelp: { query: Schema.String, hitId: Schema.Number },
})
export type OutMessage = typeof OutMessage.Type

type UpdateResult = Update.ReturnWithOutMessage<Model, Message, OutMessage>

// COMMAND

const FetchIssues = Command.define('FetchIssues', {
  args: { filter: IssueFilter },
  messages: [Message.SucceededFetchIssues, Message.FailedFetchIssues],
  execute: ({ filter }) =>
    callApi(() => fetchIssues(filter)).pipe(
      Effect.map(issues => Message.SucceededFetchIssues({ filter, issues })),
      Effect.catch(message =>
        Effect.succeed(Message.FailedFetchIssues({ filter, message })),
      ),
    ),
})

const FetchIssue = Command.define('FetchIssue', {
  args: { id: Schema.Number },
  messages: [Message.SucceededFetchIssue, Message.FailedFetchIssue],
  execute: ({ id }) =>
    callApi(() => fetchIssue(id)).pipe(
      Effect.map(issue => Message.SucceededFetchIssue({ id, issue })),
      Effect.catch(message =>
        Effect.succeed(Message.FailedFetchIssue({ id, message })),
      ),
    ),
})

const AssignIssue = Command.define('AssignIssue', {
  args: {
    id: Schema.Number,
    user: Schema.String,
    origin: Origin,
    previousAssignee: Schema.Option(Schema.String),
  },
  messages: [Message.SucceededAssignIssue, Message.FailedAssignIssue],
  execute: ({ id, user, origin, previousAssignee }) =>
    callApi(() => assign(id, user)).pipe(
      Effect.map(answer =>
        Message.SucceededAssignIssue({ id, assignee: answer.assignee }),
      ),
      Effect.catch(message =>
        Effect.succeed(
          Message.FailedAssignIssue({ id, origin, previousAssignee, message }),
        ),
      ),
    ),
})

const RenameIssue = Command.define('RenameIssue', {
  args: {
    id: Schema.Number,
    title: Schema.String,
    previousTitle: Schema.String,
  },
  messages: [Message.SucceededRenameIssue, Message.FailedRenameIssue],
  execute: ({ id, title, previousTitle }) =>
    callApi(() => renameIssue(id, title)).pipe(
      Effect.map(answer =>
        Message.SucceededRenameIssue({ id, title: answer.title }),
      ),
      Effect.catch(message =>
        Effect.succeed(
          Message.FailedRenameIssue({ id, previousTitle, message }),
        ),
      ),
    ),
})

const CloseIssue = Command.define('CloseIssue', {
  args: { id: Schema.Number, origin: Origin },
  messages: [Message.SucceededCloseIssue, Message.FailedCloseIssue],
  execute: ({ id, origin }) =>
    callApi(() => closeIssue(id)).pipe(
      Effect.map(() => Message.SucceededCloseIssue({ id })),
      Effect.catch(message =>
        Effect.succeed(Message.FailedCloseIssue({ id, origin, message })),
      ),
    ),
})

const FetchComments = Command.define('FetchComments', {
  args: { id: Schema.Number },
  messages: [Message.SucceededFetchComments, Message.FailedFetchComments],
  execute: ({ id }) =>
    callApi(() => fetchComments(id)).pipe(
      Effect.map(comments => Message.SucceededFetchComments({ id, comments })),
      Effect.catch(message =>
        Effect.succeed(Message.FailedFetchComments({ id, message })),
      ),
    ),
})

const AddComment = Command.define('AddComment', {
  args: {
    id: Schema.Number,
    key: Schema.Number,
    author: Schema.String,
    text: Schema.String,
  },
  messages: [Message.SucceededAddComment, Message.FailedAddComment],
  execute: ({ id, key, author, text }) =>
    callApi(() => addComment(id, author, text)).pipe(
      Effect.map(comment =>
        Message.SucceededAddComment({ id, key, comment }),
      ),
      Effect.catch(message =>
        Effect.succeed(Message.FailedAddComment({ id, key, message })),
      ),
    ),
})

const FetchLabels = Command.define('FetchLabels', {
  args: { id: Schema.Number },
  messages: [Message.SucceededFetchLabels, Message.FailedFetchLabels],
  execute: ({ id }) =>
    callApi(() => fetchLabels(id)).pipe(
      Effect.map(labels => Message.SucceededFetchLabels({ id, labels })),
      Effect.catch(message =>
        Effect.succeed(Message.FailedFetchLabels({ id, message })),
      ),
    ),
})

const AddLabel = Command.define('AddLabel', {
  args: { id: Schema.Number, label: Schema.String },
  messages: [Message.SucceededAddLabel, Message.FailedAddLabel],
  execute: ({ id, label }) =>
    callApi(() => addLabel(id, label)).pipe(
      Effect.map(labels => Message.SucceededAddLabel({ id, labels })),
      Effect.catch(message =>
        Effect.succeed(Message.FailedAddLabel({ id, label, message })),
      ),
    ),
})

const RemoveLabel = Command.define('RemoveLabel', {
  args: { id: Schema.Number, label: Schema.String },
  messages: [Message.SucceededRemoveLabel, Message.FailedRemoveLabel],
  execute: ({ id, label }) =>
    callApi(() => removeLabel(id, label)).pipe(
      Effect.map(labels => Message.SucceededRemoveLabel({ id, labels })),
      Effect.catch(message =>
        Effect.succeed(Message.FailedRemoveLabel({ id, label, message })),
      ),
    ),
})

const FindRelatedHelp = Command.define('FindRelatedHelp', {
  args: { id: Schema.Number, query: Schema.String },
  messages: [
    Message.SucceededFindRelatedHelp,
    Message.FailedFindRelatedHelp,
  ],
  execute: ({ id, query }) =>
    callApi(() => search(query)).pipe(
      Effect.map(hits => Message.SucceededFindRelatedHelp({ id, hits })),
      Effect.catch(message =>
        Effect.succeed(Message.FailedFindRelatedHelp({ id, message })),
      ),
    ),
})

// HELPERS

const findRow = (list: IssueList, id: number): Option.Option<IssueRow> =>
  IssueList.match<Option.Option<IssueRow>>(list, {
    Loading: () => Option.none(),
    Failed: () => Option.none(),
    Loaded: ({ rows }) => Array.findFirst(rows, row => row.id === id),
  })

const changeRow = (
  list: IssueList,
  id: number,
  change: (row: IssueRow) => IssueRow,
): IssueList =>
  IssueList.match<IssueList>(list, {
    Loading: () => list,
    Failed: () => list,
    Loaded: ({ rows }) =>
      IssueList.Loaded({
        rows: rows.map(row => (row.id === id ? change(row) : row)),
      }),
  })

const isSelected = (model: Model, id: number): boolean =>
  Option.match(model.maybeSelected, {
    onNone: () => false,
    onSome: selected => selected.id === id,
  })

const changeSelected = (
  model: Model,
  id: number,
  change: (selected: SelectedIssue) => SelectedIssue,
): Model =>
  isSelected(model, id)
    ? modifyFields(model, {
        maybeSelected: maybeSelected => Option.map(maybeSelected, change),
      })
    : model

const onSelected = (
  model: Model,
  onSome: (selected: SelectedIssue) => UpdateResult,
): UpdateResult =>
  Option.match(model.maybeSelected, {
    onNone: (): UpdateResult => ({ model }),
    onSome,
  })

const withList = (model: Model, list: IssueList): Model =>
  modifyFields(model, { list: () => list })

const withRowError = (model: Model, message: string): Model =>
  modifyFields(model, { maybeRowError: () => Option.some(message) })

const retitleDetail = (detail: DetailState, title: string): DetailState =>
  DetailState.match<DetailState>(detail, {
    Loading: () => detail,
    Loaded: ({ body }) => DetailState.Loaded({ title, body }),
    NotFound: () => detail,
    Failed: () => detail,
  })

const detailTitleOr = (detail: DetailState, fallback: string): string =>
  DetailState.match<string>(detail, {
    Loading: () => fallback,
    Loaded: ({ title }) => title,
    NotFound: () => fallback,
    Failed: () => fallback,
  })

const startSelection = (id: number): SelectedIssue => ({
  id,
  detail: DetailState.Loading(),
  related: RelatedState.Loading(),
  titleInput: '',
  maybeRenameError: Option.none(),
  maybeAssignError: Option.none(),
  maybeCloseError: Option.none(),
  commentsStatus: LoadStatus.Loading(),
  comments: [],
  nextCommentKey: 0,
  commentInput: '',
  maybePostError: Option.none(),
  labelsStatus: LoadStatus.Loading(),
  labels: [],
  labelInput: '',
  maybeLabelError: Option.none(),
})

const startAssign = (
  model: Model,
  id: number,
  origin: Origin,
): UpdateResult => {
  const previousAssignee = Option.flatMap(
    findRow(model.list, id),
    row => row.maybeAssignee,
  )
  const nextModel = withList(
    model,
    changeRow(model.list, id, row =>
      modifyFields(row, { maybeAssignee: () => Option.some(model.user) }),
    ),
  )
  const clearedModel =
    origin === 'Row'
      ? modifyFields(nextModel, { maybeRowError: () => Option.none() })
      : changeSelected(nextModel, id, selected =>
          modifyFields(selected, { maybeAssignError: () => Option.none() }),
        )
  return {
    model: clearedModel,
    commands: [
      AssignIssue({ id, user: model.user, origin, previousAssignee }),
    ],
  }
}

const startClose = (model: Model, id: number, origin: Origin): UpdateResult => {
  const closingModel =
    model.filter === 'open'
      ? withList(
          model,
          changeRow(model.list, id, row =>
            modifyFields(row, { isClosing: () => true }),
          ),
        )
      : model
  const clearedModel =
    origin === 'Row'
      ? modifyFields(closingModel, { maybeRowError: () => Option.none() })
      : changeSelected(closingModel, id, selected =>
          modifyFields(selected, { maybeCloseError: () => Option.none() }),
        )
  return { model: clearedModel, commands: [CloseIssue({ id, origin })] }
}

const onSelectedModel = (
  model: Model,
  change: (selected: SelectedIssue) => SelectedIssue,
): Model =>
  Option.match(model.maybeSelected, {
    onNone: () => model,
    onSome: selected => changeSelected(model, selected.id, change),
  })

const labelRowsFrom = (labels: ReadonlyArray<string>) =>
  labels.map(name => ({ name, isRemoving: false }))

const commentRowsFrom = (
  comments: ReadonlyArray<typeof Comment.Type>,
  startKey: number,
) =>
  comments.map((comment, index) => ({
    key: startKey + index,
    author: comment.author,
    text: comment.text,
    isSending: false,
  }))

export const openIssueCount = (model: Model): Option.Option<number> =>
  model.filter === 'open'
    ? IssueList.match<Option.Option<number>>(model.list, {
        Loading: () => Option.none(),
        Failed: () => Option.none(),
        Loaded: ({ rows }) =>
          Option.some(rows.filter(row => !row.isClosing).length),
      })
    : Option.none()

// INIT

export const init = (): Update.Return<Model, Message> => ({
  model: {
    user: 'guest',
    filter: 'open',
    list: IssueList.Loading(),
    maybeRowError: Option.none(),
    maybeSelected: Option.none(),
  },
  commands: [FetchIssues({ filter: 'open' })],
})

// UPDATE

export const update = (model: Model, message: Message): UpdateResult =>
  Message.match<UpdateResult>(message, {
    UpdatedUser: ({ value }) => ({
      model: modifyFields(model, { user: () => value }),
    }),

    ClickedFilter: ({ filter }) => ({
      model: modifyFields(model, {
        filter: () => filter,
        list: () => IssueList.Loading(),
      }),
      commands: [FetchIssues({ filter })],
    }),

    ClickedIssue: ({ id }) => ({
      model: modifyFields(model, {
        maybeSelected: () => Option.some(startSelection(id)),
      }),
      commands: [
        FetchIssue({ id }),
        FetchComments({ id }),
        FetchLabels({ id }),
      ],
    }),

    ClickedRetryIssue: () =>
      onSelected(model, selected => ({
        model: changeSelected(model, selected.id, current =>
          modifyFields(current, { detail: () => DetailState.Loading() }),
        ),
        commands: [FetchIssue({ id: selected.id })],
      })),

    ClickedRowAssign: ({ id }) => startAssign(model, id, 'Row'),

    ClickedRowClose: ({ id }) => startClose(model, id, 'Row'),

    UpdatedTitleInput: ({ value }) => ({
      model: onSelectedModel(model, selected =>
        modifyFields(selected, { titleInput: () => value }),
      ),
    }),

    ClickedRename: () =>
      onSelected(model, selected => {
        const title = selected.titleInput.trim()
        if (title.length === 0) {
          return { model }
        }
        const previousTitle = Option.match(findRow(model.list, selected.id), {
          onNone: () => detailTitleOr(selected.detail, ''),
          onSome: row => row.title,
        })
        const renamedModel = withList(
          model,
          changeRow(model.list, selected.id, row =>
            modifyFields(row, { title: () => title }),
          ),
        )
        return {
          model: changeSelected(renamedModel, selected.id, current =>
            modifyFields(current, {
              detail: () => retitleDetail(current.detail, title),
              maybeRenameError: () => Option.none(),
            }),
          ),
          commands: [
            RenameIssue({ id: selected.id, title, previousTitle }),
          ],
        }
      }),

    ClickedAssign: () =>
      onSelected(model, selected => startAssign(model, selected.id, 'Detail')),

    ClickedClose: () =>
      onSelected(model, selected => startClose(model, selected.id, 'Detail')),

    UpdatedCommentInput: ({ value }) => ({
      model: onSelectedModel(model, selected =>
        modifyFields(selected, { commentInput: () => value }),
      ),
    }),

    ClickedPost: () =>
      onSelected(model, selected => {
        const text = selected.commentInput.trim()
        if (text.length === 0) {
          return { model }
        }
        const key = selected.nextCommentKey
        const author = model.user
        return {
          model: changeSelected(model, selected.id, current =>
            modifyFields(current, {
              comments: comments => [
                ...comments,
                { key, author, text, isSending: true },
              ],
              nextCommentKey: () => key + 1,
              commentInput: () => '',
              maybePostError: () => Option.none(),
            }),
          ),
          commands: [
            AddComment({ id: selected.id, key, author, text }),
          ],
        }
      }),

    UpdatedLabelInput: ({ value }) => ({
      model: onSelectedModel(model, selected =>
        modifyFields(selected, { labelInput: () => value }),
      ),
    }),

    ClickedAddLabel: () =>
      onSelected(model, selected => {
        const label = selected.labelInput.trim()
        const isAlreadyShown = selected.labels.some(row => row.name === label)
        if (label.length === 0 || isAlreadyShown) {
          return { model }
        }
        return {
          model: changeSelected(model, selected.id, current =>
            modifyFields(current, {
              labels: labels => [...labels, { name: label, isRemoving: false }],
              labelInput: () => '',
              maybeLabelError: () => Option.none(),
            }),
          ),
          commands: [AddLabel({ id: selected.id, label })],
        }
      }),

    ClickedRemoveLabel: ({ label }) =>
      onSelected(model, selected => ({
        model: changeSelected(model, selected.id, current =>
          modifyFields(current, {
            labels: labels =>
              labels.map(row =>
                row.name === label
                  ? modifyFields(row, { isRemoving: () => true })
                  : row,
              ),
            maybeLabelError: () => Option.none(),
          }),
        ),
        commands: [RemoveLabel({ id: selected.id, label })],
      })),

    ClickedRelatedHit: ({ id: hitId }) =>
      onSelected(model, selected =>
        DetailState.match<UpdateResult>(selected.detail, {
          Loading: () => ({ model }),
          Loaded: ({ title }) => ({
            model,
            outMessage: OutMessage.OpenedRelatedHelp({ query: title, hitId }),
          }),
          NotFound: () => ({ model }),
          Failed: () => ({ model }),
        }),
      ),

    SucceededFetchIssues: ({ filter, issues }) => {
      if (filter !== model.filter) {
        return { model }
      }
      return {
        model: withList(
          model,
          IssueList.Loaded({
            rows: issues.map(issue => ({
              id: issue.id,
              title: issue.title,
              maybeAssignee: Option.fromNullOr(issue.assignee),
              isClosing: false,
            })),
          }),
        ),
      }
    },

    FailedFetchIssues: ({ filter, message }) => {
      if (filter !== model.filter) {
        return { model }
      }
      return { model: withList(model, IssueList.Failed({ message })) }
    },

    SucceededFetchIssue: ({ id, issue }) => {
      if (!isSelected(model, id)) {
        return { model }
      }
      if (issue === null) {
        return {
          model: changeSelected(model, id, selected =>
            modifyFields(selected, { detail: () => DetailState.NotFound() }),
          ),
        }
      }
      return {
        model: changeSelected(model, id, selected =>
          modifyFields(selected, {
            detail: () =>
              DetailState.Loaded({ title: issue.title, body: issue.body }),
            related: () => RelatedState.Loading(),
          }),
        ),
        commands: [FindRelatedHelp({ id, query: issue.title })],
      }
    },

    FailedFetchIssue: ({ id, message }) => ({
      model: changeSelected(model, id, selected =>
        modifyFields(selected, { detail: () => DetailState.Failed({ message }) }),
      ),
    }),

    SucceededAssignIssue: ({ id, assignee }) => ({
      model: withList(
        model,
        changeRow(model.list, id, row =>
          modifyFields(row, { maybeAssignee: () => Option.some(assignee) }),
        ),
      ),
    }),

    FailedAssignIssue: ({ id, origin, previousAssignee, message }) => {
      const revertedModel = withList(
        model,
        changeRow(model.list, id, row =>
          modifyFields(row, { maybeAssignee: () => previousAssignee }),
        ),
      )
      if (origin === 'Row') {
        return { model: withRowError(revertedModel, `row error: ${message}`) }
      }
      return {
        model: changeSelected(revertedModel, id, selected =>
          modifyFields(selected, {
            maybeAssignError: () => Option.some(`assign error: ${message}`),
          }),
        ),
      }
    },

    SucceededRenameIssue: ({ id, title }) => ({
      model: changeSelected(
        withList(
          model,
          changeRow(model.list, id, row =>
            modifyFields(row, { title: () => title }),
          ),
        ),
        id,
        selected =>
          modifyFields(selected, {
            detail: () => retitleDetail(selected.detail, title),
          }),
      ),
    }),

    FailedRenameIssue: ({ id, previousTitle, message }) => {
      const revertedModel = withList(
        model,
        changeRow(model.list, id, row =>
          modifyFields(row, { title: () => previousTitle }),
        ),
      )
      return {
        model: changeSelected(revertedModel, id, selected =>
          modifyFields(selected, {
            detail: () => retitleDetail(selected.detail, previousTitle),
            maybeRenameError: () =>
              Option.some(`rename error: ${message}`),
          }),
        ),
      }
    },

    SucceededCloseIssue: () => ({ model }),

    FailedCloseIssue: ({ id, origin, message }) => {
      const reopenedModel = withList(
        model,
        changeRow(model.list, id, row =>
          modifyFields(row, { isClosing: () => false }),
        ),
      )
      if (origin === 'Row') {
        return { model: withRowError(reopenedModel, `row error: ${message}`) }
      }
      return {
        model: changeSelected(reopenedModel, id, selected =>
          modifyFields(selected, {
            maybeCloseError: () => Option.some(`close error: ${message}`),
          }),
        ),
      }
    },

    SucceededFetchComments: ({ id, comments }) => ({
      model: changeSelected(model, id, selected => {
        const fetchedRows = commentRowsFrom(comments, selected.nextCommentKey)
        const pendingRows = selected.comments.filter(row => row.isSending)
        return modifyFields(selected, {
          comments: () => [...fetchedRows, ...pendingRows],
          nextCommentKey: () => selected.nextCommentKey + comments.length,
          commentsStatus: () => LoadStatus.Loaded(),
        })
      }),
    }),

    FailedFetchComments: ({ id, message }) => ({
      model: changeSelected(model, id, selected =>
        modifyFields(selected, {
          commentsStatus: () => LoadStatus.Failed({ message }),
        }),
      ),
    }),

    SucceededAddComment: ({ id, key, comment }) => ({
      model: changeSelected(model, id, selected =>
        modifyFields(selected, {
          comments: comments =>
            comments.map(row =>
              row.key === key
                ? modifyFields(row, {
                    author: () => comment.author,
                    text: () => comment.text,
                    isSending: () => false,
                  })
                : row,
            ),
        }),
      ),
    }),

    FailedAddComment: ({ id, key, message }) => ({
      model: changeSelected(model, id, selected =>
        modifyFields(selected, {
          comments: comments => comments.filter(row => row.key !== key),
          maybePostError: () => Option.some(`post error: ${message}`),
        }),
      ),
    }),

    SucceededFetchLabels: ({ id, labels }) => ({
      model: changeSelected(model, id, selected =>
        modifyFields(selected, {
          labels: () => labelRowsFrom(labels),
          labelsStatus: () => LoadStatus.Loaded(),
        }),
      ),
    }),

    FailedFetchLabels: ({ id, message }) => ({
      model: changeSelected(model, id, selected =>
        modifyFields(selected, {
          labelsStatus: () => LoadStatus.Failed({ message }),
        }),
      ),
    }),

    SucceededAddLabel: ({ id, labels }) => ({
      model: changeSelected(model, id, selected =>
        modifyFields(selected, { labels: () => labelRowsFrom(labels) }),
      ),
    }),

    FailedAddLabel: ({ id, label, message }) => ({
      model: changeSelected(model, id, selected =>
        modifyFields(selected, {
          labels: labels => labels.filter(row => row.name !== label),
          maybeLabelError: () => Option.some(`label error: ${message}`),
        }),
      ),
    }),

    SucceededRemoveLabel: ({ id, labels }) => ({
      model: changeSelected(model, id, selected =>
        modifyFields(selected, { labels: () => labelRowsFrom(labels) }),
      ),
    }),

    FailedRemoveLabel: ({ id, label, message }) => ({
      model: changeSelected(model, id, selected =>
        modifyFields(selected, {
          labels: labels =>
            labels.map(row =>
              row.name === label
                ? modifyFields(row, { isRemoving: () => false })
                : row,
            ),
          maybeLabelError: () => Option.some(`label error: ${message}`),
        }),
      ),
    }),

    SucceededFindRelatedHelp: ({ id, hits }) => ({
      model: changeSelected(model, id, selected =>
        modifyFields(selected, {
          related: () => RelatedState.Loaded({ hits }),
        }),
      ),
    }),

    FailedFindRelatedHelp: ({ id, message }) => ({
      model: changeSelected(model, id, selected =>
        modifyFields(selected, {
          related: () => RelatedState.Failed({ message }),
        }),
      ),
    }),
  })

// VIEW

const testId = (h: HtmlBuilder<Message>, id: string) =>
  h.DataAttribute('testid', id)

const assigneeLabel = (maybeAssignee: Option.Option<string>): string =>
  Option.match(maybeAssignee, {
    onNone: () => 'unassigned',
    onSome: assignee => assignee,
  })

const viewMaybeError = (
  maybeMessage: Option.Option<string>,
  h: HtmlBuilder<Message>,
): Html =>
  Option.match(maybeMessage, {
    onNone: () => h.empty,
    onSome: message => h.p([h.Class('text-red-600 text-sm')], [message]),
  })

const viewUser = (model: Model, h: HtmlBuilder<Message>): Html =>
  h.div(
    [h.Class('flex items-center gap-3')],
    [
      h.label([h.For('user')], ['Current user']),
      h.input([
        h.Id('user'),
        testId(h, 'user'),
        h.Type('text'),
        h.Value(model.user),
        h.OnInput(value => Message.UpdatedUser({ value })),
      ]),
    ],
  )

const viewFilters = (model: Model, h: HtmlBuilder<Message>): Html =>
  h.div(
    [h.Class('flex gap-2')],
    [
      h.button(
        [
          testId(h, 'filter-open'),
          h.Type('button'),
          h.OnClick(Message.ClickedFilter({ filter: 'open' })),
          h.Class(model.filter === 'open' ? 'font-bold' : ''),
        ],
        ['Open'],
      ),
      h.button(
        [
          testId(h, 'filter-closed'),
          h.Type('button'),
          h.OnClick(Message.ClickedFilter({ filter: 'closed' })),
          h.Class(model.filter === 'closed' ? 'font-bold' : ''),
        ],
        ['Closed'],
      ),
    ],
  )

const viewRow = (
  model: Model,
  row: IssueRow,
  h: HtmlBuilder<Message>,
): Html =>
  h.keyed('li')(
    String(row.id),
    [h.Class('flex items-center gap-2')],
    [
      h.div(
        [
          testId(h, 'issue'),
          h.Class('flex-1 cursor-pointer'),
          h.OnClick(Message.ClickedIssue({ id: row.id })),
        ],
        [`#${row.id} ${row.title} (${assigneeLabel(row.maybeAssignee)})`],
      ),
      h.button(
        [
          testId(h, 'row-assign'),
          h.Type('button'),
          h.OnClick(Message.ClickedRowAssign({ id: row.id })),
        ],
        [`assign to ${model.user}`],
      ),
      model.filter === 'open'
        ? h.button(
            [
              testId(h, 'row-close'),
              h.Type('button'),
              h.OnClick(Message.ClickedRowClose({ id: row.id })),
            ],
            ['close'],
          )
        : h.empty,
    ],
  )

const viewList = (model: Model, h: HtmlBuilder<Message>): Html =>
  IssueList.match<Html>(model.list, {
    Loading: () =>
      h.div([testId(h, 'list')], [`loading ${model.filter} issues`]),
    Failed: ({ message }) =>
      h.div([testId(h, 'list')], [`list error: ${message}`]),
    Loaded: ({ rows }) =>
      h.div(
        [testId(h, 'list')],
        [
          h.ul(
            [h.Class('space-y-2')],
            rows
              .filter(row => model.filter === 'closed' || !row.isClosing)
              .map(row => viewRow(model, row, h)),
          ),
        ],
      ),
  })

const viewDetailStatus = (
  selected: SelectedIssue,
  h: HtmlBuilder<Message>,
): Html =>
  DetailState.match<Html>(selected.detail, {
    Loading: () => h.h2([], [`loading #${selected.id}`]),
    Loaded: ({ title, body }) =>
      h.div(
        [],
        [h.h2([], [`#${selected.id} ${title}`]), h.p([], [body])],
      ),
    NotFound: () =>
      h.p([], [`detail error: issue #${selected.id} not found`]),
    Failed: ({ message }) => h.p([], [`detail error: ${message}`]),
  })

const viewLoadStatus = (
  status: LoadStatus,
  loadingText: string,
  errorPrefix: string,
  h: HtmlBuilder<Message>,
): Html =>
  LoadStatus.match<Html>(status, {
    Loading: () => h.p([], [loadingText]),
    Loaded: () => h.empty,
    Failed: ({ message }) => h.p([], [`${errorPrefix}: ${message}`]),
  })

const viewComments = (selected: SelectedIssue, h: HtmlBuilder<Message>): Html =>
  h.div(
    [testId(h, 'comments')],
    [
      viewLoadStatus(selected.commentsStatus, 'loading comments', 'comments error', h),
      h.ul(
        [],
        selected.comments.map(row =>
          h.keyed('li')(
            String(row.key),
            [testId(h, 'comment')],
            [
              `${row.author}: ${row.text}${row.isSending ? ' (sending…)' : ''}`,
            ],
          ),
        ),
      ),
    ],
  )

const viewLabels = (selected: SelectedIssue, h: HtmlBuilder<Message>): Html =>
  h.div(
    [testId(h, 'labels')],
    [
      viewLoadStatus(selected.labelsStatus, 'loading labels', 'labels error', h),
      h.ul(
        [],
        selected.labels
          .filter(row => !row.isRemoving)
          .map(row =>
            h.keyed('li')(
              row.name,
              [h.Class('flex items-center gap-2')],
              [
                h.span([testId(h, 'label')], [row.name]),
                h.button(
                  [
                    testId(h, 'remove-label'),
                    h.Type('button'),
                    h.OnClick(Message.ClickedRemoveLabel({ label: row.name })),
                  ],
                  [`remove ${row.name}`],
                ),
              ],
            ),
          ),
      ),
    ],
  )

const viewRelated = (selected: SelectedIssue, h: HtmlBuilder<Message>): Html =>
  DetailState.match<Html>(selected.detail, {
    Loading: () => h.empty,
    NotFound: () => h.empty,
    Failed: () => h.empty,
    Loaded: () =>
      RelatedState.match<Html>(selected.related, {
        Loading: () =>
          h.div([testId(h, 'related')], ['finding related help']),
        Failed: ({ message }) =>
          h.div([testId(h, 'related')], [`related help failed: ${message}`]),
        Loaded: ({ hits }) =>
          hits.length === 0
            ? h.div([testId(h, 'related')], ['no related help'])
            : h.div(
                [testId(h, 'related')],
                hits
                  .slice(0, 3)
                  .map(hit =>
                    h.button(
                      [
                        testId(h, 'related-hit'),
                        h.Type('button'),
                        h.OnClick(Message.ClickedRelatedHit({ id: hit.id })),
                      ],
                      [hit.name],
                    ),
                  ),
              ),
      }),
  })

const viewSelected = (
  user: string,
  selected: SelectedIssue,
  h: HtmlBuilder<Message>,
): Array<Html> => [
  viewDetailStatus(selected, h),
  h.button(
    [testId(h, 'retry'), h.Type('button'), h.OnClick(Message.ClickedRetryIssue())],
    ['retry'],
  ),
  h.div(
    [h.Class('flex flex-wrap gap-2')],
    [
      h.button(
        [testId(h, 'assign'), h.Type('button'), h.OnClick(Message.ClickedAssign())],
        [`assign to ${user}`],
      ),
      h.input([
        testId(h, 'title-input'),
        h.Type('text'),
        h.Value(selected.titleInput),
        h.OnInput(value => Message.UpdatedTitleInput({ value })),
      ]),
      h.button(
        [testId(h, 'rename'), h.Type('button'), h.OnClick(Message.ClickedRename())],
        ['rename'],
      ),
      h.button(
        [testId(h, 'close'), h.Type('button'), h.OnClick(Message.ClickedClose())],
        ['close'],
      ),
    ],
  ),
  viewMaybeError(selected.maybeAssignError, h),
  viewMaybeError(selected.maybeRenameError, h),
  viewMaybeError(selected.maybeCloseError, h),
  viewComments(selected, h),
  h.div(
    [],
    [
      h.input([
        testId(h, 'comment-input'),
        h.Type('text'),
        h.Value(selected.commentInput),
        h.OnInput(value => Message.UpdatedCommentInput({ value })),
      ]),
      h.button(
        [testId(h, 'post'), h.Type('button'), h.OnClick(Message.ClickedPost())],
        ['post'],
      ),
      viewMaybeError(selected.maybePostError, h),
    ],
  ),
  viewLabels(selected, h),
  h.div(
    [],
    [
      h.input([
        testId(h, 'label-input'),
        h.Type('text'),
        h.Value(selected.labelInput),
        h.OnInput(value => Message.UpdatedLabelInput({ value })),
      ]),
      h.button(
        [testId(h, 'add-label'), h.Type('button'), h.OnClick(Message.ClickedAddLabel())],
        ['add label'],
      ),
      viewMaybeError(selected.maybeLabelError, h),
    ],
  ),
  viewRelated(selected, h),
]

const viewDetail = (model: Model, h: HtmlBuilder<Message>): Html =>
  h.div(
    [testId(h, 'detail'), h.Class('space-y-4')],
    Option.match(model.maybeSelected, {
      onNone: (): Array<Html> => [h.p([], ['select an issue'])],
      onSome: selected => viewSelected(model.user, selected, h),
    }),
  )

const viewRowError = (model: Model, h: HtmlBuilder<Message>): Html =>
  Option.match(model.maybeRowError, {
    onNone: () => h.empty,
    onSome: message => h.p([testId(h, 'row-error')], [message]),
  })

const viewPage = (model: Model, h: HtmlBuilder<Message>): Html =>
  h.div(
    [h.Class('space-y-6')],
    [
      viewUser(model, h),
      viewFilters(model, h),
      h.div(
        [h.Class('grid gap-6 md:grid-cols-2')],
        [viewList(model, h), viewDetail(model, h)],
      ),
      viewRowError(model, h),
    ],
  )

export const view = Submodel.defineView<Model, Message>(viewPage)
