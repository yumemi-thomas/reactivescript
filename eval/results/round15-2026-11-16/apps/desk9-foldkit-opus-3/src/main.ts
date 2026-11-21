import { Array, Option, pipe } from 'effect'
import { Runtime, type Update } from 'foldkit'
import { modifyFields } from 'foldkit/struct'

import {
  AddComment,
  AddLabel,
  Assign,
  CloseIssue,
  FetchComments,
  FetchIssue,
  FetchIssues,
  FetchItem,
  FetchLabels,
  LoadSettings,
  RemoveLabel,
  RenameIssue,
  SaveSettings,
  Search,
  SearchRelated,
} from './command'
import { IssueRow, Tab, maybeNameError, nextDensity } from './domain'
import { Message } from './message'
import {
  CommentsState,
  DetailState,
  FoundResults,
  HelpModel,
  IssueList,
  IssuesModel,
  ItemState,
  LabelChange,
  LabelsState,
  Model,
  Origin,
  Page,
  PendingChange,
  Post,
  PostStatus,
  RelatedState,
  Results,
  Saving,
  Selection,
  SettingsForm,
  SettingsModel,
  isClosing,
  openCountFor,
  shownLabels,
} from './model'
import { view } from './view'

export { Message, Model, view }

const MIN_QUERY_LENGTH = 2

// INIT

type Commands = Update.Commands<Message>

type PageStep<P> = Readonly<{ page: P; commands?: Commands }>

const initIssues = (requestId: number): PageStep<IssuesModel> => ({
  page: {
    user: 'guest',
    filter: 'open',
    list: IssueList.LoadingIssues({ requestId }),
    pendingChanges: [],
    maybeSelection: Option.none(),
    maybeRowError: Option.none(),
  },
  commands: [FetchIssues({ requestId, filter: 'open' })],
})

const initHelp = (): PageStep<HelpModel> => ({
  page: {
    query: '',
    results: Results.NoQuery(),
    maybeSelectedHitId: Option.none(),
    item: ItemState.NoItem(),
  },
})

const initSettings = (requestId: number): PageStep<SettingsModel> => ({
  page: SettingsModel.LoadingSettings({ requestId }),
  commands: [LoadSettings({ requestId })],
})

export const init: Runtime.ApplicationInit<Model, Message> = () => {
  const issuesInit = initIssues(0)
  return {
    model: {
      page: Page.IssuesPage({ issues: issuesInit.page }),
      maybeOpenCount: Option.none(),
      nextId: 1,
    },
    commands: issuesInit.commands ?? [],
  }
}

// UPDATE

type UpdateReturn = Update.Return<Model, Message>

const withCommands = (
  model: Model,
  commands: Commands | undefined,
): UpdateReturn => (commands === undefined ? { model } : { model, commands })

const onIssues = (
  model: Model,
  step: (page: IssuesModel, id: number) => PageStep<IssuesModel>,
): UpdateReturn =>
  Page.match<UpdateReturn>(model.page, {
    IssuesPage: ({ issues }) => {
      const issuesStep = step(issues, model.nextId)
      return withCommands(
        modifyFields(model, {
          page: () => Page.IssuesPage({ issues: issuesStep.page }),
          nextId: id => id + 1,
          maybeOpenCount: maybeOpenCount =>
            openCountFor(issuesStep.page, maybeOpenCount),
        }),
        issuesStep.commands,
      )
    },
    HelpPage: () => ({ model }),
    SettingsPage: () => ({ model }),
  })

const onHelp = (
  model: Model,
  step: (page: HelpModel, id: number) => PageStep<HelpModel>,
): UpdateReturn =>
  Page.match<UpdateReturn>(model.page, {
    IssuesPage: () => ({ model }),
    HelpPage: ({ help }) => {
      const helpStep = step(help, model.nextId)
      return withCommands(
        modifyFields(model, {
          page: () => Page.HelpPage({ help: helpStep.page }),
          nextId: id => id + 1,
        }),
        helpStep.commands,
      )
    },
    SettingsPage: () => ({ model }),
  })

