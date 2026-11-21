import { Array, Effect, Option, Schema } from 'effect'
import { Command, Submodel, type Update } from 'foldkit'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { defineTaggedUnion } from 'foldkit/schema'
import { modifyFields } from 'foldkit/struct'

import * as Api from './api.js'
import { callApi, callApiDecoded } from './apiCall'

// MODEL

export const ArchivedCard = Schema.Struct({
  id: Schema.Number,
  title: Schema.String,
})
export type ArchivedCard = typeof ArchivedCard.Type

export const ArchiveLoad = defineTaggedUnion({
  ArchiveLoading: {},
  ArchiveFailed: { error: Schema.String },
  ArchiveLoaded: { cards: Schema.Array(ArchivedCard) },
})
export type ArchiveLoad = typeof ArchiveLoad.Type

export const RestoreOp = Schema.Struct({
  opId: Schema.Number,
  cardId: Schema.Number,
  isConfirmed: Schema.Boolean,
})
export type RestoreOp = typeof RestoreOp.Type

export const Model = Schema.Struct({
  nextId: Schema.Number,
  archive: ArchiveLoad,
  restores: Schema.Array(RestoreOp),
  maybeRestoreError: Schema.Option(Schema.String),
})
export type Model = typeof Model.Type

// MESSAGE

export const Message = defineMessageUnion({
  SucceededFetchArchived: { cards: Schema.Array(ArchivedCard) },
  FailedFetchArchived: { error: Schema.String },
  ClickedRestore: { cardId: Schema.Number },
  SucceededRestoreCard: { opId: Schema.Number },
  FailedRestoreCard: { opId: Schema.Number, error: Schema.String },
})
export type Message = typeof Message.Type

// COMMAND

export const FetchArchived = Command.define('FetchArchived', {
  messages: [Message.SucceededFetchArchived, Message.FailedFetchArchived],
  execute: callApiDecoded(Schema.Array(ArchivedCard), () =>
    Api.fetchArchived(),
  ).pipe(
    Effect.map(cards => Message.SucceededFetchArchived({ cards })),
    Effect.catch(error =>
      Effect.succeed(Message.FailedFetchArchived({ error })),
    ),
  ),
})

export const RestoreCard = Command.define('RestoreCard', {
  args: { opId: Schema.Number, cardId: Schema.Number },
  messages: [Message.SucceededRestoreCard, Message.FailedRestoreCard],
  execute: ({ opId, cardId }) =>
    callApi(() => Api.restoreCard(cardId)).pipe(
      Effect.as(Message.SucceededRestoreCard({ opId })),
      Effect.catch(error =>
        Effect.succeed(Message.FailedRestoreCard({ opId, error })),
      ),
    ),
})

// INIT

type UpdateReturn = Update.Return<Model, Message>

export const init = (): UpdateReturn => ({
  model: {
    nextId: 0,
    archive: ArchiveLoad.ArchiveLoading(),
    restores: [],
    maybeRestoreError: Option.none(),
  },
  commands: [FetchArchived()],
})

// UPDATE

const shownCards = (
  cards: ReadonlyArray<ArchivedCard>,
  restores: ReadonlyArray<RestoreOp>,
): ReadonlyArray<ArchivedCard> =>
  Array.filter(
    cards,
    card => !Array.some(restores, restore => restore.cardId === card.id),
  )

/** Drops confirmed restores at the head of the queue from the loaded list. */
const flushRestores = (model: Model): Model => {
  const [confirmed, remaining] = Array.span(
    model.restores,
    restore => restore.isConfirmed,
  )
  if (Array.isArrayEmpty(confirmed)) {
    return model
  }
  return modifyFields(model, {
    archive: archive =>
      ArchiveLoad.match<ArchiveLoad>(archive, {
        ArchiveLoading: () => archive,
        ArchiveFailed: () => archive,
        ArchiveLoaded: ({ cards }) =>
          ArchiveLoad.ArchiveLoaded({ cards: shownCards(cards, confirmed) }),
      }),
    restores: () => remaining,
  })
}

