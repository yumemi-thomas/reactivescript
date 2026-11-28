import { Array, Match, Option, String, pipe } from 'effect'
import { type Runtime, type Update } from 'foldkit'
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
  COLUMNS,
  type Column,
  ColumnState,
  type Direction,
  type Item,
  type Lanes,
  PendingOp,
  type SelectedChecklist,
  type ShownBoard,
  type ShownPlace,
  WIP_LIMIT,
  baseAppendCard,
  baseCard,
  baseModifyCard,
  baseMoveCard,
  baseRemoveCard,
  columnState,
  columnToLeft,
  columnToRight,
  findShown,
  laneSize,
  showBoard,
  withColumnState,
} from './domain'
import { moveTarget, selectedChecklist, shownBoard } from './board'
import { Message } from './message'
import {
  type Archive,
  ArchiveList,
  type Board,
  ChecklistState,
  Model,
  Page,
  Selection,
  noError,
} from './model'

export { Message } from './message'
export { Model } from './model'
export { view } from './view'

type UpdateReturn = Update.Return<Model, Message>

// INIT

const openBoard = (nextId: number): UpdateReturn => {
  const requestIdFor = (column: Column): number =>
    nextId + Array.findFirstIndex(COLUMNS, c => c === column).pipe(
      Option.getOrElse(() => 0),
    )
  const board: Board = {
    columns: {
      todo: ColumnState.ColumnLoading({ requestId: requestIdFor('todo') }),
      doing: ColumnState.ColumnLoading({ requestId: requestIdFor('doing') }),
      done: ColumnState.ColumnLoading({ requestId: requestIdFor('done') }),
    },
    pending: [],
    newCardInput: '',
    maybeMoveError: noError,
    maybeAddError: noError,
    maybeArchiveError: noError,
    selection: Selection.NoCardSelected(),
  }
  return {
    model: {
      nextId: nextId + COLUMNS.length,
      page: Page.BoardPage({ board }),
    },
    commands: Array.map(COLUMNS, column =>
      FetchCards({ requestId: requestIdFor(column), column }),
    ),
  }
}

const openArchive = (nextId: number): UpdateReturn => {
  const archive: Archive = {
    list: ArchiveList.ArchiveLoading({ requestId: nextId }),
    pendingRestores: [],
    maybeRestoreError: noError,
  }
  return {
    model: { nextId: nextId + 1, page: Page.ArchivePage({ archive }) },
    commands: [FetchArchived({ requestId: nextId })],
  }
}

export const init: Runtime.ApplicationInit<Model, Message> = () => openBoard(0)

// UPDATE HELPERS

const withBoard = (
  model: Model,
  f: (board: Board) => UpdateReturn,
): UpdateReturn =>
  Page.match<UpdateReturn>(model.page, {
    BoardPage: ({ board }) => f(board),
    ArchivePage: () => ({ model }),
  })

const withArchive = (
  model: Model,
  f: (archive: Archive) => UpdateReturn,
): UpdateReturn =>
  Page.match<UpdateReturn>(model.page, {
    BoardPage: () => ({ model }),
    ArchivePage: ({ archive }) => f(archive),
  })

const boardModel = (model: Model, board: Board, idsUsed = 0): Model =>
  modifyFields(model, {
    nextId: nextId => nextId + idsUsed,
    page: () => Page.BoardPage({ board }),
  })

const archiveModel = (model: Model, archive: Archive, idsUsed = 0): Model =>
  modifyFields(model, {
    nextId: nextId => nextId + idsUsed,
    page: () => Page.ArchivePage({ archive }),
  })

type PendingOfTag<Tag extends PendingOp['_tag']> = Extract<
  PendingOp,
  { readonly _tag: Tag }
>

const findPending = <Tag extends PendingOp['_tag']>(
  board: Board,
  tag: Tag,
  opId: number,
): Option.Option<PendingOfTag<Tag>> =>
  Array.findFirst(
    board.pending,
    (op): op is PendingOfTag<Tag> => op._tag === tag && op.opId === opId,
  )

const withoutPending = (board: Board, opId: number): Board =>
  modifyFields(board, {
    pending: pending => Array.filter(pending, op => op.opId !== opId),
  })

const settle = <Tag extends PendingOp['_tag']>(
  model: Model,
  tag: Tag,
  opId: number,
  f: (board: Board, op: PendingOfTag<Tag>) => Board,
): UpdateReturn =>
  withBoard(model, board =>
    Option.match(findPending(board, tag, opId), {
      onNone: () => ({ model }),
      onSome: op => ({
        model: boardModel(model, f(withoutPending(board, opId), op)),
      }),
    }),
  )

