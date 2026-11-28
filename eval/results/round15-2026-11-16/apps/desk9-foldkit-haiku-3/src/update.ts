import { Effect, Option, Schema } from 'effect'
import { AsyncData, Command, type Runtime, type Update } from 'foldkit'
import { modifyFields } from 'foldkit/struct'

import * as api from './api.js'
import { Message } from './message.js'
import {
  CommentRow,
  CommentsData,
  DetailData,
  Filter,
  HelpModel,
  HelpPane,
  HitResults,
  HitsData,
  IssueRows,
  IssuesModel,
  LabelRow,
  LabelsData,
  Model,
  Origin,
  Page,
  Removed,
  SelectedIssue,
  Settings,
  SettingsData,
  SettingsModel,
  SettingsForm,
  Hit,
  Issue,
  nameProblem,
} from './model.js'

// COMMAND

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

const attempt = <A, Succeeded, Failed>(
  run: () => Promise<A>,
  onSucceed: (value: A) => Succeeded,
  onFail: (error: string) => Failed,
): Effect.Effect<Succeeded | Failed> =>
  Effect.tryPromise({ try: run, catch: error => error }).pipe(
    Effect.map(onSucceed),
    Effect.catch(error => Effect.succeed(onFail(errorMessage(error)))),
  )

export const FetchIssues = Command.define('FetchIssues', {
  args: { generation: Schema.Number, filter: Filter },
  messages: [Message.SucceededFetchIssues, Message.FailedFetchIssues],
  execute: ({ generation, filter }) =>
    attempt(
      () => api.fetchIssues(filter),
      issues => Message.SucceededFetchIssues({ generation, filter, issues }),
      error => Message.FailedFetchIssues({ generation, filter, error }),
    ),
})

export const FetchIssue = Command.define('FetchIssue', {
  args: { generation: Schema.Number, id: Schema.Number },
  messages: [Message.SucceededFetchIssue, Message.FailedFetchIssue],
  execute: ({ generation, id }) =>
    attempt(
      () => api.fetchIssue(id),
      issue => Message.SucceededFetchIssue({ generation, id, issue }),
      error => Message.FailedFetchIssue({ generation, id, error }),
    ),
})

export const AssignIssue = Command.define('AssignIssue', {
  args: {
    generation: Schema.Number,
    id: Schema.Number,
    user: Schema.String,
    origin: Origin,
    previous: Schema.NullOr(Schema.String),
  },
  messages: [Message.SucceededAssignIssue, Message.FailedAssignIssue],
  execute: ({ generation, id, user, origin, previous }) =>
    attempt(
      () => api.assign(id, user),
      () => Message.SucceededAssignIssue({ generation, id }),
      error =>
        Message.FailedAssignIssue({ generation, id, origin, previous, error }),
    ),
})

export const RenameIssue = Command.define('RenameIssue', {
  args: {
    generation: Schema.Number,
    id: Schema.Number,
    title: Schema.String,
    previousTitle: Schema.String,
  },
  messages: [Message.SucceededRenameIssue, Message.FailedRenameIssue],
  execute: ({ generation, id, title, previousTitle }) =>
    attempt(
      () => api.renameIssue(id, title),
      () => Message.SucceededRenameIssue({ generation, id }),
      error =>
        Message.FailedRenameIssue({ generation, id, previousTitle, error }),
    ),
})

export const CloseIssue = Command.define('CloseIssue', {
  args: {
    generation: Schema.Number,
    id: Schema.Number,
    origin: Origin,
    removed: Schema.Option(Removed),
    openCount: Schema.Option(Schema.Number),
  },
  messages: [Message.SucceededCloseIssue, Message.FailedCloseIssue],
  execute: ({ generation, id, origin, removed, openCount }) =>
    attempt(
      () => api.closeIssue(id),
      () => Message.SucceededCloseIssue({ generation, id }),
      error =>
        Message.FailedCloseIssue({
          generation,
          id,
          origin,
          removed,
          openCount,
          error,
        }),
    ),
})

export const FetchComments = Command.define('FetchComments', {
  args: { generation: Schema.Number, id: Schema.Number },
  messages: [Message.SucceededFetchComments, Message.FailedFetchComments],
  execute: ({ generation, id }) =>
    attempt(
      () => api.fetchComments(id),
      comments => Message.SucceededFetchComments({ generation, id, comments }),
      error => Message.FailedFetchComments({ generation, id, error }),
    ),
})

export const PostComment = Command.define('PostComment', {
  args: {
    generation: Schema.Number,
    id: Schema.Number,
    commentId: Schema.Number,
    author: Schema.String,
    text: Schema.String,
  },
  messages: [Message.SucceededPostComment, Message.FailedPostComment],
  execute: ({ generation, id, commentId, author, text }) =>
    attempt(
      () => api.addComment(id, author, text),
      () => Message.SucceededPostComment({ generation, id, commentId }),
      error =>
        Message.FailedPostComment({ generation, id, commentId, error }),
    ),
})

