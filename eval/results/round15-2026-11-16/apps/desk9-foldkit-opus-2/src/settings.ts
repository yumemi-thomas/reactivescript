import { Array, Effect, Option, Schema } from 'effect'
import { Command, Submodel, type Update } from 'foldkit'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { defineTaggedUnion } from 'foldkit/schema'
import { modifyFields } from 'foldkit/struct'

import * as Api from './api.js'
import { Density, Settings, Theme, callApi } from './domain'

// MODEL

const MAX_NAME_LENGTH = 20

export const PendingSave = Schema.Struct({
  operationId: Schema.Number,
  settings: Settings,
})
export type PendingSave = typeof PendingSave.Type

export const Editor = Schema.Struct({
  saved: Settings,
  savedVersion: Schema.Number,
  draft: Settings,
  pendingSaves: Schema.Array(PendingSave),
  maybeSaveError: Schema.Option(Schema.String),
})
export type Editor = typeof Editor.Type

export const LoadState = defineTaggedUnion({
  Loading: { requestId: Schema.Number },
  LoadFailed: { error: Schema.String },
  Loaded: { editor: Editor },
})
export type LoadState = typeof LoadState.Type

export const Model = Schema.Struct({
  load: LoadState,
  nextId: Schema.Number,
})
export type Model = typeof Model.Type

// MESSAGE

export const Message = defineMessageUnion({
  ClickedRetryLoad: {},
  UpdatedName: { value: Schema.String },
  ClickedTheme: { theme: Theme },
  ClickedDensityToggle: {},
  ClickedSave: {},
  SucceededLoadSettings: { requestId: Schema.Number, settings: Settings },
  FailedLoadSettings: { requestId: Schema.Number, error: Schema.String },
  SucceededSaveSettings: { operationId: Schema.Number, settings: Settings },
  FailedSaveSettings: { operationId: Schema.Number, error: Schema.String },
})
export type Message = typeof Message.Type

// COMMAND

const toSettings = (settings: Settings): Settings => ({
  name: settings.name,
  theme: settings.theme,
  density: settings.density,
})

const LoadSettings = Command.define('LoadSettings', {
  args: { requestId: Schema.Number },
  messages: [Message.SucceededLoadSettings, Message.FailedLoadSettings],
  execute: ({ requestId }) =>
    callApi(() => Api.loadSettings()).pipe(
      Effect.map(settings =>
        Message.SucceededLoadSettings({
          requestId,
          settings: toSettings(settings),
        }),
      ),
      Effect.catch(error =>
        Effect.succeed(Message.FailedLoadSettings({ requestId, error })),
      ),
    ),
})

const SaveSettings = Command.define('SaveSettings', {
  args: { operationId: Schema.Number, settings: Settings },
  messages: [Message.SucceededSaveSettings, Message.FailedSaveSettings],
  execute: ({ operationId, settings }) =>
    callApi(() => Api.saveSettings(toSettings(settings))).pipe(
      Effect.map(saved =>
        Message.SucceededSaveSettings({
          operationId,
          settings: toSettings(saved),
        }),
      ),
      Effect.catch(error =>
        Effect.succeed(Message.FailedSaveSettings({ operationId, error })),
      ),
    ),
})

// INIT

type UpdateReturn = Update.Return<Model, Message>

export const init = (): UpdateReturn => ({
  model: { load: LoadState.Loading({ requestId: 0 }), nextId: 1 },
  commands: [LoadSettings({ requestId: 0 })],
})

// DERIVED

const nameLength = (name: string): number => [...name].length

const maybeNameError = (name: string): Option.Option<string> => {
  const length = nameLength(name)
  if (length === 0) {
    return Option.some('Display name is required')
  }
  if (length > MAX_NAME_LENGTH) {
    return Option.some(
      `Display name must be at most ${MAX_NAME_LENGTH} characters, not ${length}`,
    )
  }
  return Option.none()
}

const toggledDensity = (density: Density): Density =>
  density === 'compact' ? 'comfortable' : 'compact'

// UPDATE

const modifyEditor = (
  model: Model,
  f: (editor: Editor) => Editor,
): Model =>
  modifyFields(model, {
    load: load =>
      load._tag === 'Loaded' ? LoadState.Loaded({ editor: f(load.editor) }) : load,
  })

const modifyDraft = (
  model: Model,
  f: (draft: Settings) => Settings,
): UpdateReturn => ({
  model: modifyEditor(model, editor =>
    modifyFields(editor, { draft: f }),
  ),
})

const withoutPendingSave = (editor: Editor, operationId: number): Editor =>
  modifyFields(editor, {
    pendingSaves: Array.filter(
      pending => pending.operationId !== operationId,
    ),
  })

const isPendingSave = (model: Model, operationId: number): boolean =>
  model.load._tag === 'Loaded' &&
  Array.some(
    model.load.editor.pendingSaves,
    pending => pending.operationId === operationId,
  )

