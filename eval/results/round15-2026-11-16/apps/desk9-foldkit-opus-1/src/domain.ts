import { Schema } from 'effect'
import { defineTaggedUnion } from 'foldkit/schema'

// ISSUES

export const Filter = Schema.Literals(['open', 'closed'])
export type Filter = typeof Filter.Type

export const Issue = Schema.Struct({
  id: Schema.Number,
  title: Schema.String,
  maybeAssignee: Schema.Option(Schema.String),
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

export const Origin = Schema.Literals(['Row', 'Detail'])
export type Origin = typeof Origin.Type

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

export const NAME_MAX_LENGTH = 20

export const NameValidity = defineTaggedUnion({
  ValidName: {},
  EmptyName: {},
  LongName: { length: Schema.Number },
})
export type NameValidity = typeof NameValidity.Type

export const nameLength = (name: string): number => [...name].length

export const validateName = (name: string): NameValidity => {
  const length = nameLength(name)
  if (name.trim() === '') {
    return NameValidity.EmptyName()
  }
  if (length > NAME_MAX_LENGTH) {
    return NameValidity.LongName({ length })
  }
  return NameValidity.ValidName()
}
