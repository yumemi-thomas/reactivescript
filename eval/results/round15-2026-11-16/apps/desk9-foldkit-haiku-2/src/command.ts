import { Array, Effect, Option, Schema } from 'effect'
import { Command } from 'foldkit'

import {
  addComment,
  addLabel,
  assign,
  closeIssue,
  fetchComments,
  fetchIssue,
  fetchIssues,
  fetchItem,
  fetchLabels,
  loadSettings,
  removeLabel,
  renameIssue,
  saveSettings,
  search,
} from './api.js'
import { Message } from './message'
import { Filter, IssueRow, Origin, Settings } from './model'

// COMMAND

const failureMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

const attempt = <A>(run: () => Promise<A>) =>
  Effect.tryPromise({ try: run, catch: failureMessage })

const toIssueRow = (issue: {
  id: number
  title: string
  assignee: string | null
}): IssueRow => ({
  id: issue.id,
  title: issue.title,
  assignee: Option.fromNullishOr(issue.assignee),
  closing: false,
})

export const LoadIssues = Command.define('LoadIssues', {
  args: { filter: Filter },
  messages: [Message.SucceededLoadIssues, Message.FailedLoadIssues],
  execute: ({ filter }) =>
    attempt(() => fetchIssues(filter)).pipe(
      Effect.map(issues =>
        Message.SucceededLoadIssues({
          filter,
          issues: Array.map(issues, toIssueRow),
        }),
      ),
      Effect.catch(message =>
        Effect.succeed(Message.FailedLoadIssues({ filter, message })),
      ),
    ),
})

export const LoadIssue = Command.define('LoadIssue', {
  args: { id: Schema.Number },
  messages: [Message.SucceededLoadIssue, Message.FailedLoadIssue],
  execute: ({ id }) =>
    attempt(() => fetchIssue(id)).pipe(
      Effect.map(issue =>
        Message.SucceededLoadIssue({
          id,
          issue: Option.fromNullishOr(issue),
        }),
      ),
      Effect.catch(message =>
        Effect.succeed(Message.FailedLoadIssue({ id, message })),
      ),
    ),
})

export const RenameIssue = Command.define('RenameIssue', {
  args: {
    id: Schema.Number,
    title: Schema.String,
    previousTitle: Schema.String,
  },
  messages: [Message.SucceededRenameIssue, Message.FailedRenameIssue],
  execute: ({ id, title, previousTitle }) =>
    attempt(() => renameIssue(id, title)).pipe(
      Effect.map(renamed =>
        Message.SucceededRenameIssue({ id, title: renamed.title }),
      ),
      Effect.catch(message =>
        Effect.succeed(
          Message.FailedRenameIssue({ id, previousTitle, message }),
        ),
      ),
    ),
})

export const AssignIssue = Command.define('AssignIssue', {
  args: {
    id: Schema.Number,
    user: Schema.String,
    previous: Schema.Option(Schema.String),
    origin: Origin,
  },
  messages: [Message.SucceededAssignIssue, Message.FailedAssignIssue],
  execute: ({ id, user, previous, origin }) =>
    attempt(() => assign(id, user)).pipe(
      Effect.map(assigned =>
        Message.SucceededAssignIssue({ id, assignee: assigned.assignee }),
      ),
      Effect.catch(message =>
        Effect.succeed(
          Message.FailedAssignIssue({ id, previous, origin, message }),
        ),
      ),
    ),
})

export const CloseIssue = Command.define('CloseIssue', {
  args: { id: Schema.Number, origin: Origin },
  messages: [Message.SucceededCloseIssue, Message.FailedCloseIssue],
  execute: ({ id, origin }) =>
    attempt(() => closeIssue(id)).pipe(
      Effect.map(() => Message.SucceededCloseIssue({ id })),
      Effect.catch(message =>
        Effect.succeed(Message.FailedCloseIssue({ id, origin, message })),
      ),
    ),
})

export const LoadComments = Command.define('LoadComments', {
  args: { id: Schema.Number },
  messages: [Message.SucceededLoadComments, Message.FailedLoadComments],
  execute: ({ id }) =>
    attempt(() => fetchComments(id)).pipe(
      Effect.map(comments => Message.SucceededLoadComments({ id, comments })),
      Effect.catch(message =>
        Effect.succeed(Message.FailedLoadComments({ id, message })),
      ),
    ),
})

