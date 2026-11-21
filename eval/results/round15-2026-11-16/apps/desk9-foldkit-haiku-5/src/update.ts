import { Array, Effect, Option, Schema } from 'effect'
import { Command, Runtime, type Update } from 'foldkit'
import { modifyFields } from 'foldkit/struct'

import {
  addComment,
  addLabel,
  assign,
  closeIssue,
  fetchComments,
  fetchIssue,
  fetchIssues,
  fetchItem,
  fetchLabels,
  loadSettings,
  removeLabel,
  renameIssue,
  saveSettings,
  search,
} from './api.js'
import { Message } from './message'
import {
  CommentEntry,
  CommentsState,
  Filter,
  Hit,
  HelpPage,
  IssueDetailState,
  IssueList,
  IssueRow,
  IssuesPage,
  ItemState,
  LabelEntry,
  LabelsState,
  Model,
  Origin,
  RelatedState,
  Results,
  SaveStatus,
  SelectedIssue,
  Settings,
  SettingsLoad,
  SettingsPage,
} from './model'

// INIT

const initialIssues: IssuesPage = {
  user: 'guest',
  filter: 'open',
  list: IssueList.Loading(),
  closingIds: [],
  rowError: Option.none(),
  selected: Option.none(),
}

const initialHelp: HelpPage = {
  query: '',
  results: Results.Idle(),
  selectedHit: Option.none(),
  item: ItemState.Idle(),
}

const initialSettings: SettingsPage = {
  load: SettingsLoad.Loading(),
}

export const init: Runtime.ApplicationInit<Model, Message> = () => ({
  model: {
    tab: 'issues',
    visit: 0,
    openCount: Option.none(),
    nextKey: 0,
    issues: initialIssues,
    help: initialHelp,
    settings: initialSettings,
  },
  commands: [FetchIssues({ visit: 0, filter: 'open' })],
})

// COMMAND

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

const settle = <Value, Ok, Failed>(
  run: () => Promise<Value>,
  onSuccess: (value: Value) => Ok,
  onFailure: (error: string) => Failed,
) =>
  Effect.tryPromise({ try: run, catch: errorMessage }).pipe(
    Effect.match({ onFailure, onSuccess }),
  )

export const FetchIssues = Command.define('FetchIssues', {
  args: { visit: Schema.Number, filter: Filter },
  messages: [Message.SucceededFetchIssues, Message.FailedFetchIssues],
  execute: ({ visit, filter }) =>
    settle(
      () => fetchIssues(filter),
      issues => Message.SucceededFetchIssues({ visit, filter, issues }),
      error => Message.FailedFetchIssues({ visit, filter, error }),
    ),
})

export const FetchIssue = Command.define('FetchIssue', {
  args: { visit: Schema.Number, id: Schema.Number },
  messages: [Message.SucceededFetchIssue, Message.FailedFetchIssue],
  execute: ({ visit, id }) =>
    settle(
      () => fetchIssue(id),
      issue => Message.SucceededFetchIssue({ visit, id, issue }),
      error => Message.FailedFetchIssue({ visit, id, error }),
    ),
})

export const AssignIssue = Command.define('AssignIssue', {
  args: {
    visit: Schema.Number,
    id: Schema.Number,
    user: Schema.String,
    previous: Schema.NullOr(Schema.String),
    origin: Origin,
  },
  messages: [Message.SucceededAssignIssue, Message.FailedAssignIssue],
  execute: ({ visit, id, user, previous, origin }) =>
    settle(
      () => assign(id, user),
      () => Message.SucceededAssignIssue({ visit, id, origin }),
      error =>
        Message.FailedAssignIssue({ visit, id, origin, previous, error }),
    ),
})

export const RenameIssue = Command.define('RenameIssue', {
  args: {
    visit: Schema.Number,
    id: Schema.Number,
    title: Schema.String,
    previous: Schema.String,
  },
  messages: [Message.SucceededRenameIssue, Message.FailedRenameIssue],
  execute: ({ visit, id, title, previous }) =>
    settle(
      () => renameIssue(id, title),
      () => Message.SucceededRenameIssue({ visit, id }),
      error => Message.FailedRenameIssue({ visit, id, previous, error }),
    ),
})

export const CloseIssue = Command.define('CloseIssue', {
  args: { visit: Schema.Number, id: Schema.Number, origin: Origin },
  messages: [Message.SucceededCloseIssue, Message.FailedCloseIssue],
  execute: ({ visit, id, origin }) =>
    settle(
      () => closeIssue(id),
      () => Message.SucceededCloseIssue({ visit, id, origin }),
      error => Message.FailedCloseIssue({ visit, id, origin, error }),
    ),
})

export const FetchComments = Command.define('FetchComments', {
  args: { visit: Schema.Number, id: Schema.Number },
  messages: [Message.SucceededFetchComments, Message.FailedFetchComments],
  execute: ({ visit, id }) =>
    settle(
      () => fetchComments(id),
      comments => Message.SucceededFetchComments({ visit, id, comments }),
      error => Message.FailedFetchComments({ visit, id, error }),
    ),
})

