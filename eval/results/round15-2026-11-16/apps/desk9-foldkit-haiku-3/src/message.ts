import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'

import {
  ApiComment,
  Filter,
  HelpItem,
  Hit,
  Issue,
  IssueDetail,
  LabelRow,
  Origin,
  Removed,
  Settings,
  Theme,
} from './model.js'

// MESSAGE

export const Message = defineMessageUnion({
  ClickedTabIssues: {},
  ClickedTabHelp: {},
  ClickedTabSettings: {},

  UpdatedUser: { value: Schema.String },
  ClickedFilter: { filter: Filter },
  SucceededFetchIssues: {
    generation: Schema.Number,
    filter: Filter,
    issues: Schema.Array(Issue),
  },
  FailedFetchIssues: {
    generation: Schema.Number,
    filter: Filter,
    error: Schema.String,
  },
  SelectedIssue: { id: Schema.Number },
  SucceededFetchIssue: {
    generation: Schema.Number,
    id: Schema.Number,
    issue: Schema.NullOr(IssueDetail),
  },
  FailedFetchIssue: {
    generation: Schema.Number,
    id: Schema.Number,
    error: Schema.String,
  },
  ClickedRetryIssue: {},
  UpdatedTitleInput: { value: Schema.String },
  ClickedRename: {},
  SucceededRenameIssue: { generation: Schema.Number, id: Schema.Number },
  FailedRenameIssue: {
    generation: Schema.Number,
    id: Schema.Number,
    previousTitle: Schema.String,
    error: Schema.String,
  },
  ClickedAssign: {},
  ClickedRowAssign: { id: Schema.Number },
  SucceededAssignIssue: { generation: Schema.Number, id: Schema.Number },
  FailedAssignIssue: {
    generation: Schema.Number,
    id: Schema.Number,
    origin: Origin,
    previous: Schema.NullOr(Schema.String),
    error: Schema.String,
  },
  ClickedClose: {},
  ClickedRowClose: { id: Schema.Number },
  SucceededCloseIssue: { generation: Schema.Number, id: Schema.Number },
  FailedCloseIssue: {
    generation: Schema.Number,
    id: Schema.Number,
    origin: Origin,
    removed: Schema.Option(Removed),
    openCount: Schema.Option(Schema.Number),
    error: Schema.String,
  },
  SucceededFetchComments: {
    generation: Schema.Number,
    id: Schema.Number,
    comments: Schema.Array(ApiComment),
  },
  FailedFetchComments: {
    generation: Schema.Number,
    id: Schema.Number,
    error: Schema.String,
  },
  UpdatedCommentInput: { value: Schema.String },
  ClickedPost: {},
  SucceededPostComment: {
    generation: Schema.Number,
    id: Schema.Number,
    commentId: Schema.Number,
  },
  FailedPostComment: {
    generation: Schema.Number,
    id: Schema.Number,
    commentId: Schema.Number,
    error: Schema.String,
  },
  SucceededFetchLabels: {
    generation: Schema.Number,
    id: Schema.Number,
    labels: Schema.Array(Schema.String),
  },
  FailedFetchLabels: {
    generation: Schema.Number,
    id: Schema.Number,
    error: Schema.String,
  },
  UpdatedLabelInput: { value: Schema.String },
  ClickedAddLabel: {},
  SucceededAddLabel: { generation: Schema.Number, id: Schema.Number },
  FailedAddLabel: {
    generation: Schema.Number,
    id: Schema.Number,
    labelId: Schema.Number,
    error: Schema.String,
  },
  ClickedRemoveLabel: { labelId: Schema.Number },
  SucceededRemoveLabel: { generation: Schema.Number, id: Schema.Number },
  FailedRemoveLabel: {
    generation: Schema.Number,
    id: Schema.Number,
    row: LabelRow,
    index: Schema.Number,
    error: Schema.String,
  },
  SucceededSearchRelated: {
    generation: Schema.Number,
    id: Schema.Number,
    hits: Schema.Array(Hit),
  },
  FailedSearchRelated: {
    generation: Schema.Number,
    id: Schema.Number,
    error: Schema.String,
  },
  ClickedRelatedHit: { id: Schema.Number, query: Schema.String },

  UpdatedQuery: { value: Schema.String },
  SucceededSearchHelp: {
    generation: Schema.Number,
    query: Schema.String,
    hits: Schema.Array(Hit),
  },
  FailedSearchHelp: {
    generation: Schema.Number,
    query: Schema.String,
    error: Schema.String,
  },
  SelectedHit: { id: Schema.Number },
  SucceededFetchItem: {
    generation: Schema.Number,
    id: Schema.Number,
    item: Schema.NullOr(HelpItem),
  },
  FailedFetchItem: {
    generation: Schema.Number,
    id: Schema.Number,
    error: Schema.String,
  },
  ClickedRetryItem: {},

  SucceededLoadSettings: { generation: Schema.Number, settings: Settings },
  FailedLoadSettings: { generation: Schema.Number, error: Schema.String },
  ClickedRetryLoad: {},
  UpdatedName: { value: Schema.String },
  ClickedTheme: { theme: Theme },
  ClickedDensityToggle: {},
  ClickedSave: {},
  SucceededSaveSettings: { generation: Schema.Number, settings: Settings },
  FailedSaveSettings: { generation: Schema.Number, error: Schema.String },
})
export type Message = typeof Message.Type
