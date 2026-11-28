import { Array, Effect, Option, Schema, String, pipe } from 'effect'
import { Command, type Update } from 'foldkit'
import { modifyFields } from 'foldkit/struct'

import { Filter, type Issue } from '../../domain'
import * as Request from '../../request'
import { Message, OutMessage } from './message'
import {
  ChangeOrigin,
  CommentsState,
  DetailState,
  type DetailErrors,
  IssueChange,
  IssueList,
  LabelChange,
  LabelsState,
  type Model,
  type PendingChange,
  type PostStatus,
  RelatedState,
  type Selection,
  noDetailErrors,
  shownLabels,
} from './model'

// COMMAND

export const FetchIssues = Command.define('FetchIssues', {
  args: { requestId: Schema.Number, filter: Filter },
  messages: [Message.SucceededFetchIssues, Message.FailedFetchIssues],
  execute: ({ requestId, filter }) =>
    Request.fetchIssues(filter).pipe(
      Effect.map(issues =>
        Message.SucceededFetchIssues({ requestId, filter, issues }),
      ),
      Effect.catch(error =>
        Effect.succeed(Message.FailedFetchIssues({ requestId, error })),
      ),
    ),
})

export const FetchIssue = Command.define('FetchIssue', {
  args: { requestId: Schema.Number, issueId: Schema.Number },
  messages: [Message.SucceededFetchIssue, Message.FailedFetchIssue],
  execute: ({ requestId, issueId }) =>
    Request.fetchIssue(issueId).pipe(
      Effect.map(maybeDetail =>
        Message.SucceededFetchIssue({ requestId, maybeDetail }),
      ),
      Effect.catch(error =>
        Effect.succeed(Message.FailedFetchIssue({ requestId, error })),
      ),
    ),
})

export const FetchComments = Command.define('FetchComments', {
  args: { selectionId: Schema.Number, issueId: Schema.Number },
  messages: [Message.SucceededFetchComments, Message.FailedFetchComments],
  execute: ({ selectionId, issueId }) =>
    Request.fetchComments(issueId).pipe(
      Effect.map(comments =>
        Message.SucceededFetchComments({ selectionId, comments }),
      ),
      Effect.catch(error =>
        Effect.succeed(Message.FailedFetchComments({ selectionId, error })),
      ),
    ),
})

export const FetchLabels = Command.define('FetchLabels', {
  args: { selectionId: Schema.Number, issueId: Schema.Number },
  messages: [Message.SucceededFetchLabels, Message.FailedFetchLabels],
  execute: ({ selectionId, issueId }) =>
    Request.fetchLabels(issueId).pipe(
      Effect.map(labels =>
        Message.SucceededFetchLabels({ selectionId, labels }),
      ),
      Effect.catch(error =>
        Effect.succeed(Message.FailedFetchLabels({ selectionId, error })),
      ),
    ),
})

export const SearchRelated = Command.define('SearchRelated', {
  args: { requestId: Schema.Number, query: Schema.String },
  messages: [Message.SucceededSearchRelated, Message.FailedSearchRelated],
  execute: ({ requestId, query }) =>
    Request.search(query).pipe(
      Effect.map(hits => Message.SucceededSearchRelated({ requestId, hits })),
      Effect.catch(error =>
        Effect.succeed(Message.FailedSearchRelated({ requestId, error })),
      ),
    ),
})

export const AssignIssue = Command.define('AssignIssue', {
  args: {
    changeId: Schema.Number,
    issueId: Schema.Number,
    user: Schema.String,
  },
  messages: [Message.SucceededAssign, Message.FailedAssign],
  execute: ({ changeId, issueId, user }) =>
    Request.assign(issueId, user).pipe(
      Effect.map(({ assignee }) =>
        Message.SucceededAssign({ changeId, issueId, assignee }),
      ),
      Effect.catch(error =>
        Effect.succeed(Message.FailedAssign({ changeId, error })),
      ),
    ),
})