export const AddComment = Command.define('AddComment', {
  args: {
    visit: Schema.Number,
    id: Schema.Number,
    key: Schema.Number,
    author: Schema.String,
    text: Schema.String,
  },
  messages: [Message.SucceededAddComment, Message.FailedAddComment],
  execute: ({ visit, id, key, author, text }) =>
    settle(
      () => addComment(id, author, text),
      comment =>
        Message.SucceededAddComment({
          visit,
          id,
          key,
          author: comment.author,
          text: comment.text,
        }),
      error => Message.FailedAddComment({ visit, id, key, error }),
    ),
})

export const FetchLabels = Command.define('FetchLabels', {
  args: { visit: Schema.Number, id: Schema.Number },
  messages: [Message.SucceededFetchLabels, Message.FailedFetchLabels],
  execute: ({ visit, id }) =>
    settle(
      () => fetchLabels(id),
      labels => Message.SucceededFetchLabels({ visit, id, labels }),
      error => Message.FailedFetchLabels({ visit, id, error }),
    ),
})

export const AddLabel = Command.define('AddLabel', {
  args: { visit: Schema.Number, id: Schema.Number, name: Schema.String },
  messages: [Message.SucceededAddLabel, Message.FailedAddLabel],
  execute: ({ visit, id, name }) =>
    settle(
      () => addLabel(id, name),
      () => Message.SucceededAddLabel({ visit, id, name }),
      error => Message.FailedAddLabel({ visit, id, name, error }),
    ),
})

export const RemoveLabel = Command.define('RemoveLabel', {
  args: { visit: Schema.Number, id: Schema.Number, name: Schema.String },
  messages: [Message.SucceededRemoveLabel, Message.FailedRemoveLabel],
  execute: ({ visit, id, name }) =>
    settle(
      () => removeLabel(id, name),
      () => Message.SucceededRemoveLabel({ visit, id, name }),
      error => Message.FailedRemoveLabel({ visit, id, name, error }),
    ),
})

export const SearchRelated = Command.define('SearchRelated', {
  args: { visit: Schema.Number, id: Schema.Number, query: Schema.String },
  messages: [Message.SucceededSearchRelated, Message.FailedSearchRelated],
  execute: ({ visit, id, query }) =>
    settle(
      () => search(query),
      hits => Message.SucceededSearchRelated({ visit, id, hits }),
      error => Message.FailedSearchRelated({ visit, id, error }),
    ),
})

export const Search = Command.define('Search', {
  args: { visit: Schema.Number, query: Schema.String },
  messages: [Message.SucceededSearch, Message.FailedSearch],
  execute: ({ visit, query }) =>
    settle(
      () => search(query),
      hits => Message.SucceededSearch({ visit, query, hits }),
      error => Message.FailedSearch({ visit, query, error }),
    ),
})

export const FetchItem = Command.define('FetchItem', {
  args: { visit: Schema.Number, id: Schema.Number },
  messages: [Message.SucceededFetchItem, Message.FailedFetchItem],
  execute: ({ visit, id }) =>
    settle(
      () => fetchItem(id),
      item => Message.SucceededFetchItem({ visit, id, item }),
      error => Message.FailedFetchItem({ visit, id, error }),
    ),
})

export const LoadSettings = Command.define('LoadSettings', {
  args: { visit: Schema.Number },
  messages: [Message.SucceededLoadSettings, Message.FailedLoadSettings],
  execute: ({ visit }) =>
    settle(
      () => loadSettings(),
      settings => Message.SucceededLoadSettings({ visit, settings }),
      error => Message.FailedLoadSettings({ visit, error }),
    ),
})

export const SaveSettings = Command.define('SaveSettings', {
  args: { visit: Schema.Number, settings: Settings },
  messages: [Message.SucceededSaveSettings, Message.FailedSaveSettings],
  execute: ({ visit, settings }) =>
    settle(
      () => saveSettings(settings),
      saved => Message.SucceededSaveSettings({ visit, settings: saved }),
      error => Message.FailedSaveSettings({ visit, error }),
    ),
})

// UPDATE

type UpdateReturn = Update.Return<Model, Message>

export const DISPLAY_NAME_MAX = 20

export const displayNameError = (name: string): Option.Option<string> => {
  if (name.trim() === '') {
    return Option.some('Display name is required')
  }
  if (name.length > DISPLAY_NAME_MAX) {
    return Option.some(
      `Display name must be at most ${DISPLAY_NAME_MAX} characters, not ${name.length}`,
    )
  }
  return Option.none()
}



const putIssues = (model: Model, issues: IssuesPage): Model =>
  modifyFields(model, { issues: () => issues })

const putHelp = (model: Model, help: HelpPage): Model =>
  modifyFields(model, { help: () => help })

const putSettingsLoad = (
  model: Model,
  f: (load: SettingsLoad) => SettingsLoad,
): Model =>
  modifyFields(model, {
    settings: settings => modifyFields(settings, { load: f }),
  })

const withIssues = (
  model: Model,
  step: (issues: IssuesPage) => UpdateReturn,
): UpdateReturn => (model.tab === 'issues' ? step(model.issues) : { model })

const withIssuesAt = (
  model: Model,
  visit: number,
  step: (issues: IssuesPage) => UpdateReturn,
): UpdateReturn => (model.visit === visit ? withIssues(model, step) : { model })

