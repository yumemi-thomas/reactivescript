import { Array, Option } from 'effect'
import { Document, Html, HtmlBuilder } from 'foldkit/html'

import {
  firstRelatedHits,
  maybeShownResults,
  maybeVisibleLabels,
  MIN_QUERY_LENGTH,
  queryLength,
  visibleRows,
  visibleTitle,
} from './derive'
import {
  Issue,
  NAME_MAX_LENGTH,
  NameValidity,
  Settings,
  nameLength,
  validateName,
} from './domain'
import { Message, Tab } from './message'
import {
  CommentsState,
  DetailState,
  HelpPage,
  IssueList,
  IssuesPage,
  ItemState,
  LabelsState,
  Model,
  Page,
  RelatedState,
  Results,
  Selection,
  SettingsForm,
  SettingsPage,
  ShownResults,
} from './model'

type H = HtmlBuilder<Message>

const testId = (h: H, id: string) => h.DataAttribute('testid', id)

const errorLine = (h: H, id: string, text: string): Html =>
  h.p([testId(h, id), h.Class('error'), h.Role('alert')], [text])

const maybeErrorLine = (
  h: H,
  id: string,
  maybeError: Option.Option<string>,
  toText: (error: string) => string,
): Html =>
  Option.match(maybeError, {
    onNone: () => h.empty,
    onSome: error => errorLine(h, id, toText(error)),
  })

const textInput = (
  h: H,
  id: string,
  label: string,
  value: string,
  toMessage: (value: string) => Message,
): Html =>
  h.label(
    [h.Class('field')],
    [
      h.span([h.Class('field-label')], [label]),
      h.input([
        testId(h, id),
        h.Type('text'),
        h.Value(value),
        h.OnInput(toMessage),
      ]),
    ],
  )

const button = (
  h: H,
  id: string,
  text: string,
  message: Message,
): Html =>
  h.button([testId(h, id), h.Type('button'), h.OnClick(message)], [text])

// TABS

const tabButton = (
  h: H,
  tab: Tab,
  id: string,
  text: string,
  isCurrent: boolean,
): Html =>
  h.button(
    [
      testId(h, id),
      h.Type('button'),
      h.Role('tab'),
      h.AriaSelected(isCurrent),
      h.Class(isCurrent ? 'tab current' : 'tab'),
      h.OnClick(Message.ClickedTab({ tab })),
    ],
    [text],
  )

const tabsView = (model: Model, h: H): Html => {
  const issuesLabel = Option.match(model.maybeOpenCount, {
    onNone: () => 'Issues',
    onSome: count => `Issues (${count})`,
  })
  return h.nav(
    [h.Role('tablist'), h.Class('tabs')],
    [
      tabButton(
        h,
        'Issues',
        'tab-issues',
        issuesLabel,
        model.page._tag === 'IssuesTab',
      ),
      tabButton(h, 'Help', 'tab-help', 'Help', model.page._tag === 'HelpTab'),
      tabButton(
        h,
        'Settings',
        'tab-settings',
        'Settings',
        model.page._tag === 'SettingsTab',
      ),
    ],
  )
}

// ISSUES

const assigneeText = (issue: Issue): string =>
  Option.getOrElse(issue.maybeAssignee, () => 'unassigned')

const issueRow = (
  issues: IssuesPage,
  issue: Issue,
  h: H,
): Html => {
  const isSelected = Option.exists(
    issues.maybeSelection,
    selection => selection.issueId === issue.id,
  )
  return h.keyed('li')(
    String(issue.id),
    [h.Class(isSelected ? 'row selected' : 'row')],
    [
      h.button(
        [
          testId(h, 'issue'),
          h.Type('button'),
          h.Class('issue'),
          h.AriaPressed(String(isSelected)),
          h.OnClick(Message.ClickedIssue({ issueId: issue.id })),
        ],
        [`#${issue.id} ${issue.title} (${assigneeText(issue)})`],
      ),
      button(
        h,
        'row-assign',
        `assign to ${issues.user}`,
        Message.ClickedRowAssign({ issueId: issue.id }),
      ),
      issues.filter === 'open'
        ? button(
            h,
            'row-close',
            'close',
            Message.ClickedRowClose({ issueId: issue.id }),
          )
        : h.empty,
    ],
  )
}

const listView = (issues: IssuesPage, h: H): Html =>
  h.div(
    [testId(h, 'list'), h.Class('list'), h.AriaLive('polite')],
    [
      IssueList.match(issues.list, {
        ListLoading: () => h.p([], [`loading ${issues.filter} issues`]),
        ListFailed: ({ error }) =>
          h.p([h.Class('error')], [`list error: ${error}`]),
        ListLoaded: ({ issues: confirmed }) =>
          Array.match(visibleRows(issues, confirmed), {
            onEmpty: () => h.p([], [`no ${issues.filter} issues`]),
            onNonEmpty: rows =>
              h.ul(
                [h.Class('rows')],
                Array.map(rows, issue => issueRow(issues, issue, h)),
              ),
          }),
      }),
    ],
  )

