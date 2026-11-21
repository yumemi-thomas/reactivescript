import { Array, Option } from 'effect'
import { Document, Html, HtmlBuilder } from 'foldkit/html'

import {
  type Hit,
  IssueRow,
  MAX_NAME_LENGTH,
  type Settings,
  maybeNameError,
  nameLength,
} from './domain'
import { Message } from './message'
import {
  CommentsState,
  DetailState,
  HelpModel,
  IssueList,
  IssuesModel,
  ItemState,
  LabelsState,
  Model,
  Page,
  RelatedState,
  Results,
  Selection,
  SettingsForm,
  SettingsModel,
  shownIssues,
  shownLabels,
  shownTitle,
} from './model'

type H = HtmlBuilder<Message>

const MAX_RELATED_HITS = 3

const testId = (h: H, id: string) => h.DataAttribute('testid', id)

const button = (
  h: H,
  id: string,
  message: Message,
  label: string,
): Html =>
  h.button([testId(h, id), h.Type('button'), h.OnClick(message)], [label])

const errorLine = (
  h: H,
  maybeError: Option.Option<string>,
  toText: (error: string) => string,
  id?: string,
): Html =>
  Option.match(maybeError, {
    onNone: () => h.empty,
    onSome: error =>
      h.p(
        [h.Class('error'), h.Role('alert'), ...(id === undefined ? [] : [testId(h, id)])],
        [toText(error)],
      ),
  })

// TABS

const tabsView = (model: Model, h: H): Html => {
  const issuesLabel = Option.match(model.maybeOpenCount, {
    onNone: () => 'Issues',
    onSome: count => `Issues (${count})`,
  })
  const currentTag = model.page._tag
  const tabButton = (
    id: string,
    tab: 'issues' | 'help' | 'settings',
    label: string,
    isCurrent: boolean,
  ) =>
    h.button(
      [
        testId(h, id),
        h.Type('button'),
        h.Role('tab'),
        h.AriaSelected(isCurrent),
        h.Class(isCurrent ? 'tab current' : 'tab'),
        h.OnClick(Message.ClickedTab({ tab })),
      ],
      [label],
    )
  return h.nav(
    [h.Class('tabs'), h.Role('tablist')],
    [
      tabButton('tab-issues', 'issues', issuesLabel, currentTag === 'IssuesPage'),
      tabButton('tab-help', 'help', 'Help', currentTag === 'HelpPage'),
      tabButton(
        'tab-settings',
        'settings',
        'Settings',
        currentTag === 'SettingsPage',
      ),
    ],
  )
}

// ISSUES

const issueText = (issue: IssueRow): string =>
  `#${issue.id} ${issue.title} (${Option.getOrElse(issue.maybeAssignee, () => 'unassigned')})`

const issueRowView = (page: IssuesModel, issue: IssueRow, h: H): Html =>
  h.keyed('li')(String(issue.id), [h.Class('issue-row')], [
    h.span(
      [
        testId(h, 'issue'),
        h.Class('issue'),
        h.Role('button'),
        h.Tabindex(0),
        h.OnClick(Message.ClickedIssue({ issueId: issue.id })),
      ],
      [issueText(issue)],
    ),
    button(
      h,
      'row-assign',
      Message.ClickedRowAssign({ issueId: issue.id }),
      `assign to ${page.user}`,
    ),
    page.filter === 'open'
      ? button(
          h,
          'row-close',
          Message.ClickedRowClose({ issueId: issue.id }),
          'close',
        )
      : h.empty,
  ])

const listView = (page: IssuesModel, h: H): Html =>
  h.div(
    [testId(h, 'list'), h.Class('list')],
    [
      IssueList.match<Html>(page.list, {
        LoadingIssues: () => h.p([], [`loading ${page.filter} issues`]),
        FailedIssues: ({ error }) =>
          h.p([h.Class('error')], [`list error: ${error}`]),
        LoadedIssues: ({ issues }) =>
          h.ul(
            [],
            Array.map(shownIssues(page, issues), issue =>
              issueRowView(page, issue, h),
            ),
          ),
      }),
    ],
  )

