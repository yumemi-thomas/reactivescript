import { useSelector } from "@xstate/react";
import type { ActorRefFrom } from "xstate";
import type { helpMachine, HelpEvent } from "../machines/help.js";

export type HelpRef = ActorRefFrom<typeof helpMachine>;

export function HelpPage({ actor }: { actor: HelpRef }) {
  const snap = useSelector(actor, (s) => s);
  const c = snap.context;
  const emit = (e: HelpEvent) => actor.send(e);

  const searchState = snap.value && typeof snap.value === "object" ? snap.value.search : "";
  const shownHits = searchState === "results" || searchState === "searching" || searchState === "failed";
  const countLine = c.hits.length > 0 || searchState === "results";

  let status: string | null = null;
  if (searchState === "tooShort") status = `too short: ${c.query}`;
  if (searchState === "searching") status = "searching…";
  if (searchState === "failed") status = `search failed: ${c.searchError}`;

  const itemState = snap.value && typeof snap.value === "object" ? snap.value.item : "";

  return (
    <div className="help-page">
      <label>
        Search the help{" "}
        <input data-testid="query" value={c.query} onChange={(e) => emit({ type: "query.set", value: e.target.value })} />
      </label>

      <div className="columns">
        <section data-testid="results" className="results-pane">
          {status !== null && <p>{status}</p>}
          {shownHits && countLine && searchState !== "failed" && <p>{`${c.hits.length} results for ${c.hitsFor}`}</p>}
          {shownHits && searchState !== "failed" && (
            <ul>
              {c.hits.map((h) => (
                <li key={h.id}>
                  <button data-testid="hit" onClick={() => emit({ type: "hit.select", id: h.id })}>
                    {c.selectedId === h.id ? `> ${h.name}` : h.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section data-testid="item" className="item-pane">
          {itemState === "route" || itemState === "none" ? "pick a result" : null}
          {itemState === "loading" && "loading…"}
          {itemState === "shown" && c.item && (
            <article>
              <h2>{c.item.name}</h2>
              <p>{c.item.blurb}</p>
            </article>
          )}
          {itemState === "notFound" && `item ${c.selectedId} not found`}
          {itemState === "failed" && (
            <>
              <p>{`failed: ${c.itemError}`}</p>
              <button data-testid="retry-item" onClick={() => emit({ type: "item.retry" })}>
                retry
              </button>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
