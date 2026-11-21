import { loadSettings, saveSettings } from "./api.js";
import type { Settings, Theme } from "./api.js";
import { button, div, errorMessage, field, p, span } from "./dom.js";

const NAME_MAX = 20;

/** The settings page. Leaving it discards it; answers that arrive afterwards are ignored. */
export function mountSettings(host: HTMLElement): () => void {
  const page = new SettingsPage(host);
  page.start();
  return () => page.dispose();
}

function nameProblem(name: string): string | null {
  if (name.trim() === "") return "Display name is required";
  if (name.length > NAME_MAX) return `Display name must be at most ${NAME_MAX} characters, not ${name.length}`;
  return null;
}

class SettingsPage {
  private readonly host: HTMLElement;
  private readonly loadLine: HTMLParagraphElement;
  private readonly retryLoad: HTMLButtonElement;
  private readonly savedLine: HTMLParagraphElement;
  private readonly form: HTMLDivElement;
  private readonly nameInput: HTMLInputElement;
  private readonly nameCount: HTMLSpanElement;
  private readonly nameError: HTMLParagraphElement;
  private readonly themeLight: HTMLButtonElement;
  private readonly themeDark: HTMLButtonElement;
  private readonly densityToggle: HTMLButtonElement;
  private readonly preview: HTMLParagraphElement;
  private readonly saveButton: HTMLButtonElement;
  private readonly saveErrorEl: HTMLParagraphElement;

  private alive = true;
  private loadSeq = 0;
  private saveSeq = 0;
  private loadState: "loading" | "ok" | "error" = "loading";
  private loadMessage = "";
  private saved: Settings | null = null;
  private pending: { seq: number; values: Settings } | null = null;
  private saveError: string | null = null;
  private draft: Settings | null = null;

  constructor(host: HTMLElement) {
    this.host = host;
    this.loadLine = p({ test: "load" });
    this.retryLoad = button("Try again", () => this.load(), { test: "retry-load", hidden: true });
    this.savedLine = p({ test: "saved" });
    this.nameInput = field("name", "", (value) => this.onName(value), { "aria-label": "Display name" });
    this.nameCount = span({ test: "name-count" });
    this.nameError = p({ test: "name-error" });
    this.themeLight = button("Light", () => this.setTheme("light"), { test: "theme-light" });
    this.themeDark = button("Dark", () => this.setTheme("dark"), { test: "theme-dark" });
    this.densityToggle = button("", () => this.toggleDensity(), { test: "density-toggle" });
    this.preview = p({ test: "preview" });
    this.saveButton = button("Save", () => this.saveDraft(), { test: "save" });
    this.saveErrorEl = p({ test: "save-error" });
    this.form = div({ test: "form", hidden: true }, [
      div({}, [this.nameInput, this.nameCount, this.nameError]),
      div({}, [this.themeLight, this.themeDark, this.densityToggle]),
      this.preview,
      div({}, [this.saveButton, this.saveErrorEl]),
    ]);
  }

  start(): void {
    this.host.replaceChildren(div({ test: "settings-page" }, [this.loadLine, this.retryLoad, this.savedLine, this.form]));
    this.renderLoad();
    this.load();
  }

  dispose(): void {
    this.alive = false;
  }

  private load(): void {
    const seq = ++this.loadSeq;
    this.loadState = "loading";
    this.renderLoad();
    loadSettings().then(
      (settings) => {
        if (!this.alive || seq !== this.loadSeq) return;
        this.loadState = "ok";
        this.saved = { ...settings };
        this.draft = { ...settings };
        this.nameInput.value = settings.name;
        this.form.hidden = false;
        this.renderLoad();
        this.renderSaved();
        this.renderDraft();
      },
      (e: unknown) => {
        if (!this.alive || seq !== this.loadSeq) return;
        this.loadState = "error";
        this.loadMessage = errorMessage(e);
        this.renderLoad();
      },
    );
  }

  private onName(value: string): void {
    if (this.draft === null) return;
    this.draft.name = value;
    this.renderDraft();
  }

  private setTheme(theme: Theme): void {
    if (this.draft === null) return;
    this.draft.theme = theme;
    this.renderDraft();
  }

  private toggleDensity(): void {
    if (this.draft === null) return;
    this.draft.density = this.draft.density === "compact" ? "comfortable" : "compact";
    this.renderDraft();
  }

  private saveDraft(): void {
    const draft = this.draft;
    if (draft === null || nameProblem(draft.name) !== null) return;
    const seq = ++this.saveSeq;
    const values: Settings = { ...draft };
    this.pending = { seq, values };
    this.saveError = null;
    this.renderSaved();
    this.renderSaveError();
    saveSettings(values).then(
      (answer) => {
        if (!this.alive) return;
        this.saved = { ...answer };
        if (this.pending !== null && this.pending.seq === seq) this.pending = null;
        this.renderSaved();
      },
      (e: unknown) => {
        if (!this.alive || seq !== this.saveSeq) return;
        this.pending = null;
        this.saveError = `Save failed: ${errorMessage(e)}`;
        this.renderSaved();
        this.renderSaveError();
      },
    );
  }

  private renderLoad(): void {
    if (!this.alive) return;
    if (this.loadState === "loading") {
      this.loadLine.textContent = "Loading settings…";
    } else if (this.loadState === "error") {
      this.loadLine.textContent = `Could not load settings: ${this.loadMessage}`;
    } else {
      this.loadLine.textContent = "";
    }
    this.retryLoad.hidden = this.loadState !== "error";
  }

  private renderSaved(): void {
    if (!this.alive) return;
    const s = this.saved;
    if (s === null) {
      this.savedLine.textContent = "";
      return;
    }
    const pending = this.pending;
    this.savedLine.textContent =
      pending === null
        ? `Saved: ${s.name} · ${s.theme} · ${s.density}`
        : `Saved: ${pending.values.name} · ${pending.values.theme} · ${pending.values.density} (saving…)`;
  }

  private renderSaveError(): void {
    if (!this.alive) return;
    this.saveErrorEl.textContent = this.saveError ?? "";
  }

  private renderDraft(): void {
    const d = this.draft;
    if (d === null || !this.alive) return;
    this.nameCount.textContent = `${d.name.length}/${NAME_MAX}`;
    this.nameError.textContent = nameProblem(d.name) ?? "";
    this.themeLight.setAttribute("aria-pressed", String(d.theme === "light"));
    this.themeDark.setAttribute("aria-pressed", String(d.theme === "dark"));
    this.densityToggle.textContent = `Density: ${d.density}`;
    this.preview.textContent = `Preview: ${d.theme} / ${d.density}`;
  }
}
