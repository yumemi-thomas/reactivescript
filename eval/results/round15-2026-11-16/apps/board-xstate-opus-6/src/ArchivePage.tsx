import { useMachine } from '@xstate/react';
import { archiveMachine } from './archiveMachine';

export function ArchivePage() {
  const [snapshot, send] = useMachine(archiveMachine);
  const { cards, restoring, loadError, restoreError } = snapshot.context;
  const shown = cards.filter((c) => !restoring.some((r) => r.id === c.id));
  return (
    <section className="archive-page">
      <h2>Archive</h2>
      {restoreError && (
        <p className="error" role="alert" data-testid="restore-error">
          {restoreError}
        </p>
      )}
      <div data-testid="archived">
        {snapshot.matches('loading') && <p className="muted">loading archive</p>}
        {snapshot.matches('failed') && (
          <p className="error" role="alert">
            archive error: {loadError}{' '}
            <button type="button" data-testid="retry-archive" onClick={() => send({ type: 'retry' })}>
              retry
            </button>
          </p>
        )}
        {snapshot.matches('ready') &&
          (shown.length === 0 ? (
            <p className="muted">no archived cards</p>
          ) : (
            <ul className="rows">
              {shown.map((c) => (
                <li key={c.id} className="row">
                  <span data-testid="archived-card">{`#${c.id} ${c.title}`}</span>
                  <button type="button" data-testid="restore" onClick={() => send({ type: 'restore', id: c.id })}>
                    restore
                  </button>
                </li>
              ))}
            </ul>
          ))}
      </div>
    </section>
  );
}
