import * as api from "./api.js";
import type { Settings } from "./api.js";
import { Slot, button, errMsg, h, input } from "./dom";

export const MAX_NAME = 20;

export function nameError(name: string): string | null {
  const length = [...name].length;
  if (name.trim() === "") return "Display name is required";
  if (length > MAX_NAME) return `Display name must be at most ${MAX_NAME} characters, not ${length}`;
  return null;
}

const line = (s: Settings) => `Saved: ${s.name} · ${s.theme} · ${s.density}`;

export function mountSettings(host: HTMLElement, apply: (s: Settings) => void): () => void {
  let alive = true;
  let loadGen = 0;
  let loadState: { kind: "loading" } | { kind: "ok" } | { kind: "error"; message: string } = { kind: "loading" };
  let saved: Settings | null = null;
  let savedSeq = -1;
  let seq = 0;
  let saves: { seq: number; s: Settings }[] = [];
  let saveError: string | null = null;
  let draft: Settings | null = null;

  const load = new Slot(h("div", { testid: "load", attrs: { "aria-live": "polite" } }));
  const body = h("div", { class: "settings-body" });
  host.append(h("div", { class: "settings" }, load.el, body));

  let form: {
    saved: HTMLElement;
    saveError: Slot;
    name: HTMLInputElement;
    count: HTMLElement;
    nameError: Slot;
    light: HTMLButtonElement;
    dark: HTMLButtonElement;
    density: HTMLButtonElement;
    preview: HTMLElement;
  } | null = null;

  function doLoad(): void {
    const gen = ++loadGen;
    loadState = { kind: "loading" };
    render();
    api.loadSettings().then(
      s => {
        if (!alive || gen !== loadGen) return;
        loadState = { kind: "ok" };
        saved = s;
        draft = { ...s };
        apply(s);
        buildForm(s);
        render();
      },
      e => {
        if (!alive || gen !== loadGen) return;
        loadState = { kind: "error", message: errMsg(e) };
        render();
      },
    );
  }

  function buildForm(s: Settings): void {
    const name = input("name", "Display name", () => save());
    name.value = s.name;
    name.addEventListener("input", () => {
      if (draft) draft.name = name.value;
      render();
    });
    form = {
      saved: h("p", { testid: "saved", attrs: { "aria-live": "polite" } }),
      saveError: new Slot(h("div", { attrs: { role: "alert" } })),
      name,
      count: h("span", { testid: "name-count", class: "muted" }),
      nameError: new Slot(h("div", { attrs: { role: "alert" } })),
      light: button("theme-light", "Light", () => setDraft({ theme: "light" })),
      dark: button("theme-dark", "Dark", () => setDraft({ theme: "dark" })),
      density: button("density-toggle", "", () =>
        setDraft({ density: draft?.density === "compact" ? "comfortable" : "compact" }),
      ),
      preview: h("p", { testid: "preview" }),
    };
    body.replaceChildren(
      form.saved,
      form.saveError.el,
      h("label", { class: "field" }, "Display name ", name, " ", form.count),
      form.nameError.el,
      h("div", { class: "row", attrs: { role: "group", "aria-label": "Theme" } }, "Theme ", form.light, form.dark),
      h("div", { class: "row" }, "Density ", form.density),
      form.preview,
      h("div", { class: "row" }, button("save", "Save", () => save(), "primary")),
    );
  }

  function setDraft(patch: Partial<Settings>): void {
    if (!draft) return;
    draft = { ...draft, ...patch };
    render();
  }

  function save(): void {
    if (!draft || nameError(draft.name) !== null) return;
    const s: Settings = { ...draft };
    const mine = ++seq;
    saves.push({ seq: mine, s });
    saveError = null;
    render();
    api.saveSettings(s).then(
      r => {
        saves = saves.filter(x => x.seq !== mine);
        if (mine > savedSeq) {
          saved = r ?? s;
          savedSeq = mine;
          if (alive) apply(saved);
        }
        render();
      },
      e => {
        saves = saves.filter(x => x.seq !== mine);
        saveError = `Save failed: ${errMsg(e)}`;
        render();
      },
    );
  }

  function render(): void {
    if (!alive) return;
    load.render(JSON.stringify(loadState), () => {
      if (loadState.kind === "loading") return ["Loading settings…"];
      if (loadState.kind === "error")
        return [
          h("p", { class: "error" }, `Could not load settings: ${loadState.message}`),
          button("retry-load", "retry", () => doLoad()),
        ];
      return [];
    });
    load.el.hidden = loadState.kind === "ok";
    if (!form || !draft || !saved) return;
    const pending = saves.length ? saves[saves.length - 1].s : null;
    form.saved.textContent = pending ? `${line(pending)} (saving…)` : line(saved);
    const err = saveError;
    form.saveError.render(JSON.stringify(err), () => (err === null ? [] : [h("p", { testid: "save-error", class: "error" }, err)]));
    form.count.textContent = `${[...draft.name].length}/${MAX_NAME}`;
    const ne = nameError(draft.name);
    form.name.setAttribute("aria-invalid", String(ne !== null));
    form.nameError.render(JSON.stringify(ne), () => (ne === null ? [] : [h("p", { testid: "name-error", class: "error" }, ne)]));
    form.light.setAttribute("aria-pressed", String(draft.theme === "light"));
    form.dark.setAttribute("aria-pressed", String(draft.theme === "dark"));
    form.density.textContent = draft.density;
    form.preview.textContent = `Preview: ${draft.theme} / ${draft.density}`;
  }

  doLoad();

  return () => {
    alive = false;
  };
}
