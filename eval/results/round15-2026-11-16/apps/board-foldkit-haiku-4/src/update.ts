import { Array, Option } from 'effect'
import { type Update } from 'foldkit'
import { modifyFields } from 'foldkit/struct'

import {
  adjustCounts,
  dropPending,
  insertCard,
  isLoaded,
  locate,
  mapItems,
  moveCard,
  movesFrom,
  removeCard,
  renameCardTitle,
  resolvePending,
  savedItems,
  selectedOf,
  setItemDone,
  titleOf,
  updateSelected,
  updateSelection,
  withColumn,
  addPending,
} from './board'
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
  Archive,
  ArchiveLoad,
  ArchivedCard,
  Board,
  BoardCard,
  Checklist,
  ChecklistItem,
  ColumnId,
  ColumnLoad,
  Column,
  Direction,
  Model,
  Page,
  SavedCard,
  Selection,
  initialArchive,
  initialBoard,
} from './model'

// PAGES

const startBoard = (session: number): Update.Return<Model, Message> => ({
  model: { page: Page.BoardPage({ board: initialBoard }), session },
  commands: [
    FetchCards({ session, column: 'todo' }),
    FetchCards({ session, column: 'doing' }),
    FetchCards({ session, column: 'done' }),
  ],
})

const startArchive = (session: number): Update.Return<Model, Message> => ({
  model: { page: Page.ArchivePage({ archive: initialArchive }), session },
  commands: [FetchArchived({ session })],
})

const setBoard = (model: Model, board: Board): Model =>
  modifyFields(model, { page: () => Page.BoardPage({ board }) })

const setArchive = (model: Model, archive: Archive): Model =>
  modifyFields(model, { page: () => Page.ArchivePage({ archive }) })

const boardAt = (model: Model, session: number): Option.Option<Board> =>
  session !== model.session
    ? Option.none()
    : Page.match<Option.Option<Board>>(model.page, {
        BoardPage: ({ board }) => Option.some(board),
        ArchivePage: () => Option.none(),
      })

const archiveAt = (model: Model, session: number): Option.Option<Archive> =>
  session !== model.session
    ? Option.none()
    : Page.match<Option.Option<Archive>>(model.page, {
        BoardPage: () => Option.none(),
        ArchivePage: ({ archive }) => Option.some(archive),
      })

const onBoard = (
  model: Model,
  session: number,
  change: (board: Board) => Update.Return<Model, Message>,
): Update.Return<Model, Message> =>
  Option.match(boardAt(model, session), {
    onNone: () => ({ model }),
    onSome: change,
  })

const onArchive = (
  model: Model,
  session: number,
  change: (archive: Archive) => Update.Return<Model, Message>,
): Update.Return<Model, Message> =>
  Option.match(archiveAt(model, session), {
    onNone: () => ({ model }),
    onSome: change,
  })

const setColumnLoad = (
  board: Board,
  columnId: ColumnId,
  load: ColumnLoad,
): Board =>
  withColumn(board, columnId, column => modifyFields(column, { load: () => load }))

const loadedColumn = (
  column: Column,
  cards: ReadonlyArray<SavedCard>,
): Column =>
  modifyFields(column, {
    load: () => ColumnLoad.Loaded(),
    cards: current => [
      ...Array.map(cards, card => BoardCard.Saved(card)),
      ...Array.filter(current, BoardCard.guards.Adding),
    ],
  })

const titleIsBlank = (title: string): boolean => title.trim() === ''

// BOARD COMMANDS

const moveSelectedCard = (
  model: Model,
  board: Board,
  cardId: number,
  direction: Direction,
): Update.Return<Model, Message> =>
  Option.match(locate(board, cardId), {
    onNone: () => ({ model }),
    onSome: ({ column, index }) =>
      Option.match(
        Array.findFirst(
          movesFrom(board, column, index),
          move => move.direction === direction && move.enabled,
        ),
        {
          onNone: () => ({ model }),
          onSome: move => ({
            model: setBoard(
              model,
              modifyFields(moveCard(board, cardId, move.toColumn, move.toIndex), {
                maybeMoveError: () => Option.none(),
              }),
            ),
            commands: [
              MoveCard({
                session: model.session,
                cardId,
                column: move.toColumn,
                index: move.toIndex,
                fromColumn: column,
                fromIndex: index,
              }),
            ],
          }),
        },
      ),
  })