const onSettings = (
  model: Model,
  step: (page: SettingsModel, id: number) => PageStep<SettingsModel>,
): UpdateReturn =>
  Page.match<UpdateReturn>(model.page, {
    IssuesPage: () => ({ model }),
    HelpPage: () => ({ model }),
    SettingsPage: ({ settings }) => {
      const settingsStep = step(settings, model.nextId)
      return withCommands(
        modifyFields(model, {
          page: () => Page.SettingsPage({ settings: settingsStep.page }),
          nextId: id => id + 1,
        }),
        settingsStep.commands,
      )
    },
  })

const onLoadedForm = (
  model: Model,
  step: (form: SettingsForm, id: number) => PageStep<SettingsForm>,
): UpdateReturn =>
  onSettings(model, (settings, id) =>
    SettingsModel.match<PageStep<SettingsModel>>(settings, {
      LoadingSettings: () => ({ page: settings }),
      FailedSettings: () => ({ page: settings }),
      LoadedSettings: ({ form }) => {
        const formStep = step(form, id)
        return formStep.commands === undefined
          ? { page: SettingsModel.LoadedSettings({ form: formStep.page }) }
          : {
              page: SettingsModel.LoadedSettings({ form: formStep.page }),
              commands: formStep.commands,
            }
      },
    }),
  )

const currentTab = (page: Page): Tab =>
  Page.match<Tab>(page, {
    IssuesPage: () => 'issues',
    HelpPage: () => 'help',
    SettingsPage: () => 'settings',
  })

const openTab = (model: Model, tab: Tab): UpdateReturn => {
  if (currentTab(model.page) === tab && tab !== 'help') {
    return { model }
  }
  const id = model.nextId
  const nextModel = (page: Page) =>
    modifyFields(model, { page: () => page, nextId: nextId => nextId + 1 })
  if (tab === 'issues') {
    const issuesInit = initIssues(id)
    return withCommands(
      nextModel(Page.IssuesPage({ issues: issuesInit.page })),
      issuesInit.commands,
    )
  }
  if (tab === 'help') {
    const helpInit = initHelp()
    return withCommands(
      nextModel(Page.HelpPage({ help: helpInit.page })),
      helpInit.commands,
    )
  }
  const settingsInit = initSettings(id)
  return withCommands(
    nextModel(Page.SettingsPage({ settings: settingsInit.page })),
    settingsInit.commands,
  )
}

// UPDATE: ISSUES

const onSelection = (
  page: IssuesModel,
  step: (selection: Selection) => PageStep<Selection>,
): PageStep<IssuesModel> =>
  Option.match(page.maybeSelection, {
    onNone: () => ({ page }),
    onSome: selection => {
      const selectionStep = step(selection)
      const nextPage = modifyFields(page, {
        maybeSelection: () => Option.some(selectionStep.page),
      })
      return selectionStep.commands === undefined
        ? { page: nextPage }
        : { page: nextPage, commands: selectionStep.commands }
    },
  })

const onSelectionToken = (
  page: IssuesModel,
  token: number,
  step: (selection: Selection) => PageStep<Selection>,
): PageStep<IssuesModel> =>
  onSelection(page, selection =>
    selection.token === token ? step(selection) : { page: selection },
  )

const modifyBaseIssues = (
  page: IssuesModel,
  f: (issues: ReadonlyArray<IssueRow>) => ReadonlyArray<IssueRow>,
): IssuesModel =>
  modifyFields(page, {
    list: list =>
      list._tag === 'LoadedIssues'
        ? IssueList.LoadedIssues({ issues: f(list.issues) })
        : list,
  })

const findChange = (
  page: IssuesModel,
  opId: number,
): Option.Option<PendingChange> =>
  Array.findFirst(page.pendingChanges, change => change.opId === opId)

const withoutChange = (page: IssuesModel, opId: number): IssuesModel =>
  modifyFields(page, {
    pendingChanges: changes =>
      Array.filter(changes, change => change.opId !== opId),
  })

const reportFailure = (
  page: IssuesModel,
  origin: Origin,
  error: string,
  setError: (selection: Selection, error: string) => Selection,
): IssuesModel =>
  Origin.match<IssuesModel>(origin, {
    FromRow: () =>
      modifyFields(page, { maybeRowError: () => Option.some(error) }),
    FromDetail: ({ token }) =>
      onSelectionToken(page, token, selection => ({
        page: setError(selection, error),
      })).page,
  })