const commentsView = (selection: Selection, h: H): Html =>
  h.div(
    [testId(h, 'comments'), h.Class('comments')],
    [
      h.h3([], ['Comments']),
      CommentsState.match(selection.comments, {
        CommentsLoading: () => h.p([], ['loading comments']),
        CommentsFailed: ({ error }) =>
          h.p([h.Class('error')], [`comments error: ${error}`]),
        CommentsLoaded: () => h.empty,
      }),
      h.ul(
        [],
        [
          ...(selection.comments._tag === 'CommentsLoaded'
            ? Array.map(selection.comments.comments, comment =>
                h.li(
                  [testId(h, 'comment')],
                  [`${comment.author}: ${comment.text}`],
                ),
              )
            : []),
          ...Array.map(selection.posts, post =>
            h.keyed('li')(
              `post-${post.opId}`,
              [testId(h, 'comment')],
              [
                post.status === 'Sending'
                  ? `${post.author}: ${post.text} (sending…)`
                  : `${post.author}: ${post.text}`,
              ],
            ),
          ),
        ],
      ),
    ],
  )

const labelsView = (selection: Selection, h: H): Html =>
  h.div(
    [testId(h, 'labels'), h.Class('labels')],
    [
      h.h3([], ['Labels']),
      LabelsState.match(selection.labels, {
        LabelsLoading: () => h.p([], ['loading labels']),
        LabelsFailed: ({ error }) =>
          h.p([h.Class('error')], [`labels error: ${error}`]),
        LabelsLoaded: () =>
          h.ul(
            [h.Class('label-list')],
            Array.map(
              Option.getOrElse(maybeVisibleLabels(selection), () => []),
              label =>
                h.keyed('li')(
                  label,
                  [h.Class('label-item')],
                  [
                    h.span([testId(h, 'label'), h.Class('label')], [label]),
                    button(
                      h,
                      'remove-label',
                      `remove ${label}`,
                      Message.ClickedRemoveLabel({ label }),
                    ),
                  ],
                ),
            ),
          ),
      }),
    ],
  )

const relatedView = (selection: Selection, h: H): Html =>
  RelatedState.matchOrElse<Html>(
    selection.related,
    {
      RelatedLoading: () =>
        h.div([testId(h, 'related')], ['finding related help']),
      RelatedFailed: ({ error }) =>
        h.div(
          [testId(h, 'related'), h.Class('error')],
          [`related help failed: ${error}`],
        ),
      RelatedLoaded: ({ hits }) =>
        h.div(
          [testId(h, 'related'), h.Class('related')],
          [
            Array.match(firstRelatedHits(hits), {
              onEmpty: () => h.p([], ['no related help']),
              onNonEmpty: shown =>
                h.ul(
                  [],
                  Array.map(shown, hit =>
                    h.keyed('li')(String(hit.id), [], [
                      button(
                        h,
                        'related-hit',
                        hit.name,
                        Message.ClickedRelatedHit({ hitId: hit.id }),
                      ),
                    ]),
                  ),
                ),
            }),
          ],
        ),
    },
    () => h.empty,
  )

const detailHeading = (
  issues: IssuesPage,
  selection: Selection,
  h: H,
): Html =>
  DetailState.match(selection.detail, {
    DetailLoading: () => h.p([], [`loading #${selection.issueId}`]),
    DetailMissing: () =>
      h.p(
        [h.Class('error')],
        [`detail error: issue #${selection.issueId} not found`],
      ),
    DetailFailed: ({ error }) =>
      h.p([h.Class('error')], [`detail error: ${error}`]),
    DetailLoaded: ({ issue }) =>
      h.div(
        [],
        [
          h.h2(
            [],
            [`#${issue.id} ${visibleTitle(issues, issue.id, issue.title)}`],
          ),
          h.p([h.Class('body')], [issue.body]),
        ],
      ),
  })

