import { assign, fromPromise, setup } from 'xstate';
import * as api from '../api.js';
import type { Density, Settings, Theme } from '../api.js';
import { errorMessage } from './ops.js';

export const NAME_MAX = 20;

/** The message for an invalid display name, or null when the name is valid. */
export function nameError(name: string): string | null {
  if (name.trim() === '') return 'Display name is required';
  if (name.length > NAME_MAX) return `Display name must be at most ${NAME_MAX} characters, not ${name.length}`;
  return null;
}

export type SettingsContext = {
  /** The settings as last saved (or loaded). */
  saved: Settings | null;
  /** The values of the save in the air, if any. */
  inFlight: Settings | null;
  /** The form. Saving never changes it. */
  draft: Settings;
  loadError: string;
  saveError: string;
};

export type SettingsEvent =
  | { type: 'NAME'; value: string }
  | { type: 'THEME'; theme: Theme }
  | { type: 'TOGGLE_DENSITY' }
  | { type: 'SAVE' }
  | { type: 'RETRY_LOAD' };

function nextDensity(density: Density): Density {
  return density === 'compact' ? 'comfortable' : 'compact';
}

export const settingsMachine = setup({
  types: {
    context: {} as SettingsContext,
    events: {} as SettingsEvent,
  },
  actors: {
    loadSettings: fromPromise<Settings>(() => api.loadSettings()),
    saveSettings: fromPromise<Settings, Settings>(({ input }) => api.saveSettings(input)),
  },
  guards: {
    validDraft: ({ context }) => nameError(context.draft.name) === null,
  },
}).createMachine({
  id: 'settings',
  initial: 'loading',
  context: {
    saved: null,
    inFlight: null,
    draft: { name: '', theme: 'light', density: 'comfortable' },
    loadError: '',
    saveError: '',
  },
  states: {
    loading: {
      invoke: {
        src: 'loadSettings',
        onDone: {
          target: 'ready',
          actions: assign({
            saved: ({ event }) => event.output,
            draft: ({ event }) => ({ ...event.output }),
          }),
        },
        onError: {
          target: 'failed',
          actions: assign({ loadError: ({ event }) => errorMessage(event.error) }),
        },
      },
    },
    failed: {
      on: { RETRY_LOAD: { target: 'loading' } },
    },
    ready: {
      initial: 'idle',
      on: {
        NAME: { actions: assign({ draft: ({ context, event }) => ({ ...context.draft, name: event.value }) }) },
        THEME: { actions: assign({ draft: ({ context, event }) => ({ ...context.draft, theme: event.theme }) }) },
        TOGGLE_DENSITY: {
          actions: assign({ draft: ({ context }) => ({ ...context.draft, density: nextDensity(context.draft.density) }) }),
        },
      },
      states: {
        idle: {
          on: { SAVE: { guard: 'validDraft', target: 'saving' } },
        },
        saving: {
          entry: assign({
            inFlight: ({ context }) => context.draft,
            saveError: '',
          }),
          invoke: {
            src: 'saveSettings',
            input: ({ context }) => context.draft,
            onDone: {
              target: 'idle',
              actions: assign({
                saved: ({ event }) => event.output,
                inFlight: null,
              }),
            },
            onError: {
              target: 'idle',
              actions: assign({
                inFlight: null,
                saveError: ({ event }) => errorMessage(event.error),
              }),
            },
          },
          on: { SAVE: { guard: 'validDraft', target: 'saving', reenter: true } },
        },
      },
    },
  },
});
