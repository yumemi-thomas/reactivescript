import { Array, Option, Schema, String, pipe } from 'effect'
import { Runtime, type Update } from 'foldkit'
import { defineTaggedUnion } from 'foldkit/schema'
import { modifyFields } from 'foldkit/struct'

import {
  AddCard,
  AddItem,
  ArchiveCard,
  FetchArchived,
  FetchCards,
  FetchChecklist,
  MoveCard,
  RenameCard,
  RestoreCard,
  ToggleItem,
} from './command'
import {
  ArchiveLoad,
  COLUMN_IDS,
  ChecklistLoad,
  ColumnId,
  ColumnLoad,
  Columns,
  type Confirmed,
  Item,
  PendingOperation,
  WIP_LIMIT,
  columnOffset,
  confirm,
  locateCard,
  realCount,
  shownColumns,
  shownCount,
  shownItems,
  toggleCountDelta,
} from './domain'
import { type Direction, Message } from './message'
import { view } from './view'

// MODEL

export const Selection = Schema.Struct({
  selectionId: Schema.Number,
  cardId: Schema.Number,
  titleInput: Schema.String,
  itemInput: Schema.String,
  checklist: ChecklistLoad,
  maybeRenameError: Schema.Option(Schema.String),
  maybeItemError: Schema.Option(Schema.String),
})
export type Selection = typeof Selection.Type

export const Board = Schema.Struct({
  columns: Columns,
  operations: Schema.Array(PendingOperation),
  nextOperationId: Schema.Number,
  newCardInput: Schema.String,
  maybeSelection: Schema.Option(Selection),
  nextSelectionId: Schema.Number,
  maybeMoveError: Schema.Option(Schema.String),
  maybeAddError: Schema.Option(Schema.String),
  maybeArchiveError: Schema.Option(Schema.String),
})
export type Board = typeof Board.Type

export const Archive = Schema.Struct({
  archived: ArchiveLoad,
  restoringIds: Schema.Array(Schema.Number),
  maybeRestoreError: Schema.Option(Schema.String),
})
export type Archive = typeof Archive.Type

export const Page = defineTaggedUnion({
  BoardPage: { board: Board },
  ArchivePage: { archive: Archive },
})
export type Page = typeof Page.Type

export const Model = Schema.Struct({
  epoch: Schema.Number,
  page: Page,
})
export type Model = typeof Model.Type

type UpdateReturn = Update.Return<Model, Message>

type Commands = NonNullable<UpdateReturn['commands']>

type BoardStep = Readonly<{ board: Board; commands?: Commands }>

type ArchiveStep = Readonly<{ archive: Archive; commands?: Commands }>

// INIT

const initialBoard: Board = {
  columns: {
    todo: ColumnLoad.ColumnLoading(),
    doing: ColumnLoad.ColumnLoading(),
    done: ColumnLoad.ColumnLoading(),
  },
  operations: [],
  nextOperationId: 1,
  newCardInput: '',
  maybeSelection: Option.none(),
  nextSelectionId: 1,
  maybeMoveError: Option.none(),
  maybeAddError: Option.none(),
  maybeArchiveError: Option.none(),
}

const initialArchive: Archive = {
  archived: ArchiveLoad.ArchiveLoading(),
  restoringIds: [],
  maybeRestoreError: Option.none(),
}

const openBoard = (epoch: number): UpdateReturn => ({
  model: { epoch, page: Page.BoardPage({ board: initialBoard }) },
  commands: Array.map(COLUMN_IDS, column => FetchCards({ epoch, column })),
})

const openArchive = (epoch: number): UpdateReturn => ({
  model: { epoch, page: Page.ArchivePage({ archive: initialArchive }) },
  commands: [FetchArchived({ epoch })],
})

export const init: Runtime.ApplicationInit<Model, Message> = () => openBoard(1)

// UPDATE

const onBoard = (
  model: Model,
  epoch: number,
  step: (board: Board) => BoardStep,
): UpdateReturn => {
  if (epoch !== model.epoch) {
    return { model }
  }
  return Page.match(model.page, {
    ArchivePage: () => ({ model }),
    BoardPage: ({ board }) => {
      const boardStep = step(board)
      return {
        model: modifyFields(model, {
          page: () => Page.BoardPage({ board: boardStep.board }),
        }),
        ...(boardStep.commands === undefined
          ? {}
          : { commands: boardStep.commands }),
      }
    },
  })
}

