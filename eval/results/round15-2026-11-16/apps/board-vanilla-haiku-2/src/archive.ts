import { fetchArchived, restoreCard } from "./api.js";
import { button, h, messageOf } from "./dom.js";

interface Row { id: number; title: string; }

/** Opens the archive page in `container`. Returns the function that discards it. */
export function openArchive(container: HTMLElement): () => void {
  let alive = true;
  let status: "loading" | "error" | "ready" = "loading";
  let error = "";
  let rows: Row[] = [];
  let restoreError = "";

  function render(): void {
    container.replaceChildren(view());
  }

  function restore(row: Row): void {
    const index = rows.indexOf(row);
    if (index < 0) return;
    restoreError = "";
    rows.splice(index, 1);
    render();
    restoreCard(row.id).then(
      () => {},
      (e: unknown) => {
        if (!alive) return;
        rows.splice(Math.min(index, rows.length), 0, row);
        restoreError = `restore error: ${messageOf(e)}`;
        render();
      },
    );
  }

  function view(): HTMLElement {
    let body: HTMLElement;
    if (status === "loading") {
      body = h("p", { cls: "muted" }, "loading archive");
    } else if (status === "error") {
      body = h("p", { cls: "error" }, `archive error: ${error}`);
    } else {
      body = h(
        "ul",
        { cls: "archived" },
        ...rows.map(row =>
          h(
            "li",
            {},
            h("span", { testid: "archived-card" }, `#${row.id} ${row.title}`),
            button("restore", () => restore(row), { testid: "restore" }),
          ),
        ),
      );
    }
    return h(
      "div",
      { cls: "archive-page" },
      h("h2", {}, "Archive"),
      h("section", { testid: "archived" }, body),
      restoreError ? h("p", { testid: "restore-error", cls: "error" }, restoreError) : null,
    );
  }

  render();
  fetchArchived().then(
    list => {
      if (!alive) return;
      rows = list.map(item => ({ id: item.id, title: item.title }));
      status = "ready";
      render();
    },
    (e: unknown) => {
      if (!alive) return;
      status = "error";
      error = messageOf(e);
      render();
    },
  );

  return () => {
    alive = false;
    container.replaceChildren();
  };
}
