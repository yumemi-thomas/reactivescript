import { Option } from 'effect'
import { type Update } from 'foldkit'
import { modifyFields } from 'foldkit/struct'

import {
  AddComment,
  AddLabel,
  AssignIssue,
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
  SearchHelp,
  SearchRelated,
} from './command.js'
import { type Filter, type Origin, type Settings, nameError } from './domain.js'
import { Message } from './message.js'
import {
  CommentItem,
  CommentsState,
  DetailState,
  HelpModel,
  HelpResults,
  HitsFor,
  IssuesModel,
  ItemState,
  LabelsState,
  ListState,
  Model,
  Page,
  RelatedState,
  Row,
  SaveState,
  Selection,
  SettingsLoad,
  SettingsModel,
} from './model.js'

// STEP

type PageTag = 'IssuesPage' | 'HelpPage' | 'SettingsPage'
type PageStep = Update.Return<Page, Message>
type IssuesStep = Update.Return<IssuesModel, Message>
type HelpStep = Update.Return<HelpModel, Message>
type SettingsStep = Update.Return<SettingsModel, Message>
type SelectionStep = Update.Return<Selection, Message>

// PAGE

const emptyHelp = (): HelpModel => ({
  query: '',
  results: HelpResults.Empty(),
  selected: Option.none(),
  item: ItemState.Empty(),
})

const startIssues = (visit: number, openCount: Option.Option<number>): PageStep => ({
  model: Page.IssuesPage({
    model: {
      user: 'guest',
      filter: 'open',
      list: ListState.Loading(),
      listSeq: 1,
      selectionSeq: 0,
      selection: Option.none(),
      rowError: Option.none(),
      openCount,
    },
  }),
  commands: [FetchIssues({ visit, seq: 1, filter: 'open' })],
})

const startPage = (
  tag: PageTag,
  visit: number,
  openCount: Option.Option<number>,
): PageStep => {
  if (tag === 'IssuesPage') {
    return startIssues(visit, openCount)
  }
  if (tag === 'HelpPage') {
    return { model: Page.HelpPage({ model: emptyHelp() }) }
  }
  return {
    model: Page.SettingsPage({ model: { load: SettingsLoad.Loading() } }),
    commands: [LoadSettings({ visit })],
  }
}

const carriedOpenCount = (model: Model): Option.Option<number> =>
  model.page._tag === 'IssuesPage' ? model.page.model.openCount : model.lastOpenCount

const enter = (
  model: Model,
  visit: number,
  started: PageStep,
  carried: Option.Option<number>,
): Update.Return<Model, Message> => {
  const next = modifyFields(model, {
    visit: () => visit,
    page: () => started.model,
    lastOpenCount: () => carried,
  })
  return started.commands ? { model: next, commands: started.commands } : { model: next }
}

const navigate = (model: Model, tag: PageTag): Update.Return<Model, Message> => {
  if (model.page._tag === tag) {
    return { model }
  }
  const visit = model.visit + 1
  const carried = carriedOpenCount(model)
  return enter(model, visit, startPage(tag, visit, carried), carried)
}

const onIssues = (
  model: Model,
  step: (issues: IssuesModel, visit: number) => IssuesStep,
): Update.Return<Model, Message> => {
  if (model.page._tag !== 'IssuesPage') {
    return { model }
  }
  const result = step(model.page.model, model.visit)
  const next = modifyFields(model, { page: () => Page.IssuesPage({ model: result.model }) })
  return result.commands ? { model: next, commands: result.commands } : { model: next }
}

const onHelp = (
  model: Model,
  step: (help: HelpModel, visit: number) => HelpStep,
): Update.Return<Model, Message> => {
  if (model.page._tag !== 'HelpPage') {
    return { model }
  }
  const result = step(model.page.model, model.visit)
  const next = modifyFields(model, { page: () => Page.HelpPage({ model: result.model }) })
  return result.commands ? { model: next, commands: result.commands } : { model: next }
}

const onSettings = (
  model: Model,
  step: (settings: SettingsModel, visit: number) => SettingsStep,
): Update.Return<Model, Message> => {
  if (model.page._tag !== 'SettingsPage') {
    return { model }
  }
  const result = step(model.page.model, model.visit)
  const next = modifyFields(model, { page: () => Page.SettingsPage({ model: result.model }) })
  return result.commands ? { model: next, commands: result.commands } : { model: next }
}

