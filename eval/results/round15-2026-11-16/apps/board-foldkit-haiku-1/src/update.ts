import { Option } from 'effect'
import { AsyncData, Update } from 'foldkit'
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
  blocked,
  boardCommands,
  changeCards,
  freshBoard,
  insertedAt,
  loadedCards,
  locate,
  mapSaved,
  movedBoard,
  removedAt,
  setColumn,
  stepFor,
} from './board'
import { Message } from './message'
import {
  Archived,
  ArchivedState,
  ArchivePage,
  BoardCard,
  BoardPage,
  Card,
  CardsState,
  ChecklistItem,
  ChecklistState,
  ColumnName,
  Direction,
  Model,
  Page,
  Selection,
} from './model'

type BoardReturn = Update.Return<BoardPage, Message>
type ArchiveReturn = Update.Return<ArchivePage, Message>

const freshArchive = (): ArchivePage => ({
  archived: ArchivedState.Loading(),
  maybeRestoreError: Option.none(),
})

const onBoard = (model: Model): boolean =>
  Page.match(model.page, {
    Board: () => true,
    Archive: () => false,
  })

const onArchive = (model: Model): boolean =>
  Page.match(model.page, {
    Board: () => false,
    Archive: () => true,
  })

const withBoard = (
  model: Model,
  result: BoardReturn,
): Update.Return<Model, Message> => {
  const next = modifyFields(model, {
    page: () => Page.Board({ board: result.model }),
  })
  return result.commands === undefined
    ? { model: next }
    : { model: next, commands: result.commands }
}

const withArchive = (
  model: Model,
  result: ArchiveReturn,
): Update.Return<Model, Message> => {
  const next = modifyFields(model, {
    page: () => Page.Archive({ archive: result.model }),
  })
  return result.commands === undefined
    ? { model: next }
    : { model: next, commands: result.commands }
}

const inBoard = (
  model: Model,
  visit: number,
  change: (board: BoardPage) => BoardReturn,
): Update.Return<Model, Message> =>
  Page.match(model.page, {
    Board: ({ board }) =>
      visit === model.visit ? withBoard(model, change(board)) : { model },
    Archive: () => ({ model }),
  })

const inArchive = (
  model: Model,
  visit: number,
  change: (archive: ArchivePage) => ArchiveReturn,
): Update.Return<Model, Message> =>
  Page.match(model.page, {
    Board: () => ({ model }),
    Archive: ({ archive }) =>
      visit === model.visit ? withArchive(model, change(archive)) : { model },
  })

const openBoard = (model: Model): Update.Return<Model, Message> => {
  const visit = model.visit + 1
  return {
    model: modifyFields(model, {
      visit: () => visit,
      page: () => Page.Board({ board: freshBoard() }),
    }),
    commands: boardCommands(visit),
  }
}

const openArchive = (model: Model): Update.Return<Model, Message> => {
  const visit = model.visit + 1
  return {
    model: modifyFields(model, {
      visit: () => visit,
      page: () => Page.Archive({ archive: freshArchive() }),
    }),
    commands: [FetchArchived({ visit })],
  }
}

// BOARD UPDATE

const changeSelection = (
  board: BoardPage,
  change: (selection: Selection) => Selection,
): BoardPage =>
  modifyFields(board, {
    maybeSelection: maybe => Option.map(maybe, change),
  })

const updateSelected = (
  board: BoardPage,
  cardId: number,
  change: (selection: Selection) => Selection,
): BoardPage =>
  changeSelection(board, selection =>
    selection.cardId === cardId ? change(selection) : selection,
  )

const changeChecklist = (
  selection: Selection,
  change: (
    items: ReadonlyArray<typeof ChecklistItem.Type>,
  ) => ReadonlyArray<typeof ChecklistItem.Type>,
): Selection =>
  modifyFields(selection, {
    checklist: checklist =>
      AsyncData.isSuccess(checklist)
        ? ChecklistState.Success({ data: change(checklist.data) })
        : checklist,
  })

