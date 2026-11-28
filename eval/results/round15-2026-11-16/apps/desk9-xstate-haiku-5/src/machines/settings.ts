import { assign, fromPromise, setup } from 'xstate';
import * as api from '../api';
import type { Settings, Theme } from '../api';
import { messageOf } from './shared';

export const NAME_MAX = 20;

/** Why the display name cannot be saved, or null when it can. */
export function nameProblem(name: string): string | null {
  if (name.trim() === '') return 'Display name is required';
  if (name.length > NAME_MAX) return `Display name must be at most ${NAME_MAX} characters, not ${name.length}`;
  return null;
}

type SettingsContext = {
  saved: Settings;
  draft: Settings;
  pending: Settings | null;
  loadError: string | null;
  saveError: string | null;
};

type SettingsEvent =
  | { type: 'RETRY_LOAD' }
  | { type: 'SET_NAME'; value: string }
  | { type: 'SET_THEME'; theme: Theme }
  | { type: 'TOGGLE_DENSITY' }
  | { type: 'SAVE' };

const blank: Settings = { name: '', theme: 'light', density: 'comfortable' };

/** The settings page: loads the settings, then holds a draft the user edits and saves. */
export const settingsMachine = setup({
  types: {
    context: {} as SettingsContext,
    events: {} as SettingsEvent,
  },
  actors: {
    loadSettings: fromPromise<Settings>(() => api.loadSettings()),
    saveSettings: fromPromise<Settings, Settings>(({ input }) => api.saveSettings(input)),
  },
}).createMachine({
  id: 'settings',
  initial: 'loading',
  context: { saved: blank, draft: blank, pending: null, loadError: null, saveError: null },
  states: {
    loading: {
      invoke: {
        src: 'loadSettings',
        onDone: {
          target: 'editing',
          actions: assign({
            saved: ({ event }) => event.output,
            draft: ({ event }) => event.output,
          }),
        },
        onError: {
          target: 'loadFailed',
          actions: assign({ loadError: ({ event }) => messageOf(event.error) }),
        },
      },
    },
    loadFailed: {
      on: {
        RETRY_LOAD: { target: 'loading', actions: assign({ loadError: null }) },
      },
    },
    editing: {
      initial: 'idle',
      on: {
        SET_NAME: {
          actions: assign({ draft: ({ context, event }) => ({ ...context.draft, name: event.value }) }),
        },
        SET_THEME: {
          actions: assign({ draft: ({ context, event }) => ({ ...context.draft, theme: event.theme }) }),
        },
        TOGGLE_DENSITY: {
          actions: assign({
            draft: ({ context }) => ({
              ...context.draft,
              density: context.draft.density === 'compact' ? 'comfortable' : 'compact',
            }),
          }),
        },
      },
      states: {
        idle: {
          on: {
            SAVE: {
              guard: ({ context }) => nameProblem(context.draft.name) === null,
              target: 'saving',
              actions: assign({
                pending: ({ context }) => context.draft,
                saveError: null,
              }),
            },
          },
        },
        saving: {
          invoke: {
            src: 'saveSettings',
            input: ({ context }) => context.draft,
            onDone: {
              target: 'idle',
              actions: assign({
                saved: ({ event }) => event.output,
                pending: null,
              }),
            },
            onError: {
              target: 'idle',
              actions: assign({
                saveError: ({ event }) => messageOf(event.error),
                pending: null,
              }),
            },
          },
        },
      },
    },
  },
});
