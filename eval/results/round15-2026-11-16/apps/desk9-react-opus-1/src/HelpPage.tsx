import { useCallback, useEffect, useState } from "react";
import { fetchItem, search, type Hit } from "./api.js";
import { errMsg, nextSeq, useRequest } from "./util";

/** how the help page opens from a related hit: as if `q` was typed and `selected` clicked */
export type HelpSeed = { q: string; hits: Hit[]; selected: number };

type Shown = { q: string; status: "ok"; hits: Hit[] } | { q: string; status: "error"; error: string };

export default function HelpPage({ seed }: { seed: HelpSeed | null }) {
  const [q, setQ] = useState(seed ? seed.q : "");
  const [shown, setShown] = useState<Shown | null>(seed ? { q: seed.q, status: "ok", hits: seed.hits } : null);
  const [sel, setSel] = useState<{ id: number; key: number } | null>(() =>
    seed ? { id: seed.selected, key: nextSeq() } : null,
  );

  useEffect(() => {
    if (q.length < 2) return;
    let live = true;
    search(q).then(
      hits => {
        if (live) setShown({ q, status: "ok", hits });
      },
      (e: unknown) => {
        if (live) setShown({ q, status: "error", error: errMsg(e) });
      },
    );
    return () => {
      live = false;
    };
  }, [q]);

  function changeQuery(v: string) {
    setQ(v);
    if (v.length < 2) setShown(null);
  }

  const selId = sel ? sel.id : null;
  const loadItem = useCallback(() => fetchItem(selId ?? 0), [selId]);
  const item = useRequest(sel ? `item:${sel.id}:${sel.key}` : null, loadItem);

  const searching = q.length >= 2 && (shown === null || shown.q !== q);

  return (
    <section className="help">
      <label>
        Search help{" "}
        <input data-testid="query" value={q} onChange={e => changeQuery(e.target.value)} />
      </label>
      <div data-testid="results" className="results" aria-live="polite">
        {q.length === 1 && <p>{`too short: ${q}`}</p>}
        {q.length >= 2 && (
          <>
            {searching && <p>searching…</p>}
            {shown !== null && shown.status === "error" && <p className="error">{`search failed: ${shown.error}`}</p>}
            {shown !== null && shown.status === "ok" && (
              <>
                <p>{`${shown.hits.length} results for ${shown.q}`}</p>
                <ul>
                  {shown.hits.map(h => (
                    <li
                      key={h.id}
                      data-testid="hit"
                      role="button"
                      tabIndex={0}
                      aria-selected={h.id === selId}
                      onClick={() => setSel({ id: h.id, key: nextSeq() })}
                      onKeyDown={e => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setSel({ id: h.id, key: nextSeq() });
                        }
                      }}
                    >
                      {h.id === selId ? `> ${h.name}` : h.name}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </>
        )}
      </div>
      <div data-testid="item" className="item">
        {item.status === "idle" && <p>pick a result</p>}
        {item.status === "loading" && <p>loading…</p>}
        {item.status === "ok" &&
          (item.data === null ? (
            <p>{`item ${sel?.id ?? ""} not found`}</p>
          ) : (
            <>
              <h3>{item.data.name}</h3>
              <p>{item.data.blurb}</p>
            </>
          ))}
        {item.status === "error" && (
          <>
            <p className="error">{`failed: ${item.error}`}</p>
            <button
              type="button"
              data-testid="retry-item"
              onClick={() => sel && setSel({ id: sel.id, key: nextSeq() })}
            >
              retry
            </button>
          </>
        )}
      </div>
    </section>
  );
}
