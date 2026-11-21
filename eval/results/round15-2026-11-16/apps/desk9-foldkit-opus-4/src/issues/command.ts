import { Effect, Schema } from 'effect'
import { Command } from 'foldkit'

import * as Api from '../api.js'
import { errorMessage, request } from '../backend'
import {
  Assignment,
  Closing,
  Comment,
  Filter,
  Hit,
  IssueDetail,
  IssueRow,
  Labels,
  Renaming,
} from '../domain'
import { Message } from './message'
import { ActionSource } from './model'

// COMMAND

export const FetchIssues = Command.define('FetchIssues', {
  args: { requestId: Schema.Number, filter: Filter },
  messages: [Message.SucceededFetchIssues, Message.FailedFetchIssues],
  execute: ({ requestId, filter }) =>
    request(Schema.Array(IssueRow), () => Api.fetchIssues(filter)).pipe(
      Effect.map(issues =>
        Message.SucceededFetchIssues({ requestId, filter, issues }),
      ),
      Effect.catch(error =>
        Effect.succeed(
          Message.FailedFetchIssues({ requestId, error: errorMessage(error) }),
        ),
      ),
    ),
})

export const FetchIssue = Command.define('FetchIssue', {
  args: { requestId: Schema.Number, issueId: Schema.Number },
  messages: [Message.SucceededFetchIssue, Message.FailedFetchIssue],
  execute: ({ requestId, issueId }) =>
    request(Schema.OptionFromNullOr(IssueDetail), () =>
      Api.fetchIssue(issueId),
    ).pipe(
      Effect.map(maybeIssue =>
        Message.SucceededFetchIssue({ requestId, maybeIssue }),
      ),
      Effect.catch(error =>
        Effect.succeed(
          Message.FailedFetchIssue({ requestId, error: errorMessage(error) }),
        ),
      ),
    ),
})

export const SearchRelated = Command.define('SearchRelated', {
  args: { requestId: Schema.Number, query: Schema.String },
  messages: [Message.SucceededSearchRelated, Message.FailedSearchRelated],
  execute: ({ requestId, query }) =>
    request(Schema.Array(Hit), () => Api.search(query)).pipe(
      Effect.map(hits => Message.SucceededSearchRelated({ requestId, hits })),
      Effect.catch(error =>
        Effect.succeed(
          Message.FailedSearchRelated({ requestId, error: errorMessage(error) }),
        ),
      ),
    ),
})

export const FetchComments = Command.define('FetchComments', {
  args: { selectionId: Schema.Number, issueId: Schema.Number },
  messages: [Message.SucceededFetchComments, Message.FailedFetchComments],
  execute: ({ selectionId, issueId }) =>
    request(Schema.Array(Comment), () => Api.fetchComments(issueId)).pipe(
      Effect.map(comments =>
        Message.SucceededFetchComments({ selectionId, comments }),
      ),
      Effect.catch(error =>
        Effect.succeed(
          Message.FailedFetchComments({
            selectionId,
            error: errorMessage(error),
          }),
        ),
      ),
    ),
})

export const FetchLabels = Command.define('FetchLabels', {
  args: { selectionId: Schema.Number, issueId: Schema.Number },
  messages: [Message.SucceededFetchLabels, Message.FailedFetchLabels],
  execute: ({ selectionId, issueId }) =>
    request(Labels, () => Api.fetchLabels(issueId)).pipe(
      Effect.map(labels => Message.SucceededFetchLabels({ selectionId, labels })),
      Effect.catch(error =>
        Effect.succeed(
          Message.FailedFetchLabels({ selectionId, error: errorMessage(error) }),
        ),
      ),
    ),
})

