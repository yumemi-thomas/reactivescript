import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'

import {
  Comment,
  Filter,
  Hit,
  IssueDetail,
  IssueRow,
  Item,
  Settings,
  Tab,
  Theme,
} from './domain'

const Hits = Schema.Array(Hit)

export const Message = defineMessageUnion({
  ClickedTab: { tab: Tab },

  UpdatedUser: { value: Schema.String },
  ClickedFilter: { filter: Filter },
  SucceededFetchIssues: { requestId: Schema.Number, issues: Schema.Array(IssueRow) },
  FailedFetchIssues: { requestId: Schema.Number, error: Schema.String },
  ClickedIssue: { issueId: Schema.Number },
  ClickedRetryIssue: {},
  SucceededFetchIssue: { requestId: Schema.Number, maybeDetail: Schema.Option(IssueDetail) },
  FailedFetchIssue: { requestId: Schema.Number, error: Schema.String },
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
  SucceededFetchComments: { token: Schema.Number, comments: Schema.Array(Comment) },
  FailedFetchComments: { token: Schema.Number, error: Schema.String },
  UpdatedCommentInput: { value: Schema.String },
  ClickedPost: {},
  SucceededAddComment: { token: Schema.Number, opId: Schema.Number, comment: Comment },
  FailedAddComment: { token: Schema.Number, opId: Schema.Number, error: Schema.String },
  SucceededFetchLabels: { token: Schema.Number, labels: Schema.Array(Schema.String) },
  FailedFetchLabels: { token: Schema.Number, error: Schema.String },
  UpdatedLabelInput: { value: Schema.String },
  ClickedAddLabel: {},
  ClickedRemoveLabel: { label: Schema.String },
  SucceededChangeLabel: { token: Schema.Number, opId: Schema.Number, labels: Schema.Array(Schema.String) },
  FailedChangeLabel: { token: Schema.Number, opId: Schema.Number, error: Schema.String },
  SucceededSearchRelated: { requestId: Schema.Number, hits: Hits },
  FailedSearchRelated: { requestId: Schema.Number, error: Schema.String },
  ClickedRelatedHit: { hitId: Schema.Number },

  UpdatedQuery: { value: Schema.String },
  SucceededSearch: { requestId: Schema.Number, hits: Hits },
  FailedSearch: { requestId: Schema.Number, error: Schema.String },
  ClickedHit: { hitId: Schema.Number },
  ClickedRetryItem: {},
  SucceededFetchItem: { requestId: Schema.Number, maybeItem: Schema.Option(Item) },
  FailedFetchItem: { requestId: Schema.Number, error: Schema.String },

  SucceededLoadSettings: { requestId: Schema.Number, settings: Settings },
  FailedLoadSettings: { requestId: Schema.Number, error: Schema.String },
  ClickedRetryLoad: {},
  UpdatedName: { value: Schema.String },
  ClickedTheme: { theme: Theme },
  ClickedDensityToggle: {},
  ClickedSave: {},
  SucceededSaveSettings: { requestId: Schema.Number, settings: Settings },
  FailedSaveSettings: { requestId: Schema.Number, error: Schema.String },
})
export type Message = typeof Message.Type

