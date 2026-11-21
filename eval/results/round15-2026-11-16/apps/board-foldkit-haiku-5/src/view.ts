import { Option } from 'effect'
import { AsyncData } from 'foldkit'
import { Document, Html, HtmlBuilder } from 'foldkit/html'

import { Message } from './message'
import {
  ArchivePage,
  BoardCard,
  BoardPage,
  CardsState,
  COLUMN_NAMES,
  ChecklistItem,
  ColumnName,
  MOVE_DIRECTIONS,
  Model,
  MoveDirection,
  Page,
  PendingCard,
  Placement,
  Selection,
  columnCards,
  dataOf,
  isColumnLoaded,
  locateCard,
  moveAllowed,
  moveDestination,
} from './model'

// VIEW

const COLUMN_LABELS: Record<ColumnName, string> = {
  todo: 'To do',
  doing: 'Doing',
  done: 'Done',
}

const MOVE_SYMBOLS: Record<MoveDirection, string> = {
  left: '←',
  right: '→',
  up: '↑',
  down: '↓',
}

const buttonClass =
  'rounded border px-2 py-1 text-sm hover:bg-slate-100 disabled:opacity-40'
const inputClass = 'rounded border px-2 py-1'
const cardClass = 'flex-1 cursor-pointer rounded border bg-white px-3 py-2'

export const view = (model: Model, h: HtmlBuilder<Message>): Document => ({
  title: 'Sprint board',
  body: h.div([h.Class('min-h-screen bg-slate-100 text-slate-900')], [
    tabsView(model.page, h),
    h.div([h.Class('mx-auto flex max-w-6xl flex-col gap-4 p-4')], [
      Page.match<Html>(model.page, {
        Board: board => boardView(board, h),
        Archive: page => archiveView(page, h),
      }),
    ]),
  ]),
})

const tabsView = (page: Page, h: HtmlBuilder<Message>): Html => {
  const isBoardOpen = Page.match<boolean>(page, {
    Board: () => true,
    Archive: () => false,
  })
  return h.nav([h.Class('flex gap-2 border-b bg-white px-4 pt-3')], [
    tabButton('tab-board', 'Board', isBoardOpen, Message.ClickedBoardTab(), h),
    tabButton(
      'tab-archive',
      'Archive',
      !isBoardOpen,
      Message.ClickedArchiveTab(),
      h,
    ),
  ])
}

const tabButton = (
  testId: string,
  label: string,
  isActive: boolean,
  message: Message,
  h: HtmlBuilder<Message>,
): Html =>
  h.button(
    [
      h.DataAttribute('testid', testId),
      h.Type('button'),
      h.OnClick(message),
      h.Class(
        isActive
          ? 'border-b-2 border-slate-900 px-3 py-2 font-semibold'
          : 'px-3 py-2 text-slate-500 hover:text-slate-900',
      ),
    ],
    [label],
  )

const errorLine = (
  maybeError: Option.Option<string>,
  testId: string,
  label: string,
  h: HtmlBuilder<Message>,
): Html =>
  Option.match(maybeError, {
    onNone: () => h.empty,
    onSome: error =>
      h.p(
        [
          h.DataAttribute('testid', testId),
          h.Class('rounded bg-red-50 px-3 py-2 text-red-700'),
        ],
        [`${label}: ${error}`],
      ),
  })

const boardView = (board: BoardPage, h: HtmlBuilder<Message>): Html =>
  h.div([h.Class('flex flex-col gap-4')], [
    h.div([h.Class('flex flex-col gap-2')], [
      errorLine(board.maybeMoveError, 'move-error', 'move error', h),
      errorLine(board.maybeAddError, 'add-error', 'add error', h),
      errorLine(board.maybeArchiveError, 'archive-error', 'archive error', h),
    ]),
    h.div([h.Class('grid gap-4 lg:grid-cols-[1fr_1fr_1fr_20rem]')], [
      ...COLUMN_NAMES.map(name => columnView(board, name, h)),
      detailView(board, h),
    ]),
  ])

