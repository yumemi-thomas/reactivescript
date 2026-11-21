import * as api from "./api.js";
import type { Settings } from "./api.js";
import { errMsg, h, Page, setMsg, tick } from "./dom.js";

const MAX = 20;
const line = (s: Settings) => `Saved: ${s.name} · ${s.theme} · ${s.density}`;

export function settingsPage(): Page {
  let alive = true;
  let loadToken = 0;
  let confirmed: { s: Settings; start: number } | null = null;
  let pending: { seq: number; s: Settings }[] = [];
  let saveError: string | null = null;
  let draft: Settings | null = null;

  const loadEl = h("div", { testid: "load", class: "status", role: "status" });
  const formHost = h("div", { class: "settings-form" });
  const el = h("div", { class: "settings" }, loadEl, formHost);

  let nodes: {
    saved: HTMLElement; name: HTMLInputElement; count: HTMLElement; nameErr: HTMLElement;
    light: HTMLButtonElement; dark: HTMLButtonElement; density: HTMLButtonElement;
    preview: HTMLElement; saveErr: HTMLElement;
  } | null = null;

  function load(): void {
    const token = ++loadToken;
    const start = tick();
    loadEl.hidden = false;
    loadEl.replaceChildren("Loading settings…");
    api.loadSettings().then(
      s => {
        if (!alive || token !== loadToken) return;
        confirmed = { s, start };
        draft = { ...s };
        loadEl.hidden = true;
        loadEl.replaceChildren();
        buildForm();
        render();
      },
      e => {
        if (!alive || token !== loadToken) return;
        const retry = h("button", { testid: "retry-load", type: "button" }, "retry");
        retry.addEventListener("click", load);
        loadEl.replaceChildren(`Could not load settings: ${errMsg(e)} `, retry);
      },
    );
  }

  function nameError(name: string): string | null {
    if (name.trim().length === 0) return "Display name is required";
    if (name.length > MAX) return `Display name must be at most ${MAX} characters, not ${name.length}`;
    return null;
  }

  function buildForm(): void {
    const saved = h("div", { testid: "saved", class: "saved", role: "status" });
    const name = h("input", { testid: "name", type: "text", "aria-label": "Display name" });
    const count = h("span", { testid: "name-count", class: "count" });
    const nameErr = h("div", { testid: "name-error", class: "error", role: "alert" });
    const light = h("button", { testid: "theme-light", type: "button" }, "light");
    const dark = h("button", { testid: "theme-dark", type: "button" }, "dark");
    const density = h("button", { testid: "density-toggle", type: "button" });
    const preview = h("div", { testid: "preview", class: "preview" });
    const save = h("button", { testid: "save", type: "button" }, "save");
    const saveErr = h("div", { testid: "save-error", class: "error", role: "alert" });
    name.value = draft?.name ?? "";
    name.addEventListener("input", () => { if (draft) { draft.name = name.value; render(); } });
    light.addEventListener("click", () => { if (draft) { draft.theme = "light"; render(); } });
    dark.addEventListener("click", () => { if (draft) { draft.theme = "dark"; render(); } });
    density.addEventListener("click", () => {
      if (draft) { draft.density = draft.density === "compact" ? "comfortable" : "compact"; render(); }
    });
    save.addEventListener("click", doSave);
    nodes = { saved, name, count, nameErr, light, dark, density, preview, saveErr };
    formHost.replaceChildren(
      saved,
      h("label", {}, "Display name ", name), count, nameErr,
      h("div", { class: "row", role: "group", "aria-label": "Theme" }, light, dark),
      h("div", { class: "row" }, density),
      preview,
      save, saveErr,
    );
  }

  function doSave(): void {
    if (!draft || nameError(draft.name)) return;
    const s: Settings = { ...draft };
    const seq = tick();
    pending.push({ seq, s });
    saveError = null;
    render();
    api.saveSettings(s).then(
      res => {
        if (!alive) return;
        pending = pending.filter(p => p.seq !== seq);
        if (!confirmed || confirmed.start < seq) confirmed = { s: res ?? s, start: seq };
        render();
      },
      e => {
        if (!alive) return;
        pending = pending.filter(p => p.seq !== seq);
        saveError = `Save failed: ${errMsg(e)}`;
        render();
      },
    );
  }

  function render(): void {
    if (!nodes || !draft) return;
    const last = pending[pending.length - 1];
    nodes.saved.textContent = last ? `${line(last.s)} (saving…)` : confirmed ? line(confirmed.s) : "";
    nodes.count.textContent = `${draft.name.length}/${MAX}`;
    setMsg(nodes.nameErr, nameError(draft.name));
    nodes.light.setAttribute("aria-pressed", String(draft.theme === "light"));
    nodes.dark.setAttribute("aria-pressed", String(draft.theme === "dark"));
    nodes.density.textContent = `density: ${draft.density}`;
    nodes.preview.textContent = `Preview: ${draft.theme} / ${draft.density}`;
    setMsg(nodes.saveErr, saveError);
  }

  load();
  return { el, dispose() { alive = false; } };
}
