import { Array, Option, pipe } from 'effect'
import { type Update } from 'foldkit'
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
import {
  applyLabelChange,
  isClosing,
  maybeShownResults,
  maybeVisibleLabels,
  maybeVisibleOpenCount,
  MIN_QUERY_LENGTH,
  queryLength,
} from './derive'
import { Filter, Issue, NameValidity, Settings, validateName } from './domain'
import { Message, Tab } from './message'
import {
  CommentsState,
  DetailState,
  HelpPage,
  IssueChange,
  IssueList,
  IssuesPage,
  ItemState,
  LabelChange,
  LabelsState,
  Model,
  Page,
  Post,
  RelatedState,
  Results,
  SelectedHit,
  Selection,
  SettingsForm,
  SettingsPage,
} from './model'

type UpdateReturn = Update.Return<Model, Message>

// TOKENS

const takeToken = (model: Model): Model =>
  modifyFields(model, { nextToken: token => token + 1 })

// PAGE ACCESS

const setIssues = (model: Model, issues: IssuesPage): Model =>
  modifyFields(model, {
    page: () => Page.IssuesTab({ issues }),
    maybeOpenCount: maybeCount =>
      Option.orElse(maybeVisibleOpenCount(issues), () => maybeCount),
  })

const onIssues = (
  model: Model,
  f: (issues: IssuesPage) => UpdateReturn,
): UpdateReturn =>
  Page.matchOrElse<UpdateReturn>(
    model.page,
    { IssuesTab: ({ issues }) => f(issues) },
    () => ({ model }),
  )

const onSelection = (
  model: Model,
  f: (issues: IssuesPage, selection: Selection) => UpdateReturn,
): UpdateReturn =>
  onIssues(model, issues =>
    Option.match(issues.maybeSelection, {
      onNone: () => ({ model }),
      onSome: selection => f(issues, selection),
    }),
  )

const setSelection = (
  model: Model,
  issues: IssuesPage,
  selection: Selection,
): Model =>
  setIssues(
    model,
    modifyFields(issues, { maybeSelection: () => Option.some(selection) }),
  )

const modifySelectionWhere = (
  issues: IssuesPage,
  issueId: number,
  f: (selection: Selection) => Selection,
): IssuesPage =>
  modifyFields(issues, {
    maybeSelection: Option.map(selection =>
      selection.issueId === issueId ? f(selection) : selection,
    ),
  })

const setHelp = (model: Model, help: HelpPage): Model =>
  modifyFields(model, { page: () => Page.HelpTab({ help }) })

const onHelp = (
  model: Model,
  f: (help: HelpPage) => UpdateReturn,
): UpdateReturn =>
  Page.matchOrElse<UpdateReturn>(
    model.page,
    { HelpTab: ({ help }) => f(help) },
    () => ({ model }),
  )

const setSettings = (model: Model, settings: SettingsPage): Model =>
  modifyFields(model, { page: () => Page.SettingsTab({ settings }) })

const onSettings = (
  model: Model,
  f: (settings: SettingsPage) => UpdateReturn,
): UpdateReturn =>
  Page.matchOrElse<UpdateReturn>(
    model.page,
    { SettingsTab: ({ settings }) => f(settings) },
    () => ({ model }),
  )

const onSettingsForm = (
  model: Model,
  f: (form: SettingsForm) => UpdateReturn,
): UpdateReturn =>
  onSettings(model, settings =>
    SettingsPage.matchOrElse<UpdateReturn>(
      settings,
      { SettingsReady: ({ form }) => f(form) },
      () => ({ model }),
    ),
  )

const setSettingsForm = (model: Model, form: SettingsForm): Model =>
  setSettings(model, SettingsPage.SettingsReady({ form }))

// PAGE INIT

const initIssuesPage = (model: Model): UpdateReturn => {
  const token = model.nextToken
  return {
    model: setIssues(takeToken(model), {
      user: 'guest',
      filter: 'open',
      list: IssueList.ListLoading({ token }),
      changes: [],
      maybeRowError: Option.none(),
      maybeSelection: Option.none(),
    }),
    commands: [FetchIssues({ token, filter: 'open' })],
  }
}

