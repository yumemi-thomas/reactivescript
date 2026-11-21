import { Effect, Option, Schema } from 'effect'
import { Command } from 'foldkit'

import * as Api from './api.js'
import { Comment, Filter, Hit, IssueDetail, Item, Settings } from './domain'
import { Message } from './message'

// NOTE: Every answer is decoded before it reaches update, so a malformed
// response is reported like any other failure instead of corrupting the Model.

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

const ask = <S extends Schema.Top & { readonly DecodingServices: never }>(
  run: () => Promise<unknown>,
  schema: S,
): Effect.Effect<S['Type'], string> =>
  Effect.tryPromise({ try: run, catch: errorMessage }).pipe(
    Effect.flatMap(answer =>
      Schema.decodeUnknownEffect(schema)(answer).pipe(
        Effect.mapError(() => 'the server sent an unexpected answer'),
      ),
    ),
  )

const ApiIssue = Schema.Struct({
  id: Schema.Number,
  title: Schema.String,
  assignee: Schema.NullOr(Schema.String),
})

const Labels = Schema.Array(Schema.String)

// ISSUES

export const FetchIssues = Command.define('FetchIssues', {
  args: { token: Schema.Number, filter: Filter },
  messages: [Message.SucceededFetchIssues, Message.FailedFetchIssues],
  execute: ({ token, filter }) =>
    ask(() => Api.fetchIssues(filter), Schema.Array(ApiIssue)).pipe(
      Effect.map(issues =>
        Message.SucceededFetchIssues({
          token,
          issues: issues.map(({ id, title, assignee }) => ({
            id,
            title,
            maybeAssignee: Option.fromNullOr(assignee),
          })),
        }),
      ),
      Effect.catch(error =>
        Effect.succeed(Message.FailedFetchIssues({ token, error })),
      ),
    ),
})

export const FetchIssue = Command.define('FetchIssue', {
  args: { token: Schema.Number, issueId: Schema.Number },
  messages: [Message.SucceededFetchIssue, Message.FailedFetchIssue],
  execute: ({ token, issueId }) =>
    ask(() => Api.fetchIssue(issueId), Schema.NullOr(IssueDetail)).pipe(
      Effect.map(issue =>
        Message.SucceededFetchIssue({
          token,
          maybeIssue: Option.fromNullOr(issue),
        }),
      ),
      Effect.catch(error =>
        Effect.succeed(Message.FailedFetchIssue({ token, error })),
      ),
    ),
})

export const Assign = Command.define('Assign', {
  args: { opId: Schema.Number, issueId: Schema.Number, user: Schema.String },
  messages: [Message.SucceededAssign, Message.FailedAssign],
  execute: ({ opId, issueId, user }) =>
    ask(
      () => Api.assign(issueId, user),
      Schema.Struct({ id: Schema.Number, assignee: Schema.String }),
    ).pipe(
      Effect.map(({ assignee }) => Message.SucceededAssign({ opId, assignee })),
      Effect.catch(error =>
        Effect.succeed(Message.FailedAssign({ opId, error })),
      ),
    ),
})

