import { Array, Option } from 'effect'
import { type Document, type Html, type HtmlBuilder } from 'foldkit/html'

import { Message } from './message'
import {
  CommentsLoad,
  DetailLoad,
  HelpItem,
  HelpPage,
  HelpResults,
  IssueList,
  IssueRow,
  IssuesPage,
  LabelsLoad,
  Model,
  Related,
  SettingsPage,
  Settings,
} from './model'
import { nameProblem } from './update'

// VIEW

export const view = (model: Model, h: HtmlBuilder<Message>): Document => ({
  title: 'Issue desk',
  body: h.div(
    [h.Class('mx-auto max-w-3xl p-4 flex flex-col gap-4')],
    [tabsView(model, h), pageView(model, h)],
  ),
})

const tabsView = (model: Model, h: HtmlBuilder<Message>): Html =>
  h.nav(
    [h.Class('flex gap-2')],
    [
      h.button(
        [
          h.DataAttribute('testid', 'tab-issues'),
          h.OnClick(Message.ClickedTab({ tab: 'issues' })),
        ],
        [
          Option.match(model.openCount, {
            onNone: () => 'Issues',
            onSome: count => `Issues (${count})`,
          }),
        ],
      ),
      h.button(
        [
          h.DataAttribute('testid', 'tab-help'),
          h.OnClick(Message.ClickedTab({ tab: 'help' })),
        ],
        ['Help'],
      ),
      h.button(
        [
          h.DataAttribute('testid', 'tab-settings'),
          h.OnClick(Message.ClickedTab({ tab: 'settings' })),
        ],
        ['Settings'],
      ),
    ],
  )

const pageView = (model: Model, h: HtmlBuilder<Message>): Html => {
  if (model.tab === 'issues') {
    return issuesView(model.issues, h)
  }
  if (model.tab === 'help') {
    return helpView(model.help, h)
  }
  return settingsView(model.settings, h)
}

const errorView = (
  label: string,
  error: Option.Option<string>,
  h: HtmlBuilder<Message>,
): Html =>
  Option.match(error, {
    onNone: () => h.empty,
    onSome: message => h.p([h.Class('text-red-600')], [`${label}: ${message}`]),
  })

// ISSUES

const issuesView = (issues: IssuesPage, h: HtmlBuilder<Message>): Html =>
  h.section(
    [h.DataAttribute('page', 'issues'), h.Class('flex flex-col gap-4')],
    [
      h.input([
        h.DataAttribute('testid', 'user'),
        h.AriaLabel('Current user'),
        h.Value(issues.user),
        h.OnInput(value => Message.UpdatedUser({ value })),
      ]),
      h.div(
        [h.Class('flex gap-2')],
        [
          h.button(
            [
              h.DataAttribute('testid', 'filter-open'),
              h.OnClick(Message.ClickedFilter({ filter: 'open' })),
            ],
            ['Open'],
          ),
          h.button(
            [
              h.DataAttribute('testid', 'filter-closed'),
              h.OnClick(Message.ClickedFilter({ filter: 'closed' })),
            ],
            ['Closed'],
          ),
        ],
      ),
      listView(issues, h),
      errorView('row error', issues.rowError, h),
      detailView(issues, h),
    ],
  )

const listView = (issues: IssuesPage, h: HtmlBuilder<Message>): Html =>
  h.div(
    [h.DataAttribute('testid', 'list')],
    IssueList.match(issues.list, {
      Loading: () => [h.p([], [`loading ${issues.filter} issues`])],
      Failed: ({ message }) => [h.p([], [`list error: ${message}`])],
      Loaded: ({ issues: rows }) => [
        h.ul(
          [],
          Array.map(
            Array.filter(rows, row => !row.closing),
            row => issueRowView(issues, row, h),
          ),
        ),
      ],
    }),
  )

