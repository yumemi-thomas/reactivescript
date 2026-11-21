import { Array, Option, pipe } from 'effect'
import { Submodel } from 'foldkit'
import type { Html, HtmlBuilder } from 'foldkit/html'

import { type Direction, Message } from './message'
import {
  COLUMN_IDS,
  COLUMN_NAMES,
  type Card,
  ChecklistLoad,
  type ColumnId,
  ColumnLoad,
  Detail,
  Entry,
  ItemEntry,
  type Model,
  type Selection,
  type ShownBoard,
  isDoingFull,
  locateCard,
  shownBoard,
  shownCount,
  shownItems,
} from './model'
import { MoveAvailability, moveAvailability } from './update'

type H = HtmlBuilder<Message>

const DIRECTIONS: ReadonlyArray<{
  direction: Direction
  symbol: string
  label: string
}> = [
  { direction: 'left', symbol: '←', label: 'Move left' },
  { direction: 'right', symbol: '→', label: 'Move right' },
  { direction: 'up', symbol: '↑', label: 'Move up' },
  { direction: 'down', symbol: '↓', label: 'Move down' },
]

const cardText = (card: Card): string =>
  `#${card.id} ${card.title} · ${card.done}/${card.total}`

const errorLine = (
  testId: string,
  prefix: string,
  maybeError: Option.Option<string>,
  h: H,
): Html =>
  Option.match(maybeError, {
    onNone: () => h.empty,
    onSome: error =>
      h.p(
        [h.DataAttribute('testid', testId), h.Class('error'), h.Role('alert')],
        [`${prefix}: ${error}`],
      ),
  })

// CARDS

const moveButton = (
  card: Card,
  availability: MoveAvailability,
  config: (typeof DIRECTIONS)[number],
  h: H,
): Html =>
  MoveAvailability.match(availability, {
    NoMove: () => h.empty,
    BlockedMove: () => moveButtonElement(card, config, true, h),
    AllowedMove: () => moveButtonElement(card, config, false, h),
  })

const moveButtonElement = (
  card: Card,
  { direction, symbol, label }: (typeof DIRECTIONS)[number],
  isDisabled: boolean,
  h: H,
): Html =>
  h.button(
    [
      h.Type('button'),
      h.DataAttribute('testid', direction),
      h.Class('move'),
      h.AriaLabel(`${label}: #${card.id} ${card.title}`),
      h.Disabled(isDisabled),
      h.OnClick(Message.ClickedMove({ cardId: card.id, direction })),
    ],
    [symbol],
  )

const savedCardRow = (
  board: ShownBoard,
  column: ColumnId,
  index: number,
  card: Card,
  isSelected: boolean,
  h: H,
): Html =>
  h.keyed('li')(
    `card-${card.id}`,
    [h.Class(isSelected ? 'card-row selected' : 'card-row')],
    [
      h.button(
        [
          h.Type('button'),
          h.DataAttribute('testid', 'card'),
          h.Class('card'),
          h.AriaPressed(isSelected ? 'true' : 'false'),
          h.OnClick(Message.ClickedCard({ cardId: card.id })),
        ],
        [cardText(card)],
      ),
      h.div(
        [h.Class('moves')],
        Array.map(DIRECTIONS, config =>
          moveButton(
            card,
            moveAvailability(board, { column, index, card }, config.direction),
            config,
            h,
          ),
        ),
      ),
    ],
  )

const addingCardRow = (opId: number, title: string, h: H): Html =>
  h.keyed('li')(
    `adding-${opId}`,
    [h.Class('card-row pending')],
    [
      h.div(
        [h.DataAttribute('testid', 'card'), h.Class('card')],
        [`${title} (adding…)`],
      ),
    ],
  )

const cardList = (
  board: ShownBoard,
  column: ColumnId,
  entries: ReadonlyArray<Entry>,
  maybeSelectedId: Option.Option<number>,
  h: H,
): Html =>
  h.ul(
    [h.Class('cards')],
    Array.map(entries, (entry, index) =>
      Entry.match(entry, {
        SavedEntry: ({ card }) =>
          savedCardRow(
            board,
            column,
            index,
            card,
            Option.contains(maybeSelectedId, card.id),
            h,
          ),
        AddingEntry: ({ opId, title }) => addingCardRow(opId, title, h),
      }),
    ),
  )

