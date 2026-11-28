import * as api from "./api.js";
import type { Density, Settings, Theme } from "./api.js";
import { button, errMsg, h, input, setText } from "./dom.js";
import type { Page } from "./dom.js";

const MAX = 20;

function savedLine(s: Settings): string {
  return `Saved: ${s.name} · ${s.theme} · ${s.density}`;
}

export function settingsPage(): Page {
  let alive = true;
  let loadTok = 0;
  let saveSeq = 0;
  let saved: Settings | null = null;
  let savedSeq = 0;
  const pending: { n: number; s: Settings }[] = [];
  let saveError = "";
  const draft: Settings = { name: "", theme: "light", density: "comfortable" };

  const loadEl = h("div", { testid: "load", cls: "load" });
  const el = h("section", { cls: "page settings" }, loadEl);

  // form elements, built once loaded
  let form: {
    root: HTMLElement;
    saved: HTMLElement;
    name: HTMLInputElement;
    count: HTMLElement;
    nameError: HTMLElement;
    light: HTMLButtonElement;
    dark: HTMLButtonElement;
    density: HTMLButtonElement;
    preview: HTMLElement;
    saveError: HTMLElement;
  } | null = null;

  function nameError(): string {
    const n = draft.name.length;
    if (n === 0) return "Display name is required";
    if (n > MAX) return `Display name must be at most ${MAX} characters, not ${n}`;
    return "";
  }

  function load(): void {
    const tok = ++loadTok;
    loadEl.hidden = false;
    loadEl.replaceChildren(h("p", { cls: "muted", text: "Loading settings…" }));
    api.loadSettings().then(
      s => {
        if (!alive || tok !== loadTok) return;
        saved = { name: s.name, theme: s.theme, density: s.density };
        draft.name = s.name;
        draft.theme = s.theme;
        draft.density = s.density;
        loadEl.replaceChildren();
        loadEl.hidden = true;
        buildForm();
        render();
      },
      e => {
        if (!alive || tok !== loadTok) return;
        loadEl.replaceChildren(
          h("p", { cls: "error", text: `Could not load settings: ${errMsg(e)}` }),
          button("retry-load", "retry", () => load()),
        );
      },
    );
  }

  function setTheme(t: Theme): void {
    draft.theme = t;
    render();
  }

  function toggleDensity(): void {
    const d: Density = draft.density === "comfortable" ? "compact" : "comfortable";
    draft.density = d;
    render();
  }

  function save(): void {
    if (nameError()) return;
    const s: Settings = { name: draft.name, theme: draft.theme, density: draft.density };
    const n = ++saveSeq;
    pending.push({ n, s });
    saveError = "";
    render();
    api.saveSettings({ ...s }).then(
      res => {
        if (!alive) return;
        remove(n);
        if (n > savedSeq) {
          savedSeq = n;
          saved = res && typeof res.name === "string" ? { name: res.name, theme: res.theme, density: res.density } : s;
        }
        render();
      },
      e => {
        if (!alive) return;
        remove(n);
        // Only the latest save's failure is news; an older one is superseded.
        if (n === saveSeq) saveError = `Save failed: ${errMsg(e)}`;
        render();
      },
    );
  }

  function remove(n: number): void {
    const i = pending.findIndex(p => p.n === n);
    if (i >= 0) pending.splice(i, 1);
  }

  function buildForm(): void {
    const savedEl = h("div", { testid: "saved", cls: "saved", attrs: { "aria-live": "polite" } });
    const name = input("name", draft.name, "Display name");
    name.addEventListener("input", () => {
      draft.name = name.value;
      render();
    });
    const count = h("span", { testid: "name-count", cls: "muted" });
    const nameErr = h("div", { testid: "name-error", cls: "error", attrs: { role: "alert" } });
    const light = button("theme-light", "light", () => setTheme("light"));
    const dark = button("theme-dark", "dark", () => setTheme("dark"));
    const density = button("density-toggle", "", () => toggleDensity());
    const preview = h("div", { testid: "preview", cls: "preview" });
    const saveErr = h("div", { testid: "save-error", cls: "error", attrs: { role: "alert" } });
    const root = h(
      "div",
      { cls: "settings-form" },
      savedEl,
      h("label", { cls: "field" }, "Display name ", name, " ", count),
      nameErr,
      h("div", { cls: "actions", attrs: { role: "group", "aria-label": "Theme" } }, "Theme ", light, dark),
      h("div", { cls: "actions" }, "Density ", density),
      preview,
      h("div", { cls: "actions" }, button("save", "save", () => save())),
      saveErr,
    );
    form = { root, saved: savedEl, name, count, nameError: nameErr, light, dark, density, preview, saveError: saveErr };
    el.append(root);
  }

  function render(): void {
    if (!alive || !form) return;
    const latest = pending.length ? pending.reduce((a, b) => (b.n > a.n ? b : a)) : null;
    if (latest) setText(form.saved, `${savedLine(latest.s)} (saving…)`);
    else if (saved) setText(form.saved, savedLine(saved));
    setText(form.count, `${draft.name.length}/${MAX}`);
    const err = nameError();
    setText(form.nameError, err);
    form.nameError.hidden = !err;
    form.name.setAttribute("aria-invalid", String(!!err));
    form.light.setAttribute("aria-pressed", String(draft.theme === "light"));
    form.dark.setAttribute("aria-pressed", String(draft.theme === "dark"));
    setText(form.density, draft.density);
    setText(form.preview, `Preview: ${draft.theme} / ${draft.density}`);
    setText(form.saveError, saveError);
    form.saveError.hidden = !saveError;
  }

  load();

  return {
    el,
    dispose() {
      alive = false;
    },
  };
}
