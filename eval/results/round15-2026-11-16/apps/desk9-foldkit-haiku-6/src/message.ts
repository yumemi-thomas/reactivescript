import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'

import {
  Comment,
  Filter,
  Hit,
  IssueDetail,
  IssueSummary,
  Item,
  Origin,
  Settings,
} from './domain.js'

export const Message = defineMessageUnion({
  ClickedIssuesTab: {},
  ClickedHelpTab: {},
  ClickedSettingsTab: {},

  UpdatedUser: { value: Schema.String },
  ClickedFilter: { filter: Filter },
  ClickedIssue: { id: Schema.Number },
  ClickedRetryIssue: {},
  UpdatedTitleInput: { value: Schema.String },
  ClickedAssign: {},
  ClickedRename: {},
  ClickedClose: {},
  UpdatedCommentInput: { value: Schema.String },
  ClickedPost: {},
  UpdatedLabelInput: { value: Schema.String },
  ClickedAddLabel: {},
  ClickedRemoveLabel: { label: Schema.String },
  ClickedRowAssign: { id: Schema.Number },
  ClickedRowClose: { id: Schema.Number },
  ClickedRelatedHit: { id: Schema.Number, title: Schema.String },

  SucceededFetchIssues: {
    visit: Schema.Number,
    seq: Schema.Number,
    issues: Schema.Array(IssueSummary),
  },
  FailedFetchIssues: {
    visit: Schema.Number,
    seq: Schema.Number,
    error: Schema.String,
  },
  SucceededFetchIssue: {
    visit: Schema.Number,
    seq: Schema.Number,
    issue: Schema.Option(IssueDetail),
  },
  FailedFetchIssue: {
    visit: Schema.Number,
    seq: Schema.Number,
    error: Schema.String,
  },
  SucceededAssign: {
    visit: Schema.Number,
    origin: Origin,
    seq: Schema.Number,
    id: Schema.Number,
    assignee: Schema.String,
  },
  FailedAssign: {
    visit: Schema.Number,
    origin: Origin,
    seq: Schema.Number,
    id: Schema.Number,
    previous: Schema.Option(Schema.String),
    error: Schema.String,
  },
  SucceededRename: {
    visit: Schema.Number,
    seq: Schema.Number,
    id: Schema.Number,
    title: Schema.String,
  },
  FailedRename: {
    visit: Schema.Number,
    seq: Schema.Number,
    id: Schema.Number,
    previous: Schema.String,
    error: Schema.String,
  },
  SucceededClose: {
    visit: Schema.Number,
    origin: Origin,
    seq: Schema.Number,
    id: Schema.Number,
  },
  FailedClose: {
    visit: Schema.Number,
    origin: Origin,
    seq: Schema.Number,
    id: Schema.Number,
    error: Schema.String,
  },
  SucceededFetchComments: {
    visit: Schema.Number,
    seq: Schema.Number,
    comments: Schema.Array(Comment),
  },
  FailedFetchComments: {
    visit: Schema.Number,
    seq: Schema.Number,
    error: Schema.String,
  },
  SucceededPost: { visit: Schema.Number, seq: Schema.Number, key: Schema.Number },
  FailedPost: {
    visit: Schema.Number,
    seq: Schema.Number,
    key: Schema.Number,
    error: Schema.String,
  },
  SucceededFetchLabels: {
    visit: Schema.Number,
    seq: Schema.Number,
    labels: Schema.Array(Schema.String),
  },
  FailedFetchLabels: {
    visit: Schema.Number,
    seq: Schema.Number,
    error: Schema.String,
  },
  SucceededAddLabel: {
    visit: Schema.Number,
    seq: Schema.Number,
    labels: Schema.Array(Schema.String),
  },
  FailedAddLabel: {
    visit: Schema.Number,
    seq: Schema.Number,
    label: Schema.String,
    error: Schema.String,
  },
  SucceededRemoveLabel: {
    visit: Schema.Number,
    seq: Schema.Number,
    labels: Schema.Array(Schema.String),
  },
  FailedRemoveLabel: {
    visit: Schema.Number,
    seq: Schema.Number,
    label: Schema.String,
    index: Schema.Number,
    error: Schema.String,
  },
  SucceededFetchRelated: {
    visit: Schema.Number,
    seq: Schema.Number,
    hits: Schema.Array(Hit),
  },
  FailedFetchRelated: {
    visit: Schema.Number,
    seq: Schema.Number,
    error: Schema.String,
  },

  UpdatedQuery: { value: Schema.String },
  SucceededSearch: {
    visit: Schema.Number,
    query: Schema.String,
    hits: Schema.Array(Hit),
  },
  FailedSearch: {
    visit: Schema.Number,
    query: Schema.String,
    error: Schema.String,
  },
  ClickedHit: { id: Schema.Number },
  SucceededFetchItem: {
    visit: Schema.Number,
    id: Schema.Number,
    item: Schema.Option(Item),
  },
  FailedFetchItem: {
    visit: Schema.Number,
    id: Schema.Number,
    error: Schema.String,
  },
  ClickedRetryItem: {},

  SucceededLoadSettings: { visit: Schema.Number, settings: Settings },
  FailedLoadSettings: { visit: Schema.Number, error: Schema.String },
  ClickedRetryLoad: {},
  UpdatedName: { value: Schema.String },
  ClickedLightTheme: {},
  ClickedDarkTheme: {},
  ClickedDensityToggle: {},
  ClickedSave: {},
  SucceededSaveSettings: {
    visit: Schema.Number,
    seq: Schema.Number,
    settings: Settings,
  },
  FailedSaveSettings: {
    visit: Schema.Number,
    seq: Schema.Number,
    error: Schema.String,
  },
})
export type Message = typeof Message.Type
