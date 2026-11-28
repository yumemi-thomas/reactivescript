import { Array, Option } from 'effect'
import { type Document, type Html, type HtmlBuilder } from 'foldkit/html'

import { type Filter, type Hit, nameError } from './domain.js'
import { Message } from './message.js'
import {
  CommentItem,
  CommentsState,
  DetailState,
  HelpModel,
  HelpResults,
  IssuesModel,
  ItemState,
  LabelsState,
  ListState,
  Model,
  Page,
  RelatedState,
  Row,
  Selection,
  SettingsLoad,
  SettingsModel,
} from './model.js'

type H = HtmlBuilder<Message>

const testId = (h: H, id: string) => h.DataAttribute('testid', id)

// TABS

const tab = (h: H, id: string, label: string, message: Message): Html =>
  h.button([testId(h, id), h.OnClick(message)], [label])

const tabsView = (model: Model, h: H): Html => {
  const count =
    model.page._tag === 'IssuesPage' ? model.page.model.openCount : model.lastOpenCount
  const issuesLabel = Option.match(count, {
    onNone: () => 'Issues',
    onSome: value => `Issues (${value})`,
  })
  return h.nav([h.Class('flex gap-2')], [
    tab(h, 'tab-issues', issuesLabel, Message.ClickedIssuesTab()),
    tab(h, 'tab-help', 'Help', Message.ClickedHelpTab()),
    tab(h, 'tab-settings', 'Settings', Message.ClickedSettingsTab()),
  ])
}

// ISSUES

const filterButton = (h: H, id: string, label: string, filter: Filter, active: Filter): Html =>
  h.button(
    [
      testId(h, id),
      h.OnClick(Message.ClickedFilter({ filter })),
      h.Class(filter === active ? 'font-bold underline' : ''),
    ],
    [label],
  )

const rowView = (issues: IssuesModel, row: Row, h: H): Html => {
  const assignee = Option.match(row.assignee, {
    onNone: () => 'unassigned',
    onSome: name => name,
  })
  const closeButton =
    issues.filter === 'open'
      ? [h.button([testId(h, 'row-close'), h.OnClick(Message.ClickedRowClose({ id: row.id }))], ['close'])]
      : []
  return h.keyed('li')(String(row.id), [], [
    h.button(
      [testId(h, 'issue'), h.OnClick(Message.ClickedIssue({ id: row.id }))],
      [`#${row.id} ${row.title} (${assignee})`],
    ),
    h.button(
      [testId(h, 'row-assign'), h.OnClick(Message.ClickedRowAssign({ id: row.id }))],
      [`assign to ${issues.user}`],
    ),
    ...closeButton,
  ])
}

const listView = (issues: IssuesModel, h: H): Html =>
  h.div([testId(h, 'list')], ListState.match(issues.list, {
    Loading: () => [h.p([], [`loading ${issues.filter} issues`])],
    Failed: ({ error }) => [h.p([], [`list error: ${error}`])],
    Loaded: ({ rows }) => [
      h.ul(
        [],
        rows
          .filter(row => row.status === 'Shown')
          .map(row => rowView(issues, row, h)),
      ),
    ],
  }))

const errorLine = (h: H, error: Option.Option<string>, label: string): Html =>
  Option.match(error, {
    onNone: () => h.empty,
    onSome: message => h.p([], [`${label}: ${message}`]),
  })

const headingView = (selection: Selection, h: H): Html =>
  DetailState.match(selection.detail, {
    Loading: () => h.p([], [`loading #${selection.id}`]),
    Found: ({ issue }) =>
      h.div([], [h.h2([], [`#${issue.id} ${issue.title}`]), h.p([], [issue.body])]),
    NotFound: () => h.p([], [`detail error: issue #${selection.id} not found`]),
    Failed: ({ error }) => h.p([], [`detail error: ${error}`]),
  })

const commentView = (item: CommentItem, h: H): Html =>
  CommentItem.match(item, {
    Posted: ({ key, author, text }) =>
      h.keyed('li')(String(key), [testId(h, 'comment')], [`${author}: ${text}`]),
    Sending: ({ key, author, text }) =>
      h.keyed('li')(String(key), [testId(h, 'comment')], [`${author}: ${text} (sending…)`]),
  })

const commentsView = (selection: Selection, h: H): Html =>
  h.div([testId(h, 'comments')], CommentsState.match(selection.comments, {
    Loading: () => [h.p([], ['loading comments'])],
    Failed: ({ error }) => [h.p([], [`comments error: ${error}`])],
    Loaded: ({ comments }) => [h.ul([], comments.map(item => commentView(item, h)))],
  }))

