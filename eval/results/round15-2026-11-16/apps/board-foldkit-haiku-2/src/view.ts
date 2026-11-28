import { Array, Option } from 'effect'
import { AsyncData } from 'foldkit'
import { type Document, type Html, type HtmlBuilder } from 'foldkit/html'

import { Message } from './message'
import { destinationOf, type Destination } from './update'
import {
  ArchivePage,
  BoardPage,
  Card,
  Column,
  Direction,
  Item,
  Model,
  Page,
  columnLabels,
  columnsInOrder,
} from './model'

type Placement = { readonly column: Column; readonly index: number; readonly card: Card }

const WIP_LIMIT = 3

const testId = (h: HtmlBuilder<Message>, name: string) =>
  h.DataAttribute('testid', name)

const directionLabels: Record<Direction, string> = {
  Left: 'left',
  Right: 'right',
  Up: 'up',
  Down: 'down',
}

const moveTargetAllowed = (
  board: BoardPage,
  from: Column,
  target: Column,
): boolean => {
  if (!AsyncData.isSuccess(board.columns[target])) {
    return false
  }
  if (target !== 'doing' || from === 'doing') {
    return true
  }
  return Option.getOrElse(AsyncData.getData(board.columns.doing), () => []).length < WIP_LIMIT
}

const cardText = (card: Card): string =>
  Option.match(card.maybeId, {
    onNone: () => `${card.title} (adding…)`,
    onSome: id => `#${id} ${card.title} · ${card.done}/${card.total}`,
  })

const directions: ReadonlyArray<Direction> = ['Left', 'Up', 'Down', 'Right']

const moveButtons = (
  board: BoardPage,
  placement: Placement,
  h: HtmlBuilder<Message>,
): ReadonlyArray<Html> =>
  Option.isNone(placement.card.maybeId)
    ? []
    : Array.flatMap(directions, direction =>
        Option.match(destinationOf(board, placement, direction), {
          onNone: (): ReadonlyArray<Html> => [],
          onSome: (destination: Destination): ReadonlyArray<Html> => [
            h.button(
              [
                testId(h, directionLabels[direction]),
                h.Disabled(!moveTargetAllowed(board, placement.column, destination.column)),
                h.OnClick(
                  Message.ClickedMoveCard({ localId: placement.card.localId, direction }),
                ),
              ],
              [directionLabels[direction]],
            ),
          ],
        }),
      )

const cardRow = (
  board: BoardPage,
  placement: Placement,
  h: HtmlBuilder<Message>,
): Html =>
  h.keyed('li')(
    `${placement.card.localId}`,
    [h.Class('flex items-center gap-2')],
    [
      h.div(
        [
          testId(h, 'card'),
          h.Class('flex-1 rounded border px-2 py-1 cursor-pointer'),
          h.OnClick(Message.ClickedCard({ localId: placement.card.localId })),
        ],
        [cardText(placement.card)],
      ),
      ...moveButtons(board, placement, h),
    ],
  )

const columnCards = (
  board: BoardPage,
  column: Column,
  h: HtmlBuilder<Message>,
): Html => {
  const state = board.columns[column]
  if (AsyncData.isSuccess(state)) {
    return h.ul(
      [h.Class('flex flex-col gap-2')],
      Array.map(state.data, (card, index) =>
        cardRow(board, { column, index, card }, h),
      ),
    )
  }
  if (AsyncData.isFailure(state)) {
    return h.div([h.Class('flex flex-col gap-2')], [
      h.p([], [`error: ${state.error}`]),
      h.button([testId(h, `retry-${column}`), h.OnClick(Message.ClickedRetryColumn({ column }))], ['Retry']),
    ])
  }
  return h.p([], ['loading'])
}

const addCardForm = (board: BoardPage, h: HtmlBuilder<Message>): Html =>
  h.form(
    [h.Class('flex flex-col gap-2'), h.OnSubmit(Message.SubmittedNewCard())],
    [
      h.input([
        testId(h, 'new-card'),
        h.Type('text'),
        h.Placeholder('Card title'),
        h.Value(board.newCardTitle),
        h.OnInput(value => Message.ChangedNewCardTitle({ value })),
      ]),
      h.button([testId(h, 'add-card'), h.Type('submit')], ['Add card']),
      Option.match(board.addError, {
        onNone: () => h.empty,
        onSome: error => h.p([testId(h, 'add-error')], [error]),
      }),
    ],
  )

const columnView = (board: BoardPage, column: Column, h: HtmlBuilder<Message>): Html => {
  const state = board.columns[column]
  const count = AsyncData.isSuccess(state) ? ` (${state.data.length})` : ''
  return h.section(
    [testId(h, `col-${column}`), h.Class('flex flex-col gap-3 min-w-0')],
    [
      h.h2([testId(h, `head-${column}`)], [`${columnLabels[column]}${count}`]),
      columnCards(board, column, h),
      column === 'todo' ? addCardForm(board, h) : h.empty,
    ],
  )
}

const itemRow = (item: Item, h: HtmlBuilder<Message>): Html => {
  const mark = item.done ? '[x]' : '[ ]'
  return h.keyed('li')(
    `${item.localId}`,
    [h.Class('flex items-center gap-2')],
    [
      h.span(
        [testId(h, 'item')],
        [
          Option.match(item.maybeId, {
            onNone: () => `${mark} ${item.text} (adding…)`,
            onSome: () => `${mark} ${item.text}`,
          }),
        ],
      ),
      Option.match(item.maybeId, {
        onNone: () => h.empty,
        onSome: () =>
          h.button(
            [testId(h, 'toggle'), h.OnClick(Message.ClickedToggleItem({ localId: item.localId }))],
            ['toggle'],
          ),
      }),
    ],
  )
}

