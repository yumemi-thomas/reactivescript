import { Array, Match, Option } from 'effect'
import { Document, Html, HtmlBuilder } from 'foldkit/html'

import { moveTarget, shownBoard } from './board'
import {
  COLUMNS,
  type Column,
  ColumnState,
  type Direction,
  type Lanes,
  type ShownCard,
  type ShownItem,
  type ShownPlace,
  columnName,
  columnState,
  columnToLeft,
  columnToRight,
  findShown,
  lane,
} from './domain'
import { Message } from './message'
import {
  type Archive,
  ArchiveList,
  type Board,
  ChecklistState,
  type Model,
  Page,
  Selection,
} from './model'
import { STYLES } from './styles'

type H = HtmlBuilder<Message>

const testId = (h: H, id: string) => h.DataAttribute('testid', id)

const errorLine = (
  h: H,
  id: string,
  prefix: string,
  maybeError: Option.Option<string>,
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

const tabsView = (model: Model, h: H): Html => {
  const isBoard = model.page._tag === 'BoardPage'
  const tab = (id: string, label: string, isOpen: boolean, message: Message) =>
    h.button(
      [
        testId(h, id),
        h.Type('button'),
        h.Class(isOpen ? 'tab tab-open' : 'tab'),
        h.AriaCurrent(isOpen ? 'page' : 'false'),
        h.OnClick(message),
      ],
      [label],
    )
  return h.nav(
    [h.Class('tabs'), h.AriaLabel('Pages')],
    [
      tab('tab-board', 'Board', isBoard, Message.ClickedBoardTab()),
      tab('tab-archive', 'Archive', !isBoard, Message.ClickedArchiveTab()),
    ],
  )
}

// BOARD

const moveButton = (
  h: H,
  lanes: Lanes,
  place: ShownPlace,
  cardId: number,
  direction: Direction,
): Html => {
  const isShown = Match.value(direction).pipe(
    Match.when('left', () => Option.isSome(columnToLeft(place.column))),
    Match.when('right', () => Option.isSome(columnToRight(place.column))),
    Match.when('up', () => place.index > 0),
    Match.when('down', () => place.index < place.laneSize - 1),
    Match.exhaustive,
  )
  if (!isShown) {
    return h.empty
  }
  const isPossible = Option.isSome(moveTarget(lanes, place, direction))
  return h.button(
    [
      testId(h, direction),
      h.Type('button'),
      h.Class('move'),
      h.Disabled(!isPossible),
      h.AriaLabel(`move #${cardId} ${direction}`),
      h.OnClick(Message.ClickedMoveCard({ cardId, direction })),
    ],
    [direction],
  )
}

const cardRow = (
  h: H,
  lanes: Lanes,
  card: ShownCard,
  maybeSelectedId: Option.Option<number>,
): Html =>
  Option.match(card.maybeId, {
    onNone: () =>
      h.keyed('li')(
        card.key,
        [h.Class('card-row card-row-adding')],
        [
          h.div(
            [testId(h, 'card'), h.Class('card card-adding')],
            [`${card.title} (adding…)`],
          ),
        ],
      ),
    onSome: cardId => {
      const isSelected = Option.exists(maybeSelectedId, id => id === cardId)
      return h.keyed('li')(
        card.key,
        [h.Class(isSelected ? 'card-row card-row-selected' : 'card-row')],
        [
          h.button(
            [
              testId(h, 'card'),
              h.Type('button'),
              h.Class('card'),
              h.AriaPressed(isSelected ? 'true' : 'false'),
              h.OnClick(Message.ClickedCard({ cardId })),
            ],
            [`#${cardId} ${card.title} · ${card.done}/${card.total}`],
          ),
          Option.match(findShown(lanes, cardId), {
            onNone: () => h.empty,
            onSome: place =>
              h.div(
                [h.Class('moves')],
                Array.map(
                  ['left', 'right', 'up', 'down'] satisfies ReadonlyArray<Direction>,
                  direction => moveButton(h, lanes, place, cardId, direction),
                ),
              ),
          }),
        ],
      )
    },
  })

const addCardForm = (board: Board, h: H): Html =>
  h.form(
    [h.Class('add-form'), h.OnSubmit(Message.SubmittedNewCard())],
    [
      h.input([
        testId(h, 'new-card'),
        h.Type('text'),
        h.Value(board.newCardInput),
        h.Placeholder('New card title'),
        h.AriaLabel('New card title'),
        h.Autocomplete('off'),
        h.OnInput(value => Message.UpdatedNewCardInput({ value })),
      ]),
      h.button(
        [
          testId(h, 'add-card'),
          h.Type('submit'),
          h.Disabled(board.columns.todo._tag !== 'ColumnLoaded'),
        ],
        ['Add card'],
      ),
    ],
  )

const columnView = (
  board: Board,
  lanes: Lanes,
  column: Column,
  maybeSelectedId: Option.Option<number>,
  h: H,
): Html => {
  const name = columnName(column)
  const heading = Option.match(lane(lanes, column), {
    onNone: () => name,
    onSome: cards => `${name} (${cards.length})`,
  })
  const body = ColumnState.match<Html>(columnState(board.columns, column), {
    ColumnLoading: () => h.p([h.Class('status')], ['loading']),
    ColumnFailed: ({ error }) =>
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
            ['Retry'],
          ),
        ],
      ),
    ColumnLoaded: () =>
      Array.match(
        Option.getOrElse(lane(lanes, column), (): ReadonlyArray<ShownCard> => []),
        {
        onEmpty: () => h.p([h.Class('status muted')], ['No cards']),
        onNonEmpty: (cards: Array.NonEmptyReadonlyArray<ShownCard>) =>
          h.ul(
            [h.Class('cards')],
            Array.map(cards, card => cardRow(h, lanes, card, maybeSelectedId)),
          ),
        },
      ),
  })
  return h.section(
    [testId(h, `col-${column}`), h.Class('column'), h.AriaLabel(name)],
    [
      h.h2([testId(h, `head-${column}`)], [heading]),
      body,
      column === 'todo' ? addCardForm(board, h) : h.empty,
    ],
  )
}

