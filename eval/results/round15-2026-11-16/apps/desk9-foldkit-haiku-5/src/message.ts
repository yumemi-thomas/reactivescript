import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'

import {
  Filter,
  Hit,
  Item,
  IssueDetail,
  IssueSummary,
  Origin,
  Settings,
  Theme,
} from './model'

// MESSAGE

export const Message = defineMessageUnion({
  ClickedTabIssues: {},
  ClickedTabHelp: {},
  ClickedTabSettings: {},
  ClickedRelatedHit: { id: Schema.Number, query: Schema.String },

  UpdatedUser: { value: Schema.String },
  ClickedFilter: { filter: Filter },
  ClickedIssueRow: { id: Schema.Number },
  SucceededFetchIssues: {
    visit: Schema.Number,
    filter: Filter,
    issues: Schema.Array(IssueSummary),
  },
  FailedFetchIssues: {
    visit: Schema.Number,
    filter: Filter,
    error: Schema.String,
  },
  ClickedRetryDetail: {},
  SucceededFetchIssue: {
    visit: Schema.Number,
    id: Schema.Number,
    issue: Schema.NullOr(IssueDetail),
  },
  FailedFetchIssue: {
    visit: Schema.Number,
    id: Schema.Number,
    error: Schema.String,
  },
  ClickedAssign: {},
  ClickedRowAssign: { id: Schema.Number },
  SucceededAssignIssue: {
    visit: Schema.Number,
    id: Schema.Number,
    origin: Origin,
  },
  FailedAssignIssue: {
    visit: Schema.Number,
    id: Schema.Number,
    origin: Origin,
    previous: Schema.NullOr(Schema.String),
    error: Schema.String,
  },
  UpdatedTitleDraft: { value: Schema.String },
  ClickedRename: {},
  SucceededRenameIssue: { visit: Schema.Number, id: Schema.Number },
  FailedRenameIssue: {
    visit: Schema.Number,
    id: Schema.Number,
    previous: Schema.String,
    error: Schema.String,
  },
  ClickedClose: {},
  ClickedRowClose: { id: Schema.Number },
  SucceededCloseIssue: {
    visit: Schema.Number,
    id: Schema.Number,
    origin: Origin,
  },
  FailedCloseIssue: {
    visit: Schema.Number,
    id: Schema.Number,
    origin: Origin,
    error: Schema.String,
  },
  SucceededFetchComments: {
    visit: Schema.Number,
    id: Schema.Number,
    comments: Schema.Array(Schema.Struct({ author: Schema.String, text: Schema.String })),
  },
  FailedFetchComments: {
    visit: Schema.Number,
    id: Schema.Number,
    error: Schema.String,
  },
  UpdatedCommentDraft: { value: Schema.String },
  ClickedPost: {},
  SucceededAddComment: {
    visit: Schema.Number,
    id: Schema.Number,
    key: Schema.Number,
    author: Schema.String,
    text: Schema.String,
  },
  FailedAddComment: {
    visit: Schema.Number,
    id: Schema.Number,
    key: Schema.Number,
    error: Schema.String,
  },
  SucceededFetchLabels: {
    visit: Schema.Number,
    id: Schema.Number,
    labels: Schema.Array(Schema.String),
  },
  FailedFetchLabels: {
    visit: Schema.Number,
    id: Schema.Number,
    error: Schema.String,
  },
  UpdatedLabelDraft: { value: Schema.String },
  ClickedAddLabel: {},
  SucceededAddLabel: {
    visit: Schema.Number,
    id: Schema.Number,
    name: Schema.String,
  },
  FailedAddLabel: {
    visit: Schema.Number,
    id: Schema.Number,
    name: Schema.String,
    error: Schema.String,
  },
  ClickedRemoveLabel: { name: Schema.String },
  SucceededRemoveLabel: {
    visit: Schema.Number,
    id: Schema.Number,
    name: Schema.String,
  },
  FailedRemoveLabel: {
    visit: Schema.Number,
    id: Schema.Number,
    name: Schema.String,
    error: Schema.String,
  },
  SucceededSearchRelated: {
    visit: Schema.Number,
    id: Schema.Number,
    hits: Schema.Array(Hit),
  },
  FailedSearchRelated: {
    visit: Schema.Number,
    id: Schema.Number,
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
    item: Schema.NullOr(Item),
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
  UpdatedDraftName: { value: Schema.String },
  ClickedDraftTheme: { theme: Theme },
  ClickedDensityToggle: {},
  ClickedSave: {},
  SucceededSaveSettings: { visit: Schema.Number, settings: Settings },
  FailedSaveSettings: { visit: Schema.Number, error: Schema.String },
})
export type Message = typeof Message.Type
