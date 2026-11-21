import { Array, Option } from 'effect'
import { Runtime, type Update } from 'foldkit'
import { modifyFields } from 'foldkit/struct'

import {
  AddLabel,
  AssignIssue,
  CloseIssue,
  FetchHelpItem,
  LoadComments,
  LoadIssue,
  LoadIssues,
  LoadLabels,
  LoadSettings,
  PostComment,
  RemoveLabel,
  RenameIssue,
  SaveSettings,
  SearchHelp,
  SearchRelated,
} from './command'
import { Message } from './message'
import {
  CommentData,
  CommentRow,
  CommentsLoad,
  DetailLoad,
  Filter,
  HelpItem,
  HelpPage,
  HelpResults,
  IssueDetail,
  IssueList,
  IssueRow,
  IssuesPage,
  LabelRow,
  LabelsLoad,
  Model,
  Origin,
  Related,
  SettingsPage,
  Tab,
} from './model'

// INIT

const initialIssues = (): IssuesPage => ({
  user: 'guest',
  filter: 'open',
  list: IssueList.Loading(),
  selected: Option.none(),
  detail: DetailLoad.Loading(),
  titleInput: '',
  commentInput: '',
  labelInput: '',
  comments: CommentsLoad.Loading(),
  labels: LabelsLoad.Loading(),
  related: Related.Idle(),
  rowError: Option.none(),
  assignError: Option.none(),
  renameError: Option.none(),
  closeError: Option.none(),
  postError: Option.none(),
  labelError: Option.none(),
})

const initialHelp = (): HelpPage => ({
  query: '',
  results: HelpResults.Idle(),
  selectedHit: Option.none(),
  item: HelpItem.Nothing(),
})

export const init: Runtime.ApplicationInit<Model, Message> = () => ({
  model: {
    tab: 'issues',
    openCount: Option.none(),
    nextKey: 0,
    issues: initialIssues(),
    help: initialHelp(),
    settings: SettingsPage.Loading(),
  },
  commands: [LoadIssues({ filter: 'open' })],
})

// HELPERS

type LoadedSettings = Extract<SettingsPage, { readonly _tag: 'Loaded' }>

const withIssues = (model: Model, issues: IssuesPage): Model =>
  modifyFields(model, { issues: () => issues })

const withHelp = (model: Model, help: HelpPage): Model =>
  modifyFields(model, { help: () => help })

const isSelected = (issues: IssuesPage, id: number): boolean =>
  Option.match(issues.selected, {
    onNone: () => false,
    onSome: selected => selected === id,
  })

const isSelectedHit = (help: HelpPage, id: number): boolean =>
  Option.match(help.selectedHit, {
    onNone: () => false,
    onSome: selected => selected === id,
  })

const findRow = (issues: IssuesPage, id: number): Option.Option<IssueRow> =>
  IssueList.match(issues.list, {
    Loading: () => Option.none(),
    Failed: () => Option.none(),
    Loaded: ({ issues: rows }) => Array.findFirst(rows, row => row.id === id),
  })

const updateRow = (
  issues: IssuesPage,
  id: number,
  change: (row: IssueRow) => IssueRow,
): IssuesPage =>
  modifyFields(issues, {
    list: list =>
      IssueList.match(list, {
        Loading: () => list,
        Failed: () => list,
        Loaded: ({ issues: rows }) =>
          IssueList.Loaded({
            issues: Array.map(rows, row => (row.id === id ? change(row) : row)),
          }),
      }),
  })

const loadedDetail = (
  issues: IssuesPage,
): Option.Option<{ readonly title: string; readonly body: string }> =>
  DetailLoad.match(issues.detail, {
    Loading: () => Option.none(),
    NotFound: () => Option.none(),
    Failed: () => Option.none(),
    Found: ({ title, body }) => Option.some({ title, body }),
  })

const applyTitle = (issues: IssuesPage, id: number, title: string): IssuesPage => {
  const renamed = updateRow(issues, id, row => modifyFields(row, { title: () => title }))
  if (!isSelected(issues, id)) {
    return renamed
  }
  return modifyFields(renamed, {
    detail: detail =>
      DetailLoad.match(detail, {
        Loading: () => detail,
        NotFound: () => detail,
        Failed: () => detail,
        Found: ({ body }) => DetailLoad.Found({ title, body }),
      }),
  })
}

