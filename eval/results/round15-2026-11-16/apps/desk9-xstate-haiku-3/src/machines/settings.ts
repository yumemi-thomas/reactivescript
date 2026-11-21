import { assign, fromPromise, setup } from 'xstate';
import * as api from '../api.js';
import type { Settings, Theme } from '../api.js';
import { messageOf } from '../errors.js';

export const NAME_MAX = 20;

/** The problem with a display name, or undefined when it is valid. */
export function nameProblem(name: string): string | undefined {
  if (name.length === 0) return 'Display name is required';
  if (name.length > NAME_MAX) {
    return `Display name must be at most ${NAME_MAX} characters, not ${name.length}`;
  }
  return undefined;
}

type SettingsContext = {
  /** what the server last answered (the saved line) */
  saved: Settings | undefined;
  /** the form; belongs to the user once loaded */
  draft: Settings;
  /** the values of the save in flight */
  pendingSave: Settings;
  loadError: string;
  saveError: string | undefined;
};

type SettingsEvent =
  | { type: 'RETRY_LOAD' }
  | { type: 'SET_NAME'; value: string }
  | { type: 'SET_THEME'; theme: Theme }
  | { type: 'TOGGLE_DENSITY' }
  | { type: 'SAVE' };

const blank: Settings = { name: '', theme: 'light', density: 'comfortable' };

/** The settings page: loads the settings, edits a draft, saves it. */
export const settingsMachine = setup({
  types: {
    context: {} as SettingsContext,
    events: {} as SettingsEvent,
  },
  actors: {
    loadSettings: fromPromise<Settings, undefined>(() => api.loadSettings()),
    saveSettings: fromPromise<Settings, Settings>(({ input }) => api.saveSettings(input)),
  },
  guards: {
    validDraft: ({ context }) => nameProblem(context.draft.name) === undefined,
  },
}).createMachine({
  id: 'settings',
  initial: 'loading',
  context: {
    saved: undefined,
    draft: blank,
    pendingSave: blank,
    loadError: '',
    saveError: undefined,
  },
  states: {
    loading: {
      invoke: {
        src: 'loadSettings',
        onDone: {
          target: 'ready',
          actions: assign({
            saved: ({ event }) => event.output,
            draft: ({ event }) => event.output,
          }),
        },
        onError: {
          target: 'failed',
          actions: assign({ loadError: ({ event }) => messageOf(event.error) }),
        },
      },
    },
    failed: {
      on: { RETRY_LOAD: 'loading' },
    },
    ready: {
      initial: 'idle',
      on: {
        SET_NAME: {
          actions: assign({
            draft: ({ context, event }): Settings => ({ ...context.draft, name: event.value }),
          }),
        },
        SET_THEME: {
          actions: assign({
            draft: ({ context, event }): Settings => ({ ...context.draft, theme: event.theme }),
          }),
        },
        TOGGLE_DENSITY: {
          actions: assign({
            draft: ({ context }): Settings => ({
              ...context.draft,
              density: context.draft.density === 'compact' ? 'comfortable' : 'compact',
            }),
          }),
        },
        SAVE: {
          guard: 'validDraft',
          target: '.saving',
          reenter: true,
          actions: assign({
            pendingSave: ({ context }) => context.draft,
            saveError: undefined,
          }),
        },
      },
      states: {
        idle: {},
        saving: {
          invoke: {
            src: 'saveSettings',
            input: ({ context }) => context.pendingSave,
            onDone: {
              target: 'idle',
              actions: assign({ saved: ({ event }) => event.output }),
            },
            onError: {
              target: 'idle',
              actions: assign({ saveError: ({ event }) => messageOf(event.error) }),
            },
          },
        },
      },
    },
  },
});
