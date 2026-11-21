import { Option } from 'effect'
import { Runtime, type Update } from 'foldkit'
import { modifyFields } from 'foldkit/struct'

import * as Board from './board'
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
  Archived,
  ArchivedLoad,
  ArchivePage,
  BoardCard,
  BoardPage,
  ChecklistItem,
  ChecklistLoad,
  ColumnLoad,
  Model,
  Page,
} from './model'

export { Message } from './message'
export { Model } from './model'
export { view } from './view'

// INIT

const freshBoard: BoardPage = {
  columns: {
    todo: ColumnLoad.Loading(),
    doing: ColumnLoad.Loading(),
    done: ColumnLoad.Loading(),
  },
  maybeSelectedId: Option.none(),
  checklist: ChecklistLoad.Idle(),
  newCardTitle: '',
  titleInput: '',
  itemInput: '',
  maybeMoveError: Option.none(),
  maybeAddError: Option.none(),
  maybeArchiveError: Option.none(),
  maybeRenameError: Option.none(),
  maybeItemError: Option.none(),
}

const loadBoardCommands = (session: number) =>
  Board.columns.map(column => FetchCards({ session, column }))

export const init: Runtime.ApplicationInit<Model, Message> = () => ({
  model: { session: 1, nextKey: 1, page: Page.Board({ board: freshBoard }) },
  commands: loadBoardCommands(1),
})

// UPDATE

const withBoard = (model: Model, board: BoardPage): Model =>
  modifyFields(model, { page: () => Page.Board({ board }) })

const withArchive = (model: Model, archive: ArchivePage): Model =>
  modifyFields(model, { page: () => Page.Archive({ archive }) })

const onBoard = (
  model: Model,
  handle: (board: BoardPage) => Update.Return<Model, Message>,
): Update.Return<Model, Message> =>
  Page.matchOrElse(model.page, { Board: ({ board }) => handle(board) }, () => ({
    model,
  }))

const onBoardWith = (
  model: Model,
  change: (board: BoardPage) => BoardPage,
): Update.Return<Model, Message> =>
  onBoard(model, board => ({ model: withBoard(model, change(board)) }))

const onArchive = (
  model: Model,
  handle: (archive: ArchivePage) => Update.Return<Model, Message>,
): Update.Return<Model, Message> =>
  Page.matchOrElse(
    model.page,
    { Archive: ({ archive }) => handle(archive) },
    () => ({ model }),
  )

const onArchiveWith = (
  model: Model,
  change: (archive: ArchivePage) => ArchivePage,
): Update.Return<Model, Message> =>
  onArchive(model, archive => ({ model: withArchive(model, change(archive)) }))

const whenCurrent = (
  model: Model,
  session: number,
  handle: () => Update.Return<Model, Message>,
): Update.Return<Model, Message> => (session === model.session ? handle() : { model })

const startBoard = (model: Model): Update.Return<Model, Message> => {
  const session = model.session + 1
  return {
    model: modifyFields(model, {
      session: () => session,
      page: () => Page.Board({ board: freshBoard }),
    }),
    commands: loadBoardCommands(session),
  }
}

const startArchive = (model: Model): Update.Return<Model, Message> => {
  const session = model.session + 1
  return {
    model: modifyFields(model, {
      session: () => session,
      page: () =>
        Page.Archive({
          archive: {
            archived: ArchivedLoad.Loading(),
            maybeRestoreError: Option.none(),
          },
        }),
    }),
    commands: [FetchArchived({ session })],
  }
}

const restoreRow = (
  model: Model,
  archive: ArchivePage,
  cards: ReadonlyArray<Archived>,
  id: number,
): Update.Return<Model, Message> => {
  const index = cards.findIndex(card => card.id === id)
  return Option.match(Option.fromNullishOr(cards[index]), {
    onNone: () => ({ model }),
    onSome: archived => ({
      model: withArchive(
        model,
        modifyFields(archive, {
          archived: () =>
            ArchivedLoad.Loaded({ cards: cards.filter(card => card.id !== id) }),
          maybeRestoreError: () => Option.none(),
        }),
      ),
      commands: [RestoreCard({ session: model.session, archived, index })],
    }),
  })
}

