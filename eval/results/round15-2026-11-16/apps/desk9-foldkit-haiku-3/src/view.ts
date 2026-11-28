import { Array as EffectArray, Option } from 'effect'
import { AsyncData } from 'foldkit'
import { Document, Html, HtmlBuilder } from 'foldkit/html'

import { Message } from './message.js'
import {
  HelpModel,
  HelpPane,
  HitResults,
  Hit,
  Issue,
  IssuesModel,
  Model,
  Page,
  SelectedIssue,
  SettingsForm,
  SettingsModel,
  nameProblem,
} from './model.js'

// VIEW

const tabClass = 'px-4 py-2 rounded-t-lg border-b-2 border-transparent hover:bg-slate-200'
const buttonClass = 'px-3 py-1 rounded-md border border-slate-300 bg-white hover:bg-slate-100'
const inputClass = 'px-2 py-1 rounded-md border border-slate-300 bg-white'

const errorLine = (
  error: Option.Option<string>,
  h: HtmlBuilder<Message>,
): Html =>
  Option.match(error, {
    onNone: () => h.empty,
    onSome: message => h.p([h.Class('text-red-700')], [message]),
  })

const tabsView = (model: Model, h: HtmlBuilder<Message>): Html => {
  const issuesLabel = Option.match(model.openCount, {
    onNone: () => 'Issues',
    onSome: count => `Issues (${count})`,
  })
  return h.nav(
    [h.Class('flex gap-2 border-b border-slate-300')],
    [
      h.button(
        [
          h.Type('button'),
          h.DataAttribute('testid', 'tab-issues'),
          h.Class(tabClass),
          h.OnClick(Message.ClickedTabIssues()),
        ],
        [issuesLabel],
      ),
      h.button(
        [
          h.Type('button'),
          h.DataAttribute('testid', 'tab-help'),
          h.Class(tabClass),
          h.OnClick(Message.ClickedTabHelp()),
        ],
        ['Help'],
      ),
      h.button(
        [
          h.Type('button'),
          h.DataAttribute('testid', 'tab-settings'),
          h.Class(tabClass),
          h.OnClick(Message.ClickedTabSettings()),
        ],
        ['Settings'],
      ),
    ],
  )
}

const issueRowView = (
  issues: IssuesModel,
  issue: Issue,
  h: HtmlBuilder<Message>,
): Html =>
  h.keyed('li')(
    issue.id,
    [h.Class('flex items-center gap-2 py-1')],
    [
      h.button(
        [
          h.Type('button'),
          h.DataAttribute('testid', 'issue'),
          h.Class('flex-1 text-left'),
          h.OnClick(Message.SelectedIssue({ id: issue.id })),
        ],
        [`#${issue.id} ${issue.title} (${issue.assignee ?? 'unassigned'})`],
      ),
      h.button(
        [
          h.Type('button'),
          h.DataAttribute('testid', 'row-assign'),
          h.Class(buttonClass),
          h.OnClick(Message.ClickedRowAssign({ id: issue.id })),
        ],
        [`assign to ${issues.user}`],
      ),
      ...(issues.filter === 'open'
        ? [
            h.button(
              [
                h.Type('button'),
                h.DataAttribute('testid', 'row-close'),
                h.Class(buttonClass),
                h.OnClick(Message.ClickedRowClose({ id: issue.id })),
              ],
              ['close'],
            ),
          ]
        : []),
    ],
  )

const listView = (issues: IssuesModel, h: HtmlBuilder<Message>): Html =>
  h.div(
    [h.DataAttribute('testid', 'list')],
    [
      AsyncData.matchDataSplitEmpty(issues.list, {
        onIdle: () => h.empty,
        onLoading: () => h.p([], [`loading ${issues.filter} issues`]),
        onFailure: error => h.p([], [`list error: ${error}`]),
        onData: rows =>
          h.ul(
            [],
            rows.map(issue => issueRowView(issues, issue, h)),
          ),
      }),
    ],
  )

