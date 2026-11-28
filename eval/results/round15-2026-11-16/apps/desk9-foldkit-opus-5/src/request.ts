import { Array, Effect, Option, Schema, pipe } from 'effect'

import * as Api from './api.js'
import {
  Comment,
  type Filter,
  Hit,
  type Issue,
  IssueDetail,
  Item,
  Settings,
} from './domain'

const describeError = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

const UNEXPECTED_RESPONSE = 'unexpected response from the server'

const callApi = <A>(
  schema: Schema.Decoder<A>,
  call: () => Promise<unknown>,
): Effect.Effect<A, string> =>
  Effect.tryPromise({ try: call, catch: describeError }).pipe(
    Effect.flatMap(response =>
      pipe(
        Schema.decodeUnknownEffect(schema)(response),
        Effect.mapError(() => UNEXPECTED_RESPONSE),
      ),
    ),
  )

// ISSUES

const IssueResponse = Schema.Struct({
  id: Schema.Number,
  title: Schema.String,
  assignee: Schema.NullOr(Schema.String),
})

export const fetchIssues = (filter: Filter): Effect.Effect<ReadonlyArray<Issue>, string> =>
  callApi(Schema.Array(IssueResponse), () => Api.fetchIssues(filter)).pipe(
    Effect.map(
      Array.map(({ id, title, assignee }) => ({
        id,
        title,
        maybeAssignee: Option.fromNullishOr(assignee),
      })),
    ),
  )

export const fetchIssue = (id: number) =>
  callApi(Schema.OptionFromNullOr(IssueDetail), () => Api.fetchIssue(id))

export const assign = (id: number, user: string) =>
  callApi(Schema.Struct({ id: Schema.Number, assignee: Schema.String }), () =>
    Api.assign(id, user),
  )

export const renameIssue = (id: number, title: string) =>
  callApi(Schema.Struct({ id: Schema.Number, title: Schema.String }), () =>
    Api.renameIssue(id, title),
  )

export const closeIssue = (id: number) =>
  callApi(Schema.Struct({ id: Schema.Number }), () => Api.closeIssue(id))

export const fetchComments = (id: number) =>
  callApi(Schema.Array(Comment), () => Api.fetchComments(id))

export const addComment = (id: number, author: string, text: string) =>
  callApi(Comment, () => Api.addComment(id, author, text))

export const fetchLabels = (id: number) =>
  callApi(Schema.Array(Schema.String), () => Api.fetchLabels(id))

export const addLabel = (id: number, label: string) =>
  callApi(Schema.Array(Schema.String), () => Api.addLabel(id, label))

export const removeLabel = (id: number, label: string) =>
  callApi(Schema.Array(Schema.String), () => Api.removeLabel(id, label))

// HELP

export const search = (query: string) =>
  callApi(Schema.Array(Hit), () => Api.search(query))

export const fetchItem = (id: number) =>
  callApi(Schema.OptionFromNullOr(Item), () => Api.fetchItem(id))

// SETTINGS

export const loadSettings = () =>
  callApi(Settings, () => Api.loadSettings())

export const saveSettings = (settings: Settings) =>
  callApi(Settings, () => Api.saveSettings(settings))
