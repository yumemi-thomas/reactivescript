import { fetchItem, search } from "./api.js";
import type { Hit, Item } from "./api.js";
import { el, errorMessage } from "./dom.js";
import type { HelpRequest, PageHandle } from "./shell.js";

type ItemState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ok"; value: Item }
  | { status: "missing"; id: number }
  | { status: "error"; id: number; message: string };

/**
 * The help page: a search box, its hits, and the help item for the picked hit.
 * A request from elsewhere (a related hit) opens it with that query and hit.
 */
export function mountHelpPage(root: HTMLElement, request?: HelpRequest): PageHandle {
  let alive = true;
  let searchSeq = 0;
  let itemSeq = 0;
  let status = "";
  let hits: Hit[] = [];
  let picked: number | null = null;
  let item: ItemState = { status: "idle" };

  const queryInput = el("input", {
    type: "search",
    "data-testid": "query",
    placeholder: "Search the help",
    "aria-label": "Search the help",
    autocomplete: "off",
  });
  const statusEl = el("p", { class: "status" });
  const hitsEl = el("ul", { class: "hits" });
  const results = el("div", { "data-testid": "results", class: "results" }, statusEl, hitsEl);
  const itemEl = el("div", { "data-testid": "item", class: "item" });

  function renderResults(): void {
    statusEl.textContent = status;
    hitsEl.replaceChildren(
      ...hits.map(hit => {
        const label = `${hit.id === picked ? "> " : ""}${hit.name}`;
        const li = el("li", { "data-testid": "hit" }, el("button", { type: "button" }, label));
        li.addEventListener("click", () => pick(hit.id));
        return li;
      })
    );
  }

  function runSearch(query: string): void {
    const seq = ++searchSeq;
    if (query.length === 0) {
      status = "";
      hits = [];
      renderResults();
      return;
    }
    if (query.length === 1) {
      status = `too short: ${query}`;
      hits = [];
      renderResults();
      return;
    }
    status = "searching…";
    renderResults();
    search(query).then(
      found => {
        if (!alive || seq !== searchSeq) return;
        status = `${found.length} results for ${query}`;
        hits = found;
        renderResults();
      },
      e => {
        if (!alive || seq !== searchSeq) return;
        status = `search failed: ${errorMessage(e)}`;
        hits = [];
        renderResults();
      }
    );
  }

  function pick(id: number): void {
    picked = id;
    renderResults();
    loadItem(id);
  }

  function loadItem(id: number): void {
    const seq = ++itemSeq;
    item = { status: "loading" };
    renderItem();
    fetchItem(id).then(
      found => {
        if (!alive || seq !== itemSeq) return;
        item = found ? { status: "ok", value: found } : { status: "missing", id };
        renderItem();
      },
      e => {
        if (!alive || seq !== itemSeq) return;
        item = { status: "error", id, message: errorMessage(e) };
        renderItem();
      }
    );
  }

  function renderItem(): void {
    switch (item.status) {
      case "idle":
        itemEl.replaceChildren(el("p", {}, "pick a result"));
        return;
      case "loading":
        itemEl.replaceChildren(el("p", {}, "loading…"));
        return;
      case "ok":
        itemEl.replaceChildren(el("h3", {}, item.value.name), el("p", {}, item.value.blurb));
        return;
      case "missing":
        itemEl.replaceChildren(el("p", {}, `item ${item.id} not found`));
        return;
      case "error": {
        const id = item.id;
        const retry = el("button", { type: "button", "data-testid": "retry-item" }, "retry");
        retry.addEventListener("click", () => loadItem(id));
        itemEl.replaceChildren(el("p", { class: "error" }, `failed: ${item.message}`), retry);
        return;
      }
    }
  }

  queryInput.addEventListener("input", () => runSearch(queryInput.value));

  root.replaceChildren(
    el(
      "section",
      { class: "page help-page" },
      el("label", { class: "field" }, "Search", queryInput),
      results,
      itemEl
    )
  );
  renderResults();
  renderItem();

  if (request) {
    queryInput.value = request.query;
    runSearch(request.query);
    pick(request.hitId);
  }

  return {
    destroy(): void {
      alive = false;
    },
  };
}