// COLUMNS

const columnHeading = (
  board: ShownBoard,
  column: ColumnId,
  h: H,
): Html =>
  h.h2(
    [h.DataAttribute('testid', `head-${column}`)],
    [
      Option.match(board[column], {
        onNone: () => COLUMN_NAMES[column],
        onSome: () => `${COLUMN_NAMES[column]} (${shownCount(board, column)})`,
      }),
    ],
  )

const addCardForm = (model: Model, board: ShownBoard, h: H): Html =>
  h.div(
    [h.Class('add-card')],
    [
      h.form(
        [h.Class('inline-form'), h.OnSubmit(Message.ClickedAddCard())],
        [
          h.input([
            h.Type('text'),
            h.DataAttribute('testid', 'new-card'),
            h.AriaLabel('New card title'),
            h.Placeholder('New card'),
            h.Value(model.newCardInput),
            h.OnInput(value => Message.UpdatedNewCardInput({ value })),
          ]),
          h.button(
            [
              h.Type('submit'),
              h.DataAttribute('testid', 'add-card'),
              h.Disabled(Option.isNone(board.todo)),
            ],
            ['Add card'],
          ),
        ],
      ),
      errorLine('add-error', 'add error', model.maybeAddError, h),
    ],
  )

const columnView = (
  model: Model,
  board: ShownBoard,
  column: ColumnId,
  maybeSelectedId: Option.Option<number>,
  h: H,
): Html =>
  h.section(
    [h.DataAttribute('testid', `col-${column}`), h.Class('column')],
    [
      columnHeading(board, column, h),
      ColumnLoad.match(model.columns[column], {
        ColumnLoading: () => h.p([h.Class('status')], ['loading']),
        ColumnFailed: ({ error }) =>
          h.div(
            [h.Class('status')],
            [
              h.p([h.Class('error'), h.Role('alert')], [`error: ${error}`]),
              h.button(
                [
                  h.Type('button'),
                  h.DataAttribute('testid', `retry-${column}`),
                  h.OnClick(Message.ClickedRetryColumn({ column })),
                ],
                ['Retry'],
              ),
            ],
          ),
        ColumnLoaded: () =>
          Option.match(board[column], {
            onNone: () => h.empty,
            onSome: entries =>
              cardList(board, column, entries, maybeSelectedId, h),
          }),
      }),
      column === 'todo' ? addCardForm(model, board, h) : h.empty,
    ],
  )

// DETAIL

const checklistView = (
  selection: Selection,
  h: H,
): Html =>
  h.div(
    [h.DataAttribute('testid', 'checklist'), h.Class('checklist')],
    [
      ChecklistLoad.match(selection.checklist, {
        ChecklistLoading: () => h.p([h.Class('status')], ['loading checklist']),
        ChecklistFailed: ({ error }) =>
          h.p([h.Class('error'), h.Role('alert')], [`checklist error: ${error}`]),
        ChecklistLoaded: ({ items }) => {
          const entries = shownItems(items, selection.itemOps)
          const doneCount = Array.length(
            Array.filter(
              entries,
              entry => entry._tag === 'SavedItem' && entry.item.done,
            ),
          )
          return h.div(
            [],
            [
              h.ul(
                [h.Class('items')],
                Array.map(entries, entry =>
                  ItemEntry.match(entry, {
                    SavedItem: ({ item }) =>
                      h.keyed('li')(
                        `item-${item.id}`,
                        [h.Class('item-row')],
                        [
                          h.span(
                            [h.DataAttribute('testid', 'item')],
                            [`${item.done ? '[x]' : '[ ]'} ${item.text}`],
                          ),
                          h.button(
                            [
                              h.Type('button'),
                              h.DataAttribute('testid', 'toggle'),
                              h.AriaLabel(
                                `Mark ${item.text} ${item.done ? 'not done' : 'done'}`,
                              ),
                              h.OnClick(
                                Message.ClickedToggleItem({ itemId: item.id }),
                              ),
                            ],
                            ['Toggle'],
                          ),
                        ],
                      ),
                    AddingItem: ({ opId, text }) =>
                      h.keyed('li')(
                        `adding-item-${opId}`,
                        [h.Class('item-row pending')],
                        [
                          h.span(
                            [h.DataAttribute('testid', 'item')],
                            [`[ ] ${text} (adding…)`],
                          ),
                        ],
                      ),
                  }),
                ),
              ),
              h.p(
                [h.DataAttribute('testid', 'progress')],
                [`${doneCount}/${entries.length} done`],
              ),
            ],
          )
        },
      }),
      h.form(
        [h.Class('inline-form'), h.OnSubmit(Message.ClickedAddItem())],
        [
          h.input([
            h.Type('text'),
            h.DataAttribute('testid', 'item-input'),
            h.AriaLabel('New checklist item'),
            h.Placeholder('New item'),
            h.Value(selection.itemInput),
            h.OnInput(value => Message.UpdatedItemInput({ value })),
          ]),
          h.button(
            [
              h.Type('submit'),
              h.DataAttribute('testid', 'add-item'),
              h.Disabled(selection.checklist._tag !== 'ChecklistLoaded'),
            ],
            ['Add item'],
          ),
        ],
      ),
    ],
  )

