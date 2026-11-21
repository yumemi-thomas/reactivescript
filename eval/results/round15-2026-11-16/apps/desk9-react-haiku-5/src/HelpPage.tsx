import { useCallback, useEffect, useRef, useState } from "react";
import { fetchItem, search } from "./api.js";
import type { Hit, Item } from "./api.js";
import { errorMessage, type Load } from "./load";

export type HelpSeed = { query: string; hitId: number };

type Results = { q: string; load: Load<Hit[]> };

// `seed` is set only when the page is opened from a related-help link; a
// page opened from its tab starts empty.
export default function HelpPage({ seed }: { seed: HelpSeed | null }) {
  const [query, setQuery] = useState(seed?.query ?? "");
  const [selected, setSelected] = useState<number | null>(seed?.hitId ?? null);
  const [results, setResults] = useState<Results | null>(null);

  useEffect(() => {
    if (query.length < 2) return;
    let active = true;
    search(query).then(
      (hits) => {
        if (active) setResults({ q: query, load: { status: "ok", value: hits } });
      },
      (e: unknown) => {
        if (active) setResults({ q: query, load: { status: "error", message: errorMessage(e) } });
      },
    );
    return () => {
      active = false;
    };
  }, [query]);

  const searching = query.length >= 2 && results?.q !== query;
  // Results for the last answered query stay on screen while a new search runs.
  const view = query.length >= 2 && results !== null ? results : null;
  const okView = view !== null && view.load.status === "ok" ? { q: view.q, hits: view.load.value } : null;

  return (
    <div className="help">
      <label>
        Search help{" "}
        <input data-testid="query" value={query} onChange={(e) => setQuery(e.target.value)} />
      </label>

      <section data-testid="results" aria-live="polite" aria-label="Results">
        {query.length === 1 && <p>too short: {query}</p>}
        {searching && <p>searching…</p>}
        {view !== null && view.load.status === "error" && (
          <p role="alert">search failed: {view.load.message}</p>
        )}
        {okView !== null && (
          <>
            <p>
              {okView.hits.length} results for {okView.q}
            </p>
            <ul>
              {okView.hits.map((hit) => (
                <li key={hit.id}>
                  <button
                    data-testid="hit"
                    aria-pressed={selected === hit.id}
                    onClick={() => setSelected(hit.id)}
                  >
                    {selected === hit.id ? "> " : ""}
                    {hit.name}
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section data-testid="item" aria-live="polite" aria-label="Help item">
        {selected === null ? <p>pick a result</p> : <ItemPane key={selected} id={selected} />}
      </section>
    </div>
  );
}

function ItemPane({ id }: { id: number }) {
  const [load, setLoad] = useState<Load<Item | null>>({ status: "loading" });
  const token = useRef(0);

  const request = useCallback(() => {
    const mine = ++token.current;
    fetchItem(id).then(
      (value) => {
        if (mine === token.current) setLoad({ status: "ok", value });
      },
      (e: unknown) => {
        if (mine === token.current) setLoad({ status: "error", message: errorMessage(e) });
      },
    );
  }, [id]);

  useEffect(() => {
    request();
  }, [request]);

  function retry() {
    setLoad({ status: "loading" });
    request();
  }

  if (load.status === "loading") return <p>loading…</p>;
  if (load.status === "error") {
    return (
      <>
        <p role="alert">failed: {load.message}</p>
        <button data-testid="retry-item" onClick={retry}>
          retry
        </button>
      </>
    );
  }
  if (load.value === null) return <p>item {id} not found</p>;
  return (
    <article>
      <h2>{load.value.name}</h2>
      <p>{load.value.blurb}</p>
    </article>
  );
}
