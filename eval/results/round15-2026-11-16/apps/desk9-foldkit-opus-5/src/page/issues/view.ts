import { Array, Option, pipe } from 'effect'
import { Submodel } from 'foldkit'
import { type Html, type HtmlBuilder } from 'foldkit/html'

import { type Comment, type Filter, type Hit, type Issue } from '../../domain'
import { Message } from './message'
import {
  CommentsState,
  DetailState,
  IssueList,
  LabelsState,
  type Model,
  type Post,
  RelatedState,
  type Selection,
  shownIssues,
  shownLabels,
  shownTitle,
} from './model'

const MAX_RELATED_HITS = 3

type H = HtmlBuilder<Message>

const testId = (h: H, id: string) => h.DataAttribute('testid', id)

const errorView = (
  id: string,
  maybeError: Option.Option<string>,
  format: (error: string) => string,
  h: H,
): Html =>
  Option.match(maybeError, {
    onNone: () => h.empty,
    onSome: error =>
      h.p(
        [testId(h, id), h.Class('error'), h.Role('alert')],
        [format(error)],
      ),
  })

// HEADER

const filterButtonView = (filter: Filter, model: Model, h: H): Html =>
  h.button(
    [
      h.Type('button'),
      testId(h, `filter-${filter}`),
      h.AriaPressed(model.filter === filter ? 'true' : 'false'),
      h.OnClick(Message.ClickedFilter({ filter })),
    ],
    [filter],
  )

const headerView = (model: Model, h: H): Html =>
  h.div(
    [h.Class('issues-header')],
    [
      h.label([h.For('current-user')], ['Current user']),
      h.input([
        h.Id('current-user'),
        h.Type('text'),
        testId(h, 'user'),
        h.Autocomplete('username'),
        h.Value(model.user),
        h.OnInput(value => Message.UpdatedUser({ value })),
      ]),
      h.div(
        [h.Class('filters'), h.Role('group'), h.AriaLabel('Filter')],
        [filterButtonView('open', model, h), filterButtonView('closed', model, h)],
      ),
    ],
  )

// LIST

const issueRowText = (issue: Issue): string =>
  `#${issue.id} ${issue.title} (${Option.getOrElse(issue.maybeAssignee, () => 'unassigned')})`

const issueRowView = (
  issue: Issue,
  model: Model,
  isSelected: boolean,
  h: H,
): Html =>
  h.keyed('li')(
    `issue-${issue.id}`,
    [h.Class(isSelected ? 'issue-row selected' : 'issue-row')],
    [
      h.button(
        [
          h.Type('button'),
          testId(h, 'issue'),
          h.AriaPressed(isSelected ? 'true' : 'false'),
          h.OnClick(Message.ClickedIssue({ issueId: issue.id })),
        ],
        [issueRowText(issue)],
      ),
      h.button(
        [
          h.Type('button'),
          testId(h, 'row-assign'),
          h.OnClick(Message.ClickedRowAssign({ issueId: issue.id })),
        ],
        [`assign to ${model.user}`],
      ),
      model.filter === 'open'
        ? h.button(
            [
              h.Type('button'),
              testId(h, 'row-close'),
              h.OnClick(Message.ClickedRowClose({ issueId: issue.id })),
            ],
            ['close'],
          )
        : h.empty,
    ],
  )

const listView = (model: Model, h: H): Html => {
  const maybeSelectedId = Option.map(
    model.maybeSelection,
    selection => selection.issueId,
  )
  return h.section(
    [testId(h, 'list'), h.Class('list'), h.AriaLabel('Issues')],
    [
      IssueList.match<Html>(model.list, {
        Loading: () =>
          h.p([h.AriaLive('polite')], [`loading ${model.filter} issues`]),
        Failed: ({ error }) =>
          h.p([h.Class('error'), h.Role('alert')], [`list error: ${error}`]),
        Loaded: ({ issues }) =>
          Array.match(shownIssues(model, issues), {
            onEmpty: () => h.p([], [`no ${model.filter} issues`]),
            onNonEmpty: shown =>
              h.ul(
                [h.Class('issue-rows')],
                Array.map(shown, issue =>
                  issueRowView(
                    issue,
                    model,
                    Option.exists(maybeSelectedId, id => id === issue.id),
                    h,
                  ),
                ),
              ),
          }),
      }),
    ],
  )
}

// DETAIL

