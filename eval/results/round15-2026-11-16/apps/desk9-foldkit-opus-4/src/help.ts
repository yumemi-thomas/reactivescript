import { Array, Effect, Option, Schema, String } from 'effect'
import { Command, Submodel, type Update } from 'foldkit'
import { type Html, type HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { defineTaggedUnion } from 'foldkit/schema'
import { modifyFields } from 'foldkit/struct'

import * as Api from './api.js'
import { errorMessage, request } from './backend'
import { Hit, Item } from './domain'
import { TestId } from './testId'

// MODEL

const MIN_QUERY_LENGTH = 2

export const ResultSet = Schema.Struct({
  query: Schema.String,
  hits: Schema.Array(Hit),
})
export type ResultSet = typeof ResultSet.Type

export const Results = defineTaggedUnion({
  Empty: {},
  TooShort: { query: Schema.String },
  Searching: {
    requestId: Schema.Number,
    query: Schema.String,
    maybePrevious: Schema.Option(ResultSet),
  },
  Found: { resultSet: ResultSet },
  Failed: { query: Schema.String, error: Schema.String },
})
export type Results = typeof Results.Type

export const ItemState = defineTaggedUnion({
  NotSelected: {},
  Loading: { requestId: Schema.Number, hitId: Schema.Number },
  Found: { item: Item },
  NotFound: { hitId: Schema.Number },
  Failed: { hitId: Schema.Number, error: Schema.String },
})
export type ItemState = typeof ItemState.Type

export const Model = Schema.Struct({
  nextId: Schema.Number,
  query: Schema.String,
  results: Results,
  maybeSelectedHitId: Schema.Option(Schema.Number),
  item: ItemState,
})
export type Model = typeof Model.Type

// MESSAGE

export const Message = defineMessageUnion({
  UpdatedQuery: { value: Schema.String },
  ClickedHit: { hitId: Schema.Number },
  ClickedRetryItem: {},
  SucceededSearch: { requestId: Schema.Number, hits: Schema.Array(Hit) },
  FailedSearch: { requestId: Schema.Number, error: Schema.String },
  SucceededFetchItem: { requestId: Schema.Number, maybeItem: Schema.Option(Item) },
  FailedFetchItem: { requestId: Schema.Number, error: Schema.String },
})
export type Message = typeof Message.Type

type UpdateReturn = Update.Return<Model, Message>

// COMMAND

const Search = Command.define('Search', {
  args: { requestId: Schema.Number, query: Schema.String },
  messages: [Message.SucceededSearch, Message.FailedSearch],
  execute: ({ requestId, query }) =>
    request(Schema.Array(Hit), () => Api.search(query)).pipe(
      Effect.map(hits => Message.SucceededSearch({ requestId, hits })),
      Effect.catch(error =>
        Effect.succeed(
          Message.FailedSearch({ requestId, error: errorMessage(error) }),
        ),
      ),
    ),
})

const FetchItem = Command.define('FetchItem', {
  args: { requestId: Schema.Number, hitId: Schema.Number },
  messages: [Message.SucceededFetchItem, Message.FailedFetchItem],
  execute: ({ requestId, hitId }) =>
    request(Schema.OptionFromNullOr(Item), () => Api.fetchItem(hitId)).pipe(
      Effect.map(maybeItem => Message.SucceededFetchItem({ requestId, maybeItem })),
      Effect.catch(error =>
        Effect.succeed(
          Message.FailedFetchItem({ requestId, error: errorMessage(error) }),
        ),
      ),
    ),
})

// INIT

const emptyModel: Model = {
  nextId: 1,
  query: '',
  results: Results.Empty(),
  maybeSelectedHitId: Option.none(),
  item: ItemState.NotSelected(),
}

export const init = (): UpdateReturn => ({ model: emptyModel })

const loadItem = (model: Model, hitId: number): UpdateReturn => ({
  model: modifyFields(model, {
    nextId: id => id + 1,
    maybeSelectedHitId: () => Option.some(hitId),
    item: () => ItemState.Loading({ requestId: model.nextId, hitId }),
  }),
  commands: [FetchItem({ requestId: model.nextId, hitId })],
})

export const initWithHit = (
  query: string,
  hits: ReadonlyArray<Hit>,
  hitId: number,
): UpdateReturn =>
  loadItem(
    modifyFields(emptyModel, {
      query: () => query,
      results: () => Results.Found({ resultSet: { query, hits } }),
    }),
    hitId,
  )

// UPDATE

const shownResultSet = (results: Results): Option.Option<ResultSet> =>
  Results.match(results, {
    Empty: () => Option.none(),
    TooShort: () => Option.none(),
    Searching: ({ maybePrevious }) => maybePrevious,
    Found: ({ resultSet }) => Option.some(resultSet),
    Failed: () => Option.none(),
  })

const isSearching = (model: Model, requestId: number): boolean =>
  model.results._tag === 'Searching' && model.results.requestId === requestId

const isLoadingItem = (model: Model, requestId: number): boolean =>
  model.item._tag === 'Loading' && model.item.requestId === requestId

export const update = (model: Model, message: Message) =>
  Message.match<UpdateReturn>(message, {
    UpdatedQuery: ({ value }) => {
      const query = String.trim(value)
      const withQuery = modifyFields(model, { query: () => value })
      if (String.isEmpty(query)) {
        return {
          model: modifyFields(withQuery, { results: () => Results.Empty() }),
        }
      }
      if (query.length < MIN_QUERY_LENGTH) {
        return {
          model: modifyFields(withQuery, {
            results: () => Results.TooShort({ query }),
          }),
        }
      }
      const isSameQuery =
        (model.results._tag === 'Searching' && model.results.query === query) ||
        (model.results._tag === 'Found' &&
          model.results.resultSet.query === query)
      if (isSameQuery) {
        return { model: withQuery }
      }
      const requestId = model.nextId
      return {
        model: modifyFields(withQuery, {
          nextId: id => id + 1,
          results: () =>
            Results.Searching({
              requestId,
              query,
              maybePrevious: shownResultSet(model.results),
            }),
        }),
        commands: [Search({ requestId, query })],
      }
    },

    ClickedHit: ({ hitId }) =>
      Option.contains(model.maybeSelectedHitId, hitId) &&
      model.item._tag !== 'Failed'
        ? { model }
        : loadItem(model, hitId),

    ClickedRetryItem: () =>
      Option.match(model.maybeSelectedHitId, {
        onNone: () => ({ model }),
        onSome: hitId => loadItem(model, hitId),
      }),

    SucceededSearch: ({ requestId, hits }) =>
      Results.match(model.results, {
        Empty: () => ({ model }),
        TooShort: () => ({ model }),
        Found: () => ({ model }),
        Failed: () => ({ model }),
        Searching: ({ query }) =>
          isSearching(model, requestId)
            ? {
                model: modifyFields(model, {
                  results: () => Results.Found({ resultSet: { query, hits } }),
                }),
              }
            : { model },
      }),

    FailedSearch: ({ requestId, error }) =>
      Results.match(model.results, {
        Empty: () => ({ model }),
        TooShort: () => ({ model }),
        Found: () => ({ model }),
        Failed: () => ({ model }),
        Searching: ({ query }) =>
          isSearching(model, requestId)
            ? {
                model: modifyFields(model, {
                  results: () => Results.Failed({ query, error }),
                }),
              }
            : { model },
      }),

    SucceededFetchItem: ({ requestId, maybeItem }) =>
      ItemState.match(model.item, {
        NotSelected: () => ({ model }),
        Found: () => ({ model }),
        NotFound: () => ({ model }),
        Failed: () => ({ model }),
        Loading: ({ hitId }) =>
          isLoadingItem(model, requestId)
            ? {
                model: modifyFields(model, {
                  item: () =>
                    Option.match(maybeItem, {
                      onNone: () => ItemState.NotFound({ hitId }),
                      onSome: item => ItemState.Found({ item }),
                    }),
                }),
              }
            : { model },
      }),

    FailedFetchItem: ({ requestId, error }) =>
      ItemState.match(model.item, {
        NotSelected: () => ({ model }),
        Found: () => ({ model }),
        NotFound: () => ({ model }),
        Failed: () => ({ model }),
        Loading: ({ hitId }) =>
          isLoadingItem(model, requestId)
            ? {
                model: modifyFields(model, {
                  item: () => ItemState.Failed({ hitId, error }),
                }),
              }
            : { model },
      }),
  })

// VIEW

const HIT_BUTTON_STYLE = {
  display: 'block',
  width: '100%',
  textAlign: 'left',
}

const resultSetView = (
  resultSet: ResultSet,
  model: Model,
  h: HtmlBuilder<Message>,
): Html =>
  h.div(
    [],
    [
      h.p([], [`${resultSet.hits.length} results for ${resultSet.query}`]),
      h.ul(
        [h.Class('hits')],
        Array.map(resultSet.hits, hit => {
          const isSelected = Option.contains(model.maybeSelectedHitId, hit.id)
          return h.keyed('li')(`${hit.id}`, [TestId('hit')], [
            h.button(
              [
                h.Type('button'),
                h.Style(HIT_BUTTON_STYLE),
                h.AriaCurrent(isSelected ? 'true' : 'false'),
                h.OnClick(Message.ClickedHit({ hitId: hit.id })),
              ],
              [isSelected ? `> ${hit.name}` : hit.name],
            ),
          ])
        }),
      ),
    ],
  )

const resultsView = (model: Model, h: HtmlBuilder<Message>): Html =>
  h.div(
    [TestId('results'), h.Class('results'), h.AriaLive('polite')],
    [
      Results.match(model.results, {
        Empty: () => h.empty,
        TooShort: ({ query }) => h.p([], [`too short: ${query}`]),
        Searching: ({ maybePrevious }) =>
          h.div(
            [],
            [
              h.p([], ['searching…']),
              Option.match(maybePrevious, {
                onNone: () => h.empty,
                onSome: resultSet => resultSetView(resultSet, model, h),
              }),
            ],
          ),
        Found: ({ resultSet }) => resultSetView(resultSet, model, h),
        Failed: ({ error }) =>
          h.p([h.Role('alert')], [`search failed: ${error}`]),
      }),
    ],
  )

const itemView = (model: Model, h: HtmlBuilder<Message>): Html =>
  h.section(
    [TestId('item'), h.Class('item'), h.AriaLive('polite')],
    [
      ItemState.match(model.item, {
        NotSelected: () => h.p([], ['pick a result']),
        Loading: () => h.p([], ['loading…']),
        Found: ({ item }) =>
          h.div([], [h.h2([], [item.name]), h.p([], [item.blurb])]),
        NotFound: ({ hitId }) => h.p([h.Role('alert')], [`item ${hitId} not found`]),
        Failed: ({ error }) =>
          h.div(
            [],
            [
              h.p([h.Role('alert')], [`failed: ${error}`]),
              h.button(
                [
                  TestId('retry-item'),
                  h.Type('button'),
                  h.OnClick(Message.ClickedRetryItem()),
                ],
                ['retry'],
              ),
            ],
          ),
      }),
    ],
  )

export const view = Submodel.defineView<Model, Message>((model, h) =>
  h.div(
    [h.Class('help-page')],
    [
      h.label([h.For('query')], ['Search help']),
      h.input([
        h.Id('query'),
        TestId('query'),
        h.Type('search'),
        h.Autocomplete('off'),
        h.Value(model.query),
        h.OnInput(value => Message.UpdatedQuery({ value })),
      ]),
      h.div([h.Class('columns')], [resultsView(model, h), itemView(model, h)]),
    ],
  ),
)