export const RenameIssue = Command.define('RenameIssue', {
  args: {
    changeId: Schema.Number,
    issueId: Schema.Number,
    title: Schema.String,
  },
  messages: [Message.SucceededRenameIssue, Message.FailedRenameIssue],
  execute: ({ changeId, issueId, title }) =>
    Request.renameIssue(issueId, title).pipe(
      Effect.map(renamed =>
        Message.SucceededRenameIssue({
          changeId,
          issueId,
          title: renamed.title,
        }),
      ),
      Effect.catch(error =>
        Effect.succeed(Message.FailedRenameIssue({ changeId, error })),
      ),
    ),
})

export const CloseIssue = Command.define('CloseIssue', {
  args: { changeId: Schema.Number, issueId: Schema.Number },
  messages: [Message.SucceededCloseIssue, Message.FailedCloseIssue],
  execute: ({ changeId, issueId }) =>
    Request.closeIssue(issueId).pipe(
      Effect.map(() => Message.SucceededCloseIssue({ changeId, issueId })),
      Effect.catch(error =>
        Effect.succeed(Message.FailedCloseIssue({ changeId, error })),
      ),
    ),
})

export const AddComment = Command.define('AddComment', {
  args: {
    postId: Schema.Number,
    issueId: Schema.Number,
    author: Schema.String,
    text: Schema.String,
  },
  messages: [Message.SucceededAddComment, Message.FailedAddComment],
  execute: ({ postId, issueId, author, text }) =>
    Request.addComment(issueId, author, text).pipe(
      Effect.map(comment => Message.SucceededAddComment({ postId, comment })),
      Effect.catch(error =>
        Effect.succeed(Message.FailedAddComment({ postId, error })),
      ),
    ),
})

export const AddLabel = Command.define('AddLabel', {
  args: {
    changeId: Schema.Number,
    issueId: Schema.Number,
    label: Schema.String,
  },
  messages: [Message.SucceededChangeLabel, Message.FailedChangeLabel],
  execute: ({ changeId, issueId, label }) =>
    Request.addLabel(issueId, label).pipe(
      Effect.map(labels => Message.SucceededChangeLabel({ changeId, labels })),
      Effect.catch(error =>
        Effect.succeed(Message.FailedChangeLabel({ changeId, error })),
      ),
    ),
})

export const RemoveLabel = Command.define('RemoveLabel', {
  args: {
    changeId: Schema.Number,
    issueId: Schema.Number,
    label: Schema.String,
  },
  messages: [Message.SucceededChangeLabel, Message.FailedChangeLabel],
  execute: ({ changeId, issueId, label }) =>
    Request.removeLabel(issueId, label).pipe(
      Effect.map(labels => Message.SucceededChangeLabel({ changeId, labels })),
      Effect.catch(error =>
        Effect.succeed(Message.FailedChangeLabel({ changeId, error })),
      ),
    ),
})

// INIT

type UpdateReturn = Update.Return<Model, Message>

const startListLoad = (model: Model, filter: Filter): UpdateReturn => {
  const requestId = model.lastId + 1
  return {
    model: modifyFields(model, {
      filter: () => filter,
      list: () => IssueList.Loading(),
      listRequestId: () => requestId,
      lastId: () => requestId,
    }),
    commands: [FetchIssues({ requestId, filter })],
  }
}

export const init = (): UpdateReturn =>
  startListLoad(
    {
      user: 'guest',
      filter: 'open',
      listRequestId: 0,
      list: IssueList.Loading(),
      maybeKnownOpenIds: Option.none(),
      changes: [],
      maybeSelection: Option.none(),
      maybeRowError: Option.none(),
      lastId: 0,
    },
    'open',
  )

// HELPERS

const SENDING: PostStatus = 'Sending'
const SENT: PostStatus = 'Sent'

