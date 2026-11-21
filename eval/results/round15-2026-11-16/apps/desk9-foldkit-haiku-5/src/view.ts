import { Array, Option } from 'effect'
import { type Document, type Html, type HtmlBuilder } from 'foldkit/html'

import { Message } from './message'
import {
  CommentsState,
  HelpPage,
  Hit,
  IssueDetailState,
  IssueList,
  IssueRow,
  IssuesPage,
  ItemState,
  LabelsState,
  Model,
  RelatedState,
  Results,
  SaveStatus,
  SelectedIssue,
  Settings,
  SettingsLoad,
} from './model'
import { DISPLAY_NAME_MAX, displayNameError, visibleRows } from './update'

// VIEW

const testId = (h: HtmlBuilder<Message>, id: string) =>
  h.DataAttribute('testid', id)

const CLASS_BUTTON =
  'px-3 py-1 rounded border border-gray-400 bg-white hover:bg-gray-100 disabled:opacity-50'
const CLASS_INPUT = 'px-2 py-1 rounded border border-gray-400'
const CLASS_SECTION = 'flex flex-col gap-2 p-3 border border-gray-200 rounded'

const tabButton = (
  h: HtmlBuilder<Message>,
  id: string,
  label: string,
  message: Message,
): Html =>
  h.button(
    [testId(h, id), h.Type('button'), h.OnClick(message), h.Class(CLASS_BUTTON)],
    [label],
  )

const tabsView = (model: Model, h: HtmlBuilder<Message>): Html => {
  const issuesLabel = Option.match(model.openCount, {
    onNone: () => 'Issues',
    onSome: count => `Issues (${count})`,
  })
  return h.div(
    [h.Class('flex gap-2')],
    [
      tabButton(h, 'tab-issues', issuesLabel, Message.ClickedTabIssues()),
      tabButton(h, 'tab-help', 'Help', Message.ClickedTabHelp()),
      tabButton(h, 'tab-settings', 'Settings', Message.ClickedTabSettings()),
    ],
  )
}

// ISSUES

const filterButton = (
  h: HtmlBuilder<Message>,
  id: string,
  label: string,
  filter: IssuesPage['filter'],
  current: IssuesPage['filter'],
): Html =>
  h.button(
    [
      testId(h, id),
      h.Type('button'),
      h.OnClick(Message.ClickedFilter({ filter })),
      h.Class(filter === current ? `${CLASS_BUTTON} font-bold` : CLASS_BUTTON),
    ],
    [label],
  )

const issueRowView = (
  h: HtmlBuilder<Message>,
  issues: IssuesPage,
  row: IssueRow,
): Html => {
  const assignee = Option.getOrElse(row.assignee, () => 'unassigned')
  const assignButton = h.button(
    [
      testId(h, 'row-assign'),
      h.Type('button'),
      h.OnClick(Message.ClickedRowAssign({ id: row.id })),
      h.Class(CLASS_BUTTON),
    ],
    [`assign to ${issues.user}`],
  )
  const closeButtons =
    issues.filter === 'open'
      ? [
          h.button(
            [
              testId(h, 'row-close'),
              h.Type('button'),
              h.OnClick(Message.ClickedRowClose({ id: row.id })),
              h.Class(CLASS_BUTTON),
            ],
            ['close'],
          ),
        ]
      : []
  return h.keyed('li')(
    String(row.id),
    [h.Class('flex items-center gap-2')],
    [
      h.button(
        [
          testId(h, 'issue'),
          h.Type('button'),
          h.OnClick(Message.ClickedIssueRow({ id: row.id })),
          h.Class('text-left flex-1 hover:underline'),
        ],
        [`#${row.id} ${row.title} (${assignee})`],
      ),
      assignButton,
      ...closeButtons,
    ],
  )
}

const listView = (h: HtmlBuilder<Message>, issues: IssuesPage): Html =>
  h.div(
    [testId(h, 'list')],
    IssueList.match<Array<Html>>(issues.list, {
      Loading: () => [h.p([], [`loading ${issues.filter} issues`])],
      Failed: ({ error }) => [h.p([], [`list error: ${error}`])],
      Loaded: () => [
        h.ul(
          [h.Class('flex flex-col gap-1')],
          visibleRows(issues).map(row => issueRowView(h, issues, row)),
        ),
      ],
    }),
  )

