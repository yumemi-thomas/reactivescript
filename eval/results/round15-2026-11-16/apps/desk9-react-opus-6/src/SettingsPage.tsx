import { useEffect, useRef, useState } from "react";
import { loadSettings, saveSettings } from "./api.js";
import type { Settings } from "./api.js";
import { errorMessage } from "./util";

const MAX_NAME = 20;

type LoadState = { attempt: number; status: "ok" } | { attempt: number; status: "error"; message: string };

function nameError(name: string): string | null {
  if (name.trim().length === 0) return "Display name is required";
  if (name.length > MAX_NAME) return `Display name must be at most ${MAX_NAME} characters, not ${name.length}`;
  return null;
}

const line = (s: Settings) => `Saved: ${s.name} · ${s.theme} · ${s.density}`;

export default function SettingsPage() {
  const [attempt, setAttempt] = useState(0);
  const [load, setLoad] = useState<LoadState | null>(null);
  const [saved, setSaved] = useState<Settings | null>(null);
  const [draft, setDraft] = useState<Settings | null>(null);
  const [saving, setSaving] = useState<{ seq: number; settings: Settings }[]>([]);
  const [saveError, setSaveError] = useState<string | null>(null);
  const seqRef = useRef(0);
  const confirmedRef = useRef(0);

  useEffect(() => {
    let alive = true;
    loadSettings().then(
      s => {
        if (!alive) return;
        setLoad({ attempt, status: "ok" });
        setSaved(prev => prev ?? s);
        setDraft(prev => prev ?? s);
      },
      e => {
        if (alive) setLoad({ attempt, status: "error", message: errorMessage(e) });
      },
    );
    return () => {
      alive = false;
    };
  }, [attempt]);

  const currentLoad = load !== null && load.attempt === attempt ? load : null;
  const loaded = saved !== null && draft !== null;

  if (!loaded) {
    return (
      <div data-testid="load" aria-live="polite">
        {currentLoad?.status === "error" ? (
          <>
            <p className="error">Could not load settings: {currentLoad.message}</p>
            <button type="button" data-testid="retry-load" onClick={() => setAttempt(a => a + 1)}>
              retry
            </button>
          </>
        ) : (
          <p className="muted">Loading settings…</p>
        )}
      </div>
    );
  }

  const error = nameError(draft.name);
  const inFlight = saving.length > 0 ? saving[saving.length - 1].settings : null;

  const onSave = () => {
    if (error !== null) return;
    const seq = ++seqRef.current;
    const settings = draft;
    setSaveError(null);
    setSaving(p => [...p, { seq, settings }]);
    saveSettings(settings).then(
      res => {
        setSaving(p => p.filter(x => x.seq !== seq));
        // A later save that already answered is newer than this one.
        if (seq > confirmedRef.current) {
          confirmedRef.current = seq;
          setSaved(res);
        }
      },
      e => {
        setSaving(p => p.filter(x => x.seq !== seq));
        if (seq === seqRef.current) setSaveError(`Save failed: ${errorMessage(e)}`);
      },
    );
  };

  return (
    <form
      onSubmit={e => {
        e.preventDefault();
        onSave();
      }}
    >
      <p data-testid="saved">{inFlight ? `${line(inFlight)} (saving…)` : line(saved)}</p>
      <div className="inline">
        <label htmlFor="settings-name">Display name</label>
        <input
          id="settings-name"
          data-testid="name"
          value={draft.name}
          aria-invalid={error !== null}
          onChange={e => setDraft({ ...draft, name: e.target.value })}
        />
        <span data-testid="name-count" className={error ? "error" : "muted"}>
          {draft.name.length}/{MAX_NAME}
        </span>
      </div>
      {error !== null && (
        <p className="error" data-testid="name-error">
          {error}
        </p>
      )}
      <div className="inline">
        <span>Theme</span>
        <button
          type="button"
          data-testid="theme-light"
          aria-pressed={draft.theme === "light"}
          onClick={() => setDraft({ ...draft, theme: "light" })}
        >
          light
        </button>
        <button
          type="button"
          data-testid="theme-dark"
          aria-pressed={draft.theme === "dark"}
          onClick={() => setDraft({ ...draft, theme: "dark" })}
        >
          dark
        </button>
        <button
          type="button"
          data-testid="density-toggle"
          onClick={() => setDraft({ ...draft, density: draft.density === "compact" ? "comfortable" : "compact" })}
        >
          density: {draft.density}
        </button>
      </div>
      <p data-testid="preview">
        Preview: {draft.theme} / {draft.density}
      </p>
      <button type="submit" data-testid="save">
        save
      </button>
      {saveError !== null && (
        <p className="error" role="alert" data-testid="save-error">
          {saveError}
        </p>
      )}
    </form>
  );
}
