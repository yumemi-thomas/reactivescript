import { Array, Effect, Option, Schema } from 'effect'
import { Command, type Runtime, type Update } from 'foldkit'
import { modifyFields } from 'foldkit/struct'

import * as Api from './api.js'
import { Message } from './message'
import {
  Comment,
  CommentEntry,
  CommentsLoad,
  DetailLoad,
  Filter,
  HelpPage,
  HelpResults,
  IssueList,
  IssueRow,
  IssuesPage,
  IssueSummary,
  ItemPane,
  LabelEntry,
  LabelsLoad,
  Model,
  Origin,
  RelatedHelp,
  SaveState,
  Selection,
  Settings,
  SettingsLoad,
  SettingsPage,
  Tab,
  Theme,
  Density,
  IssueRowStatus,
  Hit,
} from './model'

export { Message, Model }
export { view } from './view'

// COMMAND

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

const toIssueSummary = (issue: Api.Issue): IssueSummary => ({
  id: issue.id,
  title: issue.title,
  maybeAssignee: Option.fromNullOr(issue.assignee),
})

export const FetchIssues = Command.define('FetchIssues', {
  args: { serial: Schema.Number, filter: Filter },
  messages: [Message.SucceededFetchIssues, Message.FailedFetchIssues],
  execute: ({ serial, filter }) =>
    Effect.tryPromise({ try: () => Api.fetchIssues(filter), catch: error => error }).pipe(
      Effect.map(issues =>
        Message.SucceededFetchIssues({
          serial,
          filter,
          issues: issues.map(toIssueSummary),
        }),
      ),
      Effect.catch(error =>
        Effect.succeed(
          Message.FailedFetchIssues({
            serial,
            filter,
            error: errorMessage(error),
          }),
        ),
      ),
    ),
})

export const FetchIssue = Command.define('FetchIssue', {
  args: { serial: Schema.Number, id: Schema.Number },
  messages: [Message.SucceededFetchIssue, Message.FailedFetchIssue],
  execute: ({ serial, id }) =>
    Effect.tryPromise({ try: () => Api.fetchIssue(id), catch: error => error }).pipe(
      Effect.map(issue =>
        Message.SucceededFetchIssue({
          serial,
          id,
          maybeIssue: Option.fromNullOr(issue),
        }),
      ),
      Effect.catch(error =>
        Effect.succeed(
          Message.FailedFetchIssue({ serial, id, error: errorMessage(error) }),
        ),
      ),
    ),
})

export const AssignIssue = Command.define('AssignIssue', {
  args: {
    serial: Schema.Number,
    id: Schema.Number,
    user: Schema.String,
    maybePrevious: Schema.Option(Schema.String),
    origin: Origin,
  },
  messages: [Message.SucceededAssignIssue, Message.FailedAssignIssue],
  execute: ({ serial, id, user, maybePrevious, origin }) =>
    Effect.tryPromise({ try: () => Api.assign(id, user), catch: error => error }).pipe(
      Effect.map(() => Message.SucceededAssignIssue({ serial, id })),
      Effect.catch(error =>
        Effect.succeed(
          Message.FailedAssignIssue({
            serial,
            id,
            origin,
            maybePrevious,
            error: errorMessage(error),
          }),
        ),
      ),
    ),
})

export const RenameIssue = Command.define('RenameIssue', {
  args: {
    serial: Schema.Number,
    id: Schema.Number,
    title: Schema.String,
    previous: Schema.String,
  },
  messages: [Message.SucceededRenameIssue, Message.FailedRenameIssue],
  execute: ({ serial, id, title, previous }) =>
    Effect.tryPromise({ try: () => Api.renameIssue(id, title), catch: error => error }).pipe(
      Effect.map(() => Message.SucceededRenameIssue({ serial, id })),
      Effect.catch(error =>
        Effect.succeed(
          Message.FailedRenameIssue({
            serial,
            id,
            previous,
            error: errorMessage(error),
          }),
        ),
      ),
    ),
})

export const CloseIssue = Command.define('CloseIssue', {
  args: { serial: Schema.Number, id: Schema.Number, origin: Origin },
  messages: [Message.SucceededCloseIssue, Message.FailedCloseIssue],
  execute: ({ serial, id, origin }) =>
    Effect.tryPromise({ try: () => Api.closeIssue(id), catch: error => error }).pipe(
      Effect.map(() => Message.SucceededCloseIssue({ serial, id })),
      Effect.catch(error =>
        Effect.succeed(
          Message.FailedCloseIssue({
            serial,
            id,
            origin,
            error: errorMessage(error),
          }),
        ),
      ),
    ),
})

export const FetchComments = Command.define('FetchComments', {
  args: { serial: Schema.Number, id: Schema.Number },
  messages: [Message.SucceededFetchComments, Message.FailedFetchComments],
  execute: ({ serial, id }) =>
    Effect.tryPromise({ try: () => Api.fetchComments(id), catch: error => error }).pipe(
      Effect.map(comments =>
        Message.SucceededFetchComments({ serial, id, comments }),
      ),
      Effect.catch(error =>
        Effect.succeed(
          Message.FailedFetchComments({ serial, id, error: errorMessage(error) }),
        ),
      ),
    ),
})

export const AddComment = Command.define('AddComment', {
  args: {
    serial: Schema.Number,
    id: Schema.Number,
    author: Schema.String,
    text: Schema.String,
  },
  messages: [Message.SucceededAddComment, Message.FailedAddComment],
  execute: ({ serial, id, author, text }) =>
    Effect.tryPromise({ try: () => Api.addComment(id, author, text), catch: error => error }).pipe(
      Effect.map(() => Message.SucceededAddComment({ serial, id, text })),
      Effect.catch(error =>
        Effect.succeed(
          Message.FailedAddComment({
            serial,
            id,
            text,
            error: errorMessage(error),
          }),
        ),
      ),
    ),
})

