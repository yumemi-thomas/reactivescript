import { useRef, useState } from "react";
import { loadSettings, saveSettings, type Density, type Settings, type Theme } from "./api";
import { errorMessage, nextSeq, useAsync } from "./util";

const MAX_NAME = 20;
const load: (attempt: number) => Promise<Settings> = () => loadSettings();

const line = (s: Settings) => `Saved: ${s.name} · ${s.theme} · ${s.density}`;

export function SettingsPage() {
  const [attempt, setAttempt] = useState(0);
  const loaded = useAsync(load, 0, attempt);

  if (loaded.status === "ok") return <SettingsForm initial={loaded.data} />;
  return (
    <section className="settings">
      <div data-testid="load" aria-live="polite">
        {loaded.status === "loading" && <p className="muted">Loading settings…</p>}
        {loaded.status === "error" && (
          <>
            <p className="error" role="alert">
              Could not load settings: {loaded.message}
            </p>
            <button type="button" data-testid="retry-load" onClick={() => setAttempt(a => a + 1)}>
              retry
            </button>
          </>
        )}
      </div>
    </section>
  );
}

function nameError(name: string): string | null {
  const length = Array.from(name).length;
  if (name.trim() === "") return "Display name is required";
  if (length > MAX_NAME) return `Display name must be at most ${MAX_NAME} characters, not ${length}`;
  return null;
}

function SettingsForm({ initial }: { initial: Settings }) {
  const [draft, setDraft] = useState<Settings>(initial);
  const [saved, setSaved] = useState<{ opSeq: number; value: Settings }>({ opSeq: 0, value: initial });
  const [pending, setPending] = useState<{ seq: number; value: Settings }[]>([]);
  const [saveError, setSaveError] = useState<string | null>(null);
  const latestSave = useRef(0);

  const error = nameError(draft.name);
  const inFlight = pending.length > 0 ? pending[pending.length - 1] : null;

  function update(patch: Partial<Settings>) {
    setDraft(d => ({ ...d, ...patch }));
  }

  function save() {
    if (error !== null) return;
    const value: Settings = { name: draft.name, theme: draft.theme, density: draft.density };
    const seq = nextSeq();
    latestSave.current = seq;
    setSaveError(null);
    setPending(p => [...p, { seq, value }]);
    new Promise<Settings>(resolve => resolve(saveSettings(value))).then(
      answer => {
        setPending(p => p.filter(x => x.seq !== seq));
        setSaved(s => (seq > s.opSeq ? { opSeq: seq, value: answer } : s));
      },
      (e: unknown) => {
        setPending(p => p.filter(x => x.seq !== seq));
        if (latestSave.current === seq) setSaveError(errorMessage(e));
      },
    );
  }

  const setTheme = (theme: Theme) => update({ theme });
  const nextDensity: Density = draft.density === "compact" ? "comfortable" : "compact";

  return (
    <section className="settings">
      <p data-testid="saved" aria-live="polite">
        {inFlight ? `${line(inFlight.value)} (saving…)` : line(saved.value)}
      </p>
      <form
        className="form"
        onSubmit={e => {
          e.preventDefault();
          save();
        }}
        noValidate
      >
        <label className="field">
          <span>Display name</span>
          <input
            data-testid="name"
            value={draft.name}
            onChange={e => update({ name: e.target.value })}
            aria-invalid={error !== null}
            aria-describedby="name-count name-error"
          />
        </label>
        <span id="name-count" data-testid="name-count" className="muted">
          {`${Array.from(draft.name).length}/${MAX_NAME}`}
        </span>
        {error !== null && (
          <p id="name-error" className="error" data-testid="name-error" role="alert">
            {error}
          </p>
        )}
        <div className="segmented" role="group" aria-label="Theme">
          <button type="button" data-testid="theme-light" aria-pressed={draft.theme === "light"} onClick={() => setTheme("light")}>
            light
          </button>
          <button type="button" data-testid="theme-dark" aria-pressed={draft.theme === "dark"} onClick={() => setTheme("dark")}>
            dark
          </button>
        </div>
        <button type="button" data-testid="density-toggle" onClick={() => update({ density: nextDensity })}>
          {`density: ${draft.density}`}
        </button>
        <p data-testid="preview">{`Preview: ${draft.theme} / ${draft.density}`}</p>
        <button type="submit" data-testid="save">
          save
        </button>
        {saveError !== null && (
          <p className="error" data-testid="save-error" role="alert">
            Save failed: {saveError}
          </p>
        )}
      </form>
    </section>
  );
}
