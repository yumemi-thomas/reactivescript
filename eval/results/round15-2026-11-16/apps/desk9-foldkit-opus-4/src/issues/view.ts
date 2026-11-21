import { Array, Option } from 'effect'
import { Submodel } from 'foldkit'
import { type Html, type HtmlBuilder } from 'foldkit/html'

import { type Filter, type IssueRow } from '../domain'
import { TestId } from '../testId'
import { Message } from './message'
import {
  CommentsState,
  DetailState,
  LabelsState,
  ListState,
  type Model,
  RelatedState,
  type Selected,
  displayedIssues,
  displayedLabels,
  displayedTitle,
} from './model'

// VIEW

const RELATED_HIT_LIMIT = 3

const assigneeText = (issue: IssueRow): string =>
  Option.getOrElse(issue.assignee, () => 'unassigned')

const errorView = (
  maybeError: Option.Option<string>,
  prefix: string,
  h: HtmlBuilder<Message>,
): Html =>
  Option.match(maybeError, {
    onNone: () => h.empty,
    onSome: error =>
      h.p([h.Class('error'), h.Role('alert')], [`${prefix}${error}`]),
  })

const filterButton = (
  filter: Filter,
  model: Model,
  h: HtmlBuilder<Message>,
): Html =>
  h.button(
    [
      TestId(`filter-${filter}`),
      h.Type('button'),
      h.AriaPressed(model.filter === filter ? 'true' : 'false'),
      h.OnClick(Message.ClickedFilter({ filter })),
    ],
    [filter],
  )

const issueRowView = (
  issue: IssueRow,
  model: Model,
  h: HtmlBuilder<Message>,
): Html =>
  h.keyed('li')(
    String(issue.id),
    [h.Class('issue-row')],
    [
      h.button(
        [
          TestId('issue'),
          h.Type('button'),
          h.Class('issue'),
          h.AriaCurrent(
            Option.exists(
              model.maybeSelected,
              selected => selected.issueId === issue.id,
            )
              ? 'true'
              : 'false',
          ),
          h.OnClick(Message.ClickedIssue({ issueId: issue.id })),
        ],
        [`#${issue.id} ${issue.title} (${assigneeText(issue)})`],
      ),
      h.button(
        [
          TestId('row-assign'),
          h.Type('button'),
          h.OnClick(Message.ClickedRowAssign({ issueId: issue.id })),
        ],
        [`assign to ${model.user}`],
      ),
      model.filter === 'open'
        ? h.button(
            [
              TestId('row-close'),
              h.Type('button'),
              h.AriaLabel(`close #${issue.id}`),
              h.OnClick(Message.ClickedRowClose({ issueId: issue.id })),
            ],
            ['close'],
          )
        : h.empty,
    ],
  )

const listView = (model: Model, h: HtmlBuilder<Message>): Html =>
  h.div(
    [TestId('list'), h.Class('list'), h.AriaLive('polite')],
    [
      ListState.match(model.list, {
        Loading: () => h.p([], [`loading ${model.filter} issues`]),
        Failed: ({ error }) =>
          h.p([h.Role('alert')], [`list error: ${error}`]),
        Loaded: () =>
          Option.match(displayedIssues(model), {
            onNone: () => h.empty,
            onSome: issues =>
              Array.match(issues, {
                onEmpty: () => h.p([], [`no ${model.filter} issues`]),
                onNonEmpty: nonEmptyIssues =>
                  h.ul(
                    [h.Class('issue-list')],
                    Array.map(nonEmptyIssues, issue =>
                      issueRowView(issue, model, h),
                    ),
                  ),
              }),
          }),
      }),
    ],
  )