const commentsView = (selected: SelectedIssue, h: HtmlBuilder<Message>): Html =>
  h.div(
    [h.DataAttribute('testid', 'comments')],
    [
      AsyncData.matchDataSplitEmpty(selected.comments, {
        onIdle: () => h.empty,
        onLoading: () => h.p([], ['loading comments']),
        onFailure: error => h.p([], [`comments error: ${error}`]),
        onData: rows =>
          h.ul(
            [],
            rows.map(row =>
              h.keyed('li')(
                row.id,
                [h.DataAttribute('testid', 'comment')],
                [
                  row.status === 'Sending'
                    ? `${row.author}: ${row.text} (sending…)`
                    : `${row.author}: ${row.text}`,
                ],
              ),
            ),
          ),
      }),
    ],
  )

const labelsView = (selected: SelectedIssue, h: HtmlBuilder<Message>): Html =>
  h.div(
    [h.DataAttribute('testid', 'labels')],
    [
      AsyncData.matchDataSplitEmpty(selected.labels, {
        onIdle: () => h.empty,
        onLoading: () => h.p([], ['loading labels']),
        onFailure: error => h.p([], [`labels error: ${error}`]),
        onData: rows =>
          h.ul(
            [],
            rows.map(row =>
              h.keyed('li')(
                row.id,
                [h.Class('flex items-center gap-2')],
                [
                  h.span([h.DataAttribute('testid', 'label')], [row.name]),
                  h.button(
                    [
                      h.Type('button'),
                      h.DataAttribute('testid', 'remove-label'),
                      h.Class(buttonClass),
                      h.OnClick(Message.ClickedRemoveLabel({ labelId: row.id })),
                    ],
                    [`remove ${row.name}`],
                  ),
                ],
              ),
            ),
          ),
      }),
    ],
  )

const relatedView = (
  selected: SelectedIssue,
  title: string,
  h: HtmlBuilder<Message>,
): Html =>
  h.div(
    [h.DataAttribute('testid', 'related')],
    [
      AsyncData.matchDataSplitEmpty(selected.related, {
        onIdle: () => h.empty,
        onLoading: () => h.p([], ['finding related help']),
        onFailure: error => h.p([], [`related help failed: ${error}`]),
        onData: hits =>
          EffectArray.isReadonlyArrayEmpty(hits)
            ? h.p([], ['no related help'])
            : h.div(
                [],
                hits
                  .slice(0, 3)
                  .map(hit =>
                    h.keyed('button')(
                      hit.id,
                      [
                        h.Type('button'),
                        h.DataAttribute('testid', 'related-hit'),
                        h.Class(buttonClass),
                        h.OnClick(
                          Message.ClickedRelatedHit({ id: hit.id, query: title }),
                        ),
                      ],
                      [hit.name],
                    ),
                  ),
              ),
      }),
    ],
  )

const detailBodyView = (selected: SelectedIssue, h: HtmlBuilder<Message>): Html =>
  AsyncData.matchDataSplitEmpty(selected.detail, {
    onIdle: () => h.empty,
    onLoading: () => h.p([], [`loading #${selected.id}`]),
    onFailure: error => h.p([], [`detail error: ${error}`]),
    onData: issue =>
      issue === null
        ? h.p([], [`detail error: issue #${selected.id} not found`])
        : h.div(
            [],
            [h.h2([], [`#${issue.id} ${issue.title}`]), h.p([], [issue.body])],
          ),
  })