export const FetchLabels = Command.define('FetchLabels', {
  args: { generation: Schema.Number, id: Schema.Number },
  messages: [Message.SucceededFetchLabels, Message.FailedFetchLabels],
  execute: ({ generation, id }) =>
    attempt(
      () => api.fetchLabels(id),
      labels => Message.SucceededFetchLabels({ generation, id, labels }),
      error => Message.FailedFetchLabels({ generation, id, error }),
    ),
})

export const AddLabel = Command.define('AddLabel', {
  args: {
    generation: Schema.Number,
    id: Schema.Number,
    labelId: Schema.Number,
    label: Schema.String,
  },
  messages: [Message.SucceededAddLabel, Message.FailedAddLabel],
  execute: ({ generation, id, labelId, label }) =>
    attempt(
      () => api.addLabel(id, label),
      () => Message.SucceededAddLabel({ generation, id }),
      error => Message.FailedAddLabel({ generation, id, labelId, error }),
    ),
})

export const RemoveLabel = Command.define('RemoveLabel', {
  args: {
    generation: Schema.Number,
    id: Schema.Number,
    row: LabelRow,
    index: Schema.Number,
  },
  messages: [Message.SucceededRemoveLabel, Message.FailedRemoveLabel],
  execute: ({ generation, id, row, index }) =>
    attempt(
      () => api.removeLabel(id, row.name),
      () => Message.SucceededRemoveLabel({ generation, id }),
      error => Message.FailedRemoveLabel({ generation, id, row, index, error }),
    ),
})

export const SearchRelated = Command.define('SearchRelated', {
  args: {
    generation: Schema.Number,
    id: Schema.Number,
    query: Schema.String,
  },
  messages: [Message.SucceededSearchRelated, Message.FailedSearchRelated],
  execute: ({ generation, id, query }) =>
    attempt(
      () => api.search(query),
      hits => Message.SucceededSearchRelated({ generation, id, hits }),
      error => Message.FailedSearchRelated({ generation, id, error }),
    ),
})

export const SearchHelp = Command.define('SearchHelp', {
  args: { generation: Schema.Number, query: Schema.String },
  messages: [Message.SucceededSearchHelp, Message.FailedSearchHelp],
  execute: ({ generation, query }) =>
    attempt(
      () => api.search(query),
      hits => Message.SucceededSearchHelp({ generation, query, hits }),
      error => Message.FailedSearchHelp({ generation, query, error }),
    ),
})

export const FetchHelpItem = Command.define('FetchHelpItem', {
  args: { generation: Schema.Number, id: Schema.Number },
  messages: [Message.SucceededFetchItem, Message.FailedFetchItem],
  execute: ({ generation, id }) =>
    attempt(
      () => api.fetchItem(id),
      item => Message.SucceededFetchItem({ generation, id, item }),
      error => Message.FailedFetchItem({ generation, id, error }),
    ),
})

export const LoadSettings = Command.define('LoadSettings', {
  args: { generation: Schema.Number },
  messages: [Message.SucceededLoadSettings, Message.FailedLoadSettings],
  execute: ({ generation }) =>
    attempt(
      () => api.loadSettings(),
      settings => Message.SucceededLoadSettings({ generation, settings }),
      error => Message.FailedLoadSettings({ generation, error }),
    ),
})

export const SaveSettings = Command.define('SaveSettings', {
  args: { generation: Schema.Number, settings: Settings },
  messages: [Message.SucceededSaveSettings, Message.FailedSaveSettings],
  execute: ({ generation, settings }) =>
    attempt(
      () => api.saveSettings(settings),
      saved => Message.SucceededSaveSettings({ generation, settings: saved }),
      error => Message.FailedSaveSettings({ generation, error }),
    ),
})

// INIT

const initialIssues = (): IssuesModel => ({
  user: 'guest',
  filter: 'open',
  list: IssueRows.Loading(),
  rowError: Option.none(),
  selected: Option.none(),
  nextId: 1,
})

export const init: Runtime.ApplicationInit<Model, Message> = () => ({
  model: {
    generation: 0,
    openCount: Option.none(),
    page: Page.IssuesPage({ issues: initialIssues() }),
  },
  commands: [FetchIssues({ generation: 0, filter: 'open' })],
})

// UPDATE

type IssuesStep = (model: Model, issues: IssuesModel) => Update.Return<Model, Message>
type HelpStep = (model: Model, help: HelpModel) => Update.Return<Model, Message>
type SettingsStep = (model: Model, settings: SettingsModel) => Update.Return<Model, Message>

const whenIssues = (
  model: Model,
  generation: number,
  step: IssuesStep,
): Update.Return<Model, Message> =>
  model.page._tag === 'IssuesPage' && model.generation === generation
    ? step(model, model.page.issues)
    : { model }

const whenHelp = (
  model: Model,
  generation: number,
  step: HelpStep,
): Update.Return<Model, Message> =>
  model.page._tag === 'HelpPage' && model.generation === generation
    ? step(model, model.page.help)
    : { model }

const whenSettings = (
  model: Model,
  generation: number,
  step: SettingsStep,
): Update.Return<Model, Message> =>
  model.page._tag === 'SettingsPage' && model.generation === generation
    ? step(model, model.page.settings)
    : { model }

const setIssues = (model: Model, issues: IssuesModel): Model =>
  modifyFields(model, { page: () => Page.IssuesPage({ issues }) })

