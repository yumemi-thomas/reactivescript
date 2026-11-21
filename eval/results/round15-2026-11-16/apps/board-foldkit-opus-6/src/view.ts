import { Array, Option, pipe } from 'effect'
import type { Document, Html, HtmlBuilder } from 'foldkit/html'

import {
  BoardEntry,
  COLUMNS,
  ChecklistEntry,
  ChecklistState,
  type Column,
  ColumnState,
  type Lanes,
  columnName,
  findInLanes,
  isEntryOfCard,
  laneLength,
  nextColumn,
  previousColumn,
  shownChecklist,
} from './domain'
import { type Direction, Message, type Tab } from './message'
import {
  ArchiveList,
  type ArchiveModel,
  type BoardModel,
  type Model,
  Page,
  Selection,
} from './model'
import { canEnterColumn, currentTab, shownBoard } from './update'

type H = HtmlBuilder<Message>

const testId = (h: H, id: string) => h.DataAttribute('testid', id)

const errorLine = (
  maybeError: Option.Option<string>,
  id: string,
  prefix: string,
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

// TABS

const tabButton = (
  tab: Tab,
  label: string,
  current: Tab,
  h: H,
): Html =>
  h.button(
    [
      testId(h, `tab-${tab}`),
      h.Type('button'),
      h.Class(tab === current ? 'tab tab-current' : 'tab'),
      h.AriaPressed(tab === current ? 'true' : 'false'),
      h.OnClick(Message.ClickedTab({ tab })),
    ],
    [label],
  )

// BOARD

const moveButton = (
  cardId: number,
  direction: Direction,
  isEnabled: boolean,
  label: string,
  h: H,
): Html =>
  h.button(
    [
      testId(h, direction),
      h.Type('button'),
      h.Class('move'),
      h.Title(`move ${direction}: ${label}`),
      h.Disabled(!isEnabled),
      h.OnClick(Message.ClickedMove({ cardId, direction })),
    ],
    [direction],
  )

const entryView = (
  entry: BoardEntry,
  column: Column,
  index: number,
  lanes: Lanes<BoardEntry>,
  selection: Selection,
  h: H,
): Html =>
  BoardEntry.match(entry, {
    AddingCard: ({ operationId, title }) =>
      h.keyed('li')(`adding-${operationId}`, [h.Class('card-row adding')], [
        h.div([testId(h, 'card'), h.Class('card')], [`${title} (adding…)`]),
      ]),
    SavedCard: ({ card }) => {
      const isSelected = Selection.match(selection, {
        NotSelected: () => false,
        Selected: ({ cardId }) => cardId === card.id,
      })
      const label = `#${card.id} ${card.title}`
      const leftButton = Option.match(previousColumn(column), {
        onNone: () => h.empty,
        onSome: target =>
          moveButton(card.id, 'left', canEnterColumn(lanes, target), label, h),
      })
      const rightButton = Option.match(nextColumn(column), {
        onNone: () => h.empty,
        onSome: target =>
          moveButton(card.id, 'right', canEnterColumn(lanes, target), label, h),
      })
      const upButton = index > 0 ? moveButton(card.id, 'up', true, label, h) : h.empty
      const downButton =
        index < laneLength(lanes, column) - 1
          ? moveButton(card.id, 'down', true, label, h)
          : h.empty
      return h.keyed('li')(
        `card-${card.id}`,
        [h.Class(isSelected ? 'card-row selected' : 'card-row')],
        [
          h.button(
            [
              testId(h, 'card'),
              h.Type('button'),
              h.Class('card'),
              h.AriaPressed(isSelected ? 'true' : 'false'),
              h.OnClick(Message.ClickedCard({ cardId: card.id })),
            ],
            [`${label} · ${card.done}/${card.total}`],
          ),
          h.span([h.Class('moves')], [leftButton, rightButton, upButton, downButton]),
        ],
      )
    },
  })

const addCardForm = (board: BoardModel, isTodoLoaded: boolean, h: H): Html =>
  h.div(
    [h.Class('add-card')],
    [
      h.form(
        [h.Class('inline-form'), h.OnSubmit(Message.SubmittedNewCard())],
        [
          h.input([
            testId(h, 'new-card'),
            h.Type('text'),
            h.Placeholder('New card title'),
            h.AriaLabel('New card title'),
            h.Value(board.newCardTitle),
            h.OnInput(value => Message.UpdatedNewCardTitle({ value })),
          ]),
          h.button(
            [testId(h, 'add-card'), h.Type('submit'), h.Disabled(!isTodoLoaded)],
            ['Add'],
          ),
        ],
      ),
      errorLine(board.maybeAddError, 'add-error', 'add error', h),
    ],
  )

const columnView = (
  board: BoardModel,
  column: Column,
  lanes: Lanes<BoardEntry>,
  h: H,
): Html => {
  const state = board.columns[column]
  const heading = Option.match(lanes[column], {
    onNone: () => columnName(column),
    onSome: entries => `${columnName(column)} (${entries.length})`,
  })
  const body = ColumnState.match(state, {
    Loading: () => h.p([h.Class('status'), h.AriaLive('polite')], ['loading']),
    Failed: ({ error }) =>
      h.div(
        [h.Class('status')],
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
    Loaded: () =>
      pipe(
        Option.getOrElse(lanes[column], (): ReadonlyArray<BoardEntry> => []),
        Array.match({
          onEmpty: () => h.p([h.Class('status muted')], ['no cards']),
          onNonEmpty: entries =>
            h.ul(
              [h.Class('cards')],
              Array.map(entries, (entry, index) =>
                entryView(entry, column, index, lanes, board.selection, h),
              ),
            ),
        }),
      ),
  })
  return h.section(
    [testId(h, `col-${column}`), h.Class('column'), h.AriaLabel(columnName(column))],
    [
      h.h2([testId(h, `head-${column}`)], [heading]),
      body,
      column === 'todo'
        ? addCardForm(board, ColumnState.guards.Loaded(state), h)
        : h.empty,
    ],
  )
}

const checklistView = (
  board: BoardModel,
  selected: typeof Selection.Selected.Type,
  h: H,
): Html =>
  h.div(
    [testId(h, 'checklist'), h.Class('checklist')],
    [
      ChecklistState.match(selected.checklist, {
        Loading: () => h.p([h.Class('status')], ['loading checklist']),
        Failed: ({ error }) =>
          h.div(
            [],
            [
              h.p([h.Class('error'), h.Role('alert')], [`checklist error: ${error}`]),
              h.button(
                [
                  testId(h, 'retry-checklist'),
                  h.Type('button'),
                  h.OnClick(Message.ClickedRetryChecklist()),
                ],
                ['retry'],
              ),
            ],
          ),
        Loaded: ({ items }) => {
          const entries = shownChecklist(items, selected.cardId, board.operations)
          const doneCount = Array.filter(
            entries,
            entry => entry._tag === 'SavedItem' && entry.item.done,
          ).length
          return h.div(
            [],
            [
              h.ul(
                [h.Class('items')],
                Array.map(entries, entry => checklistEntryView(entry, h)),
              ),
              h.p(
                [testId(h, 'progress'), h.AriaLive('polite')],
                [`${doneCount}/${entries.length} done`],
              ),
            ],
          )
        },
      }),
    ],
  )

const checklistEntryView = (entry: ChecklistEntry, h: H): Html =>
  ChecklistEntry.match(entry, {
    AddingItem: ({ operationId, text }) =>
      h.keyed('li')(`adding-${operationId}`, [h.Class('item-row adding')], [
        h.span([testId(h, 'item')], [`[ ] ${text} (adding…)`]),
      ]),
    SavedItem: ({ item }) =>
      h.keyed('li')(`item-${item.id}`, [h.Class('item-row')], [
        h.span([testId(h, 'item')], [`${item.done ? '[x]' : '[ ]'} ${item.text}`]),
        h.button(
          [
            testId(h, 'toggle'),
            h.Type('button'),
            h.Title(`toggle ${item.text}`),
            h.OnClick(Message.ClickedToggle({ itemId: item.id })),
          ],
          ['toggle'],
        ),
      ]),
  })

const selectedDetailView = (
  board: BoardModel,
  selected: typeof Selection.Selected.Type,
  lanes: Lanes<BoardEntry>,
  h: H,
): Html =>
  pipe(
    findInLanes(lanes, isEntryOfCard(selected.cardId)),
    Option.flatMap(position =>
      BoardEntry.match(position.item, {
        SavedCard: ({ card }) => Option.some({ card, column: position.column }),
        AddingCard: () => Option.none(),
      }),
    ),
    Option.match({
      onNone: () => h.p([], ['select a card']),
      onSome: ({ card, column }) =>
        h.div(
          [],
          [
            h.h2([], [`#${card.id} ${card.title}`]),
            h.p([], [`in ${columnName(column)}`]),
            h.form(
              [h.Class('inline-form'), h.OnSubmit(Message.SubmittedRename())],
              [
                h.input([
                  testId(h, 'title-input'),
                  h.Type('text'),
                  h.Placeholder('New title'),
                  h.AriaLabel('New title'),
                  h.Value(selected.titleInput),
                  h.OnInput(value => Message.UpdatedTitleInput({ value })),
                ]),
                h.button([testId(h, 'rename'), h.Type('submit')], ['Rename']),
              ],
            ),
            errorLine(selected.maybeRenameError, 'rename-error', 'rename error', h),
            h.button(
              [
                testId(h, 'archive'),
                h.Type('button'),
                h.OnClick(Message.ClickedArchive()),
              ],
              ['Archive'],
            ),
            h.h3([], ['Checklist']),
            checklistView(board, selected, h),
            h.form(
              [h.Class('inline-form'), h.OnSubmit(Message.SubmittedNewItem())],
              [
                h.input([
                  testId(h, 'item-input'),
                  h.Type('text'),
                  h.Placeholder('New item'),
                  h.AriaLabel('New checklist item'),
                  h.Value(selected.itemInput),
                  h.OnInput(value => Message.UpdatedItemInput({ value })),
                ]),
                h.button([testId(h, 'add-item'), h.Type('submit')], ['Add item']),
              ],
            ),
            errorLine(selected.maybeItemError, 'item-error', 'item error', h),
          ],
        ),
    }),
  )

const detailView = (board: BoardModel, lanes: Lanes<BoardEntry>, h: H): Html =>
  h.aside(
    [testId(h, 'detail'), h.Class('detail'), h.AriaLabel('Card detail')],
    [
      Selection.match(board.selection, {
        NotSelected: () => h.p([], ['select a card']),
        Selected: selected => selectedDetailView(board, selected, lanes, h),
      }),
    ],
  )

const boardView = (board: BoardModel, h: H): Html => {
  const lanes = shownBoard(board)
  return h.div(
    [h.Class('board-page')],
    [
      errorLine(board.maybeMoveError, 'move-error', 'move error', h),
      errorLine(board.maybeArchiveError, 'archive-error', 'archive error', h),
      h.div(
        [h.Class('board')],
        [
          h.div(
            [h.Class('columns')],
            Array.map(COLUMNS, column => columnView(board, column, lanes, h)),
          ),
          detailView(board, lanes, h),
        ],
      ),
    ],
  )
}

// ARCHIVE

const archiveView = (archive: ArchiveModel, h: H): Html =>
  h.div(
    [h.Class('archive-page')],
    [
      h.h2([], ['Archive']),
      errorLine(archive.maybeRestoreError, 'restore-error', 'restore error', h),
      h.div(
        [testId(h, 'archived'), h.Class('archived')],
        [
          ArchiveList.match(archive.list, {
            Loading: () => h.p([h.Class('status')], ['loading archive']),
            Failed: ({ error }) =>
              h.div(
                [],
                [
                  h.p([h.Class('error'), h.Role('alert')], [`archive error: ${error}`]),
                  h.button(
                    [
                      testId(h, 'retry-archive'),
                      h.Type('button'),
                      h.OnClick(Message.ClickedRetryArchive()),
                    ],
                    ['retry'],
                  ),
                ],
              ),
            Loaded: ({ cards }) =>
              pipe(
                Array.filter(
                  cards,
                  card =>
                    !Array.some(
                      archive.pendingRestores,
                      pending => pending.cardId === card.id,
                    ),
                ),
                Array.match({
                  onEmpty: () => h.p([h.Class('status muted')], ['no archived cards']),
                  onNonEmpty: shown =>
                    h.ul(
                      [h.Class('cards')],
                      Array.map(shown, card =>
                        h.keyed('li')(`archived-${card.id}`, [h.Class('card-row')], [
                          h.span(
                            [testId(h, 'archived-card'), h.Class('card')],
                            [`#${card.id} ${card.title}`],
                          ),
                          h.button(
                            [
                              testId(h, 'restore'),
                              h.Type('button'),
                              h.Title(`restore #${card.id} ${card.title}`),
                              h.OnClick(Message.ClickedRestore({ cardId: card.id })),
                            ],
                            ['restore'],
                          ),
                        ]),
                      ),
                    ),
                }),
              ),
          }),
        ],
      ),
    ],
  )

// APP

const STYLES = `
body { font-family: system-ui, sans-serif; margin: 0; background: #f6f7f9; color: #1d2330; }
.app { padding: 16px; max-width: 1200px; margin: 0 auto; }
.tabs { display: flex; gap: 8px; margin-bottom: 16px; }
.tab { padding: 6px 14px; border: 1px solid #c8ccd4; background: #fff; border-radius: 6px; cursor: pointer; }
.tab-current { background: #1d2330; color: #fff; }
.board { display: flex; gap: 16px; flex-wrap: wrap; align-items: flex-start; }
.columns { display: flex; gap: 12px; flex: 3 1 600px; }
.column { flex: 1; background: #eceef2; border-radius: 8px; padding: 8px 10px; min-width: 0; }
.column h2 { font-size: 15px; margin: 4px 0 8px; }
.cards, .items { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.card-row { display: flex; flex-direction: column; gap: 4px; background: #fff; border-radius: 6px; padding: 6px; }
.card-row.selected { outline: 2px solid #3b6fd8; }
.card-row.adding { opacity: .6; }
.card { text-align: left; background: none; border: 0; padding: 2px; font: inherit; cursor: pointer; }
.moves { display: flex; gap: 4px; }
.move { font-size: 11px; padding: 1px 6px; }
.detail { flex: 1 1 280px; background: #fff; border-radius: 8px; padding: 12px; }
.inline-form { display: flex; gap: 6px; margin: 8px 0; }
.inline-form input { flex: 1; min-width: 0; }
.item-row { display: flex; gap: 8px; align-items: center; }
.error { color: #b42318; }
.muted { color: #6b7280; }
`

export const view = (model: Model, h: H): Document => ({
  title: 'Sprint board',
  body: h.div(
    [h.Class('app')],
    [
      h.style([], [STYLES]),
      h.nav(
        [h.Class('tabs'), h.AriaLabel('Pages')],
        [
          tabButton('board', 'Board', currentTab(model.page), h),
          tabButton('archive', 'Archive', currentTab(model.page), h),
        ],
      ),
      h.main(
        [],
        [
          Page.match(model.page, {
            BoardPage: ({ board }) => boardView(board, h),
            ArchivePage: ({ archive }) => archiveView(archive, h),
          }),
        ],
      ),
    ],
  ),
})