const textInput = (
  h: H,
  id: string,
  label: string,
  value: string,
  toMessage: (value: string) => Message,
): Html =>
  h.input([
    testId(h, id),
    h.Type('text'),
    h.AriaLabel(label),
    h.Value(value),
    h.OnInput(toMessage),
  ])

const relatedView = (selection: Selection, h: H): Html =>
  h.div(
    [testId(h, 'related'), h.Class('related')],
    [
      RelatedState.match<Html>(selection.related, {
        RelatedIdle: () => h.p([], ['finding related help']),
        LoadingRelated: () => h.p([], ['finding related help']),
        FailedRelated: ({ error }) =>
          h.p([h.Class('error')], [`related help failed: ${error}`]),
        LoadedRelated: ({ hits }) =>
          Array.match(Array.take(hits, MAX_RELATED_HITS), {
            onEmpty: () => h.p([], ['no related help']),
            onNonEmpty: shown =>
              h.ul(
                [],
                Array.map(shown, (hit: Hit) =>
                  h.keyed('li')(String(hit.id), [], [
                    button(
                      h,
                      'related-hit',
                      Message.ClickedRelatedHit({ hitId: hit.id }),
                      hit.name,
                    ),
                  ]),
                ),
              ),
          }),
      }),
    ],
  )

const commentsView = (selection: Selection, h: H): Html => {
  const postRows = Array.map(selection.posts, post =>
    h.keyed('li')(`post-${post.opId}`, [testId(h, 'comment')], [
      post.status === 'Sending'
        ? `${post.comment.author}: ${post.comment.text} (sending…)`
        : `${post.comment.author}: ${post.comment.text}`,
    ]),
  )
  return h.div(
    [testId(h, 'comments'), h.Class('comments')],
    [
      CommentsState.match<Html>(selection.comments, {
        LoadingComments: () => h.p([], ['loading comments']),
        FailedComments: ({ error }) =>
          h.p([h.Class('error')], [`comments error: ${error}`]),
        LoadedComments: () => h.empty,
      }),
      h.ul(
        [],
        Array.appendAll(
          selection.comments._tag === 'LoadedComments'
            ? Array.map(selection.comments.comments, (comment, index) =>
                h.keyed('li')(`comment-${index}`, [testId(h, 'comment')], [
                  `${comment.author}: ${comment.text}`,
                ]),
              )
            : [],
          postRows,
        ),
      ),
    ],
  )
}

const labelsView = (selection: Selection, h: H): Html =>
  h.div(
    [testId(h, 'labels'), h.Class('labels')],
    [
      LabelsState.match<Html>(selection.labels, {
        LoadingLabels: () => h.p([], ['loading labels']),
        FailedLabels: ({ error }) =>
          h.p([h.Class('error')], [`labels error: ${error}`]),
        LoadedLabels: ({ labels }) =>
          h.ul(
            [],
            Array.map(shownLabels(selection, labels), label =>
              h.keyed('li')(label, [h.Class('label-row')], [
                h.span([testId(h, 'label'), h.Class('label')], [label]),
                button(
                  h,
                  'remove-label',
                  Message.ClickedRemoveLabel({ label }),
                  `remove ${label}`,
                ),
              ]),
            ),
          ),
      }),
    ],
  )

const detailHeadingView = (
  page: IssuesModel,
  selection: Selection,
  h: H,
): Html =>
  DetailState.match<Html>(selection.detail, {
    LoadingDetail: () => h.p([], [`loading #${selection.issueId}`]),
    MissingDetail: () =>
      h.p(
        [h.Class('error')],
        [`detail error: issue #${selection.issueId} not found`],
      ),
    FailedDetail: ({ error }) =>
      h.p([h.Class('error')], [`detail error: ${error}`]),
    LoadedDetail: ({ detail }) =>
      h.div(
        [],
        [
          h.h2([], [`#${detail.id} ${shownTitle(page, detail)}`]),
          h.p([h.Class('body')], [detail.body]),
        ],
      ),
  })