const withSelection = (
  model: Model,
  f: (selection: Selection) => UpdateReturn,
): UpdateReturn =>
  Option.match(model.maybeSelection, {
    onNone: () => ({ model }),
    onSome: f,
  })

const withSelectionWhere = (
  model: Model,
  predicate: (selection: Selection) => boolean,
  f: (selection: Selection) => Selection,
): UpdateReturn =>
  withSelection(model, selection =>
    predicate(selection)
      ? { model: writeSelection(model, f(selection)) }
      : { model },
  )

const writeSelection = (model: Model, selection: Selection): Model =>
  modifyFields(model, { maybeSelection: () => Option.some(selection) })

const modifyErrors = (
  selection: Selection,
  modify: (errors: DetailErrors) => DetailErrors,
): Selection => modifyFields(selection, { errors: modify })

const currentUser = (model: Model): Option.Option<string> =>
  pipe(model.user, String.trim, Option.liftPredicate(String.isNonEmpty))

const startChange = (
  model: Model,
  issueId: number,
  origin: ChangeOrigin,
  change: IssueChange,
): Readonly<{ model: Model; changeId: number }> => {
  const changeId = model.lastId + 1
  const pending: PendingChange = { changeId, issueId, origin, change }
  return {
    changeId,
    model: modifyFields(model, {
      lastId: () => changeId,
      changes: Array.append(pending),
    }),
  }
}

const findChange = (
  model: Model,
  changeId: number,
): Option.Option<PendingChange> =>
  Array.findFirst(model.changes, pending => pending.changeId === changeId)

const withoutChange = (model: Model, changeId: number): Model =>
  modifyFields(model, {
    changes: Array.filter(pending => pending.changeId !== changeId),
  })

const declineChange = (
  model: Model,
  changeId: number,
  error: string,
  setDetailError: (errors: DetailErrors, error: string) => DetailErrors,
): UpdateReturn =>
  Option.match(findChange(model, changeId), {
    onNone: () => ({ model }),
    onSome: pending => {
      const remaining = withoutChange(model, changeId)
      return ChangeOrigin.match<UpdateReturn>(pending.origin, {
        Row: () => ({
          model: modifyFields(remaining, {
            maybeRowError: () => Option.some(error),
          }),
        }),
        Detail: ({ selectionId }) =>
          withSelectionWhere(
            remaining,
            selection => selection.selectionId === selectionId,
            selection =>
              modifyErrors(selection, errors => setDetailError(errors, error)),
          ),
      })
    },
  })

const modifyListedIssues = (
  model: Model,
  modify: (issues: ReadonlyArray<Issue>) => ReadonlyArray<Issue>,
): Model =>
  IssueList.match<Model>(model.list, {
    Loading: () => model,
    Failed: () => model,
    Loaded: ({ issues }) =>
      modifyFields(model, {
        list: () => IssueList.Loaded({ issues: modify(issues) }),
      }),
  })

const selectIssue = (model: Model, issueId: number): UpdateReturn => {
  const selectionId = model.lastId + 1
  const selection: Selection = {
    selectionId,
    issueId,
    detailRequestId: selectionId,
    detail: DetailState.Loading(),
    comments: CommentsState.Loading(),
    posts: [],
    labels: LabelsState.Loading(),
    labelChanges: [],
    related: RelatedState.Idle(),
    titleInput: '',
    commentInput: '',
    labelInput: '',
    errors: noDetailErrors,
  }
  return {
    model: modifyFields(writeSelection(model, selection), {
      lastId: () => selectionId,
    }),
    commands: [
      FetchIssue({ requestId: selectionId, issueId }),
      FetchComments({ selectionId, issueId }),
      FetchLabels({ selectionId, issueId }),
    ],
  }
}