const selectionView = (
  issues: IssuesPage,
  selection: Selection,
  h: H,
): Html =>
  h.div(
    [h.Class('selection')],
    [
      detailHeading(issues, selection, h),
      button(h, 'retry', 'retry', Message.ClickedRetryIssue()),
      h.div(
        [h.Class('actions')],
        [
          button(
            h,
            'assign',
            `assign to ${issues.user}`,
            Message.ClickedAssign(),
          ),
          maybeErrorLine(h, 'assign-error', selection.maybeAssignError, error => error),
          button(h, 'close', 'close', Message.ClickedClose()),
          maybeErrorLine(
            h,
            'close-error',
            selection.maybeCloseError,
            error => `close error: ${error}`,
          ),
        ],
      ),
      h.div(
        [h.Class('form-row')],
        [
          textInput(h, 'title-input', 'New title', selection.titleInput, value =>
            Message.UpdatedTitleInput({ value }),
          ),
          button(h, 'rename', 'rename', Message.ClickedRename()),
          maybeErrorLine(
            h,
            'rename-error',
            selection.maybeRenameError,
            error => `rename error: ${error}`,
          ),
        ],
      ),
      labelsView(selection, h),
      h.div(
        [h.Class('form-row')],
        [
          textInput(h, 'label-input', 'Label', selection.labelInput, value =>
            Message.UpdatedLabelInput({ value }),
          ),
          button(h, 'add-label', 'add label', Message.ClickedAddLabel()),
          maybeErrorLine(
            h,
            'label-error',
            selection.maybeLabelError,
            error => `label error: ${error}`,
          ),
        ],
      ),
      commentsView(selection, h),
      h.div(
        [h.Class('form-row')],
        [
          textInput(
            h,
            'comment-input',
            'Comment',
            selection.commentInput,
            value => Message.UpdatedCommentInput({ value }),
          ),
          button(h, 'post', 'post', Message.ClickedPost()),
          maybeErrorLine(
            h,
            'post-error',
            selection.maybePostError,
            error => `post error: ${error}`,
          ),
        ],
      ),
      relatedView(selection, h),
    ],
  )

const detailView = (issues: IssuesPage, h: H): Html =>
  h.section(
    [testId(h, 'detail'), h.Class('detail')],
    [
      Option.match(issues.maybeSelection, {
        onNone: () => h.p([], ['select an issue']),
        onSome: selection => selectionView(issues, selection, h),
      }),
    ],
  )

const issuesView = (issues: IssuesPage, h: H): Html =>
  h.main(
    [h.Class('page issues')],
    [
      textInput(h, 'user', 'Current user', issues.user, value =>
        Message.UpdatedUser({ value }),
      ),
      h.div(
        [h.Class('filters')],
        [
          h.button(
            [
              testId(h, 'filter-open'),
              h.Type('button'),
              h.AriaPressed(String(issues.filter === 'open')),
              h.OnClick(Message.ClickedFilter({ filter: 'open' })),
            ],
            ['open'],
          ),
          h.button(
            [
              testId(h, 'filter-closed'),
              h.Type('button'),
              h.AriaPressed(String(issues.filter === 'closed')),
              h.OnClick(Message.ClickedFilter({ filter: 'closed' })),
            ],
            ['closed'],
          ),
        ],
      ),
      maybeErrorLine(
        h,
        'row-error',
        issues.maybeRowError,
        error => `row error: ${error}`,
      ),
      h.div([h.Class('columns')], [listView(issues, h), detailView(issues, h)]),
    ],
  )

// HELP

const shownResultsView = (
  help: HelpPage,
  shown: ShownResults,
  h: H,
): Html =>
  h.div(
    [],
    [
      h.p([], [`${shown.hits.length} results for ${shown.query}`]),
      h.ul(
        [],
        Array.map(shown.hits, hit => {
          const isSelected = Option.exists(
            help.maybeSelectedHit,
            selectedHit => selectedHit.hitId === hit.id,
          )
          return h.keyed('li')(
            String(hit.id),
            [
              testId(h, 'hit'),
              h.Class(isSelected ? 'hit selected' : 'hit'),
              h.Role('button'),
              h.Tabindex(0),
              h.AriaSelected(isSelected),
              h.OnClick(Message.ClickedHit({ hitId: hit.id })),
            ],
            [isSelected ? `> ${hit.name}` : hit.name],
          )
        }),
      ),
    ],
  )

const resultsView = (help: HelpPage, h: H): Html => {
  const length = queryLength(help.query)
  return h.div(
    [testId(h, 'results'), h.Class('results'), h.AriaLive('polite')],
    [
      length === 0
        ? h.empty
        : length < MIN_QUERY_LENGTH
          ? h.p([], [`too short: ${help.query}`])
          : Results.match(help.results, {
              ResultsNone: () => h.empty,
              ResultsSearching: ({ maybeShown }) =>
                h.div(
                  [],
                  [
                    h.p([], ['searching…']),
                    Option.match(maybeShown, {
                      onNone: () => h.empty,
                      onSome: shown => shownResultsView(help, shown, h),
                    }),
                  ],
                ),
              ResultsFailed: ({ error }) =>
                h.p([h.Class('error')], [`search failed: ${error}`]),
              ResultsLoaded: ({ shown }) => shownResultsView(help, shown, h),
            }),
    ],
  )
}

