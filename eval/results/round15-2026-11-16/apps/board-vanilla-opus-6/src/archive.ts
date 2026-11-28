// The archive page: archived cards, each restorable.

import * as api from "./api.js";
import type { Archived } from "./api.js";
import { errorMessage, h, replaceChildrenKeepingFocus } from "./dom.js";

type LoadState = { kind: "loading" } | { kind: "error"; message: string } | { kind: "ok" };

export function mountArchive(root: HTMLElement): () => void {
  let alive = true;
  let confirmed: Archived[] = [];
  let load: LoadState = { kind: "loading" };
  /** ids being restored: hidden until the server answers */
  const restoring = new Map<number, number>();
  let restoreError: string | null = null;

  const listEl = h("div", { testid: "archived", class: "archived" });
  const errorEl = h("p", { testid: "restore-error", class: "error", role: "alert" });
  const errorsEl = h("div", { class: "errors" });
  const page = h("div", { class: "archive-page" }, h("h2", {}, "Archive"), errorsEl, listEl);
  root.append(page);

  function restore(id: number): void {
    restoreError = null;
    restoring.set(id, (restoring.get(id) ?? 0) + 1);
    render();
    const done = (): void => {
      const n = (restoring.get(id) ?? 1) - 1;
      if (n <= 0) restoring.delete(id);
      else restoring.set(id, n);
    };
    api.restoreCard(id).then(
      () => {
        if (!alive) return;
        done();
        confirmed = confirmed.filter(c => c.id !== id);
        render();
      },
      err => {
        if (!alive) return;
        done();
        restoreError = errorMessage(err);
        render();
      },
    );
  }

  function render(): void {
    if (!alive) return;
    if (load.kind === "loading") {
      listEl.replaceChildren(h("p", { class: "status" }, "loading archive"));
    } else if (load.kind === "error") {
      listEl.replaceChildren(h("p", { class: "status error", role: "alert" }, `archive error: ${load.message}`));
    } else {
      const rows: Node[] = confirmed
        .filter(c => !restoring.has(c.id))
        .map(c => {
          const btn = h("button", { testid: "restore", type: "button", "data-key": `restore-${c.id}`, "aria-label": `Restore #${c.id}` }, "Restore");
          btn.addEventListener("click", () => restore(c.id));
          return h("div", { class: "archived-row" }, h("span", { testid: "archived-card", class: "archived-card" }, `#${c.id} ${c.title}`), btn);
        });
      if (rows.length === 0) rows.push(h("p", { class: "empty" }, "Nothing archived"));
      replaceChildrenKeepingFocus(listEl, rows);
    }
    if (restoreError !== null) {
      errorEl.textContent = `restore error: ${restoreError}`;
      errorsEl.replaceChildren(errorEl);
    } else errorsEl.replaceChildren();
  }

  api.fetchArchived().then(
    list => {
      if (!alive) return;
      confirmed = list.map(c => ({ id: c.id, title: c.title }));
      load = { kind: "ok" };
      render();
    },
    err => {
      if (!alive) return;
      load = { kind: "error", message: errorMessage(err) };
      render();
    },
  );
  render();

  return () => {
    alive = false;
    page.remove();
  };
}