const emptyHelpPage: HelpPage = {
  query: '',
  results: Results.ResultsNone(),
  maybeSelectedHit: Option.none(),
}

const initSettingsPage = (model: Model): UpdateReturn => {
  const token = model.nextToken
  return {
    model: setSettings(
      takeToken(model),
      SettingsPage.SettingsLoading({ token }),
    ),
    commands: [LoadSettings({ token })],
  }
}

const currentTab = (page: Page): Tab =>
  Page.match(page, {
    IssuesTab: () => 'Issues' as const,
    HelpTab: () => 'Help' as const,
    SettingsTab: () => 'Settings' as const,
  })

const openTab = (model: Model, tab: Tab): UpdateReturn => {
  if (currentTab(model.page) === tab) {
    return { model }
  }
  if (tab === 'Issues') {
    return initIssuesPage(model)
  }
  if (tab === 'Help') {
    return { model: setHelp(model, emptyHelpPage) }
  }
  return initSettingsPage(model)
}

// ISSUES HELPERS

const loadList = (model: Model, issues: IssuesPage, filter: Filter) => {
  const token = model.nextToken
  return {
    model: setIssues(
      takeToken(model),
      modifyFields(issues, {
        filter: () => filter,
        list: () => IssueList.ListLoading({ token }),
      }),
    ),
    commands: [FetchIssues({ token, filter })],
  }
}

const modifyConfirmedIssue = (
  issues: IssuesPage,
  issueId: number,
  f: (issue: Issue) => Issue,
): IssuesPage =>
  modifyFields(issues, {
    list: list =>
      IssueList.matchOrElse<IssueList>(
        list,
        {
          ListLoaded: loaded =>
            IssueList.ListLoaded({
              issues: Array.map(loaded.issues, issue =>
                issue.id === issueId ? f(issue) : issue,
              ),
            }),
        },
        () => list,
      ),
  })

const removeConfirmedIssue = (
  issues: IssuesPage,
  issueId: number,
): IssuesPage =>
  modifyFields(issues, {
    list: list =>
      IssueList.matchOrElse<IssueList>(
        list,
        {
          ListLoaded: loaded =>
            issues.filter === 'open'
              ? IssueList.ListLoaded({
                  issues: Array.filter(
                    loaded.issues,
                    issue => issue.id !== issueId,
                  ),
                })
              : loaded,
        },
        () => list,
      ),
  })

const onIssueChange = (
  model: Model,
  opId: number,
  f: (issues: IssuesPage, change: IssueChange) => UpdateReturn,
): UpdateReturn =>
  onIssues(model, issues =>
    pipe(
      issues.changes,
      Array.findFirst(change => change.opId === opId),
      Option.match({
        onNone: () => ({ model }),
        onSome: change =>
          f(
            modifyFields(issues, {
              changes: Array.filter(change_ => change_.opId !== opId),
            }),
            change,
          ),
      }),
    ),
  )

const startAssign = (
  model: Model,
  issues: IssuesPage,
  issueId: number,
  origin: 'Row' | 'Detail',
): UpdateReturn => {
  if (issues.user.trim() === '') {
    return { model }
  }
  const opId = model.nextToken
  const started = modifyFields(issues, {
    changes: Array.append(
      IssueChange.Assigning({ opId, issueId, user: issues.user, origin }),
    ),
  })
  return {
    model: setIssues(
      takeToken(model),
      origin === 'Row'
        ? modifyFields(started, { maybeRowError: () => Option.none() })
        : modifySelectionWhere(started, issueId, selection =>
            modifyFields(selection, { maybeAssignError: () => Option.none() }),
          ),
    ),
    commands: [Assign({ opId, issueId, user: issues.user })],
  }
}