export const RenameIssue = Command.define('RenameIssue', {
  args: { opId: Schema.Number, issueId: Schema.Number, title: Schema.String },
  messages: [Message.SucceededRenameIssue, Message.FailedRenameIssue],
  execute: ({ opId, issueId, title }) =>
    ask(
      () => Api.renameIssue(issueId, title),
      Schema.Struct({ id: Schema.Number, title: Schema.String }),
    ).pipe(
      Effect.map(renamed =>
        Message.SucceededRenameIssue({ opId, title: renamed.title }),
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
    ask(
      () => Api.closeIssue(issueId),
      Schema.Struct({ id: Schema.Number }),
    ).pipe(
      Effect.as(Message.SucceededCloseIssue({ opId })),
      Effect.catch(error =>
        Effect.succeed(Message.FailedCloseIssue({ opId, error })),
      ),
    ),
})

export const FetchComments = Command.define('FetchComments', {
  args: { token: Schema.Number, issueId: Schema.Number },
  messages: [Message.SucceededFetchComments, Message.FailedFetchComments],
  execute: ({ token, issueId }) =>
    ask(() => Api.fetchComments(issueId), Schema.Array(Comment)).pipe(
      Effect.map(comments =>
        Message.SucceededFetchComments({ token, comments }),
      ),
      Effect.catch(error =>
        Effect.succeed(Message.FailedFetchComments({ token, error })),
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
    ask(() => Api.addComment(issueId, author, text), Comment).pipe(
      Effect.map(comment => Message.SucceededAddComment({ opId, comment })),
      Effect.catch(error =>
        Effect.succeed(Message.FailedAddComment({ opId, error })),
      ),
    ),
})

export const FetchLabels = Command.define('FetchLabels', {
  args: { token: Schema.Number, issueId: Schema.Number },
  messages: [Message.SucceededFetchLabels, Message.FailedFetchLabels],
  execute: ({ token, issueId }) =>
    ask(() => Api.fetchLabels(issueId), Labels).pipe(
      Effect.map(labels => Message.SucceededFetchLabels({ token, labels })),
      Effect.catch(error =>
        Effect.succeed(Message.FailedFetchLabels({ token, error })),
      ),
    ),
})

export const AddLabel = Command.define('AddLabel', {
  args: { opId: Schema.Number, issueId: Schema.Number, label: Schema.String },
  messages: [Message.SucceededChangeLabel, Message.FailedChangeLabel],
  execute: ({ opId, issueId, label }) =>
    ask(() => Api.addLabel(issueId, label), Labels).pipe(
      Effect.map(labels => Message.SucceededChangeLabel({ opId, labels })),
      Effect.catch(error =>
        Effect.succeed(Message.FailedChangeLabel({ opId, error })),
      ),
    ),
})

export const RemoveLabel = Command.define('RemoveLabel', {
  args: { opId: Schema.Number, issueId: Schema.Number, label: Schema.String },
  messages: [Message.SucceededChangeLabel, Message.FailedChangeLabel],
  execute: ({ opId, issueId, label }) =>
    ask(() => Api.removeLabel(issueId, label), Labels).pipe(
      Effect.map(labels => Message.SucceededChangeLabel({ opId, labels })),
      Effect.catch(error =>
        Effect.succeed(Message.FailedChangeLabel({ opId, error })),
      ),
    ),
})

export const SearchRelated = Command.define('SearchRelated', {
  args: { token: Schema.Number, query: Schema.String },
  messages: [Message.SucceededSearchRelated, Message.FailedSearchRelated],
  execute: ({ token, query }) =>
    ask(() => Api.search(query), Schema.Array(Hit)).pipe(
      Effect.map(hits => Message.SucceededSearchRelated({ token, hits })),
      Effect.catch(error =>
        Effect.succeed(Message.FailedSearchRelated({ token, error })),
      ),
    ),
})

// HELP

export const Search = Command.define('Search', {
  args: { token: Schema.Number, query: Schema.String },
  messages: [Message.SucceededSearch, Message.FailedSearch],
  execute: ({ token, query }) =>
    ask(() => Api.search(query), Schema.Array(Hit)).pipe(
      Effect.map(hits => Message.SucceededSearch({ token, query, hits })),
      Effect.catch(error =>
        Effect.succeed(Message.FailedSearch({ token, error })),
      ),
    ),
})

export const FetchItem = Command.define('FetchItem', {
  args: { token: Schema.Number, hitId: Schema.Number },
  messages: [Message.SucceededFetchItem, Message.FailedFetchItem],
  execute: ({ token, hitId }) =>
    ask(() => Api.fetchItem(hitId), Schema.NullOr(Item)).pipe(
      Effect.map(item =>
        Message.SucceededFetchItem({
          token,
          maybeItem: Option.fromNullOr(item),
        }),
      ),
      Effect.catch(error =>
        Effect.succeed(Message.FailedFetchItem({ token, error })),
      ),
    ),
})

// SETTINGS

export const LoadSettings = Command.define('LoadSettings', {
  args: { token: Schema.Number },
  messages: [Message.SucceededLoadSettings, Message.FailedLoadSettings],
  execute: ({ token }) =>
    ask(() => Api.loadSettings(), Settings).pipe(
      Effect.map(settings => Message.SucceededLoadSettings({ token, settings })),
      Effect.catch(error =>
        Effect.succeed(Message.FailedLoadSettings({ token, error })),
      ),
    ),
})

export const SaveSettings = Command.define('SaveSettings', {
  args: { token: Schema.Number, settings: Settings },
  messages: [Message.SucceededSaveSettings, Message.FailedSaveSettings],
  execute: ({ token, settings }) =>
    ask(
      () =>
        Api.saveSettings({
          name: settings.name,
          theme: settings.theme,
          density: settings.density,
        }),
      Settings,
    ).pipe(
      Effect.map(saved =>
        Message.SucceededSaveSettings({ token, settings: saved }),
      ),
      Effect.catch(error =>
        Effect.succeed(Message.FailedSaveSettings({ token, error })),
      ),
    ),
})
