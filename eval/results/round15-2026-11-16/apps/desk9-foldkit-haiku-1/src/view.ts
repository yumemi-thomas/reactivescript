import { Option } from 'effect'
import { Document, Html, HtmlBuilder } from 'foldkit/html'

import { Message } from './message'
import {
  CommentsLoad,
  DetailLoad,
  Filter,
  Hit,
  HelpPage,
  HelpResults,
  IssueList,
  IssueRow,
  IssuesPage,
  ItemPane,
  LabelsLoad,
  Model,
  RelatedHelp,
  SaveState,
  Selection,
  Settings,
  SettingsLoad,
  SettingsPage,
  Tab,
  Theme,
} from './model'

// VIEW

const buttonClass =
  'px-3 py-1 rounded border border-slate-400 bg-white hover:bg-slate-100 text-sm'
const inputClass = 'px-2 py-1 rounded border border-slate-400 bg-white text-sm'

const button = (
  h: HtmlBuilder<Message>,
  testId: string,
  label: string,
  onClick: Message,
): Html =>
  h.button(
    [h.DataAttribute('testid', testId), h.OnClick(onClick), h.Class(buttonClass)],
    [label],
  )

const textInput = (
  h: HtmlBuilder<Message>,
  testId: string,
  value: string,
  onInput: (value: string) => Message,
): Html =>
  h.input([
    h.DataAttribute('testid', testId),
    h.Value(value),
    h.OnInput(onInput),
    h.Autocomplete('off'),
    h.Class(inputClass),
  ])

const issuesTabLabel = (model: Model): string =>
  Option.match(model.maybeOpenCount, {
    onNone: () => 'Issues',
    onSome: count => `Issues (${count})`,
  })

const tabButton = (
  h: HtmlBuilder<Message>,
  testId: string,
  label: string,
  onClick: Message,
): Html =>
  h.button(
    [
      h.DataAttribute('testid', testId),
      h.OnClick(onClick),
      h.Class('px-4 py-2 rounded-t border-b-2 border-slate-900 font-semibold'),
    ],
    [label],
  )

const tabsView = (model: Model, h: HtmlBuilder<Message>): Html =>
  h.nav([h.Class('flex gap-2 border-b border-slate-300')], [
    tabButton(h, 'tab-issues', issuesTabLabel(model), Message.ClickedTabIssues()),
    tabButton(h, 'tab-help', 'Help', Message.ClickedTabHelp()),
    tabButton(h, 'tab-settings', 'Settings', Message.ClickedTabSettings()),
  ])

const listFilter = (list: IssueList): Filter =>
  IssueList.match<Filter>(list, {
    Loading: ({ filter }) => filter,
    Failed: ({ filter }) => filter,
    Loaded: ({ filter }) => filter,
  })

const assigneeText = (row: IssueRow): string =>
  Option.match(row.maybeAssignee, {
    onNone: () => 'unassigned',
    onSome: assignee => assignee,
  })

const issueRowView = (
  issues: IssuesPage,
  filter: Filter,
  row: IssueRow,
  h: HtmlBuilder<Message>,
): Html =>
  h.keyed('li')(String(row.id), [h.Class('flex items-center gap-2')], [
    h.div(
      [
        h.DataAttribute('testid', 'issue'),
        h.OnClick(Message.SelectedIssue({ id: row.id })),
        h.Class('flex-1 cursor-pointer hover:underline'),
      ],
      [`#${row.id} ${row.title} (${assigneeText(row)})`],
    ),
    button(
      h,
      'row-assign',
      `assign to ${issues.user}`,
      Message.ClickedRowAssign({ id: row.id }),
    ),
    filter === 'open'
      ? button(h, 'row-close', 'close', Message.ClickedRowClose({ id: row.id }))
      : h.empty,
  ])

const listView = (issues: IssuesPage, h: HtmlBuilder<Message>): Html => {
  const filter = listFilter(issues.list)
  const body = IssueList.match<Html>(issues.list, {
    Loading: () => h.p([], [`loading ${filter} issues`]),
    Failed: ({ error }) => h.p([], [`list error: ${error}`]),
    Loaded: ({ rows }) =>
      h.ul(
        [h.Class('flex flex-col gap-1')],
        rows
          .filter(row => row.status === 'Shown')
          .map(row => issueRowView(issues, filter, row, h)),
      ),
  })
  return h.div([h.DataAttribute('testid', 'list'), h.Class('flex flex-col gap-2')], [
    body,
    Option.match(issues.maybeRowError, {
      onNone: () => h.empty,
      onSome: error =>
        h.p([h.DataAttribute('testid', 'row-error'), h.Class('text-red-700')], [error]),
    }),
  ])
}