export const FetchLabels = Command.define('FetchLabels', {
  args: { serial: Schema.Number, id: Schema.Number },
  messages: [Message.SucceededFetchLabels, Message.FailedFetchLabels],
  execute: ({ serial, id }) =>
    Effect.tryPromise({ try: () => Api.fetchLabels(id), catch: error => error }).pipe(
      Effect.map(labels => Message.SucceededFetchLabels({ serial, id, labels })),
      Effect.catch(error =>
        Effect.succeed(
          Message.FailedFetchLabels({ serial, id, error: errorMessage(error) }),
        ),
      ),
    ),
})

export const AddLabel = Command.define('AddLabel', {
  args: { serial: Schema.Number, id: Schema.Number, label: Schema.String },
  messages: [Message.SucceededAddLabel, Message.FailedAddLabel],
  execute: ({ serial, id, label }) =>
    Effect.tryPromise({ try: () => Api.addLabel(id, label), catch: error => error }).pipe(
      Effect.map(() => Message.SucceededAddLabel({ serial, id, label })),
      Effect.catch(error =>
        Effect.succeed(
          Message.FailedAddLabel({
            serial,
            id,
            label,
            error: errorMessage(error),
          }),
        ),
      ),
    ),
})

export const RemoveLabel = Command.define('RemoveLabel', {
  args: { serial: Schema.Number, id: Schema.Number, label: Schema.String },
  messages: [Message.SucceededRemoveLabel, Message.FailedRemoveLabel],
  execute: ({ serial, id, label }) =>
    Effect.tryPromise({ try: () => Api.removeLabel(id, label), catch: error => error }).pipe(
      Effect.map(() => Message.SucceededRemoveLabel({ serial, id, label })),
      Effect.catch(error =>
        Effect.succeed(
          Message.FailedRemoveLabel({
            serial,
            id,
            label,
            error: errorMessage(error),
          }),
        ),
      ),
    ),
})

export const SearchRelated = Command.define('SearchRelated', {
  args: { serial: Schema.Number, id: Schema.Number, query: Schema.String },
  messages: [Message.SucceededSearchRelated, Message.FailedSearchRelated],
  execute: ({ serial, id, query }) =>
    Effect.tryPromise({ try: () => Api.search(query), catch: error => error }).pipe(
      Effect.map(hits => Message.SucceededSearchRelated({ serial, id, hits })),
      Effect.catch(error =>
        Effect.succeed(
          Message.FailedSearchRelated({ serial, id, error: errorMessage(error) }),
        ),
      ),
    ),
})

export const SearchHelp = Command.define('SearchHelp', {
  args: { serial: Schema.Number, query: Schema.String },
  messages: [Message.SucceededSearchHelp, Message.FailedSearchHelp],
  execute: ({ serial, query }) =>
    Effect.tryPromise({ try: () => Api.search(query), catch: error => error }).pipe(
      Effect.map(hits => Message.SucceededSearchHelp({ serial, query, hits })),
      Effect.catch(error =>
        Effect.succeed(
          Message.FailedSearchHelp({ serial, query, error: errorMessage(error) }),
        ),
      ),
    ),
})

export const FetchHelpItem = Command.define('FetchHelpItem', {
  args: { serial: Schema.Number, id: Schema.Number },
  messages: [Message.SucceededFetchItem, Message.FailedFetchItem],
  execute: ({ serial, id }) =>
    Effect.tryPromise({ try: () => Api.fetchItem(id), catch: error => error }).pipe(
      Effect.map(item =>
        Message.SucceededFetchItem({
          serial,
          id,
          maybeItem: Option.fromNullOr(item),
        }),
      ),
      Effect.catch(error =>
        Effect.succeed(
          Message.FailedFetchItem({ serial, id, error: errorMessage(error) }),
        ),
      ),
    ),
})

export const LoadSettings = Command.define('LoadSettings', {
  args: { serial: Schema.Number },
  messages: [Message.SucceededLoadSettings, Message.FailedLoadSettings],
  execute: ({ serial }) =>
    Effect.tryPromise({ try: () => Api.loadSettings(), catch: error => error }).pipe(
      Effect.map(settings => Message.SucceededLoadSettings({ serial, settings })),
      Effect.catch(error =>
        Effect.succeed(
          Message.FailedLoadSettings({ serial, error: errorMessage(error) }),
        ),
      ),
    ),
})

export const SaveSettings = Command.define('SaveSettings', {
  args: { serial: Schema.Number, settings: Settings },
  messages: [Message.SucceededSaveSettings, Message.FailedSaveSettings],
  execute: ({ serial, settings }) =>
    Effect.tryPromise({ try: () => Api.saveSettings(settings), catch: error => error }).pipe(
      Effect.map(saved => Message.SucceededSaveSettings({ serial, settings: saved })),
      Effect.catch(error =>
        Effect.succeed(
          Message.FailedSaveSettings({ serial, error: errorMessage(error) }),
        ),
      ),
    ),
})

// INIT

const initialIssues = (): IssuesPage => ({
  user: 'guest',
  list: IssueList.Loading({ filter: 'open' }),
  selection: Selection.None(),
  maybeRowError: Option.none(),
})

const initialHelp = (): HelpPage => ({
  query: '',
  results: HelpResults.Empty(),
  pane: ItemPane.NoPick(),
})

const initialSettings = (): SettingsPage => ({
  load: SettingsLoad.Loading(),
})

const shownRow = (issue: IssueSummary): IssueRow => ({
  id: issue.id,
  title: issue.title,
  maybeAssignee: issue.maybeAssignee,
  status: 'Shown',
})