const startClose = (
  model: Model,
  issues: IssuesPage,
  issueId: number,
  origin: 'Row' | 'Detail',
): UpdateReturn => {
  if (isClosing(issues, issueId)) {
    return { model }
  }
  const opId = model.nextToken
  const started = modifyFields(issues, {
    changes: Array.append(IssueChange.Closing({ opId, issueId, origin })),
  })
  return {
    model: setIssues(
      takeToken(model),
      origin === 'Row'
        ? modifyFields(started, { maybeRowError: () => Option.none() })
        : modifySelectionWhere(started, issueId, selection =>
            modifyFields(selection, { maybeCloseError: () => Option.none() }),
          ),
    ),
    commands: [CloseIssue({ opId, issueId })],
  }
}

const declineIssueChange = (
  issues: IssuesPage,
  change: IssueChange,
  error: string,
): IssuesPage =>
  IssueChange.match(change, {
    Assigning: ({ issueId, origin }) =>
      origin === 'Row'
        ? modifyFields(issues, { maybeRowError: () => Option.some(error) })
        : modifySelectionWhere(issues, issueId, selection =>
            modifyFields(selection, {
              maybeAssignError: () => Option.some(error),
            }),
          ),
    Renaming: ({ issueId }) =>
      modifySelectionWhere(issues, issueId, selection =>
        modifyFields(selection, {
          maybeRenameError: () => Option.some(error),
        }),
      ),
    Closing: ({ issueId, origin }) =>
      origin === 'Row'
        ? modifyFields(issues, { maybeRowError: () => Option.some(error) })
        : modifySelectionWhere(issues, issueId, selection =>
            modifyFields(selection, {
              maybeCloseError: () => Option.some(error),
            }),
          ),
  })

const selectIssue = (
  model: Model,
  issues: IssuesPage,
  issueId: number,
): UpdateReturn => {
  const token = model.nextToken
  const selection: Selection = {
    issueId,
    selectionToken: token,
    detailToken: token,
    detail: DetailState.DetailLoading(),
    comments: CommentsState.CommentsLoading(),
    posts: [],
    labels: LabelsState.LabelsLoading(),
    labelChanges: [],
    related: RelatedState.RelatedIdle(),
    titleInput: '',
    commentInput: '',
    labelInput: '',
    maybeAssignError: Option.none(),
    maybeRenameError: Option.none(),
    maybeCloseError: Option.none(),
    maybePostError: Option.none(),
    maybeLabelError: Option.none(),
  }
  return {
    model: setSelection(takeToken(model), issues, selection),
    commands: [
      FetchIssue({ token, issueId }),
      FetchComments({ token, issueId }),
      FetchLabels({ token, issueId }),
    ],
  }
}

const onLabelChange = (
  model: Model,
  opId: number,
  f: (
    issues: IssuesPage,
    selection: Selection,
    change: LabelChange,
  ) => UpdateReturn,
): UpdateReturn =>
  onSelection(model, (issues, selection) =>
    pipe(
      selection.labelChanges,
      Array.findFirst(change => change.opId === opId),
      Option.match({
        onNone: () => ({ model }),
        onSome: change =>
          f(
            issues,
            modifyFields(selection, {
              labelChanges: Array.filter(change_ => change_.opId !== opId),
            }),
            change,
          ),
      }),
    ),
  )

const startLabelChange = (
  model: Model,
  issues: IssuesPage,
  selection: Selection,
  change: LabelChange,
  clearsInput: boolean,
): UpdateReturn => {
  const issueId = selection.issueId
  return {
    model: setSelection(
      takeToken(model),
      issues,
      modifyFields(selection, {
        labelChanges: Array.append(change),
        labelInput: input => (clearsInput ? '' : input),
        maybeLabelError: () => Option.none(),
      }),
    ),
    commands: [
      LabelChange.match(change, {
        AddingLabel: ({ opId, label }) => AddLabel({ opId, issueId, label }),
        RemovingLabel: ({ opId, label }) =>
          RemoveLabel({ opId, issueId, label }),
      }),
    ],
  }
}

// HELP HELPERS

