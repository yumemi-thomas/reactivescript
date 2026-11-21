import { useEffect, useRef, useState } from "react";
import * as api from "./api.js";
import type { Settings } from "./api.js";
import { errorMessage, nextId } from "./util";

const MAX = 20;

type LoadState = { status: "loading" } | { status: "error"; error: string } | { status: "ok" };

function line(s: Settings): string {
  return `Saved: ${s.name} · ${s.theme} · ${s.density}`;
}

export function SettingsPage() {
  const [load, setLoad] = useState<LoadState>({ status: "loading" });
  const [saved, setSaved] = useState<{ settings: Settings; seq: number } | null>(null);
  const [draft, setDraft] = useState<Settings | null>(null);
  const [saving, setSaving] = useState<{ seq: number; settings: Settings }[]>([]);
  const [saveError, setSaveError] = useState<string | null>(null);
  const loadSeq = useRef(0);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    let live = true;
    loadSeq.current += 1;
    const seq = loadSeq.current;
    api.loadSettings().then(
      s => {
        if (!live || loadSeq.current !== seq) return;
        setLoad({ status: "ok" });
        setSaved({ settings: s, seq: 0 });
        setDraft(s);
      },
      (e: unknown) => {
        if (live && loadSeq.current === seq) setLoad({ status: "error", error: errorMessage(e) });
      },
    );
    return () => {
      live = false;
    };
  }, []);

  function retryLoad() {
    loadSeq.current += 1;
    const seq = loadSeq.current;
    setLoad({ status: "loading" });
    api.loadSettings().then(
      s => {
        if (!mounted.current || loadSeq.current !== seq) return;
        setLoad({ status: "ok" });
        setSaved({ settings: s, seq: 0 });
        setDraft(s);
      },
      (e: unknown) => {
        if (mounted.current && loadSeq.current === seq) setLoad({ status: "error", error: errorMessage(e) });
      },
    );
  }

  const nameLength = draft?.name.length ?? 0;
  let nameError: string | null = null;
  if (draft !== null) {
    if (draft.name.trim() === "") nameError = "Display name is required";
    else if (nameLength > MAX) nameError = `Display name must be at most ${MAX} characters, not ${nameLength}`;
  }

  function save() {
    if (draft === null || nameError !== null) return;
    const seq = nextId();
    const settings = draft;
    setSaveError(null);
    setSaving(list => [...list, { seq, settings }]);
    api.saveSettings(settings).then(
      answer => {
        setSaved(prev => (prev === null || prev.seq < seq ? { settings: answer, seq } : prev));
        setSaving(list => list.filter(p => p.seq !== seq));
      },
      (e: unknown) => {
        setSaving(list => list.filter(p => p.seq !== seq));
        setSaveError(`Save failed: ${errorMessage(e)}`);
      },
    );
  }

  const latestSaving = saving.length > 0 ? saving[saving.length - 1] : null;

  return (
    <div className="panel">
      {load.status !== "ok" && (
        <div data-testid="load">
          {load.status === "loading" && <p className="muted">Loading settings…</p>}
          {load.status === "error" && (
            <>
              <p className="error">Could not load settings: {load.error}</p>
              <button data-testid="retry-load" onClick={retryLoad}>
                retry
              </button>
            </>
          )}
        </div>
      )}
      {saved !== null && (
        <p data-testid="saved">
          {latestSaving !== null ? `${line(latestSaving.settings)} (saving…)` : line(saved.settings)}
        </p>
      )}
      {draft !== null && (
        <form
          onSubmit={e => {
            e.preventDefault();
            save();
          }}
        >
          <div className="field">
            <label htmlFor="name">Display name</label>
            <input
              id="name"
              data-testid="name"
              value={draft.name}
              aria-invalid={nameError !== null}
              onChange={e => {
                const name = e.target.value;
                setDraft(d => (d === null ? d : { ...d, name }));
              }}
            />
            <span data-testid="name-count" className="muted">{`${nameLength}/${MAX}`}</span>
          </div>
          {nameError !== null && (
            <p data-testid="name-error" className="error">
              {nameError}
            </p>
          )}
          <div className="field">
            <span>Theme</span>
            <button
              type="button"
              data-testid="theme-light"
              aria-pressed={draft.theme === "light"}
              onClick={() => setDraft(d => (d === null ? d : { ...d, theme: "light" }))}
            >
              light
            </button>
            <button
              type="button"
              data-testid="theme-dark"
              aria-pressed={draft.theme === "dark"}
              onClick={() => setDraft(d => (d === null ? d : { ...d, theme: "dark" }))}
            >
              dark
            </button>
          </div>
          <div className="field">
            <span>Density</span>
            <button
              type="button"
              data-testid="density-toggle"
              onClick={() =>
                setDraft(d =>
                  d === null ? d : { ...d, density: d.density === "comfortable" ? "compact" : "comfortable" },
                )
              }
            >
              {draft.density}
            </button>
          </div>
          <p data-testid="preview">{`Preview: ${draft.theme} / ${draft.density}`}</p>
          <button type="submit" data-testid="save">
            save
          </button>
          {saveError !== null && (
            <p data-testid="save-error" className="error" role="alert">
              {saveError}
            </p>
          )}
        </form>
      )}
    </div>
  );
}