const rowErrorView = (h: HtmlBuilder<Message>, issues: IssuesPage): Html =>
  Option.match(issues.rowError, {
    onNone: () => h.empty,
    onSome: error => h.p([testId(h, 'row-error')], [`row error: ${error}`]),
  })

const errorLine = (
  h: HtmlBuilder<Message>,
  error: Option.Option<string>,
  prefix: string,
): Html =>
  Option.match(error, {
    onNone: () => h.empty,
    onSome: message => h.p([h.Class('text-red-700')], [`${prefix}: ${message}`]),
  })

const detailBody = (h: HtmlBuilder<Message>, selected: SelectedIssue): Array<Html> =>
  IssueDetailState.match<Array<Html>>(selected.detail, {
    Loading: () => [h.p([], [`loading #${selected.id}`])],
    Loaded: ({ title, body }) => [
      h.h2([], [`#${selected.id} ${title}`]),
      h.p([], [body]),
    ],
    NotFound: () => [
      h.p([], [`detail error: issue #${selected.id} not found`]),
    ],
    Failed: ({ error }) => [h.p([], [`detail error: ${error}`])],
  })

const assignSection = (
  h: HtmlBuilder<Message>,
  user: string,
  selected: SelectedIssue,
): Html =>
  h.div(
    [h.Class(CLASS_SECTION)],
    [
      h.button(
        [
          testId(h, 'assign'),
          h.Type('button'),
          h.OnClick(Message.ClickedAssign()),
          h.Class(CLASS_BUTTON),
        ],
        [`assign to ${user}`],
      ),
      errorLine(h, selected.assignError, 'assign error'),
    ],
  )

const renameSection = (h: HtmlBuilder<Message>, selected: SelectedIssue): Html =>
  h.div(
    [h.Class(CLASS_SECTION)],
    [
      h.div(
        [h.Class('flex gap-2')],
        [
          h.input([
            testId(h, 'title-input'),
            h.Type('text'),
            h.Value(selected.titleDraft),
            h.OnInput(value => Message.UpdatedTitleDraft({ value })),
            h.Class(CLASS_INPUT),
          ]),
          h.button(
            [
              testId(h, 'rename'),
              h.Type('button'),
              h.OnClick(Message.ClickedRename()),
              h.Class(CLASS_BUTTON),
            ],
            ['rename'],
          ),
        ],
      ),
      errorLine(h, selected.renameError, 'rename error'),
    ],
  )

const closeSection = (h: HtmlBuilder<Message>, selected: SelectedIssue): Html =>
  h.div(
    [h.Class(CLASS_SECTION)],
    [
      h.button(
        [
          testId(h, 'close'),
          h.Type('button'),
          h.OnClick(Message.ClickedClose()),
          h.Class(CLASS_BUTTON),
        ],
        ['close'],
      ),
      errorLine(h, selected.closeError, 'close error'),
    ],
  )

const commentsSection = (h: HtmlBuilder<Message>, selected: SelectedIssue): Html =>
  h.div(
    [testId(h, 'comments')],
    CommentsState.match<Array<Html>>(selected.comments, {
      Loading: () => [h.p([], ['loading comments'])],
      Failed: ({ error }) => [h.p([], [`comments error: ${error}`])],
      Loaded: ({ comments }) => [
        h.ul(
          [h.Class('flex flex-col gap-1')],
          comments.map(comment =>
            h.keyed('li')(
              String(comment.key),
              [testId(h, 'comment')],
              [
                comment.status === 'Sending'
                  ? `${comment.author}: ${comment.text} (sending…)`
                  : `${comment.author}: ${comment.text}`,
              ],
            ),
          ),
        ),
      ],
    }),
  )

const postSection = (h: HtmlBuilder<Message>, selected: SelectedIssue): Html =>
  h.div(
    [h.Class(CLASS_SECTION)],
    [
      h.div(
        [h.Class('flex gap-2')],
        [
          h.input([
            testId(h, 'comment-input'),
            h.Type('text'),
            h.Value(selected.commentDraft),
            h.OnInput(value => Message.UpdatedCommentDraft({ value })),
            h.Class(CLASS_INPUT),
          ]),
          h.button(
            [
              testId(h, 'post'),
              h.Type('button'),
              h.OnClick(Message.ClickedPost()),
              h.Class(CLASS_BUTTON),
            ],
            ['post'],
          ),
        ],
      ),
      errorLine(h, selected.postError, 'post error'),
    ],
  )