type CardSelected = Extract<Selection, { readonly _tag: 'CardSelected' }>

const modifySelected = (
  board: Board,
  f: (selected: CardSelected) => Selection,
): Board =>
  modifyFields(board, {
    selection: selection =>
      Selection.match<Selection>(selection, {
        NoCardSelected: () => selection,
        CardSelected: selected => f(selected),
      }),
  })

const modifySelectedCard = (
  board: Board,
  cardId: number,
  f: (selected: CardSelected) => Selection,
): Board =>
  modifySelected(board, selected =>
    selected.cardId === cardId ? f(selected) : selected,
  )

const withSelected = (
  model: Model,
  f: (board: Board, selected: CardSelected) => UpdateReturn,
): UpdateReturn =>
  withBoard(model, board =>
    Selection.match<UpdateReturn>(board.selection, {
      NoCardSelected: () => ({ model }),
      CardSelected: selected => f(board, selected),
    }),
  )

const modifyLoadedItems = (
  selected: CardSelected,
  f: (items: ReadonlyArray<Item>) => ReadonlyArray<Item>,
): CardSelected =>
  modifyFields(selected, {
    checklist: checklist =>
      ChecklistState.match<ChecklistState>(checklist, {
        ChecklistLoading: () => checklist,
        ChecklistFailed: () => checklist,
        ChecklistLoaded: ({ items }) =>
          ChecklistState.ChecklistLoaded({ items: f(items) }),
      }),
  })

const baseItemDone = (
  board: Board,
  cardId: number,
  itemId: number,
): Option.Option<boolean> =>
  pipe(
    selectedChecklist(board.selection),
    Option.filter(checklist => checklist.cardId === cardId),
    Option.flatMap(({ items }) =>
      Array.findFirst(items, item => item.id === itemId),
    ),
    Option.map(item => item.done),
  )

const isMatchingRequest = (
  state: { readonly _tag: string; readonly requestId?: number },
  requestId: number,
): boolean => 'requestId' in state && state.requestId === requestId

const nonEmptyTrimmed = (value: string): Option.Option<string> =>
  pipe(value, String.trim, Option.liftPredicate(String.isNonEmpty))

// UPDATE

