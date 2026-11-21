import { fetchArchived, restoreCard } from "./api.js";
import type { Archived } from "./api.js";
import { el, messageOf } from "./dom.js";

/** The archive page. Returns the function that discards it. */
export function createArchive(host: HTMLElement): () => void {
  let alive = true;
  let rows: Archived[] = [];
  let status: "loading" | "error" | "ok" = "loading";
  let error = "";
  let restoreError = "";

  const statusEl = el("p", { class: "status" });
  const list = el("ul", { class: "archived-list" });
  const archived = el("section", { "data-testid": "archived" }, statusEl, list);
  const restoreErrEl = el("p", { class: "error", "data-testid": "restore-error" });
  host.replaceChildren(el("div", { class: "archive-page" }, el("h2", {}, "Archive"), archived, restoreErrEl));

  function restore(a: Archived): void {
    const index = rows.indexOf(a);
    if (index < 0) return;
    restoreError = "";
    rows.splice(index, 1);
    render();
    restoreCard(a.id).then(
      () => {},
      (err: unknown) => {
        if (!alive) return;
        rows.splice(Math.min(index, rows.length), 0, a);
        restoreError = `restore error: ${messageOf(err)}`;
        render();
      },
    );
  }

  function rowEl(a: Archived): HTMLElement {
    const btn = el("button", { type: "button", "data-testid": "restore" }, "restore");
    btn.addEventListener("click", () => restore(a));
    return el("li", { class: "archived-row" }, el("span", { "data-testid": "archived-card" }, `#${a.id} ${a.title}`), btn);
  }

  function render(): void {
    statusEl.hidden = status === "ok";
    statusEl.textContent = status === "loading" ? "loading archive" : status === "error" ? `archive error: ${error}` : "";
    list.replaceChildren(...rows.map(rowEl));
    restoreErrEl.textContent = restoreError;
  }

  render();
  fetchArchived().then(
    (found: Archived[]) => {
      if (!alive) return;
      rows = found.slice();
      status = "ok";
      render();
    },
    (err: unknown) => {
      if (!alive) return;
      status = "error";
      error = messageOf(err);
      render();
    },
  );

  return () => { alive = false; };
}
