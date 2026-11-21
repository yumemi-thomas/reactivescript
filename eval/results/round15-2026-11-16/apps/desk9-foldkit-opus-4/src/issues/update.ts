import { Array, Option, String, pipe } from 'effect'
import { type Command, type Update } from 'foldkit'
import { modifyFields } from 'foldkit/struct'

import { type Filter } from '../domain'
import {
  AddComment,
  AddLabel,
  AssignIssue,
  CloseIssue,
  FetchComments,
  FetchIssue,
  FetchIssues,
  FetchLabels,
  RemoveLabel,
  RenameIssue,
  SearchRelated,
} from './command'
import { Message, OutMessage } from './message'
import {
  ActionSource,
  CommentsState,
  DetailState,
  INITIAL_USER,
  LabelsState,
  ListState,
  type Model,
  PendingChange,
  PendingLabelChange,
  RelatedState,
  type Selected,
  displayedLabels,
  initSelected,
  isClosePending,
  mapIssueRows,
  removeOpenIssue,
  withoutPendingChange,
} from './model'

type UpdateReturn = Update.ReturnWithOutMessage<Model, Message, OutMessage>

// INIT

export const init = (): Update.Return<Model, Message> => ({
  model: {
    nextId: 1,
    user: INITIAL_USER,
    filter: 'open',
    list: ListState.Loading({ requestId: 0 }),
    maybeOpenIssues: Option.none(),
    pendingChanges: [],
    maybeSelected: Option.none(),
    maybeRowError: Option.none(),
  },
  commands: [FetchIssues({ requestId: 0, filter: 'open' })],
})

// HELPERS

const takeId = (model: Model): readonly [number, Model] => [
  model.nextId,
  modifyFields(model, { nextId: id => id + 1 }),
]

const modifySelected =
  (f: (selected: Selected) => Selected) =>
  (model: Model): Model =>
    modifyFields(model, { maybeSelected: Option.map(f) })

const modifySelection = (
  model: Model,
  selectionId: number,
  f: (selected: Selected) => Selected,
): Model =>
  modifyFields(model, {
    maybeSelected: Option.map(selected =>
      selected.selectionId === selectionId ? f(selected) : selected,
    ),
  })

const withSelected = (
  model: Model,
  f: (selected: Selected) => UpdateReturn,
): UpdateReturn =>
  Option.match(model.maybeSelected, {
    onNone: () => ({ model }),
    onSome: f,
  })

const isLoadingList = (model: Model, requestId: number): boolean =>
  model.list._tag === 'Loading' && model.list.requestId === requestId

const isLoadingDetail = (selected: Selected, requestId: number): boolean =>
  selected.detail._tag === 'Loading' && selected.detail.requestId === requestId

const isSearchingRelated = (selected: Selected, requestId: number): boolean =>
  selected.related._tag === 'Searching' &&
  selected.related.requestId === requestId

const findSelectedByDetailRequest = (
  model: Model,
  requestId: number,
): Option.Option<Selected> =>
  Option.filter(model.maybeSelected, selected =>
    isLoadingDetail(selected, requestId),
  )

const loadList = (model: Model, filter: Filter): UpdateReturn => {
  const [requestId, nextModel] = takeId(model)
  return {
    model: modifyFields(nextModel, {
      filter: () => filter,
      list: () => ListState.Loading({ requestId }),
    }),
    commands: [FetchIssues({ requestId, filter })],
  }
}

const loadDetail = (model: Model, selected: Selected): UpdateReturn => {
  const [requestId, nextModel] = takeId(model)
  return {
    model: modifySelected(current =>
      modifyFields(current, {
        detail: () => DetailState.Loading({ requestId }),
        related: () => RelatedState.NotStarted(),
      }),
    )(nextModel),
    commands: [FetchIssue({ requestId, issueId: selected.issueId })],
  }
}

const startAssign = (
  model: Model,
  issueId: number,
  source: ActionSource,
): UpdateReturn => {
  if (String.isEmpty(String.trim(model.user))) {
    return { model }
  }
  const [opId, nextModel] = takeId(model)
  return {
    model: modifyFields(nextModel, {
      pendingChanges: Array.append(
        PendingChange.Assign({ opId, issueId, assignee: model.user }),
      ),
    }),
    commands: [AssignIssue({ opId, issueId, user: model.user, source })],
  }
}

const startClose = (
  model: Model,
  issueId: number,
  source: ActionSource,
): UpdateReturn => {
  const [opId, nextModel] = takeId(model)
  return {
    model: modifyFields(nextModel, {
      pendingChanges: Array.append(PendingChange.Close({ opId, issueId })),
    }),
    commands: [CloseIssue({ opId, issueId, source })],
  }
}