const isStale = (model: Model, message: Message) =>
  'visit' in message && message.visit !== model.visit

// ISSUES: LIST

const loadList = (issues: IssuesModel, visit: number, filter: Filter): IssuesStep => {
  const seq = issues.listSeq + 1
  return {
    model: modifyFields(issues, {
      filter: () => filter,
      list: () => ListState.Loading(),
      listSeq: () => seq,
    }),
    commands: [FetchIssues({ visit, seq, filter })],
  }
}

const findRow = (issues: IssuesModel, id: number): Option.Option<Row> =>
  issues.list._tag === 'Loaded'
    ? Option.fromNullishOr(issues.list.rows.find(row => row.id === id))
    : Option.none()

const mapRows = (issues: IssuesModel, change: (row: Row) => Row): IssuesModel => {
  if (issues.list._tag !== 'Loaded') {
    return issues
  }
  const rows = issues.list.rows.map(change)
  return modifyFields(issues, { list: () => ListState.Loaded({ rows }) })
}

const dropClosedRow = (issues: IssuesModel, id: number): IssuesModel => {
  if (issues.list._tag !== 'Loaded') {
    return issues
  }
  const rows = issues.list.rows.filter(row => !(row.id === id && row.status === 'Closing'))
  return modifyFields(issues, { list: () => ListState.Loaded({ rows }) })
}

const withStatus = (row: Row, status: Row['status']): Row =>
  modifyFields(row, { status: () => status })

const withAssignee = (row: Row, assignee: Option.Option<string>): Row =>
  modifyFields(row, { assignee: () => assignee })

const withTitle = (row: Row, title: string): Row => modifyFields(row, { title: () => title })

const adjustCount = (count: Option.Option<number>, delta: number): Option.Option<number> =>
  Option.match(count, {
    onNone: () => count,
    onSome: value => Option.some(value + delta),
  })

// ISSUES: SELECTION

const mapSelection = (issues: IssuesModel, change: (selection: Selection) => Selection): IssuesModel =>
  Option.match(issues.selection, {
    onNone: () => issues,
    onSome: selection => modifyFields(issues, { selection: () => Option.some(change(selection)) }),
  })

const mapSelectionAt = (
  issues: IssuesModel,
  seq: number,
  change: (selection: Selection) => Selection,
): IssuesModel => mapSelection(issues, selection => (selection.seq === seq ? change(selection) : selection))

const onSelection = (
  issues: IssuesModel,
  step: (selection: Selection) => SelectionStep,
): IssuesStep =>
  Option.match(issues.selection, {
    onNone: (): IssuesStep => ({ model: issues }),
    onSome: (selection): IssuesStep => {
      const result = step(selection)
      const next = modifyFields(issues, { selection: () => Option.some(result.model) })
      return result.commands ? { model: next, commands: result.commands } : { model: next }
    },
  })

const selectIssue = (issues: IssuesModel, visit: number, id: number): IssuesStep => {
  const seq = issues.selectionSeq + 1
  const selection = Selection.make({
    id,
    seq,
    detail: DetailState.Loading(),
    comments: CommentsState.Loading(),
    labels: LabelsState.Loading(),
    related: RelatedState.Idle(),
    titleDraft: '',
    commentDraft: '',
    labelDraft: '',
    nextKey: 1,
    assignError: Option.none(),
    renameError: Option.none(),
    closeError: Option.none(),
    postError: Option.none(),
    labelError: Option.none(),
  })
  return {
    model: modifyFields(issues, {
      selectionSeq: () => seq,
      selection: () => Option.some(selection),
    }),
    commands: [
      FetchIssue({ visit, seq, id }),
      FetchComments({ visit, seq, id }),
      FetchLabels({ visit, seq, id }),
    ],
  }
}