const selectionView = (
  page: IssuesModel,
  selection: Selection,
  h: H,
): ReadonlyArray<Html> => [
  detailHeadingView(page, selection, h),
  button(h, 'retry', Message.ClickedRetryIssue(), 'retry'),
  h.div(
    [h.Class('actions')],
    [
      button(h, 'assign', Message.ClickedAssign(), `assign to ${page.user}`),
      errorLine(h, selection.maybeAssignError, error => error),
      textInput(h, 'title-input', 'New title', selection.titleInput, value =>
        Message.UpdatedTitleInput({ value }),
      ),
      button(h, 'rename', Message.ClickedRename(), 'rename'),
      errorLine(h, selection.maybeRenameError, error => `rename error: ${error}`),
      button(h, 'close', Message.ClickedClose(), 'close'),
      errorLine(h, selection.maybeCloseError, error => `close error: ${error}`),
    ],
  ),
  selection.detail._tag === 'LoadedDetail' ? relatedView(selection, h) : h.empty,
  commentsView(selection, h),
  h.div(
    [h.Class('post')],
    [
      textInput(
        h,
        'comment-input',
        'Comment',
        selection.commentInput,
        value => Message.UpdatedCommentInput({ value }),
      ),
      button(h, 'post', Message.ClickedPost(), 'post'),
      errorLine(h, selection.maybePostError, error => `post error: ${error}`),
    ],
  ),
  labelsView(selection, h),
  h.div(
    [h.Class('add-label')],
    [
      textInput(h, 'label-input', 'Label', selection.labelInput, value =>
        Message.UpdatedLabelInput({ value }),
      ),
      button(h, 'add-label', Message.ClickedAddLabel(), 'add label'),
      errorLine(h, selection.maybeLabelError, error => `label error: ${error}`),
    ],
  ),
]

const detailView = (page: IssuesModel, h: H): Html =>
  h.section(
    [testId(h, 'detail'), h.Class('detail')],
    Option.match(page.maybeSelection, {
      onNone: () => [h.p([], ['select an issue'])],
      onSome: selection => [...selectionView(page, selection, h)],
    }),
  )

const issuesView = (page: IssuesModel, h: H): Html =>
  h.main(
    [h.Class('issues')],
    [
      h.label(
        [],
        [
          'Current user ',
          textInput(h, 'user', 'Current user', page.user, value =>
            Message.UpdatedUser({ value }),
          ),
        ],
      ),
      h.div(
        [h.Class('filters')],
        [
          h.button(
            [
              testId(h, 'filter-open'),
              h.Type('button'),
              h.AriaPressed(page.filter === 'open' ? 'true' : 'false'),
              h.OnClick(Message.ClickedFilter({ filter: 'open' })),
            ],
            ['open'],
          ),
          h.button(
            [
              testId(h, 'filter-closed'),
              h.Type('button'),
              h.AriaPressed(page.filter === 'closed' ? 'true' : 'false'),
              h.OnClick(Message.ClickedFilter({ filter: 'closed' })),
            ],
            ['closed'],
          ),
        ],
      ),
      listView(page, h),
      errorLine(h, page.maybeRowError, error => `row error: ${error}`, 'row-error'),
      detailView(page, h),
    ],
  )

// HELP

const hitsView = (
  help: HelpModel,
  query: string,
  hits: ReadonlyArray<Hit>,
  h: H,
): ReadonlyArray<Html> => [
  h.p([], [`${hits.length} results for ${query}`]),
  h.ul(
    [],
    Array.map(hits, hit =>
      h.keyed('li')(
        String(hit.id),
        [
          testId(h, 'hit'),
          h.Class('hit'),
          h.Role('button'),
          h.Tabindex(0),
          h.OnClick(Message.ClickedHit({ hitId: hit.id })),
        ],
        [
          Option.contains(help.maybeSelectedHitId, hit.id)
            ? `> ${hit.name}`
            : hit.name,
        ],
      ),
    ),
  ),
]

const resultsView = (help: HelpModel, h: H): Html =>
  h.div(
    [testId(h, 'results'), h.Class('results')],
    Results.match<ReadonlyArray<Html>>(help.results, {
      NoQuery: () => [],
      TooShort: ({ query }) => [h.p([], [`too short: ${query}`])],
      Searching: ({ maybePrevious }) => [
        h.p([], ['searching…']),
        ...Option.match(maybePrevious, {
          onNone: (): ReadonlyArray<Html> => [],
          onSome: previous => hitsView(help, previous.query, previous.hits, h),
        }),
      ],
      Found: ({ query, hits }) => hitsView(help, query, hits, h),
      SearchFailed: ({ error }) => [
        h.p([h.Class('error')], [`search failed: ${error}`]),
      ],
    }).slice(),
  )