export const AssignIssue = Command.define('AssignIssue', {
  args: {
    opId: Schema.Number,
    issueId: Schema.Number,
    user: Schema.String,
    source: ActionSource,
  },
  messages: [Message.SucceededAssign, Message.FailedAssign],
  execute: ({ opId, issueId, user, source }) =>
    request(Assignment, () => Api.assign(issueId, user)).pipe(
      Effect.map(({ assignee }) =>
        Message.SucceededAssign({ opId, issueId, assignee }),
      ),
      Effect.catch(error =>
        Effect.succeed(
          Message.FailedAssign({ opId, source, error: errorMessage(error) }),
        ),
      ),
    ),
})

export const RenameIssue = Command.define('RenameIssue', {
  args: {
    opId: Schema.Number,
    selectionId: Schema.Number,
    issueId: Schema.Number,
    title: Schema.String,
  },
  messages: [Message.SucceededRenameIssue, Message.FailedRenameIssue],
  execute: ({ opId, selectionId, issueId, title }) =>
    request(Renaming, () => Api.renameIssue(issueId, title)).pipe(
      Effect.map(renaming =>
        Message.SucceededRenameIssue({ opId, issueId, title: renaming.title }),
      ),
      Effect.catch(error =>
        Effect.succeed(
          Message.FailedRenameIssue({
            opId,
            selectionId,
            error: errorMessage(error),
          }),
        ),
      ),
    ),
})

export const CloseIssue = Command.define('CloseIssue', {
  args: { opId: Schema.Number, issueId: Schema.Number, source: ActionSource },
  messages: [Message.SucceededCloseIssue, Message.FailedCloseIssue],
  execute: ({ opId, issueId, source }) =>
    request(Closing, () => Api.closeIssue(issueId)).pipe(
      Effect.map(() => Message.SucceededCloseIssue({ opId, issueId })),
      Effect.catch(error =>
        Effect.succeed(
          Message.FailedCloseIssue({ opId, source, error: errorMessage(error) }),
        ),
      ),
    ),
})

export const AddComment = Command.define('AddComment', {
  args: {
    selectionId: Schema.Number,
    opId: Schema.Number,
    issueId: Schema.Number,
    author: Schema.String,
    text: Schema.String,
  },
  messages: [Message.SucceededAddComment, Message.FailedAddComment],
  execute: ({ selectionId, opId, issueId, author, text }) =>
    request(Comment, () => Api.addComment(issueId, author, text)).pipe(
      Effect.map(comment =>
        Message.SucceededAddComment({ selectionId, opId, comment }),
      ),
      Effect.catch(error =>
        Effect.succeed(
          Message.FailedAddComment({
            selectionId,
            opId,
            error: errorMessage(error),
          }),
        ),
      ),
    ),
})

export const AddLabel = Command.define('AddLabel', {
  args: {
    selectionId: Schema.Number,
    opId: Schema.Number,
    issueId: Schema.Number,
    label: Schema.String,
  },
  messages: [Message.SucceededAddLabel, Message.FailedAddLabel],
  execute: ({ selectionId, opId, issueId, label }) =>
    request(Labels, () => Api.addLabel(issueId, label)).pipe(
      Effect.map(labels =>
        Message.SucceededAddLabel({ selectionId, opId, labels }),
      ),
      Effect.catch(error =>
        Effect.succeed(
          Message.FailedAddLabel({
            selectionId,
            opId,
            error: errorMessage(error),
          }),
        ),
      ),
    ),
})

export const RemoveLabel = Command.define('RemoveLabel', {
  args: {
    selectionId: Schema.Number,
    opId: Schema.Number,
    issueId: Schema.Number,
    label: Schema.String,
  },
  messages: [Message.SucceededRemoveLabel, Message.FailedRemoveLabel],
  execute: ({ selectionId, opId, issueId, label }) =>
    request(Labels, () => Api.removeLabel(issueId, label)).pipe(
      Effect.map(labels =>
        Message.SucceededRemoveLabel({ selectionId, opId, labels }),
      ),
      Effect.catch(error =>
        Effect.succeed(
          Message.FailedRemoveLabel({
            selectionId,
            opId,
            error: errorMessage(error),
          }),
        ),
      ),
    ),
})
