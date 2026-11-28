import { fetchArchived, restoreCard } from "./api.js";
import type { Archived } from "./api.js";
import { alertLine, errorMessage, h, setSlot } from "./dom.js";

type ArchiveState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; rows: Archived[] };

/**
 * Builds the archive page inside `page` and starts loading the archived cards. Returns a
 * dispose function: once called, late answers from the server are ignored.
 */
export function mountArchive(page: HTMLElement): () => void {
  let alive = true;
  let state: ArchiveState = { status: "loading" };
  let restoreError: string | null = null;

  const listEl = h("section", { class: "archived", "data-testid": "archived" });
  const restoreSlot = h("div");

  function renderAll(): void {
    if (state.status === "loading") {
      listEl.replaceChildren(h("p", { role: "status", class: "muted" }, "loading archive"));
    } else if (state.status === "error") {
      listEl.replaceChildren(alertLine("archived-error", `archive error: ${state.message}`));
    } else if (state.rows.length === 0) {
      listEl.replaceChildren(h("p", { class: "muted" }, "nothing archived"));
    } else {
      const rows = state.rows.map((card) => {
        const row = h("li", { class: "archived-row" });
        row.append(h("span", { "data-testid": "archived-card" }, `#${card.id} ${card.title}`));
        const restore = h("button", { type: "button", "data-testid": "restore" }, "restore");
        restore.addEventListener("click", () => restoreRow(card.id));
        row.append(restore);
        return row;
      });
      listEl.replaceChildren(h("ul", { class: "archived-list" }, ...rows));
    }
    setSlot(
      restoreSlot,
      restoreError === null ? null : alertLine("restore-error", `restore error: ${restoreError}`),
    );
  }

  function restoreRow(id: number): void {
    if (state.status !== "ready") return;
    const rows = state.rows;
    const index = rows.findIndex((r) => r.id === id);
    if (index < 0) return;
    const [row] = rows.splice(index, 1);
    restoreError = null;
    renderAll();
    restoreCard(id).then(
      () => undefined,
      (err: unknown) => {
        if (!alive) return;
        rows.splice(Math.min(index, rows.length), 0, row);
        restoreError = errorMessage(err);
        renderAll();
      },
    );
  }

  page.append(h("h2", { class: "page-title" }, "Archive"), listEl, restoreSlot);
  renderAll();
  fetchArchived().then(
    (rows) => {
      if (!alive) return;
      state = { status: "ready", rows: [...rows] };
      renderAll();
    },
    (err: unknown) => {
      if (!alive) return;
      state = { status: "error", message: errorMessage(err) };
      renderAll();
    },
  );

  return () => {
    alive = false;
  };
}