const withHelp = (
  model: Model,
  step: (help: HelpPage) => UpdateReturn,
): UpdateReturn => (model.tab === 'help' ? step(model.help) : { model })

const withHelpAt = (
  model: Model,
  visit: number,
  step: (help: HelpPage) => UpdateReturn,
): UpdateReturn => (model.visit === visit ? withHelp(model, step) : { model })

const withSelection = (
  model: Model,
  step: (issues: IssuesPage, selected: SelectedIssue) => UpdateReturn,
): UpdateReturn =>
  withIssues(model, issues =>
    Option.match(issues.selected, {
      onNone: () => ({ model }),
      onSome: selected => step(issues, selected),
    }),
  )

const putSelected = (
  model: Model,
  issues: IssuesPage,
  selected: SelectedIssue,
): Model =>
  putIssues(
    model,
    modifyFields(issues, { selected: () => Option.some(selected) }),
  )

const mapSelectedFor = (
  issues: IssuesPage,
  id: number,
  f: (selected: SelectedIssue) => SelectedIssue,
): IssuesPage =>
  modifyFields(issues, {
    selected: selected =>
      Option.map(selected, current => (current.id === id ? f(current) : current)),
  })

const newSelection = (id: number): SelectedIssue => ({
  id,
  detail: IssueDetailState.Loading(),
  comments: CommentsState.Loading(),
  labels: LabelsState.Loading(),
  related: RelatedState.Idle(),
  titleDraft: '',
  commentDraft: '',
  labelDraft: '',
  assignError: Option.none(),
  renameError: Option.none(),
  closeError: Option.none(),
  postError: Option.none(),
  labelError: Option.none(),
})

const allRows = (issues: IssuesPage): ReadonlyArray<IssueRow> =>
  IssueList.match<ReadonlyArray<IssueRow>>(issues.list, {
    Loading: () => [],
    Failed: () => [],
    Loaded: ({ rows }) => rows,
  })

export const visibleRows = (issues: IssuesPage): ReadonlyArray<IssueRow> =>
  issues.filter === 'closed'
    ? allRows(issues)
    : allRows(issues).filter(row => !issues.closingIds.includes(row.id))

const isOpenListShown = (issues: IssuesPage): boolean =>
  issues.filter === 'open' &&
  IssueList.match<boolean>(issues.list, {
    Loading: () => false,
    Failed: () => false,
    Loaded: () => true,
  })

const syncOpenCount = (model: Model, issues: IssuesPage): Model =>
  isOpenListShown(issues)
    ? modifyFields(model, {
        openCount: () => Option.some(visibleRows(issues).length),
      })
    : model

const mapRows = (
  issues: IssuesPage,
  f: (rows: ReadonlyArray<IssueRow>) => ReadonlyArray<IssueRow>,
): IssuesPage =>
  modifyFields(issues, {
    list: list =>
      IssueList.match<IssueList>(list, {
        Loading: () => list,
        Failed: () => list,
        Loaded: ({ rows }) => IssueList.Loaded({ rows: f(rows) }),
      }),
  })

const mapRow = (
  issues: IssuesPage,
  id: number,
  f: (row: IssueRow) => IssueRow,
): IssuesPage =>
  mapRows(issues, rows => rows.map(row => (row.id === id ? f(row) : row)))

const rowAssignee = (issues: IssuesPage, id: number): Option.Option<string> =>
  Option.flatMap(
    Array.findFirst(allRows(issues), row => row.id === id),
    row => row.assignee,
  )

const detailWithTitle = (
  detail: IssueDetailState,
  title: string,
): IssueDetailState =>
  IssueDetailState.match<IssueDetailState>(detail, {
    Loaded: ({ body }) => IssueDetailState.Loaded({ title, body }),
    Loading: () => detail,
    NotFound: () => detail,
    Failed: () => detail,
  })

const withCloseId = (issues: IssuesPage, id: number): IssuesPage =>
  modifyFields(issues, { closingIds: ids => [...ids, id] })

const withoutCloseId = (issues: IssuesPage, id: number): IssuesPage =>
  modifyFields(issues, { closingIds: ids => ids.filter(x => x !== id) })

const shownHits = (results: Results): ReadonlyArray<Hit> =>
  Results.match<ReadonlyArray<Hit>>(results, {
    Idle: () => [],
    TooShort: () => [],
    Searching: ({ shown }) => shown,
    Loaded: ({ hits }) => hits,
    Failed: () => [],
  })

const queryResults = (query: string, shown: ReadonlyArray<Hit>): Results => {
  if (query.length === 0) {
    return Results.Idle()
  }
  if (query.length < 2) {
    return Results.TooShort({ query })
  }
  return Results.Searching({ query, shown })
}

const enterIssues = (model: Model): UpdateReturn => {
  const visit = model.visit + 1
  return {
    model: modifyFields(model, {
      tab: () => 'issues',
      visit: () => visit,
      issues: () => initialIssues,
    }),
    commands: [FetchIssues({ visit, filter: 'open' })],
  }
}

const enterHelp = (model: Model): UpdateReturn => ({
  model: modifyFields(model, {
    tab: () => 'help',
    visit: () => model.visit + 1,
    help: () => initialHelp,
  }),
})

