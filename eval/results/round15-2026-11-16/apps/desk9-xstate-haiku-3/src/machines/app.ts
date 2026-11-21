import { assign, setup } from 'xstate';
import { helpMachine } from './help.js';
import { issuesMachine } from './issues.js';
import { settingsMachine } from './settings.js';

export type AppEvent =
  | { type: 'GO_ISSUES' }
  | { type: 'GO_HELP' }
  | { type: 'GO_SETTINGS' }
  | { type: 'openCount'; count: number | undefined }
  | { type: 'openRelatedHelp'; query: string; hitId: number };

/**
 * The root: one page at a time. Each page is an invoked actor, so leaving a
 * page stops it and opening it again starts it afresh.
 */
export const appMachine = setup({
  types: {
    context: {} as { openCount: number | undefined },
    events: {} as AppEvent,
  },
  actors: {
    issuesPage: issuesMachine,
    helpPage: helpMachine,
    settingsPage: settingsMachine,
  },
}).createMachine({
  id: 'app',
  initial: 'issues',
  context: { openCount: undefined },
  on: {
    // the issues page reports its open count; a report without a count keeps the last one
    openCount: {
      actions: assign({
        openCount: ({ context, event }) => event.count ?? context.openCount,
      }),
    },
  },
  states: {
    issues: {
      invoke: { id: 'issuesPage', src: 'issuesPage' },
      on: {
        GO_HELP: 'help',
        GO_SETTINGS: 'settings',
        openRelatedHelp: 'help',
      },
    },
    help: {
      invoke: {
        id: 'helpPage',
        src: 'helpPage',
        input: ({ event }) =>
          event.type === 'openRelatedHelp'
            ? { query: event.query, hitId: event.hitId }
            : { query: '' },
      },
      on: {
        GO_ISSUES: 'issues',
        GO_SETTINGS: 'settings',
      },
    },
    settings: {
      invoke: { id: 'settingsPage', src: 'settingsPage' },
      on: {
        GO_ISSUES: 'issues',
        GO_HELP: 'help',
      },
    },
  },
});