const checklistBody = (board: BoardPage, h: HtmlBuilder<Message>): Html => {
  const state = board.checklist
  if (AsyncData.isSuccess(state)) {
    const items = state.data
    const doneCount = Array.filter(items, item => item.done).length
    return h.div([], [
      h.ul([], Array.map(items, item => itemRow(item, h))),
      h.p([testId(h, 'progress')], [`${doneCount}/${items.length} done`]),
      h.form(
        [h.OnSubmit(Message.SubmittedNewItem())],
        [
          h.input([
            testId(h, 'item-input'),
            h.Type('text'),
            h.Placeholder('New item'),
            h.Value(board.newItemText),
            h.OnInput(value => Message.ChangedNewItemText({ value })),
          ]),
          h.button([testId(h, 'add-item'), h.Type('submit')], ['Add item']),
        ],
      ),
    ])
  }
  if (AsyncData.isFailure(state)) {
    return h.p([], [`checklist error: ${state.error}`])
  }
  return h.p([], ['loading checklist'])
}

const selectedView = (
  board: BoardPage,
  placement: Placement,
  h: HtmlBuilder<Message>,
): Html => {
  const heading = Option.match(placement.card.maybeId, {
    onNone: () => placement.card.title,
    onSome: id => `#${id} ${placement.card.title}`,
  })
  return h.div([h.Class('flex flex-col gap-3')], [
    h.h2([], [heading]),
    h.p([], [`in ${columnLabels[placement.column]}`]),
    h.form(
      [h.OnSubmit(Message.SubmittedRename())],
      [
        h.input([
          testId(h, 'title-input'),
          h.Type('text'),
          h.Value(board.renameTitle),
          h.OnInput(value => Message.ChangedRenameTitle({ value })),
        ]),
        h.button([testId(h, 'rename'), h.Type('submit')], ['Rename']),
      ],
    ),
    Option.match(board.renameError, {
      onNone: () => h.empty,
      onSome: error => h.p([], [error]),
    }),
    h.button(
      [testId(h, 'archive'), h.OnClick(Message.ClickedArchiveCard())],
      ['Archive'],
    ),
    h.div([testId(h, 'checklist')], [checklistBody(board, h)]),
    Option.match(board.itemError, {
      onNone: () => h.empty,
      onSome: error => h.p([], [error]),
    }),
  ])
}

const detailView = (board: BoardPage, h: HtmlBuilder<Message>): Html =>
  h.aside(
    [testId(h, 'detail'), h.Class('flex flex-col gap-3 min-w-0')],
    [
      Option.match(
        Option.flatMap(board.selection, localId =>
          Array.findFirst(
            Array.flatMap(columnsInOrder, column =>
              Array.map(
                Option.getOrElse(AsyncData.getData(board.columns[column]), () => []),
                (card, index) => ({ column, index, card }),
              ),
            ),
            ({ card }) => card.localId === localId,
          ),
        ),
        {
          onNone: () => h.p([], ['select a card']),
          onSome: placement => selectedView(board, placement, h),
        },
      ),
    ],
  )

const boardView = (board: BoardPage, h: HtmlBuilder<Message>): Html =>
  h.div([h.Class('flex flex-col gap-4')], [
    Option.match(board.moveError, {
      onNone: () => h.empty,
      onSome: error => h.p([testId(h, 'move-error')], [error]),
    }),
    Option.match(board.archiveError, {
      onNone: () => h.empty,
      onSome: error => h.p([testId(h, 'archive-error')], [error]),
    }),
    h.div([h.Class('grid grid-cols-1 md:grid-cols-[1fr_1fr_1fr_320px] gap-4')], [
      ...Array.map(columnsInOrder, column => columnView(board, column, h)),
      detailView(board, h),
    ]),
  ])

const archiveView = (archive: ArchivePage, h: HtmlBuilder<Message>): Html => {
  const state = archive.list
  const body: Html = AsyncData.isSuccess(state)
    ? h.ul(
        [],
        Array.map(state.data, row =>
          h.keyed('li')(`${row.id}`, [h.Class('flex items-center gap-2')], [
            h.span([testId(h, 'archived-card')], [`#${row.id} ${row.title}`]),
            h.button(
              [testId(h, 'restore'), h.OnClick(Message.ClickedRestore({ id: row.id }))],
              ['restore'],
            ),
          ]),
        ),
      )
    : AsyncData.isFailure(state)
      ? h.p([], [`archive error: ${state.error}`])
      : h.p([], ['loading archive'])
  return h.div([h.Class('flex flex-col gap-3')], [
    h.div([testId(h, 'archived')], [body]),
    Option.match(archive.restoreError, {
      onNone: () => h.empty,
      onSome: error => h.p([], [error]),
    }),
  ])
}

export const view = (model: Model, h: HtmlBuilder<Message>): Document => ({
  title: 'Sprint board',
  body: h.div([h.Class('min-h-screen bg-white p-6 flex flex-col gap-4')], [
    h.nav([h.Class('flex gap-2')], [
      h.button(
        [testId(h, 'tab-board'), h.OnClick(Message.ClickedBoardTab())],
        ['Board'],
      ),
      h.button(
        [testId(h, 'tab-archive'), h.OnClick(Message.ClickedArchiveTab())],
        ['Archive'],
      ),
    ]),
    Page.match<Html>(model.page, {
      Board: board => boardView(board, h),
      Archive: archive => archiveView(archive, h),
    }),
  ]),
})
