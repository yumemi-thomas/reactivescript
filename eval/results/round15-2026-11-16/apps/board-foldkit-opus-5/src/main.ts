import { Option, Schema } from 'effect'
import { Command, Runtime, Update } from 'foldkit'
import type { Document, Html, HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { defineTaggedUnion } from 'foldkit/schema'
import { modifyFields } from 'foldkit/struct'

import * as Archive from './archive'
import * as Board from './board'
import { STYLES } from './styles'

// MODEL

export const Page = defineTaggedUnion({
  BoardPage: { session: Schema.Number, board: Board.Model },
  ArchivePage: { session: Schema.Number, archive: Archive.Model },
})
export type Page = typeof Page.Type

export const Model = Schema.Struct({
  nextSession: Schema.Number,
  page: Page,
})
export type Model = typeof Model.Type

// MESSAGE

export const Message = defineMessageUnion({
  ClickedBoardTab: {},
  ClickedArchiveTab: {},
  GotBoardMessage: { session: Schema.Number, message: Board.Message },
  GotArchiveMessage: { session: Schema.Number, message: Archive.Message },
})
export type Message = typeof Message.Type

// INIT

type UpdateReturn = Update.Return<Model, Message>

const toGotBoardMessage = (session: number, message: Board.Message): Message =>
  Message.GotBoardMessage({ session, message })

const toGotArchiveMessage = (
  session: number,
  message: Archive.Message,
): Message => Message.GotArchiveMessage({ session, message })

const openBoard = (session: number): UpdateReturn => {
  const boardInit = Board.init()
  return {
    model: {
      nextSession: session + 1,
      page: Page.BoardPage({ session, board: boardInit.model }),
    },
    commands: Command.mapMessages(boardInit.commands, message =>
      toGotBoardMessage(session, message),
    ),
  }
}

const openArchive = (session: number): UpdateReturn => {
  const archiveInit = Archive.init()
  return {
    model: {
      nextSession: session + 1,
      page: Page.ArchivePage({ session, archive: archiveInit.model }),
    },
    commands: Command.mapMessages(archiveInit.commands, message =>
      toGotArchiveMessage(session, message),
    ),
  }
}

export const init: Runtime.ApplicationInit<Model, Message> = () =>
  openBoard(0)

// UPDATE

const readBoard = (model: Model, session: number): Option.Option<Board.Model> =>
  Page.match(model.page, {
    BoardPage: page =>
      page.session === session ? Option.some(page.board) : Option.none(),
    ArchivePage: () => Option.none(),
  })

const readArchive = (
  model: Model,
  session: number,
): Option.Option<Archive.Model> =>
  Page.match(model.page, {
    BoardPage: () => Option.none(),
    ArchivePage: page =>
      page.session === session ? Option.some(page.archive) : Option.none(),
  })

const foldBoard = Update.foldChildAt({
  update: Board.update,
  readAt: readBoard,
  writeAt: (model: Model, session: number, nextBoard: Board.Model) =>
    modifyFields(model, {
      page: (): Page => Page.BoardPage({ session, board: nextBoard }),
    }),
  toParentMessage: toGotBoardMessage,
})

const foldArchive = Update.foldChildAt({
  update: Archive.update,
  readAt: readArchive,
  writeAt: (model: Model, session: number, nextArchive: Archive.Model) =>
    modifyFields(model, {
      page: (): Page =>
        Page.ArchivePage({ session, archive: nextArchive }),
    }),
  toParentMessage: toGotArchiveMessage,
})

export const update = (model: Model, message: Message) =>
  Message.match<UpdateReturn>(message, {
    ClickedBoardTab: () =>
      model.page._tag === 'BoardPage' ? { model } : openBoard(model.nextSession),
    ClickedArchiveTab: () =>
      model.page._tag === 'ArchivePage' ? { model } : openArchive(model.nextSession),
    GotBoardMessage: ({ session, message }) =>
      foldBoard(model, session, message),
    GotArchiveMessage: ({ session, message }) =>
      foldArchive(model, session, message),
  })

// VIEW

const tabButton = (
  testId: string,
  label: string,
  isOpen: boolean,
  onClick: Message,
  h: HtmlBuilder<Message>,
): Html =>
  h.button(
    [
      h.Type('button'),
      h.Role('tab'),
      h.DataAttribute('testid', testId),
      h.AriaSelected(isOpen),
      h.Class(isOpen ? 'tab open' : 'tab'),
      h.OnClick(onClick),
    ],
    [label],
  )

export const view = (model: Model, h: HtmlBuilder<Message>): Document => {
  const isBoardOpen = model.page._tag === 'BoardPage'
  return {
    title: isBoardOpen ? 'Sprint board' : 'Sprint board · Archive',
    body: h.div(
      [h.Class('app')],
      [
        h.style([], [STYLES]),
        h.header(
          [h.Class('app-header')],
          [
            h.h1([], ['Sprint board']),
            h.nav(
              [h.Role('tablist'), h.AriaLabel('Pages'), h.Class('tabs')],
              [
                tabButton('tab-board', 'Board', isBoardOpen, Message.ClickedBoardTab(), h),
                tabButton(
                  'tab-archive',
                  'Archive',
                  !isBoardOpen,
                  Message.ClickedArchiveTab(),
                  h,
                ),
              ],
            ),
          ],
        ),
        h.main(
          [h.Role('tabpanel')],
          [
            Page.match(model.page, {
              BoardPage: ({ session, board }) =>
                h.submodel({
                  slotId: `board-${session}`,
                  model: board,
                  view: Board.view,
                  toParentMessage: message => toGotBoardMessage(session, message),
                }),
              ArchivePage: ({ session, archive }) =>
                h.submodel({
                  slotId: `archive-${session}`,
                  model: archive,
                  view: Archive.view,
                  toParentMessage: message =>
                    toGotArchiveMessage(session, message),
                }),
            }),
          ],
        ),
      ],
    ),
  }
}
