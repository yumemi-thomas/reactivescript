import * as api from "./api.js";
import type { Density, Settings, Theme } from "./api.js";
import type { Page } from "./app.js";
import { errorMessage, h, nextSeq, setMessage, textInput } from "./dom.js";

const MAX_NAME = 20;
const fmt = (s: Settings): string => `Saved: ${s.name} · ${s.theme} · ${s.density}`;

export function settingsPage(): Page {
  let alive = true;
  let loadSeq = 0;
  let confirmed: { seq: number; value: Settings } | null = null;
  const pending: { seq: number; value: Settings }[] = [];
  let lastSaveSeq = 0;
  let saveError: string | null = null;
  let draft: Settings = { name: "", theme: "light", density: "comfortable" };

  const loadEl = h("div", { testid: "load", attrs: { "aria-live": "polite" } });
  const body = h("div", { cls: "settings-body" });
  const el = h("div", { cls: "settings" }, loadEl, body);

  const saved = h("p", { testid: "saved", cls: "saved", attrs: { "aria-live": "polite" } });
  const nameInput = textInput("name", "Display name");
  const nameCount = h("span", { testid: "name-count", cls: "muted" });
  const nameError = h("p", { testid: "name-error", cls: "error" });
  const themeLight = h("button", { testid: "theme-light", text: "light" });
  const themeDark = h("button", { testid: "theme-dark", text: "dark" });
  const densityToggle = h("button", { testid: "density-toggle" });
  const preview = h("p", { testid: "preview", cls: "preview" });
  const saveBtn = h("button", { testid: "save", cls: "primary", text: "save" });
  const saveErrorEl = h("p", { testid: "save-error", cls: "error", attrs: { role: "alert" } });

  const nameLength = (): number => [...draft.name].length;
  const nameProblem = (): string | null => {
    if (draft.name.trim() === "") return "Display name is required";
    const n = nameLength();
    if (n > MAX_NAME) return `Display name must be at most ${MAX_NAME} characters, not ${n}`;
    return null;
  };

  function renderSaved(): void {
    let newest: { seq: number; value: Settings } | null = null;
    for (const p of pending) if (!newest || p.seq > newest.seq) newest = p;
    if (newest && (!confirmed || newest.seq > confirmed.seq)) saved.textContent = `${fmt(newest.value)} (saving…)`;
    else if (confirmed) saved.textContent = fmt(confirmed.value);
    setMessage(saveErrorEl, saveError ? `Save failed: ${saveError}` : null);
  }

  function renderDraft(): void {
    nameCount.textContent = `${nameLength()}/${MAX_NAME}`;
    const problem = nameProblem();
    setMessage(nameError, problem);
    nameInput.setAttribute("aria-invalid", String(problem !== null));
    themeLight.setAttribute("aria-pressed", String(draft.theme === "light"));
    themeDark.setAttribute("aria-pressed", String(draft.theme === "dark"));
    densityToggle.textContent = `density: ${draft.density}`;
    preview.textContent = `Preview: ${draft.theme} / ${draft.density}`;
  }

  function load(): void {
    const seq = nextSeq();
    loadSeq = seq;
    loadEl.replaceChildren(h("p", { cls: "muted", text: "Loading settings…" }));
    api.loadSettings().then(
      s => {
        if (!alive || seq !== loadSeq) return;
        confirmed = { seq, value: s };
        draft = { ...s };
        nameInput.value = s.name;
        loadEl.replaceChildren();
        loadEl.hidden = true;
        body.replaceChildren(
          saved,
          h(
            "div",
            { cls: "form" },
            h("label", { cls: "field" }, "Display name ", nameInput, " ", nameCount),
            nameError,
            h("div", { cls: "segmented", attrs: { role: "group", "aria-label": "Theme" } }, themeLight, themeDark),
            densityToggle,
            preview,
            saveBtn,
            saveErrorEl,
          ),
        );
        renderDraft();
        renderSaved();
      },
      e => {
        if (!alive || seq !== loadSeq) return;
        loadEl.replaceChildren(
          h("p", { cls: "error", text: `Could not load settings: ${errorMessage(e)}` }),
          h("button", { testid: "retry-load", text: "retry", onClick: load }),
        );
      },
    );
  }

  function save(): void {
    if (!confirmed || nameProblem() !== null) return;
    const value: Settings = { ...draft };
    const op = { seq: nextSeq(), value };
    pending.push(op);
    lastSaveSeq = op.seq;
    saveError = null;
    renderSaved();
    api.saveSettings(value).then(
      s => {
        pending.splice(pending.indexOf(op), 1);
        if (!confirmed || op.seq > confirmed.seq) confirmed = { seq: op.seq, value: s };
        if (alive) renderSaved();
      },
      e => {
        pending.splice(pending.indexOf(op), 1);
        if (op.seq === lastSaveSeq) saveError = errorMessage(e);
        if (alive) renderSaved();
      },
    );
  }

  nameInput.addEventListener("input", () => {
    draft.name = nameInput.value;
    renderDraft();
  });
  const setTheme = (t: Theme): void => {
    draft.theme = t;
    renderDraft();
  };
  themeLight.addEventListener("click", () => setTheme("light"));
  themeDark.addEventListener("click", () => setTheme("dark"));
  densityToggle.addEventListener("click", () => {
    const next: Density = draft.density === "comfortable" ? "compact" : "comfortable";
    draft.density = next;
    renderDraft();
  });
  saveBtn.addEventListener("click", save);
  saveErrorEl.hidden = true;

  load();

  return {
    el,
    refresh() {},
    dispose() {
      alive = false;
    },
  };
}
