import { Array, Option } from 'effect'
import type { Document, Html, HtmlBuilder } from 'foldkit/html'

import { displayedColumns, moveAvailability } from './board'
import {
  type BoardRow,
  COLUMN_IDS,
  type CardLocation,
  type ChecklistRow,
  type ColumnId,
  type Columns,
  WIP_LIMIT,
  applyPendingItemOps,
  columnName,
  locateCard,
} from './domain'
import { type Direction, Message } from './message'
import type { Archive, Board, ColumnState, Detail, Model } from './model'
import { STYLES } from './styles'

type H = HtmlBuilder<Message>
type CardSelected = Extract<Detail, { _tag: 'CardSelected' }>

const testId = (id: string, h: H) => h.DataAttribute('testid', id)

const errorLine = (id: string, maybeError: Option.Option<string>, prefix: string, h: H): Html =>
  Option.match(maybeError, {
    onNone: () => h.empty,
    onSome: error =>
      h.p([testId(id, h), h.Class('error'), h.Role('alert')], [`${prefix}: ${error}`]),
  })

// TABS

const tabsView = (model: Model, h: H): Html => {
  const tab = (id: string, label: string, isOpen: boolean, message: Message) =>
    h.button(
      [
        testId(id, h),
        h.Type('button'),
        h.Role('tab'),
        h.AriaSelected(isOpen),
        h.Class(isOpen ? 'tab tab-open' : 'tab'),
        h.OnClick(message),
      ],
      [label],
    )
  return h.nav(
    [h.Class('tabs'), h.Role('tablist')],
    [
      tab('tab-board', 'Board', model.page._tag === 'BoardPage', Message.ClickedBoardTab()),
      tab('tab-archive', 'Archive', model.page._tag === 'ArchivePage', Message.ClickedArchiveTab()),
    ],
  )
}

// BOARD

const DIRECTIONS: ReadonlyArray<Direction> = ['left', 'up', 'down', 'right']

const moveButtons = (columns: Columns, location: CardLocation, h: H): ReadonlyArray<Html> =>
  Array.map(DIRECTIONS, direction => {
    const availability = moveAvailability(columns, location, direction)
    if (availability._tag === 'NoMove') {
      return h.empty
    }
    return h.button(
      [
        testId(direction, h),
        h.Type('button'),
        h.Class('move'),
        h.AriaLabel(`move ${direction}`),
        h.Title(
          availability._tag === 'BlockedMove' ? `Doing holds at most ${WIP_LIMIT} cards` : `move ${direction}`,
        ),
        h.Disabled(availability._tag === 'BlockedMove'),
        h.OnClick(Message.ClickedMoveCard({ cardId: location.card.id, direction })),
      ],
      [direction],
    )
  })

const cardRowView = (
  columns: Columns,
  column: ColumnId,
  row: BoardRow,
  index: number,
  maybeSelectedId: Option.Option<number>,
  h: H,
): Html => {
  if (row._tag === 'AddingCardRow') {
    return h.keyed('li')(`adding-${row.opId}`, [h.Class('card-row adding')], [
      h.span([testId('card', h), h.Class('card')], [`${row.title} (adding…)`]),
    ])
  }
  const { card } = row
  const isSelected = Option.contains(maybeSelectedId, card.id)
  return h.keyed('li')(`card-${card.id}`, [h.Class('card-row')], [
    h.button(
      [
        testId('card', h),
        h.Type('button'),
        h.Class(isSelected ? 'card card-selected' : 'card'),
        h.AriaPressed(isSelected ? 'true' : 'false'),
        h.OnClick(Message.ClickedCard({ cardId: card.id })),
      ],
      [`#${card.id} ${card.title} · ${card.done}/${card.total}`],
    ),
    h.span([h.Class('moves')], [...moveButtons(columns, { column, index, card }, h)]),
  ])
}

const columnBody = (
  state: ColumnState,
  columns: Columns,
  column: ColumnId,
  maybeSelectedId: Option.Option<number>,
  h: H,
): Html => {
  if (state._tag === 'ColumnLoading') {
    return h.p([h.Class('muted')], ['loading'])
  }
  if (state._tag === 'ColumnFailed') {
    return h.div(
      [h.Class('column-error')],
      [
        h.p([h.Class('error')], [`error: ${state.error}`]),
        h.button(
          [testId(`retry-${column}`, h), h.Type('button'), h.OnClick(Message.ClickedRetryColumn({ column }))],
          ['retry'],
        ),
      ],
    )
  }
  const rows = Option.getOrElse(columns[column], () => [])
  return h.ul(
    [h.Class('cards')],
    Array.map(rows, (row, index) => cardRowView(columns, column, row, index, maybeSelectedId, h)),
  )
}