const labelsSection = (h: HtmlBuilder<Message>, selected: SelectedIssue): Html =>
  h.div(
    [testId(h, 'labels')],
    LabelsState.match<Array<Html>>(selected.labels, {
      Loading: () => [h.p([], ['loading labels'])],
      Failed: ({ error }) => [h.p([], [`labels error: ${error}`])],
      Loaded: ({ labels }) => [
        h.ul(
          [h.Class('flex gap-2 flex-wrap')],
          labels
            .filter(entry => entry.status !== 'Removing')
            .map(entry =>
              h.keyed('li')(
                String(entry.key),
                [h.Class('flex items-center gap-1')],
                [
                  h.span([testId(h, 'label')], [entry.name]),
                  ...(entry.status === 'Stable'
                    ? [
                        h.button(
                          [
                            testId(h, 'remove-label'),
                            h.Type('button'),
                            h.OnClick(
                              Message.ClickedRemoveLabel({ name: entry.name }),
                            ),
                            h.Class(CLASS_BUTTON),
                          ],
                          [`remove ${entry.name}`],
                        ),
                      ]
                    : []),
                ],
              ),
            ),
        ),
      ],
    }),
  )

const labelAddSection = (h: HtmlBuilder<Message>, selected: SelectedIssue): Html =>
  h.div(
    [h.Class(CLASS_SECTION)],
    [
      h.div(
        [h.Class('flex gap-2')],
        [
          h.input([
            testId(h, 'label-input'),
            h.Type('text'),
            h.Value(selected.labelDraft),
            h.OnInput(value => Message.UpdatedLabelDraft({ value })),
            h.Class(CLASS_INPUT),
          ]),
          h.button(
            [
              testId(h, 'add-label'),
              h.Type('button'),
              h.OnClick(Message.ClickedAddLabel()),
              h.Class(CLASS_BUTTON),
            ],
            ['add label'],
          ),
        ],
      ),
      errorLine(h, selected.labelError, 'label error'),
    ],
  )

const relatedHit = (h: HtmlBuilder<Message>, id: number, query: string, hit: Hit): Html =>
  h.keyed('li')(
    String(hit.id),
    [],
    [
      h.button(
        [
          testId(h, 'related-hit'),
          h.Type('button'),
          h.OnClick(Message.ClickedRelatedHit({ id: hit.id, query })),
          h.Class('text-left hover:underline'),
        ],
        [hit.name],
      ),
    ],
  )

const relatedSection = (h: HtmlBuilder<Message>, title: string, selected: SelectedIssue): Html =>
  h.div(
    [testId(h, 'related'), h.Class(CLASS_SECTION)],
    RelatedState.match<Array<Html>>(selected.related, {
      Idle: () => [],
      Loading: () => [h.p([], ['finding related help'])],
      Failed: ({ error }) => [h.p([], [`related help failed: ${error}`])],
      Loaded: ({ hits }) =>
        Array.match(hits, {
          onEmpty: () => [h.p([], ['no related help'])],
          onNonEmpty: nonEmpty => [
            h.ul(
              [h.Class('flex flex-col gap-1')],
              nonEmpty
                .slice(0, 3)
                .map(hit => relatedHit(h, hit.id, title, hit)),
            ),
          ],
        }),
    }),
  )

const selectedView = (
  h: HtmlBuilder<Message>,
  user: string,
  selected: SelectedIssue,
): Array<Html> => {
  const detailLoaded = IssueDetailState.match<boolean>(selected.detail, {
    Loading: () => false,
    Loaded: () => true,
    NotFound: () => false,
    Failed: () => false,
  })
  const title = IssueDetailState.match<string>(selected.detail, {
    Loading: () => '',
    Loaded: detail => detail.title,
    NotFound: () => '',
    Failed: () => '',
  })
  return [
    ...detailBody(h, selected),
    h.button(
      [
        testId(h, 'retry'),
        h.Type('button'),
        h.OnClick(Message.ClickedRetryDetail()),
        h.Class(CLASS_BUTTON),
      ],
      ['retry'],
    ),
    assignSection(h, user, selected),
    renameSection(h, selected),
    closeSection(h, selected),
    commentsSection(h, selected),
    postSection(h, selected),
    labelsSection(h, selected),
    labelAddSection(h, selected),
    ...(detailLoaded ? [relatedSection(h, title, selected)] : []),
  ]
}

