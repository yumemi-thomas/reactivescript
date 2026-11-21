import { Array, Option } from 'effect'
import { AsyncData, type Update } from 'foldkit'
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
import { Message } from './message'
import {
  ArchiveData,
  ArchivePage,
  BoardCard,
  BoardPage,
  COLUMN_NAMES,
  CardsData,
  CardsState,
  ChecklistData,
  ChecklistItem,
  ColumnName,
  Destination,
  Model,
  MoveDirection,
  Page,
  Placement,
  Selection,
  boardPageFor,
  columnCards,
  locateCard,
  moveAllowed,
  moveDestination,
  isColumnLoaded,
} from './model'

// UPDATE

type BoardReturn = Update.Return<BoardPage, Message>
type ArchiveReturn = Update.Return<ArchivePage, Message>
type UpdateReturn = Update.Return<Model, Message>

export const boardFetches = (visit: number) =>
  COLUMN_NAMES.map(column => FetchCards({ visit, column }))

const insertAt = <A>(
  items: ReadonlyArray<A>,
  index: number,
  item: A,
): ReadonlyArray<A> => [...items.slice(0, index), item, ...items.slice(index)]

const mapColumns = (
  board: BoardPage,
  transform: (name: ColumnName, cards: CardsState) => CardsState,
): BoardPage =>
  modifyFields(board, {
    columns: columns =>
      columns.map(column =>
        modifyFields(column, {
          cards: cards => transform(column.name, cards),
        }),
      ),
  })

const setColumnState = (
  board: BoardPage,
  name: ColumnName,
  state: CardsState,
): BoardPage =>
  mapColumns(board, (columnName, cards) =>
    columnName === name ? state : cards,
  )

const mapColumnData = (
  board: BoardPage,
  name: ColumnName,
  f: (cards: ReadonlyArray<BoardCard>) => ReadonlyArray<BoardCard>,
): BoardPage =>
  mapColumns(board, (columnName, cards) =>
    columnName === name ? AsyncData.map(cards, f) : cards,
  )

const mapAllCards = (
  board: BoardPage,
  f: (cards: ReadonlyArray<BoardCard>) => ReadonlyArray<BoardCard>,
): BoardPage => mapColumns(board, (_columnName, cards) => AsyncData.map(cards, f))

const mapCard = (
  board: BoardPage,
  id: number,
  f: (card: BoardCard) => BoardCard,
): BoardPage =>
  mapAllCards(board, cards =>
    cards.map(card => (card.id === id ? f(card) : card)),
  )

const removeCard = (board: BoardPage, id: number): BoardPage =>
  mapAllCards(board, cards => cards.filter(card => card.id !== id))

const removePending = (board: BoardPage, key: number): BoardPage =>
  modifyFields(board, {
    pendingCards: pending => pending.filter(card => card.key !== key),
  })

const relocateCard = (
  board: BoardPage,
  placement: Placement,
  destination: Destination,
): BoardPage =>
  mapColumnData(
    removeCard(board, placement.card.id),
    destination.column,
    cards => insertAt(cards, destination.index, placement.card),
  )

const updateSelection = (
  board: BoardPage,
  f: (selection: Selection) => Selection,
): BoardPage =>
  modifyFields(board, {
    maybeSelection: maybe => Option.map(maybe, f),
  })

const updateSelectionFor = (
  board: BoardPage,
  cardId: number,
  f: (selection: Selection) => Selection,
): BoardPage =>
  updateSelection(board, selection =>
    selection.cardId === cardId ? f(selection) : selection,
  )

const updateItems = (
  selection: Selection,
  f: (items: ReadonlyArray<ChecklistItem>) => ReadonlyArray<ChecklistItem>,
): Selection =>
  modifyFields(selection, {
    checklist: checklist => AsyncData.map(checklist, f),
  })

const setItemDone = (
  selection: Selection,
  itemId: number,
  done: boolean,
): Selection =>
  modifyFields(
    updateItems(selection, items =>
      items.map(item =>
        item.id === itemId ? modifyFields(item, { done: () => done }) : item,
      ),
    ),
    { maybeItemError: () => Option.none() },
  )

