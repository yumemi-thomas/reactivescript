import * as api from "./api.js";
import { attempt, button, el, errorMessage } from "./dom.js";

interface Row {
  id: number;
  title: string;
}

/** Mounts the archive page into `host`. Returns a function that discards the page: late answers are ignored. */
export function mountArchive(host: HTMLElement): () => void {
  let alive = true;
  let status: "loading" | "ok" | "error" = "loading";
  let error = "";
  let rows: Row[] = [];
  let restoreError = "";

  const listEl = el("div", { "data-testid": "archived", class: "archived" });
  const restoreErrorEl = el("p", { class: "error", "data-testid": "restore-error", role: "alert" });
  const page = el("div", { class: "archive-page" }, el("h2", {}, "Archive"), listEl, restoreErrorEl);

  function render(): void {
    restoreErrorEl.textContent = restoreError;
    if (status === "loading") {
      listEl.replaceChildren(el("p", {}, "loading archive"));
    } else if (status === "error") {
      listEl.replaceChildren(el("p", { class: "error", role: "alert" }, `archive error: ${error}`));
    } else if (rows.length === 0) {
      listEl.replaceChildren(el("p", { class: "muted" }, "No archived cards"));
    } else {
      listEl.replaceChildren(el("ul", { class: "archived-list" }, ...rows.map(rowEl)));
    }
  }

  function rowEl(row: Row): HTMLElement {
    return el(
      "li",
      { class: "archived-row" },
      el("div", { "data-testid": "archived-card", class: "card" }, `#${row.id} ${row.title}`),
      button("restore", { "data-testid": "restore" }, () => restore(row)),
    );
  }

  function restore(row: Row): void {
    const at = rows.indexOf(row);
    if (!alive || at === -1) return;
    rows = rows.filter((r) => r !== row);
    restoreError = "";
    render();
    attempt(() => api.restoreCard(row.id)).then(
      () => undefined,
      (err: unknown) => {
        if (!alive) return;
        rows = [...rows.slice(0, at), row, ...rows.slice(at)];
        restoreError = `restore error: ${errorMessage(err)}`;
        render();
      },
    );
  }

  host.append(page);
  render();
  attempt(() => api.fetchArchived()).then(
    (list) => {
      if (!alive) return;
      rows = list.map((a) => ({ id: a.id, title: a.title }));
      status = "ok";
      render();
    },
    (err: unknown) => {
      if (!alive) return;
      status = "error";
      error = errorMessage(err);
      render();
    },
  );

  return () => {
    alive = false;
    page.remove();
  };
}