const issueRowView = (
  issues: IssuesPage,
  row: IssueRow,
  h: HtmlBuilder<Message>,
): Html => {
  const assignee = Option.match(row.assignee, {
    onNone: () => 'unassigned',
    onSome: name => name,
  })
  return h.keyed('li')(String(row.id), [], [
    h.div(
      [
        h.DataAttribute('testid', 'issue'),
        h.OnClick(Message.ClickedIssueRow({ id: row.id })),
      ],
      [`#${row.id} ${row.title} (${assignee})`],
    ),
    h.button(
      [
        h.DataAttribute('testid', 'row-assign'),
        h.OnClick(Message.ClickedRowAssign({ id: row.id })),
      ],
      [`assign to ${issues.user}`],
    ),
    issues.filter === 'open'
      ? h.button(
          [
            h.DataAttribute('testid', 'row-close'),
            h.OnClick(Message.ClickedRowClose({ id: row.id })),
          ],
          ['close'],
        )
      : h.empty,
  ])
}

const detailView = (issues: IssuesPage, h: HtmlBuilder<Message>): Html =>
  h.section(
    [h.DataAttribute('testid', 'detail'), h.Class('flex flex-col gap-3')],
    Option.match(issues.selected, {
      onNone: () => [h.p([], ['select an issue'])],
      onSome: id => selectedDetailView(issues, id, h),
    }),
  )

const selectedDetailView = (
  issues: IssuesPage,
  id: number,
  h: HtmlBuilder<Message>,
): ReadonlyArray<Html> => [
  DetailLoad.match(issues.detail, {
    Loading: () => h.p([], [`loading #${id}`]),
    Found: ({ title, body }) =>
      h.div([], [h.h2([], [`#${id} ${title}`]), h.p([], [body])]),
    NotFound: () => h.p([], [`detail error: issue #${id} not found`]),
    Failed: ({ message }) => h.p([], [`detail error: ${message}`]),
  }),
  h.button(
    [h.DataAttribute('testid', 'retry'), h.OnClick(Message.ClickedRetryIssue())],
    ['retry'],
  ),
  h.button(
    [h.DataAttribute('testid', 'assign'), h.OnClick(Message.ClickedAssign())],
    [`assign to ${issues.user}`],
  ),
  errorView('assign error', issues.assignError, h),
  h.div(
    [h.Class('flex gap-2')],
    [
      h.input([
        h.DataAttribute('testid', 'title-input'),
        h.AriaLabel('New title'),
        h.Value(issues.titleInput),
        h.OnInput(value => Message.UpdatedTitleInput({ value })),
      ]),
      h.button(
        [h.DataAttribute('testid', 'rename'), h.OnClick(Message.ClickedRename())],
        ['rename'],
      ),
    ],
  ),
  errorView('rename error', issues.renameError, h),
  h.button(
    [h.DataAttribute('testid', 'close'), h.OnClick(Message.ClickedClose())],
    ['close'],
  ),
  errorView('close error', issues.closeError, h),
  commentsView(issues, h),
  h.div(
    [h.Class('flex gap-2')],
    [
      h.input([
        h.DataAttribute('testid', 'comment-input'),
        h.AriaLabel('Comment'),
        h.Value(issues.commentInput),
        h.OnInput(value => Message.UpdatedCommentInput({ value })),
      ]),
      h.button(
        [h.DataAttribute('testid', 'post'), h.OnClick(Message.ClickedPost())],
        ['post'],
      ),
    ],
  ),
  labelsView(issues, h),
  relatedView(issues, h),
]

const commentsView = (issues: IssuesPage, h: HtmlBuilder<Message>): Html =>
  h.div(
    [h.DataAttribute('testid', 'comments')],
    [
      ...CommentsLoad.match(issues.comments, {
        Loading: () => [h.p([], ['loading comments'])],
        Failed: ({ message }) => [h.p([], [`comments error: ${message}`])],
        Loaded: ({ rows }) => [
          h.ul(
            [],
            Array.map(rows, row =>
              h.keyed('li')(String(row.key), [h.DataAttribute('testid', 'comment')], [
                `${row.author}: ${row.text}${row.status === 'sending' ? ' (sending…)' : ''}`,
              ]),
            ),
          ),
        ],
      }),
      errorView('post error', issues.postError, h),
    ],
  )

