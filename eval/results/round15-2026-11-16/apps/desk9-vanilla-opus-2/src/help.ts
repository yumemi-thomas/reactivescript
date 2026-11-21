import * as api from "./api.js";
import type { Hit, Item } from "./api.js";
import { errMsg, h, Page } from "./dom.js";
import type { HelpInit } from "./issues.js";

type Results =
  | { kind: "none" }
  | { kind: "short"; q: string }
  | { kind: "searching" }
  | { kind: "ok" }
  | { kind: "error"; msg: string };

type ItemState =
  | { kind: "none" }
  | { kind: "loading" }
  | { kind: "ok"; item: Item }
  | { kind: "missing" }
  | { kind: "error"; msg: string };

export function helpPage(init?: HelpInit): Page {
  let alive = true;
  let results: Results = { kind: "none" };
  /** The results on screen, kept while a newer search runs. */
  let shown: { q: string; hits: Hit[] } | null = null;
  let searchToken = 0;
  let selectedId: number | null = null;
  let item: ItemState = { kind: "none" };
  let itemToken = 0;

  const query = h("input", { testid: "query", type: "search", "aria-label": "Search help", placeholder: "search help" });
  const resultsEl = h("div", { testid: "results", class: "results", "aria-live": "polite" });
  const itemEl = h("section", { testid: "item", class: "item" });
  const el = h("div", { class: "help" }, query, h("div", { class: "split" }, resultsEl, itemEl));

  query.addEventListener("input", () => onQuery(query.value));

  function onQuery(raw: string): void {
    const q = raw.trim();
    const token = ++searchToken;
    if (q.length === 0) { results = { kind: "none" }; shown = null; render(); return; }
    if (q.length === 1) { results = { kind: "short", q }; shown = null; render(); return; }
    results = { kind: "searching" };
    render();
    api.search(q).then(
      hits => {
        if (!alive || token !== searchToken) return;
        shown = { q, hits: Array.isArray(hits) ? hits : [] };
        results = { kind: "ok" };
        render();
      },
      e => {
        if (!alive || token !== searchToken) return;
        shown = null;
        results = { kind: "error", msg: errMsg(e) };
        render();
      },
    );
  }

  function selectHit(id: number): void {
    selectedId = id;
    loadItem(id);
  }

  function loadItem(id: number): void {
    const token = ++itemToken;
    item = { kind: "loading" };
    render();
    api.fetchItem(id).then(
      it => {
        if (!alive || token !== itemToken) return;
        item = it == null ? { kind: "missing" } : { kind: "ok", item: it };
        render();
      },
      e => {
        if (!alive || token !== itemToken) return;
        item = { kind: "error", msg: errMsg(e) };
        render();
      },
    );
  }

  function render(): void {
    resultsEl.replaceChildren();
    if (results.kind === "short") resultsEl.append(h("p", { class: "status" }, `too short: ${results.q}`));
    else if (results.kind === "error") resultsEl.append(h("p", { class: "status error" }, `search failed: ${results.msg}`));
    else if (results.kind === "searching") resultsEl.append(h("p", { class: "status" }, "searching…"));
    if ((results.kind === "ok" || results.kind === "searching") && shown) {
      resultsEl.append(h("p", { class: "count" }, `${shown.hits.length} results for ${shown.q}`));
      const ul = h("ul", { class: "hits" });
      for (const hit of shown.hits) {
        const on = hit.id === selectedId;
        const li = h("li", { testid: "hit", role: "button", tabindex: "0", "aria-selected": String(on), class: on ? "selected" : undefined },
          `${on ? "> " : ""}${hit.name}`);
        li.addEventListener("click", () => selectHit(hit.id));
        li.addEventListener("keydown", ev => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); selectHit(hit.id); } });
        ul.append(li);
      }
      resultsEl.append(ul);
    }

    itemEl.replaceChildren();
    switch (item.kind) {
      case "none": itemEl.append(h("p", { class: "status" }, "pick a result")); break;
      case "loading": itemEl.append(h("p", { class: "status" }, "loading…")); break;
      case "missing": itemEl.append(h("p", { class: "status error" }, `item ${selectedId} not found`)); break;
      case "ok": itemEl.append(h("h2", {}, item.item.name), h("p", {}, item.item.blurb)); break;
      case "error": {
        const id = selectedId;
        const retry = h("button", { testid: "retry-item", type: "button" }, "retry");
        retry.addEventListener("click", () => { if (id !== null) loadItem(id); });
        itemEl.append(h("p", { class: "status error" }, `failed: ${item.msg}`), retry);
        break;
      }
    }
  }

  if (init) {
    query.value = init.query;
    searchToken++;
    shown = { q: init.query.trim(), hits: init.hits };
    results = { kind: "ok" };
    selectHit(init.selectedId);
  }
  render();

  return { el, dispose() { alive = false; } };
}
