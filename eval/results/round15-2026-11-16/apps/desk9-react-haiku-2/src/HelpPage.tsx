import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchItem, search } from "./api";
import type { Hit } from "./api";
import { errorMessage } from "./desk";

export type HelpIntent = { query: string; hitId: number };

type Outcome =
  | { q: string; ok: true; hits: Hit[] }
  | { q: string; ok: false; message: string };

type Props = { intent?: HelpIntent };

export function HelpPage({ intent }: Props) {
  const [query, setQuery] = useState(intent?.query ?? "");
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(intent?.hitId ?? null);

  useEffect(() => {
    if (query.length < 2) return;
    let live = true;
    search(query).then(
      (hits) => {
        if (live) setOutcome({ q: query, ok: true, hits });
      },
      (e: unknown) => {
        if (live) setOutcome({ q: query, ok: false, message: errorMessage(e) });
      },
    );
    return () => {
      live = false;
    };
  }, [query]);

  const onQuery = (value: string) => {
    setQuery(value);
    // Results for a query that is no longer there must not reappear as stale results.
    if (value.length < 2) setOutcome(null);
  };

  let results;
  if (query.length === 0) {
    results = null;
  } else if (query.length === 1) {
    results = <p>{`too short: ${query}`}</p>;
  } else {
    const current = outcome && outcome.q === query ? outcome : null;
    const shown = current ?? (outcome?.ok ? outcome : null);
    const hits = shown?.ok ? shown.hits : [];
    results = (
      <>
        {current === null && <p>searching…</p>}
        {current?.ok && <p>{`${current.hits.length} results for ${query}`}</p>}
        {current && !current.ok && <p>{`search failed: ${current.message}`}</p>}
        {hits.length > 0 && (
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 4 }}>
            {hits.map((hit) => (
              <li
                key={hit.id}
                data-testid="hit"
                role="button"
                tabIndex={0}
                aria-pressed={selectedId === hit.id}
                onClick={() => setSelectedId(hit.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") setSelectedId(hit.id);
                }}
                style={{ cursor: "pointer", fontWeight: selectedId === hit.id ? 600 : 400 }}
              >
                {`${selectedId === hit.id ? "> " : ""}${hit.name}`}
              </li>
            ))}
          </ul>
        )}
      </>
    );
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <label style={{ display: "grid", gap: 4 }}>
        Search help
        <input
          data-testid="query"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
        />
      </label>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 16 }}>
        <section data-testid="results" aria-label="Results">
          {results}
        </section>
        <section data-testid="item" aria-label="Help item">
          {selectedId === null ? (
            <p>pick a result</p>
          ) : (
            <ItemPane key={selectedId} id={selectedId} />
          )}
        </section>
      </div>
    </div>
  );
}

function ItemPane({ id }: { id: number }) {
  const item = useQuery({
    queryKey: ["item", id],
    queryFn: () => fetchItem(id),
  });

  if (item.isPending) return <p>loading…</p>;
  if (item.isError) {
    return (
      <div>
        <p>{`failed: ${errorMessage(item.error)}`}</p>
        <button type="button" data-testid="retry-item" onClick={() => void item.refetch()}>
          retry
        </button>
      </div>
    );
  }
  if (item.data === null) return <p>{`item ${id} not found`}</p>;
  return (
    <article>
      <h2 style={{ margin: "0 0 8px", fontSize: "1.2em" }}>{item.data.name}</h2>
      <p>{item.data.blurb}</p>
    </article>
  );
}
