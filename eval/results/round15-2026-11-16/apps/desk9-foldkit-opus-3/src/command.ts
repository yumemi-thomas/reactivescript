import { Effect, Option, Schema } from 'effect'
import { Command } from 'foldkit'

import * as Api from './api.js'
import { Comment, Filter, Hit, IssueDetail, Item, Settings } from './domain'
import { Message } from './message'

// WIRE

const WireIssue = Schema.Struct({
  id: Schema.Number,
  title: Schema.String,
  assignee: Schema.NullOr(Schema.String),
})

const WireIssues = Schema.Array(WireIssue)
const WireIssueDetail = Schema.NullOr(IssueDetail)
const WireAssigned = Schema.Struct({ id: Schema.Number, assignee: Schema.String })
const WireRenamed = Schema.Struct({ id: Schema.Number, title: Schema.String })
const WireClosed = Schema.Struct({ id: Schema.Number })
const WireComments = Schema.Array(Comment)
const WireLabels = Schema.Array(Schema.String)
const WireHits = Schema.Array(Hit)
const WireItem = Schema.NullOr(Item)

const errorMessage = (error: unknown): string => {
  if (error instanceof Error && error.message !== '') {
    return error.message
  }
  if (typeof error === 'string' && error !== '') {
    return error
  }
  return 'something went wrong'
}

const callApi = <S extends Schema.Constraint>(
  schema: S,
  request: () => Promise<unknown>,
): Effect.Effect<S['Type'], string, S['DecodingServices']> =>
  Effect.tryPromise({ try: request, catch: errorMessage }).pipe(
    Effect.flatMap(response =>
      Schema.decodeUnknownEffect(schema)(response).pipe(
        Effect.mapError(() => 'unexpected answer from the server'),
      ),
    ),
  )

// ISSUES