const adjustCount = (model: Model, delta: number): Model =>
  modifyFields(model, {
    openCount: count => Option.map(count, total => total + delta),
  })

const setRowClosing = (model: Model, id: number, closing: boolean): Model =>
  withIssues(
    model,
    updateRow(model.issues, id, row => modifyFields(row, { closing: () => closing })),
  )

const startClosing = (model: Model, id: number): Model => {
  if (model.issues.filter !== 'open') {
    return model
  }
  return Option.match(findRow(model.issues, id), {
    onNone: () => model,
    onSome: row =>
      row.closing ? model : adjustCount(setRowClosing(model, id, true), -1),
  })
}

const stopClosing = (model: Model, id: number): Model =>
  Option.match(findRow(model.issues, id), {
    onNone: () => model,
    onSome: row =>
      row.closing ? adjustCount(setRowClosing(model, id, false), 1) : model,
  })

const commentsLoaded = (issues: IssuesPage): boolean =>
  CommentsLoad.match(issues.comments, {
    Loading: () => false,
    Failed: () => false,
    Loaded: () => true,
  })

const commentsLoading = (issues: IssuesPage): boolean =>
  CommentsLoad.match(issues.comments, {
    Loading: () => true,
    Failed: () => false,
    Loaded: () => false,
  })

const labelsLoading = (issues: IssuesPage): boolean =>
  LabelsLoad.match(issues.labels, {
    Loading: () => true,
    Failed: () => false,
    Loaded: () => false,
  })

const mapCommentRows = (
  issues: IssuesPage,
  change: (rows: ReadonlyArray<CommentRow>) => ReadonlyArray<CommentRow>,
): IssuesPage =>
  modifyFields(issues, {
    comments: comments =>
      CommentsLoad.match(comments, {
        Loading: () => comments,
        Failed: () => comments,
        Loaded: ({ rows }) => CommentsLoad.Loaded({ rows: change(rows) }),
      }),
  })

const mapLabelRows = (
  issues: IssuesPage,
  change: (rows: ReadonlyArray<LabelRow>) => ReadonlyArray<LabelRow>,
): IssuesPage =>
  modifyFields(issues, {
    labels: labels =>
      LabelsLoad.match(labels, {
        Loading: () => labels,
        Failed: () => labels,
        Loaded: ({ rows }) => LabelsLoad.Loaded({ rows: change(rows) }),
      }),
  })

const labelsLoaded = (issues: IssuesPage): boolean =>
  LabelsLoad.match(issues.labels, {
    Loading: () => false,
    Failed: () => false,
    Loaded: () => true,
  })

const labelPresent = (issues: IssuesPage, name: string): boolean =>
  LabelsLoad.match(issues.labels, {
    Loading: () => false,
    Failed: () => false,
    Loaded: ({ rows }) => rows.some(row => row.name === name),
  })

export const nameProblem = (name: string): Option.Option<string> => {
  if (name.length === 0) {
    return Option.some('Display name is required')
  }
  if (name.length > 20) {
    return Option.some(
      `Display name must be at most 20 characters, not ${name.length}`,
    )
  }
  return Option.none()
}

const updateLoadedSettings = (
  model: Model,
  change: (loaded: LoadedSettings) => LoadedSettings,
): Model =>
  modifyFields(model, {
    settings: settings =>
      SettingsPage.match(settings, {
        Loading: () => settings,
        LoadFailed: () => settings,
        Loaded: loaded => change(loaded),
      }),
  })

const isSearchingFor = (results: HelpResults, query: string): boolean =>
  HelpResults.match(results, {
    Idle: () => false,
    TooShort: () => false,
    Found: () => false,
    Failed: () => false,
    Searching: searching => searching.query === query,
  })

// TABS

const switchTab = (model: Model, tab: Tab): Update.Return<Model, Message> => {
  if (model.tab === tab) {
    return { model }
  }
  const switched = modifyFields(model, {
    tab: () => tab,
    issues: () => initialIssues(),
    help: () => initialHelp(),
    settings: () => SettingsPage.Loading(),
  })
  if (tab === 'issues') {
    return {
      model: switched,
      commands: [LoadIssues({ filter: 'open' })],
    }
  }
  if (tab === 'settings') {
    return { model: switched, commands: [LoadSettings()] }
  }
  return { model: switched }
}

