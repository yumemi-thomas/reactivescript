import { Effect, Option, Schema } from 'effect'
import { Command, Submodel, type Update } from 'foldkit'
import { Html, HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { defineTaggedUnion } from 'foldkit/schema'
import { modifyFields } from 'foldkit/struct'

import { fetchItem, search } from './api'
import { Hit, callApi } from './shared'

// MODEL

const Item = Schema.Struct({
  id: Schema.Number,
  name: Schema.String,
  blurb: Schema.String,
})

const Results = defineTaggedUnion({
  Idle: {},
  TooShort: {},
  Searching: {},
  Found: {},
  Failed: { message: Schema.String },
})
type Results = typeof Results.Type

const ItemState = defineTaggedUnion({
  Idle: {},
  Loading: {},
  Loaded: { name: Schema.String, blurb: Schema.String },
  NotFound: { id: Schema.Number },
  Failed: { message: Schema.String },
})
type ItemState = typeof ItemState.Type

export const Model = Schema.Struct({
  query: Schema.String,
  results: Results,
  hits: Schema.Array(Hit),
  maybeSelectedId: Schema.Option(Schema.Number),
  item: ItemState,
})
export type Model = typeof Model.Type

const initialModel = (): Model => ({
  query: '',
  results: Results.Idle(),
  hits: [],
  maybeSelectedId: Option.none(),
  item: ItemState.Idle(),
})

// MESSAGE

export const Message = defineMessageUnion({
  UpdatedQuery: { value: Schema.String },
  SelectedHit: { id: Schema.Number },
  ClickedRetryItem: {},
  SucceededSearch: { query: Schema.String, hits: Schema.Array(Hit) },
  FailedSearch: { query: Schema.String, message: Schema.String },
  SucceededFetchItem: { id: Schema.Number, item: Schema.NullOr(Item) },
  FailedFetchItem: { id: Schema.Number, message: Schema.String },
})
export type Message = typeof Message.Type

// COMMAND

const Search = Command.define('Search', {
  args: { query: Schema.String },
  messages: [Message.SucceededSearch, Message.FailedSearch],
  execute: ({ query }) =>
    callApi(() => search(query)).pipe(
      Effect.map(hits => Message.SucceededSearch({ query, hits })),
      Effect.catch(message =>
        Effect.succeed(Message.FailedSearch({ query, message })),
      ),
    ),
})

const FetchItem = Command.define('FetchItem', {
  args: { id: Schema.Number },
  messages: [Message.SucceededFetchItem, Message.FailedFetchItem],
  execute: ({ id }) =>
    callApi(() => fetchItem(id)).pipe(
      Effect.map(item => Message.SucceededFetchItem({ id, item })),
      Effect.catch(message =>
        Effect.succeed(Message.FailedFetchItem({ id, message })),
      ),
    ),
})

// HELPERS

const beginSearch = (
  model: Model,
  query: string,
): Update.Return<Model, Message> => {
  if (query.length === 0) {
    return {
      model: modifyFields(model, {
        query: () => query,
        results: () => Results.Idle(),
        hits: () => [],
      }),
    }
  }
  if (query.length === 1) {
    return {
      model: modifyFields(model, {
        query: () => query,
        results: () => Results.TooShort(),
        hits: () => [],
      }),
    }
  }
  return {
    model: modifyFields(model, {
      query: () => query,
      results: () => Results.Searching(),
    }),
    commands: [Search({ query })],
  }
}

// INIT

export const init = (): Update.Return<Model, Message> => ({
  model: initialModel(),
})

export const openRelated = (
  query: string,
  hitId: number,
): Update.Return<Model, Message> => {
  const searched = beginSearch(initialModel(), query)
  return {
    model: modifyFields(searched.model, {
      maybeSelectedId: () => Option.some(hitId),
      item: () => ItemState.Loading(),
    }),
    commands: [...(searched.commands ?? []), FetchItem({ id: hitId })],
  }
}

// UPDATE

export const update = (model: Model, message: Message): Update.Return<Model, Message> =>
  Message.match<Update.Return<Model, Message>>(message, {
    UpdatedQuery: ({ value }) => beginSearch(model, value),

    SelectedHit: ({ id }) => ({
      model: modifyFields(model, {
        maybeSelectedId: () => Option.some(id),
        item: () => ItemState.Loading(),
      }),
      commands: [FetchItem({ id })],
    }),

    ClickedRetryItem: () =>
      Option.match(model.maybeSelectedId, {
        onNone: () => ({ model }),
        onSome: id => ({
          model: modifyFields(model, { item: () => ItemState.Loading() }),
          commands: [FetchItem({ id })],
        }),
      }),

    SucceededSearch: ({ query, hits }) => {
      if (query !== model.query) {
        return { model }
      }
      return {
        model: modifyFields(model, {
          results: () => Results.Found(),
          hits: () => hits,
        }),
      }
    },

    FailedSearch: ({ query, message }) => {
      if (query !== model.query) {
        return { model }
      }
      return {
        model: modifyFields(model, {
          results: () => Results.Failed({ message }),
          hits: () => [],
        }),
      }
    },

    SucceededFetchItem: ({ id, item }) => {
      if (!isSelected(model, id)) {
        return { model }
      }
      return {
        model: modifyFields(model, {
          item: () =>
            item === null
              ? ItemState.NotFound({ id })
              : ItemState.Loaded({ name: item.name, blurb: item.blurb }),
        }),
      }
    },

    FailedFetchItem: ({ id, message }) => {
      if (!isSelected(model, id)) {
        return { model }
      }
      return {
        model: modifyFields(model, { item: () => ItemState.Failed({ message }) }),
      }
    },
  })

const isSelected = (model: Model, id: number): boolean =>
  Option.match(model.maybeSelectedId, {
    onNone: () => false,
    onSome: selectedId => selectedId === id,
  })

// VIEW

const testId = (h: HtmlBuilder<Message>, id: string) =>
  h.DataAttribute('testid', id)

const viewResultsStatus = (model: Model, h: HtmlBuilder<Message>): Html =>
  Results.match<Html>(model.results, {
    Idle: () => h.empty,
    TooShort: () => h.p([], [`too short: ${model.query}`]),
    Searching: () => h.p([], ['searching…']),
    Found: () =>
      h.p([], [`${model.hits.length} results for ${model.query}`]),
    Failed: ({ message }) => h.p([], [`search failed: ${message}`]),
  })

const viewHit = (model: Model, hit: Hit, h: HtmlBuilder<Message>): Html => {
  const isHitSelected = Option.match(model.maybeSelectedId, {
    onNone: () => false,
    onSome: selectedId => selectedId === hit.id,
  })
  return h.keyed('li')(
    String(hit.id),
    [testId(h, 'hit'), h.OnClick(Message.SelectedHit({ id: hit.id }))],
    [`${isHitSelected ? '> ' : ''}${hit.name}`],
  )
}

const viewItem = (model: Model, h: HtmlBuilder<Message>): Html =>
  ItemState.match<Html>(model.item, {
    Idle: () => h.p([], ['pick a result']),
    Loading: () => h.p([], ['loading…']),
    Loaded: ({ name, blurb }) =>
      h.div([], [h.h2([], [name]), h.p([], [blurb])]),
    NotFound: ({ id }) => h.p([], [`item ${id} not found`]),
    Failed: ({ message }) =>
      h.div(
        [],
        [
          h.p([], [`failed: ${message}`]),
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

const viewPage = (model: Model, h: HtmlBuilder<Message>): Html =>
  h.div(
    [h.Class('grid gap-6 md:grid-cols-2')],
    [
      h.div(
        [h.Class('space-y-3')],
        [
          h.input([
            testId(h, 'query'),
            h.Type('text'),
            h.Value(model.query),
            h.OnInput(value => Message.UpdatedQuery({ value })),
          ]),
          h.div(
            [testId(h, 'results')],
            [
              viewResultsStatus(model, h),
              h.ul(
                [],
                model.hits.map(hit => viewHit(model, hit, h)),
              ),
            ],
          ),
        ],
      ),
      h.div([testId(h, 'item')], [viewItem(model, h)]),
    ],
  )

export const view = Submodel.defineView<Model, Message>(viewPage)
