import { useEffect, useState } from "react";
import { fetchItem, search } from "./api.js";
import type { Hit, Item } from "./api.js";
import { errorMessage } from "./util";

type Results =
  | { req: number; q: string; status: "ok"; hits: Hit[] }
  | { req: number; q: string; status: "error"; message: string };

type ItemState =
  | { req: number; status: "ok"; item: Item }
  | { req: number; status: "missing" }
  | { req: number; status: "error"; message: string };

type Props = { initialQuery: string; initialHit: Hit | null };

export default function HelpPage({ initialQuery, initialHit }: Props) {
  const [query, setQuery] = useState(initialQuery);
  const [req, setReq] = useState(0);
  const [results, setResults] = useState<Results | null>(null);
  const [selected, setSelected] = useState<number | null>(initialHit?.id ?? null);
  const [itemReq, setItemReq] = useState(0);
  const [item, setItem] = useState<ItemState | null>(null);

  useEffect(() => {
    if (query.length < 2) return;
    let alive = true;
    search(query).then(
      hits => {
        if (alive) setResults({ req, q: query, status: "ok", hits });
      },
      e => {
        if (alive) setResults({ req, q: query, status: "error", message: errorMessage(e) });
      },
    );
    return () => {
      alive = false;
    };
  }, [query, req]);

  useEffect(() => {
    if (selected === null) return;
    let alive = true;
    fetchItem(selected).then(
      found => {
        if (alive) setItem(found ? { req: itemReq, status: "ok", item: found } : { req: itemReq, status: "missing" });
      },
      e => {
        if (alive) setItem({ req: itemReq, status: "error", message: errorMessage(e) });
      },
    );
    return () => {
      alive = false;
    };
  }, [selected, itemReq]);

  const onQuery = (q: string) => {
    setQuery(q);
    setReq(r => r + 1);
    // Results only stay on screen while one search replaces another.
    if (q.length < 2) setResults(null);
  };

  const select = (id: number) => {
    if (id === selected) return;
    setSelected(id);
    setItemReq(r => r + 1);
  };

  const settled = results !== null && results.req === req ? results : null;
  const previous = settled === null && results?.status === "ok" ? results : null;

  const hitList = (r: { hits: Hit[] }) => (
    <ul>
      {r.hits.map(h => (
        <li key={h.id}>
          <button type="button" className="row-main" data-testid="hit" onClick={() => select(h.id)}>
            {h.id === selected ? `> ${h.name}` : h.name}
          </button>
        </li>
      ))}
    </ul>
  );

  const currentItem = item !== null && item.req === itemReq ? item : null;

  return (
    <div className="issues">
      <div>
        <input
          data-testid="query"
          aria-label="Search help"
          placeholder="Search help"
          value={query}
          onChange={e => onQuery(e.target.value)}
        />
        <div data-testid="results" aria-live="polite">
          {query.length === 0 ? null : query.length < 2 ? (
            <p className="muted">too short: {query}</p>
          ) : settled === null ? (
            <>
              <p className="muted">searching…</p>
              {previous && (
                <>
                  <p>
                    {previous.hits.length} results for {previous.q}
                  </p>
                  {hitList(previous)}
                </>
              )}
            </>
          ) : settled.status === "error" ? (
            <p className="error">search failed: {settled.message}</p>
          ) : (
            <>
              <p>
                {settled.hits.length} results for {settled.q}
              </p>
              {hitList(settled)}
            </>
          )}
        </div>
      </div>
      <div className="panel" data-testid="item">
        {selected === null ? (
          <p className="muted">pick a result</p>
        ) : currentItem === null ? (
          <p className="muted">loading…</p>
        ) : currentItem.status === "missing" ? (
          <p className="error">item {selected} not found</p>
        ) : currentItem.status === "error" ? (
          <>
            <p className="error">failed: {currentItem.message}</p>
            <button type="button" data-testid="retry-item" onClick={() => setItemReq(r => r + 1)}>
              retry
            </button>
          </>
        ) : (
          <>
            <h2>{currentItem.item.name}</h2>
            <p>{currentItem.item.blurb}</p>
          </>
        )}
      </div>
    </div>
  );
}