const submitCard = (model: Model, board: Board): Update.Return<Model, Message> => {
  const title = board.newCardTitle.trim()
  if (titleIsBlank(title) || !isLoaded(board.todo)) {
    return { model }
  }
  const localId = board.nextLocalId
  return {
    model: setBoard(
      model,
      modifyFields(addPending(board, localId, title), {
        nextLocalId: () => localId + 1,
        newCardTitle: () => '',
        maybeAddError: () => Option.none(),
      }),
    ),
    commands: [AddCard({ session: model.session, localId, title })],
  }
}

const selectCard = (
  model: Model,
  board: Board,
  cardId: number,
): Update.Return<Model, Message> =>
  Option.match(locate(board, cardId), {
    onNone: () => ({ model }),
    onSome: () => ({
      model: setBoard(
        model,
        modifyFields(board, {
          selection: () =>
            Selection.Selected({
              cardId,
              checklist: Checklist.Loading(),
              titleInput: '',
              itemInput: '',
              maybeRenameError: Option.none(),
              maybeItemError: Option.none(),
            }),
        }),
      ),
      commands: [FetchChecklist({ session: model.session, cardId })],
    }),
  })

const renameSelected = (model: Model, board: Board): Update.Return<Model, Message> =>
  Option.match(selectedOf(board), {
    onNone: () => ({ model }),
    onSome: selected =>
      Option.match(locate(board, selected.cardId), {
        onNone: () => ({ model }),
        onSome: ({ card }) => {
          const title = selected.titleInput.trim()
          if (titleIsBlank(title)) {
            return { model }
          }
          const renamed = updateSelected(
            renameCardTitle(board, selected.cardId, title),
            selected.cardId,
            current =>
              modifyFields(current, {
                titleInput: () => '',
                maybeRenameError: () => Option.none(),
              }),
          )
          return {
            model: setBoard(model, renamed),
            commands: [
              RenameCard({
                session: model.session,
                cardId: selected.cardId,
                title,
                previousTitle: titleOf(card),
              }),
            ],
          }
        },
      }),
  })

const archiveSelected = (model: Model, board: Board): Update.Return<Model, Message> =>
  Option.match(selectedOf(board), {
    onNone: () => ({ model }),
    onSome: selected =>
      Option.match(locate(board, selected.cardId), {
        onNone: () => ({ model }),
        onSome: ({ column, index, card }) => ({
          model: setBoard(
            model,
            modifyFields(removeCard(board, selected.cardId), {
              selection: () => Selection.NoSelection(),
              maybeArchiveError: () => Option.none(),
            }),
          ),
          commands: [
            ArchiveCard({
              session: model.session,
              cardId: selected.cardId,
              column,
              index,
              card,
            }),
          ],
        }),
      }),
  })

const toggleItem = (
  model: Model,
  board: Board,
  itemId: number,
): Update.Return<Model, Message> =>
  Option.match(selectedOf(board), {
    onNone: () => ({ model }),
    onSome: selected =>
      Option.match(
        Array.findFirst(savedItems(selected), item => item.id === itemId),
        {
          onNone: () => ({ model }),
          onSome: item => {
            const done = !item.done
            const toggled = adjustCounts(
              updateSelected(
                setItemDone(board, selected.cardId, itemId, done),
                selected.cardId,
                current =>
                  modifyFields(current, { maybeItemError: () => Option.none() }),
              ),
              selected.cardId,
              done ? 1 : -1,
              0,
            )
            return {
              model: setBoard(model, toggled),
              commands: [
                ToggleItem({
                  session: model.session,
                  cardId: selected.cardId,
                  itemId,
                  done,
                }),
              ],
            }
          },
        },
      ),
  })

const submitItem = (model: Model, board: Board): Update.Return<Model, Message> =>
  Option.match(selectedOf(board), {
    onNone: () => ({ model }),
    onSome: selected => {
      const text = selected.itemInput.trim()
      if (titleIsBlank(text) || !Checklist.guards.Loaded(selected.checklist)) {
        return { model }
      }
      const localId = board.nextLocalId
      const added = adjustCounts(
        updateSelected(board, selected.cardId, current =>
          modifyFields(
            mapItems(current, items => [
              ...items,
              ChecklistItem.Adding({ localId, text }),
            ]),
            {
              itemInput: () => '',
              maybeItemError: () => Option.none(),
            },
          ),
        ),
        selected.cardId,
        0,
        1,
      )
      return {
        model: setBoard(
          model,
          modifyFields(added, { nextLocalId: () => localId + 1 }),
        ),
        commands: [
          AddItem({
            session: model.session,
            cardId: selected.cardId,
            localId,
            text,
          }),
        ],
      }
    },
  })

