import { Array, Option } from 'effect'
import { Document, Html, HtmlBuilder } from 'foldkit/html'

import { locate, movesFrom, savedItems, selectedOf, titleOf } from './board'
import { Message } from './message'
import {
  Archive,
  ArchiveLoad,
  ArchivedCard,
  Board,
  BoardCard,
  Checklist,
  ChecklistItem,
  Column,
  ColumnId,
  ColumnLoad,
  Model,
  Page,
  Selected,
  Selection,
} from './model'

// VIEW

const columnLabels: Record<ColumnId, string> = {
  todo: 'To do',
  doing: 'Doing',
  done: 'Done',
}

const testId = (h: HtmlBuilder<Message>, name: string) =>
  h.DataAttribute('testid', name)

const errorLine = (
  h: HtmlBuilder<Message>,
  name: string,
  maybeError: Option.Option<string>,
  label: string,
): Html =>
  Option.match(maybeError, {
    onNone: () => h.empty,
    onSome: error =>
      h.p(
        [h.Class('text-sm font-medium text-red-600'), testId(h, name)],
        [`${label}: ${error}`],
      ),
  })

const tabButton = (
  h: HtmlBuilder<Message>,
  name: string,
  label: string,
  active: boolean,
  message: Message,
): Html =>
  h.button(
    [
      h.Type('button'),
      testId(h, name),
      h.OnClick(message),
      h.Class(
        active
          ? 'rounded px-4 py-2 bg-slate-900 text-white'
          : 'rounded px-4 py-2 bg-white text-slate-700 hover:bg-slate-200',
      ),
    ],
    [label],
  )

const tabsView = (page: Page, h: HtmlBuilder<Message>): Html =>
  h.nav(
    [h.Class('flex gap-2 border-b border-slate-300 bg-white p-3')],
    [
      tabButton(
        h,
        'tab-board',
        'Board',
        Page.guards.BoardPage(page),
        Message.ClickedBoardTab(),
      ),
      tabButton(
        h,
        'tab-archive',
        'Archive',
        Page.guards.ArchivePage(page),
        Message.ClickedArchiveTab(),
      ),
    ],
  )

const headingText = (columnId: ColumnId, column: Column): string =>
  ColumnLoad.match<string>(column.load, {
    Loading: () => columnLabels[columnId],
    Failed: () => columnLabels[columnId],
    Loaded: () => `${columnLabels[columnId]} (${column.cards.length})`,
  })

const isSelectedCard = (board: Board, cardId: number): boolean =>
  Option.match(selectedOf(board), {
    onNone: () => false,
    onSome: selected => selected.cardId === cardId,
  })

const moveButtons = (
  h: HtmlBuilder<Message>,
  board: Board,
  columnId: ColumnId,
  index: number,
  cardId: number,
): ReadonlyArray<Html> =>
  Array.map(movesFrom(board, columnId, index), move =>
    h.button(
      [
        h.Type('button'),
        testId(h, move.direction),
        h.Disabled(!move.enabled),
        h.OnClick(Message.ClickedMove({ cardId, direction: move.direction })),
        h.Class(
          'rounded border border-slate-400 px-2 py-1 text-xs hover:bg-slate-100 disabled:opacity-40',
        ),
      ],
      [move.direction],
    ),
  )

const cardRow = (
  h: HtmlBuilder<Message>,
  board: Board,
  columnId: ColumnId,
  card: BoardCard,
  index: number,
): Html =>
  BoardCard.match<Html>(card, {
    Saved: saved =>
      h.keyed('li')(
        `card-${saved.id}`,
        [
          h.Class(
            isSelectedCard(board, saved.id)
              ? 'flex flex-col gap-2 rounded bg-white p-2 shadow ring-2 ring-slate-900'
              : 'flex flex-col gap-2 rounded bg-white p-2 shadow',
          ),
        ],
        [
          h.div(
            [
              testId(h, 'card'),
              h.Class('cursor-pointer text-sm font-medium'),
              h.OnClick(Message.ClickedCard({ cardId: saved.id })),
            ],
            [`#${saved.id} ${saved.title} · ${saved.done}/${saved.total}`],
          ),
          h.div(
            [h.Class('flex gap-1')],
            moveButtons(h, board, columnId, index, saved.id),
          ),
        ],
      ),
    Adding: ({ localId, title }) =>
      h.keyed('li')(
        `adding-${localId}`,
        [h.Class('rounded bg-white p-2 shadow opacity-60')],
        [
          h.div(
            [testId(h, 'card'), h.Class('text-sm font-medium')],
            [`${title} (adding…)`],
          ),
        ],
      ),
  })