const findItem = (
  selection: Selection,
  itemId: number,
): Option.Option<ChecklistItem> =>
  Option.flatMap(AsyncData.getData(selection.checklist), items =>
    Array.findFirst(items, item => item.id === itemId),
  )

const resumeBoard = (model: Model, result: BoardReturn): UpdateReturn => {
  const next = modifyFields(model, { page: () => result.model })
  return result.commands === undefined
    ? { model: next }
    : { model: next, commands: result.commands }
}

const resumeArchive = (model: Model, result: ArchiveReturn): UpdateReturn => {
  const next = modifyFields(model, { page: () => result.model })
  return result.commands === undefined
    ? { model: next }
    : { model: next, commands: result.commands }
}

const withBoard = (
  model: Model,
  visit: number,
  step: (board: BoardPage) => BoardReturn,
): UpdateReturn =>
  Page.match<UpdateReturn>(model.page, {
    Board: board =>
      board.visit === visit ? resumeBoard(model, step(board)) : { model },
    Archive: () => ({ model }),
  })

const currentBoard = (
  model: Model,
  step: (board: BoardPage) => BoardReturn,
): UpdateReturn =>
  Page.match<UpdateReturn>(model.page, {
    Board: board => resumeBoard(model, step(board)),
    Archive: () => ({ model }),
  })

const withArchive = (
  model: Model,
  visit: number,
  step: (page: ArchivePage) => ArchiveReturn,
): UpdateReturn =>
  Page.match<UpdateReturn>(model.page, {
    Board: () => ({ model }),
    Archive: page =>
      page.visit === visit ? resumeArchive(model, step(page)) : { model },
  })

const currentArchive = (
  model: Model,
  step: (page: ArchivePage) => ArchiveReturn,
): UpdateReturn =>
  Page.match<UpdateReturn>(model.page, {
    Board: () => ({ model }),
    Archive: page => resumeArchive(model, step(page)),
  })

const openBoard = (model: Model): UpdateReturn =>
  Page.match<UpdateReturn>(model.page, {
    Board: () => ({ model }),
    Archive: () => ({
      model: modifyFields(model, {
        page: () => boardPageFor(model.nextVisit),
        nextVisit: visit => visit + 1,
      }),
      commands: boardFetches(model.nextVisit),
    }),
  })

const openArchive = (model: Model): UpdateReturn =>
  Page.match<UpdateReturn>(model.page, {
    Board: () => ({
      model: modifyFields(model, {
        page: () =>
          Page.Archive({
            visit: model.nextVisit,
            archived: ArchiveData.Loading(),
            maybeRestoreError: Option.none(),
          }),
        nextVisit: visit => visit + 1,
      }),
      commands: [FetchArchived({ visit: model.nextVisit })],
    }),
    Archive: () => ({ model }),
  })

const retryColumn = (board: BoardPage, column: ColumnName): BoardReturn =>
  AsyncData.isFailure(columnCards(board, column))
    ? {
        model: setColumnState(board, column, CardsData.Loading()),
        commands: [FetchCards({ visit: board.visit, column })],
      }
    : { model: board }

const moveCardStep = (
  board: BoardPage,
  id: number,
  direction: MoveDirection,
): BoardReturn =>
  Option.match(locateCard(board, id), {
    onNone: () => ({ model: board }),
    onSome: placement =>
      Option.match(moveDestination(board, placement, direction), {
        onNone: () => ({ model: board }),
        onSome: destination =>
          moveAllowed(board, placement, destination)
            ? {
                model: modifyFields(relocateCard(board, placement, destination), {
                  maybeMoveError: () => Option.none(),
                }),
                commands: [
                  MoveCard({
                    visit: board.visit,
                    id,
                    column: destination.column,
                    index: destination.index,
                    fromColumn: placement.column,
                    fromIndex: placement.index,
                  }),
                ],
              }
            : { model: board },
      }),
  })

