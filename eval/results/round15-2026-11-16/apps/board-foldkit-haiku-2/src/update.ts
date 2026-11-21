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
  Archived,
  ArchiveData,
  ArchivePage,
  BoardPage,
  Card,
  CardsData,
  CardsState,
  ChecklistData,
  Column,
  Direction,
  Item,
  Model,
  Page,
  columnsInOrder,
} from './model'

type Return = Update.Return<Model, Message>

type Placement = { readonly column: Column; readonly index: number; readonly card: Card }

export type Destination = { readonly column: Column; readonly index: number }

const WIP_LIMIT = 3

const withBoard = (model: Model, board: BoardPage): Model =>
  modifyFields(model, { page: () => Page.Board(board) })

const withArchive = (model: Model, archive: ArchivePage): Model =>
  modifyFields(model, { page: () => Page.Archive(archive) })

const onBoard = (
  model: Model,
  visit: number,
  handle: (board: BoardPage) => Return,
): Return =>
  visit === model.visit
    ? Page.match<Return>(model.page, {
        Board: handle,
        Archive: () => ({ model }),
      })
    : { model }

const onArchive = (
  model: Model,
  visit: number,
  handle: (archive: ArchivePage) => Return,
): Return =>
  visit === model.visit
    ? Page.match<Return>(model.page, {
        Board: () => ({ model }),
        Archive: handle,
      })
    : { model }

const isOnBoard = (model: Model): boolean =>
  Page.match<boolean>(model.page, { Board: () => true, Archive: () => false })

const isOnArchive = (model: Model): boolean => !isOnBoard(model)

export const startBoard = (visit: number, nextLocalId: number): Return => ({
  model: {
    visit,
    nextLocalId,
    page: Page.Board({
      columns: {
        todo: CardsData.Loading(),
        doing: CardsData.Loading(),
        done: CardsData.Loading(),
      },
      selection: Option.none(),
      checklist: ChecklistData.Loading(),
      newCardTitle: '',
      renameTitle: '',
      newItemText: '',
      moveError: Option.none(),
      addError: Option.none(),
      renameError: Option.none(),
      itemError: Option.none(),
      archiveError: Option.none(),
    }),
  },
  commands: [
    FetchCards({ visit, column: 'todo' }),
    FetchCards({ visit, column: 'doing' }),
    FetchCards({ visit, column: 'done' }),
  ],
})

const startArchive = (visit: number, nextLocalId: number): Return => ({
  model: {
    visit,
    nextLocalId,
    page: Page.Archive({
      list: ArchiveData.Loading(),
      restoreError: Option.none(),
    }),
  },
  commands: [FetchArchived({ visit })],
})

const cardsIn = (board: BoardPage, column: Column): ReadonlyArray<Card> =>
  Option.getOrElse(AsyncData.getData(board.columns[column]), () => [])

const isReady = (board: BoardPage, column: Column): boolean =>
  AsyncData.isSuccess(board.columns[column])

const setColumn = (
  board: BoardPage,
  column: Column,
  state: CardsState,
): BoardPage =>
  modifyFields(board, {
    columns: columns => ({ ...columns, [column]: state }),
  })

const setCards = (
  board: BoardPage,
  column: Column,
  cards: ReadonlyArray<Card>,
): BoardPage => setColumn(board, column, CardsData.Success({ data: cards }))

const mapCards = (
  board: BoardPage,
  transform: (cards: ReadonlyArray<Card>) => ReadonlyArray<Card>,
): BoardPage =>
  Array.reduce(columnsInOrder, board, (next, column) =>
    isReady(next, column)
      ? setCards(next, column, transform(cardsIn(next, column)))
      : next,
  )

const replaceCard = (
  board: BoardPage,
  localId: number,
  change: (card: Card) => Card,
): BoardPage =>
  mapCards(board, cards =>
    Array.map(cards, card => (card.localId === localId ? change(card) : card)),
  )

const replaceCardById = (
  board: BoardPage,
  cardId: number,
  change: (card: Card) => Card,
): BoardPage =>
  mapCards(board, cards =>
    Array.map(cards, card =>
      Option.exists(card.maybeId, id => id === cardId) ? change(card) : card,
    ),
  )

const withoutCard = (board: BoardPage, localId: number): BoardPage =>
  mapCards(board, cards => Array.filter(cards, card => card.localId !== localId))

const removeAt = <A>(items: ReadonlyArray<A>, index: number): Array<A> => [
  ...items.slice(0, index),
  ...items.slice(index + 1),
]

const insertAt = <A>(items: ReadonlyArray<A>, index: number, item: A): Array<A> => [
  ...items.slice(0, index),
  item,
  ...items.slice(index),
]