const sentComment = (comment: Comment): CommentEntry => ({
  author: comment.author,
  text: comment.text,
  status: 'Sent',
})

const shownLabel = (name: string): LabelEntry => ({ name, status: 'Shown' })

export const init: Runtime.ApplicationInit<Model, Message> = () => ({
  model: {
    serial: 0,
    tab: Tab.Issues(),
    maybeOpenCount: Option.none(),
    issues: initialIssues(),
    help: initialHelp(),
    settings: initialSettings(),
  },
  commands: [FetchIssues({ serial: 0, filter: 'open' })],
})

// UPDATE

type SelectedIssue = Extract<Selection, { readonly _tag: 'Selected' }>
type LoadedSettings = Extract<SettingsLoad, { readonly _tag: 'Loaded' }>

const newSelection = (id: number): Selection =>
  Selection.Selected({
    id,
    detail: DetailLoad.Loading(),
    renameDraft: '',
    commentDraft: '',
    labelDraft: '',
    comments: CommentsLoad.Loading(),
    labels: LabelsLoad.Loading(),
    related: RelatedHelp.Idle(),
    maybeAssignError: Option.none(),
    maybeRenameError: Option.none(),
    maybeCloseError: Option.none(),
    maybePostError: Option.none(),
    maybeLabelError: Option.none(),
  })

const withIssues = (model: Model, issues: IssuesPage): Model =>
  modifyFields(model, { issues: () => issues })

const withHelp = (model: Model, help: HelpPage): Model =>
  modifyFields(model, { help: () => help })

const issueListFilter = (list: IssueList): Filter =>
  IssueList.match<Filter>(list, {
    Loading: ({ filter }) => filter,
    Failed: ({ filter }) => filter,
    Loaded: ({ filter }) => filter,
  })

const maybeSelected = (issues: IssuesPage): Option.Option<SelectedIssue> =>
  Selection.matchOrElse(
    issues.selection,
    { Selected: selected => Option.some(selected) },
    () => Option.none(),
  )

const isSelectedId = (issues: IssuesPage, id: number): boolean =>
  Option.match(maybeSelected(issues), {
    onNone: () => false,
    onSome: selected => selected.id === id,
  })

const mapSelection = (
  issues: IssuesPage,
  f: (selected: SelectedIssue) => SelectedIssue,
): IssuesPage =>
  modifyFields(issues, {
    selection: selection =>
      Selection.matchOrElse(selection, { Selected: f }, () => selection),
  })

const mapSelected = (
  issues: IssuesPage,
  id: number,
  f: (selected: SelectedIssue) => SelectedIssue,
): IssuesPage =>
  mapSelection(issues, selected => (selected.id === id ? f(selected) : selected))

const maybeRow = (issues: IssuesPage, id: number): Option.Option<IssueRow> =>
  IssueList.matchOrElse(
    issues.list,
    { Loaded: ({ rows }) => Array.findFirst(rows, row => row.id === id) },
    () => Option.none(),
  )

const mapRows = (
  issues: IssuesPage,
  f: (row: IssueRow) => IssueRow,
): IssuesPage =>
  modifyFields(issues, {
    list: list =>
      IssueList.matchOrElse(
        list,
        {
          Loaded: ({ filter, rows }) =>
            IssueList.Loaded({ filter, rows: rows.map(f) }),
        },
        () => list,
      ),
  })

const mapRow = (
  issues: IssuesPage,
  id: number,
  f: (row: IssueRow) => IssueRow,
): IssuesPage => mapRows(issues, row => (row.id === id ? f(row) : row))

const setRowStatus = (
  issues: IssuesPage,
  id: number,
  status: IssueRowStatus,
): IssuesPage =>
  mapRows(issues, row =>
    row.id === id ? modifyFields(row, { status: () => status }) : row,
  )

const maybeOpenRows = (
  issues: IssuesPage,
): Option.Option<ReadonlyArray<IssueRow>> =>
  IssueList.matchOrElse(
    issues.list,
    {
      Loaded: ({ filter, rows }) =>
        filter === 'open' ? Option.some(rows) : Option.none(),
    },
    () => Option.none(),
  )

const syncOpenCount = (model: Model): Model => {
  if (!Tab.guards.Issues(model.tab)) {
    return model
  }
  return Option.match(maybeOpenRows(model.issues), {
    onNone: () => model,
    onSome: rows =>
      modifyFields(model, {
        maybeOpenCount: () =>
          Option.some(rows.filter(row => row.status === 'Shown').length),
      }),
  })
}

const titleOf = (issues: IssuesPage, selected: SelectedIssue): string =>
  DetailLoad.matchOrElse(
    selected.detail,
    { Loaded: ({ title }) => title },
    () =>
      Option.match(maybeRow(issues, selected.id), {
        onNone: () => '',
        onSome: row => row.title,
      }),
  )

const retitleDetail = (detail: DetailLoad, title: string): DetailLoad =>
  DetailLoad.matchOrElse(
    detail,
    { Loaded: ({ body }) => DetailLoad.Loaded({ title, body }) },
    () => detail,
  )

const replaceFirst = <A>(
  items: ReadonlyArray<A>,
  matches: (item: A) => boolean,
  replace: (item: A) => A,
): ReadonlyArray<A> =>
  Option.match(Array.findFirstIndex(items, matches), {
    onNone: () => [...items],
    onSome: target =>
      items.map((item, index) => (index === target ? replace(item) : item)),
  })

const removeFirst = <A>(
  items: ReadonlyArray<A>,
  matches: (item: A) => boolean,
): ReadonlyArray<A> =>
  Option.match(Array.findFirstIndex(items, matches), {
    onNone: () => [...items],
    onSome: target => items.filter((_item, index) => index !== target),
  })