const enterSettings = (model: Model): UpdateReturn => {
  const visit = model.visit + 1
  return {
    model: modifyFields(model, {
      tab: () => 'settings',
      visit: () => visit,
      settings: () => initialSettings,
    }),
    commands: [LoadSettings({ visit })],
  }
}

const enterRelatedHit = (model: Model, id: number, query: string): UpdateReturn => {
  const visit = model.visit + 1
  return {
    model: modifyFields(model, {
      tab: () => 'help',
      visit: () => visit,
      help: () => ({
        query,
        results: Results.Searching({ query, shown: [] }),
        selectedHit: Option.some(id),
        item: ItemState.Loading({ id }),
      }),
    }),
    commands: [Search({ visit, query }), FetchItem({ visit, id })],
  }
}

const updateDraft = (model: Model, f: (draft: Settings) => Settings): Model =>
  putSettingsLoad(model, load =>
    SettingsLoad.match<SettingsLoad>(load, {
      Loaded: ({ saved, draft, save }) =>
        SettingsLoad.Loaded({ saved, draft: f(draft), save }),
      Loading: () => load,
      Failed: () => load,
    }),
  )

const withKeys = (model: Model, count: number, issues: IssuesPage): Model =>
  modifyFields(putIssues(model, issues), {
    nextKey: key => key + count,
  })

