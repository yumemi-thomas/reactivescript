import { Effect, Option, Schema, String } from 'effect'
import { Command, Submodel, type Update } from 'foldkit'
import { type Html, type HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { defineTaggedUnion } from 'foldkit/schema'
import { modifyFields } from 'foldkit/struct'

import { type Density, Settings, Theme } from '../domain'
import * as Request from '../request'

// MODEL

const MAX_NAME_LENGTH = 20

export const SaveState = defineTaggedUnion({
  Idle: {},
  Saving: { requestId: Schema.Number, pending: Settings },
  Failed: { error: Schema.String },
})
export type SaveState = typeof SaveState.Type

export const Form = Schema.Struct({
  saved: Settings,
  draft: Settings,
  saveState: SaveState,
})
export type Form = typeof Form.Type

export const LoadState = defineTaggedUnion({
  Loading: {},
  Failed: { error: Schema.String },
  Loaded: { form: Form },
})
export type LoadState = typeof LoadState.Type

export const Model = Schema.Struct({
  loadState: LoadState,
  latestRequestId: Schema.Number,
})
export type Model = typeof Model.Type

// MESSAGE

export const Message = defineMessageUnion({
  SucceededLoadSettings: { requestId: Schema.Number, settings: Settings },
  FailedLoadSettings: { requestId: Schema.Number, error: Schema.String },
  ClickedRetryLoad: {},
  UpdatedName: { value: Schema.String },
  ClickedTheme: { theme: Theme },
  ClickedDensityToggle: {},
  SubmittedSettingsForm: {},
  SucceededSaveSettings: { requestId: Schema.Number, settings: Settings },
  FailedSaveSettings: { requestId: Schema.Number, error: Schema.String },
})
export type Message = typeof Message.Type

// COMMAND

export const LoadSettings = Command.define('LoadSettings', {
  args: { requestId: Schema.Number },
  messages: [Message.SucceededLoadSettings, Message.FailedLoadSettings],
  execute: ({ requestId }) =>
    Request.loadSettings().pipe(
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
    Request.saveSettings(settings).pipe(
      Effect.map(saved =>
        Message.SucceededSaveSettings({ requestId, settings: saved }),
      ),
      Effect.catch(error =>
        Effect.succeed(Message.FailedSaveSettings({ requestId, error })),
      ),
    ),
})

// VALIDATION

const nameLength = (name: string): number => [...name].length

const nameError = (name: string): Option.Option<string> => {
  if (String.isEmpty(String.trim(name))) {
    return Option.some('Display name is required')
  }
  const length = nameLength(name)
  if (length > MAX_NAME_LENGTH) {
    return Option.some(
      `Display name must be at most ${MAX_NAME_LENGTH} characters, not ${length}`,
    )
  }
  return Option.none()
}

// INIT

type UpdateReturn = Update.Return<Model, Message>

const startLoad = (model: Model): UpdateReturn => {
  const requestId = model.latestRequestId + 1
  return {
    model: modifyFields(model, {
      loadState: () => LoadState.Loading(),
      latestRequestId: () => requestId,
    }),
    commands: [LoadSettings({ requestId })],
  }
}

export const init = (): UpdateReturn =>
  startLoad({ loadState: LoadState.Loading(), latestRequestId: 0 })

// UPDATE

const toggledDensity = (density: Density): Density =>
  density === 'compact' ? 'comfortable' : 'compact'

const modifyForm = (
  model: Model,
  modify: (form: Form) => Form,
): UpdateReturn =>
  LoadState.match<UpdateReturn>(model.loadState, {
    Loading: () => ({ model }),
    Failed: () => ({ model }),
    Loaded: ({ form }) => ({
      model: modifyFields(model, {
        loadState: () => LoadState.Loaded({ form: modify(form) }),
      }),
    }),
  })

const modifyDraft = (
  model: Model,
  modify: (draft: Settings) => Settings,
): UpdateReturn =>
  modifyForm(model, form => modifyFields(form, { draft: modify }))

const isAwaitedSave = (saveState: SaveState, requestId: number): boolean =>
  saveState._tag === 'Saving' && saveState.requestId === requestId

export const update = (model: Model, message: Message) =>
  Message.match<UpdateReturn>(message, {
    SucceededLoadSettings: ({ requestId, settings }) => {
      if (requestId !== model.latestRequestId) {
        return { model }
      }
      return {
        model: modifyFields(model, {
          loadState: () =>
            LoadState.Loaded({
              form: {
                saved: settings,
                draft: settings,
                saveState: SaveState.Idle(),
              },
            }),
        }),
      }
    },

    FailedLoadSettings: ({ requestId, error }) => {
      if (requestId !== model.latestRequestId) {
        return { model }
      }
      return {
        model: modifyFields(model, {
          loadState: () => LoadState.Failed({ error }),
        }),
      }
    },

    ClickedRetryLoad: () =>
      model.loadState._tag === 'Failed' ? startLoad(model) : { model },

    UpdatedName: ({ value }) =>
      modifyDraft(model, draft => modifyFields(draft, { name: () => value })),

    ClickedTheme: ({ theme }) =>
      modifyDraft(model, draft => modifyFields(draft, { theme: () => theme })),

    ClickedDensityToggle: () =>
      modifyDraft(model, draft =>
        modifyFields(draft, { density: toggledDensity }),
      ),

    SubmittedSettingsForm: () =>
      LoadState.match<UpdateReturn>(model.loadState, {
        Loading: () => ({ model }),
        Failed: () => ({ model }),
        Loaded: ({ form }) => {
          if (Option.isSome(nameError(form.draft.name))) {
            return { model }
          }
          const requestId = model.latestRequestId + 1
          return {
            model: modifyFields(model, {
              latestRequestId: () => requestId,
              loadState: () =>
                LoadState.Loaded({
                  form: modifyFields(form, {
                    saveState: () =>
                      SaveState.Saving({ requestId, pending: form.draft }),
                  }),
                }),
            }),
            commands: [SaveSettings({ requestId, settings: form.draft })],
          }
        },
      }),

    SucceededSaveSettings: ({ requestId, settings }) =>
      modifyForm(model, form =>
        modifyFields(form, {
          saved: () => settings,
          saveState: saveState =>
            isAwaitedSave(saveState, requestId) ? SaveState.Idle() : saveState,
        }),
      ),

    FailedSaveSettings: ({ requestId, error }) =>
      modifyForm(model, form =>
        modifyFields(form, {
          saveState: saveState =>
            isAwaitedSave(saveState, requestId)
              ? SaveState.Failed({ error })
              : saveState,
        }),
      ),
  })

// VIEW

const settingsLine = (settings: Settings): string =>
  `${settings.name} · ${settings.theme} · ${settings.density}`

const savedLineView = (form: Form, h: HtmlBuilder<Message>): Html =>
  h.p(
    [h.DataAttribute('testid', 'saved'), h.AriaLive('polite')],
    [
      SaveState.match<string>(form.saveState, {
        Idle: () => `Saved: ${settingsLine(form.saved)}`,
        Failed: () => `Saved: ${settingsLine(form.saved)}`,
        Saving: ({ pending }) => `Saved: ${settingsLine(pending)} (saving…)`,
      }),
    ],
  )

const saveErrorView = (form: Form, h: HtmlBuilder<Message>): Html =>
  SaveState.match<Html>(form.saveState, {
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
  })

const themeButtonView = (
  theme: Theme,
  draft: Settings,
  h: HtmlBuilder<Message>,
): Html =>
  h.button(
    [
      h.Type('button'),
      h.DataAttribute('testid', `theme-${theme}`),
      h.AriaPressed(draft.theme === theme ? 'true' : 'false'),
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
      savedLineView(form, h),
      h.form(
        [h.OnSubmit(Message.SubmittedSettingsForm())],
        [
          h.div(
            [h.Class('field')],
            [
              h.label([h.For('settings-name')], ['Display name']),
              h.input([
                h.Id('settings-name'),
                h.Type('text'),
                h.DataAttribute('testid', 'name'),
                h.Value(draft.name),
                h.AriaInvalid(Option.isSome(maybeNameError)),
                h.OnInput(value => Message.UpdatedName({ value })),
              ]),
              h.span(
                [h.DataAttribute('testid', 'name-count')],
                [`${nameLength(draft.name)}/${MAX_NAME_LENGTH}`],
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
            ],
          ),
          h.div(
            [h.Class('field'), h.Role('group'), h.AriaLabel('Theme')],
            [
              themeButtonView('light', draft, h),
              themeButtonView('dark', draft, h),
            ],
          ),
          h.div(
            [h.Class('field')],
            [
              h.button(
                [
                  h.Type('button'),
                  h.DataAttribute('testid', 'density-toggle'),
                  h.OnClick(Message.ClickedDensityToggle()),
                ],
                [`density: ${draft.density}`],
              ),
            ],
          ),
          h.p(
            [h.DataAttribute('testid', 'preview')],
            [`Preview: ${draft.theme} / ${draft.density}`],
          ),
          h.button(
            [h.Type('submit'), h.DataAttribute('testid', 'save')],
            ['save'],
          ),
          saveErrorView(form, h),
        ],
      ),
    ],
  )
}

export const view = Submodel.defineView<Model, Message>((model, h) =>
  h.div(
    [h.Class('page settings-page')],
    [
      h.h1([], ['Settings']),
      LoadState.match<Html>(model.loadState, {
        Loading: () =>
          h.p(
            [h.DataAttribute('testid', 'load'), h.AriaLive('polite')],
            ['Loading settings…'],
          ),
        Failed: ({ error }) =>
          h.div(
            [h.DataAttribute('testid', 'load'), h.Role('alert')],
            [
              h.p([], [`Could not load settings: ${error}`]),
              h.button(
                [
                  h.Type('button'),
                  h.DataAttribute('testid', 'retry-load'),
                  h.OnClick(Message.ClickedRetryLoad()),
                ],
                ['retry'],
              ),
            ],
          ),
        Loaded: ({ form }) => formView(form, h),
      }),
    ],
  ),
)
