import { Array, Option, String, pipe } from 'effect'
import { Runtime, type Update } from 'foldkit'
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
  COLUMN_IDS,
  type ColumnId,
  type Columns,
  PendingOp,
  applyPendingItemOps,
  cardsToRows,
  ChecklistRow,
  type PendingEntry,
  acceptOp,
  applyPendingItemOp,
  applyPendingOp,
  dropDeclinedOp,
  findAwaitingOp,
  rowsToItems,
  locateCard,
  rowsToCards,
} from './domain'
import { Message } from './message'
import {
  Archive,
  ArchiveList,
  Board,
  ChecklistState,
  ColumnState,
  type ColumnStates,
  Detail,
  Model,
  Page,
} from './model'
import { moveAvailability, displayedColumns } from './board'
import { view } from './view'

export { Message, Model, view }

type UpdateReturn = Update.Return<Model, Message>
type Commands = NonNullable<UpdateReturn['commands']>

// INIT

const initBoard = (
  nextId: number,
): Readonly<{ board: Board; nextId: number; commands: Commands }> => ({
  board: {
    columns: {
      todo: ColumnState.ColumnLoading({ requestId: nextId }),
      doing: ColumnState.ColumnLoading({ requestId: nextId + 1 }),
      done: ColumnState.ColumnLoading({ requestId: nextId + 2 }),
    },
    pending: [],
    newCardInput: '',
    maybeMoveError: Option.none(),
    maybeAddError: Option.none(),
    maybeArchiveError: Option.none(),
    detail: Detail.NothingSelected(),
  },
  nextId: nextId + 3,
  commands: Array.map(COLUMN_IDS, (column, offset) =>
    FetchCards({ requestId: nextId + offset, column }),
  ),
})

export const init: Runtime.ApplicationInit<Model, Message> = () => {
  const boardInit = initBoard(0)
  return {
    model: {
      page: Page.BoardPage({ board: boardInit.board }),
      nextId: boardInit.nextId,
    },
    commands: boardInit.commands,
  }
}

// UPDATE HELPERS

const withBoard = (
  model: Model,
  f: (board: Board) => UpdateReturn,
): UpdateReturn =>
  Page.match(model.page, {
    BoardPage: ({ board }) => f(board),
    ArchivePage: () => ({ model }),
  })

const withArchive = (
  model: Model,
  f: (archive: Archive) => UpdateReturn,
): UpdateReturn =>
  Page.match(model.page, {
    BoardPage: () => ({ model }),
    ArchivePage: ({ archive }) => f(archive),
  })

const withBoardModel = (model: Model, board: Board): Model =>
  modifyFields(model, { page: () => Page.BoardPage({ board }) })

const withArchiveModel = (model: Model, archive: Archive): Model =>
  modifyFields(model, { page: () => Page.ArchivePage({ archive }) })

const allocateId = (model: Model): Model =>
  modifyFields(model, { nextId: nextId => nextId + 1 })

const modifyLoadedColumns = (
  columns: ColumnStates,
  f: (columns: Columns) => Columns,
): ColumnStates => {
  const asRows = (state: ColumnState) =>
    state._tag === 'ColumnLoaded'
      ? Option.some(cardsToRows(state.cards))
      : Option.none()
  const next = f({
    todo: asRows(columns.todo),
    doing: asRows(columns.doing),
    done: asRows(columns.done),
  })
  const back = (column: ColumnId): ColumnState =>
    Option.match(next[column], {
      onNone: () => columns[column],
      onSome: rows => ColumnState.ColumnLoaded({ cards: rowsToCards(rows) }),
    })
  return { todo: back('todo'), doing: back('doing'), done: back('done') }
}

const awaiting = (op: PendingOp): PendingEntry => ({
  op,
  status: 'Awaiting',
})