const insertCardAt = (
  board: BoardPage,
  column: Column,
  index: number,
  card: Card,
): BoardPage =>
  isReady(board, column)
    ? setCards(board, column, insertAt(cardsIn(board, column), index, card))
    : board

const placementsOf = (board: BoardPage): ReadonlyArray<Placement> =>
  Array.flatMap(columnsInOrder, column =>
    Array.map(cardsIn(board, column), (card, index) => ({ column, index, card })),
  )

const locate = (board: BoardPage, localId: number): Option.Option<Placement> =>
  Array.findFirst(placementsOf(board), ({ card }) => card.localId === localId)

const selectedPlacement = (board: BoardPage): Option.Option<Placement> =>
  Option.flatMap(board.selection, localId => locate(board, localId))

const selectedCardId = (board: BoardPage): Option.Option<number> =>
  Option.flatMap(selectedPlacement(board), ({ card }) => card.maybeId)

const isSelectedCard = (board: BoardPage, cardId: number): boolean =>
  Option.exists(selectedCardId(board), id => id === cardId)

export const destinationOf = (
  board: BoardPage,
  { column, index }: Placement,
  direction: Direction,
): Option.Option<Destination> => {
  if (direction === 'Up') {
    return index > 0 ? Option.some({ column, index: index - 1 }) : Option.none()
  }
  if (direction === 'Down') {
    return index + 1 < cardsIn(board, column).length
      ? Option.some({ column, index: index + 1 })
      : Option.none()
  }
  const step = direction === 'Left' ? -1 : 1
  const position = columnsInOrder.indexOf(column)
  return Option.map(Array.get(columnsInOrder, position + step), target => ({
    column: target,
    index: cardsIn(board, target).length,
  }))
}

const moveAllowed = (
  board: BoardPage,
  from: Column,
  target: Column,
): boolean => {
  if (!isReady(board, target)) {
    return false
  }
  if (target !== 'doing' || from === 'doing') {
    return true
  }
  return cardsIn(board, 'doing').length < WIP_LIMIT
}

const relocate = (
  board: BoardPage,
  localId: number,
  destination: Destination,
): BoardPage =>
  Option.match(locate(board, localId), {
    onNone: () => board,
    onSome: ({ column, index, card }) => {
      if (!isReady(board, destination.column)) {
        return board
      }
      const removed = setCards(board, column, removeAt(cardsIn(board, column), index))
      return insertCardAt(removed, destination.column, destination.index, card)
    },
  })

const itemsOf = (board: BoardPage): ReadonlyArray<Item> =>
  Option.getOrElse(AsyncData.getData(board.checklist), () => [])

const mapChecklist = (
  board: BoardPage,
  transform: (items: ReadonlyArray<Item>) => ReadonlyArray<Item>,
): BoardPage =>
  modifyFields(board, {
    checklist: checklist =>
      AsyncData.isSuccess(checklist)
        ? ChecklistData.Success({ data: transform(checklist.data) })
        : checklist,
  })

const toCards = (
  serverCards: ReadonlyArray<{ readonly id: number; readonly title: string; readonly done: number; readonly total: number }>,
  firstLocalId: number,
): Array<Card> =>
  Array.map(serverCards, (server, offset) => ({
    localId: firstLocalId + offset,
    maybeId: Option.some(server.id),
    title: server.title,
    done: server.done,
    total: server.total,
  }))

const toItems = (
  serverItems: ReadonlyArray<{ readonly id: number; readonly text: string; readonly done: boolean }>,
  firstLocalId: number,
): Array<Item> =>
  Array.map(serverItems, (server, offset) => ({
    localId: firstLocalId + offset,
    maybeId: Option.some(server.id),
    text: server.text,
    done: server.done,
  }))

const archiveFilter = (
  archive: ArchivePage,
  transform: (items: ReadonlyArray<Archived>) => ReadonlyArray<Archived>,
): ArchivePage =>
  modifyFields(archive, {
    list: list =>
      AsyncData.isSuccess(list)
        ? ArchiveData.Success({ data: transform(list.data) })
        : list,
  })

