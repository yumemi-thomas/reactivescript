import { Array, Match, Option, String, pipe } from 'effect'
import type { Update } from 'foldkit'
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
  BoardOperation,
  COLUMNS,
  ChecklistEntry,
  ChecklistState,
  type Card,
  type Column,
  ColumnState,
  type Columns,
  type Item,
  type ItemBaseline,
  type Lanes,
  type BoardEntry,
  WORK_IN_PROGRESS_LIMIT,
  appendToLane,
  findBaseline,
  findInLanes,
  isCard,
  isEntryOfCard,
  laneLength,
  modifyConfirmed,
  modifyInLanes,
  moveInLanes,
  nextColumn,
  previousColumn,
  removeFromLanes,
  shownChecklist,
  shownLanes,
} from './domain'
import { type Direction, Message, type Tab } from './message'
import {
  ArchiveList,
  type ArchiveModel,
  type BoardModel,
  type Model,
  Page,
  Selection,
} from './model'

type UpdateReturn = Update.Return<Model, Message>

// BOARD HELPERS

export const shownBoard = (board: BoardModel): Lanes<BoardEntry> =>
  shownLanes(board.columns, board.operations, board.baselines)

export const canEnterColumn = (
  lanes: Lanes<BoardEntry>,
  column: Column,
): boolean =>
  Option.isSome(lanes[column]) &&
  (column !== 'doing' || laneLength(lanes, 'doing') < WORK_IN_PROGRESS_LIMIT)

const setColumnState = (
  columns: Columns,
  target: Column,
  state: ColumnState,
): Columns => ({
  todo: target === 'todo' ? state : columns.todo,
  doing: target === 'doing' ? state : columns.doing,
  done: target === 'done' ? state : columns.done,
})

const findOperation = (
  board: BoardModel,
  operationId: number,
): Option.Option<BoardOperation> =>
  Array.findFirst(
    board.operations,
    operation => operation.operationId === operationId,
  )

const withoutOperation = (
  operations: ReadonlyArray<BoardOperation>,
  operationId: number,
): ReadonlyArray<BoardOperation> =>
  Array.filter(operations, operation => operation.operationId !== operationId)

const modifyCard = (
  columns: Columns,
  cardId: number,
  f: (card: Card) => Card,
): Columns =>
  modifyConfirmed(columns, lanes => modifyInLanes(lanes, isCard(cardId), f))

const isSelectedCard = (selection: Selection, cardId: number): boolean =>
  Selection.match(selection, {
    NotSelected: () => false,
    Selected: selected => selected.cardId === cardId,
  })

const modifySelected = (
  selection: Selection,
  f: (selected: typeof Selection.Selected.Type) => Selection,
): Selection =>
  Selection.match(selection, {
    NotSelected: () => selection,
    Selected: selected => f(selected),
  })

const modifySelectedOfCard = (
  selection: Selection,
  cardId: number,
  f: (selected: typeof Selection.Selected.Type) => Selection,
): Selection =>
  modifySelected(selection, selected =>
    selected.cardId === cardId ? f(selected) : selection,
  )

const setItemError = (
  selection: Selection,
  cardId: number,
  error: string,
): Selection =>
  modifySelectedOfCard(selection, cardId, selected =>
    Selection.Selected(
      modifyFields(selected, { maybeItemError: () => Option.some(error) }),
    ),
  )

const modifyLoadedChecklist = (
  selection: Selection,
  cardId: number,
  f: (items: ReadonlyArray<Item>) => ReadonlyArray<Item>,
): Selection =>
  modifySelectedOfCard(selection, cardId, selected =>
    ChecklistState.match(selected.checklist, {
      Loading: () => selection,
      Failed: () => selection,
      Loaded: ({ items }) =>
        Selection.Selected(
          modifyFields(selected, {
            checklist: () => ChecklistState.Loaded({ items: f(items) }),
          }),
        ),
    }),
  )

const setBaseline = (
  baselines: ReadonlyArray<ItemBaseline>,
  itemId: number,
  done: boolean,
): ReadonlyArray<ItemBaseline> =>
  Array.append(
    Array.filter(baselines, baseline => baseline.itemId !== itemId),
    { itemId, done },
  )

const hasPendingToggle = (board: BoardModel, itemId: number): boolean =>
  Array.some(
    board.operations,
    operation => operation._tag === 'Toggle' && operation.itemId === itemId,
  )

