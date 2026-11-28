import * as api from "./api.js";
import type { Archived } from "./api.js";
import { errorMessage, h, replaceChildren, setMessage } from "./dom.js";

type LoadState = { status: "loading" } | { status: "error"; message: string } | { status: "ready" };

export function mountArchive(root: HTMLElement): () => void {
  let alive = true;
  let token = 0;
  let load: LoadState = { status: "loading" };
  let rows: Archived[] = [];
  /** cards whose restore the server has not answered yet: hidden from the list meanwhile */
  const restoring = new Set<number>();
  let restoreError: string | null = null;

  const listEl = h("div", { testid: "archived", className: "archived", attrs: { "aria-live": "polite" } });
  const errorEl = h("div", { testid: "restore-error", className: "msg error", attrs: { role: "alert" } });
  const container = h("section", { className: "archive-page", attrs: { "aria-label": "Archive" } }, [h("h2", { text: "Archived cards" }), errorEl, listEl]);
  root.append(container);

  function fetchList(): void {
    const t = ++token;
    load = { status: "loading" };
    render();
    api.fetchArchived().then(
      list => { if (!alive || t !== token) return; rows = list; load = { status: "ready" }; render(); },
      e => { if (!alive || t !== token) return; load = { status: "error", message: errorMessage(e) }; render(); },
    );
  }

  function onRestore(id: number): void {
    if (restoring.has(id)) return;
    restoreError = null;
    restoring.add(id);
    render();
    api.restoreCard(id).then(
      () => { if (!alive) return; restoring.delete(id); rows = rows.filter(r => r.id !== id); render(); },
      e => { if (!alive) return; restoring.delete(id); restoreError = `restore error: ${errorMessage(e)}`; render(); },
    );
  }

  function render(): void {
    if (!alive) return;
    setMessage(errorEl, restoreError);
    if (load.status === "loading") { replaceChildren(listEl, [h("p", { className: "status", text: "loading archive" })]); return; }
    if (load.status === "error") {
      replaceChildren(listEl, [h("p", { className: "status error", text: `archive error: ${load.message}` }),
        h("button", { testid: "retry-archive", text: "retry", focusKey: "retry-archive", onClick: fetchList })]);
      return;
    }
    const shown = rows.filter(r => !restoring.has(r.id));
    replaceChildren(listEl, shown.length === 0 ? [h("p", { className: "status muted", text: "nothing archived" })] : [h("ul", { className: "cards" }, shown.map(r =>
      h("li", { className: "card-row" }, [
        h("span", { testid: "archived-card", className: "card", text: `#${r.id} ${r.title}` }),
        h("button", { testid: "restore", text: "restore", focusKey: `restore:${r.id}`, attrs: { "aria-label": `Restore ${r.title}` }, onClick: () => onRestore(r.id) }),
      ])))]);
  }

  fetchList();
  return () => { alive = false; container.remove(); };
}