const updateComments = (
  comments: CommentsLoad,
  f: (entries: ReadonlyArray<CommentEntry>) => ReadonlyArray<CommentEntry>,
): CommentsLoad =>
  CommentsLoad.matchOrElse(
    comments,
    { Loaded: loaded => CommentsLoad.Loaded({ comments: f(loaded.comments) }) },
    () => comments,
  )

const updateLabels = (
  labels: LabelsLoad,
  f: (entries: ReadonlyArray<LabelEntry>) => ReadonlyArray<LabelEntry>,
): LabelsLoad =>
  LabelsLoad.matchOrElse(
    labels,
    { Loaded: loaded => LabelsLoad.Loaded({ labels: f(loaded.labels) }) },
    () => labels,
  )

const hasShownLabel = (labels: LabelsLoad, name: string): boolean =>
  LabelsLoad.matchOrElse(
    labels,
    {
      Loaded: loaded =>
        loaded.labels.some(
          entry => entry.name === name && entry.status !== 'Removing',
        ),
    },
    () => false,
  )

const selectIssue = (model: Model, id: number): Update.Return<Model, Message> => {
  if (isSelectedId(model.issues, id)) {
    return { model }
  }
  const serial = model.serial
  return {
    model: withIssues(
      model,
      modifyFields(model.issues, { selection: () => newSelection(id) }),
    ),
    commands: [
      FetchIssue({ serial, id }),
      FetchComments({ serial, id }),
      FetchLabels({ serial, id }),
    ],
  }
}

const retryIssue = (model: Model): Update.Return<Model, Message> =>
  Option.match(maybeSelected(model.issues), {
    onNone: () => ({ model }),
    onSome: selected => ({
      model: withIssues(
        model,
        mapSelected(model.issues, selected.id, current =>
          modifyFields(current, {
            detail: () => DetailLoad.Loading(),
            related: () => RelatedHelp.Idle(),
          }),
        ),
      ),
      commands: [FetchIssue({ serial: model.serial, id: selected.id })],
    }),
  })

const startAssign = (
  model: Model,
  id: number,
  origin: Origin,
): Update.Return<Model, Message> => {
  const user = model.issues.user
  const maybePrevious = Option.flatMap(
    maybeRow(model.issues, id),
    row => row.maybeAssignee,
  )
  const cleared = Origin.match<IssuesPage>(origin, {
    Detail: () =>
      mapSelected(model.issues, id, current =>
        modifyFields(current, { maybeAssignError: () => Option.none() }),
      ),
    Row: () => modifyFields(model.issues, { maybeRowError: () => Option.none() }),
  })
  return {
    model: withIssues(
      model,
      mapRow(cleared, id, row =>
        modifyFields(row, { maybeAssignee: () => Option.some(user) }),
      ),
    ),
    commands: [
      AssignIssue({
        serial: model.serial,
        id,
        user,
        maybePrevious,
        origin,
      }),
    ],
  }
}

const startClose = (
  model: Model,
  id: number,
  origin: Origin,
): Update.Return<Model, Message> => {
  const cleared = Origin.match<IssuesPage>(origin, {
    Detail: () =>
      mapSelected(model.issues, id, current =>
        modifyFields(current, { maybeCloseError: () => Option.none() }),
      ),
    Row: () => modifyFields(model.issues, { maybeRowError: () => Option.none() }),
  })
  return {
    model: syncOpenCount(
      withIssues(model, setRowStatus(cleared, id, 'Closing')),
    ),
    commands: [CloseIssue({ serial: model.serial, id, origin })],
  }
}

const startRename = (model: Model): Update.Return<Model, Message> =>
  Option.match(maybeSelected(model.issues), {
    onNone: () => ({ model }),
    onSome: selected => {
      const title = selected.renameDraft.trim()
      if (title === '') {
        return { model }
      }
      const previous = titleOf(model.issues, selected)
      const renamed = mapSelected(model.issues, selected.id, current =>
        modifyFields(current, {
          maybeRenameError: () => Option.none(),
          detail: detail => retitleDetail(detail, title),
        }),
      )
      return {
        model: withIssues(
          model,
          mapRow(renamed, selected.id, row =>
            modifyFields(row, { title: () => title }),
          ),
        ),
        commands: [
          RenameIssue({
            serial: model.serial,
            id: selected.id,
            title,
            previous,
          }),
        ],
      }
    },
  })

const startPost = (model: Model): Update.Return<Model, Message> =>
  Option.match(maybeSelected(model.issues), {
    onNone: () => ({ model }),
    onSome: selected => {
      const text = selected.commentDraft.trim()
      if (text === '' || !CommentsLoad.guards.Loaded(selected.comments)) {
        return { model }
      }
      const author = model.issues.user
      const posted = mapSelected(model.issues, selected.id, current =>
        modifyFields(current, {
          commentDraft: () => '',
          maybePostError: () => Option.none(),
          comments: comments =>
            updateComments(comments, entries => [
              ...entries,
              { author, text, status: 'Sending' },
            ]),
        }),
      )
      return {
        model: withIssues(model, posted),
        commands: [
          AddComment({ serial: model.serial, id: selected.id, author, text }),
        ],
      }
    },
  })

const startAddLabel = (model: Model): Update.Return<Model, Message> =>
  Option.match(maybeSelected(model.issues), {
    onNone: () => ({ model }),
    onSome: selected => {
      const label = selected.labelDraft.trim()
      if (
        label === '' ||
        !LabelsLoad.guards.Loaded(selected.labels) ||
        hasShownLabel(selected.labels, label)
      ) {
        return { model }
      }
      const added = mapSelected(model.issues, selected.id, current =>
        modifyFields(current, {
          labelDraft: () => '',
          maybeLabelError: () => Option.none(),
          labels: labels =>
            updateLabels(labels, entries => [
              ...entries,
              { name: label, status: 'Adding' },
            ]),
        }),
      )
      return {
        model: withIssues(model, added),
        commands: [AddLabel({ serial: model.serial, id: selected.id, label })],
      }
    },
  })