const selectedView = (
  board: ShownBoard,
  selection: Selection,
  h: H,
): ReadonlyArray<Html> =>
  Option.match(locateCard(board, selection.cardId), {
    onNone: () => [h.p([], ['select a card'])],
    onSome: ({ column, card }) => [
      h.h2([h.Class('detail-title')], [`#${card.id} ${card.title}`]),
      h.p([h.Class('detail-column')], [`in ${COLUMN_NAMES[column]}`]),
      h.form(
        [h.Class('inline-form'), h.OnSubmit(Message.ClickedRename())],
        [
          h.input([
            h.Type('text'),
            h.DataAttribute('testid', 'title-input'),
            h.AriaLabel('New title'),
            h.Placeholder('New title'),
            h.Value(selection.titleInput),
            h.OnInput(value => Message.UpdatedTitleInput({ value })),
          ]),
          h.button(
            [h.Type('submit'), h.DataAttribute('testid', 'rename')],
            ['Rename'],
          ),
        ],
      ),
      errorLine('rename-error', 'rename error', selection.maybeRenameError, h),
      h.button(
        [
          h.Type('button'),
          h.DataAttribute('testid', 'archive'),
          h.OnClick(Message.ClickedArchive()),
        ],
        ['Archive'],
      ),
      checklistView(selection, h),
      errorLine('item-error', 'item error', selection.maybeItemError, h),
    ],
  })

const detailView = (model: Model, board: ShownBoard, h: H): Html =>
  h.aside(
    [h.DataAttribute('testid', 'detail'), h.Class('detail'), h.AriaLabel('Card detail')],
    Detail.match(model.detail, {
      NoSelection: () => [h.p([], ['select a card'])],
      Selected: ({ selection }) => selectedView(board, selection, h),
    }),
  )

// VIEW

export const view = Submodel.defineView<Model, Message>((model, h) => {
  const board = shownBoard(model)
  const maybeSelectedId = Detail.match(model.detail, {
    NoSelection: () => Option.none<number>(),
    Selected: ({ selection }) => Option.some(selection.cardId),
  })
  return h.div(
    [h.Class('board-page')],
    [
      h.div(
        [h.Class('board-errors')],
        [
          errorLine('move-error', 'move error', model.maybeMoveError, h),
          errorLine('archive-error', 'archive error', model.maybeArchiveError, h),
        ],
      ),
      h.div(
        [h.Class('board-layout')],
        [
          h.div(
            [h.Class(isDoingFull(board) ? 'columns doing-full' : 'columns')],
            pipe(
              COLUMN_IDS,
              Array.map(column =>
                columnView(model, board, column, maybeSelectedId, h),
              ),
            ),
          ),
          detailView(model, board, h),
        ],
      ),
    ],
  )
})
