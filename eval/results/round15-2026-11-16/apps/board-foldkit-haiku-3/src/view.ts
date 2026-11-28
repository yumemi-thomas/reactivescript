import { Option } from 'effect'
import { type Document, type Html, type HtmlBuilder } from 'foldkit/html'

import * as Board from './board'
import { Message } from './message'
import {
  ArchivePage,
  BoardCard,
  BoardPage,
  ChecklistItem,
  ChecklistLoad,
  ArchivedLoad,
  Column,
  ColumnLoad,
  Model,
  Page,
} from './model'

// VIEW

export const view = (model: Model, h: HtmlBuilder<Message>): Document => ({
  title: 'Sprint board',
  body: h.div([h.Class('min-h-screen bg-slate-100 p-6 flex flex-col gap-6')], [
    h.nav([h.Class('flex gap-2')], [
      tabButton('tab-board', 'Board', Message.ClickedBoardTab(), h),
      tabButton('tab-archive', 'Archive', Message.ClickedArchiveTab(), h),
    ]),
    Page.match(model.page, {
      Board: ({ board }) => boardView(board, h),
      Archive: ({ archive }) => archiveView(archive, h),
    }),
  ]),
})

const testId = (value: string, h: HtmlBuilder<Message>) =>
  h.DataAttribute('testid', value)

const tabButton = (
  id: string,
  label: string,
  message: Message,
  h: HtmlBuilder<Message>,
): Html => h.button([testId(id, h), h.OnClick(message)], [label])

const errorLine = (
  id: string,
  prefix: string,
  maybeError: Option.Option<string>,
  h: HtmlBuilder<Message>,
): Html =>
  Option.match(maybeError, {
    onNone: () => h.empty,
    onSome: error => h.p([testId(id, h)], [`${prefix}: ${error}`]),
  })

// BOARD PAGE

const boardView = (board: BoardPage, h: HtmlBuilder<Message>): Html =>
  h.div([h.Class('flex flex-col gap-4')], [
    errorLine('move-error', 'move error', board.maybeMoveError, h),
    errorLine('archive-error', 'archive error', board.maybeArchiveError, h),
    h.div([h.Class('flex gap-4 items-start')], [
      ...Board.columns.map(column => columnView(board, column, h)),
      detailView(board, h),
    ]),
  ])

const columnView = (
  board: BoardPage,
  column: Column,
  h: HtmlBuilder<Message>,
): Html =>
  h.section(
    [
      testId(`col-${column}`, h),
      h.Class('flex-1 min-w-0 flex flex-col gap-2 bg-white rounded p-4'),
    ],
    [
      h.h2([testId(`head-${column}`, h)], [columnHeading(column, board.columns[column])]),
      columnBody(board, column, h),
      column === 'todo' ? addCardForm(board, h) : h.empty,
    ],
  )

const columnHeading = (column: Column, load: ColumnLoad): string => {
  const label = Board.columnLabels[column]
  return ColumnLoad.match(load, {
    Loading: () => label,
    Failed: () => label,
    Loaded: ({ cards }) => `${label} (${cards.length})`,
  })
}

const columnBody = (
  board: BoardPage,
  column: Column,
  h: HtmlBuilder<Message>,
): Html =>
  ColumnLoad.match(board.columns[column], {
    Loading: () => h.p([], ['loading']),
    Failed: ({ error }) =>
      h.div([h.Class('flex flex-col gap-2')], [
        h.p([], [`error: ${error}`]),
        h.button(
          [testId(`retry-${column}`, h), h.OnClick(Message.ClickedRetryColumn({ column }))],
          ['retry'],
        ),
      ]),
    Loaded: ({ cards }) =>
      h.ul(
        [h.Class('flex flex-col gap-2')],
        cards.map(card => cardRow(board, card, h)),
      ),
  })

const cardRow = (
  board: BoardPage,
  card: BoardCard,
  h: HtmlBuilder<Message>,
): Html =>
  BoardCard.match(card, {
    Saved: saved =>
      h.keyed('li')(`saved-${saved.id}`, [h.Class('flex items-center gap-2')], [
        h.button(
          [
            testId('card', h),
            h.OnClick(Message.ClickedCard({ id: saved.id })),
            h.Class(Board.isSelected(board, saved.id) ? 'font-bold' : ''),
          ],
          [`#${saved.id} ${saved.title} · ${saved.done}/${saved.total}`],
        ),
        ...moveButtons(board, saved.id, h),
      ]),
    Adding: adding =>
      h.keyed('li')(`adding-${adding.key}`, [h.Class('flex items-center gap-2')], [
        h.div([testId('card', h)], [`${adding.title} (adding…)`]),
      ]),
  })

const moveButtons = (
  board: BoardPage,
  id: number,
  h: HtmlBuilder<Message>,
): ReadonlyArray<Html> =>
  Board.directions.map(direction =>
    Option.match(Board.movePlan(board, id, direction), {
      onNone: () => h.empty,
      onSome: plan =>
        h.button(
          [
            testId(direction, h),
            h.OnClick(Message.ClickedMoveCard({ id, direction })),
            h.Disabled(plan.blocked),
          ],
          [direction],
        ),
    }),
  )