const revertMove = (
  board: BoardPage,
  id: number,
  fromColumn: ColumnName,
  fromIndex: number,
  error: string,
): BoardPage => {
  const failed = modifyFields(board, {
    maybeMoveError: () => Option.some(error),
  })
  return Option.match(locateCard(failed, id), {
    onNone: () => failed,
    onSome: placement =>
      relocateCard(failed, placement, { column: fromColumn, index: fromIndex }),
  })
}

const submitNewCard = (board: BoardPage): BoardReturn => {
  const title = board.newCardTitle.trim()
  if (title === '' || !isColumnLoaded(board, 'todo')) {
    return { model: board }
  }
  return {
    model: modifyFields(board, {
      pendingCards: pending => [...pending, { key: board.nextKey, title }],
      nextKey: key => key + 1,
      newCardTitle: () => '',
      maybeAddError: () => Option.none(),
    }),
    commands: [AddCard({ visit: board.visit, key: board.nextKey, title })],
  }
}

const acceptCard = (board: BoardPage, key: number, card: BoardCard): BoardPage =>
  mapColumnData(removePending(board, key), 'todo', cards => [...cards, card])

const selectCard = (board: BoardPage, id: number): BoardReturn => {
  if (Option.exists(board.maybeSelection, selection => selection.cardId === id)) {
    return { model: board }
  }
  return {
    model: modifyFields(board, {
      maybeSelection: () =>
        Option.some({
          cardId: id,
          checklist: ChecklistData.Loading(),
          pendingItems: [],
          renameInput: '',
          itemInput: '',
          maybeRenameError: Option.none(),
          maybeItemError: Option.none(),
        }),
    }),
    commands: [FetchChecklist({ visit: board.visit, cardId: id })],
  }
}

const submitRename = (board: BoardPage): BoardReturn =>
  Option.match(board.maybeSelection, {
    onNone: () => ({ model: board }),
    onSome: selection => {
      const title = selection.renameInput.trim()
      return Option.match(locateCard(board, selection.cardId), {
        onNone: () => ({ model: board }),
        onSome: placement =>
          title === ''
            ? { model: board }
            : {
                model: updateSelection(
                  mapCard(board, placement.card.id, card =>
                    modifyFields(card, { title: () => title }),
                  ),
                  current => modifyFields(current, {
                    maybeRenameError: () => Option.none(),
                  }),
                ),
                commands: [
                  RenameCard({
                    visit: board.visit,
                    id: placement.card.id,
                    title,
                    previousTitle: placement.card.title,
                  }),
                ],
              },
      })
    },
  })

const archiveSelected = (board: BoardPage): BoardReturn =>
  Option.match(
    Option.flatMap(board.maybeSelection, selection =>
      locateCard(board, selection.cardId),
    ),
    {
      onNone: () => ({ model: board }),
      onSome: placement => ({
        model: modifyFields(removeCard(board, placement.card.id), {
          maybeSelection: () => Option.none(),
          maybeArchiveError: () => Option.none(),
        }),
        commands: [
          ArchiveCard({
            visit: board.visit,
            card: placement.card,
            column: placement.column,
            index: placement.index,
          }),
        ],
      }),
    },
  )

const restoreFailedArchive = (
  board: BoardPage,
  card: BoardCard,
  column: ColumnName,
  index: number,
  error: string,
): BoardPage => {
  const failed = modifyFields(board, {
    maybeArchiveError: () => Option.some(error),
  })
  return Option.match(locateCard(failed, card.id), {
    onNone: () => mapColumnData(failed, column, cards => insertAt(cards, index, card)),
    onSome: () => failed,
  })
}

const toggleItemStep = (board: BoardPage, itemId: number): BoardReturn =>
  Option.match(
    Option.flatMap(board.maybeSelection, selection =>
      Option.map(findItem(selection, itemId), item => ({
        cardId: selection.cardId,
        done: !item.done,
      })),
    ),
    {
      onNone: () => ({ model: board }),
      onSome: ({ cardId, done }) => ({
        model: updateSelectionFor(
          mapCard(board, cardId, card =>
            modifyFields(card, { done: count => count + (done ? 1 : -1) }),
          ),
          cardId,
          selection => setItemDone(selection, itemId, done),
        ),
        commands: [ToggleItem({ visit: board.visit, cardId, itemId, done })],
      }),
    },
  )