const withMoveError = (board: BoardPage, error: string): BoardPage =>
  modifyFields(board, { maybeMoveError: () => Option.some(error) })

const moveOnBoard = (
  board: BoardPage,
  visit: number,
  id: number,
  direction: Direction,
): BoardReturn =>
  Option.match(locate(board, id), {
    onNone: () => ({ model: board }),
    onSome: placed =>
      Option.match(stepFor(board, placed, direction), {
        onNone: () => ({ model: board }),
        onSome: step =>
          blocked(board, placed, step)
            ? { model: board }
            : {
                model: modifyFields(movedBoard(board, placed, step), {
                  maybeMoveError: () => Option.none(),
                }),
                commands: [
                  MoveCard({
                    visit,
                    id,
                    column: step.column,
                    index: step.index,
                    fromColumn: placed.column,
                    fromIndex: placed.index,
                  }),
                ],
              },
      }),
  })

const revertMove = (
  board: BoardPage,
  id: number,
  fromColumn: ColumnName,
  fromIndex: number,
  error: string,
): BoardPage =>
  Option.match(locate(board, id), {
    onNone: () => withMoveError(board, error),
    onSome: placed => {
      const removed = changeCards(board, placed.column, cards =>
        removedAt(cards, placed.index),
      )
      const restored = changeCards(removed, fromColumn, cards =>
        insertedAt(cards, fromIndex, BoardCard.Saved(placed.card)),
      )
      return withMoveError(restored, error)
    },
  })

const addCardOnBoard = (board: BoardPage, visit: number): BoardReturn => {
  const title = board.newCardTitle.trim()
  if (title === '' || Option.isNone(loadedCards(board, 'todo'))) {
    return { model: board }
  }
  const key = board.nextKey
  const appended = changeCards(board, 'todo', cards => [
    ...cards,
    BoardCard.Adding({ key, title }),
  ])
  return {
    model: modifyFields(appended, {
      newCardTitle: () => '',
      nextKey: () => key + 1,
      maybeAddError: () => Option.none(),
    }),
    commands: [AddCard({ visit, key, title })],
  }
}

const selectOnBoard = (
  board: BoardPage,
  visit: number,
  id: number,
): BoardReturn =>
  Option.match(board.maybeSelection, {
    onNone: () => selectCard(board, visit, id),
    onSome: selection =>
      selection.cardId === id
        ? { model: board }
        : selectCard(board, visit, id),
  })

const selectCard = (board: BoardPage, visit: number, id: number): BoardReturn => ({
  model: modifyFields(board, {
    maybeSelection: () =>
      Option.some({
        cardId: id,
        titleInput: '',
        itemInput: '',
        checklist: ChecklistState.Loading(),
        maybeRenameError: Option.none(),
        maybeItemError: Option.none(),
      }),
  }),
  commands: [FetchChecklist({ visit, cardId: id })],
})

const renameOnBoard = (board: BoardPage, visit: number): BoardReturn =>
  Option.match(board.maybeSelection, {
    onNone: () => ({ model: board }),
    onSome: selection =>
      Option.match(locate(board, selection.cardId), {
        onNone: () => ({ model: board }),
        onSome: placed => {
          const title = selection.titleInput.trim()
          if (title === '') {
            return { model: board }
          }
          const renamed = mapSaved(board, selection.cardId, card =>
            modifyFields(card, { title: () => title }),
          )
          return {
            model: updateSelected(renamed, selection.cardId, current =>
              modifyFields(current, { maybeRenameError: () => Option.none() }),
            ),
            commands: [
              RenameCard({
                visit,
                id: selection.cardId,
                title,
                previousTitle: placed.card.title,
              }),
            ],
          }
        },
      }),
  })