const filterView = (issues: IssuesPage, h: HtmlBuilder<Message>): Html => {
  const filter = listFilter(issues.list)
  return h.div([h.Class('flex gap-2')], [
    h.button(
      [
        h.DataAttribute('testid', 'filter-open'),
        h.OnClick(Message.ClickedFilter({ filter: 'open' })),
        h.Class(filter === 'open' ? 'font-bold underline' : ''),
      ],
      ['Open'],
    ),
    h.button(
      [
        h.DataAttribute('testid', 'filter-closed'),
        h.OnClick(Message.ClickedFilter({ filter: 'closed' })),
        h.Class(filter === 'closed' ? 'font-bold underline' : ''),
      ],
      ['Closed'],
    ),
  ])
}

const errorLine = (testId: string, maybeError: Option.Option<string>, h: HtmlBuilder<Message>): Html =>
  Option.match(maybeError, {
    onNone: () => h.empty,
    onSome: error => h.p([h.DataAttribute('testid', testId), h.Class('text-red-700')], [error]),
  })

const detailHeading = (
  selected: Extract<Selection, { readonly _tag: 'Selected' }>,
  h: HtmlBuilder<Message>,
): Html =>
  DetailLoad.match<Html>(selected.detail, {
    Loading: () => h.p([], [`loading #${selected.id}`]),
    NotFound: () => h.p([], [`detail error: issue #${selected.id} not found`]),
    Failed: ({ error }) => h.p([], [`detail error: ${error}`]),
    Loaded: ({ title, body }) =>
      h.div([], [h.h2([h.Class('text-xl font-bold')], [`#${selected.id} ${title}`]), h.p([], [body])]),
  })

const commentsView = (
  comments: CommentsLoad,
  h: HtmlBuilder<Message>,
): Html =>
  h.div([h.DataAttribute('testid', 'comments'), h.Class('flex flex-col gap-1')], [
    CommentsLoad.match<Html>(comments, {
      Loading: () => h.p([], ['loading comments']),
      Failed: ({ error }) => h.p([], [`comments error: ${error}`]),
      Loaded: ({ comments: entries }) =>
        h.ul(
          [h.Class('flex flex-col gap-1')],
          entries.map(entry =>
            h.li(
              [h.DataAttribute('testid', 'comment')],
              [
                entry.status === 'Sending'
                  ? `${entry.author}: ${entry.text} (sending…)`
                  : `${entry.author}: ${entry.text}`,
              ],
            ),
          ),
        ),
    }),
  ])

const labelsView = (labels: LabelsLoad, h: HtmlBuilder<Message>): Html =>
  h.div([h.DataAttribute('testid', 'labels'), h.Class('flex flex-col gap-1')], [
    LabelsLoad.match<Html>(labels, {
      Loading: () => h.p([], ['loading labels']),
      Failed: ({ error }) => h.p([], [`labels error: ${error}`]),
      Loaded: ({ labels: entries }) =>
        h.ul(
          [h.Class('flex flex-wrap gap-2')],
          entries
            .filter(entry => entry.status !== 'Removing')
            .map(entry =>
              h.li([h.Class('flex items-center gap-1')], [
                h.span([h.DataAttribute('testid', 'label')], [entry.name]),
                entry.status === 'Shown'
                  ? button(
                      h,
                      'remove-label',
                      `remove ${entry.name}`,
                      Message.ClickedRemoveLabel({ label: entry.name }),
                    )
                  : h.empty,
              ]),
            ),
        ),
    }),
  ])

const relatedView = (related: RelatedHelp, h: HtmlBuilder<Message>): Html =>
  h.div([h.DataAttribute('testid', 'related'), h.Class('flex flex-col gap-1')], [
    RelatedHelp.match<Html>(related, {
      Idle: () => h.empty,
      Searching: () => h.p([], ['finding related help']),
      Failed: ({ error }) => h.p([], [`related help failed: ${error}`]),
      Found: ({ hits }) =>
        hits.length === 0
          ? h.p([], ['no related help'])
          : h.div(
              [h.Class('flex flex-col gap-1')],
              hits.slice(0, 3).map(hit =>
                button(h, 'related-hit', hit.name, Message.ClickedRelatedHit({ id: hit.id })),
              ),
            ),
    }),
  ])

