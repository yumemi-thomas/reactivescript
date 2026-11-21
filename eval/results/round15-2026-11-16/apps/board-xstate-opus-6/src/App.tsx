import { useMachine } from '@xstate/react';
import { setup } from 'xstate';
import { ArchivePage } from './ArchivePage';
import { BoardPage } from './BoardPage';
import './styles.css';

const appMachine = setup({
  types: { events: {} as { type: 'open.board' } | { type: 'open.archive' } },
}).createMachine({
  id: 'app',
  initial: 'board',
  states: {
    board: { on: { 'open.archive': 'archive' } },
    archive: { on: { 'open.board': 'board' } },
  },
});

export default function App() {
  const [snapshot, send] = useMachine(appMachine);
  const onBoard = snapshot.matches('board');
  return (
    <div className="app">
      <nav className="tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={onBoard}
          data-testid="tab-board"
          onClick={() => send({ type: 'open.board' })}
        >
          Board
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={!onBoard}
          data-testid="tab-archive"
          onClick={() => send({ type: 'open.archive' })}
        >
          Archive
        </button>
      </nav>
      <main>{onBoard ? <BoardPage /> : <ArchivePage />}</main>
    </div>
  );
}
