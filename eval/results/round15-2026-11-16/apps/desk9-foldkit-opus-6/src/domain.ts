import { Effect, Schema } from 'effect'

import * as Api from './api.js'

// DOMAIN

export const IssueFilter = Schema.Literals(['open', 'closed'])
export type IssueFilter = typeof IssueFilter.Type

export const Issue = Schema.Struct({
  id: Schema.Number,
  title: Schema.String,
  assignee: Schema.NullOr(Schema.String),
})
export type Issue = typeof Issue.Type

export const IssueDetail = Schema.Struct({
  id: Schema.Number,
  title: Schema.String,
  body: Schema.String,
})
export type IssueDetail = typeof IssueDetail.Type

export const Comment = Schema.Struct({
  author: Schema.String,
  text: Schema.String,
})
export type Comment = typeof Comment.Type

export const Hit = Schema.Struct({ id: Schema.Number, name: Schema.String })
export type Hit = typeof Hit.Type

export const Item = Schema.Struct({
  id: Schema.Number,
  name: Schema.String,
  blurb: Schema.String,
})
export type Item = typeof Item.Type

export const Theme = Schema.Literals(['light', 'dark'])
export type Theme = typeof Theme.Type

export const Density = Schema.Literals(['comfortable', 'compact'])
export type Density = typeof Density.Type

export const Settings = Schema.Struct({
  name: Schema.String,
  theme: Theme,
  density: Density,
})
export type Settings = typeof Settings.Type

const AssignAnswer = Schema.Struct({
  id: Schema.Number,
  assignee: Schema.String,
})
const RenameAnswer = Schema.Struct({ id: Schema.Number, title: Schema.String })
const CloseAnswer = Schema.Struct({ id: Schema.Number })
const Labels = Schema.Array(Schema.String)

// API

const errorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message
  }
  return String(error)
}

const UNEXPECTED_ANSWER = 'unexpected answer from the server'

const call = <T>(
  schema: Schema.Decoder<T>,
  request: () => Promise<unknown>,
): Effect.Effect<T, string> =>
  Effect.tryPromise({ try: request, catch: errorMessage }).pipe(
    Effect.flatMap(answer =>
      Schema.decodeUnknownEffect(schema)(answer).pipe(
        Effect.mapError(() => UNEXPECTED_ANSWER),
      ),
    ),
  )

export const fetchIssues = (filter: IssueFilter) =>
  call(Schema.Array(Issue), () => Api.fetchIssues(filter))

export const fetchIssue = (id: number) =>
  call(Schema.NullOr(IssueDetail), () => Api.fetchIssue(id))

export const assign = (id: number, user: string) =>
  call(AssignAnswer, () => Api.assign(id, user))

export const renameIssue = (id: number, title: string) =>
  call(RenameAnswer, () => Api.renameIssue(id, title))

export const closeIssue = (id: number) =>
  call(CloseAnswer, () => Api.closeIssue(id))

export const fetchComments = (id: number) =>
  call(Schema.Array(Comment), () => Api.fetchComments(id))

export const addComment = (id: number, author: string, text: string) =>
  call(Comment, () => Api.addComment(id, author, text))

export const fetchLabels = (id: number) =>
  call(Labels, () => Api.fetchLabels(id))

export const addLabel = (id: number, label: string) =>
  call(Labels, () => Api.addLabel(id, label))

export const removeLabel = (id: number, label: string) =>
  call(Labels, () => Api.removeLabel(id, label))

export const search = (query: string) =>
  call(Schema.Array(Hit), () => Api.search(query))

export const fetchItem = (id: number) =>
  call(Schema.NullOr(Item), () => Api.fetchItem(id))

export const loadSettings = () => call(Settings, () => Api.loadSettings())

export const saveSettings = (settings: Settings) =>
  call(Settings, () =>
    Api.saveSettings({
      name: settings.name,
      theme: settings.theme,
      density: settings.density,
    }),
  )
