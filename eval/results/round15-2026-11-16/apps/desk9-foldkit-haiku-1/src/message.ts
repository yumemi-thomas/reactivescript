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
  Theme,
} from './model'

// MESSAGE

export const Message = defineMessageUnion({
  ClickedTabIssues: {},
  ClickedTabHelp: {},
  ClickedTabSettings: {},

  UpdatedUser: { value: Schema.String },
  ClickedFilter: { filter: Filter },
  SelectedIssue: { id: Schema.Number },
  ClickedRetryIssue: {},
  ClickedAssign: {},
  ClickedRowAssign: { id: Schema.Number },
  UpdatedRenameDraft: { value: Schema.String },
  ClickedRename: {},
  ClickedClose: {},
  ClickedRowClose: { id: Schema.Number },
  UpdatedCommentDraft: { value: Schema.String },
  ClickedPost: {},
  UpdatedLabelDraft: { value: Schema.String },
  ClickedAddLabel: {},
  ClickedRemoveLabel: { label: Schema.String },
  ClickedRelatedHit: { id: Schema.Number },
  SucceededFetchIssues: {
    serial: Schema.Number,
    filter: Filter,
    issues: Schema.Array(IssueSummary),
  },
  FailedFetchIssues: {
    serial: Schema.Number,
    filter: Filter,
    error: Schema.String,
  },
  SucceededFetchIssue: {
    serial: Schema.Number,
    id: Schema.Number,
    maybeIssue: Schema.Option(IssueDetail),
  },
  FailedFetchIssue: {
    serial: Schema.Number,
    id: Schema.Number,
    error: Schema.String,
  },
  SucceededAssignIssue: { serial: Schema.Number, id: Schema.Number },
  FailedAssignIssue: {
    serial: Schema.Number,
    id: Schema.Number,
    origin: Origin,
    maybePrevious: Schema.Option(Schema.String),
    error: Schema.String,
  },
  SucceededRenameIssue: { serial: Schema.Number, id: Schema.Number },
  FailedRenameIssue: {
    serial: Schema.Number,
    id: Schema.Number,
    previous: Schema.String,
    error: Schema.String,
  },
  SucceededCloseIssue: { serial: Schema.Number, id: Schema.Number },
  FailedCloseIssue: {
    serial: Schema.Number,
    id: Schema.Number,
    origin: Origin,
    error: Schema.String,
  },
  SucceededFetchComments: {
    serial: Schema.Number,
    id: Schema.Number,
    comments: Schema.Array(Comment),
  },
  FailedFetchComments: {
    serial: Schema.Number,
    id: Schema.Number,
    error: Schema.String,
  },
  SucceededAddComment: {
    serial: Schema.Number,
    id: Schema.Number,
    text: Schema.String,
  },
  FailedAddComment: {
    serial: Schema.Number,
    id: Schema.Number,
    text: Schema.String,
    error: Schema.String,
  },
  SucceededFetchLabels: {
    serial: Schema.Number,
    id: Schema.Number,
    labels: Schema.Array(Schema.String),
  },
  FailedFetchLabels: {
    serial: Schema.Number,
    id: Schema.Number,
    error: Schema.String,
  },
  SucceededAddLabel: {
    serial: Schema.Number,
    id: Schema.Number,
    label: Schema.String,
  },
  FailedAddLabel: {
    serial: Schema.Number,
    id: Schema.Number,
    label: Schema.String,
    error: Schema.String,
  },
  SucceededRemoveLabel: {
    serial: Schema.Number,
    id: Schema.Number,
    label: Schema.String,
  },
  FailedRemoveLabel: {
    serial: Schema.Number,
    id: Schema.Number,
    label: Schema.String,
    error: Schema.String,
  },
  SucceededSearchRelated: {
    serial: Schema.Number,
    id: Schema.Number,
    hits: Schema.Array(Hit),
  },
  FailedSearchRelated: {
    serial: Schema.Number,
    id: Schema.Number,
    error: Schema.String,
  },

  UpdatedQuery: { value: Schema.String },
  ClickedHit: { id: Schema.Number },
  ClickedRetryItem: {},
  SucceededSearchHelp: {
    serial: Schema.Number,
    query: Schema.String,
    hits: Schema.Array(Hit),
  },
  FailedSearchHelp: {
    serial: Schema.Number,
    query: Schema.String,
    error: Schema.String,
  },
  SucceededFetchItem: {
    serial: Schema.Number,
    id: Schema.Number,
    maybeItem: Schema.Option(Item),
  },
  FailedFetchItem: {
    serial: Schema.Number,
    id: Schema.Number,
    error: Schema.String,
  },

  UpdatedName: { value: Schema.String },
  ClickedTheme: { theme: Theme },
  ClickedDensityToggle: {},
  ClickedSave: {},
  ClickedRetryLoad: {},
  SucceededLoadSettings: { serial: Schema.Number, settings: Settings },
  FailedLoadSettings: { serial: Schema.Number, error: Schema.String },
  SucceededSaveSettings: { serial: Schema.Number, settings: Settings },
  FailedSaveSettings: { serial: Schema.Number, error: Schema.String },
})
export type Message = typeof Message.Type

