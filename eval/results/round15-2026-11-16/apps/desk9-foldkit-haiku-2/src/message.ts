import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'

import {
  CommentData,
  Filter,
  Hit,
  IssueDetail,
  IssueRow,
  Item,
  Origin,
  Settings,
  Tab,
  Theme,
} from './model'

// MESSAGE

export const Message = defineMessageUnion({
  ClickedTab: { tab: Tab },

  UpdatedUser: { value: Schema.String },
  ClickedFilter: { filter: Filter },
  SucceededLoadIssues: { filter: Filter, issues: Schema.Array(IssueRow) },
  FailedLoadIssues: { filter: Filter, message: Schema.String },
  ClickedIssueRow: { id: Schema.Number },
  ClickedRetryIssue: {},
  SucceededLoadIssue: { id: Schema.Number, issue: Schema.Option(IssueDetail) },
  FailedLoadIssue: { id: Schema.Number, message: Schema.String },

  UpdatedTitleInput: { value: Schema.String },
  ClickedRename: {},
  SucceededRenameIssue: { id: Schema.Number, title: Schema.String },
  FailedRenameIssue: {
    id: Schema.Number,
    previousTitle: Schema.String,
    message: Schema.String,
  },

  ClickedAssign: {},
  ClickedRowAssign: { id: Schema.Number },
  SucceededAssignIssue: { id: Schema.Number, assignee: Schema.String },
  FailedAssignIssue: {
    id: Schema.Number,
    previous: Schema.Option(Schema.String),
    origin: Origin,
    message: Schema.String,
  },

  ClickedClose: {},
  ClickedRowClose: { id: Schema.Number },
  SucceededCloseIssue: { id: Schema.Number },
  FailedCloseIssue: { id: Schema.Number, origin: Origin, message: Schema.String },

  SucceededLoadComments: { id: Schema.Number, comments: Schema.Array(CommentData) },
  FailedLoadComments: { id: Schema.Number, message: Schema.String },
  UpdatedCommentInput: { value: Schema.String },
  ClickedPost: {},
  SucceededPostComment: {
    id: Schema.Number,
    key: Schema.Number,
    comment: CommentData,
  },
  FailedPostComment: { id: Schema.Number, key: Schema.Number, message: Schema.String },

  SucceededLoadLabels: { id: Schema.Number, labels: Schema.Array(Schema.String) },
  FailedLoadLabels: { id: Schema.Number, message: Schema.String },
  UpdatedLabelInput: { value: Schema.String },
  ClickedAddLabel: {},
  SucceededAddLabel: { id: Schema.Number, label: Schema.String },
  FailedAddLabel: { id: Schema.Number, label: Schema.String, message: Schema.String },
  ClickedRemoveLabel: { label: Schema.String },
  SucceededRemoveLabel: { id: Schema.Number, label: Schema.String },
  FailedRemoveLabel: { id: Schema.Number, label: Schema.String, message: Schema.String },

  SucceededSearchRelated: { id: Schema.Number, hits: Schema.Array(Hit) },
  FailedSearchRelated: { id: Schema.Number, message: Schema.String },
  ClickedRelatedHit: { id: Schema.Number },

  UpdatedQuery: { value: Schema.String },
  SucceededSearchHelp: { query: Schema.String, hits: Schema.Array(Hit) },
  FailedSearchHelp: { query: Schema.String, message: Schema.String },
  ClickedHit: { id: Schema.Number },
  SucceededFetchHelpItem: { id: Schema.Number, item: Schema.Option(Item) },
  FailedFetchHelpItem: { id: Schema.Number, message: Schema.String },
  ClickedRetryItem: {},

  SucceededLoadSettings: { settings: Settings },
  FailedLoadSettings: { message: Schema.String },
  ClickedRetryLoadSettings: {},
  UpdatedSettingsName: { value: Schema.String },
  ClickedSettingsTheme: { theme: Theme },
  ClickedDensityToggle: {},
  ClickedSaveSettings: {},
  SucceededSaveSettings: { settings: Settings },
  FailedSaveSettings: { message: Schema.String },
})
export type Message = typeof Message.Type
