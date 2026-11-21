import { Array, Option } from 'effect'
import { type Document, type Html, type HtmlBuilder } from 'foldkit/html'

import {
  ArchiveLoad,
  COLUMN_IDS,
  type ColumnId,
  ColumnLoad,
  type Lanes,
  type ShownItem,
  ShownRow,
  columnName,
  columnToLeft,
  columnToRight,
  countDone,
  type Direction,
  moveTarget,
  findShownCard,
  shownItems,
  shownLanes,
} from './domain'
import { Message } from './message'
import {
  type Archive,
  type Board,
  ChecklistLoad,
  type Model,
  Page,
  type SelectedCard,
} from './model'

// VIEW

const testId = (h: HtmlBuilder<Message>, id: string) =>
  h.DataAttribute('testid', id)

const errorLine = (
  h: HtmlBuilder<Message>,
  id: Option.Option<string>,
  prefix: string,
  maybeError: Option.Option<string>,
): Html =>
  Option.match(maybeError, {
    onNone: () => h.empty,
    onSome: error =>
      h.p(
        [
          h.Class('error'),
          h.Role('alert'),
          ...Option.match(id, {
            onNone: () => [],
            onSome: value => [testId(h, value)],
          }),
        ],
        [`${prefix} error: ${error}`],
      ),
  })

const tabsView = (model: Model, h: HtmlBuilder<Message>): Html => {
  const isBoard = model.page._tag === 'BoardPage'
  return h.nav(
    [h.Class('tabs'), h.Role('tablist')],
    [
      h.button(
        [
          testId(h, 'tab-board'),
          h.Type('button'),
          h.Role('tab'),
          h.AriaSelected(isBoard),
          h.Class(isBoard ? 'tab active' : 'tab'),
          h.OnClick(Message.ClickedBoardTab()),
        ],
        ['Board'],
      ),
      h.button(
        [
          testId(h, 'tab-archive'),
          h.Type('button'),
          h.Role('tab'),
          h.AriaSelected(!isBoard),
          h.Class(isBoard ? 'tab' : 'tab active'),
          h.OnClick(Message.ClickedArchiveTab()),
        ],
        ['Archive'],
      ),
    ],
  )
}

// BOARD

const moveButton = (
  h: HtmlBuilder<Message>,
  lanes: Lanes<ShownRow>,
  column: ColumnId,
  index: number,
  cardId: number,
  direction: Direction,
): Html =>
  h.button(
    [
      testId(h, direction),
      h.Type('button'),
      h.Class('move'),
      h.AriaLabel(`move ${direction}`),
      h.Disabled(Option.isNone(moveTarget(lanes, column, index, direction))),
      h.OnClick(Message.ClickedMove({ cardId, direction })),
    ],
    [direction],
  )

const rowView = (
  board: Board,
  lanes: Lanes<ShownRow>,
  column: ColumnId,
  length: number,
  h: HtmlBuilder<Message>,
) =>
  (row: ShownRow, index: number): Html =>
    ShownRow.match(row, {
      AddingRow: ({ operationId, title }) =>
        h.keyed('li')(`adding-${operationId}`, [h.Class('row pending')], [
          h.span([testId(h, 'card'), h.Class('card')], [`${title} (adding…)`]),
        ]),
      SettledRow: ({ card }) => {
        const isSelected = Option.exists(
          board.maybeSelected,
          selected => selected.cardId === card.id,
        )
        const buttons: ReadonlyArray<Html> = [
          Option.isSome(columnToLeft(column))
            ? moveButton(h, lanes, column, index, card.id, 'left')
            : h.empty,
          Option.isSome(columnToRight(column))
            ? moveButton(h, lanes, column, index, card.id, 'right')
            : h.empty,
          index > 0 ? moveButton(h, lanes, column, index, card.id, 'up') : h.empty,
          index < length - 1
            ? moveButton(h, lanes, column, index, card.id, 'down')
            : h.empty,
        ]
        return h.keyed('li')(
          `card-${card.id}`,
          [h.Class(isSelected ? 'row selected' : 'row')],
          [
            h.button(
              [
                testId(h, 'card'),
                h.Type('button'),
                h.Class('card'),
                h.AriaPressed(isSelected ? 'true' : 'false'),
                h.OnClick(Message.ClickedCard({ cardId: card.id })),
              ],
              [`#${card.id} ${card.title} · ${card.done}/${card.total}`],
            ),
            h.span([h.Class('moves')], buttons),
          ],
        )
      },
    })

const addCardForm = (board: Board, h: HtmlBuilder<Message>): Html =>
  h.div(
    [h.Class('add-form')],
    [
      h.input([
        testId(h, 'new-card'),
        h.Type('text'),
        h.AriaLabel('New card title'),
        h.Placeholder('New card title'),
        h.Value(board.newCardInput),
        h.OnInput(value => Message.UpdatedNewCardInput({ value })),
      ]),
      h.button(
        [
          testId(h, 'add-card'),
          h.Type('button'),
          h.Disabled(board.columns.todo._tag !== 'ColumnLoaded'),
          h.OnClick(Message.ClickedAddCard()),
        ],
        ['Add card'],
      ),
      errorLine(h, Option.some('add-error'), 'add', board.maybeAddError),
    ],
  )