const columnBody = (
  h: HtmlBuilder<Message>,
  board: Board,
  columnId: ColumnId,
  column: Column,
): Html =>
  ColumnLoad.match<Html>(column.load, {
    Loading: () => h.p([h.Class('text-sm text-slate-500')], ['loading']),
    Failed: ({ error }) =>
      h.div(
        [h.Class('flex flex-col items-start gap-2')],
        [
          h.p(
            [h.Class('text-sm text-red-600')],
            [`error: ${error}`],
          ),
          h.button(
            [
              h.Type('button'),
              testId(h, `retry-${columnId}`),
              h.OnClick(Message.ClickedRetryColumn({ column: columnId })),
              h.Class('rounded border border-slate-400 px-2 py-1 text-sm'),
            ],
            ['retry'],
          ),
        ],
      ),
    Loaded: () =>
      h.ul(
        [h.Class('flex flex-col gap-2')],
        Array.map(column.cards, (card, index) =>
          cardRow(h, board, columnId, card, index),
        ),
      ),
  })

const addCardForm = (h: HtmlBuilder<Message>, board: Board): Html =>
  h.form(
    [h.Class('flex gap-2'), h.OnSubmit(Message.SubmittedNewCard())],
    [
      h.input([
        h.Type('text'),
        testId(h, 'new-card'),
        h.Placeholder('New card'),
        h.Value(board.newCardTitle),
        h.OnInput(value => Message.ChangedNewCardTitle({ value })),
        h.Class('flex-1 rounded border border-slate-400 px-2 py-1'),
      ]),
      h.button(
        [
          h.Type('submit'),
          testId(h, 'add-card'),
          h.Class('rounded bg-slate-900 px-3 py-1 text-white'),
        ],
        ['add'],
      ),
    ],
  )

const columnView = (
  h: HtmlBuilder<Message>,
  board: Board,
  columnId: ColumnId,
): Html => {
  const column = board[columnId]
  return h.div(
    [h.Class('flex flex-col gap-3 rounded-lg bg-slate-200 p-3')],
    [
      h.h2(
        [testId(h, `head-${columnId}`), h.Class('font-semibold')],
        [headingText(columnId, column)],
      ),
      h.div(
        [testId(h, `col-${columnId}`), h.Class('flex min-h-16 flex-col gap-2')],
        [columnBody(h, board, columnId, column)],
      ),
      columnId === 'todo'
        ? h.div(
            [h.Class('flex flex-col gap-2')],
            [
              addCardForm(h, board),
              errorLine(h, 'add-error', board.maybeAddError, 'add error'),
            ],
          )
        : h.empty,
    ],
  )
}

const renameForm = (h: HtmlBuilder<Message>, selected: Selected): Html =>
  h.form(
    [h.Class('flex gap-2'), h.OnSubmit(Message.ClickedRename())],
    [
      h.input([
        h.Type('text'),
        testId(h, 'title-input'),
        h.Placeholder('New title'),
        h.Value(selected.titleInput),
        h.OnInput(value => Message.ChangedTitleInput({ value })),
        h.Class('flex-1 rounded border border-slate-400 px-2 py-1'),
      ]),
      h.button(
        [
          h.Type('submit'),
          testId(h, 'rename'),
          h.Class('rounded bg-slate-900 px-3 py-1 text-white'),
        ],
        ['rename'],
      ),
    ],
  )

const itemRow = (h: HtmlBuilder<Message>, item: ChecklistItem): Html =>
  ChecklistItem.match<Html>(item, {
    Saved: saved =>
      h.keyed('li')(
        `item-${saved.id}`,
        [h.Class('flex items-center justify-between gap-2')],
        [
          h.span(
            [testId(h, 'item')],
            [`${saved.done ? '[x]' : '[ ]'} ${saved.text}`],
          ),
          h.button(
            [
              h.Type('button'),
              testId(h, 'toggle'),
              h.OnClick(Message.ClickedToggleItem({ itemId: saved.id })),
              h.Class('rounded border border-slate-400 px-2 py-1 text-xs'),
            ],
            ['toggle'],
          ),
        ],
      ),
    Adding: ({ localId, text }) =>
      h.keyed('li')(
        `adding-${localId}`,
        [h.Class('flex items-center justify-between gap-2 opacity-60')],
        [h.span([testId(h, 'item')], [`[ ] ${text} (adding…)`])],
      ),
  })

const checklistView = (h: HtmlBuilder<Message>, selected: Selected): Html =>
  h.div(
    [testId(h, 'checklist'), h.Class('flex flex-col gap-2')],
    [
      Checklist.match<Html>(selected.checklist, {
        Loading: () => h.p([h.Class('text-sm text-slate-500')], ['loading checklist']),
        Failed: ({ error }) =>
          h.p([h.Class('text-sm text-red-600')], [`checklist error: ${error}`]),
        Loaded: ({ items }) => {
          const done = savedItems(selected).filter(item => item.done).length
          const total = items.length
          return h.div(
            [h.Class('flex flex-col gap-2')],
            [
              h.ul(
                [h.Class('flex flex-col gap-1')],
                Array.map(items, item => itemRow(h, item)),
              ),
              h.p(
                [testId(h, 'progress'), h.Class('text-sm')],
                [`${done}/${total} done`],
              ),
              h.form(
                [h.Class('flex gap-2'), h.OnSubmit(Message.SubmittedItem())],
                [
                  h.input([
                    h.Type('text'),
                    testId(h, 'item-input'),
                    h.Placeholder('New item'),
                    h.Value(selected.itemInput),
                    h.OnInput(value => Message.ChangedItemInput({ value })),
                    h.Class('flex-1 rounded border border-slate-400 px-2 py-1'),
                  ]),
                  h.button(
                    [
                      h.Type('submit'),
                      testId(h, 'add-item'),
                      h.Class('rounded bg-slate-900 px-3 py-1 text-white'),
                    ],
                    ['add'],
                  ),
                ],
              ),
            ],
          )
        },
      }),
    ],
  )