const labelsView = (selection: Selection, h: H): Html =>
  h.div([testId(h, 'labels')], LabelsState.match(selection.labels, {
    Loading: () => [h.p([], ['loading labels'])],
    Failed: ({ error }) => [h.p([], [`labels error: ${error}`])],
    Loaded: ({ labels }) => [
      h.ul(
        [],
        labels.map(label =>
          h.keyed('li')(label, [], [
            h.span([testId(h, 'label')], [label]),
            h.button(
              [testId(h, 'remove-label'), h.OnClick(Message.ClickedRemoveLabel({ label }))],
              [`remove ${label}`],
            ),
          ]),
        ),
      ),
    ],
  }))

const hitItem = (h: H, hit: Hit, title: string): Html =>
  h.keyed('li')(String(hit.id), [], [
    h.button([testId(h, 'related-hit'), h.OnClick(Message.ClickedRelatedHit({ id: hit.id, title }))], [hit.name]),
  ])

const relatedView = (selection: Selection, h: H): Html => {
  if (selection.detail._tag !== 'Found') {
    return h.div([testId(h, 'related')])
  }
  const title = selection.detail.issue.title
  return h.div([testId(h, 'related')], RelatedState.match(selection.related, {
    Idle: () => [],
    Loading: () => [h.p([], ['finding related help'])],
    Found: ({ hits }) =>
      Array.isReadonlyArrayEmpty(hits)
        ? [h.p([], ['no related help'])]
        : [h.ul([], hits.slice(0, 3).map(hit => hitItem(h, hit, title)))],
    Failed: ({ error }) => [h.p([], [`related help failed: ${error}`])],
  }))
}

const selectedView = (issues: IssuesModel, selection: Selection, h: H): Html =>
  h.div([h.Class('flex flex-col gap-3')], [
    headingView(selection, h),
    h.button([testId(h, 'retry'), h.OnClick(Message.ClickedRetryIssue())], ['Retry']),
    h.button([testId(h, 'assign'), h.OnClick(Message.ClickedAssign())], [`assign to ${issues.user}`]),
    errorLine(h, selection.assignError, 'assign error'),
    h.div([], [
      h.input([
        testId(h, 'title-input'),
        h.Type('text'),
        h.AriaLabel('Issue title'),
        h.Value(selection.titleDraft),
        h.OnInput(value => Message.UpdatedTitleInput({ value })),
      ]),
      h.button([testId(h, 'rename'), h.OnClick(Message.ClickedRename())], ['Rename']),
    ]),
    errorLine(h, selection.renameError, 'rename error'),
    h.button([testId(h, 'close'), h.OnClick(Message.ClickedClose())], ['Close']),
    errorLine(h, selection.closeError, 'close error'),
    commentsView(selection, h),
    h.div([], [
      h.input([
        testId(h, 'comment-input'),
        h.Type('text'),
        h.AriaLabel('Comment'),
        h.Value(selection.commentDraft),
        h.OnInput(value => Message.UpdatedCommentInput({ value })),
      ]),
      h.button([testId(h, 'post'), h.OnClick(Message.ClickedPost())], ['Post']),
    ]),
    errorLine(h, selection.postError, 'post error'),
    labelsView(selection, h),
    h.div([], [
      h.input([
        testId(h, 'label-input'),
        h.Type('text'),
        h.AriaLabel('Label'),
        h.Value(selection.labelDraft),
        h.OnInput(value => Message.UpdatedLabelInput({ value })),
      ]),
      h.button([testId(h, 'add-label'), h.OnClick(Message.ClickedAddLabel())], ['Add label']),
    ]),
    errorLine(h, selection.labelError, 'label error'),
    relatedView(selection, h),
  ])

const detailView = (issues: IssuesModel, h: H): Html =>
  h.div([testId(h, 'detail')], [
    Option.match(issues.selection, {
      onNone: () => h.p([], ['select an issue']),
      onSome: selection => selectedView(issues, selection, h),
    }),
  ])

const issuesView = (issues: IssuesModel, h: H): Html =>
  h.div([h.Class('flex flex-col gap-4')], [
    h.div([h.Class('flex gap-2 items-center')], [
      h.input([
        testId(h, 'user'),
        h.Type('text'),
        h.AriaLabel('Current user'),
        h.Value(issues.user),
        h.OnInput(value => Message.UpdatedUser({ value })),
      ]),
      filterButton(h, 'filter-open', 'Open', 'open', issues.filter),
      filterButton(h, 'filter-closed', 'Closed', 'closed', issues.filter),
    ]),
    listView(issues, h),
    h.p([testId(h, 'row-error')], [
      Option.match(issues.rowError, {
        onNone: () => '',
        onSome: error => `row error: ${error}`,
      }),
    ]),
    detailView(issues, h),
  ])

// HELP

