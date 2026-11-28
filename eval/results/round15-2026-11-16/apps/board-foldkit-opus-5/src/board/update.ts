import { Array, Match, Option, Schema, String, pipe } from 'effect'
import type { Update } from 'foldkit'
import { defineTaggedUnion } from 'foldkit/schema'
import { modifyFields } from 'foldkit/struct'

import {
  AddCard,
  AddItem,
  ArchiveCard,
  FetchCards,
  FetchChecklist,
  MoveCard,
  RenameCard,
  ToggleItem,
} from './command'
import { type Direction, Message } from './message'
import {
  BoardOp,
  COLUMN_IDS,
  CONFIRMED,
  type CardLocation,
  ChecklistLoad,
  ColumnId,
  ColumnLoad,
  Detail,
  Entry,
  type Item,
  ItemOp,
  type Model,
  PENDING,
  type Selection,
  type ShownBoard,
  confirmBoardOp,
  confirmItemOp,
  confirmStatus,
  dropBoardOp,
  dropItemOp,
  findShownItem,
  hasItemOp,
  isDoingFull,
  locateCard,
  shownBoard,
  shownItems,
} from './model'

type UpdateReturn = Update.Return<Model, Message>

// MOVE RULES

export const MoveAvailability = defineTaggedUnion({
  NoMove: {},
  BlockedMove: {},
  AllowedMove: { column: ColumnId, index: Schema.Number },
})
export type MoveAvailability = typeof MoveAvailability.Type

const isSavedEntryAt = (
  entries: ReadonlyArray<Entry>,
  index: number,
): boolean =>
  Option.match(Array.get(entries, index), {
    onNone: () => false,
    onSome: entry => entry._tag === 'SavedEntry',
  })

const sideways = (
  board: ShownBoard,
  location: CardLocation,
  offset: number,
): MoveAvailability => {
  const columnIndex = Array.findFirstIndex(
    COLUMN_IDS,
    columnId => columnId === location.column,
  )
  return pipe(
    columnIndex,
    Option.flatMap(index => Array.get(COLUMN_IDS, index + offset)),
    Option.match({
      onNone: () => MoveAvailability.NoMove(),
      onSome: target =>
        Option.match(board[target], {
          onNone: () => MoveAvailability.BlockedMove(),
          onSome: entries =>
            target === 'doing' && isDoingFull(board)
              ? MoveAvailability.BlockedMove()
              : MoveAvailability.AllowedMove({
                  column: target,
                  index: entries.length,
                }),
        }),
    }),
  )
}

const vertical = (
  board: ShownBoard,
  location: CardLocation,
  offset: number,
): MoveAvailability => {
  const target = location.index + offset
  return Option.match(board[location.column], {
    onNone: () => MoveAvailability.NoMove(),
    onSome: entries =>
      isSavedEntryAt(entries, target)
        ? MoveAvailability.AllowedMove({ column: location.column, index: target })
        : MoveAvailability.NoMove(),
  })
}

export const moveAvailability = (
  board: ShownBoard,
  location: CardLocation,
  direction: Direction,
): MoveAvailability =>
  Match.value(direction).pipe(
    Match.when('left', () => sideways(board, location, -1)),
    Match.when('right', () => sideways(board, location, 1)),
    Match.when('up', () => vertical(board, location, -1)),
    Match.when('down', () => vertical(board, location, 1)),
    Match.exhaustive,
  )

// INIT

export const init = (): UpdateReturn => ({
  model: {
    nextId: 0,
    columns: {
      todo: ColumnLoad.ColumnLoading(),
      doing: ColumnLoad.ColumnLoading(),
      done: ColumnLoad.ColumnLoading(),
    },
    ops: [],
    newCardInput: '',
    maybeMoveError: Option.none(),
    maybeAddError: Option.none(),
    maybeArchiveError: Option.none(),
    detail: Detail.NoSelection(),
  },
  commands: Array.map(COLUMN_IDS, column => FetchCards({ column })),
})

// HELPERS

const setColumn = (model: Model, column: ColumnId, load: ColumnLoad): Model =>
  modifyFields(model, {
    columns: columns => ({
      todo: column === 'todo' ? load : columns.todo,
      doing: column === 'doing' ? load : columns.doing,
      done: column === 'done' ? load : columns.done,
    }),
  })