const setHelp = (model: Model, help: HelpModel): Model =>
  modifyFields(model, { page: () => Page.HelpPage({ help }) })

const setForm = (model: Model, form: SettingsModel['form']): Model =>
  modifyFields(model, { page: () => Page.SettingsPage({ settings: { form } }) })

const selectedOf = (issues: IssuesModel): SelectedIssue | undefined =>
  Option.match(issues.selected, {
    onNone: () => undefined,
    onSome: selected => selected,
  })

const selectedFor = (
  issues: IssuesModel,
  id: number,
): SelectedIssue | undefined => {
  const selected = selectedOf(issues)
  return selected !== undefined && selected.id === id ? selected : undefined
}

const putSelected = (
  issues: IssuesModel,
  selected: SelectedIssue,
): IssuesModel => modifyFields(issues, { selected: () => Option.some(selected) })

const mapSelectedFor = (
  issues: IssuesModel,
  id: number,
  change: (selected: SelectedIssue) => SelectedIssue,
): IssuesModel => {
  const selected = selectedFor(issues, id)
  return selected === undefined ? issues : putSelected(issues, change(selected))
}

const mapRows = (
  issues: IssuesModel,
  change: (rows: ReadonlyArray<Issue>) => ReadonlyArray<Issue>,
): IssuesModel =>
  modifyFields(issues, {
    list: list =>
      AsyncData.isSuccess(list) ? IssueRows.Success({ data: change(list.data) }) : list,
  })

const rowOf = (issues: IssuesModel, id: number): Issue | undefined =>
  AsyncData.isSuccess(issues.list)
    ? issues.list.data.find(row => row.id === id)
    : undefined

const indexedRow = (
  issues: IssuesModel,
  id: number,
): Option.Option<typeof Removed.Type> => {
  if (issues.filter !== 'open' || !AsyncData.isSuccess(issues.list)) {
    return Option.none()
  }
  const rows = issues.list.data
  const issue = rows.find(row => row.id === id)
  const index = rows.findIndex(row => row.id === id)
  return issue === undefined ? Option.none() : Option.some({ index, issue })
}

const insertAt = <A>(
  items: ReadonlyArray<A>,
  index: number,
  item: A,
): ReadonlyArray<A> =>
  items.slice(0, index).concat([item], items.slice(index))

const paneId = (pane: typeof HelpPane.Type): number | undefined =>
  HelpPane.match(pane, {
    NoneSelected: (): number | undefined => undefined,
    Loading: ({ id }): number | undefined => id,
    Loaded: ({ item }): number | undefined => item.id,
    NotFound: ({ id }): number | undefined => id,
    Failed: ({ id }): number | undefined => id,
  })

const resultsFor = (
  query: string,
  shown: ReadonlyArray<Hit>,
): typeof HitResults.Type => {
  if (query.length === 0) {
    return HitResults.Idle()
  }
  if (query.length === 1) {
    return HitResults.TooShort({ query })
  }
  return HitResults.Searching({ query, shown })
}

const searchCommands = (generation: number, query: string) =>
  query.length >= 2 ? [SearchHelp({ generation, query })] : []

const shownHits = (results: typeof HitResults.Type): ReadonlyArray<Hit> =>
  HitResults.match(results, {
    Idle: (): ReadonlyArray<Hit> => [],
    TooShort: (): ReadonlyArray<Hit> => [],
    Searching: ({ shown }): ReadonlyArray<Hit> => shown,
    Found: ({ hits }): ReadonlyArray<Hit> => hits,
    Failed: (): ReadonlyArray<Hit> => [],
  })

const mapForm = (
  settings: SettingsModel,
  change: (form: SettingsForm) => SettingsForm,
): SettingsModel =>
  modifyFields(settings, {
    form: form =>
      AsyncData.isSuccess(form) ? SettingsData.Success({ data: change(form.data) }) : form,
  })

const openIssuesPage = (model: Model): Update.Return<Model, Message> => {
  if (model.page._tag === 'IssuesPage') {
    return { model }
  }
  const generation = model.generation + 1
  return {
    model: modifyFields(model, {
      generation: () => generation,
      page: () => Page.IssuesPage({ issues: initialIssues() }),
    }),
    commands: [FetchIssues({ generation, filter: 'open' })],
  }
}

const openHelpPage = (model: Model): Update.Return<Model, Message> => {
  if (model.page._tag === 'HelpPage') {
    return { model }
  }
  return {
    model: modifyFields(model, {
      generation: () => model.generation + 1,
      page: () =>
        Page.HelpPage({
          help: {
            query: '',
            results: HitResults.Idle(),
            pane: HelpPane.NoneSelected(),
          },
        }),
    }),
  }
}

const openSettingsPage = (model: Model): Update.Return<Model, Message> => {
  if (model.page._tag === 'SettingsPage') {
    return { model }
  }
  const generation = model.generation + 1
  return {
    model: modifyFields(model, {
      generation: () => generation,
      page: () =>
        Page.SettingsPage({ settings: { form: SettingsData.Loading() } }),
    }),
    commands: [LoadSettings({ generation })],
  }
}