const issueView = (model: Model, selection: Selection, h: H): Html =>
  DetailState.match<Html>(selection.detail, {
    Loading: () =>
      h.p([h.AriaLive('polite')], [`loading #${selection.issueId}`]),
    NotFound: () =>
      h.p(
        [h.Class('error'), h.Role('alert')],
        [`detail error: issue #${selection.issueId} not found`],
      ),
    Failed: ({ error }) =>
      h.p([h.Class('error'), h.Role('alert')], [`detail error: ${error}`]),
    Loaded: ({ detail }) =>
      h.div(
        [h.Class('issue')],
        [
          h.h2([], [`#${detail.id} ${shownTitle(model.changes, detail)}`]),
          h.p([h.Class('body')], [detail.body]),
        ],
      ),
  })

const relatedHitView = (query: string, hit: Hit, h: H): Html =>
  h.keyed('li')(
    `related-${hit.id}`,
    [],
    [
      h.button(
        [
          h.Type('button'),
          testId(h, 'related-hit'),
          h.OnClick(Message.ClickedRelatedHit({ query, hitId: hit.id })),
        ],
        [hit.name],
      ),
    ],
  )

const relatedView = (selection: Selection, h: H): Html =>
  selection.detail._tag === 'Loaded'
    ? h.section(
        [testId(h, 'related'), h.Class('related'), h.AriaLabel('Related help')],
        [
          h.h3([], ['Related help']),
          RelatedState.match<Html>(selection.related, {
            Idle: () => h.empty,
            Searching: () =>
              h.p([h.AriaLive('polite')], ['finding related help']),
            Failed: ({ error }) =>
              h.p(
                [h.Class('error'), h.Role('alert')],
                [`related help failed: ${error}`],
              ),
            Found: ({ query, hits }) =>
              Array.match(Array.take(hits, MAX_RELATED_HITS), {
                onEmpty: () => h.p([], ['no related help']),
                onNonEmpty: shown =>
                  h.ul(
                    [],
                    Array.map(shown, hit => relatedHitView(query, hit, h)),
                  ),
              }),
          }),
        ],
      )
    : h.empty

const commentText = (comment: Comment): string =>
  `${comment.author}: ${comment.text}`

const postView = (post: Post, h: H): Html =>
  h.keyed('li')(
    `post-${post.postId}`,
    [testId(h, 'comment'), h.Class('comment')],
    [
      post.status === 'Sending'
        ? `${commentText(post.comment)} (sending…)`
        : commentText(post.comment),
    ],
  )

const commentsView = (selection: Selection, h: H): Html => {
  const loadedComments = CommentsState.match<ReadonlyArray<Html>>(
    selection.comments,
    {
      Loading: () => [],
      Failed: () => [],
      Loaded: ({ comments }) =>
        Array.map(comments, (comment, index) =>
          h.keyed('li')(
            `comment-${index}`,
            [testId(h, 'comment'), h.Class('comment')],
            [commentText(comment)],
          ),
        ),
    },
  )
  return h.section(
    [testId(h, 'comments'), h.Class('comments'), h.AriaLabel('Comments')],
    [
      h.h3([], ['Comments']),
      CommentsState.match<Html>(selection.comments, {
        Loading: () => h.p([h.AriaLive('polite')], ['loading comments']),
        Failed: ({ error }) =>
          h.p(
            [h.Class('error'), h.Role('alert')],
            [`comments error: ${error}`],
          ),
        Loaded: () => h.empty,
      }),
      h.ul(
        [h.Class('comment-rows')],
        [
          ...loadedComments,
          ...Array.map(selection.posts, post => postView(post, h)),
        ],
      ),
    ],
  )
}

const postFormView = (selection: Selection, h: H): Html =>
  h.form(
    [h.Class('post-form'), h.OnSubmit(Message.SubmittedComment())],
    [
      h.label([h.For('comment-input')], ['Comment']),
      h.input([
        h.Id('comment-input'),
        h.Type('text'),
        testId(h, 'comment-input'),
        h.Value(selection.commentInput),
        h.OnInput(value => Message.UpdatedCommentInput({ value })),
      ]),
      h.button([h.Type('submit'), testId(h, 'post')], ['post']),
      errorView(
        'post-error',
        selection.errors.maybePostError,
        error => `post error: ${error}`,
        h,
      ),
    ],
  )

const labelView = (label: string, h: H): Html =>
  h.keyed('li')(
    `label-${label}`,
    [h.Class('label-row')],
    [
      h.span([testId(h, 'label'), h.Class('label')], [label]),
      h.button(
        [
          h.Type('button'),
          testId(h, 'remove-label'),
          h.AriaLabel(`remove ${label}`),
          h.OnClick(Message.ClickedRemoveLabel({ label })),
        ],
        [`remove ${label}`],
      ),
    ],
  )