const archiveOnBoard = (board: BoardPage, visit: number): BoardReturn =>
  Option.match(board.maybeSelection, {
    onNone: () => ({ model: board }),
    onSome: selection =>
      Option.match(locate(board, selection.cardId), {
        onNone: () => ({ model: board }),
        onSome: placed => ({
          model: modifyFields(
            changeCards(board, placed.column, cards =>
              removedAt(cards, placed.index),
            ),
            {
              maybeSelection: () => Option.none(),
              maybeArchiveError: () => Option.none(),
            },
          ),
          commands: [
            ArchiveCard({
              visit,
              card: placed.card,
              column: placed.column,
              index: placed.index,
            }),
          ],
        }),
      }),
  })

const toggleOnBoard = (
  board: BoardPage,
  visit: number,
  itemId: number,
): BoardReturn =>
  Option.match(board.maybeSelection, {
    onNone: () => ({ model: board }),
    onSome: selection => {
      const items = Option.getOrElse(
        AsyncData.getData(selection.checklist),
        () => [],
      )
      const savedItems = items.flatMap(item =>
        item._tag === 'Saved' ? [item] : [],
      )
      const target = savedItems.find(item => item.id === itemId)
      if (target === undefined) {
        return { model: board }
      }
      const wanted = !target.done
      const toggled = modifyFields(board, {
        maybeSelection: maybe =>
          Option.map(maybe, current =>
            modifyFields(
              changeChecklist(current, currentItems =>
                currentItems.map(item =>
                  item._tag === 'Saved' && item.id === itemId
                    ? ChecklistItem.Saved({
                        id: item.id,
                        text: item.text,
                        done: wanted,
                      })
                    : item,
                ),
              ),
              { maybeItemError: () => Option.none() },
            ),
          ),
      })
      return {
        model: mapSaved(toggled, selection.cardId, card =>
          modifyFields(card, {
            done: done => done + (wanted ? 1 : -1),
          }),
        ),
        commands: [
          ToggleItem({
            visit,
            cardId: selection.cardId,
            itemId,
            done: wanted,
          }),
        ],
      }
    },
  })

const addItemOnBoard = (board: BoardPage, visit: number): BoardReturn =>
  Option.match(board.maybeSelection, {
    onNone: () => ({ model: board }),
    onSome: selection => {
      const text = selection.itemInput.trim()
      if (text === '' || !AsyncData.isSuccess(selection.checklist)) {
        return { model: board }
      }
      const key = board.nextKey
      const cardId = selection.cardId
      const nextSelection = modifyFields(
        changeChecklist(selection, items => [
          ...items,
          ChecklistItem.Adding({ key, text }),
        ]),
        {
          itemInput: () => '',
          maybeItemError: () => Option.none(),
        },
      )
      const counted = mapSaved(board, cardId, card =>
        modifyFields(card, { total: total => total + 1 }),
      )
      return {
        model: modifyFields(counted, {
          nextKey: () => key + 1,
          maybeSelection: () => Option.some(nextSelection),
        }),
        commands: [AddItem({ visit, cardId, key, text })],
      }
    },
  })

const archiveRestoreOnBoard = (
  board: BoardPage,
  column: ColumnName,
  index: number,
  card: Card,
  error: string,
): BoardReturn => ({
  model: modifyFields(
    changeCards(board, column, cards =>
      insertedAt(cards, index, BoardCard.Saved(card)),
    ),
    { maybeArchiveError: () => Option.some(error) },
  ),
})

const restoreInArchive = (
  archive: ArchivePage,
  visit: number,
  id: number,
): ArchiveReturn => {
  if (!AsyncData.isSuccess(archive.archived)) {
    return { model: archive }
  }
  const rows = archive.archived.data
  const index = rows.findIndex(row => row.id === id)
  const row = rows[index]
  if (row === undefined) {
    return { model: archive }
  }
  return {
    model: modifyFields(archive, {
      archived: () => ArchivedState.Success({ data: removedAt(rows, index) }),
      maybeRestoreError: () => Option.none(),
    }),
    commands: [RestoreCard({ visit, archived: row, index })],
  }
}

