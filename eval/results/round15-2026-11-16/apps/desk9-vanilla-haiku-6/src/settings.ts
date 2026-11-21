import { loadSettings, saveSettings } from "./api.js";
import type { Density, Settings, Theme } from "./api.js";
import { type Destroy, call, el, errMsg, fill } from "./shared";

const MAX_NAME = 20;

interface Draft {
  name: string;
  theme: Theme;
  density: Density;
}

type LoadState = { kind: "loading" } | { kind: "ok" } | { kind: "error"; message: string };

interface Form {
  name: HTMLInputElement;
  count: HTMLElement;
  nameError: HTMLElement;
  light: HTMLButtonElement;
  dark: HTMLButtonElement;
  density: HTMLButtonElement;
  preview: HTMLElement;
}

/** The settings page: loads the settings, edits a draft, saves it. */
export function mountSettings(container: HTMLElement): Destroy {
  let alive = true;
  let loadSeq = 0;
  let loadState: LoadState = { kind: "loading" };
  let saved: Settings | null = null;
  let draft: Draft = { name: "", theme: "light", density: "comfortable" };
  let form: Form | null = null;
  let pending: { seq: number; settings: Settings } | null = null;
  let saveSeq = 0;
  let appliedSeq = 0;
  let saveError: string | null = null;

  const loadEl = el("div", { testid: "load", cls: "d-status", attrs: { "aria-live": "polite" } });
  const savedEl = el("p", { testid: "saved", cls: "d-saved", attrs: { "aria-live": "polite" } });
  const formEl = el("div", { cls: "d-form" });
  const saveErrorEl = el("p", { testid: "save-error", cls: "d-error" });

  container.replaceChildren(el("div", { cls: "d-settings" }, loadEl, savedEl, formEl, saveErrorEl));

  function trimmedName(): string {
    return draft.name.trim();
  }

  /** The reason the name is invalid, or "" when it is valid. */
  function nameIssue(): string {
    const len = [...trimmedName()].length;
    if (len === 0) return "Display name is required";
    if (len > MAX_NAME) return `Display name must be at most ${MAX_NAME} characters, not ${len}`;
    return "";
  }

  function renderForm(): void {
    if (form === null) return;
    const f = form;
    f.count.textContent = `${[...trimmedName()].length}/${MAX_NAME}`;
    f.nameError.textContent = nameIssue();
    f.light.setAttribute("aria-pressed", String(draft.theme === "light"));
    f.dark.setAttribute("aria-pressed", String(draft.theme === "dark"));
    f.density.textContent = `Density: ${draft.density}`;
    f.preview.textContent = `Preview: ${draft.theme} / ${draft.density}`;
  }

  function buildForm(): void {
    const name = el("input", {
      testid: "name",
      value: draft.name,
      attrs: { "aria-label": "Display name", autocomplete: "off" },
      onInput: v => {
        draft.name = v;
        renderForm();
      },
    });
    const count = el("span", { testid: "name-count", cls: "d-count" });
    const nameError = el("p", { testid: "name-error", cls: "d-error" });
    const light = el(
      "button",
      {
        testid: "theme-light",
        cls: "d-chip",
        onClick: () => {
          draft.theme = "light";
          renderForm();
        },
      },
      "Light",
    );
    const dark = el(
      "button",
      {
        testid: "theme-dark",
        cls: "d-chip",
        onClick: () => {
          draft.theme = "dark";
          renderForm();
        },
      },
      "Dark",
    );
    const density = el(
      "button",
      {
        testid: "density-toggle",
        cls: "d-chip",
        onClick: () => {
          draft.density = draft.density === "comfortable" ? "compact" : "comfortable";
          renderForm();
        },
      },
      "Density",
    );
    const preview = el("p", { testid: "preview", cls: "d-preview" });
    const save = el("button", { testid: "save", cls: "d-primary", onClick: saveDraft }, "Save");

    form = { name, count, nameError, light, dark, density, preview };
    fill(
      formEl,
      el("label", { cls: "d-field" }, "Display name", name, " ", count),
      nameError,
      el("div", { cls: "d-actions" }, el("span", { cls: "d-label" }, "Theme"), light, dark),
      el("div", { cls: "d-actions" }, density),
      preview,
      el("div", { cls: "d-actions" }, save),
    );
  }

  function renderLoad(): void {
    if (loadState.kind === "loading") {
      fill(loadEl, "Loading settings…");
    } else if (loadState.kind === "error") {
      fill(
        loadEl,
        el("p", { cls: "d-error" }, `Could not load settings: ${loadState.message}`),
        el("button", { testid: "retry-load", cls: "d-small", onClick: load }, "Retry"),
      );
    } else {
      fill(loadEl);
    }
  }

  function renderSaved(): void {
    if (pending !== null) {
      const p = pending.settings;
      savedEl.textContent = `Saved: ${p.name} · ${p.theme} · ${p.density} (saving…)`;
    } else if (saved !== null) {
      savedEl.textContent = `Saved: ${saved.name} · ${saved.theme} · ${saved.density}`;
    } else {
      savedEl.textContent = "";
    }
  }

  function renderSaveError(): void {
    fill(saveErrorEl, saveError);
  }

  function load(): void {
    const my = ++loadSeq;
    loadState = { kind: "loading" };
    renderLoad();
    call(() => loadSettings()).then(
      s => {
        if (!alive || my !== loadSeq) return;
        saved = s;
        draft = { name: s.name, theme: s.theme, density: s.density };
        loadState = { kind: "ok" };
        renderLoad();
        if (form === null) buildForm();
        renderForm();
        renderSaved();
      },
      e => {
        if (!alive || my !== loadSeq) return;
        loadState = { kind: "error", message: errMsg(e) };
        renderLoad();
      },
    );
  }

  function saveDraft(): void {
    if (form === null) return;
    const name = trimmedName();
    if (nameIssue() !== "") return;
    const snapshot: Settings = { name, theme: draft.theme, density: draft.density };
    const seq = ++saveSeq;
    pending = { seq, settings: snapshot };
    saveError = null;
    renderSaved();
    renderSaveError();
    call(() => saveSettings(snapshot)).then(
      res => {
        if (!alive) return;
        if (seq > appliedSeq) {
          appliedSeq = seq;
          saved = res;
        }
        if (pending !== null && pending.seq === seq) pending = null;
        renderSaved();
      },
      e => {
        if (!alive) return;
        if (pending !== null && pending.seq === seq) pending = null;
        saveError = `Save failed: ${errMsg(e)}`;
        renderSaved();
        renderSaveError();
      },
    );
  }

  renderLoad();
  renderSaved();
  renderSaveError();
  load();

  return () => {
    alive = false;
  };
}