const itemView = (help: HelpPage, h: H): Html =>
  h.section(
    [testId(h, 'item'), h.Class('item'), h.AriaLive('polite')],
    [
      Option.match(help.maybeSelectedHit, {
        onNone: () => h.p([], ['pick a result']),
        onSome: selectedHit =>
          ItemState.match(selectedHit.item, {
            ItemLoading: () => h.p([], ['loading…']),
            ItemMissing: () =>
              h.p([h.Class('error')], [`item ${selectedHit.hitId} not found`]),
            ItemFailed: ({ error }) =>
              h.div(
                [],
                [
                  h.p([h.Class('error')], [`failed: ${error}`]),
                  button(h, 'retry-item', 'retry', Message.ClickedRetryItem()),
                ],
              ),
            ItemLoaded: ({ item }) =>
              h.div(
                [],
                [h.h2([], [item.name]), h.p([], [item.blurb])],
              ),
          }),
      }),
    ],
  )

const helpView = (help: HelpPage, h: H): Html =>
  h.main(
    [h.Class('page help')],
    [
      textInput(h, 'query', 'Search help', help.query, value =>
        Message.UpdatedQuery({ value }),
      ),
      h.div([h.Class('columns')], [resultsView(help, h), itemView(help, h)]),
    ],
  )

// SETTINGS

const settingsLine = (settings: Settings): string =>
  `${settings.name} · ${settings.theme} · ${settings.density}`

const nameErrorText = (validity: NameValidity): Option.Option<string> =>
  NameValidity.match(validity, {
    ValidName: () => Option.none(),
    EmptyName: () => Option.some('Display name is required'),
    LongName: ({ length }) =>
      Option.some(
        `Display name must be at most ${NAME_MAX_LENGTH} characters, not ${length}`,
      ),
  })

const settingsFormView = (form: SettingsForm, h: H): Html =>
  h.div(
    [h.Class('settings-form')],
    [
      h.p(
        [testId(h, 'saved')],
        [
          Option.match(form.maybeSaving, {
            onNone: () => `Saved: ${settingsLine(form.saved)}`,
            onSome: saving =>
              `Saved: ${settingsLine(saving.settings)} (saving…)`,
          }),
        ],
      ),
      maybeErrorLine(
        h,
        'save-error',
        form.maybeSaveError,
        error => `Save failed: ${error}`,
      ),
      textInput(h, 'name', 'Display name', form.draft.name, value =>
        Message.UpdatedName({ value }),
      ),
      h.span(
        [testId(h, 'name-count')],
        [`${nameLength(form.draft.name)}/${NAME_MAX_LENGTH}`],
      ),
      maybeErrorLine(
        h,
        'name-error',
        nameErrorText(validateName(form.draft.name)),
        error => error,
      ),
      h.div(
        [h.Class('form-row')],
        [
          h.button(
            [
              testId(h, 'theme-light'),
              h.Type('button'),
              h.AriaPressed(String(form.draft.theme === 'light')),
              h.OnClick(Message.ClickedTheme({ theme: 'light' })),
            ],
            ['light'],
          ),
          h.button(
            [
              testId(h, 'theme-dark'),
              h.Type('button'),
              h.AriaPressed(String(form.draft.theme === 'dark')),
              h.OnClick(Message.ClickedTheme({ theme: 'dark' })),
            ],
            ['dark'],
          ),
          button(
            h,
            'density-toggle',
            `density: ${form.draft.density}`,
            Message.ClickedDensityToggle(),
          ),
        ],
      ),
      h.p(
        [testId(h, 'preview')],
        [`Preview: ${form.draft.theme} / ${form.draft.density}`],
      ),
      button(h, 'save', 'save', Message.ClickedSave()),
    ],
  )

const settingsView = (settings: SettingsPage, h: H): Html =>
  h.main(
    [h.Class('page settings')],
    [
      SettingsPage.match(settings, {
        SettingsLoading: () => h.p([testId(h, 'load')], ['Loading settings…']),
        SettingsFailed: ({ error }) =>
          h.div(
            [testId(h, 'load')],
            [
              h.p([h.Class('error')], [`Could not load settings: ${error}`]),
              button(h, 'retry-load', 'retry', Message.ClickedRetryLoad()),
            ],
          ),
        SettingsReady: ({ form }) => settingsFormView(form, h),
      }),
    ],
  )

// VIEW

export const view = (model: Model, h: H): Document => ({
  title: 'Issue desk',
  body: h.div(
    [h.Class('app')],
    [
      tabsView(model, h),
      Page.match(model.page, {
        IssuesTab: ({ issues }) => issuesView(issues, h),
        HelpTab: ({ help }) => helpView(help, h),
        SettingsTab: ({ settings }) => settingsView(settings, h),
      }),
    ],
  ),
})