const headingView = (
  selected: Selected,
  model: Model,
  h: HtmlBuilder<Message>,
): Html =>
  DetailState.match(selected.detail, {
    Loading: () => h.p([], [`loading #${selected.issueId}`]),
    NotFound: () =>
      h.p(
        [h.Role('alert')],
        [`detail error: issue #${selected.issueId} not found`],
      ),
    Failed: ({ error }) => h.p([h.Role('alert')], [`detail error: ${error}`]),
    Found: ({ issue }) =>
      h.div(
        [],
        [
          h.h2([], [`#${issue.id} ${displayedTitle(issue, model.pendingChanges)}`]),
          h.p([h.Class('body')], [issue.body]),
        ],
      ),
  })

const relatedView = (selected: Selected, h: HtmlBuilder<Message>): Html =>
  DetailState.match(selected.detail, {
    Loading: () => h.empty,
    NotFound: () => h.empty,
    Failed: () => h.empty,
    Found: () =>
      h.section(
        [TestId('related'), h.Class('related'), h.AriaLive('polite')],
        [
          h.h3([], ['Related help']),
          RelatedState.match(selected.related, {
            NotStarted: () => h.p([], ['finding related help']),
            Searching: () => h.p([], ['finding related help']),
            Failed: ({ error }) =>
              h.p([h.Role('alert')], [`related help failed: ${error}`]),
            Found: ({ hits }) =>
              Array.match(Array.take(hits, RELATED_HIT_LIMIT), {
                onEmpty: () => h.p([], ['no related help']),
                onNonEmpty: shownHits =>
                  h.ul(
                    [],
                    Array.map(shownHits, hit =>
                      h.keyed('li')(String(hit.id), [], [
                        h.button(
                          [
                            TestId('related-hit'),
                            h.Type('button'),
                            h.OnClick(
                              Message.ClickedRelatedHit({ hitId: hit.id }),
                            ),
                          ],
                          [hit.name],
                        ),
                      ]),
                    ),
                  ),
              }),
          }),
        ],
      ),
  })

const commentsView = (
  selected: Selected,
  h: HtmlBuilder<Message>,
): Html => {
  const pendingRows = Array.map(selected.pendingComments, pending =>
    h.li([TestId('comment'), h.Class('pending')], [
      `${pending.author}: ${pending.text} (sending…)`,
    ]),
  )
  return h.section(
    [TestId('comments'), h.Class('comments'), h.AriaLive('polite')],
    [
      h.h3([], ['Comments']),
      CommentsState.match(selected.comments, {
        Loading: () => h.p([], ['loading comments']),
        Failed: ({ error }) =>
          h.p([h.Role('alert')], [`comments error: ${error}`]),
        Loaded: () => h.empty,
      }),
      h.ul(
        [],
        [
          ...CommentsState.match(selected.comments, {
            Loading: (): ReadonlyArray<Html> => [],
            Failed: (): ReadonlyArray<Html> => [],
            Loaded: ({ comments }) =>
              Array.map(comments, comment =>
                h.li([TestId('comment')], [`${comment.author}: ${comment.text}`]),
              ),
          }),
          ...pendingRows,
        ],
      ),
    ],
  )
}

const labelsView = (selected: Selected, h: HtmlBuilder<Message>): Html =>
  h.section(
    [TestId('labels'), h.Class('labels'), h.AriaLive('polite')],
    [
      h.h3([], ['Labels']),
      LabelsState.match(selected.labels, {
        Loading: () => h.p([], ['loading labels']),
        Failed: ({ error }) => h.p([h.Role('alert')], [`labels error: ${error}`]),
        Loaded: () => h.empty,
      }),
      h.ul(
        [],
        Array.map(displayedLabels(selected), label =>
          h.keyed('li')(label, [h.Class('label-row')], [
            h.span([TestId('label'), h.Class('label')], [label]),
            h.button(
              [
                TestId('remove-label'),
                h.Type('button'),
                h.OnClick(Message.ClickedRemoveLabel({ label })),
              ],
              [`remove ${label}`],
            ),
          ]),
        ),
      ),
    ],
  )