const revertToggle = (
  board: BoardPage,
  cardId: number,
  itemId: number,
  done: boolean,
  error: string,
): BoardPage =>
  updateSelectionFor(
    mapCard(board, cardId, card =>
      modifyFields(card, { done: count => count + (done ? -1 : 1) }),
    ),
    cardId,
    selection =>
      modifyFields(setItemDone(selection, itemId, !done), {
        maybeItemError: () => Option.some(error),
      }),
  )

const submitItem = (board: BoardPage): BoardReturn =>
  Option.match(board.maybeSelection, {
    onNone: () => ({ model: board }),
    onSome: selection => {
      const text = selection.itemInput.trim()
      if (text === '' || !AsyncData.isSuccess(selection.checklist)) {
        return { model: board }
      }
      const next = modifyFields(selection, {
        pendingItems: pending => [...pending, { key: board.nextKey, text }],
        itemInput: () => '',
        maybeItemError: () => Option.none(),
      })
      return {
        model: mapCard(
          modifyFields(board, {
            nextKey: key => key + 1,
            maybeSelection: () => Option.some(next),
          }),
          selection.cardId,
          card => modifyFields(card, { total: count => count + 1 }),
        ),
        commands: [
          AddItem({
            visit: board.visit,
            cardId: selection.cardId,
            key: board.nextKey,
            text,
          }),
        ],
      }
    },
  })

const restoreRow = (page: ArchivePage, id: number): ArchiveReturn =>
  Option.match(
    Option.flatMap(AsyncData.getData(page.archived), rows =>
      Array.findFirst(
        rows.map((row, index) => ({ row, index })),
        entry => entry.row.id === id,
      ),
    ),
    {
      onNone: () => ({ model: page }),
      onSome: ({ row, index }) => ({
        model: modifyFields(page, {
          archived: state =>
            AsyncData.map(state, rows => rows.filter(current => current.id !== id)),
          maybeRestoreError: () => Option.none(),
        }),
        commands: [RestoreCard({ visit: page.visit, card: row, index })],
      }),
    },
  )

