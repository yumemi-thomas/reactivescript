// The settings page: loads the settings, edits a draft of them, and saves the draft.

import { errMsg, h } from "./dom";
import { loadSettings, saveSettings } from "./api.js";
import type { Settings } from "./api.js";

const NAME_MAX = 20;

function nameProblem(name: string): string | null {
  if (name.trim() === "") return "Display name is required";
  if (name.length > NAME_MAX) return `Display name must be at most ${NAME_MAX} characters, not ${name.length}`;
  return null;
}

function describe(s: Settings): string {
  return `${s.name} · ${s.theme} · ${s.density}`;
}

export function mountSettings(container: HTMLElement): () => void {
  let saved: Settings | null = null;
  let draft: Settings | null = null;
  let savingAs: Settings | null = null;
  let saveErr: string | null = null;
  let loadState: { s: "loading" } | { s: "ok" } | { s: "err"; m: string } = { s: "loading" };
  let loadTok: object = {};
  let saveTok: object = {};

  const loadEl = h("p", { testid: "load", cls: "status" });
  const retryLoad = h("button", { testid: "retry-load", text: "retry", onclick: () => load() });
  const savedEl = h("p", { testid: "saved" });

  const nameInput = h("input", {
    testid: "name",
    type: "text",
    oninput: () => {
      if (draft) {
        draft.name = nameInput.value;
        draw();
      }
    },
  });
  const nameCount = h("span", { testid: "name-count" });
  const nameError = h("p", { testid: "name-error", cls: "error" });
  const themeLight = h("button", { testid: "theme-light", text: "Light", onclick: () => setTheme("light") });
  const themeDark = h("button", { testid: "theme-dark", text: "Dark", onclick: () => setTheme("dark") });
  const densityToggle = h("button", { testid: "density-toggle", onclick: () => toggleDensity() });
  const preview = h("p", { testid: "preview" });
  const saveBtn = h("button", { testid: "save", text: "Save", onclick: () => save() });
  const saveErrEl = h("p", { testid: "save-error", cls: "error" });
  const form = h(
    "div",
    { cls: "form", hidden: true },
    h("label", {}, "Display name ", nameInput),
    nameCount,
    nameError,
    h("div", { cls: "bar" }, themeLight, themeDark, densityToggle),
    preview,
    h("div", { cls: "bar" }, saveBtn),
    saveErrEl,
  );

  container.replaceChildren(h("div", { cls: "settings" }, loadEl, retryLoad, savedEl, form));

  function draw(): void {
    const ls = loadState;
    if (ls.s === "loading") {
      loadEl.textContent = "Loading settings…";
      retryLoad.hidden = true;
    } else if (ls.s === "err") {
      loadEl.textContent = `Could not load settings: ${ls.m}`;
      retryLoad.hidden = false;
    } else {
      loadEl.textContent = "";
      retryLoad.hidden = true;
    }

    form.hidden = draft === null;
    savedEl.textContent = savingAs
      ? `Saved: ${describe(savingAs)} (saving…)`
      : saved
        ? `Saved: ${describe(saved)}`
        : "";

    if (draft) {
      nameCount.textContent = `${draft.name.length}/${NAME_MAX}`;
      nameError.textContent = nameProblem(draft.name) ?? "";
      themeLight.setAttribute("aria-pressed", String(draft.theme === "light"));
      themeDark.setAttribute("aria-pressed", String(draft.theme === "dark"));
      densityToggle.textContent = `Density: ${draft.density}`;
      preview.textContent = `Preview: ${draft.theme} / ${draft.density}`;
    }
    saveErrEl.textContent = saveErr === null ? "" : `Save failed: ${saveErr}`;
  }

  function setTheme(t: Settings["theme"]): void {
    if (draft) {
      draft.theme = t;
      draw();
    }
  }

  function toggleDensity(): void {
    if (draft) {
      draft.density = draft.density === "compact" ? "comfortable" : "compact";
      draw();
    }
  }

  function load(): void {
    const tok = {};
    loadTok = tok;
    loadState = { s: "loading" };
    draw();
    loadSettings().then(
      (s) => {
        if (loadTok !== tok) return;
        saved = s;
        draft = { ...s };
        loadState = { s: "ok" };
        nameInput.value = s.name;
        draw();
      },
      (e: unknown) => {
        if (loadTok !== tok) return;
        loadState = { s: "err", m: errMsg(e) };
        draw();
      },
    );
  }

  function save(): void {
    if (draft === null || nameProblem(draft.name) !== null) return;
    const payload: Settings = { ...draft };
    const tok = {};
    saveTok = tok;
    savingAs = payload;
    saveErr = null;
    draw();
    saveSettings(payload).then(
      (s) => {
        if (saveTok !== tok) return;
        saved = s;
        savingAs = null;
        draw();
      },
      (e: unknown) => {
        if (saveTok !== tok) return;
        savingAs = null;
        saveErr = errMsg(e);
        draw();
      },
    );
  }

  load();
  return () => {
    // Late answers from a discarded page must not touch anything.
    loadTok = {};
    saveTok = {};
  };
}
