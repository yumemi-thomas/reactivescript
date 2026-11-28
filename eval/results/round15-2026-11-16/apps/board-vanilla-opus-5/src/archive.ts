import * as api from "./api.js";
import type { Archived } from "./api.js";
import { Lifetime, button, h, messageOf } from "./dom.js";

export class ArchivePage {
  readonly el: HTMLElement;
  private life = new Lifetime();
  private status: "loading" | "error" | "ready" = "loading";
  private error = "";
  private token = 0;
  private list: Archived[] = [];
  private restoring = new Set<number>();
  private restoreError = "";
  private listEl = h("ul", { testid: "archived", class: "archived", "aria-live": "polite" });
  private errorSlot = h("div");
  private restoreErrorEl = h("p", { testid: "restore-error", class: "error", role: "alert" });

  constructor() {
    this.el = h("div", { class: "archive-page" }, h("h2", {}, "Archive"), this.errorSlot, this.listEl);
    this.load();
  }

  destroy(): void { this.life.end(); }

  private load(): void {
    const token = ++this.token;
    this.status = "loading";
    this.error = "";
    this.render();
    this.life.watch(api.fetchArchived(), list => {
      if (token !== this.token) return;
      const seen = new Set<number>();
      this.list = (Array.isArray(list) ? list : []).filter(a => !seen.has(a.id) && (seen.add(a.id), true));
      this.status = "ready";
      this.render();
    }, err => {
      if (token !== this.token) return;
      this.status = "error";
      this.error = messageOf(err);
      this.render();
    });
  }

  private restore(id: number): void {
    if (this.restoring.has(id)) return;
    this.restoreError = "";
    this.restoring.add(id);
    this.render();
    this.life.watch(api.restoreCard(id), () => {
      this.restoring.delete(id);
      this.list = this.list.filter(a => a.id !== id);
      this.render();
    }, err => {
      this.restoring.delete(id);
      this.restoreError = messageOf(err);
      this.render();
    });
  }

  private render(): void {
    this.restoreErrorEl.textContent = this.restoreError ? `restore error: ${this.restoreError}` : "";
    this.errorSlot.replaceChildren(...(this.restoreError ? [this.restoreErrorEl] : []));
    if (this.status === "loading") {
      this.listEl.replaceChildren(h("li", { class: "muted" }, "loading archive"));
      return;
    }
    if (this.status === "error") {
      this.listEl.replaceChildren(
        h("li", { class: "error" }, `archive error: ${this.error}`),
        h("li", {}, button("retry", "retry-archive", () => this.load())),
      );
      return;
    }
    const rows = this.list.filter(a => !this.restoring.has(a.id)).map(a => {
      const label = h("span", { testid: "archived-card" });
      label.textContent = `#${a.id} ${a.title}`;
      return h("li", { class: "archived-row" }, label, button("restore", "restore", () => this.restore(a.id)));
    });
    this.listEl.replaceChildren(...(rows.length ? rows : [h("li", { class: "muted empty" }, "nothing archived")]));
  }
}
