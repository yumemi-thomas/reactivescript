import { Array, Option } from 'effect'
import type { Document, Html, HtmlBuilder } from 'foldkit/html'

import {
  ArchiveLoad,
  COLUMN_IDS,
  ChecklistLoad,
  type ColumnId,
  ColumnLoad,
  type ShownColumns,
  type ShownEntry,
  type ShownItem,
  WIP_LIMIT,
  columnName,
  columnOffset,
  locateCard,
  realCount,
  shownColumns,
  shownCount,
  shownItems,
} from './domain'
import type { Archive, Board, Model, Selection } from './main'
import { type Direction, Message } from './message'

type H = HtmlBuilder<Message>

const testId = (h: H, id: string) => h.DataAttribute('testid', id)

// STYLE

const STYLES = `
:root { color-scheme: light dark; --bg: #f6f7f9; --panel: #ffffff; --text: #1d2330; --muted: #5b6475; --line: #d9dde5; --accent: #2f5bd3; --danger: #b42318; }
@media (prefers-color-scheme: dark) { :root { --bg: #14171d; --panel: #1d222b; --text: #e7eaf0; --muted: #9aa3b5; --line: #323a47; --accent: #7aa2ff; --danger: #ff8a80; } }
body { margin: 0; background: var(--bg); color: var(--text); font: 14px/1.4 system-ui, sans-serif; }
.app { max-width: 1100px; margin: 0 auto; padding: 16px; }
.tabs { display: flex; gap: 8px; margin-bottom: 16px; }
.tabs button[aria-current="page"] { background: var(--accent); color: #fff; border-color: var(--accent); }
button { font: inherit; padding: 4px 10px; border: 1px solid var(--line); border-radius: 6px; background: var(--panel); color: var(--text); cursor: pointer; }
button:disabled { opacity: .45; cursor: not-allowed; }
input { font: inherit; padding: 4px 8px; border: 1px solid var(--line); border-radius: 6px; background: var(--panel); color: var(--text); min-width: 0; }
.board { display: grid; grid-template-columns: 3fr 1fr; gap: 16px; }
.columns { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
@media (max-width: 800px) { .board, .columns { grid-template-columns: 1fr; } }
.column, .detail, .archive { background: var(--panel); border: 1px solid var(--line); border-radius: 10px; padding: 12px; }
.column h2, .detail h2, .archive h2 { font-size: 15px; margin: 0 0 8px; }
.cards, .items, .archived { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.card-row { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; border: 1px solid var(--line); border-radius: 8px; padding: 6px; }
.card { flex: 1 1 100%; text-align: left; border: none; padding: 2px 4px; background: transparent; }
.card.selected { outline: 2px solid var(--accent); border-radius: 4px; }
.card.pending { color: var(--muted); font-style: italic; }
.moves { display: flex; gap: 4px; }
.moves button { padding: 0 6px; font-size: 12px; }
.inline-form { display: flex; gap: 6px; margin-top: 10px; }
.inline-form input { flex: 1; }
.error { color: var(--danger); margin: 6px 0; }
.muted { color: var(--muted); }
.item-row { display: flex; align-items: center; gap: 6px; }
.item { flex: 1; }
.notices:empty { display: none; }
`

// VIEW

export const view = (model: Model, h: H): Document => ({
  title: 'Sprint board',
  body: h.div(
    [h.Class('app')],
    [
      h.style([], [STYLES]),
      tabsView(model, h),
      model.page._tag === 'BoardPage'
        ? boardView(model.page.board, h)
        : archiveView(model.page.archive, h),
    ],
  ),
})

const tabsView = (model: Model, h: H): Html => {
  const isBoard = model.page._tag === 'BoardPage'
  return h.nav(
    [h.Class('tabs'), h.AriaLabel('Pages')],
    [
      h.button(
        [
          testId(h, 'tab-board'),
          h.Type('button'),
          h.AriaCurrent(isBoard ? 'page' : 'false'),
          h.OnClick(Message.ClickedBoardTab()),
        ],
        ['Board'],
      ),
      h.button(
        [
          testId(h, 'tab-archive'),
          h.Type('button'),
          h.AriaCurrent(isBoard ? 'false' : 'page'),
          h.OnClick(Message.ClickedArchiveTab()),
        ],
        ['Archive'],
      ),
    ],
  )
}