export const update = (model: Model, message: Message) =>
  Message.match<UpdateReturn>(message, {
    ClickedBoardTab: () =>
      Page.match<UpdateReturn>(model.page, {
        BoardPage: () => ({ model }),
        ArchivePage: () => openBoard(model.nextId),
      }),

    ClickedArchiveTab: () =>
      Page.match<UpdateReturn>(model.page, {
        BoardPage: () => openArchive(model.nextId),
        ArchivePage: () => ({ model }),
      }),

    SucceededFetchCards: ({ requestId, column, cards }) =>
      withBoard(model, board =>
        isMatchingRequest(columnState(board.columns, column), requestId)
          ? {
              model: boardModel(
                model,
                modifyFields(board, {
                  columns: columns =>
                    withColumnState(
                      columns,
                      column,
                      ColumnState.ColumnLoaded({ cards }),
                    ),
                }),
              ),
            }
          : { model },
      ),

    FailedFetchCards: ({ requestId, column, error }) =>
      withBoard(model, board =>
        isMatchingRequest(columnState(board.columns, column), requestId)
          ? {
              model: boardModel(
                model,
                modifyFields(board, {
                  columns: columns =>
                    withColumnState(
                      columns,
                      column,
                      ColumnState.ColumnFailed({ error }),
                    ),
                }),
              ),
            }
          : { model },
      ),

    ClickedRetryColumn: ({ column }) =>
      withBoard(model, board =>
        ColumnState.match<UpdateReturn>(
          columnState(board.columns, column),
          {
            ColumnLoading: () => ({ model }),
            ColumnLoaded: () => ({ model }),
            ColumnFailed: () => {
              const requestId = model.nextId
              return {
                model: boardModel(
                  model,
                  modifyFields(board, {
                    columns: columns =>
                      withColumnState(
                        columns,
                        column,
                        ColumnState.ColumnLoading({ requestId }),
                      ),
                  }),
                  1,
                ),
                commands: [FetchCards({ requestId, column })],
              }
            },
          },
        ),
      ),

    ClickedMoveCard: ({ cardId, direction }) =>
      withBoard(model, board => {
        const { lanes } = shownBoard(board)
        return pipe(
          findShown(lanes, cardId),
          Option.flatMap(place => moveTarget(lanes, place, direction)),
          Option.match({
            onNone: () => ({ model }),
            onSome: ({ column, index }) => {
              const opId = model.nextId
              return {
                model: boardModel(
                  model,
                  modifyFields(board, {
                    pending: Array.append(
                      PendingOp.MovingCard({ opId, cardId, column, index }),
                    ),
                    maybeMoveError: () => noError,
                  }),
                  1,
                ),
                commands: [MoveCard({ opId, cardId, column, index })],
              }
            },
          }),
        )
      }),

    SucceededMoveCard: ({ opId }) =>
      settle(model, 'MovingCard', opId, (board, op) =>
        modifyFields(board, {
          columns: columns =>
            baseMoveCard(columns, op.cardId, op.column, op.index),
        }),
      ),

    FailedMoveCard: ({ opId, error }) =>
      settle(model, 'MovingCard', opId, board =>
        modifyFields(board, { maybeMoveError: () => Option.some(error) }),
      ),

    UpdatedNewCardInput: ({ value }) =>
      withBoard(model, board => ({
        model: boardModel(
          model,
          modifyFields(board, { newCardInput: () => value }),
        ),
      })),

    SubmittedNewCard: () =>
      withBoard(model, board =>
        pipe(
          nonEmptyTrimmed(board.newCardInput),
          Option.filter(() =>
            Option.isSome(shownBoard(board).lanes.todo),
          ),
          Option.match({
            onNone: () => ({ model }),
            onSome: title => {
              const opId = model.nextId
              return {
                model: boardModel(
                  model,
                  modifyFields(board, {
                    pending: Array.append(
                      PendingOp.AddingCard({ opId, title }),
                    ),
                    newCardInput: () => '',
                    maybeAddError: () => noError,
                  }),
                  1,
                ),
                commands: [AddCard({ opId, column: 'todo', title })],
              }
            },
          }),
        ),
      ),

    SucceededAddCard: ({ opId, id, title }) =>
      settle(model, 'AddingCard', opId, board =>
        Option.isSome(baseCard(board.columns, id))
          ? board
          : modifyFields(board, {
              columns: columns =>
                baseAppendCard(columns, 'todo', { id, title, done: 0, total: 0 }),
            }),
      ),

    FailedAddCard: ({ opId, error }) =>
      settle(model, 'AddingCard', opId, board =>
        modifyFields(board, { maybeAddError: () => Option.some(error) }),
      ),

    ClickedCard: ({ cardId }) =>
      withBoard(model, board => {
        const isAlreadySelected = Selection.match(board.selection, {
          NoCardSelected: () => false,
          CardSelected: selected => selected.cardId === cardId,
        })
        if (
          isAlreadySelected ||
          Option.isNone(findShown(shownBoard(board).lanes, cardId))
        ) {
          return { model }
        }
        const requestId = model.nextId
        return {
          model: boardModel(
            model,
            modifyFields(board, {
              selection: () =>
                Selection.CardSelected({
                  cardId,
                  titleInput: '',
                  itemInput: '',
                  checklist: ChecklistState.ChecklistLoading({ requestId }),
                  maybeRenameError: noError,
                  maybeItemError: noError,
                }),
            }),
            1,
          ),
          commands: [FetchChecklist({ requestId, cardId })],
        }
      }),

    UpdatedTitleInput: ({ value }) =>
      withSelected(model, board => ({
        model: boardModel(
          model,
          modifySelected(board, selected =>
            modifyFields(selected, { titleInput: () => value }),
          ),
        ),
      })),

    SubmittedRename: () =>
      withSelected(model, (board, selected) =>
        Option.match(nonEmptyTrimmed(selected.titleInput), {
          onNone: () => ({ model }),
          onSome: title => {
            const opId = model.nextId
            const { cardId } = selected
            return {
              model: boardModel(
                model,
                modifySelected(
                  modifyFields(board, {
                    pending: Array.append(
                      PendingOp.RenamingCard({ opId, cardId, title }),
                    ),
                  }),
                  current =>
                    modifyFields(current, { maybeRenameError: () => noError }),
                ),
                1,
              ),
              commands: [RenameCard({ opId, cardId, title })],
            }
          },
        }),
      ),

    SucceededRenameCard: ({ opId, title }) =>
      settle(model, 'RenamingCard', opId, (board, op) =>
        modifyFields(board, {
          columns: columns =>
            baseModifyCard(columns, op.cardId, card =>
              modifyFields(card, { title: () => title }),
            ),
        }),
      ),

    FailedRenameCard: ({ opId, error }) =>
      settle(model, 'RenamingCard', opId, (board, op) =>
        modifySelectedCard(board, op.cardId, selected =>
          modifyFields(selected, { maybeRenameError: () => Option.some(error) }),
        ),
      ),

    ClickedArchive: () =>
      withSelected(model, (board, { cardId }) => {
        const opId = model.nextId
        return {
          model: boardModel(
            model,
            modifyFields(board, {
              pending: Array.append(PendingOp.ArchivingCard({ opId, cardId })),
              selection: () => Selection.NoCardSelected(),
              maybeArchiveError: () => noError,
            }),
            1,
          ),
          commands: [ArchiveCard({ opId, cardId })],
        }
      }),

    SucceededArchiveCard: ({ opId }) =>
      settle(model, 'ArchivingCard', opId, (board, op) =>
        modifyFields(board, {
          columns: columns => baseRemoveCard(columns, op.cardId),
        }),
      ),

    FailedArchiveCard: ({ opId, error }) =>
      settle(model, 'ArchivingCard', opId, board =>
        modifyFields(board, { maybeArchiveError: () => Option.some(error) }),
      ),

    SucceededFetchChecklist: ({ requestId, items }) =>
      withSelected(model, (board, selected) =>
        isMatchingRequest(selected.checklist, requestId)
          ? {
              model: boardModel(
                model,
                modifySelected(board, current =>
                  modifyFields(current, {
                    checklist: () => ChecklistState.ChecklistLoaded({ items }),
                  }),
                ),
              ),
            }
          : { model },
      ),

    FailedFetchChecklist: ({ requestId, error }) =>
      withSelected(model, (board, selected) =>
        isMatchingRequest(selected.checklist, requestId)
          ? {
              model: boardModel(
                model,
                modifySelected(board, current =>
                  modifyFields(current, {
                    checklist: () => ChecklistState.ChecklistFailed({ error }),
                  }),
                ),
              ),
            }
          : { model },
      ),

    ClickedRetryChecklist: () =>
      withSelected(model, (board, selected) => {
        if (selected.checklist._tag !== 'ChecklistFailed') {
          return { model }
        }
        const requestId = model.nextId
        return {
          model: boardModel(
            model,
            modifySelected(board, current =>
              modifyFields(current, {
                checklist: () => ChecklistState.ChecklistLoading({ requestId }),
              }),
            ),
            1,
          ),
          commands: [FetchChecklist({ requestId, cardId: selected.cardId })],
        }
      }),

    ClickedToggleItem: ({ itemId }) =>
      withSelected(model, (board, selected) =>
        pipe(
          shownBoard(board).maybeItems,
          Option.flatMap(items =>
            Array.findFirst(items, item =>
              Option.exists(item.maybeId, id => id === itemId),
            ),
          ),
          Option.match({
            onNone: () => ({ model }),
            onSome: item => {
              const opId = model.nextId
              const { cardId } = selected
              const done = !item.done
              return {
                model: boardModel(
                  model,
                  modifySelected(
                    modifyFields(board, {
                      pending: Array.append(
                        PendingOp.TogglingItem({
                          opId,
                          cardId,
                          itemId,
                          done,
                          wasDone: item.done,
                        }),
                      ),
                    }),
                    current =>
                      modifyFields(current, { maybeItemError: () => noError }),
                  ),
                  1,
                ),
                commands: [ToggleItem({ opId, cardId, itemId, done })],
              }
            },
          }),
        ),
      ),

    SucceededToggleItem: ({ opId }) =>
      settle(model, 'TogglingItem', opId, (board, op) => {
        const previous = Option.getOrElse(
          baseItemDone(board, op.cardId, op.itemId),
          () => op.wasDone,
        )
        const delta = (op.done ? 1 : 0) - (previous ? 1 : 0)
        return modifySelectedCard(
          modifyFields(board, {
            columns: columns =>
              baseModifyCard(columns, op.cardId, card =>
                modifyFields(card, { done: count => count + delta }),
              ),
          }),
          op.cardId,
          selected =>
            modifyLoadedItems(selected, items =>
              Array.map(items, item =>
                item.id === op.itemId
                  ? modifyFields(item, { done: () => op.done })
                  : item,
              ),
            ),
        )
      }),

    FailedToggleItem: ({ opId, error }) =>
      settle(model, 'TogglingItem', opId, (board, op) =>
        modifySelectedCard(board, op.cardId, selected =>
          modifyFields(selected, { maybeItemError: () => Option.some(error) }),
        ),
      ),

    UpdatedItemInput: ({ value }) =>
      withSelected(model, board => ({
        model: boardModel(
          model,
          modifySelected(board, selected =>
            modifyFields(selected, { itemInput: () => value }),
          ),
        ),
      })),

    SubmittedNewItem: () =>
      withSelected(model, (board, selected) =>
        pipe(
          nonEmptyTrimmed(selected.itemInput),
          Option.filter(() => selected.checklist._tag === 'ChecklistLoaded'),
          Option.match({
            onNone: () => ({ model }),
            onSome: text => {
              const opId = model.nextId
              const { cardId } = selected
              return {
                model: boardModel(
                  model,
                  modifySelected(
                    modifyFields(board, {
                      pending: Array.append(
                        PendingOp.AddingItem({ opId, cardId, text }),
                      ),
                    }),
                    current =>
                      modifyFields(current, {
                        itemInput: () => '',
                        maybeItemError: () => noError,
                      }),
                  ),
                  1,
                ),
                commands: [AddItem({ opId, cardId, text })],
              }
            },
          }),
        ),
      ),

    SucceededAddItem: ({ opId, item }) =>
      settle(model, 'AddingItem', opId, (board, op) =>
        modifySelectedCard(
          modifyFields(board, {
            columns: columns =>
              baseModifyCard(columns, op.cardId, card =>
                modifyFields(card, {
                  total: count => count + 1,
                  done: count => count + (item.done ? 1 : 0),
                }),
              ),
          }),
          op.cardId,
          selected =>
            modifyLoadedItems(selected, items =>
              Array.some(items, existing => existing.id === item.id)
                ? items
                : Array.append(items, item),
            ),
        ),
      ),

    FailedAddItem: ({ opId, error }) =>
      settle(model, 'AddingItem', opId, (board, op) =>
        modifySelectedCard(board, op.cardId, selected =>
          modifyFields(selected, { maybeItemError: () => Option.some(error) }),
        ),
      ),

    SucceededFetchArchived: ({ requestId, cards }) =>
      withArchive(model, archive =>
        isMatchingRequest(archive.list, requestId)
          ? {
              model: archiveModel(
                model,
                modifyFields(archive, {
                  list: () => ArchiveList.ArchiveLoaded({ cards }),
                }),
              ),
            }
          : { model },
      ),

    FailedFetchArchived: ({ requestId, error }) =>
      withArchive(model, archive =>
        isMatchingRequest(archive.list, requestId)
          ? {
              model: archiveModel(
                model,
                modifyFields(archive, {
                  list: () => ArchiveList.ArchiveFailed({ error }),
                }),
              ),
            }
          : { model },
      ),

    ClickedRetryArchive: () =>
      withArchive(model, archive => {
        if (archive.list._tag !== 'ArchiveFailed') {
          return { model }
        }
        const requestId = model.nextId
        return {
          model: archiveModel(
            model,
            modifyFields(archive, {
              list: () => ArchiveList.ArchiveLoading({ requestId }),
            }),
            1,
          ),
          commands: [FetchArchived({ requestId })],
        }
      }),

    ClickedRestore: ({ cardId }) =>
      withArchive(model, archive => {
        const isListed = ArchiveList.match(archive.list, {
          ArchiveLoading: () => false,
          ArchiveFailed: () => false,
          ArchiveLoaded: ({ cards }) =>
            Array.some(cards, card => card.id === cardId),
        })
        const isRestoring = Array.some(
          archive.pendingRestores,
          restore => restore.cardId === cardId,
        )
        if (!isListed || isRestoring) {
          return { model }
        }
        const opId = model.nextId
        return {
          model: archiveModel(
            model,
            modifyFields(archive, {
              pendingRestores: Array.append({ opId, cardId }),
              maybeRestoreError: () => noError,
            }),
            1,
          ),
          commands: [RestoreCard({ opId, cardId })],
        }
      }),

    SucceededRestoreCard: ({ opId }) =>
      withArchive(model, archive =>
        Option.match(
          Array.findFirst(archive.pendingRestores, r => r.opId === opId),
          {
            onNone: () => ({ model }),
            onSome: restore => ({
              model: archiveModel(
                model,
                modifyFields(archive, {
                  pendingRestores: pending =>
                    Array.filter(pending, r => r.opId !== opId),
                  list: list =>
                    ArchiveList.match<ArchiveList>(list, {
                      ArchiveLoading: () => list,
                      ArchiveFailed: () => list,
                      ArchiveLoaded: ({ cards }) =>
                        ArchiveList.ArchiveLoaded({
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

    FailedRestoreCard: ({ opId, error }) =>
      withArchive(model, archive =>
        Array.some(archive.pendingRestores, r => r.opId === opId)
          ? {
              model: archiveModel(
                model,
                modifyFields(archive, {
                  pendingRestores: pending =>
                    Array.filter(pending, r => r.opId !== opId),
                  maybeRestoreError: () => Option.some(error),
                }),
              ),
            }
          : { model },
      ),
  })