const selectedView = (
  issues: IssuesPage,
  selected: Extract<Selection, { readonly _tag: 'Selected' }>,
  h: HtmlBuilder<Message>,
): Html =>
  h.div([h.Class('flex flex-col gap-3')], [
    detailHeading(selected, h),
    button(h, 'retry', 'retry', Message.ClickedRetryIssue()),
    h.div([h.Class('flex flex-col gap-1')], [
      button(h, 'assign', `assign to ${issues.user}`, Message.ClickedAssign()),
      errorLine('assign-error', selected.maybeAssignError, h),
    ]),
    h.div([h.Class('flex flex-col gap-1')], [
      h.div([h.Class('flex gap-2')], [
        textInput(h, 'title-input', selected.renameDraft, value =>
          Message.UpdatedRenameDraft({ value }),
        ),
        button(h, 'rename', 'rename', Message.ClickedRename()),
      ]),
      errorLine('rename-error', selected.maybeRenameError, h),
    ]),
    h.div([h.Class('flex flex-col gap-1')], [
      button(h, 'close', 'close', Message.ClickedClose()),
      errorLine('close-error', selected.maybeCloseError, h),
    ]),
    commentsView(selected.comments, h),
    h.div([h.Class('flex flex-col gap-1')], [
      h.div([h.Class('flex gap-2')], [
        textInput(h, 'comment-input', selected.commentDraft, value =>
          Message.UpdatedCommentDraft({ value }),
        ),
        button(h, 'post', 'post', Message.ClickedPost()),
      ]),
      errorLine('post-error', selected.maybePostError, h),
    ]),
    labelsView(selected.labels, h),
    h.div([h.Class('flex flex-col gap-1')], [
      h.div([h.Class('flex gap-2')], [
        textInput(h, 'label-input', selected.labelDraft, value =>
          Message.UpdatedLabelDraft({ value }),
        ),
        button(h, 'add-label', 'add label', Message.ClickedAddLabel()),
      ]),
      errorLine('label-error', selected.maybeLabelError, h),
    ]),
    DetailLoad.guards.Loaded(selected.detail)
      ? relatedView(selected.related, h)
      : h.empty,
  ])

const detailView = (issues: IssuesPage, h: HtmlBuilder<Message>): Html =>
  h.div([h.DataAttribute('testid', 'detail'), h.Class('flex flex-col gap-3')], [
    Selection.match<Html>(issues.selection, {
      None: () => h.p([], ['select an issue']),
      Selected: selected => selectedView(issues, selected, h),
    }),
  ])

const issuesView = (issues: IssuesPage, h: HtmlBuilder<Message>): Html =>
  h.div([h.DataAttribute('testid', 'page-issues'), h.Class('grid md:grid-cols-2 gap-6')], [
    h.div([h.Class('flex flex-col gap-3')], [
      h.label([h.Class('flex items-center gap-2')], [
        'Current user',
        textInput(h, 'user', issues.user, value => Message.UpdatedUser({ value })),
      ]),
      filterView(issues, h),
      listView(issues, h),
    ]),
    detailView(issues, h),
  ])

const hitPicked = (pane: ItemPane, id: number): boolean =>
  Option.match(paneId(pane), {
    onNone: () => false,
    onSome: picked => picked === id,
  })

const paneId = (pane: ItemPane): Option.Option<number> =>
  ItemPane.matchOrElse(
    pane,
    {
      Loading: ({ id }) => Option.some(id),
      Loaded: ({ item }) => Option.some(item.id),
      NotFound: ({ id }) => Option.some(id),
      Failed: ({ id }) => Option.some(id),
    },
    () => Option.none(),
  )

const hitListView = (
  hits: ReadonlyArray<Hit>,
  pane: ItemPane,
  h: HtmlBuilder<Message>,
): Html =>
  h.ul(
    [h.Class('flex flex-col gap-1')],
    hits.map(hit =>
      h.keyed('li')(
        String(hit.id),
        [
          h.DataAttribute('testid', 'hit'),
          h.OnClick(Message.ClickedHit({ id: hit.id })),
          h.Class('cursor-pointer hover:underline'),
        ],
        [`${hitPicked(pane, hit.id) ? '> ' : ''}${hit.name}`],
      ),
    ),
  )

const resultsView = (
  results: HelpResults,
  pane: ItemPane,
  h: HtmlBuilder<Message>,
): Html =>
  HelpResults.match<Html>(results, {
    Empty: () => h.empty,
    TooShort: ({ query }) => h.p([], [`too short: ${query}`]),
    Searching: ({ previous }) =>
      h.div([], [h.p([], ['searching…']), hitListView(previous, pane, h)]),
    Found: ({ query, hits }) =>
      h.div([], [
        h.p([], [`${hits.length} results for ${query}`]),
        hitListView(hits, pane, h),
      ]),
    Failed: ({ error }) => h.p([], [`search failed: ${error}`]),
  })