const textForm = (
  config: Readonly<{
    inputId: string
    label: string
    value: string
    onInput: (value: string) => Message
    onSubmit: Message
    buttonId: string
    buttonText: string
  }>,
  h: HtmlBuilder<Message>,
): Html =>
  h.form(
    [h.Class('inline-form'), h.OnSubmit(config.onSubmit)],
    [
      h.label([h.For(config.inputId)], [config.label]),
      h.input([
        h.Id(config.inputId),
        TestId(config.inputId),
        h.Type('text'),
        h.Autocomplete('off'),
        h.Value(config.value),
        h.OnInput(config.onInput),
      ]),
      h.button([TestId(config.buttonId), h.Type('submit')], [config.buttonText]),
    ],
  )

const detailView = (
  selected: Selected,
  model: Model,
  h: HtmlBuilder<Message>,
): Html =>
  h.div(
    [],
    [
      h.div([h.AriaLive('polite')], [headingView(selected, model, h)]),
      h.button(
        [
          TestId('retry'),
          h.Type('button'),
          h.OnClick(Message.ClickedRetryDetail()),
        ],
        ['retry'],
      ),
      h.div(
        [h.Class('actions')],
        [
          h.button(
            [TestId('assign'), h.Type('button'), h.OnClick(Message.ClickedAssign())],
            [`assign to ${model.user}`],
          ),
          h.button(
            [TestId('close'), h.Type('button'), h.OnClick(Message.ClickedClose())],
            ['close'],
          ),
        ],
      ),
      errorView(selected.maybeAssignError, 'assign error: ', h),
      errorView(selected.maybeCloseError, 'close error: ', h),
      textForm(
        {
          inputId: 'title-input',
          label: 'New title',
          value: selected.titleInput,
          onInput: value => Message.UpdatedTitleInput({ value }),
          onSubmit: Message.SubmittedRename(),
          buttonId: 'rename',
          buttonText: 'rename',
        },
        h,
      ),
      errorView(selected.maybeRenameError, 'rename error: ', h),
      relatedView(selected, h),
      commentsView(selected, h),
      textForm(
        {
          inputId: 'comment-input',
          label: 'Comment',
          value: selected.commentInput,
          onInput: value => Message.UpdatedCommentInput({ value }),
          onSubmit: Message.SubmittedComment(),
          buttonId: 'post',
          buttonText: 'post',
        },
        h,
      ),
      errorView(selected.maybePostError, 'post error: ', h),
      labelsView(selected, h),
      textForm(
        {
          inputId: 'label-input',
          label: 'Label',
          value: selected.labelInput,
          onInput: value => Message.UpdatedLabelInput({ value }),
          onSubmit: Message.SubmittedLabel(),
          buttonId: 'add-label',
          buttonText: 'add label',
        },
        h,
      ),
      errorView(selected.maybeLabelError, 'label error: ', h),
    ],
  )

export const view = Submodel.defineView<Model, Message>((model, h) =>
  h.div(
    [h.Class('issues-page')],
    [
      h.div(
        [h.Class('toolbar')],
        [
          h.label([h.For('user')], ['Current user']),
          h.input([
            h.Id('user'),
            TestId('user'),
            h.Type('text'),
            h.Autocomplete('off'),
            h.Value(model.user),
            h.OnInput(value => Message.UpdatedUser({ value })),
          ]),
          h.div(
            [h.Class('filters'), h.Role('group'), h.AriaLabel('Filter')],
            [filterButton('open', model, h), filterButton('closed', model, h)],
          ),
        ],
      ),
      Option.match(model.maybeRowError, {
        onNone: () => h.empty,
        onSome: error =>
          h.p(
            [TestId('row-error'), h.Class('error'), h.Role('alert')],
            [`row error: ${error}`],
          ),
      }),
      h.div(
        [h.Class('columns')],
        [
          listView(model, h),
          h.section(
            [TestId('detail'), h.Class('detail')],
            [
              Option.match(model.maybeSelected, {
                onNone: () => h.p([], ['select an issue']),
                onSome: selected => detailView(selected, model, h),
              }),
            ],
          ),
        ],
      ),
    ],
  ),
)
