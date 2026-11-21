import { Schema } from 'effect'

// ISSUES

export const Filter = Schema.Literals(['open', 'closed'])
export type Filter = typeof Filter.Type

export const IssueRow = Schema.Struct({
  id: Schema.Number,
  title: Schema.String,
  assignee: Schema.OptionFromNullOr(Schema.String),
})
export type IssueRow = typeof IssueRow.Type

export const IssueDetail = Schema.Struct({
  id: Schema.Number,
  title: Schema.String,
  body: Schema.String,
})
export type IssueDetail = typeof IssueDetail.Type

export const Assignment = Schema.Struct({
  id: Schema.Number,
  assignee: Schema.String,
})

export const Renaming = Schema.Struct({
  id: Schema.Number,
  title: Schema.String,
})

export const Closing = Schema.Struct({ id: Schema.Number })

export const Comment = Schema.Struct({
  author: Schema.String,
  text: Schema.String,
})
export type Comment = typeof Comment.Type

export const Labels = Schema.Array(Schema.String)

// HELP

export const Hit = Schema.Struct({ id: Schema.Number, name: Schema.String })
export type Hit = typeof Hit.Type

export const Item = Schema.Struct({
  id: Schema.Number,
  name: Schema.String,
  blurb: Schema.String,
})
export type Item = typeof Item.Type

// SETTINGS

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