const labelsView = (issues: IssuesPage, h: HtmlBuilder<Message>): Html =>
  h.div(
    [h.DataAttribute('testid', 'labels')],
    [
      ...LabelsLoad.match(issues.labels, {
        Loading: () => [h.p([], ['loading labels'])],
        Failed: ({ message }) => [h.p([], [`labels error: ${message}`])],
        Loaded: ({ rows }) => [
          h.ul(
            [],
            Array.map(
              Array.filter(rows, row => row.status !== 'removing'),
              row =>
                h.keyed('li')(row.name, [], [
                  h.span([h.DataAttribute('testid', 'label')], [row.name]),
                  row.status === 'saved'
                    ? h.button(
                        [
                          h.DataAttribute('testid', 'remove-label'),
                          h.OnClick(Message.ClickedRemoveLabel({ label: row.name })),
                        ],
                        [`remove ${row.name}`],
                      )
                    : h.empty,
                ]),
            ),
          ),
        ],
      }),
      errorView('label error', issues.labelError, h),
      h.div(
        [h.Class('flex gap-2')],
        [
          h.input([
            h.DataAttribute('testid', 'label-input'),
            h.AriaLabel('New label'),
            h.Value(issues.labelInput),
            h.OnInput(value => Message.UpdatedLabelInput({ value })),
          ]),
          h.button(
            [
              h.DataAttribute('testid', 'add-label'),
              h.OnClick(Message.ClickedAddLabel()),
            ],
            ['add label'],
          ),
        ],
      ),
    ],
  )

const relatedView = (issues: IssuesPage, h: HtmlBuilder<Message>): Html =>
  h.div(
    [h.DataAttribute('testid', 'related')],
    Related.match(issues.related, {
      Idle: () => [h.empty],
      Searching: () => [h.p([], ['finding related help'])],
      Failed: ({ message }) => [h.p([], [`related help failed: ${message}`])],
      Found: ({ hits }) =>
        hits.length === 0
          ? [h.p([], ['no related help'])]
          : Array.map(Array.take(hits, 3), hit =>
              h.keyed('button')(String(hit.id), [
                h.DataAttribute('testid', 'related-hit'),
                h.OnClick(Message.ClickedRelatedHit({ id: hit.id })),
              ], [hit.name]),
            ),
    }),
  )

// HELP

const helpView = (help: HelpPage, h: HtmlBuilder<Message>): Html =>
  h.section(
    [h.DataAttribute('page', 'help'), h.Class('flex flex-col gap-4')],
    [
      h.input([
        h.DataAttribute('testid', 'query'),
        h.AriaLabel('Search help'),
        h.Value(help.query),
        h.OnInput(value => Message.UpdatedQuery({ value })),
      ]),
      h.div(
        [h.DataAttribute('testid', 'results')],
        HelpResults.match(help.results, {
          Idle: () => [h.empty],
          TooShort: ({ query }) => [h.p([], [`too short: ${query}`])],
          Searching: ({ hits }) => [
            h.p([], ['searching…']),
            hitsView(hits, help, h),
          ],
          Found: ({ query, hits }) => [
            h.p([], [`${hits.length} results for ${query}`]),
            hitsView(hits, help, h),
          ],
          Failed: ({ message }) => [h.p([], [`search failed: ${message}`])],
        }),
      ),
      h.div(
        [h.DataAttribute('testid', 'item')],
        HelpItem.match(help.item, {
          Nothing: () => [h.p([], ['pick a result'])],
          Loading: () => [h.p([], ['loading…'])],
          Found: ({ item }) => [h.h3([], [item.name]), h.p([], [item.blurb])],
          NotFound: () => [
            h.p([], [
              `item ${Option.match(help.selectedHit, {
                onNone: () => '',
                onSome: String,
              })} not found`,
            ]),
          ],
          Failed: ({ message }) => [
            h.p([], [`failed: ${message}`]),
            h.button(
              [
                h.DataAttribute('testid', 'retry-item'),
                h.OnClick(Message.ClickedRetryItem()),
              ],
              ['retry'],
            ),
          ],
        }),
      ),
    ],
  )