const requestAssign = (
  issues: IssuesModel,
  visit: number,
  origin: Origin,
  id: number,
  seq: number,
): IssuesStep => {
  const user = issues.user.trim()
  if (user === '') {
    return { model: issues }
  }
  const previous = Option.match(findRow(issues, id), {
    onNone: () => Option.none<string>(),
    onSome: row => row.assignee,
  })
  const assigned = mapRows(issues, row => (row.id === id ? withAssignee(row, Option.some(user)) : row))
  const next =
    origin === 'Detail'
      ? mapSelection(assigned, selection => modifyFields(selection, { assignError: () => Option.none() }))
      : assigned
  return {
    model: next,
    commands: [AssignIssue({ visit, origin, seq, id, user, previous })],
  }
}

const requestClose = (
  issues: IssuesModel,
  visit: number,
  origin: Origin,
  id: number,
  seq: number,
): IssuesStep => {
  const closing =
    issues.filter === 'open' &&
    Option.match(findRow(issues, id), {
      onNone: () => false,
      onSome: row => row.status === 'Shown',
    })
  const closed = mapRows(issues, row => (row.id === id && closing ? withStatus(row, 'Closing') : row))
  const counted = closing
    ? modifyFields(closed, { openCount: () => adjustCount(issues.openCount, -1) })
    : closed
  const next =
    origin === 'Detail'
      ? mapSelection(counted, selection => modifyFields(selection, { closeError: () => Option.none() }))
      : modifyFields(counted, { rowError: () => Option.none() })
  return {
    model: next,
    commands: [CloseIssue({ visit, origin, seq, id })],
  }
}

const setDetailTitle = (detail: DetailState, title: string): DetailState =>
  detail._tag === 'Found'
    ? DetailState.Found({ issue: modifyFields(detail.issue, { title: () => title }) })
    : detail

const requestRename = (issues: IssuesModel, visit: number, selection: Selection): IssuesStep => {
  const title = selection.titleDraft.trim()
  if (title === '') {
    return { model: issues }
  }
  const previous =
    selection.detail._tag === 'Found'
      ? selection.detail.issue.title
      : Option.match(findRow(issues, selection.id), {
          onNone: () => title,
          onSome: row => row.title,
        })
  const renamed = mapRows(issues, row => (row.id === selection.id ? withTitle(row, title) : row))
  const next = mapSelectionAt(renamed, selection.seq, current =>
    modifyFields(current, {
      detail: () => setDetailTitle(current.detail, title),
      renameError: () => Option.none(),
    }),
  )
  return {
    model: next,
    commands: [
      RenameIssue({ visit, seq: selection.seq, id: selection.id, title, previous }),
    ],
  }
}

const postComment = (issues: IssuesModel, visit: number, selection: Selection): IssuesStep => {
  const text = selection.commentDraft.trim()
  const author = issues.user.trim()
  if (text === '' || author === '' || selection.comments._tag !== 'Loaded') {
    return { model: issues }
  }
  const key = selection.nextKey
  const comments = [
    ...selection.comments.comments,
    CommentItem.Sending({ key, author, text }),
  ]
  const updated = modifyFields(selection, {
    comments: () => CommentsState.Loaded({ comments }),
    commentDraft: () => '',
    nextKey: () => key + 1,
    postError: () => Option.none(),
  })
  return {
    model: modifyFields(issues, { selection: () => Option.some(updated) }),
    commands: [AddComment({ visit, seq: selection.seq, key, id: selection.id, author, text })],
  }
}

const addLabel = (issues: IssuesModel, visit: number, selection: Selection): IssuesStep => {
  const label = selection.labelDraft.trim()
  if (label === '' || selection.labels._tag !== 'Loaded' || selection.labels.labels.includes(label)) {
    return { model: issues }
  }
  const labels = [...selection.labels.labels, label]
  return {
    model: modifyFields(issues, {
      selection: () =>
        Option.some(
          modifyFields(selection, {
            labels: () => LabelsState.Loaded({ labels }),
            labelDraft: () => '',
            labelError: () => Option.none(),
          }),
        ),
    }),
    commands: [AddLabel({ visit, seq: selection.seq, id: selection.id, label })],
  }
}

