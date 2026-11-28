import { useCallback, useState, type ReactNode } from "react";
import { fetchItem, search, type Hit } from "./api";
import { useLoad } from "./useLoad";

/** what a related-help link hands the help page: the query to run and the hit to open */
export type HelpSeed = { query: string; hitId: number };

type Found = { q: string; hits: Hit[] };

export default function HelpPage({ seed }: { seed: HelpSeed | null }) {
  const [query, setQuery] = useState(seed?.query ?? "");
  const [querySeq, setQuerySeq] = useState(0);
  const [selected, setSelected] = useState<number | null>(seed?.hitId ?? null);
  const [itemGen, setItemGen] = useState(0);

  const searchKey = query.length >= 2 ? `${querySeq}/${query}` : null;
  const searchLoader = useCallback(() => search(query).then((hits): Found => ({ q: query, hits })), [query]);
  const results = useLoad(searchKey, searchLoader);

  const itemKey = selected === null ? null : `${selected}/${itemGen}`;
  const itemLoader = useCallback(() => fetchItem(selected ?? 0), [selected]);
  const item = useLoad(itemKey, itemLoader);

  let body: ReactNode = null;
  if (query.length === 1) {
    body = <p>{`too short: ${query}`}</p>;
  } else if (query.length >= 2) {
    if (results.status === "error") {
      body = <p>{`search failed: ${results.error}`}</p>;
    } else {
      // Results on screen stay until the new ones arrive.
      const shown: Found | undefined = results.status === "ok" ? results.value : results.last;
      body = (
        <>
          {results.status === "loading" ? <p>searching…</p> : null}
          {shown ? (
            <>
              <p>{`${shown.hits.length} results for ${shown.q}`}</p>
              <ul>
                {shown.hits.map(h => (
                  <li key={h.id}>
                    <button
                      type="button"
                      data-testid="hit"
                      aria-pressed={selected === h.id}
                      onClick={() => setSelected(h.id)}
                    >
                      {`${selected === h.id ? "> " : ""}${h.name}`}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </>
      );
    }
  }

  return (
    <div className="help">
      <label>
        Search help
        <input
          data-testid="query"
          value={query}
          onChange={e => {
            setQuery(e.target.value);
            setQuerySeq(s => s + 1);
          }}
        />
      </label>
      <section data-testid="results" aria-live="polite">
        {body}
      </section>
      <section data-testid="item" aria-live="polite">
        {selected === null ? <p>pick a result</p> : null}
        {selected !== null && item.status === "loading" ? <p>loading…</p> : null}
        {selected !== null && item.status === "error" ? (
          <>
            <p>{`failed: ${item.error}`}</p>
            <button type="button" data-testid="retry-item" onClick={() => setItemGen(g => g + 1)}>
              retry
            </button>
          </>
        ) : null}
        {selected !== null && item.status === "ok" && item.value ? (
          <>
            <h3>{item.value.name}</h3>
            <p>{item.value.blurb}</p>
          </>
        ) : null}
        {selected !== null && item.status === "ok" && item.value === null ? (
          <p>{`item ${selected} not found`}</p>
        ) : null}
      </section>
    </div>
  );
}