const columnView = (
  board: Board,
  lanes: Lanes<ShownRow>,
  h: HtmlBuilder<Message>,
) =>
  (column: ColumnId): Html => {
    const name = columnName(column)
    const load = board.columns[column]
    const rows = Option.getOrElse(lanes[column], () => [])
    const heading = load._tag === 'ColumnLoaded' ? `${name} (${rows.length})` : name
    return h.section(
      [testId(h, `col-${column}`), h.Class('column'), h.AriaLabel(name)],
      [
        h.h2([testId(h, `head-${column}`)], [heading]),
        ColumnLoad.match(load, {
          ColumnLoading: () => h.p([h.Class('status')], ['loading']),
          ColumnFailed: ({ error }) =>
            h.div(
              [h.Class('status')],
              [
                h.p([h.Class('error')], [`error: ${error}`]),
                h.button(
                  [
                    testId(h, `retry-${column}`),
                    h.Type('button'),
                    h.OnClick(Message.ClickedRetryColumn({ column })),
                  ],
                  ['Retry'],
                ),
              ],
            ),
          ColumnLoaded: () =>
            h.ul(
              [h.Class('cards')],
              Array.map(rows, rowView(board, lanes, column, rows.length, h)),
            ),
        }),
        column === 'todo' ? addCardForm(board, h) : h.empty,
      ],
    )
  }

const itemRow = (h: HtmlBuilder<Message>) => (item: ShownItem): Html =>
  item._tag === 'AddingItem'
    ? h.keyed('li')(`adding-${item.operationId}`, [h.Class('item pending')], [
        h.span([testId(h, 'item')], [`[ ] ${item.text} (adding…)`]),
      ])
    : h.keyed('li')(`item-${item.item.id}`, [h.Class('item')], [
        h.span(
          [testId(h, 'item')],
          [`${item.item.done ? '[x]' : '[ ]'} ${item.item.text}`],
        ),
        h.button(
          [
            testId(h, 'toggle'),
            h.Type('button'),
            h.AriaLabel(`toggle ${item.item.text}`),
            h.OnClick(Message.ClickedToggleItem({ itemId: item.item.id })),
          ],
          ['toggle'],
        ),
      ])

const checklistView = (
  board: Board,
  selected: SelectedCard,
  h: HtmlBuilder<Message>,
): Html =>
  h.section(
    [testId(h, 'checklist'), h.Class('checklist'), h.AriaLabel('Checklist')],
    ChecklistLoad.match(selected.checklist, {
      ChecklistLoading: () => [h.p([h.Class('status')], ['loading checklist'])],
      ChecklistFailed: ({ error }) => [
        h.p([h.Class('error')], [`checklist error: ${error}`]),
      ],
      ChecklistLoaded: () => {
        const items = Option.getOrElse(
          shownItems(board.checklists, board.operations, selected.cardId),
          () => [],
        )
        return [
          h.ul([h.Class('items')], Array.map(items, itemRow(h))),
          h.p(
            [testId(h, 'progress')],
            [`${countDone(items)}/${items.length} done`],
          ),
        ]
      },
    }),
  )

const detailView = (
  board: Board,
  lanes: Lanes<ShownRow>,
  h: HtmlBuilder<Message>,
): Html => {
  const nothingSelected = [h.p([h.Class('status')], ['select a card'])]
  return h.aside(
    [testId(h, 'detail'), h.Class('detail'), h.AriaLabel('Card detail')],
    Option.match(board.maybeSelected, {
      onNone: () => nothingSelected,
      onSome: selected =>
        Option.match(findShownCard(lanes, selected.cardId), {
          onNone: () => nothingSelected,
          onSome: ({ column, card }) => {
            const isChecklistLoaded = selected.checklist._tag === 'ChecklistLoaded'
            return [
              h.h2([], [`#${card.id} ${card.title}`]),
              h.p([], [`in ${columnName(column)}`]),
              h.div(
                [h.Class('row-form')],
                [
                  h.input([
                    testId(h, 'title-input'),
                    h.Type('text'),
                    h.AriaLabel('New title'),
                    h.Placeholder('New title'),
                    h.Value(selected.titleInput),
                    h.OnInput(value => Message.UpdatedTitleInput({ value })),
                  ]),
                  h.button(
                    [
                      testId(h, 'rename'),
                      h.Type('button'),
                      h.OnClick(Message.ClickedRename()),
                    ],
                    ['Rename'],
                  ),
                  h.button(
                    [
                      testId(h, 'archive'),
                      h.Type('button'),
                      h.OnClick(Message.ClickedArchive()),
                    ],
                    ['Archive'],
                  ),
                ],
              ),
              errorLine(h, Option.none(), 'rename', selected.maybeRenameError),
              checklistView(board, selected, h),
              h.div(
                [h.Class('row-form')],
                [
                  h.input([
                    testId(h, 'item-input'),
                    h.Type('text'),
                    h.AriaLabel('New checklist item'),
                    h.Placeholder('New checklist item'),
                    h.Value(selected.itemInput),
                    h.OnInput(value => Message.UpdatedItemInput({ value })),
                  ]),
                  h.button(
                    [
                      testId(h, 'add-item'),
                      h.Type('button'),
                      h.Disabled(!isChecklistLoaded),
                      h.OnClick(Message.ClickedAddItem()),
                    ],
                    ['Add item'],
                  ),
                ],
              ),
              errorLine(h, Option.none(), 'item', selected.maybeItemError),
            ]
          },
        }),
    }),
  )
}