const isShown = (model: Model, cardId: number): boolean =>
  ArchiveLoad.match(model.archive, {
    ArchiveLoading: () => false,
    ArchiveFailed: () => false,
    ArchiveLoaded: ({ cards }) =>
      Array.some(shownCards(cards, model.restores), card => card.id === cardId),
  })

export const update = (model: Model, message: Message) =>
  Message.match<UpdateReturn>(message, {
    SucceededFetchArchived: ({ cards }) => ({
      model: modifyFields(model, {
        archive: () => ArchiveLoad.ArchiveLoaded({ cards }),
      }),
    }),

    FailedFetchArchived: ({ error }) => ({
      model: modifyFields(model, {
        archive: () => ArchiveLoad.ArchiveFailed({ error }),
      }),
    }),

    ClickedRestore: ({ cardId }) => {
      if (!isShown(model, cardId)) {
        return { model }
      }
      const opId = model.nextId
      return {
        model: modifyFields(model, {
          nextId: nextId => nextId + 1,
          restores: restores =>
            Array.append(restores, { opId, cardId, isConfirmed: false }),
          maybeRestoreError: () => Option.none(),
        }),
        commands: [RestoreCard({ opId, cardId })],
      }
    },

    SucceededRestoreCard: ({ opId }) => ({
      model: flushRestores(
        modifyFields(model, {
          restores: restores =>
            Array.map(restores, restore =>
              restore.opId === opId
                ? modifyFields(restore, { isConfirmed: () => true })
                : restore,
            ),
        }),
      ),
    }),

    FailedRestoreCard: ({ opId, error }) => ({
      model: flushRestores(
        modifyFields(model, {
          restores: restores =>
            Array.filter(restores, restore => restore.opId !== opId),
          maybeRestoreError: () => Option.some(error),
        }),
      ),
    }),
  })

// VIEW

const archivedRow = (card: ArchivedCard, h: HtmlBuilder<Message>): Html =>
  h.keyed('li')(
    `archived-${card.id}`,
    [h.Class('archived-row')],
    [
      h.span(
        [h.DataAttribute('testid', 'archived-card')],
        [`#${card.id} ${card.title}`],
      ),
      h.button(
        [
          h.Type('button'),
          h.DataAttribute('testid', 'restore'),
          h.AriaLabel(`Restore #${card.id} ${card.title}`),
          h.OnClick(Message.ClickedRestore({ cardId: card.id })),
        ],
        ['Restore'],
      ),
    ],
  )

export const view = Submodel.defineView<Model, Message>((model, h) =>
  h.section(
    [h.Class('archive-page')],
    [
      h.h2([], ['Archive']),
      Option.match(model.maybeRestoreError, {
        onNone: () => h.empty,
        onSome: error =>
          h.p(
            [
              h.DataAttribute('testid', 'restore-error'),
              h.Class('error'),
              h.Role('alert'),
            ],
            [`restore error: ${error}`],
          ),
      }),
      h.div(
        [h.DataAttribute('testid', 'archived')],
        [
          ArchiveLoad.match(model.archive, {
            ArchiveLoading: () => h.p([h.Class('status')], ['loading archive']),
            ArchiveFailed: ({ error }) =>
              h.p(
                [h.Class('error'), h.Role('alert')],
                [`archive error: ${error}`],
              ),
            ArchiveLoaded: ({ cards }) =>
              Array.match(shownCards(cards, model.restores), {
                onEmpty: () => h.p([h.Class('status')], ['No archived cards']),
                onNonEmpty: shown =>
                  h.ul(
                    [h.Class('archived-list')],
                    Array.map(shown, card => archivedRow(card, h)),
                  ),
              }),
          }),
        ],
      ),
    ],
  ),
)
