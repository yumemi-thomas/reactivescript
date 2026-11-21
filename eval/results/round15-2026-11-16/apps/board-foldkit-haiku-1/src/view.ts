import { Option } from 'effect'
import { AsyncData } from 'foldkit'
import { Document, Html, HtmlBuilder } from 'foldkit/html'

import {
  blocked,
  columnLabel,
  directions,
  loadedCards,
  locate,
  savedOf,
  stepFor,
  type Placed,
} from './board'
import { Message } from './message'
import {
  ArchivePage,
  BoardCard,
  BoardPage,
  Column,
  ChecklistItem,
  ColumnName,
  Model,
  Page,
  Selection,
} from './model'

// VIEW

const viewTabs = (h: HtmlBuilder<Message>): Html =>
  h.nav([h.Class('tabs')], [
    h.button(
      [
        h.DataAttribute('testid', 'tab-board'),
        h.OnClick(Message.ClickedBoardTab()),
      ],
      ['Board'],
    ),
    h.button(
      [
        h.DataAttribute('testid', 'tab-archive'),
        h.OnClick(Message.ClickedArchiveTab()),
      ],
      ['Archive'],
    ),
  ])

const viewMoveButtons = (
  board: BoardPage,
  placed: Placed,
  h: HtmlBuilder<Message>,
): ReadonlyArray<Html> =>
  directions.map(direction =>
    Option.match(stepFor(board, placed, direction), {
      onNone: () => h.empty,
      onSome: step =>
        h.button(
          [
            h.DataAttribute('testid', direction),
            h.Disabled(blocked(board, placed, step)),
            h.OnClick(
              Message.ClickedMoveCard({ id: placed.card.id, direction }),
            ),
          ],
          [direction],
        ),
    }),
  )

const viewCard = (
  board: BoardPage,
  name: ColumnName,
  card: BoardCard,
  index: number,
  h: HtmlBuilder<Message>,
): Html => {
  if (card._tag === 'Adding') {
    return h.keyed('li')(
      `adding-${card.key}`,
      [],
      [
        h.div(
          [h.DataAttribute('testid', 'card')],
          [`${card.title} (adding…)`],
        ),
      ],
    )
  }
  const placed: Placed = { column: name, index, card: savedOf(card) }
  return h.keyed('li')(
    `card-${card.id}`,
    [],
    [
      h.div(
        [h.Class('card-row')],
        [
          h.span(
            [h.DataAttribute('testid', 'card')],
            [
              h.button(
                [h.OnClick(Message.ClickedSelectCard({ id: card.id }))],
                [`#${card.id} ${card.title} · ${card.done}/${card.total}`],
              ),
            ],
          ),
          ...viewMoveButtons(board, placed, h),
        ],
      ),
    ],
  )
}

const viewAddForm = (board: BoardPage, h: HtmlBuilder<Message>): Html => {
  const loaded = Option.isSome(loadedCards(board, 'todo'))
  return h.div([h.Class('add-card')], [
    h.input([
      h.DataAttribute('testid', 'new-card'),
      h.Placeholder('New card title'),
      h.Value(board.newCardTitle),
      h.OnInput(value => Message.UpdatedNewCardTitle({ value })),
    ]),
    h.button(
      [
        h.DataAttribute('testid', 'add-card'),
        h.Disabled(!loaded),
        h.OnClick(Message.ClickedAddCard()),
      ],
      ['Add card'],
    ),
    Option.match(board.maybeAddError, {
      onNone: () => h.empty,
      onSome: error =>
        h.p([h.DataAttribute('testid', 'add-error')], [`add error: ${error}`]),
    }),
  ])
}

const headingOf = (board: BoardPage, name: ColumnName): string =>
  Option.match(loadedCards(board, name), {
    onNone: () => columnLabel[name],
    onSome: cards => `${columnLabel[name]} (${cards.length})`,
  })

const viewColumn = (
  board: BoardPage,
  column: Column,
  h: HtmlBuilder<Message>,
): Html =>
  h.section(
    [h.DataAttribute('testid', `col-${column.name}`)],
    [
      h.h2(
        [h.DataAttribute('testid', `head-${column.name}`)],
        [headingOf(board, column.name)],
      ),
      AsyncData.matchDataSplitEmpty(column.cards, {
        onIdle: () => h.p([], ['loading']),
        onLoading: () => h.p([], ['loading']),
        onFailure: error =>
          h.div([], [
            h.p([], [`error: ${error}`]),
            h.button(
              [
                h.DataAttribute('testid', `retry-${column.name}`),
                h.OnClick(
                  Message.ClickedRetryFetchCards({ column: column.name }),
                ),
              ],
              ['Retry'],
            ),
          ]),
        onData: cards =>
          h.ul(
            [],
            cards.map((card, index) =>
              viewCard(board, column.name, card, index, h),
            ),
          ),
      }),
      column.name === 'todo' ? viewAddForm(board, h) : h.empty,
    ],
  )

const progressOf = (items: ReadonlyArray<ChecklistItem>): string => {
  const done = items.filter(item => item._tag === 'Saved' && item.done).length
  return `${done}/${items.length} done`
}

const viewItem = (item: ChecklistItem, h: HtmlBuilder<Message>): Html => {
  if (item._tag === 'Adding') {
    return h.keyed('li')(
      `adding-${item.key}`,
      [],
      [
        h.div([], [
          h.span(
            [h.DataAttribute('testid', 'item')],
            [`[ ] ${item.text} (adding…)`],
          ),
        ]),
      ],
    )
  }
  return h.keyed('li')(
    `item-${item.id}`,
    [],
    [
      h.div([h.Class('item-row')], [
        h.span(
          [h.DataAttribute('testid', 'item')],
          [`${item.done ? '[x]' : '[ ]'} ${item.text}`],
        ),
        h.button(
          [
            h.DataAttribute('testid', 'toggle'),
            h.OnClick(Message.ClickedToggleItem({ itemId: item.id })),
          ],
          ['Toggle'],
        ),
      ]),
    ],
  )
}