// ISSUES

const changeFilter = (model: Model, filter: Filter): Update.Return<Model, Message> => {
  if (model.issues.filter === filter) {
    return { model }
  }
  const issues = modifyFields(model.issues, {
    filter: () => filter,
    list: () => IssueList.Loading(),
  })
  return {
    model: withIssues(model, issues),
    commands: [LoadIssues({ filter })],
  }
}

const receiveIssues = (
  model: Model,
  filter: Filter,
  rows: ReadonlyArray<IssueRow>,
): Update.Return<Model, Message> => {
  if (model.tab !== 'issues' || model.issues.filter !== filter) {
    return { model }
  }
  const loaded = withIssues(
    model,
    modifyFields(model.issues, { list: () => IssueList.Loaded({ issues: rows }) }),
  )
  if (filter === 'closed') {
    return { model: loaded }
  }
  return {
    model: modifyFields(loaded, { openCount: () => Option.some(rows.length) }),
  }
}

const failIssues = (
  model: Model,
  filter: Filter,
  message: string,
): Update.Return<Model, Message> => {
  if (model.tab !== 'issues' || model.issues.filter !== filter) {
    return { model }
  }
  return {
    model: withIssues(
      model,
      modifyFields(model.issues, { list: () => IssueList.Failed({ message }) }),
    ),
  }
}

const selectIssue = (model: Model, id: number): Update.Return<Model, Message> => {
  const issues = modifyFields(model.issues, {
    selected: () => Option.some(id),
    detail: () => DetailLoad.Loading(),
    titleInput: () => '',
    commentInput: () => '',
    labelInput: () => '',
    comments: () => CommentsLoad.Loading(),
    labels: () => LabelsLoad.Loading(),
    related: () => Related.Idle(),
    assignError: () => Option.none(),
    renameError: () => Option.none(),
    closeError: () => Option.none(),
    postError: () => Option.none(),
    labelError: () => Option.none(),
  })
  return {
    model: withIssues(model, issues),
    commands: [
      LoadIssue({ id }),
      LoadComments({ id }),
      LoadLabels({ id }),
    ],
  }
}

const retryIssue = (model: Model): Update.Return<Model, Message> =>
  Option.match(model.issues.selected, {
    onNone: () => ({ model }),
    onSome: id => ({
      model: withIssues(
        model,
        modifyFields(model.issues, { detail: () => DetailLoad.Loading() }),
      ),
      commands: [LoadIssue({ id })],
    }),
  })

const receiveIssue = (
  model: Model,
  id: number,
  issue: Option.Option<IssueDetail>,
): Update.Return<Model, Message> => {
  if (!isSelected(model.issues, id)) {
    return { model }
  }
  return Option.match(issue, {
    onNone: () => ({
      model: withIssues(
        model,
        modifyFields(model.issues, {
          detail: () => DetailLoad.NotFound(),
          related: () => Related.Idle(),
        }),
      ),
    }),
    onSome: found => ({
      model: withIssues(
        model,
        modifyFields(model.issues, {
          detail: () => DetailLoad.Found({ title: found.title, body: found.body }),
          related: () => Related.Searching(),
        }),
      ),
      commands: [SearchRelated({ id, query: found.title })],
    }),
  })
}

const failIssue = (model: Model, id: number, message: string): Update.Return<Model, Message> => {
  if (!isSelected(model.issues, id)) {
    return { model }
  }
  return {
    model: withIssues(
      model,
      modifyFields(model.issues, { detail: () => DetailLoad.Failed({ message }) }),
    ),
  }
}

const clickRename = (model: Model): Update.Return<Model, Message> => {
  const issues = model.issues
  const title = issues.titleInput.trim()
  return Option.match(issues.selected, {
    onNone: () => ({ model }),
    onSome: id =>
      Option.match(loadedDetail(issues), {
        onNone: () => ({ model }),
        onSome: detail =>
          title === ''
            ? { model }
            : {
                model: withIssues(
                  model,
                  modifyFields(applyTitle(issues, id, title), {
                    renameError: () => Option.none(),
                  }),
                ),
                commands: [RenameIssue({ id, title, previousTitle: detail.title })],
              },
      }),
  })
}

const receiveRename = (model: Model, id: number, title: string): Update.Return<Model, Message> => ({
  model: withIssues(model, applyTitle(model.issues, id, title)),
})