const foldIntoBase = (board: Board, op: PendingOp): Board =>
  modifyFields(
    confirmOnBoard(board, columns => applyPendingOp(columns, op)),
    {
      detail: detail =>
        detail._tag === 'CardSelected'
          ? modifyFields(detail, {
              checklist: checklist =>
                modifyLoadedChecklist(checklist, items =>
                  rowsToItems(
                    applyPendingItemOp(detail.cardId)(
                      Array.map(items, item => ChecklistRow.ItemRow({ item })),
                      op,
                    ),
                  ),
                ),
            })
          : detail,
    },
  )

const foldAccepted = (board: Board): Board =>
  pipe(
    Array.head(board.pending),
    Option.filter(entry => entry.status === 'Accepted'),
    Option.match({
      onNone: () => board,
      onSome: entry =>
        foldAccepted(
          foldIntoBase(
            modifyFields(board, { pending: pending => Array.drop(pending, 1) }),
            entry.op,
          ),
        ),
    }),
  )

const acceptOperation = <Op extends PendingOp>(
  model: Model,
  opId: number,
  isOp: (op: PendingOp) => op is Op,
  toAccepted: (op: Op) => PendingOp,
): UpdateReturn =>
  withBoard(model, board =>
    pipe(
      findAwaitingOp(board.pending, opId),
      Option.filter(isOp),
      Option.match({
        onNone: () => ({ model }),
        onSome: op => ({
          model: withBoardModel(
            model,
            foldAccepted(
              modifyFields(board, {
                pending: pending => acceptOp(pending, toAccepted(op)),
              }),
            ),
          ),
        }),
      }),
    ),
  )

const declineOperation = <Op extends PendingOp>(
  model: Model,
  opId: number,
  isOp: (op: PendingOp) => op is Op,
  f: (board: Board, op: Op) => Board,
): UpdateReturn =>
  withBoard(model, board =>
    pipe(
      findAwaitingOp(board.pending, opId),
      Option.filter(isOp),
      Option.match({
        onNone: () => ({ model }),
        onSome: op => ({
          model: withBoardModel(
            model,
            foldAccepted(
              f(
                modifyFields(board, {
                  pending: pending => dropDeclinedOp(pending, op),
                }),
                op,
              ),
            ),
          ),
        }),
      }),
    ),
  )

const confirmOnBoard = (
  board: Board,
  f: (columns: Columns) => Columns,
): Board =>
  modifyFields(board, {
    columns: columns => modifyLoadedColumns(columns, f),
  })

const modifySelected = (
  board: Board,
  cardId: number,
  f: (
    selected: Extract<Detail, { _tag: 'CardSelected' }>,
  ) => Extract<Detail, { _tag: 'CardSelected' }>,
): Board =>
  modifyFields(board, {
    detail: detail =>
      detail._tag === 'CardSelected' && detail.cardId === cardId
        ? f(detail)
        : detail,
  })

const modifyLoadedChecklist = (
  checklist: ChecklistState,
  f: (
    items: Extract<ChecklistState, { _tag: 'ChecklistLoaded' }>['items'],
  ) => Extract<ChecklistState, { _tag: 'ChecklistLoaded' }>['items'],
): ChecklistState =>
  checklist._tag === 'ChecklistLoaded'
    ? ChecklistState.ChecklistLoaded({ items: f(checklist.items) })
    : checklist

const selectedCard = (
  board: Board,
): Option.Option<Extract<Detail, { _tag: 'CardSelected' }>> =>
  board.detail._tag === 'CardSelected'
    ? Option.some(board.detail)
    : Option.none()

// UPDATE

