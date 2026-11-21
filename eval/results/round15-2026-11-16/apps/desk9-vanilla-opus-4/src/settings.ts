import { loadSettings, saveSettings, type Settings } from "./api.js";
import { h, fill, button, input, message } from "./dom";

const MAX_NAME = 20;
const chars = (s: string) => Array.from(s).length;

function nameError(name: string): string | null {
  if (name.trim() === "") return "Display name is required";
  const n = chars(name);
  if (n > MAX_NAME) return `Display name must be at most ${MAX_NAME} characters, not ${n}`;
  return null;
}

const line = (s: Settings) => `Saved: ${s.name} · ${s.theme} · ${s.density}`;

export function mountSettings(root: HTMLElement): () => void {
  let alive = true;
  let loadToken = 0;

  const load = h("div", { testid: "load", "aria-live": "polite" });
  const body = h("div", {});
  root.append(h("h2", {}, "Settings"), load, body);

  function startLoad(): void {
    const token = ++loadToken;
    fill(load, h("p", { role: "status" }, "Loading settings…"));
    fill(body);
    loadSettings().then(
      s => {
        if (!alive || token !== loadToken) return;
        fill(load);
        load.hidden = true;
        showForm(s);
      },
      err => {
        if (!alive || token !== loadToken) return;
        fill(load,
          h("p", { role: "alert" }, `Could not load settings: ${message(err)}`),
          button("retry-load", "retry", startLoad));
      },
    );
  }

  function showForm(loaded: Settings): void {
    let saved: Settings = { ...loaded };
    let savedSeq = -1;
    let seq = 0;
    const pending: { seq: number; value: Settings }[] = [];
    let saveError: string | null = null;
    const draft: Settings = { ...loaded };

    const savedEl = h("p", { testid: "saved", "aria-live": "polite" });
    const nameInput = input("name", "Display name", draft.name);
    const count = h("span", { testid: "name-count" });
    const nameErr = h("p", { testid: "name-error", role: "alert" });
    const light = button("theme-light", "Light", () => { draft.theme = "light"; render(); });
    const dark = button("theme-dark", "Dark", () => { draft.theme = "dark"; render(); });
    const density = button("density-toggle", "Toggle density", () => {
      draft.density = draft.density === "compact" ? "comfortable" : "compact";
      render();
    });
    const preview = h("p", { testid: "preview" });
    const save = button("save", "Save", doSave);
    const saveErr = h("p", { testid: "save-error", role: "alert" });

    nameInput.addEventListener("input", () => { draft.name = nameInput.value; render(); });
    const form = h("form", { "aria-label": "Settings" },
      h("label", {}, "Display name ", nameInput), " ", count, nameErr,
      h("div", { role: "group", "aria-label": "Theme" }, light, " ", dark),
      h("div", {}, density),
      preview, save, saveErr);
    form.addEventListener("submit", e => { e.preventDefault(); doSave(); });
    fill(body, savedEl, form);

    function render(): void {
      const top = pending[pending.length - 1];
      savedEl.textContent = top ? `${line(top.value)} (saving…)` : line(saved);
      count.textContent = `${chars(draft.name)}/${MAX_NAME}`;
      const err = nameError(draft.name);
      nameErr.textContent = err ?? "";
      nameErr.hidden = err === null;
      nameInput.setAttribute("aria-invalid", String(err !== null));
      light.setAttribute("aria-pressed", String(draft.theme === "light"));
      dark.setAttribute("aria-pressed", String(draft.theme === "dark"));
      density.textContent = `Density: ${draft.density}`;
      preview.textContent = `Preview: ${draft.theme} / ${draft.density}`;
      saveErr.textContent = saveError === null ? "" : `Save failed: ${saveError}`;
      saveErr.hidden = saveError === null;
    }

    function doSave(): void {
      if (nameError(draft.name) !== null) return;
      const value: Settings = { ...draft };
      const op = { seq: seq++, value };
      pending.push(op);
      saveError = null;
      render();
      const done = () => {
        const i = pending.indexOf(op);
        if (i >= 0) pending.splice(i, 1);
      };
      saveSettings(value).then(
        answer => {
          if (!alive) return;
          done();
          if (op.seq > savedSeq) { saved = answer; savedSeq = op.seq; }
          render();
        },
        err => {
          if (!alive) return;
          done();
          saveError = message(err);
          render();
        },
      );
    }

    render();
  }

  startLoad();
  return () => { alive = false; };
}