const headingText = (
  name: ColumnName,
  state: CardsState,
  pendingCount: number,
): string =>
  AsyncData.isSuccess(state)
    ? `${COLUMN_LABELS[name]} (${dataOf(state).length + pendingCount})`
    : COLUMN_LABELS[name]

const columnView = (
  board: BoardPage,
  name: ColumnName,
  h: HtmlBuilder<Message>,
): Html => {
  const state = columnCards(board, name)
  const pendingCards = name === 'todo' ? board.pendingCards : []
  return h.section(
    [
      h.DataAttribute('testid', `col-${name}`),
      h.Class('flex flex-col gap-3 rounded-lg bg-white p-3 shadow-sm'),
    ],
    [
      h.h2(
        [h.DataAttribute('testid', `head-${name}`), h.Class('font-semibold')],
        [headingText(name, state, pendingCards.length)],
      ),
      AsyncData.matchDataSplitEmpty(state, {
        onIdle: () => h.p([], ['loading']),
        onLoading: () => h.p([], ['loading']),
        onFailure: error => columnErrorView(name, error, h),
        onData: cards => cardListView(board, name, cards, pendingCards, h),
      }),
      name === 'todo' ? addCardForm(board, h) : h.empty,
    ],
  )
}

const columnErrorView = (
  name: ColumnName,
  error: string,
  h: HtmlBuilder<Message>,
): Html =>
  h.div([h.Class('flex flex-col items-start gap-2')], [
    h.p([], [`error: ${error}`]),
    h.button(
      [
        h.DataAttribute('testid', `retry-${name}`),
        h.Type('button'),
        h.OnClick(Message.ClickedRetryColumn({ column: name })),
        h.Class(buttonClass),
      ],
      ['Retry'],
    ),
  ])

const cardListView = (
  board: BoardPage,
  name: ColumnName,
  cards: ReadonlyArray<BoardCard>,
  pendingCards: ReadonlyArray<PendingCard>,
  h: HtmlBuilder<Message>,
): Html =>
  h.ul([h.Class('flex flex-col gap-2')], [
    ...cards.map((card, index) =>
      h.keyed('li')(
        `card-${card.id}`,
        [h.Class('flex items-center gap-2')],
        cardRowChildren(board, { column: name, index, card }, h),
      ),
    ),
    ...pendingCards.map(pending =>
      h.keyed('li')(
        `pending-${pending.key}`,
        [h.Class('flex items-center gap-2')],
        [
          h.div(
            [h.DataAttribute('testid', 'card'), h.Class(cardClass)],
            [`${pending.title} (adding…)`],
          ),
        ],
      ),
    ),
  ])

const cardRowChildren = (
  board: BoardPage,
  placement: Placement,
  h: HtmlBuilder<Message>,
): ReadonlyArray<Html> => [
  cardElement(board, placement.card, h),
  ...moveButtons(board, placement, h),
]

const cardElement = (
  board: BoardPage,
  card: BoardCard,
  h: HtmlBuilder<Message>,
): Html => {
  const isSelected = Option.exists(
    board.maybeSelection,
    selection => selection.cardId === card.id,
  )
  return h.div(
    [
      h.DataAttribute('testid', 'card'),
      h.OnClick(Message.ClickedCard({ id: card.id })),
      h.Class(
        isSelected ? `${cardClass} ring-2 ring-slate-900` : cardClass,
      ),
    ],
    [`#${card.id} ${card.title} · ${card.done}/${card.total}`],
  )
}

const moveButtons = (
  board: BoardPage,
  placement: Placement,
  h: HtmlBuilder<Message>,
): ReadonlyArray<Html> =>
  MOVE_DIRECTIONS.flatMap(direction =>
    Option.match(moveDestination(board, placement, direction), {
      onNone: (): ReadonlyArray<Html> => [],
      onSome: destination => [
        moveButton(
          placement.card.id,
          direction,
          !moveAllowed(board, placement, destination),
          h,
        ),
      ],
    }),
  )

