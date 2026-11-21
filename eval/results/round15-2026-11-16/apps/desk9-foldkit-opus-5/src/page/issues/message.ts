import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'

import { Comment, Filter, Hit, Issue, IssueDetail } from '../../domain'

// MESSAGE

export const Message = defineMessageUnion({
  UpdatedUser: { value: Schema.String },
  ClickedFilter: { filter: Filter },
  SucceededFetchIssues: {
    requestId: Schema.Number,
    filter: Filter,
    issues: Schema.Array(Issue),
  },
  FailedFetchIssues: { requestId: Schema.Number, error: Schema.String },
  ClickedIssue: { issueId: Schema.Number },
  ClickedRetry: {},
  SucceededFetchIssue: {
    requestId: Schema.Number,
    maybeDetail: Schema.Option(IssueDetail),
  },
  FailedFetchIssue: { requestId: Schema.Number, error: Schema.String },
  SucceededFetchComments: {
    selectionId: Schema.Number,
    comments: Schema.Array(Comment),
  },
  FailedFetchComments: { selectionId: Schema.Number, error: Schema.String },
  SucceededFetchLabels: {
    selectionId: Schema.Number,
    labels: Schema.Array(Schema.String),
  },
  FailedFetchLabels: { selectionId: Schema.Number, error: Schema.String },
  SucceededSearchRelated: {
    requestId: Schema.Number,
    hits: Schema.Array(Hit),
  },
  FailedSearchRelated: { requestId: Schema.Number, error: Schema.String },
  ClickedRelatedHit: { query: Schema.String, hitId: Schema.Number },
  ClickedAssign: {},
  ClickedRowAssign: { issueId: Schema.Number },
  SucceededAssign: {
    changeId: Schema.Number,
    issueId: Schema.Number,
    assignee: Schema.String,
  },
  FailedAssign: { changeId: Schema.Number, error: Schema.String },
  UpdatedTitleInput: { value: Schema.String },
  SubmittedRename: {},
  SucceededRenameIssue: {
    changeId: Schema.Number,
    issueId: Schema.Number,
    title: Schema.String,
  },
  FailedRenameIssue: { changeId: Schema.Number, error: Schema.String },
  ClickedClose: {},
  ClickedRowClose: { issueId: Schema.Number },
  SucceededCloseIssue: { changeId: Schema.Number, issueId: Schema.Number },
  FailedCloseIssue: { changeId: Schema.Number, error: Schema.String },
  UpdatedCommentInput: { value: Schema.String },
  SubmittedComment: {},
  SucceededAddComment: { postId: Schema.Number, comment: Comment },
  FailedAddComment: { postId: Schema.Number, error: Schema.String },
  UpdatedLabelInput: { value: Schema.String },
  SubmittedLabel: {},
  ClickedRemoveLabel: { label: Schema.String },
  SucceededChangeLabel: {
    changeId: Schema.Number,
    labels: Schema.Array(Schema.String),
  },
  FailedChangeLabel: { changeId: Schema.Number, error: Schema.String },
})
export type Message = typeof Message.Type

// OUT MESSAGE

export const OutMessage = defineMessageUnion({
  OpenedRelatedHit: { query: Schema.String, hitId: Schema.Number },
})
export type OutMessage = typeof OutMessage.Type