const itemRow = (h: H, item: ShownItem): Html =>
  Option.match(item.maybeId, {
    onNone: () =>
      h.keyed('li')(
        item.key,
        [h.Class('item-row')],
        [
          h.span(
            [testId(h, 'item'), h.Class('item item-adding')],
            [`[ ] ${item.text} (adding…)`],
          ),
        ],
      ),
    onSome: itemId =>
      h.keyed('li')(
        item.key,
        [h.Class('item-row')],
        [
          h.span(
            [testId(h, 'item'), h.Class('item')],
            [`${item.done ? '[x]' : '[ ]'} ${item.text}`],
          ),
          h.button(
            [
              testId(h, 'toggle'),
              h.Type('button'),
              h.AriaPressed(item.done ? 'true' : 'false'),
              h.AriaLabel(`toggle ${item.text}`),
              h.OnClick(Message.ClickedToggleItem({ itemId })),
            ],
            ['toggle'],
          ),
        ],
      ),
  })

type CardSelected = Extract<Selection, { readonly _tag: 'CardSelected' }>

const checklistView = (
  selected: CardSelected,
  maybeItems: Option.Option<ReadonlyArray<ShownItem>>,
  h: H,
): Html =>
  h.div(
    [testId(h, 'checklist'), h.Class('checklist')],
    ChecklistState.match<ReadonlyArray<Html>>(selected.checklist, {
      ChecklistLoading: () => [
        h.p([h.Class('status')], ['loading checklist']),
      ],
      ChecklistFailed: ({ error }) => [
        h.p(
          [h.Class('error'), h.Role('alert')],
          [`checklist error: ${error}`],
        ),
        h.button(
          [
            testId(h, 'retry-checklist'),
            h.Type('button'),
            h.OnClick(Message.ClickedRetryChecklist()),
          ],
          ['Retry'],
        ),
      ],
      ChecklistLoaded: () => {
        const items = Option.getOrElse(maybeItems, (): ReadonlyArray<ShownItem> => [])
        const doneCount = Array.filter(items, item => item.done).length
        return [
          h.ul(
            [h.Class('items')],
            Array.map(items, item => itemRow(h, item)),
          ),
          h.p(
            [testId(h, 'progress'), h.Class('progress')],
            [`${doneCount}/${items.length} done`],
          ),
        ]
      },
    }),
  )

