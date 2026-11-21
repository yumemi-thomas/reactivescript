import { useSelector } from "@xstate/react";
import type { ActorRefFrom } from "xstate";
import type { Settings } from "./api.js";
import { MAX_NAME, nameError, settingsMachine } from "./settingsMachine";

const line = (s: Settings) => `Saved: ${s.name} · ${s.theme} · ${s.density}`;

export function SettingsPage({ actor }: { actor: ActorRefFrom<typeof settingsMachine> }) {
  const snapshot = useSelector(actor, s => s);
  const ctx = snapshot.context;
  const send = actor.send;

  if (snapshot.matches("loading")) {
    return (
      <section className="settings">
        <p data-testid="load">Loading settings…</p>
      </section>
    );
  }
  if (snapshot.matches("failed")) {
    return (
      <section className="settings">
        <div data-testid="load" role="alert">
          <span className="error">{`Could not load settings: ${ctx.loadError}`}</span>{" "}
          <button type="button" data-testid="retry-load" onClick={() => send({ type: "load.retry" })}>
            retry
          </button>
        </div>
      </section>
    );
  }

  const latest = ctx.saving.at(-1);
  const inFlight = latest && latest.seq > ctx.savedSeq ? latest.settings : null;
  const error = nameError(ctx.draft.name);
  const { draft } = ctx;

  return (
    <section className="settings">
      <p data-testid="saved">
        {inFlight ? `${line(inFlight)} (saving…)` : ctx.saved ? line(ctx.saved) : ""}
      </p>
      <form
        onSubmit={e => {
          e.preventDefault();
          send({ type: "save" });
        }}
      >
        <label>
          Display name{" "}
          <input
            data-testid="name"
            value={draft.name}
            aria-invalid={error !== null}
            onChange={e => send({ type: "name.change", value: e.target.value })}
          />
        </label>{" "}
        <span data-testid="name-count">{`${draft.name.length}/${MAX_NAME}`}</span>
        {error !== null && (
          <p data-testid="name-error" className="error">
            {error}
          </p>
        )}
        <div role="group" aria-label="Theme">
          <button
            type="button"
            data-testid="theme-light"
            aria-pressed={draft.theme === "light"}
            onClick={() => send({ type: "theme.set", theme: "light" })}
          >
            light
          </button>
          <button
            type="button"
            data-testid="theme-dark"
            aria-pressed={draft.theme === "dark"}
            onClick={() => send({ type: "theme.set", theme: "dark" })}
          >
            dark
          </button>
          <button type="button" data-testid="density-toggle" onClick={() => send({ type: "density.toggle" })}>
            {`density: ${draft.density}`}
          </button>
        </div>
        <p data-testid="preview">{`Preview: ${draft.theme} / ${draft.density}`}</p>
        <button type="submit" data-testid="save">
          save
        </button>
        {ctx.saveError !== null && (
          <p data-testid="save-error" className="error" role="alert">
            {`Save failed: ${ctx.saveError}`}
          </p>
        )}
      </form>
    </section>
  );
}