export const update = (model: Model, message: Message): Update.Return<Model, Message> =>
  Message.match<Update.Return<Model, Message>>(message, {
    ClickedBoardTab: () => (Page.guards.Board(model.page) ? { model } : startBoard(model)),
    ClickedArchiveTab: () =>
      Page.guards.Archive(model.page) ? { model } : startArchive(model),

    SucceededFetchCards: ({ session, column, cards }) =>
      whenCurrent(model, session, () =>
        onBoardWith(model, board =>
          Board.setLoad(
            board,
            column,
            ColumnLoad.Loaded({ cards: cards.map(card => BoardCard.Saved(card)) }),
          ),
        ),
      ),
    FailedFetchCards: ({ session, column, error }) =>
      whenCurrent(model, session, () =>
        onBoardWith(model, board =>
          Board.setLoad(board, column, ColumnLoad.Failed({ error })),
        ),
      ),
    ClickedRetryColumn: ({ column }) =>
      onBoard(model, board =>
        ColumnLoad.guards.Failed(board.columns[column])
          ? {
              model: withBoard(model, Board.setLoad(board, column, ColumnLoad.Loading())),
              commands: [FetchCards({ session: model.session, column })],
            }
          : { model },
      ),

    ClickedMoveCard: ({ id, direction }) =>
      onBoard(model, board =>
        Option.match(Board.movePlan(board, id, direction), {
          onNone: () => ({ model }),
          onSome: ({ from, target, blocked }) =>
            blocked
              ? { model }
              : {
                  model: withBoard(
                    model,
                    modifyFields(Board.moveCardTo(board, from, target), {
                      maybeMoveError: () => Option.none(),
                    }),
                  ),
                  commands: [
                    MoveCard({
                      session: model.session,
                      id,
                      column: target.column,
                      index: target.index,
                      fromColumn: from.column,
                      fromIndex: from.index,
                    }),
                  ],
                },
        }),
      ),
    SucceededMoveCard: () => ({ model }),
    FailedMoveCard: ({ session, id, fromColumn, fromIndex, error }) =>
      whenCurrent(model, session, () =>
        onBoardWith(model, board =>
          modifyFields(Board.returnCard(board, id, fromColumn, fromIndex), {
            maybeMoveError: () => Option.some(error),
          }),
        ),
      ),

    UpdatedNewCardTitle: ({ value }) =>
      onBoardWith(model, board => modifyFields(board, { newCardTitle: () => value })),
    ClickedAddCard: () =>
      onBoard(model, board => {
        const title = board.newCardTitle.trim()
        if (title === '' || !Board.isLoaded(board, 'todo')) {
          return { model }
        }
        const key = model.nextKey
        const nextBoard = modifyFields(
          Board.appendCard(board, 'todo', BoardCard.Adding({ key, title })),
          { newCardTitle: () => '', maybeAddError: () => Option.none() },
        )
        return {
          model: modifyFields(withBoard(model, nextBoard), {
            nextKey: () => key + 1,
          }),
          commands: [AddCard({ session: model.session, key, title })],
        }
      }),
    SucceededAddCard: ({ session, key, card }) =>
      whenCurrent(model, session, () =>
        onBoardWith(model, board => Board.replaceAdding(board, 'todo', key, card)),
      ),
    FailedAddCard: ({ session, key, error }) =>
      whenCurrent(model, session, () =>
        onBoardWith(model, board =>
          modifyFields(Board.removeAdding(board, 'todo', key), {
            maybeAddError: () => Option.some(error),
          }),
        ),
      ),

    ClickedCard: ({ id }) =>
      onBoard(model, board => ({
        model: withBoard(model, Board.select(board, id)),
        commands: [FetchChecklist({ session: model.session, cardId: id })],
      })),
    UpdatedTitleInput: ({ value }) =>
      onBoardWith(model, board => modifyFields(board, { titleInput: () => value })),
    ClickedRename: () =>
      onBoard(model, board =>
        Option.match(Board.selectedLocation(board), {
          onNone: () => ({ model }),
          onSome: ({ card }) => {
            const title = board.titleInput.trim()
            if (title === '') {
              return { model }
            }
            return {
              model: withBoard(
                model,
                modifyFields(Board.renameCard(board, card.id, title), {
                  maybeRenameError: () => Option.none(),
                }),
              ),
              commands: [
                RenameCard({
                  session: model.session,
                  id: card.id,
                  title,
                  previousTitle: card.title,
                }),
              ],
            }
          },
        }),
      ),
    SucceededRenameCard: () => ({ model }),
    FailedRenameCard: ({ session, id, previousTitle, error }) =>
      whenCurrent(model, session, () =>
        onBoardWith(model, board =>
          modifyFields(Board.renameCard(board, id, previousTitle), {
            maybeRenameError: () =>
              Board.isSelected(board, id) ? Option.some(error) : board.maybeRenameError,
          }),
        ),
      ),

    ClickedArchive: () =>
      onBoard(model, board =>
        Option.match(Board.selectedLocation(board), {
          onNone: () => ({ model }),
          onSome: location => ({
            model: withBoard(
              model,
              modifyFields(Board.removeSaved(Board.deselect(board), location.card.id), {
                maybeArchiveError: () => Option.none(),
              }),
            ),
            commands: [
              ArchiveCard({
                session: model.session,
                card: location.card,
                column: location.column,
                index: location.index,
              }),
            ],
          }),
        }),
      ),
    SucceededArchiveCard: () => ({ model }),
    FailedArchiveCard: ({ session, card, column, index, error }) =>
      whenCurrent(model, session, () =>
        onBoardWith(model, board =>
          modifyFields(Board.insertSaved(board, column, index, card), {
            maybeArchiveError: () => Option.some(error),
          }),
        ),
      ),

    SucceededFetchChecklist: ({ session, cardId, items }) =>
      whenCurrent(model, session, () =>
        onBoardWith(model, board =>
          Board.isSelected(board, cardId)
            ? Board.setChecklist(
                board,
                ChecklistLoad.Loaded({
                  items: items.map(item => ChecklistItem.Saved(item)),
                }),
              )
            : board,
        ),
      ),
    FailedFetchChecklist: ({ session, cardId, error }) =>
      whenCurrent(model, session, () =>
        onBoardWith(model, board =>
          Board.isSelected(board, cardId)
            ? Board.setChecklist(board, ChecklistLoad.Failed({ error }))
            : board,
        ),
      ),
    ClickedToggleItem: ({ itemId }) =>
      onBoard(model, board =>
        Option.match(board.maybeSelectedId, {
          onNone: () => ({ model }),
          onSome: cardId =>
            Option.match(Board.itemDone(board, itemId), {
              onNone: () => ({ model }),
              onSome: previousDone => ({
                model: withBoard(
                  model,
                  modifyFields(
                    Board.adjustCounts(
                      Board.setItemDone(board, itemId, !previousDone),
                      cardId,
                      previousDone ? -1 : 1,
                      0,
                    ),
                    { maybeItemError: () => Option.none() },
                  ),
                ),
                commands: [
                  ToggleItem({
                    session: model.session,
                    cardId,
                    itemId,
                    done: !previousDone,
                    previousDone,
                  }),
                ],
              }),
            }),
        }),
      ),
    SucceededToggleItem: () => ({ model }),
    FailedToggleItem: ({ session, cardId, itemId, previousDone, error }) =>
      whenCurrent(model, session, () =>
        onBoardWith(model, board => {
          const selected = Board.isSelected(board, cardId)
          const reverted = selected
            ? Board.setItemDone(board, itemId, previousDone)
            : board
          return modifyFields(
            Board.adjustCounts(reverted, cardId, previousDone ? 1 : -1, 0),
            {
              maybeItemError: () =>
                selected ? Option.some(error) : board.maybeItemError,
            },
          )
        }),
      ),
    UpdatedItemInput: ({ value }) =>
      onBoardWith(model, board => modifyFields(board, { itemInput: () => value })),
    ClickedAddItem: () =>
      onBoard(model, board =>
        Option.match(board.maybeSelectedId, {
          onNone: () => ({ model }),
          onSome: cardId => {
            const text = board.itemInput.trim()
            if (text === '' || !ChecklistLoad.guards.Loaded(board.checklist)) {
              return { model }
            }
            const key = model.nextKey
            const nextBoard = modifyFields(
              Board.adjustCounts(
                Board.appendChecklistItem(board, ChecklistItem.Adding({ key, text })),
                cardId,
                0,
                1,
              ),
              { itemInput: () => '', maybeItemError: () => Option.none() },
            )
            return {
              model: modifyFields(withBoard(model, nextBoard), {
                nextKey: () => key + 1,
              }),
              commands: [AddItem({ session: model.session, cardId, key, text })],
            }
          },
        }),
      ),
    SucceededAddItem: ({ session, cardId, key, item }) =>
      whenCurrent(model, session, () =>
        onBoardWith(model, board =>
          Board.isSelected(board, cardId)
            ? Board.replaceChecklistAdding(board, key, item)
            : board,
        ),
      ),
    FailedAddItem: ({ session, cardId, key, error }) =>
      whenCurrent(model, session, () =>
        onBoardWith(model, board => {
          const selected = Board.isSelected(board, cardId)
          const withoutItem = selected
            ? Board.removeChecklistAdding(board, key)
            : board
          return modifyFields(Board.adjustCounts(withoutItem, cardId, 0, -1), {
            maybeItemError: () =>
              selected ? Option.some(error) : board.maybeItemError,
          })
        }),
      ),

    SucceededFetchArchived: ({ session, cards }) =>
      whenCurrent(model, session, () =>
        onArchiveWith(model, archive =>
          modifyFields(archive, {
            archived: () => ArchivedLoad.Loaded({ cards }),
          }),
        ),
      ),
    FailedFetchArchived: ({ session, error }) =>
      whenCurrent(model, session, () =>
        onArchiveWith(model, archive =>
          modifyFields(archive, { archived: () => ArchivedLoad.Failed({ error }) }),
        ),
      ),
    ClickedRestore: ({ id }) =>
      onArchive(model, archive =>
        ArchivedLoad.matchOrElse(
          archive.archived,
          { Loaded: ({ cards }) => restoreRow(model, archive, cards, id) },
          () => ({ model }),
        ),
      ),
    SucceededRestoreCard: () => ({ model }),
    FailedRestoreCard: ({ session, archived, index, error }) =>
      whenCurrent(model, session, () =>
        onArchiveWith(model, archive =>
          modifyFields(archive, {
            archived: () =>
              ArchivedLoad.matchOrElse(
                archive.archived,
                {
                  Loaded: ({ cards }) =>
                    ArchivedLoad.Loaded({
                      cards: Board.insertAt(cards, index, archived),
                    }),
                },
                () => archive.archived,
              ),
            maybeRestoreError: () => Option.some(error),
          }),
        ),
      ),
  })
