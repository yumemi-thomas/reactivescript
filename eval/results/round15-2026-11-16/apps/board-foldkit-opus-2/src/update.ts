import { Array, Option, String, pipe } from 'effect'
import { type Update } from 'foldkit'
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
  BoardOperation,
  type ColumnId,
  ColumnLoad,
  type Columns,
  type Lanes,
  type ShownRow,
  addConfirmedCard,
  addConfirmedItem,
  confirmOperation,
  findOperation,
  findShownCard,
  moveTarget,
  rememberChecklist,
  shownItems,
  shownLanes,
  withoutOperation,
} from './domain'
import { Message } from './message'
import {
  type Archive,
  type Board,
  ChecklistLoad,
  type Model,
  Page,
  type SelectedCard,
} from './model'

type UpdateReturn = Update.Return<Model, Message>

// INIT

export const initBoard = (nextId: number): UpdateReturn => ({
  model: {
    page: Page.BoardPage({
      board: {
        columns: {
          todo: ColumnLoad.ColumnLoading({ requestId: nextId }),
          doing: ColumnLoad.ColumnLoading({ requestId: nextId + 1 }),
          done: ColumnLoad.ColumnLoading({ requestId: nextId + 2 }),
        },
        operations: [],
        checklists: [],
        newCardInput: '',
        maybeSelected: Option.none(),
        maybeMoveError: Option.none(),
        maybeAddError: Option.none(),
        maybeArchiveError: Option.none(),
      },
    }),
    nextId: nextId + 3,
  },
  commands: [
    FetchCards({ requestId: nextId, column: 'todo' }),
    FetchCards({ requestId: nextId + 1, column: 'doing' }),
    FetchCards({ requestId: nextId + 2, column: 'done' }),
  ],
})

export const initArchive = (nextId: number): UpdateReturn => ({
  model: {
    page: Page.ArchivePage({
      archive: {
        list: ArchiveLoad.ArchiveLoading({ requestId: nextId }),
        restores: [],
        maybeRestoreError: Option.none(),
      },
    }),
    nextId: nextId + 1,
  },
  commands: [FetchArchived({ requestId: nextId })],
})

// HELPERS

const withBoard = (model: Model, board: Board, nextId = model.nextId): Model => ({
  page: Page.BoardPage({ board }),
  nextId,
})

const withArchive = (
  model: Model,
  archive: Archive,
  nextId = model.nextId,
): Model => ({
  page: Page.ArchivePage({ archive }),
  nextId,
})

const onBoard = (
  model: Model,
  f: (board: Board) => UpdateReturn,
): UpdateReturn =>
  Page.match(model.page, {
    BoardPage: ({ board }) => f(board),
    ArchivePage: () => ({ model }),
  })

const onArchive = (
  model: Model,
  f: (archive: Archive) => UpdateReturn,
): UpdateReturn =>
  Page.match(model.page, {
    BoardPage: () => ({ model }),
    ArchivePage: ({ archive }) => f(archive),
  })

const onSelected = (
  model: Model,
  f: (board: Board, selected: SelectedCard) => UpdateReturn,
): UpdateReturn =>
  onBoard(model, board =>
    Option.match(board.maybeSelected, {
      onNone: () => ({ model }),
      onSome: selected => f(board, selected),
    }),
  )

const modifySelected = (
  board: Board,
  f: (selected: SelectedCard) => SelectedCard,
): Board =>
  modifyFields(board, { maybeSelected: maybeSelected => Option.map(maybeSelected, f) })

const boardLanes = (board: Board): Lanes<ShownRow> =>
  shownLanes(board.columns, board.checklists, board.operations)

const setColumn = (
  columns: Columns,
  column: ColumnId,
  load: ColumnLoad,
): Columns => ({
  todo: column === 'todo' ? load : columns.todo,
  doing: column === 'doing' ? load : columns.doing,
  done: column === 'done' ? load : columns.done,
})

const isLoadingRequest = (load: ColumnLoad, requestId: number): boolean =>
  load._tag === 'ColumnLoading' && load.requestId === requestId

const isChecklistRequest = (
  selected: SelectedCard,
  requestId: number,
): boolean =>
  selected.checklist._tag === 'ChecklistLoading' &&
  selected.checklist.requestId === requestId

