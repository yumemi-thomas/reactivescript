import { useMachine } from '@xstate/react';
import { archiveMachine, shownArchived } from './archiveMachine';

export function ArchivePage() {
  const [snapshot, send] = useMachine(archiveMachine);
  const { loadError, restoreError } = snapshot.context;
  const rows = shownArchived(snapshot.context);
  return (
    <section className="archive-page">
      <h2>Archive</h2>
      {restoreError !== null && (
        <p className="error" role="alert" data-testid="restore-error">
          restore error: {restoreError}
        </p>
      )}
      <div data-testid="archived" className="archived">
        {snapshot.matches('loading') && <p className="muted">loading archive</p>}
        {snapshot.matches('failed') && (
          <p className="error" role="alert">
            archive error: {loadError}{' '}
            <button type="button" data-testid="retry-archive" onClick={() => send({ type: 'retry' })}>
              retry
            </button>
          </p>
        )}
        {snapshot.matches('ready') && (
          <ul className="list">
            {rows.map(card => (
              <li key={card.id} className="row">
                <span data-testid="archived-card">
                  #{card.id} {card.title}
                </span>
                <button type="button" data-testid="restore" onClick={() => send({ type: 'card.restore', id: card.id })}>
                  restore
                </button>
              </li>
            ))}
            {rows.length === 0 && <li className="muted">no archived cards</li>}
          </ul>
        )}
      </div>
    </section>
  );
}