const boardView = (board: Board, h: HtmlBuilder<Message>): Html => {
  const lanes = shownLanes(board.columns, board.checklists, board.operations)
  return h.main(
    [h.Class('board-page')],
    [
      errorLine(h, Option.some('move-error'), 'move', board.maybeMoveError),
      errorLine(h, Option.some('archive-error'), 'archive', board.maybeArchiveError),
      h.div(
        [h.Class('board')],
        [
          h.div(
            [h.Class('columns')],
            Array.map(COLUMN_IDS, columnView(board, lanes, h)),
          ),
          detailView(board, lanes, h),
        ],
      ),
    ],
  )
}

// ARCHIVE

const archiveView = (archive: Archive, h: HtmlBuilder<Message>): Html =>
  h.main(
    [h.Class('archive-page')],
    [
      h.section(
        [testId(h, 'archived'), h.AriaLabel('Archived cards')],
        [
          ArchiveLoad.match(archive.list, {
            ArchiveLoading: () => h.p([h.Class('status')], ['loading archive']),
            ArchiveFailed: ({ error }) =>
              h.p([h.Class('error')], [`archive error: ${error}`]),
            ArchiveLoaded: ({ cards }) => {
              const shown = Array.filter(
                cards,
                card =>
                  !Array.some(
                    archive.restores,
                    restore => restore.cardId === card.id,
                  ),
              )
              return Array.match(shown, {
                onEmpty: () => h.p([h.Class('status')], ['nothing archived']),
                onNonEmpty: rows =>
                  h.ul(
                    [h.Class('archived-list')],
                    Array.map(rows, card =>
                      h.keyed('li')(`archived-${card.id}`, [h.Class('row')], [
                        h.span(
                          [testId(h, 'archived-card')],
                          [`#${card.id} ${card.title}`],
                        ),
                        h.button(
                          [
                            testId(h, 'restore'),
                            h.Type('button'),
                            h.OnClick(Message.ClickedRestore({ cardId: card.id })),
                          ],
                          ['restore'],
                        ),
                      ]),
                    ),
                  ),
              })
            },
          }),
        ],
      ),
      errorLine(h, Option.none(), 'restore', archive.maybeRestoreError),
    ],
  )

// STYLE

const STYLE = [
  'body { margin: 0; font-family: system-ui, sans-serif; background: #f5f6f8; color: #1d2330; }',
  '.app { max-width: 1100px; margin: 0 auto; padding: 16px; }',
  '.tabs { display: flex; gap: 8px; margin-bottom: 16px; }',
  '.tab { padding: 6px 14px; border: 1px solid #c7ccd6; background: #fff; border-radius: 6px; cursor: pointer; }',
  '.tab.active { background: #1d2330; color: #fff; }',
  '.board { display: grid; grid-template-columns: 3fr 1fr; gap: 16px; }',
  '.columns { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }',
  '.column, .detail, .archive-page section { background: #fff; border-radius: 8px; padding: 12px; }',
  '.column h2, .detail h2 { font-size: 15px; margin: 0 0 8px; }',
  '.cards, .items, .archived-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }',
  '.row { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; }',
  '.card { flex: 1 1 100%; text-align: left; padding: 8px; border: 1px solid #dde1e8; border-radius: 6px; background: #fafbfc; cursor: pointer; font: inherit; }',
  '.row.selected .card { border-color: #3d6df2; background: #eef2fe; }',
  '.pending .card, .item.pending { opacity: 0.6; cursor: default; }',
  '.moves { display: flex; gap: 4px; }',
  '.move { font-size: 12px; }',
  '.add-form, .row-form { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }',
  '.item { display: flex; gap: 8px; align-items: center; }',
  '.error { color: #b3261e; }',
  '.status { color: #5b6475; }',
  '@media (max-width: 800px) { .board, .columns { grid-template-columns: 1fr; } }',
].join('\n')

export const view = (model: Model, h: HtmlBuilder<Message>): Document => ({
  title: model.page._tag === 'BoardPage' ? 'Sprint board' : 'Sprint archive',
  body: h.div(
    [h.Class('app')],
    [
      h.style([], [STYLE]),
      tabsView(model, h),
      Page.match(model.page, {
        BoardPage: ({ board }) => boardView(board, h),
        ArchivePage: ({ archive }) => archiveView(archive, h),
      }),
    ],
  ),
})