const changeArchived = (
  archive: ArchivePage,
  change: (rows: ReadonlyArray<Archived>) => ReadonlyArray<Archived>,
): ArchivePage =>
  modifyFields(archive, {
    archived: list =>
      AsyncData.isSuccess(list)
        ? ArchivedState.Success({ data: change(list.data) })
        : list,
  })

export const update = (model: Model, message: Message) =>
  Message.match<Update.Return<Model, Message>>(message, {
    ClickedBoardTab: () => (onBoard(model) ? { model } : openBoard(model)),

    ClickedArchiveTab: () =>
      onArchive(model) ? { model } : openArchive(model),

    SucceededFetchCards: ({ visit, column, cards }) =>
      inBoard(model, visit, board => ({
        model: setColumn(
          board,
          column,
          CardsState.Success({ data: cards.map(card => BoardCard.Saved(card)) }),
        ),
      })),

    FailedFetchCards: ({ visit, column, error }) =>
      inBoard(model, visit, board => ({
        model: setColumn(board, column, CardsState.Failure({ error })),
      })),

    ClickedRetryFetchCards: ({ column }) =>
      inBoard(model, model.visit, board => ({
        model: setColumn(board, column, CardsState.Loading()),
        commands: [FetchCards({ visit: model.visit, column })],
      })),

    ClickedMoveCard: ({ id, direction }) =>
      inBoard(model, model.visit, board =>
        moveOnBoard(board, model.visit, id, direction),
      ),

    SucceededMoveCard: ({ visit }) =>
      inBoard(model, visit, board => ({ model: board })),

    FailedMoveCard: ({ visit, id, fromColumn, fromIndex, error }) =>
      inBoard(model, visit, board => ({
        model: revertMove(board, id, fromColumn, fromIndex, error),
      })),

    UpdatedNewCardTitle: ({ value }) =>
      inBoard(model, model.visit, board => ({
        model: modifyFields(board, { newCardTitle: () => value }),
      })),

    ClickedAddCard: () =>
      inBoard(model, model.visit, board => addCardOnBoard(board, model.visit)),

    SucceededAddCard: ({ visit, key, card }) =>
      inBoard(model, visit, board => ({
        model: changeCards(board, 'todo', cards =>
          cards.map(item =>
            item._tag === 'Adding' && item.key === key
              ? BoardCard.Saved(card)
              : item,
          ),
        ),
      })),

    FailedAddCard: ({ visit, key, error }) =>
      inBoard(model, visit, board => ({
        model: modifyFields(
          changeCards(board, 'todo', cards =>
            cards.filter(item => !(item._tag === 'Adding' && item.key === key)),
          ),
          { maybeAddError: () => Option.some(error) },
        ),
      })),

    ClickedSelectCard: ({ id }) =>
      inBoard(model, model.visit, board =>
        selectOnBoard(board, model.visit, id),
      ),

    UpdatedRenameInput: ({ value }) =>
      inBoard(model, model.visit, board => ({
        model: changeSelection(board, selection =>
          modifyFields(selection, { titleInput: () => value }),
        ),
      })),

    ClickedRenameCard: () =>
      inBoard(model, model.visit, board => renameOnBoard(board, model.visit)),

    SucceededRenameCard: ({ visit }) =>
      inBoard(model, visit, board => ({ model: board })),

    FailedRenameCard: ({ visit, id, previousTitle, error }) =>
      inBoard(model, visit, board => ({
        model: updateSelected(
          mapSaved(board, id, card =>
            modifyFields(card, { title: () => previousTitle }),
          ),
          id,
          selection =>
            modifyFields(selection, {
              maybeRenameError: () => Option.some(error),
            }),
        ),
      })),

    ClickedArchiveCard: () =>
      inBoard(model, model.visit, board =>
        archiveOnBoard(board, model.visit),
      ),

    SucceededArchiveCard: ({ visit }) =>
      inBoard(model, visit, board => ({ model: board })),

    FailedArchiveCard: ({ visit, card, column, index, error }) =>
      inBoard(model, visit, board =>
        archiveRestoreOnBoard(board, column, index, card, error),
      ),

    SucceededFetchChecklist: ({ visit, cardId, items }) =>
      inBoard(model, visit, board => ({
        model: updateSelected(board, cardId, selection =>
          modifyFields(selection, {
            checklist: () =>
              ChecklistState.Success({
                data: items.map(item => ChecklistItem.Saved(item)),
              }),
          }),
        ),
      })),

    FailedFetchChecklist: ({ visit, cardId, error }) =>
      inBoard(model, visit, board => ({
        model: updateSelected(board, cardId, selection =>
          modifyFields(selection, {
            checklist: () => ChecklistState.Failure({ error }),
          }),
        ),
      })),

    ClickedToggleItem: ({ itemId }) =>
      inBoard(model, model.visit, board =>
        toggleOnBoard(board, model.visit, itemId),
      ),

    SucceededToggleItem: ({ visit }) =>
      inBoard(model, visit, board => ({ model: board })),

    FailedToggleItem: ({ visit, cardId, itemId, done, error }) =>
      inBoard(model, visit, board => {
        const reverted = mapSaved(board, cardId, card =>
          modifyFields(card, {
            done: count => count + (done ? -1 : 1),
          }),
        )
        return {
          model: updateSelected(reverted, cardId, selection =>
            modifyFields(
              changeChecklist(selection, items =>
                items.map(item =>
                  item._tag === 'Saved' && item.id === itemId
                    ? ChecklistItem.Saved({
                        id: item.id,
                        text: item.text,
                        done: !done,
                      })
                    : item,
                ),
              ),
              { maybeItemError: () => Option.some(error) },
            ),
          ),
        }
      }),

    UpdatedItemInput: ({ value }) =>
      inBoard(model, model.visit, board => ({
        model: changeSelection(board, selection =>
          modifyFields(selection, { itemInput: () => value }),
        ),
      })),

    ClickedAddItem: () =>
      inBoard(model, model.visit, board => addItemOnBoard(board, model.visit)),

    SucceededAddItem: ({ visit, cardId, key, item }) =>
      inBoard(model, visit, board => ({
        model: updateSelected(board, cardId, selection =>
          changeChecklist(selection, items =>
            items.map(current =>
              current._tag === 'Adding' && current.key === key
                ? ChecklistItem.Saved(item)
                : current,
            ),
          ),
        ),
      })),

    FailedAddItem: ({ visit, cardId, key, error }) =>
      inBoard(model, visit, board => {
        const uncounted = mapSaved(board, cardId, card =>
          modifyFields(card, { total: total => total - 1 }),
        )
        return {
          model: updateSelected(uncounted, cardId, selection =>
            modifyFields(
              changeChecklist(selection, items =>
                items.filter(
                  current =>
                    !(current._tag === 'Adding' && current.key === key),
                ),
              ),
              { maybeItemError: () => Option.some(error) },
            ),
          ),
        }
      }),

    SucceededFetchArchived: ({ visit, archived }) =>
      inArchive(model, visit, archive => ({
        model: modifyFields(archive, {
          archived: () => ArchivedState.Success({ data: archived }),
        }),
      })),

    FailedFetchArchived: ({ visit, error }) =>
      inArchive(model, visit, archive => ({
        model: modifyFields(archive, {
          archived: () => ArchivedState.Failure({ error }),
        }),
      })),

    ClickedRestoreCard: ({ id }) =>
      inArchive(model, model.visit, archive =>
        restoreInArchive(archive, model.visit, id),
      ),

    SucceededRestoreCard: ({ visit }) =>
      inArchive(model, visit, archive => ({ model: archive })),

    FailedRestoreCard: ({ visit, archived, index, error }) =>
      inArchive(model, visit, archive => ({
        model: modifyFields(
          changeArchived(archive, rows => insertedAt(rows, index, archived)),
          { maybeRestoreError: () => Option.some(error) },
        ),
      })),
  })