const errorLine = (
  maybeError: Option.Option<string>,
  prefix: string,
  id: string,
  h: H,
): Html =>
  Option.match(maybeError, {
    onNone: () => h.empty,
    onSome: error =>
      h.p(
        [testId(h, id), h.Class('error'), h.Role('alert')],
        [`${prefix}: ${error}`],
      ),
  })

// BOARD

const boardView = (board: Board, h: H): Html => {
  const shown = shownColumns(board.columns, board.operations)
  return h.main(
    [h.Class('board')],
    [
      h.div(
        [],
        [
          h.div(
            [h.Class('notices')],
            [
              errorLine(board.maybeMoveError, 'move error', 'move-error', h),
              errorLine(
                board.maybeArchiveError,
                'archive error',
                'archive-error',
                h,
              ),
            ],
          ),
          h.div(
            [h.Class('columns')],
            Array.map(COLUMN_IDS, column =>
              columnView(board, shown, column, h),
            ),
          ),
        ],
      ),
      detailView(board, shown, h),
    ],
  )
}

const columnView = (
  board: Board,
  shown: ShownColumns,
  column: ColumnId,
  h: H,
): Html => {
  const load = board.columns[column]
  const heading = Option.match(shown[column], {
    onNone: () => columnName(column),
    onSome: entries => `${columnName(column)} (${entries.length})`,
  })
  return h.section(
    [
      testId(h, `col-${column}`),
      h.Class('column'),
      h.AriaLabel(columnName(column)),
    ],
    [
      h.h2([testId(h, `head-${column}`)], [heading]),
      ColumnLoad.match(load, {
        ColumnLoading: () => h.p([h.Class('muted')], ['loading']),
        ColumnFailed: ({ error }) =>
          h.div(
            [],
            [
              h.p([h.Class('error'), h.Role('alert')], [`error: ${error}`]),
              h.button(
                [
                  testId(h, `retry-${column}`),
                  h.Type('button'),
                  h.OnClick(Message.ClickedRetryColumn({ column })),
                ],
                ['retry'],
              ),
            ],
          ),
        ColumnLoaded: () =>
          h.ul(
            [h.Class('cards')],
            Array.map(
              Option.getOrElse(shown[column], () => []),
              (entry, index) =>
                entryView(board, shown, column, index, entry, h),
            ),
          ),
      }),
      column === 'todo' ? newCardView(board, h) : h.empty,
    ],
  )
}

const entryView = (
  board: Board,
  shown: ShownColumns,
  column: ColumnId,
  index: number,
  entry: ShownEntry,
  h: H,
): Html =>
  entry._tag === 'Adding'
    ? h.keyed('li')(
        `adding-${entry.operationId}`,
        [h.Class('card-row')],
        [
          h.span(
            [testId(h, 'card'), h.Class('card pending'), h.AriaBusy(true)],
            [`${entry.title} (adding…)`],
          ),
        ],
      )
    : realCardView(board, shown, column, index, entry.card, h)

const realCardView = (
  board: Board,
  shown: ShownColumns,
  column: ColumnId,
  index: number,
  card: { id: number; title: string; done: number; total: number },
  h: H,
): Html => {
  const isSelected = Option.exists(
    board.maybeSelection,
    selection => selection.cardId === card.id,
  )
  const count = realCount(shown, column)
  const isDoingFull = shownCount(shown, 'doing') >= WIP_LIMIT
  const sideways = (offset: number, direction: Direction): Html =>
    Option.match(columnOffset(column, offset), {
      onNone: () => h.empty,
      onSome: target =>
        moveButton(
          card.id,
          direction,
          Option.isNone(shown[target]) || (target === 'doing' && isDoingFull),
          h,
        ),
    })
  return h.keyed('li')(
    `card-${card.id}`,
    [h.Class('card-row')],
    [
      h.button(
        [
          testId(h, 'card'),
          h.Type('button'),
          h.Class(isSelected ? 'card selected' : 'card'),
          h.AriaPressed(isSelected ? 'true' : 'false'),
          h.OnClick(Message.ClickedCard({ cardId: card.id })),
        ],
        [`#${card.id} ${card.title} · ${card.done}/${card.total}`],
      ),
      h.div(
        [h.Class('moves')],
        [
          sideways(-1, 'left'),
          sideways(1, 'right'),
          index > 0 ? moveButton(card.id, 'up', false, h) : h.empty,
          index < count - 1 ? moveButton(card.id, 'down', false, h) : h.empty,
        ],
      ),
    ],
  )
}

