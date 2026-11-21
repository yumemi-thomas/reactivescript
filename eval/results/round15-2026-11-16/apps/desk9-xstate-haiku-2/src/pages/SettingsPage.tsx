import { useSelector } from "@xstate/react";
import type { ActorRefFrom } from "xstate";
import type { settingsMachine, SettingsEvent } from "../machines/settings.js";
import { NAME_MAX, nameIsValid } from "../machines/settings.js";

export type SettingsRef = ActorRefFrom<typeof settingsMachine>;

export function SettingsPage({ actor }: { actor: SettingsRef }) {
  const snap = useSelector(actor, (s) => s);
  const c = snap.context;
  const emit = (e: SettingsEvent) => actor.send(e);

  const loading = snap.matches("loading");
  const failed = snap.matches("failed");
  const loaded = snap.matches({ loaded: "idle" }) || snap.matches({ loaded: "saving" });
  const saving = snap.matches({ loaded: "saving" });
  const draft = c.draft;
  const shownSaved = saving && c.pending ? c.pending : c.saved;

  const nameLength = draft ? draft.name.length : 0;
  let nameError: string | null = null;
  if (draft && draft.name.trim() === "") nameError = "Display name is required";
  else if (draft && draft.name.length > NAME_MAX)
    nameError = `Display name must be at most ${NAME_MAX} characters, not ${draft.name.length}`;

  return (
    <div className="settings-page">
      <p data-testid="load">
        {loading && "Loading settings…"}
        {failed && `Could not load settings: ${c.loadError}`}
        {failed && (
          <button data-testid="retry-load" onClick={() => emit({ type: "retry.load" })}>
            retry
          </button>
        )}
      </p>

      {loaded && shownSaved && (
        <p data-testid="saved">
          {`Saved: ${shownSaved.name} · ${shownSaved.theme} · ${shownSaved.density}${saving ? " (saving…)" : ""}`}
        </p>
      )}

      {loaded && draft && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (nameIsValid(draft.name)) emit({ type: "save" });
          }}
        >
          <label>
            Display name{" "}
            <input
              data-testid="name"
              value={draft.name}
              onChange={(e) => emit({ type: "name.set", value: e.target.value })}
            />
          </label>
          <span data-testid="name-count">{`${nameLength}/${NAME_MAX}`}</span>
          {nameError && <p data-testid="name-error" role="alert">{nameError}</p>}

          <div role="group" aria-label="Theme">
            <button
              type="button"
              data-testid="theme-light"
              aria-pressed={draft.theme === "light"}
              onClick={() => emit({ type: "theme.set", theme: "light" })}
            >
              light
            </button>
            <button
              type="button"
              data-testid="theme-dark"
              aria-pressed={draft.theme === "dark"}
              onClick={() => emit({ type: "theme.set", theme: "dark" })}
            >
              dark
            </button>
          </div>

          <button type="button" data-testid="density-toggle" onClick={() => emit({ type: "density.toggle" })}>
            {draft.density}
          </button>

          <p data-testid="preview">{`Preview: ${draft.theme} / ${draft.density}`}</p>

          <button type="submit" data-testid="save">
            save
          </button>
          {c.saveError && <p data-testid="save-error" role="alert">{c.saveError}</p>}
        </form>
      )}
    </div>
  );
}