export const operationCardId = (operation: BoardOperation): Option.Option<number> =>
  BoardOperation.match(operation, {
    Move: ({ cardId }) => Option.some(cardId),
    AddCard: () => Option.none(),
    Rename: ({ cardId }) => Option.some(cardId),
    Archive: ({ cardId }) => Option.some(cardId),
    Toggle: ({ cardId }) => Option.some(cardId),
    AddItem: ({ cardId }) => Option.some(cardId),
  })

const setItemErrorFor = (
  selection: Selection,
  operation: BoardOperation,
  error: string,
): Selection =>
  Option.match(operationCardId(operation), {
    onNone: () => selection,
    onSome: cardId => setItemError(selection, cardId, error),
  })

const putBoard = (model: Model, board: BoardModel): Model =>
  modifyFields(model, { page: () => Page.BoardPage({ board }) })

const putArchive = (model: Model, archive: ArchiveModel): Model =>
  modifyFields(model, { page: () => Page.ArchivePage({ archive }) })

const onBoard = (
  model: Model,
  f: (board: BoardModel) => UpdateReturn,
): UpdateReturn =>
  Page.match(model.page, {
    BoardPage: ({ board }) => f(board),
    ArchivePage: () => ({ model }),
  })

const onBoardSession = (
  model: Model,
  session: number,
  f: (board: BoardModel) => UpdateReturn,
): UpdateReturn =>
  onBoard(model, board => (board.session === session ? f(board) : { model }))

const onBoardOperation = (
  model: Model,
  session: number,
  operationId: number,
  f: (board: BoardModel, operation: BoardOperation) => UpdateReturn,
): UpdateReturn =>
  onBoardSession(model, session, board =>
    Option.match(findOperation(board, operationId), {
      onNone: () => ({ model }),
      onSome: operation =>
        f(
          modifyFields(board, {
            operations: operations => withoutOperation(operations, operationId),
          }),
          operation,
        ),
    }),
  )

const onSelected = (
  model: Model,
  f: (
    board: BoardModel,
    selected: typeof Selection.Selected.Type,
  ) => UpdateReturn,
): UpdateReturn =>
  onBoard(model, board =>
    Selection.match(board.selection, {
      NotSelected: () => ({ model }),
      Selected: selected => f(board, selected),
    }),
  )

const onArchive = (
  model: Model,
  f: (archive: ArchiveModel) => UpdateReturn,
): UpdateReturn =>
  Page.match(model.page, {
    BoardPage: () => ({ model }),
    ArchivePage: ({ archive }) => f(archive),
  })

const onArchiveSession = (
  model: Model,
  session: number,
  f: (archive: ArchiveModel) => UpdateReturn,
): UpdateReturn =>
  onArchive(model, archive =>
    archive.session === session ? f(archive) : { model },
  )

type MoveTarget = Readonly<{ column: Column; index: number }>

const moveTarget = (
  lanes: Lanes<BoardEntry>,
  column: Column,
  index: number,
  direction: Direction,
): Option.Option<MoveTarget> => {
  const toColumn = (maybeColumn: Option.Option<Column>) =>
    pipe(
      maybeColumn,
      Option.filter(target => canEnterColumn(lanes, target)),
      Option.map(target => ({ column: target, index: laneLength(lanes, target) })),
    )
  return Match.value(direction).pipe(
    Match.withReturnType<Option.Option<MoveTarget>>(),
    Match.when('left', () => toColumn(previousColumn(column))),
    Match.when('right', () => toColumn(nextColumn(column))),
    Match.when('up', () =>
      index > 0 ? Option.some({ column, index: index - 1 }) : Option.none(),
    ),
    Match.when('down', () =>
      index < laneLength(lanes, column) - 1
        ? Option.some({ column, index: index + 1 })
        : Option.none(),
    ),
    Match.exhaustive,
  )
}

// INIT

const initBoard = (session: number) => ({
  board: {
    session,
    columns: {
      todo: ColumnState.Loading(),
      doing: ColumnState.Loading(),
      done: ColumnState.Loading(),
    },
    operations: [],
    baselines: [],
    nextOperationId: 0,
    nextSelection: 0,
    newCardTitle: '',
    selection: Selection.NotSelected(),
    maybeMoveError: Option.none(),
    maybeAddError: Option.none(),
    maybeArchiveError: Option.none(),
  } satisfies BoardModel,
  commands: Array.map(COLUMNS, column => FetchCards({ session, column })),
})