export const PostComment = Command.define('PostComment', {
  args: {
    id: Schema.Number,
    key: Schema.Number,
    author: Schema.String,
    text: Schema.String,
  },
  messages: [Message.SucceededPostComment, Message.FailedPostComment],
  execute: ({ id, key, author, text }) =>
    attempt(() => addComment(id, author, text)).pipe(
      Effect.map(comment =>
        Message.SucceededPostComment({ id, key, comment }),
      ),
      Effect.catch(message =>
        Effect.succeed(Message.FailedPostComment({ id, key, message })),
      ),
    ),
})

export const LoadLabels = Command.define('LoadLabels', {
  args: { id: Schema.Number },
  messages: [Message.SucceededLoadLabels, Message.FailedLoadLabels],
  execute: ({ id }) =>
    attempt(() => fetchLabels(id)).pipe(
      Effect.map(labels => Message.SucceededLoadLabels({ id, labels })),
      Effect.catch(message =>
        Effect.succeed(Message.FailedLoadLabels({ id, message })),
      ),
    ),
})

export const AddLabel = Command.define('AddLabel', {
  args: { id: Schema.Number, label: Schema.String },
  messages: [Message.SucceededAddLabel, Message.FailedAddLabel],
  execute: ({ id, label }) =>
    attempt(() => addLabel(id, label)).pipe(
      Effect.map(() => Message.SucceededAddLabel({ id, label })),
      Effect.catch(message =>
        Effect.succeed(Message.FailedAddLabel({ id, label, message })),
      ),
    ),
})

export const RemoveLabel = Command.define('RemoveLabel', {
  args: { id: Schema.Number, label: Schema.String },
  messages: [Message.SucceededRemoveLabel, Message.FailedRemoveLabel],
  execute: ({ id, label }) =>
    attempt(() => removeLabel(id, label)).pipe(
      Effect.map(() => Message.SucceededRemoveLabel({ id, label })),
      Effect.catch(message =>
        Effect.succeed(Message.FailedRemoveLabel({ id, label, message })),
      ),
    ),
})

export const SearchRelated = Command.define('SearchRelated', {
  args: { id: Schema.Number, query: Schema.String },
  messages: [Message.SucceededSearchRelated, Message.FailedSearchRelated],
  execute: ({ id, query }) =>
    attempt(() => search(query)).pipe(
      Effect.map(hits => Message.SucceededSearchRelated({ id, hits })),
      Effect.catch(message =>
        Effect.succeed(Message.FailedSearchRelated({ id, message })),
      ),
    ),
})

export const SearchHelp = Command.define('SearchHelp', {
  args: { query: Schema.String },
  messages: [Message.SucceededSearchHelp, Message.FailedSearchHelp],
  execute: ({ query }) =>
    attempt(() => search(query)).pipe(
      Effect.map(hits => Message.SucceededSearchHelp({ query, hits })),
      Effect.catch(message =>
        Effect.succeed(Message.FailedSearchHelp({ query, message })),
      ),
    ),
})

export const FetchHelpItem = Command.define('FetchHelpItem', {
  args: { id: Schema.Number },
  messages: [Message.SucceededFetchHelpItem, Message.FailedFetchHelpItem],
  execute: ({ id }) =>
    attempt(() => fetchItem(id)).pipe(
      Effect.map(item =>
        Message.SucceededFetchHelpItem({
          id,
          item: Option.fromNullishOr(item),
        }),
      ),
      Effect.catch(message =>
        Effect.succeed(Message.FailedFetchHelpItem({ id, message })),
      ),
    ),
})

export const LoadSettings = Command.define('LoadSettings', {
  messages: [Message.SucceededLoadSettings, Message.FailedLoadSettings],
  execute: attempt(() => loadSettings()).pipe(
    Effect.map(settings => Message.SucceededLoadSettings({ settings })),
    Effect.catch(message => Effect.succeed(Message.FailedLoadSettings({ message }))),
  ),
})

export const SaveSettings = Command.define('SaveSettings', {
  args: { settings: Settings },
  messages: [Message.SucceededSaveSettings, Message.FailedSaveSettings],
  execute: ({ settings }) =>
    attempt(() => saveSettings(settings)).pipe(
      Effect.map(saved => Message.SucceededSaveSettings({ settings: saved })),
      Effect.catch(message =>
        Effect.succeed(Message.FailedSaveSettings({ message })),
      ),
    ),
})