const reportSourceError = (
  model: Model,
  source: ActionSource,
  error: string,
  toSelected: (selected: Selected) => Selected,
): Model =>
  ActionSource.match(source, {
    Detail: ({ selectionId }) => modifySelection(model, selectionId, toSelected),
    Row: () => modifyFields(model, { maybeRowError: () => Option.some(error) }),
  })

const clearRowError = (model: Model): Model =>
  modifyFields(model, { maybeRowError: () => Option.none() })

const startLabelChange = (
  model: Model,
  selected: Selected,
  toChange: (opId: number) => PendingLabelChange,
  toCommand: (opId: number) => Command.Command<Message>,
  clearInput: boolean,
): UpdateReturn => {
  const [opId, nextModel] = takeId(model)
  return {
    model: modifySelected(current =>
      modifyFields(current, {
        pendingLabelChanges: Array.append(toChange(opId)),
        maybeLabelError: () => Option.none(),
        labelInput: input => (clearInput ? '' : input),
      }),
    )(nextModel),
    commands: [toCommand(opId)],
  }
}

const settleLabelChange = (
  model: Model,
  selectionId: number,
  opId: number,
  outcome: Option.Option<ReadonlyArray<string>>,
  maybeError: Option.Option<string>,
): Model =>
  modifySelection(model, selectionId, selected =>
    modifyFields(selected, {
      pendingLabelChanges: Array.filter(change => change.opId !== opId),
      labels: labels =>
        Option.match(outcome, {
          onNone: () => labels,
          onSome: next => LabelsState.Loaded({ labels: next }),
        }),
      maybeLabelError: current =>
        Option.isSome(maybeError) ? maybeError : current,
    }),
  )

// UPDATE