const hitsView = (
  hits: ReadonlyArray<{ readonly id: number; readonly name: string }>,
  help: HelpPage,
  h: HtmlBuilder<Message>,
): Html =>
  h.ul(
    [],
    Array.map(hits, hit => {
      const selected = Option.match(help.selectedHit, {
        onNone: () => false,
        onSome: id => id === hit.id,
      })
      return h.keyed('li')(String(hit.id), [
        h.DataAttribute('testid', 'hit'),
        h.OnClick(Message.ClickedHit({ id: hit.id })),
      ], [`${selected ? '> ' : ''}${hit.name}`])
    }),
  )

// SETTINGS

const settingsView = (settings: SettingsPage, h: HtmlBuilder<Message>): Html =>
  h.section(
    [h.DataAttribute('page', 'settings'), h.Class('flex flex-col gap-3')],
    [
      SettingsPage.match(settings, {
        Loading: () => h.p([h.DataAttribute('testid', 'load')], ['Loading settings…']),
        LoadFailed: ({ message }) =>
          h.div([h.DataAttribute('testid', 'load')], [
            `Could not load settings: ${message}`,
            h.button(
              [
                h.DataAttribute('testid', 'retry-load'),
                h.OnClick(Message.ClickedRetryLoadSettings()),
              ],
              ['retry'],
            ),
          ]),
        Loaded: ({ saved, draft, saving, saveError }) =>
          h.div([], [
            h.p(
              [h.DataAttribute('testid', 'saved')],
              [
                Option.match(saving, {
                  onNone: () => savedLine(saved),
                  onSome: pending => `${savedLine(pending)} (saving…)`,
                }),
              ],
            ),
            draftView(draft, h),
            Option.match(saveError, {
              onNone: () => h.empty,
              onSome: message =>
                h.p([h.DataAttribute('testid', 'save-error')], [`Save failed: ${message}`]),
            }),
          ]),
      }),
    ],
  )

const savedLine = (settings: Settings): string =>
  `Saved: ${settings.name} · ${settings.theme} · ${settings.density}`

const draftView = (draft: Settings, h: HtmlBuilder<Message>): Html =>
  h.div(
    [h.Class('flex flex-col gap-2')],
    [
      h.input([
        h.DataAttribute('testid', 'name'),
        h.AriaLabel('Display name'),
        h.Value(draft.name),
        h.OnInput(value => Message.UpdatedSettingsName({ value })),
      ]),
      h.p([h.DataAttribute('testid', 'name-count')], [`${draft.name.length}/20`]),
      Option.match(nameProblem(draft.name), {
        onNone: () => h.empty,
        onSome: problem => h.p([h.DataAttribute('testid', 'name-error')], [problem]),
      }),
      h.div(
        [h.Class('flex gap-2')],
        [
          h.button(
            [
              h.DataAttribute('testid', 'theme-light'),
              h.OnClick(Message.ClickedSettingsTheme({ theme: 'light' })),
            ],
            ['light'],
          ),
          h.button(
            [
              h.DataAttribute('testid', 'theme-dark'),
              h.OnClick(Message.ClickedSettingsTheme({ theme: 'dark' })),
            ],
            ['dark'],
          ),
          h.button(
            [
              h.DataAttribute('testid', 'density-toggle'),
              h.OnClick(Message.ClickedDensityToggle()),
            ],
            [draft.density],
          ),
        ],
      ),
      h.p(
        [h.DataAttribute('testid', 'preview')],
        [`Preview: ${draft.theme} / ${draft.density}`],
      ),
      h.button(
        [h.DataAttribute('testid', 'save'), h.OnClick(Message.ClickedSaveSettings())],
        ['save'],
      ),
    ],
  )
