import { Array, Effect, Option, Schema, String } from 'effect'
import { Command, Submodel, Update } from 'foldkit'
import { type Html, type HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { defineTaggedUnion } from 'foldkit/schema'
import { modifyFields } from 'foldkit/struct'

import { Hit, Item } from '../domain'
import * as Request from '../request'

// MODEL

const MIN_QUERY_LENGTH = 2

export const Found = Schema.Struct({
  query: Schema.String,
  hits: Schema.Array(Hit),
})
export type Found = typeof Found.Type

export const Results = defineTaggedUnion({
  Empty: {},
  TooShort: { query: Schema.String },
  Searching: { query: Schema.String, maybePrevious: Schema.Option(Found) },
  Found: { found: Found },
  Failed: { query: Schema.String, error: Schema.String },
})
export type Results = typeof Results.Type

export const ItemPane = defineTaggedUnion({
  Unselected: {},
  Loading: { hitId: Schema.Number },
  Loaded: { hitId: Schema.Number, item: Item },
  NotFound: { hitId: Schema.Number },
  Failed: { hitId: Schema.Number, error: Schema.String },
})
export type ItemPane = typeof ItemPane.Type

export const Model = Schema.Struct({
  query: Schema.String,
  results: Results,
  itemPane: ItemPane,
  itemRequestId: Schema.Number,
})
export type Model = typeof Model.Type

// MESSAGE

export const Message = defineMessageUnion({
  UpdatedQuery: { value: Schema.String },
  SucceededSearch: { query: Schema.String, hits: Schema.Array(Hit) },
  FailedSearch: { query: Schema.String, error: Schema.String },
  ClickedHit: { hitId: Schema.Number },
  ClickedRetryItem: {},
  SucceededFetchItem: {
    requestId: Schema.Number,
    maybeItem: Schema.Option(Item),
  },
  FailedFetchItem: { requestId: Schema.Number, error: Schema.String },
})
export type Message = typeof Message.Type

// COMMAND

export const Search = Command.define('Search', {
  args: { query: Schema.String },
  messages: [Message.SucceededSearch, Message.FailedSearch],
  execute: ({ query }) =>
    Request.search(query).pipe(
      Effect.map(hits => Message.SucceededSearch({ query, hits })),
      Effect.catch(error =>
        Effect.succeed(Message.FailedSearch({ query, error })),
      ),
    ),
})

export const FetchItem = Command.define('FetchItem', {
  args: { requestId: Schema.Number, hitId: Schema.Number },
  messages: [Message.SucceededFetchItem, Message.FailedFetchItem],
  execute: ({ requestId, hitId }) =>
    Request.fetchItem(hitId).pipe(
      Effect.map(maybeItem =>
        Message.SucceededFetchItem({ requestId, maybeItem }),
      ),
      Effect.catch(error =>
        Effect.succeed(Message.FailedFetchItem({ requestId, error })),
      ),
    ),
})

// INIT

type UpdateReturn = Update.Return<Model, Message>

const previousFound = (results: Results): Option.Option<Found> =>
  Results.match<Option.Option<Found>>(results, {
    Empty: () => Option.none(),
    TooShort: () => Option.none(),
    Searching: ({ maybePrevious }) => maybePrevious,
    Found: ({ found }) => Option.some(found),
    Failed: () => Option.none(),
  })

const withQuery = (model: Model, query: string): UpdateReturn => {
  if (String.isEmpty(query)) {
    return {
      model: modifyFields(model, {
        query: () => query,
        results: () => Results.Empty(),
      }),
    }
  }
  if (query.length < MIN_QUERY_LENGTH) {
    return {
      model: modifyFields(model, {
        query: () => query,
        results: () => Results.TooShort({ query }),
      }),
    }
  }
  return {
    model: modifyFields(model, {
      query: () => query,
      results: () =>
        Results.Searching({
          query,
          maybePrevious: previousFound(model.results),
        }),
    }),
    commands: [Search({ query })],
  }
}

const withSelectedHit = (model: Model, hitId: number): UpdateReturn => {
  const requestId = model.itemRequestId + 1
  return {
    model: modifyFields(model, {
      itemPane: () => ItemPane.Loading({ hitId }),
      itemRequestId: () => requestId,
    }),
    commands: [FetchItem({ requestId, hitId })],
  }
}

const initialModel: Model = {
  query: '',
  results: Results.Empty(),
  itemPane: ItemPane.Unselected(),
  itemRequestId: 0,
}

export const init = (): UpdateReturn => ({ model: initialModel })

export const initWithHit = (query: string, hitId: number): UpdateReturn =>
  Update.combine(initialModel, [
    stepModel => withQuery(stepModel, query),
    stepModel => withSelectedHit(stepModel, hitId),
  ])

// UPDATE

const selectedHitId = (itemPane: ItemPane): Option.Option<number> =>
  ItemPane.match<Option.Option<number>>(itemPane, {
    Unselected: () => Option.none(),
    Loading: ({ hitId }) => Option.some(hitId),
    Loaded: ({ hitId }) => Option.some(hitId),
    NotFound: ({ hitId }) => Option.some(hitId),
    Failed: ({ hitId }) => Option.some(hitId),
  })

const isAwaitedSearch = (model: Model, query: string): boolean =>
  model.results._tag === 'Searching' && model.results.query === query

export const update = (model: Model, message: Message) =>
  Message.match<UpdateReturn>(message, {
    UpdatedQuery: ({ value }) => withQuery(model, value),

    SucceededSearch: ({ query, hits }) => {
      if (!isAwaitedSearch(model, query)) {
        return { model }
      }
      return {
        model: modifyFields(model, {
          results: () => Results.Found({ found: { query, hits } }),
        }),
      }
    },

    FailedSearch: ({ query, error }) => {
      if (!isAwaitedSearch(model, query)) {
        return { model }
      }
      return {
        model: modifyFields(model, {
          results: () => Results.Failed({ query, error }),
        }),
      }
    },

    ClickedHit: ({ hitId }) => withSelectedHit(model, hitId),

    ClickedRetryItem: () =>
      Option.match(selectedHitId(model.itemPane), {
        onNone: () => ({ model }),
        onSome: hitId => withSelectedHit(model, hitId),
      }),

    SucceededFetchItem: ({ requestId, maybeItem }) => {
      if (requestId !== model.itemRequestId) {
        return { model }
      }
      return Option.match(selectedHitId(model.itemPane), {
        onNone: () => ({ model }),
        onSome: hitId => ({
          model: modifyFields(model, {
            itemPane: () =>
              Option.match(maybeItem, {
                onNone: () => ItemPane.NotFound({ hitId }),
                onSome: item => ItemPane.Loaded({ hitId, item }),
              }),
          }),
        }),
      })
    },

    FailedFetchItem: ({ requestId, error }) => {
      if (requestId !== model.itemRequestId) {
        return { model }
      }
      return Option.match(selectedHitId(model.itemPane), {
        onNone: () => ({ model }),
        onSome: hitId => ({
          model: modifyFields(model, {
            itemPane: () => ItemPane.Failed({ hitId, error }),
          }),
        }),
      })
    },
  })

// VIEW

const hitView = (
  hit: Hit,
  maybeSelectedId: Option.Option<number>,
  h: HtmlBuilder<Message>,
): Html => {
  const isSelected = Option.exists(maybeSelectedId, id => id === hit.id)
  return h.keyed('li')(
    `hit-${hit.id}`,
    [
      h.DataAttribute('testid', 'hit'),
      h.Class(isSelected ? 'hit selected' : 'hit'),
      h.OnClick(Message.ClickedHit({ hitId: hit.id })),
    ],
    [
      h.button(
        [h.Type('button'), h.AriaPressed(isSelected ? 'true' : 'false')],
        [isSelected ? `> ${hit.name}` : hit.name],
      ),
    ],
  )
}

const foundView = (
  found: Found,
  maybeSelectedId: Option.Option<number>,
  h: HtmlBuilder<Message>,
): Html =>
  h.div(
    [h.Class('found')],
    [
      h.p([], [`${Array.length(found.hits)} results for ${found.query}`]),
      h.ul(
        [h.Class('hits')],
        Array.map(found.hits, hit => hitView(hit, maybeSelectedId, h)),
      ),
    ],
  )

const resultsView = (model: Model, h: HtmlBuilder<Message>): Html => {
  const maybeSelectedId = selectedHitId(model.itemPane)
  return h.section(
    [
      h.DataAttribute('testid', 'results'),
      h.Class('results'),
      h.AriaLive('polite'),
    ],
    Results.match<ReadonlyArray<Html>>(model.results, {
      Empty: () => [],
      TooShort: ({ query }) => [h.p([], [`too short: ${query}`])],
      Searching: ({ maybePrevious }) => [
        h.p([h.Class('status')], ['searching…']),
        Option.match(maybePrevious, {
          onNone: () => h.empty,
          onSome: found => foundView(found, maybeSelectedId, h),
        }),
      ],
      Found: ({ found }) => [foundView(found, maybeSelectedId, h)],
      Failed: ({ error }) => [
        h.p([h.Class('error'), h.Role('alert')], [`search failed: ${error}`]),
      ],
    }),
  )
}

const itemView = (model: Model, h: HtmlBuilder<Message>): Html =>
  h.section(
    [h.DataAttribute('testid', 'item'), h.Class('item'), h.AriaLive('polite')],
    ItemPane.match<ReadonlyArray<Html>>(model.itemPane, {
      Unselected: () => [h.p([], ['pick a result'])],
      Loading: () => [h.p([], ['loading…'])],
      Loaded: ({ item }) => [h.h2([], [item.name]), h.p([], [item.blurb])],
      NotFound: ({ hitId }) => [h.p([], [`item ${hitId} not found`])],
      Failed: ({ error }) => [
        h.p([h.Class('error'), h.Role('alert')], [`failed: ${error}`]),
        h.button(
          [
            h.Type('button'),
            h.DataAttribute('testid', 'retry-item'),
            h.OnClick(Message.ClickedRetryItem()),
          ],
          ['retry'],
        ),
      ],
    }),
  )

export const view = Submodel.defineView<Model, Message>((model, h) =>
  h.div(
    [h.Class('page help-page')],
    [
      h.h1([], ['Help']),
      h.label([h.For('help-query')], ['Search help']),
      h.input([
        h.Id('help-query'),
        h.Type('search'),
        h.DataAttribute('testid', 'query'),
        h.Autocomplete('off'),
        h.Value(model.query),
        h.OnInput(value => Message.UpdatedQuery({ value })),
      ]),
      h.div(
        [h.Class('help-columns')],
        [resultsView(model, h), itemView(model, h)],
      ),
    ],
  ),
)
