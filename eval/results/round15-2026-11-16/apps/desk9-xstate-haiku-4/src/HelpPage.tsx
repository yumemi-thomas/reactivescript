import { useSelector } from "@xstate/react";
import type { ActorRefFrom } from "xstate";
import type { helpMachine } from "./helpMachine";

type HelpRef = ActorRefFrom<typeof helpMachine>;

export function HelpPage({ actor }: { actor: HelpRef }) {
  const snap = useSelector(actor, (s) => s);
  const c = snap.context;
  const hits = c.shown?.hits ?? [];
  const selectedId = c.selectedId;

  const hitList = (
    <ul>
      {hits.map((hit) => (
        <li key={hit.id}>
          <button type="button" data-testid="hit" onClick={() => actor.send({ type: "PICK", id: hit.id })}>
            {`${hit.id === selectedId ? "> " : ""}${hit.name}`}
          </button>
        </li>
      ))}
    </ul>
  );

  return (
    <div className="help-page">
      <label>
        Search help{" "}
        <input
          data-testid="query"
          value={c.query}
          onChange={(e) => actor.send({ type: "QUERY", q: e.target.value })}
        />
      </label>
      <section className="results" data-testid="results" aria-live="polite" aria-label="Results">
        {snap.matches({ search: "short" }) && <p>{`too short: ${c.query}`}</p>}
        {snap.matches({ search: "searching" }) && (
          <>
            <p>searching…</p>
            {hitList}
          </>
        )}
        {snap.matches({ search: "results" }) && c.shown && (
          <>
            <p>{`${c.shown.hits.length} results for ${c.shown.q}`}</p>
            {hitList}
          </>
        )}
        {snap.matches({ search: "failed" }) && <p>{`search failed: ${c.searchError}`}</p>}
      </section>
      <section className="item" data-testid="item" aria-label="Help item">
        {snap.matches({ item: "none" }) && <p>pick a result</p>}
        {snap.matches({ item: "loading" }) && <p>loading…</p>}
        {snap.matches({ item: "shown" }) && c.item && (
          <>
            <h3>{c.item.name}</h3>
            <p>{c.item.blurb}</p>
          </>
        )}
        {snap.matches({ item: "notFound" }) && <p>{`item ${selectedId} not found`}</p>}
        {snap.matches({ item: "failed" }) && (
          <>
            <p>{`failed: ${c.itemError}`}</p>
            <button type="button" data-testid="retry-item" onClick={() => actor.send({ type: "RETRY_ITEM" })}>
              retry
            </button>
          </>
        )}
      </section>
    </div>
  );
}