const selectHit = (
  model: Model,
  help: HelpPage,
  hitId: number,
): UpdateReturn => {
  const token = model.nextToken
  return {
    model: setHelp(
      takeToken(model),
      modifyFields(help, {
        maybeSelectedHit: () =>
          Option.some(
            SelectedHit.make({ hitId, token, item: ItemState.ItemLoading() }),
          ),
      }),
    ),
    commands: [FetchItem({ token, hitId })],
  }
}

const onSelectedHit = (
  model: Model,
  token: number,
  f: (help: HelpPage, selectedHit: SelectedHit) => UpdateReturn,
): UpdateReturn =>
  onHelp(model, help =>
    pipe(
      help.maybeSelectedHit,
      Option.filter(selectedHit => selectedHit.token === token),
      Option.match({
        onNone: () => ({ model }),
        onSome: selectedHit => f(help, selectedHit),
      }),
    ),
  )

const setItem = (model: Model, help: HelpPage, item: ItemState): Model =>
  setHelp(
    model,
    modifyFields(help, {
      maybeSelectedHit: Option.map(selectedHit =>
        modifyFields(selectedHit, { item: () => item }),
      ),
    }),
  )

// SETTINGS HELPERS

const modifyDraft = (
  model: Model,
  f: (draft: Settings) => Settings,
): UpdateReturn =>
  onSettingsForm(model, form => ({
    model: setSettingsForm(model, modifyFields(form, { draft: f })),
  }))

const isSavingToken = (form: SettingsForm, token: number): boolean =>
  Option.exists(form.maybeSaving, saving => saving.token === token)

// UPDATE