const newSelected = (id: number): SelectedIssue => ({
  id,
  detail: DetailData.Loading(),
  titleInput: '',
  comments: CommentsData.Loading(),
  commentInput: '',
  labels: LabelsData.Loading(),
  labelInput: '',
  related: HitsData.Idle(),
  assignError: Option.none(),
  renameError: Option.none(),
  closeError: Option.none(),
  postError: Option.none(),
  labelError: Option.none(),
})

const startFilter = (
  model: Model,
  issues: IssuesModel,
  filter: Filter,
): Update.Return<Model, Message> => ({
  model: setIssues(
    model,
    modifyFields(issues, {
      filter: () => filter,
      list: () => IssueRows.Loading(),
    }),
  ),
  commands: [FetchIssues({ generation: model.generation, filter })],
})

const startAssign = (
  model: Model,
  issues: IssuesModel,
  id: number,
  origin: Origin,
): Update.Return<Model, Message> => {
  const row = rowOf(issues, id)
  const previous = row === undefined ? null : row.assignee
  const user = issues.user
  const assigned = mapRows(issues, rows =>
    rows.map(item =>
      item.id === id ? modifyFields(item, { assignee: () => user }) : item,
    ),
  )
  const cleared =
    origin === 'Detail'
      ? mapSelectedFor(assigned, id, selected =>
          modifyFields(selected, { assignError: () => Option.none() }),
        )
      : modifyFields(assigned, { rowError: () => Option.none() })
  return {
    model: setIssues(model, cleared),
    commands: [
      AssignIssue({ generation: model.generation, id, user, origin, previous }),
    ],
  }
}

const startRename = (
  model: Model,
  issues: IssuesModel,
  selected: SelectedIssue,
): Update.Return<Model, Message> => {
  const detail = AsyncData.isSuccess(selected.detail) ? selected.detail.data : null
  const title = selected.titleInput.trim()
  if (detail === null || title.length === 0) {
    return { model }
  }
  const previousTitle = detail.title
  const id = selected.id
  const renamed = mapRows(issues, rows =>
    rows.map(item =>
      item.id === id ? modifyFields(item, { title: () => title }) : item,
    ),
  )
  const withDetail = putSelected(
    renamed,
    modifyFields(selected, {
      detail: () =>
        DetailData.Success({ data: modifyFields(detail, { title: () => title }) }),
      renameError: () => Option.none(),
    }),
  )
  return {
    model: setIssues(model, withDetail),
    commands: [
      RenameIssue({ generation: model.generation, id, title, previousTitle }),
    ],
  }
}

const startClose = (
  model: Model,
  issues: IssuesModel,
  id: number,
  origin: Origin,
): Update.Return<Model, Message> => {
  const removed = indexedRow(issues, id)
  const isRemoved = Option.isSome(removed)
  const without = isRemoved
    ? mapRows(issues, rows => rows.filter(item => item.id !== id))
    : issues
  const cleared =
    origin === 'Detail'
      ? mapSelectedFor(without, id, selected =>
          modifyFields(selected, { closeError: () => Option.none() }),
        )
      : modifyFields(without, { rowError: () => Option.none() })
  return {
    model: modifyFields(setIssues(model, cleared), {
      openCount: () =>
        isRemoved ? Option.map(model.openCount, count => count - 1) : model.openCount,
    }),
    commands: [
      CloseIssue({
        generation: model.generation,
        id,
        origin,
        removed,
        openCount: model.openCount,
      }),
    ],
  }
}