const addCardForm = (board: BoardPage, h: HtmlBuilder<Message>): Html =>
  h.div([h.Class('flex flex-col gap-2')], [
    h.input([
      testId('new-card', h),
      h.Placeholder('Card title'),
      h.AriaLabel('New card title'),
      h.Value(board.newCardTitle),
      h.OnInput(value => Message.UpdatedNewCardTitle({ value })),
    ]),
    h.button(
      [
        testId('add-card', h),
        h.OnClick(Message.ClickedAddCard()),
        h.Disabled(!Board.isLoaded(board, 'todo')),
      ],
      ['add'],
    ),
    errorLine('add-error', 'add error', board.maybeAddError, h),
  ])

const detailView = (board: BoardPage, h: HtmlBuilder<Message>): Html =>
  h.aside(
    [testId('detail', h), h.Class('w-80 shrink-0 flex flex-col gap-3 bg-white rounded p-4')],
    [
      Option.match(Board.selectedLocation(board), {
        onNone: () => h.p([], ['select a card']),
        onSome: location => selectedDetail(board, location, h),
      }),
    ],
  )

const selectedDetail = (
  board: BoardPage,
  location: Board.Location,
  h: HtmlBuilder<Message>,
): Html =>
  h.div([h.Class('flex flex-col gap-3')], [
    h.h3([], [`#${location.card.id} ${location.card.title}`]),
    h.p([], [`in ${Board.columnLabels[location.column]}`]),
    h.div([h.Class('flex gap-2')], [
      h.input([
        testId('title-input', h),
        h.AriaLabel('Card title'),
        h.Value(board.titleInput),
        h.OnInput(value => Message.UpdatedTitleInput({ value })),
      ]),
      h.button([testId('rename', h), h.OnClick(Message.ClickedRename())], ['rename']),
    ]),
    errorLine('rename-error', 'rename error', board.maybeRenameError, h),
    h.button([testId('archive', h), h.OnClick(Message.ClickedArchive())], ['archive']),
    h.section([testId('checklist', h)], [checklistBody(board, h)]),
    progressLine(board, h),
    h.div([h.Class('flex gap-2')], [
      h.input([
        testId('item-input', h),
        h.AriaLabel('New checklist item'),
        h.Value(board.itemInput),
        h.OnInput(value => Message.UpdatedItemInput({ value })),
      ]),
      h.button(
        [
          testId('add-item', h),
          h.OnClick(Message.ClickedAddItem()),
          h.Disabled(!ChecklistLoad.guards.Loaded(board.checklist)),
        ],
        ['add item'],
      ),
    ]),
    errorLine('item-error', 'item error', board.maybeItemError, h),
  ])

const checklistBody = (board: BoardPage, h: HtmlBuilder<Message>): Html =>
  ChecklistLoad.match(board.checklist, {
    Idle: () => h.empty,
    Loading: () => h.p([], ['loading checklist']),
    Failed: ({ error }) => h.p([], [`checklist error: ${error}`]),
    Loaded: ({ items }) =>
      h.ul([h.Class('flex flex-col gap-2')], items.map(item => checklistRow(item, h))),
  })

const checklistRow = (item: ChecklistItem, h: HtmlBuilder<Message>): Html =>
  ChecklistItem.match(item, {
    Saved: saved =>
      h.keyed('li')(`saved-${saved.id}`, [h.Class('flex items-center gap-2')], [
        h.span([testId('item', h)], [`${saved.done ? '[x]' : '[ ]'} ${saved.text}`]),
        h.button(
          [testId('toggle', h), h.OnClick(Message.ClickedToggleItem({ itemId: saved.id }))],
          ['toggle'],
        ),
      ]),
    Adding: adding =>
      h.keyed('li')(`adding-${adding.key}`, [h.Class('flex items-center gap-2')], [
        h.span([testId('item', h)], [`[ ] ${adding.text} (adding…)`]),
      ]),
  })

const progressLine = (board: BoardPage, h: HtmlBuilder<Message>): Html =>
  ChecklistLoad.matchOrElse(
    board.checklist,
    {
      Loaded: ({ items }) =>
        h.p(
          [testId('progress', h)],
          [
            `${items.filter(item => ChecklistItem.guards.Saved(item) && item.done).length}/${items.length} done`,
          ],
        ),
    },
    () => h.empty,
  )

// ARCHIVE PAGE

const archiveView = (archive: ArchivePage, h: HtmlBuilder<Message>): Html =>
  h.section([testId('archived', h), h.Class('bg-white rounded p-4 flex flex-col gap-2 max-w-md')], [
    ArchivedLoad.match(archive.archived, {
      Loading: () => h.p([], ['loading archive']),
      Failed: ({ error }) => h.p([], [`archive error: ${error}`]),
      Loaded: ({ cards }) =>
        h.ul(
          [h.Class('flex flex-col gap-2')],
          cards.map(card =>
            h.keyed('li')(`archived-${card.id}`, [h.Class('flex items-center gap-2')], [
              h.span([testId('archived-card', h)], [`#${card.id} ${card.title}`]),
              h.button(
                [testId('restore', h), h.OnClick(Message.ClickedRestore({ id: card.id }))],
                ['restore'],
              ),
            ]),
          ),
        ),
    }),
    errorLine('restore-error', 'restore error', archive.maybeRestoreError, h),
  ])