const paneView = (pane: ItemPane, h: HtmlBuilder<Message>): Html =>
  ItemPane.match<Html>(pane, {
    NoPick: () => h.p([], ['pick a result']),
    Loading: () => h.p([], ['loading…']),
    Loaded: ({ item }) =>
      h.div([], [h.h2([h.Class('text-xl font-bold')], [item.name]), h.p([], [item.blurb])]),
    NotFound: ({ id }) => h.p([], [`item ${id} not found`]),
    Failed: ({ id, error }) =>
      h.div([], [
        h.p([], [`failed: ${error}`]),
        button(h, 'retry-item', 'retry', Message.ClickedRetryItem()),
      ]),
  })

const helpView = (help: HelpPage, h: HtmlBuilder<Message>): Html =>
  h.div([h.DataAttribute('testid', 'page-help'), h.Class('flex flex-col gap-4 max-w-xl')], [
    textInput(h, 'query', help.query, value => Message.UpdatedQuery({ value })),
    h.div([h.DataAttribute('testid', 'results'), h.Class('flex flex-col gap-2')], [
      resultsView(help.results, help.pane, h),
    ]),
    h.div([h.DataAttribute('testid', 'item'), h.Class('flex flex-col gap-2')], [
      paneView(help.pane, h),
    ]),
  ])

const saveStateText = (settings: Settings): string =>
  `Saved: ${settings.name} · ${settings.theme} · ${settings.density}`

const nameErrorView = (name: string, h: HtmlBuilder<Message>): Html => {
  if (name.length === 0) {
    return h.p([h.DataAttribute('testid', 'name-error'), h.Class('text-red-700')], ['Display name is required'])
  }
  if (name.length > 20) {
    return h.p(
      [h.DataAttribute('testid', 'name-error'), h.Class('text-red-700')],
      [`Display name must be at most 20 characters, not ${name.length}`],
    )
  }
  return h.empty
}

const themeButton = (
  h: HtmlBuilder<Message>,
  theme: Theme,
  current: Settings,
): Html =>
  h.button(
    [
      h.DataAttribute('testid', `theme-${theme}`),
      h.OnClick(Message.ClickedTheme({ theme })),
      h.Class(current.theme === theme ? `${buttonClass} font-bold` : buttonClass),
    ],
    [theme],
  )

const formView = (draft: Settings, save: SaveState, h: HtmlBuilder<Message>): Html =>
  h.div([h.Class('flex flex-col gap-3')], [
    h.div([h.Class('flex items-center gap-2')], [
      textInput(h, 'name', draft.name, value => Message.UpdatedName({ value })),
      h.span([h.DataAttribute('testid', 'name-count')], [`${draft.name.length}/20`]),
    ]),
    nameErrorView(draft.name, h),
    h.div([h.Class('flex gap-2')], [
      themeButton(h, 'light', draft),
      themeButton(h, 'dark', draft),
      button(h, 'density-toggle', 'toggle density', Message.ClickedDensityToggle()),
    ]),
    h.p([h.DataAttribute('testid', 'preview')], [
      `Preview: ${draft.theme} / ${draft.density}`,
    ]),
    button(h, 'save', 'save', Message.ClickedSave()),
    SaveState.match<Html>(save, {
      Idle: () => h.empty,
      Saving: () => h.empty,
      Failed: ({ error }) =>
        h.p([h.DataAttribute('testid', 'save-error'), h.Class('text-red-700')], [`Save failed: ${error}`]),
    }),
  ])

const settingsView = (page: SettingsPage, h: HtmlBuilder<Message>): Html =>
  h.div([h.DataAttribute('testid', 'page-settings'), h.Class('flex flex-col gap-4 max-w-xl')], [
    SettingsLoad.match<Html>(page.load, {
      Loading: () => h.div([h.DataAttribute('testid', 'load')], ['Loading settings…']),
      Failed: ({ error }) =>
        h.div([h.DataAttribute('testid', 'load')], [
          `Could not load settings: ${error}`,
          button(h, 'retry-load', 'retry', Message.ClickedRetryLoad()),
        ]),
      Loaded: ({ saved, draft, save }) =>
        h.div([h.Class('flex flex-col gap-4')], [
          h.div([h.DataAttribute('testid', 'load')]),
          h.p([h.DataAttribute('testid', 'saved')], [
            SaveState.matchOrElse(
              save,
              { Saving: ({ values }) => `${saveStateText(values)} (saving…)` },
              () => saveStateText(saved),
            ),
          ]),
          formView(draft, save, h),
        ]),
    }),
  ])

export const view = (model: Model, h: HtmlBuilder<Message>): Document => ({
  title: 'Issue desk',
  body: h.div([h.Class('min-h-screen bg-slate-50 text-slate-900 p-6 flex flex-col gap-6')], [
    tabsView(model, h),
    Tab.match<Html>(model.tab, {
      Issues: () => issuesView(model.issues, h),
      Help: () => helpView(model.help, h),
      Settings: () => settingsView(model.settings, h),
    }),
  ]),
})
