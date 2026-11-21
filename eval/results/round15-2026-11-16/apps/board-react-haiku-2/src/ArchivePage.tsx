import { useEffect, useState } from "react";
import { fetchArchived, restoreCard, type Archived } from "./api.js";
import { messageOf } from "./shared";

type ListState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ok"; items: Archived[] };

export default function ArchivePage() {
  const [list, setList] = useState<ListState>({ status: "loading" });
  const [restoreError, setRestoreError] = useState<string>();

  useEffect(() => {
    fetchArchived().then(
      items => setList({ status: "ok", items }),
      err => setList({ status: "error", message: messageOf(err) }),
    );
  }, []);

  function restore(row: Archived, index: number) {
    setRestoreError(undefined);
    setList(prev =>
      prev.status === "ok" ? { status: "ok", items: prev.items.filter(x => x.id !== row.id) } : prev,
    );
    restoreCard(row.id).catch((err: unknown) => {
      setList(prev => {
        if (prev.status !== "ok" || prev.items.some(x => x.id === row.id)) return prev;
        const items = [...prev.items];
        items.splice(Math.min(index, items.length), 0, row);
        return { status: "ok", items };
      });
      setRestoreError(messageOf(err));
    });
  }

  return (
    <section aria-label="Archive">
      <div data-testid="archived">
        {list.status === "loading" && <p>loading archive</p>}
        {list.status === "error" && <p role="alert">{`archive error: ${list.message}`}</p>}
        {list.status === "ok" && (
          <ul style={{ listStyle: "none", padding: 0 }}>
            {list.items.map((row, index) => (
              <li key={row.id} style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                <span data-testid="archived-card">{`#${row.id} ${row.title}`}</span>
                <button type="button" data-testid="restore" onClick={() => restore(row, index)}>
                  restore
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {restoreError !== undefined && (
        <p role="alert" data-testid="restore-error">{`restore error: ${restoreError}`}</p>
      )}
    </section>
  );
}
