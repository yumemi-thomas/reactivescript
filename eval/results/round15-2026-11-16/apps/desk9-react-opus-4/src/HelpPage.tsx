import { useEffect, useState } from "react";
import { fetchItem, search } from "./api";
import type { Hit, Item } from "./api";
import { errMsg } from "./util";

export type HelpInit = { query: string; hits: Hit[]; hit: Hit };

type Results = { q: string; status: "ok"; hits: Hit[] } | { q: string; status: "error"; error: string };

type ItemState =
  | { key: string; status: "ok"; item: Item | null }
  | { key: string; status: "error"; error: string };

export default function HelpPage({ init }: { init?: HelpInit }) {
  const [query, setQuery] = useState(init?.query ?? "");
  // results already known for this query (opened from a related hit), so it need not be asked again
  const [seeded, setSeeded] = useState<string | null>(init?.query ?? null);
  const [results, setResults] = useState<Results | null>(
    init ? { q: init.query, status: "ok", hits: init.hits } : null,
  );
  const [selected, setSelected] = useState<Hit | null>(init?.hit ?? null);
  const [attempt, setAttempt] = useState(0);
  const [item, setItem] = useState<ItemState | null>(null);

  useEffect(() => {
    if (query.length < 2 || query === seeded) return;
    let live = true;
    search(query).then(
      hits => {
        if (live) setResults({ q: query, status: "ok", hits });
      },
      (e: unknown) => {
        if (live) setResults({ q: query, status: "error", error: errMsg(e) });
      },
    );
    return () => {
      live = false;
    };
  }, [query, seeded]);

  const selectedId = selected?.id ?? null;
  const itemKey = selectedId === null ? null : `${selectedId}:${attempt}`;

  useEffect(() => {
    if (selectedId === null || itemKey === null) return;
    let live = true;
    fetchItem(selectedId).then(
      found => {
        if (live) setItem({ key: itemKey, status: "ok", item: found });
      },
      (e: unknown) => {
        if (live) setItem({ key: itemKey, status: "error", error: errMsg(e) });
      },
    );
    return () => {
      live = false;
    };
  }, [selectedId, itemKey]);

  function onQuery(q: string) {
    setQuery(q);
    setSeeded(null);
    // what is on screen for a short query is not a result list, so nothing stays on screen from before
    if (q.length < 2) setResults(null);
  }

  function pick(hit: Hit) {
    if (hit.id === selectedId) return;
    setSelected(hit);
    setAttempt(a => a + 1);
  }

  const current = results && results.q === query ? results : null;
  const previous = !current && results?.status === "ok" ? results : null;
  const shownItem = item && item.key === itemKey ? item : null;

  function hitList(r: { q: string; hits: Hit[] }) {
    return (
      <>
        <p>{`${r.hits.length} results for ${r.q}`}</p>
        <ul className="hits">
          {r.hits.map(h => (
            <li
              key={h.id}
              data-testid="hit"
              className={h.id === selectedId ? "selected" : undefined}
              aria-selected={h.id === selectedId}
              role="option"
              tabIndex={0}
              onClick={() => pick(h)}
              onKeyDown={e => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  pick(h);
                }
              }}
            >
              {h.id === selectedId ? `> ${h.name}` : h.name}
            </li>
          ))}
        </ul>
      </>
    );
  }

  return (
    <div className="help">
      <label>
        Search help{" "}
        <input data-testid="query" type="search" value={query} onChange={e => onQuery(e.target.value)} />
      </label>
      <div className="columns">
        <div data-testid="results" className="results" aria-live="polite">
          {query.length === 0 ? null : query.length < 2 ? (
            <p className="muted">{`too short: ${query}`}</p>
          ) : current === null ? (
            <>
              <p className="muted">searching…</p>
              {previous && hitList(previous)}
            </>
          ) : current.status === "error" ? (
            <p className="error" role="alert">{`search failed: ${current.error}`}</p>
          ) : (
            hitList(current)
          )}
        </div>
        <div data-testid="item" className="item" aria-live="polite">
          {selected === null ? (
            <p className="muted">pick a result</p>
          ) : shownItem === null ? (
            <p className="muted">loading…</p>
          ) : shownItem.status === "error" ? (
            <>
              <p className="error" role="alert">{`failed: ${shownItem.error}`}</p>
              <button type="button" data-testid="retry-item" onClick={() => setAttempt(a => a + 1)}>
                retry
              </button>
            </>
          ) : shownItem.item === null ? (
            <p className="error">{`item ${selected.id} not found`}</p>
          ) : (
            <>
              <h2>{shownItem.item.name}</h2>
              <p>{shownItem.item.blurb}</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