const newSelection = (token: number, issueId: number): Selection => ({
  token,
  issueId,
  detail: DetailState.LoadingDetail({ requestId: token }),
  related: RelatedState.RelatedIdle(),
  comments: CommentsState.LoadingComments(),
  posts: [],
  labels: LabelsState.LoadingLabels(),
  labelsVersion: token,
  labelChanges: [],
  titleInput: '',
  commentInput: '',
  labelInput: '',
  maybeAssignError: Option.none(),
  maybeRenameError: Option.none(),
  maybeCloseError: Option.none(),
  maybePostError: Option.none(),
  maybeLabelError: Option.none(),
})

const startAssign = (
  page: IssuesModel,
  opId: number,
  issueId: number,
  origin: Origin,
): PageStep<IssuesModel> => ({
  page: modifyFields(page, {
    pendingChanges: Array.append(
      PendingChange.PendingAssign({
        opId,
        issueId,
        assignee: page.user,
        origin,
      }),
    ),
  }),
  commands: [Assign({ opId, issueId, user: page.user })],
})

const startClose = (
  page: IssuesModel,
  opId: number,
  issueId: number,
  origin: Origin,
): PageStep<IssuesModel> => ({
  page: modifyFields(page, {
    pendingChanges: Array.append(
      PendingChange.PendingClose({ opId, issueId, origin }),
    ),
  }),
  commands: [CloseIssue({ opId, issueId })],
})

const hasUser = (page: IssuesModel): boolean => page.user.trim() !== ''