export const update = (model: Model, message: Message) =>
  Message.match<UpdateReturn>(message, {
    UpdatedUser: ({ value }) => ({
      model: modifyFields(model, { user: () => value }),
    }),

    ClickedFilter: ({ filter }) =>
      filter === model.filter ? { model } : loadList(model, filter),

    ClickedIssue: ({ issueId }) => {
      const isAlreadySelected = Option.exists(
        model.maybeSelected,
        selected => selected.issueId === issueId,
      )
      if (isAlreadySelected) {
        return { model }
      }
      const [selectionId, withSelectionId] = takeId(model)
      const [requestId, nextModel] = takeId(withSelectionId)
      return {
        model: modifyFields(nextModel, {
          maybeSelected: () =>
            Option.some(initSelected(selectionId, issueId, requestId)),
        }),
        commands: [
          FetchIssue({ requestId, issueId }),
          FetchComments({ selectionId, issueId }),
          FetchLabels({ selectionId, issueId }),
        ],
      }
    },

    ClickedRetryDetail: () =>
      withSelected(model, selected => loadDetail(model, selected)),

    ClickedAssign: () =>
      withSelected(model, selected =>
        startAssign(
          modifySelected(current =>
            modifyFields(current, { maybeAssignError: () => Option.none() }),
          )(model),
          selected.issueId,
          ActionSource.Detail({ selectionId: selected.selectionId }),
        ),
      ),

    UpdatedTitleInput: ({ value }) => ({
      model: modifySelected(selected =>
        modifyFields(selected, { titleInput: () => value }),
      )(model),
    }),

    SubmittedRename: () =>
      withSelected(model, selected => {
        const title = String.trim(selected.titleInput)
        if (String.isEmpty(title)) {
          return { model }
        }
        const [opId, nextModel] = takeId(model)
        return {
          model: pipe(
            modifyFields(nextModel, {
              pendingChanges: Array.append(
                PendingChange.Rename({ opId, issueId: selected.issueId, title }),
              ),
            }),
            modifySelected(current =>
              modifyFields(current, { maybeRenameError: () => Option.none() }),
            ),
          ),
          commands: [
            RenameIssue({
              opId,
              selectionId: selected.selectionId,
              issueId: selected.issueId,
              title,
            }),
          ],
        }
      }),

    ClickedClose: () =>
      withSelected(model, selected =>
        isClosePending(model, selected.issueId)
          ? { model }
          : startClose(
              modifySelected(current =>
                modifyFields(current, { maybeCloseError: () => Option.none() }),
              )(model),
              selected.issueId,
              ActionSource.Detail({ selectionId: selected.selectionId }),
            ),
      ),

    UpdatedCommentInput: ({ value }) => ({
      model: modifySelected(selected =>
        modifyFields(selected, { commentInput: () => value }),
      )(model),
    }),

    SubmittedComment: () =>
      withSelected(model, selected => {
        const text = String.trim(selected.commentInput)
        if (String.isEmpty(text) || String.isEmpty(String.trim(model.user))) {
          return { model }
        }
        const [opId, nextModel] = takeId(model)
        const author = model.user
        return {
          model: modifySelected(current =>
            modifyFields(current, {
              pendingComments: Array.append({ opId, author, text }),
              commentInput: () => '',
              maybePostError: () => Option.none(),
            }),
          )(nextModel),
          commands: [
            AddComment({
              selectionId: selected.selectionId,
              opId,
              issueId: selected.issueId,
              author,
              text,
            }),
          ],
        }
      }),

    UpdatedLabelInput: ({ value }) => ({
      model: modifySelected(selected =>
        modifyFields(selected, { labelInput: () => value }),
      )(model),
    }),

    SubmittedLabel: () =>
      withSelected(model, selected => {
        const label = String.trim(selected.labelInput)
        if (
          String.isEmpty(label) ||
          Array.contains(displayedLabels(selected), label)
        ) {
          return { model }
        }
        return startLabelChange(
          model,
          selected,
          opId => PendingLabelChange.Add({ opId, label }),
          opId =>
            AddLabel({
              selectionId: selected.selectionId,
              opId,
              issueId: selected.issueId,
              label,
            }),
          true,
        )
      }),

    ClickedRemoveLabel: ({ label }) =>
      withSelected(model, selected =>
        Array.contains(displayedLabels(selected), label)
          ? startLabelChange(
              model,
              selected,
              opId => PendingLabelChange.Remove({ opId, label }),
              opId =>
                RemoveLabel({
                  selectionId: selected.selectionId,
                  opId,
                  issueId: selected.issueId,
                  label,
                }),
              false,
            )
          : { model },
      ),

    ClickedRowAssign: ({ issueId }) =>
      startAssign(clearRowError(model), issueId, ActionSource.Row()),

    ClickedRowClose: ({ issueId }) =>
      isClosePending(model, issueId)
        ? { model }
        : startClose(clearRowError(model), issueId, ActionSource.Row()),

    ClickedRelatedHit: ({ hitId }) =>
      withSelected(model, selected =>
        RelatedState.match(selected.related, {
          NotStarted: () => ({ model }),
          Searching: () => ({ model }),
          Failed: () => ({ model }),
          Found: ({ query, hits }) => ({
            model,
            outMessage: OutMessage.OpenedRelatedHelp({ query, hits, hitId }),
          }),
        }),
      ),

    SucceededFetchIssues: ({ requestId, filter, issues }) =>
      isLoadingList(model, requestId)
        ? {
            model: modifyFields(model, {
              list: () => ListState.Loaded({ issues }),
              maybeOpenIssues: current =>
                filter === 'open' ? Option.some(issues) : current,
            }),
          }
        : { model },

    FailedFetchIssues: ({ requestId, error }) =>
      isLoadingList(model, requestId)
        ? { model: modifyFields(model, { list: () => ListState.Failed({ error }) }) }
        : { model },

    SucceededFetchIssue: ({ requestId, maybeIssue }) =>
      Option.match(findSelectedByDetailRequest(model, requestId), {
        onNone: () => ({ model }),
        onSome: () =>
          Option.match(maybeIssue, {
            onNone: () => ({
              model: modifySelected(selected =>
                modifyFields(selected, { detail: () => DetailState.NotFound() }),
              )(model),
            }),
            onSome: issue => {
              const [relatedRequestId, nextModel] = takeId(model)
              return {
                model: modifySelected(selected =>
                  modifyFields(selected, {
                    detail: () => DetailState.Found({ issue }),
                    related: () =>
                      RelatedState.Searching({
                        requestId: relatedRequestId,
                        query: issue.title,
                      }),
                  }),
                )(nextModel),
                commands: [
                  SearchRelated({
                    requestId: relatedRequestId,
                    query: issue.title,
                  }),
                ],
              }
            },
          }),
      }),

    FailedFetchIssue: ({ requestId, error }) =>
      Option.match(findSelectedByDetailRequest(model, requestId), {
        onNone: () => ({ model }),
        onSome: () => ({
          model: modifySelected(selected =>
            modifyFields(selected, {
              detail: () => DetailState.Failed({ error }),
            }),
          )(model),
        }),
      }),

    SucceededSearchRelated: ({ requestId, hits }) => ({
      model: modifySelected(selected =>
        RelatedState.match(selected.related, {
          NotStarted: () => selected,
          Found: () => selected,
          Failed: () => selected,
          Searching: ({ query }) =>
            isSearchingRelated(selected, requestId)
              ? modifyFields(selected, {
                  related: () => RelatedState.Found({ query, hits }),
                })
              : selected,
        }),
      )(model),
    }),

    FailedSearchRelated: ({ requestId, error }) => ({
      model: modifySelected(selected =>
        isSearchingRelated(selected, requestId)
          ? modifyFields(selected, {
              related: () => RelatedState.Failed({ error }),
            })
          : selected,
      )(model),
    }),

    SucceededFetchComments: ({ selectionId, comments }) => ({
      model: modifySelection(model, selectionId, selected =>
        modifyFields(selected, {
          comments: () => CommentsState.Loaded({ comments }),
        }),
      ),
    }),

    FailedFetchComments: ({ selectionId, error }) => ({
      model: modifySelection(model, selectionId, selected =>
        modifyFields(selected, {
          comments: () => CommentsState.Failed({ error }),
        }),
      ),
    }),

    SucceededFetchLabels: ({ selectionId, labels }) => ({
      model: modifySelection(model, selectionId, selected =>
        modifyFields(selected, { labels: () => LabelsState.Loaded({ labels }) }),
      ),
    }),

    FailedFetchLabels: ({ selectionId, error }) => ({
      model: modifySelection(model, selectionId, selected =>
        modifyFields(selected, { labels: () => LabelsState.Failed({ error }) }),
      ),
    }),

    SucceededAssign: ({ opId, issueId, assignee }) => ({
      model: pipe(
        model,
        withoutPendingChange(opId),
        mapIssueRows(issue =>
          issue.id === issueId
            ? modifyFields(issue, { assignee: () => Option.some(assignee) })
            : issue,
        ),
      ),
    }),

    FailedAssign: ({ opId, source, error }) => ({
      model: reportSourceError(
        withoutPendingChange(opId)(model),
        source,
        error,
        selected =>
          modifyFields(selected, { maybeAssignError: () => Option.some(error) }),
      ),
    }),

    SucceededRenameIssue: ({ opId, issueId, title }) => ({
      model: pipe(
        model,
        withoutPendingChange(opId),
        mapIssueRows(issue =>
          issue.id === issueId ? modifyFields(issue, { title: () => title }) : issue,
        ),
        modifySelected(selected =>
          DetailState.match(selected.detail, {
            Loading: () => selected,
            NotFound: () => selected,
            Failed: () => selected,
            Found: ({ issue }) =>
              issue.id === issueId
                ? modifyFields(selected, {
                    detail: () =>
                      DetailState.Found({
                        issue: modifyFields(issue, { title: () => title }),
                      }),
                  })
                : selected,
          }),
        ),
      ),
    }),

    FailedRenameIssue: ({ opId, selectionId, error }) => ({
      model: modifySelection(
        withoutPendingChange(opId)(model),
        selectionId,
        selected =>
          modifyFields(selected, { maybeRenameError: () => Option.some(error) }),
      ),
    }),

    SucceededCloseIssue: ({ opId, issueId }) => ({
      model: pipe(model, withoutPendingChange(opId), removeOpenIssue(issueId)),
    }),

    FailedCloseIssue: ({ opId, source, error }) => ({
      model: reportSourceError(
        withoutPendingChange(opId)(model),
        source,
        error,
        selected =>
          modifyFields(selected, { maybeCloseError: () => Option.some(error) }),
      ),
    }),

    SucceededAddComment: ({ selectionId, opId, comment }) => ({
      model: modifySelection(model, selectionId, selected =>
        modifyFields(selected, {
          pendingComments: Array.filter(pending => pending.opId !== opId),
          comments: comments =>
            CommentsState.match(comments, {
              Loading: () => comments,
              Failed: () => comments,
              Loaded: loaded =>
                CommentsState.Loaded({
                  comments: Array.append(loaded.comments, comment),
                }),
            }),
        }),
      ),
    }),

    FailedAddComment: ({ selectionId, opId, error }) => ({
      model: modifySelection(model, selectionId, selected =>
        modifyFields(selected, {
          pendingComments: Array.filter(pending => pending.opId !== opId),
          maybePostError: () => Option.some(error),
        }),
      ),
    }),

    SucceededAddLabel: ({ selectionId, opId, labels }) => ({
      model: settleLabelChange(
        model,
        selectionId,
        opId,
        Option.some(labels),
        Option.none(),
      ),
    }),

    FailedAddLabel: ({ selectionId, opId, error }) => ({
      model: settleLabelChange(
        model,
        selectionId,
        opId,
        Option.none(),
        Option.some(error),
      ),
    }),

    SucceededRemoveLabel: ({ selectionId, opId, labels }) => ({
      model: settleLabelChange(
        model,
        selectionId,
        opId,
        Option.some(labels),
        Option.none(),
      ),
    }),

    FailedRemoveLabel: ({ selectionId, opId, error }) => ({
      model: settleLabelChange(
        model,
        selectionId,
        opId,
        Option.none(),
        Option.some(error),
      ),
    }),
  })

