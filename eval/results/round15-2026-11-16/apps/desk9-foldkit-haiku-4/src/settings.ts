import { Effect, Option, Schema } from 'effect'
import { Command, Submodel, type Update } from 'foldkit'
import { Html, HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { defineTaggedUnion } from 'foldkit/schema'
import { modifyFields } from 'foldkit/struct'

import { loadSettings, saveSettings } from './api'
import { callApi } from './shared'

// MODEL

const Theme = Schema.Literals(['light', 'dark'])
type Theme = typeof Theme.Type

const Density = Schema.Literals(['comfortable', 'compact'])
type Density = typeof Density.Type

export const Settings = Schema.Struct({
  name: Schema.String,
  theme: Theme,
  density: Density,
})
export type Settings = typeof Settings.Type

const MAX_NAME_LENGTH = 20

const LoadedSettings = Schema.Struct({
  saved: Settings,
  draft: Settings,
  maybeSaving: Schema.Option(Settings),
  maybeSaveError: Schema.Option(Schema.String),
})
type LoadedSettings = typeof LoadedSettings.Type

const LoadState = defineTaggedUnion({
  Loading: {},
  Failed: { message: Schema.String },
  Loaded: LoadedSettings.fields,
})
type LoadState = typeof LoadState.Type

export const Model = Schema.Struct({
  load: LoadState,
})
export type Model = typeof Model.Type

// MESSAGE

export const Message = defineMessageUnion({
  UpdatedName: { value: Schema.String },
  ClickedTheme: { theme: Theme },
  ClickedDensityToggle: {},
  ClickedSave: {},
  ClickedRetryLoad: {},
  SucceededLoadSettings: { settings: Settings },
  FailedLoadSettings: { message: Schema.String },
  SucceededSaveSettings: { requested: Settings, saved: Settings },
  FailedSaveSettings: { requested: Settings, message: Schema.String },
})
export type Message = typeof Message.Type

// COMMAND

const LoadSettings = Command.define('LoadSettings', {
  messages: [Message.SucceededLoadSettings, Message.FailedLoadSettings],
  execute: callApi(() => loadSettings()).pipe(
    Effect.map(settings => Message.SucceededLoadSettings({ settings })),
    Effect.catch(message =>
      Effect.succeed(Message.FailedLoadSettings({ message })),
    ),
  ),
})

const SaveSettings = Command.define('SaveSettings', {
  args: { settings: Settings },
  messages: [Message.SucceededSaveSettings, Message.FailedSaveSettings],
  execute: ({ settings }) =>
    callApi(() => saveSettings(settings)).pipe(
      Effect.map(saved =>
        Message.SucceededSaveSettings({ requested: settings, saved }),
      ),
      Effect.catch(message =>
        Effect.succeed(
          Message.FailedSaveSettings({ requested: settings, message }),
        ),
      ),
    ),
})

// HELPERS

const nameProblem = (name: string): Option.Option<string> => {
  if (name.trim().length === 0) {
    return Option.some('Display name is required')
  }
  if (name.length > MAX_NAME_LENGTH) {
    return Option.some(
      `Display name must be at most ${MAX_NAME_LENGTH} characters, not ${name.length}`,
    )
  }
  return Option.none()
}

const sameSettings = (left: Settings, right: Settings): boolean =>
  left.name === right.name &&
  left.theme === right.theme &&
  left.density === right.density

const toggledDensity = (density: Density): Density =>
  density === 'compact' ? 'comfortable' : 'compact'

const changeLoaded = (
  model: Model,
  change: (loaded: LoadedSettings) => LoadedSettings,
): Model =>
  modifyFields(model, {
    load: load =>
      LoadState.match<LoadState>(load, {
        Loading: () => load,
        Failed: () => load,
        Loaded: loaded => LoadState.Loaded(change(loaded)),
      }),
  })

const withoutSaving = (
  maybeSaving: Option.Option<Settings>,
  requested: Settings,
): Option.Option<Settings> =>
  Option.filter(maybeSaving, pending => !sameSettings(pending, requested))

// INIT

export const init = (): Update.Return<Model, Message> => ({
  model: { load: LoadState.Loading() },
  commands: [LoadSettings()],
})

// UPDATE

export const update = (model: Model, message: Message): Update.Return<Model, Message> =>
  Message.match<Update.Return<Model, Message>>(message, {
    UpdatedName: ({ value }) => ({
      model: changeLoaded(model, loaded =>
        modifyFields(loaded, {
          draft: draft => modifyFields(draft, { name: () => value }),
        }),
      ),
    }),

    ClickedTheme: ({ theme }) => ({
      model: changeLoaded(model, loaded =>
        modifyFields(loaded, {
          draft: draft => modifyFields(draft, { theme: () => theme }),
        }),
      ),
    }),

    ClickedDensityToggle: () => ({
      model: changeLoaded(model, loaded =>
        modifyFields(loaded, {
          draft: draft =>
            modifyFields(draft, { density: toggledDensity }),
        }),
      ),
    }),

    ClickedSave: () =>
      LoadState.match<Update.Return<Model, Message>>(model.load, {
        Loading: () => ({ model }),
        Failed: () => ({ model }),
        Loaded: ({ draft }) => {
          if (Option.isSome(nameProblem(draft.name))) {
            return { model }
          }
          return {
            model: changeLoaded(model, loaded =>
              modifyFields(loaded, {
                maybeSaving: () => Option.some(draft),
                maybeSaveError: () => Option.none(),
              }),
            ),
            commands: [SaveSettings({ settings: draft })],
          }
        },
      }),

    ClickedRetryLoad: () => ({
      model: modifyFields(model, { load: () => LoadState.Loading() }),
      commands: [LoadSettings()],
    }),

    SucceededLoadSettings: ({ settings }) => ({
      model: modifyFields(model, {
        load: () =>
          LoadState.Loaded({
            saved: settings,
            draft: settings,
            maybeSaving: Option.none(),
            maybeSaveError: Option.none(),
          }),
      }),
    }),

    FailedLoadSettings: ({ message }) => ({
      model: modifyFields(model, {
        load: () => LoadState.Failed({ message }),
      }),
    }),

    SucceededSaveSettings: ({ requested, saved }) => ({
      model: changeLoaded(model, loaded =>
        modifyFields(loaded, {
          saved: () => saved,
          maybeSaving: maybeSaving => withoutSaving(maybeSaving, requested),
        }),
      ),
    }),

    FailedSaveSettings: ({ requested, message }) => ({
      model: changeLoaded(model, loaded =>
        modifyFields(loaded, {
          maybeSaving: maybeSaving => withoutSaving(maybeSaving, requested),
          maybeSaveError: () => Option.some(`Save failed: ${message}`),
        }),
      ),
    }),
  })

// VIEW

const testId = (h: HtmlBuilder<Message>, id: string) =>
  h.DataAttribute('testid', id)

const viewSavedLine = (loaded: LoadedSettings, h: HtmlBuilder<Message>): Html => {
  const savedText = (settings: Settings) =>
    `${settings.name} · ${settings.theme} · ${settings.density}`
  const text = Option.match(loaded.maybeSaving, {
    onNone: () => `Saved: ${savedText(loaded.saved)}`,
    onSome: pending => `Saved: ${savedText(pending)} (saving…)`,
  })
  return h.p([testId(h, 'saved')], [text])
}

const viewNameField = (draft: Settings, h: HtmlBuilder<Message>): Html =>
  h.div(
    [h.Class('space-y-1')],
    [
      h.label([h.For('name')], ['Display name']),
      h.input([
        h.Id('name'),
        testId(h, 'name'),
        h.Type('text'),
        h.Value(draft.name),
        h.OnInput(value => Message.UpdatedName({ value })),
      ]),
      h.span([testId(h, 'name-count')], [`${draft.name.length}/${MAX_NAME_LENGTH}`]),
      Option.match(nameProblem(draft.name), {
        onNone: () => h.empty,
        onSome: problem => h.p([testId(h, 'name-error')], [problem]),
      }),
    ],
  )

const viewLoaded = (loaded: LoadedSettings, h: HtmlBuilder<Message>): Html => {
  const { draft } = loaded
  return h.div(
    [h.Class('space-y-4')],
    [
      viewSavedLine(loaded, h),
      Option.match(loaded.maybeSaveError, {
        onNone: () => h.empty,
        onSome: message => h.p([testId(h, 'save-error')], [message]),
      }),
      viewNameField(draft, h),
      h.div(
        [h.Class('flex gap-2')],
        [
          h.button(
            [
              testId(h, 'theme-light'),
              h.Type('button'),
              h.OnClick(Message.ClickedTheme({ theme: 'light' })),
            ],
            ['Light'],
          ),
          h.button(
            [
              testId(h, 'theme-dark'),
              h.Type('button'),
              h.OnClick(Message.ClickedTheme({ theme: 'dark' })),
            ],
            ['Dark'],
          ),
          h.button(
            [
              testId(h, 'density-toggle'),
              h.Type('button'),
              h.OnClick(Message.ClickedDensityToggle()),
            ],
            [`Density: ${draft.density}`],
          ),
        ],
      ),
      h.p(
        [testId(h, 'preview')],
        [`Preview: ${draft.theme} / ${draft.density}`],
      ),
      h.button(
        [testId(h, 'save'), h.Type('button'), h.OnClick(Message.ClickedSave())],
        ['Save'],
      ),
    ],
  )
}

const viewPage = (model: Model, h: HtmlBuilder<Message>): Html =>
  h.div(
    [h.Class('space-y-4 max-w-md')],
    [
      LoadState.match<Html>(model.load, {
        Loading: () => h.p([testId(h, 'load')], ['Loading settings…']),
        Failed: ({ message }) =>
          h.div(
            [testId(h, 'load')],
            [
              h.p([], [`Could not load settings: ${message}`]),
              h.button(
                [
                  testId(h, 'retry-load'),
                  h.Type('button'),
                  h.OnClick(Message.ClickedRetryLoad()),
                ],
                ['Retry'],
              ),
            ],
          ),
        Loaded: loaded => viewLoaded(loaded, h),
      }),
    ],
  )

export const view = Submodel.defineView<Model, Message>(viewPage)
