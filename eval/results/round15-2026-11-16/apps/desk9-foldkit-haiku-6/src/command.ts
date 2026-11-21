import { Effect, Option, Schema } from 'effect'
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
import { Filter, Origin, Settings } from './domain.js'
import { Message } from './message.js'

const attempt = <A>(run: () => Promise<A>) =>
  Effect.tryPromise({
    try: run,
    catch: cause => (cause instanceof Error ? cause.message : String(cause)),
  })

export const FetchIssues = Command.define('FetchIssues', {
  args: { visit: Schema.Number, seq: Schema.Number, filter: Filter },
  messages: [Message.SucceededFetchIssues, Message.FailedFetchIssues],
  execute: ({ visit, seq, filter }) =>
    attempt(() => fetchIssues(filter)).pipe(
      Effect.map(issues =>
        Message.SucceededFetchIssues({
          visit,
          seq,
          issues: issues.map(issue => ({
            id: issue.id,
            title: issue.title,
            assignee: Option.fromNullishOr(issue.assignee),
          })),
        }),
      ),
      Effect.catch(error =>
        Effect.succeed(Message.FailedFetchIssues({ visit, seq, error })),
      ),
    ),
})

export const FetchIssue = Command.define('FetchIssue', {
  args: { visit: Schema.Number, seq: Schema.Number, id: Schema.Number },
  messages: [Message.SucceededFetchIssue, Message.FailedFetchIssue],
  execute: ({ visit, seq, id }) =>
    attempt(() => fetchIssue(id)).pipe(
      Effect.map(issue =>
        Message.SucceededFetchIssue({
          visit,
          seq,
          issue: Option.fromNullishOr(issue),
        }),
      ),
      Effect.catch(error =>
        Effect.succeed(Message.FailedFetchIssue({ visit, seq, error })),
      ),
    ),
})

export const AssignIssue = Command.define('AssignIssue', {
  args: {
    visit: Schema.Number,
    origin: Origin,
    seq: Schema.Number,
    id: Schema.Number,
    user: Schema.String,
    previous: Schema.Option(Schema.String),
  },
  messages: [Message.SucceededAssign, Message.FailedAssign],
  execute: ({ visit, origin, seq, id, user, previous }) =>
    attempt(() => assign(id, user)).pipe(
      Effect.map(answer =>
        Message.SucceededAssign({
          visit,
          origin,
          seq,
          id,
          assignee: answer.assignee,
        }),
      ),
      Effect.catch(error =>
        Effect.succeed(
          Message.FailedAssign({ visit, origin, seq, id, previous, error }),
        ),
      ),
    ),
})

export const RenameIssue = Command.define('RenameIssue', {
  args: {
    visit: Schema.Number,
    seq: Schema.Number,
    id: Schema.Number,
    title: Schema.String,
    previous: Schema.String,
  },
  messages: [Message.SucceededRename, Message.FailedRename],
  execute: ({ visit, seq, id, title, previous }) =>
    attempt(() => renameIssue(id, title)).pipe(
      Effect.map(answer =>
        Message.SucceededRename({
          visit,
          seq,
          id,
          title: answer.title,
        }),
      ),
      Effect.catch(error =>
        Effect.succeed(
          Message.FailedRename({ visit, seq, id, previous, error }),
        ),
      ),
    ),
})

export const CloseIssue = Command.define('CloseIssue', {
  args: {
    visit: Schema.Number,
    origin: Origin,
    seq: Schema.Number,
    id: Schema.Number,
  },
  messages: [Message.SucceededClose, Message.FailedClose],
  execute: ({ visit, origin, seq, id }) =>
    attempt(() => closeIssue(id)).pipe(
      Effect.map(() =>
        Message.SucceededClose({ visit, origin, seq, id }),
      ),
      Effect.catch(error =>
        Effect.succeed(
          Message.FailedClose({ visit, origin, seq, id, error }),
        ),
      ),
    ),
})

export const FetchComments = Command.define('FetchComments', {
  args: { visit: Schema.Number, seq: Schema.Number, id: Schema.Number },
  messages: [Message.SucceededFetchComments, Message.FailedFetchComments],
  execute: ({ visit, seq, id }) =>
    attempt(() => fetchComments(id)).pipe(
      Effect.map(comments =>
        Message.SucceededFetchComments({ visit, seq, comments }),
      ),
      Effect.catch(error =>
        Effect.succeed(Message.FailedFetchComments({ visit, seq, error })),
      ),
    ),
})

export const AddComment = Command.define('AddComment', {
  args: {
    visit: Schema.Number,
    seq: Schema.Number,
    key: Schema.Number,
    id: Schema.Number,
    author: Schema.String,
    text: Schema.String,
  },
  messages: [Message.SucceededPost, Message.FailedPost],
  execute: ({ visit, seq, key, id, author, text }) =>
    attempt(() => addComment(id, author, text)).pipe(
      Effect.map(() => Message.SucceededPost({ visit, seq, key })),
      Effect.catch(error =>
        Effect.succeed(Message.FailedPost({ visit, seq, key, error })),
      ),
    ),
})