const moveButton = (
  cardId: number,
  direction: Direction,
  isDisabled: boolean,
  h: H,
): Html =>
  h.button(
    [
      testId(h, direction),
      h.Type('button'),
      h.Disabled(isDisabled),
      h.AriaLabel(`move #${cardId} ${direction}`),
      h.OnClick(Message.ClickedMove({ cardId, direction })),
    ],
    [direction],
  )

const newCardView = (board: Board, h: H): Html =>
  h.div(
    [],
    [
      h.form(
        [h.Class('inline-form'), h.OnSubmit(Message.SubmittedNewCard())],
        [
          h.input([
            testId(h, 'new-card'),
            h.Type('text'),
            h.AriaLabel('New card title'),
            h.Placeholder('New card'),
            h.Autocomplete('off'),
            h.Value(board.newCardInput),
            h.OnInput(value => Message.UpdatedNewCardInput({ value })),
          ]),
          h.button(
            [
              testId(h, 'add-card'),
              h.Type('submit'),
              h.Disabled(!ColumnLoad.guards.ColumnLoaded(board.columns.todo)),
            ],
            ['add'],
          ),
        ],
      ),
      errorLine(board.maybeAddError, 'add error', 'add-error', h),
    ],
  )

// DETAIL

const detailView = (board: Board, shown: ShownColumns, h: H): Html =>
  h.aside(
    [testId(h, 'detail'), h.Class('detail'), h.AriaLabel('Card detail')],
    [
      Option.match(
        Option.flatMap(board.maybeSelection, selection =>
          Option.map(locateCard(shown, selection.cardId), location => ({
            selection,
            location,
          })),
        ),
        {
          onNone: () => h.p([h.Class('muted')], ['select a card']),
          onSome: ({ selection, location }) =>
            selectedView(
              board,
              selection,
              location.card.title,
              location.column,
              h,
            ),
        },
      ),
    ],
  )

const selectedView = (
  board: Board,
  selection: Selection,
  title: string,
  column: ColumnId,
  h: H,
): Html =>
  h.div(
    [],
    [
      h.h2([], [`#${selection.cardId} ${title}`]),
      h.p([h.Class('muted')], [`in ${columnName(column)}`]),
      h.form(
        [h.Class('inline-form'), h.OnSubmit(Message.SubmittedRename())],
        [
          h.input([
            testId(h, 'title-input'),
            h.Type('text'),
            h.AriaLabel('New title'),
            h.Placeholder('New title'),
            h.Autocomplete('off'),
            h.Value(selection.titleInput),
            h.OnInput(value => Message.UpdatedTitleInput({ value })),
          ]),
          h.button([testId(h, 'rename'), h.Type('submit')], ['rename']),
        ],
      ),
      errorLine(selection.maybeRenameError, 'rename error', 'rename-error', h),
      h.div(
        [h.Class('inline-form')],
        [
          h.button(
            [
              testId(h, 'archive'),
              h.Type('button'),
              h.OnClick(Message.ClickedArchive()),
            ],
            ['archive'],
          ),
        ],
      ),
      checklistView(board, selection, h),
      errorLine(selection.maybeItemError, 'item error', 'item-error', h),
    ],
  )