export const update = (model: Model, message: Message) =>
  Message.match<UpdateReturn>(message, {
    ClickedTab: ({ tab }) => openTab(model, tab),

    UpdatedUser: ({ value }) =>
      onIssues(model, issues => ({
        model: setIssues(model, modifyFields(issues, { user: () => value })),
      })),

    ClickedFilter: ({ filter }) =>
      onIssues(model, issues =>
        filter === issues.filter && issues.list._tag !== 'ListFailed'
          ? { model }
          : loadList(model, issues, filter),
      ),

    SucceededFetchIssues: ({ token, issues: fetched }) =>
      onIssues(model, issues =>
        issues.list._tag === 'ListLoading' && issues.list.token === token
          ? {
              model: setIssues(
                model,
                modifyFields(issues, {
                  list: () => IssueList.ListLoaded({ issues: fetched }),
                }),
              ),
            }
          : { model },
      ),

    FailedFetchIssues: ({ token, error }) =>
      onIssues(model, issues =>
        issues.list._tag === 'ListLoading' && issues.list.token === token
          ? {
              model: setIssues(
                model,
                modifyFields(issues, {
                  list: () => IssueList.ListFailed({ error }),
                }),
              ),
            }
          : { model },
      ),

    ClickedIssue: ({ issueId }) =>
      onIssues(model, issues =>
        Option.exists(
          issues.maybeSelection,
          selection => selection.issueId === issueId,
        )
          ? { model }
          : selectIssue(model, issues, issueId),
      ),

    ClickedRetryIssue: () =>
      onSelection(model, (issues, selection) => {
        const token = model.nextToken
        return {
          model: setSelection(
            takeToken(model),
            issues,
            modifyFields(selection, {
              detailToken: () => token,
              detail: () => DetailState.DetailLoading(),
              related: () => RelatedState.RelatedIdle(),
            }),
          ),
          commands: [FetchIssue({ token, issueId: selection.issueId })],
        }
      }),

    SucceededFetchIssue: ({ token, maybeIssue }) =>
      onSelection(model, (issues, selection) => {
        if (selection.detailToken !== token) {
          return { model }
        }
        return Option.match(maybeIssue, {
          onNone: () => ({
            model: setSelection(
              model,
              issues,
              modifyFields(selection, {
                detail: () => DetailState.DetailMissing(),
              }),
            ),
          }),
          onSome: issue => {
            const relatedToken = model.nextToken
            return {
              model: setSelection(
                takeToken(model),
                issues,
                modifyFields(selection, {
                  detail: () => DetailState.DetailLoaded({ issue }),
                  related: () =>
                    RelatedState.RelatedLoading({
                      token: relatedToken,
                      query: issue.title,
                    }),
                }),
              ),
              commands: [
                SearchRelated({ token: relatedToken, query: issue.title }),
              ],
            }
          },
        })
      }),

    FailedFetchIssue: ({ token, error }) =>
      onSelection(model, (issues, selection) =>
        selection.detailToken === token
          ? {
              model: setSelection(
                model,
                issues,
                modifyFields(selection, {
                  detail: () => DetailState.DetailFailed({ error }),
                }),
              ),
            }
          : { model },
      ),

    ClickedAssign: () =>
      onSelection(model, (issues, selection) =>
        startAssign(model, issues, selection.issueId, 'Detail'),
      ),

    ClickedRowAssign: ({ issueId }) =>
      onIssues(model, issues => startAssign(model, issues, issueId, 'Row')),

    SucceededAssign: ({ opId, assignee }) =>
      onIssueChange(model, opId, (issues, change) => ({
        model: setIssues(
          model,
          modifyConfirmedIssue(issues, change.issueId, issue =>
            modifyFields(issue, {
              maybeAssignee: () => Option.some(assignee),
            }),
          ),
        ),
      })),

    FailedAssign: ({ opId, error }) =>
      onIssueChange(model, opId, (issues, change) => ({
        model: setIssues(model, declineIssueChange(issues, change, error)),
      })),

    UpdatedTitleInput: ({ value }) =>
      onSelection(model, (issues, selection) => ({
        model: setSelection(
          model,
          issues,
          modifyFields(selection, { titleInput: () => value }),
        ),
      })),

    ClickedRename: () =>
      onSelection(model, (issues, selection) => {
        const title = selection.titleInput.trim()
        if (title === '') {
          return { model }
        }
        const opId = model.nextToken
        const issueId = selection.issueId
        return {
          model: setIssues(
            takeToken(model),
            modifyFields(issues, {
              changes: Array.append(
                IssueChange.Renaming({ opId, issueId, title }),
              ),
              maybeSelection: () =>
                Option.some(
                  modifyFields(selection, {
                    maybeRenameError: () => Option.none(),
                  }),
                ),
            }),
          ),
          commands: [RenameIssue({ opId, issueId, title })],
        }
      }),

    SucceededRenameIssue: ({ opId, title }) =>
      onIssueChange(model, opId, (issues, change) => ({
        model: setIssues(
          model,
          pipe(
            modifyConfirmedIssue(issues, change.issueId, issue =>
              modifyFields(issue, { title: () => title }),
            ),
            renamed =>
              modifySelectionWhere(renamed, change.issueId, selection =>
                modifyFields(selection, {
                  detail: detail =>
                    DetailState.matchOrElse<DetailState>(
                      detail,
                      {
                        DetailLoaded: ({ issue }) =>
                          DetailState.DetailLoaded({
                            issue: modifyFields(issue, { title: () => title }),
                          }),
                      },
                      () => detail,
                    ),
                }),
              ),
          ),
        ),
      })),

    FailedRenameIssue: ({ opId, error }) =>
      onIssueChange(model, opId, (issues, change) => ({
        model: setIssues(model, declineIssueChange(issues, change, error)),
      })),

    ClickedClose: () =>
      onSelection(model, (issues, selection) =>
        startClose(model, issues, selection.issueId, 'Detail'),
      ),

    ClickedRowClose: ({ issueId }) =>
      onIssues(model, issues => startClose(model, issues, issueId, 'Row')),

    SucceededCloseIssue: ({ opId }) =>
      onIssueChange(model, opId, (issues, change) => ({
        model: setIssues(model, removeConfirmedIssue(issues, change.issueId)),
      })),

    FailedCloseIssue: ({ opId, error }) =>
      onIssueChange(model, opId, (issues, change) => ({
        model: setIssues(model, declineIssueChange(issues, change, error)),
      })),

    SucceededFetchComments: ({ token, comments }) =>
      onSelection(model, (issues, selection) =>
        selection.selectionToken === token
          ? {
              model: setSelection(
                model,
                issues,
                modifyFields(selection, {
                  comments: () => CommentsState.CommentsLoaded({ comments }),
                }),
              ),
            }
          : { model },
      ),

    FailedFetchComments: ({ token, error }) =>
      onSelection(model, (issues, selection) =>
        selection.selectionToken === token
          ? {
              model: setSelection(
                model,
                issues,
                modifyFields(selection, {
                  comments: () => CommentsState.CommentsFailed({ error }),
                }),
              ),
            }
          : { model },
      ),

    UpdatedCommentInput: ({ value }) =>
      onSelection(model, (issues, selection) => ({
        model: setSelection(
          model,
          issues,
          modifyFields(selection, { commentInput: () => value }),
        ),
      })),

    ClickedPost: () =>
      onSelection(model, (issues, selection) => {
        const text = selection.commentInput.trim()
        if (text === '' || issues.user.trim() === '') {
          return { model }
        }
        const opId = model.nextToken
        const author = issues.user
        return {
          model: setSelection(
            takeToken(model),
            issues,
            modifyFields(selection, {
              posts: Array.append(
                Post.make({ opId, author, text, status: 'Sending' }),
              ),
              commentInput: () => '',
              maybePostError: () => Option.none(),
            }),
          ),
          commands: [
            AddComment({ opId, issueId: selection.issueId, author, text }),
          ],
        }
      }),

    SucceededAddComment: ({ opId, comment }) =>
      onSelection(model, (issues, selection) => ({
        model: setSelection(
          model,
          issues,
          modifyFields(selection, {
            posts: Array.map(post =>
              post.opId === opId
                ? Post.make({
                    opId,
                    author: comment.author,
                    text: comment.text,
                    status: 'Sent',
                  })
                : post,
            ),
          }),
        ),
      })),

    FailedAddComment: ({ opId, error }) =>
      onSelection(model, (issues, selection) =>
        Array.some(selection.posts, post => post.opId === opId)
          ? {
              model: setSelection(
                model,
                issues,
                modifyFields(selection, {
                  posts: Array.filter(post => post.opId !== opId),
                  maybePostError: () => Option.some(error),
                }),
              ),
            }
          : { model },
      ),

    SucceededFetchLabels: ({ token, labels }) =>
      onSelection(model, (issues, selection) =>
        selection.selectionToken === token
          ? {
              model: setSelection(
                model,
                issues,
                modifyFields(selection, {
                  labels: () => LabelsState.LabelsLoaded({ labels }),
                }),
              ),
            }
          : { model },
      ),

    FailedFetchLabels: ({ token, error }) =>
      onSelection(model, (issues, selection) =>
        selection.selectionToken === token
          ? {
              model: setSelection(
                model,
                issues,
                modifyFields(selection, {
                  labels: () => LabelsState.LabelsFailed({ error }),
                }),
              ),
            }
          : { model },
      ),

    UpdatedLabelInput: ({ value }) =>
      onSelection(model, (issues, selection) => ({
        model: setSelection(
          model,
          issues,
          modifyFields(selection, { labelInput: () => value }),
        ),
      })),

    ClickedAddLabel: () =>
      onSelection(model, (issues, selection) => {
        const label = selection.labelInput.trim()
        return Option.match(maybeVisibleLabels(selection), {
          onNone: () => ({ model }),
          onSome: labels =>
            label === '' || Array.contains(labels, label)
              ? { model }
              : startLabelChange(
                  model,
                  issues,
                  selection,
                  LabelChange.AddingLabel({ opId: model.nextToken, label }),
                  true,
                ),
        })
      }),

    ClickedRemoveLabel: ({ label }) =>
      onSelection(model, (issues, selection) =>
        Option.match(maybeVisibleLabels(selection), {
          onNone: () => ({ model }),
          onSome: labels =>
            Array.contains(labels, label)
              ? startLabelChange(
                  model,
                  issues,
                  selection,
                  LabelChange.RemovingLabel({ opId: model.nextToken, label }),
                  false,
                )
              : { model },
        }),
      ),

    SucceededChangeLabel: ({ opId, labels }) =>
      onLabelChange(model, opId, (issues, selection, change) => ({
        model: setSelection(
          model,
          issues,
          modifyFields(selection, {
            labels: state =>
              LabelsState.matchOrElse<LabelsState>(
                state,
                {
                  LabelsLoaded: loaded =>
                    LabelsState.LabelsLoaded({
                      labels: Array.isReadonlyArrayEmpty(selection.labelChanges)
                        ? labels
                        : applyLabelChange(loaded.labels, change),
                    }),
                },
                () => state,
              ),
          }),
        ),
      })),

    FailedChangeLabel: ({ opId, error }) =>
      onLabelChange(model, opId, (issues, selection) => ({
        model: setSelection(
          model,
          issues,
          modifyFields(selection, {
            maybeLabelError: () => Option.some(error),
          }),
        ),
      })),

    SucceededSearchRelated: ({ token, hits }) =>
      onSelection(model, (issues, selection) =>
        selection.related._tag === 'RelatedLoading' &&
        selection.related.token === token
          ? {
              model: setSelection(
                model,
                issues,
                modifyFields(selection, {
                  related: related =>
                    RelatedState.RelatedLoaded({
                      query:
                        related._tag === 'RelatedLoading' ? related.query : '',
                      hits,
                    }),
                }),
              ),
            }
          : { model },
      ),

    FailedSearchRelated: ({ token, error }) =>
      onSelection(model, (issues, selection) =>
        selection.related._tag === 'RelatedLoading' &&
        selection.related.token === token
          ? {
              model: setSelection(
                model,
                issues,
                modifyFields(selection, {
                  related: () => RelatedState.RelatedFailed({ error }),
                }),
              ),
            }
          : { model },
      ),

    ClickedRelatedHit: ({ hitId }) =>
      onSelection(model, (_issues, selection) =>
        RelatedState.matchOrElse<UpdateReturn>(
          selection.related,
          {
            RelatedLoaded: ({ query, hits }) =>
              selectHit(
                model,
                {
                  query,
                  results: Results.ResultsLoaded({ shown: { query, hits } }),
                  maybeSelectedHit: Option.none(),
                },
                hitId,
              ),
          },
          () => ({ model }),
        ),
      ),

    UpdatedQuery: ({ value }) =>
      onHelp(model, help => {
        const typed = modifyFields(help, { query: () => value })
        if (queryLength(value) < MIN_QUERY_LENGTH) {
          return {
            model: setHelp(
              model,
              modifyFields(typed, { results: () => Results.ResultsNone() }),
            ),
          }
        }
        const token = model.nextToken
        return {
          model: setHelp(
            takeToken(model),
            modifyFields(typed, {
              results: results =>
                Results.ResultsSearching({
                  token,
                  maybeShown: maybeShownResults(results),
                }),
            }),
          ),
          commands: [Search({ token, query: value })],
        }
      }),

    SucceededSearch: ({ token, query, hits }) =>
      onHelp(model, help =>
        help.results._tag === 'ResultsSearching' &&
        help.results.token === token
          ? {
              model: setHelp(
                model,
                modifyFields(help, {
                  results: () =>
                    Results.ResultsLoaded({ shown: { query, hits } }),
                }),
              ),
            }
          : { model },
      ),

    FailedSearch: ({ token, error }) =>
      onHelp(model, help =>
        help.results._tag === 'ResultsSearching' &&
        help.results.token === token
          ? {
              model: setHelp(
                model,
                modifyFields(help, {
                  results: () => Results.ResultsFailed({ error }),
                }),
              ),
            }
          : { model },
      ),

    ClickedHit: ({ hitId }) =>
      onHelp(model, help =>
        Option.exists(
          help.maybeSelectedHit,
          selectedHit => selectedHit.hitId === hitId,
        )
          ? { model }
          : selectHit(model, help, hitId),
      ),

    ClickedRetryItem: () =>
      onHelp(model, help =>
        Option.match(help.maybeSelectedHit, {
          onNone: () => ({ model }),
          onSome: selectedHit => selectHit(model, help, selectedHit.hitId),
        }),
      ),

    SucceededFetchItem: ({ token, maybeItem }) =>
      onSelectedHit(model, token, help => ({
        model: setItem(
          model,
          help,
          Option.match(maybeItem, {
            onNone: () => ItemState.ItemMissing(),
            onSome: item => ItemState.ItemLoaded({ item }),
          }),
        ),
      })),

    FailedFetchItem: ({ token, error }) =>
      onSelectedHit(model, token, help => ({
        model: setItem(model, help, ItemState.ItemFailed({ error })),
      })),

    SucceededLoadSettings: ({ token, settings }) =>
      onSettings(model, page =>
        page._tag === 'SettingsLoading' && page.token === token
          ? {
              model: setSettingsForm(model, {
                saved: settings,
                savedToken: token,
                draft: settings,
                maybeSaving: Option.none(),
                maybeSaveError: Option.none(),
              }),
            }
          : { model },
      ),

    FailedLoadSettings: ({ token, error }) =>
      onSettings(model, page =>
        page._tag === 'SettingsLoading' && page.token === token
          ? {
              model: setSettings(
                model,
                SettingsPage.SettingsFailed({ error }),
              ),
            }
          : { model },
      ),

    ClickedRetryLoad: () =>
      onSettings(model, page =>
        page._tag === 'SettingsFailed' ? initSettingsPage(model) : { model },
      ),

    UpdatedName: ({ value }) =>
      modifyDraft(model, draft => modifyFields(draft, { name: () => value })),

    ClickedTheme: ({ theme }) =>
      modifyDraft(model, draft => modifyFields(draft, { theme: () => theme })),

    ClickedDensityToggle: () =>
      modifyDraft(model, draft =>
        modifyFields(draft, {
          density: density =>
            density === 'comfortable' ? 'compact' : 'comfortable',
        }),
      ),

    ClickedSave: () =>
      onSettingsForm(model, form =>
        NameValidity.matchOrElse<UpdateReturn>(
          validateName(form.draft.name),
          {
            ValidName: () => {
              const token = model.nextToken
              return {
                model: setSettingsForm(
                  takeToken(model),
                  modifyFields(form, {
                    maybeSaving: () =>
                      Option.some({ token, settings: form.draft }),
                    maybeSaveError: () => Option.none(),
                  }),
                ),
                commands: [SaveSettings({ token, settings: form.draft })],
              }
            },
          },
          () => ({ model }),
        ),
      ),

    SucceededSaveSettings: ({ token, settings }) =>
      onSettingsForm(model, form => ({
        model: setSettingsForm(
          model,
          modifyFields(form, {
            saved: saved => (token > form.savedToken ? settings : saved),
            savedToken: savedToken => Math.max(savedToken, token),
            maybeSaving: maybeSaving =>
              isSavingToken(form, token) ? Option.none() : maybeSaving,
          }),
        ),
      })),

    FailedSaveSettings: ({ token, error }) =>
      onSettingsForm(model, form =>
        isSavingToken(form, token)
          ? {
              model: setSettingsForm(
                model,
                modifyFields(form, {
                  maybeSaving: () => Option.none(),
                  maybeSaveError: () => Option.some(error),
                }),
              ),
            }
          : { model },
      ),
  })

// INIT

export const init = (): UpdateReturn =>
  initIssuesPage({
    nextToken: 1,
    maybeOpenCount: Option.none(),
    page: Page.HelpTab({ help: emptyHelpPage }),
  })