const selectedView = (
  user: string,
  selected: SelectedIssue,
  h: HtmlBuilder<Message>,
): Html => {
  const loadedTitle = AsyncData.isSuccess(selected.detail) && selected.detail.data !== null
    ? selected.detail.data.title
    : undefined
  return h.div(
    [h.Class('flex flex-col gap-3')],
    [
      detailBodyView(selected, h),
      h.button(
        [
          h.Type('button'),
          h.DataAttribute('testid', 'retry'),
          h.Class(buttonClass),
          h.OnClick(Message.ClickedRetryIssue()),
        ],
        ['retry'],
      ),
      h.div(
        [h.Class('flex flex-wrap gap-2 items-center')],
        [
          h.button(
            [
              h.Type('button'),
              h.DataAttribute('testid', 'assign'),
              h.Class(buttonClass),
              h.OnClick(Message.ClickedAssign()),
            ],
            [`assign to ${user}`],
          ),
          h.input([
            h.Type('text'),
            h.DataAttribute('testid', 'title-input'),
            h.AriaLabel('New title'),
            h.Class(inputClass),
            h.Value(selected.titleInput),
            h.OnInput(value => Message.UpdatedTitleInput({ value })),
          ]),
          h.button(
            [
              h.Type('button'),
              h.DataAttribute('testid', 'rename'),
              h.Class(buttonClass),
              h.OnClick(Message.ClickedRename()),
            ],
            ['rename'],
          ),
          h.button(
            [
              h.Type('button'),
              h.DataAttribute('testid', 'close'),
              h.Class(buttonClass),
              h.OnClick(Message.ClickedClose()),
            ],
            ['close'],
          ),
        ],
      ),
      errorLine(selected.assignError, h),
      errorLine(selected.renameError, h),
      errorLine(selected.closeError, h),
      commentsView(selected, h),
      h.div(
        [h.Class('flex gap-2 items-center')],
        [
          h.input([
            h.Type('text'),
            h.DataAttribute('testid', 'comment-input'),
            h.AriaLabel('Comment'),
            h.Class(inputClass),
            h.Value(selected.commentInput),
            h.OnInput(value => Message.UpdatedCommentInput({ value })),
          ]),
          h.button(
            [
              h.Type('button'),
              h.DataAttribute('testid', 'post'),
              h.Class(buttonClass),
              h.OnClick(Message.ClickedPost()),
            ],
            ['post'],
          ),
        ],
      ),
      errorLine(selected.postError, h),
      labelsView(selected, h),
      h.div(
        [h.Class('flex gap-2 items-center')],
        [
          h.input([
            h.Type('text'),
            h.DataAttribute('testid', 'label-input'),
            h.AriaLabel('Label'),
            h.Class(inputClass),
            h.Value(selected.labelInput),
            h.OnInput(value => Message.UpdatedLabelInput({ value })),
          ]),
          h.button(
            [
              h.Type('button'),
              h.DataAttribute('testid', 'add-label'),
              h.Class(buttonClass),
              h.OnClick(Message.ClickedAddLabel()),
            ],
            ['add label'],
          ),
        ],
      ),
      errorLine(selected.labelError, h),
      loadedTitle === undefined
        ? h.empty
        : relatedView(selected, loadedTitle, h),
    ],
  )
}

const detailView = (issues: IssuesModel, h: HtmlBuilder<Message>): Html =>
  h.section(
    [h.DataAttribute('testid', 'detail'), h.Class('flex flex-col gap-3')],
    [
      Option.match(issues.selected, {
        onNone: () => h.p([], ['select an issue']),
        onSome: selected => selectedView(issues.user, selected, h),
      }),
    ],
  )

const issuesView = (issues: IssuesModel, h: HtmlBuilder<Message>): Html =>
  h.div(
    [h.DataAttribute('testid', 'issues-page'), h.Class('grid gap-6 md:grid-cols-2')],
    [
      h.div(
        [h.Class('flex flex-col gap-3')],
        [
          h.div(
            [h.Class('flex flex-wrap items-center gap-2')],
            [
              h.input([
                h.Type('text'),
                h.DataAttribute('testid', 'user'),
                h.AriaLabel('Current user'),
                h.Class(inputClass),
                h.Value(issues.user),
                h.OnInput(value => Message.UpdatedUser({ value })),
              ]),
              h.button(
                [
                  h.Type('button'),
                  h.DataAttribute('testid', 'filter-open'),
                  h.Class(buttonClass),
                  h.OnClick(Message.ClickedFilter({ filter: 'open' })),
                ],
                ['Open'],
              ),
              h.button(
                [
                  h.Type('button'),
                  h.DataAttribute('testid', 'filter-closed'),
                  h.Class(buttonClass),
                  h.OnClick(Message.ClickedFilter({ filter: 'closed' })),
                ],
                ['Closed'],
              ),
            ],
          ),
          listView(issues, h),
          Option.match(issues.rowError, {
            onNone: () => h.empty,
            onSome: message =>
              h.p(
                [h.DataAttribute('testid', 'row-error'), h.Class('text-red-700')],
                [message],
              ),
          }),
        ],
      ),
      detailView(issues, h),
    ],
  )