const failRename = (
  model: Model,
  id: number,
  previousTitle: string,
  message: string,
): Update.Return<Model, Message> => {
  const restored = applyTitle(model.issues, id, previousTitle)
  const issues = isSelected(restored, id)
    ? modifyFields(restored, { renameError: () => Option.some(message) })
    : restored
  return { model: withIssues(model, issues) }
}

const assignIssue = (model: Model, id: number, origin: Origin): Update.Return<Model, Message> => {
  const issues = model.issues
  const user = issues.user
  const previous = Option.flatMap(findRow(issues, id), row => row.assignee)
  const assigned = updateRow(issues, id, row =>
    modifyFields(row, { assignee: () => Option.some(user) }),
  )
  const cleared =
    origin === 'row'
      ? modifyFields(assigned, { rowError: () => Option.none() })
      : modifyFields(assigned, { assignError: () => Option.none() })
  return {
    model: withIssues(model, cleared),
    commands: [AssignIssue({ id, user, previous, origin })],
  }
}

const clickAssign = (model: Model): Update.Return<Model, Message> =>
  Option.match(model.issues.selected, {
    onNone: () => ({ model }),
    onSome: id => assignIssue(model, id, 'detail'),
  })

const receiveAssign = (model: Model, id: number, assignee: string): Update.Return<Model, Message> => ({
  model: withIssues(
    model,
    updateRow(model.issues, id, row => modifyFields(row, { assignee: () => Option.some(assignee) })),
  ),
})

const failAssign = (
  model: Model,
  id: number,
  previous: Option.Option<string>,
  origin: Origin,
  message: string,
): Update.Return<Model, Message> => {
  const restored = updateRow(model.issues, id, row =>
    modifyFields(row, { assignee: () => previous }),
  )
  if (origin === 'row') {
    return {
      model: withIssues(model, modifyFields(restored, { rowError: () => Option.some(message) })),
    }
  }
  if (!isSelected(restored, id)) {
    return { model: withIssues(model, restored) }
  }
  return {
    model: withIssues(model, modifyFields(restored, { assignError: () => Option.some(message) })),
  }
}

const closeIssue = (model: Model, id: number, origin: Origin): Update.Return<Model, Message> => {
  const started = startClosing(model, id)
  const cleared =
    origin === 'row'
      ? modifyFields(started.issues, { rowError: () => Option.none() })
      : modifyFields(started.issues, { closeError: () => Option.none() })
  return {
    model: withIssues(started, cleared),
    commands: [CloseIssue({ id, origin })],
  }
}

const clickClose = (model: Model): Update.Return<Model, Message> =>
  Option.match(model.issues.selected, {
    onNone: () => ({ model }),
    onSome: id => closeIssue(model, id, 'detail'),
  })

const failClose = (
  model: Model,
  id: number,
  origin: Origin,
  message: string,
): Update.Return<Model, Message> => {
  const stopped = stopClosing(model, id)
  if (origin === 'row') {
    return {
      model: withIssues(stopped, modifyFields(stopped.issues, { rowError: () => Option.some(message) })),
    }
  }
  if (!isSelected(stopped.issues, id)) {
    return { model: stopped }
  }
  return {
    model: withIssues(stopped, modifyFields(stopped.issues, { closeError: () => Option.some(message) })),
  }
}

const receiveComments = (model: Model, id: number, comments: ReadonlyArray<CommentData>): Update.Return<Model, Message> => {
  if (!isSelected(model.issues, id) || !commentsLoading(model.issues)) {
    return { model }
  }
  const rows = Array.map(comments, (comment, index) =>
    CommentRow.make({
      key: model.nextKey + index,
      author: comment.author,
      text: comment.text,
      status: 'saved',
    }),
  )
  const loaded = withIssues(
    model,
    modifyFields(model.issues, { comments: () => CommentsLoad.Loaded({ rows }) }),
  )
  return { model: modifyFields(loaded, { nextKey: key => key + comments.length }) }
}

const failComments = (model: Model, id: number, message: string): Update.Return<Model, Message> => {
  if (!isSelected(model.issues, id) || !commentsLoading(model.issues)) {
    return { model }
  }
  return {
    model: withIssues(model, modifyFields(model.issues, { comments: () => CommentsLoad.Failed({ message }) })),
  }
}