const itemView = (help: HelpModel, h: H): Html =>
  h.div(
    [testId(h, 'item'), h.Class('item')],
    ItemState.match<Array<Html>>(help.item, {
      NoItem: () => [h.p([], ['pick a result'])],
      LoadingItem: () => [h.p([], ['loading…'])],
      LoadedItem: ({ item }) => [
        h.h2([], [item.name]),
        h.p([], [item.blurb]),
      ],
      MissingItem: ({ hitId }) => [h.p([], [`item ${hitId} not found`])],
      FailedItem: ({ error }) => [
        h.p([h.Class('error')], [`failed: ${error}`]),
        button(h, 'retry-item', Message.ClickedRetryItem(), 'retry'),
      ],
    }),
  )

const helpView = (help: HelpModel, h: H): Html =>
  h.main(
    [h.Class('help')],
    [
      textInput(h, 'query', 'Search help', help.query, value =>
        Message.UpdatedQuery({ value }),
      ),
      resultsView(help, h),
      itemView(help, h),
    ],
  )

// SETTINGS

const settingsLine = (settings: Settings): string =>
  `${settings.name} · ${settings.theme} · ${settings.density}`

const formView = (form: SettingsForm, h: H): ReadonlyArray<Html> => [
  h.p(
    [testId(h, 'saved')],
    [
      Option.match(form.maybeSaving, {
        onNone: () => `Saved: ${settingsLine(form.saved)}`,
        onSome: saving => `Saved: ${settingsLine(saving.settings)} (saving…)`,
      }),
    ],
  ),
  h.div(
    [h.Class('form')],
    [
      h.label(
        [],
        [
          'Display name ',
          textInput(h, 'name', 'Display name', form.draft.name, value =>
            Message.UpdatedName({ value }),
          ),
        ],
      ),
      h.span(
        [testId(h, 'name-count')],
        [`${nameLength(form.draft.name)}/${MAX_NAME_LENGTH}`],
      ),
      errorLine(h, maybeNameError(form.draft.name), error => error, 'name-error'),
      h.div(
        [],
        [
          button(h, 'theme-light', Message.ClickedTheme({ theme: 'light' }), 'light'),
          button(h, 'theme-dark', Message.ClickedTheme({ theme: 'dark' }), 'dark'),
          button(
            h,
            'density-toggle',
            Message.ClickedDensityToggle(),
            form.draft.density,
          ),
        ],
      ),
      h.p(
        [testId(h, 'preview')],
        [`Preview: ${form.draft.theme} / ${form.draft.density}`],
      ),
      button(h, 'save', Message.ClickedSave(), 'save'),
      errorLine(h, form.maybeSaveError, error => `Save failed: ${error}`, 'save-error'),
    ],
  ),
]

const settingsView = (settings: SettingsModel, h: H): Html =>
  h.main(
    [h.Class('settings')],
    SettingsModel.match<ReadonlyArray<Html>>(settings, {
      LoadingSettings: () => [h.p([testId(h, 'load')], ['Loading settings…'])],
      FailedSettings: ({ error }) => [
        h.p(
          [testId(h, 'load'), h.Class('error')],
          [`Could not load settings: ${error}`],
        ),
        button(h, 'retry-load', Message.ClickedRetryLoad(), 'retry'),
      ],
      LoadedSettings: ({ form }) => formView(form, h),
    }).slice(),
  )

// VIEW

export const view = (model: Model, h: H): Document => ({
  title: 'Issue desk',
  body: h.div(
    [h.Class('desk')],
    [
      tabsView(model, h),
      Page.match<Html>(model.page, {
        IssuesPage: ({ issues }) => issuesView(issues, h),
        HelpPage: ({ help }) => helpView(help, h),
        SettingsPage: ({ settings }) => settingsView(settings, h),
      }),
    ],
  ),
})