const isColumnLoading = (model: Model, column: ColumnId): boolean =>
  model.columns[column]._tag === 'ColumnLoading'

const takeId = (model: Model): readonly [number, Model] => [
  model.nextId,
  modifyFields(model, { nextId: nextId => nextId + 1 }),
]

const maybeSelection = (model: Model): Option.Option<Selection> =>
  Detail.match(model.detail, {
    NoSelection: () => Option.none<Selection>(),
    Selected: ({ selection }) => Option.some(selection),
  })

const modifySelection = (
  model: Model,
  f: (selection: Selection) => Selection,
): Model =>
  modifyFields(model, {
    detail: detail =>
      Detail.match<Detail>(detail, {
        NoSelection: () => detail,
        Selected: ({ selection }) => Detail.Selected({ selection: f(selection) }),
      }),
  })

const settleItemOp = (
  model: Model,
  opId: number,
  settle: (selection: Selection) => Selection,
): Model =>
  modifySelection(model, selection =>
    hasItemOp(selection, opId) ? settle(selection) : selection,
  )

const confirmStatusOfItem = (op: ItemOp): ItemOp =>
  ItemOp.match(op, {
    ToggleOp: toggle => modifyFields(toggle, { status: () => CONFIRMED }),
    AddItemOp: add => add,
  })

const loadedItems = (
  selection: Selection,
): Option.Option<ReadonlyArray<Item>> =>
  ChecklistLoad.match(selection.checklist, {
    ChecklistLoading: () => Option.none<ReadonlyArray<Item>>(),
    ChecklistFailed: () => Option.none<ReadonlyArray<Item>>(),
    ChecklistLoaded: ({ items }) => Option.some(items),
  })

// UPDATE

