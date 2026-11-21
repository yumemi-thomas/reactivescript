import { Array, Effect, Option, Schema, String } from 'effect'
import { Command, Submodel, type Update } from 'foldkit'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { defineTaggedUnion } from 'foldkit/schema'
import { modifyFields } from 'foldkit/struct'

import * as Api from './api.js'
import { Hit, Item, callApi } from './domain'

// MODEL

const MIN_QUERY_LENGTH = 2

export const SearchOutcome = defineTaggedUnion({
  NoOutcome: {},
  Found: { query: Schema.String, hits: Schema.Array(Hit) },
  SearchFailed: { query: Schema.String, error: Schema.String },
})
export type SearchOutcome = typeof SearchOutcome.Type

export const PendingSearch = Schema.Struct({
  requestId: Schema.Number,
  query: Schema.String,
})
export type PendingSearch = typeof PendingSearch.Type

export const ItemState = defineTaggedUnion({
  NoItem: {},
  ItemLoading: { requestId: Schema.Number, itemId: Schema.Number },
  ItemLoaded: { item: Item },
  ItemNotFound: { itemId: Schema.Number },
  ItemFailed: { itemId: Schema.Number, error: Schema.String },
})
export type ItemState = typeof ItemState.Type

export const Model = Schema.Struct({
  query: Schema.String,
  outcome: SearchOutcome,
  maybePendingSearch: Schema.Option(PendingSearch),
  maybeSelectedHitId: Schema.Option(Schema.Number),
  item: ItemState,
  nextId: Schema.Number,
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

const Search = Command.define('Search', {
  args: { requestId: Schema.Number, query: Schema.String },
  messages: [Message.SucceededSearch, Message.FailedSearch],
  execute: ({ requestId, query }) =>
    callApi(() => Api.search(query)).pipe(
      Effect.map(hits => Message.SucceededSearch({ requestId, hits })),
      Effect.catch(error =>
        Effect.succeed(Message.FailedSearch({ requestId, error })),
      ),
    ),
})

const FetchItem = Command.define('FetchItem', {
  args: { requestId: Schema.Number, itemId: Schema.Number },
  messages: [Message.SucceededFetchItem, Message.FailedFetchItem],
  execute: ({ requestId, itemId }) =>
    callApi(() => Api.fetchItem(itemId)).pipe(
      Effect.map(item =>
        Message.SucceededFetchItem({
          requestId,
          maybeItem: Option.map(Option.fromNullishOr(item), found => ({
            id: found.id,
            name: found.name,
            blurb: found.blurb,
          })),
        }),
      ),
      Effect.catch(error =>
        Effect.succeed(Message.FailedFetchItem({ requestId, error })),
      ),
    ),
})

// INIT

type UpdateReturn = Update.Return<Model, Message>

export const init = (): UpdateReturn => ({
  model: {
    query: '',
    outcome: SearchOutcome.NoOutcome(),
    maybePendingSearch: Option.none(),
    maybeSelectedHitId: Option.none(),
    item: ItemState.NoItem(),
    nextId: 1,
  },
})

const loadItem = (model: Model, itemId: number): UpdateReturn => {
  const requestId = model.nextId
  return {
    model: modifyFields(model, {
      nextId: nextId => nextId + 1,
      maybeSelectedHitId: () => Option.some(itemId),
      item: () => ItemState.ItemLoading({ requestId, itemId }),
    }),
    commands: [FetchItem({ requestId, itemId })],
  }
}

export const initWithHit = (
  query: string,
  hits: ReadonlyArray<Hit>,
  hitId: number,
): UpdateReturn =>
  loadItem(
    modifyFields(init().model, {
      query: () => query,
      outcome: () => SearchOutcome.Found({ query, hits }),
    }),
    hitId,
  )

// UPDATE

const isAwaitedSearch = (model: Model, requestId: number): boolean =>
  Option.exists(
    model.maybePendingSearch,
    pending => pending.requestId === requestId,
  )

const isAwaitedItem = (model: Model, requestId: number): boolean =>
  model.item._tag === 'ItemLoading' && model.item.requestId === requestId

const awaitedItemId = (item: ItemState): number =>
  item._tag === 'ItemLoading' ? item.itemId : 0

export const update = (model: Model, message: Message) =>
  Message.match<UpdateReturn>(message, {
    UpdatedQuery: ({ value }) => {
      if (value === model.query) {
        return { model }
      }
      if (value.length < MIN_QUERY_LENGTH) {
        return {
          model: modifyFields(model, {
            query: () => value,
            outcome: () => SearchOutcome.NoOutcome(),
            maybePendingSearch: () => Option.none(),
          }),
        }
      }
      const requestId = model.nextId
      return {
        model: modifyFields(model, {
          query: () => value,
          nextId: nextId => nextId + 1,
          maybePendingSearch: () => Option.some({ requestId, query: value }),
        }),
        commands: [Search({ requestId, query: value })],
      }
    },

    SucceededSearch: ({ requestId, hits }) =>
      Option.match(model.maybePendingSearch, {
        onNone: () => ({ model }),
        onSome: pending =>
          pending.requestId !== requestId
            ? { model }
            : {
                model: modifyFields(model, {
                  outcome: () =>
                    SearchOutcome.Found({ query: pending.query, hits }),
                  maybePendingSearch: () => Option.none(),
                }),
              },
      }),

    FailedSearch: ({ requestId, error }) =>
      Option.match(model.maybePendingSearch, {
        onNone: () => ({ model }),
        onSome: pending =>
          pending.requestId !== requestId
            ? { model }
            : {
                model: modifyFields(model, {
                  outcome: () =>
                    SearchOutcome.SearchFailed({ query: pending.query, error }),
                  maybePendingSearch: () => Option.none(),
                }),
              },
      }),

    ClickedHit: ({ hitId }) => {
      const isAlreadyShown =
        Option.contains(model.maybeSelectedHitId, hitId) &&
        model.item._tag !== 'ItemFailed'
      return isAlreadyShown ? { model } : loadItem(model, hitId)
    },

    ClickedRetryItem: () =>
      Option.match(model.maybeSelectedHitId, {
        onNone: () => ({ model }),
        onSome: hitId => loadItem(model, hitId),
      }),

    SucceededFetchItem: ({ requestId, maybeItem }) =>
      !isAwaitedItem(model, requestId)
        ? { model }
        : {
            model: modifyFields(model, {
              item: item =>
                Option.match(maybeItem, {
                  onNone: () =>
                    ItemState.ItemNotFound({ itemId: awaitedItemId(item) }),
                  onSome: found => ItemState.ItemLoaded({ item: found }),
                }),
            }),
          },

    FailedFetchItem: ({ requestId, error }) =>
      !isAwaitedItem(model, requestId)
        ? { model }
        : {
            model: modifyFields(model, {
              item: item =>
                ItemState.ItemFailed({ itemId: awaitedItemId(item), error }),
            }),
          },
  })

// VIEW

const testId = (h: HtmlBuilder<Message>, id: string) =>
  h.DataAttribute('testid', id)

const hitsView = (
  model: Model,
  query: string,
  hits: ReadonlyArray<Hit>,
  h: HtmlBuilder<Message>,
): ReadonlyArray<Html> => [
  h.p([h.Class('summary')], [`${hits.length} results for ${query}`]),
  h.ul(
    [h.Class('hits')],
    Array.map(hits, hit => {
      const isSelected = Option.contains(model.maybeSelectedHitId, hit.id)
      return h.keyed('li')(
        `${hit.id}`,
        [
          testId(h, 'hit'),
          h.Class(isSelected ? 'hit selected' : 'hit'),
          h.Role('button'),
          h.Tabindex(0),
          h.AriaSelected(isSelected),
          h.OnClick(Message.ClickedHit({ hitId: hit.id })),
        ],
        [isSelected ? `> ${hit.name}` : hit.name],
      )
    }),
  ),
]

const outcomeView = (
  model: Model,
  h: HtmlBuilder<Message>,
): ReadonlyArray<Html> =>
  SearchOutcome.match(model.outcome, {
    NoOutcome: () => [],
    Found: ({ query, hits }) => hitsView(model, query, hits, h),
    SearchFailed: ({ error }) =>
      Option.isSome(model.maybePendingSearch)
        ? []
        : [h.p([h.Class('error')], [`search failed: ${error}`])],
  })

const resultsContent = (
  model: Model,
  h: HtmlBuilder<Message>,
): ReadonlyArray<Html> => {
  if (String.isEmpty(model.query)) {
    return []
  }
  if (model.query.length < MIN_QUERY_LENGTH) {
    return [h.p([h.Class('status')], [`too short: ${model.query}`])]
  }
  return [
    Option.isSome(model.maybePendingSearch)
      ? h.p([h.Class('status')], ['searching…'])
      : h.empty,
    ...outcomeView(model, h),
  ]
}

const itemView = (model: Model, h: HtmlBuilder<Message>): Html =>
  ItemState.match(model.item, {
    NoItem: () => h.p([h.Class('status')], ['pick a result']),
    ItemLoading: () => h.p([h.Class('status')], ['loading…']),
    ItemLoaded: ({ item }) =>
      h.article(
        [],
        [h.h2([], [item.name]), h.p([h.Class('blurb')], [item.blurb])],
      ),
    ItemNotFound: ({ itemId }) =>
      h.p([h.Class('error')], [`item ${itemId} not found`]),
    ItemFailed: ({ error }) =>
      h.div(
        [],
        [
          h.p([h.Class('error')], [`failed: ${error}`]),
          h.button(
            [
              testId(h, 'retry-item'),
              h.Type('button'),
              h.OnClick(Message.ClickedRetryItem()),
            ],
            ['retry'],
          ),
        ],
      ),
  })

export const view = Submodel.defineView<Model, Message>((model, h) =>
  h.div(
    [h.Class('help-page')],
    [
      h.label(
        [],
        [
          'Search help ',
          h.input([
            testId(h, 'query'),
            h.Type('search'),
            h.Value(model.query),
            h.OnInput(value => Message.UpdatedQuery({ value })),
          ]),
        ],
      ),
      h.div(
        [h.Class('columns')],
        [
          h.section(
            [testId(h, 'results'), h.Class('results'), h.AriaLive('polite')],
            resultsContent(model, h),
          ),
          h.section(
            [testId(h, 'item'), h.Class('item'), h.AriaLive('polite')],
            [itemView(model, h)],
          ),
        ],
      ),
    ],
  ),
)