const clickPost = (model: Model): Update.Return<Model, Message> => {
  const issues = model.issues
  const text = issues.commentInput.trim()
  return Option.match(issues.selected, {
    onNone: () => ({ model }),
    onSome: id => {
      if (text === '' || !commentsLoaded(issues)) {
        return { model }
      }
      const key = model.nextKey
      const author = issues.user
      const withRow = mapCommentRows(issues, rows =>
        Array.append(rows, CommentRow.make({ key, author, text, status: 'sending' })),
      )
      const posted = modifyFields(withRow, {
        commentInput: () => '',
        postError: () => Option.none(),
      })
      return {
        model: modifyFields(withIssues(model, posted), { nextKey: count => count + 1 }),
        commands: [PostComment({ id, key, author, text })],
      }
    },
  })
}

const receivePost = (model: Model, id: number, key: number, comment: CommentData): Update.Return<Model, Message> => {
  if (!isSelected(model.issues, id)) {
    return { model }
  }
  return {
    model: withIssues(
      model,
      mapCommentRows(model.issues, rows =>
        Array.map(rows, row =>
          row.key === key
            ? CommentRow.make({ key, author: comment.author, text: comment.text, status: 'saved' })
            : row,
        ),
      ),
    ),
  }
}

const failPost = (model: Model, id: number, key: number, message: string): Update.Return<Model, Message> => {
  if (!isSelected(model.issues, id)) {
    return { model }
  }
  const removed = mapCommentRows(model.issues, rows => Array.filter(rows, row => row.key !== key))
  return { model: withIssues(model, modifyFields(removed, { postError: () => Option.some(message) })) }
}

const receiveLabels = (model: Model, id: number, labels: ReadonlyArray<string>): Update.Return<Model, Message> => {
  if (!isSelected(model.issues, id) || !labelsLoading(model.issues)) {
    return { model }
  }
  const rows = Array.map(labels, name => LabelRow.make({ name, status: 'saved' }))
  return {
    model: withIssues(model, modifyFields(model.issues, { labels: () => LabelsLoad.Loaded({ rows }) })),
  }
}

const failLabels = (model: Model, id: number, message: string): Update.Return<Model, Message> => {
  if (!isSelected(model.issues, id) || !labelsLoading(model.issues)) {
    return { model }
  }
  return {
    model: withIssues(model, modifyFields(model.issues, { labels: () => LabelsLoad.Failed({ message }) })),
  }
}

const clickAddLabel = (model: Model): Update.Return<Model, Message> => {
  const issues = model.issues
  const label = issues.labelInput.trim()
  return Option.match(issues.selected, {
    onNone: () => ({ model }),
    onSome: id => {
      if (label === '' || !labelsLoaded(issues) || labelPresent(issues, label)) {
        return { model }
      }
      const added = mapLabelRows(issues, rows =>
        Array.append(rows, LabelRow.make({ name: label, status: 'adding' })),
      )
      const next = modifyFields(added, {
        labelInput: () => '',
        labelError: () => Option.none(),
      })
      return {
        model: withIssues(model, next),
        commands: [AddLabel({ id, label })],
      }
    },
  })
}

const receiveAddLabel = (model: Model, id: number, label: string): Update.Return<Model, Message> => {
  if (!isSelected(model.issues, id)) {
    return { model }
  }
  return {
    model: withIssues(
      model,
      mapLabelRows(model.issues, rows =>
        Array.map(rows, row => (row.name === label ? LabelRow.make({ name: label, status: 'saved' }) : row)),
      ),
    ),
  }
}

const failAddLabel = (model: Model, id: number, label: string, message: string): Update.Return<Model, Message> => {
  if (!isSelected(model.issues, id)) {
    return { model }
  }
  const removed = mapLabelRows(model.issues, rows =>
    Array.filter(rows, row => !(row.name === label && row.status === 'adding')),
  )
  return { model: withIssues(model, modifyFields(removed, { labelError: () => Option.some(message) })) }
}

const clickRemoveLabel = (model: Model, label: string): Update.Return<Model, Message> =>
  Option.match(model.issues.selected, {
    onNone: () => ({ model }),
    onSome: id => {
      const changed = mapLabelRows(model.issues, rows =>
        Array.map(rows, row => (row.name === label ? LabelRow.make({ name: label, status: 'removing' }) : row)),
      )
      return {
        model: withIssues(model, modifyFields(changed, { labelError: () => Option.none() })),
        commands: [RemoveLabel({ id, label })],
      }
    },
  })

