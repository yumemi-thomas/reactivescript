import { fetchArchived, restoreCard } from "./api.js";
import type { Archived } from "./api.js";
import { errorMessage, h } from "./dom.js";

type Status = { kind: "loading" } | { kind: "error"; message: string } | { kind: "ready"; items: Archived[] };

/** The archive page. Discarded when the user leaves it; late answers are then ignored. */
export class ArchivePage {
  private alive = true;
  private state: Status = { kind: "loading" };
  private restoreError = "";
  private readonly listEl: HTMLElement;
  private readonly restoreErrorEl: HTMLElement;

  constructor(container: HTMLElement) {
    this.listEl = h("div", { testid: "archived", cls: "archived" });
    this.restoreErrorEl = h("p", { testid: "restore-error", cls: "error", attrs: { role: "alert" }, hidden: true });
    container.append(h("section", { cls: "archive-page" },
      h("h2", {}, "Archive"),
      this.restoreErrorEl,
      this.listEl,
    ));
    this.render();
    fetchArchived().then(
      items => {
        if (!this.alive) return;
        this.state = { kind: "ready", items };
        this.render();
      },
      (error: unknown) => {
        if (!this.alive) return;
        this.state = { kind: "error", message: errorMessage(error) };
        this.render();
      },
    );
  }

  destroy(): void {
    this.alive = false;
  }

  private render(): void {
    const state = this.state;
    if (state.kind === "loading") {
      this.listEl.replaceChildren(h("p", { cls: "muted" }, "loading archive"));
    } else if (state.kind === "error") {
      this.listEl.replaceChildren(h("p", { cls: "error", attrs: { role: "alert" } }, `archive error: ${state.message}`));
    } else {
      this.listEl.replaceChildren(h("ul", { cls: "archived-list" },
        ...state.items.map(item => this.row(item))));
    }
    this.restoreErrorEl.textContent = this.restoreError;
    this.restoreErrorEl.hidden = this.restoreError === "";
  }

  private row(item: Archived): HTMLElement {
    return h("li", { cls: "archived-row" },
      h("span", { testid: "archived-card", cls: "archived-title" }, `#${item.id} ${item.title}`),
      h("button", { testid: "restore", attrs: { type: "button" }, on: { click: () => this.restore(item) } }, "restore"),
    );
  }

  private restore(item: Archived): void {
    if (this.state.kind !== "ready") return;
    const items = this.state.items;
    const at = items.indexOf(item);
    if (at < 0) return;
    this.restoreError = "";
    items.splice(at, 1);
    this.render();
    restoreCard(item.id).then(
      () => {},
      (error: unknown) => {
        if (!this.alive) return;
        if (this.state.kind === "ready") {
          const list = this.state.items;
          list.splice(Math.min(at, list.length), 0, item);
        }
        this.restoreError = `restore error: ${errorMessage(error)}`;
        this.render();
      },
    );
  }
}
