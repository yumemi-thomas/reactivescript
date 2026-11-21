import { Match, Option, pipe } from 'effect'

import {
  type Column,
  type Direction,
  type Lanes,
  type SelectedChecklist,
  type ShownBoard,
  type ShownPlace,
  WIP_LIMIT,
  columnToLeft,
  columnToRight,
  laneSize,
  showBoard,
} from './domain'
import { type Board, ChecklistState, Selection } from './model'

// DERIVED

export const selectedChecklist = (
  selection: Selection,
): Option.Option<SelectedChecklist> =>
  Selection.match(selection, {
    NoCardSelected: () => Option.none<SelectedChecklist>(),
    CardSelected: ({ cardId, checklist }) =>
      ChecklistState.match(checklist, {
        ChecklistLoading: () => Option.none<SelectedChecklist>(),
        ChecklistFailed: () => Option.none<SelectedChecklist>(),
        ChecklistLoaded: ({ items }) => Option.some({ cardId, items }),
      }),
  })

export const shownBoard = (board: Board): ShownBoard =>
  showBoard(board.columns, board.pending, selectedChecklist(board.selection))

export const isEnteringFullDoing = (
  lanes: Lanes,
  from: Column,
  to: Column,
): boolean =>
  to === 'doing' &&
  from !== 'doing' &&
  Option.exists(laneSize(lanes, 'doing'), size => size >= WIP_LIMIT)

type MoveTarget = Readonly<{ column: Column; index: number }>

export const moveTarget = (
  lanes: Lanes,
  place: ShownPlace,
  direction: Direction,
): Option.Option<MoveTarget> => {
  const toBottomOf = (maybeColumn: Option.Option<Column>) =>
    pipe(
      maybeColumn,
      Option.filter(
        column => !isEnteringFullDoing(lanes, place.column, column),
      ),
      Option.flatMap(column =>
        Option.map(laneSize(lanes, column), index => ({ column, index })),
      ),
    )
  return Match.value(direction).pipe(
    Match.when('left', () => toBottomOf(columnToLeft(place.column))),
    Match.when('right', () => toBottomOf(columnToRight(place.column))),
    Match.when('up', () =>
      place.index > 0
        ? Option.some({ column: place.column, index: place.index - 1 })
        : Option.none<MoveTarget>(),
    ),
    Match.when('down', () =>
      place.index < place.laneSize - 1
        ? Option.some({ column: place.column, index: place.index + 1 })
        : Option.none<MoveTarget>(),
    ),
    Match.exhaustive,
  )
}

