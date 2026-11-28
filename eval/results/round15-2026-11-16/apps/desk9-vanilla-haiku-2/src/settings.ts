import { loadSettings, saveSettings } from "./api.js";
import type { Settings } from "./api.js";
import { el, errorMessage } from "./dom.js";
import type { PageHandle } from "./shell.js";

const MAX_NAME_LENGTH = 20;

/** The problem with a display name, or null when it is valid. */
export function nameProblem(name: string): string | null {
  const trimmed = name.trim();
  if (trimmed === "") return "Display name is required";
  if (trimmed.length > MAX_NAME_LENGTH) {
    return `Display name must be at most ${MAX_NAME_LENGTH} characters, not ${trimmed.length}`;
  }
  return null;
}

const summary = (s: Settings): string => `${s.name} · ${s.theme} · ${s.density}`;

/** The settings page: loads the settings, edits a draft of them, and saves it. */
export function mountSettingsPage(root: HTMLElement): PageHandle {
  let alive = true;
  let loadSeq = 0;
  let saveSeq = 0;
  /** The settings as last saved (or loaded). */
  let saved: Settings | null = null;
  /** The values of the save in the air, if any. */
  let saving: Settings | null = null;
  /** The user's draft; it is not changed by saving. */
  let draft: Settings | null = null;

  const loadMsg = el("p", { "data-testid": "load", role: "status" });
  const retryLoad = el("button", { type: "button", "data-testid": "retry-load" }, "Try again");
  const savedLine = el("p", { "data-testid": "saved", class: "saved" });

  const nameInput = el("input", { type: "text", "data-testid": "name", "aria-label": "Display name", autocomplete: "off" });
  const nameCount = el("span", { "data-testid": "name-count", class: "count" });
  const nameError = el("p", { "data-testid": "name-error", class: "error" });
  const themeLight = el("button", { type: "button", "data-testid": "theme-light" }, "Light");
  const themeDark = el("button", { type: "button", "data-testid": "theme-dark" }, "Dark");
  const densityToggle = el("button", { type: "button", "data-testid": "density-toggle" });
  const preview = el("p", { "data-testid": "preview", class: "preview" });
  const saveBtn = el("button", { type: "button", "data-testid": "save" }, "Save");
  const saveError = el("p", { "data-testid": "save-error", class: "error" });

  const form = el(
    "div",
    { class: "settings-form" },
    el("label", { class: "field" }, "Display name ", nameInput, nameCount),
    nameError,
    el("div", { class: "row" }, themeLight, themeDark, densityToggle),
    preview,
    el("div", { class: "row" }, saveBtn),
    saveError
  );
  form.hidden = true;

  function renderSaved(): void {
    if (!saved) {
      savedLine.textContent = "";
      return;
    }
    savedLine.textContent = saving ? `Saved: ${summary(saving)} (saving…)` : `Saved: ${summary(saved)}`;
  }

  function renderDraft(): void {
    if (!draft) return;
    nameCount.textContent = `${draft.name.trim().length}/${MAX_NAME_LENGTH}`;
    nameError.textContent = nameProblem(draft.name) ?? "";
    themeLight.setAttribute("aria-pressed", String(draft.theme === "light"));
    themeDark.setAttribute("aria-pressed", String(draft.theme === "dark"));
    densityToggle.textContent = `Density: ${draft.density}`;
    preview.textContent = `Preview: ${draft.theme} / ${draft.density}`;
  }

  function load(): void {
    const seq = ++loadSeq;
    loadMsg.textContent = "Loading settings…";
    retryLoad.hidden = true;
    loadSettings().then(
      settings => {
        if (!alive || seq !== loadSeq) return;
        saved = settings;
        draft = { ...settings };
        loadMsg.textContent = "";
        form.hidden = false;
        nameInput.value = settings.name;
        renderSaved();
        renderDraft();
      },
      e => {
        if (!alive || seq !== loadSeq) return;
        loadMsg.textContent = `Could not load settings: ${errorMessage(e)}`;
        retryLoad.hidden = false;
      }
    );
  }

  function save(): void {
    if (!draft || !saved || nameProblem(draft.name) !== null) return;
    // Key order matches the Settings type.
    const next: Settings = { name: draft.name.trim(), theme: draft.theme, density: draft.density };
    const seq = ++saveSeq;
    saving = next;
    saveError.textContent = "";
    renderSaved();
    saveSettings(next).then(
      result => {
        if (!alive) return;
        saved = result;
        if (seq === saveSeq) saving = null;
        renderSaved();
      },
      e => {
        if (!alive) return;
        if (seq === saveSeq) {
          saving = null;
          saveError.textContent = `Save failed: ${errorMessage(e)}`;
        }
        renderSaved();
      }
    );
  }

  nameInput.addEventListener("input", () => {
    if (!draft) return;
    draft.name = nameInput.value;
    renderDraft();
  });
  themeLight.addEventListener("click", () => {
    if (!draft) return;
    draft.theme = "light";
    renderDraft();
  });
  themeDark.addEventListener("click", () => {
    if (!draft) return;
    draft.theme = "dark";
    renderDraft();
  });
  densityToggle.addEventListener("click", () => {
    if (!draft) return;
    draft.density = draft.density === "compact" ? "comfortable" : "compact";
    renderDraft();
  });
  saveBtn.addEventListener("click", () => save());
  retryLoad.addEventListener("click", () => load());

  root.replaceChildren(
    el("section", { class: "page settings-page" }, loadMsg, retryLoad, savedLine, form)
  );
  load();

  return {
    destroy(): void {
      alive = false;
    },
  };
}