export const update = (model: Model, message: Message) =>
  Message.match<UpdateReturn>(message, {
    ClickedBoardTab: () => {
      if (model.page._tag === 'BoardPage') {
        return { model }
      }
      const boardInit = initBoard(model.nextId)
      return {
        model: {
          page: Page.BoardPage({ board: boardInit.board }),
          nextId: boardInit.nextId,
        },
        commands: boardInit.commands,
      }
    },

    ClickedArchiveTab: () => {
      if (model.page._tag === 'ArchivePage') {
        return { model }
      }
      const requestId = model.nextId
      return {
        model: {
          page: Page.ArchivePage({
            archive: {
              list: ArchiveList.ArchiveLoading({ requestId }),
              pendingRestores: [],
              maybeRestoreError: Option.none(),
            },
          }),
          nextId: requestId + 1,
        },
        commands: [FetchArchived({ requestId })],
      }
    },

    // COLUMNS

    SucceededFetchCards: ({ requestId, column, cards }) =>
      withBoard(model, board => {
        const state = board.columns[column]
        if (
          state._tag !== 'ColumnLoading' ||
          state.requestId !== requestId
        ) {
          return { model }
        }
        return {
          model: withBoardModel(
            model,
            modifyFields(board, {
              columns: columns => ({
                ...columns,
                [column]: ColumnState.ColumnLoaded({ cards }),
              }),
            }),
          ),
        }
      }),

    FailedFetchCards: ({ requestId, column, error }) =>
      withBoard(model, board => {
        const state = board.columns[column]
        if (
          state._tag !== 'ColumnLoading' ||
          state.requestId !== requestId
        ) {
          return { model }
        }
        return {
          model: withBoardModel(
            model,
            modifyFields(board, {
              columns: columns => ({
                ...columns,
                [column]: ColumnState.ColumnFailed({ error }),
              }),
            }),
          ),
        }
      }),

    ClickedRetryColumn: ({ column }) =>
      withBoard(model, board => {
        if (board.columns[column]._tag !== 'ColumnFailed') {
          return { model }
        }
        const requestId = model.nextId
        return {
          model: withBoardModel(
            allocateId(model),
            modifyFields(board, {
              columns: columns => ({
                ...columns,
                [column]: ColumnState.ColumnLoading({ requestId }),
              }),
            }),
          ),
          commands: [FetchCards({ requestId, column })],
        }
      }),

    // MOVING

    ClickedMoveCard: ({ cardId, direction }) =>
      withBoard(model, board => {
        const columns = displayedColumns(board)
        return Option.match(locateCard(columns, cardId), {
          onNone: () => ({ model }),
          onSome: location => {
            const availability = moveAvailability(columns, location, direction)
            if (availability._tag !== 'AvailableMove') {
              return { model }
            }
            const opId = model.nextId
            const { column, index } = availability
            return {
              model: withBoardModel(
                allocateId(model),
                modifyFields(board, {
                  pending: pending =>
                    Array.append(pending, awaiting(PendingOp.PendingMove({ opId, cardId, column, index })),
                    ),
                  maybeMoveError: () => Option.none(),
                }),
              ),
              commands: [MoveCard({ opId, cardId, column, index })],
            }
          },
        })
      }),

    SucceededMoveCard: ({ opId }) =>
      acceptOperation(model, opId, PendingOp.guards.PendingMove, op => op),

    FailedMoveCard: ({ opId, error }) =>
      declineOperation(model, opId, PendingOp.guards.PendingMove, board =>
        modifyFields(board, { maybeMoveError: () => Option.some(error) }),
      ),

    // ADDING A CARD

    UpdatedNewCardTitle: ({ value }) =>
      withBoard(model, board => ({
        model: withBoardModel(
          model,
          modifyFields(board, { newCardInput: () => value }),
        ),
      })),

    ClickedAddCard: () =>
      withBoard(model, board => {
        const title = String.trim(board.newCardInput)
        if (
          String.isEmpty(title) ||
          board.columns.todo._tag !== 'ColumnLoaded'
        ) {
          return { model }
        }
        const opId = model.nextId
        return {
          model: withBoardModel(
            allocateId(model),
            modifyFields(board, {
              pending: pending =>
                Array.append(pending, awaiting(PendingOp.PendingAdd({ opId, title }))),
              newCardInput: () => '',
              maybeAddError: () => Option.none(),
            }),
          ),
          commands: [AddCard({ opId, column: 'todo', title })],
        }
      }),

    SucceededAddCard: ({ opId, card }) =>
      acceptOperation(model, opId, PendingOp.guards.PendingAdd, () =>
        PendingOp.AcceptedAdd({ opId, card }),
      ),

    FailedAddCard: ({ opId, error }) =>
      declineOperation(model, opId, PendingOp.guards.PendingAdd, board =>
        modifyFields(board, { maybeAddError: () => Option.some(error) }),
      ),

    // SELECTING

    ClickedCard: ({ cardId }) =>
      withBoard(model, board => {
        const isAlreadySelected =
          board.detail._tag === 'CardSelected' &&
          board.detail.cardId === cardId
        if (
          isAlreadySelected ||
          Option.isNone(locateCard(displayedColumns(board), cardId))
        ) {
          return { model }
        }
        const requestId = model.nextId
        return {
          model: withBoardModel(
            allocateId(model),
            modifyFields(board, {
              detail: () =>
                Detail.CardSelected({
                  cardId,
                  titleInput: '',
                  itemInput: '',
                  checklist: ChecklistState.ChecklistLoading({ requestId }),
                  maybeRenameError: Option.none(),
                  maybeItemError: Option.none(),
                }),
            }),
          ),
          commands: [FetchChecklist({ requestId, cardId })],
        }
      }),

    // RENAMING

    UpdatedTitleInput: ({ value }) =>
      withBoard(model, board =>
        Option.match(selectedCard(board), {
          onNone: () => ({ model }),
          onSome: selected => ({
            model: withBoardModel(
              model,
              modifySelected(board, selected.cardId, detail =>
                modifyFields(detail, { titleInput: () => value }),
              ),
            ),
          }),
        }),
      ),

    ClickedRename: () =>
      withBoard(model, board =>
        Option.match(selectedCard(board), {
          onNone: () => ({ model }),
          onSome: ({ cardId, titleInput }) => {
            const title = String.trim(titleInput)
            if (String.isEmpty(title)) {
              return { model }
            }
            const opId = model.nextId
            const withOp = modifyFields(board, {
              pending: pending =>
                Array.append(pending, awaiting(PendingOp.PendingRename({ opId, cardId, title })),
                ),
            })
            return {
              model: withBoardModel(
                allocateId(model),
                modifySelected(withOp, cardId, detail =>
                  modifyFields(detail, {
                    titleInput: () => '',
                    maybeRenameError: () => Option.none(),
                  }),
                ),
              ),
              commands: [RenameCard({ opId, cardId, title })],
            }
          },
        }),
      ),

    SucceededRenameCard: ({ opId, title }) =>
      acceptOperation(model, opId, PendingOp.guards.PendingRename, op =>
        PendingOp.PendingRename({ ...op, title }),
      ),

    FailedRenameCard: ({ opId, error }) =>
      declineOperation(model, opId, PendingOp.guards.PendingRename, (board, op) =>
        modifySelected(board, op.cardId, detail =>
          modifyFields(detail, { maybeRenameError: () => Option.some(error) }),
        ),
      ),

    // ARCHIVING

    ClickedArchive: () =>
      withBoard(model, board =>
        Option.match(selectedCard(board), {
          onNone: () => ({ model }),
          onSome: ({ cardId }) => {
            const opId = model.nextId
            return {
              model: withBoardModel(
                allocateId(model),
                modifyFields(board, {
                  pending: pending =>
                    Array.append(pending, awaiting(PendingOp.PendingArchive({ opId, cardId })),
                    ),
                  detail: () => Detail.NothingSelected(),
                  maybeArchiveError: () => Option.none(),
                }),
              ),
              commands: [ArchiveCard({ opId, cardId })],
            }
          },
        }),
      ),

    SucceededArchiveCard: ({ opId }) =>
      acceptOperation(model, opId, PendingOp.guards.PendingArchive, op => op),

    FailedArchiveCard: ({ opId, error }) =>
      declineOperation(model, opId, PendingOp.guards.PendingArchive, board =>
        modifyFields(board, { maybeArchiveError: () => Option.some(error) }),
      ),

    // CHECKLIST

    SucceededFetchChecklist: ({ requestId, items }) =>
      withBoard(model, board =>
        Option.match(selectedCard(board), {
          onNone: () => ({ model }),
          onSome: selected => {
            if (
              selected.checklist._tag !== 'ChecklistLoading' ||
              selected.checklist.requestId !== requestId
            ) {
              return { model }
            }
            return {
              model: withBoardModel(
                model,
                modifySelected(board, selected.cardId, detail =>
                  modifyFields(detail, {
                    checklist: () => ChecklistState.ChecklistLoaded({ items }),
                  }),
                ),
              ),
            }
          },
        }),
      ),

    FailedFetchChecklist: ({ requestId, error }) =>
      withBoard(model, board =>
        Option.match(selectedCard(board), {
          onNone: () => ({ model }),
          onSome: selected => {
            if (
              selected.checklist._tag !== 'ChecklistLoading' ||
              selected.checklist.requestId !== requestId
            ) {
              return { model }
            }
            return {
              model: withBoardModel(
                model,
                modifySelected(board, selected.cardId, detail =>
                  modifyFields(detail, {
                    checklist: () => ChecklistState.ChecklistFailed({ error }),
                  }),
                ),
              ),
            }
          },
        }),
      ),

    ClickedToggleItem: ({ itemId }) =>
      withBoard(model, board =>
        Option.match(selectedCard(board), {
          onNone: () => ({ model }),
          onSome: ({ cardId, checklist }) => {
            if (checklist._tag !== 'ChecklistLoaded') {
              return { model }
            }
            const maybeItem = pipe(
              applyPendingItemOps(checklist.items, board.pending, cardId),
              Array.findFirst(
                row => row._tag === 'ItemRow' && row.item.id === itemId,
              ),
              Option.flatMap(row =>
                row._tag === 'ItemRow' ? Option.some(row.item) : Option.none(),
              ),
            )
            return Option.match(maybeItem, {
              onNone: () => ({ model }),
              onSome: item => {
                const opId = model.nextId
                const done = !item.done
                const withOp = modifyFields(board, {
                  pending: pending =>
                    Array.append(pending, awaiting(PendingOp.PendingToggle({
                        opId,
                        cardId,
                        itemId,
                        done,
                        previous: item.done,
                      })),
                    ),
                })
                return {
                  model: withBoardModel(
                    allocateId(model),
                    modifySelected(withOp, cardId, detail =>
                      modifyFields(detail, {
                        maybeItemError: () => Option.none(),
                      }),
                    ),
                  ),
                  commands: [ToggleItem({ opId, cardId, itemId, done })],
                }
              },
            })
          },
        }),
      ),

    SucceededToggleItem: ({ opId }) =>
      acceptOperation(model, opId, PendingOp.guards.PendingToggle, op => op),

    FailedToggleItem: ({ opId, error }) =>
      declineOperation(
        model,
        opId,
        PendingOp.guards.PendingToggle,
        (board, op) =>
          modifySelected(board, op.cardId, detail =>
            modifyFields(detail, { maybeItemError: () => Option.some(error) }),
          ),
      ),

    UpdatedItemInput: ({ value }) =>
      withBoard(model, board =>
        Option.match(selectedCard(board), {
          onNone: () => ({ model }),
          onSome: selected => ({
            model: withBoardModel(
              model,
              modifySelected(board, selected.cardId, detail =>
                modifyFields(detail, { itemInput: () => value }),
              ),
            ),
          }),
        }),
      ),

    ClickedAddItem: () =>
      withBoard(model, board =>
        Option.match(selectedCard(board), {
          onNone: () => ({ model }),
          onSome: ({ cardId, itemInput, checklist }) => {
            const text = String.trim(itemInput)
            if (
              String.isEmpty(text) ||
              checklist._tag !== 'ChecklistLoaded'
            ) {
              return { model }
            }
            const opId = model.nextId
            const withOp = modifyFields(board, {
              pending: pending =>
                Array.append(pending, awaiting(PendingOp.PendingAddItem({ opId, cardId, text })),
                ),
            })
            return {
              model: withBoardModel(
                allocateId(model),
                modifySelected(withOp, cardId, detail =>
                  modifyFields(detail, {
                    itemInput: () => '',
                    maybeItemError: () => Option.none(),
                  }),
                ),
              ),
              commands: [AddItem({ opId, cardId, text })],
            }
          },
        }),
      ),

    SucceededAddItem: ({ opId, item }) =>
      acceptOperation(model, opId, PendingOp.guards.PendingAddItem, op =>
        PendingOp.AcceptedAddItem({ opId, cardId: op.cardId, item }),
      ),

    FailedAddItem: ({ opId, error }) =>
      declineOperation(model, opId, PendingOp.guards.PendingAddItem, (board, op) =>
        modifySelected(board, op.cardId, detail =>
          modifyFields(detail, { maybeItemError: () => Option.some(error) }),
        ),
      ),

    // ARCHIVE PAGE

    SucceededFetchArchived: ({ requestId, cards }) =>
      withArchive(model, archive => {
        if (
          archive.list._tag !== 'ArchiveLoading' ||
          archive.list.requestId !== requestId
        ) {
          return { model }
        }
        return {
          model: withArchiveModel(
            model,
            modifyFields(archive, {
              list: () => ArchiveList.ArchiveLoaded({ cards }),
            }),
          ),
        }
      }),

    FailedFetchArchived: ({ requestId, error }) =>
      withArchive(model, archive => {
        if (
          archive.list._tag !== 'ArchiveLoading' ||
          archive.list.requestId !== requestId
        ) {
          return { model }
        }
        return {
          model: withArchiveModel(
            model,
            modifyFields(archive, {
              list: () => ArchiveList.ArchiveFailed({ error }),
            }),
          ),
        }
      }),

    ClickedRestore: ({ cardId }) =>
      withArchive(model, archive => {
        const isListed =
          archive.list._tag === 'ArchiveLoaded' &&
          Array.some(archive.list.cards, card => card.id === cardId)
        const isRestoring = Array.some(
          archive.pendingRestores,
          restore => restore.cardId === cardId,
        )
        if (!isListed || isRestoring) {
          return { model }
        }
        const opId = model.nextId
        return {
          model: withArchiveModel(
            allocateId(model),
            modifyFields(archive, {
              pendingRestores: restores =>
                Array.append(restores, { opId, cardId }),
              maybeRestoreError: () => Option.none(),
            }),
          ),
          commands: [RestoreCard({ opId, cardId })],
        }
      }),

    SucceededRestoreCard: ({ opId }) =>
      withArchive(model, archive =>
        Option.match(
          Array.findFirst(
            archive.pendingRestores,
            restore => restore.opId === opId,
          ),
          {
            onNone: () => ({ model }),
            onSome: restore => ({
              model: withArchiveModel(
                model,
                modifyFields(archive, {
                  pendingRestores: restores =>
                    Array.filter(restores, other => other.opId !== opId),
                  list: list =>
                    list._tag === 'ArchiveLoaded'
                      ? ArchiveList.ArchiveLoaded({
                          cards: Array.filter(
                            list.cards,
                            card => card.id !== restore.cardId,
                          ),
                        })
                      : list,
                }),
              ),
            }),
          },
        ),
      ),

    FailedRestoreCard: ({ opId, error }) =>
      withArchive(model, archive => {
        if (
          !Array.some(archive.pendingRestores, restore => restore.opId === opId)
        ) {
          return { model }
        }
        return {
          model: withArchiveModel(
            model,
            modifyFields(archive, {
              pendingRestores: restores =>
                Array.filter(restores, other => other.opId !== opId),
              maybeRestoreError: () => Option.some(error),
            }),
          ),
        }
      }),
  })