const receiveRemoveLabel = (model: Model, id: number, label: string): Update.Return<Model, Message> => {
  if (!isSelected(model.issues, id)) {
    return { model }
  }
  return {
    model: withIssues(
      model,
      mapLabelRows(model.issues, rows => Array.filter(rows, row => row.name !== label)),
    ),
  }
}

const failRemoveLabel = (model: Model, id: number, label: string, message: string): Update.Return<Model, Message> => {
  if (!isSelected(model.issues, id)) {
    return { model }
  }
  const restored = mapLabelRows(model.issues, rows =>
    Array.map(rows, row => (row.name === label ? LabelRow.make({ name: label, status: 'saved' }) : row)),
  )
  return { model: withIssues(model, modifyFields(restored, { labelError: () => Option.some(message) })) }
}

const receiveRelated = (model: Model, id: number, hits: ReadonlyArray<{ readonly id: number; readonly name: string }>): Update.Return<Model, Message> => {
  if (!isSelected(model.issues, id)) {
    return { model }
  }
  return {
    model: withIssues(model, modifyFields(model.issues, { related: () => Related.Found({ hits }) })),
  }
}

const failRelated = (model: Model, id: number, message: string): Update.Return<Model, Message> => {
  if (!isSelected(model.issues, id)) {
    return { model }
  }
  return {
    model: withIssues(model, modifyFields(model.issues, { related: () => Related.Failed({ message }) })),
  }
}

const clickRelatedHit = (model: Model, id: number): Update.Return<Model, Message> =>
  Option.match(loadedDetail(model.issues), {
    onNone: () => ({ model }),
    onSome: detail => ({
      model: switchToHelp(model, detail.title, id),
      commands: [SearchHelp({ query: detail.title }), FetchHelpItem({ id })],
    }),
  })

const switchToHelp = (model: Model, query: string, id: number): Model =>
  modifyFields(model, {
    tab: () => 'help',
    issues: () => initialIssues(),
    help: () => ({
      query,
      results: HelpResults.Searching({ query, hits: [] }),
      selectedHit: Option.some(id),
      item: HelpItem.Loading(),
    }),
  })

// HELP

const changeQuery = (model: Model, value: string): Update.Return<Model, Message> => {
  const previous = HelpResults.match(model.help.results, {
    Idle: () => [],
    TooShort: () => [],
    Failed: () => [],
    Searching: ({ hits }) => hits,
    Found: ({ hits }) => hits,
  })
  if (value.length === 0) {
    return { model: withHelp(model, modifyFields(model.help, { query: () => '', results: () => HelpResults.Idle() })) }
  }
  if (value.length === 1) {
    return {
      model: withHelp(model, modifyFields(model.help, { query: () => value, results: () => HelpResults.TooShort({ query: value }) })),
    }
  }
  return {
    model: withHelp(
      model,
      modifyFields(model.help, {
        query: () => value,
        results: () => HelpResults.Searching({ query: value, hits: previous }),
      }),
    ),
    commands: [SearchHelp({ query: value })],
  }
}

const receiveHelpSearch = (model: Model, query: string, hits: ReadonlyArray<{ readonly id: number; readonly name: string }>): Update.Return<Model, Message> => {
  if (!isSearchingFor(model.help.results, query)) {
    return { model }
  }
  return {
    model: withHelp(model, modifyFields(model.help, { results: () => HelpResults.Found({ query, hits }) })),
  }
}

const failHelpSearch = (model: Model, query: string, message: string): Update.Return<Model, Message> => {
  if (!isSearchingFor(model.help.results, query)) {
    return { model }
  }
  return {
    model: withHelp(model, modifyFields(model.help, { results: () => HelpResults.Failed({ query, message }) })),
  }
}

const clickHit = (model: Model, id: number): Update.Return<Model, Message> => ({
  model: withHelp(model, modifyFields(model.help, { selectedHit: () => Option.some(id), item: () => HelpItem.Loading() })),
  commands: [FetchHelpItem({ id })],
})

