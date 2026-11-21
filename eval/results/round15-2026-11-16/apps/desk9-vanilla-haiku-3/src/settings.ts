import * as api from "./api.js";
import type { Density, Settings, Theme } from "./api.js";
import { errorText, h, setText, watchText } from "./dom.js";

const MAX_NAME = 20;

type LoadState = { state: "loading" } | { state: "ok" } | { state: "error"; message: string };

/** The problem with a display name, or null when it is valid. `name` is already trimmed. */
function nameProblem(name: string): string | null {
  if (name.length === 0) return "Display name is required";
  if (name.length > MAX_NAME) return `Display name must be at most ${MAX_NAME} characters, not ${name.length}`;
  return null;
}

function describe(s: Settings): string {
  return `${s.name} · ${s.theme} · ${s.density}`;
}

/** The settings page. Discarded when the user leaves it; dispose() makes later answers no-ops. */
export class SettingsPage {
  private alive = true;
  private loadGen = 0;
  private saveGen = 0;
  private loadState: LoadState = { state: "loading" };
  private saved: Settings | null = null;
  private saving: Settings | null = null;
  private saveError: string | null = null;
  private draft: Settings = { name: "", theme: "light", density: "comfortable" };
  private readonly loadEl: HTMLElement;
  private readonly savedEl: HTMLElement;
  private readonly form: HTMLElement;
  private readonly nameInput: HTMLInputElement;
  private readonly nameCount: HTMLElement;
  private readonly nameError: HTMLElement;
  private readonly themeButtons: Record<Theme, HTMLButtonElement>;
  private readonly densityToggle: HTMLButtonElement;
  private readonly preview: HTMLElement;
  private readonly saveErrorEl: HTMLElement;

  constructor(root: HTMLElement) {
    this.loadEl = h("div", { testid: "load" });
    this.savedEl = h("p", { testid: "saved" });
    this.nameInput = h("input", { testid: "name" });
    watchText(this.nameInput, (value) => {
      this.draft = { ...this.draft, name: value };
      this.renderForm();
    });
    this.nameCount = h("span", { testid: "name-count" });
    this.nameError = h("p", { testid: "name-error" });
    this.themeButtons = {
      light: h("button", { testid: "theme-light", onClick: () => this.setTheme("light") }, "Light"),
      dark: h("button", { testid: "theme-dark", onClick: () => this.setTheme("dark") }, "Dark"),
    };
    this.densityToggle = h("button", { testid: "density-toggle", onClick: () => this.toggleDensity() });
    this.preview = h("p", { testid: "preview" });
    this.saveErrorEl = h("p", { testid: "save-error" });
    this.form = h(
      "div",
      { hidden: true },
      h("label", {}, "Display name ", this.nameInput),
      this.nameCount,
      this.nameError,
      h("div", {}, this.themeButtons.light, this.themeButtons.dark),
      h("div", {}, this.densityToggle),
      this.preview,
      h("button", { testid: "save", onClick: () => this.save() }, "Save"),
      this.saveErrorEl,
    );
    this.savedEl.textContent = "";
    root.replaceChildren(h("section", {}, this.loadEl, this.savedEl, this.form));
    this.load();
  }

  dispose(): void {
    this.alive = false;
  }

  private load(): void {
    const gen = ++this.loadGen;
    this.loadState = { state: "loading" };
    this.renderLoad();
    this.renderForm();
    api.loadSettings().then(
      (loaded) => {
        if (!this.alive || gen !== this.loadGen) return;
        this.loadState = { state: "ok" };
        this.saved = { ...loaded };
        this.draft = { ...loaded };
        this.renderLoad();
        this.renderSaved();
        this.renderForm();
      },
      (err) => {
        if (!this.alive || gen !== this.loadGen) return;
        this.loadState = { state: "error", message: errorText(err) };
        this.renderLoad();
        this.renderForm();
      },
    );
  }

  private setTheme(theme: Theme): void {
    this.draft = { ...this.draft, theme };
    this.renderForm();
  }

  private toggleDensity(): void {
    const density: Density = this.draft.density === "compact" ? "comfortable" : "compact";
    this.draft = { ...this.draft, density };
    this.renderForm();
  }

  private save(): void {
    if (this.loadState.state !== "ok") return;
    const payload: Settings = {
      name: this.draft.name.trim(),
      theme: this.draft.theme,
      density: this.draft.density,
    };
    if (nameProblem(payload.name) !== null) return;
    const gen = ++this.saveGen;
    this.saving = payload;
    this.saveError = null;
    this.renderSaved();
    api.saveSettings({ ...payload }).then(
      (answer) => {
        if (!this.alive || gen !== this.saveGen) return;
        this.saved = { ...answer };
        this.saving = null;
        this.renderSaved();
      },
      (err) => {
        if (!this.alive || gen !== this.saveGen) return;
        this.saving = null;
        this.saveError = `Save failed: ${errorText(err)}`;
        this.renderSaved();
      },
    );
  }

  private renderLoad(): void {
    if (!this.alive) return;
    const s = this.loadState;
    if (s.state === "loading") {
      this.loadEl.replaceChildren("Loading settings…");
    } else if (s.state === "error") {
      this.loadEl.replaceChildren(
        `Could not load settings: ${s.message}`,
        h("button", { testid: "retry-load", onClick: () => this.load() }, "Retry"),
      );
    } else {
      this.loadEl.replaceChildren();
    }
  }

  private renderSaved(): void {
    if (!this.alive) return;
    if (this.saved === null) {
      this.savedEl.textContent = "";
    } else if (this.saving !== null) {
      this.savedEl.textContent = `Saved: ${describe(this.saving)} (saving…)`;
    } else {
      this.savedEl.textContent = `Saved: ${describe(this.saved)}`;
    }
    this.saveErrorEl.textContent = this.saveError ?? "";
  }

  private renderForm(): void {
    if (!this.alive) return;
    this.form.hidden = this.loadState.state !== "ok";
    const d = this.draft;
    if (this.nameInput.value !== d.name) setText(this.nameInput, d.name);
    const trimmed = d.name.trim();
    this.nameCount.textContent = `${trimmed.length}/${MAX_NAME}`;
    this.nameError.textContent = nameProblem(trimmed) ?? "";
    for (const t of ["light", "dark"] as const) {
      this.themeButtons[t].setAttribute("aria-pressed", String(d.theme === t));
    }
    this.densityToggle.textContent = `Density: ${d.density}`;
    this.preview.textContent = `Preview: ${d.theme} / ${d.density}`;
    this.renderSaved();
  }
}
