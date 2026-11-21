import { useEffect, useRef, useState } from "react";
import { loadSettings, saveSettings, type Settings } from "./api.js";
import { errMsg, nextSeq } from "./util";

const MAX_NAME = 20;

type Load = { attempt: number; status: "ok" } | { attempt: number; status: "error"; error: string };
type Save = { seq: number; values: Settings };

function nameError(name: string): string | null {
  if (name.length === 0) return "Display name is required";
  if (name.length > MAX_NAME) return `Display name must be at most ${MAX_NAME} characters, not ${name.length}`;
  return null;
}

const line = (s: Settings) => `Saved: ${s.name} · ${s.theme} · ${s.density}`;

export default function SettingsPage() {
  const [attempt, setAttempt] = useState(0);
  const [load, setLoad] = useState<Load | null>(null);
  const [saved, setSaved] = useState<{ seq: number; values: Settings } | null>(null);
  const [draft, setDraft] = useState<Settings | null>(null);
  const [saves, setSaves] = useState<Save[]>([]);
  const [saveError, setSaveError] = useState<{ seq: number; message: string } | null>(null);
  const latestSave = useRef(0);

  useEffect(() => {
    let live = true;
    loadSettings().then(
      s => {
        if (!live) return;
        setLoad({ attempt, status: "ok" });
        setSaved(prev => prev ?? { seq: 0, values: s });
        setDraft(prev => prev ?? s);
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

  function save() {
    if (draft === null || nameError(draft.name) !== null) return;
    const s: Save = { seq: nextSeq(), values: { ...draft } };
    latestSave.current = s.seq;
    setSaveError(null);
    setSaves(list => [...list, s]);
    saveSettings(s.values).then(
      answer => {
        setSaved(prev => (prev === null || prev.seq < s.seq ? { seq: s.seq, values: answer } : prev));
        setSaves(list => list.filter(x => x.seq !== s.seq));
      },
      (e: unknown) => {
        setSaves(list => list.filter(x => x.seq !== s.seq));
        // only report the failure if no newer save has been started since
        if (latestSave.current === s.seq) setSaveError({ seq: s.seq, message: errMsg(e) });
      },
    );
  }

  if (loading || load.status === "error" || draft === null || saved === null) {
    return (
      <section className="settings">
        <div data-testid="load">
          {loading ? (
            <p>Loading settings…</p>
          ) : load.status === "error" ? (
            <>
              <p className="error">{`Could not load settings: ${load.error}`}</p>
              <button type="button" data-testid="retry-load" onClick={() => setAttempt(a => a + 1)}>
                retry
              </button>
            </>
          ) : null}
        </div>
      </section>
    );
  }

  const inFlight = saves.length > 0 ? saves[saves.length - 1] : null;
  const err = nameError(draft.name);

  return (
    <section className="settings">
      <p data-testid="saved">{inFlight ? `${line(inFlight.values)} (saving…)` : line(saved.values)}</p>
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
            aria-invalid={err !== null}
            onChange={e => {
              const name = e.target.value;
              setDraft(d => (d ? { ...d, name } : d));
            }}
          />
        </label>{" "}
        <span data-testid="name-count">{`${draft.name.length}/${MAX_NAME}`}</span>
        {err !== null && (
          <p className="error" data-testid="name-error">
            {err}
          </p>
        )}
        <div>
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
          <button
            type="button"
            data-testid="density-toggle"
            onClick={() =>
              setDraft(d => (d ? { ...d, density: d.density === "compact" ? "comfortable" : "compact" } : d))
            }
          >
            {`density: ${draft.density}`}
          </button>
        </div>
        <p data-testid="preview">{`Preview: ${draft.theme} / ${draft.density}`}</p>
        <button type="submit" data-testid="save">
          save
        </button>
      </form>
      {saveError !== null && (
        <p className="error" role="alert" data-testid="save-error">
          {`Save failed: ${saveError.message}`}
        </p>
      )}
    </section>
  );
}