const removeLabel = (issues: IssuesModel, visit: number, selection: Selection, label: string): IssuesStep => {
  if (selection.labels._tag !== 'Loaded') {
    return { model: issues }
  }
  const current = selection.labels.labels
  const index = current.indexOf(label)
  if (index < 0) {
    return { model: issues }
  }
  const labels = [...current.slice(0, index), ...current.slice(index + 1)]
  return {
    model: modifyFields(issues, {
      selection: () =>
        Option.some(
          modifyFields(selection, {
            labels: () => LabelsState.Loaded({ labels }),
            labelError: () => Option.none(),
          }),
        ),
    }),
    commands: [RemoveLabel({ visit, seq: selection.seq, id: selection.id, label, index })],
  }
}

// HELP

const shownHits = (results: HelpResults): Option.Option<HitsFor> => {
  if (results._tag === 'Found') {
    return Option.some({ query: results.query, hits: results.hits })
  }
  if (results._tag === 'Searching') {
    return results.previous
  }
  return Option.none()
}

const typeQuery = (help: HelpModel, visit: number, query: string): HelpStep => {
  if (query === '') {
    return { model: modifyFields(help, { query: () => query, results: () => HelpResults.Empty() }) }
  }
  if (query.length === 1) {
    return {
      model: modifyFields(help, { query: () => query, results: () => HelpResults.TooShort({ query }) }),
    }
  }
  const previous = shownHits(help.results)
  return {
    model: modifyFields(help, {
      query: () => query,
      results: () => HelpResults.Searching({ query, previous }),
    }),
    commands: [SearchHelp({ visit, query })],
  }
}

const isSelectedHit = (help: HelpModel, id: number) =>
  Option.match(help.selected, {
    onNone: () => false,
    onSome: selected => selected === id,
  })

// SETTINGS

const mapDraft = (settings: SettingsModel, change: (draft: Settings) => Settings): SettingsModel => {
  if (settings.load._tag !== 'Loaded') {
    return settings
  }
  const loaded = settings.load
  return modifyFields(settings, {
    load: () =>
      SettingsLoad.Loaded({
        saved: loaded.saved,
        draft: change(loaded.draft),
        save: loaded.save,
        saveError: loaded.saveError,
        saveSeq: loaded.saveSeq,
      }),
  })
}

// UPDATE