const checklistView = (board: Board, selection: Selection, h: H): Html =>
  h.section(
    [testId(h, 'checklist'), h.AriaLabel('Checklist')],
    [
      h.h2([], ['Checklist']),
      ChecklistLoad.match(selection.checklist, {
        ChecklistLoading: () => h.p([h.Class('muted')], ['loading checklist']),
        ChecklistFailed: ({ error }) =>
          h.p([h.Class('error')], [`checklist error: ${error}`]),
        ChecklistLoaded: ({ items }) =>
          loadedChecklistView(
            selection,
            shownItems(selection.cardId, items, board.operations),
            h,
          ),
      }),
    ],
  )

const loadedChecklistView = (
  selection: Selection,
  items: ReadonlyArray<ShownItem>,
  h: H,
): Html => {
  const doneCount = Array.filter(
    items,
    item => item._tag === 'RealItem' && item.item.done,
  ).length
  return h.div(
    [],
    [
      h.ul([h.Class('items')], Array.map(items, item => itemView(item, h))),
      h.p([testId(h, 'progress')], [`${doneCount}/${items.length} done`]),
      h.form(
        [h.Class('inline-form'), h.OnSubmit(Message.SubmittedNewItem())],
        [
          h.input([
            testId(h, 'item-input'),
            h.Type('text'),
            h.AriaLabel('New item'),
            h.Placeholder('New item'),
            h.Autocomplete('off'),
            h.Value(selection.itemInput),
            h.OnInput(value => Message.UpdatedItemInput({ value })),
          ]),
          h.button([testId(h, 'add-item'), h.Type('submit')], ['add item']),
        ],
      ),
    ],
  )
}

const itemView = (shownItem: ShownItem, h: H): Html =>
  shownItem._tag === 'AddingItem'
    ? h.keyed('li')(
        `adding-${shownItem.operationId}`,
        [h.Class('item-row')],
        [
          h.span(
            [testId(h, 'item'), h.Class('item muted'), h.AriaBusy(true)],
            [`[ ] ${shownItem.text} (adding…)`],
          ),
        ],
      )
    : h.keyed('li')(
        `item-${shownItem.item.id}`,
        [h.Class('item-row')],
        [
          h.span(
            [testId(h, 'item'), h.Class('item')],
            [`${shownItem.item.done ? '[x]' : '[ ]'} ${shownItem.item.text}`],
          ),
          h.button(
            [
              testId(h, 'toggle'),
              h.Type('button'),
              h.AriaLabel(`toggle ${shownItem.item.text}`),
              h.OnClick(Message.ClickedToggleItem({ itemId: shownItem.item.id })),
            ],
            ['toggle'],
          ),
        ],
      )

// ARCHIVE

const archiveView = (archive: Archive, h: H): Html =>
  h.main(
    [h.Class('archive')],
    [
      h.h2([], ['Archive']),
      errorLine(
        archive.maybeRestoreError,
        'restore error',
        'restore-error',
        h,
      ),
      h.div(
        [testId(h, 'archived')],
        [
          ArchiveLoad.match(archive.archived, {
            ArchiveLoading: () => h.p([h.Class('muted')], ['loading archive']),
            ArchiveFailed: ({ error }) =>
              h.p([h.Class('error')], [`archive error: ${error}`]),
            ArchiveLoaded: ({ cards }) =>
              h.ul(
                [h.Class('archived')],
                pipeVisible(cards, archive.restoringIds, card =>
                  h.keyed('li')(
                    `archived-${card.id}`,
                    [h.Class('card-row')],
                    [
                      h.span(
                        [testId(h, 'archived-card'), h.Class('card')],
                        [`#${card.id} ${card.title}`],
                      ),
                      h.button(
                        [
                          testId(h, 'restore'),
                          h.Type('button'),
                          h.AriaLabel(`restore #${card.id}`),
                          h.OnClick(Message.ClickedRestore({ cardId: card.id })),
                        ],
                        ['restore'],
                      ),
                    ],
                  ),
                ),
              ),
          }),
        ],
      ),
    ],
  )

const pipeVisible = <A extends { id: number }>(
  cards: ReadonlyArray<A>,
  restoringIds: ReadonlyArray<number>,
  f: (card: A) => Html,
): Array<Html> =>
  Array.map(
    Array.filter(cards, card => !Array.contains(restoringIds, card.id)),
    f,
  )
