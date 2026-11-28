import * as api from "./api.js";
import type { Archived } from "./api.js";
import { errorMessage, h, replaceKeepingFocus } from "./dom.js";

/** Mounts the archive page into `host`; returns a function that discards it. */
export function mountArchive(host: HTMLElement): () => void {
  let disposed = false;
  let status: "loading" | "error" | "ok" = "loading";
  let loadError = "";
  let token = 0;
  let rows: Archived[] = [];
  /** ids with a restore in flight: hidden from the list until the server answers */
  const restoring = new Set<number>();
  let restoreError = "";

  const banner = h("div", { attrs: { "aria-live": "polite" } });
  const list = h("div", { testid: "archived", class: "archived" });
  const page = h("div", { class: "archive-page" }, h("h2", { text: "Archive" }), banner, list);
  host.append(page);

  function load(): void {
    const t = ++token;
    status = "loading";
    loadError = "";
    api.fetchArchived().then(
      r => {
        if (disposed || t !== token) return;
        rows = (r ?? []).map(x => ({ ...x }));
        status = "ok";
        render();
      },
      e => {
        if (disposed || t !== token) return;
        status = "error";
        loadError = errorMessage(e);
        render();
      },
    );
  }

  function restore(id: number): void {
    if (restoring.has(id)) return;
    restoreError = "";
    restoring.add(id);
    render();
    api.restoreCard(id).then(
      () => {
        if (disposed) return;
        restoring.delete(id);
        rows = rows.filter(r => r.id !== id);
        render();
      },
      e => {
        if (disposed) return;
        restoring.delete(id);
        restoreError = `restore error: ${errorMessage(e)}`;
        render();
      },
    );
  }

  function render(): void {
    if (disposed) return;
    banner.replaceChildren(...(restoreError ? [h("div", { testid: "restore-error", class: "error", attrs: { role: "alert" }, text: restoreError })] : []));
    if (status === "loading") {
      list.replaceChildren(h("p", { class: "muted", text: "loading archive" }));
      return;
    }
    if (status === "error") {
      replaceKeepingFocus(list, [
        h("p", { class: "error", text: `archive error: ${loadError}` }),
        h("button", { testid: "retry-archive", key: "retry-archive", text: "Retry", onClick: () => { load(); render(); } }),
      ]);
      return;
    }
    const visible = rows.filter(r => !restoring.has(r.id));
    const ul = h("ul", { class: "cards" });
    for (const r of visible) {
      ul.append(h("li", { class: "row" },
        h("span", { testid: "archived-card", class: "card", text: `#${r.id} ${r.title}` }),
        h("button", { testid: "restore", key: `restore-${r.id}`, text: "Restore", label: `Restore #${r.id}`, onClick: () => restore(r.id) }),
      ));
    }
    replaceKeepingFocus(list, visible.length ? [ul] : [ul, h("p", { class: "muted", text: "No archived cards" })]);
  }

  load();
  render();
  return () => { disposed = true; page.remove(); };
}