export const FetchIssues = Command.define('FetchIssues', {
  args: { requestId: Schema.Number, filter: Filter },
  messages: [Message.SucceededFetchIssues, Message.FailedFetchIssues],
  execute: ({ requestId, filter }) =>
    callApi(WireIssues, () => Api.fetchIssues(filter)).pipe(
      Effect.map(issues =>
        Message.SucceededFetchIssues({
          requestId,
          issues: issues.map(issue => ({
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

export const FetchIssue = Command.define('FetchIssue', {
  args: { requestId: Schema.Number, issueId: Schema.Number },
  messages: [Message.SucceededFetchIssue, Message.FailedFetchIssue],
  execute: ({ requestId, issueId }) =>
    callApi(WireIssueDetail, () => Api.fetchIssue(issueId)).pipe(
      Effect.map(detail =>
        Message.SucceededFetchIssue({
          requestId,
          maybeDetail: Option.fromNullishOr(detail),
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
    callApi(WireAssigned, () => Api.assign(issueId, user)).pipe(
      Effect.map(assigned =>
        Message.SucceededAssign({ opId, assignee: assigned.assignee }),
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
    callApi(WireRenamed, () => Api.renameIssue(issueId, title)).pipe(
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
    callApi(WireClosed, () => Api.closeIssue(issueId)).pipe(
      Effect.map(() => Message.SucceededCloseIssue({ opId })),
      Effect.catch(error =>
        Effect.succeed(Message.FailedCloseIssue({ opId, error })),
      ),
    ),
})

export const FetchComments = Command.define('FetchComments', {
  args: { token: Schema.Number, issueId: Schema.Number },
  messages: [Message.SucceededFetchComments, Message.FailedFetchComments],
  execute: ({ token, issueId }) =>
    callApi(WireComments, () => Api.fetchComments(issueId)).pipe(
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
    token: Schema.Number,
    opId: Schema.Number,
    issueId: Schema.Number,
    author: Schema.String,
    text: Schema.String,
  },
  messages: [Message.SucceededAddComment, Message.FailedAddComment],
  execute: ({ token, opId, issueId, author, text }) =>
    callApi(Comment, () => Api.addComment(issueId, author, text)).pipe(
      Effect.map(comment =>
        Message.SucceededAddComment({ token, opId, comment }),
      ),
      Effect.catch(error =>
        Effect.succeed(Message.FailedAddComment({ token, opId, error })),
      ),
    ),
})

export const FetchLabels = Command.define('FetchLabels', {
  args: { token: Schema.Number, issueId: Schema.Number },
  messages: [Message.SucceededFetchLabels, Message.FailedFetchLabels],
  execute: ({ token, issueId }) =>
    callApi(WireLabels, () => Api.fetchLabels(issueId)).pipe(
      Effect.map(labels => Message.SucceededFetchLabels({ token, labels })),
      Effect.catch(error =>
        Effect.succeed(Message.FailedFetchLabels({ token, error })),
      ),
    ),
})

const LabelChangeArgs = {
  token: Schema.Number,
  opId: Schema.Number,
  issueId: Schema.Number,
  label: Schema.String,
}

export const AddLabel = Command.define('AddLabel', {
  args: LabelChangeArgs,
  messages: [Message.SucceededChangeLabel, Message.FailedChangeLabel],
  execute: ({ token, opId, issueId, label }) =>
    callApi(WireLabels, () => Api.addLabel(issueId, label)).pipe(
      Effect.map(labels =>
        Message.SucceededChangeLabel({ token, opId, labels }),
      ),
      Effect.catch(error =>
        Effect.succeed(Message.FailedChangeLabel({ token, opId, error })),
      ),
    ),
})

export const RemoveLabel = Command.define('RemoveLabel', {
  args: LabelChangeArgs,
  messages: [Message.SucceededChangeLabel, Message.FailedChangeLabel],
  execute: ({ token, opId, issueId, label }) =>
    callApi(WireLabels, () => Api.removeLabel(issueId, label)).pipe(
      Effect.map(labels =>
        Message.SucceededChangeLabel({ token, opId, labels }),
      ),
      Effect.catch(error =>
        Effect.succeed(Message.FailedChangeLabel({ token, opId, error })),
      ),
    ),
})

export const SearchRelated = Command.define('SearchRelated', {
  args: { requestId: Schema.Number, query: Schema.String },
  messages: [Message.SucceededSearchRelated, Message.FailedSearchRelated],
  execute: ({ requestId, query }) =>
    callApi(WireHits, () => Api.search(query)).pipe(
      Effect.map(hits => Message.SucceededSearchRelated({ requestId, hits })),
      Effect.catch(error =>
        Effect.succeed(Message.FailedSearchRelated({ requestId, error })),
      ),
    ),
})

// HELP

export const Search = Command.define('Search', {
  args: { requestId: Schema.Number, query: Schema.String },
  messages: [Message.SucceededSearch, Message.FailedSearch],
  execute: ({ requestId, query }) =>
    callApi(WireHits, () => Api.search(query)).pipe(
      Effect.map(hits => Message.SucceededSearch({ requestId, hits })),
      Effect.catch(error =>
        Effect.succeed(Message.FailedSearch({ requestId, error })),
      ),
    ),
})

export const FetchItem = Command.define('FetchItem', {
  args: { requestId: Schema.Number, hitId: Schema.Number },
  messages: [Message.SucceededFetchItem, Message.FailedFetchItem],
  execute: ({ requestId, hitId }) =>
    callApi(WireItem, () => Api.fetchItem(hitId)).pipe(
      Effect.map(item =>
        Message.SucceededFetchItem({
          requestId,
          maybeItem: Option.fromNullishOr(item),
        }),
      ),
      Effect.catch(error =>
        Effect.succeed(Message.FailedFetchItem({ requestId, error })),
      ),
    ),
})

// SETTINGS

export const LoadSettings = Command.define('LoadSettings', {
  args: { requestId: Schema.Number },
  messages: [Message.SucceededLoadSettings, Message.FailedLoadSettings],
  execute: ({ requestId }) =>
    callApi(Settings, () => Api.loadSettings()).pipe(
      Effect.map(settings =>
        Message.SucceededLoadSettings({ requestId, settings }),
      ),
      Effect.catch(error =>
        Effect.succeed(Message.FailedLoadSettings({ requestId, error })),
      ),
    ),
})

export const SaveSettings = Command.define('SaveSettings', {
  args: { requestId: Schema.Number, settings: Settings },
  messages: [Message.SucceededSaveSettings, Message.FailedSaveSettings],
  execute: ({ requestId, settings }) =>
    callApi(Settings, () =>
      Api.saveSettings({
        name: settings.name,
        theme: settings.theme,
        density: settings.density,
      }),
    ).pipe(
      Effect.map(saved =>
        Message.SucceededSaveSettings({ requestId, settings: saved }),
      ),
      Effect.catch(error =>
        Effect.succeed(Message.FailedSaveSettings({ requestId, error })),
      ),
    ),
})