const labelsView = (selection: Selection, h: H): Html =>
  h.section(
    [testId(h, 'labels'), h.Class('labels'), h.AriaLabel('Labels')],
    [
      h.h3([], ['Labels']),
      LabelsState.match<Html>(selection.labels, {
        Loading: () => h.p([h.AriaLive('polite')], ['loading labels']),
        Failed: ({ error }) =>
          h.p([h.Class('error'), h.Role('alert')], [`labels error: ${error}`]),
        Loaded: ({ labels }) =>
          Array.match(shownLabels(selection, labels), {
            onEmpty: () => h.p([], ['no labels']),
            onNonEmpty: shown =>
              h.ul(
                [h.Class('label-rows')],
                Array.map(shown, label => labelView(label, h)),
              ),
          }),
      }),
    ],
  )

const labelFormView = (selection: Selection, h: H): Html =>
  h.form(
    [h.Class('label-form'), h.OnSubmit(Message.SubmittedLabel())],
    [
      h.label([h.For('label-input')], ['Label']),
      h.input([
        h.Id('label-input'),
        h.Type('text'),
        testId(h, 'label-input'),
        h.Value(selection.labelInput),
        h.OnInput(value => Message.UpdatedLabelInput({ value })),
      ]),
      h.button([h.Type('submit'), testId(h, 'add-label')], ['add label']),
      errorView(
        'label-error',
        selection.errors.maybeLabelError,
        error => `label error: ${error}`,
        h,
      ),
    ],
  )

const actionsView = (model: Model, selection: Selection, h: H): Html =>
  h.div(
    [h.Class('actions')],
    [
      h.button(
        [h.Type('button'), testId(h, 'retry'), h.OnClick(Message.ClickedRetry())],
        ['retry'],
      ),
      h.button(
        [
          h.Type('button'),
          testId(h, 'assign'),
          h.OnClick(Message.ClickedAssign()),
        ],
        [`assign to ${model.user}`],
      ),
      errorView(
        'assign-error',
        selection.errors.maybeAssignError,
        error => `assign error: ${error}`,
        h,
      ),
      h.form(
        [h.Class('rename-form'), h.OnSubmit(Message.SubmittedRename())],
        [
          h.label([h.For('title-input')], ['New title']),
          h.input([
            h.Id('title-input'),
            h.Type('text'),
            testId(h, 'title-input'),
            h.Value(selection.titleInput),
            h.OnInput(value => Message.UpdatedTitleInput({ value })),
          ]),
          h.button([h.Type('submit'), testId(h, 'rename')], ['rename']),
        ],
      ),
      errorView(
        'rename-error',
        selection.errors.maybeRenameError,
        error => `rename error: ${error}`,
        h,
      ),
      h.button(
        [h.Type('button'), testId(h, 'close'), h.OnClick(Message.ClickedClose())],
        ['close'],
      ),
      errorView(
        'close-error',
        selection.errors.maybeCloseError,
        error => `close error: ${error}`,
        h,
      ),
    ],
  )

const selectionView = (model: Model, selection: Selection, h: H): Html =>
  h.keyed('div')(
    `selection-${selection.selectionId}`,
    [h.Class('selection')],
    [
      issueView(model, selection, h),
      actionsView(model, selection, h),
      relatedView(selection, h),
      commentsView(selection, h),
      postFormView(selection, h),
      labelsView(selection, h),
      labelFormView(selection, h),
    ],
  )

const detailView = (model: Model, h: H): Html =>
  h.section(
    [testId(h, 'detail'), h.Class('detail'), h.AriaLabel('Issue detail')],
    [
      Option.match(model.maybeSelection, {
        onNone: () => h.p([], ['select an issue']),
        onSome: selection => selectionView(model, selection, h),
      }),
    ],
  )

// VIEW

export const view = Submodel.defineView<Model, Message>((model, h) =>
  h.div(
    [h.Class('page issues-page')],
    [
      h.h1([], ['Issues']),
      headerView(model, h),
      pipe(
        model.maybeRowError,
        Option.match({
          onNone: () => h.empty,
          onSome: error =>
            h.p(
              [testId(h, 'row-error'), h.Class('error'), h.Role('alert')],
              [`row error: ${error}`],
            ),
        }),
      ),
      h.div([h.Class('issues-columns')], [listView(model, h), detailView(model, h)]),
    ],
  ),
)