const update = (model: Model, message: Message): Update.Return<Model, Message> => {
  if (isStale(model, message)) {
    return { model }
  }
  return Message.match<Update.Return<Model, Message>>(message, {
    ClickedIssuesTab: () => navigate(model, 'IssuesPage'),
    ClickedHelpTab: () => navigate(model, 'HelpPage'),
    ClickedSettingsTab: () => navigate(model, 'SettingsPage'),

    UpdatedUser: ({ value }) =>
      onIssues(model, issues => ({ model: modifyFields(issues, { user: () => value }) })),
    ClickedFilter: ({ filter }) =>
      onIssues(model, (issues, visit) => loadList(issues, visit, filter)),
    ClickedIssue: ({ id }) => onIssues(model, (issues, visit) => selectIssue(issues, visit, id)),
    ClickedRetryIssue: () =>
      onIssues(model, (issues, visit) =>
        onSelection(issues, selection => ({
          model: modifyFields(selection, { detail: () => DetailState.Loading() }),
          commands: [FetchIssue({ visit, seq: selection.seq, id: selection.id })],
        })),
      ),
    UpdatedTitleInput: ({ value }) =>
      onIssues(model, issues => ({
        model: mapSelection(issues, selection => modifyFields(selection, { titleDraft: () => value })),
      })),
    ClickedAssign: () =>
      onIssues(model, (issues, visit) =>
        Option.match(issues.selection, {
          onNone: (): IssuesStep => ({ model: issues }),
          onSome: (selection): IssuesStep =>
            requestAssign(issues, visit, 'Detail', selection.id, selection.seq),
        }),
      ),
    ClickedRename: () =>
      onIssues(model, (issues, visit) =>
        Option.match(issues.selection, {
          onNone: (): IssuesStep => ({ model: issues }),
          onSome: (selection): IssuesStep => requestRename(issues, visit, selection),
        }),
      ),
    ClickedClose: () =>
      onIssues(model, (issues, visit) =>
        Option.match(issues.selection, {
          onNone: (): IssuesStep => ({ model: issues }),
          onSome: (selection): IssuesStep =>
            requestClose(issues, visit, 'Detail', selection.id, selection.seq),
        }),
      ),
    UpdatedCommentInput: ({ value }) =>
      onIssues(model, issues => ({
        model: mapSelection(issues, selection => modifyFields(selection, { commentDraft: () => value })),
      })),
    ClickedPost: () =>
      onIssues(model, (issues, visit) =>
        Option.match(issues.selection, {
          onNone: (): IssuesStep => ({ model: issues }),
          onSome: (selection): IssuesStep => postComment(issues, visit, selection),
        }),
      ),
    UpdatedLabelInput: ({ value }) =>
      onIssues(model, issues => ({
        model: mapSelection(issues, selection => modifyFields(selection, { labelDraft: () => value })),
      })),
    ClickedAddLabel: () =>
      onIssues(model, (issues, visit) =>
        Option.match(issues.selection, {
          onNone: (): IssuesStep => ({ model: issues }),
          onSome: (selection): IssuesStep => addLabel(issues, visit, selection),
        }),
      ),
    ClickedRemoveLabel: ({ label }) =>
      onIssues(model, (issues, visit) =>
        Option.match(issues.selection, {
          onNone: (): IssuesStep => ({ model: issues }),
          onSome: (selection): IssuesStep => removeLabel(issues, visit, selection, label),
        }),
      ),
    ClickedRowAssign: ({ id }) =>
      onIssues(model, (issues, visit) =>
        requestAssign(
          modifyFields(issues, { rowError: () => Option.none() }),
          visit,
          'Row',
          id,
          issues.selectionSeq,
        ),
      ),
    ClickedRowClose: ({ id }) =>
      onIssues(model, (issues, visit) => requestClose(issues, visit, 'Row', id, issues.selectionSeq)),
    ClickedRelatedHit: ({ id, title }) => {
      const visit = model.visit + 1
      const carried = carriedOpenCount(model)
      const typed = typeQuery(emptyHelp(), visit, title)
      const help = modifyFields(typed.model, {
        selected: () => Option.some(id),
        item: () => ItemState.Loading({ id }),
      })
      return enter(
        model,
        visit,
        {
          model: Page.HelpPage({ model: help }),
          commands: [...(typed.commands ?? []), FetchItem({ visit, id })],
        },
        carried,
      )
    },

    SucceededFetchIssues: ({ seq, issues: summaries }) =>
      onIssues(model, issues => {
        if (issues.listSeq !== seq) {
          return { model: issues }
        }
        const rows = summaries.map(summary =>
          Row.make({ id: summary.id, title: summary.title, assignee: summary.assignee, status: 'Shown' }),
        )
        return {
          model: modifyFields(issues, {
            list: () => ListState.Loaded({ rows }),
            openCount: () =>
              issues.filter === 'open' ? Option.some(summaries.length) : issues.openCount,
          }),
        }
      }),
    FailedFetchIssues: ({ seq, error }) =>
      onIssues(model, issues =>
        issues.listSeq !== seq
          ? { model: issues }
          : { model: modifyFields(issues, { list: () => ListState.Failed({ error }) }) },
      ),
    SucceededFetchIssue: ({ seq, issue }) =>
      onIssues(model, (issues, visit) =>
        Option.match(issues.selection, {
          onNone: (): IssuesStep => ({ model: issues }),
          onSome: (selection): IssuesStep => {
            if (selection.seq !== seq) {
              return { model: issues }
            }
            return Option.match(issue, {
              onNone: (): IssuesStep => ({
                model: modifyFields(issues, {
                  selection: () =>
                    Option.some(
                      modifyFields(selection, {
                        detail: () => DetailState.NotFound(),
                        related: () => RelatedState.Idle(),
                      }),
                    ),
                }),
              }),
              onSome: (found): IssuesStep => ({
                model: modifyFields(issues, {
                  selection: () =>
                    Option.some(
                      modifyFields(selection, {
                        detail: () => DetailState.Found({ issue: found }),
                        related: () => RelatedState.Loading(),
                      }),
                    ),
                }),
                commands: [SearchRelated({ visit, seq, title: found.title })],
              }),
            })
          },
        }),
      ),
    FailedFetchIssue: ({ seq, error }) =>
      onIssues(model, issues => ({
        model: mapSelectionAt(issues, seq, selection =>
          modifyFields(selection, { detail: () => DetailState.Failed({ error }) }),
        ),
      })),

    SucceededAssign: ({ origin, seq, id, assignee }) =>
      onIssues(model, issues => ({
        model: mapRows(issues, row => (row.id === id ? withAssignee(row, Option.some(assignee)) : row)),
      })),
    FailedAssign: ({ origin, seq, id, previous, error }) =>
      onIssues(model, issues => {
        const reverted = mapRows(issues, row => (row.id === id ? withAssignee(row, previous) : row))
        if (origin === 'Row') {
          return { model: modifyFields(reverted, { rowError: () => Option.some(error) }) }
        }
        return {
          model: mapSelectionAt(reverted, seq, selection =>
            modifyFields(selection, { assignError: () => Option.some(error) }),
          ),
        }
      }),

    SucceededRename: ({ id, title }) =>
      onIssues(model, issues => ({
        model: mapRows(issues, row => (row.id === id ? withTitle(row, title) : row)),
      })),
    FailedRename: ({ seq, id, previous, error }) =>
      onIssues(model, issues => {
        const reverted = mapRows(issues, row => (row.id === id ? withTitle(row, previous) : row))
        return {
          model: mapSelectionAt(reverted, seq, selection =>
            modifyFields(selection, {
              detail: () => setDetailTitle(selection.detail, previous),
              renameError: () => Option.some(error),
            }),
          ),
        }
      }),

    SucceededClose: ({ id }) =>
      onIssues(model, issues => ({ model: dropClosedRow(issues, id) })),
    FailedClose: ({ origin, seq, id, error }) =>
      onIssues(model, issues => {
        const wasClosing = Option.match(findRow(issues, id), {
          onNone: () => false,
          onSome: row => row.status === 'Closing',
        })
        const restored = mapRows(issues, row =>
          row.id === id && row.status === 'Closing' ? withStatus(row, 'Shown') : row,
        )
        const counted = wasClosing
          ? modifyFields(restored, { openCount: () => adjustCount(issues.openCount, 1) })
          : restored
        if (origin === 'Row') {
          return { model: modifyFields(counted, { rowError: () => Option.some(error) }) }
        }
        return {
          model: mapSelectionAt(counted, seq, selection =>
            modifyFields(selection, { closeError: () => Option.some(error) }),
          ),
        }
      }),

    SucceededFetchComments: ({ seq, comments }) =>
      onIssues(model, issues => ({
        model: mapSelectionAt(issues, seq, selection => {
          const items = comments.map((comment, index) =>
            CommentItem.Posted({
              key: selection.nextKey + index,
              author: comment.author,
              text: comment.text,
            }),
          )
          return modifyFields(selection, {
            comments: () => CommentsState.Loaded({ comments: items }),
            nextKey: () => selection.nextKey + items.length,
          })
        }),
      })),
    FailedFetchComments: ({ seq, error }) =>
      onIssues(model, issues => ({
        model: mapSelectionAt(issues, seq, selection =>
          modifyFields(selection, { comments: () => CommentsState.Failed({ error }) }),
        ),
      })),
    SucceededPost: ({ seq, key }) =>
      onIssues(model, issues => ({
        model: mapSelectionAt(issues, seq, selection => {
          if (selection.comments._tag !== 'Loaded') {
            return selection
          }
          const comments = selection.comments.comments.map(item =>
            item._tag === 'Sending' && item.key === key
              ? CommentItem.Posted({ key, author: item.author, text: item.text })
              : item,
          )
          return modifyFields(selection, { comments: () => CommentsState.Loaded({ comments }) })
        }),
      })),
    FailedPost: ({ seq, key, error }) =>
      onIssues(model, issues => ({
        model: mapSelectionAt(issues, seq, selection => {
          if (selection.comments._tag !== 'Loaded') {
            return modifyFields(selection, { postError: () => Option.some(error) })
          }
          const comments = selection.comments.comments.filter(
            item => !(item._tag === 'Sending' && item.key === key),
          )
          return modifyFields(selection, {
            comments: () => CommentsState.Loaded({ comments }),
            postError: () => Option.some(error),
          })
        }),
      })),

    SucceededFetchLabels: ({ seq, labels }) =>
      onIssues(model, issues => ({
        model: mapSelectionAt(issues, seq, selection =>
          modifyFields(selection, { labels: () => LabelsState.Loaded({ labels }) }),
        ),
      })),
    FailedFetchLabels: ({ seq, error }) =>
      onIssues(model, issues => ({
        model: mapSelectionAt(issues, seq, selection =>
          modifyFields(selection, { labels: () => LabelsState.Failed({ error }) }),
        ),
      })),
    SucceededAddLabel: ({ seq, labels }) =>
      onIssues(model, issues => ({
        model: mapSelectionAt(issues, seq, selection =>
          modifyFields(selection, { labels: () => LabelsState.Loaded({ labels }) }),
        ),
      })),
    FailedAddLabel: ({ seq, label, error }) =>
      onIssues(model, issues => ({
        model: mapSelectionAt(issues, seq, selection => {
          const labels =
            selection.labels._tag === 'Loaded'
              ? selection.labels.labels.filter(current => current !== label)
              : []
          return modifyFields(selection, {
            labels: () => LabelsState.Loaded({ labels }),
            labelError: () => Option.some(error),
          })
        }),
      })),
    SucceededRemoveLabel: ({ seq, labels }) =>
      onIssues(model, issues => ({
        model: mapSelectionAt(issues, seq, selection =>
          modifyFields(selection, { labels: () => LabelsState.Loaded({ labels }) }),
        ),
      })),
    FailedRemoveLabel: ({ seq, label, index, error }) =>
      onIssues(model, issues => ({
        model: mapSelectionAt(issues, seq, selection => {
          if (selection.labels._tag !== 'Loaded') {
            return modifyFields(selection, { labelError: () => Option.some(error) })
          }
          const current = selection.labels.labels
          const labels = current.includes(label)
            ? current
            : [...current.slice(0, index), label, ...current.slice(index)]
          return modifyFields(selection, {
            labels: () => LabelsState.Loaded({ labels }),
            labelError: () => Option.some(error),
          })
        }),
      })),
    SucceededFetchRelated: ({ seq, hits }) =>
      onIssues(model, issues => ({
        model: mapSelectionAt(issues, seq, selection =>
          modifyFields(selection, { related: () => RelatedState.Found({ hits }) }),
        ),
      })),
    FailedFetchRelated: ({ seq, error }) =>
      onIssues(model, issues => ({
        model: mapSelectionAt(issues, seq, selection =>
          modifyFields(selection, { related: () => RelatedState.Failed({ error }) }),
        ),
      })),

    UpdatedQuery: ({ value }) => onHelp(model, (help, visit) => typeQuery(help, visit, value)),
    SucceededSearch: ({ query, hits }) =>
      onHelp(model, help =>
        help.results._tag === 'Searching' && help.results.query === query
          ? { model: modifyFields(help, { results: () => HelpResults.Found({ query, hits }) }) }
          : { model: help },
      ),
    FailedSearch: ({ query, error }) =>
      onHelp(model, help =>
        help.results._tag === 'Searching' && help.results.query === query
          ? { model: modifyFields(help, { results: () => HelpResults.Failed({ query, error }) }) }
          : { model: help },
      ),
    ClickedHit: ({ id }) =>
      onHelp(model, (help, visit) => ({
        model: modifyFields(help, {
          selected: () => Option.some(id),
          item: () => ItemState.Loading({ id }),
        }),
        commands: [FetchItem({ visit, id })],
      })),
    SucceededFetchItem: ({ id, item }) =>
      onHelp(model, help => {
        if (!isSelectedHit(help, id)) {
          return { model: help }
        }
        const next = Option.match(item, {
          onNone: () => ItemState.NotFound({ id }),
          onSome: found => ItemState.Shown({ item: found }),
        })
        return { model: modifyFields(help, { item: () => next }) }
      }),
    FailedFetchItem: ({ id, error }) =>
      onHelp(model, help =>
        isSelectedHit(help, id)
          ? { model: modifyFields(help, { item: () => ItemState.Failed({ id, error }) }) }
          : { model: help },
      ),
    ClickedRetryItem: () =>
      onHelp(model, (help, visit) =>
        Option.match(help.selected, {
          onNone: (): HelpStep => ({ model: help }),
          onSome: (id): HelpStep => ({
            model: modifyFields(help, { item: () => ItemState.Loading({ id }) }),
            commands: [FetchItem({ visit, id })],
          }),
        }),
      ),

    SucceededLoadSettings: ({ settings }) =>
      onSettings(model, settingsModel => ({
        model: modifyFields(settingsModel, {
          load: () =>
            SettingsLoad.Loaded({
              saved: settings,
              draft: settings,
              save: SaveState.Idle(),
              saveError: Option.none(),
              saveSeq: 0,
            }),
        }),
      })),
    FailedLoadSettings: ({ error }) =>
      onSettings(model, settingsModel => ({
        model: modifyFields(settingsModel, { load: () => SettingsLoad.Failed({ error }) }),
      })),
    ClickedRetryLoad: () =>
      onSettings(model, (settingsModel, visit) =>
        settingsModel.load._tag === 'Failed'
          ? {
              model: modifyFields(settingsModel, { load: () => SettingsLoad.Loading() }),
              commands: [LoadSettings({ visit })],
            }
          : { model: settingsModel },
      ),
    UpdatedName: ({ value }) =>
      onSettings(model, settingsModel => ({
        model: mapDraft(settingsModel, draft => modifyFields(draft, { name: () => value })),
      })),
    ClickedLightTheme: () =>
      onSettings(model, settingsModel => ({
        model: mapDraft(settingsModel, draft => modifyFields(draft, { theme: () => 'light' })),
      })),
    ClickedDarkTheme: () =>
      onSettings(model, settingsModel => ({
        model: mapDraft(settingsModel, draft => modifyFields(draft, { theme: () => 'dark' })),
      })),
    ClickedDensityToggle: () =>
      onSettings(model, settingsModel => ({
        model: mapDraft(settingsModel, draft =>
          modifyFields(draft, {
            density: () => (draft.density === 'compact' ? 'comfortable' : 'compact'),
          }),
        ),
      })),
    ClickedSave: () =>
      onSettings(model, (settingsModel, visit) => {
        if (settingsModel.load._tag !== 'Loaded' || nameError(settingsModel.load.draft.name) !== undefined) {
          return { model: settingsModel }
        }
        const loaded = settingsModel.load
        const seq = loaded.saveSeq + 1
        const draft = loaded.draft
        return {
          model: modifyFields(settingsModel, {
            load: () =>
              SettingsLoad.Loaded({
                saved: loaded.saved,
                draft: loaded.draft,
                save: SaveState.Saving({ pending: draft, seq }),
                saveError: Option.none(),
                saveSeq: seq,
              }),
          }),
          commands: [SaveSettings({ visit, seq, settings: draft })],
        }
      }),
    SucceededSaveSettings: ({ seq, settings }) =>
      onSettings(model, settingsModel => {
        if (settingsModel.load._tag !== 'Loaded' || settingsModel.load.save._tag !== 'Saving' || settingsModel.load.save.seq !== seq) {
          return { model: settingsModel }
        }
        const loaded = settingsModel.load
        return {
          model: modifyFields(settingsModel, {
            load: () =>
              SettingsLoad.Loaded({
                saved: settings,
                draft: loaded.draft,
                save: SaveState.Idle(),
                saveError: loaded.saveError,
                saveSeq: loaded.saveSeq,
              }),
          }),
        }
      }),
    FailedSaveSettings: ({ seq, error }) =>
      onSettings(model, settingsModel => {
        if (settingsModel.load._tag !== 'Loaded' || settingsModel.load.save._tag !== 'Saving' || settingsModel.load.save.seq !== seq) {
          return { model: settingsModel }
        }
        const loaded = settingsModel.load
        return {
          model: modifyFields(settingsModel, {
            load: () =>
              SettingsLoad.Loaded({
                saved: loaded.saved,
                draft: loaded.draft,
                save: SaveState.Idle(),
                saveError: Option.some(error),
                saveSeq: loaded.saveSeq,
              }),
          }),
        }
      }),
  })
}

export { update }
export { startPage, enter, carriedOpenCount }