const moveButton = (
  id: number,
  direction: MoveDirection,
  isDisabled: boolean,
  h: HtmlBuilder<Message>,
): Html =>
  h.button(
    [
      h.DataAttribute('testid', direction),
      h.Type('button'),
      h.AriaLabel(`Move ${direction}`),
      h.Disabled(isDisabled),
      h.OnClick(Message.ClickedMoveCard({ id, direction })),
      h.Class(buttonClass),
    ],
    [MOVE_SYMBOLS[direction]],
  )

const addCardForm = (board: BoardPage, h: HtmlBuilder<Message>): Html =>
  h.form([h.Class('flex gap-2'), h.OnSubmit(Message.SubmittedNewCard())], [
    h.input([
      h.DataAttribute('testid', 'new-card'),
      h.Type('text'),
      h.Placeholder('New card title'),
      h.AriaLabel('New card title'),
      h.Value(board.newCardTitle),
      h.OnInput(value => Message.UpdatedNewCardTitle({ value })),
      h.Class(`${inputClass} flex-1`),
    ]),
    h.button(
      [
        h.DataAttribute('testid', 'add-card'),
        h.Type('submit'),
        h.Disabled(!isColumnLoaded(board, 'todo')),
        h.Class(buttonClass),
      ],
      ['Add'],
    ),
  ])

const detailView = (board: BoardPage, h: HtmlBuilder<Message>): Html =>
  h.aside(
    [
      h.DataAttribute('testid', 'detail'),
      h.Class('flex flex-col gap-3 rounded-lg bg-white p-4 shadow-sm'),
    ],
    [
      Option.match(
        Option.flatMap(board.maybeSelection, selection =>
          Option.map(locateCard(board, selection.cardId), placement => ({
            selection,
            placement,
          })),
        ),
        {
          onNone: () => h.p([h.Class('text-slate-500')], ['select a card']),
          onSome: ({ selection, placement }) =>
            selectedView(selection, placement, h),
        },
      ),
    ],
  )

const selectedView = (
  selection: Selection,
  placement: Placement,
  h: HtmlBuilder<Message>,
): Html =>
  h.div([h.Class('flex flex-col gap-3')], [
    h.h2(
      [h.Class('text-lg font-semibold')],
      [`#${placement.card.id} ${placement.card.title}`],
    ),
    h.p(
      [h.Class('text-sm text-slate-500')],
      [`in ${COLUMN_LABELS[placement.column]}`],
    ),
    h.form([h.Class('flex gap-2'), h.OnSubmit(Message.SubmittedRename())], [
      h.input([
        h.DataAttribute('testid', 'title-input'),
        h.Type('text'),
        h.AriaLabel('Card title'),
        h.Value(selection.renameInput),
        h.OnInput(value => Message.UpdatedRenameTitle({ value })),
        h.Class(`${inputClass} flex-1`),
      ]),
      h.button(
        [
          h.DataAttribute('testid', 'rename'),
          h.Type('submit'),
          h.Class(buttonClass),
        ],
        ['Rename'],
      ),
    ]),
    errorLine(selection.maybeRenameError, 'rename-error', 'rename error', h),
    h.button(
      [
        h.DataAttribute('testid', 'archive'),
        h.Type('button'),
        h.OnClick(Message.ClickedArchiveCard()),
        h.Class(buttonClass),
      ],
      ['Archive'],
    ),
    checklistView(selection, h),
    errorLine(selection.maybeItemError, 'item-error', 'item error', h),
  ])

