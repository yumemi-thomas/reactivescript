import { useEffect, useState, useSyncExternalStore } from "react";
import { ArchiveStore } from "./archiveStore";

export default function ArchivePage() {
  const [store] = useState(() => new ArchiveStore());
  const view = useSyncExternalStore(store.subscribe, store.getSnapshot);
  useEffect(() => { store.start(); }, [store]);

  return (
    <section className="archive">
      <h2>Archive</h2>
      {view.restoreError !== null && <p className="error" data-testid="restore-error" role="alert">restore error: {view.restoreError}</p>}
      <div data-testid="archived">
        {view.status === "loading" && <p className="muted">loading archive</p>}
        {view.status === "error" && <p className="error" role="alert">archive error: {view.error}</p>}
        {view.status === "ok" && (view.items.length === 0
          ? <p className="muted">no archived cards</p>
          : (
            <ul className="list">
              {view.items.map(item => (
                <li key={item.id} className="row">
                  <span data-testid="archived-card">#{item.id} {item.title}</span>
                  <button type="button" data-testid="restore" onClick={() => store.restore(item.id)}>restore</button>
                </li>
              ))}
            </ul>
          ))}
      </div>
    </section>
  );
}