const restoreRow = (
  model: Model,
  archive: Archive,
  cardId: number,
): Update.Return<Model, Message> =>
  ArchiveLoad.match<Update.Return<Model, Message>>(archive.load, {
    Loading: () => ({ model }),
    Failed: () => ({ model }),
    Loaded: ({ cards }) =>
      Option.match(
        Array.findFirstIndex(cards, card => card.id === cardId),
        {
          onNone: () => ({ model }),
          onSome: index =>
            Option.match(Array.get(cards, index), {
              onNone: () => ({ model }),
              onSome: archived => ({
                model: setArchive(
                  model,
                  modifyFields(archive, {
                    load: () =>
                      ArchiveLoad.Loaded({
                        cards: Array.filter(cards, card => card.id !== cardId),
                      }),
                    maybeRestoreError: () => Option.none(),
                  }),
                ),
                commands: [
                  RestoreCard({ session: model.session, index, archived }),
                ],
              }),
            }),
        },
      ),
  })

const insertArchived = (
  cards: ReadonlyArray<ArchivedCard>,
  index: number,
  archived: ArchivedCard,
): ReadonlyArray<ArchivedCard> => [
  ...cards.slice(0, index),
  archived,
  ...cards.slice(index),
]

// UPDATE

export const update = (model: Model, message: Message): Update.Return<Model, Message> =>
  Message.match<Update.Return<Model, Message>>(message, {
    ClickedBoardTab: () =>
      Page.guards.BoardPage(model.page) ? { model } : startBoard(model.session + 1),
    ClickedArchiveTab: () =>
      Page.guards.ArchivePage(model.page)
        ? { model }
        : startArchive(model.session + 1),

    SucceededFetchCards: ({ session, column, cards }) =>
      onBoard(model, session, board => ({
        model: setBoard(
          model,
          withColumn(board, column, current => loadedColumn(current, cards)),
        ),
      })),
    FailedFetchCards: ({ session, column, error }) =>
      onBoard(model, session, board => ({
        model: setBoard(
          model,
          setColumnLoad(board, column, ColumnLoad.Failed({ error })),
        ),
      })),
    ClickedRetryColumn: ({ column }) =>
      onBoard(model, model.session, board => ({
        model: setBoard(
          model,
          setColumnLoad(board, column, ColumnLoad.Loading()),
        ),
        commands: [FetchCards({ session: model.session, column })],
      })),

    ClickedMove: ({ cardId, direction }) =>
      onBoard(model, model.session, board =>
        moveSelectedCard(model, board, cardId, direction),
      ),
    SucceededMoveCard: () => ({ model }),
    FailedMoveCard: ({ session, cardId, fromColumn, fromIndex, error }) =>
      onBoard(model, session, board => ({
        model: setBoard(
          model,
          modifyFields(moveCard(board, cardId, fromColumn, fromIndex), {
            maybeMoveError: () => Option.some(`move error: ${error}`),
          }),
        ),
      })),

    ChangedNewCardTitle: ({ value }) =>
      onBoard(model, model.session, board => ({
        model: setBoard(model, modifyFields(board, { newCardTitle: () => value })),
      })),
    SubmittedNewCard: () =>
      onBoard(model, model.session, board => submitCard(model, board)),
    SucceededAddCard: ({ session, localId, cardId }) =>
      onBoard(model, session, board => ({
        model: setBoard(model, resolvePending(board, localId, cardId)),
      })),
    FailedAddCard: ({ session, localId, error }) =>
      onBoard(model, session, board => ({
        model: setBoard(
          model,
          modifyFields(dropPending(board, localId), {
            maybeAddError: () => Option.some(`add error: ${error}`),
          }),
        ),
      })),

    ClickedCard: ({ cardId }) =>
      onBoard(model, model.session, board => selectCard(model, board, cardId)),
    SucceededFetchChecklist: ({ session, cardId, items }) =>
      onBoard(model, session, board => ({
        model: setBoard(
          model,
          updateSelected(board, cardId, selected =>
            modifyFields(selected, {
              checklist: () =>
                Checklist.Loaded({
                  items: Array.map(items, item => ChecklistItem.Saved(item)),
                }),
            }),
          ),
        ),
      })),
    FailedFetchChecklist: ({ session, cardId, error }) =>
      onBoard(model, session, board => ({
        model: setBoard(
          model,
          updateSelected(board, cardId, selected =>
            modifyFields(selected, {
              checklist: () => Checklist.Failed({ error }),
            }),
          ),
        ),
      })),

    ChangedTitleInput: ({ value }) =>
      onBoard(model, model.session, board => ({
        model: setBoard(
          model,
          updateSelection(board, selected =>
            modifyFields(selected, { titleInput: () => value }),
          ),
        ),
      })),
    ClickedRename: () =>
      onBoard(model, model.session, board => renameSelected(model, board)),
    SucceededRenameCard: () => ({ model }),
    FailedRenameCard: ({ session, cardId, previousTitle, error }) =>
      onBoard(model, session, board => ({
        model: setBoard(
          model,
          updateSelected(
            renameCardTitle(board, cardId, previousTitle),
            cardId,
            selected =>
              modifyFields(selected, {
                maybeRenameError: () => Option.some(`rename error: ${error}`),
              }),
          ),
        ),
      })),

    ClickedArchive: () =>
      onBoard(model, model.session, board => archiveSelected(model, board)),
    SucceededArchiveCard: () => ({ model }),
    FailedArchiveCard: ({ session, column, index, card, error }) =>
      onBoard(model, session, board => ({
        model: setBoard(
          model,
          modifyFields(insertCard(board, column, index, card), {
            maybeArchiveError: () => Option.some(`archive error: ${error}`),
          }),
        ),
      })),

    ClickedToggleItem: ({ itemId }) =>
      onBoard(model, model.session, board => toggleItem(model, board, itemId)),
    SucceededToggleItem: () => ({ model }),
    FailedToggleItem: ({ session, cardId, itemId, done, error }) =>
      onBoard(model, session, board => ({
        model: setBoard(
          model,
          updateSelected(
            adjustCounts(
              setItemDone(board, cardId, itemId, !done),
              cardId,
              done ? -1 : 1,
              0,
            ),
            cardId,
            selected =>
              modifyFields(selected, {
                maybeItemError: () => Option.some(`item error: ${error}`),
              }),
          ),
        ),
      })),

    ChangedItemInput: ({ value }) =>
      onBoard(model, model.session, board => ({
        model: setBoard(
          model,
          updateSelection(board, selected =>
            modifyFields(selected, { itemInput: () => value }),
          ),
        ),
      })),
    SubmittedItem: () =>
      onBoard(model, model.session, board => submitItem(model, board)),
    SucceededAddItem: ({ session, cardId, localId, itemId }) =>
      onBoard(model, session, board => ({
        model: setBoard(
          model,
          updateSelected(board, cardId, selected =>
            mapItems(selected, items =>
              Array.map(items, item =>
                ChecklistItem.match<ChecklistItem>(item, {
                  Saved: () => item,
                  Adding: pending =>
                    pending.localId === localId
                      ? ChecklistItem.Saved({
                          id: itemId,
                          text: pending.text,
                          done: false,
                        })
                      : item,
                }),
              ),
            ),
          ),
        ),
      })),
    FailedAddItem: ({ session, cardId, localId, error }) =>
      onBoard(model, session, board => ({
        model: setBoard(
          model,
          adjustCounts(
            updateSelected(board, cardId, selected =>
              modifyFields(
                mapItems(selected, items =>
                  Array.filter(
                    items,
                    item =>
                      !ChecklistItem.guards.Adding(item) ||
                      item.localId !== localId,
                  ),
                ),
                {
                  maybeItemError: () => Option.some(`item error: ${error}`),
                },
              ),
            ),
            cardId,
            0,
            -1,
          ),
        ),
      })),

    SucceededFetchArchived: ({ session, cards }) =>
      onArchive(model, session, archive => ({
        model: setArchive(
          model,
          modifyFields(archive, {
            load: () => ArchiveLoad.Loaded({ cards }),
          }),
        ),
      })),
    FailedFetchArchived: ({ session, error }) =>
      onArchive(model, session, archive => ({
        model: setArchive(
          model,
          modifyFields(archive, {
            load: () => ArchiveLoad.Failed({ error }),
          }),
        ),
      })),
    ClickedRestore: ({ cardId }) =>
      onArchive(model, model.session, archive =>
        restoreRow(model, archive, cardId),
      ),
    SucceededRestoreCard: () => ({ model }),
    FailedRestoreCard: ({ session, index, archived, error }) =>
      onArchive(model, session, archive =>
        ArchiveLoad.match<Update.Return<Model, Message>>(archive.load, {
          Loading: () => ({ model }),
          Failed: () => ({ model }),
          Loaded: ({ cards }) => ({
            model: setArchive(
              model,
              modifyFields(archive, {
                load: () =>
                  ArchiveLoad.Loaded({
                    cards: insertArchived(cards, index, archived),
                  }),
                maybeRestoreError: () =>
                  Option.some(`restore error: ${error}`),
              }),
            ),
          }),
        }),
      ),
  })

export { startBoard, startArchive }