const receiveItem = (model: Model, id: number, item: Option.Option<{ readonly id: number; readonly name: string; readonly blurb: string }>): Update.Return<Model, Message> => {
  if (!isSelectedHit(model.help, id)) {
    return { model }
  }
  return {
    model: withHelp(
      model,
      modifyFields(model.help, {
        item: () =>
          Option.match(item, {
            onNone: () => HelpItem.NotFound(),
            onSome: found => HelpItem.Found({ item: found }),
          }),
      }),
    ),
  }
}

const failItem = (model: Model, id: number, message: string): Update.Return<Model, Message> => {
  if (!isSelectedHit(model.help, id)) {
    return { model }
  }
  return {
    model: withHelp(model, modifyFields(model.help, { item: () => HelpItem.Failed({ message }) })),
  }
}

const retryItem = (model: Model): Update.Return<Model, Message> =>
  Option.match(model.help.selectedHit, {
    onNone: () => ({ model }),
    onSome: id => ({
      model: withHelp(model, modifyFields(model.help, { item: () => HelpItem.Loading() })),
      commands: [FetchHelpItem({ id })],
    }),
  })

// SETTINGS

const settingsLoading = (settings: SettingsPage): boolean =>
  SettingsPage.match(settings, {
    Loading: () => true,
    LoadFailed: () => false,
    Loaded: () => false,
  })

const settingsLoadFailed = (settings: SettingsPage): boolean =>
  SettingsPage.match(settings, {
    Loading: () => false,
    LoadFailed: () => true,
    Loaded: () => false,
  })

const receiveSettings = (model: Model, settings: LoadedSettings['saved']): Update.Return<Model, Message> => {
  if (!settingsLoading(model.settings)) {
    return { model }
  }
  return {
    model: modifyFields(model, {
      settings: () =>
        SettingsPage.Loaded({
          saved: settings,
          draft: settings,
          saving: Option.none(),
          saveError: Option.none(),
        }),
    }),
  }
}

const failSettingsLoad = (model: Model, message: string): Update.Return<Model, Message> => {
  if (!settingsLoading(model.settings)) {
    return { model }
  }
  return { model: modifyFields(model, { settings: () => SettingsPage.LoadFailed({ message }) }) }
}

const retrySettingsLoad = (model: Model): Update.Return<Model, Message> => {
  if (!settingsLoadFailed(model.settings)) {
    return { model }
  }
  return {
    model: modifyFields(model, { settings: () => SettingsPage.Loading() }),
    commands: [LoadSettings()],
  }
}

const clickSave = (model: Model): Update.Return<Model, Message> =>
  SettingsPage.match(model.settings, {
    Loading: () => ({ model }),
    LoadFailed: () => ({ model }),
    Loaded: loaded =>
      Option.match(nameProblem(loaded.draft.name), {
        onSome: () => ({ model }),
        onNone: () => ({
          model: modifyFields(model, {
            settings: () =>
              modifyFields(loaded, {
                saving: () => Option.some(loaded.draft),
                saveError: () => Option.none(),
              }),
          }),
          commands: [SaveSettings({ settings: loaded.draft })],
        }),
      }),
  })

// UPDATE

