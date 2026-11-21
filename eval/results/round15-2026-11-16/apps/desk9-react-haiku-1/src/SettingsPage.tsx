import { useState } from "react";
import { loadSettings, saveSettings, type Settings } from "./api";
import { errorMessage, useLoad } from "./useLoad";

const NAME_MAX = 20;

export default function SettingsPage() {
  const [attempt, setAttempt] = useState(0);
  const loaded = useLoad(`${attempt}`, loadSettings);

  return (
    <div className="settings">
      <div data-testid="load" aria-live="polite">
        {loaded.status === "loading" ? "Loading settings…" : null}
        {loaded.status === "error" ? `Could not load settings: ${loaded.error}` : null}
      </div>
      {loaded.status === "error" ? (
        <button type="button" data-testid="retry-load" onClick={() => setAttempt(a => a + 1)}>
          retry
        </button>
      ) : null}
      {loaded.status === "ok" && loaded.value ? <SettingsForm initial={loaded.value} /> : null}
    </div>
  );
}

/** mounted once the settings have loaded: the draft starts from them and then belongs to the user */
function SettingsForm({ initial }: { initial: Settings }) {
  const [saved, setSaved] = useState<Settings>(initial);
  const [pending, setPending] = useState<Settings | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Settings>(initial);

  const len = draft.name.length;
  const nameProblem =
    draft.name.trim() === ""
      ? "Display name is required"
      : len > NAME_MAX
        ? `Display name must be at most ${NAME_MAX} characters, not ${len}`
        : null;

  const save = () => {
    if (nameProblem !== null) return;
    const toSave: Settings = { ...draft };
    setPending(toSave);
    setSaveError(null);
    saveSettings(toSave).then(
      answer => {
        setSaved(answer);
        setPending(null);
      },
      e => {
        setPending(null);
        setSaveError(`Save failed: ${errorMessage(e)}`);
      },
    );
  };

  const shownSaved = pending ?? saved;
  const savedLine = `Saved: ${shownSaved.name} · ${shownSaved.theme} · ${shownSaved.density}${pending ? " (saving…)" : ""}`;

  return (
    <form
      onSubmit={e => {
        e.preventDefault();
        save();
      }}
    >
      <p data-testid="saved" aria-live="polite">
        {savedLine}
      </p>
      {saveError !== null ? <p data-testid="save-error" role="alert">{saveError}</p> : null}

      <label>
        Display name
        <input
          data-testid="name"
          value={draft.name}
          onChange={e => {
            const name = e.target.value;
            setDraft(d => ({ ...d, name }));
          }}
        />
      </label>
      <span data-testid="name-count">{`${len}/${NAME_MAX}`}</span>
      {nameProblem !== null ? <p data-testid="name-error" role="alert">{nameProblem}</p> : null}

      <div role="group" aria-label="Theme">
        <button
          type="button"
          data-testid="theme-light"
          aria-pressed={draft.theme === "light"}
          onClick={() => setDraft(d => ({ ...d, theme: "light" }))}
        >
          Light
        </button>
        <button
          type="button"
          data-testid="theme-dark"
          aria-pressed={draft.theme === "dark"}
          onClick={() => setDraft(d => ({ ...d, theme: "dark" }))}
        >
          Dark
        </button>
      </div>

      <button
        type="button"
        data-testid="density-toggle"
        onClick={() => setDraft(d => ({ ...d, density: d.density === "compact" ? "comfortable" : "compact" }))}
      >
        Density
      </button>

      <p data-testid="preview">{`Preview: ${draft.theme} / ${draft.density}`}</p>

      <button type="submit" data-testid="save">
        Save
      </button>
    </form>
  );
}