const detailView = (h: HtmlBuilder<Message>, issues: IssuesPage): Html =>
  h.div(
    [testId(h, 'detail'), h.Class('flex flex-col gap-3')],
    Option.match(issues.selected, {
      onNone: () => [h.p([], ['select an issue'])],
      onSome: selected => selectedView(h, issues.user, selected),
    }),
  )

const issuesView = (h: HtmlBuilder<Message>, issues: IssuesPage): Html =>
  h.div(
    [h.Class('flex flex-col gap-4')],
    [
      h.label(
        [h.Class('flex items-center gap-2')],
        [
          'Current user',
          h.input([
            testId(h, 'user'),
            h.Type('text'),
            h.Value(issues.user),
            h.OnInput(value => Message.UpdatedUser({ value })),
            h.Class(CLASS_INPUT),
          ]),
        ],
      ),
      h.div(
        [h.Class('flex gap-2')],
        [
          filterButton(h, 'filter-open', 'Open', 'open', issues.filter),
          filterButton(h, 'filter-closed', 'Closed', 'closed', issues.filter),
        ],
      ),
      listView(h, issues),
      rowErrorView(h, issues),
      detailView(h, issues),
    ],
  )

// HELP

const hitsView = (
  h: HtmlBuilder<Message>,
  hits: ReadonlyArray<Hit>,
  selectedHit: Option.Option<number>,
): Html =>
  h.ul(
    [h.Class('flex flex-col gap-1')],
    hits.map(hit => {
      const isSelected = Option.getOrElse(
        Option.map(selectedHit, id => id === hit.id),
        () => false,
      )
      return h.keyed('li')(
        String(hit.id),
        [testId(h, 'hit'), h.OnClick(Message.ClickedHit({ id: hit.id })), h.Class('cursor-pointer hover:underline')],
        [isSelected ? `> ${hit.name}` : hit.name],
      )
    }),
  )

const resultsView = (h: HtmlBuilder<Message>, page: HelpPage): Html =>
  h.div(
    [testId(h, 'results')],
    Results.match<Array<Html>>(page.results, {
      Idle: () => [],
      TooShort: ({ query }) => [h.p([], [`too short: ${query}`])],
      Searching: ({ shown }) => [
        h.p([], ['searching…']),
        hitsView(h, shown, page.selectedHit),
      ],
      Loaded: ({ query, hits }) => [
        h.p([], [`${hits.length} results for ${query}`]),
        hitsView(h, hits, page.selectedHit),
      ],
      Failed: ({ error }) => [h.p([], [`search failed: ${error}`])],
    }),
  )

const itemView = (h: HtmlBuilder<Message>, page: HelpPage): Html =>
  h.div(
    [testId(h, 'item')],
    ItemState.match<Array<Html>>(page.item, {
      Idle: () => [h.p([], ['pick a result'])],
      Loading: () => [h.p([], ['loading…'])],
      Loaded: ({ item }) => [h.h2([], [item.name]), h.p([], [item.blurb])],
      NotFound: ({ id }) => [h.p([], [`item ${id} not found`])],
      Failed: ({ error }) => [
        h.p([], [`failed: ${error}`]),
        h.button(
          [
            testId(h, 'retry-item'),
            h.Type('button'),
            h.OnClick(Message.ClickedRetryItem()),
            h.Class(CLASS_BUTTON),
          ],
          ['retry'],
        ),
      ],
    }),
  )

const helpView = (h: HtmlBuilder<Message>, page: HelpPage): Html =>
  h.div(
    [h.Class('flex flex-col gap-4')],
    [
      h.input([
        testId(h, 'query'),
        h.Type('text'),
        h.Value(page.query),
        h.OnInput(value => Message.UpdatedQuery({ value })),
        h.Class(CLASS_INPUT),
      ]),
      resultsView(h, page),
      itemView(h, page),
    ],
  )