const startRemoveLabel = (model: Model, label: string): Update.Return<Model, Message> =>
  Option.match(maybeSelected(model.issues), {
    onNone: () => ({ model }),
    onSome: selected => {
      const isShown = (entry: LabelEntry): boolean =>
        entry.name === label && entry.status === 'Shown'
      const isShownLabel = LabelsLoad.matchOrElse(
        selected.labels,
        { Loaded: loaded => loaded.labels.some(isShown) },
        () => false,
      )
      if (!isShownLabel) {
        return { model }
      }
      const removing = mapSelected(model.issues, selected.id, current =>
        modifyFields(current, {
          maybeLabelError: () => Option.none(),
          labels: labels =>
            updateLabels(labels, entries =>
              replaceFirst(entries, isShown, entry =>
                modifyFields(entry, { status: () => 'Removing' }),
              ),
            ),
        }),
      )
      return {
        model: withIssues(model, removing),
        commands: [
          RemoveLabel({ serial: model.serial, id: selected.id, label }),
        ],
      }
    },
  })

const openRelatedHelp = (model: Model, id: number): Update.Return<Model, Message> =>
  Option.match(maybeSelected(model.issues), {
    onNone: () => ({ model }),
    onSome: selected =>
      DetailLoad.matchOrElse(
        selected.detail,
        {
          Loaded: ({ title }) => {
            const serial = model.serial + 1
            return {
              model: modifyFields(model, {
                serial: () => serial,
                tab: () => Tab.Help(),
                help: () => ({
                  query: title,
                  results: HelpResults.Searching({ query: title, previous: [] }),
                  pane: ItemPane.Loading({ id }),
                }),
              }),
              commands: [
                SearchHelp({ serial, query: title }),
                FetchHelpItem({ serial, id }),
              ],
            }
          },
        },
        () => ({ model }),
      ),
  })

const updateSearchResults = (model: Model, results: HelpResults): Model =>
  withHelp(model, modifyFields(model.help, { results: () => results }))

const shownHits = (results: HelpResults): ReadonlyArray<Hit> =>
  HelpResults.matchOrElse(
    results,
    {
      Found: ({ hits }) => hits,
      Searching: ({ previous }) => previous,
    },
    () => [],
  )

const changeQuery = (model: Model, query: string): Update.Return<Model, Message> => {
  const serial = model.serial
  if (query.length === 0) {
    return {
      model: withHelp(
        model,
        modifyFields(model.help, {
          query: () => query,
          results: () => HelpResults.Empty(),
        }),
      ),
    }
  }
  if (query.length === 1) {
    return {
      model: withHelp(
        model,
        modifyFields(model.help, {
          query: () => query,
          results: () => HelpResults.TooShort({ query }),
        }),
      ),
    }
  }
  return {
    model: withHelp(
      model,
      modifyFields(model.help, {
        query: () => query,
        results: () =>
          HelpResults.Searching({
            query,
            previous: shownHits(model.help.results),
          }),
      }),
    ),
    commands: [SearchHelp({ serial, query })],
  }
}

const isPaneLoading = (pane: ItemPane, id: number): boolean =>
  ItemPane.matchOrElse(
    pane,
    { Loading: loading => loading.id === id },
    () => false,
  )

const mapSettingsLoaded = (
  model: Model,
  f: (loaded: LoadedSettings) => LoadedSettings,
): Model =>
  modifyFields(model, {
    settings: settings =>
      modifyFields(settings, {
        load: load => SettingsLoad.matchOrElse(load, { Loaded: f }, () => load),
      }),
  })

const isLoadingSettings = (model: Model): boolean =>
  SettingsLoad.guards.Loading(model.settings.load)

const isValidName = (name: string): boolean =>
  name.length >= 1 && name.length <= 20

const saveDraft = (model: Model): Update.Return<Model, Message> =>
  SettingsLoad.matchOrElse(
    model.settings.load,
    {
      Loaded: loaded => {
        if (!isValidName(loaded.draft.name)) {
          return { model }
        }
        return {
          model: mapSettingsLoaded(model, current =>
            modifyFields(current, {
              save: () => SaveState.Saving({ values: current.draft }),
            }),
          ),
          commands: [
            SaveSettings({ serial: model.serial, settings: loaded.draft }),
          ],
        }
      },
    },
    () => ({ model }),
  )

const changeDraft = (
  model: Model,
  f: (draft: Settings) => Settings,
): Model =>
  mapSettingsLoaded(model, loaded =>
    modifyFields(loaded, { draft: f }),
  )

const otherDensity = (density: Density): Density =>
  density === 'comfortable' ? 'compact' : 'comfortable'

