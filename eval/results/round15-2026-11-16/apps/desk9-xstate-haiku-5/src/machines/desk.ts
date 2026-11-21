import { assign, setup } from 'xstate';
import { helpMachine, type HelpInput } from './help';
import { issuesMachine } from './issues';
import { settingsMachine } from './settings';

type Seed = { query: string; hitId: number } | undefined;

export type DeskEvent =
  | { type: 'GO_ISSUES' }
  | { type: 'GO_HELP' }
  | { type: 'GO_SETTINGS' }
  | { type: 'OPEN_COUNT'; count: number }
  | { type: 'OPEN_HELP'; query: string; hitId: number };

/**
 * The app: one page at a time, each page a child actor. Leaving a page stops its actor, so opening it
 * again starts it fresh. The open-issue count lives here so it survives the issues page being left.
 */
export const deskMachine = setup({
  types: {
    context: {} as { openCount: number | undefined; seed: Seed },
    events: {} as DeskEvent,
  },
  actors: {
    issuesPage: issuesMachine,
    helpPage: helpMachine,
    settingsPage: settingsMachine,
  },
}).createMachine({
  id: 'desk',
  initial: 'issues',
  context: { openCount: undefined, seed: undefined },
  states: {
    issues: {
      invoke: { id: 'issues', src: 'issuesPage' },
      on: {
        GO_HELP: { target: 'help', actions: assign({ seed: undefined }) },
        GO_SETTINGS: { target: 'settings' },
        OPEN_HELP: {
          target: 'help',
          actions: assign({ seed: ({ event }) => ({ query: event.query, hitId: event.hitId }) }),
        },
        OPEN_COUNT: { actions: assign({ openCount: ({ event }) => event.count }) },
      },
    },
    help: {
      invoke: {
        id: 'help',
        src: 'helpPage',
        input: ({ context }): HelpInput => ({
          query: context.seed?.query ?? '',
          hitId: context.seed?.hitId ?? null,
        }),
      },
      on: {
        GO_ISSUES: { target: 'issues' },
        GO_SETTINGS: { target: 'settings' },
      },
    },
    settings: {
      invoke: { id: 'settings', src: 'settingsPage' },
      on: {
        GO_ISSUES: { target: 'issues' },
        GO_HELP: { target: 'help', actions: assign({ seed: undefined }) },
      },
    },
  },
});