const changeLabels = (
  model: Model,
  selection: Selection,
  change: LabelChange,
): UpdateReturn => {
  const changeId = model.lastId + 1
  const changed = modifyFields(selection, {
    labelChanges: Array.append({ changeId, change }),
    errors: errors =>
      modifyFields(errors, { maybeLabelError: () => Option.none() }),
  })
  return {
    model: modifyFields(writeSelection(model, changed), {
      lastId: () => changeId,
    }),
    commands: [
      LabelChange.match(change, {
        Add: ({ label }) =>
          AddLabel({ changeId, issueId: selection.issueId, label }),
        Remove: ({ label }) =>
          RemoveLabel({ changeId, issueId: selection.issueId, label }),
      }),
    ],
  }
}

const loadedLabels = (selection: Selection): Option.Option<ReadonlyArray<string>> =>
  LabelsState.match<Option.Option<ReadonlyArray<string>>>(selection.labels, {
    Loading: () => Option.none(),
    Failed: () => Option.none(),
    Loaded: ({ labels }) => Option.some(shownLabels(selection, labels)),
  })

const hasLabelChange = (selection: Selection, changeId: number): boolean =>
  Array.some(selection.labelChanges, pending => pending.changeId === changeId)

const hasPost = (selection: Selection, postId: number): boolean =>
  Array.some(selection.posts, post => post.postId === postId)

// UPDATE