const selectedDetail = (
  h: HtmlBuilder<Message>,
  board: Board,
  selected: Selected,
): Html =>
  Option.match(locate(board, selected.cardId), {
    onNone: () => h.p([], ['select a card']),
    onSome: ({ column, card }) =>
      h.div(
        [h.Class('flex flex-col gap-3')],
        [
          h.h2(
            [h.Class('text-lg font-semibold')],
            [`#${selected.cardId} ${titleOf(card)}`],
          ),
          h.p([h.Class('text-sm text-slate-600')], [`in ${columnLabels[column]}`]),
          renameForm(h, selected),
          errorLine(h, 'rename-error', selected.maybeRenameError, 'rename error'),
          h.button(
            [
              h.Type('button'),
              testId(h, 'archive'),
              h.OnClick(Message.ClickedArchive()),
              h.Class('self-start rounded border border-slate-400 px-3 py-1 text-sm'),
            ],
            ['archive'],
          ),
          checklistView(h, selected),
          errorLine(h, 'item-error', selected.maybeItemError, 'item error'),
        ],
      ),
  })

const detailView = (h: HtmlBuilder<Message>, board: Board): Html =>
  h.div(
    [testId(h, 'detail'), h.Class('rounded-lg bg-white p-4 shadow')],
    [
      Selection.match<Html>(board.selection, {
        NoSelection: () => h.p([], ['select a card']),
        Selected: selected => selectedDetail(h, board, selected),
      }),
    ],
  )

const boardView = (h: HtmlBuilder<Message>, board: Board): Html =>
  h.div(
    [h.Class('grid gap-6 lg:grid-cols-[1fr_22rem]')],
    [
      h.div(
        [h.Class('flex flex-col gap-3')],
        [
          h.div(
            [h.Class('grid gap-4 md:grid-cols-3')],
            [
              columnView(h, board, 'todo'),
              columnView(h, board, 'doing'),
              columnView(h, board, 'done'),
            ],
          ),
          errorLine(h, 'move-error', board.maybeMoveError, 'move error'),
          errorLine(h, 'archive-error', board.maybeArchiveError, 'archive error'),
        ],
      ),
      detailView(h, board),
    ],
  )

const archivedRow = (h: HtmlBuilder<Message>, card: ArchivedCard): Html =>
  h.keyed('li')(
    `archived-${card.id}`,
    [h.Class('flex items-center justify-between gap-2 rounded bg-white p-2 shadow')],
    [
      h.span([testId(h, 'archived-card')], [`#${card.id} ${card.title}`]),
      h.button(
        [
          h.Type('button'),
          testId(h, 'restore'),
          h.OnClick(Message.ClickedRestore({ cardId: card.id })),
          h.Class('rounded border border-slate-400 px-2 py-1 text-xs'),
        ],
        ['restore'],
      ),
    ],
  )

const archiveView = (h: HtmlBuilder<Message>, archive: Archive): Html =>
  h.div(
    [h.Class('mx-auto flex max-w-xl flex-col gap-3 rounded-lg bg-white p-4 shadow')],
    [
      h.h2([h.Class('text-lg font-semibold')], ['Archive']),
      ArchiveLoad.match<Html>(archive.load, {
        Loading: () =>
          h.p([testId(h, 'archived'), h.Class('text-sm text-slate-500')], ['loading archive']),
        Failed: ({ error }) =>
          h.p([testId(h, 'archived'), h.Class('text-sm text-red-600')], [`archive error: ${error}`]),
        Loaded: ({ cards }) =>
          h.ul(
            [testId(h, 'archived'), h.Class('flex flex-col gap-2')],
            Array.map(cards, card => archivedRow(h, card)),
          ),
      }),
      errorLine(h, 'restore-error', archive.maybeRestoreError, 'restore error'),
    ],
  )

export const view = (model: Model, h: HtmlBuilder<Message>): Document => ({
  title: 'Sprint board',
  body: h.div(
    [h.Class('min-h-screen bg-slate-100 text-slate-900')],
    [
      tabsView(model.page, h),
      h.div(
        [h.Class('p-4 sm:p-6')],
        [
          Page.match<Html>(model.page, {
            BoardPage: ({ board }) => boardView(h, board),
            ArchivePage: ({ archive }) => archiveView(h, archive),
          }),
        ],
      ),
    ],
  ),
})

