import { assign, setup } from 'xstate';
import type { HelpInput } from './help.js';

/**
 * The app's page. Leaving a page unmounts it and so discards it; the open-issue
 * count lives here, so it survives the issues page being left.
 */
export const appMachine = setup({
  types: {
    context: {} as { openCount: number | null; helpInput: HelpInput | null },
    events: {} as
      | { type: 'GO_ISSUES' }
      | { type: 'GO_HELP' }
      | { type: 'GO_SETTINGS' }
      | { type: 'OPEN_HELP'; query: string; hitId: number }
      | { type: 'OPEN_COUNT'; count: number },
  },
}).createMachine({
  id: 'app',
  initial: 'issues',
  context: { openCount: null, helpInput: null },
  on: {
    OPEN_COUNT: { actions: assign({ openCount: ({ event }) => event.count }) },
  },
  states: {
    issues: {
      on: {
        GO_HELP: { target: 'help', actions: assign({ helpInput: null }) },
        GO_SETTINGS: { target: 'settings' },
        OPEN_HELP: {
          target: 'help',
          actions: assign({ helpInput: ({ event }) => ({ query: event.query, hitId: event.hitId }) }),
        },
      },
    },
    help: {
      on: {
        GO_ISSUES: { target: 'issues' },
        GO_SETTINGS: { target: 'settings' },
      },
    },
    settings: {
      on: {
        GO_ISSUES: { target: 'issues' },
        GO_HELP: { target: 'help', actions: assign({ helpInput: null }) },
      },
    },
  },
});