const onArchive = (
  model: Model,
  epoch: number,
  step: (archive: Archive) => ArchiveStep,
): UpdateReturn => {
  if (epoch !== model.epoch) {
    return { model }
  }
  return Page.match(model.page, {
    BoardPage: () => ({ model }),
    ArchivePage: ({ archive }) => {
      const archiveStep = step(archive)
      return {
        model: modifyFields(model, {
          page: () => Page.ArchivePage({ archive: archiveStep.archive }),
        }),
        ...(archiveStep.commands === undefined
          ? {}
          : { commands: archiveStep.commands }),
      }
    },
  })
}

const setColumn = (
  columns: Columns,
  column: ColumnId,
  load: ColumnLoad,
): Columns => ({ ...columns, [column]: load })

const withNextOperation = (
  board: Board,
  operation: PendingOperation,
): Board =>
  modifyFields(board, {
    operations: operations => Array.append(operations, operation),
    nextOperationId: id => id + 1,
  })

const findOperation = <Tag extends PendingOperation['_tag']>(
  board: Board,
  operationId: number,
  tag: Tag,
): Option.Option<Extract<PendingOperation, { _tag: Tag }>> =>
  Array.findFirst(
    board.operations,
    (operation): operation is Extract<PendingOperation, { _tag: Tag }> =>
      operation.operationId === operationId && operation._tag === tag,
  )

const withoutOperation = (board: Board, operationId: number): Board =>
  modifyFields(board, {
    operations: operations =>
      Array.filter(
        operations,
        operation => operation.operationId !== operationId,
      ),
  })

const settle = <Tag extends PendingOperation['_tag']>(
  board: Board,
  operationId: number,
  tag: Tag,
  f: (
    operation: Extract<PendingOperation, { _tag: Tag }>,
    remaining: Board,
  ) => Board,
): BoardStep =>
  Option.match(findOperation(board, operationId, tag), {
    onNone: () => ({ board }),
    onSome: operation => ({
      board: f(operation, withoutOperation(board, operationId)),
    }),
  })

const confirmed = (board: Board, change: Confirmed): Board =>
  modifyFields(board, { columns: columns => confirm(columns, change) })

const modifySelectionOf = (
  board: Board,
  cardId: number,
  f: (selection: Selection) => Selection,
): Board =>
  modifyFields(board, {
    maybeSelection: maybeSelection =>
      Option.map(maybeSelection, selection =>
        selection.cardId === cardId ? f(selection) : selection,
      ),
  })

const modifyLoadedItems = (
  selection: Selection,
  f: (items: ReadonlyArray<Item>) => ReadonlyArray<Item>,
): Selection =>
  modifyFields(selection, {
    checklist: checklist =>
      ChecklistLoad.match(checklist, {
        ChecklistLoading: () => checklist,
        ChecklistFailed: () => checklist,
        ChecklistLoaded: ({ items }) =>
          ChecklistLoad.ChecklistLoaded({ items: f(items) }),
      }),
  })

const moveTarget = (
  board: Board,
  cardId: number,
  direction: Direction,
): Option.Option<Readonly<{ column: ColumnId; index: number }>> => {
  const shown = shownColumns(board.columns, board.operations)
  return Option.flatMap(locateCard(shown, cardId), location => {
    const sideways = (offset: number) =>
      pipe(
        columnOffset(location.column, offset),
        Option.filter(column => Option.isSome(shown[column])),
        Option.filter(
          column =>
            column !== 'doing' || shownCount(shown, 'doing') < WIP_LIMIT,
        ),
        Option.map(column => ({ column, index: realCount(shown, column) })),
      )
    const within = (offset: number) =>
      pipe(
        Option.some(location.index + offset),
        Option.filter(
          index => index >= 0 && index < realCount(shown, location.column),
        ),
        Option.map(index => ({ column: location.column, index })),
      )
    return direction === 'left'
      ? sideways(-1)
      : direction === 'right'
        ? sideways(1)
        : direction === 'up'
          ? within(-1)
          : within(1)
  })
}

const selectedCardExists = (board: Board, cardId: number): boolean =>
  Option.isSome(
    locateCard(shownColumns(board.columns, board.operations), cardId),
  )

