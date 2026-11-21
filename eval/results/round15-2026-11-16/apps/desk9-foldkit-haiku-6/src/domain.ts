import { Schema } from 'effect'

export const Filter = Schema.Literals(['open', 'closed'])
export type Filter = typeof Filter.Type

export const Origin = Schema.Literals(['Detail', 'Row'])
export type Origin = typeof Origin.Type

export const IssueSummary = Schema.Struct({
  id: Schema.Number,
  title: Schema.String,
  assignee: Schema.Option(Schema.String),
})
export type IssueSummary = typeof IssueSummary.Type

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

export const Hit = Schema.Struct({
  id: Schema.Number,
  name: Schema.String,
})
export type Hit = typeof Hit.Type

export const Item = Schema.Struct({
  id: Schema.Number,
  name: Schema.String,
  blurb: Schema.String,
})
export type Item = typeof Item.Type

export const Settings = Schema.Struct({
  name: Schema.String,
  theme: Schema.Literals(['light', 'dark']),
  density: Schema.Literals(['comfortable', 'compact']),
})
export type Settings = typeof Settings.Type

export const NAME_LIMIT = 20

export const nameError = (name: string): string | undefined => {
  if (name.trim() === '') {
    return 'Display name is required'
  }
  if (name.length > NAME_LIMIT) {
    return `Display name must be at most ${NAME_LIMIT} characters, not ${name.length}`
  }
  return undefined
}