const hitsList = (hits: ReadonlyArray<Hit>, selected: Option.Option<number>, h: H): Html =>
  h.ul(
    [],
    hits.map(hit => {
      const isSelected = Option.match(selected, {
        onNone: () => false,
        onSome: id => id === hit.id,
      })
      return h.keyed('li')(String(hit.id), [testId(h, 'hit'), h.OnClick(Message.ClickedHit({ id: hit.id }))], [
        isSelected ? `> ${hit.name}` : hit.name,
      ])
    }),
  )

const itemView = (item: ItemState, h: H): Html =>
  h.div([testId(h, 'item')], ItemState.match(item, {
    Empty: () => [h.p([], ['pick a result'])],
    Loading: () => [h.p([], ['loading…'])],
    Shown: ({ item: found }) => [h.h2([], [found.name]), h.p([], [found.blurb])],
    NotFound: ({ id }) => [h.p([], [`item ${id} not found`])],
    Failed: ({ error }) => [
      h.p([], [`failed: ${error}`]),
      h.button([testId(h, 'retry-item'), h.OnClick(Message.ClickedRetryItem())], ['Retry']),
    ],
  }))

const helpView = (help: HelpModel, h: H): Html =>
  h.div([h.Class('flex flex-col gap-4')], [
    h.input([
      testId(h, 'query'),
      h.Type('text'),
      h.AriaLabel('Search help'),
      h.Value(help.query),
      h.OnInput(value => Message.UpdatedQuery({ value })),
    ]),
    h.div([testId(h, 'results')], HelpResults.match(help.results, {
      Empty: () => [],
      TooShort: ({ query }) => [h.p([], [`too short: ${query}`])],
      Searching: ({ previous }) => [
        h.p([], ['searching…']),
        ...Option.match(previous, {
          onNone: () => [],
          onSome: shown => [hitsList(shown.hits, help.selected, h)],
        }),
      ],
      Found: ({ query, hits }) => [
        h.p([], [`${hits.length} results for ${query}`]),
        hitsList(hits, help.selected, h),
      ],
      Failed: ({ error }) => [h.p([], [`search failed: ${error}`])],
    })),
    itemView(help.item, h),
  ])

// SETTINGS

const settingsView = (settings: SettingsModel, h: H): Html =>
  h.div([h.Class('flex flex-col gap-4')], SettingsLoad.match(settings.load, {
    Loading: () => [h.p([testId(h, 'load')], ['Loading settings…'])],
    Failed: ({ error }) => [
      h.p([testId(h, 'load')], [`Could not load settings: ${error}`]),
      h.button([testId(h, 'retry-load'), h.OnClick(Message.ClickedRetryLoad())], ['Retry']),
    ],
    Loaded: ({ saved, draft, save, saveError }) => {
      const savedText =
        save._tag === 'Saving'
          ? `Saved: ${save.pending.name} · ${save.pending.theme} · ${save.pending.density} (saving…)`
          : `Saved: ${saved.name} · ${saved.theme} · ${saved.density}`
      return [
        h.p([testId(h, 'load')], ['']),
        h.p([testId(h, 'saved')], [savedText]),
        h.input([
          testId(h, 'name'),
          h.Type('text'),
          h.AriaLabel('Display name'),
          h.Value(draft.name),
          h.OnInput(value => Message.UpdatedName({ value })),
        ]),
        h.p([testId(h, 'name-count')], [`${draft.name.length}/20`]),
        h.p([testId(h, 'name-error')], [nameError(draft.name) ?? '']),
        h.button([testId(h, 'theme-light'), h.OnClick(Message.ClickedLightTheme())], ['Light']),
        h.button([testId(h, 'theme-dark'), h.OnClick(Message.ClickedDarkTheme())], ['Dark']),
        h.button([testId(h, 'density-toggle'), h.OnClick(Message.ClickedDensityToggle())], ['Density']),
        h.p([testId(h, 'preview')], [`Preview: ${draft.theme} / ${draft.density}`]),
        h.button([testId(h, 'save'), h.OnClick(Message.ClickedSave())], ['Save']),
        h.p([testId(h, 'save-error')], [
          Option.match(saveError, {
            onNone: () => '',
            onSome: error => `Save failed: ${error}`,
          }),
        ]),
      ]
    },
  }))

// VIEW

const pageView = (page: Page, h: H): Html => {
  if (page._tag === 'IssuesPage') {
    return issuesView(page.model, h)
  }
  if (page._tag === 'HelpPage') {
    return helpView(page.model, h)
  }
  return settingsView(page.model, h)
}

export const view = (model: Model, h: H): Document => ({
  title: 'Issue desk',
  body: h.div([h.Class('mx-auto flex max-w-3xl flex-col gap-4 p-6')], [
    tabsView(model, h),
    pageView(model.page, h),
  ]),
})