// SETTINGS

const savedLine = (h: HtmlBuilder<Message>, saved: Settings, save: SaveStatus): Html => {
  const shown = SaveStatus.match<Settings>(save, {
    Idle: () => saved,
    Saving: ({ settings }) => settings,
    Failed: () => saved,
  })
  const suffix = SaveStatus.match<string>(save, {
    Idle: () => '',
    Saving: () => ' (saving…)',
    Failed: () => '',
  })
  return h.p(
    [testId(h, 'saved')],
    [`Saved: ${shown.name} · ${shown.theme} · ${shown.density}${suffix}`],
  )
}

const themeButton = (h: HtmlBuilder<Message>, theme: 'light' | 'dark'): Html =>
  h.button(
    [
      testId(h, `theme-${theme}`),
      h.Type('button'),
      h.OnClick(Message.ClickedDraftTheme({ theme })),
      h.Class(CLASS_BUTTON),
    ],
    [theme],
  )

const settingsForm = (
  h: HtmlBuilder<Message>,
  draft: Settings,
  save: SaveStatus,
): Array<Html> => [
  h.label(
    [h.Class('flex items-center gap-2')],
    [
      'Display name',
      h.input([
        testId(h, 'name'),
        h.Type('text'),
        h.Value(draft.name),
        h.OnInput(value => Message.UpdatedDraftName({ value })),
        h.Class(CLASS_INPUT),
      ]),
    ],
  ),
  h.span([testId(h, 'name-count')], [`${draft.name.length}/${DISPLAY_NAME_MAX}`]),
  Option.match(displayNameError(draft.name), {
    onNone: () => h.empty,
    onSome: message => h.p([testId(h, 'name-error')], [message]),
  }),
  h.div([h.Class('flex gap-2')], [themeButton(h, 'light'), themeButton(h, 'dark')]),
  h.button(
    [
      testId(h, 'density-toggle'),
      h.Type('button'),
      h.OnClick(Message.ClickedDensityToggle()),
      h.Class(CLASS_BUTTON),
    ],
    [`Density: ${draft.density}`],
  ),
  h.p(
    [testId(h, 'preview')],
    [`Preview: ${draft.theme} / ${draft.density}`],
  ),
  h.button(
    [testId(h, 'save'), h.Type('button'), h.OnClick(Message.ClickedSave()), h.Class(CLASS_BUTTON)],
    ['save'],
  ),
  SaveStatus.match<Html>(save, {
    Idle: () => h.empty,
    Saving: () => h.empty,
    Failed: ({ error }) => h.p([testId(h, 'save-error')], [`Save failed: ${error}`]),
  }),
]

const settingsView = (h: HtmlBuilder<Message>, load: SettingsLoad): Html =>
  h.div(
    [h.Class('flex flex-col gap-4')],
    SettingsLoad.match<Array<Html>>(load, {
      Loading: () => [
        h.p([testId(h, 'load')], ['Loading settings…']),
      ],
      Failed: ({ error }) => [
        h.div(
          [testId(h, 'load')],
          [
            h.span([], [`Could not load settings: ${error}`]),
            h.button(
              [
                testId(h, 'retry-load'),
                h.Type('button'),
                h.OnClick(Message.ClickedRetryLoad()),
                h.Class(CLASS_BUTTON),
              ],
              ['retry'],
            ),
          ],
        ),
      ],
      Loaded: ({ saved, draft, save }) => [
        h.div([testId(h, 'load')]),
        savedLine(h, saved, save),
        h.div([h.Class('flex flex-col gap-3')], settingsForm(h, draft, save)),
      ],
    }),
  )

// VIEW

const pageView = (model: Model, h: HtmlBuilder<Message>): Html => {
  if (model.tab === 'issues') {
    return issuesView(h, model.issues)
  }
  if (model.tab === 'help') {
    return helpView(h, model.help)
  }
  return settingsView(h, model.settings.load)
}

export const view = (model: Model, h: HtmlBuilder<Message>): Document => ({
  title: 'Issue desk',
  body: h.div(
    [h.Class('min-h-screen bg-white text-gray-900 p-4 max-w-3xl mx-auto flex flex-col gap-4')],
    [tabsView(model, h), pageView(model, h)],
  ),
})