export const update = (model: Model, message: Message): Return =>
  Message.match<Return>(message, {
    ClickedBoardTab: () =>
      isOnBoard(model)
        ? { model }
        : startBoard(model.visit + 1, model.nextLocalId),
    ClickedArchiveTab: () =>
      isOnArchive(model)
        ? { model }
        : startArchive(model.visit + 1, model.nextLocalId),

    SucceededFetchCards: ({ visit, column, cards }) =>
      onBoard(model, visit, board => ({
        model: modifyFields(
          withBoard(model, setCards(board, column, toCards(cards, model.nextLocalId))),
          { nextLocalId: next => next + cards.length },
        ),
      })),
    FailedFetchCards: ({ visit, column, error }) =>
      onBoard(model, visit, board => ({
        model: withBoard(
          model,
          setColumn(board, column, CardsData.Failure({ error })),
        ),
      })),
    ClickedRetryColumn: ({ column }) =>
      onBoard(model, model.visit, board => ({
        model: withBoard(model, setColumn(board, column, CardsData.Loading())),
        commands: [FetchCards({ visit: model.visit, column })],
      })),

    ClickedMoveCard: ({ localId, direction }) =>
      onBoard(model, model.visit, board => {
        const maybeMove = Option.flatMap(locate(board, localId), placement =>
          Option.flatMap(destinationOf(board, placement, direction), destination =>
            Option.flatMap(placement.card.maybeId, id =>
              moveAllowed(board, placement.column, destination.column)
                ? Option.some({ placement, destination, id })
                : Option.none(),
            ),
          ),
        )
        return Option.match(maybeMove, {
          onNone: () => ({ model }),
          onSome: ({ placement, destination, id }) => ({
            model: withBoard(
              model,
              modifyFields(relocate(board, localId, destination), {
                moveError: () => Option.none(),
              }),
            ),
            commands: [
              MoveCard({
                visit: model.visit,
                localId,
                id,
                column: destination.column,
                index: destination.index,
                fromColumn: placement.column,
                fromIndex: placement.index,
              }),
            ],
          }),
        })
      }),
    SucceededMoveCard: () => ({ model }),
    FailedMoveCard: ({ visit, localId, fromColumn, fromIndex, error }) =>
      onBoard(model, visit, board => ({
        model: withBoard(
          model,
          modifyFields(
            relocate(board, localId, { column: fromColumn, index: fromIndex }),
            { moveError: () => Option.some(`move error: ${error}`) },
          ),
        ),
      })),

    ClickedCard: ({ localId }) =>
      onBoard(model, model.visit, board =>
        Option.exists(board.selection, id => id === localId)
          ? { model }
          : Option.match(
              Option.flatMap(locate(board, localId), ({ card }) => card.maybeId),
              {
                onNone: () => ({ model }),
                onSome: cardId => ({
                  model: withBoard(
                    model,
                    modifyFields(board, {
                      selection: () => Option.some(localId),
                      checklist: () => ChecklistData.Loading(),
                      renameTitle: () => '',
                      renameError: () => Option.none(),
                      itemError: () => Option.none(),
                    }),
                  ),
                  commands: [FetchChecklist({ visit: model.visit, cardId })],
                }),
              },
            ),
      ),

    ChangedNewCardTitle: ({ value }) =>
      onBoard(model, model.visit, board => ({
        model: withBoard(model, modifyFields(board, { newCardTitle: () => value })),
      })),
    SubmittedNewCard: () =>
      onBoard(model, model.visit, board => {
        const title = board.newCardTitle.trim()
        if (title === '' || !isReady(board, 'todo')) {
          return { model }
        }
        const localId = model.nextLocalId
        const card: Card = {
          localId,
          maybeId: Option.none(),
          title,
          done: 0,
          total: 0,
        }
        const added = setCards(board, 'todo', Array.append(cardsIn(board, 'todo'), card))
        return {
          model: modifyFields(
            withBoard(
              model,
              modifyFields(added, {
                newCardTitle: () => '',
                addError: () => Option.none(),
              }),
            ),
            { nextLocalId: next => next + 1 },
          ),
          commands: [AddCard({ visit: model.visit, localId, title })],
        }
      }),
    SucceededAddCard: ({ visit, localId, id }) =>
      onBoard(model, visit, board => ({
        model: withBoard(
          model,
          replaceCard(board, localId, card =>
            modifyFields(card, { maybeId: () => Option.some(id) }),
          ),
        ),
      })),
    FailedAddCard: ({ visit, localId, error }) =>
      onBoard(model, visit, board => ({
        model: withBoard(
          model,
          modifyFields(withoutCard(board, localId), {
            addError: () => Option.some(`add error: ${error}`),
          }),
        ),
      })),

    ChangedRenameTitle: ({ value }) =>
      onBoard(model, model.visit, board => ({
        model: withBoard(model, modifyFields(board, { renameTitle: () => value })),
      })),
    SubmittedRename: () =>
      onBoard(model, model.visit, board => {
        const title = board.renameTitle.trim()
        const maybeTarget = Option.flatMap(selectedPlacement(board), ({ card }) =>
          Option.map(card.maybeId, id => ({
            localId: card.localId,
            id,
            previousTitle: card.title,
          })),
        )
        if (title === '') {
          return { model }
        }
        return Option.match(maybeTarget, {
          onNone: () => ({ model }),
          onSome: ({ localId, id, previousTitle }) => ({
            model: withBoard(
              model,
              modifyFields(
                replaceCard(board, localId, card =>
                  modifyFields(card, { title: () => title }),
                ),
                { renameError: () => Option.none() },
              ),
            ),
            commands: [
              RenameCard({ visit: model.visit, localId, id, title, previousTitle }),
            ],
          }),
        })
      }),
    SucceededRenameCard: () => ({ model }),
    FailedRenameCard: ({ visit, localId, previousTitle, error }) =>
      onBoard(model, visit, board => {
        const reverted = replaceCard(board, localId, card =>
          modifyFields(card, { title: () => previousTitle }),
        )
        const isSelected = Option.exists(board.selection, id => id === localId)
        return {
          model: withBoard(
            model,
            modifyFields(reverted, {
              renameError: () =>
                isSelected ? Option.some(`rename error: ${error}`) : board.renameError,
            }),
          ),
        }
      }),

    ClickedArchiveCard: () =>
      onBoard(model, model.visit, board =>
        Option.match(
          Option.flatMap(selectedPlacement(board), placement =>
            Option.map(placement.card.maybeId, id => ({ placement, id })),
          ),
          {
            onNone: () => ({ model }),
            onSome: ({ placement, id }) => ({
              model: withBoard(
                model,
                modifyFields(withoutCard(board, placement.card.localId), {
                  selection: () => Option.none(),
                  checklist: () => ChecklistData.Loading(),
                  renameError: () => Option.none(),
                  itemError: () => Option.none(),
                  archiveError: () => Option.none(),
                }),
              ),
              commands: [
                ArchiveCard({
                  visit: model.visit,
                  id,
                  card: placement.card,
                  column: placement.column,
                  index: placement.index,
                }),
              ],
            }),
          },
        ),
      ),
    SucceededArchiveCard: () => ({ model }),
    FailedArchiveCard: ({ visit, card, column, index, error }) =>
      onBoard(model, visit, board => ({
        model: withBoard(
          model,
          modifyFields(insertCardAt(board, column, index, card), {
            archiveError: () => Option.some(`archive error: ${error}`),
          }),
        ),
      })),

    SucceededFetchChecklist: ({ visit, cardId, items }) =>
      onBoard(model, visit, board =>
        isSelectedCard(board, cardId)
          ? {
              model: modifyFields(
                withBoard(
                  model,
                  modifyFields(board, {
                    checklist: () =>
                      ChecklistData.Success({ data: toItems(items, model.nextLocalId) }),
                  }),
                ),
                { nextLocalId: next => next + items.length },
              ),
            }
          : { model },
      ),
    FailedFetchChecklist: ({ visit, cardId, error }) =>
      onBoard(model, visit, board =>
        isSelectedCard(board, cardId)
          ? {
              model: withBoard(
                model,
                modifyFields(board, {
                  checklist: () => ChecklistData.Failure({ error }),
                }),
              ),
            }
          : { model },
      ),

    ClickedToggleItem: ({ localId: itemLocalId }) =>
      onBoard(model, model.visit, board => {
        const maybeToggle = Option.flatMap(selectedCardId(board), cardId =>
          Option.flatMap(
            Array.findFirst(itemsOf(board), item => item.localId === itemLocalId),
            item =>
              Option.map(item.maybeId, itemId => ({
                cardId,
                itemId,
                done: !item.done,
              })),
          ),
        )
        return Option.match(maybeToggle, {
          onNone: () => ({ model }),
          onSome: ({ cardId, itemId, done }) => {
            const toggled = mapChecklist(board, items =>
              Array.map(items, item =>
                item.localId === itemLocalId
                  ? modifyFields(item, { done: () => done })
                  : item,
              ),
            )
            const counted = replaceCardById(toggled, cardId, card =>
              modifyFields(card, { done: count => count + (done ? 1 : -1) }),
            )
            return {
              model: withBoard(
                model,
                modifyFields(counted, { itemError: () => Option.none() }),
              ),
              commands: [
                ToggleItem({ visit: model.visit, cardId, itemLocalId, itemId, done }),
              ],
            }
          },
        })
      }),
    SucceededToggleItem: () => ({ model }),
    FailedToggleItem: ({ visit, cardId, itemLocalId, done, error }) =>
      onBoard(model, visit, board => {
        const counted = replaceCardById(board, cardId, card =>
          modifyFields(card, { done: count => count + (done ? -1 : 1) }),
        )
        const isSelected = isSelectedCard(board, cardId)
        const reverted = isSelected
          ? mapChecklist(counted, items =>
              Array.map(items, item =>
                item.localId === itemLocalId
                  ? modifyFields(item, { done: () => !done })
                  : item,
              ),
            )
          : counted
        return {
          model: withBoard(
            model,
            modifyFields(reverted, {
              itemError: () =>
                isSelected ? Option.some(`item error: ${error}`) : board.itemError,
            }),
          ),
        }
      }),

    ChangedNewItemText: ({ value }) =>
      onBoard(model, model.visit, board => ({
        model: withBoard(model, modifyFields(board, { newItemText: () => value })),
      })),
    SubmittedNewItem: () =>
      onBoard(model, model.visit, board => {
        const text = board.newItemText.trim()
        const maybeCardId = selectedCardId(board)
        if (text === '' || !AsyncData.isSuccess(board.checklist)) {
          return { model }
        }
        return Option.match(maybeCardId, {
          onNone: () => ({ model }),
          onSome: cardId => {
            const itemLocalId = model.nextLocalId
            const item: Item = {
              localId: itemLocalId,
              maybeId: Option.none(),
              text,
              done: false,
            }
            const appended = mapChecklist(board, items => Array.append(items, item))
            const counted = replaceCardById(appended, cardId, card =>
              modifyFields(card, { total: count => count + 1 }),
            )
            return {
              model: modifyFields(
                withBoard(
                  model,
                  modifyFields(counted, {
                    newItemText: () => '',
                    itemError: () => Option.none(),
                  }),
                ),
                { nextLocalId: next => next + 1 },
              ),
              commands: [AddItem({ visit: model.visit, cardId, itemLocalId, text })],
            }
          },
        })
      }),
    SucceededAddItem: ({ visit, cardId, itemLocalId, id }) =>
      onBoard(model, visit, board =>
        isSelectedCard(board, cardId)
          ? {
              model: withBoard(
                model,
                mapChecklist(board, items =>
                  Array.map(items, item =>
                    item.localId === itemLocalId
                      ? modifyFields(item, { maybeId: () => Option.some(id) })
                      : item,
                  ),
                ),
              ),
            }
          : { model },
      ),
    FailedAddItem: ({ visit, cardId, itemLocalId, error }) =>
      onBoard(model, visit, board => {
        const uncounted = replaceCardById(board, cardId, card =>
          modifyFields(card, { total: count => count - 1 }),
        )
        const isSelected = isSelectedCard(board, cardId)
        const removed = isSelected
          ? mapChecklist(uncounted, items =>
              Array.filter(items, item => item.localId !== itemLocalId),
            )
          : uncounted
        return {
          model: withBoard(
            model,
            modifyFields(removed, {
              itemError: () =>
                isSelected ? Option.some(`item error: ${error}`) : board.itemError,
            }),
          ),
        }
      }),

    SucceededFetchArchived: ({ visit, items }) =>
      onArchive(model, visit, archive => ({
        model: withArchive(
          model,
          modifyFields(archive, {
            list: () => ArchiveData.Success({ data: items }),
          }),
        ),
      })),
    FailedFetchArchived: ({ visit, error }) =>
      onArchive(model, visit, archive => ({
        model: withArchive(
          model,
          modifyFields(archive, { list: () => ArchiveData.Failure({ error }) }),
        ),
      })),
    ClickedRestore: ({ id }) =>
      onArchive(model, model.visit, archive =>
        Option.match(AsyncData.getData(archive.list), {
          onNone: () => ({ model }),
          onSome: list => {
            const index = list.findIndex(item => item.id === id)
            return Option.match(Array.get(list, index), {
              onNone: () => ({ model }),
              onSome: item => ({
                model: withArchive(
                  model,
                  modifyFields(
                    archiveFilter(archive, items => removeAt(items, index)),
                    { restoreError: () => Option.none() },
                  ),
                ),
                commands: [RestoreCard({ visit: model.visit, item, index })],
              }),
            })
          },
        }),
      ),
    SucceededRestoreCard: () => ({ model }),
    FailedRestoreCard: ({ visit, item, index, error }) =>
      onArchive(model, visit, archive => ({
        model: withArchive(
          model,
          modifyFields(
            archiveFilter(archive, items => insertAt(items, index, item)),
            { restoreError: () => Option.some(`restore error: ${error}`) },
          ),
        ),
      })),
  })