const isSelectedCard = (board: Board, cardId: number): boolean =>
  Option.exists(board.maybeSelected, selected => selected.cardId === cardId)

const confirmOnBoard = (
  board: Board,
  operation: BoardOperation,
): Board => {
  const confirmed = confirmOperation(board.columns, board.checklists, operation)
  return modifyFields(board, {
    columns: () => confirmed.columns,
    checklists: () => confirmed.checklists,
    operations: operations =>
      withoutOperation(operations, operation.operationId),
  })
}

const dropOperation = (board: Board, operationId: number): Board =>
  modifyFields(board, {
    operations: operations => withoutOperation(operations, operationId),
  })

const onOperation = (
  model: Model,
  operationId: number,
  f: (board: Board, operation: BoardOperation) => Board,
): UpdateReturn =>
  onBoard(model, board =>
    Option.match(findOperation(board.operations, operationId), {
      onNone: () => ({ model }),
      onSome: operation => ({ model: withBoard(model, f(board, operation)) }),
    }),
  )

const errorOnSelected = (
  board: Board,
  cardId: number,
  f: (selected: SelectedCard) => SelectedCard,
): Board => (isSelectedCard(board, cardId) ? modifySelected(board, f) : board)

// UPDATE

export const update = (model: Model, message: Message) =>
  Message.match<UpdateReturn>(message, {
    ClickedBoardTab: () =>
      Page.match(model.page, {
        BoardPage: () => ({ model }),
        ArchivePage: () => initBoard(model.nextId),
      }),

    ClickedArchiveTab: () =>
      Page.match(model.page, {
        BoardPage: () => initArchive(model.nextId),
        ArchivePage: () => ({ model }),
      }),

    SucceededFetchCards: ({ requestId, column, cards }) =>
      onBoard(model, board =>
        isLoadingRequest(board.columns[column], requestId)
          ? {
              model: withBoard(
                model,
                modifyFields(board, {
                  columns: columns =>
                    setColumn(columns, column, ColumnLoad.ColumnLoaded({ cards })),
                }),
              ),
            }
          : { model },
      ),

    FailedFetchCards: ({ requestId, column, error }) =>
      onBoard(model, board =>
        isLoadingRequest(board.columns[column], requestId)
          ? {
              model: withBoard(
                model,
                modifyFields(board, {
                  columns: columns =>
                    setColumn(columns, column, ColumnLoad.ColumnFailed({ error })),
                }),
              ),
            }
          : { model },
      ),

    ClickedRetryColumn: ({ column }) =>
      onBoard(model, board => {
        if (board.columns[column]._tag !== 'ColumnFailed') {
          return { model }
        }
        const requestId = model.nextId
        return {
          model: withBoard(
            model,
            modifyFields(board, {
              columns: columns =>
                setColumn(columns, column, ColumnLoad.ColumnLoading({ requestId })),
            }),
            requestId + 1,
          ),
          commands: [FetchCards({ requestId, column })],
        }
      }),

    ClickedMove: ({ cardId, direction }) =>
      onBoard(model, board => {
        const lanes = boardLanes(board)
        return pipe(
          findShownCard(lanes, cardId),
          Option.flatMap(shown =>
            moveTarget(lanes, shown.column, shown.index, direction),
          ),
          Option.match({
            onNone: () => ({ model }),
            onSome: ({ column, index }) => {
              const operationId = model.nextId
              return {
                model: withBoard(
                  model,
                  modifyFields(board, {
                    operations: operations =>
                      Array.append(
                        operations,
                        BoardOperation.MoveOperation({
                          operationId,
                          cardId,
                          column,
                          index,
                        }),
                      ),
                    maybeMoveError: () => Option.none(),
                  }),
                  operationId + 1,
                ),
                commands: [MoveCard({ operationId, cardId, column, index })],
              }
            },
          }),
        )
      }),

    SucceededMoveCard: ({ operationId }) =>
      onOperation(model, operationId, confirmOnBoard),

    FailedMoveCard: ({ operationId, error }) =>
      onOperation(model, operationId, board =>
        modifyFields(dropOperation(board, operationId), {
          maybeMoveError: () => Option.some(error),
        }),
      ),

    UpdatedNewCardInput: ({ value }) =>
      onBoard(model, board => ({
        model: withBoard(model, modifyFields(board, { newCardInput: () => value })),
      })),

    ClickedAddCard: () =>
      onBoard(model, board => {
        const title = String.trim(board.newCardInput)
        if (
          String.isEmpty(title) ||
          board.columns.todo._tag !== 'ColumnLoaded'
        ) {
          return { model }
        }
        const operationId = model.nextId
        return {
          model: withBoard(
            model,
            modifyFields(board, {
              operations: operations =>
                Array.append(
                  operations,
                  BoardOperation.AddCardOperation({ operationId, title }),
                ),
              newCardInput: () => '',
              maybeAddError: () => Option.none(),
            }),
            operationId + 1,
          ),
          commands: [AddCard({ operationId, title })],
        }
      }),

    SucceededAddCard: ({ operationId, id, title }) =>
      onOperation(model, operationId, board =>
        modifyFields(dropOperation(board, operationId), {
          columns: columns =>
            addConfirmedCard(columns, { id, title, done: 0, total: 0 }),
        }),
      ),

    FailedAddCard: ({ operationId, error }) =>
      onOperation(model, operationId, board =>
        modifyFields(dropOperation(board, operationId), {
          maybeAddError: () => Option.some(error),
        }),
      ),

    ClickedCard: ({ cardId }) =>
      onBoard(model, board => {
        const isAlreadyShowing = Option.exists(
          board.maybeSelected,
          selected =>
            selected.cardId === cardId &&
            selected.checklist._tag !== 'ChecklistFailed',
        )
        if (
          isAlreadyShowing ||
          Option.isNone(findShownCard(boardLanes(board), cardId))
        ) {
          return { model }
        }
        const requestId = model.nextId
        return {
          model: withBoard(
            model,
            modifyFields(board, {
              maybeSelected: () =>
                Option.some({
                  cardId,
                  titleInput: '',
                  itemInput: '',
                  checklist: ChecklistLoad.ChecklistLoading({ requestId }),
                  maybeRenameError: Option.none(),
                  maybeItemError: Option.none(),
                }),
            }),
            requestId + 1,
          ),
          commands: [FetchChecklist({ requestId, cardId })],
        }
      }),

    UpdatedTitleInput: ({ value }) =>
      onSelected(model, board => ({
        model: withBoard(
          model,
          modifySelected(board, selected =>
            modifyFields(selected, { titleInput: () => value }),
          ),
        ),
      })),

    ClickedRename: () =>
      onSelected(model, (board, selected) => {
        const title = String.trim(selected.titleInput)
        if (
          String.isEmpty(title) ||
          Option.isNone(findShownCard(boardLanes(board), selected.cardId))
        ) {
          return { model }
        }
        const operationId = model.nextId
        const cardId = selected.cardId
        return {
          model: withBoard(
            model,
            modifyFields(
              modifySelected(board, current =>
                modifyFields(current, { maybeRenameError: () => Option.none() }),
              ),
              {
                operations: operations =>
                  Array.append(
                    operations,
                    BoardOperation.RenameOperation({ operationId, cardId, title }),
                  ),
              },
            ),
            operationId + 1,
          ),
          commands: [RenameCard({ operationId, cardId, title })],
        }
      }),

    SucceededRenameCard: ({ operationId, title }) =>
      onOperation(model, operationId, (board, operation) =>
        operation._tag === 'RenameOperation'
          ? confirmOnBoard(board, modifyFields(operation, { title: () => title }))
          : confirmOnBoard(board, operation),
      ),

    FailedRenameCard: ({ operationId, error }) =>
      onOperation(model, operationId, (board, operation) =>
        operation._tag === 'RenameOperation'
          ? errorOnSelected(
              dropOperation(board, operationId),
              operation.cardId,
              selected =>
                modifyFields(selected, {
                  maybeRenameError: () => Option.some(error),
                }),
            )
          : dropOperation(board, operationId),
      ),

    ClickedArchive: () =>
      onSelected(model, (board, selected) => {
        if (Option.isNone(findShownCard(boardLanes(board), selected.cardId))) {
          return { model }
        }
        const operationId = model.nextId
        const cardId = selected.cardId
        return {
          model: withBoard(
            model,
            modifyFields(board, {
              operations: operations =>
                Array.append(
                  operations,
                  BoardOperation.ArchiveOperation({ operationId, cardId }),
                ),
              maybeSelected: () => Option.none(),
              maybeArchiveError: () => Option.none(),
            }),
            operationId + 1,
          ),
          commands: [ArchiveCard({ operationId, cardId })],
        }
      }),

    SucceededArchiveCard: ({ operationId }) =>
      onOperation(model, operationId, confirmOnBoard),

    FailedArchiveCard: ({ operationId, error }) =>
      onOperation(model, operationId, board =>
        modifyFields(dropOperation(board, operationId), {
          maybeArchiveError: () => Option.some(error),
        }),
      ),

    SucceededFetchChecklist: ({ requestId, cardId, items }) =>
      onSelected(model, (board, selected) =>
        isChecklistRequest(selected, requestId) && selected.cardId === cardId
          ? {
              model: withBoard(
                model,
                modifyFields(
                  modifySelected(board, current =>
                    modifyFields(current, {
                      checklist: () => ChecklistLoad.ChecklistLoaded(),
                    }),
                  ),
                  {
                    checklists: checklists =>
                      rememberChecklist(checklists, cardId, items),
                  },
                ),
              ),
            }
          : { model },
      ),

    FailedFetchChecklist: ({ requestId, error }) =>
      onSelected(model, (board, selected) =>
        isChecklistRequest(selected, requestId)
          ? {
              model: withBoard(
                model,
                modifySelected(board, current =>
                  modifyFields(current, {
                    checklist: () => ChecklistLoad.ChecklistFailed({ error }),
                  }),
                ),
              ),
            }
          : { model },
      ),

    ClickedToggleItem: ({ itemId }) =>
      onSelected(model, (board, selected) => {
        if (selected.checklist._tag !== 'ChecklistLoaded') {
          return { model }
        }
        const cardId = selected.cardId
        return pipe(
          shownItems(board.checklists, board.operations, cardId),
          Option.flatMap(items =>
            Array.findFirst(
              items,
              item => item._tag === 'SettledItem' && item.item.id === itemId,
            ),
          ),
          Option.flatMap(item =>
            item._tag === 'SettledItem' ? Option.some(item.item) : Option.none(),
          ),
          Option.match({
            onNone: () => ({ model }),
            onSome: item => {
              const operationId = model.nextId
              const done = !item.done
              return {
                model: withBoard(
                  model,
                  modifyFields(
                    modifySelected(board, current =>
                      modifyFields(current, {
                        maybeItemError: () => Option.none(),
                      }),
                    ),
                    {
                      operations: operations =>
                        Array.append(
                          operations,
                          BoardOperation.ToggleItemOperation({
                            operationId,
                            cardId,
                            itemId,
                            done,
                          }),
                        ),
                    },
                  ),
                  operationId + 1,
                ),
                commands: [ToggleItem({ operationId, cardId, itemId, done })],
              }
            },
          }),
        )
      }),

    SucceededToggleItem: ({ operationId, done }) =>
      onOperation(model, operationId, (board, operation) =>
        operation._tag === 'ToggleItemOperation'
          ? confirmOnBoard(board, modifyFields(operation, { done: () => done }))
          : confirmOnBoard(board, operation),
      ),

    FailedToggleItem: ({ operationId, error }) =>
      onOperation(model, operationId, (board, operation) =>
        operation._tag === 'ToggleItemOperation'
          ? errorOnSelected(
              dropOperation(board, operationId),
              operation.cardId,
              selected =>
                modifyFields(selected, {
                  maybeItemError: () => Option.some(error),
                }),
            )
          : dropOperation(board, operationId),
      ),

    UpdatedItemInput: ({ value }) =>
      onSelected(model, board => ({
        model: withBoard(
          model,
          modifySelected(board, selected =>
            modifyFields(selected, { itemInput: () => value }),
          ),
        ),
      })),

    ClickedAddItem: () =>
      onSelected(model, (board, selected) => {
        const text = String.trim(selected.itemInput)
        if (
          String.isEmpty(text) ||
          selected.checklist._tag !== 'ChecklistLoaded'
        ) {
          return { model }
        }
        const operationId = model.nextId
        const cardId = selected.cardId
        return {
          model: withBoard(
            model,
            modifyFields(
              modifySelected(board, current =>
                modifyFields(current, {
                  itemInput: () => '',
                  maybeItemError: () => Option.none(),
                }),
              ),
              {
                operations: operations =>
                  Array.append(
                    operations,
                    BoardOperation.AddItemOperation({ operationId, cardId, text }),
                  ),
              },
            ),
            operationId + 1,
          ),
          commands: [AddItem({ operationId, cardId, text })],
        }
      }),

    SucceededAddItem: ({ operationId, item }) =>
      onOperation(model, operationId, (board, operation) =>
        operation._tag === 'AddItemOperation'
          ? modifyFields(dropOperation(board, operationId), {
              checklists: checklists =>
                addConfirmedItem(checklists, operation.cardId, item),
            })
          : dropOperation(board, operationId),
      ),

    FailedAddItem: ({ operationId, error }) =>
      onOperation(model, operationId, (board, operation) =>
        operation._tag === 'AddItemOperation'
          ? errorOnSelected(
              dropOperation(board, operationId),
              operation.cardId,
              selected =>
                modifyFields(selected, {
                  maybeItemError: () => Option.some(error),
                }),
            )
          : dropOperation(board, operationId),
      ),

    SucceededFetchArchived: ({ requestId, cards }) =>
      onArchive(model, archive =>
        archive.list._tag === 'ArchiveLoading' &&
        archive.list.requestId === requestId
          ? {
              model: withArchive(
                model,
                modifyFields(archive, {
                  list: () => ArchiveLoad.ArchiveLoaded({ cards }),
                }),
              ),
            }
          : { model },
      ),

    FailedFetchArchived: ({ requestId, error }) =>
      onArchive(model, archive =>
        archive.list._tag === 'ArchiveLoading' &&
        archive.list.requestId === requestId
          ? {
              model: withArchive(
                model,
                modifyFields(archive, {
                  list: () => ArchiveLoad.ArchiveFailed({ error }),
                }),
              ),
            }
          : { model },
      ),

    ClickedRestore: ({ cardId }) =>
      onArchive(model, archive => {
        const isListed =
          archive.list._tag === 'ArchiveLoaded' &&
          Array.some(archive.list.cards, card => card.id === cardId)
        const isRestoring = Array.some(
          archive.restores,
          restore => restore.cardId === cardId,
        )
        if (!isListed || isRestoring) {
          return { model }
        }
        const operationId = model.nextId
        return {
          model: withArchive(
            model,
            modifyFields(archive, {
              restores: restores =>
                Array.append(restores, { operationId, cardId }),
              maybeRestoreError: () => Option.none(),
            }),
            operationId + 1,
          ),
          commands: [RestoreCard({ operationId, cardId })],
        }
      }),

    SucceededRestoreCard: ({ operationId }) =>
      onArchive(model, archive =>
        Option.match(
          Array.findFirst(
            archive.restores,
            restore => restore.operationId === operationId,
          ),
          {
            onNone: () => ({ model }),
            onSome: restore => ({
              model: withArchive(
                model,
                modifyFields(archive, {
                  restores: restores =>
                    Array.filter(
                      restores,
                      current => current.operationId !== operationId,
                    ),
                  list: list =>
                    ArchiveLoad.match(list, {
                      ArchiveLoading: () => list,
                      ArchiveFailed: () => list,
                      ArchiveLoaded: ({ cards }) =>
                        ArchiveLoad.ArchiveLoaded({
                          cards: Array.filter(
                            cards,
                            card => card.id !== restore.cardId,
                          ),
                        }),
                    }),
                }),
              ),
            }),
          },
        ),
      ),

    FailedRestoreCard: ({ operationId, error }) =>
      onArchive(model, archive =>
        Array.some(
          archive.restores,
          restore => restore.operationId === operationId,
        )
          ? {
              model: withArchive(
                model,
                modifyFields(archive, {
                  restores: restores =>
                    Array.filter(
                      restores,
                      current => current.operationId !== operationId,
                    ),
                  maybeRestoreError: () => Option.some(error),
                }),
              ),
            }
          : { model },
      ),
  })
