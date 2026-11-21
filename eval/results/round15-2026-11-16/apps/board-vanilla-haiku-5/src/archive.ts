import { fetchArchived, restoreCard } from "./api.js";
import { errorMessage, h } from "./dom";

interface Row {
  id: number;
  title: string;
}

// The archive page: lists archived cards and restores them. Discarded (dispose) when the tab is left.
export function createArchive(container: HTMLElement): () => void {
  let alive = true;
  let status: "loading" | "ok" | "error" = "loading";
  let loadError = "";
  let rows: Row[] = [];
  let restoreError: string | null = null;

  const list = h("section", { testid: "archived", cls: "archived" });
  const restoreSlot = h("div", {});

  function listNodes(): Node[] {
    if (status === "loading") return [h("p", { cls: "status" }, "loading archive")];
    if (status === "error") return [h("p", { cls: "error" }, `archive error: ${loadError}`)];
    return rows.map((row) =>
      h(
        "div",
        { cls: "row" },
        h("span", { testid: "archived-card" }, `#${row.id} ${row.title}`),
        h("button", { testid: "restore", type: "button", onClick: () => restore(row) }, "restore"),
      ),
    );
  }

  function render(): void {
    list.replaceChildren(...listNodes());
    restoreSlot.replaceChildren(
      ...(restoreError === null ? [] : [h("p", { testid: "restore-error", cls: "error" }, `restore error: ${restoreError}`)]),
    );
  }

  function load(): void {
    status = "loading";
    loadError = "";
    render();
    fetchArchived().then(
      (found) => {
        if (!alive) return;
        rows = found.map((a) => ({ id: a.id, title: a.title }));
        status = "ok";
        render();
      },
      (err: unknown) => {
        if (!alive) return;
        status = "error";
        loadError = errorMessage(err);
        render();
      },
    );
  }

  // Takes the row off at once; if the server declines, the row goes back where it was.
  function restore(row: Row): void {
    const index = rows.indexOf(row);
    if (index < 0) return;
    restoreError = null;
    rows.splice(index, 1);
    render();
    restoreCard(row.id).then(
      () => undefined,
      (err: unknown) => {
        if (!alive) return;
        rows.splice(Math.min(index, rows.length), 0, row);
        restoreError = errorMessage(err);
        render();
      },
    );
  }

  container.replaceChildren(h("section", { cls: "archive-page" }, h("h2", {}, "Archive"), list, restoreSlot));
  render();
  load();

  return () => {
    alive = false;
  };
}
