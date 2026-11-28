import { Array, Match, Option, Schema } from 'effect'
import { defineTaggedUnion } from 'foldkit/schema'

import {
  type CardLocation,
  ColumnId,
  type Columns,
  WIP_LIMIT,
  applyPendingOps,
  cardsToRows,
} from './domain'
import type { Direction } from './message'
import type { Board, ColumnState } from './model'

const baseRows = (state: ColumnState) =>
  state._tag === 'ColumnLoaded'
    ? Option.some(cardsToRows(state.cards))
    : Option.none()

export const displayedColumns = (board: Board): Columns =>
  applyPendingOps(
    {
      todo: baseRows(board.columns.todo),
      doing: baseRows(board.columns.doing),
      done: baseRows(board.columns.done),
    },
    board.pending,
  )

export const MoveAvailability = defineTaggedUnion({
  NoMove: {},
  BlockedMove: {},
  AvailableMove: { column: ColumnId, index: Schema.Number },
})
export type MoveAvailability = typeof MoveAvailability.Type

const neighbour = (
  column: ColumnId,
  direction: 'left' | 'right',
): Option.Option<ColumnId> =>
  Match.value([column, direction] as const).pipe(
    Match.when(['todo', 'right'], () => Option.some<ColumnId>('doing')),
    Match.when(['doing', 'left'], () => Option.some<ColumnId>('todo')),
    Match.when(['doing', 'right'], () => Option.some<ColumnId>('done')),
    Match.when(['done', 'left'], () => Option.some<ColumnId>('doing')),
    Match.orElse(() => Option.none<ColumnId>()),
  )

const sideways = (
  columns: Columns,
  location: CardLocation,
  direction: 'left' | 'right',
): MoveAvailability =>
  Option.match(neighbour(location.column, direction), {
    onNone: () => MoveAvailability.NoMove(),
    onSome: target =>
      Option.match(columns[target], {
        onNone: () => MoveAvailability.BlockedMove(),
        onSome: rows =>
          target === 'doing' && rows.length >= WIP_LIMIT
            ? MoveAvailability.BlockedMove()
            : MoveAvailability.AvailableMove({
                column: target,
                index: rows.length,
              }),
      }),
  })

const swapWith = (
  columns: Columns,
  location: CardLocation,
  index: number,
): MoveAvailability => {
  if (index < 0) {
    return MoveAvailability.NoMove()
  }
  const rows = Option.getOrElse(columns[location.column], () => [])
  return Option.match(Array.get(rows, index), {
    onNone: () => MoveAvailability.NoMove(),
    onSome: row =>
      row._tag === 'CardRow'
        ? MoveAvailability.AvailableMove({ column: location.column, index })
        : MoveAvailability.NoMove(),
  })
}

export const moveAvailability = (
  columns: Columns,
  location: CardLocation,
  direction: Direction,
): MoveAvailability =>
  Match.value(direction).pipe(
    Match.when('left', () => sideways(columns, location, 'left')),
    Match.when('right', () => sideways(columns, location, 'right')),
    Match.when('up', () => swapWith(columns, location, location.index - 1)),
    Match.when('down', () => swapWith(columns, location, location.index + 1)),
    Match.exhaustive,
  )