const initArchive = (session: number) => ({
  archive: {
    session,
    list: ArchiveList.Loading(),
    pendingRestores: [],
    nextOperationId: 0,
    maybeRestoreError: Option.none(),
  } satisfies ArchiveModel,
  commands: [FetchArchived({ session })],
})

export const init = (): UpdateReturn => {
  const boardInit = initBoard(0)
  return {
    model: { nextSession: 1, page: Page.BoardPage({ board: boardInit.board }) },
    commands: boardInit.commands,
  }
}

const openTab = (model: Model, tab: Tab): UpdateReturn => {
  const session = model.nextSession
  const nextModel = modifyFields(model, { nextSession: next => next + 1 })
  return Match.value(tab).pipe(
    Match.withReturnType<UpdateReturn>(),
    Match.when('board', () => {
      const boardInit = initBoard(session)
      return {
        model: putBoard(nextModel, boardInit.board),
        commands: boardInit.commands,
      }
    }),
    Match.when('archive', () => {
      const archiveInit = initArchive(session)
      return {
        model: putArchive(nextModel, archiveInit.archive),
        commands: archiveInit.commands,
      }
    }),
    Match.exhaustive,
  )
}

export const currentTab = (page: Page): Tab =>
  Page.match(page, {
    BoardPage: (): Tab => 'board',
    ArchivePage: (): Tab => 'archive',
  })

// UPDATE