export const update = (model: Model, message: Message) =>
  Message.match<UpdateReturn>(message, {
    ClickedTab: ({ tab }) => openTab(model, tab),

    UpdatedUser: ({ value }) =>
      onIssues(model, page => ({
        page: modifyFields(page, { user: () => value }),
      })),

    ClickedFilter: ({ filter }) =>
      onIssues(model, (page, requestId) => {
        if (filter === page.filter && page.list._tag !== 'FailedIssues') {
          return { page }
        }
        return {
          page: modifyFields(page, {
            filter: () => filter,
            list: () => IssueList.LoadingIssues({ requestId }),
          }),
          commands: [FetchIssues({ requestId, filter })],
        }
      }),

    SucceededFetchIssues: ({ requestId, issues }) =>
      onIssues(model, page => ({
        page:
          page.list._tag === 'LoadingIssues' &&
          page.list.requestId === requestId
            ? modifyFields(page, {
                list: () => IssueList.LoadedIssues({ issues }),
              })
            : page,
      })),

    FailedFetchIssues: ({ requestId, error }) =>
      onIssues(model, page => ({
        page:
          page.list._tag === 'LoadingIssues' &&
          page.list.requestId === requestId
            ? modifyFields(page, {
                list: () => IssueList.FailedIssues({ error }),
              })
            : page,
      })),

    ClickedIssue: ({ issueId }) =>
      onIssues(model, (page, token) => {
        const isAlreadySelected = Option.exists(
          page.maybeSelection,
          selection => selection.issueId === issueId,
        )
        if (isAlreadySelected) {
          return { page }
        }
        return {
          page: modifyFields(page, {
            maybeSelection: () => Option.some(newSelection(token, issueId)),
          }),
          commands: [
            FetchIssue({ requestId: token, issueId }),
            FetchComments({ token, issueId }),
            FetchLabels({ token, issueId }),
          ],
        }
      }),

    ClickedRetryIssue: () =>
      onIssues(model, (page, requestId) =>
        onSelection(page, selection => ({
          page: modifyFields(selection, {
            detail: () => DetailState.LoadingDetail({ requestId }),
            related: () => RelatedState.RelatedIdle(),
          }),
          commands: [FetchIssue({ requestId, issueId: selection.issueId })],
        })),
      ),

    SucceededFetchIssue: ({ requestId, maybeDetail }) =>
      onIssues(model, (page, relatedRequestId) =>
        onSelection(page, selection => {
          if (
            selection.detail._tag !== 'LoadingDetail' ||
            selection.detail.requestId !== requestId
          ) {
            return { page: selection }
          }
          return Option.match(maybeDetail, {
            onNone: () => ({
              page: modifyFields(selection, {
                detail: () => DetailState.MissingDetail(),
              }),
            }),
            onSome: detail => ({
              page: modifyFields(selection, {
                detail: () => DetailState.LoadedDetail({ detail }),
                related: () =>
                  RelatedState.LoadingRelated({
                    requestId: relatedRequestId,
                    query: detail.title,
                  }),
              }),
              commands: [
                SearchRelated({
                  requestId: relatedRequestId,
                  query: detail.title,
                }),
              ],
            }),
          })
        }),
      ),

    FailedFetchIssue: ({ requestId, error }) =>
      onIssues(model, page =>
        onSelection(page, selection => ({
          page:
            selection.detail._tag === 'LoadingDetail' &&
            selection.detail.requestId === requestId
              ? modifyFields(selection, {
                  detail: () => DetailState.FailedDetail({ error }),
                })
              : selection,
        })),
      ),

    SucceededSearchRelated: ({ requestId, hits }) =>
      onIssues(model, page =>
        onSelection(page, selection => ({
          page: modifyFields(selection, {
            related: related =>
              related._tag === 'LoadingRelated' &&
              related.requestId === requestId
                ? RelatedState.LoadedRelated({ query: related.query, hits })
                : related,
          }),
        })),
      ),

    FailedSearchRelated: ({ requestId, error }) =>
      onIssues(model, page =>
        onSelection(page, selection => ({
          page:
            selection.related._tag === 'LoadingRelated' &&
            selection.related.requestId === requestId
              ? modifyFields(selection, {
                  related: () => RelatedState.FailedRelated({ error }),
                })
              : selection,
        })),
      ),

    ClickedRelatedHit: ({ hitId }) =>
      Page.match<UpdateReturn>(model.page, {
        IssuesPage: ({ issues }) =>
          pipe(
            issues.maybeSelection,
            Option.flatMap(selection =>
              selection.related._tag === 'LoadedRelated'
                ? Option.some(selection.related)
                : Option.none(),
            ),
            Option.filter(related =>
              Array.some(related.hits, hit => hit.id === hitId),
            ),
            Option.match({
              onNone: () => ({ model }),
              onSome: related => {
                const requestId = model.nextId
                return {
                  model: modifyFields(model, {
                    page: () =>
                      Page.HelpPage({
                        help: {
                          query: related.query,
                          results: Results.Found({
                            query: related.query,
                            hits: related.hits,
                          }),
                          maybeSelectedHitId: Option.some(hitId),
                          item: ItemState.LoadingItem({ requestId, hitId }),
                        },
                      }),
                    nextId: id => id + 1,
                  }),
                  commands: [FetchItem({ requestId, hitId })],
                }
              },
            }),
          ),
        HelpPage: () => ({ model }),
        SettingsPage: () => ({ model }),
      }),

    ClickedAssign: () =>
      onIssues(model, (page, opId) =>
        Option.match(page.maybeSelection, {
          onNone: () => ({ page }),
          onSome: selection => {
            if (!hasUser(page)) {
              return { page }
            }
            return startAssign(
              modifyFields(page, {
                maybeSelection: () =>
                  Option.some(
                    modifyFields(selection, {
                      maybeAssignError: () => Option.none(),
                    }),
                  ),
              }),
              opId,
              selection.issueId,
              Origin.FromDetail({ token: selection.token }),
            )
          },
        }),
      ),

    ClickedRowAssign: ({ issueId }) =>
      onIssues(model, (page, opId) =>
        hasUser(page)
          ? startAssign(
              modifyFields(page, { maybeRowError: () => Option.none() }),
              opId,
              issueId,
              Origin.FromRow(),
            )
          : { page },
      ),

    SucceededAssign: ({ opId, assignee }) =>
      onIssues(model, page =>
        Option.match(findChange(page, opId), {
          onNone: () => ({ page }),
          onSome: change => ({
            page: modifyBaseIssues(withoutChange(page, opId), issues =>
              Array.map(issues, issue =>
                issue.id === change.issueId
                  ? modifyFields(issue, {
                      maybeAssignee: () => Option.some(assignee),
                    })
                  : issue,
              ),
            ),
          }),
        }),
      ),

    FailedAssign: ({ opId, error }) =>
      onIssues(model, page =>
        Option.match(findChange(page, opId), {
          onNone: () => ({ page }),
          onSome: change => ({
            page:
              change._tag === 'PendingAssign'
                ? reportFailure(
                    withoutChange(page, opId),
                    change.origin,
                    error,
                    (selection, assignError) =>
                      modifyFields(selection, {
                        maybeAssignError: () => Option.some(assignError),
                      }),
                  )
                : withoutChange(page, opId),
          }),
        }),
      ),

    UpdatedTitleInput: ({ value }) =>
      onIssues(model, page =>
        onSelection(page, selection => ({
          page: modifyFields(selection, { titleInput: () => value }),
        })),
      ),

    ClickedRename: () =>
      onIssues(model, (page, opId) =>
        Option.match(page.maybeSelection, {
          onNone: () => ({ page }),
          onSome: selection => {
            const title = selection.titleInput.trim()
            if (title === '') {
              return { page }
            }
            return {
              page: modifyFields(page, {
                pendingChanges: Array.append(
                  PendingChange.PendingRename({
                    opId,
                    issueId: selection.issueId,
                    title,
                    token: selection.token,
                  }),
                ),
                maybeSelection: () =>
                  Option.some(
                    modifyFields(selection, {
                      titleInput: () => '',
                      maybeRenameError: () => Option.none(),
                    }),
                  ),
              }),
              commands: [
                RenameIssue({ opId, issueId: selection.issueId, title }),
              ],
            }
          },
        }),
      ),

    SucceededRenameIssue: ({ opId, title }) =>
      onIssues(model, page =>
        Option.match(findChange(page, opId), {
          onNone: () => ({ page }),
          onSome: change => {
            const renamed = modifyBaseIssues(withoutChange(page, opId), issues =>
              Array.map(issues, issue =>
                issue.id === change.issueId
                  ? modifyFields(issue, { title: () => title })
                  : issue,
              ),
            )
            return onSelection(renamed, selection => ({
              page: modifyFields(selection, {
                detail: detail =>
                  detail._tag === 'LoadedDetail' &&
                  detail.detail.id === change.issueId
                    ? DetailState.LoadedDetail({
                        detail: modifyFields(detail.detail, {
                          title: () => title,
                        }),
                      })
                    : detail,
              }),
            }))
          },
        }),
      ),

    FailedRenameIssue: ({ opId, error }) =>
      onIssues(model, page =>
        Option.match(findChange(page, opId), {
          onNone: () => ({ page }),
          onSome: change =>
            change._tag === 'PendingRename'
              ? onSelectionToken(
                  withoutChange(page, opId),
                  change.token,
                  selection => ({
                    page: modifyFields(selection, {
                      maybeRenameError: () => Option.some(error),
                    }),
                  }),
                )
              : { page: withoutChange(page, opId) },
        }),
      ),

    ClickedClose: () =>
      onIssues(model, (page, opId) =>
        Option.match(page.maybeSelection, {
          onNone: () => ({ page }),
          onSome: selection => {
            if (isClosing(page.pendingChanges, selection.issueId)) {
              return { page }
            }
            return startClose(
              modifyFields(page, {
                maybeSelection: () =>
                  Option.some(
                    modifyFields(selection, {
                      maybeCloseError: () => Option.none(),
                    }),
                  ),
              }),
              opId,
              selection.issueId,
              Origin.FromDetail({ token: selection.token }),
            )
          },
        }),
      ),

    ClickedRowClose: ({ issueId }) =>
      onIssues(model, (page, opId) =>
        page.filter === 'open' && !isClosing(page.pendingChanges, issueId)
          ? startClose(
              modifyFields(page, { maybeRowError: () => Option.none() }),
              opId,
              issueId,
              Origin.FromRow(),
            )
          : { page },
      ),

    SucceededCloseIssue: ({ opId }) =>
      onIssues(model, page =>
        Option.match(findChange(page, opId), {
          onNone: () => ({ page }),
          onSome: change => {
            const withoutPending = withoutChange(page, opId)
            return {
              page:
                page.filter === 'open'
                  ? modifyBaseIssues(withoutPending, issues =>
                      Array.filter(issues, issue => issue.id !== change.issueId),
                    )
                  : withoutPending,
            }
          },
        }),
      ),

    FailedCloseIssue: ({ opId, error }) =>
      onIssues(model, page =>
        Option.match(findChange(page, opId), {
          onNone: () => ({ page }),
          onSome: change => ({
            page:
              change._tag === 'PendingClose'
                ? reportFailure(
                    withoutChange(page, opId),
                    change.origin,
                    error,
                    (selection, closeError) =>
                      modifyFields(selection, {
                        maybeCloseError: () => Option.some(closeError),
                      }),
                  )
                : withoutChange(page, opId),
          }),
        }),
      ),

    SucceededFetchComments: ({ token, comments }) =>
      onIssues(model, page =>
        onSelectionToken(page, token, selection => ({
          page:
            selection.comments._tag === 'LoadingComments'
              ? modifyFields(selection, {
                  comments: () => CommentsState.LoadedComments({ comments }),
                })
              : selection,
        })),
      ),

    FailedFetchComments: ({ token, error }) =>
      onIssues(model, page =>
        onSelectionToken(page, token, selection => ({
          page:
            selection.comments._tag === 'LoadingComments'
              ? modifyFields(selection, {
                  comments: () => CommentsState.FailedComments({ error }),
                })
              : selection,
        })),
      ),

    UpdatedCommentInput: ({ value }) =>
      onIssues(model, page =>
        onSelection(page, selection => ({
          page: modifyFields(selection, { commentInput: () => value }),
        })),
      ),

    ClickedPost: () =>
      onIssues(model, (page, opId) =>
        onSelection(page, selection => {
          const text = selection.commentInput.trim()
          if (text === '' || !hasUser(page)) {
            return { page: selection }
          }
          return {
            page: modifyFields(selection, {
              posts: Array.append(
                Post.make({
                  opId,
                  comment: { author: page.user, text },
                  status: 'Sending',
                }),
              ),
              commentInput: () => '',
              maybePostError: () => Option.none(),
            }),
            commands: [
              AddComment({
                token: selection.token,
                opId,
                issueId: selection.issueId,
                author: page.user,
                text,
              }),
            ],
          }
        }),
      ),

    SucceededAddComment: ({ token, opId, comment }) =>
      onIssues(model, page =>
        onSelectionToken(page, token, selection => ({
          page: modifyFields(selection, {
            posts: posts =>
              Array.map(posts, post =>
                post.opId === opId
                  ? modifyFields(post, {
                      comment: () => comment,
                      status: (): PostStatus => 'Sent',
                    })
                  : post,
              ),
          }),
        })),
      ),

    FailedAddComment: ({ token, opId, error }) =>
      onIssues(model, page =>
        onSelectionToken(page, token, selection => ({
          page: modifyFields(selection, {
            posts: posts => Array.filter(posts, post => post.opId !== opId),
            maybePostError: () => Option.some(error),
          }),
        })),
      ),

    SucceededFetchLabels: ({ token, labels }) =>
      onIssues(model, page =>
        onSelectionToken(page, token, selection => ({
          page:
            selection.labels._tag === 'LoadingLabels'
              ? modifyFields(selection, {
                  labels: () => LabelsState.LoadedLabels({ labels }),
                })
              : selection,
        })),
      ),

    FailedFetchLabels: ({ token, error }) =>
      onIssues(model, page =>
        onSelectionToken(page, token, selection => ({
          page:
            selection.labels._tag === 'LoadingLabels'
              ? modifyFields(selection, {
                  labels: () => LabelsState.FailedLabels({ error }),
                })
              : selection,
        })),
      ),

    UpdatedLabelInput: ({ value }) =>
      onIssues(model, page =>
        onSelection(page, selection => ({
          page: modifyFields(selection, { labelInput: () => value }),
        })),
      ),

    ClickedAddLabel: () =>
      onIssues(model, (opIdPage, opId) =>
        onSelection(opIdPage, selection => {
          const label = selection.labelInput.trim()
          const currentLabels =
            selection.labels._tag === 'LoadedLabels'
              ? shownLabels(selection, selection.labels.labels)
              : shownLabels(selection, [])
          if (label === '' || Array.contains(currentLabels, label)) {
            return { page: selection }
          }
          return {
            page: modifyFields(selection, {
              labelChanges: Array.append(
                LabelChange.PendingAddLabel({ opId, label }),
              ),
              labelInput: () => '',
              maybeLabelError: () => Option.none(),
            }),
            commands: [
              AddLabel({
                token: selection.token,
                opId,
                issueId: selection.issueId,
                label,
              }),
            ],
          }
        }),
      ),

    ClickedRemoveLabel: ({ label }) =>
      onIssues(model, (page, opId) =>
        onSelection(page, selection => ({
          page: modifyFields(selection, {
            labelChanges: Array.append(
              LabelChange.PendingRemoveLabel({ opId, label }),
            ),
            maybeLabelError: () => Option.none(),
          }),
          commands: [
            RemoveLabel({
              token: selection.token,
              opId,
              issueId: selection.issueId,
              label,
            }),
          ],
        })),
      ),

    SucceededChangeLabel: ({ token, opId, labels }) =>
      onIssues(model, page =>
        onSelectionToken(page, token, selection => {
          const withoutPending = modifyFields(selection, {
            labelChanges: changes =>
              Array.filter(changes, change => change.opId !== opId),
          })
          return {
            page:
              opId > selection.labelsVersion
                ? modifyFields(withoutPending, {
                    labels: () => LabelsState.LoadedLabels({ labels }),
                    labelsVersion: () => opId,
                  })
                : withoutPending,
          }
        }),
      ),

    FailedChangeLabel: ({ token, opId, error }) =>
      onIssues(model, page =>
        onSelectionToken(page, token, selection => ({
          page: modifyFields(selection, {
            labelChanges: changes =>
              Array.filter(changes, change => change.opId !== opId),
            maybeLabelError: () => Option.some(error),
          }),
        })),
      ),

    UpdatedQuery: ({ value }) =>
      onHelp(model, (help, requestId) => {
        const withQuery = modifyFields(help, { query: () => value })
        const length = Array.fromIterable(value).length
        if (length === 0) {
          return {
            page: modifyFields(withQuery, { results: () => Results.NoQuery() }),
          }
        }
        if (length < MIN_QUERY_LENGTH) {
          return {
            page: modifyFields(withQuery, {
              results: () => Results.TooShort({ query: value }),
            }),
          }
        }
        return {
          page: modifyFields(withQuery, {
            results: results =>
              Results.Searching({
                requestId,
                query: value,
                maybePrevious: previousResults(results),
              }),
          }),
          commands: [Search({ requestId, query: value })],
        }
      }),

    SucceededSearch: ({ requestId, hits }) =>
      onHelp(model, help => ({
        page:
          help.results._tag === 'Searching' &&
          help.results.requestId === requestId
            ? modifyFields(help, {
                results: () =>
                  Results.Found({
                    query:
                      help.results._tag === 'Searching'
                        ? help.results.query
                        : help.query,
                    hits,
                  }),
              })
            : help,
      })),

    FailedSearch: ({ requestId, error }) =>
      onHelp(model, help => ({
        page:
          help.results._tag === 'Searching' &&
          help.results.requestId === requestId
            ? modifyFields(help, {
                results: () =>
                  Results.SearchFailed({
                    query:
                      help.results._tag === 'Searching'
                        ? help.results.query
                        : help.query,
                    error,
                  }),
              })
            : help,
      })),

    ClickedHit: ({ hitId }) =>
      onHelp(model, (help, requestId) => {
        const isAlreadyShown =
          Option.contains(help.maybeSelectedHitId, hitId) &&
          help.item._tag !== 'FailedItem'
        if (isAlreadyShown) {
          return { page: help }
        }
        return {
          page: modifyFields(help, {
            maybeSelectedHitId: () => Option.some(hitId),
            item: () => ItemState.LoadingItem({ requestId, hitId }),
          }),
          commands: [FetchItem({ requestId, hitId })],
        }
      }),

    ClickedRetryItem: () =>
      onHelp(model, (help, requestId) =>
        Option.match(help.maybeSelectedHitId, {
          onNone: () => ({ page: help }),
          onSome: hitId => ({
            page: modifyFields(help, {
              item: () => ItemState.LoadingItem({ requestId, hitId }),
            }),
            commands: [FetchItem({ requestId, hitId })],
          }),
        }),
      ),

    SucceededFetchItem: ({ requestId, maybeItem }) =>
      onHelp(model, help =>
        ItemState.match<PageStep<HelpModel>>(help.item, {
          NoItem: () => ({ page: help }),
          LoadedItem: () => ({ page: help }),
          MissingItem: () => ({ page: help }),
          FailedItem: () => ({ page: help }),
          LoadingItem: loading =>
            loading.requestId === requestId
              ? {
                  page: modifyFields(help, {
                    item: () =>
                      Option.match(maybeItem, {
                        onNone: () =>
                          ItemState.MissingItem({ hitId: loading.hitId }),
                        onSome: item => ItemState.LoadedItem({ item }),
                      }),
                  }),
                }
              : { page: help },
        }),
      ),

    FailedFetchItem: ({ requestId, error }) =>
      onHelp(model, help =>
        ItemState.match<PageStep<HelpModel>>(help.item, {
          NoItem: () => ({ page: help }),
          LoadedItem: () => ({ page: help }),
          MissingItem: () => ({ page: help }),
          FailedItem: () => ({ page: help }),
          LoadingItem: loading =>
            loading.requestId === requestId
              ? {
                  page: modifyFields(help, {
                    item: () =>
                      ItemState.FailedItem({ hitId: loading.hitId, error }),
                  }),
                }
              : { page: help },
        }),
      ),

    SucceededLoadSettings: ({ requestId, settings }) =>
      onSettings(model, state => ({
        page:
          state._tag === 'LoadingSettings' && state.requestId === requestId
            ? SettingsModel.LoadedSettings({
                form: {
                  saved: settings,
                  savedVersion: requestId,
                  draft: settings,
                  maybeSaving: Option.none(),
                  maybeSaveError: Option.none(),
                },
              })
            : state,
      })),

    FailedLoadSettings: ({ requestId, error }) =>
      onSettings(model, state => ({
        page:
          state._tag === 'LoadingSettings' && state.requestId === requestId
            ? SettingsModel.FailedSettings({ error })
            : state,
      })),

    ClickedRetryLoad: () =>
      onSettings(model, (state, requestId) =>
        state._tag === 'FailedSettings' ? initSettings(requestId) : { page: state },
      ),

    UpdatedName: ({ value }) =>
      onLoadedForm(model, form => ({
        page: modifyFields(form, {
          draft: draft => modifyFields(draft, { name: () => value }),
        }),
      })),

    ClickedTheme: ({ theme }) =>
      onLoadedForm(model, form => ({
        page: modifyFields(form, {
          draft: draft => modifyFields(draft, { theme: () => theme }),
        }),
      })),

    ClickedDensityToggle: () =>
      onLoadedForm(model, form => ({
        page: modifyFields(form, {
          draft: draft => modifyFields(draft, { density: nextDensity }),
        }),
      })),

    ClickedSave: () =>
      onLoadedForm(model, (form, requestId) => {
        if (Option.isSome(maybeNameError(form.draft.name))) {
          return { page: form }
        }
        return {
          page: modifyFields(form, {
            maybeSaving: () =>
              Option.some(Saving.make({ requestId, settings: form.draft })),
            maybeSaveError: () => Option.none(),
          }),
          commands: [SaveSettings({ requestId, settings: form.draft })],
        }
      }),

    SucceededSaveSettings: ({ requestId, settings }) =>
      onLoadedForm(model, form => {
        const isLatestSave = Option.exists(
          form.maybeSaving,
          saving => saving.requestId === requestId,
        )
        const isNewer = requestId > form.savedVersion
        return {
          page: modifyFields(form, {
            saved: saved => (isNewer ? settings : saved),
            savedVersion: version => (isNewer ? requestId : version),
            maybeSaving: maybeSaving =>
              isLatestSave ? Option.none() : maybeSaving,
          }),
        }
      }),

    FailedSaveSettings: ({ requestId, error }) =>
      onLoadedForm(model, form =>
        Option.exists(form.maybeSaving, saving => saving.requestId === requestId)
          ? {
              page: modifyFields(form, {
                maybeSaving: () => Option.none(),
                maybeSaveError: () => Option.some(error),
              }),
            }
          : { page: form },
      ),
  })

const previousResults = (results: Results): Option.Option<FoundResults> =>
  Results.match<Option.Option<FoundResults>>(results, {
    NoQuery: () => Option.none(),
    TooShort: () => Option.none(),
    Searching: ({ maybePrevious }) => maybePrevious,
    Found: ({ query, hits }) => Option.some(FoundResults.make({ query, hits })),
    SearchFailed: () => Option.none(),
  })
