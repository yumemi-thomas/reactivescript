import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'

import { Comment, Filter, Hit, IssueDetail, IssueRow } from '../domain'
import { ActionSource } from './model'

// MESSAGE

export const Message = defineMessageUnion({
  UpdatedUser: { value: Schema.String },
  ClickedFilter: { filter: Filter },
  ClickedIssue: { issueId: Schema.Number },
  ClickedRetryDetail: {},
  ClickedAssign: {},
  UpdatedTitleInput: { value: Schema.String },
  SubmittedRename: {},
  ClickedClose: {},
  UpdatedCommentInput: { value: Schema.String },
  SubmittedComment: {},
  UpdatedLabelInput: { value: Schema.String },
  SubmittedLabel: {},
  ClickedRemoveLabel: { label: Schema.String },
  ClickedRowAssign: { issueId: Schema.Number },
  ClickedRowClose: { issueId: Schema.Number },
  ClickedRelatedHit: { hitId: Schema.Number },
  SucceededFetchIssues: { requestId: Schema.Number, filter: Filter, issues: Schema.Array(IssueRow) },
  FailedFetchIssues: { requestId: Schema.Number, error: Schema.String },
  SucceededFetchIssue: { requestId: Schema.Number, maybeIssue: Schema.Option(IssueDetail) },
  FailedFetchIssue: { requestId: Schema.Number, error: Schema.String },
  SucceededSearchRelated: { requestId: Schema.Number, hits: Schema.Array(Hit) },
  FailedSearchRelated: { requestId: Schema.Number, error: Schema.String },
  SucceededFetchComments: { selectionId: Schema.Number, comments: Schema.Array(Comment) },
  FailedFetchComments: { selectionId: Schema.Number, error: Schema.String },
  SucceededFetchLabels: { selectionId: Schema.Number, labels: Schema.Array(Schema.String) },
  FailedFetchLabels: { selectionId: Schema.Number, error: Schema.String },
  SucceededAssign: { opId: Schema.Number, issueId: Schema.Number, assignee: Schema.String },
  FailedAssign: { opId: Schema.Number, source: ActionSource, error: Schema.String },
  SucceededRenameIssue: { opId: Schema.Number, issueId: Schema.Number, title: Schema.String },
  FailedRenameIssue: { opId: Schema.Number, selectionId: Schema.Number, error: Schema.String },
  SucceededCloseIssue: { opId: Schema.Number, issueId: Schema.Number },
  FailedCloseIssue: { opId: Schema.Number, source: ActionSource, error: Schema.String },
  SucceededAddComment: { selectionId: Schema.Number, opId: Schema.Number, comment: Comment },
  FailedAddComment: { selectionId: Schema.Number, opId: Schema.Number, error: Schema.String },
  SucceededAddLabel: { selectionId: Schema.Number, opId: Schema.Number, labels: Schema.Array(Schema.String) },
  FailedAddLabel: { selectionId: Schema.Number, opId: Schema.Number, error: Schema.String },
  SucceededRemoveLabel: { selectionId: Schema.Number, opId: Schema.Number, labels: Schema.Array(Schema.String) },
  FailedRemoveLabel: { selectionId: Schema.Number, opId: Schema.Number, error: Schema.String },
})
export type Message = typeof Message.Type

// OUT MESSAGE

export const OutMessage = defineMessageUnion({
  OpenedRelatedHelp: { query: Schema.String, hits: Schema.Array(Hit), hitId: Schema.Number },
})
export type OutMessage = typeof OutMessage.Type
