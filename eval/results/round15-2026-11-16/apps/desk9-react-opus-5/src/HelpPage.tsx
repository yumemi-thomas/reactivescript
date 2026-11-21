import { useEffect, useRef, useState } from "react";
import * as api from "./api.js";
import type { Hit, Item } from "./api.js";
import { errorMessage } from "./util";

export type HelpStart = { query: string; hits: Hit[]; selectedId: number };

type Results =
  | { kind: "none" }
  | { kind: "short"; q: string }
  | { kind: "searching"; q: string; shown: { q: string; hits: Hit[] } | null }
  | { kind: "hits"; q: string; hits: Hit[] }
  | { kind: "error"; q: string; error: string };

type ItemState =
  | { status: "none" }
  | { status: "loading"; id: number }
  | { status: "ok"; id: number; item: Item | null }
  | { status: "error"; id: number; error: string };

function initialResults(start: HelpStart | null): Results {
  if (start === null) return { kind: "none" };
  return { kind: "hits", q: start.query.trim(), hits: start.hits };
}

export function HelpPage({ start }: { start: HelpStart | null }) {
  const [query, setQuery] = useState(start?.query ?? "");
  const [results, setResults] = useState<Results>(() => initialResults(start));
  const [item, setItem] = useState<ItemState>(() =>
    start === null ? { status: "none" } : { status: "loading", id: start.selectedId },
  );
  const searchSeq = useRef(0);
  const itemSeq = useRef(0);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  function requestItem(id: number) {
    itemSeq.current += 1;
    const seq = itemSeq.current;
    api.fetchItem(id).then(
      found => {
        if (mounted.current && itemSeq.current === seq) setItem({ status: "ok", id, item: found });
      },
      (e: unknown) => {
        if (mounted.current && itemSeq.current === seq) setItem({ status: "error", id, error: errorMessage(e) });
      },
    );
  }

  const startId = start?.selectedId ?? null;
  useEffect(() => {
    if (startId === null) return;
    let live = true;
    itemSeq.current += 1;
    const seq = itemSeq.current;
    api.fetchItem(startId).then(
      found => {
        if (live && itemSeq.current === seq) setItem({ status: "ok", id: startId, item: found });
      },
      (e: unknown) => {
        if (live && itemSeq.current === seq) setItem({ status: "error", id: startId, error: errorMessage(e) });
      },
    );
    return () => {
      live = false;
    };
  }, [startId]);

  function onQuery(value: string) {
    setQuery(value);
    const q = value.trim();
    searchSeq.current += 1;
    const seq = searchSeq.current;
    if (q === "") {
      setResults({ kind: "none" });
      return;
    }
    if (q.length < 2) {
      setResults({ kind: "short", q });
      return;
    }
    setResults(prev => {
      let shown: { q: string; hits: Hit[] } | null = null;
      if (prev.kind === "hits") shown = { q: prev.q, hits: prev.hits };
      else if (prev.kind === "searching") shown = prev.shown;
      return { kind: "searching", q, shown };
    });
    api.search(q).then(
      hits => {
        if (mounted.current && searchSeq.current === seq) setResults({ kind: "hits", q, hits });
      },
      (e: unknown) => {
        if (mounted.current && searchSeq.current === seq) setResults({ kind: "error", q, error: errorMessage(e) });
      },
    );
  }

  const selectedId = item.status === "none" ? null : item.id;

  function select(hit: Hit) {
    if (hit.id === selectedId) return;
    setItem({ status: "loading", id: hit.id });
    requestItem(hit.id);
  }

  function retryItem() {
    if (selectedId === null) return;
    setItem({ status: "loading", id: selectedId });
    requestItem(selectedId);
  }

  let list: { q: string; hits: Hit[] } | null = null;
  if (results.kind === "hits") list = { q: results.q, hits: results.hits };
  else if (results.kind === "searching") list = results.shown;

  return (
    <div className="cols">
      <div className="panel">
        <div className="field">
          <label htmlFor="query">Search help</label>
          <input
            id="query"
            data-testid="query"
            type="search"
            value={query}
            onChange={e => onQuery(e.target.value)}
          />
        </div>
        <div data-testid="results" aria-live="polite">
          {results.kind === "short" && <p className="muted">too short: {results.q}</p>}
          {results.kind === "searching" && <p className="muted">searching…</p>}
          {results.kind === "error" && <p className="error">search failed: {results.error}</p>}
          {list !== null && (
            <>
              <p>{`${list.hits.length} results for ${list.q}`}</p>
              <ul>
                {list.hits.map(hit => (
                  <li key={hit.id} data-testid="hit" onClick={() => select(hit)}>
                    <button className="hit-btn" aria-pressed={hit.id === selectedId}>
                      {hit.id === selectedId ? `> ${hit.name}` : hit.name}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
      <div className="panel" data-testid="item">
        {item.status === "none" && <p className="muted">pick a result</p>}
        {item.status === "loading" && <p className="muted">loading…</p>}
        {item.status === "ok" && item.item === null && <p className="error">item {item.id} not found</p>}
        {item.status === "ok" && item.item !== null && (
          <>
            <h2>{item.item.name}</h2>
            <p>{item.item.blurb}</p>
          </>
        )}
        {item.status === "error" && (
          <>
            <p className="error">failed: {item.error}</p>
            <button data-testid="retry-item" onClick={retryItem}>
              retry
            </button>
          </>
        )}
      </div>
    </div>
  );
}
