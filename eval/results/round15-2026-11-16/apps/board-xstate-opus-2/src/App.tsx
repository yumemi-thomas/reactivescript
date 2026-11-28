import { useMachine } from '@xstate/react';
import { appMachine } from './appMachine';
import { BoardPage } from './BoardPage';
import { ArchivePage } from './ArchivePage';
import './styles.css';

export default function App() {
  const [snapshot, send] = useMachine(appMachine);
  const onBoard = snapshot.matches('board');
  return (
    <div className="app">
      <nav className="tabs" role="tablist">
        <button
          type="button"
          role="tab"
          data-testid="tab-board"
          aria-selected={onBoard}
          className={onBoard ? 'tab active' : 'tab'}
          onClick={() => send({ type: 'tab.board' })}
        >
          Board
        </button>
        <button
          type="button"
          role="tab"
          data-testid="tab-archive"
          aria-selected={!onBoard}
          className={!onBoard ? 'tab active' : 'tab'}
          onClick={() => send({ type: 'tab.archive' })}
        >
          Archive
        </button>
      </nav>
      <main>{onBoard ? <BoardPage /> : <ArchivePage />}</main>
    </div>
  );
}
