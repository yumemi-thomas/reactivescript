import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { loadSettings, saveSettings } from "./api";
import type { Settings } from "./api";
import { errorMessage } from "./desk";

const MAX_NAME = 20;

function describe(s: Settings): string {
  return `${s.name} · ${s.theme} · ${s.density}`;
}

export function SettingsPage() {
  const settings = useQuery<Settings>({
    queryKey: ["settings"],
    queryFn: () => loadSettings(),
  });

  const loading = settings.isPending || (settings.isError && settings.isFetching);

  return (
    <div style={{ display: "grid", gap: 16, maxWidth: 480 }}>
      {loading && <p data-testid="load">Loading settings…</p>}
      {!loading && settings.isError && (
        <div>
          <p data-testid="load">{`Could not load settings: ${errorMessage(settings.error)}`}</p>
          <button type="button" data-testid="retry-load" onClick={() => void settings.refetch()}>
            retry
          </button>
        </div>
      )}
      {settings.data && <SettingsForm initial={settings.data} />}
    </div>
  );
}

function SettingsForm({ initial }: { initial: Settings }) {
  // The saved settings, and the values of a save in flight (if any).
  const [saved, setSaved] = useState<Settings>(initial);
  const [pending, setPending] = useState<Settings | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  // The draft belongs to the user from here on; saving never changes it.
  const [draft, setDraft] = useState<Settings>(initial);

  const length = draft.name.length;
  let nameProblem: string | null = null;
  if (draft.name.trim() === "") {
    nameProblem = "Display name is required";
  } else if (length > MAX_NAME) {
    nameProblem = `Display name must be at most ${MAX_NAME} characters, not ${length}`;
  }

  const onSave = () => {
    if (nameProblem !== null) return;
    const value = draft;
    setSaveError(null);
    setPending(value);
    saveSettings(value).then(
      (answer) => {
        setSaved(answer);
        setPending(null);
      },
      (e: unknown) => {
        setPending(null);
        setSaveError(`Save failed: ${errorMessage(e)}`);
      },
    );
  };

  return (
    <>
      <p data-testid="saved">
        {pending
          ? `Saved: ${describe(pending)} (saving…)`
          : `Saved: ${describe(saved)}`}
      </p>

      <div style={{ display: "grid", gap: 8 }}>
        <label style={{ display: "grid", gap: 4 }}>
          Display name
          <input
            data-testid="name"
            value={draft.name}
            onChange={(e) => {
              const name = e.target.value;
              setDraft((d) => ({ ...d, name }));
            }}
          />
        </label>
        <span data-testid="name-count">{`${length}/${MAX_NAME}`}</span>
        {nameProblem !== null && (
          <p data-testid="name-error" role="alert">{nameProblem}</p>
        )}
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button
          type="button"
          data-testid="theme-light"
          aria-pressed={draft.theme === "light"}
          onClick={() => setDraft((d) => ({ ...d, theme: "light" }))}
        >
          light
        </button>
        <button
          type="button"
          data-testid="theme-dark"
          aria-pressed={draft.theme === "dark"}
          onClick={() => setDraft((d) => ({ ...d, theme: "dark" }))}
        >
          dark
        </button>
        <button
          type="button"
          data-testid="density-toggle"
          onClick={() =>
            setDraft((d) => ({
              ...d,
              density: d.density === "compact" ? "comfortable" : "compact",
            }))
          }
        >
          {`density: ${draft.density}`}
        </button>
      </div>

      <p data-testid="preview">{`Preview: ${draft.theme} / ${draft.density}`}</p>

      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <button type="button" data-testid="save" onClick={onSave}>
          save
        </button>
        {saveError && <p data-testid="save-error" role="alert">{saveError}</p>}
      </div>
    </>
  );
}
