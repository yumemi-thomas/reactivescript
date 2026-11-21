import { Effect, Option, Schema, String } from 'effect'
import { Command, Submodel, type Update } from 'foldkit'
import { Html, HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { defineTaggedUnion } from 'foldkit/schema'
import { modifyFields } from 'foldkit/struct'

import * as Api from './domain'
import { Density, Settings, Theme } from './domain'

// MODEL

export const SaveState = defineTaggedUnion({
  Idle: {},
  Saving: { requestId: Schema.Number, settings: Settings },
  Failed: { error: Schema.String },
})
export type SaveState = typeof SaveState.Type

export const Form = Schema.Struct({
  saved: Settings,
  savedRequestId: Schema.Number,
  draft: Settings,
  save: SaveState,
})
export type Form = typeof Form.Type

export const LoadState = defineTaggedUnion({
  Loading: { requestId: Schema.Number },
  Failed: { error: Schema.String },
  Ready: { form: Form },
})
export type LoadState = typeof LoadState.Type

export const Model = Schema.Struct({
  nextId: Schema.Number,
  load: LoadState,
})
export type Model = typeof Model.Type

// MESSAGE

export const Message = defineMessageUnion({
  ClickedRetryLoad: {},
  UpdatedName: { value: Schema.String },
  ClickedTheme: { theme: Theme },
  ClickedToggleDensity: {},
  ClickedSave: {},
  SucceededLoadSettings: { requestId: Schema.Number, settings: Settings },
  FailedLoadSettings: { requestId: Schema.Number, error: Schema.String },
  SucceededSaveSettings: { requestId: Schema.Number, settings: Settings },
  FailedSaveSettings: { requestId: Schema.Number, error: Schema.String },
})
export type Message = typeof Message.Type

// COMMAND

export const LoadSettings = Command.define('LoadSettings', {
  args: { requestId: Schema.Number },
  messages: [Message.SucceededLoadSettings, Message.FailedLoadSettings],
  execute: ({ requestId }) =>
    Api.loadSettings().pipe(
      Effect.map(settings =>
        Message.SucceededLoadSettings({ requestId, settings }),
      ),
      Effect.catch(error =>
        Effect.succeed(Message.FailedLoadSettings({ requestId, error })),
      ),
    ),
})

export const SaveSettings = Command.define('SaveSettings', {
  args: { requestId: Schema.Number, settings: Settings },
  messages: [Message.SucceededSaveSettings, Message.FailedSaveSettings],
  execute: ({ requestId, settings }) =>
    Api.saveSettings(settings).pipe(
      Effect.map(saved =>
        Message.SucceededSaveSettings({ requestId, settings: saved }),
      ),
      Effect.catch(error =>
        Effect.succeed(Message.FailedSaveSettings({ requestId, error })),
      ),
    ),
})

// INIT

const NAME_MAX_LENGTH = 20

export const init = (): Update.Return<Model, Message> => {
  const requestId = 0
  return {
    model: {
      nextId: requestId + 1,
      load: LoadState.Loading({ requestId }),
    },
    commands: [LoadSettings({ requestId })],
  }
}

// VALIDATION

export const nameError = (name: string): Option.Option<string> => {
  if (String.isEmpty(String.trim(name))) {
    return Option.some('Display name is required')
  }
  if (name.length > NAME_MAX_LENGTH) {
    return Option.some(
      `Display name must be at most ${NAME_MAX_LENGTH} characters, not ${name.length}`,
    )
  }
  return Option.none()
}

// UPDATE

type UpdateReturn = Update.Return<Model, Message>

const modifyForm = (model: Model, f: (form: Form) => Form): Model => {
  const load = model.load
  return load._tag === 'Ready'
    ? modifyFields(model, {
        load: () => LoadState.Ready({ form: f(load.form) }),
      })
    : model
}

const modifyDraft = (
  model: Model,
  f: (draft: Settings) => Settings,
): UpdateReturn => ({
  model: modifyForm(model, form => modifyFields(form, { draft: f })),
})

const toggledDensity = (density: Density): Density =>
  density === 'compact' ? 'comfortable' : 'compact'

export const update = (model: Model, message: Message) =>
  Message.match<UpdateReturn>(message, {
    ClickedRetryLoad: () => {
      if (model.load._tag !== 'Failed') {
        return { model }
      }
      const requestId = model.nextId
      return {
        model: modifyFields(model, {
          nextId: () => requestId + 1,
          load: () => LoadState.Loading({ requestId }),
        }),
        commands: [LoadSettings({ requestId })],
      }
    },

    UpdatedName: ({ value }) =>
      modifyDraft(model, draft => modifyFields(draft, { name: () => value })),

    ClickedTheme: ({ theme }) =>
      modifyDraft(model, draft => modifyFields(draft, { theme: () => theme })),

    ClickedToggleDensity: () =>
      modifyDraft(model, draft =>
        modifyFields(draft, { density: toggledDensity }),
      ),

    ClickedSave: () => {
      if (model.load._tag !== 'Ready') {
        return { model }
      }
      const { draft } = model.load.form
      if (Option.isSome(nameError(draft.name))) {
        return { model }
      }
      const requestId = model.nextId
      return {
        model: modifyForm(
          modifyFields(model, { nextId: () => requestId + 1 }),
          form =>
            modifyFields(form, {
              save: () => SaveState.Saving({ requestId, settings: draft }),
            }),
        ),
        commands: [SaveSettings({ requestId, settings: draft })],
      }
    },

    SucceededLoadSettings: ({ requestId, settings }) =>
      model.load._tag === 'Loading' && model.load.requestId === requestId
        ? {
            model: modifyFields(model, {
              load: () =>
                LoadState.Ready({
                  form: {
                    saved: settings,
                    savedRequestId: requestId,
                    draft: settings,
                    save: SaveState.Idle(),
                  },
                }),
            }),
          }
        : { model },

    FailedLoadSettings: ({ requestId, error }) =>
      model.load._tag === 'Loading' && model.load.requestId === requestId
        ? {
            model: modifyFields(model, {
              load: () => LoadState.Failed({ error }),
            }),
          }
        : { model },

    SucceededSaveSettings: ({ requestId, settings }) => ({
      model: modifyForm(model, form => {
        const isLatest =
          form.save._tag === 'Saving' && form.save.requestId === requestId
        const isNewer = requestId > form.savedRequestId
        return modifyFields(form, {
          saved: saved => (isNewer ? settings : saved),
          savedRequestId: savedRequestId =>
            isNewer ? requestId : savedRequestId,
          save: save => (isLatest ? SaveState.Idle() : save),
        })
      }),
    }),

    FailedSaveSettings: ({ requestId, error }) => ({
      model: modifyForm(model, form =>
        form.save._tag === 'Saving' && form.save.requestId === requestId
          ? modifyFields(form, { save: () => SaveState.Failed({ error }) })
          : form,
      ),
    }),
  })

// VIEW

const settingsLine = (settings: Settings): string =>
  `Saved: ${settings.name} · ${settings.theme} · ${settings.density}`

const savedLine = (form: Form): string =>
  SaveState.match(form.save, {
    Idle: () => settingsLine(form.saved),
    Saving: ({ settings }) => `${settingsLine(settings)} (saving…)`,
    Failed: () => settingsLine(form.saved),
  })

const themeButton = (
  form: Form,
  theme: Theme,
  h: HtmlBuilder<Message>,
): Html =>
  h.button(
    [
      h.DataAttribute('testid', `theme-${theme}`),
      h.Type('button'),
      h.AriaPressed(form.draft.theme === theme ? 'true' : 'false'),
      h.OnClick(Message.ClickedTheme({ theme })),
    ],
    [theme],
  )

const formView = (form: Form, h: HtmlBuilder<Message>): Html => {
  const { draft } = form
  const maybeNameError = nameError(draft.name)
  return h.div(
    [h.Class('settings-form')],
    [
      h.p([h.DataAttribute('testid', 'saved'), h.AriaLive('polite')], [
        savedLine(form),
      ]),
      h.label(
        [h.Class('field')],
        [
          'Display name ',
          h.input([
            h.DataAttribute('testid', 'name'),
            h.Type('text'),
            h.Value(draft.name),
            h.AriaInvalid(Option.isSome(maybeNameError)),
            h.OnInput(value => Message.UpdatedName({ value })),
          ]),
        ],
      ),
      h.span(
        [h.DataAttribute('testid', 'name-count'), h.Class('muted')],
        [`${draft.name.length}/${NAME_MAX_LENGTH}`],
      ),
      Option.match(maybeNameError, {
        onNone: () => h.empty,
        onSome: error =>
          h.p(
            [
              h.DataAttribute('testid', 'name-error'),
              h.Class('error'),
              h.Role('alert'),
            ],
            [error],
          ),
      }),
      h.div(
        [h.Class('filters'), h.Role('group'), h.AriaLabel('Theme')],
        [themeButton(form, 'light', h), themeButton(form, 'dark', h)],
      ),
      h.button(
        [
          h.DataAttribute('testid', 'density-toggle'),
          h.Type('button'),
          h.OnClick(Message.ClickedToggleDensity()),
        ],
        [`density: ${draft.density}`],
      ),
      h.p(
        [h.DataAttribute('testid', 'preview')],
        [`Preview: ${draft.theme} / ${draft.density}`],
      ),
      h.button(
        [
          h.DataAttribute('testid', 'save'),
          h.Type('button'),
          h.OnClick(Message.ClickedSave()),
        ],
        ['save'],
      ),
      SaveState.match(form.save, {
        Idle: () => h.empty,
        Saving: () => h.empty,
        Failed: ({ error }) =>
          h.p(
            [
              h.DataAttribute('testid', 'save-error'),
              h.Class('error'),
              h.Role('alert'),
            ],
            [`Save failed: ${error}`],
          ),
      }),
    ],
  )
}

export const view = Submodel.defineView<Model, Message>(
  (model, h): Html =>
    h.div(
      [h.Class('settings-page')],
      [
        LoadState.match(model.load, {
          Loading: () =>
            h.p([h.DataAttribute('testid', 'load'), h.Class('muted')], [
              'Loading settings…',
            ]),
          Failed: ({ error }) =>
            h.div(
              [h.DataAttribute('testid', 'load')],
              [
                h.p([h.Class('error')], [`Could not load settings: ${error}`]),
                h.button(
                  [
                    h.DataAttribute('testid', 'retry-load'),
                    h.Type('button'),
                    h.OnClick(Message.ClickedRetryLoad()),
                  ],
                  ['retry'],
                ),
              ],
            ),
          Ready: ({ form }) => formView(form, h),
        }),
      ],
    ),
)
