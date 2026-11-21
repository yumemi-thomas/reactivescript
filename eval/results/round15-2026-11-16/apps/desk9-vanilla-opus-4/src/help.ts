import { search, fetchItem, type Hit, type Item } from "./api.js";
import { h, fill, button, input, message } from "./dom";

/** How the help page starts when opened from a related hit. */
export interface HelpStart {
  query: string;
  hits: Hit[];
  selectId: number;
}

type Shown = { q: string; hits: Hit[] } | { q: string; error: string } | null;
type ItemState =
  | { kind: "loading" }
  | { kind: "item"; item: Item }
  | { kind: "missing" }
  | { kind: "error"; message: string };

const chars = (s: string) => Array.from(s).length;

export function mountHelp(root: HTMLElement, start?: HelpStart): () => void {
  let alive = true;

  let shown: Shown = null;
  let searching = false;
  let searchToken = 0;

  let selectedId: number | null = null;
  let itemState: ItemState | null = null;
  let itemToken = 0;

  const query = input("query", "Search help", "", { type: "search", placeholder: "Search help" });
  const results = h("div", { testid: "results", "aria-live": "polite" });
  const itemPane = h("div", { testid: "item", "aria-live": "polite" });
  root.append(h("h2", {}, "Help"), query, results, itemPane);

  function renderResults(): void {
    const q = query.value;
    if (q === "") { fill(results); return; }
    if (chars(q) < 2) { fill(results, h("p", {}, `too short: ${q}`)); return; }
    const parts: Node[] = [];
    if (searching) parts.push(h("p", { role: "status" }, "searching…"));
    if (shown && "error" in shown) {
      if (!searching) parts.push(h("p", { role: "alert" }, `search failed: ${shown.error}`));
    } else if (shown) {
      parts.push(h("p", {}, `${shown.hits.length} results for ${shown.q}`));
      const ul = h("ul", {});
      for (const hit of shown.hits) {
        const sel = hit.id === selectedId;
        const li = h("li", { testid: "hit", tabindex: "0", role: "button", "aria-current": sel ? "true" : undefined },
          sel ? `> ${hit.name}` : hit.name);
        li.addEventListener("click", () => select(hit.id));
        li.addEventListener("keydown", e => {
          if (e.key === "Enter" || e.key === " ") { e.preventDefault(); select(hit.id); }
        });
        ul.appendChild(li);
      }
      parts.push(ul);
    }
    fill(results, parts);
  }

  function renderItem(): void {
    if (selectedId === null || itemState === null) { fill(itemPane, h("p", {}, "pick a result")); return; }
    const id = selectedId;
    switch (itemState.kind) {
      case "loading": fill(itemPane, h("p", { role: "status" }, "loading…")); break;
      case "item": fill(itemPane, h("h3", {}, itemState.item.name), h("p", {}, itemState.item.blurb)); break;
      case "missing": fill(itemPane, h("p", {}, `item ${id} not found`)); break;
      case "error":
        fill(itemPane,
          h("p", { role: "alert" }, `failed: ${itemState.message}`),
          button("retry-item", "retry", () => loadItem(id)));
        break;
    }
  }

  function runSearch(): void {
    const q = query.value;
    const token = ++searchToken;
    if (chars(q) < 2) {
      // nothing is asked; whatever was in flight no longer matters
      searching = false;
      shown = null;
      renderResults();
      return;
    }
    searching = true;
    renderResults();
    search(q).then(
      hits => {
        if (!alive || token !== searchToken) return;
        searching = false;
        shown = { q, hits };
        renderResults();
      },
      err => {
        if (!alive || token !== searchToken) return;
        searching = false;
        shown = { q, error: message(err) };
        renderResults();
      },
    );
  }

  function loadItem(id: number): void {
    const token = ++itemToken;
    itemState = { kind: "loading" };
    renderItem();
    fetchItem(id).then(
      item => {
        if (!alive || token !== itemToken) return;
        itemState = item ? { kind: "item", item } : { kind: "missing" };
        renderItem();
      },
      err => {
        if (!alive || token !== itemToken) return;
        itemState = { kind: "error", message: message(err) };
        renderItem();
      },
    );
  }

  function select(id: number): void {
    selectedId = id;
    renderResults();
    loadItem(id);
  }

  query.addEventListener("input", runSearch);

  if (start) {
    query.value = start.query;
    shown = { q: start.query, hits: start.hits };
    selectedId = start.selectId;
    renderResults();
    loadItem(start.selectId);
  } else {
    renderResults();
    renderItem();
  }

  return () => { alive = false; };
}