const addCardForm = (board: Board, h: H): Html =>
  h.form(
    [h.Class('add-form'), h.OnSubmit(Message.ClickedAddCard())],
    [
      h.input([
        testId('new-card', h),
        h.Type('text'),
        h.Placeholder('New card title'),
        h.AriaLabel('New card title'),
        h.Value(board.newCardInput),
        h.OnInput(value => Message.UpdatedNewCardTitle({ value })),
      ]),
      h.button(
        [testId('add-card', h), h.Type('submit'), h.Disabled(board.columns.todo._tag !== 'ColumnLoaded')],
        ['Add'],
      ),
    ],
  )

const columnView = (board: Board, columns: Columns, column: ColumnId, h: H): Html => {
  const state = board.columns[column]
  const name = columnName(column)
  const heading = Option.match(columns[column], {
    onNone: () => name,
    onSome: rows => `${name} (${rows.length})`,
  })
  const maybeSelectedId = board.detail._tag === 'CardSelected' ? Option.some(board.detail.cardId) : Option.none()
  return h.section(
    [testId(`col-${column}`, h), h.Class('column')],
    [
      h.h2([testId(`head-${column}`, h)], [heading]),
      columnBody(state, columns, column, maybeSelectedId, h),
      ...(column === 'todo'
        ? [addCardForm(board, h), errorLine('add-error', board.maybeAddError, 'add error', h)]
        : []),
    ],
  )
}

// DETAIL

const checklistRowView = (row: ChecklistRow, h: H): Html => {
  if (row._tag === 'AddingItemRow') {
    return h.keyed('li')(`adding-${row.opId}`, [h.Class('item-row adding')], [
      h.span([testId('item', h)], [`[ ] ${row.text} (adding…)`]),
    ])
  }
  const { item } = row
  return h.keyed('li')(`item-${item.id}`, [h.Class('item-row')], [
    h.span([testId('item', h)], [`${item.done ? '[x]' : '[ ]'} ${item.text}`]),
    h.button(
      [
        testId('toggle', h),
        h.Type('button'),
        h.AriaLabel(`toggle ${item.text}`),
        h.OnClick(Message.ClickedToggleItem({ itemId: item.id })),
      ],
      ['toggle'],
    ),
  ])
}

const checklistView = (board: Board, selected: CardSelected, h: H): Html => {
  const { checklist } = selected
  if (checklist._tag === 'ChecklistLoading') {
    return h.div([testId('checklist', h), h.Class('checklist')], [h.p([h.Class('muted')], ['loading checklist'])])
  }
  if (checklist._tag === 'ChecklistFailed') {
    return h.div(
      [testId('checklist', h), h.Class('checklist')],
      [h.p([h.Class('error')], [`checklist error: ${checklist.error}`])],
    )
  }
  const rows = applyPendingItemOps(checklist.items, board.pending, selected.cardId)
  const doneCount = Array.length(Array.filter(rows, row => row._tag === 'ItemRow' && row.item.done))
  return h.div(
    [testId('checklist', h), h.Class('checklist')],
    [
      h.ul(
        [h.Class('items')],
        Array.map(rows, row => checklistRowView(row, h)),
      ),
      h.p([testId('progress', h)], [`${doneCount}/${rows.length} done`]),
    ],
  )
}

