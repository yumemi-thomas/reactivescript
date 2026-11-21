import { useRef, useState } from "react";
import { fetchItem, search, type Hit } from "./api";
import { errorMessage, useAsync } from "./util";

/** How the page opens from a related-help hit: as if `query` was typed and `selectedId` clicked. */
export type HelpSeed = { query: string; hits: Hit[]; selectedId: number };

type Results = { q: string; status: "ok"; hits: Hit[] } | { q: string; status: "error"; message: string };

export function HelpPage({ seed }: { seed: HelpSeed | null }) {
  const [query, setQuery] = useState(seed?.query ?? "");
  const [shown, setShown] = useState<Results | null>(
    seed ? { q: seed.query.trim(), status: "ok", hits: seed.hits } : null,
  );
  const [searchingFor, setSearchingFor] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(seed?.selectedId ?? null);
  const [itemNonce, setItemNonce] = useState(0);
  const latestSearch = useRef(0);
  const item = useAsync(fetchItem, selectedId, itemNonce);

  function onQueryChange(value: string) {
    setQuery(value);
    const q = value.trim();
    const token = ++latestSearch.current;
    if (q.length < 2) {
      setShown(null);
      setSearchingFor(null);
      return;
    }
    setSearchingFor(q);
    new Promise<Hit[]>(resolve => resolve(search(q))).then(
      hits => {
        if (token !== latestSearch.current) return;
        setShown({ q, status: "ok", hits });
        setSearchingFor(null);
      },
      (e: unknown) => {
        if (token !== latestSearch.current) return;
        setShown({ q, status: "error", message: errorMessage(e) });
        setSearchingFor(null);
      },
    );
  }

  const q = query.trim();
  const searching = searchingFor !== null && searchingFor === q;

  return (
    <section className="help">
      <label className="field">
        <span>Search help</span>
        <input
          type="search"
          data-testid="query"
          value={query}
          onChange={e => onQueryChange(e.target.value)}
          autoComplete="off"
        />
      </label>
      <div className="split">
        <div data-testid="results" aria-live="polite" aria-busy={searching}>
          {q.length === 1 && <p className="muted">too short: {q}</p>}
          {q.length >= 2 && (
            <>
              {searching && <p className="muted">searching…</p>}
              {!searching && shown?.status === "error" && (
                <p className="error" role="alert">
                  search failed: {shown.message}
                </p>
              )}
              {shown?.status === "ok" && (
                <>
                  <p>{`${shown.hits.length} results for ${shown.q}`}</p>
                  <ul className="hits">
                    {shown.hits.map(hit => (
                      <li key={hit.id} data-testid="hit" className={hit.id === selectedId ? "selected" : undefined}>
                        <button
                          type="button"
                          aria-current={hit.id === selectedId ? "true" : undefined}
                          onClick={() => setSelectedId(hit.id)}
                        >
                          {`${hit.id === selectedId ? "> " : ""}${hit.name}`}
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </>
          )}
        </div>
        <div className="item" data-testid="item" aria-live="polite">
          {selectedId === null && <p className="muted">pick a result</p>}
          {selectedId !== null && item.status === "loading" && <p className="muted">loading…</p>}
          {selectedId !== null && item.status === "ok" && item.data === null && <p>{`item ${selectedId} not found`}</p>}
          {selectedId !== null && item.status === "ok" && item.data !== null && (
            <>
              <h2>{item.data.name}</h2>
              <p>{item.data.blurb}</p>
            </>
          )}
          {selectedId !== null && item.status === "error" && (
            <>
              <p className="error" role="alert">
                failed: {item.message}
              </p>
              <button type="button" data-testid="retry-item" onClick={() => setItemNonce(n => n + 1)}>
                retry
              </button>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