export const update = (model: Model, message: Message): Update.Return<Model, Message> =>
  Message.match<Update.Return<Model, Message>>(message, {
    ClickedTabIssues: () => openIssuesPage(model),
    ClickedTabHelp: () => openHelpPage(model),
    ClickedTabSettings: () => openSettingsPage(model),

    UpdatedUser: ({ value }) =>
      whenIssues(model, model.generation, (current, issues) => ({
        model: setIssues(current, modifyFields(issues, { user: () => value })),
      })),

    ClickedFilter: ({ filter }) =>
      whenIssues(model, model.generation, (current, issues) =>
        issues.filter === filter
          ? { model: current }
          : startFilter(current, issues, filter),
      ),

    SucceededFetchIssues: ({ generation, filter, issues }) =>
      whenIssues(model, generation, (current, page) => {
        if (page.filter !== filter) {
          return { model: current }
        }
        return {
          model: modifyFields(
            setIssues(
              current,
              modifyFields(page, { list: () => IssueRows.Success({ data: issues }) }),
            ),
            {
              openCount: () =>
                filter === 'open' ? Option.some(issues.length) : current.openCount,
            },
          ),
        }
      }),

    FailedFetchIssues: ({ generation, filter, error }) =>
      whenIssues(model, generation, (current, page) =>
        page.filter !== filter
          ? { model: current }
          : {
              model: setIssues(
                current,
                modifyFields(page, { list: () => IssueRows.Failure({ error }) }),
              ),
            },
      ),

    SelectedIssue: ({ id }) =>
      whenIssues(model, model.generation, (current, issues) => ({
        model: setIssues(
          current,
          modifyFields(issues, { selected: () => Option.some(newSelected(id)) }),
        ),
        commands: [
          FetchIssue({ generation: current.generation, id }),
          FetchComments({ generation: current.generation, id }),
          FetchLabels({ generation: current.generation, id }),
        ],
      })),

    SucceededFetchIssue: ({ generation, id, issue }) =>
      whenIssues(model, generation, (current, issues) => {
        if (selectedFor(issues, id) === undefined) {
          return { model: current }
        }
        const next = mapSelectedFor(issues, id, selected =>
          modifyFields(selected, {
            detail: () => DetailData.Success({ data: issue }),
            related: () => (issue === null ? HitsData.Idle() : HitsData.Loading()),
          }),
        )
        if (issue === null) {
          return { model: setIssues(current, next) }
        }
        return {
          model: setIssues(current, next),
          commands: [
            SearchRelated({ generation, id, query: issue.title }),
          ],
        }
      }),

    FailedFetchIssue: ({ generation, id, error }) =>
      whenIssues(model, generation, (current, issues) => ({
        model: setIssues(
          current,
          mapSelectedFor(issues, id, selected =>
            modifyFields(selected, { detail: () => DetailData.Failure({ error }) }),
          ),
        ),
      })),

    ClickedRetryIssue: () =>
      whenIssues(model, model.generation, (current, issues) => {
        const selected = selectedOf(issues)
        if (selected === undefined) {
          return { model: current }
        }
        const id = selected.id
        return {
          model: setIssues(
            current,
            mapSelectedFor(issues, id, item =>
              modifyFields(item, { detail: () => DetailData.Loading() }),
            ),
          ),
          commands: [FetchIssue({ generation: current.generation, id })],
        }
      }),

    UpdatedTitleInput: ({ value }) =>
      whenIssues(model, model.generation, (current, issues) => {
        const selected = selectedOf(issues)
        if (selected === undefined) {
          return { model: current }
        }
        return {
          model: setIssues(
            current,
            putSelected(issues, modifyFields(selected, { titleInput: () => value })),
          ),
        }
      }),

    ClickedRename: () =>

      whenIssues(model, model.generation, (current, issues) => {
        const selected = selectedOf(issues)
        if (selected === undefined) {
          return { model: current }
        }
        return startRename(current, issues, selected)
      }),

    SucceededRenameIssue: ({ generation }) =>
      whenIssues(model, generation, current => ({ model: current })),

    FailedRenameIssue: ({ generation, id, previousTitle, error }) =>
      whenIssues(model, generation, (current, issues) => {
        const restored = mapRows(issues, rows =>
          rows.map(item =>
            item.id === id ? modifyFields(item, { title: () => previousTitle }) : item,
          ),
        )
        const withDetail = mapSelectedFor(restored, id, selected =>
          modifyFields(selected, {
            detail: () =>
              AsyncData.isSuccess(selected.detail) && selected.detail.data !== null
                ? DetailData.Success({
                    data: modifyFields(selected.detail.data, {
                      title: () => previousTitle,
                    }),
                  })
                : selected.detail,
            renameError: () => Option.some(`rename error: ${error}`),
          }),
        )
        return { model: setIssues(current, withDetail) }
      }),

    ClickedAssign: () =>
      whenIssues(model, model.generation, (current, issues) => {
        const selected = selectedOf(issues)
        if (selected === undefined) {
          return { model: current }
        }
        return startAssign(current, issues, selected.id, 'Detail')
      }),

    ClickedRowAssign: ({ id }) =>
      whenIssues(model, model.generation, (current, issues) =>
        startAssign(current, issues, id, 'Row'),
      ),

    SucceededAssignIssue: ({ generation }) =>
      whenIssues(model, generation, current => ({ model: current })),

    FailedAssignIssue: ({ generation, id, origin, previous, error }) =>
      whenIssues(model, generation, (current, issues) => {
        const restored = mapRows(issues, rows =>
          rows.map(item =>
            item.id === id ? modifyFields(item, { assignee: () => previous }) : item,
          ),
        )
        const withError =
          origin === 'Detail'
            ? mapSelectedFor(restored, id, selected =>
                modifyFields(selected, {
                  assignError: () => Option.some(`assign error: ${error}`),
                }),
              )
            : modifyFields(restored, {
                rowError: () => Option.some(`row error: ${error}`),
              })
        return { model: setIssues(current, withError) }
      }),

    ClickedClose: () =>
      whenIssues(model, model.generation, (current, issues) => {
        const selected = selectedOf(issues)
        if (selected === undefined) {
          return { model: current }
        }
        return startClose(current, issues, selected.id, 'Detail')
      }),

    ClickedRowClose: ({ id }) =>
      whenIssues(model, model.generation, (current, issues) =>
        startClose(current, issues, id, 'Row'),
      ),

    SucceededCloseIssue: ({ generation }) =>
      whenIssues(model, generation, current => ({ model: current })),

    FailedCloseIssue: ({ generation, id, origin, removed, openCount, error }) => {
      const restoredCount = Option.isSome(removed)
        ? modifyFields(model, { openCount: () => openCount })
        : model
      return whenIssues(restoredCount, generation, (current, issues) => {
        const reinserted = Option.match(removed, {
          onNone: () => issues,
          onSome: ({ index, issue }) =>
            AsyncData.isSuccess(issues.list) &&
            issues.filter === 'open' &&
            !issues.list.data.some(item => item.id === issue.id)
              ? mapRows(issues, rows => insertAt(rows, index, issue))
              : issues,
        })
        const withError =
          origin === 'Detail'
            ? mapSelectedFor(reinserted, id, selected =>
                modifyFields(selected, {
                  closeError: () => Option.some(`close error: ${error}`),
                }),
              )
            : modifyFields(reinserted, {
                rowError: () => Option.some(`row error: ${error}`),
              })
        return { model: setIssues(current, withError) }
      })
    },

    UpdatedCommentInput: ({ value }) =>
      whenIssues(model, model.generation, (current, issues) => {
        const selected = selectedOf(issues)
        if (selected === undefined) {
          return { model: current }
        }
        return {
          model: setIssues(
            current,
            putSelected(issues, modifyFields(selected, { commentInput: () => value })),
          ),
        }
      }),

    ClickedPost: () =>
      whenIssues(model, model.generation, (current, issues) => {
        const selected = selectedOf(issues)
        if (
          selected === undefined ||
          !AsyncData.isSuccess(selected.comments) ||
          selected.commentInput.trim().length === 0
        ) {
          return { model: current }
        }
        const text = selected.commentInput.trim()
        const commentId = issues.nextId
        const row: CommentRow = {
          id: commentId,
          author: issues.user,
          text,
          status: 'Sending',
        }
        const existing = selected.comments.data
        const posted = modifyFields(selected, {
          commentInput: () => '',
          postError: () => Option.none(),
          comments: () => CommentsData.Success({ data: existing.concat([row]) }),
        })
        return {
          model: setIssues(
            current,
            modifyFields(putSelected(issues, posted), {
              nextId: () => issues.nextId + 1,
            }),
          ),
          commands: [
            PostComment({
              generation: current.generation,
              id: selected.id,
              commentId,
              author: issues.user,
              text,
            }),
          ],
        }
      }),

    SucceededPostComment: ({ generation, id, commentId }) =>
      whenIssues(model, generation, (current, issues) => ({
        model: setIssues(
          current,
          mapSelectedFor(issues, id, selected =>
            modifyFields(selected, {
              comments: comments =>
                AsyncData.isSuccess(comments)
                  ? CommentsData.Success({
                      data: comments.data.map(row =>
                        row.id === commentId
                          ? modifyFields(row, { status: () => 'Sent' })
                          : row,
                      ),
                    })
                  : comments,
            }),
          ),
        ),
      })),

    FailedPostComment: ({ generation, id, commentId, error }) =>
      whenIssues(model, generation, (current, issues) => ({
        model: setIssues(
          current,
          mapSelectedFor(issues, id, selected =>
            modifyFields(selected, {
              comments: comments =>
                AsyncData.isSuccess(comments)
                  ? CommentsData.Success({
                      data: comments.data.filter(row => row.id !== commentId),
                    })
                  : comments,
              postError: () => Option.some(`post error: ${error}`),
            }),
          ),
        ),
      })),

    SucceededFetchComments: ({ generation, id, comments }) =>
      whenIssues(model, generation, (current, issues) => ({
        model: setIssues(
          current,
          modifyFields(
            mapSelectedFor(issues, id, selected =>
              modifyFields(selected, {
                comments: () =>
                  CommentsData.Success({
                    data: comments.map((comment, index) => ({
                      id: issues.nextId + index,
                      author: comment.author,
                      text: comment.text,
                      status: 'Sent',
                    })),
                  }),
              }),
            ),
            { nextId: () => issues.nextId + comments.length },
          ),
        ),
      })),

    FailedFetchComments: ({ generation, id, error }) =>



      whenIssues(model, generation, (current, issues) => ({
        model: setIssues(
          current,
          mapSelectedFor(issues, id, selected =>
            modifyFields(selected, {
              comments: () => CommentsData.Failure({ error }),
            }),
          ),
        ),
      })),

    UpdatedLabelInput: ({ value }) =>
      whenIssues(model, model.generation, (current, issues) => {
        const selected = selectedOf(issues)
        if (selected === undefined) {
          return { model: current }
        }
        return {
          model: setIssues(
            current,
            putSelected(issues, modifyFields(selected, { labelInput: () => value })),
          ),
        }
      }),

    ClickedAddLabel: () =>
      whenIssues(model, model.generation, (current, issues) => {
        const selected = selectedOf(issues)
        const label = selected === undefined ? '' : selected.labelInput.trim()
        if (
          selected === undefined ||
          !AsyncData.isSuccess(selected.labels) ||
          label.length === 0 ||
          selected.labels.data.some(row => row.name === label)
        ) {
          return { model: current }
        }
        const labelId = issues.nextId
        const existing = selected.labels.data
        const added = modifyFields(selected, {
          labelInput: () => '',
          labelError: () => Option.none(),
          labels: () =>
            LabelsData.Success({
              data: existing.concat([{ id: labelId, name: label }]),
            }),
        })
        return {
          model: setIssues(
            current,
            modifyFields(putSelected(issues, added), {
              nextId: () => issues.nextId + 1,
            }),
          ),
          commands: [
            AddLabel({
              generation: current.generation,
              id: selected.id,
              labelId,
              label,
            }),
          ],
        }
      }),

    SucceededAddLabel: ({ generation }) =>
      whenIssues(model, generation, current => ({ model: current })),

    FailedAddLabel: ({ generation, id, labelId, error }) =>
      whenIssues(model, generation, (current, issues) => ({
        model: setIssues(
          current,
          mapSelectedFor(issues, id, selected =>
            modifyFields(selected, {
              labels: labels =>
                AsyncData.isSuccess(labels)
                  ? LabelsData.Success({
                      data: labels.data.filter(row => row.id !== labelId),
                    })
                  : labels,
              labelError: () => Option.some(`label error: ${error}`),
            }),
          ),
        ),
      })),

    ClickedRemoveLabel: ({ labelId }) =>
      whenIssues(model, model.generation, (current, issues) => {
        const selected = selectedOf(issues)
        if (selected === undefined || !AsyncData.isSuccess(selected.labels)) {
          return { model: current }
        }
        const rows = selected.labels.data
        const row = rows.find(item => item.id === labelId)
        if (row === undefined) {
          return { model: current }
        }
        const index = rows.findIndex(item => item.id === labelId)
        const removed = modifyFields(selected, {
          labelError: () => Option.none(),
          labels: () =>
            LabelsData.Success({
              data: rows.filter(item => item.id !== labelId),
            }),
        })
        return {
          model: setIssues(current, putSelected(issues, removed)),
          commands: [
            RemoveLabel({
              generation: current.generation,
              id: selected.id,
              row,
              index,
            }),
          ],
        }
      }),

    SucceededRemoveLabel: ({ generation }) =>
      whenIssues(model, generation, current => ({ model: current })),

    FailedRemoveLabel: ({ generation, id, row, index, error }) =>
      whenIssues(model, generation, (current, issues) => ({
        model: setIssues(
          current,
          mapSelectedFor(issues, id, selected =>
            modifyFields(selected, {
              labels: labels =>
                AsyncData.isSuccess(labels) && !labels.data.some(item => item.id === row.id)
                  ? LabelsData.Success({
                      data: insertAt(labels.data, index, row),
                    })
                  : labels,
              labelError: () => Option.some(`label error: ${error}`),
            }),
          ),
        ),
      })),

    SucceededFetchLabels: ({ generation, id, labels }) =>
      whenIssues(model, generation, (current, issues) => ({
        model: setIssues(
          current,
          modifyFields(
            mapSelectedFor(issues, id, selected =>
              modifyFields(selected, {
                labels: () =>
                  LabelsData.Success({
                    data: labels.map((name, index) => ({
                      id: issues.nextId + index,
                      name,
                    })),
                  }),
              }),
            ),
            { nextId: () => issues.nextId + labels.length },
          ),
        ),
      })),

    FailedFetchLabels: ({ generation, id, error }) =>


      whenIssues(model, generation, (current, issues) => ({
        model: setIssues(
          current,
          mapSelectedFor(issues, id, selected =>
            modifyFields(selected, {
              labels: () => LabelsData.Failure({ error }),
            }),
          ),
        ),
      })),

    SucceededSearchRelated: ({ generation, id, hits }) =>
      whenIssues(model, generation, (current, issues) => ({
        model: setIssues(
          current,
          mapSelectedFor(issues, id, selected =>
            modifyFields(selected, { related: () => HitsData.Success({ data: hits }) }),
          ),
        ),
      })),

    FailedSearchRelated: ({ generation, id, error }) =>
      whenIssues(model, generation, (current, issues) => ({
        model: setIssues(
          current,
          mapSelectedFor(issues, id, selected =>
            modifyFields(selected, { related: () => HitsData.Failure({ error }) }),
          ),
        ),
      })),

    ClickedRelatedHit: ({ id, query }) => {
      const generation = model.generation + 1
      return {
        model: modifyFields(model, {
          generation: () => generation,
          page: () =>
            Page.HelpPage({
              help: {
                query,
                results: resultsFor(query, []),
                pane: HelpPane.Loading({ id }),
              },
            }),
        }),
        commands: [
          ...searchCommands(generation, query),
          FetchHelpItem({ generation, id }),
        ],
      }
    },

    UpdatedQuery: ({ value }) =>
      whenHelp(model, model.generation, (current, help) => ({
        model: setHelp(
          current,
          modifyFields(help, {
            query: () => value,
            results: () => resultsFor(value, shownHits(help.results)),
          }),
        ),
        commands: searchCommands(current.generation, value),
      })),

    SucceededSearchHelp: ({ generation, query, hits }) =>
      whenHelp(model, generation, (current, help) =>
        help.query !== query
          ? { model: current }
          : {
              model: setHelp(
                current,
                modifyFields(help, {
                  results: () => HitResults.Found({ query, hits }),
                }),
              ),
            },
      ),

    FailedSearchHelp: ({ generation, query, error }) =>
      whenHelp(model, generation, (current, help) =>
        help.query !== query
          ? { model: current }
          : {
              model: setHelp(
                current,
                modifyFields(help, {
                  results: () => HitResults.Failed({ query, error }),
                }),
              ),
            },
      ),

    SelectedHit: ({ id }) =>
      whenHelp(model, model.generation, (current, help) => ({
        model: setHelp(
          current,
          modifyFields(help, { pane: () => HelpPane.Loading({ id }) }),
        ),
        commands: [FetchHelpItem({ generation: current.generation, id })],
      })),

    ClickedRetryItem: () =>
      whenHelp(model, model.generation, (current, help) => {
        const id = paneId(help.pane)
        if (id === undefined) {
          return { model: current }
        }
        return {
          model: setHelp(
            current,
            modifyFields(help, { pane: () => HelpPane.Loading({ id }) }),
          ),
          commands: [FetchHelpItem({ generation: current.generation, id })],
        }
      }),

    SucceededFetchItem: ({ generation, id, item }) =>
      whenHelp(model, generation, (current, help) =>
        paneId(help.pane) !== id
          ? { model: current }
          : {
              model: setHelp(
                current,
                modifyFields(help, {
                  pane: () =>
                    item === null
                      ? HelpPane.NotFound({ id })
                      : HelpPane.Loaded({ item }),
                }),
              ),
            },
      ),

    FailedFetchItem: ({ generation, id, error }) =>
      whenHelp(model, generation, (current, help) =>
        paneId(help.pane) !== id
          ? { model: current }
          : {
              model: setHelp(
                current,
                modifyFields(help, {
                  pane: () => HelpPane.Failed({ id, error }),
                }),
              ),
            },
      ),

    SucceededLoadSettings: ({ generation, settings }) =>
      whenSettings(model, generation, current => ({
        model: setForm(
          current,
          SettingsData.Success({
            data: {
              saved: settings,
              saving: Option.none(),
              draft: settings,
              saveError: Option.none(),
            },
          }),
        ),
      })),

    FailedLoadSettings: ({ generation, error }) =>
      whenSettings(model, generation, current => ({
        model: setForm(current, SettingsData.Failure({ error })),
      })),

    ClickedRetryLoad: () =>
      whenSettings(model, model.generation, (current, settings) => {
        if (!AsyncData.isFailure(settings.form)) {
          return { model: current }
        }
        return {
          model: setForm(current, SettingsData.Loading()),
          commands: [LoadSettings({ generation: current.generation })],
        }
      }),

    UpdatedName: ({ value }) =>
      whenSettings(model, model.generation, (current, settings) => ({
        model: setForm(
          current,
          AsyncData.isSuccess(settings.form)
            ? SettingsData.Success({
                data: modifyFields(settings.form.data, {
                  draft: draft => modifyFields(draft, { name: () => value }),
                }),
              })
            : settings.form,
        ),
      })),

    ClickedTheme: ({ theme }) =>
      whenSettings(model, model.generation, (current, settings) => ({
        model: setForm(
          current,
          AsyncData.isSuccess(settings.form)
            ? SettingsData.Success({
                data: modifyFields(settings.form.data, {
                  draft: draft => modifyFields(draft, { theme: () => theme }),
                }),
              })
            : settings.form,
        ),
      })),

    ClickedDensityToggle: () =>
      whenSettings(model, model.generation, (current, settings) => ({
        model: setForm(
          current,
          AsyncData.isSuccess(settings.form)
            ? SettingsData.Success({
                data: modifyFields(settings.form.data, {
                  draft: draft =>
                    modifyFields(draft, {
                      density: () =>
                        draft.density === 'compact' ? 'comfortable' : 'compact',
                    }),
                }),
              })
            : settings.form,
        ),
      })),

    ClickedSave: () =>
      whenSettings(model, model.generation, (current, settings) => {
        if (!AsyncData.isSuccess(settings.form)) {
          return { model: current }
        }
        const form = settings.form.data
        if (Option.isSome(nameProblem(form.draft.name))) {
          return { model: current }
        }
        return {
          model: setForm(
            current,
            SettingsData.Success({
              data: modifyFields(form, {
                saving: () => Option.some(form.draft),
                saveError: () => Option.none(),
              }),
            }),
          ),
          commands: [
            SaveSettings({
              generation: current.generation,
              settings: form.draft,
            }),
          ],
        }
      }),

    SucceededSaveSettings: ({ generation, settings }) =>
      whenSettings(model, generation, (current, page) =>
        AsyncData.isSuccess(page.form)
          ? {
              model: setForm(
                current,
                SettingsData.Success({
                  data: modifyFields(page.form.data, {
                    saved: () => settings,
                    saving: () => Option.none(),
                    saveError: () => Option.none(),
                  }),
                }),
              ),
            }
          : { model: current },
      ),

    FailedSaveSettings: ({ generation, error }) =>
      whenSettings(model, generation, (current, page) =>
        AsyncData.isSuccess(page.form)
          ? {
              model: setForm(
                current,
                SettingsData.Success({
                  data: modifyFields(page.form.data, {
                    saving: () => Option.none(),
                    saveError: () => Option.some(`Save failed: ${error}`),
                  }),
                }),
              ),
            }
          : { model: current },
      ),
  })