export const update = (model: Model, message: Message) =>
  Message.match<UpdateReturn>(message, {
    ClickedTab: ({ tab }) =>
      currentTab(model.page) === tab ? { model } : openTab(model, tab),

    // COLUMNS

    ClickedRetryColumn: ({ column }) =>
      onBoard(model, board =>
        ColumnState.match(board.columns[column], {
          Loading: () => ({ model }),
          Loaded: () => ({ model }),
          Failed: () => ({
            model: putBoard(
              model,
              modifyFields(board, {
                columns: columns =>
                  setColumnState(columns, column, ColumnState.Loading()),
              }),
            ),
            commands: [FetchCards({ session: board.session, column })],
          }),
        }),
      ),

    SucceededFetchCards: ({ session, column, cards }) =>
      onBoardSession(model, session, board =>
        ColumnState.match(board.columns[column], {
          Loaded: () => ({ model }),
          Failed: () => ({ model }),
          Loading: () => ({
            model: putBoard(
              model,
              modifyFields(board, {
                columns: columns =>
                  setColumnState(columns, column, ColumnState.Loaded({ cards })),
              }),
            ),
          }),
        }),
      ),

    FailedFetchCards: ({ session, column, error }) =>
      onBoardSession(model, session, board =>
        ColumnState.match(board.columns[column], {
          Loaded: () => ({ model }),
          Failed: () => ({ model }),
          Loading: () => ({
            model: putBoard(
              model,
              modifyFields(board, {
                columns: columns =>
                  setColumnState(columns, column, ColumnState.Failed({ error })),
              }),
            ),
          }),
        }),
      ),

    // MOVING

    ClickedMove: ({ cardId, direction }) =>
      onBoard(model, board => {
        const lanes = shownBoard(board)
        return pipe(
          findInLanes(lanes, isEntryOfCard(cardId)),
          Option.flatMap(position =>
            moveTarget(lanes, position.column, position.index, direction),
          ),
          Option.match({
            onNone: () => ({ model }),
            onSome: target => {
              const operationId = board.nextOperationId
              return {
                model: putBoard(
                  model,
                  modifyFields(board, {
                    operations: operations =>
                      Array.append(
                        operations,
                        BoardOperation.Move({
                          operationId,
                          cardId,
                          column: target.column,
                          index: target.index,
                        }),
                      ),
                    nextOperationId: next => next + 1,
                    maybeMoveError: () => Option.none(),
                  }),
                ),
                commands: [
                  MoveCard({
                    session: board.session,
                    operationId,
                    cardId,
                    column: target.column,
                    index: target.index,
                  }),
                ],
              }
            },
          }),
        )
      }),

    SucceededMoveCard: ({ session, operationId }) =>
      onBoardOperation(model, session, operationId, (board, operation) => ({
        model: putBoard(
          model,
          BoardOperation.match(operation, {
            Move: ({ cardId, column, index }) =>
              modifyFields(board, {
                columns: columns =>
                  modifyConfirmed(columns, lanes =>
                    moveInLanes(lanes, isCard(cardId), column, index),
                  ),
              }),
            AddCard: () => board,
            Rename: () => board,
            Archive: () => board,
            Toggle: () => board,
            AddItem: () => board,
          }),
        ),
      })),

    FailedMoveCard: ({ session, operationId, error }) =>
      onBoardOperation(model, session, operationId, board => ({
        model: putBoard(
          model,
          modifyFields(board, { maybeMoveError: () => Option.some(error) }),
        ),
      })),

    // ADDING A CARD

    UpdatedNewCardTitle: ({ value }) =>
      onBoard(model, board => ({
        model: putBoard(model, modifyFields(board, { newCardTitle: () => value })),
      })),

    SubmittedNewCard: () =>
      onBoard(model, board => {
        const title = String.trim(board.newCardTitle)
        if (String.isEmpty(title) || Option.isNone(shownBoard(board).todo)) {
          return { model }
        }
        const operationId = board.nextOperationId
        return {
          model: putBoard(
            model,
            modifyFields(board, {
              operations: operations =>
                Array.append(operations, BoardOperation.AddCard({ operationId, title })),
              nextOperationId: next => next + 1,
              newCardTitle: () => '',
              maybeAddError: () => Option.none(),
            }),
          ),
          commands: [AddCard({ session: board.session, operationId, title })],
        }
      }),

    SucceededAddCard: ({ session, operationId, id, title }) =>
      onBoardOperation(model, session, operationId, board => ({
        model: putBoard(
          model,
          modifyFields(board, {
            columns: columns =>
              modifyConfirmed(columns, lanes =>
                Option.isSome(findInLanes(lanes, isCard(id)))
                  ? lanes
                  : appendToLane(lanes, 'todo', { id, title, done: 0, total: 0 }),
              ),
          }),
        ),
      })),

    FailedAddCard: ({ session, operationId, error }) =>
      onBoardOperation(model, session, operationId, board => ({
        model: putBoard(
          model,
          modifyFields(board, { maybeAddError: () => Option.some(error) }),
        ),
      })),

    // SELECTING

    ClickedCard: ({ cardId }) =>
      onBoard(model, board => {
        if (
          isSelectedCard(board.selection, cardId) ||
          Option.isNone(findInLanes(shownBoard(board), isEntryOfCard(cardId)))
        ) {
          return { model }
        }
        const selection = board.nextSelection
        return {
          model: putBoard(
            model,
            modifyFields(board, {
              nextSelection: next => next + 1,
              selection: () =>
                Selection.Selected({
                  cardId,
                  selection,
                  checklist: ChecklistState.Loading(),
                  titleInput: '',
                  itemInput: '',
                  maybeRenameError: Option.none(),
                  maybeItemError: Option.none(),
                }),
            }),
          ),
          commands: [FetchChecklist({ session: board.session, selection, cardId })],
        }
      }),

    // RENAMING

    UpdatedTitleInput: ({ value }) =>
      onSelected(model, (board, selected) => ({
        model: putBoard(
          model,
          modifyFields(board, {
            selection: () =>
              Selection.Selected(modifyFields(selected, { titleInput: () => value })),
          }),
        ),
      })),

    SubmittedRename: () =>
      onSelected(model, (board, selected) => {
        const title = String.trim(selected.titleInput)
        if (String.isEmpty(title)) {
          return { model }
        }
        const operationId = board.nextOperationId
        return {
          model: putBoard(
            model,
            modifyFields(board, {
              operations: operations =>
                Array.append(
                  operations,
                  BoardOperation.Rename({ operationId, cardId: selected.cardId, title }),
                ),
              nextOperationId: next => next + 1,
              selection: () =>
                Selection.Selected(
                  modifyFields(selected, { maybeRenameError: () => Option.none() }),
                ),
            }),
          ),
          commands: [
            RenameCard({
              session: board.session,
              operationId,
              cardId: selected.cardId,
              title,
            }),
          ],
        }
      }),

    SucceededRenameCard: ({ session, operationId, title }) =>
      onBoardOperation(model, session, operationId, (board, operation) => ({
        model: putBoard(
          model,
          BoardOperation.match(operation, {
            Rename: ({ cardId }) =>
              modifyFields(board, {
                columns: columns =>
                  modifyCard(columns, cardId, card => ({
                    id: card.id,
                    title,
                    done: card.done,
                    total: card.total,
                  })),
              }),
            Move: () => board,
            AddCard: () => board,
            Archive: () => board,
            Toggle: () => board,
            AddItem: () => board,
          }),
        ),
      })),

    FailedRenameCard: ({ session, operationId, error }) =>
      onBoardOperation(model, session, operationId, (board, operation) => ({
        model: putBoard(
          model,
          modifyFields(board, {
            selection: selection =>
              BoardOperation.match(operation, {
                Rename: ({ cardId }) =>
                  modifySelectedOfCard(selection, cardId, selected =>
                    Selection.Selected(
                      modifyFields(selected, {
                        maybeRenameError: () => Option.some(error),
                      }),
                    ),
                  ),
                Move: () => selection,
                AddCard: () => selection,
                Archive: () => selection,
                Toggle: () => selection,
                AddItem: () => selection,
              }),
          }),
        ),
      })),

    // ARCHIVING

    ClickedArchive: () =>
      onSelected(model, (board, selected) => {
        const operationId = board.nextOperationId
        return {
          model: putBoard(
            model,
            modifyFields(board, {
              operations: operations =>
                Array.append(
                  operations,
                  BoardOperation.Archive({ operationId, cardId: selected.cardId }),
                ),
              nextOperationId: next => next + 1,
              selection: () => Selection.NotSelected(),
              maybeArchiveError: () => Option.none(),
            }),
          ),
          commands: [
            ArchiveCard({ session: board.session, operationId, cardId: selected.cardId }),
          ],
        }
      }),

    SucceededArchiveCard: ({ session, operationId }) =>
      onBoardOperation(model, session, operationId, (board, operation) => ({
        model: putBoard(
          model,
          BoardOperation.match(operation, {
            Archive: ({ cardId }) =>
              modifyFields(board, {
                columns: columns =>
                  modifyConfirmed(columns, lanes =>
                    removeFromLanes(lanes, isCard(cardId)),
                  ),
              }),
            Move: () => board,
            AddCard: () => board,
            Rename: () => board,
            Toggle: () => board,
            AddItem: () => board,
          }),
        ),
      })),

    FailedArchiveCard: ({ session, operationId, error }) =>
      onBoardOperation(model, session, operationId, board => ({
        model: putBoard(
          model,
          modifyFields(board, { maybeArchiveError: () => Option.some(error) }),
        ),
      })),

    // CHECKLIST

    ClickedRetryChecklist: () =>
      onSelected(model, (board, selected) =>
        ChecklistState.match(selected.checklist, {
          Loading: () => ({ model }),
          Loaded: () => ({ model }),
          Failed: () => {
            const selection = board.nextSelection
            return {
              model: putBoard(
                model,
                modifyFields(board, {
                  nextSelection: next => next + 1,
                  selection: () =>
                    Selection.Selected(
                      modifyFields(selected, {
                        selection: () => selection,
                        checklist: () => ChecklistState.Loading(),
                      }),
                    ),
                }),
              ),
              commands: [
                FetchChecklist({
                  session: board.session,
                  selection,
                  cardId: selected.cardId,
                }),
              ],
            }
          },
        }),
      ),

    SucceededFetchChecklist: ({ session, selection, items }) =>
      onBoardSession(model, session, () =>
        onSelected(model, (board, selected) =>
          selected.selection !== selection
            ? { model }
            : {
                model: putBoard(
                  model,
                  modifyFields(board, {
                    selection: () =>
                      Selection.Selected(
                        modifyFields(selected, {
                          checklist: () => ChecklistState.Loaded({ items }),
                        }),
                      ),
                  }),
                ),
              },
        ),
      ),

    FailedFetchChecklist: ({ session, selection, error }) =>
      onBoardSession(model, session, () =>
        onSelected(model, (board, selected) =>
          selected.selection !== selection
            ? { model }
            : {
                model: putBoard(
                  model,
                  modifyFields(board, {
                    selection: () =>
                      Selection.Selected(
                        modifyFields(selected, {
                          checklist: () => ChecklistState.Failed({ error }),
                        }),
                      ),
                  }),
                ),
              },
        ),
      ),

    // TOGGLING

    ClickedToggle: ({ itemId }) =>
      onSelected(model, (board, selected) =>
        ChecklistState.match(selected.checklist, {
          Loading: () => ({ model }),
          Failed: () => ({ model }),
          Loaded: ({ items }) =>
            pipe(
              shownChecklist(items, selected.cardId, board.operations),
              Array.findFirst(
                entry => entry._tag === 'SavedItem' && entry.item.id === itemId,
              ),
              Option.flatMap(entry =>
                ChecklistEntry.match(entry, {
                  SavedItem: ({ item }) => Option.some(item.done),
                  AddingItem: () => Option.none(),
                }),
              ),
              Option.match({
                onNone: () => ({ model }),
                onSome: shownDone => {
                  const operationId = board.nextOperationId
                  const done = !shownDone
                  return {
                    model: putBoard(
                      model,
                      modifyFields(board, {
                        baselines: baselines =>
                          hasPendingToggle(board, itemId)
                            ? baselines
                            : setBaseline(baselines, itemId, shownDone),
                        operations: operations =>
                          Array.append(
                            operations,
                            BoardOperation.Toggle({
                              operationId,
                              cardId: selected.cardId,
                              itemId,
                              done,
                            }),
                          ),
                        nextOperationId: next => next + 1,
                        selection: () =>
                          Selection.Selected(
                            modifyFields(selected, {
                              maybeItemError: () => Option.none(),
                            }),
                          ),
                      }),
                    ),
                    commands: [
                      ToggleItem({
                        session: board.session,
                        operationId,
                        cardId: selected.cardId,
                        itemId,
                        done,
                      }),
                    ],
                  }
                },
              }),
            ),
        }),
      ),

    SucceededToggleItem: ({ session, operationId }) =>
      onBoardOperation(model, session, operationId, (board, operation) => ({
        model: putBoard(
          model,
          BoardOperation.match(operation, {
            Toggle: ({ cardId, itemId, done }) => {
              const before = Option.getOrElse(
                findBaseline(board.baselines, itemId),
                () => !done,
              )
              const delta = (done ? 1 : 0) - (before ? 1 : 0)
              return modifyFields(board, {
                baselines: baselines => setBaseline(baselines, itemId, done),
                columns: columns =>
                  modifyCard(columns, cardId, card => ({
                    id: card.id,
                    title: card.title,
                    done: card.done + delta,
                    total: card.total,
                  })),
                selection: selection =>
                  modifyLoadedChecklist(selection, cardId, items =>
                    Array.map(items, item =>
                      item.id === itemId
                        ? { id: item.id, text: item.text, done }
                        : item,
                    ),
                  ),
              })
            },
            Move: () => board,
            AddCard: () => board,
            Rename: () => board,
            Archive: () => board,
            AddItem: () => board,
          }),
        ),
      })),

    FailedToggleItem: ({ session, operationId, error }) =>
      onBoardOperation(model, session, operationId, (board, operation) => ({
        model: putBoard(
          model,
          modifyFields(board, {
            selection: selection =>
              setItemErrorFor(selection, operation, error),
          }),
        ),
      })),

    // ADDING AN ITEM

    UpdatedItemInput: ({ value }) =>
      onSelected(model, (board, selected) => ({
        model: putBoard(
          model,
          modifyFields(board, {
            selection: () =>
              Selection.Selected(modifyFields(selected, { itemInput: () => value })),
          }),
        ),
      })),

    SubmittedNewItem: () =>
      onSelected(model, (board, selected) => {
        const text = String.trim(selected.itemInput)
        if (String.isEmpty(text)) {
          return { model }
        }
        const operationId = board.nextOperationId
        return {
          model: putBoard(
            model,
            modifyFields(board, {
              operations: operations =>
                Array.append(
                  operations,
                  BoardOperation.AddItem({ operationId, cardId: selected.cardId, text }),
                ),
              nextOperationId: next => next + 1,
              selection: () =>
                Selection.Selected(
                  modifyFields(selected, {
                    itemInput: () => '',
                    maybeItemError: () => Option.none(),
                  }),
                ),
            }),
          ),
          commands: [
            AddItem({ session: board.session, operationId, cardId: selected.cardId, text }),
          ],
        }
      }),

    SucceededAddItem: ({ session, operationId, item }) =>
      onBoardOperation(model, session, operationId, (board, operation) => ({
        model: putBoard(
          model,
          BoardOperation.match(operation, {
            AddItem: ({ cardId }) =>
              modifyFields(board, {
                columns: columns =>
                  modifyCard(columns, cardId, card => ({
                    id: card.id,
                    title: card.title,
                    done: card.done + (item.done ? 1 : 0),
                    total: card.total + 1,
                  })),
                selection: selection =>
                  modifyLoadedChecklist(selection, cardId, items =>
                    Array.some(items, existing => existing.id === item.id)
                      ? items
                      : Array.append(items, item),
                  ),
              }),
            Move: () => board,
            AddCard: () => board,
            Rename: () => board,
            Archive: () => board,
            Toggle: () => board,
          }),
        ),
      })),

    FailedAddItem: ({ session, operationId, error }) =>
      onBoardOperation(model, session, operationId, (board, operation) => ({
        model: putBoard(
          model,
          modifyFields(board, {
            selection: selection =>
              setItemErrorFor(selection, operation, error),
          }),
        ),
      })),

    // ARCHIVE PAGE

    ClickedRetryArchive: () =>
      onArchive(model, archive =>
        ArchiveList.match(archive.list, {
          Loading: () => ({ model }),
          Loaded: () => ({ model }),
          Failed: () => ({
            model: putArchive(
              model,
              modifyFields(archive, { list: () => ArchiveList.Loading() }),
            ),
            commands: [FetchArchived({ session: archive.session })],
          }),
        }),
      ),

    SucceededFetchArchived: ({ session, cards }) =>
      onArchiveSession(model, session, archive =>
        ArchiveList.match(archive.list, {
          Loaded: () => ({ model }),
          Failed: () => ({ model }),
          Loading: () => ({
            model: putArchive(
              model,
              modifyFields(archive, { list: () => ArchiveList.Loaded({ cards }) }),
            ),
          }),
        }),
      ),

    FailedFetchArchived: ({ session, error }) =>
      onArchiveSession(model, session, archive =>
        ArchiveList.match(archive.list, {
          Loaded: () => ({ model }),
          Failed: () => ({ model }),
          Loading: () => ({
            model: putArchive(
              model,
              modifyFields(archive, { list: () => ArchiveList.Failed({ error }) }),
            ),
          }),
        }),
      ),

    ClickedRestore: ({ cardId }) =>
      onArchive(model, archive => {
        const isShown = ArchiveList.match(archive.list, {
          Loading: () => false,
          Failed: () => false,
          Loaded: ({ cards }) =>
            Array.some(cards, card => card.id === cardId) &&
            !Array.some(archive.pendingRestores, pending => pending.cardId === cardId),
        })
        if (!isShown) {
          return { model }
        }
        const operationId = archive.nextOperationId
        return {
          model: putArchive(
            model,
            modifyFields(archive, {
              pendingRestores: pending => Array.append(pending, { operationId, cardId }),
              nextOperationId: next => next + 1,
              maybeRestoreError: () => Option.none(),
            }),
          ),
          commands: [RestoreCard({ session: archive.session, operationId, cardId })],
        }
      }),

    SucceededRestoreCard: ({ session, operationId }) =>
      onArchiveSession(model, session, archive =>
        pipe(
          Array.findFirst(
            archive.pendingRestores,
            pending => pending.operationId === operationId,
          ),
          Option.match({
            onNone: () => ({ model }),
            onSome: ({ cardId }) => ({
              model: putArchive(
                model,
                modifyFields(archive, {
                  pendingRestores: pending =>
                    Array.filter(pending, other => other.operationId !== operationId),
                  list: list =>
                    ArchiveList.match(list, {
                      Loading: () => list,
                      Failed: () => list,
                      Loaded: ({ cards }) =>
                        ArchiveList.Loaded({
                          cards: Array.filter(cards, card => card.id !== cardId),
                        }),
                    }),
                }),
              ),
            }),
          }),
        ),
      ),

    FailedRestoreCard: ({ session, operationId, error }) =>
      onArchiveSession(model, session, archive =>
        Array.some(archive.pendingRestores, pending => pending.operationId === operationId)
          ? {
              model: putArchive(
                model,
                modifyFields(archive, {
                  pendingRestores: pending =>
                    Array.filter(pending, other => other.operationId !== operationId),
                  maybeRestoreError: () => Option.some(error),
                }),
              ),
            }
          : { model },
      ),
  })