export const FetchLabels = Command.define('FetchLabels', {
  args: { visit: Schema.Number, seq: Schema.Number, id: Schema.Number },
  messages: [Message.SucceededFetchLabels, Message.FailedFetchLabels],
  execute: ({ visit, seq, id }) =>
    attempt(() => fetchLabels(id)).pipe(
      Effect.map(labels => Message.SucceededFetchLabels({ visit, seq, labels })),
      Effect.catch(error =>
        Effect.succeed(Message.FailedFetchLabels({ visit, seq, error })),
      ),
    ),
})

export const AddLabel = Command.define('AddLabel', {
  args: {
    visit: Schema.Number,
    seq: Schema.Number,
    id: Schema.Number,
    label: Schema.String,
  },
  messages: [Message.SucceededAddLabel, Message.FailedAddLabel],
  execute: ({ visit, seq, id, label }) =>
    attempt(() => addLabel(id, label)).pipe(
      Effect.map(labels => Message.SucceededAddLabel({ visit, seq, labels })),
      Effect.catch(error =>
        Effect.succeed(Message.FailedAddLabel({ visit, seq, label, error })),
      ),
    ),
})

export const RemoveLabel = Command.define('RemoveLabel', {
  args: {
    visit: Schema.Number,
    seq: Schema.Number,
    id: Schema.Number,
    label: Schema.String,
    index: Schema.Number,
  },
  messages: [Message.SucceededRemoveLabel, Message.FailedRemoveLabel],
  execute: ({ visit, seq, id, label, index }) =>
    attempt(() => removeLabel(id, label)).pipe(
      Effect.map(labels =>
        Message.SucceededRemoveLabel({ visit, seq, labels }),
      ),
      Effect.catch(error =>
        Effect.succeed(
          Message.FailedRemoveLabel({ visit, seq, label, index, error }),
        ),
      ),
    ),
})

export const SearchRelated = Command.define('SearchRelated', {
  args: { visit: Schema.Number, seq: Schema.Number, title: Schema.String },
  messages: [Message.SucceededFetchRelated, Message.FailedFetchRelated],
  execute: ({ visit, seq, title }) =>
    attempt(() => search(title)).pipe(
      Effect.map(hits => Message.SucceededFetchRelated({ visit, seq, hits })),
      Effect.catch(error =>
        Effect.succeed(Message.FailedFetchRelated({ visit, seq, error })),
      ),
    ),
})

export const SearchHelp = Command.define('SearchHelp', {
  args: { visit: Schema.Number, query: Schema.String },
  messages: [Message.SucceededSearch, Message.FailedSearch],
  execute: ({ visit, query }) =>
    attempt(() => search(query)).pipe(
      Effect.map(hits => Message.SucceededSearch({ visit, query, hits })),
      Effect.catch(error =>
        Effect.succeed(Message.FailedSearch({ visit, query, error })),
      ),
    ),
})

export const FetchItem = Command.define('FetchItem', {
  args: { visit: Schema.Number, id: Schema.Number },
  messages: [Message.SucceededFetchItem, Message.FailedFetchItem],
  execute: ({ visit, id }) =>
    attempt(() => fetchItem(id)).pipe(
      Effect.map(item =>
        Message.SucceededFetchItem({
          visit,
          id,
          item: Option.fromNullishOr(item),
        }),
      ),
      Effect.catch(error =>
        Effect.succeed(Message.FailedFetchItem({ visit, id, error })),
      ),
    ),
})

export const LoadSettings = Command.define('LoadSettings', {
  args: { visit: Schema.Number },
  messages: [Message.SucceededLoadSettings, Message.FailedLoadSettings],
  execute: ({ visit }) =>
    attempt(() => loadSettings()).pipe(
      Effect.map(settings => Message.SucceededLoadSettings({ visit, settings })),
      Effect.catch(error =>
        Effect.succeed(Message.FailedLoadSettings({ visit, error })),
      ),
    ),
})

export const SaveSettings = Command.define('SaveSettings', {
  args: {
    visit: Schema.Number,
    seq: Schema.Number,
    settings: Settings,
  },
  messages: [Message.SucceededSaveSettings, Message.FailedSaveSettings],
  execute: ({ visit, seq, settings }) =>
    attempt(() => saveSettings(settings)).pipe(
      Effect.map(saved =>
        Message.SucceededSaveSettings({ visit, seq, settings: saved }),
      ),
      Effect.catch(error =>
        Effect.succeed(Message.FailedSaveSettings({ visit, seq, error })),
      ),
    ),
})