const nonEmptyTrimmed = (value: string): Option.Option<string> =>
  pipe(String.trim(value), Option.liftPredicate(String.isNonEmpty))

export const update = (model: Model, message: Message) =>
  Message.match<UpdateReturn>(message, {
    ClickedBoardTab: () =>
      Page.match(model.page, {
        BoardPage: () => ({ model }),
        ArchivePage: () => openBoard(model.epoch + 1),
      }),

    ClickedArchiveTab: () =>
      Page.match(model.page, {
        ArchivePage: () => ({ model }),
        BoardPage: () => openArchive(model.epoch + 1),
      }),

    SucceededFetchCards: ({ epoch, column, cards }) =>
      onBoard(model, epoch, board => ({
        board: modifyFields(board, {
          columns: columns =>
            setColumn(columns, column, ColumnLoad.ColumnLoaded({ cards })),
        }),
      })),

    FailedFetchCards: ({ epoch, column, error }) =>
      onBoard(model, epoch, board => ({
        board: modifyFields(board, {
          columns: columns =>
            setColumn(columns, column, ColumnLoad.ColumnFailed({ error })),
        }),
      })),

    ClickedRetryColumn: ({ column }) =>
      onBoard(model, model.epoch, board =>
        ColumnLoad.match(board.columns[column], {
          ColumnLoading: () => ({ board }),
          ColumnLoaded: () => ({ board }),
          ColumnFailed: () => ({
            board: modifyFields(board, {
              columns: columns =>
                setColumn(columns, column, ColumnLoad.ColumnLoading()),
            }),
            commands: [FetchCards({ epoch: model.epoch, column })],
          }),
        }),
      ),

    ClickedMove: ({ cardId, direction }) =>
      onBoard(model, model.epoch, board =>
        Option.match(moveTarget(board, cardId, direction), {
          onNone: () => ({ board }),
          onSome: ({ column, index }) => {
            const operationId = board.nextOperationId
            return {
              board: modifyFields(
                withNextOperation(
                  board,
                  PendingOperation.PendingMove({
                    operationId,
                    cardId,
                    column,
                    index,
                  }),
                ),
                { maybeMoveError: () => Option.none() },
              ),
              commands: [
                MoveCard({
                  epoch: model.epoch,
                  operationId,
                  cardId,
                  column,
                  index,
                }),
              ],
            }
          },
        }),
      ),

    SucceededMoveCard: ({ epoch, operationId, column, index }) =>
      onBoard(model, epoch, board =>
        settle(board, operationId, 'PendingMove', (operation, remaining) =>
          confirmed(remaining, {
            _tag: 'Moved',
            cardId: operation.cardId,
            column,
            index,
          }),
        ),
      ),

    FailedMoveCard: ({ epoch, operationId, error }) =>
      onBoard(model, epoch, board =>
        settle(board, operationId, 'PendingMove', (_operation, remaining) =>
          modifyFields(remaining, {
            maybeMoveError: () => Option.some(error),
          }),
        ),
      ),

    UpdatedNewCardInput: ({ value }) =>
      onBoard(model, model.epoch, board => ({
        board: modifyFields(board, { newCardInput: () => value }),
      })),

    SubmittedNewCard: () =>
      onBoard(model, model.epoch, board =>
        Option.match(
          Option.filter(nonEmptyTrimmed(board.newCardInput), () =>
            ColumnLoad.guards.ColumnLoaded(board.columns.todo),
          ),
          {
            onNone: () => ({ board }),
            onSome: title => {
              const operationId = board.nextOperationId
              return {
                board: modifyFields(
                  withNextOperation(
                    board,
                    PendingOperation.PendingAddCard({ operationId, title }),
                  ),
                  {
                    newCardInput: () => '',
                    maybeAddError: () => Option.none(),
                  },
                ),
                commands: [AddCard({ epoch: model.epoch, operationId, title })],
              }
            },
          },
        ),
      ),

    SucceededAddCard: ({ epoch, operationId, id, title }) =>
      onBoard(model, epoch, board =>
        settle(board, operationId, 'PendingAddCard', (_operation, remaining) =>
          confirmed(remaining, {
            _tag: 'Added',
            card: { id, title, done: 0, total: 0 },
          }),
        ),
      ),

    FailedAddCard: ({ epoch, operationId, error }) =>
      onBoard(model, epoch, board =>
        settle(board, operationId, 'PendingAddCard', (_operation, remaining) =>
          modifyFields(remaining, { maybeAddError: () => Option.some(error) }),
        ),
      ),

    ClickedCard: ({ cardId }) =>
      onBoard(model, model.epoch, board => {
        const isAlreadySelected = Option.exists(
          board.maybeSelection,
          selection => selection.cardId === cardId,
        )
        if (isAlreadySelected || !selectedCardExists(board, cardId)) {
          return { board }
        }
        const selectionId = board.nextSelectionId
        return {
          board: modifyFields(board, {
            maybeSelection: () =>
              Option.some({
                selectionId,
                cardId,
                titleInput: '',
                itemInput: '',
                checklist: ChecklistLoad.ChecklistLoading(),
                maybeRenameError: Option.none(),
                maybeItemError: Option.none(),
              }),
            nextSelectionId: id => id + 1,
          }),
          commands: [
            FetchChecklist({ epoch: model.epoch, selectionId, cardId }),
          ],
        }
      }),

    UpdatedTitleInput: ({ value }) =>
      onBoard(model, model.epoch, board => ({
        board: modifyFields(board, {
          maybeSelection: maybeSelection =>
            Option.map(maybeSelection, selection =>
              modifyFields(selection, { titleInput: () => value }),
            ),
        }),
      })),

    SubmittedRename: () =>
      onBoard(model, model.epoch, board =>
        Option.match(
          pipe(
            board.maybeSelection,
            Option.filter(selection =>
              selectedCardExists(board, selection.cardId),
            ),
            Option.flatMap(selection =>
              Option.map(nonEmptyTrimmed(selection.titleInput), title => ({
                cardId: selection.cardId,
                title,
              })),
            ),
          ),
          {
            onNone: () => ({ board }),
            onSome: ({ cardId, title }) => {
              const operationId = board.nextOperationId
              return {
                board: modifySelectionOf(
                  withNextOperation(
                    board,
                    PendingOperation.PendingRename({
                      operationId,
                      cardId,
                      title,
                    }),
                  ),
                  cardId,
                  selection =>
                    modifyFields(selection, {
                      maybeRenameError: () => Option.none(),
                    }),
                ),
                commands: [
                  RenameCard({ epoch: model.epoch, operationId, cardId, title }),
                ],
              }
            },
          },
        ),
      ),

    SucceededRenameCard: ({ epoch, operationId, title }) =>
      onBoard(model, epoch, board =>
        settle(board, operationId, 'PendingRename', (operation, remaining) =>
          confirmed(remaining, {
            _tag: 'Renamed',
            cardId: operation.cardId,
            title,
          }),
        ),
      ),

    FailedRenameCard: ({ epoch, operationId, error }) =>
      onBoard(model, epoch, board =>
        settle(board, operationId, 'PendingRename', (operation, remaining) =>
          modifySelectionOf(remaining, operation.cardId, selection =>
            modifyFields(selection, {
              maybeRenameError: () => Option.some(error),
            }),
          ),
        ),
      ),

    ClickedArchive: () =>
      onBoard(model, model.epoch, board =>
        Option.match(
          Option.filter(board.maybeSelection, selection =>
            selectedCardExists(board, selection.cardId),
          ),
          {
            onNone: () => ({ board }),
            onSome: ({ cardId }) => {
              const operationId = board.nextOperationId
              return {
                board: modifyFields(
                  withNextOperation(
                    board,
                    PendingOperation.PendingArchive({ operationId, cardId }),
                  ),
                  {
                    maybeSelection: () => Option.none(),
                    maybeArchiveError: () => Option.none(),
                  },
                ),
                commands: [
                  ArchiveCard({ epoch: model.epoch, operationId, cardId }),
                ],
              }
            },
          },
        ),
      ),

    SucceededArchiveCard: ({ epoch, operationId }) =>
      onBoard(model, epoch, board =>
        settle(board, operationId, 'PendingArchive', (operation, remaining) =>
          confirmed(remaining, { _tag: 'Archived', cardId: operation.cardId }),
        ),
      ),

    FailedArchiveCard: ({ epoch, operationId, error }) =>
      onBoard(model, epoch, board =>
        settle(board, operationId, 'PendingArchive', (_operation, remaining) =>
          modifyFields(remaining, {
            maybeArchiveError: () => Option.some(error),
          }),
        ),
      ),

    SucceededFetchChecklist: ({ epoch, selectionId, items }) =>
      onBoard(model, epoch, board => ({
        board: modifyFields(board, {
          maybeSelection: maybeSelection =>
            Option.map(maybeSelection, selection =>
              selection.selectionId === selectionId
                ? modifyFields(selection, {
                    checklist: () => ChecklistLoad.ChecklistLoaded({ items }),
                  })
                : selection,
            ),
        }),
      })),

    FailedFetchChecklist: ({ epoch, selectionId, error }) =>
      onBoard(model, epoch, board => ({
        board: modifyFields(board, {
          maybeSelection: maybeSelection =>
            Option.map(maybeSelection, selection =>
              selection.selectionId === selectionId
                ? modifyFields(selection, {
                    checklist: () => ChecklistLoad.ChecklistFailed({ error }),
                  })
                : selection,
            ),
        }),
      })),

    ClickedToggleItem: ({ itemId }) =>
      onBoard(model, model.epoch, board =>
        Option.match(
          Option.flatMap(board.maybeSelection, selection =>
            ChecklistLoad.match(selection.checklist, {
              ChecklistLoading: () => Option.none(),
              ChecklistFailed: () => Option.none(),
              ChecklistLoaded: ({ items }) =>
                pipe(
                  shownItems(selection.cardId, items, board.operations),
                  Array.findFirst(
                    shown => shown._tag === 'RealItem' && shown.item.id === itemId,
                  ),
                  Option.flatMap(shown =>
                    shown._tag === 'RealItem'
                      ? Option.some({
                          cardId: selection.cardId,
                          wasDone: shown.item.done,
                        })
                      : Option.none(),
                  ),
                ),
            }),
          ),
          {
            onNone: () => ({ board }),
            onSome: ({ cardId, wasDone }) => {
              const operationId = board.nextOperationId
              const done = !wasDone
              return {
                board: modifySelectionOf(
                  withNextOperation(
                    board,
                    PendingOperation.PendingToggle({
                      operationId,
                      cardId,
                      itemId,
                      done,
                      wasDone,
                    }),
                  ),
                  cardId,
                  selection =>
                    modifyFields(selection, {
                      maybeItemError: () => Option.none(),
                    }),
                ),
                commands: [
                  ToggleItem({
                    epoch: model.epoch,
                    operationId,
                    cardId,
                    itemId,
                    done,
                  }),
                ],
              }
            },
          },
        ),
      ),

    SucceededToggleItem: ({ epoch, operationId, done }) =>
      onBoard(model, epoch, board =>
        settle(board, operationId, 'PendingToggle', (operation, remaining) =>
          modifySelectionOf(
            confirmed(remaining, {
              _tag: 'CountsChanged',
              cardId: operation.cardId,
              done: toggleCountDelta(done, operation.wasDone),
              total: 0,
            }),
            operation.cardId,
            selection =>
              modifyLoadedItems(selection, items =>
                Array.map(items, item =>
                  item.id === operation.itemId ? { ...item, done } : item,
                ),
              ),
          ),
        ),
      ),

    FailedToggleItem: ({ epoch, operationId, error }) =>
      onBoard(model, epoch, board =>
        settle(board, operationId, 'PendingToggle', (operation, remaining) => {
          const maybeNextToggleIndex = Array.findFirstIndex(
            remaining.operations,
            other =>
              other._tag === 'PendingToggle' &&
              other.operationId > operation.operationId &&
              other.cardId === operation.cardId &&
              other.itemId === operation.itemId,
          )
          const rebased = Option.match(maybeNextToggleIndex, {
            onNone: () => remaining,
            onSome: index =>
              modifyFields(remaining, {
                operations: operations =>
                  Array.map(operations, (other, otherIndex) =>
                    otherIndex === index && other._tag === 'PendingToggle'
                      ? PendingOperation.PendingToggle({
                          ...other,
                          wasDone: operation.wasDone,
                        })
                      : other,
                  ),
              }),
          })
          return modifySelectionOf(rebased, operation.cardId, selection =>
            modifyFields(selection, {
              maybeItemError: () => Option.some(error),
            }),
          )
        }),
      ),

    UpdatedItemInput: ({ value }) =>
      onBoard(model, model.epoch, board => ({
        board: modifyFields(board, {
          maybeSelection: maybeSelection =>
            Option.map(maybeSelection, selection =>
              modifyFields(selection, { itemInput: () => value }),
            ),
        }),
      })),

    SubmittedNewItem: () =>
      onBoard(model, model.epoch, board =>
        Option.match(
          pipe(
            board.maybeSelection,
            Option.filter(selection =>
              ChecklistLoad.guards.ChecklistLoaded(selection.checklist),
            ),
            Option.flatMap(selection =>
              Option.map(nonEmptyTrimmed(selection.itemInput), text => ({
                cardId: selection.cardId,
                text,
              })),
            ),
          ),
          {
            onNone: () => ({ board }),
            onSome: ({ cardId, text }) => {
              const operationId = board.nextOperationId
              return {
                board: modifySelectionOf(
                  withNextOperation(
                    board,
                    PendingOperation.PendingAddItem({
                      operationId,
                      cardId,
                      text,
                    }),
                  ),
                  cardId,
                  selection =>
                    modifyFields(selection, {
                      itemInput: () => '',
                      maybeItemError: () => Option.none(),
                    }),
                ),
                commands: [
                  AddItem({ epoch: model.epoch, operationId, cardId, text }),
                ],
              }
            },
          },
        ),
      ),

    SucceededAddItem: ({ epoch, operationId, item }) =>
      onBoard(model, epoch, board =>
        settle(board, operationId, 'PendingAddItem', (operation, remaining) =>
          modifySelectionOf(
            confirmed(remaining, {
              _tag: 'CountsChanged',
              cardId: operation.cardId,
              done: item.done ? 1 : 0,
              total: 1,
            }),
            operation.cardId,
            selection =>
              modifyLoadedItems(selection, items =>
                Array.some(items, existing => existing.id === item.id)
                  ? items
                  : Array.append(items, item),
              ),
          ),
        ),
      ),

    FailedAddItem: ({ epoch, operationId, error }) =>
      onBoard(model, epoch, board =>
        settle(board, operationId, 'PendingAddItem', (operation, remaining) =>
          modifySelectionOf(remaining, operation.cardId, selection =>
            modifyFields(selection, {
              maybeItemError: () => Option.some(error),
            }),
          ),
        ),
      ),

    SucceededFetchArchived: ({ epoch, cards }) =>
      onArchive(model, epoch, archive => ({
        archive: modifyFields(archive, {
          archived: () => ArchiveLoad.ArchiveLoaded({ cards }),
        }),
      })),

    FailedFetchArchived: ({ epoch, error }) =>
      onArchive(model, epoch, archive => ({
        archive: modifyFields(archive, {
          archived: () => ArchiveLoad.ArchiveFailed({ error }),
        }),
      })),

    ClickedRestore: ({ cardId }) =>
      onArchive(model, model.epoch, archive => {
        const isRestorable =
          ArchiveLoad.match(archive.archived, {
            ArchiveLoading: () => false,
            ArchiveFailed: () => false,
            ArchiveLoaded: ({ cards }) =>
              Array.some(cards, card => card.id === cardId),
          }) && !Array.contains(archive.restoringIds, cardId)
        if (!isRestorable) {
          return { archive }
        }
        return {
          archive: modifyFields(archive, {
            restoringIds: ids => Array.append(ids, cardId),
            maybeRestoreError: () => Option.none(),
          }),
          commands: [RestoreCard({ epoch: model.epoch, cardId })],
        }
      }),

    SucceededRestoreCard: ({ epoch, cardId }) =>
      onArchive(model, epoch, archive => ({
        archive: modifyFields(archive, {
          restoringIds: ids => Array.filter(ids, id => id !== cardId),
          archived: archived =>
            ArchiveLoad.match(archived, {
              ArchiveLoading: () => archived,
              ArchiveFailed: () => archived,
              ArchiveLoaded: ({ cards }) =>
                ArchiveLoad.ArchiveLoaded({
                  cards: Array.filter(cards, card => card.id !== cardId),
                }),
            }),
        }),
      })),

    FailedRestoreCard: ({ epoch, cardId, error }) =>
      onArchive(model, epoch, archive => ({
        archive: modifyFields(archive, {
          restoringIds: ids => Array.filter(ids, id => id !== cardId),
          maybeRestoreError: () => Option.some(error),
        }),
      })),
  })

export { Message, view }
