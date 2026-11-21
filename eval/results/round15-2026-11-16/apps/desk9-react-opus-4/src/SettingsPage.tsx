import { useEffect, useRef, useState } from "react";
import { loadSettings, saveSettings } from "./api";
import type { Settings } from "./api";
import { errMsg, nextSeq } from "./util";

const MAX_NAME = 20;

type LoadState = { attempt: number; status: "ok" } | { attempt: number; status: "error"; error: string };
type Saved = { seq: number; settings: Settings };

function nameError(name: string): string | null {
  if (name.length === 0) return "Display name is required";
  if (name.length > MAX_NAME) return `Display name must be at most ${MAX_NAME} characters, not ${name.length}`;
  return null;
}

const line = (s: Settings) => `Saved: ${s.name} · ${s.theme} · ${s.density}`;

export default function SettingsPage() {
  const [attempt, setAttempt] = useState(0);
  const [load, setLoad] = useState<LoadState | null>(null);
  const [saved, setSaved] = useState<Saved | null>(null);
  const [saving, setSaving] = useState<Saved[]>([]);
  const lastSave = useRef(0);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Settings | null>(null);

  useEffect(() => {
    let live = true;
    loadSettings().then(
      settings => {
        if (!live) return;
        setLoad({ attempt, status: "ok" });
        setSaved(s => s ?? { seq: 0, settings });
        setDraft(d => d ?? settings);
      },
      (e: unknown) => {
        if (live) setLoad({ attempt, status: "error", error: errMsg(e) });
      },
    );
    return () => {
      live = false;
    };
  }, [attempt]);

  const loading = load === null || load.attempt !== attempt;

  if (draft === null || saved === null) {
    return (
      <div className="settings">
        <div data-testid="load" aria-live="polite">
          {loading || load?.status !== "error" ? (
            <p className="muted">Loading settings…</p>
          ) : (
            <>
              <p className="error" role="alert">{`Could not load settings: ${load.error}`}</p>
              <button type="button" data-testid="retry-load" onClick={() => setAttempt(a => a + 1)}>
                retry
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  const error = nameError(draft.name);
  // the newest save still in flight, if it is newer than what the server last confirmed
  const inFlight = saving.reduce<Saved | null>((a, s) => (s.seq > saved.seq && (!a || s.seq > a.seq) ? s : a), null);

  function save() {
    if (draft === null || nameError(draft.name) !== null) return;
    const seq = nextSeq();
    const settings = { ...draft };
    setSaveError(null);
    lastSave.current = seq;
    setSaving(s => [...s, { seq, settings }]);
    saveSettings(settings).then(
      answer => {
        setSaved(prev => (prev && prev.seq > seq ? prev : { seq, settings: answer }));
        setSaving(s => s.filter(x => x.seq !== seq));
      },
      (e: unknown) => {
        setSaving(s => s.filter(x => x.seq !== seq));
        // only the newest save's failure is news; an older one has been superseded
        if (lastSave.current === seq) setSaveError(`Save failed: ${errMsg(e)}`);
      },
    );
  }

  return (
    <div className={`settings theme-${draft.theme} density-${draft.density}`}>
      <p data-testid="saved" aria-live="polite">
        {inFlight ? `${line(inFlight.settings)} (saving…)` : line(saved.settings)}
      </p>
      {saveError !== null && (
        <p className="error" role="alert" data-testid="save-error">
          {saveError}
        </p>
      )}
      <form
        onSubmit={e => {
          e.preventDefault();
          save();
        }}
      >
        <label>
          Display name{" "}
          <input
            data-testid="name"
            value={draft.name}
            aria-invalid={error !== null}
            aria-describedby="name-count"
            onChange={e => {
              const name = e.target.value;
              setDraft(d => (d ? { ...d, name } : d));
            }}
          />
        </label>{" "}
        <span id="name-count" data-testid="name-count">{`${draft.name.length}/${MAX_NAME}`}</span>
        {error !== null && (
          <p className="error" data-testid="name-error">
            {error}
          </p>
        )}
        <div className="seg" role="group" aria-label="Theme">
          <button
            type="button"
            data-testid="theme-light"
            aria-pressed={draft.theme === "light"}
            onClick={() => setDraft(d => (d ? { ...d, theme: "light" } : d))}
          >
            light
          </button>
          <button
            type="button"
            data-testid="theme-dark"
            aria-pressed={draft.theme === "dark"}
            onClick={() => setDraft(d => (d ? { ...d, theme: "dark" } : d))}
          >
            dark
          </button>
        </div>
        <button
          type="button"
          data-testid="density-toggle"
          onClick={() =>
            setDraft(d => (d ? { ...d, density: d.density === "compact" ? "comfortable" : "compact" } : d))
          }
        >
          {`density: ${draft.density}`}
        </button>
        <p data-testid="preview">{`Preview: ${draft.theme} / ${draft.density}`}</p>
        <button type="submit" data-testid="save">
          save
        </button>
      </form>
    </div>
  );
}