export const update = (model: Model, message: Message): UpdateReturn =>
  Message.match<UpdateReturn>(message, {
    ClickedTabIssues: () => (model.tab === 'issues' ? { model } : enterIssues(model)),
    ClickedTabHelp: () => (model.tab === 'help' ? { model } : enterHelp(model)),
    ClickedTabSettings: () =>
      model.tab === 'settings' ? { model } : enterSettings(model),
    ClickedRelatedHit: ({ id, query }) => enterRelatedHit(model, id, query),

    UpdatedUser: ({ value }) =>
      withIssues(model, issues => ({
        model: putIssues(model, modifyFields(issues, { user: () => value })),
      })),

    ClickedFilter: ({ filter }) =>
      withIssues(model, issues => {
        if (issues.filter === filter) {
          return { model }
        }
        const next = modifyFields(issues, {
          filter: () => filter,
          list: () => IssueList.Loading(),
        })
        return {
          model: putIssues(model, next),
          commands: [FetchIssues({ visit: model.visit, filter })],
        }
      }),

    ClickedIssueRow: ({ id }) =>
      withIssues(model, issues => ({
        model: putSelected(model, issues, newSelection(id)),
        commands: [
          FetchIssue({ visit: model.visit, id }),
          FetchComments({ visit: model.visit, id }),
          FetchLabels({ visit: model.visit, id }),
        ],
      })),

    SucceededFetchIssues: ({ visit, filter, issues: summaries }) =>
      withIssuesAt(model, visit, issues => {
        if (issues.filter !== filter) {
          return { model }
        }
        const next = modifyFields(issues, {
          list: () =>
            IssueList.Loaded({
              rows: summaries.map(summary =>
                IssueRow.make({
                  id: summary.id,
                  title: summary.title,
                  assignee: Option.fromNullishOr(summary.assignee),
                }),
              ),
            }),
        })
        return { model: syncOpenCount(putIssues(model, next), next) }
      }),

    FailedFetchIssues: ({ visit, filter, error }) =>
      withIssuesAt(model, visit, issues => {
        if (issues.filter !== filter) {
          return { model }
        }
        return {
          model: putIssues(
            model,
            modifyFields(issues, { list: () => IssueList.Failed({ error }) }),
          ),
        }
      }),

    ClickedRetryDetail: () =>
      withSelection(model, (issues, selected) => ({
        model: putSelected(
          model,
          issues,
          modifyFields(selected, { detail: () => IssueDetailState.Loading() }),
        ),
        commands: [FetchIssue({ visit: model.visit, id: selected.id })],
      })),

    SucceededFetchIssue: ({ visit, id, issue }) =>
      withIssuesAt(model, visit, issues => {
        const updated = mapSelectedFor(issues, id, selected => {
          if (issue === null) {
            return modifyFields(selected, {
              detail: () => IssueDetailState.NotFound(),
            })
          }
          return modifyFields(selected, {
            detail: () =>
              IssueDetailState.Loaded({ title: issue.title, body: issue.body }),
            related: () => RelatedState.Loading(),
          })
        })
        const selectedAt = Option.exists(
          updated.selected,
          selected => selected.id === id,
        )
        if (issue === null || !selectedAt) {
          return { model: putIssues(model, updated) }
        }
        return {
          model: putIssues(model, updated),
          commands: [
            SearchRelated({ visit, id, query: issue.title }),
          ],
        }
      }),

    FailedFetchIssue: ({ visit, id, error }) =>
      withIssuesAt(model, visit, issues => ({
        model: putIssues(
          model,
          mapSelectedFor(issues, id, selected =>
            modifyFields(selected, {
              detail: () => IssueDetailState.Failed({ error }),
            }),
          ),
        ),
      })),

    ClickedAssign: () =>
      withSelection(model, (issues, selected) => {
        const user = issues.user
        const next = modifyFields(mapRow(issues, selected.id, row =>
          modifyFields(row, { assignee: () => Option.some(user) }),
        ), {
          selected: () =>
            Option.some(
              modifyFields(selected, { assignError: () => Option.none() }),
            ),
        })
        return {
          model: putIssues(model, next),
          commands: [
            AssignIssue({
              visit: model.visit,
              id: selected.id,
              user,
              previous: Option.getOrNull(rowAssignee(issues, selected.id)),
              origin: 'Detail',
            }),
          ],
        }
      }),

    ClickedRowAssign: ({ id }) =>
      withIssues(model, issues => {
        const user = issues.user
        const next = modifyFields(
          mapRow(issues, id, row =>
            modifyFields(row, { assignee: () => Option.some(user) }),
          ),
          { rowError: () => Option.none() },
        )
        return {
          model: putIssues(model, next),
          commands: [
            AssignIssue({
              visit: model.visit,
              id,
              user,
              previous: Option.getOrNull(rowAssignee(issues, id)),
              origin: 'Row',
            }),
          ],
        }
      }),

    SucceededAssignIssue: () => ({ model }),

    FailedAssignIssue: ({ visit, id, origin, previous, error }) =>
      withIssuesAt(model, visit, issues => {
        const restored = mapRow(issues, id, row =>
          modifyFields(row, { assignee: () => Option.fromNullishOr(previous) }),
        )
        const next =
          origin === 'Row'
            ? modifyFields(restored, { rowError: () => Option.some(error) })
            : mapSelectedFor(restored, id, selected =>
                modifyFields(selected, { assignError: () => Option.some(error) }),
              )
        return { model: putIssues(model, next) }
      }),

    UpdatedTitleDraft: ({ value }) =>
      withSelection(model, (issues, selected) => ({
        model: putSelected(
          model,
          issues,
          modifyFields(selected, { titleDraft: () => value }),
        ),
      })),

    ClickedRename: () =>
      withSelection(model, (issues, selected) => {
        const title = selected.titleDraft.trim()
        if (title === '') {
          return { model }
        }
        return IssueDetailState.match<UpdateReturn>(selected.detail, {
          Loaded: ({ title: previous }) => {
            const next = modifyFields(
              mapRow(issues, selected.id, row =>
                modifyFields(row, { title: () => title }),
              ),
              {
                selected: () =>
                  Option.some(
                    modifyFields(selected, {
                      detail: () => detailWithTitle(selected.detail, title),
                      renameError: () => Option.none(),
                    }),
                  ),
              },
            )
            return {
              model: putIssues(model, next),
              commands: [
                RenameIssue({
                  visit: model.visit,
                  id: selected.id,
                  title,
                  previous,
                }),
              ],
            }
          },
          Loading: () => ({ model }),
          NotFound: () => ({ model }),
          Failed: () => ({ model }),
        })
      }),

    SucceededRenameIssue: () => ({ model }),

    FailedRenameIssue: ({ visit, id, previous, error }) =>
      withIssuesAt(model, visit, issues => {
        const restored = mapSelectedFor(
          mapRow(issues, id, row =>
            modifyFields(row, { title: () => previous }),
          ),
          id,
          selected =>
            modifyFields(selected, {
              detail: () => detailWithTitle(selected.detail, previous),
              renameError: () => Option.some(error),
            }),
        )
        return { model: putIssues(model, restored) }
      }),

    ClickedClose: () =>
      withSelection(model, (issues, selected) => {
        if (issues.closingIds.includes(selected.id)) {
          return { model }
        }
        const next = mapSelectedFor(
          withCloseId(issues, selected.id),
          selected.id,
          current => modifyFields(current, { closeError: () => Option.none() }),
        )
        return {
          model: syncOpenCount(putIssues(model, next), next),
          commands: [
            CloseIssue({ visit: model.visit, id: selected.id, origin: 'Detail' }),
          ],
        }
      }),

    ClickedRowClose: ({ id }) =>
      withIssues(model, issues => {
        if (issues.closingIds.includes(id)) {
          return { model }
        }
        const next = modifyFields(withCloseId(issues, id), {
          rowError: () => Option.none(),
        })
        return {
          model: syncOpenCount(putIssues(model, next), next),
          commands: [CloseIssue({ visit: model.visit, id, origin: 'Row' })],
        }
      }),

    SucceededCloseIssue: ({ visit, id }) =>
      withIssuesAt(model, visit, issues => {
        const removed =
          issues.filter === 'open'
            ? mapRows(issues, rows => rows.filter(row => row.id !== id))
            : issues
        const next = withoutCloseId(removed, id)
        return { model: syncOpenCount(putIssues(model, next), next) }
      }),

    FailedCloseIssue: ({ visit, id, origin, error }) =>
      withIssuesAt(model, visit, issues => {
        const reopened = withoutCloseId(issues, id)
        const next =
          origin === 'Row'
            ? modifyFields(reopened, { rowError: () => Option.some(error) })
            : mapSelectedFor(reopened, id, selected =>
                modifyFields(selected, { closeError: () => Option.some(error) }),
              )
        return { model: syncOpenCount(putIssues(model, next), next) }
      }),

    SucceededFetchComments: ({ visit, id, comments }) =>
      withIssuesAt(model, visit, issues => {
        const entries = comments.map((comment, index) =>
          CommentEntry.make({
            key: model.nextKey + index,
            author: comment.author,
            text: comment.text,
            status: 'Saved',
          }),
        )
        const next = mapSelectedFor(issues, id, selected =>
          modifyFields(selected, {
            comments: () => CommentsState.Loaded({ comments: entries }),
          }),
        )
        return { model: withKeys(model, comments.length, next) }
      }),

    FailedFetchComments: ({ visit, id, error }) =>
      withIssuesAt(model, visit, issues => ({
        model: putIssues(
          model,
          mapSelectedFor(issues, id, selected =>
            modifyFields(selected, {
              comments: () => CommentsState.Failed({ error }),
            }),
          ),
        ),
      })),

    UpdatedCommentDraft: ({ value }) =>
      withSelection(model, (issues, selected) => ({
        model: putSelected(
          model,
          issues,
          modifyFields(selected, { commentDraft: () => value }),
        ),
      })),

    ClickedPost: () =>
      withSelection(model, (issues, selected) => {
        const text = selected.commentDraft.trim()
        if (text === '') {
          return { model }
        }
        return CommentsState.match<UpdateReturn>(selected.comments, {
          Loaded: ({ comments }) => {
            const key = model.nextKey
            const author = issues.user
            const entry = CommentEntry.make({
              key,
              author,
              text,
              status: 'Sending',
            })
            const next = putSelected(
              modifyFields(model, { nextKey: () => key + 1 }),
              issues,
              modifyFields(selected, {
                comments: () =>
                  CommentsState.Loaded({ comments: [...comments, entry] }),
                commentDraft: () => '',
                postError: () => Option.none(),
              }),
            )
            return {
              model: next,
              commands: [
                AddComment({
                  visit: model.visit,
                  id: selected.id,
                  key,
                  author,
                  text,
                }),
              ],
            }
          },
          Loading: () => ({ model }),
          Failed: () => ({ model }),
        })
      }),

    SucceededAddComment: ({ visit, id, key, author, text }) =>
      withIssuesAt(model, visit, issues => ({
        model: putIssues(
          model,
          mapSelectedFor(issues, id, selected =>
            modifyFields(selected, {
              comments: current =>
                CommentsState.match<CommentsState>(current, {
                  Loaded: ({ comments }) =>
                    CommentsState.Loaded({
                      comments: comments.map(entry =>
                        entry.key === key
                          ? CommentEntry.make({
                              key,
                              author,
                              text,
                              status: 'Saved',
                            })
                          : entry,
                      ),
                    }),
                  Loading: () => current,
                  Failed: () => current,
                }),
            }),
          ),
        ),
      })),

    FailedAddComment: ({ visit, id, key, error }) =>
      withIssuesAt(model, visit, issues => ({
        model: putIssues(
          model,
          mapSelectedFor(issues, id, selected =>
            modifyFields(selected, {
              comments: current =>
                CommentsState.match<CommentsState>(current, {
                  Loaded: ({ comments }) =>
                    CommentsState.Loaded({
                      comments: comments.filter(entry => entry.key !== key),
                    }),
                  Loading: () => current,
                  Failed: () => current,
                }),
              postError: () => Option.some(error),
            }),
          ),
        ),
      })),

    SucceededFetchLabels: ({ visit, id, labels }) =>
      withIssuesAt(model, visit, issues => {
        const entries = labels.map((name, index) =>
          LabelEntry.make({
            key: model.nextKey + index,
            name,
            status: 'Stable',
          }),
        )
        const next = mapSelectedFor(issues, id, selected =>
          modifyFields(selected, {
            labels: () => LabelsState.Loaded({ labels: entries }),
          }),
        )
        return { model: withKeys(model, labels.length, next) }
      }),

    FailedFetchLabels: ({ visit, id, error }) =>
      withIssuesAt(model, visit, issues => ({
        model: putIssues(
          model,
          mapSelectedFor(issues, id, selected =>
            modifyFields(selected, {
              labels: () => LabelsState.Failed({ error }),
            }),
          ),
        ),
      })),

    UpdatedLabelDraft: ({ value }) =>
      withSelection(model, (issues, selected) => ({
        model: putSelected(
          model,
          issues,
          modifyFields(selected, { labelDraft: () => value }),
        ),
      })),

    ClickedAddLabel: () =>
      withSelection(model, (issues, selected) => {
        const name = selected.labelDraft.trim()
        if (name === '') {
          return { model }
        }
        return LabelsState.match<UpdateReturn>(selected.labels, {
          Loaded: ({ labels }) => {
            if (labels.some(entry => entry.name === name && entry.status !== 'Removing')) {
              return { model }
            }
            const key = model.nextKey
            const entry = LabelEntry.make({ key, name, status: 'Adding' })
            const next = putSelected(
              modifyFields(model, { nextKey: () => key + 1 }),
              issues,
              modifyFields(selected, {
                labels: () => LabelsState.Loaded({ labels: [...labels, entry] }),
                labelDraft: () => '',
                labelError: () => Option.none(),
              }),
            )
            return {
              model: next,
              commands: [
                AddLabel({ visit: model.visit, id: selected.id, name }),
              ],
            }
          },
          Loading: () => ({ model }),
          Failed: () => ({ model }),
        })
      }),

    SucceededAddLabel: ({ visit, id, name }) =>
      withIssuesAt(model, visit, issues => ({
        model: putIssues(
          model,
          mapSelectedFor(issues, id, selected =>
            modifyFields(selected, {
              labels: current =>
                LabelsState.match<LabelsState>(current, {
                  Loaded: ({ labels }) =>
                    LabelsState.Loaded({
                      labels: labels.map(entry =>
                        entry.name === name && entry.status === 'Adding'
                          ? LabelEntry.make({ key: entry.key, name, status: 'Stable' })
                          : entry,
                      ),
                    }),
                  Loading: () => current,
                  Failed: () => current,
                }),
            }),
          ),
        ),
      })),

    FailedAddLabel: ({ visit, id, name, error }) =>
      withIssuesAt(model, visit, issues => ({
        model: putIssues(
          model,
          mapSelectedFor(issues, id, selected =>
            modifyFields(selected, {
              labels: current =>
                LabelsState.match<LabelsState>(current, {
                  Loaded: ({ labels }) =>
                    LabelsState.Loaded({
                      labels: labels.filter(
                        entry => !(entry.name === name && entry.status === 'Adding'),
                      ),
                    }),
                  Loading: () => current,
                  Failed: () => current,
                }),
              labelError: () => Option.some(error),
            }),
          ),
        ),
      })),

    ClickedRemoveLabel: ({ name }) =>
      withSelection(model, (issues, selected) =>
        LabelsState.match<UpdateReturn>(selected.labels, {
          Loaded: ({ labels }) => {
            if (!labels.some(entry => entry.name === name && entry.status === 'Stable')) {
              return { model }
            }
            const next = putSelected(model, issues, modifyFields(selected, {
              labels: () =>
                LabelsState.Loaded({
                  labels: labels.map(entry =>
                    entry.name === name && entry.status === 'Stable'
                      ? LabelEntry.make({ key: entry.key, name, status: 'Removing' })
                      : entry,
                  ),
                }),
              labelError: () => Option.none(),
            }))
            return {
              model: next,
              commands: [RemoveLabel({ visit: model.visit, id: selected.id, name })],
            }
          },
          Loading: () => ({ model }),
          Failed: () => ({ model }),
        }),
      ),

    SucceededRemoveLabel: ({ visit, id, name }) =>
      withIssuesAt(model, visit, issues => ({
        model: putIssues(
          model,
          mapSelectedFor(issues, id, selected =>
            modifyFields(selected, {
              labels: current =>
                LabelsState.match<LabelsState>(current, {
                  Loaded: ({ labels }) =>
                    LabelsState.Loaded({
                      labels: labels.filter(
                        entry => !(entry.name === name && entry.status === 'Removing'),
                      ),
                    }),
                  Loading: () => current,
                  Failed: () => current,
                }),
            }),
          ),
        ),
      })),

    FailedRemoveLabel: ({ visit, id, name, error }) =>
      withIssuesAt(model, visit, issues => ({
        model: putIssues(
          model,
          mapSelectedFor(issues, id, selected =>
            modifyFields(selected, {
              labels: current =>
                LabelsState.match<LabelsState>(current, {
                  Loaded: ({ labels }) =>
                    LabelsState.Loaded({
                      labels: labels.map(entry =>
                        entry.name === name && entry.status === 'Removing'
                          ? LabelEntry.make({ key: entry.key, name, status: 'Stable' })
                          : entry,
                      ),
                    }),
                  Loading: () => current,
                  Failed: () => current,
                }),
              labelError: () => Option.some(error),
            }),
          ),
        ),
      })),

    SucceededSearchRelated: ({ visit, id, hits }) =>
      withIssuesAt(model, visit, issues => ({
        model: putIssues(
          model,
          mapSelectedFor(issues, id, selected =>
            modifyFields(selected, {
              related: () => RelatedState.Loaded({ hits }),
            }),
          ),
        ),
      })),

    FailedSearchRelated: ({ visit, id, error }) =>
      withIssuesAt(model, visit, issues => ({
        model: putIssues(
          model,
          mapSelectedFor(issues, id, selected =>
            modifyFields(selected, {
              related: () => RelatedState.Failed({ error }),
            }),
          ),
        ),
      })),

    UpdatedQuery: ({ value }) =>
      withHelp(model, help => {
        const next = modifyFields(help, {
          query: () => value,
          results: () => queryResults(value, shownHits(help.results)),
        })
        if (value.length >= 2) {
          return {
            model: putHelp(model, next),
            commands: [Search({ visit: model.visit, query: value })],
          }
        }
        return { model: putHelp(model, next) }
      }),

    SucceededSearch: ({ visit, query, hits }) =>
      withHelpAt(model, visit, help =>
        help.query === query
          ? {
              model: putHelp(
                model,
                modifyFields(help, { results: () => Results.Loaded({ query, hits }) }),
              ),
            }
          : { model },
      ),

    FailedSearch: ({ visit, query, error }) =>
      withHelpAt(model, visit, help =>
        help.query === query
          ? {
              model: putHelp(
                model,
                modifyFields(help, { results: () => Results.Failed({ query, error }) }),
              ),
            }
          : { model },
      ),

    ClickedHit: ({ id }) =>
      withHelp(model, help => ({
        model: putHelp(
          model,
          modifyFields(help, {
            selectedHit: () => Option.some(id),
            item: () => ItemState.Loading({ id }),
          }),
        ),
        commands: [FetchItem({ visit: model.visit, id })],
      })),

    SucceededFetchItem: ({ visit, id, item }) =>
      withHelpAt(model, visit, help =>
        ItemState.match<UpdateReturn>(help.item, {
          Loading: ({ id: pending }) => {
            if (pending !== id) {
              return { model }
            }
            return {
              model: putHelp(
                model,
                modifyFields(help, {
                  item: () =>
                    item === null
                      ? ItemState.NotFound({ id })
                      : ItemState.Loaded({ item }),
                }),
              ),
            }
          },
          Idle: () => ({ model }),
          Loaded: () => ({ model }),
          NotFound: () => ({ model }),
          Failed: () => ({ model }),
        }),
      ),

    FailedFetchItem: ({ visit, id, error }) =>
      withHelpAt(model, visit, help =>
        ItemState.match<UpdateReturn>(help.item, {
          Loading: ({ id: pending }) =>
            pending === id
              ? {
                  model: putHelp(
                    model,
                    modifyFields(help, {
                      item: () => ItemState.Failed({ id, error }),
                    }),
                  ),
                }
              : { model },
          Idle: () => ({ model }),
          Loaded: () => ({ model }),
          NotFound: () => ({ model }),
          Failed: () => ({ model }),
        }),
      ),

    ClickedRetryItem: () =>
      withHelp(model, help =>
        ItemState.match<UpdateReturn>(help.item, {
          Failed: ({ id }) => ({
            model: putHelp(
              model,
              modifyFields(help, { item: () => ItemState.Loading({ id }) }),
            ),
            commands: [FetchItem({ visit: model.visit, id })],
          }),
          Idle: () => ({ model }),
          Loading: () => ({ model }),
          Loaded: () => ({ model }),
          NotFound: () => ({ model }),
        }),
      ),

    SucceededLoadSettings: ({ visit, settings }) =>
      model.visit === visit
        ? {
            model: putSettingsLoad(model, () =>
              SettingsLoad.Loaded({
                saved: settings,
                draft: settings,
                save: SaveStatus.Idle(),
              }),
            ),
          }
        : { model },

    FailedLoadSettings: ({ visit, error }) =>
      model.visit === visit
        ? {
            model: putSettingsLoad(model, () => SettingsLoad.Failed({ error })),
          }
        : { model },

    ClickedRetryLoad: () =>
      SettingsLoad.match<UpdateReturn>(model.settings.load, {
        Failed: () => ({
          model: putSettingsLoad(model, () => SettingsLoad.Loading()),
          commands: [LoadSettings({ visit: model.visit })],
        }),
        Loading: () => ({ model }),
        Loaded: () => ({ model }),
      }),

    UpdatedDraftName: ({ value }) =>
      ({
        model: updateDraft(model, draft => modifyFields(draft, { name: () => value })),
      }),

    ClickedDraftTheme: ({ theme }) => ({
      model: updateDraft(model, draft => modifyFields(draft, { theme: () => theme })),
    }),

    ClickedDensityToggle: () => ({
      model: updateDraft(model, draft =>
        modifyFields(draft, {
          density: () => (draft.density === 'compact' ? 'comfortable' : 'compact'),
        }),
      ),
    }),

    ClickedSave: () =>
      SettingsLoad.match<UpdateReturn>(model.settings.load, {
        Loaded: ({ saved, draft }) => {
          if (Option.isSome(displayNameError(draft.name))) {
            return { model }
          }
          return {
            model: putSettingsLoad(model, () =>
              SettingsLoad.Loaded({
                saved,
                draft,
                save: SaveStatus.Saving({ settings: draft }),
              }),
            ),
            commands: [SaveSettings({ visit: model.visit, settings: draft })],
          }
        },
        Loading: () => ({ model }),
        Failed: () => ({ model }),
      }),

    SucceededSaveSettings: ({ visit, settings }) =>
      model.visit === visit
        ? {
            model: putSettingsLoad(model, load =>
              SettingsLoad.match<SettingsLoad>(load, {
                Loaded: ({ draft }) =>
                  SettingsLoad.Loaded({
                    saved: settings,
                    draft,
                    save: SaveStatus.Idle(),
                  }),
                Loading: () => load,
                Failed: () => load,
              }),
            ),
          }
        : { model },

    FailedSaveSettings: ({ visit, error }) =>
      model.visit === visit
        ? {
            model: putSettingsLoad(model, load =>
              SettingsLoad.match<SettingsLoad>(load, {
                Loaded: ({ saved, draft }) =>
                  SettingsLoad.Loaded({
                    saved,
                    draft,
                    save: SaveStatus.Failed({ error }),
                  }),
                Loading: () => load,
                Failed: () => load,
              }),
            ),
          }
        : { model },
  })
