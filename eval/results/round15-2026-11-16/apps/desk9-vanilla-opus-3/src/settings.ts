import * as api from "./api.js";
import type { Settings } from "./api.js";
import { errMsg, fill, h, textInput } from "./dom.js";

const MAX_NAME = 20;

function line(s: Settings): string {
  return `Saved: ${s.name} · ${s.theme} · ${s.density}`;
}

function nameError(name: string): string | null {
  if (name.trim().length === 0) return "Display name is required";
  if (name.length > MAX_NAME) return `Display name must be at most ${MAX_NAME} characters, not ${name.length}`;
  return null;
}

export function mountSettings(root: HTMLElement): () => void {
  let alive = true;
  let tick = 0;

  type Load = { status: "loading"; token: number } | { status: "error"; token: number; message: string } | { status: "loaded"; token: number };
  let load: Load = { status: "loading", token: 0 };
  let committed: Settings | null = null;
  let committedTick = 0;
  let draft: Settings | null = null;
  const pending: { tick: number; s: Settings }[] = [];
  let saveError: string | null = null;

  const loadBox = h("div", { testid: "load", cls: "load" });
  const savedBox = h("div", { testid: "saved", cls: "saved" });
  const nameInput = textInput("name");
  nameInput.setAttribute("aria-label", "Display name");
  const nameCount = h("span", { testid: "name-count", cls: "count" });
  const nameErrSlot = h("div");
  const themeLight = h("button", { testid: "theme-light", text: "light", onClick: () => setTheme("light") });
  const themeDark = h("button", { testid: "theme-dark", text: "dark", onClick: () => setTheme("dark") });
  const densityBtn = h("button", { testid: "density-toggle", onClick: toggleDensity });
  const preview = h("div", { testid: "preview", cls: "preview" });
  const saveBtn = h("button", { testid: "save", text: "save", onClick: save });
  const saveErrSlot = h("div");
  const form = h(
    "form",
    { cls: "settings-form" },
    h("label", {}, "Display name ", nameInput, " ", nameCount),
    nameErrSlot,
    h("div", { cls: "theme" }, "Theme ", themeLight, themeDark),
    h("div", { cls: "density" }, "Density ", densityBtn),
    preview,
    saveBtn,
    saveErrSlot,
  );
  form.addEventListener("submit", ev => {
    ev.preventDefault();
    save();
  });
  const page = h("div", { cls: "settings-page" }, loadBox, savedBox, form);
  root.append(page);

  nameInput.addEventListener("input", () => {
    if (!draft) return;
    draft = { ...draft, name: nameInput.value };
    render();
  });

  function setTheme(theme: Settings["theme"]): void {
    if (!draft) return;
    draft = { ...draft, theme };
    render();
  }

  function toggleDensity(): void {
    if (!draft) return;
    draft = { ...draft, density: draft.density === "compact" ? "comfortable" : "compact" };
    render();
  }

  function doLoad(): void {
    const token = ++tick;
    load = { status: "loading", token };
    render();
    api.loadSettings().then(
      s => {
        if (!alive || load.token !== token) return;
        const got: Settings = { name: s.name, theme: s.theme, density: s.density };
        load = { status: "loaded", token };
        committed = got;
        committedTick = token;
        draft = { ...got };
        nameInput.value = got.name;
        render();
      },
      e => {
        if (!alive || load.token !== token) return;
        load = { status: "error", token, message: errMsg(e) };
        render();
      },
    );
  }

  function save(): void {
    if (!draft || load.status !== "loaded") return;
    if (nameError(draft.name)) return;
    const s: Settings = { ...draft };
    const entry = { tick: ++tick, s };
    pending.push(entry);
    saveError = null;
    render();
    api.saveSettings({ ...s }).then(
      res => {
        if (!alive) return;
        pending.splice(pending.indexOf(entry), 1);
        if (entry.tick > committedTick) {
          committed = res && typeof res.name === "string" ? { name: res.name, theme: res.theme, density: res.density } : s;
          committedTick = entry.tick;
        }
        render();
      },
      e => {
        if (!alive) return;
        pending.splice(pending.indexOf(entry), 1);
        saveError = `Save failed: ${errMsg(e)}`;
        render();
      },
    );
  }

  function render(): void {
    if (!alive) return;
    if (load.status === "loading") {
      loadBox.hidden = false;
      fill(loadBox, "Loading settings…");
    } else if (load.status === "error") {
      loadBox.hidden = false;
      fill(
        loadBox,
        `Could not load settings: ${load.message} `,
        h("button", { testid: "retry-load", text: "retry", onClick: doLoad }),
      );
    } else {
      fill(loadBox);
      loadBox.hidden = true;
    }

    const ready = load.status === "loaded" && draft !== null && committed !== null;
    savedBox.hidden = !ready;
    form.hidden = !ready;
    if (!ready || !draft || !committed) {
      fill(savedBox);
      return;
    }

    const latest = pending[pending.length - 1];
    savedBox.textContent = latest ? `${line(latest.s)} (saving…)` : line(committed);

    nameCount.textContent = `${draft.name.length}/${MAX_NAME}`;
    const err = nameError(draft.name);
    fill(nameErrSlot, err ? h("div", { testid: "name-error", cls: "error", text: err }) : null);
    nameInput.setAttribute("aria-invalid", String(err !== null));
    themeLight.setAttribute("aria-pressed", String(draft.theme === "light"));
    themeDark.setAttribute("aria-pressed", String(draft.theme === "dark"));
    densityBtn.textContent = draft.density;
    preview.textContent = `Preview: ${draft.theme} / ${draft.density}`;
    fill(saveErrSlot, saveError ? h("div", { testid: "save-error", cls: "error", text: saveError }) : null);
  }

  doLoad();

  return () => {
    alive = false;
    page.remove();
  };
}
