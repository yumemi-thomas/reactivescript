import { Array, Option, pipe } from 'effect'
import { modifyFields } from 'foldkit/struct'

import { Issue } from './domain'
import {
  IssueChange,
  IssueList,
  IssuesPage,
  LabelChange,
  LabelsState,
  Results,
  Selection,
  ShownResults,
} from './model'

// NOTE: The Model keeps what the server has confirmed apart from the changes
// still in flight. What the user sees is the confirmed state with the pending
// changes applied in the order they started, so a declined change drops out
// without disturbing the ones started after it.

const applyIssueChange =
  (issues: IssuesPage) =>
  (rows: ReadonlyArray<Issue>, change: IssueChange): ReadonlyArray<Issue> =>
    IssueChange.match(change, {
      Assigning: ({ issueId, user }) =>
        Array.map(rows, issue =>
          issue.id === issueId
            ? modifyFields(issue, { maybeAssignee: () => Option.some(user) })
            : issue,
        ),
      Renaming: ({ issueId, title }) =>
        Array.map(rows, issue =>
          issue.id === issueId
            ? modifyFields(issue, { title: () => title })
            : issue,
        ),
      Closing: ({ issueId }) =>
        issues.filter === 'open'
          ? Array.filter(rows, issue => issue.id !== issueId)
          : rows,
    })

export const visibleRows = (
  issues: IssuesPage,
  confirmed: ReadonlyArray<Issue>,
): ReadonlyArray<Issue> =>
  Array.reduce(issues.changes, confirmed, applyIssueChange(issues))

export const maybeVisibleOpenCount = (
  issues: IssuesPage,
): Option.Option<number> =>
  IssueList.matchOrElse<Option.Option<number>>(
    issues.list,
    {
      ListLoaded: ({ issues: confirmed }) =>
        issues.filter === 'open'
          ? Option.some(visibleRows(issues, confirmed).length)
          : Option.none(),
    },
    () => Option.none(),
  )

export const visibleTitle = (
  issues: IssuesPage,
  issueId: number,
  confirmedTitle: string,
): string =>
  Array.reduce(issues.changes, confirmedTitle, (title, change) =>
    IssueChange.matchOrElse<string>(
      change,
      {
        Renaming: renaming =>
          renaming.issueId === issueId ? renaming.title : title,
      },
      () => title,
    ),
  )

export const isClosing = (issues: IssuesPage, issueId: number): boolean =>
  Array.some(
    issues.changes,
    change => change._tag === 'Closing' && change.issueId === issueId,
  )

export const applyLabelChange = (
  labels: ReadonlyArray<string>,
  change: LabelChange,
): ReadonlyArray<string> =>
  LabelChange.match(change, {
    AddingLabel: ({ label }) =>
      Array.contains(labels, label) ? labels : Array.append(labels, label),
    RemovingLabel: ({ label }) =>
      Array.filter(labels, existing => existing !== label),
  })

export const maybeVisibleLabels = (
  selection: Selection,
): Option.Option<ReadonlyArray<string>> =>
  LabelsState.matchOrElse<Option.Option<ReadonlyArray<string>>>(
    selection.labels,
    {
      LabelsLoaded: ({ labels }) =>
        Option.some(
          Array.reduce(selection.labelChanges, labels, applyLabelChange),
        ),
    },
    () => Option.none(),
  )

export const maybeShownResults = (
  results: Results,
): Option.Option<ShownResults> =>
  Results.match(results, {
    ResultsNone: () => Option.none(),
    ResultsSearching: ({ maybeShown }) => maybeShown,
    ResultsFailed: () => Option.none(),
    ResultsLoaded: ({ shown }) => Option.some(shown),
  })

export const queryLength = (query: string): number => [...query].length

export const MIN_QUERY_LENGTH = 2

export const RELATED_HIT_LIMIT = 3

export const firstRelatedHits = <A>(hits: ReadonlyArray<A>): ReadonlyArray<A> =>
  pipe(hits, Array.take(RELATED_HIT_LIMIT))