export const update = (model: Model, message: Message) =>
  Message.match<Update.ReturnWithOutMessage<Model, Message, OutMessage>>(
    message,
    {
      UpdatedUser: ({ value }) => ({
        model: modifyFields(model, { user: () => value }),
      }),

      ClickedFilter: ({ filter }) =>
        filter === model.filter ? { model } : startListLoad(model, filter),

      SucceededFetchIssues: ({ requestId, filter, issues }) => {
        if (requestId !== model.listRequestId) {
          return { model }
        }
        return {
          model: modifyFields(model, {
            list: () => IssueList.Loaded({ issues }),
            maybeKnownOpenIds: maybeKnownOpenIds =>
              filter === 'open'
                ? Option.some(Array.map(issues, issue => issue.id))
                : maybeKnownOpenIds,
          }),
        }
      },

      FailedFetchIssues: ({ requestId, error }) => {
        if (requestId !== model.listRequestId) {
          return { model }
        }
        return {
          model: modifyFields(model, {
            list: () => IssueList.Failed({ error }),
          }),
        }
      },

      ClickedIssue: ({ issueId }) =>
        Option.match(model.maybeSelection, {
          onNone: () => selectIssue(model, issueId),
          onSome: selection =>
            selection.issueId === issueId
              ? { model }
              : selectIssue(model, issueId),
        }),

      ClickedRetry: () =>
        withSelection(model, selection => {
          const requestId = model.lastId + 1
          return {
            model: modifyFields(
              writeSelection(
                model,
                modifyFields(selection, {
                  detailRequestId: () => requestId,
                  detail: () => DetailState.Loading(),
                  related: () => RelatedState.Idle(),
                }),
              ),
              { lastId: () => requestId },
            ),
            commands: [FetchIssue({ requestId, issueId: selection.issueId })],
          }
        }),

      SucceededFetchIssue: ({ requestId, maybeDetail }) =>
        withSelection(model, selection => {
          if (selection.detailRequestId !== requestId) {
            return { model }
          }
          return Option.match(maybeDetail, {
            onNone: () => ({
              model: writeSelection(
                model,
                modifyFields(selection, {
                  detail: () => DetailState.NotFound(),
                }),
              ),
            }),
            onSome: detail => {
              const relatedRequestId = model.lastId + 1
              return {
                model: modifyFields(
                  writeSelection(
                    model,
                    modifyFields(selection, {
                      detail: () => DetailState.Loaded({ detail }),
                      related: () =>
                        RelatedState.Searching({
                          requestId: relatedRequestId,
                          query: detail.title,
                        }),
                    }),
                  ),
                  { lastId: () => relatedRequestId },
                ),
                commands: [
                  SearchRelated({
                    requestId: relatedRequestId,
                    query: detail.title,
                  }),
                ],
              }
            },
          })
        }),

      FailedFetchIssue: ({ requestId, error }) =>
        withSelectionWhere(
          model,
          selection => selection.detailRequestId === requestId,
          selection =>
            modifyFields(selection, {
              detail: () => DetailState.Failed({ error }),
            }),
        ),

      SucceededFetchComments: ({ selectionId, comments }) =>
        withSelectionWhere(
          model,
          selection => selection.selectionId === selectionId,
          selection =>
            modifyFields(selection, {
              comments: () => CommentsState.Loaded({ comments }),
            }),
        ),

      FailedFetchComments: ({ selectionId, error }) =>
        withSelectionWhere(
          model,
          selection => selection.selectionId === selectionId,
          selection =>
            modifyFields(selection, {
              comments: () => CommentsState.Failed({ error }),
            }),
        ),

      SucceededFetchLabels: ({ selectionId, labels }) =>
        withSelectionWhere(
          model,
          selection => selection.selectionId === selectionId,
          selection =>
            modifyFields(selection, {
              labels: () => LabelsState.Loaded({ labels }),
            }),
        ),

      FailedFetchLabels: ({ selectionId, error }) =>
        withSelectionWhere(
          model,
          selection => selection.selectionId === selectionId,
          selection =>
            modifyFields(selection, {
              labels: () => LabelsState.Failed({ error }),
            }),
        ),

      SucceededSearchRelated: ({ requestId, hits }) =>
        withSelectionWhere(
          model,
          selection =>
            selection.related._tag === 'Searching' &&
            selection.related.requestId === requestId,
          selection =>
            modifyFields(selection, {
              related: related =>
                RelatedState.match<RelatedState>(related, {
                  Idle: () => related,
                  Searching: ({ query }) =>
                    RelatedState.Found({ query, hits }),
                  Failed: () => related,
                  Found: () => related,
                }),
            }),
        ),

      FailedSearchRelated: ({ requestId, error }) =>
        withSelectionWhere(
          model,
          selection =>
            selection.related._tag === 'Searching' &&
            selection.related.requestId === requestId,
          selection =>
            modifyFields(selection, {
              related: related =>
                RelatedState.match<RelatedState>(related, {
                  Idle: () => related,
                  Searching: ({ query }) =>
                    RelatedState.Failed({ query, error }),
                  Failed: () => related,
                  Found: () => related,
                }),
            }),
        ),

      ClickedRelatedHit: ({ query, hitId }) => ({
        model,
        outMessage: OutMessage.OpenedRelatedHit({ query, hitId }),
      }),

      ClickedAssign: () =>
        withSelection(model, selection =>
          Option.match(currentUser(model), {
            onNone: () => ({ model }),
            onSome: user => {
              const assignStart = startChange(
                writeSelection(
                  model,
                  modifyErrors(selection, errors =>
                    modifyFields(errors, {
                      maybeAssignError: () => Option.none(),
                    }),
                  ),
                ),
                selection.issueId,
                ChangeOrigin.Detail({ selectionId: selection.selectionId }),
                IssueChange.Assign({ assignee: user }),
              )
              return {
                model: assignStart.model,
                commands: [
                  AssignIssue({
                    changeId: assignStart.changeId,
                    issueId: selection.issueId,
                    user,
                  }),
                ],
              }
            },
          }),
        ),

      ClickedRowAssign: ({ issueId }) =>
        Option.match(currentUser(model), {
          onNone: () => ({ model }),
          onSome: user => {
            const assignStart = startChange(
              modifyFields(model, { maybeRowError: () => Option.none() }),
              issueId,
              ChangeOrigin.Row(),
              IssueChange.Assign({ assignee: user }),
            )
            return {
              model: assignStart.model,
              commands: [
                AssignIssue({ changeId: assignStart.changeId, issueId, user }),
              ],
            }
          },
        }),

      SucceededAssign: ({ changeId, issueId, assignee }) => ({
        model: modifyListedIssues(withoutChange(model, changeId), issues =>
          Array.map(issues, issue =>
            issue.id === issueId
              ? modifyFields(issue, {
                  maybeAssignee: () => Option.some(assignee),
                })
              : issue,
          ),
        ),
      }),

      FailedAssign: ({ changeId, error }) =>
        declineChange(model, changeId, error, (errors, assignError) =>
          modifyFields(errors, {
            maybeAssignError: () => Option.some(assignError),
          }),
        ),

      UpdatedTitleInput: ({ value }) =>
        withSelectionWhere(
          model,
          () => true,
          selection => modifyFields(selection, { titleInput: () => value }),
        ),

      SubmittedRename: () =>
        withSelection(model, selection => {
          const title = String.trim(selection.titleInput)
          if (String.isEmpty(title)) {
            return { model }
          }
          const renameStart = startChange(
            writeSelection(
              model,
              modifyErrors(selection, errors =>
                modifyFields(errors, {
                  maybeRenameError: () => Option.none(),
                }),
              ),
            ),
            selection.issueId,
            ChangeOrigin.Detail({ selectionId: selection.selectionId }),
            IssueChange.Rename({ title }),
          )
          return {
            model: renameStart.model,
            commands: [
              RenameIssue({
                changeId: renameStart.changeId,
                issueId: selection.issueId,
                title,
              }),
            ],
          }
        }),

      SucceededRenameIssue: ({ changeId, issueId, title }) => {
        const renamed = modifyListedIssues(
          withoutChange(model, changeId),
          issues =>
            Array.map(issues, issue =>
              issue.id === issueId
                ? modifyFields(issue, { title: () => title })
                : issue,
            ),
        )
        return withSelectionWhere(
          renamed,
          selection => selection.issueId === issueId,
          selection =>
            modifyFields(selection, {
              detail: detail =>
                DetailState.match<DetailState>(detail, {
                  Loading: () => detail,
                  NotFound: () => detail,
                  Failed: () => detail,
                  Loaded: loaded =>
                    DetailState.Loaded({
                      detail: modifyFields(loaded.detail, {
                        title: () => title,
                      }),
                    }),
                }),
            }),
        )
      },

      FailedRenameIssue: ({ changeId, error }) =>
        declineChange(model, changeId, error, (errors, renameError) =>
          modifyFields(errors, {
            maybeRenameError: () => Option.some(renameError),
          }),
        ),

      ClickedClose: () =>
        withSelection(model, selection => {
          const closeStart = startChange(
            writeSelection(
              model,
              modifyErrors(selection, errors =>
                modifyFields(errors, { maybeCloseError: () => Option.none() }),
              ),
            ),
            selection.issueId,
            ChangeOrigin.Detail({ selectionId: selection.selectionId }),
            IssueChange.Close(),
          )
          return {
            model: closeStart.model,
            commands: [
              CloseIssue({
                changeId: closeStart.changeId,
                issueId: selection.issueId,
              }),
            ],
          }
        }),

      ClickedRowClose: ({ issueId }) => {
        const closeStart = startChange(
          modifyFields(model, { maybeRowError: () => Option.none() }),
          issueId,
          ChangeOrigin.Row(),
          IssueChange.Close(),
        )
        return {
          model: closeStart.model,
          commands: [CloseIssue({ changeId: closeStart.changeId, issueId })],
        }
      },

      SucceededCloseIssue: ({ changeId, issueId }) => {
        const closed = modifyFields(withoutChange(model, changeId), {
          maybeKnownOpenIds: Option.map(
            Array.filter(knownId => knownId !== issueId),
          ),
        })
        return {
          model:
            closed.filter === 'open'
              ? modifyListedIssues(
                  closed,
                  Array.filter(issue => issue.id !== issueId),
                )
              : closed,
        }
      },

      FailedCloseIssue: ({ changeId, error }) =>
        declineChange(model, changeId, error, (errors, closeError) =>
          modifyFields(errors, {
            maybeCloseError: () => Option.some(closeError),
          }),
        ),

      UpdatedCommentInput: ({ value }) =>
        withSelectionWhere(
          model,
          () => true,
          selection => modifyFields(selection, { commentInput: () => value }),
        ),

      SubmittedComment: () =>
        withSelection(model, selection => {
          const text = String.trim(selection.commentInput)
          return Option.match(currentUser(model), {
            onNone: () => ({ model }),
            onSome: author => {
              if (String.isEmpty(text)) {
                return { model }
              }
              const postId = model.lastId + 1
              return {
                model: modifyFields(
                  writeSelection(
                    model,
                    modifyFields(selection, {
                      posts: Array.append({
                        postId,
                        comment: { author, text },
                        status: SENDING,
                      }),
                      commentInput: () => '',
                      errors: errors =>
                        modifyFields(errors, {
                          maybePostError: () => Option.none(),
                        }),
                    }),
                  ),
                  { lastId: () => postId },
                ),
                commands: [
                  AddComment({
                    postId,
                    issueId: selection.issueId,
                    author,
                    text,
                  }),
                ],
              }
            },
          })
        }),

      SucceededAddComment: ({ postId, comment }) =>
        withSelectionWhere(
          model,
          selection => hasPost(selection, postId),
          selection =>
            modifyFields(selection, {
              posts: Array.map(post =>
                post.postId === postId
                  ? modifyFields(post, {
                      comment: () => comment,
                      status: () => SENT,
                    })
                  : post,
              ),
            }),
        ),

      FailedAddComment: ({ postId, error }) =>
        withSelectionWhere(
          model,
          selection => hasPost(selection, postId),
          selection =>
            modifyFields(selection, {
              posts: Array.filter(post => post.postId !== postId),
              errors: errors =>
                modifyFields(errors, {
                  maybePostError: () => Option.some(error),
                }),
            }),
        ),

      UpdatedLabelInput: ({ value }) =>
        withSelectionWhere(
          model,
          () => true,
          selection => modifyFields(selection, { labelInput: () => value }),
        ),

      SubmittedLabel: () =>
        withSelection(model, selection => {
          const label = String.trim(selection.labelInput)
          if (String.isEmpty(label)) {
            return { model }
          }
          return Option.match(loadedLabels(selection), {
            onNone: () => ({ model }),
            onSome: labels =>
              Array.contains(labels, label)
                ? { model }
                : changeLabels(
                    model,
                    modifyFields(selection, { labelInput: () => '' }),
                    LabelChange.Add({ label }),
                  ),
          })
        }),

      ClickedRemoveLabel: ({ label }) =>
        withSelection(model, selection =>
          Option.match(loadedLabels(selection), {
            onNone: () => ({ model }),
            onSome: labels =>
              Array.contains(labels, label)
                ? changeLabels(model, selection, LabelChange.Remove({ label }))
                : { model },
          }),
        ),

      SucceededChangeLabel: ({ changeId, labels }) =>
        withSelectionWhere(
          model,
          selection => hasLabelChange(selection, changeId),
          selection =>
            modifyFields(selection, {
              labelChanges: Array.filter(
                pending => pending.changeId !== changeId,
              ),
              labels: () => LabelsState.Loaded({ labels }),
            }),
        ),

      FailedChangeLabel: ({ changeId, error }) =>
        withSelectionWhere(
          model,
          selection => hasLabelChange(selection, changeId),
          selection =>
            modifyFields(selection, {
              labelChanges: Array.filter(
                pending => pending.changeId !== changeId,
              ),
              errors: errors =>
                modifyFields(errors, {
                  maybeLabelError: () => Option.some(error),
                }),
            }),
        ),
    },
  )