const viewChecklist = (selection: Selection, h: HtmlBuilder<Message>): Html =>
  h.section([h.DataAttribute('testid', 'checklist')], [
    AsyncData.matchDataSplitEmpty(selection.checklist, {
      onIdle: () => h.p([], ['loading checklist']),
      onLoading: () => h.p([], ['loading checklist']),
      onFailure: error => h.p([], [`checklist error: ${error}`]),
      onData: items =>
        h.div([], [
          h.ul([], items.map(item => viewItem(item, h))),
          h.p(
            [h.DataAttribute('testid', 'progress')],
            [progressOf(items)],
          ),
          h.div([], [
            h.input([
              h.DataAttribute('testid', 'item-input'),
              h.Placeholder('New checklist item'),
              h.Value(selection.itemInput),
              h.OnInput(value => Message.UpdatedItemInput({ value })),
            ]),
            h.button(
              [
                h.DataAttribute('testid', 'add-item'),
                h.OnClick(Message.ClickedAddItem()),
              ],
              ['Add item'],
            ),
          ]),
        ]),
    }),
  ])

const viewSelection = (
  selection: Selection,
  placed: Placed,
  h: HtmlBuilder<Message>,
): Html =>
  h.div([h.Class('selection')], [
    h.h2([], [`#${placed.card.id} ${placed.card.title}`]),
    h.p([], [`in ${columnLabel[placed.column]}`]),
    h.div([], [
      h.input([
        h.DataAttribute('testid', 'title-input'),
        h.Value(selection.titleInput),
        h.OnInput(value => Message.UpdatedRenameInput({ value })),
      ]),
      h.button(
        [
          h.DataAttribute('testid', 'rename'),
          h.OnClick(Message.ClickedRenameCard()),
        ],
        ['Rename'],
      ),
    ]),
    Option.match(selection.maybeRenameError, {
      onNone: () => h.empty,
      onSome: error =>
        h.p(
          [h.DataAttribute('testid', 'rename-error')],
          [`rename error: ${error}`],
        ),
    }),
    h.button(
      [
        h.DataAttribute('testid', 'archive'),
        h.OnClick(Message.ClickedArchiveCard()),
      ],
      ['Archive'],
    ),
    viewChecklist(selection, h),
    Option.match(selection.maybeItemError, {
      onNone: () => h.empty,
      onSome: error =>
        h.p([h.DataAttribute('testid', 'item-error')], [`item error: ${error}`]),
    }),
  ])

const viewDetail = (board: BoardPage, h: HtmlBuilder<Message>): Html => {
  const nothingSelected = h.p([], ['select a card'])
  return h.section([h.DataAttribute('testid', 'detail')], [
    Option.match(board.maybeSelection, {
      onNone: () => nothingSelected,
      onSome: selection =>
        Option.match(locate(board, selection.cardId), {
          onNone: () => nothingSelected,
          onSome: placed => viewSelection(selection, placed, h),
        }),
    }),
  ])
}

const viewBoard = (board: BoardPage, h: HtmlBuilder<Message>): Html =>
  h.div([h.DataAttribute('testid', 'board')], [
    Option.match(board.maybeMoveError, {
      onNone: () => h.empty,
      onSome: error =>
        h.p([h.DataAttribute('testid', 'move-error')], [`move error: ${error}`]),
    }),
    h.div(
      [h.Class('columns')],
      board.columns.map(column => viewColumn(board, column, h)),
    ),
    Option.match(board.maybeArchiveError, {
      onNone: () => h.empty,
      onSome: error =>
        h.p(
          [h.DataAttribute('testid', 'archive-error')],
          [`archive error: ${error}`],
        ),
    }),
    viewDetail(board, h),
  ])

const viewArchive = (archive: ArchivePage, h: HtmlBuilder<Message>): Html =>
  h.div([h.DataAttribute('testid', 'archive-page')], [
    h.section([h.DataAttribute('testid', 'archived')], [
      AsyncData.matchDataSplitEmpty(archive.archived, {
        onIdle: () => h.p([], ['loading archive']),
        onLoading: () => h.p([], ['loading archive']),
        onFailure: error => h.p([], [`archive error: ${error}`]),
        onData: rows =>
          h.ul(
            [],
            rows.map(row =>
              h.keyed('li')(`archived-${row.id}`, [], [
                h.div([], [
                  h.span(
                    [h.DataAttribute('testid', 'archived-card')],
                    [`#${row.id} ${row.title}`],
                  ),
                  h.button(
                    [
                      h.DataAttribute('testid', 'restore'),
                      h.OnClick(Message.ClickedRestoreCard({ id: row.id })),
                    ],
                    ['Restore'],
                  ),
                ]),
              ]),
            ),
          ),
      }),
    ]),
    Option.match(archive.maybeRestoreError, {
      onNone: () => h.empty,
      onSome: error =>
        h.p(
          [h.DataAttribute('testid', 'restore-error')],
          [`restore error: ${error}`],
        ),
    }),
  ])

export const view = (model: Model, h: HtmlBuilder<Message>): Document => ({
  title: 'Sprint board',
  body: h.div([h.Class('app')], [
    viewTabs(h),
    Page.match(model.page, {
      Board: ({ board }) => viewBoard(board, h),
      Archive: ({ archive }) => viewArchive(archive, h),
    }),
  ]),
})