export const update = (model: Model, message: Message) =>
  Message.match<UpdateReturn>(message, {
    ClickedRetryColumn: ({ column }) =>
      model.columns[column]._tag === 'ColumnFailed'
        ? {
            model: setColumn(model, column, ColumnLoad.ColumnLoading()),
            commands: [FetchCards({ column })],
          }
        : { model },

    SucceededFetchCards: ({ column, cards }) =>
      isColumnLoading(model, column)
        ? { model: setColumn(model, column, ColumnLoad.ColumnLoaded({ cards })) }
        : { model },

    FailedFetchCards: ({ column, error }) =>
      isColumnLoading(model, column)
        ? { model: setColumn(model, column, ColumnLoad.ColumnFailed({ error })) }
        : { model },

    ClickedMove: ({ cardId, direction }) => {
      const board = shownBoard(model)
      return Option.match(locateCard(board, cardId), {
        onNone: () => ({ model }),
        onSome: location =>
          MoveAvailability.match<UpdateReturn>(
            moveAvailability(board, location, direction),
            {
              NoMove: () => ({ model }),
              BlockedMove: () => ({ model }),
              AllowedMove: ({ column, index }) => {
                const [opId, nextModel] = takeId(model)
                return {
                  model: modifyFields(nextModel, {
                    ops: ops =>
                      Array.append(
                        ops,
                        BoardOp.MoveOp({
                          opId,
                          cardId,
                          column,
                          index,
                          status: PENDING,
                        }),
                      ),
                    maybeMoveError: () => Option.none(),
                  }),
                  commands: [MoveCard({ opId, cardId, column, index })],
                }
              },
            },
          ),
      })
    },

    SucceededMoveCard: ({ opId }) => ({
      model: confirmBoardOp(model, opId, confirmStatus),
    }),

    FailedMoveCard: ({ opId, error }) => ({
      model: modifyFields(dropBoardOp(model, opId), {
        maybeMoveError: () => Option.some(error),
      }),
    }),

    UpdatedNewCardInput: ({ value }) => ({
      model: modifyFields(model, { newCardInput: () => value }),
    }),

    ClickedAddCard: () => {
      const title = String.trim(model.newCardInput)
      if (String.isEmpty(title) || Option.isNone(shownBoard(model).todo)) {
        return { model }
      }
      const [opId, nextModel] = takeId(model)
      return {
        model: modifyFields(nextModel, {
          ops: ops =>
            Array.append(
              ops,
              BoardOp.AddOp({
                opId,
                column: 'todo',
                title,
                maybeCard: Option.none(),
              }),
            ),
          newCardInput: () => '',
          maybeAddError: () => Option.none(),
        }),
        commands: [AddCard({ opId, column: 'todo', title })],
      }
    },

    SucceededAddCard: ({ opId, id, title }) => ({
      model: confirmBoardOp(model, opId, op =>
        BoardOp.match<BoardOp>(op, {
          MoveOp: () => op,
          RenameOp: () => op,
          ArchiveOp: () => op,
          AddOp: add =>
            modifyFields(add, {
              maybeCard: () => Option.some({ id, title, done: 0, total: 0 }),
            }),
          CountOp: () => op,
        }),
      ),
    }),

    FailedAddCard: ({ opId, error }) => ({
      model: modifyFields(dropBoardOp(model, opId), {
        maybeAddError: () => Option.some(error),
      }),
    }),

    ClickedCard: ({ cardId }) => {
      const isAlreadySelected = Option.match(maybeSelection(model), {
        onNone: () => false,
        onSome: selection => selection.cardId === cardId,
      })
      if (isAlreadySelected || Option.isNone(locateCard(shownBoard(model), cardId))) {
        return { model }
      }
      const [selectionId, nextModel] = takeId(model)
      return {
        model: modifyFields(nextModel, {
          detail: () =>
            Detail.Selected({
              selection: {
                selectionId,
                cardId,
                titleInput: '',
                itemInput: '',
                maybeRenameError: Option.none(),
                maybeItemError: Option.none(),
                checklist: ChecklistLoad.ChecklistLoading(),
                itemOps: [],
              },
            }),
        }),
        commands: [FetchChecklist({ selectionId, cardId })],
      }
    },

    UpdatedTitleInput: ({ value }) => ({
      model: modifySelection(model, selection =>
        modifyFields(selection, { titleInput: () => value }),
      ),
    }),

    ClickedRename: () =>
      Option.match(maybeSelection(model), {
        onNone: () => ({ model }),
        onSome: selection => {
          const title = String.trim(selection.titleInput)
          if (String.isEmpty(title)) {
            return { model }
          }
          const [opId, nextModel] = takeId(model)
          return {
            model: modifySelection(
              modifyFields(nextModel, {
                ops: ops =>
                  Array.append(
                    ops,
                    BoardOp.RenameOp({
                      opId,
                      cardId: selection.cardId,
                      title,
                      status: PENDING,
                    }),
                  ),
              }),
              current =>
                modifyFields(current, { maybeRenameError: () => Option.none() }),
            ),
            commands: [
              RenameCard({
                opId,
                selectionId: selection.selectionId,
                cardId: selection.cardId,
                title,
              }),
            ],
          }
        },
      }),

    SucceededRenameCard: ({ opId, title }) => ({
      model: confirmBoardOp(model, opId, op =>
        BoardOp.match<BoardOp>(op, {
          MoveOp: () => op,
          RenameOp: rename =>
            modifyFields(rename, {
              title: () => title,
              status: () => CONFIRMED,
            }),
          ArchiveOp: () => op,
          AddOp: () => op,
          CountOp: () => op,
        }),
      ),
    }),

    FailedRenameCard: ({ opId, selectionId, error }) => ({
      model: modifySelection(dropBoardOp(model, opId), selection =>
        selection.selectionId === selectionId
          ? modifyFields(selection, {
              maybeRenameError: () => Option.some(error),
            })
          : selection,
      ),
    }),

    ClickedArchive: () =>
      Option.match(maybeSelection(model), {
        onNone: () => ({ model }),
        onSome: selection => {
          const [opId, nextModel] = takeId(model)
          return {
            model: modifyFields(nextModel, {
              ops: ops =>
                Array.append(
                  ops,
                  BoardOp.ArchiveOp({
                    opId,
                    cardId: selection.cardId,
                    status: PENDING,
                  }),
                ),
              detail: () => Detail.NoSelection(),
              maybeArchiveError: () => Option.none(),
            }),
            commands: [ArchiveCard({ opId, cardId: selection.cardId })],
          }
        },
      }),

    SucceededArchiveCard: ({ opId }) => ({
      model: confirmBoardOp(model, opId, confirmStatus),
    }),

    FailedArchiveCard: ({ opId, error }) => ({
      model: modifyFields(dropBoardOp(model, opId), {
        maybeArchiveError: () => Option.some(error),
      }),
    }),

    SucceededFetchChecklist: ({ selectionId, items }) => ({
      model: modifySelection(model, selection =>
        selection.selectionId === selectionId
          ? modifyFields(selection, {
              checklist: () => ChecklistLoad.ChecklistLoaded({ items }),
            })
          : selection,
      ),
    }),

    FailedFetchChecklist: ({ selectionId, error }) => ({
      model: modifySelection(model, selection =>
        selection.selectionId === selectionId
          ? modifyFields(selection, {
              checklist: () => ChecklistLoad.ChecklistFailed({ error }),
            })
          : selection,
      ),
    }),

    ClickedToggleItem: ({ itemId }) =>
      pipe(
        maybeSelection(model),
        Option.flatMap(selection =>
          pipe(
            loadedItems(selection),
            Option.flatMap(items =>
              findShownItem(shownItems(items, selection.itemOps), itemId),
            ),
            Option.map(item => ({ selection, item })),
          ),
        ),
        Option.match({
          onNone: () => ({ model }),
          onSome: ({ selection, item }) => {
            const done = !item.done
            const [opId, nextModel] = takeId(model)
            return {
              model: modifySelection(
                modifyFields(nextModel, {
                  ops: ops =>
                    Array.append(
                      ops,
                      BoardOp.CountOp({
                        opId,
                        cardId: selection.cardId,
                        doneDelta: done ? 1 : -1,
                        totalDelta: 0,
                        status: PENDING,
                      }),
                    ),
                }),
                current =>
                  modifyFields(current, {
                    itemOps: itemOps =>
                      Array.append(
                        itemOps,
                        ItemOp.ToggleOp({ opId, itemId, done, status: PENDING }),
                      ),
                    maybeItemError: () => Option.none(),
                  }),
              ),
              commands: [
                ToggleItem({ opId, cardId: selection.cardId, itemId, done }),
              ],
            }
          },
        }),
      ),

    SucceededToggleItem: ({ opId }) => ({
      model: settleItemOp(
        confirmBoardOp(model, opId, confirmStatus),
        opId,
        selection => confirmItemOp(selection, opId, confirmStatusOfItem),
      ),
    }),

    FailedToggleItem: ({ opId, error }) => ({
      model: settleItemOp(dropBoardOp(model, opId), opId, selection =>
        modifyFields(dropItemOp(selection, opId), {
          maybeItemError: () => Option.some(error),
        }),
      ),
    }),

    UpdatedItemInput: ({ value }) => ({
      model: modifySelection(model, selection =>
        modifyFields(selection, { itemInput: () => value }),
      ),
    }),

    ClickedAddItem: () =>
      pipe(
        maybeSelection(model),
        Option.filter(selection => Option.isSome(loadedItems(selection))),
        Option.match({
          onNone: () => ({ model }),
          onSome: selection => {
            const text = String.trim(selection.itemInput)
            if (String.isEmpty(text)) {
              return { model }
            }
            const [opId, nextModel] = takeId(model)
            return {
              model: modifySelection(
                modifyFields(nextModel, {
                  ops: ops =>
                    Array.append(
                      ops,
                      BoardOp.CountOp({
                        opId,
                        cardId: selection.cardId,
                        doneDelta: 0,
                        totalDelta: 1,
                        status: PENDING,
                      }),
                    ),
                }),
                current =>
                  modifyFields(current, {
                    itemOps: itemOps =>
                      Array.append(
                        itemOps,
                        ItemOp.AddItemOp({
                          opId,
                          text,
                          maybeItem: Option.none(),
                        }),
                      ),
                    itemInput: () => '',
                    maybeItemError: () => Option.none(),
                  }),
              ),
              commands: [AddItem({ opId, cardId: selection.cardId, text })],
            }
          },
        }),
      ),

    SucceededAddItem: ({ opId, item }) => ({
      model: settleItemOp(
        confirmBoardOp(model, opId, confirmStatus),
        opId,
        selection =>
          confirmItemOp(selection, opId, op =>
            ItemOp.match<ItemOp>(op, {
              ToggleOp: () => op,
              AddItemOp: add =>
                modifyFields(add, { maybeItem: () => Option.some(item) }),
            }),
          ),
      ),
    }),

    FailedAddItem: ({ opId, error }) => ({
      model: settleItemOp(dropBoardOp(model, opId), opId, selection =>
        modifyFields(dropItemOp(selection, opId), {
          maybeItemError: () => Option.some(error),
        }),
      ),
    }),
  })