const checklistView = (selection: Selection, h: HtmlBuilder<Message>): Html =>
  h.section(
    [h.DataAttribute('testid', 'checklist'), h.Class('flex flex-col gap-2')],
    [
      AsyncData.matchDataSplitEmpty(selection.checklist, {
        onIdle: () => h.p([], ['loading checklist']),
        onLoading: () => h.p([], ['loading checklist']),
        onFailure: error => h.p([], [`checklist error: ${error}`]),
        onData: items => checklistItemsView(selection, items, h),
      }),
    ],
  )

const checklistItemsView = (
  selection: Selection,
  items: ReadonlyArray<ChecklistItem>,
  h: HtmlBuilder<Message>,
): Html => {
  const doneCount = items.filter(item => item.done).length
  const total = items.length + selection.pendingItems.length
  return h.div([h.Class('flex flex-col gap-2')], [
    h.ul([h.Class('flex flex-col gap-1')], [
      ...items.map(item =>
        h.keyed('li')(`item-${item.id}`, [h.Class('flex items-center gap-2')], [
          h.span(
            [h.DataAttribute('testid', 'item')],
            [`${item.done ? '[x]' : '[ ]'} ${item.text}`],
          ),
          h.button(
            [
              h.DataAttribute('testid', 'toggle'),
              h.Type('button'),
              h.OnClick(Message.ClickedToggleItem({ itemId: item.id })),
              h.Class(buttonClass),
            ],
            ['Toggle'],
          ),
        ]),
      ),
      ...selection.pendingItems.map(pending =>
        h.keyed('li')(
          `pending-${pending.key}`,
          [h.Class('flex items-center gap-2')],
          [
            h.span(
              [h.DataAttribute('testid', 'item')],
              [`[ ] ${pending.text} (adding…)`],
            ),
          ],
        ),
      ),
    ]),
    h.p([h.DataAttribute('testid', 'progress')], [`${doneCount}/${total} done`]),
    h.form([h.Class('flex gap-2'), h.OnSubmit(Message.SubmittedItem())], [
      h.input([
        h.DataAttribute('testid', 'item-input'),
        h.Type('text'),
        h.AriaLabel('New checklist item'),
        h.Value(selection.itemInput),
        h.OnInput(value => Message.UpdatedItemInput({ value })),
        h.Class(`${inputClass} flex-1`),
      ]),
      h.button(
        [
          h.DataAttribute('testid', 'add-item'),
          h.Type('submit'),
          h.Class(buttonClass),
        ],
        ['Add item'],
      ),
    ]),
  ])
}

const archiveView = (page: ArchivePage, h: HtmlBuilder<Message>): Html =>
  h.section(
    [
      h.DataAttribute('testid', 'archive-page'),
      h.Class('flex flex-col gap-3 rounded-lg bg-white p-4 shadow-sm'),
    ],
    [
      h.h2([h.Class('text-lg font-semibold')], ['Archive']),
      h.div([h.DataAttribute('testid', 'archived')], [
        AsyncData.matchDataSplitEmpty(page.archived, {
          onIdle: () => h.p([], ['loading archive']),
          onLoading: () => h.p([], ['loading archive']),
          onFailure: error => h.p([], [`archive error: ${error}`]),
          onData: cards =>
            h.ul(
              [h.Class('flex flex-col gap-2')],
              cards.map(card =>
                h.keyed('li')(`archived-${card.id}`, [h.Class('flex items-center gap-2')], [
                  h.span(
                    [
                      h.DataAttribute('testid', 'archived-card'),
                      h.Class('flex-1'),
                    ],
                    [`#${card.id} ${card.title}`],
                  ),
                  h.button(
                    [
                      h.DataAttribute('testid', 'restore'),
                      h.Type('button'),
                      h.OnClick(Message.ClickedRestoreCard({ id: card.id })),
                      h.Class(buttonClass),
                    ],
                    ['Restore'],
                  ),
                ]),
              ),
            ),
        }),
      ]),
      errorLine(page.maybeRestoreError, 'restore-error', 'restore error', h),
    ],
  )