export const update = (model: Model, message: Message) =>
  Message.match<UpdateReturn>(message, {
    ClickedRetryLoad: () => {
      if (model.load._tag !== 'LoadFailed') {
        return { model }
      }
      const requestId = model.nextId
      return {
        model: modifyFields(model, {
          nextId: nextId => nextId + 1,
          load: () => LoadState.Loading({ requestId }),
        }),
        commands: [LoadSettings({ requestId })],
      }
    },

    SucceededLoadSettings: ({ requestId, settings }) => ({
      model: modifyFields(model, {
        load: load =>
          load._tag === 'Loading' && load.requestId === requestId
            ? LoadState.Loaded({
                editor: {
                  saved: settings,
                  savedVersion: 0,
                  draft: settings,
                  pendingSaves: [],
                  maybeSaveError: Option.none(),
                },
              })
            : load,
      }),
    }),

    FailedLoadSettings: ({ requestId, error }) => ({
      model: modifyFields(model, {
        load: load =>
          load._tag === 'Loading' && load.requestId === requestId
            ? LoadState.LoadFailed({ error })
            : load,
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

    ClickedSave: () => {
      if (model.load._tag !== 'Loaded') {
        return { model }
      }
      const draft = model.load.editor.draft
      if (Option.isSome(maybeNameError(draft.name))) {
        return { model }
      }
      const operationId = model.nextId
      return {
        model: modifyEditor(
          modifyFields(model, { nextId: nextId => nextId + 1 }),
          editor =>
            modifyFields(editor, {
              maybeSaveError: () => Option.none(),
              pendingSaves: Array.append({ operationId, settings: draft }),
            }),
        ),
        commands: [SaveSettings({ operationId, settings: draft })],
      }
    },

    SucceededSaveSettings: ({ operationId, settings }) =>
      !isPendingSave(model, operationId)
        ? { model }
        : {
            model: modifyEditor(model, editor => {
              const settledEditor = withoutPendingSave(editor, operationId)
              return operationId > editor.savedVersion
                ? modifyFields(settledEditor, {
                    saved: () => settings,
                    savedVersion: () => operationId,
                  })
                : settledEditor
            }),
          },

    FailedSaveSettings: ({ operationId, error }) =>
      !isPendingSave(model, operationId)
        ? { model }
        : {
            model: modifyEditor(model, editor =>
              modifyFields(withoutPendingSave(editor, operationId), {
                maybeSaveError: () => Option.some(`Save failed: ${error}`),
              }),
            ),
          },
  })

// VIEW

const testId = (h: HtmlBuilder<Message>, id: string) =>
  h.DataAttribute('testid', id)

const settingsLine = (settings: Settings): string =>
  `Saved: ${settings.name} · ${settings.theme} · ${settings.density}`

const savedLine = (editor: Editor): string =>
  Option.match(Array.last(editor.pendingSaves), {
    onNone: () => settingsLine(editor.saved),
    onSome: pending => `${settingsLine(pending.settings)} (saving…)`,
  })

const themeButton = (
  draft: Settings,
  theme: Theme,
  h: HtmlBuilder<Message>,
): Html =>
  h.button(
    [
      testId(h, `theme-${theme}`),
      h.Type('button'),
      h.AriaPressed(draft.theme === theme ? 'true' : 'false'),
      h.OnClick(Message.ClickedTheme({ theme })),
    ],
    [theme],
  )

const editorView = (editor: Editor, h: HtmlBuilder<Message>): Html => {
  const draft = editor.draft
  const maybeError = maybeNameError(draft.name)
  return h.div(
    [h.Class('settings-editor')],
    [
      h.p([testId(h, 'saved'), h.AriaLive('polite')], [savedLine(editor)]),
      Option.match(editor.maybeSaveError, {
        onNone: () => h.empty,
        onSome: error =>
          h.p([testId(h, 'save-error'), h.Class('error'), h.Role('alert')], [error]),
      }),
      h.div(
        [h.Class('field')],
        [
          h.label(
            [],
            [
              'Display name ',
              h.input([
                testId(h, 'name'),
                h.Type('text'),
                h.Value(draft.name),
                h.AriaInvalid(Option.isSome(maybeError)),
                h.OnInput(value => Message.UpdatedName({ value })),
              ]),
            ],
          ),
          h.span(
            [testId(h, 'name-count')],
            [`${nameLength(draft.name)}/${MAX_NAME_LENGTH}`],
          ),
          Option.match(maybeError, {
            onNone: () => h.empty,
            onSome: error =>
              h.p([testId(h, 'name-error'), h.Class('error')], [error]),
          }),
        ],
      ),
      h.div(
        [h.Class('field'), h.Role('group'), h.AriaLabel('Theme')],
        [
          themeButton(draft, 'light', h),
          themeButton(draft, 'dark', h),
          h.button(
            [
              testId(h, 'density-toggle'),
              h.Type('button'),
              h.OnClick(Message.ClickedDensityToggle()),
            ],
            [`density: ${draft.density}`],
          ),
        ],
      ),
      h.p(
        [testId(h, 'preview')],
        [`Preview: ${draft.theme} / ${draft.density}`],
      ),
      h.button(
        [testId(h, 'save'), h.Type('button'), h.OnClick(Message.ClickedSave())],
        ['save'],
      ),
    ],
  )
}

export const view = Submodel.defineView<Model, Message>((model, h) =>
  h.div(
    [h.Class('settings-page')],
    [
      LoadState.match(model.load, {
        Loading: () => h.p([testId(h, 'load')], ['Loading settings…']),
        LoadFailed: ({ error }) =>
          h.div(
            [testId(h, 'load')],
            [
              h.p([h.Class('error')], [`Could not load settings: ${error}`]),
              h.button(
                [
                  testId(h, 'retry-load'),
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
