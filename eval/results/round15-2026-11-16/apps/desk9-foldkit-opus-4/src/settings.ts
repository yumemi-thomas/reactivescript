import { Array, Effect, Option, Schema, String } from 'effect'
import { Command, Submodel, type Update } from 'foldkit'
import { type Html, type HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { defineTaggedUnion } from 'foldkit/schema'
import { modifyFields } from 'foldkit/struct'

import * as Api from './api.js'
import { errorMessage, request } from './backend'
import { type Density, Settings, type Theme } from './domain'
import { TestId } from './testId'

// MODEL

const MAX_NAME_LENGTH = 20

export const PendingSave = Schema.Struct({
  saveId: Schema.Number,
  settings: Settings,
})
export type PendingSave = typeof PendingSave.Type

export const Editor = Schema.Struct({
  saved: Settings,
  lastAppliedSaveId: Schema.Number,
  draft: Settings,
  pendingSaves: Schema.Array(PendingSave),
  maybeSaveError: Schema.Option(Schema.String),
})
export type Editor = typeof Editor.Type

export const LoadState = defineTaggedUnion({
  Loading: { requestId: Schema.Number },
  Failed: { error: Schema.String },
  Loaded: { editor: Editor },
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
  ClickedTheme: { theme: Schema.Literals(['light', 'dark']) },
  ClickedDensityToggle: {},
  SubmittedSettings: {},
  SucceededLoadSettings: { requestId: Schema.Number, settings: Settings },
  FailedLoadSettings: { requestId: Schema.Number, error: Schema.String },
  SucceededSaveSettings: { saveId: Schema.Number, settings: Settings },
  FailedSaveSettings: { saveId: Schema.Number, error: Schema.String },
})
export type Message = typeof Message.Type

type UpdateReturn = Update.Return<Model, Message>

// COMMAND

const LoadSettings = Command.define('LoadSettings', {
  args: { requestId: Schema.Number },
  messages: [Message.SucceededLoadSettings, Message.FailedLoadSettings],
  execute: ({ requestId }) =>
    request(Settings, () => Api.loadSettings()).pipe(
      Effect.map(settings =>
        Message.SucceededLoadSettings({ requestId, settings }),
      ),
      Effect.catch(error =>
        Effect.succeed(
          Message.FailedLoadSettings({ requestId, error: errorMessage(error) }),
        ),
      ),
    ),
})

const SaveSettings = Command.define('SaveSettings', {
  args: { saveId: Schema.Number, settings: Settings },
  messages: [Message.SucceededSaveSettings, Message.FailedSaveSettings],
  execute: ({ saveId, settings }) =>
    request(Settings, () =>
      Api.saveSettings({
        name: settings.name,
        theme: settings.theme,
        density: settings.density,
      }),
    ).pipe(
      Effect.map(saved =>
        Message.SucceededSaveSettings({ saveId, settings: saved }),
      ),
      Effect.catch(error =>
        Effect.succeed(
          Message.FailedSaveSettings({ saveId, error: errorMessage(error) }),
        ),
      ),
    ),
})

// INIT

export const init = (): UpdateReturn => ({
  model: { nextId: 1, load: LoadState.Loading({ requestId: 0 }) },
  commands: [LoadSettings({ requestId: 0 })],
})

// VALIDATION

const nameLength = (name: string): number => [...name].length

const nameError = (name: string): Option.Option<string> => {
  if (String.isEmpty(String.trim(name))) {
    return Option.some('Display name is required')
  }
  const length = nameLength(name)
  return length > MAX_NAME_LENGTH
    ? Option.some(
        `Display name must be at most ${MAX_NAME_LENGTH} characters, not ${length}`,
      )
    : Option.none()
}

// UPDATE

const modifyEditor =
  (f: (editor: Editor) => Editor) =>
  (model: Model): Model =>
    modifyFields(model, {
      load: load =>
        LoadState.match(load, {
          Loading: () => load,
          Failed: () => load,
          Loaded: ({ editor }) => LoadState.Loaded({ editor: f(editor) }),
        }),
    })

const modifyDraft = (
  model: Model,
  f: (draft: Settings) => Settings,
): UpdateReturn => ({
  model: modifyEditor(editor => modifyFields(editor, { draft: f }))(model),
})

const toggledDensity = (density: Density): Density =>
  density === 'compact' ? 'comfortable' : 'compact'

export const update = (model: Model, message: Message) =>
  Message.match<UpdateReturn>(message, {
    ClickedRetryLoad: () =>
      LoadState.match(model.load, {
        Loading: () => ({ model }),
        Loaded: () => ({ model }),
        Failed: () => ({
          model: modifyFields(model, {
            nextId: id => id + 1,
            load: () => LoadState.Loading({ requestId: model.nextId }),
          }),
          commands: [LoadSettings({ requestId: model.nextId })],
        }),
      }),

    UpdatedName: ({ value }) =>
      modifyDraft(model, draft => modifyFields(draft, { name: () => value })),

    ClickedTheme: ({ theme }) =>
      modifyDraft(model, draft => modifyFields(draft, { theme: () => theme })),

    ClickedDensityToggle: () =>
      modifyDraft(model, draft =>
        modifyFields(draft, { density: toggledDensity }),
      ),

    SubmittedSettings: () =>
      LoadState.match(model.load, {
        Loading: () => ({ model }),
        Failed: () => ({ model }),
        Loaded: ({ editor }) => {
          if (Option.isSome(nameError(editor.draft.name))) {
            return { model }
          }
          const saveId = model.nextId
          const settings = editor.draft
          return {
            model: modifyFields(model, {
              nextId: id => id + 1,
              load: () =>
                LoadState.Loaded({
                  editor: modifyFields(editor, {
                    pendingSaves: Array.append({ saveId, settings }),
                    maybeSaveError: () => Option.none(),
                  }),
                }),
            }),
            commands: [SaveSettings({ saveId, settings })],
          }
        },
      }),

    SucceededLoadSettings: ({ requestId, settings }) =>
      model.load._tag === 'Loading' && model.load.requestId === requestId
        ? {
            model: modifyFields(model, {
              load: () =>
                LoadState.Loaded({
                  editor: {
                    saved: settings,
                    lastAppliedSaveId: 0,
                    draft: settings,
                    pendingSaves: [],
                    maybeSaveError: Option.none(),
                  },
                }),
            }),
          }
        : { model },

    FailedLoadSettings: ({ requestId, error }) =>
      model.load._tag === 'Loading' && model.load.requestId === requestId
        ? { model: modifyFields(model, { load: () => LoadState.Failed({ error }) }) }
        : { model },

    SucceededSaveSettings: ({ saveId, settings }) => ({
      model: modifyEditor(editor => {
        const isNewest = saveId > editor.lastAppliedSaveId
        return modifyFields(editor, {
          pendingSaves: Array.filter(pending => pending.saveId !== saveId),
          saved: saved => (isNewest ? settings : saved),
          lastAppliedSaveId: id => (isNewest ? saveId : id),
        })
      })(model),
    }),

    FailedSaveSettings: ({ saveId, error }) => ({
      model: modifyEditor(editor =>
        modifyFields(editor, {
          pendingSaves: Array.filter(pending => pending.saveId !== saveId),
          maybeSaveError: () => Option.some(error),
        }),
      )(model),
    }),
  })

// VIEW

const settingsLine = (settings: Settings): string =>
  `${settings.name} · ${settings.theme} · ${settings.density}`

const savedLine = (editor: Editor): string =>
  Option.match(Array.last(editor.pendingSaves), {
    onNone: () => `Saved: ${settingsLine(editor.saved)}`,
    onSome: pending => `Saved: ${settingsLine(pending.settings)} (saving…)`,
  })

const themeButton = (
  theme: Theme,
  draft: Settings,
  h: HtmlBuilder<Message>,
): Html =>
  h.button(
    [
      TestId(`theme-${theme}`),
      h.Type('button'),
      h.AriaPressed(draft.theme === theme ? 'true' : 'false'),
      h.OnClick(Message.ClickedTheme({ theme })),
    ],
    [theme],
  )

const editorView = (editor: Editor, h: HtmlBuilder<Message>): Html => {
  const { draft } = editor
  const maybeNameError = nameError(draft.name)
  return h.div(
    [],
    [
      h.p([TestId('saved'), h.AriaLive('polite')], [savedLine(editor)]),
      h.form(
        [h.Class('settings-form'), h.OnSubmit(Message.SubmittedSettings())],
        [
          h.label([h.For('name')], ['Display name']),
          h.input([
            h.Id('name'),
            TestId('name'),
            h.Type('text'),
            h.Autocomplete('off'),
            h.Value(draft.name),
            h.AriaInvalid(Option.isSome(maybeNameError)),
            h.OnInput(value => Message.UpdatedName({ value })),
          ]),
          h.span(
            [TestId('name-count')],
            [`${nameLength(draft.name)}/${MAX_NAME_LENGTH}`],
          ),
          Option.match(maybeNameError, {
            onNone: () => h.empty,
            onSome: error =>
              h.p(
                [TestId('name-error'), h.Class('error'), h.Role('alert')],
                [error],
              ),
          }),
          h.div(
            [h.Role('group'), h.AriaLabel('Theme')],
            [themeButton('light', draft, h), themeButton('dark', draft, h)],
          ),
          h.button(
            [
              TestId('density-toggle'),
              h.Type('button'),
              h.OnClick(Message.ClickedDensityToggle()),
            ],
            [`density: ${draft.density}`],
          ),
          h.p([TestId('preview')], [`Preview: ${draft.theme} / ${draft.density}`]),
          h.button([TestId('save'), h.Type('submit')], ['save']),
          Option.match(editor.maybeSaveError, {
            onNone: () => h.empty,
            onSome: error =>
              h.p(
                [TestId('save-error'), h.Class('error'), h.Role('alert')],
                [`Save failed: ${error}`],
              ),
          }),
        ],
      ),
    ],
  )
}

export const view = Submodel.defineView<Model, Message>((model, h) =>
  h.div(
    [h.Class('settings-page')],
    [
      LoadState.match(model.load, {
        Loading: () =>
          h.p([TestId('load'), h.AriaLive('polite')], ['Loading settings…']),
        Failed: ({ error }) =>
          h.div(
            [TestId('load'), h.Role('alert')],
            [
              `Could not load settings: ${error}`,
              h.button(
                [
                  TestId('retry-load'),
                  h.Type('button'),
                  h.OnClick(Message.ClickedRetryLoad()),
                ],
                ['retry'],
              ),
            ],
          ),
        Loaded: ({ editor }) => editorView(editor, h),
      }),
    ],
  ),
)