export const update = (model: Model, message: Message) =>
  Message.match<Update.Return<Model, Message>>(message, {
    ClickedTab: ({ tab }) => switchTab(model, tab),

    UpdatedUser: ({ value }) => ({
      model: withIssues(model, modifyFields(model.issues, { user: () => value })),
    }),
    ClickedFilter: ({ filter }) => changeFilter(model, filter),
    SucceededLoadIssues: ({ filter, issues }) => receiveIssues(model, filter, issues),
    FailedLoadIssues: ({ filter, message }) => failIssues(model, filter, message),
    ClickedIssueRow: ({ id }) => selectIssue(model, id),
    ClickedRetryIssue: () => retryIssue(model),
    SucceededLoadIssue: ({ id, issue }) => receiveIssue(model, id, issue),
    FailedLoadIssue: ({ id, message }) => failIssue(model, id, message),

    UpdatedTitleInput: ({ value }) => ({
      model: withIssues(model, modifyFields(model.issues, { titleInput: () => value })),
    }),
    ClickedRename: () => clickRename(model),
    SucceededRenameIssue: ({ id, title }) => receiveRename(model, id, title),
    FailedRenameIssue: ({ id, previousTitle, message }) =>
      failRename(model, id, previousTitle, message),

    ClickedAssign: () => clickAssign(model),
    ClickedRowAssign: ({ id }) => assignIssue(model, id, 'row'),
    SucceededAssignIssue: ({ id, assignee }) => receiveAssign(model, id, assignee),
    FailedAssignIssue: ({ id, previous, origin, message }) =>
      failAssign(model, id, previous, origin, message),

    ClickedClose: () => clickClose(model),
    ClickedRowClose: ({ id }) => closeIssue(model, id, 'row'),
    SucceededCloseIssue: () => ({ model }),
    FailedCloseIssue: ({ id, origin, message }) => failClose(model, id, origin, message),

    SucceededLoadComments: ({ id, comments }) => receiveComments(model, id, comments),
    FailedLoadComments: ({ id, message }) => failComments(model, id, message),
    UpdatedCommentInput: ({ value }) => ({
      model: withIssues(model, modifyFields(model.issues, { commentInput: () => value })),
    }),
    ClickedPost: () => clickPost(model),
    SucceededPostComment: ({ id, key, comment }) => receivePost(model, id, key, comment),
    FailedPostComment: ({ id, key, message }) => failPost(model, id, key, message),

    SucceededLoadLabels: ({ id, labels }) => receiveLabels(model, id, labels),
    FailedLoadLabels: ({ id, message }) => failLabels(model, id, message),
    UpdatedLabelInput: ({ value }) => ({
      model: withIssues(model, modifyFields(model.issues, { labelInput: () => value })),
    }),
    ClickedAddLabel: () => clickAddLabel(model),
    SucceededAddLabel: ({ id, label }) => receiveAddLabel(model, id, label),
    FailedAddLabel: ({ id, label, message }) => failAddLabel(model, id, label, message),
    ClickedRemoveLabel: ({ label }) => clickRemoveLabel(model, label),
    SucceededRemoveLabel: ({ id, label }) => receiveRemoveLabel(model, id, label),
    FailedRemoveLabel: ({ id, label, message }) => failRemoveLabel(model, id, label, message),

    SucceededSearchRelated: ({ id, hits }) => receiveRelated(model, id, hits),
    FailedSearchRelated: ({ id, message }) => failRelated(model, id, message),
    ClickedRelatedHit: ({ id }) => clickRelatedHit(model, id),

    UpdatedQuery: ({ value }) => changeQuery(model, value),
    SucceededSearchHelp: ({ query, hits }) => receiveHelpSearch(model, query, hits),
    FailedSearchHelp: ({ query, message }) => failHelpSearch(model, query, message),
    ClickedHit: ({ id }) => clickHit(model, id),
    SucceededFetchHelpItem: ({ id, item }) => receiveItem(model, id, item),
    FailedFetchHelpItem: ({ id, message }) => failItem(model, id, message),
    ClickedRetryItem: () => retryItem(model),

    SucceededLoadSettings: ({ settings }) => receiveSettings(model, settings),
    FailedLoadSettings: ({ message }) => failSettingsLoad(model, message),
    ClickedRetryLoadSettings: () => retrySettingsLoad(model),
    UpdatedSettingsName: ({ value }) => ({
      model: updateLoadedSettings(model, loaded =>
        modifyFields(loaded, { draft: draft => modifyFields(draft, { name: () => value }) }),
      ),
    }),
    ClickedSettingsTheme: ({ theme }) => ({
      model: updateLoadedSettings(model, loaded =>
        modifyFields(loaded, { draft: draft => modifyFields(draft, { theme: () => theme }) }),
      ),
    }),
    ClickedDensityToggle: () => ({
      model: updateLoadedSettings(model, loaded =>
        modifyFields(loaded, {
          draft: draft =>
            modifyFields(draft, {
              density: () => (draft.density === 'compact' ? 'comfortable' : 'compact'),
            }),
        }),
      ),
    }),
    ClickedSaveSettings: () => clickSave(model),
    SucceededSaveSettings: ({ settings }) => ({
      model: updateLoadedSettings(model, loaded =>
        modifyFields(loaded, { saved: () => settings, saving: () => Option.none() }),
      ),
    }),
    FailedSaveSettings: ({ message }) => ({
      model: updateLoadedSettings(model, loaded =>
        modifyFields(loaded, {
          saving: () => Option.none(),
          saveError: () => Option.some(message),
        }),
      ),
    }),
  })