const detailContent = (
  board: Board,
  selected: CardSelected,
  h: H,
): ReadonlyArray<Html> => {
  const shown = shownBoard(board)
  return Option.match(findShown(shown.lanes, selected.cardId), {
    onNone: () => [h.p([h.Class('muted')], ['select a card'])],
    onSome: place => [
      h.h2([testId(h, 'detail-title')], [`#${selected.cardId} ${place.card.title}`]),
      h.p([testId(h, 'detail-column')], [`in ${columnName(place.column)}`]),
      h.form(
        [h.Class('inline-form'), h.OnSubmit(Message.SubmittedRename())],
        [
          h.input([
            testId(h, 'title-input'),
            h.Type('text'),
            h.Value(selected.titleInput),
            h.Placeholder('New title'),
            h.AriaLabel('New title'),
            h.Autocomplete('off'),
            h.OnInput(value => Message.UpdatedTitleInput({ value })),
          ]),
          h.button([testId(h, 'rename'), h.Type('submit')], ['Rename']),
        ],
      ),
      errorLine(h, 'rename-error', 'rename error', selected.maybeRenameError),
      h.button(
        [
          testId(h, 'archive'),
          h.Type('button'),
          h.Class('danger'),
          h.OnClick(Message.ClickedArchive()),
        ],
        ['Archive'],
      ),
      h.h3([], ['Checklist']),
      checklistView(selected, shown.maybeItems, h),
      errorLine(h, 'item-error', 'item error', selected.maybeItemError),
      h.form(
        [h.Class('inline-form'), h.OnSubmit(Message.SubmittedNewItem())],
        [
          h.input([
            testId(h, 'item-input'),
            h.Type('text'),
            h.Value(selected.itemInput),
            h.Placeholder('New item'),
            h.AriaLabel('New checklist item'),
            h.Autocomplete('off'),
            h.OnInput(value => Message.UpdatedItemInput({ value })),
          ]),
          h.button(
            [
              testId(h, 'add-item'),
              h.Type('submit'),
              h.Disabled(selected.checklist._tag !== 'ChecklistLoaded'),
            ],
            ['Add item'],
          ),
        ],
      ),
    ],
  })
}

const detailView = (board: Board, h: H): Html =>
  h.aside(
    [testId(h, 'detail'), h.Class('detail'), h.AriaLabel('Card detail')],
    Selection.match<ReadonlyArray<Html>>(board.selection, {
      NoCardSelected: () => [h.p([h.Class('muted')], ['select a card'])],
      CardSelected: selected => detailContent(board, selected, h),
    }),
  )

const boardView = (board: Board, h: H): Html => {
  const { lanes } = shownBoard(board)
  const maybeSelectedId = Selection.match(board.selection, {
    NoCardSelected: () => Option.none<number>(),
    CardSelected: ({ cardId }) => Option.some(cardId),
  })
  return h.main(
    [h.Class('board-page')],
    [
      h.div(
        [h.Class('messages'), h.AriaLive('polite')],
        [
          errorLine(h, 'move-error', 'move error', board.maybeMoveError),
          errorLine(h, 'add-error', 'add error', board.maybeAddError),
          errorLine(h, 'archive-error', 'archive error', board.maybeArchiveError),
        ],
      ),
      h.div(
        [h.Class('board')],
        [
          h.div(
            [h.Class('columns')],
            Array.map(COLUMNS, column =>
              columnView(board, lanes, column, maybeSelectedId, h),
            ),
          ),
          detailView(board, h),
        ],
      ),
    ],
  )
}

// ARCHIVE

const archiveView = (archive: Archive, h: H): Html => {
  const restoringIds = Array.map(archive.pendingRestores, r => r.cardId)
  return h.main(
    [h.Class('archive-page')],
    [
      h.h2([], ['Archive']),
      errorLine(h, 'restore-error', 'restore error', archive.maybeRestoreError),
      h.div(
        [testId(h, 'archived'), h.Class('archived')],
        ArchiveList.match<ReadonlyArray<Html>>(archive.list, {
          ArchiveLoading: () => [h.p([h.Class('status')], ['loading archive'])],
          ArchiveFailed: ({ error }) => [
            h.p(
              [h.Class('error'), h.Role('alert')],
              [`archive error: ${error}`],
            ),
            h.button(
              [
                testId(h, 'retry-archive'),
                h.Type('button'),
                h.OnClick(Message.ClickedRetryArchive()),
              ],
              ['Retry'],
            ),
          ],
          ArchiveLoaded: ({ cards }) =>
            Array.match(
              Array.filter(cards, card => !Array.contains(restoringIds, card.id)),
              {
                onEmpty: () => [h.p([h.Class('muted')], ['No archived cards'])],
                onNonEmpty: shownCards => [
                  h.ul(
                    [h.Class('cards')],
                    Array.map(shownCards, card =>
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
                              h.OnClick(
                                Message.ClickedRestore({ cardId: card.id }),
                              ),
                            ],
                            ['restore'],
                          ),
                        ],
                      ),
                    ),
                  ),
                ],
              },
            ),
        }),
      ),
    ],
  )
}

// VIEW

export const view = (model: Model, h: H): Document => ({
  title: 'Sprint board',
  body: h.div(
    [h.Class('app')],
    [
      h.style([], [STYLES]),
      h.h1([], ['Sprint board']),
      tabsView(model, h),
      Page.match<Html>(model.page, {
        BoardPage: ({ board }) => boardView(board, h),
        ArchivePage: ({ archive }) => archiveView(archive, h),
      }),
    ],
  ),
})