const selectedView = (board: Board, selected: CardSelected, location: CardLocation, h: H): ReadonlyArray<Html> => [
  h.h2([h.Class('detail-title')], [`#${location.card.id} ${location.card.title}`]),
  h.p([h.Class('muted')], [`in ${columnName(location.column)}`]),
  h.form(
    [h.Class('add-form'), h.OnSubmit(Message.ClickedRename())],
    [
      h.input([
        testId('title-input', h),
        h.Type('text'),
        h.Placeholder('New title'),
        h.AriaLabel('New title'),
        h.Value(selected.titleInput),
        h.OnInput(value => Message.UpdatedTitleInput({ value })),
      ]),
      h.button([testId('rename', h), h.Type('submit')], ['rename']),
    ],
  ),
  errorLine('rename-error', selected.maybeRenameError, 'rename error', h),
  h.button([testId('archive', h), h.Type('button'), h.OnClick(Message.ClickedArchive())], ['archive']),
  h.h3([], ['Checklist']),
  checklistView(board, selected, h),
  errorLine('item-error', selected.maybeItemError, 'item error', h),
  h.form(
    [h.Class('add-form'), h.OnSubmit(Message.ClickedAddItem())],
    [
      h.input([
        testId('item-input', h),
        h.Type('text'),
        h.Placeholder('New item'),
        h.AriaLabel('New checklist item'),
        h.Value(selected.itemInput),
        h.OnInput(value => Message.UpdatedItemInput({ value })),
      ]),
      h.button(
        [testId('add-item', h), h.Type('submit'), h.Disabled(selected.checklist._tag !== 'ChecklistLoaded')],
        ['add item'],
      ),
    ],
  ),
]

const nothingSelected = (h: H): ReadonlyArray<Html> => [h.p([h.Class('muted')], ['select a card'])]

const detailView = (board: Board, columns: Columns, h: H): Html =>
  h.aside(
    [testId('detail', h), h.Class('detail')],
    board.detail._tag === 'CardSelected'
      ? pipeSelected(board, board.detail, columns, h)
      : nothingSelected(h),
  )

const pipeSelected = (board: Board, selected: CardSelected, columns: Columns, h: H): ReadonlyArray<Html> =>
  Option.match(locateCard(columns, selected.cardId), {
    onNone: () => nothingSelected(h),
    onSome: location => selectedView(board, selected, location, h),
  })

const boardView = (board: Board, h: H): Html => {
  const columns = displayedColumns(board)
  return h.main(
    [h.Class('board-page')],
    [
      h.div(
        [h.Class('board-errors')],
        [
          errorLine('move-error', board.maybeMoveError, 'move error', h),
          errorLine('archive-error', board.maybeArchiveError, 'archive error', h),
        ],
      ),
      h.div(
        [h.Class('board-layout')],
        [
          h.div(
            [h.Class('columns')],
            Array.map(COLUMN_IDS, column => columnView(board, columns, column, h)),
          ),
          detailView(board, columns, h),
        ],
      ),
    ],
  )
}

// ARCHIVE

const archiveListView = (archive: Archive, h: H): Html => {
  const { list } = archive
  if (list._tag === 'ArchiveLoading') {
    return h.div([testId('archived', h)], [h.p([h.Class('muted')], ['loading archive'])])
  }
  if (list._tag === 'ArchiveFailed') {
    return h.div([testId('archived', h)], [h.p([h.Class('error')], [`archive error: ${list.error}`])])
  }
  const visible = Array.filter(
    list.cards,
    card => !Array.some(archive.pendingRestores, restore => restore.cardId === card.id),
  )
  return h.div(
    [testId('archived', h)],
    [
      Array.match(visible, {
        onEmpty: () => h.p([h.Class('muted')], ['nothing archived']),
        onNonEmpty: cards =>
          h.ul(
            [h.Class('cards')],
            Array.map(cards, card =>
              h.keyed('li')(`archived-${card.id}`, [h.Class('card-row')], [
                h.span([testId('archived-card', h), h.Class('card')], [`#${card.id} ${card.title}`]),
                h.button(
                  [
                    testId('restore', h),
                    h.Type('button'),
                    h.AriaLabel(`restore #${card.id}`),
                    h.OnClick(Message.ClickedRestore({ cardId: card.id })),
                  ],
                  ['restore'],
                ),
              ]),
            ),
          ),
      }),
    ],
  )
}

const archiveView = (archive: Archive, h: H): Html =>
  h.main(
    [h.Class('archive-page')],
    [
      h.h2([], ['Archived cards']),
      errorLine('restore-error', archive.maybeRestoreError, 'restore error', h),
      archiveListView(archive, h),
    ],
  )

// VIEW

export const view = (model: Model, h: H): Document => ({
  title: model.page._tag === 'BoardPage' ? 'Sprint board' : 'Sprint board · Archive',
  body: h.div(
    [h.Class('app')],
    [
      h.style([], [STYLES]),
      h.h1([], ['Sprint board']),
      tabsView(model, h),
      model.page._tag === 'BoardPage' ? boardView(model.page.board, h) : archiveView(model.page.archive, h),
    ],
  ),
})
