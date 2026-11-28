import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'

import {
  Comment,
  Filter,
  Hit,
  Issue,
  IssueDetail,
  Item,
  Settings,
  Theme,
} from './domain'

export const Tab = Schema.Literals(['Issues', 'Help', 'Settings'])
export type Tab = typeof Tab.Type

export const Message = defineMessageUnion({
  ClickedTab: { tab: Tab },

  UpdatedUser: { value: Schema.String },
  ClickedFilter: { filter: Filter },
  SucceededFetchIssues: { token: Schema.Number, issues: Schema.Array(Issue) },
  FailedFetchIssues: { token: Schema.Number, error: Schema.String },
  ClickedIssue: { issueId: Schema.Number },
  ClickedRetryIssue: {},
  SucceededFetchIssue: {
    token: Schema.Number,
    maybeIssue: Schema.Option(IssueDetail),
  },
  FailedFetchIssue: { token: Schema.Number, error: Schema.String },

  ClickedAssign: {},
  ClickedRowAssign: { issueId: Schema.Number },
  SucceededAssign: { opId: Schema.Number, assignee: Schema.String },
  FailedAssign: { opId: Schema.Number, error: Schema.String },

  UpdatedTitleInput: { value: Schema.String },
  ClickedRename: {},
  SucceededRenameIssue: { opId: Schema.Number, title: Schema.String },
  FailedRenameIssue: { opId: Schema.Number, error: Schema.String },

  ClickedClose: {},
  ClickedRowClose: { issueId: Schema.Number },
  SucceededCloseIssue: { opId: Schema.Number },
  FailedCloseIssue: { opId: Schema.Number, error: Schema.String },

  SucceededFetchComments: {
    token: Schema.Number,
    comments: Schema.Array(Comment),
  },
  FailedFetchComments: { token: Schema.Number, error: Schema.String },
  UpdatedCommentInput: { value: Schema.String },
  ClickedPost: {},
  SucceededAddComment: { opId: Schema.Number, comment: Comment },
  FailedAddComment: { opId: Schema.Number, error: Schema.String },

  SucceededFetchLabels: {
    token: Schema.Number,
    labels: Schema.Array(Schema.String),
  },
  FailedFetchLabels: { token: Schema.Number, error: Schema.String },
  UpdatedLabelInput: { value: Schema.String },
  ClickedAddLabel: {},
  ClickedRemoveLabel: { label: Schema.String },
  SucceededChangeLabel: {
    opId: Schema.Number,
    labels: Schema.Array(Schema.String),
  },
  FailedChangeLabel: { opId: Schema.Number, error: Schema.String },

  SucceededSearchRelated: { token: Schema.Number, hits: Schema.Array(Hit) },
  FailedSearchRelated: { token: Schema.Number, error: Schema.String },
  ClickedRelatedHit: { hitId: Schema.Number },

  UpdatedQuery: { value: Schema.String },
  SucceededSearch: {
    token: Schema.Number,
    query: Schema.String,
    hits: Schema.Array(Hit),
  },
  FailedSearch: { token: Schema.Number, error: Schema.String },
  ClickedHit: { hitId: Schema.Number },
  ClickedRetryItem: {},
  SucceededFetchItem: { token: Schema.Number, maybeItem: Schema.Option(Item) },
  FailedFetchItem: { token: Schema.Number, error: Schema.String },

  SucceededLoadSettings: { token: Schema.Number, settings: Settings },
  FailedLoadSettings: { token: Schema.Number, error: Schema.String },
  ClickedRetryLoad: {},
  UpdatedName: { value: Schema.String },
  ClickedTheme: { theme: Theme },
  ClickedDensityToggle: {},
  ClickedSave: {},
  SucceededSaveSettings: { token: Schema.Number, settings: Settings },
  FailedSaveSettings: { token: Schema.Number, error: Schema.String },
})
export type Message = typeof Message.Type