export const update = (model: Model, message: Message): UpdateReturn =>
  Message.match<UpdateReturn>(message, {
    ClickedBoardTab: () => openBoard(model),
    ClickedArchiveTab: () => openArchive(model),

    SucceededFetchCards: ({ visit, column, cards }) =>
      withBoard(model, visit, board => ({
        model: setColumnState(board, column, CardsData.Success({ data: cards })),
      })),
    FailedFetchCards: ({ visit, column, error }) =>
      withBoard(model, visit, board => ({
        model: setColumnState(board, column, CardsData.Failure({ error })),
      })),
    ClickedRetryColumn: ({ column }) =>
      currentBoard(model, board => retryColumn(board, column)),

    ClickedMoveCard: ({ id, direction }) =>
      currentBoard(model, board => moveCardStep(board, id, direction)),
    SucceededMoveCard: () => ({ model }),
    FailedMoveCard: ({ visit, id, fromColumn, fromIndex, error }) =>
      withBoard(model, visit, board => ({
        model: revertMove(board, id, fromColumn, fromIndex, error),
      })),

    UpdatedNewCardTitle: ({ value }) =>
      currentBoard(model, board => ({
        model: modifyFields(board, { newCardTitle: () => value }),
      })),
    SubmittedNewCard: () => currentBoard(model, submitNewCard),
    SucceededAddCard: ({ visit, key, id, title }) =>
      withBoard(model, visit, board => ({
        model: acceptCard(board, key, { id, title, done: 0, total: 0 }),
      })),
    FailedAddCard: ({ visit, key, error }) =>
      withBoard(model, visit, board => ({
        model: modifyFields(removePending(board, key), {
          maybeAddError: () => Option.some(error),
        }),
      })),

    ClickedCard: ({ id }) => currentBoard(model, board => selectCard(board, id)),
    UpdatedRenameTitle: ({ value }) =>
      currentBoard(model, board => ({
        model: updateSelection(board, selection =>
          modifyFields(selection, { renameInput: () => value }),
        ),
      })),
    SubmittedRename: () => currentBoard(model, submitRename),
    SucceededRenameCard: () => ({ model }),
    FailedRenameCard: ({ visit, id, previousTitle, error }) =>
      withBoard(model, visit, board => ({
        model: updateSelectionFor(
          mapCard(board, id, card =>
            modifyFields(card, { title: () => previousTitle }),
          ),
          id,
          selection =>
            modifyFields(selection, {
              maybeRenameError: () => Option.some(error),
            }),
        ),
      })),

    ClickedArchiveCard: () => currentBoard(model, archiveSelected),
    SucceededArchiveCard: () => ({ model }),
    FailedArchiveCard: ({ visit, card, column, index, error }) =>
      withBoard(model, visit, board => ({
        model: restoreFailedArchive(board, card, column, index, error),
      })),

    SucceededFetchChecklist: ({ visit, cardId, items }) =>
      withBoard(model, visit, board => ({
        model: updateSelectionFor(board, cardId, selection =>
          modifyFields(selection, {
            checklist: () => ChecklistData.Success({ data: items }),
          }),
        ),
      })),
    FailedFetchChecklist: ({ visit, cardId, error }) =>
      withBoard(model, visit, board => ({
        model: updateSelectionFor(board, cardId, selection =>
          modifyFields(selection, {
            checklist: () => ChecklistData.Failure({ error }),
          }),
        ),
      })),
    ClickedToggleItem: ({ itemId }) =>
      currentBoard(model, board => toggleItemStep(board, itemId)),
    SucceededToggleItem: () => ({ model }),
    FailedToggleItem: ({ visit, cardId, itemId, done, error }) =>
      withBoard(model, visit, board => ({
        model: revertToggle(board, cardId, itemId, done, error),
      })),

    UpdatedItemInput: ({ value }) =>
      currentBoard(model, board => ({
        model: updateSelection(board, selection =>
          modifyFields(selection, { itemInput: () => value }),
        ),
      })),
    SubmittedItem: () => currentBoard(model, submitItem),
    SucceededAddItem: ({ visit, cardId, key, item }) =>
      withBoard(model, visit, board => ({
        model: updateSelectionFor(board, cardId, selection =>
          modifyFields(selection, {
            pendingItems: pending => pending.filter(entry => entry.key !== key),
            checklist: state => AsyncData.map(state, items => [...items, item]),
          }),
        ),
      })),
    FailedAddItem: ({ visit, cardId, key, error }) =>
      withBoard(model, visit, board => ({
        model: updateSelectionFor(
          mapCard(board, cardId, card =>
            modifyFields(card, { total: count => count - 1 }),
          ),
          cardId,
          selection =>
            modifyFields(selection, {
              pendingItems: pending => pending.filter(entry => entry.key !== key),
              maybeItemError: () => Option.some(error),
            }),
        ),
      })),

    SucceededFetchArchived: ({ visit, archived }) =>
      withArchive(model, visit, page => ({
        model: modifyFields(page, {
          archived: () => ArchiveData.Success({ data: archived }),
        }),
      })),
    FailedFetchArchived: ({ visit, error }) =>
      withArchive(model, visit, page => ({
        model: modifyFields(page, {
          archived: () => ArchiveData.Failure({ error }),
        }),
      })),
    ClickedRestoreCard: ({ id }) =>
      currentArchive(model, page => restoreRow(page, id)),
    SucceededRestoreCard: () => ({ model }),
    FailedRestoreCard: ({ visit, card, index, error }) =>
      withArchive(model, visit, page => ({
        model: modifyFields(page, {
          archived: state =>
            AsyncData.map(state, rows =>
              rows.some(row => row.id === card.id)
                ? rows
                : insertAt(rows, index, card),
            ),
          maybeRestoreError: () => Option.some(error),
        }),
      })),
  })