export const update = (model: Model, message: Message): Update.Return<Model, Message> =>
  Message.match<Update.Return<Model, Message>>(message, {
    ClickedTabIssues: () => {
      if (Tab.guards.Issues(model.tab)) {
        return { model }
      }
      const serial = model.serial + 1
      return {
        model: modifyFields(model, {
          serial: () => serial,
          tab: () => Tab.Issues(),
          issues: () => initialIssues(),
        }),
        commands: [FetchIssues({ serial, filter: 'open' })],
      }
    },

    ClickedTabHelp: () => {
      if (Tab.guards.Help(model.tab)) {
        return { model }
      }
      return {
        model: modifyFields(model, {
          serial: () => model.serial + 1,
          tab: () => Tab.Help(),
          help: () => initialHelp(),
        }),
      }
    },

    ClickedTabSettings: () => {
      if (Tab.guards.Settings(model.tab)) {
        return { model }
      }
      const serial = model.serial + 1
      return {
        model: modifyFields(model, {
          serial: () => serial,
          tab: () => Tab.Settings(),
          settings: () => initialSettings(),
        }),
        commands: [LoadSettings({ serial })],
      }
    },

    UpdatedUser: ({ value }) => ({
      model: withIssues(
        model,
        modifyFields(model.issues, { user: () => value }),
      ),
    }),

    ClickedFilter: ({ filter }) => {
      if (filter === issueListFilter(model.issues.list)) {
        return { model }
      }
      const serial = model.serial
      return {
        model: withIssues(
          model,
          modifyFields(model.issues, {
            list: () => IssueList.Loading({ filter }),
          }),
        ),
        commands: [FetchIssues({ serial, filter })],
      }
    },

    SelectedIssue: ({ id }) => selectIssue(model, id),

    ClickedRetryIssue: () => retryIssue(model),

    ClickedAssign: () =>
      Option.match(maybeSelected(model.issues), {
        onNone: () => ({ model }),
        onSome: selected => startAssign(model, selected.id, Origin.Detail()),
      }),

    ClickedRowAssign: ({ id }) => startAssign(model, id, Origin.Row()),

    UpdatedRenameDraft: ({ value }) => ({
      model: withIssues(
        model,
        mapSelection(model.issues, current =>
          modifyFields(current, { renameDraft: () => value }),
        ),
      ),
    }),

    ClickedRename: () => startRename(model),

    ClickedClose: () =>
      Option.match(maybeSelected(model.issues), {
        onNone: () => ({ model }),
        onSome: selected => startClose(model, selected.id, Origin.Detail()),
      }),

    ClickedRowClose: ({ id }) => startClose(model, id, Origin.Row()),

    UpdatedCommentDraft: ({ value }) => ({
      model: withIssues(
        model,
        mapSelection(model.issues, current =>
          modifyFields(current, { commentDraft: () => value }),
        ),
      ),
    }),

    ClickedPost: () => startPost(model),

    UpdatedLabelDraft: ({ value }) => ({
      model: withIssues(
        model,
        mapSelection(model.issues, current =>
          modifyFields(current, { labelDraft: () => value }),
        ),
      ),
    }),

    ClickedAddLabel: () => startAddLabel(model),

    ClickedRemoveLabel: ({ label }) => startRemoveLabel(model, label),

    ClickedRelatedHit: ({ id }) => openRelatedHelp(model, id),

    SucceededFetchIssues: ({ serial, filter, issues }) => {
      if (serial !== model.serial) {
        return { model }
      }
      const rows = issues.map(shownRow)
      const loaded = IssueList.matchOrElse(
        model.issues.list,
        {
          Loading: current =>
            current.filter === filter
              ? IssueList.Loaded({ filter, rows })
              : model.issues.list,
        },
        () => model.issues.list,
      )
      return {
        model: syncOpenCount(
          withIssues(model, modifyFields(model.issues, { list: () => loaded })),
        ),
      }
    },

    FailedFetchIssues: ({ serial, filter, error }) => {
      if (serial !== model.serial) {
        return { model }
      }
      const failed = IssueList.matchOrElse(
        model.issues.list,
        {
          Loading: current =>
            current.filter === filter
              ? IssueList.Failed({ filter, error })
              : model.issues.list,
        },
        () => model.issues.list,
      )
      return {
        model: withIssues(model, modifyFields(model.issues, { list: () => failed })),
      }
    },

    SucceededFetchIssue: ({ serial, id, maybeIssue }) => {
      if (serial !== model.serial || !isSelectedId(model.issues, id)) {
        return { model }
      }
      return Option.match(maybeIssue, {
        onNone: () => ({
          model: withIssues(
            model,
            mapSelected(model.issues, id, current =>
              modifyFields(current, { detail: () => DetailLoad.NotFound() }),
            ),
          ),
        }),
        onSome: issue => ({
          model: withIssues(
            model,
            mapSelected(model.issues, id, current =>
              modifyFields(current, {
                detail: () =>
                  DetailLoad.Loaded({ title: issue.title, body: issue.body }),
                related: () => RelatedHelp.Searching(),
              }),
            ),
          ),
          commands: [
            SearchRelated({ serial: model.serial, id, query: issue.title }),
          ],
        }),
      })
    },

    FailedFetchIssue: ({ serial, id, error }) => {
      if (serial !== model.serial || !isSelectedId(model.issues, id)) {
        return { model }
      }
      return {
        model: withIssues(
          model,
          mapSelected(model.issues, id, current =>
            modifyFields(current, {
              detail: () => DetailLoad.Failed({ error }),
            }),
          ),
        ),
      }
    },

    SucceededAssignIssue: () => ({ model }),

    FailedAssignIssue: ({ serial, id, origin, maybePrevious, error }) => {
      if (serial !== model.serial) {
        return { model }
      }
      const restored = mapRow(model.issues, id, row =>
        modifyFields(row, { maybeAssignee: () => maybePrevious }),
      )
      const reported = Origin.match<IssuesPage>(origin, {
        Detail: () =>
          mapSelected(restored, id, current =>
            modifyFields(current, {
              maybeAssignError: () => Option.some(`assign error: ${error}`),
            }),
          ),
        Row: () =>
          modifyFields(restored, {
            maybeRowError: () => Option.some(`row error: ${error}`),
          }),
      })
      return { model: withIssues(model, reported) }
    },

    SucceededRenameIssue: () => ({ model }),

    FailedRenameIssue: ({ serial, id, previous, error }) => {
      if (serial !== model.serial) {
        return { model }
      }
      const restored = mapRow(model.issues, id, row =>
        modifyFields(row, { title: () => previous }),
      )
      return {
        model: withIssues(
          model,
          mapSelected(restored, id, current =>
            modifyFields(current, {
              detail: detail => retitleDetail(detail, previous),
              maybeRenameError: () => Option.some(`rename error: ${error}`),
            }),
          ),
        ),
      }
    },

    SucceededCloseIssue: () => ({ model }),

    FailedCloseIssue: ({ serial, id, origin, error }) => {
      if (serial !== model.serial) {
        return { model }
      }
      const restored = setRowStatus(model.issues, id, 'Shown')
      const reported = Origin.match<IssuesPage>(origin, {
        Detail: () =>
          mapSelected(restored, id, current =>
            modifyFields(current, {
              maybeCloseError: () => Option.some(`close error: ${error}`),
            }),
          ),
        Row: () =>
          modifyFields(restored, {
            maybeRowError: () => Option.some(`row error: ${error}`),
          }),
      })
      return { model: syncOpenCount(withIssues(model, reported)) }
    },

    SucceededFetchComments: ({ serial, id, comments }) => {
      if (serial !== model.serial || !isSelectedId(model.issues, id)) {
        return { model }
      }
      return {
        model: withIssues(
          model,
          mapSelected(model.issues, id, current =>
            modifyFields(current, {
              comments: loading =>
                CommentsLoad.guards.Loading(loading)
                  ? CommentsLoad.Loaded({
                      comments: comments.map(sentComment),
                    })
                  : loading,
            }),
          ),
        ),
      }
    },

    FailedFetchComments: ({ serial, id, error }) => {
      if (serial !== model.serial || !isSelectedId(model.issues, id)) {
        return { model }
      }
      return {
        model: withIssues(
          model,
          mapSelected(model.issues, id, current =>
            modifyFields(current, {
              comments: loading =>
                CommentsLoad.guards.Loading(loading)
                  ? CommentsLoad.Failed({ error })
                  : loading,
            }),
          ),
        ),
      }
    },

    SucceededAddComment: ({ serial, id, text }) => {
      if (serial !== model.serial || !isSelectedId(model.issues, id)) {
        return { model }
      }
      return {
        model: withIssues(
          model,
          mapSelected(model.issues, id, current =>
            modifyFields(current, {
              comments: comments =>
                updateComments(comments, entries =>
                  replaceFirst(
                    entries,
                    entry => entry.status === 'Sending' && entry.text === text,
                    entry => modifyFields(entry, { status: () => 'Sent' }),
                  ),
                ),
            }),
          ),
        ),
      }
    },

    FailedAddComment: ({ serial, id, text, error }) => {
      if (serial !== model.serial || !isSelectedId(model.issues, id)) {
        return { model }
      }
      return {
        model: withIssues(
          model,
          mapSelected(model.issues, id, current =>
            modifyFields(current, {
              comments: comments =>
                updateComments(comments, entries =>
                  removeFirst(
                    entries,
                    entry => entry.status === 'Sending' && entry.text === text,
                  ),
                ),
              maybePostError: () => Option.some(`post error: ${error}`),
            }),
          ),
        ),
      }
    },

    SucceededFetchLabels: ({ serial, id, labels }) => {
      if (serial !== model.serial || !isSelectedId(model.issues, id)) {
        return { model }
      }
      return {
        model: withIssues(
          model,
          mapSelected(model.issues, id, current =>
            modifyFields(current, {
              labels: loading =>
                LabelsLoad.guards.Loading(loading)
                  ? LabelsLoad.Loaded({
                      labels: labels.map(shownLabel),
                    })
                  : loading,
            }),
          ),
        ),
      }
    },

    FailedFetchLabels: ({ serial, id, error }) => {
      if (serial !== model.serial || !isSelectedId(model.issues, id)) {
        return { model }
      }
      return {
        model: withIssues(
          model,
          mapSelected(model.issues, id, current =>
            modifyFields(current, {
              labels: loading =>
                LabelsLoad.guards.Loading(loading)
                  ? LabelsLoad.Failed({ error })
                  : loading,
            }),
          ),
        ),
      }
    },

    SucceededAddLabel: ({ serial, id, label }) => {
      if (serial !== model.serial || !isSelectedId(model.issues, id)) {
        return { model }
      }
      return {
        model: withIssues(
          model,
          mapSelected(model.issues, id, current =>
            modifyFields(current, {
              labels: labels =>
                updateLabels(labels, entries =>
                  replaceFirst(
                    entries,
                    entry => entry.name === label && entry.status === 'Adding',
                    entry => modifyFields(entry, { status: () => 'Shown' }),
                  ),
                ),
            }),
          ),
        ),
      }
    },

    FailedAddLabel: ({ serial, id, label, error }) => {
      if (serial !== model.serial || !isSelectedId(model.issues, id)) {
        return { model }
      }
      return {
        model: withIssues(
          model,
          mapSelected(model.issues, id, current =>
            modifyFields(current, {
              labels: labels =>
                updateLabels(labels, entries =>
                  removeFirst(
                    entries,
                    entry => entry.name === label && entry.status === 'Adding',
                  ),
                ),
              maybeLabelError: () => Option.some(`label error: ${error}`),
            }),
          ),
        ),
      }
    },

    SucceededRemoveLabel: ({ serial, id, label }) => {
      if (serial !== model.serial || !isSelectedId(model.issues, id)) {
        return { model }
      }
      return {
        model: withIssues(
          model,
          mapSelected(model.issues, id, current =>
            modifyFields(current, {
              labels: labels =>
                updateLabels(labels, entries =>
                  removeFirst(
                    entries,
                    entry => entry.name === label && entry.status === 'Removing',
                  ),
                ),
            }),
          ),
        ),
      }
    },

    FailedRemoveLabel: ({ serial, id, label, error }) => {
      if (serial !== model.serial || !isSelectedId(model.issues, id)) {
        return { model }
      }
      return {
        model: withIssues(
          model,
          mapSelected(model.issues, id, current =>
            modifyFields(current, {
              labels: labels =>
                updateLabels(labels, entries =>
                  replaceFirst(
                    entries,
                    entry => entry.name === label && entry.status === 'Removing',
                    entry => modifyFields(entry, { status: () => 'Shown' }),
                  ),
                ),
              maybeLabelError: () => Option.some(`label error: ${error}`),
            }),
          ),
        ),
      }
    },

    SucceededSearchRelated: ({ serial, id, hits }) => {
      if (serial !== model.serial || !isSelectedId(model.issues, id)) {
        return { model }
      }
      return {
        model: withIssues(
          model,
          mapSelected(model.issues, id, current =>
            modifyFields(current, {
              related: related =>
                RelatedHelp.guards.Searching(related)
                  ? RelatedHelp.Found({ hits })
                  : related,
            }),
          ),
        ),
      }
    },

    FailedSearchRelated: ({ serial, id, error }) => {
      if (serial !== model.serial || !isSelectedId(model.issues, id)) {
        return { model }
      }
      return {
        model: withIssues(
          model,
          mapSelected(model.issues, id, current =>
            modifyFields(current, {
              related: related =>
                RelatedHelp.guards.Searching(related)
                  ? RelatedHelp.Failed({ error })
                  : related,
            }),
          ),
        ),
      }
    },

    UpdatedQuery: ({ value }) => changeQuery(model, value),

    ClickedHit: ({ id }) => ({
      model: withHelp(
        model,
        modifyFields(model.help, { pane: () => ItemPane.Loading({ id }) }),
      ),
      commands: [FetchHelpItem({ serial: model.serial, id })],
    }),

    ClickedRetryItem: () =>
      ItemPane.matchOrElse(
        model.help.pane,
        {
          Failed: ({ id }) => ({
            model: withHelp(
              model,
              modifyFields(model.help, { pane: () => ItemPane.Loading({ id }) }),
            ),
            commands: [FetchHelpItem({ serial: model.serial, id })],
          }),
        },
        () => ({ model }),
      ),

    SucceededSearchHelp: ({ serial, query, hits }) => {
      if (serial !== model.serial || model.help.query !== query) {
        return { model }
      }
      return {
        model: updateSearchResults(
          model,
          HelpResults.Found({ query, hits }),
        ),
      }
    },

    FailedSearchHelp: ({ serial, query, error }) => {
      if (serial !== model.serial || model.help.query !== query) {
        return { model }
      }
      return {
        model: updateSearchResults(
          model,
          HelpResults.Failed({ query, error }),
        ),
      }
    },

    SucceededFetchItem: ({ serial, id, maybeItem }) => {
      if (serial !== model.serial || !isPaneLoading(model.help.pane, id)) {
        return { model }
      }
      const pane = Option.match(maybeItem, {
        onNone: () => ItemPane.NotFound({ id }),
        onSome: item => ItemPane.Loaded({ item }),
      })
      return {
        model: withHelp(model, modifyFields(model.help, { pane: () => pane })),
      }
    },

    FailedFetchItem: ({ serial, id, error }) => {
      if (serial !== model.serial || !isPaneLoading(model.help.pane, id)) {
        return { model }
      }
      return {
        model: withHelp(
          model,
          modifyFields(model.help, {
            pane: () => ItemPane.Failed({ id, error }),
          }),
        ),
      }
    },

    UpdatedName: ({ value }) => ({
      model: changeDraft(model, draft => modifyFields(draft, { name: () => value })),
    }),

    ClickedTheme: ({ theme }) => ({
      model: changeDraft(model, draft =>
        modifyFields(draft, { theme: () => theme }),
      ),
    }),

    ClickedDensityToggle: () => ({
      model: changeDraft(model, draft =>
        modifyFields(draft, { density: () => otherDensity(draft.density) }),
      ),
    }),

    ClickedSave: () => saveDraft(model),

    ClickedRetryLoad: () =>
      SettingsLoad.matchOrElse(
        model.settings.load,
        {
          Failed: () => ({
            model: modifyFields(model, {
              settings: settings =>
                modifyFields(settings, { load: () => SettingsLoad.Loading() }),
            }),
            commands: [LoadSettings({ serial: model.serial })],
          }),
        },
        () => ({ model }),
      ),

    SucceededLoadSettings: ({ serial, settings }) => {
      if (serial !== model.serial || !isLoadingSettings(model)) {
        return { model }
      }
      return {
        model: modifyFields(model, {
          settings: current =>
            modifyFields(current, {
              load: () =>
                SettingsLoad.Loaded({
                  saved: settings,
                  draft: settings,
                  save: SaveState.Idle(),
                }),
            }),
        }),
      }
    },

    FailedLoadSettings: ({ serial, error }) => {
      if (serial !== model.serial || !isLoadingSettings(model)) {
        return { model }
      }
      return {
        model: modifyFields(model, {
          settings: current =>
            modifyFields(current, {
              load: () => SettingsLoad.Failed({ error }),
            }),
        }),
      }
    },

    SucceededSaveSettings: ({ serial, settings }) => {
      if (serial !== model.serial) {
        return { model }
      }
      return {
        model: mapSettingsLoaded(model, loaded =>
          modifyFields(loaded, {
            saved: () => settings,
            save: () => SaveState.Idle(),
          }),
        ),
      }
    },

    FailedSaveSettings: ({ serial, error }) => {
      if (serial !== model.serial) {
        return { model }
      }
      return {
        model: mapSettingsLoaded(model, loaded =>
          modifyFields(loaded, {
            save: current =>
              SaveState.guards.Saving(current)
                ? SaveState.Failed({ error })
                : current,
          }),
        ),
      }
    },
  })
