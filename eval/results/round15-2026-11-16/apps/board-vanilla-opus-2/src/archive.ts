import * as api from "./api.js";
import type { Archived } from "./api.js";
import { button, el, errorMessage, replaceChildren } from "./dom.js";

export function mountArchive(container: HTMLElement): () => void {
  let alive = true;
  let seq = 0;
  let status: "loading" | "error" | "ready" = "loading";
  let error = "";
  let token = 0;
  let items: Archived[] = [];
  /** restores in flight: their rows are hidden until the server answers */
  let pending: { opId: number; id: number }[] = [];
  let restoreError = "";

  const list = el("ul", { testid: "archived", cls: "archived", attrs: { "aria-label": "Archived cards", "aria-live": "polite" } });
  const errSlot = el("div", { cls: "banners" });
  container.replaceChildren(el("div", { cls: "archive-page" }, el("h2", { text: "Archive" }), errSlot, list));

  function load(): void {
    const t = ++token;
    status = "loading";
    error = "";
    render();
    api.fetchArchived().then(
      res => {
        if (!alive || t !== token) return;
        if (!Array.isArray(res)) {
          status = "error";
          error = "bad response";
        } else {
          status = "ready";
          items = res.map(a => ({ id: a.id, title: a.title }));
        }
        render();
      },
      e => {
        if (!alive || t !== token) return;
        status = "error";
        error = errorMessage(e);
        render();
      },
    );
  }

  function restore(id: number): void {
    if (pending.some(p => p.id === id)) return;
    restoreError = "";
    const op = { opId: ++seq, id };
    pending.push(op);
    render();
    api.restoreCard(id).then(
      () => {
        if (!alive) return;
        pending = pending.filter(p => p !== op);
        items = items.filter(a => a.id !== id);
        render();
      },
      e => {
        if (!alive) return;
        pending = pending.filter(p => p !== op);
        restoreError = `restore error: ${errorMessage(e)}`;
        render();
      },
    );
  }

  function render(): void {
    if (!alive) return;
    replaceChildren(errSlot, restoreError ? [el("p", { testid: "restore-error", cls: "error", text: restoreError, attrs: { role: "alert" } })] : []);
    if (status === "loading") {
      replaceChildren(list, [el("li", { cls: "muted", text: "loading archive" })]);
      return;
    }
    if (status === "error") {
      replaceChildren(list, [el("li", { cls: "error" }, el("span", { text: `archive error: ${error}` }), button("retry-archive", "Retry", load, { fkey: "retry" }))]);
      return;
    }
    const shown = items.filter(a => !pending.some(p => p.id === a.id));
    if (!shown.length) {
      replaceChildren(list, [el("li", { cls: "muted", text: "Nothing archived." })]);
      return;
    }
    replaceChildren(list, shown.map(a =>
      el("li", { cls: "card-row" },
        el("div", { testid: "archived-card", cls: "card", text: `#${a.id} ${a.title}` }),
        button("restore", "restore", () => restore(a.id), { title: `Restore #${a.id}`, fkey: `${a.id}:restore` }))));
  }

  load();

  return () => {
    alive = false;
    container.replaceChildren();
  };
}
