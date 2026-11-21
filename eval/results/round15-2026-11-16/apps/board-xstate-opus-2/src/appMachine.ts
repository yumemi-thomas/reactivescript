import { setup } from 'xstate';

export type AppEvent = { type: 'tab.board' } | { type: 'tab.archive' };

/** Which page is open. Each page owns its own machine, which stops when the page is left. */
export const appMachine = setup({
  types: { events: {} as AppEvent },
}).createMachine({
  id: 'app',
  initial: 'board',
  states: {
    board: { on: { 'tab.archive': 'archive' } },
    archive: { on: { 'tab.board': 'board' } },
  },
});