const selectedHitId = (pane: typeof HelpPane.Type): number | undefined =>
  HelpPane.match(pane, {
    NoneSelected: (): number | undefined => undefined,
    Loading: ({ id }): number | undefined => id,
    Loaded: ({ item }): number | undefined => item.id,
    NotFound: ({ id }): number | undefined => id,
    Failed: ({ id }): number | undefined => id,
  })

const hitsView = (
  hits: ReadonlyArray<Hit>,
  selectedId: number | undefined,
  h: HtmlBuilder<Message>,
): Html =>
  h.ul(
    [],
    hits.map(hit =>
      h.keyed('li')(
        hit.id,
        [
          h.DataAttribute('testid', 'hit'),
          h.Class('cursor-pointer py-0.5'),
          h.OnClick(Message.SelectedHit({ id: hit.id })),
        ],
        [selectedId === hit.id ? `> ${hit.name}` : hit.name],
      ),
    ),
  )

const resultsView = (
  results: typeof HitResults.Type,
  selectedId: number | undefined,
  h: HtmlBuilder<Message>,
): Html =>
  h.div(
    [h.DataAttribute('testid', 'results')],
    [
      HitResults.match(results, {
        Idle: () => h.empty,
        TooShort: ({ query }) => h.p([], [`too short: ${query}`]),
        Searching: ({ shown }) =>
          h.div([], [h.p([], ['searching…']), hitsView(shown, selectedId, h)]),
        Found: ({ query, hits }) =>
          h.div(
            [],
            [
              h.p([], [`${hits.length} results for ${query}`]),
              hitsView(hits, selectedId, h),
            ],
          ),
        Failed: ({ error }) => h.p([], [`search failed: ${error}`]),
      }),
    ],
  )

const itemView = (pane: typeof HelpPane.Type, h: HtmlBuilder<Message>): Html =>
  h.section(
    [h.DataAttribute('testid', 'item')],
    [
      HelpPane.match(pane, {
        NoneSelected: () => h.p([], ['pick a result']),
        Loading: () => h.p([], ['loading…']),
        Loaded: ({ item }) =>
          h.div([], [h.h3([], [item.name]), h.p([], [item.blurb])]),
        NotFound: ({ id }) => h.p([], [`item ${id} not found`]),
        Failed: ({ error }) =>
          h.div(
            [],
            [
              h.p([], [`failed: ${error}`]),
              h.button(
                [
                  h.Type('button'),
                  h.DataAttribute('testid', 'retry-item'),
                  h.Class(buttonClass),
                  h.OnClick(Message.ClickedRetryItem()),
                ],
                ['retry'],
              ),
            ],
          ),
      }),
    ],
  )

const helpView = (help: HelpModel, h: HtmlBuilder<Message>): Html =>
  h.section(
    [h.DataAttribute('testid', 'help-page'), h.Class('grid gap-6 md:grid-cols-2')],
    [
      h.div(
        [h.Class('flex flex-col gap-3')],
        [
          h.input([
            h.Type('text'),
            h.DataAttribute('testid', 'query'),
            h.AriaLabel('Search help'),
            h.Class(inputClass),
            h.Value(help.query),
            h.OnInput(value => Message.UpdatedQuery({ value })),
          ]),
          resultsView(
            help.results,
            HelpPane.match(help.pane, {
              NoneSelected: (): number | undefined => undefined,
              Loading: ({ id }): number | undefined => id,
              Loaded: ({ item }): number | undefined => item.id,
              NotFound: ({ id }): number | undefined => id,
              Failed: ({ id }): number | undefined => id,
            }),
            h,
          ),
        ],
      ),
      itemView(help.pane, h),
    ],
  )

