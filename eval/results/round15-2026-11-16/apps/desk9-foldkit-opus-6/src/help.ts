import { Array, Effect, Option, Schema, String } from 'effect'
import { Command, Submodel, type Update } from 'foldkit'
import { Html, HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { defineTaggedUnion } from 'foldkit/schema'
import { modifyFields } from 'foldkit/struct'

import * as Api from './domain'
import { Hit, Item } from './domain'

// MODEL

export const ShownHits = Schema.Struct({
  query: Schema.String,
  hits: Schema.Array(Hit),
})
export type ShownHits = typeof ShownHits.Type

export const Results = defineTaggedUnion({
  Empty: {},
  TooShort: {},
  Searching: {
    requestId: Schema.Number,
    maybeShown: Schema.Option(ShownHits),
  },
  Shown: { shown: ShownHits },
  Failed: { error: Schema.String },
})
export type Results = typeof Results.Type

export const ItemState = defineTaggedUnion({
  Loading: { requestId: Schema.Number },
  Missing: {},
  Failed: { error: Schema.String },
  Loaded: { item: Item },
})
export type ItemState = typeof ItemState.Type

export const Selection = Schema.Struct({
  hitId: Schema.Number,
  item: ItemState,
})
export type Selection = typeof Selection.Type

export const Model = Schema.Struct({
  nextId: Schema.Number,
  query: Schema.String,
  results: Results,
  maybeSelection: Schema.Option(Selection),
})
export type Model = typeof Model.Type

// MESSAGE

export const Message = defineMessageUnion({
  UpdatedQuery: { value: Schema.String },
  ClickedHit: { hitId: Schema.Number },
  ClickedRetryItem: {},
  SucceededSearch: { requestId: Schema.Number, hits: Schema.Array(Hit) },
  FailedSearch: { requestId: Schema.Number, error: Schema.String },
  SucceededFetchItem: {
    requestId: Schema.Number,
    maybeItem: Schema.Option(Item),
  },
  FailedFetchItem: { requestId: Schema.Number, error: Schema.String },
})
export type Message = typeof Message.Type

// COMMAND

export const Search = Command.define('Search', {
  args: { requestId: Schema.Number, query: Schema.String },
  messages: [Message.SucceededSearch, Message.FailedSearch],
  execute: ({ requestId, query }) =>
    Api.search(query).pipe(
      Effect.map(hits => Message.SucceededSearch({ requestId, hits })),
      Effect.catch(error =>
        Effect.succeed(Message.FailedSearch({ requestId, error })),
      ),
    ),
})

export const FetchItem = Command.define('FetchItem', {
  args: { requestId: Schema.Number, itemId: Schema.Number },
  messages: [Message.SucceededFetchItem, Message.FailedFetchItem],
  execute: ({ requestId, itemId }) =>
    Api.fetchItem(itemId).pipe(
      Effect.map(answer =>
        Message.SucceededFetchItem({
          requestId,
          maybeItem: Option.fromNullOr(answer),
        }),
      ),
      Effect.catch(error =>
        Effect.succeed(Message.FailedFetchItem({ requestId, error })),
      ),
    ),
})

// INIT

const MIN_QUERY_LENGTH = 2

export const init = (): Update.Return<Model, Message> => ({
  model: {
    nextId: 0,
    query: '',
    results: Results.Empty(),
    maybeSelection: Option.none(),
  },
})

export const initWithSelectedHit = (
  query: string,
  hits: ReadonlyArray<Hit>,
  hitId: number,
): Update.Return<Model, Message> => {
  const requestId = 0
  return {
    model: {
      nextId: requestId + 1,
      query,
      results: Results.Shown({ shown: { query, hits } }),
      maybeSelection: Option.some({
        hitId,
        item: ItemState.Loading({ requestId }),
      }),
    },
    commands: [FetchItem({ requestId, itemId: hitId })],
  }
}

// UPDATE

type UpdateReturn = Update.Return<Model, Message>

const shownHits = (results: Results): Option.Option<ShownHits> =>
  Results.match(results, {
    Empty: () => Option.none(),
    TooShort: () => Option.none(),
    Searching: ({ maybeShown }) => maybeShown,
    Shown: ({ shown }) => Option.some(shown),
    Failed: () => Option.none(),
  })

const keepSelectionIfShown = (model: Model): Model => {
  const isShown = (selection: Selection): boolean =>
    Option.exists(shownHits(model.results), shown =>
      Array.some(shown.hits, hit => hit.id === selection.hitId),
    )
  return modifyFields(model, {
    maybeSelection: Option.filter(isShown),
  })
}

const isItemRequest = (model: Model, requestId: number): boolean =>
  Option.exists(
    model.maybeSelection,
    selection =>
      selection.item._tag === 'Loading' &&
      selection.item.requestId === requestId,
  )

const isSearchRequest = (model: Model, requestId: number): boolean =>
  model.results._tag === 'Searching' && model.results.requestId === requestId

const settleItem = (model: Model, item: ItemState): Model =>
  modifyFields(model, {
    maybeSelection: Option.map(selection =>
      modifyFields(selection, { item: () => item }),
    ),
  })

const startFetchItem = (model: Model, hitId: number): UpdateReturn => {
  const requestId = model.nextId
  return {
    model: modifyFields(model, {
      nextId: () => requestId + 1,
      maybeSelection: () =>
        Option.some({ hitId, item: ItemState.Loading({ requestId }) }),
    }),
    commands: [FetchItem({ requestId, itemId: hitId })],
  }
}

export const update = (model: Model, message: Message) =>
  Message.match<UpdateReturn>(message, {
    UpdatedQuery: ({ value }) => {
      if (String.isEmpty(value)) {
        return {
          model: keepSelectionIfShown(
            modifyFields(model, {
              query: () => value,
              results: () => Results.Empty(),
            }),
          ),
        }
      }
      if (String.length(value) < MIN_QUERY_LENGTH) {
        return {
          model: keepSelectionIfShown(
            modifyFields(model, {
              query: () => value,
              results: () => Results.TooShort(),
            }),
          ),
        }
      }
      const requestId = model.nextId
      return {
        model: modifyFields(model, {
          nextId: () => requestId + 1,
          query: () => value,
          results: results =>
            Results.Searching({ requestId, maybeShown: shownHits(results) }),
        }),
        commands: [Search({ requestId, query: value })],
      }
    },

    ClickedHit: ({ hitId }) => {
      const isAlreadySelected = Option.exists(
        model.maybeSelection,
        selection => selection.hitId === hitId,
      )
      return isAlreadySelected ? { model } : startFetchItem(model, hitId)
    },

    ClickedRetryItem: () =>
      Option.match(model.maybeSelection, {
        onNone: () => ({ model }),
        onSome: selection =>
          selection.item._tag === 'Failed'
            ? startFetchItem(model, selection.hitId)
            : { model },
      }),

    SucceededSearch: ({ requestId, hits }) =>
      isSearchRequest(model, requestId)
        ? {
            model: keepSelectionIfShown(
              modifyFields(model, {
                results: () =>
                  Results.Shown({ shown: { query: model.query, hits } }),
              }),
            ),
          }
        : { model },

    FailedSearch: ({ requestId, error }) =>
      isSearchRequest(model, requestId)
        ? {
            model: keepSelectionIfShown(
              modifyFields(model, {
                results: () => Results.Failed({ error }),
              }),
            ),
          }
        : { model },

    SucceededFetchItem: ({ requestId, maybeItem }) =>
      isItemRequest(model, requestId)
        ? {
            model: settleItem(
              model,
              Option.match(maybeItem, {
                onNone: () => ItemState.Missing(),
                onSome: item => ItemState.Loaded({ item }),
              }),
            ),
          }
        : { model },

    FailedFetchItem: ({ requestId, error }) =>
      isItemRequest(model, requestId)
        ? { model: settleItem(model, ItemState.Failed({ error })) }
        : { model },
  })

// VIEW

const hitsView = (
  model: Model,
  shown: ShownHits,
  h: HtmlBuilder<Message>,
): Html =>
  h.div(
    [],
    [
      h.p(
        [h.Class('summary')],
        [`${shown.hits.length} results for ${shown.query}`],
      ),
      h.ul(
        [h.Class('hits')],
        Array.map(shown.hits, hit => {
          const isSelected = Option.exists(
            model.maybeSelection,
            selection => selection.hitId === hit.id,
          )
          return h.keyed('li')(
            `hit-${hit.id}`,
            [h.DataAttribute('testid', 'hit'), h.Class('hit')],
            [
              h.button(
                [
                  h.Type('button'),
                  h.AriaPressed(isSelected ? 'true' : 'false'),
                  h.OnClick(Message.ClickedHit({ hitId: hit.id })),
                ],
                [isSelected ? `> ${hit.name}` : hit.name],
              ),
            ],
          )
        }),
      ),
    ],
  )

const resultsView = (model: Model, h: HtmlBuilder<Message>): Html =>
  h.div(
    [
      h.DataAttribute('testid', 'results'),
      h.Class('results'),
      h.AriaLive('polite'),
    ],
    [
      Results.match(model.results, {
        Empty: () => h.empty,
        TooShort: () => h.p([h.Class('muted')], [`too short: ${model.query}`]),
        Searching: ({ maybeShown }) =>
          h.div(
            [],
            [
              h.p([h.Class('muted')], ['searching…']),
              Option.match(maybeShown, {
                onNone: () => h.empty,
                onSome: shown => hitsView(model, shown, h),
              }),
            ],
          ),
        Shown: ({ shown }) => hitsView(model, shown, h),
        Failed: ({ error }) =>
          h.p([h.Class('error')], [`search failed: ${error}`]),
      }),
    ],
  )

const itemView = (model: Model, h: HtmlBuilder<Message>): Html =>
  h.section(
    [h.DataAttribute('testid', 'item'), h.Class('item')],
    [
      Option.match(model.maybeSelection, {
        onNone: () => h.p([h.Class('muted')], ['pick a result']),
        onSome: selection =>
          ItemState.match(selection.item, {
            Loading: () => h.p([h.Class('muted')], ['loading…']),
            Missing: () =>
              h.p([h.Class('error')], [`item ${selection.hitId} not found`]),
            Failed: ({ error }) =>
              h.div(
                [],
                [
                  h.p([h.Class('error')], [`failed: ${error}`]),
                  h.button(
                    [
                      h.DataAttribute('testid', 'retry-item'),
                      h.Type('button'),
                      h.OnClick(Message.ClickedRetryItem()),
                    ],
                    ['retry'],
                  ),
                ],
              ),
            Loaded: ({ item }) =>
              h.div(
                [],
                [h.h2([], [item.name]), h.p([h.Class('body')], [item.blurb])],
              ),
          }),
      }),
    ],
  )

export const view = Submodel.defineView<Model, Message>(
  (model, h): Html =>
    h.div(
      [h.Class('help-page')],
      [
        h.label(
          [h.Class('field')],
          [
            'Search help ',
            h.input([
              h.DataAttribute('testid', 'query'),
              h.Type('search'),
              h.Value(model.query),
              h.OnInput(value => Message.UpdatedQuery({ value })),
            ]),
          ],
        ),
        h.div([h.Class('columns')], [resultsView(model, h), itemView(model, h)]),
      ],
    ),
)