const formView = (form: SettingsForm, h: HtmlBuilder<Message>): Html => {
  const savedLine = Option.match(form.saving, {
    onNone: () =>
      `Saved: ${form.saved.name} · ${form.saved.theme} · ${form.saved.density}`,
    onSome: pending =>
      `Saved: ${pending.name} · ${pending.theme} · ${pending.density} (saving…)`,
  })
  return h.div(
    [h.Class('flex flex-col gap-3')],
    [
      h.p([h.DataAttribute('testid', 'saved')], [savedLine]),
      h.input([
        h.Type('text'),
        h.DataAttribute('testid', 'name'),
        h.AriaLabel('Display name'),
        h.Class(inputClass),
        h.Value(form.draft.name),
        h.OnInput(value => Message.UpdatedName({ value })),
      ]),
      h.p(
        [h.DataAttribute('testid', 'name-count')],
        [`${form.draft.name.length}/20`],
      ),
      Option.match(nameProblem(form.draft.name), {
        onNone: () => h.empty,
        onSome: message =>
          h.p(
            [h.DataAttribute('testid', 'name-error'), h.Class('text-red-700')],
            [message],
          ),
      }),
      h.div(
        [h.Class('flex gap-2')],
        [
          h.button(
            [
              h.Type('button'),
              h.DataAttribute('testid', 'theme-light'),
              h.Class(buttonClass),
              h.OnClick(Message.ClickedTheme({ theme: 'light' })),
            ],
            ['Light'],
          ),
          h.button(
            [
              h.Type('button'),
              h.DataAttribute('testid', 'theme-dark'),
              h.Class(buttonClass),
              h.OnClick(Message.ClickedTheme({ theme: 'dark' })),
            ],
            ['Dark'],
          ),
          h.button(
            [
              h.Type('button'),
              h.DataAttribute('testid', 'density-toggle'),
              h.Class(buttonClass),
              h.OnClick(Message.ClickedDensityToggle()),
            ],
            ['Toggle density'],
          ),
        ],
      ),
      h.p(
        [h.DataAttribute('testid', 'preview')],
        [`Preview: ${form.draft.theme} / ${form.draft.density}`],
      ),
      h.button(
        [
          h.Type('button'),
          h.DataAttribute('testid', 'save'),
          h.Class(buttonClass),
          h.OnClick(Message.ClickedSave()),
        ],
        ['Save'],
      ),
      Option.match(form.saveError, {
        onNone: () => h.empty,
        onSome: message =>
          h.p(
            [h.DataAttribute('testid', 'save-error'), h.Class('text-red-700')],
            [message],
          ),
      }),
    ],
  )
}

const settingsView = (settings: SettingsModel, h: HtmlBuilder<Message>): Html =>
  h.section(
    [h.DataAttribute('testid', 'settings-page')],
    [
      h.div(
        [h.DataAttribute('testid', 'load')],
        [
          AsyncData.matchDataSplitEmpty(settings.form, {
            onIdle: () => h.empty,
            onLoading: () => h.p([], ['Loading settings…']),
            onFailure: error =>
              h.div(
                [],
                [
                  h.p([], [`Could not load settings: ${error}`]),
                  h.button(
                    [
                      h.Type('button'),
                      h.DataAttribute('testid', 'retry-load'),
                      h.Class(buttonClass),
                      h.OnClick(Message.ClickedRetryLoad()),
                    ],
                    ['retry'],
                  ),
                ],
              ),
            onData: () => h.empty,
          }),
        ],
      ),
      AsyncData.matchDataSplitEmpty(settings.form, {
        onIdle: () => h.empty,
        onLoading: () => h.empty,
        onFailure: () => h.empty,
        onData: form => formView(form, h),
      }),
    ],
  )

export const view = (model: Model, h: HtmlBuilder<Message>): Document => ({
  title: 'Issue desk',
  body: h.div(
    [h.Class('min-h-screen bg-slate-50 text-slate-900 p-4 md:p-6 flex flex-col gap-4')],
    [
      tabsView(model, h),
      Page.match(model.page, {
        IssuesPage: ({ issues }) => issuesView(issues, h),
        HelpPage: ({ help }) => helpView(help, h),
        SettingsPage: ({ settings }) => settingsView(settings, h),
      }),
    ],
  ),
})
